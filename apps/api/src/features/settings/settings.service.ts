import { Injectable } from '@nestjs/common';
import {
  SETTING_KEYS,
  SETTING_META,
  type SettingDto,
  type SettingKey,
} from '@pvh/shared';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RevalidateService } from '../../infrastructure/revalidate/revalidate.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import type { UpdateSettingsInput } from './dto/settings.dto.js';

// F17 – cấu hình hệ thống (bảng system_settings). Xem: system:read (ADMIN, BGH); sửa: chỉ setting:manage (ADMIN).
// Chỉ các khóa trong SETTING_KEYS; API key và bí mật không bao giờ lưu ở đây (nằm trong .env).
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly revalidate: RevalidateService,
  ) {}

  async list(user: AuthUser): Promise<SettingDto[]> {
    assertPermission(user, 'system:read');
    return this.read();
  }

  async update(
    user: AuthUser,
    input: UpdateSettingsInput,
    ip?: string,
  ): Promise<SettingDto[]> {
    assertPermission(user, 'setting:manage');
    const current = new Map(
      (
        await this.prisma.systemSetting.findMany({
          where: { key: { in: [...SETTING_KEYS] } },
        })
      ).map((row) => [row.key, row.value]),
    );

    const changes: Record<string, { from: string | null; to: string | null }> = {};
    for (const key of SETTING_KEYS) {
      const value = input[key];
      if (value === undefined) continue;
      const from = current.get(key) ?? null;
      // Chuỗi rỗng = xóa cấu hình (schema chỉ cho phép với khóa optional).
      const to = value === '' ? null : value;
      if (from === to) continue;
      changes[key] = { from, to };
      if (to === null) {
        await this.prisma.systemSetting.deleteMany({ where: { key } });
      } else {
        await this.prisma.systemSetting.upsert({
          where: { key },
          update: { value: to, updatedBy: BigInt(user.id) },
          create: { key, value: to, updatedBy: BigInt(user.id) },
        });
      }
    }

    if (Object.keys(changes).length > 0) {
      await this.audit.record({
        userId: user.id,
        channel: 'web',
        action: 'setting.update',
        targetType: 'setting',
        params: { changes },
        ok: true,
        ip,
      });
      // Tên trường, địa chỉ, điện thoại... hiển thị trên website công khai (cache tag "settings").
      await this.revalidate.revalidate('settings');
    }
    return this.read();
  }

  private async read(): Promise<SettingDto[]> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [...SETTING_KEYS] } },
      include: { updater: { select: { fullName: true } } },
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return SETTING_KEYS.map((key: SettingKey) => {
      const row = byKey.get(key);
      const meta = SETTING_META[key];
      return {
        key,
        label: meta.label,
        description: meta.description,
        input: meta.input,
        optional: meta.optional,
        defaultValue: meta.defaultValue,
        value: row?.value ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
        updatedByName: row?.updater?.fullName ?? null,
      };
    });
  }
}
