import type { Permission, Role } from './roles.js';

// PENDING = tài khoản nhập hàng loạt, chờ kích hoạt bằng mã dùng một lần (bước 14).
export const USER_STATUSES = ['ACTIVE', 'LOCKED', 'PENDING'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_NAMES: Record<UserStatus, string> = {
  ACTIVE: 'Hoạt động',
  LOCKED: 'Đã khóa',
  PENDING: 'Chờ kích hoạt',
};

// GET /api/users
export interface UserDto {
  id: string;
  // Học sinh có thể không có email (đăng nhập bằng mã học sinh).
  email: string | null;
  fullName: string;
  phone: string | null;
  status: UserStatus;
  roles: Role[];
  // Mã học sinh hoặc mã giáo viên (nếu có hồ sơ).
  code: string | null;
  // Lớp của năm học hiện hành (học sinh) hoặc lớp chủ nhiệm (giáo viên).
  className: string | null;
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
