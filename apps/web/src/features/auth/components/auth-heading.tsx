import type { ReactNode } from "react";

// Tiêu đề trong thẻ của khu xác thực ((auth)/layout.tsx đã vẽ thẻ).
export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h1 className="text-2xl font-bold text-navy">{title}</h1>
      {children && <p className="text-sm text-muted">{children}</p>}
    </div>
  );
}
