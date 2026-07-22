// ----------------------------------------------------------------------------
//  Icons — iconos SVG genéricos (trazos de lucide) para formularios y descargas.
// ----------------------------------------------------------------------------
import Svg, { Rect, Path, Polyline, Line, Circle } from 'react-native-svg';

const base = (size, color, sw) => ({
  width: size, height: size, viewBox: '0 0 24 24',
  fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round',
});

export function MailIcon({ size = 20, color = '#9ca3af', strokeWidth = 2 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="2" y="4" width="20" height="16" rx="2" />
      <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </Svg>
  );
}

export function LockIcon({ size = 20, color = '#9ca3af', strokeWidth = 2 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="3" y="11" width="18" height="11" rx="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  );
}

export function LogInIcon({ size = 20, color = '#fff', strokeWidth = 2 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <Polyline points="10 17 15 12 10 7" />
      <Line x1="15" y1="12" x2="3" y2="12" />
    </Svg>
  );
}

export function DownloadIcon({ size = 22, color = '#fff', strokeWidth = 2 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Polyline points="7 10 12 15 17 10" />
      <Line x1="12" y1="15" x2="12" y2="3" />
    </Svg>
  );
}

export function CheckIcon({ size = 22, color = '#fff', strokeWidth = 2.4 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

export function TrashIcon({ size = 22, color = '#fff', strokeWidth = 2 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <Line x1="10" y1="11" x2="10" y2="17" />
      <Line x1="14" y1="11" x2="14" y2="17" />
    </Svg>
  );
}

export function XIcon({ size = 22, color = '#fff', strokeWidth = 2 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}

export function DownloadCloudIcon({ size = 22, color = '#fff', strokeWidth = 2 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <Polyline points="8 17 12 21 16 17" />
      <Line x1="12" y1="12" x2="12" y2="21" />
    </Svg>
  );
}

// Lupa y "salir". Viven aquí (y no en tv/TvIcons) porque las usan las dos
// interfaces: la barra lateral de TV y las cabeceras/pie del móvil.
export function SearchIcon({ size = 22, color = '#fff', strokeWidth = 2 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="11" cy="11" r="8" />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Svg>
  );
}

export function LogOutIcon({ size = 22, color = '#fff', strokeWidth = 2 }) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  );
}

export function PlayFilledIcon({ size = 18, color = '#000' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 3 20 12 6 21 6 3Z" fill={color} />
    </Svg>
  );
}
