-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('OK', 'DEGRADED', 'DOWN', 'OFF');

-- CreateEnum
CREATE TYPE "SystemErrorSource" AS ENUM ('HTTP', 'JOB');

-- CreateTable
CREATE TABLE "system_health_checks" (
    "id" BIGSERIAL NOT NULL,
    "service" VARCHAR(30) NOT NULL,
    "status" "HealthStatus" NOT NULL,
    "latency_ms" INTEGER,
    "message" VARCHAR(300),
    "checked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_errors" (
    "id" BIGSERIAL NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "source" "SystemErrorSource" NOT NULL,
    "route" VARCHAR(200) NOT NULL,
    "status_code" INTEGER,
    "message" VARCHAR(500) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "system_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_alerts" (
    "id" BIGSERIAL NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "detail" VARCHAR(1000),
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "resolved_by" BIGINT,

    CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_health_checks_service_checked_at_idx" ON "system_health_checks"("service", "checked_at");

-- CreateIndex
CREATE INDEX "system_health_checks_checked_at_idx" ON "system_health_checks"("checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_errors_fingerprint_key" ON "system_errors"("fingerprint");

-- CreateIndex
CREATE INDEX "system_errors_last_seen_at_idx" ON "system_errors"("last_seen_at");

-- CreateIndex
CREATE INDEX "system_alerts_resolved_at_idx" ON "system_alerts"("resolved_at");

-- CreateIndex
CREATE INDEX "system_alerts_opened_at_idx" ON "system_alerts"("opened_at");

-- AddForeignKey
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mỗi key chỉ một cảnh báo đang mở: hai tiến trình cùng phát hiện một sự cố thì chỉ một bên mở (và gửi tin) được.
CREATE UNIQUE INDEX "system_alerts_one_open_idx" ON "system_alerts" ("key") WHERE "resolved_at" IS NULL;

ALTER TABLE "system_health_checks" ADD CONSTRAINT "system_health_checks_latency_check" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0);
ALTER TABLE "system_errors" ADD CONSTRAINT "system_errors_count_check" CHECK ("count" >= 1);
ALTER TABLE "system_errors" ADD CONSTRAINT "system_errors_status_check" CHECK ("status_code" IS NULL OR "status_code" BETWEEN 100 AND 599);
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_resolved_check" CHECK ("resolved_at" IS NULL OR "resolved_at" >= "opened_at");
