import type { ReactNode, TableHTMLAttributes } from "react";
import { cn } from "./cn";

// Bảng dài: khung cuộn riêng (cuộn ngang trên điện thoại, cuộn dọc khi quá maxHeight) với thead dính trong khung.
// stickyFirstColumn: cột đầu (tên học sinh/lớp) dính khi cuộn ngang. Kiểu dính nằm ở globals.css (.data-table).
// Khung có "relative" để phần tử định vị tuyệt đối trong ô (sr-only…) bị khung cắt, không làm cả trang tràn ngang.
export function Table({
  children,
  className,
  wrapperClassName,
  stickyFirstColumn = false,
  maxHeight = "70vh",
  label,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & {
  children: ReactNode;
  wrapperClassName?: string;
  stickyFirstColumn?: boolean;
  // Chiều cao tối đa của khung cuộn (thead dính trong khung); "none" cho bảng ngắn không cần cuộn dọc.
  maxHeight?: string;
  // Tên vùng cuộn cho trình đọc màn hình (khung cuộn nhận focus bằng bàn phím để cuộn được).
  label?: string;
}) {
  return (
    <div
      className={cn("table-scroll relative overflow-auto rounded-2xl border border-border bg-surface", wrapperClassName)}
      style={maxHeight === "none" ? undefined : { maxHeight }}
      tabIndex={0}
      role="region"
      aria-label={label ?? "Bảng dữ liệu"}
    >
      <table
        className={cn("data-table", className)}
        data-sticky-first={stickyFirstColumn || undefined}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}
