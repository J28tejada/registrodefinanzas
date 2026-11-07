'use client';

import { useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  TEXTOS_DE_LA_LINEA, compraDelIndice, compraEnLaPosicion, dentroDelCiclo, indiceDeCompra,
  lineaDeTiempo, posicionDe, textosDeLaLinea,
} from '@/lib/linea-de-tiempo';

/** Cuánto se corre la compra con Re Pág / Av Pág: una semana. */
const SEMANA = 7;

/**
 * Cuántos días hay para pagar lo que se compra con la tarjeta, en una barra
 * que va del primer día del ciclo al vencimiento.
 *
 * El número grande es la respuesta a "si la uso hoy, ¿cuándo la pago?"; la
 * barra deja mover el día —tocándola, arrastrando o con las flechas— para ver
 * por qué el día después del corte da casi cincuenta y el del corte, veinte.
 *
 * Solo props, sin pedir datos: la dibujan el detalle de la tarjeta, el
 * formulario (con `enLinea`, sin tarjeta propia) y la galería. Toda la cuenta y
 * todo lo que dice salen de `lib/linea-de-tiempo.ts`. Su gemelo es
 * mobile/componentes/LineaDeTiempoDeTarjeta.tsx.
 */
export default function CardTimeline({
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

  const pista = useRef<HTMLDivElement>(null);
  const toque = useRef<{ id: number; dedo: boolean; desde: number; arrastra: boolean } | null>(null);

  const elegirEn = (clientX: number) => {
    const caja = pista.current?.getBoundingClientRect();
    if (!caja || caja.width === 0) return;
    setElegida(compraEnLaPosicion(linea, (clientX - caja.left) / caja.width));
  };

  const alApretar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const dedo = e.pointerType === 'touch';
    toque.current = { id: e.pointerId, dedo, desde: e.clientX, arrastra: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    // Con el mouse se elige al apretar. Con el dedo se espera: puede ser el
    // comienzo de un scroll que pasa por encima de la barra, y elegir ahí
    // movería la compra sin que nadie lo haya pedido.
    if (!dedo) elegirEn(e.clientX);
  };

  const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = toque.current;
    if (!t || t.id !== e.pointerId) return;
    // Unos píxeles de margen para que un toque que tiembla no cuente como arrastre.
    if (t.dedo && !t.arrastra && Math.abs(e.clientX - t.desde) < 4) return;
    t.arrastra = true;
    elegirEn(e.clientX);
  };

  const alSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = toque.current;
    if (!t || t.id !== e.pointerId) return;
    // Un toque con el dedo elige donde cayó. Si el navegador se lo hubiera
    // llevado para hacer scroll, habría llegado `pointercancel` y no esto.
    if (t.dedo) elegirEn(e.clientX);
    toque.current = null;
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = indiceDeCompra(linea, compra);
    const destino: Record<string, number> = {
      ArrowLeft: i - 1, ArrowDown: i - 1, ArrowRight: i + 1, ArrowUp: i + 1,
      PageDown: i - SEMANA, PageUp: i + SEMANA, Home: 0, End: linea.diasDelCiclo - 1,
    };
    if (!(e.key in destino)) return;
    e.preventDefault();
    setElegida(compraDelIndice(linea, destino[e.key]));
  };

  return (
    <div className={enLinea
      ? 'flex flex-col gap-4'
      : 'bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 flex flex-col gap-4'}
    >
      {/* Alto fijo: la píldora aparece y desaparece, y el renglón no puede
          saltar con ella. */}
      <div className="flex items-center justify-between gap-3 h-5">
        {/* En el formulario, el título y el número bajan un escalón: ahí lo
            principal son los campos, y esto es la vista previa de lo que dicen. */}
        <p className={enLinea ? 'text-xs font-medium text-tinta-2' : 'text-sm font-medium text-tinta'}>
          {TEXTOS_DE_LA_LINEA.titulo}
        </p>
        {compra !== hoy && (
          <button
            type="button"
            onClick={() => setElegida(null)}
            aria-label={TEXTOS_DE_LA_LINEA.volverAHoyAccesible}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-hundido hover:bg-presionado text-2xs text-tinta-2 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> {TEXTOS_DE_LA_LINEA.volverAHoy}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <p className={`${enLinea ? 'text-2xl' : 'text-3xl'} font-semibold text-tinta tabular-nums`}>
          {textos.numero}
          <span className="text-base font-medium text-tinta-2">{` ${textos.unidad}`}</span>
        </p>
        <p className="text-xs text-tinta-2">{textos.frase}</p>
      </div>

      <div className="flex flex-col gap-1">
        {/* El corte va arriba de la barra y el inicio y el pago abajo: así
            ninguna etiqueta se pisa con otra, aunque la gracia sea de un día.
            Termina en la marca, que siempre cae de la mitad para la derecha. */}
        <div className="relative h-4">
          <p
            className="absolute top-0 text-2xs text-tinta-2"
            style={{ right: `${(1 - enCorte) * 100}%` }}
          >
            {textos.corte}
          </p>
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label={TEXTOS_DE_LA_LINEA.barraAccesible}
          aria-valuemin={0}
          aria-valuemax={linea.diasDelCiclo - 1}
          aria-valuenow={indiceDeCompra(linea, compra)}
          aria-valuetext={textos.valor}
          onPointerDown={alApretar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={() => { toque.current = null; }}
          onKeyDown={alTeclear}
          // pan-y: el scroll vertical sigue siendo del navegador; lo horizontal
          // llega acá. Sin esto, en el teléfono la barra se comía el scroll.
          className="group relative h-6 cursor-pointer touch-pan-y select-none outline-none"
        >
          <div ref={pista} className="absolute left-0 right-0 top-2 h-2 rounded-full bg-hundido overflow-hidden">
            {/* De la compra al corte: los días que todavía se está comprando. */}
            {compra !== linea.corte && (
              <div
                className="absolute top-0 bottom-0 bg-primario"
                style={{ left: `${enX * 100}%`, right: `${(1 - enCorte) * 100}%`, marginRight: 1 }}
              />
            )}
            {/* Del corte al pago: la gracia. Más clara, para que se lea como
                el otro tramo; el hueco de 2px entre las dos es la marca. */}
            <div
              className="absolute top-0 bottom-0 bg-primario/45"
              style={{ left: `${enCorte * 100}%`, right: 0, marginLeft: 1 }}
            />
          </div>
          {/* La marca del corte sube hasta su etiqueta. */}
          <div
            className="absolute top-0 h-2 w-px bg-tinta-3"
            style={{ left: `${enCorte * 100}%` }}
          />
          <div
            className="absolute top-0.5 w-5 h-5 rounded-full bg-primario border-[3px] border-fondo-luz group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-tinta-3"
            style={{ left: `${enX * 100}%`, marginLeft: -10 }}
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <p className="text-2xs text-tinta-2">{textos.inicio}</p>
          <p className="text-2xs font-medium text-tinta">{textos.pago}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1 pt-3 border-t border-linea">
        <p className="text-xs text-tinta-2">{textos.consejo}</p>
        <p className="text-2xs text-tinta-2">{TEXTOS_DE_LA_LINEA.nota}</p>
      </div>
    </div>
  );
}
