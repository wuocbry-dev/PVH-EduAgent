import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canEnterPortal,
  PORTAL_COMMON_SLUGS,
  PORTAL_INFO,
  PORTALS,
  portalOfPath,
  portalRedirect,
  portalSections,
  portalsFor,
  primaryPortal,
  ROLE_PERMISSIONS,
  sectionOfPath,
  type Role,
} from '@pvh/shared';

describe('cổng theo vai trò (@pvh/shared)', () => {
  it('cổng chính theo thứ tự ưu tiên ADMIN → PRINCIPAL → EDITOR → TEACHER → STUDENT', () => {
    expect(primaryPortal(['STUDENT'])).toBe('hoc-sinh');
    expect(primaryPortal(['TEACHER', 'STUDENT'])).toBe('giao-vien');
    expect(primaryPortal(['EDITOR', 'TEACHER'])).toBe('bien-tap');
    expect(primaryPortal(['TEACHER', 'PRINCIPAL', 'EDITOR'])).toBe('bgh');
    expect(primaryPortal(['EDITOR', 'ADMIN'])).toBe('admin');
    expect(primaryPortal([])).toBeNull();
  });

  it('mỗi vai trò đúng một cổng; người nhiều vai trò vào được nhiều cổng, cổng không có quyền thì không', () => {
    expect(portalsFor(['PRINCIPAL', 'TEACHER'])).toEqual(['bgh', 'giao-vien']);
    expect(canEnterPortal(['STUDENT'], 'admin')).toBe(false);
    expect(canEnterPortal(['STUDENT'], 'giao-vien')).toBe(false);
    expect(canEnterPortal(['TEACHER'], 'giao-vien')).toBe(true);
    for (const p of PORTALS) expect(PORTAL_INFO[p].path).toBe(`/${p}`);
  });

  it('nhận diện cổng và mục từ đường dẫn', () => {
    expect(portalOfPath('/bgh/bai-viet/3')).toBe('bgh');
    expect(portalOfPath('/tin-tuc/abc')).toBeNull();
    expect(portalOfPath('/')).toBeNull();
    expect(sectionOfPath('/bgh/bai-viet/3')).toBe('bai-viet');
    expect(sectionOfPath('/bgh')).toBe('');
  });

  describe('portalRedirect', () => {
    const go = (roles: Role[], path: string) => portalRedirect(roles, path);

    it('học sinh không vào được cổng nhân sự: về cổng của mình, kể cả với đường dẫn cũ', () => {
      expect(go(['STUDENT'], '/admin')).toBe('/hoc-sinh');
      expect(go(['STUDENT'], '/admin/nguoi-dung')).toBe('/hoc-sinh');
      expect(go(['STUDENT'], '/bgh/bai-viet')).toBe('/hoc-sinh');
      expect(go(['STUDENT'], '/giao-vien/cong-viec')).toBe('/hoc-sinh');
      expect(go(['STUDENT'], '/hoc-sinh')).toBeNull();
      expect(go(['STUDENT'], '/hoc-sinh/doi-mat-khau')).toBeNull();
    });

    it('đường dẫn cũ trong /admin chuyển sang cổng đúng của người dùng, giữ phần còn lại', () => {
      expect(go(['PRINCIPAL'], '/admin/bai-viet/12')).toBe('/bgh/bai-viet/12');
      expect(go(['PRINCIPAL'], '/admin/hoc-vu')).toBe('/bgh/hoc-vu');
      expect(go(['EDITOR'], '/admin/chuyen-muc')).toBe('/bien-tap/chuyen-muc');
      expect(go(['EDITOR'], '/admin/bai-viet/moi')).toBe('/bien-tap/bai-viet/moi');
      expect(go(['TEACHER'], '/admin/cong-viec')).toBe('/giao-vien/cong-viec');
      expect(go(['TEACHER'], '/admin/tai-khoan')).toBe('/giao-vien/tai-khoan');
    });

    it('mục không thuộc cổng nào của người đó thì về trang chủ cổng chính (không lộ 403)', () => {
      expect(go(['ADMIN'], '/admin/bai-viet')).toBe('/admin');
      expect(go(['PRINCIPAL'], '/bgh/nguoi-dung')).toBe('/bgh');
      expect(go(['TEACHER'], '/bien-tap/chuyen-muc')).toBe('/giao-vien');
    });

    it('đúng cổng thì không chuyển; mục lạ trong cổng của mình để trang 404 của cổng xử lý', () => {
      expect(go(['PRINCIPAL'], '/bgh')).toBeNull();
      expect(go(['PRINCIPAL'], '/bgh/bai-viet/3')).toBeNull();
      expect(go(['TEACHER'], '/giao-vien/khong-co')).toBeNull();
      expect(go(['ADMIN'], '/admin/nhap-danh-sach')).toBeNull();
    });

    it('nhiều vai trò: dùng cổng của mình có mục đó, theo thứ tự ưu tiên', () => {
      expect(go(['PRINCIPAL', 'EDITOR'], '/admin/bai-viet')).toBe('/bgh/bai-viet');
      expect(go(['PRINCIPAL', 'EDITOR'], '/bien-tap/bai-viet')).toBeNull();
      expect(go(['PRINCIPAL', 'EDITOR'], '/bien-tap/hoc-vu')).toBe('/bgh/hoc-vu');
      expect(go(['PRINCIPAL', 'EDITOR'], '/bgh/chuyen-muc')).toBe('/bien-tap/chuyen-muc');
    });

    it('thủ thư vào cổng /thu-thu; vào cổng khác thì về /thu-thu (bước 21)', () => {
      expect(primaryPortal(['LIBRARIAN'])).toBe('thu-thu');
      expect(go(['LIBRARIAN'], '/thu-thu/duyet-tai-lieu')).toBeNull();
      expect(go(['LIBRARIAN'], '/bgh/thu-vien-so')).toBe('/thu-thu');
      expect(go(['LIBRARIAN'], '/giao-vien/tai-lieu-cua-toi')).toBe('/thu-thu/tai-lieu-cua-toi');
      expect(go(['TEACHER'], '/thu-thu/duyet-tai-lieu')).toBe('/giao-vien');
      expect(go(['STUDENT'], '/thu-thu')).toBe('/hoc-sinh');
    });

    it('trang nghiệp vụ đã bỏ khỏi cổng admin (bước 28) về trang chủ cổng, BGH vẫn vào được trang của mình', () => {
      expect(go(['ADMIN'], '/admin/phan-cong')).toBe('/admin');
      expect(go(['ADMIN'], '/admin/thoi-khoa-bieu')).toBe('/admin');
      expect(go(['ADMIN'], '/admin/hoc-vu')).toBeNull();
      expect(go(['ADMIN'], '/admin/loi-he-thong')).toBeNull();
      expect(go(['PRINCIPAL'], '/admin/phan-cong')).toBe('/bgh/phan-cong');
      expect(go(['PRINCIPAL'], '/admin/thoi-khoa-bieu')).toBe('/bgh/thoi-khoa-bieu');
    });

    it('đường dẫn ngoài các cổng không bị đụng tới; không có vai trò nào thì về trang chủ', () => {
      expect(go(['TEACHER'], '/tin-tuc')).toBeNull();
      expect(go([], '/bgh')).toBe('/');
    });
  });

  it('menu admin chỉ có việc hệ thống, theo nhóm Tài khoản → Dữ liệu trường → Hệ thống (bước 28)', () => {
    const nav = PORTAL_INFO.admin.nav;
    expect(nav.some((n) => n.slug === 'phan-cong' || n.slug === 'thoi-khoa-bieu')).toBe(false);
    expect(nav.map((n) => [n.group ?? '', n.label])).toEqual([
      ['', 'Tổng quan hệ thống'],
      ['Tài khoản', 'Người dùng'],
      ['Tài khoản', 'Nhập danh sách'],
      ['Tài khoản', 'Vai trò và quyền'],
      ['Tài khoản', 'Bảo mật và đăng nhập'],
      ['Dữ liệu trường', 'Học vụ'],
      ['Hệ thống', 'Cấu hình'],
      ['Hệ thống', 'Trợ lý AI'],
      ['Hệ thống', 'Nhật ký hoạt động'],
      ['Hệ thống', 'Lỗi và hàng đợi'],
    ]);
    // Mỗi nhóm liền một khối (menu hiện tiêu đề khi nhóm đổi, nhóm lặp lại sẽ bị hiện hai lần).
    const groups = nav.map((n) => n.group).filter((g, i, all) => g !== all[i - 1]);
    expect(new Set(groups).size).toBe(groups.length);
    // Mục admin chỉ cần quyền ADMIN đang có: không mục nào ẩn mất với ADMIN.
    for (const item of nav) {
      expect(!item.permissions || item.permissions.some((p) => ROLE_PERMISSIONS.ADMIN.includes(p)), item.slug).toBe(true);
    }
    // Cổng khác không khai nhóm: menu phẳng như cũ.
    for (const portal of PORTALS.filter((p) => p !== 'admin')) expect(PORTAL_INFO[portal].nav.every((n) => !n.group)).toBe(true);
  });

  it('mọi mục trong menu và trang chung đều có trang tương ứng trong apps/web/src/app (không menu trỏ vào 404)', () => {
    const app = resolve(process.cwd(), '../web/src/app');
    for (const portal of PORTALS) {
      expect(existsSync(resolve(app, portal, 'page.tsx')), `${portal}/page.tsx`).toBe(true);
      expect(existsSync(resolve(app, portal, 'layout.tsx')), `${portal}/layout.tsx`).toBe(true);
      expect(existsSync(resolve(app, portal, 'not-found.tsx')), `${portal}/not-found.tsx`).toBe(true);
      for (const slug of PORTAL_INFO[portal].nav.map((n) => n.slug).filter(Boolean)) {
        expect(existsSync(resolve(app, portal, slug, 'page.tsx')), `${portal}/${slug}`).toBe(true);
      }
    }
    // Trang chung: học sinh chỉ có đổi mật khẩu (chưa có Telegram cho học sinh).
    for (const portal of PORTALS.filter((p) => p !== 'hoc-sinh')) {
      for (const slug of PORTAL_COMMON_SLUGS) expect(existsSync(resolve(app, portal, slug, 'page.tsx')), `${portal}/${slug}`).toBe(true);
    }
    expect(existsSync(resolve(app, 'hoc-sinh', 'doi-mat-khau', 'page.tsx'))).toBe(true);
    expect(portalSections('bgh')).toContain('bai-viet');
    // Trang đã bỏ khỏi menu thì thư mục trang cũng đã xoá (bước 28).
    expect(existsSync(resolve(app, 'admin', 'phan-cong'))).toBe(false);
    expect(existsSync(resolve(app, 'admin', 'thoi-khoa-bieu'))).toBe(false);
  });
});
