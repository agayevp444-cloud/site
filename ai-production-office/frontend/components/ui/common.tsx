"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { STATUS_META } from "@/lib/status";
import type { Status } from "@/lib/types";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-office">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider"
      style={{ color: m.color, background: m.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ color, background: `${color}22` }}>{children}</span>
  );
}

export function Button({ children, onClick, variant = "default", disabled, type = "button", small }: {
  children: ReactNode; onClick?: () => void; variant?: "default" | "primary" | "danger" | "success" | "ghost";
  disabled?: boolean; type?: "button" | "submit"; small?: boolean;
}) {
  const styles = {
    default: "bg-white/10 hover:bg-white/15 text-white",
    primary: "bg-amber-500 hover:bg-amber-400 text-black",
    danger: "bg-red-500/80 hover:bg-red-500 text-white",
    success: "bg-emerald-500/90 hover:bg-emerald-400 text-black",
    ghost: "hover:bg-white/10 text-white/70",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${styles} ${small ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} rounded-md font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className={`panel w-full ${wide ? "max-w-4xl" : "max-w-xl"} max-h-[88vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="text-sm font-semibold text-white">{title}</div>
          <button onClick={onClose} className="text-white/50 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full rounded-md bg-black/40 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/60";
