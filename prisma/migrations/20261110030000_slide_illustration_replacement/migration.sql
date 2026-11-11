ALTER TABLE "MaterialSlideIllustration"
    DROP CONSTRAINT "MaterialSlideIllustration_state_check",
    ADD CONSTRAINT "MaterialSlideIllustration_state_check" CHECK (
        ("leaseId" IS NOT NULL AND "leaseUntil" IS NOT NULL AND "bytes" IS NULL)
        OR (octet_length("bytes") BETWEEN 4 AND 2097152 AND "bytes" IS NOT NULL
            AND ("leaseId" IS NULL) = ("leaseUntil" IS NULL))
    );
