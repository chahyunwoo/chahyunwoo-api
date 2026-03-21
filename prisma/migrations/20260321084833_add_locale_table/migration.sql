-- CreateTable
CREATE TABLE "portfolio"."locales" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(5) NOT NULL,
    "label" VARCHAR(50) NOT NULL,

    CONSTRAINT "locales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locales_code_key" ON "portfolio"."locales"("code");
