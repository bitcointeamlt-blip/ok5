// phantom_ronin.js — Phantom (Solana) → deterministinis Ronin (EVM) embedded wallet (P3 pamatas).
//
// VIZIJA: Solana useris prisijungia su Phantom, pasirašo VIENĄ fiksuotą žinutę → iš to ed25519
// parašo (deterministinio) išvedam EVM privatų raktą → tas pats Phantom VISADA = tas pats Ronin
// adresas. Žaidimas naudoja tą raktą Ronin veiksmams → useris jaučiasi Solana, po nugaros = Ronin.
//
// SAUGUMAS: raktas TIK naršyklės atmintyje (niekada nesaugomas localStorage/serveryje, nepersiunčiamas).
// Non-custodial — atkuriamas iš Phantom parašo bet kada. Laiko tik žaidimo lėšas (RONKE + truputį RON).
//
// Šis modulis IZOLIUOTAS (window.PhantomRonin) — NEpaliečia wallet.js. Wiring į gameplay = sekantis žingsnis.
(function () {
  if (window.PhantomRonin) return;

  // Fiksuota žinutė — NEKEISTI (keitimas → kitas išvestas adresas → „prarasta" piniginė).
  var SIGN_MSG = 'PewPew · Ronin Wallet v1\n\nSign once to create your in-game Ronin wallet.\nGas-free, safe, and always recovered from your Phantom.';
  var RONIN_RPC = 'https://api.roninchain.com/rpc';
  var _addr = '', _account = null, _viem = null, _solPubkey = '', _provider = null, _privKey = '';

  function _phantom() {
    if (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana;
    if (window.solana && window.solana.isPhantom) return window.solana;
    return null;
  }
  function isAvailable() { return !!_phantom(); }

  async function _loadViem() {
    if (_viem) return _viem;
    var acc = await import('https://esm.sh/viem@2.21.55/accounts');
    var core = await import('https://esm.sh/viem@2.21.55');
    _viem = {
      privateKeyToAccount: acc.privateKeyToAccount, keccak256: core.keccak256, toHex: core.toHex,
      createWalletClient: core.createWalletClient, createPublicClient: core.createPublicClient,
      http: core.http, defineChain: core.defineChain,
    };
    return _viem;
  }

  // Phantom → derive Ronin (EVM) account. Grąžina Ronin adresą.
  async function connect() {
    var p = _phantom();
    if (!p) throw new Error('Phantom not found — install Phantom wallet');
    var res = await p.connect();
    _solPubkey = (res && res.publicKey ? res.publicKey.toString() : (p.publicKey ? p.publicKey.toString() : ''));
    // ed25519 parašas deterministinis → stabilus išvestas raktas
    var msgBytes = new TextEncoder().encode(SIGN_MSG);
    var signed = await p.signMessage(msgBytes, 'utf8');
    var sigBytes = signed && signed.signature ? signed.signature : signed;   // Uint8Array (64b)
    if (!sigBytes || !sigBytes.length) throw new Error('Phantom signature failed');
    var v = await _loadViem();
    var privKey = v.keccak256(v.toHex(sigBytes));   // 32B → galiojantis secp256k1 privkey
    _account = v.privateKeyToAccount(privKey);
    _privKey = privKey;                              // laikom (atmintyje) — kad useris galėtų eksportuoti į Ronin Wallet
    _addr = _account.address;
    return _addr;
  }

  function disconnect() { _addr = ''; _account = null; _solPubkey = ''; _provider = null; _privKey = ''; }

  // EIP-1193 provider SHIM — kad esamas wallet.js/gameplay kodas (state.provider.request(...)) veiktų
  // NEPAKEISTAS. Pasirašymas (TX/typed data) lokaliai per viem account; reads forward'inami į Ronin RPC.
  async function getProvider() {
    if (_provider) return _provider;
    if (!_account) throw new Error('Connect Phantom first');
    var v = await _loadViem();
    var ronin = v.defineChain({ id: 2020, name: 'Ronin', nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 }, rpcUrls: { default: { http: [RONIN_RPC] } } });
    var wc = v.createWalletClient({ account: _account, chain: ronin, transport: v.http() });
    async function rpc(method, params) {
      var r = await fetch(RONIN_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: method, params: params || [] }) });
      var j = await r.json(); if (j.error) throw new Error(j.error.message || 'RPC error'); return j.result;
    }
    _provider = {
      isPhantomRonin: true,
      request: async function (args) {
        var m = args.method, p = args.params || [];
        switch (m) {
          case 'eth_accounts':
          case 'eth_requestAccounts': return [_addr];
          case 'eth_chainId': return '0x7e4';      // 2020
          case 'net_version': return '2020';
          case 'eth_signTypedData_v4': {
            var td = typeof p[1] === 'string' ? JSON.parse(p[1]) : p[1];
            var types = Object.assign({}, td.types); delete types.EIP712Domain;   // viem prideda pati
            return await _account.signTypedData({ domain: td.domain, types: types, primaryType: td.primaryType, message: td.message });
          }
          case 'personal_sign': {
            var msg = p[0];
            return await _account.signMessage({ message: (typeof msg === 'string' && msg.indexOf('0x') === 0) ? { raw: msg } : msg });
          }
          case 'eth_sendTransaction': {
            var t = p[0] || {};
            return await wc.sendTransaction({
              to: t.to, data: t.data,
              value: t.value ? BigInt(t.value) : undefined,
              gas: t.gas ? BigInt(t.gas) : undefined,
            });
          }
          case 'wallet_switchEthereumChain':
          case 'wallet_addEthereumChain': return null;   // jau Ronin
          default: return await rpc(m, p);               // reads → Ronin RPC
        }
      },
      on: function () {}, removeListener: function () {},
    };
    return _provider;
  }

  window.PhantomRonin = {
    isAvailable: isAvailable,
    connect: connect,
    disconnect: disconnect,
    getProvider: getProvider,                        // EIP-1193 shim (state.provider'iui)
    getAddress: function () { return _addr; },
    getAccount: function () { return _account; },    // viem account — pasirašymui (TX/EIP-712)
    getSolPubkey: function () { return _solPubkey; },
    isConnected: function () { return !!_addr; },
    exportPrivateKey: function () { return _privKey; },   // jautru — TIK user-initiated eksportui (import į Ronin Wallet)
  };
})();
