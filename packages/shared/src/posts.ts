// Khớp enum PostStatus trong ERD / prisma/schema.prisma.
export const POST_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'REJECTED',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_STATUS_NAMES: Record<PostStatus, string> = {
  DRAFT: 'Nháp',
  PENDING_REVIEW: 'Chờ duyệt',
  REJECTED: 'Bị từ chối',
  SCHEDULED: 'Đã lên lịch',
  PUBLISHED: 'Đã đăng',
  ARCHIVED: 'Đã gỡ / lưu trữ',
};

// Các thao tác trong vòng đời bài viết (sơ đồ trạng thái, hình 21).
export const POST_ACTIONS = [
  'edit',
  'submit',
  'approve',
  'reject',
  'reschedule',
  'publish',
  'cancel_schedule',
  'unpublish',
  'restore',
  'delete',
] as const;
export type PostAction = (typeof POST_ACTIONS)[number];

export interface PostDto {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  status: PostStatus;
  authorId: string;
  authorName: string;
  reviewerId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  thumbnailUrl: string | null;
  rejectReason: string | null;
  publishAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  // Thao tác người đang xem được phép làm với bài này (server tính theo quyền + trạng thái).
  actions: PostAction[];
}

// POST /api/posts
export interface CreatePostRequest {
  title: string;
  summary?: string | null;
  content: string;
  categoryId?: string | null;
  thumbnailUrl?: string | null;
}

// PATCH /api/posts/:id
export type UpdatePostRequest = Partial<CreatePostRequest>;

// ───────────────────────────── Chuyên mục (F13) ─────────────────────────────

export interface CategoryDto {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface SaveCategoryRequest {
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}

// ───────────────────────────── Media (F13) ─────────────────────────────

export type MediaKind = 'IMAGE' | 'VIDEO';

export interface MediaDto {
  id: string;
  // URL công khai: đầy đủ (https://…) với driver r2; đường dẫn tương đối so với địa chỉ API (/media/files/<tên>)
  // với driver local.
  url: string;
  kind: MediaKind;
  mimeType: string;
  size: number;
  uploadedBy: string;
}

// Yêu cầu xin URL tải lên (POST /media/presign).
export interface MediaPresignRequest {
  filename: string;
  mimeType: string;
  size: number;
}

// Trình duyệt PUT thẳng file tới uploadUrl kèm đúng `headers`, rồi gọi POST /media/:id/complete.
export interface MediaPresignDto {
  id: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export const MEDIA_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const MEDIA_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MEDIA_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const;
export const MEDIA_MIME_TYPES = [...MEDIA_IMAGE_MIME_TYPES, ...MEDIA_VIDEO_MIME_TYPES] as const;

export function mediaKindOf(mimeType: string): MediaKind | null {
  if ((MEDIA_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return 'IMAGE';
  if ((MEDIA_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) return 'VIDEO';
  return null;
}

export function mediaMaxBytes(kind: MediaKind): number {
  return kind === 'IMAGE' ? MEDIA_IMAGE_MAX_BYTES : MEDIA_VIDEO_MAX_BYTES;
}
