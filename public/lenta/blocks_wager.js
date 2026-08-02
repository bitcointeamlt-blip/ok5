// blocks_wager.js — 🧱💰 RONKE BLOCKS wager įskaita per JAU ESAMĄ PewPewPlayV2 (BE naujo kontrakto).
//
// Žaidėjas PATS pasirašo `payAndPlay(stake, true, 'blocks_<tier>')` → RONKE į treasury (transferFrom).
// tx.to = PewPewPlayV2 (JAU registruotas PoD #68) → PoD skaitosi IŠKART (Contract+Gas+Paying), jokios
// naujos registracijos ar deploy. Laimėtojo išmoką (80%) daro serveris per `StakeService.settle` (treasury
// relayer). Escrow logika = serveris (rezultatas cheat-proof per A6 L2).
//
// GATED: `window.BLOCKS_WAGER_ON === true` → ima realų RONKE; kitaip nemokamas režimas (pakopos = etiketės).
//   ĮJUNGTI TIK kai serverio StakeService raktai sukonfigūruoti (kitaip žaidėjai sumokėtų, o payout NO-OP).
// Sekamas patikrintas pod_activity.js šablonas. ⚠️ Prieš įjungiant — patikrinti testnete/mainnete.
(function () {
  if (window.BlocksWager) return;

  var RONKE = '0xf988f63bf26C3Ed3fBf39922149E3E7b1e5c27cB';
  var CHAIN_HEX = '0x7e4';                 // Ronin 2020
  var MIN_GAS_WEI = 3000000000000000;      // 0.003 RON
  var TIERS = [69, 200, 800];
  var SEL_APPROVE = '0x095ea7b3', SEL_ALLOWANCE = '0xdd62ed3e', SEL_PAYANDPLAY = '0x162fe520';
  var MAX_UINT = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

  function PLAY() { try { return String(window.PEWPEW_PLAY_V2 || '').trim(); } catch (_) { return ''; } }
  // Lokalus testavimas: TIK localhost + sąmoningas opt-in (localStorage) → įjungia REALŲ RONKE wager lokaliai,
  //   NIEKADA neveikia prod'e (kitas host). Įjungti: localStorage._blocks_wager_local='1' (arba BlocksWager.localTest(true)).
  function _isLocal() { try { var h = location.hostname; return h === 'localhost' || h === '127.0.0.1' || h === ''; } catch (_) { return false; } }
  function _localOptIn() { try { return localStorage.getItem('_blocks_wager_local') === '1'; } catch (_) { return false; } }
  // wager įjungtas kai (a) prod: window.BLOCKS_WAGER_ON, ARBA (b) LOKALIAI pagal nutylėjimą (serveris vis
  //   tiek gate'ina per wagerLive — jei serveris nesukonfigūruotas, mačas lieka nemokamas). Lokaliai išjungti:
  //   localStorage._blocks_wager_local='0'. IR (c) PewPewPlayV2 adresas yra.
  function enabled() {
    var on = false;
    try { on = window.BLOCKS_WAGER_ON === true; } catch (_) {}
    if (!on && _isLocal()) { try { on = localStorage.getItem('_blocks_wager_local') !== '0'; } catch (_) { on = true; } }
    return on && /^0x[0-9a-fA-F]{40}$/.test(PLAY());
  }

  function W() { try { return window.Wallet || null; } catch (_) { return null; } }
  function addr() {
    var w = W(); if (!w) return '';
    try { if (w.getAddress && w.getAddress()) return String(w.getAddress()); } catch (_) {}
    try { var s = w.snapshot && w.snapshot(); if (s && s.connected && s.address) return String(s.address); } catch (_) {}
    return '';
  }
  function provider() {
    var w = W();
    if (w) { try { var p = (w.getProvider && w.getProvider()) || (w.snapshot && w.snapshot().provider); if (p) return p; } catch (_) {} }
    try { return (window.ronin && window.ronin.provider) || window.ethereum || null; } catch (_) { return null; }
  }

  function pad64(h) { return String(h).replace(/^0x/, '').toLowerCase().padStart(64, '0'); }
  function addrArg(a) { return pad64(String(a).replace(/^0x/, '')); }
  // payAndPlay(uint256 amount, bool paid, string kind) — ABI encode (kaip pod_activity.js)
  function encPayAndPlay(amtWei, kind) {
    var b = [], i; for (i = 0; i < kind.length; i++) b.push(kind.charCodeAt(i) & 0xff);
    var hex = ''; for (i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, '0');
    var padded = b.length ? hex.padEnd(Math.ceil(b.length / 32) * 64, '0') : '';
    return SEL_PAYANDPLAY + pad64(amtWei.toString(16)) + pad64('1') + pad64((96).toString(16)) + pad64(b.length.toString(16)) + padded;
  }

  async function _chainOk(p) {
    try { var c = await p.request({ method: 'eth_chainId' }); if (parseInt(c, 16) !== 2020) await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }); return true; } catch (_) { return false; }
  }
  async function _gasOk(p, a) { try { return (parseInt(await p.request({ method: 'eth_getBalance', params: [a, 'latest'] }), 16) || 0) >= MIN_GAS_WEI; } catch (_) { return false; } }
  async function _send(p, from, to, data) { return p.request({ method: 'eth_sendTransaction', params: [{ from: from, to: to, data: data }] }); }
  async function _receipt(p, h) { for (var i = 0; i < 40; i++) { try { var r = await p.request({ method: 'eth_getTransactionReceipt', params: [h] }); if (r) return r; } catch (_) {} await new Promise(function (r) { setTimeout(r, 1500); }); } return null; }
  async function _ensureApproval(p, a, amtWei) {
    var al = await p.request({ method: 'eth_call', params: [{ to: RONKE, data: SEL_ALLOWANCE + addrArg(a) + addrArg(PLAY()) }, 'latest'] }).catch(function () { return '0x0'; });
    if (BigInt(al || '0x0') >= amtWei) return true;
    var tx = await _send(p, a, RONKE, SEL_APPROVE + addrArg(PLAY()) + MAX_UINT); await _receipt(p, tx); return true;
  }

  // ĮSKAITA: žaidėjas moka pakopos statymą → PewPewPlayV2 → treasury (player-signed → PoD).
  //   Grąžina {ok, tx, stake} — tx hash serveris verifikuoja (RaidFee stilius) prieš startą.
  async function payEntry(tier) {
    if (!enabled()) return { ok: false, reason: 'not_configured' };   // nemokamas režimas
    var idx = TIERS.indexOf(Number(tier)); if (idx < 0) idx = 0;
    var stake = TIERS[idx];
    var a = addr(); if (!a) return { ok: false, reason: 'no_wallet' };
    var p = provider(); if (!p) return { ok: false, reason: 'no_provider' };
    if (!(await _chainOk(p))) return { ok: false, reason: 'wrong_chain' };
    if (!(await _gasOk(p, a))) return { ok: false, reason: 'no_gas' };
    var amtWei = BigInt(stake) * (10n ** 18n);
    try {
      await _ensureApproval(p, a, amtWei);
      var tx = await _send(p, a, PLAY(), encPayAndPlay(amtWei, 'blocks_' + stake));
      var rc = await _receipt(p, tx);
      if (!rc || rc.status === '0x0') return { ok: false, reason: 'tx_failed', tx: tx };
      return { ok: true, tx: tx, stake: stake };
    } catch (e) { var m = String((e && (e.message || e.shortMessage)) || e); return { ok: false, reason: /reject|denied|cancel/i.test(m) ? 'rejected' : 'tx_failed' }; }
  }

  // Lokalaus testo perjungiklis (TIK localhost). BlocksWager.localTest(true) → įjungia realų RONKE wager lokaliai.
  function localTest(on) {
    try {
      if (!_isLocal()) { console.warn('[BlocksWager] localTest veikia TIK localhost'); return false; }
      if (on === false) { localStorage.removeItem('_blocks_wager_local'); console.log('[BlocksWager] LOCAL wager IŠJUNGTAS'); return false; }
      localStorage.setItem('_blocks_wager_local', '1');
      console.log('[BlocksWager] ⚠️ LOCAL wager ĮJUNGTAS — REALŪS RONKE + REALIOS TX. Įsitikink, kad lokalus serveris sukonfigūruotas (npm run wager:preflight → READY).');
      return true;
    } catch (_) { return false; }
  }

  window.BlocksWager = {
    enabled: enabled, payEntry: payEntry, tiers: function () { return TIERS.slice(); },
    address: function () { return addr(); },   // žaidėjo piniginė → serveris verifikuoja Transfer.from + išmoka
    localTest: localTest, isLocal: _isLocal,
  };
})();
