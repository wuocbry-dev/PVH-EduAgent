export const ROLES = ['ADMIN', 'PRINCIPAL', 'EDITOR', 'TEACHER', 'STUDENT'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'system:read',
  'task:read:all',
  'task:read:own',
  'task:assign',
  'post:create',
  'post:approve',
  'post:schedule',
  'post:unpublish',
  'user:manage',
  'setting:manage',
  'academic:manage',
  'student:import',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Bảng phân quyền theo mục 5 – tài liệu phân tích đề tài.
// AI Agent không có quyền riêng: nó kế thừa đúng quyền của người dùng đã liên kết.
// `user:manage` (F11), `setting:manage` (F17) và `student:import` (bước 14) chỉ dành cho ADMIN;
// `academic:manage` (bước 14) cho ADMIN và PRINCIPAL. Giáo viên chủ nhiệm không phải vai trò: suy từ classes.homeroom_teacher_id.
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  PRINCIPAL: PERMISSIONS.filter((p) => p !== 'user:manage' && p !== 'setting:manage' && p !== 'student:import'),
  EDITOR: ['task:read:all', 'post:create', 'post:approve', 'post:schedule', 'post:unpublish'],
  TEACHER: ['task:read:own', 'post:create'],
  STUDENT: [],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_NAMES: Record<Role, string> = {
  ADMIN: 'Quản trị hệ thống',
  PRINCIPAL: 'Ban giám hiệu',
  EDITOR: 'Biên tập viên',
  TEACHER: 'Giáo viên',
  STUDENT: 'Học sinh',
};
