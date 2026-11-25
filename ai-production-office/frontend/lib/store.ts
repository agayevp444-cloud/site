"use client";
import { create } from "zustand";
import type { Employee, LogEntry, Message, OfficeState, Presence, Project, Task, UsageRecord, UsageSummary, Health, ToolInfo } from "./types";

export interface Handoff { id: number; from_id: number | null; to_id: number | null; at: number }

interface Store {
  connected: boolean;
  loaded: boolean;
  health: Health | null;
  tools: ToolInfo[];
  employees: Record<number, Employee>;
  projects: Record<number, Project>;
  tasks: Record<number, Task>;
  messages: Message[];
  logs: LogEntry[];
  usage: UsageSummary | null;
  streams: Record<number, { text: string; at: number }>;
  handoffs: Handoff[];
  selectedEmployee: number | null;
  selectedTask: number | null;
  activeProject: number | null;
  toast: string | null;
  setConnected: (v: boolean) => void;
  load: (s: OfficeState) => void;
  apply: (event: string, data: any) => void;
  select: (id: number | null) => void;
  selectTask: (id: number | null) => void;
  setActiveProject: (id: number | null) => void;
  setToast: (t: string | null) => void;
}

const byId = <T extends { id: number }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x])) as Record<number, T>;
let handoffSeq = 0;

export const useOffice = create<Store>((set, get) => ({
  connected: false, loaded: false, health: null, tools: [], employees: {}, projects: {}, tasks: {},
  messages: [], logs: [], usage: null, streams: {}, handoffs: [], selectedEmployee: null,
  selectedTask: null, activeProject: null, toast: null,
  setConnected: (connected) => set({ connected }),
  load: (s) => {
    const cur = get().activeProject;
    const live = s.projects.find((p) => p.status !== "direct" && ["planning", "running", "awaiting_approval"].includes(p.status));
    set({
      loaded: true, health: s.health, tools: s.tools, employees: byId(s.employees), projects: byId(s.projects),
      tasks: byId(s.tasks), messages: s.messages, logs: s.logs, usage: s.usage,
      activeProject: cur ?? live?.id ?? s.projects[0]?.id ?? null,
    });
  },
  apply: (event, data) => {
    const st = get();
    switch (event) {
      case "employee.status": {
        const e = st.employees[data.employee_id];
        if (!e) return;
        const { employee_id, ...presence } = data;
        set({ employees: { ...st.employees, [employee_id]: { ...e, presence: presence as Presence } } });
        return;
      }
      case "employee.updated":
        set({ employees: { ...st.employees, [data.id]: data as Employee } });
        return;
      case "project.updated": {
        const p = data as Project;
        const isNew = !st.projects[p.id];
        set({ projects: { ...st.projects, [p.id]: p },
              activeProject: isNew && p.status !== "direct" ? p.id : st.activeProject });
        return;
      }
      case "task.updated":
        set({ tasks: { ...st.tasks, [data.id]: data as Task } });
        return;
      case "message.created":
        set({ messages: [...st.messages.slice(-599), data as Message] });
        return;
      case "log.created":
        set({ logs: [...st.logs.slice(-599), data as LogEntry] });
        return;
      case "usage.created": {
        const r = data as UsageRecord;
        const u = st.usage;
        if (!u) return;
        const byEmp = [...u.by_employee];
        const i = byEmp.findIndex((x) => x.employee_id === r.employee_id);
        if (i >= 0) byEmp[i] = { ...byEmp[i], cost_usd: byEmp[i].cost_usd + r.cost_usd, calls: byEmp[i].calls + 1,
          input_tokens: byEmp[i].input_tokens + r.input_tokens, output_tokens: byEmp[i].output_tokens + r.output_tokens };
        else byEmp.push({ employee_id: r.employee_id, cost_usd: r.cost_usd, calls: 1, input_tokens: r.input_tokens, output_tokens: r.output_tokens });
        set({ usage: { ...u, input_tokens: u.input_tokens + r.input_tokens, output_tokens: u.output_tokens + r.output_tokens,
          cache_read_tokens: u.cache_read_tokens + r.cache_read_tokens, cache_write_tokens: u.cache_write_tokens + r.cache_write_tokens,
          web_searches: u.web_searches + r.web_searches, cost_usd: u.cost_usd + r.cost_usd, calls: u.calls + 1, by_employee: byEmp } });
        return;
      }
      case "agent.stream": {
        const prev = st.streams[data.employee_id]?.text ?? "";
        const text = (prev + data.text).slice(-600);
        set({ streams: { ...st.streams, [data.employee_id]: { text, at: Date.now() } } });
        return;
      }
      case "handoff":
        set({ handoffs: [...st.handoffs.filter((h) => Date.now() - h.at < 6000),
          { id: ++handoffSeq, from_id: data.from_id, to_id: data.to_id, at: Date.now() }] });
        return;
    }
  },
  select: (selectedEmployee) => set({ selectedEmployee }),
  selectTask: (selectedTask) => set({ selectedTask }),
  setActiveProject: (activeProject) => set({ activeProject }),
  setToast: (toast) => set({ toast }),
}));

export async function guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    useOffice.getState().setToast(e instanceof Error ? e.message : String(e));
    return undefined;
  }
}
