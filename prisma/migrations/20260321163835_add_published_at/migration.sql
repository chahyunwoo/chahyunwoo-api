-- DropIndex
DROP INDEX "blog"."posts_published_created_at_idx";

-- AlterTable
ALTER TABLE "blog"."posts" ADD COLUMN     "published_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "posts_published_published_at_idx" ON "blog"."posts"("published", "published_at" DESC);
