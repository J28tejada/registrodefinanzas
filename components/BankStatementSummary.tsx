'use client';

import { useState } from 'react';
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Download, Info, Landmark,
  Loader2,
} from 'lucide-react';
import { AlCambiar, Dinero, Interruptor } from './BankStatementReview';
import type { AvisoDeVista, IdDeSeccion, ResumenDeVista, VistaDelPlan } from '@/lib/extractos/planear';
import { ANOTAR_EN, PANTALLA, textoDeSaldos } from '@/lib/extractos/textos-plan';

/**
 * El resumen de un estado de cuenta ya leído: de qué cuenta es, que cuadra con
 * el banco, dónde se anota, qué va a pasar con cada línea y el botón de
 * importar.
 *
 * Va arriba de todo porque contesta lo que uno quiere saber antes de mirar
 * fila por fila: "¿leyó bien?" (la insignia y los saldos) y "¿qué va a hacer?"
 * (los conteos). Cada conteo lleva a su sección.
 *
 * Solo dibuja lo que trae `vistaDelPlan`; sin contextos ni pedidos, para que
 * la galería lo pueda mostrar. Su gemelo es mobile/componentes/ResumenDeExtracto.tsx.
 */
export default function BankStatementSummary({
  resumen, boton, dinero, libros, libroId, onLibro, cambiandoLibro = false, onCambio, onConteo,
  onImportar, importando = false, error = '',
}: {
  resumen: ResumenDeVista;
  boton: VistaDelPlan['boton'];
  dinero: Dinero;
  /** Los libros donde se puede anotar ("Personal", "Hogar"), para el selector "Anotar en". */
  libros: { id: string; nombre: string }[];
  libroId: string;
  onLibro: (id: string) => void;
  /** Mientras llegan las categorías del libro nuevo: el selector no se puede tocar. */
  cambiandoLibro?: boolean;
  onCambio: AlCambiar;
  /** Lleva a una sección (abriéndola si está plegada). */
  onConteo: (seccion: IdDeSeccion) => void;
  onImportar: () => void;
  importando?: boolean;
  /** El error de la última importación, debajo del botón que se tocó. */
  error?: string;
}) {
  return (
    <div className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-hundido rounded-xl flex items-center justify-center flex-shrink-0">
          <Landmark className="w-5 h-5 text-tinta-2" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <p className="text-base font-semibold text-tinta">{resumen.titulo}</p>
          <p className="text-xs text-tinta-2">{resumen.subtitulo}</p>
        </div>
      </div>

      {/* La insignia en verde es de lo poco que sale bien a propósito: que el
          estado cuadre al centavo con los saldos del banco es lo que permite
          confiar en todo lo de abajo. */}
      <div className="flex flex-col gap-2">
        <div className="self-start px-2 py-1 bg-acento/10 text-acento rounded-full text-xs font-medium flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          {resumen.insignia}
        </div>
        <p className="text-xs text-tinta-2 tabular-nums">
          {textoDeSaldos(dinero(resumen.saldoInicialCentavos), dinero(resumen.saldoFinalCentavos))}
        </p>
      </div>

      <div className="border-t border-linea pt-4 flex items-center gap-3">
        <label htmlFor="extracto-anotar-en" className="text-sm text-tinta-2 flex-shrink-0">{ANOTAR_EN}</label>
        <div className="relative flex-1 min-w-0">
          <select
            id="extracto-anotar-en"
            value={libroId}
            disabled={cambiandoLibro}
            onChange={e => onLibro(e.target.value)}
            className="w-full bg-hundido border border-linea-fuerte rounded-lg pl-3 pr-8 py-2.5 text-sm text-tinta appearance-none focus:outline-none focus:border-tinta-3 disabled:opacity-60"
          >
            {libros.map(l => (
              <option key={l.id} value={l.id}>{l.nombre}</option>
            ))}
          </select>
          {cambiandoLibro
            ? <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tinta-2 animate-spin pointer-events-none" />
            : <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tinta-2 pointer-events-none" />}
        </div>
      </div>

      {resumen.avisos.length > 0 && (
        <div className="flex flex-col gap-2">
          {resumen.avisos.map(a => <Aviso key={a.id} aviso={a} onCambio={onCambio} />)}
        </div>
      )}

      {(resumen.conteos.length > 0 || resumen.paraRevisar) && (
        <div className="border-t border-linea pt-2 flex flex-col">
          {resumen.conteos.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onConteo(c.seccion)}
              className={`py-2.5 flex items-center gap-2 text-left text-sm text-tinta ${i > 0 ? 'border-t border-linea' : ''}`}
            >
              <span className="flex-1 min-w-0">{c.texto}</span>
              <ChevronRight className="w-4 h-4 text-tinta-3 flex-shrink-0" />
            </button>
          ))}
          {/* Lo único en ámbar de toda la pantalla: lo que falta decidir. Si no
              se decide no se anota, y eso hay que leerlo antes de tocar Importar. */}
          {resumen.paraRevisar && (
            <button
              type="button"
              onClick={() => onConteo('revisar')}
              className="mt-2 px-3 py-2.5 bg-aviso/10 text-aviso rounded-xl flex items-start gap-2 text-left text-sm"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="flex-1 min-w-0">{resumen.paraRevisar}</span>
              <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" />
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <BotonDeImportar boton={boton} importando={importando} ocupado={cambiandoLibro} onImportar={onImportar} />
        {error && <CajaDeError texto={error} />}
      </div>
    </div>
  );
}

/**
 * Un aviso del resumen. Los que frenan la importación van en rojo: son la razón
 * de que el botón esté apagado. El resto es información y va en gris.
 */
function Aviso({ aviso, onCambio }: { aviso: AvisoDeVista; onCambio: AlCambiar }) {
  // "Elegir otra" abre la lista de cuentas en el lugar, sin otra pantalla.
  const [abierto, setAbierto] = useState(false);
  const { accion } = aviso;
  const Icono = aviso.bloquea ? AlertCircle : Info;
  const verOpciones = aviso.opciones.length > 0 && (!accion || abierto);

  return (
    <div
      className={`border rounded-xl p-3 flex flex-col gap-2.5 ${
        aviso.bloquea ? 'bg-peligro/10 border-peligro/20' : 'bg-hundido border-linea'
      }`}
    >
      <div className={`flex items-start gap-2 text-sm ${aviso.bloquea ? 'text-peligro' : 'text-tinta-2'}`}>
        <Icono className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span className="flex-1 min-w-0">{aviso.texto}</span>
      </div>

      {/* Todo lo de abajo arranca donde arranca el texto, no debajo del ícono. */}
      {accion && (
        <div className="pl-6">
          <button
            type="button"
            onClick={() => (accion.cambio ? onCambio(null, accion.cambio) : setAbierto(v => !v))}
            aria-expanded={accion.cambio ? undefined : abierto}
            className="px-3 py-1.5 bg-panel border border-linea-fuerte text-tinta rounded-lg text-xs font-medium flex items-center gap-1.5"
          >
            {accion.texto}
            {!accion.cambio && (
              <ChevronDown className={`w-3.5 h-3.5 text-tinta-2 transition-transform ${abierto ? 'rotate-180' : ''}`} />
            )}
          </button>
        </div>
      )}

      {verOpciones && (
        <div className="pl-6 flex flex-col gap-1.5">
          {aviso.opciones.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => onCambio(null, o.cambio)}
              className="w-full px-3 py-2 bg-panel border border-linea text-tinta rounded-lg text-sm text-left"
            >
              {o.texto}
            </button>
          ))}
        </div>
      )}

      {aviso.interruptor && (
        <div className="pl-6">
          <Interruptor interruptor={aviso.interruptor} onCambiar={c => onCambio(null, c)} />
        </div>
      )}
    </div>
  );
}

