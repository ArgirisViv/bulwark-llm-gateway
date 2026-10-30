import type { AuditRequest, AuditSummary, GatewayMetrics } from "../types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function parsePrometheus(text: string): GatewayMetrics {
  let requests = 0;
  let durationTotal = 0;
  let durationCount = 0;
  const valueOf = (line: string) => Number(line.slice(line.lastIndexOf("}") + 1).trim());
  for (const line of text.split("\n")) {
    if (line.startsWith("bulwark_http_requests_total{")) {
      const value = valueOf(line);
      if (Number.isFinite(value)) requests += value;
    } else if (line.startsWith("bulwark_http_request_duration_seconds_sum{")) {
      const value = valueOf(line);
      if (Number.isFinite(value)) durationTotal += value;
    } else if (line.startsWith("bulwark_http_request_duration_seconds_count{")) {
      const value = valueOf(line);
      if (Number.isFinite(value)) durationCount += value;
    }
  }
  return { requests, averageLatencyMs: durationCount ? (durationTotal / durationCount) * 1000 : 0 };
}

async function get(path: string, key: string | null): Promise<Response> {
  const headers: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {};
  let response: Response;
  try {
    response = await fetch(path, { headers });
  } catch {
    throw new ApiError("Cannot reach the gateway. Check that the stack is running.", 0);
  }
  if (response.status === 401) throw new ApiError("The gateway rejected this API key.", 401);
  return response;
}

export async function fetchLive(key: string, hours: number) {
  const [summaryResponse, recentResponse, metricsResponse] = await Promise.all([
    get(`/api/v1/audit/summary?hours=${hours}`, key),
    get("/api/v1/audit/recent?limit=100", key),
    get("/api/metrics", null).catch(() => null),
  ]);
  if (!summaryResponse.ok || !recentResponse.ok) {
    throw new ApiError("The gateway could not load audit data. Check that it is ready.", 503);
  }
  const summary = (await summaryResponse.json()) as AuditSummary;
  const recent = (await recentResponse.json()) as { data: AuditRequest[] };
  const metrics = metricsResponse && metricsResponse.ok ? parsePrometheus(await metricsResponse.text()) : null;
  return { summary, requests: recent.data, metrics };
}
