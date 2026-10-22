import { Suspense } from "react";
import { PostList } from "@/features/posts";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">Trường THPT Phan Văn Hớn</h1>
        <p className="mt-2 opacity-80">
          Khu tái định cư 38ha, phường Đông Hưng Thuận, TP.HCM · Năm học đầu tiên 2026–2027
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Tin mới</h2>
        <Suspense fallback={<p className="text-sm opacity-60">Đang tải tin…</p>}>
          <PostList />
        </Suspense>
      </section>
    </div>
  );
}
