import type { MediaDto } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export function listMedia() {
  return api<MediaDto[]>("/media");
}

export function uploadMedia(file: File) {
  const body = new FormData();
  body.append("file", file);
  return api<MediaDto>("/media", { method: "POST", body });
}
