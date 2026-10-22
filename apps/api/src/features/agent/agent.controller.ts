import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AgentService } from './agent.service.js';
import { chatSchema, type ChatInput } from './dto/chat.dto.js';

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('chat')
  chat(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(chatSchema)) body: ChatInput,
  ) {
    return this.agent.chat({ user, channel: 'web' }, body.message);
  }
}
