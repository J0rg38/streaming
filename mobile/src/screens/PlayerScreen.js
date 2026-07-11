// ----------------------------------------------------------------------------
//  PlayerScreen — reproductor con expo-video y controles PROPIOS (estilo MAX).
//
//  Usamos controles personalizados (no los nativos) para que el botón "atrás"
//  y el resto de controles aparezcan y desaparezcan JUNTOS al tocar cualquier
//  parte de la pantalla. Streaming progresivo con Bearer token (fiable en móvil),
//  reanuda desde el progreso y lo va guardando.
// ----------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, ActivityIndicator,
  PanResponder, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { fetchMedia, streamUrl, authHeaders, fetchProgress, saveProgress } from '../api';
import { getLocalProgress, saveLocalProgress } from '../progress';
import {
  PlayIcon, PauseIcon, ChevronLeftIcon, RotateCcwIcon, RotateCwIcon,
} from '../components/PlayerIcons';

const clamp01 = (x) => Math.max(0, Math.min(1, x || 0));

function fmt(t) {
  if (!Number.isFinite(t) || t < 0) return '0:00';
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export default function PlayerScreen({ route, navigation }) {
  const { mediaId, episodeId, localUri } = route.params;
  const insets = useSafeAreaInsets();

  const [source, setSource] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [scrub, setScrub] = useState(null); // ratio mientras se arrastra, o null

  const startAt = useRef(0);
  const seeked = useRef(false);   // ya se aplicó el salto de reanudación
  const lastPos = useRef(0);
  const hideTimer = useRef(null);
  const playerRef = useRef(null);
  const durRef = useRef(0);
  const barWidth = useRef(1);

  // --- Mostrar/ocultar controles (todo junto) -------------------------------
  const clearHide = () => clearTimeout(hideTimer.current);
  const scheduleHide = () => {
    clearHide();
    // Sólo se ocultan si el video está reproduciéndose (en pausa se quedan).
    hideTimer.current = setTimeout(() => {
      if (playerRef.current?.playing) setShowControls(false);
    }, 3800);
  };
  const revealControls = () => { setShowControls(true); scheduleHide(); };
  const toggleControls = () => {
    if (showControls) { clearHide(); setShowControls(false); }
    else revealControls();
  };

  // --- Resolver la fuente y el punto de reanudación -------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Fuente: local (offline) o streaming.
      let src;
      if (localUri) {
        src = { uri: localUri };
      } else {
        const media = await fetchMedia(mediaId);
        const videoPath = episodeId
          ? (media.seasons || []).flatMap((s) => s.episodes).find((e) => e.id === episodeId)?.video_path
          : media.video_path;
        src = { uri: streamUrl(videoPath), headers: authHeaders() };
      }

      // Reanudar desde el MAYOR entre el progreso del servidor y el local
      // (el local siempre está disponible, también sin conexión).
      const [srv, loc] = await Promise.all([
        fetchProgress(mediaId, episodeId), // {stopped_at:0} si no hay red
        getLocalProgress(mediaId, episodeId),
      ]);
      if (cancelled) return;
      startAt.current = Math.max(srv?.stopped_at || 0, loc || 0);
      seeked.current = false; // el salto se aplicará cuando el video esté listo
      setSource(src);
    })().catch(console.warn);
    return () => { cancelled = true; };
  }, [mediaId, episodeId, localUri]);

  // --- Crear el reproductor cuando hay fuente -------------------------------
  const player = useVideoPlayer(source, (p) => {
    if (!source) return;
    p.volume = 1.0;
    p.play();
    // El salto de reanudación NO se hace aquí (el video aún no tiene metadatos);
    // se aplica en el sondeo, en cuanto se conoce la duración.
  });
  playerRef.current = player;

  // Arranca con los controles visibles y programa su auto-ocultado.
  useEffect(() => {
    revealControls();
    return clearHide;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modo inmersivo Android: oculta la barra de navegación inferior (se puede
  // recuperar deslizando desde el borde). Se restaura al salir del reproductor.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
    return () => {
      NavigationBar.setVisibilityAsync('visible').catch(() => {});
    };
  }, []);

  // --- Sondeo de estado (posición, duración, play/buffer) -------------------
  useEffect(() => {
    if (!player) return;
    const id = setInterval(() => {
      try {
        const d = player.duration || 0;
        durRef.current = d;
        setDur(d);

        // Reanudación: en cuanto el video tiene duración (metadatos listos),
        // saltamos UNA vez al punto guardado. Fiable en streaming y offline.
        if (!seeked.current && d > 0) {
          seeked.current = true;
          const target = startAt.current;
          if (target > 1 && target < d - 2) { player.currentTime = target; }
        }

        const cur = player.currentTime || 0;
        if (cur > 0) lastPos.current = cur; // siempre fresco para guardar al salir
        if (scrub == null) setPos(cur);
        setPlaying(!!player.playing);
        setBuffering(player.status === 'loading');
      } catch { /* noop */ }
    }, 250);
    return () => clearInterval(id);
  }, [player, scrub]);

  // --- Guardado de progreso --------------------------------------------------
  useEffect(() => {
    if (!player) return;
    const interval = setInterval(() => {
      const t = player.currentTime || 0;
      if (t > 0) { lastPos.current = t; saveProgress(mediaId, episodeId, t); saveLocalProgress(mediaId, episodeId, t); }
    }, 10000);
    return () => {
      clearInterval(interval);
      if (lastPos.current > 0) { saveProgress(mediaId, episodeId, lastPos.current); saveLocalProgress(mediaId, episodeId, lastPos.current); }
    };
  }, [player, mediaId, episodeId]);

  // --- Acciones --------------------------------------------------------------
  const togglePlay = () => {
    const p = playerRef.current; if (!p) return;
    if (p.playing) p.pause(); else p.play();
    revealControls();
  };
  const skip = (delta) => {
    const p = playerRef.current; if (!p) return;
    const next = Math.max(0, Math.min(durRef.current || Infinity, (p.currentTime || 0) + delta));
    p.currentTime = next;
    setPos(next);
    revealControls();
  };
  const goBack = () => {
    const p = playerRef.current;
    const t = p?.currentTime || 0;
    if (t > 0) { saveProgress(mediaId, episodeId, t); saveLocalProgress(mediaId, episodeId, t); }
    navigation.goBack();
  };

  // --- Barra de progreso arrastrable (PanResponder, sin dependencias) -------
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        clearHide();
        setScrub(clamp01(e.nativeEvent.locationX / barWidth.current));
      },
      onPanResponderMove: (e) => {
        setScrub(clamp01(e.nativeEvent.locationX / barWidth.current));
      },
      onPanResponderRelease: (e) => {
        const r = clamp01(e.nativeEvent.locationX / barWidth.current);
        const p = playerRef.current;
        if (p && durRef.current) { p.currentTime = r * durRef.current; setPos(r * durRef.current); }
        setScrub(null);
        scheduleHide();
      },
      onPanResponderTerminate: () => { setScrub(null); scheduleHide(); },
    }),
  ).current;

  if (!source) {
    return (
      <View style={styles.center}>
        <StatusBar hidden />
        <TouchableOpacity style={[styles.back, { top: insets.top + 10 }]} onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronLeftIcon size={30} />
        </TouchableOpacity>
        <ActivityIndicator color="#E35336" size="large" />
      </View>
    );
  }

  const shownPos = scrub != null ? scrub * dur : pos;
  const pct = dur ? clamp01(shownPos / dur) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Oculta la barra de estado de Android (batería, hora, notificaciones) */}
      <StatusBar hidden />

      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls={false}
        contentFit="contain"
      />

      {/* Captura de toques en TODA la pantalla: muestra/oculta los controles */}
      <Pressable style={StyleSheet.absoluteFill} onPress={toggleControls} />

      {/* Spinner de carga (siempre visible durante el buffering) */}
      {buffering && (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}

      {showControls && (
        <>
          {/* Oscurecido para dar contraste a los controles */}
          <View style={styles.scrim} pointerEvents="none" />

          {/* Barra superior: botón atrás */}
          <View style={styles.topBar} pointerEvents="box-none">
            <TouchableOpacity style={[styles.back, { top: insets.top + 8 }]} onPress={goBack} hitSlop={12}>
              <ChevronLeftIcon size={30} />
            </TouchableOpacity>
          </View>

          {/* Controles centrales: atrasar · play/pausa · adelantar */}
          <View style={styles.centerRow} pointerEvents="box-none">
            <TouchableOpacity style={styles.sideBtn} onPress={() => skip(-10)} hitSlop={10}>
              <RotateCcwIcon size={46} />
              <View style={styles.sideNumWrap} pointerEvents="none"><Text style={styles.sideNum}>10</Text></View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.playBtn} onPress={togglePlay} hitSlop={10}>
              {playing ? <PauseIcon size={40} /> : <PlayIcon size={40} />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.sideBtn} onPress={() => skip(10)} hitSlop={10}>
              <RotateCwIcon size={46} />
              <View style={styles.sideNumWrap} pointerEvents="none"><Text style={styles.sideNum}>10</Text></View>
            </TouchableOpacity>
          </View>

          {/* Barra inferior: progreso + tiempos */}
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
            <Text style={styles.time}>{fmt(shownPos)}</Text>
            <View
              style={styles.track}
              onLayout={(e) => { barWidth.current = e.nativeEvent.layout.width || 1; }}
              {...pan.panHandlers}
            >
              <View style={styles.trackBg} />
              <View style={[styles.trackFill, { width: `${pct}%` }]} />
              <View style={[styles.thumb, { left: `${pct}%` }]} />
            </View>
            <Text style={styles.time}>{fmt(dur)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  spinner: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, paddingBottom: 8 },
  back: {
    position: 'absolute', left: 14,
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  centerRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 44,
  },
  sideBtn: { alignItems: 'center', justifyContent: 'center', width: 70, height: 70 },
  sideNumWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  sideNum: { color: '#fff', fontSize: 12, fontWeight: '800' },
  playBtn: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12,
  },
  time: { color: '#fff', fontSize: 13, fontWeight: '600', width: 52, textAlign: 'center' },
  track: { flex: 1, height: 26, justifyContent: 'center' },
  trackBg: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  trackFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: '#E35336' },
  thumb: {
    position: 'absolute', width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#E35336', marginLeft: -7,
  },
});
