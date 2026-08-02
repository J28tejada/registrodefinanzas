'use client';

import { useState } from 'react';
import { X, Plus, Check, Pencil, Trash2, LayoutGrid, Users, Crown } from 'lucide-react';
import { useLedger } from './LedgerContext';
import { useFormatters } from './SettingsContext';
import LedgerMembers from './LedgerMembers';
import { Ledger, LedgerWithStats, LedgerColor, LEDGER_COLOR_MAP } from '@/lib/types';

const COLOR_OPTIONS: LedgerColor[] = ['green', 'blue', 'purple', 'orange', 'red', 'teal', 'indigo', 'pink'];

interface LedgerCardProps {
  ledger: LedgerWithStats;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onManageMembers: () => void;
}

function LedgerCard({ ledger, isActive, onSelect, onEdit, onDelete, onManageMembers }: LedgerCardProps) {
  const color = LEDGER_COLOR_MAP[ledger.color];
  const fmt = useFormatters();
  const esDueno = ledger.role === 'owner';
  const compartida = ledger.memberCount > 1;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="rounded-2xl overflow-hidden cursor-pointer relative select-none"
        style={{ aspectRatio: '3/4', background: `linear-gradient(to right, ${color.dark} 28%, ${color.main} 28%)` }}
        onClick={onSelect}
      >
        {/* Inner card highlight */}
        <div
          className="absolute inset-0 opacity-10"
          style={{ background: 'linear-gradient(135deg, white 0%, transparent 60%)' }}
        />

        {/* Active checkmark */}
        {isActive && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center shadow-md">
            <Check className="w-3.5 h-3.5" style={{ color: color.main }} />
          </div>
        )}

        {/* Cuántas personas tienen acceso */}
        {compartida && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/40 rounded-full px-1.5 py-0.5">
            <Users className="w-2.5 h-2.5 text-white" />
            <span className="text-[10px] text-white font-medium">{ledger.memberCount}</span>
          </div>
        )}

        {/* Siempre visibles: en móvil no hay hover */}
        <div className="absolute bottom-2 right-2 flex gap-1">
          <button
            onClick={e => { e.stopPropagation(); onManageMembers(); }}
            title="Personas con acceso"
            className="w-7 h-7 bg-black/40 hover:bg-black/60 rounded-lg flex items-center justify-center transition-colors"
          >
            <Users className="w-3.5 h-3.5 text-white" />
          </button>
          {esDueno && (
            <>
              <button
                onClick={e => { e.stopPropagation(); onEdit(); }}
                title="Editar"
                className="w-7 h-7 bg-black/40 hover:bg-black/60 rounded-lg flex items-center justify-center transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-white" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                title="Eliminar"
                className="w-7 h-7 bg-black/40 hover:bg-rose-500/70 rounded-lg flex items-center justify-center transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-white" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-0.5">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium text-white truncate">{ledger.name}</p>
          {esDueno && <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />}
        </div>
        <p className={`text-xs font-semibold ${ledger.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {fmt.money(ledger.balance)}
        </p>
        <p className="text-xs text-slate-500">{ledger.transactionCount} transacciones</p>
      </div>
    </div>
  );
}

interface LedgerFormProps {
  initial?: Partial<Ledger>;
  onSave: (data: { name: string; color: LedgerColor; type: 'personal' | 'business'; description: string }) => Promise<void>;
  onCancel: () => void;
}

function LedgerForm({ initial, onSave, onCancel }: LedgerFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState<LedgerColor>(initial?.color ?? 'green');
  const [type, setType] = useState<'personal' | 'business'>(initial?.type ?? 'personal');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), color, type, description });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs text-slate-400 font-medium">NOMBRE *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ej: Personal, Negocio, Proyecto..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-slate-400 font-medium">TIPO DE CATEGORÍAS</label>
        <div className="grid grid-cols-2 gap-2">
          {(['personal', 'business'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`py-2 rounded-lg text-sm font-medium transition-all ${
                type === t
                  ? t === 'personal'
                    ? 'bg-violet-500/20 border-2 border-violet-500 text-violet-300'
                    : 'bg-blue-500/20 border-2 border-blue-500 text-blue-300'
                  : 'bg-slate-800 border-2 border-transparent text-slate-400 hover:border-slate-600'
              }`}
            >
              {t === 'personal' ? 'Personal' : 'Negocio'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-slate-400 font-medium">COLOR</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map(c => {
            const col = LEDGER_COLOR_MAP[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : ''}`}
                style={{ backgroundColor: col.main }}
                title={c}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-slate-400 font-medium">DESCRIPCIÓN</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Opcional"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
        />
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

export default function LedgerSelector() {
  const { currentLedger, setCurrentLedger, ledgers, refreshLedgers, selectorOpen, setSelectorOpen } = useLedger();
  const [view, setView] = useState<'list' | 'create' | 'edit' | 'members'>('list');
  const [editingLedger, setEditingLedger] = useState<LedgerWithStats | null>(null);
  const [membersLedger, setMembersLedger] = useState<LedgerWithStats | null>(null);
  const [deleteError, setDeleteError] = useState('');

  if (!selectorOpen) return null;

  const handleClose = () => {
    setSelectorOpen(false);
    setView('list');
    setEditingLedger(null);
    setMembersLedger(null);
    setDeleteError('');
  };

  const handleSelect = (ledger: Ledger | null) => {
    setCurrentLedger(ledger);
    handleClose();
  };

  const handleCreate = async (data: { name: string; color: LedgerColor; type: 'personal' | 'business'; description: string }) => {
    const res = await fetch('/api/ledgers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Error al crear');
    await refreshLedgers();
    setView('list');
  };

  const handleEdit = async (data: { name: string; color: LedgerColor; type: 'personal' | 'business'; description: string }) => {
    if (!editingLedger) return;
    const res = await fetch(`/api/ledgers/${editingLedger.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Error al actualizar');
    // Update currentLedger if it was the one edited
    if (currentLedger?.id === editingLedger.id) {
      setCurrentLedger({ ...currentLedger, ...data });
    }
    await refreshLedgers();
    setView('list');
    setEditingLedger(null);
  };

  const handleDelete = async (ledger: LedgerWithStats) => {
    setDeleteError('');
    if (!confirm(`¿Eliminar la cuenta "${ledger.name}"?`)) return;
    const res = await fetch(`/api/ledgers/${ledger.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      setDeleteError(json.error ?? 'Error al eliminar');
      return;
    }
    if (currentLedger?.id === ledger.id) setCurrentLedger(null);
    await refreshLedgers();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full md:max-w-md bg-slate-900 border border-slate-700 md:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">
            {view === 'create' ? 'Nueva cuenta'
              : view === 'edit' ? 'Editar cuenta'
              : view === 'members' ? membersLedger?.name
              : 'Seleccionar cuenta'}
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {view === 'create' && (
            <LedgerForm
              onSave={handleCreate}
              onCancel={() => setView('list')}
            />
          )}

          {view === 'edit' && editingLedger && (
            <LedgerForm
              initial={editingLedger}
              onSave={handleEdit}
              onCancel={() => { setView('list'); setEditingLedger(null); }}
            />
          )}

          {view === 'members' && membersLedger && (
            <LedgerMembers
              ledger={membersLedger}
              onBack={() => { setView('list'); setMembersLedger(null); }}
              onChanged={refreshLedgers}
            />
          )}

          {view === 'list' && (
            <div className="space-y-5">
              {deleteError && (
                <p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  {deleteError}
                </p>
              )}

              {/* Sin cuentas, "Todas" no resume nada: lo único que corresponde
                  ofrecer es crear la primera. */}
              {ledgers.length === 0 && (
                <div className="text-center space-y-3 py-2">
                  <p className="text-sm text-white font-medium">Todavía no tenés cuentas</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Una cuenta agrupa tus movimientos: por ejemplo Hogar, Personal o Negocio.
                    Podés compartir cualquiera de ellas con otra persona.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                {/* Vista global — solo tiene sentido si hay algo que agrupar */}
                {ledgers.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div
                    className="rounded-2xl overflow-hidden cursor-pointer relative"
                    style={{ aspectRatio: '3/4', background: 'linear-gradient(135deg, #1e293b, #0f172a)' }}
                    onClick={() => handleSelect(null)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <LayoutGrid className="w-8 h-8 text-slate-400" />
                    </div>
                    {currentLedger === null && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center shadow-md">
                        <Check className="w-3.5 h-3.5 text-slate-800" />
                      </div>
                    )}
                  </div>
                  <div className="px-0.5">
                    <p className="text-sm font-medium text-white">Todas</p>
                    <p className="text-xs text-slate-500">Vista global</p>
                  </div>
                </div>
                )}

                {/* Ledger cards */}
                {ledgers.map(l => (
                  <LedgerCard
                    key={l.id}
                    ledger={l}
                    isActive={currentLedger?.id === l.id}
                    onSelect={() => handleSelect(l)}
                    onEdit={() => { setEditingLedger(l); setView('edit'); }}
                    onDelete={() => handleDelete(l)}
                    onManageMembers={() => { setMembersLedger(l); setView('members'); }}
                  />
                ))}

                {/* Add ledger */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setView('create')}
                    className="rounded-2xl border-2 border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 transition-colors flex items-center justify-center cursor-pointer"
                    style={{ aspectRatio: '3/4' }}
                  >
                    <Plus className="w-8 h-8 text-slate-500" />
                  </button>
                  <p className="text-sm text-slate-500 px-0.5">Nueva cuenta</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
