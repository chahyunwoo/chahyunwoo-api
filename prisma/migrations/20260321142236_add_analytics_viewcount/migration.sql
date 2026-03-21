-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "analytics";

-- AlterTable
ALTER TABLE "blog"."posts" ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "analytics"."page_views" (
    "id" SERIAL NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "app_name" VARCHAR(50) NOT NULL,
    "referrer" VARCHAR(1000),
    "user_agent" VARCHAR(1000),
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."admin_logs" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(100),
    "detail" TEXT,
    "username" VARCHAR(200) NOT NULL,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_views_app_name_created_at_idx" ON "analytics"."page_views"("app_name", "created_at" DESC);

-- CreateIndex
CREATE INDEX "page_views_path_idx" ON "analytics"."page_views"("path");

-- CreateIndex
CREATE INDEX "page_views_created_at_idx" ON "analytics"."page_views"("created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_logs_created_at_idx" ON "analytics"."admin_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_logs_entity_idx" ON "analytics"."admin_logs"("entity");
