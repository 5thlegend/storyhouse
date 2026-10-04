import { useCallback, useEffect, useRef, useState } from 'react';

// Voice layer via the browser's built-in Web Speech API — the free, keyless
// default. (ElevenLabs / Whisper adapters can replace this later without
// touching the open-source reasoning core.)
//
// Designed for an elderly storyteller: it does NOT send the moment she pauses.
// It accumulates what she says and only sends after a longer silence, and it
// keeps listening through natural pauses, so she can take her time.

type SR = any;

const SILENCE_MS = 3000; // how long a pause before we treat the thought as finished

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

  const bufferRef = useRef(''); // accumulated finalized speech, not yet sent
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldListen = useRef(false); // user intends to be listening

  const sttSupported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const flush = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
    const text = bufferRef.current.trim();
    bufferRef.current = '';
    setInterim('');
    if (text) onFinalRef.current(text);
  }, []);

  const armSilence = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => flush(), SILENCE_MS);
  }, [flush]);

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
      if (finalText) {
        bufferRef.current = (bufferRef.current + ' ' + finalText).trim();
      }
      // Show everything captured so far so she can see it's listening.
      setInterim((bufferRef.current + ' ' + interimText).trim());
      // Any speech (final or interim) resets the silence countdown.
      armSilence();
    };

    rec.onend = () => {
      // Chrome stops recognition periodically; if she still wants to talk,
      // restart so long pauses don't end the session.
      if (shouldListen.current) {
        try {
          rec.start();
        } catch {
          /* already starting */
        }
      } else {
        setListening(false);
      }
    };
    rec.onerror = () => {
      /* keep shouldListen; onend will restart if appropriate */
    };

    return () => {
      shouldListen.current = false;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
  }, [sttSupported, armSilence]);

  const start = useCallback(() => {
    if (!recRef.current) return;
    shouldListen.current = true;
    bufferRef.current = '';
    try {
      recRef.current.start();
      setListening(true);
    } catch {
      /* already started */
    }
  }, []);

  const stop = useCallback(() => {
    shouldListen.current = false;
    setListening(false);
    flush(); // send whatever she said before stopping
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
  }, [flush]);

  const speak = useCallback(
    (text: string) => {
      if (!ttsSupported) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.96;
      u.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) => /en-US/.test(v.lang) && /female|Samantha|Aria|Jenny|Zira/i.test(v.name),
      );
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
