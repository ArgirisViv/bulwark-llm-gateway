import { useEffect, useRef } from "react";
import { reducedMotion } from "./fx";

/*
 * "Firewall" backdrop. Packets travel along circuit traces and are inspected at
 * nodes: clean packets pass, sensitive ones are redacted (turn amber), threats are
 * blocked (burst). Purely illustrative: it never reflects real gateway traffic.
 */

type Point = { x: number; y: number };
type Trace = { pts: Point[]; cum: number[]; len: number; node: number; nodePt: Point; flash: number; flashColor: string };
type Fate = "pass" | "redact" | "block";
type Packet = { trace: Trace; d: number; speed: number; fate: Fate; inspected: boolean; redacted: boolean; hist: Point[] };
type Burst = { x: number; y: number; t: number; color: string; big: boolean };
type Column = { x: number; y: number; speed: number; chars: string[]; tick: number };

const CELL = 44;
const HEX = "0123456789ABCDEF";

function palette() {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    accent: read("--fx-node", "34, 228, 255"),
    hot: read("--fx-hot", "255, 59, 107"),
    warn: read("--fx-warn", "255, 181, 71"),
    alpha: Number(read("--fx-alpha", "1")),
    blend: (read("--fx-blend", "lighter") as GlobalCompositeOperation) || "lighter",
  };
}

function pointAt(trace: Trace, d: number): Point {
  const { pts, cum } = trace;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i += 1;
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / segLen));
  return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
}

function buildTraces(width: number, height: number): Trace[] {
  const cols = Math.ceil(width / CELL) + 2;
  const rows = Math.ceil(height / CELL);
  const count = Math.max(8, Math.round((width * height) / 52000));
  const traces: Trace[] = [];
  for (let n = 0; n < count; n += 1) {
    let col = -1 - Math.floor(Math.random() * 3);
    let row = 1 + Math.floor(Math.random() * Math.max(1, rows - 2));
    const pts: Point[] = [{ x: col * CELL, y: row * CELL }];
    while (col < cols) {
      col += 2 + Math.floor(Math.random() * 6);
      pts.push({ x: col * CELL, y: row * CELL });
      if (Math.random() < 0.65) {
        const step = (1 + Math.floor(Math.random() * 3)) * (Math.random() < 0.5 ? -1 : 1);
        row = Math.min(rows - 1, Math.max(1, row + step));
        // 45° chamfer like a real PCB trace, then continue horizontally.
        const last = pts[pts.length - 1];
        const dy = row * CELL - last.y;
        if (dy !== 0) pts.push({ x: last.x + Math.abs(dy), y: row * CELL });
        col = Math.round(pts[pts.length - 1].x / CELL);
      }
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i += 1) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const len = cum[cum.length - 1];
    const trace: Trace = { pts, cum, len, node: len * (0.35 + Math.random() * 0.4), nodePt: { x: 0, y: 0 }, flash: 0, flashColor: "" };
    trace.nodePt = pointAt(trace, trace.node);
    traces.push(trace);
  }
  return traces;
}

