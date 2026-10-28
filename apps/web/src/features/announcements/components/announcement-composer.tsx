"use client";

import { ANNOUNCEMENT_CONTENT_MAX, ANNOUNCEMENT_TITLE_MAX, AUDIENCE_NAMES, type Audience } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { createAnnouncement, deleteAnnouncement, getAnnouncementTargets, listSentAnnouncements } from "../api/announcements-api";
import { buttonStyles, EmptyState, FormActions, Skeleton, useConfirm, useToast } from "@/shared/ui";

const smallButton = "rounded-xl border border-border-strong px-3 py-1 text-sm disabled:opacity-50";

// Nội dung gõ dạng văn bản thường: mỗi đoạn (cách nhau bằng dòng trống) thành một <p>, xuống dòng thành <br>.
// Ký tự HTML được thoát; máy chủ vẫn làm sạch lại lần nữa.
function toHtml(text: string): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${escape(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Gửi thông báo: BGH chọn mọi đối tượng; giáo viên chỉ chọn lớp mình dạy hoặc chủ nhiệm. Kèm danh sách đã gửi.
export function AnnouncementComposer() {
  const ask = useConfirm();
  const targets = useData(getAnnouncementTargets, undefined);
  const sent = useData(listSentAnnouncements, undefined);
  const [audience, setAudience] = useState<Audience>("CLASS");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const expires = String(data.get("expiresAt") ?? "");
    setBusy(true);
    setError(null);
    try {
      const a = await createAnnouncement({
        title: String(data.get("title")).trim(),
        content: toHtml(String(data.get("content"))),
        audience,
        gradeLevel: audience === "GRADE" ? Number(data.get("gradeLevel")) : null,
        classId: audience === "CLASS" ? String(data.get("classId")) : null,
        pinned: data.get("pinned") === "on",
        expiresAt: expires ? `${expires}T23:59:59+07:00` : null,
      });
      form.reset();
      toast.success(`Đã gửi "${a.title}" tới ${a.audienceLabel}.`);
      sent.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (targets.error) return <p className={errorClass}>{targets.error}</p>;
  if (!targets.data) return <Skeleton />;
  const t = targets.data;
  const audiences: Audience[] = t.manageAll ? ["SCHOOL", "GRADE", "CLASS", "TEACHERS"] : ["CLASS"];

  return (
    <div className="space-y-6">
      {!t.manageAll && t.classes.length === 0 ? (
        <p className="text-sm text-muted">Bạn chưa dạy hoặc chủ nhiệm lớp nào trong năm học hiện hành nên chưa gửi được thông báo.</p>
      ) : (
        <form onSubmit={onSubmit} className="max-w-2xl space-y-3" aria-label="Gửi thông báo">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span>Gửi tới</span>
              <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className={`${inputClass} w-auto`}>
                {audiences.map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCE_NAMES[a]}
                  </option>
                ))}
              </select>
            </label>
            {audience === "GRADE" && (
              <label className="space-y-1 text-sm">
                <span>Khối</span>
                <select name="gradeLevel" className={`${inputClass} w-auto`}>
                  {t.grades.map((g) => (
                    <option key={g} value={g}>
                      Khối {g}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {audience === "CLASS" && (
              <label className="space-y-1 text-sm">
                <span>Lớp</span>
                <select name="classId" required className={`${inputClass} w-auto`}>
                  {t.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.homeroom ? " (chủ nhiệm)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label className="block space-y-1 text-sm">
            <span>Tiêu đề</span>
            <input name="title" required maxLength={ANNOUNCEMENT_TITLE_MAX} className={inputClass} />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Nội dung (cách một dòng trống để sang đoạn mới)</span>
            <textarea name="content" required rows={6} maxLength={ANNOUNCEMENT_CONTENT_MAX / 2} className={inputClass} />
          </label>
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <label className="space-y-1">
              <span>Hiển thị đến hết ngày (tuỳ chọn)</span>
              <input name="expiresAt" type="date" className={`${inputClass} w-auto`} />
            </label>
            <label className="flex items-center gap-2 pb-2">
              <input name="pinned" type="checkbox" /> Ghim lên đầu
            </label>
          </div>
          {error && <p className={errorClass}>{error}</p>}
          <FormActions>
            <button type="submit" disabled={busy} className={buttonStyles()}>
              {busy ? "Đang gửi…" : "Gửi thông báo"}
            </button>
          </FormActions>
        </form>
      )}

      <section className="space-y-2" aria-labelledby="da-gui">
        <h3 id="da-gui" className="font-semibold">
          {t.manageAll ? "Thông báo đã gửi (toàn trường)" : "Thông báo tôi đã gửi"}
        </h3>
        {sent.error && <p className={errorClass}>{sent.error}</p>}
        {sent.data?.length === 0 && <EmptyState>Chưa có thông báo nào.</EmptyState>}
        <ul className="space-y-2">
          {sent.data?.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border p-2 text-sm">
              <strong>{a.title}</strong>
              <span className="text-muted">
                {a.audienceLabel} · {formatDateTime(a.createdAt)} · {a.createdByName} · {a.readCount} người đã đọc
                {a.pinned && " · ghim"}
                {a.expiresAt && ` · hiện đến ${formatDateTime(a.expiresAt)}`}
              </span>
              <button
                type="button"
                className={smallButton}
                onClick={async () => {
                  if (!(await ask(`Xoá thông báo "${a.title}"?`))) return;
                  deleteAnnouncement(a.id)
                    .then(() => sent.reload())
                    .catch((err) => setError(errorText(err)));
                }}
              >
                Xoá
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
