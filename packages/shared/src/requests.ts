import { z } from 'zod';
import type { EventAction, RequestStatus, ServiceTypeCode } from './enums.js';
import { requestStatusSchema, serviceTypeCodeSchema } from './enums.js';

/**
 * Submitting a service request (PRD F4). Used by the API (validation) and the web Apply form.
 *
 * Applicant details are DEMO data only: the NID must look like "DEMO-1234567", so a real
 * citizenship or national ID number can't be entered by mistake (hard rule: fake data only).
 */
export const createRequestSchema = z.object({
  serviceTypeCode: serviceTypeCodeSchema,
  wardId: z.number().int().positive(),
  purpose: z.string().trim().min(10, 'Purpose must be at least 10 characters').max(500),
  applicant: z.object({
    name: z.string().trim().min(2).max(100),
    nid: z.string().regex(/^DEMO-\d{7}$/, 'Use a demo ID like DEMO-1234567'),
  }),
  // Must be exactly `true`: the citizen ticked "I understand this is a demo and I am not entering real information".
  consent: z.literal(true, { error: 'Please confirm this is a demo and you are not entering real information' }),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

/**
 * PUBLIC tracking response (PRD F5). Anyone with the code can see this, without logging in, so it
 * contains ONLY these fields: no names, no applicant data, no officer notes, no internal ids.
 */
export interface TrackingDto {
  trackingCode: string;
  service: { code: ServiceTypeCode; nameEn: string; nameNe: string };
  ward: { number: number };
  palika: { nameEn: string; nameNe: string };
  status: RequestStatus;
  submittedAt: string;
  updatedAt: string;
  overdue: boolean;
  timeline: { status: RequestStatus; at: string }[]; // status changes only: no notes, no who
}

/** A request as its owner sees it in "My requests". */
export interface MyRequestDto {
  id: string;
  trackingCode: string;
  serviceTypeCode: ServiceTypeCode;
  status: RequestStatus;
  wardId: number;
  submittedAt: string; // ISO 8601, UTC
  updatedAt: string;
  closedAt: string | null;
  overdue: boolean;
}

/**
 * Staff queue query (PRD F6): GET /requests?status=&serviceType=&overdue=&page=
 * Query values arrive as text, so "true"/"false" are turned into booleans here.
 */
export const queueQuerySchema = z.object({
  status: requestStatusSchema.optional(),
  serviceType: serviceTypeCodeSchema.optional(),
  overdue: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type QueueQuery = z.infer<typeof queueQuerySchema>;

export const QUEUE_PAGE_SIZE = 20;

/** One row in the staff queue. */
export interface QueueItemDto {
  id: string;
  trackingCode: string;
  serviceTypeCode: ServiceTypeCode;
  serviceNameEn: string;
  status: RequestStatus;
  wardNumber: number;
  submittedAt: string;
  overdue: boolean;
  assignedOfficerName: string | null;
}

export interface QueuePageDto {
  items: QueueItemDto[];
  page: number;
  pageSize: number;
  total: number; // matching rows across ALL pages
}

/** Path parameter for /requests/:id. */
export const requestIdParamsSchema = z.object({ id: z.uuid('Invalid request id') });

/** Full request detail for the owner or scoped staff (PRD F6). Includes private data: never public. */
export interface RequestDetailDto {
  id: string;
  trackingCode: string;
  status: RequestStatus;
  version: number; // send back with any change (optimistic locking)
  service: { code: ServiceTypeCode; nameEn: string; nameNe: string; feeNpr: number; serviceDays: number; requiresFieldVerification: boolean };
  location: { wardId: number; wardNumber: number; palikaNameEn: string; palikaNameNe: string; districtNameEn: string };
  purpose: string;
  applicant: { name: string; nid: string };
  assignedOfficer: { id: string; name: string } | null;
  feePaidAt: string | null;
  fieldVerifiedAt: string | null;
  submittedAt: string;
  updatedAt: string;
  closedAt: string | null;
  overdue: boolean;
  identityCheck: { status: 'PENDING' | 'MATCH' | 'NO_MATCH' | 'FAILED'; attempts: number } | null;
  events: { action: EventAction; fromStatus: RequestStatus | null; toStatus: RequestStatus | null; note: string | null; actorName: string | null; at: string }[];
  /** What the CURRENT user may do now: drives which buttons the UI shows. */
  allowedTransitions: RequestStatus[];
  canMarkFeePaid: boolean;
}
