import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  AlertCircle, CheckCircle2, Download, Loader2, Mail, RefreshCw, Unlink,
} from 'lucide-react-native';
import Texto from '../componentes/Texto';
import Pantalla from '../componentes/Pantalla';
import Selector from '../componentes/Selector';
import CampoDeFecha from '../componentes/CampoDeFecha';
import { useCuenta } from '../componentes/ContextoDeCuenta';
import { useSesion } from '../componentes/ContextoDeSesion';
import { useFormatters } from '../componentes/ContextoDeAjustes';
import { db } from '../lib/datos';
import { BASE, FALTA_LA_API, hayApi, llamarApi } from '../lib/api';
import { createTransaction } from '@compartido/db';
import { EmailTransaction, LEDGER_COLOR_MAP } from '@compartido/types';
import { useColores } from '../lib/colores';

interface Fila extends EmailTransaction {
  selected: boolean;
  ledger_id: string;
  date_override: string;
}

const VENTAJAS = [
  'Detecta correos de tu banco automáticamente',
  'La IA extrae monto, descripción y categoría',
  'Tú decides qué importar antes de guardar',
  'Solo lectura — no se envía ni modifica nada',
];

/**
 * El gemelo de app/email/page.tsx.
 *
 * Una diferencia de fondo, y es la única: CONECTAR Gmail se hace en el
 * navegador, no acá. El permiso se lo da Google a la app web —es su dominio el
 * que está registrado como destino del OAuth—, y el token queda guardado del
 * lado del servidor, atado al usuario. Así que el teléfono abre esa pantalla en
 * el navegador del sistema y, al volver, pregunta de nuevo el estado: la cuenta
 * ya quedó conectada para los dos lados.
 *
 * Todo lo demás sí es de acá: escanear, revisar lo que encontró y elegir qué
 * importar. Y la importación va derecho a la base con `createTransaction`, la
 * misma función que usa la ruta de la web.
 */
