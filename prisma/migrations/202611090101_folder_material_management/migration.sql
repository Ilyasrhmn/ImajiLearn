CREATE TABLE "Folder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameKey" VARCHAR(240) NOT NULL,
    "resourceVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Folder_id_userId_key" ON "Folder"("id", "userId");
CREATE UNIQUE INDEX "Folder_userId_nameKey_key" ON "Folder"("userId", "nameKey");

ALTER TABLE "Material"
    ADD COLUMN "folderId" UUID,
    ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT "Material_folderId_userId_fkey" FOREIGN KEY ("folderId", "userId")
        REFERENCES "Folder"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Material_folderId_userId_idx" ON "Material"("folderId", "userId");
