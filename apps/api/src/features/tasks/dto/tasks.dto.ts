import {
  SETTABLE_TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@pvh/shared';
import { z } from 'zod';

const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');
// ISO 8601 có múi giờ (vd. 2026-11-02T17:00:00+07:00 hoặc ...Z).
const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const title = z.string().trim().min(1, 'Chưa nhập tên công việc').max(255);
const description = z.string().trim().max(5000).nullish();

export const createTaskSchema = z.object({
  title,
  description,
  assigneeId: id,
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  dueAt: isoDate,
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: title.optional(),
  description,
  assigneeId: id.optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueAt: isoDate.optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const setTaskStatusSchema = z.object({
  status: z.enum(SETTABLE_TASK_STATUSES),
});
export type SetTaskStatusInput = z.infer<typeof setTaskStatusSchema>;

export const listTasksQuerySchema = z.object({
  assigneeId: id.optional(),
  // OVERDUE = chưa DONE và đã quá hạn (tính theo due_at), không phụ thuộc cột status.
  status: z.enum(TASK_STATUSES).optional(),
  dueFrom: z.iso.datetime({ offset: true }).optional(),
  dueTo: z.iso.datetime({ offset: true }).optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
