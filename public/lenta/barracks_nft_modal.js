// NFT Barracks Modal controller — UI logic + state polling.
// Depends on window.BarracksNFT (barracks_nft.js) and window.Wallet.

(function() {
  'use strict';

  let selectedUtype = 1;
  let stateRefreshInterval = null;
  let pendingTimer = null;
  let modalOpen = false;

  // ─── Open / Close ──────────────────────────────────────────
  function openModal() {
    const modal = document.getElementById('nft-barracks-modal');
    if (!modal) return;
    modal.classList.add('active');
    modalOpen = true;
    _invShowAll = false;   // atidarius modalą — visada deck-only (registruotas dekas → užrakinta). Edit režimas laikinas.
    selectUnit(selectedUtype);
    refreshAll();
    if (!stateRefreshInterval) stateRefreshInterval = setInterval(refreshAll, 12000);
    // Grįžus į tab'ą (mobiliam po wallet pasirašymo) — iškart atnaujinam būseną
    if (!_visBound) {
      _visBound = true;
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && modalOpen) { refreshAll(); setTimeout(refreshAll, 2000); }
      });
    }
  }
  let _visBound = false;
  function closeModal() {
    const modal = document.getElementById('nft-barracks-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modalOpen = false;
    if (stateRefreshInterval) { clearInterval(stateRefreshInterval); stateRefreshInterval = null; }
    if (pendingTimer) { clearInterval(pendingTimer); pendingTimer = null; }
    // Jei modal'as buvo atidarytas kaip F12 pre-battle picker IR vartotojas
    // uždarė be DEPLOY (X arba backdrop) — atšaukiam F12 entry, grąžinam į F10/F11.
    try {
      const S = window.S;
      if (S && S.floor === 12 && !_battleDeployFlow) {
        // Nebuvo DEPLOY → reiškia user cancel'ino picker'į
        if (typeof window.gotoF10 === 'function') window.gotoF10();
      }
    } catch (_) {}
    _battleDeployFlow = false;
  }

  function setStatus(msg, type) {
    const el = document.getElementById('nft-status');
    if (!el) return;
    el.className = 'nft-status' + (type ? ' ' + type : '');
    el.innerHTML = msg;
  }
  function txLink(hash) {
    return `<a href="https://explorer.roninchain.com/tx/${hash}" target="_blank">${hash.slice(0,12)}...</a>`;
  }

  // ─── Tab switching ─────────────────────────────────────────
  function bindTabs() {
    document.querySelectorAll('.nft-tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.nft-tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.nft-tab-panel').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById('nft-tab-' + t.dataset.tab).classList.add('active');
        if (t.dataset.tab === 'inventory') { _invShowAll = false; refreshInventory(); _maybeShowRonkeIntro(); }   // grįžus į inventorių — visada deck-only (užrakinta jei registruota)
        else if (t.dataset.tab === 'battle') refreshBattlePicker();
      };
    });
  }

  // ─── RONKE Power intro popup ───────────────────────────────────
  // Rodom atidarius Inventory, NEBENT žaidėjas pažymėjo „Don't show again" (localStorage).
  var _RPWR_INTRO_KEY = 'rpwr_intro_dismissed';
  function _maybeShowRonkeIntro() {
    return;   // 🚫 RONKE POWER intro lentutė IŠJUNGTA (user 2026-07-04 — neberodyti iš viso)
    // eslint-disable-next-line no-unreachable
    try { if (localStorage.getItem(_RPWR_INTRO_KEY) === '1') return; } catch (_) {}
    var el = document.getElementById('rpwr-intro');
    if (!el) return;
    el.style.display = 'flex';
    if (!el._wired) {
      el._wired = true;
      var close = function () {
        try {
          var cb = document.getElementById('rpwr-intro-dontshow');
          if (cb && cb.checked) localStorage.setItem(_RPWR_INTRO_KEY, '1');
        } catch (_) {}
        el.style.display = 'none';
      };
      var okB = document.getElementById('rpwr-intro-ok'); if (okB) okB.onclick = close;
      var xB = document.getElementById('rpwr-intro-x'); if (xB) xB.onclick = close;
      el.onclick = function (e) { if (e.target === el) close(); };   // klik už kortelės ribų
    }
  }

  // ─── BATTLE / DEPLOY tab ────────────────────────────────────
  // Inventoriaus picker — pasirink kelis NFT + free units, paspaudus DEPLOY → F12 startas.
  // utype (contract uint8) → F12 utype string:
  const NFT_UTYPE_TO_F12 = { 1: 'skull', 2: 'archer', 3: 'harpoon_fish', 4: 'shaman', 5: 'hog_rider', 6: 'ghost', 7: 'ronhood' };
  // F12 ALLY base statai — TURI sutapti su floor12_merge.js ALLY_STATS. Rodom kortelėj DMG/HP.
  const _F12_BASE_STATS = {
    skull:        { hp: 8,  dmg: 2 },
    archer:       { hp: 5,  dmg: 3 },
    shaman:       { hp: 5,  dmg: 4 },
    harpoon_fish: { hp: 7,  dmg: 3 },
    hog_rider:    { hp: 14, dmg: 8 },
    ghost:        { hp: 4,  dmg: 4 },   // utype 6 — RARE ranged spectral caster (mažiau HP nei shaman, tolimesnis range)
    ronhood:      { hp: 7,  dmg: 3 },   // utype 7 — RARE archer-tipas (+2 HP, trumpesnis range, +10% atk speed, 1% crit ×2)
  };
  // Lygio skalė: PIRMI 2 LYGIAI NIEKO, tada stat = round(base × (1 + floor((level-2)/2)×0.05)) — kas 2 lvl.
  // TURI sutapti su _nftStatMul() žaidime (floor12_merge.js). RONKE Power irgi pirmi 2 lvl nieko, bet kas lvl.
  function _unitCombatStats(contractUtype, level) {
    const base = _F12_BASE_STATS[NFT_UTYPE_TO_F12[contractUtype]] || _F12_BASE_STATS.skull;
    const mul = 1 + Math.floor(Math.max(0, (level | 0) - 2) / 2) * 0.05;
    return { hp: Math.max(1, Math.round(base.hp * mul)), dmg: Math.max(1, Math.round(base.dmg * mul)) };
  }
  // Module-level power helper'iai (naudoja ir inventory, ir battle grid).
  function _powerRateOf(utype) { const u = Number(utype); return u === 5 ? 15 : u === 6 ? 16 : u === 7 ? 12 : 10; }
  function _unitPowerOf(level, utype) { return Math.max(0, (Number(level) || 0) - 1) * _powerRateOf(utype); }  // power nuo lvl 2
  // Ability statai — TURI sutapti su floor12_merge.js (block/crit/miss/CD/range). Rodom kortos „nugaroj".
  const _F12_ABILITY = {
    skull:        { role: 'Melee Bruiser',  atk: 'Melee',     range: 'Short',  cd: 1500, move: 12, crit: 0,    block: 0.25, miss: 0.10, aoe: false },
    archer:       { role: 'Ranged DPS',     atk: 'Ranged',    range: 'Long',   cd: 2500, move: 14, crit: 0,    block: 0,    miss: 0.15, aoe: false },
    harpoon_fish: { role: 'Ranged Piercer', atk: 'Ranged',    range: 'Medium', cd: 1800, move: 11, crit: 0,    block: 0,    miss: 0.05, aoe: false },
    shaman:       { role: 'Ranged Caster',  atk: 'Ranged',    range: 'Long',   cd: 3000, move: 10, crit: 0,    block: 0,    miss: 0.05, aoe: true  },
    hog_rider:    { role: 'Cavalry Tank',   atk: 'Melee AOE', range: 'Short',  cd: 2800, move: 13, crit: 0.10, block: 0,    miss: 0.05, aoe: true  },
    ghost:        { role: 'Spectral Caster', atk: 'Ranged',   range: 'Long',   cd: 3000, move: 11, crit: 0,    block: 0,    miss: 0.05, aoe: false },
    ronhood:      { role: 'Ranged DPS',     atk: 'Ranged',    range: 'Medium', cd: 2250, move: 14, crit: 0.01, block: 0,    miss: 0.11, aoe: false },
  };
  // Kortos NUGAROS statai — VISI bar-linijų stiliumi (neaktyvūs pilki + „—"). cStats = {dmg,hp} pagal lygį.
  function _backStatBars(ab, cStats) {
    function bar(icon, label, val, pct, active, color) {
      const w = active ? Math.max(6, Math.min(100, pct)) : 0;
      return `<div class="nft-bb ${active ? 'on' : 'off'}"><span class="nft-bb-l">${icon} ${label}</span><div class="nft-bb-bar"><div class="nft-bb-f" style="width:${w}%;background:${color}"></div></div><span class="nft-bb-v">${val}</span></div>`;
    }
    const rangePct = ab.range === 'Long' ? 100 : ab.range === 'Medium' ? 62 : 34;
    const atkSpdPct = (3500 - ab.cd) / (3500 - 1000) * 100;
    return ''
      + bar('⚔', 'DMG', cStats.dmg, cStats.dmg / 16 * 100, true, 'linear-gradient(90deg,#c8602e,#ff9a6e)')
      + bar('❤', 'HP', cStats.hp, cStats.hp / 30 * 100, true, 'linear-gradient(90deg,#3fa84f,#7cd97a)')
      + bar('👟', 'MOVE', ab.move, ab.move / 16 * 100, true, 'linear-gradient(90deg,#3a7bd5,#6fb1ff)')
      + bar('⏱', 'ATK SP', (ab.cd / 1000).toFixed(1) + 's', atkSpdPct, true, 'linear-gradient(90deg,#8a5fd0,#b89aff)')
      + bar('🎯', 'RANGE', ab.range, rangePct, true, 'linear-gradient(90deg,#c89a2e,#ffd66e)')
      + bar('⚡', 'CRIT', ab.crit > 0 ? Math.round(ab.crit * 100) + '%' : '—', ab.crit / 0.25 * 100, ab.crit > 0, 'linear-gradient(90deg,#d4a017,#ffd54a)')
      + bar('🛡', 'BLOCK', ab.block > 0 ? Math.round(ab.block * 100) + '%' : '—', ab.block / 0.30 * 100, ab.block > 0, 'linear-gradient(90deg,#3a8d96,#6fd0d8)')
      + bar('💨', 'MISS', ab.miss > 0 ? Math.round(ab.miss * 100) + '%' : '—', ab.miss / 0.20 * 100, ab.miss > 0, 'linear-gradient(90deg,#8a8a8a,#c4c4c4)')
      + bar('💥', 'AOE', ab.aoe ? 'YES' : '—', ab.aoe ? 100 : 0, ab.aoe, 'linear-gradient(90deg,#d23b3b,#ff8a6a)');
  }
  // „Korta nuskrenda į deką" animacija — ghost sprite'as (nepriklausomas nuo grid re-render).
  function _flyCardToDeck(card) {
    try {
      const img = (card.querySelector('.nft-card-img-wrap img') || card.querySelector('img'));
      if (!img) return;
      const r = img.getBoundingClientRect();
      const deckEl = document.getElementById('nft-deck-register');
      const dr = deckEl ? deckEl.getBoundingClientRect() : null;
      const tx = dr && dr.width ? (dr.left + dr.width / 2) : (window.innerWidth / 2);
      const ty = dr && dr.width ? (dr.top + dr.height / 2) : (r.top - 140);
      const ghost = img.cloneNode(true);
      ghost.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;z-index:100000;pointer-events:none;image-rendering:pixelated;transition:transform .55s cubic-bezier(.5,-0.25,.3,1),opacity .5s ease-in;will-change:transform,opacity;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5));';
      document.body.appendChild(ghost);
      requestAnimationFrame(function () {
        const dx = tx - (r.left + r.width / 2);
        const dy = ty - (r.top + r.height / 2);
        ghost.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.14) rotate(18deg)';
        ghost.style.opacity = '0.12';
      });
      setTimeout(function () { try { ghost.remove(); } catch (_) {} }, 620);
      // Subtilus „bump" (NE 1.35 — didelei lentutei būtų per stipru). Lengvas pulsas.
      if (deckEl) { deckEl.style.transition = 'transform .18s ease'; deckEl.style.transform = 'scale(1.03)'; setTimeout(function () { deckEl.style.transform = ''; }, 200); }
    } catch (_) {}
  }
  let _battleInventory = [];   // raw fetchInventory rezultatas
  let _battlePickQty = {};     // {groupKey: qty}
  let _battleFreeQty = { shadow: 1, arrow: 1, heart: 1, leaf: 1, spectral: 1, royal: 1 };  // {ballType: qty} default 1 of each
  const BATTLE_MAX_TOTAL = 12;
  // FREE unitu sąrašas — match'ina NFT 4 tipus per ball type
  const FREE_UNITS = [
    { ballType: 'shadow', utype: 'skull',        name: 'Skull',   icon: 'unit-images/skull-idle.gif' },
    { ballType: 'arrow',  utype: 'archer',       name: 'Archer',  icon: 'unit-images/archer-idle.gif' },
    { ballType: 'heart',  utype: 'shaman',       name: 'Shaman',  icon: 'unit-images/shaman-idle.gif' },
    { ballType: 'leaf',   utype: 'harpoon_fish', name: 'Harpoon', icon: 'unit-images/harpoon-idle.gif' },
    { ballType: 'spectral', utype: 'ghost',      name: 'Ghost',   icon: 'unit-images/ghost-idle.png' },
    { ballType: 'royal',  utype: 'ronhood',      name: 'RonkeHood', icon: 'unit-images/ronhood-idle.png' },
  ];
  const FREE_MAX_PER_TYPE = 5;
  const NFT_MAX_PER_TYPE = 4;   // 4× max per unit tipą (sutampa su floor12 _NFT_MAX_PER_TYPE)
  let _battleMode = 'free';   // 'free' arba 'nft' — exclusive
  let _battleUseDeck = true;   // jei deck'as netuščias — kraunam TIK jį (instant, jokio RPC skeno)
  let _invShowAll = false;     // INVENTORY: false = TIK dekas (greitai, registracijos esmė); true = pilnas skenas (PASIRINKIMAS, naujų unitų pridėjimui)
  let _invLoadCdUntil = 0;     // load mygtuko cooldown (anti-spam, 3s) — timestamp iki kada užšaldyta

  function _setBattleMode(mode) {
    _battleMode = (mode === 'nft') ? 'nft' : 'free';
    // Tab visuals
    const tFree = document.getElementById('nft-mode-tab-free');
    const tNft = document.getElementById('nft-mode-tab-nft');
    if (tFree) tFree.classList.toggle('active', _battleMode === 'free');
    if (tNft) tNft.classList.toggle('active', _battleMode === 'nft');
    // Panel visibility
    const pFree = document.getElementById('nft-mode-panel-free');
    const pNft = document.getElementById('nft-mode-panel-nft');
    if (pFree) pFree.classList.toggle('active', _battleMode === 'free');
    if (pNft) pNft.classList.toggle('active', _battleMode === 'nft');
    _updateBattleFooter();
  }

  function _battleGroupKey(u) {
    // Deck mode → kiekvienas unitas atskira korta (be stacking); kitaip stack'inam identiškus.
    if (_battleUseDeck) return String(u.tokenId);
    return `${u.utype}|${u.xp}|${u.level}|${u.battles}|${u.wins}|${u.kills}`;
  }

  function _battleGroups() {
    const groups = new Map();
    for (const u of _battleInventory) {
      const k = _battleGroupKey(u);
      if (!groups.has(k)) groups.set(k, { ...u, ids: [u.tokenId], count: 1, key: k });
      else { const g = groups.get(k); g.ids.push(u.tokenId); g.count++; }
    }
    const arr = Array.from(groups.values());
    arr.sort((a, b) => {
      if (a.xp !== b.xp) return b.xp - a.xp;
      return Number(b.ids[0]) - Number(a.ids[0]);
    });
    return arr;
  }

  function _battleTotalPicked() {
    let n = 0;
    for (const k in _battlePickQty) n += (_battlePickQty[k] | 0);
    return n;
  }
  // Kiek pasirinkta to paties utype unitų (per-tipą cap 4× tikrinimui).
  function _battleTypeCount(utype) {
    let n = 0;
    for (const g of _battleGroups()) if (Number(g.utype) === Number(utype)) n += (_battlePickQty[g.key] | 0);
    return n;
  }
  // Trumpas įspėjimo „toast" (pvz. viršijus cap).
  let _battleToastTimer = null;
  function _battleToast(msg) {
    let el = document.getElementById('nft-battle-toast');
    if (!el) { el = document.createElement('div'); el.id = 'nft-battle-toast'; el.className = 'nft-battle-toast'; document.body.appendChild(el); }
    el.textContent = '⚠ ' + msg;
    el.classList.add('show');
    if (_battleToastTimer) clearTimeout(_battleToastTimer);
    _battleToastTimer = setTimeout(function () { el.classList.remove('show'); }, 1900);
  }
  // Battle pasirinkimas (_battlePickQty) → IŠSAUGOM į squad (localStorage), kad persist'intų tarp sesijų.
  function _persistBattleSquad() {
    try {
      const W = window.Wallet, BNFT = window.BarracksNFT;
      if (!W || !BNFT || !BNFT.setBattleSquad) return;
      const ids = [];
      for (const g of _battleGroups()) {
        const q = _battlePickQty[g.key] | 0;
        for (let i = 0; i < q && i < g.ids.length; i++) ids.push(String(g.ids[i]));
      }
      BNFT.setBattleSquad(W.getAddress(), ids);
    } catch (_) {}
  }
  // Battle squad (anksčiau pasirinkti kovos unitai) → AUTO-pasirenka battle picker'yje atidarius.
  function _preselectSquad() {
    try {
      const W = window.Wallet, BNFT = window.BarracksNFT;
      if (!W || !BNFT || !BNFT.getBattleSquad) return;
      // 🛡 07-06: pirmenybė TIKRAM pilies laukui (window._f9OnField) — kad picker'io „🛡 ON FIELD" sutaptų su
      //   inventoriaus žyme IR realiu garnizonu (net jei battle squad tuščias / laukas auto-užsipildė iš deko).
      //   Fallback (ne pilyje / nėra lauko info) → išsaugotas battle squad (localStorage).
      const squad = (window.__f9HomeActive && window._f9OnField instanceof Set && window._f9OnField.size)
        ? Array.from(window._f9OnField).map(String)
        : BNFT.getBattleSquad(W.getAddress()).map(String);
      if (!squad.length) return;
      _battlePickQty = {};
      let total = 0;
      const _perType = {};   // 🐛 M2 fix: preselect'as irgi laikosi 4×/tipo cap (laukas deko-tvarka gali turėti >4 vieno tipo — F12 tiek nedeploy'ins)
      for (const g of _battleGroups()) {
        let cnt = 0;
        for (const id of g.ids) {
          if (total >= BATTLE_MAX_TOTAL) break;
          if ((_perType[g.utype] | 0) >= NFT_MAX_PER_TYPE) break;
          if (squad.indexOf(String(id)) !== -1) { cnt++; total++; _perType[g.utype] = (_perType[g.utype] | 0) + 1; }
        }
        if (cnt > 0) _battlePickQty[g.key] = cnt;
      }
    } catch (_) {}
  }
  function _battleFreeTotal() {
    let n = 0;
    for (const k in _battleFreeQty) n += (_battleFreeQty[k] | 0);
    return n;
  }
  function _renderFreeGrid() {
    const grid = document.getElementById('nft-battle-free-grid');
    if (!grid) return;
    grid.innerHTML = FREE_UNITS.map(u => {
      const cnt = _battleFreeQty[u.ballType] | 0;
      return `<div class="nft-battle-card ${cnt > 0 ? 'is-picked' : ''}" data-key="free-${u.ballType}">
        <img class="nft-battle-img" src="${u.icon}" alt="${u.name}">
        <div class="nft-battle-info">
          <div class="nft-battle-name">${u.name.toUpperCase()}</div>
          <div class="nft-battle-meta">FREE · no XP gain · no burn risk</div>
        </div>
        <div class="nft-battle-ctrls">
          <button class="nft-battle-free-minus" data-bt="${u.ballType}" type="button">−</button>
          <span class="nft-battle-count">${cnt}</span>
          <button class="nft-battle-free-plus" data-bt="${u.ballType}" type="button">+</button>
        </div>
      </div>`;
    }).join('');
  }

  async function _checkWalletAcct() {
    const banner = document.getElementById('nft-battle-acct-banner');
    const msgEl = banner ? banner.querySelector('.nft-battle-acct-msg') : null;
    if (!banner || !msgEl) return null;
    const W = window.Wallet;
    if (!W || !W.refreshActiveAccount) { banner.style.display = 'none'; return null; }
    const r = await W.refreshActiveAccount();
    if (!r.ok) { banner.style.display = 'none'; return r; }
    if (r.mismatch) {
      const shortReg = r.registered ? r.registered.slice(0, 6) + '…' + r.registered.slice(-4) : '?';
      const shortCur = r.currentAddress.slice(0, 6) + '…' + r.currentAddress.slice(-4);
      msgEl.innerHTML = '⚠️ <strong>Wallet account switched!</strong><br>'
        + 'App is connected as <strong>' + shortReg + '</strong> but your wallet is now active as <strong>' + shortCur + '</strong>.<br>'
        + 'Sign would fail. Click below to switch app to <strong>' + shortCur + '</strong>, or switch your wallet back to ' + shortReg + '.';
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
    return r;
  }

  async function _onReconnectAcct() {
    const W = window.Wallet;
    if (!W) return;
    try {
      if (W.disconnect) W.disconnect();
      // Trigger fresh connect (parodys wallet popup'ą kad pasirinktum account)
      if (W.connect) {
        await W.connect();
        await refreshBattlePicker();
      }
    } catch (e) {
      alert('Reconnect failed: ' + (e.message || e));
    }
  }

  // ─── 🏥 LIGONINĖS UŽRAKTAS (07-04 user: „sužeisti užrakinti IR kamuoliukų mode — unitus labiau vertintų") ───
  // Pilies mūšiuose sužeisti NFT negali kautis ir F12: filtruojam iš battle picker'io.
  // Šaltinis: gyva F9 scena (window._f9Hospital — serveris prune'ina) ARBA f9_bases REST (F12 be pilies).
  // REST kelias konservatyvus: pasveikęs, bet dar ne-prune'intas unitas liks užrakintas iki apsilankymo
  // pilyje (staleness saugia kryptim). Cache 60s.
  let _hospLock = { at: 0, addr: '', set: null };
  let _battleHospN = 0;
  let _invInjured = new Set();   // 🏥 INVENTORY tab'ui — kurie tokenId gydosi (badge ant kortelių)
  let _invNewBought = new Set();  // 🆕 ką tik nupirkti marketplace'e (48h) — badge, kad žaidėjas rastų naują unitą
  let _invDead = new Set();      // 💀 permadead (buildings.deadUnits) — slepiami VISUR (žaisti nebegali)
  // 🏥💀 07-05: deleguojam į BENDRĄ šaltinį (BarracksNFT.fetchHospState) — inventorius, battle picker
  //   ir visos kitos vietos mato TĄ PATĮ injured/dead (jokių savų fetch'ų/kešų → jokių nesutapimų).
  function _fetchInjuredSet(addr) {
    addr = String(addr || '').toLowerCase();
    if (!addr) return Promise.resolve(new Set());
    const BN = window.BarracksNFT;
    if (BN && BN.fetchHospState) {
      return BN.fetchHospState(addr).then(function (st) {
        _invDead = st.dead || new Set();
        const s = st.inj || new Set();
        _hospLock = { at: Date.now(), addr: addr, set: s };
        return s;
      }).catch(function () { return _hospLock.set || new Set(); });
    }
    return Promise.resolve(_hospLock.set || new Set());
  }
  function _applyHospitalLock(inv, injSet) {
    _battleHospN = 0;
    if (!injSet || !injSet.size || !Array.isArray(inv)) return inv;
    const out = [];
    for (let i = 0; i < inv.length; i++) {
      if (injSet.has(String(inv[i].tokenId))) _battleHospN++;
      else out.push(inv[i]);
    }
    return out;
  }

  async function refreshBattlePicker() {
    _battleShowAll = false;   // kaskart atidarius — pradedam nuo cap'o (high-lvl first)
    // SVARBU: resetinam NFT pasirinkimą kiekvieną kartą atidarius. _battlePickQty raktai
    // priklauso nuo unito statų (xp/level/...); kai unitai pakyla lygiu ar inventorius
    // perkraunamas, seni raktai nebeatitinka grupių → footer rodytų „Selected: 12" nors
    // visos kortelės rodo 0 (stale state) → žaidėjas negali normaliai deploy'inti. Švarus startas.
    _battlePickQty = {};
    // Free units grid — visada renderinam (be wallet)
    _renderFreeGrid();
    // Wallet account mismatch check
    await _checkWalletAcct();
    const W = window.Wallet;
    const grid = document.getElementById('nft-battle-grid');
    if (!grid) { _updateBattleFooter(); return; }
    if (!W || !W.isConnected || !W.isConnected()) {
      grid.innerHTML = '<div class="nft-empty">Connect wallet to pick NFT units (free units still work)</div>';
      _updateBattleFooter();
      return;
    }
    grid.innerHTML = '<div class="nft-empty">Loading your units…</div>';
    const BNFT = window.BarracksNFT;
    // On-chain deko sinchronizacija (cross-device) prieš krovimą — gated (no-op kol neaktyvuota).
    try { if (BNFT.syncDeckFromChain) await BNFT.syncDeckFromChain(W.getAddress()); } catch (_) {}
    // ♻️ 07-05: deko sulygiavimas (bendras su inventorium) — mirę/sužaloti išimti, pagiję grąžinti;
    //   battle picker'is NEBEgali pasiūlyti permadead (pvz. #1124) net einant tiesiai į BATTLE tab.
    try { if (BNFT.alignDeck) await BNFT.alignDeck(W.getAddress()); } catch (_) {}
    const deck = (BNFT.getDeck && BNFT.getDeck(W.getAddress())) || [];
    const useDeck = _battleUseDeck && deck.length > 0;
    try {
      const _injSet0 = await _fetchInjuredSet(W.getAddress());   // 🏥 sužeisti — užrakinti ir F12 (07-04)
      // 💀 07-05: pilies PERMADEAD unitai užrakinti IR F12 battle picker'yje (miręs = miręs visur;
      //   be šito #1124 buvo siūlomas kovai). _invDead užpildo tas pats _fetchInjuredSet REST fetch'as.
      const _injSet = new Set(_injSet0);
      try { _invDead.forEach(function (id) { _injSet.add(String(id)); }); } catch (_) {}
      if (useDeck) {
        // DECK režimas — kraunam TIK deck'o korteles (1 multicall, jokio tokenOfOwnerByIndex
        // skeno → instant net 500+ wallet'ui ir mobiliam).
        _battleInventory = _applyHospitalLock(await BNFT.loadDeckUnits(W.getAddress(), deck), _injSet);
        if (!_battleInventory.length) {
          // deck'o kortos parduotos/sudegintos/VISOS ligoninėj arba RPC krito → fallback į pilną sąrašą
          _battleUseDeck = false;
          return refreshBattlePicker();
        }
        _preselectSquad();        // ← AUTO-pasirenka battle squad (12 READY) — nereikia iš naujo rinkti
        _renderBattleGrid();
      } else {
        // Progresyvus krovimas — aukščiausio lvl unitai pasirodo PIRMI ir žaidėjas
        // gali rinktis nelaukdamas kol visa kolekcija užsikraus (whale-friendly).
        _battleInventory = _applyHospitalLock(await BNFT.fetchInventory(W.getAddress(), function (sorted, loaded, total) {
          _battleInventory = _applyHospitalLock(sorted, _injSet);
          _renderBattleGrid(loaded < total ? { loaded: loaded, total: total } : null);
        }), _injSet);
        if (!_battleInventory.length) {
          grid.innerHTML = '<div class="nft-empty">No NFT units yet — train one in TRAIN tab first</div>';
          _battlePickQty = {};
          _updateBattleFooter();
          return;
        }
        _renderBattleGrid();
      }
    } catch (e) {
      grid.innerHTML = '<div class="nft-empty">Failed to load: ' + (e.shortMessage || e.message || '') + '</div>';
    }
  }

  const _BATTLE_GRID_CAP = 30;   // max kortelių pirmam render'iui (high-lvl first); likę – „show all"
  let _battleShowAll = false;
  function _renderBattleGrid(progress) {
    const grid = document.getElementById('nft-battle-grid');
    if (!grid) return;
    const allGroups = _battleGroups();
    const capped = (!_battleShowAll && allGroups.length > _BATTLE_GRID_CAP);
    const groups = capped ? allGroups.slice(0, _BATTLE_GRID_CAP) : allGroups;
    const hidden = allGroups.length - groups.length;
    // Barų skalė (kaip inventoriuje) + bendras battle progresas (N/12 → fill ant „send" tag'o)
    let _bMaxHp = 1, _bMaxDmg = 1;
    for (const gg of groups) { const cs = _unitCombatStats(gg.utype, gg.level); if (cs.hp > _bMaxHp) _bMaxHp = cs.hp; if (cs.dmg > _bMaxDmg) _bMaxDmg = cs.dmg; }
    const _battleTotal = _battleTotalPicked();
    const _battleFill = Math.round(_battleTotal / BATTLE_MAX_TOTAL * 100);
    const _battleFull = _battleTotal >= BATTLE_MAX_TOTAL;   // squad pilnas 12/12 → nepasirinktos kortos „užrakintos"
    let html = groups.map(g => {
      const picked = _battlePickQty[g.key] | 0;
      const _disabled = _battleFull && picked === 0;   // pilna IR ši korta nepasirinkta → negali pridėti
      const isStack = g.count > 1;
      const cStats = _unitCombatStats(g.utype, g.level);
      const pwr = _unitPowerOf(g.level, g.utype);
      const dmgPct = Math.max(8, Math.round(cStats.dmg / _bMaxDmg * 100));
      const hpPct = Math.max(8, Math.round(cStats.hp / _bMaxHp * 100));
      const idText = isStack ? `×${g.count}` : `#${g.ids[0]}`;
      // Inventoriaus-stiliaus korta; visa korta clickable → toggle/cycle siuntimą į kovą.
      return `<div class="nft-inv-card nft-battle-pick ${picked > 0 ? 'picked' : ''} ${_disabled ? 'battle-disabled' : ''}" data-key="${g.key}" data-max="${g.count}" data-utype="${g.utype}" title="${_disabled ? 'Battle squad full (12/12) — remove a unit first' : 'Tap to send this unit to battle'}">
        <div class="nft-card-img-wrap">
          <img src="${g.image}" alt="${g.name}">
          <div class="nft-card-lvl-badge">Lv ${g.level}</div>
          ${pwr > 0 ? `<div class="nft-card-power-badge">⚡${pwr}</div>` : ''}
          ${picked > 0 ? `<div class="nft-battle-pick-chk">✓${isStack ? ' ×' + picked : ''}</div>` : ''}
        </div>
        <div class="nft-card-header"><span class="nft-card-name">${g.name}</span><span class="nft-card-id">${idText}</span></div>
        <div class="nft-stat-bars">
          <div class="nft-stat-bar-row"><span class="nft-stat-ic">⚔</span><div class="nft-stat-bar"><div class="nft-stat-bf dmg" style="width:${dmgPct}%"></div></div><span class="nft-stat-val">${cStats.dmg}</span></div>
          <div class="nft-stat-bar-row"><span class="nft-stat-ic">❤</span><div class="nft-stat-bar"><div class="nft-stat-bf hp" style="width:${hpPct}%"></div></div><span class="nft-stat-val">${cStats.hp}</span></div>
        </div>
        <div class="nft-battle-pick-tag ${picked > 0 ? 'on' : ''} ${_disabled ? 'full' : ''}" style="--fill:${_battleFill}%" title="${picked > 0 ? 'Active — fights on your castle field AND in PewPew Saga. Tap to bench.' : (_disabled ? 'Reserve — field is full (12). Bench an active unit to swap this in.' : 'Reserve — tap to put on your castle field / into battle (swaps with the active 12).')}"><span class="bpt-txt">${picked > 0 ? '🛡 ON FIELD' : '🪖 RESERVE'}</span><span class="bpt-cnt">${_battleTotal}/${BATTLE_MAX_TOTAL}</span></div>
      </div>`;
    }).join('');
    // Deck režimo juosta VIRŠUJ + krovimo / „show all" / „load more" juosta apačioje
    const BNFT = window.BarracksNFT;
    const _W = window.Wallet;
    const _addr = (_W && _W.getAddress && _W.getAddress()) || '';
    const deckLen = (BNFT && BNFT.deckCount && _addr) ? BNFT.deckCount(_addr) : 0;
    const inDeckMode = _battleUseDeck && deckLen > 0;
    let topBar = '';
    if (inDeckMode) {
      topBar = `<div class="nft-empty" style="opacity:.9;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:rgba(90,140,90,.12);border:1px solid rgba(120,160,120,.35);border-radius:10px;margin-bottom:8px">
        <span>Your active <strong>${BATTLE_MAX_TOTAL}</strong> 🛡 — they defend your castle <strong>and</strong> fight in PewPew Saga. Tap to swap; the rest wait in 🪖 reserve. (Deck ${deckLen}/${(BNFT.getDeckMax && _addr) ? BNFT.getDeckMax(_addr) : (BNFT.DECK_MAX || 12)})</span>
        <button id="nft-battle-deck-toggle" type="button" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(140,100,170,.4);background:rgba(122,90,152,.15);color:#c9b8dd;cursor:pointer;font-weight:600;white-space:nowrap">Browse all</button>
      </div>`;
    } else if (deckLen > 0) {
      topBar = `<div class="nft-empty" style="opacity:.9;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:rgba(122,90,152,.10);border:1px solid rgba(140,100,170,.30);border-radius:10px;margin-bottom:8px">
        <span>Browsing all units</span>
        <button id="nft-battle-deck-toggle" type="button" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(120,160,120,.4);background:rgba(90,140,90,.18);color:#bde0bd;cursor:pointer;font-weight:600;white-space:nowrap">Use my Deck (${deckLen})</button>
      </div>`;
    }
    html = topBar + html;
    const hasMore = !inDeckMode && !!(BNFT && BNFT.invHasMore && BNFT.invHasMore());
    if (progress && progress.loaded < progress.total) {
      html += `<div class="nft-empty" style="opacity:.7">⏳ Loading more units… ${progress.loaded}/${progress.total} (highest level first — you can pick & play now)</div>`;
    } else if (!inDeckMode) {
      if (capped) {
        html += `<button id="nft-battle-showall" type="button" class="nft-battle-showall" style="width:100%;padding:12px;margin-top:8px;border-radius:10px;border:1px solid rgba(140,100,170,.4);background:rgba(122,90,152,.15);color:#c9b8dd;cursor:pointer;font-weight:600">Show all (+${hidden} more)</button>`;
      }
      // „Load more" — dideli wallet'ai: pradžioj kraunam tik dalį (RPC-safe), čia – dar 24 iš grandinės
      if (hasMore) {
        const c = (BNFT.invCounts && BNFT.invCounts()) || { shown: 0, total: 0 };
        html += `<button id="nft-battle-loadmore" type="button" class="nft-battle-showall" style="width:100%;padding:12px;margin-top:8px;border-radius:10px;border:1px solid rgba(120,160,120,.4);background:rgba(90,140,90,.15);color:#bde0bd;cursor:pointer;font-weight:600">⬇ Show 24 more units (${c.shown}/${c.total})</button>`;
      }
    }
    // 🏥 užrakintų (gydomų) pranešimas — kad žaidėjas žinotų, kur dingo unitai
    if (_battleHospN > 0) {
      html = '<div style="grid-column:1/-1;padding:7px 12px;margin-bottom:4px;border:1px solid rgba(232,165,74,0.4);border-radius:8px;background:rgba(232,165,74,0.08);color:#e8a54a;font-size:11px;">🏥 ' + _battleHospN + ' unit(s) healing in your castle hospital — locked until recovered</div>' + html;
    }
    grid.innerHTML = html;
    {
      const dt = document.getElementById('nft-battle-deck-toggle');
      if (dt) dt.onclick = function () { _battleUseDeck = !_battleUseDeck; _battlePickQty = {}; refreshBattlePicker(); };
    }
    if (capped) {
      const sa = document.getElementById('nft-battle-showall');
      if (sa) sa.onclick = function () { _battleShowAll = true; _renderBattleGrid(); };
    }
    if (hasMore) {
      const lm = document.getElementById('nft-battle-loadmore');
      if (lm) lm.onclick = async function () {
        lm.disabled = true; lm.textContent = '⏳ Loading…';
        _battleShowAll = true;   // naujai užkrautus iškart parodom
        try {
          const updated = await BNFT.loadMoreInventory(function (sorted) { _battleInventory = sorted; _renderBattleGrid(); });
          _battleInventory = updated;
        } catch (_) {}
        _renderBattleGrid();
      };
    }
    _updateBattleFooter();
  }

  function _updateBattleFooter() {
    const nftTotal = _battleTotalPicked();
    const freeTotal = _battleFreeTotal();
    const activeTotal = _battleMode === 'nft' ? nftTotal : freeTotal;
    const activeMode = _battleMode === 'nft' ? 'NFT' : 'FREE';
    const nftEl = document.getElementById('nft-battle-selected');
    if (nftEl) nftEl.textContent = nftTotal;
    const freeEl = document.getElementById('nft-battle-free-count');
    if (freeEl) freeEl.textContent = freeTotal;
    const cntEl = document.getElementById('nft-battle-active-count');
    if (cntEl) cntEl.textContent = activeTotal;
    const modeEl = document.getElementById('nft-battle-active-mode');
    if (modeEl) modeEl.textContent = activeMode;
    const btn = document.getElementById('nft-battle-start');
    if (btn) {
      btn.disabled = activeTotal === 0;
      const _base = _battleMode === 'nft' ? '⚔ START WITH NFT' : '▶ START WITH FREE';
      // Play fee priedas — TIK NFT režime, kol mokestis dar nesumokėtas. FREE — be mokesčio.
      const _showFee = _battleMode === 'nft' && window._F12_PAYTOPLAY && !window._f12FeePaidForEntry;
      btn.textContent = _base + (_showFee ? ' · 5 RONKE' : '');
    }
  }

  function _onBattleGridClick(e) {
    const t = e.target;
    if (!t || !t.dataset) return;
    // GRIEŽTAS ATSKYRIMAS: free ir NFT turi ATSKIRUS 12-cap'us (NE bendrą). Free pasirinkimas
    // nebemažina NFT limito ir atvirkščiai — kiekvienas režimas savarankiškas.
    const nftTotal = _battleTotalPicked();
    const freeTotal = _battleFreeTotal();
    // FREE units +/-
    if (t.dataset.bt) {
      const bt = t.dataset.bt;
      const cur = _battleFreeQty[bt] | 0;
      if (t.classList.contains('nft-battle-free-plus')) {
        if (cur < FREE_MAX_PER_TYPE && freeTotal < BATTLE_MAX_TOTAL) {
          _battleFreeQty[bt] = cur + 1;
          _renderFreeGrid();
          _updateBattleFooter();
        }
      } else if (t.classList.contains('nft-battle-free-minus')) {
        if (cur > 0) {
          _battleFreeQty[bt] = cur - 1;
          _renderFreeGrid();
          _updateBattleFooter();
        }
      }
      return;
    }
    // NFT korta — paspaudus toggle/cycle siuntimą į kovą (visa korta clickable).
    const card = t.closest && t.closest('.nft-battle-pick');
    if (card && card.dataset && card.dataset.key) {
      const key = card.dataset.key;
      const max = parseInt(card.dataset.max, 10) || 1;
      const utype = parseInt(card.dataset.utype, 10) || 0;
      const cur = _battlePickQty[key] | 0;
      const otherTotal = nftTotal - cur;   // pasirinkta kitose kortose
      let next = cur + 1;
      if (next > max) next = 0;            // cycle: pro stack max → išvalom
      if (next > cur) {
        if (otherTotal + next > BATTLE_MAX_TOTAL) {
          next = cur; _battleToast('Max ' + BATTLE_MAX_TOTAL + ' units per battle');   // viršytų 12
        } else if ((_battleTypeCount(utype) - cur) + next > NFT_MAX_PER_TYPE) {
          next = cur; _battleToast('Max ' + NFT_MAX_PER_TYPE + '× per unit type');     // viršytų 4× to tipo
        }
      }
      if (next <= 0) delete _battlePickQty[key]; else _battlePickQty[key] = next;
      _battleMode = 'nft';                 // pasirenkant NFT → NFT režimas
      _persistBattleSquad();               // išsaugom kovos pasirinkimą (persist tarp sesijų)
      _renderBattleGrid();
      _updateBattleFooter();
    }
  }

  let _battleDeployFlow = false;
  function _deployStart(freeChoice, pool) {
    window._f12NftPickedPool = pool;
    window._f12PreDeckChoice = freeChoice;
    _battleDeployFlow = true;
    // F12 balls žaidimas → auto-rotate į landscape (Android: fullscreen + orientation.lock).
    // Kviečiama iš start mygtuko (user gesture), tad fullscreen leidžiamas. iOS: tyliai nepavyks (lieka portrait).
    try { if (window.enterLandscape) window.enterLandscape(); } catch (_) {}
    closeModal();
    // gotoF12 sets S.floor=12; poll() per 200ms detects ir paleid'ia _activateNow
    if (typeof window.gotoF12 === 'function') window.gotoF12();
    // Safety net — force activate after small delay (jei poll guard'as keistai elgiasi)
    setTimeout(function() {
      try {
        if (window._F12_activateNow && window._f12PreDeckChoice != null) {
          window._F12_activateNow();
        }
      } catch (e) { console.warn('[deploy] safety activateNow err', e); }
    }, 250);
  }
  function _onBattleDeployFree() {
    const freeChoice = {};
    for (const bt in _battleFreeQty) {
      const c = _battleFreeQty[bt] | 0;
      if (c > 0) freeChoice[bt] = c;
    }
    if (Object.keys(freeChoice).length === 0) return;
    _deployStart(freeChoice, []);   // FREE mūšis — BE play fee (mokestis tik NFT unitams)
  }
  async function _onBattleDeployNft() {
    const groups = _battleGroups();
    const pool = [];
    for (const g of groups) {
      const qty = _battlePickQty[g.key] | 0;
      if (qty <= 0) continue;
      const utypeF12 = NFT_UTYPE_TO_F12[g.utype];
      if (!utypeF12) continue;
      for (let i = 0; i < qty && i < g.ids.length; i++) {
        pool.push({
          tokenId: g.ids[i],
          utype: utypeF12,
          xp: g.xp,
          level: g.level,
          contractUtype: g.utype,
        });
      }
    }
    if (pool.length === 0) return;

    // ─── PLAY FEE PIRMA — 5 RONKE → treasury PRIEŠ deck/BurnAuth parašą (jei dar nesumokėta) ───
    if (typeof window._f12PayPlayFee === 'function') {
      const _sbtn = document.getElementById('nft-battle-start');
      const _sorig = _sbtn ? _sbtn.textContent : '';
      if (_sbtn) { _sbtn.disabled = true; _sbtn.textContent = '⏳ CONFIRM 5 RONKE...'; }
      try {
        await window._f12PayPlayFee();
      } catch (e) {
        const msg = String((e && e.message) || e);
        alert(/reject|denied|cancel/i.test(msg) ? 'Play fee cancelled — battle not started.' : (/session|expired|reconnect/i.test(msg) ? 'Wallet session expired — refresh the page & reconnect your wallet, then try again.' : (/wallet/i.test(msg) ? 'Connect wallet to pay the play fee.' : ('Play fee failed: ' + msg))));
        if (_sbtn) { _sbtn.disabled = false; _sbtn.textContent = _sorig || '⚔ START WITH NFT'; }
        if (typeof _updateBattleFooter === 'function') _updateBattleFooter();
        return;
      }
    }

    // ─── start-battle backend → wallet sign → save BurnAuth ───────────
    const startBtn = document.getElementById('nft-battle-start');
    const origText = startBtn ? startBtn.textContent : '';
    try {
      const W = window.Wallet;
      if (!W || !W.isConnected || !W.isConnected()) {
        alert('Connect your wallet first to play with NFT units.');
        return;
      }
      if (!window.SupabaseSync || typeof window.SupabaseSync.invoke !== 'function') {
        alert('Backend not available — cannot start NFT battle.');
        return;
      }
      if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = '⏳ STARTING BATTLE...';
      }
      const tokenIds = pool.map(p => Number(p.tokenId));
      // 1) Backend creates battle_sessions row + generates battleId/nonce/deadline
      const startWrap = await window.SupabaseSync.invoke('start-battle', {
        wallet: W.getAddress(),
        gameMode: 'F12',
        deployedTokenIds: tokenIds,
      });
      console.log('[F12 start-battle] resp:', startWrap);
      // SupabaseSync.invoke wrap'ina į { ok (HTTP status), status, data (edge fn body) }
      const startResp = startWrap && startWrap.data ? startWrap.data : startWrap;
      if (!startWrap || !startWrap.ok || !startResp || startResp.ok === false) {
        const baseMsg = (startResp && startResp.error)
          || (startWrap && 'HTTP ' + startWrap.status)
          || 'Backend rejected battle start';
        const detail = startResp && startResp.detail ? ('\n\nDetail: ' + startResp.detail) : '';
        const msg = baseMsg + detail;
        if (startResp && startResp.existingBattleId) {
          const idStr = String(startResp.existingBattleId);
          alert('You have an unfinished battle (#' + idStr.slice(0, 16) + '...). Wait ~30min for it to expire, switch wallet account, or DM admin to clear.');
        } else {
          alert('Cannot start NFT battle: ' + msg);
        }
        if (startBtn) { startBtn.disabled = false; startBtn.textContent = origText || '⚔ START WITH NFT'; }
        return;
      }
      // 2) Sign the typedData backend returned (battleId/nonce/deadline come from backend)
      if (startBtn) startBtn.textContent = '⏳ CONFIRM IN WALLET...';
      if (!W.signBattleAuth) {
        console.warn('[NFT battle] signBattleAuth not available, skipping sign');
      } else {
        const signRes = await W.signBattleAuth({
          tokenIds: tokenIds,
          battleId: startResp.battleId,
          deadline: startResp.deadline,
          nonce: startResp.nonce,
        });
        window._f12NftBurnAuth = {
          signature: signRes.signature,
          owner: signRes.owner,
          tokenIds: tokenIds.map(String),
          battleId: startResp.battleId,
          deadline: String(startResp.deadline),
          nonce: startResp.nonce,
        };
        console.log('[F12] NFT BurnAuth signed:', window._f12NftBurnAuth);
      }
    } catch (e) {
      console.warn('[F12] start-battle/sign failed:', e);
      alert('Battle setup failed: ' + (e.message || e));
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = origText || '⚔ START WITH NFT';
      }
      return;
    }
    if (startBtn) startBtn.disabled = false;
    // NFT mode — empty free choice, bet truthy {} kad praleist predeck modal'ą
    _deployStart({}, pool);
  }

  function _onBattleStart() {
    if (_battleMode === 'nft') _onBattleDeployNft();
    else _onBattleDeployFree();
  }

  function bindBattleTab() {
    const grid = document.getElementById('nft-battle-grid');
    if (grid) grid.addEventListener('click', _onBattleGridClick);
    const freeGrid = document.getElementById('nft-battle-free-grid');
    if (freeGrid) freeGrid.addEventListener('click', _onBattleGridClick);
    const refr = document.getElementById('nft-battle-refresh');
    if (refr) refr.addEventListener('click', refreshBattlePicker);
    // Mode toggle (FREE / NFT)
    const tFree = document.getElementById('nft-mode-tab-free');
    const tNft = document.getElementById('nft-mode-tab-nft');
    if (tFree) tFree.addEventListener('click', function() { _setBattleMode('free'); });
    if (tNft) tNft.addEventListener('click', function() { _setBattleMode('nft'); });
    // Single START button
    const startBtn = document.getElementById('nft-battle-start');
    if (startBtn) startBtn.addEventListener('click', _onBattleStart);
    const reconBtn = document.getElementById('nft-battle-acct-reconnect');
    if (reconBtn) reconBtn.addEventListener('click', _onReconnectAcct);
  }

  // ─── Unit selection ────────────────────────────────────────
  // Train kortos flip — paruošia front/back struktūrą; nugara = BASE statai (lvl 1), kaip inventoriaus korta.
  function _setupTrainCardFlip() {
    document.querySelectorAll('.nft-unit-option').forEach(el => {
      if (el.querySelector('.nft-card-inner')) return;            // jau paruošta (modal'as atidaromas iš naujo)
      const key = NFT_UTYPE_TO_F12[Number(el.dataset.utype)];
      const ab = _F12_ABILITY[key], base = _F12_BASE_STATS[key];
      if (!ab || !base) return;
      const nm = (el.querySelector('.nft-unit-name') || {}).textContent || '';
      const frontHTML = el.innerHTML;
      el.innerHTML =
        '<div class="nft-card-inner">' +
          '<div class="nft-train-front">' + frontHTML + '</div>' +
          '<div class="nft-card-back nft-train-back">' +
            '<div class="nft-back-title">' + nm + '</div>' +
            '<div class="nft-back-role">' + ab.role + ' · ' + ab.atk + '</div>' +
            '<div class="nft-back-bars">' + _backStatBars(ab, base) + '</div>' +
          '</div>' +
        '</div>';
    });
  }
  function selectUnit(utype) {
    selectedUtype = utype;
    document.querySelectorAll('.nft-unit-option').forEach(el => {
      const isSel = Number(el.dataset.utype) === utype;
      el.classList.toggle('selected', isSel);
      if (!isSel) el.classList.remove('flipped');                // kiti → atgal į sprite pusę
    });
    refreshCostPreview();
  }
  function bindUnitOptions() {
    _setupTrainCardFlip();
    document.querySelectorAll('.nft-unit-option').forEach(el => {
      el.onclick = () => {
        if (el.classList.contains('hog-locked')) return;  // COMING SOON — dar negalima pasirinkti/mintinti
        const wasSel = el.classList.contains('selected');
        selectUnit(Number(el.dataset.utype));
        // Pasirinkus → apverčiam į status (kaip inventoriaus nugara). Re-click ant pasirinktos → atgal į sprite.
        if (wasSel) el.classList.toggle('flipped'); else el.classList.add('flipped');
      };
    });
  }

  // ─── Qty controls ─────────────────────────────────────────
  function bindQty() {
    const input = document.getElementById('nft-qty');
    document.getElementById('nft-qty-minus').onclick = () => {
      input.value = Math.max(1, Number(input.value) - 1);
      refreshCostPreview();
    };
    document.getElementById('nft-qty-plus').onclick = () => {
      input.value = Math.min(100, Number(input.value) + 1);
      refreshCostPreview();
    };
    input.oninput = refreshCostPreview;
  }

  // ─── Cost preview ──────────────────────────────────────────
  async function refreshCostPreview() {
    try {
      const qty = Math.max(1, Math.min(100, Number(document.getElementById('nft-qty').value) || 1));
      const pricing = await window.BarracksNFT.getBatchPricing(selectedUtype, qty);
      const formatted = await window.BarracksNFT.formatEther(pricing.cost);
      const perUnit = await window.BarracksNFT.formatEther(pricing.cost / BigInt(qty));
      document.getElementById('nft-total-cost').textContent = `${formatted} RONKE`;
      document.getElementById('nft-per-unit-cost').textContent = `${perUnit} RONKE`;
      document.getElementById('nft-batch-mult').textContent =
        pricing.batchMult === 1 ? '1× (no penalty)' : `${pricing.batchMult}× PENALTY`;
      document.getElementById('nft-wait-time').textContent = `${pricing.wait}s`;
    } catch (e) {
      // wallet not connected probably
    }
  }

  // ─── State refresh ─────────────────────────────────────────
  async function refreshAll() {
    if (!modalOpen) return;
    try {
      const W = window.Wallet;
      if (!W || !W.isConnected || !W.isConnected()) {
        setStatus('Connect Ronin Wallet to use NFT barracks', 'error');
        return;
      }
      const addr = W.getAddress();
      // NEPRIKLAUSOMAS pending/claim patikrinimas (1 read) — kad CLAIM rodytųsi
      // VISADA, net jei pilnas fetchState (11 reads) krenta dėl RPC glitch'o.
      try {
        const pend = await window.BarracksNFT.getPending(addr);
        if (pend.active) showPending(pend); else hidePending();
      } catch (_) {}
      const s = await window.BarracksNFT.fetchState(addr);
      // RON balance + low warning
      const ronStr = await window.BarracksNFT.formatEther(s.ron);
      const ronNum = parseFloat(ronStr);
      const ronEl = document.getElementById('nft-ron-bal');
      ronEl.textContent = ronNum.toFixed(2);
      ronEl.style.color = ronNum < 11 ? '#e85d5d' : '#6fcf5c';
      const warnEl = document.getElementById('nft-ron-warning');
      if (warnEl) {
        if (ronNum < 11) {
          warnEl.style.display = 'block';
          document.getElementById('nft-ron-current').textContent = ronNum.toFixed(2);
        } else {
          warnEl.style.display = 'none';
        }
      }
      document.getElementById('nft-ronke-bal').textContent =
        (await window.BarracksNFT.formatEther(s.ronke)).split('.')[0];
      document.getElementById('nft-rv-bal').textContent = s.ronkeverse.toString();
      // Used = cap - remaining (kontrakto getRemainingDailyMint čekina ar window pasikeitė).
      // dailyMintedCount yra raw storage, neresetinasi iki kito mint'o — todėl klaidina.
      const usedNow = Math.max(0, Number(s.dailyCap) - Number(s.remaining));
      document.getElementById('nft-cap').textContent = `${usedNow} / ${s.dailyCap}`;
      document.getElementById('nft-supply').textContent = s.totalAlive.toString();
      // 🔢 L1 fix (07-12, sync auditas): badge = raw balanceOf (įsk. ligoninę+fallen) → tooltip paaiškina
      //   suskaidymą, kad „badge 29 vs grid 17" nebūtų mįslė (badge = grid + 🏥 + 💀).
      {
        const _ib = document.getElementById('nft-inv-badge');
        _ib.textContent = s.nftBalance.toString();
        try {
          const _injN = _invInjured.size, _deadN = _invDead.size;
          _ib.title = (_injN || _deadN)
            ? (Math.max(0, Number(s.nftBalance) - _injN - _deadN) + ' available · ' + _injN + ' 🏥 healing · ' + _deadN + ' 💀 fallen — total owned ' + s.nftBalance)
            : ('Total units owned by this wallet');
        } catch (_) {}
      }
      // Clamp qty input to remaining cap (avoid "Daily cap reached" reverts)
      const remaining = Number(s.remaining);
      const qtyInput = document.getElementById('nft-qty');
      if (qtyInput && remaining >= 0) {
        const cur = Number(qtyInput.value) || 1;
        if (cur > remaining && remaining > 0) {
          qtyInput.value = remaining;
        } else if (remaining === 0) {
          qtyInput.value = 0;
        }
        // Update max attribute too
        qtyInput.max = Math.max(1, remaining);
      }
      // Update button states based on allowance + RON + pending
      updateButtonStates(s, ronNum);
      // Pending state
      if (s.pending.active) showPending(s.pending);
      else hidePending();
      refreshCostPreview();
    } catch (e) {
      console.warn('[NFT modal] refresh failed', e);
    }
  }

  // Lock/unlock Start Training based on allowance + RON balance
  function updateButtonStates(state, ronBalance) {
    const approveBtn = document.getElementById('nft-approve-btn');
    const trainBtn = document.getElementById('nft-train-btn');
    const MIN_ALLOWANCE = 100n * 10n ** 18n;  // 100 RONKE
    const hasAllowance = state.allowance >= MIN_ALLOWANCE;
    const hasRon = typeof ronBalance === 'number' ? ronBalance >= 11 : true;

    if (!hasRon) {
      // Block both buttons — wallet doesn't have enough RON
      approveBtn.textContent = '⚠ NEED ≥11 RON FIRST';
      approveBtn.disabled = true;
      approveBtn.style.opacity = '0.4';
      approveBtn.style.boxShadow = 'none';
      trainBtn.textContent = '⚠ NEED ≥11 RON';
      trainBtn.disabled = true;
      trainBtn.style.opacity = '0.4';
      trainBtn.style.boxShadow = 'none';
      return;
    }

    if (hasAllowance) {
      approveBtn.textContent = '✓ RONKE APPROVED';
      approveBtn.disabled = true;
      approveBtn.style.opacity = '0.5';
      trainBtn.disabled = false;
      trainBtn.style.opacity = '1';
      trainBtn.style.boxShadow = '0 0 16px rgba(255, 207, 92, 0.6)';
      trainBtn.textContent = '2. Start Training';
    } else {
      approveBtn.textContent = '1. Approve RONKE (REQUIRED FIRST)';
      approveBtn.disabled = false;
      approveBtn.style.opacity = '1';
      approveBtn.style.boxShadow = '0 0 16px rgba(74, 157, 166, 0.6)';
      trainBtn.disabled = true;
      trainBtn.style.opacity = '0.4';
      trainBtn.style.boxShadow = 'none';
      trainBtn.textContent = '2. Start Training (approve first)';
    }
  }

  function showPending(p) {
    const pendEl = document.getElementById('nft-pending');
    const wasHidden = pendEl.style.display === 'none';
    pendEl.style.display = 'block';
    document.getElementById('nft-actions').style.display = 'none';
    // Pending metu paslepiam train formą (negali treniruoti su MAX_PENDING=1) →
    // claim matomas IŠKART, modalas trumpas (mobiliam tilpsta, claim nenueina už ekrano).
    ['.nft-unit-grid', '.nft-qty-row', '#nft-cost-preview'].forEach(function(sel) {
      var el = document.querySelector(sel); if (el) el.style.display = 'none';
    });
    const utypeName = window.BarracksNFT.utypeName(p.utype);
    document.getElementById('nft-pending-info').textContent =
      `${p.qty}× ${utypeName}`;
    const readyAt = Number(p.readyAt);
    const tick = () => {
      const remain = readyAt - Math.floor(Date.now() / 1000);
      const claimBtn = document.getElementById('nft-claim-btn');
      if (remain > 0) {
        document.getElementById('nft-pending-countdown').textContent = `${remain}s`;
        claimBtn.style.display = 'none';
      } else {
        document.getElementById('nft-pending-countdown').textContent = 'READY ✓';
        const justReady = claimBtn.style.display === 'none';
        claimBtn.style.display = 'inline-block';
        if (justReady) {  // pirmą kartą paruošta → scroll į claim mygtuką (mobile: gali būti žemiau ekrano)
          try { claimBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        }
        if (pendingTimer) { clearInterval(pendingTimer); pendingTimer = null; }
      }
    };
    tick();
    if (pendingTimer) clearInterval(pendingTimer);
    pendingTimer = setInterval(tick, 1000);
    // Pending pirmą kartą pasirodė → scroll į jį (kad žaidėjas pamatytų countdown/claim)
    if (wasHidden) {
      try { setTimeout(() => pendEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120); } catch (_) {}
    }
  }
  function hidePending() {
    document.getElementById('nft-pending').style.display = 'none';
    document.getElementById('nft-actions').style.display = 'flex';
    // Grąžinam train formą (po claim/cancel)
    ['.nft-unit-grid', '.nft-qty-row', '#nft-cost-preview'].forEach(function(sel) {
      var el = document.querySelector(sel); if (el) el.style.display = '';
    });
    if (pendingTimer) { clearInterval(pendingTimer); pendingTimer = null; }
  }

  // ─── Inventory ─────────────────────────────────────────────
  async function refreshInventory() {
    const W = window.Wallet;
    if (!W || !W.isConnected || !W.isConnected()) return;
    const addr = W.getAddress();
    const grid = document.getElementById('nft-inv-grid');
    grid.innerHTML = '<div class="nft-empty">Loading your units…</div>';
    const _tb = document.getElementById('nft-inv-loadmore-top'); if (_tb) _tb.style.display = 'none';  // reset stale
    // Dinaminis deko slot cap iš Ronkeverse balanso (12 + min(RV,18), cap 30) — fetch'inam lygiagrečiai
    // su inventoriumi (nestabdo, jei nepavyksta), palaukiam prieš pirmą render kad header /N būtų teisingas.
    const _slotsP = (window.BarracksNFT.refreshDeckSlots ? window.BarracksNFT.refreshDeckSlots(addr).catch(function(){}) : Promise.resolve());
    // Deko sinchronizacija iš grandinės (cross-device, „no full scan") — gated (no-op kol RonkePower neaktyvuota).
    // Sync dekas iš grandinės PIRMA (await, 6s timeout) — kad žinotume registruotą deką prieš krovimą.
    try { if (window.BarracksNFT.syncDeckFromChain) await window.BarracksNFT.syncDeckFromChain(addr); } catch (_) {}
    // 🏥 kurie unitai gydosi — badge'ams ant kortelių (kad žinotum, ką keisti deke; 07-04 user)
    try { _invInjured = await _fetchInjuredSet(addr); } catch (_) { _invInjured = new Set(); }
    try { _invNewBought = (typeof window._f9MktBoughtSet === 'function') ? window._f9MktBoughtSet(addr) : new Set(); } catch (_) { _invNewBought = new Set(); }   // 🆕 marketplace pirkiniai
    // ♻️ DEKO SULYGIAVIMAS — bendra BN.alignDeck (07-05): dekas = (registruoti − sužaloti − mirę) + 🕓 pending.
    //   Ta pati funkcija kviečiama ir battle picker'yje → visos vietos VISADA rodo tą patį.
    try { const BN0 = window.BarracksNFT; if (BN0 && BN0.alignDeck) await BN0.alignDeck(addr); } catch (_) {}
    const _deck0 = (window.BarracksNFT.getDeck && window.BarracksNFT.getDeck(addr)) || [];
    // DECK-FIRST: numatytai kraunam TIK deką (greitai, registracijos esmė). Pilnas skenas = PASIRINKIMAS.
    const _deckOnly = !_invShowAll && _deck0.length > 0;
    // PATIKIMAS deko gyvų unitų sąrašas (chunked loadDeckUnits) — header skaičiui + Power.
    // NEpriklauso nuo display režimo: edit mode pilnas skenas kraunamas DALIMIS (phased) → liveCnt mirgėdavo 22/24
    // nors registruota 24. Šis sąrašas visada pilnas (kaip battle picker), tad header rodys teisingą 24/24.
    const _deckAlive = _deck0.length ? await window.BarracksNFT.loadDeckUnits(addr, _deck0).catch(function(){return [];}) : [];
    try {
      let units;
      if (_deckOnly) {
        grid.innerHTML = '<div class="nft-empty">Loading your deck…</div>';
        units = _deckAlive;   // jau užkrautas (chunked) — nedubliuojam
        // 💀 M3 fix (07-06): mirusieji NEBĖRA getDeck'e (align nuėmė) → deck-only rodinys jų neužkraudavo ir
        //   FALLEN sekcija likdavo tuščia default ekrane. Užkraunam atskirai (feikinės mirtys → NFT on-chain
        //   tebeegzistuoja, loadDeckUnits veikia) ir pridedam — renderInv juos atskirs į 💀 FALLEN.
        if (_invDead && _invDead.size) {
          try {
            const _deadIds = Array.from(_invDead);
            const _du = await window.BarracksNFT.loadDeckUnits(addr, _deadIds).catch(function () { return []; });
            if (Array.isArray(_du) && _du.length) units = units.concat(_du);
          } catch (_) {}
        }
      } else {
        units = await window.BarracksNFT.fetchInventory(addr, function (sorted, loaded, total) {
          const cEl = document.getElementById('nft-inv-count');
          if (cEl) cEl.textContent = loaded + (loaded < total ? '/' + total : '');
          if (loaded < total) grid.innerHTML = '<div class="nft-empty">⏳ Loading all units… ' + loaded + '/' + total + '</div>';
        });
        // Garantuojam, kad VISI deko unitai matomi edit režime — pilnas skenas kraunamas DALIMIS (phased),
        // tad 2 deko unitai galėjo likti „Load more" partijoje → rodydavo 22 kortas nors deke 24. Įterpiam trūkstamus.
        if (Array.isArray(_deckAlive) && _deckAlive.length) {
          const _have = new Set((units || []).map(function (u) { return String(u.tokenId); }));
          for (const u of _deckAlive) if (!_have.has(String(u.tokenId))) units.push(u);
        }
      }
      // 🏥 GYDOMI unitai (07-04 user v3): DEKE esantys — RODOMI su 🏥 badge + raudonu REMOVE mygtuku
      //   (žaidėjas pats nuima slotą atlaisvindamas ARBA palieka ir laukia kol pagis). NE deke esantys
      //   gydomi — slepiami kaip mirę (jų pridėti negalima kol gydosi; pasveikę vėl atsiranda kaip ADD).
      //   💀 PERMADEAD (07-05) — NEBEslepiam: renderInv juos atskiria į „💀 FALLEN" sekciją (pažymėti +
      //   NEklikinami; iš deko/count/freeDeadSlot logikos IŠIMTI, tad `units` čia lieka dead-free). User 07-05:
      //   „pažymėti su kaukole ir neklikinami — kad matytųsi jog permadeath veikia" (lokalus testas).
      if (_invInjured.size && Array.isArray(units)) {
        const _BN = window.BarracksNFT;
        units = units.filter(u => (!_invInjured.has(String(u.tokenId)) || (_BN && _BN.deckHas && _BN.deckHas(addr, u.tokenId))));
      }
      // Deko vaizdas liko tuščias (visi deko unitai gydosi/mirę) → automatiškai perjungiam į PILNĄ
      // kolekciją (edit režimas) — žaidėjas iškart mato sveikus kandidatus papildymui.
      if (_deckOnly && !units.length) { _invShowAll = true; return refreshInventory(); }
      // Render'is iškeltas į vidinę funkciją kad „Load more" galėtų perrenderinti su naujais unitais.
      const BNFT = window.BarracksNFT;
      const _addr = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || '';
      let _lastInvUnits = null;
      const _fallenMap = new Map();   // 💀 permadead surinkti per VISUS renderInv/load-more (Map tokenId→unit, dedup) → atskira „FALLEN" sekcija
      // RONKE Power (client display) — TA PATI formulė kaip ronke-power edge fn:
      // unitPower = max(0, level-1) × rate (power nuo lvl 2); rate=15 hog(5), 16 ghost(6), 12 ronhood(7), 10 default. Σ deko unitų.
      // Serveris lieka autoritetas rewards'ams; čia tik momentinis vizualus feedback.
      function _powerRate(utype) { const u = Number(utype); return u === 5 ? 15 : u === 6 ? 16 : u === 7 ? 12 : 10; }
      function _unitPower(level, utype) { return Math.max(0, (Number(level) || 0) - 1) * _powerRate(utype); }
      function _computeDeckPower(units) {
        if (!BNFT || !_addr || !Array.isArray(units)) return 0;
        const byId = new Map();
        for (const u of units) byId.set(String(u.tokenId), u);
        let total = 0;
        // Dedup įgimtas (getDeck unikalūs ID); čia einam per deką, sumuojam levelius.
        for (const id of (BNFT.getDeck ? BNFT.getDeck(_addr) : [])) {
          const u = byId.get(String(id));
          if (u) total += _unitPower(u.level, u.utype);
        }
        return total;
      }
      function _syncDeckHeader() {
        const cnt = (BNFT && BNFT.deckCount && _addr) ? BNFT.deckCount(_addr) : 0;
        // GYVAS deko skaičius + Power skaičiuojam iš UNION(_deckAlive ∪ _lastInvUnits):
        //  • _deckAlive (chunked, patikimas) → visi registruoto deko gyvi unitai (edit mode phased load NEpameta 24→22);
        //  • _lastInvUnits → dinaminiai edit pakeitimai (ką tik pridėtas/pašalintas unitas).
        const _aliveUnits = [], _seen = new Set();
        for (const arr of [_deckAlive, _lastInvUnits]) {
          if (!Array.isArray(arr)) continue;
          for (const u of arr) { const k = String(u.tokenId); if (!_seen.has(k)) { _seen.add(k); _aliveUnits.push(u); } }
        }
        let liveCnt = cnt;
        if (BNFT && BNFT.getDeck && _addr) {
          liveCnt = 0;
          for (const id of BNFT.getDeck(_addr)) if (_seen.has(String(id))) liveCnt++;
        }
        // 🏥 gydomi deke — rodomi ATSKIRAI (07-04 user: „rašo 22/24 bet unitų rodo 3" — nesueidavo skaičiai:
        //   header'is skaičiavo VISUS gyvus deko, o grid'as gydomus slepia). Dabar: SVEIKI/max (🏥N).
        let _injCnt = 0;
        if (BNFT && BNFT.getDeck && _addr && _invInjured && _invInjured.size) {
          for (const id of BNFT.getDeck(_addr)) if (_invInjured.has(String(id))) _injCnt++;
        }
        const _healthyCnt = Math.max(0, liveCnt - _injCnt);
        const power = _computeDeckPower(_aliveUnits);
        // „Register Deck On-Chain" CTA — rodom kai dekas turi unitų; atnaujinam units + power.
        const reg = document.getElementById('nft-deck-register');
        if (reg) {
          reg.style.display = 'flex';   // VISADA matomas — tuščias dekas → hint (naujokui, ypač Solana onboarding'ui)
          const dMax = (BNFT && BNFT.getDeckMax && _addr) ? BNFT.getDeckMax(_addr) : 12;
          // 🕓 pending (lokaliai pridėti, neregistruoti) rodomi ATSKIRAI — kad deko skaičius sutaptų su lauku
          const _regS2 = new Set(((BNFT && BNFT.getRegisteredDeck && _addr) ? BNFT.getRegisteredDeck(_addr) : []).map(String));
          let _pendCnt = 0;
          if (BNFT && BNFT.getDeck && _addr) for (const id of BNFT.getDeck(_addr)) if (!_regS2.has(String(id))) _pendCnt++;
          const _readyCnt = Math.max(0, _healthyCnt - _pendCnt);
          const ru = document.getElementById('ndr-units');
          if (ru) ru.textContent = _readyCnt + (_pendCnt > 0 ? '+' + _pendCnt + '🕓' : '') + '/' + dMax + (_injCnt > 0 ? ' (🏥' + _injCnt + ')' : '');
          const rp = document.getElementById('ndr-power'); if (rp) rp.textContent = String(power);
          // ── Deko formavimo lentutė — 3 būsenos ──
          const registered = (BNFT && BNFT.isDeckRegistered && _addr) ? BNFT.isDeckRegistered(_addr) : false;
          const wasReg = (BNFT && BNFT.getRegisteredDeck && _addr) ? BNFT.getRegisteredDeck(_addr).length > 0 : false;
          const editing = _invShowAll && wasReg;   // ✏️ EDIT paspausta — redaguoji registruotą deką (rodom UPDATE UI)
          const changed = wasReg && !registered;   // dekas REALIAI pakeistas (skiriasi nuo snapshot)
          const _t = reg.querySelector('.ndr-title');
          const _fee = reg.querySelector('.ndr-fee');
          const _uic = document.getElementById('ndr-undo-ic');
          const _eic = document.getElementById('ndr-edit-ic');
          reg.classList.remove('mode-battle');
          if (cnt === 0 && !registered && !editing) {
            // TUŠČIAS dekas → NUDGE naujokui (kad žinotų kelią į RONKE Power + faucet; nebeslēpiam juostos).
            reg._mode = 'hint';
            reg.classList.remove('mode-registered');
            if (_t) _t.textContent = '➕ Add units to unlock RONKE Power + faucet';
            if (_fee) _fee.style.display = 'none';
            if (_uic) _uic.style.display = 'none';
            if (_eic) _eic.style.display = 'none';
          } else if (registered && !editing) {
            // Registruota, nepakeista, NE edit → ✓ DECK REGISTERED, BE kainos, su ✏️ EDIT (žalia, užrakinta)
            reg._mode = 'registered';
            reg.classList.add('mode-registered');
            if (_t) _t.textContent = '✓ DECK REGISTERED';
            if (_fee) _fee.style.display = 'none';
            if (_uic) _uic.style.display = 'none';
            if (_eic) _eic.style.display = '';
          } else if (changed || editing) {
            // Pakeista ARBA redaguojama → UPDATE DECK + kaina + ↩ undo (geltona redagavimo juosta).
            // editing nepakeitus → kaina rodoma, bet reg.onclick guard'as NEapmokestina kol nėra realių pakeitimų.
            reg._mode = 'register';
            reg.classList.remove('mode-registered');
            if (_t) _t.textContent = 'UPDATE DECK';
            if (_fee) _fee.style.display = '';
            if (_uic) _uic.style.display = '';
            if (_eic) _eic.style.display = 'none';   // edit režime ✏️ slepiam (jau redaguoji)
          } else {
            // Niekada neregistruota → REGISTER DECK + kaina
            reg._mode = 'register';
            reg.classList.remove('mode-registered');
            if (_t) _t.textContent = 'REGISTER DECK';
            if (_fee) _fee.style.display = '';
            if (_uic) _uic.style.display = 'none';
            if (_eic) _eic.style.display = 'none';
          }
          // ✏️ EDIT simbolis (registruota būsena) — TIK įkrauna kolekciją redagavimui.
          // SVARBU: NEšaliname mirusių čia (anksčiau prune'inom → dekas keisdavosi 24→22 net „nieko nedarius"
          // → juosta tapdavo geltona, dingdavo žalia 22/24). Mirusio slotas atlaisvinamas LAZILY tik pridedant naują (žemiau).
          if (_eic && !_eic._wired) {
            _eic._wired = true;
            _eic.onclick = function (ev) {
              if (ev && ev.stopPropagation) ev.stopPropagation();
              if (!_addr || !BNFT) return;
              _invShowAll = true;          // įkraunam visą kolekciją (pridėti/keisti unitus)
              refreshInventory();
            };
          }
          // ↩ undo simbolis (šalia UPDATE DECK) — grąžina deką į registruotą būseną. stopPropagation kad nepaleistų register.
          if (_uic && !_uic._wired) {
            _uic._wired = true;
            _uic.onclick = function (ev) {
              if (ev && ev.stopPropagation) ev.stopPropagation();
              if (!_addr || !BNFT || !BNFT.undoDeckChanges) return;
              BNFT.undoDeckChanges(_addr);   // grąžinam deką į registruotą snapshot
              _invShowAll = false;           // ↩ = atšaukiam redagavimą → grįžtam į žalią užrakintą būseną
              refreshInventory();
            };
          }
          if (!reg._wired) {
            reg._wired = true;
            reg.onclick = async function () {
              if (reg._busy) return;
              // Tuščias dekas (hint) → tik nukreipiam, nieko on-chain.
              if (reg._mode === 'hint') { _battleToast('Add units to your deck first — tap “+ ADD TO DECK” on cards'); return; }
              // Jau registruota (nepakeista) → nieko nedaryti (nemokam dar kartą).
              if (reg._mode === 'registered') return;
              // Edit režimas, bet REALIŲ pakeitimų nėra (dekas == snapshot) → NEapmokestinam, tik išeinam iš edit.
              if (BNFT && BNFT.isDeckRegistered && _addr && BNFT.isDeckRegistered(_addr)) {
                _battleToast('No deck changes to register'); _invShowAll = false; refreshInventory(); return;
              }
              // Jei dar neaktyvuota (nėra mainnet adreso) — preview žinutė.
              if (!(BNFT && BNFT.isRonkePowerEnabled && BNFT.isRonkePowerEnabled())) {
                alert('On-chain deck registration is coming soon.\n\nThis will register your deck units + total RONKE Power in one transaction (relayer pays gas, you pay a 10 RONKE fee: 5 burned, 5 to treasury).');
                return;
              }
              if (reg._busy) return;
              reg._busy = true;
              const titleEl = reg.querySelector('.ndr-title');
              const origTitle = titleEl ? titleEl.textContent : '';
              const setT = function (m) { if (titleEl) titleEl.textContent = m; };
              reg.style.pointerEvents = 'none'; reg.style.opacity = '0.75';
              try {
                const res = await BNFT.registerDeckOnChain(null, setT);
                setT('✓ DECK REGISTERED');
                const tx = res && res.txHash ? ('\n\nTX: ' + res.txHash) : '';
                setTimeout(function () {
                  alert('✅ Your deck is registered on-chain!\n\nIt now loads instantly every session (no full-collection scan) and follows you across devices. Your RONKE Power is locked in — faucet rewards coming soon.' + tx);
                }, 60);
              } catch (e) {
                setT(origTitle);
                alert('⚠ ' + (e && e.message ? e.message : 'Registration failed.'));
              } finally {
                reg._busy = false;
                reg.style.pointerEvents = ''; reg.style.opacity = '';
                try { renderInv(_lastInvUnits || []); } catch (_) {}
              }
            };
          }
        }
        const hint = document.getElementById('nft-deck-hint');
        if (hint) {
          hint.style.display = cnt > 0 ? 'none' : '';
          // DINAMINIS deko cap (12 + Ronkeverse, ne hardcoded 24) — kad 0-RV žaidėjas matytų teisingą 12.
          const _hMax = (BNFT && BNFT.getDeckMax && _addr) ? BNFT.getDeckMax(_addr) : 12;
          hint.innerHTML = '🎴 Tap a <strong>card</strong> to add/remove it from your Power Deck (max ' + _hMax + '). Tap <strong>ℹ</strong> to see abilities. Then register the deck for RONKE Power + faucet.';
        }
      }
      function renderInv(unitsAll) {
      // 💀 PERMADEAD atskiriam (07-05 user): kaupiam į _fallenMap (rodom „FALLEN" sekcijoj, pažymėti+neklikinami);
      //   `units` lieka dead-free → visa deko/count/freeDeadSlot logika NEPAKITUSI. `let` — click handler reassign'ina.
      if (_invDead.size && Array.isArray(unitsAll)) for (const u of unitsAll) if (_invDead.has(String(u.tokenId))) _fallenMap.set(String(u.tokenId), u);
      let units = _invDead.size ? unitsAll.filter(u => !_invDead.has(String(u.tokenId))) : unitsAll;
      _lastInvUnits = units;
      document.getElementById('nft-inv-count').textContent = units.length;
      // 🐛 LOW-fix: NEbaigiam anksti jei yra 💀 fallen (pvz. deck-only ir VISI deko unitai mirę) — kitaip
      //   rodytų „No NFT units" ir fallen sekcija (žemiau) nepasirodytų. Su fallen leidžiam tęsti (groupedArr tuščias → tik fallen).
      if (units.length === 0 && !_fallenMap.size) {
        grid.innerHTML = '<div class="nft-empty">No NFT units yet — train your first!</div>';
        _syncDeckHeader();
        return;
      }
      const BARRACKS_ADDR = (window.BarracksNFT && window.BarracksNFT.ADDR && window.BarracksNFT.ADDR.barracks) || '';

      // DECK-ONLY → KIEKVIENAS unitas atskira korta (be stacking) → matosi VISAS dekas (23/24 kortos).
      // SHOW-ALL → stack'inam identiškus (×N), kad šimtai unitų netaptų šimtais kortų.
      const groups = new Map();
      for (const u of units) {
        const _injK = _invInjured.has(String(u.tokenId)) ? '|INJ' : '';   // 🏥 sužaloti atskirai (nesistekuoja su sveikais)
        const key = _deckOnly ? String(u.tokenId) : `${u.utype}|${u.xp}|${u.level}|${u.battles}|${u.wins}|${u.kills}${_injK}`;
        if (!groups.has(key)) {
          groups.set(key, { ...u, ids: [u.tokenId], count: 1 });
        } else {
          const g = groups.get(key);
          g.ids.push(u.tokenId);
          g.count++;
        }
      }
      const groupedArr = Array.from(groups.values());
      // Sort: used units (battles>0) first, fresh stacks after
      // BATTLE SQUAD PIRMI — registruoti kovos unitai (12 READY) visada rodomi viršuje.
      const _sqSet = new Set(((BNFT && BNFT.getBattleSquad && _addr) ? BNFT.getBattleSquad(_addr) : []).map(String));
      const _inSq = (g) => g.ids.some((id) => _sqSet.has(String(id)));
      groupedArr.sort((a, b) => {
        const sa = _inSq(a) ? 1 : 0, sb = _inSq(b) ? 1 : 0;
        if (sa !== sb) return sb - sa;   // squad (kovai paruošti) → viršuje
        if (a.battles !== b.battles) return b.battles - a.battles;
        if (a.xp !== b.xp) return b.xp - a.xp;
        return Number(b.ids[0]) - Number(a.ids[0]);
      });
      // HP/DMG juostų skalė — didžiausias tarp rodomų (kaip žaidimo picker'io ATK juosta)
      let _maxHpShown = 1, _maxDmgShown = 1;
      for (const gg of groupedArr) {
        const cs = _unitCombatStats(gg.utype, gg.level);
        if (cs.hp > _maxHpShown) _maxHpShown = cs.hp;
        if (cs.dmg > _maxDmgShown) _maxDmgShown = cs.dmg;
      }

      // Ar visas dekas užregistruotas on-chain (TIKSLIAI) → deko kortų power badge'ai ŽALI (užfiksuota).
      const _deckRegistered = (BNFT && BNFT.isDeckRegistered && _addr) ? BNFT.isDeckRegistered(_addr) : false;
      // UŽRAKINTAS dekas: snapshot egzistuoja (kažkada registruota) + NE edit režime. Lieka 🔒 net jei pakeistas/mirę pašalinti.
      const _hasReg = (BNFT && BNFT.hasRegisteredDeck && _addr) ? BNFT.hasRegisteredDeck(_addr) : _deckRegistered;
      const _deckLocked = _hasReg && !_invShowAll;
      // GYVAS deko skaičius — deko ID'ai, kurie realiai užkrauti (mirę/parduoti praleidžiami) → rodom 22/24, ne 24/24.
      const _loadedIds = new Set(units.map((u) => String(u.tokenId)));
      const _deckLiveCnt = (BNFT && BNFT.getDeck && _addr)
        ? BNFT.getDeck(_addr).filter((id) => _loadedIds.has(String(id)) && !_invInjured.has(String(id))).length
        : ((BNFT && BNFT.deckCount && _addr) ? BNFT.deckCount(_addr) : 0);
      let _invHtml = groupedArr.map(g => {
        const rarityCls = g.rarity === 'rare' ? 'rare' : '';
        const veteranCls = g.level >= 10 ? 'veteran' : '';
        const cStats = _unitCombatStats(g.utype, g.level);   // DMG/HP pagal tipą + lygį
        const dmgPct = Math.max(8, Math.round(cStats.dmg / _maxDmgShown * 100));
        const hpPct  = Math.max(8, Math.round(cStats.hp  / _maxHpShown  * 100));
        const ab = _F12_ABILITY[NFT_UTYPE_TO_F12[g.utype]] || _F12_ABILITY.skull;   // ability info (kortos nugara)
        const cdSec = (ab.cd / 1000).toFixed(1);
        const isStack = g.count > 1;
        const firstId = g.ids[0];
        const marketUrl = `https://marketplace.roninchain.com/collections/pewpew-battle-units`;
        const stackBadge = isStack ? `<div class="nft-card-stack">×${g.count}</div>` : '';
        const idText = isStack
          ? `<span title="Token IDs: ${g.ids.join(', ')}"></span>`
          : `#${firstId}`;
        // Level progress
        const curThreshold = g.level * g.level * 100;
        const nextThreshold = (g.level + 1) * (g.level + 1) * 100;
        const xpProgress = Math.max(0, Math.min(100,
          ((g.xp - curThreshold) / (nextThreshold - curThreshold)) * 100));
        const xpToNext = Math.max(0, nextThreshold - g.xp);
        const title = g.level === 0 ? 'RECRUIT' :
                      g.level < 5  ? 'TRAINED' :
                      g.level < 10 ? 'ELITE' :
                      g.level < 25 ? 'CHAMPION' : 'LEGENDARY';
        const inDeck = (BNFT && BNFT.deckHas && _addr) ? g.ids.filter((id) => BNFT.deckHas(_addr, id)).length : 0;
        // INVENTORY = TIK deko formavimas (Power Deck). Battle pasirinkimas — BATTLE tab'e.
        const _deckCnt  = (BNFT && BNFT.deckCount && _addr) ? BNFT.deckCount(_addr) : 0;
        const _deckMax  = (BNFT && BNFT.getDeckMax && _addr) ? BNFT.getDeckMax(_addr) : 12;
        function _smartBtn() {
          const idsAttr = g.ids.join(',');
          // Rodome SVEIKŲ skaičių abiem režimais (07-04: gydomi slepiami kaip mirę — _deckLiveCnt
          // skaičiuoja tik užkrautus/sveikus, tad sutampa su header'iu ir matomom kortelėm).
          const _shownCnt = _deckLiveCnt;
          const cnt   = _shownCnt + '/' + _deckMax;
          const fill  = Math.round(_shownCnt / Math.max(1, _deckMax) * 100);
          // 🕓 PENDING (07-05): lokaliai pridėtas, bet DAR NEregistruotas on-chain — kad nesimaišytų su
          //   tikrais deko nariais (user: „deke 7, lauke 1" — 6 buvo neišsaugoti pridėjimai).
          const _regSnap = (BNFT && BNFT.getRegisteredDeck && _addr) ? BNFT.getRegisteredDeck(_addr).map(String) : [];
          const _pending = inDeck > 0 && !g.ids.some((id) => _regSnap.indexOf(String(id)) !== -1);
          // UŽRAKINTA (registruota, ne edit) → tik 🔒, jokio veiksmo. Spustelėjus — užuomina paspausti ✏️.
          if (_deckLocked) {
            const lockLabel = _pending ? '🕓 PENDING' : (inDeck > 0 ? '🔒 IN DECK' : '🔒 LOCKED');
            const lockTitle = _pending ? 'Added locally but NOT registered on-chain yet — press UPDATE DECK (10 RONKE) to make it real, or ↩ UNDO to discard.' : 'Deck registered — click ✏️ EDIT to change your deck';
            return `<button class="nft-smart-btn sb-locked" data-locked="1" type="button" title="${lockTitle}" style="--fill:${fill}%${_pending ? ';border-color:rgba(255,207,92,.6);color:#ffcf5c' : ''}"><span class="nsb-txt">${lockLabel}</span><span class="nsb-cnt">${cnt}</span></button>`;
          }
          // 🏥 sužalotas deke → raudonas REMOVE (atlaisvina slotą naujam unitui; arba lauk kol pagis)
          const _gInj = g.ids.length > 0 && g.ids.every((id) => _invInjured.has(String(id)));
          if (_gInj && inDeck > 0) {
            return `<button class="nft-smart-btn sb-indeck" data-ids="${idsAttr}" type="button" title="Injured — healing in your castle hospital. Remove to free the deck slot for a new unit (re-add after recovery), or wait until healed." style="--fill:${fill}%;border-color:rgba(232,93,93,.6);background:rgba(120,40,40,.28);color:#ffb3b0"><span class="nsb-txt">🏥 REMOVE</span><span class="nsb-cnt">${cnt}</span></button>`;
          }
          const cls   = inDeck > 0 ? 'sb-indeck' : 'sb-adddeck';
          const label = inDeck > 0 ? (_pending ? '🕓 PENDING' : '✓ IN DECK') : '⚡ ADD TO DECK';
          const title = inDeck > 0
            ? (_pending ? 'Added locally but NOT registered on-chain — press UPDATE DECK to register, or click to remove.' : 'In your Power Deck (counts toward RONKE Power). Click to remove.')
            : 'Add to your Power Deck — counts toward RONKE Power. Pick battle units in the BATTLE tab.';
          return `<button class="nft-smart-btn ${cls}" data-ids="${idsAttr}" type="button" title="${title}" style="--fill:${fill}%"><span class="nsb-txt">${label}</span><span class="nsb-cnt">${cnt}</span></button>`;
        }
        // ── RONKE Power (per kortą) — formulė max(0,lvl-1)×rate. Rodom tik skaičiuką dešinio
        // viršaus kampe (badge); deke → pulsuoja. Lvl<2 → 0, badge nerodom. ──
        const _cardPwr = _unitPower(g.level, g.utype);
        const _pwrTitle = `Lv ${g.level} → ⚡${_cardPwr} RONKE Power (rate ${_powerRate(g.utype)}/lvl). ${inDeck > 0 ? 'In your deck — counts toward total power.' : 'Add to your deck so it counts.'}`;
        const _dBtnCss = 'min-width:26px;padding:4px 8px;border-radius:8px;border:1px solid rgba(120,160,120,.45);background:rgba(90,140,90,.16);color:#bde0bd;cursor:pointer;font-weight:700;font-size:.9em';
        const _dInCss = 'flex:1;padding:6px 12px;border-radius:8px;border:1px solid rgba(120,160,120,.6);background:rgba(90,140,90,.32);color:#d6f0d6;cursor:pointer;font-weight:700;font-size:.85em;white-space:nowrap;text-align:center';
        const _dToggleCss = 'flex:1;padding:6px 14px;border-radius:8px;border:1px solid rgba(120,160,120,.55);background:linear-gradient(180deg,rgba(110,160,110,.28),rgba(74,120,74,.22));color:#dafada;cursor:pointer;font-weight:700;font-size:.85em;white-space:nowrap;text-align:center';
        const _dLockCss = 'min-width:26px;padding:4px 8px;border-radius:8px;border:1px solid rgba(150,150,160,.35);background:rgba(90,90,100,.16);color:#9aa;cursor:not-allowed;font-weight:700;font-size:.9em;opacity:.5';
        const deckBtn = isStack
          ? (_deckLocked
              ? `<button class="nft-deck-locked" data-locked="1" type="button" title="Deck registered — click ✏️ EDIT to change your deck" style="${_dLockCss}">🔒</button>
                 <span class="nft-deck-count" style="${inDeck > 0 ? 'color:#bde0bd;font-weight:700' : 'opacity:.6'};font-size:.85em">🎴 ${inDeck}/${g.count}</span>`
              : `<button class="nft-deck-minus" data-ids="${g.ids.join(',')}" type="button" title="Remove from deck" style="${_dBtnCss}">−</button>
                 <span class="nft-deck-count" style="${inDeck > 0 ? 'color:#bde0bd;font-weight:700' : 'opacity:.6'};font-size:.85em">🎴 ${inDeck}/${g.count}</span>
                 <button class="nft-deck-plus" data-ids="${g.ids.join(',')}" type="button" title="Add to deck" style="${_dBtnCss}">＋</button>`)
          : '';   // vienetinei kortai deck'o nėra — ją valdo ⚔ BATTLE mygtukas (žemiau)
        return `<div class="nft-inv-card ${rarityCls} ${veteranCls}${inDeck > 0 ? ' in-deck' : ''}">
          ${stackBadge}
          <div class="nft-card-inner">
            <div class="nft-card-front">
              <div class="nft-card-img-wrap">
                <img src="${g.image}" alt="${g.name}">
                <div class="nft-card-lvl-badge">Lv ${g.level}</div>
                ${_cardPwr > 0 ? `<div class="nft-card-power-badge ${inDeck > 0 ? (_deckRegistered ? 'registered' : 'counting') : ''}" title="${(inDeck > 0 && _deckRegistered) ? 'Registered on-chain ✓ — ' : ''}${_pwrTitle}">${(inDeck > 0 && _deckRegistered) ? '✓' : '⚡'}${_cardPwr}</div>` : ''}
                ${(() => { const _iN = g.ids.filter(id => _invInjured.has(String(id))).length; return _iN > 0 ? `<div style="position:absolute;top:${_cardPwr > 0 ? 28 : 5}px;right:5px;z-index:4;padding:2px 6px;border-radius:6px;background:rgba(60,18,18,0.88);border:1px solid #e85d5d;color:#ff9a98;font-size:9px;font-weight:700;" title="Healing in your castle hospital — cannot fight until recovered">🏥 ${g.count > 1 ? _iN + '/' + g.count : 'HEALING'}</div>` : ''; })()}
                ${(() => { const _nN = g.ids.filter(id => _invNewBought.has(String(id))).length; return _nN > 0 ? `<div style="position:absolute;top:5px;left:5px;z-index:5;padding:2px 7px;border-radius:6px;background:rgba(18,60,24,0.92);border:1px solid #6cff8a;color:#aeffc0;font-size:9px;font-weight:800;letter-spacing:.5px;box-shadow:0 0 9px rgba(108,255,138,.6);" title="Just bought on the market">🆕 ${g.count > 1 && _nN < g.count ? _nN : 'NEW'}</div>` : ''; })()}
                ${(() => {
                  // 🛡 07-06 user: rodom AR unitas DABAR stovi pilies lauke (kaunasi) ar rezerve. TIK deko unitams
                  //   ir kai lauko info šviežia (window._f9OnField Set užpildytas kai esi savo pilyje).
                  const _of = window._f9OnField, _rv = window._f9Reserve;
                  if (!window.__f9HomeActive || !(_of instanceof Set) || inDeck <= 0) return '';   // 🐛 M4: tik SAVO pilyje (raid'e onField = tavo unitai PRIEŠO lauke — klaidintų)
                  const _onF = g.ids.filter(id => _of.has(String(id))).length;
                  const _res = g.ids.filter(id => (_rv instanceof Set) && _rv.has(String(id))).length;
                  if (_onF > 0) return `<div style="position:absolute;top:5px;left:5px;z-index:5;padding:2px 6px;border-radius:6px;background:rgba(18,54,28,0.92);border:1px solid #6fcf5c;color:#8dffa0;font-size:9px;font-weight:700;" title="Standing on your castle field right now — ready to defend / attack">🛡 ${g.count > 1 ? _onF + '/' + g.count : 'ON FIELD'}</div>`;
                  if (_res > 0) return `<div style="position:absolute;top:5px;left:5px;z-index:5;padding:2px 6px;border-radius:6px;background:rgba(26,38,58,0.92);border:1px solid #6a8cc0;color:#a8c8ff;font-size:9px;font-weight:700;" title="In your deck but benched (over the 12-unit field cap) — enters as reinforcement when a field unit falls">🪖 ${g.count > 1 ? _res + '/' + g.count : 'RESERVE'}</div>`;
                  return '';
                })()}
                <button class="nft-card-flip" type="button" title="View abilities" style="position:absolute;left:5px;bottom:5px;z-index:4;width:20px;height:20px;border-radius:50%;border:1px solid rgba(210,195,235,.55);background:rgba(35,25,50,.82);color:#e0d2f4;font-size:11px;line-height:1;cursor:pointer;padding:0">ℹ</button>
              </div>
              <div class="nft-card-header">
                <span class="nft-card-name">${g.name}</span>
                <span class="nft-card-id">${idText}</span>
              </div>
              <div class="nft-card-xp-block">
                <div class="nft-xp-header">
                  <span class="nft-xp-label">XP</span>
                  <span class="nft-xp-value">${g.xp.toLocaleString()} / ${nextThreshold.toLocaleString()}</span>
                </div>
                <div class="nft-xp-bar"><div class="nft-xp-fill" style="width:${xpProgress}%"></div></div>
                <div class="nft-xp-next">${xpToNext.toLocaleString()} XP to Lv ${g.level + 1}</div>
              </div>
              <div class="nft-stat-bars">
                <div class="nft-stat-bar-row">
                  <span class="nft-stat-ic">⚔</span>
                  <div class="nft-stat-bar"><div class="nft-stat-bf dmg" style="width:${dmgPct}%"></div></div>
                  <span class="nft-stat-val">${cStats.dmg}</span>
                </div>
                <div class="nft-stat-bar-row">
                  <span class="nft-stat-ic">❤</span>
                  <div class="nft-stat-bar"><div class="nft-stat-bf hp" style="width:${hpPct}%"></div></div>
                  <span class="nft-stat-val">${cStats.hp}</span>
                </div>
              </div>
              <div class="nft-card-actions">
                ${isStack
                  ? `<div class="nft-card-deck" style="display:flex;align-items:center;gap:6px">${deckBtn}</div>`
                  : _smartBtn()}
              </div>
            </div>
            <div class="nft-card-back">
              <div class="nft-back-title">${g.name}</div>
              <div class="nft-back-role">${ab.role} · ${ab.atk}</div>
              <div class="nft-back-bars">${_backStatBars(ab, cStats)}</div>
            </div>
          </div>
        </div>`;
      }).join('');
      // 🏥 BANNER (info): sužalotų slotai atlaisvinti AUTOMATIŠKAI (user v4). Rodomas IŠ KART užkrovus deką.
      // 🛡 07-06 user: pilies lauko/rezervo suvestinė — kad būtų aišku kurie unitai realiai kaunasi (max 12
      //   lauke), o kurie laukia rezerve (dekas > 12). Rodoma tik kai lauko info šviežia (esi savo pilyje).
      if (window.__f9HomeActive && window._f9OnField instanceof Set && window._f9OnField.size) {
        const _fN = window._f9OnField.size, _rN = (window._f9Reserve instanceof Set) ? window._f9Reserve.size : 0;
        _invHtml = `<div style="grid-column:1/-1;display:flex;align-items:center;gap:12px;padding:8px 12px;margin-bottom:4px;border:1px solid rgba(111,207,92,0.4);border-radius:8px;background:rgba(18,54,28,0.14);color:#bfe8c0;font-size:11px;"><span style="color:#8dffa0;font-weight:700;">🛡 ${_fN} on field</span> defending now (max 12)` + (_rN > 0 ? ` · <span style="color:#a8c8ff;font-weight:700;">🪖 ${_rN} in reserve</span> — reinforce when a field unit falls` : '') + `</div>` + _invHtml;
      }
      if (_invInjured.size) {
        _invHtml = `<div style="grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:4px;border:1px solid rgba(232,93,93,0.45);border-radius:8px;background:rgba(120,40,40,0.12);color:#ff9a98;font-size:11px;">🏥 ${_invInjured.size} injured unit(s) healing in your castle hospital — they return to your deck automatically when healed. No re-registration needed; your deck stays valid.</div>` + _invHtml;
      }
      // 💀 FALLEN sekcija (07-05 user) — permadead unitai: pažymėti 💀 + NEklikinami (jokių deko mygtukų).
      //   Rodo faktą, kad permadeath veikia. Mirtys dabar feikinės → NFT vis dar on-chain (todėl balanse skaičiuojas).
      if (_fallenMap.size) {
        const _fallen = Array.from(_fallenMap.values());
        const _fh = _fallen.map(u => {
          const nm = u.name || ((u.utype || 'unit') + ' #' + u.tokenId);
          return '<div class="nft-inv-card nft-card-fallen" data-fallen="1" title="💀 Permadead — killed in castle PvP, cannot be deployed (fake death: NFT is still yours on-chain)" style="filter:grayscale(1) brightness(.55);opacity:.85;cursor:default;position:relative">'
            + '<div class="nft-card-inner"><div class="nft-card-front"><div class="nft-card-img-wrap">'
            + '<img src="' + (u.image || '') + '" alt="' + nm + '" style="filter:grayscale(1)">'
            + '<div class="nft-card-lvl-badge">Lv ' + (u.level || 0) + '</div>'
            + '<div style="position:absolute;top:5px;right:5px;z-index:4;padding:2px 7px;border-radius:6px;background:rgba(20,20,26,.92);border:1px solid #6a6a78;color:#c8c8d4;font-size:9px;font-weight:800;letter-spacing:.5px">💀 DEAD</div>'
            + '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:38px;z-index:3;pointer-events:none;text-shadow:0 2px 8px #000">💀</div>'
            + '</div><div class="nft-card-header"><span class="nft-card-name">' + nm + '</span><span class="nft-card-id">#' + u.tokenId + '</span></div>'
            + '<div style="padding:6px 10px;text-align:center;color:#9a9aa8;font-size:10px;font-weight:700;letter-spacing:.5px">PERMADEAD · cannot deploy</div>'
            + '</div></div></div>';
        }).join('');
        _invHtml += '<div style="grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:8px 12px;margin:8px 0 4px;border:1px solid rgba(120,120,135,.4);border-radius:8px;background:rgba(30,30,40,.35);color:#b0b0c0;font-size:11px;">💀 ' + _fallen.length + ' fallen unit(s) — permadeath (killed in castle PvP). Shown for reference; not deployable.</div>' + _fh;
      }
      grid.innerHTML = _invHtml;
      // Click handler (delegated): VISA korta = add/remove į deką (pagrindinis veiksmas).
      // Flip į ability'es — TIK per ℹ mygtuką arba paspaudus kortos nugarą.
      grid.onclick = function (e) {
        const t = e.target;
        if (!t) return;
        const _card = t.closest && t.closest('.nft-inv-card');
        if (_card && _card.classList.contains('nft-card-fallen')) return;   // 💀 permadead — NEklikinama (jokio deko/flip veiksmo)
        // A) ℹ mygtukas ARBA kortos NUGARA → flip (front ⇄ ability'es), jokio deck veiksmo.
        if ((t.closest && t.closest('.nft-card-flip')) || (t.closest && t.closest('.nft-card-back'))) {
          if (_card) _card.classList.toggle('flipped'); return;
        }
        // 0) UŽRAKINTAS dekas (registruotas, ne edit) → spustelėjus 🔒 mygtuką: užuomina + blokas.
        const _lockBtn = t.closest && t.closest('button[data-locked]');
        // 🔓 07-04: klik ant užrakinto → IŠKART edit režimas (✏️ pieštukas būna paslėptas kai dekas „changed" —
        //   žaidėjas likdavo aklavietėj „negaliu nieko daryti"). Vienas tap = atrakinta.
        if (_lockBtn) { _invShowAll = true; _battleToast('✏️ Deck unlocked for editing'); refreshInventory(); return; }
        // SELL nuoroda (ar bet kokia <a>) — paliekam default.
        if (t.closest && t.closest('a')) return;
        // 1) Deck mygtukas TIESIOGIAI (data-ids), ARBA paspaudus bet kur ant kortos FRONT'o → naudojam
        //    tos kortos pagrindinį deck mygtuką (single = ⚡ smart btn, stack = ＋). Taip „tap unit = add".
        let _btn = t.closest && t.closest('button[data-ids]');
        if (!_btn && _card && !_card.classList.contains('flipped')) {
          _btn = _card.querySelector('.nft-smart-btn[data-ids], .nft-deck-plus[data-ids]');
        }
        if (_btn && _btn.dataset && _btn.dataset.ids) {
        if (!_addr || !BNFT) return;
        const ids = String(_btn.dataset.ids).split(',');
        const cl = _btn.classList;
        const deckMax = BNFT.getDeckMax ? BNFT.getDeckMax(_addr) : 12;
        const fly = function () { const c = _btn.closest && _btn.closest('.nft-inv-card'); if (c) _flyCardToDeck(c); };
        let acted = false;
        // LAZY mirusio slot atlaisvinimas: kai dekas pilnas IR pridedi naują → pašalinam VIENĄ mirusį
        // (deko ID nėra tarp užkrautų gyvų unitų) kad atsilaisvintų vieta. Tik PRIDEDANT (ne „nieko nedarius").
        const _loadedSet = new Set((units || []).map((u) => String(u.tokenId)));
        function _freeDeadSlot() {
          const deckIds = (BNFT.getDeck(_addr) || []).map(String);
          // pirmenybė mirusiems/parduotiems (nėra tarp užkrautų), tada 🏥 sužalotiems (neaktyvūs = kaip mirę)
          const freeId = deckIds.find((id) => !_loadedSet.has(id)) || deckIds.find((id) => _invInjured.has(id));
          if (freeId) { BNFT.removeFromDeck(_addr, freeId); return true; }
          return false;
        }
        // ── DECK toggle (vienetinės kortos) — TIK Power Deck (battle pasirinkimas BATTLE tab'e) ──
        if (cl.contains('sb-adddeck')) {                      // → į Power Deck
          if (BNFT.deckCount(_addr) >= deckMax && !_freeDeadSlot()) { alert('Power Deck full (max ' + deckMax + ' = 12 + 1 per Ronkeverse NFT).'); return; }
          const add = ids.find((id) => !BNFT.deckHas(_addr, id));
          if (add) { BNFT.addToDeck(_addr, add); fly(); acted = true; }
        } else if (cl.contains('sb-indeck')) {                // ← išima iš deko
          const rem = ids.find((id) => BNFT.deckHas(_addr, id));
          if (rem) { BNFT.removeFromDeck(_addr, rem); acted = true; }
        }
        // ── STEKO +/− → Power Deck ──
        else if (cl.contains('nft-deck-plus')) {
          if (BNFT.deckCount(_addr) >= deckMax && !_freeDeadSlot()) { alert('Power Deck full (max ' + deckMax + ').'); return; }
          const add = ids.find((id) => !BNFT.deckHas(_addr, id));
          if (add) { BNFT.addToDeck(_addr, add); fly(); acted = true; }
        } else if (cl.contains('nft-deck-minus')) {
          const rem = ids.slice().reverse().find((id) => BNFT.deckHas(_addr, id));
          if (rem) { BNFT.removeFromDeck(_addr, rem); acted = true; }
        } else { return; }
        if (acted) {
          // 🏥 iš deko nuimti sužaloti DINGSTA iš sąrašo (rodomi tik kol deke) — negalima jų atgal pridėti
          if (_invInjured.size) units = units.filter((u) => !_invInjured.has(String(u.tokenId)) || BNFT.deckHas(_addr, u.tokenId));
          renderInv(units);   // perrender — atnaujina mygtukus + barus + header
        }
        return;
        }
        // Fallback: korta be deck mygtuko (pvz. užrakinta) → flip į ability'es.
        if (_card) _card.classList.toggle('flipped');
      };
      _syncDeckHeader();
      // „Load more" — dideli wallet'ai: pradžioj kraunam tik dalį (RPC-safe), čia – dar 24 iš grandinės.
      // Du mygtukai: VIRŠUJ (greta skaitiklio) ir grid'o GALE — abu kviečia tą patį handler'į.
      const hasMore = !_deckOnly && !!(BNFT && BNFT.invHasMore && BNFT.invHasMore());   // deck-only → jokio „load more"
      const c = (BNFT && BNFT.invCounts && BNFT.invCounts()) || { shown: 0, total: 0 };
      async function doLoadMore(triggerBtn, restoreTxt) {
        if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = '⏳ Loading…'; }
        try {
          const updated = await BNFT.loadMoreInventory(function (sorted) {
            const cEl = document.getElementById('nft-inv-count'); if (cEl) cEl.textContent = sorted.length;
          });
          // 🏥 ta pati matomumo taisyklė kaip refreshInventory (kitaip „load more" grąžintų paslėptus sužalotus)
          const _vis = _invInjured.size ? updated.filter((u) => !_invInjured.has(String(u.tokenId)) || (BNFT.deckHas && BNFT.deckHas(_addr, u.tokenId))) : updated;
          renderInv(_vis);
        } catch (_) { if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = restoreTxt || 'Retry'; } }
      }
      // Viršutinis mygtukas (HTML'e, greta „Owned NFT units") — tik perjungiam matomumą/tekstą/onclick
      const topBtn = document.getElementById('nft-inv-loadmore-top');
      if (topBtn) {
        if (hasMore) {
          topBtn.style.display = '';
          topBtn.textContent = `⬇ Show 24 more (${c.shown}/${c.total})`;
          topBtn.onclick = function () { doLoadMore(topBtn, `⬇ Show 24 more (${c.shown}/${c.total})`); };
        } else { topBtn.style.display = 'none'; }
      }
      // Apatinis mygtukas — VISADA rodomas. Load veiksmai turi 3s cooldown + uzsikrovimo juostą (anti-spam).
      {
        const _now = Date.now();
        const _cdRem = _invLoadCdUntil - _now;
        const _onCd = _cdRem > 0;
        const bbtn = document.createElement('button');
        bbtn.type = 'button';
        bbtn.className = 'nft-inv-loadbtn';
        bbtn.style.cssText = 'grid-column:1/-1;position:relative;overflow:hidden;padding:12px;margin-top:8px;border-radius:10px;cursor:pointer;font-weight:600;border:1px solid rgba(74,157,166,.4);background:rgba(40,70,75,.28);color:#9fd0d6';
        let label, action, isLoad;
        if (_deckOnly) {
          label = '⬇ Load more units from your collection';
          action = function () { _invShowAll = true; refreshInventory(); };
          isLoad = true;
        } else if (hasMore) {
          label = `⬇ Show 24 more units (${c.shown}/${c.total})`;
          bbtn.style.borderColor = 'rgba(120,160,120,.4)'; bbtn.style.background = 'rgba(90,140,90,.15)'; bbtn.style.color = '#bde0bd';
          action = function () { doLoadMore(null, ''); };   // null → doLoadMore neliečia mygtuko (cd juosta tvarko mus)
          isLoad = true;
        } else {
          label = '🎴 Show my deck only';
          action = function () { _invShowAll = false; refreshInventory(); };
          isLoad = false;
        }
        const fill = document.createElement('span'); fill.className = 'inv-cd-fill';
        const txt = document.createElement('span'); txt.className = 'inv-cd-txt';
        bbtn.appendChild(fill); bbtn.appendChild(txt);
        if (isLoad && _onCd) {
          // Cooldown — disabled + juosta pildosi link 100% per likusį laiką, tada perrender → vėl galima.
          bbtn.disabled = true; bbtn.style.cursor = 'wait'; bbtn.style.opacity = '0.85';
          txt.textContent = '⏳ Loading…';
          fill.style.width = Math.max(0, 100 - _cdRem / 3000 * 100) + '%';
          requestAnimationFrame(function () { fill.style.transition = 'width ' + _cdRem + 'ms linear'; fill.style.width = '100%'; });
          setTimeout(function () { try { renderInv(_lastInvUnits || []); } catch (_) {} }, _cdRem + 70);
        } else {
          txt.textContent = label;
          bbtn.onclick = function () {
            if (isLoad) {
              if (Date.now() < _invLoadCdUntil) return;
              _invLoadCdUntil = Date.now() + 3000;   // 3s cooldown
            }
            action();
          };
        }
        grid.appendChild(bbtn);
      }
      }  // renderInv
      try { await _slotsP; } catch (_) {}     // deko slot cap paruoštas → header rodys teisingą /N
      renderInv(units);
    } catch (e) {
      grid.innerHTML = '<div class="nft-empty">Failed to load: ' + (e.shortMessage || e.message || '') + '</div>';
    }
  }

  // ─── Actions ───────────────────────────────────────────────
  function bindActions() {
    document.getElementById('nft-approve-btn').onclick = async () => {
      try {
        setStatus('Approving 1M RONKE allowance...');
        const amount = await window.BarracksNFT.parseEther('1000000');
        const hash = await window.BarracksNFT.approveRonke(amount);
        setStatus(`Approved ✓ ${txLink(hash)}`, 'success');
        refreshAll();
      } catch (e) {
        setStatus(`Approve failed: ${e.shortMessage || e.message}`, 'error');
      }
    };
    document.getElementById('nft-train-btn').onclick = async () => {
      try {
        const qty = Math.max(1, Math.min(100, Number(document.getElementById('nft-qty').value) || 1));
        setStatus(`Starting training: ${qty}× ${window.BarracksNFT.utypeName(selectedUtype)}...`);
        const hash = await window.BarracksNFT.startTraining(selectedUtype, qty);
        setStatus(`Training started ✓ ${txLink(hash)} — wait for countdown, then CLAIM below`, 'success');
        // Keli refresh'ai — RPC vėluoja atspindėti pending (ypač mobiliam po wallet sign).
        refreshAll();
        for (let i = 1; i <= 6; i++) setTimeout(refreshAll, i * 2500);  // kas 2.5s iki ~15s
      } catch (e) {
        const msg = e.shortMessage || e.message || 'unknown error';
        // Jei trūksta RONKE arba RON (ne approve) — pridedam nukreipimą į swap sekciją.
        const needsSwap = /not enough ronke|at least 11 ron|not enough ron|top up ron/i.test(msg);
        let html = `Training failed: ${msg}`;
        if (needsSwap && window.openRonkeSwap) {
          html += ` <a href="#" onclick="window.openRonkeSwap();return false;" style="display:inline-block;margin-top:6px;padding:3px 10px;background:#f2c14e;color:#2a1f08;font-weight:bold;border-radius:6px;text-decoration:none;">→ Get RONKE / RON (Swap)</a>`;
        }
        setStatus(html, 'error');
      }
    };
    document.getElementById('nft-claim-btn').onclick = async () => {
      try {
        setStatus('Claiming NFT units...');
        const hash = await window.BarracksNFT.claimTraining();
        setStatus(`🎉 Claimed ✓ ${txLink(hash)} — check Inventory tab + F10 plots!`, 'success');
        // Try several refreshes — RPC needs a few seconds to update inventory after mint
        refreshAll();
        refreshInventory();
        for (let i = 1; i <= 5; i++) {
          setTimeout(() => {
            refreshAll();
            refreshInventory();
            if (window.NFTBarracksPlots && window.NFTBarracksPlots.refresh) {
              window.NFTBarracksPlots.refresh();
            }
          }, i * 3000);  // every 3s for 15s
        }
        // SFX victory chord
        if (typeof SFX !== 'undefined' && SFX.play) {
          try {
            SFX.play(523, 0.10, 0.06, 'square', 80);
            setTimeout(() => SFX.play(659, 0.10, 0.06, 'square', 80), 90);
            setTimeout(() => SFX.play(784, 0.10, 0.06, 'square', 80), 180);
            setTimeout(() => SFX.play(1047, 0.18, 0.10, 'square', 250), 280);
          } catch (_) {}
        }
      } catch (e) {
        setStatus(`Claim failed: ${e.shortMessage || e.message}`, 'error');
      }
    };
    document.getElementById('nft-cancel-btn').onclick = async () => {
      if (!confirm('Cancel pending training? 90% RONKE refunded, 10% penalty to treasury.')) return;
      try {
        setStatus('Cancelling pending training...');
        const hash = await window.BarracksNFT.cancelPendingTraining();
        setStatus(`Cancelled ✓ ${txLink(hash)} — 90% refunded`, 'success');
        refreshAll();
      } catch (e) {
        setStatus(`Cancel failed: ${e.shortMessage || e.message}`, 'error');
      }
    };
    document.getElementById('nft-inv-refresh').onclick = refreshInventory;
    document.getElementById('nft-modal-close').onclick = closeModal;
  }

  // ─── Init ──────────────────────────────────────────────────
  function init() {
    bindTabs();
    bindUnitOptions();
    bindQty();
    bindActions();
    bindBattleTab();
    // Close on backdrop click
    document.getElementById('nft-barracks-modal').addEventListener('click', (e) => {
      if (e.target.id === 'nft-barracks-modal') closeModal();
    });
  }

  // Public API
  window.NFTBarracksModal = { open: openModal, close: closeModal };
  // Compat: f12_predeck_modal.js iškviečia _openNftBarracksModal — alias į open + Battle tab.
  window._openNftBarracksModal = function() {
    openModal();
    // Auto-jump į BATTLE tab'ą (jei atėjo iš F12 predeck NFT mygtuko)
    setTimeout(function() {
      const battleTab = document.querySelector('.nft-tab[data-tab="battle"]');
      if (battleTab) battleTab.click();
    }, 50);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
