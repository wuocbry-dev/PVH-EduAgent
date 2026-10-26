import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  ANNOUNCEMENTS_PER_HOUR,
  audienceLabel,
  type AnnouncementDto,
  type AudienceTargetsDto,
  type InboxDto,
  type InboxItemDto,
} from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { sanitizeContent, stripHtml } from '../../common/utils/sanitize-content.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { audienceTargets, resolveTarget, viewerScope, visibleWhere } from './audience.js';
import type { CreateAnnouncementInput, MarkReadInput } from './dto/announcements.dto.js';

const INBOX_LIMIT = 60;
const INCLUDE = {
  class: { select: { name: true } },
  creator: { select: { fullName: true } },
  _count: { select: { reads: true } },
} satisfies Prisma.AnnouncementInclude;
type AnnouncementRow = Prisma.AnnouncementGetPayload<{ include: typeof INCLUDE }>;

// Thông báo theo đối tượng và hộp thông báo trong cổng (bước 20).
// Gửi: announcement:send — giáo viên chỉ cho lớp mình dạy/chủ nhiệm; announcement:manage (BGH) mọi đối tượng.
// Xem: ai đăng nhập cũng có hộp thông báo của mình (thông báo đúng đối tượng + thông báo hệ thống của chính mình).
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly limits: RateLimitService,
    private readonly storage: StorageService,
  ) {}

  async inbox(user: AuthUser): Promise<InboxDto> {
    const where = await this.inboxWhere(user);
    const uid = BigInt(user.id);
    const [announcements, notifications, unread] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        include: { ...INCLUDE, reads: { where: { userId: uid }, select: { userId: true } } },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: INBOX_LIMIT,
      }),
      this.prisma.notification.findMany({ where: { userId: uid }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: INBOX_LIMIT }),
      this.unreadCount(user, where),
    ]);
    const items: InboxItemDto[] = [
      ...announcements.map((a) => ({
        kind: 'ANNOUNCEMENT' as const,
        id: a.id.toString(),
        title: a.title,
        body: a.content,
        createdAt: a.createdAt.toISOString(),
        read: a.reads.length > 0,
        pinned: a.pinned,
        audienceLabel: audienceLabel(a.audience, a.gradeLevel, a.class?.name ?? null),
        senderName: a.creator.fullName,
      })),
      ...notifications.map((n) => ({
        kind: 'NOTIFICATION' as const,
        id: n.id.toString(),
        title: n.title,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        read: n.readAt !== null,
        pinned: false,
        audienceLabel: null,
        senderName: null,
      })),
    ]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, INBOX_LIMIT);
    return { items, unread };
  }

  async unreadCount(user: AuthUser, where?: Prisma.AnnouncementWhereInput): Promise<number> {
    const uid = BigInt(user.id);
    const [a, n] = await Promise.all([
      this.prisma.announcement.count({ where: { AND: [where ?? (await this.inboxWhere(user)), { reads: { none: { userId: uid } } }] } }),
      this.prisma.notification.count({ where: { userId: uid, readAt: null } }),
    ]);
    return a + n;
  }

  // Chỉ đánh dấu được mục mình thấy (thông báo ngoài đối tượng bị bỏ qua) và thông báo hệ thống của chính mình.
  async markRead(user: AuthUser, input: MarkReadInput): Promise<{ unread: number }> {
    const uid = BigInt(user.id);
    const where = await this.inboxWhere(user);
    const ids = input.all ? undefined : (input.announcementIds ?? []).map((i) => BigInt(i));
    if (input.all || (ids && ids.length > 0)) {
      const visible = await this.prisma.announcement.findMany({
        where: { AND: [where, ids ? { id: { in: ids } } : {}, { reads: { none: { userId: uid } } }] },
        select: { id: true },
      });
      if (visible.length) {
        await this.prisma.announcementRead.createMany({ data: visible.map((a) => ({ announcementId: a.id, userId: uid })), skipDuplicates: true });
      }
    }
    const nIds = input.all ? undefined : (input.notificationIds ?? []).map((i) => BigInt(i));
    if (input.all || (nIds && nIds.length > 0)) {
      await this.prisma.notification.updateMany({ where: { userId: uid, readAt: null, id: nIds ? { in: nIds } : undefined }, data: { readAt: new Date() } });
    }
    return { unread: await this.unreadCount(user, where) };
  }

  async targets(user: AuthUser): Promise<AudienceTargetsDto> {
    assertPermission(user, 'announcement:send');
    return audienceTargets(this.prisma, user, can(user, 'announcement:manage'));
  }

  // Thông báo đã gửi: BGH thấy mọi thông báo, giáo viên thấy thông báo của mình (kèm số người đã đọc).
  async sent(user: AuthUser): Promise<AnnouncementDto[]> {
    assertPermission(user, 'announcement:send');
    const rows = await this.prisma.announcement.findMany({
      where: can(user, 'announcement:manage') ? {} : { createdBy: BigInt(user.id) },
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return rows.map(toDto);
  }

  async create(user: AuthUser, input: CreateAnnouncementInput, ip?: string): Promise<AnnouncementDto> {
    assertPermission(user, 'announcement:send');
    const target = resolveTarget(input, await audienceTargets(this.prisma, user, can(user, 'announcement:manage')));
    const content = sanitizeContent(input.content, (url) => this.storage.mediaKindOfUrl(url));
    if (!stripHtml(content).trim() && !/<(img|video)\b/i.test(content)) throw new BadRequestException('Nội dung trống sau khi làm sạch');
    const title = stripHtml(input.title).trim();
    if (!title) throw new BadRequestException('Chưa nhập tiêu đề');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw new BadRequestException('Hạn hiển thị phải ở tương lai');

    const { count, retryAfterSec } = await this.limits.increment('announcement-send', user.id, 3600);
    if (count > ANNOUNCEMENTS_PER_HOUR) {
      throw new HttpException(`Bạn gửi quá nhiều thông báo, vui lòng thử lại sau ${Math.ceil(retryAfterSec / 60)} phút`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const row = await this.prisma.announcement.create({
      data: {
        title,
        content,
        audience: target.audience,
        gradeLevel: target.gradeLevel,
        classId: target.classId,
        pinned: input.pinned ?? false,
        expiresAt,
        createdBy: BigInt(user.id),
      },
      include: INCLUDE,
    });
    await this.record(user, 'announcement.create', row, ip);
    return toDto(row);
  }

  // Người gửi xoá thông báo của mình; BGH xoá được mọi thông báo.
  async remove(user: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(user, 'announcement:send');
    const row = await this.prisma.announcement.findUnique({ where: { id: parseId(id) }, include: INCLUDE });
    if (!row) throw new NotFoundException('Không tìm thấy thông báo');
    if (row.createdBy.toString() !== user.id && !can(user, 'announcement:manage')) {
      throw new ForbiddenException('Bạn chỉ xoá được thông báo do mình gửi');
    }
    await this.prisma.announcement.delete({ where: { id: row.id } });
    await this.record(user, 'announcement.delete', row, ip);
  }

  // Thông báo đúng đối tượng của người xem, còn hạn hiển thị.
  private async inboxWhere(user: AuthUser): Promise<Prisma.AnnouncementWhereInput> {
    const scope = await viewerScope(this.prisma, user, can(user, 'announcement:manage'));
    return { AND: [visibleWhere<Prisma.AnnouncementWhereInput>(scope, user.id), { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }] };
  }

  private record(user: AuthUser, action: string, row: AnnouncementRow, ip: string | undefined) {
    return this.audit.record({
      userId: user.id,
      channel: 'web',
      action,
      targetType: 'announcement',
      targetId: row.id.toString(),
      params: { title: row.title, audience: audienceLabel(row.audience, row.gradeLevel, row.class?.name ?? null) },
      ok: true,
      ip,
    });
  }
}

function toDto(a: AnnouncementRow): AnnouncementDto {
  return {
    id: a.id.toString(),
    title: a.title,
    content: a.content,
    audience: a.audience,
    gradeLevel: a.gradeLevel,
    classId: a.classId?.toString() ?? null,
    className: a.class?.name ?? null,
    audienceLabel: audienceLabel(a.audience, a.gradeLevel, a.class?.name ?? null),
    pinned: a.pinned,
    expiresAt: a.expiresAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    createdById: a.createdBy.toString(),
    createdByName: a.creator.fullName,
    readCount: a._count.reads,
  };
}
