// ----------------------------------------------------------------------------
//  TvIcons — iconos que faltaban para la barra lateral de TV.
//  Mismo trazo (lucide) y misma firma que src/components/Icons.js.
// ----------------------------------------------------------------------------
import Svg, { Path, Polyline, Circle, Line } from 'react-native-svg';

const base = (size, color, sw) => ({
  width: size, height: size, viewBox: '0 0 24 24',
  fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round',
});

export function HomeIcon({ size = 22, color = '#fff', strokeWidth = 2 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9 22 9 12 15 12 15 22" />
    </Svg>
  );
}

// La lupa y el icono de salir los comparten móvil y TV, así que viven en
// components/Icons.js; se reexportan aquí para que las pantallas de TV sigan
// importando todos sus iconos de un solo sitio.
export { SearchIcon, LogOutIcon } from '../../components/Icons';


export function AdultIcon({ size = 22, color = '#fff', strokeWidth = 2 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M8 15h3.2a1.8 1.8 0 0 0 0-3.6H8V8h4" />
      <Line x1="15.5" y1="8" x2="15.5" y2="16" />
    </Svg>
  );
}
