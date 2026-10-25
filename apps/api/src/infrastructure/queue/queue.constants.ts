// Tên hàng đợi BullMQ của bộ lập lịch (A05, A06, A09).
export const PUBLISH_QUEUE = 'publish-post';
export const DEADLINE_QUEUE = 'deadline-reminder';
export const REPORT_QUEUE = 'daily-report';
export const AGENT_ACTION_QUEUE = 'agent-action';

export const QUEUE_NAMES = [PUBLISH_QUEUE, DEADLINE_QUEUE, REPORT_QUEUE, AGENT_ACTION_QUEUE] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

// Tên job trong từng hàng đợi.
export const JOB_PUBLISH = 'publish'; // đăng một bài khi đến publish_at, data { postId }
export const JOB_PUBLISH_SWEEP = 'sweep'; // quét bù các bài đã quá giờ mà chưa đăng
export const JOB_DEADLINE_SCAN = 'scan';
export const JOB_DAILY_REPORT = 'report';
export const JOB_AGENT_ACTION_EXPIRE = 'expire'; // A08: chuyển hành động chờ xác nhận quá hạn sang EXPIRED

// Mã bộ lập lịch lặp (job scheduler) trong Redis.
export const SCHEDULER_PUBLISH_SWEEP = 'publish-sweep';
export const SCHEDULER_DEADLINE_SCAN = 'deadline-scan';
export const SCHEDULER_DAILY_REPORT = 'daily-report';
export const SCHEDULER_AGENT_ACTION_EXPIRE = 'agent-action-expire';

export const PUBLISH_ATTEMPTS = 3;
export const PUBLISH_BACKOFF_MS = 5_000;
export const SWEEP_EVERY_MS = 60_000;
export const DEADLINE_SCAN_CRON = '*/5 * * * *';
export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const publishJobId = (postId: string) => `post-${postId}`;
