ALTER TABLE "Material"
  ADD COLUMN "parentId" UUID,
  ADD COLUMN "pageStart" INTEGER,
  ADD COLUMN "pageEnd" INTEGER,
  ADD CONSTRAINT "Material_parentId_userId_fkey"
    FOREIGN KEY ("parentId", "userId") REFERENCES "Material" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Material_section_check" CHECK (
    ("parentId" IS NULL AND "pageStart" IS NULL AND "pageEnd" IS NULL)
    OR ("parentId" IS NOT NULL AND "parentId" <> "id" AND "pageStart" IS NOT NULL AND "pageEnd" IS NOT NULL
      AND "pageStart" BETWEEN 1 AND "pageEnd" AND "pageEnd" <= 100)
  );
CREATE UNIQUE INDEX "Material_parentId_pageStart_pageEnd_key" ON "Material" ("parentId", "pageStart", "pageEnd");
