// ----------------------------------------------------------------------------
//  TvFrame — marco común de TODAS las pantallas de televisor.
//
//  Aporta dos cosas que deben comportarse igual en catálogo, ficha y buscador:
//    1. La barra lateral de navegación, siempre visible.
//    2. El "puente de foco" que permite volver de la barra al contenido.
//
//  Existe para no repetir esa lógica en cada pantalla: cuando el catálogo de
//  adultos y la ficha reutilizaban pantallas de móvil, se quedaban sin barra y
//  sin arreglos de foco. Ahora una pantalla nueva solo tiene que envolverse aquí.
//
//  Uso (render-prop): el hijo recibe `contentRef`, que DEBE colocarse en un
//  <TVFocusGuideView autoFocus> que envuelva todo lo enfocable de la pantalla.
//  Ese nodo es el destino al que el puente devuelve el foco.
//
//      <TvFrame navigation={navigation} activeKey="home">
//        {({ contentRef }) => (
//          <TVFocusGuideView ref={contentRef} autoFocus> ... </TVFocusGuideView>
//        )}
//      </TvFrame>
// ----------------------------------------------------------------------------
import { useState, useCallback } from 'react';
import { View, StyleSheet, TVFocusGuideView } from 'react-native';
import { useAuth } from '../../auth';
import TvSidebar from './TvSidebar';
import { HomeIcon, SearchIcon, LogOutIcon, AdultIcon } from './TvIcons';
import { DownloadIcon } from '../../components/Icons';
import { colors, sidebar } from '../theme';

export default function TvFrame({ navigation, activeKey, adult = false, children }) {
  const { user, signOut } = useAuth();

  // --- Puente de foco (explicación completa en TvSidebar) --------------------
  //  Android resuelve el foco por HAZ direccional: al pulsar DERECHA solo mira
  //  candidatos que solapen verticalmente con el elemento actual. Los iconos del
  //  menú están arriba y las tarjetas abajo, así que no solapan y el foco se
  //  quedaba encerrado en el menú. Este guía ocupa todo el alto pegado a la
  //  barra: siempre solapa, siempre es candidato, y redirige al contenido.
  //
  //  Solo se activa mientras la barra tiene el foco. Activo en todo momento
  //  interceptaría también el camino de ida (IZQUIERDA desde una tarjeta) y la
  //  barra se volvería inalcanzable.
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const [contentNode, setContentNode] = useState(null);

  const go = useCallback(
    (screen, params) => () => navigation.navigate(screen, params),
    [navigation]
  );

  const navItems = [
    {
      key: 'home',
      label: 'Inicio',
      icon: (p) => <HomeIcon {...p} />,
      action: go('TvHome'),
    },
    {
      key: 'search',
      label: 'Buscar',
      icon: (p) => <SearchIcon {...p} />,
      // El buscador +18 es otro catálogo: se lo indicamos por parámetro para
      // que no mezcle resultados con el catálogo normal.
      action: go('TvSearch', { adult }),
    },
    {
      key: 'downloads',
      label: 'Descargas',
      icon: (p) => <DownloadIcon {...p} />,
      action: go('Downloads'),
    },
    ...(user?.adult
      ? [{
          key: 'adult',
          label: 'Adultos',
          icon: (p) => <AdultIcon {...p} />,
          action: go('TvAdult'),
        }]
      : []),
    {
      key: 'logout',
      label: 'Salir',
      icon: (p) => <LogOutIcon {...p} />,
      action: signOut,
    },
  ];

  return (
    <View style={[styles.root, adult && styles.rootAdult]}>
      {children({ contentRef: setContentNode })}

      <TvSidebar
        items={navItems}
        activeKey={activeKey}
        onSelect={(it) => it.action?.()}
        onFocusChange={setSidebarFocused}
      />

      <TVFocusGuideView
        style={styles.focusBridge}
        focusable={sidebarFocused && !!contentNode}
        destinations={contentNode ? [contentNode] : []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  // La sección +18 usa un fondo más oscuro para que se note de un vistazo en
  // qué catálogo estás, igual que hace la web.
  rootAdult: { backgroundColor: '#0B0B0B' },
  focusBridge: {
    position: 'absolute',
    left: sidebar.collapsed,
    top: 0, bottom: 0,
    width: 6,
    zIndex: 90,
  },
});
