"use client";

import {
  ROLE_NAMES,
  ROLES,
  USER_STATUS_NAMES,
  USER_STATUSES,
  PASSWORD_MIN_LENGTH,
  type UserDto,
  type UserListDto,
} from "@pvh/shared";
import { useEffect, useState, type FormEvent } from "react";
import { inputClass, errorClass } from "@/shared/ui/form-styles";
import {
  listUsers,
  resetUserPassword,
  setUserStatus,
  USERS_PAGE_SIZE,
  type UserFilters,
} from "../api/users-api";
import { UserForm } from "./user-form";

type Editing = { mode: "create" } | { mode: "edit"; user: UserDto } | null;

const EMPTY_FILTERS: UserFilters = { q: "", status: "", role: "", page: 1 };
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function UserManager() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [result, setResult] = useState<UserListDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  // Tăng sau mỗi thay đổi để tải lại danh sách.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    listUsers(filters)
      .then((data) => {
        if (!current) return;
        setResult(data);
        setError(null);
      })
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, [filters, version]);

  const reload = () => setVersion((v) => v + 1);

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setFilters({
      q: String(form.get("q")).trim(),
      status: String(form.get("status")) as UserFilters["status"],
      role: String(form.get("role")) as UserFilters["role"],
      page: 1,
    });
  }

  async function toggleLock(user: UserDto) {
    const lock = user.status === "ACTIVE";
    if (lock && !confirm(`Khóa tài khoản ${user.email}? Người này sẽ bị đăng xuất ngay.`)) return;
    try {
      await setUserStatus(user.id, lock ? "LOCKED" : "ACTIVE");
      reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function resetPassword(user: UserDto) {
    const newPassword = prompt(`Mật khẩu mới cho ${user.email} (ít nhất ${PASSWORD_MIN_LENGTH} ký tự):`);
    if (!newPassword) return;
    try {
      await resetUserPassword(user.id, newPassword);
      alert("Đã đặt lại mật khẩu. Các phiên đăng nhập của người này đã bị đăng xuất.");
    } catch (err) {
      setError(errorText(err));
    }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / USERS_PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2">
          <input name="q" placeholder="Tìm theo tên hoặc email" className={`${inputClass} w-60`} />
          <select name="status" defaultValue="" className={`${inputClass} w-auto`}>
            <option value="">Mọi trạng thái</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {USER_STATUS_NAMES[s]}
              </option>
            ))}
          </select>
          <select name="role" defaultValue="" className={`${inputClass} w-auto`}>
            <option value="">Mọi vai trò</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_NAMES[r]}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded border border-black/20 px-4 py-2 dark:border-white/20">
            Lọc
          </button>
        </form>
        <button
          type="button"
          onClick={() => setEditing({ mode: "create" })}
          className="rounded bg-foreground px-4 py-2 text-background"
        >
          Thêm người dùng
        </button>
      </div>

      {editing && (
        <UserForm
          key={editing.mode === "edit" ? editing.user.id : "create"}
          user={editing.mode === "edit" ? editing.user : undefined}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {error && <p className={errorClass}>{error}</p>}

      {result === null && !error ? (
        <p className="text-sm opacity-60">Đang tải…</p>
      ) : (
        result && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-black/10 dark:border-white/15">
                  <tr>
                    <th className="py-2 pr-4">Họ tên</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Vai trò</th>
                    <th className="py-2 pr-4">Trạng thái</th>
                    <th className="py-2">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/15">
                  {result.items.map((user) => (
                    <tr key={user.id}>
                      <td className="py-2 pr-4">{user.fullName}</td>
                      <td className="py-2 pr-4">{user.email}</td>
                      <td className="py-2 pr-4">{user.roles.map((r) => ROLE_NAMES[r]).join(", ")}</td>
                      <td className={`py-2 pr-4 ${user.status === "LOCKED" ? "text-red-600" : ""}`}>
                        {USER_STATUS_NAMES[user.status]}
                      </td>
                      <td className="flex flex-wrap gap-3 py-2">
                        <button type="button" className="underline" onClick={() => setEditing({ mode: "edit", user })}>
                          Sửa
                        </button>
                        <button type="button" className="underline" onClick={() => toggleLock(user)}>
                          {user.status === "ACTIVE" ? "Khóa" : "Mở khóa"}
                        </button>
                        <button type="button" className="underline" onClick={() => resetPassword(user)}>
                          Đặt lại mật khẩu
                        </button>
                      </td>
                    </tr>
                  ))}
                  {result.items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 opacity-70">
                        Không có người dùng phù hợp.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <button
                type="button"
                disabled={filters.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                className="underline disabled:opacity-40"
              >
                Trang trước
              </button>
              <span>
                Trang {filters.page}/{totalPages} · {result.total} người dùng
              </span>
              <button
                type="button"
                disabled={filters.page >= totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                className="underline disabled:opacity-40"
              >
                Trang sau
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}
