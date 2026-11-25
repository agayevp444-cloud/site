"""Tools every employee uses to collaborate: reading teammates' work, messaging, memory, deliverables."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select

from ..db import Employee, MemoryNote, Message, Task, session, utcnow
from .registry import ToolContext, tool

ARTIFACT_KINDS = ["palette", "shot_list", "lighting_diagram", "storyboard", "timeline", "sound_cues",
                  "content_calendar", "table", "document", "checklist"]


def find_employee(s, ref: str) -> Employee | None:
    ref = (ref or "").strip().lower()
    for e in s.scalars(select(Employee).where(Employee.active.is_(True))):
        if ref in {e.key.lower(), e.name.lower(), e.title.lower(), str(e.id)} or e.name.lower().startswith(ref):
            return e
    return None


@tool("list_project_tasks", "List every task in the current project with assignee, status and dependencies.", {})
async def list_project_tasks(ctx: ToolContext, _: dict[str, Any]) -> Any:
    with session() as s:
        emps = {e.id: e for e in s.scalars(select(Employee))}
        rows = s.scalars(select(Task).where(Task.project_id == ctx.project_id).order_by(Task.id)).all()
        return [{"task_id": t.id, "title": t.title, "assignee": emps[t.assignee_id].title if t.assignee_id in emps else None,
                 "status": t.status, "depends_on": t.depends_on, "has_deliverable": bool(t.deliverable)} for t in rows]


@tool("read_deliverable", "Read the full deliverable (and artifacts) a teammate produced for a task in this project.",
      {"task_id": {"type": "integer", "description": "Task id from list_project_tasks."}}, ["task_id"])
async def read_deliverable(ctx: ToolContext, data: dict[str, Any]) -> Any:
    with session() as s:
        t = s.get(Task, data["task_id"])
        if t is None or t.project_id != ctx.project_id:
            return "No such task in this project."
        if not t.deliverable:
            return f"Task {t.id} has no deliverable yet (status: {t.status})."
        return {"task_id": t.id, "title": t.title, "deliverable": t.deliverable, "artifacts": t.artifacts}


@tool("send_message", "Send a message to a colleague (by role key, name or title). It lands in their inbox and in "
      "the office feed. Use it to hand off notes, flag issues or give direction.",
      {"to": {"type": "string", "description": "Colleague role key, name or title, e.g. 'cinematographer'."},
       "content": {"type": "string"}}, ["to", "content"], category="collaboration")
async def send_message(ctx: ToolContext, data: dict[str, Any]) -> Any:
    with session() as s:
        target = find_employee(s, data["to"])
        if target is None:
            return f"No colleague matches '{data['to']}'."
        target_id, target_name = target.id, target.name
    await ctx.runtime.post_message(ctx.project_id, ctx.task_id, ctx.employee_id, target_id, "message", data["content"])
    return f"Message delivered to {target_name}."


@tool("check_inbox", "Read unread messages that colleagues or the owner sent you.", {}, category="collaboration")
async def check_inbox(ctx: ToolContext, _: dict[str, Any]) -> Any:
    with session() as s:
        emps = {e.id: e.name for e in s.scalars(select(Employee))}
        msgs = s.scalars(select(Message).where(Message.to_id == ctx.employee_id, Message.read.is_(False))
                         .order_by(Message.id)).all()
        out = [{"from": emps.get(m.from_id, "Owner"), "kind": m.kind, "content": m.content} for m in msgs]
        for m in msgs:
            m.read = True
        s.commit()
    return out or "Inbox is empty."


@tool("consult_colleague", "Hold a short live meeting with a colleague: ask a question and get their expert answer. "
      "Only works if the colleague is not busy with their own task.",
      {"colleague": {"type": "string"}, "question": {"type": "string"}}, ["colleague", "question"],
      category="collaboration")
async def consult_colleague(ctx: ToolContext, data: dict[str, Any]) -> Any:
    return await ctx.runtime.consult(ctx, data["colleague"], data["question"])


@tool("save_note", "Save a note to your working memory for this project (overwrites the same key).",
      {"key": {"type": "string"}, "value": {"type": "string"}}, ["key", "value"], category="memory")
async def save_note(ctx: ToolContext, data: dict[str, Any]) -> Any:
    with session() as s:
        note = s.scalars(select(MemoryNote).where(MemoryNote.project_id == ctx.project_id,
                                                  MemoryNote.employee_id == ctx.employee_id,
                                                  MemoryNote.key == data["key"])).first()
        if note is None:
            s.add(MemoryNote(project_id=ctx.project_id, employee_id=ctx.employee_id, key=data["key"], value=data["value"]))
        else:
            note.value, note.updated_at = data["value"], utcnow()
        s.commit()
    return "Saved."


@tool("read_notes", "Read your working-memory notes for this project.", {}, category="memory")
async def read_notes(ctx: ToolContext, _: dict[str, Any]) -> Any:
    with session() as s:
        notes = s.scalars(select(MemoryNote).where(MemoryNote.project_id == ctx.project_id,
                                                   MemoryNote.employee_id == ctx.employee_id)).all()
        return {n.key: n.value for n in notes} or "No notes yet."


@tool("save_artifact", "Attach a structured artifact to your deliverable so the office UI can render it. "
      "palette: data={'colors':[{'hex':'#112233','name':'...','role':'...'}]}. "
      "Table-like kinds (shot_list, timeline, sound_cues, content_calendar, storyboard, table, checklist): "
      "data={'columns':[...], 'rows':[[...], ...]}. lighting_diagram/document: data={'text':'...'} plus optional fields.",
      {"kind": {"type": "string", "enum": ARTIFACT_KINDS}, "title": {"type": "string"},
       "data": {"type": "object"}}, ["kind", "title", "data"], category="deliverable")
async def save_artifact(ctx: ToolContext, data: dict[str, Any]) -> Any:
    art = {"kind": data["kind"], "title": data["title"], "data": data["data"], "by": ctx.employee_id}
    if data["kind"] == "palette":
        colors = data["data"].get("colors")
        if not isinstance(colors, list) or not all(isinstance(c, dict) and str(c.get("hex", "")).startswith("#") for c in colors):
            return "palette data must be {'colors': [{'hex': '#rrggbb', 'name': str, 'role': str}, ...]}"
    elif data["kind"] not in {"lighting_diagram", "document"}:
        if not isinstance(data["data"].get("columns"), list) or not isinstance(data["data"].get("rows"), list):
            return "table artifacts need data={'columns': [...], 'rows': [[...], ...]}"
    ctx.state.setdefault("artifacts", []).append(art)
    return f"Artifact '{data['title']}' saved."


@tool("submit_deliverable", "Submit your finished work for this task. Call exactly once, at the end, with the "
      "complete deliverable in Markdown and a one-sentence summary.",
      {"content": {"type": "string", "description": "Complete deliverable in Markdown."},
       "summary": {"type": "string"}}, ["content", "summary"], category="deliverable")
async def submit_deliverable(ctx: ToolContext, data: dict[str, Any]) -> Any:
    ctx.state["deliverable"] = data["content"]
    ctx.state["summary"] = data["summary"]
    return "Deliverable submitted. Finish your turn now."


# --- Quality control -------------------------------------------------------------------------

@tool("approve_task", "QC: mark a task's deliverable as passing review.",
      {"task_id": {"type": "integer"}, "note": {"type": "string"}}, ["task_id"], category="review")
async def approve_task(ctx: ToolContext, data: dict[str, Any]) -> Any:
    return await ctx.runtime.orchestrator.qc_approve(ctx, data["task_id"], data.get("note", ""))


@tool("request_revision", "QC: send a task back to its author with specific feedback. The author reworks it and "
      "you will review again.", {"task_id": {"type": "integer"}, "feedback": {"type": "string"}},
      ["task_id", "feedback"], category="review")
async def request_revision(ctx: ToolContext, data: dict[str, Any]) -> Any:
    return await ctx.runtime.orchestrator.qc_request_revision(ctx, data["task_id"], data["feedback"])
