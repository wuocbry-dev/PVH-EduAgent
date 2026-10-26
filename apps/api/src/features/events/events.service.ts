import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AudienceTargetsDto, EventDto } from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { stripHtml } from '../../common/utils/sanitize-content.js';
import type { Event, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RevalidateService } from '../../infrastructure/revalidate/revalidate.service.js';
import { audienceTargets, resolveTarget, viewerScope, visibleWhere } from '../announcements/audience.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import type {
  CreateEventInput,
  ListEventsQuery,
  UpdateEventInput,
} from './dto/events.dto.js';

const MAX_LIST = 300;
const WITH_CLASS = { class: { select: { name: true } } } satisfies Prisma.EventInclude;
type EventRow = Event & { class: { name: string } | null };

// F15 – lịch sự kiện của trường. Xem: công khai (chỉ sự kiện toàn trường); trong cổng thêm sự kiện theo khối/lớp/chỉ
// nhân sự đúng đối tượng (bước 20). Thêm/sửa/xóa: cần post:approve (biên tập, BGH).
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly revalidate: RevalidateService,
  ) {}

  async list(query: ListEventsQuery): Promise<EventDto[]> {
    return this.find(query, { audience: 'SCHOOL' });
  }

  async mine(user: AuthUser, query: ListEventsQuery): Promise<EventDto[]> {
    const scope = await viewerScope(this.prisma, user, can(user, 'post:approve'));
    return this.find(query, visibleWhere<Prisma.EventWhereInput>(scope, user.id));
  }

  async targets(user: AuthUser): Promise<AudienceTargetsDto> {
    assertPermission(user, 'post:approve');
    return audienceTargets(this.prisma, user, true);
  }

  private async find(query: ListEventsQuery, where: Prisma.EventWhereInput): Promise<EventDto[]> {
    const from = query.from ? new Date(query.from) : new Date();
    const events = await this.prisma.event.findMany({
      where: {
        AND: [
          where,
          // Giao với khoảng [from, to]: chưa kết thúc trước from và đã bắt đầu trước to.
          { endAt: { gte: from }, startAt: query.to ? { lte: new Date(query.to) } : undefined },
        ],
      },
      include: WITH_CLASS,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take: MAX_LIST,
    });
    return events.map(toEventDto);
  }

  // Người có post:approve đặt được mọi đối tượng (lớp phải thuộc năm học hiện hành).
  private async target(user: AuthUser, input: { audience?: EventDto['audience']; gradeLevel?: number | null; classId?: string | null }) {
    const t = resolveTarget({ ...input, audience: input.audience ?? 'SCHOOL' }, await audienceTargets(this.prisma, user, true));
    return { audience: t.audience, gradeLevel: t.gradeLevel, classId: t.classId };
  }

  async create(
    user: AuthUser,
    input: CreateEventInput,
    ip?: string,
  ): Promise<EventDto> {
    assertPermission(user, 'post:approve');
    const event = await this.prisma.event.create({
      data: {
        title: stripHtml(input.title),
        location: input.location ? stripHtml(input.location) : null,
        startAt: input.startAt,
        endAt: input.endAt,
        createdBy: BigInt(user.id),
        ...(await this.target(user, input)),
      },
      include: WITH_CLASS,
    });
    await this.record(user, 'create', event, ip, { title: event.title });
    return toEventDto(event);
  }

  async update(
    user: AuthUser,
    id: string,
    input: UpdateEventInput,
    ip?: string,
  ): Promise<EventDto> {
    assertPermission(user, 'post:approve');
    const existing = await this.findOrThrow(id);
    const startAt = input.startAt ?? existing.startAt;
    const endAt = input.endAt ?? existing.endAt;
    if (endAt <= startAt) {
      throw new BadRequestException(
        'Thời điểm kết thúc phải sau thời điểm bắt đầu',
      );
    }
    const event = await this.prisma.event.update({
      where: { id: existing.id },
      data: {
        title: input.title === undefined ? undefined : stripHtml(input.title),
        location:
          input.location === undefined
            ? undefined
            : input.location
              ? stripHtml(input.location)
              : null,
        startAt,
        endAt,
        ...(input.audience === undefined ? {} : await this.target(user, input)),
      },
      include: WITH_CLASS,
    });
    await this.record(user, 'update', event, ip, { fields: Object.keys(input) });
    return toEventDto(event);
  }

  async remove(user: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(user, 'post:approve');
    const existing = await this.findOrThrow(id);
    await this.prisma.event.delete({ where: { id: existing.id } });
    await this.record(user, 'delete', existing, ip, { title: existing.title });
  }

  private async findOrThrow(id: string): Promise<Event> {
    const event = await this.prisma.event.findUnique({
      where: { id: parseId(id) },
    });
    if (!event) throw new NotFoundException('Không tìm thấy sự kiện');
    return event;
  }

  private async record(
    user: AuthUser,
    action: string,
    event: Event,
    ip: string | undefined,
    params: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      userId: user.id,
      channel: 'web',
      action: `event.${action}`,
      targetType: 'event',
      targetId: event.id.toString(),
      params,
      ok: true,
      ip,
    });
    // Trang /lich-su-kien của website công khai được cache theo tag "events".
    await this.revalidate.revalidate('events');
  }
}

function toEventDto(event: EventRow): EventDto {
  return {
    id: event.id.toString(),
    title: event.title,
    location: event.location,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    audience: event.audience,
    gradeLevel: event.gradeLevel,
    classId: event.classId?.toString() ?? null,
    className: event.class?.name ?? null,
  };
}
