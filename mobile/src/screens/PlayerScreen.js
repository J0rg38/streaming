// ----------------------------------------------------------------------------
//  PlayerScreen — reproductor con expo-video. Usa streaming progresivo con
//  Bearer token (fiable en móvil). Reanuda desde el progreso y lo va guardando.
//
//  Nota: el streaming ADAPTATIVO (HLS) en móvil requiere propagar el token a
//  cada segmento; queda como mejora futura. El progresivo reproduce bien y
//  soporta búsqueda por rangos.
// ----------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { fetchMedia, streamUrl, authHeaders, fetchProgress, saveProgress } from '../api';

export default function PlayerScreen({ route }) {
  const { mediaId, episodeId } = route.params;
  const [source, setSource] = useState(null);
  const startAt = useRef(0);
  const lastPos = useRef(0);

  // Resolvemos la ruta del video y el punto donde reanudar.
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
      startAt.current = stopped_at || 0;
      setSource({ uri: streamUrl(videoPath), headers: authHeaders() });
    })().catch(console.warn);
  }, [mediaId, episodeId]);

  // Crea el reproductor cuando ya hay fuente. Reanuda y reproduce.
  const player = useVideoPlayer(source, (p) => {
    if (!source) return;
    if (startAt.current > 0) p.currentTime = startAt.current;
    p.play();
  });

  // Guardado de progreso periódico y al salir.
  useEffect(() => {
    if (!player) return;
    const interval = setInterval(() => {
      const t = player.currentTime || 0;
      if (t > 0) { lastPos.current = t; saveProgress(mediaId, episodeId, t); }
    }, 10000);
    return () => {
      clearInterval(interval);
      if (lastPos.current > 0) saveProgress(mediaId, episodeId, lastPos.current);
    };
  }, [player, mediaId, episodeId]);

  if (!source) {
    return <View style={styles.center}><ActivityIndicator color="#E35336" size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls
        allowsFullscreen
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
});
