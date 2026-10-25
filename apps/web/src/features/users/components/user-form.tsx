"use client";

import { PASSWORD_MIN_LENGTH, ROLE_NAMES, ROLES, type Role, type UserDto } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { createUser, updateUser } from "../api/users-api";
import { buttonClass, errorClass, inputClass } from "@/shared/ui/form-styles";

interface Props {
  // Có `user` thì là sửa, không thì là tạo mới.
  user?: UserDto;
  onSaved: () => void;
  onCancel: () => void;
}

export function UserForm({ user, onSaved, onCancel }: Props) {
  const [roles, setRoles] = useState<Role[]>(user?.roles ?? ["TEACHER"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggleRole(role: Role) {
    setRoles((cur) => (cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role]));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fullName = String(form.get("fullName"));
    const phone = String(form.get("phone")) || null;
    setPending(true);
    setError(null);
    try {
      if (user) {
        await updateUser(user.id, { fullName, phone, roles });
      } else {
        await createUser({
          email: String(form.get("email")),
          password: String(form.get("password")),
          fullName,
          phone,
          roles,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-md space-y-4 rounded border border-black/10 p-4 dark:border-white/15"
    >
      <h2 className="text-lg font-semibold">{user ? `Sửa: ${user.email}` : "Thêm người dùng"}</h2>
      {!user && (
        <>
          <label className="block space-y-1 text-sm">
            <span>Email</span>
            <input name="email" type="email" required className={inputClass} />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Mật khẩu ban đầu (ít nhất {PASSWORD_MIN_LENGTH} ký tự)</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
              className={inputClass}
            />
          </label>
        </>
      )}
      <label className="block space-y-1 text-sm">
        <span>Họ tên</span>
        <input name="fullName" defaultValue={user?.fullName} required className={inputClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Số điện thoại</span>
        <input name="phone" defaultValue={user?.phone ?? ""} className={inputClass} />
      </label>
      <fieldset className="space-y-1 text-sm">
        <legend>Vai trò</legend>
        {ROLES.map((role) => (
          <label key={role} className="flex items-center gap-2">
            <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
            {ROLE_NAMES[role]}
          </label>
        ))}
      </fieldset>
      {error && <p className={errorClass}>{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || roles.length === 0} className={buttonClass}>
          {user ? "Lưu thay đổi" : "Tạo người dùng"}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-black/20 px-4 py-2 dark:border-white/20">
          Hủy
        </button>
      </div>
    </form>
  );
}
