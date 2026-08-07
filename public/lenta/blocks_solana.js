// blocks_solana.js — 🟣 SOLANA PvP Tetris statymas (native SOL). Veidrodis blocks_wager.js, bet Solana grandinė.
//
// Žaidėjas moka native SOL į Solana ENTRY treasury; serveris verifikuos tx (Solana RPC) + išmokės laimėtojui
// iš Solana POOL (serveris pasirašo keypair) 80/20. Pakopos USD ($0.10/$0.50/$1.00) → SOL pagal gyvą kursą.
//
// GATED (saugu): įsijungia TIK kai `window.BLOCKS_SOL_ON === true` IR `window.BLOCKS_SOL_TREASURY` (base58).
//   Kitaip INERTIŠKA — galima prijungti Phantom + matyti SOL kainas, bet PINIGAI NEJUDA (payEntry no-op).
//   ⚠️ Įjungti TIK kai serverio Solana verify + payout keypair + RPC sukonfigūruoti (kitaip sumokėtų be payout).
//   Solana-vs-Solana poravimas (tas pats žetonas pote). Raktus valdo TIK operatorius — niekada kliente.
(function () {
  if (window.BlocksSolana) return;

  var TIERS_USD = [0.10, 0.50, 1.00];      // statymo pakopos doleriais (native SOL sumos skaičiuojamos pagal kursą)
  var _price = null, _priceAt = 0;         // SOL/USD kešas (60s)

  function _treasury() { try { return String(window.BLOCKS_SOL_TREASURY || '').trim(); } catch (_) { return ''; } }
  function _isLocal() { try { var h = location.hostname; return h === 'localhost' || h === '127.0.0.1' || h === ''; } catch (_) { return false; } }
  // base58 Solana adresas (32–44 simboliai, be 0/O/I/l)
  function _isSolAddr(a) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(a || '')); }

  // wager įjungtas kai: (a) prod window.BLOCKS_SOL_ON, ARBA (b) lokalus opt-in; IR treasury adresas yra.
  function enabled() {
    var on = false;
    try { on = window.BLOCKS_SOL_ON === true; } catch (_) {}
    if (!on && _isLocal()) { try { on = localStorage.getItem('_blocks_sol_local') === '1'; } catch (_) {} }
    return on && _isSolAddr(_treasury());
  }

  // ── Phantom / Solana piniginė ────────────────────────────────────────────
  function sol() { try { return (window.phantom && window.phantom.solana) || window.solana || null; } catch (_) { return null; } }
  function available() { var s = sol(); return !!(s && (s.isPhantom || s.isSolflare || s.connect)); }
  function address() {
    var s = sol(); if (!s) return '';
    try { if (s.publicKey) return s.publicKey.toString(); } catch (_) {}
    return '';
  }
  async function connect() {
    var s = sol(); if (!s) return '';
    try {
      var r = await s.connect();
      if (r && r.publicKey) return r.publicKey.toString();
      if (s.publicKey) return s.publicKey.toString();
    } catch (_) {}
    return '';
  }

  // ── SOL/USD kursas (kad parodytume SOL ekvivalentą prie $ pakopų) — CoinGecko, kešas 60s ──
  async function solPrice() {
    var now = Date.now();
    if (_price && (now - _priceAt) < 60000) return _price;
    try {
      var r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { cache: 'no-store' });
      var j = await r.json();
      var p = j && j.solana && j.solana.usd;
      if (p > 0) { _price = p; _priceAt = now; }
    } catch (_) {}
    return _price;
  }
  // USD pakopa → SOL suma (pagal kursą). Grąžina null jei kurso dar nėra.
  async function tierSol(usd) { var p = await solPrice(); if (!p) return null; return usd / p; }
  // Patogus tekstas rodymui: "$0.10 (~0.0006 SOL)"
  async function tierLabel(usd) {
    var s = await tierSol(usd);
    var d = '$' + usd.toFixed(2);
    return s == null ? d : (d + ' (~' + s.toFixed(4) + ' SOL)');
  }

  // ── @solana/web3.js lazy-load (bundle kraunamas TIK kai reikia mokėti) ──
  var LAMPORTS = 1000000000, _web3Loading = null;
  function _rpc() { try { return String(window.BLOCKS_SOL_RPC || '').trim() || 'https://api.mainnet-beta.solana.com'; } catch (_) { return 'https://api.mainnet-beta.solana.com'; } }
  function _loadWeb3() {
    if (window.solanaWeb3) return Promise.resolve(window.solanaWeb3);
    if (_web3Loading) return _web3Loading;
    _web3Loading = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'solana.web3.min.js';
      s.onload = function () { window.solanaWeb3 ? res(window.solanaWeb3) : rej(new Error('no solanaWeb3')); };
      s.onerror = function () { rej(new Error('web3 load fail')); };
      document.head.appendChild(s);
    });
    return _web3Loading;
  }

  // ── ĮSKAITA (INERTIŠKA kol !enabled) ──────────────────────────────────────
  // Native SOL transfer žaidėjas → treasury (Phantom pasirašo). Suma: `lockedLamports` (užrakinta kambario
  //   kūrimo metu — kad abu mokėtų vienodai) ARBA skaičiuojama iš tier USD pagal kursą. Grąžina {ok, tx=parašas,
  //   lamports} — serveris verifikuos Solana RPC. GATED: be BLOCKS_SOL_ON+treasury → not_configured (pinigai nejuda).
  async function payEntry(tierUsd, lockedLamports) {
    if (!enabled()) return { ok: false, reason: 'not_configured' };   // saugus karkasas — pinigai NEjuda
    var s = sol(); if (!s) return { ok: false, reason: 'no_wallet' };
    var from = address() || (await connect()); if (!from) return { ok: false, reason: 'no_wallet' };
    var treasury = _treasury(); if (!_isSolAddr(treasury)) return { ok: false, reason: 'no_treasury' };
    var lamports = (lockedLamports | 0);
    if (!lamports) { var a = await tierSol(Number(tierUsd)); if (!a) return { ok: false, reason: 'no_price' }; lamports = Math.round(a * LAMPORTS); }
    if (!(lamports > 0)) return { ok: false, reason: 'bad_amount' };
    try {
      var web3 = await _loadWeb3();
      var conn = new web3.Connection(_rpc(), 'confirmed');
      var fromPk = new web3.PublicKey(from), toPk = new web3.PublicKey(treasury);
      var bh = await conn.getLatestBlockhash();
      var tx = new web3.Transaction({ feePayer: fromPk, recentBlockhash: bh.blockhash });
      tx.add(web3.SystemProgram.transfer({ fromPubkey: fromPk, toPubkey: toPk, lamports: lamports }));
      var r = await s.signAndSendTransaction(tx);
      var sig = r && (r.signature || r);
      if (!sig) return { ok: false, reason: 'tx_failed' };
      return { ok: true, tx: String(sig), lamports: lamports, sol: lamports / LAMPORTS };
    } catch (e) {
      var m = String((e && (e.message || e)) || e);
      return { ok: false, reason: /reject|denied|cancel|user/i.test(m) ? 'rejected' : 'tx_failed' };
    }
  }

  // Lokalaus testo perjungiklis (TIK localhost).
  function localTest(on) {
    if (!_isLocal()) { console.warn('[BlocksSolana] localTest veikia TIK localhost'); return false; }
    try {
      if (on === false) { localStorage.removeItem('_blocks_sol_local'); console.log('[BlocksSolana] LOCAL Solana IŠJUNGTAS'); return false; }
      localStorage.setItem('_blocks_sol_local', '1');
      console.log('[BlocksSolana] ⚠️ LOCAL Solana opt-in — vis tiek reikia treasury+serverio config, kitaip lieka inertiška.');
      return true;
    } catch (_) { return false; }
  }

  window.BlocksSolana = {
    enabled: enabled, available: available, address: address, connect: connect,
    tiersUsd: function () { return TIERS_USD.slice(); },
    solPrice: solPrice, tierSol: tierSol, tierLabel: tierLabel,
    payEntry: payEntry, localTest: localTest, isLocal: _isLocal,
  };
  console.log('[BlocksSolana] loaded (inert — enabled=' + enabled() + ', wallet=' + available() + ')');
})();
