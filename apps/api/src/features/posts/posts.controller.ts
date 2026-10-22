import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { PostStatus } from '@pvh/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  createPostSchema,
  type CreatePostInput,
} from './dto/create-post.dto.js';
import { PostsService } from './posts.service.js';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Public()
  @Get()
  listPublished() {
    return this.posts.listPublished();
  }

  @Get('manage')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: PostStatus) {
    return this.posts.list(user, status);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPostSchema)) body: CreatePostInput,
  ) {
    return this.posts.createDraft(user, body);
  }
}
