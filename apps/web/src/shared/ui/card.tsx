import type { HTMLAttributes } from "react";
import { cn } from "./cn";

// Thẻ, khung, hộp: rounded-2xl, viền nhạt, bóng nhẹ.
export const cardClass = "rounded-2xl border border-border bg-surface shadow-(--shadow-card)";

// `padding={false}` khi bên trong tự lo khoảng đệm (vd. bảng, danh sách sát mép).
export function Card({ className, padding = true, ...props }: HTMLAttributes<HTMLDivElement> & { padding?: boolean }) {
  return <div className={cn(cardClass, padding && "p-4 md:p-5", className)} {...props} />;
}
