import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import Texto from './Texto';
import { useFormatters } from './ContextoDeAjustes';
import { separarCentavos } from '@compartido/format';

const TABULARES = { fontVariant: ['tabular-nums' as const] };

/**
 * El gemelo de components/MonthSummary.tsx.
 *
 * Lo que entró, lo que salió y lo que queda en el mes: el balance como único
 * número grande y los otros dos en una línea abajo. El porqué está en la web.
 */
export default function ResumenDelMes({
  income, expenses, balance, incomeHref, expensesHref,
}: {
  income: number;
  expenses: number;
  balance: number;
  incomeHref?: string;
  expensesHref?: string;
}) {
  const fmt = useFormatters();
  const negativo = balance < 0;
  const [entero, centavos] = separarCentavos(fmt.money(Math.abs(balance)));

  return (
    <View>
      <Texto className="text-sm text-tinta-2">Balance del mes</Texto>
      <Texto
        className={`text-4xl font-semibold tracking-tight mt-1 ${negativo ? 'text-peligro' : 'text-tinta'}`}
        style={TABULARES}
      >
        {negativo ? '−' : ''}{entero}
        <Texto className={`text-4xl font-semibold ${negativo ? 'text-peligro/60' : 'text-tinta-3'}`}>{centavos}</Texto>
      </Texto>
      <View className="flex-row mt-5 border-y border-linea">
        <Total etiqueta="Ingresos" monto={`+${fmt.money(income)}`} tono="text-acento" href={incomeHref} />
        <View className="w-px bg-linea" />
        <Total etiqueta="Gastos" monto={`−${fmt.money(expenses)}`} tono="text-tinta" href={expensesHref} separado />
      </View>
    </View>
  );
}

function Total({ etiqueta, monto, tono, href, separado }: {
  etiqueta: string; monto: string; tono: string; href?: string; separado?: boolean;
}) {
  const clase = `flex-1 py-3 ${separado ? 'pl-4' : ''}`;
  const contenido = (
    <>
      <Texto className="text-xs text-tinta-2">{etiqueta}</Texto>
      <Texto className={`text-base font-medium mt-0.5 ${tono}`} style={TABULARES}>{monto}</Texto>
    </>
  );
  return href ? (
    <Link href={href as never} asChild>
      <Pressable className={`${clase} active:bg-hundido`}>{contenido}</Pressable>
    </Link>
  ) : (
    <View className={clase}>{contenido}</View>
  );
}
