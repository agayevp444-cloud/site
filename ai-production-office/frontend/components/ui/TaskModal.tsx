"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { PRIORITY_COLOR, TASK_STATUS_COLOR, fmtTime, fmtTokens, fmtUsd } from "@/lib/status";
import { guarded, useOffice } from "@/lib/store";
import { ArtifactView } from "./ArtifactView";
import { Button, Markdown, Modal, Pill, inputCls } from "./common";

export function TaskModal() {
  const id = useOffice((s) => s.selectedTask);
  const task = useOffice((s) => (id != null ? s.tasks[id] : undefined));
  const tasks = useOffice((s) => s.tasks);
  const employees = useOffice((s) => s.employees);
  const selectTask = useOffice((s) => s.selectTask);
  const [feedback, setFeedback] = useState("");
  const [reassignTo, setReassignTo] = useState<number | "">("");
  if (!task) return null;
  const who = task.assignee_id != null ? employees[task.assignee_id] : undefined;
  const close = () => { selectTask(null); setFeedback(""); };
  const canStop = ["pending", "queued", "running"].includes(task.status);
  const canRetry = ["failed", "cancelled"].includes(task.status);
  const canReview = task.status === "completed" && task.kind !== "review";

  return (
    <Modal wide onClose={close} title={<span>Task #{task.id} · {task.title}</span>}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-4">
        <Info label="Assigned to">{who ? `${who.name} (${who.title})` : "—"}</Info>
        <Info label="Status"><Pill color={TASK_STATUS_COLOR[task.status]}>{task.status}</Pill></Info>
        <Info label="Priority"><Pill color={PRIORITY_COLOR[task.priority]}>{task.priority}</Pill></Info>
        <Info label="Owner approval">{task.approval}</Info>
        <Info label="Started">{fmtTime(task.started_at)}</Info>
        <Info label="Completed">{fmtTime(task.completed_at)}</Info>
        <Info label="Tokens in / out">{fmtTokens(task.input_tokens)} / {fmtTokens(task.output_tokens)}</Info>
        <Info label="Cost">{fmtUsd(task.cost_usd)}</Info>
        <Info label="Revisions">{task.revision_count}</Info>
        <Info label="Kind">{task.kind}</Info>
        <Info label="Depends on">
          {task.depends_on.length ? task.depends_on.map((d) => (
            <button key={d} onClick={() => selectTask(d)} className="mr-1 text-amber-300 hover:underline">#{d} {tasks[d]?.status === "completed" ? "✓" : ""}</button>
          )) : "—"}
        </Info>
        <Info label="Progress">{Math.round(task.progress * 100)}%</Info>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-white/10 py-3">
        {canStop && <Button variant="danger" onClick={() => guarded(() => api.post(`/api/tasks/${task.id}/stop`))}>Stop task</Button>}
        {canRetry && <Button variant="primary" onClick={() => guarded(() => api.post(`/api/tasks/${task.id}/retry`, {}))}>Retry</Button>}
        <select className={`${inputCls} !w-auto !py-1 text-xs`} value={reassignTo}
          onChange={(e) => setReassignTo(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Reassign to…</option>
          {Object.values(employees).filter((e) => e.active && e.id !== task.assignee_id).map((e) => (
            <option key={e.id} value={e.id}>{e.name} — {e.title}</option>
          ))}
        </select>
        <Button disabled={reassignTo === ""} onClick={() => guarded(async () => {
          await api.post(`/api/tasks/${task.id}/reassign`, { employee_id: reassignTo });
          setReassignTo("");
        })}>Reassign</Button>
      </div>

      <Section title="Brief"><p className="whitespace-pre-wrap text-xs text-white/80">{task.description || "—"}</p></Section>
      {task.feedback && <Section title="Revision feedback"><p className="whitespace-pre-wrap text-xs text-amber-200">{task.feedback}</p></Section>}
      {task.error && <Section title="Error"><p className="whitespace-pre-wrap text-xs text-red-300">{task.error}</p></Section>}
      {task.artifacts.length > 0 && (
        <Section title="Artifacts">
          <div className="space-y-2">{task.artifacts.map((a, i) => <ArtifactView key={i} a={a} />)}</div>
        </Section>
      )}
      <Section title="Deliverable">
        {task.deliverable ? <Markdown>{task.deliverable}</Markdown> : (
          <p className="text-xs text-white/40">{task.status === "running" ? "Agent is working on it…" : "No deliverable yet."}</p>
        )}
      </Section>

      {canReview && (
        <div className="mt-4 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Owner review</div>
          <textarea className={inputCls} rows={2} placeholder="Feedback (required to reject)…" value={feedback}
            onChange={(e) => setFeedback(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="success" onClick={() => guarded(() => api.post(`/api/tasks/${task.id}/review`, { approve: true }))}>Approve</Button>
            <Button variant="danger" disabled={!feedback.trim()} onClick={() => guarded(async () => {
              await api.post(`/api/tasks/${task.id}/review`, { approve: false, feedback });
              setFeedback("");
            })}>Reject &amp; send back</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="text-white/90">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">{title}</div>
      {children}
    </div>
  );
}
