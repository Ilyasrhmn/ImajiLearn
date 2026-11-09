CREATE TABLE "WorksheetLibrary" (
    "ownerId" UUID NOT NULL,
    "lockVersion" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "WorksheetLibrary_pkey" PRIMARY KEY ("ownerId"),
    CONSTRAINT "WorksheetLibrary_ownerId_fkey" FOREIGN KEY ("ownerId")
        REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "WorksheetDocument" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "sourceMaterialId" UUID,
    "sourceId" UUID NOT NULL,
    "sourceTitle" VARCHAR(120) NOT NULL,
    "sourceRevision" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "resourceVersion" INTEGER NOT NULL DEFAULT 1,
    "templateId" VARCHAR(8) NOT NULL,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "assetVersion" INTEGER NOT NULL DEFAULT 1,
    "grade" VARCHAR(1) NOT NULL,
    "language" VARCHAR(2) NOT NULL,
    "theme" VARCHAR(5) NOT NULL,
    "content" JSONB NOT NULL,
    "displayOrder" JSONB NOT NULL,
    "cacheKey" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WorksheetDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorksheetDocument_ownerId_fkey" FOREIGN KEY ("ownerId")
        REFERENCES "WorksheetLibrary"("ownerId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorksheetDocument_versions_check" CHECK (
        "schemaVersion" = 1 AND "templateVersion" = 1 AND "assetVersion" = 1 AND "resourceVersion" > 0
    ),
    CONSTRAINT "WorksheetDocument_template_check" CHECK ("templateId" IN ('fold', 'match', 'cube', 'sequence', 'group')),
    CONSTRAINT "WorksheetDocument_theme_check" CHECK ("theme" IN ('ink', 'color')),
    CONSTRAINT "WorksheetDocument_grade_check" CHECK ("grade" IN ('', '1', '2', '3', '4', '5', '6')),
    CONSTRAINT "WorksheetDocument_language_check" CHECK ("language" = 'id'),
    CONSTRAINT "WorksheetDocument_content_check" CHECK (jsonb_typeof("content") = 'object'),
    CONSTRAINT "WorksheetDocument_order_check" CHECK (jsonb_typeof("displayOrder") = 'array'),
    CONSTRAINT "WorksheetDocument_source_check" CHECK ("sourceMaterialId" IS NULL OR "sourceMaterialId" = "sourceId"),
    CONSTRAINT "WorksheetDocument_time_check" CHECK ("updatedAt" >= "createdAt")
);

-- The material table is owned by the core module and does not exist yet.
-- Add its nullable FK in the core/documents integration migration, retaining source snapshots.
CREATE UNIQUE INDEX "WorksheetDocument_ownerId_cacheKey_key" ON "WorksheetDocument"("ownerId", "cacheKey");
CREATE INDEX "WorksheetDocument_ownerId_updatedAt_id_idx" ON "WorksheetDocument"("ownerId", "updatedAt" DESC, "id" DESC);
CREATE INDEX "WorksheetDocument_ownerId_sourceMaterialId_idx" ON "WorksheetDocument"("ownerId", "sourceMaterialId");
