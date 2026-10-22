"use client";

import { useState, type FormEvent } from "react";
import { changePassword } from "../api/auth-api";
import { buttonClass, errorClass, inputClass } from "./form-styles";
import { NewPasswordFields, readNewPassword } from "./password-fields";

export function ChangePasswordForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setPending(true);
    setError(null);
    setDone(false);
    try {
      await changePassword({
        currentPassword: String(form.get("currentPassword")),
        newPassword: readNewPassword(form),
      });
      formEl.reset();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1 text-sm">
        <span>Mật khẩu hiện tại</span>
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>
      <NewPasswordFields />
      {error && <p className={errorClass}>{error}</p>}
      {done && <p className="text-sm text-green-700">Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        Đổi mật khẩu
      </button>
    </form>
  );
}
