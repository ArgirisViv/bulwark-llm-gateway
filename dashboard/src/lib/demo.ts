import type { AuditRequest, AuditSummary, Finding, FindingStat, GatewayMetrics } from "../types";

// Deterministic synthetic traffic so the dashboard can be explored without a running gateway.
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const APPS = ["support-bot", "docs-search", "internal-copilot", "billing-assistant"];
const MODELS = ["gpt-4o-mini", "gpt-4o", "llama3.1:8b"];

const PII: [string, string][] = [
  ["email_address", "medium"],
  ["credit_card", "medium"],
  ["iban", "medium"],
  ["gr_afm", "medium"],
  ["phone_number", "medium"],
];
const SECRETS: [string, string][] = [
  ["aws_access_key", "high"],
  ["openai_api_key", "high"],
  ["github_token", "high"],
];

const HOUR = 3_600_000;
const SPAN = 7 * 24 * HOUR;

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

function hex(random: () => number, length: number): string {
  let out = "";
  while (out.length < length) out += Math.floor(random() * 16).toString(16);
  return out;
}

function generate(now: number): AuditRequest[] {
  const random = rng(20261030);
  const all: AuditRequest[] = [];
  for (let index = 0; index < 1500; index += 1) {
    const at = now - random() * SPAN;
    const hour = new Date(at).getHours();
    // Daily rhythm: quieter at night.
    const activity = 0.3 + 0.7 * (Math.sin(((hour - 6) / 24) * Math.PI * 2) * 0.5 + 0.5);
    if (random() > activity) continue;

    const roll = random();
    const findings: Finding[] = [];
    let decision = "allowed";
    let upstream: number | null = 260 + random() * random() * 2200;
    const overhead = 3 + random() * 14;
    let latency = upstream + overhead;

    if (roll < 0.085) {
      decision = "blocked";
      upstream = null;
      latency = 4 + random() * 12;
      const canary = random() < 0.2;
      findings.push({
        detector: canary ? "canary" : "injection.heuristic",
        category: canary ? "canary_leak" : "prompt_injection",
        severity: "high",
        action: "block",
        direction: canary ? "response" : "request",
      });
    } else if (roll < 0.1) {
      decision = "rate_limited";
      upstream = null;
      latency = 2 + random() * 4;
    } else if (roll < 0.125) {
      decision = "upstream_error";
      upstream = 5000 + random() * 3000;
      latency = upstream + overhead;
    } else if (roll < 0.26) {
      const [category, severity] = random() < 0.28 ? pick(random, SECRETS) : pick(random, PII);
      findings.push({
        detector: severity === "high" ? "secrets" : "pii",
        category,
        severity,
        action: "redact",
        direction: random() < 0.85 ? "request" : "response",
      });
      if (random() < 0.2) {
        const [extraCategory, extraSeverity] = pick(random, PII);
        findings.push({ detector: "pii", category: extraCategory, severity: extraSeverity, action: "redact", direction: "request" });
      }
      latency += 1.5 + random() * 4;
    } else if (roll < 0.3) {
      findings.push({ detector: "injection.heuristic", category: "prompt_injection", severity: "low", action: "log", direction: "request" });
    }

    const passed = decision === "allowed" || decision === "upstream_error";
    all.push({
      id: `${hex(random, 8)}-${hex(random, 4)}-${hex(random, 4)}-${hex(random, 4)}-${hex(random, 12)}`,
      application_id: pick(random, APPS),
      model: pick(random, MODELS),
      decision,
      latency_ms: latency,
      upstream_latency_ms: upstream,
      tokens_in: passed ? Math.round(40 + random() * 900) : null,
      tokens_out: decision === "allowed" ? Math.round(30 + random() * 700) : null,
      created_at: new Date(at).toISOString(),
      findings,
    });
  }
  return all.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function demoSnapshot(
  hours: number,
  now: number = Date.now(),
): { summary: AuditSummary; requests: AuditRequest[]; metrics: GatewayMetrics } {
  const all = generate(now - (now % 60_000));
  const since = now - hours * HOUR;
  const inWindow = all.filter((request) => Date.parse(request.created_at) >= since);
  const decisions: Record<string, number> = {};
  const stats = new Map<string, FindingStat>();
  for (const request of inWindow) {
    decisions[request.decision] = (decisions[request.decision] ?? 0) + 1;
    for (const finding of request.findings) {
      const key = `${finding.category}|${finding.severity}|${finding.action}`;
      const stat = stats.get(key) ?? { category: finding.category, severity: finding.severity, action: finding.action, count: 0 };
      stat.count += 1;
      stats.set(key, stat);
    }
  }
  const mean = all.reduce((sum, request) => sum + request.latency_ms, 0) / Math.max(1, all.length);
  return {
    summary: {
      window_hours: hours,
      requests: inWindow.length,
      decisions,
      findings: [...stats.values()].sort((a, b) => b.count - a.count),
    },
    requests: all.slice(0, 100),
    metrics: { requests: all.length, averageLatencyMs: mean },
  };
}
