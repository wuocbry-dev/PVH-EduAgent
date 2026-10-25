"use client";

import { MEDIA_MAX_BYTES, MEDIA_MIME_TYPES, type MediaDto } from "@pvh/shared";
import { useEffect, useState, type ChangeEvent } from "react";
import { mediaSrc } from "@/shared/lib/media-url";
import { errorClass } from "@/shared/ui/form-styles";
import { listMedia, uploadMedia } from "../api/media-api";

interface Props {
  onSelect: (media: MediaDto) => void;
  onClose: () => void;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Thư viện ảnh: tải ảnh mới lên hoặc bấm một ảnh có sẵn để chọn.
export function MediaLibrary({ onSelect, onClose }: Props) {
  const [items, setItems] = useState<MediaDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let current = true;
    listMedia()
      .then((data) => current && setItems(data))
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, []);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    if (file.size > MEDIA_MAX_BYTES) {
      setError(`Ảnh vượt quá ${MEDIA_MAX_BYTES / 1024 / 1024} MB`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const media = await uploadMedia(file);
      setItems((cur) => [media, ...(cur ?? [])]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3 rounded border border-black/10 p-4 dark:border-white/15">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Thư viện ảnh</h3>
        <button type="button" onClick={onClose} className="text-sm underline">
          Đóng
        </button>
      </div>
      <label className="block text-sm">
        <span className="mr-2">Tải ảnh lên (JPEG, PNG, WebP, GIF; tối đa 5 MB):</span>
        <input type="file" accept={MEDIA_MIME_TYPES.join(",")} disabled={uploading} onChange={onFile} />
      </label>
      {uploading && <p className="text-sm opacity-60">Đang tải lên…</p>}
      {error && <p className={errorClass}>{error}</p>}
      {items === null && !error && <p className="text-sm opacity-60">Đang tải…</p>}
      {items?.length === 0 && <p className="text-sm opacity-70">Chưa có ảnh nào.</p>}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {items?.map((media) => (
          <li key={media.id}>
            <button
              type="button"
              onClick={() => onSelect(media)}
              className="block aspect-square w-full overflow-hidden rounded border border-black/10 hover:ring-2 dark:border-white/15"
            >
              {/* Ảnh từ API khác nguồn gốc; không dùng next/image để khỏi phải khai báo remotePatterns. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaSrc(media.url)} alt="" className="h-full w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
