// ronkepong_launcher.js — 🎳 RonkePong (pinball) paleidyklė lenta žaidime.
//
// USER spec (07-22): PLAY mygtukas su 10h cooldown — naujas useris gali sužaisti 1 žaidimą
// NEMOKAMAI kas 10h. Cooldown per-wallet (localStorage MVP; kai bus deployinta custodial
// smart-wallet sistema — window.PlayClient perima gate'ą ir kiekvienas žaidimas taps on-chain
// TX į PoD; branch'as jau paruoštas žemiau).
//
// Žaidimas atsidaro modal-iframe (pinball/index.html — pilnai savarankiškas HTML5 canvas).
// UI ENGLISH (žaidimo taisyklė). Izoliuotas modulis — window.RonkePong.
(function () {
  if (window.RonkePong) return;

  var COOLDOWN_MS = 10 * 3600 * 1000;   // 10h tarp nemokamų žaidimų
  var _overlay = null, _btn = null, _timer = null;

  // 📱 ORIENTACIJA. „Age of Ronke" (pilis/F12) mobiliajame užrakinama LANDSCAPE (žr. orientation.js).
  //   RonkePong = VERTIKALUS pinball → jį atidarant grąžinam PORTRAIT (natūrali telefono padėtis — NEREIKIA
  //   versti telefono), o uždarant — atkuriam pilies landscape režimą. iOS / Ronin webview native lock neveikia →
  //   tyliai praeina (ten telefonas šiaip seka fizinę padėtį, tad vertikaliai laikant pinball vis tiek portrait).
  var _IS_MOBILE = /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini|Android/i.test(navigator.userAgent || '');
  function _enterPortrait() {
    if (!_IS_MOBILE) return;
    try {
      var o = screen.orientation;
      if (o && o.lock) {
        // lock('portrait') veikia kol dokumentas fullscreen (pilis jau įjungė fullscreen). Fail → unlock (seka sensorių).
        var p = o.lock('portrait');
        if (p && p.catch) p.catch(function () { try { if (o.unlock) o.unlock(); } catch (_) {} });
      } else if (o && o.unlock) {
        o.unlock();
      }
    } catch (_) {}
  }
  function _restoreLandscape() {
    if (!_IS_MOBILE) return;
    try { if (window.enterLandscape) window.enterLandscape(); } catch (_) {}   // atgal į pilies landscape (+fullscreen)
  }

  // Žaidimo (iframe) žinutės: FREE game over → po 6s uždarom + cooldown note (restart užrakintas).
  // PAID game over → NEuždarom (žaidėjas gali mokėt PLAY AGAIN). rp_exit → uždarom bet kada.
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'rp_gameover') {
      setTimeout(function () { _closeGame(); _showCooldownNote(_freeIn()); }, 6000);
    } else if (d.type === 'rp_exit') {
      _closeGame();
      if (_freeIn() > 0) _showCooldownNote(_freeIn());
    }
    // rp_gameover_paid — nieko nedarom (žaidimas rodo PLAY AGAIN 15 RONKE + EXIT)
  });

  function _addr() {
    try { if (window.Wallet && window.Wallet.getAddress) return (window.Wallet.getAddress() || '').toLowerCase(); } catch (_) {}
    return '';
  }
  function _lsKey() { return '_rp_free_used_' + (_addr() || 'guest'); }
  function _lastUsed() { try { return Number(localStorage.getItem(_lsKey())) || 0; } catch (_) { return 0; } }
  function _freeIn() { return Math.max(0, _lastUsed() + COOLDOWN_MS - Date.now()); }
  function _consumeFree() { try { localStorage.setItem(_lsKey(), String(Date.now())); } catch (_) {} }

  function _fmtWait(ms) {
    var s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h > 0 ? h + 'h ' : '') + m + 'm';
  }

  // 🎳 07-24: plaukiojantis mygtukas PAŠALINTAS — entry point DOCK'e (wallet-ui.js 🎳 PONG šalia RAID).
  //   Launcher atnaujina DOCK mygtuko hint'ą: „PONG" kai nemokamas prieinamas / countdown kai išnaudota.
  function _ensureBtn() {
    if (_timer) return;
    _tick();
    _timer = setInterval(_tick, 30000);   // countdown atsinaujina kas 30s
  }
  function _fmtShort(ms) {   // tekstinis (tooltip'ui): „1h23m" / „45m"
    var s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? (h + 'h' + m + 'm') : (m + 'm');
  }
  // Laikrodinis su „H"/„MIN" vienetais + mirksinčiu dvitaškiu (kas sekundę) + 2px tarpas — countdown'ui
  function _fmtClock(ms) {
    var s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    var U = '<span class="rp-unit">';
    if (h > 0) return h + U + 'H</span><span class="rp-colon">:</span>' + ('0' + m).slice(-2) + U + 'MIN</span>';
    return m + U + 'MIN</span>';   // <1h → tik minutės
  }
  // Kainos ženkliukas mygtuko VIRŠUJE („COST 15 RONKE"). Apatinis hint = PONG / countdown
  //   (vienodo pločio su RAID/PLAY per CSS min-width — nebekemša).
  function _costBadge(btn) {
    var b = btn.querySelector('.rp-cost-badge');
    if (!b) {
      b = document.createElement('span');
      b.className = 'rp-cost-badge';
      b.style.cssText = 'position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#000;color:#ffd97a;' +
        'font:bold 7px monospace;letter-spacing:.3px;padding:1px 5px;border-radius:4px;border:1px solid #e0a832;' +
        'white-space:nowrap;pointer-events:none;box-shadow:1px 1px 0 rgba(0,0,0,.5);z-index:1;';
      btn.appendChild(b);
    }
    return b;
  }
  function _tick() {
    var btn = document.getElementById('wui-ronkepong-btn');
    var hint = btn && btn.querySelector('.wui-home-hint');
    if (!hint) return;   // dock dar neatpiešė
    // 07-24: be laiko/kainos ant mygtuko — tiesiog „PINBALL". Free/paid tvarko _onPlay + žaidimas.
    hint.textContent = 'PINBALL'; hint.style.color = ''; hint.style.fontSize = ''; hint.style.letterSpacing = '';
    var badge = btn.querySelector('.rp-cost-badge'); if (badge) badge.style.display = 'none';
    btn.title = _freeIn() <= 0 ? 'RonkePong — 1 free game available!' : 'RonkePong — play for 15 RONKE, or wait for free game';
  }

  // ── PLAY logika ───────────────────────────────────────────────────────────
  function _onPlay() {
    // ⛓️ CUSTODIAL (PLAY_API_URL DEPLOYED): PlayClient perima — free jei kvota, kitaip paid iš
    //   RONKE depozito, kitaip deposit prompt. Backend'as viską tvarko (on-chain TX → PoD).
    if (window.PlayClient && window.PLAY_API_URL) {
      window.PlayClient.play().then(function (r) {
        if (r.ok) _openGame(r.mode === 'paid' ? 'paid' : 'free');
        else if (r.needDeposit) alert('Out of free plays!\nDeposit ' + r.need + ' RONKE (Ronin) to your game wallet:\n' + r.depositTo);
        else alert('Could not start: ' + (r.error || 'unknown'));
      });
      return;
    }
    // LOKALUS gate: nemokamas TIK jei (a) praėjo 10h IR (b) piniginėj ≥11 RON (anti-bot, kaip Barracks).
    //   Kitaip → apmokamas žaidimas (15 RONKE per žaidimo web3).
    var wait = _freeIn();
    if (wait > 0) { _openGame('paid'); return; }   // cooldown → paid
    _hasFreeRon().then(function (ok) {
      if (ok) {
        _consumeFree(); _tick(); _openGame('free');
        // 🏆 PoD: nemokamas žaidimas iki šiol buvo TIK localStorage → on-chain pėdsako nebūdavo,
        //   tad PoD nematė nei aktyvaus, nei naujo vartotojo (žaidime 58 aktyvūs, PoD rodė 2).
        //   Dabar žaidėjas PATS pasirašo nemokamą `payAndPlay(0,false,'freeplay')` į registruotą
        //   PewPewPlayV2 → tampa matomu unikaliu adresu. Mokestis NEIMAMAS (amount=0), tik gas.
        //   Fone ir best-effort: atmetus parašą ar be gas — žaidimas jau atidarytas, niekas nelūžta.
        try {
          if (window.PodActivity && window.PodActivity.enabled()) {
            window.PodActivity.claim('freeplay').catch(function () {});
          }
        } catch (_) {}
      } else { _showFreeReqNote(); _openGame('paid'); }   // <11 RON → paid
    });

  }

  // Nemokamo žaidimo tinkamumas. Buvo 11 RON — slenkstis perimtas iš Barracks treniruočių anti-bot,
  //   kur mintinami NFT. Nemokamam pinball'ui jis nieko NEsaugo: `?embed=free` tik praleidžia mokestį
  //   (`payFee → if (FREE_PLAY) return true`), jokio RONKE atlygio nėra, tad nemokamai žaidžiantis
  //   botas projektui kainuoja 0. Užtat 11 RON LAUŽĖ onboarding'ą: naujas žaidėjas gauna 0.02 RON
  //   gas-drip'ą, bet iki 11 RON nepriartėja → negali paimti nemokamo žaidimo → nepadaro nė vienos
  //   savo TX → PoD jo nemato („New users = 0"). Dabar slenkstis = tik dujos, tad grandinė užsidaro:
  //   profilis → 0.02 RON → nemokamas žaidimas kas 10h → 1 žaidėjo pasirašyta TX → Active/New user.
  //   Tunable be deploy'o per `window.PEWPEW_FREE_MIN_RON`.
  var FREE_MIN_RON = Number(window.PEWPEW_FREE_MIN_RON != null ? window.PEWPEW_FREE_MIN_RON : 0.01);
  function _hasFreeRon() {
    try {
      if (window.Wallet && window.Wallet.getRonBalance && window.Wallet.getAddress && window.Wallet.getAddress()) {
        return window.Wallet.getRonBalance().then(function (r) { return (Number(r) || 0) >= FREE_MIN_RON; }).catch(function () { return false; });
      }
    } catch (_) {}
    return Promise.resolve(false);   // neprisijungęs / nėra balanso → ne nemokamas
  }
  function _showFreeReqNote() {
    var n = document.getElementById('rp-note');
    if (!n) {
      n = document.createElement('div'); n.id = 'rp-note';
      n.style.cssText = 'position:fixed;right:12px;bottom:112px;z-index:9801;font-family:monospace;font-size:12px;' +
        'background:#241a08;border:1px solid #e0a832;border-radius:10px;padding:10px 12px;color:#ffd97a;max-width:250px;line-height:1.5;box-shadow:0 2px 10px rgba(0,0,0,.5);';
      document.body.appendChild(n);
    }
    n.innerHTML = '⛓️ <b>Free play needs 11 RON in your wallet.</b><br><span style="opacity:.75;font-size:11px;">Playing for 15 RONKE instead.</span>';
    n.style.display = 'block';
    setTimeout(function () { try { n.style.display = 'none'; } catch (_) {} }, 4500);
  }

  function _showCooldownNote(wait) {
    var n = document.getElementById('rp-note');
    if (!n) {
      n = document.createElement('div');
      n.id = 'rp-note';
      n.style.cssText = 'position:fixed;right:12px;bottom:112px;z-index:9801;font-family:monospace;font-size:12px;' +
        'background:#241a08;border:1px solid #e0a832;border-radius:10px;padding:10px 12px;color:#ffd97a;max-width:250px;line-height:1.5;box-shadow:0 2px 10px rgba(0,0,0,.5);';
      document.body.appendChild(n);
    }
    n.innerHTML = '⏳ <b>Next free game in ' + _fmtWait(wait) + '</b><br><span style="opacity:.75;font-size:11px;">1 free game every 10h — or play now for 15 RONKE.</span>';
    n.style.display = 'block';
    setTimeout(function () { try { n.style.display = 'none'; } catch (_) {} }, 4000);
  }

  // ── Žaidimo modalas (iframe) ──────────────────────────────────────────────
  // mode: 'free' (launcher davė nemokamą, žaidimas be mokesčio, replay užrakintas) arba
  //       'paid' (žaidimas ima 15 RONKE, replay leidžiamas — savaime gate'inasi mokesčiu).
  function _openGame(mode) {
    if (_overlay) return;
    var url = 'pinball/index.html?embed=' + (mode === 'paid' ? 'paid' : 'free');
    _overlay = document.createElement('div');
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(4,5,8,.96);display:flex;align-items:center;justify-content:center;';
    _overlay.innerHTML =
      '<iframe src="' + url + '" style="border:0;width:100%;height:100%;display:block;" allow="autoplay"></iframe>' +
      '<button id="rp-close" style="position:absolute;top:10px;right:12px;z-index:2;font-family:monospace;font-size:14px;font-weight:800;' +
        'padding:8px 14px;border-radius:8px;border:1px solid #866;background:#2a1c1c;color:#fbb;cursor:pointer;">✕ EXIT</button>';
    document.body.appendChild(_overlay);
    document.getElementById('rp-close').onclick = _closeGame;
    _enterPortrait();   // 📱 pinball = vertikalus → į portrait (nereikia versti telefono)
    // 🔇 07-25 FIX: nutildom PAGRINDINIO žaidimo (F9/adventure) muziką+SFX, kad nesikirstų su pinball muzika
    //   (grojo abi vienu metu). Pinball garsas yra IFRAME'e (atskiras dokumentas) → jo _applyGlobalMute neliečia.
    try { if (window._applyGlobalMute) window._applyGlobalMute(true); } catch (_) {}
    _tick();
  }
  function _closeGame() {
    if (_overlay) { try { _overlay.remove(); } catch (_) {} _overlay = null; }
    _restoreLandscape();   // 📱 atgal į pilies landscape režimą
    // 🔊 grąžinam pagrindinio žaidimo garsą pagal IŠSAUGOTĄ user pasirinkimą (ne priverstinai on)
    try { if (window._applyGlobalMute) window._applyGlobalMute(localStorage.getItem('lenta_muted') === '1'); } catch (_) {}
    _tick();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function _init() { _ensureBtn(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
  else _init();

  window.RonkePong = {
    open: _onPlay,
    close: _closeGame,
    freeInMs: _freeIn,
    refresh: _tick,   // wallet-ui dock kviečia po mygtuko atpiešimo (hint iškart teisingas)
    _resetCooldown: function () { try { localStorage.removeItem(_lsKey()); } catch (_) {} _tick(); },   // dev/test
  };
})();
