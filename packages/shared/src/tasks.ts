// Khớp enum TaskStatus / TaskPriority trong ERD / prisma/schema.prisma.
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'OVERDUE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskDto {
  id: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string;
}
