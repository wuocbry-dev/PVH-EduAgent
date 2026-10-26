import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Audience, AudienceTargetsDto } from '@pvh/shared';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

// Ai thấy gì (bước 20), dùng chung cho thông báo và sự kiện có đối tượng.
//   all     – người quản lý (BGH với thông báo, biên tập/BGH với sự kiện): thấy mọi mục
//   student – học sinh: toàn trường, khối mình, lớp mình (không bao giờ thấy "chỉ nhân sự")
//   staff   – nhân sự (mọi vai trò khác học sinh): toàn trường, chỉ nhân sự, lớp/khối mình dạy hoặc chủ nhiệm
// Ai cũng thấy mục do chính mình tạo.
export interface ViewerScope {
  all: boolean;
  student: { classId: bigint; gradeLevel: number } | null;
  staff: boolean;
  classIds: bigint[];
  gradeLevels: number[];
}

type Db = Pick<PrismaService, 'schoolYear' | 'classEnrollment' | 'teachingAssignment' | 'schoolClass'>;

// Các lớp (năm học hiện hành) mà giáo viên dạy hoặc chủ nhiệm.
async function teacherClasses(prisma: Db, userId: bigint, schoolYearId: bigint) {
  const [taught, homeroom] = await Promise.all([
    prisma.teachingAssignment.findMany({ where: { teacherId: userId, schoolYearId }, include: { class: { include: { grade: true } } } }),
    prisma.schoolClass.findMany({ where: { homeroomTeacherId: userId, schoolYearId }, include: { grade: true } }),
  ]);
  const map = new Map<string, { id: bigint; name: string; gradeLevel: number; homeroom: boolean }>();
  for (const t of taught) map.set(t.classId.toString(), { id: t.classId, name: t.class.name, gradeLevel: t.class.grade.level, homeroom: false });
  for (const c of homeroom) map.set(c.id.toString(), { id: c.id, name: c.name, gradeLevel: c.grade.level, homeroom: true });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export async function viewerScope(prisma: Db, user: AuthUser, all: boolean): Promise<ViewerScope> {
  const scope: ViewerScope = { all, student: null, staff: user.roles.some((r) => r !== 'STUDENT'), classIds: [], gradeLevels: [] };
  if (all) return scope;
  const year = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });
  if (!year) return scope;
  const uid = BigInt(user.id);
  if (user.roles.includes('STUDENT')) {
    const enrollment = await prisma.classEnrollment.findUnique({
      where: { studentId_schoolYearId: { studentId: uid, schoolYearId: year.id } },
      include: { class: { include: { grade: true } } },
    });
    if (enrollment) scope.student = { classId: enrollment.classId, gradeLevel: enrollment.class.grade.level };
  }
  if (scope.staff) {
    const classes = await teacherClasses(prisma, uid, year.id);
    scope.classIds = classes.map((c) => c.id);
    scope.gradeLevels = [...new Set(classes.map((c) => c.gradeLevel))];
  }
  return scope;
}

// Điều kiện Prisma cho bảng có các cột audience / grade_level / class_id / created_by (announcements, events).
export function visibleWhere<W>(scope: ViewerScope, userId: string): W {
  if (scope.all) return {} as W;
  const or: Record<string, unknown>[] = [{ audience: 'SCHOOL' }, { createdBy: BigInt(userId) }];
  if (scope.student) {
    or.push({ audience: 'GRADE', gradeLevel: scope.student.gradeLevel }, { audience: 'CLASS', classId: scope.student.classId });
  }
  if (scope.staff) {
    or.push({ audience: 'TEACHERS' });
    if (scope.classIds.length) or.push({ audience: 'CLASS', classId: { in: scope.classIds } });
    if (scope.gradeLevels.length) or.push({ audience: 'GRADE', gradeLevel: { in: scope.gradeLevels } });
  }
  return { OR: or } as W;
}

// Đối tượng người dùng được nhắm tới: người quản lý mọi lớp/khối của năm hiện hành; giáo viên chỉ lớp mình dạy/chủ nhiệm.
export async function audienceTargets(prisma: Db, user: AuthUser, manageAll: boolean): Promise<AudienceTargetsDto> {
  const year = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });
  if (!year) return { manageAll, grades: manageAll ? [10, 11, 12] : [], classes: [] };
  const classes = manageAll
    ? (
        await prisma.schoolClass.findMany({
          where: { schoolYearId: year.id },
          include: { grade: true },
          orderBy: { name: 'asc' },
        })
      ).map((c) => ({ id: c.id, name: c.name, gradeLevel: c.grade.level, homeroom: c.homeroomTeacherId?.toString() === user.id }))
    : await teacherClasses(prisma, BigInt(user.id), year.id);
  return {
    manageAll,
    grades: manageAll ? [10, 11, 12] : [],
    classes: classes.map((c) => ({ id: c.id.toString(), name: c.name, gradeLevel: c.gradeLevel, homeroom: c.homeroom })),
  };
}

export interface TargetInput {
  audience: Audience;
  gradeLevel?: number | null;
  classId?: string | null;
}

// Kiểm tra đối tượng hợp lệ và trong phạm vi được gửi; trả về giá trị chuẩn để lưu.
export function resolveTarget(
  input: TargetInput,
  targets: AudienceTargetsDto,
): { audience: Audience; gradeLevel: number | null; classId: bigint | null; className: string | null } {
  if (input.audience === 'CLASS') {
    if (!input.classId) throw new BadRequestException('Chưa chọn lớp');
    const cls = targets.classes.find((c) => c.id === input.classId);
    if (!cls) {
      throw targets.manageAll
        ? new BadRequestException('Lớp không thuộc năm học hiện hành')
        : new ForbiddenException('Bạn chỉ gửi được cho lớp mình dạy hoặc chủ nhiệm');
    }
    return { audience: 'CLASS', gradeLevel: null, classId: BigInt(cls.id), className: cls.name };
  }
  if (!targets.manageAll) throw new ForbiddenException('Giáo viên chỉ gửi được cho lớp mình dạy hoặc chủ nhiệm');
  if (input.audience === 'GRADE') {
    if (!input.gradeLevel || !targets.grades.includes(input.gradeLevel)) throw new BadRequestException('Khối phải là 10, 11 hoặc 12');
    return { audience: 'GRADE', gradeLevel: input.gradeLevel, classId: null, className: null };
  }
  return { audience: input.audience, gradeLevel: null, classId: null, className: null };
}
