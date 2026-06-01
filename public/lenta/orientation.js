// orientation.js — FORCE LANDSCAPE: žaidimas visada landscape, pats pasisuka (CSS rotate),
// nesvarbu kaip telefonas laikomas. JOKIO hint'o. Desktop'e nieko nedaro.
// Android Chrome: bando ir tikrą orientation.lock (gražiausia). iOS/WebView: CSS rotate.
//
// SVARBU touch koordinatėms: pasukus body 90° CSS'u, canvas input mapping turi naudoti
// window.__clientToLogical() + window.__logicalW/H() (žr. floor12_merge.js clientToCanvas,
// game.js F9 mapper). Be to lietimas būtų pasislinkęs.
(function () {
  'use strict';
  var IS_MOBILE = /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini|Android/i.test(navigator.userAgent || '');

  // Globalūs helperiai — visada apibrėžti (desktop'e = identity).
  function isRot() {
    if (!IS_MOBILE) return false;
    try { return window.matchMedia('(orientation: portrait)').matches; } catch (_) { return false; }
  }
  window.__forceLandscape = isRot;
  window.__logicalW = function () { return isRot() ? window.innerHeight : window.innerWidth; };
  window.__logicalH = function () { return isRot() ? window.innerWidth  : window.innerHeight; };
  // Ekrano (client) taškas → loginė landscape erdvė. Body sukamas rotate(-90deg), origin left-top, top:100%.
  // Išvedimas: gameX = innerHeight - clientY ; gameY = clientX.
  window.__clientToLogical = function (cx, cy) {
    if (!isRot()) return { x: cx, y: cy };
    return { x: window.innerHeight - cy, y: cx };
  };

  if (!IS_MOBILE) { window.enterLandscape = function () {}; return; }

  // ── CSS force-landscape injekcija ──────────────────────────────────
  var css = '\
html.fl-on, html.fl-on body { margin:0; padding:0; }\
@media (orientation: portrait) {\
  html.fl-on body {\
    transform: rotate(-90deg);\
    transform-origin: left top;\
    width: 100vh;\
    height: 100vw;\
    overflow: hidden;\
    position: absolute;\
    top: 100%;\
    left: 0;\
  }\
}';
  try { var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); } catch (_) {}
  try { document.documentElement.classList.add('fl-on'); } catch (_) {}

  // Pasikeitus orientacijai — priverčiam žaidimą perskaičiuoti layout (canvas resize).
  function relayout() { try { window.dispatchEvent(new Event('resize')); } catch (_) {} }
  window.addEventListener('orientationchange', function () { setTimeout(relayout, 200); setTimeout(relayout, 600); });

  // ── Android: papildomai bandom tikrą fullscreen+lock (gražiausia patirtis) ──
  // iOS/WebView tyliai nepavyks → liks CSS rotate. Kviečiama iš PLAY GAME (user gesture).
  async function enterLandscape() {
    try {
      var el = document.documentElement;
      if (el.requestFullscreen) { await el.requestFullscreen({ navigationUI: 'hide' }).catch(function () {}); }
      else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
    } catch (_) {}
    try {
      if (screen.orientation && screen.orientation.lock) { await screen.orientation.lock('landscape').catch(function () {}); }
    } catch (_) {}
    setTimeout(relayout, 300);
  }
  window.enterLandscape = enterLandscape;
})();
