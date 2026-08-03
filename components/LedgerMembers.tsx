'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Copy, Check, Loader2, X, Crown, LogOut, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { LedgerWithStats, LedgerMember } from '@/lib/types';

interface Props {
  ledger: LedgerWithStats;
  onBack: () => void;
  onChanged: () => void;
}

export default function LedgerMembers({ ledger, onBack, onChanged }: Props) {
  const [miembros, setMiembros] = useState<LedgerMember[]>([]);
  const [cargando, setCargando] = useState(true);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState('');
  // Para distinguir mi propia fila: ahí va "salir", no "quitar".
  const [miId, setMiId] = useState('');

  const esDueno = ledger.role === 'owner';

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) setMiId(data.user.id);
    });
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/ledgers/${ledger.id}/members`);
      const datos = await res.json();
      if (res.ok && Array.isArray(datos)) setMiembros(datos);
      else setError(datos.error ?? 'No se pudieron cargar los miembros');
    } catch {
      setError('No se pudieron cargar los miembros');
    } finally {
      setCargando(false);
    }
  }, [ledger.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const generar = async () => {
    setGenerando(true);
    setError('');
    try {
      const res = await fetch(`/api/ledgers/${ledger.id}/invite`, { method: 'POST' });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo crear la invitación'); return; }
      setCodigo(datos.code);
      setCopiado(false);
    } catch {
      setError('No se pudo crear la invitación');
    } finally {
      setGenerando(false);
    }
  };

  const enlace = codigo && typeof window !== 'undefined'
    ? `${window.location.origin}/unirse?codigo=${codigo}`
    : '';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError('No se pudo copiar. Copiá el código a mano.');
    }
  };

  const quitar = async (userId: string, soyYo: boolean) => {
    const mensaje = soyYo
      ? `¿Salir de "${ledger.name}"? Vas a perder acceso a sus movimientos.`
      : '¿Quitar a esta persona de la cuenta?';
    if (!confirm(mensaje)) return;

    setError('');
    const res = await fetch(`/api/ledgers/${ledger.id}/members?user_id=${userId}`, { method: 'DELETE' });
    const datos = await res.json();
    if (!res.ok) { setError(datos.error ?? 'No se pudo quitar'); return; }

    onChanged();
    if (soyYo) onBack();
    else cargar();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-medium text-white">Personas con acceso</h3>
      </div>

      {error && (
        <p className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {cargando ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-14 bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {miembros.map(m => {
            const soyYo = m.user_id === miId;
            const puedeQuitar = m.role !== 'owner' && (esDueno || soyYo);
            return (
              <div key={m.user_id} className="flex items-center gap-3 bg-slate-800 rounded-xl px-3 py-2.5">
                {m.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatar_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm text-slate-300 flex-shrink-0">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-white truncate">{m.name}</p>
                    {soyYo && <span className="text-xs text-slate-500 flex-shrink-0">(vos)</span>}
                    {m.role === 'owner' && <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{m.email}</p>
                </div>
                {puedeQuitar && (
                  <button
                    onClick={() => quitar(m.user_id, soyYo)}
                    title={soyYo ? 'Salir de la cuenta' : 'Quitar de la cuenta'}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors flex-shrink-0"
                  >
                    {soyYo ? <LogOut className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {esDueno ? (
        <div className="space-y-3 pt-1">
          {!codigo ? (
            <button
              onClick={generar}
              disabled={generando}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
            >
              {generando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                : <><UserPlus className="w-4 h-4" /> Invitar a alguien</>}
            </button>
          ) : (
            <div className="space-y-3 bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="text-center">
                <p className="text-xs text-slate-400">Código de invitación</p>
                <p className="text-xl sm:text-2xl font-mono tracking-[0.18em] sm:tracking-[0.25em] text-emerald-300 mt-1">{codigo}</p>
                <p className="text-xs text-slate-500 mt-1.5">Vence en 7 días</p>
              </div>

              <button
                onClick={copiar}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
              >
                {copiado
                  ? <><Check className="w-4 h-4 text-emerald-400" /> ¡Enlace copiado!</>
                  : <><Copy className="w-4 h-4" /> Copiar enlace para compartir</>}
              </button>

              <p className="text-xs text-slate-500 text-center leading-relaxed">
                Mandáselo por WhatsApp. Quien lo abra y entre con su cuenta
                va a poder ver y cargar movimientos acá.
              </p>

              <button
                onClick={generar}
                className="w-full text-xs text-slate-400 hover:text-white transition-colors"
              >
                Generar otro código (anula el anterior)
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500 text-center">
          Solo el dueño de la cuenta puede invitar a más personas.
        </p>
      )}

      <button
        onClick={onBack}
        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
      >
        Volver
      </button>
    </div>
  );
}
