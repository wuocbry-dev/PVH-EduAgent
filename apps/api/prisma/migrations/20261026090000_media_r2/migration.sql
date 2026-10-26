-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable: thêm cột; storage_key tạm cho phép rỗng để điền cho các bản ghi cũ rồi mới đặt NOT NULL
ALTER TABLE "media"
  ADD COLUMN "storage_key" VARCHAR(120),
  ADD COLUMN "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Ảnh đã tải lên trước bước này: đã sẵn sàng, là ảnh, khoá = tên file cũ (url dạng /media/files/<tên>)
UPDATE "media"
SET "status" = 'READY',
    "kind" = 'IMAGE',
    "storage_key" = substring("url" from '[^/]+$');

ALTER TABLE "media" ALTER COLUMN "storage_key" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE INDEX "media_status_created_at_idx" ON "media"("status", "created_at");
