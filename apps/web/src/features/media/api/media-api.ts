import {
  mediaKindOf,
  mediaMaxBytes,
  type MediaDto,
  type MediaKind,
  type MediaPresignDto,
} from "@pvh/shared";
import { env } from "@/shared/config/env";
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
  await putFile(file, presign, onProgress);
  return api<MediaDto>(`/media/${presign.id}/complete`, { method: "POST" });
}

// Driver local trả đường dẫn tương đối so với API; driver R2 trả URL đầy đủ của Cloudflare.
function putFile(file: File, presign: MediaPresignDto, onProgress?: (percent: number) => void): Promise<void> {
  const url = /^https?:\/\//i.test(presign.uploadUrl) ? presign.uploadUrl : `${env.apiUrl}${presign.uploadUrl}`;
  return new Promise((resolve, reject) => {
    // XMLHttpRequest vì fetch chưa báo được tiến độ tải lên.
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(presign.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Tải file lên kho lưu trữ thất bại (mã ${xhr.status})`));
    xhr.onerror = () => reject(new Error("Mất kết nối khi tải file lên, vui lòng thử lại"));
    xhr.onabort = () => reject(new Error("Đã huỷ tải lên"));
    xhr.send(file);
  });
}
