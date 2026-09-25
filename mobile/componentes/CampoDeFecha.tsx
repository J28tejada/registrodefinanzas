import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Texto from './Texto';

/**
 * El reemplazo de `<input type="date">`, que en React Native no existe.
 *
 * El navegador trae su propio selector de fechas; acá hay que abrir el del
 * sistema. Guarda y devuelve el mismo formato que la web —YYYY-MM-DD— para que
 * todo lo que hay del otro lado (los filtros, `limitesDelMes`, la base) no se
 * entere de la diferencia.
 *
 * La fecha se arma en UTC a propósito, igual que `lib/format.ts`: es un día de
 * calendario, no un instante. Construida en hora local, alguien en una zona al
 * oeste de Greenwich elige el 1 y guarda el 30 del mes anterior.
 */
export default function CampoDeFecha({
  value, onChange, placeholder = 'Elegir', className = '',
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  const comoFecha = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date();
    const [a, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d, 12));
  };

  return (
    <>
      <Pressable
        onPress={() => setAbierto(true)}
        className={className || 'w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2'}
      >
        <Texto className={`text-sm ${value ? 'text-tinta' : 'text-tinta-2'}`}>
          {value || placeholder}
        </Texto>
      </Pressable>

      {abierto ? (
        <DateTimePicker
          value={comoFecha()}
          mode="date"
          // En Android el selector es un diálogo que se cierra solo; en iOS es
          // una rueda que hay que mostrar y esconder a mano.
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(evento, elegida) => {
            if (Platform.OS === 'android') setAbierto(false);
            if (evento.type === 'dismissed' || !elegida) return;
            const y = elegida.getFullYear();
            const m = String(elegida.getMonth() + 1).padStart(2, '0');
            const d = String(elegida.getDate()).padStart(2, '0');
            onChange(`${y}-${m}-${d}`);
          }}
        />
      ) : null}

      {/* En iOS la rueda se queda abierta hasta que alguien la cierre. */}
      {abierto && Platform.OS === 'ios' ? (
        <Pressable onPress={() => setAbierto(false)} className="py-2">
          <Texto className="text-xs text-acento text-center">Listo</Texto>
        </Pressable>
      ) : null}
    </>
  );
}
