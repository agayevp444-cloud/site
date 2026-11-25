"""Orchestrator: the Executive Director's workflow engine plus the persistent task queue.

- Planning: the Director agent (a real Claude call with structured output) turns a brief into tasks.
- Queue: tasks live in the database; the scheduler promotes pending -> queued when dependencies complete
  and starts queued tasks when the assignee is free and a concurrency slot is open.
- QC loop: the QC agent approves or sends work back; revised work gets a fresh QC review.
- Delivery: the Director compiles the final package, which waits for the owner's approval.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from sqlalchemy import select

from ..config import settings
from ..db import Employee, Project, Task, session, utcnow
from ..events import hub
from ..tools.registry import ToolContext
from . import prompts
from .llm import LLMError, llm
from .presence import presence
from .runtime import AgentRuntime

log = logging.getLogger("office.orchestrator")

PLAN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["project_title", "summary", "tasks"],
    "properties": {
        "project_title": {"type": "string"},
        "summary": {"type": "string"},
        "tasks": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["ref", "title", "description", "assignee", "priority", "depends_on"],
                "properties": {
                    "ref": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "assignee": {"type": "string"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                    "depends_on": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
    },
}

PLANNER_INSTRUCTIONS = """You are in the project kickoff meeting. Break the owner's brief into a production workflow.
Rules:
- Assign each task to exactly one employee by their role key from the directory (never to yourself or to QC;
  QC review and final delivery are added automatically after your tasks).
- Use only the specialists the brief actually needs - not everyone has to be involved.
- 'ref' is a short unique id like "t1"; depends_on lists refs of tasks whose output is required first.
  Dependencies must form a DAG. Independent work should run in parallel.
