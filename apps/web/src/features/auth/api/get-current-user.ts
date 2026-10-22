import type { AuthMeDto } from "@pvh/shared";
import { serverApi } from "@/shared/lib/server-api";

export function getCurrentUser() {
  return serverApi<AuthMeDto>("/auth/me");
}
