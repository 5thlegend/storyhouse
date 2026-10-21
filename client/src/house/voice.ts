// Sound on her iPad. One thing plays at a time: a family member's own recorded
// voice, or Storyhouse's own (clearly synthetic) reading voice — never a voice
// made to sound like a relative.

let current: HTMLAudioElement | null = null;
let onEnd: (() => void) | null = null;

export function stopAll(): void {
  if (current) {
    current.pause();
    current = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  const cb = onEnd;
  onEnd = null;
  cb?.();
}

/** Play a family recording. Resolves when it finishes or is stopped. */
export function playRecording(url: string): Promise<void> {
  stopAll();
  return new Promise((resolve) => {
    const audio = new Audio(url);
    current = audio;
    onEnd = resolve;
    const done = () => {
      if (current === audio) current = null;
      onEnd = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

/** Read words aloud in Storyhouse's own voice. */
export function speak(text: string): Promise<void> {
  stopAll();
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.85; // unhurried
    u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find((v) => v.lang.startsWith('en') && v.localService) ?? voices.find((v) => v.lang.startsWith('en'));
    if (en) u.voice = en;
    onEnd = resolve;
    u.onend = () => {
      onEnd = null;
      resolve();
    };
    u.onerror = u.onend;
    window.speechSynthesis.speak(u);
  });
}
