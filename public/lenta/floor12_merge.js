// floor12_merge.js — F12 "Merge Forge Combat"

// Inspiracija: Suika Game (TomboFry/suika-game) + tavo dice roguelike screenshot

// Layout: lane'ai virsuje (kova), arena apaciuje (top-down view su 3/4 tilt'u)

// Launcher: vidury kairej arenos puses, fires into arena (top-down fizika)

(function () {

  'use strict';

  // ── Mini audio (savarankiškas — globalus SFX yra no-op) ────────────

  const _F12Audio = {

    ctx: null,

    master: null,

    _init() {

      if (this.ctx) return;

      try {

        const Ctor = window.AudioContext || window.webkitAudioContext;

        // latencyHint: 'interactive' — minimaliausias output buferis (~10-20ms vietoj ~50-100ms default)

        this.ctx = new Ctor({ latencyHint: 'interactive' });

        this.master = this.ctx.createGain();

        this.master.gain.value = 0.55;

        this.master.connect(this.ctx.destination);

        // Pre-warm: trumpas tylus tap'sas, kad audio thread'as pabustų prieš pirmą realų garsą

        try {

          const o = this.ctx.createOscillator();

          const g = this.ctx.createGain();

          g.gain.value = 0.0001;

          o.connect(g); g.connect(this.master);

          o.start(); o.stop(this.ctx.currentTime + 0.01);

        } catch (_) {}

      } catch (e) { this.ctx = null; }

    },

    _osc(freq, dur, vol, type, drift, dest) {

      const c = this.ctx;

      const t0 = c.currentTime;

      const osc = c.createOscillator();

      const g = c.createGain();

      osc.type = type;

      osc.frequency.setValueAtTime(freq, t0);

      if (drift) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq + drift), t0 + dur);

      g.gain.setValueAtTime(0.0001, t0);

      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);

      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(g); g.connect(dest || this.master);

      osc.start(t0); osc.stop(t0 + dur + 0.02);

    },

    _noiseBurst(dur, vol, lpFreq, dest) {

      const c = this.ctx;

      const t0 = c.currentTime;

      const sr = c.sampleRate;

      const len = Math.max(1, Math.floor(sr * dur));

      const buf = c.createBuffer(1, len, sr);

      const data = buf.getChannelData(0);

      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

      const src = c.createBufferSource();

      src.buffer = buf;

      const lp = c.createBiquadFilter();

      lp.type = 'lowpass';

      lp.frequency.setValueAtTime(lpFreq, t0);

      lp.frequency.exponentialRampToValueAtTime(Math.max(80, lpFreq * 0.3), t0 + dur);

      const g = c.createGain();

      g.gain.setValueAtTime(vol, t0);

      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      src.connect(lp); lp.connect(g); g.connect(dest || this.master);

      src.start(t0); src.stop(t0 + dur + 0.02);

    },

    // ── Kardo kirtis — skull melee ataka (metalinis „swish + clang") ──

    swordHit() {

      this._init(); if (!this.ctx) return;

      this._noiseBurst(0.05, 0.09, 4200);          // greitas „swish" (ašmenų pjūvis)

      this._osc(840, 0.10, 0.06, 'square', -520);  // metalinis „clang" (kontaktas)

      this._osc(1300, 0.07, 0.04, 'triangle', -760);

    },

    // ── Mažas „plip" — kraujo lašelis nukrenta ant žemės (labai tylus, wet tick) ──

    bloodDrip() {

      this._init(); if (!this.ctx) return;

      const f = 175 + Math.random() * 150;

      this._osc(f, 0.05, 0.045, 'sine', -90);     // trumpas žemyn slystantis blip (lašelis)

      this._noiseBurst(0.028, 0.02, 1100);        // mažas drėgnas „splat" tekstūra

    },

    // ── Silpnas "fit" — spygliams iškylant / susileidžiant (labai tylus) ──

    trapFit() {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      if (c.state === 'suspended') c.resume();

      const t0 = c.currentTime;

      // 1) Minkštas oro pūstelėjimas — trumpas lowpass'intas noise (~35ms)

      {

        const sr = c.sampleRate;

        const dur = 0.035;

        const len = Math.floor(sr * dur);

        const buf = c.createBuffer(1, len, sr);

        const data = buf.getChannelData(0);

        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);

        const src = c.createBufferSource(); src.buffer = buf;

        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;

        const g = c.createGain(); g.gain.setValueAtTime(0.055, t0);

        src.connect(lp); lp.connect(g); g.connect(this.master);

        src.start(t0); src.stop(t0 + dur + 0.01);

      }

      // 2) Tylus mid blip — greitas sine, suteikia "fit" toną

      {

        const osc = c.createOscillator(); const g = c.createGain();

        osc.type = 'sine';

        osc.frequency.setValueAtTime(680, t0);

        osc.frequency.exponentialRampToValueAtTime(420, t0 + 0.04);

        g.gain.setValueAtTime(0.0001, t0);

        g.gain.exponentialRampToValueAtTime(0.045, t0 + 0.006);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + 0.06);

      }

    },

    // ── Spąstų atsiradimas — trumpas garsiukas: žemė prasiveria + metalas iškyla ──

    trapSpawn() {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      if (c.state === 'suspended') c.resume();

      const t0 = c.currentTime;

      // 1) Žemas thud — žemė prasiveria (sawtooth descending)

      {

        const osc = c.createOscillator(); const g = c.createGain();

        osc.type = 'sawtooth';

        osc.frequency.setValueAtTime(150, t0);

        osc.frequency.exponentialRampToValueAtTime(48, t0 + 0.14);

        g.gain.setValueAtTime(0.32, t0);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);

        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;

        osc.connect(lp); lp.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + 0.18);

      }

      // 2) Dulkių/žemių crunch — lowpassed noise burst

      this._noiseBurst(0.12, 0.14, 1200);

      // 3) Metalinis "shink" — spygliai iškyla (square rising, trumpas)

      {

        const osc = c.createOscillator(); const g = c.createGain();

        osc.type = 'square';

        osc.frequency.setValueAtTime(320, t0 + 0.04);

        osc.frequency.exponentialRampToValueAtTime(1100, t0 + 0.13);

        g.gain.setValueAtTime(0.0001, t0 + 0.04);

        g.gain.exponentialRampToValueAtTime(0.10, t0 + 0.06);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);

        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;

        osc.connect(lp); lp.connect(g); g.connect(this.master);

        osc.start(t0 + 0.04); osc.stop(t0 + 0.18);

      }

    },

    // ── Frost Reverse aktyvavimas — ledinis "apsisukimo" garsas (~500ms) ──

    frostReverse() {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      if (c.state === 'suspended') c.resume();

      const t0 = c.currentTime;

      // 1) "Apsisukimo" sweep — sine krenta tada kyla (reversal pojūtis)

      {

        const osc = c.createOscillator(); const g = c.createGain();

        osc.type = 'sine';

        osc.frequency.setValueAtTime(620, t0);

        osc.frequency.exponentialRampToValueAtTime(150, t0 + 0.22);   // krenta

        osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.46);   // kyla atgal

        g.gain.setValueAtTime(0.0001, t0);

        g.gain.exponentialRampToValueAtTime(0.20, t0 + 0.03);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + 0.52);

      }

      // 2) Ledinis žemas whoosh — lowpassed noise

      this._noiseBurst(0.32, 0.13, 900);

      // 3) Šaltos varpelio harmonikos — high sine shimmer (ledo blizgesys)

      [1320, 1760, 2200].forEach((f, i) => {

        const t = t0 + 0.06 + i * 0.05;

        const osc = c.createOscillator(); const g = c.createGain();

        osc.type = 'sine';

        osc.frequency.setValueAtTime(f, t);

        g.gain.setValueAtTime(0.0001, t);

        g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);

        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

        osc.connect(g); g.connect(this.master);

        osc.start(t); osc.stop(t + 0.3);

      });

      // 4) Žemas sub thump — galios pojūtis

      {

        const osc = c.createOscillator(); const g = c.createGain();

        osc.type = 'sine';

        osc.frequency.setValueAtTime(90, t0);

        osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.25);

        g.gain.setValueAtTime(0.28, t0);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + 0.3);

      }

    },

    // ── Frost Reverse pabaiga — švelnus "atšilimo" garsiukas (~300ms) ──

    frostReverseEnd() {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      if (c.state === 'suspended') c.resume();

      const t0 = c.currentTime;

      // Kylanti švelni arpeggio — efektas atsileidžia

      [440, 587, 740].forEach((f, i) => {

        const t = t0 + i * 0.06;

        const osc = c.createOscillator(); const g = c.createGain();

        osc.type = 'triangle';

        osc.frequency.setValueAtTime(f, t);

        g.gain.setValueAtTime(0.0001, t);

        g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);

        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

        osc.connect(g); g.connect(this.master);

        osc.start(t); osc.stop(t + 0.2);

      });

      // Minkštas šnaresys — ledas tirpsta

      this._noiseBurst(0.14, 0.05, 1400);

    },

    // ── Sienos atsiradimas — akmens blokai stojasi sluoksniais iš apačios į viršų ──

    wallSpawn() {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      if (c.state === 'suspended') c.resume();

      const t0 = c.currentTime;

      // Vienas akmens bloko "thunk" — žemas triangle thud + trumpas noise click

      const blockThunk = (delay, freq, vol) => {

        const t = t0 + delay;

        // Triangle thud

        const osc = c.createOscillator(); const g = c.createGain();

        osc.type = 'triangle';

        osc.frequency.setValueAtTime(freq, t);

        osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.10);

        g.gain.setValueAtTime(vol, t);

        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);

        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;

        osc.connect(lp); lp.connect(g); g.connect(this.master);

        osc.start(t); osc.stop(t + 0.15);

        // Trumpas akmens click (noise burst)

        const sr = c.sampleRate;

        const cd = 0.012;

        const len = Math.floor(sr * cd);

        const buf = c.createBuffer(1, len, sr);

        const data = buf.getChannelData(0);

        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);

        const src = c.createBufferSource(); src.buffer = buf;

        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 1.2;

        const cg = c.createGain(); cg.gain.setValueAtTime(vol * 0.5, t);

        src.connect(bp); bp.connect(cg); cg.connect(this.master);

        src.start(t); src.stop(t + cd + 0.01);

      };

      // 5 blokų sluoksniai stojasi iš apačios (žemas tonas) į viršų (aukštesnis),

      // su greitėjančiu tempu — siena "užsistato" per ~480ms

      const delays = [0, 0.11, 0.205, 0.285, 0.345];

      const freqs  = [70, 95, 120, 150, 185];

      for (let i = 0; i < 5; i++) {

        blockThunk(delays[i], freqs[i], 0.30 - i * 0.018);

      }

      // Žemas foundation sub — visą laiką po blokais

      {

        const osc = c.createOscillator(); const g = c.createGain();

        osc.type = 'sine';

        osc.frequency.setValueAtTime(48, t0);

        osc.frequency.exponentialRampToValueAtTime(36, t0 + 0.5);

        g.gain.setValueAtTime(0.0001, t0);

        g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.04);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + 0.52);

      }

      // Galutinis "lock-in" — siena užsifiksuoja (po paskutinio bloko)

      {

        const tEnd = t0 + 0.42;

        const osc = c.createOscillator(); const g = c.createGain();

        osc.type = 'square';

        osc.frequency.setValueAtTime(220, tEnd);

        osc.frequency.exponentialRampToValueAtTime(90, tEnd + 0.09);

        g.gain.setValueAtTime(0.14, tEnd);

        g.gain.exponentialRampToValueAtTime(0.0001, tEnd + 0.12);

        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;

        osc.connect(lp); lp.connect(g); g.connect(this.master);

        osc.start(tEnd); osc.stop(tEnd + 0.14);

      }

    },

    // ── Prison bars closing — paprastas, aiškus „grotos užsiveria" garsas ──

    // 3 sluoksniai: trumpas whoosh + heavy thunk + metal ring. Total ~220ms.

    barsClose() {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      if (c.state === 'suspended') c.resume();

      const t0 = c.currentTime;

      // 1) Trumpas whoosh (krintančių grotų oras) — 120ms

      {

        const sr = c.sampleRate;

        const dur = 0.12;

        const len = Math.floor(sr * dur);

        const buf = c.createBuffer(1, len, sr);

        const data = buf.getChannelData(0);

        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len * 0.6);

        const src = c.createBufferSource(); src.buffer = buf;

        const lp = c.createBiquadFilter();

        lp.type = 'lowpass';

        lp.frequency.setValueAtTime(1500, t0);

        lp.frequency.exponentialRampToValueAtTime(350, t0 + dur);

        const g = c.createGain(); g.gain.value = 0.18;

        src.connect(lp); lp.connect(g); g.connect(this.master);

        src.start(t0); src.stop(t0 + dur + 0.01);

      }

      // 2) Heavy THUNK — grotos pasieka apačią (sine 110→35Hz, 100ms)

      const tImpact = t0 + 0.12;

      {

        const o = c.createOscillator(); const g = c.createGain();

        o.type = 'sine';

        o.frequency.setValueAtTime(110, tImpact);

        o.frequency.exponentialRampToValueAtTime(35, tImpact + 0.10);

        g.gain.setValueAtTime(0.38, tImpact);

        g.gain.exponentialRampToValueAtTime(0.0001, tImpact + 0.14);

        o.connect(g); g.connect(this.master);

        o.start(tImpact); o.stop(tImpact + 0.16);

      }

      // 3) Trumpas metalo ring (triangle 800Hz, fast decay) — kad jaustusi metalas

      {

        const o = c.createOscillator(); const g = c.createGain();

        o.type = 'triangle';

        o.frequency.value = 800;

        g.gain.setValueAtTime(0.0001, tImpact);

        g.gain.exponentialRampToValueAtTime(0.10, tImpact + 0.005);

        g.gain.exponentialRampToValueAtTime(0.0001, tImpact + 0.12);

        o.connect(g); g.connect(this.master);

        o.start(tImpact); o.stop(tImpact + 0.14);

      }

    },

    // ── Reveal — krištolinis „TING" su arpeggio (kai po reload atsidengia READY) ──

    colorReveal() {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      if (c.state === 'suspended') c.resume();

      const t0 = c.currentTime;

      // 1) Trumpas „pluck" pradžioj — minkštas attack click (give it body)

      {

        const sr = c.sampleRate;

        const dur = 0.012;

        const len = Math.floor(sr * dur);

        const buf = c.createBuffer(1, len, sr);

        const data = buf.getChannelData(0);

        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i/len, 2);

        const src = c.createBufferSource(); src.buffer = buf;

        const bp = c.createBiquadFilter(); bp.type = 'bandpass';

        bp.frequency.value = 3500; bp.Q.value = 2;

        const g = c.createGain(); g.gain.setValueAtTime(0.10, t0);

        src.connect(bp); bp.connect(g); g.connect(this.master);

        src.start(t0); src.stop(t0 + dur + 0.005);

      }

      // 2) Krištolinis bell — sine 1200Hz su lengva vibracija

      {

        const o = c.createOscillator(); const g = c.createGain();

        o.type = 'sine';

        o.frequency.setValueAtTime(1200, t0);

        o.frequency.exponentialRampToValueAtTime(1180, t0 + 0.30);   // tiny pitch droop = realistic bell

        g.gain.setValueAtTime(0.0001, t0);

        g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.005);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.40);

        o.connect(g); g.connect(this.master);

        o.start(t0); o.stop(t0 + 0.42);

      }

      // 3) Oktavos overtone (sine 2400Hz) — tylesnis, suteikia „glass" charakterį

      {

        const o = c.createOscillator(); const g = c.createGain();

        o.type = 'sine';

        o.frequency.setValueAtTime(2400, t0);

        g.gain.setValueAtTime(0.0001, t0);

        g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.005);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);

        o.connect(g); g.connect(this.master);

        o.start(t0); o.stop(t0 + 0.24);

      }

      // 4) Arpeggio tail — 3 greitos triangle natos kylant (G5 → B5 → D6)

      const arpFreqs = [1568, 1976, 2349];

      const arpStarts = [0.06, 0.10, 0.14];

      const arpDurs = [0.10, 0.10, 0.16];

      for (let i = 0; i < 3; i++) {

        const ts = t0 + arpStarts[i];

        const o = c.createOscillator(); const g = c.createGain();

        o.type = 'triangle';

        o.frequency.value = arpFreqs[i];

        g.gain.setValueAtTime(0.0001, ts);

        g.gain.exponentialRampToValueAtTime(0.05, ts + 0.005);

        g.gain.exponentialRampToValueAtTime(0.0001, ts + arpDurs[i]);

        o.connect(g); g.connect(this.master);

        o.start(ts); o.stop(ts + arpDurs[i] + 0.02);

      }

    },

    cannonShot(power) {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      if (c.state === 'suspended') c.resume();

      const p = Math.max(0, Math.min(1, power || 0));

      const t0 = c.currentTime;

      // "Wood thump" charakteris — sausas medinis "TOK", be air'o, be boom'o.

      // Pagaliuko dūžis į medinę dėžę: aštrus contact click + mid-freq rezonansas.

      // 1) STRIKE CLICK — labai trumpas band-passed noise burst (kontakto smūgis)

      {

        const sr = c.sampleRate;

        const dur = 0.022;

        const len = Math.floor(sr * dur);

        const buf = c.createBuffer(1, len, sr);

        const data = buf.getChannelData(0);

        for (let i = 0; i < len; i++) {

          const env = Math.pow(1 - i / len, 2.0);

          data[i] = (Math.random() * 2 - 1) * env;

        }

        const src = c.createBufferSource(); src.buffer = buf;

        const bp = c.createBiquadFilter();

        bp.type = 'bandpass';

        bp.frequency.value = 1800;

        bp.Q.value = 1.4;

        const g = c.createGain();

        g.gain.setValueAtTime(0.45 + p * 0.20, t0);

        src.connect(bp); bp.connect(g); g.connect(this.master);

        src.start(t0); src.stop(t0 + dur + 0.01);

      }

      // 2) WOOD BODY — mid sine ~280Hz, su tiny pitch drop (resonance damping)

      {

        const dur = 0.085 + p * 0.035;

        const osc = c.createOscillator();

        const g = c.createGain();

        osc.type = 'sine';

        const baseFreq = 260 + p * 50; // didesnis power → kiek aukštesnis tonas

        osc.frequency.setValueAtTime(baseFreq, t0);

        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.78, t0 + dur);

        g.gain.setValueAtTime(0.55 + p * 0.20, t0);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + dur + 0.02);

      }

      // 3) SECOND HARMONIC — duoda medienai "kūną" (skambius overtone'us)

      {

        const dur = 0.055 + p * 0.025;

        const osc = c.createOscillator();

        const g = c.createGain();

        osc.type = 'triangle';

        osc.frequency.setValueAtTime(540 + p * 100, t0);

        osc.frequency.exponentialRampToValueAtTime(380, t0 + dur);

        g.gain.setValueAtTime(0.18 + p * 0.10, t0);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + dur + 0.02);

      }

    },

    _lastLand: 0,

    _lastHit: 0,

    ballLand(impactSp) {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      // Throttle — neleidžia spam'inti kai daug bounce'ų per kelis ms

      const t0 = c.currentTime;

      if (t0 - this._lastLand < 0.030) return;

      // Ignore mažus bounce'us (mikro-vibracijos)

      const sp = Math.max(0, impactSp || 0);

      if (sp < 60) return;

      this._lastLand = t0;

      if (c.state === 'suspended') c.resume();

      const norm = Math.min(1, (sp - 60) / 500); // 0..1 nuo 60 iki 560

      // 1) Žemas thud — soft sine 90→40Hz

      {

        const dur = 0.06 + norm * 0.05;

        const osc = c.createOscillator();

        const g = c.createGain();

        osc.type = 'sine';

        osc.frequency.setValueAtTime(95, t0);

        osc.frequency.exponentialRampToValueAtTime(40, t0 + dur);

        g.gain.setValueAtTime(0.10 + norm * 0.18, t0);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + dur + 0.02);

      }

      // 2) Tiny tap — labai trumpas lowpassed noise (kontakto papliauška)

      if (norm > 0.05) {

        const sr = c.sampleRate;

        const dur = 0.018;

        const len = Math.floor(sr * dur);

        const buf = c.createBuffer(1, len, sr);

        const data = buf.getChannelData(0);

        for (let i = 0; i < len; i++) {

          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);

        }

        const src = c.createBufferSource(); src.buffer = buf;

        const lp = c.createBiquadFilter();

        lp.type = 'lowpass'; lp.frequency.value = 800;

        const g = c.createGain();

        g.gain.setValueAtTime(0.06 + norm * 0.10, t0);

        src.connect(lp); lp.connect(g); g.connect(this.master);

        src.start(t0); src.stop(t0 + dur + 0.01);

      }

    },

    ballHit(impulseMag) {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      const t0 = c.currentTime;

      if (t0 - this._lastHit < 0.022) return;

      const m = Math.max(0, impulseMag || 0);

      if (m < 30) return;

      this._lastHit = t0;

      if (c.state === 'suspended') c.resume();

      const norm = Math.min(1, (m - 30) / 250); // 0..1

      // 1) Sharp click — bilijardo "TIK" (band-pass mid-high noise)

      {

        const sr = c.sampleRate;

        const dur = 0.015;

        const len = Math.floor(sr * dur);

        const buf = c.createBuffer(1, len, sr);

        const data = buf.getChannelData(0);

        for (let i = 0; i < len; i++) {

          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);

        }

        const src = c.createBufferSource(); src.buffer = buf;

        const bp = c.createBiquadFilter();

        bp.type = 'bandpass';

        bp.frequency.value = 2400 + norm * 1200;

        bp.Q.value = 1.6;

        const g = c.createGain();

        g.gain.setValueAtTime(0.18 + norm * 0.20, t0);

        src.connect(bp); bp.connect(g); g.connect(this.master);

        src.start(t0); src.stop(t0 + dur + 0.01);

      }

      // 2) Wood resonance — trumpas triangle ~400Hz

      {

        const dur = 0.05 + norm * 0.04;

        const osc = c.createOscillator();

        const g = c.createGain();

        osc.type = 'triangle';

        const f = 380 + norm * 180;

        osc.frequency.setValueAtTime(f, t0);

        osc.frequency.exponentialRampToValueAtTime(f * 0.7, t0 + dur);

        g.gain.setValueAtTime(0.14 + norm * 0.16, t0);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + dur + 0.02);

      }

    },

    damageHit(dmg, flavor) {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      if (c.state === 'suspended') c.resume();

      const t0 = c.currentTime;

      const d = Math.max(1, Math.min(40, dmg | 0));

      const norm = Math.min(1, d / 20); // 0..1 scaling

      if (flavor === 'poison') {

        // Žemas slimy "blurp" — žalsvas ir slidesnis

        const dur = 0.14;

        const osc = c.createOscillator();

        const g = c.createGain();

        osc.type = 'sine';

        osc.frequency.setValueAtTime(180, t0);

        osc.frequency.exponentialRampToValueAtTime(70, t0 + dur);

        g.gain.setValueAtTime(0.22, t0);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + dur + 0.02);

        // Šnypštesys

        this._noiseBurst(0.10, 0.06, 600);

        return;

      }

      // Standartinis damage hit — strėlės/krištolo/bissēreles smūgis

      // 1) Sharp crack — high band-pass noise transient (kontaktas)

      {

        const sr = c.sampleRate;

        const dur = 0.018 + norm * 0.012;

        const len = Math.floor(sr * dur);

        const buf = c.createBuffer(1, len, sr);

        const data = buf.getChannelData(0);

        for (let i = 0; i < len; i++) {

          const env = Math.pow(1 - i / len, 1.8);

          data[i] = (Math.random() * 2 - 1) * env;

        }

        const src = c.createBufferSource(); src.buffer = buf;

        const bp = c.createBiquadFilter();

        bp.type = 'bandpass';

        bp.frequency.value = 2800 + norm * 800;

        bp.Q.value = 1.2;

        const g = c.createGain();

        g.gain.setValueAtTime(0.40 + norm * 0.25, t0);

        src.connect(bp); bp.connect(g); g.connect(this.master);

        src.start(t0); src.stop(t0 + dur + 0.01);

      }

      // 2) Body thud — mid sine ~220Hz su descending pitch

      {

        const dur = 0.09 + norm * 0.06;

        const osc = c.createOscillator();

        const g = c.createGain();

        osc.type = 'triangle';

        const baseFreq = 220 - norm * 70; // big hit → žemesnis tonas

        osc.frequency.setValueAtTime(baseFreq * 1.6, t0);

        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, t0 + dur);

        g.gain.setValueAtTime(0.45 + norm * 0.20, t0);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + dur + 0.02);

      }

      // 3) Sub punch — tik dideliems hit'ams (asteroidai, dideli merge'iai)

      if (norm > 0.4) {

        const dur = 0.12 + norm * 0.06;

        const osc = c.createOscillator();

        const g = c.createGain();

        osc.type = 'sine';

        osc.frequency.setValueAtTime(110, t0);

        osc.frequency.exponentialRampToValueAtTime(45, t0 + dur);

        g.gain.setValueAtTime(0.35 * norm, t0);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + dur + 0.02);

      }

    },

    merge(tier) {

      this._init(); if (!this.ctx) return;

      if (this.ctx.state === 'suspended') this.ctx.resume();

      const tr = Math.max(1, Math.min(7, tier | 0));

      // Bass thump — tier'iui proporcingas storumas

      this._osc(80 + tr * 12, 0.18 + tr * 0.04, 0.04, 'sawtooth', -25);

      // Bright shimmer ping

      this._osc(700 + tr * 180, 0.14, 0.08, 'sine', 400);

      // Ascending arpeggio (kuo aukštesnis tier — daugiau natų)

      const baseMidi = 60 + tr * 2; // C4 + tier

      const notes = [0, 4, 7, 12, 16, 19].slice(0, Math.min(6, 2 + tr));

      const c = this.ctx;

      for (let i = 0; i < notes.length; i++) {

        const midi = baseMidi + notes[i];

        const f = 440 * Math.pow(2, (midi - 69) / 12);

        const t0 = c.currentTime + i * 0.045;

        const osc = c.createOscillator();

        const g = c.createGain();

        osc.type = 'square';

        osc.frequency.setValueAtTime(f, t0);

        g.gain.setValueAtTime(0.0001, t0);

        g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.005);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + 0.22);

      }

      // High shimmer tail tik aukštesniems tier'iams

      if (tr >= 3) this._osc(2000 + tr * 100, 0.22, 0.05, 'sine', -300);

    },

    // ── Game Over jingle — liūdnas descending melody + low rumble ──

    gameOver() {

      this._init(); if (!this.ctx) return;

      if (this.ctx.state === 'suspended') this.ctx.resume();

      const c = this.ctx;

      // Low rumble (foundational sadness)

      this._osc(60, 1.5, 0.10, 'sawtooth', -15);

      this._osc(45, 1.8, 0.08, 'sine', -10);

      // Descending sad melody (minor key: A4, G4, F4, E4, D4, C4)

      const midiSeq = [69, 67, 65, 64, 62, 60];   // descending A minor scale-ish

      for (let i = 0; i < midiSeq.length; i++) {

        const f = 440 * Math.pow(2, (midiSeq[i] - 69) / 12);

        const t0 = c.currentTime + i * 0.18;

        const osc = c.createOscillator();

        const g = c.createGain();

        osc.type = 'triangle';

        osc.frequency.setValueAtTime(f, t0);

        g.gain.setValueAtTime(0.0001, t0);

        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);

        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);

        osc.connect(g); g.connect(this.master);

        osc.start(t0); osc.stop(t0 + 0.4);

      }

      // Final long low note (mournful resolution)

      const tEnd = c.currentTime + midiSeq.length * 0.18;

      const oscEnd = c.createOscillator();

      const gEnd = c.createGain();

      oscEnd.type = 'triangle';

      const fEnd = 440 * Math.pow(2, (57 - 69) / 12);   // A3

      oscEnd.frequency.setValueAtTime(fEnd, tEnd);

      gEnd.gain.setValueAtTime(0.0001, tEnd);

      gEnd.gain.exponentialRampToValueAtTime(0.10, tEnd + 0.05);

      gEnd.gain.exponentialRampToValueAtTime(0.0001, tEnd + 1.5);

      oscEnd.connect(gEnd); gEnd.connect(this.master);

      oscEnd.start(tEnd); oscEnd.stop(tEnd + 1.6);

    },

    // ── Skull death — procedural skeleto kaulų traškėjimas + subyrėjimas ──

    _lastSkullDeath: 0,

    skullDeath() {

      this._init(); if (!this.ctx) return;

      const c = this.ctx;

      if (c.state === 'suspended') c.resume();

      const tNow = performance.now();

      if (tNow - this._lastSkullDeath < 60) return; // throttle — daug skull'ų vienu metu

      this._lastSkullDeath = tNow;

      // Delay ~120ms kad death garsas skambėtų PO mirtino smūgio

      const t0 = c.currentTime + 0.12;

      // Dry bone crack — trumpas bandpass'intas noise burst (kietas, sausas)

      const crack = (delay, freq, dur, vol, q) => {

        const t = t0 + delay;

        const sr = c.sampleRate;

        const len = Math.max(1, Math.floor(sr * dur));

        const buf = c.createBuffer(1, len, sr);

        const data = buf.getChannelData(0);

        for (let i = 0; i < len; i++) {

          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);

        }

        const src = c.createBufferSource(); src.buffer = buf;

        const bp = c.createBiquadFilter();

        bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q || 3.5;

        const g = c.createGain();

        g.gain.setValueAtTime(vol, t);

        src.connect(bp); bp.connect(g); g.connect(this.master);

        src.start(t); src.stop(t + dur + 0.01);

      };

      // 1) Pirmas aštrus SNAP — pagrindinis kaulo lūžis

      crack(0, 2700, 0.026, 0.55, 4);

      // 2) Follow-up traškesiai — kaulų fragmentai laužiasi seka

      crack(0.045, 1850, 0.022, 0.42, 4);

      crack(0.10, 3300, 0.018, 0.34, 5);

      crack(0.16, 1450, 0.024, 0.36, 3.5);

      crack(0.22, 2200, 0.020, 0.28, 4);

      // 3) Subyrėjimo barškesys — daug mažų kliktelėjimų krenta netvarkingai

      for (let i = 0; i < 12; i++) {

        const d = 0.14 + Math.random() * 0.42;

        crack(d, 700 + Math.random() * 1700, 0.006 + Math.random() * 0.012,

              0.07 + Math.random() * 0.13, 2 + Math.random() * 3);

      }

      // 4) Tuščiaviduris THUNK — kaukolės ertmės sukritimas

      {

        const t = t0 + 0.04;

        const osc = c.createOscillator();

        const g = c.createGain();

        osc.type = 'triangle';

        osc.frequency.setValueAtTime(170, t);

        osc.frequency.exponentialRampToValueAtTime(65, t + 0.20);

        g.gain.setValueAtTime(0.0001, t);

        g.gain.exponentialRampToValueAtTime(0.24, t + 0.008);

        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

        const lp = c.createBiquadFilter();

        lp.type = 'lowpass'; lp.frequency.value = 550;

        osc.connect(lp); lp.connect(g); g.connect(this.master);

        osc.start(t); osc.stop(t + 0.24);

      }

      // 5) Dulkių nusėdimas — minkštas lowpass'intas noise tail

      {

        const t = t0 + 0.20;

        const dur = 0.40;

        const sr = c.sampleRate;

        const len = Math.floor(sr * dur);

        const buf = c.createBuffer(1, len, sr);

        const data = buf.getChannelData(0);

        for (let i = 0; i < len; i++) {

          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);

        }

        const src = c.createBufferSource(); src.buffer = buf;

        const lp = c.createBiquadFilter();

        lp.type = 'lowpass';

        lp.frequency.setValueAtTime(1300, t);

        lp.frequency.exponentialRampToValueAtTime(280, t + dur);

        const g = c.createGain();

        g.gain.setValueAtTime(0.11, t);

        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        src.connect(lp); lp.connect(g); g.connect(this.master);

        src.start(t); src.stop(t + dur + 0.01);

      }

    },

    // ── Arrow shot (mp3) — paleidžiamas kai archer/tower/crossbow šauna strėlę ──

    _arrowPool: null,

    _arrowIdx: 0,

    _lastArrow: 0,

    arrow() {

      if (!this._arrowPool) {

        this._arrowPool = [];

        for (let i = 0; i < 5; i++) { // 5 instances — strėlės dažnai šaunamos kelios vienu metu

          const a = new Audio('arrow.mp3');

          a.preload = 'auto';

          a.volume = 0.175;

          this._arrowPool.push(a);

        }

      }

      const tNow = performance.now();

      if (tNow - this._lastArrow < 50) return; // throttle

      this._lastArrow = tNow;

      const a = this._arrowPool[this._arrowIdx];

      this._arrowIdx = (this._arrowIdx + 1) % this._arrowPool.length;

      try {

        a.currentTime = 0;

        const p = a.play();

        if (p && typeof p.catch === 'function') p.catch(() => {});

      } catch (_) {}

    },

    // ── Wall collapse (mp3) — paleidžiamas kai akmens siena sugriūva ──

    _wallCollapseAudio: null,

    _lastWallCollapse: 0,

    wallCollapse() {

      if (!this._wallCollapseAudio) {

        // Pool po 2 instances — retas garsas, retai persidengia

        this._wallCollapseAudio = [];

        for (let i = 0; i < 2; i++) {

          const a = new Audio('wallcalapse.mp3');

          a.preload = 'auto';

          a.volume = 0.125;

          this._wallCollapseAudio.push(a);

        }

        this._wallCollapseSlot = 0;

      }

      const tNow = performance.now();

      if (tNow - this._lastWallCollapse < 200) return; // jei keli sienos žlunga vienu metu, throttle

      this._lastWallCollapse = tNow;

      const a = this._wallCollapseAudio[this._wallCollapseSlot];

      this._wallCollapseSlot = (this._wallCollapseSlot + 1) % this._wallCollapseAudio.length;

      try {

        a.currentTime = 0;

        const p = a.play();

        if (p && typeof p.catch === 'function') p.catch(() => {});

      } catch (_) {}

    },

    // ── Harpun (mp3) — paleidžiamas kai harpoon_fish meta harpuną ──

    _harpunPool: null,

    _harpunIdx: 0,

    _lastHarpun: 0,

    harpun() {

      if (!this._harpunPool) {

        this._harpunPool = [];

        for (let i = 0; i < 4; i++) {

          const a = new Audio('harpun.mp3');

          a.preload = 'auto';

          a.volume = 0.06;

          this._harpunPool.push(a);

        }

      }

      const tNow = performance.now();

      if (tNow - this._lastHarpun < 60) return;

      this._lastHarpun = tNow;

      const a = this._harpunPool[this._harpunIdx];

      this._harpunIdx = (this._harpunIdx + 1) % this._harpunPool.length;

      try {

        a.currentTime = 0;

        const p = a.play();

        if (p && typeof p.catch === 'function') p.catch(() => {});

      } catch (_) {}

    },

    // ── Wall hit (mp3) — alternuoja wall01 / wall02 kiekvieną kartą skull dauzo akmens sieną ──

    _wallSounds: null,

    _wallIdx: 0,

    _lastWall: 0,

    wallHit() {

      if (!this._wallSounds) {

        // 4 instances kiekvienam (wall01 ir wall02), kad galėtų persidengti

        this._wallSounds = { '01': [], '02': [] };

        for (let i = 0; i < 3; i++) {

          const a1 = new Audio('wall01.mp3'); a1.preload = 'auto'; a1.volume = 0.225;

          const a2 = new Audio('wall02.mp3'); a2.preload = 'auto'; a2.volume = 0.225;

          this._wallSounds['01'].push(a1);

          this._wallSounds['02'].push(a2);

        }

        this._wall01Slot = 0; this._wall02Slot = 0;

      }

      const tNow = performance.now();

      if (tNow - this._lastWall < 60) return; // throttle

      this._lastWall = tNow;

      // Alternuojam — pirma 01, paskui 02, paskui vėl 01...

      const variant = this._wallIdx % 2 === 0 ? '01' : '02';

      this._wallIdx++;

      const slot = variant === '01' ? this._wall01Slot : this._wall02Slot;

      const pool = this._wallSounds[variant];

      const a = pool[slot];

      if (variant === '01') this._wall01Slot = (slot + 1) % pool.length;

      else this._wall02Slot = (slot + 1) % pool.length;

      try {

        a.currentTime = 0;

        const p = a.play();

        if (p && typeof p.catch === 'function') p.catch(() => {});

      } catch (_) {}

    },

    // ── Zaibas (mp3) — naudojamas merge attack lightning strike'ui ──

    _zaibasPool: null,

    _zaibasIdx: 0,

    _lastZaibas: 0,

    zaibas(tier) {

      // Lazy init pool — 4 instances rotuoja, kad gali persidengti garsai

      if (!this._zaibasPool) {

        this._zaibasPool = [];

        for (let i = 0; i < 4; i++) {

          const a = new Audio('zaibas.mp3');

          a.preload = 'auto';

          this._zaibasPool.push(a);

        }

      }

      // Throttle — neleidžia spam'inti per dažnai (max 1 per 80ms)

      const tNow = performance.now();

      if (tNow - this._lastZaibas < 80) return;

      this._lastZaibas = tNow;

      // Volume scale'inasi pagal tier — sumažinta iki 50% nuo originalo

      const tr = Math.max(1, Math.min(6, tier || 1));

      const vol = Math.min(0.30, 0.125 + tr * 0.025);

      const a = this._zaibasPool[this._zaibasIdx];

      this._zaibasIdx = (this._zaibasIdx + 1) % this._zaibasPool.length;

      try {

        a.volume = vol;

        a.currentTime = 0;

        const p = a.play();

        if (p && typeof p.catch === 'function') p.catch(() => {});

      } catch (_) {}

    },

  };

  window._F12Audio = _F12Audio;

  // ── BGM — playlistas (crystal_mine → crystal_mine02 → loop). API: start()/stop()/active.

  const _F12Music = {

    active: false,

    tracks: ['crystal_mine.mp3', 'crystal_mine02.mp3'],

    audios: null,

    idx: 0,

    vol: 0.04,                  // pritildinta — sėdi po SFX

    muted: false,               // global mute (toggleSound iškviečia setMuted)

    setMuted(m) {
      this.muted = !!m;
      if (this.audios) { for (var i = 0; i < this.audios.length; i++) { try { this.audios[i].muted = this.muted; } catch (_) {} } }
    },

    _ensure() {

      if (this.audios) return;

      this.audios = this.tracks.map((src) => {

        const a = new Audio(src);

        a.loop = false;          // ne loop — kad 'ended' eventas suveiktų ir pereitų į kitą

        a.volume = this.vol;

        a.preload = 'auto';

        a.muted = this.muted;

        a.addEventListener('ended', () => {

          if (!this.active) return;

          // Pasibaigus trakui — pereinam į kitą (wrap around: paskutinis → pirmas)

          this.idx = (this.idx + 1) % this.audios.length;

          const next = this.audios[this.idx];

          next.currentTime = 0;

          next.volume = this.vol;

          const p = next.play();

          if (p && typeof p.catch === 'function') p.catch(() => {});

        });

        return a;

      });

    },

    start() {

      this._ensure();

      this.active = true;

      const a = this.audios[this.idx];

      a.volume = this.vol;

      // play() grąžina Promise — gali nepavykti jei AudioContext dar suspended

      const p = a.play();

      if (p && typeof p.catch === 'function') p.catch(() => {});

    },

    stop() {

      this.active = false;

      if (!this.audios) return;

      const a = this.audios[this.idx];

      this.idx = 0;              // reset playlistą — kitas start'as pradės nuo 1-mo trako

      // Soft fade-out per ~250ms, paskui pause

      const startVol = a.volume;

      const steps = 10;

      let i = 0;

      const id = setInterval(() => {

        i++;

        a.volume = Math.max(0, startVol * (1 - i / steps));

        if (i >= steps) {

          clearInterval(id);

          a.pause();

          a.currentTime = 0;

          a.volume = this.vol;

        }

      }, 25);

    },

  };

  window._F12Music = _F12Music;

  // ── Config ─────────────────────────────────────────────────────────

  const TYPES = ['arrow', 'shield', 'heart', 'leaf', 'star', 'crystal', 'shadow', 'pearl', 'frost'];

  const TYPE_COLOR = {

    arrow:   { top: [255, 200, 110], front: [220, 150, 70],  right: [180, 110, 50], left: [120, 70, 30],  back: [80, 45, 18],  bot: [40, 22, 8],  glyph: '#3a1f08' },

    shield:  { top: [180, 230, 220], front: [110, 180, 175], right: [70, 140, 140], left: [40, 95, 100],  back: [25, 60, 65],  bot: [10, 28, 32], glyph: '#06262a' },

    heart:   { top: [255, 170, 180], front: [220, 90, 100],  right: [175, 55, 65],  left: [115, 30, 38],  back: [70, 14, 20],  bot: [30, 6, 10],  glyph: '#3a0a10' },

    leaf:    { top: [180, 230, 130], front: [110, 180, 75],  right: [70, 140, 50],  left: [40, 95, 30],   back: [20, 50, 15],  bot: [8, 25, 5],   glyph: '#0a200a' },

    star:    { top: [255, 240, 130], front: [235, 195, 70],  right: [190, 145, 40], left: [130, 90, 25],  back: [75, 50, 12],  bot: [35, 22, 5],  glyph: '#3a2a08' },

    crystal: { top: [220, 180, 255], front: [165, 110, 220], right: [115, 70, 170], left: [75, 45, 115],  back: [35, 20, 60],  bot: [12, 6, 22],  glyph: '#1a0a30' },

    shadow:  { top: [85, 85, 95],    front: [50, 50, 60],    right: [30, 30, 40],   left: [18, 18, 26],   back: [10, 10, 16],  bot: [4, 4, 8],    glyph: '#000008' },

    pearl:   { top: [255, 255, 255], front: [220, 220, 230], right: [175, 175, 190], left: [125, 125, 145], back: [80, 80, 100], bot: [40, 40, 55], glyph: '#1a1a25' },

    frost:   { top: [120, 180, 255], front: [40, 130, 235],  right: [30, 95, 175],  left: [20, 65, 120],  back: [14, 48, 88],  bot: [8, 28, 52],  glyph: '#08203a' },

  };

  // Combat — 6 lane'ai, retas spawn (maža priešų masė)

  const LANES = 6;

  const BASE_HP = 30;

  const ENEMY_SPAWN_MS = 18000;        // ~18 sekundžių tarp spawn'ų

  const MAX_ENEMIES_TOTAL = 9;         // visose juostose iš viso — jei daugiau, spawn praleidžiamas

  // Top-down physics — bilijardo style: žemai sliding, aukšto greitis ridenasi ilgiau

  const FRICTION_HIGH = 0.985;    // mažai trinties kai juda greitai (rutuliukas ridenasi)

  const FRICTION_LOW = 0.86;      // stipri trintis kai jau lėtas (sustoja greitai)

  const FRICTION_THRESHOLD = 30;  // virš šio greičio — low friction (rolling)

  const STOP_VEL = 5;             // mažesnis stop threshold — leidžia mažai motion'ui likti

  const COLLISION_ROLL_KICK = 0.06;// kontaktas → rolled boost'as nepriklausomai nuo motion magnitude

  const WALL_RESTITUTION = 0.40;

  const BLOCK_RESTITUTION = 0.88;     // šiek tiek mažiau bouncy

  const BLOCK_TANGENT_FRICTION = 0.05;

  const COLLISION_KICK_BOOST = 1.00;  // be boost'o — natūralu billiards

  // Gradient position correction (ne instant snap) — Box2D-style slop + percent

  const POS_CORRECT_PCT = 0.04;       // 30% overlap'o pašalinama per frame (ne visi 100%)

  const POS_CORRECT_SLOP = 0.5;       // mažesnis overlap toleruojamas (sumažina jitter)

  // Merge shockwave — vidutinis pop (mazintas 50% nuo perdėto)

  const MERGE_JUMP_VZ = 500;          // vertikalus šuolis (vidurkis tarp 380 ir 700)

  const MERGE_SHOCK_FORCE = 1300;     // radial force (vidurkis tarp 850 ir 1800)

  const MERGE_SHOCK_RADIUS_MULT = 4.5;// paveikimo radius (vidurkis tarp 3.5 ir 5.5)

  // Flight (Z) — didesnis pirmas bounce, kiekvienas paskesnis silpnesnis

  const Z_GRAVITY = 1700;

  const Z_BOUNCE = 0.58;          // anksčiau 0.42 — dabar didesni atšokimai

  const Z_BOUNCE_MIN_VZ = 80;     // šiek tiek aukštesnis threshold — greičiau galutinai sustoja

  const BOUNCE_XY_DAMP = 0.55;    // per bounce, XY judejimo dauginama (anksčiau 0.88 — dabar agresyvi)

  const FIRE_SPEED_MIN = 380;     // tap → silpnas šūvis

  const FIRE_SPEED_MAX = 1500;    // hold full charge → galingas

  const CHARGE_FULL_MS = 1100;    // kiek laiko reikia pilnam charge

  const FIRE_COOLDOWN_MIN = 1000;    // reload min (1s)

  const FIRE_COOLDOWN_MAX = 3000;    // reload max (3s) — kiekvienam šūviui random tarp min..max

  const BASE_R = 17;             // mažesnis — atitinka preview ant patrankos

  const MAX_BLOCKS = 30;     // bazinis arena pajėgumas (ateity bus upgrade'inami didesnės talpos lygiai)

  let _f12FireBonusSlots = 0;   // kiekvienas merge += 1; leidžia šauti virš MAX kai merge'inta (1 merge = -2 effective)

  const _F12_GAMEOVER_OVERFLOW = MAX_BLOCKS + 8;   // hard cap — game over jei tikrai pilna (gali viršyti su bonus)

  const TOP_TILT = 0.58;          // tilt — top + front matomi balansuotai (kaip referenciniam screenshot)

  // Settling — kai cube sulėtėja, traukia į face-forward + per-dice unikalų ofsetą

  // Tai užtikrina: 1) visada stabili poza (ne ant kampo), 2) varied rotation (ne identiški)

  const ANG_FRICTION = 0.94;

  const ANG_STOP_VEL = 0.05;

  const SETTLE_TRIGGER_VEL = 3.5;     // kai spin <šito → settling spring

  const SETTLE_STIFFNESS = 35;

  const SETTLE_DAMPING = 9.0;         // slight under-damp for natural wobble

  const SETTLE_SNAP_EPS = 0.008;

  const REST_JITTER_RANGE = 0.60;     // ±0.04 rad ≈ ±17° per-dice ofsetas (variacijai)

  // 3D tumble — kubai sukasi visom ašim ore, ant grindų X/Z ašys flat'inasi

  const TUMBLE_FLAT_STIFFNESS = 50;   // spring traukia rotX, rotZ → 0 (lay flat)

  const TUMBLE_FLAT_DAMPING = 12;     // damping (kritinis — be wobble)

  // ── State ──────────────────────────────────────────────────────────

  let canvas = null, ctx = null;

  let active = false;

  // ── MOBILE DETECTION — UA-only (NE pointer:coarse, kad desktop touch screen nebūtų klaidingai detect'inamas) ──

  const _IS_MOBILE = (function () {

    try {

      return /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    } catch (_) { return false; }

  })();

  // ── LOCALHOST DETECTION — dev tools (EDIT MAP, F10/F11/F12 nav) tik lokalei ──

  const _isLocalhost = (function () {

    try {

      const h = window.location.hostname;

      return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '' || h.startsWith('192.168.');

    } catch (_) { return false; }

  })();

  let raf = 0;

  let lastTime = 0;

  // Combat

  let lanes = [];

  let baseHp = BASE_HP;

  let nextEnemyAt = 0;

  // ── Harpoon Fish animation iš F11 (_fishAnims su Idle/Run/Throw)

  const _HFISH_FW = 192;

  const _HFISH_THROW_FIRE_T = 5 * 90;        // ms iki harpuno spawn iš throw start (frame 5)

  function _pickHarpoonFishAnim(u, t, isMoving) {

    let anims = null;

    try { anims = _fishAnims; } catch (_) {}

    if (!anims) return null;

    const throwElapsed = u.swingStart ? t - u.swingStart : Infinity;

    const throwDur = 8 * 90;                  // 8 frames × 90ms

    let sheet, frames, ms;

    if (throwElapsed < throwDur) { sheet = anims.throw.img; frames = 8; ms = 90; }

    else if (isMoving)           { sheet = anims.run.img;   frames = 6; ms = 110; }

    else                         { sheet = anims.idle.img;  frames = 8; ms = 120; }

    if (!sheet || !sheet.complete || !sheet.naturalWidth) return null;

    let idx;

    if (throwElapsed < throwDur) idx = Math.min(Math.floor(throwElapsed / ms), frames - 1);

    else idx = Math.floor(t / ms) % frames;

    return { sheet, sx: idx * _HFISH_FW, sy: 0, sw: _HFISH_FW, sh: _HFISH_FW };

  }

  // Lane harpoons — projectile sistema F12 lane'ams

  // Per-utype ranged miss tikimybė. Roll'inama spawn'inant projektilą; jei miss — jokios žalos, „MISS".

  const _UNIT_MISS_CHANCE = { archer: 0.15, harpoon_fish: 0.05, shaman: 0.05, skull: 0.10, hog_rider: 0.05 };

  function _rollMiss(attacker) {

    const c = attacker && _UNIT_MISS_CHANCE[attacker.utype];

    return !!(c && Math.random() < c);

  }

  let _f12Harpoons = [];                       // {laneIdx, fromX, toX, target, dmg, born, duration}

  function _spawnLaneHarpoon(laneIdx, fromX, target, dmg, t, attacker) {

    _f12Harpoons.push({

      laneIdx, fromX, target, dmg, attacker,

      born: t, duration: 280, miss: _rollMiss(attacker),

    });

  }

  function _tickHarpoons(t) {

    for (let i = _f12Harpoons.length - 1; i >= 0; i--) {

      const h = _f12Harpoons[i];

      if (t - h.born >= h.duration) {

        if (h.miss) {

          _spawnDmgPopup(h.laneIdx, (h.target ? h.target.x : h.fromX), 0, t, { miss: true });

        } else if (h.target && !h.target.dead) {

          h.target.hp -= h.dmg;

          h.target.hitFlashUntil = t + 200;

          _spawnDmgPopup(h.laneIdx, h.target.x, h.dmg, t);

          _allyAddDmgDealt(h.attacker, h.dmg);

          if (h.target.hp <= 0) {

            h.target.dead = true; h.target.deathStartedAt = t;

            score += _nftScoreBoost(5);

            _trackF12Kill(h.target);

            if (!h.target._isWall) _F12Audio.skullDeath();

            _allyAddKill(h.attacker);

          }

        }

        _f12Harpoons.splice(i, 1);

      }

    }

  }

  function _drawLaneHarpoons(L, t) {

    if (!_f12Harpoons.length) return;

    const baseW = 32;

    let img = null;

    try { img = _fishAnims.harpoon.img; } catch (_) {}

    for (const h of _f12Harpoons) {

      const lane = lanes[h.laneIdx];

      if (!lane) continue;

      const ly = L.lanesY + h.laneIdx * L.laneH;

      const lh = L.laneH - 4;

      const tt = Math.min(1, (t - h.born) / h.duration);

      const fromPx = L.lanesX + baseW + (L.lanesW - baseW - 30) * h.fromX;

      const toFrac = h.target ? h.target.x : h.fromX + 0.3;

      const toPx = L.lanesX + baseW + (L.lanesW - baseW - 30) * toFrac;

      const cx = fromPx + (toPx - fromPx) * tt;

      const cy = ly + lh / 2;

      ctx.save();

      ctx.translate(cx, cy);

      // F11 logika: harpoon image tip points upper-right → +π/4 horizon flight'ui

      ctx.rotate(Math.PI / 4);

      ctx.imageSmoothingEnabled = false;

      ctx.shadowColor = '#ffaa44'; ctx.shadowBlur = 6;

      if (img && img.complete && img.naturalWidth > 0) {

        const sz = lh * 0.85;

        ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);

      } else {

        ctx.strokeStyle = '#ff8833';

        ctx.lineWidth = 3;

        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();

      }

      ctx.restore();

    }

  }

  // ── Shaman animation iš F11 (shamanAnimFrames + shamanProjImg)

  const _SHAM_PROJ_FIRE_T = 430;             // ms iki projektilo spawn'o (F11 frame ~6)

  const _SHAM_ATTACK_DUR = (10 / 14) * 1000; // 10 frames @ 14 fps = 714ms

  function _pickShamanFrame(u, t, isMoving) {

    let frames = null;

    try { frames = shamanAnimFrames; } catch (_) {}

    if (!frames) return null;

    const swingElapsed = u.swingStart ? t - u.swingStart : Infinity;

    let anim, fps;

    if (swingElapsed < _SHAM_ATTACK_DUR) { anim = 'attack'; fps = 14; }

    else if (isMoving)                   { anim = 'run';    fps = 10; }

    else                                 { anim = 'idle';   fps = 6; }

    const dirFrames = frames[anim] && frames[anim].east;

    if (!dirFrames || !dirFrames.length) return null;

    let idx;

    if (anim === 'attack') idx = Math.min(Math.floor(swingElapsed / (1000 / fps)), dirFrames.length - 1);

    else idx = Math.floor(t / (1000 / fps)) % dirFrames.length;

    return dirFrames[idx];                    // grąžina Image objektą tiesiogiai

  }

  // Lane shaman projectiles + explosions

  let _f12ShamanProj = [];        // {laneIdx, fromX, target, dmg, born, duration}

  let _f12ShamanExpl = [];        // {laneIdx, atX, born, duration}

  function _spawnLaneShamanProj(laneIdx, fromX, target, dmg, t, attacker) {

    _f12ShamanProj.push({ laneIdx, fromX, target, dmg, attacker, born: t, duration: 380, miss: _rollMiss(attacker) });

  }

  function _tickShamanProj(t) {

    for (let i = _f12ShamanProj.length - 1; i >= 0; i--) {

      const p = _f12ShamanProj[i];

      if (t - p.born >= p.duration) {

        if (p.miss) {

          _spawnDmgPopup(p.laneIdx, (p.target ? p.target.x : p.fromX), 0, t, { miss: true });

        } else if (p.target && !p.target.dead) {

          p.target.hp -= p.dmg;

          p.target.hitFlashUntil = t + 200;

          _spawnDmgPopup(p.laneIdx, p.target.x, p.dmg, t);

          _allyAddDmgDealt(p.attacker, p.dmg);

          if (p.target.hp <= 0) {

            p.target.dead = true; p.target.deathStartedAt = t;

            score += _nftScoreBoost(5);

            _trackF12Kill(p.target);

            if (!p.target._isWall) _F12Audio.skullDeath();

            _allyAddKill(p.attacker);

          }

        }

        // Spawn explosion at impact

        const impactX = p.target ? p.target.x : p.fromX;

        _f12ShamanExpl.push({ laneIdx: p.laneIdx, atX: impactX, born: t, duration: 9 * 55 });

        _f12ShamanProj.splice(i, 1);

      }

    }

    // Cleanup expired explosions

    for (let i = _f12ShamanExpl.length - 1; i >= 0; i--) {

      if (t - _f12ShamanExpl[i].born >= _f12ShamanExpl[i].duration) _f12ShamanExpl.splice(i, 1);

    }

  }

  function _drawLaneShamanProj(L, t) {

    const baseW = 32;

    // Projectiles

    if (_f12ShamanProj.length) {

      let pImg = null;

      try { pImg = shamanProjImg; } catch (_) {}

      if (pImg && pImg.complete && pImg.naturalWidth) {

        const _SHAM_PROJ_W = 128, _SHAM_PROJ_FRAMES = 3, _SHAM_PROJ_MS = 90;

        for (const p of _f12ShamanProj) {

          const lane = lanes[p.laneIdx];

          if (!lane) continue;

          const ly = L.lanesY + p.laneIdx * L.laneH;

          const lh = L.laneH - 4;

          const tt = Math.min(1, (t - p.born) / p.duration);

          const fromPx = L.lanesX + baseW + (L.lanesW - baseW - 30) * p.fromX;

          const toFrac = p.target ? p.target.x : p.fromX + 0.3;

          const toPx = L.lanesX + baseW + (L.lanesW - baseW - 30) * toFrac;

          const cx = fromPx + (toPx - fromPx) * tt;

          const cy = ly + lh / 2;

          const idx = Math.floor((t - p.born) / _SHAM_PROJ_MS) % _SHAM_PROJ_FRAMES;

          const sz = lh * 0.95;

          ctx.save();

          ctx.imageSmoothingEnabled = false;

          ctx.shadowColor = '#a070ff'; ctx.shadowBlur = 8;

          ctx.drawImage(pImg, idx * _SHAM_PROJ_W, 0, _SHAM_PROJ_W, _SHAM_PROJ_W,

            Math.round(cx - sz / 2), Math.round(cy - sz / 2), sz, sz);

          ctx.restore();

        }

      }

    }

    // Explosions

    if (_f12ShamanExpl.length) {

      let eImg = null;

      try { eImg = shamanExplImg; } catch (_) {}

      if (eImg && eImg.complete && eImg.naturalWidth) {

        const _SHAM_EXPL_W = 128, _SHAM_EXPL_FRAMES = 9, _SHAM_EXPL_MS = 55;

        for (const e of _f12ShamanExpl) {

          const lane = lanes[e.laneIdx];

          if (!lane) continue;

          const ly = L.lanesY + e.laneIdx * L.laneH;

          const lh = L.laneH - 4;

          const cx = L.lanesX + baseW + (L.lanesW - baseW - 30) * e.atX;

          const cy = ly + lh / 2;

          const idx = Math.min(_SHAM_EXPL_FRAMES - 1, Math.floor((t - e.born) / _SHAM_EXPL_MS));

          const sz = lh * 1.6;

          ctx.save();

          ctx.imageSmoothingEnabled = false;

          ctx.shadowColor = '#c08bff'; ctx.shadowBlur = 12;

          ctx.drawImage(eImg, idx * _SHAM_EXPL_W, 0, _SHAM_EXPL_W, _SHAM_EXPL_W,

            Math.round(cx - sz / 2), Math.round(cy - sz / 2), sz, sz);

          ctx.restore();

        }

      }

    }

  }

  // ── Archer animation iš F11 (_archerAnims su Idle/Run/Shoot/Arrow/Impact)

  const _ARCH_FW = 192;

  const _ARCH_SHOOT_DUR = 8 * 100;          // 8 frames × 100ms

  const _ARCH_FIRE_T = 4 * 100;             // arrow spawns at frame 4 (mid-animation)

  function _pickArcherFrame(u, t, isMoving) {

    let anims = null;

    try { anims = _archerAnims; } catch (_) {}

    if (!anims) return null;

    const shootElapsed = u.swingStart ? t - u.swingStart : Infinity;

    let conf;

    if (shootElapsed < _ARCH_SHOOT_DUR) conf = anims.shoot;

    else if (isMoving)                  conf = anims.run;

    else                                conf = anims.idle;

    const sheet = conf.img;

    if (!sheet || !sheet.complete || !sheet.naturalWidth) return null;

    let idx;

    if (shootElapsed < _ARCH_SHOOT_DUR) idx = Math.min(Math.floor(shootElapsed / conf.ms), conf.frames - 1);

    else idx = Math.floor(t / conf.ms) % conf.frames;

    return { sheet, sx: idx * _ARCH_FW, sy: 0, sw: _ARCH_FW, sh: _ARCH_FW };

  }

  // Lane arrows (su impact animation)

  let _f12Arrows = [];     // {laneIdx, fromX, target, dmg, born, duration}

  let _f12ArrowImpacts = []; // {laneIdx, atX, born, duration}

  function _spawnLaneArrow(laneIdx, fromX, target, dmg, t, attacker) {

    // Archer 10% miss (bokštai map'e nėra → visada pataiko)

    _f12Arrows.push({ laneIdx, fromX, target, dmg, attacker, born: t, duration: 250, miss: _rollMiss(attacker) });

  }

  function _tickArrows(t) {

    for (let i = _f12Arrows.length - 1; i >= 0; i--) {

      const ar = _f12Arrows[i];

      if (t - ar.born >= ar.duration) {

        if (ar.miss) {

          _spawnDmgPopup(ar.laneIdx, (ar.target ? ar.target.x : ar.fromX), 0, t, { miss: true });

        } else if (ar.target && !ar.target.dead) {

          ar.target.hp -= ar.dmg;

          ar.target.hitFlashUntil = t + 200;

          _spawnDmgPopup(ar.laneIdx, ar.target.x, ar.dmg, t);

          _allyAddDmgDealt(ar.attacker, ar.dmg);

          if (ar.target.hp <= 0) {

            ar.target.dead = true; ar.target.deathStartedAt = t;

            score += _nftScoreBoost(5);

            _trackF12Kill(ar.target);

            if (!ar.target._isWall) _F12Audio.skullDeath();

            _allyAddKill(ar.attacker);

          }

        }

        const impactX = ar.target ? ar.target.x : ar.fromX;

        _f12ArrowImpacts.push({ laneIdx: ar.laneIdx, atX: impactX, born: t, duration: 9 * 60 });

        _f12Arrows.splice(i, 1);

      }

    }

    for (let i = _f12ArrowImpacts.length - 1; i >= 0; i--) {

      if (t - _f12ArrowImpacts[i].born >= _f12ArrowImpacts[i].duration) _f12ArrowImpacts.splice(i, 1);

    }

  }

  function _drawLaneArrows(L, t) {

    const baseW = 32;

    // Arrows in flight

    if (_f12Arrows.length) {

      let img = null;

      try { img = _archerAnims.arrow.img; } catch (_) {}

      if (img && img.complete && img.naturalWidth) {

        for (const ar of _f12Arrows) {

          const lane = lanes[ar.laneIdx];

          if (!lane) continue;

          const ly = L.lanesY + ar.laneIdx * L.laneH;

          const lh = L.laneH - 4;

          const tt = Math.min(1, (t - ar.born) / ar.duration);

          const fromPx = L.lanesX + baseW + (L.lanesW - baseW - 30) * ar.fromX;

          const toFrac = ar.target ? ar.target.x : ar.fromX + 0.3;

          const toPx = L.lanesX + baseW + (L.lanesW - baseW - 30) * toFrac;

          // Parabolinis arc — pakyla į viršų ir nusileidžia

          const arcHeight = lh * 0.6;

          const cx = fromPx + (toPx - fromPx) * tt;

          const baseY = ly + lh / 2;

          const cy = baseY - 4 * arcHeight * tt * (1 - tt);

          // Arrow kampas pagal trajektorijos krypčies vektorių

          const dx = toPx - fromPx;

          const dy = -4 * arcHeight * (1 - 2 * tt);    // dy/dt (proporcingas, sign correct)

          const ang = Math.atan2(dy, dx);

          const sz = lh * 0.85;

          ctx.save();

          ctx.imageSmoothingEnabled = false;

          ctx.translate(cx, cy);

          ctx.rotate(ang);

          // Sprite default'as žiūri į dešinę → su rotation seka trajektoriją

          ctx.drawImage(img, 0, 0, 64, 64, -sz / 2, -sz / 2, sz, sz);

          ctx.restore();

        }

      }

    }

    // Impact explosions

    if (_f12ArrowImpacts.length) {

      let img = null;

      try { img = _archerAnims.impact.img; } catch (_) {}

      if (img && img.complete && img.naturalWidth) {

        const _IMPACT_W = 192, _IMPACT_FRAMES = 9, _IMPACT_MS = 60;

        for (const e of _f12ArrowImpacts) {

          const lane = lanes[e.laneIdx];

          if (!lane) continue;

          const ly = L.lanesY + e.laneIdx * L.laneH;

          const lh = L.laneH - 4;

          const cx = L.lanesX + baseW + (L.lanesW - baseW - 30) * e.atX;

          const cy = ly + lh / 2;

          const idx = Math.min(_IMPACT_FRAMES - 1, Math.floor((t - e.born) / _IMPACT_MS));

          const sz = lh * 1.4;

          ctx.save();

          ctx.imageSmoothingEnabled = false;

          ctx.drawImage(img, idx * _IMPACT_W, 0, _IMPACT_W, _IMPACT_W,

            Math.round(cx - sz / 2), Math.round(cy - sz / 2), sz, sz);

          ctx.restore();

        }

      }

    }

  }

  // ── Lightning bolt drawing iš F11 (procedural, jagged path)

  function _drawZipBolts(L, t) {

    if (!_f12ZipBolts.length) return;

    const baseW = 32;

    ctx.save();

    ctx.lineCap = 'round';

    ctx.lineJoin = 'round';

    for (let i = _f12ZipBolts.length - 1; i >= 0; i--) {

      const b = _f12ZipBolts[i];

      const tt = (t - b.born) / b.life;

      if (tt >= 1) { _f12ZipBolts.splice(i, 1); continue; }

      const alpha = 1 - tt;

      // Lightning origin = ZIP TOWER CENTER CORE (ne lane center)

      // Tower draw: cy - th*0.40 + 10, th = sz*5 = (lh*0.5)*5 = 2.5*lh

      // Core position ≈ towerY + th*0.04 from top → lane_center - th*0.10 + 10

      const lh = L.laneH - 4;

      const sz = lh * 0.50;

      const th = sz * 5.0;

      const fromLaneCenter = L.lanesY + b.fromLane * L.laneH + lh / 2;

      const fromY = fromLaneCenter - th * 0.10 + 7;     // tower core (atitinka tower offset'ą)

      const toY = L.lanesY + b.toLane * L.laneH + lh / 2;  // taikinys lane center'e

      const sx = L.lanesX + baseW + (L.lanesW - baseW - 30) * b.fromX;

      const sy = fromY;

      const ex = L.lanesX + baseW + (L.lanesW - baseW - 30) * b.toX;

      const ey = toY;

      const dx = ex - sx, dy = ey - sy;

      const len = Math.hypot(dx, dy) || 1;

      const nx = -dy / len, ny = dx / len;

      const segs = 14;

      ctx.beginPath();

      ctx.moveTo(sx, sy);

      for (let s = 1; s < segs; s++) {

        const f = s / segs;

        const taper = Math.sin(f * Math.PI);

        const j = (Math.sin(b.seed * 0.13 + s * 11.7) * 0.6 + Math.cos(b.seed * 0.07 + s * 5.3) * 0.4) * 14 * taper;

        ctx.lineTo(sx + dx * f + nx * j, sy + dy * f + ny * j);

      }

      ctx.lineTo(ex, ey);

      ctx.strokeStyle = `rgba(140,200,255,${0.35 * alpha})`;

      ctx.lineWidth = 7;

      ctx.stroke();

      ctx.strokeStyle = `rgba(180,220,255,${0.6 * alpha})`;

      ctx.lineWidth = 3.5;

      ctx.stroke();

      ctx.strokeStyle = `rgba(255,255,255,${0.95 * alpha})`;

      ctx.lineWidth = 1.5;

      ctx.stroke();

    }

    ctx.restore();

  }

  // ── Death animation iš F11 (deadAnimImg) — 7 cols × 2 rows, 14 frames @ 100ms

  const _DEAD_FW = 128, _DEAD_FH = 128, _DEAD_COLS = 7, _DEAD_TOTAL = 14, _DEAD_MS = 100;

  function _drawDeathAnim(cx, cy, sz, elapsed) {

    let img = null;

    try { img = deadAnimImg; } catch (_) {}

    if (!img || !img.complete || !img.naturalWidth) return;

    const frameIdx = Math.min(_DEAD_TOTAL - 1, Math.floor(elapsed / _DEAD_MS));

    const col = frameIdx % _DEAD_COLS;

    const row = Math.floor(frameIdx / _DEAD_COLS);

    const dw = sz * 3.5, dh = sz * 3.5;

    const fadeFrame = _DEAD_TOTAL - 3;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    ctx.globalAlpha = frameIdx >= fadeFrame ? 1 - (frameIdx - fadeFrame) / 3 : 1;

    ctx.drawImage(img, col * _DEAD_FW, row * _DEAD_FH, _DEAD_FW, _DEAD_FH,

      Math.round(cx - dw / 2), Math.round(cy - dh / 2), dw, dh);

    ctx.restore();

  }

  // ── Deploy sistema (HOME → F12 trained unit'ai)

  const PLAYABLE_TYPES = ['skull', 'archer', 'shaman', 'harpoon_fish', 'tower', 'crossbow_tower', 'zip', 'hog_rider'];

  // Range = fraction of lane width. F11 skull = 1 cell (~3% lane), ranged units = 3-7 cells.

  const ALLY_STATS = {

    skull:          { hp: 8,  dmg: 2, speed: 0.012, attackCooldown: 1500, range: 0.04 },

    archer:         { hp: 5,  dmg: 3, speed: 0.014, attackCooldown: 2500, range: 0.12 },   // CD 2.5s (sumažintas attack speed), range ~puse

    shaman:         { hp: 5,  dmg: 4, speed: 0.010, attackCooldown: 3000, range: 0.14 },   // CD 3s; HP 5 (+1)

    harpoon_fish:   { hp: 7,  dmg: 3, speed: 0.011, attackCooldown: 1800, range: 0.10 },   // CD 1.8s, range ~puse

    hog_rider:      { hp: 14, dmg: 8, speed: 0.013, attackCooldown: 2800, range: 0.05 },   // EPIC cavalry melee — tankiausias, spear smūgis 8 dmg, lėtas attack CD 2.8s (utype 5 / frost ball)

    _ninja:         { hp: 10, dmg: 1, speed: 0.024, attackCooldown: 1650, range: 0.04 },   // PEARL skilo ninja — tikri thief statai (HP10/žala1/CD1.65s), melee kaip skull. NE NFT, NE trained.

    // STATIC towers — neina, stovi prie base ir šaudo

    tower:          { hp: 30, dmg: 4, speed: 0,     attackCooldown: 1400, range: 0.55, static: true },

    crossbow_tower: { hp: 35, dmg: 6, speed: 0,     attackCooldown: 1900, range: 0.75, static: true },

    zip:            { hp: 25, dmg: 8, speed: 0,     attackCooldown: 2800, range: 0.45, static: true },

  };

  const ENEMY_MELEE_RANGE = 0.04;

  // F12 per-unit speciali mechanika (kortos nugaros statams). Bazė (hp/dmg/speed/cd/range) iš

  // ALLY_STATS; čia tik specialūs statai. Neaktyvūs (0/false) kortoj rodomi pilki, bet ĮVARDINTI.

  const _F12_UNIT_STATS = {

    skull:        { rangeKind: 'MELEE', crit: 0,    block: 0.25, aoe: false },

    archer:       { rangeKind: 'LONG',  crit: 0,    block: 0,    aoe: false },

    shaman:       { rangeKind: 'LONG',  crit: 0,    block: 0,    aoe: true  },

    harpoon_fish: { rangeKind: 'MID',   crit: 0,    block: 0,    aoe: false },

    hog_rider:    { rangeKind: 'MELEE', crit: 0.10, block: 0,    aoe: false },

  };

  // Tower sprite cache

  const _towerSpriteImg = new Image(); _towerSpriteImg.src = 'assets_tiny/Buildings_Tower.png';

  const _zipSpriteImg = new Image(); _zipSpriteImg.src = 'assets_tiny/Buildings_Zip.png';

  const _zipChargeImg2 = new Image(); _zipChargeImg2.src = 'assets_tiny/Buildings_Zip_Charge.png';

  // Spike trap sprite sheet — 5 frames (flat→peak), kiekvienas 371×169, bottom-center anchored

  const _spikeSheetImg = new Image(); _spikeSheetImg.src = 'spike_sheet.png';

  const _SPIKE_FRAME_W = 371, _SPIKE_FRAME_H = 169, _SPIKE_FRAMES = 5;

  // Wall sprite sheet — 16 frames (intact→destroyed), kiekvienas 212×384, bottom-anchored

  const _wallSheetImg = new Image(); _wallSheetImg.src = 'wall_sheet.png';

  const _WALL_FRAME_W = 212, _WALL_FRAME_H = 384, _WALL_FRAMES = 16;

  // Wall destruction animation — 15 frames, kiekvienas 280×296, transparent bg

  const _wallDestroyImg = new Image(); _wallDestroyImg.src = 'walldestroi_sheet.png';

  const _WD_FRAME_W = 280, _WD_FRAME_H = 296, _WD_FRAMES = 15;

  const _WD_START_FRAME = 3;   // animacija prasideda nuo 4-to kadro (idx 3)

  // Frost (Ronin) merge effekto logo — baltas R-skydas, transparent bg (92×126)

  const _frostLogoImg = new Image(); _frostLogoImg.src = 'frost_r.png';

  // Launcher platforma — animuotas sprite sheet (8 frames @ 640×392)

  // Animacija paleisžiama TIK kai šūvis išleistas (fire reaction), ne idle

  const _platformSheetImg = new Image(); _platformSheetImg.src = 'platform_sheet.png';

  const _PLATFORM_FW = 640, _PLATFORM_FH = 392, _PLATFORM_FRAMES = 8, _PLATFORM_FPS = 10;

  let _f12PlatformAnimStart = 0;     // timestamp kai paskutinis šūvis (animacija triggerina)

  // ── F12 ENEMY KINDS — skull / spider / minotaur ──

  // gap = min separation tarp 2 priešų toj pačioj lane (anti-overlap)

  const _F12_ENEMY_KINDS = {

    skull:     { frameW: 192, sizeMul: 1.0, hpMul: 1.0, spdMul: 1.0, gap: 0.045, sheets: null },

    spider:    { frameW: 192, sizeMul: 0.9, hpMul: 1.0, spdMul: 2.4, gap: 0.040, sheets: null }, // hp force'inta į 1 spawn'e — greičiausias

    minotaur:  { frameW: 320, sizeMul: 1.4, hpMul: 1.8, spdMul: 0.7, gap: 0.065, sheets: null },

    axieronke: { frameW: 640, sizeMul: 0.66, hpMul: 1.2, spdMul: 1.9, gap: 0.060, sheets: null }, // naujas — ~5px mažesnis

    bear:      { frameW: 256, sizeMul: 1.3, hpMul: 1.5, hpFlat: 6, spdMul: 1.5, gap: 0.070, sheets: null, allyDmg: 2, hitDelay: 470, atkCd: 4000, critChance: 0.20, critDmg: 3 }, // tankas (+6 HP), kerta -2 (20% crit -4), ataka kas 4s, smūgis atidėtas iki slam

    thief:     { frameW: 192, sizeMul: 1.08, hpMul: 1.0, hpFlat: 10, spdMul: 2.4, gap: 0.045, sheets: null, allyDmg: 1, hitDelay: 300, atkCd: 1650, critChance: 0.15, critDmg: 3, missChance: 0.20 }, // greitis = voras (spdMul 2.4), hp=10, allyDmg=1, 15% crit -> 4 dmg; miss 20% (susilpnintas)

  };

  let _f12EnemyKindsInit = false;

  function _initF12EnemySheets() {

    if (_f12EnemyKindsInit) return;

    if (typeof loadHorizontalSheetFrames !== 'function') return;

    _f12EnemyKindsInit = true;

    _F12_ENEMY_KINDS.skull.sheets = {

      idle:   loadHorizontalSheetFrames('assets_tiny/Skull_Idle.png',   8),

      run:    loadHorizontalSheetFrames('assets_tiny/Skull_Run.png',    6),

      attack: loadHorizontalSheetFrames('assets_tiny/Skull_Attack.png', 7),

      guard:  loadHorizontalSheetFrames('assets_tiny/Skull_Guard.png',  7),

    };

    _F12_ENEMY_KINDS.spider.sheets = {

      idle:   loadHorizontalSheetFrames('assets_tiny/Spider_Idle.png',   8),

      run:    loadHorizontalSheetFrames('assets_tiny/Spider_Run.png',    5),

      attack: loadHorizontalSheetFrames('assets_tiny/Spider_Attack.png', 8),

      guard:  loadHorizontalSheetFrames('assets_tiny/Spider_Idle.png',   8),  // spider neturi guard — fallback į idle

    };

    _F12_ENEMY_KINDS.minotaur.sheets = {

      idle:   loadHorizontalSheetFrames('assets_tiny/Minotaur_Idle.png',   16),

      run:    loadHorizontalSheetFrames('assets_tiny/Minotaur_Walk.png',    8),

      attack: loadHorizontalSheetFrames('assets_tiny/Minotaur_Attack.png', 12),

      guard:  loadHorizontalSheetFrames('assets_tiny/Minotaur_Guard.png',  11),

    };

    // AxieRonke — 8 frames @ 640px (idle / walk / attack / dmgtake); guard fallback į idle

    {

      const idleS    = loadHorizontalSheetFrames('assets/axieronke_idle.png',    8);

      const walkS    = loadHorizontalSheetFrames('assets/axieronke_walk.png',    8);

      const attackS  = loadHorizontalSheetFrames('assets/axieronke_attack.png',  8);

      const dmgtakeS = loadHorizontalSheetFrames('assets/axieronke_dmgtake.png', 8);

      _F12_ENEMY_KINDS.axieronke.sheets = {

        idle:   idleS,

        run:    walkS,

        attack: attackS,

        guard:  idleS,

        hurt:   dmgtakeS,

      };

    }

    // Bear (Tiny Swords Enemy Pack) — 256px kadrai: idle 8 / run 5 / attack 9; guard fallback į idle

    _F12_ENEMY_KINDS.bear.sheets = {

      idle:   loadHorizontalSheetFrames('assets_tiny/Bear_Idle.png',   8),

      run:    loadHorizontalSheetFrames('assets_tiny/Bear_Run.png',    5),

      attack: loadHorizontalSheetFrames('assets_tiny/Bear_Attack.png', 9),

      guard:  loadHorizontalSheetFrames('assets_tiny/Bear_Idle.png',   8),

    };

    _F12_ENEMY_KINDS.thief.sheets = {

      idle:   loadHorizontalSheetFrames('assets_tiny/Thief_Idle.png?v=noeye_20260610',   6),

      run:    loadHorizontalSheetFrames('assets_tiny/Thief_Run.png?v=noeye_20260610',    6),

      attack: loadHorizontalSheetFrames('assets_tiny/Thief_Attack.png?v=noeye_20260610', 6),

      guard:  loadHorizontalSheetFrames('assets_tiny/Thief_Idle.png?v=noeye_20260610',   6),

    };

  }

  const _F12_ENEMY_KIND_LIST = ['skull', 'spider', 'minotaur', 'axieronke', 'bear', 'thief'];

  // RONKE su kepure (lvl3) — personažo idle sprite šalia patrankos (8 frames @ 632×640)

  const _ronke2Img = new Image(); _ronke2Img.src = 'assets/ronkelvl3.png';

  const _RONKE2_FW = 632, _RONKE2_FH = 640, _RONKE2_FRAMES = 8;

  // Lazdos orbo pozicija per-frame. X užfiksuota (0.302 — vidurkis), kad burbulas

  // neslidinėtų horizontaliai (detekcijos triukšmas dėl magiškų blizgesių f3-f5).

  // Y juda natūraliai: f4 = peak UP, f0/f7 = žemiausia. Amplitudė ~5 display px.

  const _RONKE2_ORB_OFFSETS = [

    [+0.302, -0.2309],   // f0 — mid

    [+0.302, -0.2340],   // f1 — kyla

    [+0.302, -0.2494],   // f2 — kyla

    [+0.302, -0.2758],   // f3 — toliau kyla

    [+0.302, -0.2836],   // f4 — peak UP

    [+0.302, -0.2695],   // f5 — leidziasi

    [+0.302, -0.2321],   // f6 — beveik mid

    [+0.302, -0.2310],   // f7 — mid

  ];

  const _ZIP_FRAMES = 8, _ZIP_FPS = 10;

  const _ZIP_CHARGE_FRAMES = 14, _ZIP_CHARGE_FPS = 10;

  const _ZIP_CHARGE_DUR = (_ZIP_CHARGE_FRAMES / _ZIP_CHARGE_FPS) * 1000;  // 1400ms

  // Lightning bolts iš zip tower'io

  let _f12ZipBolts = [];           // {laneIdx, sx, sy, ex, ey, born, life, seed}

  let deployPool = {};

  let selectedDeployType = null;

  let selectedDeployTokenId = null;   // picker'io pasirinktas KONKRETUS NFT (jei null — pirmas tinkamas)

  // Unit deploy cooldown — kiekvienam tipui paskutinio deploy laikas

  let _f12UnitDeployCD = {};                       // {utype: timestamp_of_last_deploy}

  const _UNIT_LIFETIME_MS = 30000;                 // 30s lane'oj — tada recall į pool

  const _UNIT_DEPLOY_CD_MS = 60000;                // 60s cooldown tarp deploy'ų (per type)

  const _UNIT_SPAWN_ANIM_MS = 400;                 // spawn animacijos trukmė

  let _f12RecallEffects = [];                      // [{cx, cy, utype, born}] — recall anim particles

  let _f12CardBarsAnimAt = {};                     // {ballType: timestamp} — prison bars descend animation start

  let _f12CardBarsSoundDone = {};                  // {ballType: boolean} — ar garsiukas jau sugrojo šiai kortai

  let _f12CardBonusMs = {};                        // {ballType: pre-deploy ms bonusas (kaupiamas)}

  let _f12BonusPopups = [];                        // [{x, y, text, born, color}] — vizualus „+5s" floating popup

  let _f12BallsMinusPopups = [];                   // [{born}] — „-1" indikatorius ant BALLS stulpelio per merge

  let _f12BallsPrevCount = 0;                      // praeito frame'o blocks.length — kad detect'inti decrease

  let _f12BallsDropAt = 0;                         // timestamp kai paskutinį kartą BALLS sumažėjo (juicy anim trigger)

  let _f12BallsDropAmount = 0;                     // kiek sumažėjo (1, 2 ar daugiau)

  let _f12ScorePrevValue = 0;                      // praeito frame'o score — kad detect'inti increase

  let _f12ScoreUpAt = 0;                           // timestamp kai paskutinį kartą score padidėjo

  let _f12ScoreUpAmount = 0;                       // kiek pridėta (5, 8, 16, 32...)

  let _f12ScorePopups = [];                        // [{born, amount}] — „+N" floating popup'ai virš SCORE

  // Bonus laikas auga su merge'inamų kamuoliukų dydžiu:

  //   value=4 (mažiausias merge: 2+2) → 5s, value=8 → 10s, value=16 → 15s, ...

  function _mergeBonusMs(value) {

    const tier = Math.max(1, Math.floor(Math.log2(value || 4)) - 1);

    return tier * 5000;

  }

  // Ball type → ally unit type mapping (semantinis: arrow→archer, shield→tower, etc.)

  // Pearl ir frost lieka „pure support" su specialiais efektais (charge / lane reverse).

  const _UNIT_FOR_BALL_TYPE = {

    arrow:   'archer',

    shield:  'tower',

    heart:   'shaman',

    leaf:    'harpoon_fish',

    star:    'crossbow_tower',

    crystal: 'zip',

    shadow:  'skull',

    frost:   'hog_rider',   // mėlyna (Ronin) — Hog Rider (NFT utype 5). Frost IŠLAIKO lane-reverse merge efektą (kaip shadow turi ir wall ir skull)

    // pearl — be unit (palieka jam specialų merge attack)

  };

  // ── F12 session free unit pool — pre-deck modal'o pasirinkti free unitai ──

  // {utype: count} — atstatomas kiekvieno F12 session pradžioje, pildomas iš pre-deck choice.

  // Naudojamas tose pat _getTrainedCount/_takeTrainedUnit funkcijose kad senasis deploy

  // logic'as (card unlocked + trained > 0 + CD) liktų nepakitusios.

  let _f12SessionFreePool = {};

  // ── F12 session NFT pool — picked iš NFT Barracks DEPLOY tab'o ──

  // [{tokenId, utype, xp, level, contractUtype, hp, maxHp}] — kiekvienas elementas = 1 NFT unit

  // _takeTrainedUnit ima pirmą tinkamo utype NFT, snap.tokenId išsaugomas ally.trainedSnap'e (burn flow).

  let _f12SessionNftPool = [];

  // Persistinis tokenId → {contractUtype, utype, xp, level} žemėlapis. Pildomas KARTĄ mūšio
  // pradžioj ir NIEKADA nesplice'inamas (skirtingai nei _f12SessionNftPool, iš kurio deploy'inti
  // unitai išimami). Settle ekranas naudoja JĮ → visada teisingas sprite/tipas. 2026-06-14.
  let _f12NftMetaMap = {};

  // NFT mūšio vėliava — kai true, žaidžiama TIK su pasirinktais NFT (+ free unitai uždirbti

  // merge'inant), JOKIO maišymo su F10 home-trained roster'iu. (Žaidėjo noras: NFT ir free atskirai.)

  let _f12IsNftBattle = false;

  // Dead NFT tokenIds — surenkam per game'ą, panaudojam end'e burn'inimui (Phase 2.2).

  let _f12DeadNftTokenIds = [];

  // Per-NFT stats per session: { [tokenId]: {kills, dmgDealt, dmgTaken, deployed} }

  let _f12NftStats = {};

  function _statsForToken(tokenId) {

    const k = String(tokenId);

    if (!_f12NftStats[k]) _f12NftStats[k] = { tokenId: k, kills: 0, dmgDealt: 0, dmgTaken: 0, deployed: 0 };

    return _f12NftStats[k];

  }

  // CHECKPOINT (kas 5s): siunčia NFT mūšio progresą serveriui (server-validated XP), kad

  // reset/reload neprarastų uždirbto XP. Cheat'as nukerpamas serveryje (delta clamp).

  let _f12CheckpointTimer = null;

  function _f12SendCheckpoint() {

    try {

      if (!(active && window._f12NftBurnAuth && !_f12BattleSettled)) return;

      const _auth = window._f12NftBurnAuth;

      // Wallet'as iš burn-auth parašo (VISADA yra) — NEpriklausom nuo gyvo Wallet ryšio,

      // kuris gali atsijungti mirties/reload momentu ir sustabdyti commit'ą.

      const _w = (_auth && _auth.owner) || (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || null;

      if (!_auth.battleId || !_w || !window.SupabaseSync || typeof window.SupabaseSync.invoke !== 'function') return;

      const stats = {}; let any = false;

      for (const k in _f12NftStats) {

        const s = _f12NftStats[k]; if (!s) continue;

        stats[k] = { kills: s.kills || 0, dmgDealt: s.dmgDealt || 0, dmgTaken: s.dmgTaken || 0 };

        any = true;

      }

      // Mirtys važiuoja TUO PAČIU patikimu transportu kaip checkpoint (kuris įrodytai veikia).

      const dead = (_f12DeadNftTokenIds && _f12DeadNftTokenIds.length) ? _f12DeadNftTokenIds.slice() : [];

      if (!any && !dead.length) return;

      // Parašas + tikslus nonce → serveris saugo (settle_auth), kad cron sweep galėtų sudegint

      // abandoned mirusius BE kliento (anti reload-to-escape-death enforcement).

      window.SupabaseSync.invoke('checkpoint-battle', {

        wallet: String(_w).toLowerCase(), battleId: String(_auth.battleId), stats: stats, deadTokenIds: dead,

        ownerSignature: _auth.signature, nonce: String(_auth.nonce),

        timeScale: _f12TimeScale,   // ×2 mode → serveris padaugina anti-cheat rate lubas

      }).then(function (r) { if (dead.length) console.log('[F12 death] checkpoint dead=', r && (r.data ? r.data.dead : r.dead)); })

        .catch(function () {});   // fire-and-forget

    } catch (_) {}

  }

  // Užfiksuoja NFT mirtį serveryje PATIKIMAI. sendBeacon — naršyklė ją išsiunčia NET jei

  // žaidėjas iškart perkrauna/uždaro puslapį (paprastas fetch tuo atveju NUTRAUKIAMAS →

  // mirtis nepasiekdavo serverio = exploit). Fallback į invoke jei sendBeacon nepalaikomas.

  const _REGISTER_DEATH_URL = 'https://rbkivemouxwcgrpzazxb.supabase.co/functions/v1/register-death';

  const _CHECKPOINT_URL = 'https://rbkivemouxwcgrpzazxb.supabase.co/functions/v1/checkpoint-battle';

  const _SB_KEY = 'sb_publishable_E4cHxTFKDTYgrdxcv5uRfQ_9tryLJ4p';   // anon/publishable

  // RELOAD-PROOF mirties commit per checkpoint-battle (ENDPOINT'AS, kuris ĮRODYTAI pasiekiamas

  // iš naršyklės — register-death dėl nežinomos priežasties blokuojamas). keepalive:true →

  // išgyvena puslapio unload/perkrovimą. Pilni header'iai → gateway+CORS OK.

  function _commitDeathKeepalive(tokenId) {

    try {

      const _auth = window._f12NftBurnAuth;

      const _w = (_auth && _auth.owner) || (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || null;

      if (!_auth || !_auth.battleId || !_w) return;

      const body = JSON.stringify({

        wallet: String(_w).toLowerCase(), battleId: String(_auth.battleId),

        stats: {}, deadTokenIds: [tokenId],

      });

      fetch(_CHECKPOINT_URL, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', 'apikey': _SB_KEY, 'Authorization': 'Bearer ' + _SB_KEY },

        body: body, keepalive: true, mode: 'cors',

      }).then(function (r) { console.log('[F12 death] keepalive checkpoint status ' + r.status + ' #' + tokenId); })

        .catch(function (e) { console.warn('[F12 death] keepalive checkpoint err', e); });

    } catch (e) { console.warn('[F12 death] keepalive checkpoint threw', e); }

  }

  // ── KANONINIS reload-proof mirties settlement: localStorage + flush per submit-battle-result ──

  // PROBLEMA: burn'ą gali atlikti TIK submit-battle-result su EIP-712 ownerSignature, kurio

  // serveris NESaugo (yra tik kliento window._f12NftBurnAuth, dingstančiame per reload). Tad

  // mirties momentu išsaugom į localStorage VISĄ burn-auth (parašą) + mirusių tokenų sąrašą.

  // Po perkrovimo (arba įėjus į F12) — „suvaidinam game-over" (settlement kaip loss) su išsaugotu

  // parašu → relayer sudegina mirusius NFT, lygiai kaip per tikrą game over. „Paskutinis įrašas

  // = game over", net jei nutraukei žaidimą.

  const _PENDING_SETTLE_LS = 'f12_pending_settle_v1';

  function _loadPendingSettle() { try { return JSON.parse(localStorage.getItem(_PENDING_SETTLE_LS) || '{}') || {}; } catch (_) { return {}; } }

  function _savePendingSettle(o) { try { localStorage.setItem(_PENDING_SETTLE_LS, JSON.stringify(o)); } catch (_) {} }

  function _persistDeathLocal(tokenId) {

    try {

      const _auth = window._f12NftBurnAuth;

      if (!_auth || !_auth.battleId || !_auth.signature) return;

      const all = _loadPendingSettle();

      const bid = String(_auth.battleId);

      const e = all[bid] || {

        auth: {

          battleId: String(_auth.battleId), signature: _auth.signature,

          nonce: String(_auth.nonce), deadline: String(_auth.deadline), owner: _auth.owner,

        }, dead: [], at: Date.now(),

      };

      if (e.dead.indexOf(Number(tokenId)) < 0) e.dead.push(Number(tokenId));

      e.at = Date.now();

      all[bid] = e;

      _savePendingSettle(all);

      console.log('[F12 death] persisted settle #' + tokenId, bid);

    } catch (e) { console.warn('[F12 death] persist settle err', e); }

  }

  // Pašalinam battleId iš pending (kai jau settlinta — normalaus game-over arba flush metu).

  function _clearPendingSettle(battleId) {

    try { const all = _loadPendingSettle(); if (all[String(battleId)]) { delete all[String(battleId)]; _savePendingSettle(all); } } catch (_) {}

  }

  // Po perkrovimo — settlinam užstrigusias abandoned sesijas (su išsaugotu parašu) kaip loss.

  function _flushPendingDeaths() {

    const all = _loadPendingSettle();

    const bids = Object.keys(all);

    if (!bids.length) return;

    if (!window.SupabaseSync || typeof window.SupabaseSync.invoke !== 'function') return;

    bids.forEach(function (bid) {

      const e = all[bid];

      if (!e || !e.auth || !e.auth.signature || !e.dead || !e.dead.length) { _clearPendingSettle(bid); return; }

      if (Date.now() - (e.at || 0) > 3600000) { _clearPendingSettle(bid); return; }   // per sena — sesija expired

      console.log('[F12 settle-abandoned] flushing #' + bid, e.dead);

      window.SupabaseSync.invoke('submit-battle-result', {

        battleId: e.auth.battleId,

        ownerSignature: e.auth.signature,

        nonce: e.auth.nonce,

        deadlineSec: e.auth.deadline,

        deadTokenIds: e.dead,

        survivors: [],

        won: false,

        battleDurationSec: 0,

      }).then(function (wrap) {

        const resp = wrap && wrap.data ? wrap.data : wrap;

        const ok = wrap && wrap.ok && resp && resp.ok !== false;

        const errStr = (resp && resp.error) || '';

        const unrecoverable = /already resolved|expired|not found/i.test(errStr);   // baigta arba nebeatkuriama → metam

        console.log('[F12 settle-abandoned] #' + bid, ok ? 'BURNED' : errStr, resp && resp.burnedTokenIds);

        if (ok || unrecoverable) _clearPendingSettle(bid);

      }).catch(function (err) { console.warn('[F12 settle-abandoned] net err #' + bid, err); });   // network → liks retry

    });

  }

  // Matomas (ne blokuojantis) pranešimas, kad NFT žuvo — auto-dingsta po ~3.5s.

  function _showDeathToast(tokenId) {

    try {

      let host = document.getElementById('f12-death-toasts');

      if (!host) {

        host = document.createElement('div');

        host.id = 'f12-death-toasts';

        host.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;font-family:inherit;';

        document.body.appendChild(host);

      }

      const t = document.createElement('div');

      t.style.cssText = 'background:#3a0d0d;border:2px solid #e85d5d;color:#ffd9d9;padding:9px 16px;border-radius:8px;font-weight:bold;font-size:15px;box-shadow:0 4px 14px rgba(0,0,0,.5);opacity:0;transition:opacity .25s;text-shadow:0 1px 2px #000;';

      t.textContent = '💀 NFT #' + tokenId + ' died — registering on-chain death';

      host.appendChild(t);

      requestAnimationFrame(function () { t.style.opacity = '1'; });

      setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { try { host.removeChild(t); } catch (_) {} }, 300); }, 3500);

    } catch (_) {}

  }

  // ── NFT UNIT PICKER (HTML overlay) ─────────────────────────────────────────────────

  // Paspaudus tipo kortą su keliais NFT — išskleidžia langelį, kur matai KIEKVIENO NFT status

  // (Lv / HP / dmg pagal level skalę) ir pasirenki KONKRETŲ deploy'ui. Sprendžia „nežinau ką dedu".

  function _closeUnitPicker() {

    try { if (_pickerAnimId) { cancelAnimationFrame(_pickerAnimId); _pickerAnimId = 0; } } catch (_) {}

    try { ['f12-unit-picker', 'f12-unit-picker-bg'].forEach(function (id) { const el = document.getElementById(id); if (el) el.remove(); }); } catch (_) {}

  }

  function _ensurePickerStyle() {

    if (document.getElementById('f12-picker-style')) return;

    const st = document.createElement('style');

    st.id = 'f12-picker-style';

    st.textContent = [

      '@keyframes f12pkIn{from{opacity:0;transform:translateY(16px) scale(.95)}to{opacity:1;transform:none}}',

      '@keyframes f12pkPick{0%{transform:scale(1)}45%{transform:scale(1.09)}100%{transform:scale(1)}}',

      '#f12-unit-picker-bg{position:fixed;inset:0;z-index:99997;background:rgba(8,4,2,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);}',

      '#f12-unit-picker{position:fixed;left:0;right:0;bottom:118px;z-index:99998;display:flex;flex-direction:column;align-items:center;gap:9px;pointer-events:none;font-family:inherit;animation:f12pkIn .18s ease-out;}',

      '.f12pk-title{pointer-events:none;color:#ffe6a8;font-weight:800;font-size:15px;letter-spacing:2px;text-shadow:0 2px 4px #000;}',

      '.f12pk-portrait{image-rendering:pixelated;image-rendering:crisp-edges;width:172px;height:156px;pointer-events:none;filter:drop-shadow(0 6px 8px rgba(0,0,0,.65));margin-bottom:-8px;}',

      '.f12pk-panel{pointer-events:auto;display:flex;gap:11px;max-width:94vw;overflow-x:auto;padding:13px;border-radius:16px;background:linear-gradient(180deg,#6b4a2e,#3d2b18);border:3px solid #1f130a;box-shadow:0 0 0 3px #a87a44,0 14px 38px rgba(0,0,0,.65);}',

      '.f12pk-card{flex:0 0 auto;width:126px;cursor:pointer;border-radius:12px;overflow:hidden;background:linear-gradient(180deg,#f7ead0,#e2c997);border:2px solid #2a1a0c;color:#3a2410;transition:transform .12s,box-shadow .12s;box-shadow:0 3px 8px rgba(0,0,0,.4);padding-bottom:9px;}',

      '.f12pk-card:hover{transform:translateY(-6px) scale(1.03);box-shadow:0 0 0 3px #ffcf5c,0 12px 24px rgba(0,0,0,.55),0 0 22px rgba(255,207,92,.7);}',

      '.f12pk-card.picked{animation:f12pkPick .25s ease-out;}',

      '.f12pk-lvbar{background:linear-gradient(180deg,#ffd862,#e0a32e);color:#3a2410;text-align:center;font-weight:800;font-size:16px;letter-spacing:.5px;padding:6px 0;border-bottom:2px solid #2a1a0c;text-shadow:0 1px 0 rgba(255,255,255,.45);}',

      '.f12pk-card.dmg .f12pk-lvbar{background:linear-gradient(180deg,#f08a6a,#d2543b);}',

      '.f12pk-id{text-align:center;font-size:9px;opacity:.6;letter-spacing:.5px;margin:5px 0 7px;text-transform:uppercase;}',

      '.f12pk-body{padding:0 10px;}',

      '.f12pk-row{display:flex;align-items:center;gap:6px;font-size:13px;margin:6px 0;}',

      '.f12pk-ic{width:15px;text-align:center;}',

      '.f12pk-bar{flex:1;height:9px;border-radius:5px;background:rgba(0,0,0,.16);overflow:hidden;border:1px solid rgba(0,0,0,.35);}',

      '.f12pk-bf{height:100%;border-radius:4px;}',

      '.f12pk-val{font-size:11px;font-weight:700;min-width:36px;text-align:right;}',

      '.f12pk-xpwrap{margin:9px 10px 0;padding-top:8px;border-top:1px solid rgba(58,36,16,.25);}',

      '.f12pk-xplabel{display:flex;justify-content:space-between;font-size:8px;opacity:.7;margin-bottom:3px;font-weight:700;}',

      '.f12pk-xpbar{height:6px;border-radius:4px;background:rgba(0,0,0,.2);overflow:hidden;border:1px solid rgba(0,0,0,.3);}',

      '.f12pk-xpfill{height:100%;background:linear-gradient(90deg,#3a8d96,#5fd0b8);}',

      '.f12pk-hint{pointer-events:none;font-size:10px;color:#e8d4a8;opacity:.85;text-shadow:0 1px 2px #000;}',

      '.f12pk-flipnote{text-align:center;font-size:8px;opacity:.5;margin:5px 0 1px;font-style:italic;}',

      // ── Kortos NUGARA (flip — pilni F12 statai; neaktyvūs pilki bet įvardinti) ──

      '.f12pk-flipping{transform:scaleX(.04)!important;}',

      '.f12pk-bktitle{text-align:center;font-size:9px;font-weight:800;letter-spacing:1px;opacity:.6;margin:5px 0 4px;}',

      '.f12pk-statwrap{padding:0 9px;}',

      '.f12pk-stat{display:flex;align-items:center;gap:5px;font-size:9px;padding:2px 0;}',

      '.f12pk-stat .sl{flex:0 0 48px;display:flex;align-items:center;gap:3px;font-weight:700;white-space:nowrap;}',

      '.f12pk-sbar{flex:1;height:7px;border-radius:4px;background:rgba(0,0,0,.14);overflow:hidden;border:1px solid rgba(0,0,0,.28);}',

      '.f12pk-sbf{height:100%;border-radius:3px;}',

      '.f12pk-stat .sv{flex:0 0 28px;text-align:right;font-weight:800;font-size:9px;}',

      '.f12pk-stat.on .sv{color:#1d6b2c;}',

      '.f12pk-stat.off{opacity:.32;}',

      '.f12pk-btns{display:flex;gap:5px;padding:8px 9px 0;}',

      '.f12pk-dep{flex:1;background:linear-gradient(180deg,#46b257,#2c7d3a);color:#fff;border:2px solid #1d5226;border-radius:7px;padding:6px 0;font-weight:800;font-size:10px;text-align:center;cursor:pointer;letter-spacing:.5px;}',

      '.f12pk-dep:hover{filter:brightness(1.1);}',

      '.f12pk-bk{width:30px;flex:0 0 auto;background:#cbb288;border:2px solid #2a1a0c;border-radius:7px;text-align:center;cursor:pointer;font-size:13px;color:#3a2410;display:flex;align-items:center;justify-content:center;}',

      // ── MOBILE / žemas ekranas (landscape telefonas) — sumažinam, kad tilptų ir nebūtų cut-off ──

      '@media (max-height:560px){'

      + '#f12-unit-picker{bottom:54px;gap:3px;}'

      + '.f12pk-portrait{width:104px;height:94px;margin-bottom:-4px;}'

      + '.f12pk-title{font-size:11px;letter-spacing:1px;}'

      + '.f12pk-panel{padding:8px;gap:7px;border-radius:12px;}'

      + '.f12pk-card{width:104px;padding-bottom:7px;}'

      + '.f12pk-lvbar{font-size:13px;padding:4px 0;}'

      + '.f12pk-id{margin:3px 0 5px;}'

      + '.f12pk-row{margin:4px 0;font-size:12px;}'

      + '.f12pk-xpwrap{margin-top:6px;padding-top:5px;}'

      + '.f12pk-hint{font-size:9px;}'

      + '}',

      // ── Siauras ekranas — kortelės kiek siauresnės, kad daugiau tilptų be scroll ──

      '@media (max-width:480px){.f12pk-card{width:96px;}.f12pk-panel{gap:6px;padding:8px;}}',

    ].join('');

    document.head.appendChild(st);

  }

  function _showUnitPicker(utype, ballType) {

    try {

      const units = _f12SessionNftPool.filter(function (n) { return n && n.utype === utype; });

      if (!units.length) return false;

      const base = ALLY_STATS[utype] || ALLY_STATS.skull;

      _ensurePickerStyle();

      _closeUnitPicker();

      units.sort(function (a, b) { return (b.level | 0) - (a.level | 0); });   // stipriausi pirmi

      // ATK juostos skalei — didžiausias dmg tarp rodomų

      const maxDmgShown = Math.max.apply(null, units.map(function (u) { return Math.round(base.dmg * _nftStatMul(u.level)); }));

      const backdrop = document.createElement('div');

      backdrop.id = 'f12-unit-picker-bg';

      backdrop.onclick = function () { _closeUnitPicker(); };

      const host = document.createElement('div');

      host.id = 'f12-unit-picker';

      const title = document.createElement('div');

      title.className = 'f12pk-title';

      title.textContent = '⚔ CHOOSE YOUR ' + String(utype).toUpperCase();

      const panel = document.createElement('div');

      panel.className = 'f12pk-panel';

      units.forEach(function (u) {

        const lvl = u.level | 0;

        const mul = _nftStatMul(lvl);

        const maxHp = u.maxHp != null ? u.maxHp : Math.round(base.hp * mul);

        const curHp = u.hp != null ? u.hp : maxHp;

        const dmg = Math.max(1, Math.round(base.dmg * mul));

        const damaged = curHp < maxHp;

        const hpPct = maxHp > 0 ? Math.max(4, (curHp / maxHp) * 100) : 0;

        const atkPct = maxDmgShown > 0 ? Math.max(8, (dmg / maxDmgShown) * 100) : 100;

        // XP iki kito lygio (formulė kaip barracks: lvl²×100)

        const curT = lvl * lvl * 100, nextT = (lvl + 1) * (lvl + 1) * 100, xp = u.xp | 0;

        const xpPct = Math.max(0, Math.min(100, ((xp - curT) / (nextT - curT)) * 100));

        const xpToNext = Math.max(0, nextT - xp);

        const card = document.createElement('div');

        card.className = 'f12pk-card' + (damaged ? ' dmg' : '');

        // Korta — Lv / HP / ATK / XP. Tap = pasirink šitą NFT → tada tap lane = deploy.

        // JOKIO flip (per daug klikų). Pilni statai rodomi INVENTORIUJE (deck-building), ne čia.

        card.innerHTML =

          '<div class="f12pk-lvbar">Lv ' + lvl + '</div>'

          + '<div class="f12pk-id">#' + u.tokenId + ' · ' + String(utype) + '</div>'

          + '<div class="f12pk-body">'

          + '<div class="f12pk-row"><span class="f12pk-ic">❤</span><div class="f12pk-bar"><div class="f12pk-bf" style="width:' + hpPct + '%;background:' + (damaged ? 'linear-gradient(90deg,#e85d5d,#ff9a8a)' : 'linear-gradient(90deg,#3fa84f,#7cd97a)') + '"></div></div><span class="f12pk-val">' + curHp + '/' + maxHp + '</span></div>'

          + '<div class="f12pk-row"><span class="f12pk-ic">⚔</span><div class="f12pk-bar"><div class="f12pk-bf" style="width:' + atkPct + '%;background:linear-gradient(90deg,#c8602e,#ff9a6e)"></div></div><span class="f12pk-val">' + dmg + '</span></div>'

          + '</div>'

          + '<div class="f12pk-xpwrap"><div class="f12pk-xplabel"><span>XP</span><span>' + (xpToNext > 0 ? xpToNext.toLocaleString() + ' → Lv ' + (lvl + 1) : 'MAX') + '</span></div><div class="f12pk-xpbar"><div class="f12pk-xpfill" style="width:' + xpPct + '%"></div></div></div>';

        card.onclick = function (ev) {

          ev.stopPropagation();

          card.classList.add('picked');

          selectedDeployType = utype;

          selectedDeployTokenId = u.tokenId;

          setTimeout(_closeUnitPicker, 160);   // pasirinkta → tada tap lane deploy'ina

        };

        panel.appendChild(card);

      });

      const hint = document.createElement('div');

      hint.className = 'f12pk-hint';

      hint.textContent = 'Tap a unit, then tap a lane to deploy';

      // VIENAS didelis idle preview VIRŠ kortų (ne kortelėse) — visos kortos = tas pats tipas.

      const portrait = document.createElement('canvas');

      portrait.width = 172; portrait.height = 156;

      portrait.className = 'f12pk-portrait';

      const pctx = portrait.getContext('2d');

      host.appendChild(portrait);

      host.appendChild(title);

      host.appendChild(panel);

      host.appendChild(hint);

      document.body.appendChild(backdrop);

      document.body.appendChild(host);

      // Idle animacijos loop (kol picker atidarytas)

      try { if (_pickerAnimId) cancelAnimationFrame(_pickerAnimId); } catch (_) {}

      (function _loop() {

        if (!document.getElementById('f12-unit-picker')) { _pickerAnimId = 0; return; }

        try { pctx.clearRect(0, 0, portrait.width, portrait.height); _drawPickerUnit(pctx, utype, portrait.width, portrait.height, performance.now()); } catch (_) {}

        _pickerAnimId = requestAnimationFrame(_loop);

      })();

      return true;

    } catch (e) { console.warn('[F12 picker] err', e); return false; }

  }

  function _registerDeathReliable(tokenId) {

    try {

      const _auth = window._f12NftBurnAuth;

      const _w = (_auth && _auth.owner) || (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || null;

      if (!_auth || !_auth.battleId || !_w) { console.warn('[F12 death] SKIP — no auth/wallet', { auth: !!_auth, battleId: _auth && _auth.battleId, wallet: !!_w }); return; }

      const obj = { wallet: String(_w).toLowerCase(), battleId: String(_auth.battleId), tokenId: tokenId };

      const payload = JSON.stringify(obj);

      // PIRMINIS kelias — fetch su keepalive:true. SKIRTUMAS nuo sendBeacon: keepalive fetch

      // (a) IŠGYVENA puslapio unload/perkrovimą (tam ir sukurtas), (b) leidžia siųst pilnus

      // header'ius (apikey+Authorization) → praeina gateway lygiai kaip veikiantis checkpoint,

      // (c) NĖRA „beacon" → naršyklės Tracking Prevention jo NEblokuoja (sendBeacon blokavo).

      try {

        fetch(_REGISTER_DEATH_URL, {

          method: 'POST',

          headers: { 'Content-Type': 'application/json', 'apikey': _SB_KEY, 'Authorization': 'Bearer ' + _SB_KEY },

          body: payload,

          keepalive: true,

          mode: 'cors',

        }).then(function (r) { console.log('[F12 death] keepalive status ' + r.status + ' #' + tokenId); })

          .catch(function (e) { console.warn('[F12 death] keepalive err', e); });

      } catch (e) { console.warn('[F12 death] keepalive threw', e); }

      console.log('[F12 death] REGISTER #' + tokenId, obj);

    } catch (e) { console.warn('[F12 death] outer err', e); }

  }

  // Increment kvietikliai (saugu jei ally ne NFT — tylus no-op)

  function _allyAddDmgDealt(ally, dmg) {

    if (!ally || !ally.trainedSnap || !ally.trainedSnap.nft) return;

    _statsForToken(ally.trainedSnap.tokenId).dmgDealt += dmg;

    _f12CheckLevelUp(ally, now());

  }

  function _allyAddKill(ally) {

    if (!ally || !ally.trainedSnap || !ally.trainedSnap.nft) return;

    _statsForToken(ally.trainedSnap.tokenId).kills++;

    _f12CheckLevelUp(ally, now());

  }

  function _allyAddDmgTaken(ally, dmg) {

    if (!ally || !ally.trainedSnap || !ally.trainedSnap.nft) return;

    _statsForToken(ally.trainedSnap.tokenId).dmgTaken += dmg;

    _f12CheckLevelUp(ally, now());

  }

  // ── LIVE level-up ant lentos: kai deployed NFT surenka pakankamai XP (kills+dmg) per mūšį →
  //    pakeliam GYVAI: pilnas HP atstatymas + stat boost (_nftStatMul) + vizualus „LEVEL UP".
  //    XP/level formulė ATITINKA serverį (submit-battle-result calculateXp) → live level == commit'inamas.
  const _F12_XP = { PART: 10, KILL: 20, DMG: 1, MAXK: 500, MAXDMG: 10000, MAXXP: 20000 };
  function _f12CalcXpGain(k, dd, dt) {
    let xp = _F12_XP.PART + Math.min(k | 0, _F12_XP.MAXK) * _F12_XP.KILL
      + Math.min(dd | 0, _F12_XP.MAXDMG) * _F12_XP.DMG + Math.min(dt | 0, _F12_XP.MAXDMG) * _F12_XP.DMG;
    return Math.min(xp, _F12_XP.MAXXP);
  }
  function _f12CheckLevelUp(a, t) {
    const ts = a && a.trainedSnap;
    if (!ts || !ts.nft) return;                                  // tik NFT unitai turi XP/level
    const st = _statsForToken(ts.tokenId);
    const liveXp = (ts.xp | 0) + _f12CalcXpGain(st.kills, st.dmgDealt, st.dmgTaken);
    // XP GAIN feedback — žali „+N" skaičiukai kai gyvas XP auga (subtilesnis nei level-up).
    // Throttle ~420ms + akumuliacija → satisfying, bet ne spam. Tik NFT (guard'as virš).
    {
      const _gain = liveXp - (ts.xp | 0);                 // = _f12CalcXpGain(...) — live gain šį mūšį
      const _delta = _gain - (a._xpShown | 0);
      if (_delta > 0) {
        a._xpShown = _gain;
        a._xpPopAccum = (a._xpPopAccum | 0) + _delta;
        const _tn = (t != null ? t : now());
        if (_tn - (a._xpPopLastAt || 0) > 420) {
          (a._xpPops || (a._xpPops = [])).push({ amt: a._xpPopAccum, at: _tn });
          if (a._xpPops.length > 5) a._xpPops.shift();
          a._xpPopAccum = 0; a._xpPopLastAt = _tn;
        }
      }
    }
    const newLv = _f12LevelFromXp(liveXp);
    const curLv = (a._liveLevel != null ? a._liveLevel : (ts.level | 0));
    if (newLv <= curLv) return;
    a._liveLevel = newLv;
    const base = ALLY_STATS[a.utype] || ALLY_STATS.skull;
    const mul = _nftStatMul(newLv);
    const nMax = Math.max(1, Math.round(base.hp * mul));
    a.maxHp = nMax; a.hp = nMax;                                 // ← PILNAS HP atstatymas (user noras)
    a.dmg = Math.max(1, Math.round(base.dmg * mul));            // + stat boost pagal naują lygį
    ts.level = newLv; if (ts.maxHp != null) ts.maxHp = nMax; if (ts.hp != null) ts.hp = nMax;   // snapshot coherent (xp lieka serverio commit'ui)
    a._lvUpAt = (t != null ? t : now());                        // ← per-unit vizualui (drawAlly loop)
    try { _showLevelUpToast(_f12UnitName(a.utype) + ' #' + ts.tokenId, newLv); } catch (_) {}   // ← žalias top banner
    try { if (window._F12Audio && window._F12Audio.reward) window._F12Audio.reward(); } catch (_) {}
  }
  function _f12UnitName(utype) {
    return String(utype || 'Unit').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  // Žalias top-center banner (analogiškas raudonam mirties toast'ui _showDeathToast).
  function _showLevelUpToast(name, level) {
    try {
      let host = document.getElementById('f12-levelup-toasts');
      if (!host) {
        host = document.createElement('div');
        host.id = 'f12-levelup-toasts';
        host.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;font-family:inherit;align-items:center;';
        document.body.appendChild(host);
      }
      const el = document.createElement('div');
      el.style.cssText = 'background:linear-gradient(180deg,#10401a,#0a2a10);border:2px solid #6eff8a;color:#e6ffe6;padding:10px 20px;border-radius:10px;font-weight:bold;font-size:16px;box-shadow:0 4px 16px rgba(0,0,0,.5),0 0 20px rgba(110,255,138,.4);text-shadow:0 1px 2px #000;opacity:0;transform:translateY(-10px) scale(.9);transition:opacity .28s,transform .28s cubic-bezier(.34,1.56,.64,1);';
      el.textContent = '⬆ ' + name + ' reached Lv ' + level + '!';
      host.appendChild(el);
      requestAnimationFrame(function () { el.style.opacity = '1'; el.style.transform = 'translateY(0) scale(1)'; });
      setTimeout(function () { el.style.opacity = '0'; el.style.transform = 'translateY(-10px) scale(.96)'; setTimeout(function () { try { host.removeChild(el); } catch (_) {} }, 340); }, 3400);
    } catch (_) {}
  }
  // Ilgesnė (2.4s), įsimintinesnė LEVEL-UP animacija virš unito — ŽALIA tema.
  // Sluoksniai: (1) švytėjimas, (2) 3 plečiasi žiedai (stagger), (3) kylančios žvaigždutės,
  // (4) bounce-in „LEVEL UP" + didelis „Lv N" su outline, lengvas plūduriavimas + fade tail.
  const _F12_LVUP_DUR = 2400;
  function _f12DrawLevelUpFx(cx, cy, sz, a, t) {
    if (!a._lvUpAt) return;
    const k = (t - a._lvUpAt) / _F12_LVUP_DUR; if (k < 0 || k >= 1) return;
    ctx.save();
    ctx.textAlign = 'center';
    // (1) Žalias švytėjimas ant unito (pirmi 40%)
    if (k < 0.4) {
      const gk = k / 0.4;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, sz * 2.6);
      grd.addColorStop(0, 'rgba(150,255,138,' + (0.6 * (1 - gk)).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(110,255,138,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, sz * 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // (2) 3 plečiasi žiedai (žalia + auksas akcentas), stagger
    for (let r = 0; r < 3; r++) {
      const rk = k - r * 0.14; if (rk <= 0 || rk >= 0.75) continue;
      const p = rk / 0.75;
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.strokeStyle = (r === 1) ? '#d6ff8a' : '#6eff8a';
      ctx.lineWidth = Math.max(2, sz * 0.22 * (1 - p));
      ctx.beginPath(); ctx.arc(cx, cy, sz * (0.8 + p * 2.3), 0, Math.PI * 2); ctx.stroke();
    }
    // (3) Kylančios žvaigždutės ratu
    const NS = 7;
    for (let s = 0; s < NS; s++) {
      const ang = (s / NS) * Math.PI * 2 + (a._lvUpAt % 6283) * 0.001;
      const sk = Math.min(1, k * 1.2);
      const dist = sz * (0.5 + sk * 2.0);
      const sx = cx + Math.cos(ang) * dist;
      const sy = cy + Math.sin(ang) * dist - sk * sz * 1.0;
      ctx.globalAlpha = (1 - sk) * 0.95;
      ctx.fillStyle = (s % 2) ? '#eaffd6' : '#6eff8a';
      ctx.font = 'bold ' + Math.round(sz * (0.45 + (1 - sk) * 0.35)) + 'px system-ui,sans-serif';
      ctx.fillText('✦', sx, sy);
    }
    // (4) Tekstas: bounce-in scale + kyla + fade tail
    const ease = k < 0.18 ? (k / 0.18) : 1;
    const fade = k > 0.72 ? Math.max(0, 1 - (k - 0.72) / 0.28) : 1;
    const floatY = Math.min(k, 0.6) * sz * 2.4;
    const ty = cy - sz * 1.8 - floatY;
    const scale = (0.55 + ease * 0.55) * (1 + (k < 0.18 ? (0.18 - k) * 0.6 : 0));
    ctx.globalAlpha = Math.min(1, fade * 1.4);
    ctx.translate(cx, ty); ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.font = 'bold ' + Math.round(sz * 0.95) + 'px system-ui,sans-serif';
    ctx.lineWidth = Math.max(3, sz * 0.22); ctx.strokeStyle = '#0a2208';
    ctx.strokeText('⬆ LEVEL UP', 0, 0);
    ctx.fillStyle = '#9cff7a'; ctx.fillText('⬆ LEVEL UP', 0, 0);
    ctx.font = 'bold ' + Math.round(sz * 1.25) + 'px system-ui,sans-serif';
    ctx.lineWidth = Math.max(3, sz * 0.26);
    ctx.strokeText('Lv ' + (a._liveLevel || ''), 0, sz * 1.15);
    ctx.fillStyle = '#eaffd6'; ctx.fillText('Lv ' + (a._liveLevel || ''), 0, sz * 1.15);
    ctx.restore();
  }
  // SUBTILUS XP-gain vizualas — žali „+N XP" kyla ir nublanksta (~850ms). Mažesnis/silpnesnis nei LEVEL UP.
  const _F12_XPPOP_DUR = 850;
  function _f12DrawXpGainFx(cx, cy, sz, a, t) {
    const pops = a._xpPops;
    if (!pops || !pops.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      const k = (t - p.at) / _F12_XPPOP_DUR;
      if (k < 0) continue;
      if (k >= 1) { pops.splice(i, 1); continue; }
      const ease = k < 0.16 ? (k / 0.16) : 1;                       // greitas pop-in
      const fade = k > 0.5 ? Math.max(0, 1 - (k - 0.5) / 0.5) : 1;  // nublanksta antroj pusėj
      const rise = (0.35 + k * 1.0) * sz;                           // kyla aukštyn
      const jit = (((p.at % 9) - 4) * 0.06) * sz;                   // mažas X poslinkis (stacked nesutampa)
      const y = cy - sz * 1.05 - rise;
      const scale = (0.45 + ease * 0.35) * (1 + (k < 0.16 ? (0.16 - k) * 0.8 : 0));  // bounce-in, mažesnis nei lvl up
      ctx.globalAlpha = fade;
      ctx.font = 'bold ' + Math.round(sz * 0.62 * scale) + 'px system-ui,sans-serif';
      ctx.lineWidth = Math.max(2, sz * 0.11);
      ctx.strokeStyle = 'rgba(6,34,10,0.92)';
      const txt = '+' + p.amt + ' XP';
      ctx.strokeText(txt, cx + jit, y);
      ctx.fillStyle = '#7dff8c';
      ctx.fillText(txt, cx + jit, y);
    }
    ctx.restore();
  }

  // Battle settled — kad du kart neišsiųstume submit-battle-result

  let _f12BattleSettled = false;

  // ── HOME barracks trained units count — F12 deploys reikalauja real trained unit'ų ──

  // (Profile.barracksTrained = NFT-trained iš F10 + session free pool iš pre-deck modal.)

  function _getTrainedCount(utype) {

    // GRIEŽTAS ATSKYRIMAS (turi sutapti su _takeTrainedUnit, kitaip canDeploy nesutampa su take):

    // NFT mūšis → TIK NFT pool; Free mūšis → free pool + F10 home-trained.

    if (_f12IsNftBattle) {

      let n = 0;

      for (const nft of _f12SessionNftPool) {

        if (nft && nft.utype === utype) n++;

      }

      return n;

    }

    let n = 0;

    try {

      const arr = (typeof Profile === 'object' && Profile && Array.isArray(Profile.barracksTrained))

        ? Profile.barracksTrained : null;

      if (arr) {

        for (const s of arr) {

          if (s && s.utype === utype) n += (s.stack || 1);

        }

      }

    } catch (_) {}

    n += (_f12SessionFreePool[utype] | 0);

    return n;

  }

  // Mirties metu — atimam 1 trained unit iš HOME barakų (mirė kovoj, prarastas)

  function _consumeTrainedUnit(utype) {

    try {

      if (typeof Profile !== 'object' || !Profile || !Array.isArray(Profile.barracksTrained)) return;

      for (let i = 0; i < Profile.barracksTrained.length; i++) {

        const s = Profile.barracksTrained[i];

        if (s && s.utype === utype) {

          if ((s.stack || 1) > 1) s.stack--;

          else Profile.barracksTrained.splice(i, 1);

          if (typeof saveProfile === 'function') saveProfile();

          return;

        }

      }

    } catch (_) {}

  }

  // Deploy metu — paimam 1 unit (su jo HP) ir grąžinam snap.

  // GRIEŽTAS ATSKYRIMAS: NFT mūšis → TIK NFT pool; Free mūšis → TIK free pool + F10 home-trained.

  // Jokio maišymo nei viename kelyje.

  function _takeTrainedUnit(utype, preferredTokenId) {

    // ── NFT MŪŠIS — tik pasirinkti NFT (su tokenId, burn flow). Išsekus → null (nebegali deploy). ──

    if (_f12IsNftBattle) {

      // Picker'is gali nurodyti KONKRETŲ tokenId; kitaip imam pirmą tinkamą.

      let idx = -1;

      if (preferredTokenId != null) {

        for (let i = 0; i < _f12SessionNftPool.length; i++) {

          const nft = _f12SessionNftPool[i];

          if (nft && nft.utype === utype && String(nft.tokenId) === String(preferredTokenId)) { idx = i; break; }

        }

      }

      if (idx < 0) {

        for (let i = 0; i < _f12SessionNftPool.length; i++) {

          const nft = _f12SessionNftPool[i];

          if (nft && nft.utype === utype) { idx = i; break; }

        }

      }

      if (idx < 0) return null;

      const nft = _f12SessionNftPool.splice(idx, 1)[0];

      return {

        id: null,

        utype: nft.utype,

        hp: nft.hp != null ? nft.hp : null,

        maxHp: nft.maxHp != null ? nft.maxHp : null,

        nft: true,

        tokenId: nft.tokenId,

        xp: nft.xp,

        level: nft.level,

        contractUtype: nft.contractUtype,

      };

    }

    // ── FREE MŪŠIS — session free pool (pre-deck), tada F10 home-trained. Jokių NFT. ──

    if ((_f12SessionFreePool[utype] | 0) > 0) {

      _f12SessionFreePool[utype]--;

      if (_f12SessionFreePool[utype] <= 0) delete _f12SessionFreePool[utype];

      return { id: null, utype: utype, hp: null, maxHp: null, free: true };

    }

    try {

      if (typeof Profile !== 'object' || !Profile || !Array.isArray(Profile.barracksTrained)) return null;

      for (let i = 0; i < Profile.barracksTrained.length; i++) {

        const s = Profile.barracksTrained[i];

        if (s && s.utype === utype) {

          const taken = { id: s.id, utype: s.utype, hp: s.hp, maxHp: s.maxHp };

          if ((s.stack || 1) > 1) s.stack--;

          else Profile.barracksTrained.splice(i, 1);

          if (typeof saveProfile === 'function') saveProfile();

          return taken;

        }

      }

    } catch (_) {}

    return null;

  }

  // Recall metu — grąžinam unit'ą atgal į HOME su pažeisto HP išsaugotu

  // Free pool unitai (snap.free=true) NEgrąžinami į Profile — jie consumable per session.

  function _returnTrainedUnit(snap) {

    try {

      if (!snap) return;

      if (snap.free) {

        // Free pool unit — grąžinam atgal į session pool, kad galetum redeploy

        _f12SessionFreePool[snap.utype] = (_f12SessionFreePool[snap.utype] | 0) + 1;

        return;

      }

      if (snap.nft) {

        // NFT — grąžinam į session NFT pool su atnaujintu HP (kad redeploy išlaikytų žalą)

        _f12SessionNftPool.push({

          tokenId: snap.tokenId,

          utype: snap.utype,

          xp: snap.xp,

          level: snap.level,

          contractUtype: snap.contractUtype,

          hp: snap.hp,

          maxHp: snap.maxHp,

        });

        return;

      }

      if (typeof Profile !== 'object' || !Profile) return;

      if (!Array.isArray(Profile.barracksTrained)) Profile.barracksTrained = [];

      Profile.barracksTrained.push({ id: snap.id, utype: snap.utype, stack: 1, hp: snap.hp, maxHp: snap.maxHp });

      if (typeof saveProfile === 'function') saveProfile();

    } catch (_) {}

  }

  // Unit icon image registry — naudojamas ant deploy kortelių

  const _UNIT_ICON_IMGS = {};

  function _loadUnitIcon(name) {

    if (_UNIT_ICON_IMGS[name]) return _UNIT_ICON_IMGS[name];

    const im = new Image(); im.src = 'assets_tiny/' + name + '.png';

    _UNIT_ICON_IMGS[name] = im;

    return im;

  }

  // Pre-load all unit icons

  _loadUnitIcon('Archer_Idle');

  _loadUnitIcon('HarpoonFish_Idle');

  _loadUnitIcon('Skull_Idle');

  _loadUnitIcon('Stabby_Idle');           // shaman fallback

  _loadUnitIcon('Buildings_Tower');

  _loadUnitIcon('Buildings_Zip');

  // Unit type → {imgKey, isAnimated, frameW, frameH, frames, fps}

  const _UNIT_ICON_META = {

    archer:         { img: 'Archer_Idle',      animated: true,  fw: 192, fh: 192, frames: 6, fps: 8 },

    harpoon_fish:   { img: 'HarpoonFish_Idle', animated: true,  fw: 192, fh: 192, frames: 8, fps: 8 },

    skull:          { img: 'Skull_Idle',       animated: true,  fw: 192, fh: 192, frames: 8, fps: 8 },

    shaman:         { img: 'Stabby_Idle',      animated: true,  fw: 192, fh: 192, frames: 8, fps: 8 },

    tower:          { img: 'Buildings_Tower',  animated: false, fw: 128, fh: 256 },

    crossbow_tower: { img: 'Buildings_Tower',  animated: false, fw: 128, fh: 256, badge: 'XB' },

    zip:            { img: 'Buildings_Zip',    animated: true,  fw: 400, fh: 498, frames: 8, fps: 6 },

  };

  // Centruoja ir piešia unit ikoną į (cx, cy) area su max size

  function _drawUnitIcon(utype, cx, cy, maxW, maxH, t) {

    // SPECIAL: hog_rider naudoja pigronke idle sheet'ą (640px frames root'e, ne assets_tiny)

    if (utype === 'hog_rider') {

      const sheets = _initHogRiderSheets();

      const st = sheets && sheets.idle;

      if (st && st.sheet && st.sheet.complete && st.sheet.naturalWidth) {

        const fc = st.frameCount;

        const fw = Math.floor(st.sheet.naturalWidth / fc);

        const fh = st.sheet.naturalHeight;

        const idx = Math.floor(t / (1000 / _HOG_FPS.idle)) % fc;

        const scale = Math.min(maxW / fw, maxH / fh);

        const dw = Math.round(fw * scale), dh = Math.round(fh * scale);

        ctx.imageSmoothingEnabled = false;

        ctx.drawImage(st.sheet, idx * fw, 0, fw, fh, Math.round(cx - dw / 2), Math.round(cy - dh / 2), dw, dh);

      }

      return;

    }

    // SPECIAL: shaman naudoja shamanAnimFrames iš game.js (frame per failas)

    if (utype === 'shaman') {

      let frames = null;

      try { frames = shamanAnimFrames; } catch (_) {}

      const dirFrames = frames && frames.idle && frames.idle.east;

      if (dirFrames && dirFrames.length) {

        const fcount = dirFrames.length;

        const idx = Math.floor(t / (1000 / 6)) % fcount;     // 6fps idle

        const img = dirFrames[idx];

        if (img && img.complete && img.naturalWidth) {

          const sw = img.naturalWidth, sh = img.naturalHeight;

          const scale = Math.min(maxW / sw, maxH / sh);

          const dw = Math.round(sw * scale), dh = Math.round(sh * scale);

          ctx.imageSmoothingEnabled = false;

          ctx.drawImage(img, Math.round(cx - dw / 2), Math.round(cy - dh / 2), dw, dh);

          return;

        }

      }

      return;

    }

    const meta = _UNIT_ICON_META[utype];

    if (!meta) return;

    const img = _UNIT_ICON_IMGS[meta.img];

    if (!img || !img.complete || !img.naturalWidth) return;

    let sx = 0, sy = 0, sw = meta.fw, sh = meta.fh;

    if (meta.animated) {

      const idx = Math.floor(t / (1000 / meta.fps)) % meta.frames;

      sx = idx * meta.fw;

    }

    // Scale to fit, preserve aspect

    const scale = Math.min(maxW / sw, maxH / sh);

    const dw = Math.round(sw * scale), dh = Math.round(sh * scale);

    const dx = Math.round(cx - dw / 2), dy = Math.round(cy - dh / 2);

    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);

    // XB badge ant crossbow_tower

    if (meta.badge) {

      ctx.fillStyle = 'rgba(0,0,0,0.85)';

      ctx.fillRect(dx + dw / 2 - 9, dy + dh - 16, 18, 11);

      ctx.fillStyle = '#d8f0ff';

      ctx.font = 'bold 7px "Press Start 2P", monospace';

      ctx.textAlign = 'center';

      ctx.fillText(meta.badge, dx + dw / 2, dy + dh - 8);

    }

  }

  // Picker'iui — renderina unito idle animaciją į NURODYTĄ canvas context (ne game ctx).

  // Centruoja sprite'ą (w×h). Palaiko sheet-based (archer/skull/harpoon), shaman (frame-per-file), hog.

  function _drawPickerUnit(C, utype, w, h, t) {

    try {

      C.imageSmoothingEnabled = false;

      // Scale boost — sprite'ai šiek tiek didesni. hog_rider frame didelis su ietimi krašte →

      // boost 1.0 (pilnai telpa, kad ieties galiukas neišeitų už kadro); dydis gaunamas iš didesnio lauko.

      const boost = (utype === 'hog_rider') ? 1.0 : 1.25;

      if (utype === 'shaman') {

        let frames = null; try { frames = shamanAnimFrames; } catch (_) {}

        const df = frames && frames.idle && frames.idle.east;

        if (df && df.length) {

          const img = df[Math.floor(t / (1000 / 6)) % df.length];

          if (img && img.complete && img.naturalWidth) {

            const sc = Math.min(w / img.naturalWidth, h / img.naturalHeight) * boost;

            const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;

            C.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);

          }

        }

        return;

      }

      if (utype === 'hog_rider') {

        const sheets = _initHogRiderSheets(); const st = sheets && sheets.idle;

        if (st && st.sheet && st.sheet.complete && st.sheet.naturalWidth) {

          const fc = st.frameCount, fw = Math.floor(st.sheet.naturalWidth / fc), fh = st.sheet.naturalHeight;

          const idx = Math.floor(t / (1000 / _HOG_FPS.idle)) % fc;

          const sc = Math.min(w / fw, h / fh) * boost;

          const dw = fw * sc + 5, dh = fh * sc + 5;   // +5px didesnis

          C.drawImage(st.sheet, idx * fw, 0, fw, fh, (w - dw) / 2, (h - dh) / 2 + 15, dw, dh);   // +15px žemyn

        }

        return;

      }

      const meta = _UNIT_ICON_META[utype]; if (!meta) return;

      const img = _UNIT_ICON_IMGS[meta.img]; if (!img || !img.complete || !img.naturalWidth) return;

      let sx = 0; const sw = meta.fw, sh = meta.fh;

      if (meta.animated) sx = (Math.floor(t / (1000 / meta.fps)) % meta.frames) * meta.fw;

      const sc = Math.min(w / sw, h / sh) * boost; const dw = sw * sc, dh = sh * sc;

      C.drawImage(img, sx, 0, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh);

    } catch (_) {}

  }

  let _pickerAnimId = 0;

  let deployBtnRects = [];

  // Physics

  let blocks = [];

  let nextId = 1;

  let launcher = { x: 0, y: 0, angle: 0 };

  let nextBlock = null;

  let nextNextBlock = null;             // antras eilėje — rodomas ant RONKE lazdos burbulo

  let _f12HoldBall = null;              // HOLD slotas — {type,value} arba null (swap mechanika: stash dabar / panaudok vėliau)

  let _f12HoldRect = null;             // tappable hitbox (nustatomas render metu)

  let _f12HoldLockedUntilFire = false; // po STASH veiksmo užrakinta — reikia IŠŠAUTI prieš darant kitą STASH veiksmą (vienkryptė mechanika)

  let _f12HoldFlashAt = 0;             // swap blyksnio animacijos timestamp

  let lastFireAt = 0;

  let _currentReloadMs = FIRE_COOLDOWN_MIN;  // dabartinio reload trukmė (random per šūvį)

  let _f12ReloadEndPlayed = true;       // ar jau sugrojom reveal garsiuką po reload

  let _f12ReadyFlashAt = 0;             // timestamp kai paskutinis reload baigėsi (ready-burst)

  let charging = false;

  let chargeStartedAt = 0;

  // Generic

  let score = 0;

  let merges = 0;

  let layoutCache = null;

  let mouse = { x: 0, y: 0 };

  let exitBtnRect = null;

  let restartBtnRect = null;

  let speedBtnRect = null;

  let gameOverHomeBtnRect = null;       // „GO HOME" mygtukas ant game over screen

  let editMapBtnRect = null;

  let gameOver = false;

  // ── Helpers ────────────────────────────────────────────────────────

  function rand(n) { return Math.floor(Math.random() * n); }

  function pick(arr) { return arr[rand(arr.length)]; }

  // ── GAME CLOCK — visi F12 game-logic timestamp'ai eina per čia. Bėga _f12TimeScale greičiu

  // (×1 arba ×2), kad „×2 speed" mygtukas pagreitintų mob'us/cooldown'us/spawn'us/animacijas.

  // Loop'as advance'ina _f12Clock kiekvienam frame. UI/picker naudoja performance.now() tiesiai.

  let _f12Clock = 0;

  let _f12TimeScale = 1;          // 1 arba 2

  function now() { return _f12Clock; }

  function _realNow() { return performance.now(); }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // NFT holder bonus: F12 score 1.5× (eligibleCount ≥ 1, server-verified 24h hold).

  function _nftScoreBoost(n) {

    if (window.Wallet && window.Wallet.isHolderEligibleCached && window.Wallet.isHolderEligibleCached()) {

      return Math.round(n * 1.5);

    }

    return n;

  }

  // Phase 15 — trophy stat hook for F12 kills (separates F12 from F11 totalKills).

  // Walls don't count. Boss kills tracked separately for "Boss Slayer" tier req.

  function _trackF12Kill(target) {

    try {

      if (!window.Profile) return;

      if (target && target._isWall) return;

      const P = window.Profile;

      if (!P.stats) P.stats = {};

      P.stats.f12EnemyKills = (P.stats.f12EnemyKills || 0) + 1;

      if (target && target.isBoss) {

        P.stats.f12BossKills = (P.stats.f12BossKills || 0) + 1;

      }

      // Throttled save — game.js debounces, but be safe with frequent kills

      if (typeof window.saveProfile === 'function') window.saveProfile();

    } catch (_) {}

  }

  // Phase 15 — track peak ball value ever achieved (for "Tier God" / "Tier Master" reqs).

  function _trackF12BallValue(value) {

    try {

      if (!window.Profile || !value) return;

      const P = window.Profile;

      if (!P.stats) P.stats = {};

      if (value > (P.stats.f12MaxBallValue || 0)) {

        P.stats.f12MaxBallValue = value;

        if (typeof window.saveProfile === 'function') window.saveProfile();

      }

    } catch (_) {}

  }

  // Phase 15 — track peak chain combo ever achieved.

  function _trackF12Combo(level) {

    try {

      if (!window.Profile || !level) return;

      const P = window.Profile;

      if (!P.stats) P.stats = {};

      if (level > (P.stats.f12MaxComboEver || 0)) {

        P.stats.f12MaxComboEver = level;

        if (typeof window.saveProfile === 'function') window.saveProfile();

      }

    } catch (_) {}

  }

  function radiusForValue(v) {

    const tier = Math.log2(v);

    return BASE_R * (1 + (tier - 1) * 0.18);

  }

  function makeBlock(type, value, x, y, vx, vy, vz) {

    const r = radiusForValue(value);

    return {

      id: nextId++,

      type, value, x, y, vx: vx || 0, vy: vy || 0,

      z: 0,

      vz: vz || 0,

      airborne: (vz || 0) > 0,

      r,

      mass: r * r * 0.001,

      spawnedAt: now(),

      mergeBoom: null,

      landImpact: null,

      glow: 0,

      _mergedThisStep: false,

      // 3D rotation state — kubas turi visas 3 ašis, gali tumble laisvai

      rotX: 0, rotY: Math.random() * Math.PI * 2, rotZ: 0,

      angVelX: 0, angVelY: 0, angVelZ: 0,

      // Unikalus rest offset — kiekvienas dice nusistos savo mažu Y kampu (variacijai)

      restJitter: (Math.random() - 0.5) * REST_JITTER_RANGE,

    };

  }

  function makeNextBlock() {

    // Visada mažiausias kamuoliukas (value=2) — be premerge'intų variantų

    return { type: pick(TYPES), value: 2 };

  }

  function initState() {

    blocks = [];

    score = 0;

    merges = 0;

    _f12FireBonusSlots = 0;

    _f12BallsPrevCount = 0;

    _f12BallsDropAt = 0;

    _f12BallsDropAmount = 0;

    _f12ScorePrevValue = 0;

    _f12ScoreUpAt = 0;

    _f12ScoreUpAmount = 0;

    _f12ScorePopups = [];

    nextBlock = makeNextBlock();

    nextNextBlock = makeNextBlock();

    _f12HoldBall = null;                   // HOLD slotas — tuščias starte

    _f12HoldFlashAt = 0;

    _f12ReadyFlashAt = now();              // pirmas shine sweep'as iškart pradžioj

    lanes = [];

    for (let i = 0; i < LANES; i++) lanes.push({ enemies: [], allies: [] });

    baseHp = BASE_HP;

    nextEnemyAt = now() + 12000;   // 12s onboarding: žaidėjas spėja išmokti merge prieš pirmus priešus

    gameOver = false;

    selectedDeployType = null;

    deployPool = {};

    _f12UnitDeployCD = {};

    _f12Harpoons = [];

    _f12ShamanProj = [];

    _f12ShamanExpl = [];

    _f12Arrows = [];

    _f12ArrowImpacts = [];

    _f12ZipBolts = [];

    _f12Spirits = [];

    _f12CardDeck = {};

    _f12SessionFreePool = {};

    _f12SessionNftPool = [];

    _f12NftMetaMap = {};   // fresh battle — meta žemėlapis iš naujo

    // NFT mūšį atpažįstam ANKSTI (prieš pre-deck bloką), kad neįsimaišytų free kortos.

    _f12IsNftBattle = Array.isArray(window._f12NftPickedPool) && window._f12NftPickedPool.length > 0;

    _f12DeadNftTokenIds = [];

    _f12NftStats = {};

    _f12BattleSettled = false;

    // Pre-deck choice — žaidėjo pasirinkimas iš pre-game modal'o (TIK free mūšyje).

    // Įmanomi šaltiniai: window._f12PreDeckChoice (set'inamas iš f12_predeck_modal.js)

    // Pildom abu: _f12CardDeck (kortos atrakintos) + _f12SessionFreePool (deploy quota).

    try {

      const choice = window._f12PreDeckChoice;

      if (!_f12IsNftBattle && choice && typeof choice === 'object') {

        const t0 = now();

        for (const bt in choice) {

          const c = (choice[bt] | 0);

          if (c > 0) {

            _f12CardDeck[bt] = { count: c, lastIncAt: t0 };

            const ut = _UNIT_FOR_BALL_TYPE[bt];

            if (ut) {

              _f12SessionFreePool[ut] = (_f12SessionFreePool[ut] | 0) + c;

              // Matomas deploy panel count

              deployPool[ut] = (deployPool[ut] || 0) + c;

            }

          }

        }

      }

    } catch (_) {}

    // NFT picked pool (iš NFT Barracks DEPLOY tab'o) — populate NFT pool + atrakinam atitinkamas kortas

    try {

      const nftPool = window._f12NftPickedPool;

      if (Array.isArray(nftPool) && nftPool.length > 0) {

        _f12IsNftBattle = true;   // NFT mūšis — jokio F10 home-trained maišymo

        const t0 = now();

        // 4× MAX per tipą: jei atsineši daugiau, į mūšį patenka 4 AUKŠČIAUSIO lygio (stipriausi).

        const _NFT_MAX_PER_TYPE = 4;

        const _typeCount = {};

        const _sortedPool = nftPool.slice().sort(function (a, b) { return ((b && b.level) | 0) - ((a && a.level) | 0); });

        for (const nft of _sortedPool) {

          if (!nft || !nft.utype) continue;

          if ((_typeCount[nft.utype] || 0) >= _NFT_MAX_PER_TYPE) continue;   // virš 4 to tipo — praleidžiam

          _typeCount[nft.utype] = (_typeCount[nft.utype] || 0) + 1;

          _f12SessionNftPool.push({

            tokenId: nft.tokenId,

            utype: nft.utype,

            xp: nft.xp || 0,

            level: nft.level || 0,

            contractUtype: nft.contractUtype,

            hp: null,    // first deploy = full HP iš ALLY_STATS

            maxHp: null,

          });

          // Persistinis meta — settle ekranui (nesplice'inamas)
          _f12NftMetaMap[String(nft.tokenId)] = {
            tokenId: nft.tokenId, utype: nft.utype, xp: nft.xp || 0,
            level: nft.level || 0, contractUtype: nft.contractUtype,
          };

          // Atrakinam korelos atitinkamai ball type'ą

          let bt = null;

          for (const k in _UNIT_FOR_BALL_TYPE) {

            if (_UNIT_FOR_BALL_TYPE[k] === nft.utype) { bt = k; break; }

          }

          if (bt) {

            if (!_f12CardDeck[bt]) _f12CardDeck[bt] = { count: 0, lastIncAt: t0 };

            _f12CardDeck[bt].count++;

          }

          // Matomas deploy panel count — kiekvienas NFT = +1

          deployPool[nft.utype] = (deployPool[nft.utype] || 0) + 1;

        }

        // Consume — po init'o nereik daugiau read'inti

        window._f12NftPickedPool = null;

      }

    } catch (_) {}

    _f12CardConsumes = [];

    _f12HpHealFx = null;

    _pendingCardDeploy = null;

    _draggedCard = null;

    _f12MergePopups = [];

    _f12PerfectPopups = [];

    _f12PerfectChain = 0;

    _f12PerfectChainAt = 0;

    _f12OverflowSettleAt = 0;

    _f12GameOverHandled = false;

    // Wind reset — visada calm start + intro sequence reset

    if (typeof _f12WindState !== 'undefined' && _f12WindState) {

      _f12WindState.vx = 0; _f12WindState.vy = 0;

      _f12WindState.targetVx = 0; _f12WindState.targetVy = 0;

      _f12WindState.transFromVx = 0; _f12WindState.transFromVy = 0;

      _f12WindState.transStartAt = now();

      _f12WindState.nextChangeAt = now() + 35000;

    }

    _f12WindIntroStep = 0;

    _f12MergeRings = [];

    _f12ScreenShake = 0;

    _f12LastMergeAt = 0;

    _f12ComboCount = 0;

    _f12ComboFlashAt = 0;

    _f12FireRecoil = 0;

    _f12MuzzleFlashes = [];

    _f12FireSmoke = [];

    _f12WallChips = [];

    _f12Wind = [];

    _f12WindStreaks = [];

    _f12WindDebris = [];

    _f12LastDebrisAt = 0;

    _f12WindVortexes = [];

    _f12LastVortexAt = 0;

    _f12Fog = [];

    _f12NextBossAt = now() + 120000;    // pirmas boss ~120s (po pilno onboarding'o)

    _f12NextHordeAt = now() + 60000;    // pirma horde po 60s (po pirmų enemy + wind intro)

    _f12Warnings = [];

    _f12GameStartT = now();

    _f12SpawnedCount = 0;

    _f12LaneStrikes = [];

    _f12HogStrikes = [];

    _f12PendingAttacks = [];

    _f12DmgPopups = [];

    _f12PoisonImpacts = [];

    _f12WallConvert = [];

    _f12Asteroids = [];

    _f12Traps = [];

    _f12FrostReverse = [];

    _f12ZoneFlash = [0, 0, 0, 0];

    // Užkraunam HOME treniruotus unit'us — pridedam stack count, ne 1 per snap.

    // SVARBU: TIK free (ne-NFT) mūšyje. NFT mūšyje žaidžiama TIK su pasirinktais NFT —

    // jokio maišymo su nemokamais F10 unitais (žaidėjo noras: 8 NFT = 8 unitai žaidime).

    try {

      if (!_f12IsNftBattle) {

        if (Array.isArray(_f11TransferUnits) && _f11TransferUnits.length > 0) {

          for (const s of _f11TransferUnits) {

            if (s && PLAYABLE_TYPES.indexOf(s.utype) !== -1) {

              deployPool[s.utype] = (deployPool[s.utype] || 0) + (s.stack || 1);

            }

          }

        } else if (Profile && Array.isArray(Profile.barracksTrained)) {

          for (const s of Profile.barracksTrained) {

            if (s && PLAYABLE_TYPES.indexOf(s.utype) !== -1) {

              deployPool[s.utype] = (deployPool[s.utype] || 0) + (s.stack || 1);

            }

          }

        }

      }

    } catch (_) {}

    // Restart išvalo smėlio žymes

    if (_marksCtx && _marksCanvas) {

      _marksCtx.clearRect(0, 0, _marksCanvas.width, _marksCanvas.height);

    }

  }

  // RESTART — resetina TIK lentą (balls/enemies/score), o NFT battle sesiją PALIEKAM:

  //  • deck + NFT/free pool → NEREIKIA vėl merge'inti hog (NFT pool sunaudojamas per initState)

  //  • stats + dead + settled flag → XP NEDINGSTA (settlinasi per tikrą game over)

  // (Sprendžia 2 senus restart bug'us: re-merge ir XP loss.)

  // initState reassign'ina šiuos kintamuosius į naujus objektus — užfiksuojam SENAS nuorodas ir atstatom.

  function _f12RestartGame() {

    // Jei battle JAU settlinta (game-over restart) — NFT sesija baigta (auth consumed),

    // pradedam ŠVARIĄ (pilnas reset). Kitaip mid-game restart → sesija TĘSIASI.

    if (_f12BattleSettled) { initState(); return; }

    const _keep = {

      deck: _f12CardDeck, nftPool: _f12SessionNftPool, freePool: _f12SessionFreePool,

      deploy: deployPool, nftStats: _f12NftStats, deadNft: _f12DeadNftTokenIds,

      isNft: _f12IsNftBattle,

    };

    initState();

    _f12CardDeck = _keep.deck;

    _f12SessionNftPool = _keep.nftPool;

    _f12SessionFreePool = _keep.freePool;

    deployPool = _keep.deploy;

    _f12NftStats = _keep.nftStats;

    _f12DeadNftTokenIds = _keep.deadNft;

    _f12IsNftBattle = _keep.isNft;   // NFT vėliava išlieka per restart (kad nesimaišytų free)

    _f12BattleSettled = false;   // mid-game restart — sesija tęsiasi, settlinsis per tikrą game over

  }

  // ── Layout ─────────────────────────────────────────────────────────

  function computeLayout() {

    const W = canvas.width, H = canvas.height;

    const lanesY = 14;

    const lanesH = Math.floor(H * 0.40);

    const arenaY = lanesY + lanesH + 12;

    const arenaH = H - arenaY - 56;

    const padX = 48;     // praplata — vietos vertikaliam HP bar'ui kairėj

    const padR = 24;

    const aw = W - padX - padR;

    return {

      W, H,

      lanesX: padX, lanesY, lanesW: aw, lanesH,

      laneH: Math.floor((lanesH - 6) / LANES),

      arena: { x: padX, y: arenaY, w: aw, h: arenaH },

      launcher: { x: padX + 125, y: arenaY + arenaH / 2 },  // +65px į dešinę, vertikaliai centruota

    };

  }

  // Arenos ribos duotam W,H (atspindi computeLayout aritmetiką). Naudojama resize() metu,

  // kad perskaičiuotume kamuoliukų pozicijas iš senos arenos į naują (zoom/resize fix).

  function _arenaBoundsFor(W, H) {

    const lanesY = 14;

    const lanesH = Math.floor(H * 0.40);

    const arenaY = lanesY + lanesH + 12;

    const arenaH = H - arenaY - 56;

    const padX = 48, padR = 24;

    return { x: padX, y: arenaY, w: W - padX - padR, h: arenaH };

  }

  // ── Pixel art sphere render — diskretūs shading bands, hard edges

  // 5-banding sistema pagal Lambertian diffuse iš sferinio normal'o.

  // PX = 2 px chunk size (chunky pixel art). Cache'avimas per type+size derinį.

  const PIXEL_SIZE = 2;

  const _spriteCache = new Map();

  function _getPixelSphereSprite(type, r) {

    // Cache key — type + integer radius (groups similar sizes)

    const ri = Math.max(4, Math.round(r));

    const key = type + ':' + ri;

    if (_spriteCache.has(key)) return _spriteCache.get(key);

    const col = TYPE_COLOR[type] || TYPE_COLOR.arrow;

    // 5 spalvų lygiai (nuo tamsiausio iki šviesiausio)

    const bands = [

      [Math.max(0, col.left[0] - 30), Math.max(0, col.left[1] - 30), Math.max(0, col.left[2] - 30)],  // 0: edge dark

      col.left,    // 1: shadow side

      col.front,   // 2: front

      col.top,     // 3: top

      [Math.min(255, col.top[0] + 50), Math.min(255, col.top[1] + 50), Math.min(255, col.top[2] + 50)], // 4: highlight

    ];

    // Light direction (normalized, pointing INTO surface from upper-left out of screen)

    const lx = -0.45, ly = -0.55, lz = 0.70;

    const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);

    const Lx = lx / ll, Ly = ly / ll, Lz = lz / ll;

    const sz = (ri + 1) * 2;  // sprite size (extra pixel padding)

    const off = document.createElement('canvas');

    off.width = sz;

    off.height = sz;

    const octx = off.getContext('2d');

    const cc = sz / 2;

    const PX = PIXEL_SIZE;

    for (let dy = -ri; dy <= ri; dy += PX) {

      for (let dx = -ri; dx <= ri; dx += PX) {

        const distSq = dx * dx + dy * dy;

        if (distSq > ri * ri) continue;

        // Surface normal at this pixel (sphere)

        const nx = dx / ri;

        const ny = dy / ri;

        const nz2 = 1 - nx * nx - ny * ny;

        const nz = nz2 > 0 ? Math.sqrt(nz2) : 0;

        // Diffuse intensity (Lambertian)

        const intensity = Math.max(0, nx * Lx + ny * Ly + nz * Lz);

        // Edge darkening — ties pakraščiu (kai dist arti r) sumažina lygį

        const edgeFactor = 1 - distSq / (ri * ri);  // 1 centre, 0 at edge

        const adjIntensity = intensity * (0.5 + 0.5 * edgeFactor);

        // Diskretizuojam į 5 bands

        let band;

        if (adjIntensity > 0.85) band = 4;

        else if (adjIntensity > 0.55) band = 3;

        else if (adjIntensity > 0.04) band = 2;

        else if (adjIntensity > 0.10) band = 1;

        else band = 0;

        const [bR, bG, bB] = bands[band];

        octx.fillStyle = `rgb(${bR},${bG},${bB})`;

        octx.fillRect(cc + dx, cc + dy, PX, PX);

      }

    }

    // Marker pašalintas iš sprite'o — piešiamas dynamiškai drawSphere

    // Specular highlight — viršutiniam-kairiajam quadrant'e

    const hxC = cc + Math.round(-ri * 0.42 / PX) * PX;

    const hyC = cc + Math.round(-ri * 0.45 / PX) * PX;

    octx.fillStyle = 'rgb(255,255,255)';

    octx.fillRect(hxC, hyC, PX, PX);

    octx.fillRect(hxC + PX, hyC, PX, PX);

    octx.fillRect(hxC, hyC + PX, PX, PX);

    // Outer dark outline (1 pixel) — for crisp pixel art look

    octx.strokeStyle = 'rgba(20,8,2,0.85)';

    octx.lineWidth = 1;

    octx.beginPath();

    octx.arc(cc, cc, ri, 0, Math.PI * 2);

    octx.stroke();

    const sprite = { canvas: off, size: sz, ri };

    _spriteCache.set(key, sprite);

    return sprite;

  }

  function drawSphere(ctx, cx, cy, r, motionAng, rolled, type, value, glow) {

    const sprite = _getPixelSphereSprite(type, r);

    const half = sprite.size / 2;

    ctx.imageSmoothingEnabled = false;

    // Sphere body — niekada nesisuka (lighting nuosekliai iš upper-left)

    ctx.drawImage(sprite.canvas, Math.round(cx - half), Math.round(cy - half));

    // ── DU dinaminiai marker'iai priešingoj pusėj — stipresnis ridenimosi efektas

    // Marker 1 phase = rolled/r, Marker 2 phase = rolled/r + π (priešingam taške)

    // Visible kai cos(phase) > 0. Vienas matomas viršuje, antras po sphere ir atvirkščiai.

    const basePhase = (rolled || 0) / Math.max(1, r);

    const mAng = motionAng || 0;

    const cosA = Math.cos(mAng), sinA = Math.sin(mAng);

    const col = TYPE_COLOR[type] || TYPE_COLOR.arrow;

    const mr = Math.max(0, col.left[0] - 50);

    const mg = Math.max(0, col.left[1] - 50);

    const mb = Math.max(0, col.left[2] - 50);

    const PX = PIXEL_SIZE;

    function _drawMarker(phaseOffset) {

      const phase = basePhase + phaseOffset;

      const cosP = Math.cos(phase);

      if (cosP <= 0) return;

      const sinP = Math.sin(phase);

      const offsetMag = sinP * r * 0.55;

      const mx = cx + cosA * offsetMag;

      const my = cy + sinA * offsetMag;

      const ms = Math.max(2, Math.round(r * 0.18 * (0.6 + 0.4 * cosP)));

      const sx = Math.round(mx / PX) * PX;

      const sy = Math.round(my / PX) * PX;

      ctx.save();

      ctx.globalAlpha = Math.max(0.25, cosP);

      ctx.fillStyle = `rgb(${mr},${mg},${mb})`;

      for (let dy = -ms; dy <= ms; dy += PX) {

        for (let dx = -ms; dx <= ms; dx += PX) {

          if (dx * dx + dy * dy > ms * ms) continue;

          ctx.fillRect(sx + dx, sy + dy, PX, PX);

        }

      }

      ctx.restore();

    }

    _drawMarker(0);          // primary marker

    _drawMarker(Math.PI);    // secondary marker (priešingoj pusėj)

    // Glow halo (merge metu)

    if (glow > 0.05) {

      ctx.save();

      ctx.globalAlpha = glow * 0.7;

      ctx.strokeStyle = 'rgba(255,230,140,0.9)';

      ctx.lineWidth = 3 + glow * 4;

      ctx.beginPath();

      ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2);

      ctx.stroke();

      ctx.restore();

    }

  }

  // ── 3D dice render (paliktas backward compat — niekur nenaudojama)

  function drawDie(ctx, cx, cy, halfSize, rotX, rotY, rotZ, type, value, glow, scaleX, scaleY) {

    const r = halfSize;

    const cX = Math.cos(rotX), sX = Math.sin(rotX);

    const cY = Math.cos(rotY), sY = Math.sin(rotY);

    const cZ = Math.cos(rotZ), sZ = Math.sin(rotZ);

    const cam = TOP_TILT;

    const camC = Math.cos(cam), camS = Math.sin(cam);

    // Rotations applied in order: Z → Y → X, then camera tilt around X

    function proj(x, y, z) {

      // Z rotation

      let p1x = x * cZ - y * sZ;

      let p1y = x * sZ + y * cZ;

      let p1z = z;

      // Y rotation

      let p2x = p1x * cY + p1z * sY;

      let p2y = p1y;

      let p2z = -p1x * sY + p1z * cY;

      // X rotation

      let p3x = p2x;

      let p3y = p2y * cX - p2z * sX;

      let p3z = p2y * sX + p2z * cX;

      // Camera tilt (downward look)

      let qx = p3x;

      let qy = p3y * camC - p3z * camS;

      let qz = p3y * camS + p3z * camC;

      return { x: qx * scaleX, y: qy * scaleY, z: qz };

    }

    const raw = [

      [-r, -r, -r], [r, -r, -r], [r, -r, r], [-r, -r, r],

      [-r, r, -r], [r, r, -r], [r, r, r], [-r, r, r],

    ];

    const v = raw.map(([x, y, z]) => proj(x, y, z));

    const col = TYPE_COLOR[type] || TYPE_COLOR.arrow;

    const faces = [

      { idx: [3, 2, 6, 7], col: col.front, name: 'front' },

      { idx: [1, 0, 4, 5], col: col.back, name: 'back' },

      { idx: [2, 1, 5, 6], col: col.right, name: 'right' },

      { idx: [0, 3, 7, 4], col: col.left, name: 'left' },

      { idx: [0, 1, 2, 3], col: col.top, name: 'top' },

      { idx: [7, 6, 5, 4], col: col.bot, name: 'bot' },

    ];

    faces.forEach(f => {

      f.cz = f.idx.reduce((s, i) => s + v[i].z, 0) / 4;

      const [i0, i1, i2] = f.idx;

      f.vis = (v[i1].x - v[i0].x) * (v[i2].y - v[i0].y)

            - (v[i1].y - v[i0].y) * (v[i2].x - v[i0].x) > 0;

    });

    faces.sort((a, b) => a.cz - b.cz);

    ctx.save();

    ctx.translate(cx, cy);

    // Vidinis šešėlis pašalintas — naudojame tik drawBlockShadow ant grindų

    const edgeAlpha = (0.55 + 0.45 * glow).toFixed(2);

    faces.forEach(f => {

      if (!f.vis) return;

      const [fr, fg, fb] = f.col;

      ctx.fillStyle = `rgb(${fr},${fg},${fb})`;

      ctx.strokeStyle = `rgba(20,12,4,${edgeAlpha})`;

      ctx.lineWidth = Math.max(1, r * 0.09);

      ctx.beginPath();

      f.idx.forEach((vi, j) => {

        if (j === 0) ctx.moveTo(v[vi].x, v[vi].y);

        else ctx.lineTo(v[vi].x, v[vi].y);

      });

      ctx.closePath();

      ctx.fill();

      ctx.stroke();

    });

    const topFace = faces.find(f => f.name === 'top' && f.vis);

    if (topFace) {

      const t0 = v[topFace.idx[0]], t1 = v[topFace.idx[1]], t2 = v[topFace.idx[2]], t3 = v[topFace.idx[3]];

      const tcx = (t0.x + t1.x + t2.x + t3.x) / 4;

      const tcy = (t0.y + t1.y + t2.y + t3.y) / 4;

      // Skaičiai pašalinti — kubo tipą rodo tik glyph + spalva

      ctx.save();

      ctx.translate(tcx, tcy);

      const g = r * 0.40;

      ctx.fillStyle = col.glyph;

      ctx.strokeStyle = col.glyph;

      ctx.lineWidth = Math.max(1.5, r * 0.08);

      if (type === 'arrow') {

        ctx.beginPath();

        ctx.moveTo(-g, 0); ctx.lineTo(g, 0);

        ctx.moveTo(g, 0); ctx.lineTo(g - g * 0.5, -g * 0.5);

        ctx.moveTo(g, 0); ctx.lineTo(g - g * 0.5, g * 0.5);

        ctx.stroke();

      } else if (type === 'shield') {

        ctx.beginPath();

        ctx.moveTo(0, -g);

        ctx.lineTo(g * 0.85, -g * 0.4);

        ctx.lineTo(g * 0.6, g * 0.7);

        ctx.lineTo(0, g);

        ctx.lineTo(-g * 0.6, g * 0.7);

        ctx.lineTo(-g * 0.85, -g * 0.4);

        ctx.closePath();

        ctx.fill();

      } else if (type === 'heart') {

        ctx.beginPath();

        ctx.moveTo(0, g * 0.6);

        ctx.bezierCurveTo(g, 0, g * 0.5, -g, 0, -g * 0.2);

        ctx.bezierCurveTo(-g * 0.5, -g, -g, 0, 0, g * 0.6);

        ctx.fill();

      }

      ctx.restore();

    }

    if (glow > 0.05) {

      ctx.globalAlpha = glow * 0.7;

      ctx.strokeStyle = 'rgba(255,230,140,0.9)';

      ctx.lineWidth = 3 + glow * 4;

      ctx.beginPath();

      ctx.ellipse(0, 0, halfSize * 1.25, halfSize * 1.05, 0, 0, Math.PI * 2);

      ctx.stroke();

      ctx.globalAlpha = 1;

    }

    ctx.restore();

  }

  // ── Physics (top-down + z-flight) ──────────────────────────────────

  function tickPhysics(dt) {

    if (gameOver) return;

    const dts = Math.min(dt, 32) / 1000;

    const L = layoutCache;

    if (!L) return;

    const A = L.arena;

    const tNow = now();

    for (const b of blocks) {

      // Z (aukštis)

      if (b.airborne || b.z > 0 || b.vz !== 0) {

        b.vz -= Z_GRAVITY * dts;

        b.z += b.vz * dts;

        if (b.z <= 0) {

          const impactSp = Math.abs(b.vz);

          b.z = 0;

          // PERFECT marker: pirmojo landing'o momentas. Visada (bounce ar ne).

          // Vėliau resolveMerges patikrins ar merge įvyko per 300ms langą.

          if (b._perfectCandidate && !b._justLandedAt) {

            b._justLandedAt = tNow;

          }

          // Landing garsas (throttle'inamas viduje)

          _F12Audio.ballLand(impactSp);

          if (impactSp > Z_BOUNCE_MIN_VZ) {

            b.vz = impactSp * Z_BOUNCE;

            b.vx *= BOUNCE_XY_DAMP;

            b.vy *= BOUNCE_XY_DAMP;

            b.angVelX *= 0.55;

            b.angVelY *= 0.55;

            b.angVelZ *= 0.55;

          } else {

            b.vz = 0;

            b.airborne = false;

            b.vx *= 0.04;

            b.vy *= 0.04;

            b.angVelX *= 0.04;

            b.angVelY *= 0.04;

            b.angVelZ *= 0.04;

          }

          // ── SMĖLIO ŽYMĖ — kai impact stiprus, lieka pilkimasi grindyse

          if (impactSp > 150) {

            const intensity = Math.min(2.5, (impactSp - 100) / 200);

            const localX = b.x - A.x;

            const localY = b.y - A.y;

            if (localX > 0 && localX < A.w && localY > 0 && localY < A.h) {

              _addBounceMark(localX, localY, intensity);

            }

          }

          // ── SPIRIT SPAWN — kai merged kamuoliukas pirma karta paliečia žemę

          if (b._spawnSpiritOnLand) {

            _spawnMergeSpirit(b.x, b.y, b.type, b.value, tNow);

            b._spawnSpiritOnLand = false;

          }

        }

      }

      // ── VĖJO POVEIKIS ─────────────────────────────────────────────

      // TIK ore (z > 0) — kai ball kontaktuoja su grindimis (rieda/stovi), vėjas neturi įtakos.

      if (b.z > 0) {

        const windK = 3.5;                              // pastebimas, subtilus airborne drift

        b.vx += _f12WindState.vx * windK * dts;

        b.vy += _f12WindState.vy * windK * dts;

      }

      // XY judėjimo trintis

      if (b.z > 0) {

        // ORE — visos ašys sukasi laisvai, beveik be drag

        b.vx *= 0.998;

        b.vy *= 0.998;

        b.angVelX *= 0.998;

        b.angVelY *= 0.998;

        b.angVelZ *= 0.998;

      } else {

        // ANT GRINDŲ — bilijardo style: greitai = mazas friction (rolling), lėtai = stiprus (snap stop)

        const linSp = Math.hypot(b.vx, b.vy);

        let fr;

        if (linSp > FRICTION_THRESHOLD) {

          fr = FRICTION_HIGH;          // ridenasi

        } else if (linSp < 8) {

          fr = FRICTION_LOW;           // beveik sustojo — stipri trintis

        } else {

          // Smooth blend tarp aukštos ir žemos

          const k = (linSp - 8) / (FRICTION_THRESHOLD - 8);

          fr = FRICTION_LOW + (FRICTION_HIGH - FRICTION_LOW) * k;

        }

        b.vx *= fr;

        b.vy *= fr;

        if (linSp < STOP_VEL) { b.vx = 0; b.vy = 0; }

        // Angular friction (sukimasis nuo collision'ų irgi išgęsta — bet lėčiau, kad spin matytusi)

        b.angVelX *= 0.94;

        b.angVelZ *= 0.94;

        // Y angVel — atskirai nuo rolling. Friction lėtesnis kad post-collision spin tęstų.

        b.angVelY *= 0.96;

        if (Math.abs(b.angVelX) < 0.10) b.angVelX = 0;

        if (Math.abs(b.angVelY) < 0.10) b.angVelY = 0;

        if (Math.abs(b.angVelZ) < 0.10) b.angVelZ = 0;

      }

      b.x += b.vx * dts;

      b.y += b.vy * dts;

      // ROLLING — TIK ant grindų. Unsigned (visada didėja). Direction handle'ina drawSphere

      const _linSp = Math.hypot(b.vx, b.vy);

      if (_linSp > 0.3 && b.z === 0) {

        b.rolled = (b.rolled || 0) + _linSp * dts;

        b._lastMotionAng = Math.atan2(b.vy, b.vx);  // saugom paskutinę motion kryptį

      }

      // TRAIL — ore renkama trail pozicijų (skrendantis projektilas)

      if (b.z > 0 && _linSp > 80) {

        b._trail = b._trail || [];

        b._trail.push({ x: b.x, y: b.y - b.z, t: tNow });

        while (b._trail.length > 7) b._trail.shift();

      } else if (b._trail && b._trail.length > 0 && b.z === 0) {

        b._trail = null;  // pašalinam trail kai nusileido

      }

      // Visos 3 ašys integruojamos

      b.rotX += b.angVelX * dts;

      b.rotY += b.angVelY * dts;

      b.rotZ += b.angVelZ * dts;

    }

    // Wall collisions — tik on-ground blokai atsimuša į arenos sienas

    // (skrydyje virš arenos jie gali nuskristi šiek tiek per sienos riba — bet clamp'inam ekstremalius)

    for (const b of blocks) {

      if (b.z > 0) {

        const margin = 6;

        const visTop = 2 * b.r;

        if (b.x - b.r < A.x - margin) { b.x = A.x - margin + b.r; b.vx = Math.abs(b.vx) * 0.5; }

        if (b.x + b.r > A.x + A.w + margin) { b.x = A.x + A.w + margin - b.r; b.vx = -Math.abs(b.vx) * 0.5; }

        if (b.y - visTop < A.y - margin) { b.y = A.y - margin + visTop; b.vy = Math.abs(b.vy) * 0.5; }

        if (b.y > A.y + A.h + margin) { b.y = A.y + A.h + margin; b.vy = -Math.abs(b.vy) * 0.5; }

      } else {

        let bounced = false;

        // Top wall — sphere anchor'inta iš apačios, vizualus aukštis = 2*r

        const visTop = 2 * b.r;

        if (b.x - b.r < A.x) { b.x = A.x + b.r; b.vx = -b.vx * WALL_RESTITUTION; bounced = true; }

        if (b.x + b.r > A.x + A.w) { b.x = A.x + A.w - b.r; b.vx = -b.vx * WALL_RESTITUTION; bounced = true; }

        if (b.y - visTop < A.y) { b.y = A.y + visTop; b.vy = -b.vy * WALL_RESTITUTION; bounced = true; }

        if (b.y > A.y + A.h) { b.y = A.y + A.h; b.vy = -b.vy * WALL_RESTITUTION; bounced = true; }

        if (bounced) {

          const impactSp = Math.hypot(b.vx, b.vy);

          b.angVelY += (Math.random() - 0.5) * impactSp * 0.012;

        }

      }

    }

    // Block-block — tik kai abu yra ant grindų. Skrydyje jie praskrenda virš krūvos.

    // Mažiau iteracijų — kad nebūtų agresyvaus snap'inimo (gradient'inis approach)

    for (let iter = 0; iter < 3; iter++) {

      for (let i = 0; i < blocks.length; i++) {

        for (let j = i + 1; j < blocks.length; j++) {

          const a = blocks[i], b = blocks[j];

          if (a.z > 0 || b.z > 0) continue;

          const dx = b.x - a.x, dy = b.y - a.y;

          const minD = a.r + b.r;

          const distSq = dx * dx + dy * dy;

          if (distSq >= minD * minD) continue;

          const dist = Math.sqrt(distSq) || 0.0001;

          const overlap = minD - dist;

          const nx = dx / dist, ny = dy / dist;

          // Tangent vector (perpendicular to normal)

          const tx = -ny, ty = nx;

          const totalM = a.mass + b.mass;

          // GRADIENT position correction — Box2D-style slop + percent

          // Tik perteklinį overlap pašalinama, ir tik dalį per frame (ne instant)

          const corrAmount = Math.max(0, overlap - POS_CORRECT_SLOP) * POS_CORRECT_PCT;

          const aPush = corrAmount * (b.mass / totalM);

          const bPush = corrAmount * (a.mass / totalM);

          a.x -= nx * aPush; a.y -= ny * aPush;

          b.x += nx * bPush; b.y += ny * bPush;

          const rvx = b.vx - a.vx, rvy = b.vy - a.vy;

          const velAlongN = rvx * nx + rvy * ny;

          if (velAlongN < 0) {

            // Normal impulse — su BOOST'u (kad smūgis būtų jeutresnis)

            const e = BLOCK_RESTITUTION;

            const jn = -(1 + e) * velAlongN / (1 / a.mass + 1 / b.mass) * COLLISION_KICK_BOOST;

            const ix = jn * nx, iy = jn * ny;

            a.vx -= ix / a.mass; a.vy -= iy / a.mass;

            b.vx += ix / b.mass; b.vy += iy / b.mass;

            // Bilijardo "TIK" garsas (throttle'inamas viduje)

            _F12Audio.ballHit(Math.abs(jn));

            // ROLLING KICK — kontaktas matomai sukimąsi (nepriklausomai nuo motion'o magnitude)

            // Smulkūs prisilietimai irgi atrodo kaip ridenasi, ne pastumimas

            const impMag = Math.abs(jn);

            const rollK = impMag * COLLISION_ROLL_KICK;

            a.rolled = (a.rolled || 0) + rollK;

            b.rolled = (b.rolled || 0) + rollK;

            // Update motion angle pagal impulse kryptį (kad marker'is judėtų teisinga puse)

            // a stumiamas atgal į (-nx, -ny), b stumiamas pirmyn (+nx, +ny)

            a._lastMotionAng = Math.atan2(-ny, -nx);

            b._lastMotionAng = Math.atan2(ny, nx);

            // TANGENT FRICTION — minimalus drag

            const velTangent = rvx * tx + rvy * ty;

            const jt = -velTangent * BLOCK_TANGENT_FRICTION / (1 / a.mass + 1 / b.mass);

            a.vx -= jt * tx / a.mass; a.vy -= jt * ty / a.mass;

            b.vx += jt * tx / b.mass; b.vy += jt * ty / b.mass;

            // Angular impulse — vidutinis (mazintas 50% nuo perdėto)

            const impulseN = Math.abs(jn);

            const impulseT = Math.abs(jt);

            const spinKickY = impulseN * 0.0010 + impulseT * 0.0022;

            a.angVelY += (Math.random() - 0.5) * spinKickY * 2;

            b.angVelY += (Math.random() - 0.5) * spinKickY * 2;

            // Cross-axis (X, Z) — subtilesnis

            const spinKickXZ = impulseN * 0.0007;

            a.angVelX += (Math.random() - 0.5) * spinKickXZ * 2;

            a.angVelZ += (Math.random() - 0.5) * spinKickXZ * 2;

            b.angVelX += (Math.random() - 0.5) * spinKickXZ * 2;

            b.angVelZ += (Math.random() - 0.5) * spinKickXZ * 2;

            // Mažas vertical pop kai smūgis stiprus (sumazintas)

            if (impulseN > 80) {

              const popVz = Math.min(110, impulseN * 0.4);

              if (a.vz === 0 && a.z === 0) { a.vz = popVz * 0.5; a.airborne = true; }

              if (b.vz === 0 && b.z === 0) { b.vz = popVz * 0.5; b.airborne = true; }

            }

          }

        }

      }

    }

    resolveMerges();

    // Dvigubas game over pavojus — anti-spam mechanika:

    //   1) baseHp <= 0 (priešai prasiveržia į bazę)

    //   2) blocks.length >= MAX + bonus AND visi balls sustabarbėjo (settled) per 1s

    //      Logika: paskutiniam šūviui duodam galimybę dar suformuoti merge / perfect.

    //      Game over fiksuojama TIK kai cap pasiektas, ball'as nesujudėjo 1s, ir nebuvo jokio merge.

    const _atCap = blocks.length >= MAX_BLOCKS + _f12FireBonusSlots;

    if (_atCap) {

      // Patikrinam ar visi balls settled (be motion, ant grindų)

      let _allSettled = true;

      for (const bb of blocks) {

        if (bb.z > 0.5 || (Math.abs(bb.vx) + Math.abs(bb.vy) + Math.abs(bb.vz)) > 6) {

          _allSettled = false; break;

        }

      }

      if (_allSettled) {

        if (!_f12OverflowSettleAt) _f12OverflowSettleAt = now();

        if (now() - _f12OverflowSettleAt >= 1000) {

          if (!gameOver) {

            // Phase 1 — trophy stat tracking. Persist F12 run results before game over flag flips.

            try {

              if (window.Profile) {

                const P = window.Profile;

                if (!P.stats) P.stats = {};

                P.stats.f12TotalRuns = (P.stats.f12TotalRuns || 0) + 1;

                if ((score || 0) > (P.stats.f12HighScore || 0)) P.stats.f12HighScore = score || 0;

                if (typeof window.saveProfile === 'function') window.saveProfile();

              }

            } catch (_) {}

          }

          gameOver = true;

        }

      } else {

        _f12OverflowSettleAt = 0;       // dar yra motion → galima merge → reset timer

      }

    } else {

      _f12OverflowSettleAt = 0;         // count nukrito (merge įvyko) → clear

    }

  }

  // ── Merge logic (Suika-stilius: collision detection) ──────────────

  function resolveMerges() {

    const toRemove = new Set();

    const toAdd = [];

    for (let i = 0; i < blocks.length; i++) {

      if (toRemove.has(i)) continue;

      const a = blocks[i];

      if (a._mergedThisStep) continue;

      if (a.z > 0) continue;

      for (let j = i + 1; j < blocks.length; j++) {

        if (toRemove.has(j)) continue;

        const b = blocks[j];

        if (b._mergedThisStep) continue;

        if (b.z > 0) continue;

        if (a.type !== b.type || a.value !== b.value) continue;

        const dx = b.x - a.x, dy = b.y - a.y;

        const minD = a.r + b.r;

        if (dx * dx + dy * dy >= (minD + 1) * (minD + 1)) continue;

        const mx = (a.x + b.x) / 2;

        const my = (a.y + b.y) / 2;

        const newVal = a.value * 2;

        // Merged kubas pradeda mažu inertiniu greičiu (vid. dviejų momentumai)

        const mvx = (a.vx + b.vx) / 2 * 0.4;

        const mvy = (a.vy + b.vy) / 2 * 0.4;

        const merged = makeBlock(a.type, newVal, mx, my, mvx, mvy);

        // VERTIKALUS ŠUOLIS — merge'inant kubas pakyla, kaip su pop'u

        merged.z = 0.1;

        merged.vz = MERGE_JUMP_VZ;

        merged.airborne = true;

        // RADIAL SHOCKWAVE — DIDELIS push šalia esantiems kubams

        const shockRadius = merged.r * MERGE_SHOCK_RADIUS_MULT;

        for (const other of blocks) {

          if (other === a || other === b) continue;

          if (other.z > merged.r) continue;

          const ddx = other.x - mx, ddy = other.y - my;

          const dd = Math.hypot(ddx, ddy);

          if (dd > shockRadius || dd < 0.001) continue;

          const falloff = 1 - dd / shockRadius;

          const fnx = ddx / dd, fny = ddy / dd;

          other.vx += fnx * MERGE_SHOCK_FORCE * falloff;

          other.vy += fny * MERGE_SHOCK_FORCE * falloff;

          // Vertikalus pop — šalia esantys pasokami (sumažinta)

          if (other.z === 0) {

            other.vz = 100 + falloff * 130;

            other.airborne = true;

          }

          // Vidutiniai angular kick'ai

          other.angVelY += (Math.random() - 0.5) * falloff * 7;

          other.angVelX += (Math.random() - 0.5) * falloff * 4;

          other.angVelZ += (Math.random() - 0.5) * falloff * 4;

        }

        merged.mergeBoom = {

          startedAt: now(),

          duration: 380 + Math.random() * 220,

        };

        // Merge spin kick — tik aplink vertikalią ašį

        merged.angVelY = (Math.random() - 0.5) * 5;

        merged._mergedThisStep = true;

        // ── PERFECT MERGE DETECTION — ball'as ką tik nukrito ir merge'ina per 300ms ──

        const tNow = now();

        const PERFECT_WINDOW_MS = 300;

        const aPerfect = a._perfectCandidate && a._justLandedAt && (tNow - a._justLandedAt) < PERFECT_WINDOW_MS;

        const bPerfect = b._perfectCandidate && b._justLandedAt && (tNow - b._justLandedAt) < PERFECT_WINDOW_MS;

        const _detected = aPerfect || bPerfect;

        // ZONE detection (0=0.5x, 1=1x, 2=1.5x, 3=2x)

        let _zoneIdx = 1;

        {

          const _Lz = layoutCache;

          if (_Lz && _Lz.arena && _Lz.arena.w > 0) {

            const _frac = (mx - _Lz.arena.x) / _Lz.arena.w;

            _zoneIdx = Math.max(0, Math.min(3, Math.floor(_frac * 4)));

          }

        }

        // Tier pagal zoną: 0.5x → no bonus, 1x → NICE, 1.5x → PERFECT, 2x → RONKE STRONKE

        let _zoneTier = null;

        if (_detected) {

          if (_zoneIdx === 1) _zoneTier = 'nice';

          else if (_zoneIdx === 2) _zoneTier = 'perfect';

          else if (_zoneIdx === 3) _zoneTier = 'ronke_stronke';

          // _zoneIdx === 0 (0.5x): jokio perfect bonus, regular merge

        }

        const isPerfect = !!_zoneTier;

        let scoreMult = 1, slotBonus = 0;

        // slotBonus = -1 bonus kamuoliukas (counteryje). NICE → 0, PERFECT/UNBELIEVABLE → 1 (max -1, jokio -3).

        if (_zoneTier === 'nice')           { scoreMult = 2; slotBonus = 0; }

        else if (_zoneTier === 'perfect')   { scoreMult = 3; slotBonus = 1; }

        else if (_zoneTier === 'ronke_stronke') { scoreMult = 3; slotBonus = 1; }

        merged._perfect = isPerfect;

        merged._zoneTier = _zoneTier;

        merged._slotBonus = slotBonus;

        const scoreGain = _nftScoreBoost(newVal * scoreMult);

        score += scoreGain;

        merges++;

        // Phase 1 — trophy stat tracking. Increment counters on each merge tier.

        // Profile.stats is persisted via saveProfile (cloud-synced through Supabase).

        try {

          if (window.Profile) {

            const P = window.Profile;

            if (!P.stats) P.stats = {};

            if (_zoneTier === 'nice')              P.stats.niceMerges         = (P.stats.niceMerges         || 0) + 1;

            else if (_zoneTier === 'perfect')      P.stats.perfectMerges      = (P.stats.perfectMerges      || 0) + 1;

            else if (_zoneTier === 'ronke_stronke') P.stats.unbelievableMerges = (P.stats.unbelievableMerges || 0) + 1;

            // Track peak ball value ever (for Tier Master / Tier God requirements).

            if (newVal > (P.stats.f12MaxBallValue || 0)) P.stats.f12MaxBallValue = newVal;

            // throttled save — game.js already debounces, but be safe

            if (typeof window.saveProfile === 'function') window.saveProfile();

          }

        } catch (_) {}

        const tier = Math.log2(newVal);  // 1=value2→2, 2=value4→4, 3=value8...

        // ── MERGE SOUND ────────────────────────────────────────────────

        _F12Audio.merge(tier);

        if (isPerfect) _F12Audio.merge(tier + 1.5);   // papildomas „chime" — aukštesnis tier sound layered

        const colJ = TYPE_COLOR[a.type] || TYPE_COLOR.arrow;

        // 1) Screen shake — tier'iui proporcingas (PERFECT — stipresnis)

        _f12ScreenShake = Math.max(_f12ScreenShake, (isPerfect ? 4 : 2) + tier * 1.5);

        // ── ZONE-BASED TITLES + colors ──

        const ZONE_DATA = {

          nice:           { title: 'NICE!',          fill: [180,230,130], glow: [200,255,160], ring: { top: [180,230,130], front: [120,180,80],  left: [70,120,40] } },

          perfect:        { title: 'PERFECT!',       fill: [255,215,80],  glow: [255,235,140], ring: { top: [255,235,140], front: [255,190,60],  left: [180,130,30] } },

          ronke_stronke:  { title: 'UNBELIEVABLE',   fill: [120,180,255], glow: [180,220,255], ring: { top: [120,180,255], front: [40,130,235],  left: [20,65,120] } },

        };

        const _zd = _zoneTier ? ZONE_DATA[_zoneTier] : null;

        // 2) "+N" score popup — zone-aware multiplier

        _f12MergePopups.push({

          text: isPerfect ? ('+' + scoreGain + ' ×' + scoreMult) : ('+' + newVal),

          x: mx, y: my, born: tNow,

          color: _zd

            ? `rgb(${_zd.fill[0]},${_zd.fill[1]},${_zd.fill[2]})`

            : `rgb(${colJ.top[0]},${colJ.top[1]},${colJ.top[2]})`,

        });

        // Perfect title popup — zone-aware

        if (_zd) {

          _f12PerfectPopups.push({

            x: mx, y: my, born: tNow,

            title: _zd.title,

            fillCol: _zd.fill,

            glowCol: _zd.glow,

            chainLevel: 1,

          });

        }

        // 2b) "-1" indikatorius ant BALLS stulpelio — TIK perfect/unbelievable (jie vieninteliai

        // mažina rodomą count -1; nice/paprasti merge'ai counterio nekeičia → jokio popup)

        if (_zoneTier === 'perfect' || _zoneTier === 'ronke_stronke') {

          _f12BallsMinusPopups.push({ born: tNow });

        }

        // 3) Per-type burst FX — zone-aware ring color

        _f12MergeRings.push({

          x: mx, y: my, born: tNow, value: newVal,

          color: _zd ? _zd.ring : colJ,

          type: a.type,

          perfect: isPerfect,

        });

        // Zonos plokštės flash — kurioj zonoj įvyko merge, ta plokštė trumpai pažsta

        {

          const _Lz = layoutCache;

          if (_Lz && _Lz.arena && _Lz.arena.w > 0) {

            const zFrac = (mx - _Lz.arena.x) / _Lz.arena.w;

            const zIdx = Math.max(0, Math.min(3, Math.floor(zFrac * 4)));

            _f12ZoneFlash[zIdx] = tNow;

          }

        }

        // 4) Combo counter — jei merge įvyko per 1.5s nuo paskutinio

        if (tNow - _f12LastMergeAt < 1500) {

          _f12ComboCount++;

          _f12ComboFlashAt = tNow;

        } else {

          _f12ComboCount = 1;

        }

        _f12LastMergeAt = tNow;

        // Phase 15 — track peak combo ever (for Silver "Chain Master" tier req).

        _trackF12Combo(_f12ComboCount);

        // Spirit spawn'as — pažymimas, atsiras tik kai merged kubas pirma palies žemę

        merged._spawnSpiritOnLand = true;

        // ── SUIKA → KOVA jungtis: merge attack atidedamas po susijungimo animacijos

        // Per-type burst duration = ~700ms, todėl attack fire'ina 750ms po merge'o

        _f12PendingAttacks.push({

          type: a.type, value: newVal, mx, my, runAt: tNow + 750,

        });

        toRemove.add(i); toRemove.add(j);

        toAdd.push(merged);

        break;

      }

    }

    // Stale PERFECT candidate cleanup — clear flag jeigu praėjo > 400ms nuo landing be merge

    const _tCleanup = now();

    for (const b of blocks) {

      if (b._perfectCandidate && b._justLandedAt && (_tCleanup - b._justLandedAt) > 400) {

        b._perfectCandidate = false;

      }

    }

    if (toRemove.size === 0) return;

    blocks = blocks.filter((_, idx) => !toRemove.has(idx)).concat(toAdd);

    // (B — pasunkinta, kad nebūtų begalinio self-clear loop'o):

    //   TIK PERFECT / UNBELIEVABLE merge duoda relief → rodomas count −1.

    //   VISI kiti merge'ai (nice + paprasti) → 0 relief: kompensuojam natūralų blocks.length −1

    //   (_f12FireBonusSlots -= 1), kad displayed nenukristų. Rezultatas: displayed = šūviai −

    //   skilled_merge'ai → board'as pildosi, game over (30/30) pasiekiamas.

    for (const m of toAdd) {

      const _goodMerge = (m._zoneTier === 'perfect' || m._zoneTier === 'ronke_stronke');

      if (!_goodMerge) _f12FireBonusSlots -= 1;

    }

    for (const b of blocks) b._mergedThisStep = false;

  }

  function xToLane(x) {

    const A = layoutCache.arena;

    const f = (x - A.x) / A.w;

    return Math.max(0, Math.min(LANES - 1, Math.floor(f * LANES)));

  }

  // Kortos — tik vizualas, jokios logikos. (Anksčiau buvo card → action mechanika, panaikinta.)

  function triggerCardAction(type, t) {

    // no-op

  }

  // Pending crystal deploy overlay — kai armed, lane'ai gauna purple glow + hover lane highlight

  function _drawPendingDeployOverlay(L, t) {

    if (!_pendingCardDeploy) return;

    const PX = 2;

    const col = TYPE_COLOR.crystal;

    const cR = col.top[0], cG = col.top[1], cB = col.top[2];

    const pulse = 0.55 + 0.35 * Math.sin(t * 0.012);

    // Visi lane'ai gauna subtle purple overlay

    for (let i = 0; i < LANES; i++) {

      const ly = L.lanesY + i * L.laneH;

      const lh = L.laneH - 4;

      ctx.fillStyle = `rgba(${cR},${cG},${cB},${0.10 * pulse})`;

      ctx.fillRect(L.lanesX, ly, L.lanesW, lh);

    }

    // Lane po pele — stipresnis highlight + outline

    if (mouse.x >= L.lanesX && mouse.x <= L.lanesX + L.lanesW &&

        mouse.y >= L.lanesY && mouse.y < L.lanesY + L.lanesH) {

      const hoverIdx = Math.floor((mouse.y - L.lanesY) / L.laneH);

      if (hoverIdx >= 0 && hoverIdx < LANES) {

        const ly = L.lanesY + hoverIdx * L.laneH;

        const lh = L.laneH - 4;

        ctx.fillStyle = `rgba(${cR},${cG},${cB},${0.28 * pulse})`;

        ctx.fillRect(L.lanesX, ly, L.lanesW, lh);

        // Pixel art outline (chunky)

        ctx.fillStyle = `rgba(${cR},${cG},${cB},${pulse})`;

        ctx.fillRect(L.lanesX, ly, L.lanesW, PX);

        ctx.fillRect(L.lanesX, ly + lh - PX, L.lanesW, PX);

        ctx.fillRect(L.lanesX, ly, PX, lh);

        ctx.fillRect(L.lanesX + L.lanesW - PX, ly, PX, lh);

      }

    }

    // Hint tekstas viršuje

    ctx.fillStyle = `rgba(${cR},${cG},${cB},${pulse})`;

    ctx.font = 'bold 10px "Press Start 2P", monospace';

    ctx.textAlign = 'center';

    ctx.fillText('CHOOSE A LANE (ESC TO CANCEL)', L.W / 2, L.H - 110);

  }

  // NFT lygio → statų multiplikatorius. PIRMI 2 LYGIAI NIEKO, tada +5% KAS 2 LYGIUS.

  // floor(max(0,lv-2)/2): lvl 1-3 → 1.00×, lvl 4 → 1.05×, lvl 6 → 1.10×, lvl 20 → 1.45×, lvl 42 → 2×.

  // (RONKE Power irgi pirmi 2 lygiai nieko, bet auga kas lvl — atskirai.)

  // Lengva derinti per _NFT_LEVEL_STAT_PCT. Naudojama HP ir dmg skalei spawnAlly metu.

  const _NFT_LEVEL_STAT_PCT = 0.05;

  function _nftStatMul(level) {

    const lv = Math.max(0, level | 0);

    return 1 + Math.floor(Math.max(0, lv - 2) / 2) * _NFT_LEVEL_STAT_PCT;

  }

  // ── Enemies ────────────────────────────────────────────────────────

  function spawnAlly(utype, laneIdx, t, preferredTokenId) {

    const s = ALLY_STATS[utype] || ALLY_STATS.skull;

    // Static (towers) pradeda kairėj base zonoj, nejuda

    const startX = s.static ? 0.05 : 0.0;

    // Reverse mapping utype → ballType, kad pasirinktume kaupimo bonus iš _f12CardBonusMs

    let _ballTypeForBonus = null;

    for (const bt in _UNIT_FOR_BALL_TYPE) {

      if (_UNIT_FOR_BALL_TYPE[bt] === utype) { _ballTypeForBonus = bt; break; }

    }

    const storedBonus = (_ballTypeForBonus && _f12CardBonusMs[_ballTypeForBonus]) || 0;

    // Paimam trained unit'ą iš HOME — gauname jo IŠLIKUSI HP (žala persistuoja per redeploy)

    // Free pool unitai (iš pre-deck modal) grąžina hp:null — naudojam default ALLY_STATS HP.

    const trainedSnap = _takeTrainedUnit(utype, preferredTokenId);

    // NFT level→stat skalė: aukštesnio lygio NFT stipresnis (HP + dmg). Free unitai → mul=1.

    const _lvMul = (trainedSnap && trainedSnap.nft && trainedSnap.level) ? _nftStatMul(trainedSnap.level) : 1;

    const _scaledMaxHp = Math.max(1, Math.round(s.hp * _lvMul));

    const useMaxHp = (trainedSnap && trainedSnap.maxHp != null) ? trainedSnap.maxHp : _scaledMaxHp;

    const useHp    = (trainedSnap && trainedSnap.hp    != null) ? trainedSnap.hp    : useMaxHp;

    const useDmg   = Math.max(1, Math.round(s.dmg * _lvMul));

    const newAlly = {

      utype, x: startX, _prevX: startX,

      static: !!s.static,

      hp: useHp, maxHp: useMaxHp, dmg: useDmg, speed: s.speed,

      attackCooldown: s.attackCooldown,

      range: s.range || 0.04,

      lastAttackAt: 0, hitFlashUntil: 0,

      dead: false, deathStartedAt: 0,

      bornAt: t,

      lifetimeMs: _UNIT_LIFETIME_MS + storedBonus,

      bobPhase: Math.random() * Math.PI * 2,

      swingStart: 0,

      guardStart: 0,

      idleStart: 0, idleUntil: 0,

      nextThinkAt: t + 2000 + Math.random() * 2000,

      trainedSnap: trainedSnap,        // saugom referencę — grąžinsim su atnaujintu HP po recall

      // Per-ally battle counters (used for NFT XP / kills tracking)

      kills: 0, dmgDealt: 0, dmgTaken: 0,

    };

    lanes[laneIdx].allies.push(newAlly);

    // NFT deploy counter — vienkartinis pažymėjimas, kad atskirtume dalyvavusius NFT'us

    if (trainedSnap && trainedSnap.nft && trainedSnap.tokenId != null) {

      _statsForToken(trainedSnap.tokenId).deployed = 1;

    }

    // Saugomas bonus suvartotas → reset

    if (_ballTypeForBonus) delete _f12CardBonusMs[_ballTypeForBonus];

  }

  // Ar lane'e yra gyvas boss'as?

  function _laneHasBoss(li) {

    const ln = lanes[li];

    if (!ln) return false;

    for (const e of ln.enemies) {

      if (e.isBoss && !e.dead) return true;

    }

    return false;

  }

  function spawnEnemy(t, opts) {

    opts = opts || {};

    let laneIdx;

    if (opts.lane !== undefined) {

      laneIdx = opts.lane;

      laneIdx = opts.lane;

    } else {

      // Random lane, BET boss'o lane'as gauna mažiau priešų (boss ir taip stiprus).

      // Jei pataikom į boss lane — 85% šansom perrinkti į non-boss lane'ą.

      laneIdx = rand(LANES);

      if (!opts.boss && _laneHasBoss(laneIdx) && Math.random() < 0.85) {

        const free = [];

        for (let li = 0; li < LANES; li++) if (!_laneHasBoss(li)) free.push(li);

        if (free.length) laneIdx = free[Math.floor(Math.random() * free.length)];

      }

    }

    const tier = Math.floor((t - _f12GameStartT) / 30000);

    const isBoss = !!opts.boss;

    // Enemy kind — boss visada minotauras; regular spawn — weighted (skull 55%, spider 35%, minotaur 10%)

    let kind = opts.kind;

    if (!kind) {

      if (isBoss) {

        kind = 'minotaur';

      } else {

        // Pirmasis priešas Axie, antrasis Minotaur, toliau 3 vorai, o vėliau - pastovus mišinys.
        // (THIEF PAŠALINTAS iš priešų — dabar jis tik žaidėjo pearl-skill ninja. Sheets lieka užkrauti.)

        _f12SpawnedCount++;

        if (_f12SpawnedCount === 1) {

          kind = 'axieronke';

        } else if (_f12SpawnedCount === 2) {

          kind = 'minotaur';

        } else if (_f12SpawnedCount <= 5) {

          kind = 'spider';

        } else {

          const _r = Math.random();

          if (_r < 0.35) kind = 'spider';

          else if (_r < 0.65) kind = 'axieronke';

          else if (_r < 0.85) kind = 'minotaur';

          else kind = 'bear';

        }

      }

    }

    // SPIDER lane viability — spider greitas, todėl jam reikia švarios lane'os spawn'ant.

    // Jei lane'oj jau yra LĖTESNIS non-spider priešas spawn area (x > 0.6), spider'is

    // jį pasivys ir įvyks susidūrimas → vietoj spider'io spawn'inam skull/minotaur.

    if (!isBoss && kind === 'spider') {

      const hasSlowAhead = lanes[laneIdx].enemies.some(other =>

        !other.dead && !other._isWall && other.kind !== 'spider' && other.x > 0.6);

      if (hasSlowAhead) kind = 'axieronke';

    }

    const def = _F12_ENEMY_KINDS[kind] || _F12_ENEMY_KINDS.skull;

    const baseHp  = isBoss ? (25 + tier * 4) : (6 + tier);

    const baseSpd = isBoss ? 0.005 + Math.random() * 0.002 : 0.008 + Math.random() * 0.004;

    // Spider — VISADA 1 hp, Thief — VISADA 10 hp

    const finalHp = (kind === 'spider' && !isBoss) ? 1 :

                    (kind === 'thief' && !isBoss) ? 10 :

                    (Math.max(1, Math.round(baseHp * def.hpMul)) + (def.hpFlat || 0));

    lanes[laneIdx].enemies.push({

      x: 1.0,

      hp: finalHp,

      maxHp: finalHp,

      speed: baseSpd * def.spdMul,

      kind: kind,

      hitFlashUntil: 0,

      dead: false, deathStartedAt: 0,

      bobPhase: Math.random() * Math.PI * 2,

      _prevX: 1.0,

      isBoss: isBoss,

      swingStart: 0,

      guardStart: 0,

      idleStart: 0, idleUntil: 0,

      nextThinkAt: t + 1500 + Math.random() * 2000,

    });

  }

  // Bendrinis damage popup spawner — vienoda animacija visiems damage šaltiniams

  function _spawnDmgPopup(laneIdx, enemyX, dmg, t, opts) {

    const miss = !!(opts && opts.miss);

    const block = !!(opts && opts.block);

    const heal = !!(opts && opts.heal);

    if (dmg <= 0 && !miss && !block && !heal) return;

    _f12DmgPopups.push({

      lane: laneIdx, x: enemyX, dmg, born: t,

      color: (opts && opts.color) || null,    // 'poison' tinted, etc

      crit: !!(opts && opts.crit),             // crit hit → „CRIT!" + oranžinis, didesnis

      miss: miss,                              // nepataikė → „MISS" pilkas

      block: block,                            // skull užblokavo → „BLOCK" žydras

      heal: heal,                              // gydymas → „+N" žalias

    });

    if (_f12DmgPopups.length > 60) _f12DmgPopups.splice(0, _f12DmgPopups.length - 60);  // cap (heavy combat)

  }

  // Priešo smūgis sąjungininkui — bendras (immediate arba deferred per hitDelay).

  // Dmg popup tik stipriems smūgiams (>1), kad paprasti -1 netriukšmautų.

  function _enemyHitAlly(a, dmg, laneIdx, t, crit, miss) {

    if (!a || a.dead) return;

    if (miss) {

      _spawnDmgPopup(laneIdx, a.x, 0, t, { miss: true });

      return;

    }

    // Skull — 25% blokas: guard animacija + „BLOCK", smūgis sugeriamas (jokios žalos)

    if (a.utype === 'skull' && Math.random() < 0.25) {

      a.guardStart = t;                 // paleidžia guard (skydo) animaciją

      a.swingStart = 0;                 // nutraukiam ataką, kad guard animacija nebūtų uždengta

      a._pendingMeleeAt = 0; a._meleeTarget = null; a._meleeLane = undefined;  // blokas nutraukia ir SAVO ataką (kad nesimaišytų dmg per guard)

      a.lastAttackAt = t;               // atidedam kitą ataką, kad guard animacija spėtų pilnai atsigroti

      a.hitFlashUntil = t + 100;

      _spawnDmgPopup(laneIdx, a.x, 0, t, { block: true });

      try { if (_F12Audio && _F12Audio.wallHit) _F12Audio.wallHit(); } catch (_) {}

      return;

    }

    a.hp -= dmg;

    _allyAddDmgTaken(a, dmg);

    a.hitFlashUntil = t + 200;

    _spawnDmgPopup(laneIdx, a.x, dmg, t, { color: 'ally', crit: !!crit });   // rodom visą gautą žalą (ir „-1")

    if (a.hp <= 0) {

      a.dead = true; a.deathStartedAt = t;

      _f12UnitDeployCD[a.utype] = t;

      if (a.trainedSnap && a.trainedSnap.nft && a.trainedSnap.tokenId != null) {

        _f12DeadNftTokenIds.push(a.trainedSnap.tokenId);

        console.log('[F12] NFT #' + a.trainedSnap.tokenId + ' DIED in battle (pending burn)');

        _persistDeathLocal(a.trainedSnap.tokenId);         // 1) SINCHRONIŠKAI į localStorage — NEGALI žlugti, išgyvena viską

        _showDeathToast(a.trainedSnap.tokenId);            // matomas pranešimas žaidėjui

        _commitDeathKeepalive(a.trainedSnap.tokenId);      // 2) bandom iškart per tinklą (jei spės)

        _f12SendCheckpoint();                              // 3) periodinis stilius (invoke) — stats + dead

      }

    }

  }

  function _drawDmgPopups(L, t) {

    if (!_f12DmgPopups.length) return;

    const baseW = 32;

    const DUR = 900;

    ctx.save();

    for (let i = _f12DmgPopups.length - 1; i >= 0; i--) {

      const p = _f12DmgPopups[i];

      const k = (t - p.born) / DUR;

      if (k >= 1) { _f12DmgPopups.splice(i, 1); continue; }

      const alpha = 1 - k;

      const eased = 1 - Math.pow(1 - k, 2);

      const ly = L.lanesY + p.lane * L.laneH;

      const lh = L.laneH - 4;

      const sx = L.lanesX + baseW + (L.lanesW - baseW - 30) * p.x;

      const sy = ly + lh / 2 - eased * 36;

      // Bounce-in scale (pirma 15%) — didesnė overshoot. Crit — didesnis šriftas.

      const scale = k < 0.04 ? 1 + (1 - k / 0.04) * 0.7 : 1;

      const label = p.heal ? ('+' + p.dmg) : p.block ? 'BLOCK' : p.miss ? 'MISS' : ('-' + p.dmg);

      const fontSize = Math.round((p.crit ? 23 : (p.miss || p.block) ? 15 : 18) * scale);

      ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`;

      ctx.textAlign = 'center';

      // Storus juodas outline (4 directions)

      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.95})`;

      ctx.fillText(label, sx - 2, sy);

      ctx.fillText(label, sx + 2, sy);

      ctx.fillText(label, sx, sy - 2);

      ctx.fillText(label, sx, sy + 2);

      // ── VIENINGAS STANDARTAS: unitų žala=balta, priešų žala=raudona, crit=auksinis, miss=pilkas, block=žydras, poison=žalias ──

      let col;

      if (p.heal) col = `rgba(90,230,110,${alpha})`;                   // HEAL — ryškiai žalias „+N"
      else if (p.block) col = `rgba(120,210,255,${alpha})`;                 // BLOCK — žydras

      else if (p.miss) col = `rgba(205,210,220,${alpha})`;             // MISS — pilkas

      else if (p.crit) col = `rgba(255,176,48,${alpha})`;              // CRIT — auksinis/oranžinis

      else if (p.color === 'poison') col = `rgba(140,255,100,${alpha})`; // POISON — žalias

      else if (p.color === 'ally') col = `rgba(255,90,70,${alpha})`;   // priešas kerta unitą — RAUDONA

      else col = `rgba(255,255,255,${alpha})`;                         // unitas kerta priešą — BALTA

      ctx.fillStyle = col;

      ctx.fillText(label, sx, sy);

      // ── CRIT! užrašas virš skaičiaus ──

      if (p.crit) {

        const _cf = Math.round(10 * scale);

        ctx.font = `bold ${_cf}px "Press Start 2P", monospace`;

        const _cy = sy - fontSize * 0.95;

        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.95})`;

        ctx.fillText('CRIT!', sx - 1, _cy); ctx.fillText('CRIT!', sx + 1, _cy);

        ctx.fillText('CRIT!', sx, _cy - 1); ctx.fillText('CRIT!', sx, _cy + 1);

        ctx.fillStyle = `rgba(255,210,60,${alpha})`;

        ctx.fillText('CRIT!', sx, _cy);

      }

    }

    ctx.restore();

  }

  // ── SUIKA → KOVA jungtis: kiekvienas merge daro veiksmą juostose

  // Tikslas: player'is jaučia, kad Suika žaidimas tiesiogiai veikia kovą

  // ── Arena padalinta į 4 LYGIAS X-zonas. Kuo toliau nuo patrankos (kairėj)

  // sumerge'inta, tuo stipresnis efektas: zona 0 = 0.5×, zona 3 = 2.0×.

  function _f12ZoneMult(mx) {

    const L = layoutCache;

    if (!L || !L.arena || L.arena.w <= 0) return 1;

    const frac = (mx - L.arena.x) / L.arena.w;          // 0..1 nuo patrankos

    const zone = Math.max(0, Math.min(3, Math.floor(frac * 4)));

    return 0.5 + zone * 0.5;                             // 0.5, 1.0, 1.5, 2.0

  }

  function _triggerMergeAttack(type, value, mx, my, t) {

    // Surandam labiausiai grėsmingą lane (mažiausias x = arčiausia base)

    let bestLane = -1, bestX = Infinity, bestEnemy = null;

    for (let li = 0; li < lanes.length; li++) {

      for (const e of lanes[li].enemies) {

        if (e.dead || e._isWall) continue;

        if (e.x < bestX) { bestX = e.x; bestLane = li; bestEnemy = e; }

      }

    }

    // Zonos multiplier — pagal merge poziciją arenoj (0.5× .. 2.0×)

    const mult = _f12ZoneMult(mx);

    const dmg = Math.max(1, Math.round(Math.max(2, Math.floor(value / 2)) * mult));

    // Damage types — visiems "puola" tipams

    // STAR (geltona) — gelsvas asteroidas krenta lėtai sukdamasis, +N kryžiaus damage

    if (type === 'star' && bestEnemy) {

      _f12Asteroids.push({

        lane: bestLane, x: bestEnemy.x,

        born: t, duration: 1800,    // 1.8s fall

        dmg, value,

      });

      _f12ScreenShake = Math.max(_f12ScreenShake, 1.5);

      return;

    }

    // ── PEARL (balta, „COMING SOON") → NINJA STRIKE skilas ──
    // Iškviečia draugišką ninja į grėsmingiausią juostą (ar pagal merge poziciją, jei priešų nėra).
    // Ninja dašuoja per priešus iki išėjimo/mirties. Statai skalė su merge dydžiu (value) + zona (mult).
    if (type === 'pearl') {
      let nLane = bestLane;
      if (nLane < 0) {
        // priešų nėra — pasirenkam juostą pagal merge Y poziciją
        const _L = layoutCache;
        nLane = _L ? Math.max(0, Math.min(LANES - 1, Math.floor((my - _L.lanesY) / _L.laneH))) : 0;
      }
      // Ninja = NORMALUS ally unitas (elgesys kaip priešo, tik kitoj barikados pusėj), thief sprite.
      // NE NFT, NE trained — tiesiog spawninamas iš balto merge. Naudoja PILNĄ esamą ally kovos AI
      // (eina → sustoja melee → swing → priešas kontr-atakuoja → mirtis). Begalinis lifetime (be recall
      // į kortą): gyvuoja kol nukaunamas kovoj arba pasiekia kraštą (x≥1) ir išeina (ally AI splice).
      const _ns = ALLY_STATS._ninja || ALLY_STATS.skull;
      lanes[nLane].allies.push({
        utype: '_ninja', kind: 'thief',
        x: 0.0, _prevX: 0.0, static: false,
        hp: _ns.hp, maxHp: _ns.hp, dmg: _ns.dmg, speed: _ns.speed,
        attackCooldown: _ns.attackCooldown, range: _ns.range || 0.04,
        lastAttackAt: 0, hitFlashUntil: 0,
        dead: false, deathStartedAt: 0,
        bornAt: t, lifetimeMs: 9e15,        // ~begalinis: tik miršta kovoj arba išeina pro kraštą
        bobPhase: Math.random() * Math.PI * 2,
        swingStart: 0, guardStart: 0, idleStart: 0, idleUntil: 0,
        nextThinkAt: t + 2000 + Math.random() * 2000,
        trainedSnap: null, kills: 0, dmgDealt: 0, dmgTaken: 0,
      });
      try { _F12Audio.zaibas(Math.log2(value)); } catch (_) {}
      _f12ScreenShake = Math.max(_f12ScreenShake, 3);
      return;
    }

    const isDamage = (type === 'arrow' || type === 'crystal');

    if (isDamage && bestEnemy) {

      bestEnemy.hp -= dmg;

      bestEnemy.hitFlashUntil = t + 350;

      _F12Audio.damageHit(dmg);

      // ── ZAIBO TRENKSMO GARSAS — kartu su lightning bolt visual ──

      _F12Audio.zaibas(Math.log2(value));

      if (bestEnemy.hp <= 0) {

        bestEnemy.dead = true;

        bestEnemy.deathStartedAt = t;

        score += _nftScoreBoost(5);

        _trackF12Kill(bestEnemy);

        if (!bestEnemy._isWall) _F12Audio.skullDeath();

      }

      _f12LaneStrikes.push({

        lane: bestLane, x: bestEnemy.x, type, born: t,

        duration: 450, dmg, color: TYPE_COLOR[type],

        value, tier: Math.log2(value),

      });

      _f12ScreenShake = Math.max(_f12ScreenShake, 2 + Math.log2(value) * 1.2);

      return;

    }

    // SHADOW — paverčia priešą į akmens sieną (block'as juostoj)

    if (type === 'shadow' && bestEnemy && !bestEnemy._isWall) {

      bestEnemy._isWall = true;

      bestEnemy._wallStart = t;

      const _wallHp = Math.max(5, Math.round(20 * mult));   // zonos multiplier

      bestEnemy.hp = _wallHp;

      bestEnemy.maxHp = _wallHp;

      bestEnemy.origSpeed = bestEnemy.speed;

      bestEnemy.speed = 0;

      bestEnemy.swingStart = 0;

      bestEnemy.idleStart = 0;

      bestEnemy.idleUntil = 0;

      // Nuimam nuodų efektą — siena nuodų neturi (akmuo neapsinuodija)

      bestEnemy._poisonStart = 0;

      bestEnemy._poisonEnd = 0;

      bestEnemy._poisonNextTick = 0;

      bestEnemy._poisonLane = undefined;

      // Brief stun aplink priešą

      bestEnemy.hitFlashUntil = t + 350;

      _f12WallConvert.push({

        lane: bestLane, x: bestEnemy.x, born: t, duration: 700,

      });

      _f12ScreenShake = Math.max(_f12ScreenShake, 4);

      _F12Audio.wallSpawn();

      return;

    }

    // FROST (Ronin) — taikoma juosta pamėlynuoja, VISI priešai apsisuka ir

    // eina ATGAL (į dešinę, link spawn'o) 10 sekundžių

    if (type === 'frost') {

      if (bestLane >= 0) {

        const REV_DUR = Math.round(10000 * mult);   // 10 sek × zonos multiplier (5s..20s)

        for (const e of lanes[bestLane].enemies) {

          if (e.dead || e._isWall) continue;

          e.reversedUntil = t + REV_DUR;

        }

        _f12FrostReverse.push({ lane: bestLane, born: t, duration: REV_DUR });

        _F12Audio.frostReverse();

        _f12ScreenShake = Math.max(_f12ScreenShake, 4);

      }

      return;

    }

    // Support types

    if (type === 'heart') {

      // RAUDONI (heart) merge → gydo labiausiai sužeistą ally unitą (+HP) su HP-pildymo animacija.
      // Kiekis: bazė 2 HP (1x zonoj) × zonos mult, + papildomai pagal merge dydį (kuo tolimesnis — daugiau).
      const healHP = Math.max(1, Math.round(2 * mult) + Math.max(0, Math.floor(Math.log2(value || 4)) - 2));

      // labiausiai sužeistas judantis ally (didžiausias maxHp−hp tarpas)
      let tgt = null, worstGap = 0, tgtLane = -1;
      for (let li = 0; li < lanes.length; li++) {
        for (const al of lanes[li].allies) {
          if (al.dead || al.static) continue;
          const gap = (al.maxHp || 0) - (al.hp || 0);
          if (gap > worstGap) { worstGap = gap; tgt = al; tgtLane = li; }
        }
      }

      if (tgt) {
        const oldHp = tgt.hp;
        tgt.hp = Math.min(tgt.maxHp, tgt.hp + healHP);
        const healed = tgt.hp - oldHp;
        if (healed > 0) {
          tgt._healAnim = { from: oldHp / tgt.maxHp, to: tgt.hp / tgt.maxHp, born: t, amt: healed };
          tgt._healFlashUntil = t + 700;
          try { _spawnDmgPopup(tgtLane, tgt.x, healed, t, { heal: true }); } catch (_) {}
          _f12ScreenShake = Math.max(_f12ScreenShake, 1.2);
        }
      } else {
        // nėra sužeistų unitų → fallback: gydom bazę (kaip anksčiau), kad merge nepražūtų
        const oldHp = baseHp;
        baseHp = Math.min(BASE_HP, baseHp + healHP);
        _f12LaneStrikes.push({ lane: -1, x: 0, type: 'heart', born: t, duration: 800, healAmt: baseHp - oldHp, color: TYPE_COLOR.heart });
      }

      return;

    }

    if (type === 'shield') {

      // SHIELD: deda spygliuotus spąstus į RANDOM liniją + RANDOM x.

      // Spąstai cikliškai: 5s pauzė → 1s aktyvūs (spygliai iškyla iš požemių).

      // Priešas užlipęs aktyviu metu gauna -5 dmg.

      const trapLane = rand(LANES);

      const trapX = 0.25 + Math.random() * 0.6;   // ne per arti base'o / krašto

      _f12Traps.push({

        lane: trapLane, x: trapX, born: t,

        _cycle: -1, _hitEnemies: null, dmgMult: mult,   // zonos multiplier

      });

      _f12ScreenShake = Math.max(_f12ScreenShake, 3);

      _F12Audio.trapSpawn();

      // ── SPAWN FX — žemė prasiveria, dulkių/žemių sprogimas (kad žaidėjas matytų kur ir kodėl) ──

      {

        const _L = layoutCache;

        if (_L) {

          const tx = _L.lanesX + 32 + (_L.lanesW - 32 - 30) * trapX;

          const ty = _L.lanesY + trapLane * _L.laneH + (_L.laneH - 4) / 2;

          const dirtCols = ['#4a3a26', '#3a2e1e', '#5a4632', '#2a1f12', '#6b5238'];

          const nd = 12 + Math.floor(Math.random() * 6);   // 12-17 dulkių

          for (let d = 0; d < nd; d++) {

            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;  // fan aukštyn

            const sp = 60 + Math.random() * 160;

            _f12WallChips.push({

              x: tx + (Math.random() - 0.5) * 30,

              y: ty + 4 + (Math.random() - 0.5) * 8,

              vx: Math.cos(ang) * sp,

              vy: Math.sin(ang) * sp - 40,                 // pop aukštyn

              born: t,

              duration: 500 + Math.random() * 400,

              size: 2 + Math.floor(Math.random() * 2),

              col: dirtCols[Math.floor(Math.random() * dirtCols.length)],

            });

          }

        }

      }

      return;

    }

    if (type === 'leaf') {

      // LEAF: nuodai ant pirmojo priešo → 1 dmg kas 10s.

      if (bestEnemy) {

        bestEnemy._poisonStart = t;

        bestEnemy._poisonEnd = t + Math.round(120000 * mult);   // zonos multiplier — ilgesni nuodai

        bestEnemy._poisonNextTick = t + 10000;

        bestEnemy._poisonLane = bestLane;

        // Brief stun apply metu (priešas trumpam stovi)

        bestEnemy.idleUntil = Math.max(bestEnemy.idleUntil || 0, t + 900);

        _f12PoisonImpacts.push({

          lane: bestLane, x: bestEnemy.x, born: t, duration: 1300, isApply: true,

        });

        _f12ScreenShake = Math.max(_f12ScreenShake, 4);

      }

      return;

    }

  }

  // ── Asteroidų tick — krenta žemyn, impact'as triggerina cross damage

  function _tickAsteroids(t) {

    for (let i = _f12Asteroids.length - 1; i >= 0; i--) {

      const a = _f12Asteroids[i];

      const k = (t - a.born) / a.duration;

      if (k >= 1 && !a.impacted) {

        // IMPACT — cross damage (center + top + bottom + left + right)

        a.impacted = true;

        a.impactAt = t;

        const blockX = 0.06;   // ~vienas blokas atstume X ašies

        const hits = [

          { lane: a.lane,     x: a.x,          isCenter: true },

          { lane: a.lane - 1, x: a.x,          isCenter: false },

          { lane: a.lane + 1, x: a.x,          isCenter: false },

          { lane: a.lane,     x: a.x - blockX, isCenter: false },

          { lane: a.lane,     x: a.x + blockX, isCenter: false },

        ];

        for (const h of hits) {

          if (h.lane < 0 || h.lane >= LANES) continue;

          // Find closest enemy in that lane near x (skipping walls — neutral object)

          let bestE = null, bestD = 0.05;

          for (const e of lanes[h.lane].enemies) {

            if (e.dead || e._isWall) continue;

            const d = Math.abs(e.x - h.x);

            if (d < bestD) { bestD = d; bestE = e; }

          }

          if (bestE) {

            bestE.hp -= a.dmg;

            bestE.hitFlashUntil = t + 350;

            _spawnDmgPopup(h.lane, bestE.x, a.dmg, t);

            // Tik vienas garsas per asteroidą — center hit'as

            if (h.isCenter) _F12Audio.damageHit(a.dmg);

            if (bestE.hp <= 0) {

              bestE.dead = true;

              bestE.deathStartedAt = t;

              score += _nftScoreBoost(5);

              _trackF12Kill(bestE);

              if (!bestE._isWall) _F12Audio.skullDeath();

            }

          }

        }

        _f12ScreenShake = Math.max(_f12ScreenShake, 7 + Math.log2(a.value) * 1.5);

      }

      if (k >= 1.4) {

        _f12Asteroids.splice(i, 1);

      }

    }

  }

  // ── Spygliuoti spąstai — cikliškai iškyla, žaloja užlipusius priešus ──

  function _tickTraps(t) {

    for (const trap of _f12Traps) {

      const elapsed = t - trap.born;

      const cycleNum = Math.floor(elapsed / _TRAP_CYCLE_MS);

      const phase = elapsed % _TRAP_CYCLE_MS;

      // Aktyvus paskutinę ciklo sekundę (5s pauzė + 1s aktyvus)

      const isActive = phase >= (_TRAP_CYCLE_MS - _TRAP_ACTIVE_MS);

      trap.active = isActive;

      // Naujas ciklas — išvalom hit set'ą (kiekvienas priešas gali būti pažeistas 1x per aktyvavimą)

      if (trap._cycle !== cycleNum) {

        trap._cycle = cycleNum;

        trap._hitEnemies = new Set();

        trap._retractFitPlayed = false;

      }

      // ── "fit fit" garsiukai — spygliams iškylant ir susileidžiant ──

      // Iškilimas: inactive→active perėjimas

      if (isActive && !trap._wasActive) {

        _F12Audio.trapFit();

      }

      // Susileidimas: paskutinės ~130ms aktyvaus lango (retract animacija)

      if (isActive && !trap._retractFitPlayed && phase >= _TRAP_CYCLE_MS - 130) {

        _F12Audio.trapFit();

        trap._retractFitPlayed = true;

      }

      trap._wasActive = isActive;

      const Ln = lanes[trap.lane];

      if (!Ln) continue;

      // Hit zona pixel-space — atitinka matomą spyglių plotį (~±20px), ne visą sprite cell'ę

      const _Lt = layoutCache;

      const _laneUsable = _Lt ? (_Lt.lanesW - 32 - 30) : 1100;

      const hitThresh = 30 / _laneUsable;   // ±30px nuo spąsto centro (+4px į kiekvieną pusę)

      if (isActive) {

        // AKTYVUS — žaloja priešus ant spyglių

        for (const e of Ln.enemies) {

          if (e.dead || e._isWall) continue;

          if (Math.abs(e.x - trap.x) < hitThresh && !trap._hitEnemies.has(e)) {

            trap._hitEnemies.add(e);

            const _trapDmg = Math.max(1, Math.round(_TRAP_DMG * (trap.dmgMult || 1)));

            e.hp -= _trapDmg;

            e.hitFlashUntil = t + 250;

            _spawnDmgPopup(trap.lane, e.x, _trapDmg, t);

            _F12Audio.damageHit(_trapDmg);

            if (e.hp <= 0) {

              e.dead = true; e.deathStartedAt = t; score += _nftScoreBoost(5); _trackF12Kill(e);

              if (!e._isWall) _F12Audio.skullDeath();

            }

          }

        }

      } else {

        // NEAKTYVUS — jei priešas JUDA per sutrauktus spyglius, žymim step laiką.

        // Tik judantis priešas (ne idle/blokuotas/sustojęs dėl animacijos) triggerina

        // vibraciją — kai niekas nejuda ant spąsto, vibracijos nėra.

        for (const e of Ln.enemies) {

          if (e.dead || e._isWall) continue;

          const moving = t >= (e.idleUntil || 0) &&

                         Math.abs((e._prevX != null ? e._prevX : e.x) - e.x) > 0.00002;

          if (moving && Math.abs(e.x - trap.x) < hitThresh) {

            trap._steppedAt = t;

            break;

          }

        }

      }

    }

  }

  // ── Frost Reverse tick — išvalo pasibaigusias juostas + groja end garsą ──

  function _tickFrostReverse(t) {

    for (let i = _f12FrostReverse.length - 1; i >= 0; i--) {

      const fr = _f12FrostReverse[i];

      const age = t - fr.born;

      if (age >= fr.duration) {

        if (!fr._endPlayed) { _F12Audio.frostReverseEnd(); fr._endPlayed = true; }

        _f12FrostReverse.splice(i, 1);

      }

    }

  }

  // ── Frost Reverse renderis — mėlyna juosta + į dešinę slenkančios rodyklės ──

  function _drawFrostReverse(L, t) {

    if (!_f12FrostReverse.length) return;

    const PX = 2;

    const snap = (v) => Math.round(v / PX) * PX;

    const C = TYPE_COLOR.frost;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (const fr of _f12FrostReverse) {

      const age = t - fr.born;

      const k = age / fr.duration;            // 0..1

      // Intensyvumas — fade-in pirmom 300ms, fade-out paskutinėm 600ms

      let intensity = 1;

      if (age < 300) intensity = age / 300;

      else if (age > fr.duration - 600) intensity = Math.max(0, (fr.duration - age) / 600);

      const ly = L.lanesY + fr.lane * L.laneH;

      const lh = L.laneH - 4;

      const lx = L.lanesX, lw = L.lanesW;

      // 1) Mėlyna juostos danga

      ctx.fillStyle = `rgba(${C.front[0]},${C.front[1]},${C.front[2]},${0.20 * intensity})`;

      ctx.fillRect(lx, ly, lw, lh);

      // Šviesesnės viršutinė/apatinė briaunos

      ctx.fillStyle = `rgba(${C.top[0]},${C.top[1]},${C.top[2]},${0.45 * intensity})`;

      ctx.fillRect(lx, ly, lw, PX);

      ctx.fillRect(lx, ly + lh - PX, lw, PX);

      // 2) Į DEŠINĘ slenkančios mėlynos rodyklės — pixel art chevron pattern

      // FROST_CHEVRON: 7 col × 11 row, '>' formos, 2px storio įstrižos

      const CHEV = [

        "1100000",

        "0110000",

        "0011000",

        "0001100",

        "0000110",

        "0000011",

        "0000110",

        "0001100",

        "0011000",

        "0110000",

        "1100000",

      ];

      const chevCols = 7, chevRows = 11;

      const chevW = chevCols * PX, chevH = chevRows * PX;

      const arrowSpacing = chevW + PX * 8;

      const scroll = (t * 0.05) % arrowSpacing;     // slenka į dešinę

      const chevTopY = snap(ly + (lh - chevH) / 2);

      const cLight = `rgba(${C.top[0]},${C.top[1]},${C.top[2]},${0.75 * intensity})`;

      const cShade = `rgba(${C.back[0]},${C.back[1]},${C.back[2]},${0.55 * intensity})`;

      for (let ax = lx - arrowSpacing + scroll; ax < lx + lw; ax += arrowSpacing) {

        const bx = snap(ax);

        for (let r = 0; r < chevRows; r++) {

          for (let cI = 0; cI < chevCols; cI++) {

            if (CHEV[r][cI] !== '1') continue;

            const px = bx + cI * PX, py = chevTopY + r * PX;

            // šešėlis (1px žemyn-dešinėn) — gylis

            ctx.fillStyle = cShade;

            ctx.fillRect(px + PX, py + PX, PX, PX);

            // šviesus chevron

            ctx.fillStyle = cLight;

            ctx.fillRect(px, py, PX, PX);

          }

        }

      }

      // 3) Snaigės/frost partikelės — dreifuoja į dešinę

      ctx.fillStyle = `rgba(${C.top[0]},${C.top[1]},${C.top[2]},${0.6 * intensity})`;

      for (let p = 0; p < 10; p++) {

        const seed = (fr.lane * 13 + p * 37);

        const px = snap(lx + ((seed * 53 + t * 0.04) % lw));

        const py = snap(ly + 6 + ((seed * 29) % (lh - 12)) + Math.sin(t * 0.003 + p) * PX);

        ctx.fillRect(px, py, PX, PX);

      }

      // 4) Aktyvavimo banga — pirmom ~350ms nuvilnija juosta

      if (age < 350) {

        const wk = age / 350;

        const wx = snap(lx + lw * wk);

        ctx.fillStyle = `rgba(255,255,255,${(1 - wk) * 0.7})`;

        ctx.fillRect(wx - PX, ly, PX * 3, lh);

        ctx.fillStyle = `rgba(${C.top[0]},${C.top[1]},${C.top[2]},${(1 - wk) * 0.5})`;

        ctx.fillRect(wx - PX * 5, ly, PX * 4, lh);

      }

    }

    ctx.restore();

  }

  // ── Spąstų renderis — spike_sheet.png sprite (5 frames flat→peak) ──

  function _drawTraps(L, t) {

    if (!_f12Traps.length) return;

    const baseW = 32;

    const TRAP_W = 76;                          // sprite plotis ekrane (px)

    const TRAP_H = Math.round(TRAP_W * _SPIKE_FRAME_H / _SPIKE_FRAME_W);

    const ready = _spikeSheetImg.complete && _spikeSheetImg.naturalWidth > 0;

    for (const trap of _f12Traps) {

      const ly = L.lanesY + trap.lane * L.laneH;

      const lh = L.laneH - 4;

      const cx = Math.round(L.lanesX + baseW + (L.lanesW - baseW - 30) * trap.x);

      const floorY = ly + lh - 2;               // sprite bazė ant grindų lygio

      const phase = (t - trap.born) % _TRAP_CYCLE_MS;

      const activeStart = _TRAP_CYCLE_MS - _TRAP_ACTIVE_MS;

      const isActive = phase >= activeStart;

      // extend: VISADA bent 0.4 → aktyvus pakyla iki 1.0

      let extend = 0.4;

      if (isActive) {

        const aT = phase - activeStart;

        if (aT < 120) extend = 0.4 + 0.6 * (aT / 120);

        else if (aT > _TRAP_ACTIVE_MS - 120) extend = 0.4 + 0.6 * Math.max(0, (_TRAP_ACTIVE_MS - aT) / 120);

        else extend = 1.0;

      }

      // extend 0.4..1.0 → frame 1..4 (pauzė = maži spygliai, aktyvus peak = pilni)

      const frameIdx = Math.max(0, Math.min(_SPIKE_FRAMES - 1,

                                  Math.round(1 + ((extend - 0.4) / 0.6) * 3)));

      // Step jitter — kai priešas vaikšto per sutrauktus (neaktyvius) spyglius,

      // lenta truputį dunkst pagal žingsnius (1px spaudimas žemyn, ~320ms tempu)

      let jx = 0, jy = 0;

      if (!isActive && trap._steppedAt && (t - trap._steppedAt) < 220) {

        const STEP_CYCLE = 320;                          // ~3 žingsniai/sek

        const sp = (t % STEP_CYCLE) / STEP_CYCLE;        // 0..1 žingsnio fazė

        if (sp < 0.28) {

          // Greitas 1px dunkstelėjimas žemyn žingsnio pradžioj (0→1→0)

          jy = Math.sin(sp / 0.28 * Math.PI) * 1;

        }

      }

      if (ready) {

        const sx = frameIdx * _SPIKE_FRAME_W;

        const dx = Math.round(cx - TRAP_W / 2 + jx);

        const dy = Math.round(floorY - TRAP_H + jy + 2);   // +2px žemyn

        ctx.imageSmoothingEnabled = false;

        ctx.drawImage(_spikeSheetImg, sx, 0, _SPIKE_FRAME_W, _SPIKE_FRAME_H,

                      dx, dy, TRAP_W, TRAP_H);

      } else {

        ctx.fillStyle = '#2c2418';

        ctx.fillRect(cx - TRAP_W / 2 + jx, floorY - 6 + jy + 2, TRAP_W, 6);

      }

      // ── SPAWN FX — pirmom ~650ms po atsiradimo: žaidėjas matytų KUR ir KODĖL ──

      const spawnAge = t - trap.born;

      if (spawnAge < 650) {

        const sk = spawnAge / 650;                        // 0..1

        ctx.save();

        // 1) Besiplečiantis warning žiedas (pixel ring) — patraukia akį

        const ringR = 6 + sk * 46;

        const ringA = (1 - sk) * 0.9;

        ctx.strokeStyle = `rgba(255,170,46,${ringA})`;

        ctx.lineWidth = Math.max(1, Math.round(3 * (1 - sk)));

        ctx.beginPath();

        ctx.arc(cx, floorY - 4, ringR, 0, Math.PI * 2);

        ctx.stroke();

        // 2) Antras vidinis žiedas (su delsa) — dvigubas pulsas

        if (sk > 0.18) {

          const sk2 = (sk - 0.18) / 0.82;

          ctx.strokeStyle = `rgba(255,210,90,${(1 - sk2) * 0.7})`;

          ctx.lineWidth = Math.max(1, Math.round(2 * (1 - sk2)));

          ctx.beginPath();

          ctx.arc(cx, floorY - 4, 4 + sk2 * 34, 0, Math.PI * 2);

          ctx.stroke();

        }

        // 3) Pradinis blyksnis (pirmom ~120ms) — staigus šviesos pliūpsnis

        if (spawnAge < 130) {

          const fa = (1 - spawnAge / 130) * 0.55;

          ctx.fillStyle = `rgba(255,235,180,${fa})`;

          ctx.fillRect(cx - TRAP_W / 2 - 4, floorY - TRAP_H - 4, TRAP_W + 8, TRAP_H + 8);

        }

        ctx.restore();

      }

      // (jokio cikliško overlay — tik patys spygliai, be raudono fono, be mirksėjimo)

    }

  }

  // ── Poison tick — kvėpiamas iš tickEnemies kiekvieną frame'ą

  function _tickPoison(t) {

    for (let li = 0; li < lanes.length; li++) {

      const enemies = lanes[li].enemies;

      for (let i = 0; i < enemies.length; i++) {

        const e = enemies[i];

        if (e.dead || !e._poisonEnd) continue;

        // Poison expired

        if (t > e._poisonEnd) {

          e._poisonEnd = 0;

          e._poisonStart = 0;

          continue;

        }

        // Tick damage (kas 10s) — rodom dmg skaičių, bet be POISONED/SPREAD užrašu

        if (t >= (e._poisonNextTick || 0)) {

          e.hp -= 1;

          e.hitFlashUntil = t + 350;

          _F12Audio.damageHit(1, 'poison');

          // Trumpa stun — priešas sustoja 500ms

          e.idleUntil = Math.max(e.idleUntil || 0, t + 500);

          _spawnDmgPopup(li, e.x, 1, t, { color: 'poison' });

          _f12PoisonImpacts.push({

            lane: li, x: e.x, born: t, duration: 800, isApply: false,

          });

          e._poisonNextTick = t + 10000;

          if (e.hp <= 0) {

            e.dead = true;

            e.deathStartedAt = t;

            score += _nftScoreBoost(5);

            _trackF12Kill(e);

            if (!e._isWall) _F12Audio.skullDeath();

            continue;

          }

        }

        // Spread — patikrinam, ar arti yra kitas priešas tame pačiame lane

        for (let j = 0; j < enemies.length; j++) {

          if (i === j) continue;

          const o = enemies[j];

          if (o.dead || o._isWall) continue;       // walls neutralūs, neužkrečiami

          if (o._poisonEnd && t < o._poisonEnd) continue;

          if (Math.abs(o.x - e.x) < 0.04) {

            o._poisonStart = t;

            o._poisonEnd = t + 120000;

            o._poisonNextTick = t + 10000;

            o._poisonLane = li;

            // Mini "INFECTED" žalias impact

            _f12PoisonImpacts.push({

              lane: li, x: o.x, born: t, duration: 500, isApply: true, isSpread: true,

            });

          }

        }

      }

    }

  }

  // Asteroidai — chunky pixel art akmuo skrenda skersai iš viršaus į taikinį

  function _drawAsteroids(L, t) {

    if (!_f12Asteroids.length) return;

    const PX = 2;

    const snap = (v) => Math.round(v / PX) * PX;

    const baseW = 32;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (const a of _f12Asteroids) {

      const k = (t - a.born) / a.duration;

      const targetLy = L.lanesY + a.lane * L.laneH;

      const targetCy = targetLy + L.laneH / 2;

      const targetX = L.lanesX + baseW + (L.lanesW - baseW - 30) * a.x;

      // Iš viršaus iš KAIRĖS pusės skersai į taikinį

      const fromX = -80;

      const fromY = -80;

      const toX = targetX;

      const toY = targetCy;

      if (k < 1) {

        const ax = snap(fromX + (toX - fromX) * k);

        const ay = snap(fromY + (toY - fromY) * k);

        const dxN = toX - fromX, dyN = toY - fromY;

        const len = Math.hypot(dxN, dyN);

        const dirX = dxN / len, dirY = dyN / len;

        const perpX = -dirY, perpY = dirX;

        // ── Impact warning target (raudonas pulse'inantis "+" ant juostos)

        const targetSx = snap(targetX), targetSy = snap(targetCy);

        const warnPulse = 0.4 + 0.4 * Math.sin(t * 0.020);

        const warnR = snap(14 + warnPulse * 4);

        ctx.fillStyle = `rgba(255,80,40,${(1 - k) * 0.5 * warnPulse})`;

        ctx.fillRect(targetSx - warnR, targetSy - PX, warnR*2, PX*2);

        ctx.fillRect(targetSx - PX, targetSy - warnR/2, PX*2, warnR);

        // ── Comet tail (kūnas su aiškia forma — ne random particles)

        // Cone shape: stora prie galvos, plonėja link uodegos

        const tailSegs = 14;

        const tailLen = 90;

        for (let p = 0; p < tailSegs; p++) {

          const tk = p / tailSegs;

          const trailBack = tk * tailLen;

          const sway = Math.sin(t * 0.008 + tk * 4) * PX * (tk * 4);

          const tx = snap(ax - dirX * trailBack + perpX * sway);

          const ty = snap(ay - dirY * trailBack + perpY * sway);

          const halfWidth = Math.max(PX, snap((6 - tk * 5) * PX));

          // Layer 1: outer red flame edge

          ctx.fillStyle = `rgba(220,${50 + (1 - tk) * 50},20,${(1 - tk) * 0.85})`;

          for (let w = -halfWidth; w <= halfWidth; w += PX) {

            const wx = snap(tx + perpX * w);

            const wy = snap(ty + perpY * w);

            ctx.fillRect(wx - PX/2, wy - PX/2, PX, PX);

          }

          // Layer 2: orange flame body

          const orangeWidth = Math.max(PX, halfWidth - PX*2);

          ctx.fillStyle = `rgba(255,150,40,${(1 - tk * 0.8)})`;

          for (let w = -orangeWidth; w <= orangeWidth; w += PX) {

            const wx = snap(tx + perpX * w);

            const wy = snap(ty + perpY * w);

            ctx.fillRect(wx - PX/2, wy - PX/2, PX, PX);

          }

          // Layer 3: yellow hot center (tik arti galvos)

          if (tk < 0.6) {

            const yelW = Math.max(PX, halfWidth - PX*4);

            ctx.fillStyle = `rgba(255,230,120,${(1 - tk / 0.6)})`;

            for (let w = -yelW; w <= yelW; w += PX) {

              const wx = snap(tx + perpX * w);

              const wy = snap(ty + perpY * w);

              ctx.fillRect(wx - PX/2, wy - PX/2, PX, PX);

            }

          }

        }

        // ── METEOR HEAD — koncentriniai pixel art ring'ai

        // (NE rotating sprite, o aiški švieslį fireball'as su core)

        const headR = 8;       // pixel art rings

        // Outer red flame (15x13)

        for (let dy = -headR; dy <= headR; dy++) {

          for (let dx = -headR; dx <= headR; dx++) {

            const d = Math.sqrt(dx*dx + dy*dy);

            if (d > headR) continue;

            // Random flicker on outer edge

            if (d > headR - 1.5) {

              const flickerSeed = ((dx * 13 + dy * 7 + Math.floor(t * 0.02)) % 5) / 5;

              if (flickerSeed > 0.4) continue;

            }

            const px = snap(ax + dx * PX);

            const py = snap(ay + dy * PX);

            // Layered colors based on distance from center

            let col;

            if (d > headR * 0.85) col = '#c02818';

            else if (d > headR * 0.6) col = '#ff7028';

            else if (d > headR * 0.35) col = '#ffc060';

            else if (d > headR * 0.04) col = '#fff080';

            else col = '#ffffff';

            ctx.fillStyle = col;

            ctx.fillRect(px, py, PX, PX);

          }

        }

        // Subtle dark rocky chunk visible in center (peeking through fire)

        ctx.fillStyle = `rgba(60,30,15,0.6)`;

        ctx.fillRect(snap(ax + PX), snap(ay - PX*2), PX, PX);

        ctx.fillRect(snap(ax - PX*2), snap(ay), PX*2, PX);

        // ── Random outer sparks (3-4 per frame)

        for (let f = 0; f < 4; f++) {

          const seedF = ((t * 0.012 + f * 0.31) % 1);

          const fAng = seedF * Math.PI * 2;

          const fDist = headR * PX + (((t * 0.015 + f * 0.7) % 1) * PX * 6);

          const fx = snap(ax + Math.cos(fAng) * fDist);

          const fy = snap(ay + Math.sin(fAng) * fDist);

          ctx.fillStyle = `rgba(255,${180 + Math.floor(seedF * 60)},80,${0.5 + 0.5 * Math.sin(t * 0.04 + f * 3)})`;

          ctx.fillRect(fx, fy, PX, PX);

        }

      } else if (a.impacted) {

        // IMPACT FLASH — didelis baltas + cross direction sparks

        const impactK = (t - a.impactAt) / 600;

        if (impactK < 1) {

          const alpha = 1 - impactK;

          const burstR = snap(impactK * 60);

          const ax = snap(targetX);

          const ay = snap(targetCy);

          // Central white flash

          ctx.fillStyle = `rgba(255,255,200,${alpha * 0.9})`;

          const flashSz = snap((20 - impactK * 15));

          if (flashSz > 0) {

            ctx.fillRect(ax - flashSz, ay - PX, flashSz * 2, PX*2);

            ctx.fillRect(ax - PX, ay - flashSz, PX*2, flashSz * 2);

          }

          // 4 cross arms — geltonas burst

          ctx.fillStyle = `rgba(255,210,80,${alpha})`;

          ctx.fillRect(ax - burstR, ay - PX, burstR * 2, PX*2);

          ctx.fillRect(ax - PX, ay - burstR, PX*2, burstR * 2);

          // Outer chunk particles

          for (let p = 0; p < 12; p++) {

            const ang = p * (Math.PI / 6);

            const dist = burstR * (0.7 + ((p * 0.137) % 1) * 0.3);

            const px = snap(ax + Math.cos(ang) * dist);

            const py = snap(ay + Math.sin(ang) * dist * 0.6);

            ctx.fillStyle = `rgba(255,160,40,${alpha})`;

            ctx.fillRect(px - PX, py - PX, PX*2, PX*2);

            ctx.fillStyle = '#ffd470';

            ctx.fillRect(px, py, PX, PX);

          }

          // Dust cloud

          for (let p = 0; p < 8; p++) {

            const ang = p * (Math.PI / 4);

            const dist = burstR * 0.85;

            const dx = snap(ax + Math.cos(ang) * dist);

            const dy = snap(ay + Math.abs(Math.sin(ang)) * dist * 0.5 + impactK * 8);

            ctx.fillStyle = `rgba(80,60,40,${alpha * 0.7})`;

            ctx.fillRect(dx - PX, dy - PX, PX*2, PX*2);

          }

        }

      }

    }

    ctx.restore();

  }

  // Shadow → Wall transformation burst (tamsa surenkasi į akmenį)

  function _drawWallConvert(L, t) {

    if (!_f12WallConvert.length) return;

    const PX = 2;

    const snap = (v) => Math.round(v / PX) * PX;

    const baseW = 32;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (let i = _f12WallConvert.length - 1; i >= 0; i--) {

      const w = _f12WallConvert[i];

      const k = (t - w.born) / w.duration;

      if (k >= 1) { _f12WallConvert.splice(i, 1); continue; }

      const alpha = 1 - k;

      const ly = L.lanesY + w.lane * L.laneH;

      const lh = L.laneH - 4;

      const sx = L.lanesX + baseW + (L.lanesW - baseW - 30) * w.x;

      const sy = ly + lh / 2;

      // Tamsus vortex — pixels susitraukia į centrą (ne išplinta)

      const eased = 1 - Math.pow(1 - k, 2);

      // Susitraukimas: pradžioj plačiai aplink, gale susitelkia centre

      const ringR = snap(40 * (1 - eased));

      for (let p = 0; p < 12; p++) {

        const ang = p * (Math.PI / 6) + k * Math.PI;

        const px = snap(sx + Math.cos(ang) * ringR);

        const py = snap(sy + Math.sin(ang) * ringR * 0.7);

        ctx.fillStyle = `rgba(30,30,40,${alpha})`;

        ctx.fillRect(px - PX, py - PX, PX*2, PX*2);

        ctx.fillStyle = `rgba(80,70,90,${alpha})`;

        ctx.fillRect(px, py, PX, PX);

      }

      // Central solidification — chunky brick'ai atsiranda

      if (k > 0.5) {

        const sk = (k - 0.5) / 0.5;

        const wallSz = snap(sk * 24);

        ctx.fillStyle = `rgba(90,75,60,${alpha})`;

        ctx.fillRect(sx - wallSz / 2, sy - wallSz, wallSz, wallSz * 2);

        ctx.fillStyle = `rgba(140,120,100,${alpha})`;

        ctx.fillRect(sx - wallSz / 2, sy - wallSz, wallSz, PX);

      }

    }

    ctx.restore();

  }

  // Poison impacts — apply (initial) ir tick (every 10s) green bursts

  function _drawPoisonImpacts(L, t) {

    if (!_f12PoisonImpacts.length) return;

    const PX = 2;

    const snap = (v) => Math.round(v / PX) * PX;

    const baseW = 32;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (let i = _f12PoisonImpacts.length - 1; i >= 0; i--) {

      const im = _f12PoisonImpacts[i];

      const k = (t - im.born) / im.duration;

      if (k >= 1) { _f12PoisonImpacts.splice(i, 1); continue; }

      const ly = L.lanesY + im.lane * L.laneH;

      const lh = L.laneH - 4;

      const sx = L.lanesX + baseW + (L.lanesW - baseW - 30) * im.x;

      const sy = ly + lh / 2;

      const alpha = 1 - k;

      const eased = 1 - Math.pow(1 - k, 3);

      // INITIAL APPLY — daug-fazė įvykis: flash → 5 lašai krenta → splat shockwave → POISONED

      if (im.isApply) {

        const headY = sy - lh * 0.04;

        const startY = sy - lh * 1.0;

        // ── PHASE 1: Initial GREEN FLASH (pirmiems 18% laiko)

        if (k < 0.18) {

          const fk = k / 0.18;

          const flashR = snap((24 - fk * 8));

          // White-yellow core

          ctx.fillStyle = `rgba(255,255,200,${(1 - fk) * 0.95})`;

          ctx.fillRect(sx - flashR, headY - PX, flashR*2, PX*2);

          ctx.fillRect(sx - PX, headY - flashR, PX*2, flashR*2);

          // Green expanding shockwave ring (12 pixels)

          const ringR = snap(fk * 30);

          ctx.fillStyle = `rgba(140,255,100,${1 - fk})`;

          for (let p = 0; p < 12; p++) {

            const ang = p * (Math.PI / 6);

            const px = snap(sx + Math.cos(ang) * ringR);

            const py = snap(headY + Math.sin(ang) * ringR * 0.7);

            ctx.fillRect(px - PX, py - PX, PX*2, PX*2);

          }

        }

        // ── PHASE 2: 5 lašai krenta nuo viršaus (staggered, cascade waterfall)

        const dropPhaseStart = 0.10;

        const dropPhaseEnd = 0.65;

        const DROPS = 5;

        for (let dropI = 0; dropI < DROPS; dropI++) {

          const stagger = dropPhaseStart + (dropI / DROPS) * 0.04;

          const dropK = Math.max(0, Math.min(1, (k - stagger) / (dropPhaseEnd - stagger)));

          if (dropK <= 0) continue;

          // Spread lašai per platesnį plotą

          const offX = (dropI - (DROPS - 1) / 2) * PX * 3.5;

          const dropX = snap(sx + offX);

          const fallEnd = 0.7;

          if (dropK < fallEnd) {

            const fallK = dropK / fallEnd;

            const fallEased = fallK * fallK;

            const dropY = snap(startY + (headY - startY) * fallEased);

            // Storus tear-drop (chunky)

            ctx.fillStyle = `rgba(40,90,30,${alpha})`;

            ctx.fillRect(dropX - PX, dropY - PX*2, PX*2, PX*3);

            ctx.fillStyle = `rgba(180,240,80,${alpha})`;

            ctx.fillRect(dropX, dropY - PX*2, PX, PX*2);

            // Ilgesnis trail

            if (fallK > 0.25) {

              for (let pp = 1; pp <= 4; pp++) {

                const ty = snap(dropY - pp * PX * 3);

                if (ty > startY) {

                  ctx.fillStyle = `rgba(150,220,80,${alpha * (0.55 - pp * 0.1)})`;

                  ctx.fillRect(dropX, ty, PX, PX);

                }

              }

            }

          } else {

            // Splat (4-6 particles)

            const splatK = (dropK - fallEnd) / (1 - fallEnd);

            const splatEased = 1 - Math.pow(1 - splatK, 2);

            const splatR = snap(splatEased * 14);

            const splatSeed = (im.born * 0.001 + dropI * 0.3) % 1;

            for (let p = 0; p < 5; p++) {

              const ang = p * (Math.PI * 2 / 5) + splatSeed * Math.PI * 2;

              const dist = splatR * (0.6 + ((p * 0.11) % 1) * 0.4);

              const px = snap(dropX + Math.cos(ang) * dist);

              const py = snap(headY + Math.sin(ang) * dist * 0.4 + splatEased * 4);

              ctx.fillStyle = `rgba(40,90,30,${alpha * 0.85})`;

              ctx.fillRect(px - PX, py - PX, PX*2, PX*2);

              ctx.fillStyle = `rgba(180,240,80,${alpha})`;

              ctx.fillRect(px, py, PX, PX);

            }

          }

        }

        // ── PHASE 3: BIG GREEN SHOCKWAVE expand (40-90% — overlap'ina su drops)

        if (k > 0.40 && k < 0.90) {

          const swK = (k - 0.40) / 0.50;

          const swR = snap(swK * 42);

          const swAlpha = (1 - swK) * 0.75;

          // Chunky green ring

          ctx.fillStyle = `rgba(120,200,80,${swAlpha})`;

          for (let p = 0; p < 16; p++) {

            const ang = p * (Math.PI / 8);

            const px = snap(sx + Math.cos(ang) * swR);

            const py = snap(headY + Math.sin(ang) * swR * 0.7);

            ctx.fillRect(px - PX, py - PX, PX*2, PX*2);

          }

        }

        // (POISONED ir SPREAD užrašai panaikinti — tik vizualinis efektas)

      } else {

        // Tick — mažas lašas krenta nuo viršaus → splat išsklaido nesnargliu

        const headY = sy - lh * 0.04;

        const startY = sy - lh * 0.95;

        const dropX = snap(sx);

        const fallEnd = 0.55;        // ankstesnis splat — atrodo greitesnis, mažesnis lašas

        if (k < fallEnd) {

          // Lašas vis dar krenta — tear-drop pokšteliantis

          const fallK = k / fallEnd;

          const fallEased = fallK * fallK;

          const dropY = snap(startY + (headY - startY) * fallEased);

          // Mažas, kompaktiškas tear-drop

          ctx.fillStyle = `rgba(40,90,30,${alpha})`;

          ctx.fillRect(dropX, dropY - PX, PX, PX*2);

          ctx.fillStyle = `rgba(150,220,80,${alpha})`;

          ctx.fillRect(dropX, dropY - PX, PX, PX);

          // Trail — silpni žalsvi pixel'iai virš lašo

          if (fallK > 0.2) {

            ctx.fillStyle = `rgba(150,220,80,${alpha * 0.4})`;

            for (let pp = 1; pp <= 3; pp++) {

              const ty = snap(dropY - pp * PX * 3);

              if (ty > startY) ctx.fillRect(dropX, ty, PX, PX);

            }

          }

        } else {

          // SPLAT — 8 mažos particles spread'inasi į šonus + žemyn (be central blob → nesnargliu)

          const splatK = (k - fallEnd) / (1 - fallEnd);

          const splatEased = 1 - Math.pow(1 - splatK, 2);

          const splatR = snap(splatEased * 24);

          const splatSeed = (im.born * 0.001) % 1;

          for (let p = 0; p < 8; p++) {

            const ang = p * (Math.PI / 4) + splatSeed * Math.PI * 2;

            const dist = splatR * (0.6 + ((p * 0.13 + splatSeed * 3) % 1) * 0.4);

            // Splash goes outward + slight downward bias

            const px = snap(dropX + Math.cos(ang) * dist);

            // Particles gyvai krenta žemyn (gravity-like)

            const py = snap(headY + Math.sin(ang) * dist * 0.4 + splatEased * 6);

            // Outer dark

            ctx.fillStyle = `rgba(40,90,30,${alpha * 0.85})`;

            ctx.fillRect(px - PX, py - PX, PX*2, PX*2);

            // Bright inner

            ctx.fillStyle = `rgba(180,240,80,${alpha})`;

            ctx.fillRect(px, py, PX, PX);

          }

          // Mini white-yellow flash centre (greitas blyksis ne snargliu)

          if (splatK < 0.3) {

            const flashK = splatK / 0.3;

            ctx.fillStyle = `rgba(255,255,200,${(1 - flashK) * alpha * 0.85})`;

            const fR = snap((6 - flashK * 5));

            if (fR > 0) {

              ctx.fillRect(dropX - fR, headY - PX, fR*2, PX*2);

              ctx.fillRect(dropX - PX, headY - fR, PX*2, fR*2);

            }

          }

        }

      }

    }

    ctx.restore();

  }

  function _drawLaneStrikes(L, t) {

    if (!_f12LaneStrikes.length) return;

    const PX = 2;

    const snap = (v) => Math.round(v / PX) * PX;

    const baseW = 32;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (let i = _f12LaneStrikes.length - 1; i >= 0; i--) {

      const s = _f12LaneStrikes[i];

      const k = (t - s.born) / s.duration;

      if (k >= 1) { _f12LaneStrikes.splice(i, 1); continue; }

      const alpha = 1 - k;

      const c = s.color;

      // Heart heal — žali sparks aplink HP bar

      if (s.type === 'heart') {

        const hpx = 10 + 26 / 2;

        const hpy = L.lanesY + L.lanesH / 2;

        ctx.fillStyle = `rgba(120,255,140,${alpha * 0.95})`;

        for (let p = 0; p < 8; p++) {

          const ang = p * (Math.PI / 4) + k * Math.PI * 2;

          const orbitR = 18 + k * 36;

          const sx = snap(hpx + Math.cos(ang) * orbitR);

          const sy = snap(hpy + Math.sin(ang) * orbitR);

          ctx.fillRect(sx - PX, sy - PX, PX*2, PX*2);

          ctx.fillStyle = '#fff';

          ctx.fillRect(sx, sy, PX, PX);

          ctx.fillStyle = `rgba(120,255,140,${alpha * 0.95})`;

        }

        // +N text

        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.9})`;

        ctx.font = 'bold 14px "Press Start 2P", monospace';

        ctx.textAlign = 'left';

        ctx.fillText('+' + s.healAmt, hpx + 24 + 1, hpy - k * 30 + 1);

        ctx.fillStyle = `rgba(120,255,140,${alpha})`;

        ctx.fillText('+' + s.healAmt, hpx + 24, hpy - k * 30);

        continue;

      }

      // Slow effects (shield/leaf) — color overlay on lane

      if (s.type === 'shield' || s.type === 'leaf') {

        const ly = L.lanesY + s.lane * L.laneH;

        const lh = L.laneH - 4;

        ctx.fillStyle = `rgba(${c.top[0]},${c.top[1]},${c.top[2]},${alpha * 0.18})`;

        ctx.fillRect(L.lanesX + baseW, ly, L.lanesW - baseW, lh);

        // Pixel border pulsuojantis

        const pulse = 0.5 + 0.5 * Math.sin(t * 0.020);

        ctx.fillStyle = `rgba(${c.top[0]},${c.top[1]},${c.top[2]},${alpha * pulse})`;

        ctx.fillRect(L.lanesX + baseW, ly, L.lanesW - baseW, PX);

        ctx.fillRect(L.lanesX + baseW, ly + lh - PX, L.lanesW - baseW, PX);

        continue;

      }

      // Damage strike (vertical lightning + flash + dmg popup) — dydis scale'inasi pagal tier

      const ly = L.lanesY + s.lane * L.laneH;

      const lh = L.laneH - 4;

      const exScreenX = L.lanesX + baseW + (L.lanesW - baseW - 30) * s.x;

      const eyScreenY = ly + lh / 2;

      const tier = s.tier || 1;

      const tierScale = 1 + (tier - 1) * 0.4;     // tier 1=1.0, tier 2=1.4, tier 3=1.8, tier 4=2.2

      const boltW = Math.max(PX*2, PX * 2 * tierScale);

      const wobbleAmt = Math.max(PX, Math.floor(PX * tierScale));

      const boltX = snap(exScreenX);

      // Vertical lightning bolt

      ctx.fillStyle = `rgba(255,255,255,${alpha})`;

      let curY = 0;

      while (curY < eyScreenY) {

        const wobble = (Math.sin(curY * 0.3 + s.born * 0.001) > 0 ? wobbleAmt : -wobbleAmt);

        ctx.fillRect(boltX - boltW/2 + wobble, curY, boltW, PX*3);

        curY += PX*3;

      }

      // Color tinted glow šalia (pločio dydis pagal tier)

      ctx.fillStyle = `rgba(${c.top[0]},${c.top[1]},${c.top[2]},${alpha * 0.6})`;

      const glowOff = Math.floor(boltW * 1.5);

      curY = 0;

      while (curY < eyScreenY) {

        ctx.fillRect(boltX - glowOff, curY, PX, PX*3);

        ctx.fillRect(boltX + glowOff - PX, curY, PX, PX*3);

        curY += PX*3;

      }

      // Impact flash on enemy — didesnis su tier

      const impactR = snap((20 + tier * 8) + (1 - k) * 18);

      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.85})`;

      ctx.fillRect(snap(exScreenX) - impactR, snap(eyScreenY) - PX, impactR * 2, PX*2);

      ctx.fillRect(snap(exScreenX) - PX, snap(eyScreenY) - impactR, PX*2, impactR * 2);

      ctx.fillStyle = `rgba(${c.top[0]},${c.top[1]},${c.top[2]},${alpha * 0.7})`;

      ctx.fillRect(snap(exScreenX) - impactR - PX*2, snap(eyScreenY) - PX*2, PX*2, PX*4);

      ctx.fillRect(snap(exScreenX) + impactR, snap(eyScreenY) - PX*2, PX*2, PX*4);

      ctx.fillRect(snap(exScreenX) - PX*2, snap(eyScreenY) - impactR - PX*2, PX*4, PX*2);

      ctx.fillRect(snap(exScreenX) - PX*2, snap(eyScreenY) + impactR, PX*4, PX*2);

      // Aukštesnis tier — papildomos diagonal sparks

      if (tier >= 2) {

        const diag = Math.round(impactR * 0.707);

        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.7})`;

        ctx.fillRect(snap(exScreenX) - diag - PX, snap(eyScreenY) - diag - PX, PX*2, PX*2);

        ctx.fillRect(snap(exScreenX) + diag - PX, snap(eyScreenY) - diag - PX, PX*2, PX*2);

        ctx.fillRect(snap(exScreenX) - diag - PX, snap(eyScreenY) + diag - PX, PX*2, PX*2);

        ctx.fillRect(snap(exScreenX) + diag - PX, snap(eyScreenY) + diag - PX, PX*2, PX*2);

      }

      // Damage popup "-N" kyla aukštyn — VIENINGAS standartas (4-krypčių outline + raudona)

      const dmgFloatY = eyScreenY - k * 40;

      const popupSize = Math.round(18 + tier * 2);

      ctx.font = `bold ${popupSize}px "Press Start 2P", monospace`;

      ctx.textAlign = 'center';

      const _lsLbl = '-' + s.dmg;

      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.95})`;

      ctx.fillText(_lsLbl, exScreenX - 2, dmgFloatY);

      ctx.fillText(_lsLbl, exScreenX + 2, dmgFloatY);

      ctx.fillText(_lsLbl, exScreenX, dmgFloatY - 2);

      ctx.fillText(_lsLbl, exScreenX, dmgFloatY + 2);

      ctx.fillStyle = `rgba(255,255,255,${alpha})`;   // unitų/merge žala priešams — BALTA

      ctx.fillText(_lsLbl, exScreenX, dmgFloatY);

    }

    ctx.restore();

  }

  // ── Hog Rider spear smūgis — particle burst (kaip mint popup'o spawnDeath: ──

  //    white flash + shockwave ring + crimson ring + 44 raudonos/baltos pixel particles su friction)

  const _HOG_REDS = ['#ff3333', '#ff5544', '#cc1818', '#aa0e0e'];

  function _drawHogStrikes(L, t) {

    if (!_f12HogStrikes.length) return;

    const baseW = 32;

    ctx.save();

    for (let i = _f12HogStrikes.length - 1; i >= 0; i--) {

      const s = _f12HogStrikes[i];

      // Lazy init — particles screen-space koordinatėse (pirmo draw metu, kai turim layout L)

      if (!s._init) {

        s._init = true;

        s._lastT = t;

        const ly = L.lanesY + s.lane * L.laneH;

        const lh = L.laneH - 4;

        const cx = L.lanesX + baseW + (L.lanesW - baseW - 30) * s.x;

        const cy = ly + lh / 2;

        s.particles = []; s.rings = []; s.flashes = [];

        // Balto šviesos blyksnio burst

        s.flashes.push({ x: cx, y: cy, r0: 8, r1: 58, life: 1, decay: 0.13 });

        // Shockwave baltas ring + vidinis crimson

        s.rings.push({ x: cx, y: cy, r0: 6, r1: 50, life: 1, decay: 0.05,  color: 'rgba(255,255,255,0.9)' });

        s.rings.push({ x: cx, y: cy, r0: 3, r1: 36, life: 1, decay: 0.065, color: 'rgba(255,80,80,0.7)' });

        // 44 pixel particles (raudona paletė 78% + balta-glow 22%)

        const NUM = 44;

        for (let p = 0; p < NUM; p++) {

          const ang = Math.PI * 2 * Math.random();

          const sp = (0.4 + Math.random() * 3.0) * 1.3;

          const isWhite = Math.random() < 0.22;

          s.particles.push({

            x: cx + (Math.random() - 0.5) * 12,

            y: cy + (Math.random() - 0.5) * 12,

            vx: Math.cos(ang) * sp * 1.4,

            vy: Math.sin(ang) * sp * 1.4 - 0.6,

            life: 1, decay: 0.018 + Math.random() * 0.028,

            r: 2.5 + Math.random() * 4,

            isWhite, color: isWhite ? '#ffffff' : _HOG_REDS[(Math.random() * _HOG_REDS.length) | 0],

          });

        }

      }

      // Step fizika (dt-based, kaip popup'e — friction 0.91, life decay)

      const dt = Math.min(48, t - (s._lastT || t));

      s._lastT = t;

      const scale = dt / 16.67;

      const friction = Math.pow(0.91, scale);

      for (let p = s.particles.length - 1; p >= 0; p--) {

        const pt = s.particles[p];

        pt.x += pt.vx * scale; pt.y += pt.vy * scale;

        pt.vx *= friction; pt.vy *= friction;

        pt.life -= pt.decay * scale;

        if (pt.life <= 0) s.particles.splice(p, 1);

      }

      for (let r = s.rings.length - 1; r >= 0; r--)  { s.rings[r].life   -= s.rings[r].decay * scale;   if (s.rings[r].life   <= 0) s.rings.splice(r, 1); }

      for (let f = s.flashes.length - 1; f >= 0; f--) { s.flashes[f].life -= s.flashes[f].decay * scale; if (s.flashes[f].life <= 0) s.flashes.splice(f, 1); }

      if (s.particles.length === 0 && s.rings.length === 0 && s.flashes.length === 0) { _f12HogStrikes.splice(i, 1); continue; }

      // ── Render — flash (apačioj)

      for (const f of s.flashes) {

        const tt = 1 - f.life;

        const rad = f.r0 + (f.r1 - f.r0) * tt;

        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);

        grad.addColorStop(0,   `rgba(255,255,255,${(f.life * 0.95).toFixed(3)})`);

        grad.addColorStop(0.3, `rgba(255,220,160,${(f.life * 0.6).toFixed(3)})`);

        grad.addColorStop(0.7, `rgba(255,80,40,${(f.life * 0.3).toFixed(3)})`);

        grad.addColorStop(1,   'rgba(0,0,0,0)');

        ctx.fillStyle = grad;

        ctx.beginPath(); ctx.arc(f.x, f.y, rad, 0, Math.PI * 2); ctx.fill();

      }

      // Rings

      for (const r of s.rings) {

        const tt = 1 - r.life;

        const rad = r.r0 + (r.r1 - r.r0) * tt;

        ctx.globalAlpha = r.life * 0.9;

        ctx.strokeStyle = r.color;

        ctx.lineWidth = Math.max(0.5, 3 * r.life);

        ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2); ctx.stroke();

      }

      // Particles — solid (raudoni)

      ctx.shadowBlur = 0;

      for (const pt of s.particles) {

        if (pt.isWhite) continue;

        ctx.globalAlpha = pt.life > 0.5 ? 1 : pt.life * 2;

        ctx.fillStyle = pt.color;

        const size = Math.max(1, Math.round(pt.r * (0.3 + 0.7 * pt.life)));

        ctx.fillRect(Math.round(pt.x - size / 2), Math.round(pt.y - size / 2), size, size);

      }

      // Particles — balti su glow

      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 8; ctx.fillStyle = '#ffffff';

      for (const pt of s.particles) {

        if (!pt.isWhite) continue;

        ctx.globalAlpha = pt.life > 0.5 ? 1 : pt.life * 2;

        const size = Math.max(1, Math.round(pt.r * (0.3 + 0.7 * pt.life)));

        ctx.fillRect(Math.round(pt.x - size / 2), Math.round(pt.y - size / 2), size, size);

      }

      ctx.shadowBlur = 0;

      ctx.globalAlpha = 1;

    }

    ctx.restore();

  }

  // ── OH SHIT eventai — boss, horde, critical alarm

  function _tickOhShitEvents(t) {

    // BOSS — vienkartinis didelis priešas kas 45-60s (warning užrašas pašalintas)

    if (t >= _f12NextBossAt) {

      const bossLane = rand(LANES);

      // Spawnina po 1.2s — duoda laiko reaguoti

      setTimeout(() => {

        if (active) spawnEnemy(now(), { lane: bossLane, boss: true });

      }, 1200);

      _f12NextBossAt = t + 90000 + Math.random() * 30000;  // 90-120s tarp boss'ų (buvo 45-60s)

    }

    // HORDE — 2-3 priešai vienu metu per kelias juostas (sumažintas)

    if (t >= _f12NextHordeAt) {

      const hordeSize = 2 + Math.floor(Math.random() * 2);  // 2-3

      setTimeout(() => {

        if (!active) return;

        for (let i = 0; i < hordeSize; i++) {

          setTimeout(() => {

            if (!active) return;

            // Tikrinam bendrą enemy count — viršijus MAX, neviršijam horde

            let total = 0;

            for (const lane of lanes) for (const en of lane.enemies) if (!en.dead && !en._isWall) total++;

            if (total < MAX_ENEMIES_TOTAL) spawnEnemy(now());

          }, i * 250);

        }

      }, 800);

      _f12NextHordeAt = t + 50000 + Math.random() * 25000;   // 50-75s tarp horde'ų

    }

  }

  function _drawWarnings(L, t) {

    if (!_f12Warnings.length) return;

    ctx.save();

    for (let i = _f12Warnings.length - 1; i >= 0; i--) {

      const w = _f12Warnings[i];

      const k = (t - w.born) / w.duration;

      if (k >= 1) { _f12Warnings.splice(i, 1); continue; }

      const pulse = 0.5 + 0.5 * Math.sin(t * 0.025);

      const alpha = k < 0.85 ? 1 : 1 - (k - 0.85) / 0.04;

      const scale = k < 0.04 ? 1 + (1 - k / 0.04) * 0.5 : 1;

      const fontSize = Math.round(36 * scale);

      ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`;

      ctx.textAlign = 'center';

      const yy = L.H * 0.40;

      // Outline

      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.9})`;

      ctx.fillText(w.text, L.W / 2 + 3, yy + 3);

      // Color

      const colMatch = w.color.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);

      if (colMatch) {

        const cR = parseInt(colMatch[1], 16);

        const cG = parseInt(colMatch[2], 16);

        const cB = parseInt(colMatch[3], 16);

        ctx.fillStyle = `rgba(${cR},${cG},${cB},${alpha * pulse})`;

      } else {

        ctx.fillStyle = w.color;

      }

      ctx.fillText(w.text, L.W / 2, yy);

      // Lane indicator (jei boss → strėlė į lane)

      if (w.lane !== undefined) {

        const ly = L.lanesY + w.lane * L.laneH + L.laneH / 2;

        ctx.fillStyle = `rgba(255,60,60,${alpha * pulse})`;

        // Pulsing big arrow at right lane edge pointing left

        const ax = L.lanesX + L.lanesW - 24;

        const PX = 2;

        for (let p = 0; p < 8; p++) {

          ctx.fillRect(ax - p * PX, Math.round(ly / PX) * PX - p * PX, PX, PX);

          ctx.fillRect(ax - p * PX, Math.round(ly / PX) * PX + p * PX, PX, PX);

        }

      }

    }

    ctx.restore();

  }

  function _drawCriticalAlarm(L, t) {

    const hpFrac = baseHp / BASE_HP;

    if (hpFrac > 0.04 || gameOver) return;

    const pulse = 0.4 + 0.4 * Math.sin(t * 0.018);

    // Red vignette flash around edges

    const edge = 30;

    ctx.fillStyle = `rgba(255,30,30,${pulse * 0.35})`;

    ctx.fillRect(0, 0, L.W, edge);

    ctx.fillRect(0, L.H - edge, L.W, edge);

    ctx.fillRect(0, 0, edge, L.H);

    ctx.fillRect(L.W - edge, 0, edge, L.H);

    // DANGER tekstas viršuje

    if (hpFrac < 0.04) {

      ctx.font = 'bold 20px "Press Start 2P", monospace';

      ctx.textAlign = 'center';

      ctx.fillStyle = `rgba(0,0,0,${pulse * 0.9})`;

      ctx.fillText('!! DANGER !!', L.W / 2 + 2, 80 + 2);

      ctx.fillStyle = `rgba(255,60,60,${pulse})`;

      ctx.fillText('!! DANGER !!', L.W / 2, 80);

    }

  }

  function tickEnemies(dt, t) {

    if (gameOver) return;

    if (t >= nextEnemyAt) {

      // Skaičiuojam bendrą priešų kiekį — viršijus MAX, spawn praleidžiamas (mažas delay'us bandymui vėl)

      let totalEnemies = 0;

      for (const lane of lanes) {

        for (const en of lane.enemies) if (!en.dead && !en._isWall) totalEnemies++;

      }

      if (totalEnemies < MAX_ENEMIES_TOTAL) {

        spawnEnemy(t);

        nextEnemyAt = t + ENEMY_SPAWN_MS - Math.min(800, t / 200);

      } else {

        nextEnemyAt = t + 2000;          // bandyti vėl po 2s, kai bus laisvos vietos

      }

    }

    for (let li = 0; li < lanes.length; li++) {

      const Ln = lanes[li];

      // ── ALLIES — eina iš kairės, mušasi su priešais. Animation states: run/attack/guard/idle

      for (let i = Ln.allies.length - 1; i >= 0; i--) {

        const a = Ln.allies[i];

        if (a.dead) {

          // Pastatai (towers) — splice'inami iškart, be 1400ms death anim laiko

          const removeDelay = a.static ? 0 : 1400;

          if (t - a.deathStartedAt > removeDelay) Ln.allies.splice(i, 1);

          continue;

        }

        // ── AUTO-RECALL — unit'as gyvuoja a.lifetimeMs (default 30s + merge bonus); jei nemirsta, grįžta į pool ──

        if (a.bornAt && (t - a.bornAt) >= (a.lifetimeMs || _UNIT_LIFETIME_MS)) {

          deployPool[a.utype] = (deployPool[a.utype] || 0) + 1;

          // Atnaujinam snap HP ir grąžinam į HOME barakus (žala persistuoja)

          if (a.trainedSnap) {

            a.trainedSnap.hp = Math.max(1, a.hp);   // mažiausiai 1 HP (negali grįžti 0)

            _returnTrainedUnit(a.trainedSnap);

          }

          // CD START — sequential timer: lifetime baigėsi → dabar prasideda 60s CD

          _f12UnitDeployCD[a.utype] = t;

          // Recall vizualinis efektas — fade-up sparkles toj pačioj vietoj

          const _L = layoutCache;

          if (_L) {

            const baseW = 32;

            const ly_ = _L.lanesY + li * _L.laneH;

            const lh_ = _L.laneH - 4;

            const ax_ = _L.lanesX + baseW + (_L.lanesW - baseW - 30) * a.x;

            const ay_ = ly_ + lh_ / 2;

            // Tikslas — unit'o korta apačioj (kad matytųsi, jog GRĮŽTA į kortą, ne miršta)

            let _bt = null;

            for (const _k in _UNIT_FOR_BALL_TYPE) { if (_UNIT_FOR_BALL_TYPE[_k] === a.utype) { _bt = _k; break; } }

            let _tx = ax_, _ty = _L.H - 10;

            const _cl = _getCardLayout(_L);

            if (_cl && _bt) {

              const _ci = _cl.allTypes.indexOf(_bt);

              if (_ci >= 0) { _tx = _cl.startX + _ci * (_CARD_W + _CARD_GAP) + _CARD_W / 2; _ty = _cl.cardY + _CARD_H / 2; }

            }

            _f12RecallEffects.push({ cx: ax_, cy: ay_, tx: _tx, ty: _ty, utype: a.utype, ballType: _bt, born: t });

          }

          Ln.allies.splice(i, 1);

          continue;

        }

        let target = null, bestDist = Infinity, targetLaneIdx = li;

        // Towers — paieška 2 lane'uose (savo + apatinė; viršutinė tik vizualas, nedaro dmg)

        const isTower = a.utype === 'tower' || a.utype === 'crossbow_tower' || a.utype === 'zip';

        const lanesToScan = isTower ? [li, li + 1].filter(idx => idx >= 0 && idx < lanes.length) : [li];

        for (const lIdx of lanesToScan) {

          for (const e of lanes[lIdx].enemies) {

            if (e.dead || e._isWall) continue;     // walls neutralūs — ally tower'iai ir unit'ai juos ignoruoja

            const d = Math.abs(e.x - a.x);

            if (d < bestDist) { bestDist = d; target = e; targetLaneIdx = lIdx; }

          }

        }

        const inMelee = target && bestDist < (a.range || 0.04);

        let _sheetsA = null; try { _sheetsA = skullAnimSheets; } catch (_) {}

        const _gDurA = _sheetsA && _sheetsA.guard ? (_sheetsA.guard.frameCount / 10) * 1000 : 700;

        const _gElA = a.guardStart ? t - a.guardStart : Infinity;

        const isGuarding = _gElA < _gDurA;

        const isIdling = !isGuarding && t < a.idleUntil;

        const isPaused = isGuarding || isIdling;

        if (!inMelee && !isPaused && t >= (a.nextThinkAt || 0)) {

          a.nextThinkAt = t + 2000 + Math.random() * 3000;

          const r = Math.random();

          if (r < 0.10) a.guardStart = t;

          else if (r < 0.18) { a.idleStart = t; a.idleUntil = t + 1000 + Math.random() * 1200; }

        }

        // Pending projectile spawn (harpoon arba shaman)

        if (a._pendingProjAt && t >= a._pendingProjAt) {

          if (a._projTarget && !a._projTarget.dead) {

            const lIdx = (a._projLane !== undefined) ? a._projLane : li;

            if (a.utype === 'harpoon_fish')         { _spawnLaneHarpoon(lIdx, a.x, a._projTarget, a.dmg, t, a); _F12Audio.harpun(); }

            else if (a.utype === 'shaman')          _spawnLaneShamanProj(lIdx, a.x, a._projTarget, a.dmg, t, a);

            else if (a.utype === 'archer')          { _spawnLaneArrow(lIdx, a.x, a._projTarget, a.dmg, t, a); _F12Audio.arrow(); }

            else if (a.utype === 'tower')           { _spawnLaneArrow(lIdx, a.x, a._projTarget, a.dmg, t, a); _F12Audio.arrow(); }

            else if (a.utype === 'crossbow_tower')  { _spawnLaneArrow(lIdx, a.x, a._projTarget, a.dmg, t, a); _F12Audio.arrow(); }

          }

          a._pendingProjAt = 0; a._projTarget = null; a._projLane = undefined;

        }

        // Pending MELEE hit (Hog Rider) — damage + VFX nukrenta prie spear apex, ne swing start

        if (a._pendingMeleeAt && t >= a._pendingMeleeAt) {

          const mt = a._meleeTarget;

          const ml = (a._meleeLane !== undefined) ? a._meleeLane : li;

          if (mt && !mt.dead) {

            if (a.utype === 'hog_rider') {

              if (_rollMiss(a)) {

                // Hog Rider 5% miss — kirtis prošovė (jokios žalos)

                _spawnDmgPopup(ml, mt.x, 0, t, { miss: true });

              } else {

              // Hog Rider — 10% crit (2× dmg) su „CRIT!" popup'u

              const _hogCrit = Math.random() < 0.10;

              const _hogDmg = _hogCrit ? a.dmg * 2 : a.dmg;

              mt.hp -= _hogDmg;

              mt.hitFlashUntil = t + 200;

              _spawnDmgPopup(ml, mt.x, _hogDmg, t, _hogCrit ? { crit: true } : undefined);

              _allyAddDmgDealt(a, _hogDmg);

              _f12HogStrikes.push({ lane: ml, x: mt.x, born: t });

              _f12ScreenShake = Math.max(_f12ScreenShake, _hogCrit ? 4.0 : 2.5);

              try { if (_F12Audio && _F12Audio.damageHit) _F12Audio.damageHit(_hogDmg); } catch (_) {}

              if (mt.hp <= 0) {

                mt.dead = true; mt.deathStartedAt = t;

                score += _nftScoreBoost(5); _trackF12Kill(mt);

                if (!mt._isWall) _F12Audio.skullDeath();

                _allyAddKill(a);

              }

              }

            } else if (_rollMiss(a)) {

              // Skull 10% miss — kirtis prošovė (jokios žalos)

              _spawnDmgPopup(ml, mt.x, 0, t, { miss: true });

            } else {

              // Skull — kirtis pataikė: dmg + kardo garsas

              mt.hp -= a.dmg;

              mt.hitFlashUntil = t + 200;

              _spawnDmgPopup(ml, mt.x, a.dmg, t);

              _allyAddDmgDealt(a, a.dmg);

              try { if (_F12Audio && _F12Audio.swordHit) _F12Audio.swordHit(); } catch (_) {}

              if (mt.hp <= 0) {

                mt.dead = true; mt.deathStartedAt = t;

                score += _nftScoreBoost(5); _trackF12Kill(mt);

                if (!mt._isWall) _F12Audio.skullDeath();

                _allyAddKill(a);

              }

            }

          }

          a._pendingMeleeAt = 0; a._meleeTarget = null; a._meleeLane = undefined;

        }

        // Zip charge fire — atskira logika (lightning, ne projectile)

        if (a._zipPendingFire && t >= a._zipPendingFire) {

          if (a._projTarget && !a._projTarget.dead) {

            const lIdx = (a._projLane !== undefined) ? a._projLane : li;

            // Damage instant

            a._projTarget.hp -= a.dmg;

            a._projTarget.hitFlashUntil = t + 200;

            _spawnDmgPopup((a._projLane !== undefined) ? a._projLane : li, a._projTarget.x, a.dmg, t);

            if (a._projTarget.hp <= 0) { a._projTarget.dead = true; a._projTarget.deathStartedAt = t; score += _nftScoreBoost(5); _trackF12Kill(a._projTarget); if (!a._projTarget._isWall) _F12Audio.skullDeath(); }

            // Spawn lightning bolt — sxy bus screen-space, computed render time

            _f12ZipBolts.push({

              laneIdx: li, fromX: a.x, fromLane: li,

              toX: a._projTarget.x, toLane: lIdx,

              born: t, life: 280, seed: Math.random() * 1000,

            });

          }

          // Po fire — reset charge state, normal cooldown

          a._zipChargeStart = 0;

          a._zipNextShootAt = t + (a.attackCooldown || 2800);

          a.lastAttackAt = t;

          a._zipPendingFire = 0; a._projTarget = null; a._projLane = undefined;

        }

        if (inMelee) {

          // Pirma ataka — ready iškart (lastAttackAt = 0). Po pirmos atakos, normal cooldown.

          const attackReady = !a.lastAttackAt || (t - a.lastAttackAt > a.attackCooldown);

          // ZIP-specific: ne-overwrite jei charge dabar vyksta

          const zipBusy = a.utype === 'zip' && a._zipPendingFire;

          if (attackReady && !zipBusy) {

            a.lastAttackAt = t;

            a.swingStart = t;

            if (a.utype === 'harpoon_fish') {

              a._pendingProjAt = t + _HFISH_THROW_FIRE_T;

              a._projTarget = target; a._projLane = targetLaneIdx;

            } else if (a.utype === 'shaman') {

              a._pendingProjAt = t + _SHAM_PROJ_FIRE_T;

              a._projTarget = target; a._projLane = targetLaneIdx;

            } else if (a.utype === 'archer' || a.utype === 'tower' || a.utype === 'crossbow_tower') {

              a._pendingProjAt = t + _ARCH_FIRE_T;

              a._projTarget = target; a._projLane = targetLaneIdx;

            } else if (a.utype === 'zip') {

              // ZIP — auto-attack su 60s cooldown'u (atskira nuo pearl charge sequence)

              a._zipChargeStart = t;

              a._zipPendingFire = t + _ZIP_CHARGE_DUR;

              a._projTarget = target; a._projLane = targetLaneIdx;

            } else if (a.utype === 'hog_rider') {

              // Hog Rider — DELAYED melee: damage + VFX nukrenta prie spear thrust apex

              // (_HOG_HIT_DELAY), NE swing start. Kitaip priešas mirdavo/dmg rodėsi

              // dar nepusėjus atakos animacijai.

              a._pendingMeleeAt = t + _HOG_HIT_DELAY;

              a._meleeTarget = target; a._meleeLane = targetLaneIdx;

            } else {

              // Skull (basic melee) — DELAYED: sustoja, swing'as, ir TIK apex'e dmg (ne einant)

              a._pendingMeleeAt = t + _SKULL_HIT_DELAY;

              a._meleeTarget = target; a._meleeLane = targetLaneIdx;

            }

          }

          // Enemy counter — tik jei MELEE range (skull range, ne ranged)

          // Priešo kontrsmūgis — per-kind atakos cooldown (meška lėtesnė: 2s, kiti 1.2s)

          if (target && bestDist < ENEMY_MELEE_RANGE) {

            const _eDef = _F12_ENEMY_KINDS[target.kind] || _F12_ENEMY_KINDS.skull;

            if (t - (target.lastAttackAt || 0) > (_eDef.atkCd || 1200)) {

              const _miss = !!(_eDef.missChance && Math.random() < _eDef.missChance);

              const _crit = !_miss && !!(_eDef.critChance && Math.random() < _eDef.critChance);

              const _eAllyDmg = _miss ? 0 : (_crit ? (_eDef.critDmg || (_eDef.allyDmg || 1)) : (_eDef.allyDmg || 1));

              target.lastAttackAt = t;

              target.swingStart = t;

              if (_eDef.hitDelay > 0) {

                // Atidėtas smūgis — kad „-N" + žala sutaptų su animacijos slam kadru (meška)

                target._pendingAllyHit = { at: t + _eDef.hitDelay, allyRef: a, lane: li, dmg: _eAllyDmg, crit: _crit, miss: _miss };

              } else {

                _enemyHitAlly(a, _eAllyDmg, li, t, _crit, _miss);

              }

            }

          }

        } else if (!isPaused && !a.static) {

          // Nejudam kol vyksta atakos swing — kad kirtis ATSIGROTŲ PILNAI (ne „dmg be animacijos"

          // ir ne „kirtis ore" einant). Po ~swing trukmės — judam pirmyn.

          const _swEl = a.swingStart ? (t - a.swingStart) : Infinity;

          if (_swEl >= 880) {

            a.x += a.speed * (dt / 1000);

            if (a.x >= 1.0) { Ln.allies.splice(i, 1); continue; }

          }

        }

      }

      // ── Boss pozicijos šioj lane — precompute VIENĄ kartą (vengiam O(n²) skenavimo per enemy) ──

      const _Lb = layoutCache;

      const _laneUsableB = _Lb ? (_Lb.lanesW - 32 - 30) : 1100;

      let _laneBossXs = null;

      for (const other of Ln.enemies) {

        if (other.dead || other._isWall || !other.isBoss) continue;

        (_laneBossXs || (_laneBossXs = [])).push(other.x);

      }

      // ── Anti-overlap: precompute „enemy in front" (immediate left neighbor) per kiekvieną gyvą enemy ──

      // Surūšiuojam by x ascending — tada kiekvienam enemy front = ankstesnis sortavime (mažesnis x).

      const _liveEnemiesSorted = Ln.enemies

        .filter(en => !en.dead && !en._isWall)

        .sort((a, b) => a.x - b.x);

      for (let si = 0; si < _liveEnemiesSorted.length; si++) {

        _liveEnemiesSorted[si]._frontEnemy = si > 0 ? _liveEnemiesSorted[si - 1] : null;

      }

      for (let i = Ln.enemies.length - 1; i >= 0; i--) {

        const e = Ln.enemies[i];

        if (e.dead) {

          if (t - e.deathStartedAt > 1400) Ln.enemies.splice(i, 1);

          continue;

        }

        // Atidėtas smūgis sąjungininkui (meška) — taikom kai ateina slam kadras

        if (e._pendingAllyHit && t >= e._pendingAllyHit.at) {

          const _ph = e._pendingAllyHit;

          e._pendingAllyHit = null;

          _enemyHitAlly(_ph.allyRef, _ph.dmg, _ph.lane, t, _ph.crit, _ph.miss);

        }

        // ── FROST REVERSE — priešas eina ATGAL (į dešinę) 10s ──

        // Ignoruoja idle/boss/wall/base logiką; clamp'inamas prie spawn krašto.

        if (t < (e.reversedUntil || 0)) {

          e.x += e.speed * (dt / 1000);

          if (e.x > 0.97) e.x = 0.97;

          continue;

        }

        // ── State machine: walking | guarding | idling (F11-style timestamps)

        let _sheets1 = null; try { _sheets1 = skullAnimSheets; } catch (_) {}

        const _guardDur = _sheets1 && _sheets1.guard ? (_sheets1.guard.frameCount / 10) * 1000 : 700;

        const _guardElapsed = e.guardStart ? t - e.guardStart : Infinity;

        const isGuarding = _guardElapsed < _guardDur;

        const isIdling = !isGuarding && t < e.idleUntil;

        const isPaused = isGuarding || isIdling;

        // ── Atstumas iki boss'o priekyje (toj pačioj lane) — naudojamas idle + hard-stop ──

        // _bossDist pixel-space; jei boss'o priekyje nėra — Infinity

        let _bossDist = Infinity;

        if (!e.isBoss && _laneBossXs) {

          for (let bi = 0; bi < _laneBossXs.length; bi++) {

            const bx = _laneBossXs[bi];

            if (bx >= e.x) continue;                       // boss turi būti priekyje

            const dpx = (e.x - bx) * _laneUsableB;

            if (dpx < _bossDist) _bossDist = dpx;

          }

        }

        // "Slowing" zona — kai priešas ARTĖJA prie boss'o (< 90px), daro dažnesnes/ilgesnes pauzes.

        // Toliau už 90px — normalus elgesys (boss'ui pajudėjus pirmyn, judesys grįžta į normą).

        const _nearBoss = _bossDist < 90;

        if (!isPaused && t >= (e.nextThinkAt || 0)) {

          if (_nearBoss) {

            // Artėja prie boss'o — DAŽNESNI ir ILGESNI idle stabtelėjimai (kad nepasivytų)

            e.nextThinkAt = t + 600 + Math.random() * 900;

            const r = Math.random();

            if (r < 0.10) e.guardStart = t;

            else if (r < 0.78) { e.idleStart = t; e.idleUntil = t + 2200 + Math.random() * 2800; }

          } else {

            // Normalus elgesys — boss toli arba jo nėra

            e.nextThinkAt = t + 1500 + Math.random() * 2500;

            const r = Math.random();

            if (r < 0.18) e.guardStart = t;

            else if (r < 0.40) { e.idleStart = t; e.idleUntil = t + 1500 + Math.random() * 1800; }

          }

        }

        // Sustok kai sutinki ally — scan'inam savo lane + gretima viršuj (towers iš li-1 dengia ir li)

        let nearestAllyDist = Infinity, nearestAllyRange = ENEMY_MELEE_RANGE;

        const enemyScanLanes = [li, li - 1].filter(idx => idx >= 0 && idx < lanes.length);

        for (const lIdx of enemyScanLanes) {

          for (const a of lanes[lIdx].allies) {

            if (a.dead) continue;

            // Iš gretimos lane'os — tik tower'ius (jie dengia 2 lane'us vertikaliai)

            if (lIdx !== li && !a.static) continue;

            const d = Math.abs(a.x - e.x);

            if (d < nearestAllyDist) {

              nearestAllyDist = d;

              // Visi allies — skull priseina arti (melee range) ir musasi (įskaitant šamaną)

              nearestAllyRange = ENEMY_MELEE_RANGE;

            }

          }

        }

        // Enemy sustoja artime atstume — stovi ramei ir mušasi

        const inAllyMelee = nearestAllyDist < nearestAllyRange;

        // WALL — priešas-akmens siena nejuda ir nepuola, tik laukia kol bus sunaikinta

        if (e._isWall) {

          if (e.x <= 0) {

            // Wall stovi virš kairio krašto bet base'o nemuša

          }

          continue;

        }

        // Patikrinam, ar yra siena tame pačiame lane priekyje (mažesnis x — arčiau base)

        let wallBlocker = null, wallDist = Infinity;

        for (const other of Ln.enemies) {

          if (other === e || other.dead || !other._isWall) continue;

          if (other.x >= e.x) continue;     // turi būti priekyje (mažesnis x)

          const d = e.x - other.x;

          if (d < wallDist) { wallDist = d; wallBlocker = other; }

        }

        // Threshold pixel-space: 0.06 lane-frac MINUS 20 px (skull priartėja arčiau)

        const _Llay = layoutCache;

        const _laneUsablePx = _Llay ? (_Llay.lanesW - 32 - 30) : 1100;

        const wallStopThresh = Math.max(0.005, 0.06 - 35 / _laneUsablePx);

        const blockedByWall = wallBlocker && wallDist < wallStopThresh;

        if (blockedByWall) {

          // Puola sieną

          if (t - (e.lastAttackAt || 0) > 1100) {

            e.lastAttackAt = t;

            e.swingStart = t;

            wallBlocker.hp -= 1;

            _F12Audio.wallHit();

            _spawnDmgPopup(li, wallBlocker.x, 1, t);

            // ── Pixel skeveldros nuo sienos (vietoj mirksėjimo) ──

            {

              const _L = layoutCache;

              if (_L) {

                const wbx = _L.lanesX + 32 + (_L.lanesW - 32 - 30) * wallBlocker.x;

                const wby = _L.lanesY + li * _L.laneH + (_L.laneH - 4) / 2;

                const stoneCols = ['#5a4a3a', '#624c3a', '#54422e', '#7a6a58', '#3a2a1a'];

                const n = 6 + Math.floor(Math.random() * 4);   // 6-9 skeveldrų

                for (let ch = 0; ch < n; ch++) {

                  // Sprogimas į dešinę-aukštyn (skull dauzo iš dešinės) + random

                  const ang = -Math.PI / 2 + (Math.random() - 0.35) * 2.0;

                  const sp = 70 + Math.random() * 130;

                  _f12WallChips.push({

                    x: wbx + (Math.random() - 0.5) * 14,

                    y: wby + (Math.random() - 0.5) * 24,

                    vx: Math.cos(ang) * sp + 40,            // bias į dešinę (impacto pusė)

                    vy: Math.sin(ang) * sp - 30,            // pop aukštyn

                    born: t,

                    duration: 550 + Math.random() * 350,

                    size: 2 + Math.floor(Math.random() * 2), // 2-3 px

                    col: stoneCols[Math.floor(Math.random() * stoneCols.length)],

                  });

                }

              }

            }

            if (wallBlocker.hp <= 0) {

              wallBlocker.dead = true;

              wallBlocker.deathStartedAt = t;

              _F12Audio.wallCollapse();

            }

          }

          continue;

        }

        // ── BOSS SEPARATION — hard-stop kai lieka 45px iki boss'o ──

        // _bossDist (pixel-space) apskaičiuotas anksčiau. Boss'ui pajudėjus pirmyn ir

        // tarpui atsivėrus — priešas vėl juda; vėl priartėjus iki 45px — vėl sustoja.

        if (!e.isBoss && _bossDist < 45) {

          continue;   // per arti boss'o — stovim (idle animacija automatiškai)

        }

        if (!isPaused && !inAllyMelee) {

          let newX = e.x - e.speed * (dt / 1000);

          // Anti-overlap — neperžengiam į „in front" enemy gap zoną

          if (e._frontEnemy && !e._frontEnemy.dead && !e._frontEnemy._isWall) {

            const _eDef = _F12_ENEMY_KINDS[e.kind || 'skull'] || _F12_ENEMY_KINDS.skull;

            const _fDef = _F12_ENEMY_KINDS[e._frontEnemy.kind || 'skull'] || _F12_ENEMY_KINDS.skull;

            const minGap = (_eDef.gap + _fDef.gap) / 2;

            const minAllowedX = e._frontEnemy.x + minGap;

            if (newX < minAllowedX) newX = minAllowedX;

          }

          e.x = newX;

        }

        if (e.x <= 0) {

          const _breachDmg = (e.kind === 'spider' || e.kind === 'thief' || e.kind === 'minotaur' || e.kind === 'bear') ? 10 : 3;   // voras + thief + minotauras + meška prasiveržę daro daugiau žalos bazei

          baseHp -= _breachDmg;

          Ln.enemies.splice(i, 1);

          if (baseHp <= 0) {

            baseHp = 0;

            if (!gameOver) {

              // Phase 1 — trophy stat tracking. Also persist on base-destroyed game over.

              try {

                if (window.Profile) {

                  const P = window.Profile;

                  if (!P.stats) P.stats = {};

                  P.stats.f12TotalRuns = (P.stats.f12TotalRuns || 0) + 1;

                  if ((score || 0) > (P.stats.f12HighScore || 0)) P.stats.f12HighScore = score || 0;

                  if (typeof window.saveProfile === 'function') window.saveProfile();

                }

              } catch (_) {}

            }

            gameOver = true;

          }

        }

      }

    }

  }

  // ── Launcher ───────────────────────────────────────────────────────

  // Grąžina 0..1 priklausomai nuo to, kiek laiko hold'inta

  function getChargeLevel() {

    if (!charging) return 0;

    const dt = now() - chargeStartedAt;

    return clamp(dt / CHARGE_FULL_MS, 0, 1);

  }

  // power: 0..1

  function fire(power) {

    const t = now();

    if (t - lastFireAt < _currentReloadMs) return;

    // Effective cap: MAX_BLOCKS + bonus iš merges (kiekvienas merge += 1 papildomas slot)

    if (blocks.length >= MAX_BLOCKS + _f12FireBonusSlots) return;

    if (gameOver) return;

    lastFireAt = t;

    _f12HoldLockedUntilFire = false;      // iššovėm → STASH vėl galima naudoti (vienkryptė mechanika)

    _f12PlatformAnimStart = t;            // platforma animuojasi vieną kartą po šūvio

    // Sekančio reload trukmė — lygi distribucija: 1s / 2s / 3s, kiekvienas po ~33%

    {

      const r = Math.random();

      if (r < 1/3) _currentReloadMs = 1000;

      else if (r < 2/3) _currentReloadMs = 2000;

      else _currentReloadMs = 3000;

    }

    const lx = launcher.x, ly = launcher.y;

    const ang = launcher.angle;

    const r = radiusForValue(nextBlock.value);

    // Spawn prie patrankos snapo galo (barrel tip ~44px nuo centro)

    const MUZZLE = 44;

    const sx = lx + Math.cos(ang) * (MUZZLE + r);

    const sy = ly + Math.sin(ang) * (MUZZLE + r);

    const p = clamp(power, 0, 1);

    const speed = lerp(FIRE_SPEED_MIN, FIRE_SPEED_MAX, p);

    const vx = Math.cos(ang) * speed;

    const vy = Math.sin(ang) * speed;

    // Vertikalus impulsas — žemesni metimui (mažas charge) trumpa arka, didesni — aukštas šuolis

    const vz = lerp(420, 950, p);

    const blk = makeBlock(nextBlock.type, nextBlock.value, sx, sy, vx, vy, vz);

    blk.airborne = true;

    blk._perfectCandidate = true;        // pažymėtas „PERFECT" candidate'as kol neturi bounce/grindų kontakto

    // 3D tumble — visos 3 ašys gauna random angular velocity (ore kubas verčiasi visomis kryptim)

    const spinScale = lerp(2.5, 9.0, p);

    blk.angVelX = (Math.random() - 0.5) * 2 * spinScale;

    blk.angVelY = (Math.random() - 0.5) * 2 * spinScale;

    blk.angVelZ = (Math.random() - 0.5) * 2 * spinScale;

    // Pradinis pasvyrimas X ir Z — kubas iškart "neuzmautas ant iesmo"

    blk.rotX = (Math.random() - 0.5) * 0.6;

    blk.rotZ = (Math.random() - 0.5) * 0.6;

    blocks.push(blk);

    // ── FIRE SOUND ──────────────────────────────────────────────────

    _F12Audio.cannonShot(p);

    // ── FIRE JUICE FEEDBACK ─────────────────────────────────────────

    // 1) Cannon recoil — barrel atsitraukia priklausomai nuo power

    _f12FireRecoil = 5 + p * 10;

    _f12FireRecoilAng = ang;

    // 2) Screen shake — propostional to charge

    _f12ScreenShake = Math.max(_f12ScreenShake, 1.5 + p * 4);

    // 3) Muzzle flash — pixel art chunks at barrel tip

    const flashX = lx + Math.cos(ang) * MUZZLE;

    const flashY = ly + Math.sin(ang) * MUZZLE;

    _f12MuzzleFlashes.push({

      x: flashX, y: flashY, ang, born: t, power: p,

      duration: 220,

    });

    // 4) Smoke puff — chunky pixel particles spread'inami iš barrel

    const smokeCount = 4 + Math.floor(p * 6);

    for (let i = 0; i < smokeCount; i++) {

      const sang = ang + (Math.random() - 0.5) * 0.8;

      const ssp = 60 + Math.random() * 80 * (1 + p);

      _f12FireSmoke.push({

        x: flashX, y: flashY,

        vx: Math.cos(sang) * ssp,

        vy: Math.sin(sang) * ssp - 30,

        born: t,

        size: 3 + Math.floor(Math.random() * 3),

        duration: 600 + Math.random() * 300,

      });

    }

    nextBlock = nextNextBlock || makeNextBlock();

    nextNextBlock = makeNextBlock();

    _f12ReloadEndPlayed = false;          // po reload pabaigos paleisim reveal garsiuką

  }

  // STASH slotas — VIENKARTINĖ mechanika (ne swap). Tap ant sloto:

  //  • tuščias (SAVE) → užrakinam dabar užkrautą spalvą, užkraunam sekantį (eilė pasislenka)

  //  • pilnas  (USE)  → išsaugota spalva užkraunama į patranką, slotas IŠTUŠTĖJA → gali įdėti naują

  function _f12HoldSwap() {

    if (gameOver || !nextBlock) return;

    // VIENKRYPTĖ mechanika: padarius STASH veiksmą, patrankoj atsiranda spalva kurią

    // PRIVALAI iššauti — atgal įdėti / vėl keisti / saugoti naują negali kol neiššausi.

    // Tai natūraliai sustabdo spam'ą ir „korta ta pati, patranka keičiasi" painiavą.

    if (_f12HoldLockedUntilFire) return;

    if (!_f12HoldBall) {

      // SAVE — užrakinam spalvą; patrankon ateina nauja spalva (ją reikės iššauti)

      _f12HoldBall = { type: nextBlock.type, value: nextBlock.value };

      nextBlock = nextNextBlock || makeNextBlock();

      nextNextBlock = makeNextBlock();

    } else {

      // USE — išsaugota spalva eina į patranką (ją reikės iššauti), slotas tuščias

      nextBlock = { type: _f12HoldBall.type, value: _f12HoldBall.value };

      _f12HoldBall = null;

    }

    _f12HoldLockedUntilFire = true;        // užrakinta iki šūvio

    _f12HoldFlashAt = now();

    try { if (_F12Audio && _F12Audio.colorReveal) _F12Audio.colorReveal(); } catch (_) {}

  }

  function updateLauncherAim() {

    const L = layoutCache;

    if (!L) return;

    launcher.x = L.launcher.x;

    launcher.y = L.launcher.y;

    const dx = mouse.x - launcher.x;

    const dy = mouse.y - launcher.y;

    let ang = Math.atan2(dy, dx);

    // Launcher kairej arenos puses → desinis pusrutulis

    const LIM = (80 * Math.PI) / 180;

    if (ang > LIM) ang = LIM;

    if (ang < -LIM) ang = -LIM;

    if (dx < 0) ang = (dy < 0) ? -LIM : LIM;

    launcher.angle = ang;

  }

  // ── Render ─────────────────────────────────────────────────────────

  function render(t) {

    layoutCache = computeLayout();

    const L = layoutCache;

    ctx.clearRect(0, 0, L.W, L.H);

    // ── GAME OVER MUSIC TRANSITION — vienkartinis (po game over) ──

    if (gameOver && !_f12GameOverHandled) {

      _f12GameOverHandled = true;

      try { _F12Music.stop(); } catch (_) {}

      try { _F12Audio.gameOver(); } catch (_) {}

      // NFT settlement — submit burn + claim XP awards (defer to avoid blocking render frame)

      setTimeout(function() { _settleNftBattle(false); }, 800);

    }

    // Atnaujinam drop targetus

    unitDropRects = [];

    hpBarRect = null;

    // Screen shake — taikom translate'ą visam frame'ui

    let _shakeX = 0, _shakeY = 0;

    if (_f12ScreenShake > 0.1) {

      _shakeX = (Math.random() - 0.5) * _f12ScreenShake * 2;

      _shakeY = (Math.random() - 0.5) * _f12ScreenShake * 2;

      _f12ScreenShake *= 0.86;     // decay per frame

      ctx.save();

      ctx.translate(_shakeX, _shakeY);

    }

    drawDirtBackground(L);

    if (!_IS_MOBILE) _drawAmbientFog(L, t);  // fog skip on mobile (radial gradients per cloud = brangu)

    drawLanes(L, t);

    _drawTraps(L, t);

    _drawLaneHarpoons(L, t);

    _drawLaneShamanProj(L, t);

    _drawLaneArrows(L, t);

    _drawZipBolts(L, t);

    drawArena(L);             // 4 zonų markeriai įkepti į arenos sprite'ą

    // _drawArenaCapacity pašalinta — info dabar rodoma ant platformos po RONKE/cannon

    if (!_IS_MOBILE) _drawWindIndicator(L, t);  // wind UI skip on mobile (wind išjungtas, indikatorius nieko neparodo)

    _drawZoneFlashes(L, t);   // zonos plokštės blyksnis kai sumerge'inta

    _drawDecorations(L, t);   // dekoracijos — po abiem fonais, prieš kamuoliukus

    drawBlocks(L, t);

    if (!_IS_MOBILE) _drawAmbientWind(L, t);  // wind skip on mobile (particles/streaks/vortex/debris brangu)

    drawLauncher(L, t);

    // drawPowerMeter pakeistas į pixel art ring drawLauncher viduje

    drawNextPreview(L, t);

    _drawCards(L, t);

    _drawHoldSlot(L, t);

    _drawCardConsumes(L, t);

    _drawSpirits(L, t);

    // Juice — fire feedback (po launcher, kad būtų ant viršaus)

    _drawFireSmoke(L, t);

    _drawWallChips(L, t);

    _drawMuzzleFlashes(L, t);

    // Juice — merge feedback (ringai, popups) prieš HUD

    _drawMergeRings(L, t);

    _drawMergePopups(L, t);

    _drawPerfectPopups(L, t);

    _drawLaneStrikes(L, t);    // merge attack effects ant juostų

    _drawHogStrikes(L, t);     // Hog Rider spear smūgio slash arc + sparks

    _drawPoisonImpacts(L, t);  // nuodų uždėjimo / tick burst'ai

    _drawWallConvert(L, t);    // shadow → wall transformation burst

    _drawAsteroids(L, t);      // geltonas asteroidas kris ir cross damage

    _drawBlood(t);             // unitų mirties kraujo partikleliai

    _drawDmgPopups(L, t);      // dmg "-N" popups (visi šaltiniai)

    _drawRecallEffects(L, t);  // unit recall sparkles (po 30s gyvavimo grįžta į deck)

    _drawBonusPopups(L, t);    // „+5s" / „-5s CD" merge bonus popups

    drawHud(L, t);

    // drawDeployPanel pašalinta — vietoj jo egzistuojančios kortos veikia kaip deploy mygtukai

    _drawCriticalAlarm(L, t);

    _drawWarnings(L, t);

    // Combo flash — virš visko

    _drawComboFlash(L, t);

    if (gameOver) drawGameOver(L);

    // Atstatyti shake translate

    if (_shakeX !== 0 || _shakeY !== 0) ctx.restore();

  }

  // ── Arena capacity indikatorius — kiek kamuoliukų iš MAX_BLOCKS ──

  // Pixel art ball icon + skaitliukas + chunky frame, lygiuotas su 0.5x zonos plokšte.

  function _drawArenaCapacity(L, t) {

    const used = blocks.length;

    const max = MAX_BLOCKS;

    const frac = used / max;

    const danger = frac > 0.80;

    const critical = frac > 0.92;

    // Pozicija — toj pačioj linijoj kaip 0.5x zonos plokštė

    const barW = 130, barH = _F12_PLAQUE_H;

    const bx = L.arena.x + 10;

    const by = L.arena.y + _F12_PLAQUE_TOP;

    const PX = 2;

    // ── OUTER PIXEL FRAME — chunky pixel art rėmas (juodas outer + rudas mid + auksinis highlight) ──

    // Drop shadow

    ctx.fillStyle = 'rgba(0,0,0,0.55)';

    ctx.fillRect(bx + 2, by + 2, barW, barH);

    // Outer black outline

    ctx.fillStyle = '#000';

    ctx.fillRect(bx, by, barW, barH);

    // Pixel rounded corners (2px cut)

    ctx.clearRect(bx, by, PX, PX);

    ctx.clearRect(bx + barW - PX, by, PX, PX);

    ctx.clearRect(bx, by + barH - PX, PX, PX);

    ctx.clearRect(bx + barW - PX, by + barH - PX, PX, PX);

    // Wood inner frame

    ctx.fillStyle = '#3a2410';

    ctx.fillRect(bx + PX, by + PX, barW - PX*2, barH - PX*2);

    // Top brass highlight stripe

    ctx.fillStyle = '#d4a050';

    ctx.fillRect(bx + PX, by + PX, barW - PX*2, 1);

    ctx.fillStyle = '#7a5a3a';

    ctx.fillRect(bx + PX, by + PX + 1, barW - PX*2, 1);

    // Bottom shadow stripe

    ctx.fillStyle = '#1a0e06';

    ctx.fillRect(bx + PX, by + barH - PX - 1, barW - PX*2, 1);

    // Brass corner rivets

    ctx.fillStyle = '#a87830';

    ctx.fillRect(bx + PX*2, by + PX*2, PX, PX);

    ctx.fillRect(bx + barW - PX*3, by + PX*2, PX, PX);

    ctx.fillRect(bx + PX*2, by + barH - PX*3, PX, PX);

    ctx.fillRect(bx + barW - PX*3, by + barH - PX*3, PX, PX);

    ctx.fillStyle = '#ffe7a8';

    ctx.fillRect(bx + PX*2, by + PX*2, 1, 1);             // highlight

    ctx.fillRect(bx + barW - PX*3, by + PX*2, 1, 1);

    // ── BALL ICON (kairėj — pixel art mažas burbulas) ──

    const iconCx = bx + 11, iconCy = by + barH / 2;

    const iconR = 5;

    // Sphere shading (3 bands)

    for (let dy = -iconR; dy <= iconR; dy++) {

      for (let dx = -iconR; dx <= iconR; dx++) {

        const d = Math.sqrt(dx*dx + dy*dy);

        if (d > iconR) continue;

        const edgeK = d / iconR;

        let cs;

        if (edgeK < 0.30) cs = '#ffeb99';        // top highlight

        else if (edgeK < 0.65) cs = '#e89c2e';   // mid orange (matching arrow ball)

        else cs = '#8a5018';                      // dark edge

        ctx.fillStyle = cs;

        ctx.fillRect(Math.round(iconCx + dx), Math.round(iconCy + dy), 1, 1);

      }

    }

    // Specular highlight

    ctx.fillStyle = '#ffffff';

    ctx.fillRect(iconCx - 2, iconCy - 2, 1, 1);

    ctx.fillRect(iconCx - 1, iconCy - 2, 1, 1);

    ctx.fillRect(iconCx - 2, iconCy - 1, 1, 1);

    // ── PROGRESS BAR (dešiniau nuo ikonos) ──

    const barInnerX = bx + 22;

    const barInnerY = by + 5;

    const barInnerW = barW - 28;

    const barInnerH = barH - 10;

    // Dark fill area

    ctx.fillStyle = '#0a0604';

    ctx.fillRect(barInnerX, barInnerY, barInnerW, barInnerH);

    // Color picking

    let r, g, b;

    if (frac < 0.5)       { r = 90;  g = 200; b = 90; }

    else if (frac < 0.80) { r = 255; g = 200; b = 60; }

    else                  { r = 255; g = 80;  b = 60; }

    const fillW = Math.round(barInnerW * frac);

    if (fillW > 0) {

      const darkR = Math.max(0, r - 60), darkG = Math.max(0, g - 60), darkB = Math.max(0, b - 60);

      const lightR = Math.min(255, r + 50), lightG = Math.min(255, g + 50), lightB = Math.min(255, b + 50);

      ctx.fillStyle = `rgb(${darkR},${darkG},${darkB})`;

      ctx.fillRect(barInnerX, barInnerY + Math.floor(barInnerH * 2 / 3), fillW, Math.ceil(barInnerH / 3));

      ctx.fillStyle = `rgb(${r},${g},${b})`;

      ctx.fillRect(barInnerX, barInnerY + Math.floor(barInnerH / 3), fillW, Math.floor(barInnerH / 3));

      ctx.fillStyle = `rgb(${lightR},${lightG},${lightB})`;

      ctx.fillRect(barInnerX, barInnerY, fillW, Math.floor(barInnerH / 3));

      ctx.fillStyle = 'rgba(255,255,255,0.45)';

      ctx.fillRect(barInnerX, barInnerY, fillW, 1);

    }

    // ── SKAITLIUKAS centruotas ant bar (be pulse — pakanka raudonos spalvos) ──

    ctx.font = 'bold 9px "Press Start 2P", monospace';

    ctx.textAlign = 'center';

    const txt = used + ' / ' + max;

    const tx = barInnerX + barInnerW / 2, ty = barInnerY + barInnerH / 2 + 3;

    ctx.fillStyle = '#000';

    ctx.fillText(txt, tx - 1, ty);

    ctx.fillText(txt, tx + 1, ty);

    ctx.fillText(txt, tx, ty - 1);

    ctx.fillText(txt, tx, ty + 1);

    ctx.fillStyle = critical ? '#fff' : (danger ? '#fff8a0' : '#e8e8d8');

    ctx.fillText(txt, tx, ty);

    ctx.textAlign = 'left';

  }

  // ── Juice render funkcijos ──────────────────────────────────────────

  function _drawMergeRings(L, t) {

    if (!_f12MergeRings.length) return;

    const PX = 2;

    const snap = (v) => Math.round(v / PX) * PX;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (let i = _f12MergeRings.length - 1; i >= 0; i--) {

      const r = _f12MergeRings[i];

      const k = (t - r.born) / 700;

      if (k >= 1) { _f12MergeRings.splice(i, 1); continue; }

      const tier = Math.log2(r.value);

      const baseR = 40 + tier * 20;

      const eased = 1 - Math.pow(1 - k, 3);

      const radius = snap(baseR * eased);

      const alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;

      const c = r.color;

      const cx = snap(r.x), cy = snap(r.y);

      const cTop = `rgba(${c.top[0]},${c.top[1]},${c.top[2]},${alpha})`;

      const cFront = `rgba(${c.front[0]},${c.front[1]},${c.front[2]},${alpha})`;

      const cLeft = `rgba(${c.left[0]},${c.left[1]},${c.left[2]},${alpha})`;

      if (k < 0.22) {

        const fk = k / 0.22;

        ctx.fillStyle = `rgba(255,255,255,${1 - fk})`;

        const sz = snap((10 + tier * 4) * (1 - fk * 0.7));

        ctx.fillRect(cx - sz, cy - sz, sz * 2, sz * 2);

      }

      const seed = r.born * 0.001;

      const type = r.type;

      if (type === 'arrow') {

        for (let a = 0; a < 8; a++) {

          const ang = a * (Math.PI / 4) + seed;

          const dxP = Math.cos(ang), dyP = Math.sin(ang);

          const ex = snap(cx + dxP * radius);

          const ey = snap(cy + dyP * radius);

          ctx.fillStyle = cTop;

          for (let pp = 0; pp < 7; pp++) ctx.fillRect(snap(ex - dxP * pp * PX), snap(ey - dyP * pp * PX), PX, PX);

          ctx.fillStyle = '#fff';

          ctx.fillRect(ex - PX, ey - PX, PX*2, PX*2);

          const fx = snap(ex - dxP * 7 * PX), fy = snap(ey - dyP * 7 * PX);

          ctx.fillStyle = cLeft;

          ctx.fillRect(snap(fx - dyP * PX*2), snap(fy + dxP * PX*2), PX, PX);

          ctx.fillRect(snap(fx + dyP * PX*2), snap(fy - dxP * PX*2), PX, PX);

        }

      } else if (type === 'shield') {

        for (let h = 0; h < 6; h++) {

          const ang1 = h * (Math.PI / 3), ang2 = (h + 1) * (Math.PI / 3);

          const x1 = cx + Math.cos(ang1) * radius, y1 = cy + Math.sin(ang1) * radius;

          const x2 = cx + Math.cos(ang2) * radius, y2 = cy + Math.sin(ang2) * radius;

          ctx.fillStyle = cTop;

          for (let pp = 0; pp < 7; pp++) {

            const tt = pp / 6;

            ctx.fillRect(snap(x1 + (x2-x1)*tt), snap(y1 + (y2-y1)*tt), PX*2, PX*2);

          }

        }

        ctx.fillStyle = '#fff';

        for (let h = 0; h < 6; h++) {

          const ang = h * (Math.PI / 3);

          const hx = snap(cx + Math.cos(ang) * radius);

          const hy = snap(cy + Math.sin(ang) * radius);

          ctx.fillRect(hx - PX, hy - PX, PX*2, PX*2);

        }

      } else if (type === 'heart') {

        for (let h = 0; h < 6; h++) {

          const ang = h * (Math.PI / 3) + seed * 2;

          const hx = snap(cx + Math.cos(ang) * radius);

          const hy = snap(cy + Math.sin(ang) * radius - eased * 10);

          ctx.fillStyle = cTop;

          ctx.fillRect(hx - PX*2, hy - PX, PX, PX);

          ctx.fillRect(hx + PX, hy - PX, PX, PX);

          ctx.fillRect(hx - PX*2, hy, PX*5, PX);

          ctx.fillRect(hx - PX, hy + PX, PX*3, PX);

          ctx.fillRect(hx, hy + PX*2, PX, PX);

          ctx.fillStyle = '#fff';

          ctx.fillRect(hx - PX, hy - PX, PX, PX);

        }

      } else if (type === 'leaf') {

        for (let v = 0; v < 6; v++) {

          const baseAng = v * (Math.PI / 3) + seed;

          let curX = cx, curY = cy;

          const segLen = radius / 3;

          for (let seg = 0; seg < 3; seg++) {

            const wobble = Math.sin(seg * 1.7 + v * 2.3) * 0.4;

            const segAng = baseAng + wobble;

            const endX = snap(curX + Math.cos(segAng) * segLen);

            const endY = snap(curY + Math.sin(segAng) * segLen);

            const thickness = seg === 0 ? PX*2 : PX;

            ctx.fillStyle = seg < 2 ? cTop : cFront;

            for (let pp = 0; pp < 5; pp++) {

              const tt = pp / 5;

              ctx.fillRect(snap(curX + (endX - curX) * tt) - thickness/2, snap(curY + (endY - curY) * tt) - thickness/2, thickness, thickness);

            }

            curX = endX; curY = endY;

          }

          ctx.fillStyle = cTop;

          ctx.fillRect(curX - PX*2, curY - PX*2, PX*4, PX*4);

          ctx.fillRect(curX - PX, curY - PX*3, PX*2, PX*6);

          ctx.fillStyle = cLeft;

          ctx.fillRect(curX, curY - PX, PX, PX*2);

        }

      } else if (type === 'star') {

        for (let s = 0; s < 5; s++) {

          const ang = s * (Math.PI * 2 / 5) - Math.PI / 2 + seed;

          ctx.fillStyle = cTop;

          for (let pp = 0; pp < radius; pp += PX*2) {

            ctx.fillRect(snap(cx + Math.cos(ang) * pp), snap(cy + Math.sin(ang) * pp), PX, PX);

          }

          const ex = snap(cx + Math.cos(ang) * radius);

          const ey = snap(cy + Math.sin(ang) * radius);

          ctx.fillStyle = '#fff5c0';

          ctx.fillRect(ex - PX, ey - PX, PX*2, PX*2);

        }

        ctx.fillStyle = cFront;

        for (let s = 0; s < 5; s++) {

          const ang = s * (Math.PI * 2 / 5) - Math.PI / 2 + Math.PI / 5 + seed;

          const mid = radius * 0.55;

          for (let pp = 0; pp < mid; pp += PX*2) {

            ctx.fillRect(snap(cx + Math.cos(ang) * pp), snap(cy + Math.sin(ang) * pp), PX, PX);

          }

        }

      } else if (type === 'crystal') {

        for (let s = 0; s < 6; s++) {

          const baseAng = s * (Math.PI / 3) + seed;

          let curX = cx, curY = cy;

          const segLen = radius / 3;

          for (let seg = 0; seg < 3; seg++) {

            const zigSign = ((s * 7 + seg * 11) % 2 === 0) ? 1 : -1;

            const segAng = baseAng + zigSign * 0.55;

            const endX = snap(curX + Math.cos(segAng) * segLen);

            const endY = snap(curY + Math.sin(segAng) * segLen);

            const thickness = seg === 0 ? PX*2 : PX;

            ctx.fillStyle = seg < 2 ? cTop : cFront;

            for (let pp = 0; pp < 8; pp++) {

              const tt = pp / 8;

              const ix = snap(curX + (endX - curX) * tt);

              const iy = snap(curY + (endY - curY) * tt);

              ctx.fillRect(ix - thickness/2, iy - thickness/2, thickness, thickness);

            }

            curX = endX; curY = endY;

          }

          ctx.fillStyle = '#fff';

          ctx.fillRect(curX - PX, curY - PX, PX*2, PX*2);

        }

      } else if (type === 'shadow') {

        for (let v = 0; v < 14; v++) {

          const ang = v * (Math.PI * 2 / 14) + k * Math.PI * 2;

          const dist = radius * (0.5 + ((v * 0.1) % 0.5));

          const sx = snap(cx + Math.cos(ang) * dist);

          const sy = snap(cy + Math.sin(ang) * dist);

          ctx.fillStyle = `rgba(40,40,55,${alpha * 0.85})`;

          ctx.fillRect(sx - PX*2, sy - PX*2, PX*4, PX*4);

          ctx.fillStyle = `rgba(15,12,22,${alpha})`;

          ctx.fillRect(sx - PX, sy - PX, PX*2, PX*2);

        }

        const voidR = snap(8 + tier * 3);

        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.8})`;

        ctx.fillRect(cx - voidR, cy - voidR, voidR*2, voidR*2);

      } else if (type === 'pearl') {

        ctx.fillStyle = cTop;

        for (let v = 0; v < 14; v++) {

          const ang = v * (Math.PI * 2 / 14);

          const sx = snap(cx + Math.cos(ang) * radius);

          const sy = snap(cy + Math.sin(ang) * radius);

          ctx.fillRect(sx - PX, sy - PX, PX*2, PX*2);

        }

        const innerR = snap(radius * 0.6);

        ctx.fillStyle = cFront;

        for (let v = 0; v < 10; v++) {

          const ang = v * (Math.PI * 2 / 10) + Math.PI / 10;

          const sx = snap(cx + Math.cos(ang) * innerR);

          const sy = snap(cy + Math.sin(ang) * innerR);

          ctx.fillRect(sx - PX/2, sy - PX/2, PX, PX);

        }

        ctx.fillStyle = '#fff';

        for (let p = 0; p < 4; p++) {

          const ang = p * (Math.PI / 2) + seed;

          const sx = snap(cx + Math.cos(ang) * radius * 1.15);

          const sy = snap(cy + Math.sin(ang) * radius * 1.15);

          ctx.fillRect(sx - PX, sy, PX, PX);

          ctx.fillRect(sx, sy - PX, PX, PX);

          ctx.fillRect(sx + PX, sy, PX, PX);

          ctx.fillRect(sx, sy + PX, PX, PX);

        }

      } else if (type === 'frost') {

        // RONIN LOGO merge effektas — mėlynas pliūpsnis + baltas R-skydas

        // 1) Burst ring — mėlyni pixel chunkai sklinda į išorę

        ctx.fillStyle = cTop;

        for (let v = 0; v < 12; v++) {

          const ang = v * (Math.PI * 2 / 12) + seed;

          const sx = snap(cx + Math.cos(ang) * radius);

          const sy = snap(cy + Math.sin(ang) * radius);

          ctx.fillRect(sx - PX, sy - PX, PX * 2, PX * 2);

        }

        // 2) Mėlynas diskas — logo fonas (kaip screenshot'e)

        // SVARBU: ctx.arc su neigiamu radius meta exception → clamp'inam

        const discR = Math.max(0, (12 + tier * 7) * eased);

        if (discR > 0.5) {

          ctx.fillStyle = `rgba(${c.front[0]},${c.front[1]},${c.front[2]},${alpha})`;

          ctx.beginPath();

          ctx.arc(cx, cy, discR, 0, Math.PI * 2);

          ctx.fill();

          // Šviesesnis vidinis žiedas (tik jei pakankamai didelis)

          if (discR > PX + 0.5) {

            ctx.strokeStyle = `rgba(${c.top[0]},${c.top[1]},${c.top[2]},${alpha})`;

            ctx.lineWidth = PX;

            ctx.beginPath();

            ctx.arc(cx, cy, discR - PX, 0, Math.PI * 2);

            ctx.stroke();

          }

        }

        // 3) Baltas R-skydas (Ronin logo) ant viršaus — scale + fade su merge animacija

        if (discR > 0.5 && _frostLogoImg.complete && _frostLogoImg.naturalWidth > 0) {

          const logoH = snap(discR * 1.9);

          const logoW = snap(logoH * _frostLogoImg.naturalWidth / _frostLogoImg.naturalHeight);

          ctx.globalAlpha = alpha;

          ctx.drawImage(_frostLogoImg, snap(cx - logoW / 2), snap(cy - logoH / 2), logoW, logoH);

          ctx.globalAlpha = 1;

        }

      } else {

        ctx.fillStyle = cTop;

        ctx.fillRect(cx - radius, cy - PX, radius * 2, PX * 2);

        ctx.fillRect(cx - PX, cy - radius, PX * 2, radius * 2);

      }

    }

    ctx.restore();

  }

  function _drawMergePopups(L, t) {

    if (!_f12MergePopups.length) return;

    ctx.save();

    for (let i = _f12MergePopups.length - 1; i >= 0; i--) {

      const p = _f12MergePopups[i];

      const k = (t - p.born) / 900;

      if (k >= 1) { _f12MergePopups.splice(i, 1); continue; }

      const eased = 1 - Math.pow(1 - k, 2);

      const y = p.y - eased * 50;

      const alpha = 1 - k;

      const scale = k < 0.04 ? 1 + (1 - k / 0.04) * 0.6 : 1;

      ctx.font = `bold ${Math.round(14 * scale)}px "Press Start 2P", monospace`;

      ctx.textAlign = 'center';

      // Tamsi outline (juodas)

      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.9})`;

      ctx.fillText(p.text, p.x + 2, y + 2);

      // Spalvotas tekstas

      ctx.fillStyle = p.color.replace(')', `,${alpha})`).replace('rgb', 'rgba');

      ctx.fillText(p.text, p.x, y);

    }

    ctx.restore();

  }

  // ── PERFECT title popup — chain-aware (PERFECT! / RONKE STRONKE / INSANE / GOD TIER) ──

  function _drawPerfectPopups(L, t) {

    if (!_f12PerfectPopups.length) return;

    const DUR = 1500;

    ctx.save();

    for (let i = _f12PerfectPopups.length - 1; i >= 0; i--) {

      const p = _f12PerfectPopups[i];

      const age = t - p.born;

      if (age >= DUR) { _f12PerfectPopups.splice(i, 1); continue; }

      const k = age / DUR;

      const chainLevel = p.chainLevel || 1;

      // Visi chain'ai turi vienoda magnitude (kaip PERFECT) — keičiasi tik tekstas + spalva

      const peakScale = 1.65;

      let scale;

      if (k < 0.18) {

        const pp = k / 0.18;

        scale = 0.3 + (peakScale - 0.3) * (1 - Math.pow(1 - pp, 3));

      } else if (k < 0.34) {

        const pp = (k - 0.18) / 0.16;

        scale = peakScale - (peakScale - 1.0) * pp;

      } else {

        scale = 1.0;

      }

      const riseK = Math.min(1, k / 0.9);

      const yOff = -(1 - Math.pow(1 - riseK, 2.2)) * 30;

      let alpha;

      if (k < 0.10) alpha = k / 0.10;

      else if (k < 0.72) alpha = 1.0;

      else alpha = 1 - (k - 0.72) / 0.28;

      alpha = Math.max(0, Math.min(1, alpha));

      const cx = p.x;

      const cy = p.y - 28 + yOff;

      const [fR, fG, fB] = p.fillCol;

      const [gR, gG, gB] = p.glowCol;

      ctx.save();

      ctx.translate(cx, cy);

      ctx.scale(scale, scale);

      // Glow halo (vienodas dydis visiems chain'ams, keičiasi tik spalva)

      const haloR = 32;

      const glowAlpha = alpha * 0.6;

      if (glowAlpha > 0.05) {

        const grad = ctx.createRadialGradient(0, -3, 0, 0, -3, haloR);

        grad.addColorStop(0, `rgba(${gR},${gG},${gB},${glowAlpha})`);

        grad.addColorStop(0.5, `rgba(${Math.round(gR*0.85)},${Math.round(gG*0.7)},${Math.round(gB*0.5)},${glowAlpha * 0.4})`);

        grad.addColorStop(1, 'rgba(60,30,0,0)');

        ctx.fillStyle = grad;

        ctx.beginPath();

        ctx.arc(0, -3, haloR, 0, Math.PI * 2);

        ctx.fill();

      }

      // Sparkle burst (vienodas visiems chain'ams)

      if (k < 0.32) {

        const sparkP = k / 0.32;

        const sparkR = 12 + sparkP * 22;

        const sparkAlpha = (1 - sparkP) * alpha;

        const sparkCount = 12;

        ctx.fillStyle = `rgba(${gR},${gG},${gB},${sparkAlpha})`;

        for (let s = 0; s < sparkCount; s++) {

          const ang = (s / sparkCount) * Math.PI * 2 + p.born * 0.0012;

          const sx = Math.cos(ang) * sparkR;

          const sy = Math.sin(ang) * sparkR - 3;

          ctx.fillRect(Math.round(sx - 1), Math.round(sy - 1), 2, 2);

        }

      }

      // Text — visiems chain'ams vienodas dydis (kaip PERFECT)

      const fontSize = 14;

      ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`;

      ctx.textAlign = 'center';

      const title = p.title;

      // Drop shadow

      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.7})`;

      ctx.fillText(title, 0, 3);

      // Outline (4 dirs)

      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.95})`;

      ctx.fillText(title, 1, 0);

      ctx.fillText(title, -1, 0);

      ctx.fillText(title, 0, 1);

      ctx.fillText(title, 0, -1);

      // Fill (chain color)

      ctx.fillStyle = `rgba(${fR},${fG},${fB},${alpha})`;

      ctx.fillText(title, 0, 0);

      // Top white shimmer highlight

      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.65})`;

      ctx.fillText(title, 0, -1);

      // CHAIN counter prie titulo (mažas „×N CHAIN" žemiau, jei chain ≥ 2)

      if (chainLevel >= 2) {

        ctx.font = `bold 8px "Press Start 2P", monospace`;

        const chainTxt = '×' + chainLevel + ' CHAIN';

        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.9})`;

        ctx.fillText(chainTxt, 1, fontSize + 2);

        ctx.fillText(chainTxt, -1, fontSize + 2);

        ctx.fillStyle = `rgba(${fR},${fG},${fB},${alpha * 0.9})`;

        ctx.fillText(chainTxt, 0, fontSize + 2);

      }

      ctx.restore();

    }

    ctx.restore();

  }

  function _drawMuzzleFlashes(L, t) {

    if (!_f12MuzzleFlashes.length) return;

    const PX = 2;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (let i = _f12MuzzleFlashes.length - 1; i >= 0; i--) {

      const f = _f12MuzzleFlashes[i];

      const k = (t - f.born) / f.duration;

      if (k >= 1) { _f12MuzzleFlashes.splice(i, 1); continue; }

      const alpha = 1 - k;

      const tier = f.power;  // 0-1

      // 3 layered pixel chunks oriented along ang

      const cosA = Math.cos(f.ang), sinA = Math.sin(f.ang);

      const baseR = 8 + tier * 12;

      const fx = Math.round(f.x / PX) * PX;

      const fy = Math.round(f.y / PX) * PX;

      // Core bright white spot

      const coreR = Math.round((baseR * (1 - k * 0.3)) / PX) * PX;

      ctx.fillStyle = `rgba(255,255,200,${alpha * 0.9})`;

      ctx.fillRect(fx - coreR, fy - coreR/2, coreR*2, coreR);

      ctx.fillRect(fx - coreR/2, fy - coreR, coreR, coreR*2);

      // Orange ring outside

      const ringR = Math.round((baseR * 1.3 * (1 - k * 0.2)) / PX) * PX;

      ctx.fillStyle = `rgba(255,150,40,${alpha * 0.85})`;

      // Cross arms

      ctx.fillRect(fx - ringR, fy - PX, ringR*2, PX*2);

      ctx.fillRect(fx - PX, fy - ringR, PX*2, ringR*2);

      // Forward spike — barrel kryptimi ilgesnis blyksis

      const spikeLen = Math.round((baseR * 2.2 * (1 - k)) / PX) * PX;

      ctx.fillStyle = `rgba(255,240,160,${alpha})`;

      for (let ss = 0; ss < spikeLen; ss += PX) {

        const sx = Math.round((fx + cosA * ss) / PX) * PX;

        const sy = Math.round((fy + sinA * ss) / PX) * PX;

        const w = Math.max(PX, PX * (1 - ss / spikeLen) * 3);

        ctx.fillRect(sx - w/2, sy - w/2, w, w);

      }

      // 6 random outer sparks

      const seed = f.born * 0.001;

      for (let p = 0; p < 6; p++) {

        const sang = f.ang + (((seed * 7 + p) % 1) - 0.5) * 1.2;

        const sd = (baseR * 1.5) + (((seed * 11 + p * 3) % 1) * baseR * 1.2);

        const sx = Math.round((fx + Math.cos(sang) * sd) / PX) * PX;

        const sy = Math.round((fy + Math.sin(sang) * sd) / PX) * PX;

        ctx.fillStyle = `rgba(255,180,80,${alpha * 0.7})`;

        ctx.fillRect(sx - PX, sy - PX, PX*2, PX*2);

      }

    }

    ctx.restore();

  }

  function _drawFireSmoke(L, t) {

    if (!_f12FireSmoke.length) return;

    const PX = 2;

    const dts = 0.016;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (let i = _f12FireSmoke.length - 1; i >= 0; i--) {

      const s = _f12FireSmoke[i];

      const k = (t - s.born) / s.duration;

      if (k >= 1) { _f12FireSmoke.splice(i, 1); continue; }

      // Simuliacija

      s.x += s.vx * dts;

      s.y += s.vy * dts;

      s.vx *= 0.96; s.vy *= 0.96;

      s.vy -= 30 * dts;  // smoke kyla aukštyn (negative gravity)

      const alpha = (1 - k) * 0.75;

      const grow = 1 + k * 1.5;

      const sz = Math.max(PX, Math.round((s.size * grow) / PX) * PX);

      const sx = Math.round(s.x / PX) * PX;

      const sy = Math.round(s.y / PX) * PX;

      // Gray pixel chunk (smoke)

      const gray = 80 + Math.round(k * 100);   // 80→180

      ctx.fillStyle = `rgba(${gray},${gray},${gray},${alpha})`;

      ctx.fillRect(sx - sz, sy - sz, sz*2, sz*2);

      // Center darker pixel

      ctx.fillStyle = `rgba(${gray-30},${gray-30},${gray-30},${alpha})`;

      ctx.fillRect(sx - PX, sy - PX, PX*2, PX*2);

    }

    ctx.restore();

  }

  // ── Wall chips — pixel akmens skeveldros nuo sienos kai daromas dmg ──

  function _drawWallChips(L, t) {

    if (!_f12WallChips.length) return;

    const PX = 2;

    const dts = 0.016;

    const G = 620;                  // gravitacija

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (let i = _f12WallChips.length - 1; i >= 0; i--) {

      const c = _f12WallChips[i];

      const k = (t - c.born) / c.duration;

      if (k >= 1) { _f12WallChips.splice(i, 1); continue; }

      // Simuliacija

      c.x += c.vx * dts;

      c.y += c.vy * dts;

      c.vy += G * dts;              // krenta žemyn

      c.vx *= 0.985;                // oro pasipriešinimas

      const alpha = 1 - k * k;      // fade-out (greitėja pabaigoj)

      const sz = c.size * PX;

      const sx = Math.round(c.x / PX) * PX;

      const sy = Math.round(c.y / PX) * PX;

      // Akmens skeveldra — kūnas + tamsi briauna

      ctx.globalAlpha = alpha;

      ctx.fillStyle = c.col;

      ctx.fillRect(sx, sy, sz, sz);

      ctx.fillStyle = '#1a0e06';

      ctx.fillRect(sx, sy + sz - PX, sz, PX);   // apatinė tamsi briauna

      ctx.fillStyle = 'rgba(255,255,255,0.3)';

      ctx.fillRect(sx, sy, PX, PX);             // viršutinis highlight

    }

    ctx.globalAlpha = 1;

    ctx.restore();

  }

  // ── AMBIENT ATMOSFERA: vėjas, rūkas, varnos ─────────────────────────

  function _drawAmbientWind(L, t) {

    const PX = 2;

    const dts = 0.016;

    _updateWindState(t);

    const wvx = _f12WindState.vx, wvy = _f12WindState.vy;

    const wMag = Math.hypot(wvx, wvy);

    const wAng = Math.atan2(wvy, wvx);

    // ── ARENA BOUNDS — vėjas TIK arenos plote (ne per visą ekraną) ──

    const aX = L.arena.x, aY = L.arena.y;

    const aW = L.arena.w, aH = L.arena.h;

    const aRight = aX + aW, aBot = aY + aH;

    // ── CALM GATE — kai vėjo nėra, jokie spawn'ai nevyksta ─

    const CALM_THRESHOLD = 8;     // px/s — žemiau šio nieks naujo nespawn'inama

    const isCalm = wMag < CALM_THRESHOLD;

    // Particle spawn intensity priklauso nuo vėjo stiprumo (kai calm = 0)

    const spawnChance = isCalm ? 0 : Math.min(0.85, wMag / 130);

    // ── DUST PARTICLES (sumažintas kiekis — pagrindinis vizualas dabar vortexai) ─

    const _DUST_CAP = _IS_MOBILE ? 8 : 40;     // mobile drastically reduced

    if (!isCalm && _f12Wind.length < _DUST_CAP && Math.random() < spawnChance) {

      let sx, sy;

      // 35% vidury (užpildo arena), 65% nuo UPWIND krašto (clear directional flow)

      if (Math.random() < 0.35) {

        sx = aX + Math.random() * aW;

        sy = aY + Math.random() * aH;

      } else if (Math.abs(wvx) > Math.abs(wvy)) {

        sx = wvx < 0 ? aRight + 8 : aX - 8;

        sy = aY + Math.random() * aH;

      } else {

        sx = aX + Math.random() * aW;

        sy = wvy < 0 ? aBot + 8 : aY - 8;

      }

      // VISUAL_MULT — particle juda greičiau nei wind state (kad atrodytų kaip realus oro srautas)

      // Wind state magnitude 60-130 px/s (physics), particle visual 4.5x = 270-585 px/s

      // Tai panašiau į ball flight speed (380-1500 px/s) — atrodo dinamiškai

      const VISUAL_MULT = 4.5;

      const jitter = 25;

      const _vx = (wvx + (Math.random() - 0.5) * jitter) * VISUAL_MULT;

      const _vy = (wvy + (Math.random() - 0.5) * jitter * 0.6) * VISUAL_MULT;

      _f12Wind.push({

        x: sx, y: sy,

        vx: _vx, vy: _vy,

        size: PX * (1 + Math.floor(Math.random() * 2)),

        life: 0,

        maxLife: 0.8 + Math.random() * 1.5,

        col: Math.random() < 0.5

          ? [220, 200, 160]

          : [160, 130, 95],

        alpha: 0.5 + Math.random() * 0.45,

        // Greitas response — particle decisively seka wind direction (ne lingers)

        lag: 0.08 + Math.random() * 0.10,             // 0.08-0.18 (anksčiau 0.015-0.09 = chaotiška)

        noiseT: Math.random() * Math.PI * 2,

        noiseFreq: 0.7 + Math.random() * 1.8,

        noiseAmp: 5 + Math.random() * 10,

      });

    }

    // ── WIND STREAKS (mažas kiekis — duoda direction cues) ─

    const streakSpawnChance = isCalm ? 0 : Math.min(0.5, wMag / 250);

    const _STREAK_CAP = _IS_MOBILE ? 2 : 12;   // mobile: barely any (kiekvienas turi trail+stroke = brangu)

    if (!isCalm && _f12WindStreaks.length < _STREAK_CAP && Math.random() < streakSpawnChance) {

      // 25% vidury, 75% nuo UPWIND krašto — streak'ai aiškiai parodo kryptį

      let sx, sy;

      const margin = 30;

      if (Math.random() < 0.25) {

        sx = aX + Math.random() * aW;

        sy = aY + Math.random() * aH;

      } else if (Math.abs(wvx) > Math.abs(wvy)) {

        sx = wvx < 0 ? aRight + margin : aX - margin;

        sy = aY + Math.random() * aH;

      } else {

        sx = aX + Math.random() * aW;

        sy = wvy < 0 ? aBot + margin : aY - margin;

      }

      // Streaks juda dar greičiau — STREAK_MULT 7x = 420-910 px/s, panašiau į gust whoosh per arena

      const STREAK_MULT = 7.0;

      const speedMult = 0.9 + Math.random() * 0.3;

      const _svx = wvx * STREAK_MULT * speedMult;

      const _svy = wvy * STREAK_MULT * speedMult;

      _f12WindStreaks.push({

        x: sx, y: sy,

        vx: _svx, vy: _svy,

        life: 0,

        maxLife: 0.7 + Math.random() * 0.9,            // ilgiau (kad trail spėtų užaugti)

        bright: 0.55 + Math.random() * 0.4,

        lag: 0.10 + Math.random() * 0.10,             // 0.10-0.20 — streak decisively kreipiasi

        // TRAIL — position history, leidžia lanksčiam curve (kaip ball trail)

        trail: [{ x: sx, y: sy }],

        maxTrailLen: 10 + Math.floor(Math.random() * 8),   // 10-17 trail points

        trailEveryFrame: 1,                              // kas frame'ą saugom poziciją

      });

    }

    // ── WIND VORTEXES (mini suktukai — gražūs trumpi spiralės wisp'ai) ──

    // Mažesni, trumpesni — atrodo kaip greiti vėjo sūkuriukai, ne magic field

    const vortexInterval = wMag > 80 ? 500 + Math.random() * 700 : 1100 + Math.random() * 1400;

    const _VORTEX_CAP = _IS_MOBILE ? 0 : 6;     // SKIP visu vortexes mobile (per daug ctx.stroke ops)

    if (wMag > 35 && _f12WindVortexes.length < _VORTEX_CAP && (t - _f12LastVortexAt) > vortexInterval) {

      _f12LastVortexAt = t;

      const vcx = aX + 30 + Math.random() * (aW - 60);

      const vcy = aY + 30 + Math.random() * (aH - 60);

      const vRadius = 8 + Math.random() * 12;          // SUMAŽINTAS: 8-20px (buvo 16-38)

      const spinDir = Math.random() < 0.5 ? 1 : -1;

      _f12WindVortexes.push({

        cx: vcx, cy: vcy,

        vx: wvx * 2.0 * (0.7 + Math.random() * 0.6),

        vy: wvy * 2.0 * (0.7 + Math.random() * 0.6),

        spin: spinDir * (7.0 + Math.random() * 5.0),   // greitesnis sukimasis (7-12 rad/s)

        baseAng: Math.random() * Math.PI * 2,

        radius: vRadius,

        life: 0,

        maxLife: 0.55 + Math.random() * 0.5,           // TRUMPAI: 0.55-1.05s (buvo 1.8-3.8)

        arms: 2 + Math.floor(Math.random() * 2),

        bright: 0.6 + Math.random() * 0.35,

      });

    }

    // ── WIND DEBRIS (lapai/šakelės) — MATOMI nuolat per arena ──

    const _DEBRIS_CAP = _IS_MOBILE ? 3 : 12;

    const _DEBRIS_THROTTLE = _IS_MOBILE ? 1500 : 400;

    if (wMag > 40 && _f12WindDebris.length < _DEBRIS_CAP && (t - _f12LastDebrisAt) > _DEBRIS_THROTTLE + Math.random() * 900) {

      _f12LastDebrisAt = t;

      // 50% spawn vidury arenos (iškart matomi), 50% nuo krašto (entry effect)

      let sx, sy;

      if (Math.random() < 0.5) {

        sx = aX + 30 + Math.random() * (aW - 60);

        sy = aY + 30 + Math.random() * (aH - 60);

      } else if (Math.abs(wvx) > Math.abs(wvy)) {

        sx = wvx < 0 ? aRight + 18 : aX - 18;

        sy = aY + Math.random() * aH;

      } else {

        sx = aX + Math.random() * aW;

        sy = wvy < 0 ? aBot + 18 : aY - 18;

      }

      // Skirtinga sudėtis pagal stiprumą — kuo stipresnis vėjas, tuo daugiau šakų:

      // CALM/BREEZE (mag<70): 75% leaf, 20% twig, 5% branch

      // GUST (70-100): 50% leaf, 38% twig, 12% branch

      // STORM (>100): 30% leaf, 50% twig, 20% branch

      let leafProb, twigProb;

      if (wMag > 100)      { leafProb = 0.30; twigProb = 0.50; }

      else if (wMag > 70)  { leafProb = 0.50; twigProb = 0.38; }

      else                 { leafProb = 0.75; twigProb = 0.20; }

      const r = Math.random();

      const kind = r < leafProb ? 'leaf' : (r < leafProb + twigProb ? 'twig' : 'branch');

      const dMult = kind === 'leaf' ? 5.0 : (kind === 'twig' ? 4.2 : 3.5);   // branch sunkiausia

      const dvx = wvx * dMult * (0.9 + Math.random() * 0.3);

      const dvy = wvy * dMult * (0.9 + Math.random() * 0.3) + (Math.random() - 0.5) * 40;

      // Lapų paletė — žali rudai ar vasariniai geltoni

      const leafPalettes = [

        { dark: '#3a5c2e', mid: '#5a8a3e', light: '#82b454', edge: '#1f2e15' },     // green

        { dark: '#5a3a18', mid: '#8a5a28', light: '#b88040', edge: '#2a1c0c' },     // brown autumn

        { dark: '#7a5a18', mid: '#b8902a', light: '#dab045', edge: '#3a2810' },     // yellow autumn

      ];

      _f12WindDebris.push({

        x: sx, y: sy,

        vx: dvx, vy: dvy,

        kind,

        rot: Math.random() * Math.PI * 2,

        // Branch sukasi lėčiau (sunkesnė), leaf sparčiai

        rotV: (Math.random() - 0.5) * (kind === 'branch' ? 2.5 : (kind === 'twig' ? 4.5 : 6.5)),

        life: 0,

        maxLife: 3.0 + Math.random() * 2.5,

        palette: kind === 'leaf' ? leafPalettes[Math.floor(Math.random() * leafPalettes.length)] : null,

      });

    }

    // ── RENDER STREAKS pirma (kad dust būtų virš) ─────────────

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    // CLIP į arenos bounds — visi particle/streaks už arenos nematomi

    ctx.beginPath();

    ctx.rect(aX, aY, aW, aH);

    ctx.clip();

    const tSec = t * 0.001;

    for (let i = _f12WindStreaks.length - 1; i >= 0; i--) {

      const s = _f12WindStreaks[i];

      // CURL NOISE — streak'as seka fluid wind field, ne tiesiai wind direction

      const [fvx, fvy] = _windFieldAt(s.x, s.y, t);

      const targetVx = fvx * 5.5;     // streak 5.5x field magnitude (fast)

      const targetVy = fvy * 5.5;

      s.vx += (targetVx - s.vx) * s.lag;

      s.vy += (targetVy - s.vy) * s.lag;

      s.x += s.vx * dts;

      s.y += s.vy * dts;

      s.life += dts * (isCalm ? 5 : 1);    // calm => fade 5x greičiau

      if (s.x < aX - 50 || s.x > aRight + 50 || s.y < aY - 50 || s.y > aBot + 50 || s.life > s.maxLife) {

        _f12WindStreaks.splice(i, 1); continue;

      }

      // Saugom position į trail (kas frame'ą — lankstus curve)

      s.trail.push({ x: s.x, y: s.y });

      if (s.trail.length > s.maxTrailLen) s.trail.shift();

      const fadeK = s.life / s.maxLife;

      let alpha;

      if (fadeK < 0.2) alpha = fadeK / 0.2;

      else if (fadeK < 0.7) alpha = 1.0;

      else alpha = 1 - (fadeK - 0.7) / 0.3;

      alpha *= s.bright;

      // ── LANKSTUS TRAIL — segmentai per istorinius taškus (curve seka actual path) ──

      if (s.trail.length >= 2) {

        ctx.lineCap = 'round';

        ctx.lineJoin = 'round';

        const N = s.trail.length;

        // Glow sluoksnis (storas, low alpha)

        ctx.strokeStyle = `rgba(255,240,200,${alpha * 0.18})`;

        ctx.lineWidth = 3;

        ctx.beginPath();

        ctx.moveTo(s.trail[0].x, s.trail[0].y);

        for (let k = 1; k < N; k++) ctx.lineTo(s.trail[k].x, s.trail[k].y);

        ctx.stroke();

        // Core sluoksnis — gradient per segments (uodega → galva)

        for (let k = 1; k < N; k++) {

          const tFrac = k / N;                              // 0 (oldest) → 1 (newest)

          const segA = alpha * Math.pow(tFrac, 0.7) * 0.95; // tail fades out

          if (segA < 0.04) continue;

          const segW = 0.6 + tFrac * 1.2;                   // tail thin, head storesnis

          // Color shift: uodega cooler, galva warmer

          const colR = Math.round(220 + tFrac * 35);

          const colG = Math.round(205 + tFrac * 35);

          const colB = Math.round(160 + tFrac * 40);

          ctx.strokeStyle = `rgba(${colR},${colG},${colB},${segA})`;

          ctx.lineWidth = segW;

          ctx.beginPath();

          ctx.moveTo(s.trail[k-1].x, s.trail[k-1].y);

          ctx.lineTo(s.trail[k].x, s.trail[k].y);

          ctx.stroke();

        }

        // Head bright dot

        const hx = Math.round(s.x), hy = Math.round(s.y);

        ctx.fillStyle = `rgba(255,250,220,${alpha})`;

        ctx.fillRect(hx - 1, hy - 1, 2, 2);

      }

    }

    // ── RENDER DUST PARTICLES (virš streaks) ──────────────────

    for (let i = _f12Wind.length - 1; i >= 0; i--) {

      const w = _f12Wind[i];

      // CURL NOISE — dust seka fluid wind field (organiškas judėjimas)

      const [fvx, fvy] = _windFieldAt(w.x, w.y, t);

      const targetVx = fvx * 3.8;

      const targetVy = fvy * 3.8;

      w.vx += (targetVx - w.vx) * w.lag;

      w.vy += (targetVy - w.vy) * w.lag;

      w.x += w.vx * dts;

      w.y += w.vy * dts;

      w.life += dts * (isCalm ? 5 : 1);    // calm => fade 5x greičiau

      if (w.x < aX - 20 || w.x > aRight + 20 || w.y < aY - 20 || w.y > aBot + 20 || w.life > w.maxLife) {

        _f12Wind.splice(i, 1); continue;

      }

      const fadeK = w.life / w.maxLife;

      const a = w.alpha * (1 - Math.abs(fadeK - 0.3) * 0.6);

      const px = Math.round(w.x / PX) * PX;

      const py = Math.round(w.y / PX) * PX;

      // Motion blur — short trail dust judant greitai

      const wsp = Math.hypot(w.vx, w.vy);

      if (wsp > 50) {

        const dx = -w.vx / wsp * PX, dy = -w.vy / wsp * PX;

        ctx.fillStyle = `rgba(${w.col[0]},${w.col[1]},${w.col[2]},${a * 0.45})`;

        ctx.fillRect(Math.round((w.x + dx) / PX) * PX, Math.round((w.y + dy) / PX) * PX, w.size, w.size);

      }

      ctx.fillStyle = `rgba(${w.col[0]},${w.col[1]},${w.col[2]},${a})`;

      ctx.fillRect(px, py, w.size, w.size);

    }

    // ── RENDER VORTEXES (gražūs spiralės wisp'ai — stroke su 2 layer glow) ────

    for (let i = _f12WindVortexes.length - 1; i >= 0; i--) {

      const v = _f12WindVortexes[i];

      // Drift su curl field (organiškas judėjimas, ne tiesi linija)

      const [vfvx, vfvy] = _windFieldAt(v.cx, v.cy, t);

      v.vx += (vfvx * 2.0 - v.vx) * 0.05;

      v.vy += (vfvy * 2.0 - v.vy) * 0.05;

      v.cx += v.vx * dts;

      v.cy += v.vy * dts;

      v.baseAng += v.spin * dts;

      v.life += dts * (isCalm ? 5 : 1);    // calm => fade 5x greičiau

      if (v.cx < aX - 40 || v.cx > aRight + 40 || v.cy < aY - 40 || v.cy > aBot + 40 || v.life > v.maxLife) {

        _f12WindVortexes.splice(i, 1); continue;

      }

      const lk = v.life / v.maxLife;

      // Trumpa staigi fade: in 0-0.15, plateau 0.15-0.55, out 0.55-1 (dauguma laiko fade)

      let alphaV;

      if (lk < 0.15) alphaV = lk / 0.15;

      else if (lk < 0.55) alphaV = 1.0;

      else alphaV = 1 - (lk - 0.55) / 0.45;

      alphaV *= v.bright;

      // Grow fast, then expand outward (radius auga visą gyvavimą)

      const rNow = v.radius * (0.4 + lk * 0.8);

      const spinSign = v.spin > 0 ? 1 : -1;

      // Brėžiam SPIRALIO RANKAS — naudojant ctx.stroke (gražios linijos)

      ctx.lineCap = 'round';

      ctx.lineJoin = 'round';

      const turns = 1.4;     // sumažintas turns count (buvo 2.2) — atrodo refined

      for (let arm = 0; arm < v.arms; arm++) {

        const armStartAng = (arm / v.arms) * Math.PI * 2;

        const steps = 24;

        // ── 1 SLUOKSNIS: GLOW (storas, low alpha) ──

        ctx.strokeStyle = `rgba(255,240,200,${alphaV * 0.18})`;

        ctx.lineWidth = 4;

        ctx.beginPath();

        for (let step = 0; step <= steps; step++) {

          const tStep = step / steps;

          const theta = v.baseAng + armStartAng + tStep * Math.PI * 2 * turns * spinSign;

          const r = Math.pow(tStep, 0.85) * rNow;       // tiny ease for smooth tip

          const sx = v.cx + Math.cos(theta) * r;

          const sy = v.cy + Math.sin(theta) * r;

          if (step === 0) ctx.moveTo(sx, sy);

          else ctx.lineTo(sx, sy);

        }

        ctx.stroke();

        // ── 2 SLUOKSNIS: CORE (plonas, high alpha, gradient color) ──

        // Renderim atskirais segmentais kad spalva keistųsi

        for (let step = 0; step < steps; step++) {

          const t1 = step / steps;

          const t2 = (step + 1) / steps;

          const theta1 = v.baseAng + armStartAng + t1 * Math.PI * 2 * turns * spinSign;

          const theta2 = v.baseAng + armStartAng + t2 * Math.PI * 2 * turns * spinSign;

          const r1 = Math.pow(t1, 0.85) * rNow;

          const r2 = Math.pow(t2, 0.85) * rNow;

          const x1 = v.cx + Math.cos(theta1) * r1;

          const y1 = v.cy + Math.sin(theta1) * r1;

          const x2 = v.cx + Math.cos(theta2) * r2;

          const y2 = v.cy + Math.sin(theta2) * r2;

          // Tail fade: alpha mažėja, color šiltesnis link tip

          const tMid = (t1 + t2) / 2;

          const segA = alphaV * (1 - Math.pow(tMid, 1.4)) * 0.92;

          if (segA < 0.03) continue;

          const colR = Math.round(255 - tMid * 25);

          const colG = Math.round(245 - tMid * 50);

          const colB = Math.round(200 - tMid * 80);

          ctx.strokeStyle = `rgba(${colR},${colG},${colB},${segA})`;

          ctx.lineWidth = 1.6 - tMid * 0.8;             // storas centras → plonas tip

          ctx.beginPath();

          ctx.moveTo(x1, y1);

          ctx.lineTo(x2, y2);

          ctx.stroke();

        }

      }

      // Centrinis bright dot (mažas core)

      ctx.fillStyle = `rgba(255,248,210,${alphaV * 0.85})`;

      ctx.fillRect(Math.round(v.cx) - 1, Math.round(v.cy) - 1, 2, 2);

    }

    // ── RENDER DEBRIS (lapai/šakelės) — virš dust + vortexai ───

    for (let i = _f12WindDebris.length - 1; i >= 0; i--) {

      const d = _f12WindDebris[i];

      // Per-debris lag — taip pat reaguoja į wind change (branch sunkesnė → lėtesnė)

      const _dmFact = d.kind === 'leaf' ? 5.0 : (d.kind === 'twig' ? 4.2 : 3.5);

      const tdvx = wvx * _dmFact;

      const tdvy = wvy * _dmFact;

      d.vx += (tdvx - d.vx) * 0.04;

      d.vy += (tdvy - d.vy) * 0.04;

      // Vertikalus „skraidymas" — lapai svyruoja viršyn/žemyn

      d.vy += Math.sin(tSec * 1.8 + d.rot) * 15 * dts;

      d.x += d.vx * dts;

      d.y += d.vy * dts;

      d.rot += d.rotV * dts;

      d.life += dts * (isCalm ? 5 : 1);    // calm => leaves/twigs fade greitai

      if (d.x < aX - 30 || d.x > aRight + 30 || d.y < aY - 30 || d.y > aBot + 30 || d.life > d.maxLife) {

        _f12WindDebris.splice(i, 1); continue;

      }

      const fadeK = d.life / d.maxLife;

      let alphaD = 1.0;

      if (fadeK < 0.08) alphaD = fadeK / 0.08;

      else if (fadeK > 0.85) alphaD = 1 - (fadeK - 0.85) / 0.15;

      ctx.save();

      ctx.translate(Math.round(d.x), Math.round(d.y));

      ctx.rotate(d.rot);

      ctx.globalAlpha = alphaD;

      if (d.kind === 'leaf') {

        // Pixel art lapas — tikra LEAF SHAPE (smailas tip + plati middle + stem)

        // Bbox: 11×7 (labai matomas)

        const p = d.palette;

        // ── DROP SHADOW (5px offset) — depth feel ──

        ctx.fillStyle = 'rgba(0,0,0,0.5)';

        // Shadow follows leaf shape

        ctx.fillRect(-3, 2, 7, 1);

        ctx.fillRect(-2, 1, 9, 1);

        ctx.fillRect(-1, 2, 8, 2);

        // ── EDGE OUTLINE (juodas) ──

        ctx.fillStyle = p.edge;

        // Tip (kairysis smailas)

        ctx.fillRect(-5, -1, 1, 2);

        // Top edge (banguotas)

        ctx.fillRect(-4, -2, 2, 1);

        ctx.fillRect(-2, -3, 4, 1);

        ctx.fillRect(2, -2, 3, 1);

        // Right edge

        ctx.fillRect(5, -1, 1, 2);

        // Bottom edge

        ctx.fillRect(2, 2, 3, 1);

        ctx.fillRect(-2, 3, 4, 1);

        ctx.fillRect(-4, 2, 2, 1);

        // ── DARK FILL ──

        ctx.fillStyle = p.dark;

        ctx.fillRect(-4, -1, 9, 3);

        ctx.fillRect(-3, -2, 7, 1);

        ctx.fillRect(-3, 2, 7, 1);

        // ── MID COLOR ──

        ctx.fillStyle = p.mid;

        ctx.fillRect(-3, -1, 7, 2);

        ctx.fillRect(-2, -2, 4, 1);

        ctx.fillRect(-2, 1, 4, 1);

        // ── LIGHT HIGHLIGHT (sunlit upper) ──

        ctx.fillStyle = p.light;

        ctx.fillRect(-2, -1, 4, 1);

        ctx.fillRect(-1, -2, 2, 1);

        // ── CENTRAL VEIN (dark) ──

        ctx.fillStyle = p.edge;

        ctx.fillRect(-4, 0, 9, 1);

        // ── STEM (lenkta, ruda) ──

        ctx.fillStyle = '#3a2410';

        ctx.fillRect(-6, 0, 2, 1);

        ctx.fillStyle = '#5a3818';

        ctx.fillRect(-6, 1, 1, 1);

      } else if (d.kind === 'twig') {

        // Pixel art šakelė — DIDESNĖ (13×4) su lapeliais + drop shadow

        // Drop shadow

        ctx.fillStyle = 'rgba(0,0,0,0.4)';

        ctx.fillRect(-5, 1, 13, 2);

        // Body — ruda šaka (3px storumo)

        ctx.fillStyle = '#2a1a08';

        ctx.fillRect(-6, -2, 13, 1);                    // top outline

        ctx.fillStyle = '#3a2410';

        ctx.fillRect(-6, -1, 13, 1);

        ctx.fillStyle = '#5a3818';

        ctx.fillRect(-6, 0, 13, 1);

        ctx.fillStyle = '#7a5028';

        ctx.fillRect(-5, 0, 1, 1);

        ctx.fillRect(2, 0, 1, 1);

        ctx.fillStyle = '#2a1a08';

        ctx.fillRect(-6, 1, 13, 1);                    // bottom outline

        // Lapelis kairysis (3×2)

        ctx.fillStyle = '#1a2a10';

        ctx.fillRect(-6, -4, 3, 1);

        ctx.fillStyle = '#2a4220';

        ctx.fillRect(-6, -3, 3, 1);

        ctx.fillStyle = '#4a7230';

        ctx.fillRect(-5, -3, 1, 1);

        // Lapelis vidury (3×2)

        ctx.fillStyle = '#1a2a10';

        ctx.fillRect(0, 2, 3, 1);

        ctx.fillStyle = '#2a4220';

        ctx.fillRect(0, 3, 3, 1);

        ctx.fillStyle = '#4a7230';

        ctx.fillRect(1, 3, 1, 1);

        // Lapelis dešinės pabaiga (2×1)

        ctx.fillStyle = '#2a4220';

        ctx.fillRect(5, -2, 2, 1);

      } else if (d.kind === 'branch') {

        // DIDELĖ NULŪŽUSI ŠAKA (17×6) — su 3 lapeliais + nutrūkęs galas

        // Drop shadow (didelis, dramatic)

        ctx.fillStyle = 'rgba(0,0,0,0.55)';

        ctx.fillRect(-7, 2, 17, 2);

        ctx.fillRect(-6, 1, 16, 1);

        // ── PAGRINDINĖ ŠAKA (4px storumo, 17px ilgio) ──

        // Top outline

        ctx.fillStyle = '#1a0a04';

        ctx.fillRect(-8, -3, 17, 1);

        // Body — du atspalviai

        ctx.fillStyle = '#3a2410';

        ctx.fillRect(-8, -2, 17, 1);

        ctx.fillStyle = '#5a3818';

        ctx.fillRect(-8, -1, 17, 1);

        ctx.fillStyle = '#7a5028';

        ctx.fillRect(-8, 0, 17, 1);

        // Highlights — kelios šviesios dėmės

        ctx.fillStyle = '#9a6838';

        ctx.fillRect(-6, 0, 1, 1);

        ctx.fillRect(-2, -1, 1, 1);

        ctx.fillRect(3, 0, 1, 1);

        // Bottom outline

        ctx.fillStyle = '#1a0a04';

        ctx.fillRect(-8, 1, 17, 1);

        // ── NULŪŽĘS KAIRYSIS GALAS (jagged) ──

        ctx.fillStyle = '#1a0a04';

        ctx.fillRect(-9, -2, 1, 1);

        ctx.fillRect(-9, 0, 1, 1);

        ctx.fillStyle = '#3a2410';

        ctx.fillRect(-9, -1, 1, 1);

        // ── LAPELIAI ant šakos (3 vietos) ──

        // Kairysis lapelis (4×3 — didesnis nei twig)

        ctx.fillStyle = '#1a2a10';

        ctx.fillRect(-7, -6, 4, 1);

        ctx.fillStyle = '#2a4220';

        ctx.fillRect(-7, -5, 4, 2);

        ctx.fillStyle = '#4a7230';

        ctx.fillRect(-6, -5, 2, 1);

        ctx.fillStyle = '#5a8a3e';

        ctx.fillRect(-6, -5, 1, 1);             // light highlight

        // Vidury lapelis (apačioje)

        ctx.fillStyle = '#1a2a10';

        ctx.fillRect(-1, 3, 4, 1);

        ctx.fillStyle = '#2a4220';

        ctx.fillRect(-1, 4, 4, 1);

        ctx.fillStyle = '#4a7230';

        ctx.fillRect(0, 4, 2, 1);

        // Dešinės pabaigos lapelis

        ctx.fillStyle = '#1a2a10';

        ctx.fillRect(6, -5, 3, 1);

        ctx.fillStyle = '#2a4220';

        ctx.fillRect(6, -4, 3, 1);

        ctx.fillStyle = '#4a7230';

        ctx.fillRect(7, -4, 1, 1);

        // ── SMULKI ŠAKELĖ — atsišakojusi nuo pagrindo ──

        ctx.fillStyle = '#3a2410';

        ctx.fillRect(2, -3, 2, 1);

        ctx.fillRect(3, -4, 2, 1);

      }

      ctx.restore();

    }

    ctx.restore();

  }

  // ── WIND INDICATOR — pixel art kompasas + stiprumo juosta ──────────

  // Pozicija: arena kairys viršus (toj pačioj linijoj kaip 0.5x zonos plokštė).

  // Rodyklė rotuoja link wind krypties (smooth), stiprumo juosta kinta su magnitude.

  function _drawWindIndicator(L, t) {

    const PX = 2;

    const w = _f12WindState;

    const mag = Math.hypot(w.vx, w.vy);

    const ang = mag > 0.5 ? Math.atan2(w.vy, w.vx) : 0;

    const magK = Math.min(1, mag / 130);    // 0..1 normalized strength

    // Frame box (dar 25% didesnis — 152×48)

    const boxW = 152, boxH = 48;

    const bx = L.arena.x + 10;

    const by = L.arena.y + _F12_PLAQUE_TOP;

    // Drop shadow

    ctx.fillStyle = 'rgba(0,0,0,0.55)';

    ctx.fillRect(bx + 2, by + 2, boxW, boxH);

    // Outer black outline

    ctx.fillStyle = '#000';

    ctx.fillRect(bx, by, boxW, boxH);

    // Corner cuts (pixel rounded)

    ctx.clearRect(bx, by, PX, PX);

    ctx.clearRect(bx + boxW - PX, by, PX, PX);

    ctx.clearRect(bx, by + boxH - PX, PX, PX);

    ctx.clearRect(bx + boxW - PX, by + boxH - PX, PX, PX);

    // Wood inner panel

    ctx.fillStyle = '#3a2410';

    ctx.fillRect(bx + PX, by + PX, boxW - PX*2, boxH - PX*2);

    // Brass top highlight

    ctx.fillStyle = '#d4a050';

    ctx.fillRect(bx + PX, by + PX, boxW - PX*2, 1);

    ctx.fillStyle = '#7a5a3a';

    ctx.fillRect(bx + PX, by + PX + 1, boxW - PX*2, 1);

    // Bottom shadow stripe

    ctx.fillStyle = '#1a0e06';

    ctx.fillRect(bx + PX, by + boxH - PX - 1, boxW - PX*2, 1);

    // Corner rivets

    ctx.fillStyle = '#a87830';

    ctx.fillRect(bx + PX*2, by + PX*2, PX, PX);

    ctx.fillRect(bx + boxW - PX*3, by + PX*2, PX, PX);

    ctx.fillRect(bx + PX*2, by + boxH - PX*3, PX, PX);

    ctx.fillRect(bx + boxW - PX*3, by + boxH - PX*3, PX, PX);

    ctx.fillStyle = '#ffe7a8';

    ctx.fillRect(bx + PX*2, by + PX*2, 1, 1);

    ctx.fillRect(bx + boxW - PX*3, by + PX*2, 1, 1);

    // ── COMPASS DISK (kairėj — apvalus, didesnis) ──

    const cdx = bx + 22, cdy = by + boxH / 2;

    const cdR = 16;

    // Outer glow halo (pulsing kai active) — skip ant mobile (radial gradient brangu)

    if (magK > 0.15 && !_IS_MOBILE) {

      const glowPulse = 0.4 + 0.25 * Math.sin(t * 0.005);

      // Tier color glow

      let glR = 90, glG = 140, glB = 170;

      if (magK > 0.45) { glR = 230; glG = 190; glB = 90; }

      if (magK > 0.75) { glR = 230; glG = 120; glB = 80; }

      const glow = ctx.createRadialGradient(cdx, cdy, cdR, cdx, cdy, cdR + 6);

      glow.addColorStop(0, `rgba(${glR},${glG},${glB},${glowPulse * magK * 0.5})`);

      glow.addColorStop(1, `rgba(${glR},${glG},${glB},0)`);

      ctx.fillStyle = glow;

      ctx.beginPath();

      ctx.arc(cdx, cdy, cdR + 6, 0, Math.PI * 2);

      ctx.fill();

    }

    // Disk shadow

    ctx.fillStyle = '#0f0703';

    for (let dy = -cdR; dy <= cdR; dy++) {

      for (let dx = -cdR; dx <= cdR; dx++) {

        if (dx*dx + dy*dy <= cdR*cdR) ctx.fillRect(cdx + dx, cdy + dy, 1, 1);

      }

    }

    // Disk fill (dark teal su subtle radial gradient)

    {

      const dg = ctx.createRadialGradient(cdx - 2, cdy - 2, 0, cdx, cdy, cdR);

      dg.addColorStop(0, '#2a5060');

      dg.addColorStop(1, '#0e2028');

      ctx.fillStyle = dg;

      ctx.beginPath();

      ctx.arc(cdx, cdy, cdR - 1, 0, Math.PI * 2);

      ctx.fill();

    }

    // Top highlight arc

    ctx.fillStyle = '#4a7e90';

    for (let dx = -cdR + 2; dx <= cdR - 2; dx++) {

      const dy = -Math.round(Math.sqrt((cdR - 1) * (cdR - 1) - dx*dx));

      ctx.fillRect(cdx + dx, cdy + dy, 1, 1);

    }

    // ── DIRECTION TICKS: didesni + ryškesni N/E/S/W ──

    ctx.fillStyle = '#ffe7a8';

    // N (top)

    ctx.fillRect(cdx, cdy - cdR + 1, 1, 2);

    ctx.fillRect(cdx - 1, cdy - cdR + 1, 3, 1);

    // S (bottom)

    ctx.fillRect(cdx, cdy + cdR - 2, 1, 2);

    ctx.fillRect(cdx - 1, cdy + cdR - 1, 3, 1);

    // E (right)

    ctx.fillRect(cdx + cdR - 2, cdy, 2, 1);

    ctx.fillRect(cdx + cdR - 1, cdy - 1, 1, 3);

    // W (left)

    ctx.fillRect(cdx - cdR + 1, cdy, 2, 1);

    ctx.fillRect(cdx - cdR + 1, cdy - 1, 1, 3);

    // Vidury subtle cross (kompaso centras)

    ctx.fillStyle = 'rgba(120,180,200,0.5)';

    ctx.fillRect(cdx - 4, cdy, 9, 1);

    ctx.fillRect(cdx, cdy - 4, 1, 9);

    // ── ARROW (rotuoja link wind dir, dydis priklauso nuo magK) ──

    if (magK > 0.05) {

      const arrowLen = 7 + magK * 6;     // 7..13 px (didesnis)

      ctx.save();

      ctx.translate(cdx, cdy);

      ctx.rotate(ang);

      // Arrow shaft (juodas underlay — 4px storumo)

      ctx.fillStyle = '#000';

      ctx.fillRect(-arrowLen - 1, -2, arrowLen * 2 + 2, 5);

      // Bright stripe (gold) — 2px storumo

      const ar = Math.round(180 + magK * 75);

      const ag = Math.round(160 + magK * 70);

      const ab = Math.round(70 + magK * 30);

      ctx.fillStyle = `rgb(${ar},${ag},${ab})`;

      ctx.fillRect(-arrowLen, -1, arrowLen * 2, 2);

      // Arrow head (didesnė strėlė)

      const hx = arrowLen;

      ctx.fillStyle = '#000';

      ctx.fillRect(hx - 1, -4, 1, 9);

      ctx.fillRect(hx, -3, 1, 7);

      ctx.fillRect(hx + 1, -2, 1, 5);

      ctx.fillRect(hx + 2, -1, 1, 3);

      ctx.fillStyle = `rgb(${ar},${ag},${ab})`;

      ctx.fillRect(hx - 1, -3, 1, 7);

      ctx.fillRect(hx, -2, 1, 5);

      ctx.fillRect(hx + 1, -1, 1, 3);

      // Tail feather

      ctx.fillStyle = '#5a4020';

      ctx.fillRect(-hx - 1, -3, 1, 7);

      ctx.fillRect(-hx, -2, 1, 5);

      ctx.restore();

    } else {

      // CALM — center dot pulsing

      const pulseA = 0.4 + 0.3 * Math.sin(t * 0.004);

      ctx.fillStyle = `rgba(180,170,120,${pulseA})`;

      ctx.fillRect(cdx - 1, cdy - 1, 2, 2);

    }

    // ── STRENGTH BAR (dešinėj — vertikalūs segmentai) + TIER LABEL ──

    const barX = bx + 48;

    const barY = by + 8;                       // +2px žemyn

    const barW = boxW - 56;

    const barH = boxH - 12;

    // ── VERTICAL DIVIDER tarp compass ir bar — subtle gold linija (improved UI) ──

    ctx.fillStyle = 'rgba(168,120,48,0.5)';

    ctx.fillRect(bx + 42, by + 6, 1, boxH - 12);

    ctx.fillStyle = 'rgba(255,231,168,0.25)';

    ctx.fillRect(bx + 43, by + 6, 1, boxH - 12);

    // Tier label — CALM / BREEZE / GUST / STORM

    let tierLabel, tierCol;

    if (magK < 0.18) { tierLabel = 'CALM';   tierCol = '#7a8aa0'; }

    else if (magK < 0.45) { tierLabel = 'BREEZE'; tierCol = '#b8d088'; }

    else if (magK < 0.75) { tierLabel = 'GUST';   tierCol = '#e8c060'; }

    else                  { tierLabel = 'STORM';  tierCol = '#e87850'; }

    // STORM pulsing — ryški spalva mirgsi

    let stormPulse = 1;

    if (magK > 0.75) stormPulse = 0.75 + 0.25 * Math.sin(t * 0.012);

    // ── WIND GLYPH (≋) + TIER LABEL — centruojam kaip vienetą virš juostos ──

    ctx.font = 'bold 10px "Press Start 2P", monospace';

    const labelW = ctx.measureText(tierLabel).width;

    const GLYPH_W = 7;

    const GAP = 4;

    const totalW = GLYPH_W + GAP + labelW;

    const groupStartX = barX + (barW - totalW) / 2;     // centruotas grupės pradžios x

    // WIND GLYPH (≋ — 3 wavy lines, animuotas)

    const gx = Math.round(groupStartX);

    const gy = barY + 2;

    const glyphCol = magK < 0.18 ? '#5a6878' : tierCol;

    const wob = Math.sin(t * 0.006) * 1;

    // Glyph shadow (1px offset down-right)

    ctx.fillStyle = '#000';

    ctx.fillRect(gx + 1, gy + 1, GLYPH_W, 1);

    ctx.fillRect(gx + 1, gy + 4, GLYPH_W, 1);

    ctx.fillRect(gx + 1, gy + 7, GLYPH_W, 1);

    // Glyph main

    ctx.fillStyle = glyphCol;

    ctx.fillRect(gx, gy, GLYPH_W, 1);

    ctx.fillRect(gx + 1, gy + 3, GLYPH_W, 1);

    ctx.fillRect(gx + Math.round(wob), gy + 6, GLYPH_W, 1);

    // TIER LABEL — po glyph

    const tlX = Math.round(groupStartX + GLYPH_W + GAP);

    ctx.textAlign = 'left';

    // Drop shadow + outline

    ctx.fillStyle = '#000';

    ctx.fillText(tierLabel, tlX + 1, barY + 9);

    ctx.fillText(tierLabel, tlX - 1, barY + 9);

    ctx.fillText(tierLabel, tlX, barY + 10);

    ctx.fillText(tierLabel, tlX, barY + 8);

    // Main fill su STORM pulse

    const tcR = parseInt(tierCol.slice(1, 3), 16);

    const tcG = parseInt(tierCol.slice(3, 5), 16);

    const tcB = parseInt(tierCol.slice(5, 7), 16);

    ctx.fillStyle = `rgba(${tcR},${tcG},${tcB},${stormPulse})`;

    ctx.fillText(tierLabel, tlX, barY + 9);

    // Top highlight (subtle white shimmer)

    ctx.fillStyle = `rgba(255,255,255,${0.35 * stormPulse})`;

    ctx.fillText(tierLabel, tlX, barY + 8);

    // Segment bar (5 segments) — didesnis

    const segH = 12;

    const segY = barY + 16;

    const segCount = 5;

    const segW = Math.floor((barW - (segCount - 1)) / segCount);

    const filled = Math.round(magK * segCount);

    for (let s = 0; s < segCount; s++) {

      const sx = barX + s * (segW + 1);

      // Segment background

      ctx.fillStyle = '#1a0e06';

      ctx.fillRect(sx, segY, segW, segH);

      ctx.fillStyle = '#2a1810';

      ctx.fillRect(sx + 1, segY + 1, segW - 2, segH - 2);

      if (s < filled) {

        // Filled — colored based on intensity (green → yellow → red)

        let segR, segG, segB;

        const segK = s / (segCount - 1);

        if (segK < 0.5) {

          const p = segK / 0.5;

          segR = Math.round(80 + p * (220 - 80));

          segG = Math.round(220 - p * 20);

          segB = Math.round(80 - p * 20);

        } else {

          const p = (segK - 0.5) / 0.5;

          segR = Math.round(220 + p * 30);

          segG = Math.round(200 - p * 140);

          segB = Math.round(60 - p * 30);

        }

        // Animated wave shimmer on the bar

        const shimmer = 0.85 + 0.15 * Math.sin(t * 0.008 + s * 0.6);

        segR = Math.round(segR * shimmer);

        segG = Math.round(segG * shimmer);

        segB = Math.round(segB * shimmer);

        ctx.fillStyle = `rgb(${segR},${segG},${segB})`;

        ctx.fillRect(sx + 1, segY + 1, segW - 2, segH - 2);

        // Top highlight

        ctx.fillStyle = `rgba(255,255,220,0.45)`;

        ctx.fillRect(sx + 1, segY + 1, segW - 2, 1);

      }

    }

  }

  function _drawAmbientFog(L, t) {

    // Spawn fog clouds — ~1 per N frames

    if (_f12Fog.length < 8 && Math.random() < 0.012) {

      const layer = Math.random() < 0.5 ? 'back' : 'front';

      _f12Fog.push({

        x: L.W + 100,

        y: L.lanesY + Math.random() * L.lanesH,

        vx: layer === 'back' ? -10 - Math.random() * 6 : -20 - Math.random() * 10,

        r: layer === 'back' ? 60 + Math.random() * 40 : 100 + Math.random() * 60,

        alpha: layer === 'back' ? 0.08 : 0.06,

        phase: Math.random() * Math.PI * 2,

      });

    }

    const dts = 0.016;

    ctx.save();

    for (let i = _f12Fog.length - 1; i >= 0; i--) {

      const f = _f12Fog[i];

      f.x += f.vx * dts;

      if (f.x < -f.r * 2) { _f12Fog.splice(i, 1); continue; }

      // Subtle bobbing

      const fy = f.y + Math.sin(t * 0.001 + f.phase) * 4;

      // Soft radial fog gradient

      const grad = ctx.createRadialGradient(f.x, fy, 0, f.x, fy, f.r);

      grad.addColorStop(0, `rgba(220,210,190,${f.alpha})`);

      grad.addColorStop(0.5, `rgba(180,170,150,${f.alpha * 0.5})`);

      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = grad;

      ctx.fillRect(f.x - f.r, fy - f.r, f.r * 2, f.r * 2);

    }

    ctx.restore();

  }

  function _drawComboFlash(L, t) {

    if (_f12ComboCount < 2) return;

    const el = t - _f12ComboFlashAt;

    if (el > 1200) {

      if (t - _f12LastMergeAt > 1500) _f12ComboCount = 0;

      return;

    }

    const k = el / 1200;

    const alpha = 1 - k;

    const scale = el < 200 ? 1 + (1 - el / 200) * 0.4 : 1;

    ctx.save();

    ctx.textAlign = 'center';

    const cx = L.W / 2, cy = L.H * 0.04;

    // Outline

    ctx.font = `bold ${Math.round(28 * scale)}px "Press Start 2P", monospace`;

    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.85})`;

    ctx.fillText(`COMBO ×${_f12ComboCount}`, cx + 2, cy + 2);

    // Aukso geltonas

    ctx.fillStyle = `rgba(255,210,80,${alpha})`;

    ctx.fillText(`COMBO ×${_f12ComboCount}`, cx, cy);

    ctx.restore();

  }

  // ── Pixel art outer dirt background (lauko ploto aplink areną)

  let _bgCache = null;

  function _buildBgSprite(W, H) {

    const off = document.createElement('canvas');

    off.width = W;

    off.height = H;

    const oc = off.getContext('2d');

    const PX = PIXEL_SIZE;

    // Base solid (tamsiai rudas)

    oc.fillStyle = '#2a1808';

    oc.fillRect(0, 0, W, H);

    // Pixel pattern variations

    for (let y = 0; y < H; y += PX) {

      for (let x = 0; x < W; x += PX) {

        const h = _pxHash(x + 1000, y + 2000);

        if (h < 0.05) { oc.fillStyle = '#1a0e04'; oc.fillRect(x, y, PX, PX); }

        else if (h < 0.10) { oc.fillStyle = '#3a2210'; oc.fillRect(x, y, PX, PX); }

      }

    }

    // Outer pixel border (4 layers — pixel art frame around viewport)

    oc.fillStyle = '#1a0c04';

    oc.fillRect(0, 0, W, 2);

    oc.fillRect(0, H - 2, W, 2);

    oc.fillRect(0, 0, 2, H);

    oc.fillRect(W - 2, 0, 2, H);

    oc.fillStyle = '#3a2210';

    oc.fillRect(2, 2, W - 4, 2);

    oc.fillRect(2, H - 4, W - 4, 2);

    oc.fillRect(2, 2, 2, H - 4);

    oc.fillRect(W - 4, 2, 2, H - 4);

    return { canvas: off, w: W, h: H };

  }

  function drawDirtBackground(L) {

    if (!_bgCache || _bgCache.w !== L.W || _bgCache.h !== L.H) {

      _bgCache = _buildBgSprite(L.W, L.H);

    }

    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(_bgCache.canvas, 0, 0);

  }

  function drawLanes(L, t) {

    const baseW = 32;

    // Lane background cache — pre-render dirt texture + base wall

    if (!_laneBgCache || _laneBgCache.w !== L.lanesW || _laneBgCache.h !== L.lanesH || _laneBgCache.lanes !== LANES) {

      _laneBgCache = _buildLaneBgSprite(L.lanesW, L.lanesH, L.laneH, baseW);

    }

    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(_laneBgCache.canvas, L.lanesX, L.lanesY);

    // Frost reverse — ant GRINDŲ sluoksnio (po visais objektais: priešais, sienom, ally)

    _drawFrostReverse(L, t);

    // PASS 1 — dynamic overlay (shield aura + animated direction chevrons)

    const PX = PIXEL_SIZE;

    // PASS 2 — visi unit'ai (allies + enemies). Tower'iai gali peržengti į kitos lane'os plotą,

    // todėl nupiešus VISŲ background'ų pirma, tower'iai nebus apkarpomi sekančio lane fillRect'o.

    for (let i = 0; i < LANES; i++) {

      const ly = L.lanesY + i * L.laneH;

      const lh = L.laneH - 4;

      const lane = lanes[i];

      for (const a of lane.allies) {

        const ax = L.lanesX + baseW + (L.lanesW - baseW - 30) * a.x;

        const ay = ly + lh / 2;

        const sz = lh * 0.50;

        if (a.dead) { drawAlly(ax, ay, sz, a, t); continue; }   // death anim + kraujo burst (anksčiau buvo praleidžiama → nesimatė)

        drawAlly(ax, ay, sz, a, t);

        if (!a.dead) _f12DrawXpGainFx(ax, ay, sz, a, t);    // subtilus „+N XP" feedback (po lvl up sluoksniu)
        if (!a.dead) _f12DrawLevelUpFx(ax, ay, sz, a, t);   // live LEVEL UP vizualas virš unito

        // Drop target rect — tower'iams didesnis (sprite sz*4.5), unit'ams normalus

        const isTowerA = a.static;

        const rW = isTowerA ? sz * 4.5 : sz * 3;

        const rH = isTowerA ? sz * 5.0 : sz * 3;

        unitDropRects.push({ ally: a, x: ax - rW / 2, y: ay - rH / 2, w: rW, h: rH, lane: i });

      }

      for (const e of lane.enemies) {

        const ex = L.lanesX + baseW + (L.lanesW - baseW - 30) * e.x;

        const ey = ly + lh / 2;

        drawEnemy(ex, ey, lh * 0.50, e, t);

      }


    }

  }

  // ── Pixel art skull pattern (11×10 grid). 0=transparent, 1=bone, 2=dark hole, 3=highlight, 4=shadow

  const SKULL_PATTERN = [

    [0,0,0,1,1,1,1,1,0,0,0],

    [0,0,1,3,3,1,1,1,1,0,0],

    [0,1,1,3,3,1,1,1,1,1,0],

    [1,1,2,2,2,1,2,2,2,1,1],

    [1,1,2,2,2,1,2,2,2,1,1],

    [1,1,1,1,1,2,1,1,1,1,1],

    [1,1,1,1,2,2,1,1,1,1,1],

    [4,1,1,1,1,1,1,1,1,1,4],

    [0,1,2,1,2,1,2,1,2,1,0],

    [0,4,1,4,1,4,1,4,1,4,0],

  ];

  const SKULL_COLORS = {

    1: 'rgb(225,215,195)',   // bone

    2: 'rgb(28,18,10)',      // dark hole (eyes, nose, teeth gaps)

    3: 'rgb(245,235,215)',   // highlight

    4: 'rgb(170,158,140)',   // shadow

  };

  const SKULL_COLORS_FLASH = {

    1: 'rgb(255,180,140)',

    2: 'rgb(120,40,20)',

    3: 'rgb(255,220,180)',

    4: 'rgb(220,140,100)',

  };

  // Skull sprite cache — pre-rendered offscreen canvas per (scale, flash) deriniui

  const _skullSpriteCache = new Map();

  function _getSkullSprite(scale, flash) {

    const key = scale + ':' + (flash ? '1' : '0');

    if (_skullSpriteCache.has(key)) return _skullSpriteCache.get(key);

    const PX = Math.max(1, Math.round(scale));

    const rows = SKULL_PATTERN.length;

    const cols = SKULL_PATTERN[0].length;

    const off = document.createElement('canvas');

    off.width = cols * PX;

    off.height = rows * PX;

    const oc = off.getContext('2d');

    oc.imageSmoothingEnabled = false;

    const palette = flash ? SKULL_COLORS_FLASH : SKULL_COLORS;

    for (let r = 0; r < rows; r++) {

      for (let cc = 0; cc < cols; cc++) {

        const v = SKULL_PATTERN[r][cc];

        if (v === 0) continue;

        oc.fillStyle = palette[v];

        oc.fillRect(cc * PX, r * PX, PX, PX);

      }

    }

    const sprite = { canvas: off, w: off.width, h: off.height };

    _skullSpriteCache.set(key, sprite);

    return sprite;

  }

  // Helper — F11 stilius state pick'as su isMoving signalu

  function _pickSkullAnim(u, t, isMoving) {

    _initF12EnemySheets();

    // Pasirenkam sheet'us pagal enemy kind (default skull — allies neturi kind)

    const kind = u.kind || 'skull';

    const def = _F12_ENEMY_KINDS[kind] || _F12_ENEMY_KINDS.skull;

    let sheets = def.sheets;

    if (!sheets) {

      // Fallback į global skullAnimSheets (allies, init dar nesuvyko)

      try { sheets = skullAnimSheets; } catch (_) {}

    }

    if (!sheets) return null;

    const fpsMap = { idle: 7, run: 10, attack: 12, guard: 10, hurt: 22 };

    // Ally skull — lėtesnis, deliberatesnis swing (kad ataka nesusilietų su guard/bloko animacija)

    const _atkFps = (u.utype === 'skull') ? 8 : fpsMap.attack;

    const swingDur = (sheets.attack.frameCount / _atkFps) * 1000;

    const guardDur = (sheets.guard.frameCount / fpsMap.guard) * 1000;

    const swingElapsed = u.swingStart ? t - u.swingStart : Infinity;

    const guardElapsed = u.guardStart ? t - u.guardStart : Infinity;

    // HURT detection — hitFlashUntil set'inamas kai gauna damage. Anim window 350ms (flash 200ms + 150 grace)

    const hurtSheet = sheets.hurt;

    const hurtDamageTakenAt = u.hitFlashUntil ? (u.hitFlashUntil - 200) : 0;

    const hurtDur = hurtSheet ? (hurtSheet.frameCount / fpsMap.hurt) * 1000 : 0;

    const hurtElapsed = hurtSheet && hurtDamageTakenAt > 0 ? (t - hurtDamageTakenAt) : Infinity;

    let anim = 'idle';

    if (swingElapsed < swingDur) anim = 'attack';

    else if (guardElapsed < guardDur) anim = 'guard';

    else if (hurtSheet && hurtElapsed < hurtDur) anim = 'hurt';

    else if (isMoving) anim = 'run';

    const sheet = sheets[anim];

    if (!sheet || !sheet.sheet || !sheet.sheet.complete || !sheet.sheet.naturalWidth) return null;

    const fps = (anim === 'attack') ? _atkFps : fpsMap[anim];

    const frameCount = sheet.frameCount;

    let frameIdx;

    if (anim === 'attack') frameIdx = Math.min(frameCount - 1, Math.floor(swingElapsed / (1000 / fps)));

    else if (anim === 'guard') frameIdx = Math.min(frameCount - 1, Math.floor(guardElapsed / (1000 / fps)));

    else if (anim === 'hurt') frameIdx = Math.min(frameCount - 1, Math.floor(hurtElapsed / (1000 / fps)));

    else frameIdx = Math.floor((t + (u.bobPhase || 0) * 100) / (1000 / fps)) % frameCount;

    const fw = def.frameW || 192;

    return { sheet: sheet.sheet, sx: frameIdx * fw, sy: 0, sw: fw, sh: fw, anim, sizeMul: def.sizeMul || 1 };

  }

  // ── Hog Rider animation (pigronke sprite sheets — idle/walk/attack, 8 frames each)

  // Lazy-load (kaip skull enemy sheets) — naudoja global loadHorizontalSheetFrames iš game.js.

  let _hogRiderSheets = null;

  function _initHogRiderSheets() {

    if (_hogRiderSheets) return _hogRiderSheets;

    if (typeof loadHorizontalSheetFrames !== 'function') return null;

    _hogRiderSheets = {

      idle:   loadHorizontalSheetFrames('pigronke.png',       8),

      walk:   loadHorizontalSheetFrames('pigronkewalk.png',   8),

      attack: loadHorizontalSheetFrames('ronkepigattack.png', 8),

      hurt:   loadHorizontalSheetFrames('dmgtake01.png',      8),  // dmg-take recoil (kaip mint popup)

    };

    return _hogRiderSheets;

  }

  const _HOG_FPS = { idle: 8, walk: 11, attack: 12, hurt: 20 };

  // Spear thrust apex ~ attack animacijos viduryje (8 frames @ 12fps = 667ms → ~360ms = apex).

  // Damage + VFX nukrenta čia, ne swing start, kad sutaptų su vizualiniu smūgiu.

  const _HOG_HIT_DELAY = 360;

  const _SKULL_HIT_DELAY = 420;   // skull melee — dmg apex'e (sustojęs), prie lėtesnio swing (8fps)

  function _pickHogRiderFrame(u, t, isMoving) {

    const sheets = _initHogRiderSheets();

    if (!sheets) return null;

    const swingDur = (sheets.attack.frameCount / _HOG_FPS.attack) * 1000;

    const swingElapsed = u.swingStart ? t - u.swingStart : Infinity;

    // HURT detection — hitFlashUntil set'inamas kai gauna damage (enemy counter). dmgtake01 recoil grojam vieną kartą.

    const hurtSheet = sheets.hurt;

    const hurtTakenAt = u.hitFlashUntil ? (u.hitFlashUntil - 200) : 0;

    const hurtDur = hurtSheet ? (hurtSheet.frameCount / _HOG_FPS.hurt) * 1000 : 0;

    const hurtElapsed = (hurtSheet && hurtTakenAt > 0) ? (t - hurtTakenAt) : Infinity;

    let anim = 'idle';

    if (swingElapsed < swingDur)                       anim = 'attack';  // sava ataka turi prioritetą

    else if (hurtSheet && hurtElapsed < hurtDur)       anim = 'hurt';    // dmg-take recoil

    else if (isMoving)                                 anim = 'walk';

    const st = sheets[anim];

    if (!st || !st.sheet || !st.sheet.complete || !st.sheet.naturalWidth) return null;

    const fps = _HOG_FPS[anim];

    const fc = st.frameCount;

    const fw = Math.floor(st.sheet.naturalWidth / fc);

    const fh = st.sheet.naturalHeight;

    let idx;

    if (anim === 'attack')    idx = Math.min(fc - 1, Math.floor(swingElapsed / (1000 / fps)));

    else if (anim === 'hurt') idx = Math.min(fc - 1, Math.floor(hurtElapsed / (1000 / fps)));

    else idx = Math.floor((t + (u.bobPhase || 0) * 100) / (1000 / fps)) % fc;

    return { sheet: st.sheet, sx: idx * fw, sy: 0, sw: fw, sh: fh };

  }

  // ── Kraujo partikleliai — unito mirties efektas (screen coords, analitinė fizika) ──

  const _BLOOD_GRAV = 520;

  function _spawnBloodBurst(x, y, sz, t) {

    const scale = Math.max(0.8, sz / 13);

    const gy = y + sz * 0.85;   // „žemės" lygis (prie kojų) — kur lašiukai nusėda

    // Raudonas „splat" blyksnis (didesnis — stipresnis mirties efektas)

    _f12Blood.push({ flash: true, x0: x, y0: y, born: t, duration: 230, size: Math.round(12 * scale) });

    // Maži purslai — DABARTINIS dydis (2-3px)

    const n = 22 + Math.floor(Math.random() * 12);         // 22-33 purslų

    for (let i = 0; i < n; i++) {

      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7;  // daugiausia į viršų/šonus

      const sp = (60 + Math.random() * 200) * scale;

      _f12Blood.push({

        x0: x + (Math.random() - 0.5) * 9 * scale,

        y0: y + (Math.random() - 0.5) * 9 * scale,

        vx: Math.cos(ang) * sp, vy0: Math.sin(ang) * sp - 80,

        born: t, groundY: gy,

        size: 2 + Math.floor(Math.random() * 2), shade: Math.random(), big: false,  // 2-3px (dabartinis)

        landed: false, groundLife: 700 + Math.random() * 700,   // ~1s ± (skirtingi greičiai)

      });

    }

    // Stambūs lašai — DIDESNI (5-8px) ir jų DAUGIAU; krenta ant žemės kaip didelės kraujo dėmės

    const nb = 13 + Math.floor(Math.random() * 5);         // 13-17 didelių

    for (let i = 0; i < nb; i++) {

      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;

      const sp = (45 + Math.random() * 130) * scale;

      _f12Blood.push({

        x0: x + (Math.random() - 0.5) * 6 * scale,

        y0: y + (Math.random() - 0.5) * 6 * scale,

        vx: Math.cos(ang) * sp, vy0: Math.sin(ang) * sp - 120,

        born: t, groundY: gy,

        size: 5 + Math.floor(Math.random() * 4), shade: Math.random(), big: true,  // 5-8px (didesni)

        landed: false, groundLife: 900 + Math.random() * 800,

      });

    }

    // Cap — mass deaths (AOE) gali sukurti daug partiklelių; ribojam, kad mobile nelaggintų

    if (_f12Blood.length > 280) _f12Blood.splice(0, _f12Blood.length - 280);

  }

  function _drawBlood(t) {

    if (!_f12Blood.length) return;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (let i = _f12Blood.length - 1; i >= 0; i--) {

      const p = _f12Blood[i];

      // ── Raudono „splat" blyksnio žiedas ──

      if (p.flash) {

        const k = (t - p.born) / p.duration;

        if (k >= 1) { _f12Blood.splice(i, 1); continue; }

        const fa = (1 - k) * 0.7;

        const fr = p.size * (0.45 + k * 1.25);

        ctx.fillStyle = `rgba(180,16,16,${fa.toFixed(3)})`;

        ctx.beginPath(); ctx.arc(p.x0, p.y0, fr, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = `rgba(255,72,56,${(fa * 0.8).toFixed(3)})`;

        ctx.beginPath(); ctx.arc(p.x0, p.y0, fr * 0.45, 0, Math.PI * 2); ctx.fill();

        continue;

      }

      const r = 175 + Math.floor(p.shade * 70);

      const g = 12 + Math.floor(p.shade * 26);

      const b = 14 + Math.floor(p.shade * 14);

      if (!p.landed) {

        // ── Skrydis (analitinė fizika) ──

        const age = (t - p.born) / 1000;

        const px = p.x0 + p.vx * age;

        const py = p.y0 + p.vy0 * age + 0.5 * _BLOOD_GRAV * age * age;

        if (py >= p.groundY) {

          // Nukrito ant žemės — užfiksuojam dėmę šioj vietoj

          p.landed = true; p.landX = px; p.landY = p.groundY; p.landAt = t;

          // Garsiukas — lašelis ant žemės (random + throttle, kad nesusilietų į triukšmą)

          if (Math.random() < 0.35 && (t - _lastBloodDripAt) > 45) {

            _lastBloodDripAt = t;

            try { if (_F12Audio && _F12Audio.bloodDrip) _F12Audio.bloodDrip(); } catch (_) {}

          }

        } else {

          if ((t - p.born) > 4000) { _f12Blood.splice(i, 1); continue; }  // safety

          ctx.fillStyle = `rgba(${r},${g},${b},1)`;

          ctx.fillRect(Math.round(px), Math.round(py), p.size, p.size);

          continue;

        }

      }

      // ── Ant žemės — kraujo dėmė, lieka ~1s, fade pabaigoj (skirtingi groundLife) ──

      const lage = t - p.landAt;

      if (lage >= p.groundLife) { _f12Blood.splice(i, 1); continue; }

      const lk = lage / p.groundLife;

      const la = lk < 0.55 ? 1 : (1 - (lk - 0.55) / 0.45);   // pilnas iki 55%, tada gęsta

      const w = p.size + (p.big ? 3 : 1);                    // suplota dėmė (platesnė nei aukšta)

      const h = Math.max(1, Math.round(p.size * 0.6));

      ctx.fillStyle = `rgba(${Math.floor(r * 0.82)},${g},${b},${la.toFixed(3)})`;

      ctx.fillRect(Math.round(p.landX - w / 2), Math.round(p.landY), w, h);

      ctx.fillStyle = `rgba(80,6,8,${(la * 0.65).toFixed(3)})`;   // tamsesnė šerdis

      ctx.fillRect(Math.round(p.landX - w / 4), Math.round(p.landY), Math.max(1, Math.round(w / 2)), h);

    }

    ctx.restore();

  }

  function drawAlly(cx, cy, sz, a, t) {

    if (a.dead) {

      // Pastatai (towers) — be death animacijos, tiesiog dingsta

      if (a.static) return;

      // Kraujo burst vieną kartą mirties pradžioj

      if (!a._bloodSpawned) { a._bloodSpawned = true; _spawnBloodBurst(cx, cy, sz, t); }

      _drawDeathAnim(cx, cy, sz, t - a.deathStartedAt);

      return;

    }

    const flash = t < a.hitFlashUntil;

    const isMoving = a.x > 0.001 && a.x < 1.0 && t >= a.idleUntil && Math.abs((a._prevX ?? a.x) - a.x) > 0.00002;

    // Per-type animation render

    const dw = sz * 4.5, dh = sz * 4.5;

    // Towers — static sprite (Buildings_Tower.png arba Buildings_Zip.png)

    if (a.utype === 'tower' || a.utype === 'crossbow_tower' || a.utype === 'zip') {

      const isZip = a.utype === 'zip';

      let towerImg = _towerSpriteImg;

      let zipState = null;

      if (isZip) {

        // Idle = Buildings_Zip_Charge.png FRAME 0 (powered-off look, be lightning'o).

        // Charge = Buildings_Zip_Charge.png frames 0→13 progressively, TIK kai _zipChargeStart aktyvus.

        if (_zipChargeImg2.complete && _zipChargeImg2.naturalWidth) {

          towerImg = _zipChargeImg2;

          const chargeStart = a._zipChargeStart || 0;

          if (chargeStart > 0 && (t - chargeStart) < _ZIP_CHARGE_DUR) {

            const elapsed = t - chargeStart;

            const idx = Math.min(_ZIP_CHARGE_FRAMES - 1, Math.floor(elapsed / (1000 / _ZIP_CHARGE_FPS)));

            zipState = { idx, frames: _ZIP_CHARGE_FRAMES };

          } else {

            zipState = { idx: 0, frames: _ZIP_CHARGE_FRAMES };  // static frame 0 (idle)

          }

        }

      }

      if (towerImg && towerImg.complete && towerImg.naturalWidth) {

        ctx.save();

        ctx.imageSmoothingEnabled = false;

        if (flash) ctx.filter = 'brightness(1.5) sepia(1) saturate(2.5) hue-rotate(-30deg)';

        let sx, sy, sw, sh;

        if (isZip && zipState) {

          sw = towerImg.naturalWidth / zipState.frames;

          sh = towerImg.naturalHeight;

          sx = zipState.idx * sw; sy = 0;

        } else {

          sx = 0; sy = 0;

          sw = towerImg.naturalWidth;

          sh = towerImg.naturalHeight;

        }

        // Didesnis tower — užima 2 lanes vertikaliai (visu lane height = 4×sz tarp 2 lane'ų)

        const tw = sz * 4.0;

        const th = sz * 5.0;

        // Anchor: +7px žemyn (anksčiau +10, pakeltas 3px aukštyn)

        const towerY = cy - th * 0.40 + 7;

        ctx.drawImage(towerImg, sx, sy, sw, sh, cx - tw / 2, towerY, tw, th);

        if (a.utype === 'crossbow_tower') {

          ctx.fillStyle = 'rgba(0,0,0,0.85)';

          ctx.fillRect(cx - tw * 0.18, cy - th * 0.05, tw * 0.36, 12);

          ctx.fillStyle = '#d8f0ff';

          ctx.font = '8px "Press Start 2P", monospace';

          ctx.textAlign = 'center';

          ctx.fillText('XB', cx, cy - th * 0.05 + 9);

        }

        ctx.restore();

      }

    } else if (a.utype === 'shaman') {

      const img = _pickShamanFrame(a, t, isMoving);

      if (!img || !img.complete || !img.naturalWidth) return;

      ctx.save();

      ctx.imageSmoothingEnabled = false;

      if (flash) ctx.filter = 'brightness(1.5) sepia(1) saturate(2.5) hue-rotate(-30deg)';

      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);

      ctx.restore();

    } else if (a.utype === 'hog_rider') {

      const frame = _pickHogRiderFrame(a, t, isMoving);

      if (!frame) return;

      ctx.save();

      ctx.imageSmoothingEnabled = false;

      if (flash) ctx.filter = 'brightness(1.5) sepia(1) saturate(2.5) hue-rotate(-30deg)';

      // Mounted unit — aspect-ratio išlaikytas, feet anchor (kiaulės kojos ant lane), +10px aukščiau

      const hh = sz * 5.6;

      const hw = hh * (frame.sw / frame.sh);

      ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh,

        cx - hw / 2, cy - hh / 2 - sz * 0.35 - 10, hw, hh);

      ctx.restore();

    } else {

      let frame;

      if (a.utype === 'harpoon_fish') frame = _pickHarpoonFishAnim(a, t, isMoving);

      else if (a.utype === 'archer')  frame = _pickArcherFrame(a, t, isMoving);

      else                            frame = _pickSkullAnim(a, t, isMoving);

      if (!frame) return;

      ctx.save();

      ctx.imageSmoothingEnabled = false;

      if (flash) ctx.filter = 'brightness(1.5) sepia(1) saturate(2.5) hue-rotate(-30deg)';

      ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, cx - dw / 2, cy - dh / 2, dw, dh);

      ctx.restore();

    }

    a._prevX = a.x;

    // HP bar — judantiems unit'ams + ZIP bokstui visada, kitiems towers tik kai damaged

    const showHpBar = !a.dead && (!a.static || a.utype === 'zip' || a.hp < a.maxHp);

    // Hog Rider sprite aukštesnis (mounted) → bar'us keliam aukščiau virš galvos

    const _barBaseY = (a.utype === 'hog_rider') ? (cy - sz * 1.5 - 10) : (cy - sz * 1.0);

    if (showHpBar) {

      const bw = sz * 1.2, bh = 3, barY = _barBaseY - bh;

      ctx.fillStyle = '#000';

      ctx.fillRect(Math.round(cx - bw / 2), Math.round(barY), Math.round(bw), bh);

      // HP-fill heal animacija (heart merge): juosta užsipildo nuo→iki (ease-out, 500ms) su švytėjimu.
      let _hf = a.hp / a.maxHp;
      if (a._healAnim) {
        const hk = (t - a._healAnim.born) / 500;
        if (hk >= 1) a._healAnim = null;
        else _hf = a._healAnim.from + (a._healAnim.to - a._healAnim.from) * (1 - Math.pow(1 - hk, 3));
      }
      const _healing = t < (a._healFlashUntil || 0);
      if (_healing) { ctx.save(); ctx.shadowColor = 'rgba(90,230,110,0.95)'; ctx.shadowBlur = 7; }
      ctx.fillStyle = _healing ? '#86ff95' : '#5cd06b';
      ctx.fillRect(Math.round(cx - bw / 2 + 1), Math.round(barY + 1), Math.round((bw - 2) * Math.max(0, Math.min(1, _hf))), bh - 2);
      if (_healing) ctx.restore();

      // Žalias gydymo pulsas aplink unitą (expanding ring + „+" kryžius)
      if (_healing) {
        const hk2 = 1 - Math.max(0, (a._healFlashUntil - t) / 700);   // 0→1
        const PX2 = 2, ringR = sz * 0.5 + hk2 * sz * 1.1, a2 = (1 - hk2) * 0.7;
        ctx.fillStyle = `rgba(120,255,140,${a2})`;
        for (let p = 0; p < 8; p++) {
          const ang = (p / 8) * Math.PI * 2 + hk2 * 1.2;
          ctx.fillRect(Math.round(cx + Math.cos(ang) * ringR - PX2), Math.round(cy + Math.sin(ang) * ringR - PX2), PX2 * 2, PX2 * 2);
        }
      }

    }

    // ── LIFETIME BAR — rodo kiek laiko liko iki recall ──

    if (!a.dead && a.bornAt) {

      const age = t - a.bornAt;

      const lifeFrac = Math.max(0, 1 - age / (a.lifetimeMs || _UNIT_LIFETIME_MS));

      const lbw = sz * 1.2, lbh = 2;

      const lifeY = _barBaseY - 3 - 2 - lbh;

      // Color: green → yellow → red

      let lcol;

      if (lifeFrac > 0.5) lcol = '#7fc6ff';        // melyna (saugu)

      else if (lifeFrac > 0.2) lcol = '#ffd866';   // geltona (vidury)

      else lcol = '#ff7a7a';                        // raudona (artyja recall)

      ctx.fillStyle = '#000';

      ctx.fillRect(Math.round(cx - lbw / 2), Math.round(lifeY), Math.round(lbw), lbh);

      ctx.fillStyle = lcol;

      ctx.fillRect(Math.round(cx - lbw / 2 + 1), Math.round(lifeY + 1), Math.round((lbw - 2) * lifeFrac), lbh - 2);

    }

    // ── SPAWN ANIMACIJA — magiškas blyksis pirmus 400ms ──

    if (!a.dead && a.bornAt && (t - a.bornAt) < _UNIT_SPAWN_ANIM_MS) {

      const sk = (t - a.bornAt) / _UNIT_SPAWN_ANIM_MS;     // 0..1

      const PX = 2;

      const snap = (v) => Math.round(v / PX) * PX;

      // Sphere magic burst — plečiasi + fade

      const ringR = sz * 0.6 + sk * sz * 1.2;

      const alpha = (1 - sk) * 0.85;

      ctx.fillStyle = `rgba(180,220,255,${alpha})`;

      for (let dy = -ringR; dy <= ringR; dy += PX) {

        for (let dx = -ringR; dx <= ringR; dx += PX) {

          const d = Math.sqrt(dx*dx + dy*dy);

          if (d > ringR || d < ringR - PX*1.5) continue;

          ctx.fillRect(snap(cx + dx), snap(cy + dy), PX, PX);

        }

      }

      // 6 spalvotos žiežirbos sklinda iš centro

      for (let s = 0; s < 6; s++) {

        const ang = (s / 6) * Math.PI * 2 + sk * 3;

        const r2 = sz * 0.4 + sk * sz * 0.8;

        const sx2 = snap(cx + Math.cos(ang) * r2);

        const sy2 = snap(cy + Math.sin(ang) * r2);

        ctx.fillStyle = `rgba(255,255,255,${alpha})`;

        ctx.fillRect(sx2 - PX, sy2, PX*2, PX);

        ctx.fillRect(sx2, sy2 - PX, PX, PX*2);

      }

    }

  }

  // ── BONUS POPUPS — „+5s" arba „-5s CD" floating text kai merge bonus pritaikytas ──

  function _drawBonusPopups(L, t) {

    if (!_f12BonusPopups.length) return;

    const DUR = 1100;

    ctx.save();

    for (let i = _f12BonusPopups.length - 1; i >= 0; i--) {

      const p = _f12BonusPopups[i];

      const k = (t - p.born) / DUR;

      if (k >= 1) { _f12BonusPopups.splice(i, 1); continue; }

      const alpha = 1 - k;

      const eased = 1 - Math.pow(1 - k, 2);

      const yOff = -eased * 36;

      const scale = k < 0.10 ? 1 + (1 - k / 0.10) * 0.5 : 1;

      const fontSize = Math.round(13 * scale);

      ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`;

      ctx.textAlign = 'center';

      // Juodas pixel outline

      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.95})`;

      ctx.fillText(p.text, p.x - 2, p.y + yOff);

      ctx.fillText(p.text, p.x + 2, p.y + yOff);

      ctx.fillText(p.text, p.x, p.y + yOff - 2);

      ctx.fillText(p.text, p.x, p.y + yOff + 2);

      // Spalva

      const col = p.color;

      const rgb = col.startsWith('#') ?

        [parseInt(col.slice(1,3),16), parseInt(col.slice(3,5),16), parseInt(col.slice(5,7),16)]

        : [255,255,255];

      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

      ctx.fillText(p.text, p.x, p.y + yOff);

    }

    ctx.restore();

  }

  // ── RECALL EFFECTS — unit'o orbas skrenda lanku atgal į savo kortą (su geru UI) ──

  function _drawRecallEffects(L, t) {

    if (!_f12RecallEffects.length) return;

    const DUR = 820;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (let i = _f12RecallEffects.length - 1; i >= 0; i--) {

      const r = _f12RecallEffects[i];

      const age = t - r.born;

      if (age >= DUR) { _f12RecallEffects.splice(i, 1); continue; }

      const k = age / DUR;

      const ke = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOut

      const tx = (r.tx != null) ? r.tx : r.cx;

      const ty = (r.ty != null) ? r.ty : r.cy + 60;

      const col = (r.ballType && TYPE_COLOR[r.ballType]) || { top: [205, 232, 255], front: [150, 195, 240] };

      const ARC = 32;

      const pathAt = (kk) => [r.cx + (tx - r.cx) * kk, r.cy + (ty - r.cy) * kk - Math.sin(kk * Math.PI) * ARC];

      const [px, py] = pathAt(ke);

      const fa = ke < 0.9 ? 1 : (1 - (ke - 0.9) / 0.1);                  // flight alpha (fade pabaigoj)

      const rad = Math.max(3, 12 * (1 - ke * 0.6));

      // ── KOMETOS UODEGA — ball spalvos pėdsakas (smooth fade) ──

      for (let s = 9; s >= 1; s--) {

        const kt = ke - s * 0.032;

        if (kt < 0) continue;

        const tp = pathAt(kt);

        const ta = fa * (1 - s / 10) * 0.5;

        const tr = Math.max(1, rad * (1 - s / 12));

        ctx.fillStyle = `rgba(${col.front[0]},${col.front[1]},${col.front[2]},${ta.toFixed(3)})`;

        ctx.beginPath(); ctx.arc(tp[0], tp[1], tr, 0, Math.PI * 2); ctx.fill();

      }

      // ── GLOW HALO (layered circles, pigu) ──

      if (ke < 0.95) {

        for (let g = 3; g >= 1; g--) {

          ctx.fillStyle = `rgba(${col.top[0]},${col.top[1]},${col.top[2]},${(fa * 0.16 / g).toFixed(3)})`;

          ctx.beginPath(); ctx.arc(px, py, rad + g * 4, 0, Math.PI * 2); ctx.fill();

        }

      }

      // ── ORBAS ──

      ctx.globalAlpha = fa;

      if (r.ballType && typeof drawSphere === 'function') drawSphere(ctx, px, py, rad, 0, 0, r.ballType, 2, 0);

      else { ctx.fillStyle = `rgba(205,232,255,${fa})`; ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill(); }

      ctx.globalAlpha = 1;

      // baltas „leading" blizgesys

      ctx.fillStyle = `rgba(255,255,255,${(fa * 0.9).toFixed(3)})`;

      ctx.fillRect(Math.round(px - 1), Math.round(py - rad - 2), 2, 2);

      // ── ATVYKIMAS Į KORTĄ — rėmo švytėjimas + žiedas + sparkle burst ──

      if (ke > 0.70) {

        const pk = Math.min(1, (ke - 0.70) / 0.30);

        const ease2 = 1 - Math.pow(1 - pk, 2);

        const cw = _CARD_W, ch = _CARD_H;

        const cx0 = tx - cw / 2, cy0 = ty - ch / 2;

        // Kortos rėmas švyti (dvigubas: auksinis + ball spalva), gęsta

        ctx.lineWidth = 2;

        ctx.strokeStyle = `rgba(${col.top[0]},${col.top[1]},${col.top[2]},${((1 - pk) * 0.8).toFixed(3)})`;

        ctx.strokeRect(cx0 - 3, cy0 - 3, cw + 6, ch + 6);

        ctx.strokeStyle = `rgba(255,232,150,${((1 - pk) * 0.95).toFixed(3)})`;

        ctx.strokeRect(cx0 - 1, cy0 - 1, cw + 2, ch + 2);

        // Besiplečiantis žiedas centre

        ctx.strokeStyle = `rgba(255,240,180,${((1 - pk) * 0.9).toFixed(3)})`;

        ctx.lineWidth = 2;

        ctx.beginPath(); ctx.arc(tx, ty, 4 + ease2 * 22, 0, Math.PI * 2); ctx.stroke();

        // Sparkle burst (6 žiežirbos)

        for (let s = 0; s < 6; s++) {

          const ang = (s / 6) * Math.PI * 2 + pk * 1.5;

          const d = ease2 * 20;

          ctx.fillStyle = `rgba(255,236,155,${((1 - pk) * 0.9).toFixed(3)})`;

          ctx.fillRect(Math.round(tx + Math.cos(ang) * d - 1), Math.round(ty + Math.sin(ang) * d - 1), 2, 2);

        }

        // Trumpas baltas flash pačioj pradžioj

        if (pk < 0.35) {

          ctx.fillStyle = `rgba(255,255,255,${((1 - pk / 0.35) * 0.55).toFixed(3)})`;

          ctx.beginPath(); ctx.arc(tx, ty, 11, 0, Math.PI * 2); ctx.fill();

        }

      }

    }

    ctx.restore();

  }

  // Sienos sugriuvimas — chunky pixel bricks krenta su gravitacija + stone dust cloud

  function _drawWallCollapse(cx, cy, sz, e, elapsed) {

    // walldestroi_sheet.png — destrukcijos animacija, prasideda nuo 4-to kadro (idx 3)

    const ready = _wallDestroyImg.complete && _wallDestroyImg.naturalWidth > 0;

    const PLAY_DUR = 1100;                                  // 12 kadrų per ~1.1s

    const playFrames = _WD_FRAMES - _WD_START_FRAME;        // 15 - 3 = 12

    const prog = Math.min(1, elapsed / PLAY_DUR);

    const frameIdx = Math.min(_WD_FRAMES - 1,

                              _WD_START_FRAME + Math.floor(prog * playFrames));

    // Dydis — aukštis kaip gyvos sienos, plotis seka destrukcijos sheet aspektą

    const wallH = sz * 2.5;

    const destrH = wallH;

    const destrW = destrH * _WD_FRAME_W / _WD_FRAME_H;      // ~0.946 * wallH (platesnis — debris sklaida)

    const groundY = cy + wallH / 2;                         // sienos pagrindo lygis

    const dx = Math.round(cx - destrW / 2);

    const dy = Math.round(groundY - destrH);

    if (ready) {

      ctx.save();

      ctx.imageSmoothingEnabled = false;

      // Paskutinė fazė (po PLAY_DUR) — fade-out, debris išsisklaido

      if (elapsed > PLAY_DUR) {

        ctx.globalAlpha = Math.max(0, 1 - (elapsed - PLAY_DUR) / 300);

      }

      ctx.drawImage(_wallDestroyImg, frameIdx * _WD_FRAME_W, 0, _WD_FRAME_W, _WD_FRAME_H,

                    dx, dy, destrW, destrH);

      ctx.restore();

    } else {

      // Fallback kol sprite kraunasi

      const k = Math.min(1, elapsed / 1200);

      ctx.fillStyle = `rgba(90,74,58,${1 - k})`;

      ctx.fillRect(cx - destrW / 2, dy, destrW, destrH);

    }

  }

  function drawEnemy(cx, cy, sz, e, t) {

    if (e.dead) {

      // Wall'as turi savo sugriuvimo animaciją (ne skull death anim)

      if (e._isWall) {

        _drawWallCollapse(cx, cy, sz, e, t - e.deathStartedAt);

        return;

      }

      // Kraujo burst vieną kartą mirties pradžioj (toks pat kaip unitams)

      if (!e._bloodSpawned) { e._bloodSpawned = true; _spawnBloodBurst(cx, cy, sz * 1.15, t); }

      _drawDeathAnim(cx, cy, sz, t - e.deathStartedAt);

      return;

    }

    const flash = t < e.hitFlashUntil;

    // WALL — wall_sheet.png sprite (16 damage frames, intact→destroyed)

    if (e._isWall) {

      const PX = 2;

      const snap = (v) => Math.round(v / PX) * PX;

      // Sprite aspect 212×384 (0.552) — wallH valdo dydį, wallW seka aspektą

      const wallH = snap(sz * 2.5);

      const wallW = snap(wallH * _WALL_FRAME_W / _WALL_FRAME_H);

      const wx = snap(cx - wallW / 2);

      const wyFinal = snap(cy - wallH / 2);

      const dmgFrac = 1 - (e.hp / e.maxHp);

      // Damage kadras: dmgFrac 0..1 → frame 0 (sveika) .. 15 (sugriuvusi)

      const frameIdx = Math.max(0, Math.min(_WALL_FRAMES - 1, Math.floor(dmgFrac * _WALL_FRAMES)));

      // Spawn statymo animacija — siena statoma EILĖ PO EILĖS iš apačios į viršų

      // (tarsi namas statomas gabaliukais, ne slystamas iš žemės)

      const sinceSpawn = t - (e._wallStart || t);

      const SPAWN_DUR = 600;

      const BUILD_ROWS = 5;                              // 5 mūro eilės

      const spawnK = Math.min(1, sinceSpawn / SPAWN_DUR);

      // Kiek eilių jau pastatyta (diskretūs žingsniai — ne sklandus slydimas)

      const builtRows = Math.min(BUILD_ROWS, Math.floor(spawnK * BUILD_ROWS) + (spawnK > 0 ? 1 : 0));

      const buildFrac = builtRows / BUILD_ROWS;

      const wy = wyFinal;                                // siena visada finalinėj pozicijoj

      // Naujausia eilė "krenta" — mažas settle judesys (pirmus ~80ms po jos atsiradimo)

      const rowProgress = spawnK * BUILD_ROWS;

      const newestRowAge = (rowProgress - (builtRows - 1)) / 1;   // 0..1 naujausios eilės amžius

      const rowH = wallH / BUILD_ROWS;

      // Matoma sienos dalis nuo APAČIOS (jau pastatytos eilės)

      let visibleH = Math.round(rowH * builtRows);

      // Naujausios eilės "drop-in" — pradžioj ji truputį žemiau ir užslysta

      let topRowDrop = 0;

      if (spawnK < 1 && newestRowAge < 0.45) {

        topRowDrop = Math.round(rowH * 0.5 * (1 - newestRowAge / 0.45));

        visibleH -= topRowDrop;

      }

      // Clip — rodom tik pastatytas eiles (nuo apačios)

      ctx.save();

      ctx.beginPath();

      ctx.rect(wx - PX*4, wyFinal + wallH - visibleH, wallW + PX*8, visibleH + 4);

      ctx.clip();

      // ── Wall sprite (damage frame pagal HP) ──

      const wallReady = _wallSheetImg.complete && _wallSheetImg.naturalWidth > 0;

      if (wallReady) {

        ctx.imageSmoothingEnabled = false;

        ctx.drawImage(_wallSheetImg, frameIdx * _WALL_FRAME_W, 0, _WALL_FRAME_W, _WALL_FRAME_H,

                      wx, wy, wallW, wallH);

      } else {

        ctx.fillStyle = '#5a4a3a';

        ctx.fillRect(wx, wy, wallW, wallH);

      }

      // Dust prie pagrindo (kol gyva, pirmom 1.5s)

      if (sinceSpawn < 1500) {

        const dustK = Math.min(1, sinceSpawn / 1500);

        ctx.fillStyle = `rgba(120,100,80,${(1 - dustK) * 0.6})`;

        for (let p = 0; p < 5; p++) {

          const dx = snap(wx + (p / 4) * wallW + Math.sin(t * 0.002 + p) * PX*2);

          const dy = snap(wyFinal + wallH - PX*2);

          ctx.fillRect(dx, dy, PX*2, PX);

        }

      }

      // (hit flash pašalintas — vietoj jo pixel skeveldros, žr. _drawWallChips)

      ctx.restore();

      // (HP bar pašalintas — sienos būklė matosi vizualiai pagal damage kadrus)

      return;

    }

    const fade = 1;

    // Movement check — žemesnis slenkstis kad detect'intų ir bossą (kuris lėtas)

    const isMovingE = e.x > 0 && e.x < 1.0 && t >= e.idleUntil && Math.abs((e._prevX ?? e.x) - e.x) > 0.00002;

    const frameE = _pickSkullAnim(e, t, isMovingE);

    e._prevX = e.x;

    if (frameE) {

      // Boss enemy — didesnis sprite + raudonas tint; per-kind sizeMul iš _F12_ENEMY_KINDS

      const sizeMult = (e.isBoss ? 1.6 : 1.0) * (frameE.sizeMul || 1);

      const dw = sz * 4.5 * sizeMult, dh = sz * 4.5 * sizeMult;

      ctx.save();

      ctx.globalAlpha = fade;

      ctx.imageSmoothingEnabled = false;

      if (flash) ctx.filter = 'brightness(1.5) sepia(1) saturate(2.5) hue-rotate(-30deg)';

      else if (e.isBoss) ctx.filter = 'brightness(0.85) sepia(0.5) saturate(2) hue-rotate(-25deg)';

      // Priešai juda į kairę → flip horizontally. FROST REVERSE → žiūri į dešinę (be flip).

      // AxieRonke sprite — jau native facing LEFT, todėl flip invertuojamas.

      const _revFacing = t < (e.reversedUntil || 0);

      const _spriteFacesLeft = (e.kind === 'axieronke');

      let _scaleX;

      if (_spriteFacesLeft) _scaleX = _revFacing ? -1 : 1;

      else                  _scaleX = _revFacing ? 1 : -1;

      // AxieRonke — pakeltas 8px aukštyn (visi anim states)

      const _yOff = (e.kind === 'axieronke') ? -8 : 0;

      ctx.translate(cx, cy + _yOff);

      ctx.scale(_scaleX, 1);

      ctx.drawImage(frameE.sheet, frameE.sx, frameE.sy, frameE.sw, frameE.sh, -dw / 2, -dh / 2, dw, dh);

      ctx.restore();

      // (Boss karūna panaikinta — boss'as ir taip aiškiai matosi pagal dydį/atspalvį)

    } else {

      const scale = Math.max(1, Math.round(sz * 0.04));

      const sprite = _getSkullSprite(scale, flash);

      ctx.save();

      ctx.globalAlpha = fade;

      ctx.imageSmoothingEnabled = false;

      ctx.drawImage(sprite.canvas,

        Math.round(cx - sprite.w / 2),

        Math.round(cy - sprite.h / 2));

      ctx.restore();

    }

    // Poison cloud — bičių/musių spiečius skraidantis aplink priešą

    if (e._poisonEnd && t < e._poisonEnd && !e.dead) {

      const PX = 2;

      const snap = (v) => Math.round(v / PX) * PX;

      const cloudT = (t - e._poisonStart) * 0.001;

      const baseR = sz * 0.85;

      const eSeed = (e._poisonStart * 0.000123) % 1;

      const SWARM = 12;

      for (let p = 0; p < SWARM; p++) {

        // Per-bičė unique seed

        const bSeed = ((eSeed + p * 0.31) % 1);

        // Orbit speed — kiekviena bičė skraido savo greičiu (1.5 - 4.5 rad/s)

        const orbSpd = 1.5 + bSeed * 3.0;

        // Orbit base radius — varied per bičė

        const orbR = baseR * (0.35 + ((bSeed * 7) % 1) * 0.75);

        // Vertical squish — elliptic orbit

        const verticalScale = 0.5 + ((bSeed * 11) % 1) * 0.4;

        // Phase offset

        const phase = p * (Math.PI * 2 / SWARM) + cloudT * orbSpd;

        // Jitter — kiekvienas frame'as truputi keičiasi pozicija (zigzag bičė)

        const jitterX = Math.sin(cloudT * 7 + p * 2.3) * PX*2;

        const jitterY = Math.cos(cloudT * 6 + p * 1.7) * PX*2;

        // Final position

        const px = snap(cx + Math.cos(phase) * orbR + jitterX);

        const py = snap(cy + Math.sin(phase) * orbR * verticalScale + jitterY);

        // Depth — particles arba priekyje (matomi) arba už unit'o (tamsesni)

        const inFront = Math.sin(phase) > 0;

        const depthAlpha = inFront ? 1 : 0.55;

        // Bičės "kūnas" — 2 chunks: black outline + green core (bee-like)

        const sz2 = PX * 2;

        ctx.fillStyle = `rgba(20,40,10,${depthAlpha})`;

        ctx.fillRect(px - sz2, py - PX, sz2*2, PX*2);   // outline horizontal

        ctx.fillRect(px - PX, py - sz2, PX*2, sz2*2);   // outline vertical

        // Bičės pilvelis — gelsvai žalias (kaip bičė)

        ctx.fillStyle = `rgba(180,220,80,${depthAlpha})`;

        ctx.fillRect(px - PX, py - PX, PX*2, PX*2);

        // Tamsi juostelė ant pilvelio (bičės dryžis)

        ctx.fillStyle = `rgba(40,60,20,${depthAlpha})`;

        ctx.fillRect(px - PX, py, PX*2, PX);

        // Sparnai (mažas baltas blyksis šalia) — flap'inasi

        if (Math.sin(cloudT * 12 + p * 3) > 0.3) {

          ctx.fillStyle = `rgba(220,240,180,${depthAlpha * 0.7})`;

          ctx.fillRect(px - PX*2, py - PX*2, PX, PX);

          ctx.fillRect(px + PX, py - PX*2, PX, PX);

        }

      }

      // Subtle "buzz" trail dotelės — papildomi mažėliai pixels random pozicijoj

      for (let p = 0; p < 6; p++) {

        const ang = ((eSeed * 17 + p * 11) % 1) * Math.PI * 2 + cloudT * 2;

        const rFrac = 0.6 + ((eSeed * 23 + p * 7) % 1) * 0.4;

        const px = snap(cx + Math.cos(ang) * baseR * rFrac);

        const py = snap(cy + Math.sin(ang) * baseR * 0.55 * rFrac);

        const alpha = 0.3 + 0.4 * Math.sin(cloudT * 5 + p);

        ctx.fillStyle = `rgba(150,200,80,${alpha})`;

        ctx.fillRect(px, py, PX, PX);

      }

    }

    // HP bar (fixed virš skull) — boss'as be bar; spider be bar (mirsta nuo 1 hit)

    if (!e.dead && !e.isBoss && e.kind !== 'spider') {

      const bw = sz * 1.2, bh = 3;

      const barY = cy - sz * 1.0 - bh;

      ctx.fillStyle = '#000';

      ctx.fillRect(Math.round(cx - bw / 2), Math.round(barY), Math.round(bw), bh);

      ctx.fillStyle = '#cc2a2a';

      ctx.fillRect(Math.round(cx - bw / 2 + 1), Math.round(barY + 1), Math.round((bw - 2) * (e.hp / e.maxHp)), bh - 2);

    }

  }

  // ── Spirit + Card Deck — merge → spirit orb fly to deck → card spawn/increment

  let _f12Spirits = [];                 // {sx, sy, born, duration, type, value}

  let _f12CardDeck = {};                // {type: {count, lastIncAt}}

  let cardHoverRects = [];              // hover detection

  let _f12CardConsumes = [];            // {type, x, y, born, duration} — naudojimo animacija

  let _f12HpHealFx = null;              // (legacy)

  let _pendingCardDeploy = null;        // (legacy)

  let _draggedCard = null;              // (legacy)

  let unitDropRects = [];               // (legacy)

  let hpBarRect = null;                 // (legacy)

  // Juice feedback state

  let _f12MergePopups = [];             // [{text, x, y, born, color}] — "+N" score popups

  let _f12PerfectPopups = [];           // [{x, y, born, title, fillCol, glowCol}] — chain-aware popup

  let _f12PerfectChain = 0;             // consecutive perfect merges (resets on non-perfect or timeout)

  let _f12PerfectChainAt = 0;           // paskutinio perfect timestamp (5s timeout reset)

  let _f12OverflowSettleAt = 0;         // kai cap pasiektas IR visi balls settled — pradedam 1s grace timer

  let _f12GameOverHandled = false;      // ar game over BGM transition jau atliktas (kad neidegintų kelis kartus)

  let _f12MergeRings = [];              // [{x, y, born, value, color, type}] — per-type burst FX

  let _f12ScreenShake = 0;              // amplitude (px) — sumažėja per laiką

  let _f12LastMergeAt = 0;              // combo tracker

  let _f12ComboCount = 0;

  let _f12ComboFlashAt = 0;

  // Fire feedback state

  let _f12FireRecoil = 0;               // px atsitraukia barrel

  let _f12FireRecoilAng = 0;            // kryptis (priesinga ang)

  let _f12MuzzleFlashes = [];           // [{x, y, ang, born, power, duration}]

  let _f12FireSmoke = [];               // [{x, y, vx, vy, born, size, duration}]

  let _f12WallChips = [];               // [{x, y, vx, vy, born, size, duration, col}] — akmens skeveldros nuo sienos

  let _f12Blood = [];                    // [{x0,y0,vx,vy0,born,duration,size,shade,big}] — unitų mirties kraujas (screen coords)

  let _lastBloodDripAt = 0;              // throttle kraujo lašelių garsui (kad nebūtų kakofonijos)

  // Edit map dekoracijos — persistuoja tarp restart'ų (ne game state)

  let _f12Decorations = (typeof _F12_DEFAULT_DECORATIONS !== 'undefined')

    ? _F12_DEFAULT_DECORATIONS.map(d => ({ ...d }))

    : [];

  // Ambient atmosphere

  let _f12Wind = [];                    // dust/leaves [{x,y,vx,vy,size,life,maxLife,col}]

  let _f12WindStreaks = [];             // wind current streaks [{x,y,vx,vy,life,maxLife,len,bright}]

  let _f12WindDebris = [];              // wind-borne leaves/branches [{x,y,vx,vy,kind,rot,rotV,life,maxLife,palette}]

  let _f12LastDebrisAt = 0;             // throttle debris spawn

  let _f12WindVortexes = [];            // mini whirlwind effects [{cx,cy,vx,vy,spin,baseAng,radius,life,maxLife,arms,bright}]

  let _f12LastVortexAt = 0;

  let _f12Fog = [];                     // [{x,y,vx,r,alpha,phase}]

  // ── DYNAMINIS VĖJAS — keičia kryptį/stiprumą periodiškai, veikia kamuoliukus + particle drift ──

  // Initial state — visada CALM. Pirmas vėjo pokytis tik po ~35s.

  let _f12WindState = {

    vx: 0, vy: 0,

    targetVx: 0, targetVy: 0,

    transStartAt: 0,

    transFromVx: 0, transFromVy: 0,

    transDur: 1500,

    nextChangeAt: 35000,

  };

  // INTRO sequence: step 0 = laukia pradžios, 1 = grojo intro wind (L→R 10s), 2 = post-intro calm, 3+ = normal random

  let _f12WindIntroStep = 0;

  function _updateWindState(t) {

    if (t >= _f12WindState.nextChangeAt) {

      let mag, intervalMs, ang;

      if (_f12WindIntroStep === 0) {

        // INTRO: vidutiniska KAIRе → DESINе (~10s) — susipažinimo eventas

        mag = 65;

        ang = 0;                              // 0 rad = positive X = kairė → dešinė

        intervalMs = 10000;

        _f12WindIntroStep = 1;

      } else if (_f12WindIntroStep === 1) {

        // POST-INTRO calm (~15s) — žaidėjui pailsėti po pirmojo susipažinimo

        mag = 0;

        ang = 0;

        intervalMs = 15000;

        _f12WindIntroStep = 2;

      } else {

        // NORMAL random logic — kaip visada

        const roll = Math.random();

        if (roll < 0.65) {

          // CALM — daznesne tyla (40-80s)

          mag = Math.random() * 6;

          intervalMs = 40000 + Math.random() * 40000;

        } else {

          // ACTIVE — 30-130 px/s. Aktyvi nuotaika trumpiau (18-32s).

          mag = 30 + Math.random() * 100;

          intervalMs = 18000 + Math.random() * 14000;

        }

        ang = Math.random() * Math.PI * 2;

      }

      _f12WindState.targetVx = Math.cos(ang) * mag;

      _f12WindState.targetVy = Math.sin(ang) * mag * 0.5;

      _f12WindState.transStartAt = t;

      _f12WindState.transFromVx = _f12WindState.vx;

      _f12WindState.transFromVy = _f12WindState.vy;

      _f12WindState.transDur = 1000 + Math.random() * 1200;

      _f12WindState.nextChangeAt = t + Math.max(intervalMs, _f12WindState.transDur + 5000);

    }

    // Smooth lerp current → target

    const tk = Math.min(1, (t - _f12WindState.transStartAt) / _f12WindState.transDur);

    const ease = tk < 0.5 ? 2 * tk * tk : 1 - Math.pow(-2 * tk + 2, 2) / 2;

    const baseVx = _f12WindState.transFromVx + (_f12WindState.targetVx - _f12WindState.transFromVx) * ease;

    const baseVy = _f12WindState.transFromVy + (_f12WindState.targetVy - _f12WindState.transFromVy) * ease;

    // Mikro-turbulencija — proporcinga wind stiprumui (kai CALM, turbulencijos beveik nėra)

    const baseM = Math.hypot(baseVx, baseVy);

    const tSec = t * 0.001;

    const microMag = baseM * 0.08;                             // subtle pulsing (anksčiau 0.18)

    const micX = Math.sin(tSec * 1.7) * microMag * 0.6 + Math.sin(tSec * 3.1 + 1.2) * microMag * 0.25;

    const micY = Math.cos(tSec * 1.3 + 0.5) * microMag * 0.6 + Math.cos(tSec * 2.7 + 2.1) * microMag * 0.25;

    _f12WindState.vx = baseVx + micX;

    _f12WindState.vy = baseVy + micY;

  }

  // ── CURL NOISE FIELD — subtle pozicijos varianta, BAZINIS wind dominuoja ─

  function _windFieldAt(x, y, t) {

    const tScale = t * 0.0005;

    const sScale = 0.011;

    const cx = Math.sin(x * sScale + tScale * 1.3) * Math.cos(y * sScale * 1.1 + tScale * 0.7);

    const cy = Math.cos(x * sScale * 1.05 + tScale * 0.9) * Math.sin(y * sScale + tScale * 1.2);

    const c2x = Math.sin(x * sScale * 2.3 + tScale * 2.1) * 0.2;

    const c2y = Math.cos(y * sScale * 2.5 + tScale * 1.8) * 0.2;

    // Subtle curl — dar mažesnė įtaka kad direction būtų aiškus

    return [_f12WindState.vx + (cx + c2x) * 12, _f12WindState.vy + (cy + c2y) * 12];

  }

  // OH SHIT eventai

  let _f12NextBossAt = 50000;           // pirmas boss ~50s nuo start

  let _f12NextHordeAt = 30000;          // pirma horde ~30s nuo start

  let _f12Warnings = [];                // [{text, color, born, duration}]

  let _f12GameStartT = 0;               // pirmas tick'as kai t pradedamas matuoti

  let _f12SpawnedCount = 0;

             // spawned count

  let _f12LaneStrikes = [];             // [{lane, x, type, born, duration, dmg/healAmt, color}]

  let _f12HogStrikes = [];              // [{lane, x, born, duration, seed}] — Hog Rider spear smūgio VFX

  let _f12PendingAttacks = [];          // [{type, value, mx, my, runAt}] — delayed merge attacks

  let _f12DmgPopups = [];               // [{lane, x, dmg, born}] — bendri damage popups

  let _f12PoisonImpacts = [];           // [{lane, x, born, duration, isApply, isSpread}]

  let _f12WallConvert = [];             // [{lane, x, born, duration}] — shadow conversion burst

  let _f12Asteroids = [];               // [{lane, x, born, duration, dmg, value, impacted?}]

  let _f12Traps = [];                   // [{lane, x, born, _cycle, _hitEnemies}] — spygliuoti spąstai

  const _TRAP_CYCLE_MS = 6000;          // 5s pauzė + 1s aktyvus

  const _TRAP_ACTIVE_MS = 1000;         // aktyvaus lango trukmė

  const _TRAP_DMG = 5;                  // -5 dmg priešui užlipus aktyviu metu

  let _f12FrostReverse = [];            // [{lane, born, duration, _endPlayed}] — frost reverse juostos
  // ── PEARL MERGE SKILL „NINJA" — spawninamas kaip NORMALUS ally unitas (utype '_ninja', thief sprite)
  //    į lanes[].allies, žr. _triggerMergeAttack pearl šaką. Naudoja esamą ally kovos AI (be atskiros
  //    sistemos). NE NFT, NE trained — begalinis lifetime, miršta kovoj arba išeina pro kraštą.

  // Arenos zonų plokštės — bendri matmenys (įkepta į sprite + flash overlay)

  const _F12_PLAQUE_W = 48, _F12_PLAQUE_H = 20, _F12_PLAQUE_TOP = 6;

  let _f12ZoneFlash = [0, 0, 0, 0];     // [ts] — paskutinio merge laikas kiekvienoj zonoj

  const _SPIRIT_DURATION = 850;

  const _CARD_CONSUME_DUR = 520;

  const _CARD_W = 68, _CARD_H = 96, _CARD_GAP = 8;

  function _spawnMergeSpirit(srcX, srcY, type, value, t) {

    _f12Spirits.push({ sx: srcX, sy: srcY, type, value, born: t, duration: _SPIRIT_DURATION });

  }

  function _getCardLayout(L) {

    // VISADA rodom VISUS 9 ball tipus (pearl/frost — placeholder, unit ateis vėliau)

    const allTypes = TYPES.slice();

    if (allTypes.length === 0) return null;

    const totalW = allTypes.length * (_CARD_W + _CARD_GAP) - _CARD_GAP;

    const startX = Math.max(20, (L.W - totalW) / 2);

    const cardY = L.H - _CARD_H - 16;

    return { allTypes, totalW, startX, cardY };

  }

  function _tickSpirits(dt, t) {

    for (let i = _f12Spirits.length - 1; i >= 0; i--) {

      const s = _f12Spirits[i];

      if (t - s.born >= s.duration) {

        const utype = _UNIT_FOR_BALL_TYPE[s.type];

        // Bonus aktivuojamas TIK kai šios kortos merge yra PAKARTOTINIS (count >= 1 prieš increment)

        const wasMergedBefore = !!(_f12CardDeck[s.type] && _f12CardDeck[s.type].count >= 1);

        // deployPool inc — visada per merge (nesvarbu pirmas ar pakartotinis)

        if (utype) deployPool[utype] = (deployPool[utype] || 0) + 1;

        if (utype && wasMergedBefore) {

          // ── 3-etapų merge bonus logika — bonus laikas SKALĖJA su merge tier'u ──

          // value=4 (mažiausias merge) = 5s, value=8 = 10s, value=16 = 15s, ...

          const bonusMs = _mergeBonusMs(s.value);

          const bonusSec = Math.round(bonusMs / 1000);

          let bonusApplied = null;     // 'lifetime' | 'cd' | 'stored'

          let bonusX = 0, bonusY = 0;

          // (1) Active deploy check

          for (let li = 0; li < lanes.length && !bonusApplied; li++) {

            for (const a of lanes[li].allies) {

              if (!a.dead && a.utype === utype) {

                a.lifetimeMs = (a.lifetimeMs || _UNIT_LIFETIME_MS) + bonusMs;

                bonusApplied = 'lifetime';

                const _L = layoutCache;

                if (_L) {

                  const baseW = 32;

                  bonusX = _L.lanesX + baseW + (_L.lanesW - baseW - 30) * a.x;

                  bonusY = _L.lanesY + li * _L.laneH + _L.laneH / 2 - 30;

                }

                break;

              }

            }

          }

          // (2) CD active check

          if (!bonusApplied && _f12UnitDeployCD[utype]) {

            const cdRem = _UNIT_DEPLOY_CD_MS - (t - _f12UnitDeployCD[utype]);

            if (cdRem > 0) {

              _f12UnitDeployCD[utype] -= bonusMs;

              bonusApplied = 'cd';

              const _L = layoutCache;

              if (_L && cardHoverRects.length) {

                for (const r of cardHoverRects) {

                  if (r.type === s.type) { bonusX = r.x + _CARD_W / 2; bonusY = r.y - 10; break; }

                }

              }

            }

          }

          // (3) Idle card → kaupiam pre-deploy bonus

          if (!bonusApplied) {

            _f12CardBonusMs[s.type] = (_f12CardBonusMs[s.type] || 0) + bonusMs;

            bonusApplied = 'stored';

            const _L = layoutCache;

            if (_L && cardHoverRects.length) {

              for (const r of cardHoverRects) {

                if (r.type === s.type) { bonusX = r.x + _CARD_W / 2; bonusY = r.y - 10; break; }

              }

            }

          }

          // Popup feedback — su tikra bonus reikšme

          if (bonusApplied && bonusX > 0) {

            const popupText = bonusApplied === 'cd' ? ('-' + bonusSec + 's CD') : ('+' + bonusSec + 's');

            const popupCol = bonusApplied === 'lifetime' ? '#7fff9a'

                            : bonusApplied === 'cd'      ? '#7fc6ff'

                            : '#ffd866';

            _f12BonusPopups.push({ x: bonusX, y: bonusY, text: popupText, born: t, color: popupCol });

          }

        }

        // Sena card deck (vizualas — kortos count nepasikeitė)

        if (!_f12CardDeck[s.type]) _f12CardDeck[s.type] = { count: 0, lastIncAt: t };

        _f12CardDeck[s.type].count++;

        _f12CardDeck[s.type].lastIncAt = t;

        _f12Spirits.splice(i, 1);

      }

    }

    // Card consume animacijos cleanup

    for (let i = _f12CardConsumes.length - 1; i >= 0; i--) {

      if (t - _f12CardConsumes[i].born >= _f12CardConsumes[i].duration) {

        _f12CardConsumes.splice(i, 1);

      }

    }

  }

  function _drawCardConsumes(L, t) {

    if (!_f12CardConsumes.length) return;

    const PX = 2;

    const snap = (v) => Math.round(v / PX) * PX;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (const c of _f12CardConsumes) {

      const elapsed = t - c.born;

      const k = Math.min(1, elapsed / c.duration);

      const col = TYPE_COLOR[c.type] || TYPE_COLOR.arrow;

      const cTop = `rgb(${col.top[0]},${col.top[1]},${col.top[2]})`;

      const cFront = `rgb(${col.front[0]},${col.front[1]},${col.front[2]})`;

      const cLeft = `rgb(${col.left[0]},${col.left[1]},${col.left[2]})`;

      const cx = snap(c.x), cy = snap(c.y);

      // ── Lazy-init shards per consume (suknapsim 1 kartą)

      if (!c._shards) {

        c._shards = [];

        // 14 šukių išskaidymas — random pozicijos kortos viduje

        const cols = 4, rows = 5;

        for (let r = 0; r < rows; r++) {

          for (let col2 = 0; col2 < cols; col2++) {

            // Atsitiktinis subset (~70%) — natūralus crack pattern

            if (Math.random() > 0.75) continue;

            const sx = (col2 + 0.5) / cols - 0.5;   // -0.5..0.5

            const sy = (r + 0.5) / rows - 0.5;

            const px = c.x + sx * _CARD_W;

            const py = c.y + sy * _CARD_H;

            // Velocity outward + upward (explosion + gravity simulation)

            const ang = Math.atan2(sy + 0.1, sx) + (Math.random() - 0.5) * 0.6;

            const sp = 180 + Math.random() * 200;

            c._shards.push({

              px, py, x: px, y: py,

              vx: Math.cos(ang) * sp,

              vy: Math.sin(ang) * sp - 220,  // pradinis šuolis aukštyn

              size: PX * (2 + Math.floor(Math.random() * 2)),  // 4 ar 6 px

              rotV: (Math.random() - 0.5) * 6,

              rot: Math.random() * Math.PI,

              colIdx: Math.floor(Math.random() * 3),  // top/front/left atspalvis

            });

          }

        }

      }

      // ── Pradinė impact flash (pirmas 120ms) — kortos baltas blyksis su scale-up

      if (elapsed < 120) {

        const fk = elapsed / 120;

        const cardW = snap(_CARD_W * (1 + fk * 0.25));

        const cardH = snap(_CARD_H * (1 + fk * 0.25));

        const fx = snap(c.x - cardW / 2);

        const fy = snap(c.y - cardH / 2);

        // Spalvotas pagrindas

        ctx.fillStyle = cTop;

        ctx.fillRect(fx, fy, cardW, cardH);

        // Baltas blyksis ant viršaus

        ctx.fillStyle = `rgba(255,255,255,${(1 - fk) * 0.85})`;

        ctx.fillRect(fx, fy, cardW, cardH);

        // Tamsus juodas outline

        ctx.fillStyle = '#000';

        ctx.fillRect(fx, fy, cardW, PX);

        ctx.fillRect(fx, fy + cardH - PX, cardW, PX);

        ctx.fillRect(fx, fy, PX, cardH);

        ctx.fillRect(fx + cardW - PX, fy, PX, cardH);

      }

      // ── Radial light flash background (pirmas 200ms)

      if (elapsed < 200) {

        const lk = elapsed / 200;

        const gradAlpha = (1 - lk) * 0.4;

        const radius = 60 + lk * 60;

        const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, radius);

        grad.addColorStop(0, `rgba(${col.top[0]},${col.top[1]},${col.top[2]},${gradAlpha})`);

        grad.addColorStop(0.5, `rgba(${col.top[0]},${col.top[1]},${col.top[2]},${gradAlpha * 0.3})`);

        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = grad;

        ctx.fillRect(c.x - radius, c.y - radius, radius * 2, radius * 2);

      }

      // ── Šukių simuliacija — chunky pixel shards su gravitacija

      const shardK = Math.max(0, (elapsed - 80) / (c.duration - 80));

      const dts = 0.016;

      const G = 800;

      ctx.fillStyle = cFront;

      for (const s of c._shards) {

        // Simple incremental integration

        s.x += s.vx * dts;

        s.y += s.vy * dts;

        s.vy += G * dts;

        s.rot += s.rotV * dts;

        // Spalva pagal pradinį pasirinkimą

        const cc = s.colIdx === 0 ? cTop : (s.colIdx === 1 ? cFront : cLeft);

        const sx = snap(s.x), sy = snap(s.y);

        const sz = s.size;

        const alpha = 1 - shardK * 0.9;

        ctx.globalAlpha = alpha;

        // Sukamosi pixel shard — 2 chunks pakreipti pseudo-rotation

        const ro = Math.cos(s.rot) > 0 ? 0 : PX;

        ctx.fillStyle = cc;

        ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);

        // Dark edge

        ctx.fillStyle = '#000';

        ctx.fillRect(sx - sz / 2 + ro, sy + sz / 2 - PX, sz - PX, PX);

      }

      // ── Impact ring — 1 short pixel ring expanding & fading (peak ~150ms)

      const ringElapsed = Math.max(0, elapsed - 30);

      const ringMax = 220;

      if (ringElapsed < ringMax) {

        const rk = ringElapsed / ringMax;

        const ringR = snap(rk * 60);

        ctx.globalAlpha = (1 - rk) * 0.85;

        ctx.strokeStyle = cTop;

        ctx.lineWidth = PX;

        ctx.strokeRect(cx - ringR, cy - ringR, ringR * 2, ringR * 2);

        // Pixel art "+" cross sparks (4 pažymėjimai)

        ctx.fillStyle = '#ffffff';

        const crossR = snap(ringR + PX*2);

        ctx.fillRect(cx - PX, cy - crossR, PX*2, PX*2);

        ctx.fillRect(cx - PX, cy + crossR - PX, PX*2, PX*2);

        ctx.fillRect(cx - crossR, cy - PX, PX*2, PX*2);

        ctx.fillRect(cx + crossR - PX, cy - PX, PX*2, PX*2);

      }

    }

    ctx.globalAlpha = 1;

    ctx.restore();

  }

  function _drawSpirits(L, t) {

    if (!_f12Spirits.length) return;

    const layout = _getCardLayout(L);

    if (!layout) return;

    const PX = 2;  // pixel art chunk size

    const snap = (v) => Math.round(v / PX) * PX;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    for (const s of _f12Spirits) {

      const elapsed = t - s.born;

      const k = Math.min(1, elapsed / s.duration);

      const eased = 1 - Math.pow(1 - k, 3);   // ease-out cubic

      const idx = layout.allTypes.indexOf(s.type);

      const targetX = layout.startX + idx * (_CARD_W + _CARD_GAP) + _CARD_W / 2;

      const targetY = layout.cardY + _CARD_H / 2;

      const x = s.sx + (targetX - s.sx) * eased;

      const baseY = s.sy + (targetY - s.sy) * eased;

      const arcHeight = 100 * Math.sin(k * Math.PI) * 0.6;

      const y = baseY - arcHeight;

      const col = TYPE_COLOR[s.type] || TYPE_COLOR.arrow;

      const cTop = `rgb(${col.top[0]},${col.top[1]},${col.top[2]})`;

      const cFront = `rgb(${col.front[0]},${col.front[1]},${col.front[2]})`;

      const cLeft = `rgb(${col.left[0]},${col.left[1]},${col.left[2]})`;

      // ── Chunky pixel trail — 5 chunks behind

      for (let i = 1; i <= 5; i++) {

        const trailK = Math.max(0, k - i * 0.06);

        if (trailK <= 0) continue;

        const tEased = 1 - Math.pow(1 - trailK, 3);

        const tx = snap(s.sx + (targetX - s.sx) * tEased);

        const tbaseY = s.sy + (targetY - s.sy) * tEased;

        const tArc = 100 * Math.sin(trailK * Math.PI) * 0.6;

        const ty = snap(tbaseY - tArc);

        const tAlpha = (1 - i * 0.18) * (1 - k * 0.4);

        const tr = Math.max(PX, snap(10 - i * 1.6));

        ctx.globalAlpha = tAlpha * 0.7;

        ctx.fillStyle = cFront;

        ctx.fillRect(tx - tr, ty - tr/2, tr*2, tr);

        ctx.fillRect(tx - tr/2, ty - tr, tr, tr*2);

      }

      // ── Pixel art orb — chunky stepped diamond/sphere

      const ox = snap(x), oy = snap(y);

      const R = snap(12);

      // Outer halo (4 arms — pixel cross)

      ctx.globalAlpha = 0.04 * (1 - k * 0.3);

      ctx.fillStyle = cTop;

      const halo = R + PX*3;

      ctx.fillRect(ox - halo, oy - PX, halo*2, PX*2);

      ctx.fillRect(ox - PX, oy - halo, PX*2, halo*2);

      // Core body — chunky stepped circle (octagon-ish)

      ctx.globalAlpha = 1;

      // Outer ring (darker)

      ctx.fillStyle = cLeft;

      ctx.fillRect(ox - R, oy - R + PX*2, R*2, R*2 - PX*4);

      ctx.fillRect(ox - R + PX*2, oy - R, R*2 - PX*4, R*2);

      ctx.fillRect(ox - R + PX, oy - R + PX, R*2 - PX*2, R*2 - PX*2);

      // Mid (front color)

      ctx.fillStyle = cFront;

      const m = R - PX*2;

      ctx.fillRect(ox - m, oy - m + PX, m*2, m*2 - PX*2);

      ctx.fillRect(ox - m + PX, oy - m, m*2 - PX*2, m*2);

      // Inner highlight (top)

      ctx.fillStyle = cTop;

      ctx.fillRect(ox - PX*3, oy - PX*4, PX*6, PX*3);

      // Bright spec dot (top-left)

      ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - k * 0.4)})`;

      ctx.fillRect(ox - PX*3, oy - PX*3, PX*2, PX);

      ctx.fillRect(ox - PX*3, oy - PX*2, PX, PX);

      // ── Sparkle particles — pixel chunks orbiting

      const sparkSeed = (s.born * 0.001) % 1;

      for (let p = 0; p < 4; p++) {

        const ang = k * Math.PI * 4 + p * Math.PI / 2 + sparkSeed * Math.PI * 2;

        const rad = R + PX*4 + Math.sin(k * Math.PI * 3 + p) * PX*2;

        const sx = snap(ox + Math.cos(ang) * rad);

        const sy = snap(oy + Math.sin(ang) * rad);

        ctx.globalAlpha = (0.7 + 0.3 * Math.sin(k * Math.PI * 6 + p)) * (1 - k * 0.5);

        ctx.fillStyle = '#ffffff';

        ctx.fillRect(sx - PX/2, sy - PX/2, PX, PX);

      }

    }

    ctx.globalAlpha = 1;

    ctx.restore();

  }

  function _drawCards(L, t) {

    const layout = _getCardLayout(L);

    if (!layout) return;

    // Hover detection — VISOM kortom (taip pat ir locked)

    let hoverIdx = -1;

    cardHoverRects = [];

    for (let i = 0; i < layout.allTypes.length; i++) {

      const tp = layout.allTypes[i];

      const cx = layout.startX + i * (_CARD_W + _CARD_GAP);

      const cy = layout.cardY;

      cardHoverRects.push({ x: cx, y: cy, w: _CARD_W, h: _CARD_H, type: tp, idx: i });

      if (mouse.x >= cx && mouse.x <= cx + _CARD_W && mouse.y >= cy - 14 && mouse.y <= cy + _CARD_H) {

        hoverIdx = i;

      }

    }

    // Helper — single card render (stack background or main front)

    // Pixel art stilius: chunky banding, dithering, cornered borders, no smooth gradients

    function _drawCardLayer(cx, cy, col, brightnessShift, isFrontCard, type) {

      const PX = 2;

      const shift = brightnessShift;

      const clip = (v) => Math.max(0, Math.min(255, v));

      const top = `rgb(${clip(col.top[0]+shift)},${clip(col.top[1]+shift)},${clip(col.top[2]+shift)})`;

      const topLight = `rgb(${clip(col.top[0]+shift+30)},${clip(col.top[1]+shift+30)},${clip(col.top[2]+shift+30)})`;

      const front = `rgb(${clip(col.front[0]+shift)},${clip(col.front[1]+shift)},${clip(col.front[2]+shift)})`;

      const left = `rgb(${clip(col.left[0]+shift)},${clip(col.left[1]+shift)},${clip(col.left[2]+shift)})`;

      const dark = `rgb(${clip(col.left[0]+shift-30)},${clip(col.left[1]+shift-30)},${clip(col.left[2]+shift-30)})`;

      // ── L1: 2px juodas outer outline

      ctx.fillStyle = '#000';

      ctx.fillRect(cx, cy, _CARD_W, _CARD_H);

      // Pixel art rounded corners (2px cut)

      ctx.clearRect(cx, cy, PX, PX);

      ctx.clearRect(cx + _CARD_W - PX, cy, PX, PX);

      ctx.clearRect(cx, cy + _CARD_H - PX, PX, PX);

      ctx.clearRect(cx + _CARD_W - PX, cy + _CARD_H - PX, PX, PX);

      // ── L2: gold/medienos frame (2px iš vidaus) — medieval feel

      const frameDark = isFrontCard ? '#5a3820' : '#3a2410';

      const frameLight = isFrontCard ? '#a87850' : '#624028';

      ctx.fillStyle = frameDark;

      ctx.fillRect(cx + PX, cy + PX, _CARD_W - PX*2, _CARD_H - PX*2);

      // Frame highlight pixel'iai (top + left edges)

      ctx.fillStyle = frameLight;

      ctx.fillRect(cx + PX, cy + PX, _CARD_W - PX*2, PX);    // top

      ctx.fillRect(cx + PX, cy + PX, PX, _CARD_H - PX*2);    // left

      // Frame shadow (bottom + right)

      ctx.fillStyle = '#1a0e06';

      ctx.fillRect(cx + PX, cy + _CARD_H - PX*2, _CARD_W - PX*2, PX);    // bottom

      ctx.fillRect(cx + _CARD_W - PX*2, cy + PX, PX, _CARD_H - PX*2);    // right

      // ── L3: 3 zonų vidinis dydis — title strip (top), main panel (middle), bottom strip

      const ix = cx + PX*3, iy = cy + PX*3;

      const iw = _CARD_W - PX*6, ih = _CARD_H - PX*6;

      // Inner dark border

      ctx.fillStyle = '#0a0604';

      ctx.fillRect(ix, iy, iw, ih);

      // Inner content area

      const cx2 = ix + PX, cy2 = iy + PX;

      const cw = iw - PX*2, chh = ih - PX*2;

      // Banding — 5 stripes su švelnesnia darker progression

      const bandH = Math.floor(chh / 5 / PX) * PX;

      const bands = [topLight, top, top, front, left];

      for (let bi = 0; bi < 5; bi++) {

        ctx.fillStyle = bands[bi];

        const lastH = bi === 4 ? (chh - bandH * 4) : bandH;

        ctx.fillRect(cx2, cy2 + bi * bandH, cw, lastH);

      }

      // Dithering tarp bandų (subtle, just between adjacent)

      const dither = (y0, h, c) => {

        ctx.fillStyle = c;

        for (let py = 0; py < h; py += PX) {

          for (let px = 0; px < cw; px += PX*2) {

            const off = (py / PX) % 2 === 0 ? 0 : PX;

            if (px + off + PX > cw) continue;

            ctx.fillRect(cx2 + px + off, cy2 + y0 + py, PX, PX);

          }

        }

      };

      dither(bandH - PX, PX, top);

      dither(bandH*2 - PX, PX, top);

      dither(bandH*3 - PX, PX, front);

      dither(bandH*4 - PX, PX, left);

      // ── L4: seni glyph'ai (širdis/strėle/etc.) pašalinti — vietoj jų piešiama unit ikona ──

      // (kviečiama iš _drawCards išorinio loop'o po _drawCardLayer)

      // ── L5: chunky pixel highlights — top-left stairs (2px chunky)

      ctx.fillStyle = `rgba(255,255,255,${isFrontCard ? 0.45 : 0.22})`;

      ctx.fillRect(cx2, cy2, cw - PX, PX);

      ctx.fillRect(cx2, cy2, PX, chh - PX);

      ctx.fillRect(cx2 + PX, cy2 + PX, PX, PX);   // inner sparkle

      // ── L6: chunky shadow — bottom-right

      ctx.fillStyle = `rgba(0,0,0,${isFrontCard ? 0.50 : 0.55})`;

      ctx.fillRect(cx2 + PX, cy2 + chh - PX, cw - PX, PX);

      ctx.fillRect(cx2 + cw - PX, cy2 + PX, PX, chh - PX);

      // ── L7: kampuose dekoratyvūs rivets (4 + 4 - viršuje aukso, apačioje tamsūs)

      if (isFrontCard) {

        // Aukso rivets viršuje

        ctx.fillStyle = '#d4a050';

        ctx.fillRect(cx2 + PX*2, cy2 + PX*2, PX, PX);

        ctx.fillRect(cx2 + cw - PX*3, cy2 + PX*2, PX, PX);

        // Highlight pixel ant rivet

        ctx.fillStyle = '#ffe7a8';

        ctx.fillRect(cx2 + PX*2, cy2 + PX*2, PX/2, PX/2);

        ctx.fillRect(cx2 + cw - PX*3, cy2 + PX*2, PX/2, PX/2);

        // Tamsūs rivets apačioje

        ctx.fillStyle = dark;

        ctx.fillRect(cx2 + PX*2, cy2 + chh - PX*3, PX, PX);

        ctx.fillRect(cx2 + cw - PX*3, cy2 + chh - PX*3, PX, PX);

      }

    }

    // Pixel art glyph ikona pagal type — chunky pixel sprite kortos centre

    function _drawCardGlyph(cx, cy, type, fillColor, outlineColor) {

      const PX = 2;

      // 11x11 grid sprites (1 = užpildyta)

      const GLYPHS = {

        arrow:   ["00000010000","00000011000","00000011100","11111111110","11111111110","00000011100","00000011000","00000010000"],

        shield:  ["00111111100","11111111110","11111111110","11111111110","11011111011","01111111110","00111111100","00011111000","00001110000"],

        heart:   ["01110001110","11111011111","11111111111","11111111111","11111111111","01111111110","00111111100","00011111000","00000111000","00000010000"],

        leaf:    ["00000000110","00000001110","00001111111","00111111110","01111111100","11111111000","11111100000","11110000000","00000000000"],

        star:    ["00000010000","00000111000","11111111111","01111111110","00111111100","01111111110","11100011111","11000000111","00000000000"],

        crystal: ["00000010000","00000111000","00001111100","00011111110","00111111111","00011111110","00001111100","00000111000","00000010000"],

        shadow:  ["00111111100","01111111110","11111111111","11111111111","11111111111","11111111111","11111111111","01111111110","00111111100"],

        pearl:   ["00011111000","00111111100","01111111110","11111111111","11111111111","11111111111","01111111110","00111111100","00011111000"],

        frost:   ["00000100000","01000100010","00100100100","00010101000","11111111111","00010101000","00100100100","01000100010","00000100000"],

      };

      const g = GLYPHS[type] || GLYPHS.arrow;

      const rows = g.length;

      const cols = g[0].length;

      const totalW = cols * PX;

      const totalH = rows * PX;

      const startX = Math.round((cx - totalW / 2) / PX) * PX;

      const startY = Math.round((cy - totalH / 2) / PX) * PX;

      // Outline pass (4 directions)

      ctx.fillStyle = outlineColor;

      for (let r = 0; r < rows; r++) {

        for (let c = 0; c < cols; c++) {

          if (g[r][c] === '1') {

            const sx = startX + c * PX, sy = startY + r * PX;

            ctx.fillRect(sx - PX, sy, PX, PX);

            ctx.fillRect(sx + PX, sy, PX, PX);

            ctx.fillRect(sx, sy - PX, PX, PX);

            ctx.fillRect(sx, sy + PX, PX, PX);

          }

        }

      }

      // Fill pass

      ctx.fillStyle = fillColor;

      for (let r = 0; r < rows; r++) {

        for (let c = 0; c < cols; c++) {

          if (g[r][c] === '1') {

            ctx.fillRect(startX + c * PX, startY + r * PX, PX, PX);

          }

        }

      }

    }

    for (let i = 0; i < layout.allTypes.length; i++) {

      const tp = layout.allTypes[i];

      const card = _f12CardDeck[tp];

      const isLocked = !card;          // niekada nesumerge'inta → locked

      const baseCx = layout.startX + i * (_CARD_W + _CARD_GAP);

      const baseCy = layout.cardY;

      const isHovered = hoverIdx === i;

      const hoverLift = isHovered ? -10 : 0;

      const col = TYPE_COLOR[tp] || TYPE_COLOR.arrow;

      // ── STACK BACKGROUND CARDS — tik unlocked kortom (max 2 behind)

      if (!isLocked) {

        const stackBehind = Math.min(2, card.count - 1);

        for (let s = stackBehind; s >= 1; s--) {

          const offX = s * 3;

          const offY = -s * 4;

          _drawCardLayer(baseCx + offX, baseCy + hoverLift + offY, col, -22 * s, false, tp);

        }

      }

      // ── MAIN (front) card — bounce-in tik unlocked (kai naujai spawn'inta)

      const elapsedSpawn = card ? (t - (card.lastIncAt || 0)) : Infinity;

      let bounceY = 0, bounceScale = 1;

      if (!isLocked && elapsedSpawn < 600) {

        const bk = elapsedSpawn / 600;

        if (bk < 0.3) {

          const sk = bk / 0.3;

          bounceScale = 0.6 + sk * 0.55;

          bounceY = -20 * (1 - sk);

        } else {

          const sk = (bk - 0.3) / 0.7;

          bounceScale = 1.15 - sk * 0.04;

        }

      }

      const cx = baseCx;

      const cy = baseCy + hoverLift + bounceY;

      // Locked kortos — sumažintas alpha (be ctx.filter — labai brangus)

      if (isLocked) {

        ctx.save();

        ctx.globalAlpha = 0.6;

      }

      if (bounceScale !== 1) {

        ctx.save();

        ctx.translate(cx + _CARD_W / 2, cy + _CARD_H / 2);

        ctx.scale(bounceScale, bounceScale);

        ctx.translate(-(cx + _CARD_W / 2), -(cy + _CARD_H / 2));

        _drawCardLayer(cx, cy, col, 0, true, tp);

        ctx.restore();

      } else {

        _drawCardLayer(cx, cy, col, 0, true, tp);

      }

      if (isLocked) ctx.restore();

      // Hover glow — gold outer outline

      if (isHovered) {

        ctx.strokeStyle = `rgba(255,235,170,${0.7 + 0.3 * Math.sin(t * 0.008)})`;

        ctx.lineWidth = 2;

        ctx.strokeRect(cx - 1, cy - 1, _CARD_W + 2, _CARD_H + 2);

      }

      // ── UNIT IKONA — virš banding'o, kad žaidėjas matytų kokį unit'ą deploy'ins ──

      const _mappedUtypeForIcon = _UNIT_FOR_BALL_TYPE[tp];

      if (_mappedUtypeForIcon) {

        const iconCx = cx + _CARD_W / 2;

        const iconCy = cy + _CARD_H / 2 - 2;

        if (isLocked) {

          ctx.save();

          ctx.globalAlpha = 0.35;     // tiesiog blanksiau (be ctx.filter, kuris brangus)

        }

        // Character unit'ai (animuoti) — DAR DIDESNI; buildings (tower/zip) — SUMAŽINTI

        const isCharacter = (_mappedUtypeForIcon === 'archer' || _mappedUtypeForIcon === 'harpoon_fish'

                          || _mappedUtypeForIcon === 'shaman' || _mappedUtypeForIcon === 'skull'

                          || _mappedUtypeForIcon === 'hog_rider');

        const maxW = isCharacter ? _CARD_W + 28 : _CARD_W - 24;   // chars: 96, buildings: 44

        const maxH = isCharacter ? _CARD_H + 14 : _CARD_H - 32;   // chars: 110, buildings: 64

        _drawUnitIcon(_mappedUtypeForIcon, iconCx, iconCy, maxW, maxH, t);

        if (isLocked) ctx.restore();

      }

      // ── „COMING SOON" overlay — kortos be unit mapping (pearl, frost) ──

      const _utypeForCheck = _UNIT_FOR_BALL_TYPE[tp];

      if (!_utypeForCheck) {

        // Tamsus overlay

        ctx.fillStyle = 'rgba(20,40,80,0.55)';

        ctx.fillRect(cx, cy, _CARD_W, _CARD_H);

        // „COMING / SOON" tekstas centre

        ctx.fillStyle = '#000';

        ctx.font = 'bold 8px "Press Start 2P", monospace';

        ctx.textAlign = 'center';

        ctx.fillText('COMING', cx + _CARD_W / 2 + 1, cy + _CARD_H / 2 - 2);

        ctx.fillStyle = '#a8c8ff';

        ctx.fillText('COMING', cx + _CARD_W / 2, cy + _CARD_H / 2 - 3);

        ctx.fillStyle = '#000';

        ctx.fillText('SOON', cx + _CARD_W / 2 + 1, cy + _CARD_H / 2 + 11);

        ctx.fillStyle = '#a8c8ff';

        ctx.fillText('SOON', cx + _CARD_W / 2, cy + _CARD_H / 2 + 10);

      }

      // ── „NO TRAINED" indikatorius — kalėjimo grotos + KAUKOLĖS LOGO centre ──

      // Skull = aiškiai signalizuoja „unit'as prarastas / netreniruotas → reikia retreniruoti HOME"

      const _trainedNow = _utypeForCheck ? _getTrainedCount(_utypeForCheck) : 0;

      if (!isLocked && _utypeForCheck && _trainedNow === 0) {

        // Animacijos timer start (kortelės pirmas matomas „locked" frame'as)

        if (!_f12CardBarsAnimAt[tp]) _f12CardBarsAnimAt[tp] = t;

        const animEl = t - _f12CardBarsAnimAt[tp];

        const OPEN_MS = 500, DROP_MS = 400;

        // Garsiukas — paleidžiamas kai grotos PRADEDA kristi (po OPEN_MS pauzės)

        if (animEl >= OPEN_MS && !_f12CardBarsSoundDone[tp]) {

          _f12CardBarsSoundDone[tp] = true;

          _F12Audio.barsClose();

        }

        // Y offset — pradžioj virš kortos (-_CARD_H), slenkasi į vietą po OPEN_MS

        let yOffset = 0;

        if (animEl < OPEN_MS) {

          // Atidengta — grotos užmaskuotos virš ekrano

          yOffset = -_CARD_H - 10;

        } else if (animEl < OPEN_MS + DROP_MS) {

          // Nusileidimo animacija (ease-out cubic — staiga sustoja apačioj)

          const k = (animEl - OPEN_MS) / DROP_MS;

          const eased = 1 - Math.pow(1 - k, 3);

          yOffset = (1 - eased) * -(_CARD_H + 10);

        }

        // Po drop pabaigos — fiksuotos grotos (yOffset = 0)

        // Tamsus overlay tik kai grotos atvykę (>OPEN_MS)

        if (animEl >= OPEN_MS) {

          const overlayK = Math.min(1, (animEl - OPEN_MS) / DROP_MS);

          ctx.fillStyle = `rgba(0,0,0,${0.30 * overlayK})`;

          ctx.fillRect(cx, cy, _CARD_W, _CARD_H);

        }

        // Clip — grotos negali išeiti iš kortos rėmo

        ctx.save();

        ctx.beginPath();

        ctx.rect(cx, cy, _CARD_W, _CARD_H);

        ctx.clip();

        // ── PRISON BARS — 4 vertikalūs metalo stulpeliai + viršutinis ir apatinis horizontalūs ──

        const ironDark = '#1a1a1e';

        const ironMid = '#4a4a52';

        const ironLight = '#7a7a82';

        const ironHi = '#b8b8c0';

        // Horizontalus viršutinis beam (frame top)

        ctx.fillStyle = ironDark;

        ctx.fillRect(cx, cy + yOffset, _CARD_W, 5);

        ctx.fillStyle = ironMid;

        ctx.fillRect(cx, cy + yOffset + 1, _CARD_W, 3);

        ctx.fillStyle = ironLight;

        ctx.fillRect(cx, cy + yOffset + 1, _CARD_W, 1);

        // 4 vertical bars

        const barW = 4;

        const numBars = 4;

        const totalBars = numBars * barW;

        const totalGap = _CARD_W - totalBars;

        const gapW = totalGap / (numBars + 1);

        for (let bi = 0; bi < numBars; bi++) {

          const bx = cx + gapW + bi * (barW + gapW);

          // Bar body (visa kortelės aukšy + offset)

          ctx.fillStyle = ironDark;

          ctx.fillRect(Math.round(bx), cy + yOffset, barW, _CARD_H);

          ctx.fillStyle = ironMid;

          ctx.fillRect(Math.round(bx) + 1, cy + yOffset, barW - 2, _CARD_H);

          ctx.fillStyle = ironHi;

          ctx.fillRect(Math.round(bx) + 1, cy + yOffset, 1, _CARD_H);     // left highlight

        }

        // Horizontalus apatinis beam (frame bottom) — TIK kai grotos pilnai nusileido (yOffset=0)

        if (yOffset === 0) {

          ctx.fillStyle = ironDark;

          ctx.fillRect(cx, cy + _CARD_H - 5, _CARD_W, 5);

          ctx.fillStyle = ironMid;

          ctx.fillRect(cx, cy + _CARD_H - 4, _CARD_W, 3);

          ctx.fillStyle = '#2a2a30';

          ctx.fillRect(cx, cy + _CARD_H - 1, _CARD_W, 1);     // bottom shadow

        }

        // Rivets ant viršutinio beam (4 — kampe ir vidury)

        ctx.fillStyle = ironLight;

        const rivetY = cy + yOffset + 2;

        ctx.fillRect(cx + 3, rivetY, 2, 2);

        ctx.fillRect(cx + _CARD_W - 5, rivetY, 2, 2);

        ctx.fillRect(cx + _CARD_W / 3, rivetY, 2, 2);

        ctx.fillRect(cx + _CARD_W * 2 / 3, rivetY, 2, 2);

        ctx.restore();

        // ── KAUKOLĖS LOGO — atsiranda tik kai grotos pilnai nusileido (after drop anim) ──

        if (yOffset === 0) {

          const PX = 2;

          const skullCx = cx + _CARD_W / 2;

          const skullCy = cy + _CARD_H / 2;

          // SKULL_PATTERN simplified — 11×11 pixel art kaukolė

          const sk = [

            "00011111000",

            "00111111100",

            "01111111110",

            "01100110110",

            "01100110110",

            "01111111110",

            "01011111010",

            "00111111100",

            "00010101000",

            "00010001000",

          ];

          const SP = PX;

          const W = sk[0].length, H = sk.length;

          const startX = Math.round(skullCx - W * SP / 2);

          const startY = Math.round(skullCy - H * SP / 2);

          // Outline shadow (juodas)

          ctx.fillStyle = '#000';

          for (let r = 0; r < H; r++) {

            for (let cI = 0; cI < W; cI++) {

              if (sk[r][cI] === '1') {

                ctx.fillRect(startX + cI * SP - 1, startY + r * SP, SP + 2, SP);

                ctx.fillRect(startX + cI * SP, startY + r * SP - 1, SP, SP + 2);

              }

            }

          }

          // Bone fill — šviesi (raudonu tint'u — death)

          ctx.fillStyle = '#f0e8d8';

          for (let r = 0; r < H; r++) {

            for (let cI = 0; cI < W; cI++) {

              if (sk[r][cI] === '1') ctx.fillRect(startX + cI * SP, startY + r * SP, SP, SP);

            }

          }

          // Akys + nosis tamsios (kaukolės skylės)

          ctx.fillStyle = '#3a0606';

          const eyeRows = [3, 4]; const eyeCols = [2, 3, 6, 7];

          for (const r of eyeRows) for (const cI of eyeCols) ctx.fillRect(startX + cI * SP, startY + r * SP, SP, SP);

          ctx.fillRect(startX + 5 * SP, startY + 6 * SP, SP, SP);

        }

      } else if (_f12CardBarsAnimAt[tp]) {

        // Reset animacijos — kortelės state pasikeitė (treniruota arba taps locked vėliau)

        delete _f12CardBarsAnimAt[tp];

        delete _f12CardBarsSoundDone[tp];          // garsiukas vėl grodins kitą kartą

      }

      // ── Trained count badge — VISADA rodom unlocked kortom (1x, 2x, 0x), su spalvos kodu ──

      if (!isLocked && _utypeForCheck) {

        ctx.font = 'bold 8px "Press Start 2P", monospace';

        ctx.textAlign = 'center';

        ctx.fillStyle = '#000';

        ctx.fillText(_trainedNow + 'x', cx + 14 - 1, cy + 11);

        ctx.fillText(_trainedNow + 'x', cx + 14 + 1, cy + 11);

        ctx.fillText(_trainedNow + 'x', cx + 14, cy + 11 - 1);

        ctx.fillText(_trainedNow + 'x', cx + 14, cy + 11 + 1);

        ctx.fillStyle = _trainedNow > 0 ? '#7fff9a' : '#ff6b6b';

        ctx.fillText(_trainedNow + 'x', cx + 14, cy + 11);

      }

      // ── ACTIVE DEPLOY LIFETIME BAR — kai unit kovoja lane'oj, rodo kiek liko jo gyvavimo ──

      let _activeAlly = null;

      if (!isLocked && _utypeForCheck) {

        for (let li = 0; li < lanes.length && !_activeAlly; li++) {

          for (const a of lanes[li].allies) {

            if (!a.dead && a.utype === _utypeForCheck) { _activeAlly = a; break; }

          }

        }

      }

      if (_activeAlly) {

        const age = t - _activeAlly.bornAt;

        const lifeMs = _activeAlly.lifetimeMs || _UNIT_LIFETIME_MS;

        const remainMs = Math.max(0, lifeMs - age);

        const lifeFrac = Math.max(0, 1 - age / lifeMs);

        const remainSec = Math.max(0, Math.ceil(remainMs / 1000));

        // Bar dimensions — apatinis horizontalus

        const barH = 13;

        const barY = cy + _CARD_H - barH - 1;

        const barX = cx + 2;

        const barW = _CARD_W - 4;

        // 1) Outer dark border + frame

        ctx.fillStyle = '#000';

        ctx.fillRect(cx + 1, barY - 1, _CARD_W - 2, barH + 2);

        // 2) Inner dark bar background (subtle red gradient hint)

        ctx.fillStyle = '#1a0a06';

        ctx.fillRect(barX, barY, barW, barH);

        // 3) Smooth color lerp: žalia (100%) → geltona (50%) → raudona (0%)

        let r, g, b;

        if (lifeFrac > 0.5) {

          const k = (lifeFrac - 0.5) * 2;             // 0..1 (yellow→green)

          r = Math.round(255 * (1 - k) + 127 * k);

          g = Math.round(220 * (1 - k) + 255 * k);

          b = Math.round(100 * (1 - k) + 154 * k);

        } else {

          const k = lifeFrac * 2;                      // 0..1 (red→yellow)

          r = 255;

          g = Math.round(80 * (1 - k) + 220 * k);

          b = Math.round(80 * (1 - k) + 100 * k);

        }

        const fillW = Math.round(barW * lifeFrac);

        if (fillW > 0) {

          // 4) Vertikalus 3-band gradient (tamsus apačioj → vidury bazinis → šviesus viršuj — liquid feel)

          const darkR = Math.max(0, r - 50), darkG = Math.max(0, g - 50), darkB = Math.max(0, b - 50);

          const lightR = Math.min(255, r + 50), lightG = Math.min(255, g + 50), lightB = Math.min(255, b + 50);

          ctx.fillStyle = `rgb(${darkR},${darkG},${darkB})`;

          ctx.fillRect(barX, barY + Math.floor(barH * 2 / 3), fillW, Math.ceil(barH / 3));

          ctx.fillStyle = `rgb(${r},${g},${b})`;

          ctx.fillRect(barX, barY + Math.floor(barH / 3), fillW, Math.floor(barH / 3));

          ctx.fillStyle = `rgb(${lightR},${lightG},${lightB})`;

          ctx.fillRect(barX, barY, fillW, Math.floor(barH / 3));

          // 5) Bright highlight stripe ant top edge (1px white)

          ctx.fillStyle = 'rgba(255,255,255,0.6)';

          ctx.fillRect(barX, barY, fillW, 1);

          // 6) Leading edge spark — šviesus pixel ant dešinio krašto + sparks virš jo

          if (fillW < barW) {

            const edgeX = barX + fillW - 1;

            ctx.fillStyle = '#ffffff';

            ctx.fillRect(edgeX, barY, 1, barH);

            ctx.fillStyle = `rgba(${lightR},${lightG},${lightB},0.85)`;

            ctx.fillRect(edgeX - 1, barY, 1, barH);

            // Sparkle virš leading edge (pulse'inasi)

            const sparkA = 0.5 + 0.5 * Math.sin(t * 0.015);

            ctx.fillStyle = `rgba(255,255,180,${sparkA})`;

            ctx.fillRect(edgeX, barY - 2, 2, 1);

          }

        }

        // 7) Pulse'inantis timer text — heartbeat kas sekundę + color shift

        const subSec = (remainMs % 1000) / 1000;

        const pulseScale = subSec < 0.12 ? 1 + (1 - subSec / 0.12) * 0.18 : 1;

        const fontSize = Math.round(9 * pulseScale);

        ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`;

        ctx.textAlign = 'center';

        const tx = cx + _CARD_W / 2, ty = barY + barH / 2 + 3;

        // Outline

        ctx.fillStyle = '#000';

        ctx.fillText(remainSec + 's', tx - 1, ty);

        ctx.fillText(remainSec + 's', tx + 1, ty);

        ctx.fillText(remainSec + 's', tx, ty - 1);

        ctx.fillText(remainSec + 's', tx, ty + 1);

        // Main text — baltas, su geltonu tint kai <3s

        ctx.fillStyle = remainMs < 3000 ? '#ffee60' : '#ffffff';

        ctx.fillText(remainSec + 's', tx, ty);

        // 8) Urgency overlay — kai liko <3s, raudonas pulse ant viso bar

        if (remainMs < 3000) {

          const flashA = 0.30 * (1 - remainMs / 3000) * (0.5 + 0.5 * Math.sin(t * 0.020));

          ctx.fillStyle = `rgba(255,80,60,${flashA})`;

          ctx.fillRect(barX, barY, barW, barH);

        }

      }

      // ── Stored merge bonus badge — dešinėj viršuj („+5s" arba „+10s" ir t.t.) ──

      const _storedBonus = _f12CardBonusMs[tp] || 0;

      if (!isLocked && _storedBonus > 0) {

        const bonusTxt = '+' + Math.round(_storedBonus / 1000) + 's';

        ctx.font = 'bold 8px "Press Start 2P", monospace';

        ctx.textAlign = 'center';

        const bx = cx + _CARD_W - 14;

        ctx.fillStyle = '#000';

        ctx.fillText(bonusTxt, bx - 1, cy + 11);

        ctx.fillText(bonusTxt, bx + 1, cy + 11);

        ctx.fillText(bonusTxt, bx, cy + 11 - 1);

        ctx.fillText(bonusTxt, bx, cy + 11 + 1);

        ctx.fillStyle = '#ffd866';     // gold (matches popup color)

        ctx.fillText(bonusTxt, bx, cy + 11);

      }

      // ── LOCKED overlay — tik tamsus tint (spyna pašalinta) ──

      if (isLocked) {

        ctx.fillStyle = 'rgba(0,0,0,0.55)';

        ctx.fillRect(cx, cy, _CARD_W, _CARD_H);

      }

      // ── Unit deploy integration — kortos mapped to ally units ──

      const _mappedUtype = _UNIT_FOR_BALL_TYPE[tp];

      // SELECTED — žalia outline

      if (_mappedUtype && selectedDeployType === _mappedUtype) {

        ctx.strokeStyle = `rgba(120,255,150,${0.85 + 0.15 * Math.sin(t * 0.012)})`;

        ctx.lineWidth = 3;

        ctx.strokeRect(cx - 2, cy - 2, _CARD_W + 4, _CARD_H + 4);

      }

      // ── CD overlay — patobulintas „mana liquid" UI: gradient + bubbles + wavy + pulse ──

      const _cdRem = (_mappedUtype && _f12UnitDeployCD[_mappedUtype])

        ? Math.max(0, _UNIT_DEPLOY_CD_MS - (t - _f12UnitDeployCD[_mappedUtype])) : 0;

      if (_cdRem > 0) {

        const cdK = _cdRem / _UNIT_DEPLOY_CD_MS;       // 1 → 0

        const remainSec = Math.ceil(_cdRem / 1000);

        const fillH = Math.round(_CARD_H * cdK);

        const fillY = cy + (_CARD_H - fillH);

        // 1) Tamsus base overlay

        ctx.fillStyle = 'rgba(0,0,0,0.76)';

        ctx.fillRect(cx, cy, _CARD_W, _CARD_H);

        // 2) Mana fill — multi-tone gradient (5 sluoksniai, tamsiau apačioj → šviesiau viršuj)

        if (fillH > 0) {

          for (let sl = 0; sl < 5; sl++) {

            const sliceH = Math.ceil(fillH / 5);

            const sliceY = fillY + sl * sliceH;

            if (sliceY >= cy + _CARD_H) break;

            const t01 = 1 - sl / 4;        // 1 = top, 0 = bottom

            const blueG = Math.floor(100 + t01 * 80);

            const blueB = Math.floor(170 + t01 * 50);

            ctx.fillStyle = `rgba(60,${blueG},${blueB},${0.40 + t01 * 0.18})`;

            ctx.fillRect(cx, sliceY, _CARD_W, Math.min(sliceH, cy + _CARD_H - sliceY));

          }

        }

        // 3) Rising bubbles (pseudorandom — kyla iš apačios per mana)

        if (fillH > 6) {

          for (let b = 0; b < 4; b++) {

            const phase = ((t * 0.0009) + b * 0.27) % 1;

            const seedX = ((b * 173 + Math.floor(((t * 0.0009) + b * 0.27))) * 53) % 1000 / 1000;

            const bx = cx + 4 + seedX * (_CARD_W - 8);

            // Iš apačios kortos į fill viršų (riboje)

            const startY = cy + _CARD_H - 2;

            const endY = fillY + 2;

            const by = startY + (endY - startY) * phase;

            if (by < fillY || by > cy + _CARD_H) continue;

            const sz = phase < 0.25 ? 2 : (phase < 0.75 ? 3 : 2);

            const alpha = 0.7 * (1 - phase * 0.5);

            ctx.fillStyle = `rgba(200,230,255,${alpha})`;

            ctx.fillRect(Math.round(bx), Math.round(by), sz, sz);

          }

        }

        // 4) Wavy paviršius — banguojanti vandens linija ties fill viršum

        if (fillH > 2 && fillH < _CARD_H) {

          for (let dx = 0; dx < _CARD_W; dx += 2) {

            const wobble = Math.sin(t * 0.005 + dx * 0.32) * 1.4;

            const py = Math.round(fillY + wobble);

            ctx.fillStyle = 'rgba(200,235,255,0.95)';

            ctx.fillRect(cx + dx, py, 2, 2);

            // Aukštesnis highlight pixel virš bangos (foam)

            ctx.fillStyle = 'rgba(255,255,255,0.55)';

            ctx.fillRect(cx + dx, py - 1, 2, 1);

          }

        }

        // 5) Timer text — pulse'inasi kas sekundę (heartbeat) + spalva keičiasi artinant 0

        const subSec = (_cdRem % 1000) / 1000;          // 0..1 sekundėje

        const pulseScale = subSec < 0.12 ? 1 + (1 - subSec / 0.12) * 0.18 : 1;

        const fontSize = Math.round(18 * pulseScale);

        ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`;

        ctx.textAlign = 'center';

        // Spalva — auksinė → oranžinė < 10s → raudona < 5s (urgency)

        let textCol = '#ffe7a8';

        if (_cdRem < 5000) textCol = '#ff8a7a';

        else if (_cdRem < 10000) textCol = '#ffb058';

        // Pixel art outline (4 puses)

        ctx.fillStyle = '#000';

        const tx = cx + _CARD_W / 2, ty = cy + _CARD_H / 2 + 5;

        ctx.fillText(remainSec + 's', tx - 1, ty);

        ctx.fillText(remainSec + 's', tx + 1, ty);

        ctx.fillText(remainSec + 's', tx, ty - 1);

        ctx.fillText(remainSec + 's', tx, ty + 1);

        ctx.fillStyle = textCol;

        ctx.fillText(remainSec + 's', tx, ty);

        // 6) Final-second pulse — kai liko < 1s, mažas baltas blyksis aplink tekstą

        if (_cdRem < 1000) {

          const flashA = 0.5 * (1 - _cdRem / 1000);

          ctx.fillStyle = `rgba(255,255,255,${flashA})`;

          ctx.fillRect(cx + 2, cy + 2, _CARD_W - 4, _CARD_H - 4);

        }

      }

      // Count ×N badge pašalinta — vėliau bus pridėta kita merge logika

      // Spawn flash — tik unlocked

      const elapsed = card ? (t - (card.lastIncAt || 0)) : Infinity;

      if (!isLocked && elapsed < 500) {

        const fk = elapsed / 500;

        const fa = (1 - fk);

        const PX = 2;

        // Bright overlay

        ctx.fillStyle = `rgba(255,255,200,${fa * 0.55})`;

        ctx.fillRect(cx + PX*2, cy + PX*2, _CARD_W - PX*4, _CARD_H - PX*4);

        // Pixel sparks bursting outward (4 corners + 4 sides)

        const cxC = cx + _CARD_W / 2;

        const cyC = cy + _CARD_H / 2;

        const burstR = fk * 30;

        const sparkAlpha = fa * 0.95;

        ctx.fillStyle = `rgba(255,250,200,${sparkAlpha})`;

        for (let p = 0; p < 8; p++) {

          const ang = p * Math.PI / 4;

          const sx = Math.round((cxC + Math.cos(ang) * burstR) / PX) * PX;

          const sy = Math.round((cyC + Math.sin(ang) * burstR) / PX) * PX;

          ctx.fillRect(sx - PX, sy - PX, PX*2, PX*2);

        }

      }

    }

    // ── HOVER TOOLTIP — pop-up virš kortos su instrukcija kas reikia daryti ──

    if (hoverIdx >= 0) {

      const tp = layout.allTypes[hoverIdx];

      const utype = _UNIT_FOR_BALL_TYPE[tp];

      const isLockedH = !_f12CardDeck[tp];

      const trainedH = utype ? _getTrainedCount(utype) : 0;

      let msg = null, accent = '#ffe7a8';

      const unitName = (utype === 'harpoon_fish' ? 'HARPOON' :

                       utype === 'crossbow_tower' ? 'CROSSBOW' :

                       utype === 'hog_rider' ? 'HOG RIDER' :

                       utype ? utype.toUpperCase() : '');

      // Ball type → color name (vietoj abstrakt'aus "HEART/ARROW" — žaidėjas mato spalvą)

      const BALL_COLOR_NAME = {

        arrow:   'ORANGE',

        shield:  'TEAL',

        heart:   'RED',

        leaf:    'GREEN',

        star:    'YELLOW',

        crystal: 'PURPLE',

        shadow:  'BLACK',

        pearl:   'WHITE',

        frost:   'BLUE',

      };

      const colorName = BALL_COLOR_NAME[tp] || tp.toUpperCase();

      if (!utype) {

        msg = ['COMING SOON', 'New unit will arrive'];

        accent = '#a8c8ff';

      } else if (isLockedH) {

        msg = ['UNLOCK CARD', 'Merge two ' + colorName + ' balls'];

        accent = '#ffae5c';

      } else if (trainedH === 0) {

        const isBuilding = (utype === 'tower' || utype === 'crossbow_tower' || utype === 'zip');

        msg = isBuilding

          ? ['BUILD REQUIRED', 'Construct ' + unitName + ' at HOME']

          : ['TRAIN REQUIRED', 'Train ' + unitName + ' at HOME barracks'];

        accent = '#ff7a7a';

      }

      if (msg) {

        const cardRect = cardHoverRects[hoverIdx];

        _drawCardTooltip(L, cardRect, msg, accent);

      }

    }

  }

  // ── Tooltip helper — medieval-style wood frame + parchment fill, pixel art ──

  function _drawCardTooltip(L, cardRect, lines, accent) {

    ctx.font = 'bold 9px "Press Start 2P", monospace';

    // Compute width based on longest line

    let maxW = 0;

    for (const line of lines) {

      const w = ctx.measureText(line).width;

      if (w > maxW) maxW = w;

    }

    const padX = 10, padY = 8, lineH = 14;

    const ttW = Math.max(140, Math.round(maxW) + padX * 2);

    const ttH = lines.length * lineH + padY * 2;

    // Position above the card if there's room, else below

    let ttX = Math.round(cardRect.x + cardRect.w / 2 - ttW / 2);

    let ttY = cardRect.y - ttH - 10;

    if (ttY < 8) ttY = cardRect.y + cardRect.h + 10;

    // Clamp horizontally

    if (ttX < 8) ttX = 8;

    if (ttX + ttW > L.W - 8) ttX = L.W - 8 - ttW;

    // ── Drop shadow ──

    ctx.fillStyle = 'rgba(0,0,0,0.55)';

    ctx.fillRect(ttX + 3, ttY + 3, ttW, ttH);

    // ── Wood frame (dark outer + medium border + light inner highlight) ──

    ctx.fillStyle = '#1a0e06';

    ctx.fillRect(ttX, ttY, ttW, ttH);

    ctx.fillStyle = '#5a3820';

    ctx.fillRect(ttX + 2, ttY + 2, ttW - 4, ttH - 4);

    ctx.fillStyle = '#8b6242';

    ctx.fillRect(ttX + 2, ttY + 2, ttW - 4, 2);              // top edge

    ctx.fillStyle = '#3a2410';

    ctx.fillRect(ttX + 2, ttY + ttH - 4, ttW - 4, 2);        // bottom shadow

    // ── Parchment fill ──

    ctx.fillStyle = '#1a1208';

    ctx.fillRect(ttX + 4, ttY + 4, ttW - 8, ttH - 8);

    // ── Brass corner rivets ──

    ctx.fillStyle = '#a87830';

    ctx.fillRect(ttX + 3, ttY + 3, 2, 2);

    ctx.fillRect(ttX + ttW - 5, ttY + 3, 2, 2);

    ctx.fillRect(ttX + 3, ttY + ttH - 5, 2, 2);

    ctx.fillRect(ttX + ttW - 5, ttY + ttH - 5, 2, 2);

    ctx.fillStyle = '#ffe7a8';

    ctx.fillRect(ttX + 3, ttY + 3, 1, 1);                    // top-left brass highlight

    ctx.fillRect(ttX + ttW - 5, ttY + 3, 1, 1);

    // ── Text (first line = title with accent color, rest = body in cream) ──

    ctx.textAlign = 'center';

    for (let li = 0; li < lines.length; li++) {

      const y = ttY + padY + (li + 1) * lineH - 4;

      const isTitle = li === 0;

      const col = isTitle ? accent : '#e8d8a8';

      ctx.font = isTitle ? 'bold 9px "Press Start 2P", monospace' : '7px "Press Start 2P", monospace';

      // Pixel-art outline

      ctx.fillStyle = '#000';

      ctx.fillText(lines[li], ttX + ttW / 2 + 1, y + 1);

      ctx.fillStyle = col;

      ctx.fillText(lines[li], ttX + ttW / 2, y);

    }

    ctx.textAlign = 'left';

  }

  // ── Lane background cache — pixel art dirt + castle wall base

  let _laneBgCache = null;

  function _buildLaneBgSprite(w, h, laneH, baseW) {

    const off = document.createElement('canvas');

    off.width = w;

    off.height = h;

    const oc = off.getContext('2d');

    oc.imageSmoothingEnabled = false;

    const PX = PIXEL_SIZE;

    for (let i = 0; i < LANES; i++) {

      const ly = i * laneH;

      const lh = laneH - 4;

      // Lane track base color (alternating shades)

      oc.fillStyle = i % 2 === 0 ? '#5a3e2c' : '#623f30';

      oc.fillRect(0, ly, w, lh);

      // Pixel art dirt pattern (deterministic hash)

      for (let y = 0; y < lh; y += PX) {

        for (let x = baseW; x < w; x += PX) {

          const hsh = _pxHash(x + ly, y + i * 333);

          let c = null;

          if (hsh < 0.04) c = '#7a5a3a';        // light scuff

          else if (hsh < 0.10) c = '#3a2410';   // dark spot

          else if (hsh < 0.20) c = '#4e3422';   // mid variation

          if (c) { oc.fillStyle = c; oc.fillRect(x, ly + y, PX, PX); }

        }

      }

      // Lane top + bottom borders (1px dark lines)

      oc.fillStyle = '#28160a';

      oc.fillRect(0, ly, w, 1);

      oc.fillRect(0, ly + lh - 1, w, 1);

      oc.fillStyle = '#7a5a3a';

      oc.fillRect(0, ly + 1, w, 1);    // subtle highlight under top border

      // ── CASTLE WALL BASE (left side) ──

      // Outer dark frame

      oc.fillStyle = '#1a0e06';

      oc.fillRect(0, ly, baseW, lh);

      // Stone wall fill

      oc.fillStyle = '#5a4226';

      oc.fillRect(2, ly + 2, baseW - 4, lh - 4);

      // Stone block pattern (3x2 grid)

      oc.fillStyle = '#3e2a14';

      // Horizontal seams

      oc.fillRect(2, ly + Math.floor(lh / 3), baseW - 4, 1);

      oc.fillRect(2, ly + Math.floor(lh * 2 / 3), baseW - 4, 1);

      // Vertical seams (alternating per row)

      oc.fillRect(2 + Math.floor((baseW - 4) / 2), ly + 2, 1, Math.floor(lh / 3) - 1);

      oc.fillRect(2 + Math.floor((baseW - 4) / 3), ly + Math.floor(lh / 3), 1, Math.floor(lh / 3));

      oc.fillRect(2 + Math.floor((baseW - 4) * 2 / 3), ly + Math.floor(lh / 3), 1, Math.floor(lh / 3));

      oc.fillRect(2 + Math.floor((baseW - 4) / 2), ly + Math.floor(lh * 2 / 3), 1, lh - Math.floor(lh * 2 / 3) - 2);

      // Top edge highlight (battlement-like)

      oc.fillStyle = '#7a5a3a';

      oc.fillRect(2, ly + 2, baseW - 4, 2);

      // Right edge shadow

      oc.fillStyle = '#2a1808';

      oc.fillRect(baseW - 3, ly + 2, 1, lh - 4);

      // Battlement mini squares on top

      oc.fillStyle = '#3a2614';

      oc.fillRect(4, ly + 2, 4, 3);

      oc.fillRect(12, ly + 2, 4, 3);

      oc.fillRect(20, ly + 2, 4, 3);

      // Lane label (right side)

      oc.fillStyle = 'rgba(255,220,160,0.55)';

      oc.font = '7px "Press Start 2P", monospace';

      oc.textAlign = 'right';

      oc.fillText('L' + (i + 1), w - 6, ly + 10);

    }

    return { canvas: off, w, h, lanes: LANES };

  }

  // ── Pixel art arena cache — atvaizduojama vieną kartą, drawImage per frame

  let _arenaCache = null;

  // ── Floor marks (smėlio žymės) — kaupiasi į overlay canvas

  let _marksCanvas = null;

  let _marksCtx = null;

  let _marksKey = null;

  // Deterministinis pseudo-random hash pixel art tekstūroms

  function _pxHash(x, y) {

    let h = (x * 374761393 + y * 668265263) | 0;

    h = ((h ^ (h >>> 13)) * 1274126177) | 0;

    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;

  }

  function _buildArenaSprite(A) {

    const FRAME = 16;

    const PX = PIXEL_SIZE;

    const W = A.w + FRAME * 2;

    const H = A.h + FRAME * 2;

    const off = document.createElement('canvas');

    off.width = W;

    off.height = H;

    const oc = off.getContext('2d');

    oc.imageSmoothingEnabled = false;

    // ── WOOD FRAME PALETTE (5 atspalviai)

    const WOOD = {

      darkest:  '#1f0f04',

      dark:     '#3a1f0a',

      mid:      '#5e3818',

      light:    '#7a5028',

      highlight:'#9a6830',

      grain:    '#2d1808',

    };

    // Pilnas wood frame fill (darkest - outline)

    oc.fillStyle = WOOD.darkest;

    oc.fillRect(0, 0, W, H);

    // Inner mid wood

    oc.fillStyle = WOOD.mid;

    oc.fillRect(2, 2, W - 4, H - 4);

    // Top frame highlight (light source from upper-left)

    oc.fillStyle = WOOD.highlight;

    oc.fillRect(2, 2, W - 4, 4);

    oc.fillStyle = WOOD.light;

    oc.fillRect(2, 6, W - 4, 4);

    // Left frame highlight

    oc.fillStyle = WOOD.highlight;

    oc.fillRect(2, 2, 4, H - 4);

    oc.fillStyle = WOOD.light;

    oc.fillRect(6, 2, 4, H - 4);

    // Bottom frame shadow

    oc.fillStyle = WOOD.dark;

    oc.fillRect(2, H - 10, W - 4, 4);

    oc.fillStyle = WOOD.darkest;

    oc.fillRect(2, H - 6, W - 4, 4);

    // Right frame shadow

    oc.fillStyle = WOOD.dark;

    oc.fillRect(W - 10, 2, 4, H - 4);

    oc.fillStyle = WOOD.darkest;

    oc.fillRect(W - 6, 2, 4, H - 4);

    // Plank seams (vertical lines on top/bottom frames, horizontal on left/right)

    const PLANK = 32;

    oc.fillStyle = WOOD.grain;

    // Top + bottom frame: vertical plank seams

    for (let x = PLANK; x < W; x += PLANK) {

      oc.fillRect(x - 1, 2, 2, FRAME - 4);

      oc.fillRect(x - 1, H - FRAME + 2, 2, FRAME - 4);

    }

    // Left + right frame: horizontal plank seams

    for (let y = PLANK; y < H; y += PLANK) {

      oc.fillRect(2, y - 1, FRAME - 4, 2);

      oc.fillRect(W - FRAME + 2, y - 1, FRAME - 4, 2);

    }

    // Wood grain (1px dark lines along each plank — subtilus tekstūros pattern)

    oc.fillStyle = WOOD.grain;

    for (let i = 0; i < W; i += 2) {

      if (_pxHash(i, 7) < 0.18) {

        oc.fillRect(i, 11, 2, 1);   // top frame grain

        oc.fillRect(i, H - 12, 2, 1); // bottom

      }

    }

    for (let i = 0; i < H; i += 2) {

      if (_pxHash(13, i) < 0.18) {

        oc.fillRect(11, i, 1, 2);   // left frame grain

        oc.fillRect(W - 12, i, 1, 2); // right

      }

    }

    // Corner rivets/nails (dark dots in 4 corners)

    oc.fillStyle = WOOD.darkest;

    oc.fillRect(6, 6, 2, 2);

    oc.fillRect(W - 8, 6, 2, 2);

    oc.fillRect(6, H - 8, 2, 2);

    oc.fillRect(W - 8, H - 8, 2, 2);

    oc.fillStyle = WOOD.highlight;

    oc.fillRect(6, 6, 1, 1);  // shine on rivet

    oc.fillRect(W - 8, 6, 1, 1);

    // ── INNER SHADOW (kad rėmas atrodytų inset'as)

    const INNER_X = FRAME, INNER_Y = FRAME;

    const INNER_W = A.w, INNER_H = A.h;

    oc.fillStyle = WOOD.darkest;

    oc.fillRect(INNER_X - 2, INNER_Y - 2, INNER_W + 4, 2);   // top

    oc.fillRect(INNER_X - 2, INNER_Y + INNER_H, INNER_W + 4, 2); // bottom

    oc.fillRect(INNER_X - 2, INNER_Y, 2, INNER_H);            // left

    oc.fillRect(INNER_X + INNER_W, INNER_Y, 2, INNER_H);      // right

    // ── DIRT FLOOR PALETTE (4 atspalviai)

    const DIRT = {

      dark:   '#1a0d05',

      base:   '#3a2614',

      mid:    '#4e321c',

      light:  '#65442a',

      pebble: '#7a583a',

    };

    // Base fill — 4 ZONOS, kiekviena truputį kitokio dirvožemio atspalvio.

    // 0.5x zona (kairė, arčiausiai launcher) — ŠVIESIAUSIA, tamsėja link 2x zonos (toliau / arčiau prešų).

    const ZONE_DIRT = ['#4d3a22', '#43321b', '#3a2614', '#33220f'];

    const zwInner = INNER_W / 4;

    for (let z = 0; z < 4; z++) {

      const zx = INNER_X + Math.round(z * zwInner);

      const zx2 = INNER_X + Math.round((z + 1) * zwInner);

      oc.fillStyle = ZONE_DIRT[z];

      oc.fillRect(zx, INNER_Y, zx2 - zx, INNER_H);

    }

    // Pixel art texture — chunk variations su deterministiniu hash'u

    for (let y = 0; y < INNER_H; y += PX) {

      for (let x = 0; x < INNER_W; x += PX) {

        const h = _pxHash(x, y);

        let color = null;

        if (h < 0.04) color = DIRT.light;       // scuff marks

        else if (h < 0.08) color = DIRT.dark;   // dark spots

        else if (h < 0.22) color = DIRT.mid;    // mid variation

        if (color) {

          oc.fillStyle = color;

          oc.fillRect(INNER_X + x, INNER_Y + y, PX, PX);

        }

      }

    }

    // Pebbles (small 2-3 pixel clusters scattered)

    const PEBBLE_COUNT = Math.floor((INNER_W * INNER_H) / 4500);

    for (let i = 0; i < PEBBLE_COUNT; i++) {

      const ph = _pxHash(i * 17, 31);

      const pv = _pxHash(i * 23, 47);

      const px = Math.floor(ph * (INNER_W - 6) / PX) * PX;

      const py = Math.floor(pv * (INNER_H - 6) / PX) * PX;

      const t = _pxHash(i * 11, 89);

      // Pebble shape (2-3 px cluster + dark side shadow)

      oc.fillStyle = t > 0.55 ? DIRT.pebble : DIRT.light;

      oc.fillRect(INNER_X + px, INNER_Y + py, PX, PX);

      oc.fillRect(INNER_X + px + PX, INNER_Y + py, PX, PX);

      oc.fillRect(INNER_X + px, INNER_Y + py + PX, PX, PX);

      // Dark shadow side (right-bottom)

      oc.fillStyle = DIRT.dark;

      oc.fillRect(INNER_X + px + PX * 2, INNER_Y + py + PX, PX, PX);

      oc.fillRect(INNER_X + px + PX, INNER_Y + py + PX * 2, PX, PX);

    }

    // ════ ZONŲ ŽYMĖJIMAI — ĮKEPTI Į GRINDIS (lentos dalis, ne overlay) ════

    {

      const zw4 = INNER_W / 4;

      // Muted, "aged painted" akcentinės spalvos (ne neon — kad atrodytų kaip dažytas akmuo)

      const ZACC = ['#5a6478', '#4a6a9a', '#4a8a8a', '#b89048'];

      const ZMULT = ['0.5x', '1x', '1.5x', '2x'];

      // ── 3 IŠKARTOS GRIOVELIAI tarp zonų — kaip fiziniai grindų siūlai ──

      for (let z = 1; z < 4; z++) {

        const sx = INNER_X + Math.round(z * zw4);

        // Recesas — 2px tamsus griovelis

        oc.fillStyle = DIRT.dark;

        oc.fillRect(sx - 1, INNER_Y, 2, INNER_H);

        // Pakelta kairė briauna (gaudo šviesą iš viršaus-kairės)

        oc.fillStyle = DIRT.light;

        oc.fillRect(sx - 2, INNER_Y, 1, INNER_H);

        // Tamsi dešinė briauna (recesso šešėlis)

        oc.fillStyle = '#0f0703';

        oc.fillRect(sx + 1, INNER_Y, 1, INNER_H);

        // Griovelio netvarkingumas — keli praleisti pixeliai (natūralumas)

        oc.fillStyle = ZONE_DIRT[z];

        for (let gy = INNER_Y; gy < INNER_Y + INNER_H; gy += PX) {

          if (_pxHash(sx, gy) < 0.12) oc.fillRect(sx - 1, gy, 2, PX);

        }

      }

      // ── 4 ĮKALTOS PLOKŠTĖS — engraved multiplier markeriai (didesnės +2px, geresnis UI) ──

      for (let z = 0; z < 4; z++) {

        const acc = ZACC[z];

        const zcx = INNER_X + Math.round(z * zw4 + zw4 / 2);

        const pw = _F12_PLAQUE_W, ph = _F12_PLAQUE_H;

        const pxL = Math.round(zcx - pw / 2);

        const pyT = INNER_Y + _F12_PLAQUE_TOP;

        // Recesso šešėlis aplink — plokštė įspausta į grindis (2px storis)

        oc.fillStyle = '#0d0602';

        oc.fillRect(pxL - 2, pyT - 2, pw + 4, ph + 4);

        // Plokštės korpusas — tamsus

        oc.fillStyle = '#1c1208';

        oc.fillRect(pxL, pyT, pw, ph);

        // Inset bevel — viršuj-kairėj tamsu (recesso šešėlis), apačioj-dešinėj šviesu

        oc.fillStyle = '#0f0703';

        oc.fillRect(pxL, pyT, pw, 2);

        oc.fillRect(pxL, pyT, 2, ph);

        oc.fillStyle = ZONE_DIRT[z];

        oc.fillRect(pxL, pyT + ph - 2, pw, 2);

        oc.fillRect(pxL + pw - 2, pyT, 2, ph);

        // Akcentinis rėmas — 2px dažyto akmens spalva

        oc.fillStyle = acc;

        oc.fillRect(pxL + 2, pyT + 2, pw - 4, 2);          // viršus

        oc.fillRect(pxL + 2, pyT + ph - 4, pw - 4, 2);     // apačia

        oc.fillRect(pxL + 2, pyT + 2, 2, ph - 4);          // kairė

        oc.fillRect(pxL + pw - 4, pyT + 2, 2, ph - 4);     // dešinė

        // Vidinis tamsus laukas (kontrastas tekstui)

        oc.fillStyle = '#100a04';

        oc.fillRect(pxL + 4, pyT + 4, pw - 8, ph - 8);

        // Kampų rivets/bolts — maži akcentiniai taškai 4 kampuose

        oc.fillStyle = acc;

        oc.fillRect(pxL + 3, pyT + 3, 2, 2);

        oc.fillRect(pxL + pw - 5, pyT + 3, 2, 2);

        oc.fillRect(pxL + 3, pyT + ph - 5, 2, 2);

        oc.fillRect(pxL + pw - 5, pyT + ph - 5, 2, 2);

        oc.fillStyle = '#fff';                             // rivet shine

        oc.fillRect(pxL + 3, pyT + 3, 1, 1);

        oc.fillRect(pxL + pw - 5, pyT + 3, 1, 1);

        // Engraved tekstas — 10px (+2px), carved look (gylis + accent)

        oc.font = '10px "Press Start 2P", monospace';

        oc.textAlign = 'center';

        oc.textBaseline = 'middle';

        const tcx = zcx, tcy = pyT + ph / 2 + 1;

        oc.fillStyle = '#000';                       // carved gylis

        oc.fillText(ZMULT[z], tcx, tcy + 1);

        oc.fillStyle = acc;                          // akcentinis tekstas

        oc.fillText(ZMULT[z], tcx, tcy);

        oc.textAlign = 'left';

        oc.textBaseline = 'alphabetic';

      }

    }

    return { canvas: off, frame: FRAME, w: W, h: H };

  }

  function _getArenaSprite(A) {

    const key = A.x + '_' + A.y + '_' + A.w + '_' + A.h;

    if (_arenaCache && _arenaCache.key === key) return _arenaCache;

    const sprite = _buildArenaSprite(A);

    sprite.key = key;

    _arenaCache = sprite;

    return sprite;

  }

  function _ensureMarksCanvas(A) {

    const key = A.w + 'x' + A.h;

    if (_marksKey === key && _marksCanvas) return;

    _marksCanvas = document.createElement('canvas');

    _marksCanvas.width = A.w;

    _marksCanvas.height = A.h;

    _marksCtx = _marksCanvas.getContext('2d');

    _marksCtx.imageSmoothingEnabled = false;

    _marksKey = key;

  }

  // Pridedam subtilią sand-style impact mark (mažas efektas)

  function _addBounceMark(localX, localY, intensity) {

    if (!_marksCtx) return;

    const PX = PIXEL_SIZE;

    const radius = Math.max(2, Math.min(6, Math.floor(intensity * 3)));

    const cx = Math.round(localX / PX) * PX;

    const cy = Math.round(localY / PX) * PX;

    // Subtilus crater — mažesnis ir blyškesnis nei anksčiau

    for (let dy = -radius - 2; dy <= radius + 2; dy += PX) {

      for (let dx = -radius - 2; dx <= radius + 2; dx += PX) {

        const d = Math.sqrt(dx * dx + dy * dy);

        const t = d / radius;

        let color = null;

        if (t < 0.50) color = 'rgba(12, 6, 2, 0.04)';                  // crater core (sumažintas alpha)

        else if (t < 0.85) color = 'rgba(30, 18, 8, 0.18)';            // mid

        else if (t < 1.1 && _pxHash(cx + dx, cy + dy) < 0.40) color = 'rgba(85, 60, 35, 0.22)';  // sparse rim

        if (color) {

          _marksCtx.fillStyle = color;

          _marksCtx.fillRect(cx + dx, cy + dy, PX, PX);

        }

      }

    }

  }

  // Žymės palaipsniui blunka per laiką (destination-out fade)

  function _fadeMarks(dt) {

    if (!_marksCtx) return;

    // Per sekundę nubraukiam ~6% alpha (half-life ~10s, full fade ~30s)

    const fadeAlpha = 0.0010 * (dt / 16.67);  // proporcingai dt (60fps norm)

    if (fadeAlpha <= 0) return;

    _marksCtx.save();

    _marksCtx.globalCompositeOperation = 'destination-out';

    _marksCtx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;

    _marksCtx.fillRect(0, 0, _marksCanvas.width, _marksCanvas.height);

    _marksCtx.restore();

  }

  function drawArena(L) {

    const A = L.arena;

    const sprite = _getArenaSprite(A);

    _ensureMarksCanvas(A);

    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(sprite.canvas, A.x - sprite.frame, A.y - sprite.frame);

    // Marks overlay — accumuliuoja per žaidimą

    if (_marksCanvas) ctx.drawImage(_marksCanvas, A.x, A.y);

  }

  // ── Zonos plokštės flash — kai zonoj sumerge'inta, plokštė trumpai pažsta ──

  function _drawZoneFlashes(L, t) {

    const A = L.arena;

    const zw4 = A.w / 4;

    const pw = _F12_PLAQUE_W, ph = _F12_PLAQUE_H;

    const FLASH_DUR = 340;

    // Ryškios akcentinės spalvos (flash'ui) + multiplier tekstas

    const ZF = ['#aab4ce', '#8ab4f0', '#8ad8e6', '#ffe49a'];

    const ZMULT = ['0.5x', '1x', '1.5x', '2x'];

    let any = false;

    for (let z = 0; z < 4; z++) {

      const fa = t - (_f12ZoneFlash[z] || -99999);

      if (fa < 0 || fa >= FLASH_DUR) continue;

      if (!any) { ctx.save(); ctx.imageSmoothingEnabled = false; any = true; }

      const k = fa / FLASH_DUR;

      const inten = 1 - k;                      // 1 → 0

      const zcx = Math.round(A.x + z * zw4 + zw4 / 2);

      const pxL = Math.round(zcx - pw / 2);

      const pyT = A.y + _F12_PLAQUE_TOP;

      // Plokštė pažsta — baltas glow virš jos

      ctx.fillStyle = `rgba(255,255,255,${0.45 * inten})`;

      ctx.fillRect(pxL - 2, pyT - 2, pw + 4, ph + 4);

      // Akcentinis rėmo blyksnis

      ctx.fillStyle = `rgba(255,255,255,${0.8 * inten})`;

      ctx.fillRect(pxL - 2, pyT - 2, pw + 4, 2);

      ctx.fillRect(pxL - 2, pyT + ph, pw + 4, 2);

      // Skaičiukas — ryškiai baltas, trumpas blyksnis

      ctx.font = '10px "Press Start 2P", monospace';

      ctx.textAlign = 'center';

      ctx.textBaseline = 'middle';

      const tcy = pyT + ph / 2 + 1;

      ctx.fillStyle = `rgba(255,255,255,${inten})`;

      ctx.fillText(ZMULT[z], zcx, tcy);

      ctx.fillStyle = `rgba(${ZF[z] === '#ffe49a' ? '255,228,154' : '200,220,255'},${inten * 0.6})`;

      ctx.fillText(ZMULT[z], zcx, tcy);

    }

    if (any) {

      ctx.textAlign = 'left';

      ctx.textBaseline = 'alphabetic';

      ctx.restore();

    }

  }

  function drawAimLine(L) {

    if (gameOver) return;

    const lx = L.launcher.x, ly = L.launcher.y;

    const ang = launcher.angle;

    const A = L.arena;

    const dxN = Math.cos(ang), dyN = Math.sin(ang);

    const charge = getChargeLevel();

    // Power level — kai charging, bent 0.04; idle — 0.20 preview

    const p = clamp(charging ? Math.max(0.04, charge) : 0.20, 0, 1);

    const speed = lerp(FIRE_SPEED_MIN, FIRE_SPEED_MAX, p);

    const vx = dxN * speed;

    const vy = dyN * speed;

    const vz0 = lerp(420, 950, p);

    const r = radiusForValue(nextBlock ? nextBlock.value : 2);

    const sx = lx + dxN * (r + 8);

    const sy = ly + dyN * (r + 8);

    ctx.save();

    // Spalva: žalia → geltona → raudona pagal charge

    let r1, g1, b1;

    if (charge < 0.5) {

      const k = charge / 0.5;

      r1 = Math.floor(lerp(120, 255, k));

      g1 = Math.floor(lerp(220, 230, k));

      b1 = Math.floor(lerp(120, 100, k));

    } else {

      const k = (charge - 0.5) / 0.5;

      r1 = 255;

      g1 = Math.floor(lerp(230, 80, k));

      b1 = Math.floor(lerp(100, 60, k));

    }

    const alpha = charging ? (0.55 + 0.4 * charge) : 0.45;

    ctx.fillStyle = `rgba(${r1},${g1},${b1},${alpha})`;

    // Parabolinė trajektorija: simuliuojam kol kamuoliukas nusileidžia (z<=0)

    // arba kol išskrenda iš arenos

    const dt = 0.012;

    const maxSteps = 260;

    const dotSpacing = charging ? 14 : 14;

    let accum = dotSpacing; // pirmas tap iškart

    let lastX = sx, lastY = sy - r;

    let dotsDrawn = 0;

    let lastDotX = sx, lastDotY = sy - r;

    for (let i = 1; i <= maxSteps; i++) {

      const t = i * dt;

      const px = sx + vx * t;

      const pgy = sy + vy * t;

      const pz = vz0 * t - 0.5 * Z_GRAVITY * t * t;

      if (pz < 0 && i > 2) break;

      const py = pgy - r - Math.max(0, pz);

      // Out of arena bounds → break

      if (px < A.x - 4 || px > A.x + A.w + 4) break;

      if (pgy < A.y - 4 || pgy > A.y + A.h + 4) break;

      const ddx = px - lastX, ddy = py - lastY;

      accum += Math.sqrt(ddx * ddx + ddy * ddy);

      lastX = px; lastY = py;

      if (accum >= dotSpacing) {

        accum = 0;

        const sz = charging ? 2.5 + charge * 2.0 : 2.5;

        ctx.beginPath();

        ctx.arc(px, py, sz, 0, Math.PI * 2);

        ctx.fill();

        dotsDrawn++;

        lastDotX = px; lastDotY = py;

        if (dotsDrawn > 80) break;

      }

    }

    // Pulse'inanti rodyklė gale, kai pilnas charge

    if (charging && charge > 0.95 && dotsDrawn > 3) {

      ctx.fillStyle = `rgba(255,80,60,${0.6 + 0.4 * Math.sin(now() * 0.02)})`;

      ctx.beginPath();

      ctx.arc(lastDotX, lastDotY, 8, 0, Math.PI * 2);

      ctx.fill();

    }

    ctx.restore();

  }

  function drawPowerMeter(L) {

    if (gameOver || !charging) return;

    const lx = L.launcher.x, ly = L.launcher.y;

    const charge = getChargeLevel();

    // Kraunas ringas aplink launcher base

    ctx.save();

    ctx.lineWidth = 5;

    // Background ring

    ctx.strokeStyle = 'rgba(0,0,0,0.6)';

    ctx.beginPath();

    ctx.arc(lx, ly, 38, 0, Math.PI * 2);

    ctx.stroke();

    // Filled arc

    let r2, g2, b2;

    if (charge < 0.5) {

      const k = charge / 0.5;

      r2 = Math.floor(lerp(120, 255, k));

      g2 = Math.floor(lerp(220, 230, k));

      b2 = Math.floor(lerp(120, 100, k));

    } else {

      const k = (charge - 0.5) / 0.5;

      r2 = 255;

      g2 = Math.floor(lerp(230, 60, k));

      b2 = Math.floor(lerp(100, 60, k));

    }

    ctx.strokeStyle = `rgb(${r2},${g2},${b2})`;

    ctx.lineWidth = 5;

    ctx.beginPath();

    ctx.arc(lx, ly, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);

    ctx.stroke();

    // Persikrovė bandymas

    if (charge > 0.95) {

      ctx.strokeStyle = `rgba(255,255,200,${0.5 + 0.5 * Math.sin(now() * 0.02)})`;

      ctx.lineWidth = 3;

      ctx.beginPath();

      ctx.arc(lx, ly, 44, 0, Math.PI * 2);

      ctx.stroke();

    }

    ctx.restore();

  }

  // ── Launcher pedestalo sprite cache — statinė bazė renderinama VIENĄ kartą ──

  // (anksčiau ~1100 fillRect kas frame'ą — dabar 1 drawImage)

  let _launcherBaseCache = null;

  function _getLauncherBaseSprite() {

    if (_launcherBaseCache) return _launcherBaseCache;

    const PX = 2, baseR = 32, pad = 6;

    const sz = (baseR + pad) * 2, cc = baseR + pad;

    const off = document.createElement('canvas');

    off.width = sz; off.height = sz;

    const oc = off.getContext('2d');

    oc.imageSmoothingEnabled = false;

    for (let dy = -baseR; dy <= baseR; dy += PX) {

      for (let dx = -baseR; dx <= baseR; dx += PX) {

        const d = Math.sqrt(dx*dx + dy*dy);

        if (d > baseR) continue;

        const hsh = ((dx * 73 + dy * 137) >>> 0) % 100;

        let c;

        if (d > baseR - PX*2) c = '#1a0e06';

        else if (d > baseR - PX*4) c = '#2a1810';

        else if (hsh < 10) c = '#5a3820';

        else if (hsh < 25) c = '#3a2410';

        else if (hsh < 50) c = '#4a2e18';

        else c = '#42281a';

        oc.fillStyle = c;

        oc.fillRect(cc + dx, cc + dy, PX, PX);

      }

    }

    // Top highlight crescent

    for (let dy = -baseR + PX*2; dy <= -baseR + PX*8; dy += PX) {

      const halfW = Math.sqrt(Math.max(0, (baseR - PX*2) * (baseR - PX*2) - dy * dy));

      for (let dx = -halfW; dx <= halfW; dx += PX) {

        if (dx > 0 && dx > halfW * 0.4) continue;

        oc.fillStyle = 'rgba(255,200,140,0.18)';

        oc.fillRect(cc + Math.round(dx / PX) * PX, cc + dy, PX, PX);

      }

    }

    // 4 cardinal iron studs (rivets)

    const rivetD = baseR - PX*4;

    for (const [rdx, rdy] of [[0, -rivetD], [rivetD, 0], [0, rivetD], [-rivetD, 0]]) {

      const rx = cc + rdx, ry = cc + rdy;

      oc.fillStyle = '#1a0e06'; oc.fillRect(rx - PX*2, ry - PX*2, PX*4, PX*4);

      oc.fillStyle = '#7a5a3a'; oc.fillRect(rx - PX, ry - PX, PX*2, PX*2);

      oc.fillStyle = '#ffe7a8'; oc.fillRect(rx - PX, ry - PX, PX, PX);

    }

    _launcherBaseCache = { canvas: off, cc };

    return _launcherBaseCache;

  }

  // Reload overlay — tamsus apskritimas, cache'inamas vieną kartą

  let _reloadOverlayCache = null;

  function _getReloadOverlaySprite() {

    if (_reloadOverlayCache) return _reloadOverlayCache;

    const PX = 2, ovR = 24;

    const sz = ovR * 2 + PX*2, cc = ovR + PX;

    const off = document.createElement('canvas');

    off.width = sz; off.height = sz;

    const oc = off.getContext('2d');

    oc.imageSmoothingEnabled = false;

    oc.fillStyle = 'rgba(0,0,0,0.55)';

    for (let dy = -ovR; dy <= ovR; dy += PX) {

      for (let dx = -ovR; dx <= ovR; dx += PX) {

        if (dx*dx + dy*dy > ovR*ovR) continue;

        oc.fillRect(cc + dx, cc + dy, PX, PX);

      }

    }

    _reloadOverlayCache = { canvas: off, cc };

    return _reloadOverlayCache;

  }

  // ── Patrankos vamzdis — detalus chunky pixel art sprite, cache'intas vieną kartą ──

  // Ankstesnė versija buvo daug fillRect'ų kas frame; dabar 1 drawImage. Plus pridėtas

  // wood stock, magic gem ant kameros, ornate brass band engravings, castellated muzzle crown.

  let _barrelCache = null;

  function _getBarrelSprite() {

    if (_barrelCache) return _barrelCache;

    // Barrel-local pixel range: x [-12, 46], y [-18, 18]

    const xMin = -12, xMax = 46, yMin = -18, yMax = 18, PAD = 2;

    const w = (xMax - xMin) + PAD * 2;

    const h = (yMax - yMin) + PAD * 2;

    const off = document.createElement('canvas');

    off.width = w; off.height = h;

    const oc = off.getContext('2d');

    oc.imageSmoothingEnabled = false;

    const offX = -xMin + PAD, offY = -yMin + PAD;

    oc.translate(offX, offY);

    // Palette

    const ironDark = '#0a0608', ironMid = '#3a2c2c', ironLight = '#6a5a5a', ironHi = '#a8a0a0';

    const brass = '#a87830', brassLight = '#e8b85a', brassDark = '#6a4818', brassHi = '#fff5c0';

    const wood = '#6b4a2e', woodDark = '#3e2914', woodLight = '#8b6242';

    const gemDark = '#3a7090', gemMid = '#5db4d8', gemHi = '#bef0ff';

    // ── 1) WOOD STOCK (rear, x: -12..-2) — medinis kotas užpakaly ──

    oc.fillStyle = woodDark; oc.fillRect(-12, -10, 10, 20);

    oc.fillStyle = wood;     oc.fillRect(-11, -9, 9, 18);

    oc.fillStyle = woodLight; oc.fillRect(-11, -9, 9, 2);              // top highlight

    oc.fillStyle = '#2a1a08'; oc.fillRect(-11, 7, 9, 2);                // bottom shadow

    // Wood grain (kelios horizontalios linijos)

    oc.fillStyle = woodDark;

    oc.fillRect(-10, -5, 7, 1);

    oc.fillRect(-10, -1, 7, 1);

    oc.fillRect(-10, 3, 7, 1);

    // Iron rivet on stock end

    oc.fillStyle = ironDark; oc.fillRect(-12, -3, 2, 6);

    oc.fillStyle = ironHi;   oc.fillRect(-11, -2, 1, 1);

    // ── 2) BRASS REINFORCEMENT BAND (jungia stock+chamber, x: -2..2) ──

    oc.fillStyle = brass;     oc.fillRect(-2, -13, 4, 26);

    oc.fillStyle = brassLight; oc.fillRect(-2, -13, 4, 3);

    oc.fillStyle = brassDark;  oc.fillRect(-2, 10, 4, 3);

    oc.fillStyle = brassHi;    oc.fillRect(-1, -12, 1, 1);

    // 4 mažos kniedės ant juostos

    oc.fillStyle = ironDark;

    oc.fillRect(0, -10, 1, 1);

    oc.fillRect(0, -3, 1, 1);

    oc.fillRect(0, 4, 1, 1);

    oc.fillRect(0, 9, 1, 1);

    // ── 3) REAR CHAMBER (storesnė pradžia, x: 2..14) ──

    oc.fillStyle = ironDark; oc.fillRect(2, -14, 12, 28);

    oc.fillStyle = ironMid;  oc.fillRect(3, -12, 10, 24);

    oc.fillStyle = ironLight; oc.fillRect(3, -12, 10, 3);

    oc.fillStyle = ironHi;    oc.fillRect(3, -12, 10, 1);

    oc.fillStyle = '#1a0e0e'; oc.fillRect(3, 9, 10, 3);

    // Touch hole at chamber rear

    oc.fillStyle = '#000';     oc.fillRect(4, -3, 3, 6);

    oc.fillStyle = ironLight;  oc.fillRect(4, -4, 3, 1);

    // ── 4) MAGIC GEM (mažas krištolas ant kameros viršaus, x: 8..12) ──

    oc.fillStyle = ironDark;

    oc.fillRect(8, -15, 4, 1);                  // gem socket frame

    oc.fillRect(8, -14, 1, 2); oc.fillRect(11, -14, 1, 2);

    oc.fillStyle = gemDark;   oc.fillRect(9, -14, 2, 2);

    oc.fillStyle = gemMid;    oc.fillRect(9, -14, 2, 1);

    oc.fillStyle = gemHi;     oc.fillRect(9, -14, 1, 1);

    // ── 5) BRASS BAND 1 (chamber→barrel jungtis, x: 14..18) ──

    oc.fillStyle = brass;      oc.fillRect(14, -14, 4, 28);

    oc.fillStyle = brassLight; oc.fillRect(14, -14, 4, 3);

    oc.fillStyle = brassDark;  oc.fillRect(14, 11, 4, 3);

    oc.fillStyle = brassHi;    oc.fillRect(15, -13, 1, 1);

    // Engraved zigzag pattern

    oc.fillStyle = brassDark;

    oc.fillRect(15, -7, 1, 1); oc.fillRect(16, -5, 1, 1);

    oc.fillRect(15, -3, 1, 1); oc.fillRect(16, -1, 1, 1);

    oc.fillRect(15, 1, 1, 1);  oc.fillRect(16, 3, 1, 1);

    oc.fillRect(15, 5, 1, 1);  oc.fillRect(16, 7, 1, 1);

    // ── 6) MAIN BARREL (mid section, x: 18..34) ──

    oc.fillStyle = ironDark; oc.fillRect(18, -10, 16, 20);

    oc.fillStyle = ironMid;  oc.fillRect(18, -8, 16, 16);

    oc.fillStyle = ironLight; oc.fillRect(18, -8, 16, 3);

    oc.fillStyle = ironHi;    oc.fillRect(18, -7, 16, 1);

    oc.fillStyle = '#1a0e0e'; oc.fillRect(18, 6, 16, 2);

    // Subtle engraved rune dots ant viršaus (4 brass dots)

    oc.fillStyle = brass;

    oc.fillRect(20, -9, 1, 1); oc.fillRect(23, -9, 1, 1);

    oc.fillRect(28, -9, 1, 1); oc.fillRect(31, -9, 1, 1);

    // ── 7) BRASS BAND 2 (mid barrel, x: 24..28) ──

    oc.fillStyle = brass;      oc.fillRect(24, -11, 4, 22);

    oc.fillStyle = brassLight; oc.fillRect(24, -11, 4, 3);

    oc.fillStyle = brassDark;  oc.fillRect(24, 8, 4, 3);

    oc.fillStyle = brassHi;    oc.fillRect(25, -10, 1, 1);

    // ── 8) MUZZLE (flared brass + castellated crown, x: 34..44) ──

    oc.fillStyle = brass;      oc.fillRect(34, -14, 8, 28);

    oc.fillStyle = brassLight; oc.fillRect(34, -14, 8, 3);

    oc.fillStyle = brassDark;  oc.fillRect(34, 11, 8, 3);

    // Outer flare rim

    oc.fillStyle = brass;      oc.fillRect(42, -12, 2, 24);

    oc.fillStyle = brassLight; oc.fillRect(42, -12, 2, 3);

    oc.fillStyle = brassDark;  oc.fillRect(42, 9, 2, 3);

    // Castellated crown VIRŠUJ muzzle (4 maži dantukai)

    oc.fillStyle = brass;

    oc.fillRect(35, -16, 1, 2); oc.fillRect(37, -16, 1, 2);

    oc.fillRect(39, -16, 1, 2); oc.fillRect(41, -16, 1, 2);

    oc.fillStyle = brassLight;

    oc.fillRect(35, -16, 1, 1); oc.fillRect(37, -16, 1, 1);

    oc.fillRect(39, -16, 1, 1); oc.fillRect(41, -16, 1, 1);

    // APAČIOJ — simetriški dantukai (atrodo kaip dragon teeth)

    oc.fillStyle = brass;

    oc.fillRect(35, 14, 1, 2); oc.fillRect(37, 14, 1, 2);

    oc.fillRect(39, 14, 1, 2); oc.fillRect(41, 14, 1, 2);

    oc.fillStyle = brassDark;

    oc.fillRect(35, 15, 1, 1); oc.fillRect(37, 15, 1, 1);

    oc.fillRect(39, 15, 1, 1); oc.fillRect(41, 15, 1, 1);

    // Outer rim highlight pikseliai

    oc.fillStyle = brassHi;

    oc.fillRect(34, -14, 2, 1); oc.fillRect(40, -14, 2, 1);

    oc.fillRect(43, -12, 1, 1);

    // ── 9) DARK MUZZLE HOLE (kamuoliuko išėjimo skylė, x: 38..44) ──

    oc.fillStyle = '#000';     oc.fillRect(38, -8, 6, 16);

    oc.fillStyle = '#1a0e0e';  oc.fillRect(38, -8, 1, 16);

    // Inner edge highlights (suggesting depth)

    oc.fillStyle = '#3a2c2c';

    oc.fillRect(38, -8, 6, 1); oc.fillRect(38, 7, 6, 1);

    _barrelCache = { canvas: off, offX, offY };

    return _barrelCache;

  }

  // RONKE2 frame'ai — pre-scale'inami į display dydį (92px) vieną kartą,

  // kad nereiktų kas frame'ą downscale'inti 632px source'o.

  let _ronke2FramesCache = null;

  function _getRonke2Frames() {

    if (_ronke2FramesCache) return _ronke2FramesCache;

    if (!_ronke2Img.complete || !_ronke2Img.naturalWidth) return null;

    const dw = 92, dh = Math.round(dw * _RONKE2_FH / _RONKE2_FW);

    const off = document.createElement('canvas');

    off.width = dw * _RONKE2_FRAMES; off.height = dh;

    const oc = off.getContext('2d');

    oc.imageSmoothingEnabled = false;

    for (let f = 0; f < _RONKE2_FRAMES; f++) {

      oc.drawImage(_ronke2Img, f * _RONKE2_FW, 0, _RONKE2_FW, _RONKE2_FH, f * dw, 0, dw, dh);

    }

    _ronke2FramesCache = { canvas: off, dw, dh };

    return _ronke2FramesCache;

  }

  // ── WAGON WHEEL — cache'intas pixel art sprite (medinis ratas su geležies rim + brass hub + 6 spokes) ──

  let _wagonWheelCache = null;

  function _getWagonWheelSprite() {

    if (_wagonWheelCache) return _wagonWheelCache;

    const r = 18, sz = r * 2 + 4;

    const off = document.createElement('canvas');

    off.width = sz; off.height = sz;

    const oc = off.getContext('2d');

    oc.imageSmoothingEnabled = false;

    const cc = sz / 2;

    // Outer iron rim (dark) + wood interior

    for (let dy = -r; dy <= r; dy++) {

      for (let dx = -r; dx <= r; dx++) {

        const d = Math.sqrt(dx*dx + dy*dy);

        if (d > r) continue;

        let c;

        if (d > r - 1)       c = '#1a1a1e';     // black rim edge

        else if (d > r - 2)  c = '#3a3a42';     // dark iron

        else if (d > r - 4)  c = '#6a6a72';     // mid iron (rim thickness)

        else if (d > r - 6)  c = '#3a2410';     // wood inner rim

        else                 c = '#5a3820';     // wood interior

        oc.fillStyle = c;

        oc.fillRect(cc + dx, cc + dy, 1, 1);

      }

    }

    // 6 spokes (medinis su highlight)

    for (let s = 0; s < 6; s++) {

      const ang = s * Math.PI / 3;

      for (let p = 4; p < r - 5; p++) {

        const sx = Math.round(cc + Math.cos(ang) * p);

        const sy = Math.round(cc + Math.sin(ang) * p);

        oc.fillStyle = '#3a2410';

        oc.fillRect(sx, sy, 2, 2);

        oc.fillStyle = '#7a5a3a';                // highlight ant viršaus

        oc.fillRect(sx, sy, 1, 1);

      }

    }

    // Central brass hub (su white highlight)

    for (let dy = -4; dy <= 4; dy++) {

      for (let dx = -4; dx <= 4; dx++) {

        const dd = dx*dx + dy*dy;

        if (dd > 16) continue;

        oc.fillStyle = dd < 4 ? '#ffe7a8' : (dd < 10 ? '#d4a050' : '#a87830');

        oc.fillRect(cc + dx, cc + dy, 1, 1);

      }

    }

    // Outer black outline pixel (1px aplink rim, kad atskirtų nuo bg)

    oc.fillStyle = '#000';

    for (let s = 0; s < 64; s++) {

      const ang = s * Math.PI * 2 / 64;

      const sx = Math.round(cc + Math.cos(ang) * (r + 1));

      const sy = Math.round(cc + Math.sin(ang) * (r + 1));

      oc.fillRect(sx, sy, 1, 1);

    }

    _wagonWheelCache = { canvas: off, r, sz };

    return _wagonWheelCache;

  }

  // ── LAUNCHER PLATFORMA — animuotas sprite sheet su 8 frames (lengvas sway) + info ──

  function _drawLauncherPlatform(L, t, lx, ly) {

    if (!_platformSheetImg.complete || !_platformSheetImg.naturalWidth) return;

    // Display dydis — sumažintas, kad telpa arena viduje (max arenos plotis - margin)

    const maxAllowedW = L.arena.w - 20;

    const dW = Math.min(218, maxAllowedW);    // +6px tik į kairę (212 → 218, su -3 center shift)

    const dH = Math.round(dW * _PLATFORM_FH / _PLATFORM_FW);

    // Pozicija — center shift -3px į kairę, kad augimas eitų tik į kairę pusę

    let dX = Math.round(lx - 42 - dW / 2);

    // Clamp į arenos ribas (su 4px margin)

    const minX = L.arena.x + 4;

    const maxX = L.arena.x + L.arena.w - dW - 4;

    if (dX < minX) dX = minX;

    if (dX > maxX) dX = maxX;

    // Y — sprite content top dalis (~22% nuo viršaus) sutampa su pedestalo apačia (ly+32)

    const dY = Math.round(ly + 32 - dH * (85 / _PLATFORM_FH));

    // Frame indeksas — animuojam TIK kai šūvis ką tik įvyko (one-shot per fire)

    let frame = 0;     // default idle (frame 0)

    if (_f12PlatformAnimStart > 0) {

      const animEl = t - _f12PlatformAnimStart;

      const animDur = (_PLATFORM_FRAMES / _PLATFORM_FPS) * 1000;   // ~800ms

      if (animEl < animDur) {

        frame = Math.min(_PLATFORM_FRAMES - 1, Math.floor(animEl / (1000 / _PLATFORM_FPS)));

      }

    }

    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(_platformSheetImg,

      frame * _PLATFORM_FW, 0, _PLATFORM_FW, _PLATFORM_FH,

      dX, dY, dW, dH);

    // ── INFO TEXT — gyvas game progress ant viršutinio platform decko ──

    // Top deck zona sprite'e ~ y 85..180, mapping į display: dY + dH*0.22 to dY + dH*0.46

    const infoY = dY + Math.round(dH * 0.30) + 8;      // centruotas ant top deck (+8px žemiau)

    const colW = (dW - 30) / 3;

    // Visi skaičiukai — vienos spalvos (auksinė, dera su brass theme)

    const _NUM_COL = '#ffe7a8';

    const infoData = [

      { label: 'SCORE',  value: '' + (score || 0),                col: _NUM_COL },

      { label: 'MERGES', value: '' + (merges || 0),               col: _NUM_COL },

      { label: 'BALLS',  value: Math.max(0, blocks.length - _f12FireBonusSlots) + '/' + MAX_BLOCKS, col: _NUM_COL },

    ];

    // Cleanup expired -2 popups

    const POP_DUR = 1600;

    for (let i = _f12BallsMinusPopups.length - 1; i >= 0; i--) {

      if (t - _f12BallsMinusPopups[i].born >= POP_DUR) _f12BallsMinusPopups.splice(i, 1);

    }

    // ── DETECT BALLS DECREASE — pagal DISPLAYED count (su bonus subtractu) ──

    const _displayedBalls = Math.max(0, blocks.length - _f12FireBonusSlots);

    if (_displayedBalls < _f12BallsPrevCount) {

      _f12BallsDropAt = t;

      _f12BallsDropAmount = _f12BallsPrevCount - _displayedBalls;

    }

    _f12BallsPrevCount = _displayedBalls;

    const DROP_DUR = 700;                              // BALLS counter animacijos trukmė

    // ── DETECT SCORE INCREASE — trigger juicy gain animation + „+N" popup ──

    const SCORE_UP_DUR = 700;

    const SCORE_POP_DUR = 1400;

    if ((score || 0) > _f12ScorePrevValue) {

      const delta = (score || 0) - _f12ScorePrevValue;

      _f12ScoreUpAt = t;

      _f12ScoreUpAmount = delta;

      _f12ScorePopups.push({ born: t, amount: delta });

    }

    _f12ScorePrevValue = (score || 0);

    for (let i = _f12ScorePopups.length - 1; i >= 0; i--) {

      if (t - _f12ScorePopups[i].born >= SCORE_POP_DUR) _f12ScorePopups.splice(i, 1);

    }

    for (let ci = 0; ci < 3; ci++) {

      const cx = dX + 15 + colW * ci + colW / 2;

      const info = infoData[ci];

      // Label (mažas — +1px)

      ctx.font = 'bold 7px "Press Start 2P", monospace';

      ctx.textAlign = 'center';

      ctx.fillStyle = '#000';

      ctx.fillText(info.label, cx + 1, infoY);

      ctx.fillText(info.label, cx - 1, infoY);

      ctx.fillText(info.label, cx, infoY + 1);

      ctx.fillText(info.label, cx, infoY - 1);

      ctx.fillStyle = '#c8b078';

      ctx.fillText(info.label, cx, infoY);

      // Value (didesnis, su outline — +1px)

      // ── BALLS specific: drop animation kai sumažėjo ──

      let valScale = 1, valDx = 0, valDy = 0, valColR = 255, valColG = 231, valColB = 168;

      let valGlow = 0, valGlowR = 120, valGlowG = 255, valGlowB = 140;

      // ── WARNING mode kai displayed BALLS ≥ 25 (5 ar mažiau iki cap) ──

      // Pulsuojantis orange/yellow color + subtle scale pulse, atkreipia dėmesį be panic

      if (ci === 2 && _displayedBalls >= 25) {

        const warnK = (_displayedBalls - 24) / 6;       // 25→0.17, 30→1.0 intensity

        const warnPulse = 0.5 + 0.5 * Math.sin(t * 0.008);

        // Color: auksinė → oranžinė → raudonai-oranžinė (gilesnis warning su didesniu count)

        valColR = 255;

        valColG = Math.round(231 - warnK * warnPulse * 100);   // green channel dingsta

        valColB = Math.round(168 - warnK * warnPulse * 130);

        // Mažas pulsuojantis scale

        valScale = 1 + warnK * warnPulse * 0.08;

        // Glow halo (orange/red kai cap arti) — skip on mobile (radial gradient brangu)

        if (!_IS_MOBILE) {

          valGlow = Math.max(valGlow, warnK * (0.5 + 0.3 * warnPulse));

          valGlowR = 255; valGlowG = 180 - Math.round(warnK * 100); valGlowB = 80 - Math.round(warnK * 50);

        }

      }

      if (ci === 2 && _f12BallsDropAt > 0) {

        const dropAge = t - _f12BallsDropAt;

        if (dropAge >= 0 && dropAge < DROP_DUR) {

          const dk = dropAge / DROP_DUR;

          if (dk < 0.12) {

            valScale = 1 - dk / 0.12 * 0.25;

          } else if (dk < 0.32) {

            const p = (dk - 0.12) / 0.20;

            valScale = 0.75 + p * (1.45 - 0.75);

          } else if (dk < 0.55) {

            const p = (dk - 0.32) / 0.23;

            valScale = 1.45 - p * (1.45 - 1.0);

          }

          const dropP = Math.min(1, dk / 0.35);

          valDy = Math.sin(dropP * Math.PI) * 4;

          valDx = Math.sin(dropAge * 0.05) * Math.max(0, 1.5 - dk * 4);

          if (dk < 0.40) {

            const p = dk / 0.40;

            valColR = Math.round(110 + p * (255 - 110));

            valColG = Math.round(240 + p * (231 - 240));

            valColB = Math.round(130 + p * (168 - 130));

          }

          valGlow = Math.max(0, 1 - dk / 0.55);

        }

      }

      // ── SCORE specific: gain animation kai padidėjo (TIK transformacija — be lift) ──

      if (ci === 0 && _f12ScoreUpAt > 0) {

        const upAge = t - _f12ScoreUpAt;

        if (upAge >= 0 && upAge < SCORE_UP_DUR) {

          const uk = upAge / SCORE_UP_DUR;

          // Punch scale (didesnis kai delta didesnis — log scaled)

          const punchMag = Math.min(1.7, 1.25 + Math.log2(_f12ScoreUpAmount || 4) * 0.08);

          if (uk < 0.14) {

            const p = uk / 0.14;

            valScale = 1 + p * (punchMag - 1);            // 1 → punchMag

          } else if (uk < 0.40) {

            const p = (uk - 0.14) / 0.26;

            valScale = punchMag - p * (punchMag - 1.0);   // settle → 1.0

          }

          // valDy lieka 0 — skaičiukas NEJUDA aukštyn, tik transformuojasi vietoje

          // Color flash: balta → auksinė (bright gold reward)

          if (uk < 0.35) {

            const p = uk / 0.35;

            valColR = 255;

            valColG = Math.round(255 - p * (255 - 231));

            valColB = Math.round(230 - p * (230 - 168));

          }

          valGlow = Math.max(0, 1 - uk / 0.55);

          valGlowR = 255; valGlowG = 215; valGlowB = 100;   // gold halo

        }

      }

      ctx.save();

      ctx.translate(cx + valDx, infoY + 13 + valDy);

      ctx.scale(valScale, valScale);

      // Glow halo (BALLS=žalia, SCORE=gold)

      if (valGlow > 0.05) {

        const grad = ctx.createRadialGradient(0, -3, 0, 0, -3, 18);

        grad.addColorStop(0, `rgba(${valGlowR},${valGlowG},${valGlowB},${valGlow * 0.55})`);

        grad.addColorStop(0.6, `rgba(${Math.round(valGlowR*0.7)},${Math.round(valGlowG*0.7)},${Math.round(valGlowB*0.6)},${valGlow * 0.2})`);

        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = grad;

        ctx.beginPath();

        ctx.arc(0, -3, 18, 0, Math.PI * 2);

        ctx.fill();

      }

      ctx.font = 'bold 10px "Press Start 2P", monospace';

      ctx.textAlign = 'center';

      // Outline

      ctx.fillStyle = '#000';

      ctx.fillText(info.value, 1, 0);

      ctx.fillText(info.value, -1, 0);

      ctx.fillText(info.value, 0, 1);

      ctx.fillText(info.value, 0, -1);

      // Main fill

      ctx.fillStyle = `rgb(${valColR},${valColG},${valColB})`;

      ctx.fillText(info.value, 0, 0);

      ctx.restore();

      // „-2" floating indikatorius — TIK ant BALLS stulpelio (ci === 2) per merge

      // JUICY animacija: pop-in scale (overshoot) + rise + wobble + sparkle burst + flash

      if (ci === 2 && _f12BallsMinusPopups.length) {

        for (const popup of _f12BallsMinusPopups) {

          const age = t - popup.born;

          if (age < 0 || age >= POP_DUR) continue;

          const k = age / POP_DUR;                       // 0..1 progress

          // ── PHASE 1: pop-in (0..0.18) overshoot scale ──

          let scale;

          if (k < 0.18) {

            const p = k / 0.18;

            scale = 0.2 + (1.7 - 0.2) * (1 - Math.pow(1 - p, 3));   // ease-out cubic → 1.7

          } else if (k < 0.30) {

            const p = (k - 0.18) / 0.12;

            scale = 1.7 - (1.7 - 1.0) * p;                          // settle 1.7 → 1.0

          } else {

            scale = 1.0;

          }

          // ── PHASE 2: rise (eased out) ──

          const riseK = Math.min(1, k / 0.85);

          const yOff = -(1 - Math.pow(1 - riseK, 2.2)) * 34;

          // ── PHASE 3: wobble (first 350ms) ──

          const wobbleK = Math.max(0, 1 - k / 0.22);

          const wobble = Math.sin(age * 0.06) * 1.4 * wobbleK;

          // ── PHASE 4: alpha fade ──

          let alpha;

          if (k < 0.10) alpha = k / 0.10;                            // fade in

          else if (k < 0.70) alpha = 1.0;

          else alpha = 1 - (k - 0.70) / 0.30;                         // fade out

          alpha = Math.max(0, Math.min(1, alpha));

          // ── PHASE 5: color cycle (white flash → red) ──

          let colR, colG, colB;

          if (k < 0.18) {

            const p = k / 0.18;

            colR = 255; colG = Math.round(255 - p * 145); colB = Math.round(255 - p * 145);

          } else {

            colR = 255; colG = 110; colB = 110;

          }

          // Pozicija — virš CURRENT count skaičiuko (ne virš /MAX)

          // info.value = "N/MAX" — surandam, kur centruojasi pirmoji dalis

          ctx.font = 'bold 10px "Press Start 2P", monospace';

          const fullW = ctx.measureText(info.value).width;

          const curStr = '' + Math.max(0, blocks.length - _f12FireBonusSlots);

          const curW = ctx.measureText(curStr).width;

          // Centras CURRENT count'o relatyviai cx: kairys teksto kraštas (-fullW/2) + curW/2

          const curCenterX = -fullW / 2 + curW / 2;

          const cxText = cx + curCenterX + wobble;

          const cyText = infoY + 13 + yOff - 4;          // pakeltas 4px aukščiau (kad nedengtu skaičiaus)

          ctx.save();

          ctx.translate(cxText, cyText);

          ctx.scale(scale, scale);

          // ── GLOW HALO (radial) ──

          const glowAlpha = alpha * 0.5;

          if (glowAlpha > 0.05) {

            const grad = ctx.createRadialGradient(0, -2, 0, 0, -2, 18);

            grad.addColorStop(0, `rgba(255,80,80,${glowAlpha})`);

            grad.addColorStop(0.5, `rgba(220,40,40,${glowAlpha * 0.4})`);

            grad.addColorStop(1, 'rgba(120,0,0,0)');

            ctx.fillStyle = grad;

            ctx.beginPath();

            ctx.arc(0, -2, 18, 0, Math.PI * 2);

            ctx.fill();

          }

          // ── SPARKLE BURST (8 spokes radiating outward, first 400ms) ──

          if (k < 0.30) {

            const sparkP = k / 0.30;

            const sparkR = 6 + sparkP * 14;

            const sparkAlpha = (1 - sparkP) * alpha;

            ctx.fillStyle = `rgba(255,255,200,${sparkAlpha})`;

            for (let s = 0; s < 8; s++) {

              const ang = (s / 8) * Math.PI * 2 + popup.born * 0.001;

              const sx = Math.cos(ang) * sparkR;

              const sy = Math.sin(ang) * sparkR - 2;

              ctx.fillRect(Math.round(sx - 1), Math.round(sy - 1), 2, 2);

            }

            // Center white flash

            if (k < 0.12) {

              const flashA = (1 - k / 0.12) * alpha;

              ctx.fillStyle = `rgba(255,255,255,${flashA * 0.85})`;

              ctx.beginPath();

              ctx.arc(0, -2, 5, 0, Math.PI * 2);

              ctx.fill();

            }

          }

          // ── CHUNKY TEXT — 1px outline + 2px deep shadow + bright fill ──

          // Tik perfect/unbelievable spawnina šį popup → visada -1 (atitinka tikrą counterio pokytį)

          const mText = '-1';

          ctx.font = 'bold 11px "Press Start 2P", monospace';

          ctx.textAlign = 'center';

          ctx.fillStyle = `rgba(0,0,0,${alpha * 0.7})`;

          ctx.fillText(mText, 0, 2);

          ctx.fillStyle = `rgba(0,0,0,${alpha * 0.95})`;

          ctx.fillText(mText, 1, 0);

          ctx.fillText(mText, -1, 0);

          ctx.fillText(mText, 0, 1);

          ctx.fillText(mText, 0, -1);

          // Main fill — pagal zone tier: NICE green, PERFECT gold, RONKE STRONKE blue, normal red

          if (popup.perfect) {

            let pr = 255, pg = 215, pb = 80;

            if (popup.zoneTier === 'nice')              { pr = 180; pg = 230; pb = 130; }

            else if (popup.zoneTier === 'ronke_stronke'){ pr = 120; pg = 180; pb = 255; }

            ctx.fillStyle = `rgba(${pr},${pg},${pb},${alpha})`;

          } else {

            ctx.fillStyle = `rgba(${colR},${colG},${colB},${alpha})`;

          }

          ctx.fillText(mText, 0, 0);

          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.55})`;

          ctx.fillText(mText, 0, -1);

          ctx.restore();

        }

      }

    }

    ctx.textAlign = 'left';

  }

  function drawLauncher(L, t) {

    const lx = L.launcher.x, ly = L.launcher.y;

    const ang = launcher.angle;

    const PX = 2;

    const snap = (v) => Math.round(v / PX) * PX;

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    // ── PLATFORMA — medinė platforma po RONKE + patranka, su gyvu game progress info ──

    _drawLauncherPlatform(L, t, lx, ly);

    // ── PEDESTALO BAZĖ — chunky pixel art akmens base'as ────────────

    // Outer akmens žiedas

    const baseR = 32;

    // ── RONKE su kepure — personažas kairėj nuo patrankos (tarsi jis ją valdo) ──

    const _ronkeSpr = _getRonke2Frames();

    if (_ronkeSpr) {

      const frame = Math.floor(t / 130) % _RONKE2_FRAMES;   // ~7.7fps idle

      const dw = _ronkeSpr.dw, dh = _ronkeSpr.dh;

      const rcx = lx - baseR - 46;          // kairėj nuo pedestalo — atstumas, nesiliečia su patranka

      const rcy = ly - 7;                   // ~launcher centro lygis (-13px aukščiau)

      // Šešėlis po RONKE

      ctx.fillStyle = 'rgba(0,0,0,0.32)';

      ctx.fillRect(snap(rcx - dw * 0.20), snap(rcy + dh * 0.30), snap(dw * 0.40), PX * 2);

      ctx.drawImage(_ronkeSpr.canvas, frame * dw, 0, dw, dh,

                    snap(rcx - dw / 2), snap(rcy - dh / 2), dw, dh);

      // ── Lazdos burbulas — perdažom į SEKANČIO kamuoliuko spalvą (1 žingsnis į priekį) ──

      // Overlay tiesiai ant balto orbo sprite'e — uždedam spalvotą diską jo vietoj.

      // Per reload metu — burbulas mirksi atsitiktinėmis spalvomis, kol pasibaigia cooldown,

      // tada atsidengia tikra nextNextBlock spalva + magiškas reveal garsiukas.

      if (nextNextBlock) {

        const _isReload = lastFireAt > 0 && (t - lastFireAt) < _currentReloadMs;

        // Reveal — paleidžiam garsiuką, kai ką tik pasibaigė reload + ready-flash burst

        if (!_isReload && !_f12ReloadEndPlayed) {

          _F12Audio.colorReveal();

          _f12ReloadEndPlayed = true;

          _f12ReadyFlashAt = t;

        }

        // Per-frame orbo offset — orbas juda kartu su lazda animacijos metu

        const _orbOff = _RONKE2_ORB_OFFSETS[frame] || _RONKE2_ORB_OFFSETS[0];

        const bx = snap(rcx + dw * _orbOff[0]) - 1;   // -1px į kairę (centruotas ant lazdos)

        const by = snap(rcy + dh * _orbOff[1]) + 2;   // +2px žemyn (orbas sprite'e truputį žemiau bbox centro)

        const br = 12;                             // orbo dydis (display ~24 px, +6px nuo orig)

        // Spalva — visada tikra nextNextBlock (be flicker)

        const col = TYPE_COLOR[nextNextBlock.type] || TYPE_COLOR.arrow;

        // Pulse'inanti spalva (magiškas šnypštimas)

        const pulse = 0.85 + 0.15 * Math.sin(t * 0.008);

        // Užpildom orbo plotą spalva (perdažo baltą burbulą)

        for (let dy2 = -br; dy2 <= br; dy2 += PX) {

          for (let dx2 = -br; dx2 <= br; dx2 += PX) {

            const d = Math.sqrt(dx2*dx2 + dy2*dy2);

            if (d > br) continue;

            // Edge → tamsesnė; centras → šviesesnis (sferinis shading)

            const edgeK = d / br;            // 0 centre, 1 edge

            let band;

            if (edgeK < 0.30) band = col.top;

            else if (edgeK < 0.60) band = col.front;

            else if (edgeK < 0.85) band = col.left;

            else band = col.back;

            ctx.fillStyle = `rgba(${band[0]},${band[1]},${band[2]},${pulse})`;

            ctx.fillRect(bx + dx2, by + dy2, PX, PX);

          }

        }

        // Mažas baltas highlight viršuje-kairėj (specular)

        ctx.fillStyle = `rgba(255,255,255,${pulse})`;

        ctx.fillRect(bx - PX*2, by - PX*2, PX, PX);

        ctx.fillRect(bx - PX, by - PX*2, PX, PX);

        ctx.fillRect(bx - PX*2, by - PX, PX, PX);

        // ── Magiškas ryšys orbas → patranka ───────────────────────────

        // Atrodo kad RONKE kanalizuoja sekančią spalvą į patranką (žaidėjas valdo RONKE,

        // RONKE valdo patranką). Pikselinė arka su pulsuojančiomis srauto dotomis.

        {

          const cnx = lx - 6, cny = ly - 4;          // patrankos „intake" taškas

          // Bezier kontrolinis taškas — virš tiesės, kad arka linktų aukštyn (magiška)

          const cpx = (bx + cnx) / 2;

          const cpy = (by + cny) / 2 - 22;

          const numDots = 14;

          // Bendras alpha — labai subtilus, kad neužgožtų UI

          const baseAlpha = 0.55;

          for (let i = 0; i < numDots; i++) {

            const tt = (i + 0.5) / numDots;

            const omt = 1 - tt;

            const px = omt*omt*bx + 2*omt*tt*cpx + tt*tt*cnx;

            const py = omt*omt*by + 2*omt*tt*cpy + tt*tt*cny;

            // Srauto pulsas — banga keliauja nuo orbo į patranką

            const wave = ((t * 0.0012) - tt + 1) % 1;

            const pulseF = 0.30 + 0.70 * Math.max(0, 1 - Math.abs(wave - 0.5) * 3);

            const intensity = baseAlpha * pulseF;

            // Centras — šviesi spalvos top, krašt'ai — tamsesni

            ctx.fillStyle = `rgba(${col.top[0]},${col.top[1]},${col.top[2]},${intensity})`;

            ctx.fillRect(snap(px) - PX/2, snap(py) - PX/2, PX, PX);

            // Vidurinėj kelio dalyje — papildomas blizgesys (magic spark)

            if (pulseF > 0.85) {

              ctx.fillStyle = `rgba(255,255,255,${intensity * 0.6})`;

              ctx.fillRect(snap(px), snap(py), 1, 1);

            }

          }

          // ── ŠŪVIO FEEDBACK'AS — orb flash (energija išleista iš orbo) ──

          // Pašalinti keliaujantis white disc + trail (kurį maišė su Phase 2 white ball'u).

          // Palieku tik orbo blyksnį, kad žaidėjas matytų „orbas atidavė energiją".

          const fireAge = t - lastFireAt;

          if (fireAge < 200 && lastFireAt > 0) {

            const ofK = fireAge / 200;

            ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - ofK)})`;

            for (let dy3 = -br - 2; dy3 <= br + 2; dy3 += PX) {

              for (let dx3 = -br - 2; dx3 <= br + 2; dx3 += PX) {

                if (dx3*dx3 + dy3*dy3 > (br + 2)*(br + 2)) continue;

                ctx.fillRect(bx + dx3, by + dy3, PX, PX);

              }

            }

          }

        }

      }

    }

    // Pedestalo bazė — cache'intas sprite (statinis, renderinamas vieną kartą)

    const _baseSpr = _getLauncherBaseSprite();

    ctx.drawImage(_baseSpr.canvas, snap(lx) - _baseSpr.cc, snap(ly) - _baseSpr.cc);

    // ── PATRANKA — chunky pixel art barrel ──────────────────────────

    if (_f12FireRecoil > 0.1) _f12FireRecoil *= 0.78;

    const recX = -Math.cos(_f12FireRecoilAng) * _f12FireRecoil;

    const recY = -Math.sin(_f12FireRecoilAng) * _f12FireRecoil;

    ctx.save();

    ctx.translate(lx + recX, ly + recY);

    ctx.rotate(ang);

    // Cache'intas patrankos sprite — vienas drawImage vietoj dešimčių fillRect'ų

    const _barrelSpr = _getBarrelSprite();

    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(_barrelSpr.canvas, -_barrelSpr.offX, -_barrelSpr.offY);

    ctx.restore();

    // Kitas blokas matomas patrankoj — tas pats dydis kaip arenoje

    const r = radiusForValue(nextBlock.value);

    // Cooldown — kai reload'inasi, ball preview blanks + chunky pixel ring rodo progresą

    const cdElapsed = t - lastFireAt;

    const reloading = cdElapsed < _currentReloadMs;

    if (reloading) {

      // Reload sekvenza turi 3 distinct fazes (sequential, kad žaidėjas matytų aiškų skirtumą):

      //   1) SHOT (0..350ms) — fire burst iš orbo per beam į patranką (energija delivers'ina senąjį)

      //   2) LOAD (350..550ms) — patranka tuščia, RONKE „surenka" naują magiją (sparkle gather)

      //   3) FILL (550ms..reload pabaiga) — baltas rutuliukas „pop'inasi" + spalva pildosi

      const LOAD_DELAY_MS = 550;

      const SUMMON_START_MS = 350;     // po fire burst pabaigos

      const POP_DUR_MS = 80;

      // Phase 2 — BALTAS RUTULIUKAS keliauja iš RONKE lazdos orbo į patranką palei beam'ą

      if (cdElapsed >= SUMMON_START_MS && cdElapsed < LOAD_DELAY_MS) {

        const _ronkeSprC = _getRonke2Frames();

        if (_ronkeSprC) {

          const frameC = Math.floor(t / 130) % _RONKE2_FRAMES;

          const dwC = _ronkeSprC.dw, dhC = _ronkeSprC.dh;

          const rcxC = lx - baseR - 46;

          const rcyC = ly - 1;

          const _orbOffC = _RONKE2_ORB_OFFSETS[frameC] || _RONKE2_ORB_OFFSETS[0];

          // Orbo pozicija (start)

          const bxC = snap(rcxC + dwC * _orbOffC[0]) - 1;

          const byC = snap(rcyC + dhC * _orbOffC[1]) + 2;

          // Patrankos „intake" (end)

          const cnxC = lx - 6, cnyC = ly - 4;

          // Bezier kontrolinis taškas — virš tiesės (arka aukštyn)

          const cpxC = (bxC + cnxC) / 2;

          const cpyC = (byC + cnyC) / 2 - 22;

          // Kelionės progresas 0..1

          const tt = (cdElapsed - SUMMON_START_MS) / (LOAD_DELAY_MS - SUMMON_START_MS);

          const omt = 1 - tt;

          const px = omt*omt*bxC + 2*omt*tt*cpxC + tt*tt*cnxC;

          const py = omt*omt*byC + 2*omt*tt*cpyC + tt*tt*cnyC;

          // Trail — kelios mažos baltos pixel'ės už rutuliuko (motion blur feel)

          for (let tr = 1; tr <= 4; tr++) {

            const tT = tt - tr * 0.06;

            if (tT < 0) break;

            const omT = 1 - tT;

            const tpx = omT*omT*bxC + 2*omT*tT*cpxC + tT*tT*cnxC;

            const tpy = omT*omT*byC + 2*omT*tT*cpyC + tT*tT*cnyC;

            const tA = (1 - tr / 5) * 0.55;

            ctx.fillStyle = `rgba(255,255,255,${tA})`;

            ctx.fillRect(snap(tpx) - PX, snap(tpy) - PX, PX*2, PX*2);

          }

          // Pats baltas rutuliukas — pradžioj mažas (4px), keliaudamas auga iki 7px

          const ballR = 4 + tt * 3;

          ctx.fillStyle = '#fff';

          for (let dy = -ballR; dy <= ballR; dy += PX) {

            for (let dx = -ballR; dx <= ballR; dx += PX) {

              if (dx*dx + dy*dy > ballR*ballR) continue;

              ctx.fillRect(snap(px + dx), snap(py + dy), PX, PX);

            }

          }

          // Mažas spalvotas glow aplink baltą rutuliuką (būsima spalva ant briaunos)

          const ccolC = TYPE_COLOR[nextBlock.type] || TYPE_COLOR.arrow;

          const glowR = ballR + 2;

          ctx.fillStyle = `rgba(${ccolC.top[0]},${ccolC.top[1]},${ccolC.top[2]},0.45)`;

          for (let dy = -glowR; dy <= glowR; dy += PX) {

            for (let dx = -glowR; dx <= glowR; dx += PX) {

              const dd = dx*dx + dy*dy;

              if (dd > glowR*glowR || dd <= ballR*ballR) continue;

              ctx.fillRect(snap(px + dx), snap(py + dy), PX, PX);

            }

          }

        }

      }

      if (cdElapsed < LOAD_DELAY_MS) {

        // Phase 1+2 — patranka be sferos (fire burst + sparkle gather rodomi atskirai)

      } else {

      const fillElapsed = cdElapsed - LOAD_DELAY_MS;

      const fillTotal = Math.max(100, _currentReloadMs - LOAD_DELAY_MS);

      const rp = clamp(fillElapsed / fillTotal, 0, 1);

      const ccol = TYPE_COLOR[nextBlock.type] || TYPE_COLOR.arrow;

      // Pop scale-in pirmais 80ms — baltas rutuliukas „atsiranda" su elastic bounce

      const popK = clamp(fillElapsed / POP_DUR_MS, 0, 1);

      const popScale = popK < 1

        ? 0.30 + 0.70 * (1 - Math.pow(1 - popK, 3))   // ease-out cubic 0.30→1.0

        : 1;

      const effR = Math.max(2, Math.round(r * popScale));

      // Bazė: tikra spalvota sfera (always full opacity), pop scale per pirmus 80ms

      drawSphere(ctx, lx, ly, effR, 0, 0, nextBlock.type, nextBlock.value, 0);

      // Fill line Y — kyla iš apačios (ly + effR) į viršų (ly - effR) per reload

      const fillBaseY = (ly + effR) - 2 * effR * rp;

      // Liquid wobble per X — sinusoidinė banga

      const wobAmp = 1.6;

      const wobFreq = 0.18;

      const wobSpeed = 0.006;

      // Baltas overlay — viskas VIRŠUJ wavy fill line lieka balta („dar netaškas")

      for (let dy = -effR; dy <= effR; dy += PX) {

        for (let dx = -effR; dx <= effR; dx += PX) {

          if (dx*dx + dy*dy > effR*effR) continue;

          const py = ly + dy;

          const localFillY = fillBaseY + Math.sin(t * wobSpeed + (lx + dx) * wobFreq) * wobAmp;

          if (py < localFillY) {

            const chPulse = 0.92 + 0.08 * Math.sin(t * 0.010 + dy * 0.12);

            ctx.fillStyle = `rgba(255,255,255,${chPulse})`;

            ctx.fillRect(snap(lx + dx), snap(ly + dy), PX, PX);

          }

        }

      }

      // Šviesi linija ties fill paviršium — „skysčio" briaunos highlight

      ctx.fillStyle = `rgba(255,255,255,0.85)`;

      for (let dx = -effR; dx <= effR; dx += PX) {

        const ldy = Math.sqrt(effR*effR - dx*dx);

        const py = fillBaseY + Math.sin(t * wobSpeed + (lx + dx) * wobFreq) * wobAmp;

        if (Math.abs(py - ly) > ldy) continue;

        ctx.fillRect(snap(lx + dx), snap(py), PX, PX);

      }

      // Spalvotos burbuliukų žiežirbos — kyla iš fill paviršiaus aukštyn

      const NUM_BUB = 4;

      for (let b = 0; b < NUM_BUB; b++) {

        const life = ((t * 0.0017) + b * 0.27) % 1;

        const seedX = ((b * 41 + Math.floor(((t * 0.0017) + b * 0.27))) * 73) % 1000 / 1000;

        const bx0 = lx + (seedX - 0.5) * effR * 1.5;

        const ldy = Math.sqrt(Math.max(0, effR*effR - (bx0 - lx)*(bx0 - lx)));

        if (ldy < 1) continue;

        const surfaceY = fillBaseY + Math.sin(t * wobSpeed + bx0 * wobFreq) * wobAmp;

        const by0 = surfaceY - life * 10;

        if (by0 < ly - ldy) continue;

        if ((bx0 - lx)*(bx0 - lx) + (by0 - ly)*(by0 - ly) > effR*effR) continue;

        const fade = 1 - life;

        const sz = life < 0.3 ? PX : (life < 0.7 ? PX*2 : PX);

        ctx.fillStyle = `rgba(${ccol.top[0]},${ccol.top[1]},${ccol.top[2]},${fade})`;

        ctx.fillRect(snap(bx0) - sz/2, snap(by0) - sz/2, sz, sz);

      }

      }   // end else (Phase 2 — fill)

    } else {

      // READY — sphere be glow ringo (panaikintas geltonas mirksintis žiedas)

      drawSphere(ctx, lx, ly, r, 0, 0, nextBlock.type, nextBlock.value, 0);

      // ── POLISHED GEM SHINE — diagonali šviesos juosta periodiškai sweep'ina sferą ──

      // PIRMAS sweep'as paleidžiamas IŠKART kartu su colorReveal() garsu (sync prie reload pabaigos).

      // Po to kartojasi kas 2100ms — „va aš jau pasiruošęs, blizgu, naujas".

      const SWEEP_CYCLE = 2100;          // pilnas ciklas ms

      const SWEEP_DUR = 380;             // sweep'o trukmė

      const sweepBase = _f12ReadyFlashAt || 0;

      const sweepElapsed = t - sweepBase;

      const cycleT = sweepElapsed >= 0 ? sweepElapsed % SWEEP_CYCLE : -1;

      if (cycleT >= 0 && cycleT < SWEEP_DUR) {

        const localK = cycleT / SWEEP_DUR;          // 0..1

        // Pozicija — iš viršaus-kairės (-r*√2) į apačią-dešinę (+r*√2)

        const sweepRange = r * Math.SQRT2 * 2;

        const sweepPos = -r * Math.SQRT2 + sweepRange * localK;

        const sweepWidth = r * 0.40;                // juostos plotis

        // Diagonalus axis (1,1)/√2 — projektuojam pikselio (dx,dy) ant jo

        for (let dy = -r; dy <= r; dy += PX) {

          for (let dx = -r; dx <= r; dx += PX) {

            if (dx*dx + dy*dy > r*r) continue;

            const proj = (dx + dy) * 0.7071;

            const distFromSweep = Math.abs(proj - sweepPos);

            if (distFromSweep > sweepWidth) continue;

            // Bell envelope — ryškiausia juostos vidury, fade kraštuose

            const bandK = 1 - distFromSweep / sweepWidth;

            // Plus papildomas overall fade pradžioje/pabaigoje, kad sweep'as „atskrenda" ir „dingsta"

            const lifeFade = Math.sin(localK * Math.PI);   // 0→1→0

            const intensity = bandK * lifeFade * 0.90;

            ctx.fillStyle = `rgba(255,255,255,${intensity})`;

            ctx.fillRect(snap(lx + dx), snap(ly + dy), PX, PX);

          }

        }

      }

    }

    // Charging power meter — chunky pixel ring (kai user'is hold'ina)

    if (charging && !gameOver) {

      const ch = getChargeLevel();

      _drawChargeRing(lx, ly, ch, t, true);

    }

    ctx.restore();   // matches outer ctx.save() at function start

  }

  // Chunky pixel art charge/cooldown ring aplink launcher pedestalą

  // Naudoja brass+iron paletę, tinka prie naujos patrankos dizaino

  function _drawChargeRing(cx, cy, progress, t, isCharging) {

    const PX = 2;

    const SEGS = 24;

    const ringR = 34;          // outer radius

    const ringInner = 30;      // inner radius

    const k = clamp(progress, 0, 1);

    const filledSegs = Math.floor(k * SEGS);

    const partialFrac = (k * SEGS) - filledSegs;   // dalinis paskutinis segmentas

    // Spalva pagal progress'ą (žalia → geltona → raudona arba aukso pagal būseną)

    const getColor = (segK) => {

      if (isCharging) {

        // Charging: green → yellow → red

        if (segK < 0.5) {

          const a = segK / 0.5;

          return { r: 80 + Math.floor(a * 180), g: 220 + Math.floor((230-220) * a), b: 90 + Math.floor((80-90) * a) };

        } else {

          const a = (segK - 0.5) / 0.5;

          return { r: 255, g: Math.floor(230 - a * 150), b: Math.floor(80 - a * 30) };

        }

      } else {

        // Cooldown: brass gradient (dark to bright as it fills)

        return { r: 200 + Math.floor(55 * segK), g: 130 + Math.floor(100 * segK), b: 40 + Math.floor(60 * segK) };

      }

    };

    const fullPulse = (isCharging && k > 0.95) ? (0.7 + 0.3 * Math.sin(t * 0.025)) : 1;

    for (let i = 0; i < SEGS; i++) {

      // Segments start from top (-PI/2), going clockwise

      const ang = -Math.PI / 2 + (i / SEGS) * Math.PI * 2;

      const ang2 = -Math.PI / 2 + ((i + 0.95) / SEGS) * Math.PI * 2;

      const midAng = (ang + ang2) / 2;

      // Pixel art "brick" segment

      const outerX = cx + Math.cos(midAng) * ringR;

      const outerY = cy + Math.sin(midAng) * ringR;

      const innerX = cx + Math.cos(midAng) * ringInner;

      const innerY = cy + Math.sin(midAng) * ringInner;

      const isFilled = i < filledSegs;

      const isPartial = i === filledSegs && partialFrac > 0;

      // Pixel hash chunk drawn at segment center (snap to pixel grid)

      const segCenterX = Math.round((outerX + innerX) / 2 / PX) * PX;

      const segCenterY = Math.round((outerY + innerY) / 2 / PX) * PX;

      // Determine segment size based on angle (perpendicular to ring direction)

      // Each segment ~PX*3 wide

      const px = Math.round(Math.cos(midAng) / PX) * PX;

      const py = Math.round(Math.sin(midAng) / PX) * PX;

      const tx = -py;  // perpendicular (tangent)

      const ty = px;

      // Black outline (always)

      ctx.fillStyle = 'rgba(0,0,0,0.7)';

      const w = PX * 2, h = PX * 3;

      for (let oy = -h - PX; oy <= h + PX; oy += PX) {

        for (let ox = -w - PX; ox <= w + PX; ox += PX) {

          // Ortografinis "brick" — sukam koord pagal mid angle (paprasta apgaulė: piešiam stačiakampį be rotacijos)

          const drawX = Math.round((cx + Math.cos(midAng) * (ringR + ox * (Math.abs(tx) + Math.abs(ty)) * 0)) / PX) * PX;

          const drawY = Math.round((cy + Math.sin(midAng) * (ringR + oy * 0)) / PX) * PX;

          break;  // not great

        }

        break;

      }

      // Simpler: just snap segment position to pixel grid

      if (isFilled || isPartial) {

        const col = getColor(i / SEGS);

        const alpha = isPartial ? partialFrac * fullPulse : 1 * fullPulse;

        // Outer black border (chunky pixel)

        ctx.fillStyle = `rgba(0,0,0,${0.85 * alpha})`;

        ctx.fillRect(segCenterX - PX*2, segCenterY - PX*2, PX*4, PX*4);

        // Filled center

        ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${alpha})`;

        ctx.fillRect(segCenterX - PX, segCenterY - PX, PX*2, PX*2);

        // Bright highlight pixel (top-left)

        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.7})`;

        ctx.fillRect(segCenterX - PX, segCenterY - PX, PX, PX);

      } else {

        // Unfilled — tamsus tuščias slotas

        ctx.fillStyle = 'rgba(0,0,0,0.6)';

        ctx.fillRect(segCenterX - PX*2, segCenterY - PX*2, PX*4, PX*4);

        ctx.fillStyle = '#1a0e06';

        ctx.fillRect(segCenterX - PX, segCenterY - PX, PX*2, PX*2);

      }

    }

    // 100% charge — outer flash ring + intense sparks

    if (isCharging && k > 0.95) {

      const flashAlpha = 0.4 + 0.4 * Math.sin(t * 0.030);

      // Outer halo

      for (let p = 0; p < 8; p++) {

        const ang = p * Math.PI / 4 + t * 0.005;

        const sx = Math.round((cx + Math.cos(ang) * 42) / PX) * PX;

        const sy = Math.round((cy + Math.sin(ang) * 42) / PX) * PX;

        ctx.fillStyle = `rgba(255,240,160,${flashAlpha})`;

        ctx.fillRect(sx - PX, sy - PX, PX*2, PX*2);

        ctx.fillStyle = '#ffffff';

        ctx.fillRect(sx, sy, PX, PX);

      }

      // "READY!" tekstas

      ctx.fillStyle = `rgba(0,0,0,0.9)`;

      ctx.font = 'bold 8px "Press Start 2P", monospace';

      ctx.textAlign = 'center';

      ctx.fillText('READY!', cx + 1, cy - 36 + 1);

      ctx.fillStyle = `rgba(255,80,60,${0.85 + 0.04 * Math.sin(t * 0.025)})`;

      ctx.fillText('READY!', cx, cy - 36);

    }

  }

  function drawNextPreview(L, t) {

    const W = L.W;

    const px = W - 80, py = 86, pw = 60, ph = 60;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';

    ctx.fillRect(px - 6, py - 6, pw + 12, ph + 28);

    ctx.fillStyle = '#ffe7a8';

    ctx.font = '9px "Press Start 2P", monospace';

    ctx.textAlign = 'center';

    ctx.fillText('NEXT', px + pw / 2, py + 4);

    drawSphere(ctx, px + pw / 2, py + ph / 2 + 6, pw * 0.04, 0, 0, nextBlock.type, nextBlock.value, 0);

  }

  // HOLD slotas — apačioj, kairėj nuo kortų eilės. Korta-stiliaus rėmas, „HOLD" antraštė,

  // įdubęs lizdas su išsaugota spalva (arba tuščias) + spalvotas glow kai laiko. Tap = save/swap.

  function _drawHoldSlot(L, t) {

    if (gameOver) { _f12HoldRect = null; return; }

    const layout = _getCardLayout(L);

    if (!layout) { _f12HoldRect = null; return; }

    const PX = 2;

    const bw = _CARD_W, bh = _CARD_H;             // toks pat dydis kaip kortos (sėdi eilėj)

    let bx = layout.startX - _CARD_GAP - bw;       // kairėj nuo pirmos kortos

    if (bx < 6) bx = 6;

    const by = layout.cardY;

    // TAPPABLE HITBOX > vizualas: STASH mažas → mobile pirštas prašaudavo ir prakrisdavo

    // į patrankos charge → netyčia šūvis. Plečiam paspaudimo plotą (kairėn iki krašto, aukštyn/

    // žemyn margin'u), DEŠINĖN tik iki pirmos kortos (kad neperimtų jos paspaudimo). Vizualas (bx/by/bw/bh) nesikeičia.

    const _hm = _IS_MOBILE ? Math.round(bh * 0.55) : Math.round(bh * 0.18);

    const _hx = Math.max(0, bx - _hm);

    const _hy = Math.max(0, by - _hm);

    const _hr = Math.min(bx + bw + _hm, layout.startX - 2);   // neperžengia pirmos kortos

    const _hb = by + bh + _hm;

    _f12HoldRect = { x: _hx, y: _hy, w: _hr - _hx, h: _hb - _hy };

    const has = !!_f12HoldBall;

    const hc = has ? (TYPE_COLOR[_f12HoldBall.type] || TYPE_COLOR.arrow) : null;

    const flash = _f12HoldFlashAt > 0 ? Math.max(0, 1 - (t - _f12HoldFlashAt) / 320) : 0;

    const pulse = 0.5 + 0.5 * Math.sin(t * 0.005);

    ctx.save();

    ctx.imageSmoothingEnabled = false;

    ctx.textAlign = 'center';

    // ── L1: juodas outline + 2px nukirsti kampai (kaip kortos)

    ctx.fillStyle = '#000';

    ctx.fillRect(bx, by, bw, bh);

    ctx.clearRect(bx, by, PX, PX); ctx.clearRect(bx + bw - PX, by, PX, PX);

    ctx.clearRect(bx, by + bh - PX, PX, PX); ctx.clearRect(bx + bw - PX, by + bh - PX, PX, PX);

    // ── L2: medienos frame su highlight (top/left) + shadow (bottom/right)

    ctx.fillStyle = has ? '#6a4626' : '#4a3018';

    ctx.fillRect(bx + PX, by + PX, bw - PX * 2, bh - PX * 2);

    ctx.fillStyle = has ? '#b08458' : '#624028';

    ctx.fillRect(bx + PX, by + PX, bw - PX * 2, PX);          // top highlight

    ctx.fillRect(bx + PX, by + PX, PX, bh - PX * 2);          // left highlight

    ctx.fillStyle = '#1a0e06';

    ctx.fillRect(bx + PX, by + bh - PX * 2, bw - PX * 2, PX); // bottom shadow

    ctx.fillRect(bx + bw - PX * 2, by + PX, PX, bh - PX * 2); // right shadow

    // ── L3: vidinis tamsus turinio plotas

    const ix = bx + PX * 3, iy = by + PX * 3, iw = bw - PX * 6, ih = bh - PX * 6;

    ctx.fillStyle = '#0a0604';

    ctx.fillRect(ix, iy, iw, ih);

    ctx.fillStyle = '#1c1208';

    ctx.fillRect(ix + PX, iy + PX, iw - PX * 2, ih - PX * 2);

    // ── HEADER juostelė „HOLD" (auksinė kai laiko, kuklesnė kai tuščia)

    const hdrH = 14;

    ctx.fillStyle = has ? 'rgba(255,207,92,0.96)' : 'rgba(74,57,36,0.95)';

    ctx.fillRect(ix + PX, iy + PX, iw - PX * 2, hdrH);

    ctx.fillStyle = has ? '#3a2a18' : '#cdb88c';

    ctx.font = '7px "Press Start 2P", monospace';

    ctx.fillText('STASH', bx + bw / 2, iy + PX + 10);

    // ── SOCKET — apvalus įdubęs lizdas

    const ccx = bx + bw / 2, ccy = iy + PX + hdrH + 26;

    const sr = 16;

    ctx.fillStyle = '#05030a';                                // įdubimo dugnas

    ctx.beginPath(); ctx.arc(ccx, ccy, sr + 1, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#120a16';

    ctx.beginPath(); ctx.arc(ccx, ccy, sr - 1, 0, Math.PI * 2); ctx.fill();

    if (has) {

      // spalvotas glow žiedas (pulsuojantis) — magiškas „laikoma" jausmas

      for (let g = 0; g < 3; g++) {

        ctx.strokeStyle = `rgba(${hc.top[0]},${hc.top[1]},${hc.top[2]},${(0.34 - g * 0.1) * (0.7 + 0.3 * pulse) + flash * 0.2})`;

        ctx.lineWidth = 2;

        ctx.beginPath(); ctx.arc(ccx, ccy, 13 + g * 2 + flash * 3, 0, Math.PI * 2); ctx.stroke();

      }

      drawSphere(ctx, ccx, ccy, 12, 0, 0, _f12HoldBall.type, _f12HoldBall.value, 0);

    } else {

      // tuščias — punktyrinis žiedas + „+" centre

      ctx.setLineDash([3, 3]);

      ctx.strokeStyle = `rgba(255,231,168,${0.28 + 0.14 * pulse})`;

      ctx.lineWidth = 2;

      ctx.beginPath(); ctx.arc(ccx, ccy, sr - 4, 0, Math.PI * 2); ctx.stroke();

      ctx.setLineDash([]);

      ctx.fillStyle = `rgba(255,231,168,${0.4 + 0.15 * pulse})`;

      ctx.fillRect(ccx - 5, ccy - PX / 2, 10, PX);            // „+" horizontalus

      ctx.fillRect(ccx - PX / 2, ccy - 5, PX, 10);            // „+" vertikalus

    }

    // ── LOCKED overlay — užrakinta iki šūvio (vienkryptė mechanika): pritemdom turinį

    if (_f12HoldLockedUntilFire) {

      ctx.fillStyle = 'rgba(0,0,0,0.45)';

      ctx.fillRect(bx + PX, by + PX, bw - PX * 2, bh - PX * 2);

    }

    // ── BOTTOM hint

    if (_f12HoldLockedUntilFire) {

      ctx.fillStyle = 'rgba(255,150,120,0.95)';                 // FIRE! — reikia iššauti

      ctx.font = '7px "Press Start 2P", monospace';

      ctx.fillText('FIRE!', bx + bw / 2, by + bh - 8);

    } else {

      ctx.fillStyle = has ? 'rgba(255,231,168,0.9)' : 'rgba(205,184,140,0.55)';

      ctx.font = '7px "Press Start 2P", monospace';

      ctx.fillText(has ? 'USE' : 'SAVE', bx + bw / 2, by + bh - 8);

    }

    // ── swap blyksnis — auksinis kontūras aplink visą slotą

    if (flash > 0) {

      ctx.strokeStyle = `rgba(255,225,150,${flash * 0.9})`;

      ctx.lineWidth = 2;

      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);

    }

    ctx.restore();

  }

  function drawBlocks(L, t) {

    // Pirma — visi sesieliai (pieshiami zemiausiame layeryje)

    for (const b of blocks) drawBlockShadow(b, t);

    // Tada — Y-sorted blokai (artimesni rendertini virsuje)

    const sorted = blocks.slice().sort((a, b) => {

      // Y + z combined — žemesnis y + didesnis z = arčiau kameros

      const ay = a.y + a.z * 0.4;

      const by = b.y + b.z * 0.4;

      const d = ay - by;

      if (Math.abs(d) > 1) return d;

      const ab = a.mergeBoom ? 1 : 0;

      const bb = b.mergeBoom ? 1 : 0;

      return ab - bb;

    });

    for (const b of sorted) drawBlockEntity(b, t);

  }

  // Šešėlis ant grindų — anchor TIKSLEI prie b.y (ground level, kur kubo apačia liečia žemę)

  // Inspiracija: psychicsoftware.com 2D shadow grounding + GameMaker z-tilting techniques

  function drawBlockShadow(b, t) {

    const z = b.z || 0;

    // Aukštis virs grindu — kuo aukščiau, tuo mažesnis ir blyškesnis šešėlis

    const heightFactor = clamp(1 - z / 220, 0.20, 1);

    // Light source iš viršaus-kairės → šešėlis pasislenka šiek tiek dešinėn-žemyn

    const offX = 3 * heightFactor;

    const offY = 2 * heightFactor;

    const baseSx = b.r * 1.00 * heightFactor;

    const baseSy = b.r * 0.32 * heightFactor;

    ctx.save();

    // Multi-layer soft shadow + ryškus contact-core kai z=0 (kontaktas su žeme)

    const layers = [

      { scale: 1.45, alpha: 0.08 },   // outer halo (soft falloff)

      { scale: 1.15, alpha: 0.18 },   // mid

      { scale: 0.90, alpha: 0.40 },   // core (main dark)

    ];

    // Contact dark — tik kai z labai mažas (kubas liečia žemę). Tai duoda "weight" jausmą.

    if (z < 4) {

      layers.push({ scale: 0.65, alpha: 0.55 });   // ryškus dark spot tiesiai po kubu

    }

    for (const L of layers) {

      ctx.fillStyle = `rgba(0,0,0,${L.alpha * heightFactor})`;

      ctx.beginPath();

      // Šešėlis ant b.y linijos — tiksliai kur kubo apačia liečia žemę

      ctx.ellipse(b.x + offX, b.y + offY, baseSx * L.scale, baseSy * L.scale, 0, 0, Math.PI * 2);

      ctx.fill();

    }

    ctx.restore();

  }

  function drawBlockEntity(b, t) {

    const cx = b.x;

    let cy = b.y - (b.z || 0) - b.r;

    let r = b.r;

    let glow = b.glow || 0;

    const sk = (t - b.spawnedAt) / 220;

    if (sk < 1) {

      const e = sk < 0 ? 0 : sk;

      const s = 0.65 + 0.35 * (1 - Math.pow(1 - e, 3));

      r *= s;

    }

    if (b.mergeBoom) {

      const k = (t - b.mergeBoom.startedAt) / b.mergeBoom.duration;

      if (k >= 1) b.mergeBoom = null;

      else if (k >= 0) glow = Math.max(glow, Math.sin(k * Math.PI) * 1.0);

    }

    // ── TRAIL — pixel'inė juodega už skrendančio kamuoliuko (tik ore)

    if (b._trail && b._trail.length > 1 && b.z > 0) {

      const col = TYPE_COLOR[b.type] || TYPE_COLOR.arrow;

      for (let i = 0; i < b._trail.length; i++) {

        const p = b._trail[i];

        const age = (t - p.t) / 220;

        if (age > 1) continue;

        const alpha = Math.max(0, (1 - age) * 0.45);

        const sz = Math.max(2, Math.floor((1 - age) * r * 0.6 / 2) * 2);

        ctx.fillStyle = `rgba(${col.front[0]},${col.front[1]},${col.front[2]},${alpha})`;

        ctx.fillRect(Math.round(p.x - sz / 2), Math.round((p.y - r) - sz / 2), sz, sz);

      }

    }

    drawSphere(ctx, cx, cy, r, b._lastMotionAng || 0, b.rolled || 0, b.type, b.value, glow);

  }

  function drawDeployPanel(L, t) {

    deployBtnRects = [];

    // Visi 7 unit tipai (rodom net jei count=0, kad žaidėjas matytų visą deck'ą)

    const allUnitTypes = ['archer', 'tower', 'shaman', 'harpoon_fish', 'crossbow_tower', 'zip', 'skull'];

    const types = allUnitTypes.filter(k => deployPool[k] > 0 || _f12UnitDeployCD[k]);  // arba turi count, arba CD aktyvus

    if (types.length === 0) return;

    // Reverse mapping — unit type → ball type (kad žinotume kokia spalva ant kortos)

    const BALL_FOR_UNIT = {};

    for (const bt in _UNIT_FOR_BALL_TYPE) BALL_FOR_UNIT[_UNIT_FOR_BALL_TYPE[bt]] = bt;

    const cardW = 64, cardH = 80;     // didesnė kortelė — telpa ball + count + CD

    const panelH = cardH + 14;

    const panelW = Math.min(L.W - 240, types.length * (cardW + 8) + 20);

    const panelX = 16;

    const panelY = L.H - panelH - 50;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';

    ctx.fillRect(panelX, panelY, panelW, panelH);

    ctx.strokeStyle = '#7a5a3a';

    ctx.lineWidth = 2;

    ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

    let cx = panelX + 10;

    for (const utype of types) {

      const cnt = deployPool[utype] || 0;

      const isSelected = utype === selectedDeployType;

      const ballType = BALL_FOR_UNIT[utype];

      const col = ballType && TYPE_COLOR[ballType] ? TYPE_COLOR[ballType] : { top:[160,160,160], front:[120,120,120], left:[80,80,80] };

      // Kortelės fonas — su unit ball spalvos atspalviu

      ctx.fillStyle = isSelected ? '#3a5a2e' : '#1a0e08';

      ctx.fillRect(cx, panelY + 7, cardW, cardH);

      ctx.strokeStyle = isSelected ? '#7aff8a' : '#5a3a20';

      ctx.lineWidth = isSelected ? 2 : 1;

      ctx.strokeRect(cx + 0.5, panelY + 7.5, cardW - 1, cardH - 1);

      // Ball spalvos sferinis simbolis (centre kortos viršuj)

      if (ballType) {

        drawSphere(ctx, cx + cardW / 2, panelY + 7 + 22, 14, 0, 0, ballType, 2, 0);

      }

      // Unit pavadinimas (centre po sfera)

      ctx.fillStyle = '#ffe7a8';

      ctx.font = '6px "Press Start 2P", monospace';

      ctx.textAlign = 'center';

      const dispName = utype === 'harpoon_fish' ? 'HARPOON' : utype === 'crossbow_tower' ? 'XBOW' : utype.toUpperCase();

      ctx.fillText(dispName.substr(0, 8), cx + cardW / 2, panelY + 7 + 44);

      // Count

      ctx.fillStyle = '#fff';

      ctx.font = 'bold 13px "Press Start 2P", monospace';

      ctx.fillText('×' + cnt, cx + cardW / 2, panelY + 7 + 64);

      // CD indikatorius — DIDELIS vertikalus fill ant visos kortos

      const cdRem = _f12UnitDeployCD[utype]

        ? Math.max(0, _UNIT_DEPLOY_CD_MS - (t - _f12UnitDeployCD[utype])) : 0;

      if (cdRem > 0) {

        const cdK = cdRem / _UNIT_DEPLOY_CD_MS;     // 1 → 0

        // Tamsus overlay — galimybės nematomas

        ctx.fillStyle = 'rgba(0,0,0,0.78)';

        ctx.fillRect(cx, panelY + 7, cardW, cardH);

        // Vertikalus „kraunamas" stulpelis iš apačios — pildosi kai CD baigiasi

        const fillH = Math.round(cardH * cdK);

        ctx.fillStyle = 'rgba(80,140,200,0.40)';        // mėlyna „mana kraunasi"

        ctx.fillRect(cx, panelY + 7 + (cardH - fillH), cardW, fillH);

        // Stiklo blizgesys ties wavefront (chunky line)

        if (fillH > 2 && fillH < cardH) {

          ctx.fillStyle = 'rgba(180,220,255,0.85)';

          ctx.fillRect(cx, panelY + 7 + (cardH - fillH), cardW, 2);

        }

        // Likęs laikas — DIDELIS tekstas centre

        ctx.fillStyle = '#000';

        ctx.font = 'bold 18px "Press Start 2P", monospace';

        ctx.textAlign = 'center';

        ctx.fillText(Math.ceil(cdRem / 1000) + 's', cx + cardW / 2 + 1, panelY + 7 + cardH / 2 + 5);

        ctx.fillStyle = '#ffe7a8';

        ctx.fillText(Math.ceil(cdRem / 1000) + 's', cx + cardW / 2, panelY + 7 + cardH / 2 + 4);

      }

      ctx.textAlign = 'left';

      deployBtnRects.push({ x: cx, y: panelY + 7, w: cardW, h: cardH, utype, cnt });

      cx += cardW + 8;

    }

  }

  function drawHud(L, t) {

    // ── BASE HP — vertikalus castle banner kairėj, pagerintas UI ──

    const PX = 2;

    const hpW = 32;                          // truputį platesnis (buvo 26)

    const hpH = L.lanesH;

    const hpX = 10;

    const hpY = L.lanesY;

    hpBarRect = { x: hpX, y: hpY, w: hpW, h: hpH };

    const hpFrac = Math.max(0, baseHp / BASE_HP);

    const danger = hpFrac < 0.20;            // danger žemiau 20%

    const critical = hpFrac < 0.08;

    // ── DROP SHADOW (depth) ──

    ctx.fillStyle = 'rgba(0,0,0,0.50)';

    ctx.fillRect(hpX + 2, hpY + 2, hpW, hpH);

    // ── OUTER BLACK FRAME ──

    ctx.fillStyle = '#000';

    ctx.fillRect(hpX, hpY, hpW, hpH);

    // Pixel art rounded corners

    ctx.clearRect(hpX, hpY, PX, PX);

    ctx.clearRect(hpX + hpW - PX, hpY, PX, PX);

    ctx.clearRect(hpX, hpY + hpH - PX, PX, PX);

    ctx.clearRect(hpX + hpW - PX, hpY + hpH - PX, PX, PX);

    // ── WOOD FRAME (multi-tone gradient) ──

    ctx.fillStyle = '#3a2410';

    ctx.fillRect(hpX + PX, hpY + PX, hpW - PX*2, hpH - PX*2);

    ctx.fillStyle = '#5a3820';

    ctx.fillRect(hpX + PX*2, hpY + PX*2, hpW - PX*4, hpH - PX*4);

    // Top brass highlight stripe (gold trim)

    ctx.fillStyle = '#d4a050';

    ctx.fillRect(hpX + PX, hpY + PX, hpW - PX*2, 1);

    ctx.fillStyle = '#7a5a3a';

    ctx.fillRect(hpX + PX, hpY + PX + 1, hpW - PX*2, 1);

    // Left/right edge highlights + shadows

    ctx.fillStyle = 'rgba(255,200,140,0.10)';

    ctx.fillRect(hpX + PX*2, hpY + PX*2, PX, hpH - PX*4);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';

    ctx.fillRect(hpX + hpW - PX*3, hpY + PX*2, PX, hpH - PX*4);

    // ── BRASS CORNER RIVETS (4 corners + 2 middle sides) ──

    ctx.fillStyle = '#a87830';

    ctx.fillRect(hpX + PX*2, hpY + PX*2, PX, PX);

    ctx.fillRect(hpX + hpW - PX*3, hpY + PX*2, PX, PX);

    ctx.fillRect(hpX + PX*2, hpY + hpH - PX*3, PX, PX);

    ctx.fillRect(hpX + hpW - PX*3, hpY + hpH - PX*3, PX, PX);

    ctx.fillStyle = '#ffe7a8';

    ctx.fillRect(hpX + PX*2, hpY + PX*2, 1, 1);

    ctx.fillRect(hpX + hpW - PX*3, hpY + PX*2, 1, 1);

    // ── CROWN ikona viršuj (su raudonu gem centre) ──

    const crown = [

      "1010101",

      "1111111",

      "1111111",

      "0111110",

    ];

    const crH = crown.length * PX;

    const crX = hpX + Math.round((hpW - crown[0].length * PX) / 2 / PX) * PX;

    const crY = hpY + PX*4;

    // Dark outline (4 sides)

    ctx.fillStyle = '#3a2410';

    for (let row = 0; row < crown.length; row++) {

      for (let cI = 0; cI < crown[row].length; cI++) {

        if (crown[row][cI] === '1') {

          const px = crX + cI * PX, py = crY + row * PX;

          ctx.fillRect(px - 1, py, PX + 2, PX);

          ctx.fillRect(px, py - 1, PX, PX + 2);

        }

      }

    }

    // Gold fill

    ctx.fillStyle = '#ffcf5c';

    for (let row = 0; row < crown.length; row++) {

      for (let cI = 0; cI < crown[row].length; cI++) {

        if (crown[row][cI] === '1') ctx.fillRect(crX + cI * PX, crY + row * PX, PX, PX);

      }

    }

    // Crown tips highlight

    ctx.fillStyle = '#fff5c0';

    ctx.fillRect(crX + PX, crY, PX, PX);

    ctx.fillRect(crX + PX*3, crY, PX, PX);

    ctx.fillRect(crX + PX*5, crY, PX, PX);

    // Red gem centre (crown jewel)

    ctx.fillStyle = '#cc2222';

    ctx.fillRect(crX + PX*3, crY + PX*2, PX, PX);

    ctx.fillStyle = '#ff6060';

    ctx.fillRect(crX + PX*3, crY + PX*2, 1, 1);

    // ── HP BAR SLOT — su inner border ──

    const barX = hpX + PX*3;

    const barY = crY + crH + PX*3;

    const barW = hpW - PX*6;

    const barH = hpH - (barY - hpY) - PX*12;   // vietos heart + skaičiui apačioj

    // Dark slot bg (inner shadow)

    ctx.fillStyle = '#0a0402';

    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

    ctx.fillStyle = '#1a0a04';

    ctx.fillRect(barX, barY, barW, barH);

    // ── BRICK SEGMENTS (castle wall style) — 3-tone shading per brick ──

    const segH = PX*2;

    const totalSegs = Math.floor(barH / segH);

    const filledSegs = Math.round(totalSegs * hpFrac);

    // Smooth color lerp (green → yellow → red)

    let cR, cG, cB;

    if (hpFrac > 0.5) {

      const k = (hpFrac - 0.5) * 2;

      cR = Math.round(255 * (1 - k) + 80 * k);

      cG = Math.round(200 * (1 - k) + 220 * k);

      cB = Math.round(60 * (1 - k) + 90 * k);

    } else {

      const k = hpFrac * 2;

      cR = 255;

      cG = Math.round(70 * (1 - k) + 200 * k);

      cB = Math.round(70 * (1 - k) + 60 * k);

    }

    const darkR = Math.max(0, cR - 60), darkG = Math.max(0, cG - 60), darkB = Math.max(0, cB - 60);

    const lightR = Math.min(255, cR + 50), lightG = Math.min(255, cG + 50), lightB = Math.min(255, cB + 50);

    for (let i = 0; i < filledSegs; i++) {

      const sy = barY + barH - (i + 1) * segH;

      // Base brick (dark bottom, base top)

      ctx.fillStyle = `rgb(${darkR},${darkG},${darkB})`;

      ctx.fillRect(barX, sy + 1, barW, segH - 1);

      ctx.fillStyle = `rgb(${cR},${cG},${cB})`;

      ctx.fillRect(barX, sy, barW, 1);

      // Top highlight pixel (bright)

      ctx.fillStyle = `rgb(${lightR},${lightG},${lightB})`;

      ctx.fillRect(barX, sy, barW - 1, 1);

      // Left edge highlight

      ctx.fillStyle = 'rgba(255,255,255,0.30)';

      ctx.fillRect(barX, sy, 1, segH - 1);

      // Right edge shadow

      ctx.fillStyle = 'rgba(0,0,0,0.40)';

      ctx.fillRect(barX + barW - 1, sy, 1, segH - 1);

      // Brick separator (skipped first/last for clean edge)

      if (i % 4 === 3 && i < filledSegs - 1) {

        ctx.fillStyle = 'rgba(0,0,0,0.45)';

        ctx.fillRect(barX, sy - 1, barW, 1);

      }

    }

    // ── HEART ikona po HP baro (su gradient + pulse) ──

    const heartPulse = danger ? (0.92 + 0.08 * Math.sin(t * 0.012)) : 1;

    const heart = [

      "0110011",

      "1111111",

      "1111111",

      "0111110",

      "0011100",

      "0001000",

    ];

    const heartW = heart[0].length * PX;

    const hi = hpX + Math.round((hpW - heartW) / 2 / PX) * PX;

    const hj = hpY + hpH - heart.length * PX - PX*2;

    // Dark outline (4 sides)

    ctx.fillStyle = '#3a0606';

    for (let row = 0; row < heart.length; row++) {

      for (let cI = 0; cI < heart[row].length; cI++) {

        if (heart[row][cI] === '1') {

          const px = hi + cI * PX, py = hj + row * PX;

          ctx.fillRect(px - 1, py, PX + 2, PX);

          ctx.fillRect(px, py - 1, PX, PX + 2);

        }

      }

    }

    // Red fill — su pulse

    const hr = danger ? Math.round(255 * heartPulse) : 255;

    ctx.fillStyle = `rgb(${hr},80,90)`;

    for (let row = 0; row < heart.length; row++) {

      for (let cI = 0; cI < heart[row].length; cI++) {

        if (heart[row][cI] === '1') ctx.fillRect(hi + cI * PX, hj + row * PX, PX, PX);

      }

    }

    // Heart highlight (specular shine)

    ctx.fillStyle = 'rgba(255,255,255,0.65)';

    ctx.fillRect(hi + 2 * PX, hj + 1 * PX, PX, PX);

    ctx.fillRect(hi + 1 * PX, hj + 1 * PX, PX, 1);

    // ── Critical danger pulse ──

    if (critical) {

      const cp = 0.18 * (0.5 + 0.5 * Math.sin(t * 0.018));

      ctx.fillStyle = `rgba(255,40,40,${cp})`;

      ctx.fillRect(hpX, hpY, hpW, hpH);

    }

    // ── HP NUMBER — virš heart, su outline ──

    ctx.font = 'bold 10px "Press Start 2P", monospace';

    ctx.textAlign = 'center';

    ctx.textBaseline = 'middle';

    const numY = hj - PX*4;

    ctx.fillStyle = '#000';

    ctx.fillText(`${baseHp}`, hpX + hpW / 2 + 1, numY);

    ctx.fillText(`${baseHp}`, hpX + hpW / 2 - 1, numY);

    ctx.fillText(`${baseHp}`, hpX + hpW / 2, numY + 1);

    ctx.fillText(`${baseHp}`, hpX + hpW / 2, numY - 1);

    ctx.fillStyle = critical ? '#ff8888' : (danger ? '#ffd866' : '#fff8e0');

    ctx.fillText(`${baseHp}`, hpX + hpW / 2, numY);

    ctx.textBaseline = 'alphabetic';

    // Score (right side)

    ctx.textAlign = 'right';

    ctx.fillStyle = '#ffe7a8';

    ctx.font = '12px "Press Start 2P", monospace';

    ctx.fillText('SCORE ' + score, L.W - 16, 30);

    ctx.fillStyle = '#a8e7ff';

    ctx.font = '9px "Press Start 2P", monospace';

    ctx.fillText('MERGES ' + merges + '   BLOCKS ' + blocks.length, L.W - 16, 50);

    // ── RESTART + EXIT mygtukai NUIMTI (user). Lieka tik ×2. (ESC=exit, R=restart klavišos veikia.) ──

    exitBtnRect = null;

    restartBtnRect = null;

    // ── SPEED ×1/×2 mygtukas — DIDELIS, vienintelis. Pagreitina visą mūšį. ──

    const x2 = (_f12TimeScale >= 2);

    const sbw = 152, sbh = 50;

    const sbx = L.W - sbw - 18, sby = L.H - sbh - 28;

    ctx.fillStyle = x2 ? '#4a3a0a' : '#23201a';

    ctx.fillRect(sbx, sby, sbw, sbh);

    ctx.strokeStyle = x2 ? '#ffcf5c' : '#a89060';

    ctx.lineWidth = 3;

    ctx.strokeRect(sbx + 1.5, sby + 1.5, sbw - 3, sbh - 3);

    ctx.fillStyle = x2 ? '#ffe6a8' : '#d8cbb0';

    ctx.font = '18px "Press Start 2P", monospace';

    ctx.textAlign = 'center';

    ctx.textBaseline = 'middle';

    ctx.fillText(x2 ? '⏩ 2x' : '⏩ 1x', sbx + sbw / 2, sby + sbh / 2);

    ctx.textBaseline = 'alphabetic';

    speedBtnRect = { x: sbx, y: sby, w: sbw, h: sbh };

    // ── EDIT MAP mygtukas — TIK lokalei (production'e paslepta) ──

    if (_isLocalhost) {

      const ebw = 92, ebh = 26;

      const ebx = sbx - ebw - 12, eby = sby + (sbh - ebh) / 2;

      ctx.fillStyle = _f12EditMode ? '#0a4a36' : '#0a3022';

      ctx.fillRect(ebx, eby, ebw, ebh);

      ctx.strokeStyle = _f12EditMode ? '#00ffb4' : '#0a8a66';

      ctx.lineWidth = 2;

      ctx.strokeRect(ebx + 0.5, eby + 0.5, ebw - 1, ebh - 1);

      ctx.fillStyle = _f12EditMode ? '#00ffb4' : '#7adcc0';

      ctx.font = '9px "Press Start 2P", monospace';

      ctx.textAlign = 'center';

      ctx.textBaseline = 'middle';

      ctx.fillText(_f12EditMode ? 'EDIT: ON' : 'EDIT MAP', ebx + ebw / 2, eby + ebh / 2);

      ctx.textBaseline = 'alphabetic';

      editMapBtnRect = { x: ebx, y: eby, w: ebw, h: ebh };

    } else {

      editMapBtnRect = null;   // disable click handler on production

    }

  }

  function drawGameOver(L) {

    ctx.fillStyle = 'rgba(0,0,0,0.7)';

    ctx.fillRect(0, 0, L.W, L.H);

    ctx.fillStyle = '#ff6644';

    ctx.font = '24px "Press Start 2P", monospace';

    ctx.textAlign = 'center';

    ctx.fillText('GAME OVER', L.W / 2, L.H / 2 - 30);

    ctx.fillStyle = '#ffe7a8';

    ctx.font = '12px "Press Start 2P", monospace';

    ctx.fillText('SCORE  ' + score, L.W / 2, L.H / 2 + 4);

    ctx.fillText('MERGES ' + merges, L.W / 2, L.H / 2 + 26);

    // ── „GO HOME" mygtukas (grįžimas į village) ──

    const bw = 220, bh = 42;

    const bx = Math.round(L.W / 2 - bw / 2);

    const by = Math.round(L.H / 2 + 56);

    // Drop shadow

    ctx.fillStyle = 'rgba(0,0,0,0.6)';

    ctx.fillRect(bx + 3, by + 3, bw, bh);

    // Body — wood with brass accents

    ctx.fillStyle = '#3a2410';

    ctx.fillRect(bx, by, bw, bh);

    // Top brass highlight

    ctx.fillStyle = '#d4a050';

    ctx.fillRect(bx, by, bw, 2);

    ctx.fillStyle = '#7a5a3a';

    ctx.fillRect(bx, by + 2, bw, 1);

    // Bottom shadow

    ctx.fillStyle = '#1a0e06';

    ctx.fillRect(bx, by + bh - 2, bw, 2);

    // Side borders

    ctx.fillStyle = '#5a3a1a';

    ctx.fillRect(bx, by, 2, bh);

    ctx.fillRect(bx + bw - 2, by, 2, bh);

    // Corner rivets

    ctx.fillStyle = '#a87830';

    ctx.fillRect(bx + 4, by + 4, 3, 3);

    ctx.fillRect(bx + bw - 7, by + 4, 3, 3);

    ctx.fillRect(bx + 4, by + bh - 7, 3, 3);

    ctx.fillRect(bx + bw - 7, by + bh - 7, 3, 3);

    ctx.fillStyle = '#ffe7a8';

    ctx.fillRect(bx + 4, by + 4, 1, 1);

    ctx.fillRect(bx + bw - 7, by + 4, 1, 1);

    // Label

    ctx.fillStyle = '#ffe7a8';

    ctx.font = 'bold 13px "Press Start 2P", monospace';

    ctx.textAlign = 'center';

    ctx.textBaseline = 'middle';

    ctx.fillText('GO HOME', bx + bw / 2, by + bh / 2 + 1);

    ctx.textBaseline = 'alphabetic';

    gameOverHomeBtnRect = { x: bx, y: by, w: bw, h: bh };

    // Hint underneath

    ctx.fillStyle = '#8a7868';

    ctx.font = '8px "Press Start 2P", monospace';

    ctx.fillText('R = RESTART · ESC = EXIT', L.W / 2, by + bh + 18);

  }

  // ── Input ──────────────────────────────────────────────────────────

  // ════════════════════════════════════════════════════════════════

  // ── F12 EDIT MAP — pilnas editorius (tabs / multi-tile picker / undo) ──

  // ════════════════════════════════════════════════════════════════

  // Dekoracijos: {zone:'arena'|'lanes', nx, ny, kind, scale}

  //   nx,ny = normalizuotos 0..1 koordinatės zonoje

  //   kind  = 'img:PATH'  arba  'tile:PATH:sx:sy:sw:sh'

  let _f12EditMode = false;

  let _f12EditBrush = null;

  let _f12EditScale = 1.0;

  let _f12EditorPanel = null;

  let _f12EditTab = 'TERRAIN';

  let _f12EditNote = null;

  let _f12EditUndo = [];               // undo stack — _f12Decorations snapshot'ai

  const _f12DecoImgs = {};

  const _F12_EDIT_GRID = 28;           // grid celių per zonos plotį

  // ── Asset katalogas ──

  const _F12_TAB_TERRAIN = [

    { path: 'assets_tiny/Terrain/Ground/Tilemap_Flat.png', tile: 64 },

    { path: 'assets_tiny/Terrain/Ground/Tilemap_Elevation.png', tile: 64 },

    { path: 'assets_tiny/Terrain/Tileset/Tilemap_color1.png', tile: 64 },

    { path: 'assets_tiny/Terrain/Tileset/Tilemap_color3.png', tile: 64 },

    { path: 'assets_tiny/Terrain/Tileset/Tilemap_color5.png', tile: 64 },

    { path: 'assets_tiny/Terrain/Water/Water.png', tile: 64 },

    { path: 'assets_tiny/Terrain/Bridge/Bridge_All.png', tile: 64 },

  ];

  const _F12_TAB_DECO = (() => {

    const a = [];

    for (let i = 1; i <= 18; i++) a.push('assets_tiny/Deco/' + String(i).padStart(2, '0') + '.png');

    a.push('assets_tiny/Deco/rubber_duck.png');

    for (let i = 1; i <= 4; i++) a.push('assets_tiny/trees/Stump' + i + '.png');  // stump = statinis (1 frame)

    for (let i = 1; i <= 6; i++) a.push('assets_tiny/GoldStone' + i + '.png');

    return a;

  })();

  // ANIM — animuotos dekoracijos (8-frame sprite sheet'ai). Formatas: anim:PATH:fw:fh:fc:fps

  const _F12_TAB_ANIM = [

    // Krūmai (Bushe1-4 — 1024×128 = 8×128px)

    'anim:assets_tiny/Terrain/Bushe1.png:128:128:8:6',

    'anim:assets_tiny/Terrain/Bushe2.png:128:128:8:6',

    'anim:assets_tiny/Terrain/Bushe3.png:128:128:8:6',

    'anim:assets_tiny/Terrain/Bushe4.png:128:128:8:6',

    // Medžiai (Tree1-2 — 1536×256 = 8×192×256; Tree3-4 — 1536×192 = 8×192×192)

    'anim:assets_tiny/trees/Tree1.png:192:256:8:6',

    'anim:assets_tiny/trees/Tree2.png:192:256:8:6',

    'anim:assets_tiny/trees/Tree3.png:192:192:8:6',

    'anim:assets_tiny/trees/Tree4.png:192:192:8:6',

    // Akmenys vandenyje (Rocks_01-04 — 1024×128 = 8×128px)

    'anim:assets_tiny/Terrain/Water/Rocks/Rocks_01.png:128:128:8:6',

    'anim:assets_tiny/Terrain/Water/Rocks/Rocks_02.png:128:128:8:6',

    'anim:assets_tiny/Terrain/Water/Rocks/Rocks_03.png:128:128:8:6',

    'anim:assets_tiny/Terrain/Water/Rocks/Rocks_04.png:128:128:8:6',

    // Vandens putos / animuotas vanduo (Foam — 1536×192 = 8×192px)

    'anim:assets_tiny/Terrain/Water/Foam/Foam.png:192:192:8:6',

  ];

  const _F12_TAB_BUILD = [

    'assets_tiny/Buildings_Archery.png', 'assets_tiny/Buildings_Barracks.png',

    'assets_tiny/Buildings_Castle.png', 'assets_tiny/Buildings_House1.png',

    'assets_tiny/Buildings_House2.png', 'assets_tiny/Buildings_House3.png',

    'assets_tiny/Buildings_Monastery.png', 'assets_tiny/Buildings_Tower.png',

    'assets_tiny/Buildings_Zip.png', 'assets_tiny/Goblin_House.png',

    'assets_tiny/House_Construction.png', 'assets_tiny/Tower_Destroyed.png',

    'assets_tiny/Resources/Gold Mine/GoldMine_Inactive.png',

    'assets_tiny/Resources/Gold Mine/GoldMine_Active.png',

  ];

  const _F12_TAB_PROPS = [

    'assets_tiny/Resources/Sheep/HappySheep_Idle.png',

    'assets_tiny/Resources/Resources/G_Idle.png',

    'assets_tiny/Resources/Resources/M_Idle.png',

    'assets_tiny/Resources/Resources/W_Idle.png',

    'assets_tiny/UI_Banners/Banner.png',

    'assets_tiny/UI_Banners/Ribbon_Black.png', 'assets_tiny/UI_Banners/Ribbon_Blue.png',

    'assets_tiny/UI_Banners/Ribbon_Purple.png', 'assets_tiny/UI_Banners/Ribbon_Red.png',

    'assets_tiny/UI_Banners/Ribbon_Yellow.png',

  ];

  function _f12GetImg(path) {

    if (!_f12DecoImgs[path]) { const im = new Image(); im.src = path; _f12DecoImgs[path] = im; }

    return _f12DecoImgs[path];

  }

  function _f12ZoneRect(L, zone) {

    if (zone === 'lanes') return { x: L.lanesX, y: L.lanesY, w: L.lanesW, h: L.lanesH };

    return { x: L.arena.x, y: L.arena.y, w: L.arena.w, h: L.arena.h };

  }

  function _f12PointZone(L, px, py) {

    const a = _f12ZoneRect(L, 'arena');

    if (px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h) return 'arena';

    const ln = _f12ZoneRect(L, 'lanes');

    if (px >= ln.x && px <= ln.x + ln.w && py >= ln.y && py <= ln.y + ln.h) return 'lanes';

    return null;

  }

  function _f12DrawDeco(L, d) {

    const z = _f12ZoneRect(L, d.zone);

    const cx = z.x + d.nx * z.w, cy = z.y + d.ny * z.h;

    let img, sx = 0, sy = 0, sw, sh;

    let isTile = false, tilesW = 1, tilesH = 1;

    if (d.kind.startsWith('tile:')) {

      // tile:PATH:sx:sy:sw:sh:tilePx — terrain tile (gali būti multi-tile grupė)

      const p = d.kind.split(':');

      img = _f12GetImg(p[1]); sx = +p[2]; sy = +p[3]; sw = +p[4]; sh = +p[5];

      const tilePx = +p[6] || 64;

      tilesW = Math.max(1, Math.round(sw / tilePx));

      tilesH = Math.max(1, Math.round(sh / tilePx));

      isTile = true;

    } else if (d.kind.startsWith('anim:')) {

      // anim:PATH:fw:fh:fc:fps — animuotas sprite sheet'as (krūmai, medžiai, vanduo)

      const p = d.kind.split(':');

      img = _f12GetImg(p[1]);

      const fw = +p[2], fh = +p[3], fc = +p[4], fps = +p[5];

      if (!img.complete || !img.naturalWidth) return;

      const frame = Math.floor(performance.now() / (1000 / fps)) % fc;

      sx = frame * fw; sy = 0; sw = fw; sh = fh;

    } else {

      img = _f12GetImg(d.kind.slice(4));

      if (!img.complete || !img.naturalWidth) return;

      sw = img.naturalWidth; sh = img.naturalHeight;

    }

    if (!img || !img.complete || !img.naturalWidth) return;

    ctx.imageSmoothingEnabled = false;

    if (isTile) {

      // Terrain tile — dydis pagal tile'ų kiekį × grid celės dydį (multi-tile = platesnis)

      const cellW = z.w / _F12_EDIT_GRID;

      const dw = tilesW * cellW * (d.scale || 1);

      const dh = tilesH * cellW * (d.scale || 1);

      // Terrain — center anchor (gulasi ant grindų)

      ctx.drawImage(img, sx, sy, sw, sh, Math.round(cx - dw / 2), Math.round(cy - dh / 2), dw, dh);

    } else {

      // Sprite (img/anim) — height-based, bottom anchor (stovi ant grindų)

      const baseH = (d.zone === 'lanes' ? L.laneH : L.laneH * 0.9) * (d.scale || 1);

      const dh = baseH, dw = dh * (sw / sh);

      ctx.drawImage(img, sx, sy, sw, sh, Math.round(cx - dw / 2), Math.round(cy - dh), dw, dh);

    }

  }

  function _drawDecorations(L, t) {

    if (_f12Decorations.length) {

      const sorted = _f12Decorations.slice().sort((a, b) => {

        const az = a.zone === 'lanes' ? 0 : 1, bz = b.zone === 'lanes' ? 0 : 1;

        return az !== bz ? az - bz : a.ny - b.ny;

      });

      for (const d of sorted) _f12DrawDeco(L, d);

    }

    if (_f12EditNote && now() - _f12EditNote.born < 2200) {

      const age = now() - _f12EditNote.born;

      const a = age > 1800 ? 1 - (age - 1800) / 400 : 1;

      ctx.save();

      ctx.font = '10px "Press Start 2P", monospace';

      ctx.textAlign = 'center';

      const tw = ctx.measureText(_f12EditNote.msg).width;

      ctx.fillStyle = 'rgba(10,30,22,' + (a * 0.9) + ')';

      ctx.fillRect(L.W / 2 - tw / 2 - 10, 8, tw + 20, 22);

      ctx.strokeStyle = 'rgba(0,255,180,' + a + ')';

      ctx.strokeRect(L.W / 2 - tw / 2 - 10, 8, tw + 20, 22);

      ctx.fillStyle = 'rgba(0,255,180,' + a + ')';

      ctx.fillText(_f12EditNote.msg, L.W / 2, 23);

      ctx.restore();

    }

    if (!_f12EditMode) return;

    for (const zone of ['lanes', 'arena']) {

      const z = _f12ZoneRect(L, zone);

      const cell = z.w / _F12_EDIT_GRID;

      const rows = Math.max(1, Math.round(z.h / cell));

      ctx.save();

      ctx.strokeStyle = 'rgba(0,255,180,0.18)';

      ctx.lineWidth = 1;

      ctx.beginPath();

      for (let c = 0; c <= _F12_EDIT_GRID; c++) {

        const gx = Math.round(z.x + c * cell) + 0.5;

        ctx.moveTo(gx, z.y); ctx.lineTo(gx, z.y + z.h);

      }

      for (let r = 0; r <= rows; r++) {

        const gy = Math.round(z.y + r * (z.h / rows)) + 0.5;

        ctx.moveTo(z.x, gy); ctx.lineTo(z.x + z.w, gy);

      }

      ctx.stroke();

      ctx.fillStyle = 'rgba(0,255,180,0.5)';

      ctx.font = '9px "Press Start 2P", monospace';

      ctx.textAlign = 'left';

      ctx.fillText(zone.toUpperCase(), z.x + 4, z.y + 12);

      ctx.restore();

    }

    const hz = _f12PointZone(L, mouse.x, mouse.y);

    if (hz) {

      const z = _f12ZoneRect(L, hz);

      const cell = z.w / _F12_EDIT_GRID;

      const rows = Math.max(1, Math.round(z.h / cell));

      const gcx = Math.floor((mouse.x - z.x) / cell);

      const gcy = Math.floor((mouse.y - z.y) / (z.h / rows));

      const hx = z.x + gcx * cell, hy = z.y + gcy * (z.h / rows);

      ctx.save();

      ctx.fillStyle = _f12EditBrush === 'erase' ? 'rgba(255,60,60,0.25)' : 'rgba(0,255,180,0.22)';

      ctx.fillRect(hx, hy, cell, z.h / rows);

      if (_f12EditBrush && _f12EditBrush !== 'erase') {

        ctx.globalAlpha = 0.55;

        _f12DrawDeco(L, {

          zone: hz, nx: (gcx + 0.5) * cell / z.w,

          ny: (gcy + 1) * (z.h / rows) / z.h, kind: _f12EditBrush, scale: _f12EditScale,

        });

      }

      ctx.restore();

    }

  }

  function _f12PushUndo() {

    _f12EditUndo.push(_f12Decorations.map(d => ({ ...d })));

    if (_f12EditUndo.length > 40) _f12EditUndo.shift();

  }

  function _f12Undo() {

    if (!_f12EditUndo.length) { _f12EditNote = { msg: 'Nieko atsaukti', born: now() }; return; }

    _f12Decorations = _f12EditUndo.pop();

    _f12EditNote = { msg: 'Atsaukta (' + _f12Decorations.length + ' dekoraciju)', born: now() };

  }

  function _f12EditClick(px, py) {

    const L = layoutCache; if (!L) return;

    const zone = _f12PointZone(L, px, py);

    if (!zone || !_f12EditBrush) return;

    const z = _f12ZoneRect(L, zone);

    const cell = z.w / _F12_EDIT_GRID;

    const rows = Math.max(1, Math.round(z.h / cell));

    const gcx = Math.floor((px - z.x) / cell);

    const gcy = Math.floor((py - z.y) / (z.h / rows));

    const nx = (gcx + 0.5) * cell / z.w;

    const ny = (gcy + 1) * (z.h / rows) / z.h;

    if (_f12EditBrush === 'erase') {

      let bi = -1, bd = 0.05;

      for (let i = 0; i < _f12Decorations.length; i++) {

        const d = _f12Decorations[i];

        if (d.zone !== zone) continue;

        const dd = Math.hypot(d.nx - nx, d.ny - ny);

        if (dd < bd) { bd = dd; bi = i; }

      }

      if (bi >= 0) { _f12PushUndo(); _f12Decorations.splice(bi, 1); }

      return;

    }

    _f12PushUndo();

    _f12Decorations.push({ zone, nx, ny, kind: _f12EditBrush, scale: _f12EditScale });

  }

  function _f12ExportDecorations() {

    const compact = _f12Decorations.map(d => ({

      zone: d.zone, nx: +d.nx.toFixed(4), ny: +d.ny.toFixed(4),

      kind: d.kind, scale: +(d.scale || 1).toFixed(2),

    }));

    const txt = 'const _F12_DEFAULT_DECORATIONS = ' + JSON.stringify(compact) + ';';

    try { navigator.clipboard.writeText(txt); } catch (_) { console.log(txt); }

    try {

      const a = document.createElement('a');

      a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(txt);

      a.download = 'f12_decorations.txt';

      document.body.appendChild(a); a.click(); a.remove();

    } catch (_) {}

    _f12EditNote = { msg: 'Eksportuota ' + compact.length + ' dekoraciju', born: now() };

  }

  function _f12SetTab(tab) {

    _f12EditTab = tab;

    if (!_f12EditorPanel) return;

    for (const tn of ['TERRAIN', 'ANIM', 'DECO', 'BUILD', 'PROPS']) {

      const tb = _f12EditorPanel.querySelector('#f12-tab-' + tn);

      const pn = _f12EditorPanel.querySelector('#f12-panel-' + tn);

      if (tb) { tb.style.background = tn === tab ? '#00ffb4' : '#1a2a22'; tb.style.color = tn === tab ? '#06120c' : '#7adcc0'; }

      if (pn) pn.style.display = tn === tab ? 'block' : 'none';

    }

  }

  function _f12BuildEditorPanel() {

    if (_f12EditorPanel) return;

    const p = document.createElement('div');

    p.id = 'f12-editor-panel';

    p.style.cssText = 'position:fixed; right:8px; top:8px; width:248px; max-height:94vh;' +

      'overflow-y:auto; background:rgba(16,14,9,0.97); border:2px solid #00ffb4;' +

      'border-radius:6px; padding:8px; z-index:10000; display:none;' +

      "font-family:'Press Start 2P',monospace; color:#cde;";

    let html = '<div style="font-size:10px; color:#00ffb4; margin-bottom:4px;">F12 EDIT MAP</div>';

    html += '<div style="font-size:7px; color:#888; margin-bottom:6px; line-height:1.6;">' +

      'Klik ARENA/LANES deti. [ ] mastelis. Ctrl+Z atsaukti. E isjungti.</div>';

    html += '<div style="display:flex; gap:3px; margin-bottom:6px;">';

    for (const tn of ['TERRAIN', 'ANIM', 'DECO', 'BUILD', 'PROPS']) {

      html += '<button id="f12-tab-' + tn + '" data-tab="' + tn + '" class="f12-tab-btn" ' +

        'style="flex:1; background:#1a2a22; color:#7adcc0; border:1px solid #0a8a66; ' +

        'font-size:7px; padding:6px 1px; cursor:pointer;">' + tn + '</button>';

    }

    html += '</div>';

    html += '<div id="f12-panel-TERRAIN" class="f12-tab-panel">' +

      '<div style="font-size:7px; color:#888; margin-bottom:4px;">Klik+drag tile pasirinkti</div>';

    for (const ts of _F12_TAB_TERRAIN) {

      html += '<div class="f12-terr-wrap" data-path="' + ts.path + '" data-tile="' + ts.tile + '" ' +

        'style="position:relative; margin-bottom:4px; cursor:crosshair; line-height:0;">' +

        '<img src="' + ts.path + '" class="f12-terr-img" draggable="false" ' +

        'style="width:100%; image-rendering:pixelated; background:rgba(0,0,0,0.35); display:block;"/>' +

        '<div class="f12-terr-hl" style="position:absolute; border:2px solid #00ffb4; ' +

        'background:rgba(0,255,180,0.25); pointer-events:none; display:none;"></div></div>';

    }

    html += '</div>';

    const thumbGrid = (id, list, disp) => {

      let h = '<div id="f12-panel-' + id + '" class="f12-tab-panel" style="display:' + disp + ';">' +

        '<div style="display:flex; flex-wrap:wrap; gap:3px;">';

      for (const item of list) {

        if (item.startsWith('anim:')) {

          // Animuotas — thumbnail rodo frame 0 (background-size = fc×100%)

          const ap = item.split(':');

          const fc = +ap[4];

          h += '<div data-kind="' + item + '" class="f12-deco-btn" ' +

            'style="width:36px; height:36px; cursor:pointer; image-rendering:pixelated; ' +

            'background-image:url(\'' + ap[1] + '\'); background-size:' + (fc * 100) + '% 100%; ' +

            'background-position:0 0; background-repeat:no-repeat; ' +

            'background-color:rgba(255,255,255,0.07); border:2px solid transparent;"></div>';

        } else {

          // Statinis img:PATH

          h += '<img src="' + item + '" data-kind="img:' + item + '" class="f12-deco-btn" draggable="false" ' +

            'style="width:36px; height:36px; object-fit:contain; background:rgba(255,255,255,0.07); ' +

            'padding:2px; cursor:pointer; image-rendering:pixelated; border:2px solid transparent;"/>';

        }

      }

      h += '</div></div>';

      return h;

    };

    html += thumbGrid('ANIM', _F12_TAB_ANIM, 'none');

    html += thumbGrid('DECO', _F12_TAB_DECO, 'none');

    html += thumbGrid('BUILD', _F12_TAB_BUILD, 'none');

    html += thumbGrid('PROPS', _F12_TAB_PROPS, 'none');

    html += '<div id="f12-edit-tools" style="margin-top:8px; border-top:1px solid #0a8a66; padding-top:6px;">' +

      '<div style="display:flex; gap:4px;">' +

      '<button id="f12-undo-btn" style="flex:1; background:#1a1408; color:#ffcf5c; border:1px solid #886611; ' +

      'font-size:7px; padding:6px 0; cursor:pointer;">UNDO</button>' +

      '<button id="f12-erase-btn" style="flex:1; background:#551111; color:#ff8888; border:1px solid #aa3333; ' +

      'font-size:7px; padding:6px 0; cursor:pointer;">ERASE</button>' +

      '<button id="f12-clear-btn" style="flex:1; background:#3a2a10; color:#ffcf5c; border:1px solid #886611; ' +

      'font-size:7px; padding:6px 0; cursor:pointer;">CLEAR</button></div>' +

      '<div style="font-size:7px; color:#7adcc0; margin:5px 0 3px;">Mastelis: ' +

      '<span id="f12-scale-val">1.00</span> ([ ])</div>' +

      '<button id="f12-export-btn" style="width:100%; margin-top:2px; background:#0a3a22; color:#00ffb4; ' +

      'border:1px solid #00aa77; font-size:8px; padding:8px 0; cursor:pointer;">EXPORT to CLIPBOARD + TXT</button></div>';

    p.innerHTML = html;

    document.body.appendChild(p);

    _f12EditorPanel = p;

    const clearSel = () => p.querySelectorAll('.f12-deco-btn').forEach(b => b.style.borderColor = 'transparent');

    p.querySelectorAll('.f12-tab-btn').forEach(tb => tb.addEventListener('click', () => _f12SetTab(tb.dataset.tab)));

    p.querySelectorAll('.f12-deco-btn').forEach(btn => btn.addEventListener('click', () => {

      clearSel(); btn.style.borderColor = '#00ffb4'; _f12EditBrush = btn.dataset.kind;

      _f12EditNote = { msg: 'Teptukas: ' + btn.dataset.kind.split('/').pop(), born: now() };

    }));

    p.querySelectorAll('.f12-terr-wrap').forEach(wrap => {

      const img = wrap.querySelector('.f12-terr-img');

      const hl = wrap.querySelector('.f12-terr-hl');

      const tile = +wrap.dataset.tile;

      let dragging = false, startTx = 0, startTy = 0;

      const tileAt = (ev) => {

        const r = img.getBoundingClientRect();

        const cols = Math.max(1, Math.round((img.naturalWidth || tile) / tile));

        const rows = Math.max(1, Math.round((img.naturalHeight || tile) / tile));

        const tx = Math.floor((ev.clientX - r.left) / r.width * cols);

        const ty = Math.floor((ev.clientY - r.top) / r.height * rows);

        return { tx: Math.max(0, Math.min(cols - 1, tx)), ty: Math.max(0, Math.min(rows - 1, ty)), cols, rows };

      };

      const showHl = (minTx, minTy, w, h) => {

        const r = img.getBoundingClientRect();

        const cols = Math.max(1, Math.round((img.naturalWidth || tile) / tile));

        const rows = Math.max(1, Math.round((img.naturalHeight || tile) / tile));

        const cw = r.width / cols, ch = r.height / rows;

        hl.style.display = 'block';

        hl.style.left = (minTx * cw) + 'px'; hl.style.top = (minTy * ch) + 'px';

        hl.style.width = Math.max(2, w * cw - 4) + 'px'; hl.style.height = Math.max(2, h * ch - 4) + 'px';

      };

      wrap.addEventListener('mousedown', (ev) => {

        const a = tileAt(ev); dragging = true; startTx = a.tx; startTy = a.ty;

        showHl(a.tx, a.ty, 1, 1); ev.preventDefault();

      });

      wrap.addEventListener('mousemove', (ev) => {

        if (!dragging) return;

        const a = tileAt(ev);

        showHl(Math.min(startTx, a.tx), Math.min(startTy, a.ty),

          Math.abs(a.tx - startTx) + 1, Math.abs(a.ty - startTy) + 1);

      });

      const finish = (ev) => {

        if (!dragging) return; dragging = false;

        const a = tileAt(ev);

        const minTx = Math.min(startTx, a.tx), minTy = Math.min(startTy, a.ty);

        const w = Math.abs(a.tx - startTx) + 1, h = Math.abs(a.ty - startTy) + 1;

        _f12EditBrush = 'tile:' + wrap.dataset.path + ':' + (minTx * tile) + ':' + (minTy * tile) +

          ':' + (w * tile) + ':' + (h * tile) + ':' + tile;

        _f12EditNote = { msg: 'Tile ' + w + 'x' + h + ' pasirinkta', born: now() };

      };

      wrap.addEventListener('mouseup', finish);

      wrap.addEventListener('mouseleave', () => { if (dragging) dragging = false; });

    });

    p.querySelector('#f12-undo-btn').addEventListener('click', _f12Undo);

    p.querySelector('#f12-erase-btn').addEventListener('click', () => {

      clearSel(); _f12EditBrush = 'erase';

      _f12EditNote = { msg: 'ERASE rezimas', born: now() };

    });

    p.querySelector('#f12-clear-btn').addEventListener('click', () => {

      if (confirm('Isvalyti VISAS dekoracijas?')) { _f12PushUndo(); _f12Decorations = []; }

    });

    p.querySelector('#f12-export-btn').addEventListener('click', _f12ExportDecorations);

    _f12SetTab('TERRAIN');

  }

  function _f12UpdateScaleLabel() {

    if (_f12EditorPanel) {

      const el = _f12EditorPanel.querySelector('#f12-scale-val');

      if (el) el.textContent = _f12EditScale.toFixed(2);

    }

  }

  function _f12ToggleEditMode() {

    _f12EditMode = !_f12EditMode;

    if (_f12EditMode) { _f12BuildEditorPanel(); _f12UpdateScaleLabel(); }

    if (_f12EditorPanel) _f12EditorPanel.style.display = _f12EditMode ? 'block' : 'none';

    _f12EditNote = { msg: _f12EditMode ? 'EDIT MODE ON' : 'EDIT MODE OFF', born: now() };

  }

  function onKey(e) {

    if (!active) return;

    const k = e.key;

    if (k === 'Escape') {

      try { S.floor = 11; } catch (_) {}

      e.preventDefault(); return;

    }

    if (k === 'e' || k === 'E') { _f12ToggleEditMode(); e.preventDefault(); return; }

    // Edit mode — Ctrl+Z undo

    if (_f12EditMode && (e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) {

      _f12Undo(); e.preventDefault(); return;

    }

    // Edit mode — mastelio reguliavimas

    if (_f12EditMode && (k === '[' || k === ']')) {

      _f12EditScale = Math.max(0.3, Math.min(3, _f12EditScale + (k === ']' ? 0.15 : -0.15)));

      _f12UpdateScaleLabel();

      _f12EditNote = { msg: `Mastelis: ${_f12EditScale.toFixed(2)}`, born: now() };

      e.preventDefault(); return;

    }

    // Edit mode — R neturi restart'inti (kad netrukdytų), tik ne-edit

    if ((k === 'r' || k === 'R') && _f12EditMode) { e.preventDefault(); return; }

    if (k === 'r' || k === 'R') { _f12RestartGame(); e.preventDefault(); return; }

    if (k === ' ' && !e.repeat) {

      // Spacebar pirma keydown — pradeda charge

      if (!charging) { charging = true; chargeStartedAt = now(); }

      e.preventDefault();

    }

  }

  function onKeyUp(e) {

    if (!active) return;

    if (e.key === ' ' && charging) {

      const power = getChargeLevel();

      charging = false;

      fire(power);

      e.preventDefault();

    }

  }

  function clientToCanvas(clientX, clientY) {

    // Force-landscape (CSS rotate) — naudojam loginę erdvę vietoj getBoundingClientRect

    // (kuris pasuktam elementui grąžina axis-aligned bbox → koordinatės būtų klaidingos).

    if (window.__forceLandscape && window.__forceLandscape()) {

      const L = window.__clientToLogical(clientX, clientY);

      return {

        x: L.x * (canvas.width / window.__logicalW()),

        y: L.y * (canvas.height / window.__logicalH()),

      };

    }

    const r = canvas.getBoundingClientRect();

    return {

      x: (clientX - r.left) * (canvas.width / r.width),

      y: (clientY - r.top) * (canvas.height / r.height),

    };

  }

  function onMouseMove(e) {

    if (!active) return;

    const p = clientToCanvas(e.clientX, e.clientY);

    mouse.x = p.x; mouse.y = p.y;

    if (selectedDeployType) return;   // deploy mode — patranka NEseka piršto (kad nesusimaišytų su unito dėjimu)

    // virš HOLD mygtuko — patranka NEseka (kaip su kortom, kad netaikytų bandant paspausti HOLD)

    if (_f12HoldRect && p.x >= _f12HoldRect.x && p.x <= _f12HoldRect.x + _f12HoldRect.w &&

        p.y >= _f12HoldRect.y && p.y <= _f12HoldRect.y + _f12HoldRect.h) return;

    updateLauncherAim();

  }

  function onMouseDown(e) {

    if (!active) return;

    // Pirma user gesture'a — atrakinam AudioContext + paleidžiam BGM

    try {

      _F12Audio._init();

      if (_F12Audio.ctx && _F12Audio.ctx.state === 'suspended') _F12Audio.ctx.resume();

      if (!_F12Music.active) _F12Music.start();

    } catch (_) {}

    const p = clientToCanvas(e.clientX, e.clientY);

    mouse.x = p.x; mouse.y = p.y;

    // ── EDIT MAP mygtukas — tikrinam PIRMA (kad visada galima išjungti) ──

    if (editMapBtnRect && p.x >= editMapBtnRect.x && p.x <= editMapBtnRect.x + editMapBtnRect.w

        && p.y >= editMapBtnRect.y && p.y <= editMapBtnRect.y + editMapBtnRect.h) {

      _f12ToggleEditMode();

      return;

    }

    // ── EDIT MODE — click ant arena/lanes deda/trina dekoraciją (perima visą click'ą) ──

    if (_f12EditMode) {

      _f12EditClick(p.x, p.y);

      return;

    }

    // ── GAME OVER: GO HOME mygtukas → grįžta į F10 HOME (ne village!) ──

    if (gameOver && gameOverHomeBtnRect &&

        p.x >= gameOverHomeBtnRect.x && p.x <= gameOverHomeBtnRect.x + gameOverHomeBtnRect.w &&

        p.y >= gameOverHomeBtnRect.y && p.y <= gameOverHomeBtnRect.y + gameOverHomeBtnRect.h) {

      try { _F12Music.stop(); } catch (_) {}

      // Deactivate F12 overlay + nukreipiam į F10 home

      try { if (window.MergeFloor && window.MergeFloor.deactivate) window.MergeFloor.deactivate(); } catch (_) {}

      try { if (typeof window.gotoF10 === 'function') window.gotoF10(); } catch (_) {}

      return;

    }

    // ── HOLD slotas — tap = įsisaugok / swap kamuoliuką (prieš aim/charge, kad netriggerintų šūvio) ──

    if (!gameOver && _f12HoldRect &&

        p.x >= _f12HoldRect.x && p.x <= _f12HoldRect.x + _f12HoldRect.w &&

        p.y >= _f12HoldRect.y && p.y <= _f12HoldRect.y + _f12HoldRect.h) {

      _f12HoldSwap();

      return;

    }

    // Kortos — tik vizualas, click'ai ignoruojami (panaikinta drag logika)

    if (exitBtnRect && p.x >= exitBtnRect.x && p.x <= exitBtnRect.x + exitBtnRect.w

        && p.y >= exitBtnRect.y && p.y <= exitBtnRect.y + exitBtnRect.h) {

      try { S.floor = 11; } catch (_) {}

      return;

    }

    if (restartBtnRect && p.x >= restartBtnRect.x && p.x <= restartBtnRect.x + restartBtnRect.w

        && p.y >= restartBtnRect.y && p.y <= restartBtnRect.y + restartBtnRect.h) {

      _f12RestartGame(); return;

    }

    if (speedBtnRect && p.x >= speedBtnRect.x && p.x <= speedBtnRect.x + speedBtnRect.w

        && p.y >= speedBtnRect.y && p.y <= speedBtnRect.y + speedBtnRect.h) {

      _f12TimeScale = (_f12TimeScale >= 2) ? 1 : 2;   // toggle ×1 / ×2

      return;

    }

    // ── KORTŲ KLIKAS — reikalauja: (1) atrakinta korta, (2) ištreniruotas unit HOME, (3) CD pasibaigęs ──

    // Korta yra PERMANENTTIŠKA po pirmo merge — nereikia turėti „merge tokens"

    for (const r of cardHoverRects) {

      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y - 14 && p.y <= r.y + r.h) {

        const _utype = _UNIT_FOR_BALL_TYPE[r.type];

        if (!_utype) return;                                  // mapping nėra (pearl/frost)

        const isLocked = !_f12CardDeck[r.type];

        if (isLocked) return;

        const trainedCnt = _getTrainedCount(_utype);

        if (trainedCnt <= 0) return;

        const cdRemain = _f12UnitDeployCD[_utype]

          ? Math.max(0, _UNIT_DEPLOY_CD_MS - (now() - _f12UnitDeployCD[_utype])) : 0;

        if (cdRemain <= 0) {

          // NFT mūšis su KELIAIS to tipo NFT → picker (pasirink konkretų pagal status).

          if (_f12IsNftBattle) {

            const _units = _f12SessionNftPool.filter(function (n) { return n && n.utype === _utype; });

            if (_units.length > 1 && selectedDeployType !== _utype) {

              _showUnitPicker(_utype, r.type);

              return;

            }

            // vienas NFT (arba jau pasirinktas → toggle off): tiesiogiai

            selectedDeployTokenId = (selectedDeployType === _utype) ? null : (_units.length ? _units[0].tokenId : null);

          } else {

            selectedDeployTokenId = null;

          }

          selectedDeployType = (selectedDeployType === _utype) ? null : _utype;

        } else if (selectedDeployType === _utype) { selectedDeployType = null; selectedDeployTokenId = null; }

        return;

      }

    }

    // Deploy panel — pasirink unit type (su CD check) — palikta backward compat

    for (const r of deployBtnRects) {

      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {

        const cdRemain = _f12UnitDeployCD[r.utype]

          ? Math.max(0, _UNIT_DEPLOY_CD_MS - (now() - _f12UnitDeployCD[r.utype])) : 0;

        if (r.cnt > 0 && cdRemain <= 0) selectedDeployType = (selectedDeployType === r.utype) ? null : r.utype;

        else if (selectedDeployType === r.utype) selectedDeployType = null;

        return;

      }

    }

    // Deploy → click ant lane (su CD check).

    // SVARBU: kai korta pasirinkta, tap'as VISADA suvartojamas (deploy arba deselect) —

    // niekada neprakrenta į patrankos aim/charge/fire (kitaip patranka iššaudavo dedant unitą).

    if (selectedDeployType && layoutCache) {

      const L = layoutCache;

      const _inLanes = (p.x >= L.lanesX && p.x <= L.lanesX + L.lanesW && p.y >= L.lanesY && p.y < L.lanesY + L.lanesH);

      if (_inLanes) {

        const laneIdx = Math.floor((p.y - L.lanesY) / L.laneH);

        // CD check — jei krauna, deploy blokuojamas

        const cdRem = _f12UnitDeployCD[selectedDeployType]

          ? Math.max(0, _UNIT_DEPLOY_CD_MS - (now() - _f12UnitDeployCD[selectedDeployType])) : 0;

        if (cdRem > 0) { selectedDeployType = null; return; }

        // canDeploy: korta atrakinta (permanenttiškai po pirmo merge) + trained > 0

        let _ballType = null;

        for (const bt in _UNIT_FOR_BALL_TYPE) {

          if (_UNIT_FOR_BALL_TYPE[bt] === selectedDeployType) { _ballType = bt; break; }

        }

        const isUnlocked = !!(_ballType && _f12CardDeck[_ballType]);

        const trainedCnt2 = _getTrainedCount(selectedDeployType);

        const canDeploy = isUnlocked && trainedCnt2 > 0;

        if (laneIdx >= 0 && laneIdx < LANES && canDeploy) {

          spawnAlly(selectedDeployType, laneIdx, now(), selectedDeployTokenId);   // picker'io NFT (jei yra)

          // NEdekrementuojam kortų count — kortos permanenttiškos, count tik bonus track'inimui

          // CD startuos kai unit'as bus recall'intas / miršta (sequential)

          selectedDeployType = null;       // deselect po deploy (žaidėjas mato unit lane'oj, CD prasidės)

          selectedDeployTokenId = null;

        }

        // lane'e bet negali deploy → tiesiog deselect (žemiau), bet tap'o nešaudom

      }

      // bet koks tap'as su pasirinkta korta (lane ar ne) → deselect + suvartok (jokio šūvio)

      selectedDeployType = null;

      selectedDeployTokenId = null;

      return;

    }

    updateLauncherAim();

    // Reload check — neleidžia pradėti naujo charge kol patranka nepasikrovus

    if (now() - lastFireAt < _currentReloadMs) return;

    charging = true;

    chargeStartedAt = now();

  }

  function onMouseUp(e) {

    if (!active || !charging) return;

    if (e) {

      const p = clientToCanvas(e.clientX, e.clientY);

      mouse.x = p.x; mouse.y = p.y;

      updateLauncherAim();

    }

    const power = getChargeLevel();

    charging = false;

    fire(power);

  }

  // ── Activation ─────────────────────────────────────────────────────

  function ensureOverlay() {

    if (canvas) return;

    canvas = document.createElement('canvas');

    canvas.id = 'floor12-merge-canvas';

    canvas.style.cssText = `

      position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;

      z-index: 9000; background: #2a1a0e; cursor: crosshair;

      touch-action: none; image-rendering: pixelated; image-rendering: crisp-edges;`;

    document.body.appendChild(canvas);

    ctx = canvas.getContext('2d');

    resize();

    window.addEventListener('resize', resize);

    canvas.addEventListener('mousedown', onMouseDown);

    canvas.addEventListener('mousemove', onMouseMove);

    canvas.addEventListener('mouseup', onMouseUp);

    canvas.addEventListener('mouseleave', () => { if (charging) onMouseUp(null); });

    canvas.addEventListener('touchstart', e => {

      const t = e.touches[0];

      onMouseMove({ clientX: t.clientX, clientY: t.clientY });

      onMouseDown({ clientX: t.clientX, clientY: t.clientY });

      e.preventDefault();

    }, { passive: false });

    canvas.addEventListener('touchmove', e => {

      const t = e.touches[0];

      onMouseMove({ clientX: t.clientX, clientY: t.clientY });

      e.preventDefault();

    }, { passive: false });

    canvas.addEventListener('touchend', e => {

      const t = e.changedTouches[0];

      onMouseUp({ clientX: t.clientX, clientY: t.clientY });

      e.preventDefault();

    }, { passive: false });

  }

  function resize() {

    if (!canvas) return;

    // ── ANTI-CHEAT / ZOOM FREEZE — aktyvaus mūšio metu (desktop) NEKEIČIAM vidinės rezoliucijos.

    // Zoom keistų canvas.width → arena → kamuoliukai pajudėtų (ir žaidėjas galėtų tuo sukčiauti).

    // Vietoj to canvas tik ištempiamas per CSS (100vw/100vh) — koordinatės identiškos, jokio judesio.

    if (active && !_IS_MOBILE) {

      canvas.style.width = '100vw';

      canvas.style.height = '100vh';

      return;

    }

    const _oldW = canvas.width, _oldH = canvas.height;   // prieš keičiant — pozicijų remap'ui (mobile/neaktyvus)

    const screenW = window.innerWidth, screenH = window.innerHeight;

    if (_IS_MOBILE) {

      // Mobile: virtual canvas (720p × screen aspect) + CSS stretch — pripildo VISĄ ekraną.

      // Force-landscape metu loginė erdvė = (innerHeight × innerWidth), tad naudojam __logicalW/H,

      // kad canvas teisingai užpildytų CSS'u pasuktą body (kitaip būtų squished/portrait).

      const lw = (window.__logicalW ? window.__logicalW() : screenW);

      const lh = (window.__logicalH ? window.__logicalH() : screenH);

      const targetH = 720;

      const aspect = lw / Math.max(1, lh);

      const VW = Math.max(1280, Math.round(targetH * aspect));

      const VH = targetH;

      canvas.width = VW;

      canvas.height = VH;

      canvas.style.position = 'absolute';

      canvas.style.left = '0';

      canvas.style.top  = '0';

      canvas.style.width  = lw + 'px';

      canvas.style.height = lh + 'px';

    } else {

      // Desktop: native screen resolution

      canvas.width = Math.floor(screenW);

      canvas.height = Math.floor(screenH);

      canvas.style.width = canvas.width + 'px';

      canvas.style.height = canvas.height + 'px';

    }

    // ── ZOOM/RESIZE FIX — perskaičiuojam kamuoliukų pozicijas iš senos arenos į naują.

    // Kitaip po zoom in/out kamuoliukai atsiduria už naujų sienų → fizika juos „pastumia"

    // (atrodo lyg patys judėtų; žaidėjas galėtų tuo pasinaudoti pozicionavimui). Remap = jokio judesio.

    const _newW = canvas.width, _newH = canvas.height;

    if (active && blocks && blocks.length && _oldW > 0 && _oldH > 0 &&

        (_oldW !== _newW || _oldH !== _newH)) {

      const oa = _arenaBoundsFor(_oldW, _oldH);

      const na = _arenaBoundsFor(_newW, _newH);

      for (const b of blocks) {

        const fx = (b.x - oa.x) / Math.max(1, oa.w);

        const fy = (b.y - oa.y) / Math.max(1, oa.h);

        b.x = na.x + fx * na.w;

        b.y = na.y + fy * na.h;

      }

    }

  }

  let _pickerOpen = false;

  function activate() {

    if (active) return;

    // Guard: jei picker atviras IR DEPLOY dar nepaspaustas → nepakartot openModal'o.

    // Bet jei _f12PreDeckChoice jau set'intas (DEPLOY consumed) → leid'iam activate proceed.

    if (_pickerOpen && window._f12PreDeckChoice == null) return;

    ensureOverlay();

    // PRE-BATTLE PICKER — vieningas NFT Barracks BATTLE tab'as.

    // Jei window._f12PreDeckChoice == null → DEPLOY dar nepaspaustas, atidarom picker'į.

    // Jei window._f12PreDeckChoice != null → DEPLOY consumed, einam į žaidimą.

    try {

      if (window._f12PreDeckChoice == null) {

        // NEKĖLAM canvas — picker turi rodyt'is virš dabartinio F10/F11 fono.

        // Canvas show'inamas tik kai _activateNow() startuoja game'ą.

        // Open NFT Barracks BATTLE tab as the unified pre-battle picker

        if (typeof window._openNftBarracksModal === 'function') {

          _pickerOpen = true;

          window._openNftBarracksModal();

          return;

        }

        // Fallback į senesnį predeck modal'ą jei NFT Barracks nepasiekiamas

        if (window._F12PreDeck && typeof window._F12PreDeck.show === 'function') {

          window._F12PreDeck.show(function(choice) {

            window._f12PreDeckChoice = choice || {};

            _activateNow();

          });

          return;

        }

      }

    } catch (e) { console.warn('[F12] pre-battle picker failed, starting plain:', e); }

    _activateNow();

  }

  // Eksportas — naudojamas NFT Barracks DEPLOY metu po _f12PreDeckChoice nustaymo.

  window._F12_activateNow = function() { _activateNow(); };

  // ── ASSET LOADING GATE ── (2026-06-13) lėtas tinklas/CPU → sprite'ai dar nesukrauti, o loop jau
  // sukasi → žaidimas „pakimba" 1-2 min (platformos/sprite'ai nesirenderina, priešai juda, negali šaudyti).
  // Fix: prieš startą palaukti kritinių sprite'ų (su 20s timeout fallback) + rodyti LOADING ekraną.
  let _f12LoadPoll = 0, _f12LoadEl = null;
  function _f12CriticalImgs() {
    return [_platformSheetImg, _wallSheetImg, _spikeSheetImg, _wallDestroyImg, _towerSpriteImg, _zipSpriteImg, _frostLogoImg];
  }
  function _f12AssetsReady() {
    try { return _f12CriticalImgs().every(function (im) { return im && im.complete && im.naturalWidth > 0; }); }
    catch (_) { return true; }
  }
  function _showF12Loading() {
    if (_f12LoadEl) return;
    var d = document.createElement('div');
    d.id = 'f12-loading';
    d.style.cssText = 'position:fixed;inset:0;z-index:99990;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#10131c;color:#cfe3ff;font-family:\'Press Start 2P\',monospace,sans-serif;';
    d.innerHTML = '<div style="font-size:13px;letter-spacing:1px;">⚙ LOADING PEWPEW ROOM…</div>' +
      '<div style="width:180px;height:10px;border:2px solid #3a4a66;border-radius:6px;overflow:hidden;background:#0a0d14;"><div id="f12-load-bar" style="height:100%;width:10%;background:linear-gradient(90deg,#4a9da6,#6cf0ff);transition:width .25s;"></div></div>' +
      '<div style="font-size:8px;opacity:.7;text-align:center;line-height:1.6;max-width:80vw;">first load on a slow connection<br>can take a moment</div>';
    document.body.appendChild(d);
    _f12LoadEl = d;
  }
  function _hideF12Loading() { if (_f12LoadEl) { try { _f12LoadEl.remove(); } catch (_) {} _f12LoadEl = null; } }
  function _activateNow() {
    if (active) return;
    if (!_f12AssetsReady()) {
      _showF12Loading();
      var t0 = performance.now();
      var total = _f12CriticalImgs().length || 1;
      if (_f12LoadPoll) clearInterval(_f12LoadPoll);
      _f12LoadPoll = setInterval(function () {
        try {
          var ready = _f12CriticalImgs().filter(function (im) { return im && im.complete && im.naturalWidth > 0; }).length;
          var bar = document.getElementById('f12-load-bar'); if (bar) bar.style.width = Math.max(10, Math.round(ready / total * 100)) + '%';
        } catch (_) {}
        if (_f12AssetsReady() || performance.now() - t0 > 20000) {
          clearInterval(_f12LoadPoll); _f12LoadPoll = 0;
          _hideF12Loading();
          _activateNowReal();
        }
      }, 150);
      return;
    }
    _activateNowReal();
  }
  function _activateNowReal() {

    if (active) return;

    try { window._f12FeePaidForEntry = false; } catch (_) {}   // play fee suvartotas šiam mūšiui → kitas įėjimas mokės iš naujo

    _pickerOpen = false;   // game pradėtas → picker tikrai uždarytas

    _f12Clock = performance.now();   // game clock startas (PRIEŠ initState — kad now() duotų bazę)

    initState();

    canvas.style.display = 'block';

    active = true;

    lastTime = performance.now();    // realaus laiko tracker loop'ui (ne game clock)

    // ANTI-ACCIDENTAL-RELOAD: įspėjam prieš page reload/uždarymą kai vyksta NESETTLE'INTAS

    // NFT mūšis (kad atsitiktinai neperkrautų → neprarastų runo + neliktų orphaned sesijos).

    // Mechanikos NEkeičia (abandon vis tiek = no XP / no escape) → JOKIO exploit'o.

    if (!window.__f12UnloadGuard) {

      window.__f12UnloadGuard = true;

      window.addEventListener('beforeunload', function (e) {

        try {

          if (active && window._f12NftBurnAuth && !_f12BattleSettled) {

            e.preventDefault();

            e.returnValue = '';   // trigerina naršyklės „Leave site?" patvirtinimą

            return '';

          }

        } catch (_) {}

      });

    }

    // Po perkrovimo užstrigusios mirtys (iš localStorage) — išsiunčiam serveriui dabar, kai

    // wallet/SupabaseSync vėl stabilūs ir sesija dar pending. Tai galutinis reload-proof kelias.

    try { _flushPendingDeaths(); } catch (_) {}

    // Checkpoint loop — kas 5s saugo progresą serveryje (reload-safe XP).

    try { if (_f12CheckpointTimer) clearInterval(_f12CheckpointTimer); } catch (_) {}

    _f12CheckpointTimer = setInterval(_f12SendCheckpoint, 5000);

    document.addEventListener('keydown', onKey, true);

    document.addEventListener('keyup', onKeyUp, true);

    // Tyla — F12 sukurs savo garsus vėliau. Sustabdom BGM ir bandom išsuti master gain.

    try { if (typeof BGM !== 'undefined' && BGM && BGM.stop) BGM.stop(); } catch (_) {}

    try {

      if (typeof BGM !== 'undefined' && BGM && BGM.ctx && BGM.master && BGM.master.gain) {

        BGM._f12SavedGain = BGM.master.gain.value;

        BGM.master.gain.value = 0;

      }

    } catch (_) {}

    raf = requestAnimationFrame(loop);

    // Chill background music — startuojam (jei AudioContext suspended, pirma fire/keydown atrakins)

    try { _F12Music.start(); } catch (_) {}

  }

  // ─── NFT BATTLE SETTLEMENT ─────────────────────────────────────

  // Po gameOver (arba manual end) — submit'inam stats + burn auth į edge fn,

  // gaunam signed XP awards, paskui kvieciam contract'ą on-chain.

  async function _settleNftBattle(won) {

    if (_f12BattleSettled) return;

    _f12BattleSettled = true;

    const auth = window._f12NftBurnAuth;

    if (!auth) {

      console.log('[F12 settle] No BurnAuth → no NFT mode, skip settlement');

      return;

    }

    // Collect survivors (NFT'ai deployed, bet ne mirę)

    const deadSet = new Set(_f12DeadNftTokenIds.map(String));

    const survivors = [];

    for (const k in _f12NftStats) {

      const s = _f12NftStats[k];

      if (deadSet.has(String(s.tokenId))) continue;

      if (!s.deployed) continue;

      survivors.push({

        tokenId: Number(s.tokenId),

        kills: s.kills | 0,

        dmgDealt: s.dmgDealt | 0,

        dmgTaken: s.dmgTaken | 0,

        finalHpPercent: 100,

      });

    }

    const deadIds = Array.from(deadSet).map(Number);

    console.log('[F12 settle]', { won, dead: deadIds, survivors });

    // ─── 1) Call submit-battle-result edge fn ───

    if (!window.SupabaseSync || typeof window.SupabaseSync.invoke !== 'function') {

      console.warn('[F12 settle] SupabaseSync.invoke missing — skip backend');

      return;

    }

    let respWrap;

    try {

      respWrap = await window.SupabaseSync.invoke('submit-battle-result', {

        battleId: auth.battleId,

        ownerSignature: auth.signature,

        nonce: auth.nonce,              // CRITICAL: NUMERIC precision loss workaround

        deadlineSec: auth.deadline,     // pass for parity (DB timestamp re-read is OK but consistent)

        deadTokenIds: deadIds,

        survivors,

        won,

        battleDurationSec: Math.floor((now() - _f12GameStartT) / 1000),

      });

    } catch (e) {

      console.error('[F12 settle] edge fn err:', e);

      _showSettleResult({ error: 'Backend call failed: ' + (e.message || e) });

      return;

    }

    console.log('[F12 settle] backend resp:', respWrap);

    // SupabaseSync.invoke wrap'ina į {ok (HTTP), status, data (body)}

    const resp = respWrap && respWrap.data ? respWrap.data : respWrap;

    if (!respWrap || !respWrap.ok || !resp || resp.ok === false) {

      const baseMsg = (resp && resp.error)

        || (respWrap && 'HTTP ' + respWrap.status)

        || 'Unknown backend error';

      const detail = resp && resp.detail ? ('\n\nDetail: ' + resp.detail) : '';

      const debug = resp && resp.debug ? ('\n\nDebug: ' + JSON.stringify(resp.debug, null, 2)) : '';

      _showSettleResult({ error: baseMsg + detail + debug });

      return;

    }

    // Backend jau atliko visus on-chain TX'us (sponsored gas).

    // Frontend tik parodo rezultatus — TIK jei TIKRAI sukurta on-chain (burnHash exists).

    console.log('[F12 settle] backend relay results:', {

      burnTx: resp.burnTxHash,

      burnedTokens: resp.burnedTokenIds,

      xpTxs: resp.xpTxHashes,

      relayer: resp.relayer,

    });

    // Only show "burned" if backend actually executed burn TX (hash exists)

    const actuallyBurned = resp.burnTxHash ? (resp.burnedTokenIds || []) : [];

    const wantedBurn = resp.burnedTokenIds || [];

    const claimedSuccess = (resp.xpTxHashes || []);

    _showSettleResult({

      dead: actuallyBurned,

      claimed: claimedSuccess.map(x => ({

        tokenId: x.tokenId, hash: x.hash, xp: x.xpGain,

      })),

      burnHash: resp.burnTxHash,

      // Diag info if something didn't happen

      relayWarning: (wantedBurn.length > 0 && !resp.burnTxHash)

        ? 'Burn TX skipped — relayer wallet has no RON for gas. Fund ' + (resp.relayer || 'signer') + ' to enable burns.'

        : null,

    });

    // Settlinta normaliai → išvalom localStorage pending (kad flush nebandytų pakartot).

    try { if (auth && auth.battleId) _clearPendingSettle(auth.battleId); } catch (_) {}

    // Consume burnAuth

    window._f12NftBurnAuth = null;

  }

  // ── Settle ekrano helper'iai (sprite + XP + level-up kortelės). 2026-06-13. ──
  const _F12_SETTLE_IMG = {
    skull: 'unit-images/skull-idle.gif', 1: 'unit-images/skull-idle.gif',
    archer: 'unit-images/archer-idle.gif', 2: 'unit-images/archer-idle.gif',
    harpoon: 'unit-images/harpoon-idle.gif', harpoon_fish: 'unit-images/harpoon-idle.gif', 3: 'unit-images/harpoon-idle.gif',
    shaman: 'unit-images/shaman-idle.gif', 4: 'unit-images/shaman-idle.gif',
    hog_rider: 'unit-images/hog-idle.png', pigronke: 'unit-images/hog-idle.png', 5: 'unit-images/hog-idle.png',
  };
  const _F12_SETTLE_NAME = {
    skull: 'Skull', archer: 'Archer', harpoon: 'Harpoon', harpoon_fish: 'Harpoon',
    shaman: 'Shaman', hog_rider: 'Hog Rider', pigronke: 'Hog Rider',
    1: 'Skull', 2: 'Archer', 3: 'Harpoon', 4: 'Shaman', 5: 'Hog Rider',
  };
  function _f12LevelFromXp(xp) { return Math.floor(Math.sqrt(Math.max(0, xp || 0) / 100)); }
  function _f12SettleMeta(tokenId) {
    const key = String(tokenId);
    try {
      // Persistinis žemėlapis PIRMA — turi VISŲ pradinių unitų teisingą tipą (net deploy'intų,
      // kurie išsplice'inti iš _f12SessionNftPool). Pool kaip atsarga.
      if (_f12NftMetaMap && _f12NftMetaMap[key]) return _f12NftMetaMap[key];
      const pool = _f12SessionNftPool || [];
      const e = pool.find(function (n) { return n && String(n.tokenId) === key; });
      if (e) return e;
    } catch (_) {}
    return null;
  }
  function _f12InjectSettleStyle() {
    if (document.getElementById('f12sr-style')) return;
    const st = document.createElement('style');
    st.id = 'f12sr-style';
    st.textContent = [
      '#f12-settle-result .f12sr-title{color:#ffcf5c;font-size:14px;text-align:center;text-shadow:2px 2px 0 #2a1a0c;animation:f12srTitleIn 0.5s ease-out both}',
      '#f12-settle-result .f12sr-sub{color:#ffcf5c;font-size:8px;text-align:center;line-height:1.6;opacity:0.92;animation:f12srPulse2 1.1s ease-in-out infinite}',
      // Sprite tinklelis — 6 stulpeliai (2 eilutės po 6 = 12). Didesnis vertikalus tarpas,
      // kad apatinės eilutės XP skaičiai nesikirstų su viršutinės eilutės vardais.
      '#f12-settle-result .f12sr-row{display:grid;grid-template-columns:repeat(6,auto);justify-content:center;align-items:end;gap:30px 14px;padding:24px 6px 6px;max-width:97vw}',
      '#f12-settle-result .f12sr-unit{position:relative;display:flex;flex-direction:column;align-items:center;animation:f12srIn 0.45s ease-out both}',
      // Kylantis XP skaitliukas — pakeltas ant sprite viršaus (arčiau matomo unito, ne aukštai ore)
      '#f12-settle-result .f12sr-xpfloat{position:absolute;bottom:calc(100% - 16px);color:#7ee08a;font-size:10px;text-shadow:1px 1px 0 #06120a,0 0 6px rgba(126,224,138,0.6);white-space:nowrap}',
      '#f12-settle-result .f12sr-unit.popxp .f12sr-xpfloat{animation:f12srXpPop 0.18s ease-out}',
      '#f12-settle-result .f12sr-spr{width:min(14.5vw,26vh,168px);height:min(14.5vw,26vh,168px);image-rendering:pixelated;object-fit:contain;display:block;filter:drop-shadow(0 5px 5px rgba(0,0,0,0.55))}',
      '#f12-settle-result .f12sr-shadow{width:min(10vw,18vh,112px);height:13px;margin-top:-8px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,0.5),transparent 70%)}',
      // Vardas + lygis vienoje kompaktiškoj linijoj prie pat sprite
      '#f12-settle-result .f12sr-meta{color:#cdb88c;font-size:8px;margin-top:1px;max-width:min(15vw,176px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;line-height:1.3}',
      '#f12-settle-result .f12sr-meta b{color:#ffcf5c;font-weight:normal}',
      '#f12-settle-result .f12sr-id{color:#8a9aaa;font-size:7px;font-family:monospace;margin-top:3px;line-height:1.2}',
      // Level-up burst — paleidžiamas JS po XP animacijos (klasė .lvgo)
      '#f12-settle-result .f12sr-unit.lvgo .f12sr-spr{animation:f12srLvPop 0.7s ease-out, f12srBounce 0.7s ease-in-out 0.7s infinite}',
      '#f12-settle-result .f12sr-lvup{position:absolute;bottom:calc(100% - 16px);left:50%;transform:translateX(-50%) scale(0);background:linear-gradient(180deg,#ffe07a,#e89a2a);color:#2a1a0c;font-size:8px;font-weight:bold;padding:3px 8px;border-radius:5px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.6),0 0 12px rgba(255,207,92,0.7);z-index:4}',
      '#f12-settle-result .f12sr-unit.lvgo .f12sr-lvup{animation:f12srLvUp 0.6s cubic-bezier(0.2,1.4,0.4,1) forwards, f12srPulse 0.9s ease-in-out 0.6s infinite}',
      '#f12-settle-result .f12sr-ring{position:absolute;top:42%;left:50%;width:min(14.5vw,26vh,168px);height:min(14.5vw,26vh,168px);border:3px solid #ffe07a;border-radius:50%;transform:translate(-50%,-50%) scale(0.3);opacity:0;pointer-events:none}',
      '#f12-settle-result .f12sr-unit.lvgo .f12sr-ring{animation:f12srRing 0.7s ease-out}',
      // Žuvę unitai
      '#f12-settle-result .f12sr-unit.dead .f12sr-spr{filter:grayscale(1) brightness(0.5) drop-shadow(0 4px 4px rgba(0,0,0,0.55))}',
      '#f12-settle-result .f12sr-deadlbl{position:absolute;bottom:calc(100% - 16px);color:#ff8a8a;font-size:8px;text-shadow:1px 1px 0 #200}',
      '#f12-settle-result .f12sr-close{margin-top:6px;padding:9px 30px;font-family:inherit;font-size:10px;background:#ffcf5c;color:#2a1a0c;border:2px solid #2a1a0c;border-radius:5px;cursor:pointer;box-shadow:2px 3px 0 #2a1a0c}',
      '@keyframes f12srTitleIn{0%{opacity:0;transform:translateY(-14px) scale(0.9)}100%{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes f12srPulse{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.1)}}',
      '@keyframes f12srPulse2{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}',
      '@keyframes f12srIn{0%{opacity:0;transform:translateY(14px) scale(0.9)}100%{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes f12srBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
      '@keyframes f12srXpPop{0%{transform:scale(1)}50%{transform:scale(1.28);color:#fff}100%{transform:scale(1)}}',
      '@keyframes f12srLvPop{0%{transform:scale(1)}30%{transform:scale(1.35);filter:drop-shadow(0 0 14px #ffe07a) brightness(1.6)}100%{transform:scale(1)}}',
      '@keyframes f12srLvUp{0%{transform:translateX(-50%) translateY(8px) scale(0)}100%{transform:translateX(-50%) translateY(0) scale(1)}}',
      '@keyframes f12srRing{0%{opacity:0.9;transform:translate(-50%,-50%) scale(0.3)}100%{opacity:0;transform:translate(-50%,-50%) scale(2.4)}}',
      '@media(max-width:560px){#f12-settle-result .f12sr-row{gap:6px 7px;padding-top:30px}#f12-settle-result .f12sr-xpfloat{font-size:8px}}',
    ].join('');
    document.head.appendChild(st);
  }
  // Inline sprite (JOKIOS dėžės). opts.dead = žuvęs. Survivor'iui XP skaitliukas animuojamas JS'u
  // (data-xp = uždirbtas; jei data-lvup="1" → po skaičiavimo paleidžiama level-up animacija).
  function _f12SettleCard(tokenId, gain, idx, opts) {
    opts = opts || {};
    const dead = !!opts.dead;
    const meta = _f12SettleMeta(tokenId);
    const cu = meta ? meta.contractUtype : null;
    const img = _F12_SETTLE_IMG[cu] || (meta && _F12_SETTLE_IMG[meta.utype]) || 'unit-images/skull-idle.gif';
    const nm = _F12_SETTLE_NAME[cu] || (meta && _F12_SETTLE_NAME[meta.utype]) || 'Unit';
    const delay = ((idx || 0) * 0.07).toFixed(2);

    if (dead) {
      let s = '<div class="f12sr-unit dead" style="animation-delay:' + delay + 's">';
      s += '<div class="f12sr-deadlbl">💀</div>';
      s += '<img class="f12sr-spr" src="' + img + '" alt="">';
      s += '<div class="f12sr-shadow"></div>';
      s += '<div class="f12sr-meta">' + nm + '</div>';
      s += '<div class="f12sr-id">#' + tokenId + '</div>';
      s += '</div>';
      return s;
    }

    const startXp = meta ? (meta.xp || 0) : null;
    const g = gain || 0;
    const newXp = (startXp != null) ? startXp + g : null;
    const oldLv = (startXp != null) ? _f12LevelFromXp(startXp) : null;
    const newLv = (newXp != null) ? _f12LevelFromXp(newXp) : null;
    const leveled = (oldLv != null && newLv != null && newLv > oldLv);

    // XP skaitliukas startuoja nuo 0; data-xp = tikslas. Stagger pradžia per --d (s).
    let s = '<div class="f12sr-unit" style="animation-delay:' + delay + 's">';
    s += '<div class="f12sr-ring"></div>';
    s += '<div class="f12sr-xpfloat" data-xp="' + g + '"' + (leveled ? ' data-lvup="1"' : '') + ' data-start="' + delay + '">+0 XP</div>';
    if (leveled) s += '<div class="f12sr-lvup">LEVEL UP! Lv ' + newLv + '</div>';
    s += '<img class="f12sr-spr" src="' + img + '" alt="">';
    s += '<div class="f12sr-shadow"></div>';
    s += '<div class="f12sr-meta">' + nm + (newLv != null ? ' <b>Lv ' + newLv + '</b>' : '') + '</div>';
    s += '<div class="f12sr-id">#' + tokenId + '</div>';
    s += '</div>';
    return s;
  }

  function _showSettleResult(info) {

    // Visual popup (HTML overlay)

    let div = document.getElementById('f12-settle-result');

    if (!div) {

      div = document.createElement('div');

      div.id = 'f12-settle-result';

      // Pilno ekrano overlay — beveik nepermatomas fonas (atskiro lango pojūtis),
      // kad XP/level-up animacijos NESILIETŲ su žaidimo scena už nugaros.
      div.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;'
        + 'align-items:center;justify-content:center;gap:12px;'
        + 'background:radial-gradient(ellipse at center,#1a120a 0%,#0a0703 70%,#050302 100%);'
        + 'color:#f5e6c3;font-family:\'Press Start 2P\',monospace;font-size:9px;letter-spacing:0.5px;';

      document.body.appendChild(div);

    }

    if (info.error) {

      const errEsc = String(info.error)

        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      div.innerHTML = '<div style="color:#e85d5d;font-size:11px;margin-bottom:10px">⚠ NFT SETTLEMENT FAILED</div>'

        + '<pre style="font-family:inherit;font-size:7px;white-space:pre-wrap;max-height:300px;overflow:auto;margin:0;color:#f5e6c3;line-height:1.4">' + errEsc + '</pre>'

        + '<button style="margin-top:14px;padding:8px 16px;font-family:inherit;font-size:9px;background:#6b4a2e;color:#f5e6c3;border:2px solid #2a1a0c;cursor:pointer" onclick="document.getElementById(\'f12-settle-result\').remove()">CLOSE</button>';

      return;

    }

    _f12InjectSettleStyle();
    // VERIFIKACIJA — log'inam tokenId → tipas/sprite atitiktį (kad būtų lengva patikrint teisingumą)
    try {
      const _log = [];
      for (const c of (info.claimed || [])) {
        const m = _f12SettleMeta(c.tokenId);
        const cu = m ? m.contractUtype : null;
        _log.push('#' + c.tokenId + '=' + (_F12_SETTLE_NAME[cu] || (m && _F12_SETTLE_NAME[m.utype]) || '?') + '(cu' + cu + ',+' + (c.xp || 0) + 'xp)');
      }
      for (const d of (info.dead || [])) {
        const m = _f12SettleMeta(d);
        const cu = m ? m.contractUtype : null;
        _log.push('#' + d + '=' + (_F12_SETTLE_NAME[cu] || (m && _F12_SETTLE_NAME[m.utype]) || '?') + '(DEAD)');
      }
      console.log('[F12 settle] units:', _log.join(' '));
    } catch (_) {}
    const _nLeveled = (info.claimed || []).filter(function (c) {
      const m = _f12SettleMeta(c.tokenId);
      if (!m) return false;
      return _f12LevelFromXp((m.xp || 0) + (c.xp || 0)) > _f12LevelFromXp(m.xp || 0);
    }).length;
    const _claimed = info.claimed || [];
    const _dead = info.dead || [];
    let html = '<div class="f12sr-title">⚔ BATTLE SETTLED</div>';
    const _totalXp = _claimed.reduce(function (a, c) { return a + (c.xp || 0); }, 0);
    const _subBits = [];
    if (_claimed.length) _subBits.push(_claimed.length + ' survived');
    if (_totalXp > 0) _subBits.push('+' + _totalXp + ' XP');
    if (_nLeveled > 0) _subBits.push('★ ' + _nLeveled + ' leveled up!');
    if (_dead.length) _subBits.push('💀 ' + _dead.length + ' lost');
    if (_subBits.length) html += '<div class="f12sr-sub">' + _subBits.join('  ·  ') + '</div>';

    if (_claimed.length || _dead.length) {

      html += '<div class="f12sr-row">';

      let _idx = 0;

      for (let _ci = 0; _ci < _claimed.length; _ci++) {

        html += _f12SettleCard(_claimed[_ci].tokenId, _claimed[_ci].xp, _idx++, {});

      }

      for (let _di = 0; _di < _dead.length; _di++) {

        html += _f12SettleCard(_dead[_di], 0, _idx++, { dead: true });

      }

      html += '</div>';

    } else {

      html += '<div style="opacity:0.7">No units processed.</div>';

    }

    if (info.dead && info.dead.length && info.burnHash) {

      html += '<div style="font-size:7px;opacity:0.6;margin-top:4px;text-align:center">Burn tx: ' + info.burnHash.slice(0, 14) + '...</div>';

    }

    if (info.relayWarning) {

      html += '<div style="margin-top:10px;padding:6px;background:rgba(232,93,93,0.2);border:1px solid #e85d5d;color:#ffcf5c;font-size:7px;line-height:1.4">⚠ ' + info.relayWarning + '</div>';

    }

    html += '<button class="f12sr-close" onclick="var e=document.getElementById(\'f12-settle-result\');if(e)e.remove()">CLOSE</button>';

    div.innerHTML = html;

    // ── XP skaitliuko animacija: kiekvienas „+0 XP" virš sprite kyla iki uždirbto skaičiaus,
    //    o pasibaigus — jei unitas pakilo lygiu, paleidžiama level-up burst animacija. ──
    try {
      const labels = div.querySelectorAll('.f12sr-xpfloat[data-xp]');
      const COUNT_MS = 1100;
      const easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
      labels.forEach(function (el) {
        const target = parseInt(el.getAttribute('data-xp'), 10) || 0;
        const startDelay = (parseFloat(el.getAttribute('data-start')) || 0) * 1000 + 350;
        const unit = el.parentNode;
        const t0 = performance.now() + startDelay;
        if (target <= 0) {
          // 0 XP (free unit) — nieko neskaičiuojam; level-up vis tiek galimas teoriškai
          el.textContent = '+0 XP';
          if (el.getAttribute('data-lvup') === '1') {
            setTimeout(function () { _f12TriggerLvUp(unit); }, startDelay + 300);
          }
          return;
        }
        let lastTick = 0;
        function tick(now) {
          if (now < t0) { requestAnimationFrame(tick); return; }
          const t = Math.min(1, (now - t0) / COUNT_MS);
          const val = Math.round(target * easeOut(t));
          el.textContent = '+' + val + ' XP';
          // skaitliuko „tiksėjimo" pop'as (ribotai, kad neperkrautų)
          if (now - lastTick > 55) {
            lastTick = now;
            unit.classList.remove('popxp');
            void unit.offsetWidth;
            unit.classList.add('popxp');
            try { if (typeof SFX !== 'undefined' && SFX.play && t < 1) SFX.play(1200 + val * 0.4, 0.02, 0.015, 'square'); } catch (_) {}
          }
          if (t < 1) requestAnimationFrame(tick);
          else {
            el.textContent = '+' + target + ' XP';
            if (el.getAttribute('data-lvup') === '1') _f12TriggerLvUp(unit);
          }
        }
        requestAnimationFrame(tick);
      });
    } catch (_) {}

  }

  // Level-up burst ant vieno sprite (po XP skaičiavimo)
  function _f12TriggerLvUp(unit) {
    if (!unit) return;
    unit.classList.add('lvgo');
    const xpf = unit.querySelector('.f12sr-xpfloat');
    if (xpf) xpf.style.opacity = '0';   // XP skaičius užleidžia vietą „LEVEL UP!"
    try {
      if (typeof SFX !== 'undefined' && SFX.play) {
        SFX.play(880, 0.12, 0.10, 'square', 300);
        setTimeout(function () { SFX.play(1320, 0.16, 0.12, 'square', 400); }, 110);
      }
    } catch (_) {}
  }

  // Eksportas — gali būti pakviestas iš UI (pvz "End Battle" mygtuko)

  window._F12SettleBattle = function(won) { return _settleNftBattle(!!won); };

  function deactivate() {

    if (!active) return;

    // Sustabdom checkpoint loop.

    try { if (_f12CheckpointTimer) { clearInterval(_f12CheckpointTimer); _f12CheckpointTimer = null; } } catch (_) {}

    // Saugu — jei NFT mode buvo + dar nesettle'inta + neturėjo gameOver → settle dabar

    try {

      if (!_f12BattleSettled && window._f12NftBurnAuth) {

        _settleNftBattle(false);

      }

    } catch (e) { console.warn('[F12 deactivate settle] err', e); }

    active = false;

    _pickerOpen = false;

    cancelAnimationFrame(raf);

    if (canvas) canvas.style.display = 'none';

    // Reset pre-deck choice — naujas F12 entry vėl parodys modal'ą

    try { window._f12PreDeckChoice = null; } catch (_) {}

    document.removeEventListener('keydown', onKey, true);

    document.removeEventListener('keyup', onKeyUp, true);

    charging = false;

    // Edit mode — išjungiam ir paslepiam panelę išeinant iš F12

    _f12EditMode = false;

    if (_f12EditorPanel) _f12EditorPanel.style.display = 'none';

    try { _F12Music.stop(); } catch (_) {}

    // Atstatom garsą grįžtant į F11

    try {

      if (typeof BGM !== 'undefined' && BGM && BGM.master && BGM.master.gain && BGM._f12SavedGain !== undefined) {

        BGM.master.gain.value = BGM._f12SavedGain;

        delete BGM._f12SavedGain;

      }

    } catch (_) {}

    try { if (typeof playCurrentLevelBGM === 'function') playCurrentLevelBGM(); } catch (_) {}

  }

  function loop(tnow) {

    if (!active) return;

    // rAF planuojamas PIRMA — kad viena frame klaida NEUŽMUŠTŲ loop'o visam laikui

    // (anksčiau rAF buvo apačioj po render() → render klaida = amžinai juodas ekranas).

    raf = requestAnimationFrame(loop);

    const realDt = Math.min(tnow - lastTime, 100);

    lastTime = tnow;

    // B FIX: žingsnis apribotas iki 50ms — 2× režimas nebedvigubina dt iki nestabilumo.

    // (anksčiau dt galėjo siekti 200ms (2×100) → fizikos tunneling/NaN → tick error →

    //  visas frame nutrūkdavo prieš render() → „balls not loading" užšalimas 2× metu.)

    const dt = Math.min(realDt * _f12TimeScale, 50);

    _f12Clock += dt;                       // game clock advance (now() grąžina _f12Clock)

    const t = _f12Clock;

    // C FIX: TICK'ai atskirame try nuo render — net jei kuris tick'as meta klaidą,

    // render() VIS TIEK įvyksta → ekranas nebeužšąla (tik trumpas hiccup, ne freeze).

    try {

      tickEnemies(dt, t);

      _tickHarpoons(t);

      _tickShamanProj(t);

      _tickArrows(t);

      _tickSpirits(dt, t);

      _tickOhShitEvents(t);

      _tickPoison(t);

      _tickAsteroids(t);

      _tickTraps(t);

      _tickFrostReverse(t);

      // Pending merge attacks — fire'ina po delay (susijungimo animacijos pabaiga)

      for (let i = _f12PendingAttacks.length - 1; i >= 0; i--) {

        const pa = _f12PendingAttacks[i];

        if (t >= pa.runAt) {

          _triggerMergeAttack(pa.type, pa.value, pa.mx, pa.my, t);

          _f12PendingAttacks.splice(i, 1);

        }

      }

      tickPhysics(dt);

      _fadeMarks(dt);

    } catch (e) {

      if (!loop._errCount) loop._errCount = 0;

      if (loop._errCount < 5) { loop._errCount++; console.error('[F12 loop] TICK error (recovering):', e); }

    }

    // render VISADA — atskirai nuo tick'ų, kad tick klaida nebepaslėptų ekrano

    try {

      render(t);

    } catch (e2) {

      if (!loop._rerrCount) loop._rerrCount = 0;

      if (loop._rerrCount < 5) { loop._rerrCount++; console.error('[F12 loop] RENDER error (recovering):', e2); }

    }

  }

  function poll() {

    let cur = null;

    try { cur = S; } catch (_) {}

    if (cur && typeof cur === 'object') {

      const f = cur.floor;

      if (f === 12 && !active) activate();

      else if (f !== 12 && active) deactivate();

      // Cancel scenario — user X close'ino picker'į ir grižo į F10/F11.

      // Reset _pickerOpen kad next entry vėl atidarytų picker.

      else if (f !== 12 && _pickerOpen) _pickerOpen = false;

    }

  }

  setInterval(poll, 200);

  window.MergeFloor = { activate, deactivate, isActive: () => active };

  // Eksportas wallet-ui.js PEWPEW mygtuko ikonai/animacijai — tas pats sprite kaip žaidime

  window._F12 = window._F12 || {};

  window._F12.getBarrelSprite = _getBarrelSprite;

  window._F12.getPixelSphereSprite = _getPixelSphereSprite;     // tikras game ball sprite (5-band shaded)

  window._F12.TYPES = TYPES;

  window._F12.TYPE_COLOR = TYPE_COLOR;

  window._F12.pickRandomType = () => TYPES[Math.floor(Math.random() * TYPES.length)];

  function _safeS() { try { return S; } catch (_) { return null; } }

  window.gotoF12 = function () {

    const cur = _safeS();

    if (!cur) return console.warn('S nera dar inicializuotas (paspausk Adventure pirma)');

    cur.floor = 12;

    if (typeof initAdventure === 'function') initAdventure();

    if (typeof updateFloorNav === 'function') updateFloorNav();   // atnaujinam HUD label'ą (F12)

    return 'F12 Merge mode';

  };

  window.gotoF11 = function () {

    const cur = _safeS();

    if (!cur) return;

    cur.floor = 11;

    if (typeof initAdventure === 'function') initAdventure();

    if (typeof updateFloorNav === 'function') updateFloorNav();   // atnaujinam HUD label'ą (F11)

    return 'F11';

  };

  // gotoHome — naudojama kai HOME mygtukas paspaustas iš F12 (PewPew Room)

  window.gotoF10 = window.gotoHome = function () {

    const cur = _safeS();

    if (!cur) return;

    cur.floor = 10;

    if (typeof initAdventure === 'function') initAdventure();

    if (typeof updateFloorNav === 'function') updateFloorNav();

    return 'HOME';

  };

  document.addEventListener('keydown', function (e) {

    if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {

      e.preventDefault();

      const cur = _safeS();

      if (!cur) return;

      if (cur.floor === 12) window.gotoF11();

      else window.gotoF12();

    }

  }, true);

  // Po puslapio užkrovimo — pabandom išsiųsti bet kokias užstrigusias mirtis iš localStorage

  // (jei žaidėjas perkrovė po mirties ir nukrito į home page, NEįėjęs atgal į F12).

  // Keli bandymai su atidėjimu, kad spėtų užsikraut SupabaseSync/wallet.

  try {

    setTimeout(function () { try { _flushPendingDeaths(); } catch (_) {} }, 2500);

    setTimeout(function () { try { _flushPendingDeaths(); } catch (_) {} }, 8000);

  } catch (_) {}

})();

