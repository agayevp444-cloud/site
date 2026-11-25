"""AgentRuntime: executes a task for one employee as a real Claude tool-use loop.

Every API call is recorded (UsageRecord), every tool call is logged, and the
employee's visible status is driven by what the loop is doing at that moment.
"""
from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from ..config import settings
from ..db import ActivityLog, Employee, Message, Task, UsageRecord, session, utcnow
from ..events import hub
from ..pricing import cost_usd
from ..tools import collaboration, production  # noqa: F401  (registers tools)
from ..tools.collaboration import find_employee
from ..tools.registry import REGISTRY, ToolContext, as_text, definitions_for, validate_input
from . import prompts
from .llm import LLMError, TurnResult, llm
from .presence import presence

if TYPE_CHECKING:
    from .orchestrator import Orchestrator


class TaskStopped(Exception):
    pass


class AgentRuntime:
    def __init__(self) -> None:
        self.orchestrator: "Orchestrator" = None  # set by Orchestrator
        self._resume: dict[int, asyncio.Event] = {}
        self._last_status: dict[int, str] = {}

    # ---------------------------------------------------------------- broadcasting helpers
    async def emit_employee(self, employee_id: int, force: bool = False) -> None:
        snap = presence.snapshot(employee_id)
        key = f"{snap.get('status')}|{snap.get('task_id')}|{snap.get('detail')}|{snap.get('progress')}"
        if not force and self._last_status.get(employee_id) == key:
            return
        self._last_status[employee_id] = key
        await hub.emit("employee.status", {"employee_id": employee_id, **snap})

    async def emit_all_employees(self) -> None:
        with session() as s:
            ids = s.scalars(select(Employee.id)).all()
        for i in ids:
            await self.emit_employee(i)

    async def emit_task(self, task_id: int) -> None:
        with session() as s:
            t = s.get(Task, task_id)
            if t is not None:
                await hub.emit("task.updated", t.to_dict())

    async def log(self, kind: str, text: str, employee_id: int | None = None, project_id: int | None = None,
                  task_id: int | None = None) -> None:
        with session() as s:
            row = ActivityLog(kind=kind, text=text, employee_id=employee_id, project_id=project_id, task_id=task_id)
            s.add(row)
            s.commit()
            await hub.emit("log.created", row.to_dict())

    async def post_message(self, project_id: int | None, task_id: int | None, from_id: int | None,
                           to_id: int | None, kind: str, content: str, read: bool = False) -> None:
        with session() as s:
            m = Message(project_id=project_id, task_id=task_id, from_id=from_id, to_id=to_id, kind=kind,
                        content=content, read=read)
            s.add(m)
            s.commit()
            await hub.emit("message.created", m.to_dict())

    async def record_usage(self, result: TurnResult, employee_id: int | None, project_id: int | None,
                           task_id: int | None, purpose: str) -> float:
        u = result.usage
        cost = cost_usd(result.model, u["input_tokens"], u["output_tokens"], u["cache_write_tokens"],
                        u["cache_read_tokens"], u["web_searches"])
        with session() as s:
            rec = UsageRecord(employee_id=employee_id, project_id=project_id, task_id=task_id, purpose=purpose,
                              model=result.model, request_id=result.request_id, stop_reason=result.stop_reason,
                              cost_usd=cost, **u)
            s.add(rec)
            if task_id is not None:
                t = s.get(Task, task_id)
                if t is not None:
                    t.input_tokens += u["input_tokens"] + u["cache_read_tokens"] + u["cache_write_tokens"]
                    t.output_tokens += u["output_tokens"]
                    t.cost_usd += cost
            s.commit()
            await hub.emit("usage.created", rec.to_dict())
        return cost

    # ---------------------------------------------------------------- pause / resume
    def resume_event(self, employee_id: int) -> asyncio.Event:
        ev = self._resume.get(employee_id)
        if ev is None:
            ev = asyncio.Event()
            ev.set()
            self._resume[employee_id] = ev
        return ev

    def set_paused(self, employee_id: int, paused: bool) -> None:
        ev = self.resume_event(employee_id)
        ev.clear() if paused else ev.set()

    async def checkpoint(self, employee_id: int, task_id: int | None) -> None:
        """Called between agent steps: honours owner pause, and surfaces it in the UI."""
        ev = self.resume_event(employee_id)
        if not ev.is_set():
            presence.clear_live(employee_id)
            await self.emit_employee(employee_id)
            await self.log("status", "Paused by owner - holding before next step", employee_id, task_id=task_id)
            await ev.wait()
            await self.log("status", "Resumed", employee_id, task_id=task_id)

    # ---------------------------------------------------------------- live state helpers
    async def _set_state(self, emp_id: int, state: str, task: Task, detail: str = "", **kw: Any) -> None:
        presence.set_live(emp_id, state, task_id=task.id, project_id=task.project_id, detail=detail, **kw)
        await self.emit_employee(emp_id)

    # ---------------------------------------------------------------- main loop
    async def run_task(self, task_id: int) -> None:
        with session() as s:
            task = s.get(Task, task_id)
            emp = s.get(Employee, task.assignee_id)
            emp.last_error = None
            task.status, task.started_at, task.error, task.progress = "running", utcnow(), None, 0.02
            s.commit()
            system = prompts.system_prompt(emp)
            tool_names = list(emp.tools or [])
        if task.kind != "review":
            tool_names = [n for n in tool_names if n not in ("approve_task", "request_revision")]
        tools = definitions_for(tool_names)
        work_state = "REVIEWING" if task.kind in ("review", "delivery") else "WORKING"
        await self.emit_task(task_id)
        await self.log("status", f"Started task: {task.title}", emp.id, task.project_id, task_id)

        ctx = ToolContext(employee_id=emp.id, project_id=task.project_id, task_id=task_id, runtime=self)
        messages: list[dict[str, Any]] = [{"role": "user", "content": prompts.task_brief(task_id, emp.id)}]
        final_text = ""
        try:
            for step in range(1, settings.max_steps + 1):
                await self.checkpoint(emp.id, task_id)
                await self._set_state(emp.id, "THINKING", task, f"Step {step}: {task.title}")
                result = await self._stream_turn(emp.id, task, system, messages, tools, work_state)
                await self.record_usage(result, emp.id, task.project_id, task_id, "task")
                final_text = result.text or final_text

                if result.stop_reason == "refusal":
                    raise LLMError(f"Model declined the request (category: {result.refusal_category or 'unknown'})")
                messages.append({"role": "assistant", "content": result.content})
                if result.stop_reason == "pause_turn":
                    continue
                if result.stop_reason == "max_tokens" and result.tool_uses:
                    messages.append({"role": "user", "content": [
                        {"type": "tool_result", "tool_use_id": tu.id, "is_error": True,
                         "content": "Output was cut off by max_tokens before the tool input finished. "
                                    "Retry with a shorter input or split the work."} for tu in result.tool_uses]})
                    continue
                if not result.tool_uses:
                    break

                await self._set_state(emp.id, work_state, task, f"Using tools: {', '.join(t.name for t in result.tool_uses)}")
                tool_results = await asyncio.gather(*(self._run_tool(ctx, tu) for tu in result.tool_uses))
                messages.append({"role": "user", "content": list(tool_results)})
                with session() as s:
                    t = s.get(Task, task_id)
                    t.progress = min(0.92, 0.1 + step / (settings.max_steps * 0.6))
                    s.commit()
                await self.emit_task(task_id)
                if "deliverable" in ctx.state:
                    # Let the model close its turn; no further tool calls are needed.
                    break
            else:
                await self.log("system", f"Reached step limit ({settings.max_steps}); using latest output.",
                               emp.id, task.project_id, task_id)

            deliverable = ctx.state.get("deliverable") or final_text.strip()
            if not deliverable:
                raise LLMError("Agent finished without producing a deliverable.")
            with session() as s:
                t = s.get(Task, task_id)
                t.deliverable = deliverable
                t.summary = ctx.state.get("summary") or deliverable[:200]
                arts = list(ctx.state.get("artifacts", []))
                for f in ctx.state.get("files", []):
                    if not any(a.get("file") == f for a in arts):
                        arts.append({"kind": "file", "title": f, "data": {"path": f}, "by": emp.id, "file": f})
                t.artifacts = arts
                t.status, t.completed_at, t.progress = "completed", utcnow(), 1.0
                t.feedback = None
                s.commit()
            await self.log("status", f"Completed: {task.title}", emp.id, task.project_id, task_id)
            presence.clear_live(emp.id)
            await self.emit_task(task_id)
            await self.emit_employee(emp.id)
            await self.orchestrator.on_task_completed(task_id, ctx)
        except asyncio.CancelledError:
            presence.clear_live(emp.id)
            with session() as s:
                t = s.get(Task, task_id)
                if t.status == "running":
                    t.status = "cancelled"
                    s.commit()
            await self.log("owner", f"Task stopped: {task.title}", emp.id, task.project_id, task_id)
            await self.emit_task(task_id)
            await self.emit_employee(emp.id)
            raise
        except Exception as e:  # real failures surface as ERROR
            msg = str(e) or e.__class__.__name__
            presence.clear_live(emp.id)
            with session() as s:
                t = s.get(Task, task_id)
                t.status, t.error = "failed", msg
                e_ = s.get(Employee, emp.id)
                e_.last_error = msg
                s.commit()
            await self.log("error", f"Task failed: {msg}", emp.id, task.project_id, task_id)
            await self.emit_task(task_id)
            await self.emit_employee(emp.id)
            await self.orchestrator.on_task_failed(task_id)

    async def _stream_turn(self, emp_id: int, task: Task, system: str, messages: list[dict[str, Any]],
                           tools: list[dict[str, Any]], work_state: str) -> TurnResult:
        buf: list[str] = []
        thinking: list[str] = []
        last_flush = 0.0

        async def flush(force: bool = False) -> None:
            nonlocal last_flush
            now = time.monotonic()
            if buf and (force or now - last_flush > 0.35):
                last_flush = now
                await hub.emit("agent.stream", {"employee_id": emp_id, "task_id": task.id, "text": "".join(buf)})
                buf.clear()

        async def on_event(kind: str, payload: Any) -> None:
            if kind == "block_start":
                if payload == "thinking":
                    await self._set_state(emp_id, "THINKING", task, f"Thinking: {task.title}")
                elif payload in ("text", "tool_use", "server_tool_use"):
                    await self._set_state(emp_id, work_state, task, task.title)
            elif kind == "thinking":
                thinking.append(payload)
            elif kind == "text":
                buf.append(payload)
                await flush()
            elif kind == "tool_start":
                await self.log("tool", f"Preparing tool call: {payload}", emp_id, task.project_id, task.id)
            elif kind == "server_tool":
                await self.log("tool", f"Server tool: {payload}", emp_id, task.project_id, task.id)

        result = await llm.run_turn(system=system, messages=messages, tools=tools, effort=self._effort(task),
                                    on_event=on_event)
        await flush(force=True)
        if thinking:
            summary = "".join(thinking).strip()
            if summary:
                await self.log("thinking", summary[:1200], emp_id, task.project_id, task.id)
        return result

    def _effort(self, task: Task) -> str:
        return settings.director_effort if task.kind == "delivery" else settings.effort

    async def _run_tool(self, ctx: ToolContext, tu: Any) -> dict[str, Any]:
        spec = REGISTRY.get(tu.name)
        if spec is None or spec.handler is None:
            return {"type": "tool_result", "tool_use_id": tu.id, "is_error": True, "content": f"Unknown tool {tu.name}"}
        err = tu.parse_error or validate_input(spec, tu.input)
        if err:
            await self.log("tool", f"{tu.name}: invalid input ({err})", ctx.employee_id, ctx.project_id, ctx.task_id)
            return {"type": "tool_result", "tool_use_id": tu.id, "is_error": True, "content": err}
        await self.log("tool", f"{tu.name}({_preview(tu.input)})", ctx.employee_id, ctx.project_id, ctx.task_id)
        try:
            out = await spec.handler(ctx, tu.input)
            return {"type": "tool_result", "tool_use_id": tu.id, "content": as_text(out)}
        except Exception as e:
            await self.log("error", f"{tu.name} failed: {e}", ctx.employee_id, ctx.project_id, ctx.task_id)
            return {"type": "tool_result", "tool_use_id": tu.id, "is_error": True, "content": f"Tool error: {e}"}

    # ---------------------------------------------------------------- agent-to-agent meeting
    async def consult(self, ctx: ToolContext, colleague_ref: str, question: str) -> str:
        with session() as s:
            col = find_employee(s, colleague_ref)
            asker = s.get(Employee, ctx.employee_id)
            if col is None:
                return f"No colleague matches '{colleague_ref}'."
            if col.id == asker.id:
                return "You cannot consult yourself."
            busy = s.scalars(select(Task).where(Task.assignee_id == col.id, Task.status == "running")).first()
            if busy is not None or presence.live(col.id) is not None or col.paused:
                return f"{col.name} is busy right now. Use send_message instead."
            task = s.get(Task, ctx.task_id)
            col_system = prompts.system_prompt(col)
            col_id, col_name, asker_name = col.id, col.name, asker.name
            proj_brief = prompts.task_brief(ctx.task_id, col.id).split("# Your task")[0]
        await self.post_message(ctx.project_id, ctx.task_id, ctx.employee_id, col_id, "question", question, read=True)
        presence.set_live(ctx.employee_id, "IN_MEETING", task_id=ctx.task_id, project_id=ctx.project_id,
                          detail=f"Meeting with {col_name}", with_employee_id=col_id)
        presence.set_live(col_id, "IN_MEETING", task_id=ctx.task_id, project_id=ctx.project_id,
                          detail=f"Meeting with {asker_name}", with_employee_id=ctx.employee_id)
        await self.emit_employee(ctx.employee_id)
        await self.emit_employee(col_id)
        try:
            result = await llm.run_turn(
                system=col_system + "\n\nA colleague has pulled you into a short meeting. Answer their question "
                                    "directly and concisely from your expertise. No tools are available.",
                messages=[{"role": "user", "content": f"{proj_brief}\n\n# Question from {asker_name}\n{question}"}],
                tools=[], effort="low")
            await self.record_usage(result, col_id, ctx.project_id, ctx.task_id, "consult")
            answer = result.text.strip() or "(no answer)"
        except LLMError as e:
            answer = f"Meeting failed: {e}"
        finally:
            presence.clear_live(col_id)
            presence.set_live(ctx.employee_id, "WORKING", task_id=ctx.task_id, project_id=ctx.project_id,
                              detail=task.title)
            await self.emit_employee(col_id)
            await self.emit_employee(ctx.employee_id)
        await self.post_message(ctx.project_id, ctx.task_id, col_id, ctx.employee_id, "answer", answer, read=True)
        return f"{col_name} says:\n{answer}"


def _preview(data: Any, n: int = 140) -> str:
    s = str(data)
    return s if len(s) <= n else s[: n - 1] + "…"


runtime = AgentRuntime()
