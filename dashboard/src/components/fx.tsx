import { useEffect, useRef, useState } from "react";
import { label, relTime } from "../lib/format";
import { outcomeOf, topSeverity } from "../lib/analytics";
import type { AuditRequest } from "../types";

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* --------------------------------------------- Pointer effects (one listener) */

/** Spotlight + 3D tilt on cards, ripple on buttons. Installed once at the root. */
export function usePointerFx() {
  useEffect(() => {
    const still = reducedMotion();
    let lastCard: HTMLElement | null = null;

    const onMove = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const card = target?.closest<HTMLElement>(".fx-card") ?? null;
      if (lastCard && lastCard !== card) {
        lastCard.style.removeProperty("--rx");
        lastCard.style.removeProperty("--ry");
        lastCard.classList.remove("is-lit");
      }
      lastCard = card;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      card.style.setProperty("--mx", `${x}px`);
      card.style.setProperty("--my", `${y}px`);
      card.classList.add("is-lit");
      if (!still && card.classList.contains("fx-tilt")) {
        card.style.setProperty("--rx", `${((y / rect.height) - 0.5) * -8}deg`);
        card.style.setProperty("--ry", `${((x / rect.width) - 0.5) * 10}deg`);
      }
    };

    const onDown = (event: PointerEvent) => {
      if (still) return;
      const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        ".fx-ripple, .primary, .secondary, .chip, .ghost, .segmented button, .palette-button, .icon-button",
      );
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      const size = Math.max(rect.width, rect.height) * 2.2;
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      button.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 650);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);
}

/* ------------------------------------------------------------------ CountUp */

export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0);
  const from = useRef(reducedMotion() ? value : 0);

  useEffect(() => {
    if (reducedMotion() || !Number.isFinite(value)) {
      setShown(value);
      from.current = value;
      return;
    }
    // rAF timestamps can be earlier than a performance.now() read in this effect,
    // so the animation clock starts at the first frame and t is clamped to [0, 1].
    let start: number | null = null;
    const origin = from.current;
    const duration = 1100;
    let frame = 0;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const next = origin + (value - origin) * eased;
      setShown(next);
      from.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Background tabs throttle rAF; never leave a stale number on screen.
    const settle = window.setTimeout(() => {
      cancelAnimationFrame(frame);
      setShown(value);
      from.current = value;
    }, duration + 400);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [value]);

  return <span className="countup">{format(shown)}</span>;
}

/* --------------------------------------------------------------------- Boot */

const BOOT_LINES = [
  "bulwark://console  establishing secure session",
  "loading policy engine ............ ok",
  "arming detectors  injection · pii · secrets · canary",
  "attaching audit stream ........... ok",
  "shield online",
];

/** Short terminal boot sequence, shown once per browser session. Click or key skips it. */
export function Boot({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    BOOT_LINES.forEach((_, index) => timers.push(window.setTimeout(() => setLines(index + 1), 160 + index * 230)));
    timers.push(window.setTimeout(() => setLeaving(true), 160 + BOOT_LINES.length * 230 + 250));
    timers.push(window.setTimeout(onDone, 160 + BOOT_LINES.length * 230 + 850));
    const skip = () => onDone();
    window.addEventListener("keydown", skip);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("keydown", skip);
    };
  }, [onDone]);

  return (
    <div className={`boot${leaving ? " is-leaving" : ""}`} onClick={onDone} role="presentation">
      <div className="boot-core">
        <div className="boot-ring" />
        <div className="boot-ring boot-ring-2" />
        <div className="boot-ring boot-ring-3" />
        <svg width="54" height="54" viewBox="0 0 24 24" aria-hidden="true" className="boot-shield">
          <path d="M12 2 4 5.2v6.1c0 4.7 3.2 8.7 8 10.7 4.8-2 8-6 8-10.7V5.2L12 2Z" />
        </svg>
      </div>
      <pre className="boot-log">
        {BOOT_LINES.slice(0, lines).map((line, index) => (
          <div key={line} className={index === BOOT_LINES.length - 1 ? "boot-ok" : ""}>
            <span>{">"}</span> {line}
          </div>
        ))}
        <i className="caret" />
      </pre>
      <div className="boot-bar">
        <i style={{ width: `${(lines / BOOT_LINES.length) * 100}%` }} />
      </div>
      <p className="boot-skip">click or press any key to skip</p>
    </div>
  );
}

/* ------------------------------------------------------------------- Ticker */

export function Ticker({ rows, now, onOpen }: { rows: AuditRequest[]; now: number; onOpen: (row: AuditRequest) => void }) {
  const items = rows.slice(0, 16);
  if (!items.length) return null;
  const renderItems = (copy: number) =>
    items.map((row) => {
      const outcome = outcomeOf(row);
      const finding = row.findings[0];
      return (
        <button
          key={`${copy}-${row.id}`}
          type="button"
          className={`tick tick-${outcome}`}
          onClick={() => onOpen(row)}
          tabIndex={copy === 0 ? 0 : -1}
          aria-hidden={copy === 0 ? undefined : true}
        >
          <i />
          <b>{label(row.decision)}</b>
          <span>{row.application_id}</span>
          {finding && <em>{label(finding.category)}{topSeverity(row) ? ` · ${topSeverity(row)}` : ""}</em>}
          <time>{relTime(Date.parse(row.created_at), now)}</time>
        </button>
      );
    });
  return (
    <div className="ticker" aria-label="Latest decisions">
      <span className="ticker-label">
        <i />
        LIVE FEED
      </span>
      <div className="ticker-track">
        <div className="ticker-run" style={{ animationDuration: `${Math.max(30, items.length * 4.5)}s` }}>
          {renderItems(0)}
          {renderItems(1)}
        </div>
      </div>
    </div>
  );
}
