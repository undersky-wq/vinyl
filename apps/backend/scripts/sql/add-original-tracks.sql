-- Additive change; existing collections and mixes keep their current category.
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "isOriginal" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Release_isMix_isOriginal_idx" ON "Release" ("isMix", "isOriginal");
