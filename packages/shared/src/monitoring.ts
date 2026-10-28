// Trung tâm giám sát hệ thống (bước 26): kiểm tra sức khoẻ định kỳ, nhật ký lỗi, cảnh báo, bảo vệ tài khoản.
import type { QueueStatusDto } from './admin.js';

export const MONITOR_SERVICES = ['database', 'redis', 'queue', 'r2_public', 'r2_private', 'telegram', 'claude'] as const;
export type MonitorService = (typeof MONITOR_SERVICES)[number];

export const MONITOR_SERVICE_NAMES: Record<MonitorService, string> = {
  database: 'Cơ sở dữ liệu (PostgreSQL)',
  redis: 'Redis',
  queue: 'Hàng đợi (BullMQ)',
  r2_public: 'Kho ảnh/video (công khai)',
  r2_private: 'Kho tài liệu (riêng tư)',
  telegram: 'Bot Telegram',
  claude: 'Claude API (chỉ kiểm cấu hình)',
};

// OFF = dịch vụ không dùng/chưa cấu hình (vd. bot Telegram tắt): không báo động.
export const HEALTH_STATUSES = ['OK', 'DEGRADED', 'DOWN', 'OFF'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];
export const HEALTH_STATUS_NAMES: Record<HealthStatus, string> = {
  OK: 'Bình thường',
  DEGRADED: 'Chậm',
  DOWN: 'Ngừng',
  OFF: 'Không dùng',
};

export const MONITOR_INTERVAL_SEC = 60;
export const HEALTH_RETENTION_DAYS = 7;
export const ERROR_RETENTION_DAYS = 30;
// Kiểm tra mất lâu hơn mức này thì coi là "chậm".
export const HEALTH_DEGRADED_MS = 2000;
export const HEALTH_TIMEOUT_MS = 8000;
// Đo dung lượng R2 (liệt kê object) mỗi giờ.
export const STORAGE_USAGE_EVERY_SEC = 60 * 60;
// Cửa sổ đếm lỗi 5xx và đăng nhập sai.
export const ERROR_SPIKE_WINDOW_SEC = 5 * 60;
export const LOGIN_FAILURE_WINDOW_SEC = 15 * 60;
// Đăng nhập BGH/ADMIN từ IP hoặc trình duyệt chưa thấy trong ngần này ngày thì báo.
export const NEW_LOGIN_LOOKBACK_DAYS = 90;
// Tối đa số tin cảnh báo mỗi giờ (chống spam); vượt thì chỉ ghi vào trang Giám sát.
export const ALERT_MESSAGES_PER_HOUR = 30;
export const BULK_USER_ACTION_MAX = 200;

export interface HealthSnapshotDto {
  service: MonitorService;
  name: string;
  status: HealthStatus;
  latencyMs: number | null;
  message: string | null;
  checkedAt: string | null;
}

export interface HealthHourDto {
  hour: string; // ISO, đầu giờ
  avgMs: number | null;
  down: number; // số lần DOWN trong giờ
}

