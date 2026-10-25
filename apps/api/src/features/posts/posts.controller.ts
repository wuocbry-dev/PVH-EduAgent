import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  approvePostSchema,
  createPostFormSchema,
  listPostsQuerySchema,
  rejectPostSchema,
  reschedulePostSchema,
  updatePostSchema,
  type ApprovePostInput,
  type CreatePostFormInput,
  type ListPostsQuery,
  type RejectPostInput,
  type ReschedulePostInput,
  type UpdatePostInput,
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
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listPostsQuerySchema)) query: ListPostsQuery,
  ) {
    return this.posts.list(user, query.status, query.categoryId);
  }

  @Get('manage/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.posts.get(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPostFormSchema)) body: CreatePostFormInput,
    @Req() req: Request,
  ) {
    return this.posts.createDraft(user, body, { ip: req.ip });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePostSchema)) body: UpdatePostInput,
    @Req() req: Request,
  ) {
    return this.posts.update(user, id, body, { ip: req.ip });
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.posts.transition(user, id, 'submit', {}, { ip: req.ip });
  }

  // Không có publishAt = duyệt và đăng ngay; có publishAt = duyệt và hẹn giờ.
  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approvePostSchema)) body: ApprovePostInput,
    @Req() req: Request,
  ) {
    return this.posts.transition(user, id, 'approve', body, { ip: req.ip });
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectPostSchema)) body: RejectPostInput,
    @Req() req: Request,
  ) {
    return this.posts.transition(user, id, 'reject', body, { ip: req.ip });
  }

  @Post(':id/reschedule')
  @HttpCode(200)
  reschedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reschedulePostSchema))
    body: ReschedulePostInput,
    @Req() req: Request,
  ) {
    return this.posts.transition(user, id, 'reschedule', body, { ip: req.ip });
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.posts.transition(user, id, 'publish', {}, { ip: req.ip });
  }

  @Post(':id/cancel-schedule')
  @HttpCode(200)
  cancelSchedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.posts.transition(
      user,
      id,
      'cancel_schedule',
      {},
      { ip: req.ip },
    );
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.posts.transition(user, id, 'unpublish', {}, { ip: req.ip });
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.posts.transition(user, id, 'restore', {}, { ip: req.ip });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.posts.remove(user, id, { ip: req.ip });
  }
}
