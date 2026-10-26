# ADR-001: Copy location ids onto each service request

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
Every request is filed in a ward. The headline feature, the national delay map, counts requests per
district and per palika (overdue, pending, on-time rate), filtered by service, status and dates, over
100k+ rows. In a fully normalized schema the district is only reachable through
`ward → local_level → district`.

## Decision
`service_requests` stores `ward_id`, `local_level_id`, `district_id` and `province_id`.
All four are **copied once at insert**, from the ward row (`findWardLocation`), and **never updated**.

## Consequences
**Positive**
- Map statistics are a single-table `GROUP BY district_id` (or `local_level_id`): no joins.
- A composite index such as `(district_id, status, submitted_at)` can serve the map query directly.
- History stays correct if administrative boundaries change later: an old request keeps the location it
  was filed under.
- Scope filters for palika admins (`local_level_id = $n`) are a simple indexed equality.

**Negative**
- Three extra columns per request (a few bytes each).
- The copies could disagree with the ward if code ever updated them. Mitigation: they are set in one
  place at insert, no code path updates them, and they are documented as immutable.

## Alternatives considered
- **Join through wards at query time:** strictly 3NF, but every map query needs 2–3 joins and can't use
  a single composite index; boundary changes would silently move old requests.
- **Materialized view of counts:** fast reads, but adds refresh timing and staleness for a demo-sized system.
