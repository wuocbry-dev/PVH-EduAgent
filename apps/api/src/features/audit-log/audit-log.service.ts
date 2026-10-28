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
  ip?: string;
}

// Người nghe nhật ký (bước 26: phát hiện bất thường đăng nhập, đổi vai trò/quyền). `at` là thời điểm trước khi ghi dòng này.
export type AuditListener = (entry: AuditEntry, at: Date) => Promise<unknown>;

// F16 – ghi mọi thao tác, kể cả của AI Agent, vào bảng audit_logs.
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('AuditLog');
  private readonly listeners: AuditListener[] = [];

  constructor(private readonly prisma: PrismaService) {}

  // Chạy nền sau mỗi dòng nhật ký đã ghi; lỗi của listener chỉ ghi log, không ảnh hưởng thao tác chính.
  onRecorded(listener: AuditListener): void {
    this.listeners.push(listener);
  }

  // Không bao giờ ném lỗi: ghi log thất bại không được làm hỏng thao tác chính.
  async record(entry: AuditEntry): Promise<void> {
    const at = new Date();
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
          ip: entry.ip,
        },
      });
    } catch (err) {
      this.logger.error(
        `Không ghi được audit log ${entry.action}: ${String(err)}`,
      );
      return;
    }
    for (const listener of this.listeners) {
      listener(entry, at).catch((err) => this.logger.error(`Lỗi xử lý sau nhật ký ${entry.action}: ${String(err)}`));
    }
  }
}
