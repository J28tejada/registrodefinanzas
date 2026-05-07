'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Bot, User, Trash2, Mic, MicOff, Check, X } from 'lucide-react';
import { formatCurrency, todayISO } from '@/lib/types';

interface TransactionProposal {
  type: 'expense' | 'income';
  scope: 'personal' | 'business';
  amount: number;
  category: string;
  description: string;
  date: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  proposal?: { data: TransactionProposal; status: 'pending' | 'confirmed' | 'rejected' };
}

const SUGGESTED = [
  'gasté 200 en comida hoy',
  '¿Cuánto gasté este mes?',
  'cobré 5000 de un cliente',
  '¿Cómo va mi negocio?',
];

const isSpeechSupported = () =>
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef('');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
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
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) throw new Error();

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

      const proposalIdx = fullText.indexOf('\n[PROPOSAL]');
      if (proposalIdx !== -1) {
        const visibleText = fullText.slice(0, proposalIdx).trim();
        const proposalJson = fullText.slice(proposalIdx + '\n[PROPOSAL]'.length);
        try {
          const data: TransactionProposal = JSON.parse(proposalJson);
          if (!data.date) data.date = todayISO();
          setMessages(prev => {
            const updated = [...prev];
            updated[assistantIndex] = {
              role: 'assistant',
              content: visibleText || `Voy a registrar ${data.type === 'expense' ? 'un gasto' : 'un ingreso'} de ${formatCurrency(data.amount)}.`,
              proposal: { data, status: 'pending' },
            };
            return updated;
          });
        } catch { /* show as text */ }
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
  }, [messages, loading]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    if (!isSpeechSupported()) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'es-MX';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setLiveTranscript('');
      transcriptRef.current = '';
    };

    recognition.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      transcriptRef.current = text;
      setLiveTranscript(text);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setLiveTranscript('');
      const text = transcriptRef.current;
      transcriptRef.current = '';
      if (text.trim()) sendMessage(text);
    };

    recognition.onerror = () => {
      setIsRecording(false);
      setLiveTranscript('');
      transcriptRef.current = '';
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isRecording, sendMessage]);

  const confirmTransaction = async (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg.proposal || msg.proposal.status !== 'pending') return;

    setMessages(prev => {
      const updated = [...prev];
      updated[msgIndex] = { ...updated[msgIndex], proposal: { ...msg.proposal!, status: 'confirmed' } };
      return updated;
    });

    try {
      const data = msg.proposal.data;
      // Ensure date is always YYYY-MM-DD; fall back to today if AI gave something invalid
      const dateValid = data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date);
      const safeDate = dateValid ? data.date : todayISO();

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, date: safeDate, source: 'voice' }),
      });
      if (!res.ok) throw new Error();

      window.dispatchEvent(new Event('finanzas:refresh'));
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ Registrado: ${data.type === 'expense' ? '−' : '+'} ${formatCurrency(data.amount)} en ${data.category} (${safeDate}).`,
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ No pude guardar. Intenta de nuevo.' }]);
    }
  };

  const rejectTransaction = (msgIndex: number) => {
    setMessages(prev => {
      const updated = [...prev];
      updated[msgIndex] = { ...updated[msgIndex], proposal: { ...updated[msgIndex].proposal!, status: 'rejected' } };
      return [...updated, { role: 'assistant', content: 'Entendido, no registré nada. ¿Algo más?' }];
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
            <Bot className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-semibold text-white text-sm">Asistente IA</h2>
            <p className="text-xs text-slate-500">Habla o escribe para registrar</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="p-2 text-slate-500 hover:text-rose-400 active:text-rose-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-6 w-full">
            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
              <Bot className="w-7 h-7 text-emerald-400" />
            </div>
            <div className="w-full">
              <p className="text-white font-semibold">Hola, soy tu asistente financiero</p>
              <p className="text-slate-400 text-sm mt-1">
                Dime qué gastaste o ganaste y lo registro por ti.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full">
              {SUGGESTED.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-sm px-3 py-2.5 bg-slate-800 active:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-3 h-3 text-emerald-400" />
                </div>
              )}
              <div className="max-w-[82%] space-y-2">
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-sm'
                    : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700'
                }`}>
                  {msg.content || (
                    <span className="flex gap-1 items-center text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pensando...
                    </span>
                  )}
                </div>

                {/* Transaction proposal card */}
                {msg.proposal && (
                  <div className={`rounded-xl border p-3 space-y-2.5 text-sm ${
                    msg.proposal.status === 'confirmed'
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : msg.proposal.status === 'rejected'
                      ? 'bg-slate-800/30 border-slate-700/50 opacity-50'
                      : 'bg-slate-800 border-slate-600'
                  }`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        msg.proposal.data.type === 'expense'
                          ? 'bg-rose-500/20 text-rose-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {msg.proposal.data.type === 'expense' ? '− Gasto' : '+ Ingreso'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        msg.proposal.data.scope === 'personal'
                          ? 'bg-violet-500/20 text-violet-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {msg.proposal.data.scope === 'personal' ? 'Personal' : 'Negocio'}
                      </span>
                      <span className="text-xs text-slate-500 ml-auto">{msg.proposal.data.date}</span>
                    </div>
                    <div>
                      <p className="text-white font-bold text-lg">{formatCurrency(msg.proposal.data.amount)}</p>
                      <p className="text-slate-300 text-sm">{msg.proposal.data.description}</p>
                      <p className="text-slate-500 text-xs">{msg.proposal.data.category}</p>
                    </div>
                    {msg.proposal.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => confirmTransaction(i)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 active:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          <Check className="w-4 h-4" /> Confirmar
                        </button>
                        <button
                          onClick={() => rejectTransaction(i)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-700 active:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
                        >
                          <X className="w-4 h-4" /> Cancelar
                        </button>
                      </div>
                    )}
                    {msg.proposal.status === 'confirmed' && (
                      <p className="text-xs text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Guardado
                      </p>
                    )}
                    {msg.proposal.status === 'rejected' && (
                      <p className="text-xs text-slate-500">Cancelado</p>
                    )}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="w-3 h-3 text-slate-300" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl mb-2 text-sm text-rose-300">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse flex-shrink-0" />
          <span className="flex-1 truncate">{liveTranscript || 'Escuchando...'}</span>
          <span className="text-xs text-rose-400">Toca mic para enviar</span>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-800 pt-3">
        <form
          onSubmit={e => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2"
        >
          {isSpeechSupported() ? (
            <button
              type="button"
              onClick={toggleRecording}
              className={`p-3 rounded-xl border transition-colors flex-shrink-0 ${
                isRecording
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 active:text-white active:bg-slate-700'
              }`}
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          ) : null}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={isRecording ? 'Escuchando...' : 'Escribe o usa el micrófono...'}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
            disabled={loading || isRecording}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || isRecording}
            className="p-3 bg-emerald-600 active:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
