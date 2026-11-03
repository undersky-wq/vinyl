ALTER TABLE "Image" ADD COLUMN "isBackCover" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the previously selected back without copying or renaming its file.
WITH previous_backs AS (
  SELECT DISTINCT ON ("releaseId") "id"
  FROM "Image"
  WHERE "type" = 'GALLERY'
    AND left("storageKey", length('covers/manual/' || "releaseId" || '/back.'))
      = 'covers/manual/' || "releaseId" || '/back.'
  ORDER BY "releaseId", "createdAt" DESC, "id" DESC
)
UPDATE "Image" SET "isBackCover" = true WHERE "id" IN (SELECT "id" FROM previous_backs);

CREATE UNIQUE INDEX "Image_one_back_cover_per_release"
  ON "Image" ("releaseId") WHERE "isBackCover" = true;
