// orientation.js — SAFE versija (CSS force-landscape laikinai išjungtas — gadino layout'ą).
// __forceLandscape() = false → canvas input remap (game.js/floor12) NEaktyvuojamas → originalus elgesys.
// Be hint'o. Android Chrome: bandom native fullscreen+lock (nekenksminga, kitur tyliai nepavyks).
(function () {
  'use strict';
  // Identity helperiai — kad bet koks rotacijos guard'as kode liktų neaktyvus.
  window.__forceLandscape = function () { return false; };
  window.__logicalW = function () { return window.innerWidth; };
  window.__logicalH = function () { return window.innerHeight; };
  window.__clientToLogical = function (cx, cy) { return { x: cx, y: cy }; };

  var IS_MOBILE = /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini|Android/i.test(navigator.userAgent || '');
  if (!IS_MOBILE) { window.enterLandscape = function () {}; return; }

  // Android-only tikras orientation lock (gražiausia, kur palaikoma). iOS/WebView tyliai nepavyks.
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
})();
