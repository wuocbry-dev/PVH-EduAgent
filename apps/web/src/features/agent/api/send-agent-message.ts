import type { AgentChatRequest, AgentChatResponse } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export function sendAgentMessage(body: AgentChatRequest, devUserEmail: string) {
  return api<AgentChatResponse>("/agent/chat", {
    method: "POST",
    body: JSON.stringify(body),
    devUserEmail,
  });
}
