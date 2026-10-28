"use client";

import type { InboxItemDto } from "@pvh/shared";
import Link from "next/link";
import { useState } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass } from "@/shared/ui/form-styles";
import { getInbox, markRead } from "../api/announcements-api";
import { EmptyState, Skeleton } from "@/shared/ui";

const smallButton = "rounded-xl border border-border-strong px-3 py-1 text-sm disabled:opacity-50";

const readBody = (item: InboxItemDto) =>
  item.kind === "ANNOUNCEMENT" ? { announcementIds: [item.id] } : { notificationIds: [item.id] };

function InboxEntry({ item, onOpen }: { item: InboxItemDto; onOpen: (item: InboxItemDto) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`rounded-xl border p-3 ${item.read ? "border-border " : "border-primary-soft-border bg-primary-soft/40"}`}>
      <button
        type="button"
        className="w-full text-left"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!item.read) onOpen(item);
        }}
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          {!item.read && <span className="text-xs font-semibold text-primary">Mới</span>}
          {item.pinned && <span className="text-xs font-semibold text-warning">Ghim</span>}
          <strong className="text-base">{item.title}</strong>
        </span>
        <span className="block text-sm text-muted">
          {formatDateTime(item.createdAt)}
          {item.senderName && ` · ${item.senderName}`}
          {item.audienceLabel && ` · ${item.audienceLabel}`}
          {item.kind === "NOTIFICATION" && " · Thông báo hệ thống"}
        </span>
      </button>
      {open &&
        (item.kind === "ANNOUNCEMENT" ? (
          // Nội dung đã được máy chủ làm sạch (sanitizeContent) trước khi lưu.
          <div className="rich-content mt-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: item.body }} />
        ) : (
          <p className="mt-2 whitespace-pre-line">{item.body}</p>
        ))}
    </li>
  );
}

// Hộp thông báo: thông báo đúng đối tượng (trường, khối, lớp, nhân sự) và thông báo hệ thống của chính mình.
// Mở một mục thì đánh dấu đã đọc. `limit`: chỉ hiện vài mục mới nhất (trang chủ).
export function Inbox({ limit, moreHref }: { limit?: number; moreHref?: string }) {
  const inbox = useData(getInbox, undefined);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      inbox.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (inbox.error) return <p className={errorClass}>{inbox.error}</p>;
  if (!inbox.data) return <Skeleton />;
  const items = limit ? inbox.data.items.slice(0, limit) : inbox.data.items;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          {inbox.data.unread > 0 ? (
            <>
              Có <strong>{inbox.data.unread}</strong> thông báo chưa đọc
            </>
          ) : (
            "Không có thông báo chưa đọc"
          )}
        </span>
        {!limit && inbox.data.unread > 0 && (
          <button type="button" className={smallButton} onClick={() => void run(() => markRead({ all: true }))}>
            Đánh dấu tất cả đã đọc
          </button>
        )}
        {moreHref && (
          <Link href={moreHref} className="underline">
            Xem tất cả
          </Link>
        )}
      </div>
      {error && <p className={errorClass}>{error}</p>}
      {items.length === 0 ? (
        <EmptyState>Chưa có thông báo nào.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <InboxEntry key={`${item.kind}-${item.id}`} item={item} onOpen={(i) => void run(() => markRead(readBody(i)))} />
          ))}
        </ul>
      )}
    </div>
  );
}
