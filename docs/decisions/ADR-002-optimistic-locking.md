# ADR-002: Optimistic locking for request changes

- **Status:** Accepted
- **Date:** 2026-10-21 (implemented 2026-10-26)

## Context
Several officers can work in the same ward, and an officer typically opens a request, reads it, and
acts minutes later. Two people may act on the same request at almost the same time. Without
protection, the second write silently overwrites the first (a **lost update**): for example, one
officer rejects while another asks for documents, and only one decision survives without anyone noticing.

## Decision
- `service_requests.version integer NOT NULL DEFAULT 0`.
- Every change sends the `version` the user saw. The update is
  ```sql
  UPDATE service_requests SET ..., version = version + 1
  WHERE id = $1 AND version = $2
  RETURNING status, version;
  ```
- 0 rows updated → someone else changed it first → the transaction rolls back → **409 CONFLICT**
  ("This request was updated by someone else. Reload to see the latest.").
- The service also rejects a stale `version` before starting the transaction (a cheap early check);
  the `WHERE` clause remains the real guarantee for changes that race in between.
- The status change and its audit row are written in the same transaction.

## Why it is safe under true concurrency
In PostgreSQL (READ COMMITTED), an `UPDATE` takes a row lock. A second `UPDATE` on the same row waits;
when the first commits, the second **re-evaluates its `WHERE`** against the new row version, finds
`version` changed, and updates 0 rows. Proven by `apps/api/test/locking.test.ts` with a forced race
(see incident 001).

## Consequences
**Positive:** no locks held while people read; conflicts are rare and handled with a clear message;
works across any number of API instances (the database is the referee).
**Negative:** the client must carry `version`; a loser must reload and retry.

## Alternatives considered
- **Pessimistic locking (`SELECT … FOR UPDATE`) while the officer has the page open:** blocks other
  officers for minutes and leaves locks behind abandoned tabs.
- **Last write wins:** simple, but silently loses decisions in an audited public-service workflow.
