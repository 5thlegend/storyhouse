// "Tap and tell me." Records her voice and turns it into words with Whisper.
// Nothing is kept: the recording is only used to hear what she asked for.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { pickMime } from '../studio/VoiceRecorder';
import { stopAll } from './voice';

export type ListenState = 'idle' | 'listening' | 'thinking' | 'nomic';

export function useListen(onHeard: (text: string) => void) {
  const [state, setState] = useState<ListenState>('idle');
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    stopAll();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState('thinking');
        let text = '';
        try {
          text = (await api.artListen(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/mp4' }))).text;
        } catch {
          text = '';
        }
        setState('idle');
        onHeard(text.trim());
      };
      rec.start();
      recorder.current = rec;
      setState('listening');
    } catch {
      setState('nomic');
    }
  }

  function stop() {
    recorder.current?.stop();
  }

  return { state, start, stop };
}
