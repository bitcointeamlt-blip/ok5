// orientation.js — SAFE versija (force-landscape išjungtas — gadino layout'ą: pusė juoda / mėlyna / buggy pan).
// __forceLandscape() = false → canvas input remap (game.js/floor12) NEaktyvus → originalus elgesys.
// F10 touch-pan (game.js) veikia nepriklausomai. Be hint'o. Android: bandom native lock (nekenksminga).
(function () {
  'use strict';
  window.__forceLandscape = function () { return false; };
  window.__logicalW = function () { return window.innerWidth; };
  window.__logicalH = function () { return window.innerHeight; };
  window.__clientToLogical = function (cx, cy) { return { x: cx, y: cy }; };

  var IS_MOBILE = /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini|Android/i.test(navigator.userAgent || '');
  if (!IS_MOBILE) { window.enterLandscape = function () {}; return; }

  async function enterLandscape() {
    try {
      var el = document.documentElement;
      if (el.requestFullscreen) { await el.requestFullscreen({ navigationUI: 'hide' }).catch(function () {}); }
      else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
    } catch (_) {}
    try {
      if (screen.orientation && screen.orientation.lock) { await screen.orientation.lock('landscape').catch(function () {}); }
    } catch (_) {}
  }
  window.enterLandscape = enterLandscape;

  // Pirmas user gesture → fullscreen + landscape (kad žaidimas iškart būtų full screen,
  // ne tik nuėjus į F12). Vienkartinis. Android: pasisuka+fullscreen. iOS: tyliai nepavyks.
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
