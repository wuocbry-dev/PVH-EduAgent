import { z } from 'zod';

export const createPostSchema = z.object({
  title: z.string().trim().min(5).max(255),
  summary: z.string().trim().max(500).optional(),
  content: z.string().trim().min(1),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
