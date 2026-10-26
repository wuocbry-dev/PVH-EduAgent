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

    it('đường dẫn ngoài các cổng không bị đụng tới; không có vai trò nào thì về trang chủ', () => {
      expect(go(['TEACHER'], '/tin-tuc')).toBeNull();
      expect(go([], '/bgh')).toBe('/');
    });
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
  });
});
