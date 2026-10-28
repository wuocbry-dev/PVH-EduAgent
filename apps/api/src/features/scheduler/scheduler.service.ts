import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import {
  AGENT_ACTION_QUEUE,
  DEADLINE_QUEUE,
  JOB_AGENT_ACTION_EXPIRE,
  JOB_MEDIA_CLEANUP,
  MEDIA_CLEANUP_EVERY_MS,
  MEDIA_QUEUE,
  SCHEDULER_MEDIA_CLEANUP,
  DEADLINE_SCAN_CRON,
  JOB_DEADLINE_SCAN,
  JOB_HEALTH_CHECK,
  JOB_MONITOR_CLEANUP,
  JOB_PUBLISH_SWEEP,
  JOB_STORAGE_USAGE,
  MONITOR_CLEANUP_CRON,
  MONITOR_QUEUE,
  PUBLISH_QUEUE,
  REPORT_QUEUE,
  SCHEDULER_AGENT_ACTION_EXPIRE,
  SCHEDULER_DEADLINE_SCAN,
  SCHEDULER_HEALTH_CHECK,
  SCHEDULER_MONITOR_CLEANUP,
  SCHEDULER_PUBLISH_SWEEP,
  SCHEDULER_STORAGE_USAGE,
  SWEEP_EVERY_MS,
  TIME_ZONE,
  publishJobId,
} from '../../infrastructure/queue/queue.constants.js';
import { MONITOR_INTERVAL_SEC, STORAGE_USAGE_EVERY_SEC } from '@pvh/shared';
import { QueueService } from '../../infrastructure/queue/queue.service.js';
import { AgentActionsService } from '../agent-actions/agent-actions.service.js';
import { MediaService } from '../media/media.service.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { SystemErrorsService } from '../monitoring/system-errors.service.js';
import { PostsService } from '../posts/posts.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { DailyReportProcessor } from './daily-report.processor.js';
import { DeadlineReminderProcessor } from './deadline-reminder.processor.js';
import { PublishPostProcessor } from './publish-post.processor.js';

