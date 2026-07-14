// ----------------------------------------------------------------------------
//  PlayerScreen — reproductor con expo-video y controles PROPIOS (estilo MAX).
//
//  Usamos controles personalizados (no los nativos) para que el botón "atrás"
//  y el resto de controles aparezcan y desaparezcan JUNTOS al tocar cualquier
//  parte de la pantalla. Streaming progresivo con Bearer token (fiable en móvil),
//  reanuda desde el progreso y lo va guardando.
// ----------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, Pressable, ActivityIndicator,
  PanResponder, Platform, useTVEventHandler, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { fetchMedia, streamUrl, authHeaders, fetchProgress, saveProgress, imageSource } from '../api';
import { getLocalProgress, saveLocalProgress } from '../progress';
import Focusable from '../components/Focusable';
import {
  PlayIcon, PauseIcon, ChevronLeftIcon, RotateCcwIcon, RotateCwIcon,
  MaximizeIcon, MinimizeIcon,
} from '../components/PlayerIcons';

const IS_TV = Platform.isTV === true;
// En TV los botones NO son enfocables: el control remoto se maneja globalmente
// (D-pad = adelantar/atrasar, centro = play/pausa), como en Netflix/Prime.
const TV_OFF = IS_TV ? { focusable: false, isTVSelectable: false } : undefined;

const clamp01 = (x) => Math.max(0, Math.min(1, x || 0));

