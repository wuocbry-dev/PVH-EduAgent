"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { forgotPassword } from "../api/auth-api";
import { LOGIN_PATH } from "../config";
import { buttonClass, errorClass, inputClass } from "@/shared/ui/form-styles";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email"));
    setPending(true);
    setError(null);
    try {
      setMessage((await forgotPassword(email)).message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  if (message) {
    return (
      <div className="space-y-4 text-sm">
        <p>{message}. Link có hiệu lực trong 30 phút.</p>
        <Link href={LOGIN_PATH} className="underline">
          Quay lại đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm opacity-70">
        Học sinh đăng nhập bằng mã học sinh (không có email): hãy liên hệ giáo viên chủ nhiệm để được cấp lại mã kích hoạt.
      </p>
      <label className="block space-y-1 text-sm">
        <span>Email đăng nhập</span>
        <input name="email" type="email" autoComplete="username" required className={inputClass} />
      </label>
      {error && <p className={errorClass}>{error}</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        Gửi link đặt lại mật khẩu
      </button>
      <p className="text-center text-sm">
        <Link href={LOGIN_PATH} className="underline opacity-70">
          Quay lại đăng nhập
        </Link>
      </p>
    </form>
  );
}
