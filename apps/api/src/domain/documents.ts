import type { DocumentContentType, DocumentStatus, RequestStatus, Role } from '@sewa/shared';

/**
 * Supporting documents (PRD F15). Pure rules: no DB, no Express, unit-tested.
 * Scope (own request / own ward) is checked by the service with domain/access.ts, like every other route.
 */

/** The citizen may add or upload documents only while the request is still being worked on, before approval. */
const UPLOAD_STATUSES: ReadonlySet<RequestStatus> = new Set(['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_DOCUMENTS', 'FIELD_VERIFICATION']);
/** The officer may review documents while the request is open (not closed). */
const REVIEW_STATUSES: ReadonlySet<RequestStatus> = new Set([...UPLOAD_STATUSES, 'APPROVED']);

export type DocumentResult = { ok: true } | { ok: false; code: 'FORBIDDEN' | 'INVALID_TRANSITION'; message: string };

const refuse = (code: 'FORBIDDEN' | 'INVALID_TRANSITION', message: string): DocumentResult => ({ ok: false, code, message });

/**
 * May this user upload a file? `slot` = the existing slot's status, or null for a NEW document
 * (added by the citizen from the service's list).
 */
export function checkUpload(requestStatus: RequestStatus, slot: DocumentStatus | null, role: Role): DocumentResult {
  if (role !== 'CITIZEN') return refuse('FORBIDDEN', 'Only the citizen who applied can upload documents');
  if (!UPLOAD_STATUSES.has(requestStatus)) {
    return refuse('INVALID_TRANSITION', `Documents cannot be uploaded in status ${requestStatus}`);
  }
  if (slot === 'ACCEPTED') return refuse('INVALID_TRANSITION', 'This document is already accepted');
  return { ok: true };
}

/** May this user accept / mark "not OK" a document? Only a file that is there can be reviewed. */
export function checkReview(requestStatus: RequestStatus, slot: DocumentStatus, role: Role): DocumentResult {
  if (role !== 'WARD_OFFICER') return refuse('FORBIDDEN', 'Only a ward officer can review documents');
  if (!REVIEW_STATUSES.has(requestStatus)) return refuse('INVALID_TRANSITION', `Documents cannot be reviewed in status ${requestStatus}`);
  if (slot === 'REQUESTED') return refuse('INVALID_TRANSITION', 'No file has been uploaded for this document yet');
  return { ok: true };
}

/** For the detail page's buttons (same rules as above, without a specific slot). */
export const canUploadDocuments = (status: RequestStatus, role: Role) => role === 'CITIZEN' && UPLOAD_STATUSES.has(status);
export const canReviewDocuments = (status: RequestStatus, role: Role) => role === 'WARD_OFFICER' && REVIEW_STATUSES.has(status);

/**
 * What the file REALLY is, from its first bytes ("magic numbers"), or null if it's not an allowed type.
 * We never trust the file name or the browser's Content-Type: both are chosen by the sender, so an
 * .exe or an HTML page could be uploaded as "photo.png".
 *   PDF  starts with "%PDF-"            25 50 44 46 2D
 *   PNG  starts with an 8-byte signature 89 50 4E 47 0D 0A 1A 0A
 *   JPEG starts with                      FF D8 FF
 */
export function detectFileType(bytes: Uint8Array): DocumentContentType | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  return null;
}

const EXTENSION: Record<DocumentContentType, string> = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg' };

/**
 * A safe file name to store and send back: no folders, no control or odd characters, at most 100
 * characters, and an extension that matches the real type (so "x.png" holding a PDF becomes "x.pdf").
 */
export function cleanFileName(original: string, type: DocumentContentType): string {
  const base = (original.split(/[\\/]/).pop() ?? '')
    .replace(/\.[^.]*$/, '') // drop the sender's extension
    .replace(/[^\p{L}\p{M}\p{N} ._-]+/gu, '_') // keep letters (any language) with their vowel signs (\p{M}), digits, space . _ -
    .trim()
    .slice(0, 100);
  return `${base || 'document'}${EXTENSION[type]}`;
}
