-- CreateEnum
CREATE TYPE "LibraryKind" AS ENUM ('PDF', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "LibraryStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LibraryAudience" AS ENUM ('ALL', 'GRADE', 'CLASS', 'TEACHERS_ONLY');

-- CreateEnum
CREATE TYPE "LibrarySource" AS ENUM ('SELF_AUTHORED', 'TEACHER_CONTRIBUTED', 'PUBLIC_RELEASE', 'LICENSED');

-- CreateTable
CREATE TABLE "library_categories" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "parent_id" BIGINT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "library_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_items" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "author" VARCHAR(200),
    "publisher" VARCHAR(200),
    "publish_year" INTEGER,
    "description" TEXT,
    "cover_url" VARCHAR(500),
    "kind" "LibraryKind" NOT NULL,
    "category_id" BIGINT NOT NULL,
    "subject_id" BIGINT,
    "grade_level" INTEGER,
    "source" "LibrarySource" NOT NULL,
    "license" VARCHAR(500) NOT NULL,
    "allow_download" BOOLEAN NOT NULL DEFAULT false,
    "audience" "LibraryAudience" NOT NULL DEFAULT 'ALL',
    "grade_levels" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "status" "LibraryStatus" NOT NULL DEFAULT 'DRAFT',
    "reject_reason" VARCHAR(500),
    "submitted_by" BIGINT NOT NULL,
    "reviewed_by" BIGINT,
    "reviewed_at" TIMESTAMPTZ,
    "published_at" TIMESTAMPTZ,
    "file_key" VARCHAR(120),
    "file_mime" VARCHAR(80),
    "file_size" INTEGER,
    "pending_key" VARCHAR(120),
    "pending_mime" VARCHAR(80),
    "pending_size" INTEGER,
    "search_text" TEXT NOT NULL DEFAULT '',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_item_classes" (
    "item_id" BIGINT NOT NULL,
    "class_id" BIGINT NOT NULL,

    CONSTRAINT "library_item_classes_pkey" PRIMARY KEY ("item_id","class_id")
);

-- CreateTable
CREATE TABLE "library_favorites" (
    "user_id" BIGINT NOT NULL,
    "item_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_favorites_pkey" PRIMARY KEY ("user_id","item_id")
);

-- CreateTable
CREATE TABLE "library_reading_progress" (
    "user_id" BIGINT NOT NULL,
    "item_id" BIGINT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "library_reading_progress_pkey" PRIMARY KEY ("user_id","item_id")
);

-- CreateTable
CREATE TABLE "library_views" (
    "item_id" BIGINT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "library_views_pkey" PRIMARY KEY ("item_id","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_categories_slug_key" ON "library_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "library_items_slug_key" ON "library_items"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "library_items_file_key_key" ON "library_items"("file_key");

-- CreateIndex
CREATE UNIQUE INDEX "library_items_pending_key_key" ON "library_items"("pending_key");

-- CreateIndex
CREATE INDEX "library_items_status_published_at_idx" ON "library_items"("status", "published_at");

-- CreateIndex
CREATE INDEX "library_items_category_id_idx" ON "library_items"("category_id");

-- CreateIndex
CREATE INDEX "library_items_submitted_by_idx" ON "library_items"("submitted_by");

-- CreateIndex
CREATE INDEX "library_item_classes_class_id_idx" ON "library_item_classes"("class_id");

-- CreateIndex
CREATE INDEX "library_reading_progress_user_id_updated_at_idx" ON "library_reading_progress"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "library_views_day_idx" ON "library_views"("day");

-- AddForeignKey
ALTER TABLE "library_categories" ADD CONSTRAINT "library_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "library_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "library_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item_classes" ADD CONSTRAINT "library_item_classes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item_classes" ADD CONSTRAINT "library_item_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_favorites" ADD CONSTRAINT "library_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_favorites" ADD CONSTRAINT "library_favorites_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reading_progress" ADD CONSTRAINT "library_reading_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reading_progress" ADD CONSTRAINT "library_reading_progress_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_views" ADD CONSTRAINT "library_views_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nguồn và giấy phép bắt buộc; năm xuất bản, khối hợp lệ; đối tượng GRADE phải có khối.
ALTER TABLE "library_items"
  ADD CONSTRAINT "library_items_license_check" CHECK (char_length(btrim("license")) >= 5),
  ADD CONSTRAINT "library_items_publish_year_check" CHECK ("publish_year" IS NULL OR "publish_year" BETWEEN 1800 AND 2200),
  ADD CONSTRAINT "library_items_grade_level_check" CHECK ("grade_level" IS NULL OR "grade_level" BETWEEN 10 AND 12),
  ADD CONSTRAINT "library_items_grade_levels_check" CHECK ("grade_levels" <@ ARRAY[10, 11, 12]),
  ADD CONSTRAINT "library_items_audience_grade_check" CHECK ("audience" <> 'GRADE' OR cardinality("grade_levels") > 0),
  -- Chỉ tài liệu đã có file mới được gửi duyệt / đăng.
  ADD CONSTRAINT "library_items_file_check" CHECK ("status" IN ('DRAFT', 'REJECTED') OR "file_key" IS NOT NULL),
  ADD CONSTRAINT "library_items_file_size_check" CHECK ("file_size" IS NULL OR "file_size" > 0),
  ADD CONSTRAINT "library_items_view_count_check" CHECK ("view_count" >= 0);

ALTER TABLE "library_views" ADD CONSTRAINT "library_views_count_check" CHECK ("count" >= 0);
ALTER TABLE "library_reading_progress" ADD CONSTRAINT "library_reading_progress_position_check" CHECK ("position" >= 0);

-- Tìm không dấu: cột search_text (chuỗi bỏ dấu do ứng dụng tính, normalizeSearch ở @pvh/shared) + index trigram để
-- LIKE '%...%' không quét cả bảng. pg_trgm là extension "trusted" từ PostgreSQL 13 nên chủ CSDL tạo được, không cần superuser.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "library_items_search_text_trgm_idx" ON "library_items" USING GIN ("search_text" gin_trgm_ops);
