import { z } from 'zod';
import { roleSchema } from './enums.js';

/**
 * Login request body (PRD F3). Used by the API to validate and by the web login form.
 * `max(200)` on the password stops someone sending a huge string to make hashing slow.
 */
export const loginSchema = z.object({
  phone: z.string().trim().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * The logged-in user as the API returns it (never the password hash).
 * `wardId` is set only for ward officers, `localLevelId` only for palika admins.
 */
export const authUserSchema = z.object({
  id: z.uuid(),
  role: roleSchema,
  name: z.string(),
  wardId: z.number().int().nullable(),
  localLevelId: z.number().int().nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;
