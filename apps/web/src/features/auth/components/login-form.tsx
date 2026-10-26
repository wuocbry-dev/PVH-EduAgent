"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { login } from "../api/auth-api";
import { afterLoginPath } from "../config";
import { buttonClass, errorClass, inputClass } from "@/shared/ui/form-styles";

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
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1 text-sm">
        <span>Email hoặc mã học sinh / mã giáo viên</span>
        <input name="identifier" type="text" autoComplete="username" autoCapitalize="none" maxLength={150} required className={inputClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Mật khẩu</span>
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      {error && <p className={errorClass}>{error}</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
      <p className="text-center text-sm">
        <Link href="/quen-mat-khau" className="underline opacity-70">
          Quên mật khẩu?
        </Link>
      </p>
      <p className="text-center text-sm">
        Có phiếu tài khoản?{" "}
        <Link href="/kich-hoat" className="underline">
          Kích hoạt tài khoản
        </Link>
      </p>
    </form>
  );
}
