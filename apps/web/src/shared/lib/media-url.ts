import { env } from "@/shared/config/env";

// API trả đường dẫn ảnh tương đối (/media/files/...); ghép với địa chỉ API để hiển thị.
export function mediaSrc(url: string): string {
  return `${env.apiUrl}${url}`;
}
