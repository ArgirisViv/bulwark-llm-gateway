# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Redesigned operator dashboard: Overview, Traffic and Findings views, request
  detail drawer, command palette (Ctrl/⌘+K), keyboard navigation, dark/light
  themes, latency percentiles, CSV export and a built-in sample-data mode.
- New sign-in screen with an illustrative inspection stream, key reveal toggle,
  Caps Lock hint and entrance animations across the console.

## [1.0.0]

### Added
- M5 evaluation harness (`eval/harness.py`), labelled corpus, generated report,
  and a test-suite regression gate on the corpus.
- Optional `BULWARK_METRICS_TOKEN` for `/metrics`, `BULWARK_MAX_REQUEST_BYTES`
  request-size limit (413/411), security response headers, and disabled
  `/openapi.json` in production.
- Streaming edge-case tests (refusal, legacy function_call, multi-line SSE
  events, split secrets, upstream errors) and a threat model document.
- Hardened Docker deployment: loopback-only published ports, dropped
  capabilities, `no-new-privileges`, read-only filesystems, unprivileged nginx
  (dashboard now listens on 8080 in the container), healthchecks, and CI image
  builds plus Compose validation.

### Added
- Project scaffold: gateway app factory, health endpoint, request-id middleware,
  CI, Docker Compose stack.
- M1 authenticated OpenAI-compatible proxy for chat completions and model lists.
- M2 Unicode/encoding normalization, injection/PII/secrets/canary detectors,
  validated hot-reload YAML policies, and request/response enforcement.
- Default policy, detector/policy tests, and documented policy configuration.
- M3 inspected SSE streaming, metadata-only PostgreSQL audit history, Redis
  application rate limits, and Ollama-compatible provider selection.
- M4 React operator dashboard with authenticated audit views and Prometheus
  HTTP request/latency metrics.
