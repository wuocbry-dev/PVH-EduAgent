"use client";

import { LIBRARY_KIND_NAMES, LIBRARY_SOURCE_NAMES, LIBRARY_STATUS_NAMES, LIBRARY_STATUSES, type LibraryItemDto, type LibraryStatus } from "@pvh/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import {
  deleteCategory,
  deleteItem,
  getFormOptions,
  getStats,
  listCategories,
  listSubmissions,
  reviewItem,
  saveCategory,
} from "../api/library-api";
import { itemPath } from "./library-card";
import { LibraryItemForm } from "./library-item-form";
import { previewItem, smallButton, StatusBadge } from "./library-submissions";

export type LibraryTab = "duyet" | "kho" | "danh-muc" | "thong-ke";
const TAB_NAMES: Record<LibraryTab, string> = { duyet: "Hàng chờ duyệt", kho: "Kho tài liệu", "danh-muc": "Danh mục", "thong-ke": "Thống kê" };

// Quản lý thư viện số (thủ thư, BGH – library:manage): hàng chờ duyệt, kho tài liệu (sửa, ẩn, xoá), danh mục, thống kê lượt.
// Cổng thủ thư mở từng phần ở trang riêng (`tabs` một mục); cổng BGH gộp cả bốn thành thẻ.
export function LibraryManager({ tabs = ["duyet", "kho", "danh-muc", "thong-ke"] }: { tabs?: LibraryTab[] }) {
  const [tab, setTab] = useState<LibraryTab>(tabs[0]);
  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full border px-3 py-1 text-sm ${tab === t ? "border-brand bg-brand text-white" : "border-black/20 dark:border-white/20"}`}
            >
              {TAB_NAMES[t]}
            </button>
          ))}
        </div>
      )}
      {tab === "duyet" && <ReviewQueue />}
      {tab === "kho" && <Catalog />}
      {tab === "danh-muc" && <Categories />}
      {tab === "thong-ke" && <Stats />}
    </div>
  );
}

const queueQuery = { scope: "all" as const, status: "PENDING_REVIEW" as const };

function ReviewQueue() {
  const list = useData(listSubmissions, queueQuery);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function act(item: LibraryItemDto, action: "approve" | "reject") {
    const reason = action === "reject" ? prompt(`Lý do từ chối "${item.title}" (người gửi sẽ thấy):`)?.trim() : undefined;
    if (action === "reject" && !reason) return;
    setError(null);
    try {
      await reviewItem(item.id, action, reason);
      setMessage(action === "approve" ? `Đã duyệt đăng "${item.title}".` : `Đã từ chối "${item.title}".`);
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (list.error) return <p className={errorClass}>{list.error}</p>;
  if (!list.data) return <p className="text-sm opacity-70">Đang tải…</p>;
  return (
    <div className="space-y-3">
      {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
      {error && <p className={errorClass}>{error}</p>}
      {list.data.length === 0 ? (
        <p className="text-sm opacity-70">Không có tài liệu nào chờ duyệt.</p>
      ) : (
        <ul className="space-y-3">
          {list.data.map((item) => (
            <li key={item.id} className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/15">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm opacity-80">
                {LIBRARY_KIND_NAMES[item.kind]} · {item.categoryName} · Dành cho: {item.audienceLabel}
                {item.allowDownload && " · cho tải về"}
              </p>
              <p className="text-sm">
                <span className="opacity-70">Người gửi:</span> {item.submittedByName} · {formatDateTime(item.updatedAt)}
              </p>
              <p className="text-sm">
                <span className="opacity-70">Nguồn:</span> {LIBRARY_SOURCE_NAMES[item.source]} – {item.license}
              </p>
              {item.description && <p className="line-clamp-3 text-sm opacity-80">{item.description}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={smallButton} onClick={() => previewItem(item.id).catch((err) => setError(errorText(err)))}>
                  Xem file
                </button>
                <button type="button" className="rounded bg-green-700 px-3 py-1 text-sm text-white" onClick={() => act(item, "approve")}>
                  Duyệt đăng
                </button>
                <button type="button" className={`${smallButton} text-red-700`} onClick={() => act(item, "reject")}>
                  Từ chối
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Catalog() {
  const options = useData(getFormOptions, undefined);
  const [query, setQuery] = useState<{ scope: "all"; status: LibraryStatus | ""; q: string }>({ scope: "all", status: "", q: "" });
  const list = useData(listSubmissions, query);
  const [editing, setEditing] = useState<LibraryItemDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (editing && options.data) {
    return (
      <LibraryItemForm
        options={options.data}
        item={editing}
        onSaved={() => {
          setEditing(null);
          list.reload();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setQuery({ scope: "all", status: String(data.get("status")) as LibraryStatus | "", q: String(data.get("q")).trim() });
        }}
      >
        <input name="q" type="search" placeholder="Tìm theo tên, tác giả" defaultValue={query.q} className={`${inputClass} sm:w-64`} />
        <select name="status" defaultValue={query.status} className={`${inputClass} sm:w-48`}>
          <option value="">Mọi trạng thái</option>
          {LIBRARY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LIBRARY_STATUS_NAMES[s]}
            </option>
          ))}
        </select>
        <button type="submit" className={smallButton}>
          Lọc
        </button>
      </form>
      {error && <p className={errorClass}>{error}</p>}
      {list.error && <p className={errorClass}>{list.error}</p>}
      {!list.data ? (
        <p className="text-sm opacity-70">Đang tải…</p>
      ) : list.data.length === 0 ? (
        <p className="text-sm opacity-70">Không có tài liệu nào.</p>
      ) : (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/15 dark:border-white/15">
          {list.data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 p-3">
              <StatusBadge status={item.status} />
              <span className="min-w-0 flex-1 break-words">
                <span className="font-medium">{item.title}</span>{" "}
                <span className="text-xs opacity-70">
                  {LIBRARY_KIND_NAMES[item.kind]} · {item.audienceLabel} · {item.viewCount} lượt · {item.submittedByName}
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                {item.status === "PUBLISHED" && (
                  <Link href={itemPath(item.slug)} className={smallButton}>
                    Xem
                  </Link>
                )}
                <button type="button" className={smallButton} onClick={() => setEditing(item)}>
                  Sửa
                </button>
                {item.status === "PUBLISHED" && (
                  <button type="button" className={smallButton} onClick={() => run(() => reviewItem(item.id, "archive"))}>
                    Ẩn
                  </button>
                )}
                {item.status === "ARCHIVED" && (
                  <button type="button" className={smallButton} onClick={() => run(() => reviewItem(item.id, "restore"))}>
                    Hiện lại
                  </button>
                )}
                <button
                  type="button"
                  className={`${smallButton} text-red-700`}
                  onClick={() => confirm(`Xoá hẳn "${item.title}" và file của nó?`) && run(() => deleteItem(item.id))}
                >
                  Xoá
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Categories() {
  const list = useData(listCategories, undefined);
  const [editing, setEditing] = useState<string | null>(null); // id, "new" hoặc null
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    try {
      await saveCategory(editing === "new" ? null : editing, {
        name: String(data.get("name")).trim(),
        slug: String(data.get("slug")).trim() || undefined,
        parentId: String(data.get("parentId")) || null,
        sortOrder: Number(data.get("sortOrder") || 0),
      });
      setEditing(null);
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteCategory(id);
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (list.error) return <p className={errorClass}>{list.error}</p>;
  if (!list.data) return <p className="text-sm opacity-70">Đang tải…</p>;
  const current = list.data.find((c) => c.id === editing);
  const roots = list.data.filter((c) => !c.parentId && c.id !== editing);
  return (
    <div className="space-y-3">
      {error && <p className={errorClass}>{error}</p>}
      {editing ? (
        <form key={editing} onSubmit={onSubmit} className="grid gap-2 rounded-lg border border-black/10 p-3 sm:grid-cols-2 dark:border-white/15">
          <input name="name" required maxLength={100} placeholder="Tên danh mục" defaultValue={current?.name} className={inputClass} />
          <input name="slug" maxLength={120} placeholder="Đường dẫn (để trống: tự tạo)" defaultValue={current?.slug} className={inputClass} />
          <select name="parentId" defaultValue={current?.parentId ?? ""} className={inputClass}>
            <option value="">Danh mục gốc</option>
            {roots.map((c) => (
              <option key={c.id} value={c.id}>
                Thuộc: {c.name}
              </option>
            ))}
          </select>
          <input name="sortOrder" type="number" min={0} max={1000} defaultValue={current?.sortOrder ?? 0} className={inputClass} aria-label="Thứ tự" />
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="rounded bg-brand px-4 py-2 text-sm text-white">
              Lưu
            </button>
            <button type="button" className={smallButton} onClick={() => setEditing(null)}>
              Huỷ
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="rounded bg-brand px-4 py-2 text-sm text-white" onClick={() => setEditing("new")}>
          + Danh mục mới
        </button>
      )}
      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/15 dark:border-white/15">
        {list.data.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 p-3">
            <span className="min-w-0 flex-1">
              {c.parentId && "— "}
              {c.name} <span className="text-xs opacity-60">/{c.slug} · {c.itemCount} tài liệu</span>
            </span>
            <button type="button" className={smallButton} onClick={() => setEditing(c.id)}>
              Sửa
            </button>
            <button type="button" className={`${smallButton} text-red-700`} onClick={() => confirm(`Xoá danh mục "${c.name}"?`) && remove(c.id)}>
              Xoá
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stats() {
  const { data, error } = useData(getStats, undefined);
  if (error) return <p className={errorClass}>{error}</p>;
  if (!data) return <p className="text-sm opacity-70">Đang tải…</p>;
  const tiles: [string, number][] = [
    ["Hôm nay", data.views.today],
    ["Hôm qua", data.views.yesterday],
    ["Tháng này", data.views.thisMonth],
    ["Tháng trước", data.views.lastMonth],
    ["Tổng lượt đọc", data.views.total],
  ];
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-semibold">Lượt đọc, nghe, xem</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-black/10 p-3 dark:border-white/15">
              <dt className="text-sm opacity-70">{label}</dt>
              <dd className="text-2xl font-bold tabular-nums">{value.toLocaleString("vi-VN")}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs opacity-60">Mỗi người mở lại cùng một tài liệu trong 30 phút chỉ tính một lượt. Ngày tính theo giờ Việt Nam.</p>
      </section>
      <p className="text-sm">
        {data.items.published} tài liệu đã đăng · {data.items.pending} chờ duyệt · {data.items.total} tài liệu trong kho
      </p>
      <section className="space-y-2">
        <h2 className="font-semibold">Đọc nhiều nhất</h2>
        {data.top.length === 0 ? (
          <p className="text-sm opacity-70">Chưa có lượt đọc nào.</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-6 text-sm">
            {data.top.map((t) => (
              <li key={t.id}>
                <Link href={itemPath(t.slug)} className="underline">
                  {t.title}
                </Link>{" "}
                <span className="opacity-70">– {t.views.toLocaleString("vi-VN")} lượt</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
