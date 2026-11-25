"""End-to-end orchestration test with a scripted LLM (test-only; the app itself always calls Claude).

Verifies: planning -> dependency ordering -> handoffs -> QC revision loop -> delivery -> owner approval,
plus usage accounting, failure surfacing and pause handling.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import tempfile
import time

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["WORKSPACE_DIR"] = tempfile.mkdtemp()
os.environ["ENABLE_WEB_SEARCH"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.agents import llm as llm_mod  # noqa: E402
from app.agents.llm import LLMError, ToolUse, TurnResult  # noqa: E402

CALLS: list[dict] = []
FAIL_FOR: set[str] = set()


def _result(text: str = "", tool_uses: list[ToolUse] | None = None, stop: str = "end_turn") -> TurnResult:
    content = ([{"type": "text", "text": text}] if text else []) + [
        {"type": "tool_use", "id": t.id, "name": t.name, "input": t.input} for t in (tool_uses or [])]
    return TurnResult(content=content, text=text, tool_uses=tool_uses or [], stop_reason=stop if not tool_uses else "tool_use",
                      model="claude-opus-5-5", request_id="req_test",
                      usage={"input_tokens": 1000, "output_tokens": 500, "cache_write_tokens": 0,
                             "cache_read_tokens": 0, "web_searches": 0})


async def fake_run_turn(*, system, messages, tools, effort, on_event=None, json_schema=None):
    CALLS.append({"system": system, "tools": [t.get("name") for t in tools], "n": len(messages)})
    await asyncio.sleep(0.01)
    if on_event:
        await on_event("block_start", "thinking")
        await on_event("thinking", "considering the brief")
        await on_event("block_start", "text")
        await on_event("text", "working...")
    who = re.search(r"You are ([A-Z][a-z]+ [A-Z][a-z]+)", system).group(1)
    if who in FAIL_FOR:
        raise LLMError("simulated API outage")
    if json_schema is not None:
        return _result(json.dumps({"project_title": "Test Commercial", "summary": "Research then concept.", "tasks": [
            {"ref": "t1", "title": "Research product", "description": "d", "assignee": "researcher",
             "priority": "high", "depends_on": []},
            {"ref": "t2", "title": "Develop concept", "description": "d", "assignee": "creative_director",
             "priority": "high", "depends_on": ["t1"]},
        ]}))
    last = messages[-1]["content"]
    if isinstance(last, list):  # tool results came back -> finish turn
        return _result("Done.")
    brief = last
    uses: list[ToolUse] = []
    if "approve_task" in [t.get("name") for t in tools]:
        ids = [int(x) for x in re.findall(r"## Task (\d+):", brief)]
        first_round = "REVISION" not in brief and "re-review" not in brief
        for i in ids:
            if first_round and i == ids[-1]:
                uses.append(ToolUse(id=f"r{i}", name="request_revision", input={"task_id": i, "feedback": "Tighten it."}))
            else:
                uses.append(ToolUse(id=f"a{i}", name="approve_task", input={"task_id": i}))
    elif "consult" in brief:
        pass
    uses.append(ToolUse(id="s1", name="submit_deliverable",
                        input={"content": f"# Deliverable by {who}\n\nrevised={'REVISION' in brief}", "summary": f"{who} done"}))
    uses.append(ToolUse(id="bad", name="save_artifact", input={"kind": "palette"}))  # invalid -> error result
    return _result("", uses)


@pytest.fixture(scope="module")
def client():
    llm_mod.llm.run_turn = fake_run_turn  # type: ignore[assignment]
    from app.main import app
    with TestClient(app) as c:
        yield c


def wait_for(fn, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(0.05)
    raise AssertionError("condition not met")


def test_full_project_lifecycle(client):
    st = client.get("/api/state").json()
    assert len(st["employees"]) == 10
    assert all(e["presence"]["status"] == "IDLE" for e in st["employees"])

    pid = client.post("/api/projects", json={"description": "Make a cinematic coffee commercial"}).json()["id"]
    proj = wait_for(lambda: (lambda p: p if p["status"] == "awaiting_approval" else None)(
        next(p for p in client.get("/api/state").json()["projects"] if p["id"] == pid)))
    st = client.get("/api/state").json()
    tasks = [t for t in st["tasks"] if t["project_id"] == pid]
    kinds = [t["kind"] for t in tasks]
    assert kinds.count("work") == 2 and kinds.count("review") == 2 and kinds.count("delivery") == 1
    research, concept = [t for t in tasks if t["kind"] == "work"]
    assert concept["depends_on"] == [research["id"]]
    assert concept["revision_count"] == 1 and "revised=True" in concept["deliverable"]
    assert research["started_at"] <= research["completed_at"] <= concept["started_at"]
    assert all(t["status"] == "completed" for t in tasks)
    assert proj["final_deliverable"].startswith("# Deliverable by Aria Vance")

    kinds_msgs = {m["kind"] for m in st["messages"]}
    assert {"assignment", "handoff", "revision", "approval"} <= kinds_msgs
    assert st["usage"]["calls"] > 0 and st["usage"]["cost_usd"] > 0
    assert any("invalid input" in lg["text"] for lg in st["logs"])

    by_key = {e["key"]: e for e in st["employees"]}
    assert by_key["researcher"]["presence"]["status"] == "COMPLETED"
    assert by_key["sound_designer"]["presence"]["status"] == "IDLE"

    r = client.post(f"/api/projects/{pid}/review", json={"approve": True}).json()
    assert r["status"] == "delivered"
    st = client.get("/api/state").json()
    assert {e["key"]: e for e in st["employees"]}["researcher"]["presence"]["status"] == "IDLE"


def test_failure_surfaces_error_and_retry(client):
    emp = next(e for e in client.get("/api/state").json()["employees"] if e["key"] == "marketing")
    FAIL_FOR.add("Daniel Kim")
    t = client.post(f"/api/employees/{emp['id']}/tasks", json={"title": "Plan socials", "description": "x"}).json()
    wait_for(lambda: next(x for x in client.get("/api/state").json()["tasks"] if x["id"] == t["id"])["status"] == "failed")
    st = client.get("/api/state").json()
    me = next(e for e in st["employees"] if e["id"] == emp["id"])
    assert me["presence"]["status"] == "ERROR" and "outage" in me["presence"]["detail"]
    FAIL_FOR.clear()
    client.post(f"/api/tasks/{t['id']}/retry", json={})
    wait_for(lambda: next(x for x in client.get("/api/state").json()["tasks"] if x["id"] == t["id"])["status"] == "completed")


def test_pause_blocks_new_work(client):
    emp = next(e for e in client.get("/api/state").json()["employees"] if e["key"] == "colorist")
    client.post(f"/api/employees/{emp['id']}/pause")
    t = client.post(f"/api/employees/{emp['id']}/tasks", json={"title": "Grade", "description": "x"}).json()
    time.sleep(0.5)
    st = client.get("/api/state").json()
    assert next(x for x in st["tasks"] if x["id"] == t["id"])["status"] == "queued"
    assert next(e for e in st["employees"] if e["id"] == emp["id"])["presence"]["status"] == "PAUSED"
    client.post(f"/api/employees/{emp['id']}/resume")
    wait_for(lambda: next(x for x in client.get("/api/state").json()["tasks"] if x["id"] == t["id"])["status"] == "completed")


def test_add_employee_and_lut_tool(client):
    e = client.post("/api/employees", json={"name": "Iris Novak", "title": "Motion Designer",
                                            "job_description": "Designs motion graphics and titles."}).json()
    assert e["key"] == "motion_designer" and e["desk"] == 10
    from app.tools.production import generate_lut
    from app.tools.registry import ToolContext
    ctx = ToolContext(employee_id=e["id"], project_id=1, task_id=1, runtime=None)
    out = asyncio.run(generate_lut(ctx, {"name": "teal orange", "parameters": {"temperature": 0.3, "contrast": 1.2}, "size": 17}))
    assert out["size"] == 17
    from app.tools.production import workspace
    lines = (workspace() / out["saved"]).read_text().splitlines()
    assert lines[1] == "LUT_3D_SIZE 17" and len(lines) == 4 + 17 ** 3
