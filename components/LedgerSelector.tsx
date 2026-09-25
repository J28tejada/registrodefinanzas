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
          <div className="absolute top-2 right-2 w-6 h-6 bg-panel/90 rounded-full flex items-center justify-center shadow-md">
            <Check className="w-3.5 h-3.5" style={{ color: color.main }} />
          </div>
        )}

        {/* Cuántas personas tienen acceso */}
        {compartida && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/40 rounded-full px-1.5 py-0.5">
            <Users className="w-2.5 h-2.5 text-white" />
            <span className="text-3xs text-white font-medium">{ledger.memberCount}</span>
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
                className="w-7 h-7 bg-black/40 hover:bg-peligro/70 rounded-lg flex items-center justify-center transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-white" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-0.5">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium text-tinta truncate">{ledger.name}</p>
          {esDueno && <Crown className="w-3 h-3 text-aviso flex-shrink-0" />}
        </div>
        <p className={`text-xs font-semibold ${ledger.balance >= 0 ? 'text-acento' : 'text-peligro'}`}>
          {fmt.money(ledger.balance)}
        </p>
        <p className="text-xs text-tinta-2">{ledger.transactionCount} transacciones</p>
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
        <label className="text-xs text-tinta-2 font-medium">Nombre *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ej: Personal, Negocio, Proyecto..."
          className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-tinta placeholder-tinta-3 focus:outline-none focus:border-tinta-3 text-sm"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-tinta-2 font-medium">Tipo de categorías</label>
        <div className="grid grid-cols-2 gap-2">
          {(['personal', 'business'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`py-2 rounded-lg text-sm font-medium transition-all ${
                type === t
                  ? 'bg-elevado border-2 border-tinta text-tinta'
                  : 'bg-hundido border-2 border-transparent text-tinta-2 hover:border-linea-fuerte'
              }`}
            >
              {t === 'personal' ? 'Personal' : 'Negocio'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-tinta-2 font-medium">Color</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map(c => {
            const col = LEDGER_COLOR_MAP[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-tinta ring-offset-2 ring-offset-slate-900 scale-110' : ''}`}
                style={{ backgroundColor: col.main }}
                title={c}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-tinta-2 font-medium">Descripción</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Opcional"
          className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-tinta placeholder-tinta-3 focus:outline-none focus:border-tinta-3 text-sm"
        />
      </div>

      {error && <p className="text-peligro text-sm">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 bg-hundido hover:bg-presionado text-tinta rounded-lg text-sm transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 bg-primario hover:bg-primario/85 disabled:opacity-50 text-sobre-primario rounded-lg text-sm font-medium transition-colors"
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

      <div className="relative w-full md:max-w-md bg-panel border border-linea-fuerte md:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-linea">
          <h2 className="font-semibold text-tinta">
            {view === 'create' ? 'Nueva cuenta'
              : view === 'edit' ? 'Editar cuenta'
              : view === 'members' ? membersLedger?.name
              : 'Seleccionar cuenta'}
          </h2>
          <button onClick={handleClose} className="text-tinta-2 hover:text-tinta transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
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
                <p className="text-peligro text-sm bg-peligro/10 border border-peligro/20 rounded-lg px-3 py-2">
                  {deleteError}
                </p>
              )}

              {/* Sin cuentas, "Todas" no resume nada: lo único que corresponde
                  ofrecer es crear la primera. */}
              {ledgers.length === 0 && (
                <div className="text-center space-y-3 py-2">
                  <p className="text-sm text-tinta font-medium">Te quedaste sin cuentas</p>
                  <p className="text-xs text-tinta-2 leading-relaxed">
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
                    style={{ aspectRatio: '3/4', background: 'rgb(var(--c-hundido))' }}
                    onClick={() => handleSelect(null)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <LayoutGrid className="w-8 h-8 text-tinta-2" />
                    </div>
                    {currentLedger === null && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-panel/90 rounded-full flex items-center justify-center shadow-md">
                        <Check className="w-3.5 h-3.5 text-tinta" />
                      </div>
                    )}
                  </div>
                  <div className="px-0.5">
                    <p className="text-sm font-medium text-tinta">Todas</p>
                    <p className="text-xs text-tinta-2">Vista global</p>
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
                    className="rounded-2xl border-2 border-dashed border-linea-fuerte hover:border-linea-fuerte hover:bg-hundido transition-colors flex items-center justify-center cursor-pointer"
                    style={{ aspectRatio: '3/4' }}
                  >
                    <Plus className="w-8 h-8 text-tinta-2" />
                  </button>
                  <p className="text-sm text-tinta-2 px-0.5">Nueva cuenta</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
