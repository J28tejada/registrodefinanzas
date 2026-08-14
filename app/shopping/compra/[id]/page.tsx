'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Loader2, AlertCircle, Trash2, Check, ChevronDown, ShoppingCart,
  Receipt, RefreshCw,
} from 'lucide-react';
import { useFormatters } from '@/components/SettingsContext';
import { useLedger } from '@/components/LedgerContext';
import { useCategories } from '@/components/CategoriesContext';
import { PASILLOS, ShoppingTripDetail, ShoppingTripItem, UNIDADES } from '@/lib/types';
import { agruparPorPasillo } from '@/lib/compras';

/**
 * La compra: esta pantalla se usa parado en un pasillo, con una mano.
 *
 * Todo lo que se toca acá pertenece a esta compra y a ninguna otra. Cambiar un
 * precio no toca la lista de la que salió — para eso está el botón explícito
 * del final, que es una decisión aparte.
 */
export default function CompraPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fmt = useFormatters();
  const { notifyTransactionSaved } = useLedger();
  const { categorias } = useCategories();

  const [compra, setCompra] = useState<ShoppingTripDetail | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${id}`);
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo cargar la compra'); return; }
      setCompra(datos);
      setError('');
    } catch {
      setError('No se pudo cargar la compra');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  /**
   * Tildar es lo que más se toca. Se pinta al instante y se manda al servidor
   * después: esperar la respuesta con datos móviles hace que parezca que el
   * toque no registró y la gente toca dos veces.
   */
  const tildar = async (item: ShoppingTripItem) => {
    setCompra(c => c && {
      ...c,
      articulos: c.articulos.map(a => a.id === item.id ? { ...a, checked: !a.checked } : a),
    });
    await fetch(`/api/trips/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: !item.checked }),
    });
    await cargar();
  };

  const editarItem = async (itemId: string, cambios: Record<string, unknown>) => {
    setError('');
    const res = await fetch(`/api/trips/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    });
    if (!res.ok) { setError((await res.json()).error ?? 'No se pudo guardar'); return false; }
    await cargar();
    return true;
  };

  const borrarItem = async (itemId: string) => {
    await fetch(`/api/trips/items/${itemId}`, { method: 'DELETE' });
    await cargar();
  };

  const porCategoria = useMemo(() => agruparPorPasillo(compra?.articulos ?? []), [compra]);

  if (cargando) {
    return (
      <div className="max-w-2xl mx-auto pt-14 md:pt-0 flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!compra) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pt-14 md:pt-0">
        <Link href="/shopping" className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Supermercado
        </Link>
        <p className="text-sm text-rose-400">{error || 'Esa compra no existe.'}</p>
      </div>
    );
  }

  const avance = compra.total > 0 ? Math.round((compra.checkedTotal / compra.total) * 100) : 0;
  const falta = compra.total - compra.checkedTotal;
  const pagado = compra.closed && compra.paid_amount != null ? compra.paid_amount : compra.checkedTotal;
  const desvio = pagado - compra.plannedTotal;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pt-14 md:pt-0">
      <Link href="/shopping" className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 w-fit">
        <ArrowLeft className="w-4 h-4" /> Supermercado
      </Link>

      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{compra.name}</h1>
        <p className="text-slate-400 text-sm">
          {compra.closed ? `Comprada el ${compra.date}` : `${compra.checkedItems} de ${compra.items} artículos`}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {aviso && (
        <div className="flex items-start gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      {/* El número por el que se abre esta pantalla en el súper. */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">
              {compra.closed ? 'Pagado' : 'En el carrito'}
            </p>
            <p className="text-2xl font-bold text-emerald-400 tabular-nums">{fmt.money(pagado)}</p>
          </div>
          {!compra.closed && falta > 0 && (
            <div className="text-right flex-shrink-0">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Falta</p>
              <p className="text-sm text-slate-300 tabular-nums">{fmt.money(falta)}</p>
            </div>
          )}
        </div>

        {!compra.closed && compra.items > 0 && (
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(avance, 100)}%` }} />
          </div>
        )}

        {/* Contra la lista: es el control que se busca. Cuánto se despegó lo
            real de lo planeado, no cuánto se planeó. */}
        {compra.plannedTotal > 0 && Math.abs(desvio) >= 0.01 ? (
          <p className="text-xs text-slate-500">
            La lista decía {fmt.money(compra.plannedTotal)}
            <span className={desvio > 0 ? ' text-amber-400' : ' text-emerald-400'}>
              {' '}· {desvio > 0 ? 'vas' : 'vas'} {fmt.money(Math.abs(desvio))} {desvio > 0 ? 'por encima' : 'por debajo'}
            </span>
          </p>
        ) : (
          <p className="text-xs text-slate-500">Toda la compra: {fmt.money(compra.total)}</p>
        )}
      </div>

      {!compra.closed && <AgregarArticulo tripId={compra.id} onListo={cargar} />}

      {compra.articulos.length === 0 ? (
        <div className="text-center py-10 text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
          <ShoppingCart className="w-8 h-8 mx-auto mb-3 text-slate-600" />
          <p className="text-sm">Esta compra está vacía.</p>
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
                <FilaCompra
                  key={a.id}
                  item={a}
                  bloqueada={compra.closed}
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

      {!compra.closed && compra.checkedItems > 0 && (
        <CerrarCompra
          compra={compra}
          categorias={[...new Set(categorias.filter(c => c.type === 'expense').map(c => c.name))].sort()}
          onCerrada={async () => { notifyTransactionSaved(); await cargar(); }}
        />
      )}

      {compra.closed && compra.transaction_id && (
        <Link
          href="/transactions"
          className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 transition-colors"
        >
          <Receipt className="w-4 h-4 flex-shrink-0" />
          Ya quedó anotada como gasto. Ver en movimientos.
        </Link>
      )}

      {/* El camino de vuelta, explícito: la lista no se actualiza sola porque un
          día pagaste más caro, pero cuando el precio vino para quedarse,
          corregir artículo por artículo a mano no lo hace nadie. */}
      {compra.list_id && (
        <button
          onClick={async () => {
            setError(''); setAviso('');
            const res = await fetch(`/api/trips/${compra.id}/sync-prices`, { method: 'POST' });
            const datos = await res.json();
            if (!res.ok) { setError(datos.error ?? 'No se pudo actualizar'); return; }
            setAviso(datos.actualizados === 0
              ? 'La lista ya tenía estos precios.'
              : `Se actualizaron ${datos.actualizados} ${datos.actualizados === 1 ? 'precio' : 'precios'} en la lista.`);
          }}
          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Guardar estos precios en la lista
        </button>
      )}

      {!compra.closed && (
        <button
          onClick={async () => {
            if (!confirm(`¿Descartar la compra "${compra.name}"? La lista de la que salió no se toca.`)) return;
            await fetch(`/api/trips/${compra.id}`, { method: 'DELETE' });
            router.push('/shopping');
          }}
          className="w-full py-2 text-rose-400 hover:bg-rose-500/10 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" /> Descartar esta compra
        </button>
      )}
    </div>
  );
}

