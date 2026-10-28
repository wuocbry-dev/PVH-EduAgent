import type { ReactNode } from "react";
import { Skeleton } from "@/shared/ui";

// Khung chung của các trang công khai: tiêu đề + mô tả ngắn + nội dung. Không tự vẽ <main>/header trang (đã có ở layout).
export function PageShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-border pb-4">
        <h1 className="text-3xl font-bold text-navy">{title}</h1>
        {description && <p className="text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function Loading({ text = "Đang tải…" }: { text?: string }) {
  return <Skeleton label={text} />;
}
