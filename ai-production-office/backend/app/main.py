"""FastAPI entrypoint: REST for owner controls, WebSocket for the live office."""
from __future__ import annotations

import asyncio
import logging
import shutil
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from .agents.orchestrator import Orchestrator
from .agents.presence import presence
from .agents.runtime import runtime
from .config import settings
from .db import ActivityLog, Employee, MemoryNote, Message, Project, Task, UsageRecord, init_db, session
from .events import hub
from .seed import COMMON_TOOLS, seed_employees
from .tools.production import workspace
from .tools.registry import REGISTRY, catalog

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
orchestrator = Orchestrator(runtime)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    seed_employees()
    workspace()
    await orchestrator.start()
    yield
    await orchestrator.stop()


app = FastAPI(title="İLHAM Studio — AI Prodüksiya Ofisi", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin, "http://127.0.0.1:3000"],
                   allow_methods=["*"], allow_headers=["*"])

Priority = Literal["low", "medium", "high", "critical"]


class ProjectIn(BaseModel):
    description: str = Field(min_length=5)
    title: str | None = None


class ReviewIn(BaseModel):
    approve: bool
    feedback: str | None = None


class ReassignIn(BaseModel):
    employee_id: int


class RetryIn(BaseModel):
    feedback: str | None = None


class AssignIn(BaseModel):
    title: str = Field(min_length=2)
    description: str = ""
    priority: Priority = "medium"
    project_id: int | None = None


class MessageIn(BaseModel):
    content: str = Field(min_length=1)


class EmployeeIn(BaseModel):
    name: str = Field(min_length=2)
    title: str = Field(min_length=2)
    department: str = "creative"
    job_description: str = Field(min_length=5)
    system_prompt: str | None = None
    tools: list[str] | None = None
    color: str = "#7aa2f7"


class EmployeePatch(BaseModel):
    name: str | None = None
    title: str | None = None
    department: str | None = None
    job_description: str | None = None
    system_prompt: str | None = None
    tools: list[str] | None = None
    color: str | None = None
    active: bool | None = None


def _employee_out(e: Employee) -> dict:
    return {**e.to_dict(), "presence": presence.snapshot(e.id)}


def _usage_summary() -> dict:
    with session() as s:
        tot = s.execute(select(func.coalesce(func.sum(UsageRecord.input_tokens), 0),
                               func.coalesce(func.sum(UsageRecord.output_tokens), 0),
                               func.coalesce(func.sum(UsageRecord.cache_read_tokens), 0),
                               func.coalesce(func.sum(UsageRecord.cache_write_tokens), 0),
                               func.coalesce(func.sum(UsageRecord.web_searches), 0),
                               func.coalesce(func.sum(UsageRecord.cost_usd), 0.0),
                               func.count(UsageRecord.id))).one()
        by_emp = s.execute(select(UsageRecord.employee_id, func.sum(UsageRecord.cost_usd), func.count(UsageRecord.id),
                                  func.sum(UsageRecord.input_tokens), func.sum(UsageRecord.output_tokens))
                           .group_by(UsageRecord.employee_id)).all()
        by_proj = s.execute(select(UsageRecord.project_id, func.sum(UsageRecord.cost_usd), func.count(UsageRecord.id))
                            .group_by(UsageRecord.project_id)).all()
        by_model = s.execute(select(UsageRecord.model, func.sum(UsageRecord.cost_usd), func.count(UsageRecord.id))
                             .group_by(UsageRecord.model)).all()
    return {
        "input_tokens": tot[0], "output_tokens": tot[1], "cache_read_tokens": tot[2], "cache_write_tokens": tot[3],
        "web_searches": tot[4], "cost_usd": round(float(tot[5]), 6), "calls": tot[6],
        "by_employee": [{"employee_id": r[0], "cost_usd": round(float(r[1] or 0), 6), "calls": r[2],
                         "input_tokens": r[3] or 0, "output_tokens": r[4] or 0} for r in by_emp],
        "by_project": [{"project_id": r[0], "cost_usd": round(float(r[1] or 0), 6), "calls": r[2]} for r in by_proj],
        "by_model": [{"model": r[0], "cost_usd": round(float(r[1] or 0), 6), "calls": r[2]} for r in by_model],
    }


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "api_key_configured": settings.api_key_configured, "model": settings.model,
            "ffmpeg": shutil.which("ffmpeg") is not None, "web_search": settings.enable_web_search,
            "max_concurrent": settings.max_concurrent}


