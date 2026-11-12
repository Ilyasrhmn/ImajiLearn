ALTER TABLE "MaterialVisual"
    DROP CONSTRAINT "MaterialVisual_state_check",
    ADD CONSTRAINT "MaterialVisual_state_check" CHECK (
        ("leaseId" IS NOT NULL AND "leaseUntil" IS NOT NULL)
        OR ("content" IS NOT NULL AND "leaseId" IS NULL AND "leaseUntil" IS NULL)
    );
