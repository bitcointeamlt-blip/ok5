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
        // 🧪 testinės pilys (E2E fake šablonai: ne-hex arba 10+ vienodų uodega) nerodomos viešoj istorijoj
        var fakeA = function (a) { a = String(a || '').toLowerCase(); return !/^0x[0-9a-f]{40}$/.test(a) || /(.)\1{9,}$/.test(a); };
        return (rows || []).filter(function (r) {
          var b = (r && r.buildings) || {};
          return !fakeA(b.attacker) && !fakeA(b.defender);
        }).map(function (r) {
          var b = (r && r.buildings) || {};
          return {
            match_id: b.matchId || String(r.ronin_address || '').slice(6),
            attacker: b.attacker || '', defender: b.defender || '', winner: b.winner || '',
            atk_survived: (b.atkSurvived | 0), atk_injured: (b.atkInjured | 0), atk_dead: (b.atkDead | 0),
            def_survived: (b.defSurvived | 0), def_injured: (b.defInjured | 0), def_dead: (b.defDead | 0),
            // 🏃 08-23: pasitraukę be nuostolio. Seni įrašai lauko neturi → null ⇒ „DEAD" jiems nerodom
            //    (ten tas skaičius buvo klaidingas: dezertyravus nuimti unitai, o ne prarasti NFT).
            atk_escaped: (b.atkEscaped == null ? null : (b.atkEscaped | 0)),
            def_escaped: (b.defEscaped == null ? null : (b.defEscaped | 0)),
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
      var esc = atk ? m.atk_escaped : m.def_escaped;
      var bones = atk ? m.atk_bones : m.def_bones;
      var army = (sv | 0) + (inj | 0) + (dd | 0) + (esc | 0);
      /* 🏃 08-23 FIX: seni įrašai (esc == null) `dead` lauke turi SUMAIŠYTUS tikrus žuvusius ir tuos,
       * kurie tiesiog buvo nuimti nuo lauko dezertyravus. Rodyti tokį skaičių raudonu „DEAD" reiškia
       * meluoti žaidėjui, kad prarado NFT (žr. match_Mj4IjyRdf: 4 „mirę", o DB — nė vieno). Todėl
       * seniems įrašams skaičių rodom neutraliai ir su paaiškinimu. */
      var legacyDead = (esc == null && (dd | 0) > 0);
      var won = m.winner === role;
      var col = atk ? '#ff9a98' : '#8cd0ff';
      // 📝 07-15 user: adresas TOJE PAČIOJE eilutėje kaip ATTACKER/DEFENDER; statistika ŽODŽIAIS+skaičiais
      //    (be emoji): UNITS / SURVIVED / INJURED / DEAD / BONES LOOT / RONKE LOOT — vietos pakanka.
      function stat(label, val, valCol, title) {
        return '<span style="white-space:nowrap;" title="' + title + '">' + label + ' <span style="color:' + valCol + ';">' + val + '</span></span>';
      }
      // 07-15 user: BONES/RONKE LOOT rodomi VISADA (0 — kai vagystės nebuvo; „—" — seni įrašai be kaulų laukų)
      var lootVal = '0', lootCol = '#e8eef8';
      if (m.loot) { lootVal = (atk ? '+' : '−') + (+m.loot).toFixed(1); lootCol = atk ? '#8dffa0' : '#ff8a88'; }
      var lootHtml = stat('RONKE LOOT', lootVal, lootCol, atk ? "Stolen from defender's mining pot" : 'Stolen by the attacker');
      var bonesVal = bones == null ? '—' : (+bones).toFixed(1);
      var bonesCol = bones == null ? '#6a7a8a' : (bones > 0 ? '#8dffa0' : '#e8eef8');
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
          (legacyDead
            ? stat('LEFT FIELD', (dd | 0), '#8a9aaa', 'Older record: units taken off the field when a player quit. This is NOT a loss — no NFT was destroyed.')
            : stat('DEAD', (dd | 0), (dd | 0) > 0 ? '#ff6b6b' : '#8a9aaa', 'Units permanently lost (NFT burned on-chain)')) +
          (esc != null && (esc | 0) > 0
            ? stat('ESCAPED', (esc | 0), '#8a9aaa', 'Left the field unharmed when the player quit — still in your deck')
            : '') +
          stat('BONES LOOT', bonesVal, bonesCol, 'Bones looted from kills') +
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
  // ⚠️ 08-21 FIX (user: „REWARDS pusę valandos nejuda, nors jis turi didelį power"): formulė buvo PASENUSI —
  //   (a) skaičiavo lauko FRAKCIJĄ iš persistuoto `mineField`, kuris offline žaidėjui dažnai lieka 0 →
  //       frac=0 → rate=0 → pot UŽŠALDAVO (serveris tuo metu realiai kasė!);
  //   (b) power×0.1 be „knee" ir ×0.5 „success" — serveris seniai skaičiuoja kitaip.
  //   Dabar veidrodis serverio `_mineRateFrom` + `_mineFieldStored` (offline = snapshot unitai − sužaloti − mirę).
  //   ⚠️ Ronke Score daugiklis (×1.05…×1.5) čia NEĮSKAIČIUOTAS — svetimo score klientas nežino, tad
  //   rodoma reikšmė yra KUKLIAUSIA (tikras grobis gali būti didesnis).
  function estPot(b, units) {
    if (!b || typeof b !== 'object') return 0;
    var rv = +b.cemRv || 0, wallet = +b.cemWallet || 0;
    var bad = {};
    (Array.isArray(b.injured) ? b.injured : []).forEach(function (i) { if (i && i.tokenId != null) bad[String(i.tokenId)] = 1; });
    (Array.isArray(b.deadUnits) ? b.deadUnits : []).forEach(function (t) { bad[String(t)] = 1; });
    var healthy = 0;
    (Array.isArray(units) ? units : []).forEach(function (u) { if (u && u.tokenId && !/^dev/i.test(String(u.tokenId)) && !bad[String(u.tokenId)]) healthy++; });
    var onF = Math.max(+b.mineField || 0, Math.min(RAID_MIN_DEFENDERS, healthy));   // == serverio _mineFieldStored (offline)
    var pot = +b.minePot || 0;
    var eligible = onF >= RAID_MIN_DEFENDERS && (rv >= 1 || wallet >= 69);
    if (!eligible) return Math.min(1000, pot);
    var safe = b.dutyMode === 'safe';
    var pw = Math.min(+b.cemPower || 0, 4000);
    var powTerm = Math.min(pw, 250) * 0.05 + Math.max(0, pw - 250) * 0.05 * 0.25;    // knee @250 (virš — ¼ tempo)
    var rate = ((safe ? 5 : 10) + powTerm) * (((Number(b.shieldUntil) || 0) > Date.now()) ? 0.5 : 1);
    if (+b.cemTick > 0) pot += rate * Math.max(0, Date.now() - (+b.cemTick)) / 3600000;
    var cap = safe ? Math.max(200, +b.mineCheckpoint || 200) : 1000;                 // SAFE stoja ties checkpoint; DUTY — 1000 stogas
    return Math.min(cap, pot);
  }
  var STEAL_PCT = 0.5;   // == serverio MINE_STEAL_PCT — 100% wipe atveju puolikas gauna 50% poto
  var RAID_MIN_DEFENDERS = 12;   // == serverio RAID_FIELD_REQ (F9PvpRoom) — ta pati riba kaip kasimo
  /* ⏲ POROS COOLDOWN (2026-09-04) == serverio RAID_CD_MS. Pilis, kurią TU neseniai puolei, tau
   * NERODOMA — anksčiau ji kabėdavo sąraše ir tik paspaudus mesdavo „RAID_COOLDOWN:Nmin".
   * Kitiems žaidėjams ji matoma normaliai: būtent tai ir yra jų proga. */
  var RAID_CD_MS = 2 * 3600000;
  function cdLeftMs(r, me) {
    var cd = (r && r.buildings && r.buildings.raidCd) || {};
    var at = Number(cd[String(me || '').toLowerCase()]) || 0;
    if (!at) return 0;
    return Math.max(0, RAID_CD_MS - (Date.now() - at));
  }
  function onCooldown(r, me) { return cdLeftMs(r, me) > 0; }
  function cdText(ms) {
    var m = Math.ceil(ms / 60000);
    return m >= 60 ? (Math.floor(m / 60) + 'h ' + (m % 60) + 'm') : (m + ' min');
  }
  /* ⏲ VIENAS SARGAS VISIEMS KELIAMS. Sąrašas filtruoja pats, bet į raidą veda dar DU keliai, kurie
   * sąrašo neliečia: rankinis adreso įvedimas („Or enter a wallet address") ir KVIETIMO NUORODA
   * (game.js `bootRaidInvite`). Be šito jie apeitų cooldown'ą, o žaidėjas gautų serverio klaidą tik
   * PO to, kai jau paspaudė. Grąžina 0 = galima pulti. */
  function raidCooldownLeft(addr) {
    var me = String(myAddr() || '').toLowerCase(), t = String(addr || '').trim().toLowerCase();
    if (!me || !/^0x[0-9a-f]{40}$/.test(t)) return Promise.resolve(0);
    var url = SUPABASE_URL + '/rest/v1/f9_bases?select=ronin_address,buildings&ronin_address=eq.' + t + '&limit=1';
    return fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { return cdLeftMs((rows && rows[0]) || null, me); })
      .catch(function () { return 0; });   // DB nepasiekiamas → neblokuojam, serveris vis tiek atmes
  }
  try { window.F9RaidCooldown = { left: raidCooldownLeft, text: cdText, ms: RAID_CD_MS }; } catch (_) {}
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
      if (!/^0x[0-9a-f]{40}$/.test(a) || /(.)\1{9,}$/.test(a)) return false;   // 🧹 07-17: fake/test adresai (E2E likučiai: ne-40-hex ARBA 10+ vienodų uodega) NErodomi
      // 🛡 SAFE pilys NEPUOLAMOS (user taisyklė 08-20: „kasi iki 200 — niekas nepuola, esi nematomas").
      //   Nori kasti toliau → jungiesi DUTY ir tada esi taikinys. Serveris tikrina tą patį (_dutySafeGate).
      if (r.buildings && r.buildings.dutyMode === 'safe') return false;
      if (onCooldown(r, me)) return false;   // ⏲ ką tik puoliau šitą pilį → man jos nerodo (kitiems rodo)
      // ⚔️🛡 08-14 (user): VIENA riba — „neturi 12 unitų pilyje → nekasi IR tavęs niekas negali pulti".
      //   Buvo >=1: pilys be kasyklos (grobis 0.0) vis tiek listinamos → puolikas pelnydavo kaulais, naujokas
      //   gaudavo unitus į ligoninę už dyką. Serveris enforce'ina tą patį (RAID_FIELD_REQ, NO_DEFENDERS).
      return combatReady(r) >= RAID_MIN_DEFENDERS;
    });
    var cntEl = panel && panel.querySelector('#f9raid-counter');
    if (cntEl) cntEl.textContent = '🏰 ' + rows.length;
    if (!rows.length) {
      list.innerHTML = '<div style="color:#6a7a8a;font-size:9px;line-height:1.7;padding:8px 0;">No raidable castles right now. Only castles with <b style="color:#c9d4e8;">' + RAID_MIN_DEFENDERS + '+ units on the field</b> (the ones actually mining RONKE) can be raided.</div>';
      return;
    }
    rows.forEach(function (r) { r._pot = estPot(r.buildings, r.units); });
    rows.sort(function (a, b) { return b._pot - a._pot; });   // riebiausios kapinės viršuje — rinkis auką!
    list.innerHTML = '';
    rows.forEach(function (r) {
      var addr = String(r.ronin_address || '');
      var cnt = combatReady(r);   // M7: kovai pajėgūs (ne raw snapshot)
      var pot = r._pot || 0;
      // 🛡 SHIELD: ką tik nusiaubta pilis — nepuolama iki shieldUntil (serveris vis tiek atmes; čia UX)
      var shMs = Math.max(0, (Number(r.buildings && r.buildings.shieldUntil) || 0) - Date.now());
      var shielded = shMs > 0;
      // 🫀 ONLINE: gynėjas prie ekrano (heartbeat <90s) → puolimas bus GYVA kova prieš jį (ne AI). Informatyvu, NEblokuoja.
      var online = (Date.now() - (Number(r.buildings && r.buildings.ownerSeenAt) || 0)) < 90000;
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
      row.innerHTML = '<div style="flex:1;min-width:0;"><div style="color:#c9d4e8;font-size:10px;margin-bottom:3px;">' + shortAddr(addr) + (online && !shielded ? ' <span style="font-size:7px;color:#7ab8e8;border:1px solid #2a5a8a;border-radius:3px;padding:1px 4px;" title="Defender is online — this will be a LIVE fight against them">🫀 LIVE</span>' : '') + '</div>' +
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
    /* ⏲ Rankinis įvedimas sąrašo filtro neliečia — tikrinam čia. */
    raidCooldownLeft(addr).then(function (ms) {
      if (ms > 0) {
        try { if (window.showGameNotification) window.showGameNotification('⏲ ALREADY FOUGHT',
          'You already raided this castle — find another opponent, or wait ' + cdText(ms) + '.', '#ffcf5c'); } catch (_) {}
        return;
      }
      _doRaidNow(addr);
    });
  }
  function _doRaidNow(addr) {
    closePanel();
    if (window.F9PvpLive && window.F9PvpLive.launchRaid) window.F9PvpLive.launchRaid(addr);
    else { try { if (window.showGameNotification) window.showGameNotification('RAID', 'Raid module not ready', '#f66'); } catch (_) {} }
  }

  function closePanel() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
    // ⚔️🔔 pažiūrėjai sąrašą → 2 min tylos (po to vėl primins, jei taikinių tebėra)
    try {
      _snoozeUntil = Date.now() + SNOOZE_MS;
      if (_shakeLoopT) { clearInterval(_shakeLoopT); _shakeLoopT = null; }
      if (_shakeT) { clearTimeout(_shakeT); _shakeT = null; }
      var _rb = _raidBtnEl(); if (_rb) _rb.classList.remove('f9-raid-shake');
    } catch (_) {}
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    else if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    overlay = null; panel = null;
  }

  // ── ⚔️🔔 GYVO TAIKINIO SARGYBA (08-21 user) — kai atsiranda NAUJAS online taikinys, dock'o ⚔️ RAID
  //    ženkliukas suvirpa (kaip 🧱 TETRIS mygtukas, kai kažkas laukia varžovo: 3 virptelėjimai ~4.5s).
  //    Tikrinam kas 60s TIK savo pilyje + kai skirtukas matomas + panelė uždaryta (atidaręs jau matai pats).
  //    Pirmas ciklas = bazinė linija (nevirpa) — kitaip virptelėtų kiekvieną kartą įėjus į pilį.
  var _liveSeen = null, _liveTimer = null, _shakeT = null, _shakeLoopT = null;
  var REMIND_MS = 25000;      // kol sąraše yra ką pulti — primename kas ~30s (kiekvieną skenavimo ciklą)
  var SNOOZE_MS = 120000;     // ką tik žiūrėjai sąrašą → 2 min tylos, kad neerzintų
  var _snoozeUntil = 0;
  function _raidBtnEl() { try { return document.getElementById('wui-raid-btn'); } catch (_) { return null; } }
  function _shakeCss() {
    if (document.getElementById('f9-raid-shake-css')) return;
    var st = document.createElement('style'); st.id = 'f9-raid-shake-css';
    st.textContent = '@keyframes f9RaidShake{0%,60%,100%{transform:rotate(0)}6%{transform:rotate(-7deg)}14%{transform:rotate(7deg)}22%{transform:rotate(-5deg)}30%{transform:rotate(5deg)}38%{transform:rotate(-3deg)}46%{transform:rotate(3deg)}54%{transform:rotate(0)}}' +
      '.f9-raid-shake{animation:f9RaidShake 1.5s ease-in-out 3;transform-origin:center bottom;}';
    document.head.appendChild(st);
  }
  function _shakeRaidBtn() {
    var b = _raidBtnEl(); if (!b || b.style.display === 'none') return;
    _shakeCss();
    b.classList.remove('f9-raid-shake'); void b.offsetWidth;   // restart animaciją
    b.classList.add('f9-raid-shake');
    if (_shakeT) clearTimeout(_shakeT);
    _shakeT = setTimeout(function () { var e = _raidBtnEl(); if (e) e.classList.remove('f9-raid-shake'); }, 4700);
  }
  // Ar eilutė = PUOLAMAS taikinys — TIE PATYS filtrai kaip renderList (be online reikalavimo!).
  //   ⚠️ 08-21 fix: anksčiau reikalavom ir `ownerSeenAt < 90s` (savininkas prie ekrano) — tokių praktiškai
  //   nebūna (matuota: 200 pilių → 14 puolamų, bet 0 online), todėl ženkliukas nevirpėdavo NIEKADA.
  //   Dabar praneša apie bet kokį naują taikinį sąraše; online tik sustiprina (kartojam priminimą).
  function _isRaidTarget(r, me) {
    var a = String(r.ronin_address || '').toLowerCase();
    if (!a || a === me || a.indexOf('#') >= 0) return false;
    if (!/^0x[0-9a-f]{40}$/.test(a) || /(.)\1{9,}$/.test(a)) return false;
    var b = r.buildings || {};
    if (b.dutyMode === 'safe') return false;
    if (onCooldown(r, myAddr())) return false;                          // ⏲ poros cooldown — man nematoma
    if ((Number(b.shieldUntil) || 0) > Date.now()) return false;        // po skydu — nepuolamas
    return combatReady(r) >= RAID_MIN_DEFENDERS;                        // 12+ lauke = puolamas
  }
  function _isOnline(r) { return (Date.now() - (Number((r.buildings || {}).ownerSeenAt) || 0)) < 90000; }
  function _liveScan() {
    if (!window.__f9HomeActive || window.__f9RaidActive || document.hidden || panel) return;   // panelė atidaryta → matai pats
    if (!myAddr()) return;
    fetchCastles().then(function (rows) {
      var me = myAddr();
      var now = new Set(), anyOnline = false;
      (rows || []).forEach(function (r) {
        if (!_isRaidTarget(r, me)) return;
        now.add(String(r.ronin_address).toLowerCase());
        if (_isOnline(r)) anyOnline = true;
      });
      var fresh = 0;
      now.forEach(function (a) { if (!_liveSeen || !_liveSeen.has(a)) fresh++; });   // pirmas ciklas: VISI = nauji
      _liveSeen = now;
      try { if (window.__f9RaidDebug) console.log('[RaidWatch] taikinių:', now.size, '| naujų:', fresh, '| online:', anyOnline, '| snooze:', Math.max(0, Math.round((_snoozeUntil - Date.now()) / 1000)) + 's'); } catch (_) {}
      // ⚔️🔔 08-21 (user: „matau taikinį, o mygtukas nevirpa"): virpam ne tik dėl NAUJŲ — kol sąraše
      //   apskritai yra ką pulti, primenam periodiškai (kaip tetris mygtukas, kol kažkas laukia varžovo).
      //   NAUJAS taikinys → iškart. Priminimas → kas REMIND_MS. Atsidarius sąrašą → tyla SNOOZE_MS.
      if (!now.size) { if (_shakeLoopT) { clearInterval(_shakeLoopT); _shakeLoopT = null; } return; }
      if (fresh > 0) { _snoozeUntil = 0; _shakeRaidBtn(); _snoozeUntil = Date.now() + REMIND_MS; return; }
      if (Date.now() >= _snoozeUntil) { _shakeRaidBtn(); _snoozeUntil = Date.now() + REMIND_MS; }
    }).catch(function (e) { try { if (window.__f9RaidDebug) console.warn('[RaidWatch] klaida:', e); } catch (_) {} });
  }
  _liveTimer = setInterval(_liveScan, 30000);
  setTimeout(_liveScan, 4000);   // netrukus po įėjimo: jau esantys taikiniai irgi praneša

  // 07-03: senas plaukiojantis top-right pill'as IŠJUNGTAS — RAID entry point dabar dock'e
  //   (wallet-ui.js ⚔️ mygtukas → window.F9RaidUI.open). Tick liko tik auto-uždaryti panelę išėjus iš home.
  function tick() {
    var show = !!(window.__f9HomeActive && !window.__f9RaidActive && window.F9PvpLive && window.F9PvpLive.launchRaid);
    if (btn) btn.style.display = 'none';
    if (!show && panel) closePanel();
  }
  setInterval(tick, 800);
  if (document.readyState !== 'loading') tick(); else document.addEventListener('DOMContentLoaded', tick);
  // shake()/scan() — rankinis patikrinimas iš konsolės (F9RaidUI.shake() turi supurtyti ⚔️ iškart);
  //   __f9RaidDebug = true → scan'as rašo į konsolę, kiek gyvų taikinių randa.
  window.F9RaidUI = { open: openPanel, close: closePanel, openHistory: openHistory, shake: _shakeRaidBtn, scan: _liveScan };
})();
