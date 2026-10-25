import { tool } from '@anthropic-ai/claude-agent-sdk';
import { Injectable } from '@nestjs/common';
import type { SensitiveTool } from '@pvh/shared';
import { z } from 'zod';
import {
  jsonResult,
  type AgentContext,
  type AgentToolProvider,
} from '../agent/agent-tool.js';
import { AgentActionsService } from './agent-actions.service.js';

const postId = z.string().regex(/^\d{1,18}$/, 'Mã bài không hợp lệ').describe('id bài viết, lấy từ list_posts');
const publishAt = z.iso
  .datetime({ offset: true })
  .describe('Giờ đăng, ISO 8601 có múi giờ, ví dụ 2026-11-02T08:00:00+07:00');

// A08 – tool nhạy cảm (ảnh hưởng công khai). Tool KHÔNG thực thi: chỉ kiểm tra quyền và tạo yêu cầu chờ người dùng
// bấm Xác nhận. Yêu cầu được gom vào ctx.pendingActions để kênh (Telegram/web) hiện nút Xác nhận/Huỷ.
@Injectable()
export class AgentActionsAgentTools implements AgentToolProvider {
  constructor(private readonly actions: AgentActionsService) {}

  buildTools(ctx: AgentContext) {
    const propose = async (name: SensitiveTool, id: string, at?: string) => {
      const action = await this.actions.propose(
        ctx.user,
        { tool: name, postId: id, publishAt: at ? new Date(at) : undefined },
        ctx.channel,
      );
      ctx.pendingActions?.push(action);
      return jsonResult({
        status: 'PENDING_CONFIRMATION',
        description: action.description,
        expiresAt: action.expiresAt,
        note: 'Chưa thực hiện. Người dùng phải bấm Xác nhận (hết hạn sau 10 phút). Hãy báo đang chờ xác nhận, đừng nói đã làm xong.',
      });
    };
    return [
      tool(
        'approve_post',
        'Đề xuất duyệt và ĐĂNG NGAY một bài đang chờ duyệt. Cần người dùng xác nhận mới thực hiện.',
        { postId },
        async ({ postId: id }) => propose('approve_post', id),
      ),
      tool(
        'schedule_post',
        'Đề xuất duyệt một bài đang chờ duyệt và HẸN GIỜ đăng. Cần người dùng xác nhận mới thực hiện.',
        { postId, publishAt },
        async ({ postId: id, publishAt: at }) => propose('schedule_post', id, at),
      ),
      tool(
        'reschedule_post',
        'Đề xuất DỜI giờ đăng của bài đã hẹn giờ sang thời điểm mới. Cần người dùng xác nhận mới thực hiện.',
        { postId, publishAt },
        async ({ postId: id, publishAt: at }) => propose('reschedule_post', id, at),
      ),
      tool(
        'unpublish_post',
        'Đề xuất GỠ một bài đang đăng khỏi website. Cần người dùng xác nhận mới thực hiện.',
        { postId },
        async ({ postId: id }) => propose('unpublish_post', id),
      ),
    ];
  }
}
