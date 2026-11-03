import { addDocumentBodySchema, documentParamsSchema, requestIdParamsSchema, reviewDocumentBodySchema } from '@sewa/shared';
import type { Request, RequestHandler } from 'express';
import { addDocument, getDocumentFile, reviewDocument, uploadDocumentFile, type UploadedFile } from '../services/document.service.js';

/** The file multer read into memory, in the shape the service wants (or undefined if none was sent). */
const fileOf = (req: Request): UploadedFile | undefined =>
  req.file ? { originalName: req.file.originalname, buffer: req.file.buffer } : undefined;

/** POST /api/v1/requests/:id/documents (owner citizen, multipart: name + file): add a listed document. */
export const postDocument: RequestHandler = async (req, res) => {
  const { id } = requestIdParamsSchema.parse(req.params);
  const { name } = addDocumentBodySchema.parse(req.body ?? {});
  res.status(201).json({ document: await addDocument(req.user!, id, name, fileOf(req)) });
};

/** PUT /api/v1/requests/:id/documents/:documentId/file (owner citizen, multipart: file) */
export const putDocumentFile: RequestHandler = async (req, res) => {
  const { id, documentId } = documentParamsSchema.parse(req.params);
  res.json({ document: await uploadDocumentFile(req.user!, id, documentId, fileOf(req)) });
};

/** POST /api/v1/requests/:id/documents/:documentId/review (ward officer): { decision, note? } */
export const postDocumentReview: RequestHandler = async (req, res) => {
  const { id, documentId } = documentParamsSchema.parse(req.params);
  const body = reviewDocumentBodySchema.parse(req.body);
  res.json({ document: await reviewDocument(req.user!, id, documentId, body) });
};

/**
 * GET /api/v1/requests/:id/documents/:documentId/file (owner or scoped staff)
 *
 * The file was uploaded by someone else, so it is sent defensively:
 *   Content-Type from OUR check of the bytes (not what the uploader claimed)
 *   X-Content-Type-Options: nosniff → the browser must not guess another type (e.g. run it as HTML)
 *   Content-Security-Policy: sandbox → even if opened as a page, no scripts, no same-origin access
 *   Content-Disposition: inline + our cleaned file name → shown in the browser's own PDF/image viewer
 *   Cache-Control: private, no-store → not kept by shared caches or on disk
 */
export const getDocumentFileHandler: RequestHandler = async (req, res) => {
  const { id, documentId } = documentParamsSchema.parse(req.params);
  const file = await getDocumentFile(req.user!, id, documentId);
  res.set({
    'Content-Type': file.contentType,
    'Content-Length': String(file.data.length),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    'Cache-Control': 'private, no-store',
  });
  res.send(file.data);
};
