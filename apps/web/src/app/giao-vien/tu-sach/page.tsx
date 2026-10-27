import type { Metadata } from "next";
import { LibraryShelf } from "@/features/library";

export const metadata: Metadata = { title: "Tủ sách của tôi" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tủ sách của tôi</h1>
      <p className="max-w-3xl text-sm opacity-70">Tài liệu đang đọc dở và tài liệu yêu thích trong thư viện số.</p>
      <LibraryShelf />
    </div>
  );
}
