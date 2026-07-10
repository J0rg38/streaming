// ----------------------------------------------------------------------------
//  PlayerScreen — reproductor con expo-video. Usa streaming progresivo con
//  Bearer token (fiable en móvil). Reanuda desde el progreso y lo va guardando.
//
//  Nota: el streaming ADAPTATIVO (HLS) en móvil requiere propagar el token a
//  cada segmento; queda como mejora futura. El progresivo reproduce bien y
//  soporta búsqueda por rangos.
// ----------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { fetchMedia, streamUrl, authHeaders, fetchProgress, saveProgress } from '../api';

export default function PlayerScreen({ route, navigation }) {
  const { mediaId, episodeId } = route.params;
  const insets = useSafeAreaInsets();
  const [source, setSource] = useState(null);
  const [showBack, setShowBack] = useState(true);
  const startAt = useRef(0);
  const lastPos = useRef(0);
  const hideTimer = useRef(null);

  // Muestra el botón y programa su auto-ocultado (como los controles nativos).
  const bumpBack = () => {
    setShowBack(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowBack(false), 3500);
  };
  useEffect(() => {
    bumpBack();
    return () => clearTimeout(hideTimer.current);
  }, []);

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
    p.volume = 1.0; // volumen al máximo por defecto
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

  // Al salir: guarda el progreso actual y vuelve atrás.
  const goBack = () => {
    const t = player?.currentTime || 0;
    if (t > 0) saveProgress(mediaId, episodeId, t);
    navigation.goBack();
  };

  if (!source) {
    return (
      <View style={styles.center}>
        <TouchableOpacity style={[styles.back, { top: insets.top + 10 }]} onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <ActivityIndicator color="#E35336" size="large" />
      </View>
    );
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

      {/* Zona táctil superior: al tocar, reaparece el botón (los controles
          nativos aparecen al tocar el centro/abajo del video). */}
      <TouchableOpacity
        activeOpacity={1}
        style={styles.tapZone}
        onPress={bumpBack}
      />

      {showBack && (
        <TouchableOpacity
          style={[styles.back, { top: insets.top + 10 }]}
          onPress={goBack}
          hitSlop={12}
        >
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  tapZone: { position: 'absolute', top: 0, left: 0, right: 0, height: 90, zIndex: 15 },
  back: {
    position: 'absolute', left: 14, zIndex: 20,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  backTxt: { color: '#fff', fontSize: 30, lineHeight: 32, marginTop: -2, fontWeight: '600' },
});
