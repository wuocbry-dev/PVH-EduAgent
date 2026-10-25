import type { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { AgentActionDto } from '@pvh/shared';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AuditChannel } from '../audit-log/audit-log.service.js';

// Agent luôn hành động thay mặt một người dùng cụ thể, qua một kênh cụ thể.
export interface AgentContext {
  user: AuthUser;
  channel: AuditChannel;
  // Hành động chờ xác nhận mà tool nhạy cảm đề xuất trong lượt chat này (AgentService đọc ra để trả về).
  pendingActions?: AgentActionDto[];
}

// Kiểu chung cho mọi tool tạo bởi `tool()`, bất kể input schema của từng tool.
export type AgentTool = Omit<SdkMcpToolDefinition, 'handler'> & {
  handler: (
    args: any,
    extra: unknown,
  ) => ReturnType<SdkMcpToolDefinition['handler']>;
};

// Mỗi feature tự khai báo bộ tool của mình (vd. posts.agent-tools.ts) bằng cách
// implement interface này, rồi đăng ký vào AGENT_TOOL_PROVIDERS trong AgentModule.
export interface AgentToolProvider {
  buildTools(ctx: AgentContext): AgentTool[];
}

export const AGENT_TOOL_PROVIDERS = Symbol('AGENT_TOOL_PROVIDERS');

export function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

export function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}
