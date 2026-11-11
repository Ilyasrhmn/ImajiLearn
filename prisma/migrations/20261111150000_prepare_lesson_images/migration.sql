ALTER TABLE "MaterialReading"
    DROP CONSTRAINT "MaterialReading_state_check",
    ADD CONSTRAINT "MaterialReading_state_check" CHECK (
        ("leaseId" IS NOT NULL AND "leaseUntil" IS NOT NULL)
        OR ("content" IS NOT NULL AND "leaseId" IS NULL AND "leaseUntil" IS NULL)
    );

ALTER TABLE "MaterialSlideDeck"
    DROP CONSTRAINT "MaterialSlideDeck_state_check",
    ADD CONSTRAINT "MaterialSlideDeck_state_check" CHECK (
        ("leaseId" IS NOT NULL AND "leaseUntil" IS NOT NULL)
        OR ("content" IS NOT NULL AND "leaseId" IS NULL AND "leaseUntil" IS NULL)
    );
