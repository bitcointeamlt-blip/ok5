// orientation.js — FORCE LANDSCAPE per WRAPPER (#app-root), transform-origin center.
// Žaidimas landscape-native; portrait'e visą #app-root pasukam 90° → atrodo kaip „paguldytas".
// Touch koord. remap (__clientToLogical) + logical dims (game.js fitGameLayout, floor12 resize) — jau yra.
// Desktop / landscape telefonas → jokios rotacijos (no-op).
(function () {
  'use strict';
  var IS_MOBILE = /iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || '');

  function isRot() {
    if (!IS_MOBILE) return false;
    try { return window.matchMedia('(orientation: portrait)').matches; } catch (_) { return false; }
  }
  window.__forceLandscape = isRot;
  window.__logicalW = function () { return isRot() ? window.innerHeight : window.innerWidth; };
  window.__logicalH = function () { return isRot() ? window.innerWidth  : window.innerHeight; };
  // Ekrano taškas → loginė landscape erdvė. #app-root: translate(-50%,-50%) rotate(90deg), origin center.
  // Išvedimas (rotate +90° CW): screen=(innerWidth-ly, lx) → lx=sy, ly=innerWidth-sx.
  //   lx = landscape X (0..innerHeight), ly = landscape Y (0..innerWidth).
  window.__clientToLogical = function (cx, cy) {
    if (!isRot()) return { x: cx, y: cy };
    return { x: cy, y: window.innerWidth - cx };
  };

  if (!IS_MOBILE) { window.enterLandscape = function () {}; return; }

  // ── CSS injekcija — wrapper #app-root rotacija (origin center) portrait'e ──
  var css = '\
#app-root { position: relative; width: 100%; height: 100%; }\
@media (orientation: portrait) {\
  html.fl-on #app-root {\
    position: fixed;\
    top: 50%; left: 50%;\
    width: 100vh;\
    height: 100vw;\
    transform: translate(-50%, -50%) rotate(90deg);\
    transform-origin: center center;\
    overflow: hidden;\
  }\
  /* Game canvas mobile fill rule yra 100vw×100vh (portrait). Force-landscape metu wrapper\
     pasuktas į landscape → SUKEIČIAM canvas dims (100vh×100vw) kad užpildytų, ne pusė juoda. */\
  html.fl-on #screen-game .game-layout,\
  html.fl-on #screen-game #canvas {\
    width: 100vh !important;\
    height: 100vw !important;\
  }\
}';
  try { var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); } catch (_) {}

  // ── Sukuriam #app-root ir perkeliam į jį visus body vaikus (išskyrus script) ──
  function buildRoot() {
    if (document.getElementById('app-root')) return;
    var root = document.createElement('div');
    root.id = 'app-root';
    var kids = Array.prototype.slice.call(document.body.children);
    var moved = 0;
    kids.forEach(function (n) {
      if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.id === 'app-root') return;
      root.appendChild(n);  // perkelia (išsaugo listener'ius + ID)
      moved++;
    });
    if (moved === 0) return;
    document.body.appendChild(root);
    try { document.documentElement.classList.add('fl-on'); } catch (_) {}
    relayout();
  }

  function relayout() { try { window.dispatchEvent(new Event('resize')); } catch (_) {} }
  window.addEventListener('orientationchange', function () { setTimeout(relayout, 200); setTimeout(relayout, 600); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildRoot);
  } else {
    buildRoot();
  }

  // Android: papildomai tikras lock (jei pavyksta — device landscape, CSS rotacija nereikalinga).
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
