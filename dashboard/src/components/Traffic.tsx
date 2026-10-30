import { useEffect, useMemo, useRef, useState } from "react";
import { OUTCOMES, OUTCOME_LABEL, topSeverity } from "../lib/analytics";
import { fmtClock, fmtMs, fmtShort, label, relTime } from "../lib/format";
import type { AuditRequest, Filters } from "../types";
import { EMPTY_FILTERS } from "../types";
import { IconClose, IconDownload, IconSearch, IconSort } from "./icons";
import { DecisionBadge, Empty, Kbd, Severity } from "./ui";

type SortKey = "time" | "latency" | "app" | "decision";

type Props = {
  rows: AuditRequest[];
  total: number;
  apps: string[];
  filters: Filters;
  onFilters: (next: Filters) => void;
  selectedId: string | null;
  onOpen: (request: AuditRequest) => void;
  onExport: () => void;
  now: number;
  searchRef: React.RefObject<HTMLInputElement>;
};

const PAGE = 25;

export function Traffic({ rows, total, apps, filters, onFilters, selectedId, onOpen, onExport, now, searchRef }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "time", dir: -1 });
  const [visible, setVisible] = useState(PAGE);
  const body = useRef<HTMLTableSectionElement>(null);

  useEffect(() => setVisible(PAGE), [filters]);

  const sorted = useMemo(() => {
    const list = [...rows];
    const value = (row: AuditRequest): number | string => {
      if (sort.key === "latency") return row.latency_ms;
      if (sort.key === "app") return row.application_id;
      if (sort.key === "decision") return row.decision;
      return Date.parse(row.created_at);
    };
    list.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      return (left < right ? -1 : left > right ? 1 : 0) * sort.dir;
    });
    return list;
  }, [rows, sort]);

  const shown = sorted.slice(0, visible);
  const maxLatency = Math.max(1, ...rows.map((row) => row.latency_ms));
  const active =
    filters.q || filters.decisions.length || filters.app || filters.severity || filters.from !== null || filters.to !== null;

  function toggleSort(key: SortKey) {
    setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "time" || key === "latency" ? -1 : 1 }));
  }

  function toggleOutcome(outcome: string) {
    const next = filters.decisions.includes(outcome)
      ? filters.decisions.filter((item) => item !== outcome)
      : [...filters.decisions, outcome];
    onFilters({ ...filters, decisions: next });
  }

  function move(event: React.KeyboardEvent<HTMLTableRowElement>, index: number) {
    const rowsNodes = body.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row]");
    if (!rowsNodes) return;
    if (event.key === "ArrowDown" || event.key === "j") {
      event.preventDefault();
      rowsNodes[Math.min(rowsNodes.length - 1, index + 1)]?.focus();
    } else if (event.key === "ArrowUp" || event.key === "k") {
      event.preventDefault();
      rowsNodes[Math.max(0, index - 1)]?.focus();
    }
  }

  const th = (key: SortKey, text: string, className = "") => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => toggleSort(key)} className={sort.key === key ? "is-sorted" : ""}>
        {text}
        <IconSort size={12} />
      </button>
    </th>
  );

  return (
    <section className="panel traffic">
      <div className="toolbar">
        <label className="search">
          <IconSearch size={14} />
          <input
            ref={searchRef}
            type="search"
            value={filters.q}
            onChange={(event) => onFilters({ ...filters, q: event.target.value })}
            placeholder="Search id, app, model, detector…"
            aria-label="Search requests"
          />
          <Kbd>/</Kbd>
        </label>

        <div className="chips" role="group" aria-label="Filter by outcome">
          {OUTCOMES.map((outcome) => (
            <button
              key={outcome}
              type="button"
              className={`chip${filters.decisions.includes(outcome) ? " is-on" : ""}`}
              onClick={() => toggleOutcome(outcome)}
              aria-pressed={filters.decisions.includes(outcome)}
            >
              <i className={`dot dot-${outcome}`} />
              {OUTCOME_LABEL[outcome]}
            </button>
          ))}
        </div>

        <select value={filters.app} onChange={(event) => onFilters({ ...filters, app: event.target.value })} aria-label="Application">
          <option value="">All applications</option>
          {apps.map((app) => (
            <option key={app} value={app}>
              {app}
            </option>
          ))}
        </select>

        <select value={filters.severity} onChange={(event) => onFilters({ ...filters, severity: event.target.value })} aria-label="Severity">
          <option value="">Any severity</option>
          {["low", "medium", "high", "critical"].map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>

        <div className="toolbar-end">
          {filters.from !== null && filters.to !== null && (
            <span className="window-pill">
              {fmtClock(filters.from)}–{fmtClock(filters.to)}
              <button type="button" aria-label="Clear time selection" onClick={() => onFilters({ ...filters, from: null, to: null })}>
                <IconClose size={11} />
              </button>
            </span>
          )}
          {active && (
            <button type="button" className="ghost" onClick={() => onFilters(EMPTY_FILTERS)}>
              Reset
            </button>
          )}
          <button type="button" className="ghost" onClick={onExport} disabled={!rows.length}>
            <IconDownload size={14} /> CSV
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {th("decision", "Decision")}
              {th("app", "Application")}
              <th>Findings</th>
              {th("latency", "Latency", "num")}
              {th("time", "Time", "num")}
            </tr>
          </thead>
          <tbody ref={body}>
            {shown.map((row, index) => (
              <tr
                key={row.id}
                data-row
                tabIndex={0}
                className={selectedId === row.id ? "is-selected" : ""}
                onClick={() => onOpen(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onOpen(row);
                  else move(event, index);
                }}
              >
                <td>
                  <DecisionBadge decision={row.decision} />
                </td>
                <td>
                  <div className="cell-main">{row.application_id}</div>
                  <div className="cell-sub">{row.model}</div>
                </td>
                <td>
                  {row.findings.length ? (
                    <div className="finding-cell">
                      <Severity severity={topSeverity(row)} />
                      <span>
                        {[...new Set(row.findings.map((finding) => label(finding.category)))].slice(0, 2).join(", ")}
                        {row.findings.length > 2 ? ` +${row.findings.length - 2}` : ""}
                      </span>
                    </div>
                  ) : (
                    <span className="muted">None</span>
                  )}
                </td>
                <td className="num">
                  <div className="latency-cell">
                    <span>{fmtMs(row.latency_ms)}</span>
                    <i style={{ width: `${Math.max(3, (row.latency_ms / maxLatency) * 100)}%` }} />
                  </div>
                </td>
                <td className="num" title={fmtShort(Date.parse(row.created_at))}>
                  <div className="cell-main">{fmtClock(Date.parse(row.created_at))}</div>
                  <div className="cell-sub">{relTime(Date.parse(row.created_at), now)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && (
          <Empty
            title={total ? "No requests match these filters" : "No audited requests yet"}
            hint={total ? "Try clearing a filter or widening the time range." : "Requests appear here as soon as traffic flows through the gateway."}
          />
        )}
      </div>

      <footer className="table-foot">
        <span>
          {shown.length} of {rows.length} shown{rows.length !== total ? ` · ${total} in range` : ""}
        </span>
        <span className="hint">
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate · <Kbd>Enter</Kbd> open
        </span>
        {visible < sorted.length && (
          <button type="button" className="ghost" onClick={() => setVisible((count) => count + PAGE)}>
            Show {Math.min(PAGE, sorted.length - visible)} more
          </button>
        )}
      </footer>
    </section>
  );
}
