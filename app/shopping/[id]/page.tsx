'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Loader2, AlertCircle, Trash2, Check, ChevronDown, ShoppingCart, Receipt,
} from 'lucide-react';
import { useFormatters } from '@/components/SettingsContext';
import { useLedger } from '@/components/LedgerContext';
import { useCategories } from '@/components/CategoriesContext';
import { PASILLOS, ShoppingItem, ShoppingListDetail, UNIDADES } from '@/lib/types';

export default function ShoppingListPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fmt = useFormatters();
  const { notifyTransactionSaved } = useLedger();
  const { categorias } = useCategories();

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

  /**
   * Tildar es lo que más se toca, parado en el pasillo. Se pinta al instante y
   * se manda al servidor después: esperar la respuesta con datos móviles hace
   * que parezca que el toque no registró y la gente toca dos veces.
   */
  const tildar = async (item: ShoppingItem) => {
    setLista(l => l && {
      ...l,
      articulos: l.articulos.map(a => a.id === item.id ? { ...a, checked: !a.checked } : a),
    });
    await fetch(`/api/shopping/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: !item.checked }),
    });
    await cargar();
  };

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

  // Por pasillo, en el orden en que se camina el súper. Los pasillos que no
  // están en la lista sugerida van al final, por nombre.
  const porCategoria = useMemo(() => {
    const grupos = new Map<string, ShoppingItem[]>();
    for (const a of lista?.articulos ?? []) {
      grupos.set(a.category, [...(grupos.get(a.category) ?? []), a]);
    }
    return [...grupos.entries()].sort(([a], [b]) => {
      const ia = PASILLOS.indexOf(a);
      const ib = PASILLOS.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b, 'es');
    });
  }, [lista]);

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
          <ArrowLeft className="w-4 h-4" /> Listas
        </Link>
        <p className="text-sm text-rose-400">{error || 'Esa lista no existe.'}</p>
      </div>
    );
  }

  const avance = lista.total > 0 ? Math.round((lista.checkedTotal / lista.total) * 100) : 0;
  const falta = lista.total - lista.checkedTotal;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pt-14 md:pt-0">
      <Link href="/shopping" className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 w-fit">
        <ArrowLeft className="w-4 h-4" /> Listas
      </Link>

      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{lista.name}</h1>
        <p className="text-slate-400 text-sm">
          {lista.closed ? 'Ya comprada' : `${lista.checkedItems} de ${lista.items} artículos`}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* El total del carrito: el número por el que se abre esta pantalla en el
          súper. Grande y arriba, no escondido al final de la lista. */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">
              {lista.closed ? 'Pagado' : 'En el carrito'}
            </p>
            <p className="text-2xl font-bold text-emerald-400 tabular-nums">
              {fmt.money(lista.closed && lista.paid_amount != null ? lista.paid_amount : lista.checkedTotal)}
            </p>
          </div>
          {!lista.closed && falta > 0 && (
            <div className="text-right flex-shrink-0">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Falta</p>
              <p className="text-sm text-slate-300 tabular-nums">{fmt.money(falta)}</p>
            </div>
          )}
        </div>
        {!lista.closed && lista.items > 0 && (
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(avance, 100)}%` }} />
          </div>
        )}
        {/* Cerrada: lo planeado contra lo pagado es el dato que se viene a
            buscar después, y la diferencia es todo el punto del control. */}
        {lista.closed && lista.paid_amount != null ? (
          <p className="text-xs text-slate-500">
            La lista sumaba {fmt.money(lista.checkedTotal)}
            {Math.abs(lista.paid_amount - lista.checkedTotal) >= 0.01 && (
              <span className={lista.paid_amount > lista.checkedTotal ? 'text-amber-400' : 'text-emerald-400'}>
                {' '}· {lista.paid_amount > lista.checkedTotal ? 'pagaste' : 'te ahorraste'}{' '}
                {fmt.money(Math.abs(lista.paid_amount - lista.checkedTotal))}
                {lista.paid_amount > lista.checkedTotal ? ' de más' : ''}
              </span>
            )}
          </p>
        ) : (
          <p className="text-xs text-slate-500">Lista completa: {fmt.money(lista.total)}</p>
        )}
      </div>

      {!lista.closed && <AgregarArticulo listId={lista.id} onListo={cargar} />}

      {lista.articulos.length === 0 ? (
        <div className="text-center py-10 text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
          <ShoppingCart className="w-8 h-8 mx-auto mb-3 text-slate-600" />
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
                <FilaArticulo
                  key={a.id}
                  item={a}
                  bloqueada={lista.closed}
                  fmt={fmt}
                  onTildar={() => tildar(a)}
                  onEditar={cambios => editarItem(a.id, cambios)}
                  onBorrar={() => borrarItem(a.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {!lista.closed && lista.checkedItems > 0 && (
        <CerrarLista
          lista={lista}
          categorias={[...new Set(categorias.filter(c => c.type === 'expense').map(c => c.name))].sort()}
          onCerrada={async () => { notifyTransactionSaved(); await cargar(); }}
        />
      )}

      {lista.closed && lista.transaction_id && (
        <Link
          href="/transactions"
          className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 transition-colors"
        >
          <Receipt className="w-4 h-4 flex-shrink-0" />
          Esta compra ya quedó anotada como gasto. Ver en movimientos.
        </Link>
      )}

      {!lista.closed && (
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
      )}
    </div>
  );
}

// ─── Una fila ─────────────────────────────────────────────────────────────────

function FilaArticulo({
  item, bloqueada, fmt, onTildar, onEditar, onBorrar,
}: {
  item: ShoppingItem;
  bloqueada: boolean;
  fmt: { money: (n: number) => string };
  onTildar: () => void;
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

  const subtotal = item.quantity * item.unit_price;

  return (
    <div className={`bg-slate-900 border rounded-xl transition-colors ${
      item.checked ? 'border-emerald-500/20' : 'border-slate-800'
    }`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Objetivo táctil grande: esto se toca con una mano, empujando un carrito. */}
        <button
          onClick={onTildar}
          disabled={bloqueada}
          aria-label={item.checked ? `Desmarcar ${item.name}` : `Marcar ${item.name} como comprado`}
          aria-pressed={item.checked}
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 ${
            item.checked ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-600 active:bg-slate-700'
          }`}
        >
          <Check className="w-5 h-5" />
        </button>

        <button
          onClick={() => bloqueada ? undefined : (abierta ? setAbierta(false) : abrir())}
          disabled={bloqueada}
          className="flex-1 min-w-0 text-left"
        >
          <p className={`text-sm truncate ${item.checked ? 'text-slate-500 line-through' : 'text-white'}`}>
            {item.name}
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            {item.quantity} {item.unit}
            {item.unit_price > 0 && ` × ${fmt.money(item.unit_price)}`}
          </p>
        </button>

        <p className={`text-sm flex-shrink-0 tabular-nums ${item.checked ? 'text-emerald-400' : 'text-slate-300'}`}>
          {fmt.money(subtotal)}
        </p>
      </div>

      {abierta && !bloqueada && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-800 pt-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1 min-w-0">
              <label className="text-[11px] text-slate-500">Cantidad</label>
              <input
                type="number" min="0" step="0.001" inputMode="decimal"
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <label className="text-[11px] text-slate-500">Unidad</label>
              <div className="relative">
                <select
                  value={unidad}
                  onChange={e => setUnidad(e.target.value)}
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
                value={precio}
                onChange={e => setPrecio(e.target.value)}
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

// ─── Alta rápida ──────────────────────────────────────────────────────────────

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
      // El nombre se limpia pero el pasillo no: se cargan varias cosas del
      // mismo estante seguidas, y volver a elegirlo cada vez es un toque de más.
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
      <p className="text-xs text-slate-500">
        La cantidad y el precio se ponen tocando el artículo — podés dejarlos para la góndola.
      </p>
    </div>
  );
}

// ─── Cerrar ───────────────────────────────────────────────────────────────────

function CerrarLista({
  lista, categorias, onCerrada,
}: {
  lista: ShoppingListDetail;
  categorias: string[];
  onCerrada: () => Promise<void>;
}) {
  const fmt = useFormatters();
  const [abierto, setAbierto] = useState(false);
  // "Alimentación" es donde cae la compra del súper en casi todos los casos.
  const [categoria, setCategoria] = useState(
    categorias.find(c => /aliment|super|comida|mercado/i.test(c)) ?? categorias[0] ?? '',
  );
  // Arranca en lo tildado y se corrige con lo que diga el ticket.
  const [monto, setMonto] = useState(String(lista.checkedTotal));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const abrir = () => {
    setMonto(String(lista.checkedTotal));
    setAbierto(true);
  };

  const cerrar = async () => {
    setGuardando(true);
    setError('');
    try {
      const res = await fetch(`/api/shopping/${lista.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoria, amount: monto }),
      });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo cerrar'); return; }
      await onCerrada();
    } finally {
      setGuardando(false);
    }
  };

  const cobrado = Number(monto);
  const diferencia = Number.isFinite(cobrado) ? cobrado - lista.checkedTotal : 0;

  if (!abierto) {
    return (
      <button
        onClick={abrir}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        <Receipt className="w-4 h-4" />
        Terminé — anotar {fmt.money(lista.checkedTotal)} como gasto
      </button>
    );
  }

  return (
    <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-white">Anotar la compra</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Se registra como gasto del {lista.date}. Los {lista.items - lista.checkedItems} artículos
          sin tildar no se cuentan.
        </p>
      </div>

      {/* El monto se puede corregir: en la caja aparecen impuestos, una oferta o
          un precio distinto al de la góndola, y lo que vale es el ticket. */}
      <div className="space-y-1">
        <label className="text-xs text-slate-500">Monto pagado</label>
        <input
          type="number" min="0" step="0.01" inputMode="decimal"
          value={monto}
          onChange={e => setMonto(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
        />
        <p className="text-xs text-slate-500">
          La lista sumaba {fmt.money(lista.checkedTotal)}
          {Math.abs(diferencia) >= 0.01 && (
            <span className={diferencia > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {' '}· {diferencia > 0 ? 'pagaste' : 'te ahorraste'} {fmt.money(Math.abs(diferencia))} {diferencia > 0 ? 'de más' : ''}
            </span>
          )}
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-500">Categoría del gasto</label>
        <div className="relative">
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
          >
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => setAbierto(false)}
          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
        >
          Todavía no
        </button>
        <button
          onClick={cerrar}
          disabled={guardando || !categoria || !Number.isFinite(cobrado) || cobrado <= 0}
          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Anotar gasto
        </button>
      </div>
    </div>
  );
}
