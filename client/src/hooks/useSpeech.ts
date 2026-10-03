import { useCallback, useEffect, useRef, useState } from 'react';

// Voice layer via the browser's built-in Web Speech API — the free, keyless
// default. (ElevenLabs / Whisper adapters can replace this later without
// touching the open-source reasoning core.)

type SR = any;

function getRecognition(): SR | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.continuous = true;
  r.interimResults = true;
  r.lang = 'en-US';
  return r;
}

export interface SpeechApi {
  sttSupported: boolean;
  ttsSupported: boolean;
  listening: boolean;
  interim: string;
  start: () => void;
  stop: () => void;
  speak: (text: string) => void;
  cancelSpeak: () => void;
  speaking: boolean;
}

export function useSpeech(onFinal: (text: string) => void): SpeechApi {
  const recRef = useRef<SR | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const sttSupported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!sttSupported) return;
    const rec = getRecognition();
    recRef.current = rec;
    if (!rec) return;

    rec.onresult = (e: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText);
      if (finalText.trim()) {
        setInterim('');
        onFinalRef.current(finalText.trim());
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);

    return () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
  }, [sttSupported]);

  const start = useCallback(() => {
    if (!recRef.current) return;
    try {
      recRef.current.start();
      setListening(true);
    } catch {
      /* already started */
    }
  }, []);

  const stop = useCallback(() => {
    if (!recRef.current) return;
    try {
      recRef.current.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!ttsSupported) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.96;
      u.pitch = 1.0;
      // Prefer a warm, natural English voice if available.
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => /en-US/.test(v.lang) && /female|Samantha|Aria|Jenny|Zira/i.test(v.name));
      if (preferred) u.voice = preferred;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [ttsSupported],
  );

  const cancelSpeak = useCallback(() => {
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [ttsSupported]);

  return { sttSupported, ttsSupported, listening, interim, start, stop, speak, cancelSpeak, speaking };
}
