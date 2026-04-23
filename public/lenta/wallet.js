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

  const LS = {
    ADDR: 'lenta_wallet_address',
    SIG:  'lenta_wallet_signature',
    MSG:  'lenta_wallet_message',
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

  function isInstalled() { return !!getRoninProvider(); }

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
  async function connect() {
    const prov = getRoninProvider();
    if (!prov) {
      const msg = 'Ronin Wallet not installed.\nDownload: https://wallet.roninchain.com';
      throw new Error(msg);
    }
    state.provider = prov;
    const accounts = await prov.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts.length) throw new Error('No accounts returned');
    const addr = accounts[0];

    let signature = null;
    try {
      signature = await prov.request({ method: 'personal_sign', params: [LOGIN_MSG, addr] });
    } catch (e) {
      throw new Error('Login signature rejected');
    }

    state.address = addr;
    state.connected = true;
    try {
      localStorage.setItem(LS.ADDR, addr);
      localStorage.setItem(LS.SIG, signature);
      localStorage.setItem(LS.MSG, LOGIN_MSG);
    } catch {}

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
    state.address = null;
    state.connected = false;
    state.chainId = null;
    state.ronkeBalance = null;
    state.nfts = null;
    try {
      localStorage.removeItem(LS.ADDR);
      localStorage.removeItem(LS.SIG);
      localStorage.removeItem(LS.MSG);
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

  async function restore() {
    const prov = getRoninProvider();
    if (!prov) return false;
    state.provider = prov;
    const saved = (function () { try { return localStorage.getItem(LS.ADDR); } catch { return null; } })();
    if (!saved) return false;
    try {
      const accounts = await prov.request({ method: 'eth_accounts' });
      const ok = accounts && accounts.map(a => a.toLowerCase()).includes(saved.toLowerCase());
      if (ok) {
        state.address = saved;
        state.connected = true;
        notify();
        try { if (typeof window.reloadProfileForWallet === 'function') window.reloadProfileForWallet(); } catch {}
        chainIdCheck().catch(() => {});
        refreshBalance().catch(() => {});
        refreshNfts().catch(() => {});
        return true;
      }
    } catch {}
    await disconnect();
    return false;
  }

  function setupAccountListener() {
    const prov = getRoninProvider();
    if (!prov || typeof prov.on !== 'function') return;
    try {
      prov.on('accountsChanged', (accounts) => {
        if (!accounts || accounts.length === 0) { disconnect(); return; }
        if (state.address && accounts[0].toLowerCase() !== state.address.toLowerCase()) {
          // Different account — treat as re-login (clear old, require new signature)
          disconnect();
        }
      });
      prov.on('chainChanged', () => { chainIdCheck(); });
      prov.on('disconnect', () => { disconnect(); });
    } catch (e) { console.warn('[wallet] listener setup failed:', e); }
  }

  function init() {
    setupAccountListener();
    restore().catch(() => {});
  }

  // Public API
  window.Wallet = {
    // identity
    connect, disconnect, restore,
    isInstalled, isConnected: () => state.connected,
    getAddress: () => state.address,
    shortAddress,
    profileKey,
    snapshot,
    onChange,
    // data
    refreshBalance, refreshNfts,
    // constants (for debugging)
    RONKE_TOKEN, RONKEVERSE_NFT, RONIN_CHAIN_ID_DEC,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
