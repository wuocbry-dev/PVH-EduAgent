import type { SettingDto, UpdateSettingsRequest } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export function getSettings() {
  return api<SettingDto[]>("/settings");
}

export function updateSettings(body: UpdateSettingsRequest) {
  return api<SettingDto[]>("/settings", { method: "PATCH", body: JSON.stringify(body) });
}
