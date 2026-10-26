export interface AgentChatRequest {
  message: string;
}

// A08 – hành động nhạy cảm của agent chờ người dùng xác nhận.
export const AGENT_ACTION_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'DONE', 'FAILED'] as const;
export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];

// create_and_publish_post: một yêu cầu duy nhất "tạo bài (kèm ảnh/video) rồi đăng/hẹn giờ"; bài chỉ được tạo khi người dùng xác nhận.
export const SENSITIVE_TOOLS = [
  'approve_post',
  'schedule_post',
  'reschedule_post',
  'unpublish_post',
  'create_and_publish_post',
] as const;
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
  // Slug bài viết khi thao tác đã đăng bài (để bot/giao diện ghép liên kết /tin-tuc/<slug>).
  resultSlug: string | null;
}

// Tệp người dùng gửi kèm (ảnh/video đã được lưu thành media). Agent chỉ biết loại, dung lượng và tên mô tả ngắn,
// không nhận nội dung hay URL tải về.
export interface AgentAttachment {
  mediaId: string;
  kind: 'IMAGE' | 'VIDEO';
  size: number;
  name: string;
}

export interface AgentChatResponse {
  reply: string;
  numTurns: number;
  costUsd: number;
  // Hành động agent vừa đề xuất, đang chờ người dùng bấm Xác nhận/Huỷ.
  pendingActions: AgentActionDto[];
  // Id media mà các tool đã dùng trong lượt này (kênh Telegram bỏ chúng khỏi danh sách tệp đang chờ gắn vào bài).
  usedMediaIds?: string[];
}
