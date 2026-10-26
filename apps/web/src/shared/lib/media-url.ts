import { env } from "@/shared/config/env";

// API trả URL đầy đủ (https://…, driver R2) hoặc đường dẫn tương đối so với địa chỉ API (/media/files/…, driver local).
// URL tuyệt đối dùng nguyên, không ghép thêm địa chỉ API.
export function mediaSrc(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${env.apiUrl}${url}`;
}
