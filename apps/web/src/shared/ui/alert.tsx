import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

type AlertTone = "danger" | "warning" | "success" | "info";

const TONES: Record<AlertTone, { className: string; Icon: LucideIcon }> = {
  danger: { className: "border-danger/30 bg-danger-soft text-danger", Icon: CircleAlert },
  warning: { className: "border-warning/30 bg-warning-soft text-warning", Icon: TriangleAlert },
  success: { className: "border-success/30 bg-success-soft text-success", Icon: CircleCheck },
  info: { className: "border-primary-soft-border bg-primary-soft text-primary", Icon: Info },
};

// Khung thông báo tại chỗ (lỗi form, cảnh báo, kết quả). Lỗi dùng role="alert" để trình đọc màn hình đọc ngay.
export function Alert({ tone = "info", children, className }: { tone?: AlertTone; children: ReactNode; className?: string }) {
  const { className: toneClass, Icon } = TONES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-sm", toneClass, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}
