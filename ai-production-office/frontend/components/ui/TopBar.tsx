"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { STATUS_META, fmtTokens, fmtUsd } from "@/lib/status";
import { guarded, useOffice } from "@/lib/store";
import { Button, Field, Modal, inputCls } from "./common";

const EXAMPLES = [
  "Create a 30-second cinematic commercial for a premium cold-brew coffee brand launching in Baku. Target: young professionals 25-35. Include concept, script, shot list, lighting, sound, edit plan, colour grade and a launch social plan.",
  "Plan a 60-second brand film for an electric bicycle startup. Warm, optimistic tone, shot at golden hour in the city.",
];

export function TopBar() {
  const connected = useOffice((s) => s.connected);
  const health = useOffice((s) => s.health);
  const usage = useOffice((s) => s.usage);
  const employees = useOffice((s) => s.employees);
  const [modal, setModal] = useState<null | "project" | "hire" | "usage">(null);
  const counts = Object.values(employees).filter((e) => e.active).reduce<Record<string, number>>((acc, e) => {
    acc[e.presence.status] = (acc[e.presence.status] ?? 0) + 1; return acc; }, {});

  return (
    <>
      <div className="panel absolute left-3 right-3 top-3 z-40 flex items-center gap-3 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-orange-600 text-xs font-black text-black">AI</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">AI Production Office</div>
            <div className="text-[10px] text-white/40">{health?.model ?? "…"} · {connected ? "live" : "reconnecting…"}</div>
          </div>
          <span className={`ml-1 h-2 w-2 rounded-full ${connected ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-red-500"}`} />
        </div>
        <div className="hidden items-center gap-1.5 lg:flex">
          {Object.entries(counts).map(([s, n]) => (
            <span key={s} className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: STATUS_META[s as keyof typeof STATUS_META]?.color, background: STATUS_META[s as keyof typeof STATUS_META]?.bg }}>
              {n} {STATUS_META[s as keyof typeof STATUS_META]?.label}
            </span>
          ))}
        </div>
        {health && !health.api_key_configured && (
          <span className="rounded bg-red-500/20 px-2 py-1 text-[10px] font-semibold text-red-300">ANTHROPIC_API_KEY is not set — agents will report errors</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setModal("usage")} className="rounded-md bg-white/5 px-3 py-1 text-right hover:bg-white/10">
            <div className="text-[9px] uppercase tracking-wider text-white/40">API usage</div>
            <div className="text-xs font-semibold text-white">{fmtUsd(usage?.cost_usd ?? 0)} · {usage?.calls ?? 0} calls</div>
          </button>
          <Button onClick={() => setModal("hire")}>+ Hire</Button>
          <Button variant="primary" onClick={() => setModal("project")}>+ New project</Button>
        </div>
      </div>
      {modal === "project" && <NewProject onClose={() => setModal(null)} />}
      {modal === "hire" && <Hire onClose={() => setModal(null)} />}
      {modal === "usage" && <Usage onClose={() => setModal(null)} />}
    </>
  );
}

function NewProject({ onClose }: { onClose: () => void }) {
  const [desc, setDesc] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="New project for the Executive Director" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        const r = await guarded(() => api.post("/api/projects", { description: desc, title: title || null }));
        setBusy(false); if (r) onClose();
      }}>
        <Field label="Project title (optional)"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Director will name it if empty" /></Field>
        <Field label="Brief"><textarea required minLength={5} rows={7} className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="Describe what you need. The Executive Director will plan the workflow and assign the team." /></Field>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex, i) => <button type="button" key={i} onClick={() => setDesc(ex)} className="rounded bg-white/5 px-2 py-1 text-left text-[10px] text-white/60 hover:bg-white/10">Example {i + 1}</button>)}
        </div>
        <p className="text-[11px] text-white/40">Each agent makes real Claude API calls; costs appear live under API usage.</p>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? "Sending…" : "Send to Executive Director"}</Button>
      </form>
    </Modal>
  );
}

