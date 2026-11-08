ALTER TABLE "WorksheetDocument" ADD COLUMN "sourceOwnerId" UUID;

-- Older records may have retained an ID after the source was deleted. Preserve
-- the immutable source snapshot and clear only invalid live relationships.
UPDATE "WorksheetDocument" AS document
SET "sourceMaterialId" = NULL
WHERE "sourceMaterialId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Material" AS material
    WHERE material."id" = document."sourceMaterialId" AND material."userId" = document."ownerId"
);

UPDATE "WorksheetDocument"
SET "sourceOwnerId" = "ownerId"
WHERE "sourceMaterialId" IS NOT NULL;

ALTER TABLE "WorksheetDocument"
ADD CONSTRAINT "WorksheetDocument_source_owner_check" CHECK (
    ("sourceMaterialId" IS NULL AND "sourceOwnerId" IS NULL)
    OR ("sourceMaterialId" IS NOT NULL AND "sourceOwnerId" IS NOT NULL AND "sourceOwnerId" = "ownerId")
);

ALTER TABLE "WorksheetDocument"
ADD CONSTRAINT "WorksheetDocument_sourceMaterialId_sourceOwnerId_fkey"
FOREIGN KEY ("sourceMaterialId", "sourceOwnerId") REFERENCES "Material"("id", "userId")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorksheetDocument_sourceMaterialId_sourceOwnerId_idx"
ON "WorksheetDocument"("sourceMaterialId", "sourceOwnerId");
