import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { listMediaQuerySchema, presignSchema, type PresignInput } from './dto/media.dto.js';
import { MediaService } from './media.service.js';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  // Bước 1 của luồng tải lên: trả URL ký sẵn để trình duyệt PUT file thẳng lên kho lưu trữ.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('presign')
  presign(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(presignSchema)) body: PresignInput,
    @Req() req: Request,
  ) {
    return this.media.presign(user, body, { ip: req.ip });
  }

  // Bước 3: server kiểm tra object thật sự có trên kho, đúng kích thước và đúng loại rồi mới cho dùng.
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.media.complete(user, id, { ip: req.ip });
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listMediaQuerySchema)) query: { kind?: 'IMAGE' | 'VIDEO' },
  ) {
    return this.media.list(user, query.kind);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.media.remove(user, id, { ip: req.ip });
  }

  // Chỉ có khi STORAGE_DRIVER=local: nơi trình duyệt PUT file (thay cho URL ký sẵn của R2). Xác thực bằng token trong
  // query nên là @Public; thân request là file thô, không qua bộ phân tích JSON.
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
    // Từ chối giữa chừng (vd. file quá lớn) thì đóng kết nối sau khi trả lỗi thay vì đọc nốt phần còn lại.
    res.set('Connection', 'close');
    await this.media.receiveLocalUpload(id, token ?? '', req.get('content-type'), req);
  }

  // Phục vụ file đã tải lên cho trang công khai (chỉ driver local; với R2 file được phục vụ từ địa chỉ công khai của bucket).
  @Public()
  @Get('files/:name')
  async file(@Param('name') name: string, @Res() res: Response): Promise<void> {
    const file = await this.media.resolveFile(name);
    res.set({
      'Content-Type': file.mime,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Web và API khác cổng: cho phép nhúng ảnh/video vào trang web.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    return new Promise((done, fail) => {
      // sendFile hỗ trợ Range nên video tua được.
      res.sendFile(file.name, { root: file.root, dotfiles: 'deny' }, (err) => {
        if (err) fail(new NotFoundException('Không tìm thấy file'));
        else done();
      });
    });
  }
}
