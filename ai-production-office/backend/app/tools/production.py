"""Production tools that create real files: LUTs, media probing and processing via ffmpeg, web search."""
from __future__ import annotations

import asyncio
import json
import math
import re
import shutil
from pathlib import Path
from typing import Any

from ..config import settings
from .registry import ToolContext, register_server_tool, tool

MEDIA_EXT = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi", ".wav", ".mp3", ".aac", ".m4a", ".png", ".jpg", ".jpeg"}


def workspace() -> Path:
    p = settings.workspace_dir
    (p / "media").mkdir(parents=True, exist_ok=True)
    (p / "output").mkdir(parents=True, exist_ok=True)
    return p


def _safe(rel: str) -> Path:
    root = workspace().resolve()
    p = (root / rel).resolve()
    if root not in p.parents and p != root:
        raise ValueError("Path must stay inside the workspace.")
    return p


def _ffmpeg_ok() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


# --- Web research (Anthropic server tool) ----------------------------------------------------
register_server_tool(
    "web_search",
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 8},
    "Anthropic-hosted web search with citations (server tool).",
    available=lambda: settings.enable_web_search,
)


# --- Colour: real 3D LUT generation ----------------------------------------------------------

def _grade(r: float, g: float, b: float, p: dict[str, float]) -> tuple[float, float, float]:
    # white balance (temperature/tint), lift/gamma/gain, contrast around mid-grey, saturation, split-tone.
    t, ti = p.get("temperature", 0.0), p.get("tint", 0.0)
    r, g, b = r * (1 + 0.1 * t), g * (1 + 0.05 * ti), b * (1 - 0.1 * t)
    out = []
    for c, ch in zip((r, g, b), "rgb"):
        lift = p.get("lift", 0.0) + p.get(f"lift_{ch}", 0.0)
        gain = p.get("gain", 1.0) * (1 + p.get(f"gain_{ch}", 0.0))
        gamma = max(0.1, p.get("gamma", 1.0) + p.get(f"gamma_{ch}", 0.0))
        c = c * gain + lift * (1 - c)
        c = max(0.0, c) ** (1 / gamma)
        c = (c - 0.5) * p.get("contrast", 1.0) + 0.5
        out.append(c)
    r, g, b = out
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = p.get("saturation", 1.0)
    r, g, b = (luma + (r - luma) * sat, luma + (g - luma) * sat, luma + (b - luma) * sat)
    # split toning: shadows/highlights hue push
    for key, weight in (("shadow", 1 - luma), ("highlight", luma)):
        hue = p.get(f"{key}_hue")
        amt = p.get(f"{key}_amount", 0.0)
        if hue is not None and amt:
            h = math.radians(hue)
            r += amt * weight * math.cos(h)
            g += amt * weight * math.cos(h - 2.094)
            b += amt * weight * math.cos(h + 2.094)
    return tuple(min(1.0, max(0.0, v)) for v in (r, g, b))  # type: ignore[return-value]


@tool("generate_lut", "Generate a real .cube 3D LUT implementing a grade and save it to the workspace "
      "(usable in DaVinci Resolve, Premiere, FCP, ffmpeg). Parameters are optional floats: temperature (-1..1), "
      "tint (-1..1), lift (-0.2..0.2), gamma (0.5..2), gain (0.5..1.5), contrast (0.5..1.8), saturation (0..2), "
      "per-channel lift_r/g/b, gamma_r/g/b, gain_r/g/b, shadow_hue/highlight_hue (degrees) with "
      "shadow_amount/highlight_amount (0..0.2).",
      {"name": {"type": "string", "description": "File name without extension."},
       "parameters": {"type": "object"}, "size": {"type": "integer", "description": "Grid size, 17 or 33."}},
      ["name", "parameters"], category="color")
async def generate_lut(ctx: ToolContext, data: dict[str, Any]) -> Any:
    params = {k: float(v) for k, v in (data.get("parameters") or {}).items() if isinstance(v, (int, float))}
    size = 33 if data.get("size") not in (17, 33) else int(data["size"])
    name = re.sub(r"[^A-Za-z0-9_-]+", "_", data["name"])[:60] or "look"
    path = workspace() / "output" / f"project{ctx.project_id}_{name}.cube"
    lines = [f'TITLE "{name}"', f"LUT_3D_SIZE {size}", "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"]
    for bi in range(size):
        for gi in range(size):
            for ri in range(size):
                r, g, b = _grade(ri / (size - 1), gi / (size - 1), bi / (size - 1), params)
                lines.append(f"{r:.6f} {g:.6f} {b:.6f}")
    # .cube ordering: red changes fastest -> loops are b, g, r (outer to inner), as written above.
    await asyncio.to_thread(path.write_text, "\n".join(lines) + "\n")
    swatches = []
    for name_, rgb in (("shadows", (0.15, 0.15, 0.15)), ("midtones", (0.5, 0.5, 0.5)), ("highlights", (0.85, 0.85, 0.85)),
                       ("skin", (0.78, 0.57, 0.45)), ("sky", (0.45, 0.62, 0.85)), ("foliage", (0.35, 0.55, 0.3))):
        o = _grade(*rgb, params)
        swatches.append({"name": f"{name_} (graded)", "hex": "#%02x%02x%02x" % tuple(int(v * 255) for v in o), "role": "LUT preview"})
    ctx.state.setdefault("artifacts", []).append(
        {"kind": "palette", "title": f"LUT preview: {name}", "data": {"colors": swatches}, "by": ctx.employee_id,
         "file": str(path.relative_to(workspace()))})
    ctx.state.setdefault("files", []).append(str(path.relative_to(workspace())))
    return {"saved": str(path.relative_to(workspace())), "size": size, "parameters": params,
            "preview_after_grade": swatches}


