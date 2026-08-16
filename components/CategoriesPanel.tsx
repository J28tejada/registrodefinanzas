'use client';

import { useState } from 'react';
import { Tags, Plus, Pencil, Trash2, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { useCategories } from './CategoriesContext';
import { CategoryWithUsage, TransactionScope, TransactionType } from '@/lib/types';

const GRUPOS: { type: TransactionType; scope: TransactionScope; titulo: string }[] = [
  { type: 'expense', scope: 'personal', titulo: 'Gastos personales' },
  { type: 'income', scope: 'personal', titulo: 'Ingresos personales' },
  { type: 'expense', scope: 'business', titulo: 'Gastos del negocio' },
  { type: 'income', scope: 'business', titulo: 'Ingresos del negocio' },
];

/**
 * Crear, renombrar y borrar categorías.
 *
 * Renombrar arrastra los movimientos que ya la usaban; borrar solo se puede si
 * no la usa ninguno. Por eso cada fila muestra en cuántos se usa: sin ese dato
 * el botón de borrar falla y no se entiende por qué.
 */
export default function CategoriesPanel() {
  const { categorias, cargando, error: errorCarga, refrescar, para } = useCategories();

  const [creandoEn, setCreandoEn] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  // Si la carga falló, el panel se ve vacío y parecería que no hay categorías:
  // alguien las volvería a crear y quedarían duplicadas al recuperarse.
  const aMostrar = error || errorCarga;

  const clave = (t: TransactionType, s: TransactionScope) => `${t}|${s}`;

  const crear = async (type: TransactionType, scope: TransactionScope) => {
    const name = nombreNuevo.trim();
    if (!name) return;
    setOcupado(true);
    setError('');
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, scope }),
      });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo crear'); return; }
      await refrescar();
      setNombreNuevo('');
      setCreandoEn(null);
    } finally {
      setOcupado(false);
    }
  };

  const renombrar = async (cat: CategoryWithUsage) => {
    const name = nombreEditado.trim();
    if (!name || name === cat.name) { setEditando(null); return; }
    setOcupado(true);
    setError('');
    try {
      const res = await fetch(`/api/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo renombrar'); return; }
      await refrescar();
      setEditando(null);
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (cat: CategoryWithUsage) => {
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    setError('');
    const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' });
    const datos = await res.json();
    if (!res.ok) { setError(datos.error ?? 'No se pudo eliminar'); return; }
    await refrescar();
  };

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
          Renombrar una categoría también renombra los movimientos que ya la usaban.
        </p>
      </div>

      {aMostrar && (
        <p className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{aMostrar}</span>
        </p>
      )}

      {GRUPOS.map(({ type, scope, titulo }) => {
        // Las propias primero: son pocas entre treinta que vinieron con la app,
        // y son las que uno viene a tocar.
        const lista = [...para(type, scope)].sort((a, b) =>
          a.origen === b.origen ? a.name.localeCompare(b.name, 'es') : a.origen === 'usuario' ? -1 : 1,
        );
        const k = clave(type, scope);
        return (
          <div key={k} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{titulo}</p>
              <button
                onClick={() => {
                  setCreandoEn(creandoEn === k ? null : k);
                  setNombreNuevo('');
                  setError('');
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>

            {creandoEn === k && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nombreNuevo}
                  onChange={e => setNombreNuevo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crear(type, scope); } }}
                  placeholder="Nombre de la categoría"
                  autoFocus
                  maxLength={40}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => crear(type, scope)}
                  disabled={ocupado || !nombreNuevo.trim()}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
                >
                  Crear
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {lista.length === 0 && (
                <p className="text-xs text-slate-600">Sin categorías en este grupo.</p>
              )}
              {lista.map(cat => (
                editando === cat.id ? (
                  <div key={cat.id} className="flex gap-1 items-center bg-slate-800 rounded-lg px-2 py-1">
                    <input
                      type="text"
                      value={nombreEditado}
                      onChange={e => setNombreEditado(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); renombrar(cat); }
                        if (e.key === 'Escape') setEditando(null);
                      }}
                      autoFocus
                      maxLength={40}
                      className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white w-40 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={() => renombrar(cat)}
                      disabled={ocupado}
                      className="p-1 text-emerald-400 hover:bg-slate-700 rounded"
                      title="Guardar"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditando(null)}
                      className="p-1 text-slate-400 hover:bg-slate-700 rounded"
                      title="Cancelar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    key={cat.id}
                    className={`group flex items-center gap-1.5 rounded-lg pl-3 pr-1.5 py-1.5 border ${
                      cat.origen === 'usuario'
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-slate-800 border-slate-700'
                    }`}
                    title={cat.origen === 'usuario' ? 'La agregaste vos' : 'Vino con la app'}
                  >
                    <span className="text-sm text-slate-200">{cat.name}</span>
                    {cat.usos > 0 && (
                      <span className="text-[10px] text-slate-500" title={`${cat.usos} movimientos`}>
                        {cat.usos}
                      </span>
                    )}
                    <button
                      onClick={() => { setEditando(cat.id); setNombreEditado(cat.name); setError(''); }}
                      className="p-1 text-slate-500 hover:text-white rounded transition-colors"
                      title="Renombrar"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => borrar(cat)}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                      title={cat.usos > 0 ? `La usan ${cat.usos} movimientos` : 'Eliminar'}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )
              ))}
            </div>
          </div>
        );
      })}

      <div className="text-xs text-slate-500 space-y-1.5">
        <p className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-500/10 border border-emerald-500/30 flex-shrink-0" />
          Las que agregaste vos. El resto vino con la app.
        </p>
        <p>
          Tus categorías son solo tuyas: cada persona tiene las suyas, aunque
          compartan una cuenta. Lo que sí ven las dos es en qué categoría quedó
          cada gasto de esa cuenta.
        </p>
        <p>
          Una categoría con movimientos no se puede borrar —quedarían con un
          nombre que ya no existe—, pero sí renombrar.
        </p>
      </div>
    </div>
  );
}
