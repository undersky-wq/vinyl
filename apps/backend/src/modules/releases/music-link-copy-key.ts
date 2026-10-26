import { createHash } from 'node:crypto';

export function musicLinkCopyKey(requestId: string, userId?: string) {
  return userId ? createHash('sha256').update(`music-link-copy:account:${userId}`).digest('hex').slice(0, 36) : requestId;
}
