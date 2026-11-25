"""Employee status, derived only from what the agent is actually doing.

Live states (THINKING / WORKING / REVIEWING / IN_MEETING) are set by the agent
runtime while a Claude request or tool call is really in flight. Everything
else (WAITING / COMPLETED / ERROR / PAUSED / IDLE) is derived from the task
records in the database. Nothing here is random or time-based.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select

from ..db import Employee, Project, Task, session

LIVE_STATES = {"THINKING", "WORKING", "REVIEWING", "IN_MEETING"}
ACTIVE_PROJECT_STATES = {"planning", "running", "awaiting_approval", "direct"}


@dataclass
class LiveState:
    state: str
    task_id: int | None = None
    project_id: int | None = None
    detail: str = ""
    with_employee_id: int | None = None  # meeting partner
    extra: dict[str, Any] = field(default_factory=dict)


class Presence:
    def __init__(self) -> None:
        self._live: dict[int, LiveState] = {}

    def set_live(self, employee_id: int, state: str, **kw: Any) -> None:
        assert state in LIVE_STATES, state
        self._live[employee_id] = LiveState(state=state, **kw)

    def clear_live(self, employee_id: int) -> None:
        self._live.pop(employee_id, None)

    def live(self, employee_id: int) -> LiveState | None:
        return self._live.get(employee_id)

    def snapshot(self, employee_id: int) -> dict[str, Any]:
        """Return the employee's real status plus the task it relates to."""
        with session() as s:
            emp = s.get(Employee, employee_id)
            if emp is None:
                return {"status": "IDLE"}
            live = self._live.get(employee_id)
            running = s.scalars(
                select(Task).where(Task.assignee_id == employee_id, Task.status == "running")
            ).first()
            if live is not None:
                return {
                    "status": live.state, "task_id": live.task_id or (running.id if running else None),
                    "project_id": live.project_id, "detail": live.detail,
                    "with_employee_id": live.with_employee_id,
                    "progress": running.progress if running else None,
                }
            if emp.paused:
                return {"status": "PAUSED", "task_id": running.id if running else None,
                        "detail": "Paused by owner"}
            if running is not None:
                # Between API calls (e.g. waiting for a concurrency slot) - still working the task.
                return {"status": "WORKING", "task_id": running.id, "project_id": running.project_id,
                        "progress": running.progress, "detail": running.title}
            if emp.last_error:
                return {"status": "ERROR", "detail": emp.last_error}
            active_ids = s.scalars(select(Project.id).where(Project.status.in_(ACTIVE_PROJECT_STATES))).all()
            waiting = s.scalars(
                select(Task).where(
                    Task.assignee_id == employee_id,
                    Task.status.in_(["pending", "queued"]),
                    Task.project_id.in_(active_ids) if active_ids else False,
                ).order_by(Task.id)
            ).first()
            if waiting is not None:
                why = "Waiting for dependencies" if waiting.status == "pending" else "Queued - waiting for a free agent slot"
                return {"status": "WAITING", "task_id": waiting.id, "project_id": waiting.project_id,
                        "detail": f"{why}: {waiting.title}"}
            done = s.scalars(
                select(Task).where(
                    Task.assignee_id == employee_id, Task.status == "completed",
                    Task.project_id.in_(active_ids) if active_ids else False,
                ).order_by(Task.completed_at.desc())
            ).first()
            if done is not None:
                return {"status": "COMPLETED", "task_id": done.id, "project_id": done.project_id,
                        "detail": f"Delivered: {done.title}"}
            return {"status": "IDLE", "detail": ""}


presence = Presence()
