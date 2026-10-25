import type { AuditFiltersDto, AuditLogPageDto } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export interface AuditFilters {
  userId: string;
  channel: string;
  action: string;
  // giá trị <input type="datetime-local">
  from: string;
  to: string;
}

export const AUDIT_PAGE_SIZE = 30;

export function listAuditLogs(filters: AuditFilters, cursor?: string) {
  const params = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE) });
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.action.trim()) params.set("action", filters.action.trim());
  if (filters.from) params.set("from", new Date(filters.from).toISOString());
  if (filters.to) params.set("to", new Date(filters.to).toISOString());
  if (cursor) params.set("cursor", cursor);
  return api<AuditLogPageDto>(`/audit-logs?${params}`);
}

export function getAuditFilters() {
  return api<AuditFiltersDto>("/audit-logs/filters");
}
