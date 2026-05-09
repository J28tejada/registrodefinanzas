'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { Send, Loader2, Bot, User, Trash2, Mic, MicOff, Check, X, Banknote, ArrowLeftRight, CreditCard } from 'lucide-react';
import { formatCurrency, todayISO, Card, PaymentMethod } from '@/lib/types';

const MAX_STORED_MESSAGES = 100;

function storageKey(userId: string) {
  return `chat_history_${userId}`;
}

const paymentIcon: Record<PaymentMethod, React.ElementType> = { cash: Banknote, transfer: ArrowLeftRight, card: CreditCard };
const paymentLabel: Record<PaymentMethod, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta' };

interface TransactionProposal {
  type: 'expense' | 'income';
  scope: 'personal' | 'business';
  amount: number;
  category: string;
  description: string;
  date: string;
  payment_method?: PaymentMethod;
  card_name?: string;
}

interface ProposalItem {
  data: TransactionProposal;
  status: 'pending' | 'confirmed' | 'rejected';
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  proposals?: ProposalItem[];
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
  const { user } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [cards, setCards] = useState<Card[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef('');

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load history: localStorage first for instant render, then DB as source of truth
  useEffect(() => {
    if (!user?.id || historyLoaded) return;
    // Fast path: show localStorage immediately
    try {
      const raw = localStorage.getItem(storageKey(user.id));
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* ignore */ }
    // Authoritative path: load from DB (works across devices)
    fetch('/api/chat-history')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setMessages(data);
          try { localStorage.setItem(storageKey(user.id!), JSON.stringify(data)); } catch { /* ignore */ }
        }
      })
      .catch(() => { /* keep localStorage data on network failure */ })
      .finally(() => setHistoryLoaded(true));
  }, [user?.id, historyLoaded]);

  // Persist to localStorage immediately + debounce save to DB
  useEffect(() => {
    if (!user?.id || !historyLoaded) return;
    const toStore = messages.slice(-MAX_STORED_MESSAGES);
    try { localStorage.setItem(storageKey(user.id), JSON.stringify(toStore)); } catch { /* ignore */ }
    // Skip DB save while streaming (loading=true); the post-stream change will trigger it
    if (loading) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      fetch('/api/chat-history', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: toStore }),
      }).catch(() => { /* silent */ });
    }, 1500);
  }, [messages, user?.id, historyLoaded, loading]);

  useEffect(() => {
    fetch('/api/cards').then(r => r.json()).then(d => setCards(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

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

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { detail?: string; error?: string }).detail ?? (errData as { error?: string }).error ?? `Error ${res.status}`);
      }

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

      const firstProposalIdx = fullText.indexOf('\n[PROPOSAL]');
      if (firstProposalIdx !== -1) {
        const visibleText = fullText.slice(0, firstProposalIdx).trim();
        const proposals: ProposalItem[] = [];
        const marker = '\n[PROPOSAL]';
        let remaining = fullText.slice(firstProposalIdx);
        while (remaining.startsWith(marker)) {
          const jsonStart = marker.length;
          const nextIdx = remaining.indexOf(marker, jsonStart);
          const jsonStr = nextIdx !== -1 ? remaining.slice(jsonStart, nextIdx) : remaining.slice(jsonStart);
          try {
            const data: TransactionProposal = JSON.parse(jsonStr.trim());
            if (!data.date) data.date = todayISO();
            proposals.push({ data, status: 'pending' });
          } catch { /* skip malformed */ }
          remaining = nextIdx !== -1 ? remaining.slice(nextIdx) : '';
        }
        if (proposals.length > 0) {
          const defaultContent = proposals.length === 1
            ? `Voy a registrar ${proposals[0].data.type === 'expense' ? 'un gasto' : 'un ingreso'} de ${formatCurrency(proposals[0].data.amount)}.`
            : `Voy a registrar ${proposals.length} transacciones.`;
          setMessages(prev => {
            const updated = [...prev];
            updated[assistantIndex] = {
              role: 'assistant',
              content: visibleText || defaultContent,
              proposals,
            };
            return updated;
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setMessages(prev => {
        const updated = [...prev];
        updated[assistantIndex] = { role: 'assistant', content: `Error: ${msg}` };
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
      if (text.trim()) {
        setInput(text);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };

    recognition.onerror = () => {
      setIsRecording(false);
      setLiveTranscript('');
      transcriptRef.current = '';
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isRecording, sendMessage]);

  const saveProposal = async (data: TransactionProposal): Promise<void> => {
    const dateValid = data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date);
    const safeDate = dateValid ? data.date : todayISO();
    let cardId: string | undefined;
    let cardName: string | undefined;
    if (data.payment_method === 'card' && data.card_name) {
      const matched = cards.find(c =>
        c.name.toLowerCase().includes(data.card_name!.toLowerCase()) ||
        data.card_name!.toLowerCase().includes(c.name.toLowerCase())
      );
      if (matched) { cardId = matched.id; cardName = matched.name; }
      else { cardName = data.card_name; }
    }
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, date: safeDate, source: 'ai', paymentMethod: data.payment_method, cardId, cardName }),
    });
    if (!res.ok) throw new Error();
  };

  const confirmProposal = async (msgIndex: number, proposalIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg.proposals?.[proposalIndex] || msg.proposals[proposalIndex].status !== 'pending') return;

    setMessages(prev => {
      const updated = [...prev];
      const proposals = updated[msgIndex].proposals!.map((p, i) =>
        i === proposalIndex ? { ...p, status: 'confirmed' as const } : p
      );
      updated[msgIndex] = { ...updated[msgIndex], proposals };
      return updated;
    });

    try {
      await saveProposal(msg.proposals[proposalIndex].data);
      window.dispatchEvent(new Event('finanzas:refresh'));
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ No pude guardar. Intenta de nuevo.' }]);
    }
  };

  const confirmAllProposals = async (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg.proposals) return;
    const pending = msg.proposals.filter(p => p.status === 'pending');
    if (pending.length === 0) return;

    setMessages(prev => {
      const updated = [...prev];
      updated[msgIndex] = { ...updated[msgIndex], proposals: updated[msgIndex].proposals!.map(p => ({ ...p, status: 'confirmed' as const })) };
      return updated;
    });

    try {
      await Promise.all(pending.map(p => saveProposal(p.data)));
      window.dispatchEvent(new Event('finanzas:refresh'));
      setMessages(prev => [...prev, { role: 'assistant', content: `✅ ${pending.length} transacciones registradas.` }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ No pude guardar. Intenta de nuevo.' }]);
    }
  };

  const rejectProposal = (msgIndex: number, proposalIndex: number) => {
    setMessages(prev => {
      const updated = [...prev];
      const proposals = updated[msgIndex].proposals!.map((p, i) =>
        i === proposalIndex ? { ...p, status: 'rejected' as const } : p
      );
      updated[msgIndex] = { ...updated[msgIndex], proposals };
      return updated;
    });
  };

  const rejectAllProposals = (msgIndex: number) => {
    setMessages(prev => {
      const updated = [...prev];
      updated[msgIndex] = { ...updated[msgIndex], proposals: updated[msgIndex].proposals!.map(p => ({ ...p, status: 'rejected' as const })) };
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
            onClick={() => {
              setMessages([]);
              if (user?.id) {
                localStorage.removeItem(storageKey(user.id));
                fetch('/api/chat-history', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ messages: [] }),
                }).catch(() => {});
              }
            }}
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

                {/* Transaction proposal cards */}
                {msg.proposals && msg.proposals.length > 0 && (
                  <div className="space-y-2">
                    {msg.proposals.map((proposal, pi) => (
                      <div key={pi} className={`rounded-xl border p-3 space-y-2 text-sm ${
                        proposal.status === 'confirmed' ? 'bg-emerald-500/5 border-emerald-500/20'
                        : proposal.status === 'rejected' ? 'bg-slate-800/30 border-slate-700/50 opacity-40'
                        : 'bg-slate-800 border-slate-600'
                      }`}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${proposal.data.type === 'expense' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {proposal.data.type === 'expense' ? '− Gasto' : '+ Ingreso'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${proposal.data.scope === 'personal' ? 'bg-violet-500/20 text-violet-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {proposal.data.scope === 'personal' ? 'Personal' : 'Negocio'}
                          </span>
                          <span className="text-xs text-slate-500 ml-auto">{proposal.data.date}</span>
                        </div>
                        <div>
                          <p className="text-white font-bold text-lg">{formatCurrency(proposal.data.amount)}</p>
                          <p className="text-slate-300 text-sm">{proposal.data.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-slate-500 text-xs">{proposal.data.category}</p>
                            {proposal.data.payment_method && (() => {
                              const pm = proposal.data.payment_method!;
                              const PMIcon = paymentIcon[pm];
                              const label = pm === 'card' && proposal.data.card_name ? proposal.data.card_name : paymentLabel[pm];
                              return <span className="flex items-center gap-1 text-xs text-slate-400"><span>·</span><PMIcon className="w-3 h-3" />{label}</span>;
                            })()}
                          </div>
                        </div>
                        {proposal.status === 'pending' && (
                          <div className="flex gap-2">
                            <button onClick={() => confirmProposal(i, pi)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 active:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
                              <Check className="w-4 h-4" /> Confirmar
                            </button>
                            <button onClick={() => rejectProposal(i, pi)}
                              className="px-3 py-2 bg-slate-700 active:bg-slate-600 text-slate-400 rounded-lg text-sm transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {proposal.status === 'confirmed' && <p className="text-xs text-emerald-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Guardado</p>}
                        {proposal.status === 'rejected' && <p className="text-xs text-slate-500">Cancelado</p>}
                      </div>
                    ))}
                    {msg.proposals.length > 1 && msg.proposals.some(p => p.status === 'pending') && (
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => confirmAllProposals(i)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 active:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
                          <Check className="w-4 h-4" /> Confirmar todas
                        </button>
                        <button onClick={() => rejectAllProposals(i)}
                          className="px-3 py-2 bg-slate-700 active:bg-slate-600 text-slate-400 rounded-lg text-sm transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
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
