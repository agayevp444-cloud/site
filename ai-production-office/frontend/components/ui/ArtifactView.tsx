"use client";
import { api } from "@/lib/api";
import type { Artifact } from "@/lib/types";
import { Markdown } from "./common";

export function ArtifactView({ a }: { a: Artifact }) {
  const d = a.data ?? {};
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-white">{a.title}</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-white/40">{a.kind.replace("_", " ")}</span>
          {a.file && (
            <a href={api.fileUrl(a.file)} className="text-[10px] font-semibold text-amber-300 hover:underline" download>
              Download file
            </a>
          )}
        </div>
      </div>
      {d.colors && (
        <div className="flex flex-wrap gap-2">
          {d.colors.map((c, i) => (
            <div key={i} className="w-20">
              <div className="h-12 rounded-md ring-1 ring-white/10" style={{ background: c.hex }} />
              <div className="mt-1 text-[10px] font-mono text-white/80">{c.hex}</div>
              {c.name && <div className="text-[10px] text-white/50 leading-tight">{c.name}</div>}
            </div>
          ))}
        </div>
      )}
      {Array.isArray(d.columns) && Array.isArray(d.rows) && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr>{d.columns.map((c, i) => <th key={i} className="border-b border-white/10 px-2 py-1 font-semibold text-white/70">{String(c)}</th>)}</tr>
            </thead>
            <tbody>
              {d.rows.map((r, i) => (
                <tr key={i} className="odd:bg-white/[0.03]">
                  {(Array.isArray(r) ? r : [r]).map((c, j) => <td key={j} className="px-2 py-1 align-top text-white/80">{typeof c === "object" ? JSON.stringify(c) : String(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {typeof d.text === "string" && <Markdown>{d.text}</Markdown>}
      {a.kind === "file" && d.path && <div className="text-[11px] font-mono text-white/60">{String(d.path)}</div>}
    </div>
  );
}
