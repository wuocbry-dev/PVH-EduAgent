"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Input, PasswordInput } from "@/shared/ui";
import { login } from "../api/auth-api";
import { afterLoginPath } from "../config";

const linkClass = "rounded-xl font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const me = await login({ identifier: String(form.get("identifier")).trim(), password: String(form.get("password")) });
      router.replace(afterLoginPath(me.roles, next));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Email hoặc mã học sinh/giáo viên</span>
          <Input name="identifier" type="text" autoComplete="username" autoCapitalize="none" maxLength={150} required />
        </label>
        <div className="space-y-1.5 text-sm font-medium">
          <label htmlFor="mat-khau" className="block">
            Mật khẩu
          </label>
          <PasswordInput id="mat-khau" name="password" autoComplete="current-password" required />
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" full loading={pending}>
          {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
        <p className="text-center text-sm">
          <Link href="/quen-mat-khau" className={linkClass}>
            Quên mật khẩu?
          </Link>
        </p>
      </form>
      <div className="flex items-start gap-3 rounded-xl border border-primary-soft-border bg-primary-soft p-3 text-sm">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          Lần đầu dùng hệ thống?{" "}
          <Link href="/kich-hoat" className={linkClass}>
            Kích hoạt tài khoản
          </Link>{" "}
          bằng mã trên phiếu tài khoản nhà trường cấp.
        </p>
      </div>
    </div>
  );
}
