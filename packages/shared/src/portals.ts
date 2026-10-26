import type { Permission, Role } from './roles.js';

// Các cổng giao diện theo vai trò (bước 15). Web (proxy, menu, chuyển hướng sau đăng nhập) và API (dựng liên kết
// tới trang quản trị trong Telegram) dùng chung bảng này. Thứ tự trong PORTALS cũng là thứ tự ưu tiên khi chọn cổng chính.
export const PORTALS = ['admin', 'bgh', 'bien-tap', 'giao-vien', 'hoc-sinh'] as const;
export type Portal = (typeof PORTALS)[number];

export interface PortalNavItem {
  // Phần đường dẫn sau cổng ('' là trang tổng quan). Mỗi mục ứng với một thư mục trang trong apps/web/src/app/<cổng>/.
  slug: string;
  label: string;
  // Hiện mục khi người dùng có ít nhất một quyền trong danh sách; bỏ trống = hiện cho mọi người trong cổng.
  permissions?: readonly Permission[];
}

export interface PortalInfo {
  path: string; // '/admin'
  name: string; // tên tiếng Việt
  roles: readonly Role[]; // vai trò được vào
  nav: readonly PortalNavItem[];
}

const ACCOUNT: PortalNavItem[] = [{ slug: 'tai-khoan', label: 'Tài khoản' }];

export const PORTAL_INFO: Record<Portal, PortalInfo> = {
  admin: {
    path: '/admin',
    name: 'Quản trị hệ thống',
    roles: ['ADMIN'],
    nav: [
      { slug: '', label: 'Tổng quan' },
      { slug: 'nguoi-dung', label: 'Người dùng', permissions: ['user:manage'] },
      { slug: 'nhap-danh-sach', label: 'Nhập danh sách', permissions: ['student:import'] },
      { slug: 'vai-tro', label: 'Vai trò và quyền', permissions: ['user:manage'] },
      { slug: 'cau-hinh', label: 'Cấu hình', permissions: ['system:read'] },
      { slug: 'nhat-ky', label: 'Nhật ký hoạt động', permissions: ['system:read'] },
    ],
  },
  bgh: {
    path: '/bgh',
    name: 'Ban giám hiệu',
    roles: ['PRINCIPAL'],
    nav: [
      { slug: '', label: 'Tổng quan' },
      { slug: 'hoc-vu', label: 'Học vụ', permissions: ['academic:manage'] },
      { slug: 'bai-viet', label: 'Bài viết và duyệt bài', permissions: ['post:create'] },
      { slug: 'cong-viec', label: 'Giao việc', permissions: ['task:read:own', 'task:read:all'] },
      { slug: 'lich', label: 'Lịch sự kiện' },
      { slug: 'tro-ly-ai', label: 'Trợ lý AI' },
    ],
  },
  'bien-tap': {
    path: '/bien-tap',
    name: 'Biên tập viên',
    roles: ['EDITOR'],
    nav: [
      { slug: '', label: 'Tổng quan' },
      { slug: 'bai-viet', label: 'Bài viết', permissions: ['post:create'] },
      { slug: 'chuyen-muc', label: 'Chuyên mục', permissions: ['post:approve'] },
      { slug: 'lien-he', label: 'Liên hệ', permissions: ['post:approve'] },
      { slug: 'lich', label: 'Lịch sự kiện' },
      { slug: 'tro-ly-ai', label: 'Trợ lý AI' },
    ],
  },
  'giao-vien': {
    path: '/giao-vien',
    name: 'Giáo viên',
    roles: ['TEACHER'],
    nav: [
      { slug: '', label: 'Tổng quan' },
      { slug: 'bai-viet', label: 'Bài viết của tôi', permissions: ['post:create'] },
      { slug: 'cong-viec', label: 'Việc của tôi', permissions: ['task:read:own', 'task:read:all'] },
      { slug: 'tro-ly-ai', label: 'Trợ lý AI' },
    ],
  },
  'hoc-sinh': {
    path: '/hoc-sinh',
    name: 'Học sinh',
    roles: ['STUDENT'],
    nav: [{ slug: '', label: 'Trang của em' }],
  },
};

// Trang tài khoản và đổi mật khẩu có ở mọi cổng (không cần khai báo trong nav của từng cổng).
export const PORTAL_COMMON_SLUGS = ['tai-khoan', 'doi-mat-khau'] as const;
export const PORTAL_ACCOUNT_NAV: readonly PortalNavItem[] = ACCOUNT;

export const isPortal = (value: string): value is Portal => (PORTALS as readonly string[]).includes(value);

// Cổng mà các vai trò này được vào, theo thứ tự ưu tiên (ADMIN → PRINCIPAL → EDITOR → TEACHER → STUDENT).
export function portalsFor(roles: readonly Role[]): Portal[] {
  return PORTALS.filter((p) => PORTAL_INFO[p].roles.some((r) => roles.includes(r)));
}

export const primaryPortal = (roles: readonly Role[]): Portal | null => portalsFor(roles)[0] ?? null;

export const canEnterPortal = (roles: readonly Role[], portal: Portal): boolean => portalsFor(roles).includes(portal);

// Cổng chứa đường dẫn: '/bgh/bai-viet/3' → 'bgh'; không thuộc cổng nào → null.
export function portalOfPath(pathname: string): Portal | null {
  const first = pathname.split('/')[1] ?? '';
  return isPortal(first) ? first : null;
}

// Các mục (slug đầu tiên sau cổng) mà cổng có: từ menu và các trang chung. Dùng để chuyển hướng đường dẫn cũ.
export function portalSections(portal: Portal): string[] {
  return [...PORTAL_INFO[portal].nav.map((n) => n.slug), ...PORTAL_COMMON_SLUGS].filter(Boolean);
}

// Slug đầu tiên sau cổng: '/bgh/bai-viet/3' → 'bai-viet'; '/bgh' → ''.
export const sectionOfPath = (pathname: string): string => pathname.split('/')[2] ?? '';

// Đường dẫn cổng mà người có các vai trò này nên dùng thay cho `pathname` (thuộc cổng khác hoặc đường dẫn cũ trong /admin).
// Cổng của đường dẫn cho phép thì trả null (không cần chuyển). Không có cổng nào của người đó chứa mục này thì về trang chủ cổng chính.
export function portalRedirect(roles: readonly Role[], pathname: string): string | null {
  const portal = portalOfPath(pathname);
  if (!portal) return null;
  const mine = portalsFor(roles);
  const primary = mine[0];
  if (!primary) return '/';
  const section = sectionOfPath(pathname);
  const rest = pathname.split('/').slice(2).join('/');
  const inPortal = mine.includes(portal);

  if (inPortal && (section === '' || portalSections(portal).includes(section))) return null;

  // Đường dẫn cũ hoặc sai cổng: tìm cổng của người này có mục đó.
  const target = section ? mine.find((p) => portalSections(p).includes(section)) : undefined;
  if (target) return `${PORTAL_INFO[target].path}/${rest}`;
  // Mục có ở một cổng nào đó nhưng không phải cổng của người này (vd. liên kết cũ tới trang quản trị): về trang chủ cổng chính.
  // Mục không tồn tại ở đâu cả, trong cổng của mình: để trang 404 riêng của cổng xử lý.
  const knownAnywhere = PORTALS.some((p) => portalSections(p).includes(section));
  if (inPortal && !knownAnywhere) return null;
  return PORTAL_INFO[primary].path;
}
