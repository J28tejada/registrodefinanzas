'use client';

import { useState } from 'react';
import { Tags, Plus, Loader2, AlertCircle, Trash2, Check, X } from 'lucide-react';
import { useCategories } from './CategoriesContext';
import { useLedger } from './LedgerContext';
import CategoryIcon from './CategoryIcon';
import IconPicker from './IconPicker';
import { CategoryWithUsage, TransactionType } from '@/lib/types';
import { sugerirIcono } from '@/lib/iconos-categoria';

/** Ya no hay ámbito: la cuenta lo define, y cada cuenta tiene su lista. */
const GRUPOS: { type: TransactionType; titulo: string }[] = [
  { type: 'expense', titulo: 'Gastos' },
  { type: 'income', titulo: 'Ingresos' },
];

/** Lo que se está editando: una existente, o una nueva de tal tipo. */
type Edicion =
  | { modo: 'nueva'; type: TransactionType }
  | { modo: 'existente'; cat: CategoryWithUsage };

/**
 * Crear, renombrar y personalizar categorías.
 *
 * En grilla y no en lista de texto: con treinta nombres seguidos hay que leer
 * uno por uno para encontrar el que se busca, y con el ícono al lado alcanza
 * con mirar. Es la misma grilla que después aparece al anotar un gasto, así que
 * lo que se arma acá es literalmente lo que se va a ver ahí.
 *
 * Renombrar arrastra los movimientos que ya la usaban; borrar solo se puede si
 * no la usa ninguno. Por eso cada tarjeta muestra en cuántos se usa: sin ese
 * dato el botón de borrar falla y no se entiende por qué.
 */
export default function CategoriesPanel() {
  const { cargando, error: errorCarga, refrescar, para, subDe } = useCategories();
  const { currentLedger, ledgers } = useLedger();
  const ledgerId = currentLedger?.id ?? ledgers[0]?.id ?? null;

  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [error, setError] = useState('');

  // Si la carga falló, el panel se ve vacío y parecería que no hay categorías:
  // alguien las volvería a crear y quedarían duplicadas al recuperarse.
  const aMostrar = error || errorCarga;

  if (cargando) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
        <Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" />
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-5">
      <div>
        <p className="font-semibold text-white text-sm flex items-center gap-2">
          <Tags className="w-4 h-4 text-emerald-400" /> Categorías
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          Tocá una para cambiarle el nombre, el ícono o el color.
        </p>
      </div>

      {aMostrar && (
        <p className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{aMostrar}</span>
        </p>
      )}

      {GRUPOS.map(({ type, titulo }) => {
        // Las propias primero: son pocas entre treinta que vinieron con la app,
        // y son las que uno viene a tocar.
        const lista = [...para(type)].sort((a, b) =>
          a.origen === b.origen ? a.name.localeCompare(b.name, 'es') : a.origen === 'usuario' ? -1 : 1,
        );
        const editandoAcá = edicion?.modo === 'nueva' && edicion.type === type;

        return (
          <div key={type} className="space-y-3">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{titulo}</p>

            {/* Tres columnas en el teléfono y no cuatro: con cuatro la celda
                  queda en 58px y "Combustible" se parte en "Combusti/ble".
                  `hyphens-auto` cubre lo que igual no entre —el documento
                  declara lang="es", así que corta donde corresponde y con
                  guion, en vez de tajear la palabra al medio. */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-2 gap-y-4">
              {lista.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { setEdicion({ modo: 'existente', cat }); setError(''); }}
                  className="flex flex-col items-center gap-1.5 group"
                  title={cat.usos > 0 ? `${cat.usos} movimientos` : 'Sin movimientos todavía'}
                >
                  <span className="relative">
                    <CategoryIcon
                      icon={cat.icon} color={cat.color} type={cat.type}
                      className="group-hover:brightness-125 transition-all"
                    />
                    {/* Cuántas cuelgan. Sin esto no hay forma de saber cuáles
                        tienen segundo nivel sin abrirlas una por una. */}
                    {subDe(cat.id).length > 0 && (
                      <span className="absolute -bottom-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-slate-700 border border-slate-900 text-[9px] text-slate-300 flex items-center justify-center tabular-nums">
                        {subDe(cat.id).length}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-slate-300 leading-tight text-center line-clamp-2 w-full break-words hyphens-auto">
                    {cat.name}
                  </span>
                </button>
              ))}

              {/* Agregar, como una más de la grilla: es donde la mano ya está
                  mirando, en vez de un botón arriba a la derecha. */}
              <button
                onClick={() => { setEdicion({ modo: 'nueva', type }); setError(''); }}
                className="flex flex-col items-center gap-1.5 group"
              >
                <span className="w-11 h-11 rounded-full border border-dashed border-slate-600 group-hover:border-emerald-500 flex items-center justify-center transition-colors">
                  <Plus className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                </span>
                <span className="text-[11px] text-slate-400 leading-tight">Agregar</span>
              </button>
            </div>

            {editandoAcá && (
              <EditorDeCategoria
                type={type}
                ledgerId={ledgerId}
                onListo={async () => { setEdicion(null); await refrescar(); }}
                onCancelar={() => setEdicion(null)}
                onError={setError}
              />
            )}
          </div>
        );
      })}

      {edicion?.modo === 'existente' && (
        <EditorDeCategoria
          cat={edicion.cat}
          type={edicion.cat.type}
          ledgerId={ledgerId}
          subcategorias={subDe(edicion.cat.id)}
          onRefrescar={refrescar}
          onListo={async () => { setEdicion(null); await refrescar(); }}
          onCancelar={() => setEdicion(null)}
          onError={setError}
        />
      )}

      <div className="text-xs text-slate-500 space-y-1.5">
        <p>
          Las categorías son de la cuenta, no tuyas: en una cuenta compartida las
          ven los dos y alcanza con crearlas una vez.
        </p>
        <p>
          Una categoría con movimientos no se puede borrar —quedarían con un
          nombre que ya no existe—, pero sí renombrar: los movimientos se
          renombran con ella.
        </p>
      </div>
    </div>
  );
}

