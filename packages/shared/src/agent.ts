export interface AgentChatRequest {
  message: string;
}

// A08 – hành động nhạy cảm của agent chờ người dùng xác nhận.
export const AGENT_ACTION_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'DONE', 'FAILED'] as const;
export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];

export const SENSITIVE_TOOLS = ['approve_post', 'schedule_post', 'reschedule_post', 'unpublish_post'] as const;
export type SensitiveTool = (typeof SENSITIVE_TOOLS)[number];

export interface AgentActionDto {
  id: string;
  toolName: SensitiveTool;
  // Mô tả ngắn cho người dùng, vd. 'Dời bài "Họp phụ huynh" sang 08:00 26/10/2026'.
  description: string;
  status: AgentActionStatus;
  expiresAt: string;
  // Kết quả sau khi thực thi (DONE/FAILED).
  resultMessage: string | null;
}

export interface AgentChatResponse {
  reply: string;
  numTurns: number;
  costUsd: number;
  // Hành động agent vừa đề xuất, đang chờ người dùng bấm Xác nhận/Huỷ.
  pendingActions: AgentActionDto[];
}
