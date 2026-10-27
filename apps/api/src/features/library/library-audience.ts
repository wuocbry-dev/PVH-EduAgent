import type { LibraryAudience } from '@pvh/shared';
import { can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

// Ai đọc được tài liệu nào (bước 21). Kiểm tra ở MỘT chỗ, mỗi lần liệt kê và mỗi lần cấp URL đọc.
//   manage  – thủ thư, BGH (library:manage): mọi tài liệu, mọi trạng thái
//   staff   – nhân sự (mọi vai trò khác học sinh): mọi tài liệu đã đăng, kể cả "chỉ giáo viên" và theo khối/lớp
//   student – học sinh: toàn trường, khối mình, lớp mình (năm học hiện hành); không bao giờ thấy "chỉ giáo viên"
//   khách   – chỉ tài liệu toàn trường (xem danh mục; đọc vẫn phải đăng nhập)
export interface LibraryViewer {
  userId: string | null;
  manage: boolean;
  staff: boolean;
  student: { classId: bigint; gradeLevel: number } | null;
}

export const GUEST: LibraryViewer = { userId: null, manage: false, staff: false, student: null };

type Db = Pick<PrismaService, 'schoolYear' | 'classEnrollment'>;

export async function libraryViewer(prisma: Db, user: AuthUser | null): Promise<LibraryViewer> {
  if (!user) return GUEST;
  const viewer: LibraryViewer = {
    userId: user.id,
    manage: can(user, 'library:manage'),
    staff: user.roles.some((r) => r !== 'STUDENT'),
    student: null,
  };
  if (!viewer.staff && user.roles.includes('STUDENT')) {
    const year = await prisma.schoolYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
    const enrollment = year
      ? await prisma.classEnrollment.findUnique({
          where: { studentId_schoolYearId: { studentId: BigInt(user.id), schoolYearId: year.id } },
          include: { class: { include: { grade: true } } },
        })
      : null;
    if (enrollment) viewer.student = { classId: enrollment.classId, gradeLevel: enrollment.class.grade.level };
  }
  return viewer;
}

// Điều kiện đối tượng xem (chưa gồm trạng thái).
export function audienceWhere(viewer: LibraryViewer): Prisma.LibraryItemWhereInput {
  if (viewer.manage || viewer.staff) return {};
  const or: Prisma.LibraryItemWhereInput[] = [{ audience: 'ALL' }];
  if (viewer.student) {
    or.push(
      { audience: 'GRADE', gradeLevels: { has: viewer.student.gradeLevel } },
      { audience: 'CLASS', classes: { some: { classId: viewer.student.classId } } },
    );
  }
  return { OR: or };
}

// Tài liệu đã đăng mà người này được thấy.
export function publishedWhere(viewer: LibraryViewer): Prisma.LibraryItemWhereInput {
  return { AND: [{ status: 'PUBLISHED' }, audienceWhere(viewer)] };
}

export interface AudienceFacts {
  status: string;
  audience: LibraryAudience;
  gradeLevels: number[];
  classIds: bigint[];
  submittedBy: bigint;
}

// Cùng luật với publishedWhere, cho một tài liệu đã tải (kiểm tra lại trước khi cấp URL đọc). Người gửi luôn đọc được
// tài liệu của mình (để xem lại trước khi gửi duyệt); người quản lý đọc được mọi tài liệu.
export function canRead(viewer: LibraryViewer, item: AudienceFacts): boolean {
  if (!viewer.userId) return false;
  if (viewer.manage || item.submittedBy.toString() === viewer.userId) return true;
  if (item.status !== 'PUBLISHED') return false;
  if (viewer.staff) return true;
  switch (item.audience) {
    case 'ALL':
      return true;
    case 'GRADE':
      return !!viewer.student && item.gradeLevels.includes(viewer.student.gradeLevel);
    case 'CLASS':
      return !!viewer.student && item.classIds.some((c) => c === viewer.student!.classId);
    default:
      return false;
  }
}
