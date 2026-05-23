'use client';

import { TimelineComment } from '../types';

function getAvatarInitial(name?: string | null) {
  return (name || 'U').trim().charAt(0).toUpperCase() || 'U';
}

export function getNearestTimelineComment(
  comments: TimelineComment[],
  percent: number,
  durationSec: number,
): TimelineComment | null {
  if (!durationSec || !comments.length) {
    return null;
  }

  const thresholdPercent = Math.max(2.5, Math.min(7, (6 / durationSec) * 100));
  let closestComment: TimelineComment | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  comments.forEach((comment) => {
    const markerPercent = Math.max(0, Math.min((comment.second / durationSec) * 100, 100));
    const distance = Math.abs(markerPercent - percent);

    if (distance <= thresholdPercent && distance < closestDistance) {
      closestComment = comment;
      closestDistance = distance;
    }
  });

  return closestComment;
}

export function TimelineCommentMarkers({
  comments,
  durationSec,
  activeCommentId,
}: {
  comments: TimelineComment[];
  durationSec: number;
  activeCommentId?: string | null;
}) {
  if (!durationSec || !comments.length) {
    return null;
  }

  return (
    <>
      {comments.map((comment) => {
        const markerPercent = Math.max(0, Math.min((comment.second / durationSec) * 100, 100));

        return (
          <span
            className={`mix-comment-marker${activeCommentId === comment.id ? ' is-visible' : ''}`}
            key={comment.id}
            style={{ left: `${markerPercent}%` }}
          >
            {comment.user.avatarStorageUrl ? (
              <img src={comment.user.avatarStorageUrl} alt={comment.user.displayName} />
            ) : (
              getAvatarInitial(comment.user.displayName)
            )}
            <span className="mix-comment-marker__tip" role="tooltip">
              <strong>{comment.user.displayName}:</strong>
              <span className="mix-comment-marker__text">{comment.text}</span>
            </span>
          </span>
        );
      })}
    </>
  );
}
