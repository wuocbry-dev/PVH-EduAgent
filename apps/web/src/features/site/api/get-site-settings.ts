import type { PublicSettingsDto } from "@pvh/shared";
import { cacheLife, cacheTag } from "next/cache";
import { load } from "@/shared/lib/public-api";

// Cấu hình công khai (tên, địa chỉ, điện thoại, email, bản đồ) từ system_settings.
export async function getSiteSettings(): Promise<PublicSettingsDto> {
  "use cache";
  cacheTag("settings");
  const { data } = await load<PublicSettingsDto>("/public/settings");
  // API lỗi thì chỉ nhớ kết quả rỗng trong vài giây để lần sau thử lại sớm.
  if (data) cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  else cacheLife("seconds");
  return data ?? {};
}
