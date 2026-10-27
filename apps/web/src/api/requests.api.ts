import type {
  ChangeResultDto,
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
