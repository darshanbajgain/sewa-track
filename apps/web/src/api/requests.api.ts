import type {
  ChangeResultDto,
  DocumentDto,
  ReviewDocumentBody,
  CreateRequestInput,
  MyRequestDto,
  QueuePageDto,
  RequestDetailDto,
  RequestStatus,
  ServiceTypeCode,
  TransitionBody,
} from '@sewa/shared';
import { client } from './client';
import { ENDPOINTS } from './endpoints';

/** Service requests: citizen (submit, mine) and staff (queue, detail, changes). */

export interface CreatedRequest {
  id: string;
  trackingCode: string;
  status: RequestStatus;
  submittedAt: string;
}

export async function submitRequest(input: CreateRequestInput): Promise<CreatedRequest> {
  const { data } = await client.post<{ request: CreatedRequest }>(ENDPOINTS.requests.root, input);
  return data.request;
}

export async function getMyRequests(): Promise<MyRequestDto[]> {
  const { data } = await client.get<{ requests: MyRequestDto[] }>(ENDPOINTS.requests.mine);
  return data.requests;
}

/** Filters for the staff queue. Scope (ward/palika) is decided by the server from the session. */
export interface QueueFilters {
  status?: RequestStatus;
  serviceType?: ServiceTypeCode;
  overdue?: boolean;
  page?: number;
}

export async function getQueue(filters: QueueFilters = {}): Promise<QueuePageDto> {
  const { data } = await client.get<QueuePageDto>(ENDPOINTS.requests.root, { params: filters });
  return data;
}

export async function getRequestDetail(id: string): Promise<RequestDetailDto> {
  const { data } = await client.get<{ request: RequestDetailDto }>(ENDPOINTS.requests.detail(id));
  return data.request;
}

/** Change status with optimistic locking: send the `version` you loaded (409 if it's old). */
export async function changeStatus(id: string, body: TransitionBody): Promise<ChangeResultDto> {
  const { data } = await client.post<{ request: ChangeResultDto }>(ENDPOINTS.requests.transitions(id), body);
  return data.request;
}

export async function markFeePaid(id: string, version: number): Promise<ChangeResultDto> {
  const { data } = await client.post<{ request: ChangeResultDto }>(ENDPOINTS.requests.feePaid(id), { version });
  return data.request;
}

/**
 * Supporting documents (PRD F15). Uploads are multipart/form-data: given a FormData, axios sets the
 * right Content-Type (with the boundary) itself. A longer timeout than the default 15 s, because a
 * 2 MB file on a slow mobile connection can take a while.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

export async function addDocument(id: string, name: string, file: File): Promise<DocumentDto> {
  const form = new FormData();
  form.append('name', name); // text field first: the server reads fields in order
  form.append('file', file);
  const { data } = await client.post<{ document: DocumentDto }>(ENDPOINTS.requests.documents(id), form, { timeout: UPLOAD_TIMEOUT_MS });
  return data.document;
}

export async function uploadDocumentFile(id: string, documentId: string, file: File): Promise<DocumentDto> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.put<{ document: DocumentDto }>(ENDPOINTS.requests.documentFile(id, documentId), form, {
    timeout: UPLOAD_TIMEOUT_MS,
  });
  return data.document;
}

export async function reviewDocument(id: string, documentId: string, body: ReviewDocumentBody): Promise<DocumentDto> {
  const { data } = await client.post<{ document: DocumentDto }>(ENDPOINTS.requests.documentReview(id, documentId), body);
  return data.document;
}

/** Where the browser opens a document (same origin: the login cookie goes along, nothing else needed). */
export const documentFileUrl = (id: string, documentId: string) => `/api/v1${ENDPOINTS.requests.documentFile(id, documentId)}`;
