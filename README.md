# Bulwark

> Self-hosted, OpenAI-compatible security gateway for LLM applications.

Bulwark sits between your application and an LLM provider. It inspects every
request and response for prompt injection, system-prompt leakage, personal
data and secrets, enforces a per-application policy (allow, redact, block, log)
and keeps a full audit trail. Adopting it means changing one setting: your
client's `base_url`.

**Status:** v1.0.0, milestones M1-M5 complete (proxy, inspection, streaming, audit, rate limiting, dashboard, metrics, evaluation harness and hardening).

## Quick start

```bash
cp .env.example .env          # set a strong gateway key and your upstream API key
docker compose up --build
curl http://localhost:8080/healthz
```

The proxy requires a configured gateway key and uses the standard OpenAI
authorization header. For example:

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer $BULWARK_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'
```

The gateway supports authenticated streaming and non-streaming chat completions.
`BULWARK_UPSTREAM_PROVIDER=openai-compatible` selects a hosted OpenAI-compatible
upstream; `ollama` selects Ollama's OpenAI-compatible API (set
`BULWARK_UPSTREAM_BASE_URL`, commonly `http://ollama:11434/v1`). The authenticated
`/v1/models` endpoint is proxied to the selected upstream.

M2 adds request and response inspection for prompt-injection patterns, PII,
secrets and request-scoped canary disclosure. Configure enforcement in
`gateway/policies/default.yaml` or point `BULWARK_POLICY_PATH` at another YAML
policy. Policies are reloaded and schema-validated for each chat request, so
valid file edits take effect without restarting the gateway. The default policy
blocks high-severity injection and canary findings, redacts detected PII and
secrets, and logs other findings.

M3 adds bounded-tail SSE inspection so response content is not sent to clients
until checked, metadata-only request/finding audit records in PostgreSQL, Redis
per-application request limits, and `/readyz` dependency checks. Docker Compose
runs Alembic migrations before starting the gateway. Audit records include
policy decisions, timing, token counts when supplied by the provider, and
finding metadata; prompts and responses are never persisted.

M4 adds an operator dashboard at <http://localhost:3000> and Prometheus metrics
at <http://localhost:8080/metrics>. The dashboard prompts for the gateway API
key, keeps it in the current tab's `sessionStorage`, and displays recent
metadata-only audit activity and 24-hour policy summaries. Scrape `/metrics`
from your Prometheus server to collect HTTP request counts and latency
histograms; no Prometheus server is bundled.

M5 adds hardening and an evaluation harness. The Compose stack publishes ports
on `127.0.0.1` only (set `BULWARK_BIND_ADDRESS=0.0.0.0` behind a TLS-terminating
proxy), runs every container with all capabilities dropped (except the few
Postgres/Redis need to drop privileges), `no-new-privileges`, read-only root
filesystems for the gateway, dashboard and Redis, and an unprivileged nginx for
the dashboard. Set `BULWARK_METRICS_TOKEN` to
require `Authorization: Bearer <token>` on `/metrics`. Request bodies are
limited by `BULWARK_MAX_REQUEST_BYTES` (default 1 MiB, HTTP 413) and chunked
uploads without a `Content-Length` are refused (HTTP 411). With
`BULWARK_ENV=production`, `/docs` and `/openapi.json` are disabled. Responses
carry `X-Content-Type-Options`, `Cache-Control` and `Referrer-Policy` headers.

## Evaluation

```bash
cd gateway
uv run python ../eval/harness.py --output ../eval/reports
```

The harness runs the labelled corpus in `eval/corpus/corpus.jsonl` through the
real detectors and the default policy, and writes `report.md` and `report.json`
(recall per category, precision, false-positive rate, latency). The latest
report is committed as [eval/REPORT.md](eval/REPORT.md); the same corpus gates
regressions in the test suite. The corpus is small and hand-written, so treat
the numbers as a baseline, not as real-world detection rates.

## Local development

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
cd gateway
uv sync                       # creates .venv and installs dependencies
uv run pytest                 # tests
make -C .. check              # lint, format check, type check, tests
make -C .. run                # dev server with reload on :8080
```

For dashboard development, run `npm ci && npm run dev` from `dashboard/`.

## Repository layout

| Path | Contents |
| --- | --- |
| `gateway/` | FastAPI proxy and admin API (Python) |
| `dashboard/` | React + TypeScript dashboard (milestone M4) |
| `eval/` | Evaluation corpus, harness and report |
| `docs/` | Design document, ADRs, [threat model](docs/threat-model.md) |

## Documentation

- [Design document](docs/design.md)
- [Threat model and limitations](docs/threat-model.md)
- [Architecture decision records](docs/adr/)
- [Security policy](SECURITY.md)

## License

MIT, see [LICENSE](LICENSE).