export default function Correo() {
  const paleta = useColores();
  const { ledgers, refreshLedgers } = useCuenta();
  const { session } = useSesion();
  const fmt = useFormatters();
  const usuario = session?.user?.id;

  const [connected, setConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState('');
  const [scanning, setScanning] = useState(false);
  const [rows, setRows] = useState<Fila[]>([]);
  const [scannedCount, setScannedCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; fail: number } | null>(null);
  const [error, setError] = useState('');
  const [statusLoaded, setStatusLoaded] = useState(false);

  const defaultLedgerId = ledgers[0]?.id ?? '';

  const loadStatus = useCallback(async () => {
    if (!hayApi) { setError(FALTA_LA_API); setStatusLoaded(true); return; }
    try {
      const res = await llamarApi('/api/email/status');
      const data = await res.json();
      setConnected(Boolean(data.connected));
      setConnectedEmail(data.email ?? '');
    } catch {
      setConnected(false);
    } finally {
      setStatusLoaded(true);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const conectar = async () => {
    setError('');
    if (!hayApi) { setError(FALTA_LA_API); return; }
    // Vuelve cuando el usuario cierra el navegador; ahí se vuelve a preguntar.
    await WebBrowser.openBrowserAsync(`${BASE}/email`);
    await loadStatus();
  };

  const desconectar = () => {
    Alert.alert('¿Desconectar la cuenta de correo?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar', style: 'destructive',
        onPress: async () => {
          await llamarApi('/api/email/disconnect', { method: 'POST' });
          setConnected(false);
          setConnectedEmail('');
          setRows([]);
          setScannedCount(null);
        },
      },
    ]);
  };

  const escanear = async () => {
    setScanning(true);
    setError('');
    setRows([]);
    setScannedCount(null);
    setImportResult(null);
    try {
      const res = await llamarApi('/api/email/scan');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al escanear');
      setScannedCount(data.total_scanned);
      setRows((data.transactions as EmailTransaction[]).map(t => ({
        ...t,
        selected: true,
        ledger_id: defaultLedgerId,
        date_override: fmt.today(),
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al escanear correos');
    } finally {
      setScanning(false);
    }
  };

  const importar = async () => {
    if (!usuario) return;
    const aImportar = rows.filter(r => r.selected && r.amount && r.type && r.description);
    if (aImportar.length === 0) return;

    setImporting(true);
    setError('');
    let ok = 0, fail = 0;

    const cuenta = ledgers.find(l => l.id === aImportar[0].ledger_id);
    const scope = cuenta?.type ?? 'personal';

    for (const fila of aImportar) {
      try {
        await createTransaction(db(usuario), {
          ledger_id: fila.ledger_id || null,
          type: fila.type!,
          scope,
          amount: fila.amount!,
          category: fila.category ?? 'Otros',
          description: fila.description!,
          date: fila.date_override,
          source: 'ai',
        });
        ok++;
      } catch {
        fail++;
      }
    }

    await refreshLedgers();
    setImportResult({ ok, fail });
    setRows(previas => previas.map(r => r.selected ? { ...r, selected: false } : r));
    setImporting(false);
  };

  const seleccionadas = rows.filter(r => r.selected).length;

  if (!statusLoaded) {
    return (
      <View className="flex-1 items-center justify-center">
        <Loader2 size={24} color={paleta.tinta2} />
      </View>
    );
  }

  return (
    <Pantalla className="gap-6" keyboardShouldPersistTaps="handled">
      <View>
        <Texto className="text-xl font-semibold text-tinta">Correo electrónico</Texto>
        <Texto className="text-tinta-2 text-sm">Importa transacciones desde correos bancarios</Texto>
      </View>

      {error ? (
        <View className="flex-row items-start gap-2 bg-peligro/10 border border-peligro/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color={paleta.peligro} /></View>
          <Texto className="text-peligro text-sm flex-1">{error}</Texto>
        </View>
      ) : null}

      {!connected ? (
        <View className="bg-panel border border-linea rounded-xl p-5 gap-5">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 bg-hundido rounded-xl items-center justify-center">
              <Mail size={24} color={paleta.tinta2} />
            </View>
            <View className="flex-1">
              <Texto className="font-semibold text-tinta">Conectar Gmail</Texto>
              <Texto className="text-sm text-tinta-2">
                Escanea tus correos bancarios y extrae gastos automáticamente con IA
              </Texto>
            </View>
          </View>

          <View className="gap-2">
            {VENTAJAS.map(item => (
              <View key={item} className="flex-row items-center gap-2">
                <CheckCircle2 size={16} color={paleta.acento} />
                <Texto className="text-sm text-tinta-2 flex-1">{item}</Texto>
              </View>
            ))}
          </View>

          <Pressable
            onPress={conectar}
            className="w-full py-3 bg-primario active:bg-primario/85 rounded-lg flex-row items-center justify-center gap-2"
          >
            <Mail size={16} color={paleta.sobrePrimario} />
            <Texto className="text-sobre-primario text-sm font-medium">Conectar con Gmail</Texto>
          </Pressable>
          <Texto className="text-xs text-tinta-2">
            El permiso se da en el navegador, porque es la app web la que Google tiene registrada.
            Al volver acá la cuenta ya queda conectada para los dos lados.
          </Texto>
        </View>
      ) : (
        <>
          {/* La cuenta conectada */}
          <View className="bg-panel border border-linea rounded-xl p-4 flex-row items-center gap-3">
            <View className="w-10 h-10 bg-hundido rounded-lg items-center justify-center">
              <Mail size={20} color={paleta.tinta2} />
            </View>
            <View className="flex-1">
              <Texto className="text-sm font-medium text-tinta" numberOfLines={1}>{connectedEmail}</Texto>
              <View className="flex-row items-center gap-1">
                <CheckCircle2 size={12} color={paleta.acento} />
                <Texto className="text-xs text-acento">Conectado</Texto>
              </View>
            </View>
            <Pressable onPress={desconectar} accessibilityLabel="Desconectar" className="p-2">
              <Unlink size={16} color={paleta.tinta2} />
            </Pressable>
          </View>

          <Pressable
            onPress={escanear}
            disabled={scanning}
            style={scanning ? { opacity: 0.5 } : undefined}
            className="w-full py-3 bg-primario active:bg-primario/85 rounded-lg flex-row items-center justify-center gap-2"
          >
            {scanning ? <Loader2 size={16} color={paleta.sobrePrimario} /> : <RefreshCw size={16} color={paleta.sobrePrimario} />}
            <Texto className="text-sobre-primario text-sm font-medium">
              {scanning ? 'Escaneando correos...' : 'Escanear últimos 30 días'}
            </Texto>
          </Pressable>

          {importResult ? (
            <View className="flex-row items-center gap-2 bg-acento/10 border border-acento/20 rounded-xl px-4 py-3">
              <CheckCircle2 size={16} color={paleta.acento} />
              <Texto className="text-acento text-sm flex-1">
                {importResult.ok} transacciones importadas
                {importResult.fail > 0 ? ` · ${importResult.fail} fallaron` : ''}
              </Texto>
            </View>
          ) : null}

          {scannedCount !== null && rows.length === 0 && !scanning ? (
            <View className="items-center py-10">
              <View style={{ opacity: 0.3 }}><Mail size={40} color={paleta.tinta2} /></View>
              <Texto className="text-tinta-2 mt-3">No se encontraron correos de transacciones</Texto>
              <Texto className="text-xs text-tinta-2 mt-1">Se escanearon {scannedCount} correos bancarios</Texto>
            </View>
          ) : null}

          {rows.length > 0 ? (
            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <Texto className="text-sm font-medium text-tinta flex-1">
                  {rows.length} transacciones detectadas
                  {scannedCount !== null ? (
                    <Texto className="text-sm text-tinta-2"> · de {scannedCount} correos</Texto>
                  ) : null}
                </Texto>
                <View className="flex-row gap-2">
                  <Pressable onPress={() => setRows(r => r.map(x => ({ ...x, selected: true })))}>
                    <Texto className="text-xs text-tinta-2">Seleccionar todo</Texto>
                  </Pressable>
                  <Texto className="text-xs text-tinta-3">·</Texto>
                  <Pressable onPress={() => setRows(r => r.map(x => ({ ...x, selected: false })))}>
                    <Texto className="text-xs text-tinta-2">Ninguno</Texto>
                  </Pressable>
                </View>
              </View>

              <View className="gap-2">
                {rows.map((row, i) => {
                  const cuenta = ledgers.find(l => l.id === row.ledger_id);
                  const color = cuenta ? LEDGER_COLOR_MAP[cuenta.color] : null;
                  const cambiar = (cambios: Partial<Fila>) =>
                    setRows(previas => previas.map((r, j) => j === i ? { ...r, ...cambios } : r));
                  return (
                    <View
                      key={row.gmail_message_id}
                      className={`bg-panel border rounded-xl p-4 ${
                        row.selected ? 'border-linea-fuerte' : 'border-linea'
                      }`}
                      style={row.selected ? undefined : { opacity: 0.5 }}
                    >
                      <View className="flex-row items-start gap-3">
                        {/* El checkbox se dibuja a mano: en React Native no existe. */}
                        <Pressable
                          onPress={() => cambiar({ selected: !row.selected })}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: row.selected }}
                          className={`w-4 h-4 mt-1 rounded border items-center justify-center ${
                            row.selected ? 'bg-primario border-primario' : 'border-linea-fuerte'
                          }`}
                        >
                          {row.selected ? <CheckCircle2 size={12} color={paleta.sobrePrimario} /> : null}
                        </Pressable>

                        <View className="flex-1 gap-3">
                          <View className="flex-row items-start justify-between gap-2">
                            <View className="flex-1">
                              <Texto className="text-sm font-medium text-tinta" numberOfLines={1}>
                                {row.description}
                              </Texto>
                              <Texto className="text-xs text-tinta-2 mt-0.5" numberOfLines={1}>
                                {row.subject}
                              </Texto>
                            </View>
                            <Texto className={`text-sm font-medium ${
                              row.type === 'income' ? 'text-acento' : 'text-tinta'
                            }`} style={{ fontVariant: ['tabular-nums'] }}>
                              {row.type === 'income' ? '+' : '−'}{fmt.money(row.amount ?? 0)}
                            </Texto>
                          </View>

                          <View className="flex-row gap-2">
                            <View className="flex-1 gap-1">
                              <Texto className="text-xs text-tinta-2">Fecha</Texto>
                              <CampoDeFecha
                                value={row.date_override}
                                onChange={v => cambiar({ date_override: v })}
                                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-2 py-1.5"
                              />
                            </View>
                            {ledgers.length > 0 ? (
                              <View className="flex-1 gap-1">
                                <Texto className="text-xs text-tinta-2">Cuenta</Texto>
                                <Selector
                                  value={row.ledger_id}
                                  opciones={[
                                    { valor: '', etiqueta: 'Sin cuenta' },
                                    ...ledgers.map(l => ({
                                      valor: l.id,
                                      etiqueta: l.name,
                                      color: LEDGER_COLOR_MAP[l.color]?.main,
                                    })),
                                  ]}
                                  onChange={v => cambiar({ ledger_id: v })}
                                  titulo="Cuenta"
                                />
                              </View>
                            ) : null}
                          </View>

                          <View className="flex-row items-center gap-2">
                            {row.category ? (
                              <View className="px-2 py-0.5 bg-hundido rounded-md">
                                <Texto className="text-xs text-tinta-2">{row.category}</Texto>
                              </View>
                            ) : null}
                            <Texto className="text-xs text-tinta-3">
                              {Math.round((row.confidence ?? 0) * 100)}% confianza
                            </Texto>
                            {color ? (
                              <View className="w-3 h-3 rounded-sm" style={{ backgroundColor: color.main }} />
                            ) : null}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              <Pressable
                onPress={importar}
                disabled={importing || seleccionadas === 0}
                style={importing || seleccionadas === 0 ? { opacity: 0.5 } : undefined}
                className="w-full py-3 bg-primario active:bg-primario/85 rounded-lg flex-row items-center justify-center gap-2"
              >
                {importing ? <Loader2 size={16} color={paleta.sobrePrimario} /> : <Download size={16} color={paleta.sobrePrimario} />}
                <Texto className="text-sobre-primario text-sm font-medium">
                  {importing
                    ? 'Importando...'
                    : `Importar ${seleccionadas} transaccion${seleccionadas !== 1 ? 'es' : ''}`}
                </Texto>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </Pantalla>
  );
}
