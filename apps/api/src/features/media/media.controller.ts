import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { MEDIA_MAX_BYTES } from '@pvh/shared';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { MediaService, type UploadedImage } from './media.service.js';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  // multipart/form-data, trường `file`. Bộ nhớ đệm bị chặn ở MEDIA_MAX_BYTES (vượt quá → 413).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_BYTES, files: 1 } }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedImage | undefined,
    @Req() req: Request,
  ) {
    return this.media.upload(user, file, req.ip);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.media.list(user);
  }

  // Phục vụ ảnh đã tải lên cho trang công khai.
  @Public()
  @Get('files/:name')
  file(@Param('name') name: string, @Res() res: Response): Promise<void> {
    const file = this.media.resolveFile(name);
    res.set({
      'Content-Type': file.mime,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Web và API khác cổng: cho phép nhúng ảnh vào trang web.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    return new Promise((done, fail) => {
      res.sendFile(file.name, { root: file.root, dotfiles: 'deny' }, (err) => {
        if (err) fail(new NotFoundException('Không tìm thấy ảnh'));
        else done();
      });
    });
  }
}
