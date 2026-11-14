# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Per-application keys (`BULWARK_APP_KEYS`) with per-application policies
  (`BULWARK_POLICY_DIR`), rate limits and audit identity. The dashboard audit
  API accepts only the operator key.
- Request `tools` and legacy `functions` definitions are inspected and
  redacted like message content.
- `BULWARK_CANARY_ENABLED` to turn off canary injection.

### Fixed
- Audit records for blocked requests and responses (including streams) now
  include the finding that caused the block and those found before it.
  Previously they were stored with no findings.
- Detector timeouts are now enforced. Detectors are synchronous and run on a
  worker pool; the previous asyncio-only timeout could never interrupt them, so
  `on_detector_error` never triggered. Per-sample detector latency rises from
  about 0.2 ms to 0.5 ms (p50) as a result.

### Changed
- The canary is appended to the request's leading system or developer prompt
  instead of adding a second system message, so a leaked system prompt leaks
  the canary too.
- Policies are cached and re-validated only when the file changes.
- Breaking for custom detectors: `Detector.inspect` is now a regular
  (non-async) method.
- Dashboard visual overhaul ("holographic command center"): an illustrative
  "firewall" backdrop (packets on circuit traces inspected at nodes: passed,
  redacted or blocked), hex grid revealed around the cursor, hex data rain and a
  scan beam; threat radar plotting every loaded request by time and latency, live
  decision ticker, count-up KPIs with 3D tilt and spotlight, neon charts, a one-time
  boot sequence, and self-hosted Space Grotesk and JetBrains Mono fonts. All motion
  is disabled under `prefers-reduced-motion`; the strict CSP is unchanged.
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
