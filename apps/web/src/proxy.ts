import type { NextRequest } from "next/server";
import { authProxy } from "@/features/auth/proxy";

export function proxy(request: NextRequest) {
  return authProxy(request);
}

export const config = {
  matcher: ["/admin/:path*"],
};
