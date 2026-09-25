'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Square, Loader2 } from 'lucide-react';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onInterpreting?: (loading: boolean) => void;
  className?: string;
}

type RecordingState = 'idle' | 'recording' | 'processing';

export default function VoiceInput({ onTranscript, onInterpreting, className = '' }: VoiceInputProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const startRecording = useCallback(() => {
    setError('');
    setTranscript('');

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'es-MX';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setState('recording');

    recognition.onresult = (event) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(prev => prev + final || interim);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setError(`Error de micrófono: ${event.error}`);
      }
      setState('idle');
    };

    recognition.onend = () => {
      if (state === 'recording') setState('idle');
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [state]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setState('idle');
  }, []);

  const handleSubmitTranscript = useCallback((text: string) => {
    if (!text.trim()) return;
    setState('processing');
    onInterpreting?.(true);
    onTranscript(text);
    setTranscript('');
    setState('idle');
    onInterpreting?.(false);
  }, [onTranscript, onInterpreting]);

  if (!isSupported) {
    return (
      <div className={`flex items-center gap-2 text-tinta-2 text-sm ${className}`}>
        <MicOff className="w-4 h-4" />
        <span>Tu navegador no soporta entrada de voz. Usa Chrome o Edge.</span>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        {state === 'idle' && (
          <button
            onClick={startRecording}
            type="button"
            className="relative flex items-center gap-2 px-4 py-2 bg-hundido hover:bg-presionado border border-linea-fuerte rounded-lg text-sm text-tinta transition-colors"
          >
            <Mic className="w-4 h-4 text-acento" />
            Hablar
          </button>
        )}

        {state === 'recording' && (
          <button
            onClick={stopRecording}
            type="button"
            className="relative flex items-center gap-2 px-4 py-2 bg-peligro/20 border border-peligro/50 rounded-lg text-sm text-peligro transition-colors"
          >
            <span className="relative flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-peligro animate-pulse" />
              Grabando... (toca para detener)
            </span>
          </button>
        )}

        {state === 'processing' && (
          <div className="flex items-center gap-2 text-sm text-tinta-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Interpretando...
          </div>
        )}
      </div>

      {transcript && (
        <div className="bg-hundido border border-linea-fuerte rounded-lg p-3 space-y-2">
          <p className="text-sm text-tinta">{transcript}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleSubmitTranscript(transcript)}
              className="px-3 py-1 bg-primario hover:bg-primario/85 text-sobre-primario text-xs rounded-md transition-colors"
            >
              Interpretar con IA
            </button>
            <button
              type="button"
              onClick={() => { setTranscript(''); setState('idle'); }}
              className="px-3 py-1 bg-presionado hover:bg-presionado text-tinta text-xs rounded-md transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-peligro flex items-center gap-1">
          <Square className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}
