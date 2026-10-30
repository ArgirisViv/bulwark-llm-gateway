import type { AuditRequest, FindingStat, Outcome } from "../types";

export const OUTCOMES: Outcome[] = ["clean", "redacted", "blocked", "error"];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  clean: "Allowed",
  redacted: "Redacted",
  blocked: "Blocked",
  error: "Upstream error",
};

export function outcomeOf(request: AuditRequest): Outcome {
  if (request.decision === "blocked" || request.decision === "rate_limited") return "blocked";
  if (request.decision === "upstream_error") return "error";
  if (request.findings.some((finding) => finding.action === "redact")) return "redacted";
  return "clean";
}

export type Bucket = { start: number; end: number; counts: Record<Outcome, number>; total: number };

export function bucketize(requests: AuditRequest[], from: number, to: number, count: number): Bucket[] {
  const width = (to - from) / count;
  const buckets: Bucket[] = Array.from({ length: count }, (_, index) => ({
    start: from + index * width,
    end: from + (index + 1) * width,
    counts: { clean: 0, redacted: 0, blocked: 0, error: 0 },
    total: 0,
  }));
  for (const request of requests) {
    const at = Date.parse(request.created_at);
    if (at < from || at > to) continue;
    const index = Math.min(count - 1, Math.floor((at - from) / width));
    const bucket = buckets[index];
    bucket.counts[outcomeOf(request)] += 1;
    bucket.total += 1;
  }
  return buckets;
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export type LatencyStats = { p50: number; p95: number; p99: number; histogram: number[]; cap: number };

export function latencyStats(requests: AuditRequest[], bins = 28): LatencyStats {
  const values = requests.map((request) => request.latency_ms).sort((a, b) => a - b);
  const p95 = percentile(values, 95);
  const cap = Math.max(p95 * 1.1, 1);
  const histogram = new Array<number>(bins).fill(0);
  for (const value of values) {
    histogram[Math.min(bins - 1, Math.floor((value / cap) * bins))] += 1;
  }
  return { p50: percentile(values, 50), p95, p99: percentile(values, 99), histogram, cap };
}

export const SEVERITY_ORDER = ["low", "medium", "high", "critical"];

export type CategoryRow = {
  category: string;
  total: number;
  bySeverity: Record<string, number>;
  actions: Record<string, number>;
};

export function groupFindings(stats: FindingStat[]): CategoryRow[] {
  const rows = new Map<string, CategoryRow>();
  for (const stat of stats) {
    const row = rows.get(stat.category) ?? { category: stat.category, total: 0, bySeverity: {}, actions: {} };
    row.total += stat.count;
    row.bySeverity[stat.severity] = (row.bySeverity[stat.severity] ?? 0) + stat.count;
    row.actions[stat.action] = (row.actions[stat.action] ?? 0) + stat.count;
    rows.set(stat.category, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

export function topSeverity(request: AuditRequest): string {
  let best = -1;
  for (const finding of request.findings) best = Math.max(best, SEVERITY_ORDER.indexOf(finding.severity));
  return best < 0 ? "" : SEVERITY_ORDER[best];
}
