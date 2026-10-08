# Sola — Architecture

```
packages/core   Pure TypeScript domain logic. No I/O, no framework. Money/weight/purity,
                pricing, trade-in, pawn interest, savings, permissions. Fully unit-tested.
apps/api        Fastify HTTP API.  http/ (routes, auth, validation) → services/ (business rules,
                transactions, audit) → repos/ (SQL only) → db/schema.ts (migrations).
apps/web        React POS UI — talks to the API only; imports formatting helpers from core.
```

Dependencies point inward: `web → api (HTTP)`, `api → core`, `core → nothing`. Mobile apps or other
clients can reuse the HTTP API and `@sola/core`. Swapping SQLite for PostgreSQL touches `db/` and
`repos/` only; services keep the same signatures (they run inside `db.transaction`, which maps to a
Postgres transaction).

**Invariants enforced in services, not the UI:** one DB transaction per business operation (sale,
void, renew, forfeit…); stock + payments + documents + points + audit written atomically; payments
must equal the amount due; sold/forfeited stock cannot be double-sold; buying gold requires an
identified customer; permissions are re-checked per request (and per *content*: discounts,
trade-ins, value overrides).
