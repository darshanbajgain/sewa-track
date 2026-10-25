import { z } from 'zod';
import type { RequestStatus, ServiceTypeCode } from './enums.js';
import { serviceTypeCodeSchema } from './enums.js';

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