@app.get("/api/state")
async def state() -> dict:
    with session() as s:
        emps = s.scalars(select(Employee).order_by(Employee.desk)).all()
        projects = s.scalars(select(Project).order_by(Project.id.desc())).all()
        tasks = s.scalars(select(Task).order_by(Task.id)).all()
        msgs = s.scalars(select(Message).order_by(Message.id.desc()).limit(400)).all()
        logs = s.scalars(select(ActivityLog).order_by(ActivityLog.id.desc()).limit(400)).all()
        return {
            "employees": [_employee_out(e) for e in emps],
            "projects": [p.to_dict() for p in projects],
            "tasks": [t.to_dict() for t in tasks],
            "messages": [m.to_dict() for m in reversed(msgs)],
            "logs": [lg.to_dict() for lg in reversed(logs)],
            "usage": _usage_summary(),
            "tools": catalog(),
            "health": await health(),
        }


@app.get("/api/usage")
async def usage() -> dict:
    return _usage_summary()


# ---------------------------------------------------------------- projects
@app.post("/api/projects")
async def create_project(body: ProjectIn) -> dict:
    p = await orchestrator.create_project(body.description.strip(), body.title)
    return p.to_dict()


def _project(pid: int) -> Project:
    with session() as s:
        p = s.get(Project, pid)
        if p is None:
            raise HTTPException(404, "Layihə tapılmadı")
        return p


@app.post("/api/projects/{pid}/review")
async def review_project(pid: int, body: ReviewIn) -> dict:
    p = _project(pid)
    if p.status != "awaiting_approval":
        raise HTTPException(409, f"Layihənin statusu {p.status}-dir, təsdiq gözləmir")
    await orchestrator.review_project(pid, body.approve, body.feedback)
    return _project(pid).to_dict()


@app.post("/api/projects/{pid}/cancel")
async def cancel_project(pid: int) -> dict:
    _project(pid)
    await orchestrator.cancel_project(pid)
    return _project(pid).to_dict()


# ---------------------------------------------------------------- tasks
def _task(tid: int) -> Task:
    with session() as s:
        t = s.get(Task, tid)
        if t is None:
            raise HTTPException(404, "Tapşırıq tapılmadı")
        return t


@app.post("/api/tasks/{tid}/stop")
async def stop_task(tid: int) -> dict:
    _task(tid)
    await orchestrator.stop_task(tid)
    return _task(tid).to_dict()


@app.post("/api/tasks/{tid}/retry")
async def retry_task(tid: int, body: RetryIn) -> dict:
    t = _task(tid)
    if t.status == "running":
        raise HTTPException(409, "Tapşırıq hazırda icra olunur")
    await orchestrator.retry_task(tid, body.feedback)
    return _task(tid).to_dict()


@app.post("/api/tasks/{tid}/reassign")
async def reassign_task(tid: int, body: ReassignIn) -> dict:
    _task(tid)
    with session() as s:
        if s.get(Employee, body.employee_id) is None:
            raise HTTPException(404, "İşçi tapılmadı")
    await orchestrator.reassign_task(tid, body.employee_id)
    return _task(tid).to_dict()


@app.post("/api/tasks/{tid}/review")
async def review_task(tid: int, body: ReviewIn) -> dict:
    t = _task(tid)
    if t.status != "completed":
        raise HTTPException(409, "Yalnız tamamlanmış nəticələr yoxlanıla bilər")
    await orchestrator.review_task(tid, body.approve, body.feedback)
    return _task(tid).to_dict()


# ---------------------------------------------------------------- employees
def _emp(eid: int) -> Employee:
    with session() as s:
        e = s.get(Employee, eid)
        if e is None:
            raise HTTPException(404, "İşçi tapılmadı")
        return e


@app.post("/api/employees")
async def add_employee(body: EmployeeIn) -> dict:
    tools = body.tools if body.tools is not None else COMMON_TOOLS
    unknown = [t for t in tools if t not in REGISTRY]
    if unknown:
        raise HTTPException(400, f"Naməlum alətlər: {unknown}")
    with session() as s:
        used = set(s.scalars(select(Employee.desk).where(Employee.active.is_(True))))
        desk = next(i for i in range(100) if i not in used)
        base = "".join(c if c.isalnum() else "_" for c in body.title.lower()).strip("_") or "employee"
        key, n = base, 2
        while s.scalars(select(Employee).where(Employee.key == key)).first():
            key, n = f"{base}_{n}", n + 1
        prompt = body.system_prompt or (f"Adın: {body.name}. Vəzifən: İLHAM Studio-da {body.title}.\n"
                                        f"{body.job_description}\nKonkret, peşəkar, istehsala hazır iş təqdim et.")
        e = Employee(key=key, name=body.name, title=body.title, department=body.department,
                     job_description=body.job_description, system_prompt=prompt, tools=tools, desk=desk,
                     color=body.color)
        s.add(e)
        s.commit()
    out = _employee_out(e)
    await hub.emit("employee.updated", out)
    await runtime.log("owner", f"{e.name} {e.title} vəzifəsinə işə götürüldü", e.id)
    return out


