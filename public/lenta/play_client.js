// play_client.js — žaidimo pusės klientas custodial play API'ui (RonkePong ir kt.).
//
// UX: „PLAY" mygtukas → pirmas kartas: register (1 click, jokio wallet/email!) →
// play. Kvota baigėsi + nėra RONKE → rodom deposit adresą (jo custodial piniginė).
// userId/token — localStorage (anoniminis acc; email recovery = ateities upgrade).
//
// Naudojimas žaidime:
//   const r = await PlayClient.play();
//   r.ok  → leidžiam žaisti (r.mode 'free'|'paid', r.tx — on-chain įrašas)
//   r.needDeposit → rodom r.depositTo + r.need RONKE (QR/copy) — jo asmeninė piniginė
// window.PlayClient (izoliuotas, index.html dar NEwirintas).
(function () {
  if (window.PlayClient) return;

  var API = window.PLAY_API_URL || '';   // pvz. 'https://<backend>/api' — nustatyt wiring'e
  var LS_ID = '_pewpew_play_uid', LS_TOK = '_pewpew_play_tok';

  function _get(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function _set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  async function _json(method, path, body) {
    var r = await fetch(API + path, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    var j = await r.json().catch(function () { return {}; });
    j._status = r.status;
    return j;
  }

  // 1-click acc (idempotent — jei jau turim localStorage, nieko nedaro)
  async function ensureAccount() {
    if (_get(LS_ID) && _get(LS_TOK)) return { userId: _get(LS_ID) };
    var j = await _json('POST', '/register');
    if (!j.userId) throw new Error(j.error || 'register failed');
    _set(LS_ID, j.userId); _set(LS_TOK, j.token);
    return j;
  }

  async function status() {
    await ensureAccount();
    return _json('GET', '/status?userId=' + _get(LS_ID) + '&token=' + _get(LS_TOK));
  }

  // Pagrindinis: bandom žaisti. Grąžina {ok, mode, tx} arba {needDeposit, depositTo, need}.
  async function play() {
    await ensureAccount();
    var j = await _json('POST', '/play', { userId: _get(LS_ID), token: _get(LS_TOK) });
    if (j._status === 200) return { ok: true, mode: j.mode, tx: j.tx, freeLeft: j.freeLeft };
    if (j._status === 402) return { ok: false, needDeposit: true, depositTo: j.depositTo, need: j.need, have: j.have };
    return { ok: false, error: j.error || ('HTTP ' + j._status) };
  }

  // ── RECOVERY / LINK — progresas niekada neprarandamas ─────────────────────
  // Pagrindinė piniginė = login raktas prie TO PATIES custodial acc (progresas lieka).
  function _provider() {
    var W = window.Wallet;
    if (W && W.getProvider) { try { return W.getProvider(); } catch (_) {} }
    return (window.ronin && window.ronin.provider) || window.ethereum || null;
  }

  async function _signWith(msg) {
    var p = _provider();
    if (!p) throw new Error('Connect your wallet first');
    var accs = await p.request({ method: 'eth_requestAccounts' });
    var addr = accs && accs[0];
    var sig = await p.request({ method: 'personal_sign', params: [msg, addr] });
    return { address: addr, signature: sig };
  }

  // Pririša prijungtą PAGRINDINĘ piniginę prie žaidimo acc (1 nemokamas parašas).
  async function linkWallet() {
    await ensureAccount();
    var ch = await _json('GET', '/challenge');
    var msg = 'PewPew: link this wallet to my game account ' + _get(LS_ID) + ' (nonce ' + ch.nonce + ')';
    var s = await _signWith(msg);
    return _json('POST', '/link-wallet', { userId: _get(LS_ID), token: _get(LS_TOK), address: s.address, signature: s.signature, nonce: ch.nonce });
  }

  // Naujas įrenginys: pagrindinės piniginės parašas → grąžina seną acc su progresu.
  async function recoverByWallet() {
    var ch = await _json('GET', '/challenge');
    var msg = 'PewPew: recover my game account (nonce ' + ch.nonce + ')';
    var s = await _signWith(msg);
    var j = await _json('POST', '/recover-wallet', { address: s.address, signature: s.signature, nonce: ch.nonce });
    if (j.userId) { _set(LS_ID, j.userId); _set(LS_TOK, j.token); }
    return j;
  }

  // Email link/recovery: žaidimas praleidžia userį per Supabase OTP (signInWithOtp)
  // ir paduoda jo Supabase access_token (JWT) — serveris patikrina PATVIRTINTĄ email.
  async function linkEmail(sbToken) {
    await ensureAccount();
    return _json('POST', '/link-email', { userId: _get(LS_ID), token: _get(LS_TOK), sbToken: sbToken });
  }
  async function recoverByEmail(sbToken) {
    var j = await _json('POST', '/recover-email', { sbToken: sbToken });
    if (j.userId) { _set(LS_ID, j.userId); _set(LS_TOK, j.token); }
    return j;
  }

  window.PlayClient = {
    ensureAccount: ensureAccount,
    status: status,
    play: play,
    hasAccount: function () { return !!(_get(LS_ID) && _get(LS_TOK)); },
    linkWallet: linkWallet,
    recoverByWallet: recoverByWallet,
    linkEmail: linkEmail,
    recoverByEmail: recoverByEmail,
  };
})();
