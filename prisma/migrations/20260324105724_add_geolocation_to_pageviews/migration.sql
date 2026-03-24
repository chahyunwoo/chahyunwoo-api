-- AlterTable
ALTER TABLE "analytics"."page_views" ADD COLUMN     "city" VARCHAR(100),
ADD COLUMN     "country" VARCHAR(10),
ADD COLUMN     "is_bot" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "page_views_ip_address_idx" ON "analytics"."page_views"("ip_address");
