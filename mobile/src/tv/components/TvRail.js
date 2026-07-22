// ----------------------------------------------------------------------------
//  TvRail — carrusel horizontal de tarjetas para TV.
//
//  Claves de la navegación:
//   - <TVFocusGuideView autoFocus>: al volver a esta fila con el D-pad, el foco
//     regresa a la ÚLTIMA tarjeta enfocada, no a la primera. Sin esto, bajar y
//     subir te devuelve al principio y la navegación se siente rota.
//   - El padding del contenido deja sitio al zoom del foco; si no, la tarjeta
//     enfocada se ve recortada por el borde de la lista.
//   - Sin scrollbars ni bounce: en TV no hay dedo, el scroll lo hace el motor de
//     foco nativo al desplazar la selección.
//
//  Claves del resalte (esto se hizo mal la primera vez):
//   - El borde vive SOBRE la carátula, no alrededor de tarjeta+título.
//   - El borde existe SIEMPRE (transparente cuando no hay foco) para que activarlo
//     no cambie la caja de contenido: cero salto de layout.
//   - El zoom lo aplica TvFocusable al elemento entero, así borde e imagen crecen
//     juntos y el recuadro siempre queda pegado a la carátula.
// ----------------------------------------------------------------------------
import { memo } from 'react';
import { View, Text, FlatList, Image, StyleSheet, TVFocusGuideView } from 'react-native';
import { imageSource } from '../../api';
import { useDownloads } from '../../downloadsContext';
import { DownloadCloudIcon } from '../../components/Icons';
import TvFocusable from './TvFocusable';
import { colors, poster as posterTokens, spacing, type, overscan, layout } from '../theme';

// --- Tarjeta de póster (2:3) ------------------------------------------------
export const TvPosterCard = memo(function TvPosterCard({ item, onPress, onFocus, hasTVPreferredFocus }) {
  const { ids } = useDownloads();
  const downloaded = ids.has(item.id);
  const pct = item.progress?.percent ?? null;

  return (
    <TvFocusable
      onPress={() => onPress(item)}
      onFocus={() => onFocus?.(item)}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={styles.card}
    >
      {({ focused }) => (
        <>
          <View style={[styles.posterWrap, focused && styles.posterWrapFocused]}>
            <Image source={imageSource(item.poster_url)} style={styles.poster} />
            {/* Progreso: en TV una barra se lee de un vistazo mejor que un texto. */}
            {pct != null && pct > 0 && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, pct)}%` }]} />
              </View>
            )}
          </View>
          <View style={styles.titleRow}>
            {downloaded && <DownloadCloudIcon size={11} color={colors.success} />}
            <Text numberOfLines={1} style={[styles.cardTitle, focused && styles.cardTitleFocused]}>
              {item.title}
            </Text>
          </View>
        </>
      )}
    </TvFocusable>
  );
});

export default function TvRail({ title, items, onPress, onFocusItem, railIndex = 0 }) {
  if (!items?.length) return null;
  const firstRail = railIndex === 0;

  return (
    <View style={styles.rail}>
      <Text style={styles.railTitle}>{title}</Text>
      {/* Sin trapFocusLeft ni trapFocusRight: los traps bloquean el cruce de la
          frontera en esa dirección TAMBIÉN AL ENTRAR, no solo al salir. Con
          trapFocusLeft la barra lateral era inalcanzable, y con trapFocusRight
          no se podía volver de la barra al catálogo: el foco quedaba encerrado
          en el menú. autoFocus sí se queda: es lo que hace que al regresar a
          esta fila el foco vuelva a la última tarjeta activa. */}
      <TVFocusGuideView autoFocus>
        <FlatList
          horizontal
          data={items}
          keyExtractor={(m) => String(m.id)}
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.listContent}
          // El motor de foco nativo necesita que las vistas existan para poder
          // moverse a ellas; reciclarlas fuera de pantalla le hace perder el foco.
          removeClippedSubviews={false}
          renderItem={({ item, index }) => (
            <TvPosterCard
              item={item}
              onPress={onPress}
              // La pantalla necesita saber DE QUÉ FILA viene el foco: al entrar
              // en la primera hay que devolver el scroll arriba para que el hero
              // vuelva a verse (el motor de foco nativo no lo hace solo).
              onFocus={(m) => onFocusItem?.(m, railIndex)}
              hasTVPreferredFocus={firstRail && index === 0}
            />
          )}
        />
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { marginBottom: spacing.md },
  railTitle: { ...type.railTitle, marginLeft: layout.contentLeft, marginBottom: 2 },
  listContent: {
    // El sangrado izquierdo esquiva la barra lateral superpuesta; el derecho es
    // el margen de overscan. El vertical deja aire para el zoom del foco.
    paddingLeft: layout.contentLeft,
    paddingRight: overscan.horizontal,
    paddingVertical: spacing.md,
  },
  card: { width: posterTokens.width, marginRight: posterTokens.gap },

  posterWrap: {
    width: posterTokens.width,
    height: posterTokens.height,
    borderRadius: 10,
    // Borde SIEMPRE presente (transparente sin foco) => activarlo no descuadra nada.
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
  },
  posterWrapFocused: { borderColor: colors.focusRing },
  poster: { width: '100%', height: '100%' },

  progressTrack: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressFill: { height: 3, backgroundColor: colors.brand },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  cardTitle: { ...type.cardTitle, flexShrink: 1 },
  cardTitleFocused: { color: colors.text, fontWeight: '700' },
});
