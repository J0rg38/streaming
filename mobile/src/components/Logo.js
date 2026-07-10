// ----------------------------------------------------------------------------
//  Logo.js — Logo de la app (mismo diseño que la web) con react-native-svg.
// ----------------------------------------------------------------------------
import Svg, { Path } from 'react-native-svg';

export default function Logo({ height = 40 }) {
  const width = (height * 400) / 240;
  return (
    <Svg width={width} height={height} viewBox="0 0 400 240">
      <Path d="M185 48 L346 120 L185 192 Z" fill="#E35336" stroke="#E35336" strokeWidth={34} strokeLinejoin="round" />
      <Path d="M30 146 C96 112 136 112 170 129" fill="none" stroke="#E35336" strokeWidth={22} strokeLinecap="round" />
      <Path d="M50 192 C106 166 141 164 170 176" fill="none" stroke="#E35336" strokeWidth={22} strokeLinecap="round" />
    </Svg>
  );
}
