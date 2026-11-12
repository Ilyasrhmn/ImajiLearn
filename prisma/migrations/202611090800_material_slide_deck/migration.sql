CREATE TABLE "MaterialSlideDeck" (
    "materialId" UUID NOT NULL,
    "revision" CHAR(64) NOT NULL,
    "content" JSONB,
    "leaseId" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    CONSTRAINT "MaterialSlideDeck_pkey" PRIMARY KEY ("materialId", "revision"),
    CONSTRAINT "MaterialSlideDeck_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialSlideDeck_state_check" CHECK (
        ("content" IS NULL AND "leaseId" IS NOT NULL AND "leaseUntil" IS NOT NULL)
        OR ("content" IS NOT NULL AND "leaseId" IS NULL AND "leaseUntil" IS NULL)
    )
);
