import { z } from 'zod';

/**
 * Supporting documents of a request (PRD F15). One "slot" = one named document with at most one file.
 *   REQUESTED → (citizen uploads) → UPLOADED → (officer) → ACCEPTED or REJECTED ("not OK")
 *   A REJECTED document can be uploaded again (→ UPLOADED).
 */
export const DOCUMENT_STATUSES = ['REQUESTED', 'UPLOADED', 'ACCEPTED', 'REJECTED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** The only file types accepted. The API checks the file's first bytes, not the name or browser type. */
export const DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];

export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024; // 2 MB, also a CHECK in the database
export const MAX_DOCUMENTS_PER_REQUEST = 10;
export const MAX_DOCUMENTS_PER_ASK = 5; // names an officer can ask for in one go

export const documentNameSchema = z.string().trim().min(2, 'Document name is too short').max(200);

/**
 * The documents an officer asks for when moving a request to NEEDS_DOCUMENTS: 1–5 names, no repeats
 * (compared ignoring case, so "Birth certificate" and "birth certificate" can't both be asked).
 */
export const requestedDocumentsSchema = z
  .array(documentNameSchema)
  .min(1, 'Name at least one document')
  .max(MAX_DOCUMENTS_PER_ASK, `At most ${MAX_DOCUMENTS_PER_ASK} documents at a time`)
  .refine((names) => new Set(names.map((n) => n.toLowerCase())).size === names.length, 'Each document only once');

/** POST /requests/:id/documents (multipart): the `name` field next to the file. */
export const addDocumentBodySchema = z.object({ name: documentNameSchema });

/** Path parameters of /requests/:id/documents/:documentId/... */
export const documentParamsSchema = z.object({
  id: z.uuid('Invalid request id'),
  documentId: z.uuid('Invalid document id'),
});

/** POST /requests/:id/documents/:documentId/review (ward officer). "Not OK" needs a reason. */
export const reviewDocumentBodySchema = z
  .object({
    decision: z.enum(['ACCEPTED', 'REJECTED']),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((b) => b.decision === 'ACCEPTED' || (b.note ?? '') !== '', { message: 'Write why the document is not OK', path: ['note'] });
export type ReviewDocumentBody = z.infer<typeof reviewDocumentBodySchema>;

/** A document as the owner and scoped staff see it (never in public tracking). No file bytes here. */
export interface DocumentDto {
  id: string;
  name: string;
  status: DocumentStatus;
  requestedByOfficer: boolean; // false = the citizen added it (e.g. at apply time)
  file: { name: string; contentType: DocumentContentType; sizeBytes: number; uploadedAt: string } | null;
  reviewNote: string | null; // the reason when "not OK"
  reviewedAt: string | null;
}
