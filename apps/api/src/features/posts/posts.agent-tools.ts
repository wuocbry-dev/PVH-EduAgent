import { tool } from '@anthropic-ai/claude-agent-sdk';
import { Injectable } from '@nestjs/common';
import { POST_STATUSES } from '@pvh/shared';
import { z } from 'zod';
import {
  jsonResult,
  type AgentContext,
  type AgentToolProvider,
} from '../agent/agent-tool.js';
import { createPostSchema, newPostToolSchema } from './dto/create-post.dto.js';
import { PostsService } from './posts.service.js';

// Các thao tác ảnh hưởng công khai (duyệt, hẹn giờ, dời lịch, gỡ bài) cần xác nhận 2 bước (A08)
// nên nằm ở features/agent-actions, không ở đây.
@Injectable()
export class PostsAgentTools implements AgentToolProvider {
  constructor(private readonly posts: PostsService) {}

  buildTools(ctx: AgentContext) {
    const { user, channel } = ctx;
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
        async (input) =>
          jsonResult(await this.posts.createDraft(user, input, { channel })),
      ),
      tool(
        'list_categories',
        'Liệt kê các chuyên mục của website (id, tên) để chọn categoryId khi tạo bài.',
        {},
        async () => jsonResult(await this.posts.listCategories()),
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        'create_post_with_media',
        'Tạo bài NHÁP (chưa đăng) có thể kèm ảnh/video người dùng đã gửi (mediaIds lấy từ danh sách tệp đính kèm). Gọi lại với cùng tiêu đề thì trả về bài đã tạo, không tạo bài thứ hai. Sau đó dùng submit_post_for_review để gửi duyệt, hoặc approve_post để đăng (cần xác nhận).',
        newPostToolSchema.shape,
        async (input) => {
          const post = await this.posts.createDraftWithMedia(user, input, { channel });
          ctx.usedMediaIds?.push(...(input.mediaIds ?? []));
          return jsonResult({
            id: post.id,
            title: post.title,
            status: post.status,
            categoryName: post.categoryName,
            hasThumbnail: !!post.thumbnailUrl,
            ...(post.duplicate ? { note: 'Bài này đã được tạo trước đó, không tạo thêm bài thứ hai.' } : {}),
          });
        },
      ),
      tool(
        'submit_post_for_review',
        'Gửi một bài nháp CỦA BẠN đi duyệt (chuyển sang chờ duyệt). Người có quyền duyệt sẽ duyệt và đăng sau. Chưa hiển thị công khai.',
        { postId: z.string().regex(/^\d{1,18}$/, 'Mã bài không hợp lệ').describe('id bài nháp, lấy từ create_post_with_media hoặc list_posts') },
        async ({ postId }) => {
          const post = await this.posts.transition(user, postId, 'submit', {}, { channel });
          return jsonResult({ id: post.id, title: post.title, status: post.status });
        },
      ),
      tool(
        'create_announcement',
        'Tạo bài nháp (DRAFT) ở chuyên mục Thông báo. Chưa hiển thị công khai; người có quyền duyệt sẽ duyệt sau.',
        createPostSchema.shape,
        async (input) =>
          jsonResult(await this.posts.createAnnouncement(user, input, { channel })),
      ),
    ];
  }
}
