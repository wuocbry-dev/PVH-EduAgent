import type { TaskDto } from "@pvh/shared";
import { serverApi } from "@/shared/lib/server-api";

export type DeadlineItem = TaskDto & { overdue: boolean };

export function getDeadlines(withinHours = 48) {
  return serverApi<DeadlineItem[]>(`/tasks/deadlines?withinHours=${withinHours}`);
}
