-- Month (1 = Jan ... 12 = Dec) the financial year starts on, for the
-- dashboard's "collected this year" figure. Defaults to April (India's FY).
ALTER TABLE "PgInfo" ADD COLUMN "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 4;
