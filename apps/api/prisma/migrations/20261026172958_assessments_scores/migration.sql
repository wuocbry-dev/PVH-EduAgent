-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('THUONG_XUYEN', 'GIUA_KY', 'CUOI_KY');

-- CreateEnum
CREATE TYPE "AssessmentClassStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ScoreStatus" AS ENUM ('GRADED', 'ABSENT', 'EXEMPT');

-- CreateTable
CREATE TABLE "assessments" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "type" "AssessmentType" NOT NULL,
    "semester_id" BIGINT NOT NULL,
    "subject_id" BIGINT NOT NULL,
    "grade_level" INTEGER,
    "test_date" DATE NOT NULL,
    "description" VARCHAR(500),
    "entry_deadline" TIMESTAMPTZ,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_classes" (
    "id" BIGSERIAL NOT NULL,
    "assessment_id" BIGINT NOT NULL,
    "class_id" BIGINT NOT NULL,
    "status" "AssessmentClassStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ,
    "published_by" BIGINT,

    CONSTRAINT "assessment_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" BIGSERIAL NOT NULL,
    "assessment_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "class_id" BIGINT NOT NULL,
    "value" DECIMAL(4,2),
    "status" "ScoreStatus" NOT NULL DEFAULT 'GRADED',
    "note" VARCHAR(200),
    "entered_by" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_history" (
    "id" BIGSERIAL NOT NULL,
    "assessment_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "action" VARCHAR(10) NOT NULL,
    "old_value" DECIMAL(4,2),
    "new_value" DECIMAL(4,2),
    "old_status" "ScoreStatus",
    "new_status" "ScoreStatus",
    "note" VARCHAR(200),
    "reason" VARCHAR(300),
    "source" VARCHAR(10) NOT NULL,
    "changed_by" BIGINT NOT NULL,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessments_code_key" ON "assessments"("code");

-- CreateIndex
CREATE INDEX "assessments_semester_id_subject_id_idx" ON "assessments"("semester_id", "subject_id");

-- CreateIndex
CREATE INDEX "assessment_classes_class_id_idx" ON "assessment_classes"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_classes_assessment_id_class_id_key" ON "assessment_classes"("assessment_id", "class_id");

-- CreateIndex
CREATE INDEX "scores_class_id_idx" ON "scores"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "scores_assessment_id_student_id_key" ON "scores"("assessment_id", "student_id");

-- CreateIndex
CREATE INDEX "score_history_assessment_id_student_id_idx" ON "score_history"("assessment_id", "student_id");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_classes" ADD CONSTRAINT "assessment_classes_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_classes" ADD CONSTRAINT "assessment_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_classes" ADD CONSTRAINT "assessment_classes_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ràng buộc thêm (Prisma chưa mô tả được): điểm 0–10, có điểm khi và chỉ khi trạng thái GRADED.
ALTER TABLE "scores" ADD CONSTRAINT "scores_value_range" CHECK ("value" IS NULL OR ("value" >= 0 AND "value" <= 10));
ALTER TABLE "scores" ADD CONSTRAINT "scores_value_status" CHECK (("status" = 'GRADED') = ("value" IS NOT NULL));
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_value_range" CHECK (
  ("old_value" IS NULL OR ("old_value" >= 0 AND "old_value" <= 10)) AND ("new_value" IS NULL OR ("new_value" >= 0 AND "new_value" <= 10))
);
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_action" CHECK ("action" IN ('CREATE', 'UPDATE', 'DELETE'));
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_grade_level" CHECK ("grade_level" IS NULL OR "grade_level" BETWEEN 10 AND 12);

-- Lịch sử điểm chỉ được thêm: chặn UPDATE/DELETE. Ngoại lệ duy nhất là dọn dữ liệu kiểm thử, phải bật rõ ràng
-- trong transaction: SET LOCAL pvh.allow_score_history_purge = 'on'.
CREATE FUNCTION score_history_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('pvh.allow_score_history_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Lịch sử điểm không được sửa hoặc xoá' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER score_history_no_update BEFORE UPDATE OR DELETE ON "score_history"
  FOR EACH ROW EXECUTE FUNCTION score_history_immutable();
CREATE TRIGGER score_history_no_truncate BEFORE TRUNCATE ON "score_history"
  FOR EACH STATEMENT EXECUTE FUNCTION score_history_immutable();
