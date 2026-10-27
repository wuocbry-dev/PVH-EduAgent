import { portalRedirect, type Role } from "@pvh/shared";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/shared/config/env";
import { ACCESS_COOKIE, LOGIN_PATH, REFRESH_COOKIE } from "./config";

// Gộp các lần refresh đồng thời của cùng một refresh token (prefetch nhiều trang trong cổng).
const pending = new Map<string, Promise<string[] | null>>();

// Chặn mọi cổng (/admin, /bgh, /bien-tap, /thu-thu, /giao-vien, /hoc-sinh). Kiểm tra lạc quan: chỉ xem cookie và claim `roles`
// trong access token để chọn cổng; API mới là nơi xác thực và kiểm tra quyền thật.
// - Còn access token → dùng luôn. Hết access token nhưng còn refresh token → gọi API cấp cặp token mới, gắn cookie
//   mới cho trình duyệt và cho chính request đang render. Không có gì → /dang-nhap?next=<trang đang mở>.
// - Sai cổng, hoặc đường dẫn cũ trong /admin (vd. /admin/bai-viet): chuyển hướng 308 tới đúng cổng của người đó,
//   không có trang tương ứng thì về cổng chính (không lộ trang 403).
export async function authProxy(request: NextRequest) {
  let setCookies: string[] | null = null;
  if (!request.cookies.has(ACCESS_COOKIE)) {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    setCookies = refreshToken ? await refresh(refreshToken) : null;
    if (!setCookies) {
      const loginUrl = new URL(LOGIN_PATH, request.url);
      loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete(REFRESH_COOKIE);
      return response;
    }
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";");
      const eq = pair.indexOf("=");
      request.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  const roles = await rolesOf(request);
  const target = roles ? portalRedirect(roles, request.nextUrl.pathname) : null;
  if (target) {
    const url = new URL(target, request.url);
    url.search = request.nextUrl.search;
    const response = NextResponse.redirect(url, 308);
    for (const cookie of setCookies ?? []) response.headers.append("set-cookie", cookie);
    return response;
  }

  if (!setCookies) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set("cookie", request.cookies.toString());
  const response = NextResponse.next({ request: { headers } });
  for (const cookie of setCookies) response.headers.append("set-cookie", cookie);
  return response;
}

// Vai trò của người đăng nhập: đọc claim `roles` của access token (chỉ để chọn cổng, không phải bằng chứng quyền).
// Token cấp trước khi có claim thì hỏi API một lần.
async function rolesOf(request: NextRequest): Promise<Role[] | null> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const claim = token ? decodeRoles(token) : null;
  if (claim) return claim;
  try {
    const res = await fetch(`${env.apiUrl}/auth/me`, { headers: { cookie: request.cookies.toString() } });
    return res.ok ? ((await res.json()) as { roles: Role[] }).roles : null;
  } catch {
    return null;
  }
}

function decodeRoles(token: string): Role[] | null {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)))) as {
      roles?: unknown;
    };
    return Array.isArray(json.roles) ? (json.roles as Role[]) : null;
  } catch {
    return null;
  }
}

function refresh(refreshToken: string): Promise<string[] | null> {
  let result = pending.get(refreshToken);
  if (!result) {
    result = fetch(`${env.apiUrl}/auth/refresh`, {
      method: "POST",
      headers: { cookie: `${REFRESH_COOKIE}=${refreshToken}` },
    })
      .then((res) => (res.ok ? res.headers.getSetCookie() : null))
      .catch(() => null);
    pending.set(refreshToken, result);
    // Giữ kết quả vài giây cho các request song song rồi bỏ.
    void result.finally(() => setTimeout(() => pending.delete(refreshToken), 5_000));
  }
  return result;
}
