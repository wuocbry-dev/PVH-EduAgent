import { SETTING_KEYS, type SettingKey } from '@pvh/shared';
import { z } from 'zod';

// Schema kiểm tra giá trị cho từng khóa cho phép (giá trị luôn lưu dạng chuỗi trong system_settings).
// Chuỗi rỗng nghĩa là xóa cấu hình, chỉ áp dụng cho khóa optional trong SETTING_META (kiểm tra ở service).
const text = (max: number) => z.string().trim().min(1, 'Không được để trống').max(max);
const optionalOr = <T extends z.ZodType<string>>(schema: T) =>
  z.union([z.literal(''), schema]);

export const settingValueSchemas: Record<SettingKey, z.ZodType<string>> = {
  'school.name': text(150),
  'school.address': text(255),
  'school.phone': optionalOr(
    z
      .string()
      .trim()
      .regex(/^[0-9+\s().-]{6,20}$/, 'Số điện thoại không hợp lệ'),
  ),
  'school.email': optionalOr(z.email('Email không hợp lệ').max(150)),
  'school.map_url': optionalOr(
    z
      .url('Liên kết không hợp lệ')
      .max(500)
      .refine((v) => v.startsWith('https://'), 'Chỉ nhận liên kết https'),
  ),
  'report.daily_time': z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:mm, ví dụ 17:00'),
  'reminder.hours_before': z
    .string()
    .regex(/^\d{1,3}$/, 'Phải là số nguyên từ 1 đến 168')
    .refine((v) => Number(v) >= 1 && Number(v) <= 168, 'Phải từ 1 đến 168 giờ'),
};

// Chỉ nhận các khóa trong danh sách cho phép: khóa lạ (kể cả tên giống bí mật như
// "anthropic.api_key") bị từ chối, không bị bỏ qua âm thầm.
export const updateSettingsSchema = z
  .strictObject(
    Object.fromEntries(
      SETTING_KEYS.map((key) => [key, settingValueSchemas[key].optional()]),
    ) as Record<SettingKey, z.ZodOptional<z.ZodType<string>>>,
  )
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Chưa có giá trị nào để cập nhật',
  });
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
