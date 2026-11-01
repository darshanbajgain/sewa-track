import { z } from 'zod';
import { roleSchema } from './enums.js';

/**
 * Accounts (PRD F3, F14). Login id = email, stored lowercase (the DB checks it).
 *
 * DEMO RULE: the public demo accepts only addresses at example.com, a domain reserved for examples
 * (RFC 2606) that can never be a real mailbox. So sign-up works like the real thing, but nobody can
 * store their real email here (AGENTS §3.3, fake data only). To lift it: change DEMO_EMAIL_DOMAIN checks.
 */
export const DEMO_EMAIL_DOMAIN = 'example.com';

const email = z.string().trim().toLowerCase().max(200).pipe(z.email('Enter a valid email address'));

/** A NEW account's email: valid AND on the demo domain. */
const demoEmail = email.refine((e) => e.endsWith(`@${DEMO_EMAIL_DOMAIN}`), {
  message: `Use a made-up address ending in @${DEMO_EMAIL_DOMAIN} (this is a demo)`,
});

// min 8: a basic length rule. max 200: stops someone sending a huge string to make hashing slow.
const newPassword = z.string().min(8, 'Use at least 8 characters').max(200);
const name = z.string().trim().min(2, 'Enter a name (2 to 100 characters)').max(100);

/** Login body. No domain rule here: an unknown email simply gets the generic 401. */
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** POST /auth/register: citizens only. The role is never taken from the body. */
export const registerSchema = z.object({ name, email: demoEmail, password: newPassword });
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * POST /admin/users (system admin): create a STAFF account. A discriminated union: the role decides
 * which scope field is required (ward officer → wardId, palika admin → localLevelId), same as the
 * users_role_scope CHECK in the database.
 */
export const createStaffSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('WARD_OFFICER'), name, email: demoEmail, password: newPassword, wardId: z.number().int().positive() }),
  z.object({ role: z.literal('PALIKA_ADMIN'), name, email: demoEmail, password: newPassword, localLevelId: z.number().int().positive() }),
]);
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

/** PATCH /admin/users/:id: activate or deactivate (accounts are never deleted). */
export const updateUserSchema = z.object({ isActive: z.boolean() });

/** GET /admin/users?role=&q=&page= */
export const userListQuerySchema = z.object({
  role: roleSchema.optional(),
  q: z.string().trim().max(100).optional(), // name or email contains
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export const USER_PAGE_SIZE = 20;

/**
 * The logged-in user as the API returns it (never the password hash).
 * `wardId` is set only for ward officers, `localLevelId` only for palika admins.
 */
export const authUserSchema = z.object({
  id: z.uuid(),
  role: roleSchema,
  name: z.string(),
  email: z.string(),
  wardId: z.number().int().nullable(),
  localLevelId: z.number().int().nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/** One row of the admin's user list. */
export interface AdminUserDto {
  id: string;
  role: z.infer<typeof roleSchema>;
  name: string;
  email: string;
  isActive: boolean;
  wardId: number | null;
  wardNumber: number | null;
  localLevelId: number | null; // the palika (for officers: the palika of their ward)
  palikaNameEn: string | null;
  createdAt: string;
}

export interface UserPageDto {
  items: AdminUserDto[];
  page: number;
  pageSize: number;
  total: number;
}
