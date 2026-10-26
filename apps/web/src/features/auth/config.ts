import { PORTAL_INFO, portalOfPath, portalRedirect, primaryPortal, type Role } from "@pvh/shared";

// Tên cookie phải khớp với apps/api/src/features/auth/auth.cookies.ts.
export const ACCESS_COOKIE = "pvh_access";
export const REFRESH_COOKIE = "pvh_refresh";

export const LOGIN_PATH = "/dang-nhap";

// Nơi đến sau đăng nhập/kích hoạt: `next` hợp lệ (cùng origin, và nếu thuộc một cổng thì cổng đó người này được vào)
// thì ưu tiên, không thì cổng chính theo vai trò (ADMIN → PRINCIPAL → EDITOR → TEACHER → STUDENT).
export function afterLoginPath(roles: readonly Role[], next: string | null | undefined): string {
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  if (safe && (!portalOfPath(safe) || portalRedirect(roles, safe) === null)) return safe;
  const portal = primaryPortal(roles);
  return portal ? PORTAL_INFO[portal].path : "/";
}
