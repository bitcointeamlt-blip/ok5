// wallet-ui.js — UI pill + dropdown + NFT gallery
// Depends on window.Wallet (from wallet.js). Styling via .wui-* classes in style.css.
(function () {
  'use strict';

  if (!window.Wallet) { console.warn('[wallet-ui] window.Wallet missing'); return; }

  let pillEl = null;
  let dropdownEl = null;
  let galleryEl = null;
  let dropdownOpen = false;

  // ── Pill creation (floating, fixed top-right) ──
  function ensurePill() {
    if (pillEl) return pillEl;
    pillEl = document.createElement('div');
    pillEl.id = 'wui-pill-root';
    pillEl.className = 'wui-pill-root';
    pillEl.innerHTML = `
      <div class="wui-pill-row">
        <button type="button" class="wui-pill" id="wui-pill-btn"></button>
        <button type="button" class="wui-castle-btn wui-inv-btn" id="wui-inv-btn" title="Inventory" style="display:none"></button>
        <button type="button" class="wui-castle-btn wui-rewards-btn" id="wui-rewards-btn" title="Rewards" style="display:none"></button>
        <button type="button" class="wui-castle-btn wui-upgrade-btn" id="wui-upgrade-btn" title="Upgrade" style="display:none"></button>
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

  function render() {
    ensurePill();
    const st = Wallet.snapshot();
    const btn = pillEl.querySelector('#wui-pill-btn');
    const invBtn = pillEl.querySelector('#wui-inv-btn');
    const rewardsBtnEl = pillEl.querySelector('#wui-rewards-btn');
    const upgradeBtnEl = pillEl.querySelector('#wui-upgrade-btn');
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
    if (homeBtnEl) {
      homeBtnEl.style.display = inAdv ? 'flex' : 'none';
      homeBtnEl.style.background = '#6b4a2e';
      homeBtnEl.innerHTML = `<img class="wui-castle-img" src="assets_tiny/Buildings_Castle.png" alt="" draggable="false"/><span class="wui-home-hint">HOME</span>`;
    }

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

  async function handleConnect() {
    if (!Wallet.isInstalled()) {
      showToast('Ronin Wallet not installed. Install from wallet.roninchain.com', 'error', 5000);
      setTimeout(() => { window.open('https://wallet.roninchain.com/', '_blank'); }, 300);
      return;
    }
    try {
      await Wallet.connect();
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
    const ddIcon = `<svg class="wui-dd-brand-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L21 12 L12 22 L3 12 Z" fill="currentColor" opacity="0.2"/><path d="M12 4.5 L19 12 L12 19.5 L5 12 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/></svg>`;
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
        <div class="wui-dd-stat wui-dd-stat-ronke">
          <div class="wui-dd-stat-lbl"><span class="wui-dd-stat-ico">◈</span>RONKE</div>
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
        <button type="button" class="wui-dd-btn wui-dd-btn-primary" id="wui-dd-gallery">▣ VIEW NFTS</button>
        <button type="button" class="wui-dd-btn wui-dd-btn-danger" id="wui-dd-disconnect">⎋ DISCONNECT</button>
      </div>
    `;
    dropdownEl.querySelector('#wui-dd-close').onclick = closeDropdown;
    dropdownEl.querySelector('#wui-dd-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(addr); showToast('Address copied', 'ok', 1500); }
      catch { showToast('Copy failed', 'error', 1500); }
    };
    dropdownEl.querySelector('#wui-dd-refresh-bal').onclick = () => Wallet.refreshBalance();
    dropdownEl.querySelector('#wui-dd-refresh-nfts').onclick = () => Wallet.refreshNfts();
    dropdownEl.querySelector('#wui-dd-gallery').onclick = () => { closeDropdown(); openGallery(); };
    dropdownEl.querySelector('#wui-dd-disconnect').onclick = async () => {
      await Wallet.disconnect();
      showToast('Disconnected', 'ok', 1500);
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
