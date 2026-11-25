"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtTime } from "@/lib/status";
import { useOffice } from "@/lib/store";

const KIND_STYLE: Record<string, { icon: string; color: string }> = {
  handoff: { icon: "📦", color: "#fbbf24" }, message: { icon: "💬", color: "#93c5fd" },
  question: { icon: "❓", color: "#60a5fa" }, answer: { icon: "💡", color: "#60a5fa" },
  revision: { icon: "↩︎", color: "#fb923c" }, approval: { icon: "✓", color: "#4ade80" },
  assignment: { icon: "📋", color: "#c4b5fd" },
  status: { icon: "•", color: "#9ca3af" }, thinking: { icon: "🧠", color: "#a78bfa" },
  tool: { icon: "🛠", color: "#67e8f9" }, error: { icon: "⚠", color: "#f87171" },
  owner: { icon: "👤", color: "#fde68a" }, system: { icon: "⚙", color: "#9ca3af" },
};

export function ActivityFeed() {
  const [tab, setTab] = useState<"comms" | "logs">("comms");
  const messages = useOffice((s) => s.messages);
  const logs = useOffice((s) => s.logs);
  const employees = useOffice((s) => s.employees);
  const select = useOffice((s) => s.select);
  const selectTask = useOffice((s) => s.selectTask);
  const end = useRef<HTMLDivElement>(null);
  const name = (id: number | null) => (id == null ? "Sahib" : employees[id]?.name ?? `#${id}`);

  const items = useMemo(() => (tab === "comms"
    ? messages.slice(-200).map((m) => ({ id: `m${m.id}`, at: m.created_at, kind: m.kind, task: m.task_id,
        head: <><b className="cursor-pointer hover:underline" onClick={() => m.from_id != null && select(m.from_id)}>{name(m.from_id)}</b>
          <span className="text-white/40"> → </span>
          <b className="cursor-pointer hover:underline" onClick={() => m.to_id != null && select(m.to_id)}>{name(m.to_id)}</b></>,
        body: m.content }))
    : logs.slice(-250).map((l) => ({ id: `l${l.id}`, at: l.created_at, kind: l.kind, task: l.task_id,
        head: <b className="cursor-pointer hover:underline" onClick={() => l.employee_id != null && select(l.employee_id)}>{l.employee_id != null ? name(l.employee_id) : "Studiya"}</b>,
        body: l.text }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [tab, messages, logs, employees]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [items.length, tab]);

  return (
    <div className="panel flex h-full flex-col">
      <div className="flex border-b border-white/10 text-[11px] font-semibold uppercase tracking-wider">
        {(["comms", "logs"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 transition ${tab === t ? "text-amber-300 border-b-2 border-amber-400" : "text-white/50 hover:text-white"}`}>
            {t === "comms" ? `Ünsiyyət (${messages.length})` : `Agent jurnalı (${logs.length})`}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {items.length === 0 && <div className="p-4 text-center text-xs text-white/30">Hələ heç nə yoxdur. Komandanı işə salmaq üçün layihə yaradın.</div>}
        {items.map((it) => {
          const st = KIND_STYLE[it.kind] ?? KIND_STYLE.system;
          return (
            <div key={it.id} className="rounded-md bg-white/[0.03] px-2 py-1.5 text-[11px] leading-snug">
              <div className="flex items-center gap-1.5 text-white/90">
                <span style={{ color: st.color }}>{st.icon}</span>
                <span className="truncate">{it.head}</span>
                <span className="ml-auto shrink-0 text-[9px] text-white/30">{fmtTime(it.at)}</span>
              </div>
              <div className="mt-0.5 whitespace-pre-wrap break-words text-white/60 line-clamp-4">{it.body}</div>
              {it.task != null && (
                <button onClick={() => selectTask(it.task!)} className="mt-0.5 text-[9px] text-amber-300/70 hover:text-amber-300">tapşırıq #{it.task}</button>
              )}
            </div>
          );
        })}
        <div ref={end} />
      </div>
    </div>
  );
}
