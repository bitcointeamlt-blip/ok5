# Task — Procedural Dark Synthwave BGM for Browser Game

Build a procedural Web Audio background music system in **JavaScript (vanilla, no libraries)** for an HTML5 browser game. The music must sound like **dark synthwave inspired by Gigaverse (https://gigaverse.io/play)** — listen to the game for reference if possible.

## What the user wants
- **Style**: Dark synthwave / mysterious electronic
- **Tempo**: 90–110 BPM
- **Tonality**: Minor / Phrygian / harmonic minor (A minor preferred, but flexible)
- **Length**: ~3 minutes before perceptible loop
- **Mood**: Dark, mysterious, atmospheric — but NOT boring or fatiguing
- **Critical**: After ~30 seconds the listener must NOT feel "this is the same beep over and over". Each section needs distinct **timbral identity**, not just different notes on the same synth.

## Current file
`C:\Users\p3p3l\Downloads\lenta\ui-copy\floor12_merge.js`

The existing music object lives at the top of the IIFE wrapper, identified by `const _F12Music = { ... }`. Replace or rewrite that object. **Keep the public API the same** so the game's `activate()` / `deactivate()` calls still work:

```js
window._F12Music = {
  start(),       // begin playback (called from activate())
  stop(),        // fade out (called from deactivate())
  active,        // boolean
};
```

## Existing infrastructure (do not duplicate)
- `_F12Audio` object exposes `_init()`, `ctx` (AudioContext), and `master` (GainNode at 0.55).
- `AudioContext` is created lazily with `{ latencyHint: 'interactive' }`.
- Music must route through its own `GainNode` connected to `_F12Audio.master`, with gain ~0.22 (music sits BELOW SFX).
- Game calls `_F12Music.start()` from `activate()` and `_F12Music.stop()` from `deactivate()`. First user gesture (mousedown) resumes the AudioContext.

## Current scheduler design (Chris Wilson lookahead)
```
setTimeout polls every 25ms.
For each tick: while (nextNoteTime < currentTime + 0.10) schedule next step.
stepDur = 60 / bpm / stepsPerBeat
stepsPerBeat = 2 (i.e. 8th notes per beat)
```
Use the same pattern unless you have a strong reason to change it. Sample-accurate timing matters.

## What was tried and why it failed
1. **Single 25s loop** — too repetitive within seconds.
2. **Two sections, one tempo bump** — sounded "arrhythmic" because off-beat heavy melody had no downbeat anchor.
3. **Multiple sections, all using same kalimba pluck (triangle + sine octave)** — user: "first 30s feels great, then becomes annoying — same beeping everywhere".
4. **6 sections with 6 different instruments (kalimba/bell/flute/marimba/harp/softsynth)** — partial improvement but melodies felt formulaic and similar in shape.
5. **Switching to dark synthwave (saw pad + sub bass + resonant filter lead)** — current state, user wants this style but better executed.

## Design hints (apply liberally)

### Synthwave instrument palette (must implement at least 3 distinct timbres):
- **Saw pad**: 2–3 detuned sawtooth oscillators per chord note (±5 to ±15 cents), lowpass 800–1500 Hz with optional slow LFO modulation. Slow attack (0.3–0.6s), long sustain.
- **Sub bass**: square or sine an octave below the chord root, lowpass 200–350 Hz, fast attack, exponential decay. Consider sidechain-style ducking when pad/lead hits.
- **Lead**: sawtooth + resonant lowpass envelope (Q=4–8). Filter sweeps 400Hz → 2800Hz over 50–80ms then closes back. Optional pitch glide between notes.
- **Arpeggio (very optional)**: 16th-note rolling sine arpeggio across chord tones, very low volume — adds motion without dominating.
- **Percussion (no sample, all synthesized)**:
  - Kick: sine 80Hz → 40Hz pitch drop + click. ~80ms.
  - Snare/clap: noise burst bandpassed at 1.5–2kHz, ~60ms.
  - Hi-hat: highpassed white noise burst, ~30ms, on off-beats.
- **Reverb-like feel** without ConvolverNode: delay nodes (180ms tap) feeding back at 25% with lowpass cut.

### Section structure (proven approach for ~3min)
- **Intro** (20–30s): pad + sparse lead, no drums. Sets atmosphere.
- **Main A** (40–60s, 2 loops): full ensemble — pad, bass, lead with melodic line, light percussion.
- **Bridge** (20–30s): drop the bass and percussion, leave pad + atmospheric lead. Gives ear rest.
- **Main B** (40s): variation of main with different melody contour or chord rotation.
- **Outro/transition** (20s): closes the cycle and leads back to intro.

### Chord ideas (A minor key)
- **Andalusian**: Am – G – F – E (Phrygian dominant — current attempt, decent but needs better arrangement)
- **Em harmonic minor**: Em – C – B7 – Am (very dramatic)
- **Dorian**: Am – D – F – G (less melancholic, more "adventurous")
- **Modal mix**: Am – Cm – F – Em (chromatic surprise)

### Avoid
- Pure pentatonic melodies (sound too "happy" / not dark enough)
- Triangle wave leads (sound too "kalimba" — user is tired of this)
- Quantized 8th-note melodies on every beat (sounds robotic)
- Same instrument across all sections (causes fatigue)

## Acceptance criteria
1. The music plays for 3 full minutes without the listener feeling "I've heard this loop already".
2. At least 3 distinct timbres rotate across sections (pad, lead, bass should each have variations).
3. There is at least one **bridge / breakdown** section where the texture significantly thins out.
4. Mood is consistently dark/mysterious — no major-key bright sections.
5. Music starts on first user interaction (autoplay policy compliant).
6. No external audio files. Pure Web Audio synthesis.
7. Existing `_F12Music.start()` / `.stop()` API preserved.

## Test environment
- Local dev server: `python -m http.server 8080` from `ui-copy/` directory
- Open `http://localhost:8080/` → enter game → press F12 to enter the music context
- First mousedown unlocks AudioContext

## Existing reference (ALREADY WORKS WELL — KEEP THIS APPROACH)
The chill kalimba version is saved as a standalone reference at `ui-copy/trackslow01_music.js`. The user explicitly liked this one. Study its scheduler structure (lookahead pattern, section system, midi-to-freq helper) — replicate the architecture, just swap the timbres and chord palette.

## Deliverable
Replace `_F12Music` object in `floor12_merge.js`. Provide the full new code block. Comments in code can be in English or Lithuanian (user is Lithuanian — Lithuanian preferred but not required).
