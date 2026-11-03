import type { QueuePageDto, QueueQuery, RequestDetailDto } from '@sewa/shared';
import { QUEUE_PAGE_SIZE } from '@sewa/shared';
import { canViewRequest, queueScope } from '../domain/access.js';
import { canReviewDocuments, canUploadDocuments } from '../domain/documents.js';
import { checkMarkFeePaid } from '../domain/feePayment.js';
import { isOverdue } from '../domain/overdue.js';
import { allowedTransitions } from '../domain/transitions.js';
import { AppError } from '../errors.js';
import { listDocuments } from '../repositories/document.repository.js';
import { findEvents, findLatestIdentityCheck, findRequestDetail, listQueue } from '../repositories/staff.repository.js';
import type { SessionUser } from '../security/token.js';
import { toDocumentDto } from './document.service.js';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Staff queue (PRD F6): the user's scope (ward / palika / all) + optional filters, oldest first,
 * 20 per page. The scope comes from the LOGGED-IN USER, never from the query string, so an
 * officer can't ask for another ward's queue.
 */
export async function getQueue(user: SessionUser, query: QueueQuery, now: Date = new Date()): Promise<QueuePageDto> {
  const scope = queueScope(user);
  const rows = await listQueue({ ...scope, ...query, now });

  return {
    items: rows.map((r) => ({
      id: r.id,
      trackingCode: r.trackingCode,
      serviceTypeCode: r.serviceTypeCode,
      serviceNameEn: r.serviceNameEn,
      status: r.status,
      wardNumber: r.wardNumber,
      submittedAt: r.submittedAt.toISOString(),
      overdue: r.overdue,
      assignedOfficerName: r.assignedOfficerName,
    })),
    page: query.page,
    pageSize: QUEUE_PAGE_SIZE,
    total: rows[0]?.total ?? 0, // every row carries the same total (window function)
  };
}

/**
 * Request detail (PRD F6): the owner citizen or scoped staff only.
 *   unknown id → 404 · outside the user's scope → 403
 * Also tells the UI which actions THIS user may take now (from the domain rules), so it shows
 * only valid buttons.
 */
export async function getRequestDetail(user: SessionUser, id: string, now: Date = new Date()): Promise<RequestDetailDto> {
  const r = await findRequestDetail(id);
  if (!r) throw new AppError('NOT_FOUND', 'Request not found');

  if (!canViewRequest(user, { citizenId: r.citizenId, wardId: r.wardId, localLevelId: r.localLevelId })) {
    throw new AppError('FORBIDDEN', 'This request is outside your ward or palika');
  }

  const [events, identityCheck, documents] = await Promise.all([findEvents(id), findLatestIdentityCheck(id), listDocuments(id)]);

  const facts = {
    status: r.status,
    feeNpr: r.feeNpr,
    feePaidAt: r.feePaidAt,
    requiresFieldVerification: r.requiresFieldVerification,
    fieldVerifiedAt: r.fieldVerifiedAt,
    openDocuments: r.openDocuments,
  };

  return {
    id: r.id,
    trackingCode: r.trackingCode,
    status: r.status,
    version: r.version,
    service: {
      code: r.serviceCode,
      nameEn: r.serviceNameEn,
      nameNe: r.serviceNameNe,
      feeNpr: r.feeNpr,
      serviceDays: r.serviceDays,
      requiresFieldVerification: r.requiresFieldVerification,
    },
    location: {
      wardId: r.wardId,
      wardNumber: r.wardNumber,
      palikaNameEn: r.palikaNameEn,
      palikaNameNe: r.palikaNameNe,
      districtNameEn: r.districtNameEn,
    },
    purpose: r.purpose,
    applicant: { name: r.applicant.name, nid: r.applicant.nid },
    assignedOfficer: r.assignedOfficerId ? { id: r.assignedOfficerId, name: r.assignedOfficerName ?? '' } : null,
    feePaidAt: iso(r.feePaidAt),
    fieldVerifiedAt: iso(r.fieldVerifiedAt),
    submittedAt: r.submittedAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    closedAt: iso(r.closedAt),
    overdue: isOverdue({ status: r.status, submittedAt: r.submittedAt, serviceDays: r.serviceDays }, now),
    identityCheck,
    events: events.map((e) => ({
      action: e.action,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      actorName: e.actorName,
      at: e.at.toISOString(),
    })),
    documents: documents.map(toDocumentDto),
    allowedTransitions: allowedTransitions(facts, user.role),
    canMarkFeePaid: checkMarkFeePaid(facts, user.role).ok,
    canUploadDocuments: canUploadDocuments(r.status, user.role),
    canReviewDocuments: canReviewDocuments(r.status, user.role),
  };
}
