// ----------------------------------------------------------------------------
//  TvDetailScreen — ficha del título para TV.
//
//  Diferencias frente a la ficha de móvil:
//    - Va dentro de TvFrame, así que conserva la barra lateral: la navegación
//      no desaparece al entrar en un título.
//    - El banner ocupa toda la pantalla de fondo y la información va sobre él
//      (patrón de ficha de Google TV), en vez de imagen arriba y texto debajo.
//    - El botón principal recibe el foco al entrar (hasTVPreferredFocus): el
//      usuario pulsa OK nada más llegar y empieza a ver, que es el gesto más
//      común y no debe costar ni un movimiento del D-pad.
//    - Abajo, carrusel "Más como esto" con títulos afines.
// ----------------------------------------------------------------------------
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, Image, ScrollView, ActivityIndicator, StyleSheet,
  TVFocusGuideView, useWindowDimensions,
} from 'react-native';
import { fetchMedia, fetchSimilar, imageSource } from '../../api';
import TvFrame from '../components/TvFrame';
import TvFocusable from '../components/TvFocusable';
import TvGradient from '../components/TvGradient';
import TvRail from '../components/TvRail';
import { PlayFilledIcon } from '../../components/Icons';
import { colors, spacing, type, overscan, layout } from '../theme';

// Segundos restantes -> "1h 23min" para el botón de continuar.
const fmtRemaining = (secs) => {
  if (!secs || secs < 60) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

export default function TvDetailScreen({ route, navigation }) {
  const { id, adult = false } = route.params;
  const { height } = useWindowDimensions();
  const [media, setMedia] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [season, setSeason] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMedia(id)
      .then((m) => {
        if (cancelled) return;
        setMedia(m);
        if (m.seasons?.length) setSeason(m.seasons[0].season);
      })
      .catch(console.warn);
    // Los afines no bloquean la ficha: si fallan, simplemente no sale el carrusel.
    fetchSimilar(id)
      .then((s) => { if (!cancelled) setSimilar(s || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  const episodes = useMemo(
    () => media?.seasons?.find((s) => s.season === season)?.episodes || [],
    [media, season]
  );

  const playMovie = useCallback(
    () => navigation.navigate('Player', { mediaId: media.id, title: media.title }),
    [navigation, media]
  );

  const playEpisode = useCallback(
    (ep) => navigation.navigate('Player', {
      mediaId: media.id,
      episodeId: ep.id,
      title: `${media.title} · T${ep.season_number}:E${ep.episode_number}`,
    }),
    [navigation, media]
  );

  const openSimilar = useCallback(
    (m) => navigation.push('TvDetail', { id: m.id, adult }),
    [navigation, adult]
  );

  if (!media) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }

  const isMovie = media.type === 'movie';
  const resume = media.progress?.stopped_at > 30 ? media.progress : null;
  const remaining = fmtRemaining(resume?.remaining);

  return (
    <TvFrame navigation={navigation} activeKey={adult ? 'adult' : 'home'} adult={adult}>
      {({ contentRef }) => (
        <>
          <Image
            source={imageSource(media.banner_url || media.poster_url)}
            style={styles.backdrop}
            resizeMode="cover"
          />
          <TvGradient
            id="dV"
            direction="vertical"
            stops={[
              { offset: '0%', color: '#141414', opacity: 0.2 },
              { offset: '55%', color: '#141414', opacity: 0.8 },
              { offset: '100%', color: '#141414', opacity: 1 },
            ]}
          />
          <TvGradient
            id="dH"
            direction="horizontal"
            stops={[
              { offset: '0%', color: '#141414', opacity: 0.96 },
              { offset: '60%', color: '#141414', opacity: 0.25 },
              { offset: '100%', color: '#141414', opacity: 0 },
            ]}
          />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: overscan.vertical }}
          >
            <TVFocusGuideView ref={contentRef} autoFocus trapFocusUp>
              <View style={[styles.info, { minHeight: height * 0.58 }]}>
                <Text style={styles.title} numberOfLines={2}>{media.title}</Text>
                <Text style={styles.meta}>
                  {[
                    media.release_year,
                    isMovie
                      ? 'Película'
                      : `${media.seasons?.length || 0} temporada${media.seasons?.length === 1 ? '' : 's'}`,
                    media.genres?.slice(0, 3).join(' · '),
                  ].filter(Boolean).join('   ·   ')}
                </Text>
                {!!media.actors?.length && (
                  <Text style={styles.cast} numberOfLines={1}>
                    Reparto: {media.actors.slice(0, 4).join(', ')}
                  </Text>
                )}
                {!!media.description && (
                  <Text style={styles.desc} numberOfLines={4}>{media.description}</Text>
                )}

                {isMovie && (
                  <View style={styles.actions}>
                    <TvFocusable
                      onPress={playMovie}
                      hasTVPreferredFocus
                      style={styles.primaryBtn}
                      focusStyle={styles.primaryBtnFocus}
                      scale={1.04}
                    >
                      {({ focused }) => (
                        <View style={styles.btnRow}>
                          <PlayFilledIcon size={16} color={focused ? '#fff' : '#000'} />
                          <Text style={[styles.primaryTxt, focused && styles.primaryTxtFocus]}>
                            {remaining ? `Continuar · quedan ${remaining}` : 'Reproducir'}
                          </Text>
                        </View>
                      )}
                    </TvFocusable>
                  </View>
                )}
              </View>

              {/* --- Series: temporadas + capítulos --- */}
              {!isMovie && (
                <View style={styles.seriesBlock}>
                  <TVFocusGuideView autoFocus style={styles.seasonRow}>
                    {media.seasons?.map((s, i) => (
                      <TvFocusable
                        key={s.season}
                        onPress={() => setSeason(s.season)}
                        hasTVPreferredFocus={i === 0}
                        style={[styles.seasonChip, season === s.season && styles.seasonChipActive]}
                        focusStyle={styles.seasonChipFocus}
                        scale={1.05}
                      >
                        <Text style={season === s.season ? styles.seasonTxtActive : styles.seasonTxt}>
                          Temporada {s.season}
                        </Text>
                      </TvFocusable>
                    ))}
                  </TVFocusGuideView>

                  <TVFocusGuideView autoFocus>
                    {episodes.map((ep) => {
                      const epRemaining = fmtRemaining(ep.progress?.remaining);
                      return (
                        <TvFocusable
                          key={ep.id}
                          onPress={() => playEpisode(ep)}
                          style={styles.epRow}
                          focusStyle={styles.epRowFocus}
                          scale={1.01}
                        >
                          <View style={styles.epInner}>
                            <Text style={styles.epNum}>{ep.episode_number}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.epTitle} numberOfLines={1}>
                                {ep.title || `Capítulo ${ep.episode_number}`}
                              </Text>
                              {!!epRemaining && <Text style={styles.epMeta}>Quedan {epRemaining}</Text>}
                            </View>
                            <PlayFilledIcon size={14} color={colors.brand} />
                          </View>
                          {ep.progress?.percent > 0 && (
                            <View style={styles.epTrack}>
                              <View style={[styles.epFill, { width: `${Math.min(100, ep.progress.percent)}%` }]} />
                            </View>
                          )}
                        </TvFocusable>
                      );
                    })}
                  </TVFocusGuideView>
                </View>
              )}

              {/* --- Títulos afines --- */}
              <TvRail
                title="Más como esto"
                items={similar}
                onPress={openSimilar}
                railIndex={1}
              />
            </TVFocusGuideView>
          </ScrollView>
        </>
      )}
    </TvFrame>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: '75%' },
  info: {
    justifyContent: 'flex-end',
    paddingLeft: layout.contentLeft,
    paddingRight: '40%',
    paddingBottom: spacing.md,
  },
  title: { ...type.hero },
  meta: { ...type.meta, marginTop: spacing.sm },
  cast: { ...type.meta, marginTop: 2, color: colors.textFaint },
  desc: { ...type.body, marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  primaryBtn: { backgroundColor: '#fff', paddingHorizontal: 22, paddingVertical: 11, borderRadius: 8 },
  primaryBtnFocus: { backgroundColor: colors.brand },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  primaryTxt: { ...type.button, color: '#000' },
  primaryTxtFocus: { color: '#fff' },

  seriesBlock: { paddingLeft: layout.contentLeft, paddingRight: overscan.horizontal, marginBottom: spacing.lg },
  seasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  seasonChip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.bgElevated, borderRadius: 20 },
  seasonChipActive: { backgroundColor: colors.brandDark },
  seasonChipFocus: { backgroundColor: colors.brand },
  seasonTxt: { color: colors.textDim, fontSize: 13 },
  seasonTxtActive: { color: '#fff', fontSize: 13, fontWeight: '700' },

  epRow: { backgroundColor: colors.bgElevated, marginBottom: spacing.sm, overflow: 'hidden', borderRadius: 8 },
  epRowFocus: { backgroundColor: '#2e2e2e' },
  epInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 12 },
  epNum: { color: colors.textFaint, fontSize: 16, fontWeight: '800', width: 28 },
  epTitle: { color: colors.text, fontSize: 14 },
  epMeta: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  epTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  epFill: { height: 3, backgroundColor: colors.brand },
});
