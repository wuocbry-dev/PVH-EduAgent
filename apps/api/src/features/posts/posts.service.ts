import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PostAction, PostDto, PostStatus } from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import {
  isBlankContent,
  sanitizeContent,
  stripHtml,
} from '../../common/utils/sanitize-content.js';
import { slugify } from '../../common/utils/slugify.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { QueueService } from '../../infrastructure/queue/queue.service.js';
import { RevalidateService } from '../../infrastructure/revalidate/revalidate.service.js';
import {
  AuditLogService,
  type AuditChannel,
} from '../audit-log/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type {
  CreatePostFormInput,
  UpdatePostInput,
} from './dto/create-post.dto.js';
import {
  actorMay,
  allowedActions,
  nextStatus,
  PostTransitionError,
  POST_RULES,
} from './posts.state-machine.js';

const WITH_RELATIONS = {
  author: { select: { fullName: true } },
  category: { select: { name: true } },
} satisfies Prisma.PostInclude;

type PostRow = Prisma.PostGetPayload<{ include: typeof WITH_RELATIONS }>;

export interface ActionMeta {
  ip?: string;
  channel?: AuditChannel;
}

// Dữ liệu kèm theo các thao tác chuyển trạng thái.
export interface ActionInput {
  publishAt?: Date;
  reason?: string;
}

const MAX_LIST = 100;

