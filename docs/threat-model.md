# Threat model and limitations

## Assets

Provider API keys, user prompts and responses, system prompts, the gateway API
key and the audit trail.

## Trust boundaries

1. Client application to gateway: authenticated with a gateway key, rate limited
   per application, body size limited.
2. Gateway to upstream provider: the provider key never reaches clients.
3. Upstream content to client: untrusted; inspected before delivery.
4. Operators to dashboard, audit API and `/metrics`.

## Mitigated threats

| Threat | Mitigation |
| --- | --- |
| Direct and indirect prompt injection | Heuristic detector on normalized text (Unicode, HTML, percent and base64 decoding), policy blocks high severity |
| System-prompt leakage | Request-scoped canary token, exact and fuzzy match on responses |
| PII and secrets sent to or returned by the model | PII (checksum validated) and secret detectors, redaction by span |
| Partial disclosure over streaming | Holdback tail buffer, per choice and field, flushed with inspection |
| Unauthenticated use | Fail-closed gateway key, constant-time compare; 503 when unset |
| Abuse and cost | Redis per-application rate limit, fail-closed when Redis is down |
| Oversized or chunked bodies | `BULWARK_MAX_REQUEST_BYTES`, 411 for missing `Content-Length` |
| Data retention | Audit is metadata only, prompts and responses are never stored |
| Information disclosure through docs/metrics | Docs and OpenAPI off in production, optional metrics token |

## Residual risks and limitations

- Prompt-injection detection is heuristic. The harness corpus shows that
  non-English phrasing and paraphrases without trigger words are missed
  (`inj-016`, `inj-017`). Treat Bulwark as one layer, not a guarantee.
- Detectors time out at `BULWARK_DETECTOR_TIMEOUT_SECONDS`; `on_detector_error`
  decides whether that fails open (`allow`) or closed (`block`).
- Streaming leakage that spans more than `BULWARK_RESPONSE_TAIL_BUFFER_CHARS`
  characters of one token can evade pattern detectors.
- Content is held back only per field; a model can still split a secret across
  fields (for example two tool arguments).
- The gateway does not terminate TLS; place it behind a TLS-terminating proxy.
- `/metrics` is open unless `BULWARK_METRICS_TOKEN` is set; keep it on an
  internal network.
- Audit write failures after a stream has started are logged, not surfaced.
- The size limit relies on the declared `Content-Length`; a reverse proxy should
  enforce body limits too.
