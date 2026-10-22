import type { Permission, Role } from '@pvh/shared';

export interface AuthUser {
  // users.id (bigint) dạng chuỗi, vì JSON không biểu diễn được BigInt.
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
  // Gộp quyền của mọi vai trò, đọc từ bảng role_permissions.
  permissions: Permission[];
}
