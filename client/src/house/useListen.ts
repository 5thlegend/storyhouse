// "Tap and tell me." Listens for one thing she says and turns it into words
// with Whisper. It notices by itself when she has finished (no button needed),
// though "That's it" still works. Nothing is kept: the recording is only used
// to hear what she asked for.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { openEars, type Ears } from './ears';
import { stopAll } from './voice';

export type ListenState = 'idle' | 'listening' | 'thinking' | 'nomic';

const WAIT_FOR_WORDS_MS = 12_000;

export function useListen(onHeard: (text: string) => void) {
  const [state, setState] = useState<ListenState>('idle');
  const ears = useRef<Ears | null>(null);
  const timer = useRef<number>();
  const heard = useRef(onHeard);
  heard.current = onHeard;

  function close() {
    window.clearTimeout(timer.current);
    ears.current?.close();
    ears.current = null;
  }
  useEffect(() => close, []);

  async function start() {
    stopAll();
    close();
    try {
      ears.current = await openEars({
        onStart: () => window.clearTimeout(timer.current),
        onUtterance: async (wav) => {
          close();
          setState('thinking');
          let text = '';
          try {
            text = (await api.artListen(wav)).text;
          } catch {
            text = '';
          }
          setState('idle');
          heard.current(text.trim());
        },
      });
      setState('listening');
      // If she doesn't say anything, quietly stop and let her try again.
      timer.current = window.setTimeout(() => {
        if (ears.current?.hearing) return;
        close();
        setState('idle');
        heard.current('');
      }, WAIT_FOR_WORDS_MS);
    } catch {
      setState('nomic');
    }
  }

  function stop() {
    if (ears.current?.hearing) ears.current.finish();
    else {
      close();
      setState('idle');
      heard.current('');
    }
  }

  return { state, start, stop };
}
