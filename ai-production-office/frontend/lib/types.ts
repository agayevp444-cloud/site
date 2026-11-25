export type Status =
  | "IDLE" | "WORKING" | "THINKING" | "IN_MEETING" | "WAITING"
  | "REVIEWING" | "COMPLETED" | "ERROR" | "PAUSED";

export interface Presence {
  status: Status;
  task_id?: number | null;
  project_id?: number | null;
  detail?: string;
  with_employee_id?: number | null;
  progress?: number | null;
}

export interface Employee {
  id: number; key: string; name: string; title: string; department: string;
  job_description: string; system_prompt: string; tools: string[]; desk: number;
  color: string; paused: boolean; active: boolean; is_director: boolean; is_qc: boolean;
  last_error: string | null; created_at: string; presence: Presence;
}

export interface Project {
  id: number; title: string; description: string;
  status: "planning" | "running" | "awaiting_approval" | "delivered" | "failed" | "cancelled" | "direct";
  plan_summary: string | null; final_deliverable: string | null; owner_feedback: string | null;
  error: string | null; created_at: string; completed_at: string | null;
}

export interface Artifact {
  kind: string; title: string; by?: number; file?: string;
  data: { colors?: { hex: string; name?: string; role?: string }[]; columns?: string[]; rows?: unknown[][]; text?: string; path?: string; [k: string]: unknown };
}

export interface Task {
  id: number; project_id: number; title: string; description: string; assignee_id: number | null;
  kind: "work" | "review" | "delivery" | "direct";
  status: "pending" | "queued" | "running" | "completed" | "failed" | "cancelled";
  priority: "low" | "medium" | "high" | "critical"; depends_on: number[];
  deliverable: string | null; summary: string | null; artifacts: Artifact[];
  approval: "none" | "pending" | "approved" | "rejected"; feedback: string | null;
  revision_count: number; progress: number; error: string | null;
  input_tokens: number; output_tokens: number; cost_usd: number; created_by: string;
  created_at: string; started_at: string | null; completed_at: string | null;
}

export interface Message {
  id: number; project_id: number | null; task_id: number | null; from_id: number | null;
  to_id: number | null; kind: string; content: string; read: boolean; created_at: string;
}

export interface LogEntry {
  id: number; employee_id: number | null; project_id: number | null; task_id: number | null;
  kind: string; text: string; created_at: string;
}

export interface UsageRecord {
  id: number; employee_id: number | null; project_id: number | null; task_id: number | null;
  purpose: string; model: string; input_tokens: number; output_tokens: number;
  cache_read_tokens: number; cache_write_tokens: number; web_searches: number;
  cost_usd: number; created_at: string;
}

export interface UsageSummary {
  input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number;
  web_searches: number; cost_usd: number; calls: number;
  by_employee: { employee_id: number | null; cost_usd: number; calls: number; input_tokens: number; output_tokens: number }[];
  by_project: { project_id: number | null; cost_usd: number; calls: number }[];
  by_model: { model: string; cost_usd: number; calls: number }[];
}

export interface ToolInfo { name: string; description: string; category: string; available: boolean }

export interface Health {
  ok: boolean; api_key_configured: boolean; model: string; ffmpeg: boolean;
  web_search: boolean; max_concurrent: number;
}

export interface OfficeState {
  employees: Employee[]; projects: Project[]; tasks: Task[]; messages: Message[];
  logs: LogEntry[]; usage: UsageSummary; tools: ToolInfo[]; health: Health;
}
