// Tên hàng đợi BullMQ của bộ lập lịch (A05, A06, A09).
export const PUBLISH_QUEUE = 'publish-post';
export const DEADLINE_QUEUE = 'deadline-reminder';
export const REPORT_QUEUE = 'daily-report';
export const AGENT_ACTION_QUEUE = 'agent-action';
export const MEDIA_QUEUE = 'media-cleanup';
export const MONITOR_QUEUE = 'monitoring'; // bước 26: kiểm tra sức khoẻ, đo dung lượng kho, dọn dữ liệu giám sát

export const QUEUE_NAMES = [PUBLISH_QUEUE, DEADLINE_QUEUE, REPORT_QUEUE, AGENT_ACTION_QUEUE, MEDIA_QUEUE, MONITOR_QUEUE] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

// Tên job trong từng hàng đợi.
export const JOB_PUBLISH = 'publish'; // đăng một bài khi đến publish_at, data { postId }
export const JOB_PUBLISH_SWEEP = 'sweep'; // quét bù các bài đã quá giờ mà chưa đăng
export const JOB_DEADLINE_SCAN = 'scan';
export const JOB_DAILY_REPORT = 'report';
export const JOB_MEDIA_CLEANUP = 'cleanup'; // F13: xoá bản ghi media chờ quá 1 giờ chưa hoàn tất cùng object mồ côi
export const JOB_AGENT_ACTION_EXPIRE = 'expire'; // A08: chuyển hành động chờ xác nhận quá hạn sang EXPIRED
export const JOB_HEALTH_CHECK = 'health'; // bước 26: mỗi phút
export const JOB_STORAGE_USAGE = 'storage'; // bước 26: mỗi giờ
export const JOB_MONITOR_CLEANUP = 'cleanup'; // bước 26: mỗi ngày

// Mã bộ lập lịch lặp (job scheduler) trong Redis.
export const SCHEDULER_PUBLISH_SWEEP = 'publish-sweep';
export const SCHEDULER_DEADLINE_SCAN = 'deadline-scan';
export const SCHEDULER_DAILY_REPORT = 'daily-report';
export const SCHEDULER_AGENT_ACTION_EXPIRE = 'agent-action-expire';
export const SCHEDULER_MEDIA_CLEANUP = 'media-cleanup';
export const SCHEDULER_HEALTH_CHECK = 'monitor-health';
export const SCHEDULER_STORAGE_USAGE = 'monitor-storage';
export const SCHEDULER_MONITOR_CLEANUP = 'monitor-cleanup';
export const MONITOR_CLEANUP_CRON = '15 3 * * *'; // 03:15 giờ Việt Nam

export const PUBLISH_ATTEMPTS = 3;
export const PUBLISH_BACKOFF_MS = 5_000;
export const SWEEP_EVERY_MS = 60_000;
export const MEDIA_CLEANUP_EVERY_MS = 15 * 60_000;
export const DEADLINE_SCAN_CRON = '*/5 * * * *';
export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const publishJobId = (postId: string) => `post-${postId}`;
