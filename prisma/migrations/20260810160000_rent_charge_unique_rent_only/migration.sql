-- The (tenantId, period, type) unique index blocked legitimate cases it was
-- never meant to touch: adding a second manual "Other" or "Laundry" charge
-- in the same month, or closing a second electricity reading within one
-- month. It was only ever meant to stop double-billing the same RENT cycle.
-- Replaced with a partial unique index scoped to RENT only.
DROP INDEX "Charge_tenantId_period_type_key";
CREATE UNIQUE INDEX "Charge_tenantId_period_rent_key" ON "Charge"("tenantId", "period") WHERE "type" = 'RENT';