/** El formulario de alta y de edición, que es el mismo. */
function EditorDeCategoria({
  cat, type, ledgerId, subcategorias = [], onRefrescar, onListo, onCancelar, onError,
}: {
  cat?: CategoryWithUsage;
  type: TransactionType;
  ledgerId: string | null;
  /** Las que cuelgan de esta. Solo en edición: una nueva todavía no tiene id. */
  subcategorias?: CategoryWithUsage[];
  onRefrescar?: () => Promise<void>;
  onListo: () => void | Promise<void>;
  onCancelar: () => void;
  onError: (m: string) => void;
}) {
  const [nombre, setNombre] = useState(cat?.name ?? '');
  const [elegido, setElegido] = useState<string | null>(cat?.icon ?? null);
  const [color, setColor] = useState<string | null>(cat?.color ?? null);
  const [ocupado, setOcupado] = useState(false);

  /*
   * Mientras no se toque el selector, el ícono se adivina del nombre: escribir
   * "Combustible" ya deja puesto el surtidor. Después de tocarlo manda lo
   * elegido y la sugerencia no vuelve a pisarlo, aunque se siga escribiendo.
   *
   * Una categoría que ya tenía ícono cuenta como elegida: lo que está guardado
   * es una decisión tomada, no un vacío que haya que completar.
   */
  const [tocado, setTocado] = useState(cat?.icon != null);
  const icono = tocado ? elegido : sugerirIcono(nombre);

  const guardar = async () => {
    const name = nombre.trim();
    if (!name) return;
    setOcupado(true);
    onError('');
    try {
      const res = await fetch(cat ? `/api/categories/${cat.id}` : '/api/categories', {
        method: cat ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          cat
            ? { name, icon: icono, color }
            : { name, type, ledger_id: ledgerId, icon: icono, color },
        ),
      });
      const datos = await res.json();
      if (!res.ok) { onError(datos.error ?? 'No se pudo guardar'); return; }
      await onListo();
    } catch {
      onError('No se pudo guardar');
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async () => {
    if (!cat) return;
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    setOcupado(true);
    onError('');
    try {
      const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' });
      const datos = await res.json();
      if (!res.ok) { onError(datos.error ?? 'No se pudo eliminar'); return; }
      await onListo();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="border border-slate-800 rounded-xl p-3 space-y-3 bg-slate-950/40">
      {/* La vista previa al lado del nombre: se ve cómo va a quedar mientras se
          elige, sin tener que guardar para enterarse. */}
      <div className="flex items-center gap-3">
        <CategoryIcon icon={icono} color={color} type={type} />
        <input
          type="text"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } }}
          placeholder="Nombre de la categoría"
          autoFocus
          maxLength={40}
          className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      <IconPicker
        icon={icono} color={color} type={type}
        onIcon={clave => { setElegido(clave); setTocado(true); }}
        onColor={setColor}
      />

      {/* Solo al editar una que ya existe: una subcategoría necesita el id de su
          padre, y una categoría que todavía no se guardó no lo tiene. */}
      {cat && onRefrescar && (
        <Subcategorias
          padre={cat}
          lista={subcategorias}
          onCambio={onRefrescar}
          onError={onError}
        />
      )}

      <div className="flex gap-2">
        {cat && (
          <button
            onClick={borrar}
            disabled={ocupado}
            title={cat.usos > 0 ? `La usan ${cat.usos} movimientos` : 'Eliminar'}
            className="px-3 py-2.5 bg-slate-800 hover:bg-rose-600 disabled:opacity-50 text-slate-300 hover:text-white rounded-lg text-sm transition-colors flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onCancelar}
          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={ocupado || !nombre.trim()}
          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
        >
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Guardar
        </button>
      </div>
    </div>
  );
}

/**
 * Las subcategorías de una categoría: agregar, renombrar y borrar.
 *
 * Guarda de inmediato, sin esperar al "Guardar" de arriba: son filas propias en
 * la base, no campos de esta. Mezclarlas en el mismo botón haría creer que
 * cancelar deshace también lo que se agregó acá.
 */
function Subcategorias({
  padre, lista, onCambio, onError,
}: {
  padre: CategoryWithUsage;
  lista: CategoryWithUsage[];
  onCambio: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState('');

  const agregar = async () => {
    const name = nueva.trim();
    if (!name) return;
    setOcupado('nueva');
    onError('');
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, type: padre.type, ledger_id: padre.ledger_id, parent_id: padre.id,
        }),
      });
      const datos = await res.json();
      if (!res.ok) { onError(datos.error ?? 'No se pudo crear'); return; }
      setNueva('');
      await onCambio();
    } finally {
      setOcupado('');
    }
  };

  const borrar = async (sub: CategoryWithUsage) => {
    if (!confirm(`¿Eliminar "${sub.name}"?`)) return;
    setOcupado(sub.id);
    onError('');
    try {
      const res = await fetch(`/api/categories/${sub.id}`, { method: 'DELETE' });
      const datos = await res.json();
      if (!res.ok) { onError(datos.error ?? 'No se pudo eliminar'); return; }
      await onCambio();
    } finally {
      setOcupado('');
    }
  };

  return (
    <div className="space-y-2 pt-1 border-t border-slate-800">
      <p className="text-[11px] text-slate-500 uppercase tracking-wider pt-2">
        Detalle de {padre.name}
      </p>

      {lista.length === 0 && (
        <p className="text-xs text-slate-600">
          Sin detalle todavía. Al anotar un gasto en {padre.name} vas a poder
          elegir entre lo que agregues acá.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {lista.map(sub => (
          <span
            key={sub.id}
            className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg pl-2.5 pr-1 py-1"
          >
            <span className="text-xs text-slate-200">{sub.name}</span>
            <button
              type="button"
              onClick={() => borrar(sub)}
              disabled={ocupado === sub.id}
              aria-label={`Eliminar ${sub.name}`}
              className="p-0.5 text-slate-500 hover:text-rose-400 disabled:opacity-50 transition-colors"
            >
              {ocupado === sub.id
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <X className="w-3 h-3" />}
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={nueva}
          onChange={e => setNueva(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
          placeholder={`Agregar a ${padre.name}`}
          maxLength={40}
          className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={agregar}
          disabled={ocupado === 'nueva' || !nueva.trim()}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-sm transition-colors flex-shrink-0"
        >
          {ocupado === 'nueva' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
