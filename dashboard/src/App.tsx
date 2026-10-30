import { useCallback, useEffect, useMemo, useState } from "react";

type Finding = {
  detector: string;
  category: string;
  severity: string;
  action: string;
  direction: string;
};

type AuditRequest = {
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

type AuditSummary = {
  window_hours: number;
  requests: number;
  decisions: Record<string, number>;
  findings: { category: string; severity: string; action: string; count: number }[];
};

type GatewayMetrics = {
  requests: number;
  averageLatencyMs: number;
};

function parsePrometheus(text: string): GatewayMetrics {
  let requests = 0;
  let durationTotal = 0;
  let durationCount = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("bulwark_http_requests_total{")) {
      const value = Number(line.slice(line.lastIndexOf("}") + 1).trim());
      if (Number.isFinite(value)) requests += value;
    } else if (line.startsWith("bulwark_http_request_duration_seconds_sum{")) {
      const value = Number(line.slice(line.lastIndexOf("}") + 1).trim());
      if (Number.isFinite(value)) durationTotal += value;
    } else if (line.startsWith("bulwark_http_request_duration_seconds_count{")) {
      const value = Number(line.slice(line.lastIndexOf("}") + 1).trim());
      if (Number.isFinite(value)) durationCount += value;
    }
  }
  return {
    requests,
    averageLatencyMs: durationCount ? (durationTotal / durationCount) * 1000 : 0,
  };
}

function decisionLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem("bulwark-api-key") ?? "");
  const [draftKey, setDraftKey] = useState(apiKey);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [requests, setRequests] = useState<AuditRequest[]>([]);
  const [metrics, setMetrics] = useState<GatewayMetrics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${apiKey}` };
      const [summaryResponse, auditResponse, metricsResponse] = await Promise.all([
        fetch("/api/v1/audit/summary?hours=24", { headers }),
        fetch("/api/v1/audit/recent?limit=50", { headers }),
        fetch("/api/metrics"),
      ]);
      if (summaryResponse.status === 401 || auditResponse.status === 401) {
        throw new Error("Gateway API key was rejected. Check the key and try again.");
      }
      if (!summaryResponse.ok || !auditResponse.ok) {
        throw new Error("The gateway could not load audit data. Check that it is ready.");
      }
      if (!metricsResponse.ok) throw new Error("The gateway metrics endpoint is unavailable.");
      const summaryData = (await summaryResponse.json()) as AuditSummary;
      const auditData = (await auditResponse.json()) as { data: AuditRequest[] };
      const metricsText = await metricsResponse.text();
      setSummary(summaryData);
      setRequests(auditData.data);
      setMetrics(parsePrometheus(metricsText));
      setUpdatedAt(new Date());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    void loadDashboard();
    const timer = window.setInterval(() => void loadDashboard(), 30_000);
    return () => window.clearInterval(timer);
  }, [apiKey, loadDashboard]);

  const totals = useMemo(() => {
    const decisions = summary?.decisions ?? {};
    return {
      blocked: (decisions.blocked ?? 0) + (decisions.rate_limited ?? 0),
      redacted: summary?.findings
        .filter((finding) => finding.action === "redact")
        .reduce((total, finding) => total + finding.count, 0) ?? 0,
      allowed: decisions.allowed ?? 0,
    };
  }, [summary]);

  function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextKey = draftKey.trim();
    if (!nextKey) return;
    sessionStorage.setItem("bulwark-api-key", nextKey);
    setApiKey(nextKey);
  }

  function disconnect() {
    sessionStorage.removeItem("bulwark-api-key");
    setApiKey("");
    setSummary(null);
    setRequests([]);
    setMetrics(null);
    setDraftKey("");
  }

  if (!apiKey) {
    return (
      <main className="connect-page">
        <div className="connect-card">
          <div className="brand-mark">B</div>
          <p className="eyebrow">SECURITY GATEWAY</p>
          <h1>Welcome to Bulwark</h1>
          <p className="muted">
            Connect to your gateway to review security decisions and request activity.
            Your key stays in this browser tab.
          </p>
          <form onSubmit={connect} className="key-form">
            <label htmlFor="api-key">Gateway API key</label>
            <input
              id="api-key"
              type="password"
              autoComplete="current-password"
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              placeholder="Enter your gateway key"
              required
            />
            <button type="submit">Connect to gateway <span aria-hidden="true">→</span></button>
          </form>
          {error && <p className="error-message" role="alert">{error}</p>}
          <p className="privacy-note">Audit views contain metadata only. Prompts and responses are never stored.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Bulwark dashboard">
          <span className="brand-mark small">B</span>
          <span>bulwark<span className="brand-dot">.</span></span>
        </a>
        <div className="top-actions">
          <span className="connection"><i /> Gateway connected</span>
          <button className="quiet-button" onClick={disconnect}>Disconnect</button>
        </div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">OPERATIONS OVERVIEW</p>
          <h1>Security dashboard</h1>
          <p className="muted">Monitor gateway traffic and policy decisions across your applications.</p>
        </div>
        <div className="refresh-area">
          <span className="updated">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : "Waiting for data"}</span>
          <button className="refresh-button" onClick={() => void loadDashboard()} disabled={loading}>
            <span aria-hidden="true" className={loading ? "spin" : ""}>↻</span>
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </section>

      {error && <div className="alert" role="alert">{error}</div>}

      <section className="metrics-grid" aria-label="24 hour summary">
        <article className="metric-card">
          <div className="metric-top"><span>Requests · 24h</span><span className="metric-icon blue">↗</span></div>
          <strong>{summary?.requests ?? "—"}</strong>
          <small>Across all applications</small>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span>Blocked</span><span className="metric-icon red">⊘</span></div>
          <strong>{summary ? totals.blocked : "—"}</strong>
          <small>Blocked by policy or rate limit</small>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span>Redacted</span><span className="metric-icon amber">✳</span></div>
          <strong>{summary ? totals.redacted : "—"}</strong>
          <small>Redacted findings</small>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span>Avg. gateway latency</span><span className="metric-icon green">◷</span></div>
          <strong>{metrics ? <>{metrics.averageLatencyMs.toFixed(1)}<small> ms</small></> : "—"}</strong>
          <small>{metrics ? `${metrics.requests} requests since process start` : "Prometheus process metrics"}</small>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel activity-panel">
          <div className="panel-heading">
            <div><h2>Recent requests</h2><p>Metadata-only audit activity</p></div>
            <span className="count-pill">{requests.length} shown</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Decision</th><th>Application / model</th><th>Findings</th><th>Latency</th><th>Time</th></tr>
              </thead>
              <tbody>
                {requests.map((item) => (
                  <tr key={item.id}>
                    <td><span className={`badge ${item.decision}`}>{decisionLabel(item.decision)}</span></td>
                    <td><strong>{item.application_id}</strong><small>{item.model}</small></td>
                    <td>
                      {item.findings.length
                        ? <span className="finding-count">{item.findings.length} · {item.findings.map((finding) => finding.category).join(", ")}</span>
                        : <span className="muted">None</span>}
                    </td>
                    <td>{item.latency_ms.toFixed(0)} ms</td>
                    <td className="time-cell">{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {!requests.length && !loading && (
                  <tr><td className="empty-row" colSpan={5}>No audit requests in the database yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="panel findings-panel">
          <div className="panel-heading">
            <div><h2>Top findings</h2><p>Last 24 hours</p></div>
            <span className="shield-icon">◇</span>
          </div>
          <div className="finding-list">
            {(summary?.findings ?? []).map((finding) => (
              <div className="finding-row" key={`${finding.category}-${finding.severity}`}>
                <span className={`severity-dot ${finding.severity}`} />
                <div><strong>{finding.category}</strong><small>{finding.severity} severity</small></div>
                <b>{finding.count}</b>
              </div>
            ))}
            {!summary?.findings.length && <p className="empty-findings">No findings recorded in this window.</p>}
          </div>
          <div className="policy-note">
            <span className="policy-icon">✓</span>
            <div><strong>Policy enforcement active</strong><small>Decisions are recorded as metadata only.</small></div>
          </div>
        </aside>
      </section>

      <footer>
        <span><i className="footer-dot" /> Live updates every 30 seconds</span>
        <span>Prometheus metrics available at <code>/metrics</code></span>
      </footer>
    </main>
  );
}
