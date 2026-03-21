-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "blog";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "portfolio";

-- CreateTable
CREATE TABLE "blog"."posts" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "slug" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "thumbnail_url" VARCHAR(1000),
    "category" VARCHAR(200),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog"."tags" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog"."post_tags" (
    "post_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("post_id","tag_id")
);

-- CreateTable
CREATE TABLE "portfolio"."experiences" (
    "id" SERIAL NOT NULL,
    "company_name" VARCHAR(300) NOT NULL,
    "role" VARCHAR(300) NOT NULL,
    "duration_start" VARCHAR(50) NOT NULL,
    "duration_end" VARCHAR(50),
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."experience_projects" (
    "id" SERIAL NOT NULL,
    "experience_id" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "descriptions" TEXT[],
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "experience_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."projects" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "stack" VARCHAR(200),
    "skills" TEXT[],
    "image_url" VARCHAR(1000),
    "url" VARCHAR(1000),
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."skills" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."education" (
    "id" SERIAL NOT NULL,
    "institution" VARCHAR(300) NOT NULL,
    "degree" VARCHAR(300) NOT NULL,
    "period_start" VARCHAR(50) NOT NULL,
    "period_end" VARCHAR(50),
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "education_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "blog"."posts"("slug");

-- CreateIndex
CREATE INDEX "posts_published_created_at_idx" ON "blog"."posts"("published", "created_at" DESC);

-- CreateIndex
CREATE INDEX "posts_category_idx" ON "blog"."posts"("category");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "blog"."tags"("slug");

-- CreateIndex
CREATE INDEX "experiences_display_order_idx" ON "portfolio"."experiences"("display_order");

-- CreateIndex
CREATE INDEX "projects_display_order_idx" ON "portfolio"."projects"("display_order");

-- CreateIndex
CREATE INDEX "skills_category_idx" ON "portfolio"."skills"("category");

-- AddForeignKey
ALTER TABLE "blog"."post_tags" ADD CONSTRAINT "post_tags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "blog"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog"."post_tags" ADD CONSTRAINT "post_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "blog"."tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio"."experience_projects" ADD CONSTRAINT "experience_projects_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "portfolio"."experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
