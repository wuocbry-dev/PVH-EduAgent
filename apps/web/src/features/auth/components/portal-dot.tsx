import type { Portal } from "@pvh/shared";

// Chấm màu nhỏ cạnh tên cổng: chỗ duy nhất còn màu riêng của từng cổng (bước 29), để người có nhiều cổng phân biệt.
// Mọi phần còn lại của giao diện dùng chung tông xanh.
const DOT: Record<Portal, string> = {
  admin: "bg-rose-500",
  bgh: "bg-indigo-500",
  "bien-tap": "bg-emerald-500",
  "thu-thu": "bg-teal-500",
  "giao-vien": "bg-amber-500",
  "hoc-sinh": "bg-sky-500",
};

export function PortalDot({ portal }: { portal: Portal }) {
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${DOT[portal]}`} />;
}
