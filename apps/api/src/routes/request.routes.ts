import { Router, type Router as ExpressRouter } from 'express';
import {
  getMyRequests,
  getQueueHandler,
  getRequestDetailHandler,
  postFeePaid,
  postRequest,
  postTransition,
} from '../controllers/request.controller.js';
import { getDocumentFileHandler, postDocument, postDocumentReview, putDocumentFile } from '../controllers/document.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { singleFileUpload } from '../middleware/upload.js';

// Service requests. Every route: must be logged in (401) AND have the right role (403).
export const requestRouter: ExpressRouter = Router();

requestRouter.post('/requests', requireAuth, requireRole('CITIZEN'), postRequest);
// '/requests/mine' is registered before any future '/requests/:id', or "mine" would be read as an id.
requestRouter.get('/requests/mine', requireAuth, requireRole('CITIZEN'), getMyRequests);

// Staff queue: only staff roles; WHICH rows they see is decided by their scope in the service.
requestRouter.get('/requests', requireAuth, requireRole('WARD_OFFICER', 'PALIKA_ADMIN', 'SYSTEM_ADMIN'), getQueueHandler);
// Detail: any logged-in user; the service allows only the owner or scoped staff (else 403).
requestRouter.get('/requests/:id', requireAuth, getRequestDetailHandler);

// Changes. Palika and system admins are refused here (403): they are read-only (PRD §4).
requestRouter.post('/requests/:id/transitions', requireAuth, requireRole('WARD_OFFICER', 'CITIZEN'), postTransition);
requestRouter.post('/requests/:id/fee-paid', requireAuth, requireRole('WARD_OFFICER'), postFeePaid);

// Supporting documents (PRD F15). Uploads: auth + role FIRST, so the file is read only for a logged-in citizen.
// Which request and which document (own request / own ward) is checked in the service, like the detail page.
requestRouter.post('/requests/:id/documents', requireAuth, requireRole('CITIZEN'), singleFileUpload, postDocument);
requestRouter.put('/requests/:id/documents/:documentId/file', requireAuth, requireRole('CITIZEN'), singleFileUpload, putDocumentFile);
requestRouter.get('/requests/:id/documents/:documentId/file', requireAuth, getDocumentFileHandler);
requestRouter.post('/requests/:id/documents/:documentId/review', requireAuth, requireRole('WARD_OFFICER'), postDocumentReview);
