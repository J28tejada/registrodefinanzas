'use client';

import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle, Check, ChevronDown, CircleMinus, CirclePlus, CreditCard, Link2, Lock,
} from 'lucide-react';
import CategoryIcon from './CategoryIcon';
import type { Category, TransactionType } from '@/lib/types';
import type {
  AccionDeFila, CambioDePlan, FilaDeVista, GrupoDeVista, IdDeSeccion, InterruptorDeVista,
  MontoDeFila, SeccionDeVista,
} from '@/lib/extractos/planear';

/**
 * Una sección de la revisión de un estado de cuenta: "Para revisar", "Se
 * anotan", "No se anotan"… Una tarjeta por sección, con sus grupos y sus filas
 * adentro; la pantalla la repite por cada una que trae `vistaDelPlan`.
 *
 * Dibuja solo lo que le llega. Qué fila va dónde, qué píldoras tiene cada una,
 * los títulos con su cuenta y los motivos ya vienen resueltos del plan, que es
 * el mismo en la web y en el teléfono: si esto decidiera algo, las dos apps
 * podrían mostrar cosas distintas para el mismo PDF.
 *
 * Sin contextos ni pedidos a la API, para que la galería la pueda dibujar con
 * datos inventados. Su gemelo es mobile/componentes/RevisionDeExtracto.tsx.
 */

/** De centavos a texto, con la moneda de la persona. Cada app pasa su formateador. */
export type Dinero = (centavos: number) => string;

/** Lo que tocó la persona. `destino`: la clave de una línea, un grupo de "Para revisar" o null. */
export type AlCambiar = (destino: string | null, cambio: CambioDePlan) => void;

// Un ícono por sección para reconocerlas al pasar sin leer el título. Solo
// "Para revisar" va en color: es la única que pide algo.
const ICONO_DE_SECCION: Record<IdDeSeccion, LucideIcon> = {
  revisar: AlertTriangle,
  'se-anotan': CirclePlus,
  pagos: CreditCard,
  'ya-estaban': Link2,
  'no-se-anotan': CircleMinus,
  'ya-importados': Lock,
};

