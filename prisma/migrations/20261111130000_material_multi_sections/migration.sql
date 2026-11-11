ALTER TABLE "Material" ADD COLUMN "sectionPages" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
DROP INDEX "Material_parentId_pageStart_pageEnd_key";
CREATE UNIQUE INDEX "Material_parentId_revision_key" ON "Material" ("parentId", "revision");
