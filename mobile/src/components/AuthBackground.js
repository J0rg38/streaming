// ----------------------------------------------------------------------------
//  AuthBackground — fondo cinematográfico con resplandores terracota (SVG).
//  Replica el look del login web sin depender de expo-blur/linear-gradient.
// ----------------------------------------------------------------------------
import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

export default function AuthBackground() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <RadialGradient id="glowA" cx="18%" cy="12%" r="60%">
          <Stop offset="0" stopColor="#E35336" stopOpacity="0.38" />
          <Stop offset="1" stopColor="#E35336" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="glowB" cx="88%" cy="92%" r="60%">
          <Stop offset="0" stopColor="#E35336" stopOpacity="0.28" />
          <Stop offset="1" stopColor="#E35336" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="#0d0d0f" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowA)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowB)" />
    </Svg>
  );
}
