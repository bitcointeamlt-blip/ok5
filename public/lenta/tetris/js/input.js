/* Įvedimas: klaviatūra + jutiklinis ekranas.
 * Žaidimo veiksmai keliauja į engine.press/release; meta veiksmai — į match. */
(function (global) {
  'use strict';

  var KEYMAP = {
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'ArrowDown': 'softdrop',
    'ArrowUp': 'cw',
    'KeyX': 'cw',
    'KeyZ': 'ccw',
    'ControlLeft': 'ccw',
    'ControlRight': 'ccw',
    'KeyA': 'flip',
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

    this._kd = function (e) {
      if (e.repeat) { if (KEYMAP[e.code]) e.preventDefault(); return; }
      var a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        self.down[e.code] = true;
        match.playerPress(a);
        return;
      }
      var m = META[e.code];
      if (m) { e.preventDefault(); match.meta(m); }
    };

    this._ku = function (e) {
      var a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        self.down[e.code] = false;
        /* atleidžiam tik jei joks kitas tą patį veiksmą duodantis klavišas nelaikomas */
        var stillHeld = false;
        for (var code in KEYMAP) {
          if (KEYMAP[code] === a && self.down[code]) { stillHeld = true; break; }
        }
        if (!stillHeld) match.playerRelease(a);
      }
    };

    this._blur = function () {
      for (var code in self.down) {
        if (self.down[code]) { self.down[code] = false; match.playerRelease(KEYMAP[code]); }
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
    pad.style.display = 'flex';

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
    var touchId = null, startX = 0, startY = 0, steps = 0, softOn = false;

    /* vieno langelio plotis EKRANO pikseliais: C.CELL (virtualus) × canvas mastelis */
    function cellPx() {
      var C = global.CFG || {};
      var r = canvas.getBoundingClientRect();
      var vw = (match.renderer && match.renderer.vw) || C.VW || 640;
      return Math.max(12, (C.CELL || 20) * (r.width / Math.max(1, vw)));
    }
    function stepMove(a) { match.playerPress(a); match.playerRelease(a); }
    function softStop() { if (softOn) { softOn = false; match.playerRelease('softdrop'); } }

    canvas.addEventListener('touchstart', function (e) {
      if (touchId !== null) return;              /* sekam tik pirmą pirštą */
      var t = e.changedTouches[0];
      touchId = t.identifier; startX = t.clientX; startY = t.clientY; steps = 0; softOn = false;
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
      if (touchId === null) return;
      var t = null;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) { t = e.changedTouches[i]; break; }
      }
      if (!t) return;
      if (e.cancelable) e.preventDefault();
      var cell = cellPx();
      var want = Math.round((t.clientX - startX) / cell);
      while (steps < want) { steps++; stepMove('right'); }
      while (steps > want) { steps--; stepMove('left'); }
      /* ŽEMYN: perbraukus > ~1.2 langelio žemiau pradžios taško — laikom soft drop;
       * pirštui grįžus aukščiau slenksčio — atleidžiam (galima „pristabdyti" kritimą) */
      var down = (t.clientY - startY) > cell * 1.2;
      if (down && !softOn) { softOn = true; match.playerPress('softdrop'); }
      else if (!down && softOn) softStop();
    }, { passive: false });

    var end = function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) { touchId = null; softStop(); break; }
      }
    };
    canvas.addEventListener('touchend', end, { passive: true });
    canvas.addEventListener('touchcancel', end, { passive: true });
  };

  Input.KEYMAP = KEYMAP;
  Input.META = META;
  Input.toggleFullscreen = toggleFullscreen;
  global.Input = Input;
})(window);
