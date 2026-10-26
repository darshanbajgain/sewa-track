import pg from 'pg';
import { env } from '../config/env.js';
import { countByAreaSql } from '../repositories/stats.repository.js';
import { FIND_EVENTS_SQL, LIST_QUEUE_SQL } from '../repositories/staff.repository.js';

/**
 * `pnpm db:explain`: runs EXPLAIN (ANALYZE, BUFFERS) on the API's heaviest queries, using the SAME
 * SQL text the repositories run (imported, not copied), and prints the median execution time of
 * 7 runs plus the main plan nodes. Used for docs/performance.md (before/after indexes).
 *
 * EXPLAIN ANALYZE really executes the query: run it on a development database with `pnpm seed:large` data.
 */
const RUNS = 7;

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

/** Flattens the plan tree into short labels, e.g. "Seq Scan on service_requests", "Index Scan using …". */
function describe(node: PlanNode, out: string[] = []): string[] {
  if (node['Relation Name'] || node['Index Name']) {
    out.push(`${node['Node Type']}${node['Index Name'] ? ` using ${node['Index Name']}` : ''}${node['Relation Name'] ? ` on ${node['Relation Name']}` : ''}`);
  } else if (['Sort', 'Incremental Sort', 'HashAggregate', 'GroupAggregate', 'Limit'].includes(node['Node Type'])) {
    out.push(node['Node Type']);
  }
  for (const child of node.Plans ?? []) describe(child, out);
  return out;
}

const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();

try {
  const now = new Date();
  const { rows: busiest } = await client.query(
    `SELECT ward_id, local_level_id FROM service_requests GROUP BY ward_id, local_level_id ORDER BY count(*) DESC LIMIT 1`,
  );
  const { rows: oneRequest } = await client.query(`SELECT id FROM service_requests ORDER BY submitted_at DESC LIMIT 1`);
  const ward = busiest[0].ward_id;
  const palika = busiest[0].local_level_id;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const queries: { name: string; sql: string; params: unknown[] }[] = [
    { name: 'Officer queue (busiest ward, page 1)', sql: LIST_QUEUE_SQL, params: [ward, null, null, null, null, 0, now] },
    { name: 'Officer queue, overdue only', sql: LIST_QUEUE_SQL, params: [ward, null, null, null, true, 0, now] },
    { name: 'Palika admin queue (whole palika)', sql: LIST_QUEUE_SQL, params: [null, palika, null, null, null, 0, now] },
    { name: 'Request history (detail page)', sql: FIND_EVENTS_SQL, params: [oneRequest[0].id] },
    { name: 'Map: all districts, all time', sql: countByAreaSql('district'), params: [null, null, null, null, null, now] },
    { name: 'Map: last 30 days, one service', sql: countByAreaSql('district'), params: ['RESIDENCE', null, thirtyDaysAgo, null, null, now] },
    { name: 'Map drill-down: palikas of Kathmandu', sql: countByAreaSql('local_level'), params: [null, null, null, null, 27, now] },
  ];

  const { rows: size } = await client.query(`SELECT (SELECT count(*) FROM service_requests)::int AS requests, (SELECT count(*) FROM request_events)::int AS events`);
  console.log(`Data: ${size[0].requests} requests, ${size[0].events} events. Median of ${RUNS} runs.\n`);
  console.log('| Query | Median ms | Plan (main nodes) |');
  console.log('|---|---|---|');

  for (const q of queries) {
    const times: number[] = [];
    let plan: PlanNode | undefined;
    for (let i = 0; i < RUNS; i++) {
      const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`, q.params);
      const result = rows[0]['QUERY PLAN'][0];
      times.push(result['Execution Time']);
      plan = result.Plan;
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(RUNS / 2)]!;
    console.log(`| ${q.name} | ${median.toFixed(2)} | ${[...new Set(describe(plan!))].join(' → ')} |`);
  }
} finally {
  await client.end();
}
