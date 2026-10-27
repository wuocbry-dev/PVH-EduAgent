import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  accessSchema,
  categorySchema,
  completeUploadSchema,
  createItemSchema,
  listQuerySchema,
  progressSchema,
  reviewSchema,
  submissionsQuerySchema,
  updateItemSchema,
  uploadSchema,
  type AccessInput,
  type CategoryInput,
  type CompleteUploadInput,
  type CreateItemInput,
  type ListQuery,
  type ProgressInput,
  type ReviewInput,
  type SubmissionsQuery,
  type UpdateItemInput,
  type UploadInput,
} from './dto/library.dto.js';
import { LibraryItemsService } from './library-items.service.js';
import { LibraryService } from './library.service.js';

// Danh mục công khai của thư viện số (khách): chỉ tài liệu đã đăng dành cho toàn trường; web cache với tag "library".
@Public()
@Controller('public/library')
export class PublicLibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('home')
  home() {
    return this.library.home(null);
  }

  @Get('items')
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.library.list(null, query);
  }

  @Get('items/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.library.bySlug(null, slug);
  }
}

// Thư viện số (bước 21). Quyền và đối tượng xem kiểm tra trong service.
@Controller('library')
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly items: LibraryItemsService,
  ) {}

  // ── Người đọc (đã đăng nhập, theo đối tượng xem) ──

  @Get('items')
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.library.list(user, query);
  }

  @Get('items/by-slug/:slug')
  bySlug(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.library.bySlug(user, slug);
  }

  // URL đọc/tải hết hạn ngắn. Không ghi vào log (nhật ký truy cập chỉ ghi đường dẫn, không ghi query/body).
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('items/:id/access')
  @HttpCode(200)
  access(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(accessSchema)) body: AccessInput,
    @Req() req: Request,
  ) {
    return this.library.access(user, id, body.download, req.ip);
  }

  @Put('items/:id/progress')
  @HttpCode(204)
  async progress(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(progressSchema)) body: ProgressInput) {
    await this.library.saveProgress(user, id, body.position);
  }

  @Put('items/:id/favorite')
  @HttpCode(204)
  async favorite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.library.setFavorite(user, id, true);
  }

  @Delete('items/:id/favorite')
  @HttpCode(204)
  async unfavorite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.library.setFavorite(user, id, false);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.library.mine(user);
  }

  // ── Người gửi (library:submit) và người quản lý (library:manage) ──

  @Get('form-options')
  formOptions(@CurrentUser() user: AuthUser) {
    return this.items.formOptions(user);
  }

  @Get('submissions')
  submissions(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(submissionsQuerySchema)) query: SubmissionsQuery) {
    return this.items.submissions(user, query);
  }

  @Post('items')
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createItemSchema)) body: CreateItemInput, @Req() req: Request) {
    return this.items.create(user, body, req.ip);
  }

  @Get('items/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.items.get(user, id);
  }

  @Patch('items/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateItemSchema)) body: UpdateItemInput,
    @Req() req: Request,
  ) {
    return this.items.update(user, id, body, req.ip);
  }

  @Delete('items/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.items.remove(user, id, req.ip);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('items/:id/upload')
  @HttpCode(200)
  presign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(uploadSchema)) body: UploadInput,
    @Req() req: Request,
  ) {
    return this.items.presign(user, id, body, req.ip);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('items/:id/upload/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeUploadSchema)) body: CompleteUploadInput,
    @Req() req: Request,
  ) {
    return this.items.complete(user, id, body, req.ip);
  }

  @Post('items/:id/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.items.submit(user, id, req.ip);
  }

  @Post('items/:id/review')
  @HttpCode(200)
  review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewSchema)) body: ReviewInput,
    @Req() req: Request,
  ) {
    return this.items.review(user, id, body, req.ip);
  }

  @Get('categories')
  categories(@CurrentUser() user: AuthUser) {
    return this.items.categories(user);
  }

  @Post('categories')
  @HttpCode(204)
  async createCategory(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(categorySchema)) body: CategoryInput, @Req() req: Request) {
    await this.items.saveCategory(user, null, body, req.ip);
  }

  @Patch('categories/:id')
  @HttpCode(204)
  async updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(categorySchema)) body: CategoryInput,
    @Req() req: Request,
  ) {
    await this.items.saveCategory(user, id, body, req.ip);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  async removeCategory(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.items.removeCategory(user, id, req.ip);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.library.stats(user);
  }

  // ── Chỉ có khi kho riêng tư là thư mục local (dev, e2e); với R2 trình duyệt dùng URL ký sẵn của bucket ──

  // Nơi trình duyệt PUT file tài liệu; xác thực bằng token trong query (như URL ký sẵn của R2).
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Put('local-upload/:id')
  @HttpCode(204)
  async localUpload(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.items.receiveLocalUpload(id, token ?? '', req, res);
  }

  // Đọc file bằng URL đã ký (token hết hạn ngắn). sendFile hỗ trợ Range để tua MP3/video.
  @Public()
  @Get('files/:id')
  async file(@Param('id') id: string, @Query('token') token: string | undefined, @Res() res: Response): Promise<void> {
    const file = await this.library.resolveLocalFile(id, token ?? '');
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': file.disposition,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      // Web và API khác cổng: cho phép trình phát và pdf.js của trang web đọc file.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    return new Promise((done, fail) => {
      res.sendFile(file.name, { root: file.root, dotfiles: 'deny', cacheControl: false, lastModified: false }, (err) => {
        if (err) fail(new NotFoundException('Không tìm thấy file'));
        else done();
      });
    });
  }
}
