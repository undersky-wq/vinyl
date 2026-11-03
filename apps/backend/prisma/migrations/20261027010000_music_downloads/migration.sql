CREATE TABLE "MusicDownload" (
  "releaseId" TEXT NOT NULL REFERENCES "Release"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("releaseId", "userId")
);
CREATE INDEX "MusicDownload_userId_idx" ON "MusicDownload"("userId");
