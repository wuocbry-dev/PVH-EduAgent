"use client";

import { useEffect } from "react";

export const UNSAVED_MESSAGE = "Còn điểm chưa lưu. Rời trang sẽ mất các thay đổi này. Vẫn rời trang?";

// Cảnh báo khi rời trang lúc còn thay đổi chưa lưu: đóng/tải lại tab (beforeunload) và bấm liên kết trong ứng dụng
// (App Router chuyển trang phía client nên beforeunload không chạy).
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!window.confirm(UNSAVED_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}