// Khởi chạy các Worker BullMQ, đăng ký các job lặp và quét bù khi máy chủ khởi động (A05, A06, A09).
// Không có REDIS_URL thì không làm gì (QueueService.enabled = false).
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly workers: Worker[] = [];

  constructor(
    private readonly queue: QueueService,
    private readonly posts: PostsService,
    private readonly settings: SettingsService,
    private readonly publisher: PublishPostProcessor,
    private readonly deadlines: DeadlineReminderProcessor,
    private readonly reports: DailyReportProcessor,
    private readonly agentActions: AgentActionsService,
    private readonly media: MediaService,
    private readonly monitoring: MonitoringService,
    private readonly systemErrors: SystemErrorsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.queue.enabled) return;
    this.startWorkers();
    await this.registerSchedules();
    // Quét bù ngay: bài đã quá giờ lúc máy chủ tắt được đăng, bài sắp tới được dựng lại job nếu thiếu.
    await this.catchUp();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    this.workers.length = 0;
  }

  // Đăng các bài đã quá giờ và dựng lại job cho các bài hẹn giờ còn ở tương lai nếu Redis chưa có.
  async catchUp(): Promise<{ published: string; rescheduled: number }> {
    const published = await this.publisher.sweep();
    let rescheduled = 0;
    const publishQueue = this.queue.queue(PUBLISH_QUEUE);
    if (publishQueue) {
      for (const post of await this.posts.findUpcomingScheduled()) {
        if (await publishQueue.getJob(publishJobId(post.id))) continue;
        await this.queue.schedulePublish(post.id, post.publishAt);
        rescheduled++;
      }
    }
    if (rescheduled > 0) this.logger.log(`Đã dựng lại ${rescheduled} job đăng bài còn thiếu`);
    return { published, rescheduled };
  }

  private startWorkers(): void {
    const connection = this.queue.workerConnection();
    if (!connection) return;
    const options = { connection, prefix: this.queue.prefix };
    const start = (name: string, handler: (job: Job) => Promise<unknown>) => {
      const worker = new Worker(name, handler, { ...options, concurrency: 5 });
      worker.on('error', (err) => this.logger.error(`Worker ${name}: ${err.message}`));
      // Bước 26: job thất bại hẳn (hết lượt thử) vào nhật ký lỗi; chạy được lại thì đặt lại chuỗi thất bại liên tiếp.
      worker.on('failed', (job, err) => {
        if (!job) return;
        const final = job.attemptsMade >= (job.opts.attempts ?? 1);
        void this.systemErrors.recordJob(name, job.name, job.attemptsMade, err, final);
      });
      worker.on('completed', () => void this.systemErrors.jobSucceeded(name));
      this.workers.push(worker);
      return worker;
    };

    start(PUBLISH_QUEUE, (job) => this.publisher.process(job)).on('failed', (job, err) => {
      if (job) {
        this.publisher
          .onFinalFailure(job, err)
          .catch((e) => this.logger.error(`Không gửi được cảnh báo lỗi đăng bài: ${String(e)}`));
      }
    });
    start(DEADLINE_QUEUE, () => this.deadlines.run());
    start(REPORT_QUEUE, () => this.reports.run());
    start(AGENT_ACTION_QUEUE, () => this.agentActions.expireDue());
    start(MEDIA_QUEUE, () => this.media.cleanupStale());
    start(MONITOR_QUEUE, (job) => {
      if (job.name === JOB_STORAGE_USAGE) return this.monitoring.measureStorage();
      if (job.name === JOB_MONITOR_CLEANUP) return this.monitoring.cleanup();
      return this.monitoring.runHealthCheck();
    });
  }

  private async registerSchedules(): Promise<void> {
    const publish = this.queue.queue(PUBLISH_QUEUE);
    const deadline = this.queue.queue(DEADLINE_QUEUE);
    const agentAction = this.queue.queue(AGENT_ACTION_QUEUE);
    const media = this.queue.queue(MEDIA_QUEUE);
    const monitor = this.queue.queue(MONITOR_QUEUE);
    const jobOpts = { removeOnComplete: true, removeOnFail: 50 };
    try {
      await publish?.upsertJobScheduler(
        SCHEDULER_PUBLISH_SWEEP,
        { every: SWEEP_EVERY_MS },
        { name: JOB_PUBLISH_SWEEP, opts: jobOpts },
      );
      await deadline?.upsertJobScheduler(
        SCHEDULER_DEADLINE_SCAN,
        { pattern: DEADLINE_SCAN_CRON, tz: TIME_ZONE },
        { name: JOB_DEADLINE_SCAN, opts: jobOpts },
      );
      await agentAction?.upsertJobScheduler(
        SCHEDULER_AGENT_ACTION_EXPIRE,
        { every: SWEEP_EVERY_MS },
        { name: JOB_AGENT_ACTION_EXPIRE, opts: jobOpts },
      );
      await media?.upsertJobScheduler(
        SCHEDULER_MEDIA_CLEANUP,
        { every: MEDIA_CLEANUP_EVERY_MS },
        { name: JOB_MEDIA_CLEANUP, opts: jobOpts },
      );
      await this.queue.scheduleDailyReport(await this.settings.effective('report.daily_time'));
      // Bước 26: tắt bằng MONITORING_ENABLED=false (e2e) thì gỡ lịch cũ nếu có.
      if (this.monitoring.enabled) {
        await monitor?.upsertJobScheduler(SCHEDULER_HEALTH_CHECK, { every: MONITOR_INTERVAL_SEC * 1000 }, { name: JOB_HEALTH_CHECK, opts: jobOpts });
        await monitor?.upsertJobScheduler(SCHEDULER_STORAGE_USAGE, { every: STORAGE_USAGE_EVERY_SEC * 1000 }, { name: JOB_STORAGE_USAGE, opts: jobOpts });
        await monitor?.upsertJobScheduler(
          SCHEDULER_MONITOR_CLEANUP,
          { pattern: MONITOR_CLEANUP_CRON, tz: TIME_ZONE },
          { name: JOB_MONITOR_CLEANUP, opts: jobOpts },
        );
      } else {
        for (const id of [SCHEDULER_HEALTH_CHECK, SCHEDULER_STORAGE_USAGE, SCHEDULER_MONITOR_CLEANUP]) await monitor?.removeJobScheduler(id);
      }
    } catch (err) {
      this.logger.error(`Không đăng ký được các job lặp: ${String(err)}`);
    }
  }
}
