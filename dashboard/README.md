# Bulwark dashboard

The React dashboard displays recent metadata-only audit records, 24-hour
decision/finding summaries, and process-wide Prometheus request metrics. Enter
the gateway API key to access audit data; it is kept only in the current
browser tab's `sessionStorage`.

For local development:

```bash
npm ci
npm run dev
```

The development server proxies `/api` requests to `http://localhost:8080`.
Docker Compose serves the production build at <http://localhost:3000> and
proxies API requests to the gateway service.
