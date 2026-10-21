BEGIN;
CREATE TABLE "TimelineCommentLike" (
  "commentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimelineCommentLike_pkey" PRIMARY KEY ("commentId", "userId"),
  CONSTRAINT "TimelineCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TimelineComment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TimelineCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TimelineCommentLike_userId_idx" ON "TimelineCommentLike"("userId");
COMMIT;
