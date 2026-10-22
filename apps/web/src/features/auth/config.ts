// Tên cookie phải khớp với apps/api/src/features/auth/auth.cookies.ts.
export const ACCESS_COOKIE = "pvh_access";
export const REFRESH_COOKIE = "pvh_refresh";

export const LOGIN_PATH = "/dang-nhap";
export const DEFAULT_AFTER_LOGIN = "/admin";

// Chỉ chấp nhận đường dẫn nội bộ để tránh open redirect (vd. ?next=//evil.com).
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : DEFAULT_AFTER_LOGIN;
}
