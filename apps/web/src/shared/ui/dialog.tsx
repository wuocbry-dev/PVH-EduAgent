"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "./cn";

// Hộp thoại dùng <dialog> gốc mở bằng showModal(): phần còn lại của trang thành inert (focus không ra ngoài được),
// Esc đóng hộp, có aria-modal. Mở ra thì focus nút có data-autofocus (không có thì phần tử đầu tiên); đóng xong trả focus
// về phần tử đã mở hộp.
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Khi hộp đóng (nút, Esc, bấm nền): mở khoá cuộn và trả focus.
  function restore() {
    document.documentElement.style.overflow = "";
    const el = opener.current;
    if (el instanceof HTMLElement && el.isConnected) el.focus();
  }

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={restore}
      onClick={(e) => {
        // Bấm vào nền (ngoài khung nội dung) thì đóng.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-(--shadow-card) backdrop:bg-overlay",
        className,
      )}
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <h2 id={titleId} className="flex-1 text-lg font-semibold text-navy">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-full p-1 text-muted hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {description && (
          <div id={descId} className="text-sm whitespace-pre-line text-muted">
            {description}
          </div>
        )}
        {children}
        {footer && <div className="flex flex-wrap justify-end gap-2 pt-1">{footer}</div>}
      </div>
    </dialog>
  );
}
