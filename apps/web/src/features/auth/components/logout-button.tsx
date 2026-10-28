"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Dialog } from "@/shared/ui";
import { logout } from "../api/auth-api";
import { LOGGED_OUT_PATH } from "../config";

// Đăng xuất có xác nhận (bước 29); xong thì tới trang "Bạn đã đăng xuất".
export function LogoutButton() {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    // Đăng xuất phía server lỗi (mất mạng…) vẫn chuyển trang như trước.
    await logout().catch(() => undefined);
    router.replace(LOGGED_OUT_PATH);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setAsking(true)} className="justify-start">
        <LogOut className="size-4" aria-hidden />
        Đăng xuất
      </Button>
      <Dialog
        open={asking}
        onClose={() => !pending && setAsking(false)}
        title="Đăng xuất khỏi hệ thống?"
        description="Bạn sẽ cần đăng nhập lại để tiếp tục làm việc."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)} disabled={pending}>
              Huỷ
            </Button>
            <Button onClick={confirm} loading={pending} data-autofocus>
              {pending ? "Đang đăng xuất…" : "Đăng xuất"}
            </Button>
          </>
        }
      />
    </>
  );
}
