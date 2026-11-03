ALTER TABLE "Image"
  ADD COLUMN "isSecondFrontCover" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isSecondBackCover" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Image_one_second_front_per_release" ON "Image" ("releaseId") WHERE "isSecondFrontCover" = true;
CREATE UNIQUE INDEX "Image_one_second_back_per_release" ON "Image" ("releaseId") WHERE "isSecondBackCover" = true;
