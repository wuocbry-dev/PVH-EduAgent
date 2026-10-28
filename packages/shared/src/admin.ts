import { DEFAULT_SCORE_FORMULA } from './scores.js';
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
  'telegram.admin_alerts',
  'monitor.error_spike',
  'monitor.job_failures',
  'monitor.login_failures',
  'monitor.r2_quota_gb',
  'monitor.r2_warn_percent',
  'teaching.default_quota',
  'timetable.frame',
  'scores.formula',
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
  'telegram.admin_alerts': {
    label: 'Cảnh báo hệ thống qua Telegram',
    description: 'Bật: người có quyền xem hệ thống nhận cảnh báo khi dịch vụ ngừng/hồi phục, lỗi tăng đột biến, job thất bại, kho R2 sắp đầy và bất thường đăng nhập (người chưa liên kết Telegram nhận trong hộp thông báo).',
    defaultValue: 'true',
    optional: false,
    input: 'toggle',
  },
  'monitor.error_spike': {
    label: 'Ngưỡng lỗi máy chủ (5 phút)',
    description: 'Số lỗi 5xx trong 5 phút để báo "lỗi tăng đột biến" (1–1000).',
    defaultValue: '10',
    optional: false,
    input: 'number',
  },
  'monitor.job_failures': {
    label: 'Ngưỡng job thất bại liên tiếp',
    description: 'Số job của cùng một hàng đợi thất bại hẳn (hết lượt thử) liên tiếp để báo (1–100).',
    defaultValue: '3',
    optional: false,
    input: 'number',
  },
  'monitor.login_failures': {
    label: 'Ngưỡng đăng nhập sai của một tài khoản (15 phút)',
    description: 'Số lần sai mật khẩu của cùng một tài khoản (mọi IP) trong 15 phút để báo (3–1000).',
    defaultValue: '10',
    optional: false,
    input: 'number',
  },
  'monitor.r2_quota_gb': {
    label: 'Dung lượng R2 được dùng (GB)',
    description: 'Tổng dung lượng của gói R2 (gói miễn phí: 10 GB), dùng để tính phần trăm đã dùng (1–100000).',
    defaultValue: '10',
    optional: false,
    input: 'number',
  },
  'monitor.r2_warn_percent': {
    label: 'Cảnh báo khi R2 dùng quá (%)',
    description: 'Phần trăm dung lượng R2 (cả hai bucket) để báo sắp đầy (1–100).',
    defaultValue: '80',
    optional: false,
    input: 'number',
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
  'scores.formula': {
    label: 'Công thức điểm trung bình',
    description:
      'Hệ số từng loại đợt, số cột thường xuyên tối thiểu, cách tính cả năm và làm tròn. Mặc định theo Thông tư 22/2021 (chỉnh ở trang Hạn nhập và khoá sổ của Ban giám hiệu).',
    defaultValue: JSON.stringify(DEFAULT_SCORE_FORMULA),
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
