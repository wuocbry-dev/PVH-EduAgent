import type { AnnouncementDto, AudienceTargetsDto, CreateAnnouncementRequest, InboxDto } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const getInbox = () => api<InboxDto>("/announcements/inbox");

export const markRead = (body: { announcementIds?: string[]; notificationIds?: string[]; all?: boolean }) =>
  api<{ unread: number }>("/announcements/inbox/read", json("POST", body));

export const getAnnouncementTargets = () => api<AudienceTargetsDto>("/announcements/targets");

export const listSentAnnouncements = () => api<AnnouncementDto[]>("/announcements/sent");

export const createAnnouncement = (body: CreateAnnouncementRequest) => api<AnnouncementDto>("/announcements", json("POST", body));

export const deleteAnnouncement = (id: string) => api<void>(`/announcements/${id}`, json("DELETE"));
