"use client";

import { ROLE_NAMES, type Permission, type Role, type RolesOverviewDto } from "@pvh/shared";
import { useEffect, useState } from "react";
import { errorClass } from "@/shared/ui/form-styles";
import { getRoles, updateRolePermissions } from "../api/users-api";
import { Skeleton, Table, useToast } from "@/shared/ui";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Ma trận vai trò × quyền: mỗi cột là một vai trò, tích/bỏ tích rồi bấm Lưu của cột đó.
export function RoleMatrix() {
  const [overview, setOverview] = useState<RolesOverviewDto | null>(null);
  // Quyền đang chọn của từng vai trò (chưa lưu).
  const [draft, setDraft] = useState<Partial<Record<Role, Permission[]>>>({});
  const [saving, setSaving] = useState<Role | null>(null);
  const toast = useToast();
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
    return error ? <p className={errorClass}>{error}</p> : <Skeleton />;
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
    try {
      const updated = await updateRolePermissions(role, selected(role));
      setOverview((o) =>
        o && { ...o, roles: o.roles.map((r) => (r.code === role ? { ...r, permissions: updated.permissions } : r)) },
      );
      setDraft((d) => ({ ...d, [role]: undefined }));
      toast.success(`Đã lưu quyền của vai trò ${ROLE_NAMES[role]}.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <Table>
        <thead className="border-b border-border">
          <tr>
            <th className="py-2 pr-4">Quyền</th>
            {overview.roles.map((r) => (
              <th key={r.code} className="px-3 py-2 text-center">
                {r.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {overview.permissions.map((p) => (
            <tr key={p.code}>
              <td className="py-2 pr-4">
                <span className="font-mono text-xs">{p.code}</span>
                <span className="block text-xs text-muted">{p.description}</span>
              </td>
              {overview.roles.map((r) => (
                <td key={r.code} className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`${r.name}: ${p.code}`}
                    checked={selected(r.code).includes(p.code)}
                    // ADMIN luôn giữ các quyền quản trị để không tự khóa mình khỏi hệ thống.
                    disabled={r.code === "ADMIN" && (p.code === "user:manage" || p.code === "setting:manage")}
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
                  className="rounded-xl bg-primary px-3 py-1 text-primary-foreground disabled:opacity-40"
                >
                  Lưu
                </button>
              </td>
            ))}
          </tr>
        </tfoot>
      </Table>
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}
