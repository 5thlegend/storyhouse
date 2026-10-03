import type { PresenceState } from '../store';

const LABELS: Record<PresenceState, string> = {
  idle: 'Resting',
  available: "I'm here.",
  listening: "I'm listening…",
  processing: 'Let me think about that…',
  speaking: 'Speaking…',
  saving: 'Keeping that story safe…',
  private: 'Private — microphone off',
};

const COLORS: Record<PresenceState, string> = {
  idle: 'from-cocoa/40 to-umber/30',
  available: 'from-gold/70 to-ember/40',
  listening: 'from-sage/80 to-gold/50',
  processing: 'from-plum/70 to-gold/40',
  speaking: 'from-gold/80 to-ember/50',
  saving: 'from-sage/80 to-plum/50',
  private: 'from-cocoa/30 to-cocoa/20',
};

export function PresenceOrb({ state, size = 180 }: { state: PresenceState; size?: number }) {
  const active = state === 'listening' || state === 'speaking' || state === 'processing';
  return (
    <div className="relative flex flex-col items-center" aria-live="polite">
      <div className="relative" style={{ width: size, height: size }}>
        {active && (
          <>
            <span
              className={`absolute inset-0 rounded-full bg-gradient-to-br ${COLORS[state]} animate-ripple`}
            />
            <span
              className={`absolute inset-0 rounded-full bg-gradient-to-br ${COLORS[state]} animate-ripple`}
              style={{ animationDelay: '1.1s' }}
            />
          </>
        )}
        <div
          className={`absolute inset-0 rounded-full bg-gradient-to-br ${COLORS[state]} shadow-lamp ${
            state !== 'private' ? 'animate-breathe' : ''
          }`}
        />
        <div className="absolute inset-[22%] rounded-full bg-linen/70 blur-sm" />
        <div className="absolute inset-[34%] rounded-full bg-linen/90" />
      </div>
      <p className="mt-6 font-serif text-2xl text-cocoa" role="status">
        {LABELS[state]}
      </p>
    </div>
  );
}
