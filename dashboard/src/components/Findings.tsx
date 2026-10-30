import { useMemo } from "react";
import { SEVERITY_ORDER, groupFindings } from "../lib/analytics";
import { fmtInt, label } from "../lib/format";
import type { AuditSummary } from "../types";
import { Empty, Panel } from "./ui";

type Props = { summary: AuditSummary; onPickCategory: (category: string) => void };

export function Findings({ summary, onPickCategory }: Props) {
  const rows = useMemo(() => groupFindings(summary.findings), [summary.findings]);
  const peak = Math.max(1, ...summary.findings.map((stat) => stat.count));
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const actions = useMemo(() => {
    const map: Record<string, number> = {};
    for (const stat of summary.findings) map[stat.action] = (map[stat.action] ?? 0) + stat.count;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [summary.findings]);

  if (!rows.length) {
    return (
      <Panel title="Findings">
        <Empty title="No findings in this window" hint="Detectors have not flagged any traffic for the selected range." />
      </Panel>
    );
  }

  return (
    <div className="stack">
      <div className="kpis kpis-3">
        <div className="kpi">
          <div className="kpi-title">Total findings</div>
          <div className="kpi-row"><strong>{fmtInt(total)}</strong></div>
          <div className="kpi-note">across {rows.length} categories</div>
        </div>
        {actions.slice(0, 2).map(([action, count]) => (
          <div className="kpi" key={action}>
            <div className="kpi-title">Action: {action}</div>
            <div className="kpi-row"><strong>{fmtInt(count)}</strong></div>
            <div className="kpi-note">{total ? ((count / total) * 100).toFixed(0) : 0}% of findings</div>
          </div>
        ))}
      </div>

      <Panel title="Category × severity" subtitle="Cell intensity is relative to the busiest combination. Click a category to see its requests.">
        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>Category</th>
                {SEVERITY_ORDER.map((severity) => (
                  <th key={severity} className="num">
                    <span className={`sev sev-${severity}`}>{severity}</span>
                  </th>
                ))}
                <th className="num">Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.category}>
                  <th scope="row">
                    <button type="button" onClick={() => onPickCategory(row.category)}>
                      {label(row.category)}
                    </button>
                  </th>
                  {SEVERITY_ORDER.map((severity) => {
                    const count = row.bySeverity[severity] ?? 0;
                    return (
                      <td key={severity} className="num">
                        {count ? (
                          <span className={`heat sev-${severity}`} style={{ opacity: 0.28 + 0.72 * (count / peak) }}>
                            {fmtInt(count)}
                          </span>
                        ) : (
                          <span className="muted">·</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="num"><b>{fmtInt(row.total)}</b></td>
                  <td>
                    <span className="action-tags">
                      {Object.entries(row.actions).map(([action, count]) => (
                        <span key={action} className={`tag tag-${action}`}>
                          {action} · {count}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
