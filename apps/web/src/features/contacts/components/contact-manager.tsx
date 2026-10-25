"use client";

import { CONTACT_STATUS_NAMES, CONTACT_STATUSES, type ContactDto, type ContactStatus } from "@pvh/shared";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { CONTACTS_PAGE_SIZE, listContacts, updateContactStatus, type ContactList } from "../api/contacts-api";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Quản trị: xem liên hệ gửi từ website và đổi trạng thái (Mới → Đã xem → Đã xử lý).
export function ContactManager() {
  const [status, setStatus] = useState<ContactStatus | "">("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ContactList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    listContacts({ status, page })
      .then((data) => {
        if (!current) return;
        setResult(data);
        setError(null);
      })
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, [status, page]);

  async function changeStatus(contact: ContactDto, next: ContactStatus) {
    setError(null);
    try {
      const updated = await updateContactStatus(contact.id, next);
      setResult((cur) => cur && { ...cur, items: cur.items.map((c) => (c.id === updated.id ? updated : c)) });
    } catch (err) {
      setError(errorText(err));
    }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / CONTACTS_PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <select
        value={status}
        onChange={(e) => {
          setStatus(e.target.value as ContactStatus | "");
          setPage(1);
        }}
        className={`${inputClass} w-auto`}
        aria-label="Lọc theo trạng thái"
      >
        <option value="">Mọi trạng thái</option>
        {CONTACT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {CONTACT_STATUS_NAMES[s]}
          </option>
        ))}
      </select>

      {error && <p className={errorClass}>{error}</p>}
      {result === null && !error && <p className="text-sm opacity-60">Đang tải…</p>}

      {result && (
        <>
          <ul className="space-y-3">
            {result.items.map((contact) => (
              <li key={contact.id} className="space-y-2 rounded border border-black/10 p-4 dark:border-white/15">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">{contact.subject}</h2>
                  <select
                    value={contact.status}
                    onChange={(e) => changeStatus(contact, e.target.value as ContactStatus)}
                    className={`${inputClass} w-auto py-1 text-sm`}
                    aria-label={`Trạng thái liên hệ ${contact.subject}`}
                  >
                    {CONTACT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {CONTACT_STATUS_NAMES[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs opacity-70">
                  {contact.fullName} · {contact.email ?? "không có email"} · {contact.phone ?? "không có số điện thoại"} ·{" "}
                  {formatDateTime(contact.createdAt)}
                </p>
                {/* Hiển thị dạng văn bản thuần, giữ xuống dòng. */}
                <p className="whitespace-pre-wrap text-sm">{contact.message}</p>
              </li>
            ))}
            {result.items.length === 0 && <li className="text-sm opacity-70">Không có liên hệ nào.</li>}
          </ul>
          <div className="flex items-center gap-4 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="underline disabled:opacity-40">
              Trang trước
            </button>
            <span>
              Trang {page}/{totalPages} · {result.total} liên hệ
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="underline disabled:opacity-40"
            >
              Trang sau
            </button>
          </div>
        </>
      )}
    </div>
  );
}
