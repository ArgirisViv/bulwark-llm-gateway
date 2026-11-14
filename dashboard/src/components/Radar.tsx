import { useMemo, useState } from "react";
import { OUTCOME_LABEL, outcomeOf, topSeverity } from "../lib/analytics";
import { fmtMs, label, relTime } from "../lib/format";
import type { AuditRequest } from "../types";

type Props = {
  rows: AuditRequest[];
  from: number;
  now: number;
  onOpen: (request: AuditRequest) => void;
};

const SIZE = 400;
const C = SIZE / 2;
const R_MIN = 26;
const R_MAX = 176;

/**
 * Every loaded request is a blip: the angle is how long ago it happened (12 o'clock
 * is now, clockwise goes back in time), the distance from the centre is its
 * latency on a log scale, and the colour is the policy outcome.
 */
export function Radar({ rows, from, now, onOpen }: Props) {
  const [hover, setHover] = useState<AuditRequest | null>(null);

  const { blips, rings } = useMemo(() => {
    const latencies = rows.map((row) => Math.max(0.1, row.latency_ms));
    const lo = Math.log10(Math.max(0.1, Math.min(...latencies, 10)));
    const hi = Math.log10(Math.max(...latencies, 100));
    const span = Math.max(0.0001, hi - lo);
    const radius = (ms: number) => R_MIN + ((Math.log10(Math.max(0.1, ms)) - lo) / span) * (R_MAX - R_MIN);
    const range = Math.max(1, now - from);
    const points = rows.map((row) => {
      const age = Math.min(1, Math.max(0, (now - Date.parse(row.created_at)) / range));
      const angle = age * Math.PI * 2 - Math.PI / 2;
      const r = radius(row.latency_ms);
      return { row, outcome: outcomeOf(row), x: C + Math.cos(angle) * r, y: C + Math.sin(angle) * r, age };
    });
    // Draw clean traffic first so threats sit on top.
    const order = { clean: 0, error: 1, redacted: 2, blocked: 3 } as const;
    points.sort((a, b) => order[a.outcome] - order[b.outcome]);
    const ringValues = [0.25, 0.5, 0.75, 1].map((t) => ({
      r: R_MIN + t * (R_MAX - R_MIN),
      ms: Math.pow(10, lo + t * span),
    }));
    return { blips: points, rings: ringValues };
  }, [rows, from, now]);

  const threats = blips.filter((blip) => blip.outcome === "blocked" || blip.outcome === "redacted").length;

  return (
    <div className="radar">
      <div className="radar-scope">
        <div className="radar-sweep" aria-hidden="true" />
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Threat radar: ${rows.length} requests, ${threats} blocked or redacted`}>
          <defs>
            <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" className="radar-bg-in" />
              <stop offset="100%" className="radar-bg-out" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={R_MAX + 14} fill="url(#radar-bg)" className="radar-disc" />
          {Array.from({ length: 12 }, (_, index) => {
            const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
            return (
              <line
                key={index}
                x1={C + Math.cos(angle) * R_MIN}
                y1={C + Math.sin(angle) * R_MIN}
                x2={C + Math.cos(angle) * (R_MAX + 14)}
                y2={C + Math.sin(angle) * (R_MAX + 14)}
                className="radar-spoke"
              />
            );
          })}
          {rings.map((ring) => (
            <g key={ring.r}>
              <circle cx={C} cy={C} r={ring.r} className="radar-ring" />
              <text x={C + 5} y={C - ring.r + 12} className="radar-ring-label">
                {fmtMs(ring.ms)}
              </text>
            </g>
          ))}
          <circle cx={C} cy={C} r={R_MAX + 14} className="radar-rim" />
          {Array.from({ length: 72 }, (_, index) => {
            const angle = (index / 72) * Math.PI * 2;
            const long = index % 6 === 0;
            return (
              <line
                key={`t${index}`}
                x1={C + Math.cos(angle) * (R_MAX + 14)}
                y1={C + Math.sin(angle) * (R_MAX + 14)}
                x2={C + Math.cos(angle) * (R_MAX + (long ? 22 : 18))}
                y2={C + Math.sin(angle) * (R_MAX + (long ? 22 : 18))}
                className="radar-tick"
              />
            );
          })}
          <text x={C} y={8} textAnchor="middle" className="radar-axis">NOW</text>
          <text x={SIZE - 2} y={C + 3} textAnchor="end" className="radar-axis">−¼</text>
          <text x={C} y={SIZE - 1} textAnchor="middle" className="radar-axis">−½</text>
          <text x={2} y={C + 3} className="radar-axis">−¾</text>

          {blips.map((blip) => {
            const threat = blip.outcome === "blocked" || blip.outcome === "redacted";
            return (
              <g
                key={blip.row.id}
                className={`blip blip-${blip.outcome}${hover?.id === blip.row.id ? " is-hover" : ""}`}
                style={{ opacity: 1 - blip.age * 0.55 }}
                onMouseEnter={() => setHover(blip.row)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onOpen(blip.row)}
              >
                {threat && <circle cx={blip.x} cy={blip.y} r={5} className="blip-pulse" />}
                <circle cx={blip.x} cy={blip.y} r={threat ? 4.2 : 2.6} className="blip-dot" />
                <circle cx={blip.x} cy={blip.y} r={11} className="blip-hit" />
              </g>
            );
          })}
          <circle cx={C} cy={C} r={R_MIN - 6} className="radar-core" />
          <path
            transform={`translate(${C - 9} ${C - 10}) scale(0.75)`}
            d="M12 2 4 5.2v6.1c0 4.7 3.2 8.7 8 10.7 4.8-2 8-6 8-10.7V5.2L12 2Z"
            className="radar-shield"
          />
        </svg>
      </div>

      <div className={`radar-readout${hover ? " is-on" : ""}`} aria-live="polite">
        {hover ? (
          <>
            <span className={`readout-tag tone-${outcomeOf(hover)}`}>{OUTCOME_LABEL[outcomeOf(hover)]}</span>
            <strong>{hover.application_id}</strong>
            <span>
              {fmtMs(hover.latency_ms)} · {relTime(Date.parse(hover.created_at), now)}
            </span>
            {hover.findings[0] && (
              <span>
                {label(hover.findings[0].category)} {topSeverity(hover) && `· ${topSeverity(hover)}`}
              </span>
            )}
            <em>click to inspect</em>
          </>
        ) : (
          <>
            <span className="readout-tag">Scanning</span>
            <strong>{threats} threats intercepted</strong>
            <span>angle = time · radius = latency</span>
          </>
        )}
      </div>
    </div>
  );
}
