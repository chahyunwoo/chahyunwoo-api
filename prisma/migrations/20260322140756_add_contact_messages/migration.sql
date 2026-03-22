-- CreateTable
CREATE TABLE "portfolio"."contact_messages" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(300) NOT NULL,
    "subject" VARCHAR(200),
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_messages_created_at_idx" ON "portfolio"."contact_messages"("created_at" DESC);

-- CreateIndex
CREATE INDEX "contact_messages_read_idx" ON "portfolio"."contact_messages"("read");