# --- Media (ffmpeg) -------------------------------------------------------------------------

@tool("media_list", "List media files available in the workspace (workspace/media and workspace/output).", {},
      category="media")
async def media_list(ctx: ToolContext, _: dict[str, Any]) -> Any:
    root = workspace()
    files = [str(p.relative_to(root)) for p in sorted(root.rglob("*")) if p.suffix.lower() in MEDIA_EXT or p.suffix == ".cube"]
    return {"files": files, "ffmpeg_available": _ffmpeg_ok(),
            "hint": "The owner can drop footage into the workspace/media folder."}


@tool("media_probe", "Inspect a media file with ffprobe (duration, codecs, resolution, frame rate).",
      {"path": {"type": "string", "description": "Path relative to the workspace, e.g. media/clip.mp4"}},
      ["path"], category="media", available=_ffmpeg_ok)
async def media_probe(ctx: ToolContext, data: dict[str, Any]) -> Any:
    p = _safe(data["path"])
    if not p.exists():
        return f"File not found: {data['path']}"
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(p),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await proc.communicate()
    if proc.returncode != 0:
        return f"ffprobe failed: {err.decode()[:500]}"
    info = json.loads(out or b"{}")
    return {"format": {k: info.get("format", {}).get(k) for k in ("duration", "size", "bit_rate", "format_name")},
            "streams": [{k: s_.get(k) for k in ("codec_type", "codec_name", "width", "height", "r_frame_rate",
                                                 "sample_rate", "channels")} for s_ in info.get("streams", [])]}


OPERATIONS = ["trim", "apply_lut", "color_adjust", "concat", "scale", "thumbnail", "loudnorm"]


@tool("media_process", "Process media with ffmpeg. Operations: trim {input,start,duration}; apply_lut {input,lut}; "
      "color_adjust {input,contrast,saturation,brightness,gamma}; concat {inputs:[...]}; scale {input,width,height}; "
      "thumbnail {input,time}; loudnorm {input,target_lufs}. Output is written to workspace/output.",
      {"operation": {"type": "string", "enum": OPERATIONS}, "params": {"type": "object"},
       "output_name": {"type": "string"}}, ["operation", "params", "output_name"], category="media",
      available=_ffmpeg_ok)
async def media_process(ctx: ToolContext, data: dict[str, Any]) -> Any:
    op, prm = data["operation"], data["params"]
    name = re.sub(r"[^A-Za-z0-9_.-]+", "_", data["output_name"])[:80]
    out = workspace() / "output" / name
    try:
        if op == "concat":
            inputs = [_safe(i) for i in prm.get("inputs", [])]
            if len(inputs) < 2:
                return "concat needs at least 2 inputs"
            listfile = workspace() / "output" / f".concat_{ctx.task_id}.txt"
            listfile.write_text("".join(f"file '{i}'\n" for i in inputs))
            args = ["-f", "concat", "-safe", "0", "-i", str(listfile), "-c", "copy"]
        else:
            src = _safe(prm.get("input", ""))
            if not src.exists():
                return f"Input not found: {prm.get('input')}"
            args = ["-i", str(src)]
            if op == "trim":
                args = ["-ss", str(float(prm.get("start", 0))), *args, "-t", str(float(prm.get("duration", 5)))]
            elif op == "apply_lut":
                lut = _safe(prm.get("lut", ""))
                if not lut.exists():
                    return f"LUT not found: {prm.get('lut')}"
                args += ["-vf", f"lut3d=file='{lut}'"]
            elif op == "color_adjust":
                eq = ":".join(f"{k}={float(prm[k])}" for k in ("contrast", "saturation", "brightness", "gamma") if k in prm)
                args += ["-vf", f"eq={eq or 'contrast=1'}"]
            elif op == "scale":
                args += ["-vf", f"scale={int(prm.get('width', -2))}:{int(prm.get('height', -2))}"]
            elif op == "thumbnail":
                args = ["-ss", str(float(prm.get("time", 1))), *args, "-frames:v", "1"]
            elif op == "loudnorm":
                args += ["-af", f"loudnorm=I={float(prm.get('target_lufs', -14))}"]
    except (ValueError, TypeError) as e:
        return f"Invalid parameters: {e}"
    proc = await asyncio.create_subprocess_exec("ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args, str(out),
                                                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    _, err = await proc.communicate()
    if proc.returncode != 0:
        return f"ffmpeg failed: {err.decode()[:800]}"
    rel = str(out.relative_to(workspace()))
    ctx.state.setdefault("files", []).append(rel)
    return {"output": rel, "bytes": out.stat().st_size}
