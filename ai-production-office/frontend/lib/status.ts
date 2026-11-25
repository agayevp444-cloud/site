import type { Status } from "./types";

export const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  IDLE: { label: "IDLE", color: "#9ca3af", bg: "rgba(156,163,175,0.18)" },
  WORKING: { label: "WORKING", color: "#34d399", bg: "rgba(52,211,153,0.18)" },
  THINKING: { label: "THINKING", color: "#a78bfa", bg: "rgba(167,139,250,0.2)" },
  IN_MEETING: { label: "IN MEETING", color: "#60a5fa", bg: "rgba(96,165,250,0.2)" },
  WAITING: { label: "WAITING", color: "#fbbf24", bg: "rgba(251,191,36,0.18)" },
  REVIEWING: { label: "REVIEWING", color: "#22d3ee", bg: "rgba(34,211,238,0.18)" },
  COMPLETED: { label: "COMPLETED", color: "#4ade80", bg: "rgba(74,222,128,0.18)" },
  ERROR: { label: "ERROR", color: "#f87171", bg: "rgba(248,113,113,0.22)" },
  PAUSED: { label: "PAUSED", color: "#fb923c", bg: "rgba(251,146,60,0.2)" },
};

export const TASK_STATUS_COLOR: Record<string, string> = {
  pending: "#9ca3af", queued: "#fbbf24", running: "#34d399", completed: "#4ade80",
  failed: "#f87171", cancelled: "#6b7280",
};

export const PRIORITY_COLOR: Record<string, string> = {
  low: "#6b7280", medium: "#60a5fa", high: "#f59e0b", critical: "#ef4444",
};

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtUsd(v: number) {
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

export function fmtTokens(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
