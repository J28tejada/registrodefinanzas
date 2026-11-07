import { useMemo, useRef, useState } from 'react';
import { AccessibilityActionEvent, AccessibilityInfo, Platform, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { RotateCcw } from 'lucide-react-native';
import Texto from './Texto';
import {
  TEXTOS_DE_LA_LINEA, compraDelIndice, compraEnLaPosicion, dentroDelCiclo, indiceDeCompra,
  lineaDeTiempo, posicionDe, textosDeLaLinea,
} from '@compartido/linea-de-tiempo';
import { useColores } from '../lib/colores';

/**
 * El gemelo de components/CardTimeline.tsx.
 *
 * Cuántos días hay para pagar lo que se compra con la tarjeta, en una barra
 * que va del primer día del ciclo al vencimiento. Toda la cuenta y todo lo que
 * dice salen de `lib/linea-de-tiempo.ts`, el mismo de la web.
 *
 * Lo que cambia es cómo se mueve el día: acá con el dedo, por Gesture Handler.
 * No con `PanResponder` por lo mismo que el menú lateral: el scroll de la
 * pantalla es nativo y se queda con el toque antes de que JavaScript se entere.
 * El gesto nativo deja que el sistema reparta: de costado es de la barra, para
 * arriba o abajo es del scroll.
 */
export default function LineaDeTiempoDeTarjeta({
  diaDeCorte, diaDePago, hoy, compraInicial, enLinea = false,
}: {
  diaDeCorte: number;
  diaDePago: number;
  /** YYYY-MM-DD en la zona del usuario. */
  hoy: string;
  /** El día elegido al abrir; sin él, hoy. La galería lo usa para mostrar otro día. */
  compraInicial?: string;
  /** Adentro del formulario: sin la tarjeta de vidrio, que ya la pone el formulario. */
  enLinea?: boolean;
}) {
  const paleta = useColores();
  const linea = useMemo(
    () => lineaDeTiempo(hoy, diaDeCorte, diaDePago), [hoy, diaDeCorte, diaDePago],
  );
  // Null es "hoy" y no la fecha de hoy: así, si cambia el día mientras la
  // pantalla está abierta, la barra sigue en hoy en vez de quedarse en ayer.
  const [elegida, setElegida] = useState<string | null>(compraInicial ?? null);
  // En el formulario el ciclo cambia mientras se tipea el día de corte, y la
  // compra elegida puede quedar afuera del nuevo: ahí vuelve a hoy.
  const compra = elegida && dentroDelCiclo(linea, elegida) ? elegida : hoy;
  const textos = textosDeLaLinea(linea, compra);

  const enX = posicionDe(linea, compra);
  const enCorte = linea.posicionDelCorte;
  const indice = indiceDeCompra(linea, compra);

  // En un ref y no en el estado: solo lo leen los gestos, y medir la barra no
  // tiene por qué volver a dibujarla.
  const ancho = useRef(0);
  const barra = useRef<View>(null);

  const gesto = useMemo(() => {
    const elegirEn = (x: number) => {
      if (ancho.current > 0) setElegida(compraEnLaPosicion(linea, x / ancho.current));
    };
    // `runOnJS`: lo que hacen es cambiar el estado de React con las cuentas de
    // `lib/`, que no son worklets. No hay nada que animar en el otro hilo.
    //
    // Se activa recién con 6px de costado, y se cae si antes el dedo bajó o
    // subió 10: así un scroll que empieza sobre la barra sigue siendo scroll y
    // no mueve la compra, igual que el `touch-pan-y` de la web. Y 6 y no los
    // 15 del menú lateral: arrastrando la barra hacia la derecha se activa
    // primero este gesto, y el menú no se abre por debajo.
    const arrastre = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-6, 6])
      .failOffsetY([-10, 10])
      .onStart(e => elegirEn(e.x))
      .onUpdate(e => elegirEn(e.x));
    // Un toque elige donde cayó, al soltar: en la web el dedo tampoco elige al
    // apoyarse, porque puede ser el comienzo de un scroll.
    const toque = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(10)
      .onEnd((e, salio) => { if (salio) elegirEn(e.x); });
    return Gesture.Race(arrastre, toque);
  }, [linea]);

  // Lo que en la web son las flechas del teclado: el lector de pantalla mueve
  // la compra de a un día.
  const alAjustar = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') setElegida(compraDelIndice(linea, indice + 1));
    if (e.nativeEvent.actionName === 'decrement') setElegida(compraDelIndice(linea, indice - 1));
  };

  // La píldora desaparece con su propio toque (la compra vuelve a hoy). Si el
  // foco del lector se quedara en ella, el sistema lo mandaría a cualquier
  // lado, casi siempre arriba de todo: se lo lleva a la barra, que es la que
  // acaba de cambiar. En el export web, el foco de siempre: ahí React Native
  // Web no tiene `sendAccessibilityEvent`.
  const volverAHoy = () => {
    setElegida(null);
    const vista = barra.current;
    if (!vista) return;
    if (Platform.OS === 'web') (vista as unknown as HTMLElement).focus?.();
    else AccessibilityInfo.sendAccessibilityEvent(vista, 'focus');
  };

  return (
    <View className={enLinea
      ? 'flex-col gap-4'
      : 'bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 flex-col gap-4'}
    >
      {/* Alto mínimo: la píldora aparece y desaparece, y el renglón no puede
          saltar con ella. Mínimo y no fijo, para que crezca si crece la letra. */}
      <View className="flex-row items-center justify-between gap-3 min-h-5">
        {/* En el formulario, el título y el número bajan un escalón: ahí lo
            principal son los campos, y esto es la vista previa de lo que dicen. */}
        <Texto className={enLinea ? 'text-xs font-medium text-tinta-2' : 'text-sm font-medium text-tinta'}>
          {TEXTOS_DE_LA_LINEA.titulo}
        </Texto>
        {compra !== hoy ? (
          <Pressable
            onPress={volverAHoy}
            accessibilityLabel={TEXTOS_DE_LA_LINEA.volverAHoyAccesible}
            className="flex-row items-center gap-1 px-2 py-0.5 rounded-full bg-hundido active:bg-presionado"
          >
            <RotateCcw size={12} color={paleta.tinta2} />
            <Texto className="text-2xs text-tinta-2">{TEXTOS_DE_LA_LINEA.volverAHoy}</Texto>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-col gap-1">
        <Texto
          className={`${enLinea ? 'text-2xl' : 'text-3xl'} font-semibold text-tinta`}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {textos.numero}
          <Texto className="text-base font-medium text-tinta-2">{` ${textos.unidad}`}</Texto>
        </Texto>
        <Texto className="text-xs text-tinta-2">{textos.frase}</Texto>
      </View>

      <View className="flex-col gap-1">
        {/* El corte va arriba de la barra y el inicio y el pago abajo: así
            ninguna etiqueta se pisa con otra, aunque la gracia sea de un día.
            Termina en la marca, que cae cerca de la mitad o más a la derecha.
            En el flujo y no flotando sobre una caja de alto fijo: con la letra
            del sistema grande, la etiqueta crece y tiene que empujar la barra
            para abajo en vez de taparla. El relleno en porcentaje se mide sobre
            el ancho, igual que en la web. */}
        <View className="flex-col items-end" style={{ paddingRight: `${(1 - enCorte) * 100}%` }}>
          <Texto className="text-2xs text-tinta-2">{textos.corte}</Texto>
        </View>

        {/* `touchAction` es solo para el export web, el de la comparación: ahí
            Gesture Handler pone `none` y se comía el scroll. `pan-y` es lo mismo
            que el `touch-pan-y` de la web. En el teléfono no hace nada. */}
        <GestureDetector gesture={gesto} touchAction="pan-y">
          <View
            ref={barra}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={TEXTOS_DE_LA_LINEA.barraAccesible}
            // Los `aria-value*` y no `accessibilityValue`: React Native los
            // junta en lo mismo, y el export web solo entiende estos. Con el
            // objeto, la barra del export salía sin valor para el lector.
            aria-valuemin={0}
            aria-valuemax={linea.diasDelCiclo - 1}
            aria-valuenow={indice}
            aria-valuetext={textos.valor}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={alAjustar}
            onLayout={e => { ancho.current = e.nativeEvent.layout.width; }}
            className="relative h-6"
          >
            <View className="absolute left-0 right-0 top-2 h-2 rounded-full bg-hundido overflow-hidden">
              {/* De la compra al corte: los días que todavía se está comprando. */}
              {compra !== linea.corte ? (
                <View
                  className="absolute top-0 bottom-0 bg-primario"
                  style={{ left: `${enX * 100}%`, right: `${(1 - enCorte) * 100}%`, marginRight: 1 }}
                />
              ) : null}
              {/* Del corte al pago: la gracia. Más clara, para que se lea como
                  el otro tramo; el hueco de 2px entre las dos es la marca. */}
              <View
                className="absolute top-0 bottom-0 bg-primario/45"
                style={{ left: `${enCorte * 100}%`, right: 0, marginLeft: 1 }}
              />
            </View>
            {/* Dónde queda hoy mientras se mira otro día: el punto al que
                vuelve la píldora. Con la compra en hoy ya lo marca el círculo. */}
            {compra !== hoy ? (
              <View
                className="absolute bottom-0 w-1 h-1 rounded-full bg-tinta-3"
                style={{ left: `${posicionDe(linea, hoy) * 100}%`, marginLeft: -2 }}
              />
            ) : null}
            {/* La marca del corte sube hasta su etiqueta. */}
            <View
              className="absolute top-0 h-2 w-px bg-tinta-3"
              style={{ left: `${enCorte * 100}%` }}
            />
            <View
              className="absolute top-0.5 w-5 h-5 rounded-full bg-primario border-[3px] border-fondo-luz"
              style={{ left: `${enX * 100}%`, marginLeft: -10 }}
            />
          </View>
        </GestureDetector>

        <View className="flex-row items-start justify-between gap-3">
          <Texto className="text-2xs text-tinta-2">{textos.inicio}</Texto>
          <Texto className="text-2xs font-medium text-tinta">{textos.pago}</Texto>
        </View>
      </View>

      <View className="flex-col gap-1 pt-3 border-t border-linea">
        <Texto className="text-xs text-tinta-2">{textos.consejo}</Texto>
        {textos.antes ? <Texto className="text-xs text-tinta-2">{textos.antes}</Texto> : null}
        <Texto className="text-2xs text-tinta-2">{TEXTOS_DE_LA_LINEA.nota}</Texto>
      </View>
    </View>
  );
}
