import type { TimelineComment } from '../types';

export function playbackTimelineComment(comments: TimelineComment[], positionMs: number) {
  const second = positionMs / 1000;
  let active: TimelineComment | null = null;
  for (const comment of comments) {
    if (comment.second <= second && second - comment.second < 6 && (!active || comment.second > active.second)) active = comment;
  }
  return active;
}
