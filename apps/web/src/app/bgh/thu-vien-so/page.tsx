import type { Metadata } from "next";
import { LibraryManager } from "@/features/library";

export const metadata: Metadata = { title: "Thư viện số" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Thư viện số</h1>
      <p className="max-w-3xl text-sm text-muted">Duyệt tài liệu giáo viên gửi, quản lý kho tài liệu và danh mục, xem thống kê lượt đọc.</p>
      <LibraryManager />
    </div>
  );
}
