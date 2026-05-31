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
    const [ron, ronke, ronkeverse, allowance, dailyCap, dailyUsed, remaining, totalAlive, nftBalance, pending, pricing] = await Promise.all([
      pc.getBalance({ address: addr }),
      pc.readContract({ address: ADDR.ronke, abi: ERC20_ABI, functionName: 'balanceOf', args: [addr] }),
      pc.readContract({ address: ADDR.ronkeverse, abi: ERC721_ABI, functionName: 'balanceOf', args: [addr] }),
      pc.readContract({ address: ADDR.ronke, abi: ERC20_ABI, functionName: 'allowance', args: [addr, ADDR.barracks] }),
      read('getPersonalDailyCap', [addr]),
      read('dailyMintedCount', [addr]),
      read('getRemainingDailyMint', [addr]),
      read('totalAlive'),
      read('balanceOf', [addr]),
      read('pending', [addr]),
      read('getCurrentPricing'),
    ]);
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
  async function fetchInventory(addr) {
    const balance = await read('balanceOf', [addr]);
    const n = Number(balance);
    if (n === 0) return [];
    const tokenIds = [];
    for (let i = 0; i < n; i++) {
      tokenIds.push(await read('tokenOfOwnerByIndex', [addr, BigInt(i)]));
    }
    const units = await Promise.all(tokenIds.map(async (id) => {
      const d = await read('getUnitFullData', [id]);
      return {
        tokenId: id,
        utype: d[0], xp: Number(d[1]), level: Number(d[2]),
        battles: Number(d[3]), wins: Number(d[4]), kills: Number(d[5]),
        mintedAt: Number(d[6]), lastBattleAt: Number(d[7]),
        name: UTYPE[d[0]]?.name || 'Unknown',
        image: UTYPE[d[0]]?.image || UTYPE[1].image,
        rarity: UTYPE[d[0]]?.rarity || 'common',
      };
    }));
    return units;
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

  async function approveRonke(amount) {
    await ensureNetwork();
    const wc = await getWalletClient();
    const v = await getViem();
    const addr = window.Wallet.getAddress();
    const hash = await wc.writeContract({
      address: ADDR.ronke, abi: ERC20_ABI, functionName: 'approve',
      args: [ADDR.barracks, amount], account: addr,
    });
    const pc = await getPublicClient();
    await pc.waitForTransactionReceipt({ hash });
    return hash;
  }

  async function startTraining(utype, qty) {
    await ensureNetwork();
    const wc = await getWalletClient();
    const addr = window.Wallet.getAddress();
    const hash = await wc.writeContract({
      address: ADDR.barracks, abi: BARRACKS_ABI, functionName: 'startTraining',
      args: [utype, qty], account: addr,
    });
    const pc = await getPublicClient();
    await pc.waitForTransactionReceipt({ hash });
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
    const pc = await getPublicClient();
    await pc.waitForTransactionReceipt({ hash });
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
    const pc = await getPublicClient();
    await pc.waitForTransactionReceipt({ hash });
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
