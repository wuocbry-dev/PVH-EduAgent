// Dữ liệu cho website công khai (F01–F07). Không chứa email/số điện thoại cá nhân.

export interface PublicPostSummaryDto {
  id: string;
  slug: string;
  title: string;
  // Tóm tắt do tác giả nhập, hoặc đoạn đầu của nội dung nếu để trống.
  excerpt: string;
  thumbnailUrl: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  publishedAt: string;
  viewCount: number;
}

export interface PublicPostDto extends PublicPostSummaryDto {
  content: string;
  authorName: string;
}

export interface PublicPostListDto {
  items: PublicPostSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdmissionStatDto {
  schoolYear: string;
  quota: number;
  benchmarkNv1: number | null;
  benchmarkNv2: number | null;
  benchmarkNv3: number | null;
  note: string | null;
}

// Chỉ các khóa trong PUBLIC_SETTING_KEYS mới được trả ra công khai.
export const PUBLIC_SETTING_KEYS = [
  'school.name',
  'school.address',
  'school.phone',
  'school.email',
  'school.map_url',
] as const;
export type PublicSettingKey = (typeof PUBLIC_SETTING_KEYS)[number];
export type PublicSettingsDto = Partial<Record<PublicSettingKey, string>>;

export interface GalleryItemDto {
  // Đường dẫn tương đối so với địa chỉ API, vd. /media/files/<tên>.png
  url: string;
  postSlug: string;
  postTitle: string;
}

// ───────────────────────────── Liên hệ (F07) ─────────────────────────────

export const CONTACT_STATUSES = ['NEW', 'READ', 'DONE'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_STATUS_NAMES: Record<ContactStatus, string> = {
  NEW: 'Mới',
  READ: 'Đã xem',
  DONE: 'Đã xử lý',
};

// POST /api/contacts (công khai)
export interface CreateContactRequest {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  subject: string;
  message: string;
  // Ô ẩn chống bot: người thật không điền.
  website?: string;
}

// GET /api/contacts (quản trị)
export interface ContactDto {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  subject: string;
  message: string;
  status: ContactStatus;
  createdAt: string;
}
