import { env } from "@/shared/config/env";
import { ApiError, parseResponse } from "./api-client";

// Gọi API công khai từ server (không cookie). Dùng trong các hàm `use cache`.
export async function publicFetch<T>(path: string): Promise<T> {
  return parseResponse<T>(await fetch(`${env.apiUrl}${path}`));
}

// Kết quả của một hàm đọc dữ liệu công khai: `data` null khi API không trả được (tắt, lỗi mạng...).
export interface Loaded<T> {
  data: T | null;
  // true khi API trả 404 (khác với lỗi tạm thời).
  notFound: boolean;
}

export async function load<T>(path: string): Promise<Loaded<T>> {
  try {
    return { data: await publicFetch<T>(path), notFound: false };
  } catch (err) {
    return { data: null, notFound: err instanceof ApiError && err.status === 404 };
  }
}
