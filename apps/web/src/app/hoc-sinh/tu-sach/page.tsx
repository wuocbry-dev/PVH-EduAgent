import type { Metadata } from "next";
import { LibraryShelf } from "@/features/library";

export const metadata: Metadata = { title: "Tủ sách của em" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tủ sách của em</h1>
      <p className="max-w-3xl text-sm opacity-70">Sách, sách nói, video em đang đọc dở và đã đánh dấu yêu thích trong thư viện số.</p>
      <LibraryShelf />
    </div>
  );
}
