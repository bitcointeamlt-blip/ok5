// wallet.js — Ronin wallet integration for Lenta (Dungeon Crawler)
// - Connect via window.ronin.provider (EIP-1193)
// - Chain: Ronin Mainnet (2020)
// - RONKE ERC-20 balance + Ronkeverse ERC-721 NFTs
// - Profile key binding: timelock_profile_ronin_<address>
//
// Public API exposed via window.Wallet.
(function () {
  'use strict';

  const RONIN_CHAIN_ID_DEC = 2020;
  const RONIN_CHAIN_ID_HEX = '0x7e4';
  const RONIN_RPC = 'https://api.roninchain.com/rpc';
  const RONKE_TOKEN = '0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb';
  const RONKEVERSE_NFT = '0x810b6d1374ac7ba0e83612e7d49f49a13f1de019';
  const LOGIN_MSG = 'Login to Dungeon Crawler (Lenta)';

  // Waypoint = embedded wallet fallback (mobile / no extension). EIP-1193 compatible.
  const WAYPOINT_CLIENT_ID = '8c00d3f9-df95-4a65-b533-90b96ade346e';
  const WAYPOINT_CDN = 'https://esm.sh/@sky-mavis/waypoint@4.2.2';
  let _waypointProvider = null;
  let _waypointPromise = null;

  // WalletConnect = prijungti Ronin Wallet MOBILE APP iš įprastos naršyklės (Chrome) per
  // deep-link/QR. Leidžia žaisti Chrome'e (kur ekranas pasiverčia) IR naudoti tikrą Ronin wallet'ą.
  // ⚠️ REIKIA project ID — nemokamai iš https://cloud.reown.com (WalletConnect). Be jo neveiks.
  const WC_PROJECT_ID = '8d292c332cdae8a9cbd563b6cb7e491c';   // Reown/WalletConnect project ID
  const WC_CDN = 'https://esm.sh/@walletconnect/ethereum-provider@2.17.2';
  let _wcProvider = null;
  let _wcPromise = null;

  // Lazy-loads WalletConnect EthereumProvider (Ronin chain). showQrModal → modalas su
  // wallet pasirinkimu; mobiliam deep-link'ina į Ronin app.
  async function getWalletConnectProvider() {
    if (_wcProvider) return _wcProvider;
    if (!WC_PROJECT_ID) throw new Error('Ronin Wallet connect not configured yet (missing WalletConnect project ID)');
    if (!_wcPromise) {
      _wcPromise = (async () => {
        const mod = await Promise.race([
          import(/* @vite-ignore */ WC_CDN),
          new Promise((_, rej) => setTimeout(() => rej(new Error('WalletConnect SDK load timed out — check connection')), 25000)),
        ]);
        const EP = mod.EthereumProvider || (mod.default && mod.default.EthereumProvider) || mod.default;
        if (!EP || typeof EP.init !== 'function') throw new Error('WalletConnect SDK not available');
        _wcProvider = await EP.init({
          projectId: WC_PROJECT_ID,
          chains: [RONIN_CHAIN_ID_DEC],          // 2020 Ronin mainnet
          optionalChains: [RONIN_CHAIN_ID_DEC],
          showQrModal: true,
          rpcMap: { [RONIN_CHAIN_ID_DEC]: RONIN_RPC },
          metadata: {
            name: 'PewPew',
            description: 'PewPew — Ronin',
            url: window.location.origin,
            icons: [window.location.origin + '/lenta/assets_tiny/Buildings_Castle.png'],
          },
        });
        // MOBILE UX (RAMIRO feedback): WalletConnect savaime NEatidaro wallet app sekantiems
        // request'ams (sign/TX) → user'is turi rankom persijungti. Wrapinam request: ant
        // user-action metodų deep-link'inam Ronin app į priekį (iš session redirect metadata).
        try {
          const _orig = _wcProvider.request.bind(_wcProvider);
          const _UI = ['personal_sign', 'eth_sign', 'eth_sendTransaction', 'eth_signTransaction',
                       'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4',
                       'wallet_switchEthereumChain', 'wallet_addEthereumChain'];
          const _isMob = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
          _wcProvider.request = function (args) {
            try {
              if (_isMob && args && _UI.indexOf(args.method) !== -1) {
                const md = _wcProvider.session && _wcProvider.session.peer && _wcProvider.session.peer.metadata;
                const r = md && md.redirect;
                if (r && r.native) {
                  // Custom scheme (pvz. roninwallet://) → OS atidaro app, puslapis LIEKA.
                  try { window.location.href = r.native; } catch (_) {}
                } else if (r && r.universal) {
                  // Universal (https) → window.open kad neišmestų iš žaidimo.
                  try { window.open(r.universal, '_blank'); } catch (_) {}
                }
              }
            } catch (_) {}
            return _orig(args);
          };
        } catch (_) {}
        return _wcProvider;
      })().catch((e) => { _wcPromise = null; throw e; });
    }
    return _wcPromise;
  }

  // DungeonTrophies kontraktas — Ronin Mainnet (chainId 2020).
  // Deployed 2026-05-23 from 0x32782D97...624A.
  const TROPHY_CONTRACT = '0xb7873833e7AC43c921AF736F2E3988Ba26a39512';
  const VIEM_CDN = 'https://esm.sh/viem@2.21.55';
  let _viemModule = null;

  const LS = {
    ADDR: 'lenta_wallet_address',
    SIG:  'lenta_wallet_signature',
    MSG:  'lenta_wallet_message',
    METHOD: 'lenta_wallet_method',   // 'roninwc' | 'waypoint' | 'ronin' — kad restore žinotų
  };

  const state = {
    provider: null,
    address: null,
    connected: false,
    chainId: null,
    ronkeBalance: null,   // number | null
    nfts: null,           // [{tokenId, name, image, description}] | null
    nftsLoading: false,
    balLoading: false,
  };

  const listeners = [];
  function notify() { for (const fn of listeners) { try { fn(snapshot()); } catch (e) { console.warn(e); } } }
  function snapshot() { return Object.assign({}, state); }
  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  function getRoninProvider() {
    try {
      const r = window.ronin;
      if (r && r.provider && typeof r.provider.request === 'function') return r.provider;
      if (r && typeof r.request === 'function') return r;
    } catch {}
    return null;
  }

  // Lazy-loads Ronin Waypoint SDK (embedded wallet for mobile / no extension).
  async function getWaypointProvider() {
    if (_waypointProvider) return _waypointProvider;
    if (!_waypointPromise) {
      _waypointPromise = (async () => {
        // Timeout — kad mobiliam (lėtas/blokuotas esm.sh CDN) nekabintų amžinai "Loading..."
        const mod = await Promise.race([
          import(/* @vite-ignore */ WAYPOINT_CDN),
          new Promise((_, rej) => setTimeout(
            () => rej(new Error('Wallet SDK load timed out — check connection & try again')), 25000)),
        ]);
        const Wp = mod.WaypointProvider || (mod.default && mod.default.WaypointProvider);
        if (!Wp || typeof Wp.create !== 'function') throw new Error('Waypoint SDK not available');
        // Match Sky Mavis Console exact URI (no trailing slash).
        _waypointProvider = Wp.create({
          clientId: WAYPOINT_CLIENT_ID,
          chainId: RONIN_CHAIN_ID_DEC,
          redirectUrl: window.location.origin + '/lenta',
        });
        return _waypointProvider;
      })().catch((e) => { _waypointPromise = null; throw e; });
    }
    return _waypointPromise;
  }

  // Returns any usable EIP-1193 provider: native Ronin extension first, then Waypoint.
  async function getAnyProvider() {
    const native = getRoninProvider();
    if (native) return native;
    return await getWaypointProvider();
  }

  // True if either Ronin extension OR Waypoint (always available via CDN).
  function isInstalled() { return true; }

  function shortAddress(a) {
    const addr = a || state.address;
    if (!addr) return '';
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  }

  function profileKey() {
    if (state.connected && state.address) {
      return 'timelock_profile_ronin_' + state.address.toLowerCase();
    }
    return null; // null = anonymous, do not persist
  }

  // ── RPC helpers ────────────────────────────────────────────────────
  function pad32(hexNo0x) { return hexNo0x.toLowerCase().padStart(64, '0'); }
  function strip0x(h) { return h.startsWith('0x') ? h.slice(2) : h; }
  function hexToBigInt(h) { if (!h || h === '0x') return 0n; return BigInt(h); }

  async function rpcCall(to, data) {
    const resp = await fetch(RONIN_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'], id: 1 }),
    });
    const j = await resp.json();
    if (j.error) throw new Error(j.error.message || 'RPC error');
    return j.result;
  }

  function decodeAbiString(hex) {
    if (!hex || hex === '0x') return '';
    const h = strip0x(hex);
    // Layout: [0..64) offset, [64..128) length, [128..) data
    const len = parseInt(h.slice(64, 128), 16);
    if (!Number.isFinite(len) || len <= 0) return '';
    const dataHex = h.slice(128, 128 + len * 2);
    let out = '';
    for (let i = 0; i < dataHex.length; i += 2) {
      out += String.fromCharCode(parseInt(dataHex.slice(i, i + 2), 16));
    }
    try { out = decodeURIComponent(escape(out)); } catch {}
    return out;
  }

  function resolveIpfs(url) {
    if (!url) return '';
    if (url.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + url.slice(7);
    if (url.startsWith('ipfs/')) return 'https://ipfs.io/' + url;
    return url;
  }

  // ── ERC-20 RONKE ──────────────────────────────────────────────────
  async function fetchRonkeBalance(addr) {
    // balanceOf(address) = 0x70a08231
    const data = '0x70a08231' + pad32(strip0x(addr));
    const result = await rpcCall(RONKE_TOKEN, data);
    const raw = hexToBigInt(result);
    return Number(raw) / 1e18;
  }

  async function refreshBalance() {
    if (!state.connected || !state.address) return;
    state.balLoading = true; notify();
    try {
      state.ronkeBalance = await fetchRonkeBalance(state.address);
    } catch (e) {
      console.warn('[wallet] RONKE balance failed:', e);
      state.ronkeBalance = null;
    } finally {
      state.balLoading = false; notify();
    }
  }

  // ── ERC-721 Ronkeverse NFTs ──────────────────────────────────────
  async function fetchNftBalance(addr) {
    // balanceOf(address) = 0x70a08231 (same selector as ERC-20)
    const data = '0x70a08231' + pad32(strip0x(addr));
    const r = await rpcCall(RONKEVERSE_NFT, data);
    return Number(hexToBigInt(r));
  }

  async function fetchTokenOfOwnerByIndex(addr, idx) {
    // tokenOfOwnerByIndex(address,uint256) = 0x2f745c59
    const idxHex = BigInt(idx).toString(16).padStart(64, '0');
    const data = '0x2f745c59' + pad32(strip0x(addr)) + idxHex;
    const r = await rpcCall(RONKEVERSE_NFT, data);
    return hexToBigInt(r).toString();
  }

  async function fetchTokenURI(tokenId) {
    // tokenURI(uint256) = 0xc87b56dd
    const idHex = BigInt(tokenId).toString(16).padStart(64, '0');
    const r = await rpcCall(RONKEVERSE_NFT, '0xc87b56dd' + idHex);
    return decodeAbiString(r);
  }

  async function fetchViaProxies(url) {
    // Try direct first, then cascade of CORS proxies.
    const attempts = [
      { name: 'direct', url },
      { name: 'allorigins', url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url) },
      { name: 'codetabs', url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url) },
      { name: 'corsproxy', url: 'https://corsproxy.io/?' + encodeURIComponent(url) },
    ];
    let lastErr = null;
    for (const a of attempts) {
      try {
        const r = await fetch(a.url);
        if (!r.ok) { lastErr = new Error(a.name + ' ' + r.status); continue; }
        const text = await r.text();
        // Some proxies wrap the response; expect raw JSON.
        try { return JSON.parse(text); }
        catch (pe) { lastErr = new Error(a.name + ' bad json'); continue; }
      } catch (e) { lastErr = e; continue; }
    }
    throw lastErr || new Error('all proxies failed');
  }

  async function fetchNftMeta(tokenId) {
    const fallback = { tokenId, name: 'Ronkeverse #' + tokenId, image: '', description: '' };
    try {
      const uri = await fetchTokenURI(tokenId);
      if (!uri) { console.warn('[wallet] empty tokenURI for', tokenId); return fallback; }
      const metaUrl = resolveIpfs(uri);
      let meta;
      try {
        meta = await fetchViaProxies(metaUrl);
      } catch (e) {
        console.warn('[wallet] metadata fetch failed for', tokenId, metaUrl, e && e.message);
        return fallback;
      }
      if (!meta || typeof meta !== 'object') {
        console.warn('[wallet] bad metadata shape for', tokenId, meta);
        return fallback;
      }
      let img = meta.image || meta.image_url || meta.imageUrl || meta.imageURI || '';
      // Handle relative URLs (e.g. "/images/xxx.png")
      if (img && img.startsWith('/') && !img.startsWith('//')) {
        try {
          const base = new URL(metaUrl);
          img = base.protocol + '//' + base.host + img;
        } catch {}
      }
      img = resolveIpfs(img);
      if (!img) console.warn('[wallet] no image field in metadata for', tokenId, 'keys:', Object.keys(meta), meta);
      return {
        tokenId,
        name: meta.name || fallback.name,
        image: img,
        description: meta.description || '',
        attributes: meta.attributes || meta.traits || null,
      };
    } catch (e) {
      console.warn('[wallet] fetchNftMeta error for', tokenId, e);
      return fallback;
    }
  }

  async function refreshNfts(opts) {
    if (!state.connected || !state.address) return;
    const cap = (opts && opts.cap) || 30;
    state.nftsLoading = true; notify();
    try {
      const balance = await fetchNftBalance(state.address);
      if (balance === 0) { state.nfts = []; return; }
      const ids = [];
      const lim = Math.min(balance, cap);
      for (let i = 0; i < lim; i++) {
        try {
          const id = await fetchTokenOfOwnerByIndex(state.address, i);
          ids.push(id);
          if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 200));
        } catch (e) { console.warn('[wallet] tokenOfOwnerByIndex', i, e); break; }
      }
      // Partial-progress rendering: emit NFT entries as metadata resolves.
      const partial = ids.map(id => ({ tokenId: id, name: 'Ronkeverse #' + id, image: '', description: '', loading: true }));
      state.nfts = partial; notify();
      for (let i = 0; i < ids.length; i++) {
        const meta = await fetchNftMeta(ids[i]);
        state.nfts[i] = meta;
        notify();
        if (i < ids.length - 1) await new Promise(r => setTimeout(r, 150));
      }
    } catch (e) {
      console.warn('[wallet] refreshNfts failed:', e);
      if (state.nfts === null) state.nfts = [];
    } finally {
      state.nftsLoading = false; notify();
    }
  }

  // ── Connect / disconnect / restore ────────────────────────────────
  // method: undefined/'auto' (native→Waypoint, kaip anksčiau) | 'waypoint' (email/social)
  //         | 'roninwc' (Ronin Wallet mobile per WalletConnect) | 'ronin' (native arba WC).
  async function connect(method) {
    let prov;
    try {
      if (method === 'waypoint')      prov = await getWaypointProvider();
      else if (method === 'roninwc')  prov = await getWalletConnectProvider();
      else if (method === 'ronin')    prov = getRoninProvider() || await getWalletConnectProvider();
      else                            prov = await getAnyProvider();   // auto (default, nepakeista)
    } catch (e) {
      throw new Error('Wallet provider unavailable: ' + (e && e.message ? e.message : e));
    }
    if (!prov) throw new Error('No wallet provider found');
    state.provider = prov;
    // WalletConnect — atidaryti QR/deep-link modalą (enable/connect) prieš prašant accounts.
    let accounts;
    if (prov === _wcProvider) {
      try {
        if (typeof prov.enable === 'function') accounts = await prov.enable();
        else if (typeof prov.connect === 'function') { await prov.connect(); accounts = prov.accounts; }
      } catch (e) {
        throw new Error('Ronin Wallet connection cancelled or failed');
      }
      if (!accounts || !accounts.length) accounts = prov.accounts || [];
    } else {
      accounts = await prov.request({ method: 'eth_requestAccounts' });
    }
    if (!accounts || !accounts.length) throw new Error('No accounts returned');
    const addr = accounts[0];

    let signature = null;
    // Detect Waypoint provider — embedded wallet already authenticated via OAuth.
    // Mobile popup signing is unreliable (popup blocked after 1st popup closes).
    // For Waypoint we treat OAuth completion as proof of ownership; skip personal_sign.
    const isWaypoint = (prov === _waypointProvider);
    if (isWaypoint) {
      signature = 'waypoint:oauth';   // marker — non-empty so persistence works
    } else {
      try {
        signature = await prov.request({ method: 'personal_sign', params: [LOGIN_MSG, addr] });
      } catch (e) {
        throw new Error('Login signature rejected');
      }
    }

    state.address = addr;
    state.connected = true;
    const usedMethod = (prov === _wcProvider) ? 'roninwc'
                     : (prov === _waypointProvider) ? 'waypoint' : 'ronin';
    try {
      localStorage.setItem(LS.ADDR, addr);
      localStorage.setItem(LS.SIG, signature);
      localStorage.setItem(LS.MSG, LOGIN_MSG);
      localStorage.setItem(LS.METHOD, usedMethod);
    } catch {}

    // Attach event listeners to the provider that just connected (Waypoint or native).
    attachListeners(prov);

    notify();
    // Notify game to reload profile for this wallet
    try { if (typeof window.reloadProfileForWallet === 'function') window.reloadProfileForWallet(); } catch {}

    // Best-effort: chain check (non-blocking)
    chainIdCheck().catch(() => {});
    refreshBalance().catch(() => {});
    refreshNfts().catch(() => {});

    return { address: addr, signature };
  }

  async function disconnect() {
    // WC — uždarom sesiją švariai (explicit logout / session_delete).
    try { if (_wcProvider && typeof _wcProvider.disconnect === 'function') _wcProvider.disconnect(); } catch (_) {}
    state.address = null;
    state.connected = false;
    state.chainId = null;
    state.ronkeBalance = null;
    state.nfts = null;
    try {
      localStorage.removeItem(LS.ADDR);
      localStorage.removeItem(LS.SIG);
      localStorage.removeItem(LS.MSG);
      localStorage.removeItem(LS.METHOD);
    } catch {}
    notify();
    try { if (typeof window.reloadProfileForWallet === 'function') window.reloadProfileForWallet(); } catch {}
  }

  async function chainIdCheck() {
    const prov = state.provider || getRoninProvider();
    if (!prov) return null;
    try {
      const hex = await prov.request({ method: 'eth_chainId' });
      const n = Number(BigInt(hex));
      state.chainId = n;
      notify();
      return n;
    } catch { return null; }
  }

  function _lsAddr() { try { return localStorage.getItem(LS.ADDR); } catch { return null; } }
  async function restore() {
    const saved = _lsAddr();
    if (!saved) return false;
    const savedMethod = (function () { try { return localStorage.getItem(LS.METHOD); } catch { return null; } })();

    function _markRestored(prov) {
      state.provider = prov;
      state.address = saved;
      state.connected = true;
      attachListeners(prov);
      notify();
      try { if (typeof window.reloadProfileForWallet === 'function') window.reloadProfileForWallet(); } catch {}
      chainIdCheck().catch(() => {});
      refreshBalance().catch(() => {});
      refreshNfts().catch(() => {});
    }

    // WalletConnect — atstatom persistuotą WC sesiją (be re-sign). NEtrinam jei nepavyksta
    // (gali būti tik lėtas relay) — kad neatsijungtų po reload kaip „disconnect after game".
    if (savedMethod === 'roninwc') {
      try {
        const prov = await getWalletConnectProvider();   // EP.init atstato persistuotą sesiją silent
        let accounts = (prov.accounts && prov.accounts.length) ? prov.accounts : null;
        if (!accounts) { try { accounts = await prov.request({ method: 'eth_accounts' }); } catch (_) {} }
        const ok = accounts && accounts.map(a => a.toLowerCase()).includes(saved.toLowerCase());
        if (ok) { _markRestored(prov); return true; }
      } catch (_) {}
      return false;   // NEtrinam sesijos
    }

    // Injected (native) — ATSPARUS laikinam provider/eth_accounts vėlavimui.
    // Transient tuščias eth_accounts (extension dar kraunasi / užrakinta) NEBETRINA kredencialų,
    // kad žaidėjui NEREIKĖTŲ vėl pasirašyt. Trinam TIK kai aiškiai persijungta į kitą account'ą.
    let prov = getRoninProvider();
    for (let i = 0; i < 4 && !prov; i++) { await new Promise((r) => setTimeout(r, 350)); prov = getRoninProvider(); }
    if (!prov) return false;   // provider dar neįsikrovė — kredencialai lieka, atstatysim vėliau
    state.provider = prov;
    let accounts = null;
    for (let i = 0; i < 4; i++) {
      try { accounts = await prov.request({ method: 'eth_accounts' }); } catch (_) { accounts = null; }
      if (accounts && accounts.length) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (accounts && accounts.length) {
      if (accounts.map((a) => a.toLowerCase()).includes(saved.toLowerCase())) { _markRestored(prov); return true; }
      await disconnect();   // account'ai yra, bet saved nėra → tikras account switch → trinam
      return false;
    }
    // tuščia/klaida po retry → transient (užrakinta/vėluoja) → NEBETRINAM kredencialų, tik ne-connected šįkart
    attachListeners(prov);   // kad accountsChanged (po unlock) auto-reconnectintų
    return false;
  }

  function attachListeners(prov) {
    if (!prov || typeof prov.on !== 'function') return;
    if (prov.__lentaListenersAttached) return;
    const isWC = (prov === _wcProvider);
    try {
      prov.on('accountsChanged', (accounts) => {
        if (!accounts || accounts.length === 0) {
          // Tuščias accountsChanged dažnai TRANSIENT (WC: app backgrounding per TX deep-link;
          // injected: extension užrakinta). NEtrinam kredencialų — tik soft (connected=false),
          // kad po unlock auto-reconnectintų be re-sign.
          if (isWC) return;
          state.connected = false; notify(); return;
        }
        const acc0 = accounts[0].toLowerCase();
        const savedAddr = (state.address || _lsAddr() || '').toLowerCase();
        if (savedAddr && acc0 === savedAddr) {
          // Tas pats account'as grįžo (po unlock) → re-connect BE re-sign.
          if (!state.connected) { state.address = accounts[0]; state.connected = true; notify(); refreshBalance().catch(() => {}); }
          return;
        }
        if (savedAddr && acc0 !== savedAddr) {
          disconnect();   // tikras account switch — reikia naujo parašo
        }
      });
      prov.on('chainChanged', () => { chainIdCheck(); });
      if (isWC) {
        // WC: 'disconnect' event = dažniausiai transient relay drop (pvz. kai per TX
        // deep-link'inama į Ronin app → puslapis backgrounded → WebSocket dropina).
        // SDK pati persistina sesiją + reconnect'ina relay → NETRINAM. Tikras logout =
        // 'session_delete' (user atjungė wallet app'e).
        try { prov.on('session_delete', () => { disconnect(); }); } catch (_) {}
      } else {
        prov.on('disconnect', () => { disconnect(); });
      }
      prov.__lentaListenersAttached = true;
    } catch (e) { console.warn('[wallet] listener setup failed:', e); }
  }

  function setupAccountListener() {
    // Attach to whatever native provider is available at init time.
    // Waypoint provider listeners get attached lazily after connect() succeeds.
    attachListeners(getRoninProvider());
  }

  function init() {
    setupAccountListener();
    restore().catch(() => {});
  }

  // Phase 15 — Submit a signed trophy claim to the DungeonTrophies contract.
  // claim = { wallet, achievementIdHash, nonce, deadline, signature }
  // Returns { txHash } on success or throws.
  async function claimTrophy(claim) {
    if (!state.connected) throw new Error('Wallet not connected');
    const prov = state.provider || (await getAnyProvider());
    if (!prov) throw new Error('No wallet provider');

    // ── NETWORK GUARD ────────────────────────────────────────────────
    // Trophy contract lives on Ronin Mainnet. If the user's wallet is
    // pointed at Ethereum / BNB / Saigon / anything else, the claim tx
    // will broadcast to the wrong chain and silently fail. Prompt the
    // wallet to switch to Ronin before signing.
    try {
      const curChainHex = await prov.request({ method: 'eth_chainId' });
      const curChain = Number(BigInt(curChainHex));
      if (curChain !== RONIN_CHAIN_ID_DEC) {
        try {
          await prov.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: RONIN_CHAIN_ID_HEX }],
          });
        } catch (switchErr) {
          // If the wallet doesn't have Ronin configured, try to add it.
          if (switchErr && (switchErr.code === 4902 || /not added|unrecognized/i.test(String(switchErr.message || '')))) {
            await prov.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: RONIN_CHAIN_ID_HEX,
                chainName: 'Ronin Mainnet',
                nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 },
                rpcUrls: [RONIN_RPC],
                blockExplorerUrls: ['https://app.roninchain.com'],
              }],
            });
          } else {
            throw new Error('Wrong network — switch to Ronin Mainnet (chainId 2020) and retry. Current: ' + curChain);
          }
        }
        // Re-check after switch attempt.
        const newChainHex = await prov.request({ method: 'eth_chainId' });
        const newChain = Number(BigInt(newChainHex));
        if (newChain !== RONIN_CHAIN_ID_DEC) {
          throw new Error('Network switch declined. Please select Ronin Mainnet in your wallet and try again.');
        }
      }
    } catch (e) {
      if (e && e.message && e.message.indexOf('Wrong network') === 0) throw e;
      if (e && e.message && e.message.indexOf('Network switch') === 0) throw e;
      console.warn('[claimTrophy] chainId check failed, attempting tx anyway:', e);
    }

    if (!_viemModule) _viemModule = await import(/* @vite-ignore */ VIEM_CDN);
    const { encodeFunctionData } = _viemModule;

    const data = encodeFunctionData({
      abi: [{
        type: 'function',
        name: 'claimTrophy',
        stateMutability: 'payable',
        inputs: [
          { name: 'recipient', type: 'address' },
          { name: 'achievementIdHash', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'signature', type: 'bytes' },
        ],
        outputs: [],
      }],
      functionName: 'claimTrophy',
      args: [
        claim.wallet,
        claim.achievementIdHash,
        BigInt(claim.nonce),
        BigInt(claim.deadline),
        claim.signature,
      ],
    });

    // Read current mint price via Ronin Mainnet RPC (off-thread, doesn't require wallet).
    // Was hardcoded saigon-testnet — fixed 2026-05-23 post-mainnet flip.
    const priceHex = await fetch(RONIN_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'eth_call', id: 1,
        params: [{ to: TROPHY_CONTRACT, data: '0xe82ded21' }, 'latest'],  // getCurrentMintPrice()
      }),
    }).then(r => r.json()).then(r => r.result).catch(() => '0x0');
    // Guard against null/undefined/NaN from RPC failure
    const priceStr = (typeof priceHex === 'string' && priceHex.startsWith('0x') && priceHex.length > 2) ? priceHex : '0x0';
    const valueHex = '0x' + BigInt(priceStr).toString(16);

    // MOBILE-ROBUST mint. Ronin in-app naršyklėj `eth_sendTransaction` kartais pakimba
    // arba grąžina hash net jei TX vėliau revert'ina (deadline) → UI klaidingai rodydavo
    // „Minted!". Sprendimas: pollinam DungeonTrophies balanceOf padidėjimą per eth_call
    // (veikia patikimai mobiliam) ir grąžinam sėkmę TIK kai mint'as realiai užfiksuotas.
    async function _trophyBalance() {
      const h = await fetch(RONIN_RPC, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', id: 1,
          params: [{ to: TROPHY_CONTRACT, data: '0x70a08231' + state.address.slice(2).toLowerCase().padStart(64, '0') }, 'latest'] }),
      }).then(r => r.json()).then(r => r.result).catch(() => null);
      return (typeof h === 'string' && h.startsWith('0x') && h.length > 2) ? BigInt(h) : null;
    }
    const balBefore = (await _trophyBalance()) || 0n;

    let txHash = null, sendErr = null;
    prov.request({
      method: 'eth_sendTransaction',
      params: [{ from: state.address, to: TROPHY_CONTRACT, data, value: valueHex }],
    }).then(function (h) { txHash = h; }).catch(function (e) { sendErr = e; });

    const _deadline = Date.now() + 120000;   // 2 min patvirtinimui
    while (Date.now() < _deadline) {
      await new Promise(function (r) { setTimeout(r, 3000); });
      const b = await _trophyBalance();
      if (b !== null && b > balBefore) return { txHash: txHash || 'confirmed', price: priceHex };
      // User atmetė TX piniginėj (ne hang/timeout) → nutraukiam iškart su tikra klaida.
      if (sendErr && (sendErr.code === 4001 || /reject|denied|cancel/i.test(sendErr.message || ''))) {
        throw sendErr;
      }
    }
    throw new Error('Mint not confirmed — the transaction may have failed or is still pending. Please try CLAIM again.');
  }

  // ── RONKE Faucet on-chain claim — ŽAIDĖJAS PATS pateikia TX + moka gas (PoD: unikalus adresas + gas) ──
  // claim = { player, amount(wei str), deadline(str), nonce(str), signature, contract, chainId }.
  // Serveris jau pasirašė ClaimReward (anti-cheat); čia tik on-chain submit per žaidėjo piniginę.
  async function submitFaucetClaim(claim) {
    if (!claim || !claim.contract || !claim.signature) throw new Error('Bad claim payload');
    const prov = state.provider || (await getAnyProvider());
    if (!prov) throw new Error('Wallet not connected');
    // Adresą atstatom net jei state.connected flickerino tarp sign ir submit (injected provider veikia).
    let from = state.address;
    if (!from) {
      try { const a1 = await prov.request({ method: 'eth_accounts' }); if (Array.isArray(a1) && a1[0]) from = a1[0]; } catch (_) {}
      if (!from) { try { const a2 = await prov.request({ method: 'eth_requestAccounts' }); if (Array.isArray(a2) && a2[0]) from = a2[0]; } catch (_) {} }
    }
    if (!from) throw new Error('Wallet not connected — reopen wallet and tap COLLECT to retry');

    // ── NETWORK GUARD → Ronin Mainnet ──
    try {
      const curChainHex = await prov.request({ method: 'eth_chainId' });
      const curChain = Number(BigInt(curChainHex));
      if (curChain !== RONIN_CHAIN_ID_DEC) {
        try {
          await prov.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: RONIN_CHAIN_ID_HEX }] });
        } catch (switchErr) {
          if (switchErr && (switchErr.code === 4902 || /not added|unrecognized/i.test(String(switchErr.message || '')))) {
            await prov.request({ method: 'wallet_addEthereumChain', params: [{ chainId: RONIN_CHAIN_ID_HEX, chainName: 'Ronin Mainnet', nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 }, rpcUrls: [RONIN_RPC], blockExplorerUrls: ['https://app.roninchain.com'] }] });
          } else {
            throw new Error('Wrong network — switch to Ronin Mainnet (chainId 2020) and retry. Current: ' + curChain);
          }
        }
        const newChainHex = await prov.request({ method: 'eth_chainId' });
        if (Number(BigInt(newChainHex)) !== RONIN_CHAIN_ID_DEC) throw new Error('Network switch declined. Select Ronin Mainnet and retry.');
      }
    } catch (e) {
      if (e && e.message && /Wrong network|Network switch/.test(e.message)) throw e;
      console.warn('[submitFaucetClaim] chainId check failed, attempting tx anyway:', e);
    }

    if (!_viemModule) _viemModule = await import(/* @vite-ignore */ VIEM_CDN);
    const { encodeFunctionData } = _viemModule;
    const data = encodeFunctionData({
      abi: [{
        type: 'function', name: 'claimReward', stateMutability: 'nonpayable',
        inputs: [
          { name: 'player', type: 'address' }, { name: 'amount', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'sig', type: 'bytes' },
        ],
        outputs: [],
      }],
      functionName: 'claimReward',
      args: [claim.player, BigInt(claim.amount), BigInt(claim.deadline), BigInt(claim.nonce), claim.signature],
    });

    // RONKE balanceOf(player) prieš → patvirtinimui (mobile-robust polling, kaip trophy mint).
    async function _ronkeBal() {
      const h = await fetch(RONIN_RPC, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', id: 1,
          params: [{ to: RONKE_TOKEN, data: '0x70a08231' + state.address.slice(2).toLowerCase().padStart(64, '0') }, 'latest'] }),
      }).then(r => r.json()).then(r => r.result).catch(() => null);
      return (typeof h === 'string' && h.startsWith('0x') && h.length > 2) ? BigInt(h) : null;
    }
    void _ronkeBal;   // (paliktas dėl suderinamumo; patvirtinimas dabar per receipt)

    let txHash = null, sendErr = null;
    prov.request({ method: 'eth_sendTransaction', params: [{ from: from, to: claim.contract, data }] })
      .then(function (h) { txHash = h; }).catch(function (e) { sendErr = e; });

    const _deadline = Date.now() + 120000;   // 2 min patvirtinimui
    while (Date.now() < _deadline) {
      await new Promise(function (r) { setTimeout(r, 2500); });
      // Surface ALL send errors (ne tik cancel) — kad matytume tikrą priežastį
      if (sendErr) {
        if (sendErr.code === 4001 || /reject|denied|cancel/i.test(sendErr.message || '')) throw sendErr;
        throw new Error('Wallet could not send TX: ' + (sendErr.message || sendErr.code || 'unknown'));
      }
      if (txHash) {
        const rc = await fetch(RONIN_RPC, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
        }).then(r => r.json()).then(r => r.result).catch(() => null);
        if (rc) {
          if (rc.status === '0x1') return { txHash };
          throw new Error('Claim TX reverted on-chain');
        }
      }
    }
    throw new Error('Claim not confirmed — TX may be pending. Try CLAIM again.');
  }

  // ── F12 PLAY FEE — žaidėjas pasirašo 5 RONKE transfer į treasury PRIEŠ žaidimą ──
  // Be naujo kontrakto: paprastas ERC20 transfer ant esamo RONKE token'o. Žaidėjas moka gas → PoD.
  const PLAY_FEE_RONKE = 5;
  const PLAY_TREASURY = '0xfF0a2d76E6156Bc1C0c689fe4029f6F1a566E92e';   // treasury — surenka play fee (5 RONKE)
  async function payToPlay() {
    if (!state.connected) throw new Error('Wallet not connected');
    const prov = state.provider || (await getAnyProvider());
    if (!prov) throw new Error('No wallet provider');

    // ── NETWORK GUARD → Ronin Mainnet ──
    try {
      const curChainHex = await prov.request({ method: 'eth_chainId' });
      if (Number(BigInt(curChainHex)) !== RONIN_CHAIN_ID_DEC) {
        try {
          await prov.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: RONIN_CHAIN_ID_HEX }] });
        } catch (switchErr) {
          if (switchErr && (switchErr.code === 4902 || /not added|unrecognized/i.test(String(switchErr.message || '')))) {
            await prov.request({ method: 'wallet_addEthereumChain', params: [{ chainId: RONIN_CHAIN_ID_HEX, chainName: 'Ronin Mainnet', nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 }, rpcUrls: [RONIN_RPC], blockExplorerUrls: ['https://app.roninchain.com'] }] });
          } else { throw new Error('Wrong network — switch to Ronin Mainnet (2020) and retry.'); }
        }
        const newChainHex = await prov.request({ method: 'eth_chainId' });
        if (Number(BigInt(newChainHex)) !== RONIN_CHAIN_ID_DEC) throw new Error('Network switch declined.');
      }
    } catch (e) {
      if (e && e.message && /Wrong network|Network switch/.test(e.message)) throw e;
      console.warn('[payToPlay] chainId check failed, attempting tx anyway:', e);
    }

    if (!_viemModule) _viemModule = await import(/* @vite-ignore */ VIEM_CDN);
    const { encodeFunctionData } = _viemModule;
    const data = encodeFunctionData({
      abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
      functionName: 'transfer',
      args: [PLAY_TREASURY, BigInt(PLAY_FEE_RONKE) * (10n ** 18n)],
    });

    let txHash = null, sendErr = null;
    prov.request({ method: 'eth_sendTransaction', params: [{ from: state.address, to: RONKE_TOKEN, data }] })
      .then(function (h) { txHash = h; }).catch(function (e) { sendErr = e; });

    const _deadline = Date.now() + 120000;
    while (Date.now() < _deadline) {
      await new Promise(function (r) { setTimeout(r, 2500); });
      if (sendErr && (sendErr.code === 4001 || /reject|denied|cancel/i.test(sendErr.message || ''))) throw sendErr;
      if (txHash) {
        const rc = await fetch(RONIN_RPC, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
        }).then(r => r.json()).then(r => r.result).catch(() => null);
        if (rc) {
          if (rc.status === '0x1') return { txHash };
          throw new Error('Play fee TX reverted');
        }
      }
    }
    throw new Error('Play fee not confirmed — try again');
  }

  // ── KATANA DEX: RON ↔ RONKE swap (onboarding + DEX activity → PoD) ──────
  // Tiesiai per Katana V2 router (gilus WRON/RONKE pool). Žaidėjas pats moka gas.
  const KATANA_ROUTER = '0x7D0556D55ca1a92708681e2E231733EBd922597D';
  const WRON_TOKEN    = '0xe514d9deb7966c8be0ca922de8a064264ea6bcd4';
  const _MAX_UINT256  = (2n ** 256n) - 1n;
  const _ROUTER_ABI = [
    { type:'function', name:'getAmountsOut', stateMutability:'view', inputs:[{name:'amountIn',type:'uint256'},{name:'path',type:'address[]'}], outputs:[{name:'amounts',type:'uint256[]'}] },
    { type:'function', name:'swapExactRONForTokens', stateMutability:'payable', inputs:[{name:'amountOutMin',type:'uint256'},{name:'path',type:'address[]'},{name:'to',type:'address'},{name:'deadline',type:'uint256'}], outputs:[{name:'amounts',type:'uint256[]'}] },
    { type:'function', name:'swapExactTokensForRON', stateMutability:'nonpayable', inputs:[{name:'amountIn',type:'uint256'},{name:'amountOutMin',type:'uint256'},{name:'path',type:'address[]'},{name:'to',type:'address'},{name:'deadline',type:'uint256'}], outputs:[{name:'amounts',type:'uint256[]'}] },
  ];
  const _ERC20_APPROVE_ABI = [{ type:'function', name:'approve', stateMutability:'nonpayable', inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}], outputs:[{type:'bool'}] }];
  // PewPewSwap wrapper (PoD #68) — swap TX'ai eina per MŪSŲ kontraktą (ne tiesiai į Katana router),
  // kad: (1) Ronin Wallet neperimtų jų kaip native swap (dropped TX), (2) gas/users skaičiuotųsi PewPew.
  const PEWPEW_SWAP = '0x85591888aACEEB63dfadD7Ffa6d1aB562480B847';
  const _PEWPEW_SWAP_ABI = [
    { type:'function', name:'swapRonForRonke', stateMutability:'payable', inputs:[{name:'amountOutMin',type:'uint256'},{name:'deadline',type:'uint256'}], outputs:[{type:'uint256'}] },
    { type:'function', name:'swapRonkeForRon', stateMutability:'nonpayable', inputs:[{name:'amountIn',type:'uint256'},{name:'amountOutMin',type:'uint256'},{name:'deadline',type:'uint256'}], outputs:[{type:'uint256'}] },
  ];

  async function _ensureRoninNet(prov) {
    try {
      const cur = await prov.request({ method:'eth_chainId' });
      if (Number(BigInt(cur)) !== RONIN_CHAIN_ID_DEC) {
        try { await prov.request({ method:'wallet_switchEthereumChain', params:[{ chainId: RONIN_CHAIN_ID_HEX }] }); }
        catch (se) {
          if (se && (se.code===4902 || /not added|unrecognized/i.test(String(se.message||'')))) {
            await prov.request({ method:'wallet_addEthereumChain', params:[{ chainId: RONIN_CHAIN_ID_HEX, chainName:'Ronin Mainnet', nativeCurrency:{name:'RON',symbol:'RON',decimals:18}, rpcUrls:[RONIN_RPC], blockExplorerUrls:['https://app.roninchain.com'] }] });
          } else throw new Error('Wrong network — switch to Ronin Mainnet (2020) and retry.');
        }
        const nc = await prov.request({ method:'eth_chainId' });
        if (Number(BigInt(nc)) !== RONIN_CHAIN_ID_DEC) throw new Error('Network switch declined.');
      }
    } catch (e) {
      if (e && e.message && /Wrong network|Network switch/.test(e.message)) throw e;
      console.warn('[swap] chainId check failed, continuing:', e);
    }
  }

  async function _rpcRaw(method, params) {
    return await fetch(RONIN_RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ jsonrpc:'2.0', id:1, method, params }) }).then(function(x){ return x.json(); });
  }

  async function _sendAndConfirm(prov, txParams, label, onSent) {
    // ── PRE-FLIGHT (public RPC): tikras revert reason + explicit gas. Apeina Ronin Wallet'o
    //    "Internal JSON-RPC error" (jo vidinis gas-estimate / native-swap handleris lūžta). ──
    const callObj = { from: txParams.from, to: txParams.to, data: txParams.data };
    if (txParams.value) callObj.value = txParams.value;
    try {
      const cr = await _rpcRaw('eth_call', [callObj, 'latest']);
      if (cr && cr.error) {
        const m = String((cr.error && (cr.error.message || (cr.error.data && cr.error.data.message) || cr.error.data)) || 'reverted');
        throw new Error((label||'TX')+' would fail: ' + m.slice(0, 90));
      }
    } catch (e) { if (e && /would fail/.test(e.message||'')) throw e; /* tinklo glitch → tęsiam */ }
    try {
      const gr = await _rpcRaw('eth_estimateGas', [callObj]);
      if (gr && gr.result) txParams.gas = '0x' + (BigInt(gr.result) * 13n / 10n).toString(16);   // +30% buferis
    } catch (_) { /* jei nepavyko — wallet'as estimate'ins pats */ }

    let txHash = null, sendErr = null, _notified = false;
    prov.request({ method:'eth_sendTransaction', params:[txParams] })
      .then(function(h){ txHash = h; }).catch(function(e){ sendErr = e; });
    const deadline = Date.now() + 180000;   // Ronin gali lėtai patvirtinti — 3 min
    while (Date.now() < deadline) {
      await new Promise(function(r){ setTimeout(r, 2500); });
      if (txHash && !_notified) { _notified = true; try { if (onSent) onSent(txHash); } catch (_) {} }
      if (sendErr) {
        if (sendErr.code===4001 || /reject|denied|cancel/i.test(sendErr.message||'')) throw sendErr;
        throw new Error((label||'TX')+' failed: '+String(sendErr.message||sendErr).slice(0,80));
      }
      if (txHash) {
        const rc = await fetch(RONIN_RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_getTransactionReceipt', params:[txHash] }) }).then(r=>r.json()).then(r=>r.result).catch(()=>null);
        if (rc) { if (rc.status==='0x1') return { txHash }; throw new Error((label||'TX')+' reverted'); }
      }
    }
    if (txHash) return { txHash, pending: true };   // pateikta, bet receipt'as dar nespėjo — NE klaida
    throw new Error((label||'TX')+' not confirmed — try again');
  }

  async function _swapQuoteWei(direction, amountInWei) {
    if (!amountInWei || amountInWei <= 0n) return 0n;
    if (!_viemModule) _viemModule = await import(/* @vite-ignore */ VIEM_CDN);
    const { encodeFunctionData, decodeFunctionResult } = _viemModule;
    const path = direction === 'ronke2ron' ? [RONKE_TOKEN, WRON_TOKEN] : [WRON_TOKEN, RONKE_TOKEN];
    const data = encodeFunctionData({ abi:_ROUTER_ABI, functionName:'getAmountsOut', args:[amountInWei, path] });
    const res = await rpcCall(KATANA_ROUTER, data);
    const amounts = decodeFunctionResult({ abi:_ROUTER_ABI, functionName:'getAmountsOut', data: res });
    return amounts[amounts.length-1];
  }

  // Public quote (human decimals). direction: 'ron2ronke' | 'ronke2ron'
  async function swapQuote(direction, amountInDec) {
    const n = Number(amountInDec);
    if (!isFinite(n) || n <= 0) return 0;
    if (!_viemModule) _viemModule = await import(/* @vite-ignore */ VIEM_CDN);
    const { parseEther, formatEther } = _viemModule;
    const outWei = await _swapQuoteWei(direction, parseEther(String(amountInDec)));
    return Number(formatEther(outWei));
  }

  function _slipBps(pct) { return BigInt(Math.round(Math.max(0.1, Math.min(50, Number(pct)||2)) * 100)); }

  async function swapRonToRonke(ronDec, slippagePct, onSent) {
    if (!state.connected) throw new Error('Wallet not connected');
    const prov = state.provider || (await getAnyProvider());
    if (!prov) throw new Error('No wallet provider');
    await _ensureRoninNet(prov);
    if (!_viemModule) _viemModule = await import(/* @vite-ignore */ VIEM_CDN);
    const { encodeFunctionData, parseEther } = _viemModule;
    const amountIn = parseEther(String(ronDec));
    const outWei = await _swapQuoteWei('ron2ronke', amountIn);
    if (outWei <= 0n) throw new Error('No liquidity / bad amount');
    const minOut = outWei * (10000n - _slipBps(slippagePct)) / 10000n;
    const deadline = BigInt(Math.floor(Date.now()/1000) + 1200);
    const data = encodeFunctionData({ abi:_PEWPEW_SWAP_ABI, functionName:'swapRonForRonke', args:[minOut, deadline] });
    const r = await _sendAndConfirm(prov, { from: state.address, to: PEWPEW_SWAP, data, value: '0x'+amountIn.toString(16) }, 'Swap', onSent);
    try { refreshBalance(); } catch(_){}
    return r;
  }

  async function _erc20Allowance(owner, spender) {
    // allowance(owner,spender) = 0xdd62ed3e
    const data = '0xdd62ed3e' + pad32(strip0x(owner)) + pad32(strip0x(spender));
    return hexToBigInt(await rpcCall(RONKE_TOKEN, data));
  }

  async function swapRonkeToRon(ronkeDec, slippagePct, onSent) {
    if (!state.connected) throw new Error('Wallet not connected');
    const prov = state.provider || (await getAnyProvider());
    if (!prov) throw new Error('No wallet provider');
    await _ensureRoninNet(prov);
    if (!_viemModule) _viemModule = await import(/* @vite-ignore */ VIEM_CDN);
    const { encodeFunctionData, parseEther } = _viemModule;
    const amountIn = parseEther(String(ronkeDec));
    const allowance = await _erc20Allowance(state.address, PEWPEW_SWAP);
    if (allowance < amountIn) {
      const approveData = encodeFunctionData({ abi:_ERC20_APPROVE_ABI, functionName:'approve', args:[PEWPEW_SWAP, _MAX_UINT256] });
      await _sendAndConfirm(prov, { from: state.address, to: RONKE_TOKEN, data: approveData }, 'Approve');
    }
    const outWei = await _swapQuoteWei('ronke2ron', amountIn);
    if (outWei <= 0n) throw new Error('No liquidity / bad amount');
    const minOut = outWei * (10000n - _slipBps(slippagePct)) / 10000n;
    const deadline = BigInt(Math.floor(Date.now()/1000) + 1200);
    const data = encodeFunctionData({ abi:_PEWPEW_SWAP_ABI, functionName:'swapRonkeForRon', args:[amountIn, minOut, deadline] });
    const r = await _sendAndConfirm(prov, { from: state.address, to: PEWPEW_SWAP, data }, 'Swap', onSent);
    try { refreshBalance(); } catch(_){}
    return r;
  }

  async function getRonBalance(addr) {
    const a = addr || state.address;
    if (!a) return 0;
    const res = await fetch(RONIN_RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_getBalance', params:[a, 'latest'] }) }).then(r=>r.json()).then(r=>r.result).catch(()=>null);
    return res ? Number(hexToBigInt(res)) / 1e18 : 0;
  }

  // RONKE NFT count helper (display / wallet badge only — spoofable client-side).
  // For bonus gating use getNftHoldStatus() which queries server-side.
  function getRonkeNFTCount() {
    if (!state.connected) return 0;
    if (!Array.isArray(state.nfts)) return 0;
    return state.nfts.length;
  }

  // ── Server-verified NFT hold status (for bonus gating) ──────────────
  // Calls Supabase edge function nft-hold-status which queries Ronin RPC
  // directly. Returns { totalCount, eligibleCount, oldestHoldSeconds, asOf }.
  // Frontend cache: 5 min, on top of edge function's 10 min cache.
  let _nftHoldCache = null;   // { data, fetchedAt }
  let _nftHoldFetching = null;
  const _NFT_HOLD_FRONTEND_TTL_MS = 5 * 60 * 1000;

  async function getNftHoldStatus(opts) {
    const force = !!(opts && opts.force);
    const addr = state.address;
    if (!state.connected || !addr) {
      return { totalCount: 0, eligibleCount: 0, oldestHoldSeconds: 0, asOf: 0, ok: false };
    }
    const nowMs = Date.now();
    if (!force && _nftHoldCache && (nowMs - _nftHoldCache.fetchedAt) < _NFT_HOLD_FRONTEND_TTL_MS) {
      return _nftHoldCache.data;
    }
    if (_nftHoldFetching) return _nftHoldFetching;

    _nftHoldFetching = (async () => {
      try {
        if (!window.SupabaseSync || !window.SupabaseSync.invoke) {
          return { totalCount: 0, eligibleCount: 0, oldestHoldSeconds: 0, asOf: 0, ok: false, error: 'SupabaseSync not ready' };
        }
        const resp = await window.SupabaseSync.invoke('nft-hold-status', { wallet: addr.toLowerCase() });
        if (!resp || resp.ok === false) {
          return { totalCount: 0, eligibleCount: 0, oldestHoldSeconds: 0, asOf: 0, ok: false, error: (resp && resp.error) || 'invoke failed' };
        }
        const data = {
          ok: true,
          totalCount: Number(resp.totalCount) || 0,
          eligibleCount: Number(resp.eligibleCount) || 0,
          oldestHoldSeconds: Number(resp.oldestHoldSeconds) || 0,
          asOf: Number(resp.asOf) || 0,
          fromCache: !!resp.fromCache,
        };
        _nftHoldCache = { data, fetchedAt: nowMs };
        return data;
      } catch (e) {
        console.warn('[wallet] getNftHoldStatus failed', e);
        return { totalCount: 0, eligibleCount: 0, oldestHoldSeconds: 0, asOf: 0, ok: false, error: String(e) };
      } finally {
        _nftHoldFetching = null;
      }
    })();
    return _nftHoldFetching;
  }

  // Synchronous helper — returns cached eligible count or 0 if not yet fetched.
  // Use this in render/game-loop hot paths. Kick off getNftHoldStatus() once on
  // wallet connect to populate.
  function getEligibleNftCountCached() {
    return _nftHoldCache && _nftHoldCache.data ? _nftHoldCache.data.eligibleCount : 0;
  }
  function isHolderEligibleCached() {
    return getEligibleNftCountCached() >= 1;
  }

  // Clear cache on disconnect/address change (caller hooks via onChange).
  function _clearNftHoldCache() { _nftHoldCache = null; _nftHoldFetching = null; }

  // Public API
  // ── F12 NFT pre-battle signing — EIP-712 BurnAuth ─────────────
  // Naudojama kai user paspaudžia "START WITH NFT" — patvirtina kad sutinka
  // kad pasirinkti NFT'ai gali būti sudeginti jei mirs mūšyje.
  async function signBattleAuth(payload) {
    if (!state.connected) throw new Error('Wallet not connected');
    const prov = state.provider || (await getAnyProvider());
    if (!prov) throw new Error('No wallet provider');
    // CRITICAL: re-fetch active account directly from wallet (NE state.address)
    // — wallet'as gali turėti kelias paskyras, sign'ina su aktyvia (ignoruoja addr param).
    // Jei state.address skiriasi nuo aktyvaus → throw, kad start-battle/sign nesumaišytų adresų.
    let addr = state.address;
    try {
      const currentAccts = await prov.request({ method: 'eth_accounts' });
      const currentAddr = (currentAccts && currentAccts[0]) ? currentAccts[0] : null;
      if (!currentAddr) throw new Error('No active wallet account — reconnect wallet.');
      if (state.address && currentAddr.toLowerCase() !== state.address.toLowerCase()) {
        throw new Error(
          'Wallet has multiple accounts active. Currently signing as ' + currentAddr +
          ' but app registered ' + state.address + '. Switch wallet to ' + state.address +
          ' OR reconnect the app to use ' + currentAddr + '.'
        );
      }
      addr = currentAddr;
    } catch (e) {
      throw e;
    }
    if (!addr) throw new Error('No wallet address');
    // payload: { tokenIds: number[], battleId: string, deadline: number, nonce: string }
    // CRITICAL: owner adresas SVYRAVA tarp lowercase ir checksummed → mismatch hash'e.
    // Backend stored lowercase → frontend signs su lowercase kad sutaptų.
    const ownerLc = addr.toLowerCase();
    const domain = {
      name: 'PewPewBarracks',
      version: '1',
      chainId: 2020,
      verifyingContract: '0xccf604511c5d2b5c3fd61adfba3950d0d2890862',
    };
    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      BurnAuth: [
        { name: 'owner', type: 'address' },
        { name: 'tokenIds', type: 'uint256[]' },
        { name: 'battleId', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    };
    const message = {
      owner: ownerLc,
      tokenIds: payload.tokenIds.map(String),
      battleId: String(payload.battleId),
      deadline: String(payload.deadline),
      nonce: String(payload.nonce),
    };
    const typedData = JSON.stringify({
      domain, types, primaryType: 'BurnAuth', message,
    });
    console.log('[signBattleAuth] signing typedData:', typedData);
    console.log('[signBattleAuth] tokenIds passed to wallet:', message.tokenIds);
    console.log('[signBattleAuth] owner (lowercase):', ownerLc);
    console.log('[signBattleAuth] payload.tokenIds raw:', payload.tokenIds);
    const signature = await prov.request({
      method: 'eth_signTypedData_v4',
      params: [ownerLc, typedData],
    });
    console.log('[signBattleAuth] signature:', signature, 'signer addr (lowercase):', ownerLc);
    return { signature, message, owner: ownerLc };
  }

  // ── RONKE Faucet claim — EIP-712 RonkeClaimRequest (gasless auth, anti-griefing) ──
  // Įrodo kad piniginės savininkas inicijavo claim. Off-chain (server verifyTypedData),
  // tad domeno chainId = 2020 (kur yra žaidėjas) — kad wallet'as nepatrumtų pasirašyti.
  // Grąžina { signature, player, deadline, nonce }.
  async function signFaucetClaim() {
    if (!state.connected) throw new Error('Wallet not connected');
    const prov = state.provider || (await getAnyProvider());
    if (!prov) throw new Error('No wallet provider');
    const accts = await prov.request({ method: 'eth_accounts' });
    const cur = (accts && accts[0]) ? accts[0] : null;
    if (!cur) throw new Error('No active wallet account — reconnect wallet.');
    if (state.address && cur.toLowerCase() !== state.address.toLowerCase()) {
      throw new Error('Wallet account mismatch — switch to ' + state.address + ' or reconnect.');
    }
    const ownerLc = cur.toLowerCase();
    const deadline = Math.floor(Date.now() / 1000) + 600;       // 10 min
    const nonce = String(Date.now()) + String(Math.floor(Math.random() * 1e6));
    const domain = { name: 'RonkeFaucet', version: '1', chainId: 2020, verifyingContract: '0xc59e860e2115ccdab499f619a67bedf71ee26007' };
    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
      ],
      RonkeClaimRequest: [
        { name: 'player', type: 'address' },
        { name: 'deadline', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    };
    const message = { player: ownerLc, deadline: String(deadline), nonce: String(nonce) };
    const typedData = JSON.stringify({ domain, types, primaryType: 'RonkeClaimRequest', message });
    const signature = await prov.request({ method: 'eth_signTypedData_v4', params: [ownerLc, typedData] });
    return { signature, player: ownerLc, deadline, nonce };
  }

  // Re-check active wallet account NEPASIKLIAUJANT accountsChanged event'u
  // (kai kurie wallet'ai jo nesiunčia kai user switch'ina UI'je).
  // Grąžina { ok, currentAddress, registered, mismatch }.
  async function refreshActiveAccount() {
    try {
      const prov = state.provider || (await getAnyProvider());
      if (!prov) return { ok: false, error: 'No provider' };
      let accts = await prov.request({ method: 'eth_accounts' });
      let cur = accts && accts[0] ? accts[0] : null;
      if (!cur) {
        // Transient tuščias (extension flicker / heavy F12 rAF) — retry kartą prieš nuspręsiant.
        await new Promise((r) => setTimeout(r, 350));
        try { accts = await prov.request({ method: 'eth_accounts' }); cur = accts && accts[0] ? accts[0] : null; } catch (_) {}
      }
      if (!cur) {
        // Vis dar tuščia → SOFT (NEtrinam kredencialų, kad nereiktų vėl pasirašyt; auto-reconnect po unlock).
        if (state.connected) { state.connected = false; notify(); }
        return { ok: false, error: 'No active account (transient?)' };
      }
      // Jei buvom „soft-atjungti" ir grįžo tas pats account'as → re-connect be re-sign.
      if (!state.connected && state.address && cur.toLowerCase() === state.address.toLowerCase()) { state.connected = true; notify(); }
      const mismatch = state.address && cur.toLowerCase() !== state.address.toLowerCase();
      return { ok: true, currentAddress: cur, registered: state.address, mismatch };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  window.Wallet = {
    // identity
    connect, disconnect, restore,
    isInstalled, isConnected: () => state.connected,
    getAddress: () => state.address,
    refreshActiveAccount,
    shortAddress,
    profileKey,
    snapshot,
    onChange,
    // data
    refreshBalance, refreshNfts,
    getRonkeNFTCount,
    // NFT hold (server-verified, 24h gate)
    getNftHoldStatus, getEligibleNftCountCached, isHolderEligibleCached,
    claimTrophy,
    // F12 NFT pre-battle EIP-712 signing
    signBattleAuth,
    // RONKE Faucet claim EIP-712 signing
    signFaucetClaim,
    // RONKE Faucet on-chain claim (player pays gas → PoD)
    submitFaucetClaim,
    // F12 play fee — 5 RONKE → treasury (player pays gas → PoD)
    payToPlay,
    // Katana DEX swap RON ↔ RONKE (onboarding + DEX activity, player pays gas)
    swapQuote, swapRonToRonke, swapRonkeToRon, getRonBalance,
    // constants (for debugging)
    RONKE_TOKEN, RONKEVERSE_NFT, RONIN_CHAIN_ID_DEC, TROPHY_CONTRACT, KATANA_ROUTER, WRON_TOKEN,
  };

  // Clear NFT hold cache when wallet address changes / disconnects.
  onChange((s) => {
    if (!s.connected || !s.address) _clearNftHoldCache();
  });

  // Auto-prefetch hold status shortly after connect (non-blocking).
  onChange((s) => {
    if (s.connected && s.address && s.nfts !== null && !_nftHoldCache) {
      setTimeout(() => { getNftHoldStatus().catch(() => {}); }, 500);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
