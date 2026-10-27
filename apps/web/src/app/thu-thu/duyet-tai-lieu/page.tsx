import type { Metadata } from "next";
import { LibraryManager } from "@/features/library";

export const metadata: Metadata = { title: "Hàng chờ duyệt" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hàng chờ duyệt</h1>
      <p className="max-w-3xl text-sm opacity-70">Kiểm tra nội dung, nguồn và giấy phép trước khi đăng. Từ chối phải ghi lý do để người gửi sửa.</p>
      <LibraryManager tabs={["duyet"]} />
    </div>
  );
}
