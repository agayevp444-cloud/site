"use client";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { PRIORITY_AZ, PRIORITY_COLOR, PROJECT_STATUS_AZ, TASK_STATUS_COLOR, fmtTime, fmtUsd } from "@/lib/status";
import { guarded, useOffice } from "@/lib/store";
import type { Task } from "@/lib/types";
import { Button, Markdown, Modal, Pill, inputCls } from "./common";

const COLUMNS: { key: string; title: string; match: (t: Task) => boolean }[] = [
  { key: "waiting", title: "Gözləyir", match: (t) => t.status === "pending" || t.status === "queued" },
  { key: "running", title: "İcrada", match: (t) => t.status === "running" },
  { key: "done", title: "Hazırdır", match: (t) => t.status === "completed" },
  { key: "stopped", title: "Uğursuz / dayandırılıb", match: (t) => t.status === "failed" || t.status === "cancelled" },
];

const PROJECT_COLOR: Record<string, string> = {
  planning: "#60a5fa", running: "#34d399", awaiting_approval: "#fbbf24", delivered: "#4ade80",
  failed: "#f87171", cancelled: "#6b7280", direct: "#a78bfa",
};

export function TaskBoard() {
  const projects = useOffice((s) => s.projects);
  const tasksMap = useOffice((s) => s.tasks);
  const employees = useOffice((s) => s.employees);
  const activeId = useOffice((s) => s.activeProject);
  const setActive = useOffice((s) => s.setActiveProject);
  const selectTask = useOffice((s) => s.selectTask);
  const usage = useOffice((s) => s.usage);
  const [showPackage, setShowPackage] = useState(false);
  const [feedback, setFeedback] = useState("");
  const project = activeId != null ? projects[activeId] : undefined;
  const tasks = useMemo(() => Object.values(tasksMap).filter((t) => t.project_id === activeId).sort((a, b) => a.id - b.id), [tasksMap, activeId]);
  const list = Object.values(projects).sort((a, b) => b.id - a.id);
  const done = tasks.filter((t) => t.status === "completed").length;
  const projCost = usage?.by_project.find((p) => p.project_id === activeId)?.cost_usd ?? tasks.reduce((s, t) => s + t.cost_usd, 0);

  return (
    <div className="panel flex h-full flex-col">
      <div className="space-y-2 border-b border-white/10 p-3">
        <div className="flex items-center gap-2">
          <select className={`${inputCls} !py-1.5 text-xs`} value={activeId ?? ""} onChange={(e) => setActive(e.target.value ? Number(e.target.value) : null)}>
            {list.length === 0 && <option value="">Hələ layihə yoxdur</option>}
            {list.map((p) => <option key={p.id} value={p.id}>#{p.id} {p.title}</option>)}
          </select>
        </div>
        {project && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Pill color={PROJECT_COLOR[project.status]}>{PROJECT_STATUS_AZ[project.status] ?? project.status}</Pill>
              <span className="text-white/50">{done}/{tasks.length} tapşırıq</span>
              <span className="text-white/50">· {fmtUsd(projCost)}</span>
              <span className="text-white/40">· {fmtTime(project.created_at)}</span>
            </div>
            {tasks.length > 0 && (
              <div className="h-1.5 overflow-hidden rounded bg-white/10">
                <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all" style={{ width: `${(done / tasks.length) * 100}%` }} />
              </div>
            )}
            {project.status === "planning" && <p className="text-[11px] text-sky-300">İcraçı Direktor başlanğıc iclasındadır, iş axınını planlaşdırır…</p>}
            {project.error && <p className="text-[11px] text-red-300">{project.error}</p>}
            {project.plan_summary && <p className="text-[11px] leading-snug text-white/60 line-clamp-4">{project.plan_summary}</p>}
            <div className="flex flex-wrap gap-2">
              {project.final_deliverable && (
                <Button small variant={project.status === "awaiting_approval" ? "primary" : "default"} onClick={() => setShowPackage(true)}>
                  {project.status === "awaiting_approval" ? "Yekun paketi yoxla" : "Yekun paketə bax"}
                </Button>
              )}
              {["planning", "running", "awaiting_approval"].includes(project.status) && (
                <Button small variant="ghost" onClick={() => confirm("Bu layihə ləğv edilsin və bütün tapşırıqları dayandırılsın?") && guarded(() => api.post(`/api/projects/${project.id}/cancel`))}>
                  Layihəni ləğv et
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {COLUMNS.map((col) => {
          const items = tasks.filter(col.match);
          if (!items.length && col.key === "stopped") return null;
          return (
            <div key={col.key}>
              <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-white/40">
                <span>{col.title}</span><span>{items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((t) => {
                  const who = t.assignee_id != null ? employees[t.assignee_id] : undefined;
                  return (
                    <button key={t.id} onClick={() => selectTask(t.id)}
                      className="w-full rounded-lg border border-white/5 bg-white/[0.04] p-2 text-left transition hover:border-amber-400/40 hover:bg-white/[0.07]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[12px] font-medium leading-tight text-white">{t.title}</div>
                        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: TASK_STATUS_COLOR[t.status] }} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-white/50">
                        {who && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: who.color }} />{who.name}</span>}
                        <Pill color={PRIORITY_COLOR[t.priority]}>{PRIORITY_AZ[t.priority]}</Pill>
                        {t.status === "queued" && <span className="text-amber-300">növbədə</span>}
                        {t.status === "pending" && t.depends_on.length > 0 && <span>gözləyir: #{t.depends_on.join(", #")}</span>}
                        {t.revision_count > 0 && <span className="text-amber-300">revizya {t.revision_count}</span>}
                        {t.approval === "pending" && <span className="text-sky-300">təsdiq gözləyir</span>}
                        {t.approval === "approved" && <span className="text-emerald-300">təsdiqləndi</span>}
                        {t.cost_usd > 0 && <span>{fmtUsd(t.cost_usd)}</span>}
                      </div>
                      {t.status === "running" && (
                        <div className="mt-1.5 h-1 overflow-hidden rounded bg-white/10">
                          <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.max(4, t.progress * 100)}%` }} />
                        </div>
                      )}
                    </button>
                  );
                })}
                {!items.length && <div className="text-[11px] text-white/25">—</div>}
              </div>
            </div>
          );
        })}
      </div>
      {showPackage && project?.final_deliverable && (
        <Modal wide title={`Yekun paket · ${project.title}`} onClose={() => setShowPackage(false)}>
          <Markdown>{project.final_deliverable}</Markdown>
          {project.status === "awaiting_approval" && (
            <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
              <textarea className={inputCls} rows={2} placeholder="Direktor üçün rəy (rədd etmək üçün mütləqdir)…" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="success" onClick={() => guarded(async () => { await api.post(`/api/projects/${project.id}/review`, { approve: true }); setShowPackage(false); })}>Təsdiqlə və təhvil al</Button>
                <Button variant="danger" disabled={!feedback.trim()} onClick={() => guarded(async () => {
                  await api.post(`/api/projects/${project.id}/review`, { approve: false, feedback }); setFeedback(""); setShowPackage(false);
                })}>Rədd et və dəyişiklik istə</Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
