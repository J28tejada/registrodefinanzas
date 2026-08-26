'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, Trash2, Mic } from 'lucide-react';
import VoiceInput from './VoiceInput';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_QUESTIONS = [
  '¿Cuánto gasté este mes?',
  '¿En qué categoría gasto más?',
  '¿Cómo va mi negocio?',
  '¿Cuál es mi balance total?',
];

export default function ChatInterface({
  /**
   * Cómo se resuelve el alto del panel. Lo decide quien lo usa porque depende
   * de qué más haya arriba: la conversación tiene que terminar justo donde
   * termina la pantalla para que el campo de escribir quede siempre a la vista.
   */
  alto = 'h-[calc(100dvh-7rem)] md:h-[calc(100vh-4rem)]',
}: { alto?: string } = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    const assistantIndex = newMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok || !res.body) throw new Error('Error en la respuesta');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const updated = [...prev];
          updated[assistantIndex] = { role: 'assistant', content: fullText };
          return updated;
        });
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[assistantIndex] = { role: 'assistant', content: 'Ocurrió un error. Intenta de nuevo.' };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceTranscript = (text: string) => {
    setInput(text);
    setShowVoice(false);
    inputRef.current?.focus();
  };

  return (
    <div className={`flex flex-col ${alto}`}>
      {/* Sin título ni avatar: la pestaña de arriba ya dice que este es el
          asistente, y en un teléfono esa cabecera se comía casi setenta píxeles
          de conversación para repetirlo. Queda solo lo que hace falta hacer, y
          únicamente cuando hay algo que borrar. */}
      {messages.length > 0 && (
        <div className="flex justify-end pb-2">
          <button
            onClick={() => setMessages([])}
            className="text-slate-500 hover:text-rose-400 transition-colors flex items-center gap-1.5 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
              <Bot className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-medium">Hola, soy tu asistente financiero</p>
              <p className="text-slate-400 text-sm mt-1">
                Pregúntame sobre tus gastos, ingresos o pide sugerencias de categorías.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-sm px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-sm'
                    : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700'
                }`}
              >
                {msg.content || (
                  <span className="flex gap-1 items-center text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pensando...
                  </span>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-slate-300" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Voice input */}
      {showVoice && (
        <div className="border-t border-slate-800 pt-3 pb-2">
          <VoiceInput onTranscript={handleVoiceTranscript} />
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-800 pt-4">
        <form
          onSubmit={e => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2"
        >
          <button
            type="button"
            onClick={() => setShowVoice(v => !v)}
            className={`p-2.5 rounded-xl border transition-colors flex-shrink-0 ${
              showVoice
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Escribe una pregunta o habla con el micrófono..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
