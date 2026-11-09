-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "text" TEXT NOT NULL,
    "revision" CHAR(64) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "resourceVersion" INTEGER NOT NULL DEFAULT 1,
    "lockVersion" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idempotency" (
    "userId" UUID NOT NULL,
    "route" VARCHAR(100) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "response" JSONB,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lockVersion" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "Idempotency_pkey" PRIMARY KEY ("userId","route","key")
);

-- CreateIndex
CREATE INDEX "Material_userId_updatedAt_id_idx" ON "Material"("userId", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Material_id_userId_key" ON "Material"("id", "userId");

-- CreateIndex
CREATE INDEX "Idempotency_expiresAt_idx" ON "Idempotency"("expiresAt");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idempotency" ADD CONSTRAINT "Idempotency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
