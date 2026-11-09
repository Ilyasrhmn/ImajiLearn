ALTER TABLE "Material"
  ADD COLUMN "extractionStatus" VARCHAR(8) NOT NULL DEFAULT 'ready',
  ADD COLUMN "extractionError" VARCHAR(40),
  ADD CONSTRAINT "Material_extraction_state_check"
    CHECK (("extractionStatus" = 'ready' AND "extractionError" IS NULL)
        OR ("extractionStatus" = 'failed' AND "extractionError" IS NOT NULL));

CREATE TABLE "MaterialFile" (
  "materialId" UUID PRIMARY KEY,
  "userId" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "mime" VARCHAR(32) NOT NULL,
  "size" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  CONSTRAINT "MaterialFile_materialId_userId_key" UNIQUE ("materialId", "userId"),
  CONSTRAINT "MaterialFile_size_check" CHECK ("size" BETWEEN 1 AND 10485760 AND "size" = octet_length("bytes")),
  CONSTRAINT "MaterialFile_mime_check" CHECK ("mime" IN ('application/pdf', 'text/plain')),
  CONSTRAINT "MaterialFile_materialId_userId_fkey"
    FOREIGN KEY ("materialId", "userId") REFERENCES "Material" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
