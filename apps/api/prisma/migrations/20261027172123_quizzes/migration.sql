-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "quizzes" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "subject_id" BIGINT NOT NULL,
    "grade_level" INTEGER NOT NULL,
    "audience" "LibraryAudience" NOT NULL DEFAULT 'GRADE',
    "grade_levels" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "duration_minutes" INTEGER,
    "max_attempts" INTEGER,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
    "shuffle_options" BOOLEAN NOT NULL DEFAULT false,
    "show_answers" BOOLEAN NOT NULL DEFAULT true,
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "library_item_id" BIGINT,
    "created_by" BIGINT NOT NULL,
    "published_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_classes" (
    "quiz_id" BIGINT NOT NULL,
    "class_id" BIGINT NOT NULL,

    CONSTRAINT "quiz_classes_pkey" PRIMARY KEY ("quiz_id","class_id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" BIGSERIAL NOT NULL,
    "quiz_id" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_options" (
    "id" BIGSERIAL NOT NULL,
    "question_id" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" VARCHAR(1000) NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "quiz_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" BIGSERIAL NOT NULL,
    "quiz_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ,
    "auto_submitted" BOOLEAN NOT NULL DEFAULT false,
    "question_order" BIGINT[],
    "option_order" JSONB NOT NULL,
    "score" DECIMAL(4,2),
    "correct_count" INTEGER,
    "total_count" INTEGER NOT NULL,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_answers" (
    "attempt_id" BIGINT NOT NULL,
    "question_id" BIGINT NOT NULL,
    "option_ids" BIGINT[],
    "is_correct" BOOLEAN,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "quiz_answers_pkey" PRIMARY KEY ("attempt_id","question_id")
);

-- CreateIndex
CREATE INDEX "quizzes_status_grade_level_idx" ON "quizzes"("status", "grade_level");

-- CreateIndex
CREATE INDEX "quizzes_created_by_idx" ON "quizzes"("created_by");

-- CreateIndex
CREATE INDEX "quizzes_library_item_id_idx" ON "quizzes"("library_item_id");

-- CreateIndex
CREATE INDEX "quiz_classes_class_id_idx" ON "quiz_classes"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_questions_quiz_id_position_key" ON "quiz_questions"("quiz_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_options_question_id_position_key" ON "quiz_options"("question_id", "position");

-- CreateIndex
CREATE INDEX "quiz_attempts_quiz_id_student_id_idx" ON "quiz_attempts"("quiz_id", "student_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_student_id_started_at_idx" ON "quiz_attempts"("student_id", "started_at");

-- CreateIndex
CREATE INDEX "quiz_answers_question_id_idx" ON "quiz_answers"("question_id");

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "library_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_classes" ADD CONSTRAINT "quiz_classes_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_classes" ADD CONSTRAINT "quiz_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_options" ADD CONSTRAINT "quiz_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Quiz: khối 10–12; đối tượng chỉ ALL/GRADE/CLASS (không có "chỉ giáo viên"); GRADE phải có khối; thời gian và số lần hợp lý.
ALTER TABLE "quizzes"
  ADD CONSTRAINT "quizzes_grade_level_check" CHECK ("grade_level" BETWEEN 10 AND 12),
  ADD CONSTRAINT "quizzes_audience_check" CHECK ("audience" IN ('ALL', 'GRADE', 'CLASS')),
  ADD CONSTRAINT "quizzes_grade_levels_check" CHECK ("grade_levels" <@ ARRAY[10, 11, 12]),
  ADD CONSTRAINT "quizzes_audience_grade_check" CHECK ("audience" <> 'GRADE' OR cardinality("grade_levels") > 0),
  ADD CONSTRAINT "quizzes_duration_check" CHECK ("duration_minutes" IS NULL OR "duration_minutes" BETWEEN 1 AND 300),
  ADD CONSTRAINT "quizzes_max_attempts_check" CHECK ("max_attempts" IS NULL OR "max_attempts" BETWEEN 1 AND 100);

ALTER TABLE "quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_score_check" CHECK ("score" IS NULL OR "score" BETWEEN 0 AND 10),
  ADD CONSTRAINT "quiz_attempts_submitted_check" CHECK (("submitted_at" IS NULL) = ("score" IS NULL));

-- Mỗi học sinh chỉ có một lần làm đang dở cho mỗi quiz (bấm "Bắt đầu" hai lần cùng lúc không tạo hai lần làm).
CREATE UNIQUE INDEX "quiz_attempts_one_open_idx" ON "quiz_attempts" ("quiz_id", "student_id") WHERE "submitted_at" IS NULL;
