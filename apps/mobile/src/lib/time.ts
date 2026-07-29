export function formatSecondsAsClock(value: number, fallback = '0:00') {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function normalizeDurationLabel(durationRaw?: string | null, durationSec?: number | null, fallback = '-') {
  const trimmedDuration = durationRaw?.trim();
  const parts = trimmedDuration?.split(':').map((part) => Number(part));

  if (parts?.length === 2 && parts.every((part) => Number.isInteger(part) && part >= 0)) {
    return formatSecondsAsClock(parts[0] * 60 + parts[1], fallback);
  }

  if (parts?.length === 3 && parts.every((part) => Number.isInteger(part) && part >= 0)) {
    return `${parts[0]}:${parts[1].toString().padStart(2, '0')}:${parts[2].toString().padStart(2, '0')}`;
  }

  if (trimmedDuration) {
    return trimmedDuration;
  }

  if (typeof durationSec === 'number') {
    return formatSecondsAsClock(durationSec, fallback);
  }

  return fallback;
}
