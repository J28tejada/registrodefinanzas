import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Link } from 'expo-router';
import {
  AlertCircle, ChevronLeft, ChevronRight, CreditCard, Plus,
} from 'lucide-react-native';
import Texto from '../../componentes/Texto';
import AvisosDeTarjeta from '../../componentes/AvisosDeTarjeta';
import { budgetTone } from '../../componentes/BarraDePresupuesto';
import { useCuenta } from '../../componentes/ContextoDeCuenta';
import { useSesion } from '../../componentes/ContextoDeSesion';
import { useFormatters } from '../../componentes/ContextoDeAjustes';
import { db } from '../../lib/datos';
import { getCardsWithUsage } from '@compartido/db';
import { limitesDelMes } from '@compartido/format';
import { avisosDeTarjetas } from '@compartido/tarjetas';
import { CARD_GROUPS, CARD_KIND_LABEL, CardWithUsage, LEDGER_COLOR_MAP } from '@compartido/types';

/** El gemelo de app/cards/page.tsx. */
export default function Billetera() {
  const fmt = useFormatters();
  const { transactionVersion } = useCuenta();
  const { session } = useSesion();
  const usuario = session?.user?.id;

  const [mes, setMes] = useState<string>(() => fmt.today().slice(0, 7));
  const [cards, setCards] = useState<CardWithUsage[]>([]);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    setError('');
    try {
      const { start, end } = limitesDelMes(`${mes}-01`);
      // El saldo es el de hoy aunque se esté mirando un mes viejo: navegar a
      // marzo no cambia cuánto se debe ahora.
      setCards(await getCardsWithUsage(db(usuario), start, end, verArchivadas, fmt.today()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la billetera');
    } finally {
      setCargando(false);
    }
  }, [usuario, mes, verArchivadas, fmt]);

  useEffect(() => { cargar(); }, [cargar, transactionVersion]);

  const moverMes = (delta: number) => {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + delta, 1));
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  // El saldo y las fechas ya vienen calculados; acá solo se filtra qué vence.
  const avisos = avisosDeTarjetas(
    cards, new Map(cards.filter(c => c.balance).map(c => [c.id, c.balance!])),
  );

  const total = cards.reduce((s, c) => s + c.gastoDelMes, 0);
  const activas = cards.filter(c => !c.archived);
  // La que más pesa en el mes: es la respuesta a "¿con qué estoy gastando?".
  const lider = cards.reduce<CardWithUsage | null>(
    (mayor, c) => (c.gastoDelMes > (mayor?.gastoDelMes ?? 0) ? c : mayor), null,
  );

  return (
    <ScrollView className="flex-1" contentContainerClassName="pt-14 pb-32 gap-6">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Texto className="text-xl font-bold text-white">Billetera</Texto>
          <Texto className="text-slate-400 text-sm">
            Tus tarjetas, cuentas y efectivo, con cuánto va por cada uno
          </Texto>
        </View>
        <Pressable className="px-3 py-2 bg-emerald-600 active:bg-emerald-500 rounded-xl flex-row items-center gap-1.5">
          <Plus size={16} color="#ffffff" />
        </Pressable>
      </View>

      <View className="flex-row items-center justify-center gap-1">
        <Pressable onPress={() => moverMes(-1)} className="p-1">
          <ChevronLeft size={16} color="#64748b" />
        </Pressable>
        <Texto className="text-sm text-slate-300 capitalize text-center" style={{ minWidth: 140 }}>
          {fmt.monthLabel(`${mes}-01`)}
        </Texto>
        <Pressable onPress={() => moverMes(1)} className="p-1">
          <ChevronRight size={16} color="#64748b" />
        </Pressable>
      </View>

      {error ? (
        <View className="flex-row items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color="#fb7185" /></View>
          <Texto className="text-rose-400 text-sm flex-1">{error}</Texto>
        </View>
      ) : null}

      <AvisosDeTarjeta avisos={avisos} />

      {cards.length > 0 ? (
        // Dos columnas en el teléfono: con tres, "RD$2,250.00" no entra en su
        // tercio y el número —que es a lo que se viene— sale cortado.
        <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-3">
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Texto className="text-[11px] text-slate-400 uppercase tracking-wider">Gastado</Texto>
              <Texto className="text-lg font-bold text-white mt-1" numberOfLines={1}>{fmt.money(total)}</Texto>
            </View>
            <View className="flex-1">
              <Texto className="text-[11px] text-slate-400 uppercase tracking-wider">En uso</Texto>
              <Texto className="text-lg font-bold text-white mt-1">{activas.length}</Texto>
            </View>
          </View>
          <View>
            <Texto className="text-[11px] text-slate-400 uppercase tracking-wider">La que más</Texto>
            <Texto className="text-sm font-semibold text-emerald-400 mt-1.5" numberOfLines={1}>
              {lider && lider.gastoDelMes > 0 ? lider.name : '—'}
            </Texto>
          </View>
        </View>
      ) : null}

      {cargando ? (
        <View className="gap-2">
          {[0, 1, 2].map(i => (
            <View key={i} className="h-20 bg-slate-900 border border-slate-800 rounded-2xl" />
          ))}
        </View>
      ) : cards.length === 0 ? (
        <View className="items-center py-12 bg-slate-900 border border-slate-800 rounded-2xl">
          <CreditCard size={32} color="#475569" />
          <Texto className="text-sm text-slate-500 mt-3">
            {verArchivadas ? 'No tenés nada archivado.' : 'Todavía no cargaste ninguno.'}
          </Texto>
          <Texto className="text-xs text-slate-500 mt-1">
            Una tarjeta, tu cuenta corriente o de ahorro, el efectivo.
          </Texto>
        </View>
      ) : (
        // Agrupado: una tarjeta y una cuenta de banco no se leen igual, y en una
        // lista sola hay que mirar el subtítulo de cada fila para distinguirlas.
        <View className="gap-5">
          {CARD_GROUPS.map(({ titulo, kinds }) => {
            const delGrupo = cards.filter(c => kinds.includes(c.kind));
            if (delGrupo.length === 0) return null;
            return (
              <View key={titulo} className="gap-2">
                <Texto className="text-xs font-medium text-slate-400 uppercase tracking-wider px-1">
                  {titulo}
                </Texto>
                {delGrupo.map(c => <Fila key={c.id} card={c} total={total} fmt={fmt} />)}
              </View>
            );
          })}
        </View>
      )}

      <Pressable onPress={() => setVerArchivadas(v => !v)}>
        <Texto className="text-xs text-slate-500">
          {verArchivadas ? 'Ver solo las activas' : 'Ver también las archivadas'}
        </Texto>
      </Pressable>
    </ScrollView>
  );
}