- Descriptions must be specific: what to produce, format, length, constraints from the brief.
- project_title: a short title for the project. summary: the workflow rationale in 2-4 sentences.
Respond in the same language as the brief."""


class Orchestrator:
    def __init__(self, runtime: AgentRuntime) -> None:
        self.runtime = runtime
        runtime.orchestrator = self
        self._kick = asyncio.Event()
        self._running: dict[int, asyncio.Task] = {}
        self._planning: dict[int, asyncio.Task] = {}
        self._loop_task: asyncio.Task | None = None

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        with session() as s:
            # Anything that was mid-flight when the server stopped is re-queued (execution restarts cleanly).
            for t in s.scalars(select(Task).where(Task.status == "running")):
                t.status, t.progress = "queued", 0.0
            for e in s.scalars(select(Employee)):
                self.runtime.set_paused(e.id, e.paused)
            planning = s.scalars(select(Project).where(Project.status == "planning")).all()
            s.commit()
        for p in planning:
            self._planning[p.id] = asyncio.create_task(self._plan(p.id))
        self._loop_task = asyncio.create_task(self._scheduler())
        self.kick()

    async def stop(self) -> None:
        for t in list(self._running.values()) + list(self._planning.values()):
            t.cancel()
        if self._loop_task:
            self._loop_task.cancel()

    def kick(self) -> None:
        self._kick.set()

    async def _scheduler(self) -> None:
        while True:
            await self._kick.wait()
            self._kick.clear()
            try:
                await self._schedule_once()
            except Exception:
                log.exception("scheduler pass failed")

    async def _schedule_once(self) -> None:
        changed: set[int] = set()
        to_start: list[int] = []
        with session() as s:
            active = {p.id for p in s.scalars(select(Project).where(Project.status.in_(["running", "direct"])))}
            tasks = s.scalars(select(Task).where(Task.project_id.in_(active)).order_by(Task.id)).all() if active else []
            status = {t.id: t.status for t in tasks}
            for t in tasks:
                if t.status == "pending" and all(status.get(d) == "completed" for d in (t.depends_on or [])):
                    t.status = "queued"
                    changed.add(t.id)
            s.commit()
            running_count = sum(1 for t in self._running.values() if not t.done())
            busy = {t.assignee_id for t in tasks if t.status == "running"}
            order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            queued = sorted((t for t in tasks if t.status == "queued"), key=lambda t: (order.get(t.priority, 2), t.id))
            emps = {e.id: e for e in s.scalars(select(Employee))}
            for t in queued:
                if running_count >= settings.max_concurrent:
                    break
                e = emps.get(t.assignee_id)
                if e is None or e.paused or not e.active or t.assignee_id in busy or presence.live(e.id):
                    continue
                busy.add(t.assignee_id)
                running_count += 1
                to_start.append(t.id)
        for tid in changed:
            await self.runtime.emit_task(tid)
        for tid in to_start:
            self._running[tid] = asyncio.create_task(self._run(tid))
        await self.runtime.emit_all_employees()

    async def _run(self, task_id: int) -> None:
        try:
            await self.runtime.run_task(task_id)
        except asyncio.CancelledError:
            pass
        finally:
            self._running.pop(task_id, None)
            self.kick()

    # ------------------------------------------------------------------ projects
    async def create_project(self, description: str, title: str | None = None) -> Project:
        with session() as s:
            p = Project(title=title or description[:80], description=description, status="planning")
            s.add(p)
            s.commit()
        await hub.emit("project.updated", p.to_dict())
        await self.runtime.log("owner", f"New project from owner: {p.title}", project_id=p.id)
        self._planning[p.id] = asyncio.create_task(self._plan(p.id))
        return p

    def director(self) -> Employee:
        with session() as s:
            return s.scalars(select(Employee).where(Employee.is_director.is_(True))).first()

    def qc(self) -> Employee | None:
        with session() as s:
            return s.scalars(select(Employee).where(Employee.is_qc.is_(True), Employee.active.is_(True))).first()

    async def _plan(self, project_id: int) -> None:
        d = self.director()
        with session() as s:
            p = s.get(Project, project_id)
            brief = p.description
        presence.set_live(d.id, "IN_MEETING", project_id=project_id, detail="Project kickoff: planning workflow")
        await self.runtime.emit_employee(d.id)
        await self.runtime.log("status", "Kickoff meeting: analysing brief and planning workflow", d.id, project_id)
        try:
            await self.runtime.checkpoint(d.id, None)
            presence.set_live(d.id, "IN_MEETING", project_id=project_id, detail="Project kickoff: planning workflow")
            await self.runtime.emit_employee(d.id)
            result = await llm.run_turn(
                system=prompts.system_prompt(d) + "\n\n" + PLANNER_INSTRUCTIONS,
                messages=[{"role": "user", "content": f"# Owner's brief\n{brief}"}],
                tools=[], effort=settings.director_effort, json_schema=PLAN_SCHEMA)
            await self.runtime.record_usage(result, d.id, project_id, None, "planning")
            if result.stop_reason == "refusal":
                raise LLMError(f"Model declined to plan this project ({result.refusal_category or 'unknown'})")
            plan = json.loads(result.text)
            await self._materialise_plan(project_id, plan, d)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            msg = f"Planning failed: {e}"
            with session() as s:
                p = s.get(Project, project_id)
                p.status, p.error = "failed", msg
                emp = s.get(Employee, d.id)
                emp.last_error = msg
                s.commit()
                await hub.emit("project.updated", p.to_dict())
            await self.runtime.log("error", msg, d.id, project_id)
        finally:
            presence.clear_live(d.id)
            self._planning.pop(project_id, None)
            await self.runtime.emit_employee(d.id)
            self.kick()

    async def _materialise_plan(self, project_id: int, plan: dict[str, Any], director: Employee) -> None:
        with session() as s:
            emps = {e.key: e for e in s.scalars(select(Employee).where(Employee.active.is_(True)))}
            by_ref: dict[str, Task] = {}
            specs = plan.get("tasks", [])
            for spec in specs:
                assignee = emps.get(spec["assignee"]) or next(
                    (e for e in emps.values() if spec["assignee"].lower() in (e.title.lower(), e.name.lower())), None)
                if assignee is None or assignee.is_director or assignee.is_qc:
                    continue
                t = Task(project_id=project_id, title=spec["title"], description=spec["description"],
                         assignee_id=assignee.id, priority=spec.get("priority", "medium"), kind="work")
                s.add(t)
                by_ref[spec["ref"]] = t
            s.flush()
            for spec in specs:
                t = by_ref.get(spec["ref"])
                if t is not None:
                    t.depends_on = [by_ref[r].id for r in spec.get("depends_on", []) if r in by_ref and by_ref[r] is not t]
            if not by_ref:
                raise LLMError("The plan contained no assignable tasks.")
            _break_cycles(list(by_ref.values()))
            work_ids = [t.id for t in by_ref.values()]
            qc = self.qc()
            review_deps = work_ids
            if qc is not None:
                review = Task(project_id=project_id, title="Quality control review of all deliverables",
                              description="Review every deliverable for completeness, accuracy, consistency and "
                                          "brief compliance. Approve or request revisions per task.",
                              assignee_id=qc.id, kind="review", priority="high", depends_on=work_ids)
                s.add(review)
                s.flush()
                review_deps = [review.id]
            delivery = Task(project_id=project_id, title="Compile and deliver final project package",
                            description="Read all approved deliverables and the QC report. Write an executive "
                                        "summary, the organised final package, open risks, and a short performance "
                                        "review of each contributor.",
                            assignee_id=director.id, kind="delivery", priority="high", depends_on=review_deps)
            s.add(delivery)
            p = s.get(Project, project_id)
            p.title = plan.get("project_title") or p.title
            p.plan_summary = plan.get("summary")
            p.status = "running"
            s.commit()
            created = s.scalars(select(Task).where(Task.project_id == project_id)).all()
            payload = [t.to_dict() for t in created]
            assignments = [(t.id, t.assignee_id, t.title) for t in created if t.assignee_id != director.id]
            await hub.emit("project.updated", p.to_dict())
        for tdict in payload:
            await hub.emit("task.updated", tdict)
        for tid, aid, title in assignments:
            await self.runtime.post_message(project_id, tid, director.id, aid, "assignment",
                                            f"New assignment: {title}", read=True)
        await self.runtime.log("status", f"Workflow created with {len(payload)} tasks", director.id, project_id)

    # ------------------------------------------------------------------ completion hooks
    async def on_task_completed(self, task_id: int, ctx: ToolContext) -> None:
        with session() as s:
            t = s.get(Task, task_id)
            p = s.get(Project, t.project_id)
            if t.kind in ("work", "direct"):
                t.approval = "pending"
            dependents = s.scalars(select(Task).where(Task.project_id == t.project_id)).all()
            handoffs = {(d.assignee_id, d.id) for d in dependents
                        if task_id in (d.depends_on or []) and d.assignee_id and d.assignee_id != t.assignee_id
                        and d.status in ("pending", "queued")}
            author = t.assignee_id
            summary = t.summary or t.title
            s.commit()
        for to_id, dep_id in handoffs:
            await self.runtime.post_message(t.project_id, task_id, author, to_id, "handoff",
                                            f"Delivered '{t.title}' for your task #{dep_id}: {summary}")
            await hub.emit("handoff", {"from_id": author, "to_id": to_id, "task_id": task_id})
        await self.runtime.emit_task(task_id)

        if t.kind == "review":
            await self._after_review(task_id, ctx)
        elif t.kind == "delivery":
            with session() as s:
                p = s.get(Project, t.project_id)
                p.final_deliverable = t.deliverable
                p.status = "awaiting_approval"
                s.commit()
                await hub.emit("project.updated", p.to_dict())
            await self.runtime.post_message(p.id, task_id, author, None, "approval",
                                            "Final project package is ready for your approval.")
            await hub.emit("handoff", {"from_id": author, "to_id": None, "task_id": task_id})
        elif p.status == "direct":
            await self.runtime.post_message(p.id, task_id, author, None, "handoff",
                                            f"Finished your direct assignment '{t.title}': {summary}")
        self.kick()

    async def on_task_failed(self, task_id: int) -> None:
        self.kick()

    # ------------------------------------------------------------------ QC tools
    async def qc_approve(self, ctx: ToolContext, target_id: int, note: str) -> str:
        with session() as s:
            t = s.get(Task, target_id)
            if t is None or t.project_id != ctx.project_id:
                return "No such task in this project."
            ctx.state.setdefault("qc_approved", []).append(target_id)
            author = t.assignee_id
        await self.runtime.post_message(ctx.project_id, target_id, ctx.employee_id, author, "approval",
                                        f"QC approved task #{target_id}. {note}".strip(), read=True)
        return f"Task {target_id} approved."

    async def qc_request_revision(self, ctx: ToolContext, target_id: int, feedback: str) -> str:
        with session() as s:
            t = s.get(Task, target_id)
            if t is None or t.project_id != ctx.project_id or t.kind != "work":
                return "That task cannot be revised from this review."
            if t.revision_count >= settings.max_revisions:
                return (f"Task {target_id} has already been revised {t.revision_count} times (limit). "
                        "Note the remaining issues in your report instead.")
            ctx.state.setdefault("qc_revisions", {})[target_id] = feedback
            author = t.assignee_id
        await self.runtime.post_message(ctx.project_id, target_id, ctx.employee_id, author, "revision", feedback)
        return f"Revision requested for task {target_id}. It will be reworked after your review is submitted."

    async def _after_review(self, review_id: int, ctx: ToolContext) -> None:
        revisions: dict[int, str] = ctx.state.get("qc_revisions", {})
        if not revisions:
            return
        with session() as s:
            review = s.get(Task, review_id)
            for tid, fb in revisions.items():
                t = s.get(Task, tid)
                t.status, t.feedback, t.revision_count = "queued", fb, t.revision_count + 1
                t.approval, t.progress, t.completed_at = "none", 0.0, None
            rnd = 1 + sum(1 for x in s.scalars(select(Task).where(Task.project_id == review.project_id,
                                                                  Task.kind == "review")))
            again = Task(project_id=review.project_id, title=f"QC re-review (round {rnd})",
                         description="Re-review the revised deliverables: " + ", ".join(f"#{i}" for i in revisions),
                         assignee_id=review.assignee_id, kind="review", priority="high", depends_on=list(revisions))
            s.add(again)
            s.flush()
            for d in s.scalars(select(Task).where(Task.project_id == review.project_id, Task.kind == "delivery",
                                                  Task.status.in_(["pending", "queued"]))):
                d.depends_on = [x for x in (d.depends_on or []) if x != review_id] + [again.id]
                d.status = "pending"
            s.commit()
            ids = list(revisions) + [again.id] + [d.id for d in s.scalars(
                select(Task).where(Task.project_id == review.project_id, Task.kind == "delivery"))]
        for i in ids:
            await self.runtime.emit_task(i)
        await self.runtime.log("status", f"QC sent {len(revisions)} task(s) back for revision",
                               ctx.employee_id, ctx.project_id, review_id)

    # ------------------------------------------------------------------ owner controls
    async def stop_task(self, task_id: int) -> None:
        running = self._running.get(task_id)
        if running is not None:
            running.cancel()
            try:
                await running
            except (asyncio.CancelledError, Exception):
                pass
        with session() as s:
            t = s.get(Task, task_id)
            if t.status in ("pending", "queued"):
                t.status = "cancelled"
                s.commit()
        await self.runtime.emit_task(task_id)
        self.kick()

    async def retry_task(self, task_id: int, feedback: str | None = None) -> None:
        with session() as s:
            t = s.get(Task, task_id)
            if t.status == "running":
                return
            t.status, t.error, t.progress = "pending", None, 0.0
            if feedback:
                t.feedback = feedback
                t.revision_count += 1
            t.approval = "none"
            if t.assignee_id:
                e = s.get(Employee, t.assignee_id)
                e.last_error = None
            p = s.get(Project, t.project_id)
            if p.status in ("failed", "cancelled"):
                p.status, p.error = "running", None
                await hub.emit("project.updated", p.to_dict())
            s.commit()
        await self.runtime.emit_task(task_id)
        self.kick()

    async def reassign_task(self, task_id: int, employee_id: int) -> None:
        was_running = task_id in self._running
        if was_running:
            await self.stop_task(task_id)
        with session() as s:
            t = s.get(Task, task_id)
            old = t.assignee_id
            t.assignee_id = employee_id
            if t.status in ("cancelled", "failed") or was_running:
                t.status = "pending"
            s.commit()
        await self.runtime.emit_task(task_id)
        if old:
            await self.runtime.emit_employee(old)
        self.kick()

    async def set_paused(self, employee_id: int, paused: bool) -> None:
        with session() as s:
            e = s.get(Employee, employee_id)
            e.paused = paused
            s.commit()
        self.runtime.set_paused(employee_id, paused)
        await self.runtime.log("owner", "Paused by owner" if paused else "Resumed by owner", employee_id)
        await self.runtime.emit_employee(employee_id, force=True)
        self.kick()

    async def review_task(self, task_id: int, approve: bool, feedback: str | None) -> None:
        with session() as s:
            t = s.get(Task, task_id)
            if approve:
                t.approval = "approved"
            else:
                t.approval = "rejected"
            s.commit()
            author, pid = t.assignee_id, t.project_id
        if approve:
            await self.runtime.post_message(pid, task_id, None, author, "approval", "Owner approved your deliverable.")
            await self.runtime.emit_task(task_id)
        else:
            await self.runtime.post_message(pid, task_id, None, author, "revision", feedback or "Owner rejected this deliverable.")
            await self.retry_task(task_id, feedback or "The owner rejected this deliverable. Improve it substantially.")

    async def review_project(self, project_id: int, approve: bool, feedback: str | None) -> None:
        with session() as s:
            p = s.get(Project, project_id)
            if approve:
                p.status, p.completed_at = "delivered", utcnow()
                s.commit()
                await hub.emit("project.updated", p.to_dict())
            else:
                p.status, p.owner_feedback = "running", feedback or "Owner rejected the package."
                delivery = s.scalars(select(Task).where(Task.project_id == project_id, Task.kind == "delivery")
                                     .order_by(Task.id.desc())).first()
                s.commit()
                await hub.emit("project.updated", p.to_dict())
                if delivery:
                    await self.retry_task(delivery.id, p.owner_feedback)
        await self.runtime.log("owner", f"Owner {'approved' if approve else 'rejected'} the final package",
                               project_id=project_id)
        await self.runtime.emit_all_employees()

    async def cancel_project(self, project_id: int) -> None:
        planning = self._planning.get(project_id)
        if planning:
            planning.cancel()
        with session() as s:
            ids = s.scalars(select(Task.id).where(Task.project_id == project_id,
                                                  Task.status.in_(["pending", "queued", "running"]))).all()
        for i in ids:
            await self.stop_task(i)
        with session() as s:
            p = s.get(Project, project_id)
            p.status = "cancelled"
            s.commit()
            await hub.emit("project.updated", p.to_dict())
        await self.runtime.emit_all_employees()

    async def assign_direct(self, employee_id: int, title: str, description: str, priority: str,
                            project_id: int | None) -> Task:
        with session() as s:
            if project_id is None:
                p = s.scalars(select(Project).where(Project.status == "direct")).first()
                if p is None:
                    p = Project(title="Direct assignments", description="Tasks the owner assigned directly to employees.",
                                status="direct")
                    s.add(p)
                    s.flush()
                project_id = p.id
            p = s.get(Project, project_id)
            if p.status in ("delivered", "cancelled", "failed"):
                p.status = "running"
            t = Task(project_id=project_id, title=title, description=description, assignee_id=employee_id,
                     priority=priority, kind="direct" if p.status == "direct" else "work", created_by="owner")
            s.add(t)
            s.commit()
            await hub.emit("project.updated", p.to_dict())
            await hub.emit("task.updated", t.to_dict())
        await self.runtime.post_message(project_id, t.id, None, employee_id, "assignment",
                                        f"Owner assigned: {title}\n{description}")
        self.kick()
        return t


def _break_cycles(tasks: list[Task]) -> None:
    """Drop dependency edges that would create a cycle (a defensive guard on model output)."""
    deps = {t.id: list(t.depends_on or []) for t in tasks}
    state: dict[int, int] = {}

    def visit(n: int) -> None:
        state[n] = 1
        for d in list(deps.get(n, [])):
            if state.get(d) == 1:
                deps[n].remove(d)
            elif state.get(d) is None:
                visit(d)
        state[n] = 2

    for t in tasks:
        if state.get(t.id) is None:
            visit(t.id)
    for t in tasks:
        t.depends_on = deps[t.id]
