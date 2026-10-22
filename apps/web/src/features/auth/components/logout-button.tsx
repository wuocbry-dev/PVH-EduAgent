"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "../api/auth-api";
import { LOGIN_PATH } from "../config";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    // Đăng xuất phía server lỗi (mất mạng…) vẫn đưa về trang đăng nhập.
    await logout().catch(() => undefined);
    router.replace(LOGIN_PATH);
    router.refresh();
  }

  return (
    <button type="button" onClick={onClick} disabled={pending} className="text-left text-sm underline opacity-70">
      {pending ? "Đang đăng xuất…" : "Đăng xuất"}
    </button>
  );
}
