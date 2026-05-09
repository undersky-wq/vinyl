import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Check, Download } from 'lucide-react-native';
import { downloadTrackAudio, getOfflineAudioUri } from '../lib/offline-audio';
import { colors, radius } from '../theme';
import { PlayerTrack } from '../types';

type TrackDownloadButtonProps = {
  track: PlayerTrack;
  size?: number;
};

export function TrackDownloadButton({ track, size = 17 }: TrackDownloadButtonProps) {
  const [isDownloaded, setIsDownloaded] = useState(Boolean(track.localAudioUrl));
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkDownload() {
      const localUri = await getOfflineAudioUri(track.id);

      if (!cancelled) {
        setIsDownloaded(Boolean(localUri));
      }
    }

    void checkDownload();

    return () => {
      cancelled = true;
    };
  }, [track.id]);

  async function handleDownload() {
    if (isDownloaded || isDownloading) {
      return;
    }

    setIsDownloading(true);

    try {
      await downloadTrackAudio(track);
      setIsDownloaded(true);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Pressable
      style={styles.button}
      disabled={isDownloading}
      onPress={(event) => {
        event.stopPropagation();
        void handleDownload();
      }}
    >
      {isDownloading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : isDownloaded ? (
        <Check size={size} color={colors.accent} strokeWidth={2.5} />
      ) : (
        <Download size={size} color={colors.muted} strokeWidth={2.4} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
});
