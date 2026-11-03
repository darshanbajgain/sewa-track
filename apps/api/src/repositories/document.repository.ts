import type { DocumentContentType, DocumentStatus } from '@sewa/shared';
import { pool } from '../db/pool.js';
import type { DbClient } from '../db/transaction.js';

/**
 * request_documents (PRD F15). The file bytes (`data`) are read ONLY by findDocumentFile: lists and
 * checks name their columns, so showing a page never loads megabytes of files from the database.
 */

export interface DocumentRow {
  id: string;
  name: string;
  status: DocumentStatus;
  requestedBy: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  fileName: string | null;
  contentType: DocumentContentType | null;
  sizeBytes: number | null;
  uploadedAt: Date | null;
}

export interface NewFile {
  fileName: string;
  contentType: DocumentContentType;
  data: Buffer;
}

const COLUMNS = `id, name, status, requested_by AS "requestedBy", review_note AS "reviewNote", reviewed_at AS "reviewedAt",
  file_name AS "fileName", content_type AS "contentType", size_bytes AS "sizeBytes", uploaded_at AS "uploadedAt"`;

/** All documents of a request, oldest first (no file bytes). */
export async function listDocuments(requestId: string): Promise<DocumentRow[]> {
  const { rows } = await pool.query<DocumentRow>(
    `SELECT ${COLUMNS} FROM request_documents WHERE request_id = $1 ORDER BY created_at, name`,
    [requestId],
  );
  return rows;
}

/** One document, only if it belongs to this request (so a document id can't be used through another request). */
export async function findDocument(requestId: string, documentId: string): Promise<DocumentRow | null> {
  const { rows } = await pool.query<DocumentRow>(`SELECT ${COLUMNS} FROM request_documents WHERE request_id = $1 AND id = $2`, [
    requestId,
    documentId,
  ]);
  return rows[0] ?? null;
}

/** The file itself, for download. */
export async function findDocumentFile(
  requestId: string,
  documentId: string,
): Promise<{ fileName: string; contentType: DocumentContentType; data: Buffer } | null> {
  const { rows } = await pool.query(
    `SELECT file_name AS "fileName", content_type AS "contentType", data
     FROM request_documents WHERE request_id = $1 AND id = $2 AND data IS NOT NULL`,
    [requestId, documentId],
  );
  return rows[0] ?? null;
}

/** The required-document names of the request's service, in English and Nepali (from the catalog). */
export async function findServiceDocumentNames(requestId: string): Promise<{ nameEn: string; nameNe: string }[]> {
  const { rows } = await pool.query<{ docs: { nameEn: string; nameNe: string }[] }>(
    `SELECT st.required_documents AS docs
     FROM service_requests r JOIN service_types st ON st.code = r.service_type_code
     WHERE r.id = $1`,
    [requestId],
  );
  return rows[0]?.docs ?? [];
}

/**
 * Locks the request row until the transaction ends (SELECT ... FOR UPDATE), so two document changes
 * on the same request run one after the other. That keeps "at most 10 documents" true even when two
 * uploads arrive at the same moment. Returns how many documents the request has.
 */
export async function lockRequestAndCountDocuments(client: DbClient, requestId: string): Promise<number> {
  await client.query('SELECT id FROM service_requests WHERE id = $1 FOR UPDATE', [requestId]);
  const { rows } = await client.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM request_documents WHERE request_id = $1',
    [requestId],
  );
  return rows[0]!.count;
}

/** Does the request already have a document with one of these names? Returns the names that exist. */
export async function existingDocumentNames(client: DbClient, requestId: string, names: string[]): Promise<string[]> {
  const { rows } = await client.query<{ name: string }>(
    'SELECT name FROM request_documents WHERE request_id = $1 AND name = ANY($2::text[])',
    [requestId, names],
  );
  return rows.map((r) => r.name);
}

/** A document the citizen adds themselves, with its file (status UPLOADED). */
export async function insertUploadedDocument(client: DbClient, requestId: string, name: string, file: NewFile): Promise<DocumentRow> {
  const { rows } = await client.query<DocumentRow>(
    `INSERT INTO request_documents (request_id, name, status, file_name, content_type, size_bytes, data, uploaded_at)
     VALUES ($1, $2, 'UPLOADED', $3, $4, $5, $6, now())
     RETURNING ${COLUMNS}`,
    [requestId, name, file.fileName, file.contentType, file.data.length, file.data],
  );
  return rows[0]!;
}

/**
 * A file uploaded into an existing slot: replaces any earlier file and clears the old review.
 * `status <> 'ACCEPTED'` in the WHERE: an accepted document can't be swapped, even in a race.
 */
export async function uploadIntoDocument(client: DbClient, documentId: string, file: NewFile): Promise<DocumentRow | null> {
  const { rows } = await client.query<DocumentRow>(
    `UPDATE request_documents
     SET status = 'UPLOADED', file_name = $2, content_type = $3, size_bytes = $4, data = $5, uploaded_at = now(),
         review_note = NULL, reviewed_by = NULL, reviewed_at = NULL
     WHERE id = $1 AND status <> 'ACCEPTED'
     RETURNING ${COLUMNS}`,
    [documentId, file.fileName, file.contentType, file.data.length, file.data],
  );
  return rows[0] ?? null;
}

/**
 * The officer asks for these documents: one REQUESTED slot per name. If the request already has a
 * document with that name, the slot is reset (old file and review cleared) so the citizen uploads again.
 */
export async function requestDocuments(client: DbClient, requestId: string, names: string[], officerId: string): Promise<void> {
  await client.query(
    `INSERT INTO request_documents (request_id, name, status, requested_by)
     SELECT $1, name, 'REQUESTED', $3 FROM unnest($2::text[]) AS name
     ON CONFLICT (request_id, name) DO UPDATE
     SET status = 'REQUESTED', requested_by = EXCLUDED.requested_by,
         file_name = NULL, content_type = NULL, size_bytes = NULL, data = NULL, uploaded_at = NULL,
         review_note = NULL, reviewed_by = NULL, reviewed_at = NULL`,
    [requestId, names, officerId],
  );
}

/** The officer's decision. Only a document with a file can be reviewed (`status <> 'REQUESTED'`). */
export async function reviewDocument(
  client: DbClient,
  documentId: string,
  decision: 'ACCEPTED' | 'REJECTED',
  note: string | null,
  officerId: string,
): Promise<DocumentRow | null> {
  const { rows } = await client.query<DocumentRow>(
    `UPDATE request_documents
     SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now()
     WHERE id = $1 AND status <> 'REQUESTED'
     RETURNING ${COLUMNS}`,
    [documentId, decision, note, officerId],
  );
  return rows[0] ?? null;
}

/** SQL piece: how many documents still wait for the citizen (used by the transition rules). */
export const OPEN_DOCUMENTS_SQL = `(SELECT count(*)::int FROM request_documents doc
   WHERE doc.request_id = r.id AND doc.status IN ('REQUESTED', 'REJECTED'))`;
