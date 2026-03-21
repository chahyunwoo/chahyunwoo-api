/*
  Warnings:

  - You are about to drop the column `degree` on the `education` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `education` table. All the data in the column will be lost.
  - You are about to drop the column `display_order` on the `education` table. All the data in the column will be lost.
  - You are about to drop the column `institution` on the `education` table. All the data in the column will be lost.
  - You are about to drop the column `period_end` on the `education` table. All the data in the column will be lost.
  - You are about to drop the column `period_start` on the `education` table. All the data in the column will be lost.
  - You are about to drop the column `company_name` on the `experiences` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `experiences` table. All the data in the column will be lost.
  - You are about to drop the column `display_order` on the `experiences` table. All the data in the column will be lost.
  - You are about to drop the column `duration_end` on the `experiences` table. All the data in the column will be lost.
  - You are about to drop the column `duration_start` on the `experiences` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `experiences` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `display_order` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `image_url` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `is_featured` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `skills` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `stack` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `url` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `skills` table. All the data in the column will be lost.
  - You are about to drop the column `display_order` on the `skills` table. All the data in the column will be lost.
  - You are about to drop the column `value` on the `skills` table. All the data in the column will be lost.
  - You are about to drop the `experience_projects` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `period` to the `education` table without a default value. This is not possible if the table is not empty.
  - Added the required column `start_date` to the `experiences` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "portfolio"."experience_projects" DROP CONSTRAINT "experience_projects_experience_id_fkey";

-- DropIndex
DROP INDEX "portfolio"."experiences_display_order_idx";

-- DropIndex
DROP INDEX "portfolio"."projects_display_order_idx";

-- AlterTable
ALTER TABLE "portfolio"."education" DROP COLUMN "degree",
DROP COLUMN "description",
DROP COLUMN "display_order",
DROP COLUMN "institution",
DROP COLUMN "period_end",
DROP COLUMN "period_start",
ADD COLUMN     "period" VARCHAR(100) NOT NULL,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "portfolio"."experiences" DROP COLUMN "company_name",
DROP COLUMN "description",
DROP COLUMN "display_order",
DROP COLUMN "duration_end",
DROP COLUMN "duration_start",
DROP COLUMN "role",
ADD COLUMN     "end_date" VARCHAR(50),
ADD COLUMN     "is_current" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "start_date" VARCHAR(50) NOT NULL;

-- AlterTable
ALTER TABLE "portfolio"."projects" DROP COLUMN "description",
DROP COLUMN "display_order",
DROP COLUMN "image_url",
DROP COLUMN "is_featured",
DROP COLUMN "skills",
DROP COLUMN "stack",
DROP COLUMN "title",
DROP COLUMN "url",
ADD COLUMN     "demo_url" VARCHAR(1000),
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repo_url" VARCHAR(1000),
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tech_stack" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "portfolio"."skills" DROP COLUMN "content",
DROP COLUMN "display_order",
DROP COLUMN "value",
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "portfolio"."experience_projects";

-- CreateTable
CREATE TABLE "portfolio"."profiles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "location" VARCHAR(200) NOT NULL,
    "image_url" VARCHAR(1000),
    "social_links" JSONB,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."profile_translations" (
    "id" SERIAL NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "job_title" VARCHAR(200) NOT NULL,
    "introduction" TEXT[],

    CONSTRAINT "profile_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."experience_translations" (
    "id" SERIAL NOT NULL,
    "experience_id" INTEGER NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "role" VARCHAR(300) NOT NULL,
    "responsibilities" TEXT[],

    CONSTRAINT "experience_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."project_translations" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,

    CONSTRAINT "project_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."education_translations" (
    "id" SERIAL NOT NULL,
    "education_id" INTEGER NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "institution" VARCHAR(300) NOT NULL,
    "degree" VARCHAR(300) NOT NULL,

    CONSTRAINT "education_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_translations_profile_id_locale_key" ON "portfolio"."profile_translations"("profile_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "experience_translations_experience_id_locale_key" ON "portfolio"."experience_translations"("experience_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "project_translations_project_id_locale_key" ON "portfolio"."project_translations"("project_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "education_translations_education_id_locale_key" ON "portfolio"."education_translations"("education_id", "locale");

-- CreateIndex
CREATE INDEX "post_tags_tag_id_idx" ON "blog"."post_tags"("tag_id");

-- CreateIndex
CREATE INDEX "education_sort_order_idx" ON "portfolio"."education"("sort_order");

-- CreateIndex
CREATE INDEX "experiences_sort_order_idx" ON "portfolio"."experiences"("sort_order");

-- CreateIndex
CREATE INDEX "projects_sort_order_idx" ON "portfolio"."projects"("sort_order");

-- CreateIndex
CREATE INDEX "skills_sort_order_idx" ON "portfolio"."skills"("sort_order");

-- AddForeignKey
ALTER TABLE "portfolio"."profile_translations" ADD CONSTRAINT "profile_translations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "portfolio"."profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio"."experience_translations" ADD CONSTRAINT "experience_translations_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "portfolio"."experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio"."project_translations" ADD CONSTRAINT "project_translations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "portfolio"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio"."education_translations" ADD CONSTRAINT "education_translations_education_id_fkey" FOREIGN KEY ("education_id") REFERENCES "portfolio"."education"("id") ON DELETE CASCADE ON UPDATE CASCADE;
