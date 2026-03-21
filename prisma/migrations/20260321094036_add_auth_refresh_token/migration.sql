-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateTable
CREATE TABLE "auth"."refresh_tokens" (
    "id" SERIAL NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "username" VARCHAR(200) NOT NULL,
    "ip_address" VARCHAR(45),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "auth"."refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_username_idx" ON "auth"."refresh_tokens"("username");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "auth"."refresh_tokens"("expires_at");
