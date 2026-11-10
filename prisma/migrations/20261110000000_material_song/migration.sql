CREATE TABLE "MaterialSong" (
  "materialId" UUID NOT NULL,
  "revision" CHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'writing',
  "content" JSONB,
  "taskId" VARCHAR(128),
  "attemptId" UUID NOT NULL,
  "leaseUntil" TIMESTAMPTZ(3),
  "errorCode" VARCHAR(40),
  "audio" BYTEA,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MaterialSong_pkey" PRIMARY KEY ("materialId", "revision"),
  CONSTRAINT "MaterialSong_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaterialSong_status_check" CHECK ("status" IN ('writing', 'submitting', 'generating', 'ready', 'failed', 'uncertain'))
);
