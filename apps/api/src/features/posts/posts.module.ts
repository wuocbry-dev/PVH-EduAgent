import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { PostsAgentTools } from './posts.agent-tools.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

@Module({
  imports: [MediaModule],
  controllers: [PostsController],
  providers: [PostsService, PostsAgentTools],
  exports: [PostsService, PostsAgentTools],
})
export class PostsModule {}
