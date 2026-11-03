import {
  createRequestSchema,
  createStaffSchema,
  DOCUMENT_CONTENT_TYPES,
  DOCUMENT_STATUSES,
  districtsQuerySchema,
  ERROR_CODES,
  EVENT_ACTIONS,
  feePaidBodySchema,
  LOCAL_LEVEL_TYPES,
  localLevelsQuerySchema,
  loginSchema,
  MAP_LEVELS,
  MAP_METRICS,
  mapQuerySchema,
  queueQuerySchema,
  reviewDocumentBodySchema,
  registerSchema,
  REQUEST_STATUSES,
  ROLES,
  SERVICE_TYPE_CODES,
  transitionBodySchema,
  updateUserSchema,
  userListQuerySchema,
  wardsQuerySchema,
} from '@sewa/shared';
import { z } from 'zod';

/**
 * The OpenAPI 3.1 description of the API, served at /api/v1/openapi.json and shown by Swagger UI at /api/docs.
 *
 * INPUTS come from the same Zod schemas the controllers validate with (`z.toJSONSchema`), so the docs
 * can't disagree with the validation. OUTPUTS are TypeScript interfaces (no runtime schema), so they are
 * described here by hand, kept next to each other for easy review.
 * A test checks that every Express route is documented, so docs can't silently fall behind.
 */

type Json = Record<string, unknown>;

/** Zod → JSON Schema for request input (`io: 'input'` = what the client sends, before defaults/transforms). */
function input(schema: z.ZodType): Json {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: 'input' }) as Json;
  return rest;
}

/** A Zod object of query parameters → OpenAPI `parameters` (one entry per field). */
function queryParams(schema: z.ZodType): Json[] {
  const json = input(schema) as { properties: Record<string, Json>; required?: string[] };
  return Object.entries(json.properties).map(([name, s]) => ({
    name,
    in: 'query',
    required: json.required?.includes(name) ?? false,
    schema: s,
  }));
}

