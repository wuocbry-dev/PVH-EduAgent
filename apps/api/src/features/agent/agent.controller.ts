import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AgentService } from './agent.service.js';
import { chatSchema, type ChatInput } from './dto/chat.dto.js';

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  // Mỗi lượt chat tốn tiền (gọi mô hình) nên giới hạn chặt: 10 lượt/phút/tài khoản.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('chat')
  chat(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(chatSchema)) body: ChatInput,
  ) {
    return this.agent.chat({ user, channel: 'web' }, body.message);
  }
}
