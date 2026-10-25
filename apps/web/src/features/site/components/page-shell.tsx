import type { ReactNode } from "react";

// Khung chung của các trang công khai: tiêu đề + mô tả ngắn + nội dung.
export function PageShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b border-black/10 pb-4 dark:border-white/15">
        <h1 className="text-3xl font-bold text-brand">{title}</h1>
        {description && <p className="opacity-80">{description}</p>}
      </header>
      {children}
    </div>
  );
}

export function Loading({ text = "Đang tải…" }: { text?: string }) {
  return <p className="text-sm opacity-60">{text}</p>;
}
