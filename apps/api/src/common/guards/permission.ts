import { ForbiddenException } from '@nestjs/common';
import type { Permission } from '@pvh/shared';
import type { AuthUser } from '../types/auth-user.js';

export function can(user: AuthUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

// Kiểm tra quyền phía server. Mọi service và mọi agent tool đều gọi hàm này,
// không để LLM tự quyết định quyền.
export function assertPermission(user: AuthUser, permission: Permission): void {
  if (!can(user, permission)) {
    throw new ForbiddenException(
      `Tài khoản ${user.email} không có quyền ${permission}`,
    );
  }
}
