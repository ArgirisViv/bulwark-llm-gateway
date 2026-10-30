const integer = new Intl.NumberFormat("en-US");

export function fmtInt(value: number): string {
  return integer.format(value);
}

export function fmtCompact(value: number): string {
  if (value >= 10_000) return `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return integer.format(value);
}

export function fmtMs(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  if (value >= 100) return `${Math.round(value)} ms`;
  return `${value.toFixed(value < 10 ? 1 : 0)} ms`;
}

export function fmtPct(value: number): string {
  if (value === 0) return "0%";
  return value < 10 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`;
}

export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function fmtShort(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function relTime(ms: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function label(value: string): string {
  return value.replace(/_/g, " ");
}

export const RANGES = [1, 6, 24, 168] as const;
export const RANGE_LABEL: Record<number, string> = { 1: "1h", 6: "6h", 24: "24h", 168: "7d" };
