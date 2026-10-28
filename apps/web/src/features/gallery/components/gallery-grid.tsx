import Link from "next/link";
import { mediaSrc } from "@/shared/lib/media-url";
import { getGallery } from "../api/get-gallery";
import { EmptyState } from "@/shared/ui";

// F06 – thư viện ảnh: ảnh của các bài đã đăng, bấm vào để mở bài. Đọc dữ liệu có cache nên đặt trong <Suspense>.
export async function GalleryGrid() {
  const items = await getGallery();

  if (items === null) {
    return <p className="text-sm text-muted">Không tải được thư viện ảnh lúc này, vui lòng thử lại sau.</p>;
  }
  if (items.length === 0) return <EmptyState>Chưa có ảnh hay video nào trong thư viện.</EmptyState>;

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <li key={item.url}>
          <Link
            href={`/tin-tuc/${item.postSlug}`}
            className="group block overflow-hidden rounded-2xl bg-surface border border-border"
          >
            {item.kind === "VIDEO" ? (
              <span className="relative block">
                {/* Chỉ tải siêu dữ liệu để hiện khung hình đầu; bấm vào để mở bài và xem video. */}
                <video
                  src={mediaSrc(item.url)}
                  preload="metadata"
                  muted
                  playsInline
                  aria-label={`Video trong bài: ${item.postTitle}`}
                  className="aspect-square w-full bg-black object-cover"
                />
                <span className="absolute left-2 top-2 rounded-xl bg-black/70 px-1.5 text-xs text-white">▶ Video</span>
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaSrc(item.url)}
                alt={`Ảnh trong bài: ${item.postTitle}`}
                loading="lazy"
                className="aspect-square w-full object-cover transition group-hover:scale-105"
              />
            )}
            <span className="block truncate px-2 py-1 text-xs text-muted">{item.postTitle}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
