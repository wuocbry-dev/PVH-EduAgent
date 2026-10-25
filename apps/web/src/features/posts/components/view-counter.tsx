"use client";

import { useEffect } from "react";
import { env } from "@/shared/config/env";

// Ghi một lượt xem sau khi trang bài mở trên trình duyệt (không ghi lúc render server vì trang được cache).
export function ViewCounter({ slug }: { slug: string }) {
  useEffect(() => {
    fetch(`${env.apiUrl}/public/posts/${encodeURIComponent(slug)}/view`, { method: "POST", keepalive: true }).catch(
      () => undefined,
    );
  }, [slug]);
  return null;
}