// F12 – vòng đời bài viết. Luật chuyển trạng thái nằm ở posts.state-machine.ts.
@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly revalidate: RevalidateService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
  ) {}

  // Người có post:approve thấy mọi bài; người còn lại chỉ thấy bài của mình.
  async list(
    user: AuthUser,
    status?: PostStatus,
    categoryId?: string,
  ): Promise<PostDto[]> {
    assertPermission(user, 'post:create');
    const posts = await this.prisma.post.findMany({
      where: {
        status,
        categoryId: categoryId ? parseId(categoryId) : undefined,
        authorId: can(user, 'post:approve') ? undefined : BigInt(user.id),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_LIST,
      include: WITH_RELATIONS,
    });
    return posts.map((p) => toPostDto(p, user));
  }

  async get(user: AuthUser, id: string): Promise<PostDto> {
    assertPermission(user, 'post:create');
    const post = await this.findOrThrow(id);
    if (!can(user, 'post:approve') && post.authorId.toString() !== user.id) {
      throw new ForbiddenException('Bạn không có quyền xem bài viết này');
    }
    return toPostDto(post, user);
  }

  countByStatus(status: PostStatus): Promise<number> {
    return this.prisma.post.count({ where: { status } });
  }

  async createDraft(
    user: AuthUser,
    input: CreatePostFormInput,
    meta: ActionMeta = {},
  ): Promise<PostDto> {
    assertPermission(user, 'post:create');
    const content = this.cleanContent(input.content);
    const categoryId = await this.categoryIdOrThrow(input.categoryId);
    const post = await this.prisma.post.create({
      data: {
        title: stripHtml(input.title),
        summary: input.summary ? stripHtml(input.summary) : null,
        content,
        thumbnailUrl: input.thumbnailUrl ?? null,
        categoryId,
        slug: await this.uniqueSlug(input.title),
        authorId: BigInt(user.id),
      },
      include: WITH_RELATIONS,
    });
    await this.record(user, 'create', post, meta, { title: post.title });
    return toPostDto(post, user);
  }

  // Tác giả sửa bài khi DRAFT hoặc REJECTED (bài bị từ chối sửa xong thì về nháp).
  async update(
    user: AuthUser,
    id: string,
    input: UpdatePostInput,
    meta: ActionMeta = {},
  ): Promise<PostDto> {
    assertPermission(user, 'post:create');
    const post = await this.findOrThrow(id);
    const to = this.authorize(user, post, 'edit');

    const data: Prisma.PostUncheckedUpdateManyInput = { status: to };
    if (input.title !== undefined) data.title = stripHtml(input.title);
    if (input.summary !== undefined) {
      data.summary = input.summary ? stripHtml(input.summary) : null;
    }
    if (input.content !== undefined) {
      data.content = this.cleanContent(input.content);
    }
    if (input.thumbnailUrl !== undefined) data.thumbnailUrl = input.thumbnailUrl;
    if (input.categoryId !== undefined) {
      data.categoryId = await this.categoryIdOrThrow(input.categoryId);
    }

    const updated = await this.apply(post, data);
    await this.record(user, 'update', updated, meta, {
      fields: Object.keys(input),
    });
    return toPostDto(updated, user);
  }

  // Các thao tác chuyển trạng thái: gửi duyệt, duyệt, từ chối, dời lịch, đăng ngay,
  // hủy lịch, gỡ, khôi phục.
  async transition(
    user: AuthUser,
    id: string,
    action: Exclude<PostAction, 'edit' | 'delete'>,
    input: ActionInput = {},
    meta: ActionMeta = {},
  ): Promise<PostDto> {
    const post = await this.findOrThrow(id);
    const to = this.authorize(user, post, action, input);
    const now = new Date();
    const userId = BigInt(user.id);

    let data: Prisma.PostUncheckedUpdateManyInput;
    switch (action) {
      case 'submit':
        if (isBlankContent(post.content)) {
          throw new BadRequestException('Nội dung bài viết đang trống');
        }
        data = { rejectReason: null };
        break;
      case 'approve':
        data = {
          reviewerId: userId,
          rejectReason: null,
          publishAt: input.publishAt ?? null,
          publishedAt: to === 'PUBLISHED' ? now : null,
        };
        break;
      case 'reject':
        data = { reviewerId: userId, rejectReason: input.reason };
        break;
      case 'reschedule':
        data = { publishAt: input.publishAt };
        break;
      case 'publish':
        data = { reviewerId: userId, publishAt: null, publishedAt: now };
        break;
      case 'cancel_schedule':
        data = { publishAt: null };
        break;
      case 'unpublish':
        data = {};
        break;
      case 'restore':
        data = { publishAt: null, publishedAt: null, rejectReason: null };
        break;
    }

    const updated = await this.apply(post, { ...data, status: to });
    await this.record(user, action, updated, meta, {
      from: post.status,
      to,
      publishAt: input.publishAt?.toISOString(),
      reason: input.reason,
    });
    // A05: job đăng bài theo lịch. Hẹn giờ/dời lịch thì tạo (hoặc thay) job; hủy lịch hoặc đăng ngay thì gỡ job cũ.
    if (to === 'SCHEDULED' && updated.publishAt) {
      await this.queue.schedulePublish(updated.id.toString(), updated.publishAt);
    } else if (post.status === 'SCHEDULED') {
      await this.queue.cancelPublish(updated.id.toString());
    }
    // Bài vừa hiện hoặc biến mất khỏi trang công khai: báo web làm mới cache.
    if (to === 'PUBLISHED' || post.status === 'PUBLISHED') {
      await this.revalidate.revalidate('posts');
    }
    return toPostDto(updated, user);
  }

  // A08: kiểm tra trước (quyền, luật chuyển trạng thái) mà chưa thay đổi gì; dùng khi agent đề xuất thao tác
  // chờ xác nhận. Ném lỗi giống transition() nếu thao tác không hợp lệ.
  async previewTransition(
    user: AuthUser,
    id: string,
    action: Exclude<PostAction, 'edit' | 'delete'>,
    input: ActionInput = {},
  ): Promise<{ id: string; title: string; status: PostStatus; to: PostStatus }> {
    const post = await this.findOrThrow(id);
    const to = this.authorize(user, post, action, input);
    return { id: post.id.toString(), title: post.title, status: post.status, to };
  }

  // A07: bài nháp ở chuyên mục Thông báo (slug thong-bao), do agent tạo.
  async createAnnouncement(
    user: AuthUser,
    input: { title: string; summary?: string; content: string },
    meta: ActionMeta = {},
  ): Promise<PostDto> {
    assertPermission(user, 'post:create');
    const category = await this.prisma.category.findUnique({ where: { slug: 'thong-bao' } });
    if (!category) throw new BadRequestException('Chưa có chuyên mục Thông báo');
    return this.createDraft(user, { ...input, categoryId: category.id.toString() }, meta);
  }

  // A05: đăng bài hẹn giờ khi đến hạn (do bộ lập lịch gọi). An toàn khi gọi lại: chỉ đăng nếu bài vẫn
  // SCHEDULED và đã đến giờ, nhờ cập nhật có điều kiện theo trạng thái.
  //   skipped = bài đã hủy/dời lịch/đã đăng; early = chưa đến giờ (lịch đã dời, job cũ thừa).
  async publishScheduled(
    postId: string,
    now = new Date(),
  ): Promise<'published' | 'skipped' | 'early'> {
    const post = await this.prisma.post.findUnique({
      where: { id: parseId(postId) },
    });
    if (post?.status !== 'SCHEDULED') return 'skipped';
    // Cho phép lệch 1 giây của đồng hồ giữa Redis và máy chủ.
    if (post.publishAt && post.publishAt.getTime() > now.getTime() + 1000) {
      return 'early';
    }
    const { count } = await this.prisma.post.updateMany({
      where: { id: post.id, status: 'SCHEDULED' },
      data: { status: 'PUBLISHED', publishedAt: now, publishAt: null },
    });
    if (count === 0) return 'skipped';

    await this.audit.record({
      userId: null,
      channel: 'scheduler',
      action: 'post.publish',
      targetType: 'post',
      targetId: post.id.toString(),
      params: { auto: true, scheduledFor: post.publishAt?.toISOString() },
      ok: true,
    });
    // Báo tác giả và người duyệt (ghi hộp thông báo; bot Telegram gửi cho người đã liên kết).
    const recipients = new Set([post.authorId, post.reviewerId].filter((id): id is bigint => id !== null));
    await this.notifications.notify(
      [...recipients].map((userId) => ({
        userId,
        title: 'Đã đăng bài',
        body: `Bài "${post.title}" đã được tự động đăng theo lịch.`,
      })),
    );
    await this.revalidate.revalidate('posts');
    return 'published';
  }

  // Id các bài SCHEDULED đã quá giờ đăng mà chưa đăng (quét bù khi khởi động và mỗi phút).
  async findDueScheduledIds(now = new Date()): Promise<string[]> {
    const posts = await this.prisma.post.findMany({
      where: { status: 'SCHEDULED', publishAt: { lte: now } },
      select: { id: true },
      orderBy: { publishAt: 'asc' },
      take: 200,
    });
    return posts.map((p) => p.id.toString());
  }

  // Các bài SCHEDULED còn ở tương lai kèm giờ đăng, để dựng lại job nếu Redis bị mất dữ liệu.
  async findUpcomingScheduled(now = new Date()): Promise<{ id: string; publishAt: Date }[]> {
    const posts = await this.prisma.post.findMany({
      where: { status: 'SCHEDULED', publishAt: { gt: now } },
      select: { id: true, publishAt: true },
      take: 1000,
    });
    return posts.map((p) => ({ id: p.id.toString(), publishAt: p.publishAt! }));
  }

  // Xóa nháp (tác giả) hoặc xóa vĩnh viễn bài đã gỡ (ADMIN).
  async remove(
    user: AuthUser,
    id: string,
    meta: ActionMeta = {},
  ): Promise<void> {
    const post = await this.findOrThrow(id);
    this.authorize(user, post, 'delete');
    const { count } = await this.prisma.post.deleteMany({
      where: { id: post.id, status: post.status },
    });
    if (count === 0) throw staleError();
    await this.record(user, 'delete', post, meta, {
      title: post.title,
      status: post.status,
    });
  }

  // Kiểm tra quyền rồi luật chuyển trạng thái; trả về trạng thái mới.
  private authorize(
    user: AuthUser,
    post: PostRow,
    action: PostAction,
    input: ActionInput = {},
  ): PostStatus {
    const rule = POST_RULES[action];
    for (const permission of rule.permissions) {
      assertPermission(user, permission);
    }
    const ref = { status: post.status, authorId: post.authorId.toString() };
    // Sai trạng thái thì để nextStatus báo lỗi cụ thể bên dưới (400), không trả 403 gây hiểu nhầm.
    if (rule.from.includes(post.status) && !actorMay(action, ref, user)) {
      throw new ForbiddenException(
        action === 'delete' && post.status !== 'DRAFT'
          ? 'Chỉ quản trị viên được xóa vĩnh viễn bài viết'
          : 'Bạn không có quyền thao tác với bài viết này (chỉ tác giả được sửa/gửi duyệt/xóa nháp)',
      );
    }
    try {
      return nextStatus(action, post.status, input);
    } catch (err) {
      if (err instanceof PostTransitionError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  // Cập nhật có điều kiện theo trạng thái đã đọc: hai người thao tác cùng lúc thì chỉ một người thành công.
  private async apply(
    post: PostRow,
    data: Prisma.PostUncheckedUpdateManyInput,
  ): Promise<PostRow> {
    const { count } = await this.prisma.post.updateMany({
      where: { id: post.id, status: post.status },
      data,
    });
    if (count === 0) throw staleError();
    return this.prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      include: WITH_RELATIONS,
    });
  }

  private async findOrThrow(id: string): Promise<PostRow> {
    const post = await this.prisma.post.findUnique({
      where: { id: parseId(id) },
      include: WITH_RELATIONS,
    });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');
    return post;
  }

  // HTML từ trình soạn thảo: lọc XSS ở server trước khi lưu.
  private cleanContent(html: string): string {
    const content = sanitizeContent(html);
    if (isBlankContent(content)) {
      throw new BadRequestException('Nội dung bài viết đang trống');
    }
    return content;
  }

  private async categoryIdOrThrow(
    categoryId: string | null | undefined,
  ): Promise<bigint | null> {
    if (!categoryId) return null;
    const category = await this.prisma.category.findUnique({
      where: { id: parseId(categoryId) },
    });
    if (!category) throw new BadRequestException('Chuyên mục không tồn tại');
    return category.id;
  }

  // posts.slug là UNIQUE: trùng tiêu đề thì thêm hậu tố -2, -3...
  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'bai-viet';
    let slug = base;
    for (let i = 2; await this.prisma.post.count({ where: { slug } }); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }

  private record(
    user: AuthUser,
    action: string,
    post: { id: bigint },
    meta: ActionMeta,
    params: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      userId: user.id,
      channel: meta.channel ?? 'web',
      action: `post.${action}`,
      targetType: 'post',
      targetId: post.id.toString(),
      params,
      ok: true,
      ip: meta.ip,
    });
  }
}

const staleError = () =>
  new ConflictException(
    'Bài viết vừa được người khác thay đổi, hãy tải lại trang',
  );

// `viewer` có mặt thì tính sẵn các thao tác được phép; trang công khai không có.
function toPostDto(post: PostRow, viewer?: AuthUser): PostDto {
  const authorId = post.authorId.toString();
  return {
    id: post.id.toString(),
    title: post.title,
    slug: post.slug,
    summary: post.summary,
    content: post.content,
    status: post.status,
    authorId,
    authorName: post.author.fullName,
    reviewerId: viewer ? (post.reviewerId?.toString() ?? null) : null,
    categoryId: post.categoryId?.toString() ?? null,
    categoryName: post.category?.name ?? null,
    thumbnailUrl: post.thumbnailUrl,
    rejectReason: viewer ? post.rejectReason : null,
    publishAt: post.publishAt?.toISOString() ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    actions: viewer ? allowedActions({ status: post.status, authorId }, viewer) : [],
  };
}