/** Una tarjeta de la lista. Toda la fila entra al detalle. */
function Fila({ card, total, fmt }: {
  card: CardWithUsage;
  total: number;
  fmt: { money: (n: number) => string; date: (iso: string) => string };
}) {
  const colores = LEDGER_COLOR_MAP[card.color] ?? { dark: '#334155', main: '#475569' };
  const parte = total > 0 ? (card.gastoDelMes / total) * 100 : 0;
  const saldo = card.balance;

  return (
    <Link href={`/cards/${card.id}` as never} asChild>
      <Pressable
        className="bg-slate-900 border border-slate-800 active:border-slate-700 rounded-2xl p-4"
        style={card.archived ? { opacity: 0.6 } : undefined}
      >
        <View className="flex-row items-center gap-3">
          <View className="w-11 h-8 rounded-md" style={{ backgroundColor: colores.main }} />
          <View className="flex-1">
            {/* El nombre se queda con el renglón entero. Los últimos cuatro bajan
                a la línea de abajo: en un teléfono le comían la mitad al nombre. */}
            <Texto className="text-sm font-medium text-white" numberOfLines={1}>{card.name}</Texto>
            <Texto className="text-xs text-slate-500" numberOfLines={1}>
              {CARD_KIND_LABEL[card.kind]}
              {card.issuer ? ` · ${card.issuer}` : ''}
              {card.last4 ? ` · ···· ${card.last4}` : ''}
              {card.archived ? ' · archivada' : ''}
            </Texto>
          </View>
          <View className="items-end">
            <Texto className="text-sm font-semibold text-white">{fmt.money(card.gastoDelMes)}</Texto>
            <Texto className="text-[11px] text-slate-500">{card.usos} mov.</Texto>
          </View>
          <ChevronRight size={16} color="#475569" />
        </View>

        {/* En una tarjeta de crédito lo que se quiere saber no es cuánto se gastó
            este mes sino cuánto se debe, y cuánto queda de cupo. */}
        {saldo ? (
          <View className="mt-3 gap-1.5">
            {card.credit_limit != null ? (
              <View className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <View className={`h-full rounded-full ${budgetTone(saldo.usoDelLimite ?? 0).bar}`}
                  style={{ width: `${Math.min(saldo.usoDelLimite ?? 0, 100)}%` }} />
              </View>
            ) : null}
            <View className="flex-row items-center justify-between gap-2">
              <Texto className="text-[11px] text-slate-400 flex-1" numberOfLines={1}>
                {saldo.saldo > 0 ? `Debés ${fmt.money(saldo.saldo)}` : 'Al día'}
                {card.credit_limit != null && saldo.usoDelLimite != null
                  ? ` · ${Math.round(saldo.usoDelLimite)}% del límite` : ''}
              </Texto>
              {saldo.ciclo ? (
                <Texto className={`text-[11px] ${saldo.ciclo.daysToDue <= 3 ? 'text-amber-400' : 'text-slate-500'}`}>
                  paga {fmt.date(saldo.ciclo.nextDue)}
                </Texto>
              ) : null}
            </View>
          </View>
        ) : parte > 0 ? (
          <View className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <View className="h-full rounded-full" style={{ width: `${parte}%`, backgroundColor: colores.main }} />
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}
