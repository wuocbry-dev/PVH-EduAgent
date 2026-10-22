import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch, parseResponse } from "./api-client";

// Gọi API từ Server Component: chuyển tiếp cookie đăng nhập của trình duyệt.
// Đọc cookies() nên phải nằm trong <Suspense> (cacheComponents). Token đã được
// proxy làm mới trước khi render, nên 401 ở đây nghĩa là phải đăng nhập lại.
export async function serverApi<T>(path: string, { headers, ...init }: RequestInit = {}): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const res = await apiFetch(path, { ...init, headers: { ...headers, Cookie: cookieHeader } });
  if (res.status === 401) redirect("/dang-nhap");
  return parseResponse<T>(res);
}
