# Future hardware & on-device roadmap

The web MVP is **Phase 1**. The product it's reaching toward is an always-available companion on a device the loved one already has — or a dedicated tabletop device — with everything running **on-device**.

## Phase 2 — On her phone (Gemma 3n on Android)

[Gemma 3n](https://ai.google.dev/gemma) is purpose-built for on-device mobile inference (text **and** audio) through **Google AI Edge / MediaPipe (LLM Inference API)**. It runs fully offline on Android with INT4 quantization on the phone's CPU/GPU.

That means the same open model family powering this web app can run **entirely on her phone**:
- the Memory Vault lives on the phone,
- nothing is uploaded,
- it works with no internet,
- it costs nothing to run.

"Always running" is implemented as **always *available*** (a foreground service keeps the companion ready; she taps or uses a wake word to talk) — never silent, always-on recording. This respects the same privacy rules as the web app.

The existing `AIProvider` / `SpeechProvider` abstractions are shaped so a `GemmaEdgeProvider` (MediaPipe) can drop in without changing application logic.

## Phase 3 — A physical Storyhouse

A dedicated device for someone who doesn't use a phone comfortably:

- Raspberry Pi (or similar) running the local stack,
- a good far-field microphone and speaker,
- a warm ambient light that reflects presence state (listening / speaking / saving),
- a **physical privacy switch** that cuts the microphone in hardware — not just in software.

Optional presence sensing (e.g. an Arduino UNO Q) could shift the device from "resting" to "available" when someone enters the room — **only** as availability, never as covert recording.

All of this is documented as direction. The MVP does not claim any hardware it does not actually run on.
