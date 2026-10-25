import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AgentActionDto, AgentActionStatus, SensitiveTool } from '@pvh/shared';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditLogService, type AuditChannel } from '../audit-log/audit-log.service.js';
import { PostsService } from '../posts/posts.service.js';

export const ACTION_TTL_MS = 10 * 60 * 1000;

const TZ = 'Asia/Ho_Chi_Minh';
const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  });

// Tham số lưu trong agent_actions.args.
interface ActionArgs {
  postId: string;
  title: string;
  publishAt?: string;
  description: string;
}

type ActionRow = Prisma.AgentActionGetPayload<object>;

export interface ProposeInput {
  tool: SensitiveTool;
  postId: string;
  // Bắt buộc với schedule_post và reschedule_post.
  publishAt?: Date;
}

// A08 – xác nhận 2 bước. Tool nhạy cảm của agent chỉ gọi `propose` (kiểm tra quyền + tạo bản ghi PENDING hết hạn
// sau 10 phút); thao tác chỉ chạy khi chính người ra lệnh bấm Xác nhận (`confirm`), trên Telegram hay web.
// Chuyển PENDING → CONFIRMED bằng cập nhật có điều kiện nên bấm lặp hoặc đồng thời chỉ chạy một lần.
@Injectable()
export class AgentActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly audit: AuditLogService,
  ) {}

  // Kiểm tra quyền và trạng thái bài ngay lúc đề xuất để người dùng không phải xác nhận một việc chắc chắn lỗi.
  async propose(user: AuthUser, input: ProposeInput, channel: AuditChannel): Promise<AgentActionDto> {
    const needsTime = input.tool === 'schedule_post' || input.tool === 'reschedule_post';
    if (needsTime && !input.publishAt) throw new BadRequestException('Cần chọn thời điểm đăng bài');
    const publishAt = needsTime ? input.publishAt : undefined;

    const preview = await this.posts.previewTransition(
      user,
      input.postId,
      input.tool === 'reschedule_post' ? 'reschedule' : input.tool === 'unpublish_post' ? 'unpublish' : 'approve',
      { publishAt },
    );
    const args: ActionArgs = {
      postId: preview.id,
      title: preview.title,
      publishAt: publishAt?.toISOString(),
      description: describe(input.tool, preview.title, publishAt),
    };
    const row = await this.prisma.agentAction.create({
      data: {
        userId: BigInt(user.id),
        toolName: input.tool,
        args: args as unknown as Prisma.InputJsonObject,
        expiresAt: new Date(Date.now() + ACTION_TTL_MS),
      },
    });
    await this.audit.record({
      userId: user.id,
      channel,
      action: 'agent_action.propose',
      targetType: 'agent_action',
      targetId: row.id.toString(),
      params: { tool: input.tool, ...args },
      ok: true,
    });
    return toDto(row);
  }

  // Các hành động còn chờ (chưa hết hạn) của người dùng; web dùng để dựng lại thẻ xác nhận.
  async listPending(user: AuthUser): Promise<AgentActionDto[]> {
    const rows = await this.prisma.agentAction.findMany({
      where: { userId: BigInt(user.id), status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { id: 'asc' },
    });
    return rows.map(toDto);
  }

  async get(user: AuthUser, id: string): Promise<AgentActionDto> {
    return toDto(await this.findOwned(user, id));
  }

  // Bấm Xác nhận: đúng người tạo, chưa hết hạn, chưa xử lý; kiểm tra lại quyền rồi thực thi qua PostsService.
  async confirm(user: AuthUser, id: string, channel: AuditChannel, ip?: string): Promise<AgentActionDto> {
    const action = await this.findOwned(user, id, channel);
    const claimed = await this.prisma.agentAction.updateMany({
      where: { id: action.id, status: 'PENDING', expiresAt: { gt: new Date() } },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    if (claimed.count === 0) return this.rejectStale(user, action.id, 'confirm', channel);

    const args = action.args as unknown as ActionArgs;
    const tool = action.toolName as SensitiveTool;
    try {
      const post = await this.execute(user, tool, args, channel, ip);
      const result = { ok: true, postId: post.id, status: post.status, message: doneMessage(tool, post.status, args) };
      return await this.finish(user, action.id, 'DONE', result, channel);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.finish(user, action.id, 'FAILED', { ok: false, message }, channel, message);
    }
  }

  async cancel(user: AuthUser, id: string, channel: AuditChannel): Promise<AgentActionDto> {
    const action = await this.findOwned(user, id, channel);
    const cancelled = await this.prisma.agentAction.updateMany({
      where: { id: action.id, status: 'PENDING', expiresAt: { gt: new Date() } },
      data: { status: 'CANCELLED' },
    });
    if (cancelled.count === 0) return this.rejectStale(user, action.id, 'cancel', channel);
    await this.audit.record({
      userId: user.id,
      channel,
      action: 'agent_action.cancel',
      targetType: 'agent_action',
      targetId: action.id.toString(),
      ok: true,
    });
    return toDto(await this.prisma.agentAction.findUniqueOrThrow({ where: { id: action.id } }));
  }

  // Job định kỳ: chuyển các hành động quá hạn mà chưa xử lý sang EXPIRED. Trả về số hành động đã chuyển.
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.agentAction.findMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      select: { id: true, userId: true, toolName: true },
    });
    let expired = 0;
    for (const a of due) {
      const { count } = await this.prisma.agentAction.updateMany({
        where: { id: a.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      if (count === 0) continue;
      expired++;
      await this.audit.record({
        userId: a.userId.toString(),
        channel: 'scheduler',
        action: 'agent_action.expire',
        targetType: 'agent_action',
        targetId: a.id.toString(),
        params: { tool: a.toolName },
        ok: true,
      });
    }
    return expired;
  }

  // Người khác (hoặc id không tồn tại) đều nhận 404 để không lộ hành động của người khác.
  private async findOwned(user: AuthUser, id: string, channel: AuditChannel = 'web'): Promise<ActionRow> {
    const action = await this.prisma.agentAction.findUnique({ where: { id: parseId(id) } });
    if (!action || action.userId.toString() !== user.id) {
      if (action) {
        await this.audit.record({
          userId: user.id,
          channel,
          action: 'agent_action.denied',
          targetType: 'agent_action',
          targetId: action.id.toString(),
          ok: false,
          error: 'Không phải người tạo hành động',
        });
      }
      throw new NotFoundException('Không tìm thấy yêu cầu cần xác nhận');
    }
    return action;
  }

  // Đã xử lý / hết hạn: không thực thi, ghi audit thất bại và trả trạng thái hiện tại.
  private async rejectStale(
    user: AuthUser,
    id: bigint,
    what: 'confirm' | 'cancel',
    channel: AuditChannel,
  ): Promise<AgentActionDto> {
    let action = await this.prisma.agentAction.findUniqueOrThrow({ where: { id } });
    if (action.status === 'PENDING' && action.expiresAt <= new Date()) {
      await this.prisma.agentAction.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      action = await this.prisma.agentAction.findUniqueOrThrow({ where: { id } });
    }
    await this.audit.record({
      userId: user.id,
      channel,
      action: `agent_action.${what}`,
      targetType: 'agent_action',
      targetId: id.toString(),
      params: { status: action.status },
      ok: false,
      error: action.status === 'EXPIRED' ? 'Yêu cầu đã hết hạn' : `Yêu cầu đã được xử lý (${action.status})`,
    });
    return toDto(action);
  }

  private execute(user: AuthUser, tool: SensitiveTool, args: ActionArgs, channel: AuditChannel, ip?: string) {
    const meta = { channel, ip };
    const publishAt = args.publishAt ? new Date(args.publishAt) : undefined;
    switch (tool) {
      case 'approve_post':
        return this.posts.transition(user, args.postId, 'approve', {}, meta);
      case 'schedule_post':
        return this.posts.transition(user, args.postId, 'approve', { publishAt }, meta);
      case 'reschedule_post':
        return this.posts.transition(user, args.postId, 'reschedule', { publishAt }, meta);
      case 'unpublish_post':
        return this.posts.transition(user, args.postId, 'unpublish', {}, meta);
      default:
        throw new ForbiddenException(`Tool không được hỗ trợ: ${String(tool)}`);
    }
  }

  private async finish(
    user: AuthUser,
    id: bigint,
    status: Extract<AgentActionStatus, 'DONE' | 'FAILED'>,
    result: Prisma.InputJsonObject,
    channel: AuditChannel,
    error?: string,
  ): Promise<AgentActionDto> {
    const row = await this.prisma.agentAction.update({ where: { id }, data: { status, result } });
    await this.audit.record({
      userId: user.id,
      channel,
      action: 'agent_action.confirm',
      targetType: 'agent_action',
      targetId: id.toString(),
      params: { tool: row.toolName, status },
      ok: status === 'DONE',
      error,
    });
    return toDto(row);
  }
}

function describe(tool: SensitiveTool, title: string, publishAt?: Date): string {
  const at = publishAt ? formatTime(publishAt.toISOString()) : '';
  switch (tool) {
    case 'approve_post':
      return `Duyệt và đăng ngay bài "${title}"`;
    case 'schedule_post':
      return `Duyệt bài "${title}" và hẹn đăng lúc ${at}`;
    case 'reschedule_post':
      return `Dời lịch đăng bài "${title}" sang ${at}`;
    case 'unpublish_post':
      return `Gỡ bài "${title}" khỏi website`;
  }
}

function doneMessage(tool: SensitiveTool, status: string, args: ActionArgs): string {
  switch (tool) {
    case 'approve_post':
      return `Đã đăng bài "${args.title}"`;
    case 'schedule_post':
      return `Đã duyệt bài "${args.title}", hẹn đăng lúc ${formatTime(args.publishAt!)}`;
    case 'reschedule_post':
      return `Đã dời lịch đăng bài "${args.title}" sang ${formatTime(args.publishAt!)}`;
    case 'unpublish_post':
      return `Đã gỡ bài "${args.title}" (trạng thái ${status})`;
  }
}

export function toDto(row: ActionRow): AgentActionDto {
  const args = row.args as unknown as ActionArgs;
  const result = row.result as { message?: string } | null;
  return {
    id: row.id.toString(),
    toolName: row.toolName as SensitiveTool,
    description: args.description,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    resultMessage: result?.message ?? null,
  };
}
