import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, useWindowDimensions } from 'react-native';

/** El ancho del panel, el mismo `w-[272px] max-w-[82%]` de la web. */
const ANCHO_MAXIMO = 272;

/** Cuánto hay que arrastrar, en fracción del panel, para que quede abierto. */
const UMBRAL = 0.35;
/** O la velocidad con la que se suelta: un gesto rápido y corto también cuenta. */
const VELOCIDAD = 0.5;

const limitar = (x: number) => Math.min(1, Math.max(0, x));
/** Horizontal de verdad: sin esto, un scroll vertical un poco torcido abría el menú. */
const esHorizontal = (dx: number, dy: number) => Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 2;

/**
 * El menú lateral del teléfono, que se abre deslizando de izquierda a derecha.
 *
 * Solo en el teléfono: es un gesto de app nativa. En la web el menú se sigue
 * abriendo con el botón de las tres rayas.
 *
 * El panel sigue al dedo mientras se arrastra, como en la app de ChatGPT, y al
 * soltar termina de abrirse o vuelve según cuánto se arrastró. Por eso el panel
 * ya no es un `Modal`: en iOS, presentar un `Modal` en medio de un toque cancela
 * el toque, y el arrastre se cortaría justo al empezar.
 *
 * `progreso` va de 0 (cerrado) a 1 (abierto) y de ahí sale todo: cuánto entra el
 * panel y cuánto se oscurece el fondo.
 */
export function useMenuLateral() {
  const { width } = useWindowDimensions();
  const ancho = Math.min(ANCHO_MAXIMO, width * 0.82);
  const progreso = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  // Los PanResponder se crean una sola vez: leen el estado de acá, no del render.
  const abierto = useRef(false);
  const anchoActual = useRef(ancho);
  anchoActual.current = ancho;

  const animarA = useCallback((valor: 0 | 1) => {
    abierto.current = valor === 1;
    if (valor === 1) setVisible(true);
    Animated.timing(progreso, {
      toValue: valor,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && valor === 0) setVisible(false);
    });
  }, [progreso]);

  const abrir = useCallback(() => animarA(1), [animarA]);
  const cerrar = useCallback(() => animarA(0), [animarA]);

  /** Sin animación: al navegar, la pantalla nueva ya está debajo y no hay nada que mostrar. */
  const cerrarYa = useCallback(() => {
    progreso.stopAnimation();
    progreso.setValue(0);
    abierto.current = false;
    setVisible(false);
  }, [progreso]);

  // Una vez que el gesto es claramente horizontal no se suelta: si no, el
  // ScrollView de la pantalla (o el del menú) pedía el toque a mitad de camino y
  // el panel volvía a donde estaba. Y se toma en la captura, antes que los
  // hijos, para que empezar el gesto sobre un botón o una fila también sirva.
  const gestoParaAbrir = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => !abierto.current && g.dx > 0 && esHorizontal(g.dx, g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      progreso.stopAnimation();
      setVisible(true);
    },
    onPanResponderMove: (_, g) => progreso.setValue(limitar(g.dx / anchoActual.current)),
    onPanResponderRelease: (_, g) =>
      (g.dx > anchoActual.current * UMBRAL || g.vx > VELOCIDAD ? abrir() : cerrar()),
    onPanResponderTerminate: () => cerrar(),
  }), [progreso, abrir, cerrar]);

  const gestoParaCerrar = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => g.dx < 0 && esHorizontal(g.dx, g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => progreso.setValue(limitar(1 + g.dx / anchoActual.current)),
    onPanResponderRelease: (_, g) =>
      (g.dx < -anchoActual.current * UMBRAL || g.vx < -VELOCIDAD ? cerrar() : abrir()),
    onPanResponderTerminate: () => abrir(),
  }), [progreso, abrir, cerrar]);

  return { ancho, progreso, visible, abrir, cerrar, cerrarYa, gestoParaAbrir, gestoParaCerrar };
}

export type MenuLateral = ReturnType<typeof useMenuLateral>;
