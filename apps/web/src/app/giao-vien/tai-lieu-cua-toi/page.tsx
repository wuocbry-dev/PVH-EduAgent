import type { Metadata } from "next";
import { LibrarySubmissions } from "@/features/library";

export const metadata: Metadata = { title: "Tài liệu tôi gửi" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tài liệu tôi gửi</h1>
      <p className="max-w-3xl text-sm opacity-70">Đóng góp tài liệu cho thư viện số: soạn, tải file, gửi thủ thư duyệt. Bị từ chối thì xem lý do, sửa và gửi lại.</p>
      <LibrarySubmissions />
    </div>
  );
}
