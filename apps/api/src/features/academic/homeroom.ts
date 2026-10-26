import type { AuthUser } from '../../common/types/auth-user.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

// Giáo viên chủ nhiệm không phải vai trò riêng: suy ra từ classes.homeroom_teacher_id.
// Dùng chung cho cấp lại mã kích hoạt (bước 14), xem điểm lớp chủ nhiệm (bước 19), cổng học sinh (bước 20).
export async function isHomeroomOf(
  prisma: Pick<PrismaService, 'schoolClass'>,
  user: Pick<AuthUser, 'id'>,
  classId: bigint,
): Promise<boolean> {
  const count = await prisma.schoolClass.count({
    where: { id: classId, homeroomTeacherId: BigInt(user.id) },
  });
  return count > 0;
}
