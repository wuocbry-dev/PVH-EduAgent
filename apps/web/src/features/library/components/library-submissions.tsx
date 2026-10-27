"use client";

import { LIBRARY_KIND_NAMES, LIBRARY_STATUS_NAMES, type LibraryItemDto, type LibraryStatus } from "@pvh/shared";
import Link from "next/link";
import { useState } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { mediaSrc } from "@/shared/lib/media-url";
import { errorText, useData } from "@/shared/lib/use-data";
import { accessItem, deleteItem, getFormOptions, listSubmissions, submitItem } from "../api/library-api";
import { itemPath } from "./library-card";
import { LibraryItemForm } from "./library-item-form";

export const STATUS_STYLE: Record<LibraryStatus, string> = {
  DRAFT: "bg-neutral-200 text-neutral-800",
  PENDING_REVIEW: "bg-amber-100 text-amber-900",
  PUBLISHED: "bg-green-100 text-green-900",
  REJECTED: "bg-red-100 text-red-900",
  ARCHIVED: "bg-neutral-300 text-neutral-800",
};
export const smallButton = "rounded border border-black/20 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20";

export function StatusBadge({ status }: { status: LibraryStatus }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[status]}`}>{LIBRARY_STATUS_NAMES[status]}</span>;
}

// Mở file để xem lại (người gửi xem tài liệu của mình, người quản lý xem trước khi duyệt) trong thẻ mới.
export async function previewItem(id: string) {
  const tab = window.open("", "_blank");
  try {
    const { url } = await accessItem(id);
    if (tab) tab.location.href = mediaSrc(url);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

const mineQuery = { scope: "mine" as const };

// "Tài liệu tôi gửi": soạn, tải file, gửi duyệt, xem lý do bị từ chối.
export function LibrarySubmissions() {
  const options = useData(getFormOptions, undefined);
  const list = useData(listSubmissions, mineQuery);
  const [editing, setEditing] = useState<LibraryItemDto | null | "new">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(done);
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (options.error) return <p className="text-sm text-red-600">{options.error}</p>;
  if (!options.data || !list.data) return <p className="text-sm opacity-70">Đang tải…</p>;
  return (
    <div className="space-y-4">
      {editing ? (
        <LibraryItemForm
          key={editing === "new" ? "new" : editing.id}
          options={options.data}
          item={editing === "new" ? null : editing}
          onSaved={(saved) => {
            setEditing(null);
            setMessage(saved.hasFile ? `Đã lưu "${saved.title}". Bấm "Gửi duyệt" khi sẵn sàng.` : `Đã lưu "${saved.title}" nhưng chưa có file tài liệu.`);
            list.reload();
          }}
          onCancel={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="rounded bg-brand px-4 py-2 text-sm text-white">
          + Tài liệu mới
        </button>
      )}
      {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {list.data.length === 0 ? (
        <p className="text-sm opacity-70">Bạn chưa gửi tài liệu nào.</p>
      ) : (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/15 dark:border-white/15">
          {list.data.map((item) => {
            const editable = item.status === "DRAFT" || item.status === "REJECTED";
            return (
              <li key={item.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.status} />
                  <span className="font-medium">{item.title}</span>
                  <span className="text-xs opacity-70">
                    {LIBRARY_KIND_NAMES[item.kind]} · {item.categoryName} · {item.audienceLabel} · sửa {formatDateTime(item.updatedAt)}
                  </span>
                </div>
                {!item.hasFile && <p className="text-xs text-amber-700">Chưa có file tài liệu.</p>}
                {item.status === "REJECTED" && item.rejectReason && <p className="text-sm text-red-700">Lý do từ chối: {item.rejectReason}</p>}
                <div className="flex flex-wrap gap-2">
                  {item.status === "PUBLISHED" && (
                    <Link href={itemPath(item.slug)} className={smallButton}>
                      Xem trên thư viện
                    </Link>
                  )}
                  {item.hasFile && (
                    <button type="button" className={smallButton} onClick={() => run(() => previewItem(item.id), "")}>
                      Mở file
                    </button>
                  )}
                  {editable && (
                    <>
                      <button type="button" className={smallButton} onClick={() => setEditing(item)}>
                        Sửa
                      </button>
                      <button
                        type="button"
                        className={smallButton}
                        disabled={!item.hasFile}
                        onClick={() => run(() => submitItem(item.id), `Đã gửi duyệt "${item.title}".`)}
                      >
                        Gửi duyệt
                      </button>
                      <button
                        type="button"
                        className={`${smallButton} text-red-700`}
                        onClick={() => confirm(`Xoá "${item.title}"?`) && run(() => deleteItem(item.id), `Đã xoá "${item.title}".`)}
                      >
                        Xoá
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