export function Backdrop() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !canvas || !ctx) return;

    let colors = palette();
    const themeObserver = new MutationObserver(() => {
      colors = palette();
      paintStatic();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const still = reducedMotion();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const layer = document.createElement("canvas");
    const lctx = layer.getContext("2d")!;
    let width = 0;
    let height = 0;
    let traces: Trace[] = [];
    let packets: Packet[] = [];
    let bursts: Burst[] = [];
    let columns: Column[] = [];
    const mouse = { x: -999, y: -999, seen: false };

    function paintStatic() {
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, width, height);
      const { accent, alpha } = colors;
      lctx.lineWidth = 1;
      lctx.lineJoin = "round";
      for (const trace of traces) {
        lctx.strokeStyle = `rgba(${accent}, ${0.11 * alpha})`;
        lctx.beginPath();
        trace.pts.forEach((p, i) => (i ? lctx.lineTo(p.x, p.y) : lctx.moveTo(p.x, p.y)));
        lctx.stroke();
        for (let i = 1; i < trace.pts.length - 1; i += 1) {
          const p = trace.pts[i];
          lctx.fillStyle = `rgba(${accent}, ${0.2 * alpha})`;
          lctx.beginPath();
          lctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
          lctx.fill();
        }
      }
    }

    function spawnPacket(at?: number): Packet {
      const trace = traces[Math.floor(Math.random() * traces.length)];
      const roll = Math.random();
      const fate: Fate = roll < 0.12 ? "block" : roll < 0.3 ? "redact" : "pass";
      const d = at ?? 0;
      return { trace, d, speed: 70 + Math.random() * 90, fate, inspected: d > trace.node, redacted: false, hist: [] };
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      for (const c of [canvas!, layer]) {
        c.width = width * dpr;
        c.height = height * dpr;
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      traces = buildTraces(width, height);
      packets = Array.from({ length: Math.round(traces.length * 1.4) }, () => {
        const p = spawnPacket();
        p.d = Math.random() * p.trace.len;
        p.inspected = p.d > p.trace.node;
        return p;
      });
      columns = Array.from({ length: Math.round(width / 120) }, () => ({
        x: Math.floor(Math.random() * (width / 18)) * 18,
        y: Math.random() * height,
        speed: 25 + Math.random() * 45,
        chars: Array.from({ length: 10 + Math.floor(Math.random() * 12) }, () => HEX[Math.floor(Math.random() * 16)]),
        tick: 0,
      }));
      bursts = [];
      paintStatic();
    }
    resize();

    const onMove = (event: PointerEvent) => {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      mouse.seen = true;
      root.style.setProperty("--cx", `${event.clientX}px`);
      root.style.setProperty("--cy", `${event.clientY}px`);
    };
    const onLeave = () => {
      mouse.seen = false;
      root.style.setProperty("--cx", "-999px");
      root.style.setProperty("--cy", "-999px");
    };
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    let last = performance.now();
    let frame = 0;
    let spin = 0;

    const draw = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const { accent, hot, warn, alpha, blend } = colors;
      ctx.clearRect(0, 0, width, height);

      // Hex data rain, very faint, behind everything else.
      ctx.font = '500 12px "JetBrains Mono Variable", monospace';
      for (const col of columns) {
        col.y += col.speed * dt;
        col.tick += dt;
        if (col.tick > 0.12) {
          col.tick = 0;
          col.chars[Math.floor(Math.random() * col.chars.length)] = HEX[Math.floor(Math.random() * 16)];
        }
        if (col.y - col.chars.length * 16 > height) {
          col.y = -20;
          col.x = Math.floor(Math.random() * (width / 18)) * 18;
        }
        col.chars.forEach((ch, i) => {
          const a = (i === 0 ? 0.32 : 0.14 * (1 - i / col.chars.length)) * alpha;
          ctx.fillStyle = `rgba(${accent}, ${a})`;
          ctx.fillText(ch, col.x, col.y - i * 16);
        });
      }

      ctx.drawImage(layer, 0, 0, width, height);
      ctx.globalCompositeOperation = blend;

      // Inspection nodes.
      for (const trace of traces) {
        trace.flash = Math.max(0, trace.flash - dt * 2.2);
        const { x, y } = trace.nodePt;
        const pulse = 0.55 + Math.sin(now / 600 + x) * 0.2;
        const color = trace.flash > 0 ? trace.flashColor : accent;
        const s = 5 + trace.flash * 4;
        ctx.strokeStyle = `rgba(${color}, ${(pulse + trace.flash) * 0.6 * alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s, y);
        ctx.lineTo(x, y + s);
        ctx.lineTo(x - s, y);
        ctx.closePath();
        ctx.stroke();
        if (trace.flash > 0) {
          ctx.fillStyle = `rgba(${color}, ${trace.flash * 0.18 * alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, 18 + (1 - trace.flash) * 14, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Packets.
      const survivors: Packet[] = [];
      for (const packet of packets) {
        packet.d += packet.speed * dt;
        const pos = pointAt(packet.trace, packet.d);
        packet.hist.unshift(pos);
        if (packet.hist.length > 14) packet.hist.pop();

        if (!packet.inspected && packet.d >= packet.trace.node) {
          packet.inspected = true;
          const trace = packet.trace;
          if (packet.fate === "block") {
            bursts.push({ x: trace.nodePt.x, y: trace.nodePt.y, t: 0, color: hot, big: true });
            trace.flash = 1;
            trace.flashColor = hot;
            continue;
          }
          trace.flash = packet.fate === "redact" ? 0.9 : 0.45;
          trace.flashColor = packet.fate === "redact" ? warn : accent;
          if (packet.fate === "redact") {
            packet.redacted = true;
            bursts.push({ x: trace.nodePt.x, y: trace.nodePt.y, t: 0, color: warn, big: false });
          }
        }
        if (packet.d > packet.trace.len + 40) continue;
        survivors.push(packet);

        const threat = packet.fate === "block" && !packet.inspected;
        const color = packet.redacted ? warn : threat ? hot : accent;
        for (let i = 1; i < packet.hist.length; i += 1) {
          ctx.strokeStyle = `rgba(${color}, ${(1 - i / packet.hist.length) * 0.55 * alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(packet.hist[i - 1].x, packet.hist[i - 1].y);
          ctx.lineTo(packet.hist[i].x, packet.hist[i].y);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(${color}, ${0.16 * alpha})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
        ctx.fill();
        if (packet.redacted) {
          ctx.strokeStyle = `rgba(${color}, ${0.95 * alpha})`;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(pos.x - 2.5, pos.y - 2.5, 5, 5);
        } else {
          ctx.fillStyle = `rgba(${color}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, threat ? 2.6 : 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      packets = survivors;
      const target = Math.round(traces.length * 1.4);
      while (packets.length < target) packets.push(spawnPacket());

      // Block / redact bursts.
      bursts = bursts.filter((burst) => {
        burst.t += dt * (burst.big ? 1.6 : 2.2);
        if (burst.t >= 1) return false;
        const k = 1 - burst.t;
        const r = (burst.big ? 34 : 18) * burst.t + 4;
        ctx.strokeStyle = `rgba(${burst.color}, ${k * 0.9 * alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, r, 0, Math.PI * 2);
        ctx.stroke();
        if (burst.big) {
          ctx.fillStyle = `rgba(${burst.color}, ${k * 0.12 * alpha})`;
          ctx.beginPath();
          ctx.arc(burst.x, burst.y, 70 * burst.t + 10, 0, Math.PI * 2);
          ctx.fill();
          for (let i = 0; i < 8; i += 1) {
            const a = (i / 8) * Math.PI * 2 + burst.x;
            ctx.beginPath();
            ctx.moveTo(burst.x + Math.cos(a) * r * 0.7, burst.y + Math.sin(a) * r * 0.7);
            ctx.lineTo(burst.x + Math.cos(a) * r * 1.4, burst.y + Math.sin(a) * r * 1.4);
            ctx.stroke();
          }
        }
        return true;
      });

      // Targeting reticle around the cursor.
      if (mouse.seen) {
        spin += dt * 1.4;
        ctx.strokeStyle = `rgba(${accent}, ${0.7 * alpha})`;
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 4; i += 1) {
          const a = spin + (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 20, a, a + 0.7);
          ctx.stroke();
        }
        ctx.strokeStyle = `rgba(${accent}, ${0.35 * alpha})`;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 30, -spin * 0.6, -spin * 0.6 + Math.PI * 1.2);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = "source-over";
      if (!still && !document.hidden) frame = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (!document.hidden && !still) {
        cancelAnimationFrame(frame);
        last = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="fx-backdrop" ref={rootRef} aria-hidden="true">
      <div className="fx-aurora">
        <i />
        <i />
        <i />
      </div>
      <div className="fx-hex" />
      <div className="fx-hex fx-hex-lit" />
      <canvas ref={canvasRef} className="fx-canvas" />
      <div className="fx-scan" />
      <div className="fx-crt" />
      <div className="fx-noise" />
      <div className="fx-vignette" />
    </div>
  );
}
