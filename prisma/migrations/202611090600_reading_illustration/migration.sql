ALTER TABLE "MaterialReading"
    ADD COLUMN "illustration" BYTEA,
    ADD COLUMN "illustrationLeaseId" UUID,
    ADD COLUMN "illustrationLeaseUntil" TIMESTAMPTZ(3),
    ADD CONSTRAINT "MaterialReading_illustration_state_check" CHECK (
        ("illustrationLeaseId" IS NULL AND "illustrationLeaseUntil" IS NULL)
        OR ("illustrationLeaseId" IS NOT NULL AND "illustrationLeaseUntil" IS NOT NULL
            AND "illustration" IS NULL AND "content" IS NOT NULL)
    ),
    ADD CONSTRAINT "MaterialReading_illustration_size_check" CHECK (
        "illustration" IS NULL OR ("content" IS NOT NULL AND octet_length("illustration") BETWEEN 4 AND 2097152)
    );
