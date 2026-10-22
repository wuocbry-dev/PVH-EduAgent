import { tool } from '@anthropic-ai/claude-agent-sdk';
import { Injectable } from '@nestjs/common';
import { POST_STATUSES } from '@pvh/shared';
import { z } from 'zod';
import {
  jsonResult,
  type AgentContext,
  type AgentToolProvider,
} from '../agent/agent-tool.js';
import { createPostSchema } from './dto/create-post.dto.js';
import { PostsService } from './posts.service.js';

// Các thao tác ảnh hưởng công khai (duyệt, hẹn giờ, gỡ bài) cần xác nhận 2 bước (A08)
// qua nút Telegram (bảng agent_actions), nên chưa đưa vào đây.
@Injectable()
export class PostsAgentTools implements AgentToolProvider {
  constructor(private readonly posts: PostsService) {}

  buildTools({ user }: AgentContext) {
    return [
      tool(
        'list_posts',
        'Liệt kê bài viết trên CMS (mới nhất trước), có thể lọc theo trạng thái. Trả về id, tiêu đề, trạng thái, giờ hẹn đăng.',
        { status: z.enum(POST_STATUSES).optional() },
        async ({ status }) => {
          const posts = await this.posts.list(user, status);
          return jsonResult(
            posts.map(({ id, title, status, publishAt }) => ({
              id,
              title,
              status,
              publishAt,
            })),
          );
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        'create_post_draft',
        'Tạo một bài viết mới ở trạng thái nháp (DRAFT). Bài nháp chưa hiển thị công khai.',
        createPostSchema.shape,
        async (input) => jsonResult(await this.posts.createDraft(user, input)),
      ),
    ];
  }
}
