import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

// Danh sách rỗng: icon nhạt + câu ngắn (giữ nguyên chữ nghiệp vụ), tuỳ chọn một nút hành động.
export function EmptyState({
  children,
  icon: Icon = Inbox,
  action,
  className,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted", className)}>
      <Icon className="size-8 text-accent" aria-hidden />
      <div>{children}</div>
      {action}
    </div>
  );
}
