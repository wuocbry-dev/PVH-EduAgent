import type { Metadata } from "next";
import { LibraryManager } from "@/features/library";

export const metadata: Metadata = { title: "Danh mục thư viện" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Danh mục thư viện</h1>
      <p className="max-w-3xl text-sm opacity-70">Danh mục hiện trên trang thư viện số (tối đa hai cấp). Danh mục còn tài liệu không xoá được.</p>
      <LibraryManager tabs={["danh-muc"]} />
    </div>
  );
}
