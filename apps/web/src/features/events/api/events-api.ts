import type { EventDto, SaveEventRequest } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

// Sự kiện giao với khoảng [from, to] (ISO).
export function listEvents(from: string, to: string) {
  return api<EventDto[]>(`/events?${new URLSearchParams({ from, to })}`);
}

export function createEvent(body: SaveEventRequest) {
  return api<EventDto>("/events", { method: "POST", body: JSON.stringify(body) });
}

export function updateEvent(id: string, body: Partial<SaveEventRequest>) {
  return api<EventDto>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteEvent(id: string) {
  return api<void>(`/events/${id}`, { method: "DELETE" });
}
