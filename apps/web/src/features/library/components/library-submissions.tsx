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
import { Skeleton, useConfirm, useToast } from "@/shared/ui";

export const STATUS_STYLE: Record<LibraryStatus, string> = {
  DRAFT: "border border-border bg-surface-muted text-muted",
  PENDING_REVIEW: "bg-warning-soft text-warning",
  PUBLISHED: "bg-success-soft text-success",
  REJECTED: "bg-danger-soft text-danger",
  ARCHIVED: "border border-border bg-surface-muted text-muted",
};
export const smallButton = "rounded-xl border border-border-strong px-3 py-1 text-sm disabled:opacity-50";

export function StatusBadge({ status }: { status: LibraryStatus }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-xs ${STATUS_STYLE[status]}`}>{LIBRARY_STATUS_NAMES[status]}</span>;
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
  const ask = useConfirm();
  const options = useData(getFormOptions, undefined);
  const list = useData(listSubmissions, mineQuery);
  const [editing, setEditing] = useState<LibraryItemDto | null | "new">(null);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await action();
      toast.success(done);
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (options.error) return <p className="text-sm text-danger">{options.error}</p>;
  if (!options.data || !list.data) return <Skeleton />;
  return (
    <div className="space-y-4">
      {editing ? (
        <LibraryItemForm
          key={editing === "new" ? "new" : editing.id}
          options={options.data}
          item={editing === "new" ? null : editing}
          onSaved={(saved) => {
            setEditing(null);
            toast.success(saved.hasFile ? `Đã lưu "${saved.title}". Bấm "Gửi duyệt" khi sẵn sàng.` : `Đã lưu "${saved.title}" nhưng chưa có file tài liệu.`);
            list.reload();
          }}
          onCancel={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">
          + Tài liệu mới
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {list.data.length === 0 ? (
        <p className="text-sm text-muted">Bạn chưa gửi tài liệu nào.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl bg-surface border border-border">
          {list.data.map((item) => {
            const editable = item.status === "DRAFT" || item.status === "REJECTED";
            return (
              <li key={item.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.status} />
                  <span className="font-medium">{item.title}</span>
                  <span className="text-xs text-muted">
                    {LIBRARY_KIND_NAMES[item.kind]} · {item.categoryName} · {item.audienceLabel} · sửa {formatDateTime(item.updatedAt)}
                  </span>
                </div>
                {!item.hasFile && <p className="text-xs text-warning">Chưa có file tài liệu.</p>}
                {item.status === "REJECTED" && item.rejectReason && <p className="text-sm text-danger">Lý do từ chối: {item.rejectReason}</p>}
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
                        className={`${smallButton} text-danger`}
                        onClick={async () => (await ask(`Xoá "${item.title}"?`)) && run(() => deleteItem(item.id), `Đã xoá "${item.title}".`)}
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
