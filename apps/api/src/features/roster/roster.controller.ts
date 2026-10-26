import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ROSTER_KINDS, ROSTER_MAX_BYTES, XLSX_MIME, type RosterKind } from '@pvh/shared';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { buildTemplate } from './excel.js';
import { RosterService } from './roster.service.js';

function parseKind(value: string): RosterKind {
  const kind = value.toUpperCase();
  if (!(ROSTER_KINDS as readonly string[]).includes(kind)) throw new BadRequestException('Loại danh sách phải là student hoặc teacher');
  return kind as RosterKind;
}

// File .xlsx gửi thẳng làm nội dung request (không multipart). Đọc có giới hạn dung lượng: vượt thì dừng ngay, trả 413
// và đóng kết nối (không đệm hết, không dùng `for await` vì thoát sớm sẽ huỷ socket trước khi kịp trả lỗi).
function readLimitedBody(req: Request, res: Response, maxBytes: number): Promise<Buffer> {
  const tooLarge = () =>
    new PayloadTooLargeException(`File quá lớn (tối đa ${ROSTER_MAX_BYTES / 1024 / 1024} MB)`);
  if (Number(req.headers['content-length'] ?? 0) > maxBytes) {
    res.setHeader('Connection', 'close');
    return Promise.reject(tooLarge());
  }
  return new Promise<Buffer>((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.removeAllListeners('data');
        req.pause();
        res.setHeader('Connection', 'close');
        fail(tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

// Nhập danh sách giáo viên/học sinh từ Excel và phát hành mã kích hoạt (bước 14).
@Controller('roster')
export class RosterController {
  constructor(private readonly roster: RosterService) {}

  @Get('templates/:kind')
  async template(@CurrentUser() user: AuthUser, @Param('kind') kind: string) {
    assertPermission(user, 'student:import');
    const parsed = parseKind(kind);
    return new StreamableFile(await buildTemplate(parsed), {
      type: XLSX_MIME,
      disposition: `attachment; filename="mau-nhap-${parsed === 'STUDENT' ? 'hoc-sinh' : 'giao-vien'}.xlsx"`,
    });
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('import/:kind/preview')
  @HttpCode(200)
  async preview(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertPermission(user, 'student:import');
    const parsed = parseKind(kind);
    const file = await readLimitedBody(req, res, ROSTER_MAX_BYTES);
    if (file.length === 0) throw new BadRequestException('Chưa chọn file Excel');
    return this.roster.preview(user, parsed, file, req.ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('import/:previewId/confirm')
  @HttpCode(200)
  confirm(@CurrentUser() user: AuthUser, @Param('previewId') previewId: string, @Req() req: Request) {
    return this.roster.confirm(user, previewId, req.ip);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('users/:userId/activation-code')
  @HttpCode(200)
  reissue(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Req() req: Request) {
    return this.roster.reissue(user, userId, req.ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('classes/:classId/activation-codes')
  @HttpCode(200)
  issueForClass(@CurrentUser() user: AuthUser, @Param('classId') classId: string, @Req() req: Request) {
    return this.roster.issueForClass(user, classId, req.ip);
  }
}
