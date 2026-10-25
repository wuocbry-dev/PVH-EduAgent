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

export interface MediaDto {
  id: string;
  // Đường dẫn tương đối so với địa chỉ API, vd. /media/files/<tên>.png
  url: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
}

export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
