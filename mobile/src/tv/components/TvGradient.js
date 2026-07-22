// ----------------------------------------------------------------------------
//  TvGradient — degradado con react-native-svg.
//
//  Por qué SVG y no expo-linear-gradient: react-native-svg YA está en el
//  proyecto (lo usa el logo), así que no añade un módulo nativo nuevo ni obliga
//  a recompilar el APK. El degradado es lo que hace legible el texto del hero
//  sobre el banner sin oscurecer la imagen entera.
// ----------------------------------------------------------------------------
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { StyleSheet } from 'react-native';

export default function TvGradient({
  direction = 'vertical',   // 'vertical' | 'horizontal'
  stops = [
    { offset: '0%', color: '#141414', opacity: 0 },
    { offset: '100%', color: '#141414', opacity: 1 },
  ],
  style,
  id = 'g',
}) {
  const coords = direction === 'horizontal'
    ? { x1: '0', y1: '0', x2: '1', y2: '0' }
    : { x1: '0', y1: '0', x2: '0', y2: '1' };

  return (
    <Svg style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} {...coords}>
          {stops.map((s, i) => (
            <Stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
