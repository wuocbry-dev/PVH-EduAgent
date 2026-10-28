import { cn } from "./cn";

// Trạng thái đang tải: thanh nhấp nháy, kèm chữ ẩn cho trình đọc màn hình.
export function Skeleton({ lines = 3, className, label = "Đang tải…" }: { lines?: number; className?: string; label?: string }) {
  return (
    <div role="status" className={cn("space-y-2", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} aria-hidden className={cn("h-4 animate-pulse rounded-full bg-border", i === lines - 1 && lines > 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
