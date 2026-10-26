import type { NextRequest } from "next/server";
import { authProxy } from "@/features/auth/proxy";

export function proxy(request: NextRequest) {
  return authProxy(request);
}

// Khớp danh sách cổng trong @pvh/shared (PORTALS).
export const config = {
  matcher: ["/admin/:path*", "/bgh/:path*", "/bien-tap/:path*", "/giao-vien/:path*", "/hoc-sinh/:path*"],
};
