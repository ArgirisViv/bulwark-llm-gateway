export type Finding = {
  detector: string;
  category: string;
  severity: string;
  action: string;
  direction: string;
};

export type AuditRequest = {
  id: string;
  application_id: string;
  model: string;
  decision: string;
  latency_ms: number;
  upstream_latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
  findings: Finding[];
};

export type FindingStat = { category: string; severity: string; action: string; count: number };

export type AuditSummary = {
  window_hours: number;
  requests: number;
  decisions: Record<string, number>;
  findings: FindingStat[];
};

export type GatewayMetrics = {
  requests: number;
  averageLatencyMs: number;
};

export type Snapshot = {
  summary: AuditSummary;
  requests: AuditRequest[];
  metrics: GatewayMetrics | null;
  fetchedAt: number;
};

export type Source = { kind: "live"; key: string } | { kind: "demo" };

export type Outcome = "clean" | "redacted" | "blocked" | "error";

export type View = "overview" | "traffic" | "findings";

export type Filters = {
  q: string;
  decisions: string[];
  app: string;
  severity: string;
  from: number | null;
  to: number | null;
};

export const EMPTY_FILTERS: Filters = { q: "", decisions: [], app: "", severity: "", from: null, to: null };
