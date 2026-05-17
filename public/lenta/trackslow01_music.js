// trackslow01 — Chill / playful procedural BGM
// Originalas: floor12_merge.js (F12 Pixel Art Bilijardas)
// Charakteris: relaxed pentatonic melody + soft sine pad + triangle bass
// Tempo: 76 BPM | Tonacija: C major | Loop: 64 step (4 akordai × 16 step)
// Akordai: C maj → A min → F maj → G maj (laisvas vi-IV-V variant)
// Mix: musicGain = 0.22 (tylesnis nei SFX 0.55)
//
// Naudojimas: kopijuok šį objektą, perduok savo AudioContext'ą per
//   _Track.start(audioCtx, masterDest);
// arba pakeisk _F12Audio referenciją į savo audio modulį.

const _Track_trackslow01 = {
  active: false,
  musicGain: null,
  bpm: 76,
  stepsPerBeat: 2,
  currentStep: 0,
  nextNoteTime: 0,
  lookahead: 0.10,
  schedulerTimer: null,
  ctx: null,
  destNode: null,
  chords: [
    { root: 48, notes: [60, 64, 67] }, // C major (C E G)
    { root: 45, notes: [57, 60, 64] }, // A minor (A C E)
    { root: 41, notes: [53, 57, 60] }, // F major (F A C)
    { root: 43, notes: [55, 59, 62] }, // G major (G B D)
  ],
  melody: [
    72, 0, 76, 0, 79, 0, 76, 72, 0, 79, 0, 81, 79, 76, 0, 0,
    69, 0, 72, 0, 76, 0, 72, 69, 0, 76, 0, 79, 76, 72, 0, 0,
    69, 0, 72, 0, 77, 0, 72, 69, 0, 77, 0, 81, 77, 72, 0, 0,
    71, 0, 74, 0, 79, 0, 74, 71, 0, 79, 0, 83, 79, 74, 0, 0,
  ],
  midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  start(audioCtx, masterDest) {
    if (this.active) return;
    this.ctx = audioCtx; this.destNode = masterDest || audioCtx.destination;
    if (!this.musicGain) {
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.destNode);
    } else {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setValueAtTime(0.22, this.ctx.currentTime);
    }
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.10;
    this.active = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._scheduler();
  },
  stop() {
    this.active = false;
    if (this.schedulerTimer) { clearTimeout(this.schedulerTimer); this.schedulerTimer = null; }
    if (!this.ctx || !this.musicGain) return;
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, this.ctx.currentTime);
    this.musicGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.25);
  },
  _scheduler() {
    if (!this.active) return;
    const c = this.ctx;
    const stepDur = 60 / this.bpm / this.stepsPerBeat;
    while (this.nextNoteTime < c.currentTime + this.lookahead) {
      this._playStep(this.currentStep, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.currentStep = (this.currentStep + 1) % 64;
    }
    this.schedulerTimer = setTimeout(() => this._scheduler(), 25);
  },
  _playStep(step, t, stepDur) {
    const c = this.ctx;
    const dest = this.musicGain;
    const chordIdx = Math.floor(step / 16) % this.chords.length;
    const chord = this.chords[chordIdx];
    const localStep = step % 16;

    // PAD — sine chord, lowpass 1.4kHz, fade-in/out
    if (localStep === 0) {
      const padDur = stepDur * 16;
      for (const midi of chord.notes) {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = this.midiToFreq(midi);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.045, t + 0.4);
        g.gain.setValueAtTime(0.045, t + padDur - 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + padDur);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 1400;
        osc.connect(lp); lp.connect(g); g.connect(dest);
        osc.start(t); osc.stop(t + padDur + 0.05);
      }
    }

    // BASS — root nota kas 4-tas step, triangle + lowpass 600Hz
    if (localStep % 4 === 0) {
      const dur = stepDur * 3.5;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = this.midiToFreq(chord.root);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.10, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 600;
      osc.connect(lp); lp.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + dur + 0.02);
    }

    // MELODY — kalimba/music-box pluck (triangle + sine oktava)
    const midi = this.melody[step];
    if (midi) {
      const dur = stepDur * 1.6;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = this.midiToFreq(midi);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 3500;
      osc.connect(lp); lp.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + dur + 0.02);
      // Octave double — sine, dar tylesnė
      const osc2 = c.createOscillator();
      const g2 = c.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = this.midiToFreq(midi + 12);
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
      osc2.connect(g2); g2.connect(dest);
      osc2.start(t); osc2.stop(t + dur + 0.02);
    }
  },
};

if (typeof window !== 'undefined') window._Track_trackslow01 = _Track_trackslow01;
