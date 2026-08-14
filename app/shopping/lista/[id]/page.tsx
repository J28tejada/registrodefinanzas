'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Loader2, AlertCircle, Trash2, Check, ChevronDown, ClipboardList,
} from 'lucide-react';
import { useFormatters } from '@/components/SettingsContext';
import { PASILLOS, ShoppingItem, ShoppingListDetail, UNIDADES } from '@/lib/types';
import { agruparPorPasillo } from '@/lib/compras';

/**
 * La plantilla: se edita sentado en casa, no en el súper.
 *
 * Acá no hay tildes ni "en el carrito": eso es de la compra. Lo único que vive
 * acá es qué se suele comprar y a cuánto salía la última vez.
 */
export default function ListaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fmt = useFormatters();

  const [lista, setLista] = useState<ShoppingListDetail | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/shopping/${id}`);
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo cargar la lista'); return; }
      setLista(datos);
      setError('');
    } catch {
      setError('No se pudo cargar la lista');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const editarItem = async (itemId: string, cambios: Record<string, unknown>) => {
    setError('');
    const res = await fetch(`/api/shopping/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    });
    if (!res.ok) { setError((await res.json()).error ?? 'No se pudo guardar'); return false; }
    await cargar();
    return true;
  };

  const borrarItem = async (itemId: string) => {
    await fetch(`/api/shopping/items/${itemId}`, { method: 'DELETE' });
    await cargar();
  };

  const porCategoria = useMemo(() => agruparPorPasillo(lista?.articulos ?? []), [lista]);

  if (cargando) {
    return (
      <div className="max-w-2xl mx-auto pt-14 md:pt-0 flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!lista) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pt-14 md:pt-0">
        <Link href="/shopping" className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Supermercado
        </Link>
        <p className="text-sm text-rose-400">{error || 'Esa lista no existe.'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pt-14 md:pt-0">
      <Link href="/shopping" className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 w-fit">
        <ArrowLeft className="w-4 h-4" /> Supermercado
      </Link>

      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{lista.name}</h1>
        <p className="text-slate-400 text-sm">
          Lista · {lista.items} {lista.items === 1 ? 'artículo' : 'artículos'}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Costaría</p>
          <p className="text-xl font-bold text-white tabular-nums">{fmt.money(lista.total)}</p>
        </div>
        <p className="text-xs text-slate-500 text-right">
          A precios de referencia.<br />En el súper puede cambiar.
        </p>
      </div>

      <AgregarArticulo listId={lista.id} onListo={cargar} />

      {lista.articulos.length === 0 ? (
        <div className="text-center py-10 text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
          <ClipboardList className="w-8 h-8 mx-auto mb-3 text-slate-600" />
          <p className="text-sm">La lista está vacía.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {porCategoria.map(([categoria, articulos]) => (
            <div key={categoria} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 px-1">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider truncate">{categoria}</p>
                <p className="text-xs text-slate-600 tabular-nums flex-shrink-0">
                  {fmt.money(articulos.reduce((s, a) => s + a.quantity * a.unit_price, 0))}
                </p>
              </div>
              {articulos.map(a => (
                <FilaPlantilla
                  key={a.id}
                  item={a}
                  fmt={fmt}
                  onEditar={cambios => editarItem(a.id, cambios)}
                  onBorrar={() => borrarItem(a.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={async () => {
          if (!confirm(`¿Eliminar la lista "${lista.name}" con todos sus artículos?`)) return;
          await fetch(`/api/shopping/${lista.id}`, { method: 'DELETE' });
          router.push('/shopping');
        }}
        className="w-full py-2 text-rose-400 hover:bg-rose-500/10 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
      >
        <Trash2 className="w-3.5 h-3.5" /> Eliminar esta lista
      </button>
    </div>
  );
}

function FilaPlantilla({
  item, fmt, onEditar, onBorrar,
}: {
  item: ShoppingItem;
  fmt: { money: (n: number) => string };
  onEditar: (cambios: Record<string, unknown>) => Promise<boolean>;
  onBorrar: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [cantidad, setCantidad] = useState(String(item.quantity));
  const [precio, setPrecio] = useState(String(item.unit_price));
  const [unidad, setUnidad] = useState(item.unit);
  const [guardando, setGuardando] = useState(false);

  const abrir = () => {
    setCantidad(String(item.quantity));
    setPrecio(String(item.unit_price));
    setUnidad(item.unit);
    setAbierta(true);
  };

  const guardar = async () => {
    setGuardando(true);
    const ok = await onEditar({ quantity: Number(cantidad), unit_price: Number(precio), unit: unidad });
    setGuardando(false);
    if (ok) setAbierta(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl">
      <button
        onClick={() => abierta ? setAbierta(false) : abrir()}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{item.name}</p>
          <p className="text-xs text-slate-500 tabular-nums">
            {item.quantity} {item.unit}
            {item.unit_price > 0 && ` × ${fmt.money(item.unit_price)}`}
          </p>
        </div>
        <p className="text-sm text-slate-300 flex-shrink-0 tabular-nums">
          {fmt.money(item.quantity * item.unit_price)}
        </p>
      </button>

      {abierta && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-800 pt-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1 min-w-0">
              <label className="text-[11px] text-slate-500">Cantidad</label>
              <input
                type="number" min="0" step="0.001" inputMode="decimal"
                value={cantidad} onChange={e => setCantidad(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <label className="text-[11px] text-slate-500">Unidad</label>
              <div className="relative">
                <select
                  value={unidad} onChange={e => setUnidad(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 pr-6 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
                >
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-1 min-w-0">
              <label className="text-[11px] text-slate-500">Precio c/u</label>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={precio} onChange={e => setPrecio(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onBorrar}
              className="px-3 py-2 text-rose-400 hover:bg-rose-500/10 rounded-lg text-xs transition-colors flex items-center gap-1.5 flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" /> Quitar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AgregarArticulo({ listId, onListo }: { listId: string; onListo: () => Promise<void> }) {
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState(PASILLOS[0]);
  const [guardando, setGuardando] = useState(false);

  const agregar = async () => {
    const name = nombre.trim();
    if (!name) return;
    setGuardando(true);
    try {
      await fetch(`/api/shopping/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category: categoria }),
      });
      // El pasillo no se limpia: se cargan varias cosas del mismo estante
      // seguidas, y volver a elegirlo cada vez es un toque de más.
      setNombre('');
      await onListo();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') agregar(); }}
          placeholder="Agregar artículo…"
          maxLength={60}
          className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <button
          onClick={agregar}
          disabled={guardando || !nombre.trim()}
          aria-label="Agregar"
          className="px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center flex-shrink-0"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
      <div className="relative">
        <select
          value={categoria}
          onChange={e => setCategoria(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 appearance-none"
        >
          {PASILLOS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}
