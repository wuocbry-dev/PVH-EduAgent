"use client";

import type { LibraryAccessDto, LibraryItemDto } from "@pvh/shared";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/shared/lib/api-client";
import { mediaSrc } from "@/shared/lib/media-url";
import { errorText } from "@/shared/lib/use-data";
import { accessItem, saveProgress, setFavorite } from "../api/library-api";
import { PdfViewer } from "./pdf-viewer";

const ACTION: Record<LibraryItemDto["kind"], string> = { PDF: "Đọc", AUDIO: "Nghe", VIDEO: "Xem" };
const SAVE_EVERY_MS = 15_000;
const button = "rounded px-4 py-2 text-sm disabled:opacity-50";

const clock = (sec: number) => {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s % 60).padStart(2, "0")}`;
};

// Đọc/nghe/xem tài liệu. Chưa đăng nhập thì chuyển tới /dang-nhap?next=… (API trả 401). URL đọc hết hạn sau vài phút:
// trình phát âm thanh/video xin URL mới khi lỗi rồi phát tiếp đúng chỗ. Tiến độ (trang hoặc giây) được lưu để "đọc tiếp".
export function LibraryReader({ item }: { item: LibraryItemDto }) {
  const router = useRouter();
  const pathname = usePathname();
  const [access, setAccess] = useState<LibraryAccessDto | null>(null);
  const [favorite, setFav] = useState(item.favorite ?? false);
  const [position, setPosition] = useState(item.position ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const media = useRef<HTMLMediaElement | null>(null);
  const lastSaved = useRef(0);
  const resumeAt = useRef<number | null>(null);

  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) router.push(`/dang-nhap?next=${encodeURIComponent(pathname)}`);
      else setError(errorText(err));
    },
    [router, pathname],
  );

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await accessItem(item.id);
      resumeAt.current = res.position;
      setPosition(res.position);
      setAccess(res);
    } catch (err) {
      handle(err);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setError(null);
    try {
      const res = await accessItem(item.id, true);
      window.location.href = mediaSrc(res.url);
    } catch (err) {
      handle(err);
    }
  }

  async function toggleFavorite() {
    setError(null);
    try {
      await setFavorite(item.id, !favorite);
      setFav(!favorite);
    } catch (err) {
      handle(err);
    }
  }

  const save = useCallback(
    (value: number, force = false) => {
      const now = Date.now();
      if (!force && now - lastSaved.current < SAVE_EVERY_MS) return;
      lastSaved.current = now;
      setPosition(value);
      saveProgress(item.id, value).catch(() => undefined);
    },
    [item.id],
  );

  // Lưu vị trí khi rời trang.
  useEffect(() => {
    const el = () => media.current;
    return () => {
      const m = el();
      if (m && m.currentTime > 0) saveProgress(item.id, Math.floor(m.currentTime)).catch(() => undefined);
    };
  }, [item.id, access]);

  // URL hết hạn giữa chừng (trình phát gọi lại máy chủ để tua): xin URL mới, phát tiếp từ chỗ đang nghe.
  async function onMediaError() {
    const m = media.current;
    if (!m || !access) return;
    resumeAt.current = m.currentTime || resumeAt.current;
    try {
      setAccess(await accessItem(item.id));
    } catch (err) {
      handle(err);
    }
  }

  const resumeLabel =
    position && position > 0 ? (item.kind === "PDF" ? `Đọc tiếp (trang ${Math.round(position)})` : `${ACTION[item.kind]} tiếp (${clock(position)})`) : null;

  return (
    <section aria-label="Đọc tài liệu" className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!access && (
          <button type="button" onClick={open} disabled={busy || !item.hasFile} className={`${button} bg-brand text-white`}>
            {busy ? "Đang mở…" : (resumeLabel ?? `${ACTION[item.kind]} ngay`)}
          </button>
        )}
        {item.allowDownload && (
          <button type="button" onClick={download} className={`${button} border border-black/20 dark:border-white/20`}>
            Tải về
          </button>
        )}
        <button type="button" onClick={toggleFavorite} aria-pressed={favorite} className={`${button} border border-black/20 dark:border-white/20`}>
          {favorite ? "♥ Đã yêu thích" : "♡ Yêu thích"}
        </button>
      </div>
      {item.favorite === undefined && !access && <p className="text-sm opacity-70">Cần đăng nhập để đọc, nghe hoặc xem tài liệu.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {access && item.kind === "PDF" && (
        <PdfViewer url={mediaSrc(access.url)} initialPage={access.position ?? 1} onPage={(p) => save(p, true)} />
      )}
      {access && item.kind !== "PDF" && (
        <MediaPlayer
          kind={item.kind}
          src={mediaSrc(access.url)}
          title={item.title}
          bind={(el) => (media.current = el)}
          onReady={(el) => {
            if (resumeAt.current && resumeAt.current > 0 && resumeAt.current < el.duration - 2) el.currentTime = resumeAt.current;
          }}
          onTime={(t) => save(Math.floor(t))}
          onPause={(t) => save(Math.floor(t), true)}
          onError={onMediaError}
        />
      )}
    </section>
  );
}

interface PlayerProps {
  kind: "AUDIO" | "VIDEO";
  src: string;
  title: string;
  bind: (el: HTMLMediaElement | null) => void;
  onReady: (el: HTMLMediaElement) => void;
  onTime: (time: number) => void;
  onPause: (time: number) => void;
  onError: () => void;
}

function MediaPlayer({ kind, src, title, bind, onReady, onTime, onPause, onError }: PlayerProps) {
  const common = {
    src,
    controls: true,
    preload: "metadata" as const,
    controlsList: "nodownload",
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => onReady(e.currentTarget),
    onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => onTime(e.currentTarget.currentTime),
    onPause: (e: React.SyntheticEvent<HTMLMediaElement>) => onPause(e.currentTarget.currentTime),
    onError,
    "aria-label": title,
  };
  return kind === "AUDIO" ? (
    <audio ref={bind} {...common} className="w-full" />
  ) : (
    <video ref={bind} {...common} playsInline className="aspect-video w-full rounded bg-black" />
  );
}
