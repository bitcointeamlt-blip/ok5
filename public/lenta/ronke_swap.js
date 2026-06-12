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
      '</div>';
    _root.appendChild(card);
    document.body.appendChild(_root);

    _el('rsw-x').onclick = _close;
    _el('rsw-flip').onclick = _flip;
    _el('rsw-amt').addEventListener('input', _onAmt);
    _el('rsw-max').onclick = _onMax;
    _el('rsw-bal').onclick = _onMax;
    _el('rsw-go').onclick = _doSwap;

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
