import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
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
import { readLimitedBody } from '../../common/utils/read-limited-body.js';
import { buildTemplate } from './excel.js';
import { RosterService } from './roster.service.js';

function parseKind(value: string): RosterKind {
  const kind = value.toUpperCase();
  if (!(ROSTER_KINDS as readonly string[]).includes(kind)) throw new BadRequestException('Loại danh sách phải là student hoặc teacher');
  return kind as RosterKind;
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
