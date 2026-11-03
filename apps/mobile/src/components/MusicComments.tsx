import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Heart, Send, Trash2 } from 'lucide-react-native';
import { createReleaseTimelineComment, deleteReleaseTimelineComment, fetchJson } from '../lib/api';
import { adaptiveStyles, colors } from '../theme';
import type { AuthUser, TimelineComment } from '../types';

export const musicTime = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
export function MusicComments({ releaseId, comments, onChange, currentUser, second, onSeek, ru = false }: {
  releaseId: string; comments: TimelineComment[]; onChange: (comments: TimelineComment[]) => void;
  currentUser?: AuthUser | null; second: number; onSeek: (second: number) => void; ru?: boolean;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fail = () => Alert.alert(ru ? 'Не удалось сохранить' : 'Unable to save', ru ? 'Проверьте подключение и вход в аккаунт.' : 'Check your connection and sign in.');
  async function send() {
    if (!currentUser || !text.trim() || busy) return;
    setBusy('send');
    try { const comment = await createReleaseTimelineComment(releaseId, { second: Math.floor(second), text: text.trim() }); onChange([...comments, comment]); setText(''); } catch { fail(); } finally { setBusy(null); }
  }
  async function like(comment: TimelineComment) {
    if (!currentUser || busy) return;
    setBusy(comment.id);
    try {
      const result = await fetchJson<{ likeCount: number; likedByMe: boolean }>(`/releases/${releaseId}/comments/${comment.id}/like`, { method: comment.likedByMe ? 'DELETE' : 'POST' });
      onChange(comments.map(item => item.id === comment.id ? { ...item, ...result } : item));
    } catch { fail(); } finally { setBusy(null); }
  }
  async function remove(id: string) {
    if (busy) return; setBusy(id);
    try { await deleteReleaseTimelineComment(releaseId, id); onChange(comments.filter(item => item.id !== id)); } catch { fail(); } finally { setBusy(null); }
  }
  const avatar = (url?: string | null, name = '') => url ? <Image source={{ uri: url }} style={styles.avatar} /> : <View style={styles.avatar}><Text style={styles.text}>{name.slice(0, 1)}</Text></View>;
  return <View>
    <View style={styles.row}>{avatar(currentUser?.avatarStorageUrl, currentUser?.displayName)}<Text style={styles.time}>{musicTime(second)}</Text>
      <TextInput value={text} onChangeText={setText} editable={!!currentUser && !busy} placeholder={currentUser ? (ru ? 'Комментарий на таймлайне…' : 'Comment on the timeline…') : (ru ? 'Войдите для комментария' : 'Sign in to comment')} placeholderTextColor={colors.muted} style={styles.input} />
      <Pressable accessibilityLabel={ru ? 'Отправить' : 'Send'} disabled={!text.trim() || !!busy} onPress={() => void send()} style={styles.action}><Send size={20} color={colors.muted} /></Pressable>
    </View>
    {comments.map(comment => <View key={comment.id} style={styles.row}>
      <Pressable style={styles.comment} onPress={() => onSeek(comment.second)} accessibilityLabel={`${musicTime(comment.second)} ${comment.user.displayName}: ${comment.text}`}>
        {avatar(comment.user.avatarStorageUrl, comment.user.displayName)}<Text style={styles.time}>{musicTime(comment.second)}</Text>
        <Text style={[styles.text, styles.body]}><Text style={styles.name}>{comment.user.displayName}: </Text>{comment.text}</Text>
      </Pressable>
      <Pressable style={styles.like} accessibilityLabel={ru ? 'Нравится' : 'Like'} disabled={!currentUser || !!busy} onPress={() => void like(comment)}><Heart size={19} color={comment.likedByMe ? '#db3045' : colors.text} fill={comment.likedByMe ? '#db3045' : 'none'} /><Text style={styles.count}>{(comment.likeCount || 0) > 0 ? comment.likeCount : ''}</Text></Pressable>
      <View style={styles.action}>{currentUser && (currentUser.id === comment.userId || currentUser.role === 'ADMIN') ? <Pressable accessibilityLabel={ru ? 'Удалить' : 'Delete'} disabled={!!busy} onPress={() => void remove(comment.id)}><Trash2 size={19} color={colors.text} /></Pressable> : null}</View>
    </View>)}
  </View>;
}
const styles = adaptiveStyles(StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  comment: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }, avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.panelSoft, alignItems: 'center', justifyContent: 'center' },
  time: { width: 39, color: colors.muted, fontSize: 11 }, text: { color: colors.text, fontSize: 12 }, name: { fontWeight: '600' }, body: { flex: 1 },
  input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 12, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  action: { width: 24, alignItems: 'center', justifyContent: 'center' }, like: { width: 34, flexDirection: 'row', alignItems: 'center', gap: 2 }, count: { color: colors.text, fontSize: 10, width: 13 },
}));
