import { Module } from '@nestjs/common';
import { ERROR_SINK } from '../../common/filters/error-sink.js';
import { AgentModule } from '../agent/agent.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { AccountWatchService } from './account-watch.service.js';
import { AgentStatsService } from './agent-stats.service.js';
import { AgentWatchService } from './agent-watch.service.js';
import { HealthProbeService } from './health-probe.service.js';
import { MonitoringAlertsService } from './monitoring-alerts.service.js';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringService } from './monitoring.service.js';
import { SystemErrorsService } from './system-errors.service.js';

// Bước 26 – trung tâm giám sát:
// - health-probe.service.ts       kiểm tra PostgreSQL, Redis, hàng đợi, kho R2, bot Telegram, cấu hình Claude
// - monitoring.service.ts         job định kỳ (sức khoẻ mỗi phút, dung lượng mỗi giờ, dọn mỗi ngày) và số liệu trang /admin
// - system-errors.service.ts      nhật ký lỗi 5xx/job (ERROR_SINK của AllExceptionsFilter), lỗi tăng đột biến
// - monitoring-alerts.service.ts  mở/đóng cảnh báo, gửi cho người có system:read (Telegram hoặc hộp thông báo)
// - account-watch.service.ts      bất thường đăng nhập, tài khoản quản trị mới, đổi vai trò/quyền (đọc audit_logs)
// Bước 27 – giám sát AI Agent:
// - agent-watch.service.ts        sự kiện của AgentGuardService (hạn mức, lạm dụng) và đổi công tắc khẩn cấp → cảnh báo
// - agent-stats.service.ts        thống kê lệnh/tool/xác nhận 2 bước (chỉ số lượng, không có nội dung)
// Phiên đăng nhập, buộc đăng xuất, thao tác hàng loạt nằm ở features/users (user-sessions.service.ts).
@Module({
  imports: [SettingsModule, TelegramModule, AgentModule],
  controllers: [MonitoringController],
  providers: [
    HealthProbeService,
    MonitoringService,
    SystemErrorsService,
    MonitoringAlertsService,
    AccountWatchService,
    // Bước 27: cảnh báo lạm dụng / hạn mức / đổi công tắc AI và thống kê AI Agent.
    AgentWatchService,
    AgentStatsService,
    { provide: ERROR_SINK, useExisting: SystemErrorsService },
  ],
  exports: [MonitoringService, SystemErrorsService, ERROR_SINK],
})
export class MonitoringModule {}
