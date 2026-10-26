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

  it('mọi quyền của vai trò đều nằm trong danh sách PERMISSIONS', () => {
    for (const role of ROLES) for (const p of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toContain(p);
  });
});
