/* Įvedimas: klaviatūra + jutiklinis ekranas.
 * Žaidimo veiksmai keliauja į engine.press/release; meta veiksmai — į match. */
(function (global) {
  'use strict';

  /* Klavišas -> veiksmas. Tam pačiam veiksmui gali būti KELI klavišai:
   * rodyklės ir WSAD veikia VIENU METU (yra klaviatūrų be rodyklių).
   * Susipjovimo nėra, nes veiksmas skaičiuojamas pagal LAIKOMŲ klavišų kiekį
   * (žr. _heldCount): antras klavišas nepakartoja press, o pirmas atleistas
   * neatšaukia judesio, kol laikomas jo dvynys. */
  var KEYMAP = {
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'ArrowDown': 'softdrop',
    'ArrowUp': 'cw',
    'KeyA': 'left',
    'KeyD': 'right',
    'KeyS': 'softdrop',
    'KeyW': 'cw',
    'KeyX': 'cw',
    'KeyZ': 'ccw',
    'ControlLeft': 'ccw',
    'ControlRight': 'ccw',
    'KeyQ': 'flip',
    'KeyE': 'flip',
    'Space': 'hard',
    'KeyC': 'hold',
    'ShiftLeft': 'hold',
    'ShiftRight': 'hold'
  };

  var META = {
    'Enter': 'start',
    'NumpadEnter': 'start',
    'KeyR': 'restart',
    'Escape': 'menu',
    'KeyP': 'pause',
    'KeyM': 'mute',
    'Digit1': 'ai1', 'Digit2': 'ai2', 'Digit3': 'ai3', 'Digit4': 'ai4',
    'Numpad1': 'ai1', 'Numpad2': 'ai2', 'Numpad3': 'ai3', 'Numpad4': 'ai4',
    'KeyG': 'grid',
    'KeyH': 'ghost',
    'KeyF': 'fullscreen',
    'F11': 'fullscreen'
  };

  /* 📱 VALDYMO SCHEMA (2026-08-16; user + ShadowRonke pasiūlymas Discorde).
   * Žaidėjas PATS pasirenka GET READY ekrane, pasirinkimas įsimenamas naršyklėje:
   *   'buttons'  — braukimas judina figūrą, apačioje mygtukai ⟳ ROTATE · ⇄ HOLD · ▼ DROP
   *   'gestures' — jokių mygtukų: bakstelėjimas = sukimas · greitas brūkšt ŽEMYN = instant drop
   *                · brūkšt AUKŠTYN = HOLD · lėtas braukimas žemyn = soft drop (pozicionavimui, T-spin) */
  var CTL_KEY = 'rb_ctrl_v1';
  var _scheme = null;
  function ctlGet() {
    if (_scheme) return _scheme;
    var v = null;
    try { v = global.localStorage.getItem(CTL_KEY); } catch (_) {}
    _scheme = (v === 'gestures') ? 'gestures' : 'buttons';
    return _scheme;
  }
  function ctlSet(v) {
    _scheme = (v === 'gestures') ? 'gestures' : 'buttons';
    try { global.localStorage.setItem(CTL_KEY, _scheme); } catch (_) {}
    ctlApply();
    return _scheme;
  }
  /* Mygtukų juosta rodoma TIK 'buttons' schemoje (ir tik touch įrenginyje). */
  function ctlApply() {
    var d = global.document; if (!d) return;
    var pad = d.getElementById('touchpad'); if (!pad) return;
    var isTouch = ('ontouchstart' in global) || (global.navigator && global.navigator.maxTouchPoints > 0);
    pad.style.display = (isTouch && ctlGet() === 'buttons') ? 'flex' : 'none';
  }

  /* Fullscreen perjungimas. Naršyklės reikalauja naudotojo gesto — todėl tik iš klavišo/mygtuko.
   * Mobiliajame dar bandom užrakinti landscape (jei API prieinamas). */
  function toggleFullscreen() {
    var d = global.document;
    var el = d.documentElement;
    var isFs = d.fullscreenElement || d.webkitFullscreenElement;
    try {
      if (!isFs) {
        var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (req) {
          var p = req.call(el);
          if (p && p.then) p.catch(function () { });
        }
        if (global.screen && global.screen.orientation && global.screen.orientation.lock) {
          try {
            var lp = global.screen.orientation.lock('landscape');
            if (lp && lp.catch) lp.catch(function () { });
          } catch (e) { }
        }
      } else {
        var ex = d.exitFullscreen || d.webkitExitFullscreen || d.msExitFullscreen;
        if (ex) {
          var p2 = ex.call(d);
          if (p2 && p2.then) p2.catch(function () { });
        }
      }
    } catch (e) { }
  }

  function Input(match) {
    this.match = match;
    this.down = {};
    var self = this;

    /* Kiek klavišų dabar laikoma tam pačiam veiksmui (pvz. ArrowLeft + KeyA). */
    this._heldCount = function (a) {
      var n = 0;
      for (var code in KEYMAP) if (KEYMAP[code] === a && self.down[code]) n++;
      return n;
    };

    this._kd = function (e) {
      if (e.repeat) { if (KEYMAP[e.code]) e.preventDefault(); return; }
      var a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        if (self.down[e.code]) return;          /* jau laikomas — nieko nekartojam */
        self.down[e.code] = true;
        /* press siunčiam tik PIRMAM klavišui: kitaip antras dvynys iš naujo
         * paleistų DAS ir online režimu antrą kartą siųstų 'down' bei garsą */
        if (self._heldCount(a) === 1) match.playerPress(a);
        return;
      }
      var m = META[e.code];
      if (m) { e.preventDefault(); match.meta(m); }
    };

    this._ku = function (e) {
      var a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        if (!self.down[e.code]) return;
        self.down[e.code] = false;
        /* atleidžiam tik jei joks kitas tą patį veiksmą duodantis klavišas nelaikomas */
        if (self._heldCount(a) === 0) match.playerRelease(a);
      }
    };

    this._blur = function () {
      var done = {};
      for (var code in self.down) {
        if (!self.down[code]) continue;
        self.down[code] = false;
        var act = KEYMAP[code];
        if (act && !done[act]) { done[act] = true; match.playerRelease(act); }
      }
    };

    global.addEventListener('keydown', this._kd, { passive: false });
    global.addEventListener('keyup', this._ku, { passive: false });
    global.addEventListener('blur', this._blur);

    this.setupTouch();
  }

  /* Jutiklinis valdymas — DOM mygtukai (paprasčiau ir tiksliau nei canvas hit-test). */
  Input.prototype.setupTouch = function () {
    var isTouch = ('ontouchstart' in global) || navigator.maxTouchPoints > 0;
    var pad = document.getElementById('touchpad');
    if (!pad) return;
    if (!isTouch) { pad.style.display = 'none'; return; }
    ctlApply();   // 📱 mygtukai matomi tik 'buttons' schemoje

    var match = this.match;
    var btns = pad.querySelectorAll('[data-act]');
    Array.prototype.forEach.call(btns, function (b) {
      var act = b.getAttribute('data-act');
      var isMeta = b.hasAttribute('data-meta');
      b.addEventListener('touchstart', function (e) {
        e.preventDefault(); b.classList.add('on');
        if (isMeta) match.meta(act); else match.playerPress(act);
      }, { passive: false });
      var up = function (e) {
        e.preventDefault(); b.classList.remove('on');
        if (!isMeta) match.playerRelease(act);
      };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
    });

    this.setupSwipe();
  };

  /* 📱 rb97_swipe: figūra seka pirštą — braukiant per žaidimo ekraną horizontaliai,
   * kiekvienas perbrauktas LANGELIO plotis = vienas žingsnis kairėn/dešinėn.
   * Grįžtant pirštu atgal figūra grįžta kartu (absoliutus sekimas nuo prilietimo taško).
   * Diskretūs press+release žingsniai — be DAS, todėl figūra sustoja lygiai ten, kur pirštas.
   * 📱 rb98_softswipe: braukiant ŽEMYN (užlaikius) — soft drop: figūra greitai leidžiasi,
   * kol pirštas laikomas žemai; pakėlus pirštą ar grįžus aukštyn — nustoja. DROP mygtukas lieka instant. */
  Input.prototype.setupSwipe = function () {
    var canvas = document.getElementById('screen');
    if (!canvas) return;
    var match = this.match;
    var touchId = null, startX = 0, startY = 0, startT = 0, steps = 0, softOn = false;
    var used = false, maxD = 0;   /* used = gestas jau suveikė (drop/hold); maxD = didžiausias nuokrypis px */

    /* vieno langelio plotis EKRANO pikseliais: C.CELL (virtualus) × canvas mastelis */
    function cellPx() {
      var C = global.CFG || {};
      var r = canvas.getBoundingClientRect();
      var vw = (match.renderer && match.renderer.vw) || C.VW || 640;
      return Math.max(12, (C.CELL || 20) * (r.width / Math.max(1, vw)));
    }
    function stepMove(a) { match.playerPress(a); match.playerRelease(a); }
    function fire(a) { match.playerPress(a); match.playerRelease(a); }
    function softStop() { if (softOn) { softOn = false; match.playerRelease('softdrop'); } }
    function nowMs() { return Date.now(); }
    /* GET READY ekrane bakstelėjimas ant READY / schemos mygtukų NEturi sukti demo figūros. */
    function onPrepBtn(clientX, clientY) {
      if (match.state !== 'prep') return false;
      var r = canvas.getBoundingClientRect();
      var vw = (match.renderer && match.renderer.vw) || 640;
      var vh = (match.renderer && match.renderer.vh) || 360;
      var vx = (clientX - r.left) * (vw / Math.max(1, r.width));
      var vy = (clientY - r.top) * (vh / Math.max(1, r.height));
      var list = (match._prepCtrlHit || []).slice();
      if (match._prepBtnRect) list.push(match._prepBtnRect);
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (b && vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h) return true;
      }
      return false;
    }

    canvas.addEventListener('touchstart', function (e) {
      if (touchId !== null) return;              /* sekam tik pirmą pirštą */
      var t = e.changedTouches[0];
      touchId = t.identifier; startX = t.clientX; startY = t.clientY; startT = nowMs();
      steps = 0; softOn = false; used = false; maxD = 0;
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
      if (touchId === null) return;
      var t = null;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) { t = e.changedTouches[i]; break; }
      }
      if (!t) return;
      if (e.cancelable) e.preventDefault();
      if (used) return;                          /* gestas jau atliktas — likusio judesio nebeskaitom */
      var cell = cellPx();
      var dx = t.clientX - startX, dy = t.clientY - startY;
      if (Math.abs(dx) > maxD) maxD = Math.abs(dx);
      if (Math.abs(dy) > maxD) maxD = Math.abs(dy);

      /* 👆 GESTŲ schema: GREITIS skiria „instant drop" nuo lėto pozicionavimo žemyn (ShadowRonke). */
      if (ctlGet() === 'gestures') {
        var dt = nowMs() - startT;
        if (dy > cell * 2.2 && Math.abs(dy) > Math.abs(dx) * 1.5 && dt <= 260) {   /* ⚡ brūkšt žemyn = DROP */
          softStop(); used = true; fire('hard'); return;
        }
        if (-dy > cell * 1.6 && Math.abs(dy) > Math.abs(dx) * 1.5 && dt <= 420) {  /* ⬆️ brūkšt aukštyn = HOLD */
          softStop(); used = true; fire('hold'); return;
        }
      }

      var want = Math.round(dx / cell);
      while (steps < want) { steps++; stepMove('right'); }
      while (steps > want) { steps--; stepMove('left'); }
      /* ŽEMYN: perbraukus > ~1.2 langelio žemiau pradžios taško — laikom soft drop;
       * pirštui grįžus aukščiau slenksčio — atleidžiam (galima „pristabdyti" kritimą) */
      var down = dy > cell * 1.2;
      if (down && !softOn) { softOn = true; match.playerPress('softdrop'); }
      else if (!down && softOn) softStop();
    }, { passive: false });

    var end = function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier !== touchId) continue;
        /* 👆 BAKSTELĖJIMAS = SUKIMAS (tik gestų schemoje): pirštas beveik nepajudėjo ir greitai pakeltas. */
        if (ctlGet() === 'gestures' && !used && !softOn
          && maxD < cellPx() * 0.5 && (nowMs() - startT) < 300 && !onPrepBtn(t.clientX, t.clientY)) {
          fire('cw');
        }
        touchId = null; softStop();
        break;
      }
    };
    canvas.addEventListener('touchend', end, { passive: true });
    canvas.addEventListener('touchcancel', end, { passive: true });
  };

  Input.KEYMAP = KEYMAP;
  Input.META = META;
  Input.toggleFullscreen = toggleFullscreen;
  /* 📱 valdymo schemos API (naudoja GET READY ekranas: render.js piešia, main.js perjungia) */
  global.RBCTL = { get: ctlGet, set: ctlSet, apply: ctlApply, KEY: CTL_KEY };
  global.Input = Input;
})(window);
