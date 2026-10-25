import type { Permission, Role } from './roles.js';

export const USER_STATUSES = ['ACTIVE', 'LOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_NAMES: Record<UserStatus, string> = {
  ACTIVE: 'Hoạt động',
  LOCKED: 'Đã khóa',
};

// GET /api/users
export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: UserStatus;
  roles: Role[];
  createdAt: string;
}

export interface UserListDto {
  items: UserDto[];
  total: number;
  page: number;
  pageSize: number;
}

// POST /api/users
export interface CreateUserRequest {
  email: string;
  fullName: string;
  phone?: string | null;
  password: string;
  roles: Role[];
}

// PATCH /api/users/:id
export interface UpdateUserRequest {
  fullName?: string;
  phone?: string | null;
  roles?: Role[];
}

// GET /api/roles
export interface RoleDto {
  code: Role;
  name: string;
  permissions: Permission[];
}

export interface PermissionDto {
  code: Permission;
  description: string | null;
}

export interface RolesOverviewDto {
  roles: RoleDto[];
  permissions: PermissionDto[];
}
