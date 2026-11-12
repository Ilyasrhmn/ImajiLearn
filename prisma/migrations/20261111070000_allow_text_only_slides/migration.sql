ALTER TABLE "MaterialSlideIllustration"
  DROP CONSTRAINT "MaterialSlideIllustration_state_check",
  ADD CONSTRAINT "MaterialSlideIllustration_state_check" CHECK (
    ("leaseId" IS NULL) = ("leaseUntil" IS NULL)
    AND (
      ("bytes" IS NULL AND ("visualSkipped" OR "leaseId" IS NOT NULL))
      OR ("bytes" IS NOT NULL AND octet_length("bytes") BETWEEN 4 AND 2097152 AND NOT "visualSkipped")
    )
  );
