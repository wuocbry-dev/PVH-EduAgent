import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

// API (NestJS) gọi route này khi đăng/gỡ bài hoặc sửa chuyên mục để trang công khai không phải chờ hết hạn cache.
// Bảo vệ bằng bí mật dùng chung REVALIDATE_SECRET (phải trùng với apps/api/.env).
const ALLOWED_TAGS = new Set(["posts", "categories", "admission", "settings", "events", "library"]);

function secretMatches(received: string | null): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-revalidate-secret"))) {
    return Response.json({ message: "Không được phép" }, { status: 401 });
  }
  const body: unknown = await request.json().catch(() => null);
  const tags = (body as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string" || !ALLOWED_TAGS.has(t))) {
    return Response.json({ message: "Danh sách tag không hợp lệ" }, { status: 400 });
  }
  // expire: 0 → yêu cầu kế tiếp lấy dữ liệu mới ngay (bài vừa gỡ không được hiện thêm).
  for (const tag of tags as string[]) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags });
}
