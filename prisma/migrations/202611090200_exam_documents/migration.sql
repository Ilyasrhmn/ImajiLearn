CREATE TABLE "ExamDocument" (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "document" JSONB NOT NULL CHECK (jsonb_typeof("document") = 'object'),
  "sourceSnapshots" JSONB NOT NULL CHECK (jsonb_typeof("sourceSnapshots") = 'array'),
  "resourceVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("resourceVersion" > 0)
);

CREATE INDEX "ExamDocument_userId_id_idx" ON "ExamDocument" ("userId", "id");
