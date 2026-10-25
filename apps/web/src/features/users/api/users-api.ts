import type {
  CreateUserRequest,
  Permission,
  Role,
  RoleDto,
  RolesOverviewDto,
  UpdateUserRequest,
  UserDto,
  UserListDto,
  UserStatus,
} from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export interface UserFilters {
  q: string;
  status: UserStatus | "";
  role: Role | "";
  page: number;
}

export const USERS_PAGE_SIZE = 10;

export function listUsers(filters: UserFilters) {
  const params = new URLSearchParams({ page: String(filters.page), pageSize: String(USERS_PAGE_SIZE) });
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.role) params.set("role", filters.role);
  return api<UserListDto>(`/users?${params}`);
}

export function createUser(body: CreateUserRequest) {
  return api<UserDto>("/users", { method: "POST", body: JSON.stringify(body) });
}

export function updateUser(id: string, body: UpdateUserRequest) {
  return api<UserDto>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function setUserStatus(id: string, status: UserStatus) {
  return api<UserDto>(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function resetUserPassword(id: string, newPassword: string) {
  return api<void>(`/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword }) });
}

export function getRoles() {
  return api<RolesOverviewDto>("/roles");
}

export function updateRolePermissions(role: Role, permissions: Permission[]) {
  return api<RoleDto>(`/roles/${role}/permissions`, { method: "PUT", body: JSON.stringify({ permissions }) });
}
