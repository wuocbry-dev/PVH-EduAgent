import type { AdmissionStatDto } from "@pvh/shared";
import { cacheLife, cacheTag } from "next/cache";
import { load } from "@/shared/lib/public-api";

// Chỉ tiêu và điểm chuẩn các năm (bảng admission_stats).
export async function getAdmission(): Promise<AdmissionStatDto[] | null> {
  "use cache";
  cacheTag("admission");
  const { data } = await load<AdmissionStatDto[]>("/public/admission");
  if (data) cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  else cacheLife("seconds");
  return data;
}
