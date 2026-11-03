import { MAX_DOCUMENT_BYTES } from '@sewa/shared';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../errors.js';

/**
 * Reads ONE uploaded file from a multipart/form-data body (PRD F15), into memory only (never to disk:
 * nothing to clean up, nothing left on the server). Used only on the document upload routes, AFTER
 * requireAuth, so an anonymous caller can't even make us read a file.
 *
 * Limits stop a big or odd body early, while it streams in: one file of at most 2 MB, field `file`,
 * plus at most one small text field (`name`).
 */
const parseSingleFile = multer({
  storage: multer.memoryStorage(),
  // Browsers send file names as UTF-8; the default (latin1) would garble Nepali names like "जन्मदर्ता.pdf".
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 1, fieldSize: 1000, parts: 2 },
}).single('file');

const MESSAGES: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_FILE_SIZE: 'The file is larger than 2 MB',
  LIMIT_FILE_COUNT: 'Upload one file at a time',
  LIMIT_UNEXPECTED_FILE: 'Send the file in a field named "file"',
};

/** Any problem while reading the upload is the sender's fault → our standard 400, never a 500. */
export const singleFileUpload: RequestHandler = (req, res, next) => {
  parseSingleFile(req, res, (err: unknown) => {
    if (!err) return next();
    const message = err instanceof multer.MulterError ? (MESSAGES[err.code] ?? 'Invalid upload') : 'Invalid upload';
    next(new AppError('VALIDATION_ERROR', message));
  });
};
