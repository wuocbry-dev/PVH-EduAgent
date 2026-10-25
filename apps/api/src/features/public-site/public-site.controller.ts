import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  listPublicPostsQuerySchema,
  type ListPublicPostsQuery,
} from './dto/public.dto.js';
import { PublicSiteService } from './public-site.service.js';

// API cho website công khai: không cần đăng nhập, chỉ đọc dữ liệu đã công bố.
@Public()
@Controller('public')
export class PublicSiteController {
  constructor(private readonly site: PublicSiteService) {}

  @Get('posts')
  listPosts(
    @Query(new ZodValidationPipe(listPublicPostsQuerySchema))
    query: ListPublicPostsQuery,
  ) {
    return this.site.listPosts(query);
  }

  @Get('posts/:slug')
  getPost(@Param('slug') slug: string) {
    return this.site.getPost(slug);
  }

  // Trình duyệt gọi một lần sau khi mở bài (không tăng khi render trên server vì trang được cache).
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('posts/:slug/view')
  @HttpCode(204)
  async recordView(
    @Param('slug') slug: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.site.recordView(slug, req.ip ?? 'unknown');
  }

  @Get('admission')
  admission() {
    return this.site.admission();
  }

  @Get('settings')
  settings() {
    return this.site.settings();
  }

  @Get('gallery')
  gallery() {
    return this.site.gallery();
  }
}
