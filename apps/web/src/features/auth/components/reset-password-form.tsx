"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { resetPassword } from "../api/auth-api";
import { LOGIN_PATH } from "../config";
import { buttonClass, errorClass } from "./form-styles";
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
    return <p className={errorClass}>Link đặt lại mật khẩu không hợp lệ.</p>;
  }

  if (done) {
    return (
      <div className="space-y-4 text-sm">
        <p>Đã đặt lại mật khẩu. Mọi phiên đăng nhập cũ đã bị đăng xuất.</p>
        <Link href={LOGIN_PATH} className="underline">
          Đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <NewPasswordFields />
      {error && <p className={errorClass}>{error}</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        Đặt lại mật khẩu
      </button>
    </form>
  );
}
