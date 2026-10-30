import { label } from "../lib/format";

export function DecisionBadge({ decision }: { decision: string }) {
  return (
    <span className={`badge badge-${decision}`}>
      <i />
      {label(decision)}
    </span>
  );
}

export function Severity({ severity }: { severity: string }) {
  if (!severity) return <span className="muted">—</span>;
  return <span className={`sev sev-${severity}`}>{severity}</span>;
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd>{children}</kbd>;
}