export default function BankStatementReview({
  seccion, abierta, onAlternar, dinero, categorias, onCambio, onAbrirFila,
}: {
  seccion: SeccionDeVista;
  /** Controlada desde afuera: tocar un conteo del resumen la abre antes de llevar hasta ella. */
  abierta: boolean;
  onAlternar: () => void;
  dinero: Dinero;
  /** Las del libro donde se anota: de ahí sale el ícono de cada fila. */
  categorias: Category[];
  onCambio: AlCambiar;
  onAbrirFila: (clave: string) => void;
}) {
  const Icono = ICONO_DE_SECCION[seccion.id];
  const { totales } = seccion;

  return (
    <div className="bg-panel border border-t-borde-luz border-linea rounded-2xl">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        className="w-full px-4 py-3 flex items-start gap-2.5 text-left"
      >
        <Icono className={`w-4 h-4 mt-0.5 flex-shrink-0 ${seccion.id === 'revisar' ? 'text-aviso' : 'text-tinta-2'}`} />
        {/* Spans y no párrafos: adentro de un botón no puede ir un <p>. En una
            columna flex igual se apilan como bloques. */}
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-tinta">{seccion.titulo}</span>
          {seccion.nota && <span className="text-xs text-tinta-2">{seccion.nota}</span>}
          {/* Los dos totales por separado y no un neto: "se suman 12 de ingreso
              y 10.000 de gasto" se lee de una; un neto obliga a hacer la cuenta
              al revés para saber cuánto se gastó. */}
          {totales && (totales.ingresosCentavos > 0 || totales.gastosCentavos > 0) && (
            <span className="flex flex-wrap gap-x-3 text-xs font-medium tabular-nums">
              {totales.ingresosCentavos > 0 && <span className="text-acento">+{dinero(totales.ingresosCentavos)}</span>}
              {totales.gastosCentavos > 0 && <span className="text-tinta">−{dinero(totales.gastosCentavos)}</span>}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 mt-0.5 flex-shrink-0 text-tinta-3 transition-transform ${abierta ? 'rotate-180' : ''}`}
        />
      </button>

      {abierta && seccion.grupos.map(g => (
        // La línea entre grupos va de borde a borde y la de entre filas, con
        // margen: así se ve dónde termina una pregunta y empieza la otra.
        <div key={g.id} className="border-t border-linea px-4">
          <EncabezadoDeGrupo grupo={g} onCambio={onCambio} />
          {g.filas.map((f, i) => (
            <div key={f.clave} className={i > 0 || tieneEncabezado(g) ? 'border-t border-linea' : ''}>
              <Fila fila={f} dinero={dinero} categorias={categorias} onCambio={onCambio} onAbrir={() => onAbrirFila(f.clave)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function tieneEncabezado(g: GrupoDeVista): boolean {
  return !!(g.titulo || g.pregunta || g.nota || g.botones.length > 0 || g.interruptor);
}

/** El subtítulo de un grupo, con su pregunta, sus botones y su interruptor. */
function EncabezadoDeGrupo({ grupo, onCambio }: { grupo: GrupoDeVista; onCambio: AlCambiar }) {
  if (!tieneEncabezado(grupo)) return null;
  return (
    <div className="pt-3 pb-3 flex flex-col gap-2">
      {(grupo.titulo || grupo.nota) && (
        <div className="flex items-start justify-between gap-3">
          {grupo.titulo && <p className="flex-1 min-w-0 text-xs font-medium text-tinta-2">{grupo.titulo}</p>}
          {grupo.nota && <p className="text-2xs text-tinta-3 flex-shrink-0">{grupo.nota}</p>}
        </div>
      )}
      {grupo.pregunta && <p className="text-sm text-tinta">{grupo.pregunta}</p>}
      {grupo.botones.length > 0 && (
        // Solo tocan lo que sigue sin decidir: lo ya elegido fila por fila no se pisa.
        // Con borde y sin relleno, para no confundirlos con las píldoras de
        // cada fila, que dicen casi lo mismo pero deciden una sola.
        <div className="flex flex-wrap gap-2">
          {grupo.botones.map(b => (
            <button
              key={b.texto}
              type="button"
              onClick={() => onCambio(b.destino, b.cambio)}
              className="px-3 py-1.5 border border-linea-fuerte hover:bg-hundido text-tinta rounded-lg text-xs font-medium transition-colors"
            >
              {b.texto}
            </button>
          ))}
        </div>
      )}
      {grupo.interruptor && (
        <Interruptor interruptor={grupo.interruptor} onCambiar={c => onCambio(null, c)} />
      )}
    </div>
  );
}

/**
 * Una línea del banco. Tocarla abre su hoja; las píldoras de "Para revisar"
 * deciden sin abrirla, que es lo que se hace casi siempre.
 */
function Fila({
  fila, dinero, categorias, onCambio, onAbrir,
}: {
  fila: FilaDeVista;
  dinero: Dinero;
  categorias: Category[];
  onCambio: AlCambiar;
  onAbrir: () => void;
}) {
  const tipo: TransactionType = fila.monto.signo === '+' ? 'income' : 'expense';
  const dibujo = fila.categoria ? dibujoDe(categorias, fila.categoria.categoria, tipo) : { icon: null, color: null };
  // Lo que no se anota se apaga entero, no solo el monto: un ícono verde y un
  // título en negro en "No se anotan" se leían como plata que sí entraba.
  const apagada = fila.monto.rol === 'apagado';

  const tocarPildora = (a: AccionDeFila) => {
    // Sin cambio, la píldora pide algo más (la categoría): eso se elige en la hoja.
    if (a.cambio) onCambio(fila.clave, a.cambio);
    else onAbrir();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={e => {
        // Solo la fila: un Enter sobre una píldora sube hasta acá, y el
        // `preventDefault` le cancelaba el clic y abría la hoja en su lugar.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); }
      }}
      className="py-3 flex items-start gap-3 cursor-pointer"
    >
      <CategoryIcon icon={dibujo.icon} color={dibujo.color} type={apagada ? 'expense' : tipo} size="sm" />

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-start gap-3">
          <p className={`flex-1 min-w-0 text-sm font-medium truncate ${apagada ? 'text-tinta-2' : 'text-tinta'}`}>
            {fila.descripcion}
          </p>
          <Monto monto={fila.monto} dinero={dinero} className="text-sm font-medium flex-shrink-0" />
        </div>

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-tinta-2">
          {/* Lo ya importado no se toca desde acá: el candado lo dice antes de abrirla. */}
          {fila.bloqueada && <Lock className="w-3 h-3 text-tinta-3" />}
          <span>{fila.fecha}</span>
          {fila.categoria && (
            <>
              <span className="px-1.5 py-0.5 bg-hundido rounded-md text-2xs text-tinta-2">{fila.categoria.texto}</span>
              {fila.categoria.notas.map(n => (
                <span key={n} className="text-2xs text-tinta-3">{n}</span>
              ))}
            </>
          )}
        </div>

        {fila.motivo && <p className="text-xs text-tinta-2">{fila.motivo}</p>}

        {/* Lo que ya estaba anotado y podría ser esta línea, con su monto: si
            no coincide al centavo, es lo primero que se quiere comparar. */}
        {fila.candidato && (
          <div className="mt-0.5 px-2.5 py-1.5 bg-hundido rounded-lg flex items-center justify-between gap-3 text-xs">
            <span className="flex-1 min-w-0 text-tinta-2 truncate">{fila.candidato.texto}</span>
            <span className="text-tinta tabular-nums flex-shrink-0">{dinero(fila.candidato.centavos)}</span>
          </div>
        )}

        {fila.acciones.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {fila.acciones.map(a => (
              <Pildora
                key={a.id}
                texto={a.texto}
                elegida={a.elegida}
                onElegir={() => tocarPildora(a)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * El ícono de la categoría de una fila, buscado por nombre entre las del libro
 * destino. Una que todavía no existe ('Cargos bancarios', que se crea al
 * importar) cae en el genérico, igual que en la lista de movimientos.
 */
function dibujoDe(categorias: Category[], nombre: string, tipo: TransactionType) {
  const buscado = nombre.trim().toLowerCase();
  const c = categorias.find(x => x.type === tipo && !x.parent_id && x.name.toLowerCase() === buscado);
  return { icon: c?.icon ?? null, color: c?.color ?? null };
}

// ─── Las piezas chicas, compartidas con el resumen y la hoja ─────────────────

/** Un monto con su signo: verde lo que entra, tinta lo que sale, apagado lo que no cuenta. */
export function Monto({ monto, dinero, className = '' }: { monto: MontoDeFila; dinero: Dinero; className?: string }) {
  const color = monto.rol === 'ingreso' ? 'text-acento' : monto.rol === 'gasto' ? 'text-tinta' : 'text-tinta-3';
  return <span className={`tabular-nums ${color} ${className}`}>{monto.signo}{dinero(monto.centavos)}</span>;
}

/**
 * Una opción que se elige tocándola. La elegida va en gris claro, levantada y
 * con el tilde, nunca en verde: el verde es para la plata que entra, y una
 * píldora verde en "No anotar" diría lo contrario de lo que hace.
 */
export function Pildora({
  texto, elegida, onElegir, grande = false,
}: {
  texto: string;
  elegida: boolean;
  onElegir: () => void;
  /** En la hoja, donde son la decisión principal y hay lugar. */
  grande?: boolean;
}) {
  return (
    <button
      type="button"
      // Adentro de una fila que también se toca: la píldora decide y nada más.
      onClick={e => { e.stopPropagation(); onElegir(); }}
      aria-pressed={elegida}
      className={`rounded-full border flex items-center gap-1 transition-colors ${
        grande ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'
      } ${
        elegida
          ? 'bg-elevado border-linea-fuerte text-tinta font-medium shadow-sm'
          : 'bg-hundido border-transparent text-tinta-2 hover:text-tinta'
      }`}
    >
      {elegida && <Check className={grande ? 'w-3.5 h-3.5' : 'w-3 h-3'} strokeWidth={2.5} />}
      {texto}
    </button>
  );
}

/**
 * Un interruptor dibujado a mano, igual que en el teléfono, donde no hay uno
 * que se vea igual en iOS y en Android. Prendido va en el color de los botones
 * principales; apagado, hueco y con la perilla más chica, para que se distinga
 * sin depender solo del color.
 */
export function Interruptor({
  interruptor, onCambiar,
}: {
  interruptor: InterruptorDeVista;
  onCambiar: (cambio: CambioDePlan) => void;
}) {
  const { valor } = interruptor;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={valor}
      onClick={() => onCambiar(interruptor.cambio)}
      className="w-full flex items-center gap-3 text-left"
    >
      <span className="flex-1 min-w-0 text-sm text-tinta">{interruptor.texto}</span>
      <span
        className={`w-10 h-6 rounded-full border px-0.5 flex items-center flex-shrink-0 transition-colors ${
          valor ? 'bg-primario border-primario justify-end' : 'bg-hundido border-linea-fuerte justify-start'
        }`}
      >
        <span className={`rounded-full ${valor ? 'w-5 h-5 bg-sobre-primario' : 'w-4 h-4 ml-0.5 bg-tinta-3'}`} />
      </span>
    </button>
  );
}
