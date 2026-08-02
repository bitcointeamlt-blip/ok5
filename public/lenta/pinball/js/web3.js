// web3.js — RonkePong web3 sluoksnis (savarankiškas, BE CDN): Ronin wallet connect +
// 15 RONKE „pay to play" (esamas RONKE ERC20 transfer į treasury — JOKIO naujo kontrakto) +
// globalus leaderboard per Supabase (raw REST, anon key). Reuse iš lenta/F12 infrastruktūros.
// Player-facing tekstas — ANGLŲ. Viskas defensyvu: jei nėra piniginės/tinklo — žaidimas veikia.
(function () {
  'use strict';

  // ── Konstantos (iš esamos F12/pewpew infra — žr. _supabase_access.local.md) ──
  const CHAIN_ID = 2020, CHAIN_HEX = '0x7e4';
  const RPC = 'https://api.roninchain.com/rpc';
  const RONKE_TOKEN = '0xf988f63bf26C3Ed3fBf39922149E3E7b1e5c27cB';   // RONKE ERC20 (18 dec)
  const TREASURY = '0xfF0a2d76E6156Bc1C0c689fe4029f6F1a566E92e';      // play-fee treasury (tas pats kaip F12)
  const FEE = 15;                                                     // RONKE / žaidimas
  // 🏆 PoD ATTRIBUTION: paprastas RONKE.transfer(treasury) turi tx.to = RONKE token, kuris NĖRA
  //   registruotas PoD kontraktas → žaidėjas moka ir degina gas, o projektas gauna 0 taškų.
  //   PewPewPlayV2 pačiuptelėja mokestį per transferFrom, tad tx.to = MŪSŲ registruotas kontraktas
  //   (Gas + Contract Volume + Paying Users), o pinigai keliauja į TĄ PATĮ treasury.
  //   ⚠️ Tuščias = senas elgesys (transfer). Įrašyk adresą PO deploy + „+ Add Contract" PoD Builder'yje.
  //   Pinball sukasi iframe'e → konfigą imam ir iš tėvinio lenta puslapio (kaip ir piniginę).
  const PLAY_V2 = (function () {
    try { if (window.PEWPEW_PLAY_V2) return String(window.PEWPEW_PLAY_V2).trim(); } catch (_) {}
    try {
      if (window.parent && window.parent !== window && window.parent.PEWPEW_PLAY_V2)
        return String(window.parent.PEWPEW_PLAY_V2).trim();
    } catch (_) {}   // cross-origin (standalone) → nėra
    return '';
  })();
  const SB_URL = 'https://rbkivemouxwcgrpzazxb.supabase.co';
  const SB_KEY = 'sb_publishable_E4cHxTFKDTYgrdxcv5uRfQ_9tryLJ4p';    // publishable (client-public) anon key
  const BOARD_TABLE = 'f9_bases';   // reuse esamą lentelę (anon FULL WRITE); raktas rp_<wallet>
  const BOARD_KEY = 'rp_';          // eilučių prefiksas RonkePong score'ams

  // Dev perjungimas + lenta-launcher režimas. `?embed=free` → launcher jau davė nemokamą žaidimą
  // (jokio 15 RONKE mokesčio žaidime). `?embed=paid` arba standalone → tikras 15 RONKE pay-gate.
  const FREE_PLAY = /[?&]embed=free/.test(location.search);

  const state = { provider: null, address: null, balance: 0, paying: false };

  // 🎳 07-23 FIX: pinball veikia lenta iframe'e → naudoja PAGRINDINIO žaidimo aktyvią piniginę
  //   (window.parent.Wallet), NE tiesiai window.ronin. Kitaip prisijungus Phantom/Solana/Instant Play
  //   pinball vis tiek mesdavo Ronin extension popup + sena piniginė „įstrigdavo" (state.provider cache).
  function _parentWallet() {
    try {
      if (window.parent && window.parent !== window && window.parent.Wallet) return window.parent.Wallet;
    } catch (_) {}   // cross-origin (standalone) → nėra
    return null;
  }
  function _parentAddr() {
    var PW = _parentWallet(); if (!PW) return '';
    try {
      if (PW.getAddress && PW.getAddress()) return PW.getAddress();
      if (PW.snapshot) { var s = PW.snapshot(); if (s && s.connected && s.address) return s.address; }
    } catch (_) {}
    return '';
  }

  // ── Provider: PIRMA pagrindinio žaidimo aktyvus provideris (kad ir kokia piniginė), tada injected ──
  //   NECACHE'inam — visada šviežiai (kad piniginės perjungimas adaptuotųsi).
  function provider() {
    var PW = _parentWallet();
    if (PW) {
      try {
        var prov = (PW.getProvider && PW.getProvider()) || (PW.snapshot && PW.snapshot().provider);
        if (prov) return prov;
      } catch (_) {}
    }
    return (window.ronin && window.ronin.provider) || window.ethereum || null;
  }

  // ── Utils ──
  function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }
  function toWei(n) { return BigInt(Math.floor(n)) * (10n ** 18n); }
  function pad64(hex) { return hex.replace(/^0x/, '').toLowerCase().padStart(64, '0'); }
  function encodeTransfer(to, amountWei) {           // ERC20 transfer(address,uint256)
    return '0xa9059cbb' + pad64(to) + pad64(amountWei.toString(16));
  }
  function encodeApprove(spender, amountWei) {       // ERC20 approve(address,uint256)
    return '0x095ea7b3' + pad64(spender) + pad64(amountWei.toString(16));
  }
  function encodeAllowance(owner, spender) {         // ERC20 allowance(address,address)
    return '0xdd62ed3e' + pad64(owner) + pad64(spender);
  }
  // PewPewPlayV2.payAndPlay(uint256 amount, bool paid, string kind)
  function encodePayAndPlay(amountWei, paid, kind) {
    var bytes = [], i;
    for (i = 0; i < kind.length; i++) bytes.push(kind.charCodeAt(i) & 0xff);   // ASCII tag
    var hex = ''; for (i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    var padded = bytes.length ? hex.padEnd(Math.ceil(bytes.length / 32) * 64, '0') : '';
    return '0x162fe520'
      + pad64(amountWei.toString(16))
      + pad64(paid ? '1' : '0')
      + pad64((96).toString(16))                     // offset iki string dalies
      + pad64(bytes.length.toString(16)) + padded;
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // Laukia TX kvito (~3 min). Meta klaidą jei atmesta arba nesulaukta.
  async function waitReceipt(p, txHash, label) {
    for (var i = 0; i < 90; i++) {
      await sleep(2000);
      var r = null;
      try { r = await p.request({ method: 'eth_getTransactionReceipt', params: [txHash] }); } catch (_) {}
      if (r) { if (r.status !== '0x1') throw new Error((label || 'Transaction') + ' failed on-chain.'); return r; }
    }
    throw new Error((label || 'Transaction') + ' timed out (not confirmed).');
  }

  // ── Tinklo garantija (Ronin mainnet 2020) ──
  async function ensureChain(p) {
    try {
      const cid = await p.request({ method: 'eth_chainId' });
      if (parseInt(cid, 16) === CHAIN_ID) return;
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      try {
        await p.request({
          method: 'wallet_addEthereumChain',
          params: [{ chainId: CHAIN_HEX, chainName: 'Ronin', nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 }, rpcUrls: [RPC], blockExplorerUrls: ['https://app.roninchain.com'] }],
        });
      } catch (_) {}
    }
  }

  // ── Connect ──
  async function connect() {
    // 🎳 EMBED: pagrindinis žaidimas jau valdo piniginę → imam JO adresą (Phantom/Ronin/Instant Play —
    //   bet kuris). Jei dar neprisijungęs, atidarom PAGRINDINIO žaidimo connect chooser'į (ne Ronin popup).
    var PW = _parentWallet();
    if (PW) {
      var addr = _parentAddr();
      if (!addr) {
        try {
          if (window.parent.WalletUI && window.parent.WalletUI.openConnect) {
            await window.parent.WalletUI.openConnect();   // lenta chooser (Ronin/Instant Play/Waypoint/Phantom)
            addr = _parentAddr();
          }
        } catch (_) {}
      }
      if (!addr) throw new Error('Connect your wallet in the game first, then press PLAY.');
      state.address = addr;
      refreshBalance(); emit();
      return addr;
    }
    // standalone (ne iframe / cross-origin) — sena elgsena
    const p = provider();
    if (!p) throw new Error('No Ronin wallet found. Install the Ronin Wallet extension, or open this page in the Ronin mobile app browser.');
    const accts = await p.request({ method: 'eth_requestAccounts' });
    if (!accts || !accts.length) throw new Error('No account selected.');
    state.address = accts[0];
    await ensureChain(p);
    refreshBalance();
    emit();
    return state.address;
  }

  function disconnect() {
    state.address = null; state.balance = 0;
    emit();
  }

  // Tylus atkūrimas — EMBED: imam pagrindinio žaidimo adresą (jei prisijungęs). Standalone: eth_accounts.
  var _parentSubbed = false;
  async function restore() {
    var PW = _parentWallet();
    // 🎳 07-24 FIX: klausom PAGRINDINIO žaidimo Wallet pokyčių GYVAI — perjungus adresą/piniginę
    //   (Ronin accountsChanged → disconnect, arba nauja piniginė) pinball IŠKART adaptuojasi,
    //   nebelieka seno adreso „įstrigimo". Prenumeruojam vieną kartą.
    if (PW && PW.onChange && !_parentSubbed) {
      _parentSubbed = true;
      try {
        PW.onChange(function (s) {
          var a = (s && s.connected && s.address) ? s.address : '';
          if (a !== (state.address || '')) { state.address = a; state.balance = 0; if (a) refreshBalance(); emit(); }
        });
      } catch (_) {}
    }
    var pa = _parentAddr();
    if (pa) { state.address = pa; refreshBalance(); emit(); return; }
    if (PW) { state.address = null; emit(); return; }   // iframe, bet pagrindinis neprisijungęs → laukiam PLAY
    const p = provider();
    if (!p) return;
    try {
      const accts = await p.request({ method: 'eth_accounts' });   // BE popup
      if (accts && accts.length) { state.address = accts[0]; refreshBalance(); emit(); }
    } catch (_) {}
  }

  async function refreshBalance() {
    const p = provider();
    if (!p || !state.address) return 0;
    try {
      const data = '0x70a08231' + pad64(state.address);   // balanceOf(address)
      const res = await p.request({ method: 'eth_call', params: [{ to: RONKE_TOKEN, data }, 'latest'] });
      state.balance = Number(BigInt(res || '0x0')) / 1e18;
      emit();
    } catch (_) {}
    return state.balance;
  }

  // ── Pay 15 RONKE (paprastas ERC20 transfer į treasury — jokio kontrakto) ──
  // Grąžina true jei TX patvirtinta (status 0x1). Meta klaidą jei atmesta/nepavyko.
  async function payFee() {
    if (FREE_PLAY) return true;
    const p = provider();
    if (!p) throw new Error('Wallet not connected.');
    // 🎳 07-24 FIX: ŠVIEŽIAS aktyvus adresas mokėjimo metu — kad `from` būtų DABARTINĖ piniginė
    //   (perjungus Ronin account'ą / kitą piniginę), ne cache'inta sena. _parentAddr = pagrindinio
    //   žaidimo dabartinis adresas; fallback state.address (standalone).
    var from = _parentAddr() || state.address;
    if (!from) { await connect(); from = _parentAddr() || state.address; }
    if (!from) throw new Error('Wallet not connected.');
    state.address = from;
    await refreshBalance();
    if (state.balance < FEE) throw new Error('Not enough RONKE (need ' + FEE + ').');
    state.paying = true; emit();
    try {
      if (PLAY_V2) {
        // 🏆 PoD kelias: mokestis per MŪSŲ registruotą kontraktą (tx.to = PewPewPlayV2).
        //   transferFrom vis tiek emituoja Transfer(žaidėjas → treasury), tad serverio pusės
        //   mokesčio verifikacija (RaidFee.ts šablonas) veikia be pakeitimų.
        const need = toWei(FEE);
        let allow = 0n;
        try {
          const a = await p.request({ method: 'eth_call', params: [{ to: RONKE_TOKEN, data: encodeAllowance(from, PLAY_V2) }, 'latest'] });
          allow = BigInt(a || '0x0');
        } catch (_) {}
        if (allow < need) {
          // Vienkartinis approve (dideliam kiekiui) — vėliau kiekvienas žaidimas = 1 TX.
          const apHash = await p.request({ method: 'eth_sendTransaction', params: [{ from: from, to: RONKE_TOKEN, data: encodeApprove(PLAY_V2, toWei(1000000)) }] });
          await waitReceipt(p, apHash, 'Approval');
        }
        const txHash = await p.request({ method: 'eth_sendTransaction', params: [{ from: from, to: PLAY_V2, data: encodePayAndPlay(need, true, 'pinball') }] });
        await waitReceipt(p, txHash, 'Payment');
        refreshBalance();
        return true;
      }
      // Legacy kelias (kol PLAY_V2 nedeployintas): paprastas transfer — PoD jo NEužskaito.
      const data = encodeTransfer(TREASURY, toWei(FEE));
      const txHash = await p.request({ method: 'eth_sendTransaction', params: [{ from: from, to: RONKE_TOKEN, data }] });
      await waitReceipt(p, txHash, 'Payment');
      refreshBalance();
      return true;
    } finally { state.paying = false; emit(); }
  }

  // ── Leaderboard (Supabase raw REST, anon key) ──
  function sbHeaders(extra) { return Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, extra || {}); }

  // ── ⏳ GLOBALUS SEZONO LAIKAS (07-27) ─────────────────────────────────────
  // Skaičiuojam NE pagal įrenginio laikrodį (jis pas kiekvieną skirtingas ir gali būti pastumtas),
  // o pagal SERVERIO laiką: kiekvienas Supabase atsakymas turi `Date` antraštę → įsimenam nuokrypį
  // nuo vietinio laiko ir jį taikom. Rezultatas: VISI žaidėjai mato tą patį likusį laiką.
  let _srvSkew = null;                        // serverio laikas − vietinis (ms); null = dar nežinom
  function _noteServerDate(res) {
    try {
      const d = res && res.headers && res.headers.get && res.headers.get('date');
      if (!d) return;
      const t = Date.parse(d);
      if (isFinite(t)) _srvSkew = t - Date.now();
    } catch (_) {}
  }
  function serverNow() { return Date.now() + (_srvSkew || 0); }
  function hasServerTime() { return _srvSkew !== null; }
  // 🏁 SEZONO 1 PABAIGA — FIKSUOTA (user 2026-08-02): po šio momento žaisti NEGALIMA, leaderboard TIK matomas.
  //   Duomenys NELIEČIAMI — tiesiog nauji žaidimai neleidžiami → lentelė natūraliai užšąla. Auto-aktyvuojasi.
  const SEASON1_END = Date.UTC(2026, 7, 2, 20, 0, 0);   // 2026-08-02 20:00 UTC (keisti čia jei reikia kito laiko)
  function seasonEnd() { return SEASON1_END; }
  // Serverio laikas (Supabase Date) jei žinom, kitaip vietinis fallback → lock'as suveikia net be serverio laiko.
  function seasonLocked() { const now = hasServerTime() ? serverNow() : Date.now(); return now >= SEASON1_END; }
  function seasonLeftMs() { return Math.max(0, seasonEnd() - (hasServerTime() ? serverNow() : Date.now())); }

  // Įrašo runą: BEST (aukščiausias vieno žaidimo score) atsinaujina tik jei geresnis;
  //   TOTAL (bendras) — KIEKVIENO žaidimo score prisideda ant viršaus VISADA (kaupiasi).
  //   Grąžina { best, total }.
  // ⚠️ 07-30 DATA-LOSS FIX (žaidėjo Oba.Ronke skundas „visi seni rezultatai ištrinti"):
  //   `buildings` rašomas VISAS iš naujo (PostgREST upsert JSON'o nemerge'ina). Anksčiau read'o
  //   klaida buvo tyliai nuryjama (`catch (_) {}`) → `b = {}` → prevTotal/prevGames = 0 →
  //   įrašas PERRAŠOMAS taip, lyg žaidėjas žaistų pirmą kartą. Vienas nepavykęs GET (mobilus
  //   tinklas, Supabase trūkis) SUNAIKINDAVO visą istoriją, o UI vis tiek rodydavo „Saved ✓".
  //   Dabar: read'as su 3 bandymais, o NEPAVYKUS — NERAŠOM (geriau neišsaugot vieno runo nei
  //   ištrint visus). Papildomai monotoniškumo saugiklis: total/games niekada nemažėja.
  async function submitScore(score, floor) {
    if (!state.address) return { ok: false, reason: 'no_wallet', best: 0, total: 0 };
    score = Math.floor(score || 0);
    const key = BOARD_KEY + state.address.toLowerCase();
    let b = null;
    for (var att = 0; att < 3 && b === null; att++) {
      try {
        const r = await fetch(SB_URL + '/rest/v1/' + BOARD_TABLE + '?select=buildings&ronin_address=eq.' + key, { headers: sbHeaders() });
        _noteServerDate(r);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const rows = await r.json();
        b = (rows && rows[0] && rows[0].buildings) ? (rows[0].buildings || {}) : {};   // {} = tikrai naujas žaidėjas
      } catch (_) { if (att < 2) await sleep(600 * (att + 1)); }
    }
    if (b === null) {
      try { console.warn('[RonkePong] score NEIŠSAUGOTAS — nepavyko nuskaityti istorijos (neperrašom, kad neprarastume senų taškų)'); } catch (_) {}
      return { ok: false, reason: 'read_failed', best: 0, total: 0 };
    }
    const prevBest = b.score || 0, prevTotal = b.total || 0, prevGames = b.games || 0;
    const best = Math.max(prevBest, score);
    const total = prevTotal + score;                                   // BENDRAS kaupiasi visada
    const bestFloor = score > prevBest ? (floor || 1) : (b.floor || 1);
    // Monotoniškumo saugiklis — net jei read'as grąžintų pasenusius duomenis, niekada nemažinam.
    if (total < prevTotal || best < prevBest || prevGames + 1 < prevGames) {
      return { ok: false, reason: 'regression_guard', best: prevBest, total: prevTotal };
    }
    try {
      const w = await fetch(SB_URL + '/rest/v1/' + BOARD_TABLE, {
        method: 'POST',
        headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ ronin_address: key, buildings: { score: best, total: total, floor: bestFloor, games: prevGames + 1, addr: state.address } }),
      });
      if (!w.ok) throw new Error('HTTP ' + w.status);
    } catch (_) {
      return { ok: false, reason: 'write_failed', best: prevBest, total: prevTotal };
    }
    return { ok: true, best: best, total: total };
  }

  // Top-N (kliento pusėje rikiuojam). byTotal=true → pagal BENDRĄ (total), kitaip → pagal BEST (score).
  async function loadTop(n, byTotal) {
    try {
      const r = await fetch(SB_URL + '/rest/v1/' + BOARD_TABLE + '?select=ronin_address,buildings&ronin_address=like.' + BOARD_KEY + '*&limit=500', { headers: sbHeaders() });
      _noteServerDate(r);   // ⏳ serverio laikas sezono skaitikliui
      const rows = await r.json();
      const list = (rows || []).map((row) => {
        const b = row.buildings || {};
        return { addr: b.addr || row.ronin_address.slice(BOARD_KEY.length), score: b.score || 0, total: b.total || 0, floor: b.floor || 1 };
      }).filter((e) => (byTotal ? e.total : e.score) > 0);
      list.sort((a, b) => byTotal ? (b.total - a.total) : (b.score - a.score));
      return list.slice(0, n || 20);
    } catch (_) { return []; }
  }

  // ── Subscribe (UI atsinaujinimui) ──
  const listeners = [];
  function emit() { for (const cb of listeners) { try { cb(snapshot()); } catch (_) {} } }
  function onChange(cb) { listeners.push(cb); cb(snapshot()); }
  function snapshot() { return { address: state.address, connected: !!state.address, balance: state.balance, paying: state.paying, fee: FEE, freePlay: FREE_PLAY, hasProvider: !!provider() }; }

  window.RPWeb3 = {
    connect, disconnect, restore, refreshBalance, payFee, submitScore, loadTop,
    onChange, snapshot, short, isConnected: () => !!state.address, getAddress: () => state.address,
    FEE, FREE_PLAY, chargeEnabled: () => !FREE_PLAY,
    serverNow, hasServerTime, seasonEnd, seasonLeftMs, seasonLocked,   // ⏳ sezono skaitiklis + 🏁 lock (globalus serverio laikas)
  };
})();
