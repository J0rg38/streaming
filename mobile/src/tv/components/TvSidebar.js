// ----------------------------------------------------------------------------
//  TvSidebar — navegación lateral izquierda.
//
//  ANCHO FIJO A PROPÓSITO (64 dp, solo iconos). La primera versión se desplegaba
//  a 200 dp al recibir el foco, como hace Google TV, y quedó descartada: al
//  desplegarse tapaba la primera carátula del carrusel y Android, que resuelve
//  el foco por GEOMETRÍA, dejaba de ver esa tarjeta "a la derecha" (la veía
//  "abajo"). Resultado: el foco entraba en el menú y ya no podía salir.
//
//  Se intentó forzar la salida con nextFocusRight apuntando al contenedor de
//  carruseles: no funciona, Android ignora como destino un TVFocusGuideView.
//  La solución fiable es no crear el solapamiento: con la barra siempre a 64 dp
//  y el contenido empezando en 80 dp (theme.layout.contentLeft), IZQUIERDA entra
//  al menú y DERECHA vuelve al catálogo por pura geometría, sin trucos.
//
//  Los iconos van sin etiqueta: a 64 dp no cabe texto legible a 3 metros, y son
//  los cinco iconos convencionales de una app de TV (casa, lupa, descarga, +18,
//  salir). El elemento enfocado se distingue por fondo e color de icono.
// ----------------------------------------------------------------------------
import { View, Text, StyleSheet, TVFocusGuideView } from 'react-native';
import TvFocusable from './TvFocusable';
import { colors, spacing, overscan, sidebar as sidebarTokens } from '../theme';

export default function TvSidebar({ items, activeKey, onSelect, onFocusChange }) {
  return (
    <View style={styles.sidebar}>
      {/* autoFocus: al ENTRAR en la barra el foco cae en el primer elemento
          ("Inicio"), no en el geométricamente más cercano — viniendo de un
          carrusel bajo, lo más cercano era "Salir" y un OK despistado cerraba
          la sesión. A diferencia de hasTVPreferredFocus, esto no roba el foco
          inicial al catálogo cuando se monta la pantalla. */}
      <TVFocusGuideView autoFocus style={styles.items}>
        {items.map((it) => {
          const active = it.key === activeKey;
          return (
            <TvFocusable
              key={it.key}
              onPress={() => onSelect(it)}
              // La pantalla necesita saber si el menú tiene el foco para activar
              // el "puente de foco" que permite volver al catálogo (ver TvHomeScreen).
              onFocus={() => onFocusChange?.(true)}
              onBlur={() => onFocusChange?.(false)}
              style={styles.item}
              focusStyle={styles.itemFocused}
              scale={1.12}
            >
              {({ focused }) =>
                it.icon({
                  size: 24,
                  color: focused ? colors.text : active ? colors.brand : colors.textDim,
                })
              }
            </TvFocusable>
          );
        })}
      </TVFocusGuideView>

      <Text style={styles.brand}>VOD</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: sidebarTokens.collapsed,
    zIndex: 100, elevation: 100,
    backgroundColor: colors.bgSunken,
    paddingTop: overscan.vertical + spacing.lg,
    alignItems: 'center',
  },
  items: { alignItems: 'center', gap: spacing.sm },
  item: {
    width: 44, height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemFocused: { backgroundColor: colors.brand },
  brand: {
    position: 'absolute',
    bottom: overscan.vertical,
    color: colors.brand,
    fontWeight: '800',
    fontSize: 13,
  },
});
