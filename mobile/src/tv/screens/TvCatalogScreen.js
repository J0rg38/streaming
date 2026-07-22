// ----------------------------------------------------------------------------
//  TvCatalogScreen — catálogo en formato "10-foot UI".
//
//  UNA sola pantalla para el catálogo normal y el de adultos (prop `adult`).
//  Antes el +18 reutilizaba la pantalla de móvil y por eso no heredaba ninguna
//  mejora de TV; compartiendo componente, cualquier arreglo vale para ambos.
//
//  Estructura visual (patrón Netflix/Google TV):
//    - Fondo = banner del título ENFOCADO. Cambia al mover el D-pad, lo que da
//      la sensación de que la tele responde a la navegación.
//    - Degradados vertical y horizontal para que el texto sea legible sobre
//      cualquier imagen sin oscurecer el banner entero.
//    - Bloque de información del título enfocado y, debajo, los carruseles.
//
//  Nota de rendimiento: el aparato de pruebas (onn. 4K Streaming Box) tiene
//  ~2 GB de RAM y CPU modesta. El fondo se actualiza con retardo (debounce): sin
//  él, mover rápido el D-pad dispara una descarga de imagen por cada tarjeta que
//  se atraviesa y la navegación se atasca.
// ----------------------------------------------------------------------------
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, Animated, ActivityIndicator, StyleSheet, useWindowDimensions,
  TVFocusGuideView,
} from 'react-native';
import { fetchCatalog, fetchAdultCatalog, imageSource } from '../../api';
import TvFrame from '../components/TvFrame';
import TvRail from '../components/TvRail';
import TvGradient from '../components/TvGradient';
import { colors, spacing, type, overscan, layout } from '../theme';

// Retardo antes de cambiar el fondo (ms). Suficiente para no disparar cargas
// mientras el usuario "atraviesa" tarjetas, imperceptible al detenerse.
const HERO_DEBOUNCE = 220;

