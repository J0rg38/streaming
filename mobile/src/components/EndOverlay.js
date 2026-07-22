// ----------------------------------------------------------------------------
//  EndOverlay — pantalla al terminar una película o capítulo (estilo Netflix).
//
//  Equivalente al EndScreen de la web: fondo con el banner de "lo siguiente",
//  botón de reproducir con ANILLO de cuenta atrás y autoreproducción al llegar
//  a cero. Sirve en móvil y en televisor; en TV los botones son enfocables con
//  el D-pad y el de reproducir arranca con el foco.
//
//  Props:
//    nextItem : { subtitle, title, meta, banner_url, poster_url } | null
//    seconds  : duración de la cuenta atrás (10 por defecto)
//    onPlayNext(), onReplay(), onBack()
// ----------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { imageSource } from '../api';
import Focusable from './Focusable';
import { PlayFilledIcon, XIcon } from './Icons';
import { RotateCcwIcon, ChevronLeftIcon } from './PlayerIcons';

const IS_TV = Platform.isTV === true;
const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;

export default function EndOverlay({ nextItem, seconds = 10, onPlayNext, onReplay, onBack }) {
  const [remaining, setRemaining] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);
  const timer = useRef(null);

  // El contador solo corre si hay "siguiente" y el usuario no lo ha detenido.
  const counting = Boolean(nextItem) && !cancelled;

  useEffect(() => {
    if (!counting) return;
    timer.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timer.current);
          onPlayNext();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timer.current);
  }, [counting, onPlayNext]);

  const backdrop = nextItem?.banner_url || nextItem?.poster_url;
  // Fracción de anillo pendiente (se va vaciando).
  const ringOffset = RING_C * (1 - remaining / seconds);

  return (
    <View style={styles.root}>
      {!!backdrop && (
        <Image source={imageSource(backdrop)} style={styles.backdrop} resizeMode="cover" />
      )}
      <View style={styles.scrim} pointerEvents="none" />

      <View style={styles.content}>
        {nextItem ? (
          <>
            <Text style={styles.kicker}>{nextItem.subtitle || 'A CONTINUACIÓN'}</Text>
            <Text style={styles.title} numberOfLines={2}>{nextItem.title}</Text>
            {!!nextItem.meta && <Text style={styles.meta}>{nextItem.meta}</Text>}

            <View style={styles.row}>
              {/* Botón de reproducir con anillo de cuenta atrás */}
              <Focusable
                onPress={onPlayNext}
                hasTVPreferredFocus={IS_TV}
                style={styles.playWrap}
                ring={false}
                focusStyle={styles.playWrapFocused}
                focusScale={1.06}
              >
                {counting && (
                  <Svg width={80} height={80} style={styles.ring}>
                    <Circle cx="40" cy="40" r={RING_R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
                    <Circle
                      cx="40" cy="40" r={RING_R} fill="none" stroke="#E35336" strokeWidth="4"
                      strokeDasharray={RING_C} strokeDashoffset={ringOffset} strokeLinecap="round"
                      // -90º para que el anillo empiece arriba, no a la derecha.
                      transform="rotate(-90 40 40)"
                    />
                  </Svg>
                )}
                <View style={styles.playBtn}>
                  <PlayFilledIcon size={26} color="#000" />
                </View>
              </Focusable>

              <View style={styles.actions}>
                <Text style={styles.countdown}>
                  {counting ? `Reproduciendo en ${remaining}s` : 'Reproducción automática pausada'}
                </Text>
                <View style={styles.btnRow}>
                  {counting && (
                    <Focusable onPress={() => setCancelled(true)} style={styles.chip} ring={false} focusStyle={styles.chipFocused}>
                      <XIcon size={15} color="#fff" />
                      <Text style={styles.chipTxt}>Cancelar</Text>
                    </Focusable>
                  )}
                  <Focusable onPress={onReplay} style={styles.chip} ring={false} focusStyle={styles.chipFocused}>
                    <RotateCcwIcon size={16} color="#fff" strokeWidth={2} />
                    <Text style={styles.chipTxt}>Ver de nuevo</Text>
                  </Focusable>
                  <Focusable onPress={onBack} style={styles.chip} ring={false} focusStyle={styles.chipFocused}>
                    <ChevronLeftIcon size={16} color="#fff" strokeWidth={2} />
                    <Text style={styles.chipTxt}>Volver</Text>
                  </Focusable>
                </View>
              </View>
            </View>
          </>
        ) : (
          // Sin "siguiente": solo repetir o volver.
          <>
            <Text style={styles.title}>Has terminado</Text>
            <View style={[styles.btnRow, { marginTop: 20 }]}>
              <Focusable onPress={onReplay} hasTVPreferredFocus={IS_TV} style={styles.chip} ring={false} focusStyle={styles.chipFocused}>
                <RotateCcwIcon size={16} color="#fff" strokeWidth={2} />
                <Text style={styles.chipTxt}>Ver de nuevo</Text>
              </Focusable>
              <Focusable onPress={onBack} style={styles.chip} ring={false} focusStyle={styles.chipFocused}>
                <ChevronLeftIcon size={16} color="#fff" strokeWidth={2} />
                <Text style={styles.chipTxt}>Volver</Text>
              </Focusable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 50, elevation: 50 },
  backdrop: { ...StyleSheet.absoluteFillObject, opacity: 0.35 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: IS_TV ? 56 : 24, maxWidth: 720 },

  kicker: { color: '#E35336', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#fff', fontSize: IS_TV ? 36 : 28, fontWeight: '800', marginTop: 6 },
  meta: { color: '#bbb', fontSize: 13, marginTop: 6 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 22 },
  playWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', borderRadius: 40 },
  playWrapFocused: { backgroundColor: 'rgba(227,83,54,0.3)' },
  ring: { position: 'absolute', top: 0, left: 0 },
  playBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },

  actions: { flex: 1 },
  countdown: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6,
    borderWidth: 2, borderColor: 'transparent',
  },
  chipFocused: { backgroundColor: '#E35336', borderColor: '#fff' },
  chipTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
