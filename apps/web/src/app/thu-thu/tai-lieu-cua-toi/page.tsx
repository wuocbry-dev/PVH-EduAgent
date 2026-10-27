import type { Metadata } from "next";
import { LibrarySubmissions } from "@/features/library";

export const metadata: Metadata = { title: "Tài liệu tôi gửi" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tài liệu tôi gửi</h1>
      <p className="max-w-3xl text-sm opacity-70">Soạn tài liệu, tải file (PDF, MP3, MP4/WebM) và ảnh bìa; ghi rõ nguồn và giấy phép.</p>
      <LibrarySubmissions />
    </div>
  );
}
