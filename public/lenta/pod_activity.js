// pod_activity.js — 🏆 PoD aktyvumo sluoksnis (izoliuotas modulis, kaip leaderboard.js).
//
// PROBLEMA (išmatuota 2026-07-26): PoD skaičiuoja „Active/New users" = unikalūs adresai, kurie PATYS
// pasirašė TX į registruotą kontraktą. Tavo žaidime žaidėjas gali žaisti valandas ir nepadaryti nė
// vienos savo TX (relayer'is pasirašo 97%, likusi dalis off-chain) → PoD rodė 2 aktyvius ir 0 naujų,
// nors žaidime 58 savaitiniai aktyvūs. Notus (283 aktyvūs / 276 nauji → 13 826 RON) daro priešingai:
// pirmas žaidėjo veiksmas per pirmas 30 s yra JO PASIRAŠYTA TX.
//
// SPRENDIMAS (be naujų kontraktų): PewPewPlayV2.payAndPlay(0, false, kind) — nemokamas kvietimas
// (RONKE nenuskaitomas, moka tik gas) į JAU registruotą kontraktą. Du taikymai:
//   1) welcome() — naujokui: gas-drip → viena TX → jis tampa „New paying user" iškart
//   2) claim(kind) — kasdienis pulsas (pvz. nemokamas pinball) → „Active user"
//
// ⚠️ VISUR DEFENSYVU: bet kokia klaida = tyliai praleidžiam ir žaidimas veikia kaip veikęs.
//    Niekada neblokuojam žaidimo dėl PoD.
(function () {
  'use strict';

  var PLAY = '';                      // PewPewPlayV2 — imam iš index.html
  try { PLAY = String(window.PEWPEW_PLAY_V2 || '').trim(); } catch (_) {}
  var GAS_DRIP = 'https://rbkivemouxwcgrpzazxb.supabase.co/functions/v1/gas-drip';
  var CHAIN_HEX = '0x7e4';            // Ronin mainnet 2020
  var MIN_GAS_WEI = 3000000000000000; // 0.003 RON — užtenka 1 pigiai TX
  var LS = '_pod_';

  function enabled() { return /^0x[0-9a-fA-F]{40}$/.test(PLAY); }

  function W() { try { return window.Wallet || null; } catch (_) { return null; } }
  function addr() {
    var w = W(); if (!w) return '';
    try { if (w.getAddress && w.getAddress()) return String(w.getAddress()); } catch (_) {}
    try { var s = w.snapshot && w.snapshot(); if (s && s.connected && s.address) return String(s.address); } catch (_) {}
    return '';
  }
  function provider() {
    var w = W();
    if (w) {
      try { var p = (w.getProvider && w.getProvider()) || (w.snapshot && w.snapshot().provider); if (p) return p; } catch (_) {}
    }
    try { return (window.ronin && window.ronin.provider) || window.ethereum || null; } catch (_) { return null; }
  }

  // ── ABI encoding: payAndPlay(uint256 amount, bool paid, string kind) ──
  function pad64(h) { return String(h).replace(/^0x/, '').toLowerCase().padStart(64, '0'); }
  function encodePayAndPlay(amountWei, paid, kind) {
    var b = [], i;
    for (i = 0; i < kind.length; i++) b.push(kind.charCodeAt(i) & 0xff);
    var hex = ''; for (i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, '0');
    var padded = b.length ? hex.padEnd(Math.ceil(b.length / 32) * 64, '0') : '';
    return '0x162fe520' + pad64(amountWei.toString(16)) + pad64(paid ? '1' : '0')
      + pad64((96).toString(16)) + pad64(b.length.toString(16)) + padded;
  }

  function get(k) { try { return localStorage.getItem(LS + k) || ''; } catch (_) { return ''; } }
  function set(k, v) { try { localStorage.setItem(LS + k, String(v)); } catch (_) {} }

  async function ronBalance(p, a) {
    try { return parseInt(await p.request({ method: 'eth_getBalance', params: [a, 'latest'] }), 16) || 0; }
    catch (_) { return 0; }
  }

  // Vienkartinis gas naujokui (serveris dedupina per `gas_drips` — pakartotinis kvietimas saugus).
  async function ensureGas(a) {
    try {
      await fetch(GAS_DRIP, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: a }),
      });
      return true;
    } catch (_) { return false; }
  }

  // Pagrindinė funkcija: žaidėjas PATS pasirašo nemokamą TX į registruotą kontraktą.
  //   opts.silent = true → jokių wallet popup'ų, jei nėra gas (tiesiog praleidžiam)
  //   Grąžina { ok, txHash } arba { ok:false, reason }.
  async function claim(kind, opts) {
    opts = opts || {};
    if (!enabled()) return { ok: false, reason: 'not_configured' };
    var a = addr(); if (!a) return { ok: false, reason: 'no_wallet' };
    var p = provider(); if (!p) return { ok: false, reason: 'no_provider' };

    // Tinklo garantija — be jos TX nueitų į kitą grandinę.
    try {
      var cid = await p.request({ method: 'eth_chainId' });
      if (parseInt(cid, 16) !== 2020) {
        if (opts.silent) return { ok: false, reason: 'wrong_chain' };
        await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
      }
    } catch (_) { return { ok: false, reason: 'chain' }; }

    // Gas patikra; jei mažai — bandom vienkartinį drip'ą ir palaukiam.
    var bal = await ronBalance(p, a);
    if (bal < MIN_GAS_WEI) {
      if (!get('drip_' + a.toLowerCase())) {
        set('drip_' + a.toLowerCase(), Date.now());
        await ensureGas(a);
        for (var i = 0; i < 10 && bal < MIN_GAS_WEI; i++) {
          await new Promise(function (r) { setTimeout(r, 1500); });
          bal = await ronBalance(p, a);
        }
      }
      if (bal < MIN_GAS_WEI) return { ok: false, reason: 'no_gas' };
    }

    try {
      var data = encodePayAndPlay(0n, false, String(kind || 'play').slice(0, 24));
      var tx = await p.request({ method: 'eth_sendTransaction', params: [{ from: a, to: PLAY, data: data }] });
      set('last_' + kind, Date.now());
      try { console.log('[PoD] ' + kind + ' on-chain:', tx); } catch (_) {}
      return { ok: true, txHash: tx };
    } catch (e) {
      var m = String((e && (e.message || e.shortMessage)) || e);
      return { ok: false, reason: /reject|denied|cancel/i.test(m) ? 'rejected' : 'tx_failed' };
    }
  }

  // Naujoko aktyvavimas — VIENĄ kartą per piniginę. Paverčia jį „New paying user" PoD'e.
  async function welcome() {
    if (!enabled()) return { ok: false, reason: 'not_configured' };
    var a = addr(); if (!a) return { ok: false, reason: 'no_wallet' };
    var key = 'welcome_' + a.toLowerCase();
    if (get(key)) return { ok: false, reason: 'already' };
    var r = await claim('welcome', { silent: false });
    if (r.ok) set(key, Date.now());
    return r;
  }

  // Ar šiandien jau buvo užfiksuotas kasdienis pulsas (UTC para)?
  function doneToday(kind) {
    var t = parseInt(get('last_' + kind) || '0', 10);
    if (!t) return false;
    var d1 = new Date(t).toISOString().slice(0, 10);
    var d2 = new Date().toISOString().slice(0, 10);
    return d1 === d2;
  }

  // ── AUTO-ONBOARDING (tylus, be popup'ų) ────────────────────────────────────
  // Grandinės pirmas žingsnis, kurio anksčiau NEBUVO: `gas-drip` niekas nekviesdavo, kai žaidėjas
  //   susikuria piniginę (jį kvietė tik SOL→RONKE swap ir `claim()`, o `claim()` pasiekiamas tik per
  //   nemokamą pinball'ą, kuriam JAU reikia dujų). Todėl naujas žaidėjas amžinai likdavo su 0 RON ir
  //   nepadarydavo nė vienos savo TX → PoD „New users = 0".
  // Dabar: prisijungus piniginei, jei RON mažai — fone paprašom drip'o. Parašo NEREIKIA (tai serverio
  //   kvietimas), tad žaidėjas nieko nepastebi. Serveris tikrina profilį (≥10 min), IP limitą ir
  //   sponsor'o grindis; „PROFILE_TOO_NEW" atveju pakartojam po nurodyto laiko.
  var ONBOARD_MIN_WEI = 10000000000000000;   // 0.01 RON — žemiau to laikom „be dujų"
  var _tried = {};

  async function onboard(a) {
    a = String(a || addr() || '').toLowerCase();
    if (!a || _tried[a]) return;
    _tried[a] = 1;
    var p = provider(); if (!p) return;
    try {
      if (await ronBalance(p, a) >= ONBOARD_MIN_WEI) return;   // jau turi dujų
    } catch (_) { return; }
    try {
      var r = await fetch(GAS_DRIP, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: a }),
      }).then(function (x) { return x.json(); }).catch(function () { return null; });
      if (!r) return;
      if (r.ok && r.txHash) { try { console.log('[PoD] onboarding gas:', r.amount, 'RON', r.txHash); } catch (_) {} return; }
      // Profilis dar per naujas → pakartojam kai sueis laikas (viena sesija, be spamo).
      if (r.code === 'PROFILE_TOO_NEW') {
        var wait = Math.max(1, Number(r.waitMinutes) || 10);
        delete _tried[a];
        setTimeout(function () { onboard(a); }, wait * 60000 + 15000);
      }
    } catch (_) {}
  }

  // Prisijungus / pasikeitus piniginei — pabandom. Taip pat vieną kartą po užkrovimo.
  try {
    if (window.Wallet && window.Wallet.onChange) {
      window.Wallet.onChange(function (s) { if (s && s.address) onboard(s.address); });
    }
  } catch (_) {}
  setTimeout(function () { try { if (addr()) onboard(addr()); } catch (_) {} }, 4000);

  window.PodActivity = {
    enabled: enabled, claim: claim, welcome: welcome, doneToday: doneToday, onboard: onboard,
    contract: function () { return PLAY; },
  };
})();
