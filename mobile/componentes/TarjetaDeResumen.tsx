import { View } from 'react-native';
import Texto from './Texto';
import { LucideIcon } from 'lucide-react-native';
import { useFormatters } from './ContextoDeAjustes';

type Variante = 'income' | 'expense' | 'balance' | 'personal' | 'business';

const BORDE: Record<Variante, string> = {
  income: 'border-emerald-500/30 bg-emerald-500/5',
  expense: 'border-rose-500/30 bg-rose-500/5',
  balance: 'border-blue-500/30 bg-blue-500/5',
  personal: 'border-violet-500/30 bg-violet-500/5',
  business: 'border-blue-500/30 bg-blue-500/5',
};

const CAJA_ICONO: Record<Variante, string> = {
  income: 'bg-emerald-500/10',
  expense: 'bg-rose-500/10',
  balance: 'bg-blue-500/10',
  personal: 'bg-violet-500/10',
  business: 'bg-blue-500/10',
};

const MONTO: Record<Variante, string> = {
  income: 'text-emerald-400',
  expense: 'text-rose-400',
  balance: 'text-blue-400',
  personal: 'text-violet-400',
  business: 'text-blue-400',
};

/**
 * El color del ícono, en hexadecimal.
 *
 * En la web basta con `text-emerald-400` en el contenedor y el SVG lo hereda por
 * `currentColor`. Acá no hay herencia: `lucide-react-native` quiere el color por
 * prop. Son los mismos valores de la paleta de Tailwind, escritos a mano; si
 * alguno no coincidiera, la comparación de la galería lo muestra.
 */
const TINTE: Record<Variante, string> = {
  income: '#34d399',
  expense: '#fb7185',
  balance: '#60a5fa',
  personal: '#a78bfa',
  business: '#60a5fa',
};

/** El gemelo de components/SummaryCard.tsx. */
export default function TarjetaDeResumen({
  title, subtitle, amount, variant, icon: Icono,
}: {
  title: string;
  subtitle?: string;
  amount: number;
  variant: Variante;
  icon: LucideIcon;
}) {
  const fmt = useFormatters();

  return (
    <View className={`rounded-xl border p-4 sm:p-5 ${BORDE[variant]}`}>
      <View className="flex-row items-start justify-between">
        <View>
          <Texto className="text-[11px] sm:text-xs text-slate-400 font-medium uppercase tracking-wider">
            {title}
          </Texto>
          {subtitle ? <Texto className="text-xs text-slate-500 mt-0.5">{subtitle}</Texto> : null}
        </View>
        <View className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg items-center justify-center ${CAJA_ICONO[variant]}`}>
          <Icono size={16} color={TINTE[variant]} />
        </View>
      </View>
      <Texto className={`text-lg sm:text-2xl font-bold mt-2 sm:mt-3 ${MONTO[variant]}`}>
        {fmt.money(Math.abs(amount))}
      </Texto>
      {amount < 0 && variant === 'balance' ? (
        <Texto className="text-xs text-rose-400 mt-1">Balance negativo</Texto>
      ) : null}
    </View>
  );
}
