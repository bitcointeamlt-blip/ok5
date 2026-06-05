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
        if (t.dataset.tab === 'inventory') refreshInventory();
        else if (t.dataset.tab === 'battle') refreshBattlePicker();
      };
    });
  }

  // ─── BATTLE / DEPLOY tab ────────────────────────────────────
  // Inventoriaus picker — pasirink kelis NFT + free units, paspaudus DEPLOY → F12 startas.
  // utype (contract uint8) → F12 utype string:
  const NFT_UTYPE_TO_F12 = { 1: 'skull', 2: 'archer', 3: 'harpoon_fish', 4: 'shaman', 5: 'hog_rider' };
  // F12 ALLY base statai — TURI sutapti su floor12_merge.js ALLY_STATS. Rodom kortelėj DMG/HP.
  const _F12_BASE_STATS = {
    skull:        { hp: 8,  dmg: 2 },
    archer:       { hp: 5,  dmg: 3 },
    shaman:       { hp: 4,  dmg: 4 },
    harpoon_fish: { hp: 7,  dmg: 3 },
    hog_rider:    { hp: 14, dmg: 8 },
  };
  // Lygio skalė: stat = round(base × (1 + level×0.05)) — match _nftStatMul() žaidime.
  function _unitCombatStats(contractUtype, level) {
    const base = _F12_BASE_STATS[NFT_UTYPE_TO_F12[contractUtype]] || _F12_BASE_STATS.skull;
    const mul = 1 + Math.max(0, level | 0) * 0.05;
    return { hp: Math.max(1, Math.round(base.hp * mul)), dmg: Math.max(1, Math.round(base.dmg * mul)) };
  }
  // Ability statai — TURI sutapti su floor12_merge.js (block/crit/miss/CD/range). Rodom kortos „nugaroj".
  const _F12_ABILITY = {
    skull:        { role: 'Melee Bruiser',  atk: 'Melee',     range: 'Short',  cd: 1500, move: 12, crit: 0,    block: 0.25, miss: 0.10, aoe: false },
    archer:       { role: 'Ranged DPS',     atk: 'Ranged',    range: 'Long',   cd: 1500, move: 14, crit: 0,    block: 0,    miss: 0.15, aoe: false },
    harpoon_fish: { role: 'Ranged Piercer', atk: 'Ranged',    range: 'Medium', cd: 1800, move: 11, crit: 0,    block: 0,    miss: 0.05, aoe: false },
    shaman:       { role: 'Ranged Caster',  atk: 'Ranged',    range: 'Long',   cd: 3000, move: 10, crit: 0,    block: 0,    miss: 0.05, aoe: true  },
    hog_rider:    { role: 'Cavalry Tank',   atk: 'Melee AOE', range: 'Short',  cd: 2800, move: 13, crit: 0.10, block: 0,    miss: 0,    aoe: true  },
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
      const deckEl = document.getElementById('nft-deck-status');
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
      if (deckEl) { deckEl.style.transition = 'transform .2s'; deckEl.style.transform = 'scale(1.35)'; setTimeout(function () { deckEl.style.transform = ''; }, 220); }
    } catch (_) {}
  }
  let _battleInventory = [];   // raw fetchInventory rezultatas
  let _battlePickQty = {};     // {groupKey: qty}
  let _battleFreeQty = { shadow: 1, arrow: 1, heart: 1, leaf: 1 };  // {ballType: qty} default 1 of each
  const BATTLE_MAX_TOTAL = 12;
  // FREE unitu sąrašas — match'ina NFT 4 tipus per ball type
  const FREE_UNITS = [
    { ballType: 'shadow', utype: 'skull',        name: 'Skull',   icon: 'unit-images/skull-idle.gif' },
    { ballType: 'arrow',  utype: 'archer',       name: 'Archer',  icon: 'unit-images/archer-idle.gif' },
    { ballType: 'heart',  utype: 'shaman',       name: 'Shaman',  icon: 'unit-images/shaman-idle.gif' },
    { ballType: 'leaf',   utype: 'harpoon_fish', name: 'Harpoon', icon: 'unit-images/harpoon-idle.gif' },
  ];
  const FREE_MAX_PER_TYPE = 5;
  let _battleMode = 'free';   // 'free' arba 'nft' — exclusive
  let _battleUseDeck = true;   // jei deck'as netuščias — kraunam TIK jį (instant, jokio RPC skeno)

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
    const deck = (BNFT.getDeck && BNFT.getDeck(W.getAddress())) || [];
    const useDeck = _battleUseDeck && deck.length > 0;
    try {
      if (useDeck) {
        // DECK režimas — kraunam TIK deck'o korteles (1 multicall, jokio tokenOfOwnerByIndex
        // skeno → instant net 500+ wallet'ui ir mobiliam).
        _battleInventory = await BNFT.loadDeckUnits(W.getAddress(), deck);
        if (!_battleInventory.length) {
          // deck'o kortos parduotos/sudegintos arba RPC krito → fallback į pilną sąrašą
          _battleUseDeck = false;
          return refreshBattlePicker();
        }
        _renderBattleGrid();
      } else {
        // Progresyvus krovimas — aukščiausio lvl unitai pasirodo PIRMI ir žaidėjas
        // gali rinktis nelaukdamas kol visa kolekcija užsikraus (whale-friendly).
        _battleInventory = await BNFT.fetchInventory(W.getAddress(), function (sorted, loaded, total) {
          _battleInventory = sorted;
          _renderBattleGrid(loaded < total ? { loaded: loaded, total: total } : null);
        });
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
    let html = groups.map(g => {
      const picked = _battlePickQty[g.key] | 0;
      const title = g.level === 0 ? 'RECRUIT' :
                    g.level < 5  ? 'TRAINED' :
                    g.level < 10 ? 'ELITE' :
                    g.level < 25 ? 'CHAMPION' : 'LEGENDARY';
      const isStack = g.count > 1;
      const idText = isStack ? `×${g.count} available` : `#${g.ids[0]}`;
      return `<div class="nft-battle-card ${picked > 0 ? 'is-picked' : ''}" data-key="${g.key}">
        <img class="nft-battle-img" src="${g.image}" alt="${g.name}">
        <div class="nft-battle-info">
          <div class="nft-battle-name">${g.name} <span class="nft-battle-lvl">Lv ${g.level}</span></div>
          <div class="nft-battle-meta">${title} · ${g.xp.toLocaleString()} XP · ${idText}</div>
        </div>
        <div class="nft-battle-ctrls">
          <button class="nft-battle-minus" data-key="${g.key}" type="button">−</button>
          <span class="nft-battle-count">${picked}</span>
          <button class="nft-battle-plus" data-key="${g.key}" data-max="${g.count}" type="button">+</button>
        </div>
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
        <span>Playing from your <strong>Deck</strong> (${deckLen}/${BNFT.DECK_MAX || 24}) — pick up to ${BATTLE_MAX_TOTAL}</span>
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
      btn.textContent = _battleMode === 'nft' ? '⚔ START WITH NFT' : '▶ START WITH FREE';
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
    // NFT units +/-
    if (t.dataset.key) {
      const key = t.dataset.key;
      const cur = _battlePickQty[key] | 0;
      if (t.classList.contains('nft-battle-plus')) {
        const max = parseInt(t.dataset.max, 10) || 0;
        if (cur < max && nftTotal < BATTLE_MAX_TOTAL) {
          _battlePickQty[key] = cur + 1;
          _renderBattleGrid();
        }
      } else if (t.classList.contains('nft-battle-minus')) {
        if (cur > 0) {
          _battlePickQty[key] = cur - 1;
          if (_battlePickQty[key] <= 0) delete _battlePickQty[key];
          _renderBattleGrid();
        }
      }
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
    _deployStart(freeChoice, []);
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
  function selectUnit(utype) {
    selectedUtype = utype;
    document.querySelectorAll('.nft-unit-option').forEach(el => {
      el.classList.toggle('selected', Number(el.dataset.utype) === utype);
    });
    refreshCostPreview();
  }
  function bindUnitOptions() {
    document.querySelectorAll('.nft-unit-option').forEach(el => {
      el.onclick = () => {
        if (el.classList.contains('hog-locked')) return;  // COMING SOON — dar negalima pasirinkti/mintinti
        selectUnit(Number(el.dataset.utype));
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
      document.getElementById('nft-inv-badge').textContent = s.nftBalance.toString();
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
    try {
      const units = await window.BarracksNFT.fetchInventory(addr, function (sorted, loaded, total) {
        const cEl = document.getElementById('nft-inv-count');
        if (cEl) cEl.textContent = loaded + (loaded < total ? '/' + total : '');
        if (loaded < total) grid.innerHTML = '<div class="nft-empty">⏳ Loading units… ' + loaded + '/' + total + '</div>';
      });
      // Render'is iškeltas į vidinę funkciją kad „Load more" galėtų perrenderinti su naujais unitais.
      const BNFT = window.BarracksNFT;
      const _addr = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || '';
      let _lastInvUnits = null;
      function _syncDeckHeader() {
        const cnt = (BNFT && BNFT.deckCount && _addr) ? BNFT.deckCount(_addr) : 0;
        const st = document.getElementById('nft-deck-status');
        if (st) st.textContent = cnt > 0 ? `· Deck: ${cnt}/${(BNFT && BNFT.DECK_MAX) || 24}` : '';
        const cl = document.getElementById('nft-deck-clear');
        if (cl) {
          cl.style.display = cnt > 0 ? '' : 'none';
          cl.onclick = function () {
            if (!_addr || !BNFT) return;
            if (!confirm('Clear your whole deck (' + cnt + ' units)?')) return;
            BNFT.setDeck(_addr, []);
            try { renderInv(_lastInvUnits || []); } catch (_) { _syncDeckHeader(); }
          };
        }
        const hint = document.getElementById('nft-deck-hint');
        if (hint) hint.style.display = cnt > 0 ? 'none' : '';
      }
      function renderInv(units) {
      _lastInvUnits = units;
      document.getElementById('nft-inv-count').textContent = units.length;
      if (units.length === 0) {
        grid.innerHTML = '<div class="nft-empty">No NFT units yet — train your first!</div>';
        _syncDeckHeader();
        return;
      }
      const BARRACKS_ADDR = (window.BarracksNFT && window.BarracksNFT.ADDR && window.BarracksNFT.ADDR.barracks) || '';

      // Group units by stat signature — identical units stack with ×N badge.
      // Once a unit gains XP/battles/kills, its signature differs → shown individually.
      const groups = new Map();
      for (const u of units) {
        const key = `${u.utype}|${u.xp}|${u.level}|${u.battles}|${u.wins}|${u.kills}`;
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
      groupedArr.sort((a, b) => {
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

      grid.innerHTML = groupedArr.map(g => {
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
        const _dBtnCss = 'min-width:26px;padding:4px 8px;border-radius:8px;border:1px solid rgba(120,160,120,.45);background:rgba(90,140,90,.16);color:#bde0bd;cursor:pointer;font-weight:700;font-size:.9em';
        const _dInCss = 'flex:1;padding:6px 12px;border-radius:8px;border:1px solid rgba(120,160,120,.6);background:rgba(90,140,90,.32);color:#d6f0d6;cursor:pointer;font-weight:700;font-size:.85em;white-space:nowrap;text-align:center';
        const _dToggleCss = 'flex:1;padding:6px 14px;border-radius:8px;border:1px solid rgba(120,160,120,.55);background:linear-gradient(180deg,rgba(110,160,110,.28),rgba(74,120,74,.22));color:#dafada;cursor:pointer;font-weight:700;font-size:.85em;white-space:nowrap;text-align:center';
        const deckBtn = isStack
          ? `<button class="nft-deck-minus" data-ids="${g.ids.join(',')}" type="button" title="Remove from deck" style="${_dBtnCss}">−</button>
             <span class="nft-deck-count" style="${inDeck > 0 ? 'color:#bde0bd;font-weight:700' : 'opacity:.6'};font-size:.85em">🎴 ${inDeck}/${g.count}</span>
             <button class="nft-deck-plus" data-ids="${g.ids.join(',')}" type="button" title="Add to deck" style="${_dBtnCss}">＋</button>`
          : `<button class="nft-deck-toggle ${inDeck > 0 ? 'in' : ''}" data-ids="${g.ids.join(',')}" type="button" title="Add this card to your battle deck" style="${inDeck > 0 ? _dInCss : _dToggleCss}">${inDeck > 0 ? '✓ In Your Deck' : 'Add to Deck'}</button>`;
        return `<div class="nft-inv-card ${rarityCls} ${veteranCls}${inDeck > 0 ? ' in-deck' : ''}">
          ${stackBadge}
          <div class="nft-card-inner">
            <div class="nft-card-front">
              <div class="nft-flip-hint" title="Tap for abilities">ℹ</div>
              <div class="nft-card-img-wrap">
                <img src="${g.image}" alt="${g.name}">
                <div class="nft-card-lvl-badge">Lv ${g.level}</div>
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
                <div class="nft-card-deck" style="display:flex;align-items:center;gap:6px">${deckBtn}</div>
                <a href="${marketUrl}" target="_blank" class="nft-card-link market" title="Sell on Ronin Market">SELL</a>
              </div>
            </div>
            <div class="nft-card-back">
              <div class="nft-back-title">${g.name}</div>
              <div class="nft-back-role">${ab.role} · ${ab.atk}</div>
              <div class="nft-back-bars">${_backStatBars(ab, cStats)}</div>
              <div class="nft-back-hint">↻ tap to flip back</div>
            </div>
          </div>
        </div>`;
      }).join('');
      // Click handler (delegated): deck +/− mygtukai ARBA kortos apsisukimas (flip į ability'es).
      grid.onclick = function (e) {
        const t = e.target;
        if (!t) return;
        // 1) Deck mygtukai (turi data-ids) — pridedam/šalinam token ID, NEapsukam
        if (t.dataset && t.dataset.ids) {
        if (!_addr || !BNFT) return;
        const ids = String(t.dataset.ids).split(',');
        const isAdd = t.classList.contains('nft-deck-plus') ||
                      (t.classList.contains('nft-deck-toggle') && !t.classList.contains('in'));
        const isRem = t.classList.contains('nft-deck-minus') ||
                      (t.classList.contains('nft-deck-toggle') && t.classList.contains('in'));
        if (isAdd) {
          if (BNFT.deckCount(_addr) >= (BNFT.DECK_MAX || 24)) { alert('Deck full (max ' + (BNFT.DECK_MAX || 24) + '). Remove a unit first.'); return; }
          const add = ids.find((id) => !BNFT.deckHas(_addr, id));
          if (add) {
            BNFT.addToDeck(_addr, add);
            const _card = t.closest && t.closest('.nft-inv-card');
            if (_card) _flyCardToDeck(_card);   // „korta nuskrenda į deką" animacija PRIEŠ re-render
          }
        } else if (isRem) {
          const rem = ids.slice().reverse().find((id) => BNFT.deckHas(_addr, id));
          if (rem) BNFT.removeFromDeck(_addr, rem);
        } else { return; }
        renderInv(units);   // perrender — atnaujina ženkliukus + header
        return;
        }
        // 2) SELL nuoroda (ar bet kokia <a>) — paliekam default, NEapsukam
        if (t.closest && t.closest('a')) return;
        // 3) Bet kur kitur ant kortos — apsukam (front ⇄ ability nugara)
        const card = t.closest && t.closest('.nft-inv-card');
        if (card) card.classList.toggle('flipped');
      };
      _syncDeckHeader();
      // „Load more" — dideli wallet'ai: pradžioj kraunam tik dalį (RPC-safe), čia – dar 24 iš grandinės.
      // Du mygtukai: VIRŠUJ (greta skaitiklio) ir grid'o GALE — abu kviečia tą patį handler'į.
      const hasMore = !!(BNFT && BNFT.invHasMore && BNFT.invHasMore());
      const c = (BNFT && BNFT.invCounts && BNFT.invCounts()) || { shown: 0, total: 0 };
      async function doLoadMore(triggerBtn, restoreTxt) {
        if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = '⏳ Loading…'; }
        try {
          const updated = await BNFT.loadMoreInventory(function (sorted) {
            const cEl = document.getElementById('nft-inv-count'); if (cEl) cEl.textContent = sorted.length;
          });
          renderInv(updated);
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
      // Apatinis mygtukas (grid'o gale)
      if (hasMore) {
        const btn = document.createElement('button');
        btn.id = 'nft-inv-loadmore';
        btn.type = 'button';
        btn.textContent = `⬇ Show 24 more units (${c.shown}/${c.total})`;
        btn.style.cssText = 'grid-column:1/-1;padding:12px;margin-top:8px;border-radius:10px;border:1px solid rgba(120,160,120,.4);background:rgba(90,140,90,.15);color:#bde0bd;cursor:pointer;font-weight:600';
        btn.onclick = function () { doLoadMore(btn, `⬇ Show 24 more units (${c.shown}/${c.total})`); };
        grid.appendChild(btn);
      }
      }  // renderInv
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
        setStatus(`Training failed: ${e.shortMessage || e.message}`, 'error');
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
