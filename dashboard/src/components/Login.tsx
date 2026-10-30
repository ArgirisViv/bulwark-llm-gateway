import { useState } from "react";
import { IconArrow, Logo } from "./icons";

type Props = { error: string; onConnect: (key: string) => void; onDemo: () => void };

export function Login({ error, onConnect, onDemo }: Props) {
  const [key, setKey] = useState("");

  return (
    <main className="login">
      <section className="login-aside">
        <div className="brand">
          <Logo size={26} />
          <span>Bulwark</span>
        </div>
        <div className="login-copy">
          <h1>Every prompt inspected.<br />Every decision on record.</h1>
          <p>
            Operations console for the Bulwark LLM security gateway. Review policy decisions, redactions and
            detector findings across your applications, without ever exposing prompt content.
          </p>
          <ul>
            <li><b>Metadata only</b> audit trail</li>
            <li><b>Streaming-safe</b> response inspection</li>
            <li><b>Policy as code</b> decisions you can review</li>
          </ul>
        </div>
        <div className="login-grid" aria-hidden="true" />
      </section>

      <section className="login-panel">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (key.trim()) onConnect(key.trim());
          }}
        >
          <h2>Connect to a gateway</h2>
          <p className="muted">Use the gateway API key. It stays in this browser tab and is cleared when you close it.</p>
          <label htmlFor="api-key">Gateway API key</label>
          <input
            id="api-key"
            type="password"
            autoComplete="current-password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="BULWARK_GATEWAY_API_KEY"
            autoFocus
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="primary" disabled={!key.trim()}>
            Connect <IconArrow size={14} />
          </button>
          <div className="or"><span>or</span></div>
          <button type="button" className="secondary" onClick={onDemo}>
            Explore with sample data
          </button>
          <p className="fine">Sample data is generated in your browser. No gateway connection is made.</p>
        </form>
      </section>
    </main>
  );
}
