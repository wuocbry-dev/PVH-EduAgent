export const ROLES = ['ADMIN', 'PRINCIPAL', 'EDITOR', 'LIBRARIAN', 'TEACHER', 'STUDENT'] as const;
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
  'post:delete',
  'user:manage',
  'setting:manage',
  'academic:manage',
  'student:import',
  'teaching:read',
  'teaching:assign',
  'timetable:read',
  'timetable:manage',
  'score:enter',
  'assessment:manage',
  'score:read:all',
  'announcement:send',
  'announcement:manage',
  'library:submit',
  'library:manage',
  'quiz:create',
  'quiz:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Bảng phân quyền theo mục 5 – tài liệu phân tích đề tài.
// AI Agent không có quyền riêng: nó kế thừa đúng quyền của người dùng đã liên kết.
// `user:manage` (F11), `setting:manage` (F17) và `student:import` (bước 14) chỉ dành cho ADMIN;
// `academic:manage` (bước 14) cho ADMIN và PRINCIPAL. Giáo viên chủ nhiệm không phải vai trò: suy từ classes.homeroom_teacher_id.
// Điểm (bước 18) là dữ liệu nhạy cảm nhất: ADMIN không có quyền điểm nào; giáo viên nhập (score:enter) trong phạm vi phân công.
export const SCORE_PERMISSIONS = ['score:enter', 'assessment:manage', 'score:read:all'] as const satisfies readonly Permission[];
const isScorePermission = (p: Permission) => (SCORE_PERMISSIONS as readonly Permission[]).includes(p);

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Bước 28: phân công giảng dạy và thời khoá biểu (cả xem lẫn xếp) là việc của Ban giám hiệu; ADMIN chỉ lo hệ thống và dữ liệu học vụ gốc.
  // Thông báo cho học sinh/giáo viên (bước 20) là việc của BGH và giáo viên, không phải của quản trị hệ thống.
  // Bước 23: bài viết (duyệt/đăng/gỡ) là việc của BGH và biên tập viên, giao việc là của BGH; cổng /admin không có các trang này.
  // Xoá vĩnh viễn bài đã gỡ (post:delete) cũng là của BGH (bước 28).
  ADMIN: PERMISSIONS.filter(
    (p) =>
      !p.startsWith('post:') &&
      !p.startsWith('task:') &&
      !p.startsWith('teaching:') &&
      !p.startsWith('timetable:') &&
      !isScorePermission(p) &&
      !p.startsWith('announcement:') &&
      // Thư viện số (bước 21): duyệt nội dung là việc của thủ thư và BGH, không phải của quản trị hệ thống.
      !p.startsWith('library:') &&
      // Trắc nghiệm ôn tập (bước 22) cũng là nội dung học tập.
      !p.startsWith('quiz:'),
  ),
  // BGH tạo đợt thi chung và xem mọi điểm nhưng không tự nhập điểm (score:enter là của giáo viên được phân công).
  PRINCIPAL: PERMISSIONS.filter(
    (p) => p !== 'user:manage' && p !== 'setting:manage' && p !== 'student:import' && p !== 'score:enter',
  ),
  EDITOR: ['task:read:all', 'post:create', 'post:approve', 'post:schedule', 'post:unpublish'],
  // Thủ thư (bước 21): quản lý danh mục, duyệt/ẩn tài liệu, xem thống kê thư viện số; cũng tự gửi tài liệu.
  // quiz:manage (bước 22): quản lý mọi bộ trắc nghiệm ôn tập; quiz:create (giáo viên) chỉ môn mình dạy.
  LIBRARIAN: ['library:submit', 'library:manage', 'quiz:manage'],
  // announcement:send của giáo viên chỉ cho lớp mình dạy/chủ nhiệm (kiểm tra trong service); announcement:manage = mọi đối tượng.
  TEACHER: ['task:read:own', 'post:create', 'score:enter', 'announcement:send', 'library:submit', 'quiz:create'],
  STUDENT: [],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_NAMES: Record<Role, string> = {
  ADMIN: 'Quản trị hệ thống',
  PRINCIPAL: 'Ban giám hiệu',
  EDITOR: 'Biên tập viên',
  LIBRARIAN: 'Thủ thư',
  TEACHER: 'Giáo viên',
  STUDENT: 'Học sinh',
};
