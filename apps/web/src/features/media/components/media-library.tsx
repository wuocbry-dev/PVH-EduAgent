"use client";

import {
  MEDIA_IMAGE_MAX_BYTES,
  MEDIA_MIME_TYPES,
  MEDIA_VIDEO_MAX_BYTES,
  type MediaDto,
  type MediaKind,
} from "@pvh/shared";
import { useEffect, useState, type ChangeEvent } from "react";
import { mediaSrc } from "@/shared/lib/media-url";
import { errorClass } from "@/shared/ui/form-styles";
import { deleteMedia, listMedia, uploadMedia } from "../api/media-api";
import { EmptyState, Skeleton, useConfirm } from "@/shared/ui";

interface Props {
  // Giới hạn loại được chọn/tải lên (ảnh đại diện chỉ nhận ảnh); bỏ trống = cả ảnh và video.
  kind?: MediaKind;
  onSelect: (media: MediaDto) => void;
  onClose: () => void;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const FILTERS: { value: MediaKind | "ALL"; label: string }[] = [
  { value: "ALL", label: "Tất cả" },
  { value: "IMAGE", label: "Ảnh" },
  { value: "VIDEO", label: "Video" },
];

// Thư viện ảnh/video: tải file mới lên (có thanh tiến độ) hoặc bấm một file có sẵn để chọn.
export function MediaLibrary({ kind, onSelect, onClose }: Props) {
  const ask = useConfirm();
  const [items, setItems] = useState<MediaDto[] | null>(null);
  const [filter, setFilter] = useState<MediaKind | "ALL">(kind ?? "ALL");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    listMedia(filter === "ALL" ? undefined : filter)
      .then((data) => current && setItems(data))
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, [filter]);

  const accept = MEDIA_MIME_TYPES.filter((m) => !kind || m.startsWith(kind === "IMAGE" ? "image/" : "video/"));

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    setError(null);
    setProgress(0);
    try {
      const media = await uploadMedia(file, setProgress);
      setItems((cur) => (filter === "ALL" || filter === media.kind ? [media, ...(cur ?? [])] : cur));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setProgress(null);
    }
  }

  async function onDelete(media: MediaDto) {
    if (!(await ask("Xoá file này khỏi thư viện?"))) return;
    setError(null);
    try {
      await deleteMedia(media.id);
      setItems((cur) => cur?.filter((m) => m.id !== media.id) ?? cur);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{kind === "IMAGE" ? "Thư viện ảnh" : "Thư viện ảnh và video"}</h3>
        <button type="button" onClick={onClose} className="text-sm underline">
          Đóng
        </button>
      </div>
      <label className="block text-sm">
        <span className="mr-2">
          {kind === "IMAGE"
            ? `Tải ảnh lên (JPEG, PNG, WebP, GIF; tối đa ${MEDIA_IMAGE_MAX_BYTES / 1024 / 1024} MB):`
            : `Tải lên ảnh (JPEG, PNG, WebP, GIF; tối đa ${MEDIA_IMAGE_MAX_BYTES / 1024 / 1024} MB) hoặc video (MP4, WebM; tối đa ${MEDIA_VIDEO_MAX_BYTES / 1024 / 1024} MB):`}
        </span>
        <input type="file" accept={accept.join(",")} disabled={progress !== null} onChange={onFile} />
      </label>
      {progress !== null && (
        <div className="space-y-1" role="status">
          <progress value={progress} max={100} className="w-full" aria-label="Tiến độ tải lên" />
          <p className="text-sm text-muted">{progress < 100 ? `Đang tải lên… ${progress}%` : "Đang kiểm tra file…"}</p>
        </div>
      )}
      {error && <p className={errorClass}>{error}</p>}
      {!kind && (
        <div className="flex gap-1 text-sm" role="tablist" aria-label="Lọc theo loại">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => {
                setItems(null);
                setFilter(f.value);
              }}
              className={`rounded-xl px-2 py-1 ${filter === f.value ? "bg-primary text-primary-foreground" : "border border-border-strong"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {items === null && !error && <Skeleton />}
      {items?.length === 0 && <EmptyState>Chưa có file nào.</EmptyState>}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {items?.map((media) => (
          <li key={media.id} className="relative">
            <button
              type="button"
              onClick={() => onSelect(media)}
              title={media.kind === "VIDEO" ? "Chèn video" : "Chèn ảnh"}
              className="block aspect-square w-full overflow-hidden rounded-xl border border-border hover:ring-2"
            >
              {media.kind === "VIDEO" ? (
                <>
                  <video src={mediaSrc(media.url)} preload="metadata" muted className="h-full w-full object-cover" />
                  <span className="absolute bottom-1 left-1 rounded-xl bg-black/70 px-1 text-xs text-white">▶ Video</span>
                </>
              ) : (
                // Ảnh từ API/R2 khác nguồn gốc; không dùng next/image để khỏi phải khai báo remotePatterns.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaSrc(media.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onDelete(media)}
              title="Xoá file"
              aria-label="Xoá file"
              className="absolute right-1 top-1 rounded-xl bg-black/70 px-1.5 text-xs text-white"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
