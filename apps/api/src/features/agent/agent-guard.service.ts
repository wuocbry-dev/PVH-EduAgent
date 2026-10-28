import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AGENT_DENIED_ALERT, AGENT_INJECTION_ALERT } from '@pvh/shared';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { AgentContext } from './agent-tool.js';
import { fromMicroUsd, injectionSignals, toMicroUsd, vnDay } from './agent-guard-rules.js';

const DAY_WINDOW_SEC = 26 * 60 * 60; // khoá theo ngày Việt Nam, giữ dư vài giờ rồi tự hết
const HOUR_SEC = 60 * 60;

export type AgentGuardEvent =
  | { kind: 'quota'; scope: 'user' | 'total' | 'cost'; userId: string; day: string; value: number; limit: number }
  | { kind: 'abuse'; reason: 'burst' | 'denied' | 'injection'; userId: string; count: number; windowSec: number };

export interface ChatTicket {
  day: string;
  flagged: boolean;
  chars: number;
}

// Một lần vượt ngưỡng chỉ báo đúng một lần trong cửa sổ đếm.
const crosses = (count: number, threshold: number) => threshold > 0 && count === threshold;

// Bộ gác của AI Agent (bước 27), chạy trước và sau mỗi lượt chat (web và Telegram):
// - công tắc khẩn cấp trong system_settings (agent.enabled, agent.sensitive_tools), có hiệu lực ngay;
// - hạn mức theo ngày Việt Nam: số lệnh mỗi người, toàn hệ thống, chi phí Claude (RateLimitService);
// - đếm dấu hiệu lạm dụng (ra lệnh dồn dập, bị từ chối vì thiếu quyền, tin nghi tiêm lệnh): chỉ đánh dấu và đếm, không chặn.
// Sự kiện (vượt hạn mức, lạm dụng) phát cho listener; trung tâm giám sát (features/monitoring) mở cảnh báo cho ADMIN.
// Nhật ký `agent.chat` chỉ có số liệu (độ dài, số lượt, chi phí, cờ nghi vấn), không bao giờ có nội dung lệnh hay câu trả lời.
@Injectable()
export class AgentGuardService {
  private readonly logger = new Logger(AgentGuardService.name);
  private readonly listeners: ((event: AgentGuardEvent) => Promise<unknown>)[] = [];

  constructor(
    private readonly settings: SettingsService,
    private readonly limits: RateLimitService,
    private readonly audit: AuditLogService,
  ) {}

  onEvent(listener: (event: AgentGuardEvent) => Promise<unknown>): void {
    this.listeners.push(listener);
  }

  async agentEnabled(): Promise<boolean> {
    return (await this.settings.effective('agent.enabled')) === 'true';
  }

  async sensitiveToolsEnabled(): Promise<boolean> {
    return (await this.settings.effective('agent.sensitive_tools')) === 'true';
  }

