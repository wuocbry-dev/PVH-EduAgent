import type { AgentChatRequest, AgentChatResponse } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

// devUserEmail: chỉ dùng ở chế độ dev (API bật DEV_AUTH) để thử với vai trò khác.
export function sendAgentMessage(body: AgentChatRequest, devUserEmail?: string) {
  return api<AgentChatResponse>("/agent/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: devUserEmail ? { "x-dev-user-email": devUserEmail } : undefined,
  });
}
