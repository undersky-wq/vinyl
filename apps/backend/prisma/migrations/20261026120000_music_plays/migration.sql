CREATE TABLE "MusicPlay" (
  "releaseId" TEXT NOT NULL REFERENCES "Release"("id") ON DELETE CASCADE,
  "sessionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("releaseId", "sessionId")
);
