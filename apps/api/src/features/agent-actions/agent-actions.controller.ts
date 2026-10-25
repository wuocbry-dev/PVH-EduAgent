import { Controller, Get, Ip, Param, Post } from '@nestjs/common';
import type { AgentActionDto } from '@pvh/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AgentActionsService } from './agent-actions.service.js';

// Trang Trợ lý AI (web) xác nhận/huỷ hành động do agent đề xuất; chỉ người tạo mới thao tác được.
@Controller('agent/actions')
export class AgentActionsController {
  constructor(private readonly actions: AgentActionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<AgentActionDto[]> {
    return this.actions.listPending(user);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string): Promise<AgentActionDto> {
    return this.actions.confirm(user, id, 'web', ip);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<AgentActionDto> {
    return this.actions.cancel(user, id, 'web');
  }
}
