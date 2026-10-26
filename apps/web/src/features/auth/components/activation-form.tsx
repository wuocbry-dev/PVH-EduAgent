"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { activateAccount } from "../api/auth-api";
import { afterLoginPath, LOGIN_PATH } from "../config";
import { buttonClass, errorClass, inputClass } from "@/shared/ui/form-styles";
import { NewPasswordFields, readNewPassword } from "./password-fields";

export function ActivationForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const me = await activateAccount({
        identifier: String(form.get("identifier")).trim(),
        activationCode: String(form.get("activationCode")).trim(),
        newPassword: readNewPassword(form),
      });
      router.replace(afterLoginPath(me.roles, null));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1 text-sm">
        <span>Mã học sinh / mã giáo viên (hoặc email)</span>
        <input name="identifier" autoComplete="username" autoCapitalize="none" maxLength={150} required className={inputClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Mã kích hoạt (dạng XXXXX-XXXXX)</span>
        <input
          name="activationCode"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          required
          className={`${inputClass} font-mono uppercase tracking-wider`}
        />
      </label>
      <NewPasswordFields />
      {error && <p className={errorClass}>{error}</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Đang kích hoạt…" : "Kích hoạt và đăng nhập"}
      </button>
      <p className="text-center text-sm">
        <Link href={LOGIN_PATH} className="underline opacity-70">
          Đã có mật khẩu? Đăng nhập
        </Link>
      </p>
    </form>
  );
}
