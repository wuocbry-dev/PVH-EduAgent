"use client";

import { PORTAL_INFO, portalOfPath } from "@pvh/shared";
import { usePathname } from "next/navigation";

// Đường dẫn gốc của cổng đang mở ('/bgh', '/bien-tap'…), để component dùng chung giữa các cổng dựng liên kết đúng cổng.
export function usePortalBase(): string {
  const portal = portalOfPath(usePathname());
  return portal ? PORTAL_INFO[portal].path : "/admin";
}
