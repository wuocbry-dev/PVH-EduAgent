import type { AudienceTargetsDto, EventDto, SaveEventRequest } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

// Sự kiện giao với khoảng [from, to] (ISO) mà người đang đăng nhập được xem: toàn trường + đúng đối tượng (bước 20).
export function listEvents(from: string, to: string) {
  return api<EventDto[]>(`/events/mine?${new URLSearchParams({ from, to })}`);
}

// Lớp/khối đặt được cho sự kiện (người có post:approve).
export const getEventTargets = () => api<AudienceTargetsDto>("/events/targets");

export function createEvent(body: SaveEventRequest) {
  return api<EventDto>("/events", { method: "POST", body: JSON.stringify(body) });
}

export function updateEvent(id: string, body: Partial<SaveEventRequest>) {
  return api<EventDto>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteEvent(id: string) {
  return api<void>(`/events/${id}`, { method: "DELETE" });
}
