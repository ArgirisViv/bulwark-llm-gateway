import type { AuditRequest, Filters } from "../types";
import { outcomeOf } from "./analytics";

export function applyFilters(rows: AuditRequest[], filters: Filters): AuditRequest[] {
  const query = filters.q.trim().toLowerCase();
  return rows.filter((row) => {
    const at = Date.parse(row.created_at);
    if (filters.from !== null && at < filters.from) return false;
    if (filters.to !== null && at > filters.to) return false;
    if (filters.app && row.application_id !== filters.app) return false;
    if (filters.decisions.length && !filters.decisions.includes(outcomeOf(row))) return false;
    if (filters.severity && !row.findings.some((finding) => finding.severity === filters.severity)) return false;
    if (query) {
      const haystack = [
        row.id,
        row.application_id,
        row.model,
        row.decision,
        ...row.findings.flatMap((finding) => [finding.category, finding.detector]),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function toCsv(rows: AuditRequest[]): string {
  const header = ["id", "created_at", "application", "model", "decision", "latency_ms", "upstream_latency_ms", "tokens_in", "tokens_out", "findings"];
  const lines = rows.map((row) =>
    [
      row.id,
      row.created_at,
      row.application_id,
      row.model,
      row.decision,
      row.latency_ms.toFixed(2),
      row.upstream_latency_ms?.toFixed(2) ?? "",
      row.tokens_in ?? "",
      row.tokens_out ?? "",
      row.findings.map((finding) => `${finding.category}:${finding.action}`).join("|"),
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
