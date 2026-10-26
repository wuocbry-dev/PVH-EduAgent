import type { MyAcademicDto } from "@pvh/shared";
import { serverApi } from "@/shared/lib/server-api";

export function getMyAcademic() {
  return serverApi<MyAcademicDto>("/academic/me");
}
