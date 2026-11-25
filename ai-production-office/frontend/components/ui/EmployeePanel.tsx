"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PRIORITY_AZ, PRIORITY_COLOR, TASK_STATUS_AZ, TASK_STATUS_COLOR, fmtTime, fmtUsd } from "@/lib/status";
import { guarded, useOffice } from "@/lib/store";
import type { Employee, LogEntry, Message, Task } from "@/lib/types";
import { ArtifactView } from "./ArtifactView";
import { Button, Field, Markdown, Pill, StatusBadge, inputCls } from "./common";

interface History {
  employee: Employee; tasks: Task[]; messages: Message[]; logs: LogEntry[];
  notes: { key: string; value: string; project_id: number }[];
  metrics: { tasks_total: number; tasks_completed: number; tasks_failed: number; revisions: number; avg_duration_s: number | null; cost_usd: number };
}

type Tab = "overview" | "tasks" | "work" | "messages" | "logs" | "assign" | "profile";
const TAB_AZ: Record<Tab, string> = { overview: "ümumi", tasks: "tapşırıqlar", work: "nəticələr", messages: "mesajlar", logs: "jurnal", assign: "tapşırıq ver", profile: "profil" };

export function EmployeePanel() {
  const id = useOffice((s) => s.selectedEmployee);
  const emp = useOffice((s) => (id != null ? s.employees[id] : undefined));
  const employees = useOffice((s) => s.employees);
  const projects = useOffice((s) => s.projects);
  const allTasks = useOffice((s) => s.tasks);
  const liveMsgs = useOffice((s) => s.messages);
  const liveLogs = useOffice((s) => s.logs);
  const stream = useOffice((s) => (id != null ? s.streams[id] : undefined));
  const tools = useOffice((s) => s.tools);
  const select = useOffice((s) => s.select);
  const selectTask = useOffice((s) => s.selectTask);
  const [tab, setTab] = useState<Tab>("overview");
  const [hist, setHist] = useState<History | null>(null);

  useEffect(() => {
    setHist(null);
    if (id == null) return;
    api.get<History>(`/api/employees/${id}/history`).then(setHist).catch(() => {});
  }, [id]);

  if (!emp) return null;
  const p = emp.presence;
  const myTasks = Object.values(allTasks).filter((t) => t.assignee_id === emp.id).sort((a, b) => b.id - a.id);
  const current = p.task_id != null ? allTasks[p.task_id] : myTasks.find((t) => t.status === "running");
  const project = current ? projects[current.project_id] : undefined;
  const msgs = liveMsgs.filter((m) => m.from_id === emp.id || m.to_id === emp.id).slice(-80).reverse();
  const merged = [...(hist?.messages ?? []), ...msgs].reduce<Message[]>((acc, m) => (acc.some((x) => x.id === m.id) ? acc : [...acc, m]), [])
    .sort((a, b) => b.id - a.id);
  const logs = [...(hist?.logs ?? []), ...liveLogs.filter((l) => l.employee_id === emp.id)]
    .reduce<LogEntry[]>((acc, l) => (acc.some((x) => x.id === l.id) ? acc : [...acc, l]), []).sort((a, b) => b.id - a.id);
  const done = myTasks.filter((t) => t.status === "completed");
  const name = (i: number | null) => (i == null ? "Sahib" : employees[i]?.name ?? `#${i}`);

  return (
    <div className="panel absolute right-3 top-16 bottom-20 z-30 flex w-[440px] max-w-[calc(100vw-1.5rem)] flex-col">
      <div className="flex items-start gap-3 border-b border-white/10 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-black" style={{ background: emp.color }}>
          {emp.name.split(" ").map((s) => s[0]).join("")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{emp.name}</div>
          <div className="text-xs text-white/60">{emp.title} · {emp.department}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2"><StatusBadge status={p.status} />
            {p.detail && <span className="text-[10px] text-white/50 line-clamp-1">{p.detail}</span>}</div>
        </div>
        <button onClick={() => select(null)} className="text-lg leading-none text-white/50 hover:text-white">×</button>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-2">
        {emp.paused
          ? <Button small variant="success" onClick={() => guarded(() => api.post(`/api/employees/${emp.id}/resume`))}>Agenti davam etdir</Button>
          : <Button small onClick={() => guarded(() => api.post(`/api/employees/${emp.id}/pause`))}>Agenti dayandır</Button>}
        {current?.status === "running" && <Button small variant="danger" onClick={() => guarded(() => api.post(`/api/tasks/${current.id}/stop`))}>Cari tapşırığı dayandır</Button>}
        {emp.last_error && <Button small variant="ghost" onClick={() => guarded(() => api.post(`/api/employees/${emp.id}/clear-error`))}>Xətanı təmizlə</Button>}
      </div>
      <div className="flex overflow-x-auto border-b border-white/10 text-[10px] font-semibold uppercase tracking-wider">
        {(["overview", "tasks", "work", "messages", "logs", "assign", "profile"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-2 whitespace-nowrap ${tab === t ? "text-amber-300 border-b-2 border-amber-400" : "text-white/50 hover:text-white"}`}>{TAB_AZ[t]}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-xs">
        {tab === "overview" && (
          <div className="space-y-4">
            <div>
              <div className="label">Cari tapşırıq</div>
              {current ? (
                <button onClick={() => selectTask(current.id)} className="mt-1 w-full rounded-lg bg-white/[0.04] p-2.5 text-left hover:bg-white/[0.07]">
                  <div className="font-medium text-white">{current.title}</div>
                  <div className="mt-1 text-[10px] text-white/50">Layihə: {project?.title ?? "—"} · <span style={{ color: TASK_STATUS_COLOR[current.status] }}>{TASK_STATUS_AZ[current.status]}</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-white/10"><div className="h-full bg-emerald-400" style={{ width: `${Math.round(current.progress * 100)}%` }} /></div>
                  <div className="mt-1 text-[10px] text-white/40">{Math.round(current.progress * 100)}% · başladı {fmtTime(current.started_at)}</div>
                </button>
              ) : <div className="mt-1 text-white/40">Aktiv tapşırıq yoxdur.</div>}
            </div>
            {stream && Date.now() - stream.at < 15000 && (
              <div>
                <div className="label">Canlı çıxış</div>
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg bg-black/50 p-2 font-mono text-[10px] text-emerald-200/90 whitespace-pre-wrap">{stream.text}</div>
              </div>
            )}
            {emp.last_error && <div className="rounded-lg bg-red-500/10 p-2 text-red-300"><b>Son xəta:</b> {emp.last_error}</div>}
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Tamamlanıb" value={hist?.metrics.tasks_completed ?? done.length} />
              <Metric label="Uğursuz" value={hist?.metrics.tasks_failed ?? myTasks.filter((t) => t.status === "failed").length} />
              <Metric label="Revizyalar" value={hist?.metrics.revisions ?? myTasks.reduce((s, t) => s + t.revision_count, 0)} />
              <Metric label="Orta müddət" value={hist?.metrics.avg_duration_s != null ? `${Math.round(hist.metrics.avg_duration_s)}s` : "—"} />
              <Metric label="API xərci" value={fmtUsd(myTasks.reduce((s, t) => s + t.cost_usd, 0))} />
              <Metric label="Alətlər" value={emp.tools.length} />
            </div>
            <div><div className="label">İş təsviri</div><p className="mt-1 text-white/70">{emp.job_description}</p></div>
            {hist && hist.notes.length > 0 && (
              <div><div className="label">İş yaddaşı</div>
                {hist.notes.map((n, i) => <div key={i} className="mt-1 text-white/70"><b className="text-white/90">{n.key}:</b> {n.value}</div>)}</div>
            )}
          </div>
        )}
        {tab === "tasks" && (
          <div className="space-y-1.5">
            {myTasks.length === 0 && <div className="text-white/40">Hələ tapşırıq tarixçəsi yoxdur.</div>}
            {myTasks.map((t) => (
              <button key={t.id} onClick={() => selectTask(t.id)} className="w-full rounded-lg bg-white/[0.04] p-2 text-left hover:bg-white/[0.07]">
                <div className="flex items-center justify-between gap-2"><span className="font-medium text-white">#{t.id} {t.title}</span>
                  <Pill color={TASK_STATUS_COLOR[t.status]}>{TASK_STATUS_AZ[t.status]}</Pill></div>
                <div className="mt-1 text-[10px] text-white/45">{projects[t.project_id]?.title} · <span style={{ color: PRIORITY_COLOR[t.priority] }}>{PRIORITY_AZ[t.priority]}</span> · {fmtTime(t.started_at)} → {fmtTime(t.completed_at)} · {fmtUsd(t.cost_usd)}</div>
              </button>
            ))}
          </div>
        )}
        {tab === "work" && (
          <div className="space-y-4">
            {done.length === 0 && <div className="text-white/40">Hələ tamamlanmış iş yoxdur.</div>}
            {done.map((t) => (
              <div key={t.id} className="space-y-2 rounded-lg border border-white/10 p-3">
                <button onClick={() => selectTask(t.id)} className="text-left text-sm font-semibold text-amber-200 hover:underline">#{t.id} {t.title}</button>
                {t.summary && <p className="text-white/60 italic">{t.summary}</p>}
                {t.artifacts.map((a, i) => <ArtifactView key={i} a={a} />)}
                <details><summary className="cursor-pointer text-white/50">Tam nəticə</summary><div className="mt-2"><Markdown>{t.deliverable ?? ""}</Markdown></div></details>
              </div>
            ))}
          </div>
        )}
        {tab === "messages" && (
          <div className="space-y-1.5">
            <OwnerMessage id={emp.id} />
            {merged.length === 0 && <div className="text-white/40">Hələ mesaj yoxdur.</div>}
            {merged.map((m) => (
              <div key={m.id} className="rounded-md bg-white/[0.04] p-2">
                <div className="flex justify-between text-[10px] text-white/50"><span><b className="text-white/80">{name(m.from_id)}</b> → <b className="text-white/80">{name(m.to_id)}</b> · {m.kind}</span><span>{fmtTime(m.created_at)}</span></div>
                <div className="mt-1 whitespace-pre-wrap text-white/75">{m.content}</div>
              </div>
            ))}
          </div>
        )}
        {tab === "logs" && (
          <div className="space-y-1 font-mono text-[10px]">
            {logs.length === 0 && <div className="text-white/40">Hələ fəaliyyət yoxdur.</div>}
            {logs.map((l) => (
              <div key={l.id} className={`rounded px-2 py-1 ${l.kind === "error" ? "bg-red-500/10 text-red-300" : l.kind === "thinking" ? "bg-violet-500/10 text-violet-200" : "bg-white/[0.03] text-white/70"}`}>
                <span className="text-white/35">{fmtTime(l.created_at)} [{l.kind}]</span> <span className="whitespace-pre-wrap">{l.text}</span>
              </div>
            ))}
          </div>
        )}
        {tab === "assign" && <AssignForm emp={emp} />}
        {tab === "profile" && <ProfileForm emp={emp} toolNames={tools.map((t) => t.name)} />}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-lg bg-white/[0.04] p-2"><div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div><div className="text-sm font-semibold text-white">{value}</div></div>;
}

function OwnerMessage({ id }: { id: number }) {
  const [text, setText] = useState("");
  return (
    <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return;
      guarded(async () => { await api.post(`/api/employees/${id}/message`, { content: text }); setText(""); }); }}>
      <input className={inputCls} placeholder="Bu işçiyə mesaj yazın (növbəti tapşırıqda oxuyacaq)…" value={text} onChange={(e) => setText(e.target.value)} />
      <Button type="submit" variant="primary">Göndər</Button>
    </form>
  );
}

function AssignForm({ emp }: { emp: Employee }) {
  const projects = useOffice((s) => s.projects);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState("medium");
  const [project, setProject] = useState<number | "">("");
  const open = Object.values(projects).filter((p) => ["running", "awaiting_approval", "delivered"].includes(p.status));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault();
      guarded(async () => {
        await api.post(`/api/employees/${emp.id}/tasks`, { title, description: desc, priority, project_id: project === "" ? null : project });
        setTitle(""); setDesc("");
        useOffice.getState().setToast(`${emp.name} üçün tapşırıq verildi`);
      }); }}>
      <p className="text-white/50">{emp.name} üçün birbaşa tapşırıq verin. İşçi boşalan kimi icra olunacaq.</p>
      <Field label="Başlıq"><input required className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="məs. Üç şüar variantı yaz" /></Field>
      <Field label="Təlimat"><textarea rows={5} className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Prioritet">
          <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {["low", "medium", "high", "critical"].map((p) => <option key={p} value={p}>{PRIORITY_AZ[p]}</option>)}
          </select>
        </Field>
        <Field label="Layihə">
          <select className={inputCls} value={project} onChange={(e) => setProject(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Birbaşa tapşırıq</option>
            {open.map((p) => <option key={p.id} value={p.id}>#{p.id} {p.title}</option>)}
          </select>
        </Field>
      </div>
      <Button type="submit" variant="primary">Tapşırıq ver</Button>
    </form>
  );
}

function ProfileForm({ emp, toolNames }: { emp: Employee; toolNames: string[] }) {
  const [f, setF] = useState({ name: emp.name, title: emp.title, department: emp.department, job_description: emp.job_description, system_prompt: emp.system_prompt, color: emp.color });
  const [tools, setTools] = useState<string[]>(emp.tools);
  useEffect(() => { setF({ name: emp.name, title: emp.title, department: emp.department, job_description: emp.job_description, system_prompt: emp.system_prompt, color: emp.color }); setTools(emp.tools); }, [emp.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault();
      guarded(async () => { await api.patch(`/api/employees/${emp.id}`, { ...f, tools }); useOffice.getState().setToast("Profil yadda saxlanıldı"); }); }}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Ad"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Rol / vəzifə"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Şöbə"><input className={inputCls} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>
        <Field label="Rəng"><input type="color" className="h-9 w-full rounded bg-transparent" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
      </div>
      <Field label="İş təsviri"><textarea rows={3} className={inputCls} value={f.job_description} onChange={(e) => setF({ ...f, job_description: e.target.value })} /></Field>
      <Field label="Sistem promptu"><textarea rows={8} className={`${inputCls} font-mono text-[11px]`} value={f.system_prompt} onChange={(e) => setF({ ...f, system_prompt: e.target.value })} /></Field>
      <Field label="Alətlər">
        <div className="flex flex-wrap gap-1.5">
          {toolNames.map((t) => (
            <button type="button" key={t} onClick={() => setTools(tools.includes(t) ? tools.filter((x) => x !== t) : [...tools, t])}
              className={`rounded px-2 py-1 font-mono text-[10px] ${tools.includes(t) ? "bg-amber-500/30 text-amber-100" : "bg-white/5 text-white/40"}`}>{t}</button>
          ))}
        </div>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary">Profili saxla</Button>
        {!emp.is_director && (
          <Button variant="ghost" onClick={() => confirm(`${emp.name} ${emp.active ? "deaktiv edilsin" : "yenidən aktiv edilsin"}?`) &&
            guarded(() => api.patch(`/api/employees/${emp.id}`, { active: !emp.active }))}>{emp.active ? "Deaktiv et" : "Aktiv et"}</Button>
        )}
      </div>
    </form>
  );
}
