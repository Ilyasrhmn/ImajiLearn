CREATE TABLE "ScheduleTerm" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "semester" CHAR(1) NOT NULL,
    "resourceVersion" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ScheduleTerm_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleTerm_period_check" CHECK ("year" BETWEEN 2000 AND 2100 AND "semester" IN ('1', '2')),
    CONSTRAINT "ScheduleTerm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ScheduleTerm_userId_year_semester_key" ON "ScheduleTerm"("userId", "year", "semester");
CREATE UNIQUE INDEX "ScheduleTerm_id_userId_key" ON "ScheduleTerm"("id", "userId");

CREATE TABLE "ScheduleSlot" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "folderId" UUID NOT NULL,
    "className" VARCHAR(80) NOT NULL,
    "day" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "resourceVersion" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ScheduleSlot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleSlot_time_check" CHECK ("day" BETWEEN 1 AND 6 AND "startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" < 1440),
    CONSTRAINT "ScheduleSlot_termId_userId_fkey" FOREIGN KEY ("termId", "userId") REFERENCES "ScheduleTerm"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduleSlot_folderId_userId_fkey" FOREIGN KEY ("folderId", "userId") REFERENCES "Folder"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ScheduleSlot_termId_userId_day_startMinute_idx" ON "ScheduleSlot"("termId", "userId", "day", "startMinute");
CREATE INDEX "ScheduleSlot_folderId_userId_idx" ON "ScheduleSlot"("folderId", "userId");
