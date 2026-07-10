// ----------------------------------------------------------------------------
//  PlayerScreen — reproductor. Usa streaming progresivo con Bearer token
//  (fiable en móvil). Reanuda desde el progreso guardado y lo va guardando.
//
//  Nota: para streaming ADAPTATIVO (HLS) en móvil hay que propagar el token a
//  cada segmento; se deja como mejora futura. El progresivo reproduce bien y
//  soporta búsqueda por rangos.
// ----------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { fetchMedia, streamUrl, authHeaders, fetchProgress, saveProgress } from '../api';

export default function PlayerScreen({ route }) {
  const { mediaId, episodeId, title } = route.params;
  const videoRef = useRef(null);
  const [uri, setUri] = useState(null);
  const startedAt = useRef(0);
  const lastSaved = useRef(0);

  useEffect(() => {
    (async () => {
      const media = await fetchMedia(mediaId);
      let videoPath;
      if (episodeId) {
        const all = (media.seasons || []).flatMap((s) => s.episodes);
        videoPath = all.find((e) => e.id === episodeId)?.video_path;
      } else {
        videoPath = media.video_path;
      }
      const { stopped_at } = await fetchProgress(mediaId, episodeId);
      // Si estaba casi terminado, empezamos desde el inicio.
      startedAt.current = stopped_at || 0;
      setUri(streamUrl(videoPath));
    })().catch(console.warn);
  }, [mediaId, episodeId]);

  // Guarda progreso al desmontar.
  useEffect(() => () => {
    if (lastSaved.current > 0) saveProgress(mediaId, episodeId, lastSaved.current);
  }, [mediaId, episodeId]);

  const onStatus = (st) => {
    if (!st.isLoaded) return;
    const secs = (st.positionMillis || 0) / 1000;
    lastSaved.current = secs;
    // Guardado periódico cada ~10s.
    if (secs - (onStatus._last || 0) >= 10) { onStatus._last = secs; saveProgress(mediaId, episodeId, secs); }
  };

  if (!uri) return <View style={styles.center}><ActivityIndicator color="#E35336" size="large" /></View>;

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        style={StyleSheet.absoluteFill}
        source={{ uri, headers: authHeaders() }}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        positionMillis={startedAt.current * 1000}
        onPlaybackStatusUpdate={onStatus}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
});
