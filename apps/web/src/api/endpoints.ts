/**
 * Every API path in one place (relative to the client's baseURL `/api/v1`).
 * If a URL changes on the server, it changes here only. Mirrors docs/api.md and /api/docs.
 */
export const ENDPOINTS = {
  system: {
    live: '/live', // process is running; never touches the database
  },
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    logout: '/auth/logout',
    me: '/auth/me',
  },
  reference: {
    serviceTypes: '/service-types',
    provinces: '/locations/provinces',
    districts: '/locations/districts',
    localLevels: '/locations/local-levels',
    wards: '/locations/wards',
  },
  requests: {
    root: '/requests', // POST = submit (citizen), GET = staff queue
    mine: '/requests/mine',
    detail: (id: string) => `/requests/${id}`,
    transitions: (id: string) => `/requests/${id}/transitions`,
    feePaid: (id: string) => `/requests/${id}/fee-paid`,
  },
  tracking: {
    byCode: (code: string) => `/track/${encodeURIComponent(code)}`,
  },
  admin: {
    users: '/admin/users', // GET = list, POST = create staff
    user: (id: string) => `/admin/users/${id}`, // PATCH = activate / deactivate
  },
  stats: {
    map: '/stats/map',
    summary: '/stats/summary',
  },
} as const;
