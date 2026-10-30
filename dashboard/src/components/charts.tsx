import { useState } from "react";
import { useWidth } from "../hooks";
import { OUTCOMES, OUTCOME_LABEL, type Bucket } from "../lib/analytics";
import { fmtInt, fmtShort } from "../lib/format";
import type { Outcome } from "../types";

export function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  const width = 96;
  const height = 28;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => [index * step, height - 2 - (value / max) * (height - 6)] as const);
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return (
    <svg className={`spark tone-${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={area} className="spark-area" />
      <path d={line} className="spark-line" />
    </svg>
  );
}

type TimelineProps = {
  buckets: Bucket[];
  onSelect: (bucket: Bucket) => void;
  active: { from: number; to: number } | null;
};

export function Timeline({ buckets, onSelect, active }: TimelineProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 300;
  const pad = { top: 12, right: 8, bottom: 26, left: 34 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.total));
  const niceMax = peak <= 4 ? 4 : Math.ceil(peak / 4) * 4;
  const slot = innerW / buckets.length;
  const barW = Math.max(2, slot - Math.min(4, slot * 0.28));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.max(1, Math.round(buckets.length / (width < 520 ? 4 : 7)));

  const hovered = hover === null ? null : buckets[hover];

  return (
    <div className="timeline" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="Requests over time by outcome">
        {ticks.map((tick) => {
          const y = pad.top + innerH - tick * innerH;
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="grid-line" />
              <text x={pad.left - 8} y={y + 3.5} textAnchor="end" className="axis-label">
                {fmtInt(Math.round(tick * niceMax))}
              </text>
            </g>
          );
        })}
        {buckets.map((bucket, index) => {
          const x = pad.left + index * slot + (slot - barW) / 2;
          let cursor = pad.top + innerH;
          const selected = active !== null && bucket.start >= active.from - 1 && bucket.end <= active.to + 1;
          return (
            <g key={bucket.start} className={`bar-group${hover === index ? " is-hover" : ""}${selected ? " is-selected" : ""}`}>
              <rect x={pad.left + index * slot} y={pad.top} width={slot} height={innerH} className="bar-hit" />
              {OUTCOMES.map((outcome) => {
                const count = bucket.counts[outcome];
                if (!count) return null;
                const h = Math.max(1.5, (count / niceMax) * innerH);
                cursor -= h;
                return <rect key={outcome} x={x} y={cursor} width={barW} height={h} rx={1.5} className={`seg seg-${outcome}`} />;
              })}
              {index % labelEvery === 0 && (
                <text x={x + barW / 2} y={height - 8} textAnchor="middle" className="axis-label">
                  {new Date(bucket.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                </text>
              )}
            </g>
          );
        })}
        {hover !== null && (
          <line
            x1={pad.left + hover * slot + slot / 2}
            x2={pad.left + hover * slot + slot / 2}
            y1={pad.top}
            y2={pad.top + innerH}
            className="crosshair"
          />
        )}
        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          className="timeline-surface"
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const index = Math.floor(((event.clientX - box.left) / box.width) * buckets.length);
            setHover(Math.max(0, Math.min(buckets.length - 1, index)));
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => hover !== null && buckets[hover].total > 0 && onSelect(buckets[hover])}
        />
      </svg>
      {hovered && hover !== null && (
        <div
          className="tooltip"
          style={{
            left: Math.min(width - 190, Math.max(0, pad.left + hover * slot + slot / 2 - 90)),
            top: 4,
          }}
          role="status"
        >
          <div className="tooltip-title">{fmtShort(hovered.start)}</div>
          <div className="tooltip-total">
            {fmtInt(hovered.total)} <span>requests</span>
          </div>
          {OUTCOMES.map((outcome) => (
            <div className="tooltip-row" key={outcome}>
              <i className={`dot dot-${outcome}`} />
              {OUTCOME_LABEL[outcome]}
              <b>{fmtInt(hovered.counts[outcome])}</b>
            </div>
          ))}
          {hovered.total > 0 && <div className="tooltip-hint">Click to inspect</div>}
        </div>
      )}
    </div>
  );
}

export function OutcomeBar({ counts, onPick }: { counts: Record<Outcome, number>; onPick?: (outcome: Outcome) => void }) {
  const total = OUTCOMES.reduce((sum, outcome) => sum + counts[outcome], 0);
  return (
    <div className="outcome">
      <div className="outcome-bar" role="img" aria-label="Outcome distribution">
        {OUTCOMES.map((outcome) =>
          counts[outcome] ? (
            <button
              key={outcome}
              type="button"
              className={`outcome-seg seg-${outcome}`}
              style={{ flexGrow: counts[outcome] }}
              onClick={() => onPick?.(outcome)}
              aria-label={`${OUTCOME_LABEL[outcome]}: ${counts[outcome]}`}
            />
          ) : null,
        )}
        {!total && <span className="outcome-empty" />}
      </div>
      <ul className="outcome-legend">
        {OUTCOMES.map((outcome) => (
          <li key={outcome}>
            <i className={`dot dot-${outcome}`} />
            <span>{OUTCOME_LABEL[outcome]}</span>
            <b>{fmtInt(counts[outcome])}</b>
            <em>{total ? `${((counts[outcome] / total) * 100).toFixed(1)}%` : "0%"}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Histogram({ bins, p50, p95, cap }: { bins: number[]; p50: number; p95: number; cap: number }) {
  const max = Math.max(1, ...bins);
  const pos = (value: number) => `${Math.min(100, (value / cap) * 100)}%`;
  return (
    <div className="histogram" aria-hidden="true">
      <div className="histogram-bars">
        {bins.map((count, index) => (
          <span key={index} style={{ height: `${Math.max(count ? 6 : 2, (count / max) * 100)}%` }} />
        ))}
      </div>
      <i className="marker marker-p50" style={{ left: pos(p50) }} />
      <i className="marker marker-p95" style={{ left: pos(p95) }} />
    </div>
  );
}
