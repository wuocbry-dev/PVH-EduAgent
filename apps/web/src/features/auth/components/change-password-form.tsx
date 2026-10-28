"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, PasswordInput } from "@/shared/ui";
import { changePassword } from "../api/auth-api";
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
      <div className="space-y-1.5 text-sm font-medium">
        <label htmlFor="mat-khau-hien-tai" className="block">
          Mật khẩu hiện tại
        </label>
        <PasswordInput id="mat-khau-hien-tai" name="currentPassword" autoComplete="current-password" required />
      </div>
      <NewPasswordFields />
      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="success">Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.</Alert>}
      <Button type="submit" loading={pending}>
        Đổi mật khẩu
      </Button>
    </form>
  );
}
