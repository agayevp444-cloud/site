"""Extensible tool system.

Register a new tool with the @tool decorator; give it to an employee by adding its
name to that employee's `tools` list (in the UI or the API). Handlers receive a
ToolContext and the validated input dict and return a string (or dict -> JSON).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

Handler = Callable[["ToolContext", dict[str, Any]], Awaitable[Any]]


@dataclass
class ToolContext:
    employee_id: int
    project_id: int
    task_id: int
    runtime: Any  # AgentRuntime; typed loosely to avoid an import cycle
    state: dict[str, Any] = field(default_factory=dict)  # per-run scratch (e.g. submitted deliverable)


@dataclass
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: Handler | None  # None for Anthropic server tools
    server_tool: dict[str, Any] | None = None
    available: Callable[[], bool] = lambda: True
    category: str = "general"

    def api_definition(self) -> dict[str, Any]:
        if self.server_tool is not None:
            return dict(self.server_tool)
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
            # Streamed requests: let large inputs (scripts, tables) stream as they are generated.
            "eager_input_streaming": True,
        }


REGISTRY: dict[str, ToolSpec] = {}


def tool(name: str, description: str, properties: dict[str, Any], required: list[str] | None = None,
         category: str = "general", available: Callable[[], bool] | None = None):
    schema = {"type": "object", "properties": properties, "required": required or [],
              "additionalProperties": False}

    def deco(fn: Handler) -> Handler:
        REGISTRY[name] = ToolSpec(name=name, description=description, input_schema=schema, handler=fn,
                                  category=category, available=available or (lambda: True))
        return fn
    return deco


def register_server_tool(name: str, definition: dict[str, Any], description: str,
                         available: Callable[[], bool] | None = None) -> None:
    REGISTRY[name] = ToolSpec(name=name, description=description, input_schema={}, handler=None,
                              server_tool=definition, available=available or (lambda: True),
                              category="server")


_TYPES = {"string": str, "integer": int, "number": (int, float), "boolean": bool,
          "array": list, "object": dict}


def validate_input(spec: ToolSpec, data: Any) -> str | None:
    """Minimal schema check. Eager input streaming means the API no longer validates for us."""
    if not isinstance(data, dict):
        return "Tool input must be a JSON object."
    props = spec.input_schema.get("properties", {})
    for key in spec.input_schema.get("required", []):
        if key not in data:
            return f"Missing required field '{key}'."
    for key, value in data.items():
        if key not in props:
            return f"Unknown field '{key}'."
        expected = props[key].get("type")
        py = _TYPES.get(expected) if isinstance(expected, str) else None
        if py is not None and not isinstance(value, py):
            return f"Field '{key}' must be of type {expected}."
        if py is int and isinstance(value, bool):
            return f"Field '{key}' must be of type integer."
        if "enum" in props[key] and value not in props[key]["enum"]:
            return f"Field '{key}' must be one of {props[key]['enum']}."
    return None


def definitions_for(names: list[str]) -> list[dict[str, Any]]:
    out = []
    for n in names:
        spec = REGISTRY.get(n)
        if spec is not None and spec.available():
            out.append(spec.api_definition())
    return out


def catalog() -> list[dict[str, Any]]:
    return [{"name": s.name, "description": s.description, "category": s.category,
             "available": s.available()} for s in REGISTRY.values()]


def as_text(result: Any) -> str:
    if isinstance(result, str):
        return result
    return json.dumps(result, ensure_ascii=False, indent=2, default=str)
