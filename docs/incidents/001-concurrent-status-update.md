# Incident 001: The concurrency test passed without testing the database guard

- **Date:** 2026-10-26
- **Severity:** Low (found before release; no users affected)
- **Type:** Blameless post-incident review of a **test gap**, found during development

## Summary
The API test "two officers act at the same instant → exactly one 200 and one 409" passed. A deliberate
experiment showed it would **still pass for the wrong reason**: the two HTTP requests didn't actually
overlap, so the loser's 409 came from the service's early version check, and the database-level guard
(`WHERE id = $1 AND version = $2`, ADR-002) was **never exercised**. A regression in that guard would not
have been caught.

## How it was found
After implementing status changes, we ran two experiments on temporary copies of the code:

| Experiment | Change | API concurrency test result |
|---|---|---|
| A | Removed the early check **and** the `WHERE version` guard | Loser got **422**, not 409 |
| B | Removed only the early check, kept the `WHERE` guard | Loser got **422**, not 409 |

In both, the second request read the row **after** the first had committed, saw the new status, and was
refused by the transition rules (422). The requests were effectively sequential, so the test could not
tell whether the database guard worked.

## Impact
None in production (not released). Risk if unnoticed: a future change to the `UPDATE` (for example
during a refactor) could reintroduce **lost updates**, where one officer's decision silently overwrites
another's, with tests still green.

## Root cause
The test relied on timing (`Promise.all` of two HTTP calls) to create a race. Within one Node process
and a fast local database, the first request usually completes before the second reads. **A test that
depends on timing to create a race usually doesn't create one.**

## Fix
1. Added `apps/api/test/locking.test.ts`, which **forces** the race deterministically:
   two transactions both expect version 0 → writer 1 updates (holds the row lock) → writer 2's update
   is verified to be **blocked** → writer 1 commits → writer 2 returns **0 rows**.
2. **Mutation check:** with the `WHERE version` guard removed, the new test fails with a real lost update
   (`expected { status: 'CANCELLED', version: 2 } to be null`). With the guard, it passes.
3. Kept the API test (it still verifies the end-to-end behaviour: one 200, one 409, one audit row, one
   notification) and documented in it that the database guard is proven in `locking.test.ts`.

## Lessons
- **Prove a test can fail.** Break the code on purpose (mutation testing) and confirm the test turns red.
- **Force races; don't hope for them.** Control the interleaving (explicit transactions, locks,
  barriers) instead of relying on scheduling.
- **Layered defences need layered tests.** The early check and the database guard protect different
  windows; each needs its own test.

## Action items
- [x] Deterministic locking test + mutation check (this PR)
- [ ] Apply the same check to `markFeePaidWithVersion` when the fee flow gets a UI
- [ ] Consider a mutation-testing tool for the domain and repository layers (post-v1)
