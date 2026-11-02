import type pg from 'pg';
import { generateTrackingCode } from '../domain/trackingCode.js';

/**
 * Bulk DEMO data for performance work (PRD F11): N fake requests over the last 12 months.
 * Everything is fake: one "Bulk Citizen (Demo)" account, applicants "Demo Applicant N", IDs DEMO-.
 *
 * Realistic skew, so the map looks like a real country and indexes are tested on uneven data:
 *   - busy districts (Kathmandu valley, Jhapa, Morang, Sunsari, Rupandehi, Kaski, Chitwan…) get more requests
 *   - ~65% closed (mostly ISSUED), ~35% still open; most open requests are recent, some are stuck
 *   - closing takes 0.2× to 2.5× the promised days, so some are late
 *
 * Inserted in batches with one INSERT … SELECT FROM jsonb_to_recordset per batch (as in seed.ts).
 * DESTRUCTIVE: empties the request tables first (TRUNCATE). For development databases only.
 */

const BUSY_DISTRICTS: Record<string, number> = {
  Kathmandu: 12, Lalitpur: 6, Bhaktapur: 4, Jhapa: 5, Morang: 5, Sunsari: 4,
  Rupandehi: 4, Kaski: 4, Chitwan: 4, Parsa: 3, Dhanusha: 3, Kailali: 3,
};

const SERVICE_DAYS: Record<string, number> = { RELATIONSHIP: 1, RESIDENCE: 1, LOW_INCOME: 2, LAND_BOUNDARY: 3, DATE_OF_BIRTH: 1 };
const FIELD_SERVICES = new Set(['LOW_INCOME', 'LAND_BOUNDARY']);
const SERVICES = Object.keys(SERVICE_DAYS);

const DAY_MS = 86_400_000;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

interface WardRow {
  wardId: number;
  localLevelId: number;
  districtId: number;
  provinceId: number;
  weight: number;
}

/** Picks a ward with probability proportional to its weight (busy districts more often). */
function weightedPicker(wards: WardRow[]): () => WardRow {
  const cumulative: number[] = [];
  let total = 0;
  for (const w of wards) cumulative.push((total += w.weight));
  return () => {
    const r = Math.random() * total;
    // Binary search: first index whose cumulative weight is above r.
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid]! > r) hi = mid;
      else lo = mid + 1;
    }
    return wards[lo]!;
  };
}

export async function seedLarge(client: pg.ClientBase, count: number, now = new Date()): Promise<{ requests: number; events: number }> {
  const { rows: wardRows } = await client.query<Omit<WardRow, 'weight'> & { districtName: string }>(
    `SELECT w.id AS "wardId", l.id AS "localLevelId", d.id AS "districtId", d.province_id AS "provinceId", d.name_en AS "districtName"
     FROM wards w JOIN local_levels l ON l.id = w.local_level_id JOIN districts d ON d.id = l.district_id`,
  );
  const wards = wardRows.map((w) => ({ ...w, weight: BUSY_DISTRICTS[w.districtName] ?? 1 }));
  const randomWard = weightedPicker(wards);

  await client.query('BEGIN');
  try {
    await client.query('TRUNCATE request_events, identity_checks, service_requests');
    const { rows: citizen } = await client.query<{ id: string }>(
      `INSERT INTO users (role, name, email, phone, password_hash) VALUES ('CITIZEN', 'Bulk Citizen (Demo)', 'bulk.citizen@example.com', '9099999999', 'no-login')
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const citizenId = citizen[0]!.id;

    const BATCH = 5_000;
    for (let start = 0; start < count; start += BATCH) {
      const batch = [];
      for (let i = start; i < Math.min(start + BATCH, count); i++) {
        const service = pick(SERVICES);
        const days = SERVICE_DAYS[service]!;
        const ward = randomWard();
        const closed = Math.random() < 0.65;
        // Closed requests spread over the year. Open ones are mostly recent: 70% within 1.5× the
        // promised days (some just past due), 30% older (genuinely stuck). Otherwise nearly every open
        // request would look overdue, which is not a realistic picture.
        const ageDays = closed ? Math.random() * 365 : Math.random() < 0.7 ? Math.random() * days * 1.5 : Math.random() * 60;
        const submittedAt = new Date(now.getTime() - ageDays * DAY_MS);

        let status: string;
        let closedAt: string | null = null;
        if (closed) {
          const r = Math.random();
          status = r < 0.85 ? 'ISSUED' : r < 0.93 ? 'REJECTED' : 'CANCELLED';
          const tookDays = days * (0.2 + Math.random() * 2.3);
          const closeTime = Math.min(submittedAt.getTime() + tookDays * DAY_MS, now.getTime());
          closedAt = new Date(closeTime).toISOString();
        } else {
          const openStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_DOCUMENTS', 'APPROVED', ...(FIELD_SERVICES.has(service) ? ['FIELD_VERIFICATION'] : [])];
          status = pick(openStatuses);
        }

        batch.push({
          trackingCode: generateTrackingCode(),
          service,
          ...ward,
          status,
          submittedAt: submittedAt.toISOString(),
          closedAt,
          applicant: { name: `Demo Applicant ${i + 1}`, nid: `DEMO-${String(i % 10_000_000).padStart(7, '0')}` },
        });
      }

      await client.query(
        `INSERT INTO service_requests
           (tracking_code, citizen_id, service_type_code, ward_id, local_level_id, district_id, province_id,
            purpose, applicant, status, submitted_at, updated_at, closed_at)
         SELECT x."trackingCode", $2, x.service, x."wardId", x."localLevelId", x."districtId", x."provinceId",
                'Bulk demo request for performance testing', x.applicant, x.status,
                x."submittedAt", coalesce(x."closedAt", x."submittedAt"), x."closedAt"
         FROM jsonb_to_recordset($1::jsonb) AS x(
           "trackingCode" text, service text, "wardId" int, "localLevelId" int, "districtId" smallint, "provinceId" smallint,
           status text, "submittedAt" timestamptz, "closedAt" timestamptz, applicant jsonb)`,
        [JSON.stringify(batch), citizenId],
      );
    }

    // Audit history: a CREATED event for every request, plus the final status for closed ones.
    await client.query(
      `INSERT INTO request_events (request_id, actor_id, action, to_status, created_at)
       SELECT id, citizen_id, 'CREATED', 'SUBMITTED', submitted_at FROM service_requests`,
    );
    await client.query(
      `INSERT INTO request_events (request_id, actor_id, action, from_status, to_status, created_at)
       SELECT id, NULL, 'STATUS_CHANGED', 'UNDER_REVIEW', status, closed_at FROM service_requests WHERE closed_at IS NOT NULL`,
    );

    const { rows } = await client.query<{ requests: number; events: number }>(
      `SELECT (SELECT count(*) FROM service_requests)::int AS requests, (SELECT count(*) FROM request_events)::int AS events`,
    );
    await client.query('COMMIT');
    // Fresh statistics so the query planner knows the new table sizes.
    await client.query('ANALYZE service_requests, request_events');
    return rows[0]!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
