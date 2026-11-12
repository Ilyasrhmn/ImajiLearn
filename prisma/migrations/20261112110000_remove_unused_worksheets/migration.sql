DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "WorksheetDocument") THEN
    RAISE EXCEPTION 'WorksheetDocument still contains records; export them before removing worksheet storage';
  END IF;
END $$;

DROP TABLE "WorksheetDocument";
DROP TABLE "WorksheetLibrary";
