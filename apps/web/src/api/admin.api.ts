import type { AdminUserDto, CreateStaffInput, Role, UserPageDto } from '@sewa/shared';
import { client } from './client';
import { ENDPOINTS } from './endpoints';

/** System admin: user management (PRD F14). The API allows these calls only for SYSTEM_ADMIN. */

export interface UserListParams {
  role?: Role;
  q?: string;
  page?: number;
}

export async function listUsers(params: UserListParams): Promise<UserPageDto> {
  const { data } = await client.get<UserPageDto>(ENDPOINTS.admin.users, { params });
  return data;
}

export async function createStaff(input: CreateStaffInput): Promise<AdminUserDto> {
  const { data } = await client.post<{ user: AdminUserDto }>(ENDPOINTS.admin.users, input);
  return data.user;
}

export async function setUserActive(id: string, isActive: boolean): Promise<AdminUserDto> {
  const { data } = await client.patch<{ user: AdminUserDto }>(ENDPOINTS.admin.user(id), { isActive });
  return data.user;
}
