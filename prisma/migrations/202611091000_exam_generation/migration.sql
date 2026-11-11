ALTER TABLE "ExamDocument"
    ADD COLUMN "generationLeaseId" UUID,
    ADD COLUMN "generationLeaseUntil" TIMESTAMPTZ(3),
    ADD CONSTRAINT "ExamDocument_generation_lease_check" CHECK (
        ("generationLeaseId" IS NULL) = ("generationLeaseUntil" IS NULL)
    );
