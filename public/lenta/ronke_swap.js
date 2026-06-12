// ronke_swap.js — in-game RON ↔ RONKE swap popup (Katana DEX, player pays gas).
// window.openRonkeSwap() atidaro medieval-stiliaus popup. Naudoja Wallet.swapQuote /
// swapRonToRonke / swapRonkeToRon (žr. wallet.js). Onboarding: naujokas už RON perka RONKE.
(function () {
  if (window.openRonkeSwap) return;

  var C = { wood: '#6b4a2e', woodDark: '#4a3320', parch: '#f5e6c3', teal: '#4a9da6', red: '#e85d5d', gold: '#ffcf5c', ink: '#3a2a1a' };
  var SLIPPAGE = 2;            // %
  var GAS_RESERVE = 0.01;     // RON paliekam dujoms (RON→RONKE MAX)
  var _root = null, _dir = 'ron2ronke', _busy = false;
  var _ronBal = 0, _ronkeBal = 0, _quoteTimer = null, _quoteSeq = 0;

  function W() { return window.Wallet; }
  function _fmt(n, d) { d = d == null ? 4 : d; if (!isFinite(n)) return '0'; var s = Number(n).toFixed(d); return s.replace(/\.?0+$/, ''); }
  function _el(id) { return document.getElementById(id); }

  function _close() { if (_root) { _root.remove(); _root = null; } }

  function open() {
    if (_root) return;
    var w = W();
    _root = document.createElement('div');
    _root.id = 'ronke-swap-root';
    _root.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(20,12,6,0.80);' +
      'display:flex;align-items:center;justify-content:center;font-family:\'Press Start 2P\',monospace,sans-serif;';
    _root.addEventListener('pointerdown', function (e) { if (e.target === _root) _close(); });

    var card = document.createElement('div');
    card.style.cssText = 'position:relative;width:min(92vw,360px);background:' + C.parch + ';' +
      'border:4px solid ' + C.woodDark + ';border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.55);overflow:hidden;color:' + C.ink + ';';
    card.innerHTML =
      '<div style="background:linear-gradient(180deg,#7a5636,' + C.wood + ');padding:11px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ' + C.woodDark + ';">' +
        '<span style="color:' + C.gold + ';font-size:12px;">⇄ RON ↔ RONKE</span>' +
        '<span id="rsw-x" style="color:#f5e6c3;cursor:pointer;font-size:13px;padding:2px 6px;">✕</span>' +
      '</div>' +
      '<div style="padding:14px 16px 16px;">' +
        // direction toggle
        '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
          '<button id="rsw-dir-buy"  style="flex:1;padding:8px 4px;font:inherit;font-size:8px;border:2px solid ' + C.woodDark + ';border-radius:6px;cursor:pointer;background:' + C.teal + ';color:#fff;">BUY RONKE<br>(RON→RONKE)</button>' +
          '<button id="rsw-dir-sell" style="flex:1;padding:8px 4px;font:inherit;font-size:8px;border:2px solid ' + C.woodDark + ';border-radius:6px;cursor:pointer;background:#cdbb95;color:' + C.ink + ';">SELL RONKE<br>(RONKE→RON)</button>' +
        '</div>' +
        // input
        '<div style="display:flex;justify-content:space-between;font-size:8px;margin-bottom:4px;">' +
          '<span id="rsw-in-label">You pay (RON)</span><span id="rsw-bal" style="color:#7a5a2a;">bal: …</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
          '<input id="rsw-amt" type="number" inputmode="decimal" min="0" step="any" placeholder="0.0" ' +
            'style="flex:1;min-width:0;padding:9px;font:inherit;font-size:11px;border:2px solid ' + C.woodDark + ';border-radius:6px;background:#fff8e8;color:' + C.ink + ';" />' +
          '<button id="rsw-max" style="padding:0 10px;font:inherit;font-size:8px;border:2px solid ' + C.woodDark + ';border-radius:6px;cursor:pointer;background:' + C.gold + ';color:' + C.ink + ';">MAX</button>' +
        '</div>' +
        // output
        '<div style="font-size:8px;margin-bottom:4px;" id="rsw-out-label">You receive (RONKE)</div>' +
        '<div id="rsw-out" style="padding:9px;font-size:11px;border:2px dashed ' + C.woodDark + ';border-radius:6px;background:#efe2c0;margin-bottom:8px;min-height:14px;">—</div>' +
        '<div id="rsw-info" style="font-size:7px;color:#7a5a2a;line-height:1.6;margin-bottom:10px;">Rate via Katana DEX · slippage ' + SLIPPAGE + '% · you pay gas (RON)</div>' +
        '<button id="rsw-go" style="width:100%;padding:11px;font:inherit;font-size:10px;border:2px solid ' + C.woodDark + ';border-radius:7px;cursor:pointer;background:' + C.teal + ';color:#fff;">SWAP</button>' +
        '<div id="rsw-msg" style="text-align:center;font-size:8px;margin-top:9px;min-height:11px;color:' + C.ink + ';"></div>' +
      '</div>';
    _root.appendChild(card);
    document.body.appendChild(_root);

    _el('rsw-x').onclick = _close;
    _el('rsw-dir-buy').onclick = function () { _setDir('ron2ronke'); };
    _el('rsw-dir-sell').onclick = function () { _setDir('ronke2ron'); };
    _el('rsw-amt').addEventListener('input', _onAmt);
    _el('rsw-max').onclick = _onMax;
    _el('rsw-go').onclick = _doSwap;

    if (!w || !w.isConnected || !w.isConnected()) {
      _msg('Connect your wallet first', C.red);
      _el('rsw-go').textContent = 'CONNECT WALLET';
      _el('rsw-go').onclick = function () { try { w && w.connect && w.connect(); } catch (_) {} _close(); };
    }
    _setDir('ron2ronke');
    _loadBalances();
  }

  function _setDir(d) {
    _dir = d;
    var buy = _el('rsw-dir-buy'), sell = _el('rsw-dir-sell');
    if (buy && sell) {
      buy.style.background = d === 'ron2ronke' ? C.teal : '#cdbb95';
      buy.style.color = d === 'ron2ronke' ? '#fff' : C.ink;
      sell.style.background = d === 'ronke2ron' ? C.teal : '#cdbb95';
      sell.style.color = d === 'ronke2ron' ? '#fff' : C.ink;
    }
    _el('rsw-in-label').textContent = d === 'ron2ronke' ? 'You pay (RON)' : 'You pay (RONKE)';
    _el('rsw-out-label').textContent = d === 'ron2ronke' ? 'You receive (RONKE)' : 'You receive (RON)';
    _el('rsw-amt').value = '';
    _el('rsw-out').textContent = '—';
    _updateBalLine();
    _msg('', C.ink);
  }

  function _loadBalances() {
    var w = W(); if (!w || !w.isConnected || !w.isConnected()) return;
    try {
      var snap = w.snapshot ? w.snapshot() : null;
      _ronkeBal = (snap && typeof snap.ronkeBalance === 'number') ? snap.ronkeBalance : 0;
    } catch (_) {}
    _updateBalLine();
    if (w.getRonBalance) w.getRonBalance().then(function (b) { _ronBal = b || 0; _updateBalLine(); }).catch(function () {});
    if (w.refreshBalance) { try { w.refreshBalance(); } catch (_) {} setTimeout(function () {
      try { var s = w.snapshot ? w.snapshot() : null; if (s && typeof s.ronkeBalance === 'number') { _ronkeBal = s.ronkeBalance; _updateBalLine(); } } catch (_) {}
    }, 1200); }
  }

  function _updateBalLine() {
    var el = _el('rsw-bal'); if (!el) return;
    el.textContent = 'bal: ' + (_dir === 'ron2ronke' ? (_fmt(_ronBal, 4) + ' RON') : (_fmt(_ronkeBal, 2) + ' RONKE'));
  }

  function _onMax() {
    var v = _dir === 'ron2ronke' ? Math.max(0, _ronBal - GAS_RESERVE) : _ronkeBal;
    _el('rsw-amt').value = _dir === 'ron2ronke' ? _fmt(v, 4) : _fmt(v, 2);
    _onAmt();
  }

  function _onAmt() {
    var raw = parseFloat(_el('rsw-amt').value);
    var out = _el('rsw-out');
    if (!isFinite(raw) || raw <= 0) { out.textContent = '—'; return; }
    out.textContent = 'quoting…';
    var seq = ++_quoteSeq;
    clearTimeout(_quoteTimer);
    _quoteTimer = setTimeout(function () {
      var w = W(); if (!w || !w.swapQuote) { out.textContent = '—'; return; }
      w.swapQuote(_dir, raw).then(function (q) {
        if (seq !== _quoteSeq) return;   // stale
        out.textContent = _fmt(q, _dir === 'ron2ronke' ? 2 : 5) + (_dir === 'ron2ronke' ? ' RONKE' : ' RON');
      }).catch(function () { if (seq === _quoteSeq) out.textContent = 'quote failed'; });
    }, 320);
  }

  function _msg(t, col) { var el = _el('rsw-msg'); if (el) { el.textContent = t || ''; el.style.color = col || C.ink; } }

  function _doSwap() {
    if (_busy) return;
    var w = W();
    if (!w || !w.isConnected || !w.isConnected()) { _msg('Connect wallet first', C.red); return; }
    var amt = parseFloat(_el('rsw-amt').value);
    if (!isFinite(amt) || amt <= 0) { _msg('Enter an amount', C.red); return; }
    if (_dir === 'ron2ronke' && amt > _ronBal) { _msg('Not enough RON', C.red); return; }
    if (_dir === 'ronke2ron' && amt > _ronkeBal) { _msg('Not enough RONKE', C.red); return; }
    _busy = true;
    var go = _el('rsw-go'); go.disabled = true; go.style.opacity = '.6';
    _msg('Confirm in wallet…', C.ink);
    var p = _dir === 'ron2ronke' ? w.swapRonToRonke(amt, SLIPPAGE) : w.swapRonkeToRon(amt, SLIPPAGE);
    p.then(function () {
      _msg('✅ Swapped! Balance updating…', '#2e7d32');
      _loadBalances();
      setTimeout(function () { _el('rsw-amt').value = ''; _el('rsw-out').textContent = '—'; }, 200);
    }).catch(function (e) {
      var m = String((e && (e.shortMessage || e.message)) || e);
      var s = /reject|denied|cancel|4001/i.test(m) ? 'Cancelled'
        : (/network|chain/i.test(m) ? 'Wrong network — switch to Ronin'
        : (/not enough|insufficient|balance/i.test(m) ? 'Not enough balance'
        : (/liquidity/i.test(m) ? 'No liquidity for that size' : (m.slice(0, 40) || 'Swap failed'))));
      _msg('⚠ ' + s, C.red);
    }).then(function () {
      _busy = false; var g = _el('rsw-go'); if (g) { g.disabled = false; g.style.opacity = '1'; }
    });
  }

  window.openRonkeSwap = open;
})();
