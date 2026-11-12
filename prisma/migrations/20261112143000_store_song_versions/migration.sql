CREATE TABLE "MaterialSongVersion" (
  "materialId" UUID NOT NULL,
  "revision" CHAR(64) NOT NULL,
  "audioId" VARCHAR(128) NOT NULL,
  "ordinal" INTEGER NOT NULL CHECK ("ordinal" BETWEEN 1 AND 8),
  "audio" BYTEA CHECK (octet_length("audio") BETWEEN 128 AND 20971520),
  "cues" JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof("cues") = 'array'),
  "alignmentAttempted" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "MaterialSongVersion_pkey" PRIMARY KEY ("materialId", "revision", "audioId"),
  CONSTRAINT "MaterialSongVersion_song_fkey" FOREIGN KEY ("materialId", "revision") REFERENCES "MaterialSong"("materialId", "revision") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaterialSongVersion_ordinal_key" UNIQUE ("materialId", "revision", "ordinal")
);
