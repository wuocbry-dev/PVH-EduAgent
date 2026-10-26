import { defaultTimetableFrame } from './timetable.js';

// ───────────────────────────── Nhật ký hoạt động (F16) ─────────────────────────────

export const AUDIT_CHANNELS = ['web', 'telegram', 'scheduler'] as const;
export type AuditChannelName = (typeof AUDIT_CHANNELS)[number];

export const AUDIT_CHANNEL_NAMES: Record<AuditChannelName, string> = {
  web: 'Web',
  telegram: 'Telegram',
  scheduler: 'Bộ lập lịch',
};

// GET /api/audit-logs
export interface AuditLogDto {
  id: string;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  channel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  // { params, ok, error } do AuditLogService ghi.
  payload: unknown;
  ip: string | null;
}

// Phân trang theo con trỏ: truyền nextCursor của trang trước vào `cursor`; null = hết.
export interface AuditLogPageDto {
  items: AuditLogDto[];
  nextCursor: string | null;
}

// GET /api/audit-logs/filters: giá trị để dựng bộ lọc
export interface AuditFiltersDto {
  users: { id: string; name: string }[];
  actions: string[];
}

// ───────────────────────────── Cấu hình hệ thống (F17) ─────────────────────────────

// Danh sách khóa cho phép của bảng system_settings. Không bao giờ lưu API key hay bí mật ở đây
// (chúng nằm trong .env). Schema kiểm tra từng khóa nằm ở apps/api (features/settings).
export const SETTING_KEYS = [
  'school.name',
  'school.address',
  'school.phone',
  'school.email',
  'school.map_url',
  'report.daily_time',
  'reminder.hours_before',
  'telegram.review_notify',
  'teaching.default_quota',
  'timetable.frame',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export interface SettingMeta {
  label: string;
  description: string;
  // Giá trị dùng khi chưa cấu hình.
  defaultValue: string;
  // true = được để trống (xóa cấu hình, quay về mặc định/"Đang cập nhật").
  optional: boolean;
  // Kiểu ô nhập trên giao diện.
  // toggle = công tắc bật/tắt, giá trị lưu là 'true' hoặc 'false'.
  input: 'text' | 'tel' | 'email' | 'url' | 'time' | 'number' | 'toggle' | 'json';
}

export const SETTING_META: Record<SettingKey, SettingMeta> = {
  'school.name': {
    label: 'Tên trường',
    description: 'Hiển thị ở đầu và cuối website công khai.',
    defaultValue: 'Trường THPT Phan Văn Hớn',
    optional: false,
    input: 'text',
  },
  'school.address': {
    label: 'Địa chỉ',
    description: 'Hiển thị ở chân trang và trang Liên hệ.',
    defaultValue: 'Khu tái định cư 38ha, phường Đông Hưng Thuận, TP.HCM',
    optional: false,
    input: 'text',
  },
  'school.phone': {
    label: 'Số điện thoại',
    description: 'Để trống nếu chưa có (website hiện "Đang cập nhật").',
    defaultValue: '',
    optional: true,
    input: 'tel',
  },
  'school.email': {
    label: 'Email',
    description: 'Để trống nếu chưa có (website hiện "Đang cập nhật").',
    defaultValue: '',
    optional: true,
    input: 'email',
  },
  'school.map_url': {
    label: 'Liên kết bản đồ',
    description: 'Địa chỉ https của bản đồ chỉ đúng vị trí trường; để trống thì tìm theo địa chỉ.',
    defaultValue: '',
    optional: true,
    input: 'url',
  },
  'report.daily_time': {
    label: 'Giờ gửi báo cáo ngày',
    description: 'Giờ Việt Nam (HH:mm) bộ lập lịch gửi báo cáo tóm tắt hằng ngày qua Telegram.',
    defaultValue: '07:00',
    optional: false,
    input: 'time',
  },
  'reminder.hours_before': {
    label: 'Nhắc việc trước hạn (giờ)',
    description: 'Số giờ trước hạn chót mà hệ thống nhắc người phụ trách (1–168).',
    defaultValue: '24',
    optional: false,
    input: 'number',
  },
  'telegram.review_notify': {
    label: 'Báo người duyệt qua Telegram khi có bài gửi duyệt',
    description: 'Bật: người có quyền duyệt đã liên kết Telegram nhận ngay tin kèm nội dung bài (và nút Xem toàn văn, Duyệt đăng, Từ chối).',
    defaultValue: 'true',
    optional: false,
    input: 'toggle',
  },
  'teaching.default_quota': {
    label: 'Định mức tiết/tuần của giáo viên',
    description: 'Số tiết/tuần chuẩn của một giáo viên (THPT thường là 17). Có thể ghi đè theo từng giáo viên ở trang Phân công giảng dạy.',
    defaultValue: '17',
    optional: false,
    input: 'number',
  },
  'timetable.frame': {
    label: 'Khung tiết học',
    description: 'Các thứ học và giờ bắt đầu/kết thúc từng tiết (chỉnh ở trang Thời khoá biểu).',
    defaultValue: JSON.stringify(defaultTimetableFrame()),
    optional: false,
    input: 'json',
  },
};

// GET /api/settings
export interface SettingDto {
  key: SettingKey;
  label: string;
  description: string;
  input: SettingMeta['input'];
  optional: boolean;
  defaultValue: string;
  // Giá trị đang lưu; null = chưa cấu hình (đang dùng mặc định).
  value: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

// PATCH /api/settings: chỉ gồm các khóa cần đổi; chuỗi rỗng = xóa (khóa optional)
export type UpdateSettingsRequest = Partial<Record<SettingKey, string>>;

// Tình trạng hàng đợi BullMQ (bộ lập lịch). enabled = false khi chưa cấu hình REDIS_URL.
export interface QueueStatusDto {
  enabled: boolean;
  queues: { name: string; waiting: number; delayed: number; active: number; failed: number }[];
  error?: string;
}

// ───────────────────────────── Dashboard ─────────────────────────────

// GET /api/system/dashboard: mỗi số chỉ có khi người dùng có quyền xem.
export interface DashboardDto {
  postsPendingReview?: number;
  postsScheduled?: number;
  // Người có task:read:all thấy toàn trường; task:read:own chỉ đếm việc của mình.
  tasksOverdue?: number;
  tasksOverdueScope?: 'all' | 'own';
  contactsNew?: number;
  system?: {
    uptimeSec: number;
    memoryMb: number;
    node: string;
    database: 'ok' | 'down';
    queue: QueueStatusDto;
  };
}