/**
 * El botón de importar. Va arriba, en el resumen, y otra vez al final de la
 * lista: en el teléfono no hay pie fijo, y después de revisar sesenta filas
 * nadie vuelve hasta arriba a buscarlo.
 */
export function BotonDeImportar({
  boton, importando = false, ocupado = false, onImportar,
}: {
  boton: VistaDelPlan['boton'];
  importando?: boolean;
  /** Falta algo que el pedido necesita (las categorías del libro nuevo): apagado, sin decir "Importando…". */
  ocupado?: boolean;
  onImportar: () => void;
}) {
  // Sin nada que importar no es un botón apagado sino un dato: "ya se importó
  // el 2 oct." no se lee bien en negro al 50%.
  if (boton.n === 0) {
    return (
      <p className="w-full px-4 py-3 bg-hundido text-tinta-2 rounded-lg text-sm text-center">{boton.texto}</p>
    );
  }
  return (
    <button
      type="button"
      onClick={onImportar}
      disabled={!boton.habilitado || importando || ocupado}
      className="w-full py-3 bg-primario hover:bg-primario/85 disabled:opacity-50 text-sobre-primario rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
    >
      {importando ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> {PANTALLA.importando}</>
      ) : (
        <><Download className="w-4 h-4" /> {boton.texto}</>
      )}
    </button>
  );
}

/** Un error de la pantalla (leer, importar, deshacer): en rojo porque falló, y con el porqué. */
export function CajaDeError({ texto }: { texto: string }) {
  return (
    <p className="px-3 py-2.5 bg-peligro/10 border border-peligro/20 text-peligro rounded-xl flex items-start gap-2 text-sm">
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span className="flex-1 min-w-0">{texto}</span>
    </p>
  );
}
