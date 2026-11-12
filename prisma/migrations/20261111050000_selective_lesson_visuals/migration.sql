ALTER TABLE "MaterialReadingIllustration"
  ADD COLUMN "sourceBytes" BYTEA,
  ADD COLUMN "visualSkipped" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "MaterialSlideIllustration"
  ADD COLUMN "sourceBytes" BYTEA,
  ADD COLUMN "visualSkipped" BOOLEAN NOT NULL DEFAULT FALSE;
