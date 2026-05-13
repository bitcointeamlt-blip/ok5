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
          a.volume = 0.25;
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
          a.volume = 0.12;
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

  // ── BGM — crystal_mine.mp3 (HTML5 Audio, looping, tylesnis nei SFX) ──
  // Pakeičia procedural _F12Music. Tas pats public API: start() / stop() / active.
  const _F12Music = {
    active: false,
    audio: null,
    _ensure() {
      if (this.audio) return;
      this.audio = new Audio('crystal_mine.mp3');
      this.audio.loop = true;
      this.audio.volume = 0.04; // pritildinta — sėdi po SFX
      this.audio.preload = 'auto';
    },
    start() {
      this._ensure();
      this.active = true;
      // play() grąžina Promise — gali nepavykti jei AudioContext dar suspended
      const p = this.audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    },
    stop() {
      this.active = false;
      if (!this.audio) return;
      // Soft fade-out per ~250ms, paskui pause
      const a = this.audio;
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
          a.volume = 0.04; // restore'inam volume kitam start'ui
        }
      }, 25);
    },
  };
  window._F12Music = _F12Music;

  // ── Config ─────────────────────────────────────────────────────────
  const TYPES = ['arrow', 'shield', 'heart', 'leaf', 'star', 'crystal', 'shadow', 'pearl'];
  const TYPE_COLOR = {
    arrow:   { top: [255, 200, 110], front: [220, 150, 70],  right: [180, 110, 50], left: [120, 70, 30],  back: [80, 45, 18],  bot: [40, 22, 8],  glyph: '#3a1f08' },
    shield:  { top: [180, 230, 220], front: [110, 180, 175], right: [70, 140, 140], left: [40, 95, 100],  back: [25, 60, 65],  bot: [10, 28, 32], glyph: '#06262a' },
    heart:   { top: [255, 170, 180], front: [220, 90, 100],  right: [175, 55, 65],  left: [115, 30, 38],  back: [70, 14, 20],  bot: [30, 6, 10],  glyph: '#3a0a10' },
    leaf:    { top: [180, 230, 130], front: [110, 180, 75],  right: [70, 140, 50],  left: [40, 95, 30],   back: [20, 50, 15],  bot: [8, 25, 5],   glyph: '#0a200a' },
    star:    { top: [255, 240, 130], front: [235, 195, 70],  right: [190, 145, 40], left: [130, 90, 25],  back: [75, 50, 12],  bot: [35, 22, 5],  glyph: '#3a2a08' },
    crystal: { top: [220, 180, 255], front: [165, 110, 220], right: [115, 70, 170], left: [75, 45, 115],  back: [35, 20, 60],  bot: [12, 6, 22],  glyph: '#1a0a30' },
    shadow:  { top: [85, 85, 95],    front: [50, 50, 60],    right: [30, 30, 40],   left: [18, 18, 26],   back: [10, 10, 16],  bot: [4, 4, 8],    glyph: '#000008' },
    pearl:   { top: [255, 255, 255], front: [220, 220, 230], right: [175, 175, 190], left: [125, 125, 145], back: [80, 80, 100], bot: [40, 40, 55], glyph: '#1a1a25' },
  };

  // Combat — 6 lane'ai, retas spawn (maža priešų masė)
  const LANES = 6;
  const BASE_HP = 30;
  const ENEMY_SPAWN_MS = 9500;    // ~10 sekundžių tarp spawn'ų

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
  const FIRE_COOLDOWN_MS = 1100;     // reload — neleidžia spam'inti, kortos farm'inamos lėčiau
  const BASE_R = 17;             // mažesnis — atitinka preview ant patrankos
  const MAX_BLOCKS = 80;
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
  let _f12Harpoons = [];                       // {laneIdx, fromX, toX, target, dmg, born, duration}
  function _spawnLaneHarpoon(laneIdx, fromX, target, dmg, t) {
    _f12Harpoons.push({
      laneIdx, fromX, target, dmg,
      born: t, duration: 280,
    });
  }
  function _tickHarpoons(t) {
    for (let i = _f12Harpoons.length - 1; i >= 0; i--) {
      const h = _f12Harpoons[i];
      if (t - h.born >= h.duration) {
        if (h.target && !h.target.dead) {
          h.target.hp -= h.dmg;
          h.target.hitFlashUntil = t + 200;
          _spawnDmgPopup(h.laneIdx, h.target.x, h.dmg, t);
          if (h.target.hp <= 0) {
            h.target.dead = true; h.target.deathStartedAt = t;
            score += 5;
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
  function _spawnLaneShamanProj(laneIdx, fromX, target, dmg, t) {
    _f12ShamanProj.push({ laneIdx, fromX, target, dmg, born: t, duration: 380 });
  }
  function _tickShamanProj(t) {
    for (let i = _f12ShamanProj.length - 1; i >= 0; i--) {
      const p = _f12ShamanProj[i];
      if (t - p.born >= p.duration) {
        if (p.target && !p.target.dead) {
          p.target.hp -= p.dmg;
          p.target.hitFlashUntil = t + 200;
          _spawnDmgPopup(p.laneIdx, p.target.x, p.dmg, t);
          if (p.target.hp <= 0) { p.target.dead = true; p.target.deathStartedAt = t; score += 5; }
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
  function _spawnLaneArrow(laneIdx, fromX, target, dmg, t) {
    _f12Arrows.push({ laneIdx, fromX, target, dmg, born: t, duration: 250 });
  }
  function _tickArrows(t) {
    for (let i = _f12Arrows.length - 1; i >= 0; i--) {
      const ar = _f12Arrows[i];
      if (t - ar.born >= ar.duration) {
        if (ar.target && !ar.target.dead) {
          ar.target.hp -= ar.dmg;
          ar.target.hitFlashUntil = t + 200;
          _spawnDmgPopup(ar.laneIdx, ar.target.x, ar.dmg, t);
          if (ar.target.hp <= 0) { ar.target.dead = true; ar.target.deathStartedAt = t; score += 5; }
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
  const PLAYABLE_TYPES = ['skull', 'archer', 'shaman', 'harpoon_fish', 'tower', 'crossbow_tower', 'zip'];
  // Range = fraction of lane width. F11 skull = 1 cell (~3% lane), ranged units = 3-7 cells.
  const ALLY_STATS = {
    skull:          { hp: 8,  dmg: 2, speed: 0.012, attackCooldown: 900,  range: 0.04 },
    archer:         { hp: 5,  dmg: 3, speed: 0.014, attackCooldown: 1100, range: 0.22 },
    shaman:         { hp: 4,  dmg: 4, speed: 0.010, attackCooldown: 1300, range: 0.14 },
    harpoon_fish:   { hp: 7,  dmg: 3, speed: 0.011, attackCooldown: 1000, range: 0.20 },
    // STATIC towers — neina, stovi prie base ir šaudo
    tower:          { hp: 30, dmg: 4, speed: 0,     attackCooldown: 1400, range: 0.55, static: true },
    crossbow_tower: { hp: 35, dmg: 6, speed: 0,     attackCooldown: 1900, range: 0.75, static: true },
    zip:            { hp: 25, dmg: 8, speed: 0,     attackCooldown: 2800, range: 0.45, static: true },
  };
  const ENEMY_MELEE_RANGE = 0.04;
  // Tower sprite cache
  const _towerSpriteImg = new Image(); _towerSpriteImg.src = 'assets_tiny/Buildings_Tower.png';
  const _zipSpriteImg = new Image(); _zipSpriteImg.src = 'assets_tiny/Buildings_Zip.png';
  const _zipChargeImg2 = new Image(); _zipChargeImg2.src = 'assets_tiny/Buildings_Zip_Charge.png';
  const _ZIP_FRAMES = 8, _ZIP_FPS = 10;
  const _ZIP_CHARGE_FRAMES = 14, _ZIP_CHARGE_FPS = 10;
  const _ZIP_CHARGE_DUR = (_ZIP_CHARGE_FRAMES / _ZIP_CHARGE_FPS) * 1000;  // 1400ms
  // Lightning bolts iš zip tower'io
  let _f12ZipBolts = [];           // {laneIdx, sx, sy, ex, ey, born, life, seed}
  let deployPool = {};
  let selectedDeployType = null;
  let deployBtnRects = [];

  // Physics
  let blocks = [];
  let nextId = 1;
  let launcher = { x: 0, y: 0, angle: 0 };
  let nextBlock = null;
  let lastFireAt = 0;
  let charging = false;
  let chargeStartedAt = 0;

  // Generic
  let score = 0;
  let merges = 0;
  let layoutCache = null;
  let mouse = { x: 0, y: 0 };
  let exitBtnRect = null;
  let restartBtnRect = null;
  let gameOver = false;

  // ── Helpers ────────────────────────────────────────────────────────
  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rand(arr.length)]; }
  function now() { return performance.now(); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

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
    nextBlock = makeNextBlock();
    lanes = [];
    for (let i = 0; i < LANES; i++) lanes.push({ enemies: [], allies: [] });
    baseHp = BASE_HP;
    nextEnemyAt = now() + 1500;
    gameOver = false;
    selectedDeployType = null;
    deployPool = {};
    _f12Harpoons = [];
    _f12ShamanProj = [];
    _f12ShamanExpl = [];
    _f12Arrows = [];
    _f12ArrowImpacts = [];
    _f12ZipBolts = [];
    _f12Spirits = [];
    _f12CardDeck = {};
    _f12CardConsumes = [];
    _f12HpHealFx = null;
    _pendingCardDeploy = null;
    _draggedCard = null;
    _f12MergePopups = [];
    _f12MergeRings = [];
    _f12ScreenShake = 0;
    _f12LastMergeAt = 0;
    _f12ComboCount = 0;
    _f12ComboFlashAt = 0;
    _f12FireRecoil = 0;
    _f12MuzzleFlashes = [];
    _f12FireSmoke = [];
    _f12Wind = [];
    _f12Fog = [];
    _f12NextBossAt = now() + 50000;
    _f12NextHordeAt = now() + 30000;
    _f12Warnings = [];
    _f12GameStartT = now();
    _f12LaneStrikes = [];
    _f12PendingAttacks = [];
    _f12DmgPopups = [];
    _f12PoisonImpacts = [];
    _f12WallConvert = [];
    _f12Asteroids = [];
    // Užkraunam HOME treniruotus unit'us — pridedam stack count, ne 1 per snap
    try {
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
    } catch (_) {}
    // Restart išvalo smėlio žymes
    if (_marksCtx && _marksCanvas) {
      _marksCtx.clearRect(0, 0, _marksCanvas.width, _marksCanvas.height);
    }
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
      launcher: { x: padX + 60, y: arenaY + arenaH / 2 },
    };
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

    if (blocks.length >= MAX_BLOCKS) gameOver = true;
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
        score += newVal;
        merges++;
        // ── JUICE FEEDBACK ─────────────────────────────────────────────
        const tNow = now();
        const tier = Math.log2(newVal);  // 1=value2→2, 2=value4→4, 3=value8...
        // ── MERGE SOUND ────────────────────────────────────────────────
        _F12Audio.merge(tier);
        const colJ = TYPE_COLOR[a.type] || TYPE_COLOR.arrow;
        // 1) Screen shake — tier'iui proporcingas
        _f12ScreenShake = Math.max(_f12ScreenShake, 2 + tier * 1.5);
        // 2) "+N" score popup
        _f12MergePopups.push({
          text: '+' + newVal, x: mx, y: my, born: tNow,
          color: `rgb(${colJ.top[0]},${colJ.top[1]},${colJ.top[2]})`,
        });
        // 3) Per-type burst FX (kiekvienas tipas turi savo unikalią animaciją)
        _f12MergeRings.push({ x: mx, y: my, born: tNow, value: newVal, color: colJ, type: a.type });
        // 4) Combo counter — jei merge įvyko per 1.5s nuo paskutinio
        if (tNow - _f12LastMergeAt < 1500) {
          _f12ComboCount++;
          _f12ComboFlashAt = tNow;
        } else {
          _f12ComboCount = 1;
        }
        _f12LastMergeAt = tNow;
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
    if (toRemove.size === 0) return;
    blocks = blocks.filter((_, idx) => !toRemove.has(idx)).concat(toAdd);
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
    ctx.fillText('PASIRINK LANE (ESC NUTRAUKIA)', L.W / 2, L.H - 110);
  }

  // ── Enemies ────────────────────────────────────────────────────────
  function spawnAlly(utype, laneIdx, t) {
    const s = ALLY_STATS[utype] || ALLY_STATS.skull;
    // Static (towers) pradeda kairėj base zonoj, nejuda
    const startX = s.static ? 0.05 : 0.0;
    lanes[laneIdx].allies.push({
      utype, x: startX, _prevX: startX,
      static: !!s.static,
      hp: s.hp, maxHp: s.hp, dmg: s.dmg, speed: s.speed,
      attackCooldown: s.attackCooldown,
      range: s.range || 0.04,
      lastAttackAt: 0, hitFlashUntil: 0,
      dead: false, deathStartedAt: 0,
      bobPhase: Math.random() * Math.PI * 2,
      swingStart: 0,
      guardStart: 0,
      idleStart: 0, idleUntil: 0,
      nextThinkAt: t + 2000 + Math.random() * 2000,
    });
  }

  function spawnEnemy(t, opts) {
    opts = opts || {};
    const laneIdx = opts.lane !== undefined ? opts.lane : rand(LANES);
    const tier = Math.floor((t - _f12GameStartT) / 30000);
    const isBoss = !!opts.boss;
    lanes[laneIdx].enemies.push({
      x: 1.0,
      hp: isBoss ? (25 + tier * 4) : (6 + tier),
      maxHp: isBoss ? (25 + tier * 4) : (6 + tier),
      speed: isBoss ? 0.005 + Math.random() * 0.002 : 0.008 + Math.random() * 0.004,
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
    if (dmg <= 0) return;
    _f12DmgPopups.push({
      lane: laneIdx, x: enemyX, dmg, born: t,
      color: (opts && opts.color) || null,    // 'poison' tinted, etc
    });
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
      // Bounce-in scale (pirma 15%) — didesnė overshoot
      const scale = k < 0.04 ? 1 + (1 - k / 0.04) * 0.7 : 1;
      const fontSize = Math.round(18 * scale);
      ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      // Storus juodas outline (4 directions)
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.95})`;
      ctx.fillText('-' + p.dmg, sx - 2, sy);
      ctx.fillText('-' + p.dmg, sx + 2, sy);
      ctx.fillText('-' + p.dmg, sx, sy - 2);
      ctx.fillText('-' + p.dmg, sx, sy + 2);
      // Spalva: poison = žalia, big dmg = raudonas, normalus = geltonas
      let col;
      if (p.color === 'poison') col = `rgba(140,255,100,${alpha})`;
      else if (p.dmg >= 6) col = `rgba(255,80,60,${alpha})`;
      else col = `rgba(255,235,140,${alpha})`;
      ctx.fillStyle = col;
      ctx.fillText('-' + p.dmg, sx, sy);
    }
    ctx.restore();
  }

  // ── SUIKA → KOVA jungtis: kiekvienas merge daro veiksmą juostose
  // Tikslas: player'is jaučia, kad Suika žaidimas tiesiogiai veikia kovą
  function _triggerMergeAttack(type, value, mx, my, t) {
    // Surandam labiausiai grėsmingą lane (mažiausias x = arčiausia base)
    let bestLane = -1, bestX = Infinity, bestEnemy = null;
    for (let li = 0; li < lanes.length; li++) {
      for (const e of lanes[li].enemies) {
        if (e.dead || e._isWall) continue;
        if (e.x < bestX) { bestX = e.x; bestLane = li; bestEnemy = e; }
      }
    }
    const dmg = Math.max(2, Math.floor(value / 2));
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
    const isDamage = (type === 'arrow' || type === 'pearl' || type === 'crystal');
    if (isDamage && bestEnemy) {
      bestEnemy.hp -= dmg;
      bestEnemy.hitFlashUntil = t + 350;
      _F12Audio.damageHit(dmg);
      // ── ZAIBO TRENKSMO GARSAS — kartu su lightning bolt visual ──
      _F12Audio.zaibas(Math.log2(value));
      if (bestEnemy.hp <= 0) {
        bestEnemy.dead = true;
        bestEnemy.deathStartedAt = t;
        score += 5;
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
      bestEnemy.hp = 20;
      bestEnemy.maxHp = 20;
      bestEnemy.origSpeed = bestEnemy.speed;
      bestEnemy.speed = 0;
      bestEnemy.swingStart = 0;
      bestEnemy.idleStart = 0;
      bestEnemy.idleUntil = 0;
      // Brief stun aplink priešą
      bestEnemy.hitFlashUntil = t + 350;
      _f12WallConvert.push({
        lane: bestLane, x: bestEnemy.x, born: t, duration: 700,
      });
      _f12ScreenShake = Math.max(_f12ScreenShake, 4);
      return;
    }
    // Support types
    if (type === 'heart') {
      const healAmt = value >= 8 ? 2 : 1;
      const oldHp = baseHp;
      baseHp = Math.min(BASE_HP, baseHp + healAmt);
      // Heal visual on HP bar (green pulse)
      _f12LaneStrikes.push({
        lane: -1, x: 0, type: 'heart', born: t, duration: 800,
        healAmt: baseHp - oldHp, color: TYPE_COLOR.heart,
      });
      return;
    }
    if (type === 'shield') {
      if (bestLane >= 0) {
        for (const e of lanes[bestLane].enemies) {
          if (e.dead || e._isWall) continue;
          e.idleUntil = Math.max(e.idleUntil || 0, t + 1500);
        }
        _f12LaneStrikes.push({
          lane: bestLane, x: 0.5, type, born: t,
          duration: 1500, color: TYPE_COLOR[type],
        });
      }
      return;
    }
    if (type === 'leaf') {
      // LEAF: nuodai ant pirmojo priešo → 1 dmg kas 10s.
      if (bestEnemy) {
        bestEnemy._poisonStart = t;
        bestEnemy._poisonEnd = t + 120000;
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
              score += 5;
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
            score += 5;
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
      // Damage popup "-N" kyla aukštyn — didesnis su tier
      const dmgFloatY = eyScreenY - k * 40;
      const popupSize = Math.round(16 + tier * 3);
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.9})`;
      ctx.font = `bold ${popupSize}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('-' + s.dmg, exScreenX + 2, dmgFloatY + 2);
      ctx.fillStyle = `rgba(255,80,60,${alpha})`;
      ctx.fillText('-' + s.dmg, exScreenX, dmgFloatY);
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
      _f12NextBossAt = t + 45000 + Math.random() * 15000;
    }
    // HORDE — 3-5 priešai vienu metu per kelias juostas (warning užrašas pašalintas)
    if (t >= _f12NextHordeAt) {
      const hordeSize = 3 + Math.floor(Math.random() * 3);
      // Spawnina po 800ms
      setTimeout(() => {
        if (!active) return;
        for (let i = 0; i < hordeSize; i++) {
          const lane = rand(LANES);
          setTimeout(() => {
            if (active) spawnEnemy(now(), { lane });
          }, i * 200);
        }
      }, 800);
      _f12NextHordeAt = t + 30000 + Math.random() * 20000;
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
      spawnEnemy(t);
      nextEnemyAt = t + ENEMY_SPAWN_MS - Math.min(1500, t / 120);
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
            if (a.utype === 'harpoon_fish')         { _spawnLaneHarpoon(lIdx, a.x, a._projTarget, a.dmg, t); _F12Audio.harpun(); }
            else if (a.utype === 'shaman')          _spawnLaneShamanProj(lIdx, a.x, a._projTarget, a.dmg, t);
            else if (a.utype === 'archer')          { _spawnLaneArrow(lIdx, a.x, a._projTarget, a.dmg, t); _F12Audio.arrow(); }
            else if (a.utype === 'tower')           { _spawnLaneArrow(lIdx, a.x, a._projTarget, a.dmg, t); _F12Audio.arrow(); }
            else if (a.utype === 'crossbow_tower')  { _spawnLaneArrow(lIdx, a.x, a._projTarget, a.dmg, t); _F12Audio.arrow(); }
          }
          a._pendingProjAt = 0; a._projTarget = null; a._projLane = undefined;
        }
        // Zip charge fire — atskira logika (lightning, ne projectile)
        if (a._zipPendingFire && t >= a._zipPendingFire) {
          if (a._projTarget && !a._projTarget.dead) {
            const lIdx = (a._projLane !== undefined) ? a._projLane : li;
            // Damage instant
            a._projTarget.hp -= a.dmg;
            a._projTarget.hitFlashUntil = t + 200;
            _spawnDmgPopup((a._projLane !== undefined) ? a._projLane : li, a._projTarget.x, a.dmg, t);
            if (a._projTarget.hp <= 0) { a._projTarget.dead = true; a._projTarget.deathStartedAt = t; score += 5; }
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
            } else {
              target.hp -= a.dmg;
              target.hitFlashUntil = t + 200;
              _spawnDmgPopup(targetLaneIdx, target.x, a.dmg, t);
              if (target.hp <= 0) { target.dead = true; target.deathStartedAt = t; score += 5; }
            }
          }
          // Enemy counter — tik jei MELEE range (skull range, ne ranged)
          if (target && bestDist < ENEMY_MELEE_RANGE && t - (target.lastAttackAt || 0) > 1200) {
            a.hp -= 1;
            a.hitFlashUntil = t + 200;
            target.lastAttackAt = t;
            target.swingStart = t;
            if (a.hp <= 0) { a.dead = true; a.deathStartedAt = t; }
          }
        } else if (!isPaused && !a.static) {
          // Tik judantys unit'ai eina pirmyn (towers stovi)
          a.x += a.speed * (dt / 1000);
          if (a.x >= 1.0) { Ln.allies.splice(i, 1); continue; }
        }
      }
      for (let i = Ln.enemies.length - 1; i >= 0; i--) {
        const e = Ln.enemies[i];
        if (e.dead) {
          if (t - e.deathStartedAt > 1400) Ln.enemies.splice(i, 1);
          continue;
        }
        // ── State machine: walking | guarding | idling (F11-style timestamps)
        let _sheets1 = null; try { _sheets1 = skullAnimSheets; } catch (_) {}
        const _guardDur = _sheets1 && _sheets1.guard ? (_sheets1.guard.frameCount / 10) * 1000 : 700;
        const _guardElapsed = e.guardStart ? t - e.guardStart : Infinity;
        const isGuarding = _guardElapsed < _guardDur;
        const isIdling = !isGuarding && t < e.idleUntil;
        const isPaused = isGuarding || isIdling;
        if (!isPaused && t >= (e.nextThinkAt || 0)) {
          e.nextThinkAt = t + 1500 + Math.random() * 2500;
          const r = Math.random();
          if (r < 0.18) e.guardStart = t;
          else if (r < 0.40) { e.idleStart = t; e.idleUntil = t + 1500 + Math.random() * 1800; }
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
        const wallStopThresh = Math.max(0.005, 0.06 - 20 / _laneUsablePx);
        const blockedByWall = wallBlocker && wallDist < wallStopThresh;
        if (blockedByWall) {
          // Puola sieną
          if (t - (e.lastAttackAt || 0) > 1100) {
            e.lastAttackAt = t;
            e.swingStart = t;
            wallBlocker.hp -= 1;
            wallBlocker.hitFlashUntil = t + 200;
            _F12Audio.wallHit();
            _spawnDmgPopup(li, wallBlocker.x, 1, t);
            if (wallBlocker.hp <= 0) {
              wallBlocker.dead = true;
              wallBlocker.deathStartedAt = t;
              _F12Audio.wallCollapse();
            }
          }
          continue;
        }
        if (!isPaused && !inAllyMelee) {
          e.x -= e.speed * (dt / 1000);
        }
        if (e.x <= 0) {
          baseHp -= 3;
          Ln.enemies.splice(i, 1);
          if (baseHp <= 0) { baseHp = 0; gameOver = true; }
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
    if (t - lastFireAt < FIRE_COOLDOWN_MS) return;
    if (blocks.length >= MAX_BLOCKS) return;
    if (gameOver) return;
    lastFireAt = t;
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
    nextBlock = makeNextBlock();
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
    _drawAmbientFog(L, t);
    _drawAmbientWind(L, t);
    drawLanes(L, t);
    _drawLaneHarpoons(L, t);
    _drawLaneShamanProj(L, t);
    _drawLaneArrows(L, t);
    _drawZipBolts(L, t);
    drawArena(L);
    drawBlocks(L, t);
    drawLauncher(L, t);
    // drawPowerMeter pakeistas į pixel art ring drawLauncher viduje
    drawNextPreview(L, t);
    _drawCards(L, t);
    _drawCardConsumes(L, t);
    _drawSpirits(L, t);
    // Juice — fire feedback (po launcher, kad būtų ant viršaus)
    _drawFireSmoke(L, t);
    _drawMuzzleFlashes(L, t);
    // Juice — merge feedback (ringai, popups) prieš HUD
    _drawMergeRings(L, t);
    _drawMergePopups(L, t);
    _drawLaneStrikes(L, t);    // merge attack effects ant juostų
    _drawPoisonImpacts(L, t);  // nuodų uždėjimo / tick burst'ai
    _drawWallConvert(L, t);    // shadow → wall transformation burst
    _drawAsteroids(L, t);      // geltonas asteroidas kris ir cross damage
    _drawDmgPopups(L, t);      // dmg "-N" popups (visi šaltiniai)
    drawHud(L, t);
    drawDeployPanel(L, t);    // PASKUTINĖ — overlay layeryje virš visko
    _drawCriticalAlarm(L, t);
    _drawWarnings(L, t);
    // Combo flash — virš visko
    _drawComboFlash(L, t);
    if (gameOver) drawGameOver(L);
    // Atstatyti shake translate
    if (_shakeX !== 0 || _shakeY !== 0) ctx.restore();
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

  // ── AMBIENT ATMOSFERA: vėjas, rūkas, varnos ─────────────────────────
  function _drawAmbientWind(L, t) {
    const PX = 2;
    const dts = 0.016;
    // Spawn — 30% šansas per frame'ą, pradžioj prikaisom keliais particle'iais
    if (_f12Wind.length < 30 && Math.random() < 0.5) {
      const startEdge = Math.random();
      const _vx = -40 - Math.random() * 50;     // skrenda į kairę
      const _vy = -5 + Math.random() * 10;
      _f12Wind.push({
        x: L.W + 10,
        y: L.lanesY + Math.random() * (L.lanesH + L.arena.h * 0.3),
        vx: _vx, vy: _vy,
        size: PX * (1 + Math.floor(Math.random() * 2)),
        life: 0,
        maxLife: 3 + Math.random() * 3,
        col: Math.random() < 0.6
          ? [200, 180, 140]   // light dust
          : [140, 110, 80],   // dark dust
        alpha: 0.4 + Math.random() * 0.4,
      });
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = _f12Wind.length - 1; i >= 0; i--) {
      const w = _f12Wind[i];
      w.x += w.vx * dts;
      w.y += w.vy * dts;
      w.life += dts;
      if (w.x < -10 || w.life > w.maxLife) { _f12Wind.splice(i, 1); continue; }
      const fadeK = w.life / w.maxLife;
      const a = w.alpha * (1 - Math.abs(fadeK - 0.3) * 0.6);
      const px = Math.round(w.x / PX) * PX;
      const py = Math.round(w.y / PX) * PX;
      ctx.fillStyle = `rgba(${w.col[0]},${w.col[1]},${w.col[2]},${a})`;
      ctx.fillRect(px, py, w.size, w.size);
    }
    ctx.restore();
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

    // PASS 1 — dynamic overlay (shield aura + animated direction chevrons)
    const PX = PIXEL_SIZE;
    // PASS 2 — visi unit'ai (allies + enemies). Tower'iai gali peržengti į kitos lane'os plotą,
    // todėl nupiešus VISŲ background'ų pirma, tower'iai nebus apkarpomi sekančio lane fillRect'o.
    for (let i = 0; i < LANES; i++) {
      const ly = L.lanesY + i * L.laneH;
      const lh = L.laneH - 4;
      const lane = lanes[i];
      for (const a of lane.allies) {
        if (a.dead) continue;
        const ax = L.lanesX + baseW + (L.lanesW - baseW - 30) * a.x;
        const ay = ly + lh / 2;
        const sz = lh * 0.50;
        drawAlly(ax, ay, sz, a, t);
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
    let sheets = null;
    try { sheets = skullAnimSheets; } catch (_) {}
    if (!sheets) return null;
    const fpsMap = { idle: 7, run: 10, attack: 12, guard: 10 };
    const swingDur = (sheets.attack.frameCount / fpsMap.attack) * 1000;
    const guardDur = (sheets.guard.frameCount / fpsMap.guard) * 1000;
    const swingElapsed = u.swingStart ? t - u.swingStart : Infinity;
    const guardElapsed = u.guardStart ? t - u.guardStart : Infinity;
    let anim = 'idle';
    if (swingElapsed < swingDur) anim = 'attack';
    else if (guardElapsed < guardDur) anim = 'guard';
    else if (isMoving) anim = 'run';
    const sheet = sheets[anim];
    if (!sheet || !sheet.sheet || !sheet.sheet.complete || !sheet.sheet.naturalWidth) return null;
    const fps = fpsMap[anim];
    const frameCount = sheet.frameCount;
    let frameIdx;
    if (anim === 'attack') frameIdx = Math.min(frameCount - 1, Math.floor(swingElapsed / (1000 / fps)));
    else if (anim === 'guard') frameIdx = Math.min(frameCount - 1, Math.floor(guardElapsed / (1000 / fps)));
    else frameIdx = Math.floor((t + (u.bobPhase || 0) * 100) / (1000 / fps)) % frameCount;
    return { sheet: sheet.sheet, sx: frameIdx * 192, sy: 0, sw: 192, sh: 192, anim };
  }

  function drawAlly(cx, cy, sz, a, t) {
    if (a.dead) {
      // Pastatai (towers) — be death animacijos, tiesiog dingsta
      if (a.static) return;
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
    if (showHpBar) {
      const bw = sz * 1.2, bh = 3, barY = cy - sz * 1.0 - bh;
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(cx - bw / 2), Math.round(barY), Math.round(bw), bh);
      ctx.fillStyle = '#5cd06b';
      ctx.fillRect(Math.round(cx - bw / 2 + 1), Math.round(barY + 1), Math.round((bw - 2) * (a.hp / a.maxHp)), bh - 2);
    }
  }

  // Sienos sugriuvimas — chunky pixel bricks krenta su gravitacija + stone dust cloud
  function _drawWallCollapse(cx, cy, sz, e, elapsed) {
    const PX = 2;
    const snap = (v) => Math.round(v / PX) * PX;
    const DUR = 1200;
    const k = Math.min(1, elapsed / DUR);
    const wallW = snap(sz * 1.7);
    const wallH = snap(sz * 2.5);
    const wx = snap(cx - wallW / 2);
    const wy = snap(cy - wallH / 2);
    // Lazy-init brick fragments
    if (!e._collapseFragments) {
      e._collapseFragments = [];
      const brickH = PX * 5;
      const brickW = PX * 8;
      const rows = Math.floor(wallH / brickH);
      const wallSeed = Math.floor((e._wallStart || 0) * 0.001) % 100;
      for (let r = 0; r < rows; r++) {
        const rowOff = (r % 2) * (brickW / 2);
        for (let c = -1; c <= Math.ceil(wallW / brickW); c++) {
          const bxStart = wx + c * brickW + rowOff;
          const bx = Math.max(bxStart, wx);
          const bxEnd = Math.min(bxStart + brickW, wx + wallW);
          const bw = bxEnd - bx;
          if (bw <= 0) continue;
          const by = wy + r * brickH;
          const brickHash = (r * 17 + c * 31 + wallSeed) % 4;
          const stoneCols = ['#5a4a3a', '#624c3a', '#54422e', '#5a463a'];
          // Random velocity outward + upward initial pop
          const cxBrick = bx + bw / 2;
          const cyBrick = by + brickH / 2;
          const ang = Math.atan2(cyBrick - cy, cxBrick - cx);
          const sp = 80 + Math.random() * 120;
          e._collapseFragments.push({
            x: bx, y: by, w: bw, h: brickH,
            vx: Math.cos(ang) * sp + (Math.random() - 0.5) * 40,
            vy: Math.sin(ang) * sp - 180 - Math.random() * 80,
            rot: 0, rotV: (Math.random() - 0.5) * 8,
            col: stoneCols[brickHash],
          });
        }
      }
    }
    // Simulate gravity + draw
    const dts = 0.016;
    const G = 800;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const f of e._collapseFragments) {
      f.x += f.vx * dts;
      f.y += f.vy * dts;
      f.vy += G * dts;
      f.rot += f.rotV * dts;
      const alpha = 1 - k;
      ctx.globalAlpha = alpha;
      // Body
      ctx.fillStyle = f.col;
      ctx.fillRect(snap(f.x), snap(f.y), f.w, f.h);
      // Top highlight
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(snap(f.x), snap(f.y), f.w, PX);
      // Dark bottom edge
      ctx.fillStyle = '#1a0e06';
      ctx.fillRect(snap(f.x), snap(f.y) + f.h - PX, f.w, PX);
    }
    // Dust cloud (chunky pixel particles aplink kritimo vietą)
    ctx.globalAlpha = 1 - k;
    const dustSeed = Math.floor((e._wallStart || 0) * 0.0007) % 100;
    for (let p = 0; p < 12; p++) {
      const ang = ((dustSeed + p * 7) * 137 % 100) / 100 * Math.PI * 2;
      const rFrac = ((dustSeed * 3 + p * 11) % 100) / 100;
      const dist = (15 + k * 35) * (0.4 + rFrac * 0.6);
      const dx = snap(cx + Math.cos(ang) * dist);
      const dy = snap(cy + wallH * 0.3 + Math.sin(ang) * dist * 0.5 + k * 10);
      const psize = PX * (1 + Math.floor(rFrac * 2));
      ctx.fillStyle = `rgba(140,120,100,${(1 - k) * 0.7})`;
      ctx.fillRect(dx, dy, psize, psize);
      ctx.fillStyle = `rgba(180,160,130,${(1 - k) * 0.5})`;
      ctx.fillRect(dx, dy, psize / 2, psize / 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawEnemy(cx, cy, sz, e, t) {
    if (e.dead) {
      // Wall'as turi savo sugriuvimo animaciją (ne skull death anim)
      if (e._isWall) {
        _drawWallCollapse(cx, cy, sz, e, t - e.deathStartedAt);
        return;
      }
      _drawDeathAnim(cx, cy, sz, t - e.deathStartedAt);
      return;
    }
    const flash = t < e.hitFlashUntil;
    // WALL — gražus pixel art castle siena su crenelations, brick variation, ir rise-up spawn
    if (e._isWall) {
      const PX = 2;
      const snap = (v) => Math.round(v / PX) * PX;
      const wallW = snap(sz * 1.7);
      const wallH = snap(sz * 2.5);
      const wx = snap(cx - wallW / 2);
      const wyFinal = snap(cy - wallH / 2);
      const dmgFrac = 1 - (e.hp / e.maxHp);
      // Spawn rise-up animation (pirmiems 600ms — siena kyla iš žemės)
      const sinceSpawn = t - (e._wallStart || t);
      const SPAWN_DUR = 600;
      const spawnK = Math.min(1, sinceSpawn / SPAWN_DUR);
      const spawnEased = 1 - Math.pow(1 - spawnK, 3);
      const wy = snap(wyFinal + wallH * (1 - spawnEased));   // pradžioj žemiau, kyla aukštyn
      // Clipping window — sienos viršus nematomas spawn'inant (iškyla iš žemės)
      ctx.save();
      ctx.beginPath();
      ctx.rect(wx - PX*4, wyFinal, wallW + PX*8, wallH + 4);
      ctx.clip();
      // ── Outer black outline (full silhouette)
      ctx.fillStyle = '#000';
      ctx.fillRect(wx - PX, wy - PX, wallW + PX*2, wallH + PX*2);
      // ── Crenelations (battlements) — 3-4 kvadratiniai zubrai viršuje
      const merlonsN = 4;
      const merlonW = Math.floor(wallW / merlonsN / PX) * PX;
      const merlonH = PX * 4;
      for (let m = 0; m < merlonsN; m++) {
        if (m % 2 === 1) continue;   // tik kas antras = nišės
        const mx = wx + m * merlonW;
        ctx.fillStyle = '#000';
        ctx.fillRect(mx - PX, wy - merlonH, merlonW + PX*2, merlonH + PX);
        ctx.fillStyle = '#5a4a3a';
        ctx.fillRect(mx, wy - merlonH + PX, merlonW, merlonH - PX);
        ctx.fillStyle = '#8a7a6a';
        ctx.fillRect(mx, wy - merlonH + PX, merlonW, PX);
      }
      // ── Stone bricks su variation pagal seed
      const brickH = PX * 5;
      const brickW = PX * 8;
      const rows = Math.floor(wallH / brickH);
      const wallSeed = Math.floor((e._wallStart || 0) * 0.001) % 100;
      for (let r = 0; r < rows; r++) {
        const rowOff = (r % 2) * (brickW / 2);
        for (let c = -1; c <= Math.ceil(wallW / brickW); c++) {
          const bxStart = wx + c * brickW + rowOff;
          const bx = Math.max(bxStart, wx);
          const bxEnd = Math.min(bxStart + brickW, wx + wallW);
          const bw = bxEnd - bx;
          if (bw <= 0) continue;
          const by = wy + r * brickH;
          // Per-brick color variation
          const brickHash = (r * 17 + c * 31 + wallSeed) % 4;
          const stoneCols = ['#5a4a3a', '#624c3a', '#54422e', '#5a463a'];
          ctx.fillStyle = stoneCols[brickHash];
          ctx.fillRect(bx, by, bw, brickH);
          // Top edge highlight (per-brick variation)
          ctx.fillStyle = brickHash < 2 ? '#9a8a78' : '#8a7868';
          ctx.fillRect(bx, by, bw, PX);
          // Brick texture — random 1-pixel dot
          if (brickHash === 0) {
            ctx.fillStyle = '#7a6a58';
            ctx.fillRect(bx + Math.floor(bw / 2 / PX) * PX, by + PX*2, PX, PX);
          } else if (brickHash === 2) {
            ctx.fillStyle = '#3a2a1a';
            ctx.fillRect(bx + Math.floor(bw / 3 / PX) * PX, by + PX*3, PX, PX);
          }
          // Bottom shadow
          ctx.fillStyle = '#2a1a0e';
          ctx.fillRect(bx, by + brickH - PX, bw, PX);
          // Mortar (vertical gap)
          ctx.fillStyle = '#1a0e06';
          if (bxEnd < wx + wallW) {
            ctx.fillRect(bxEnd - PX, by, PX, brickH);
          }
        }
        // Horizontal mortar
        ctx.fillStyle = '#1a0e06';
        ctx.fillRect(wx, wy + r * brickH + brickH - PX, wallW, PX);
      }
      // ── Iron rivets — dekoraciniai kniedės kampuose
      const rivCols = ['#1a0e06', '#7a6a58', '#ffe7a8'];
      const drawRivet = (rx, ry) => {
        ctx.fillStyle = rivCols[0];
        ctx.fillRect(rx - PX, ry - PX, PX*3, PX*3);
        ctx.fillStyle = rivCols[1];
        ctx.fillRect(rx, ry, PX, PX);
        ctx.fillStyle = rivCols[2];
        ctx.fillRect(rx, ry, PX/2, PX/2);
      };
      drawRivet(snap(wx + PX*3), snap(wy + PX*5));
      drawRivet(snap(wx + wallW - PX*4), snap(wy + PX*5));
      drawRivet(snap(wx + PX*3), snap(wy + wallH - PX*6));
      drawRivet(snap(wx + wallW - PX*4), snap(wy + wallH - PX*6));
      // ── Cracks su damage progression
      if (dmgFrac > 0.25) {
        ctx.fillStyle = '#1a0e06';
        const numCracks = Math.min(6, Math.floor(dmgFrac * 8));
        for (let cr = 0; cr < numCracks; cr++) {
          const cseed = ((cr * 31 + wallSeed * 11) % 100) / 100;
          const cseed2 = ((cr * 17 + wallSeed * 7 + 3) % 100) / 100;
          const cxn = snap(wx + PX*3 + cseed * (wallW - PX*6));
          const cyn = snap(wy + PX*3 + cseed2 * (wallH - PX*6));
          // Zigzag crack pattern
          ctx.fillRect(cxn, cyn, PX, PX*5);
          ctx.fillRect(cxn - PX, cyn + PX*2, PX, PX);
          ctx.fillRect(cxn + PX, cyn + PX*3, PX, PX);
        }
      }
      // Dust at base (continuous while alive)
      if (sinceSpawn < 1500) {
        const dustK = Math.min(1, sinceSpawn / 1500);
        ctx.fillStyle = `rgba(120,100,80,${(1 - dustK) * 0.6})`;
        for (let p = 0; p < 5; p++) {
          const dx = snap(wx + (p / 4) * wallW + Math.sin(t * 0.002 + p) * PX*2);
          const dy = snap(wyFinal + wallH - PX*2);
          ctx.fillRect(dx, dy, PX*2, PX);
        }
      }
      // Hit flash
      if (flash) {
        ctx.fillStyle = 'rgba(255,255,200,0.55)';
        ctx.fillRect(wx, wy, wallW, wallH);
      }
      ctx.restore();
      // ── HP bar virš sienos
      const bw2 = wallW * 0.85, bh2 = 5;
      const barY2 = wyFinal - bh2 - PX*2;
      ctx.fillStyle = '#000';
      ctx.fillRect(snap(cx - bw2 / 2), snap(barY2), snap(bw2), bh2);
      ctx.fillStyle = '#2a1a0e';
      ctx.fillRect(snap(cx - bw2 / 2 + 1), snap(barY2 + 1), Math.round(bw2 - 2), bh2 - 2);
      // Pilka (stone) bar
      const hpPct = e.hp / e.maxHp;
      const fillW = Math.round((bw2 - 2) * hpPct);
      ctx.fillStyle = hpPct > 0.5 ? '#c0c0c0' : (hpPct > 0.25 ? '#c0a070' : '#a04040');
      ctx.fillRect(snap(cx - bw2 / 2 + 1), snap(barY2 + 1), fillW, bh2 - 2);
      // Highlight ant bar
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(snap(cx - bw2 / 2 + 1), snap(barY2 + 1), fillW, PX/2);
      return;
    }
    const fade = 1;
    // Movement check — žemesnis slenkstis kad detect'intų ir bossą (kuris lėtas)
    const isMovingE = e.x > 0 && e.x < 1.0 && t >= e.idleUntil && Math.abs((e._prevX ?? e.x) - e.x) > 0.00002;
    const frameE = _pickSkullAnim(e, t, isMovingE);
    e._prevX = e.x;
    if (frameE) {
      // Boss enemy — didesnis sprite + raudonas tint
      const sizeMult = e.isBoss ? 1.6 : 1.0;
      const dw = sz * 4.5 * sizeMult, dh = sz * 4.5 * sizeMult;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.imageSmoothingEnabled = false;
      if (flash) ctx.filter = 'brightness(1.5) sepia(1) saturate(2.5) hue-rotate(-30deg)';
      else if (e.isBoss) ctx.filter = 'brightness(0.85) sepia(0.5) saturate(2) hue-rotate(-25deg)';
      // Priešai juda į kairę → flip horizontally
      ctx.translate(cx, cy);
      ctx.scale(-1, 1);
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
    // HP bar (fixed virš skull) — boss'as be bar (jis ir taip aiškiai matosi)
    if (!e.dead && !e.isBoss) {
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
  // Ambient atmosphere
  let _f12Wind = [];                    // dust/leaves [{x,y,vx,vy,size,life,maxLife,col}]
  let _f12Fog = [];                     // [{x,y,vx,r,alpha,phase}]
  // OH SHIT eventai
  let _f12NextBossAt = 50000;           // pirmas boss ~50s nuo start
  let _f12NextHordeAt = 30000;          // pirma horde ~30s nuo start
  let _f12Warnings = [];                // [{text, color, born, duration}]
  let _f12GameStartT = 0;               // pirmas tick'as kai t pradedamas matuoti
  let _f12LaneStrikes = [];             // [{lane, x, type, born, duration, dmg/healAmt, color}]
  let _f12PendingAttacks = [];          // [{type, value, mx, my, runAt}] — delayed merge attacks
  let _f12DmgPopups = [];               // [{lane, x, dmg, born}] — bendri damage popups
  let _f12PoisonImpacts = [];           // [{lane, x, born, duration, isApply, isSpread}]
  let _f12WallConvert = [];             // [{lane, x, born, duration}] — shadow conversion burst
  let _f12Asteroids = [];               // [{lane, x, born, duration, dmg, value, impacted?}]
  const _SPIRIT_DURATION = 850;
  const _CARD_CONSUME_DUR = 520;
  const _CARD_W = 68, _CARD_H = 96, _CARD_GAP = 8;

  function _spawnMergeSpirit(srcX, srcY, type, value, t) {
    _f12Spirits.push({ sx: srcX, sy: srcY, type, value, born: t, duration: _SPIRIT_DURATION });
  }

  function _getCardLayout(L) {
    // Sort types by global TYPES order — consistent layout
    const presentTypes = Object.keys(_f12CardDeck).filter(k => _f12CardDeck[k].count > 0);
    const incomingTypes = _f12Spirits.map(s => s.type);
    const allTypes = Array.from(new Set([...presentTypes, ...incomingTypes]))
      .sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b));
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
        // Increment card deck
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
    const presentTypes = layout.allTypes.filter(tp => _f12CardDeck[tp] && _f12CardDeck[tp].count > 0);
    if (presentTypes.length === 0) return;
    // Hover detection — kuri korta po pele
    let hoverIdx = -1;
    cardHoverRects = [];
    for (let i = 0; i < layout.allTypes.length; i++) {
      const tp = layout.allTypes[i];
      const card = _f12CardDeck[tp];
      if (!card || card.count === 0) continue;
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
      // ── L4: pixel art glyph centre — type ikonine forma
      if (isFrontCard) {
        const gx = cx2 + cw / 2;
        const gy = cy2 + chh / 2;
        _drawCardGlyph(gx, gy, type, dark, '#000');
      }
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
      if (!card || card.count === 0) continue;
      const baseCx = layout.startX + i * (_CARD_W + _CARD_GAP);
      const baseCy = layout.cardY;
      const isHovered = hoverIdx === i;
      const hoverLift = isHovered ? -10 : 0;
      const col = TYPE_COLOR[tp] || TYPE_COLOR.arrow;

      // ── STACK BACKGROUND CARDS — max 2 behind (3 total su pagrindine korta).
      // Nuo 4-tos kortos rodom ×N badge vietoj papildomo stack'o.
      const stackBehind = Math.min(2, card.count - 1);
      for (let s = stackBehind; s >= 1; s--) {
        const offX = s * 3;
        const offY = -s * 4;
        _drawCardLayer(baseCx + offX, baseCy + hoverLift + offY, col, -22 * s, false, tp);
      }

      // ── MAIN (front) card — su bounce-in animacija kai naujai spawn'inta
      const elapsedSpawn = t - (card.lastIncAt || 0);
      let bounceY = 0, bounceScale = 1;
      if (elapsedSpawn < 600) {
        const bk = elapsedSpawn / 600;
        // Bounce-in: peak overshoot at 0.3, settle by 1.0
        if (bk < 0.3) {
          const sk = bk / 0.3;
          bounceScale = 0.6 + sk * 0.55;     // 0.6 → 1.15
          bounceY = -20 * (1 - sk);
        } else {
          const sk = (bk - 0.3) / 0.7;
          bounceScale = 1.15 - sk * 0.04;    // 1.15 → 1.0
        }
      }
      const cx = baseCx;
      const cy = baseCy + hoverLift + bounceY;
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

      // Hover glow — gold outer outline
      if (isHovered) {
        ctx.strokeStyle = `rgba(255,235,170,${0.7 + 0.3 * Math.sin(t * 0.008)})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 1, cy - 1, _CARD_W + 2, _CARD_H + 2);
      }

      // Count ×N — rodom virš kortos kai kartojasi (count >= 2), be rėmelių
      if (card.count >= 2) {
        ctx.fillStyle = '#ffe7a8';
        ctx.font = 'bold 10px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('×' + card.count, cx + _CARD_W / 2, cy - 6);
      }

      // Spawn flash — pixel art chunky burst
      const elapsed = t - (card.lastIncAt || 0);
      if (elapsed < 500) {
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

    // Base fill
    oc.fillStyle = DIRT.base;
    oc.fillRect(INNER_X, INNER_Y, INNER_W, INNER_H);

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

  function drawLauncher(L, t) {
    const lx = L.launcher.x, ly = L.launcher.y;
    const ang = launcher.angle;
    const PX = 2;
    const snap = (v) => Math.round(v / PX) * PX;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // ── PEDESTALO BAZĖ — chunky pixel art akmens base'as ────────────
    // Outer akmens žiedas
    const baseR = 32;
    for (let dy = -baseR; dy <= baseR; dy += PX) {
      for (let dx = -baseR; dx <= baseR; dx += PX) {
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d > baseR) continue;
        // Spinguliuojantis pixel hash — akmens tekstūra
        const hsh = ((dx * 73 + dy * 137) >>> 0) % 100;
        let c;
        if (d > baseR - PX*2) {
          c = '#1a0e06';   // outer black ring
        } else if (d > baseR - PX*4) {
          c = '#2a1810';   // dark stone edge
        } else {
          // Stone fill — variations
          if (hsh < 10) c = '#5a3820';        // light stone
          else if (hsh < 25) c = '#3a2410';   // mid stone
          else if (hsh < 50) c = '#4a2e18';   // base stone
          else c = '#42281a';                 // alt stone
        }
        ctx.fillStyle = c;
        ctx.fillRect(snap(lx + dx), snap(ly + dy), PX, PX);
      }
    }
    // Top highlight crescent (light-source top-left)
    for (let dy = -baseR + PX*2; dy <= -baseR + PX*8; dy += PX) {
      const halfW = Math.sqrt(Math.max(0, (baseR - PX*2) * (baseR - PX*2) - dy * dy));
      for (let dx = -halfW; dx <= halfW; dx += PX) {
        if (dx > 0 && dx > halfW * 0.4) continue;  // only top-left
        ctx.fillStyle = 'rgba(255,200,140,0.18)';
        ctx.fillRect(snap(lx + dx), snap(ly + dy), PX, PX);
      }
    }
    // 4 cardinal iron studs (rivets) ant pedestalo
    const rivetD = baseR - PX*4;
    const rivets = [[0, -rivetD], [rivetD, 0], [0, rivetD], [-rivetD, 0]];
    for (const [rdx, rdy] of rivets) {
      const rx = snap(lx + rdx), ry = snap(ly + rdy);
      ctx.fillStyle = '#1a0e06';
      ctx.fillRect(rx - PX*2, ry - PX*2, PX*4, PX*4);
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(rx - PX, ry - PX, PX*2, PX*2);
      ctx.fillStyle = '#ffe7a8';
      ctx.fillRect(rx - PX, ry - PX, PX, PX);
    }
    // ── PATRANKA — chunky pixel art barrel ──────────────────────────
    if (_f12FireRecoil > 0.1) _f12FireRecoil *= 0.78;
    const recX = -Math.cos(_f12FireRecoilAng) * _f12FireRecoil;
    const recY = -Math.sin(_f12FireRecoilAng) * _f12FireRecoil;
    ctx.save();
    ctx.translate(lx + recX, ly + recY);
    ctx.rotate(ang);
    // Iron palette
    const ironDark = '#0a0608';
    const ironMid = '#3a2c2c';
    const ironLight = '#6a5a5a';
    const ironHighlight = '#a8a0a0';
    const brass = '#a87830';
    const brassLight = '#e8b85a';
    // Barrel ribbed sections (3 zonos): rear chamber, mid, muzzle
    // Rear chamber (storesnė pradžia)
    ctx.fillStyle = ironDark;
    ctx.fillRect(-4, -14, 16, 28);
    ctx.fillStyle = ironMid;
    ctx.fillRect(-2, -12, 14, 24);
    ctx.fillStyle = ironLight;
    ctx.fillRect(-2, -12, 14, 4);    // top highlight strip
    ctx.fillStyle = '#1a0e0e';
    ctx.fillRect(-2, 8, 14, 4);      // bottom shadow
    // Main barrel (mid section) — ilgesnis, plonesnis
    ctx.fillStyle = ironDark;
    ctx.fillRect(12, -10, 22, 20);
    ctx.fillStyle = ironMid;
    ctx.fillRect(12, -8, 22, 16);
    ctx.fillStyle = ironLight;
    ctx.fillRect(12, -8, 22, 3);
    ctx.fillStyle = ironHighlight;
    ctx.fillRect(12, -7, 22, 1);
    ctx.fillStyle = '#1a0e0e';
    ctx.fillRect(12, 6, 22, 2);
    // Brass bands (iron rings) — 3 bands per barrel
    const bandPositions = [10, 20, 30];
    for (const bx of bandPositions) {
      ctx.fillStyle = brass;
      ctx.fillRect(bx, -13, 4, 26);
      ctx.fillStyle = brassLight;
      ctx.fillRect(bx, -13, 4, 3);
      ctx.fillStyle = '#6a4818';
      ctx.fillRect(bx, 10, 4, 3);
      // Pixel highlight on band
      ctx.fillStyle = '#fff5c0';
      ctx.fillRect(bx + 1, -12, 1, 1);
    }
    // Muzzle (snapo galas) — flared brass ring + dark hole
    ctx.fillStyle = brass;
    ctx.fillRect(34, -14, 6, 28);
    ctx.fillStyle = brassLight;
    ctx.fillRect(34, -14, 6, 3);
    ctx.fillStyle = '#6a4818';
    ctx.fillRect(34, 11, 6, 3);
    // Outer rim highlight pixels
    ctx.fillStyle = '#fff5c0';
    ctx.fillRect(34, -14, 2, 1);
    ctx.fillRect(38, -14, 2, 1);
    // Dark muzzle hole (kamuoliuko išėjimo skylė)
    ctx.fillStyle = '#000';
    ctx.fillRect(38, -8, 4, 16);
    ctx.fillStyle = '#1a0e0e';
    ctx.fillRect(38, -8, 1, 16);
    // Touch hole at rear (užtaiso anga)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, -3, 3, 6);
    ctx.restore();
    // Kitas blokas matomas patrankoj — tas pats dydis kaip arenoje
    const r = radiusForValue(nextBlock.value);
    // Cooldown — kai reload'inasi, ball preview blanks + chunky pixel ring rodo progresą
    const cdElapsed = t - lastFireAt;
    const reloading = cdElapsed < FIRE_COOLDOWN_MS;
    if (reloading) {
      // Tamsus pedestalo overlay (chunky pixel — be smooth arc)
      const ovR = 24;
      for (let dy = -ovR; dy <= ovR; dy += PX) {
        for (let dx = -ovR; dx <= ovR; dx += PX) {
          if (dx*dx + dy*dy > ovR*ovR) continue;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(snap(lx + dx), snap(ly + dy), PX, PX);
        }
      }
      // "RELOAD" pixel art tekstas centre — pulse'inantis
      ctx.fillStyle = `rgba(0,0,0,0.85)`;
      ctx.font = 'bold 7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('RELOAD', lx + 1, ly + 3);
      ctx.fillStyle = `rgba(255,210,120,${0.75 + 0.25 * Math.sin(t * 0.012)})`;
      ctx.fillText('RELOAD', lx, ly + 2);
    } else {
      drawSphere(ctx, lx, ly, r, 0, 0, nextBlock.type, nextBlock.value, 0.2 + 0.2 * Math.sin(t * 0.005));
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
    const types = Object.keys(deployPool).filter(k => deployPool[k] > 0);
    if (types.length === 0) return;
    const panelH = 56;
    const panelW = Math.min(L.W - 240, types.length * 70 + 20);
    const panelX = 16;
    const panelY = L.H - panelH - 50;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#7a5a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

    const cardW = 64, cardH = 46;
    let cx = panelX + 10;
    for (const utype of types) {
      const cnt = deployPool[utype];
      const isSelected = utype === selectedDeployType;
      ctx.fillStyle = isSelected ? '#3a5a2e' : '#2a1808';
      ctx.fillRect(cx, panelY + 5, cardW, cardH);
      ctx.strokeStyle = isSelected ? '#7aff8a' : '#5a3a20';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(cx + 0.5, panelY + 5.5, cardW - 1, cardH - 1);
      let sheets = null;
      try { sheets = skullAnimSheets; } catch (_) {}
      const sheetObj = sheets && sheets.idle;
      if (sheetObj && sheetObj.sheet && sheetObj.sheet.complete && sheetObj.sheet.naturalWidth > 0) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.filter = 'sepia(1) saturate(3) hue-rotate(160deg) brightness(0.9)';
        const idx = Math.floor(t / 140) % sheetObj.frameCount;
        ctx.drawImage(sheetObj.sheet, idx * 192, 0, 192, 192, cx + 4, panelY + 8, 32, 32);
        ctx.restore();
      }
      ctx.fillStyle = '#ffe7a8';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(utype.substr(0, 5).toUpperCase(), cx + 38, panelY + 22);
      ctx.fillStyle = '#fff';
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.fillText('×' + cnt, cx + 38, panelY + 42);
      deployBtnRects.push({ x: cx, y: panelY + 5, w: cardW, h: cardH, utype, cnt });
      cx += cardW + 6;
    }
  }

  function drawHud(L, t) {
    // ── BASE HP — vertikalus castle banner kairėj, prie priešų išėjimo vietos ──
    const PX = 2;
    const hpW = 26;                          // siauras vertikalus
    const hpH = L.lanesH;                    // visas lane plotis
    const hpX = 10;
    const hpY = L.lanesY;
    hpBarRect = { x: hpX, y: hpY, w: hpW, h: hpH };
    const hpFrac = Math.max(0, baseHp / BASE_HP);
    const danger = hpFrac < 0.04;
    const pulse = danger ? (0.85 + 0.04 * Math.sin(t * 0.012)) : 1;
    // Outer black outline
    ctx.fillStyle = '#000';
    ctx.fillRect(hpX, hpY, hpW, hpH);
    // Cut corners
    ctx.clearRect(hpX, hpY, PX, PX);
    ctx.clearRect(hpX + hpW - PX, hpY, PX, PX);
    ctx.clearRect(hpX, hpY + hpH - PX, PX, PX);
    ctx.clearRect(hpX + hpW - PX, hpY + hpH - PX, PX, PX);
    // Wood frame
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(hpX + PX, hpY + PX, hpW - PX*2, hpH - PX*2);
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(hpX + PX*2, hpY + PX*2, hpW - PX*4, hpH - PX*4);
    // Highlight left edge
    ctx.fillStyle = 'rgba(255,200,140,0.04)';
    ctx.fillRect(hpX + PX*2, hpY + PX*2, PX, hpH - PX*4);
    // Shadow right edge
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.fillRect(hpX + hpW - PX*3, hpY + PX*2, PX, hpH - PX*4);
    // ── Crown ikona viršuje ──────────────────────────────────────────
    const crown = [
      "1010101",
      "1111111",
      "1111111",
      "0111110",
    ];
    const crH = crown.length * PX;
    const crX = hpX + Math.round((hpW - crown[0].length * PX) / 2 / PX) * PX;
    const crY = hpY + PX*3;
    ctx.fillStyle = '#ffcf5c';
    for (let row = 0; row < crown.length; row++) {
      for (let cx = 0; cx < crown[row].length; cx++) {
        if (crown[row][cx] === '1') {
          ctx.fillRect(crX + cx * PX, crY + row * PX, PX, PX);
        }
      }
    }
    // Crown highlight pixels
    ctx.fillStyle = '#fff5c0';
    ctx.fillRect(crX + PX, crY, PX, PX);
    ctx.fillRect(crX + PX*5, crY, PX, PX);
    // ── HP bar slot (vertikalus, po karūna, virš heart) ─────────────
    const barX = hpX + PX*3;
    const barY = crY + crH + PX*2;
    const barW = hpW - PX*6;
    const barH = hpH - (barY - hpY) - PX*8;   // palieka vietos heart apačioje
    // Bar BG (dark slot)
    ctx.fillStyle = '#1a0a04';
    ctx.fillRect(barX, barY, barW, barH);
    // Chunky 2px segmentai — fill iš apačios į viršų (bottom-up)
    const segH = PX*2;
    const totalSegs = Math.floor(barH / segH);
    const filledSegs = Math.round(totalSegs * hpFrac);
    let cR, cG, cB;
    if (hpFrac > 0.6) { cR = 80; cG = 220; cB = 90; }
    else if (hpFrac > 0.3) { cR = 240; cG = 200; cB = 60; }
    else { cR = 230; cG = 70; cB = 70; }
    for (let i = 0; i < filledSegs; i++) {
      // bottom-up
      const sy = barY + barH - (i + 1) * segH;
      ctx.fillStyle = `rgb(${cR},${cG},${cB})`;
      ctx.fillRect(barX, sy, barW, segH - PX);
      // Left highlight
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(barX, sy, PX, segH - PX);
      // Right shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(barX + barW - PX, sy, PX, segH - PX);
    }
    // ── Heart ikona po HP baro ──────────────────────────────────────
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
    ctx.fillStyle = danger ? `rgba(255,80,90,${pulse})` : '#ff5070';
    for (let row = 0; row < heart.length; row++) {
      for (let cx = 0; cx < heart[row].length; cx++) {
        if (heart[row][cx] === '1') {
          ctx.fillRect(hi + cx * PX, hj + row * PX, PX, PX);
        }
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(hi + 2 * PX, hj + 1 * PX, PX, PX);
    // Danger pulse — raudonas blyksis
    if (danger) {
      ctx.fillStyle = `rgba(255,40,40,${0.20 * (1 - pulse)})`;
      ctx.fillRect(hpX, hpY, hpW, hpH);
    }
    // HP skaitmuo — virš heart, mini pixel font
    ctx.fillStyle = '#fff8e0';
    ctx.font = 'bold 8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${baseHp}`, hpX + hpW / 2, hj - PX*3);
    ctx.textBaseline = 'alphabetic';

    // Score (right side)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe7a8';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('SCORE ' + score, L.W - 16, 30);
    ctx.fillStyle = '#a8e7ff';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText('MERGES ' + merges + '   BLOCKS ' + blocks.length, L.W - 16, 50);

    const bw = 92, bh = 26;
    const bx = L.W - bw - 16, by = L.H - bh - 32;
    ctx.fillStyle = '#3a1212';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#ff7a7a';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = '#ffd6d6';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT (ESC)', bx + bw / 2, by + bh / 2);
    ctx.textBaseline = 'alphabetic';
    exitBtnRect = { x: bx, y: by, w: bw, h: bh };

    const rbx = bx - bw - 12;
    ctx.fillStyle = '#1a3a14';
    ctx.fillRect(rbx, by, bw, bh);
    ctx.strokeStyle = '#7aff8a';
    ctx.lineWidth = 2;
    ctx.strokeRect(rbx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = '#d6ffe0';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RESTART (R)', rbx + bw / 2, by + bh / 2);
    ctx.textBaseline = 'alphabetic';
    restartBtnRect = { x: rbx, y: by, w: bw, h: bh };
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
    ctx.fillText('R = RESTART · ESC = EXIT', L.W / 2, L.H / 2 + 60);
  }

  // ── Input ──────────────────────────────────────────────────────────
  function onKey(e) {
    if (!active) return;
    const k = e.key;
    if (k === 'Escape') {
      try { S.floor = 11; } catch (_) {}
      e.preventDefault(); return;
    }
    if (k === 'r' || k === 'R') { initState(); e.preventDefault(); return; }
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
    // Kortos — tik vizualas, click'ai ignoruojami (panaikinta drag logika)
    if (exitBtnRect && p.x >= exitBtnRect.x && p.x <= exitBtnRect.x + exitBtnRect.w
        && p.y >= exitBtnRect.y && p.y <= exitBtnRect.y + exitBtnRect.h) {
      try { S.floor = 11; } catch (_) {}
      return;
    }
    if (restartBtnRect && p.x >= restartBtnRect.x && p.x <= restartBtnRect.x + restartBtnRect.w
        && p.y >= restartBtnRect.y && p.y <= restartBtnRect.y + restartBtnRect.h) {
      initState(); return;
    }
    // Deploy panel — pasirink unit type
    for (const r of deployBtnRects) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        if (r.cnt > 0) selectedDeployType = (selectedDeployType === r.utype) ? null : r.utype;
        return;
      }
    }
    // Deploy → click ant lane
    if (selectedDeployType && layoutCache) {
      const L = layoutCache;
      if (p.x >= L.lanesX && p.x <= L.lanesX + L.lanesW && p.y >= L.lanesY && p.y < L.lanesY + L.lanesH) {
        const laneIdx = Math.floor((p.y - L.lanesY) / L.laneH);
        if (laneIdx >= 0 && laneIdx < LANES && deployPool[selectedDeployType] > 0) {
          spawnAlly(selectedDeployType, laneIdx, now());
          deployPool[selectedDeployType]--;
          if (deployPool[selectedDeployType] <= 0) selectedDeployType = null;
          return;
        }
      }
    }
    updateLauncherAim();
    // Reload check — neleidžia pradėti naujo charge kol patranka nepasikrovus
    if (now() - lastFireAt < FIRE_COOLDOWN_MS) return;
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
    canvas.width = Math.floor(window.innerWidth);
    canvas.height = Math.floor(window.innerHeight);
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
  }

  function activate() {
    if (active) return;
    ensureOverlay();
    initState();
    canvas.style.display = 'block';
    active = true;
    lastTime = now();
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

  function deactivate() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    if (canvas) canvas.style.display = 'none';
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKeyUp, true);
    charging = false;
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
    const dt = Math.min(tnow - lastTime, 100);
    lastTime = tnow;
    tickEnemies(dt, tnow);
    _tickHarpoons(tnow);
    _tickShamanProj(tnow);
    _tickArrows(tnow);
    _tickSpirits(dt, tnow);
    _tickOhShitEvents(tnow);
    _tickPoison(tnow);
    _tickAsteroids(tnow);
    // Pending merge attacks — fire'ina po delay (susijungimo animacijos pabaiga)
    for (let i = _f12PendingAttacks.length - 1; i >= 0; i--) {
      const pa = _f12PendingAttacks[i];
      if (tnow >= pa.runAt) {
        _triggerMergeAttack(pa.type, pa.value, pa.mx, pa.my, tnow);
        _f12PendingAttacks.splice(i, 1);
      }
    }
    tickPhysics(dt);
    _fadeMarks(dt);
    render(tnow);
    raf = requestAnimationFrame(loop);
  }

  function poll() {
    let cur = null;
    try { cur = S; } catch (_) {}
    if (cur && typeof cur === 'object') {
      const f = cur.floor;
      if (f === 12 && !active) activate();
      else if (f !== 12 && active) deactivate();
    }
  }
  setInterval(poll, 200);

  window.MergeFloor = { activate, deactivate, isActive: () => active };

  function _safeS() { try { return S; } catch (_) { return null; } }

  window.gotoF12 = function () {
    const cur = _safeS();
    if (!cur) return console.warn('S nera dar inicializuotas (paspausk Adventure pirma)');
    cur.floor = 12;
    if (typeof initAdventure === 'function') initAdventure();
    return 'F12 Merge mode';
  };
  window.gotoF11 = function () {
    const cur = _safeS();
    if (!cur) return;
    cur.floor = 11;
    if (typeof initAdventure === 'function') initAdventure();
    return 'F11';
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
})();
