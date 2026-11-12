CREATE TABLE "MaterialSlideIllustration" (
    "materialId" UUID NOT NULL,
    "revision" CHAR(64) NOT NULL,
    "slideIndex" INTEGER NOT NULL,
    "bytes" BYTEA,
    "leaseId" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    CONSTRAINT "MaterialSlideIllustration_pkey" PRIMARY KEY ("materialId", "revision", "slideIndex"),
    CONSTRAINT "MaterialSlideIllustration_deck_fkey" FOREIGN KEY ("materialId", "revision") REFERENCES "MaterialSlideDeck"("materialId", "revision") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialSlideIllustration_index_check" CHECK ("slideIndex" BETWEEN 0 AND 5),
    CONSTRAINT "MaterialSlideIllustration_state_check" CHECK (
        ("bytes" IS NULL AND "leaseId" IS NOT NULL AND "leaseUntil" IS NOT NULL)
        OR (octet_length("bytes") BETWEEN 4 AND 2097152 AND "bytes" IS NOT NULL AND "leaseId" IS NULL AND "leaseUntil" IS NULL)
    )
);
