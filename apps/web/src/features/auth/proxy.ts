import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/shared/config/env";
import { ACCESS_COOKIE, LOGIN_PATH, REFRESH_COOKIE } from "./config";

// Gộp các lần refresh đồng thời của cùng một refresh token (prefetch nhiều trang /admin).
const pending = new Map<string, Promise<string[] | null>>();

// Kiểm tra lạc quan cho /admin: chỉ xem cookie, API mới là nơi xác thực thật.
// - Còn access token → cho qua.
// - Hết access token nhưng còn refresh token → gọi API cấp cặp token mới, gắn cookie mới
//   cho trình duyệt và cho chính request đang render.
// - Không có gì → chuyển về /dang-nhap?next=<trang đang mở>.
export async function authProxy(request: NextRequest) {
  if (request.cookies.has(ACCESS_COOKIE)) return NextResponse.next();

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const setCookies = refreshToken ? await refresh(refreshToken) : null;
  if (setCookies) {
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";");
      const eq = pair.indexOf("=");
      request.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    const headers = new Headers(request.headers);
    headers.set("cookie", request.cookies.toString());
    const response = NextResponse.next({ request: { headers } });
    for (const cookie of setCookies) response.headers.append("set-cookie", cookie);
    return response;
  }

  const loginUrl = new URL(LOGIN_PATH, request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
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
