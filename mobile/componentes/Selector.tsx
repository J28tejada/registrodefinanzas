import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import Texto from './Texto';

export interface OpcionDeSelector {
  valor: string;
  etiqueta: string;
  /** El grupo al que pertenece, como el <optgroup> de la web. */
  grupo?: string;
  /** Un cuadradito de color a la izquierda, para las cuentas. */
  color?: string;
}

/**
 * El reemplazo de `<select>`, que en React Native no existe.
 *
 * El navegador abre su propia lista —y en un teléfono, la rueda del sistema—.
 * Acá hay que dibujarla: se abre una hoja desde abajo con las opciones, que es
 * lo que hacen las apps nativas y lo que la gente espera al tocar un campo así.
 *
 * Mantiene los grupos del `<optgroup>` porque el desplegable de "pagado con"
 * los usa: con siete medios de pago sueltos hay que leerlos todos para
 * encontrar "Cuenta de ahorro" entre las tarjetas.
 */
export default function Selector({
  value, opciones, onChange, placeholder = 'Sin especificar', titulo,
}: {
  value: string;
  opciones: OpcionDeSelector[];
  onChange: (valor: string) => void;
  placeholder?: string;
  /** Lo que se lee arriba de la hoja. */
  titulo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const elegida = opciones.find(o => o.valor === value);

  const grupos = opciones.reduce<Record<string, OpcionDeSelector[]>>((acc, o) => {
    const g = o.grupo ?? '';
    (acc[g] ??= []).push(o);
    return acc;
  }, {});

  return (
    <>
      <Pressable
        onPress={() => setAbierto(true)}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 flex-row items-center gap-2.5"
      >
        {elegida?.color ? (
          <View className="w-4 h-4 rounded-sm" style={{ backgroundColor: elegida.color }} />
        ) : null}
        <Texto className={`flex-1 text-sm ${elegida ? 'text-white' : 'text-slate-500'}`} numberOfLines={1}>
          {elegida?.etiqueta ?? placeholder}
        </Texto>
        <ChevronDown size={16} color="#94a3b8" />
      </Pressable>

      <Modal visible={abierto} transparent animationType="slide" onRequestClose={() => setAbierto(false)}>
        <Pressable className="flex-1 bg-black/60" onPress={() => setAbierto(false)} />
        <View className="bg-slate-900 border-t border-slate-800 rounded-t-2xl max-h-[70%]">
          {titulo ? (
            <Texto className="text-sm font-medium text-white px-5 pt-4 pb-2">{titulo}</Texto>
          ) : null}
          <ScrollView contentContainerClassName="p-3 pb-8">
            {Object.entries(grupos).map(([grupo, lista]) => (
              <View key={grupo || 'sueltas'} className="gap-1">
                {grupo ? (
                  <Texto className="text-xs font-medium text-slate-400 uppercase tracking-wider px-3 pt-3 pb-1">
                    {grupo}
                  </Texto>
                ) : null}
                {lista.map(o => {
                  const esta = o.valor === value;
                  return (
                    <Pressable
                      key={o.valor || 'vacia'}
                      onPress={() => { onChange(o.valor); setAbierto(false); }}
                      className={`flex-row items-center gap-3 px-3 py-3 rounded-lg ${
                        esta ? 'bg-emerald-500/10' : 'active:bg-slate-800'
                      }`}
                    >
                      {o.color ? (
                        <View className="w-4 h-4 rounded-sm" style={{ backgroundColor: o.color }} />
                      ) : null}
                      <Texto className={`flex-1 text-sm ${esta ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {o.etiqueta}
                      </Texto>
                      {esta ? <Check size={16} color="#34d399" /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
