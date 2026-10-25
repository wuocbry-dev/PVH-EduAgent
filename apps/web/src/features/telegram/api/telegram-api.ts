import type { TelegramLinkCodeDto, TelegramLinkStatusDto } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export function getTelegramLink() {
  return api<TelegramLinkStatusDto>("/telegram/link");
}

export function createTelegramLinkCode() {
  return api<TelegramLinkCodeDto>("/telegram/link-code", { method: "POST" });
}

export function unlinkTelegram() {
  return api<void>("/telegram/link", { method: "DELETE" });
}
