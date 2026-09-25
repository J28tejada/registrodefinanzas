'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, Loader2, Check, AlertCircle } from 'lucide-react';

export default function UnirsePage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-tinta-2" />
      </div>
    }>
      <UnirseInner />
    </Suspense>
  );
}

function UnirseInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [codigo, setCodigo] = useState('');
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [uniendo, setUniendo] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

  // El enlace compartido trae el código puesto
  useEffect(() => {
    const delEnlace = searchParams.get('codigo');
    if (delEnlace) setCodigo(delEnlace.toUpperCase().slice(0, 6));
  }, [searchParams]);

  // Con el código completo, buscar a qué cuenta pertenece
  useEffect(() => {
    if (codigo.length !== 6) { setCuenta(null); setError(''); return; }

    let cancelado = false;
    setVerificando(true);
    fetch(`/api/invites/${codigo}`)
      .then(async res => {
        const datos = await res.json();
        if (cancelado) return;
        if (!res.ok) { setError(datos.error ?? 'Código inválido'); setCuenta(null); }
        else { setCuenta(datos.ledger_name); setError(''); }
      })
      .catch(() => { if (!cancelado) setError('No se pudo verificar el código'); })
      .finally(() => { if (!cancelado) setVerificando(false); });

    return () => { cancelado = true; };
  }, [codigo]);

  const unirse = async () => {
    setUniendo(true);
    setError('');
    try {
      const res = await fetch(`/api/invites/${codigo}`, { method: 'POST' });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo unir'); return; }

      setListo(true);
      // Recarga para que el selector de cuentas traiga la nueva
      setTimeout(() => { router.push('/'); router.refresh(); }, 1500);
    } catch {
      setError('No se pudo unir a la cuenta');
    } finally {
      setUniendo(false);
    }
  };

  if (listo) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primario rounded-full flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-sobre-primario" />
          </div>
          <div>
            <p className="text-tinta font-semibold text-lg">¡Listo!</p>
            <p className="text-tinta-2 text-sm mt-1">Ya tenés acceso a {cuenta}</p>
          </div>
          <Loader2 className="w-4 h-4 animate-spin text-tinta-2 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 bg-hundido rounded-xl flex items-center justify-center mx-auto">
            <Users className="w-6 h-6 text-tinta-2" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-tinta">Unirse a una cuenta</h1>
            <p className="text-tinta-2 text-sm mt-1">
              Poné el código de 6 caracteres que te compartieron
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={codigo}
            onChange={e => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="ABC123"
            autoFocus
            autoCapitalize="characters"
            className="w-full bg-panel border-2 border-linea-fuerte rounded-xl px-4 py-4 text-tinta text-center text-xl sm:text-2xl font-mono tracking-[0.2em] sm:tracking-[0.3em] placeholder:text-tinta-3 focus:outline-none focus:border-tinta-3 transition-colors"
          />

          {verificando && (
            <p className="text-tinta-2 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando...
            </p>
          )}

          {error && (
            <p className="text-peligro text-sm flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </p>
          )}

          {cuenta && !error && (
            <div className="bg-acento/10 border border-acento/20 rounded-xl p-4 text-center">
              <p className="text-xs text-tinta-2">Te invitaron a</p>
              <p className="text-acento font-semibold mt-0.5">{cuenta}</p>
            </div>
          )}
        </div>

        <button
          onClick={unirse}
          disabled={!cuenta || uniendo || Boolean(error)}
          className="w-full py-3 bg-primario hover:bg-primario/85 disabled:opacity-40 disabled:cursor-not-allowed text-sobre-primario rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {uniendo ? <><Loader2 className="w-4 h-4 animate-spin" /> Uniéndose...</> : 'Unirme a esta cuenta'}
        </button>
      </div>
    </div>
  );
}
