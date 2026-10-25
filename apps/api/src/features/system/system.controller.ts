import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { SystemService } from './system.service.js';

@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Public()
  @Get('health')
  async health() {
    return {
      status: 'ok',
      database: (await this.system.isDatabaseUp()) ? 'ok' : 'down',
    };
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.system.getStatus(user);
  }

  // Số liệu trang tổng quan; mỗi nhóm số liệu chỉ có khi người dùng đủ quyền.
  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.system.getDashboard(user);
  }
}
