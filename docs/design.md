# Bulwark design document

The living design document is maintained as a shared doc and exported here at
each milestone. Until the first export, see the summary below.

## Summary

Bulwark is a stateless, OpenAI-compatible reverse proxy. Requests pass through
authentication and rate limiting, text normalization, request detectors and a
policy decision before reaching the upstream provider; responses stream back
through response detectors and a second policy decision. Detectors only report
findings; the policy engine alone allows, redacts, blocks or logs.

## Milestones

| Milestone | Scope |
| --- | --- |
| M1 | Repo, CI, Compose stack, non-streaming proxy to one provider, gateway-key auth |
| M2 | Detector interface, normalization, injection/PII/secrets/canary detectors, YAML policies |
| M3 | SSE streaming with response detectors, audit storage, rate limits |
| M4 | React dashboard, Prometheus metrics |
| M5 | Evaluation harness and report, hardening, docs, v1.0.0 |

## M2 implementation notes

- Detector findings carry source-text spans even when analysis uses NFKC or
  decoded HTML, URL-percent, and base64 text.
- The default YAML policy is `gateway/policies/default.yaml`. Policies are
  validated against their generated JSON Schema and Pydantic model whenever a
  chat request is processed, allowing safe hot reloads.
- Enforcement is separate from detectors. The default policy blocks high
  severity injection and canary findings, redacts detected PII and secrets,
  and logs unmatched findings. Monitor mode records configured actions without
  enforcing blocks or redactions.
- The PII detector uses Presidio pattern recognizers and checksum/date
  validation for credit cards, IBANs, Greek AFM and AMKA identifiers, and
  common email and phone formats. Pattern-only NLP means it does not require
  downloading a language model. Windows uses the equivalent local regex path
  because the host's application-control policy blocks Presidio's native
  spaCy extension.

## M4 implementation notes

- The React operator dashboard reads only bounded, authenticated audit
  summaries and recent metadata. It never receives stored prompt or response
  bodies; the gateway API key is held in the browser tab's `sessionStorage`.
- `/metrics` exposes Prometheus HTTP request counters and latency histograms.
  Endpoint labels use known route templates or an `unmatched` bucket to avoid
  high-cardinality labels from arbitrary paths. Prometheus scraping is
  intentionally left to the deployment operator.

## M5 implementation notes

- `eval/harness.py` imports the production detectors and policy evaluator, so
  the report measures what the gateway actually enforces. A sample counts as
  detected only when the detector for its label fires; any finding on benign
  text is a false positive.
- Hardening: optional bearer token for `/metrics`, request-size limit checked
  from `Content-Length` before the body is parsed, security response headers,
  and no OpenAPI schema in production. See `docs/threat-model.md` for residual
  risks.
