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

export const UNREACHABLE =
  "Cannot reach the gateway. Start it (docker compose up) or explore with sample data.";
export const NOT_GATEWAY =
  "Another application answered instead of the Bulwark gateway. Check which port the gateway uses (BULWARK_GATEWAY_URL for the dev server).";

/** Parse a gateway JSON response; anything else means /api reached the wrong server. */
async function json<T>(response: Response): Promise<T> {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    throw new ApiError(NOT_GATEWAY, 0);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(NOT_GATEWAY, 0);
  }
}

async function get(path: string, key: string | null): Promise<Response> {
  const headers: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {};
  let response: Response;
  try {
    response = await fetch(path, { headers });
  } catch {
    throw new ApiError(UNREACHABLE, 0);
  }
  if (response.status === 401) throw new ApiError("The gateway rejected this API key.", 401);
  return response;
}

/**
 * The gateway answers errors with JSON ({"detail": ...}). A proxy that cannot reach
 * it (Vite in development, nginx in Compose) answers 500/502/504 without JSON, so
 * that case is reported as "unreachable" rather than as a gateway fault.
 */
async function failure(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return new ApiError(body.detail, response.status);
  } catch {
    // Not JSON: the request never reached the gateway.
  }
  return new ApiError(UNREACHABLE, 0);
}

/** Check the key against the gateway before entering the console. */
export async function verifyKey(key: string): Promise<void> {
  const response = await get("/api/v1/audit/summary?hours=1", key);
  if (!response.ok) throw await failure(response);
  const summary = await json<Partial<AuditSummary>>(response);
  if (typeof summary.requests !== "number") throw new ApiError(NOT_GATEWAY, 0);
}

export async function fetchLive(key: string, hours: number) {
  const [summaryResponse, recentResponse, metricsResponse] = await Promise.all([
    get(`/api/v1/audit/summary?hours=${hours}`, key),
    get("/api/v1/audit/recent?limit=100", key),
    get("/api/metrics", null).catch(() => null),
  ]);
  if (!summaryResponse.ok) throw await failure(summaryResponse);
  if (!recentResponse.ok) throw await failure(recentResponse);
  const summary = await json<AuditSummary>(summaryResponse);
  const recent = await json<{ data: AuditRequest[] }>(recentResponse);
  if (!Array.isArray(recent.data)) throw new ApiError(NOT_GATEWAY, 0);
  const metrics = metricsResponse && metricsResponse.ok ? parsePrometheus(await metricsResponse.text()) : null;
  return { summary, requests: recent.data, metrics };
}
