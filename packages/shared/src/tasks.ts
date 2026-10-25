// Khớp enum TaskStatus / TaskPriority trong ERD / prisma/schema.prisma.
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'OVERDUE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Trạng thái người dùng được tự đặt. OVERDUE do hệ thống (scheduler, bước 7) đặt; trên giao diện
// việc quá hạn luôn được tính theo due_at.
export const SETTABLE_TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type SettableTaskStatus = (typeof SETTABLE_TASK_STATUSES)[number];

export const TASK_STATUS_NAMES: Record<TaskStatus, string> = {
  TODO: 'Chưa làm',
  IN_PROGRESS: 'Đang làm',
  DONE: 'Hoàn thành',
  OVERDUE: 'Quá hạn',
};

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_NAMES: Record<TaskPriority, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
};

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string;
  assigneeName: string;
  createdById: string;
  createdByName: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string;
  completedAt: string | null;
  // Chưa DONE mà đã quá due_at (tính khi truy vấn).
  overdue: boolean;
}

// POST /api/tasks (cần task:assign)
export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  assigneeId: string;
  priority?: TaskPriority;
  dueAt: string;
}

// PATCH /api/tasks/:id (cần task:assign)
export type UpdateTaskRequest = Partial<CreateTaskRequest>;

// GET /api/tasks/assignees: nhân sự có thể được giao việc
export interface TaskAssigneeDto {
  id: string;
  fullName: string;
}

// ───────────────────────────── Lịch sự kiện (F15) ─────────────────────────────

export interface EventDto {
  id: string;
  title: string;
  location: string | null;
  startAt: string;
  endAt: string;
}

// POST /api/events, PATCH /api/events/:id
export interface SaveEventRequest {
  title: string;
  location?: string | null;
  startAt: string;
  endAt: string;
}
