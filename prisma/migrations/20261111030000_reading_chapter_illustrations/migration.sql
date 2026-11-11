CREATE TABLE "MaterialReadingIllustration" (
  "materialId" UUID NOT NULL,
  "revision" CHAR(64) NOT NULL,
  "sectionIndex" INTEGER NOT NULL,
  "bytes" BYTEA,
  "leaseId" UUID,
  "leaseUntil" TIMESTAMPTZ(3),
  PRIMARY KEY ("materialId", "revision", "sectionIndex"),
  FOREIGN KEY ("materialId", "revision")
    REFERENCES "MaterialReading"("materialId", "revision") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "MaterialReadingIllustration" ("materialId", "revision", "sectionIndex", "bytes")
SELECT "materialId", "revision", COALESCE(("content" #>> '{illustration,sectionIndex}')::integer, 0), "illustration"
FROM "MaterialReading"
WHERE "illustration" IS NOT NULL;
