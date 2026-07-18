// orientation.js — F12 „ball game" FORCE-LANDSCAPE (2026-07-18, Yadyy/Cydrakke Discord).
//   Problema: Ronin dApp naršyklė = webview → native `screen.orientation.lock` NEveikia → F12 lieka portrait
//   (Android Chrome pas G3nka veikia; Ronin pas Cydrakke — ne). Sprendimas: OPT-IN „⤢" mygtukas (rodomas F12'e) →
//   CSS pasukam #canvas 90° (`body.f12-landscape` taisyklė style.css) → užpildo portrait ekraną.
//   MATEMATIŠKAI PATVIRTINTA (node): transform `rotate(90deg) translate(0,-100%)` origin top-left → footprint
//   [0,iw]×[0,ih] (JOKIO „half black"); input remap `__clientToLogical`={x:cy, y:iw-cx} → canvas coords EXACT (0 err).
//   DEFAULT OFF → jokios regresijos. Scoped: TIK mobile + F12 + portrait (native landscape'e neaktyvus → jokio
//   dvigubo pasukimo; F9/F10 nepaliesti). Native lock (Android) — atskirai, nekenksmingas webview'e.
(function () {
  'use strict';
  var _fl = false;
  try { _fl = localStorage.getItem('f12_landscape') === '1'; } catch (_) {}
  var IS_MOBILE = /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini|Android/i.test(navigator.userAgent || '');

  function inF12() { try { return typeof S !== 'undefined' && S && S.floor === 12; } catch (_) { return false; } }
  function isPortrait() { return (window.innerWidth || 0) < (window.innerHeight || 0); }
  // Force-landscape aktyvus TIK: toggle ON + mobile + esi F12 + ekranas PORTRAIT (t.y. native lock nepavyko →
  //   Ronin/iOS webview). Native landscape'e (Android Chrome pasisukęs) — false → NĖRA dvigubo pasukimo.
  window.__forceLandscape = function () { return _fl && IS_MOBILE && inF12() && isPortrait(); };
  window.__logicalW = function () { return window.__forceLandscape() ? window.innerHeight : window.innerWidth; };
  window.__logicalH = function () { return window.__forceLandscape() ? window.innerWidth : window.innerHeight; };
  // Ekrano (client) → loginė landscape erdvė. Atitinka CSS: transform-origin top-left; rotate(90deg) translate(0,-100%).
  window.__clientToLogical = function (cx, cy) {
    if (!window.__forceLandscape()) return { x: cx, y: cy };
    return { x: cy, y: (window.innerWidth || 0) - cx };
  };

  var _applied = null;
  function _sync() {
    var on = window.__forceLandscape();
    if (on !== _applied) {
      _applied = on;
      document.body.classList.toggle('f12-landscape', on);
      try { window.dispatchEvent(new Event('resize')); } catch (_) {}   // → floor12 resize() perskaičiuoja canvas (lw/lh) + fit
    }
  }
  window.__toggleF12Landscape = function () {
    _fl = !_fl;
    try { localStorage.setItem('f12_landscape', _fl ? '1' : '0'); } catch (_) {}
    _applied = null; _sync(); _syncBtn();
  };

  // ── „⤢" mygtukas (DOM, fixed kampe — NEsisuka su canvas; rodomas TIK mobile+F12) ──
  var _btn = null;
  function _ensureBtn() {
    if (_btn || !IS_MOBILE) return;
    _btn = document.createElement('button');
    _btn.id = 'f12-landscape-btn'; _btn.type = 'button'; _btn.textContent = '⤢';
    _btn.title = 'Landscape (rotate)';
    _btn.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;width:44px;height:44px;' +
      'border-radius:9px;border:1px solid #8a6a2e;background:rgba(20,16,8,0.85);color:#ffcf5c;' +
      'font:22px system-ui,sans-serif;cursor:pointer;padding:0;line-height:44px;text-align:center;' +
      'display:none;-webkit-user-select:none;user-select:none;touch-action:manipulation;box-shadow:0 2px 10px rgba(0,0,0,.5);';
    _btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); window.__toggleF12Landscape(); });
    document.body.appendChild(_btn);
  }
  function _syncBtn() {
    if (!_btn) return;
    _btn.style.background = _fl ? 'rgba(122,90,32,0.92)' : 'rgba(20,16,8,0.85)';
    _btn.style.borderColor = _fl ? '#ffcf5c' : '#8a6a2e';
  }
  // Poll (pigus): mygtuko matomumas F12'e + force-landscape sync (įėjus/išėjus/pasukus įrenginį).
  setInterval(function () {
    _ensureBtn();
    if (_btn) _btn.style.display = inF12() ? 'block' : 'none';
    _sync();
  }, 350);

  // ── Native lock (Android Chrome) — pirmas gestas → fullscreen + landscape. Webview'e fail'ina TYLIAI (nekenksm). ──
  if (!IS_MOBILE) { window.enterLandscape = function () {}; return; }
  async function enterLandscape() {
    try {
      var el = document.documentElement;
      if (el.requestFullscreen) { await el.requestFullscreen({ navigationUI: 'hide' }).catch(function () {}); }
      else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
    } catch (_) {}
    try { if (screen.orientation && screen.orientation.lock) { await screen.orientation.lock('landscape').catch(function () {}); } } catch (_) {}
  }
  window.enterLandscape = enterLandscape;
  var _firstDone = false;
  function _firstGesture() {
    if (_firstDone) return; _firstDone = true;
    document.removeEventListener('click', _firstGesture, true);
    document.removeEventListener('touchend', _firstGesture, true);
    enterLandscape();
  }
  document.addEventListener('click', _firstGesture, true);
  document.addEventListener('touchend', _firstGesture, true);
})();
