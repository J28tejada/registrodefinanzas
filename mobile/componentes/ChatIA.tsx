import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Bot, Loader2, Send, Trash2, User } from 'lucide-react-native';
import Texto from './Texto';
import { FALTA_LA_API, hayApi, llamarApi } from '../lib/api';

interface Mensaje {
  role: 'user' | 'assistant';
  content: string;
}

const SUGERENCIAS = [
  '¿Cuánto gasté este mes?',
  '¿En qué categoría gasto más?',
  '¿Cómo va mi negocio?',
  '¿Cuál es mi balance total?',
];

/**
 * El gemelo de components/ChatInterface.tsx.
 *
 * Dos diferencias, las dos por lo mismo —acá no hay navegador—:
 *
 * 1. El micrófono no está. La web lo resuelve con la Web Speech API, que en
 *    React Native no existe; poner un botón que no hace nada es peor que no
 *    ponerlo. Dictar se hace con el teclado del sistema, que ya trae su propio
 *    micrófono y funciona en cualquier campo de texto.
 * 2. La conversación se pide a la app web y no a la base, porque la clave del
 *    modelo es un secreto del servidor. Es la única pantalla que lo necesita.
 */
export default function ChatIA() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState('');
  const [cargando, setCargando] = useState(false);
  const lista = useRef<ScrollView>(null);

  useEffect(() => {
    lista.current?.scrollToEnd({ animated: true });
  }, [mensajes]);

  const enviar = async (texto: string) => {
    const limpio = texto.trim();
    if (!limpio || cargando) return;

    const nuevos: Mensaje[] = [...mensajes, { role: 'user', content: limpio }];
    setMensajes(nuevos);
    setEntrada('');
    setCargando(true);

    const indice = nuevos.length;
    setMensajes(previos => [...previos, { role: 'assistant', content: '' }]);

    const pisar = (contenido: string) => setMensajes(previos => {
      const copia = [...previos];
      copia[indice] = { role: 'assistant', content: contenido };
      return copia;
    });

    try {
      const res = await llamarApi('/api/ai/chat', { method: 'POST', body: { messages: nuevos } });
      if (!res.ok || !res.body) throw new Error('Error en la respuesta');

      const lector = res.body.getReader();
      const decodificador = new TextDecoder();
      let completo = '';

      while (true) {
        const { done, value } = await lector.read();
        if (done) break;
        completo += decodificador.decode(value, { stream: true });
        pisar(completo);
      }
    } catch (err) {
      pisar(err instanceof Error && err.message === FALTA_LA_API
        ? FALTA_LA_API
        : 'Ocurrió un error. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <View className="flex-1">
      {/* Sin título ni avatar: la pestaña de arriba ya dice que este es el
          asistente, y en un teléfono esa cabecera se comía casi setenta píxeles
          de conversación para repetirlo. */}
      {mensajes.length > 0 ? (
        <View className="flex-row justify-end pb-2">
          <Pressable
            onPress={() => setMensajes([])}
            className="flex-row items-center gap-1.5"
          >
            <Trash2 size={14} color="#64748b" />
            <Texto className="text-slate-500 text-xs">Limpiar</Texto>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        ref={lista}
        className="flex-1"
        contentContainerClassName="py-4 gap-4"
        keyboardShouldPersistTaps="handled"
      >
        {mensajes.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-4">
            <View className="w-16 h-16 bg-emerald-500/10 rounded-2xl items-center justify-center">
              <Bot size={32} color="#34d399" />
            </View>
            <View className="items-center">
              <Texto className="text-white font-medium">Hola, soy tu asistente financiero</Texto>
              <Texto className="text-slate-400 text-sm mt-1 text-center">
                Pregúntame sobre tus gastos, ingresos o pide sugerencias de categorías.
              </Texto>
            </View>
            <View className="gap-2 w-full" style={{ maxWidth: 448 }}>
              {SUGERENCIAS.map(q => (
                <Pressable
                  key={q}
                  onPress={() => enviar(q)}
                  className="px-3 py-2 bg-slate-800 active:bg-slate-700 border border-slate-700 rounded-lg"
                >
                  <Texto className="text-sm text-slate-300">{q}</Texto>
                </Pressable>
              ))}
            </View>
            {!hayApi ? (
              <Texto className="text-2xs text-amber-400 text-center">{FALTA_LA_API}</Texto>
            ) : null}
          </View>
        ) : (
          mensajes.map((msg, i) => (
            <View
              key={i}
              className={`flex-row gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' ? (
                <View className="w-7 h-7 bg-emerald-500/10 border border-emerald-500/20 rounded-lg items-center justify-center mt-0.5">
                  <Bot size={14} color="#34d399" />
                </View>
              ) : null}
              <View
                className={`rounded-2xl px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 rounded-br-sm'
                    : 'bg-slate-800 rounded-bl-sm border border-slate-700'
                }`}
                style={{ maxWidth: '80%' }}
              >
                {msg.content ? (
                  <Texto className={`text-sm ${msg.role === 'user' ? 'text-white' : 'text-slate-200'}`}>
                    {msg.content}
                  </Texto>
                ) : (
                  <View className="flex-row gap-1 items-center">
                    <Loader2 size={14} color="#94a3b8" />
                    <Texto className="text-sm text-slate-400">Pensando...</Texto>
                  </View>
                )}
              </View>
              {msg.role === 'user' ? (
                <View className="w-7 h-7 bg-slate-700 rounded-lg items-center justify-center mt-0.5">
                  <User size={14} color="#cbd5e1" />
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      <View className="border-t border-slate-800 pt-4">
        <View className="flex-row gap-2">
          <TextInput
            value={entrada}
            onChangeText={setEntrada}
            onSubmitEditing={() => enviar(entrada)}
            placeholder="Escribe una pregunta…"
            placeholderTextColor="#64748b"
            editable={!cargando}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm"
          />
          <Pressable
            onPress={() => enviar(entrada)}
            disabled={!entrada.trim() || cargando}
            accessibilityLabel="Enviar"
            style={!entrada.trim() || cargando ? { opacity: 0.4 } : undefined}
            className="p-2.5 bg-emerald-600 active:bg-emerald-500 rounded-xl items-center justify-center"
          >
            {cargando ? <Loader2 size={16} color="#ffffff" /> : <Send size={16} color="#ffffff" />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