@app.patch("/api/employees/{eid}")
async def update_employee(eid: int, body: EmployeePatch) -> dict:
    _emp(eid)
    if body.tools is not None:
        unknown = [t for t in body.tools if t not in REGISTRY]
        if unknown:
            raise HTTPException(400, f"Naməlum alətlər: {unknown}")
    with session() as s:
        e = s.get(Employee, eid)
        changes = body.model_dump(exclude_none=True)
        if e.is_director and changes.get("active") is False:
            raise HTTPException(400, "İcraçı Direktor deaktiv edilə bilməz")
        for k, v in changes.items():
            setattr(e, k, v)
        s.commit()
    out = _employee_out(e)
    await hub.emit("employee.updated", out)
    await runtime.log("owner", f"Profil yeniləndi: {', '.join(changes) or 'dəyişiklik yoxdur'}", eid)
    return out


@app.post("/api/employees/{eid}/pause")
async def pause(eid: int) -> dict:
    _emp(eid)
    await orchestrator.set_paused(eid, True)
    return _employee_out(_emp(eid))


@app.post("/api/employees/{eid}/resume")
async def resume(eid: int) -> dict:
    _emp(eid)
    await orchestrator.set_paused(eid, False)
    return _employee_out(_emp(eid))


@app.post("/api/employees/{eid}/clear-error")
async def clear_error(eid: int) -> dict:
    with session() as s:
        e = s.get(Employee, eid)
        if e is None:
            raise HTTPException(404, "İşçi tapılmadı")
        e.last_error = None
        s.commit()
    await runtime.emit_employee(eid, force=True)
    return _employee_out(_emp(eid))


@app.post("/api/employees/{eid}/tasks")
async def assign(eid: int, body: AssignIn) -> dict:
    e = _emp(eid)
    if not e.active:
        raise HTTPException(400, "İşçi aktiv deyil")
    t = await orchestrator.assign_direct(eid, body.title, body.description, body.priority, body.project_id)
    return t.to_dict()


@app.post("/api/employees/{eid}/message")
async def message_employee(eid: int, body: MessageIn) -> dict:
    _emp(eid)
    await runtime.post_message(None, None, None, eid, "message", body.content)
    return {"ok": True}


@app.get("/api/employees/{eid}/history")
async def history(eid: int) -> dict:
    e = _emp(eid)
    with session() as s:
        tasks = s.scalars(select(Task).where(Task.assignee_id == eid).order_by(Task.id.desc())).all()
        msgs = s.scalars(select(Message).where(or_(Message.from_id == eid, Message.to_id == eid))
                         .order_by(Message.id.desc()).limit(200)).all()
        logs = s.scalars(select(ActivityLog).where(ActivityLog.employee_id == eid)
                         .order_by(ActivityLog.id.desc()).limit(300)).all()
        notes = s.scalars(select(MemoryNote).where(MemoryNote.employee_id == eid)).all()
        cost = s.scalar(select(func.coalesce(func.sum(UsageRecord.cost_usd), 0.0)).where(UsageRecord.employee_id == eid))
    done = [t for t in tasks if t.status == "completed"]
    durations = [(t.completed_at - t.started_at).total_seconds() for t in done if t.started_at and t.completed_at]
    return {
        "employee": _employee_out(e),
        "tasks": [t.to_dict() for t in tasks],
        "messages": [m.to_dict() for m in msgs],
        "logs": [lg.to_dict() for lg in logs],
        "notes": [n.to_dict() for n in notes],
        "metrics": {
            "tasks_total": len(tasks), "tasks_completed": len(done),
            "tasks_failed": sum(1 for t in tasks if t.status == "failed"),
            "revisions": sum(t.revision_count for t in tasks),
            "avg_duration_s": round(sum(durations) / len(durations), 1) if durations else None,
            "cost_usd": round(float(cost or 0), 6),
        },
    }


@app.get("/api/files/{path:path}")
async def get_file(path: str):
    root = workspace().resolve()
    p = (root / path).resolve()
    if root not in p.parents or not p.is_file():
        raise HTTPException(404, "Fayl tapılmadı")
    return FileResponse(p, filename=p.name)


# ---------------------------------------------------------------- websocket
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await hub.connect(ws)
    try:
        while True:
            # Clients only listen; a ping keeps proxies from closing the socket.
            msg = await asyncio.wait_for(ws.receive_text(), timeout=60)
            if msg == "ping":
                await ws.send_text('{"event":"pong","data":null}')
    except (WebSocketDisconnect, asyncio.TimeoutError, RuntimeError):
        pass
    finally:
        await hub.disconnect(ws)
