import { Injectable, type OnModuleInit } from '@nestjs/common';
import { LOGIN_FAILURE_WINDOW_SEC, NEW_LOGIN_LOOKBACK_DAYS, ROLE_NAMES, type Role } from '@pvh/shared';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { AuditLogService, type AuditEntry } from '../audit-log/audit-log.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { formatVnTime, MonitoringAlertsService } from './monitoring-alerts.service.js';
import { crossesThreshold } from './monitoring-rules.js';

const PRIVILEGED: Role[] = ['ADMIN', 'PRINCIPAL'];
const DAY_MS = 24 * 60 * 60 * 1000;

type Params = Record<string, unknown>;
const paramsOf = (entry: AuditEntry): Params => (entry.params && typeof entry.params === 'object' ? (entry.params as Params) : {});
const roleList = (value: unknown): Role[] => (Array.isArray(value) ? value.filter((r): r is Role => typeof r === 'string' && r in ROLE_NAMES) : []);
const roleNames = (roles: Role[]) => (roles.length ? roles.map((r) => ROLE_NAMES[r]).join(', ') : 'không có vai trò');
const vnDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

// Bảo vệ tài khoản (bước 26): đọc nhật ký vừa ghi (audit_logs, không thêm bảng) để báo ADMIN khi
// - một tài khoản sai mật khẩu nhiều lần (mọi IP cộng lại, ngưỡng monitor.login_failures trong 15 phút);
// - BGH/ADMIN đăng nhập thành công từ IP hoặc thiết bị chưa thấy trong 90 ngày;
// - có tài khoản ADMIN/BGH mới, đổi vai trò người dùng hay đổi quyền của vai trò.
// Tin chỉ có họ tên, vai trò, IP, thiết bị; không có mật khẩu, mã, token.
@Injectable()
export class AccountWatchService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly limits: RateLimitService,
    private readonly settings: SettingsService,
    private readonly alerts: MonitoringAlertsService,
  ) {}

  onModuleInit(): void {
    this.audit.onRecorded((entry, at) => this.handle(entry, at));
  }

  async handle(entry: AuditEntry, at: Date): Promise<void> {
    if (!this.alerts.enabled) return;
    switch (entry.action) {
      case 'auth.login':
        if (!entry.userId) return;
        return entry.ok ? this.onLoginSuccess(entry, at) : this.onLoginFailure(entry, at);
      case 'user.create':
        return this.onUserCreated(entry);
      case 'user.update':
        return this.onRolesChanged(entry, at);
      case 'role.update_permissions':
        return this.onPermissionsChanged(entry, at);
    }
  }

  private async onLoginFailure(entry: AuditEntry, at: Date): Promise<void> {
    const userId = entry.userId!;
    const { count } = await this.limits.increment('monitor-loginfail', userId, LOGIN_FAILURE_WINDOW_SEC);
    const threshold = Number(await this.settings.effective('monitor.login_failures'));
    if (!crossesThreshold(count, threshold)) return;
    const user = await this.userInfo(userId);
    if (!user) return;
    // Mỗi tài khoản tối đa một cảnh báo đang mở mỗi ngày.
    await this.alerts.open(
      'login_failures',
      `login_failures:${userId}:${vnDay(at)}`,
      `${user.fullName} (${roleNames(user.roles)}) sai mật khẩu ${count} lần trong ${LOGIN_FAILURE_WINDOW_SEC / 60} phút`,
      `Lần gần nhất từ IP ${entry.ip ?? 'không rõ'} lúc ${formatVnTime(at)}. Có thể khoá tài khoản hoặc gỡ chặn ở trang Bảo mật và đăng nhập.`,
    );
  }

  private async onLoginSuccess(entry: AuditEntry, at: Date): Promise<void> {
    const userId = entry.userId!;
    const user = await this.userInfo(userId);
    if (!user || !user.roles.some((r) => PRIVILEGED.includes(r))) return;
    const device = typeof paramsOf(entry).device === 'string' ? (paramsOf(entry).device as string) : null;
    const previous = await this.prisma.auditLog.findMany({
      where: {
        action: 'auth.login',
        userId: BigInt(userId),
        createdAt: { gte: new Date(at.getTime() - NEW_LOGIN_LOOKBACK_DAYS * DAY_MS), lt: at },
        payload: { path: ['ok'], equals: true },
      },
      select: { ip: true, payload: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    // Lần đăng nhập đầu tiên (chưa có lịch sử) thì chưa có gì để so.
    if (previous.length === 0) return;
    const devices = previous
      .map((p) => ((p.payload as { params?: Params } | null)?.params?.device as string | undefined) ?? null)
      .filter((d): d is string => !!d);
    const newIp = !!entry.ip && !previous.some((p) => p.ip === entry.ip);
    // Nhật ký cũ (trước bước 26) chưa ghi thiết bị: chỉ so thiết bị khi đã có lịch sử thiết bị.
    const newDevice = !!device && devices.length > 0 && !devices.includes(device);
    if (!newIp && !newDevice) return;
    const what = [newIp && `IP mới ${entry.ip}`, newDevice && `thiết bị mới (${device})`].filter(Boolean).join(', ');
    await this.alerts.open(
      'new_login',
      `new_login:${userId}:${entry.ip ?? ''}:${device ?? ''}`,
      `${user.fullName} (${roleNames(user.roles)}) đăng nhập từ nơi lạ`,
      `${what} lúc ${formatVnTime(at)}. Nếu không phải người này, hãy buộc đăng xuất và khoá tài khoản ở trang Người dùng.`,
      [userId],
    );
  }

  private async onUserCreated(entry: AuditEntry): Promise<void> {
    const roles = roleList(paramsOf(entry).roles);
    if (!roles.some((r) => PRIVILEGED.includes(r)) || !entry.targetId) return;
    const [target, actor] = await Promise.all([this.userInfo(entry.targetId), entry.userId ? this.userInfo(entry.userId) : null]);
    await this.alerts.open(
      'privileged_account',
      `privileged:${entry.targetId}`,
      `Tạo tài khoản ${roleNames(roles)}: ${target?.fullName ?? `#${entry.targetId}`}`,
      `Người tạo: ${actor?.fullName ?? 'không rõ'}. Kiểm tra lại nếu đây không phải thao tác đã biết.`,
      [entry.targetId],
    );
  }

  private async onRolesChanged(entry: AuditEntry, at: Date): Promise<void> {
    const params = paramsOf(entry);
    if (!Array.isArray(params.previousRoles) || !entry.targetId) return;
    const before = roleList(params.previousRoles);
    const after = roleList(params.roles);
    const [target, actor] = await Promise.all([this.userInfo(entry.targetId), entry.userId ? this.userInfo(entry.userId) : null]);
    await this.alerts.open(
      'role_change',
      `role_change:user:${entry.targetId}:${at.getTime()}`,
      `Đổi vai trò của ${target?.fullName ?? `#${entry.targetId}`}`,
      `${roleNames(before)} → ${roleNames(after)}, do ${actor?.fullName ?? 'không rõ'} lúc ${formatVnTime(at)}. Mọi phiên của người này đã bị đăng xuất.`,
      [entry.targetId],
    );
  }

  private async onPermissionsChanged(entry: AuditEntry, at: Date): Promise<void> {
    const params = paramsOf(entry);
    const role = typeof params.role === 'string' && params.role in ROLE_NAMES ? (params.role as Role) : null;
    if (!role) return;
    const before = new Set(Array.isArray(params.before) ? params.before.map(String) : []);
    const after = new Set(Array.isArray(params.after) ? params.after.map(String) : []);
    const added = [...after].filter((p) => !before.has(p));
    const removed = [...before].filter((p) => !after.has(p));
    if (added.length === 0 && removed.length === 0) return;
    const actor = entry.userId ? await this.userInfo(entry.userId) : null;
    await this.alerts.open(
      'role_change',
      `role_change:role:${role}:${at.getTime()}`,
      `Đổi quyền của vai trò ${ROLE_NAMES[role]}`,
      [added.length && `Thêm: ${added.join(', ')}`, removed.length && `Bỏ: ${removed.join(', ')}`, `Do ${actor?.fullName ?? 'không rõ'} lúc ${formatVnTime(at)}.`]
        .filter(Boolean)
        .join('. '),
    );
  }

  private async userInfo(id: string): Promise<{ fullName: string; roles: Role[] } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(id) },
      select: { fullName: true, roles: { select: { role: { select: { code: true } } } } },
    });
    return user ? { fullName: user.fullName, roles: user.roles.map((r) => r.role.code as Role) } : null;
  }
}
