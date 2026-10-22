import type { TaskDto } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export type DeadlineItem = TaskDto & { overdue: boolean };

export function getDeadlines(devUserEmail: string, withinHours = 48) {
  return api<DeadlineItem[]>(`/tasks/deadlines?withinHours=${withinHours}`, { devUserEmail });
}
