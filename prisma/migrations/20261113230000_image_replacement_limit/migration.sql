ALTER TABLE "MaterialReading" ADD COLUMN "imageReplacements" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MaterialSlideDeck" ADD COLUMN "imageReplacements" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MaterialReading" ADD CONSTRAINT "MaterialReading_imageReplacements_check" CHECK ("imageReplacements" BETWEEN 0 AND 3);
ALTER TABLE "MaterialSlideDeck" ADD CONSTRAINT "MaterialSlideDeck_imageReplacements_check" CHECK ("imageReplacements" BETWEEN 0 AND 3);
