import { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { ReduceMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** El ancho del panel, el mismo `w-[272px] max-w-[82%]` de la web. */
const ANCHO_MAXIMO = 272;
/** Cuánto hay que arrastrar, en fracción del panel, para que quede abierto. */
const UMBRAL = 0.35;
/** O la velocidad con la que se suelta, en px/s: un gesto rápido y corto también cuenta. */
const VELOCIDAD = 500;
/**
 * Los toques que empiezan pegados al borde izquierdo son del sistema: en una
 * pantalla a la que se entró desde otra, iOS los usa para volver atrás.
 */
const BORDE_DEL_SISTEMA = 24;
/** El resorte de un cajón: sigue la velocidad del dedo y no rebota. */
const RESORTE = { duration: 300, dampingRatio: 0.8, overshootClamping: true, reduceMotion: ReduceMotion.System };

const limitar = (x: number) => {
  'worklet';
  return Math.min(1, Math.max(0, x));
};

/**
 * El menú lateral del teléfono, que se abre deslizando de izquierda a derecha.
 *
 * Solo en el teléfono: es un gesto de app nativa. En la web el menú se sigue
 * abriendo con el botón de las tres rayas.
 *
 * Gesture Handler y Reanimated, no `PanResponder`: en iOS el scroll de cada
 * pantalla es un UIScrollView nativo, que se queda con el toque antes de que
 * JavaScript se entere, y el menú no se abría nunca. El gesto de Gesture
 * Handler es nativo también, así que iOS reparte el toque: si el dedo va de
 * costado es del menú, si va para arriba o abajo es del scroll.
 *
 * `progreso` va de 0 (cerrado) a 1 (abierto), vive en el hilo de la interfaz y
 * de ahí sale todo: cuánto entra el panel y cuánto se oscurece el fondo. React
 * no se entera de cada cuadro; solo de cuándo el menú empieza a abrirse y
 * cuándo terminó de cerrarse, para que la capa deje o no pasar los toques.
 */
export function useMenuLateral() {
  const { width } = useWindowDimensions();
  const ancho = Math.min(ANCHO_MAXIMO, width * 0.82);
  const progreso = useSharedValue(0);
  const [abierto, setAbierto] = useState(false);

  const abrir = useCallback(() => {
    setAbierto(true);
    progreso.set(withSpring(1, RESORTE));
  }, [progreso]);

  const cerrar = useCallback(() => {
    progreso.set(withSpring(0, RESORTE, terminado => {
      if (terminado) scheduleOnRN(setAbierto, false);
    }));
  }, [progreso]);

  /** Sin animación: al navegar, la pantalla nueva ya está debajo y no hay nada que mostrar. */
  const cerrarYa = useCallback(() => {
    progreso.set(0);
    setAbierto(false);
  }, [progreso]);

  // Horizontal de verdad: se activa después de 15px hacia la derecha y se cae
  // si antes el dedo se movió 12px para arriba o abajo, que es un scroll. No
  // depende de `abierto`: con el menú abierto la capa del menú está encima y
  // los toques no llegan acá, y rehacer el gesto al empezar a abrirse
  // cortaba el arrastre a mitad de camino.
  const gestoParaAbrir = useMemo(() => Gesture.Pan()
    .activeOffsetX(15)
    .failOffsetY([-12, 12])
    .hitSlop({ left: -BORDE_DEL_SISTEMA })
    .onStart(() => {
      scheduleOnRN(setAbierto, true);
    })
    .onUpdate(e => {
      progreso.set(limitar(e.translationX / ancho));
    })
    .onEnd(e => {
      const abre = e.translationX > ancho * UMBRAL || e.velocityX > VELOCIDAD;
      progreso.set(withSpring(abre ? 1 : 0, { ...RESORTE, velocity: e.velocityX / ancho }, terminado => {
        if (terminado && !abre) scheduleOnRN(setAbierto, false);
      }));
    }), [ancho, progreso]);

  const gestoParaCerrar = useMemo(() => Gesture.Pan()
    .activeOffsetX(-15)
    .failOffsetY([-12, 12])
    .onUpdate(e => {
      progreso.set(limitar(1 + e.translationX / ancho));
    })
    .onEnd(e => {
      const cierra = e.translationX < -ancho * UMBRAL || e.velocityX < -VELOCIDAD;
      progreso.set(withSpring(cierra ? 0 : 1, { ...RESORTE, velocity: e.velocityX / ancho }, terminado => {
        if (terminado && cierra) scheduleOnRN(setAbierto, false);
      }));
    }), [ancho, progreso]);

  return { ancho, progreso, abierto, abrir, cerrar, cerrarYa, gestoParaAbrir, gestoParaCerrar };
}

export type MenuLateral = ReturnType<typeof useMenuLateral>;
