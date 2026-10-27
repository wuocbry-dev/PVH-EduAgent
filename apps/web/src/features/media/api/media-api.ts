import {
  mediaKindOf,
  mediaMaxBytes,
  type MediaDto,
  type MediaKind,
  type MediaPresignDto,
} from "@pvh/shared";
import { putUpload } from "@/shared/lib/put-upload";
import { api } from "@/shared/lib/api-client";

export function listMedia(kind?: MediaKind) {
  return api<MediaDto[]>(kind ? `/media?kind=${kind}` : "/media");
}

export function deleteMedia(id: string) {
  return api<void>(`/media/${id}`, { method: "DELETE" });
}

// Báo lỗi tiếng Việt trước khi gọi API (cùng giới hạn với server, lấy từ @pvh/shared).
export function validateMediaFile(file: File): string | null {
  const kind = mediaKindOf(file.type);
  if (!kind) return "Chỉ chấp nhận ảnh JPEG, PNG, WebP, GIF hoặc video MP4, WebM";
  const max = mediaMaxBytes(kind);
  if (file.size > max) return `${kind === "IMAGE" ? "Ảnh" : "Video"} vượt quá ${max / 1024 / 1024} MB`;
  if (file.size === 0) return "File rỗng";
  return null;
}

// Tải lên theo 3 bước: xin URL ký sẵn → trình duyệt PUT thẳng lên kho lưu trữ (R2) → báo server kiểm tra.
// `onProgress` nhận 0–100 trong lúc PUT.
export async function uploadMedia(file: File, onProgress?: (percent: number) => void): Promise<MediaDto> {
  const invalid = validateMediaFile(file);
  if (invalid) throw new Error(invalid);

  const presign = await api<MediaPresignDto>("/media/presign", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size }),
  });
  await putUpload(file, presign, onProgress);
  return api<MediaDto>(`/media/${presign.id}/complete`, { method: "POST" });
}
