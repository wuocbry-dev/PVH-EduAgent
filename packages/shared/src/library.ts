// Thư viện số (bước 21): tài liệu PDF, sách nói (MP3), video bài giảng lưu trong kho riêng tư.

export const LIBRARY_KINDS = ['PDF', 'AUDIO', 'VIDEO'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];
export const LIBRARY_KIND_NAMES: Record<LibraryKind, string> = { PDF: 'Sách, tài liệu (PDF)', AUDIO: 'Sách nói', VIDEO: 'Video' };

// Loại file được nhận cho từng loại tài liệu (nhận dạng lại bằng magic bytes ở server) và dung lượng tối đa.
export const LIBRARY_MIME_TYPES: Record<LibraryKind, readonly string[]> = {
  PDF: ['application/pdf'],
  AUDIO: ['audio/mpeg'],
  VIDEO: ['video/mp4', 'video/webm'],
};
export const LIBRARY_MAX_BYTES: Record<LibraryKind, number> = {
  PDF: 50 * 1024 * 1024,
  AUDIO: 100 * 1024 * 1024,
  VIDEO: 100 * 1024 * 1024, // bằng giới hạn video của bước 11 (MEDIA_VIDEO_MAX_BYTES)
};
export const libraryKindOfMime = (mime: string): LibraryKind | null =>
  LIBRARY_KINDS.find((k) => LIBRARY_MIME_TYPES[k].includes(mime)) ?? null;

// URL đọc file trong kho riêng tư hết hạn sau ngần này giây; trình phát xin URL mới khi hết hạn.
export const LIBRARY_READ_URL_TTL_SEC = 5 * 60;
// Số lần xin URL đọc mỗi người trong một phút, và số tài liệu được tạo mỗi giờ.
export const LIBRARY_ACCESS_PER_MINUTE = 30;
export const LIBRARY_SUBMIT_PER_HOUR = 20;

export const LIBRARY_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED'] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];
export const LIBRARY_STATUS_NAMES: Record<LibraryStatus, string> = {
  DRAFT: 'Nháp',
  PENDING_REVIEW: 'Chờ duyệt',
  PUBLISHED: 'Đã đăng',
  REJECTED: 'Bị từ chối',
  ARCHIVED: 'Đã ẩn',
};

// Ai được xem: toàn trường (kể cả khách xem danh mục), một số khối, một số lớp, chỉ giáo viên và nhân sự.
export const LIBRARY_AUDIENCES = ['ALL', 'GRADE', 'CLASS', 'TEACHERS_ONLY'] as const;
export type LibraryAudience = (typeof LIBRARY_AUDIENCES)[number];
export const LIBRARY_AUDIENCE_NAMES: Record<LibraryAudience, string> = {
  ALL: 'Toàn trường',
  GRADE: 'Theo khối',
  CLASS: 'Theo lớp',
  TEACHERS_ONLY: 'Chỉ giáo viên, nhân sự',
};

// Nguồn và giấy phép là bắt buộc: thư viện chỉ nhận tài liệu được phép chia sẻ.
export const LIBRARY_SOURCES = ['SELF_AUTHORED', 'TEACHER_CONTRIBUTED', 'PUBLIC_RELEASE', 'LICENSED'] as const;
export type LibrarySource = (typeof LIBRARY_SOURCES)[number];
export const LIBRARY_SOURCE_NAMES: Record<LibrarySource, string> = {
  SELF_AUTHORED: 'Nhà trường tự biên soạn',
  TEACHER_CONTRIBUTED: 'Giáo viên đóng góp',
  PUBLIC_RELEASE: 'Phát hành công khai (miễn phí)',
  LICENSED: 'Được cấp phép sử dụng',
};

export const LIBRARY_TITLE_MAX = 200;
export const LIBRARY_DESCRIPTION_MAX = 5000;
export const LIBRARY_LICENSE_MIN = 5;

export interface LibraryCategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  itemCount: number; // số tài liệu đã đăng (theo phạm vi người xem)
}

// Thẻ tài liệu: đủ để hiện trong danh mục, không bao giờ có URL kho riêng tư.
export interface LibraryCardDto {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
  kind: LibraryKind;
  categoryName: string;
  subjectName: string | null;
  gradeLevel: number | null;
  audienceLabel: string;
  viewCount: number;
  publishedAt: string | null;
}

export interface LibraryItemDto extends LibraryCardDto {
  categoryId: string;
  categorySlug: string;
  subjectId: string | null;
  publisher: string | null;
  publishYear: number | null;
  source: LibrarySource;
  license: string;
  allowDownload: boolean;
  audience: LibraryAudience;
  gradeLevels: number[];
  classIds: string[];
  classNames: string[];
  status: LibraryStatus;
  hasFile: boolean;
  fileMime: string | null;
  fileSize: number | null;
  rejectReason: string | null;
  submittedById: string;
  submittedByName: string;
  reviewedByName: string | null;
  createdAt: string;
  updatedAt: string;
  // Chỉ có khi người xem đã đăng nhập.
  favorite?: boolean;
  position?: number | null; // trang PDF hoặc giây đang nghe/xem
}

export interface LibraryListDto {
  items: LibraryCardDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LibraryHomeDto {
  categories: LibraryCategoryDto[];
  newest: LibraryCardDto[];
  mostRead: LibraryCardDto[];
}

// URL đọc/tải hết hạn ngắn (LIBRARY_READ_URL_TTL_SEC). Không ghi vào log hay audit.
export interface LibraryAccessDto {
  url: string;
  expiresAt: string;
  mimeType: string;
  kind: LibraryKind;
  position: number | null;
}

export interface LibraryUploadDto {
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface LibraryShelfItemDto extends LibraryCardDto {
  position: number | null;
  lastReadAt: string | null;
  favorite: boolean;
}

export interface LibraryMineDto {
  favorites: LibraryShelfItemDto[];
  history: LibraryShelfItemDto[];
}

export interface LibraryFormOptionsDto {
  categories: { id: string; name: string; parentId: string | null }[];
  subjects: { id: string; name: string }[];
  grades: number[];
  classes: { id: string; name: string; gradeLevel: number }[];
  canManage: boolean;
}

export interface LibraryStatsDto {
  views: { today: number; yesterday: number; thisMonth: number; lastMonth: number; total: number };
  items: { published: number; pending: number; total: number };
  top: { id: string; slug: string; title: string; views: number }[];
}

// Chuỗi tìm kiếm chuẩn hoá: chữ thường, bỏ dấu tiếng Việt (đ → d), gộp khoảng trắng. Dùng cả khi lưu và khi tìm.
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function libraryAudienceLabel(audience: LibraryAudience, gradeLevels: number[], classNames: string[]): string {
  if (audience === 'GRADE') return `Khối ${gradeLevels.join(', ')}`;
  if (audience === 'CLASS') return `Lớp ${classNames.join(', ')}`;
  return LIBRARY_AUDIENCE_NAMES[audience];
}
