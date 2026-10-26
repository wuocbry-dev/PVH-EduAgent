-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('SCHOOL', 'GRADE', 'CLASS', 'TEACHERS');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "audience" "Audience" NOT NULL DEFAULT 'SCHOOL',
ADD COLUMN     "class_id" BIGINT,
ADD COLUMN     "grade_level" INTEGER;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "announcements" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "audience" "Audience" NOT NULL,
    "grade_level" INTEGER,
    "class_id" BIGINT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_reads" (
    "announcement_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "read_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("announcement_id","user_id")
);

-- CreateIndex
CREATE INDEX "announcements_audience_created_at_idx" ON "announcements"("audience", "created_at");

-- CreateIndex
CREATE INDEX "announcements_class_id_idx" ON "announcements"("class_id");

-- CreateIndex
CREATE INDEX "announcement_reads_user_id_idx" ON "announcement_reads"("user_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───── Ràng buộc viết tay ─────
-- Đối tượng khớp với cột đi kèm: khối thì có khối (10–12), lớp thì có lớp, còn lại không có.
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_audience_target" CHECK (
  ("audience" = 'GRADE') = ("grade_level" IS NOT NULL) AND ("audience" = 'CLASS') = ("class_id" IS NOT NULL)
  AND ("grade_level" IS NULL OR "grade_level" BETWEEN 10 AND 12)
);
ALTER TABLE "events" ADD CONSTRAINT "events_audience_target" CHECK (
  ("audience" = 'GRADE') = ("grade_level" IS NOT NULL) AND ("audience" = 'CLASS') = ("class_id" IS NOT NULL)
  AND ("grade_level" IS NULL OR "grade_level" BETWEEN 10 AND 12)
);
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