export const ALERT_KINDS = [
  'service_down',
  'error_spike',
  'job_failures',
  'storage',
  'login_failures',
  'new_login',
  'privileged_account',
  'role_change',
  'agent_abuse',
  'agent_quota',
  'agent_switch',
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
export const ALERT_KIND_NAMES: Record<AlertKind, string> = {
  service_down: 'Dịch vụ ngừng',
  error_spike: 'Lỗi tăng đột biến',
  job_failures: 'Job thất bại liên tiếp',
  storage: 'Kho R2 sắp đầy',
  login_failures: 'Sai mật khẩu nhiều lần',
  new_login: 'Đăng nhập từ nơi lạ',
  privileged_account: 'Tài khoản quản trị/BGH mới',
  role_change: 'Đổi vai trò hoặc quyền',
  agent_abuse: 'Nghi lạm dụng Trợ lý AI',
  agent_quota: 'Trợ lý AI chạm hạn mức',
  agent_switch: 'Đổi công tắc Trợ lý AI',
};

export interface SystemAlertDto {
  id: string;
  kind: AlertKind;
  title: string;
  detail: string | null;
  openedAt: string;
  resolvedAt: string | null;
}

export interface SystemErrorDto {
  id: string;
  source: 'HTTP' | 'JOB';
  route: string;
  statusCode: number | null;
  message: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface StorageUsageDto {
  measuredAt: string;
  driver: 'local' | 'r2';
  publicBytes: number;
  privateBytes: number;
  totalBytes: number;
  quotaBytes: number;
  percent: number;
}

export interface MonitoringOverviewDto {
  services: HealthSnapshotDto[];
  latency24h: { service: MonitorService; hours: HealthHourDto[] }[];
  errorsByHour: { hour: string; count: number }[];
  topErrors: SystemErrorDto[];
  queue: QueueStatusDto;
  storage: StorageUsageDto | null;
  failedLogins24h: number;
  blockedCount: number;
  openAlerts: SystemAlertDto[];
  system: { uptimeSec: number; memoryMb: number; node: string };
  monitoringEnabled: boolean;
  alertsEnabled: boolean;
}

export interface FailedJobDto {
  queue: string;
  id: string;
  name: string;
  reason: string;
  attemptsMade: number;
  failedAt: string | null;
}

export interface BlockedEntryDto {
  limit: 'login' | 'login-ip' | 'activate-ip' | 'activate-id';
  label: string;
  id: string; // IP, "IP|tên đăng nhập" hoặc mã đăng nhập
  count: number;
  retryAfterSec: number;
}

export interface FailedLoginDto {
  identifier: string;
  count: number;
  ips: string[];
  lastAt: string;
}

export interface SecurityOverviewDto {
  failedLogins: FailedLoginDto[];
  blocked: BlockedEntryDto[];
  alerts: SystemAlertDto[];
}

export interface UserSessionDto {
  id: string;
  createdAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
}

export const BULK_USER_ACTIONS = ['lock', 'logout'] as const;
export type BulkUserAction = (typeof BULK_USER_ACTIONS)[number];

export interface BulkUserActionInput {
  action: BulkUserAction;
  userIds: string[];
  password: string; // mật khẩu hiện tại của người thao tác
}

export interface BulkUserActionResultDto {
  done: number;
  skipped: { userId: string; reason: string }[];
}

// ───────────── Giám sát AI Agent (bước 27) ─────────────
// Chỉ số lượng và tên tool: không bao giờ có nội dung lệnh, câu trả lời hay kết quả tool.

export const AGENT_SWITCH_KEYS = ['agent.enabled', 'agent.sensitive_tools', 'telegram.bot_enabled'] as const;
export type AgentSwitchKey = (typeof AGENT_SWITCH_KEYS)[number];
// Đủ ngần này lần bị từ chối vì thiếu quyền trong 1 giờ / tin nghi tiêm lệnh trong 1 ngày thì báo ADMIN.
export const AGENT_DENIED_ALERT = 5;
export const AGENT_INJECTION_ALERT = 3;
export const AGENT_STATS_MAX_DAYS = 60;

export interface AgentDayStatDto {
  day: string; // YYYY-MM-DD, giờ Việt Nam
  web: number;
  telegram: number;
  errors: number;
  flagged: number;
  costUsd: number;
}

export interface AgentToolStatDto {
  tool: string;
  calls: number;
  errors: number;
  denied: number;
}

export interface AgentStatsDto {
  days: AgentDayStatDto[];
  byRole: { role: string; commands: number }[];
  tools: AgentToolStatDto[];
  actions: { status: string; count: number }[];
  today: {
    commands: number;
    costUsd: number;
    limits: { perUser: number; total: number; costUsd: number; hourlyAlert: number };
  };
  switches: Record<AgentSwitchKey, boolean>;
  alerts: SystemAlertDto[];
}
