"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

// pdf.js từ gói npm pdfjs-dist (đúng phiên bản trong package.json), worker được bundler đóng gói cùng trang:
// không tải script từ nguồn ngoài.
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  }
  return pdfjs;
}

interface Props {
  url: string; // URL đọc đã ký, hết hạn sau vài phút: tải trọn file một lần nên đọc lâu không bị đứt
  initialPage: number;
  onPage: (page: number) => void;
}

const navButton = "rounded border border-black/20 px-3 py-1 disabled:opacity-40 dark:border-white/20";

// Trình đọc PDF trong trang: từng trang vẽ lên canvas vừa bề ngang khung (dùng tốt ở 375 px), chuyển trang, phóng to.
export function PdfViewer({ url, initialPage, onPage }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(Math.max(1, Math.round(initialPage)));
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) throw new Error(`Không tải được tài liệu (mã ${res.status})`);
      const data = new Uint8Array(await res.arrayBuffer());
      const pdfjs = await loadPdfjs();
      loaded = await pdfjs.getDocument({ data }).promise;
      if (!current) return void loaded.loadingTask.destroy();
      setDoc(loaded);
      setPage((p) => Math.min(p, loaded!.numPages));
    })().catch((err: unknown) => current && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      current = false;
      void loaded?.loadingTask.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!doc || !canvas.current || width === 0) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    void doc.getPage(page).then((p) => {
      if (cancelled || !canvas.current) return;
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: (width / base.width) * zoom });
      const ratio = window.devicePixelRatio || 1;
      const c = canvas.current;
      c.width = Math.floor(viewport.width * ratio);
      c.height = Math.floor(viewport.height * ratio);
      c.style.width = `${Math.floor(viewport.width)}px`;
      c.style.height = `${Math.floor(viewport.height)}px`;
      task = p.render({ canvas: c, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      task.promise.catch(() => undefined);
    });
    onPage(page);
    return () => {
      cancelled = true;
      task?.cancel();
    };
    // onPage là callback của cha, không cần vẽ lại khi nó đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, width, zoom]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  const total = doc?.numPages ?? 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className={navButton} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ← Trước
        </button>
        <label className="flex items-center gap-1">
          Trang
          <input
            type="number"
            min={1}
            max={total || 1}
            value={page}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 1 && n <= total) setPage(n);
            }}
            className="w-16 rounded border border-black/20 bg-transparent px-2 py-1 dark:border-white/20"
          />
          / {total || "…"}
        </label>
        <button type="button" className={navButton} disabled={!total || page >= total} onClick={() => setPage((p) => p + 1)}>
          Sau →
        </button>
        <span className="ml-auto flex gap-1">
          <button type="button" className={navButton} aria-label="Thu nhỏ" disabled={zoom <= 0.5} onClick={() => setZoom((z) => z - 0.25)}>
            −
          </button>
          <button type="button" className={navButton} aria-label="Phóng to" disabled={zoom >= 3} onClick={() => setZoom((z) => z + 0.25)}>
            +
          </button>
        </span>
      </div>
      <div ref={box} className="max-h-[80vh] overflow-auto rounded border border-black/10 bg-neutral-100 dark:border-white/15 dark:bg-neutral-900">
        {!doc && <p className="p-4 text-sm opacity-70">Đang tải tài liệu…</p>}
        <canvas ref={canvas} className="mx-auto block bg-white" aria-label={`Trang ${page} của tài liệu`} />
      </div>
    </div>
  );
}
