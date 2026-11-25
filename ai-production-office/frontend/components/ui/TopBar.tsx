"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { STATUS_META, fmtTokens, fmtUsd } from "@/lib/status";
import { STUDIO_NAME } from "@/components/office/Furniture";
import { guarded, useOffice } from "@/lib/store";
import { Button, Field, Modal, inputCls } from "./common";

const EXAMPLES = [
  "Bakıda satışa çıxan premium soyuq dəmlənmiş kofe brendi üçün 30 saniyəlik kinematoqrafik reklam hazırlayın. Hədəf auditoriya: 25-35 yaşlı gənc mütəxəssislər. Konsepsiya, ssenari, kadr siyahısı, işıq, səs, montaj planı, rəng korreksiyası və sosial media təqdimat planı daxil olsun.",
  "Elektrik velosiped startapı üçün 60 saniyəlik brend filmi planlaşdırın. İsti, nikbin ton, şəhərdə qızıl saatda çəkiliş.",
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
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-sky-200 via-fuchsia-200 to-amber-200 text-sm font-black text-black">✦</div>
          <div className="leading-tight">
            <div className="text-sm font-black tracking-[0.2em] text-white">{STUDIO_NAME}<span className="ml-1.5 text-[10px] font-semibold tracking-normal text-white/50">Studio</span></div>
            <div className="text-[10px] text-white/40">{health?.model ?? "…"} · {connected ? "canlı" : "yenidən qoşulur…"}</div>
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
          <span className="rounded bg-red-500/20 px-2 py-1 text-[10px] font-semibold text-red-300">ANTHROPIC_API_KEY təyin edilməyib — agentlər xəta verəcək</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setModal("usage")} className="rounded-md bg-white/5 px-3 py-1 text-right hover:bg-white/10">
            <div className="text-[9px] uppercase tracking-wider text-white/40">API istifadəsi</div>
            <div className="text-xs font-semibold text-white">{fmtUsd(usage?.cost_usd ?? 0)} · {usage?.calls ?? 0} sorğu</div>
          </button>
          <Button onClick={() => setModal("hire")}>+ İşə götür</Button>
          <Button variant="primary" onClick={() => setModal("project")}>+ Yeni layihə</Button>
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
    <Modal title="İcraçı Direktor üçün yeni layihə" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        const r = await guarded(() => api.post("/api/projects", { description: desc, title: title || null }));
        setBusy(false); if (r) onClose();
      }}>
        <Field label="Layihənin adı (istəyə bağlı)"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Boş qalsa, adı Direktor verəcək" /></Field>
        <Field label="Brif"><textarea required minLength={5} rows={7} className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="Nə lazım olduğunu təsvir edin. İcraçı Direktor iş axınını planlaşdırıb komandaya paylayacaq." /></Field>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex, i) => <button type="button" key={i} onClick={() => setDesc(ex)} className="rounded bg-white/5 px-2 py-1 text-left text-[10px] text-white/60 hover:bg-white/10">Nümunə {i + 1}</button>)}
        </div>
        <p className="text-[11px] text-white/40">Hər agent real Claude API sorğuları göndərir; xərclər "API istifadəsi" bölməsində canlı görünür.</p>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? "Göndərilir…" : "İcraçı Direktora göndər"}</Button>
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
    <Modal title="Yeni AI işçi işə götür" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const r = await guarded(() => api.post("/api/employees", { ...f, system_prompt: f.system_prompt || null, tools: sel }));
        if (r) onClose();
      }}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Ad"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Rol / vəzifə"><input required className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="məs. Motion dizayner" /></Field>
          <Field label="Şöbə"><input className={inputCls} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>
          <Field label="Rəng"><input type="color" className="h-9 w-full rounded bg-transparent" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
        </div>
        <Field label="İş təsviri"><textarea required minLength={5} rows={3} className={inputCls} value={f.job_description} onChange={(e) => setF({ ...f, job_description: e.target.value })} /></Field>
        <Field label="Sistem promptu (istəyə bağlı — boş qalsa iş təsvirindən yaradılır)"><textarea rows={4} className={inputCls} value={f.system_prompt} onChange={(e) => setF({ ...f, system_prompt: e.target.value })} /></Field>
        <Field label="Alətlər">
          <div className="flex flex-wrap gap-1.5">
            {tools.map((t) => (
              <button type="button" key={t.name} title={t.description} onClick={() => setSel(sel.includes(t.name) ? sel.filter((x) => x !== t.name) : [...sel, t.name])}
                className={`rounded px-2 py-1 font-mono text-[10px] ${sel.includes(t.name) ? "bg-amber-500/30 text-amber-100" : "bg-white/5 text-white/40"}`}>
                {t.name}{!t.available && " (əlçatan deyil)"}
              </button>
            ))}
          </div>
        </Field>
        <Button type="submit" variant="primary">İşə götür</Button>
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
    <Modal wide title="API istifadəsi və tapşırıq xərcləri" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[["Ümumi xərc", fmtUsd(usage.cost_usd)], ["API sorğuları", usage.calls], ["Giriş tokenləri", fmtTokens(usage.input_tokens)], ["Çıxış tokenləri", fmtTokens(usage.output_tokens)],
          ["Keşdən oxuma", fmtTokens(usage.cache_read_tokens)], ["Keşə yazma", fmtTokens(usage.cache_write_tokens)], ["Veb axtarışları", usage.web_searches], ["Paralel agent limiti", useOffice.getState().health?.max_concurrent ?? "—"]]
          .map(([l, v]) => <div key={String(l)} className="rounded-lg bg-white/[0.04] p-2.5"><div className="text-[9px] uppercase tracking-wider text-white/40">{l}</div><div className="text-base font-semibold text-white">{v}</div></div>)}
      </div>
      <div className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-white/50">İşçilər üzrə</div>
      <div className="mt-2 space-y-1.5">
        {usage.by_employee.sort((a, b) => b.cost_usd - a.cost_usd).map((r) => {
          const e = r.employee_id != null ? employees[r.employee_id] : undefined;
          return (
            <div key={String(r.employee_id)} className="flex items-center gap-2 text-xs">
              <span className="w-40 truncate text-white/80">{e?.name ?? "Sistem"}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-white/5"><div className="h-full rounded" style={{ width: `${(r.cost_usd / maxEmp) * 100}%`, background: e?.color ?? "#9ca3af" }} /></div>
              <span className="w-20 text-right font-mono text-white/70">{fmtUsd(r.cost_usd)}</span>
              <span className="w-16 text-right text-white/40">{r.calls} sorğu</span>
            </div>
          );
        })}
        {usage.by_employee.length === 0 && <div className="text-xs text-white/40">Hələ API sorğusu yoxdur.</div>}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Layihələr üzrə</div>
          {usage.by_project.map((r) => <div key={String(r.project_id)} className="mt-1 flex justify-between text-xs text-white/70"><span className="truncate">{r.project_id != null ? projects[r.project_id]?.title ?? `#${r.project_id}` : "—"}</span><span className="font-mono">{fmtUsd(r.cost_usd)}</span></div>)}
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Modellər üzrə</div>
          {usage.by_model.map((r) => <div key={r.model} className="mt-1 flex justify-between text-xs text-white/70"><span className="font-mono">{r.model}</span><span className="font-mono">{fmtUsd(r.cost_usd)} · {r.calls}</span></div>)}
        </div>
      </div>
      <p className="mt-4 text-[10px] text-white/35">Xərclər hər sorğu üçün API-nin qaytardığı token sayı və backend/app/pricing.py faylındakı qiymət cədvəli əsasında hesablanır.</p>
    </Modal>
  );
}
