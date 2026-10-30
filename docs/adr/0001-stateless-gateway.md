# ADR-0001: Stateless gateway with PostgreSQL and Redis

- **Status:** accepted
- **Date:** 2026-10-27

## Context

The gateway sits on the hot path of every LLM call. It must add little
latency, survive restarts without losing data, and scale beyond one process.

## Decision

The gateway process keeps no request state. Durable data (policies, audit
records, findings) lives in PostgreSQL; shared fast state (rate-limit counters,
policy cache) lives in Redis.

## Alternatives considered

- **In-process state only:** simplest, but rate limits break with more than one
  replica and data is lost on restart.
- **SQLite:** fine for a demo, but no concurrent writers across replicas.

## Consequences

Any number of replicas can run behind a load balancer. Local development needs
two extra containers, handled by Docker Compose.
