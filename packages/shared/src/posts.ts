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

export interface PostDto {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  status: PostStatus;
  authorId: string;
  publishAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}
