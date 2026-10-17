'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronDown, Lock, X } from 'lucide-react';
import { Dinero, Monto, Pildora } from './BankStatementReview';
import type { Category } from '@/lib/types';
import type { CambioDePlan, HojaDeLinea } from '@/lib/extractos/planear';
import { HOJA, OPCIONES } from '@/lib/extractos/textos-plan';

/**
 * La hoja de una línea del estado de cuenta: todo lo que se puede hacer con
 * ella, más allá de las píldoras de la fila.
 *
 * Las opciones, los candidatos, las tarjetas y el porqué de la categoría
 * vienen de `hojaDeLinea`, que ya sabe cuáles valen para el signo y el
 * contexto de la línea: acá no se decide ninguna. Lo único propio es lo que
 * todavía no es un cambio — lo que se está escribiendo en la descripción, la
 * casilla de "usar en las otras" y qué lista se abrió —.
 *
 * Solo props, para que la galería la dibuje: con `enLinea` va sin el fondo
 * oscuro ni la posición fija. Su gemelo es
 * mobile/componentes/HojaDeLineaDeExtracto.tsx.
 */
export default function BankStatementLineSheet({
  hoja, dinero, categorias, onCambio, onCerrar, enLinea = false,
}: {
  /** Null = cerrada. */
  hoja: HojaDeLinea | null;
  dinero: Dinero;
  /** Las del libro donde se anota: las únicas que la base acepta para esta línea. */
  categorias: Category[];
  onCambio: (clave: string, cambio: CambioDePlan) => void;
  onCerrar: () => void;
  /** Para la galería: el panel suelto, sin fondo ni posición fija. */
  enLinea?: boolean;
}) {
  const clave = hoja?.clave ?? null;
  const [lista, setLista] = useState<'linked' | 'card_payment' | null>(null);
  // Prendida por defecto: casi siempre que se corrige un comercio es para todas sus compras.
  const [extender, setExtender] = useState(true);
  const [descripcion, setDescripcion] = useState(hoja?.descripcion ?? '');

  // Lo de recién vuelve a cero con cada línea, no con cada cambio: elegir la
  // categoría rearma la hoja entera y no puede borrar lo que se está escribiendo.
  useEffect(() => {
    setLista(null);
    setExtender(true);
    setDescripcion(hoja?.descripcion ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  useEffect(() => {
    if (!clave || enLinea) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [clave, enLinea, onCerrar]);

  if (!hoja) return null;

  const cambiar = (cambio: CambioDePlan) => onCambio(hoja.clave, cambio);

  const guardarDescripcion = () => {
    if (!hoja.categoria) return;
    if (descripcion.trim() !== hoja.descripcion) cambiar({ tipo: 'descripcion', descripcion });
  };

  const listo = () => {
    guardarDescripcion();
    onCerrar();
  };

  const elegida = (id: string) => hoja.opciones.some(o => o.id === id && o.elegida);
  const verCandidatos = hoja.candidatos.length > 0 && (lista === 'linked' || elegida('linked'));
  const verTarjetas = hoja.tarjetas.length > 0 && (lista === 'card_payment' || elegida('card_payment'));

  const panel = (
    <div
      className={`vidrio border border-t-borde-luz border-linea flex flex-col ${
        enLinea ? 'rounded-2xl' : 'relative w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh]'
      }`}
      role={enLinea ? undefined : 'dialog'}
      aria-modal={enLinea ? undefined : true}
      aria-label={hoja.titulo}
    >
      <div className="px-5 py-4 border-b border-linea flex items-center justify-between gap-3">
        <h2 className="font-semibold text-tinta">{hoja.titulo}</h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label={HOJA.cerrar}
          className="p-1 -m-1 text-tinta-2 hover:text-tinta transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* El cuerpo es lo único que se desplaza: el título y "Listo" quedan
          siempre a mano, y en el teléfono es la misma partición (cabecera,
          ScrollView, pie) porque allá no hay `sticky`. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-5">
        {/* Lo del banco no se edita: la fecha y el monto son lo que cuadra
            contra los saldos, y cambiarlos rompería esa cuenta. */}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-tinta">{hoja.descripcion}</p>
          <Monto monto={hoja.monto} dinero={dinero} className="text-2xl font-semibold" />
          <p className="text-xs text-tinta-2">{hoja.fechas}</p>
        </div>

        {hoja.bloqueada ? (
          <p className="px-3 py-2.5 bg-hundido rounded-xl flex items-start gap-2 text-sm text-tinta-2">
            <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="flex-1 min-w-0">{hoja.motivo}</span>
          </p>
        ) : (
          <>
            {hoja.motivo && <p className="text-sm text-tinta-2 -mt-2">{hoja.motivo}</p>}

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {hoja.opciones.map(o => (
                  <Pildora
                    key={o.id}
                    texto={o.texto}
                    elegida={o.elegida}
                    grande
                    onElegir={() => {
                      if (o.cambio) cambiar(o.cambio);
                      // "Ya está anotado" y "Pago de tarjeta" muestran su lista
                      // aunque haya uno solo: hay que ver con qué quedó.
                      setLista(o.id === 'linked' || o.id === 'card_payment' ? o.id : null);
                    }}
                  />
                ))}
              </div>

              {verCandidatos && (
                <div className="flex flex-col gap-1.5">
                  {hoja.candidatos.map(c => (
                    <Eleccion key={c.id} elegida={c.elegido} onElegir={() => cambiar(c.cambio)}>
                      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="text-sm text-tinta">{c.texto}</span>
                        {c.detalle && <span className="text-xs text-tinta-2">{c.detalle}</span>}
                      </span>
                      <span className="text-sm text-tinta tabular-nums flex-shrink-0">{dinero(c.centavos)}</span>
                    </Eleccion>
                  ))}
                </div>
              )}

              {verTarjetas && (
                <div className="flex flex-col gap-1.5">
                  {hoja.tarjetas.map(t => (
                    <Eleccion key={t.id} elegida={t.elegida} onElegir={() => cambiar(t.cambio)}>
                      <span className="flex-1 min-w-0 text-sm text-tinta">{t.texto}</span>
                    </Eleccion>
                  ))}
                </div>
              )}
            </div>

            {hoja.categoria && (
              <SelectorDeCategoria
                categoria={hoja.categoria}
                categorias={categorias}
                onElegir={(categoria, subcategoria) => cambiar({
                  tipo: 'categoria', categoria, subcategoria, extender: extender && !!hoja.extender,
                })}
              />
            )}

            {hoja.extender && (
              <button
                type="button"
                role="checkbox"
                aria-checked={extender}
                onClick={() => setExtender(v => !v)}
                className="-mt-2 flex items-start gap-2.5 text-left"
              >
                <span
                  className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 ${
                    extender ? 'bg-primario border-primario' : 'bg-hundido border-linea-fuerte'
                  }`}
                >
                  {extender && <Check className="w-3 h-3 text-sobre-primario" strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0 text-sm text-tinta">{hoja.extender.texto}</span>
              </button>
            )}

            {/* Solo para lo que se anota: un enlace o un pago no guardan descripción. */}
            {hoja.categoria && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="extracto-descripcion" className="text-xs text-tinta-2 font-medium">{HOJA.descripcion}</label>
                <input
                  id="extracto-descripcion"
                  type="text"
                  value={descripcion}
                  maxLength={120}
                  onChange={e => setDescripcion(e.target.value)}
                  onBlur={guardarDescripcion}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta focus:outline-none focus:border-tinta-3"
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-5 py-4 border-t border-linea">
        <button
          type="button"
          onClick={listo}
          className="w-full py-2.5 bg-primario hover:bg-primario/85 text-sobre-primario rounded-lg text-sm font-medium transition-colors"
        >
          {hoja.listo}
        </button>
      </div>
    </div>
  );

  if (enLinea) return panel;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={listo} />
      {panel}
    </div>
  );
}

/** Una fila que se elige de una lista (un candidato, una tarjeta), con su círculo dibujado a mano. */
function Eleccion({
  elegida, onElegir, children,
}: {
  elegida: boolean;
  onElegir: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={elegida}
      onClick={onElegir}
      className={`w-full px-3 py-2.5 rounded-xl border flex items-center gap-3 text-left transition-colors ${
        elegida ? 'bg-elevado border-linea-fuerte shadow-sm' : 'bg-hundido border-transparent'
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          elegida ? 'border-tinta' : 'border-tinta-3'
        }`}
      >
        {elegida && <span className="w-2 h-2 rounded-full bg-tinta" />}
      </span>
      {children}
    </button>
  );
}

/**
 * La categoría y, si tiene, la subcategoría: dos selectores, como en el alta de
 * un movimiento. Solo las del tipo de la línea (un cargo no puede ir a una
 * categoría de ingreso: la base lo rechaza).
 */
function SelectorDeCategoria({
  categoria, categorias, onElegir,
}: {
  categoria: NonNullable<HojaDeLinea['categoria']>;
  categorias: Category[];
  onElegir: (categoria: string, subcategoria: string | null) => void;
}) {
  const principales = categorias.filter(c => c.type === categoria.tipo && !c.parent_id);
  const actual = principales.find(c => c.name === categoria.categoria) ?? null;
  const subs = actual
    ? categorias.filter(c => c.parent_id === actual.id).sort((a, b) => a.name.localeCompare(b.name, 'es'))
    : [];
  // 'Cargos bancarios' todavía no existe: se crea al importar, pero tiene que
  // verse elegida.
  const nueva = categoria.categoria && !actual ? categoria.categoria : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="extracto-categoria" className="text-xs text-tinta-2 font-medium">{HOJA.categoria}</label>
        <div className="relative">
          <select
            id="extracto-categoria"
            value={categoria.categoria ?? ''}
            onChange={e => onElegir(e.target.value, null)}
            className="w-full bg-hundido border border-linea-fuerte rounded-lg pl-3 pr-8 py-2.5 text-sm text-tinta appearance-none focus:outline-none focus:border-tinta-3"
          >
            {!categoria.categoria && <option value="" disabled>{OPCIONES.elegirCategoria}</option>}
            {nueva && <option value={nueva}>{nueva}</option>}
            {principales.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tinta-2 pointer-events-none" />
        </div>
        {/* Pegado a la categoría que explica, no al final: si está debajo de la
            subcategoría parece que habla de ella. */}
        {categoria.porque && <p className="text-xs text-tinta-2">{categoria.porque}</p>}
      </div>

      {subs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="extracto-subcategoria" className="text-xs text-tinta-2 font-medium">{HOJA.subcategoria}</label>
          <div className="relative">
            <select
              id="extracto-subcategoria"
              value={categoria.subcategoria ?? ''}
              onChange={e => onElegir(actual!.name, e.target.value || null)}
              className="w-full bg-hundido border border-linea-fuerte rounded-lg pl-3 pr-8 py-2.5 text-sm text-tinta appearance-none focus:outline-none focus:border-tinta-3"
            >
              <option value="">{HOJA.sinSubcategoria}</option>
              {subs.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tinta-2 pointer-events-none" />
          </div>
        </div>
      )}
    </div>
  );
}
