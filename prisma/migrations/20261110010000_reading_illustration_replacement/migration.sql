ALTER TABLE "MaterialReading"
    DROP CONSTRAINT "MaterialReading_illustration_state_check",
    ADD CONSTRAINT "MaterialReading_illustration_state_check" CHECK (
        ("illustrationLeaseId" IS NULL AND "illustrationLeaseUntil" IS NULL)
        OR ("illustrationLeaseId" IS NOT NULL AND "illustrationLeaseUntil" IS NOT NULL
            AND "content" IS NOT NULL)
    );
