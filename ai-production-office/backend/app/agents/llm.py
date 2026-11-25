"""Thin wrapper over the Anthropic Messages API (streaming), so the rest of the app is provider-agnostic.

Tests replace `LLM.run_turn` with a scripted fake; nothing else talks to the network.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

import anthropic

from ..config import settings

OnEvent = Callable[[str, Any], Awaitable[None]]


@dataclass
class ToolUse:
    id: str
    name: str
    input: Any
    parse_error: str | None = None


@dataclass
class TurnResult:
    content: list[Any]                # assistant content blocks, appended back verbatim
    text: str
    tool_uses: list[ToolUse]
    stop_reason: str | None
    model: str
    request_id: str | None
    usage: dict[str, int] = field(default_factory=dict)
    refusal_category: str | None = None


class LLMError(RuntimeError):
    pass


class LLM:
    def __init__(self) -> None:
        self._client: anthropic.AsyncAnthropic | None = None

    @property
    def client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            self._client = anthropic.AsyncAnthropic(max_retries=3)
        return self._client

    async def run_turn(self, *, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]],
                       effort: str, on_event: OnEvent | None = None,
                       json_schema: dict[str, Any] | None = None) -> TurnResult:
        params: dict[str, Any] = {
            "model": settings.model,
            "max_tokens": settings.max_tokens,
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": messages,
            "thinking": {"type": "adaptive", "display": "summarized"},
            "output_config": {"effort": effort},
        }
        if tools:
            params["tools"] = tools
        if json_schema is not None:
            params["output_config"]["format"] = {"type": "json_schema", "schema": json_schema}
        betas: list[str] = []
        if settings.enable_fallback:
            # On a policy decline the API re-runs the request on the server-chosen fallback model.
            betas.append("server-side-fallback-2026-07-01")
            params["fallbacks"] = "default"
        if betas:
            params["betas"] = betas

        try:
            async with self.client.beta.messages.stream(**params) as stream:
                async for event in stream:
                    if on_event is None:
                        continue
                    et = event.type
                    if et == "content_block_start":
                        await on_event("block_start", event.content_block.type)
                        if event.content_block.type == "tool_use":
                            await on_event("tool_start", event.content_block.name)
                        elif event.content_block.type == "server_tool_use":
                            await on_event("server_tool", event.content_block.name)
                    elif et == "thinking":
                        await on_event("thinking", event.thinking)
                    elif et == "text":
                        await on_event("text", event.text)
                message = await stream.get_final_message()
        except anthropic.AuthenticationError as e:
            raise LLMError("Anthropic autentifikasiyası alınmadı — backend/.env faylında ANTHROPIC_API_KEY-i yoxlayın") from e
        except anthropic.PermissionDeniedError as e:
            raise LLMError(f"Anthropic API icazə vermədi: {e.message}") from e
        except anthropic.NotFoundError as e:
            raise LLMError(f"Model və ya ünvan tapılmadı ({settings.model}): {e.message}") from e
        except anthropic.RateLimitError as e:
            raise LLMError("Anthropic API sorğu limitinə çatıldı — MAX_CONCURRENT_AGENTS dəyərini azaldın") from e
        except anthropic.BadRequestError as e:
            raise LLMError(f"Yanlış sorğu: {e.message}") from e
        except anthropic.APIStatusError as e:
            raise LLMError(f"Anthropic API xətası {e.status_code}: {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise LLMError("Anthropic API-yə qoşulmaq mümkün olmadı (şəbəkə xətası)") from e

        text_parts: list[str] = []
        tool_uses: list[ToolUse] = []
        for block in message.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                inp = block.input
                err = None
                if isinstance(inp, str):  # eager streaming can hand back raw/invalid JSON
                    try:
                        inp = json.loads(inp)
                    except json.JSONDecodeError:
                        err = "Alət girişi düzgün JSON deyil."
                tool_uses.append(ToolUse(id=block.id, name=block.name, input=inp, parse_error=err))
        u = message.usage
        server = getattr(u, "server_tool_use", None)
        usage = {
            "input_tokens": u.input_tokens or 0,
            "output_tokens": u.output_tokens or 0,
            "cache_write_tokens": getattr(u, "cache_creation_input_tokens", 0) or 0,
            "cache_read_tokens": getattr(u, "cache_read_input_tokens", 0) or 0,
            "web_searches": (getattr(server, "web_search_requests", 0) or 0) if server else 0,
        }
        details = getattr(message, "stop_details", None)
        return TurnResult(
            content=message.content, text="".join(text_parts), tool_uses=tool_uses,
            stop_reason=message.stop_reason, model=message.model,
            request_id=getattr(message, "_request_id", None), usage=usage,
            refusal_category=getattr(details, "category", None) if details else None,
        )


llm = LLM()
