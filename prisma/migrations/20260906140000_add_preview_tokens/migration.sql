-- CreateTable
CREATE TABLE "auth"."preview_tokens" (
    "token" VARCHAR(64) NOT NULL,
    "slug" VARCHAR(500) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preview_tokens_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "preview_tokens_expires_at_idx" ON "auth"."preview_tokens"("expires_at");