  // Ném lỗi tiếng Việt (423 công tắc tắt, 429 hết hạn mức) trước khi gọi Claude; đếm lệnh và dấu hiệu lạm dụng.
  async beforeChat(ctx: AgentContext, message: string, now = new Date()): Promise<ChatTicket> {
    if (!(await this.agentEnabled())) {
      throw new HttpException('Trợ lý AI đang tạm dừng theo quyết định của quản trị hệ thống. Vui lòng thử lại sau.', HttpStatus.LOCKED);
    }
    const day = vnDay(now);
    const userId = ctx.user.id;
    const [perUser, total, costUsd, hourlyAlert] = await Promise.all([
      this.number('agent.daily_per_user'),
      this.number('agent.daily_total'),
      this.number('agent.daily_cost_usd'),
      this.number('agent.hourly_alert'),
    ]);

    const cost = (await this.limits.peek('agent-cost', day)).count;
    if (cost >= toMicroUsd(costUsd)) {
      this.emit({ kind: 'quota', scope: 'cost', userId, day, value: fromMicroUsd(cost), limit: costUsd });
      throw this.quotaError('Trợ lý AI đã dùng hết ngân sách của hôm nay. Vui lòng thử lại vào ngày mai.');
    }
    const used = (await this.limits.peek('agent-day', day)).count;
    if (used >= total) {
      this.emit({ kind: 'quota', scope: 'total', userId, day, value: used, limit: total });
      throw this.quotaError('Trợ lý AI đã nhận đủ số lệnh của hôm nay cho toàn trường. Vui lòng thử lại vào ngày mai.');
    }
    const mine = (await this.limits.peek('agent-day-user', `${day}:${userId}`)).count;
    if (mine >= perUser) {
      this.emit({ kind: 'quota', scope: 'user', userId, day, value: mine, limit: perUser });
      throw this.quotaError(`Bạn đã dùng hết ${perUser} lệnh Trợ lý AI của hôm nay. Vui lòng thử lại vào ngày mai.`);
    }

    await this.limits.increment('agent-day', day, DAY_WINDOW_SEC);
    await this.limits.increment('agent-day-user', `${day}:${userId}`, DAY_WINDOW_SEC);
    const hour = await this.limits.increment('agent-hour-user', userId, HOUR_SEC);
    if (crosses(hour.count, hourlyAlert)) this.emit({ kind: 'abuse', reason: 'burst', userId, count: hour.count, windowSec: HOUR_SEC });

    // Tin của người dùng và tên tệp đính kèm (chú thích ảnh Telegram là tin nhắn): chỉ đánh dấu, không chặn.
    const flagged = injectionSignals([message, ...(ctx.attachments ?? []).map((a) => a.name)].join('\n')) > 0;
    if (flagged) {
      const { count } = await this.limits.increment('agent-injection', `${day}:${userId}`, DAY_WINDOW_SEC);
      if (crosses(count, AGENT_INJECTION_ALERT)) this.emit({ kind: 'abuse', reason: 'injection', userId, count, windowSec: 24 * HOUR_SEC });
    }
    return { day, flagged, chars: message.length };
  }

  // Sau lượt chat: cộng chi phí Claude và ghi nhật ký số liệu (không có nội dung).
  async afterChat(ctx: AgentContext, ticket: ChatTicket, result: { ok: boolean; costUsd?: number; numTurns?: number }): Promise<void> {
    if (result.costUsd && result.costUsd > 0) await this.limits.increment('agent-cost', ticket.day, DAY_WINDOW_SEC, toMicroUsd(result.costUsd));
    await this.audit.record({
      userId: ctx.user.id,
      channel: ctx.channel,
      action: 'agent.chat',
      params: { chars: ticket.chars, turns: result.numTurns ?? 0, costUsd: result.costUsd ?? 0, flagged: ticket.flagged },
      ok: result.ok,
      error: result.ok ? undefined : 'Trợ lý AI không hoàn thành yêu cầu',
    });
  }

  // Tool bị từ chối vì thiếu quyền (gọi từ withAudit): nhiều lần trong 1 giờ thì báo ADMIN.
  async toolDenied(ctx: AgentContext): Promise<void> {
    try {
      const { count } = await this.limits.increment('agent-denied', ctx.user.id, HOUR_SEC);
      if (crosses(count, AGENT_DENIED_ALERT)) this.emit({ kind: 'abuse', reason: 'denied', userId: ctx.user.id, count, windowSec: HOUR_SEC });
    } catch (err) {
      this.logger.warn(`Không đếm được lần bị từ chối: ${String(err)}`);
    }
  }

  // Mức dùng hôm nay (cho trang giám sát).
  async today(now = new Date()): Promise<{ commands: number; costUsd: number }> {
    const day = vnDay(now);
    const [commands, cost] = await Promise.all([this.limits.peek('agent-day', day), this.limits.peek('agent-cost', day)]);
    return { commands: commands.count, costUsd: fromMicroUsd(cost.count) };
  }

  async limitsNow(): Promise<{ perUser: number; total: number; costUsd: number; hourlyAlert: number }> {
    const [perUser, total, costUsd, hourlyAlert] = await Promise.all([
      this.number('agent.daily_per_user'),
      this.number('agent.daily_total'),
      this.number('agent.daily_cost_usd'),
      this.number('agent.hourly_alert'),
    ]);
    return { perUser, total, costUsd, hourlyAlert };
  }

  private quotaError(message: string): HttpException {
    return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }

  private async number(key: 'agent.daily_per_user' | 'agent.daily_total' | 'agent.daily_cost_usd' | 'agent.hourly_alert'): Promise<number> {
    return Number(await this.settings.effective(key));
  }

  private emit(event: AgentGuardEvent): void {
    for (const listener of this.listeners) {
      listener(event).catch((err) => this.logger.error(`Lỗi xử lý sự kiện giám sát AI: ${String(err)}`));
    }
  }
}
