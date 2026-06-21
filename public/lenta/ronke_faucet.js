// ronke_faucet.js — RONKE kasyklos kranas (namuko faucet).
// Paspaudus namuką (House3) → šis popup'as: timer (12h cooldown) → COLLECT → random reward (RP-scaled).
// RONKE Power (RP) nustato diapazoną; reward = random(RP×MIN_F .. RP×MAX_F).
// LOKALI versija: reward pridedamas į _ronkeBalance (off-chain). Prod → RonkeReward.sol claim.
// Trigeris: window.openRonkeFaucet().  (game.js House3 click → kviečia šitą.)
//
// ⚠️ DĖMESIO: šiuo metu COOLDOWN = 1 MIN (TESTAS, grep "TEST_FAUCET_COOLDOWN").
//    PRIEŠ PRODUKCIJĄ grąžinti į 12h, kitaip = begalinio claim exploit.
(function () {
  'use strict';

  // Tema (Tiny Swords medieval) — sutampa su leaderboard.js
  var C = { wood: '#6b4a2e', woodDark: '#4a3320', parch: '#f5e6c3', teal: '#4a9da6',
            red: '#e85d5d', gold: '#ffcf5c', ink: '#3a2a18', green: '#5fae5f' };

  // ── Konfigūracija (derinama) ──
  // ⚠️⚠️⚠️ TEST_FAUCET_COOLDOWN — TESTO KODAS, IŠTRINTI PRIEŠ PRODUKCIJĄ ⚠️⚠️⚠️
  // Testavimui cooldown = 1 MIN (kad nereiktų laukti 12h). PRIEŠ PROD:
  //   1) grąžinti COOLDOWN_MS = 12*60*60*1000 (žemiau užkomentuota PROD reikšmė),
  //   2) ištrinti šį TEST bloką.
  // Grep'ink "TEST_FAUCET_COOLDOWN" kad surastum. Paliktas testas = exploit (begalinis claim).
  var COOLDOWN_MS = 12 * 60 * 60 * 1000;        // 12h (2× per dieną) — serveris turi autoritetą; čia tik display
  var _TEST_INSTANT_CLAIM = false;              // PROD: cooldown galioja
  // ⚠️⚠️⚠️ TEST_FAUCET_UX — LOKALAUS UI/UX TESTO REŽIMAS. PRIVALO BŪTI false PROD'e / NEDEPLOYINTI! ⚠️⚠️⚠️
  // true → fake RP (500, IV lyga) + instant cooldown + priverstinė LOKALI praktika (be wallet/backend),
  //   kad būtų galima testuoti visą mini-game → reveal → claim animaciją naršyklėje be deko/parašo.
  //   Reward'ai TIK off-chain (window.addRonke). Atidaryti: konsolėje window.openRonkeFaucet().
  var _TEST_MODE = false;   // PROD: tikras RP + 12h cooldown + on-chain claim (player pays gas)
  var _TEST_FAKE_RP = 1350;
  if (_TEST_MODE) { COOLDOWN_MS = 60 * 1000; }   // testui: 1 min cooldown (matosi timer + worker boost), ne 12h
  // TEST_SHORT_COOLDOWN — laikinas trumpas cooldown testui. PROD: false → 12h.
  var _TEST_SHORT_COOLDOWN = false;
  if (_TEST_SHORT_COOLDOWN) { COOLDOWN_MS = 10 * 1000; }
  var _testCdSeeded = false;                       // testui: vieną kartą užkraunam aktyvų cooldown įėjus į F10

  // ── Faucet garsai (savarankiškas Web Audio — NEpriklauso nuo _F12Audio.coin, kurio NĖRA) ──
  var _rfActx = null;
  function _rfCtx() {
    try { if (!_rfActx) { var AC = window.AudioContext || window.webkitAudioContext; _rfActx = new AC(); } if (_rfActx.state === 'suspended') _rfActx.resume(); }
    catch (_) { _rfActx = null; }
    return _rfActx;
  }
  function _rfTone(freq, t0off, dur, vol, type) {
    var c = _rfCtx(); if (!c) return; var t = c.currentTime + (t0off || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'triangle'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  var _rfSound = {
    // smūgis per žaidimą (trumpas „tuk", perfect = aukštesnis + obertonas)
    strike: function (perfect) { _rfTone(perfect ? 740 : 540, 0, 0.07, 0.16, 'square'); if (perfect) _rfTone(1180, 0.02, 0.09, 0.10, 'triangle'); },
    // viena moneta (count-up tikai)
    coin: function () { _rfTone(1175, 0, 0.06, 0.14, 'triangle'); _rfTone(1568, 0.045, 0.08, 0.11, 'triangle'); },
    // roll „tik" — reward'o skaičiavimo metu; tonas kyla su progresu (p=0..1) → slot-machine jausmas
    tick: function (p) { p = p < 0 ? 0 : p > 1 ? 1 : (p || 0); _rfTone(520 + p * 1000, 0, 0.035, 0.085 + p * 0.05, 'square'); },
    // CLAIM atskleidimas — maloni kylanti arpeggio + uodega (atskiras nuo žaidimo garsų)
    reward: function () {
      var n = [523, 659, 784, 1047];   // C5 E5 G5 C6
      for (var i = 0; i < n.length; i++) _rfTone(n[i], i * 0.075, 0.2, 0.17, 'triangle');
      _rfTone(1568, 0.30, 0.34, 0.11, 'sine');
    },
    // LUCKY ×2 — žėrinti fanfara + kibirkštys
    lucky: function () {
      var n = [659, 880, 1047, 1319, 1760];
      for (var i = 0; i < n.length; i++) _rfTone(n[i], i * 0.06, 0.22, 0.18, 'triangle');
      for (var j = 0; j < 6; j++) _rfTone(1700 + Math.random() * 1000, 0.32 + j * 0.05, 0.12, 0.07, 'sine');
    }
  };
  var _serverCooldownUntil = 0;                 // serverio cooldown pabaiga (sinchronizuojama per start/claim)
  var SKILL_POW   = 1.5;                    // tikslumo kreivė — kuo statesnė, tuo labiau atsiperka geras žaidimas
  var RP_ENDPOINT = 'https://rbkivemouxwcgrpzazxb.supabase.co/functions/v1/ronke-power';
  var CLAIM_ENDPOINT = 'https://rbkivemouxwcgrpzazxb.supabase.co/functions/v1/ronke-claim';   // server-authoritative claim + anti-cheat
  // ── EKONOMIKA: RONKE Power LYGOS (tiers) — viskas konfigūruojama balansavimui ──
  // Tik ≥ MIN_RP_TO_CLAIM gali claim'inti. Kuo aukštesnis RP → tuo aukštesnė lyga → didesnis reward diapazonas.
  // Roll: reward = rMin + skill^SKILL_POW × (rMax−rMin); 10% lucky → ×2. (Serveris = autoritetas; čia mirror.)
  var MIN_RP_TO_CLAIM = 50;                 // min RONKE Power claim'inti
  var TIERS = [
    { minRP: 50,   rMin: 19,  rMax: 50   },  // I lyga
    { minRP: 150,  rMin: 40,  rMax: 110  },  // II lyga
    { minRP: 350,  rMin: 90,  rMax: 230  },  // III lyga
    { minRP: 650,  rMin: 180, rMax: 420  },  // IV lyga
    { minRP: 1300, rMin: 380, rMax: 750  },  // V lyga
    { minRP: 1700, rMin: 520, rMax: 1000 },  // VI lyga
    { minRP: 2500, rMin: 900, rMax: 1500 },  // VII lyga (aukščiausia)
  ];
  function _tierFor(rp) { var t = TIERS[0]; for (var i = 0; i < TIERS.length; i++) { if (rp >= TIERS[i].minRP) t = TIERS[i]; } return t; }
  // ── Darbininko (PAM) pristatymo boost — kiekvienas pristatymas nuima −3..−10s nuo cooldown ──
  var BOOST_MIN_SEC = 3, BOOST_MAX_SEC = 10;
  var MAX_BOOST_FRAC = 0.5;                 // CAP: max 50% sutrumpinimas per periodą (negali apeiti dienos cap)

  var _root = null, _busy = false, _tickTimer = null;

  function _addr() {
    try {
      var w = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || '';
      if (!w && _TEST_MODE) return '0xTe57000000000000000000000000000000000001';   // fake addr UX testui
      return w;
    } catch (_) { return _TEST_MODE ? '0xTe57000000000000000000000000000000000001' : ''; }
  }
  function _key(a) { return '_ronke_faucet_last_' + String(a || '').toLowerCase(); }
  function _lastClaim(a) {
    try { return Number(localStorage.getItem(_key(a))) || 0; } catch (_) { return 0; }
  }
  function _setLastClaim(a, t) { try { localStorage.setItem(_key(a), String(t)); } catch (_) {} }
  // Boost akumuliatorius (ms, per periodą) — PAM pristatymai. Reset'inamas po claim.
  function _boostKey(a) { return '_ronke_faucet_boost_' + String(a || '').toLowerCase(); }
  function _boost(a) { try { return Number(localStorage.getItem(_boostKey(a))) || 0; } catch (_) { return 0; } }
  function _setBoost(a, ms) { try { localStorage.setItem(_boostKey(a), String(Math.max(0, ms))); } catch (_) {} }
  // Likęs laikas iki claim — su darbininko boost'u (cooldown − praėjęs − boost).
  function _remaining(a) {
    var serverRemain = _serverCooldownUntil - Date.now();
    var localRemain = _TEST_INSTANT_CLAIM ? 0 : (COOLDOWN_MS - (Date.now() - _lastClaim(a)) - _boost(a));
    return Math.max(localRemain, serverRemain > 0 ? serverRemain : 0);   // serveris = autoritetas
  }
  var _boostFlashUntil = 0;   // pill žalio žybsnio pabaiga (boost feedback)
  // window helper — game.js kviečia kai PAM įneša RONKE į namuką (delivery).
  window.RonkeFaucetBoost = function () {
    try {
      var a = _addr() || '_guest';
      if (_remaining(a) <= 0) return;                       // jau ready — nieko
      var add = (BOOST_MIN_SEC + Math.random() * (BOOST_MAX_SEC - BOOST_MIN_SEC)) * 1000;   // −3..−10s
      var cap = COOLDOWN_MS * MAX_BOOST_FRAC;               // CAP — negali sutrumpinti virš 50%
      var before = _boost(a);
      _setBoost(a, Math.min(cap, before + add));
      var shaved = _boost(a) - before;                      // realiai nuimta (gali būt 0 jei cap)
      if (shaved > 0) { _boostFlashUntil = Date.now() + 650; _showBoostFx(shaved); }
    } catch (_) {}
  };
  // BULK boost — offline kasimas (game.js _settleOfflineMining): n sėkmingų kasimų → n tick'ų (be FX), su cap.
  window.RonkeFaucetBoostBulk = function (n) {
    try {
      n = Math.floor(Number(n) || 0); if (n <= 0) return;
      var a = _addr() || '_guest';
      if (_remaining(a) <= 0) return;                              // tik per aktyvų cooldown
      var avg = (BOOST_MIN_SEC + BOOST_MAX_SEC) / 2 * 1000;        // vid. tick (~6.5s)
      var cap = COOLDOWN_MS * MAX_BOOST_FRAC;
      _setBoost(a, Math.min(cap, _boost(a) + n * avg));
    } catch (_) {}
  };
  // Floating „⏩ −Xs" virš pill — kad būtų aišku kad laikas sutrumpėjo.
  function _showBoostFx(shavedMs) {
    try {
      if (!_pillEl || _pillEl.style.display === 'none') return;
      var sec = shavedMs / 1000;
      var txt = sec >= 60 ? ('−' + Math.round(sec / 60) + 'm') : ('−' + (sec >= 10 ? Math.round(sec) : sec.toFixed(1)) + 's');
      var left = parseFloat(_pillEl.style.left) || (window.innerWidth / 2);
      var top = parseFloat(_pillEl.style.top) || (window.innerHeight / 2);
      var fx = document.createElement('div');
      fx.textContent = '⏩ ' + txt;
      fx.style.cssText = 'position:fixed;z-index:99999;left:' + Math.round(left) + 'px;top:' + Math.round(top - 14) + 'px;' +
        'transform:translate(-50%,-100%);font-family:\'Press Start 2P\',monospace,sans-serif;font-size:11px;font-weight:900;' +
        'color:#7dff96;text-shadow:0 0 6px rgba(110,255,140,.7),0 1px 2px rgba(0,0,0,.8);pointer-events:none;' +
        'transition:transform .85s ease-out,opacity .85s ease-out;opacity:1;';
      document.body.appendChild(fx);
      requestAnimationFrame(function () { fx.style.transform = 'translate(-50%,-280%)'; fx.style.opacity = '0'; });
      setTimeout(function () { try { fx.remove(); } catch (_) {} }, 900);
    } catch (_) {}
  }

  function _fmt(n) { n = Math.round(Number(n) || 0); return n.toLocaleString(); }
  function _fmtTime(ms) {
    if (ms <= 0) return 'now';
    var s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + ss + 's';
    return ss + 's';
  }

  // RONKE Power — iš ronke-power edge fn (autoritetas). Fallback: client deko galia.
  // _rpInfo — paskutinio fetch'o detalės (mirčių „paguodos prizo" bonusas rodymui claim popup'e).
  var _rpInfo = { deathBonus: 0, deaths: 0, deathRank: 0 };
  async function _fetchRP(a) {
    if (_TEST_MODE) return _TEST_FAKE_RP;   // UX testas — fake RP (be edge fn)
    try {
      var r = await fetch(RP_ENDPOINT + '?wallet=' + a, { cache: 'no-store' });
      var j = await r.json();
      if (j && typeof j.totalPower === 'number') {
        _rpInfo = { deathBonus: Number(j.deathBonus) || 0, deaths: Number(j.deaths) || 0, deathRank: Number(j.deathRank) || 0 };
        return j.totalPower;
      }
    } catch (_) {}
    // fallback — client'inis deko power (jei edge fn nepasiekiama)
    try {
      var B = window.BarracksNFT;
      if (B && B.getDeck) {
        var deck = B.getDeck(a) || [];
        // be lygių neturim — grąžinam 0 (saugu); edge fn yra pagrindinis šaltinis
        return deck.length ? 0 : 0;
      }
    } catch (_) {}
    return 0;
  }

  // ── Mirčių „paguodos prizo" badge (satisfying reward feedback claim popup'e) ──
  function _injectDBStyle() {
    if (document.getElementById('rf-db-style')) return;
    var s = document.createElement('style'); s.id = 'rf-db-style';
    s.textContent = '@keyframes rfDbGlow{0%,100%{box-shadow:0 0 0 1px rgba(0,0,0,.3),0 0 7px rgba(255,207,92,.35),inset 0 1px 7px rgba(0,0,0,.55)}50%{box-shadow:0 0 0 1px rgba(0,0,0,.3),0 0 18px rgba(255,207,92,.85),inset 0 1px 7px rgba(0,0,0,.55)}}'
      + '@keyframes rfDbPop{0%{transform:scale(.7);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}'
      + '.rf-db{animation:rfDbGlow 2.2s ease-in-out infinite,rfDbPop .45s cubic-bezier(.2,1.4,.4,1) both}';
    document.head.appendChild(s);
  }
  function _deathBonusBadge() {
    if (!_rpInfo || _rpInfo.deathBonus <= 0) return '';
    _injectDBStyle();
    var rank = _rpInfo.deathRank, mult = rank === 1 ? 3 : ((rank === 2 || rank === 3) ? 2 : 1);
    var medal = rank === 1 ? '👑' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : '🎗️'));
    var rankPill = (rank >= 1 && rank <= 3)
      ? '<span style="display:inline-block;margin-left:6px;padding:2px 7px;border-radius:8px;background:linear-gradient(180deg,#ffe089,#e8a829);color:#4a3320;font-size:9px;font-weight:900;letter-spacing:.5px;border:1px solid #b9842a;box-shadow:0 1px 2px rgba(0,0,0,.35);vertical-align:middle;">' + medal + ' TOP ' + rank + ' &middot; ' + mult + '&times;</span>'
      : '';
    return '<div class="rf-db" style="margin-top:8px;padding:7px 10px 8px;border-radius:12px;background:linear-gradient(180deg,#382818,#221810);border:2px solid #5a4226;text-align:center;">' +
             '<div style="font-size:8.5px;letter-spacing:2px;color:#d9b878;font-weight:800;">&#9904; FALLEN UNITS BONUS' + rankPill + '</div>' +
             '<div style="margin-top:4px;display:flex;align-items:baseline;justify-content:center;gap:6px;">' +
               '<span style="font-family:\'Press Start 2P\',monospace;font-size:15px;color:' + C.gold + ';text-shadow:1.4px 1.4px 0 #000,0 0 8px rgba(255,207,92,.75);">+' + _rpInfo.deathBonus + '</span>' +
               '<span style="font-size:10px;color:#b89e74;font-weight:700;">' + _rpInfo.deaths + ' NFT lost</span>' +
             '</div>' +
           '</div>';
  }

  // Serverio cooldown (be parašo, read-only) — AUTORITETAS. Naudojam suderinti pasenusį lokalų
  // localStorage cooldown'ą: jei serveris READY, o telefonas/PC dar laiko seną laiką (multi-device /
  // admin reset) — nebeblokuojam žaidėjo. Klaida/nepasiekiama → grąžinam null (paliekam lokalų elgesį).
  async function _fetchServerCooldown(a) {
    if (_TEST_MODE) return null;
    try {
      var r = await fetch(CLAIM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', wallet: a }) });
      var j = await r.json();
      if (j && j.ok && typeof j.cooldownRemaining === 'number') return j.cooldownRemaining;
    } catch (_) {}
    return null;
  }

  function _close() {
    if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
    if (_root) { _root.remove(); _root = null; }
    document.removeEventListener('keydown', _onKey, true);
  }
  function _onKey(e) { if (e.key === 'Escape') _close(); }

  // Pagrindinis turinio render — pagal būseną (cooldown / ready / no-deck).
  function _renderBody(rp) {
    var a = _addr();
    var tier = _tierFor(rp);             // lyga pagal RP
    var minR = tier.rMin, maxR = tier.rMax;
    var remain = _remaining(a);          // su darbininko boost
    var ready = remain <= 0;

    var body = document.getElementById('rf-body');
    if (!body) return;

    // ── RP kortelė (visada) ──
    var rpCard =
      '<div style="background:rgba(106,74,46,.09);border:2px solid rgba(106,74,46,.28);border-radius:13px;padding:9px 10px;margin:8px 0 11px;">' +
        '<div style="font-size:9px;letter-spacing:1.5px;color:' + C.wood + ';opacity:.85;font-weight:800;">⚡ RONKE POWER</div>' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:7px;margin-top:4px;">' +
          '<img src="ronke.png" draggable="false" style="height:25px;image-rendering:pixelated;"> ' +
          '<span style="font-size:30px;font-weight:900;color:' + C.red + ';line-height:1;text-shadow:0 1px 1px rgba(0,0,0,.18);">' + _fmt(rp) + '</span>' +
        '</div>' +
        _deathBonusBadge() +
        '</div>';

    if (rp < MIN_RP_TO_CLAIM) {
      body.innerHTML = rpCard +
        '<div style="background:rgba(74,157,166,.1);border:2px dashed ' + C.teal + ';border-radius:12px;padding:14px 10px;color:' + C.ink + ';font-size:13px;line-height:1.55;">' +
        '🪙 Need <strong>' + MIN_RP_TO_CLAIM + '+ RONKE Power</strong> to dig.<br><span style="opacity:.8;font-size:12px;">You have <strong>' + _fmt(rp) + '</strong>. Level up units or register a bigger Power Deck!</span></div>';
      return;
    }

    // (Mining yield diapazonas PASLĖPTAS — staigmena per roll)
    if (!ready) {
      var pct = Math.max(0, Math.min(100, Math.round((1 - remain / COOLDOWN_MS) * 100)));
      body.innerHTML = rpCard +
        '<div style="font-size:9px;letter-spacing:1.5px;color:' + C.ink + ';opacity:.7;font-weight:700;margin-bottom:5px;">⛏ MINING IN PROGRESS</div>' +
        '<div id="rf-timer" style="font-size:30px;font-weight:900;color:' + C.wood + ';margin-bottom:8px;text-shadow:0 1px 2px rgba(0,0,0,.25);">⏳ ' + _fmtTime(remain) + '</div>' +
        '<div style="height:12px;background:rgba(0,0,0,.18);border-radius:7px;overflow:hidden;border:2px solid ' + C.woodDark + ';box-shadow:inset 0 1px 3px rgba(0,0,0,.3);margin-bottom:12px;">' +
          '<div id="rf-progress" style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#c89a2e,#ffd66e);box-shadow:0 0 8px rgba(255,207,92,.6);transition:width .5s;"></div></div>' +
        '<button disabled style="width:100%;padding:13px;border-radius:12px;border:2px solid #9a8a6a;background:#c2b291;color:#7a6c4f;font-weight:800;font-size:14px;cursor:not-allowed;opacity:.85;">🔒 NOT READY YET</button>';
      return;
    }

    // ── READY — RANKINIS startas (mygtukas), NE auto-sign. Taip parašo atšaukimas / NEED_AUTH /
    //    connection flicker NEBESUKELIA begalinio re-sign loop'o — failure path'ai (_refresh) grįžta
    //    čia, į mygtuką, o ne vėl iškart prašo pasirašyti. (Buvo: auto _startMinigame → loop.) ──
    body.innerHTML = rpCard +
      '<div style="background:rgba(74,157,166,.1);border:2px solid ' + C.teal + ';border-radius:12px;padding:12px 10px;margin-bottom:11px;color:' + C.ink + ';font-size:12px;line-height:1.5;">' +
        '⛏ The vein is <strong style="color:#2fa84a;">READY</strong>.<br><span style="opacity:.8;font-size:11px;">Strike the gold zone — higher accuracy, bigger RONKE.</span></div>' +
      '<button id="rf-mine-now" style="width:100%;padding:14px;border-radius:12px;border:2px solid #fff3c4;background:linear-gradient(180deg,#ffe08a,' + C.gold + ' 45%,#e0a93a);color:' + C.ink + ';font-weight:900;font-size:15px;letter-spacing:1px;cursor:pointer;box-shadow:0 0 14px rgba(255,207,92,.7),0 3px 0 rgba(0,0,0,.3);text-shadow:0 1px 0 rgba(255,255,255,.5);display:flex;align-items:center;justify-content:center;gap:7px;">' +
        '<img src="ronke.png" draggable="false" style="height:1.2em;image-rendering:pixelated;"> MINE NOW</button>';
    var _mineBtn = document.getElementById('rf-mine-now');
    if (_mineBtn) {
      _mineBtn.onclick = function () { if (!_busy) _startMinigame(rp, minR, maxR); };
    }
  }

  // ── PICKAXE STRIKE mini-žaidimas (anti-bot, skill→reward) ──
  // 3 smūgiai: slankiklis bėga, tap → sustabdyk auksinėje zonoje. Tikslumas (0..1) → kur diapazone nutupia reward.
  // Botas (random tap) → žemas tikslumas → min reward. Geras žaidėjas → arti max.
  function _startMinigame(rp, minR, maxR) {
    if (_busy) return; _busy = true;
    var a = _addr();
    var body = document.getElementById('rf-body');
    if (!body) { _busy = false; return; }
    var ROUNDS = 3, round = 0, accs = [], taps = [];
    var cfg = [ { zw: 17, speed: 106.25 }, { zw: 12, speed: 144.5 }, { zw: 8.5, speed: 191.25 } ];  // zona (°) siaurėja, greitis (°/s) kyla — greičiai −15% (lėtesnė rodyklė); PRIVALO sutapti su serverio CFG
    var zc = 0, zcDir = 1, ang = 0, dir = 1, lastT = 0, raf = null, struck = false, _claimed = false, _finalReward = 0, _finalLucky = false;
    var ZONE_SPEED = 34;   // skystis lėtai keliauja per VISĄ skalę pirmyn-atgal (°/s)
    var R = 73, A_MIN = -52, A_MAX = 52;   // rodyklė juda TIK žiedo gold band (skalės) ribose; R = gold band radius
    var ROUND_TIME_MS = 60000;   // laiko biudžetas raundui (1 min) — juosta tuštėja, pasibaigus AUTO-smūgis (kad nesitaikytų amžinai)
    // ── SERVER-AUTHORITATIVE: serveris išduoda raundų trajektorijas; klientas rendina closed-form + įrašo tap-laikus ──
    var _rounds = null, _sessionId = null, _serverMode = false, _roundT0 = 0, _tapLedger = false, _tapSyncs = [], _tapSyncFailed = false, _tapChain = Promise.resolve();
    function _tri(s, lo, hi) { var Rr = hi - lo; var m = ((s - lo) % (2 * Rr) + 2 * Rr) % (2 * Rr); return lo + (m <= Rr ? m : 2 * Rr - m); }
    function _posAt(rd, t) { var zw = rd.zw; return { ang: _tri(rd.ang0 + rd.dir * rd.speed * t, A_MIN, A_MAX), zc: _tri(rd.zc0 + rd.zcDir * rd.zoneSpeed * t, A_MIN + zw, A_MAX - zw), zw: zw }; }
    function _genLocalRounds() { var rs = []; for (var i = 0; i < ROUNDS; i++) { var zw = cfg[i].zw, zMin = A_MIN + zw, zMax = A_MAX - zw; rs.push({ zw: zw, speed: cfg[i].speed, zoneSpeed: ZONE_SPEED, zc0: zMin + Math.random() * (zMax - zMin), zcDir: Math.random() < 0.5 ? 1 : -1, ang0: A_MIN + Math.random() * (A_MAX - A_MIN), dir: Math.random() < 0.5 ? 1 : -1 }); } return rs; }
    function _restoreSavedTaps(saved) {
      if (!_rounds || !Array.isArray(saved)) return;
      var n = Math.min(ROUNDS, saved.length);
      taps = []; accs = []; combo = 0;
      for (var i = 0; i < n; i++) {
        var tMs = Math.round(Number(saved[i]) || 0);
        taps[i] = tMs;
        var rd = _rounds[i], p = _posAt(rd, tMs / 1000);
        var acc = angDist(p.ang, p.zc) <= rd.zw ? (1 - angDist(p.ang, p.zc) / rd.zw) : 0;
        accs.push(acc);
        if (acc >= 0.45) combo++; else combo = 0;
      }
      round = n;
    }
    function _syncTap(roundIndex, tapMs) {
      if (!_serverMode || !_sessionId || !_tapLedger) return;
      // NUOSEKLIAI (chain) — tap'ai pasiekia serverį eilės tvarka (be race → be tap_order_mismatch).
      _tapChain = _tapChain.then(function () {
        return fetch(CLAIM_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tap', wallet: a, sessionId: _sessionId, roundIndex: roundIndex, tapMs: tapMs })
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || 'Tap sync failed');
          return j;
        });
      }).catch(function (e) { _tapSyncFailed = true; /* NEbemetam — claim turi clientTaps fallback */ });
      _tapSyncs.push(_tapChain);
    }
    function polar(deg, rr) { rr = rr || R; var r = (deg - 90) * Math.PI / 180; return { x: 100 + rr * Math.cos(r), y: 100 + rr * Math.sin(r) }; }
    function arcPath(a1, a2, rr) { rr = rr || R; var s = polar(a1, rr), e = polar(a2, rr); var large = ((((a2 - a1) % 360) + 360) % 360) > 180 ? 1 : 0; return 'M ' + s.x.toFixed(2) + ' ' + s.y.toFixed(2) + ' A ' + rr + ' ' + rr + ' 0 ' + large + ' 1 ' + e.x.toFixed(2) + ' ' + e.y.toFixed(2); }
    // FILLED juosta (annular sector) — vanduo prisitaiko prie žiedo formos (įspraustas grioveliu), o ne plona linija
    var BAND_IN = 67.5, BAND_OUT = 78.5;   // griovelio vidinis/išorinis radiusas (gold band ribos)
    function bandPath(a1, a2, rIn, rOut) {
      rIn = rIn || BAND_IN; rOut = rOut || BAND_OUT;
      var so = polar(a1, rOut), eo = polar(a2, rOut), si = polar(a2, rIn), ei = polar(a1, rIn);
      var large = ((((a2 - a1) % 360) + 360) % 360) > 180 ? 1 : 0;
      return 'M ' + so.x.toFixed(2) + ' ' + so.y.toFixed(2) +
             ' A ' + rOut + ' ' + rOut + ' 0 ' + large + ' 1 ' + eo.x.toFixed(2) + ' ' + eo.y.toFixed(2) +
             ' L ' + si.x.toFixed(2) + ' ' + si.y.toFixed(2) +
             ' A ' + rIn + ' ' + rIn + ' 0 ' + large + ' 0 ' + ei.x.toFixed(2) + ' ' + ei.y.toFixed(2) + ' Z'; }
    function angDist(x, y) { return Math.abs(((x - y + 540) % 360) - 180); }   // 0..180 laipsnių
    function notchPath(deg) { var r = (deg - 90) * Math.PI / 180, ci = Math.cos(r), si = Math.sin(r); return 'M' + (100 + (R - 8) * ci).toFixed(1) + ',' + (100 + (R - 8) * si).toFixed(1) + ' L' + (100 + (R + 8) * ci).toFixed(1) + ',' + (100 + (R + 8) * si).toFixed(1); }
    var combo = 0;   // iš eilės gerų smūgių serija (juice)
    // keyframes (vieną kartą) — screenshake, zonos pulsavimas, button press
    if (!document.getElementById('rf-mg-style')) {
      var st = document.createElement('style'); st.id = 'rf-mg-style';
      st.textContent =
        '@keyframes rfShake{0%,100%{transform:translate(0,0)}15%{transform:translate(-4px,2px)}30%{transform:translate(4px,-3px)}45%{transform:translate(-3px,-2px)}60%{transform:translate(3px,2px)}75%{transform:translate(-2px,1px)}}' +
        '@keyframes rfZonePulse{0%,100%{opacity:1}50%{opacity:.7}}' +
        '@keyframes rfBtnIdle{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}' +   // subtilus „kvėpavimas" (pritraukia dėmesį)
        '@keyframes rfLuckyPulse{0%,100%{transform:scale(1) rotate(-2deg)}50%{transform:scale(1.18) rotate(2deg)}}' +   // LUCKY badge šokinėja
        '@keyframes rfLuckyHue{0%{filter:hue-rotate(0deg) brightness(1.15)}100%{filter:hue-rotate(360deg) brightness(1.15)}}' +   // vaivorykštinis žybsnis
        '#rf-mg-strike{transition:filter .12s ease,transform .1s ease;animation:rfBtnIdle 1.8s ease-in-out infinite;}' +
        '#rf-mg-strike:hover{filter:drop-shadow(0 4px 6px rgba(0,0,0,.5)) drop-shadow(0 0 9px rgba(255,206,92,.95)) brightness(1.14) saturate(1.15)!important;transform:translateY(-3px) scale(1.07);animation:none;cursor:pointer;}' +
        '#rf-mg-strike:active{background-position:100% 50%!important;transform:translateY(2px) scale(.97);animation:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5)) brightness(1.05)!important;}';
      document.head.appendChild(st);
    }
    // ── VANDENS SMŪGIO splash (crown) — purslai šauna IŠ paviršiaus (radialiai laukan), ištempti lašai + geizeris ──
    function _burst(perfect, good) {
      var svg = document.querySelector('#rf-body svg'); if (!svg) return;
      var pt = polar(ang), ns = 'http://www.w3.org/2000/svg', parts = [];
      var nx = pt.x - 100, ny = pt.y - 100, nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;   // IŠORINĖ normalė (nuo centro)
      var nAng = Math.atan2(ny, nx), GRAV = 150;
      // baltas impact blyksnis (staigus, greitai dingsta)
      var flash = document.createElementNS(ns, 'circle');
      flash.setAttribute('cx', pt.x); flash.setAttribute('cy', pt.y); flash.setAttribute('r', perfect ? 15 : 11);
      flash.setAttribute('fill', 'rgba(240,251,255,.95)'); svg.appendChild(flash); parts.push({ el: flash, flash: 1, r0: perfect ? 15 : 11 });
      // ripple ringai (3 sluoksniai)
      var rings = perfect ? 3 : 2;
      for (var ri = 0; ri < rings; ri++) {
        var ring = document.createElementNS(ns, 'circle');
        ring.setAttribute('cx', pt.x); ring.setAttribute('cy', pt.y); ring.setAttribute('r', 4);
        ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', ri === 0 ? 'rgba(225,247,255,.9)' : (ri === 1 ? 'rgba(110,200,255,.95)' : 'rgba(60,150,235,.85)')); ring.setAttribute('stroke-width', 4.5 - ri);
        svg.appendChild(ring); parts.push({ el: ring, ring: 1, max: 50 + ri * 16, sw: 4.5 - ri, dl: ri * 0.1 });
      }
      // VANDENS GEIZERIS — ištempta elipsė šauna laukan (palei normalę) ir atgal
      var jet = document.createElementNS(ns, 'ellipse');
      jet.setAttribute('cx', pt.x); jet.setAttribute('cy', pt.y); jet.setAttribute('rx', perfect ? 4.5 : 3.5); jet.setAttribute('ry', 3);
      jet.setAttribute('fill', 'url(#rfliquid)'); jet.setAttribute('transform', 'rotate(' + (nAng * 180 / Math.PI + 90).toFixed(1) + ' ' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
      svg.appendChild(jet); parts.push({ el: jet, jet: 1, x: pt.x, y: pt.y, nAng: nAng, rx0: perfect ? 4.5 : 3.5, h: perfect ? 30 : 22 });
      // CROWN lašai — ištempti pagal greitį, šauna laukan (cone aplink normalę), bias atgal nuo paviršiaus
      var n = perfect ? 38 : good ? 28 : 16;
      for (var i = 0; i < n; i++) {
        var spread = (Math.random() - 0.5) * 2.5;                       // vėduoklė ±~72° aplink normalę
        var th = nAng + spread;
        var spd = 30 + Math.random() * (perfect ? 105 : 80);
        var vx = Math.cos(th) * spd, vy = Math.sin(th) * spd - 14;      // šiek tiek papildomai aukštyn
        var dp = document.createElementNS(ns, 'ellipse');
        var rad = 0.9 + Math.random() * (perfect ? 3.0 : 2.3);
        dp.setAttribute('rx', rad); dp.setAttribute('ry', rad);
        dp.setAttribute('fill', Math.random() < 0.35 ? '#d6f2ff' : (Math.random() < 0.6 ? '#5cb8f5' : '#1f74cf'));
        svg.appendChild(dp);
        parts.push({ el: dp, x: pt.x, y: pt.y, vx: vx, vy: vy, r0: rad, stretch: 1 });
      }
      var t0 = performance.now();
      (function anim(t) {
        var k = (t - t0) / 640;
        if (k >= 1) { parts.forEach(function (p) { try { p.el.remove(); } catch (_) {} }); return; }
        parts.forEach(function (p) {
          if (p.flash) { p.el.setAttribute('r', Math.max(0.1, p.r0 * (1 - k * 1.6))); p.el.setAttribute('opacity', Math.max(0, 1 - k * 2.4)); }
          else if (p.ring) { var kr = Math.max(0, (k - p.dl) / (1 - p.dl)); p.el.setAttribute('r', 4 + kr * p.max); p.el.setAttribute('opacity', 1 - kr); p.el.setAttribute('stroke-width', p.sw * (1 - kr)); }
          else if (p.jet) {
            var jk = Math.sin(Math.min(1, k * 1.7) * Math.PI);            // kyla ir krenta
            var hh = p.h * jk; var cx = p.x + Math.cos(p.nAng) * hh * 0.5, cy = p.y + Math.sin(p.nAng) * hh * 0.5;
            p.el.setAttribute('cx', cx.toFixed(2)); p.el.setAttribute('cy', cy.toFixed(2));
            p.el.setAttribute('ry', (3 + hh * 0.5).toFixed(2)); p.el.setAttribute('rx', (p.rx0 * (1 - k * 0.5)).toFixed(2));
            p.el.setAttribute('opacity', (1 - k).toFixed(2));
          } else {
            var px = p.x + p.vx * k, py = p.y + p.vy * k + GRAV * k * k;   // gravitacija (lašai krenta)
            // ištempimas pagal momentinį greitį (vy auga su gravitacija)
            var vyN = p.vy + 2 * GRAV * k, sp = Math.hypot(p.vx, vyN), aDeg = Math.atan2(vyN, p.vx) * 180 / Math.PI;
            var rr = Math.max(0.4, p.r0 * (1 - k * 0.3)), st = 1 + Math.min(2.2, sp / 80);
            p.el.setAttribute('cx', px.toFixed(2)); p.el.setAttribute('cy', py.toFixed(2));
            p.el.setAttribute('rx', (rr * st).toFixed(2)); p.el.setAttribute('ry', rr.toFixed(2));
            p.el.setAttribute('transform', 'rotate(' + aDeg.toFixed(1) + ' ' + px.toFixed(2) + ' ' + py.toFixed(2) + ')');
            p.el.setAttribute('opacity', (1 - k * k).toFixed(2));
          }
        });
        requestAnimationFrame(anim);
      })(t0);
    }
    function _shake(strong) {
      var panel = document.getElementById('rf-panel'); if (!panel) return;
      panel.style.animation = 'none'; void panel.offsetWidth;
      panel.style.animation = 'rfShake ' + (strong ? '0.34s' : '0.2s') + ' ease-out';
    }
    // VANDUO SUNAIKINTAS — zona „suplyšta"/išgaruoja (drain + fade), nebelieka
    function _drainWater() {
      var z1 = document.getElementById('rf-zone'), z2 = document.getElementById('rf-zone-hl'), z3 = document.getElementById('rf-zone-tick');
      var zcSnap = zc, zwSnap = cfg[round] ? cfg[round].zw : 8;   // užfiksuojam poziciją kirčio momentu
      var t0 = performance.now();
      (function anim(t) {
        var k = (t - t0) / 340;
        if (k >= 1) { [z1, z2, z3].forEach(function (e) { if (e) e.style.display = 'none'; }); return; }
        var op = 1 - k;
        // juosta „sprogsta" išorėn (sienelės prasiplečia) ir nuseka → sunaikinta
        if (z1) { z1.setAttribute('opacity', op); z1.setAttribute('d', bandPath(zcSnap - zwSnap * (1 + k * 0.9), zcSnap + zwSnap * (1 + k * 0.9), BAND_IN - k * 5, BAND_OUT + k * 7)); }
        if (z2) z2.setAttribute('opacity', op * 0.85);
        if (z3) { z3.setAttribute('opacity', op); z3.setAttribute('r', (2.6 * (1 + k * 1.8)).toFixed(2)); }   // centras „pukšteli" ir dingsta
        requestAnimationFrame(anim);
      })(t0);
    }
    // SMAIGALYS SMINGA Į VANDENĮ — užsimojimas → staigus dūris žemyn (radialiai į centrą) → atatranka
    function _strikeAnim() {
      var mk = document.getElementById('rf-mg-marker'); if (!mk) return;
      var base = 'rotate(' + ang.toFixed(2) + ' 100 100)';
      var t0 = performance.now();
      (function anim(t) {
        var k = (t - t0) / 380;
        if (k >= 1) { mk.setAttribute('transform', base); return; }
        var d;   // +d = smaigalys juda radialiai į centrą (smingimas į juostą)
        if (k < 0.15) d = -7 * (k / 0.15);                                  // užsimojimas (atsitraukia aukštyn)
        else if (k < 0.42) { var u = (k - 0.15) / 0.27; d = -7 + 27 * (u * u); }   // STAIGUS dūris žemyn (greitėjantis)
        else { var u2 = (k - 0.42) / 0.58; d = 20 * (1 - u2) * (1 - u2); }  // atatranka atgal (sušvelnėjanti)
        mk.setAttribute('transform', base + ' translate(0 ' + d.toFixed(2) + ')');
        requestAnimationFrame(anim);
      })(t0);
    }
    // PRAŠOVĖ — smaigalys įsminga į SAUSĄ AKMENĮ, ĮSTRINGA (dreba/virpa įstrigęs) → ištraukiamas
    function _strikeStuckAnim() {
      var mk = document.getElementById('rf-mg-marker'); if (!mk) return;
      var base = 'rotate(' + ang.toFixed(2) + ' 100 100)';
      var t0 = performance.now();
      (function anim(t) {
        var k = (t - t0) / 640;
        if (k >= 1) { mk.setAttribute('transform', base); return; }
        var d;   // +d = radialiai į centrą
        if (k < 0.10) d = -6 * (k / 0.10);                                   // užsimojimas
        else if (k < 0.28) { var u = (k - 0.10) / 0.18; d = -6 + 30 * (u * u); }   // KIETAS dūris į akmenį (giliau)
        else if (k < 0.80) { var s = (k - 0.28) / 0.52; d = 24 + Math.sin(s * 46) * 2.4 * (1 - s); }   // ĮSTRIGĘS — virpa/dreba ir nusistovi
        else { var u2 = (k - 0.80) / 0.20; d = 24 * (1 - u2 * u2); }          // ištraukia atgal (su pastangom)
        mk.setAttribute('transform', base + ' translate(0 ' + d.toFixed(2) + ')');
        requestAnimationFrame(anim);
      })(t0);
    }
    // PRAŠOVĖ splash → AKMENS dulkės + skeveldros (ne vanduo)
    function _dustBurst() {
      var svg = document.querySelector('#rf-body svg'); if (!svg) return;
      var pt = polar(ang), ns = 'http://www.w3.org/2000/svg', parts = [];
      // dulkių debesėlis (pilkas, plečiasi ir blanksta)
      for (var di = 0; di < 3; di++) {
        var pf = document.createElementNS(ns, 'circle');
        pf.setAttribute('cx', pt.x + (Math.random() - 0.5) * 6); pf.setAttribute('cy', pt.y + (Math.random() - 0.5) * 6); pf.setAttribute('r', 4);
        pf.setAttribute('fill', 'rgba(150,142,124,.5)'); svg.appendChild(pf);
        parts.push({ el: pf, puff: 1, max: 13 + Math.random() * 8, dl: di * 0.08 });
      }
      // akmens skeveldros (pilkos/rudos, lekia šonan + krenta su gravitacija)
      var n = 16;
      for (var i = 0; i < n; i++) {
        var aa = Math.random() * Math.PI * 2, ch = document.createElementNS(ns, 'rect');
        var sz = 1.1 + Math.random() * 2.4;
        ch.setAttribute('width', sz); ch.setAttribute('height', sz * (0.6 + Math.random() * 0.6));
        ch.setAttribute('x', pt.x); ch.setAttribute('y', pt.y);
        ch.setAttribute('fill', Math.random() < 0.4 ? '#8a8170' : (Math.random() < 0.6 ? '#6e665a' : '#a59c87'));
        ch.setAttribute('transform', 'rotate(' + (Math.random() * 360).toFixed(0) + ' ' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
        svg.appendChild(ch);
        var spd = 18 + Math.random() * 60;
        parts.push({ el: ch, x: pt.x, y: pt.y, vx: Math.cos(aa) * spd, vy: Math.sin(aa) * spd - (8 + Math.random() * 20), s0: sz });
      }
      var t0 = performance.now();
      (function anim(t) {
        var k = (t - t0) / 560;
        if (k >= 1) { parts.forEach(function (p) { try { p.el.remove(); } catch (_) {} }); return; }
        parts.forEach(function (p) {
          if (p.puff) { var kp = Math.max(0, (k - p.dl) / (1 - p.dl)); p.el.setAttribute('r', 4 + kp * p.max); p.el.setAttribute('opacity', (1 - kp) * 0.5); }
          else {
            var nx = p.x + p.vx * k, ny = p.y + p.vy * k + 130 * k * k;   // gravitacija (skeveldros krenta)
            p.el.setAttribute('x', nx.toFixed(2)); p.el.setAttribute('y', ny.toFixed(2));
            p.el.setAttribute('opacity', 1 - k * k);
          }
        });
        requestAnimationFrame(anim);
      })(t0);
    }
    // ── STIKLO suskilimas (po sėkmingo strike) → suduzimas (paskutinis) ──
    var successCount = 0;
    var CRACKS = [
      'M100,100 L94,89 L88,78 M100,100 L110,93 L121,86',                       // lvl1
      'M100,100 L91,110 L82,121 M100,100 L112,108 L122,114 M97,90 L103,86'    // lvl2 (pridedama)
    ];
    function _crackPath(level) { var d = ''; for (var i = 0; i < Math.min(level, 2); i++) d += CRACKS[i] + ' '; return d; }
    var _SVGNS = 'http://www.w3.org/2000/svg';
    function _setCracks(svg, level) {
      if (!svg) return;
      var old = svg.querySelector('#rf-cracks-g'); if (old) old.remove();
      if (level <= 0) return;
      var g = document.createElementNS(_SVGNS, 'g'); g.setAttribute('id', 'rf-cracks-g');
      var p = document.createElementNS(_SVGNS, 'path');
      p.setAttribute('d', _crackPath(level)); p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'rgba(28,32,42,.85)'); p.setAttribute('stroke-width', '1.5'); p.setAttribute('stroke-linecap', 'round');
      p.style.filter = 'drop-shadow(0 0 0.7px rgba(255,255,255,.7))';
      g.appendChild(p); svg.appendChild(g);
    }
    function _glassFlash(svg) {
      if (!svg) return;
      var c = document.createElementNS(_SVGNS, 'circle');
      c.setAttribute('cx', 100); c.setAttribute('cy', 100); c.setAttribute('r', 24); c.setAttribute('fill', 'rgba(255,255,255,.5)');
      svg.appendChild(c);
      var t0 = performance.now();
      (function a(t) { var k = (t - t0) / 230; if (k >= 1) { try { c.remove(); } catch (_) {} return; } c.setAttribute('opacity', (1 - k) * 0.5); requestAnimationFrame(a); })(t0);
    }
    function _shatter(svg) {
      if (!svg) return;
      var gp = svg.querySelector('#rf-glasspane'); if (gp) gp.remove();
      var gl = svg.querySelector('#rf-gloss'); if (gl) gl.remove();
      var cg = svg.querySelector('#rf-cracks-g'); if (cg) cg.remove();
      _shake(true);   // stiprus screenshake
      // didelis baltas flash (išsiplečia)
      var fl = document.createElementNS(_SVGNS, 'circle');
      fl.setAttribute('cx', 100); fl.setAttribute('cy', 100); fl.setAttribute('r', 28); fl.setAttribute('fill', 'rgba(255,255,255,.9)');
      svg.appendChild(fl);
      (function (f0) { requestAnimationFrame(function a(t) { var k = (t - f0) / 320; if (k >= 1) { try { fl.remove(); } catch (_) {} return; } fl.setAttribute('r', 28 + k * 22); fl.setAttribute('opacity', (1 - k) * 0.9); requestAnimationFrame(a); }); })(performance.now());
      // DIDELĖS šukės — daug, didelės, toli skrieja
      var shards = [], N = 20;
      for (var i = 0; i < N; i++) {
        var aa = Math.random() * Math.PI * 2, s = 5 + Math.random() * 7;
        var sh = document.createElementNS(_SVGNS, 'polygon');
        sh.setAttribute('points', '0,' + (-s).toFixed(1) + ' ' + (s * 0.85).toFixed(1) + ',' + (s * 0.55).toFixed(1) + ' ' + (-s * 0.75).toFixed(1) + ',' + (s * 0.65).toFixed(1));
        sh.setAttribute('fill', Math.random() < 0.5 ? 'rgba(255,255,255,.9)' : 'rgba(205,222,240,.85)');
        sh.setAttribute('stroke', 'rgba(150,190,240,.75)'); sh.setAttribute('stroke-width', '0.7');
        svg.appendChild(sh);
        var spd = 45 + Math.random() * 80;
        shards.push({ el: sh, vx: Math.cos(aa) * spd, vy: Math.sin(aa) * spd, rot: (Math.random() - 0.5) * 760 });
      }
      var t0 = performance.now();
      (function anim(t) {
        var k = (t - t0) / 950;   // ilgesnė animacija
        if (k >= 1) { shards.forEach(function (p) { try { p.el.remove(); } catch (_) {} }); return; }
        shards.forEach(function (p) {
          var x = 100 + p.vx * k, y = 100 + p.vy * k + 80 * k * k;   // gravitacija
          p.el.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') rotate(' + (p.rot * k).toFixed(0) + ')');
          p.el.setAttribute('opacity', k < 0.65 ? 1 : (1 - (k - 0.65) / 0.35));   // blunka pabaigoj
        });
        requestAnimationFrame(anim);
      })(t0);
      try { if (window._F12Audio && window._F12Audio.swordHit) window._F12Audio.swordHit(); } catch (_) {}
    }

    function _pips() {
      var s = '<div style="display:flex;justify-content:center;gap:7px;margin-bottom:10px;">';
      for (var i = 0; i < ROUNDS; i++) {
        var col, extra = '';
        if (i < round) { var ac = accs[i]; col = ac >= 0.85 ? '#6eff8a' : ac >= 0.45 ? C.gold : ac > 0 ? '#d9c7a0' : C.red; }
        else if (i === round) { col = C.gold; extra = 'box-shadow:0 0 9px ' + C.gold + ';'; }
        else { col = 'rgba(106,74,46,.28)'; }
        s += '<div style="width:12px;height:12px;border-radius:50%;background:' + col + ';border:2px solid ' + C.woodDark + ';' + extra + '"></div>';
      }
      return s + '</div>';
    }
    // einamasis taiklumas (%) — pradžioje 100%, po kiekvieno smūgio = vidurkis iš accs
    function _accPct() { return accs.length ? Math.round(accs.reduce(function (s, x) { return s + x; }, 0) / accs.length * 100) : 100; }
    function _accCol(p) { return p >= 85 ? '#2fa84a' : p >= 45 ? '#c8902e' : C.red; }
    // F12 stiliaus pixel-label (Press Start 2P + juodas outline + spalvotas glow)
    function _pxLabel(text, c, sz, glow) { return '<span style="font-family:\'Press Start 2P\',monospace;font-size:' + sz + 'px;color:' + c + ';text-shadow:1.4px 1.4px 0 #000,-1.4px 1.4px 0 #000,1.4px -1.4px 0 #000,-1.4px -1.4px 0 #000,0 0 ' + glow + 'px ' + c + ';letter-spacing:1px;">' + text + '</span>'; }
    var _prevPct = 100;
    function _updateAcc(acc) {
      var v = document.getElementById('rf-acc-center'); if (!v) return;
      var p = _accPct(), drop = _prevPct - p; _prevPct = p;
      v.textContent = p + '%'; v.setAttribute('fill', _accCol(p));
      var bad = drop > 0;   // skaičius NUKRITO (netiksliai pataikei)
      // pagrindinis skaičius — kritimo bounce (blogai: krenta žemyn + raudonas blyks; gerai: pop aukštyn)
      (function () {
        var t0 = performance.now(), baseY = 100;
        (function an(t) {
          var k = (t - t0) / 320; if (k >= 1) { v.setAttribute('y', baseY); v.setAttribute('fill', _accCol(p)); return; }
          var e = Math.sin(k * Math.PI);
          v.setAttribute('y', (baseY + (bad ? 7 : -4) * e).toFixed(2));
          if (bad) v.setAttribute('fill', k < 0.5 ? C.red : _accCol(p));
          requestAnimationFrame(an);
        })(performance.now());
      })();
      // plūduriuojantis delta indikatorius (▼ -X% krenta žemyn / ▲ +X% kyla)
      var svg = document.querySelector('#rf-body svg');
      if (svg && drop !== 0) {
        var ns = 'http://www.w3.org/2000/svg', ft = document.createElementNS(ns, 'text');
        var amt = Math.abs(drop), col = bad ? '#e85d5d' : '#7cff6e';
        ft.setAttribute('x', '100'); ft.setAttribute('text-anchor', 'middle'); ft.setAttribute('font-family', "'Press Start 2P',monospace");
        ft.setAttribute('font-size', '8'); ft.setAttribute('fill', col); ft.setAttribute('stroke', 'rgba(0,0,0,.6)'); ft.setAttribute('stroke-width', '0.6'); ft.setAttribute('paint-order', 'stroke');
        ft.textContent = (bad ? '▼ -' : '▲ +') + amt + '%'; svg.appendChild(ft);
        var t1 = performance.now(), y0 = bad ? 106 : 90, dyTot = bad ? 30 : -24;   // bad: krenta žemyn; good: kyla
        (function an(t) {
          var k = (t - t1) / 760; if (k >= 1) { try { ft.remove(); } catch (_) {} return; }
          ft.setAttribute('y', (y0 + dyTot * (bad ? k * k : k)).toFixed(2));   // bad: greitėjantis kritimas (gravitacija)
          ft.setAttribute('opacity', (1 - k * k).toFixed(2));
          requestAnimationFrame(an);
        })(performance.now());
      }
    }
    function renderRound() {
      struck = false;
      var rd = _rounds[round];
      var c = { zw: rd.zw, speed: rd.speed };   // suderinamumas su likusiu kodu
      zc = rd.zc0; zcDir = rd.zcDir;            // serverio trajektorija (NE random)
      ang = rd.ang0; dir = rd.dir;
      _roundT0 = performance.now();             // raundo starto laikas (tap-laikams)
      var tick = polar(zc);
      body.innerHTML =
        // turimas RONKE Power (lemia rewardo dydį) — mėlynas pixel art + ryškus skaičius
        '<div style="margin:3px 0 8px;display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap;"><img src="ronke.png" draggable="false" style="height:18px;image-rendering:pixelated;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));">' + _pxLabel('RONKE POWER', '#5cc0ff', 10, 5) + _pxLabel(String(rp || 0), '#ffd84a', 15, 7) +
        (_rpInfo.deathBonus > 0 ? '<span title="RONKE Power iš žuvusių NFT (mirčių paguodos prizas' + (_rpInfo.deathRank >= 1 && _rpInfo.deathRank <= 3 ? ', TOP ' + _rpInfo.deathRank : '') + '; ' + _rpInfo.deaths + ' mirčių)" style="font-family:\'Press Start 2P\',monospace;font-size:10px;color:#ff8a5c;text-shadow:0 1px 1px rgba(0,0,0,.5);white-space:nowrap;">+' + _rpInfo.deathBonus + ' &#9904;</span>' : '') + '</div>' +
        '<div style="font-size:10px;letter-spacing:1.5px;color:' + C.wood + ';font-weight:800;margin:0 0 4px;">STRIKE <span style="color:' + C.red + ';">' + (round + 1) + '</span> / ' + ROUNDS + '</div>' +
        _pips() +
        '<div style="position:relative;width:188px;height:188px;margin:2px auto 8px;">' +
          // šiltas švytėjimas už dial\'o (gylis + fokusas)
          '<div style="position:absolute;inset:-10px;border-radius:50%;background:radial-gradient(circle at 50% 46%,rgba(255,207,92,.30),rgba(255,180,70,.10) 52%,transparent 70%);pointer-events:none;"></div>' +
          // dial sprite (stone žiedas su gold top band) — fonas
          '<img src="mg_ring.png?v=1" draggable="false" style="position:absolute;inset:0;width:100%;height:100%;image-rendering:auto;filter:drop-shadow(0 3px 7px rgba(0,0,0,.5));">' +
          // SVG overlay — gold zona + rodyklė + centras
          '<svg viewBox="0 0 200 200" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">' +
            '<defs><linearGradient id="rfgold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d2"/><stop offset="0.45" stop-color="#ffc224"/><stop offset="1" stop-color="#e0840a"/></linearGradient>' +
              '<radialGradient id="rfglass" cx="0.4" cy="0.34" r="0.66"><stop offset="0" stop-color="#c4c9bb" stop-opacity="0.12"/><stop offset="0.65" stop-color="#9ba090" stop-opacity="0.26"/><stop offset="1" stop-color="#5d6253" stop-opacity="0.5"/></radialGradient>' +
              '<linearGradient id="rfliquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdf2ff"/><stop offset="0.4" stop-color="#46b6f2"/><stop offset="1" stop-color="#1463c4"/></linearGradient></defs>' +
            // SKYSČIO zona (mėlynas) — FILLED juosta prisitaiko prie žiedo griovelio; lengvai banguoja (gyvas skystis)
            '<path id="rf-zone" d="' + bandPath(zc - c.zw, zc + c.zw) + '" fill="url(#rfliquid)" stroke="rgba(16,84,170,.85)" stroke-width="1.1" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px rgba(70,180,255,.95));"/>' +
            '<path id="rf-zone-hl" d="' + arcPath(zc - c.zw + 1, zc + c.zw - 1, BAND_OUT - 2.4) + '" fill="none" stroke="rgba(238,251,255,.85)" stroke-width="1.7" stroke-linecap="round"/>' +
            '<circle id="rf-zone-tick" cx="' + tick.x.toFixed(2) + '" cy="' + tick.y.toFixed(2) + '" r="2.6" fill="#eafaff" stroke="#1f7ad0" stroke-width="1" style="filter:drop-shadow(0 0 3px rgba(150,220,255,.95));"/>' +
            // centras (dial hollow) — TAIKLUMAS % (be stiklo, be šešėlio). Label = HTML overlay (toks pat _pxLabel stilius kaip ROUGH DIG)
            '<text id="rf-acc-center" x="100" y="100" text-anchor="middle" dominant-baseline="central" font-family="\'Press Start 2P\',monospace" font-size="18" fill="' + _accCol(_accPct()) + '" stroke="rgba(0,0,0,.6)" stroke-width="0.8" paint-order="stroke" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.55));">' + _accPct() + '%</text>' +
            // marker — pointer sprite (kirtis, rodo žemyn į zoną), sukasi aplink žiedą
            '<g id="rf-mg-marker" transform="rotate(0 100 100)">' +
              '<image href="mg_pointer.png?v=1" x="83.5" y="-30" width="33" height="52" preserveAspectRatio="xMidYMid meet" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.6));"/>' +
            '</g>' +
          '</svg>' +
          // centro užrašas — tuščias žaidimo metu (tik %); finale užpildomas „RONKE"
          '<div id="rf-acc-label" style="position:absolute;left:0;right:0;top:64px;text-align:center;pointer-events:none;"></div>' +
        '</div>' +
        '<div id="rf-mg-feedback" style="height:20px;font-size:14px;font-weight:900;margin-bottom:6px;transition:transform .1s;">&nbsp;</div>' +
        '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">' +
          '<button id="rf-mg-strike" style="width:92px;height:92px;border:none;padding:0;background-color:transparent;background-image:url(mg_button.png?v=1);background-repeat:no-repeat;background-size:200% auto;background-position:0% 50%;cursor:pointer;image-rendering:auto;filter:drop-shadow(0 3px 5px rgba(0,0,0,.45));"></button>' +
          '<div id="rf-strike-label" style="font-family:\'Press Start 2P\',monospace;font-size:11px;color:' + C.red + ';text-shadow:0 1px 1px rgba(0,0,0,.5);letter-spacing:1px;">STRIKE!</div>' +
        '</div>';
      var btn = document.getElementById('rf-mg-strike');
      if (btn) { btn.onclick = doStrike; btn.onpointerdown = function (e) { if (e) e.preventDefault(); doStrike(); }; }
      lastT = performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    }
    function loop(t) {
      // CLOSED-FORM pozicija iš raundo elapsed — sutampa su serverio scoringu (taps prieš tas pačias trajektorijas)
      var el = (performance.now() - _roundT0) / 1000;
      if (!struck && el * 1000 >= ROUND_TIME_MS) { doStrike(); return; }   // po 1 min — rodyklė šauna automatiškai (random rewardas pagal poziciją)
      var rd = _rounds[round]; var zw = rd.zw;
      ang = _tri(rd.ang0 + rd.dir * rd.speed * el, A_MIN, A_MAX);
      zc = _tri(rd.zc0 + rd.zcDir * rd.zoneSpeed * el, A_MIN + zw, A_MAX - zw);
      var mk = document.getElementById('rf-mg-marker');
      if (mk) mk.setAttribute('transform', 'rotate(' + ang.toFixed(2) + ' 100 100)');
      // skystis lengvai „kvėpuoja"/banguoja — gyvas, bet švarus (be metaball netvarkos)
      var tt = t / 1000;
      var breathe = 1 + 0.08 * Math.sin(tt * 3.0);                  // plotis subtiliai pulsuoja
      var inW = BAND_IN - 0.8 * Math.sin(tt * 2.4);                 // vidinė sienelė lengvai banguoja
      var outW = BAND_OUT + 0.9 * Math.sin(tt * 2.7 + 1.1);         // išorinė sienelė lengvai banguoja
      var zwW = zw * breathe;
      var z1 = document.getElementById('rf-zone'); if (z1) z1.setAttribute('d', bandPath(zc - zwW, zc + zwW, inW, outW));
      var z2 = document.getElementById('rf-zone-hl'); if (z2) z2.setAttribute('d', arcPath(zc - zw + 1, zc + zw - 1, BAND_OUT - 2.4));
      var z3 = document.getElementById('rf-zone-tick'); if (z3) { var tk = polar(zc); z3.setAttribute('cx', tk.x.toFixed(2)); z3.setAttribute('cy', tk.y.toFixed(2)); }
      if (!struck) raf = requestAnimationFrame(loop);
    }
    function doStrike() {
      if (struck) return; struck = true;
      if (raf) cancelAnimationFrame(raf);
      var roundIdx = round;
      var tapMs = performance.now() - _roundT0; taps[roundIdx] = Math.round(tapMs);   // ĮRAŠOM tap-laiką (serveris scoreina)
      _syncTap(roundIdx, taps[roundIdx]);
      var rd = _rounds[roundIdx]; var p = _posAt(rd, tapMs / 1000); ang = p.ang; zc = p.zc;   // tikslios pozicijos tapo momentu
      var dist = angDist(ang, zc);   // kampo distancija (laipsniai)
      var acc = dist <= rd.zw ? (1 - dist / rd.zw) : 0;   // VIZUALINIS feedback (serveris turi autoritetą)
      accs.push(acc);
      var perfect = acc >= 0.85, good = acc >= 0.45;
      // combo (juice) — iš eilės good+ smūgiai
      if (good) combo++; else combo = 0;
      // ── JUICE: smaigalio dūris → effektai sutampa su smigimo momentu (impact ~110ms) ──
      if (acc > 0) {
        _strikeAnim();   // pataikė į vandenį → švarus dūris + atatranka
        setTimeout(function () {
          _burst(perfect, good);
          if (perfect) _shake(true); else if (good) _shake(false);
          try {
            if (window._F12Audio && window._F12Audio.swordHit) window._F12Audio.swordHit();
            if (perfect) _rfSound.coin();
          } catch (_) {}
        }, 110);
      } else {
        _strikeStuckAnim();   // PRAŠOVĖ → įsminga į akmenį ir ĮSTRINGA (virpa)
        setTimeout(function () {
          _dustBurst();   // akmens dulkės + skeveldros (ne vanduo)
          _shake(false);  // kietas „dunkst" į akmenį
          try { if (window._F12Audio && window._F12Audio.swordHit) window._F12Audio.swordHit(); } catch (_) {}
        }, 130);
      }
      _updateAcc(acc);   // taiklumas % atsinaujina iškart po smūgio (+ kritimo effektas jei netiksliai)
      var fb = document.getElementById('rf-mg-feedback');
      // F12 žaidimo stilius: Press Start 2P + juodas outline + spalvotas glow (PERFECT=auksinis crit, MISS=pilkas)
      var lbl = perfect ? ['PERFECT', '#ffb030'] : good ? ['GOOD', '#7cff6e'] : acc > 0 ? ['OK', '#ffffff'] : ['MISS', '#c8d2e0'];
      if (fb) {
        fb.innerHTML = _pxLabel(lbl[0], lbl[1], 12, 7) +
          (combo >= 2 ? ' ' + _pxLabel('COMBO x' + combo, '#ffb030', 9, 6) : '');
        var pop = perfect ? 1.7 : good ? 1.5 : 1.35;
        fb.style.transform = 'scale(' + pop + ')';   // pop (didesnis kuo geriau)
        fb.style.transition = 'transform .09s';
        setTimeout(function () { try { fb.style.transform = 'scale(1)'; } catch (_) {} }, perfect ? 150 : 110);
      }
      // pataikius — vanduo sunaikinamas (be stiklo mechanikos)
      var successful = acc > 0;
      if (successful) { successCount++; setTimeout(_drainWater, 110); }   // ── vanduo SUNAIKINAMAS sutampa su smigimo momentu ──
      var btn = document.getElementById('rf-mg-strike');
      if (btn) { btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'default'; }
      round++;
      // leisti animacijoms nurimti — kad žaidėjas SPĖTŲ apdoroti kas įvyko, prieš kitą raundą
      var nextDelay = acc > 0 ? (perfect ? 1450 : 1250) : 1300;   // hit / miss(stuck) ramus tempas
      setTimeout(function () { if (round < ROUNDS) renderRound(); else finish(); }, nextDelay);
    }
    function finish() {
      var skill = accs.reduce(function (s, x) { return s + x; }, 0) / ROUNDS;   // 0..1 (lokalus vizualas; serveris turi autoritetą)
      var sf = Math.max(0, Math.min(1, skill));
      // dial → reveal vieta
      var mk = document.getElementById('rf-mg-marker'); if (mk) mk.style.display = 'none';
      ['rf-zone', 'rf-zone-hl', 'rf-zone-tick'].forEach(function (id) { var e = document.getElementById(id); if (e) e.style.display = 'none'; });
      var fb = document.getElementById('rf-mg-feedback'); if (fb) fb.innerHTML = '';
      var ctr = document.getElementById('rf-acc-center'); if (ctr) ctr.style.display = 'none';
      if (_serverMode) {
        // Procentai jau matėsi žaidimo metu → praleidžiam % žingsnį, iškart į REWARD animaciją.
        _localSf = sf;   // vizualams po claim
        _setLabel('COLLECTING…', '#c8902e');
        setTimeout(function () { doClaim(); }, 350);
        return;
      }
      // ── LOKALI praktika (backend nepasiekiamas) — client reward + iškart reveal → AUTO-claim ──
      var baseReward = Math.max(1, Math.round(minR + Math.pow(skill, SKILL_POW) * (maxR - minR)));
      var lucky = Math.random() < 0.10;
      var reward = lucky ? baseReward * 2 : baseReward;
      _finalReward = reward; _finalLucky = lucky;
      _revealReward(baseReward, reward, lucky, sf);
      setTimeout(function () { doClaim(); }, lucky ? 2200 : 1500);   // po reveal animacijos
    }
    var _localSf = 0.5;
    function _showServerRewardPending(sf) {
      var lab = document.getElementById('rf-acc-label');
      var pct = Math.round(sf * 100);
      var col = sf >= 0.75 ? '#ffe14a' : sf >= 0.4 ? '#ffd84a' : '#cdb87a';
      if (lab) {
        lab.style.top = '50%'; lab.style.transform = 'translateY(-50%)';
        lab.innerHTML = '<div id="rf-reward-box" style="display:flex;flex-direction:column;align-items:center;gap:6px;transition:transform .15s;">' +
          _pxLabel('RESULT', C.gold, 10, 7) +
          '<span id="rf-reward-num">' + _pxLabel(pct + '%', col, 22, 8) + '</span>' +
          _pxLabel('SIGN TO REVEAL', '#5cc0ff', 8, 5) +
          '</div>';
      }
      var box = document.getElementById('rf-reward-box');
      var host = lab ? lab.parentNode : null;
      _popBox(box, 1.45 + sf * 0.9);
      _coinBurst(host, Math.round(5 + sf * 12), Math.max(0.25, sf * 0.55));
      try { var pnl = document.getElementById('rf-panel'); if (pnl) { pnl.style.animation = 'none'; void pnl.offsetWidth; pnl.style.animation = 'rfShake ' + (0.14 + sf * 0.16).toFixed(2) + 's ease-out'; } } catch (_) {}
      try { if (sf >= 0.55) _rfSound.coin(); } catch (_) {}
    }
    // Reveal: count-up (base) → pop + monetos → jei lucky, padvigubina. sf = skill faktorius vizualams.
    function _revealReward(baseReward, reward, lucky, sf) {
      var numCol = sf >= 0.75 ? '#ffe14a' : sf >= 0.4 ? '#ffd84a' : '#cdb87a';
      var numSz = (15 + sf * 7).toFixed(0);
      var lab = document.getElementById('rf-acc-label');
      if (lab) {
        lab.style.top = '50%'; lab.style.transform = 'translateY(-50%)';
        lab.innerHTML = '<div id="rf-reward-box" style="display:flex;flex-direction:column;align-items:center;gap:6px;transition:transform .15s;">' +
          _pxLabel('RONKE', C.gold, 11, 7) + '<span id="rf-reward-num">' + _pxLabel('+0', numCol, numSz, 7) + '</span></div>';
      }
      var numEl = document.getElementById('rf-reward-num');
      var host = lab ? lab.parentNode : null;
      // Tikras KYLANTIS skaičiavimas (ease-out) → skaičius ir garsas auga KARTU (sinchroniškai).
      var i = 0, spins = 22, _lastShown = -1;
      var spin = setInterval(function () {
        i++;
        var t = i / spins;
        var e = 1 - Math.pow(1 - t, 2.2);                 // ease-out: greitai → lėtai (landing)
        var shown = (i >= spins) ? baseReward : Math.max(1, Math.round(baseReward * e));
        if (numEl) numEl.innerHTML = _pxLabel('+' + _fmt(shown), numCol, numSz, 7);
        // garsas TIK kai skaičius pasikeitė → tiksliai sutampa su rodomu skaičiumi
        if (i < spins && shown !== _lastShown) { try { _rfSound.tick(shown / baseReward); } catch (_) {} }
        _lastShown = shown;
        if (i >= spins) {
          clearInterval(spin);
          var box = document.getElementById('rf-reward-box');
          _popBox(box, 1.45 + sf * 1.15);
          _coinBurst(host, Math.round(4 + sf * 22), sf);
          try { var pnl = document.getElementById('rf-panel'); if (pnl) { pnl.style.animation = 'none'; void pnl.offsetWidth; pnl.style.animation = 'rfShake ' + (0.18 + sf * 0.22).toFixed(2) + 's ease-out'; } } catch (_) {}
          try { _rfSound.reward(); } catch (_) {}
          if (lucky) setTimeout(function () { _luckyDouble(box, numEl, host, baseReward, reward); }, 620);
        }
      }, 60);
    }
    // skaičiaus „iššokimo" pop (peak = kiek išauga pro žiedą)
    function _popBox(box, peak) {
      if (!box) return;
      box.style.transition = 'none';
      var tp = performance.now();
      (function pop(t) {
        var k = (t - tp) / 620; if (k >= 1) { box.style.transform = 'scale(1.1)'; return; }
        var s;
        if (k < 0.30) s = 1 + (peak - 1) * Math.pow(k / 0.30, 0.7);
        else { var u = (k - 0.30) / 0.70; s = peak - (peak - 1.1) * (1 - Math.pow(1 - u, 3)); }
        box.style.transform = 'scale(' + s.toFixed(3) + ')';
        requestAnimationFrame(pop);
      })(performance.now());
    }
    // ── LUCKY ×2 šou: badge + auksinis žybsnis + skaičius padvigubėja + monetų audra ──
    function _luckyDouble(box, numEl, host, base, full) {
      var fb = document.getElementById('rf-mg-feedback');
      if (fb) fb.innerHTML = '<span style="font-family:\'Press Start 2P\',monospace;font-size:12px;color:#ffe14a;text-shadow:1.4px 1.4px 0 #000,-1.4px 1.4px 0 #000,1.4px -1.4px 0 #000,-1.4px -1.4px 0 #000,0 0 8px #ffd84a;display:inline-block;animation:rfLuckyPulse .5s ease-in-out infinite;">★ LUCKY ×2 ★</span>';
      _goldFlash();
      try { var pnl = document.getElementById('rf-panel'); if (pnl) { pnl.style.animation = 'none'; void pnl.offsetWidth; pnl.style.animation = 'rfShake .42s ease-out'; } } catch (_) {}
      try { _rfSound.lucky(); } catch (_) {}
      // skaičius greitai padvigubėja base → full
      var j = 0, steps = 14;
      var dbl = setInterval(function () {
        j++;
        var v = Math.round(base + (full - base) * (j / steps));
        if (numEl) numEl.innerHTML = _pxLabel('+' + _fmt(v), '#ffe14a', 23, 9);
        if (j >= steps) {
          clearInterval(dbl);
          _popBox(box, 2.9);            // DIDELIS iššokimas pro žiedą
          _coinBurst(host, 30, 1.2);    // monetų audra
        }
      }, 40);
    }
    // STRIKE mygtuką paverčiam CLAIM mygtuku (tas pats sprite)
    function _armClaim(label) {
      var btn = document.getElementById('rf-mg-strike');
      if (btn) {
        btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
        btn.onclick = function () { doClaim(); };
        btn.onpointerdown = function (e) { if (e) e.preventDefault(); doClaim(); };
      }
      var sl = document.getElementById('rf-strike-label'); if (sl) { sl.textContent = label || 'CLAIM'; sl.style.color = '#2fa84a'; }
    }
    function _setLabel(txt, col) { var sl = document.getElementById('rf-strike-label'); if (sl) { sl.textContent = txt; if (col) sl.style.color = col; } }
    function _claimMsg(txt, col) { var fb = document.getElementById('rf-mg-feedback'); if (fb) fb.innerHTML = _pxLabel(txt, col || '#e85d5d', 11, 7); }
    // Reveal + cooldown po sėkmingo claim (sponsored ARBA žaidėjo on-chain TX).
    function _finishServerClaim(base, reward, lucky, sf) {
      _revealReward(base, reward, lucky, sf || _localSf);
      _setLabel('CLAIMED', '#2fa84a');
      _setBoost(a, 0);                                    // naujas periodas
      _serverCooldownUntil = Date.now() + COOLDOWN_MS;    // sinchronizuojam display su serverio cooldown
      setTimeout(function () { _busy = false; _refresh(); }, 4200);
    }
    // ŽAIDĖJAS PATS pateikia on-chain claimReward (moka gas).
    // 1) Pirmu kvietimu — parodom GRAŽIĄ reveal animaciją (skaičiukai+garsai+kiek RONKE) IŠ KARTO.
    // 2) Po animacijos — „Confirm in wallet" (žaidėjas patvirtina TX → RONKE atkrenta).
    // Klaida/atšaukimas → tap retry (re-submit be re-reveal; parašas galioja, nonce nepanaudotas).
    function _submitPlayerClaim(claim, base, reward, lucky, sf, _retry) {
      if (!_retry) _revealReward(base, reward, lucky, sf || _localSf);   // animacija PIRMA
      var _doSubmit = function () {
        _setLabel('CONFIRM IN WALLET', '#c8902e');
        _claimMsg('Confirm in wallet to collect', '#c8902e');
        if (!(window.Wallet && window.Wallet.submitFaucetClaim)) {
          // be wallet submit — bent housekeeping (lokali)
          _setLabel('CLAIMED', '#2fa84a'); _setBoost(a, 0); _serverCooldownUntil = Date.now() + COOLDOWN_MS;
          setTimeout(function () { _busy = false; _refresh(); }, 4200); return;
        }
        window.Wallet.submitFaucetClaim(claim).then(function () {
          _setLabel('CLAIMED ✓', '#2fa84a'); _claimMsg('+' + _fmt(reward) + ' RONKE!', '#7cff6e');
          try { if (window._F12Audio && window._F12Audio.coin) {} } catch (_) {}
          _setBoost(a, 0); _serverCooldownUntil = Date.now() + COOLDOWN_MS;
          setTimeout(function () { _busy = false; _refresh(); }, 4200);
        }).catch(function (e) {
          _claimed = false;
          var b = document.getElementById('rf-mg-strike');
          if (b) { b.disabled = false; b.style.opacity = '1'; b.style.cursor = 'pointer'; b.onclick = function () { _submitPlayerClaim(claim, base, reward, lucky, sf, true); }; b.onpointerdown = null; }
          var msg = String((e && e.message) || e);
          var shortMsg = /reject|denied|cancel/i.test(msg) ? 'CANCELLED — tap to collect'
            : (/network|chain/i.test(msg) ? 'WRONG NETWORK'
            : (/could not send/i.test(msg) ? msg.slice(0, 40)
            : (/reverted/i.test(msg) ? 'TX REVERTED — tap retry'
            : (/pending/i.test(msg) ? 'PENDING — tap retry' : (msg.slice(0, 36) || 'TX FAILED')))));
          _claimMsg(shortMsg, '#e85d5d');
          console.warn('[faucet claim] submit failed:', msg);
          _setLabel('COLLECT', '#c8902e');
        });
      };
      if (_retry) _doSubmit(); else setTimeout(_doSubmit, lucky ? 2300 : 1500);   // leisti animacijai pasimatyti
    }
    function doClaim() {
      if (_claimed) return; _claimed = true;
      var btn = document.getElementById('rf-mg-strike'); if (btn) { btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'default'; }
      if (!_serverMode) {
        // LOKALI praktika — reward jau atskleistas, tik pritaikom off-chain
        _applyReward(a, _finalReward);
        _setLabel('CLAIMED'); _claimMsg('CLAIMED!', '#7cff6e');
        setTimeout(function () { _busy = false; _refresh(); }, 1500);
        return;
      }
      // ── SERVER mode: autorizacija jau pasirašyta PRIEŠ žaidimą (sign-first) → tik sync + claim ──
      _setLabel('SYNC…', '#c8902e');
      // NElaukiam kad VISI tap-syncai pavyktų — claim siunčia `taps` (clientTaps) kaip fallback.
      // Jei serverio tap-ledger nepilnas, serveris priima clientTaps (anti-cheat scoring vis tiek skaičiuoja).
      Promise.all(_tapSyncs.map(function (p) { return p.catch(function () {}); })).then(function () {
        _setLabel('CLAIMING…', '#c8902e');
        return fetch(CLAIM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'claim', wallet: a, sessionId: _sessionId, taps: taps }) }).then(function (r) { return r.json(); });
      }).then(function (j) {
        if (j && j.ok) {
          var reward = Number(j.reward) || 0, lucky = !!j.lucky;
          var sf = Math.max(0, Math.min(1, (Number(j.skillBps) || 0) / 10000));
          var base = lucky ? Math.round(reward / 2) : reward;
          if (j.playerPays && j.claim) {
            // ── ŽAIDĖJAS PATS pateikia on-chain TX (moka gas → PoD unikalus adresas) ──
            _submitPlayerClaim(j.claim, base, reward, lucky, sf);
          } else {
            // sponsored relay (FAUCET_PLAYER_PAYS=false) — reward jau on-chain
            _finishServerClaim(base, reward, lucky, sf);
          }
        } else if (j && j.code === 'ANTICHEAT') {
          _claimMsg('⚠ BLOCKED', '#e85d5d'); _setLabel('BLOCKED', '#e85d5d');
          setTimeout(function () { _busy = false; _refresh(); }, 2500);
        } else if (j && /cooldown/i.test(j.error || '')) {
          _claimMsg('ON COOLDOWN', '#c8902e'); setTimeout(function () { _busy = false; _refresh(); }, 1800);
        } else {
          // atstatom — leidžiam bandyt dar kartą
          _claimed = false;
          var btn2 = document.getElementById('rf-mg-strike'); if (btn2) { btn2.disabled = false; btn2.style.opacity = '1'; btn2.style.cursor = 'pointer'; }
          _claimMsg((j && j.error) ? String(j.error).slice(0, 22) : 'CLAIM FAILED', '#e85d5d'); _setLabel('RETRY', '#e85d5d');
        }
      }).catch(function (e) {
        _claimed = false;
        var btn3 = document.getElementById('rf-mg-strike'); if (btn3) { btn3.disabled = false; btn3.style.opacity = '1'; btn3.style.cursor = 'pointer'; }
        var msg = String((e && e.message) || e);
        _claimMsg(/sync/i.test(msg) ? 'SYNC FAILED' : (/reject|denied|cancel/i.test(msg) ? 'SIGN CANCELLED' : 'ERROR'), '#e85d5d'); _setLabel('RETRY', '#e85d5d');
      });
    }
    _beginSession();

    // SIGN-FIRST: žaidėjas autorizuoja PINIGINĖJE pirma → tada POST start su parašu → sesija + raundai.
    // (anti-cheat: įsipareigojimas PRIEŠ matant rezultatą; antro parašo claim'e nereikia.)
    function _beginSession() {
      var bodyEl = document.getElementById('rf-body');
      var boostSeconds = Math.round(_boost(a) / 1000);   // darbininko nukastas laikas (serveris pripažįsta, su cap)
      if (_TEST_MODE) { _serverMode = false; _sessionId = null; _rounds = _genLocalRounds(); renderRound(); return; }   // UX testas — lokali praktika
      function _postStart(auth) {
        if (bodyEl) bodyEl.innerHTML = '<div style="padding:46px 16px;color:' + C.ink + ';font-family:\'Press Start 2P\',monospace;font-size:11px;line-height:1.8;">⛏ Preparing<br>the vein…</div>';
        var payload = { action: 'start', wallet: a, boostSeconds: boostSeconds };
        if (auth) { payload.deadline = auth.deadline; payload.nonce = auth.nonce; payload.signature = auth.signature; }
        fetch(CLAIM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j && j.ok && Array.isArray(j.rounds) && j.rounds.length === ROUNDS) {
              _serverMode = true; _sessionId = j.sessionId; _rounds = j.rounds;
              _tapLedger = !!j.tapLedger;
              if (Array.isArray(j.savedTaps) && j.savedTaps.length) _restoreSavedTaps(j.savedTaps);
              if (round >= ROUNDS) finish(); else renderRound();
              return;
            }
            if (j && /cooldown/i.test(j.error || '')) { if (j.remainingSeconds) _serverCooldownUntil = Date.now() + j.remainingSeconds * 1000; _busy = false; _refresh(); return; }
            if (j && /RONKE Power/i.test(j.error || '')) { _busy = false; _refresh(); return; }
            if (j && j.code === 'NEED_AUTH') { _busy = false; _refresh(); return; }   // parašo nebuvo/blogas — atgal į READY
            // backend klaida → lokali praktika (vis tiek leidžiam žaisti, claim bus off-chain)
            _serverMode = false; _sessionId = null; _rounds = _genLocalRounds(); renderRound();
          })
          .catch(function () { _serverMode = false; _sessionId = null; _rounds = _genLocalRounds(); renderRound(); });
      }
      if (window.Wallet && window.Wallet.signFaucetClaim) {
        if (bodyEl) bodyEl.innerHTML = '<div style="padding:46px 16px;color:' + C.ink + ';font-family:\'Press Start 2P\',monospace;font-size:11px;line-height:1.8;">✍ Authorize<br>in your wallet…</div>';
        window.Wallet.signFaucetClaim().then(function (sg) { _postStart(sg); }).catch(function () {
          // parašas atšauktas → grįžtam į READY (sesija NEsukurta, cooldown nepaliestas)
          _busy = false; _refresh();
        });
      } else {
        // be piniginės parašo → tik lokali praktika (off-chain reward)
        _serverMode = false; _sessionId = null; _rounds = _genLocalRounds(); renderRound();
      }
    }
  }

  // Po mini-žaidimo — atskleidžiam reward (count-up) + pritaikom (su juice).
  function _finishCollect(a, reward, skill) {
    var body = document.getElementById('rf-body');
    var pctTxt = Math.round(skill * 100) + '%';
    var skillColor = skill >= 0.7 ? '#2fa84a' : skill >= 0.35 ? C.wood : C.red;
    var grade = skill >= 0.85 ? '⭐ FLAWLESS MINING!' : skill >= 0.6 ? '⛏ GREAT DIG!' : skill >= 0.3 ? '⛏ MINED' : '· ROUGH DIG';
    if (body) body.innerHTML =
      '<div style="font-size:11px;letter-spacing:1px;color:' + skillColor + ';font-weight:900;margin-bottom:2px;">' + grade + '</div>' +
      '<div style="font-size:9px;letter-spacing:1px;color:' + C.ink + ';opacity:.6;margin-bottom:4px;">ACCURACY ' + pctTxt + '</div>' +
      '<div id="rf-result" style="font-size:36px;font-weight:900;color:' + C.green + ';margin:6px 0 4px;min-height:44px;text-shadow:0 1px 2px rgba(0,0,0,.15);transition:transform .12s;display:flex;align-items:center;justify-content:center;gap:7px;"></div>';
    var resultEl = document.getElementById('rf-result');
    var i = 0, spins = 16, spinHi = Math.max(2, Math.ceil(reward * 1.25));
    var spin = setInterval(function () {
      i++;
      var shown = (i >= spins) ? reward : Math.floor(1 + Math.random() * spinHi);
      if (resultEl) {
        if (i >= spins) {
          resultEl.innerHTML = '<img src="ronke.png" style="height:30px;image-rendering:pixelated;"> +' + _fmt(shown);
          resultEl.style.transform = 'scale(1.35)';   // galutinis bounce
          setTimeout(function () { try { resultEl.style.transform = 'scale(1)'; } catch (_) {} }, 150);
          try { var pnl = document.getElementById('rf-panel'); if (pnl) { pnl.style.animation = 'none'; void pnl.offsetWidth; pnl.style.animation = 'rfShake .3s ease-out'; } } catch (_) {}
        } else { resultEl.textContent = _fmt(shown); }
      }
      if (i >= spins) {
        clearInterval(spin);
        _applyReward(a, reward);
        setTimeout(function () { _busy = false; _refresh(); }, 1700);
      }
    }, 65);
  }

  function _applyReward(a, reward) {
    _setLastClaim(a, Date.now());
    _setBoost(a, 0);   // naujas periodas — boost atstatomas
    // LOKALI: pridedam per game.js window.addRonke (balansas + badge + saveProfile).
    // PROD: čia vietoj to → on-chain RonkeReward.claimReward (server-signed EIP-712, relayer → PoD).
    try { if (typeof window.addRonke === 'function') window.addRonke(reward); } catch (_) {}
    try { _rfSound.coin(); } catch (_) {}
  }

  // Perrender (po wallet/RP fetch arba collect)
  async function _refresh() {
    var a = _addr();
    if (!a) {
      var b = document.getElementById('rf-body');
      if (b) b.innerHTML = '<div style="text-align:center;padding:18px;color:' + C.ink + ';">Connect your wallet to use the mine.</div>';
      return;
    }
    var _res = await Promise.all([_fetchRP(a), _fetchServerCooldown(a)]);
    var rp = _res[0], _scd = _res[1];
    // Serveris = cooldown autoritetas. READY → išvalom pasenusį lokalų laiką (kad telefonas/PC neblokuotų);
    // cooldown → sinchronizuojam display. (Klaida/null → paliekam lokalų elgesį.) Serveris vis tiek
    // enforce'ina cooldown'ą per `start`, tad lokalaus išvalymas nesukelia double-claim rizikos.
    if (_scd !== null) {
      if (_scd <= 0) { _setLastClaim(a, 0); _serverCooldownUntil = 0; }
      else { _serverCooldownUntil = Date.now() + _scd * 1000; }
    }
    _renderBody(rp);
    // timer tick (jei cooldown)
    if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
    _tickTimer = setInterval(function () {
      var t = document.getElementById('rf-timer');
      if (!t) return;
      var remain = _remaining(a);          // su darbininko boost
      if (remain <= 0) { _renderBody(rp); }   // tapo ready → perrender
      else {
        t.textContent = '⏳ ' + _fmtTime(remain);
        var pb = document.getElementById('rf-progress');   // progreso baras atsinaujina su boost
        if (pb) pb.style.width = Math.max(0, Math.min(100, Math.round((1 - remain / COOLDOWN_MS) * 100))) + '%';
      }
    }, 1000);
  }

  // Procedūrinis pixel-art fonas: šiltų akmens plytų siena + auksinės rūdos gyslos + fakelo švytėjimas (šviesus, kad tekstas liktų įskaitomas)
  function _mineBgSvg() {
    return '<svg width="100%" height="100%" viewBox="0 0 360 480" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style="display:block;">' +
      '<defs>' +
        '<linearGradient id="rfbgbase" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efe0bd"/><stop offset="1" stop-color="#d8bf8f"/></linearGradient>' +
        '<radialGradient id="rfbgtorch" cx="0.5" cy="0.1" r="0.62"><stop offset="0" stop-color="#ffe6a8" stop-opacity="0.75"/><stop offset="1" stop-color="#ffe6a8" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="rfbgvig" cx="0.5" cy="0.44" r="0.78"><stop offset="0.45" stop-color="#5a4326" stop-opacity="0"/><stop offset="1" stop-color="#3f2c14" stop-opacity="0.55"/></radialGradient>' +
        '<pattern id="rfbrick" width="64" height="34" patternUnits="userSpaceOnUse">' +
          '<rect width="64" height="34" fill="none"/>' +
          '<line x1="0" y1="0" x2="64" y2="0" stroke="#a8884e" stroke-opacity="0.5" stroke-width="2"/>' +
          '<line x1="0" y1="17" x2="64" y2="17" stroke="#a8884e" stroke-opacity="0.5" stroke-width="2"/>' +
          '<line x1="16" y1="0" x2="16" y2="17" stroke="#a8884e" stroke-opacity="0.45" stroke-width="2"/>' +
          '<line x1="48" y1="17" x2="48" y2="34" stroke="#a8884e" stroke-opacity="0.45" stroke-width="2"/>' +
          '<rect x="3" y="3" width="10" height="11" fill="#ffffff" fill-opacity="0.07"/>' +   // plytų blikai
          '<rect x="35" y="20" width="10" height="11" fill="#ffffff" fill-opacity="0.07"/>' +
        '</pattern>' +
      '</defs>' +
      '<rect width="360" height="480" fill="url(#rfbgbase)"/>' +
      '<rect width="360" height="480" fill="url(#rfbrick)"/>' +
      // auksinės nuogabos / monetos rūdoje
      '<g fill="#f1c64f" opacity="0.65" style="filter:drop-shadow(0 0 2px rgba(241,198,79,.7));">' +
        '<circle cx="70" cy="118" r="3.2"/><circle cx="322" cy="126" r="3"/><circle cx="66" cy="414" r="3"/><circle cx="330" cy="406" r="2.6"/><circle cx="150" cy="138" r="2.4"/>' +
      '</g>' +
      '<rect width="360" height="480" fill="url(#rfbgtorch)"/>' +
      '<rect width="360" height="480" fill="url(#rfbgvig)"/>' +
    '</svg>';
  }

  // Aukso monetų pliūpsnis — RONKE monetos išlekia IŠ žiedo ribų (pasitenkinimas claim'inant)
  function _coinBurst(host, n, power) {
    if (!host) return;
    n = n || 16; power = power || 1;
    var cx = host.clientWidth / 2 || 94, cy = host.clientHeight / 2 || 94;
    for (var i = 0; i < n; i++) {
      var img = document.createElement('img');
      img.src = 'ronke.png'; img.draggable = false;
      var sz = (9 + Math.random() * 10) * (0.8 + power * 0.5);
      img.style.cssText = 'position:absolute;left:' + (cx - sz / 2).toFixed(1) + 'px;top:' + (cy - sz / 2).toFixed(1) + 'px;width:' + sz.toFixed(1) + 'px;height:' + sz.toFixed(1) + 'px;image-rendering:pixelated;pointer-events:none;z-index:6;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));';
      host.appendChild(img);
      var ang = Math.random() * Math.PI * 2, spd = (55 + Math.random() * 90) * (0.7 + power * 0.6);   // geras pataikymas → toliau lekia
      (function (el, vx, vy, rot) {
        var t0 = performance.now();
        (function an(t) {
          var k = (t - t0) / 750;
          if (k >= 1) { try { el.remove(); } catch (_) {} return; }
          el.style.transform = 'translate(' + (vx * k).toFixed(1) + 'px,' + (vy * k + 200 * k * k).toFixed(1) + 'px) rotate(' + (rot * k).toFixed(0) + 'deg)';   // išlekia + gravitacija + sukasi
          el.style.opacity = (1 - k * k).toFixed(2);
          requestAnimationFrame(an);
        })(performance.now());
      })(img, Math.cos(ang) * spd, Math.sin(ang) * spd - 45, (Math.random() - 0.5) * 720);
    }
  }

  // Auksinis žybsnis per visą lentą (LUCKY momentas)
  function _goldFlash() {
    var pnl = document.getElementById('rf-panel'); if (!pnl) return;
    var fl = document.createElement('div');
    fl.style.cssText = 'position:absolute;inset:0;z-index:5;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 40%,rgba(255,228,120,.9),rgba(255,200,70,.3) 45%,transparent 72%);';
    pnl.appendChild(fl);
    var t0 = performance.now();
    (function an(t) {
      var k = (t - t0) / 650; if (k >= 1) { try { fl.remove(); } catch (_) {} return; }
      fl.style.opacity = (k < 0.18 ? k / 0.18 : (1 - (k - 0.18) / 0.82)).toFixed(2);
      requestAnimationFrame(an);
    })(performance.now());
  }

  async function open() {
    if (_root) return;
    _root = document.createElement('div');
    _root.id = 'ronke-faucet-overlay';
    _root.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(20,12,6,0.78);' +
      'display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,sans-serif;';
    _root.innerHTML =
      '<div id="rf-panel" style="position:relative;background:linear-gradient(180deg,#f8eed6,' + C.parch + ');width:min(360px,93vw);' +
      'border-radius:16px;border:3px solid ' + C.woodDark + ';box-shadow:0 0 0 3px ' + C.gold + ',0 18px 50px rgba(0,0,0,.65);overflow:hidden;">' +
      // ── BACKGROUND sluoksnis (procedūrinis akmens-rūdos SVG) + lengvas parchment scrim (kad tekstas išliktų įskaitomas) ──
      '<div id="rf-bg" style="position:absolute;inset:0;z-index:0;opacity:.9;pointer-events:none;overflow:hidden;">' + _mineBgSvg() + '</div>' +
      '<div style="position:absolute;inset:0;z-index:0;background:radial-gradient(135% 95% at 50% 42%,rgba(245,232,200,.05),rgba(242,226,190,.22) 82%);pointer-events:none;"></div>' +
      // ── Antraštės banneris (wood + RONKE moneta) ──
      '<div style="position:relative;z-index:1;background:linear-gradient(180deg,#7a5636,' + C.wood + ');padding:11px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ' + C.woodDark + ';box-shadow:0 2px 6px rgba(0,0,0,.3);">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<img src="ronke.png" draggable="false" style="height:26px;image-rendering:pixelated;filter:drop-shadow(0 2px 2px rgba(0,0,0,.5));">' +
          '<span style="font-family:\'Press Start 2P\',monospace;font-size:12px;color:' + C.gold + ';text-shadow:0 2px 0 rgba(0,0,0,.55);">RONKE CLAIM</span>' +
        '</div>' +
        '<button id="rf-close" style="background:' + C.red + ';color:#fff;border:2px solid rgba(0,0,0,.25);border-radius:8px;width:30px;height:30px;font-size:15px;cursor:pointer;font-weight:800;box-shadow:0 2px 0 rgba(0,0,0,.3);">✕</button>' +
      '</div>' +
      '<div id="rf-body" style="position:relative;z-index:1;color:' + C.ink + ';text-align:center;padding:14px 16px 16px;">Loading…</div>' +
      '</div>';
    document.body.appendChild(_root);
    _root.querySelector('#rf-close').addEventListener('click', _close);
    _root.addEventListener('click', function (e) { if (e.target === _root) _close(); });
    document.addEventListener('keydown', _onKey, true);
    await _refresh();
  }

  // ─── VIRŠ-NAMUKO timer/CLAIM pill (HTML overlay ant žemėlapio, kaip barracks_nft_plots) ───
  var _pillEl = null;
  function _canvasMapper() {
    // SVARBU: žaidimo canvas id = 'canvas' (NE 'game'). querySelector('canvas') grąžintų pirmą (menu canvas) → blogos koord.
    var canvas = document.getElementById('canvas') || document.getElementById('game');
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    return { rect: rect, sx: rect.width / canvas.width, sy: rect.height / canvas.height };
  }
  // Cover mode (mobile) detekcija — PRIVALO atitikti game.js _isGameCanvasCover()
  var _coverMQ = null;
  function _isCanvasCover() {
    if (_coverMQ === null) { try { _coverMQ = window.matchMedia('(max-width: 900px) and (pointer: coarse)'); } catch (_) { _coverMQ = false; } }
    return _coverMQ && _coverMQ.matches;
  }
  function _worldToPage(wx, wy) {
    var canvas = document.getElementById('canvas') || document.getElementById('game');
    if (!canvas || !canvas.width || !canvas.height) return null;
    var cam = window.getCam ? window.getCam() : null; if (!cam) return null;
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var cxv = wx - cam.x, cyv = wy - cam.y;   // world → canvas-pixel (1:1, kaip render translate(-cam))
    // MOBILE cover mode: bitmap scaled by cover-scale ir CENTRUOTAS (overflow) — atitinka game.js _clientToCanvasXY
    if (_isCanvasCover()) {
      var cs = Math.max(r.width / canvas.width, r.height / canvas.height);
      var bx = r.left + (r.width - canvas.width * cs) / 2;
      var by = r.top + (r.height - canvas.height * cs) / 2;
      return { x: bx + cxv * cs, y: by + cyv * cs, sx: cs };
    }
    // Desktop: tiesinis mapping nuo rect (CSS scale jau įskaičiuotas getBoundingClientRect'e)
    var sx = r.width / canvas.width, sy = r.height / canvas.height;
    return { x: r.left + cxv * sx, y: r.top + cyv * sy, sx: sx };
  }
  function _ensurePill() {
    if (_pillEl) return _pillEl;
    _pillEl = document.createElement('div');
    _pillEl.id = 'ronke-faucet-pill';
    _pillEl.style.cssText = 'position:fixed;z-index:99998;transform:translate(-50%,-100%);' +
      'pointer-events:auto;cursor:pointer;white-space:nowrap;display:none;' +
      'font-family:\'Press Start 2P\',monospace,sans-serif;text-align:center;line-height:1.45;' +
      'border-radius:7px;image-rendering:pixelated;user-select:none;transition:filter .15s,transform .12s;';
    _pillEl.onmouseenter = function () { _pillEl.style.filter = 'brightness(1.12)'; };
    _pillEl.onmouseleave = function () { _pillEl.style.filter = 'none'; };
    // pointerdown + click — kad suveiktų prieš žaidimo canvas input handling (open() turi _root guard, saugu 2×)
    var _pillOpen = function (e) { if (e) { e.stopPropagation(); if (e.preventDefault) e.preventDefault(); } open(); };
    _pillEl.addEventListener('pointerdown', _pillOpen);
    _pillEl.addEventListener('click', _pillOpen);
    _pillEl.addEventListener('touchstart', _pillOpen, { passive: false });
    document.body.appendChild(_pillEl);
    return _pillEl;
  }
  var _lastHouseB = null;   // paskutinės žinomos namuko ribos — kad pill nemirgėtų / liktų VISADA virš namuko
  function _pillLoop() {
    requestAnimationFrame(_pillLoop);
    try {
      var S = window.S;
      var pill = _pillEl;
      if (!S || S.floor !== 10) { if (pill) pill.style.display = 'none'; return; }
      // Paslėpti pill'ą kai virš žemėlapio atidarytas pilno ekrano modalas (kitaip prasimuša ant viršaus).
      var _bm = document.getElementById('nft-barracks-modal');
      if (_bm && _bm.classList.contains('active')) { if (pill) pill.style.display = 'none'; return; }
      pill = _ensurePill();
      var a = _addr() || '_guest';   // rodom pill ir be wallet (be wallet → click parodys „connect")
      // TESTUI: vieną kartą įėjus į F10 užkraunam aktyvų cooldown, kad matytųsi pristatymų boostas
      if (_TEST_MODE && !_testCdSeeded) { _testCdSeeded = true; if (_lastClaim(a) === 0) { _setBoost(a, 0); _setLastClaim(a, Date.now()); } }
      var remain = _remaining(a);    // su darbininko boost
      var ready = remain <= 0;
      // Pozicija — VIRŠ namuko (RONKE MINE), virš „RONKE MINE" užrašo.
      var b = window.getHouse3Bounds ? window.getHouse3Bounds() : null;
      if (b && b.x != null) _lastHouseB = b;   // cache (kad nemirgėtų jei kadre dingo)
      b = b || _lastHouseB;
      if (!b) { pill.style.display = 'none'; return; }
      // Jei namukas už HUD panelės (kairio overlay) ar ne matomame plote — SLĖPTI (kad neuždengtų panelės).
      if (window.isAnchorVisibleWorld && !window.isAnchorVisibleWorld(b)) { pill.style.display = 'none'; return; }
      var p = _worldToPage(b.x + b.w / 2, b.y);   // namuko viršus, centre
      if (!p) { pill.style.display = 'none'; return; }
      var fs = Math.max(6, Math.round(7 * p.sx));   // šrifto dydis pagal canvas mastelį (sumažintas)
      pill.style.transform = 'translate(-50%,-100%)';
      pill.style.left = Math.round(p.x) + 'px';
      pill.style.top = Math.round(p.y - 34 * p.sx + 65) + 'px';   // nuleista 65px žemyn
      pill.style.fontSize = fs + 'px';
      pill.style.padding = Math.round(fs * 0.55) + 'px ' + Math.round(fs * 0.8) + 'px';
      pill.style.display = 'block';
      var pct = Math.max(0, Math.min(100, Math.round((1 - remain / COOLDOWN_MS) * 100)));
      if (ready) {
        // Laikas pasibaigė → „CLAIM" (auksinis, švyti) su RONKE moneta
        pill.style.background = 'linear-gradient(180deg,#ffe08a,' + C.gold + ' 45%,#e0a93a)';
        pill.style.color = C.ink;
        pill.style.border = '2px solid #fff3c4';
        pill.style.boxShadow = '0 0 0 2px ' + C.woodDark + ',0 0 16px rgba(255,207,92,.9),0 3px 0 rgba(0,0,0,.35)';
        pill.style.textShadow = '0 1px 0 rgba(255,255,255,.5)';
        pill.style.animation = 'none';   // be judėjimo
        pill.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;font-size:1.12em;">' +
          '<img src="ronke.png" draggable="false" style="height:1.25em;image-rendering:pixelated;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4));"> CLAIM</span>';
      } else {
        // Cooldown → „RONKE MINE" + timer + progreso baras (kiek prikasta)
        var _flash = Date.now() < _boostFlashUntil;   // PAM ką tik pristatė → žalias žybsnis
        pill.style.background = 'linear-gradient(180deg,#7a5636,' + C.wood + ' 40%,' + C.woodDark + ')';
        pill.style.color = C.parch;
        pill.style.border = '2px solid ' + (_flash ? '#7dff96' : C.gold);
        pill.style.boxShadow = _flash
          ? '0 0 0 2px ' + C.woodDark + ',0 0 14px rgba(110,255,140,.85),0 3px 0 rgba(0,0,0,.32)'
          : '0 0 0 2px ' + C.woodDark + ',0 3px 0 rgba(0,0,0,.32)';
        pill.style.textShadow = '0 1px 1px rgba(0,0,0,.6)';
        pill.style.animation = 'none';
        var _tcol = _flash ? '#9dffb0' : C.gold;   // timer žalias kai boost
        pill.innerHTML =
          '<div style="display:inline-flex;align-items:center;gap:4px;font-size:.72em;letter-spacing:1px;color:#e9d3a0;opacity:.95;">' +
            '<img src="ronke.png" draggable="false" style="height:1.15em;image-rendering:pixelated;vertical-align:middle;"> RONKE MINE</div>' +
          '<div style="margin-top:2px;color:' + _tcol + ';text-shadow:0 0 6px rgba(255,207,92,.5),0 1px 1px rgba(0,0,0,.7);transition:color .2s;">⏳ ' + _fmtTime(remain) + '</div>' +
          '<div style="margin-top:4px;height:4px;background:rgba(0,0,0,.45);border-radius:2px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3);">' +
            '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,' + (_flash ? '#4fd06a,#7dff96' : '#c89a2e,#ffd66e') + ');transition:width .35s;box-shadow:' + (_flash ? '0 0 8px rgba(110,255,140,.7)' : 'none') + ';"></div></div>';
      }
    } catch (_) {}
  }
  // pulse keyframes (vieną kartą)
  try {
    if (!document.getElementById('rf-pill-style')) {
      var st = document.createElement('style'); st.id = 'rf-pill-style';
      st.textContent = '@keyframes rfPulse{0%,100%{transform:translate(-50%,-100%) scale(1);}50%{transform:translate(-50%,-100%) scale(1.08);}}';
      document.head.appendChild(st);
    }
  } catch (_) {}
  requestAnimationFrame(_pillLoop);

  window.openRonkeFaucet = open;
  window.closeRonkeFaucet = _close;

  // ── TEST helperis: dirbtinai užkrauk cooldown, kad F10 matytum pristatymų boostą ──
  if (_TEST_MODE) {
    window._rfTestCooldown = function (sec) {
      var a = _addr();
      var want = (typeof sec === 'number' ? sec : COOLDOWN_MS / 1000) * 1000;
      _setBoost(a, 0);
      _setLastClaim(a, Date.now() - Math.max(0, COOLDOWN_MS - want));
      _serverCooldownUntil = 0;
      console.log('[RF TEST] cooldown ≈ ' + Math.round(want / 1000) + 's — eik į F10 kasyklą ir stebėk, kaip kiekvienas pristatymas į namuką nuima ⏩ −Xs (žalias žybsnis + timer kris).');
    };
  }
})();
