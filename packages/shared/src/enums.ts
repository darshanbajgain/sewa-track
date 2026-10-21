import { z } from 'zod';

/**
 * Fixed lists of values used by the API, the web app and the database (PRD §4–§6).
 *
 * Pattern used for each list:
 *   1. a `const` array: the single source of truth (also used for SQL CHECK constraints later)
 *   2. a TypeScript type made from it ('SUBMITTED' | 'UNDER_REVIEW' | ...)
 *   3. a Zod schema made from it, to validate input at runtime
 * Add a value in ONE place and the type, the validation and the UI all follow.
 * `as const` keeps the exact strings as types instead of widening them to `string`.
 */

/** Workflow statuses of a service request (PRD §6.1). */
export const REQUEST_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_DOCUMENTS',
  'FIELD_VERIFICATION',
  'APPROVED',
  'REJECTED',
  'ISSUED',
  'CANCELLED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const requestStatusSchema = z.enum(REQUEST_STATUSES);

/** Final statuses: no further transition is possible, and `closedAt` is set. */
export const TERMINAL_STATUSES = ['ISSUED', 'REJECTED', 'CANCELLED'] as const satisfies readonly RequestStatus[];

/** The 5 service types in v1 (PRD §5). */
export const SERVICE_TYPE_CODES = [
  'RELATIONSHIP',
  'RESIDENCE',
  'LOW_INCOME',
  'LAND_BOUNDARY',
  'DATE_OF_BIRTH',
] as const;
export type ServiceTypeCode = (typeof SERVICE_TYPE_CODES)[number];
export const serviceTypeCodeSchema = z.enum(SERVICE_TYPE_CODES);

/** User roles (PRD §4). Each role has a different data scope, enforced on the server. */
export const ROLES = ['CITIZEN', 'WARD_OFFICER', 'PALIKA_ADMIN', 'SYSTEM_ADMIN'] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

/** Kinds of local level (palika) (PRD F2). */
export const LOCAL_LEVEL_TYPES = ['METRO', 'SUB_METRO', 'MUNICIPALITY', 'RURAL_MUNICIPALITY'] as const;
export type LocalLevelType = (typeof LOCAL_LEVEL_TYPES)[number];

/** What an audit event records (PRD §8, request_events.action). */
export const EVENT_ACTIONS = ['CREATED', 'STATUS_CHANGED', 'FEE_PAID', 'REASSIGNED', 'IDENTITY_CHECKED'] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];
