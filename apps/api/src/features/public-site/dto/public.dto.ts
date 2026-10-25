import { z } from 'zod';

export const listPublicPostsQuerySchema = z.object({
  // Slug chuyên mục; lấy cả bài của các chuyên mục con.
  category: z
    .string()
    .regex(/^[a-z0-9-]{1,120}$/)
    .optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type ListPublicPostsQuery = z.infer<typeof listPublicPostsQuerySchema>;
