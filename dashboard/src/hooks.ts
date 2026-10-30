import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchLive } from "./lib/api";
import { demoSnapshot } from "./lib/demo";
import type { Snapshot, Source } from "./types";

export function useSnapshot(source: Source | null, hours: number, live: boolean, onUnauthorized: () => void) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  const load = useCallback(async () => {
    if (!source) return;
    const ticket = ++request.current;
    setLoading(true);
    try {
      const data =
        source.kind === "demo"
          ? { ...demoSnapshot(hours), }
          : await fetchLive(source.key, hours);
      if (ticket !== request.current) return;
      setSnapshot({ ...data, fetchedAt: Date.now() });
      setError("");
    } catch (reason) {
      if (ticket !== request.current) return;
      if (reason instanceof ApiError && reason.status === 401) unauthorized.current();
      setError(reason instanceof Error ? reason.message : "Unable to load dashboard data.");
    } finally {
      if (ticket === request.current) setLoading(false);
    }
  }, [source, hours]);

  useEffect(() => {
    void load();
    if (!live || !source) return;
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load, live, source]);

  useEffect(() => {
    if (!source) {
      request.current += 1;
      setSnapshot(null);
      setError("");
    }
  }, [source]);

  return { snapshot, error, loading, refresh: load };
}

export type Theme = "dark" | "light";

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("bulwark-theme", next);
      return next;
    });
  }, []);
  return [theme, toggle];
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0].contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
