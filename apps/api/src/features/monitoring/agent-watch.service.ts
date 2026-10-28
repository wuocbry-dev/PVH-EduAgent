import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AGENT_SWITCH_KEYS, SETTING_META, type AgentSwitchKey } from '@pvh/shared';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AgentGuardService, type AgentGuardEvent } from '../agent/agent-guard.service.js';
import { AuditLogService, type AuditEntry } from '../audit-log/audit-log.service.js';
import { formatVnTime, MonitoringAlertsService } from './monitoring-alerts.service.js';

const SCOPE_TEXT = {
  user: 'một người dùng chạm hạn mức lệnh/ngày',
  total: 'toàn hệ thống chạm hạn mức lệnh/ngày',
  cost: 'chi phí Claude chạm trần của ngày',
} as const;
const REASON_TEXT = {
  burst: 'ra lệnh dồn dập',
  denied: 'liên tục yêu cầu thao tác không có quyền',
  injection: 'nhiều tin có dấu hiệu tiêm lệnh (prompt injection)',
} as const;

// Bước 27: biến sự kiện của AgentGuardService và việc đổi công tắc khẩn cấp thành cảnh báo cho ADMIN (cơ chế bước 26).
// Tin chỉ nêu tên người dùng, số lần, khoảng thời gian; không bao giờ có nội dung lệnh hay câu trả lời.
@Injectable()
export class AgentWatchService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: AgentGuardService,
    private readonly audit: AuditLogService,
    private readonly alerts: MonitoringAlertsService,
  ) {}

  onModuleInit(): void {
    this.guard.onEvent((event) => this.onGuardEvent(event));
    this.audit.onRecorded((entry, at) => this.onAudit(entry, at));
  }

  async onGuardEvent(event: AgentGuardEvent): Promise<void> {
    const name = (await this.fullName(event.userId)) ?? `#${event.userId}`;
    if (event.kind === 'quota') {
      // Mỗi loại hạn mức một cảnh báo mỗi ngày (hạn mức người dùng: mỗi người một cảnh báo mỗi ngày).
      const key = `agent_quota:${event.scope}:${event.scope === 'user' ? `${event.userId}:` : ''}${event.day}`;
      const detail =
        event.scope === 'cost'
          ? `Đã dùng ${event.value} USD / trần ${event.limit} USD của ngày ${event.day}. Trợ lý AI dừng đến hết ngày; nâng trần ở trang Cấu hình nếu cần.`
          : event.scope === 'total'
            ? `${event.value} / ${event.limit} lệnh của ngày ${event.day}. Trợ lý AI từ chối lệnh mới đến hết ngày.`
            : `${name}: ${event.value} / ${event.limit} lệnh của ngày ${event.day}.`;
      await this.alerts.open('agent_quota', key, `Trợ lý AI: ${SCOPE_TEXT[event.scope]}`, detail);
      return;
    }
    const hours = Math.round(event.windowSec / 3600);
    await this.alerts.open(
      'agent_abuse',
      `agent_abuse:${event.reason}:${event.userId}:${Math.floor(Date.now() / (event.windowSec * 1000))}`,
      `${name} ${REASON_TEXT[event.reason]}`,
      `${event.count} lần trong ${hours} giờ gần nhất. Xem trang Trợ lý AI của cổng quản trị; có thể khoá tài khoản hoặc tắt Trợ lý AI nếu cần.`,
    );
  }

  // Đổi công tắc khẩn cấp ở trang Cấu hình / Trợ lý AI (audit setting.update) → báo ADMIN.
  async onAudit(entry: AuditEntry, at: Date): Promise<void> {
    if (entry.action !== 'setting.update' || !entry.ok) return;
    const changes = (entry.params as { changes?: Record<string, { from: string | null; to: string | null }> } | undefined)?.changes ?? {};
    const switched = AGENT_SWITCH_KEYS.filter((k) => k in changes);
    if (switched.length === 0) return;
    const actor = entry.userId ? await this.fullName(entry.userId) : null;
    const state = (key: AgentSwitchKey) => {
      const value = changes[key].to ?? SETTING_META[key].defaultValue;
      return `${SETTING_META[key].label}: ${value === 'true' ? 'BẬT' : 'TẮT'}`;
    };
    await this.alerts.open(
      'agent_switch',
      `agent_switch:${at.getTime()}`,
      switched.map(state).join('; '),
      `Do ${actor ?? 'không rõ'} đổi lúc ${formatVnTime(at)}.`,
    );
  }

  private async fullName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(userId) }, select: { fullName: true } });
    return user?.fullName ?? null;
  }
}
