"use client";
import { STATUS_META } from "@/lib/status";
import { useOffice } from "@/lib/store";

export function Roster() {
  const employees = useOffice((s) => s.employees);
  const selected = useOffice((s) => s.selectedEmployee);
  const select = useOffice((s) => s.select);
  const list = Object.values(employees).sort((a, b) => a.desk - b.desk);
  return (
    <div className="panel pointer-events-auto flex gap-1.5 overflow-x-auto p-1.5">
      {list.map((e) => {
        const m = STATUS_META[e.presence.status];
        return (
          <button key={e.id} onClick={() => select(e.id)} title={e.presence.detail || e.title}
            className={`flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-left transition ${selected === e.id ? "bg-amber-500/20 ring-1 ring-amber-400/50" : "hover:bg-white/10"} ${e.active ? "" : "opacity-40"}`}>
            <span className="h-6 w-6 rounded-full text-[9px] font-bold leading-6 text-center text-black" style={{ background: e.color }}>
              {e.name.split(" ").map((s) => s[0]).join("")}
            </span>
            <span className="leading-tight">
              <span className="block text-[10px] font-semibold text-white">{e.name.split(" ")[0]}</span>
              <span className="block text-[9px] font-bold tracking-wider" style={{ color: m.color }}>{m.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
