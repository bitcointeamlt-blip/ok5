// orientation.js — Axie-style: paleidus žaidimą mobiliam → fullscreen + landscape lock.
// iOS (kur orientation.lock nepalaikomas) → „Rotate your device" hint fallback.
// Desktop'e nieko nedaro. Self-contained (injektuoja savo CSS).
(function () {
  'use strict';
  var IS_MOBILE = /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini|Android/i.test(navigator.userAgent || '');
  if (!IS_MOBILE) { window.enterLandscape = function(){}; return; }

  // ── CSS injekcija (rotate hint overlay) ────────────────────────────
  var css = '\
#rotate-hint{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;\
background:linear-gradient(160deg,#16202b,#1a1226);color:#f5e6c3;text-align:center;\
font-family:system-ui,-apple-system,sans-serif;padding:24px;}\
#rotate-hint .rh-emoji{font-size:64px;animation:rhRot 1.6s ease-in-out infinite;}\
#rotate-hint .rh-t{font-size:18px;font-weight:700;margin-top:18px;color:#ffcf5c;}\
#rotate-hint .rh-s{font-size:13px;color:#9aa;margin-top:8px;}\
@keyframes rhRot{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(78deg)}}';
  try { var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); } catch (_) {}

  // ── Fullscreen + landscape lock (kviečiama iš user gesture) ─────────
  async function enterLandscape() {
    try {
      var el = document.documentElement;
      if (el.requestFullscreen) { await el.requestFullscreen({ navigationUI: 'hide' }).catch(function(){}); }
      else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
    } catch (_) {}
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape').catch(function(){});
      }
    } catch (_) {}
    setTimeout(updateRotateHint, 400);
  }

  // ── Rotate hint (rodom kai portrait + žaidimas aktyvus, lock nepavyko) ─
  function gameActive() {
    return !!document.querySelector('#screen-hub.active, #screen-game.active, #screen-floor.active');
  }
  function updateRotateHint() {
    var portrait = false;
    try { portrait = window.matchMedia('(orientation: portrait)').matches; } catch (_) {}
    var hint = document.getElementById('rotate-hint');
    if (portrait && gameActive()) {
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'rotate-hint';
        hint.innerHTML = '<div><div class="rh-emoji">📱</div><div class="rh-t">Rotate your device</div><div class="rh-s">Turn sideways for the full experience</div></div>';
        document.body.appendChild(hint);
      }
      hint.style.display = 'flex';
    } else if (hint) {
      hint.style.display = 'none';
    }
  }

  window.addEventListener('orientationchange', function () { setTimeout(updateRotateHint, 300); });
  window.addEventListener('resize', updateRotateHint);
  document.addEventListener('DOMContentLoaded', updateRotateHint);

  window.enterLandscape = enterLandscape;
  window._updateRotateHint = updateRotateHint;
})();
