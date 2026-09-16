/* Procedūrinis WebAudio garsas — jokių failų, viskas sintezuojama.
 * Chiptune stilius (square/triangle + trumpi envelope'ai). */
(function (global) {
  'use strict';

  var C = global.CFG;
  var ctx = null, master = null, cue = null, route = null;

  /* 🔊 GARSO LYGIAI (2026-09-16, user prašymas: „valdyti stiprumą arba išvis išjungti").
   * Diskretūs žingsniai, o ne tolydus slankiklis — 5 stulpeliai ekrane atitinka 1:1 lygį,
   * todėl bakstelėjus stulpelį garsas nustatomas tiksliai, be taikymosi į plauko storio ruožą.
   * 0 = tyla. Numatytasis 4 = 0.35 (senoji CFG.SFX_VOL reikšmė — niekam garsas nepasikeis). */
  var LEVELS = [0, 0.08, 0.16, 0.26, 0.35, 0.50];
  var MAXLVL = LEVELS.length - 1;
  var STORE_KEY = 'rb_sfx_v1';
  var level = 4;        /* dabartinis lygis 0..5 */
  var lastOn = 4;       /* į kurį lygį grįžti atgarsinus (unmute) */

  /* 📣 MAČO ŠŪKSNIAI — atskira magistralė (2026-09-16, user: „kai atsiranda mačas, garsas per stiprus").
   * Tai vieninteliai garsai, kurie sprogsta žaidėjui NIEKO nepaspaudus: atgalinis skaičiavimas,
   * startas ir pabaigos fanfara. Jie ir yra patys aštriausi (880/1320 Hz square), todėl gauna
   * SAVO reguliatorių — galima juos pritildyti nepaliečiant valdymo ir linijų garsų.
   * Reikšmė = daugiklis nuo bendro garsumo, todėl bendras slankiklis vis tiek valdo viską.
   * Numatytasis 3 (pusė) — būtent dėl to, kad iki šiol skambėjo per garsiai. */
  var CUE_KEYS = { tick: 1, go: 1, win: 1, lose: 1 };
  var CUE_LEVELS = [0, 0.15, 0.30, 0.50, 0.75, 1.00];
  var cueLevel = 3;

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(STORE_KEY); } catch (_) {}
    if (!raw) return;
    var v;
    try { v = JSON.parse(raw); } catch (_) { return; }
    if (!v || typeof v !== 'object') return;
    if (typeof v.level === 'number' && v.level >= 0 && v.level <= MAXLVL) level = Math.round(v.level);
    if (typeof v.last === 'number' && v.last >= 1 && v.last <= MAXLVL) lastOn = Math.round(v.last);
    if (typeof v.cue === 'number' && v.cue >= 0 && v.cue <= MAXLVL) cueLevel = Math.round(v.cue);
    if (level > 0) lastOn = level;
  }

  function save() {
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify({ level: level, last: lastOn, cue: cueLevel }));
    } catch (_) {}
  }

  /* Vienintelė vieta, kur lygis virsta realiu garsumu. CFG.SFX_ON / SFX_VOL laikomi
   * sinchroniškai, nes jais remiasi tone()/noise() vartai ir senesnis kodas. */
  function apply() {
    C.SFX_VOL = LEVELS[level];
    C.SFX_ON = level > 0;
    if (master) master.gain.value = C.SFX_VOL;
    if (cue) cue.gain.value = CUE_LEVELS[cueLevel];
  }

  function setCueLevel(n, quiet) {
    n = Math.max(0, Math.min(MAXLVL, Math.round(n || 0)));
    if (n === cueLevel) return cueLevel;
    cueLevel = n;
    apply();
    save();
    /* peržiūra groja BŪTENT tą garsą, kurį reguliuoji — girdi rezultatą iškart */
    if (!quiet && cueLevel > 0 && level > 0) { try { global.Sfx.play('go'); } catch (_) {} }
    return cueLevel;
  }

  function setLevel(n, quiet) {
    n = Math.max(0, Math.min(MAXLVL, Math.round(n || 0)));
    if (n === level) return level;
    level = n;
    if (level > 0) lastOn = level;
    apply();
    save();
    /* trumpas piktelėjimas = girdima, KOKS dabar garsumas (tyloje nieko negroja) */
    if (!quiet && level > 0) { try { global.Sfx.play('click'); } catch (_) {} }
    return level;
  }

  load();
  apply();   /* įrašyta reikšmė turi galioti dar PRIEŠ pirmą garsą (ensure() ims C.SFX_VOL) */

  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = C.SFX_VOL;
    master.connect(ctx.destination);
    /* cue → master → destination: mačo šūksniai pritildomi ATSKIRAI, bet bendras
     * slankiklis (ir mute) vis tiek galioja jiems, nes jie eina per tą patį master. */
    cue = ctx.createGain();
    cue.gain.value = CUE_LEVELS[cueLevel];
    cue.connect(master);
    route = master;
    return ctx;
  }

  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /* Vienas tonas su envelope. */
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!C.SFX_ON) return;
    if (!ensure()) return;
    var t0 = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(route || master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  /* Triukšmas (perkusija / griūtis). */
  function noise(dur, vol, lp, delay) {
    if (!C.SFX_ON) return;
    if (!ensure()) return;
    var t0 = ctx.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 1200;
    var g = ctx.createGain(); g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(route || master);
    src.start(t0);
  }

  var SFX = {
    move:      function () { tone(220, 0.035, 'square', 0.12); },
    rotate:    function () { tone(420, 0.05, 'square', 0.14, 520); },
    hold:      function () { tone(300, 0.08, 'triangle', 0.18, 460); },
    harddrop:  function () { noise(0.09, 0.30, 900); tone(90, 0.09, 'square', 0.18, 55); },
    lock:      function () { tone(150, 0.04, 'square', 0.10); },
    clear1:    function () { tone(523, 0.10, 'square', 0.22); tone(784, 0.12, 'square', 0.16, null, 0.05); },
    clear2:    function () { tone(587, 0.10, 'square', 0.22); tone(880, 0.14, 'square', 0.18, null, 0.06); },
    clear3:    function () { tone(659, 0.10, 'square', 0.24); tone(988, 0.16, 'square', 0.20, null, 0.06); },
    quad:      function () {
                 [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.16, 'square', 0.24, null, i * 0.055); });
                 noise(0.25, 0.20, 2200);
               },
    incoming:  function () { tone(880, 0.07, 'sawtooth', 0.16, 660); tone(660, 0.07, 'sawtooth', 0.14, 880, 0.09); },
    warn:      function () { tone(1100, 0.05, 'square', 0.13); },
    garbage:   function () { noise(0.30, 0.34, 500); tone(70, 0.22, 'square', 0.20, 45); },
    blocked:   function () { tone(700, 0.07, 'triangle', 0.22); tone(1050, 0.10, 'triangle', 0.20, null, 0.06); },
    counter:   function () {
                 [392, 523, 698, 880].forEach(function (f, i) { tone(f, 0.09, 'sawtooth', 0.18, null, i * 0.04); });
               },
    /* --- kūjo smūgiai po grindimis: kiekvienas aukštesnis = artėja --- */
    hammer1:   function () { noise(0.14, 0.30, 380); tone(64, 0.20, 'square', 0.30, 40); tone(150, 0.07, 'triangle', 0.10); },
    hammer2:   function () { noise(0.15, 0.36, 460); tone(78, 0.20, 'square', 0.34, 48); tone(190, 0.08, 'triangle', 0.13); },
    hammer3:   function () { noise(0.17, 0.42, 560); tone(95, 0.22, 'square', 0.38, 58); tone(240, 0.09, 'triangle', 0.16); },
    breach:    function () {
                 noise(0.45, 0.50, 900);
                 tone(110, 0.32, 'square', 0.34, 38);
                 tone(58, 0.40, 'sawtooth', 0.30, 30, 0.03);
               },

    /* --- juice --- */
    whoosh:    function () { noise(0.22, 0.16, 3000); tone(300, 0.20, 'sawtooth', 0.10, 900); },
    impact:    function () { noise(0.16, 0.30, 700); tone(120, 0.14, 'square', 0.22, 60); },
    heartbeat: function () { tone(58, 0.13, 'sine', 0.34, 42); tone(52, 0.11, 'sine', 0.26, 38, 0.17); },
    single:    function () { tone(523, 0.10, 'square', 0.22); tone(784, 0.12, 'square', 0.16, null, 0.05); },
    tick:      function () { tone(660, 0.07, 'square', 0.22); },
    go:        function () { tone(880, 0.18, 'square', 0.28); tone(1320, 0.22, 'square', 0.22, null, 0.08); },
    win:       function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.20, 'triangle', 0.26, null, i * 0.09); }); },
    lose:      function () { [440, 392, 330, 220].forEach(function (f, i) { tone(f, 0.26, 'sawtooth', 0.22, null, i * 0.12); }); },
    levelup:   function () { [660, 880, 1100].forEach(function (f, i) { tone(f, 0.10, 'square', 0.18, null, i * 0.05); }); },
    click:     function () { tone(520, 0.04, 'square', 0.16); }
  };

  global.Sfx = {
    /* Maršrutą nustatom PRIEŠ kvietimą: tone()/noise() prisijungia prie `route`,
     * o jos iškviečiamos sinchroniškai, tad kiekvienas garsas patenka į savo magistralę. */
    play: function (k) {
      var f = SFX[k];
      if (!f) return;
      ensure();   /* mazgai turi EGZISTUOTI pirma — kitaip pirmas garsas nueitų pro cue magistralę */
      route = (CUE_KEYS[k] && cue) ? cue : master;
      try { f(); } catch (e) { }
      route = master;
    },
    unlock: unlock,
    setVolume: function (v) { setLevel(nearestLevel(v)); },
    /* MUTE: išjungia visiškai; įjungus grįžta į TĄ PATĮ lygį, kuris buvo prieš tylą. */
    toggle: function () { setLevel(level > 0 ? 0 : (lastOn || MAXLVL)); return C.SFX_ON; },
    isOn: function () { return C.SFX_ON; },

    /* --- lygio valdymas (UI valdiklis + klavišai) --- */
    maxLevel: function () { return MAXLVL; },
    level: function () { return level; },
    setLevel: function (n) { return setLevel(n); },
    step: function (d) { return setLevel(level + (d > 0 ? 1 : -1)); },

    /* --- mačo šūksniai (countdown / GO / WIN / LOSE) atskirai --- */
    cueLevel: function () { return cueLevel; },
    setCueLevel: function (n) { return setCueLevel(n); },
    cueStep: function (d) { return setCueLevel(cueLevel + (d > 0 ? 1 : -1)); }
  };

  function nearestLevel(v) {
    var best = 0, bd = Infinity;
    for (var i = 0; i <= MAXLVL; i++) {
      var d = Math.abs(LEVELS[i] - v);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
})(window);
