import type { ReactNode } from "react";
import { cn } from "./cn";

// Thanh nút Lưu/Huỷ của form dài: dính ở đáy vùng nội dung khi cuộn (soạn bài, cấu hình, soạn thông báo, sửa trắc nghiệm).
// Khi in thì thành thanh thường.
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/90 px-3 py-2.5 shadow-(--shadow-card) backdrop-blur print:static print:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
