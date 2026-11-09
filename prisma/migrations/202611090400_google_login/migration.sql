ALTER TABLE "Teacher" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "GoogleIdentity" (
  "sub" VARCHAR(255) NOT NULL PRIMARY KEY,
  "teacherId" UUID NOT NULL UNIQUE REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "GoogleOAuthFlow" (
  "tokenHash" CHAR(64) NOT NULL PRIMARY KEY,
  "stateHash" CHAR(64) NOT NULL,
  "nonceHash" CHAR(64) NOT NULL,
  "verifier" VARCHAR(128) NOT NULL,
  "intent" VARCHAR(5) NOT NULL CHECK ("intent" IN ('login', 'link')),
  "teacherId" UUID REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sessionTokenHash" CHAR(64),
  "passwordHashSnapshot" TEXT,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "GoogleOAuthFlow_binding" CHECK (
    ("intent" = 'login' AND "teacherId" IS NULL AND "sessionTokenHash" IS NULL AND "passwordHashSnapshot" IS NULL)
    OR ("intent" = 'link' AND "teacherId" IS NOT NULL AND "sessionTokenHash" IS NOT NULL AND "passwordHashSnapshot" IS NOT NULL)
  )
);
CREATE INDEX "GoogleOAuthFlow_expiresAt_idx" ON "GoogleOAuthFlow"("expiresAt");
