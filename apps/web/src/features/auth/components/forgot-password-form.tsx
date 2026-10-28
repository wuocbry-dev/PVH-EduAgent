"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, Button, Input } from "@/shared/ui";
import { forgotPassword } from "../api/auth-api";
import { LOGIN_PATH } from "../config";

export function BackToLogin() {
  return (
    <p className="text-center text-sm">
      <Link href={LOGIN_PATH} className="inline-flex items-center gap-1.5 rounded-xl font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
        <ArrowLeft className="size-4" aria-hidden />
        Quay lại đăng nhập
      </Link>
    </p>
  );
}

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
      <div className="space-y-4">
        <Alert tone="success">{message}. Link có hiệu lực trong 30 phút.</Alert>
        <BackToLogin />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Alert tone="info">Học sinh đăng nhập bằng mã học sinh (không có email): hãy liên hệ giáo viên chủ nhiệm để được cấp lại mã kích hoạt.</Alert>
      <label className="block space-y-1.5 text-sm font-medium">
        <span>Email đăng nhập</span>
        <Input name="email" type="email" autoComplete="username" required />
      </label>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" full loading={pending}>
        Gửi link đặt lại mật khẩu
      </Button>
      <BackToLogin />
    </form>
  );
}
