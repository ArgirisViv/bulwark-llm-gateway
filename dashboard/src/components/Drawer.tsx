import { useEffect, useRef } from "react";
import { fmtInt, fmtMs, fmtShort, label } from "../lib/format";
import type { AuditRequest } from "../types";
import { IconArrow, IconClose, IconCopy } from "./icons";
import { DecisionBadge, Kbd, Severity } from "./ui";

type Props = {
  request: AuditRequest | null;
  position: { index: number; total: number } | null;
  onClose: () => void;
  onStep: (delta: number) => void;
  onCopy: (text: string) => void;
};

export function Drawer({ request, position, onClose, onStep, onCopy }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (request) closeRef.current?.focus();
  }, [request?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!request) return null;

  const upstream = request.upstream_latency_ms;
  const overhead = upstream !== null ? Math.max(0, request.latency_ms - upstream) : request.latency_ms;
  const total = Math.max(request.latency_ms, 0.001);

  return (
    <div className="drawer-layer">
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Request details">
        <header className="drawer-head">
          <div>
            <DecisionBadge decision={request.decision} />
            <h2>{request.application_id}</h2>
            <p>{request.model} · {fmtShort(Date.parse(request.created_at))}</p>
          </div>
          <div className="drawer-tools">
            {position && (
              <>
                <button type="button" className="icon-button flip" onClick={() => onStep(-1)} disabled={position.index <= 0} aria-label="Previous request">
                  <IconArrow />
                </button>
                <button type="button" className="icon-button" onClick={() => onStep(1)} disabled={position.index >= position.total - 1} aria-label="Next request">
                  <IconArrow />
                </button>
              </>
            )}
            <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Close details">
              <IconClose />
            </button>
          </div>
        </header>

        <div className="drawer-body">
          <section>
            <h3>Request ID</h3>
            <button type="button" className="id-copy" onClick={() => onCopy(request.id)}>
              <code>{request.id}</code>
              <IconCopy size={14} />
            </button>
          </section>

          <section>
            <h3>Latency</h3>
            <div className="latency-big">
              <strong>{fmtMs(request.latency_ms)}</strong>
              <span>total gateway time</span>
            </div>
            <div className="split" role="img" aria-label="Latency breakdown">
              <i className="split-upstream" style={{ width: `${upstream !== null ? (upstream / total) * 100 : 0}%` }} />
              <i className="split-gateway" style={{ width: `${(overhead / total) * 100}%` }} />
            </div>
            <dl className="split-legend">
              <div>
                <dt><i className="dot dot-upstream" />Upstream provider</dt>
                <dd>{upstream !== null ? fmtMs(upstream) : "not reached"}</dd>
              </div>
              <div>
                <dt><i className="dot dot-gateway" />Bulwark overhead</dt>
                <dd>{fmtMs(overhead)}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3>Tokens</h3>
            <dl className="facts">
              <div><dt>Prompt</dt><dd>{request.tokens_in !== null ? fmtInt(request.tokens_in) : "—"}</dd></div>
              <div><dt>Completion</dt><dd>{request.tokens_out !== null ? fmtInt(request.tokens_out) : "—"}</dd></div>
            </dl>
          </section>

          <section>
            <h3>Findings <span className="count">{request.findings.length}</span></h3>
            {request.findings.length ? (
              <ul className="finding-list">
                {request.findings.map((finding, index) => (
                  <li key={`${finding.detector}-${index}`}>
                    <div className="finding-top">
                      <strong>{label(finding.category)}</strong>
                      <Severity severity={finding.severity} />
                    </div>
                    <div className="finding-meta">
                      <code>{finding.detector}</code>
                      <span className={`tag tag-${finding.action}`}>{finding.action}</span>
                      <span className="tag">{finding.direction}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No detector flagged this request.</p>
            )}
          </section>

          <p className="privacy">
            Audit records hold metadata only. Prompt and response content is never stored by Bulwark.
          </p>
        </div>

        <footer className="drawer-foot">
          <span><Kbd>J</Kbd> <Kbd>K</Kbd> step through requests</span>
          <span><Kbd>Esc</Kbd> close</span>
        </footer>
      </aside>
    </div>
  );
}
