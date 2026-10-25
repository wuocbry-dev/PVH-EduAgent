import type { DashboardDto } from "@pvh/shared";
import { serverApi } from "@/shared/lib/server-api";

export function getDashboard() {
  return serverApi<DashboardDto>("/system/dashboard");
}
