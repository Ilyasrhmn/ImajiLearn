ALTER TABLE "MaterialReading" ADD COLUMN "generatedAt" TIMESTAMPTZ(3);
ALTER TABLE "MaterialSlideDeck" ADD COLUMN "generatedAt" TIMESTAMPTZ(3);
ALTER TABLE "MaterialVisual" ADD COLUMN "generatedAt" TIMESTAMPTZ(3);