// ─── Una fila ─────────────────────────────────────────────────────────────────

function FilaCompra({
  item, bloqueada, fmt, onTildar, onEditar, onBorrar,
}: {
  item: ShoppingTripItem;
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

  // Qué cambió respecto de la lista. Null = se agregó sobre la marcha.
  const subioPrecio = item.planned_unit_price != null
    && Math.abs(item.unit_price - item.planned_unit_price) >= 0.01;

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
            {item.planned_unit_price == null && (
              <span className="text-[10px] text-sky-400 ml-1.5">nuevo</span>
            )}
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            {item.quantity} {item.unit}
            {item.unit_price > 0 && ` × ${fmt.money(item.unit_price)}`}
            {subioPrecio && (
              <span className={item.unit_price > item.planned_unit_price! ? 'text-amber-400' : 'text-emerald-400'}>
                {' '}(antes {fmt.money(item.planned_unit_price!)})
              </span>
            )}
          </p>
        </button>

        <p className={`text-sm flex-shrink-0 tabular-nums ${item.checked ? 'text-emerald-400' : 'text-slate-300'}`}>
          {fmt.money(item.quantity * item.unit_price)}
        </p>
      </div>

      {abierta && !bloqueada && (
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
          <p className="text-[11px] text-slate-500">
            Esto cambia solo esta compra. La lista queda como está.
          </p>
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

function AgregarArticulo({ tripId, onListo }: { tripId: string; onListo: () => Promise<void> }) {
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState(PASILLOS[0]);
  const [guardando, setGuardando] = useState(false);

  const agregar = async () => {
    const name = nombre.trim();
    if (!name) return;
    setGuardando(true);
    try {
      await fetch(`/api/trips/${tripId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category: categoria }),
      });
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
          placeholder="Agregar algo que no estaba…"
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

// ─── Cerrar ───────────────────────────────────────────────────────────────────

function CerrarCompra({
  compra, categorias, onCerrada,
}: {
  compra: ShoppingTripDetail;
  categorias: string[];
  onCerrada: () => Promise<void>;
}) {
  const fmt = useFormatters();
  const [abierto, setAbierto] = useState(false);
  // "Alimentación" es donde cae la compra del súper en casi todos los casos.
  const [categoria, setCategoria] = useState(
    categorias.find(c => /aliment|super|comida|mercado/i.test(c)) ?? categorias[0] ?? '',
  );
  const [monto, setMonto] = useState(String(compra.checkedTotal));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const abrir = () => { setMonto(String(compra.checkedTotal)); setAbierto(true); };

  const cerrar = async () => {
    setGuardando(true);
    setError('');
    try {
      const res = await fetch(`/api/trips/${compra.id}/close`, {
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
  const diferencia = Number.isFinite(cobrado) ? cobrado - compra.checkedTotal : 0;

  if (!abierto) {
    return (
      <button
        onClick={abrir}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        <Receipt className="w-4 h-4" />
        Pasé por caja — anotar el gasto
      </button>
    );
  }

  return (
    <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-white">Anotar la compra</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Se registra como gasto del {compra.date}. Los {compra.items - compra.checkedItems} artículos
          sin tildar no se cuentan.
        </p>
      </div>

      {/* El ticket manda: acá aparecen impuestos, ofertas y precios distintos a
          los de la góndola. */}
      <div className="space-y-1">
        <label className="text-xs text-slate-500">Monto pagado</label>
        <input
          type="number" min="0" step="0.01" inputMode="decimal"
          value={monto}
          onChange={e => setMonto(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
        />
        <p className="text-xs text-slate-500">
          El carrito sumaba {fmt.money(compra.checkedTotal)}
          {Math.abs(diferencia) >= 0.01 && (
            <span className={diferencia > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {' '}· {diferencia > 0 ? 'pagaste' : 'te ahorraste'} {fmt.money(Math.abs(diferencia))}
              {diferencia > 0 ? ' de más' : ''}
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
