import { env } from "@/shared/config/env";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Gửi request tới API kèm cookie đăng nhập (pvh_access, pvh_refresh).
export function apiFetch(path: string, { headers, ...init }: RequestInit = {}): Promise<Response> {
  return fetch(`${env.apiUrl}${path}`, {
    ...init,
    credentials: "include",
    // FormData (tải ảnh) để trình duyệt tự đặt Content-Type kèm boundary.
    headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...headers },
  });
}

export async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new ApiError(res.status, errorMessage(body) ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Gọi API từ trình duyệt. Access token hết hạn (401) thì refresh một lần rồi thử lại;
// refresh không được thì báo lỗi (lần điều hướng sau proxy sẽ đưa về /dang-nhap).
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await apiFetch(path, init);
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    if (!(await refreshSession())) {
      throw new ApiError(401, "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
    }
    res = await apiFetch(path, init);
  }
  return parseResponse<T>(res);
}

// Gộp các lần refresh đồng thời: refresh token chỉ dùng được một lần.
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= apiFetch("/auth/refresh", { method: "POST" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// NestJS trả `message` (chuỗi hoặc mảng); lỗi zod trả `{ formErrors, fieldErrors }`.
function errorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { message, formErrors, fieldErrors } = body as {
    message?: string | string[];
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.join(", ");
  const first = [...(formErrors ?? []), ...Object.values(fieldErrors ?? {}).flat()][0];
  return first ?? undefined;
}
