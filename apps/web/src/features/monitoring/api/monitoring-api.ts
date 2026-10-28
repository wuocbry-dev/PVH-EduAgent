import type {
  AgentStatsDto,
  AgentSwitchKey,
  BlockedEntryDto,
  BulkUserActionInput,
  BulkUserActionResultDto,
  FailedJobDto,
  HealthSnapshotDto,
  MonitoringOverviewDto,
  SecurityOverviewDto,
  SystemAlertDto,
  SystemErrorDto,
  UserListDto,
  UserSessionDto,
} from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

const post = (body?: unknown): RequestInit => ({ method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

// ── Trung tâm giám sát (bước 26) ──
export const getOverview = () => api<MonitoringOverviewDto>("/monitoring/overview");
export const checkNow = () => api<HealthSnapshotDto[]>("/monitoring/check-now", post());
export const listAlerts = (open: boolean) => api<SystemAlertDto[]>(`/monitoring/alerts?open=${open}`);
export const resolveAlert = (id: string) => api<SystemAlertDto>(`/monitoring/alerts/${id}/resolve`, post());
export const listErrors = (resolved: boolean) => api<SystemErrorDto[]>(`/monitoring/errors?resolved=${resolved}`);
export const resolveError = (id: string) => api<SystemErrorDto>(`/monitoring/errors/${id}/resolve`, post());
export const listFailedJobs = () => api<FailedJobDto[]>("/monitoring/jobs/failed");
export const retryJob = (queue: string, id: string) =>
  api<void>(`/monitoring/jobs/${encodeURIComponent(queue)}/${encodeURIComponent(id)}/retry`, post());
export const getSecurity = () => api<SecurityOverviewDto>("/monitoring/security");
export const unblock = (entry: BlockedEntryDto) =>
  api<void>(`/monitoring/blocked/${entry.limit}/${encodeURIComponent(entry.id)}`, { method: "DELETE" });

// ── Phiên đăng nhập (quyền user:manage) ──
export const searchUsers = (search: string) =>
  api<UserListDto>(`/users?q=${encodeURIComponent(search)}&page=1&pageSize=20`);
export const listSessions = (userId: string) => api<UserSessionDto[]>(`/users/${userId}/sessions`);
export const revokeSession = (userId: string, sessionId: string) => api<void>(`/users/${userId}/sessions/${sessionId}`, { method: "DELETE" });
export const logoutAll = (userId: string) => api<{ revoked: number }>(`/users/${userId}/logout-all`, post());
export const bulkUserAction = (input: BulkUserActionInput) => api<BulkUserActionResultDto>("/users/bulk-action", post(input));

// ── Giám sát AI Agent (bước 27) ──
export const getAgentStats = (days: number) => api<AgentStatsDto>(`/monitoring/agent?days=${days}`);
// Công tắc khẩn cấp: đổi qua API cấu hình chung (cần setting:manage, có ghi nhật ký và báo ADMIN).
export const setAgentSwitch = (key: AgentSwitchKey, on: boolean) =>
  api<unknown>("/settings", { method: "PATCH", body: JSON.stringify({ [key]: on ? "true" : "false" }) });
