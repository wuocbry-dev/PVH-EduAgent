import type { AgentActionDto } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

// A08 – hành động nhạy cảm của agent đang chờ người dùng xác nhận.
export function listPendingActions() {
  return api<AgentActionDto[]>("/agent/actions");
}

export function confirmAction(id: string) {
  return api<AgentActionDto>(`/agent/actions/${id}/confirm`, { method: "POST" });
}

export function cancelAction(id: string) {
  return api<AgentActionDto>(`/agent/actions/${id}/cancel`, { method: "POST" });
}
