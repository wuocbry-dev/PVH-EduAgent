import { tool } from '@anthropic-ai/claude-agent-sdk';
import { Injectable } from '@nestjs/common';
import type { SensitiveTool } from '@pvh/shared';
import { z } from 'zod';
import { newPostToolSchema } from '../posts/dto/create-post.dto.js';
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
    const result = (action: Awaited<ReturnType<AgentActionsService['propose']>>) => {
      if (!action.duplicate) ctx.pendingActions?.push(action);
      return jsonResult({
        status: 'PENDING_CONFIRMATION',
        description: action.description,
        expiresAt: action.expiresAt,
        note: action.duplicate
          ? 'Yêu cầu giống hệt đã đang chờ xác nhận, không tạo thêm. Hãy nhắc người dùng bấm nút ở tin nhắn trước.'
          : 'Chưa thực hiện. Người dùng phải bấm Xác nhận (hết hạn sau 10 phút). Hãy báo đang chờ xác nhận, đừng nói đã làm xong.',
      });
    };
    const propose = async (name: SensitiveTool, id: string, at?: string) =>
      result(
        await this.actions.propose(
          ctx.user,
          { tool: name, postId: id, publishAt: at ? new Date(at) : undefined },
          ctx.channel,
        ),
      );
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
        'create_and_publish_post',
        'Đề xuất TẠO bài mới (có thể kèm ảnh/video) rồi ĐĂNG NGAY hoặc HẸN GIỜ, chỉ cho người có quyền duyệt và đăng. Dùng khi người dùng nói "viết bài này và đăng luôn". Đây là MỘT yêu cầu xác nhận duy nhất hiển thị đủ tiêu đề, tóm tắt, số ảnh/video, chuyên mục và giờ đăng; bài chỉ được tạo khi người dùng bấm Xác nhận. Không gọi thêm tool tạo bài khác cho cùng bài này.',
        { ...newPostToolSchema.shape, publishAt: publishAt.optional().describe('Bỏ trống = đăng ngay; có giá trị = hẹn giờ đăng') },
        async ({ publishAt: at, ...draft }) => {
          const action = await this.actions.propose(
            ctx.user,
            { tool: 'create_and_publish_post', draft, publishAt: at ? new Date(at) : undefined },
            ctx.channel,
          );
          ctx.usedMediaIds?.push(...(draft.mediaIds ?? []));
          return result(action);
        },
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
