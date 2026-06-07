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

  // ─── RONKE Power (deko registracija on-chain) ───────────────────────────
  // PASTABA: `address` TUŠČIAS → register mygtukas lieka „coming soon" (saugus preview).
  // Po MAINNET deploy užpildyk `address` (+ jei reikia chainId) → mygtukas pradeda tikrą flow.
  // Saigon test instancija (ref, NE produkcijai): 0xb52e5d2efb5c3ad490cc3bc00a6cadaf4bbf1de1
  const RONKE_POWER = {
    address:  '0x15717035F34DE9541883fc30E7A0483230927eb0',  // RonkePower MAINNET (LIVE 2026-06-06)
    chainId:  2020,                // tinklas (mainnet 2020; Saigon 202601). HARDCODE — RONIN_CHAIN_ID apibrėžtas žemiau (TDZ).
    ronke:    ADDR.ronke,          // RONKE approval'ui (fee mokamas šiuo tokenu)
    feeRonke: 10n,                 // 10 RONKE / registraciją (display + approval bazė)
    endpoint: 'https://rbkivemouxwcgrpzazxb.supabase.co/functions/v1/set-deck',
  };
  function isRonkePowerEnabled() { return /^0x[0-9a-fA-F]{40}$/.test(RONKE_POWER.address || ''); }

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
    { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{type:'uint256'}], outputs: [{type:'address'}] },
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
  const _INV_MAX = 35;     // pradinis rodymo cap (top _INV_MAX aukščiausio XP)
  const _INV_LOAD = 96;    // pradinis read cap (whale-safe: net 500+ wallet'as skaito tik 96, ne visus)
                           // getUnitFullData struktūra didelė — 40+ per multicall viršija RPC response → tylus skip.
  const _INV_MORE = 24;    // "Load more" — kiek papildomai SKAITOM ir RODOM per paspaudimą
  // Stateful inventory: kursorius leidžia "Load more" tęsti nuo kur baigėm (ne perkrauti viską).
  let _invAddr = null, _invTotal = 0, _invCursor = 0, _invAcc = [], _invSeen = null, _invShowN = _INV_MAX, _invOrder = [];
  // Skaitymo eiliškumas iš ABIEJŲ galų pakaitomis: [naujausias, seniausias, 2-as naujausias, ...].
  // tokenOfOwnerByIndex grąžina token'us gavimo tvarka (0=seniausias, n-1=naujausias), tad ši tvarka
  // užtikrina kad pradinis paketas padengtų IR senus veteranus IR naujus pirkinius (naujus tipus) —
  // ne tik vieno tipo bloką iš pradžios. → visi tipai matosi iškart, nereikia "kapstyti".
  function _bothEndsOrder(n) {
    const order = []; let lo = 0, hi = n - 1;
    while (lo <= hi) { order.push(hi--); if (lo <= hi) order.push(lo++); }
    return order;
  }
  function _invSorted() {
    return _invAcc.slice().sort((a, b) => (b.xp - a.xp) || (Number(b.tokenId) - Number(a.tokenId)));
  }
  // Skaito token indeksus [start,end) į _invAcc paketais po _INV_SLOW_CHUNK; dedupe pagal tokenId.
  async function _loadRange(start, end, onProgress) {
    let _lastEmit = 0;
    function emit(force) {
      if (typeof onProgress !== 'function') return;
      const now = Date.now();
      if (!force && (now - _lastEmit) < 500) return;   // throttle render
      _lastEmit = now;
      const sorted = _invSorted().slice(0, _invShowN);
      try { onProgress(sorted, sorted.length, Math.min(_invTotal, _invShowN)); } catch (_) {}
    }
    async function loadChunk(slice) {
      const pc = await getPublicClient();
      // 1) tokenId'ai VIENU Multicall3 eth_call
      let idRes;
      try {
        idRes = await pc.multicall({
          allowFailure: true,
          contracts: slice.map((i) => ({ address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'tokenOfOwnerByIndex', args: [_invAddr, BigInt(i)] })),
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
          const key = String(ids[k]);
          if (_invSeen.has(key)) continue;   // dedupe — kad "Load more" nedubliuotų
          _invSeen.add(key);
          try { _invAcc.push(_mapUnit(ids[k], r.result)); } catch (_) {}
        }
      }
    }
    // Fazė 1 — greitai pirmi _INV_FAST (tik pradiniam krovimui, kai start===0)
    // slice'ai imami iš _invOrder (abiejų galų tvarka), ne tiesiai 0..n.
    const fastEnd = Math.min(end, start + (start === 0 ? _INV_FAST : 0));
    for (let s = start; s < fastEnd; s += _INV_FAST_CHUNK) {
      await loadChunk(_invOrder.slice(s, Math.min(fastEnd, s + _INV_FAST_CHUNK)));
      emit(true);
    }
    // Fazė 2 — likę LĖTAI su pauzėmis
    for (let s = fastEnd; s < end; s += _INV_SLOW_CHUNK) {
      await loadChunk(_invOrder.slice(s, Math.min(end, s + _INV_SLOW_CHUNK)));
      emit(false);
      if (s + _INV_SLOW_CHUNK < end) await new Promise((r) => setTimeout(r, _INV_SLOW_DELAY));
    }
    _invCursor = Math.max(_invCursor, end);
    emit(true);
  }
  async function fetchInventory(addr, onProgress) {
    const balance = await read('balanceOf', [addr]);
    const n = Number(balance);
    // reset state naujam krovimui
    _invAddr = addr; _invTotal = n; _invCursor = 0; _invAcc = []; _invSeen = new Set(); _invShowN = _INV_MAX;
    _invOrder = _bothEndsOrder(n);   // abiejų galų tvarka — seni veteranai + nauji pirkiniai iškart
    if (n === 0) { if (typeof onProgress === 'function') { try { onProgress([], 0, 0); } catch (_) {} } return []; }
    // Pradinis read cap: dideliems wallet'ams skaitom tik pirmus _INV_LOAD token'us (ne visus n).
    await _loadRange(0, Math.min(n, _INV_LOAD), onProgress);
    return _invSorted().slice(0, _invShowN);
  }
  // "Load more": pakelia RODYMO ribą +_INV_MORE ir, jei reikia, perskaito tiek token'ų,
  // kad padengtų naują ribą (read-cursor seka paskui showN, ne atvirkščiai).
  async function loadMoreInventory(onProgress) {
    if (!_invAddr) return _invSorted().slice(0, _invShowN);
    _invShowN += _INV_MORE;
    const target = Math.min(_invTotal, _invShowN);   // kiek token'ų reikia perskaityti rodymui padengti
    if (_invCursor < target) await _loadRange(_invCursor, target, onProgress);
    return _invSorted().slice(0, _invShowN);
  }
  // Yra dar ką rodyti, jei rodymo riba nepasiekė viso wallet'o turinio.
  function invHasMore() { return !!_invAddr && _invShowN < _invTotal; }
  function invCounts() { return { read: _invCursor, total: _invTotal, shown: Math.min(_invAcc.length, _invShowN) }; }

  // ─── DECK (loadout) ───────────────────────────────────────────
  // Žaidėjas susideda token ID į "deck'ą" (localStorage, per-wallet). Žaidimo kelias
  // kraunamas TIK iš deck'o → 1 multicall, jokio tokenOfOwnerByIndex skeno → nulis RPC problemų
  // net 500+ wallet'ui ir mobiliam. Iš deck'o žaidime renkamasi iki BATTLE_MAX (12).
  //
  // Slot cap DINAMINIS — atitinka RonkePower.sol maxSlots: deckBase(12) + min(Ronkeverse×1, 18),
  // cap hardMax(30). RV balansas fetch'inamas async + cache'inamas per-wallet; setDeck slice'ina
  // tik iki HARD max (30) kad NIEKADA netrumpintų teisėto deko kol RV dar neužsikrovęs.
  const _DECK_BASE = 12;
  const _SLOT_PER_RV = 1;
  const _RV_CAP = 18;
  const _DECK_HARD_MAX = 30;
  const _deckSlotsCache = {};   // addr.lower → leistinas slotų skaičius (po RV fetch)
  function getDeckMax(addr) {
    const k = String(addr || '').toLowerCase();
    return _deckSlotsCache[k] || _DECK_BASE;   // kol RV neužkrautas — saugi apatinė riba (bazė 12)
  }
  // Fetch'ina Ronkeverse balansą → apskaičiuoja + cache'ina deko slotus. Kviesti prieš render.
  async function refreshDeckSlots(addr) {
    try {
      const rv = Number(await getRonkeverseBalance(addr)) || 0;
      const slots = Math.min(_DECK_HARD_MAX, _DECK_BASE + Math.min(rv * _SLOT_PER_RV, _RV_CAP));
      _deckSlotsCache[String(addr || '').toLowerCase()] = slots;
      return slots;
    } catch (_) { return getDeckMax(addr); }
  }
  function _deckKey(addr) { return 'f12_deck_' + String(addr || '').toLowerCase(); }
  function getDeck(addr) {
    try { const r = JSON.parse(localStorage.getItem(_deckKey(addr)) || '[]'); return Array.isArray(r) ? r.map(String) : []; }
    catch (_) { return []; }
  }
  function setDeck(addr, ids) {
    // Slice tik iki HARD max — dinaminis cap enforce'inamas addToDeck'e (UI), kad async RV
    // dar neužsikrovus jau išsaugotas didesnis dekas nebūtų nukirptas.
    const uniq = Array.from(new Set((ids || []).map(String))).slice(0, _DECK_HARD_MAX);
    try { localStorage.setItem(_deckKey(addr), JSON.stringify(uniq)); } catch (_) {}
    return uniq;
  }
  function deckHas(addr, id) { return getDeck(addr).indexOf(String(id)) !== -1; }
  function deckCount(addr) { return getDeck(addr).length; }
  function addToDeck(addr, id) {
    const d = getDeck(addr), s = String(id);
    if (d.indexOf(s) === -1 && d.length < getDeckMax(addr)) d.push(s);
    return setDeck(addr, d);
  }
  function removeFromDeck(addr, id) {
    // Iš deko šalinant — išmetam ir iš battle squad (squad ⊆ deck).
    setBattleSquad(addr, getBattleSquad(addr).filter((x) => x !== String(id)));
    return setDeck(addr, getDeck(addr).filter((x) => x !== String(id)));
  }

  // ─── BATTLE SQUAD (kovos pogrupis, max 12 ⊆ deck) ───────────────────────
  // Deka (iki 24/maxSlots) = POWER (registruojama on-chain). Squad (12) = kas REALIAI eina į kovą.
  // BATTLE mygtukas pildo squad; kai 12 pilnas → likusios kortos eina į deką tik dėl POWER.
  const _BATTLE_SQUAD_MAX = 12;
  function _squadKey(addr) { return 'f12_squad_' + String(addr || '').toLowerCase(); }
  function getBattleSquad(addr) {
    try { const r = JSON.parse(localStorage.getItem(_squadKey(addr)) || '[]'); return Array.isArray(r) ? r.map(String) : []; }
    catch (_) { return []; }
  }
  function setBattleSquad(addr, ids) {
    const uniq = Array.from(new Set((ids || []).map(String))).slice(0, _BATTLE_SQUAD_MAX);
    try { localStorage.setItem(_squadKey(addr), JSON.stringify(uniq)); } catch (_) {}
    return uniq;
  }
  function squadHas(addr, id) { return getBattleSquad(addr).indexOf(String(id)) !== -1; }
  function squadCount(addr) { return getBattleSquad(addr).length; }
  function addToSquad(addr, id) {
    const s = getBattleSquad(addr), v = String(id);
    if (s.indexOf(v) === -1 && s.length < _BATTLE_SQUAD_MAX) s.push(v);
    setBattleSquad(addr, s);
    addToDeck(addr, id);   // squad ⊆ deck (kovai → irgi power)
    return s;
  }
  function removeFromSquad(addr, id) {
    // Tik iš squad — korta lieka deke (tampa power-only). Atlaisvina kovos slotą.
    return setBattleSquad(addr, getBattleSquad(addr).filter((x) => x !== String(id)));
  }

  // ─── Registruoto deko snapshot (ar lokalus dekas atitinka on-chain) ──────
  // Po registracijos / syncDeckFromChain įsimenam užregistruotą deką. UI lentutė pagal tai
  // rodo „REGISTER" (pakeista) arba „START BATTLE" (užregistruota). Squad keitimas NEįtakoja
  // (squad lokalus), tik deko narystės keitimas → reikia perregistruoti.
  function _regKey(addr) { return 'f12_deckreg_' + String(addr || '').toLowerCase(); }
  function getRegisteredDeck(addr) {
    try { const r = JSON.parse(localStorage.getItem(_regKey(addr)) || '[]'); return Array.isArray(r) ? r.map(String) : []; }
    catch (_) { return []; }
  }
  function setRegisteredDeck(addr, ids) {
    try { localStorage.setItem(_regKey(addr), JSON.stringify((ids || []).map(String))); } catch (_) {}
  }
  // TIKSLUS (exact) palyginimas — valdo juostos būseną (DECK REGISTERED vs UPDATE DECK).
  // Lock (🔒 mygtukai) naudoja ATSKIRĄ sąlygą (snapshot egzistuoja) — žr. _deckLocked modal'e.
  function isDeckRegistered(addr) {
    const cur = getDeck(addr).map(String).sort();
    const reg = getRegisteredDeck(addr).map(String).sort();
    if (cur.length === 0 || cur.length !== reg.length) return false;
    for (let i = 0; i < cur.length; i++) if (cur[i] !== reg[i]) return false;
    return true;   // lokalus dekas == on-chain → tiksliai užregistruota
  }
  // Ar APSKRITAI buvo registruotas (snapshot egzistuoja) — net jei dabar pakeistas/mirę pašalinti.
  // Naudojama lock'ui: registruotas dekas → 🔒 mygtukai visada (kol ne edit režimas).
  function hasRegisteredDeck(addr) {
    return getRegisteredDeck(addr).length > 0 && getDeck(addr).length > 0;
  }
  // Squad snapshot (UNDO'ui) — registruotos būsenos battle squad.
  function _regSqKey(addr) { return 'f12_squadreg_' + String(addr || '').toLowerCase(); }
  function getRegisteredSquad(addr) {
    try { const r = JSON.parse(localStorage.getItem(_regSqKey(addr)) || '[]'); return Array.isArray(r) ? r.map(String) : []; }
    catch (_) { return []; }
  }
  function setRegisteredSquad(addr, ids) {
    try { localStorage.setItem(_regSqKey(addr), JSON.stringify((ids || []).map(String))); } catch (_) {}
  }
  // UNDO — grąžina DEKĄ į paskutinę užregistruotą būseną (squad = atskiras battle pasirinkimas, neliečiam).
  function undoDeckChanges(addr) {
    setDeck(addr, getRegisteredDeck(addr));
    return getDeck(addr);
  }
  // Pašalina iš deko MIRUSIUS/parduotus unitus (ownerOf revert ar svetimas owner) → atlaisvina slotus.
  // Patikima: multicall pavyko (kitaip throw) → individualus 'failure' = burned. Grąžina pašalintus ID'us.
  async function pruneDeadDeckUnits(addr) {
    const deck = getDeck(addr);
    if (!deck.length) return [];
    const pc = await getPublicClient();
    let ownRes;
    try {
      ownRes = await pc.multicall({ allowFailure: true, contracts: deck.map((id) => ({ address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'ownerOf', args: [BigInt(id)] })) });
    } catch (_) { return []; }   // tinklo klaida → nieko nešalinam (saugu)
    const lc = String(addr || '').toLowerCase();
    const alive = [], dead = [];
    for (let i = 0; i < deck.length; i++) {
      const o = ownRes[i];
      if (o && o.status === 'success' && String(o.result).toLowerCase() === lc) alive.push(String(deck[i]));
      else dead.push(String(deck[i]));   // revert (burned) arba kitas owner (parduota)
    }
    if (dead.length) {
      setDeck(addr, alive);
      setBattleSquad(addr, getBattleSquad(addr).filter((id) => alive.indexOf(String(id)) !== -1));
    }
    return dead;
  }

  // ─── Deck-load-from-chain (cross-device, „no full scan") ────────────────
  // On-chain dekas (RonkePower.getDeck) = tiesos šaltinis. Login/modal metu perskaitom 1 call →
  // užpildom lokalų deką → žaidimas krauna TIK deko unitus (ne visus 500), ir dekas seka per
  // įrenginius (mobile localStorage evict-proof). Gated: jei RonkePower neaktyvuota → no-op.
  const RONKE_POWER_ABI = [
    { name: 'getDeck',  type: 'function', stateMutability: 'view', inputs: [{type:'address'}], outputs: [{type:'uint256[]'}] },
    { name: 'maxSlots', type: 'function', stateMutability: 'view', inputs: [{type:'address'}], outputs: [{type:'uint256'}] },
  ];
  let _deckSyncedFor = null;
  async function syncDeckFromChain(addr, force) {
    if (!isRonkePowerEnabled() || !addr) return getDeck(addr);
    const a = String(addr).toLowerCase();
    if (!force && _deckSyncedFor === a) return getDeck(addr);   // 1× per sesiją (nebent force)
    try {
      const pc = await getPublicClient();
      // TIMEOUT — getDeck kvietimas NEGALI blokuoti inventoriaus/battle krovimo (max 6s).
      const onchain = await Promise.race([
        pc.readContract({ address: RONKE_POWER.address, abi: RONKE_POWER_ABI, functionName: 'getDeck', args: [addr] }),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('deck sync timeout')); }, 6000); }),
      ]);
      _deckSyncedFor = a;
      const onIds = (Array.isArray(onchain) ? onchain : []).map(String);
      setRegisteredDeck(addr, onIds);          // on-chain dekas = registruotas snapshot (lentutės būsenai)
      if (onIds.length) setDeck(addr, onIds);  // on-chain laimi (cross-device tiesos šaltinis)
      // PASTABA: battle squad = atskiras kovos pasirinkimas (BATTLE tab'e), persist'ina localStorage.
      // NEperrašom čia — kad žaidėjo kovos pasirinkimas išliktų.
    } catch (_) { /* RPC glitch / timeout — paliekam lokalų deką, NEblokuojam */ }
    return getDeck(addr);
  }
  // Krauna TIK nurodytus token ID (getUnitFullData + ownerOf patikra). Parduoti/sudeginti iškrenta.
  async function loadDeckUnits(addr, tokenIds) {
    const ids = (tokenIds || []).map((x) => { try { return BigInt(x); } catch (_) { return null; } }).filter((x) => x !== null);
    if (!ids.length) return [];
    const pc = await getPublicClient();
    const out = [], lc = String(addr || '').toLowerCase();
    // CHUNK'inam: getUnitFullData = didelė struktūra. Per daug vienam multicall → viršija RPC atsakymą →
    // dalis tyliai nutrūksta (pvz 24 deko unitai → tik 22 užkraunami). Paketais po 12 = saugu (kaip _INV_CHUNK).
    const CHUNK = 12;
    for (let s = 0; s < ids.length; s += CHUNK) {
      const slice = ids.slice(s, s + CHUNK);
      let dataRes, ownRes;
      try {
        [dataRes, ownRes] = await Promise.all([
          pc.multicall({ allowFailure: true, contracts: slice.map((id) => ({ address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'getUnitFullData', args: [id] })) }),
          pc.multicall({ allowFailure: true, contracts: slice.map((id) => ({ address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'ownerOf', args: [id] })) }),
        ]);
      } catch (_) { continue; }   // šio paketo tinklo klaida → praleidžiam paketą, tęsiam likusius
      for (let i = 0; i < slice.length; i++) {
        const o = ownRes[i];
        if (!o || o.status !== 'success' || String(o.result).toLowerCase() !== lc) continue;  // nebeturimas → praleisti
        const d = dataRes[i];
        if (d && d.status === 'success' && d.result) {
          try { out.push(_mapUnit(slice[i], d.result)); } catch (_) {}
        }
      }
    }
    return out;
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

  // ─── RONKE Power: deko registracija on-chain (relayer-sponsored) ─────────
  // Flow: (1) RONKE approval RonkePower'iui (vienkartinis) → (2) žaidėjas pasirašo SetDeck
  // (EIP-712, GASLESS) → (3) POST į set-deck edge fn → relayer kviečia setDeckForWithFee + moka gas.
  // Žaidėjas moka tik 10 RONKE fee. Apsaugos (parašas/nonce/deadline) — backend'e + kontrakte.
  async function _ronkePowerAllowance(owner) {
    const pc = await getPublicClient();
    return await pc.readContract({ address: RONKE_POWER.ronke, abi: ERC20_ABI, functionName: 'allowance', args: [owner, RONKE_POWER.address] });
  }
  async function registerDeckOnChain(tokenIds, onStatus) {
    const status = function (m) { try { if (onStatus) onStatus(m); } catch (_) {} };
    if (!isRonkePowerEnabled()) throw new Error('On-chain deck registration is not live yet.');
    const W = window.Wallet;
    if (!W || !W.isConnected || !W.isConnected()) throw new Error('Connect your wallet first.');
    const addr = W.getAddress();
    const ids = (tokenIds && tokenIds.length ? tokenIds : getDeck(addr)).map(String);
    if (!ids.length) throw new Error('Your deck is empty — add units first.');
    if (ids.length > _DECK_HARD_MAX) throw new Error('Deck too big (max ' + _DECK_HARD_MAX + ').');
    // dedup apsauga (kontraktas + backend irgi tikrina, bet nesiunčiam šlamšto)
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate units in deck.');

    await ensureNetwork();

    // 1) RONKE approval (jei mažiau nei fee — approve dosniai, kad keitimai nereikalautų re-approve)
    status('Checking RONKE approval…');
    const fee = (RONKE_POWER.feeRonke || 10n) * 10n ** 18n;
    let allow = 0n;
    try { allow = await _ronkePowerAllowance(addr); } catch (_) { allow = 0n; }
    if (allow < fee) {
      status('Approve RONKE (one-time)…');
      const wc = await getWalletClient();
      const approveAmt = fee * 100n;  // ~100 keitimų be re-approve
      const h = await wc.writeContract({ address: RONKE_POWER.ronke, abi: ERC20_ABI, functionName: 'approve', args: [RONKE_POWER.address, approveAmt], account: addr });
      const pc = await getPublicClient();
      await _confirmTx(h, async function () {
        const a = await pc.readContract({ address: RONKE_POWER.ronke, abi: ERC20_ABI, functionName: 'allowance', args: [addr, RONKE_POWER.address] });
        return a >= fee;
      });
    }

    // 2) Pasirašom SetDeck (EIP-712, GASLESS) — autorizuoja, kad TIK savininkas keičia savo deką
    status('Sign deck registration…');
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const nonce = Date.now().toString() + Math.floor(Math.random() * 1e6).toString();
    const domain = { name: 'RonkePower', version: '1', chainId: RONKE_POWER.chainId, verifyingContract: RONKE_POWER.address };
    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
      ],
      SetDeck: [
        { name: 'player', type: 'address' }, { name: 'tokenIds', type: 'uint256[]' },
        { name: 'deadline', type: 'uint256' }, { name: 'nonce', type: 'uint256' },
      ],
    };
    const message = { player: addr, tokenIds: ids, deadline: String(deadline), nonce: nonce };
    const provider = W._getProvider ? W._getProvider() : (window.ronin && window.ronin.provider || window.ethereum);
    if (!provider) throw new Error('No wallet provider.');
    const typedData = JSON.stringify({ domain, types, primaryType: 'SetDeck', message });
    const signature = await provider.request({ method: 'eth_signTypedData_v4', params: [addr.toLowerCase(), typedData] });

    // 3) POST į set-deck → relayer relay'ina setDeckForWithFee + moka gas
    status('Registering on-chain…');
    let resp;
    try {
      resp = await fetch(RONKE_POWER.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: addr, tokenIds: ids, deadline: deadline, nonce: nonce, signature: signature }),
      }).then(function (r) { return r.json(); });
    } catch (e) { throw new Error('Network error: ' + (e && e.message || e)); }
    if (!resp || !resp.ok) throw new Error((resp && resp.error) || 'Registration failed.');

    // Sinchronizuojam lokalų deką su tuo, ką užregistravom + įsimenam registruotą snapshot
    setDeck(addr, ids);
    setRegisteredDeck(addr, ids);   // dabar lokalus == on-chain → lentutė rodys „START BATTLE"
    setRegisteredSquad(addr, getBattleSquad(addr));   // squad snapshot UNDO'ui
    return resp;  // { ok, txHash, deck, status }
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
    loadMoreInventory,
    invHasMore,
    invCounts,
    DECK_MAX: _DECK_HARD_MAX,
    getDeckMax,
    refreshDeckSlots,
    getDeck,
    setDeck,
    deckHas,
    deckCount,
    addToDeck,
    removeFromDeck,
    BATTLE_SQUAD_MAX: _BATTLE_SQUAD_MAX,
    getBattleSquad,
    setBattleSquad,
    squadHas,
    squadCount,
    addToSquad,
    removeFromSquad,
    getRegisteredDeck,
    setRegisteredDeck,
    isDeckRegistered,
    getRegisteredSquad,
    setRegisteredSquad,
    undoDeckChanges,
    hasRegisteredDeck,
    pruneDeadDeckUnits,
    loadDeckUnits,
    syncDeckFromChain,
    registerDeckOnChain,
    isRonkePowerEnabled,
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
