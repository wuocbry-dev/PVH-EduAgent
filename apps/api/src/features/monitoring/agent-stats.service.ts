import { Injectable } from '@nestjs/common';
import { AGENT_STATS_MAX_DAYS, AGENT_SWITCH_KEYS, type AgentStatsDto, type AgentSwitchKey } from '@pvh/shared';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AgentGuardService } from '../agent/agent-guard.service.js';
import { vnDay } from '../agent/agent-guard-rules.js';
import { SettingsService } from '../settings/settings.service.js';
import { MonitoringAlertsService } from './monitoring-alerts.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Lỗi tool vì thiếu quyền: thông điệp của assertPermission / các ForbiddenException trong service.
const DENIED_SQL = `(payload->>'error') ILIKE '%không có quyền%' OR (payload->>'error') ILIKE '%không được%'`;

// Thống kê AI Agent (bước 27) cho trang /admin/giam-sat-ai, quyền system:read.
// Chỉ đếm từ audit_logs (agent.chat, agent:<tool>) và agent_actions: CHỈ số lượng và tên tool,
// không bao giờ đọc hay trả tham số tool, nội dung lệnh, câu trả lời hay giá trị điểm.
@Injectable()
export class AgentStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: AgentGuardService,
    private readonly settings: SettingsService,
    private readonly alerts: MonitoringAlertsService,
  ) {}

  async stats(actor: AuthUser, days: number): Promise<AgentStatsDto> {
    assertPermission(actor, 'system:read');
    const span = Math.min(Math.max(days, 1), AGENT_STATS_MAX_DAYS);
    const since = new Date(Date.now() - span * DAY_MS);
    const [perDay, byRole, tools, actions, today, limits, switches, alerts] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; channel: string; commands: number; errors: number; flagged: number; cost: number | null }[]>`
        SELECT to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day, channel,
               count(*)::int AS commands,
               count(*) FILTER (WHERE payload->>'ok' = 'false')::int AS errors,
               count(*) FILTER (WHERE payload->'params'->>'flagged' = 'true')::int AS flagged,
               sum((payload->'params'->>'costUsd')::numeric)::float AS cost
        FROM audit_logs
        WHERE action = 'agent.chat' AND created_at >= ${since}
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ role: string; commands: number }[]>`
        SELECT r.code AS role, count(*)::int AS commands
        FROM audit_logs a
        JOIN user_roles ur ON ur.user_id = a.user_id
        JOIN roles r ON r.id = ur.role_id
        WHERE a.action = 'agent.chat' AND a.created_at >= ${since}
        GROUP BY 1
        ORDER BY 2 DESC`,
      this.prisma.$queryRawUnsafe<{ tool: string; calls: number; errors: number; denied: number }[]>(
        `SELECT substring(action FROM 7) AS tool, count(*)::int AS calls,
                count(*) FILTER (WHERE payload->>'ok' = 'false')::int AS errors,
                count(*) FILTER (WHERE payload->>'ok' = 'false' AND (${DENIED_SQL}))::int AS denied
         FROM audit_logs
         WHERE action LIKE 'agent:%' AND created_at >= $1
         GROUP BY 1
         ORDER BY 2 DESC
         LIMIT 50`,
        since,
      ),
      this.prisma.agentAction.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.guard.today(),
      this.guard.limitsNow(),
      Promise.all(AGENT_SWITCH_KEYS.map(async (k) => [k, (await this.settings.effective(k)) === 'true'] as const)),
      this.alerts.list(actor, false, ['agent_abuse', 'agent_quota', 'agent_switch'], 30),
    ]);

    // Đủ mọi ngày trong khoảng (ngày không có lệnh = 0), cũ trước mới sau.
    const dayList = Array.from({ length: span }, (_, i) => vnDay(new Date(Date.now() - (span - 1 - i) * DAY_MS)));
    return {
      days: dayList.map((day) => {
        const rows = perDay.filter((r) => r.day === day);
        const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
        return {
          day,
          web: sum((r) => (r.channel === 'web' ? r.commands : 0)),
          telegram: sum((r) => (r.channel === 'telegram' ? r.commands : 0)),
          errors: sum((r) => r.errors),
          flagged: sum((r) => r.flagged),
          costUsd: Math.round(sum((r) => r.cost ?? 0) * 10_000) / 10_000,
        };
      }),
      byRole,
      tools,
      actions: actions.map((a) => ({ status: a.status, count: a._count._all })).sort((x, y) => y.count - x.count),
      today: { ...today, limits },
      switches: Object.fromEntries(switches) as Record<AgentSwitchKey, boolean>,
      alerts,
    };
  }
}
