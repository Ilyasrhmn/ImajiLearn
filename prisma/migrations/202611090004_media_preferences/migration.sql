-- CreateTable
CREATE TABLE "MediaPreference" (
    "materialId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "selectedMedia" TEXT[] NOT NULL,
    "songTemplateId" VARCHAR(32) NOT NULL DEFAULT 'balonku',
    "resourceVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaPreference_pkey" PRIMARY KEY ("materialId"),
    CONSTRAINT "MediaPreference_version_check" CHECK ("resourceVersion" > 0),
    CONSTRAINT "MediaPreference_song_check" CHECK ("songTemplateId" IN ('balonku', 'cicak_dinding', 'potong_bebek')),
    CONSTRAINT "MediaPreference_media_check" CHECK (
      CASE
        WHEN cardinality("selectedMedia") = 0 THEN true
        WHEN array_ndims("selectedMedia") = 1 AND array_lower("selectedMedia", 1) = 1 THEN
          cardinality("selectedMedia") <= 4
          AND "selectedMedia" <@ ARRAY['reading', 'mindmap', 'slides', 'song']::text[]
          AND array_position("selectedMedia", NULL) IS NULL
          AND cardinality(array_positions("selectedMedia", 'reading')) <= 1
          AND cardinality(array_positions("selectedMedia", 'mindmap')) <= 1
          AND cardinality(array_positions("selectedMedia", 'slides')) <= 1
          AND cardinality(array_positions("selectedMedia", 'song')) <= 1
        ELSE false
      END
    )
);

-- CreateIndex
CREATE INDEX "MediaPreference_userId_idx" ON "MediaPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaPreference_materialId_userId_key" ON "MediaPreference"("materialId", "userId");

-- AddForeignKey
ALTER TABLE "MediaPreference" ADD CONSTRAINT "MediaPreference_materialId_userId_fkey" FOREIGN KEY ("materialId", "userId") REFERENCES "Material"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaPreference" ADD CONSTRAINT "MediaPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
