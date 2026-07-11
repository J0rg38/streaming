// ----------------------------------------------------------------------------
//  PlayerIcons — iconos SVG del reproductor (mismos trazos que lucide en la web).
// ----------------------------------------------------------------------------
import Svg, { Polygon, Rect, Polyline, Path } from 'react-native-svg';

export function PlayIcon({ size = 44, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="6 3 20 12 6 21 6 3" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ size = 44, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="6" y="4" width="4" height="16" rx="1" fill={color} />
      <Rect x="14" y="4" width="4" height="16" rx="1" fill={color} />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 32, color = '#fff', strokeWidth = 2.5 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline
        points="15 18 9 12 15 6"
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// Flecha circular antihoraria (retroceder) — lucide RotateCcw.
export function RotateCcwIcon({ size = 40, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="1 4 1 10 7 10" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Flecha circular horaria (adelantar) — lucide RotateCw.
export function RotateCwIcon({ size = 40, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="23 4 23 10 17 10" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Expandir (lucide maximize) — rellenar pantalla.
export function MaximizeIcon({ size = 24, color = '#fff', strokeWidth = 2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 3H5a2 2 0 0 0-2 2v3" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 8V5a2 2 0 0 0-2-2h-3" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 16v3a2 2 0 0 0 2 2h3" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 21h3a2 2 0 0 0 2-2v-3" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Ajustar (lucide minimize) — encajar el video completo.
export function MinimizeIcon({ size = 24, color = '#fff', strokeWidth = 2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 3v3a2 2 0 0 1-2 2H3" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 8h-3a2 2 0 0 1-2-2V3" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 16h3a2 2 0 0 1 2 2v3" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 21v-3a2 2 0 0 1 2-2h3" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
