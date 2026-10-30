import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "./components/Drawer";
import { Findings } from "./components/Findings";
import { IconCommand, IconFindings, IconLogout, IconMoon, IconOverview, IconRefresh, IconSun, IconTraffic, Logo } from "./components/icons";
import { Login } from "./components/Login";
import { Overview, type Model } from "./components/Overview";
import { Palette, type Command } from "./components/Palette";
import { Traffic } from "./components/Traffic";
import { Kbd } from "./components/ui";
import { useNow, useSnapshot, useTheme } from "./hooks";
import { applyFilters, toCsv } from "./lib/filters";
import { RANGES, RANGE_LABEL, fmtInt, relTime } from "./lib/format";
import { EMPTY_FILTERS, type AuditRequest, type Filters, type Outcome, type Source, type View } from "./types";

const KEY = "bulwark-api-key";
const VIEWS: { id: View; title: string; subtitle: string }[] = [
  { id: "overview", title: "Overview", subtitle: "Traffic, decisions and latency at a glance" },
  { id: "traffic", title: "Traffic", subtitle: "Every audited request, searchable and filterable" },
  { id: "findings", title: "Findings", subtitle: "What the detectors caught, by category and severity" },
];

function viewFromHash(): View {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return VIEWS.some((view) => view.id === hash) ? (hash as View) : "overview";
}

