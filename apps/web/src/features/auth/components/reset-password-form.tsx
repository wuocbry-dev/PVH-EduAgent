"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, buttonStyles } from "@/shared/ui";
import { resetPassword } from "../api/auth-api";
import { LOGIN_PATH } from "../config";
import { BackToLogin } from "./forgot-password-form";
import { NewPasswordFields, readNewPassword } from "./password-fields";

export function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await resetPassword({ token: token ?? "", newPassword: readNewPassword(new FormData(e.currentTarget)) });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <Alert tone="danger">Link đặt lại mật khẩu không hợp lệ.</Alert>
        <BackToLogin />
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">Đã đặt lại mật khẩu. Mọi phiên đăng nhập cũ đã bị đăng xuất.</Alert>
        <Link href={LOGIN_PATH} className={buttonStyles({ full: true })}>
          Đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <NewPasswordFields />
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" full loading={pending}>
        Đặt lại mật khẩu
      </Button>
      <BackToLogin />
    </form>
  );
}
