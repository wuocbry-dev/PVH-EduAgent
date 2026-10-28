import { ForbiddenException } from '@nestjs/common';
import type { AuditLogService } from '../audit-log/audit-log.service.js';
import {
  errorResult,
  type AgentContext,
  type AgentTool,
} from './agent-tool.js';

// Ghi audit log cho mọi lần gọi tool, và trả lỗi (vd. thiếu quyền) về cho model
// dưới dạng tool error thay vì làm hỏng cả phiên. `onDenied` (bước 27): đếm lần bị từ chối vì thiếu quyền.
export function withAudit(
  t: AgentTool,
  ctx: AgentContext,
  audit: AuditLogService,
  onDenied?: () => Promise<void>,
): AgentTool {
  return {
    ...t,
    handler: async (args, extra) => {
      const entry = {
        userId: ctx.user.id,
        channel: ctx.channel,
        action: `agent:${t.name}`,
        params: args,
      };
      try {
        const result = await t.handler(args, extra);
        await audit.record({ ...entry, ok: true });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await audit.record({ ...entry, ok: false, error });
        if (err instanceof ForbiddenException) await onDenied?.();
        return errorResult(error);
      }
    },
  };
}
