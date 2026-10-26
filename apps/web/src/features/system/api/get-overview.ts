import type { SchoolOverviewDto } from "@pvh/shared";
import { serverApi } from "@/shared/lib/server-api";

export function getOverview() {
  return serverApi<SchoolOverviewDto>("/system/overview");
}
