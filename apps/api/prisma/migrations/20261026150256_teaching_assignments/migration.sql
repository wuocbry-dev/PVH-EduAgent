-- AlterTable
ALTER TABLE "teacher_profiles" ADD COLUMN     "weekly_quota" INTEGER;

-- CreateTable
CREATE TABLE "subject_period_quotas" (
    "id" BIGSERIAL NOT NULL,
    "school_year_id" BIGINT NOT NULL,
    "grade_id" BIGINT NOT NULL,
    "subject_id" BIGINT NOT NULL,
    "periods_per_week" INTEGER NOT NULL,

    CONSTRAINT "subject_period_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_period_quotas" (
    "id" BIGSERIAL NOT NULL,
    "class_id" BIGINT NOT NULL,
    "subject_id" BIGINT NOT NULL,
    "periods_per_week" INTEGER NOT NULL,

    CONSTRAINT "class_period_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" BIGSERIAL NOT NULL,
    "school_year_id" BIGINT NOT NULL,
    "semester_id" BIGINT,
    "class_id" BIGINT NOT NULL,
    "subject_id" BIGINT NOT NULL,
    "teacher_id" BIGINT NOT NULL,
    "periods_per_week" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subject_period_quotas_school_year_id_grade_id_subject_id_key" ON "subject_period_quotas"("school_year_id", "grade_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_period_quotas_class_id_subject_id_key" ON "class_period_quotas"("class_id", "subject_id");

-- CreateIndex
CREATE INDEX "teaching_assignments_teacher_id_idx" ON "teaching_assignments"("teacher_id");

-- CreateIndex
CREATE INDEX "teaching_assignments_class_id_idx" ON "teaching_assignments"("class_id");

-- AddForeignKey
ALTER TABLE "subject_period_quotas" ADD CONSTRAINT "subject_period_quotas_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_period_quotas" ADD CONSTRAINT "subject_period_quotas_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_period_quotas" ADD CONSTRAINT "subject_period_quotas_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_period_quotas" ADD CONSTRAINT "class_period_quotas_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_period_quotas" ADD CONSTRAINT "class_period_quotas_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Một lớp–môn chỉ có một giáo viên chính: index duy nhất một phần theo phạm vi (cả năm / từng học kỳ).
CREATE UNIQUE INDEX "teaching_assignments_year_scope" ON "teaching_assignments" ("class_id", "subject_id") WHERE "semester_id" IS NULL;
CREATE UNIQUE INDEX "teaching_assignments_semester_scope" ON "teaching_assignments" ("class_id", "subject_id", "semester_id") WHERE "semester_id" IS NOT NULL;

-- Số tiết/tuần hợp lý (định mức có thể bằng 0 = môn không học ở khối đó).
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_periods_check" CHECK ("periods_per_week" BETWEEN 1 AND 10);
ALTER TABLE "subject_period_quotas" ADD CONSTRAINT "subject_period_quotas_periods_check" CHECK ("periods_per_week" BETWEEN 0 AND 10);
ALTER TABLE "class_period_quotas" ADD CONSTRAINT "class_period_quotas_periods_check" CHECK ("periods_per_week" BETWEEN 0 AND 10);
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_weekly_quota_check" CHECK ("weekly_quota" IS NULL OR "weekly_quota" BETWEEN 0 AND 40);
