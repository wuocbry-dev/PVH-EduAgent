import type {
  CreateTaskRequest,
  SettableTaskStatus,
  TaskAssigneeDto,
  TaskDto,
  TaskStatus,
  UpdateTaskRequest,
} from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export interface TaskFilters {
  assigneeId: string;
  status: TaskStatus | "";
  // yyyy-mm-dd theo giờ địa phương
  dueFrom: string;
  dueTo: string;
}

export function listTasks(filters: TaskFilters) {
  const params = new URLSearchParams();
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.status) params.set("status", filters.status);
  if (filters.dueFrom) params.set("dueFrom", new Date(`${filters.dueFrom}T00:00:00`).toISOString());
  if (filters.dueTo) params.set("dueTo", new Date(`${filters.dueTo}T23:59:59`).toISOString());
  return api<TaskDto[]>(`/tasks?${params}`);
}

export function listAssignees() {
  return api<TaskAssigneeDto[]>("/tasks/assignees");
}

export function createTask(body: CreateTaskRequest) {
  return api<TaskDto>("/tasks", { method: "POST", body: JSON.stringify(body) });
}

export function updateTask(id: string, body: UpdateTaskRequest) {
  return api<TaskDto>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function setTaskStatus(id: string, status: SettableTaskStatus) {
  return api<TaskDto>(`/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function deleteTask(id: string) {
  return api<void>(`/tasks/${id}`, { method: "DELETE" });
}
