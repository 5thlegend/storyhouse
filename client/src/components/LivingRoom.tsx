import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import { useSpeech } from '../hooks/useSpeech';
import { PresenceOrb } from './PresenceOrb';

interface Turn {
  role: 'grandma' | 'storyhouse';
  text: string;
}

export function LivingRoom() {
  const { presence, setPresence, muted, setMuted, health } = useApp();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [saveOffer, setSaveOffer] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const speech = useSpeech((finalText) => {
    if (!muted) handleSend(finalText);
  });

  useEffect(() => {
    api.startConversation().then((r) => setConversationId(r.id)).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, saveOffer, streamingText]);

  // Keep presence in sync with speaking state.
  useEffect(() => {
    if (speech.speaking) setPresence('speaking');
    else if (speech.listening) setPresence('listening');
    else if (!busy && presence !== 'saving') setPresence(muted ? 'private' : 'available');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.speaking, speech.listening, busy, muted]);

  async function handleSend(text: string) {
    if (!text.trim() || !conversationId) return;
    speech.cancelSpeak();
    setDraft('');
    setTurns((t) => [...t, { role: 'grandma', text }]);
    setBusy(true);
    setStreamingText('');
    setPresence('processing');
    let full = '';
    try {
      await api.sendMessageStream(conversationId, text, {
        onToken: (chunk) => {
          full += chunk;
          setStreamingText(full);
          setPresence('speaking');
        },
        onDone: () => {
          setTurns((t) => [...t, { role: 'storyhouse', text: full.trim() }]);
          setStreamingText('');
          // Offer to keep anything that sounds like a real story (8+ words).
          if (text.trim().split(/\s+/).length >= 8) setSaveOffer(text);
          if (!muted && speech.ttsSupported && full.trim()) speech.speak(full.trim());
        },
        onError: () => {
          setTurns((t) => [
            ...t,
            {
              role: 'storyhouse',
              text: "I'm sorry — I had trouble just then. Your stories are still safe. Shall we try again?",
            },
          ]);
          setStreamingText('');
        },
      });
    } catch {
      setTurns((t) => [
        ...t,
        { role: 'storyhouse', text: "I'm sorry — I had trouble reaching the companion just now." },
      ]);
      setStreamingText('');
    } finally {
      setBusy(false);
    }
  }

  async function keepStory() {
    if (!saveOffer || !conversationId) return;
    const text = saveOffer;
    setSaveOffer(null);
    setPresence('saving');
    try {
      const r = await api.consolidate(conversationId, text, true);
      setToast(r.saved ? '✓ Kept that story safe in the Library.' : 'Nothing new to keep just yet.');
    } catch {
      setToast('Could not save just now — your words are still here.');
    } finally {
      setPresence(muted ? 'private' : 'available');
      setTimeout(() => setToast(null), 4000);
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (next) {
      speech.stop();
      speech.cancelSpeak();
      setPresence('private');
    } else {
      setPresence('available');
    }
  }

  function toggleMic() {
    if (muted) return;
    if (speech.listening) speech.stop();
    else speech.start();
  }

  return (
    <section className="mx-auto flex h-full max-w-3xl flex-col px-4">
      {/* Presence + privacy state — always visible, compact */}
      <div className="flex shrink-0 flex-col items-center pt-1">
        <PresenceOrb state={muted ? 'private' : presence} />
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <span
            className={`chip ${muted ? 'border-ember/40 bg-ember/10 text-ember' : 'border-sage/40 bg-sage/10 text-sage'}`}
          >
            <span aria-hidden>{muted ? '🔇' : '🎙️'}</span>
            {muted ? 'Mic off (private)' : 'Mic ready'}
          </span>
          {health && (
            <span className="chip" title={health.ai.active}>
              {health.ai.openModelOnline ? `🟢 ${health.ai.model}` : '🟡 AI offline'}
            </span>
          )}
        </div>
      </div>

      {/* Transcript — fills remaining height, scrolls internally */}
      <div
        ref={scrollRef}
        className="my-2 min-h-0 w-full flex-1 space-y-3 overflow-y-auto rounded-3xl bg-linen/40 p-3"
        aria-label="Conversation"
      >
        {turns.length === 0 && (
          <p className="py-8 text-center font-serif text-xl text-umber/70">
            Tap the microphone and tell me a story — or type below. I'll listen.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'grandma' ? 'justify-end' : 'justify-start'}`}>
            <p
              className={`max-w-[85%] rounded-3xl px-5 py-3 text-lg ${
                t.role === 'grandma'
                  ? 'bg-cocoa text-linen'
                  : 'border border-cocoa/10 bg-cream text-ink'
              }`}
            >
              {t.text}
            </p>
          </div>
        ))}
        {speech.interim && (
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-3xl bg-cocoa/50 px-5 py-3 text-lg italic text-linen">
              {speech.interim}…
            </p>
          </div>
        )}
        {streamingText && (
          <div className="flex justify-start">
            <p className="max-w-[85%] rounded-3xl border border-cocoa/10 bg-cream px-5 py-3 text-lg text-ink">
              {streamingText}
              <span className="ml-0.5 animate-pulse">▍</span>
            </p>
          </div>
        )}
        {busy && !streamingText && (
          <div className="flex justify-start">
            <p className="rounded-3xl border border-cocoa/10 bg-cream px-5 py-3 text-lg text-umber">
              <span className="animate-pulse">Storyhouse is thinking…</span>
            </p>
          </div>
        )}

        {/* Consent-driven save offer */}
        {saveOffer && (
          <div className="rounded-3xl border-2 border-gold/50 bg-gold/10 p-4 text-center">
            <p className="font-serif text-lg text-cocoa">That sounds like a story worth keeping.</p>
            <div className="mt-3 flex justify-center gap-3">
              <button className="btn-primary !py-3 !text-base" onClick={keepStory}>
                Keep this story
              </button>
              <button className="btn-ghost !py-3 !text-base" onClick={() => setSaveOffer(null)}>
                Not now
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="mx-auto mb-1 shrink-0 rounded-full bg-sage/20 px-4 py-1 font-sans text-sm text-sage">
          {toast}
        </div>
      )}

      {/* Primary controls — compact so the whole screen fits with no page scroll */}
      <div className="flex shrink-0 flex-col items-center gap-2 pb-2">
        <button
          onClick={toggleMic}
          disabled={muted || !speech.sttSupported}
          aria-pressed={speech.listening}
          className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl shadow-warm transition focus:outline-none focus-visible:ring-4 focus-visible:ring-gold/60 disabled:opacity-40 sm:h-20 sm:w-20 sm:text-4xl ${
            speech.listening ? 'bg-ember text-linen' : 'bg-cocoa text-linen hover:bg-ink'
          }`}
          title={speech.sttSupported ? 'Tap to talk' : 'Voice input not available in this browser'}
        >
          {speech.listening ? '◼' : '🎙️'}
        </button>
        <p className="font-sans text-xs text-umber sm:text-sm">
          {!speech.sttSupported
            ? 'Voice input isn’t available here — please type below.'
            : speech.listening
              ? 'Listening… take your time, then tap to finish'
              : 'Tap to talk'}
        </p>

        <form
          className="flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Or type here…"
            aria-label="Type your message"
            className="flex-1 rounded-2xl border-2 border-cocoa/20 bg-linen px-4 py-2.5 text-base focus:border-cocoa/50 focus:outline-none"
          />
          <button type="submit" className="btn-primary !py-2.5" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>

        <button
          className="font-sans text-sm text-umber/70 underline-offset-2 hover:underline"
          onClick={toggleMute}
        >
          {muted ? '🎙️ Turn microphone on' : '🔇 Private (mute microphone)'}
        </button>
      </div>
    </section>
  );
}
