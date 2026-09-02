-- Username replaces email as the login identifier (email stays, just no
-- longer used to sign in); latitude/longitude capture the onboarding map
-- pick; onboardingCompletedAt gates the new first-run wizard.

-- 1. username: backfilled from each existing account's email local-part,
-- deduped with a numeric suffix on collision, then locked down.
ALTER TABLE "Account" ADD COLUMN "username" TEXT;

WITH base AS (
  SELECT
    "id",
    regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9_-]+', '', 'g') AS slug
  FROM "Account"
),
numbered AS (
  SELECT
    "id",
    CASE WHEN slug = '' THEN 'owner' ELSE slug END AS slug,
    ROW_NUMBER() OVER (PARTITION BY CASE WHEN slug = '' THEN 'owner' ELSE slug END ORDER BY "id") AS n
  FROM base
)
UPDATE "Account" a
SET "username" = CASE WHEN numbered.n = 1 THEN numbered.slug ELSE numbered.slug || numbered.n::text END
FROM numbered
WHERE a."id" = numbered."id";

ALTER TABLE "Account" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "Account" ADD CONSTRAINT "Account_username_key" UNIQUE ("username");

-- 2. Map-picked location, optional.
ALTER TABLE "Account" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Account" ADD COLUMN "longitude" DOUBLE PRECISION;

-- 3. Onboarding gate: existing accounts already set their property up by
-- hand through Settings, so they're marked complete rather than forced
-- through the new wizard retroactively. New signups get NULL naturally.
ALTER TABLE "Account" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
UPDATE "Account" SET "onboardingCompletedAt" = CURRENT_TIMESTAMP;
