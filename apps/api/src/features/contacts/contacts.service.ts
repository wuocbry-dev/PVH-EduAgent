import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ContactDto, ContactStatus } from '@pvh/shared';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { HitLimiter } from '../../common/utils/hit-limiter.js';
import { parseId } from '../../common/utils/parse-id.js';
import { stripHtml } from '../../common/utils/sanitize-content.js';
import type { Contact } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import type {
  CreateContactInput,
  ListContactsQuery,
} from './dto/contacts.dto.js';

const MAX_PER_WINDOW = 3;
const WINDOW_MS = 10 * 60_000;

export interface ContactList {
  items: ContactDto[];
  total: number;
  page: number;
  pageSize: number;
}

// F07 – liên hệ. Gửi: công khai, có ô ẩn chống bot và giới hạn tần suất theo IP.
// Xem/đổi trạng thái: cần post:approve (biên tập). Email/số điện thoại chỉ hiện cho quản trị.
@Injectable()
export class ContactsService {
  private readonly limiter = new HitLimiter(MAX_PER_WINDOW, WINDOW_MS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async create(input: CreateContactInput, ip: string): Promise<void> {
    // Bot điền ô ẩn: giả vờ thành công để không lộ cơ chế, nhưng không lưu.
    if (input.website) return;

    const retryAfter = this.limiter.hit(ip);
    if (retryAfter > 0) {
      throw new HttpException(
        `Bạn gửi quá nhiều liên hệ, vui lòng thử lại sau ${Math.ceil(retryAfter / 60)} phút`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const contact = await this.prisma.contact.create({
      data: {
        fullName: stripHtml(input.fullName),
        email: input.email,
        phone: input.phone,
        subject: stripHtml(input.subject),
        message: stripHtml(input.message),
      },
    });
    await this.audit.record({
      userId: null,
      channel: 'web',
      action: 'contact.create',
      targetType: 'contact',
      targetId: contact.id.toString(),
      ok: true,
      ip,
    });
  }

  async list(user: AuthUser, query: ListContactsQuery): Promise<ContactList> {
    assertPermission(user, 'post:approve');
    const where = { status: query.status };
    const [total, contacts] = await Promise.all([
      this.prisma.contact.count({ where }),
      this.prisma.contact.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: contacts.map(toContactDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async updateStatus(
    user: AuthUser,
    id: string,
    status: ContactStatus,
    ip?: string,
  ): Promise<ContactDto> {
    assertPermission(user, 'post:approve');
    const existing = await this.prisma.contact.findUnique({
      where: { id: parseId(id) },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy liên hệ');
    const contact = await this.prisma.contact.update({
      where: { id: existing.id },
      data: { status },
    });
    await this.audit.record({
      userId: user.id,
      channel: 'web',
      action: 'contact.update_status',
      targetType: 'contact',
      targetId: contact.id.toString(),
      params: { from: existing.status, to: status },
      ok: true,
      ip,
    });
    return toContactDto(contact);
  }
}

function toContactDto(contact: Contact): ContactDto {
  return {
    id: contact.id.toString(),
    fullName: contact.fullName,
    email: contact.email,
    phone: contact.phone,
    subject: contact.subject,
    message: contact.message,
    status: contact.status as ContactStatus,
    createdAt: contact.createdAt.toISOString(),
  };
}