// Parsea el WebVTT de miniaturas (sprite) → cues con recorte y tamaño total.
function vttTime(t) {
  const [hh, mm, rest] = t.split(':');
  const [ss, ms = '0'] = (rest || '0').split('.');
  return (+hh) * 3600 + (+mm) * 60 + (+ss) + (+ms) / 1000;
}
function parseThumbnailsVtt(text) {
  const cues = [];
  let sw = 0, sh = 0;
  for (const block of text.trim().split(/\n\n+/)) {
    const lines = block.split('\n');
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const urlLine = lines[lines.indexOf(timeLine) + 1] || '';
    const xywh = urlLine.match(/#xywh=(\d+),(\d+),(\d+),(\d+)/);
    if (!xywh) continue;
    const [s, e] = timeLine.split('-->').map((x) => vttTime(x.trim()));
    const x = +xywh[1], y = +xywh[2], w = +xywh[3], h = +xywh[4];
    sw = Math.max(sw, x + w); sh = Math.max(sh, y + h);
    cues.push({ start: s, end: e, x, y, w, h });
  }
  return { cues, spriteW: sw, spriteH: sh };
}

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
  const [fit, setFit] = useState('contain'); // 'contain' (ajustar) | 'cover' (expandir)
  const [thumbsPath, setThumbsPath] = useState(null);
  const [thumbs, setThumbs] = useState(null); // { cues, spriteUri, spriteW, spriteH }

  const startAt = useRef(0);
  const seeked = useRef(false);   // ya se aplicó el salto de reanudación
  const lastPos = useRef(0);
  const hideTimer = useRef(null);
  const playerRef = useRef(null);
  const durRef = useRef(0);
  const barWidth = useRef(1);
  const trackRef = useRef(null);
  const trackX = useRef(0); // posición absoluta (en ventana) del borde izq. del track

  // --- Mostrar/ocultar controles (todo junto) -------------------------------
  const clearHide = () => clearTimeout(hideTimer.current);
  const scheduleHide = () => {
    clearHide();
    // Sólo se ocultan si el video está reproduciéndose (en pausa se quedan).
    hideTimer.current = setTimeout(() => {
      if (playerRef.current?.playing) setShowControls(false);
    }, IS_TV ? 5000 : 3800);
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
        src = { uri: localUri }; // offline: sin miniaturas (no se descargan)
      } else {
        const media = await fetchMedia(mediaId);
        const ep = episodeId
          ? (media.seasons || []).flatMap((s) => s.episodes).find((e) => e.id === episodeId)
          : null;
        const videoPath = ep ? ep.video_path : media.video_path;
        src = { uri: streamUrl(videoPath), headers: authHeaders() };
        if (!cancelled) setThumbsPath(ep ? ep.thumbnails : media.thumbnails);
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

  // --- Miniaturas (sprite + VTT) para el preview de la barra ----------------
  useEffect(() => {
    if (!thumbsPath) { setThumbs(null); return; }
    let cancelled = false;
    const vttUri = imageSource(thumbsPath)?.uri;
    const spriteUri = imageSource(thumbsPath.replace('thumbnails.vtt', 'thumbnails.jpg'))?.uri;
    if (!vttUri || !spriteUri) return;
    fetch(vttUri)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((text) => {
        if (cancelled) return;
        const { cues, spriteW, spriteH } = parseThumbnailsVtt(text);
        if (cues.length) setThumbs({ cues, spriteUri, spriteW, spriteH });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [thumbsPath]);

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

  // --- Control remoto (Android TV): D-pad ±10s, centro play/pausa -----------
  //  Las acciones se leen desde un ref para tener un handler estable (no
  //  re-suscribir en cada render) sin closures obsoletas.
  const actionsRef = useRef({});
  actionsRef.current = { revealControls, skip, togglePlay };
  const onTVEvent = useCallback((evt) => {
    if (!IS_TV || !evt) return;
    const t = evt.eventType;
    const a = actionsRef.current;
    switch (t) {
      case 'left':
      case 'rewind':
        a.revealControls(); a.skip(-10); break;
      case 'right':
      case 'fastForward':
        a.revealControls(); a.skip(10); break;
      case 'up':
      case 'down':
        a.revealControls(); break;
      case 'playPause':
        a.revealControls(); a.togglePlay(); break;
      // 'select' (OK) lo maneja el onPress del ancla enfocable, para no duplicar.
      default: break;
    }
  }, []);
  useTVEventHandler(onTVEvent);

  // OK / centro del control remoto (o toque en móvil).
  const onCenterPress = () => {
    if (IS_TV) { revealControls(); togglePlay(); }
    else toggleControls();
  };

  // --- Barra de progreso arrastrable (PanResponder, sin dependencias) -------
  //  Usa coordenadas ABSOLUTAS de pantalla (gestureState) respecto al borde
  //  del track, no locationX (que es relativo al hijo bajo el dedo y hacía
  //  saltar el valor al inicio al pasar sobre el thumb/la barra).
  const measureTrack = () => {
    trackRef.current?.measureInWindow((x, _y, w) => {
      trackX.current = x;
      if (w) barWidth.current = w;
    });
  };
  const ratioFromX = (absX) => clamp01((absX - trackX.current) / (barWidth.current || 1));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e, g) => { clearHide(); measureTrack(); setScrub(ratioFromX(g.x0)); },
      onPanResponderMove: (e, g) => { setScrub(ratioFromX(g.moveX)); },
      onPanResponderRelease: (e, g) => {
        const r = ratioFromX(g.moveX);
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

  // Preview de miniaturas: cue actual con tamaños/offsets ya escalados.
  const TRACK_LEFT = 82; // paddingLeft(18) + tiempo(52) + gap(12)
  const PREVIEW_W = 150;
  let preview = null;
  if (thumbs && scrub != null) {
    const cue = thumbs.cues.find((c) => shownPos >= c.start && shownPos < c.end) || thumbs.cues[thumbs.cues.length - 1];
    if (cue) {
      const scale = PREVIEW_W / cue.w;
      const bw = barWidth.current || 1;
      preview = {
        uri: thumbs.spriteUri,
        w: PREVIEW_W, h: cue.h * scale,
        spriteW: thumbs.spriteW * scale, spriteH: thumbs.spriteH * scale,
        cropX: cue.x * scale, cropY: cue.y * scale,
        left: TRACK_LEFT + Math.max(0, Math.min(bw - PREVIEW_W, scrub * bw - PREVIEW_W / 2)),
      };
    }
  }

  return (
    <View style={styles.container}>
      {/* Oculta la barra de estado de Android (batería, hora, notificaciones) */}
      <StatusBar hidden />

      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls={false}
        contentFit={fit}
      />

      {/* Ancla a pantalla completa. En móvil: toca para mostrar/ocultar y OK.
          En TV: ES el elemento enfocable que retiene el foco para que el D-pad
          genere eventos (izq/der = ±10s vía TVEventHandler) y OK = play/pausa. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onCenterPress}
        focusable={IS_TV}
        isTVSelectable={IS_TV}
        hasTVPreferredFocus={IS_TV}
      />

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

          {/* Barra superior: atrás (izq) + ajustar/expandir imagen (der) */}
          <View style={styles.topBar} pointerEvents="box-none">
            <Focusable style={[styles.back, { top: insets.top + 8 }]} onPress={goBack} hitSlop={12} ring={false} focusStyle={styles.focusRound} {...TV_OFF}>
              <ChevronLeftIcon size={30} />
            </Focusable>
            {!IS_TV && (
              <Focusable
                style={[styles.fitBtn, { top: insets.top + 8 }]}
                onPress={() => { setFit((f) => (f === 'contain' ? 'cover' : 'contain')); revealControls(); }}
                hitSlop={12}
                ring={false}
                focusStyle={styles.focusRound}
              >
                {fit === 'contain' ? <MaximizeIcon size={22} /> : <MinimizeIcon size={22} />}
              </Focusable>
            )}
          </View>

          {/* Controles centrales: atrasar · play/pausa · adelantar */}
          <View style={styles.centerRow} pointerEvents="box-none">
            <Focusable style={styles.sideBtn} onPress={() => skip(-10)} hitSlop={10} ring={false} focusStyle={styles.focusSide} focusScale={1.12} {...TV_OFF}>
              <RotateCcwIcon size={46} />
              <View style={styles.sideNumWrap} pointerEvents="none"><Text style={styles.sideNum}>10</Text></View>
            </Focusable>

            <Focusable style={styles.playBtn} onPress={togglePlay} hitSlop={10} ring={false} focusStyle={styles.focusPlay} focusScale={1.1} {...TV_OFF}>
              {playing ? <PauseIcon size={40} /> : <PlayIcon size={40} />}
            </Focusable>

            <Focusable style={styles.sideBtn} onPress={() => skip(10)} hitSlop={10} ring={false} focusStyle={styles.focusSide} focusScale={1.12} {...TV_OFF}>
              <RotateCwIcon size={46} />
              <View style={styles.sideNumWrap} pointerEvents="none"><Text style={styles.sideNum}>10</Text></View>
            </Focusable>
          </View>

          {/* Preview de miniaturas mientras se arrastra (estilo web) */}
          {preview && (
            <View style={[styles.previewWrap, { bottom: insets.bottom + 54, left: preview.left, width: preview.w }]} pointerEvents="none">
              <View style={[styles.previewImgBox, { width: preview.w, height: preview.h }]}>
                <Image
                  source={{ uri: preview.uri }}
                  style={{ position: 'absolute', width: preview.spriteW, height: preview.spriteH, left: -preview.cropX, top: -preview.cropY }}
                />
              </View>
              <Text style={styles.previewTime}>{fmt(shownPos)}</Text>
            </View>
          )}

          {/* Barra inferior: progreso + tiempos */}
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
            <Text style={styles.time}>{fmt(shownPos)}</Text>
            <View
              ref={trackRef}
              style={styles.track}
              onLayout={(e) => { barWidth.current = e.nativeEvent.layout.width || 1; measureTrack(); }}
              {...pan.panHandlers}
            >
              <View style={styles.trackBg} />
              <View style={[styles.trackFill, { width: `${pct}%` }]} />
              <View style={[styles.thumb, { left: `${pct}%` }, scrub != null && styles.thumbActive]} />
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
  fitBtn: {
    position: 'absolute', right: 14,
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
  // Estilos de FOCO (control remoto / Android TV) para botones redondos.
  focusRound: { borderWidth: 2, borderColor: '#E35336', borderRadius: 23 },
  focusSide: { backgroundColor: 'rgba(227,83,54,0.28)', borderRadius: 35 },
  focusPlay: { borderWidth: 3, borderColor: '#E35336', backgroundColor: 'rgba(227,83,54,0.25)' },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12,
  },
  time: { color: '#fff', fontSize: 13, fontWeight: '600', width: 52, textAlign: 'center' },
  // Área táctil alta (44px) para que el arrastre responda bien; la barra visible
  // (4px) va centrada dentro.
  track: { flex: 1, height: 44, justifyContent: 'center' },
  trackBg: { position: 'absolute', left: 0, right: 0, top: '50%', marginTop: -2, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  trackFill: { position: 'absolute', left: 0, top: '50%', marginTop: -2, height: 4, borderRadius: 2, backgroundColor: '#E35336' },
  thumb: {
    position: 'absolute', top: '50%', width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#E35336', marginLeft: -7, marginTop: -7,
  },
  thumbActive: { width: 20, height: 20, borderRadius: 10, marginLeft: -10, marginTop: -10 },

  previewWrap: { position: 'absolute', alignItems: 'center' },
  previewImgBox: {
    borderRadius: 6, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: '#000',
  },
  previewTime: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 4, textShadowColor: '#000', textShadowRadius: 4 },
});
