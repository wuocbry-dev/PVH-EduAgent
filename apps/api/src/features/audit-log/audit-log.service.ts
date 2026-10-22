import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

export type AuditChannel = 'web' | 'telegram' | 'scheduler';

export interface AuditEntry {
  userId: string | null;
  channel: AuditChannel;
  action: string;
  targetType?: string;
  targetId?: string;
  params?: unknown;
  ok: boolean;
  error?: string;
}

// F16 – ghi mọi thao tác, kể cả của AI Agent, vào bảng audit_logs.
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('AuditLog');

  constructor(private readonly prisma: PrismaService) {}

  // Không bao giờ ném lỗi: ghi log thất bại không được làm hỏng thao tác chính.
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ? BigInt(entry.userId) : null,
          channel: entry.channel,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId ? BigInt(entry.targetId) : null,
          payload: {
            params: entry.params,
            ok: entry.ok,
            error: entry.error,
          } as Prisma.InputJsonObject,
        },
      });
    } catch (err) {
      this.logger.error(
        `Không ghi được audit log ${entry.action}: ${String(err)}`,
      );
    }
  }
}
