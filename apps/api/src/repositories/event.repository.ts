import type { EventAction, RequestStatus } from '@sewa/shared';
import type { DbClient } from '../db/transaction.js';

/**
 * The audit log (request_events). APPEND-ONLY: this file has an insert function and nothing else,
 * on purpose. The database also blocks UPDATE/DELETE with a trigger (001_init.sql).
 *
 * It takes a transaction `client` (not the pool): an event must be written in the SAME transaction
 * as the change it describes, so both are saved or neither is (AGENTS §6).
 */
export interface NewEvent {
  requestId: string;
  actorId: string | null; // null = done by the system
  action: EventAction;
  fromStatus?: RequestStatus | null;
  toStatus?: RequestStatus | null;
  note?: string | null;
}

export async function insertEvent(client: DbClient, event: NewEvent): Promise<void> {
  await client.query(
    `INSERT INTO request_events (request_id, actor_id, action, from_status, to_status, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [event.requestId, event.actorId, event.action, event.fromStatus ?? null, event.toStatus ?? null, event.note ?? null],
  );
}