export default function App() {
  const [source, setSource] = useState<Source | null>(() => {
    if (new URLSearchParams(window.location.search).has("demo")) return { kind: "demo" };
    const key = sessionStorage.getItem(KEY);
    return key ? { kind: "live", key } : null;
  });
  const [loginError, setLoginError] = useState("");
  const [hours, setHours] = useState<number>(24);
  const [live, setLive] = useState(true);
  const [view, setView] = useState<View>(viewFromHash);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [theme, toggleTheme] = useTheme();
  const now = useNow();
  const searchRef = useRef<HTMLInputElement>(null);

  const disconnect = useCallback((message = "") => {
    sessionStorage.removeItem(KEY);
    setSource(null);
    setSelectedId(null);
    setFilters(EMPTY_FILTERS);
    setLoginError(message);
  }, []);

  const { snapshot, error, loading, refresh } = useSnapshot(source, hours, live, () =>
    disconnect("The gateway rejected this API key."),
  );

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((next: View) => {
    window.location.hash = `/${next}`;
    setView(next);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? "" : current)), 2200);
  }, []);

  const model = useMemo<Model | null>(() => {
    if (!snapshot) return null;
    const at = snapshot.fetchedAt;
    const windowStart = at - hours * 3_600_000;
    const rows = snapshot.requests.filter((request) => Date.parse(request.created_at) >= windowStart);
    const oldest = snapshot.requests.reduce((min, request) => Math.min(min, Date.parse(request.created_at)), at);
    const truncated = snapshot.requests.length >= 100 && oldest > windowStart;
    return { rows, now: at, domainFrom: truncated ? oldest : windowStart, truncated };
  }, [snapshot, hours]);

  const filtered = useMemo(
    () =>
      model
        ? applyFilters(model.rows, filters).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        : [],
    [model, filters],
  );
  const apps = useMemo(() => [...new Set((model?.rows ?? []).map((row) => row.application_id))].sort(), [model]);

  const selected = useMemo(
    () => (selectedId ? snapshot?.requests.find((request) => request.id === selectedId) ?? null : null),
    [selectedId, snapshot],
  );
  const selectedIndex = selected ? filtered.findIndex((request) => request.id === selected.id) : -1;

  const step = useCallback(
    (delta: number) => {
      if (selectedIndex < 0) return;
      const next = filtered[selectedIndex + delta];
      if (next) setSelectedId(next.id);
    },
    [filtered, selectedIndex],
  );

  const copy = useCallback(
    (text: string) => {
      void navigator.clipboard?.writeText(text).then(
        () => notify("Copied to clipboard"),
        () => notify("Copy is not available in this context"),
      );
    },
    [notify],
  );

  const exportCsv = useCallback(() => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bulwark-audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify(`Exported ${filtered.length} rows`);
  }, [filtered, notify]);

  const focusSearch = useCallback(() => {
    go("traffic");
    window.setTimeout(() => searchRef.current?.focus(), 30);
  }, [go]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing = target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
      if (paletteOpen || typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        focusSearch();
      } else if (event.key === "Escape") {
        setSelectedId(null);
      } else if (selectedId && (event.key === "j" || event.key === "ArrowDown")) {
        event.preventDefault();
        step(1);
      } else if (selectedId && (event.key === "k" || event.key === "ArrowUp")) {
        event.preventDefault();
        step(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, selectedId, step, focusSearch]);

  const openFiltered = useCallback(
    (next: Partial<Filters>) => {
      setFilters({ ...EMPTY_FILTERS, ...next });
      go("traffic");
    },
    [go],
  );

  const commands = useMemo<Command[]>(
    () => [
      ...VIEWS.map((item) => ({ id: `go-${item.id}`, group: "Go to", title: item.title, run: () => go(item.id) })),
      { id: "search", group: "Action", title: "Search requests", hint: "/", run: focusSearch },
      { id: "refresh", group: "Action", title: "Refresh data now", run: () => void refresh() },
      { id: "live", group: "Action", title: live ? "Pause live updates" : "Resume live updates", run: () => setLive((value) => !value) },
      { id: "theme", group: "Action", title: theme === "dark" ? "Switch to light theme" : "Switch to dark theme", run: toggleTheme },
      { id: "blocked", group: "Filter", title: "Show blocked requests", run: () => openFiltered({ decisions: ["blocked"] }) },
      { id: "redacted", group: "Filter", title: "Show redacted requests", run: () => openFiltered({ decisions: ["redacted"] }) },
      { id: "errors", group: "Filter", title: "Show upstream errors", run: () => openFiltered({ decisions: ["error"] }) },
      ...RANGES.map((range) => ({
        id: `range-${range}`,
        group: "Time range",
        title: `Last ${RANGE_LABEL[range]}`,
        run: () => setHours(range),
      })),
      { id: "export", group: "Action", title: "Export current table as CSV", run: exportCsv },
      { id: "disconnect", group: "Session", title: "Disconnect", run: () => disconnect() },
    ],
    [go, focusSearch, refresh, live, theme, toggleTheme, openFiltered, exportCsv, disconnect],
  );

  if (!source) {
    return (
      <Login
        error={loginError}
        onConnect={(key) => {
          sessionStorage.setItem(KEY, key);
          setLoginError("");
          setSource({ kind: "live", key });
        }}
        onDemo={() => {
          setLoginError("");
          setSource({ kind: "demo" });
        }}
      />
    );
  }

  const current = VIEWS.find((item) => item.id === view) ?? VIEWS[0];
  const activeWindow = filters.from !== null && filters.to !== null ? { from: filters.from, to: filters.to } : null;
  const status = error ? "error" : loading && !snapshot ? "loading" : live ? "live" : "paused";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Logo size={22} />
          <span>Bulwark</span>
        </div>
        <nav aria-label="Primary">
          {VIEWS.map((item) => (
            <a
              key={item.id}
              href={`#/${item.id}`}
              className={view === item.id ? "is-active" : ""}
              aria-current={view === item.id ? "page" : undefined}
            >
              {item.id === "overview" && <IconOverview />}
              {item.id === "traffic" && <IconTraffic />}
              {item.id === "findings" && <IconFindings />}
              <span>{item.title}</span>
              {item.id === "traffic" && model && <em>{fmtInt(model.rows.length)}</em>}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          {source.kind === "demo" && <div className="demo-note">Viewing generated sample data</div>}
          <button type="button" onClick={toggleTheme}>
            {theme === "dark" ? <IconSun /> : <IconMoon />}
            <span>{theme === "dark" ? "Light theme" : "Dark theme"}</span>
          </button>
          <button type="button" onClick={() => disconnect()}>
            <IconLogout />
            <span>Disconnect</span>
          </button>
          <div className="version">v1.0.0 · metadata-only audit</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="titles">
            <h1>{current.title}</h1>
            <p>{current.subtitle}</p>
          </div>
          <div className="controls">
            <div className="segmented" role="group" aria-label="Time range">
              {RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  className={hours === range ? "is-on" : ""}
                  aria-pressed={hours === range}
                  onClick={() => setHours(range)}
                >
                  {RANGE_LABEL[range]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`status status-${status}`}
              onClick={() => setLive((value) => !value)}
              title={live ? "Live updates every 15 s. Click to pause." : "Updates paused. Click to resume."}
            >
              <i />
              {status === "error"
                ? "Connection issue"
                : status === "paused"
                  ? "Paused"
                  : snapshot
                    ? `Live · ${relTime(snapshot.fetchedAt, now)}`
                    : "Connecting"}
            </button>
            <button type="button" className="icon-button" onClick={() => void refresh()} aria-label="Refresh now" title="Refresh now">
              <span className={loading ? "spin" : ""}><IconRefresh /></span>
            </button>
            <button type="button" className="palette-button" onClick={() => setPaletteOpen(true)}>
              <IconCommand size={14} />
              <span>Command</span>
              <Kbd>Ctrl K</Kbd>
            </button>
          </div>
        </header>

        {error && (
          <div className="banner" role="alert">
            <strong>{error}</strong>
            <button type="button" onClick={() => void refresh()}>Retry</button>
          </div>
        )}

        <main className="content">
          {!snapshot || !model ? (
            <div className="skeletons" aria-busy="true">
              <div className="sk-row">{[0, 1, 2, 3].map((i) => <div key={i} className="sk" />)}</div>
              <div className="sk sk-tall" />
            </div>
          ) : view === "overview" ? (
            <Overview
              snapshot={snapshot}
              model={model}
              activeWindow={activeWindow}
              onSelectBucket={(bucket) => openFiltered({ from: bucket.start, to: bucket.end })}
              onPickOutcome={(outcome: Outcome) => openFiltered({ decisions: [outcome] })}
              onOpen={(request: AuditRequest) => setSelectedId(request.id)}
              onGo={go}
              onPickCategory={(category) => openFiltered({ q: category })}
            />
          ) : view === "traffic" ? (
            <Traffic
              rows={filtered}
              total={model.rows.length}
              apps={apps}
              filters={filters}
              onFilters={setFilters}
              selectedId={selectedId}
              onOpen={(request) => setSelectedId(request.id)}
              onExport={exportCsv}
              now={now}
              searchRef={searchRef}
            />
          ) : (
            <Findings summary={snapshot.summary} onPickCategory={(category) => openFiltered({ q: category })} />
          )}
        </main>
      </div>

      <Drawer
        request={selected}
        position={selectedIndex >= 0 ? { index: selectedIndex, total: filtered.length } : null}
        onClose={() => setSelectedId(null)}
        onStep={step}
        onCopy={copy}
      />
      {paletteOpen && <Palette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
