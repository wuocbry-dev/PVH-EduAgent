"use client";

import type { LibraryShelfItemDto } from "@pvh/shared";
import Link from "next/link";
import { formatDateTime } from "@/shared/lib/format";
import { useData } from "@/shared/lib/use-data";
import { getMine } from "../api/library-api";
import { CardGrid } from "./library-card";

const progressNote = (item: LibraryShelfItemDto) => {
  if (item.position === null) return undefined;
  const where = item.kind === "PDF" ? `trang ${Math.round(item.position)}` : `${Math.floor(item.position / 60)} phút ${Math.floor(item.position % 60)} giây`;
  return `Đọc tiếp: ${where}${item.lastReadAt ? ` · ${formatDateTime(item.lastReadAt)}` : ""}`;
};

// Tủ sách trong cổng: tài liệu yêu thích và lịch sử đọc (đọc tiếp đúng chỗ).
export function LibraryShelf() {
  const { data, error } = useData(getMine, undefined);
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm opacity-70">Đang tải…</p>;
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Đang đọc</h2>
        {data.history.length === 0 ? (
          <p className="text-sm opacity-70">
            Chưa đọc tài liệu nào. Vào{" "}
            <Link href="/thu-vien" className="underline">
              thư viện số
            </Link>{" "}
            để chọn sách, sách nói, video.
          </p>
        ) : (
          <CardGrid items={data.history} note={progressNote} />
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Yêu thích</h2>
        {data.favorites.length === 0 ? (
          <p className="text-sm opacity-70">Bấm “Yêu thích” ở trang tài liệu để lưu vào đây.</p>
        ) : (
          <CardGrid items={data.favorites} note={progressNote} />
        )}
      </section>
    </div>
  );
}
