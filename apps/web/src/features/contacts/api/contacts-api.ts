import type { ContactDto, ContactStatus, CreateContactRequest } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export function sendContact(body: CreateContactRequest) {
  return api<{ message: string }>("/contacts", { method: "POST", body: JSON.stringify(body) });
}

export interface ContactList {
  items: ContactDto[];
  total: number;
  page: number;
  pageSize: number;
}

export const CONTACTS_PAGE_SIZE = 20;

export function listContacts(filters: { status: ContactStatus | ""; page: number }) {
  const params = new URLSearchParams({ page: String(filters.page), pageSize: String(CONTACTS_PAGE_SIZE) });
  if (filters.status) params.set("status", filters.status);
  return api<ContactList>(`/contacts?${params}`);
}

export function updateContactStatus(id: string, status: ContactStatus) {
  return api<ContactDto>(`/contacts/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}
