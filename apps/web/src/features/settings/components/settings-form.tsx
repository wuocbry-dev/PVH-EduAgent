"use client";

import type { AuthMeDto, SettingDto, SettingKey, UpdateSettingsRequest } from "@pvh/shared";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/shared/lib/api-client";
import { formatDateTime } from "@/shared/lib/format";
import { buttonClass, errorClass, inputClass } from "@/shared/ui/form-styles";
import { getSettings, updateSettings } from "../api/settings-api";
import { FormActions, Skeleton } from "@/shared/ui";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// F17 – cấu hình hệ thống. Ban giám hiệu xem được; chỉ ADMIN (setting:manage) sửa được.
// Không đặt required trên ô nhập: khóa chưa cấu hình được phép để trống (dùng mặc định), server kiểm tra giá trị.
// Chỉ gửi những khóa đã thay đổi; ô để trống (khóa không bắt buộc) nghĩa là xóa cấu hình.
export function SettingsForm() {
  const [settings, setSettings] = useState<SettingDto[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  // Đổi key để các ô nhập nạp lại giá trị mặc định sau khi lưu.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    Promise.all([getSettings(), api<AuthMeDto>("/auth/me")])
      .then(([list, me]) => {
        if (!current) return;
        setSettings(list);
        setCanEdit(me.permissions.includes("setting:manage"));
      })
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!settings) return;
    const form = new FormData(e.currentTarget);
    const changes: UpdateSettingsRequest = {};
    for (const s of settings) {
      if (s.input === "json") continue; // khung tiết chỉnh ở trang Thời khoá biểu
      const value = String(form.get(s.key)).trim();
      if (value !== (s.value ?? "")) changes[s.key as SettingKey] = value;
    }
    setError(null);
    setSaved(false);
    if (Object.keys(changes).length === 0) {
      setError("Chưa có thay đổi nào để lưu");
      return;
    }
    setPending(true);
    try {
      setSettings(await updateSettings(changes));
      setVersion((v) => v + 1);
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  if (!settings) return error ? <p className={errorClass}>{error}</p> : <Skeleton />;

  return (
    <form key={version} onSubmit={onSubmit} className="max-w-2xl space-y-5">
      {!canEdit && (
        <p className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
          Bạn chỉ có quyền xem. Chỉ quản trị hệ thống mới sửa được cấu hình.
        </p>
      )}
      {settings.filter((s) => s.input !== "json").map((s) => (
        <label key={s.key} className="block space-y-1 text-sm">
          <span className="font-medium">{s.label}</span>
          {s.input === "toggle" ? (
            <select name={s.key} defaultValue={s.value ?? s.defaultValue} disabled={!canEdit} className={`${inputClass} disabled:opacity-70`}>
              <option value="true">Bật</option>
              <option value="false">Tắt</option>
            </select>
          ) : (
            <input
              name={s.key}
              type={s.input}
              defaultValue={s.value ?? ""}
              placeholder={s.defaultValue ? `Mặc định: ${s.defaultValue}` : "Chưa cấu hình"}
              disabled={!canEdit}
              min={s.input === "number" ? 1 : undefined}
              max={s.input === "number" ? 168 : undefined}
              className={`${inputClass} disabled:opacity-70`}
            />
          )}
          <span className="block text-xs text-muted">{s.description}</span>
          {s.updatedAt && (
            <span className="block text-xs text-muted">
              Sửa lần cuối {formatDateTime(s.updatedAt)}
              {s.updatedByName ? ` bởi ${s.updatedByName}` : ""}
            </span>
          )}
        </label>
      ))}
      <p className="text-xs text-muted">API key, token và các bí mật khác không lưu ở đây mà nằm trong file .env của máy chủ.</p>
      {error && <p className={errorClass}>{error}</p>}
      {canEdit ? (
        <FormActions>
          <button type="submit" disabled={pending} className={`${buttonClass} w-auto`}>
            Lưu cấu hình
          </button>
          {saved && <p className="text-sm text-success" role="status">Đã lưu cấu hình.</p>}
        </FormActions>
      ) : (
        saved && <p className="text-sm text-success">Đã lưu cấu hình.</p>
      )}
    </form>
  );
}
