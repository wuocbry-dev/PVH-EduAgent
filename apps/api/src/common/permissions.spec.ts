// Kiểm tra bảng quyền trong @pvh/shared (gói shared chưa có bộ chạy test riêng).
import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS, ROLES, SCORE_PERMISSIONS } from '@pvh/shared';

describe('bảng quyền (@pvh/shared)', () => {
  it('ADMIN không có quyền điểm nào (điểm là dữ liệu nhạy cảm, quản trị hệ thống không xem)', () => {
    for (const p of SCORE_PERMISSIONS) expect(hasPermission('ADMIN', p)).toBe(false);
    expect(ROLE_PERMISSIONS.ADMIN.filter((p) => p.startsWith('score:') || p.startsWith('assessment:'))).toEqual([]);
  });

  it('giáo viên nhập điểm; BGH tạo đợt chung và xem mọi điểm nhưng không tự nhập; biên tập viên, học sinh không có quyền điểm', () => {
    expect(ROLE_PERMISSIONS.TEACHER).toContain('score:enter');
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain('assessment:manage');
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain('score:read:all');
    expect(ROLE_PERMISSIONS.PRINCIPAL).toEqual(expect.arrayContaining(['assessment:manage', 'score:read:all']));
    expect(ROLE_PERMISSIONS.PRINCIPAL).not.toContain('score:enter');
    for (const role of ['EDITOR', 'STUDENT'] as const) {
      for (const p of SCORE_PERMISSIONS) expect(hasPermission(role, p)).toBe(false);
    }
  });

  it('thư viện số: thủ thư và BGH quản lý, giáo viên gửi; ADMIN, biên tập, học sinh không có quyền thư viện (bước 21)', () => {
    expect(ROLE_PERMISSIONS.LIBRARIAN).toEqual(expect.arrayContaining(['library:manage', 'library:submit']));
    expect(ROLE_PERMISSIONS.PRINCIPAL).toEqual(expect.arrayContaining(['library:manage', 'library:submit']));
    expect(ROLE_PERMISSIONS.TEACHER).toContain('library:submit');
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain('library:manage');
    for (const role of ['ADMIN', 'EDITOR', 'STUDENT'] as const) {
      expect(ROLE_PERMISSIONS[role].filter((p) => p.startsWith('library:'))).toEqual([]);
    }
  });

  it('trắc nghiệm ôn tập: giáo viên soạn, thủ thư và BGH quản lý; ADMIN, biên tập, học sinh không có (bước 22)', () => {
    expect(ROLE_PERMISSIONS.TEACHER).toContain('quiz:create');
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain('quiz:manage');
    expect(ROLE_PERMISSIONS.LIBRARIAN).toContain('quiz:manage');
    expect(ROLE_PERMISSIONS.PRINCIPAL).toEqual(expect.arrayContaining(['quiz:create', 'quiz:manage']));
    for (const role of ['ADMIN', 'EDITOR', 'STUDENT'] as const) {
      expect(ROLE_PERMISSIONS[role].filter((p) => p.startsWith('quiz:'))).toEqual([]);
    }
  });

  it('mọi quyền của vai trò đều nằm trong danh sách PERMISSIONS', () => {
    for (const role of ROLES) for (const p of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toContain(p);
  });
});
