// PewPewBarracks NFT integration — Ronin Mainnet
// Exposes window.BarracksNFT with all contract calls + state helpers.
// Used by F10 Barracks NFT Training Modal.
//
// Contract: 0xccf604511c5d2b5c3fd61adfba3950d0d2890862 (Ronin Mainnet)

(function() {
  'use strict';

  const ADDR = {
    barracks:   '0xccf604511c5d2b5c3fd61adfba3950d0d2890862',
    ronke:      '0xf988f63bf26C3Ed3fBf39922149E3E7b1e5c27cB',  // production RONKE
    ronkeverse: '0x810B6d1374ac7BA0E83612E7d49F49A13f1de019',  // production Ronkeverse
  };

  const RONIN_CHAIN_ID = 2020;
  const RONIN_RPC = 'https://api.roninchain.com/rpc';
  const VIEM_CDN = 'https://esm.sh/viem@2.21.0';

  // Minimal ABIs
  const BARRACKS_ABI = [
    { name: 'getCurrentPricing', type: 'function', stateMutability: 'view', inputs: [], outputs: [{type:'uint256'},{type:'uint256'}] },
    { name: 'getBatchPricing', type: 'function', stateMutability: 'view', inputs: [{type:'uint8'},{type:'uint8'}], outputs: [{type:'uint256'},{type:'uint256'}] },
    { name: 'getBatchMultiplier', type: 'function', stateMutability: 'pure', inputs: [{type:'uint8'}], outputs: [{type:'uint256'}] },
    { name: 'getPersonalDailyCap', type: 'function', stateMutability: 'view', inputs: [{type:'address'}], outputs: [{type:'uint256'}] },
    { name: 'getRemainingDailyMint', type: 'function', stateMutability: 'view', inputs: [{type:'address'}], outputs: [{type:'uint256'}] },
    { name: 'dailyMintedCount', type: 'function', stateMutability: 'view', inputs: [{type:'address'}], outputs: [{type:'uint256'}] },
    { name: 'totalAlive', type: 'function', stateMutability: 'view', inputs: [], outputs: [{type:'uint256'}] },
    { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{type:'address'}], outputs: [{type:'uint256'}] },
    { name: 'tokenOfOwnerByIndex', type: 'function', stateMutability: 'view', inputs: [{type:'address'},{type:'uint256'}], outputs: [{type:'uint256'}] },
    { name: 'getUnitFullData', type: 'function', stateMutability: 'view', inputs: [{type:'uint256'}], outputs: [
      {type:'uint8',name:'utype'},{type:'uint32',name:'xp'},{type:'uint16',name:'level'},
      {type:'uint16',name:'battles'},{type:'uint16',name:'wins'},{type:'uint32',name:'kills'},
      {type:'uint32',name:'mintedAt'},{type:'uint32',name:'lastBattleAt'},
    ]},
    { name: 'pending', type: 'function', stateMutability: 'view', inputs: [{type:'address'}], outputs: [
      {type:'uint8'},{type:'uint8'},{type:'uint256'},{type:'uint256'},{type:'bool'},
    ]},
    { name: 'startTraining', type: 'function', stateMutability: 'nonpayable', inputs: [{type:'uint8'},{type:'uint8'}], outputs: [] },
    { name: 'claimTraining', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [{type:'uint256'},{type:'uint256'}] },
    { name: 'cancelPendingTraining', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
    // ─── F12 battle settlement ─────────────────────────────────────────
    { name: 'burnAuthorized', type: 'function', stateMutability: 'nonpayable', inputs: [
      { name: 'owner', type: 'address' },
      { name: 'tokenIdsToburn', type: 'uint256[]' },
      { name: 'authorizedTokenIds', type: 'uint256[]' },
      { name: 'battleId', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ], outputs: [] },
    { name: 'awardBattleXp', type: 'function', stateMutability: 'nonpayable', inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'xpGain', type: 'uint32' },
      { name: 'kills', type: 'uint32' },
      { name: 'won', type: 'bool' },
      { name: 'battleId', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ], outputs: [] },
  ];
  const ERC20_ABI = [
    { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{type:'address'}], outputs: [{type:'uint256'}] },
    { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{type:'address'},{type:'uint256'}], outputs: [{type:'bool'}] },
    { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{type:'address'},{type:'address'}], outputs: [{type:'uint256'}] },
  ];
  const ERC721_ABI = [
    { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{type:'address'}], outputs: [{type:'uint256'}] },
  ];

  const UTYPE = {
    1: { name: 'Skull',   image: 'unit-images/skull-idle.gif',   rarity: 'common' },
    2: { name: 'Archer',  image: 'unit-images/archer-idle.gif',  rarity: 'common' },
    3: { name: 'Harpoon', image: 'unit-images/harpoon-idle.gif', rarity: 'common' },
    4: { name: 'Shaman',  image: 'unit-images/shaman-idle.gif',  rarity: 'rare' },
    5: { name: 'Hog Rider', image: 'unit-images/hog-idle.gif', rarity: 'epic' },
  };

  // Planuojami costMultiplierBps tipams, kurių dar NĖRA kontrakte (pre-addUnitType).
  // Naudojama kainos peržiūrai pagal TĄ PAČIĄ kontrakto formulę:
  //   perUnit = getCurrentPricing.cost × bps / 10000
  // Hog Rider planas: addUnitType(5, "Hog Rider", 30000, ...) → 30000 bps = 3.0×.
  // Kai utype įjungiamas grandinėje, getBatchPricing naudoja tikrą kontraktą (fallback netaikomas).
  const PLANNED_COST_MULT_BPS = { 5: 30000 };
  const BATCH_TIER_SIZE = 10;  // kontrakto getBatchMultiplier = ceil(qty / 10)

  let _viem = null;
  async function getViem() {
    if (!_viem) _viem = await import(/* @vite-ignore */ VIEM_CDN);
    return _viem;
  }

  // Lazy-init clients
  let _publicClient = null;
  async function getPublicClient() {
    if (_publicClient) return _publicClient;
    const v = await getViem();
    const chain = v.defineChain({
      id: RONIN_CHAIN_ID, name: 'Ronin Mainnet',
      nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 },
      rpcUrls: { default: { http: [RONIN_RPC] } },
      // Multicall3 (standartinis adresas, deployed ant Ronin) — leidžia viem `multicall`
      // sujungti N skaitymų į VIENĄ eth_call → drastiškai mažiau RPC kvietimų (jokio 429).
      contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
    });
    _publicClient = v.createPublicClient({ chain, transport: v.http() });
    _publicClient._chain = chain;
    return _publicClient;
  }

  async function getWalletClient() {
    const W = window.Wallet;
    if (!W || !W.isConnected || !W.isConnected()) throw new Error('Wallet not connected');
    const provider = W._getProvider ? W._getProvider() : (window.ronin?.provider || window.ethereum);
    if (!provider) throw new Error('No wallet provider');
    const v = await getViem();
    const pc = await getPublicClient();
    return v.createWalletClient({ chain: pc._chain, transport: v.custom(provider) });
  }

  // ─── READ FUNCTIONS ──────────────────────────────────────────
  async function read(fn, args = []) {
    const pc = await getPublicClient();
    return await pc.readContract({ address: ADDR.barracks, abi: BARRACKS_ABI, functionName: fn, args });
  }
  // Retry wrapper — RPC kartais meta transient klaidą (rate-limit/glitch). 3 bandymai su backoff.
  async function _readRetry(fn, args = [], tries = 3) {
    let last;
    for (let i = 0; i < tries; i++) {
      try { return await read(fn, args); }
      catch (e) { last = e; await new Promise(r => setTimeout(r, 250 * (i + 1))); }
    }
    throw last;
  }

  async function getRonkeBalance(addr) {
    const pc = await getPublicClient();
    return await pc.readContract({ address: ADDR.ronke, abi: ERC20_ABI, functionName: 'balanceOf', args: [addr] });
  }
  async function getRonkeverseBalance(addr) {
    const pc = await getPublicClient();
    return await pc.readContract({ address: ADDR.ronkeverse, abi: ERC721_ABI, functionName: 'balanceOf', args: [addr] });
  }
  async function getAllowance(owner) {
    const pc = await getPublicClient();
    return await pc.readContract({ address: ADDR.ronke, abi: ERC20_ABI, functionName: 'allowance', args: [owner, ADDR.barracks] });
  }
  async function getRonBalance(addr) {
    const pc = await getPublicClient();
    return await pc.getBalance({ address: addr });
  }

  // ─── COMPOSITE STATE FETCH ───────────────────────────────────
  async function fetchState(addr) {
    const pc = await getPublicClient();
    const B = ADDR.barracks, R = ADDR.ronke, RV = ADDR.ronkeverse;
    // VIENAS Multicall3 eth_call vietoj 11 atskirų kvietimų (+ 1 native getBalance) → jokio rate-limit'o.
    const [ron, mc] = await Promise.all([
      pc.getBalance({ address: addr }),
      pc.multicall({
        allowFailure: false,
        contracts: [
          { address: R,  abi: ERC20_ABI,    functionName: 'balanceOf',            args: [addr] },
          { address: RV, abi: ERC721_ABI,   functionName: 'balanceOf',            args: [addr] },
          { address: R,  abi: ERC20_ABI,    functionName: 'allowance',            args: [addr, B] },
          { address: B,  abi: BARRACKS_ABI, functionName: 'getPersonalDailyCap',  args: [addr] },
          { address: B,  abi: BARRACKS_ABI, functionName: 'dailyMintedCount',     args: [addr] },
          { address: B,  abi: BARRACKS_ABI, functionName: 'getRemainingDailyMint',args: [addr] },
          { address: B,  abi: BARRACKS_ABI, functionName: 'totalAlive',           args: [] },
          { address: B,  abi: BARRACKS_ABI, functionName: 'balanceOf',            args: [addr] },
          { address: B,  abi: BARRACKS_ABI, functionName: 'pending',              args: [addr] },
          { address: B,  abi: BARRACKS_ABI, functionName: 'getCurrentPricing',    args: [] },
        ],
      }),
    ]);
    const [ronke, ronkeverse, allowance, dailyCap, dailyUsed, remaining, totalAlive, nftBalance, pending, pricing] = mc;
    return {
      ron, ronke, ronkeverse, allowance,
      dailyCap, dailyUsed, remaining,
      totalAlive, nftBalance,
      pending: { utype: pending[0], qty: pending[1], lockedCost: pending[2], readyAt: pending[3], active: pending[4] },
      currentPricing: { cost: pricing[0], wait: Number(pricing[1]) },
    };
  }

  async function getBatchPricing(utype, qty) {
    try {
      const [cost, wait] = await read('getBatchPricing', [utype, qty]);
      const mult = await read('getBatchMultiplier', [qty]);
      return { cost, wait: Number(wait), batchMult: Number(mult), planned: false };
    } catch (e) {
      // Fallback tipams, kurių dar nėra grandinėje (pvz. Hog Rider utype 5 prieš addUnitType).
      // Skaičiuojam LYGIAI pagal kontrakto formulę su planuotu costMultiplierBps.
      const bps = PLANNED_COST_MULT_BPS[utype];
      if (!bps) throw e;  // tikra klaida (ne „type disabled") — nerodom suklastotos kainos
      const [baseCost, baseWait] = await read('getCurrentPricing');
      const perUnit = (baseCost * BigInt(bps)) / 10000n;          // getPricingForType formulė
      const batchMult = Math.ceil(qty / BATCH_TIER_SIZE);          // getBatchMultiplier = ceil(qty/10)
      const cost = perUnit * BigInt(qty) * BigInt(batchMult);      // getBatchPricing formulė
      return { cost, wait: Number(baseWait), batchMult, planned: true };
    }
  }

  // Live supply-based base per-unit price (no wallet needed — public RPC).
  // This is the "current units" price (Skull/Archer/etc. are all 1.0x).
  async function getCurrentPricing() {
    const [cost, wait] = await read('getCurrentPricing');
    return { cost, wait: Number(wait) };
  }

  // Nepriklausomas pending skaitymas (1 call) — kad CLAIM rodytųsi net jei pilnas
  // fetchState (11 reads Promise.all) krenta dėl vieno RPC glitch'o.
  async function getPending(addr) {
    const p = await read('pending', [addr]);
    return { utype: p[0], qty: p[1], lockedCost: p[2], readyAt: p[3], active: p[4] };
  }

  // ─── PER-TYPE MINT COUNT ─────────────────────────────────────
  // Skaičiuoja kiek konkretaus tipo unitų išmintinta IŠ VISO (per UnitMinted event'us).
  // utype event'e NEindeksuotas → imam visus UnitMinted ir filtruojam.
  // Hog Rider (utype 5) mint'inamas tik PO addUnitType bloko 56371937 → range mažas, greita.
  const TYPE_LAUNCH_BLOCK = { 5: 56371937n };  // utype -> blokas nuo kurio mint'inamas
  const UNIT_MINTED_EVENT = {
    type: 'event', name: 'UnitMinted',
    inputs: [
      { indexed: true,  name: 'tokenId', type: 'uint256' },
      { indexed: true,  name: 'owner',   type: 'address' },
      { indexed: false, name: 'utype',   type: 'uint8'   },
    ],
  };
  let _mintCountCache = {};
  async function totalMintedByType(utype) {
    const cacheKey = String(utype);
    try {
      const pc = await getPublicClient();
      const fromBlock = TYPE_LAUNCH_BLOCK[utype] || 0n;
      const logs = await pc.getLogs({
        address: ADDR.barracks,
        event: UNIT_MINTED_EVENT,
        fromBlock,
        toBlock: 'latest',
      });
      const count = logs.reduce((n, l) => n + (Number(l.args.utype) === Number(utype) ? 1 : 0), 0);
      _mintCountCache[cacheKey] = count;
      return count;
    } catch (e) {
      console.warn('[BarracksNFT] totalMintedByType failed:', e.shortMessage || e.message);
      if (_mintCountCache[cacheKey] != null) return _mintCountCache[cacheKey];
      throw e;
    }
  }

  // ─── INVENTORY ───────────────────────────────────────────────
  // Progresyvus inventoriaus krovimas. Whale'ams (35+ NFT) senas variantas
  // laukdavo VISO krovimo (sekvenciškai tokenOfOwnerByIndex → labai lėta).
  // Dabar: (1) tokenId'us imam LYGIAGREČIAI, (2) getUnitFullData paketais po CHUNK,
  // ir po kiekvieno paketo iškviečiam onProgress(sortedSoFar, loaded, total) —
  // aukščiausio XP/lvl unitai surūšiuojami į viršų, kad žaidėjas iškart galėtų rinktis.
  const _INV_CHUNK = 15;
  function _mapUnit(id, d) {
    return {
      tokenId: id,
      utype: d[0], xp: Number(d[1]), level: Number(d[2]),
      battles: Number(d[3]), wins: Number(d[4]), kills: Number(d[5]),
      mintedAt: Number(d[6]), lastBattleAt: Number(d[7]),
      name: UTYPE[d[0]]?.name || 'Unknown',
      image: UTYPE[d[0]]?.image || UTYPE[1].image,
      rarity: UTYPE[d[0]]?.rarity || 'common',
    };
  }
  // Whale-safe progresyvus krovimas (user gairė: ~20 greitai, likusius LĖTAI, NENULŪŽTI):
  //  • Fazė 1 (greita): pirmi _INV_FAST unitų paketais po _INV_FAST_CHUNK → matosi per ~1-2s.
  //  • Fazė 2 (lėta): likę mažais paketais (_INV_SLOW_CHUNK) su pauze (_INV_SLOW_DELAY) tarp jų
  //    → švelni RPC apkrova (jokio rate-limit'o / crash'o net su 500+ unitų).
  //  • render'is throttle'inamas (≥500ms) → main thread neblokuojamas.
  //  • per-unit / per-chunk klaidos PRALEIDŽIAMOS (skip) → niekada nemeta → kas užsikrovė lieka.
  const _INV_FAST = 24, _INV_FAST_CHUNK = 24, _INV_SLOW_CHUNK = 24, _INV_SLOW_DELAY = 150;
  const _INV_MAX = 35;     // picker rodo MAX 35 aukščiausio stato unitus (mažiau render/atminties; daugiau nereikia)
  const _INV_LOAD = 96;    // KIEK token'ų iš viso skaitom (whale-safe: net 500+ wallet'as skaito tik 96, ne visus)
                           // getUnitFullData struktūra didelė — 40+ per multicall viršija RPC response → tylus skip.
  async function fetchInventory(addr, onProgress) {
    const balance = await read('balanceOf', [addr]);
    const n = Number(balance);
    if (n === 0) { if (typeof onProgress === 'function') { try { onProgress([], 0, 0); } catch (_) {} } return []; }
    // Load cap: dideliems wallet'ams skaitom tik pirmus _INV_LOAD token'us (ne visus n) — kitaip RPC krenta.
    const loadN = Math.min(n, _INV_LOAD);
    const idxs = Array.from({ length: loadN }, (_, i) => i);
    const acc = [];
    let _lastEmit = 0;
    function emit(force) {
      if (typeof onProgress !== 'function') return;
      const now = Date.now();
      if (!force && (now - _lastEmit) < 500) return;   // throttle render
      _lastEmit = now;
      const sorted = acc.slice().sort((a, b) => (b.xp - a.xp) || (Number(b.tokenId) - Number(a.tokenId))).slice(0, _INV_MAX);
      try { onProgress(sorted, sorted.length, Math.min(n, _INV_MAX)); } catch (_) {}
    }
    async function loadChunk(slice) {
      const pc = await getPublicClient();
      // 1) tokenId'ai VIENU Multicall3 eth_call (vietoj slice.length atskirų kvietimų)
      let idRes;
      try {
        idRes = await pc.multicall({
          allowFailure: true,
          contracts: slice.map((i) => ({ address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'tokenOfOwnerByIndex', args: [addr, BigInt(i)] })),
        });
      } catch (_) { return; }   // paketas krito — praleidžiam, nenutraukiam
      const ids = idRes.filter((r) => r && r.status === 'success').map((r) => r.result);
      if (!ids.length) return;
      // 2) getUnitFullData VIENU Multicall3 eth_call
      let dataRes;
      try {
        dataRes = await pc.multicall({
          allowFailure: true,
          contracts: ids.map((id) => ({ address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'getUnitFullData', args: [id] })),
        });
      } catch (_) { return; }
      for (let k = 0; k < ids.length; k++) {
        const r = dataRes[k];
        if (r && r.status === 'success' && r.result) {
          try { acc.push(_mapUnit(ids[k], r.result)); } catch (_) {}
        }
      }
    }
    // Fazė 1 — greitai pirmi _INV_FAST
    const fast = idxs.slice(0, _INV_FAST);
    for (let s = 0; s < fast.length; s += _INV_FAST_CHUNK) {
      await loadChunk(fast.slice(s, s + _INV_FAST_CHUNK));
      emit(true);
    }
    // Fazė 2 — likę LĖTAI su pauzėmis
    for (let s = _INV_FAST; s < idxs.length; s += _INV_SLOW_CHUNK) {
      await loadChunk(idxs.slice(s, s + _INV_SLOW_CHUNK));
      emit(false);
      if (s + _INV_SLOW_CHUNK < idxs.length) await new Promise((r) => setTimeout(r, _INV_SLOW_DELAY));
    }
    emit(true);
    return acc.slice().sort((a, b) => (b.xp - a.xp) || (Number(b.tokenId) - Number(a.tokenId))).slice(0, _INV_MAX);
  }

  // ─── WRITE FUNCTIONS ─────────────────────────────────────────
  async function ensureNetwork() {
    const W = window.Wallet;
    const provider = W._getProvider ? W._getProvider() : (window.ronin?.provider || window.ethereum);
    if (!provider) throw new Error('No provider');
    const chainHex = await provider.request({ method: 'eth_chainId' });
    const chain = Number(BigInt(chainHex));
    if (chain !== RONIN_CHAIN_ID) {
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x7E4' }] });
      } catch (e) {
        throw new Error('Switch to Ronin Mainnet (chainId 2020) in your wallet');
      }
    }
  }

  // MOBILE-ATSPARUS TX patvirtinimas. Ronin in-app naršyklėje
  // `waitForTransactionReceipt` dažnai pakimba po wallet sign (kontekstas pertrūksta).
  // Vietoj to: best-effort laukiam receipt'o, BET tuo pačiu pollinam grandinės būseną
  // per eth_call (veikia patikimai mobiliam). Grąžinam kai tik būsena patvirtina.
  async function _confirmTx(hash, verifyFn, timeoutMs) {
    const pc = await getPublicClient();
    let receiptDone = false;
    pc.waitForTransactionReceipt({ hash }).then(() => { receiptDone = true; }).catch(() => {});
    const deadline = Date.now() + (timeoutMs || 90000);
    while (Date.now() < deadline) {
      try { if (await verifyFn()) return hash; } catch (_) {}
      if (receiptDone) return hash;
      await new Promise(function (r) { setTimeout(r, 2500); });
    }
    return hash;  // timeout — grąžinam (TX gali būti landed; UI refresh patikrins)
  }

  async function approveRonke(amount) {
    await ensureNetwork();
    const wc = await getWalletClient();
    const addr = window.Wallet.getAddress();
    const hash = await wc.writeContract({
      address: ADDR.ronke, abi: ERC20_ABI, functionName: 'approve',
      args: [ADDR.barracks, amount], account: addr,
    });
    const pc = await getPublicClient();
    const target = amount / 2n;  // pakanka kai allowance pasiekia ~pusę (apsauga nuo equality)
    await _confirmTx(hash, async function () {
      const a = await pc.readContract({ address: ADDR.ronke, abi: ERC20_ABI, functionName: 'allowance', args: [addr, ADDR.barracks] });
      return a >= target;
    });
    return hash;
  }

  // Verčia žalią revert priežastį į aiškią žmogui suprantamą žinutę.
  function _explainTrainingRevert(err) {
    const raw = ((err && (err.shortMessage || err.message || '')) + ' ' +
                 JSON.stringify(err && err.cause || '') + ' ' +
                 (err && err.details || '') + ' ' +
                 (err && err.metaMessages ? err.metaMessages.join(' ') : '')).toLowerCase();
    if (raw.includes('already training'))        return 'You already have an active training. Tap CLAIM (if ready) or CANCEL first, then you can train again.';
    if (raw.includes('need >=11 ron') || raw.includes('need >= 11 ron') || raw.includes('11 ron'))
                                                  return 'You need at least 11 RON in your wallet (anti-bot protection). Top up RON and try again.';
    if (raw.includes('daily cap'))                return 'Daily mint limit reached. Try after the reset, or hold more Ronkeverse NFTs for a higher cap.';
    if (raw.includes('type disabled'))            return 'This unit type is not available to mint yet.';
    if (raw.includes('training paused'))          return 'Minting is temporarily paused.';
    if (raw.includes('bad qty'))                  return 'Invalid quantity (must be 1–100).';
    if (raw.includes('exceeds balance') || raw.includes('insufficient balance') ||
        raw.includes('transfer amount') || raw.includes('ronke transfer failed') || raw.includes('insufficient allowance'))
                                                  return 'Not enough RONKE to cover the cost. Check your RONKE balance (Hog Rider ≈ 315 RONKE).';
    // Unrecognised — return original
    return 'Training failed: ' + (err && (err.shortMessage || err.message) || 'unknown error');
  }

  async function startTraining(utype, qty) {
    await ensureNetwork();
    const wc = await getWalletClient();
    const addr = window.Wallet.getAddress();
    const pc = await getPublicClient();
    // PRE-FLIGHT: eth_call simulacija grąžina TIKRĄ revert priežastį (ne "Internal JSON-RPC error").
    try {
      await pc.simulateContract({
        address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'startTraining',
        args: [utype, qty], account: addr,
      });
    } catch (simErr) {
      throw new Error(_explainTrainingRevert(simErr));
    }
    const hash = await wc.writeContract({
      address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'startTraining',
      args: [utype, qty], account: addr,
    });
    // Mobile-atspariai: laukiam kol pending taps aktyvus (vietoj kabančio receipt'o).
    await _confirmTx(hash, async function () {
      const p = await read('pending', [addr]);
      return p[4] === true;
    });
    return hash;
  }

  async function claimTraining() {
    await ensureNetwork();
    const wc = await getWalletClient();
    const addr = window.Wallet.getAddress();
    const hash = await wc.writeContract({
      address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'claimTraining',
      args: [], account: addr,
    });
    // Mobile-atspariai: laukiam kol pending išsivalys (claim mint'ino NFT'us).
    await _confirmTx(hash, async function () {
      const p = await read('pending', [addr]);
      return p[4] === false;
    });
    return hash;
  }

  async function cancelPendingTraining() {
    await ensureNetwork();
    const wc = await getWalletClient();
    const addr = window.Wallet.getAddress();
    const hash = await wc.writeContract({
      address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'cancelPendingTraining',
      args: [], account: addr,
    });
    // Mobile-atspariai: laukiam kol pending išsivalys.
    await _confirmTx(hash, async function () {
      const p = await read('pending', [addr]);
      return p[4] === false;
    });
    return hash;
  }

  // ─── BATTLE SETTLEMENT — burn dead NFTs (per BurnAuth) ─────────
  async function submitBurnDead(burnPayload) {
    await ensureNetwork();
    const wc = await getWalletClient();
    const addr = window.Wallet.getAddress();
    const hash = await wc.writeContract({
      address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'burnAuthorized',
      args: [
        burnPayload.owner,
        burnPayload.tokenIdsToburn.map(t => BigInt(t)),
        (burnPayload.authorizedTokenIds || []).map(t => BigInt(t)),  // CRITICAL: contract reikia abu masyvų
        BigInt(burnPayload.battleId),
        BigInt(burnPayload.deadline),
        BigInt(burnPayload.nonce),
        burnPayload.signature,
      ],
      account: addr,
    });
    const pc = await getPublicClient();
    await pc.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ─── BATTLE SETTLEMENT — claim signed XP award per NFT ────────
  async function claimXpAward(award) {
    await ensureNetwork();
    const wc = await getWalletClient();
    const addr = window.Wallet.getAddress();
    const hash = await wc.writeContract({
      address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'awardBattleXp',
      args: [
        BigInt(award.tokenId),
        Number(award.xpGain),
        Number(award.kills),
        !!award.won,
        BigInt(award.battleId),
        BigInt(award.deadline),
        BigInt(award.nonce),
        award.signature,
      ],
      account: addr,
    });
    const pc = await getPublicClient();
    await pc.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ─── HELPERS ─────────────────────────────────────────────────
  async function formatEther(wei) {
    const v = await getViem();
    return v.formatEther(wei);
  }
  async function parseEther(str) {
    const v = await getViem();
    return v.parseEther(str);
  }
  function utypeName(utype) { return UTYPE[utype]?.name || 'Unknown'; }
  function utypeImage(utype) { return UTYPE[utype]?.image || UTYPE[1].image; }
  function utypeRarity(utype) { return UTYPE[utype]?.rarity || 'common'; }
  function levelTitle(level) {
    if (level === 0) return 'Recruit';
    if (level < 5) return 'Veteran';
    if (level < 10) return 'Elite';
    if (level < 25) return 'Champion';
    return 'Legendary';
  }

  // Expose API
  window.BarracksNFT = {
    ADDR,
    UTYPE,
    fetchState,
    fetchInventory,
    getBatchPricing,
    getCurrentPricing,
    getPending,
    totalMintedByType,
    approveRonke,
    startTraining,
    claimTraining,
    cancelPendingTraining,
    submitBurnDead,
    claimXpAward,
    formatEther, parseEther,
    utypeName, utypeImage, utypeRarity, levelTitle,
    getRonkeBalance, getRonkeverseBalance, getAllowance, getRonBalance,
    ensureNetwork,
  };
})();
