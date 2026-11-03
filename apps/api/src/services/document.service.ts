import { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS_PER_REQUEST, type DocumentDto, type ReviewDocumentBody } from '@sewa/shared';
import { withTransaction, type DbClient } from '../db/transaction.js';
import { canViewRequest } from '../domain/access.js';
import { checkReview, checkUpload, cleanFileName, detectFileType, type DocumentResult } from '../domain/documents.js';
import { AppError } from '../errors.js';
import { findChangeFacts, type ChangeFacts } from '../repositories/change.repository.js';
import {
  existingDocumentNames,
  findDocument,
  findDocumentFile,
  findServiceDocumentNames,
  insertUploadedDocument,
  lockRequestAndCountDocuments,
  requestDocuments,
  reviewDocument as saveReview,
  uploadIntoDocument,
  type DocumentRow,
  type NewFile,
} from '../repositories/document.repository.js';
import { insertEvent } from '../repositories/event.repository.js';
import type { SessionUser } from '../security/token.js';

/**
 * Supporting documents (PRD F15). Every function follows the same order as change.service.ts:
 *   1. request exists?                          no → 404
 *   2. in the user's scope?                     no → 403  (same rule as the detail page)
 *   3. domain rule (role, request status, slot) no → 403 / 422
 *   4. file checks (type from first bytes, size) no → 400
 *   5. ONE transaction: the document change + its audit event (both saved, or neither)
 */

/** What multer hands us for the uploaded file (kept in memory, never written to disk). */
export interface UploadedFile {
  originalName: string;
  buffer: Buffer;
}

export function toDocumentDto(d: DocumentRow): DocumentDto {
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    requestedByOfficer: d.requestedBy !== null,
    file:
      d.fileName && d.contentType && d.sizeBytes !== null && d.uploadedAt
        ? { name: d.fileName, contentType: d.contentType, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt.toISOString() }
        : null,
    reviewNote: d.reviewNote,
    reviewedAt: d.reviewedAt ? d.reviewedAt.toISOString() : null,
  };
}

/** Steps 1 + 2: the request, if this user may see it. */
async function loadVisibleRequest(user: SessionUser, requestId: string): Promise<ChangeFacts> {
  const facts = await findChangeFacts(requestId);
  if (!facts) throw new AppError('NOT_FOUND', 'Request not found');
  if (!canViewRequest(user, facts)) throw new AppError('FORBIDDEN', 'This request is outside your ward or not yours');
  return facts;
}

async function loadDocument(requestId: string, documentId: string): Promise<DocumentRow> {
  const doc = await findDocument(requestId, documentId);
  if (!doc) throw new AppError('NOT_FOUND', 'Document not found');
  return doc;
}

function enforce(result: DocumentResult): void {
  if (!result.ok) throw new AppError(result.code, result.message);
}

/** Step 4: the file must really be a JPEG/PNG/PDF (checked from its bytes) and at most 2 MB. */
function checkFile(file: UploadedFile | undefined): NewFile {
  if (!file || file.buffer.length === 0) throw new AppError('VALIDATION_ERROR', 'Choose a file to upload');
  // multer already stops bigger uploads; this second check keeps the rule true even without multer.
  if (file.buffer.length > MAX_DOCUMENT_BYTES) throw new AppError('VALIDATION_ERROR', 'The file is larger than 2 MB');
  const contentType = detectFileType(file.buffer);
  if (!contentType) throw new AppError('VALIDATION_ERROR', 'Only JPEG, PNG or PDF files are accepted');
  return { fileName: cleanFileName(file.originalName, contentType), contentType, data: file.buffer };
}

/**
 * The citizen adds a document from the service's list (e.g. at apply time), with its file.
 * The name must be one of the service's required documents (English or Nepali); it is stored in English.
 */