function Hire({ onClose }: { onClose: () => void }) {
  const tools = useOffice((s) => s.tools);
  const [f, setF] = useState({ name: "", title: "", department: "creative", job_description: "", system_prompt: "", color: "#7aa2f7" });
  const defaults = ["read_deliverable", "list_project_tasks", "send_message", "check_inbox", "consult_colleague", "save_note", "read_notes", "save_artifact", "submit_deliverable"];
  const [sel, setSel] = useState<string[]>(defaults);
  return (
    <Modal title="Hire a new AI employee" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const r = await guarded(() => api.post("/api/employees", { ...f, system_prompt: f.system_prompt || null, tools: sel }));
        if (r) onClose();
      }}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Role / title"><input required className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Motion Designer" /></Field>
          <Field label="Department"><input className={inputCls} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>
          <Field label="Colour"><input type="color" className="h-9 w-full rounded bg-transparent" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
        </div>
        <Field label="Job description"><textarea required minLength={5} rows={3} className={inputCls} value={f.job_description} onChange={(e) => setF({ ...f, job_description: e.target.value })} /></Field>
        <Field label="System prompt (optional — generated from the job description if empty)"><textarea rows={4} className={inputCls} value={f.system_prompt} onChange={(e) => setF({ ...f, system_prompt: e.target.value })} /></Field>
        <Field label="Tools">
          <div className="flex flex-wrap gap-1.5">
            {tools.map((t) => (
              <button type="button" key={t.name} title={t.description} onClick={() => setSel(sel.includes(t.name) ? sel.filter((x) => x !== t.name) : [...sel, t.name])}
                className={`rounded px-2 py-1 font-mono text-[10px] ${sel.includes(t.name) ? "bg-amber-500/30 text-amber-100" : "bg-white/5 text-white/40"}`}>
                {t.name}{!t.available && " (unavailable)"}
              </button>
            ))}
          </div>
        </Field>
        <Button type="submit" variant="primary">Hire</Button>
      </form>
    </Modal>
  );
}

function Usage({ onClose }: { onClose: () => void }) {
  const usage = useOffice((s) => s.usage);
  const employees = useOffice((s) => s.employees);
  const projects = useOffice((s) => s.projects);
  if (!usage) return null;
  const maxEmp = Math.max(0.000001, ...usage.by_employee.map((e) => e.cost_usd));
  return (
    <Modal wide title="API usage & task costs" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[["Total cost", fmtUsd(usage.cost_usd)], ["API calls", usage.calls], ["Input tokens", fmtTokens(usage.input_tokens)], ["Output tokens", fmtTokens(usage.output_tokens)],
          ["Cache reads", fmtTokens(usage.cache_read_tokens)], ["Cache writes", fmtTokens(usage.cache_write_tokens)], ["Web searches", usage.web_searches], ["Concurrency limit", useOffice.getState().health?.max_concurrent ?? "—"]]
          .map(([l, v]) => <div key={String(l)} className="rounded-lg bg-white/[0.04] p-2.5"><div className="text-[9px] uppercase tracking-wider text-white/40">{l}</div><div className="text-base font-semibold text-white">{v}</div></div>)}
      </div>
      <div className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-white/50">By employee</div>
      <div className="mt-2 space-y-1.5">
        {usage.by_employee.sort((a, b) => b.cost_usd - a.cost_usd).map((r) => {
          const e = r.employee_id != null ? employees[r.employee_id] : undefined;
          return (
            <div key={String(r.employee_id)} className="flex items-center gap-2 text-xs">
              <span className="w-40 truncate text-white/80">{e?.name ?? "System"}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-white/5"><div className="h-full rounded" style={{ width: `${(r.cost_usd / maxEmp) * 100}%`, background: e?.color ?? "#9ca3af" }} /></div>
              <span className="w-20 text-right font-mono text-white/70">{fmtUsd(r.cost_usd)}</span>
              <span className="w-16 text-right text-white/40">{r.calls} calls</span>
            </div>
          );
        })}
        {usage.by_employee.length === 0 && <div className="text-xs text-white/40">No API calls yet.</div>}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">By project</div>
          {usage.by_project.map((r) => <div key={String(r.project_id)} className="mt-1 flex justify-between text-xs text-white/70"><span className="truncate">{r.project_id != null ? projects[r.project_id]?.title ?? `#${r.project_id}` : "—"}</span><span className="font-mono">{fmtUsd(r.cost_usd)}</span></div>)}
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">By model</div>
          {usage.by_model.map((r) => <div key={r.model} className="mt-1 flex justify-between text-xs text-white/70"><span className="font-mono">{r.model}</span><span className="font-mono">{fmtUsd(r.cost_usd)} · {r.calls}</span></div>)}
        </div>
      </div>
      <p className="mt-4 text-[10px] text-white/35">Costs are computed per call from the token usage the API returns and the price table in backend/app/pricing.py.</p>
    </Modal>
  );
}
