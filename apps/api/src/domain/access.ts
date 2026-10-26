import type { Role } from '@sewa/shared';

/**
 * WHO MAY SEE WHICH REQUEST (PRD §4, AGENTS §6). Pure functions: no DB, unit-tested.
 *
 *   CITIZEN       → only requests they submitted
 *   WARD_OFFICER  → only requests filed in their ward
 *   PALIKA_ADMIN  → only requests in their palika (all its wards)
 *   SYSTEM_ADMIN  → everything (read-only)
 *
 * "Scope" is different from "role": requireRole checks the KIND of user; scope checks the
 * specific ROW. An officer is allowed to view requests, but not the requests of another ward.
 */

export interface Viewer {
  id: string;
  role: Role;
  wardId: number | null;
  localLevelId: number | null;
}

export interface RequestScope {
  citizenId: string;
  wardId: number;
  localLevelId: number;
}

/** May this user see this one request? (Used for the detail page and, later, for changing it.) */
export function canViewRequest(viewer: Viewer, request: RequestScope): boolean {
  switch (viewer.role) {
    case 'CITIZEN':
      return request.citizenId === viewer.id;
    case 'WARD_OFFICER':
      return viewer.wardId !== null && request.wardId === viewer.wardId;
    case 'PALIKA_ADMIN':
      return viewer.localLevelId !== null && request.localLevelId === viewer.localLevelId;
    case 'SYSTEM_ADMIN':
      return true;
  }
}

/**
 * The SQL filter for a staff member's queue: which ward or palika to restrict to.
 * `null` means "no restriction" (system admin). Citizens have no queue (they use "my requests").
 */
export function queueScope(viewer: Viewer): { wardId: number | null; localLevelId: number | null } {
  switch (viewer.role) {
    case 'WARD_OFFICER':
      return { wardId: viewer.wardId, localLevelId: null };
    case 'PALIKA_ADMIN':
      return { wardId: null, localLevelId: viewer.localLevelId };
    case 'SYSTEM_ADMIN':
      return { wardId: null, localLevelId: null };
    case 'CITIZEN':
      throw new Error('Citizens have no staff queue'); // the route's requireRole prevents this
  }
}
