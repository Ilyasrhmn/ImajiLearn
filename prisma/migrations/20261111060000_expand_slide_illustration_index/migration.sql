ALTER TABLE "MaterialSlideIllustration"
  DROP CONSTRAINT "MaterialSlideIllustration_index_check",
  ADD CONSTRAINT "MaterialSlideIllustration_index_check" CHECK ("slideIndex" >= 0);
