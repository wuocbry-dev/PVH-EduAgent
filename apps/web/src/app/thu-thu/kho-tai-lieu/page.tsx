import type { Metadata } from "next";
import { LibraryManager } from "@/features/library";

export const metadata: Metadata = { title: "Kho tài liệu" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Kho tài liệu</h1>
      <p className="max-w-3xl text-sm opacity-70">Mọi tài liệu của thư viện số: sửa thông tin, ẩn khỏi thư viện, hiện lại hoặc xoá.</p>
      <LibraryManager tabs={["kho"]} />
    </div>
  );
}
