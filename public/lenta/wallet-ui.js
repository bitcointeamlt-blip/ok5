// wallet-ui.js — UI pill + dropdown + NFT gallery
// Depends on window.Wallet (from wallet.js). Styling via .wui-* classes in style.css.
(function () {
  'use strict';

  if (!window.Wallet) { console.warn('[wallet-ui] window.Wallet missing'); return; }

  let pillEl = null;
  let dropdownEl = null;
  let galleryEl = null;
  let dropdownOpen = false;
  let _ronCache = null;   // RON balanso kešas dropdown'ui (kad neflickerintų tarp renderų)

  // ── Pill creation (floating, fixed top-right) ──
  function ensurePill() {
    if (pillEl) return pillEl;
    pillEl = document.createElement('div');
    pillEl.id = 'wui-pill-root';
    pillEl.className = 'wui-pill-root';
    pillEl.innerHTML = `
      <div class="wui-pill-row">
        <button type="button" class="wui-menu-toggle" id="wui-menu-toggle" title="Menu" aria-label="Toggle menu">☰</button>
        <button type="button" class="wui-pill" id="wui-pill-btn"></button>
        <button type="button" class="wui-castle-btn wui-inv-btn" id="wui-inv-btn" title="Inventory" style="display:none"></button>
        <button type="button" class="wui-castle-btn wui-rewards-btn" id="wui-rewards-btn" title="Rewards" style="display:none"></button>
        <button type="button" class="wui-castle-btn wui-upgrade-btn" id="wui-upgrade-btn" title="Upgrade" style="display:none"></button>
        <button type="button" class="wui-castle-btn wui-pewpew-btn" id="wui-pewpew-btn" title="PewPew Room (F12)" style="display:none">PEWPEW</button>
        <button type="button" class="wui-castle-btn wui-trophy-btn" id="wui-trophy-btn" title="Trophies" style="display:none">TROPHIES</button>
        <button type="button" class="wui-castle-btn wui-swap-btn" id="wui-swap-btn" title="Swap RON / RONKE" style="display:none"><span class="wui-swap-inner"><span class="wui-swap-coins"><img src="assets_tiny/ronin_logo.png" alt="" draggable="false"/><img src="assets_tiny/ronke_logo.png" alt="" draggable="false"/></span><span class="wui-swap-label">⇄ SWAP</span></span></button>
        <button type="button" class="wui-castle-btn wui-home-btn" id="wui-home-btn" title="Home (Floor 10)" style="display:none"></button>
      </div>
      <div class="wui-dropdown" id="wui-dropdown" style="display:none"></div>
    `;
    document.body.appendChild(pillEl);

    const btn = pillEl.querySelector('#wui-pill-btn');
    btn.addEventListener('click', onPillClick);

    const invBtn = pillEl.querySelector('#wui-inv-btn');
    invBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.toggleInventory === 'function') window.toggleInventory();
    });

    const rewardsBtn = pillEl.querySelector('#wui-rewards-btn');
    rewardsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.showRewards === 'function') window.showRewards();
    });

    const upgradeBtn = pillEl.querySelector('#wui-upgrade-btn');
    upgradeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.toggleHubOverlay === 'function') window.toggleHubOverlay();
    });

    const homeBtn = pillEl.querySelector('#wui-home-btn');
    homeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.goToFloor === 'function') window.goToFloor(10);
    });

    const pewpewBtn = pillEl.querySelector('#wui-pewpew-btn');
    pewpewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.gotoF12 === 'function') window.gotoF12();
    });

    const trophyBtn = pillEl.querySelector('#wui-trophy-btn');
    trophyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.openTrophyPanel === 'function') window.openTrophyPanel();
    });

    const swapBtn = pillEl.querySelector('#wui-swap-btn');
    swapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.openRonkeSwap === 'function') window.openRonkeSwap();
    });

    // ── Collapsible menu toggle (mobiliam mygtukai užstodavo žaidimo vaizdą) ──
    const menuToggle = pillEl.querySelector('#wui-menu-toggle');
    function _applyCollapsed(collapsed) {
      pillEl.classList.toggle('is-collapsed', collapsed);
      menuToggle.textContent = collapsed ? '☰' : '✕';
    }
    if (menuToggle) {
      menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const collapsed = !pillEl.classList.contains('is-collapsed');
        _applyCollapsed(collapsed);
        try { localStorage.setItem('wuiMenuCollapsed', collapsed ? '1' : '0'); } catch (_) {}
      });
      // Default: IŠSKLEISTA (mygtukai matosi kaip anksčiau). Mobiliam ☰ leidžia
      // susilankstyti kai užstoja vaizdą. Pasirinkimas įsimenamas.
      let startCollapsed = false;
      try { const saved = localStorage.getItem('wuiMenuCollapsed'); if (saved !== null) startCollapsed = (saved === '1'); } catch (_) {}
      _applyCollapsed(startCollapsed);
    }

    dropdownEl = pillEl.querySelector('#wui-dropdown');

    // Observe #screen-game class changes to toggle inventory button visibility
    const screenGame = document.getElementById('screen-game');
    if (screenGame && window.MutationObserver) {
      const mo = new MutationObserver(() => render());
      mo.observe(screenGame, { attributes: true, attributeFilter: ['class'] });
    }
    // Observe #hub-overlay open/close to swap UPGRADE button icon
    const hubOverlay = document.getElementById('hub-overlay');
    if (hubOverlay && window.MutationObserver) {
      const mo2 = new MutationObserver(() => render());
      mo2.observe(hubOverlay, { attributes: true, attributeFilter: ['class'] });
    }
    // Observe #rewards-overlay open/close to swap REWARDS button icon
    const rewardsOverlay = document.getElementById('rewards-overlay');
    if (rewardsOverlay && window.MutationObserver) {
      const mo3 = new MutationObserver(() => render());
      mo3.observe(rewardsOverlay, { attributes: true, attributeFilter: ['class'] });
    }
    // Observe #inv-overlay open/close to swap INVENTORY button icon
    const invOverlay = document.getElementById('inv-overlay');
    if (invOverlay && window.MutationObserver) {
      const mo4 = new MutationObserver(() => render());
      mo4.observe(invOverlay, { attributes: true, attributeFilter: ['class'] });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!dropdownOpen) return;
      if (pillEl.contains(e.target)) return;
      closeDropdown();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeDropdown(); closeGallery(); }
    });
    return pillEl;
  }

  // ── PEWPEW button — TIKRAS game sphere sprite + hover liquid fill animacija ──
  // Naudoja tą patį 5-band Lambertian shading kaip žaidime + cache'ina sprite'us.
  const _PEWPEW_R = 14;            // sphere radius (sprite size = 30×30, chunky px)
  const _PEWPEW_PX = 2;            // chunky pixel size (kaip žaidime)
  let _pewpewBtnInit = false;
  let _pewpewAnimRaf = 0;
  let _pewpewAnimStart = 0;
  let _pewpewAnimType = null;
  let _pewpewHovering = false;
  let _whiteSphereSpr = null;
  // Baltas sferos sprite — tas pats 5-band Lambertian shading kaip žaidime, bet su balta palete
  function _getWhiteSphereSprite(r) {
    if (_whiteSphereSpr && _whiteSphereSpr.r === r) return _whiteSphereSpr;
    const ri = Math.max(4, Math.round(r));
    const PX = _PEWPEW_PX;
    // 5 baltos paletės juostos (atitinka game shading kaip _getPixelSphereSprite)
    const bands = [
      [110, 110, 110],   // 0: edge dark
      [165, 165, 165],   // 1: shadow side
      [215, 215, 215],   // 2: front
      [240, 240, 240],   // 3: top
      [255, 255, 255],   // 4: highlight
    ];
    const lx = -0.45, ly = -0.55, lz = 0.70;
    const ll = Math.sqrt(lx*lx + ly*ly + lz*lz);
    const Lx = lx/ll, Ly = ly/ll, Lz = lz/ll;
    const sz = (ri + 1) * 2;
    const off = document.createElement('canvas');
    off.width = sz; off.height = sz;
    const oc = off.getContext('2d');
    const cc = sz / 2;
    for (let dy = -ri; dy <= ri; dy += PX) {
      for (let dx = -ri; dx <= ri; dx += PX) {
        const distSq = dx*dx + dy*dy;
        if (distSq > ri*ri) continue;
        const nx = dx / ri, ny = dy / ri;
        const nz2 = 1 - nx*nx - ny*ny;
        const nz = nz2 > 0 ? Math.sqrt(nz2) : 0;
        const intensity = Math.max(0, nx*Lx + ny*Ly + nz*Lz);
        const edgeFactor = 1 - distSq / (ri*ri);
        const adjI = intensity * (0.5 + 0.5 * edgeFactor);
        let band;
        if (adjI > 0.85) band = 4;
        else if (adjI > 0.55) band = 3;
        else if (adjI > 0.04) band = 2;
        else if (adjI > 0.10) band = 1;
        else band = 0;
        const [bR, bG, bB] = bands[band];
        oc.fillStyle = `rgb(${bR},${bG},${bB})`;
        oc.fillRect(cc + dx, cc + dy, PX, PX);
      }
    }
    // Specular highlight (viršuj-kairėj — tas pats kaip game sphere)
    const hxC = cc + Math.round(-ri * 0.42 / PX) * PX;
    const hyC = cc + Math.round(-ri * 0.45 / PX) * PX;
    oc.fillStyle = '#fff';
    oc.fillRect(hxC, hyC, PX, PX);
    oc.fillRect(hxC + PX, hyC, PX, PX);
    oc.fillRect(hxC, hyC + PX, PX, PX);
    _whiteSphereSpr = { canvas: off, size: sz, r: r };
    return _whiteSphereSpr;
  }
  function _drawPewpewIdle(canvas) {
    const cctx = canvas.getContext('2d');
    cctx.clearRect(0, 0, canvas.width, canvas.height);
    cctx.imageSmoothingEnabled = false;
    const spr = _getWhiteSphereSprite(_PEWPEW_R);
    const dx = Math.round((canvas.width - spr.size) / 2);
    const dy = Math.round((canvas.height - spr.size) / 2);
    cctx.drawImage(spr.canvas, dx, dy);
  }
  let _pewpewLastCycle = -1;
  function _drawPewpewAnim(canvas, t) {
    const cctx = canvas.getContext('2d');
    cctx.clearRect(0, 0, canvas.width, canvas.height);
    cctx.imageSmoothingEnabled = false;
    if (!window._F12 || !window._F12.getPixelSphereSprite) {
      _drawPewpewIdle(canvas); return;
    }
    const r = _PEWPEW_R, ri = r, PX = _PEWPEW_PX;
    // ── Ciklas: FILL (1000ms) → SHINE SWEEP (380ms) → PAUSE (300ms) → restart su nauja spalva ──
    const FILL_MS = 1000;
    const SHINE_MS = 380;
    const PAUSE_MS = 300;
    const cycleMs = FILL_MS + SHINE_MS + PAUSE_MS;       // 1680ms
    const elapsed = t - _pewpewAnimStart;
    const cycleIdx = Math.floor(elapsed / cycleMs);
    const cycleT = elapsed - cycleIdx * cycleMs;
    // Naujas ciklas → nauja spalva
    if (cycleIdx !== _pewpewLastCycle) {
      _pewpewLastCycle = cycleIdx;
      _pewpewAnimType = window._F12.pickRandomType();
    }
    // Fazės
    let rp, shineK = -1;
    if (cycleT < FILL_MS) {
      rp = cycleT / FILL_MS;            // 0..1 — užsipildo
    } else if (cycleT < FILL_MS + SHINE_MS) {
      rp = 1;                            // pilnai užpildyta
      shineK = (cycleT - FILL_MS) / SHINE_MS;  // 0..1 — shine sweep progress
    } else {
      rp = 1;                            // pilnai užpildyta, pauzė
    }
    // TIKRAS žaidimo sphere sprite (5-band Lambertian shading)
    const colorSpr = window._F12.getPixelSphereSprite(_pewpewAnimType, r);
    const cx = Math.round(canvas.width / 2);
    const cy = Math.round(canvas.height / 2);
    const sprDx = cx - Math.round(colorSpr.size / 2);
    const sprDy = cy - Math.round(colorSpr.size / 2);
    // Bazė: spalvotas sphere
    cctx.drawImage(colorSpr.canvas, sprDx, sprDy);
    // Overlay: balti pikseliai virš wavy fill line (kol fill phase)
    const lx = -0.45, ly = -0.55, lz = 0.70;
    const ll = Math.sqrt(lx*lx + ly*ly + lz*lz);
    const Lx = lx/ll, Ly = ly/ll, Lz = lz/ll;
    const wbands = [
      [110,110,110], [165,165,165], [215,215,215], [240,240,240], [255,255,255]
    ];
    if (rp < 1) {
      const fillBaseY = (cy + ri) - 2 * ri * rp;
      for (let dy = -ri; dy <= ri; dy += PX) {
        for (let dx = -ri; dx <= ri; dx += PX) {
          const distSq = dx*dx + dy*dy;
          if (distSq > ri*ri) continue;
          const py = cy + dy;
          const localFillY = fillBaseY + Math.sin(t * 0.008 + (cx + dx) * 0.4) * 1;
          if (py >= localFillY) continue;
          const nx = dx / ri, ny = dy / ri;
          const nz2 = 1 - nx*nx - ny*ny;
          const nz = nz2 > 0 ? Math.sqrt(nz2) : 0;
          const intensity = Math.max(0, nx*Lx + ny*Ly + nz*Lz);
          const edgeFactor = 1 - distSq / (ri*ri);
          const adjI = intensity * (0.5 + 0.5 * edgeFactor);
          let band;
          if (adjI > 0.85) band = 4;
          else if (adjI > 0.55) band = 3;
          else if (adjI > 0.04) band = 2;
          else if (adjI > 0.10) band = 1;
          else band = 0;
          const [bR, bG, bB] = wbands[band];
          cctx.fillStyle = `rgb(${bR},${bG},${bB})`;
          cctx.fillRect(cx + dx, cy + dy, PX, PX);
        }
      }
      // Specular highlight (matomas kol balta dalis dar uždengia)
      if (rp < 0.85) {
        const hxC = cx + Math.round(-ri * 0.42 / PX) * PX;
        const hyC = cy + Math.round(-ri * 0.45 / PX) * PX;
        cctx.fillStyle = '#fff';
        cctx.fillRect(hxC, hyC, PX, PX);
        cctx.fillRect(hxC + PX, hyC, PX, PX);
        cctx.fillRect(hxC, hyC + PX, PX, PX);
      }
    }
    // ── POLISHED GEM SHINE — diagonali šviesos juosta sweep'ina sferą po pripildymo ──
    if (shineK >= 0) {
      const sweepRange = ri * Math.SQRT2 * 2;
      const sweepPos = -ri * Math.SQRT2 + sweepRange * shineK;
      const sweepWidth = ri * 0.40;
      const lifeFade = Math.sin(shineK * Math.PI);   // 0→1→0 envelope
      for (let dy = -ri; dy <= ri; dy += PX) {
        for (let dx = -ri; dx <= ri; dx += PX) {
          if (dx*dx + dy*dy > ri*ri) continue;
          const proj = (dx + dy) * 0.7071;
          const distFromSweep = Math.abs(proj - sweepPos);
          if (distFromSweep > sweepWidth) continue;
          const bandK = 1 - distFromSweep / sweepWidth;
          const intensity = bandK * lifeFade * 0.95;
          cctx.fillStyle = `rgba(255,255,255,${intensity})`;
          cctx.fillRect(cx + dx, cy + dy, PX, PX);
        }
      }
    }
  }
  function _animatePewpewLoop() {
    if (!_pewpewHovering) return;
    const btn = document.getElementById('wui-pewpew-btn');
    if (!btn) return;
    const canvas = btn.querySelector('canvas');
    if (canvas) _drawPewpewAnim(canvas, performance.now());
    _pewpewAnimRaf = requestAnimationFrame(_animatePewpewLoop);
  }
  function _setupPewpewBtn(btn) {
    if (!_pewpewBtnInit) {
      _pewpewBtnInit = true;
      btn.innerHTML = `<canvas width="44" height="44" style="image-rendering:pixelated;width:44px;height:44px;display:block;"></canvas><span class="wui-home-hint wui-pewpew-hint">▶ PLAY</span>`;
      btn.addEventListener('mouseenter', () => {
        _pewpewHovering = true;
        _pewpewAnimStart = performance.now();
        _pewpewLastCycle = -1;       // reset cycle counter, kad iškart pirmas frame'as parinktų spalvą
        _pewpewAnimType = window._F12 && window._F12.pickRandomType ? window._F12.pickRandomType() : 'arrow';
        cancelAnimationFrame(_pewpewAnimRaf);
        _animatePewpewLoop();
      });
      btn.addEventListener('mouseleave', () => {
        _pewpewHovering = false;
        cancelAnimationFrame(_pewpewAnimRaf);
        const c = btn.querySelector('canvas');
        if (c) _drawPewpewIdle(c);
      });
    }
    if (!_pewpewHovering) {
      const c = btn.querySelector('canvas');
      if (c) _drawPewpewIdle(c);
    }
  }

  function render() {
    ensurePill();
    const st = Wallet.snapshot();
    const btn = pillEl.querySelector('#wui-pill-btn');
    const invBtn = pillEl.querySelector('#wui-inv-btn');
    const rewardsBtnEl = pillEl.querySelector('#wui-rewards-btn');
    const upgradeBtnEl = pillEl.querySelector('#wui-upgrade-btn');
    const pewpewBtnEl = pillEl.querySelector('#wui-pewpew-btn');
    const homeBtnEl = pillEl.querySelector('#wui-home-btn');

    // Chest SVG (pixel-art medieval treasure chest for inventory)
    const chestSvg = `
      <svg class="wui-castle-img" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
        <!-- chest lid -->
        <rect x="10" y="18" width="44" height="4" fill="#3d2817"/>
        <rect x="10" y="22" width="44" height="8" fill="#8a5a33"/>
        <rect x="10" y="22" width="2" height="8" fill="#3d2817"/>
        <rect x="52" y="22" width="2" height="8" fill="#3d2817"/>
        <rect x="12" y="24" width="4" height="4" fill="#a06a3f"/>
        <!-- metal bands on lid -->
        <rect x="20" y="22" width="3" height="8" fill="#4a4a52"/>
        <rect x="41" y="22" width="3" height="8" fill="#4a4a52"/>
        <rect x="20" y="22" width="3" height="2" fill="#6a6a74"/>
        <rect x="41" y="22" width="3" height="2" fill="#6a6a74"/>
        <!-- lock -->
        <rect x="28" y="28" width="8" height="6" fill="#ffcf5c"/>
        <rect x="28" y="28" width="8" height="2" fill="#3d2817"/>
        <rect x="28" y="32" width="8" height="2" fill="#a8823e"/>
        <rect x="31" y="30" width="2" height="2" fill="#3d2817"/>
        <!-- chest body -->
        <rect x="10" y="30" width="44" height="4" fill="#3d2817"/>
        <rect x="10" y="34" width="44" height="16" fill="#6b4a2e"/>
        <rect x="10" y="34" width="2" height="16" fill="#3d2817"/>
        <rect x="52" y="34" width="2" height="16" fill="#3d2817"/>
        <rect x="10" y="50" width="44" height="3" fill="#3d2817"/>
        <!-- metal bands on body -->
        <rect x="20" y="34" width="3" height="16" fill="#4a4a52"/>
        <rect x="41" y="34" width="3" height="16" fill="#4a4a52"/>
        <rect x="20" y="34" width="3" height="2" fill="#6a6a74"/>
        <rect x="41" y="34" width="3" height="2" fill="#6a6a74"/>
        <!-- highlight -->
        <rect x="12" y="36" width="2" height="10" fill="#8a5a33" opacity="0.8"/>
        <!-- feet -->
        <rect x="12" y="53" width="4" height="3" fill="#3d2817"/>
        <rect x="48" y="53" width="4" height="3" fill="#3d2817"/>
      </svg>
    `;

    // Per-PNG background colors sampled from the actual image corners,
    // so the button body blends seamlessly with the image backdrop
    // (no more visible "crop square" between PNG and button color).
    const BG = {
      walletIdle:    '#5f3f27',
      walletActive:  '#5f3b23',
      rewardsIdle:   '#67472c',
      rewardsActive: '#62462e',
      upgradeIdle:   '#5c3e28',
      upgradeActive: '#553722',
      invActive:     '#66462b',
      invIdleSvg:    '#6b4a2e',
    };

    // Rewards — user-provided pixel-art treasure chest PNG (active = open chest with sparkles)
    const rewardsOv = document.getElementById('rewards-overlay');
    const rewardsActive = rewardsOv && !rewardsOv.classList.contains('hidden');
    const rewardsSrc = rewardsActive ? 'assets_tiny/rewards_chest_active.png' : 'assets_tiny/rewards_chest.png';
    const rewardsBg  = rewardsActive ? BG.rewardsActive : BG.rewardsIdle;
    const rewardsImg = `<img class="wui-castle-img" src="${rewardsSrc}" alt="" draggable="false"/>`;

    // Upgrade — user-provided pixel-art anvil + hammer PNG (active = striking sparks)
    const hubOv = document.getElementById('hub-overlay');
    const upgradeActive = hubOv && hubOv.classList.contains('active');
    const upgradeSrc = upgradeActive ? 'assets_tiny/upgrade_anvil_active.png' : 'assets_tiny/upgrade_anvil.png';
    const upgradeBg  = upgradeActive ? BG.upgradeActive : BG.upgradeIdle;
    const anvilSvg  = `<img class="wui-castle-img" src="${upgradeSrc}" alt="" draggable="false"/>`;

    // Inventory — SVG chest (idle) / user-provided open chest PNG (active)
    const invOv = document.getElementById('inv-overlay');
    const invActive = invOv && invOv.classList.contains('active');
    const invBg = invActive ? BG.invActive : BG.invIdleSvg;
    const invIcon = invActive
      ? `<img class="wui-castle-img" src="assets_tiny/inventory_chest_active.png" alt="" draggable="false"/>`
      : chestSvg;

    // Show inventory & rewards buttons only in adventure mode
    const screenGame = document.getElementById('screen-game');
    const inAdv = screenGame && screenGame.classList.contains('active') && screenGame.classList.contains('adv-mode');
    if (invBtn) {
      invBtn.style.display = inAdv ? 'flex' : 'none';
      invBtn.style.background = invBg;
      invBtn.innerHTML = `${invIcon}<span class="wui-inv-hint">INVENTORY</span>`;
    }
    if (rewardsBtnEl) {
      rewardsBtnEl.style.display = inAdv ? 'flex' : 'none';
      rewardsBtnEl.style.background = rewardsBg;
      rewardsBtnEl.innerHTML = `${rewardsImg}<span class="wui-rewards-hint">REWARDS</span>`;
    }
    if (upgradeBtnEl) {
      upgradeBtnEl.style.display = inAdv ? 'flex' : 'none';
      upgradeBtnEl.style.background = upgradeBg;
      upgradeBtnEl.innerHTML = `${anvilSvg}<span class="wui-upgrade-hint">UPGRADE</span>`;
    }
    // Dabartinis floor — skaitom iš UI label'o (S yra module-scope, neprieinamas iš čia).
    // floor-nav-label rodo "HOME" jei F10, "F12" jei F12, ir t.t.
    const _floorLbl = document.getElementById('floor-nav-label');
    const _floorTxt = _floorLbl ? _floorLbl.textContent.trim() : '';
    const isHome = (_floorTxt === 'HOME');
    const isF12 = (_floorTxt === 'F12');
    if (homeBtnEl) {
      homeBtnEl.style.display = (inAdv && !isHome) ? 'flex' : 'none';
      homeBtnEl.style.background = '#6b4a2e';
      homeBtnEl.innerHTML = `<img class="wui-castle-img" src="assets_tiny/Buildings_Castle.png" alt="" draggable="false"/><span class="wui-home-hint">HOME</span>`;
    }
    if (pewpewBtnEl) {
      // PewPew Room — F12 cannon merge floor (tikras barrel sprite + hover liquid fill anim)
      pewpewBtnEl.style.display = (inAdv && !isF12) ? 'flex' : 'none';
      pewpewBtnEl.style.background = '#6b4a2e';
      _setupPewpewBtn(pewpewBtnEl);
    }

    // Trophies button — visible same conditions as PewPew (adventure floors)
    const trophyBtnEl = pillEl.querySelector('#wui-trophy-btn');
    if (trophyBtnEl) {
      trophyBtnEl.style.display = inAdv ? 'flex' : 'none';
      trophyBtnEl.style.background = '#ffcf5c';
      trophyBtnEl.style.color = '#1a1208';
      trophyBtnEl.style.fontWeight = '700';
      trophyBtnEl.style.border = '2px solid #8a5a18';
    }

    // Swap button — RON ↔ RONKE (PewPewSwap). Po Trophies, tos pačios sąlygos (adventure floors).
    // Stilius CSS'e (.wui-swap-btn) — čia tik matomumas.
    const swapBtnEl = pillEl.querySelector('#wui-swap-btn');
    if (swapBtnEl) swapBtnEl.style.display = inAdv ? 'flex' : 'none';

    // Wallet — user-provided pixel-art Ronin wallet PNG (idle = closed, active = with coins)
    const walletSrc = st.connected ? 'assets_tiny/wallet_ronin_active.png' : 'assets_tiny/wallet_ronin.png';
    const walletBg  = st.connected ? BG.walletActive : BG.walletIdle;
    btn.style.background = walletBg;
    const purseSvg = `<img class="wui-castle-img" src="${walletSrc}" alt="" draggable="false"/>`;
    if (!st.connected) {
      btn.className = 'wui-castle-btn wui-castle-disconnected';
      btn.title = 'Connect Ronin Wallet';
      btn.innerHTML = `
        ${purseSvg}
        <span class="wui-castle-hint">CONNECT</span>
      `;
    } else {
      const nftCount = Array.isArray(st.nfts) ? st.nfts.length : (st.nftsLoading ? '…' : '—');
      btn.className = 'wui-castle-btn wui-castle-connected';
      btn.title = 'Ronin Wallet · ' + Wallet.shortAddress();
      btn.innerHTML = `
        ${purseSvg}
        <span class="wui-castle-dot"></span>
        ${nftCount !== '—' && nftCount !== 0 ? `<span class="wui-castle-nftbadge">${nftCount}</span>` : ''}
      `;
    }
    if (dropdownOpen) renderDropdown();
  }

  function onPillClick(e) {
    e.stopPropagation();
    const st = Wallet.snapshot();
    if (!st.connected) {
      handleConnect();
      return;
    }
    if (dropdownOpen) closeDropdown(); else openDropdown();
  }

  // Ar yra native injected Ronin (extension PC / Ronin in-app naršyklė)?
  function _hasInjectedRonin() {
    try { return !!(window.ronin && (window.ronin.provider || typeof window.ronin.request === 'function')); }
    catch (_) { return false; }
  }

  // Connect chooser modal — rodomas tik kai NĖRA injected Ronin (pvz. Chrome mobile).
  // Pasirinkimai: Ronin Wallet (mobile app per WalletConnect) / Email arba Social (Waypoint).
  function _showConnectChooser() {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(10,14,24,0.82);display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,sans-serif;';
      // Phantom (Solana) — rodom jei Phantom įdiegtas. Po nugaros = embedded Ronin wallet.
      const phantomBtn = (window.PhantomRonin && window.PhantomRonin.isAvailable())
        ? '<button data-m="phantom" style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;margin-top:10px;border-radius:10px;border:2px solid #9945FF;background:#2a1640;color:#f0e6ff;font-weight:700;font-size:14px;cursor:pointer;">' +
          '<span style="font-size:20px;">◎</span><div style="text-align:left;"><div>Phantom (Solana)</div><div style="font-size:11px;opacity:.7;font-weight:400;">Play with your Solana wallet</div></div></button>'
        : '';
      ov.innerHTML =
        '<div style="background:linear-gradient(180deg,#1a2238,#0f1424);border:2px solid #4a9da6;border-radius:14px;padding:18px 18px 16px;width:min(340px,90vw);box-shadow:0 12px 40px rgba(0,0,0,.55);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<span style="color:#ffcf5c;font-weight:800;font-size:16px;">Connect Wallet</span>' +
        '<button data-x style="background:#e85d5d;color:#fff;border:none;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer;">✕</button></div>' +
        '<button data-m="roninwc" style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;margin-bottom:10px;border-radius:10px;border:2px solid #4a9da6;background:#15324a;color:#e8f4f6;font-weight:700;font-size:14px;cursor:pointer;">' +
        '<span style="font-size:20px;">🔷</span><div style="text-align:left;"><div>Ronin Wallet</div><div style="font-size:11px;opacity:.7;font-weight:400;">Mobile app or extension</div></div></button>' +
        '<button data-m="waypoint" style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:10px;border:2px solid #6b4a2e;background:#2a1f12;color:#f5e6c3;font-weight:700;font-size:14px;cursor:pointer;">' +
        '<span style="font-size:20px;">✉️</span><div style="text-align:left;"><div>Email or Social</div><div style="font-size:11px;opacity:.7;font-weight:400;">Sign in with Waypoint</div></div></button>' +
        phantomBtn +
        '</div>';
      document.body.appendChild(ov);
      function done(v) { try { ov.remove(); } catch (_) {} resolve(v); }
      ov.addEventListener('click', (e) => {
        if (e.target === ov || e.target.closest('[data-x]')) return done(null);
        const b = e.target.closest('[data-m]');
        if (b) done(b.getAttribute('data-m'));
      });
    });
  }

  async function handleConnect() {
    const hasPhantom = !!(window.PhantomRonin && window.PhantomRonin.isAvailable());
    // Nieko nėra (nei Ronin, nei Phantom) → siūlom įsidiegti.
    if (!Wallet.isInstalled() && !hasPhantom) {
      showToast('No wallet found. Install Ronin Wallet or Phantom', 'error', 5000);
      setTimeout(() => { window.open('https://wallet.roninchain.com/', '_blank'); }, 300);
      return;
    }
    // Injected Ronin BE Phantom → jungiam tiesiai (greitas kelias). Jei yra Phantom (arba nėra
    // injected Ronin) → rodom chooser, kad žmogus galėtų pasirinkti Phantom / Ronin / Email.
    let method;
    if (_hasInjectedRonin() && !hasPhantom) {
      method = 'ronin';
    } else {
      method = await _showConnectChooser();
      if (!method) return;   // user uždarė chooser'į
      // „Ronin Wallet" pasirinkimas kai yra injected extension → naudok tiesiogiai (ne WalletConnect).
      if (method === 'roninwc' && _hasInjectedRonin()) method = 'ronin';
    }
    try {
      showToast('Connecting wallet…', 'ok', 30000);  // feedback (telefonui — kad matytų, jog vyksta)
      if (method === 'phantom') await Wallet.connectPhantom();   // Solana → embedded Ronin
      else await Wallet.connect(method);
      showToast('Connected: ' + Wallet.shortAddress(), 'ok');
    } catch (e) {
      showToast(e && e.message ? e.message : 'Connect failed', 'error');
    }
  }

  function openDropdown() {
    if (!dropdownEl) return;
    dropdownOpen = true;
    dropdownEl.style.display = 'block';
    renderDropdown();
  }
  function closeDropdown() {
    if (!dropdownEl) return;
    dropdownOpen = false;
    dropdownEl.style.display = 'none';
  }

  function renderDropdown() {
    const st = Wallet.snapshot();
    if (!st.connected) { closeDropdown(); return; }
    const bal = (typeof st.ronkeBalance === 'number')
      ? st.ronkeBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })
      : (st.balLoading ? 'Loading…' : '—');
    const nftCount = Array.isArray(st.nfts) ? st.nfts.length : (st.nftsLoading ? 'Loading…' : '—');
    const addr = st.address || '';
    // Phantom-derived piniginė → siūlom „Export" (raktą galima importuoti į Ronin Wallet → Mavis Market, full control).
    const isPhantom = !!(window.PhantomRonin && window.PhantomRonin.isConnected && window.PhantomRonin.isConnected());
    const ddIcon = `<img class="wui-dd-brand-ico wui-dd-brand-ico-img" src="assets_tiny/ronin_logo.png" alt="Ronin" draggable="false"/>`;
    dropdownEl.innerHTML = `
      <div class="wui-dd-header">
        <div class="wui-dd-brand">${ddIcon}<div class="wui-dd-title">RONIN WALLET</div></div>
        <button type="button" class="wui-dd-close" id="wui-dd-close" title="Close">×</button>
      </div>
      <div class="wui-dd-addr-wrap">
        <div class="wui-dd-addr-lbl">ADDRESS</div>
        <div class="wui-dd-addr">
          <span class="wui-dd-addr-val">${addr}</span>
          <button type="button" class="wui-dd-copy" id="wui-dd-copy" title="Copy address">COPY</button>
        </div>
      </div>
      <div class="wui-dd-stats">
        <div class="wui-dd-stat wui-dd-stat-ron">
          <div class="wui-dd-stat-lbl"><img class="wui-dd-stat-ico wui-dd-stat-ico-img" src="assets_tiny/ronin_logo.png" alt="RON" draggable="false"/>RON</div>
          <div class="wui-dd-stat-val" id="wui-dd-ron-val">${_ronCache != null ? _ronCache : '…'}</div>
          <button type="button" class="wui-dd-refresh" id="wui-dd-refresh-ron" title="Refresh RON">↻</button>
        </div>
        <div class="wui-dd-stat wui-dd-stat-ronke">
          <div class="wui-dd-stat-lbl"><img class="wui-dd-stat-ico wui-dd-stat-ico-img" src="assets_tiny/ronke_logo.png" alt="RONKE" draggable="false"/>RONKE</div>
          <div class="wui-dd-stat-val">${bal}</div>
          <button type="button" class="wui-dd-refresh" id="wui-dd-refresh-bal" title="Refresh balance">↻</button>
        </div>
        <div class="wui-dd-stat wui-dd-stat-nfts">
          <div class="wui-dd-stat-lbl"><span class="wui-dd-stat-ico">▣</span>NFTs</div>
          <div class="wui-dd-stat-val">${nftCount}</div>
          <button type="button" class="wui-dd-refresh" id="wui-dd-refresh-nfts" title="Refresh NFTs">↻</button>
        </div>
      </div>
      <div class="wui-dd-actions">
        <button type="button" class="wui-dd-btn wui-dd-btn-primary" id="wui-dd-swap">⇄ SWAP RON ↔ RONKE</button>
        <button type="button" class="wui-dd-btn wui-dd-btn-primary" id="wui-dd-gallery">▣ VIEW NFTS</button>
        <button type="button" class="wui-dd-btn wui-dd-btn-primary" id="wui-dd-sendnft">⤳ SEND UNIT NFT</button>
        ${isPhantom ? '<button type="button" class="wui-dd-btn wui-dd-btn-primary" id="wui-dd-export" style="border-color:#9945FF;">◎ EXPORT WALLET KEY</button>' : ''}
        <button type="button" class="wui-dd-btn wui-dd-btn-danger" id="wui-dd-disconnect">⎋ DISCONNECT</button>
      </div>
    `;
    dropdownEl.querySelector('#wui-dd-close').onclick = closeDropdown;
    { const snb = dropdownEl.querySelector('#wui-dd-sendnft'); if (snb) snb.onclick = () => { closeDropdown(); _showSendNftModal(addr); }; }
    if (isPhantom) { const exb = dropdownEl.querySelector('#wui-dd-export'); if (exb) exb.onclick = () => { closeDropdown(); _showExportModal(addr); }; }
    dropdownEl.querySelector('#wui-dd-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(addr); showToast('Address copied', 'ok', 1500); }
      catch { showToast('Copy failed', 'error', 1500); }
    };
    const _fillRon = () => {
      const el = dropdownEl.querySelector('#wui-dd-ron-val'); if (!el) return;
      Wallet.getRonBalance().then((b) => { _ronCache = (Number(b) || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }); el.textContent = _ronCache; })
        .catch(() => { el.textContent = _ronCache != null ? _ronCache : '—'; });
    };
    _fillRon();
    { const rr = dropdownEl.querySelector('#wui-dd-refresh-ron'); if (rr) rr.onclick = _fillRon; }
    dropdownEl.querySelector('#wui-dd-refresh-bal').onclick = () => Wallet.refreshBalance();
    dropdownEl.querySelector('#wui-dd-refresh-nfts').onclick = () => Wallet.refreshNfts();
    dropdownEl.querySelector('#wui-dd-gallery').onclick = () => { closeDropdown(); openGallery(); };
    dropdownEl.querySelector('#wui-dd-swap').onclick = () => { closeDropdown(); if (window.openRonkeSwap) window.openRonkeSwap(); };
    dropdownEl.querySelector('#wui-dd-disconnect').onclick = async () => {
      await Wallet.disconnect();
      showToast('Disconnected', 'ok', 1500);
    };
  }

  // ── Export Wallet Key (Phantom-derived) — saugiklis: useris pasiima savo raktą, importuoja
  //    į Ronin Wallet (Import via Private Key) → naudoja Mavis Market, siunčia NFT, full control. ──
  function _showExportModal(addr) {
    let pk = '';
    try { pk = (window.PhantomRonin && window.PhantomRonin.exportPrivateKey && window.PhantomRonin.exportPrivateKey()) || ''; } catch (_) {}
    if (!pk) { showToast('Reconnect Phantom first, then export', 'error', 3000); return; }
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(10,8,16,0.88);display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,sans-serif;padding:14px;';
    ov.innerHTML =
      '<div style="background:linear-gradient(180deg,#1f1530,#140d22);border:2px solid #9945FF;border-radius:14px;padding:18px;width:min(420px,94vw);max-height:94vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.6);color:#f0e6ff;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<span style="color:#c9a6ff;font-weight:800;font-size:15px;">◎ Export Wallet Key</span>' +
          '<button data-x style="background:#e85d5d;color:#fff;border:none;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer;">✕</button></div>' +
        '<div style="background:rgba(232,93,93,.14);border:1px solid #e85d5d;border-radius:9px;padding:10px;font-size:11px;line-height:1.6;margin-bottom:12px;">' +
          '⚠ <b>This is the private key to your in-game wallet.</b> Anyone with it controls your RON, RONKE & NFTs. Never share it or paste it on any website. Store it safely.</div>' +
        '<div style="font-size:10px;color:#b9a6d8;margin-bottom:4px;">Controls address</div>' +
        '<div style="font-size:10px;word-break:break-all;background:#0d0918;border:1px solid #3a2f50;border-radius:8px;padding:8px;margin-bottom:12px;">' + addr + '</div>' +
        '<div style="font-size:10px;color:#b9a6d8;margin-bottom:4px;">Private key</div>' +
        '<div id="wui-pk" style="font-size:10px;font-family:monospace;word-break:break-all;background:#0d0918;border:1px solid #3a2f50;border-radius:8px;padding:8px;margin-bottom:8px;filter:blur(5px);cursor:pointer;user-select:all;">' + pk + '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
          '<button data-reveal style="flex:1;background:#2a1640;color:#e9d8ff;border:2px solid #9945FF;border-radius:8px;padding:9px;font-size:11px;font-weight:700;cursor:pointer;">👁 Reveal</button>' +
          '<button data-copy style="flex:1;background:#9945FF;color:#fff;border:none;border-radius:8px;padding:9px;font-size:11px;font-weight:700;cursor:pointer;">⎘ Copy</button></div>' +
        '<div style="background:rgba(74,157,166,.12);border:1px solid #4a9da6;border-radius:9px;padding:10px;font-size:11px;line-height:1.6;color:#cfeef2;">' +
          '<b>To sell on Ronin Market / send NFTs:</b><br>1. Open <b>Ronin Wallet</b> → Add wallet → <b>Import via Private Key</b><br>2. Paste this key → your in-game wallet appears<br>3. Use <b>Mavis Market</b>, send, or manage freely.</div>' +
      '</div>';
    document.body.appendChild(ov);
    const close = () => { try { ov.remove(); } catch (_) {} };
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
    const pkEl = ov.querySelector('#wui-pk');
    ov.querySelector('[data-reveal]').onclick = () => { pkEl.style.filter = pkEl.style.filter ? '' : 'blur(5px)'; };
    pkEl.onclick = () => { pkEl.style.filter = ''; };
    ov.querySelector('[data-copy]').onclick = async () => {
      try { await navigator.clipboard.writeText(pk); showToast('Private key copied — keep it safe!', 'ok', 2500); }
      catch { pkEl.style.filter = ''; showToast('Copy failed — select & copy manually', 'error', 3000); }
    };
  }

  // ── Send Unit NFT to another Ronin address (ERC721 safeTransferFrom via shim/provider) ──
  function _showSendNftModal(fromAddr) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(10,14,24,0.86);display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,sans-serif;padding:14px;';
    ov.innerHTML =
      '<div style="background:linear-gradient(180deg,#1a2238,#0f1424);border:2px solid #4a9da6;border-radius:14px;padding:18px;width:min(400px,94vw);max-height:94vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.6);color:#e8f4f6;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<span style="color:#ffcf5c;font-weight:800;font-size:15px;">⤳ Send Unit NFT</span>' +
          '<button data-x style="background:#e85d5d;color:#fff;border:none;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer;">✕</button></div>' +
        '<div style="font-size:11px;line-height:1.6;color:#a9c4cc;margin-bottom:12px;">Send one of your trained units to any Ronin address. The unit leaves your wallet permanently.</div>' +
        '<div style="font-size:10px;color:#8fb0b8;margin-bottom:4px;">Unit token ID <span style="opacity:.7;">(shown on the unit card, e.g. #3717)</span></div>' +
        '<input id="wui-snft-id" type="number" inputmode="numeric" placeholder="3717" style="width:100%;box-sizing:border-box;border:2px solid #2f5560;border-radius:9px;padding:10px;background:#0c1722;font:inherit;font-size:14px;color:#e8f4f6;margin-bottom:12px;"/>' +
        '<div style="font-size:10px;color:#8fb0b8;margin-bottom:4px;">Recipient Ronin address</div>' +
        '<input id="wui-snft-to" type="text" spellcheck="false" placeholder="0x…" style="width:100%;box-sizing:border-box;border:2px solid #2f5560;border-radius:9px;padding:10px;background:#0c1722;font:inherit;font-size:11px;color:#e8f4f6;margin-bottom:12px;"/>' +
        '<button id="wui-snft-go" style="width:100%;padding:13px;font:inherit;font-size:13px;font-weight:700;border:none;border-radius:10px;cursor:pointer;background:#4a9da6;color:#fff;">SEND UNIT</button>' +
        '<div id="wui-snft-msg" style="text-align:center;font-size:11px;margin-top:10px;min-height:14px;line-height:1.5;"></div>' +
      '</div>';
    document.body.appendChild(ov);
    const close = () => { try { ov.remove(); } catch (_) {} };
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
    const idEl = ov.querySelector('#wui-snft-id'), toEl = ov.querySelector('#wui-snft-to'), go = ov.querySelector('#wui-snft-go');
    const msg = (t, c) => { const m = ov.querySelector('#wui-snft-msg'); if (m) { m.textContent = t || ''; m.style.color = c || '#a9c4cc'; } };
    let busy = false, confirming = false;
    go.onclick = async () => {
      if (busy) return;
      const tid = (idEl.value || '').trim();
      const to = (toEl.value || '').trim();
      if (!/^\d+$/.test(tid)) { msg('Enter a valid token ID', '#e85d5d'); return; }
      if (!/^0x[0-9a-fA-F]{40}$/.test(to)) { msg('Enter a valid Ronin address (0x…)', '#e85d5d'); return; }
      if (to.toLowerCase() === String(fromAddr).toLowerCase()) { msg('That is your own address', '#e85d5d'); return; }
      if (!(window.BarracksNFT && window.BarracksNFT.transferUnit)) { msg('Transfer unavailable', '#e85d5d'); return; }
      if (!confirming) { confirming = true; go.textContent = 'CONFIRM — SEND #' + tid + ' ?'; go.style.background = '#e08a2e'; msg('Tap again to confirm — this is permanent', '#ffcf5c'); return; }
      busy = true; go.disabled = true; go.style.opacity = '.6'; go.textContent = 'SENDING…';
      try {
        // Ownership pre-check (aiškesnė klaida nei revert)
        try { const o = await window.BarracksNFT.ownerOfUnit(tid); if (String(o).toLowerCase() !== String(fromAddr).toLowerCase()) { throw new Error('You do not own unit #' + tid); } } catch (oe) { if (/do not own/.test(String(oe.message))) throw oe; /* read fail → tęsiam, kontraktas patikrins */ }
        msg('Confirm in your wallet…', '#a9c4cc');
        await window.BarracksNFT.transferUnit(tid, to);
        msg('✓ Unit #' + tid + ' sent!', '#7cffa0');
        go.textContent = 'SENT ✓'; go.style.background = '#2fa84a';
        try { Wallet.refreshNfts && Wallet.refreshNfts(); } catch (_) {}
        setTimeout(close, 1800);
      } catch (e) {
        const m = String((e && (e.shortMessage || e.message)) || e);
        msg(/reject|denied|cancel|4001/i.test(m) ? 'Cancelled' : m.slice(0, 80), '#e85d5d');
        go.disabled = false; go.style.opacity = '1'; go.textContent = 'SEND UNIT'; go.style.background = '#4a9da6'; confirming = false; busy = false;
      }
    };
  }

  // ── NFT Gallery (fullscreen modal) ──
  function openGallery() {
    if (!galleryEl) {
      galleryEl = document.createElement('div');
      galleryEl.id = 'wui-gallery';
      galleryEl.className = 'wui-gallery';
      document.body.appendChild(galleryEl);
      galleryEl.addEventListener('click', (e) => { if (e.target === galleryEl) closeGallery(); });
    }
    galleryEl.style.display = 'flex';
    renderGallery();
    // Start load if not loaded
    const st = Wallet.snapshot();
    if (!Array.isArray(st.nfts) && !st.nftsLoading) Wallet.refreshNfts();
  }
  function closeGallery() {
    if (galleryEl) galleryEl.style.display = 'none';
  }
  function renderGallery() {
    if (!galleryEl) return;
    const st = Wallet.snapshot();
    const nfts = Array.isArray(st.nfts) ? st.nfts : [];
    const loading = st.nftsLoading;
    let gridHtml = '';
    if (nfts.length === 0 && loading) {
      gridHtml = `<div class="wui-gal-loading">LOADING NFTS…</div>`;
    } else if (nfts.length === 0) {
      gridHtml = `<div class="wui-gal-empty">No Ronkeverse NFTs in this wallet.</div>`;
    } else {
      gridHtml = '<div class="wui-gal-grid">' + nfts.map(n => `
        <div class="wui-gal-card">
          <div class="wui-gal-img-wrap">
            ${n.image ? `<img src="${escapeHtml(n.image)}" alt="${escapeHtml(n.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/>` : ''}
            <div class="wui-gal-placeholder" style="${n.image ? 'display:none;' : ''}">${n.loading ? '…' : '🖼'}</div>
          </div>
          <div class="wui-gal-name">${escapeHtml(n.name)}</div>
          <div class="wui-gal-id">#${escapeHtml(String(n.tokenId))}</div>
        </div>
      `).join('') + '</div>';
    }
    galleryEl.innerHTML = `
      <div class="wui-gal-panel">
        <div class="wui-gal-head">
          <div class="wui-gal-title">RONKEVERSE NFTS ${nfts.length ? `(${nfts.length})` : ''}</div>
          <div class="wui-gal-head-actions">
            <button type="button" class="wui-gal-refresh" id="wui-gal-refresh">↻ REFRESH</button>
            <button type="button" class="wui-gal-close" id="wui-gal-close">×</button>
          </div>
        </div>
        <div class="wui-gal-body">${gridHtml}</div>
      </div>
    `;
    galleryEl.querySelector('#wui-gal-close').onclick = closeGallery;
    galleryEl.querySelector('#wui-gal-refresh').onclick = () => Wallet.refreshNfts();
  }

  // ── Toast ──
  let toastTimer = null;
  function showToast(msg, type, ms) {
    let t = document.getElementById('wui-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'wui-toast';
      t.className = 'wui-toast';
      document.body.appendChild(t);
    }
    t.className = 'wui-toast wui-toast-' + (type || 'ok');
    t.textContent = msg;
    t.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, ms || 2500);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Lifecycle ──
  function init() {
    ensurePill();
    render();
    Wallet.onChange(() => { render(); if (galleryEl && galleryEl.style.display === 'flex') renderGallery(); });
    // Floor change watcher — kai floor-nav-label pasikeičia, perpiešiam Home/PewPew mygtukų matomumą
    let _lastFloorTxt = null;
    setInterval(() => {
      const lbl = document.getElementById('floor-nav-label');
      const txt = lbl ? lbl.textContent.trim() : '';
      if (txt !== _lastFloorTxt) { _lastFloorTxt = txt; render(); }
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
