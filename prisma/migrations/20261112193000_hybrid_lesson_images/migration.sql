ALTER TABLE "MaterialReading" ADD COLUMN "imagePlan" JSONB,
  ADD COLUMN "zImageRequests" INTEGER NOT NULL DEFAULT 0 CHECK ("zImageRequests" BETWEEN 0 AND 13);
ALTER TABLE "MaterialSlideDeck" ADD COLUMN "imagePlan" JSONB,
  ADD COLUMN "zImageRequests" INTEGER NOT NULL DEFAULT 0 CHECK ("zImageRequests" BETWEEN 0 AND 13);
ALTER TABLE "MaterialReadingIllustration" ADD COLUMN "imageProvider" VARCHAR(16)
  CHECK ("imageProvider" IN ('z-image', 'cloudflare'));
ALTER TABLE "MaterialSlideIllustration" ADD COLUMN "imageProvider" VARCHAR(16)
  CHECK ("imageProvider" IN ('z-image', 'cloudflare'));

-- Existing generated images reserve the budget conservatively; PDF figures do not.
UPDATE "MaterialReading" AS lesson SET "zImageRequests" = LEAST(13, (
  SELECT COUNT(*) FROM "MaterialReadingIllustration" AS image
  WHERE image."materialId" = lesson."materialId" AND image."revision" = lesson."revision"
    AND (image."providerTaskId" IS NOT NULL OR (image."bytes" IS NOT NULL AND image."sourcePage" IS NULL))
));
UPDATE "MaterialSlideDeck" AS lesson SET "zImageRequests" = LEAST(13, (
  SELECT COUNT(*) FROM "MaterialSlideIllustration" AS image
  WHERE image."materialId" = lesson."materialId" AND image."revision" = lesson."revision"
    AND (image."providerTaskId" IS NOT NULL OR (image."bytes" IS NOT NULL AND image."sourcePage" IS NULL))
));
