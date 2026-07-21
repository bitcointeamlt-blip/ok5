// embedded_wallet.js — „Instant Play" embedded Ronin (EVM) wallet.
//
// VIZIJA: žmogus be jokios Ronin piniginės (pvz. Abstract-only useris) paspaudžia „Instant Play"
// → naršyklėj SUGENERUOJAMAS Ronin (EVM) raktas → jis tampa žaidėjo Ronin play-wallet → žaidžia
// iškart. Finansuoja iš Abstract (ar bet kur) per bridge (Jumper/LI.FI → šis adresas). Eksportuoja bet kada.
//
// ⚠️ SAUGUMAS (TRADEOFF): skirtingai nuo Phantom (atkuriamas iš parašo), generuotas raktas NEatkuriamas →
//   PRIVALO būti saugomas, kad išgyventų reload. Laikom localStorage (`_EW_KEY`). Tai onboarding-grade
//   (kaip daugelis web-žaidimų embedded wallet'ų) — laiko TIK tiek, kiek useris įsimeta; eksportuojamas.
//   Bank-grade saugumui — Privy embedded wallet (upgrade ateičiai). Naudotojui: eksportuok / laikyk mažai.
//
// Izoliuotas (window.EmbeddedWallet) — ta pati EIP-1193 shim struktūra kaip phantom_ronin.js.
(function () {
  if (window.EmbeddedWallet) return;

  var _EW_KEY = '_pewpew_embedded_pk_v1';   // localStorage raktas (privkey hex)
  // ⛓️ RONIN RPC — fallback grandinė: drpc PIRMAS (patikimas), api.roninchain ATSARGINIS (flaky, bet oficialus).
  //   Onboarding embedded wallet PRIVALO patikimai pasiųsti pirmą raid-fee/withdraw TX — 1 flaky RPC = lūžęs onboarding.
  var RONIN_RPCS = ['https://ronin.drpc.org', 'https://api.roninchain.com/rpc'];
  var RONIN_RPC = RONIN_RPCS[0];   // chain default (žr. defineChain); provider bando VISUS iš eilės
  var _addr = '', _account = null, _viem = null, _provider = null, _privKey = '';

  async function _loadViem() {
    if (_viem) return _viem;
    var acc = await import('https://esm.sh/viem@2.21.55/accounts');
    var core = await import('https://esm.sh/viem@2.21.55');
    _viem = {
      privateKeyToAccount: acc.privateKeyToAccount, toHex: core.toHex,
      createWalletClient: core.createWalletClient, http: core.http, defineChain: core.defineChain, fallback: core.fallback,
    };
    return _viem;
  }

  // 32B atsitiktinis secp256k1 privkey (crypto.getRandomValues — CSPRNG). Bet koks 32B < curve order galioja
  //   (tikimybė pataikyti į netinkamą ≈ 2^-128, praktiškai niekada; validuojam per privateKeyToAccount try/catch).
  function _genKeyHex() {
    var b = new Uint8Array(32); (self.crypto || window.crypto).getRandomValues(b);
    var h = '0x'; for (var i = 0; i < b.length; i++) h += ('0' + b[i].toString(16)).slice(-2);
    return h;
  }

  function hasWallet() { try { return !!localStorage.getItem(_EW_KEY); } catch (_) { return false; } }

  // Sukuria (jei nėra) ARBA įkelia esamą embedded wallet. Grąžina Ronin adresą.
  async function connect() {
    var v = await _loadViem();
    var key = null;
    try { key = localStorage.getItem(_EW_KEY); } catch (_) {}
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
      // generuojam naują (kelios iteracijos jei pataikytume į netinkamą raktą — praktiškai 1)
      for (var t = 0; t < 5; t++) {
        var cand = _genKeyHex();
        try { _account = v.privateKeyToAccount(cand); key = cand; break; } catch (_) {}
      }
      if (!key) throw new Error('Key generation failed');
      try { localStorage.setItem(_EW_KEY, key); } catch (_) { throw new Error('Storage blocked — enable cookies/localStorage'); }
    } else {
      _account = v.privateKeyToAccount(key);
    }
    _privKey = key;
    _addr = _account.address;
    return _addr;
  }

  function disconnect() { _addr = ''; _account = null; _provider = null; _privKey = ''; }

  // ⚠️ TIK user-initiated + patvirtinus: pašalina raktą iš naršyklės (jei NEeksportuotas → NEBEatkursi wallet!).
  function forget() { try { localStorage.removeItem(_EW_KEY); } catch (_) {} disconnect(); }

  // EIP-1193 provider SHIM — identiškas phantom_ronin.js (bet kuris viem account veikia).
  async function getProvider() {
    if (_provider) return _provider;
    if (!_account) throw new Error('Create wallet first');
    var v = await _loadViem();
    var ronin = v.defineChain({ id: 2020, name: 'Ronin', nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 }, rpcUrls: { default: { http: RONIN_RPCS } } });
    // viem fallback transport — sendTransaction/fee-estimation automatiškai persijungia jei pirmas RPC krenta.
    var wc = v.createWalletClient({ account: _account, chain: ronin, transport: v.fallback(RONIN_RPCS.map(function (u) { return v.http(u); })) });
    // Raw read helper — bando kiekvieną RPC iš eilės, grąžina pirmą sėkmę (JSON-RPC klaida = mesti, netekstinė/tinklo = kitas).
    async function rpc(method, params) {
      var lastErr = null;
      for (var i = 0; i < RONIN_RPCS.length; i++) {
        var r;
        try {
          r = await fetch(RONIN_RPCS[i], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: method, params: params || [] }) });
        } catch (e) { lastErr = e; continue; }   // tinklo klaida → kitas RPC
        if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }   // 5xx/429 → kitas RPC
        var j = await r.json();
        if (j.error) throw new Error(j.error.message || 'RPC error');   // JSON-RPC klaida = deterministinė → NEbandom kito
        return j.result;
      }
      throw lastErr || new Error('RPC error');
    }
    _provider = {
      isEmbedded: true,
      request: async function (args) {
        var m = args.method, p = args.params || [];
        switch (m) {
          case 'eth_accounts':
          case 'eth_requestAccounts': return [_addr];
          case 'eth_chainId': return '0x7e4';      // 2020
          case 'net_version': return '2020';
          case 'eth_signTypedData_v4': {
            var td = typeof p[1] === 'string' ? JSON.parse(p[1]) : p[1];
            var types = Object.assign({}, td.types); delete types.EIP712Domain;
            return await _account.signTypedData({ domain: td.domain, types: types, primaryType: td.primaryType, message: td.message });
          }
          case 'personal_sign': {
            var msg = p[0];
            return await _account.signMessage({ message: (typeof msg === 'string' && msg.indexOf('0x') === 0) ? { raw: msg } : msg });
          }
          case 'eth_sendTransaction': {
            var t = p[0] || {};
            return await wc.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : undefined, gas: t.gas ? BigInt(t.gas) : undefined });
          }
          case 'wallet_switchEthereumChain':
          case 'wallet_addEthereumChain': return null;
          default: return await rpc(m, p);
        }
      },
      on: function () {}, removeListener: function () {},
    };
    return _provider;
  }

  window.EmbeddedWallet = {
    hasWallet: hasWallet,
    connect: connect,
    disconnect: disconnect,
    forget: forget,
    getProvider: getProvider,
    getAddress: function () { return _addr; },
    getAccount: function () { return _account; },
    isConnected: function () { return !!_addr; },
    exportPrivateKey: function () { return _privKey; },
  };
})();
