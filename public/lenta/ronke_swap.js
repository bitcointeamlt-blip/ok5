// ronke_swap.js — in-game RON ↔ RONKE swap popup (Katana DEX, player pays gas).
// window.openRonkeSwap() atidaro medieval/DEX-stiliaus popup. Naudoja Wallet.swapQuote /
// swapRonToRonke / swapRonkeToRon (žr. wallet.js). Onboarding: naujokas už RON perka RONKE.
(function () {
  if (window.openRonkeSwap) return;

  var C = { wood: '#6b4a2e', woodDark: '#4a3320', parch: '#f5e6c3', card: '#fff8e8', teal: '#4a9da6', tealD: '#3a7d85', red: '#e85d5d', gold: '#ffcf5c', ink: '#3a2a1a', sub: '#7a5a2a' };
  var SLIPPAGE = 2;            // %
  var GAS_RESERVE = 0.01;     // RON paliekam dujoms (RON→RONKE MAX)
  var TOK = {
    RON:   { sym: 'RON',   ico: 'assets_tiny/ronin_logo.png', dp: 4 },
    RONKE: { sym: 'RONKE', ico: 'assets_tiny/ronke_logo.png', dp: 2 },
  };
  var _root = null, _dir = 'ron2ronke', _busy = false;
  var _ronBal = 0, _ronkeBal = 0, _quoteTimer = null, _quoteSeq = 0, _lastOut = 0;

  function W() { return window.Wallet; }
  function _el(id) { return document.getElementById(id); }
  function _fmt(n, d) { if (!isFinite(n)) return '0'; var s = Number(n).toFixed(d == null ? 4 : d); return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s; }
  function _fromTok() { return _dir === 'ron2ronke' ? TOK.RON : TOK.RONKE; }
  function _toTok() { return _dir === 'ron2ronke' ? TOK.RONKE : TOK.RON; }
  function _fromBal() { return _dir === 'ron2ronke' ? _ronBal : _ronkeBal; }
  function _close() { if (_root) { _root.remove(); _root = null; } }

  function _tokenChip(side) {
    // side: 'from' | 'to'
    return '<span id="rsw-' + side + '-chip" style="display:inline-flex;align-items:center;gap:7px;background:' + C.wood + ';border:2px solid ' + C.woodDark + ';border-radius:20px;padding:5px 11px 5px 6px;">' +
      '<img id="rsw-' + side + '-ico" src="" alt="" style="width:24px;height:24px;image-rendering:pixelated;border-radius:50%;background:#0003;" onerror="this.style.display=\'none\'"/>' +
      '<span id="rsw-' + side + '-sym" style="color:' + C.gold + ';font-size:11px;"></span></span>';
  }

  function open() {
    if (_root) return;
    var w = W();
    _root = document.createElement('div');
    _root.id = 'ronke-swap-root';
    _root.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(18,11,5,0.82);' +
      'display:flex;align-items:center;justify-content:center;font-family:\'Press Start 2P\',monospace,sans-serif;padding:14px;';
    _root.addEventListener('pointerdown', function (e) { if (e.target === _root) _close(); });

    var card = document.createElement('div');
    card.style.cssText = 'position:relative;width:min(95vw,440px);max-height:94vh;overflow:auto;background:' + C.parch + ';' +
      'border:5px solid ' + C.woodDark + ';border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.6);color:' + C.ink + ';';
    card.innerHTML =
      '<div style="background:linear-gradient(180deg,#8a6240,' + C.wood + ');padding:15px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid ' + C.woodDark + ';">' +
        '<span style="color:' + C.gold + ';font-size:15px;letter-spacing:.5px;">⇄ SWAP</span>' +
        '<span id="rsw-x" style="color:#f5e6c3;cursor:pointer;font-size:17px;padding:2px 8px;">✕</span>' +
      '</div>' +
      '<div style="padding:20px 20px 22px;">' +

        // ── FROM card ──
        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:9px;color:' + C.sub + ';margin-bottom:7px;">' +
          '<span>You pay</span><span id="rsw-bal" style="cursor:pointer;">bal: …</span></div>' +
        '<div style="background:' + C.card + ';border:3px solid ' + C.woodDark + ';border-radius:12px;padding:13px;display:flex;align-items:center;gap:10px;">' +
          _tokenChip('from') +
          '<input id="rsw-amt" type="number" inputmode="decimal" min="0" step="any" placeholder="0.0" ' +
            'style="flex:1;min-width:0;width:100%;text-align:right;border:none;outline:none;background:transparent;font:inherit;font-size:18px;color:' + C.ink + ';" />' +
        '</div>' +
        '<div style="text-align:right;margin-top:6px;"><button id="rsw-max" style="font:inherit;font-size:9px;border:2px solid ' + C.woodDark + ';border-radius:6px;cursor:pointer;background:' + C.gold + ';color:' + C.ink + ';padding:4px 12px;">MAX</button></div>' +

        // ── flip ──
        '<div style="text-align:center;margin:6px 0;"><button id="rsw-flip" title="Flip direction" ' +
          'style="width:42px;height:42px;border-radius:50%;border:3px solid ' + C.woodDark + ';cursor:pointer;background:' + C.teal + ';color:#fff;font-size:18px;line-height:1;box-shadow:0 3px 0 ' + C.tealD + ';">⇅</button></div>' +

        // ── TO card ──
        '<div style="font-size:9px;color:' + C.sub + ';margin-bottom:7px;">You receive (estimated)</div>' +
        '<div style="background:#efe2c0;border:3px dashed ' + C.woodDark + ';border-radius:12px;padding:13px;display:flex;align-items:center;gap:10px;min-height:30px;">' +
          _tokenChip('to') +
          '<span id="rsw-out" style="flex:1;text-align:right;font-size:18px;color:' + C.ink + ';overflow:hidden;text-overflow:ellipsis;">—</span>' +
        '</div>' +

        // ── rate / min ──
        '<div style="background:#0000000d;border-radius:9px;padding:10px 12px;margin-top:14px;font-size:9px;color:' + C.sub + ';line-height:1.9;">' +
          '<div style="display:flex;justify-content:space-between;"><span>Rate</span><span id="rsw-rate" style="color:' + C.ink + ';">…</span></div>' +
          '<div style="display:flex;justify-content:space-between;"><span>Min received</span><span id="rsw-min" style="color:' + C.ink + ';">—</span></div>' +
          '<div style="display:flex;justify-content:space-between;"><span>Slippage</span><span style="color:' + C.ink + ';">' + SLIPPAGE + '%</span></div>' +
          '<div style="display:flex;justify-content:space-between;"><span>Network fee</span><span style="color:' + C.ink + ';">you pay gas (RON)</span></div>' +
        '</div>' +

        '<button id="rsw-go" style="width:100%;padding:15px;margin-top:16px;font:inherit;font-size:13px;border:3px solid ' + C.woodDark + ';border-radius:10px;cursor:pointer;background:' + C.teal + ';color:#fff;box-shadow:0 4px 0 ' + C.tealD + ';">SWAP</button>' +
        '<div id="rsw-msg" style="text-align:center;font-size:9px;margin-top:11px;min-height:12px;color:' + C.ink + ';line-height:1.5;"></div>' +
        '<div style="text-align:center;font-size:7px;color:' + C.sub + ';margin-top:8px;opacity:.8;">Powered by Katana DEX · RONKE/RON</div>' +

        // ── CROSS-CHAIN — bet kuris chain → RONKE (Jumper/LI.FI, viskas pre-set: 1 klik) ──
        '<div style="margin-top:16px;border-top:2px dashed ' + C.woodDark + '44;padding-top:14px;">' +
          '<div style="font-size:9px;color:' + C.sub + ';margin-bottom:9px;line-height:1.7;text-align:center;">🌉 Buy <b style="color:' + C.ink + ';">RONKE</b> from another chain<br><span style="opacity:.8;">one click — chain &amp; RONKE pre-set</span></div>' +
          '<div id="rsw-xc-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>' +
          '<div style="text-align:center;font-size:7px;color:' + C.sub + ';margin-top:7px;opacity:.85;line-height:1.5;">via Jumper (LI.FI) · also built into Ronin Wallet Swap tab</div>' +
          '<div style="text-align:center;margin-top:11px;">' +
            '<button id="rsw-cashout" style="font:inherit;font-size:8px;border:2px solid #9945FF;border-radius:8px;cursor:pointer;background:#2a1640;color:#e9d8ff;padding:8px 12px;">◎ Cash out to Solana →</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    _root.appendChild(card);
    document.body.appendChild(_root);

    _el('rsw-x').onclick = _close;
    _el('rsw-flip').onclick = _flip;
    _el('rsw-amt').addEventListener('input', _onAmt);
    _el('rsw-max').onclick = _onMax;
    _el('rsw-bal').onclick = _onMax;
    _el('rsw-go').onclick = _doSwap;
    (function () { var cb = _el('rsw-cashout'); if (cb) cb.onclick = function () { _close(); _openSolanaCashout(); }; })();
    // Cross-chain → RONKE per Jumper (LI.FI). Pre-set: fromChain, toChain=Ronin(2020), toToken=RONKE
    // (patvirtinta routable per LI.FI: SOL/ETH→RONKE), toAddress=žaidėjo Ronin adresas. Data-driven grid + chain logo.
    (function _buildXChain() {
      var grid = _el('rsw-xc-grid'); if (!grid) return;
      var RONKE = '0xf988f63bf26C3Ed3fBf39922149E3E7b1e5c27cB';
      var L = 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/';
      var chains = [
        { id: '1151111081099710', nm: 'Solana',   logo: L + 'solana.svg',   col: '#9945FF', native: true },   // native in-game (Phantom+LI.FI)
        { id: '1',                nm: 'Ethereum', logo: L + 'ethereum.svg', col: '#627eea' },
        { id: '8453',             nm: 'Base',     logo: L + 'base.svg',     col: '#0052ff' },
        { id: '56',               nm: 'BNB',      logo: L + 'bsc.svg',      col: '#f0b90b' },
      ];
      var addr = ''; try { var w3 = W(); addr = (w3 && w3.getAddress && w3.getAddress()) || ''; } catch (_) {}
      chains.forEach(function (ch) {
        var b = document.createElement('button');
        b.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 5px;font:inherit;font-size:9px;border:3px solid ' + C.woodDark + ';border-left:5px solid ' + ch.col + ';border-radius:10px;cursor:pointer;background:' + C.card + ';color:' + C.ink + ';box-shadow:0 3px 0 ' + C.woodDark + '55;';
        var _lbl = ch.native ? (ch.nm + ' <b style="color:#9945FF;">→ PLAY</b>') : (ch.nm + ' <b style="color:' + C.tealD + ';">→RONKE</b>');
        b.innerHTML = '<img src="' + ch.logo + '" alt="" style="width:18px;height:18px;border-radius:50%;flex:none;" onerror="this.style.display=\'none\'"/><span>' + _lbl + '</span>';
        b.onclick = function () {
          if (ch.native) { _close(); _openSolanaOnboard(); return; }   // SOLANA → onboarding (RON pirma, tada RONKE)
          var url = 'https://jumper.exchange/?fromChain=' + ch.id + '&toChain=2020&toToken=' + RONKE + (addr ? '&toAddress=' + addr : '');
          try { window.open(url, '_blank', 'noopener'); } catch (_) { try { location.href = url; } catch (e) {} }
        };
        grid.appendChild(b);
      });
    })();

    if (!w || !w.isConnected || !w.isConnected()) {
      _msg('Connect your wallet to swap', C.red);
      var go = _el('rsw-go'); go.textContent = 'CONNECT WALLET';
      go.onclick = function () { try { w && w.connect && w.connect(); } catch (_) {} _close(); };
    }
    _applyDir();
    _loadBalances();
    _refreshRate();
  }

  function _applyDir() {
    var f = _fromTok(), t = _toTok();
    _el('rsw-from-ico').src = f.ico; _el('rsw-from-sym').textContent = f.sym;
    _el('rsw-to-ico').src = t.ico;   _el('rsw-to-sym').textContent = t.sym;
    _el('rsw-amt').value = '';
    _el('rsw-out').textContent = '—';
    _el('rsw-min').textContent = '—';
    _updateBalLine();
    _msg('', C.ink);
  }

  function _flip() {
    _dir = _dir === 'ron2ronke' ? 'ronke2ron' : 'ron2ronke';
    _applyDir();
    _refreshRate();
  }

  function _loadBalances() {
    var w = W(); if (!w || !w.isConnected || !w.isConnected()) return;
    try { var snap = w.snapshot ? w.snapshot() : null; _ronkeBal = (snap && typeof snap.ronkeBalance === 'number') ? snap.ronkeBalance : 0; } catch (_) {}
    _updateBalLine();
    if (w.getRonBalance) w.getRonBalance().then(function (b) { _ronBal = b || 0; _updateBalLine(); }).catch(function () {});
    if (w.refreshBalance) { try { w.refreshBalance(); } catch (_) {} setTimeout(function () {
      try { var s = w.snapshot ? w.snapshot() : null; if (s && typeof s.ronkeBalance === 'number') { _ronkeBal = s.ronkeBalance; _updateBalLine(); } } catch (_) {}
    }, 1200); }
  }

  function _updateBalLine() {
    var el = _el('rsw-bal'); if (!el) return;
    var f = _fromTok();
    el.textContent = 'bal: ' + _fmt(_fromBal(), f.dp) + ' ' + f.sym;
  }

  function _refreshRate() {
    var w = W(); var el = _el('rsw-rate'); if (!w || !w.swapQuote || !el) return;
    el.textContent = '…';
    w.swapQuote(_dir, 1).then(function (q) {
      if (!_el('rsw-rate')) return;
      _el('rsw-rate').textContent = '1 ' + _fromTok().sym + ' ≈ ' + _fmt(q, _toTok().dp) + ' ' + _toTok().sym;
    }).catch(function () { if (_el('rsw-rate')) _el('rsw-rate').textContent = 'n/a'; });
  }

  function _onMax() {
    var v = _dir === 'ron2ronke' ? Math.max(0, _ronBal - GAS_RESERVE) : _ronkeBal;
    _el('rsw-amt').value = _fmt(v, _fromTok().dp);
    _onAmt();
  }

  function _onAmt() {
    var raw = parseFloat(_el('rsw-amt').value);
    var out = _el('rsw-out'), minEl = _el('rsw-min');
    if (!isFinite(raw) || raw <= 0) { out.textContent = '—'; if (minEl) minEl.textContent = '—'; return; }
    out.textContent = '…';
    var seq = ++_quoteSeq;
    clearTimeout(_quoteTimer);
    _quoteTimer = setTimeout(function () {
      var w = W(); if (!w || !w.swapQuote) { out.textContent = '—'; return; }
      w.swapQuote(_dir, raw).then(function (q) {
        if (seq !== _quoteSeq) return;
        _lastOut = q;
        var dp = _toTok().dp;
        out.textContent = _fmt(q, dp) + ' ' + _toTok().sym;
        if (minEl) minEl.textContent = _fmt(q * (1 - SLIPPAGE / 100), dp) + ' ' + _toTok().sym;
      }).catch(function () { if (seq === _quoteSeq) { out.textContent = 'quote failed'; } });
    }, 320);
  }

  function _msg(t, col) { var el = _el('rsw-msg'); if (el) { el.textContent = t || ''; el.style.color = col || C.ink; } }

  function _doSwap() {
    if (_busy) return;
    var w = W();
    if (!w || !w.isConnected || !w.isConnected()) { _msg('Connect wallet first', C.red); return; }
    var amt = parseFloat(_el('rsw-amt').value);
    if (!isFinite(amt) || amt <= 0) { _msg('Enter an amount', C.red); return; }
    if (amt > _fromBal()) { _msg('Not enough ' + _fromTok().sym, C.red); return; }
    _busy = true;
    var go = _el('rsw-go'); go.disabled = true; go.style.opacity = '.6';
    _msg('Confirm in your wallet…', C.ink);
    var fromSym = _fromTok().sym, toSym = _toTok().sym, outEst = _lastOut;   // užfiksuojam popup'ui
    var _onSent = function () { _msg('⏳ Submitted — confirming on-chain…', C.ink); };
    var p = _dir === 'ron2ronke' ? w.swapRonToRonke(amt, SLIPPAGE, _onSent) : w.swapRonkeToRon(amt, SLIPPAGE, _onSent);
    p.then(function (res) {
      _loadBalances();
      _showSuccessPopup(amt, fromSym, outEst, toSym, res && res.txHash, !!(res && res.pending));
    }).catch(function (e) {
      var m = String((e && (e.shortMessage || e.message)) || e);
      var s = /reject|denied|cancel|4001/i.test(m) ? 'Cancelled'
        : (/network|chain/i.test(m) ? 'Wrong network — switch to Ronin'
        : (/not enough|insufficient|balance/i.test(m) ? 'Not enough balance'
        : (/liquidity/i.test(m) ? 'No liquidity for that size' : (m.slice(0, 44) || 'Swap failed'))));
      _msg('⚠ ' + s, C.red);
    }).then(function () {
      _busy = false; var g = _el('rsw-go'); if (g) { g.disabled = false; g.style.opacity = '1'; }
    });
  }

  // ─── Gražus success popup po swap'o ───
  function _showSuccessPopup(fromAmt, fromSym, toAmt, toSym, txHash, pending) {
    var fIco = (TOK[fromSym] && TOK[fromSym].ico) || '';
    var tIco = (TOK[toSym] && TOK[toSym].ico) || '';
    var ov = document.createElement('div');
    ov.id = 'rsw-success';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(18,11,5,0.86);' +
      'display:flex;align-items:center;justify-content:center;font-family:\'Press Start 2P\',monospace,sans-serif;padding:14px;';
    var card = document.createElement('div');
    card.style.cssText = 'position:relative;width:min(94vw,400px);background:' + C.parch + ';border:5px solid ' + C.woodDark + ';' +
      'border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.6);color:' + C.ink + ';overflow:hidden;animation:rswPop .25s ease-out;';
    var coin = function (ico, sym) { return ico ? '<img src="' + ico + '" style="width:30px;height:30px;image-rendering:pixelated;border-radius:50%;vertical-align:middle;" onerror="this.style.display=\'none\'"/>' : '<span>' + sym + '</span>'; };
    card.innerHTML =
      '<div style="background:linear-gradient(180deg,#5fae6a,#3f8a4e);padding:18px 16px;text-align:center;border-bottom:4px solid ' + C.woodDark + ';">' +
        '<div style="font-size:30px;line-height:1;margin-bottom:8px;">✅</div>' +
        '<div style="color:#fff;font-size:14px;letter-spacing:.5px;">' + (pending ? 'SWAP SUBMITTED' : 'SWAP SUCCESSFUL') + '</div>' +
      '</div>' +
      '<div style="padding:20px 18px 22px;text-align:center;">' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;font-size:13px;margin-bottom:8px;">' +
          '<span style="white-space:nowrap;">' + coin(fIco, fromSym) + ' ' + _fmt(fromAmt, fromSym === 'RON' ? 4 : 2) + ' ' + fromSym + '</span>' +
          '<span style="color:' + C.teal + ';font-size:18px;">→</span>' +
          '<span style="white-space:nowrap;color:#2e7d32;">' + coin(tIco, toSym) + ' ' + (toAmt > 0 ? '≈ ' + _fmt(toAmt, toSym === 'RON' ? 5 : 2) : '') + ' ' + toSym + '</span>' +
        '</div>' +
        '<div style="font-size:9px;color:' + C.sub + ';line-height:1.8;margin:10px 0 4px;">' +
          (pending ? 'Submitted on-chain — confirming. Your ' + toSym + ' will arrive shortly.' : toSym + ' is now in your wallet — check your balance! 🎉') +
        '</div>' +
        (txHash ? '<a href="https://app.roninchain.com/tx/' + txHash + '" target="_blank" rel="noopener" style="display:inline-block;font-size:8px;color:' + C.teal + ';text-decoration:underline;margin:6px 0 14px;">View transaction ↗</a>' : '<div style="height:14px;"></div>') +
        '<button id="rsw-suc-ok" style="width:100%;padding:13px;font:inherit;font-size:12px;border:3px solid ' + C.woodDark + ';border-radius:10px;cursor:pointer;background:' + C.teal + ';color:#fff;box-shadow:0 4px 0 ' + C.tealD + ';">DONE</button>' +
      '</div>';
    ov.appendChild(card);
    if (!document.getElementById('rsw-anim-style')) {
      var st = document.createElement('style'); st.id = 'rsw-anim-style';
      st.textContent = '@keyframes rswPop{0%{transform:scale(.85);opacity:0}100%{transform:scale(1);opacity:1}}';
      document.head.appendChild(st);
    }
    document.body.appendChild(ov);
    var done = function () { ov.remove(); _close(); };
    document.getElementById('rsw-suc-ok').onclick = done;
    ov.addEventListener('pointerdown', function (e) { if (e.target === ov) done(); });
  }

  // ════════════════ SOLANA → RONKE (cross-chain, LI.FI Relay, native in-game) ════════════════
  var _SOL_NATIVE = '11111111111111111111111111111111';   // LI.FI native SOL
  var _RONKE_ADDR2 = '0xf988f63bf26C3Ed3fBf39922149E3E7b1e5c27cB';
  var _RON_NATIVE = '0x0000000000000000000000000000000000000000';   // LI.FI native RON (Ronin)
  var _SOL_CHAIN = '1151111081099710';
  var _RON_MIN_TRAIN = 11;    // kontrakto anti-bot taisyklė: treniruotei pinigine turi turėti ≥11 RON
  var _RON_STARTER = 15;      // rekomenduojamas „starter" balansas (11 min + buffer TX'ams ilgam)
  var _RON_BUF = 1.05;        // 5% atsarga slippage'ui — kad realiai atkeliautų ≥ _RON_STARTER
  var _solPubkey = '', _solRoot = null, _solBusy = false, _solQuote = null, _solQTimer = 0, _solWeb3 = null, _solQSeq = 0;
  var _obRoot = null, _obBusy = false, _obAutoShown = false, _obChecking = false;
  var _coRoot = null, _coBusy = false, _coTimer = 0, _coSeq = 0;
  var _CO_GAS = 0.1;    // RON paliekam piniginėj (gas atsarga) — kad cash-out NEišsemtų RON ir liktų
                        // dujom būsimiems NFT/token/item perkėlimams (kitaip: nusiima viską → nebegali nieko siųsti)

  function _phantom() {
    if (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana;
    if (window.solana && window.solana.isPhantom) return window.solana;
    return null;
  }
  function _roninAddr() { try { var w = W(); return (w && w.getAddress && w.getAddress()) || ''; } catch (_) { return ''; } }
  // Onboarding gas: po RONKE gavimo „įpilam" mažą RON naujam wallet'ui (fire-and-forget; serveris
  // gate'ina 1×/wallet + tik jei žemas RON + RONKE funded). Kad galėtų žaisti be savo RON.
  function _gasDrip(roninAddr) {
    if (!roninAddr) return;
    try { fetch('https://rbkivemouxwcgrpzazxb.supabase.co/functions/v1/gas-drip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: roninAddr }) }).catch(function () {}); } catch (_) {}
  }
  async function _solConnect() {
    var p = _phantom(); if (!p) throw new Error('Phantom not found — install Phantom');
    var res = await p.connect();
    _solPubkey = res && res.publicKey ? res.publicKey.toString() : (p.publicKey ? p.publicKey.toString() : '');
    return _solPubkey;
  }
  async function _solFetchQuote(sol, toAddr, toToken) {
    var lamports = Math.floor(sol * 1e9);
    var tt = toToken || _RONKE_ADDR2;   // default RONKE; native RON onboarding'ui
    var u = 'https://li.quest/v1/quote?fromChain=' + _SOL_CHAIN + '&toChain=2020&fromToken=' + _SOL_NATIVE + '&toToken=' + tt + '&fromAmount=' + lamports + '&fromAddress=' + _solPubkey + '&toAddress=' + toAddr + '&integrator=pewpew';
    var r = await fetch(u); if (!r.ok) throw new Error('No route for this amount'); return r.json();
  }
  async function _solExec(quote, onStatus) {
    var p = _phantom(); if (!p) throw new Error('Phantom not found');
    if (!_solWeb3) { onStatus && onStatus('Loading…'); _solWeb3 = await import('https://esm.sh/@solana/web3.js@1.95.8'); }
    var data = quote.transactionRequest && quote.transactionRequest.data;
    if (!data) throw new Error('No transaction in route');
    var bytes = Uint8Array.from(atob(data), function (c) { return c.charCodeAt(0); });
    var tx; try { tx = _solWeb3.VersionedTransaction.deserialize(bytes); } catch (_) { tx = _solWeb3.Transaction.from(bytes); }
    onStatus && onStatus('Confirm in Phantom…');
    var sig = await p.signAndSendTransaction(tx);
    var txSig = sig && sig.signature ? sig.signature : sig;
    onStatus && onStatus('Bridging to Ronin…');
    for (var i = 0; i < 40; i++) {
      await new Promise(function (r) { setTimeout(r, 3000); });
      try {
        var st = await (await fetch('https://li.quest/v1/status?txHash=' + txSig + '&fromChain=' + _SOL_CHAIN + '&toChain=2020')).json();
        if (st.status === 'DONE') return st;
        if (st.status === 'FAILED') throw new Error('Bridge failed — try again');
      } catch (e) { if (/failed/i.test(String(e.message))) throw e; }
    }
    return null;   // timeout — gali vis tiek atkeliauti
  }
  function _solMsg(t, c) { var e = document.getElementById('sol-msg'); if (e) { e.textContent = t || ''; e.style.color = c || C.ink; } }
  function _openSolanaSwap() {
    if (_solRoot) return;
    _solRoot = document.createElement('div');
    _solRoot.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(18,11,5,.85);display:flex;align-items:center;justify-content:center;font-family:\'Press Start 2P\',monospace,sans-serif;padding:14px;';
    var solClose = function () { if (_solRoot) { _solRoot.remove(); _solRoot = null; } if (_solQTimer) { clearTimeout(_solQTimer); _solQTimer = 0; } };
    _solRoot.addEventListener('pointerdown', function (e) { if (e.target === _solRoot) solClose(); });
    var card = document.createElement('div');
    card.style.cssText = 'width:min(95vw,420px);max-height:94vh;overflow:auto;background:' + C.parch + ';border:5px solid ' + C.woodDark + ';border-radius:16px;color:' + C.ink + ';';
    card.innerHTML =
      '<div style="background:linear-gradient(180deg,#9945FF,#6d2fbf);padding:15px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid ' + C.woodDark + ';">' +
        '<span style="color:#fff;font-size:14px;">◎ SOLANA → RONKE</span>' +
        '<span id="sol-x" style="color:#fff;cursor:pointer;font-size:17px;padding:2px 8px;">✕</span></div>' +
      '<div style="padding:18px;">' +
        '<div id="sol-conn" style="margin-bottom:12px;"></div>' +
        '<div style="font-size:9px;color:' + C.sub + ';margin-bottom:6px;">You pay</div>' +
        '<div style="background:' + C.card + ';border:3px solid ' + C.woodDark + ';border-radius:12px;padding:12px;display:flex;align-items:center;gap:10px;">' +
          '<span style="font-size:12px;color:#9945FF;font-weight:bold;white-space:nowrap;">◎ SOL</span>' +
          '<input id="sol-amt" type="number" inputmode="decimal" min="0" step="any" placeholder="0.0" style="flex:1;min-width:0;text-align:right;border:none;outline:none;background:transparent;font:inherit;font-size:18px;color:' + C.ink + ';"/></div>' +
        '<div style="text-align:center;margin:8px 0;color:' + C.sub + ';font-size:16px;">↓</div>' +
        '<div style="font-size:9px;color:' + C.sub + ';margin-bottom:6px;">You receive (estimated)</div>' +
        '<div style="background:#efe2c0;border:3px dashed ' + C.woodDark + ';border-radius:12px;padding:12px;display:flex;align-items:center;gap:10px;min-height:28px;">' +
          '<img src="assets_tiny/ronke_logo.png" style="width:22px;height:22px;border-radius:50%;" onerror="this.style.display=\'none\'"/>' +
          '<span id="sol-out" style="flex:1;text-align:right;font-size:17px;">—</span></div>' +
        '<div style="background:#0000000d;border-radius:9px;padding:10px 12px;margin-top:12px;font-size:8px;color:' + C.sub + ';line-height:2;">' +
          '<div style="display:flex;justify-content:space-between;"><span>Route</span><span style="color:' + C.ink + ';">Solana → Ronin · LI.FI</span></div>' +
          '<div style="display:flex;justify-content:space-between;"><span>Est. time</span><span id="sol-eta" style="color:' + C.ink + ';">~seconds</span></div>' +
          '<div style="display:flex;justify-content:space-between;"><span>Bridge cost</span><span id="sol-fee" style="color:' + C.ink + ';">—</span></div>' +
          '<div style="display:flex;justify-content:space-between;"><span>RONKE to</span><span style="color:' + C.ink + ';">your Ronin wallet</span></div></div>' +
        '<button id="sol-go" style="width:100%;padding:14px;margin-top:14px;font:inherit;font-size:12px;border:3px solid ' + C.woodDark + ';border-radius:10px;cursor:pointer;background:#9945FF;color:#fff;box-shadow:0 4px 0 #6d2fbf;">CONNECT PHANTOM</button>' +
        '<div id="sol-msg" style="text-align:center;font-size:9px;margin-top:10px;min-height:12px;line-height:1.5;"></div>' +
        '<div style="text-align:center;font-size:7px;color:' + C.sub + ';margin-top:8px;opacity:.8;line-height:1.5;">Cross-chain via LI.FI · slightly higher cost (bridge fee)</div>' +
      '</div>';
    _solRoot.appendChild(card); document.body.appendChild(_solRoot);
    document.getElementById('sol-x').onclick = solClose;

    var ronin = _roninAddr();
    var go = document.getElementById('sol-go'), amtEl = document.getElementById('sol-amt');
    function _renderConn() {
      var c = document.getElementById('sol-conn'); if (!c) return;
      if (!ronin) { c.innerHTML = '<div style="background:rgba(232,93,93,.12);border:2px dashed ' + C.red + ';border-radius:10px;padding:10px;font-size:9px;line-height:1.6;color:' + C.ink + ';">⚠ Connect your Ronin wallet first — RONKE is delivered there.</div>'; return; }
      var rs = ronin.slice(0, 6) + '…' + ronin.slice(-4);
      c.innerHTML = _solPubkey
        ? '<div style="font-size:8px;color:' + C.sub + ';line-height:1.7;">Phantom ' + _solPubkey.slice(0, 4) + '…' + _solPubkey.slice(-4) + ' · RONKE → ' + rs + '</div>'
        : '<div style="font-size:8px;color:' + C.sub + ';line-height:1.7;">RONKE → ' + rs + '</div>';
    }
    function _refreshGo() {
      if (!ronin) { go.textContent = 'CONNECT RONIN WALLET'; return; }
      if (!_solPubkey) { go.textContent = 'CONNECT PHANTOM'; return; }
      go.textContent = _solQuote ? 'SWAP SOL → RONKE' : 'ENTER SOL AMOUNT';
    }
    _renderConn(); _refreshGo();
    function _doQuote() {
      _solQuote = null; var o = document.getElementById('sol-out'); if (o) o.textContent = '—';
      var f = document.getElementById('sol-fee'); if (f) f.textContent = '—';
      var sol = parseFloat(amtEl.value);
      if (!_solPubkey || !ronin || !(sol > 0)) { _refreshGo(); return; }
      var seq = ++_solQSeq; _solMsg('Finding route…', C.sub);
      _solFetchQuote(sol, ronin).then(function (q) {
        if (seq !== _solQSeq || !_solRoot) return;
        if (!q || !q.estimate) throw new Error('No route');
        _solQuote = q;
        document.getElementById('sol-out').textContent = _fmt(Number(q.estimate.toAmount) / 1e18, 2) + ' RONKE';
        var cost = Number(q.estimate.fromAmountUSD || 0) - Number(q.estimate.toAmountUSD || 0);
        document.getElementById('sol-fee').textContent = cost > 0 ? '~$' + cost.toFixed(2) : '—';
        document.getElementById('sol-eta').textContent = '~' + (q.estimate.executionDuration || 5) + 's';
        _solMsg('', C.ink); _refreshGo();
      }).catch(function (e) { if (seq !== _solQSeq) return; _solMsg(String(e.message || 'No route'), C.red); _refreshGo(); });
    }
    amtEl.addEventListener('input', function () { if (_solQTimer) clearTimeout(_solQTimer); _solQTimer = setTimeout(_doQuote, 500); });
    go.onclick = async function () {
      if (_solBusy) return;
      if (!ronin) { try { var w = W(); w && w.connect && w.connect(); } catch (_) {} solClose(); return; }
      if (!_solPubkey) {
        _solBusy = true; _solMsg('Connecting Phantom…', C.sub);
        try { await _solConnect(); _renderConn(); _refreshGo(); _solMsg('', C.ink); _doQuote(); }
        catch (e) { _solMsg(String(e.message || 'Phantom connect failed'), C.red); }
        _solBusy = false; return;
      }
      if (!_solQuote) { _doQuote(); return; }
      _solBusy = true; go.disabled = true; go.style.opacity = '.6';
      try {
        var res = await _solExec(_solQuote, function (s) { _solMsg(s, C.sub); });
        if (res) { _solMsg('✓ RONKE arrived in your Ronin wallet!', '#2fa84a'); _gasDrip(ronin); try { var ww = W(); ww && ww.refreshBalance && ww.refreshBalance(); } catch (_) {} }
        else { _solMsg('Sent — RONKE will arrive shortly.', C.wood); }
      } catch (e) { _solMsg(/reject|cancel|denied/i.test(String(e.message)) ? 'Cancelled' : String(e.message || 'Swap failed'), C.red); }
      _solBusy = false; go.disabled = false; go.style.opacity = '1';
    };
  }
  window.openSolanaSwap = _openSolanaSwap;

  // ════════════════ SOLANA ONBOARDING (RON first → then RONKE) ════════════════
  // Naujam Solana useriui: treniruotei kontraktas reikalauja ≥11 RON pinigine — vien RONKE „nenuves".
  // Žingsnis 1: vienu tapu gauk ~15 RON (SOL→native RON, LI.FI Relay). Žingsnis 2: pasirink RONKE kiekį.
  async function _solQuoteForRon(targetRon, toAddr) {
    // 1) probe rate (RON už 1 SOL) mažu referenciniu kiekiu, 2) apskaičiuok reikiamą SOL + buffer
    var probe = await _solFetchQuote(0.05, toAddr, _RON_NATIVE);
    var ronPerSol = (Number(probe.estimate.toAmount) / 1e18) / 0.05;
    if (!(ronPerSol > 0)) throw new Error('No RON route');
    var sol = (targetRon * _RON_BUF) / ronPerSol;
    sol = Math.ceil(sol * 1e5) / 1e5;            // 5 dp, į viršų
    var q = await _solFetchQuote(sol, toAddr, _RON_NATIVE);
    return { quote: q, sol: sol, estRon: Number(q.estimate.toAmount) / 1e18 };
  }

  function _openSolanaOnboard() {
    if (_obRoot) return;
    var ronin = _roninAddr();
    _obRoot = document.createElement('div');
    _obRoot.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(18,11,5,.85);display:flex;align-items:center;justify-content:center;font-family:\'Press Start 2P\',monospace,sans-serif;padding:14px;';
    var obClose = function () { if (_obRoot) { _obRoot.remove(); _obRoot = null; } };
    _obRoot.addEventListener('pointerdown', function (e) { if (e.target === _obRoot) obClose(); });
    var card = document.createElement('div');
    card.style.cssText = 'width:min(95vw,430px);max-height:94vh;overflow:auto;background:' + C.parch + ';border:5px solid ' + C.woodDark + ';border-radius:16px;color:' + C.ink + ';';
    card.innerHTML =
      '<div style="background:linear-gradient(180deg,#9945FF,#6d2fbf);padding:15px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid ' + C.woodDark + ';">' +
        '<span style="color:#fff;font-size:13px;">◎ PLAY WITH SOLANA</span>' +
        '<span id="ob-x" style="color:#fff;cursor:pointer;font-size:17px;padding:2px 8px;">✕</span></div>' +
      '<div style="padding:16px 16px 18px;">' +
        '<div style="font-size:8px;color:' + C.sub + ';line-height:1.8;margin-bottom:14px;">Welcome! Get set up in 2 steps — pay with SOL from Phantom, play on Ronin.</div>' +
        '<div id="ob-s1" style="border:3px solid ' + C.woodDark + ';border-radius:12px;padding:12px;background:' + C.card + ';margin-bottom:12px;">' +
          '<div style="display:flex;align-items:center;gap:8px;font-size:11px;margin-bottom:6px;"><span id="ob-s1-no" style="background:' + C.tealD + ';color:#fff;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;flex:none;">1</span><span>Get RON to play</span></div>' +
          '<div style="font-size:8px;color:' + C.sub + ';line-height:1.7;margin-bottom:10px;">Training needs <b style="color:' + C.ink + ';">≥' + _RON_MIN_TRAIN + ' RON</b> in your wallet (anti-bot). Grab a starter ' + _RON_STARTER + ' RON — covers gas + training for a long time.</div>' +
          '<div id="ob-ron-bal" style="font-size:8px;color:' + C.sub + ';margin-bottom:8px;">Your RON: …</div>' +
          '<button id="ob-ron-go" style="width:100%;padding:13px;font:inherit;font-size:11px;border:3px solid ' + C.woodDark + ';border-radius:10px;cursor:pointer;background:#9945FF;color:#fff;box-shadow:0 4px 0 #6d2fbf;">GET ' + _RON_STARTER + ' RON</button>' +
          '<div id="ob-ron-msg" style="text-align:center;font-size:8px;margin-top:8px;min-height:11px;line-height:1.5;"></div>' +
        '</div>' +
        '<div id="ob-s2" style="border:3px solid ' + C.woodDark + ';border-radius:12px;padding:12px;background:' + C.card + ';opacity:.55;">' +
          '<div style="display:flex;align-items:center;gap:8px;font-size:11px;margin-bottom:6px;"><span id="ob-s2-no" style="background:' + C.sub + ';color:#fff;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;flex:none;">2</span><span>Get RONKE (game coin)</span></div>' +
          '<div style="font-size:8px;color:' + C.sub + ';line-height:1.7;margin-bottom:10px;">RONKE is the in-game currency — choose how much you want.</div>' +
          '<button id="ob-ronke-go" style="width:100%;padding:13px;font:inherit;font-size:11px;border:3px solid ' + C.woodDark + ';border-radius:10px;cursor:pointer;background:' + C.teal + ';color:#fff;box-shadow:0 4px 0 ' + C.tealD + ';">CHOOSE RONKE →</button>' +
        '</div>' +
        '<div style="text-align:center;font-size:7px;color:' + C.sub + ';margin-top:12px;opacity:.8;line-height:1.6;">Cross-chain via LI.FI · ~seconds · small bridge fee</div>' +
      '</div>';
    _obRoot.appendChild(card); document.body.appendChild(_obRoot);
    document.getElementById('ob-x').onclick = obClose;

    var ronGo = document.getElementById('ob-ron-go');
    var ronkeGo = document.getElementById('ob-ronke-go');
    var s2 = document.getElementById('ob-s2');
    function _setStep2Enabled(on) {
      s2.style.opacity = on ? '1' : '.55';
      ronkeGo.disabled = !on;
      var n = document.getElementById('ob-s2-no'); if (n) n.style.background = on ? C.tealD : C.sub;
    }
    function _markStep1Done(ron) {
      var bal = document.getElementById('ob-ron-bal'); if (bal) bal.innerHTML = '✓ Ready to train — <b style="color:#2fa84a;">' + _fmt(ron, 2) + ' RON</b>';
      var no = document.getElementById('ob-s1-no'); if (no) { no.textContent = '✓'; no.style.background = '#2fa84a'; }
      if (ronGo) ronGo.style.display = 'none';
      _setStep2Enabled(true);
    }
    function _obMsg(t, c) { var e = document.getElementById('ob-ron-msg'); if (e) { e.textContent = t || ''; e.style.color = c || C.ink; } }

    _setStep2Enabled(false);
    (function _checkRon() {
      var w = W(); if (!w || !w.getRonBalance) return;
      w.getRonBalance(ronin).then(function (b) {
        b = b || 0; var el = document.getElementById('ob-ron-bal'); if (!el) return;
        if (b >= _RON_MIN_TRAIN) _markStep1Done(b);
        else { el.innerHTML = 'Your RON: <b style="color:' + C.ink + ';">' + _fmt(b, 3) + '</b> (need ≥' + _RON_MIN_TRAIN + ')'; _setStep2Enabled(false); }
      }).catch(function () {});
    })();

    ronGo.onclick = async function () {
      if (_obBusy) return;
      if (!ronin) { _obMsg('Connect your wallet first', C.red); return; }
      _obBusy = true; ronGo.disabled = true; ronGo.style.opacity = '.6';
      try {
        if (!_solPubkey) { _obMsg('Connecting Phantom…', C.sub); await _solConnect(); }
        _obMsg('Finding best route…', C.sub);
        var cur = 0; try { cur = (await W().getRonBalance(ronin)) || 0; } catch (_) {}
        var target = Math.max(_RON_STARTER - cur, 4);   // top-up iki ~15; min 4 RON kad LI.FI maršrutuotų
        var r = await _solQuoteForRon(target, ronin);
        _obMsg('Swapping ~' + _fmt(r.sol, 4) + ' SOL → ~' + _fmt(r.estRon, 1) + ' RON…', C.sub);
        var res = await _solExec(r.quote, function (s) { _obMsg(s, C.sub); });
        var nb = cur; try { nb = (await W().getRonBalance(ronin)) || cur; } catch (_) {}
        if (res || nb >= _RON_MIN_TRAIN) {
          _obMsg('✓ RON arrived — you can train now!', '#2fa84a');
          _markStep1Done(nb >= _RON_MIN_TRAIN ? nb : (cur + r.estRon));
          try { var ww = W(); ww && ww.refreshBalance && ww.refreshBalance(); } catch (_) {}
        } else { _obMsg('Sent — RON will arrive shortly. Re-open to continue.', C.wood); }
      } catch (e) {
        _obMsg(/reject|cancel|denied/i.test(String(e && e.message)) ? 'Cancelled' : String((e && e.message) || 'Swap failed'), C.red);
      }
      _obBusy = false; ronGo.disabled = false; ronGo.style.opacity = '1';
    };
    ronkeGo.onclick = function () { if (ronkeGo.disabled) return; obClose(); _openSolanaSwap(); };
  }
  window.openSolanaOnboard = _openSolanaOnboard;

  // ════════════════ CASH OUT → SOLANA (exit: RON+RONKE atgal į SOL) ════════════════
  // „Toks pat kelias atgal": RONKE auto-konvertuojam į RON (Katana, pigu) → bridge RON→SOL (Relay)
  // į žaidėjo Phantom Solana adresą. Bridge TX pasirašo išvestas Ronin raktas per shim (eth_sendTransaction).
  function _toUnits(amtStr, dec) {
    amtStr = String(amtStr); var parts = amtStr.split('.');
    var whole = parts[0] || '0', frac = (parts[1] || '').slice(0, dec);
    while (frac.length < dec) frac += '0';
    var s = (whole + frac).replace(/^0+/, ''); return s || '0';
  }
  async function _lifiRonToSol(ronAmount, fromRonin, toSol) {
    var amt = _toUnits(ronAmount, 18);
    var u = 'https://li.quest/v1/quote?fromChain=2020&toChain=' + _SOL_CHAIN + '&fromToken=' + _RON_NATIVE + '&toToken=' + _SOL_NATIVE + '&fromAmount=' + amt + '&fromAddress=' + fromRonin + '&toAddress=' + toSol + '&integrator=pewpew';
    var r = await fetch(u); if (!r.ok) throw new Error('No route for this amount'); return r.json();
  }
  async function _bridgeExecEvm(quote, fromRonin, onStatus) {
    var prov = null; try { prov = W().snapshot().provider; } catch (_) {}
    if (!prov || !prov.request) throw new Error('Wallet not connected');
    var tr = quote.transactionRequest; if (!tr || !tr.to) throw new Error('No bridge transaction');
    onStatus && onStatus('Sending on Ronin…');
    // `_sent` žyma: jei send NEpavyko (nėra tx) → saugu retry. Jei tx JAU išsiųstas → NEretry (kad nedublikuotų).
    var txHash;
    try { txHash = await prov.request({ method: 'eth_sendTransaction', params: [{ from: fromRonin, to: tr.to, data: tr.data, value: tr.value }] }); }
    catch (e) { if (e) e._sent = false; throw e; }
    onStatus && onStatus('Bridging to Solana…');
    for (var i = 0; i < 40; i++) {
      await new Promise(function (r) { setTimeout(r, 3000); });
      try {
        var st = await (await fetch('https://li.quest/v1/status?txHash=' + txHash + '&fromChain=2020&toChain=' + _SOL_CHAIN)).json();
        if (st.status === 'DONE') return st;
        if (st.status === 'FAILED') { var fe = new Error('Bridge failed on destination'); fe._sent = true; throw fe; }
      } catch (e) { if (/failed/i.test(String(e.message))) { e._sent = true; throw e; } }
    }
    return null;   // timeout — tx IŠSIŲSTAS, gali atkeliauti vėliau (NEretry)
  }
  function _openSolanaCashout() {
    if (_coRoot) return;
    var ronin = _roninAddr();
    var solDest = '';
    try { solDest = (window.PhantomRonin && window.PhantomRonin.getSolPubkey && window.PhantomRonin.getSolPubkey()) || _solPubkey || ''; } catch (_) {}
    _coRoot = document.createElement('div');
    _coRoot.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(18,11,5,.85);display:flex;align-items:center;justify-content:center;font-family:\'Press Start 2P\',monospace,sans-serif;padding:14px;';
    var coClose = function () { if (_coRoot) { _coRoot.remove(); _coRoot = null; } if (_coTimer) { clearTimeout(_coTimer); _coTimer = 0; } };
    _coRoot.addEventListener('pointerdown', function (e) { if (e.target === _coRoot) coClose(); });
    var card = document.createElement('div');
    card.style.cssText = 'width:min(95vw,430px);max-height:94vh;overflow:auto;background:' + C.parch + ';border:5px solid ' + C.woodDark + ';border-radius:16px;color:' + C.ink + ';';
    function _row(lbl, balId, inId, maxId, sym) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:8px;color:' + C.sub + ';margin:10px 0 5px;"><span>' + lbl + '</span><span id="' + balId + '" style="cursor:pointer;">bal: …</span></div>' +
        '<div style="background:' + C.card + ';border:3px solid ' + C.woodDark + ';border-radius:11px;padding:11px;display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:10px;color:' + C.tealD + ';font-weight:bold;white-space:nowrap;">' + sym + '</span>' +
        '<input id="' + inId + '" type="number" inputmode="decimal" min="0" step="any" placeholder="0.0" style="flex:1;min-width:0;text-align:right;border:none;outline:none;background:transparent;font:inherit;font-size:15px;color:' + C.ink + ';"/>' +
        '<button id="' + maxId + '" style="font:inherit;font-size:8px;border:2px solid ' + C.woodDark + ';border-radius:6px;cursor:pointer;background:' + C.gold + ';color:' + C.ink + ';padding:3px 8px;">MAX</button></div>';
    }
    card.innerHTML =
      '<div style="background:linear-gradient(180deg,#9945FF,#6d2fbf);padding:15px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid ' + C.woodDark + ';">' +
        '<span style="color:#fff;font-size:13px;">◎ CASH OUT → SOLANA</span>' +
        '<span id="co-x" style="color:#fff;cursor:pointer;font-size:17px;padding:2px 8px;">✕</span></div>' +
      '<div style="padding:16px 16px 18px;">' +
        '<div style="font-size:8px;color:' + C.sub + ';line-height:1.8;margin-bottom:4px;">Send your tokens back to Solana as SOL. RONKE is auto-converted to RON first (best value), then bridged.</div>' +
        _row('RON to withdraw', 'co-ron-bal', 'co-ron', 'co-ron-max', 'RON') +
        _row('RONKE to withdraw', 'co-ronke-bal', 'co-ronke', 'co-ronke-max', 'RONKE') +
        '<div style="font-size:8px;color:' + C.sub + ';margin:12px 0 5px;">Your Solana address</div>' +
        '<input id="co-dest" type="text" spellcheck="false" placeholder="Solana wallet address" value="' + solDest + '" style="width:100%;box-sizing:border-box;border:3px solid ' + C.woodDark + ';border-radius:11px;padding:10px;background:' + C.card + ';font:inherit;font-size:8px;color:' + C.ink + ';"/>' +
        '<div style="background:#efe2c0;border:3px dashed ' + C.woodDark + ';border-radius:11px;padding:11px;margin-top:12px;display:flex;align-items:center;gap:8px;min-height:24px;">' +
          '<span style="font-size:10px;color:#9945FF;font-weight:bold;">◎ SOL</span>' +
          '<span id="co-out" style="flex:1;text-align:right;font-size:15px;color:' + C.ink + ';">—</span></div>' +
        '<button id="co-go" style="width:100%;padding:14px;margin-top:14px;font:inherit;font-size:12px;border:3px solid ' + C.woodDark + ';border-radius:10px;cursor:pointer;background:#9945FF;color:#fff;box-shadow:0 4px 0 #6d2fbf;">CASH OUT → SOLANA</button>' +
        '<div id="co-msg" style="text-align:center;font-size:8px;margin-top:9px;min-height:11px;line-height:1.5;"></div>' +
        '<div style="text-align:center;font-size:7px;color:' + C.sub + ';margin-top:8px;opacity:.85;line-height:1.6;">Keeps ' + _CO_GAS + ' RON for gas (so you can still move remaining units/tokens later)</div>' +
        '<div style="text-align:center;font-size:7px;color:' + C.sub + ';margin-top:4px;opacity:.8;line-height:1.6;">Cross-chain via LI.FI Relay · ~seconds · small bridge fee</div>' +
      '</div>';
    _coRoot.appendChild(card); document.body.appendChild(_coRoot);
    document.getElementById('co-x').onclick = coClose;

    var ronIn = document.getElementById('co-ron'), ronkeIn = document.getElementById('co-ronke');
    var destIn = document.getElementById('co-dest'), go = document.getElementById('co-go');
    var R0 = 0, K0 = 0;
    function _coMsg(t, c) { var e = document.getElementById('co-msg'); if (e) { e.textContent = t || ''; e.style.color = c || C.ink; } }
    function _setBals() {
      var rb = document.getElementById('co-ron-bal'), kb = document.getElementById('co-ronke-bal');
      if (rb) rb.textContent = 'bal: ' + _fmt(R0, 4) + ' RON';
      if (kb) kb.textContent = 'bal: ' + _fmt(K0, 2) + ' RONKE';
    }
    (function _loadCoBals() {
      var w = W(); if (!w) return;
      try { var s = w.snapshot ? w.snapshot() : null; K0 = (s && typeof s.ronkeBalance === 'number') ? s.ronkeBalance : 0; } catch (_) {}
      _setBals();
      if (w.getRonBalance) w.getRonBalance(ronin).then(function (b) { R0 = b || 0; _setBals(); }).catch(function () {});
      if (w.refreshBalance) { try { w.refreshBalance(); } catch (_) {} setTimeout(function () { try { var s2 = w.snapshot(); if (s2 && typeof s2.ronkeBalance === 'number') { K0 = s2.ronkeBalance; _setBals(); } } catch (_) {} }, 1200); }
    })();
    document.getElementById('co-ron-max').onclick = function () { ronIn.value = _fmt(Math.max(0, R0 - _CO_GAS), 4); _coEstimate(); };
    document.getElementById('co-ronke-max').onclick = function () { ronkeIn.value = _fmt(K0, 2); _coEstimate(); };

    function _coEstimate() {
      var rRON = parseFloat(ronIn.value) || 0, kRONKE = parseFloat(ronkeIn.value) || 0, dest = (destIn.value || '').trim();
      var outEl = document.getElementById('co-out'); if (!outEl) return;
      if ((rRON <= 0 && kRONKE <= 0) || !dest) { outEl.textContent = '—'; return; }
      outEl.textContent = '…'; var seq = ++_coSeq; clearTimeout(_coTimer);
      _coTimer = setTimeout(async function () {
        try {
          var fromRonke = 0, w = W();
          if (kRONKE > 0 && w && w.swapQuote) { try { fromRonke = (await w.swapQuote('ronke2ron', kRONKE)) || 0; } catch (_) {} }
          var totalRon = rRON + fromRonke; var bridgeAmt = Math.max(0, totalRon - _CO_GAS);
          if (bridgeAmt <= 0) { if (seq === _coSeq) outEl.textContent = '—'; return; }
          var q = await _lifiRonToSol(bridgeAmt, ronin, dest);
          if (seq !== _coSeq) return;
          outEl.textContent = '≈ ' + _fmt(Number(q.estimate.toAmount) / 1e9, 4) + ' SOL';
        } catch (e) { if (seq === _coSeq) outEl.textContent = 'no route'; }
      }, 450);
    }
    ronIn.addEventListener('input', _coEstimate);
    ronkeIn.addEventListener('input', _coEstimate);
    destIn.addEventListener('input', _coEstimate);

    go.onclick = async function () {
      if (_coBusy) return;
      var rRON = parseFloat(ronIn.value) || 0, kRONKE = parseFloat(ronkeIn.value) || 0, dest = (destIn.value || '').trim();
      if (rRON <= 0 && kRONKE <= 0) { _coMsg('Enter an amount', C.red); return; }
      if (!dest || dest.length < 32) { _coMsg('Enter a valid Solana address', C.red); return; }
      if (rRON > R0) { _coMsg('Not enough RON', C.red); return; }
      if (kRONKE > K0) { _coMsg('Not enough RONKE', C.red); return; }
      _coBusy = true; go.disabled = true; go.style.opacity = '.6';
      var _bal = function () { return W().getRonBalance(ronin).then(function (b) { return Number(b) || 0; }).catch(function () { return 0; }); };
      try {
        var cur0 = (await _bal()) || R0;
        var keepRon = Math.max(0, cur0 - rRON);   // kiek originalaus RON paliekam (MAX RON → keepRon ≈ _CO_GAS)

        // ── ŽINGSNIS 1: RONKE → RON (Katana). LAUKIAM kol balansas REALIAI susėda (polling, ne fiksuotas
        //    timeout) — kitaip bridge skaičiuoja seną RON ir krenta (tai buvo „2 kartų" bug'as). ──
        if (kRONKE > 0) {
          _coMsg('Converting RONKE → RON…', C.sub);
          await W().swapRonkeToRon(kRONKE, SLIPPAGE, function () { _coMsg('RONKE → RON submitted…', C.sub); });
          _coMsg('Waiting for RON to settle…', C.sub);
          var target = cur0 + 0.001;                 // turi padidėti gautu RON (nepaisant swap gas)
          for (var w1 = 0; w1 < 25; w1++) {          // iki ~50s
            await new Promise(function (r) { setTimeout(r, 2000); });
            if ((await _bal()) > target) break;
          }
        }

        // ── ŽINGSNIS 2: bridge RON → SOL iš ŠVIEŽIO balanso, AUTO-RETRY be klaidos UI (tik jei TX
        //    dar NEišsiųstas — kad nedublikuotų). Viskas viename sraute, žmogui nieko kartoti nereikia. ──
        var done = false, lastErr = null;
        for (var attempt = 0; attempt < 3 && !done; attempt++) {
          var cur = await _bal();
          var bridgeAmt = cur - Math.max(keepRon, _CO_GAS);   // visada paliekam ≥ gas reserve
          if (bridgeAmt <= 0) { lastErr = new Error('Not enough RON to bridge after gas'); break; }
          try {
            _coMsg(attempt ? 'Retrying…' : 'Finding route…', C.sub);
            var q = await _lifiRonToSol(bridgeAmt, ronin, dest);
            _coMsg('Bridging ~' + _fmt(bridgeAmt, 3) + ' RON → SOL…', C.sub);
            var res = await _bridgeExecEvm(q, ronin, function (s) { _coMsg(s, C.sub); });
            done = true;
            _coMsg(res ? '✓ SOL sent to your Solana wallet!' : 'Sent — SOL will arrive shortly.', res ? '#2fa84a' : C.wood);
          } catch (e) {
            lastErr = e;
            if (/reject|denied|cancel|4001/i.test(String(e && e.message))) throw e;   // user atšaukė → stop
            if (e && e._sent) throw e;                                                 // TX jau išsiųstas → NEretry
            await new Promise(function (r) { setTimeout(r, 3000); });                  // transient → retry iš šviežio balanso
          }
        }
        if (!done) throw lastErr || new Error('Cash out failed');

        try { W().refreshBalance && W().refreshBalance(); } catch (_) {}
        try { R0 = await _bal(); var s3 = W().snapshot(); K0 = (s3 && typeof s3.ronkeBalance === 'number') ? s3.ronkeBalance : K0; _setBals(); } catch (_) {}
      } catch (e) {
        _coMsg(/reject|cancel|denied|4001/i.test(String(e && e.message)) ? 'Cancelled' : String((e && (e.shortMessage || e.message)) || 'Cash out failed').slice(0, 60), C.red);
      }
      _coBusy = false; go.disabled = false; go.style.opacity = '1';
    };
  }
  window.openSolanaCashout = _openSolanaCashout;

  // Auto onboarding: kai Phantom-derived useris prisijungia ir turi < min RON → pasiūlom setup (1×/sesija).
  function _maybeAutoOnboard() {
    if (_obAutoShown || _obChecking || _obRoot || _solRoot) return;
    var w = W(); if (!w || !w.isConnected || !w.isConnected()) return;
    var isPhantom = false; try { isPhantom = !!(window.PhantomRonin && window.PhantomRonin.isConnected()); } catch (_) {}
    if (!isPhantom) return;
    var addr = ''; try { addr = w.getAddress() || ''; } catch (_) {}
    if (!addr || !w.getRonBalance) return;
    _obChecking = true;
    w.getRonBalance(addr).then(function (b) {
      _obChecking = false;
      if ((b || 0) < _RON_MIN_TRAIN && !_obAutoShown && !_obRoot && !_solRoot) { _obAutoShown = true; _openSolanaOnboard(); }
    }).catch(function () { _obChecking = false; });
  }
  try { if (window.Wallet && window.Wallet.onChange) window.Wallet.onChange(function () { setTimeout(_maybeAutoOnboard, 500); }); } catch (_) {}

  window.openRonkeSwap = open;

  // ─── RONKE BANK = SWAP ───
  // RONKE badge (visada matomas HUD'e) atidaro SWAP TIESIAI. Banko deposit/withdraw pašalinti.
  // game.js badge click rodo #ronke-bank (display:block) — perimam per observer'į: paslepiam ir
  // atidarom swap. Taip vienu paspaudimu → swap, ir telefone, ir desktop'e (be mygtukų juostos).
  function _wireBankSwap() {
    var b = document.getElementById('rbk-swap');
    if (b && !b._swapWired) {
      b._swapWired = true;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var bk = document.getElementById('ronke-bank'); if (bk) bk.style.display = 'none';
        open();
      });
    }
    var bank = document.getElementById('ronke-bank');
    if (bank && !bank._swapHijack && typeof MutationObserver === 'function') {
      bank._swapHijack = true;
      var mo = new MutationObserver(function () {
        if (bank.style.display === 'block') { bank.style.display = 'none'; open(); }
      });
      mo.observe(bank, { attributes: true, attributeFilter: ['style'] });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _wireBankSwap);
  else _wireBankSwap();
  setTimeout(_wireBankSwap, 1500);   // saugiklis jei elementai atsiranda vėliau
})();
