// raid_ui.js — ⚔️ Castle raid target picker.
//   HOME scenoj rodo „⚔️ Raid a Castle" mygtuką → panelė su pilių sąrašu iš f9_bases (Supabase REST) →
//   click → window.F9PvpLive.launchRaid(targetAddr) (LIVE raid; taikinys turi būti online).
//   Self-contained, jokio build'o. (10 RONKE ekonomika + async fallback — vėliau.)
(function () {
  'use strict';
  var SUPABASE_URL = 'https://rbkivemouxwcgrpzazxb.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_E4cHxTFKDTYgrdxcv5uRfQ_9tryLJ4p';
  var btn = null, panel = null;

  function myAddr() {
    try { return ((window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || window._f9HomeAddr || '').toLowerCase(); } catch (_) { return ''; }
  }
  function shortAddr(a) { a = String(a || ''); return a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a; }

  function fetchCastles() {
    // 07-12 user: ilgesnis sąrašas jei yra ką rodyti (limit 60→200; aukštį valdo panelės 86vh + scroll)
    // like.0x* — kad fee_/match_ tarnybinės eilutės neėstų limit'o (pilys visos prasideda 0x)
    var url = SUPABASE_URL + '/rest/v1/f9_bases?select=ronin_address,power,units,buildings,updated_at&ronin_address=like.0x*&order=updated_at.desc&limit=200';
    return fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  // ── 📜 VIEŠA PvP ISTORIJA (07-14 user) — SERVERIO rašomi `match_<id>` įrašai f9_bases lentelėje ──
  //    (F9PvpRoom._persistRaidReport → BaseStore.logMatch; server-authoritative — joks klientas nefalsifikuos).
  //    buildings jsonb: {matchId,at,attacker,defender,winner,result,atkSurvived/Injured/Dead,defSurvived/Injured/Dead,bones,durationMs}
  function fetchMatches() {
    var url = SUPABASE_URL + '/rest/v1/f9_bases?select=ronin_address,buildings,updated_at&ronin_address=like.match_*&order=updated_at.desc&limit=50';
    return fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        return (rows || []).map(function (r) {
          var b = (r && r.buildings) || {};
          return {
            match_id: b.matchId || String(r.ronin_address || '').slice(6),
            attacker: b.attacker || '', defender: b.defender || '', winner: b.winner || '',
            atk_survived: (b.atkSurvived | 0), atk_injured: (b.atkInjured | 0), atk_dead: (b.atkDead | 0),
            def_survived: (b.defSurvived | 0), def_injured: (b.defInjured | 0), def_dead: (b.defDead | 0),
            // 🦴 pusių kill-loot (nauji įrašai; seni be laukų → null, tada eilutė nerodoma)
            atk_bones: (b.atkBones == null ? null : +b.atkBones), def_bones: (b.defBones == null ? null : +b.defBones),
            loot: +(b.bones || 0),   // 💰 pavogtas mining pot RONKE (fullWipe steal)
            reason: b.result || '', duration_ms: (b.durationMs | 0),
            created_at: b.at ? new Date(b.at).toISOString() : (r.updated_at || '')
          };
        });
      })
      .catch(function () { return []; });
  }
  function _histEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function agoStr(iso) {
    try {
      var t = Date.parse(iso); if (!t) return '';
      var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
      if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago';
    } catch (_) { return ''; }
  }
  var histOverlay = null;
  function openHistory() {
    closeHistory();
    histOverlay = document.createElement('div');
    histOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,22,0.92);z-index:100001;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
    histOverlay.addEventListener('click', function (ev) { if (ev.target === histOverlay) closeHistory(); });
    var hp = document.createElement('div');
    // 🖼 07-15 user: „lentutė didesnė, neišnaudota tuščia vieta, viskas sugrūsta" → 860px + erdvesni šriftai/tarpai
    hp.style.cssText = 'background:linear-gradient(180deg,#1f2940 0%,#0c1020 100%);border:3px solid #ffcf5c;box-shadow:0 0 48px rgba(255,207,92,0.35),inset 0 0 24px rgba(255,207,92,0.08);border-radius:8px;padding:22px 28px;width:860px;max-width:96vw;max-height:90vh;display:flex;flex-direction:column;' +
      "font-family:'Press Start 2P',monospace,sans-serif;font-size:10px;line-height:1.5;color:#8a9aaa;";
    hp.innerHTML =
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:8px;padding-bottom:12px;border-bottom:1px solid #4a3a18;">' +
        '<span style="font-size:24px;text-shadow:0 0 14px #ffcf5c;">📜</span>' +
        '<span style="flex:1;font-size:16px;color:#ffcf5c;letter-spacing:2px;">PvP HISTORY</span>' +
        '<button id="f9hist-x" style="background:none;border:none;color:#8a9aaa;font-size:22px;cursor:pointer;line-height:1;font-family:inherit;">×</button>' +
      '</div>' +
      '<div style="font-size:9px;color:#6a7a8a;margin-bottom:12px;line-height:1.7;">Recent castle raids — who attacked whom, Match ID &amp; outcome. Recorded by the game server.</div>' +
      '<div id="f9hist-list" style="overflow:auto;display:flex;flex-direction:column;gap:12px;"><div style="color:#6a7a8a;font-size:10px;padding:10px 0;">Loading history…</div></div>';
    histOverlay.appendChild(hp);
    document.body.appendChild(histOverlay);
    hp.querySelector('#f9hist-x').onclick = closeHistory;
    fetchMatches().then(function (rows) { var l = hp.querySelector('#f9hist-list'); if (l) renderHistory(rows, l); });
  }
  function closeHistory() {
    if (histOverlay && histOverlay.parentNode) histOverlay.parentNode.removeChild(histOverlay);
    histOverlay = null;
  }
  function renderHistory(rows, listEl) {
    if (!rows || !rows.length) { listEl.innerHTML = '<div style="color:#6a7a8a;font-size:10px;line-height:1.8;padding:12px 0;">No battles recorded yet — raid a castle to start the log ⚔️</div>'; return; }
    listEl.innerHTML = '';
    // 🎴 2-PUSĖ kortelė (07-15 user): kas puolė / kas gynėsi, kiekvienos pusės armija, ✔/🤕/💀 ir 🦴 grobis;
    //    laimėtojo pusė paauksinta 👑; 💰 = pavogtas mining pot RONKE (rodomas +puolikui / −gynėjui).
    //    v2 07-15: panelė 860px — side box'ai erdvesni, statistika horizontaliai, VS skirtukas.
    function sideBox(role, m) {
      var atk = role === 'attacker';
      var addr = atk ? m.attacker : m.defender;
      var sv = atk ? m.atk_survived : m.def_survived, inj = atk ? m.atk_injured : m.def_injured, dd = atk ? m.atk_dead : m.def_dead;
      var bones = atk ? m.atk_bones : m.def_bones;
      var army = (sv | 0) + (inj | 0) + (dd | 0);
      var won = m.winner === role;
      var col = atk ? '#ff9a98' : '#8cd0ff';
      // 📝 07-15 user: adresas TOJE PAČIOJE eilutėje kaip ATTACKER/DEFENDER; statistika ŽODŽIAIS+skaičiais
      //    (be emoji): UNITS / SURVIVED / INJURED / DEAD / BONES LOOT / RONKE LOOT — vietos pakanka.
      function stat(label, val, valCol, title) {
        return '<span style="white-space:nowrap;" title="' + title + '">' + label + ' <span style="color:' + valCol + ';">' + val + '</span></span>';
      }
      var lootHtml = '';
      if (m.loot) lootHtml = atk
        ? stat('RONKE LOOT', '+' + (+m.loot).toFixed(1), '#8dffa0', "Stolen from defender's mining pot")
        : stat('RONKE LOOT', '−' + (+m.loot).toFixed(1), '#ff8a88', 'Stolen by the attacker');
      return '<div style="flex:1 1 280px;min-width:250px;padding:13px 16px;border-radius:6px;border:1px solid ' + (won ? '#ffcf5c' : '#3a3a55') + ';background:' + (won ? 'rgba(255,207,92,0.07)' : 'rgba(255,255,255,0.02)') + ';">' +
        '<div style="display:flex;align-items:center;gap:12px;font-size:9px;color:' + col + ';letter-spacing:.8px;margin-bottom:9px;">' +
          (atk ? '⚔ ATTACKER' : '🛡 DEFENDER') +
          '<span style="font-size:10px;color:#e8eef8;letter-spacing:0;" title="' + _histEsc(addr) + '">' + shortAddr(addr) + '</span>' +
          (won ? '<span style="margin-left:auto;color:#ffcf5c;">👑 WON</span>' : '') +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:7px 16px;font-size:9px;color:#8a9aaa;line-height:1.7;align-items:center;">' +
          stat('UNITS', army, '#e8eef8', 'Units fielded') +
          stat('SURVIVED', (sv | 0), '#6fcf5c', 'Units that survived unharmed') +
          stat('INJURED', (inj | 0), '#e8a54a', 'Units injured (hospital)') +
          stat('DEAD', (dd | 0), '#ff6b6b', 'Units killed') +
          (bones == null ? '' : stat('BONES LOOT', (+bones).toFixed(1), '#8dffa0', 'Bones looted from kills')) +
          lootHtml +
        '</div></div>';
    }
    rows.forEach(function (m) {
      var win = m.winner;
      var badge = win === 'attacker' ? '<span style="color:#ff9a98;">⚔ RAIDER WON</span>'
        : win === 'defender' ? '<span style="color:#6fcf5c;">🛡 DEFENDER WON</span>'
        : '<span style="color:#fc8;">DRAW</span>';
      var row = document.createElement('div');
      row.style.cssText = 'padding:13px 16px;border-radius:6px;border:1px solid #3a3a55;background:rgba(255,255,255,0.03);';
      row.innerHTML =
        '<div style="display:flex;align-items:center;gap:12px;font-size:10px;margin-bottom:10px;">' +
          badge +
          '<span style="margin-left:auto;font-size:9px;color:#6a7a8a;" title="Match ID">#' + _histEsc(m.match_id) + '</span>' +
          '<span style="font-size:9px;color:#6a7a8a;">' + _histEsc(agoStr(m.created_at)) + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:12px;align-items:stretch;flex-wrap:wrap;">' + sideBox('attacker', m) +
          '<div style="align-self:center;color:#5a6a7a;font-size:11px;">VS</div>' + sideBox('defender', m) + '</div>';
      listEl.appendChild(row);
    });
  }

  function ensureButton() {
    if (btn) return;
    btn = document.createElement('button');
    btn.id = 'f9-raid-btn';
    btn.textContent = '⚔️ Raid a Castle';
    btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99998;padding:9px 14px;border-radius:10px;border:2px solid #7a3a3a;background:linear-gradient(180deg,#3a1714,#241010);color:#ffcf5c;font:700 13px Verdana,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.5);display:none';
    btn.onmouseenter = function () { btn.style.filter = 'brightness(1.2)'; };
    btn.onmouseleave = function () { btn.style.filter = 'none'; };
    btn.onclick = openPanel;
    document.body.appendChild(btn);
  }

  // 🏆 TROPHY stilius (07-03, kaip hospital/cemetery/bone bank): overlay+blur, navy gradientas,
  //    auksinis rėmas su glow, „Press Start 2P", klik šalia = uždaro.
  var overlay = null;
  var _refreshTimer = null;   // 🔄 15s sąrašo auto-refresh (valomas closePanel)
  function openPanel() {
    closePanel();
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,22,0.92);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closePanel(); });
    panel = document.createElement('div');
    panel.id = 'f9-raid-panel';
    panel.style.cssText = 'background:linear-gradient(180deg,#1f2940 0%,#0c1020 100%);border:3px solid #ffcf5c;' +
      'box-shadow:0 0 48px rgba(255,207,92,0.35),inset 0 0 24px rgba(255,207,92,0.08);border-radius:8px;' +
      'padding:18px 22px;width:460px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;' +
      "font-family:'Press Start 2P',monospace,sans-serif;font-size:10px;line-height:1.5;color:#8a9aaa;";
    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;padding-bottom:10px;border-bottom:1px solid #4a3a18;">' +
        '<span style="font-size:22px;text-shadow:0 0 14px #ffcf5c;">⚔️</span>' +
        '<span style="flex:1;font-size:14px;color:#ffcf5c;letter-spacing:1.5px;">RAID A CASTLE</span>' +
        '<button id="f9raid-hist" title="Public PvP battle history" style="font-size:8px;color:#ffcf5c;padding:5px 9px;background:rgba(255,207,92,0.1);border:1px solid #6a4a18;border-radius:4px;cursor:pointer;font-family:inherit;letter-spacing:.5px;">📜 HISTORY</button>' +
        '<span id="f9raid-counter" style="font-size:9px;color:#d49a2a;padding:4px 10px;background:rgba(255,207,92,0.1);border:1px solid #6a4a18;border-radius:4px;"></span>' +
        '<button id="f9raid-x" style="background:none;border:none;color:#8a9aaa;font-size:20px;cursor:pointer;line-height:1;font-family:inherit;">×</button>' +
      '</div>' +
      '<div style="font-size:9px;color:#6a7a8a;margin-bottom:8px;">Pick a castle to attack — richest RONKE mines on top ⛏️</div>' +
      '<div id="f9raid-list" style="overflow:auto;display:flex;flex-direction:column;gap:7px;"><div style="color:#6a7a8a;font-size:9px;padding:8px 0;">Loading castles…</div></div>' +
      '<div style="margin-top:12px;border-top:1px solid #3a3a55;padding-top:10px;">' +
        '<div style="font-size:9px;color:#6a7a8a;margin-bottom:6px;">Or enter a wallet address:</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<input id="f9raid-addr" placeholder="0x…" style="flex:1;min-width:0;padding:8px;border-radius:4px;border:1px solid #3a3a55;background:#0c1020;color:#c9d4e8;font-family:inherit;font-size:9px;"/>' +
          '<button id="f9raid-go" style="padding:8px 14px;border-radius:4px;border:2px solid #ffcf5c;background:rgba(255,207,92,0.1);color:#ffcf5c;font-family:inherit;font-size:9px;cursor:pointer;">ATTACK</button>' +
        '</div></div>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    panel.querySelector('#f9raid-x').onclick = closePanel;
    var _hb = panel.querySelector('#f9raid-hist'); if (_hb) _hb.onclick = openHistory;
    panel.querySelector('#f9raid-go').onclick = function () {
      var a = (panel.querySelector('#f9raid-addr').value || '').trim();
      if (a) doRaid(a);
    };
    fetchCastles().then(renderList);
    // 🔄 07-12 user: auto-refresh kas 15s kol panelė atidaryta — gynėjas galėjo grįžti online / atsirasti
    //   skydas / pasikeisti potas. Scroll pozicija išsaugoma. Susidūrimų serveris vis tiek išsprendžia
    //   join metu (SHIELDED/CD re-check; fee TX atmetus NEsudeginamas).
    if (_refreshTimer) clearInterval(_refreshTimer);
    _refreshTimer = setInterval(function () {
      if (!panel || !document.body.contains(panel)) { clearInterval(_refreshTimer); _refreshTimer = null; return; }
      fetchCastles().then(function (rows) {
        if (!panel) return;
        var list = panel.querySelector('#f9raid-list');
        var st = list ? list.scrollTop : 0;
        renderList(rows);
        if (list) list.scrollTop = st;
      });
    }, 15000);
  }

  // ⛏️ VIEŠAS pilies RONKE kasimo potas (07-12 ekonomikos redizainas: pasyvus uždarbis = RONKE mining,
  //   kaulų gen OFF; grobis = 50% mining pot per 100% wipe). == serverio _mineRateFrom formulė iš persistintų
  //   buildings laukų (minePot/mineField/mineReserve/cemPower/shieldUntil). Display only; tikras grobis — server-auth.
  function estPot(b) {
    if (!b || typeof b !== 'object') return 0;
    var nft = +b.cemNft || 0, rv = +b.cemRv || 0, wallet = +b.cemWallet || 0;
    var eligible = (rv >= 1 && nft >= 10) || (nft >= 12 && wallet >= 69);
    var onF = +b.mineField || 0, res = +b.mineReserve || 0, reg = onF + res;
    var frac = reg > 0 ? onF / reg : 0;
    var raw = (frac > 0 ? 10 : 0) + Math.min(+b.cemPower || 0, 4000) * 0.1 * frac;   // MINE_BASE_H + power×0.1×frakcija
    var shielded = (Number(b.shieldUntil) || 0) > Date.now();
    var rate = eligible ? raw * (shielded ? 0.5 : 1) * 0.5 : 0;   // ×0.5 success (efektyvus, kaip serveris)
    var pot = +b.minePot || 0;
    if (rate > 0 && +b.cemTick > 0) pot += rate * Math.max(0, Date.now() - (+b.cemTick)) / 3600000;
    return Math.min(5000, pot);   // MINE_CAP
  }
  var STEAL_PCT = 0.5;   // == serverio MINE_STEAL_PCT — 100% wipe atveju puolikas gauna 50% poto
  // ⚔ M7 fix (07-12, sync auditas): rodom KOVAI PAJĖGIUS gynėjus (snapshot NFT − sužaloti − mirę) —
  //   raw snapshot count over-count'indavo (po raido rodė pre-raid skaičių, nors visi ligoninėj).
  function combatReady(r) {
    var b = (r && r.buildings) || {};
    var bad = {};
    (Array.isArray(b.injured) ? b.injured : []).forEach(function (i) { if (i && i.tokenId != null) bad[String(i.tokenId)] = 1; });
    (Array.isArray(b.deadUnits) ? b.deadUnits : []).forEach(function (t) { bad[String(t)] = 1; });
    var n = 0;
    (Array.isArray(r && r.units) ? r.units : []).forEach(function (u) {
      if (u && u.tokenId && !/^dev/i.test(String(u.tokenId)) && !bad[String(u.tokenId)]) n++;
    });
    return n;
  }
  function renderList(rows) {
    var list = panel && panel.querySelector('#f9raid-list');
    if (!list) return;
    var me = myAddr();
    rows = (rows || []).filter(function (r) {
      var a = String(r.ronin_address || '').toLowerCase();
      if (a === me || a.indexOf('#') >= 0) return false;
      if (r.buildings && r.buildings.dutyMode === 'safe') return false;   // 🛡 SAFE režimo pilys NEPUOLAMOS (07-13 duty status)
      return combatReady(r) >= 1;   // be kovai pajėgių gynėjų — nelistinama (L7: sąrašas = gate)
    });
    var cntEl = panel && panel.querySelector('#f9raid-counter');
    if (cntEl) cntEl.textContent = '🏰 ' + rows.length;
    if (!rows.length) {
      list.innerHTML = '<div style="color:#6a7a8a;font-size:9px;line-height:1.7;padding:8px 0;">No raidable castles (need registered NFT defenders). Open the game on another wallet/PC first.</div>';
      return;
    }
    rows.forEach(function (r) { r._pot = estPot(r.buildings); });
    rows.sort(function (a, b) { return b._pot - a._pot; });   // riebiausios kapinės viršuje — rinkis auką!
    list.innerHTML = '';
    rows.forEach(function (r) {
      var addr = String(r.ronin_address || '');
      var cnt = combatReady(r);   // M7: kovai pajėgūs (ne raw snapshot)
      var pot = r._pot || 0;
      // 🛡 SHIELD: ką tik nusiaubta pilis — nepuolama iki shieldUntil (serveris vis tiek atmes; čia UX)
      var shMs = Math.max(0, (Number(r.buildings && r.buildings.shieldUntil) || 0) - Date.now());
      var shielded = shMs > 0;
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:6px;border:1px solid #3a3a55;background:rgba(255,255,255,0.03);cursor:pointer;transition:background .12s,border-color .12s;' + (shielded ? 'opacity:0.55;' : '');
      row.onmouseenter = function () { row.style.background = 'rgba(255,207,92,0.08)'; row.style.borderColor = shielded ? '#4a9da6' : '#ffcf5c'; };
      row.onmouseleave = function () { row.style.background = 'rgba(255,255,255,0.03)'; row.style.borderColor = '#3a3a55'; };
      // dešinė: REWARDS kolonėlė — rodom TIKRĄ grobį (pot × 50%, kaip serverio CEM_STEAL_PCT;
      //   07-03 user: „ar čia jau įskaičiuota su 50%?" — dabar TAIP) + auksinis ATTACK mygtukas
      var steal = Math.floor(pot * STEAL_PCT * 10) / 10;
      // ⚔️💰 raid fee (10 RONKE → treasury, moka tik puolikas) — rodomas ant mygtuko (localhost dev = nemokamai)
      var _feeLbl = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? '' : '<div style="font-size:7px;margin-top:3px;opacity:0.85;">10 RONKE</div>';
      var actionHtml = shielded
        ? '<div style="padding:8px 11px;border:2px solid #4a9da6;border-radius:4px;background:rgba(74,157,166,0.12);color:#7fd0d8;font-size:8px;white-space:nowrap;" title="Recently raided — protected">🛡 ' + Math.ceil(shMs / 60000) + 'min</div>'
        : '<div style="padding:8px 11px;border:2px solid #ffcf5c;border-radius:4px;background:rgba(255,207,92,0.1);color:#ffcf5c;font-size:8px;white-space:nowrap;text-align:center;" title="Raid fee: 10 RONKE → treasury (paid by attacker)">⚔️ ATTACK' + _feeLbl + '</div>';
      row.innerHTML = '<div style="flex:1;min-width:0;"><div style="color:#c9d4e8;font-size:10px;margin-bottom:3px;">' + shortAddr(addr) + '</div>' +
        '<div style="font-size:8px;color:#6a7a8a;">' + cnt + ' defenders · power ' + Math.round((r.buildings && r.buildings.cemPower) || 0) + '</div></div>' +
        '<div style="text-align:center;margin-right:6px;" title="Wipe ALL defenders to loot 50% of the mined RONKE pot">' +
          '<div style="font-size:7px;color:#6a7a8a;letter-spacing:1px;margin-bottom:3px;">REWARDS</div>' +
          '<div style="color:' + (steal >= 100 ? '#8dffa0' : '#6fcf5c') + ';font-size:12px;' + (steal >= 100 ? 'text-shadow:0 0 10px rgba(111,207,92,0.6);' : '') + '">⛏️ ' + steal.toFixed(1) + '</div>' +
        '</div>' + actionHtml;
      row.onclick = function () {
        if (shielded) { try { if (window.showGameNotification) window.showGameNotification('🛡 SHIELDED', 'This castle was just raided — protected for ' + Math.ceil(shMs / 60000) + ' min.', '#4a9da6'); } catch (_) {} return; }
        doRaid(addr);
      };
      list.appendChild(row);
    });
  }

  function doRaid(addr) {
    closePanel();
    if (window.F9PvpLive && window.F9PvpLive.launchRaid) window.F9PvpLive.launchRaid(addr);
    else { try { if (window.showGameNotification) window.showGameNotification('RAID', 'Raid module not ready', '#f66'); } catch (_) {} }
  }

  function closePanel() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    else if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    overlay = null; panel = null;
  }

  // 07-03: senas plaukiojantis top-right pill'as IŠJUNGTAS — RAID entry point dabar dock'e
  //   (wallet-ui.js ⚔️ mygtukas → window.F9RaidUI.open). Tick liko tik auto-uždaryti panelę išėjus iš home.
  function tick() {
    var show = !!(window.__f9HomeActive && !window.__f9RaidActive && window.F9PvpLive && window.F9PvpLive.launchRaid);
    if (btn) btn.style.display = 'none';
    if (!show && panel) closePanel();
  }
  setInterval(tick, 800);
  if (document.readyState !== 'loading') tick(); else document.addEventListener('DOMContentLoaded', tick);
  window.F9RaidUI = { open: openPanel, close: closePanel, openHistory: openHistory };
})();
