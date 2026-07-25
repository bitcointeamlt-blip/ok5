// audio.js — procedūrinis WebAudio SFX (jokių išorinių failų → self-contained).
// Kiekvienam smūgiui truputį keičiam pitch, kad nesikartotų identiškai.
// Init'inam per pirmą naudotojo gestą (autoplay policy).
class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this._noise = null;
    // 🎵 Fono muzika (BGM) — atskiras <audio> elementas (loop). Būsena persist localStorage.
    this.bgm = null;
    this.musicOn = true;
    try { this.musicOn = localStorage.getItem('rp_music') !== '0'; } catch (_) {}
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.28;   // pritildyta (buvo 0.5 — per garsu)
    this.master.connect(this.ctx.destination);
    // Trumpas triukšmo buferis smūgių „body".
    const n = this.ctx.sampleRate * 0.2;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    // Boso garso sample'ai — TIKRI CC0 įrašai, apdoroti ffmpeg (sub/EQ/exciter/reverb).
    //   Kraunami async; kol neįkrauti (ar file:// fetch nepavyko) — fallback procedūrinis.
    this.bossHitBuf = null; this.bossDeathBuf = null; this.flipHitBuf = null;
    this.teslaBuf = null; this.teslaBuzzBuf = null;
    this._loadSample('snd_boss_hit.ogg', (b) => { this.bossHitBuf = b; });
    this._loadSample('snd_boss_die.ogg', (b) => { this.bossDeathBuf = b; });
    this._loadSample('snd_flipper_hit.ogg', (b) => { this.flipHitBuf = b; });
    this._loadSample('snd_tesla.ogg', (b) => { this.teslaBuf = b; });          // ⚡ tikras tesla spark
    this._loadSample('snd_tesla_buzz.ogg', (b) => { this.teslaBuzzBuf = b; });  // continuous spark crackle
    // 🎵 Fono muzika „Obsidian Gate Hymn" — loop, groja nuo šio pirmo gesto (autoplay policy).
    if (!this.bgm && typeof Audio !== 'undefined') {
      this.bgm = new Audio('obsidian_gate_hymn.mp3');
      this.bgm.loop = true;
      this.bgm.volume = 0.025;  // dar mažiau (0.05→0.025; user vis dar per garsi)
    }
    if (this.bgm && this.musicOn) this.bgm.play().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.bgm && this.musicOn && this.bgm.paused) this.bgm.play().catch(() => {});   // retry (jei autoplay blokavo)
  }

  // 🎵 Muzikos įjungimas/išjungimas (M klavišas). Grąžina naują būseną (bool). Persist.
  toggleMusic() {
    this.musicOn = !this.musicOn;
    try { localStorage.setItem('rp_music', this.musicOn ? '1' : '0'); } catch (_) {}
    if (this.bgm) { if (this.musicOn) this.bgm.play().catch(() => {}); else this.bgm.pause(); }
    return this.musicOn;
  }

  // Įkelia garso failą į AudioBuffer (WebAudio). Klaida (pvz. file:// CORS) → tyliai praleidžia.
  _loadSample(url, cb) {
    if (!this.ctx || typeof fetch === 'undefined') return;
    fetch(url).then((r) => r.arrayBuffer()).then((a) => this.ctx.decodeAudioData(a)).then(cb).catch(() => {});
  }
  // Groja AudioBuffer per master su atsitiktiniu pitch (playbackRate). Grąžina {s,g} valdymui.
  _playBuf(buf, gain, rmin, rmax) {
    if (!this.enabled || !this.ctx || !buf) return null;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    s.playbackRate.value = rmin + Math.random() * (rmax - rmin);
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(g); g.connect(this.master);
    s.start(t);
    return { s, g };
  }
  // „Voice-steal": greitas fade + stop (be spragtelėjimo) → naujas smūgis nepersikloja su senu.
  _stealFade(v) {
    if (!v || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(v.g.gain.value, t);
      v.g.gain.linearRampToValueAtTime(0.0001, t + 0.04);
      v.s.stop(t + 0.05);
    } catch (_) {}
  }

  _tone(freq, dur, type, gain, slideTo, attack) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const G = gain != null ? gain : 0.3, a = attack || 0;
    if (a > 0) {                                        // švelni ataka (fade-in) → mažiau „clicky/robotinis"
      g.gain.setValueAtTime(0.0008, t);
      g.gain.linearRampToValueAtTime(G, t + a);
    } else {
      g.gain.setValueAtTime(G, t);
    }
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _burst(dur, gain, filterFreq) {
    if (!this.enabled || !this.ctx || !this._noise) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = filterFreq; f.Q.value = 1.2;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  // ── SFX ──
  flipUp() { this._tone(220 + M.rand(-15, 15), 0.05, 'square', 0.18, 320); }
  flipHit(strength) {
    const p = M.clamp(strength / 700, 0, 1);
    // TIKRAS medžio „thock" sample (wood_hit_06, apdorotas) — garsas pagal jėgą, pitch random (variacija).
    if (this.flipHitBuf && this.enabled) {
      this._playBuf(this.flipHitBuf, 0.42 + p * 0.5, 0.90 + p * 0.06, 1.06 + p * 0.06);
      return;
    }
    // ── fallback: procedūrinis švelnus paddle „POM" ──
    const g = 0.16 + p * 0.20;                                    // jėga → garsumas
    this._tone(300 + p * 150, 0.08, 'sine', g, 140);             // apvalus body
    this._tone(520 + p * 180, 0.035, 'triangle', g * 0.32, 300); // trumpas atakos „pop"
    this._burst(0.02, 0.035 + p * 0.03, 700 + p * 500);          // švelni kontakto tekstūra (ne aštri)
  }
  wall(strength) {
    const p = M.clamp(strength / 700, 0, 1);
    if (p < 0.05) return;
    this._burst(0.03 + p * 0.03, 0.05 + p * 0.14, 300 + p * 900);
  }
  bumper() {
    this._tone(520 + M.rand(-30, 30), 0.09, 'square', 0.3, 760);
    this._burst(0.05, 0.16, 900);
  }
  // 🦍 BOSO dmg — VELNIŠKAS gyvūniškas riaumojimas. Custom grafas (ne _tone), kad būtų ORGANIŠKA
  //   ir MINKŠTA (user: buvo per gilus/robotinis/pixelinis). Du raktai:
  //   (1) LOWPASS filtras 1500→480Hz — nurauna aštrias „robotines" aukštas harmonikas → minkšta,
  //       ir tembras temsta krentant (roar užgęsta natūraliai).
  //   (2) PITCH LFO ~26Hz — organiškas urzgimo „rrrr" virpėjimas (ne mechaninis detune-beating).
  //   Sawtooth (velnio grit, jau minkštas po filtro) + triangle sub-oktava (body) + minkšta ataka.
  bossHit() {
    // TIKRAS sample (apdorotas monster_03) — voice-steal, kad rapid smūgiai nesikrautų į košę.
    if (this.bossHitBuf && this.enabled) {
      this._stealFade(this._hitVoice);
      this._hitVoice = this._playBuf(this.bossHitBuf, 0.9, 0.9, 1.1);
      return;
    }
    // ── fallback: procedūrinis velniškas urzgimas (jei sample dar nekrautas) ──
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime, r = M.rand(-9, 9), base = 130 + r;
    // Išvesties apvalkalas (minkšta ataka → decay)
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.8, t + 0.03);              // minkšta ataka (ne „clicky")
    out.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);
    // Lowpass — MINKŠTINA (nurauna aštrumą) + temsta krentant
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(1500 + r * 20, t);
    lp.frequency.exponentialRampToValueAtTime(480, t + 0.4);
    lp.connect(out); out.connect(this.master);
    // Growl LFO — moduliuoja abiejų osciliatorių pitch (organiškas „rrrr", ne robotinis)
    const lfo = this.ctx.createOscillator(), lfoG = this.ctx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 26 + M.rand(-4, 4); lfoG.gain.value = 9;
    lfo.connect(lfoG);
    // Osc1 — sawtooth (velnio grit), bend žemyn; Osc2 — triangle sub-oktava (apvalus body)
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(base * 1.5, t);
    o1.frequency.exponentialRampToValueAtTime(base, t + 0.4);
    const o2 = this.ctx.createOscillator(); o2.type = 'triangle';
    o2.frequency.setValueAtTime(base * 0.75, t);
    o2.frequency.exponentialRampToValueAtTime(base * 0.5, t + 0.4);
    lfoG.connect(o1.frequency); lfoG.connect(o2.frequency);
    const g1 = this.ctx.createGain(); g1.gain.value = 0.42; o1.connect(g1); g1.connect(lp);
    const g2 = this.ctx.createGain(); g2.gain.value = 0.55; o2.connect(g2); g2.connect(lp);
    o1.start(t); o2.start(t); lfo.start(t);
    o1.stop(t + 0.44); o2.stop(t + 0.44); lfo.stop(t + 0.44);
    // trumpas kontaktas (per master — kad girdėtųsi „pat", nepriklausomai nuo lowpass)
    this._burst(0.012, 0.05, 1000);
  }
  // 💀 BOSO MIRTIS — tikras „dying groan" sample (apdorotas, su cavern reverb). Fallback = fanfara.
  bossDeath() {
    if (this.bossDeathBuf && this.enabled) { this._playBuf(this.bossDeathBuf, 1.0, 0.97, 1.03); return; }
    this.combo(6);
  }
  // 💥 SMŪGIS į KIETĄ — BOOM (žemas kick body) + kietas kontaktas + „stūmimo" uodega (svoris, vos pajuda).
  //   NE stiklinis „ting" — žemesnis, atsparus, su svoriu. Combo → truputį ryškesnis/aukštesnis.
  hit(strength, combo) {
    const p = M.clamp(strength / 550, 0, 1);
    const cmax = (CONFIG.combo && CONFIG.combo.max) || 10;
    const cf = M.clamp(((combo || 1) - 1) / Math.max(1, cmax - 1), 0, 1);
    const g = 0.30 + p * 0.28;                                     // stiprumas → garsumas
    // KLIK — labai trumpas kietas kontaktas (aukštas transient)
    this._burst(0.012, 0.10 + p * 0.08, 1400 + p * 900);
    // WOMP — gilus sub „boom" body (svoris, atsimušimas į kietą)
    this._tone(135 + cf * 45 + p * 40 + M.rand(-5, 5), 0.17, 'sine', g, 38);
    // THOCK — tankus medinis rezonansas
    this._tone(190 + cf * 60, 0.09, 'triangle', g * 0.5, 120);
    // STŪMIMAS — žema atspari uodega (vos pajuda)
    this._tone(78 + cf * 18, 0.22, 'sine', g * 0.40, 55);
  }
  // Sieninis PAVEIKSLAS — MEDINIO rėmo „tok" (šiltas, tuščiaviduris medžio smūgis).
  picture() {
    const f = 205 + M.rand(-12, 12);
    this._burst(0.006, 0.07, 2400);                    // kontakto „tak" (medžio paviršius)
    this._tone(f, 0.13, 'triangle', 0.24, f * 0.70);   // medinis rezonansas (tok)
    this._tone(f * 1.48, 0.07, 'sine', 0.08, f * 1.10); // aukštesnė medžio harmonika
    this._tone(f * 0.58, 0.17, 'sine', 0.13, f * 0.50); // tuščiaviduris rėmo body (žemas hollow)
  }
  // FAKELAS užsidega — DEGTUKAS: raspy „scritch" (galvos brūkšt per dėžutę) → liepsnos „fwoosh".
  torch() {
    this._burst(0.07, 0.15, 2400);    // scrape body (raspy mid — grūdėtas brūkšt)
    this._burst(0.045, 0.11, 3600);   // grit sluoksnis
    this._burst(0.025, 0.08, 5200);   // aukštas „ššš" (sulfur)
    const self = this;
    setTimeout(function () {
      self._burst(0.24, 0.14, 720);   // liepsnos „fwoosh" (oringas užsidegimas)
      self._burst(0.09, 0.08, 1700);  // trumpas užsidegimo „pff"
      self._tone(95, 0.13, 'sawtooth', 0.07, 190);   // subtilus žemas whoomph
    }, 60);
  }
  sling() {
    this._tone(360 + M.rand(-25, 25), 0.06, 'square', 0.24, 520);
    this._burst(0.04, 0.12, 700);
  }
  combo(n) {
    const f = 300 + n * 70;                 // kylantis pitch su combo
    this._tone(f, 0.09, 'triangle', 0.26, f * 1.5);
  }
  launch(power) {
    const p = M.clamp(power / CONFIG.plunger.max, 0, 1);
    this._tone(120 + p * 120, 0.18, 'sawtooth', 0.24, 60 + p * 340);
  }
  drain() {
    this._tone(300, 0.35, 'sawtooth', 0.28, 60);
  }
  // ⚡ TESLA / elektros zap — burn-zonoms (mėlynas žaibas). Ryškus buzzy „BZZZT" + trakštelėjimas.
  //   Garsesnis ir elektriškesnis — aiškiai girdimas kai užsidega tesla laukas.
  tesla() {
    // TIKRAS tesla generatoriaus spark (CC0) — su pitch atsitiktinumu.
    if (this.teslaBuf && this.enabled) { this._playBuf(this.teslaBuf, 0.95, 0.92, 1.10); return; }
    // ── fallback procedūrinis ──
    // Pagrindinis elektros „BZZT" — sawtooth (aštresnis, elektriškesnis nei square) + greitas drop
    this._tone(1500 + M.rand(-150, 150), 0.12, 'sawtooth', 0.26, 320);  // zap body (žemėjantis)
    this._tone(760 + M.rand(-60, 60), 0.10, 'square', 0.18, 200);       // žemesnis buzz sluoksnis (svoris)
    this._tone(2900, 0.07, 'sawtooth', 0.11, 1200);                     // aukšta metalinė harmonika
    // Elektros trakštelėjimas (crackle) — daugiau ir garsiau
    this._burst(0.09, 0.20, 3200);                                      // pagrindinis crackle
    this._burst(0.04, 0.14, 6000);                                      // aukštas spragt
    this._burst(0.02, 0.10, 9000);                                      // labai aukštas „ss" (kibirkštis)
    // Antras „zzt" po mikropauzės — nestabilaus lauko įsijungimo pojūtis
    const self = this;
    setTimeout(function () {
      self._tone(1200 + M.rand(-100, 100), 0.06, 'sawtooth', 0.14, 500);
      self._burst(0.03, 0.10, 5000);
    }, 55);
  }

  // ⚡ Silpnas „bzzz" — groja PAKARTOTINAI kol tesla laukas laiko/atstumia kamuoliuką (throttle game.js).
  buzz() {
    // Tikras continuous-spark crackle (grojamas kartotinai per repel; voice-steal → be pile-up).
    if (this.teslaBuzzBuf && this.enabled) {
      this._stealFade(this._buzzVoice);
      this._buzzVoice = this._playBuf(this.teslaBuzzBuf, 0.34, 0.95, 1.12);
      return;
    }
    this._tone(88 + M.rand(-6, 6), 0.09, 'sawtooth', 0.05, 70);    // tylus žemas elektros zvimbimas
    this._tone(132 + M.rand(-8, 8), 0.055, 'square', 0.028, 118);  // vos aukštesnis sluoksnis
  }
}
