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
    try {
      // Progresyvus krovimas — aukščiausio lvl unitai pasirodo PIRMI ir žaidėjas
      // gali rinktis nelaukdamas kol visa kolekcija užsikraus (whale-friendly).
      _battleInventory = await window.BarracksNFT.fetchInventory(W.getAddress(), function (sorted, loaded, total) {
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
    // Krovimo / „show all" juosta apačioje
    if (progress && progress.loaded < progress.total) {
      html += `<div class="nft-empty" style="opacity:.7">⏳ Loading more units… ${progress.loaded}/${progress.total} (highest level first — you can pick & play now)</div>`;
    } else if (capped) {
      html += `<button id="nft-battle-showall" type="button" class="nft-battle-showall" style="width:100%;padding:12px;margin-top:8px;border-radius:10px;border:1px solid rgba(140,100,170,.4);background:rgba(122,90,152,.15);color:#c9b8dd;cursor:pointer;font-weight:600">Show all (+${hidden} more)</button>`;
    }
    grid.innerHTML = html;
    if (capped) {
      const sa = document.getElementById('nft-battle-showall');
      if (sa) sa.onclick = function () { _battleShowAll = true; _renderBattleGrid(); };
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
    const totalAll = _battleTotalPicked() + _battleFreeTotal();
    // FREE units +/-
    if (t.dataset.bt) {
      const bt = t.dataset.bt;
      const cur = _battleFreeQty[bt] | 0;
      if (t.classList.contains('nft-battle-free-plus')) {
        if (cur < FREE_MAX_PER_TYPE && totalAll < BATTLE_MAX_TOTAL) {
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
        if (cur < max && totalAll < BATTLE_MAX_TOTAL) {
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
    try {
      const units = await window.BarracksNFT.fetchInventory(addr, function (sorted, loaded, total) {
        const cEl = document.getElementById('nft-inv-count');
        if (cEl) cEl.textContent = loaded + (loaded < total ? '/' + total : '');
        if (loaded < total) grid.innerHTML = '<div class="nft-empty">⏳ Loading units… ' + loaded + '/' + total + '</div>';
      });
      document.getElementById('nft-inv-count').textContent = units.length;
      if (units.length === 0) {
        grid.innerHTML = '<div class="nft-empty">No NFT units yet — train your first!</div>';
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

      grid.innerHTML = groupedArr.map(g => {
        const rarityCls = g.rarity === 'rare' ? 'rare' : '';
        const veteranCls = g.level >= 10 ? 'veteran' : '';
        const winRate = g.battles > 0 ? Math.round((g.wins / g.battles) * 100) : 0;
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
        return `<div class="nft-inv-card ${rarityCls} ${veteranCls}">
          ${stackBadge}
          <div class="nft-card-img-wrap">
            <img src="${g.image}" alt="${g.name}">
            <div class="nft-card-lvl-badge">Lv ${g.level}</div>
          </div>
          <div class="nft-card-header">
            <span class="nft-card-name">${g.name}</span>
            <span class="nft-card-id">${idText}</span>
          </div>
          <div class="nft-card-title">${title}</div>
          <div class="nft-card-xp-block">
            <div class="nft-xp-header">
              <span class="nft-xp-label">XP</span>
              <span class="nft-xp-value">${g.xp.toLocaleString()} / ${nextThreshold.toLocaleString()}</span>
            </div>
            <div class="nft-xp-bar"><div class="nft-xp-fill" style="width:${xpProgress}%"></div></div>
            <div class="nft-xp-next">${xpToNext.toLocaleString()} XP to Lv ${g.level + 1}</div>
          </div>
          <div class="nft-card-stats-grid">
            <div class="nft-stat-cell">
              <div class="nft-stat-icon">⚔</div>
              <div class="nft-stat-num">${g.kills.toLocaleString()}</div>
              <div class="nft-stat-name">KILLS</div>
            </div>
            <div class="nft-stat-cell">
              <div class="nft-stat-icon">🏆</div>
              <div class="nft-stat-num">${g.wins}</div>
              <div class="nft-stat-name">WINS</div>
            </div>
            <div class="nft-stat-cell">
              <div class="nft-stat-icon">⛨</div>
              <div class="nft-stat-num">${g.battles}</div>
              <div class="nft-stat-name">BATTLES</div>
            </div>
          </div>
          <div class="nft-card-winrate">
            <span>WIN RATE</span><strong>${winRate}%</strong>
          </div>
          <div class="nft-card-actions">
            <a href="${marketUrl}" target="_blank" class="nft-card-link market" title="Sell on Ronin Market">SELL</a>
          </div>
        </div>`;
      }).join('');
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
