-- CreateEnum
CREATE TYPE "ScoreAdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "score_history" ADD COLUMN     "approved_by" BIGINT;

-- CreateTable
CREATE TABLE "score_deadlines" (
    "id" BIGSERIAL NOT NULL,
    "semester_id" BIGINT NOT NULL,
    "type" "AssessmentType" NOT NULL,
    "deadline" TIMESTAMPTZ NOT NULL,
    "updated_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "score_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_locks" (
    "semester_id" BIGINT NOT NULL,
    "reason" VARCHAR(300),
    "locked_by" BIGINT NOT NULL,
    "locked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_locks_pkey" PRIMARY KEY ("semester_id")
);

-- CreateTable
CREATE TABLE "score_adjustments" (
    "id" BIGSERIAL NOT NULL,
    "assessment_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "class_id" BIGINT NOT NULL,
    "old_value" DECIMAL(4,2),
    "old_status" "ScoreStatus",
    "new_value" DECIMAL(4,2),
    "new_status" "ScoreStatus",
    "new_note" VARCHAR(200),
    "reason" VARCHAR(300) NOT NULL,
    "status" "ScoreAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" BIGINT NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" BIGINT,
    "reviewed_at" TIMESTAMPTZ,
    "review_note" VARCHAR(300),

    CONSTRAINT "score_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "score_deadlines_semester_id_type_key" ON "score_deadlines"("semester_id", "type");

-- CreateIndex
CREATE INDEX "score_adjustments_status_idx" ON "score_adjustments"("status");

-- CreateIndex
CREATE INDEX "score_adjustments_assessment_id_student_id_idx" ON "score_adjustments"("assessment_id", "student_id");

-- AddForeignKey
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_deadlines" ADD CONSTRAINT "score_deadlines_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_deadlines" ADD CONSTRAINT "score_deadlines_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_locks" ADD CONSTRAINT "score_locks_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_locks" ADD CONSTRAINT "score_locks_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───── Ràng buộc viết tay (Prisma không mô tả được) ─────

-- Mỗi học sinh–đợt chỉ một đề nghị điều chỉnh đang chờ duyệt.
CREATE UNIQUE INDEX "score_adjustments_one_pending" ON "score_adjustments"("assessment_id", "student_id") WHERE "status" = 'PENDING';

-- Điểm đề nghị cùng khoảng 0–10 như scores; có điểm ⇔ trạng thái GRADED; không đề nghị "miễn" (chỉ BGH đặt miễn).
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_value_range" CHECK (
  ("old_value" IS NULL OR ("old_value" >= 0 AND "old_value" <= 10)) AND ("new_value" IS NULL OR ("new_value" >= 0 AND "new_value" <= 10))
);
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_new_value_status" CHECK (
  ("new_status" IS NULL AND "new_value" IS NULL) OR (("new_status" = 'GRADED') = ("new_value" IS NOT NULL))
);
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_not_exempt" CHECK ("new_status" IS NULL OR "new_status" <> 'EXEMPT');
-- Đã duyệt/từ chối thì phải có người và thời điểm xử lý.
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_reviewed" CHECK (
  "status" NOT IN ('APPROVED', 'REJECTED') OR ("reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL)
);
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_source" CHECK ("source" IN ('GRID', 'EXCEL', 'EXEMPT', 'ADJUST'));
