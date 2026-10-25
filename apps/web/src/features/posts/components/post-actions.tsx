"use client";

import type { PostDto } from "@pvh/shared";
import { useState } from "react";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { deletePost, runPostAction } from "../api/posts-api";

interface Props {
  post: PostDto;
  onChanged: (post: PostDto) => void;
  onDeleted: () => void;
}

type Panel = "reject" | "approve-schedule" | "reschedule" | null;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const secondaryButton = "rounded border border-black/20 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/20";
const primaryButton = "rounded bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50";

// Các nút thao tác theo `post.actions` (server đã lọc theo quyền và trạng thái).
export function PostActions({ post, onChanged, onDeleted }: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const can = (action: PostDto["actions"][number]) => post.actions.includes(action);

  async function run(task: () => Promise<PostDto | void>) {
    setPending(true);
    setError(null);
    try {
      const result = await task();
      setPanel(null);
      setValue("");
      if (result) onChanged(result);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  const act = (action: Parameters<typeof runPostAction>[1], body?: Parameters<typeof runPostAction>[2]) =>
    run(() => runPostAction(post.id, action, body));

  const open = (next: Exclude<Panel, null>) => {
    setPanel(next);
    setValue("");
    setError(null);
  };

  // datetime-local trả giờ địa phương (không kèm múi giờ); đổi sang ISO UTC để gửi lên server.
  const publishAtIso = () => (value ? new Date(value).toISOString() : "");

  function confirmDelete() {
    const permanent = post.status !== "DRAFT";
    const message = permanent
      ? `Xóa vĩnh viễn bài "${post.title}"? Không thể khôi phục.`
      : `Xóa bài nháp "${post.title}"?`;
    if (confirm(message)) run(async () => deletePost(post.id).then(onDeleted));
  }

  if (post.actions.length === 0) return null;

  return (
    <div className="space-y-3 rounded border border-black/10 p-3 dark:border-white/15">
      <div className="flex flex-wrap gap-2">
        {can("submit") && (
          <button type="button" disabled={pending} className={primaryButton} onClick={() => act("submit")}>
            Gửi duyệt
          </button>
        )}
        {can("approve") && (
          <>
            <button
              type="button"
              disabled={pending}
              className={primaryButton}
              onClick={() => confirm("Duyệt và đăng ngay bài này?") && act("approve")}
            >
              Duyệt &amp; đăng ngay
            </button>
            <button type="button" disabled={pending} className={secondaryButton} onClick={() => open("approve-schedule")}>
              Duyệt &amp; hẹn giờ
            </button>
          </>
        )}
        {can("reject") && (
          <button type="button" disabled={pending} className={secondaryButton} onClick={() => open("reject")}>
            Từ chối
          </button>
        )}
        {can("reschedule") && (
          <button type="button" disabled={pending} className={secondaryButton} onClick={() => open("reschedule")}>
            Dời lịch
          </button>
        )}
        {can("publish") && (
          <button
            type="button"
            disabled={pending}
            className={primaryButton}
            onClick={() => confirm("Đăng bài ngay bây giờ?") && act("publish")}
          >
            Đăng ngay
          </button>
        )}
        {can("cancel_schedule") && (
          <button type="button" disabled={pending} className={secondaryButton} onClick={() => act("cancel_schedule")}>
            Hủy lịch
          </button>
        )}
        {can("unpublish") && (
          <button
            type="button"
            disabled={pending}
            className={secondaryButton}
            onClick={() => confirm("Gỡ bài này khỏi trang công khai?") && act("unpublish")}
          >
            Gỡ bài
          </button>
        )}
        {can("restore") && (
          <button type="button" disabled={pending} className={secondaryButton} onClick={() => act("restore")}>
            Khôi phục về nháp
          </button>
        )}
        {can("delete") && (
          <button type="button" disabled={pending} className={`${secondaryButton} text-red-600`} onClick={confirmDelete}>
            {post.status === "DRAFT" ? "Xóa nháp" : "Xóa vĩnh viễn"}
          </button>
        )}
      </div>

      {panel === "reject" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 space-y-1 text-sm">
            <span>Lý do từ chối (gửi cho tác giả)</span>
            <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={2} className={inputClass} />
          </label>
          <button
            type="button"
            disabled={pending || !value.trim()}
            className={primaryButton}
            onClick={() => act("reject", { reason: value.trim() })}
          >
            Xác nhận từ chối
          </button>
        </div>
      )}

      {(panel === "approve-schedule" || panel === "reschedule") && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span>Thời điểm đăng</span>
            <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
          </label>
          <button
            type="button"
            disabled={pending || !value}
            className={primaryButton}
            onClick={() => act(panel === "reschedule" ? "reschedule" : "approve", { publishAt: publishAtIso() })}
          >
            {panel === "reschedule" ? "Xác nhận dời lịch" : "Xác nhận duyệt & hẹn giờ"}
          </button>
        </div>
      )}

      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}
