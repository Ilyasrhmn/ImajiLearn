CREATE TABLE "MaterialVisual" (
    "materialId" UUID NOT NULL,
    "revision" CHAR(64) NOT NULL,
    "content" JSONB,
    "leaseId" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    CONSTRAINT "MaterialVisual_pkey" PRIMARY KEY ("materialId", "revision"),
    CONSTRAINT "MaterialVisual_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialVisual_state_check" CHECK (
        ("content" IS NULL AND "leaseId" IS NOT NULL AND "leaseUntil" IS NOT NULL)
        OR ("content" IS NOT NULL AND "leaseId" IS NULL AND "leaseUntil" IS NULL)
    )
);