export async function addDocument(user: SessionUser, requestId: string, name: string, upload: UploadedFile | undefined): Promise<DocumentDto> {
  const facts = await loadVisibleRequest(user, requestId);
  enforce(checkUpload(facts.status, null, user.role));

  const listed = (await findServiceDocumentNames(requestId)).find((d) => d.nameEn === name || d.nameNe === name);
  if (!listed) throw new AppError('VALIDATION_ERROR', "This document is not in the service's list");
  const file = checkFile(upload);

  return withTransaction(async (client) => {
    await checkRoomFor(client, requestId, 1);
    if ((await existingDocumentNames(client, requestId, [listed.nameEn])).length > 0) {
      throw new AppError('CONFLICT', 'This document is already on the request; upload into it instead');
    }
    const doc = await insertUploadedDocument(client, requestId, listed.nameEn, file);
    await insertEvent(client, { requestId, actorId: user.id, action: 'DOCUMENT_UPLOADED', note: doc.name });
    return toDocumentDto(doc);
  });
}

/** The citizen uploads a file into an existing document (requested by the officer, or marked "not OK"). */
export async function uploadDocumentFile(
  user: SessionUser,
  requestId: string,
  documentId: string,
  upload: UploadedFile | undefined,
): Promise<DocumentDto> {
  const facts = await loadVisibleRequest(user, requestId);
  const doc = await loadDocument(requestId, documentId);
  enforce(checkUpload(facts.status, doc.status, user.role));
  const file = checkFile(upload);

  return withTransaction(async (client) => {
    await lockRequestAndCountDocuments(client, requestId);
    const updated = await uploadIntoDocument(client, documentId, file);
    // 0 rows: the officer accepted it between our check and now.
    if (!updated) throw new AppError('CONFLICT', 'This document was just accepted; reload to see the latest');
    await insertEvent(client, { requestId, actorId: user.id, action: 'DOCUMENT_UPLOADED', note: updated.name });
    return toDocumentDto(updated);
  });
}

/** The ward officer accepts a document or marks it "not OK" with a reason. */
export async function reviewDocument(user: SessionUser, requestId: string, documentId: string, body: ReviewDocumentBody): Promise<DocumentDto> {
  const facts = await loadVisibleRequest(user, requestId);
  const doc = await loadDocument(requestId, documentId);
  enforce(checkReview(facts.status, doc.status, user.role));
  const note = body.decision === 'REJECTED' ? (body.note ?? null) : null;

  return withTransaction(async (client) => {
    await lockRequestAndCountDocuments(client, requestId);
    const updated = await saveReview(client, documentId, body.decision, note, user.id);
    if (!updated) throw new AppError('CONFLICT', 'This document changed; reload to see the latest');
    const verdict = body.decision === 'ACCEPTED' ? 'accepted' : `not OK: ${note}`;
    await insertEvent(client, { requestId, actorId: user.id, action: 'DOCUMENT_REVIEWED', note: `${updated.name} (${verdict})` });
    return toDocumentDto(updated);
  });
}

/** Download: the owner and scoped staff (the same people who can open the request). */
export async function getDocumentFile(user: SessionUser, requestId: string, documentId: string) {
  await loadVisibleRequest(user, requestId);
  const file = await findDocumentFile(requestId, documentId);
  if (!file) throw new AppError('NOT_FOUND', 'Document file not found');
  return file;
}

/**
 * Used by change.service when the officer moves a request to NEEDS_DOCUMENTS, inside THAT transaction:
 * the status change, the requested documents and the audit event are saved together.
 */
export async function requestDocumentsInTransaction(client: DbClient, requestId: string, names: string[], officerId: string): Promise<void> {
  const existing = await existingDocumentNames(client, requestId, names);
  await checkRoomFor(client, requestId, names.length - existing.length);
  await requestDocuments(client, requestId, names, officerId);
}

/** At most 10 documents per request. Also locks the request row so two uploads can't both squeeze in. */
async function checkRoomFor(client: DbClient, requestId: string, adding: number): Promise<void> {
  const count = await lockRequestAndCountDocuments(client, requestId);
  if (count + adding > MAX_DOCUMENTS_PER_REQUEST) {
    throw new AppError('VALIDATION_ERROR', `A request can have at most ${MAX_DOCUMENTS_PER_REQUEST} documents`);
  }
}
