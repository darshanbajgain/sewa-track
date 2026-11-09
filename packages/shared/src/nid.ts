import { z } from 'zod';

/**
 * The contract with the National ID service (PRD F9): what we send to POST /verify and what comes back.
 * The mock (apps/nid-mock) and the API's client (integrations/nidClient.ts) are each tested against
 * these same schemas, so a change on one side alone fails the build ("contract test").
 */

/** Demo IDs only, so a real citizenship or national ID number can't be entered by mistake. */
export const demoNidSchema = z.string().regex(/^DEMO-\d{7}$/, 'Use a demo ID like DEMO-1234567');

export const nidVerifyRequestSchema = z.object({
  nid: demoNidSchema,
  name: z.string().trim().min(2).max(100),
});
export type NidVerifyRequest = z.infer<typeof nidVerifyRequestSchema>;

export const nidVerifyResponseSchema = z.object({ match: z.boolean() });
export type NidVerifyResponse = z.infer<typeof nidVerifyResponseSchema>;
