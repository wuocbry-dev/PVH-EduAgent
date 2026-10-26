-- CreateEnum
CREATE TYPE "PostSource" AS ENUM ('WEB', 'TELEGRAM');

-- AlterTable: bài cũ đều tạo trên web
ALTER TABLE "posts" ADD COLUMN "source" "PostSource" NOT NULL DEFAULT 'WEB';
