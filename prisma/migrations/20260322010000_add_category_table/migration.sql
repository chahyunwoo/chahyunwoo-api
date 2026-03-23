-- CreateTable (독립 메타데이터 테이블, Post.category 문자열과 name으로 매칭)
CREATE TABLE IF NOT EXISTS "blog"."categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "icon" VARCHAR(100) NOT NULL DEFAULT 'LayoutGrid',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "categories_name_key" ON "blog"."categories"("name");
CREATE INDEX IF NOT EXISTS "categories_sort_order_idx" ON "blog"."categories"("sort_order");

-- Seed initial categories
INSERT INTO "blog"."categories" ("name", "icon", "sort_order")
VALUES
  ('Frontend', 'Monitor', 1),
  ('Programming', 'Code', 2),
  ('DevOps', 'Container', 3),
  ('Career', 'Briefcase', 4),
  ('Backend', 'Server', 5)
ON CONFLICT ("name") DO NOTHING;
