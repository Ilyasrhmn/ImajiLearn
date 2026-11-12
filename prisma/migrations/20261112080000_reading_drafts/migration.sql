CREATE TABLE "ReadingDraft" (
    "rootId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "selectionId" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ReadingDraft_pkey" PRIMARY KEY ("rootId"),
    CONSTRAINT "ReadingDraft_rootId_userId_fkey" FOREIGN KEY ("rootId", "userId") REFERENCES "Material"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReadingDraft_selectionId_userId_fkey" FOREIGN KEY ("selectionId", "userId") REFERENCES "Material"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReadingDraft_rootId_userId_key" ON "ReadingDraft"("rootId", "userId");
CREATE INDEX "ReadingDraft_userId_updatedAt_rootId_idx" ON "ReadingDraft"("userId", "updatedAt" DESC, "rootId");
CREATE INDEX "ReadingDraft_selectionId_userId_idx" ON "ReadingDraft"("selectionId", "userId");
