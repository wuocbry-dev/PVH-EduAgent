-- CreateEnum
CREATE TYPE "ClassSessions" AS ENUM ('MORNING', 'AFTERNOON', 'BOTH');

-- CreateEnum
CREATE TYPE "TimetableStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FixedPeriodKind" AS ENUM ('SCHOOL', 'CLASS_MEETING');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "sessions" "ClassSessions" NOT NULL DEFAULT 'BOTH';

-- CreateTable
CREATE TABLE "timetables" (
    "id" BIGSERIAL NOT NULL,
    "semester_id" BIGINT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "TimetableStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_date" DATE,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" BIGINT,
    "published_at" TIMESTAMPTZ,

    CONSTRAINT "timetables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" BIGSERIAL NOT NULL,
    "timetable_id" BIGINT NOT NULL,
    "day" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "class_id" BIGINT NOT NULL,
    "assignment_id" BIGINT NOT NULL,
    "teacher_id" BIGINT NOT NULL,
    "room_id" BIGINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_periods" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "FixedPeriodKind" NOT NULL DEFAULT 'SCHOOL',
    "day" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "grade_level" INTEGER,

    CONSTRAINT "fixed_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_unavailability" (
    "id" BIGSERIAL NOT NULL,
    "teacher_id" BIGINT NOT NULL,
    "day" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "note" VARCHAR(200),

    CONSTRAINT "teacher_unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetables_semester_id_status_idx" ON "timetables"("semester_id", "status");

-- CreateIndex
CREATE INDEX "timetable_slots_assignment_id_idx" ON "timetable_slots"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_teacher_unique" ON "timetable_slots"("timetable_id", "teacher_id", "day", "period");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_class_unique" ON "timetable_slots"("timetable_id", "class_id", "day", "period");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_unavailability_teacher_id_day_period_key" ON "teacher_unavailability"("teacher_id", "day", "period");

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_timetable_id_fkey" FOREIGN KEY ("timetable_id") REFERENCES "timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "teaching_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_unavailability" ADD CONSTRAINT "teacher_unavailability_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hai phiên bản đã công bố/lưu trữ của cùng học kỳ không được trùng ngày hiệu lực (xem ngày D: bản có ngày hiệu lực lớn nhất <= D).
CREATE UNIQUE INDEX "timetables_effective_unique" ON "timetables" ("semester_id", "effective_date") WHERE "status" <> 'DRAFT';
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_effective_check" CHECK ("status" = 'DRAFT' OR "effective_date" IS NOT NULL);

-- Phòng bộ môn không thể có hai lớp cùng một tiết trong một phiên bản.
CREATE UNIQUE INDEX "timetable_slots_room_unique" ON "timetable_slots" ("timetable_id", "room_id", "day", "period") WHERE "room_id" IS NOT NULL;

-- Tiết cố định: một (thứ, tiết) chỉ có một dòng cho cả trường và một dòng cho mỗi khối.
CREATE UNIQUE INDEX "fixed_periods_school_unique" ON "fixed_periods" ("day", "period") WHERE "grade_level" IS NULL;
CREATE UNIQUE INDEX "fixed_periods_grade_unique" ON "fixed_periods" ("day", "period", "grade_level") WHERE "grade_level" IS NOT NULL;

-- Thứ 1–6 (Hai–Bảy), tiết 1–10.
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_day_period_check" CHECK ("day" BETWEEN 1 AND 6 AND "period" BETWEEN 1 AND 10);
ALTER TABLE "fixed_periods" ADD CONSTRAINT "fixed_periods_day_period_check" CHECK ("day" BETWEEN 1 AND 6 AND "period" BETWEEN 1 AND 10);
ALTER TABLE "teacher_unavailability" ADD CONSTRAINT "teacher_unavailability_day_period_check" CHECK ("day" BETWEEN 1 AND 6 AND "period" BETWEEN 1 AND 10);
