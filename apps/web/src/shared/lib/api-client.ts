import { env } from "@/shared/config/env";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface ApiOptions extends RequestInit {
  // Tạm thời: chọn tài khoản (đã seed) cho DevAuthGuard ở backend. Thay bằng JWT khi làm F10.
  devUserEmail?: string;
}

export async function api<T>(path: string, { devUserEmail, headers, ...init }: ApiOptions = {}): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(devUserEmail ? { "x-dev-user-email": devUserEmail } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, body?.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
