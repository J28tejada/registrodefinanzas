import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { CalendarClock, Scissors } from 'lucide-react-native';
import Texto from './Texto';
import { useFormatters } from './ContextoDeAjustes';
import { AvisoDeTarjeta, cuandoVence } from '@compartido/tarjetas';
import { useColores } from '../lib/colores';

/**
 * El cartel de "se te viene el corte" o "se te viene el pago".
 *
 * El gemelo de components/CardAlerts.tsx. Existe además del aviso por WhatsApp
 * porque el aviso puede no llegar: hay que tener el chat vinculado, y no todos
 * lo tienen. Acá se ve igual al abrir la app.
 */
export default function AvisosDeTarjeta({ avisos }: { avisos: AvisoDeTarjeta[] }) {
  const paleta = useColores();
  const fmt = useFormatters();
  if (avisos.length === 0) return null;

  return (
    <View className="gap-2">
      {avisos.map(aviso => {
        const esPago = aviso.kind === 'due';
        // El pago urge y el corte solo informa: dejar pasar una fecha de pago
        // cuesta plata, un corte no.
        const caja = esPago
          ? 'bg-aviso/10 border-aviso/30'
          : 'bg-hundido border-linea-fuerte';
        const color = esPago ? paleta.aviso : paleta.tinta;

        return (
          <Link key={`${aviso.card.id}-${aviso.kind}`} href={`/cards/${aviso.card.id}` as never} asChild>
            <Pressable className={`flex-row items-start gap-2.5 border rounded-xl px-4 py-3 ${caja}`}>
              <View className="mt-0.5">
                {esPago ? <CalendarClock size={16} color={color} /> : <Scissors size={16} color={color} />}
              </View>
              <Texto className="text-sm flex-1" style={{ color }}>
                {esPago ? (
                  <>
                    <Texto className="text-sm font-medium" style={{ color }}>{aviso.card.name}</Texto>
                    {` vence el ${fmt.date(aviso.date)} — ${cuandoVence(aviso.daysBefore)}.`}
                    {aviso.balance.aPagar > 0 ? ` Hay ${fmt.money(aviso.balance.aPagar)} por pagar.` : ''}
                  </>
                ) : (
                  <>
                    <Texto className="text-sm font-medium" style={{ color }}>{aviso.card.name}</Texto>
                    {` corta el ${fmt.date(aviso.date)} — ${cuandoVence(aviso.daysBefore)}. `}
                    {'Lo que compres después entra en el estado de cuenta siguiente.'}
                  </>
                )}
              </Texto>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}
