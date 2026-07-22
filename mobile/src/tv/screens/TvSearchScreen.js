// ----------------------------------------------------------------------------
//  TvSearchScreen — buscador en formato TV.
//
//  Decisiones de diseño:
//    - Resultados en REJILLA, no en carrusel horizontal. Al buscar quieres ver
//      muchos títulos de golpe; una fila que se desplaza obliga a recorrerla a
//      ciegas con el D-pad.
//    - El campo de texto es lo primero enfocado: al entrar, pulsar OK abre el
//      teclado del televisor y ya puedes escribir.
//    - Búsqueda con retardo (debounce): en TV se escribe letra a letra con el
//      mando y lanzar una petición por pulsación satura el servidor y parpadea.
//    - Respeta la sección: si vienes del catálogo +18 busca en el catálogo +18
//      (el backend exige acceso concedido para ese flag).
// ----------------------------------------------------------------------------
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, Image, ActivityIndicator, StyleSheet,
  TVFocusGuideView,
} from 'react-native';
import { searchMedia, imageSource } from '../../api';
import TvFrame from '../components/TvFrame';
import TvFocusable from '../components/TvFocusable';
import { SearchIcon } from '../components/TvIcons';
import { colors, spacing, type, overscan, layout, poster as posterTokens } from '../theme';

const DEBOUNCE = 450;
const COLUMNS = 5;

export default function TvSearchScreen({ route, navigation }) {
  const adult = route.params?.adult === true;
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [hasTitleMatch, setHasTitleMatch] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (!term) { setResults([]); setSearched(false); return; }

    setLoading(true);
    timer.current = setTimeout(() => {
      searchMedia(term, adult)
        .then((r) => {
          setResults(r.results || []);
          setHasTitleMatch(r.hasTitleMatch !== false);
          setSearched(true);
        })
        .catch(console.warn)
        .finally(() => setLoading(false));
    }, DEBOUNCE);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, adult]);

  const openTitle = useCallback(
    (m) => navigation.navigate('TvDetail', { id: m.id, adult }),
    [navigation, adult]
  );

  const renderCard = useCallback(
    ({ item, index }) => (
      <TvFocusable onPress={() => openTitle(item)} style={styles.card}>
        {({ focused }) => (
          <>
            <View style={[styles.posterWrap, focused && styles.posterWrapFocused]}>
              <Image source={imageSource(item.poster_url)} style={styles.poster} />
            </View>
            <Text numberOfLines={1} style={[styles.cardTitle, focused && styles.cardTitleFocused]}>
              {item.title}
            </Text>
            <Text numberOfLines={1} style={styles.cardMeta}>
              {[item.release_year, item.type === 'series' ? 'Serie' : 'Película']
                .filter(Boolean).join(' · ')}
            </Text>
          </>
        )}
      </TvFocusable>
    ),
    [openTitle]
  );

  return (
    <TvFrame navigation={navigation} activeKey="search" adult={adult}>
      {({ contentRef }) => (
        <View style={styles.root}>
          {/* SIN autoFocus en este guía: envuelve al campo Y a la rejilla, así que
              cada vez que llegaban resultados sus hijos cambiaban, el guía volvía a
              reclamar el foco y se lo robaba al teclado en pantalla. Ese era el
              bug de "escribo una letra y el teclado se desactiva". El foco inicial
              lo da hasTVPreferredFocus del campo, y la rejilla tiene su propio
              guía más abajo. */}
          <TVFocusGuideView ref={contentRef} trapFocusUp style={{ flex: 1 }}>
            {/* --- Campo de búsqueda --- */}
            <View style={styles.searchRow}>
              {/* En TV el foco lo recibe el envoltorio, no el TextInput: pulsar
                  OK es lo que le da el foco al campo y abre el teclado del
                  televisor. Sin este onPress el campo sería inalcanzable con el
                  mando (se vería enfocado pero no se podría escribir). */}
              <TvFocusable
                onPress={() => inputRef.current?.focus()}
                hasTVPreferredFocus
                style={styles.fieldWrap}
                focusStyle={styles.fieldWrapFocused}
                scale={1}
              >
                {({ focused }) => (
                  <View style={styles.field}>
                    <SearchIcon size={22} color={focused ? colors.brand : colors.textFaint} />
                    <TextInput
                      ref={inputRef}
                      value={q}
                      onChangeText={setQ}
                      placeholder={adult ? 'Buscar en +18…' : 'Buscar películas, series, actores…'}
                      placeholderTextColor={colors.textFaint}
                      style={styles.input}
                      returnKeyType="search"
                      autoCorrect={false}
                      // Abre el teclado del televisor nada más entrar: quien va
                      // al buscador va a escribir, y obligarle a pulsar OK antes
                      // es un paso de más con el mando.
                      autoFocus
                    />
                  </View>
                )}
              </TvFocusable>
              {loading && <ActivityIndicator color={colors.brand} style={{ marginLeft: spacing.md }} />}
            </View>

            {/* --- Aviso de resultados aproximados --- */}
            {searched && results.length > 0 && !hasTitleMatch && (
              <Text style={styles.hint}>
                Sin coincidencia exacta — mostrando títulos parecidos
              </Text>
            )}

            {/* --- Resultados ---
                Guía propio con autoFocus: al BAJAR desde el campo el foco entra
                en la primera carátula, y al volver recuerda cuál estaba. Está
                aislado del campo justamente para que repoblarlo no le quite el
                foco al teclado mientras se escribe. */}
            {searched && results.length === 0 && !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Sin resultados para «{q.trim()}»</Text>
                <Text style={styles.emptyText}>Prueba con otro título, un género o el nombre de un actor.</Text>
              </View>
            ) : (
              <TVFocusGuideView autoFocus style={{ flex: 1 }}>
                <FlatList
                  data={results}
                  keyExtractor={(m) => String(m.id)}
                  numColumns={COLUMNS}
                  renderItem={renderCard}
                  showsVerticalScrollIndicator={false}
                  removeClippedSubviews={false}
                  // El teclado del televisor tapa parte de la rejilla; sin esto,
                  // tocar/enfocar un resultado con el teclado abierto lo cerraría
                  // antes de registrar la pulsación.
                  keyboardShouldPersistTaps="always"
                  contentContainerStyle={styles.grid}
                  columnWrapperStyle={{ gap: posterTokens.gap }}
                />
              </TVFocusGuideView>
            )}
          </TVFocusGuideView>
        </View>
      )}
    </TvFrame>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingLeft: layout.contentLeft, paddingRight: overscan.horizontal },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: overscan.vertical + spacing.sm,
    paddingBottom: spacing.md,
  },
  fieldWrap: { flex: 1, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  fieldWrapFocused: { borderColor: colors.brand },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, color: colors.text, fontSize: 17, paddingVertical: 12 },
  hint: { ...type.meta, color: colors.brand, marginBottom: spacing.sm },

  grid: { paddingBottom: overscan.vertical, gap: spacing.lg },
  card: { width: posterTokens.width },
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
  cardTitle: { ...type.cardTitle, marginTop: 6 },
  cardTitleFocused: { color: colors.text, fontWeight: '700' },
  cardMeta: { color: colors.textFaint, fontSize: 11, marginTop: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...type.h1, textAlign: 'center' },
  emptyText: { ...type.body, textAlign: 'center', marginTop: spacing.sm },
});
