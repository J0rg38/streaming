// ----------------------------------------------------------------------------
//  TvFocusable — envoltorio de foco para TV.
//
//  REGLA DE ORO (aprendida a base de romperla): la escala debe aplicarse al
//  MISMO elemento que dibuja el resalte. Si el borde vive en un contenedor que
//  no escala y el contenido crece dentro, se ve un recuadro fijo con la imagen
//  desbordándolo. Por eso aquí animamos el Pressable entero y NO pintamos ningún
//  borde propio: el resalte lo decide cada tarjeta sobre su propia carátula.
//
//  Tampoco declaramos ancho ni borderWidth por defecto: cualquier borde sobre un
//  contenedor de ancho fijo reduce la caja de contenido y descuadra a los hijos.
//
//  Uso con render-prop para saber si está enfocado:
//      <TvFocusable>{({ focused }) => <Poster highlighted={focused} />}</TvFocusable>
// ----------------------------------------------------------------------------
import { forwardRef, useCallback, useRef, useState } from 'react';
import { Animated, Pressable } from 'react-native';
import { focus as focusTokens } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TvFocusable = forwardRef(function TvFocusable(
  {
    children,
    onPress,
    onFocus,
    onBlur,
    style,
    focusStyle,
    scale = focusTokens.scale,
    ...rest
  },
  ref
) {
  const anim = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState(false);

  const animateTo = useCallback(
    (to) =>
      Animated.timing(anim, {
        toValue: to,
        duration: focusTokens.duration,
        useNativeDriver: true,
      }).start(),
    [anim]
  );

  const handleFocus = useCallback((e) => { setFocused(true); animateTo(1); onFocus?.(e); }, [animateTo, onFocus]);
  const handleBlur  = useCallback((e) => { setFocused(false); animateTo(0); onBlur?.(e); }, [animateTo, onBlur]);

  // La escala va en el propio Pressable: crece TODO junto (imagen, borde y texto).
  // Al ser transform no afecta al layout, así que no empuja a las tarjetas vecinas.
  const animatedStyle = {
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) }],
  };

  return (
    <AnimatedPressable
      ref={ref}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={[
        style,
        animatedStyle,
        // La tarjeta enfocada crece: debe quedar por encima de las vecinas o el
        // zoom se ve recortado por la siguiente del carrusel.
        focused && { zIndex: 10, elevation: 10 },
        focused && focusStyle,
      ]}
      {...rest}
    >
      {typeof children === 'function' ? children({ focused }) : children}
    </AnimatedPressable>
  );
});

export default TvFocusable;
