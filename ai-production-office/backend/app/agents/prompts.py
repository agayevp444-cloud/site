"""Builds the context each agent receives for a task."""
from __future__ import annotations

from sqlalchemy import select

from ..db import Employee, MemoryNote, Message, Project, Task, session

OPERATING_RULES = """
# How you work in this office
- You are one employee in a multi-agent production company. Teammates are other AI agents; the owner is a human.
- Do the real work. Never claim to have done something (filmed, edited, researched, rendered) that a tool did not
  actually do. If a capability is missing, say so and give the best plan instead.
- Use tools when they help: read_deliverable for teammates' work, consult_colleague for a quick live question,
  send_message to leave a note, save_artifact for structured outputs (tables, palettes) the UI renders.
- Finish by calling submit_deliverable exactly once with your complete Markdown deliverable and a one-line summary.
- Write in the same language as the project brief.
""".strip()


def employee_directory() -> str:
    with session() as s:
        rows = s.scalars(select(Employee).where(Employee.active.is_(True)).order_by(Employee.desk)).all()
        return "\n".join(f"- {e.key}: {e.name}, {e.title} - {e.job_description}" for e in rows)


def system_prompt(emp: Employee) -> str:
    return f"{emp.system_prompt}\n\n# Your job description\n{emp.job_description}\n\n{OPERATING_RULES}\n\n" \
           f"# Your colleagues\n{employee_directory()}"


def task_brief(task_id: int, employee_id: int) -> str:
    with session() as s:
        t = s.get(Task, task_id)
        p = s.get(Project, t.project_id)
        emps = {e.id: e for e in s.scalars(select(Employee))}
        parts = [f"# Project: {p.title}\n{p.description}"]
        if p.plan_summary:
            parts.append(f"## Director's plan\n{p.plan_summary}")
        if p.owner_feedback and t.kind == "delivery":
            parts.append(f"## Owner feedback on the previous package (must be addressed)\n{p.owner_feedback}")
        parts.append(f"# Your task (id {t.id}, priority {t.priority})\n**{t.title}**\n\n{t.description}")
        if t.feedback:
            parts.append(f"## REVISION REQUESTED (round {t.revision_count})\n{t.feedback}")
            if t.deliverable:
                parts.append(f"## Your previous version\n{t.deliverable}")

        all_tasks = s.scalars(select(Task).where(Task.project_id == p.id).order_by(Task.id)).all()
        if t.kind == "delivery":
            scope = [x for x in all_tasks if x.id != t.id and x.deliverable and x.status == "completed"]
        else:
            scope = [x for x in all_tasks if x.id in (t.depends_on or []) and x.deliverable]
        if scope:
            label = "Deliverables to review" if t.kind == "review" else "Inputs from your teammates"
            parts.append(f"# {label}")
            for x in scope:
                who = emps[x.assignee_id] if x.assignee_id in emps else None
                parts.append(f"## Task {x.id}: {x.title} - by {who.name + ', ' + who.title if who else 'unassigned'}"
                             f" (revisions: {x.revision_count})\n{x.deliverable}")
        if t.kind == "delivery":
            parts.append("# Contributor metrics (from execution records)")
            for e in emps.values():
                mine = [x for x in all_tasks if x.assignee_id == e.id and x.id != t.id]
                if mine:
                    cost = sum(x.cost_usd for x in mine)
                    revs = sum(x.revision_count for x in mine)
                    parts.append(f"- {e.name} ({e.title}): {len(mine)} task(s), {revs} revision(s), ${cost:.4f}")

        parts.append("# Project task list\n" + "\n".join(
            f"- [{x.id}] {x.title} -> {emps[x.assignee_id].title if x.assignee_id in emps else '-'} ({x.status})"
            for x in all_tasks))
        inbox = s.scalars(select(Message).where(Message.to_id == employee_id, Message.read.is_(False))
                          .order_by(Message.id)).all()
        if inbox:
            parts.append("# Unread messages\n" + "\n".join(
                f"- From {emps[m.from_id].name if m.from_id in emps else 'Owner'} ({m.kind}): {m.content}" for m in inbox))
            for m in inbox:
                m.read = True
            s.commit()
        notes = s.scalars(select(MemoryNote).where(MemoryNote.project_id == p.id,
                                                   MemoryNote.employee_id == employee_id)).all()
        if notes:
            parts.append("# Your working memory\n" + "\n".join(f"- {n.key}: {n.value}" for n in notes))
        if t.kind == "review":
            parts.append("Review each deliverable listed above. Call approve_task or request_revision for every "
                         "task id, then submit a QC report with submit_deliverable.")
        return "\n\n".join(parts)
