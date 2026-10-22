export interface AgentChatRequest {
  message: string;
}

export interface AgentChatResponse {
  reply: string;
  numTurns: number;
  costUsd: number;
}
