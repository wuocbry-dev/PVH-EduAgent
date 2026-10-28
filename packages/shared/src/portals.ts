import type { Permission, Role } from './roles.js';

// Các cổng giao diện theo vai trò (bước 15). Web (proxy, menu, chuyển hướng sau đăng nhập) và API (dựng liên kết
// tới trang quản trị trong Telegram) dùng chung bảng này. Thứ tự trong PORTALS cũng là thứ tự ưu tiên khi chọn cổng chính.
export const PORTALS = ['admin', 'bgh', 'bien-tap', 'thu-thu', 'giao-vien', 'hoc-sinh'] as const;
export type Portal = (typeof PORTALS)[number];

export interface PortalNavItem {
  // Phần đường dẫn sau cổng ('' là trang tổng quan). Mỗi mục ứng với một thư mục trang trong apps/web/src/app/<cổng>/.
  slug: string;
  label: string;
  // Hiện mục khi người dùng có ít nhất một quyền trong danh sách; bỏ trống = hiện cho mọi người trong cổng.
  permissions?: readonly Permission[];
  // Tiêu đề nhóm: menu hiện tiêu đề nhỏ mỗi khi nhóm đổi so với mục trước. Cổng không khai nhóm thì menu phẳng như cũ.
  group?: string;
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
      // Bước 28: chỉ việc hệ thống và dữ liệu học vụ gốc (phân công, thời khoá biểu là của BGH). Slug giam-sat, giam-sat-ai
      // giữ nguyên vì tin Telegram và cảnh báo cũ dẫn tới đó.
      { slug: '', label: 'Tổng quan hệ thống' },
      { slug: 'nguoi-dung', label: 'Người dùng', permissions: ['user:manage'], group: 'Tài khoản' },
      { slug: 'nhap-danh-sach', label: 'Nhập danh sách', permissions: ['student:import'], group: 'Tài khoản' },
      { slug: 'vai-tro', label: 'Vai trò và quyền', permissions: ['user:manage'], group: 'Tài khoản' },
      { slug: 'giam-sat', label: 'Bảo mật và đăng nhập', permissions: ['system:read'], group: 'Tài khoản' },
      { slug: 'hoc-vu', label: 'Học vụ', permissions: ['academic:manage'], group: 'Dữ liệu trường' },
      { slug: 'cau-hinh', label: 'Cấu hình', permissions: ['system:read'], group: 'Hệ thống' },
      { slug: 'giam-sat-ai', label: 'Trợ lý AI', permissions: ['system:read'], group: 'Hệ thống' },
      { slug: 'nhat-ky', label: 'Nhật ký hoạt động', permissions: ['system:read'], group: 'Hệ thống' },
      // Cùng trang giám sát với 'giam-sat' nhưng chỉ các thẻ cảnh báo, lỗi máy chủ, hàng đợi job.
      { slug: 'loi-he-thong', label: 'Lỗi và hàng đợi', permissions: ['system:read'], group: 'Hệ thống' },
    ],
  },
  bgh: {
    path: '/bgh',
    name: 'Ban giám hiệu',
    roles: ['PRINCIPAL'],
    nav: [
      { slug: '', label: 'Tổng quan' },
      { slug: 'hoc-vu', label: 'Học vụ', permissions: ['academic:manage'] },
      { slug: 'phan-cong', label: 'Phân công giảng dạy', permissions: ['teaching:read'] },
      { slug: 'thoi-khoa-bieu', label: 'Thời khoá biểu', permissions: ['timetable:read'] },
      { slug: 'diem', label: 'Đợt thi và điểm', permissions: ['score:read:all', 'assessment:manage'] },
      { slug: 'thong-ke-diem', label: 'Xem và thống kê điểm', permissions: ['score:read:all'] },
      { slug: 'khoa-so-diem', label: 'Hạn nhập và khoá sổ', permissions: ['assessment:manage'] },
      { slug: 'dieu-chinh-diem', label: 'Duyệt điều chỉnh điểm', permissions: ['assessment:manage'] },
      { slug: 'thong-bao', label: 'Thông báo' },
      { slug: 'bai-viet', label: 'Bài viết và duyệt bài', permissions: ['post:create'] },
      { slug: 'thu-vien-so', label: 'Thư viện số', permissions: ['library:manage'] },
      { slug: 'trac-nghiem', label: 'Trắc nghiệm ôn tập', permissions: ['quiz:manage'] },
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
  'thu-thu': {
    path: '/thu-thu',
    name: 'Thủ thư',
    roles: ['LIBRARIAN'],
    nav: [
      { slug: '', label: 'Tổng quan' },
      { slug: 'duyet-tai-lieu', label: 'Hàng chờ duyệt', permissions: ['library:manage'] },
      { slug: 'kho-tai-lieu', label: 'Kho tài liệu', permissions: ['library:manage'] },
      { slug: 'danh-muc-thu-vien', label: 'Danh mục', permissions: ['library:manage'] },
      { slug: 'tai-lieu-cua-toi', label: 'Tài liệu tôi gửi', permissions: ['library:submit'] },
      { slug: 'trac-nghiem', label: 'Trắc nghiệm ôn tập', permissions: ['quiz:manage'] },
    ],
  },
  'giao-vien': {
    path: '/giao-vien',
    name: 'Giáo viên',
    roles: ['TEACHER'],
    nav: [
      { slug: '', label: 'Tổng quan' },
      { slug: 'lop-toi-day', label: 'Lớp tôi dạy' },
      { slug: 'thoi-khoa-bieu', label: 'Thời khoá biểu' },
      { slug: 'nhap-diem', label: 'Nhập điểm', permissions: ['score:enter'] },
      { slug: 'so-diem', label: 'Sổ điểm và lớp chủ nhiệm', permissions: ['score:enter'] },
      { slug: 'lop-chu-nhiem', label: 'Lớp chủ nhiệm' },
      { slug: 'thong-bao', label: 'Thông báo' },
      { slug: 'bai-viet', label: 'Bài viết của tôi', permissions: ['post:create'] },
      { slug: 'cong-viec', label: 'Việc của tôi', permissions: ['task:read:own', 'task:read:all'] },
      { slug: 'tai-lieu-cua-toi', label: 'Tài liệu tôi gửi', permissions: ['library:submit'] },
      { slug: 'trac-nghiem', label: 'Trắc nghiệm ôn tập', permissions: ['quiz:create', 'quiz:manage'] },
      { slug: 'tu-sach', label: 'Tủ sách của tôi' },
      { slug: 'tro-ly-ai', label: 'Trợ lý AI' },
    ],
  },
  'hoc-sinh': {
    path: '/hoc-sinh',
    name: 'Học sinh',
    roles: ['STUDENT'],
    nav: [
      { slug: '', label: 'Trang của em' },
      { slug: 'thoi-khoa-bieu', label: 'Thời khoá biểu' },
      { slug: 'diem', label: 'Điểm của em' },
      { slug: 'thong-bao', label: 'Thông báo' },
      { slug: 'lich', label: 'Lịch' },
      { slug: 'tu-sach', label: 'Tủ sách của em' },
      { slug: 'trac-nghiem', label: 'Trắc nghiệm ôn tập' },
      { slug: 'ho-so', label: 'Hồ sơ' },
    ],
  },
};

// Trang tài khoản và đổi mật khẩu có ở mọi cổng (không cần khai báo trong nav của từng cổng).
export const PORTAL_COMMON_SLUGS = ['tai-khoan', 'doi-mat-khau'] as const;
export const PORTAL_ACCOUNT_NAV: readonly PortalNavItem[] = ACCOUNT;

export const isPortal = (value: string): value is Portal => (PORTALS as readonly string[]).includes(value);

// Cổng mà các vai trò này được vào, theo thứ tự ưu tiên (ADMIN → PRINCIPAL → EDITOR → LIBRARIAN → TEACHER → STUDENT).
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
