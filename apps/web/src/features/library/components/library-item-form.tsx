"use client";

import {
  LIBRARY_AUDIENCE_NAMES,
  LIBRARY_AUDIENCES,
  LIBRARY_KIND_NAMES,
  LIBRARY_KINDS,
  LIBRARY_MAX_BYTES,
  LIBRARY_SOURCE_NAMES,
  LIBRARY_SOURCES,
  type LibraryAudience,
  type LibraryFormOptionsDto,
  type LibraryItemDto,
  type LibraryKind,
} from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { errorText } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { createItem, updateItem, uploadItemFile, type ItemInput } from "../api/library-api";

interface Props {
  options: LibraryFormOptionsDto;
  item: LibraryItemDto | null; // null = tạo mới
  onSaved: (item: LibraryItemDto) => void;
  onCancel: () => void;
}

const label = "block space-y-1 text-sm";
const ACCEPT: Record<LibraryKind, string> = { PDF: "application/pdf", AUDIO: "audio/mpeg", VIDEO: "video/mp4,video/webm" };

// Soạn/sửa tài liệu: thông tin, NGUỒN VÀ GIẤY PHÉP (bắt buộc), đối tượng xem, cho phép tải về; tải file và ảnh bìa
// (lưu thông tin trước để có mã tài liệu, rồi mới tải file).
export function LibraryItemForm({ options, item, onSaved, onCancel }: Props) {
  const [current, setCurrent] = useState(item);
  const [kind, setKind] = useState<LibraryKind>(item?.kind ?? "PDF");
  const [audience, setAudience] = useState<LibraryAudience>(item?.audience ?? "ALL");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim() || null;
    const input: ItemInput = {
      title: text("title") ?? "",
      author: text("author"),
      publisher: text("publisher"),
      publishYear: text("publishYear") ? Number(text("publishYear")) : null,
      description: text("description"),
      kind,
      categoryId: String(data.get("categoryId")),
      subjectId: text("subjectId"),
      gradeLevel: text("gradeLevel") ? Number(text("gradeLevel")) : null,
      source: String(data.get("source") ?? ""),
      license: text("license") ?? "",
      allowDownload: data.get("allowDownload") === "on",
      audience,
      gradeLevels: data.getAll("gradeLevels").map(Number),
      classIds: data.getAll("classIds").map(String),
    };
    const file = data.get("file");
    const cover = data.get("cover");
    setBusy(true);
    setError(null);
    try {
      let saved = current ? await updateItem(current.id, input) : await createItem(input);
      setCurrent(saved);
      if (cover instanceof File && cover.size > 0) {
        setProgress("Đang tải ảnh bìa…");
        saved = await uploadItemFile(saved.id, "cover", cover, kind);
      }
      if (file instanceof File && file.size > 0) {
        saved = await uploadItemFile(saved.id, "file", file, kind, (p) => setProgress(`Đang tải file lên: ${p}%`));
      }
      onSaved(saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-lg font-semibold">{current ? `Sửa: ${current.title}` : "Tài liệu mới"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}>
          <span>Tên tài liệu *</span>
          <input name="title" required maxLength={200} defaultValue={item?.title} className={inputClass} />
        </label>
        <label className={label}>
          <span>Loại *</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as LibraryKind)} disabled={!!current?.hasFile} className={inputClass}>
            {LIBRARY_KINDS.map((k) => (
              <option key={k} value={k}>
                {LIBRARY_KIND_NAMES[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span>Danh mục *</span>
          <select name="categoryId" required defaultValue={item?.categoryId} className={inputClass}>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `— ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span>Tác giả</span>
          <input name="author" maxLength={200} defaultValue={item?.author ?? ""} className={inputClass} />
        </label>
        <label className={label}>
          <span>Nhà xuất bản</span>
          <input name="publisher" maxLength={200} defaultValue={item?.publisher ?? ""} className={inputClass} />
        </label>
        <label className={label}>
          <span>Năm xuất bản</span>
          <input name="publishYear" type="number" min={1800} max={2200} defaultValue={item?.publishYear ?? ""} className={inputClass} />
        </label>
        <label className={label}>
          <span>Môn học</span>
          <select name="subjectId" defaultValue={item?.subjectId ?? ""} className={inputClass}>
            <option value="">Không gắn môn</option>
            {options.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span>Khối liên quan</span>
          <select name="gradeLevel" defaultValue={item?.gradeLevel ?? ""} className={inputClass}>
            <option value="">Không gắn khối</option>
            {options.grades.map((g) => (
              <option key={g} value={g}>
                Khối {g}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
          <span>Mô tả</span>
          <textarea name="description" rows={3} maxLength={5000} defaultValue={item?.description ?? ""} className={inputClass} />
        </label>
      </div>

      <fieldset className="space-y-3 rounded border border-amber-300 p-3 dark:border-amber-700">
        <legend className="px-1 text-sm font-semibold">Nguồn và giấy phép (bắt buộc)</legend>
        <p className="text-xs opacity-80">Chỉ đăng tài liệu nhà trường được phép chia sẻ. Ghi rõ xuất xứ để thủ thư kiểm tra khi duyệt.</p>
        <label className={label}>
          <span>Nguồn *</span>
          <select name="source" required defaultValue={item?.source ?? ""} className={inputClass}>
            <option value="" disabled>
              Chọn nguồn
            </option>
            {LIBRARY_SOURCES.map((s) => (
              <option key={s} value={s}>
                {LIBRARY_SOURCE_NAMES[s]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span>Giấy phép, xuất xứ *</span>
          <input
            name="license"
            required
            minLength={5}
            maxLength={500}
            defaultValue={item?.license ?? ""}
            placeholder="Vd. Tổ Toán biên soạn năm 2026; hoặc CC BY 4.0 – nguồn …"
            className={inputClass}
          />
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Ai được xem</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {LIBRARY_AUDIENCES.map((a) => (
            <label key={a} className="flex items-center gap-1">
              <input type="radio" checked={audience === a} onChange={() => setAudience(a)} />
              {LIBRARY_AUDIENCE_NAMES[a]}
            </label>
          ))}
        </div>
        {audience === "GRADE" && (
          <div className="flex flex-wrap gap-3 text-sm">
            {options.grades.map((g) => (
              <label key={g} className="flex items-center gap-1">
                <input type="checkbox" name="gradeLevels" value={g} defaultChecked={item?.gradeLevels.includes(g)} />
                Khối {g}
              </label>
            ))}
          </div>
        )}
        {audience === "CLASS" && (
          <div className="flex max-h-40 flex-wrap gap-3 overflow-auto text-sm">
            {options.classes.map((c) => (
              <label key={c.id} className="flex items-center gap-1">
                <input type="checkbox" name="classIds" value={c.id} defaultChecked={item?.classIds.includes(c.id)} />
                {c.name}
              </label>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allowDownload" defaultChecked={item?.allowDownload} />
          Cho phép tải về (mặc định chỉ đọc trong trang)
        </label>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          <span>
            File tài liệu {current?.hasFile ? "(đã có – chọn file khác để thay)" : "*"} – tối đa {LIBRARY_MAX_BYTES[kind] / 1024 / 1024} MB
          </span>
          <input name="file" type="file" accept={ACCEPT[kind]} className="block w-full text-sm" />
        </label>
        <label className={label}>
          <span>Ảnh bìa (JPEG, PNG, WebP)</span>
          <input name="cover" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="block w-full text-sm" />
        </label>
      </div>

      {progress && <p className="text-sm opacity-80">{progress}</p>}
      {error && <p className={errorClass}>{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "Đang lưu…" : "Lưu"}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-black/20 px-4 py-2 text-sm dark:border-white/20">
          Đóng
        </button>
      </div>
    </form>
  );
}
