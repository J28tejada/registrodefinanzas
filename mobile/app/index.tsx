import { ScrollView, Text, View } from 'react-native';
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react-native';

// El punto de toda la prueba: estos son los MISMOS archivos que usa la web.
import { makeFormatters } from '@compartido/format';
import { calcularSaldo, cicloDeTarjeta, proximoCorte } from '@compartido/tarjetas';
import type { Card } from '@compartido/types';

const fmt = makeFormatters({ currency: 'DOP', locale: 'es-DO', timezone: 'America/Santo_Domingo' });

const TARJETA: Card = {
  id: 'p', name: 'Visa Popular', kind: 'credit', last4: '1234', issuer: 'Popular',
  color: 'blue', archived: false, credit_limit: 50000, statement_day: 25, due_day: 10,
  opening_balance: 0, opening_date: null, alerts: true, created_at: '2026-01-01',
};

export default function Prueba() {
  const saldo = calcularSaldo(TARJETA, { charged: 11564, credited: 0, paid: 0, cycleCharged: 4200 }, '2026-09-18');
  const ciclo = cicloDeTarjeta(TARJETA, '2026-09-18');

  return (
    <ScrollView className="flex-1 bg-slate-950" contentContainerClassName="p-4 pb-32">
      <View className="max-w-4xl mx-auto w-full gap-6">
        <View>
          <Text className="text-xl font-bold text-white">Prueba de cimientos</Text>
          <Text className="text-slate-400 text-sm">
            Clases de Tailwind y lógica compartida con la web
          </Text>
        </View>

        {/* Las tres tarjetas del tablero, con las clases copiadas de app/page.tsx. */}
        <View className="flex-row gap-3">
          <Tarjeta titulo="INGRESOS" monto={24700} variante="income" />
          <Tarjeta titulo="GASTOS" monto={16921} variante="expense" />
        </View>
        <Tarjeta titulo="BALANCE" monto={7779} variante="balance" />

        {/* Lo que devuelve lib/tarjetas.ts, el mismo módulo que la web. */}
        <View className="bg-slate-900 border border-slate-800 rounded-2xl p-5 gap-2">
          <Text className="text-sm font-medium text-white">Estado de cuenta</Text>
          <Text className="text-[11px] text-slate-400 uppercase tracking-wider">Debés</Text>
          <Text className="text-3xl font-bold text-white">{fmt.money(saldo.saldo)}</Text>
          <View className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <View
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.min(saldo.usoDelLimite ?? 0, 100)}%` }}
            />
          </View>
          <Text className="text-xs text-emerald-400">
            {Math.round(saldo.usoDelLimite ?? 0)}% del límite
            <Text className="text-slate-500">  ·  {fmt.money(saldo.disponible ?? 0)} disponibles</Text>
          </Text>
          <Text className="text-xs text-slate-500">
            Corte {fmt.date(ciclo!.nextStatement)} · Pago {fmt.date(ciclo!.nextDue)}
          </Text>
          <Text className="text-xs text-slate-500">
            A pagar {fmt.money(saldo.aPagar)} · Este ciclo {fmt.money(saldo.cycleCharged)}
          </Text>
        </View>

        {/* Comprobación dura: si Intl no funciona en el motor del teléfono, esto
            se ve distinto que en la web y el port no sirve. */}
        <View className="bg-slate-900 border border-slate-800 rounded-2xl p-5 gap-1">
          <Text className="text-sm font-medium text-white">Formato</Text>
          <Text className="text-xs text-slate-400">money(1234567.5) = {fmt.money(1234567.5)}</Text>
          <Text className="text-xs text-slate-400">date(2026-09-18) = {fmt.date('2026-09-18')}</Text>
          <Text className="text-xs text-slate-400">monthLabel = {fmt.monthLabel('2026-09-01')}</Text>
          <Text className="text-xs text-slate-400">proximoCorte = {proximoCorte('2026-02-01', 31)}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const ESTILOS = {
  income: { borde: 'border-emerald-500/30 bg-emerald-500/5', icono: 'text-emerald-400 bg-emerald-500/10', monto: 'text-emerald-400', Icono: TrendingUp },
  expense: { borde: 'border-rose-500/30 bg-rose-500/5', icono: 'text-rose-400 bg-rose-500/10', monto: 'text-rose-400', Icono: TrendingDown },
  balance: { borde: 'border-blue-500/30 bg-blue-500/5', icono: 'text-blue-400 bg-blue-500/10', monto: 'text-blue-400', Icono: Wallet },
} as const;

function Tarjeta({ titulo, monto, variante }: {
  titulo: string; monto: number; variante: keyof typeof ESTILOS;
}) {
  const e = ESTILOS[variante];
  return (
    <View className={`flex-1 rounded-xl border p-5 ${e.borde}`}>
      <View className="flex-row items-start justify-between">
        <View>
          <Text className="text-xs text-slate-400 font-medium uppercase tracking-wider">{titulo}</Text>
          <Text className="text-xs text-slate-500 mt-0.5">del mes</Text>
        </View>
        <View className={`w-9 h-9 rounded-lg items-center justify-center ${e.icono}`}>
          <e.Icono size={16} color={variante === 'income' ? '#34d399' : variante === 'expense' ? '#fb7185' : '#60a5fa'} />
        </View>
      </View>
      <Text className={`text-2xl font-bold mt-3 ${e.monto}`}>{fmt.money(monto)}</Text>
    </View>
  );
}