// Small helpers to keep the hand-written output schemas readable.
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const str = (extra: Json = {}) => ({ type: 'string', ...extra });
const int = (extra: Json = {}) => ({ type: 'integer', ...extra });
const num = { type: 'number' };
const bool = { type: 'boolean' };
const dateTime = str({ format: 'date-time' });
const nullable = (schema: Json) => ({ anyOf: [schema, { type: 'null' }] });
const arr = (items: Json) => ({ type: 'array', items });
const obj = (properties: Record<string, Json>, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const json = (schema: Json, example?: unknown) => ({ content: { 'application/json': { schema, ...(example ? { example } : {}) } } });

const idParam = { name: 'id', in: 'path', required: true, schema: str({ format: 'uuid' }), description: 'Request id (uuid)' };
const documentIdParam = { name: 'documentId', in: 'path', required: true, schema: str({ format: 'uuid' }), description: 'Document id (uuid)' };
/** multipart/form-data body with one file (PRD F15: JPEG/PNG/PDF, ≤ 2 MB, type checked from the bytes). */
const fileUpload = (extra: Record<string, Json> = {}) => ({
  required: true,
  content: {
    'multipart/form-data': {
      schema: obj({ ...extra, file: str({ format: 'binary', description: 'JPEG, PNG or PDF, at most 2 MB' }) }),
    },
  },
});

/** Standard error responses (PRD §9). Every error has the same JSON shape. */
const err = (description: string) => ({ description, ...json(ref('Error')) });
const E = {
  400: err('VALIDATION_ERROR: invalid body, query or path (see `details.issues`)'),
  401: err('UNAUTHENTICATED: not logged in, or the session expired'),
  403: err('FORBIDDEN: wrong role, or outside your ward / palika / own requests'),
  404: err('NOT_FOUND'),
  409: err('CONFLICT: the request was updated by someone else (stale `version`); reload'),
  422: err('INVALID_TRANSITION: this step is not allowed now'),
  429: err('RATE_LIMITED: too many attempts, try again in a minute'),
};

const cookieAuth = [{ cookieAuth: [] }];
const userIdParam = { name: 'id', in: 'path', required: true, schema: str({ format: 'uuid' }), description: 'User id (uuid)' };

const components = {
  securitySchemes: {
    cookieAuth: {
      type: 'apiKey',
      in: 'cookie',
      name: 'sewa_session',
      description:
        'Session cookie set by POST /auth/login (httpOnly JWT, 8 hours). In this page: run **POST /auth/login** with a demo account; the browser then sends the cookie automatically.',
    },
  },
  schemas: {
    Error: obj({
      error: obj({ code: str({ enum: [...ERROR_CODES] }), message: str(), details: { type: 'object' } }),
      requestId: str({ format: 'uuid', description: 'Search the server logs for this id' }),
    }),
    Status: str({ enum: [...REQUEST_STATUSES] }),
    ServiceTypeCode: str({ enum: [...SERVICE_TYPE_CODES] }),
    AuthUser: obj({
      id: str({ format: 'uuid' }),
      role: str({ enum: [...ROLES] }),
      name: str(),
      email: str({ format: 'email' }),
      wardId: nullable(int()),
      localLevelId: nullable(int()),
    }),
    AdminUser: obj({
      id: str({ format: 'uuid' }),
      role: str({ enum: [...ROLES] }),
      name: str(),
      email: str({ format: 'email' }),
      isActive: bool,
      wardId: nullable(int()),
      wardNumber: nullable(int()),
      localLevelId: nullable(int()),
      palikaNameEn: nullable(str()),
      createdAt: dateTime,
    }),
    ServiceType: obj({
      code: ref('ServiceTypeCode'),
      nameEn: str(),
      nameNe: str(),
      feeNpr: int({ description: 'DEMO value, whole rupees' }),
      serviceDays: int({ description: 'DEMO charter promise in days' }),
      requiresFieldVerification: bool,
      requiredDocuments: arr(obj({ nameEn: str(), nameNe: str() })),
    }),
    Province: obj({ id: int(), nameEn: str(), nameNe: str() }),
    District: obj({ id: int(), provinceId: int(), nameEn: str(), nameNe: str() }),
    LocalLevel: obj({ id: int(), districtId: int(), nameEn: str(), nameNe: str(), type: str({ enum: [...LOCAL_LEVEL_TYPES] }) }),
    Ward: obj({ id: int(), number: int() }),
    CreatedRequest: obj({
      id: str({ format: 'uuid' }),
      trackingCode: str({ pattern: '^ST-[0-9A-HJKMNP-TV-Z]{10}$' }),
      status: ref('Status'),
      submittedAt: dateTime,
    }),
    MyRequest: obj({
      id: str({ format: 'uuid' }),
      trackingCode: str(),
      serviceTypeCode: ref('ServiceTypeCode'),
      status: ref('Status'),
      wardId: int(),
      submittedAt: dateTime,
      updatedAt: dateTime,
      closedAt: nullable(dateTime),
      overdue: bool,
    }),
    Tracking: obj({
      trackingCode: str(),
      service: obj({ code: ref('ServiceTypeCode'), nameEn: str(), nameNe: str() }),
      ward: obj({ number: int() }),
      palika: obj({ nameEn: str(), nameNe: str() }),
      status: ref('Status'),
      submittedAt: dateTime,
      updatedAt: dateTime,
      overdue: bool,
      timeline: arr(obj({ status: ref('Status'), at: dateTime })),
    }),
    QueuePage: obj({
      items: arr(
        obj({
          id: str({ format: 'uuid' }),
          trackingCode: str(),
          serviceTypeCode: ref('ServiceTypeCode'),
          serviceNameEn: str(),
          status: ref('Status'),
          wardNumber: int(),
          submittedAt: dateTime,
          overdue: bool,
          assignedOfficerName: nullable(str()),
        }),
      ),
      page: int(),
      pageSize: int({ example: 20 }),
      total: int({ description: 'Matching rows across all pages' }),
    }),
    RequestDetail: obj({
      id: str({ format: 'uuid' }),
      trackingCode: str(),
      status: ref('Status'),
      version: int({ description: 'Send back with any change (optimistic locking)' }),
      service: obj({ code: ref('ServiceTypeCode'), nameEn: str(), nameNe: str(), feeNpr: int(), serviceDays: int(), requiresFieldVerification: bool }),
      location: obj({ wardId: int(), wardNumber: int(), palikaNameEn: str(), palikaNameNe: str(), districtNameEn: str() }),
      purpose: str(),
      applicant: obj({ name: str(), nid: str({ pattern: '^DEMO-\\d{7}$' }) }),
      assignedOfficer: nullable(obj({ id: str({ format: 'uuid' }), name: str() })),
      feePaidAt: nullable(dateTime),
      fieldVerifiedAt: nullable(dateTime),
      submittedAt: dateTime,
      updatedAt: dateTime,
      closedAt: nullable(dateTime),
      overdue: bool,
      identityCheck: nullable(obj({ status: str({ enum: ['PENDING', 'MATCH', 'NO_MATCH', 'FAILED'] }), attempts: int() })),
      events: arr(
        obj({
          action: str({ enum: [...EVENT_ACTIONS] }),
          fromStatus: nullable(ref('Status')),
          toStatus: nullable(ref('Status')),
          note: nullable(str()),
          actorName: nullable(str()),
          at: dateTime,
        }),
      ),
      documents: arr(ref('Document')),
      allowedTransitions: { ...arr(ref('Status')), description: 'Moves the CURRENT user may make now (drives the UI buttons)' },
      canMarkFeePaid: bool,
      canUploadDocuments: bool,
      canReviewDocuments: bool,
    }),
    Document: obj({
      id: str({ format: 'uuid' }),
      name: str(),
      status: str({ enum: [...DOCUMENT_STATUSES] }),
      requestedByOfficer: bool,
      file: nullable(obj({ name: str(), contentType: str({ enum: [...DOCUMENT_CONTENT_TYPES] }), sizeBytes: int(), uploadedAt: dateTime })),
      reviewNote: nullable(str()),
      reviewedAt: nullable(dateTime),
    }),
    ChangeResult: obj({ id: str({ format: 'uuid' }), status: ref('Status'), version: int() }),
    Totals: obj({
      total: int(),
      pending: int({ description: 'Open (not final)' }),
      overdue: int({ description: 'Open and past submittedAt + serviceDays' }),
      closed: int(),
      onTimeRate: nullable({ ...num, minimum: 0, maximum: 1, description: 'Closed on time ÷ closed; null if nothing closed' }),
      avgDaysToClose: nullable(num),
    }),
    MapResponse: obj({
      level: str({ enum: [...MAP_LEVELS] }),
      metric: str({ enum: [...MAP_METRICS] }),
      areas: arr(obj({ areaId: int(), value: nullable(num), total: int() })),
      totals: ref('Totals'),
    }),
    Summary: obj({
      scope: { oneOf: [obj({ kind: str({ const: 'palika' }), localLevelId: int() }), obj({ kind: str({ const: 'national' }) })] },
      totals: ref('Totals'),
      byStatus: arr(obj({ status: ref('Status'), count: int() })),
      byServiceType: arr(obj({ code: ref('ServiceTypeCode'), count: int() })),
      byArea: arr(obj({ areaId: int(), label: str(), pending: int(), overdue: int() })),
    }),
  },
};

const paths = {
  '/api/v1/live': {
    get: {
      tags: ['System'],
      summary: 'Process is running (never touches the database)',
      description: 'For the keep-awake pinger: it keeps the API awake without waking the database. Use /health to check the database too.',
      responses: { 200: { description: 'Running', ...json(obj({ status: str({ const: 'ok' }) })) } },
    },
  },
  '/api/v1/health': {
    get: {
      tags: ['System'],
      summary: 'API and database status',
      responses: {
        200: { description: 'API and database are up', ...json(obj({ status: str({ const: 'ok' }), db: str({ const: 'up' }), version: str(), commit: str() })) },
        503: { description: 'API is up, database is not', ...json(obj({ status: str({ const: 'degraded' }), db: str({ const: 'down' }), version: str(), commit: str() })) },
      },
    },
  },
  '/api/v1/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Log in (sets the session cookie)',
      description:
        'Demo accounts (all fake), password `demo1234`: `citizen@example.com` · `officer.ward1@example.com` / `officer2.ward1@example.com` (Kathmandu ward 1) · `officer.ward2@example.com` · `palika.admin@example.com` · `system.admin@example.com`. `portal` = the login page: `CITIZEN` for citizens, `STAFF` for every other role. Rate limited: 5 per minute per IP. Unknown email and wrong password give the same 401; a deactivated account, or the right account on the wrong portal, gets 403 (wrong portal: `details.portal` names the right one).',
      requestBody: { required: true, ...json(input(loginSchema), { email: 'officer.ward1@example.com', password: 'demo1234', portal: 'STAFF' }) },
      responses: {
        200: { description: 'Logged in. `Set-Cookie: sewa_session=…` (httpOnly)', ...json(obj({ user: ref('AuthUser') })) },
        400: E[400],
        401: E[401],
        403: err('Account deactivated, or wrong portal for this account'),
        429: E[429],
      },
    },
  },
  '/api/v1/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Citizen sign-up (sets the session cookie)',
      description:
        'Always creates a CITIZEN (staff accounts are created by a system admin). Demo rule: the email must end in `@example.com` (reserved for examples, so no real addresses are stored). Rate limited: 5 per minute per IP.',
      requestBody: { required: true, ...json(input(registerSchema), { name: 'Sita Demo', email: 'sita@example.com', password: 'demo-pass-123' }) },
      responses: {
        201: { description: 'Account created and logged in', ...json(obj({ user: ref('AuthUser') })) },
        400: E[400],
        409: err('Email already registered'),
        429: E[429],
      },
    },
  },
  '/api/v1/auth/logout': {
    post: { tags: ['Auth'], summary: 'Log out (clears the cookie)', responses: { 204: { description: 'Logged out' } } },
  },
  '/api/v1/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'The logged-in user',
      security: cookieAuth,
      responses: { 200: { description: 'Current user', ...json(obj({ user: ref('AuthUser') })) }, 401: E[401] },
    },
  },
  '/api/v1/service-types': {
    get: {
      tags: ['Reference data'],
      summary: 'Service catalog (5 services, demo fees and days)',
      responses: { 200: { description: 'Cached 1 hour', ...json(obj({ serviceTypes: arr(ref('ServiceType')) })) } },
    },
  },
  '/api/v1/locations/provinces': {
    get: {
      tags: ['Reference data'],
      summary: 'The 7 provinces',
      responses: { 200: { description: 'In official order', ...json(obj({ provinces: arr(ref('Province')) })) } },
    },
  },
  '/api/v1/locations/districts': {
    get: {
      tags: ['Reference data'],
      summary: 'Districts (all 77, or of one province)',
      parameters: queryParams(districtsQuerySchema),
      responses: { 200: { description: 'Sorted by name', ...json(obj({ districts: arr(ref('District')) })) }, 400: E[400], 404: E[404] },
    },
  },
  '/api/v1/locations/local-levels': {
    get: {
      tags: ['Reference data'],
      summary: 'Palikas of a district',
      parameters: queryParams(localLevelsQuerySchema),
      responses: { 200: { description: 'Sorted by name', ...json(obj({ localLevels: arr(ref('LocalLevel')) })) }, 400: E[400], 404: E[404] },
    },
  },
  '/api/v1/locations/wards': {
    get: {
      tags: ['Reference data'],
      summary: 'Wards of a palika',
      parameters: queryParams(wardsQuerySchema),
      responses: { 200: { description: 'In number order', ...json(obj({ wards: arr(ref('Ward')) })) }, 400: E[400], 404: E[404] },
    },
  },
  '/api/v1/requests': {
    post: {
      tags: ['Requests'],
      summary: 'Submit a request (citizen)',
      description:
        'One transaction: the request (location copied from the ward), a CREATED audit event and a PENDING identity check. Demo data only: `applicant.nid` must look like `DEMO-1234567`, and `consent` must be true.',
      security: cookieAuth,
      requestBody: {
        required: true,
        ...json(input(createRequestSchema), {
          serviceTypeCode: 'RESIDENCE',
          wardId: 1,
          purpose: 'Needed to open a bank account',
          applicant: { name: 'Demo Applicant', nid: 'DEMO-1234567' },
          consent: true,
        }),
      },
      responses: {
        201: { description: 'Created; keep the tracking code', ...json(obj({ request: ref('CreatedRequest') })) },
        400: E[400],
        401: E[401],
        403: E[403],
        404: err('Ward not found'),
      },
    },
    get: {
      tags: ['Staff'],
      summary: 'Work queue (ward officer: own ward · palika admin: own palika · system admin: all)',
      description: 'Scope comes from the session, never from the query. Oldest first, 20 per page.',
      security: cookieAuth,
      parameters: queryParams(queueQuerySchema),
      responses: { 200: { description: 'One page', ...json(ref('QueuePage')) }, 400: E[400], 401: E[401], 403: E[403] },
    },
  },
  '/api/v1/requests/mine': {
    get: {
      tags: ['Requests'],
      summary: "The citizen's own requests",
      security: cookieAuth,
      responses: { 200: { description: 'Newest first', ...json(obj({ requests: arr(ref('MyRequest')) })) }, 401: E[401], 403: E[403] },
    },
  },
  '/api/v1/requests/{id}': {
    get: {
      tags: ['Requests', 'Staff'],
      summary: 'Request detail (owner or scoped staff)',
      description: 'Includes applicant data and the full audit history with notes; never public.',
      security: cookieAuth,
      parameters: [idParam],
      responses: { 200: { description: 'Detail', ...json(obj({ request: ref('RequestDetail') })) }, 400: E[400], 401: E[401], 403: E[403], 404: E[404] },
    },
  },
  '/api/v1/requests/{id}/transitions': {
    post: {
      tags: ['Staff', 'Requests'],
      summary: 'Change the status (ward officer: own ward · citizen: own request)',
      description:
        'Optimistic locking: send the `version` you loaded. The update and its audit row are one transaction. `note` is required for NEEDS_DOCUMENTS (plus `documents`: 1–5 names to upload), resubmitting (only once every requested document is uploaded and none is \"not OK\") and returning from field verification; `reason` for REJECTED. Palika and system admins are read-only (403).',
      security: cookieAuth,
      parameters: [idParam],
      requestBody: { required: true, ...json(input(transitionBodySchema), { toStatus: 'UNDER_REVIEW', version: 0 }) },
      responses: {
        200: { description: 'Changed; the citizen is notified', ...json(obj({ request: ref('ChangeResult') })) },
        400: E[400],
        401: E[401],
        403: E[403],
        404: E[404],
        409: E[409],
        422: E[422],
      },
    },
  },
  '/api/v1/requests/{id}/fee-paid': {
    post: {
      tags: ['Staff'],
      summary: 'Mark the fee as paid (ward officer, own ward)',
      security: cookieAuth,
      parameters: [idParam],
      requestBody: { required: true, ...json(input(feePaidBodySchema), { version: 1 }) },
      responses: {
        200: { description: 'Recorded (FEE_PAID audit event)', ...json(obj({ request: ref('ChangeResult') })) },
        400: E[400],
        401: E[401],
        403: E[403],
        404: E[404],
        409: E[409],
        422: err('Free service, already paid, or the request is approved/closed'),
      },
    },
  },
  '/api/v1/requests/{id}/documents': {
    post: {
      tags: ['Requests'],
      summary: "Add a document from the service's list, with its file (citizen, own request)",
      description: '`name` must be one of the service\'s required documents (English or Nepali). Allowed until the request is approved. At most 10 documents per request.',
      security: cookieAuth,
      parameters: [idParam],
      requestBody: fileUpload({ name: str({ example: 'Birth registration certificate' }) }),
      responses: {
        201: { description: 'Added (DOCUMENT_UPLOADED audit event)', ...json(obj({ document: ref('Document') })) },
        400: err('Not in the list, not JPEG/PNG/PDF, over 2 MB, or over 10 documents'),
        401: E[401],
        403: E[403],
        404: E[404],
        409: err('This document is already on the request (upload into it instead)'),
        422: E[422],
      },
    },
  },
  '/api/v1/requests/{id}/documents/{documentId}/file': {
    put: {
      tags: ['Requests'],
      summary: 'Upload a file into a requested or "not OK" document (citizen, own request)',
      security: cookieAuth,
      parameters: [idParam, documentIdParam],
      requestBody: fileUpload(),
      responses: {
        200: { description: 'Uploaded; any earlier review is cleared', ...json(obj({ document: ref('Document') })) },
        400: E[400],
        401: E[401],
        403: E[403],
        404: E[404],
        409: E[409],
        422: err('Already accepted, or the request is approved/closed'),
      },
    },
    get: {
      tags: ['Requests', 'Staff'],
      summary: 'Download the file (owner or scoped staff)',
      description: 'Sent with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store`.',
      security: cookieAuth,
      parameters: [idParam, documentIdParam],
      responses: {
        200: { description: 'The file', content: Object.fromEntries(DOCUMENT_CONTENT_TYPES.map((t) => [t, { schema: str({ format: 'binary' }) }])) },
        400: E[400],
        401: E[401],
        403: E[403],
        404: E[404],
      },
    },
  },
  '/api/v1/requests/{id}/documents/{documentId}/review': {
    post: {
      tags: ['Staff'],
      summary: 'Accept a document, or mark it "not OK" with a reason (ward officer, own ward)',
      security: cookieAuth,
      parameters: [idParam, documentIdParam],
      requestBody: { required: true, ...json(input(reviewDocumentBodySchema), { decision: 'REJECTED', note: 'The scan is blurry' }) },
      responses: {
        200: { description: 'Reviewed (DOCUMENT_REVIEWED audit event)', ...json(obj({ document: ref('Document') })) },
        400: E[400],
        401: E[401],
        403: E[403],
        404: E[404],
        409: E[409],
        422: err('No file yet, or the request is closed'),
      },
    },
  },
  '/api/v1/admin/users': {
    get: {
      tags: ['Admin'],
      summary: 'List users (system admin)',
      description: 'Newest first, 20 per page. `q` matches name or email.',
      security: cookieAuth,
      parameters: queryParams(userListQuerySchema),
      responses: { 200: { description: 'One page', ...json(obj({ items: arr(ref('AdminUser')), page: int(), pageSize: int(), total: int() })) }, 400: E[400], 401: E[401], 403: E[403] },
    },
    post: {
      tags: ['Admin'],
      summary: 'Create a ward officer or palika admin (system admin)',
      description: '`role` decides the scope field: WARD_OFFICER needs `wardId`, PALIKA_ADMIN needs `localLevelId`. Email must end in `@example.com` (demo rule).',
      security: cookieAuth,
      requestBody: {
        required: true,
        ...json(input(createStaffSchema), { role: 'WARD_OFFICER', name: 'Ward Officer (Demo), Ward 5', email: 'officer.ward5@example.com', password: 'demo-pass-123', wardId: 5 }),
      },
      responses: { 201: { description: 'Created', ...json(obj({ user: ref('AdminUser') })) }, 400: E[400], 401: E[401], 403: E[403], 409: err('Email already registered') },
    },
  },
  '/api/v1/admin/users/{id}': {
    patch: {
      tags: ['Admin'],
      summary: 'Activate or deactivate an account (system admin)',
      description: 'A deactivated user cannot log in, and their open sessions stop working immediately. System admin accounts cannot be deactivated.',
      security: cookieAuth,
      parameters: [userIdParam],
      requestBody: { required: true, ...json(input(updateUserSchema), { isActive: false }) },
      responses: { 200: { description: 'Updated', ...json(obj({ user: ref('AdminUser') })) }, 400: E[400], 401: E[401], 403: E[403], 404: E[404] },
    },
  },
  '/api/v1/track/{trackingCode}': {
    get: {
      tags: ['Public'],
      summary: 'Track a request by code (no login)',
      description: 'Only public fields: no names, applicant data or notes. Code is normalized (case, spaces, O→0, I/L→1). Rate limited: 10 per minute per IP.',
      parameters: [{ name: 'trackingCode', in: 'path', required: true, schema: str({ example: 'ST-7K3QX9M2PD' }) }],
      responses: { 200: { description: 'Status and timeline', ...json(obj({ tracking: ref('Tracking') })) }, 400: E[400], 404: E[404], 429: E[429] },
    },
  },
  '/api/v1/stats/map': {
    get: {
      tags: ['Public', 'Statistics'],
      summary: 'Delay map data per district or palika (aggregates only)',
      description:
        '`overdue` = open and past the charter time · `pending` = open · `onTimeRate` = closed on time ÷ closed · `avgDaysToClose`. Areas with no matching requests are omitted. `totals` sums the same filters. Cached 60 s.',
      parameters: queryParams(mapQuerySchema),
      responses: { 200: { description: 'Per-area values', ...json(ref('MapResponse')) }, 400: E[400] },
    },
  },
  '/api/v1/stats/summary': {
    get: {
      tags: ['Statistics'],
      summary: 'Report (palika admin: own palika by ward · system admin: Nepal by province)',
      security: cookieAuth,
      responses: { 200: { description: 'Report', ...json(ref('Summary')) }, 401: E[401], 403: E[403] },
    },
  },
};

export function buildOpenApiDocument(version: string): Json {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Sewa Track API',
      version,
      description:
        '**Demo / portfolio project. Not affiliated with any government body. All data is fake.**\n\n' +
        'Citizen-service request tracker for ward recommendation letters in Nepal. JSON only; every error has the shape ' +
        '`{ "error": { "code", "message", "details" }, "requestId" }`.\n\n' +
        '**Try it:** run `POST /api/v1/auth/login` with a demo account (e.g. `officer.ward1@example.com`, password `demo1234`); the session cookie is then used automatically.',
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: '/', description: 'This server' }],
    tags: [
      { name: 'System' },
      { name: 'Auth' },
      { name: 'Reference data', description: 'Public catalog and location hierarchy' },
      { name: 'Public', description: 'No login needed' },
      { name: 'Requests', description: 'Citizen: submit, own requests' },
      { name: 'Staff', description: 'Officers and admins: queue, detail, changes' },
      { name: 'Statistics' },
      { name: 'Admin', description: 'System admin: user management' },
    ],
    paths,
    components,
  };
}
