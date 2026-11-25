"""Persistence: every project, task, message, log line and API call is stored here."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .config import settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class Base(DeclarativeBase):
    pass


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(120))
    department: Mapped[str] = mapped_column(String(64), default="creative")
    job_description: Mapped[str] = mapped_column(Text, default="")
    system_prompt: Mapped[str] = mapped_column(Text, default="")
    tools: Mapped[list] = mapped_column(JSON, default=list)
    desk: Mapped[int] = mapped_column(Integer, default=0)
    color: Mapped[str] = mapped_column(String(16), default="#e07a5f")
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_director: Mapped[bool] = mapped_column(Boolean, default=False)
    is_qc: Mapped[bool] = mapped_column(Boolean, default=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "key": self.key, "name": self.name, "title": self.title,
            "department": self.department, "job_description": self.job_description,
            "system_prompt": self.system_prompt, "tools": self.tools or [], "desk": self.desk,
            "color": self.color, "paused": self.paused, "active": self.active,
            "is_director": self.is_director, "is_qc": self.is_qc, "last_error": self.last_error,
            "created_at": iso(self.created_at),
        }


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    # planning | running | awaiting_approval | delivered | failed | cancelled | direct
    status: Mapped[str] = mapped_column(String(32), default="planning")
    plan_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_deliverable: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "title": self.title, "description": self.description, "status": self.status,
            "plan_summary": self.plan_summary, "final_deliverable": self.final_deliverable,
            "owner_feedback": self.owner_feedback, "error": self.error,
            "created_at": iso(self.created_at), "completed_at": iso(self.completed_at),
        }


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str] = mapped_column(Text, default="")
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    # work | review | delivery | direct
    kind: Mapped[str] = mapped_column(String(16), default="work")
    # pending | queued | running | completed | failed | cancelled
    status: Mapped[str] = mapped_column(String(16), default="pending")
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    depends_on: Mapped[list] = mapped_column(JSON, default=list)
    deliverable: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    artifacts: Mapped[list] = mapped_column(JSON, default=list)
    # none | pending | approved | rejected  (owner approval)
    approval: Mapped[str] = mapped_column(String(16), default="none")
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    revision_count: Mapped[int] = mapped_column(Integer, default=0)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_by: Mapped[str] = mapped_column(String(32), default="director")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "project_id": self.project_id, "title": self.title,
            "description": self.description, "assignee_id": self.assignee_id, "kind": self.kind,
            "status": self.status, "priority": self.priority, "depends_on": self.depends_on or [],
            "deliverable": self.deliverable, "summary": self.summary, "artifacts": self.artifacts or [],
            "approval": self.approval, "feedback": self.feedback, "revision_count": self.revision_count,
            "progress": self.progress, "error": self.error, "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens, "cost_usd": round(self.cost_usd, 6),
            "created_by": self.created_by, "created_at": iso(self.created_at),
            "started_at": iso(self.started_at), "completed_at": iso(self.completed_at),
        }


class Message(Base):
    """Communication between agents (and from the owner)."""
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    from_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)  # None = owner
    to_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)    # None = owner
    # handoff | message | question | answer | revision | approval | assignment
    kind: Mapped[str] = mapped_column(String(16), default="message")
    content: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "project_id": self.project_id, "task_id": self.task_id,
            "from_id": self.from_id, "to_id": self.to_id, "kind": self.kind,
            "content": self.content, "read": self.read, "created_at": iso(self.created_at),
        }


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    # status | thinking | tool | api | error | system | owner
    kind: Mapped[str] = mapped_column(String(16), default="system")
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "employee_id": self.employee_id, "project_id": self.project_id,
            "task_id": self.task_id, "kind": self.kind, "text": self.text,
            "created_at": iso(self.created_at),
        }


class UsageRecord(Base):
    """One row per Claude API call - the source of truth for cost monitoring."""
    __tablename__ = "usage_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    purpose: Mapped[str] = mapped_column(String(32), default="task")
    model: Mapped[str] = mapped_column(String(64))
    request_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0)
    web_searches: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    stop_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "employee_id": self.employee_id, "project_id": self.project_id,
            "task_id": self.task_id, "purpose": self.purpose, "model": self.model,
            "request_id": self.request_id, "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens, "cache_write_tokens": self.cache_write_tokens,
            "cache_read_tokens": self.cache_read_tokens, "web_searches": self.web_searches,
            "cost_usd": round(self.cost_usd, 6), "stop_reason": self.stop_reason,
            "created_at": iso(self.created_at),
        }


class MemoryNote(Base):
    """Per-project working memory an agent writes with the save_note tool."""
    __tablename__ = "memory_notes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    key: Mapped[str] = mapped_column(String(120))
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "project_id": self.project_id, "employee_id": self.employee_id,
                "key": self.key, "value": self.value, "updated_at": iso(self.updated_at)}


_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
if settings.database_url.startswith("sqlite:///"):
    Path(settings.database_url[len("sqlite:///"):]).parent.mkdir(parents=True, exist_ok=True)
engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)


def session() -> Session:
    return SessionLocal()
