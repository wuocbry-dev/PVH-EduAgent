"use client";

import { ROLE_NAMES, type Permission, type Role, type RolesOverviewDto } from "@pvh/shared";
import { useEffect, useState } from "react";
import { errorClass } from "@/shared/ui/form-styles";
import { getRoles, updateRolePermissions } from "../api/users-api";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Ma trận vai trò × quyền: mỗi cột là một vai trò, tích/bỏ tích rồi bấm Lưu của cột đó.
export function RoleMatrix() {
  const [overview, setOverview] = useState<RolesOverviewDto | null>(null);
  // Quyền đang chọn của từng vai trò (chưa lưu).
  const [draft, setDraft] = useState<Partial<Record<Role, Permission[]>>>({});
  const [saving, setSaving] = useState<Role | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getRoles()
      .then((data) => current && setOverview(data))
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, []);

  if (!overview) {
    return error ? <p className={errorClass}>{error}</p> : <p className="text-sm opacity-60">Đang tải…</p>;
  }

  const saved = (role: Role) => overview.roles.find((r) => r.code === role)?.permissions ?? [];
  const selected = (role: Role) => draft[role] ?? saved(role);
  const dirty = (role: Role) => {
    const a = new Set(selected(role));
    return a.size !== saved(role).length || saved(role).some((p) => !a.has(p));
  };

  function toggle(role: Role, permission: Permission) {
    const cur = selected(role);
    setDraft((d) => ({
      ...d,
      [role]: cur.includes(permission) ? cur.filter((p) => p !== permission) : [...cur, permission],
    }));
  }

  async function save(role: Role) {
    setSaving(role);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateRolePermissions(role, selected(role));
      setOverview((o) =>
        o && { ...o, roles: o.roles.map((r) => (r.code === role ? { ...r, permissions: updated.permissions } : r)) },
      );
      setDraft((d) => ({ ...d, [role]: undefined }));
      setMessage(`Đã lưu quyền của vai trò ${ROLE_NAMES[role]}.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className="py-2 pr-4">Quyền</th>
              {overview.roles.map((r) => (
                <th key={r.code} className="px-3 py-2 text-center">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/15">
            {overview.permissions.map((p) => (
              <tr key={p.code}>
                <td className="py-2 pr-4">
                  <span className="font-mono text-xs">{p.code}</span>
                  <span className="block text-xs opacity-60">{p.description}</span>
                </td>
                {overview.roles.map((r) => (
                  <td key={r.code} className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${r.name}: ${p.code}`}
                      checked={selected(r.code).includes(p.code)}
                      // ADMIN luôn giữ user:manage để không tự khóa mình khỏi hệ thống.
                      disabled={r.code === "ADMIN" && p.code === "user:manage"}
                      onChange={() => toggle(r.code, p.code)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              {overview.roles.map((r) => (
                <td key={r.code} className="px-3 py-3 text-center">
                  <button
                    type="button"
                    disabled={!dirty(r.code) || saving !== null}
                    onClick={() => save(r.code)}
                    className="rounded bg-foreground px-3 py-1 text-background disabled:opacity-40"
                  >
                    Lưu
                  </button>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {error && <p className={errorClass}>{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}
    </div>
  );
}
