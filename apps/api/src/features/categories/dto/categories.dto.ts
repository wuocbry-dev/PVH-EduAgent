import { z } from 'zod';

const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');
const name = z.string().trim().min(1, 'Chưa nhập tên chuyên mục').max(120);
const sortOrder = z.number().int().min(0).max(10_000);

export const createCategorySchema = z.object({
  name,
  parentId: id.nullish(),
  sortOrder: sortOrder.optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: name.optional(),
  parentId: id.nullish(),
  sortOrder: sortOrder.optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
