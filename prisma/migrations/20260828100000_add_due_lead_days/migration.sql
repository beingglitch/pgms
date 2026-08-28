-- How many days before the 1st next month's rent charge is created.
ALTER TABLE "PgInfo" ADD COLUMN "dueLeadDays" INTEGER NOT NULL DEFAULT 7;