export default function TvCatalogScreen({ navigation, adult = false }) {
  const { height } = useWindowDimensions();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hero, setHero] = useState(null);

  const heroTimer = useRef(null);
  const scrollRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const load = useCallback(() => {
    (adult ? fetchAdultCatalog() : fetchCatalog())
      .then((d) => {
        setData(d);
        const first =
          d.continueWatching?.[0] || d.featured?.[0] || d.recentlyAdded?.[0] ||
          d.discovery?.[0]?.items?.[0] || d.rails?.[0]?.items?.[0];
        if (first) setHero(first);
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [adult]);

  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  // Cambio de hero con debounce. Además, al volver a la PRIMERA fila devolvemos
  // el scroll arriba: el motor de foco de Android solo desplaza lo justo para
  // que la tarjeta enfocada sea visible, así que sin esto el hero se quedaría
  // fuera de pantalla para siempre en cuanto bajas una vez.
  const onFocusItem = useCallback((item, railIndex) => {
    if (railIndex === 0) scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (heroTimer.current) clearTimeout(heroTimer.current);
    heroTimer.current = setTimeout(() => setHero(item), HERO_DEBOUNCE);
  }, []);

  useEffect(() => () => { if (heroTimer.current) clearTimeout(heroTimer.current); }, []);

  const openTitle = useCallback(
    (m) => navigation.navigate('TvDetail', { id: m.id, adult }),
    [navigation, adult]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  const sections = [
    { key: 'cw', title: 'Continuar viendo', items: data?.continueWatching },
    { key: 'fe', title: 'Estelares', items: data?.featured },
    { key: 'ra', title: 'Recién añadidos', items: data?.recentlyAdded },
    // Rails de descubrimiento por actriz/etiqueta: solo existen en el catálogo +18.
    ...(data?.discovery || []).map((r, i) => ({ key: `d-${i}`, title: r.title, items: r.items })),
    ...(data?.rails || []).map((r) => ({ key: `g-${r.genre}`, title: r.genre, items: r.items })),
    { key: 'cs', title: 'Próximamente', items: data?.comingSoon },
  ].filter((s) => s.items?.length);

  // Altura del hero calculada (ver theme.layout) para que el PRIMER carrusel
  // entre entero, títulos incluidos, sin recortarse abajo.
  const heroHeight = Math.round(height * layout.heroRatio);

  const empty = sections.length === 0;

  return (
    <TvFrame navigation={navigation} activeKey={adult ? 'adult' : 'home'} adult={adult}>
      {({ contentRef }) => (
        <>
          {/* --- Fondo: banner del título enfocado ---
              Se desvanece al bajar: cuando el hero ya no se ve, el banner solo
              ensucia el fondo de los carruseles y resta legibilidad. */}
          {hero && (
            <Animated.Image
              source={imageSource(hero.banner_url || hero.poster_url)}
              style={[
                styles.backdrop,
                {
                  opacity: scrollY.interpolate({
                    inputRange: [0, heroHeight * 0.75],
                    outputRange: [1, 0.12],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
              resizeMode="cover"
              fadeDuration={220}
            />
          )}
          <TvGradient
            id="heroV"
            direction="vertical"
            stops={[
              { offset: '0%', color: '#141414', opacity: 0.15 },
              { offset: '45%', color: '#141414', opacity: 0.65 },
              { offset: '75%', color: '#141414', opacity: 1 },
            ]}
          />
          <TvGradient
            id="heroH"
            direction="horizontal"
            stops={[
              { offset: '0%', color: '#141414', opacity: 0.95 },
              { offset: '55%', color: '#141414', opacity: 0.2 },
              { offset: '100%', color: '#141414', opacity: 0 },
            ]}
          />

          {empty ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Aún no hay contenido aquí</Text>
              <Text style={styles.emptyText}>
                {adult
                  ? 'Cuando se añadan títulos a la sección +18 aparecerán en esta pantalla.'
                  : 'Sube contenido desde el panel de administración de la web.'}
              </Text>
            </View>
          ) : (
            <Animated.ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: overscan.vertical }}
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true }  // solo animamos opacidad: va en el hilo de UI
              )}
            >
              {/* --- Información del título enfocado --- */}
              <View style={[styles.heroInfo, { height: heroHeight }]}>
                {adult && <Text style={styles.adultBadge}>+18</Text>}
                <Text style={styles.heroTitle} numberOfLines={2}>{hero?.title}</Text>
                <Text style={styles.heroMeta}>
                  {[
                    hero?.release_year,
                    hero?.type === 'series' ? 'Serie' : 'Película',
                    hero?.genres?.slice(0, 3).join(' · '),
                  ].filter(Boolean).join('   ·   ')}
                </Text>
                {!!hero?.description && (
                  <Text style={styles.heroDesc} numberOfLines={3}>{hero.description}</Text>
                )}
                {hero?.progress?.percent > 0 && (
                  <Text style={styles.heroResume}>Continuar · {hero.progress.percent}% visto</Text>
                )}
              </View>

              {/* trapFocusUp: sin esto, pulsar ARRIBA en el primer carrusel salta
                  a la barra lateral, que está a la IZQUIERDA. La barra se alcanza
                  con IZQUIERDA; arriba del todo no hay nada que enfocar. */}
              <TVFocusGuideView ref={contentRef} autoFocus trapFocusUp>
                {sections.map((s, i) => (
                  <TvRail
                    key={s.key}
                    title={s.title}
                    items={s.items}
                    onPress={openTitle}
                    onFocusItem={onFocusItem}
                    railIndex={i}
                  />
                ))}
              </TVFocusGuideView>
            </Animated.ScrollView>
          )}
        </>
      )}
    </TvFrame>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingLeft: layout.contentLeft },
  backdrop: { position: 'absolute', top: 0, right: 0, left: 0, height: '68%' },
  heroInfo: {
    justifyContent: 'flex-end',
    paddingLeft: layout.contentLeft,  // esquiva la barra lateral superpuesta
    paddingRight: '38%',
    paddingBottom: spacing.md,
  },
  adultBadge: {
    color: colors.brand, fontWeight: '800', fontSize: 13,
    letterSpacing: 1, marginBottom: spacing.xs,
  },
  heroTitle: { ...type.hero },
  heroMeta: { ...type.meta, marginTop: spacing.sm },
  heroDesc: { ...type.body, marginTop: spacing.sm },
  heroResume: { color: colors.brand, fontWeight: '700', fontSize: 13, marginTop: spacing.sm },
  emptyTitle: { ...type.h1, textAlign: 'center' },
  emptyText: { ...type.body, textAlign: 'center', marginTop: spacing.sm, maxWidth: 460 },
});
