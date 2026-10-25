import { PrismaPg } from '@prisma/adapter-pg';

// Ép phiên kết nối dùng múi giờ UTC: adapter gửi giá trị DateTime dạng UTC không kèm
// múi giờ, nếu PostgreSQL đặt TimeZone khác (vd. Asia/Bangkok trên Windows) thì
// mọi cột timestamptz bị lưu lệch đúng bằng độ lệch múi giờ đó.
export function createPgAdapter(connectionString: string | undefined) {
  return new PrismaPg({ connectionString, options: '-c TimeZone=UTC' });
}
