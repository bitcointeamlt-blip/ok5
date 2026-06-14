// leaderboard.js — Globali žaidimo statistika / leaderboard panelė.
// Atidaroma paspaudus in-game objektą (žr. game.js click handler) arba window.openLeaderboard().
// Duomenys: viešas edge function `leaderboard` (prod), fallback į leaderboard_local.json (lokalus testas).
(function () {
  'use strict';

  // Tema (Tiny Swords medieval) — žr. project_ui_medieval_theme
  var C = { wood: '#6b4a2e', woodDark: '#4a3320', parch: '#f5e6c3', teal: '#4a9da6',
            red: '#e85d5d', gold: '#ffcf5c', ink: '#3a2a18' };

  // Duomenų šaltiniai: edge function (units = TIKRAS on-chain NFT, CORS *), fallback į lokalų JSON.
  // Ir lokaliai naudojam edge fn (ji deploy'inta + veikia), kad matytume tikrus duomenis.
  var SOURCES = ['https://rbkivemouxwcgrpzazxb.supabase.co/functions/v1/leaderboard', 'leaderboard_local.json'];

  var _data = null;
  var _sortKey = 'units_held';
  var _sortDesc = true;   // true = didžiausias→mažiausias; toggle paspaudus tą patį stulpelį
  var _root = null;

  // ── RONKE Test Rewards — kiek faucet'o (RonkeReward) RONKE claimino kiekvienas wallet'as ──
  // On-chain Claimed event'ai (cumulative per wallet). Frontend užklausia tiesiogiai per Ronin RPC,
  // agreguoja ir suderina su leaderboard sutrumpintais adresais (0x1234...abcd). 2026-06-14.
  var _RONKE_FAUCET = '0xc59e860e2115ccdab499f619a67bedf71ee26007';
  var _RONKE_CLAIMED_TOPIC = '0x9cdcf2f7714cca3508c7f0110b04a90a80a3a8dd0e35de99689db74d28c5383e';
  var _RONKE_DEPLOY_BLOCK = 56821227;
  var _ronkeRewards = null;        // { '0x1234...abcd': ronkeInt }
  var _ronkeRewardsTotal = 0;

  async function _rpc(method, params) {
    var r = await fetch('https://api.roninchain.com/rpc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }),
    });
    var j = await r.json();
    if (j.error) throw new Error(j.error.message || 'rpc err');
    return j.result;
  }

  async function _fetchRonkeRewards() {
    try {
      var latest = parseInt(await _rpc('eth_blockNumber', []), 16);
      var byAddr = {};   // fullAddrLc -> BigInt suma (wei)
      var CH = 5000;
      for (var from = _RONKE_DEPLOY_BLOCK; from <= latest; from += CH) {
        var to = Math.min(from + CH - 1, latest);
        var logs;
        try {
          logs = await _rpc('eth_getLogs', [{
            address: _RONKE_FAUCET, topics: [_RONKE_CLAIMED_TOPIC],
            fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16),
          }]);
        } catch (e) { continue; }   // blogas chunk'as — praleidžiam, tęsiam
        for (var i = 0; i < logs.length; i++) {
          var lg = logs[i];
          if (!lg.topics || !lg.topics[1] || !lg.data) continue;
          var player = ('0x' + lg.topics[1].slice(-40)).toLowerCase();
          var amt = BigInt(lg.data.slice(0, 66));   // pirmas 32-baitų word = amount (wei)
          byAddr[player] = (byAddr[player] || 0n) + amt;
        }
      }
      var map = {}; var total = 0;
      for (var a in byAddr) {
        var ronke = Number(byAddr[a] / 1000000000000000000n);   // /1e18 → sveikas RONKE
        var trunc = a.slice(0, 6) + '...' + a.slice(-4);        // atitinka leaderboard sutrumpinimą
        map[trunc] = (map[trunc] || 0) + ronke;
        total += ronke;
      }
      _ronkeRewardsTotal = total;
      return map;
    } catch (_) { return {}; }
  }

  // Stulpeliai: key → {label, emoji}. Tvarka = rodymo tvarka.
  var COLS = [
    { key: 'units_held', label: 'Units',   emoji: '⚔️' },
    { key: 'rp',         label: 'RP',      emoji: '⚡', img: 'ronke.png' },   // RONKE Power (deko galia)
    { key: 'burned',     label: 'NFT Deaths', emoji: '🔥' },
    { key: 'trophies',   label: 'Trophy',  emoji: '🏆', img: 'PewPewTrophies.png' },
    { key: 'maxlvl',     label: 'Max Lv', emoji: '📈' },
    { key: 'kills',      label: 'Kills',   emoji: '💀' },
    { key: 'f12hi',      label: 'Max Score', emoji: '🎯' },
    { key: 'ronke_claimed', label: 'RONKE Test', emoji: '🎁' },   // faucet test rewards (claimed)
  ];

  function _fmt(n) {
    n = Number(n) || 0;
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
    return String(n);
  }

  async function _load() {
    for (var i = 0; i < SOURCES.length; i++) {
      try {
        var r = await fetch(SOURCES[i], { cache: 'no-store' });
        if (!r.ok) continue;
        var j = await r.json();
        if (j && j.players) return j;
      } catch (_) {}
    }
    return null;
  }

  function _close() {
    if (_root) { _root.remove(); _root = null; }
    document.removeEventListener('keydown', _onKey, true);
  }
  function _onKey(e) { if (e.key === 'Escape') _close(); }

  function _styleBtn(active) {
    return 'padding:7px 12px;margin:0 3px;border-radius:8px;cursor:pointer;font-weight:700;' +
      'font-size:13px;border:2px solid ' + C.woodDark + ';' +
      (active ? ('background:' + C.gold + ';color:' + C.ink + ';')
              : ('background:' + C.wood + ';color:' + C.parch + ';'));
  }

  function _render() {
    if (!_root) return;
    var t = (_data && _data.totals) || {};
    var players = (_data && _data.players) ? _data.players.slice() : [];
    // Įmerkiam RONKE test rewards į kiekvieną žaidėją pagal sutrumpintą adresą
    var _rr = _ronkeRewards || {};
    players.forEach(function (p) { p.ronke_claimed = _rr[p.addr] || 0; });
    // TOP 25 pagal aktyvų stulpelį (kvalifikacija = didžiausi), tada — jei ascending —
    // apverčiam TUOS PAČIUS 25 (mažiausias iš top 25 viršuje), o NE renkam mažiausius iš visų.
    players.sort(function (a, b) { return (Number(b[_sortKey]) || 0) - (Number(a[_sortKey]) || 0); });
    players = players.slice(0, 25);
    if (!_sortDesc) players.reverse();

    var totalsHtml =
      '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:6px 0 14px;">' +
      [['<img src="ronke.png" draggable="false" style="height:12px;width:auto;vertical-align:-2px;"> Total RP', t.total_rp],
       ['👥 Players', t.total_players],
       ['🔥 NFT Deaths', t.total_burned],
       ['🏆 Trophies', t.total_trophies],
       ['🎁 RONKE Test Rewards', _ronkeRewardsTotal]
      ].map(function (p) {
        return '<div class="lb-card" style="background:linear-gradient(180deg,' + C.wood + ',' + C.woodDark + ');color:' + C.gold + ';' +
          'border-radius:12px;padding:9px 15px;min-width:84px;text-align:center;border:2px solid ' + C.gold + ';' +
          'box-shadow:0 3px 0 rgba(0,0,0,.28);">' +
          '<div style="font-size:21px;font-weight:900;text-shadow:0 1px 2px rgba(0,0,0,.5);">' + _fmt(p[1]) + '</div>' +
          '<div style="font-size:10px;color:' + C.parch + ';opacity:.9;font-weight:600;">' + p[0] + '</div></div>';
      }).join('') + '</div>';

    var rowsHtml = players.map(function (p, i) {
      // Rank = vieta pagal DIDŽIAUSIĄ (descending), nepriklausomai nuo rodymo krypties —
      // didžiausias visada #1 (🥇), net jei ascending'e rodomas apačioj.
      var rank = _sortDesc ? (i + 1) : (players.length - i);
      var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : ('#' + rank);
      // Top 3 — auksas/sidabras/bronza fonas + kairysis akcento brūkšnys + didesnis medalis
      var accent = rank === 1 ? '#ffcf5c' : rank === 2 ? '#c8ccd6' : rank === 3 ? '#cd7f32' : '';
      var topBg = rank === 1 ? 'rgba(255,207,92,0.26)' : rank === 2 ? 'rgba(200,205,214,0.20)' : rank === 3 ? 'rgba(205,127,50,0.18)' : '';
      var rowBg = topBg || (i % 2 ? 'rgba(106,74,46,0.06)' : 'transparent');
      var rowStyle = 'background:' + rowBg + ';' + (accent ? 'box-shadow:inset 4px 0 0 ' + accent + ';' : '');
      var cells = COLS.map(function (c) {
        var hi = c.key === _sortKey;
        return '<td style="padding:7px 8px;text-align:center;font-weight:' + (hi ? '800' : '500') +
          ';color:' + (hi ? C.red : C.ink) + (hi ? ';background:rgba(255,207,92,0.14)' : '') + ';">' + _fmt(p[c.key]) + '</td>';
      }).join('');
      return '<tr class="lb-row" style="' + rowStyle + '">' +
        '<td style="padding:7px 8px;font-weight:800;color:' + C.wood + ';white-space:nowrap;' + (rank <= 3 ? 'font-size:18px;' : '') + '">' + medal + '</td>' +
        '<td style="padding:7px 8px;font-family:monospace;font-size:12px;color:' + C.ink + (rank <= 3 ? ';font-weight:700' : '') + ';">' + (p.addr || '?') + '</td>' +
        cells + '</tr>';
    }).join('');

    // Antraštės — KLIKINAMOS sortavimui (aktyvi = auksinė + ▼). Atskirų mygtukų nebereikia.
    var headHtml = '<th style="padding:8px 8px;color:' + C.parch + ';font-size:12px;">#</th>' +
      '<th style="padding:8px 8px;text-align:left;color:' + C.parch + ';font-size:12px;">Player</th>' +
      COLS.map(function (c) {
        var hi = c.key === _sortKey;
        var icon = c.img
          ? '<img src="' + c.img + '" alt="" draggable="false" style="height:20px;width:auto;display:block;margin:0 auto 1px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4));">'
          : '<div style="font-size:17px;line-height:1;margin-bottom:1px;">' + c.emoji + '</div>';
        return '<th data-sort="' + c.key + '" title="Sort: ' + c.label + '" ' +
          'style="padding:7px 5px;cursor:pointer;user-select:none;white-space:nowrap;font-size:10px;line-height:1.3;font-weight:700;' +
          'color:' + (hi ? C.ink : C.parch) + ';background:' + (hi ? C.gold : 'transparent') + ';' +
          (hi ? 'border-radius:8px 8px 0 0;box-shadow:0 0 0 1px ' + C.woodDark + ' inset;' : '') + '">' +
          icon + c.label + (hi ? (_sortDesc ? ' ▼' : ' ▲') : '') + '</th>';
      }).join('');

    var when = '';
    try { if (_data && _data.updated_at) when = new Date(_data.updated_at).toLocaleString(); } catch (_) {}

    _root.querySelector('#lb-body').innerHTML =
      totalsHtml +
      '<div id="lb-scroll" style="max-height:50vh;overflow:auto;border-radius:12px;border:2px solid ' + C.wood + ';box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead style="position:sticky;top:0;background:' + C.wood + ';box-shadow:0 2px 0 ' + C.woodDark + ';"><tr>' + headHtml + '</tr></thead>' +
      '<tbody>' + (rowsHtml || '<tr><td colspan="' + (COLS.length + 2) + '" style="padding:20px;text-align:center;color:' + C.ink + ';">No data</td></tr>') + '</tbody>' +
      '</table></div>';

    // Stulpelio antraštės click → sortuoja pagal tą stulpelį (desc)
    _root.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (k === _sortKey) { _sortDesc = !_sortDesc; }   // tas pats stulpelis → toggle kryptį
        else { _sortKey = k; _sortDesc = true; }          // naujas stulpelis → didžiausias pirma
        _render();
      });
    });
  }

  async function open() {
    if (_root) return;
    _root = document.createElement('div');
    _root.id = 'leaderboard-overlay';
    _root.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(20,12,6,0.78);' +
      'display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,sans-serif;';
    _root.innerHTML =
      '<style>.lb-row{transition:background .12s;}.lb-row:hover{background:rgba(255,207,92,0.22)!important;}' +
      'th[data-sort]:hover{filter:brightness(1.12);}' +
      '@media(max-width:560px){' +
      '#lb-panel{width:97vw!important;padding:11px 9px!important;max-height:94vh!important;}' +
      '#lb-panel h2{font-size:17px!important;}' +
      '#lb-body table{font-size:11px!important;}' +
      '#lb-body th{padding:5px 2px!important;font-size:9px!important;}' +
      '#lb-body th img{height:16px!important;}' +
      '#lb-body td{padding:6px 3px!important;font-size:11px!important;}' +
      '#lb-body td:nth-child(2){font-size:9.5px!important;}' +   /* adresas */
      '#lb-scroll{max-height:64vh!important;}' +
      '.lb-card{min-width:70px!important;padding:7px 11px!important;}' +
      '.lb-card>div:first-child{font-size:18px!important;}' +
      '}</style>' +
      '<div id="lb-panel" style="background:' + C.parch + ';width:min(760px,96vw);max-height:90vh;overflow:auto;' +
      'border-radius:16px;border:4px solid ' + C.woodDark + ';box-shadow:0 12px 40px rgba(0,0,0,.5);padding:16px 18px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
      '<h2 style="margin:0;color:' + C.wood + ';font-size:22px;">🏆 GLOBAL STATS</h2>' +
      '<button id="lb-close" style="background:' + C.red + ';color:#fff;border:none;border-radius:8px;' +
      'width:34px;height:34px;font-size:18px;cursor:pointer;font-weight:800;">✕</button></div>' +
      '<div id="lb-body" style="color:' + C.ink + ';text-align:center;padding:24px;">Loading…</div>' +
      '</div>';
    document.body.appendChild(_root);
    _root.querySelector('#lb-close').addEventListener('click', _close);
    _root.addEventListener('click', function (e) { if (e.target === _root) _close(); });
    document.addEventListener('keydown', _onKey, true);

    if (!_data) _data = await _load();
    _render();
    // RONKE test rewards — async (on-chain), perrenderinam kai gauta (nelaiko atidarymo)
    if (_ronkeRewards === null) {
      _fetchRonkeRewards().then(function (m) { _ronkeRewards = m || {}; _render(); });
    }
  }

  window.openLeaderboard = open;
  window.closeLeaderboard = _close;
})();
