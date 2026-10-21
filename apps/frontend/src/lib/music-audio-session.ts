type MusicAudioPlatform = { audioSession?: { type: string } };

export function configureMusicAudioSession(
  platform: MusicAudioPlatform | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator as MusicAudioPlatform,
) {
  try {
    const session = platform?.audioSession;
    if (!session) return false;
    if (session.type !== 'playback') session.type = 'playback';
    return true;
  } catch {
    // Unsupported or restricted audio-session APIs must not prevent playback.
    return false;
  }
}
