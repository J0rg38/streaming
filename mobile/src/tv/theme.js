// ----------------------------------------------------------------------------
//  theme.js — Tokens de diseño para la interfaz de TV ("10-foot UI").
//
//  OJO con las unidades: un televisor 1080p con densidad xhdpi (320) le reporta
//  a Android un lienzo de 960 x 540 dp, no 1920 x 1080. Todo lo de aquí está en
//  dp pensando en esos 960x540; por eso las cifras parecen pequeñas comparadas
//  con las de un móvil, pero en pantalla se ven grandes.
//
//  Reglas que seguimos (guía de Android TV):
//   - Overscan: los bordes del panel pueden recortarse. Dejamos margen seguro.
//   - Texto mínimo legible a 3 metros: 12sp es el suelo absoluto; el cuerpo va a 14+.
//   - Todo elemento accionable DEBE mostrar el foco de forma inequívoca.
// ----------------------------------------------------------------------------

export const colors = {
  bg: '#141414',
  bgElevated: '#1f1f1f',
  bgSunken: '#0d0d0d',
  brand: '#E35336',
  brandDark: '#C13D24',
  text: '#ffffff',
  textDim: '#b3b3b3',
  textFaint: '#7a7a7a',
  focusRing: '#ffffff',
  success: '#4ade80',
  scrim: 'rgba(0,0,0,0.75)',
};

// Margen de seguridad frente al overscan (5% del alto/ancho, según la guía).
// En 960x540 dp eso es ~48 dp horizontal y ~27 dp vertical.
export const overscan = {
  horizontal: 48,
  vertical: 27,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
};

// Barra lateral: colapsada solo muestra iconos, expandida añade las etiquetas.
export const sidebar = {
  collapsed: 64,
  expanded: 200,
};

// Sangrado izquierdo del CONTENIDO. Tiene que dejar libre la barra lateral
// colapsada, que va superpuesta: si el contenido empieza en el margen de
// overscan (48) la barra (64) se le come el primer póster de cada carrusel.
export const layout = {
  contentLeft: sidebar.collapsed + spacing.md,
  // Proporción de alto que ocupa el bloque hero. Calculada para que el primer
  // carrusel entre ENTERO (con su título) en los 540 dp de alto del televisor:
  //   hero 243 + carrusel ~252 = 495  ->  quedan ~45 dp asomando la fila siguiente,
  //   que además insinúa que hay más contenido abajo.
  heroRatio: 0.45,
};

export const type = {
  hero: { fontSize: 40, fontWeight: '800', color: colors.text },
  h1: { fontSize: 28, fontWeight: '800', color: colors.text },
  railTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.textDim, lineHeight: 22 },
  meta: { fontSize: 13, color: colors.textDim },
  button: { fontSize: 15, fontWeight: '700' },
  cardTitle: { fontSize: 13, color: colors.textDim },
};

// Tamaños de tarjeta. El póster es 2:3 (proporción de cartel de cine).
// 116x174 deja ~7 carátulas visibles en los 960 dp de ancho y permite que el
// carrusel completo quepa bajo el hero sin recortar los títulos.
export const poster = {
  width: 116,
  height: 174,
  gap: 16,
};

// Tarjeta apaisada 16:9 para "continuar viendo" y capítulos.
export const backdrop = {
  width: 232,
  height: 130,
  gap: 16,
};

// El foco escala la tarjeta. 1.08 se nota sin invadir a las vecinas.
export const focus = {
  scale: 1.08,
  ringWidth: 3,
  duration: 150,
};
