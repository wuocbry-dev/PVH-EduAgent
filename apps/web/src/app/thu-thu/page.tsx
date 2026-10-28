import type { Metadata } from "next";
import Link from "next/link";
import { LibraryManager } from "@/features/library";

export const metadata: Metadata = { title: "Tổng quan" };

export default function LibrarianHomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Thư viện số</h1>
      <p className="max-w-3xl text-sm text-muted">
        Thống kê lượt đọc. Tài liệu giáo viên gửi nằm ở <Link href="/thu-thu/duyet-tai-lieu" className="underline">Hàng chờ duyệt</Link>; trang công khai:{" "}
        <Link href="/thu-vien" className="underline">/thu-vien</Link>.
      </p>
      <LibraryManager tabs={["thong-ke"]} />
    </div>
  );
}
