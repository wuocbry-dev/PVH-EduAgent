"use client";

import { AUDIT_CHANNEL_NAMES, AUDIT_CHANNELS, type AuditFiltersDto, type AuditLogDto } from "@pvh/shared";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { getAuditFilters, listAuditLogs, type AuditFilters } from "../api/audit-api";

const EMPTY: AuditFilters = { userId: "", channel: "", action: "", from: "", to: "" };
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// F16 – nhật ký hoạt động: lọc, xem payload JSON, phân trang theo con trỏ ("Tải thêm").
export function AuditLogViewer() {
  const [draft, setDraft] = useState(EMPTY);
  // Bộ lọc đang áp dụng (chỉ đổi khi bấm Lọc để không gọi API theo từng phím gõ).
  const [filters, setFilters] = useState(EMPTY);
  const [options, setOptions] = useState<AuditFiltersDto>({ users: [], actions: [] });
  const [items, setItems] = useState<AuditLogDto[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getAuditFilters()
      .then((data) => current && setOptions(data))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    listAuditLogs(filters)
      .then((page) => {
        if (!current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setError(null);
      })
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, [filters]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await listAuditLogs(filters, nextCursor);
      setItems((cur) => [...(cur ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoadingMore(false);
    }
  }

  const set = (patch: Partial<AuditFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const label = "space-y-1 text-xs";

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setItems(null);
          setFilters(draft);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className={label}>
          <span className="block">Người dùng</span>
          <select value={draft.userId} onChange={(e) => set({ userId: e.target.value })} className={`${inputClass} w-auto`}>
            <option value="">Tất cả</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className="block">Kênh</span>
          <select value={draft.channel} onChange={(e) => set({ channel: e.target.value })} className={`${inputClass} w-auto`}>
            <option value="">Tất cả</option>
            {AUDIT_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {AUDIT_CHANNEL_NAMES[c]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className="block">Action (gõ một phần tên)</span>
          <input
            list="audit-actions"
            value={draft.action}
            onChange={(e) => set({ action: e.target.value })}
            placeholder="vd. post. hoặc agent:"
            maxLength={80}
            className={`${inputClass} w-52`}
          />
          <datalist id="audit-actions">
            {options.actions.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label className={label}>
          <span className="block">Từ</span>
          <input type="datetime-local" value={draft.from} onChange={(e) => set({ from: e.target.value })} className={`${inputClass} w-auto`} />
        </label>
        <label className={label}>
          <span className="block">Đến</span>
          <input type="datetime-local" value={draft.to} onChange={(e) => set({ to: e.target.value })} className={`${inputClass} w-auto`} />
        </label>
        <button type="submit" className="rounded bg-foreground px-4 py-2 text-background">
          Lọc
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY);
            setItems(null);
            setFilters(EMPTY);
          }}
          className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20"
        >
          Xóa lọc
        </button>
      </form>

      {error && <p className={errorClass}>{error}</p>}
      {items === null && !error && <p className="text-sm opacity-60">Đang tải…</p>}

      {items && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-black/10 dark:border-white/15">
                <tr>
                  <th className="py-2 pr-4">Thời gian</th>
                  <th className="py-2 pr-4">Người dùng</th>
                  <th className="py-2 pr-4">Kênh</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Đối tượng</th>
                  <th className="py-2 pr-4">IP</th>
                  <th className="py-2">Kết quả / chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/15">
                {items.map((row) => {
                  const payload = row.payload as { ok?: boolean; error?: string } | null;
                  const failed = payload?.ok === false;
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="whitespace-nowrap py-2 pr-4">{formatDateTime(row.createdAt)}</td>
                      <td className="py-2 pr-4">{row.userName ?? <span className="opacity-50">—</span>}</td>
                      <td className="py-2 pr-4">
                        {AUDIT_CHANNEL_NAMES[row.channel as keyof typeof AUDIT_CHANNEL_NAMES] ?? row.channel}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{row.action}</td>
                      <td className="py-2 pr-4 text-xs">{row.targetType ? `${row.targetType} #${row.targetId ?? "?"}` : "—"}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{row.ip ?? "—"}</td>
                      <td className="py-2">
                        <span className={failed ? "font-semibold text-red-600" : "text-green-700"}>
                          {failed ? "Lỗi" : "Thành công"}
                        </span>
                        {failed && payload?.error && <span className="block text-xs text-red-600">{payload.error}</span>}
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs underline">Payload JSON</summary>
                          <pre className="mt-1 max-w-md overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/10">
                            {JSON.stringify(row.payload, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 opacity-70">
                      Không có bản ghi phù hợp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="opacity-70">Đang hiển thị {items.length} bản ghi mới nhất theo bộ lọc</span>
            {nextCursor ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20"
              >
                {loadingMore ? "Đang tải…" : "Tải thêm"}
              </button>
            ) : (
              items.length > 0 && <span className="opacity-70">Đã hết.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
