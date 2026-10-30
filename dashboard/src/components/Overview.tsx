import { useMemo } from "react";
import {
  OUTCOMES,
  OUTCOME_LABEL,
  bucketize,
  groupFindings,
  latencyStats,
  outcomeOf,
  topSeverity,
  type Bucket,
} from "../lib/analytics";
import { fmtCompact, fmtInt, fmtMs, fmtPct, label, relTime } from "../lib/format";
import type { AuditRequest, Outcome, Snapshot, View } from "../types";
import { Histogram, OutcomeBar, Sparkline, Timeline } from "./charts";
import { IconArrow } from "./icons";
import { DecisionBadge, Empty, Panel, Severity } from "./ui";

export type Model = {
  rows: AuditRequest[];
  domainFrom: number;
  now: number;
  truncated: boolean;
};

type Props = {
  snapshot: Snapshot;
  model: Model;
  activeWindow: { from: number; to: number } | null;
  onSelectBucket: (bucket: Bucket) => void;
  onPickOutcome: (outcome: Outcome) => void;
  onOpen: (request: AuditRequest) => void;
  onGo: (view: View) => void;
  onPickCategory: (category: string) => void;
};

export function Overview({ snapshot, model, activeWindow, onSelectBucket, onPickOutcome, onOpen, onGo, onPickCategory }: Props) {
  const { summary, metrics } = snapshot;
  const buckets = useMemo(() => bucketize(model.rows, model.domainFrom, model.now, 36), [model]);
  const latency = useMemo(() => latencyStats(model.rows), [model.rows]);
  const outcomeCounts = useMemo(() => {
    const counts: Record<Outcome, number> = { clean: 0, redacted: 0, blocked: 0, error: 0 };
    for (const row of model.rows) counts[outcomeOf(row)] += 1;
    return counts;
  }, [model.rows]);
  const categories = useMemo(() => groupFindings(summary.findings).slice(0, 6), [summary.findings]);

  const blocked = (summary.decisions.blocked ?? 0) + (summary.decisions.rate_limited ?? 0);
  const redacted = summary.findings.filter((f) => f.action === "redact").reduce((sum, f) => sum + f.count, 0);
  const blockRate = summary.requests ? (blocked / summary.requests) * 100 : 0;
  const maxCategory = Math.max(1, ...categories.map((row) => row.total));

  const kpis = [
    {
      key: "requests",
      title: "Requests",
      value: fmtCompact(summary.requests),
      note: `${fmtInt(model.rows.length)} loaded for charts`,
      series: buckets.map((b) => b.total),
      tone: "neutral",
    },
    {
      key: "blocked",
      title: "Blocked",
      value: fmtInt(blocked),
      note: `${fmtPct(blockRate)} of traffic · policy and rate limits`,
      series: buckets.map((b) => b.counts.blocked),
      tone: "blocked",
    },
    {
      key: "redacted",
      title: "Redactions",
      value: fmtInt(redacted),
      note: "sensitive values removed before delivery",
      series: buckets.map((b) => b.counts.redacted),
      tone: "redacted",
    },
    {
      key: "latency",
      title: "p95 latency",
      value: latency.p95 ? fmtMs(latency.p95) : "—",
      note: `p50 ${latency.p50 ? fmtMs(latency.p50) : "—"}${metrics ? ` · avg ${fmtMs(metrics.averageLatencyMs)}` : ""}`,
      series: buckets.map((b) => b.total),
      tone: "latency",
    },
  ];

  return (
    <div className="stack">
      <div className="kpis">
        {kpis.map((kpi) => (
          <div className="kpi" key={kpi.key}>
            <div className="kpi-title">{kpi.title}</div>
            <div className="kpi-row">
              <strong>{kpi.value}</strong>
              <Sparkline values={kpi.series} tone={kpi.tone} />
            </div>
            <div className="kpi-note">{kpi.note}</div>
          </div>
        ))}
      </div>

      <div className="grid-main">
        <Panel
          title="Traffic by outcome"
          subtitle={
            model.truncated
              ? "Showing the latest 100 audited requests — older traffic is counted in the totals only"
              : "Click a bar to inspect that interval"
          }
          action={
            <ul className="legend">
              {OUTCOMES.map((outcome) => (
                <li key={outcome}>
                  <i className={`dot dot-${outcome}`} />
                  {OUTCOME_LABEL[outcome]}
                </li>
              ))}
            </ul>
          }
        >
          <Timeline buckets={buckets} onSelect={onSelectBucket} active={activeWindow} />
        </Panel>

        <div className="stack">
          <Panel title="Outcomes" subtitle="Loaded requests">
            <OutcomeBar counts={outcomeCounts} onPick={onPickOutcome} />
          </Panel>
          <Panel title="Latency distribution" subtitle="Gateway time per request">
            <Histogram bins={latency.histogram} p50={latency.p50} p95={latency.p95} cap={latency.cap} />
            <div className="percentiles">
              <div>
                <span><i className="dot dot-p50" />p50</span>
                <b>{latency.p50 ? fmtMs(latency.p50) : "—"}</b>
              </div>
              <div>
                <span><i className="dot dot-p95" />p95</span>
                <b>{latency.p95 ? fmtMs(latency.p95) : "—"}</b>
              </div>
              <div>
                <span>p99</span>
                <b>{latency.p99 ? fmtMs(latency.p99) : "—"}</b>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid-secondary">
        <Panel
          title="Top finding categories"
          action={
            <button className="link-button" type="button" onClick={() => onGo("findings")}>
              All findings <IconArrow size={12} />
            </button>
          }
        >
          {categories.length ? (
            <ul className="bars">
              {categories.map((row) => (
                <li key={row.category}>
                  <button type="button" onClick={() => onPickCategory(row.category)}>
                    <span className="bars-label">{label(row.category)}</span>
                    <span className="bars-track">
                      {["low", "medium", "high", "critical"].map((severity) =>
                        row.bySeverity[severity] ? (
                          <i
                            key={severity}
                            className={`sev-fill sev-${severity}`}
                            style={{ width: `${(row.bySeverity[severity] / maxCategory) * 100}%` }}
                          />
                        ) : null,
                      )}
                    </span>
                    <b>{fmtInt(row.total)}</b>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No findings in this window" hint="Detectors have not flagged any traffic." />
          )}
        </Panel>

        <Panel
          title="Latest activity"
          action={
            <button className="link-button" type="button" onClick={() => onGo("traffic")}>
              View all <IconArrow size={12} />
            </button>
          }
        >
          {model.rows.length ? (
            <ul className="feed">
              {model.rows.slice(0, 7).map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => onOpen(row)}>
                    <DecisionBadge decision={row.decision} />
                    <span className="feed-app">{row.application_id}</span>
                    <span className="feed-meta">{row.findings.length ? `${row.findings.length} finding${row.findings.length > 1 ? "s" : ""}` : ""}</span>
                    <Severity severity={topSeverity(row)} />
                    <time>{relTime(Date.parse(row.created_at), model.now)}</time>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No requests in this window" hint="Send traffic through the gateway to see it here." />
          )}
        </Panel>
      </div>
    </div>
  );
}
