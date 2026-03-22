-- AlterTable
ALTER TABLE "portfolio"."skills" ADD COLUMN     "description" TEXT,
ADD COLUMN     "proficiency" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "portfolio"."works" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "start_date" VARCHAR(50),
    "end_date" VARCHAR(50),
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "tech_stack" JSONB NOT NULL DEFAULT '[]',
    "demo_url" VARCHAR(1000),
    "repo_url" VARCHAR(1000),
    "featured" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."work_translations" (
    "id" SERIAL NOT NULL,
    "work_id" INTEGER NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "role" VARCHAR(300),
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "highlights" TEXT[],

    CONSTRAINT "work_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "works_type_sort_order_idx" ON "portfolio"."works"("type", "sort_order");

-- CreateIndex
CREATE INDEX "works_featured_idx" ON "portfolio"."works"("featured");

-- CreateIndex
CREATE UNIQUE INDEX "work_translations_work_id_locale_key" ON "portfolio"."work_translations"("work_id", "locale");

-- AddForeignKey
ALTER TABLE "portfolio"."work_translations" ADD CONSTRAINT "work_translations_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "portfolio"."works"("id") ON DELETE CASCADE ON UPDATE CASCADE;
