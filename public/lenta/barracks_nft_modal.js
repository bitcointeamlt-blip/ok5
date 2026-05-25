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
    if (!stateRefreshInterval) stateRefreshInterval = setInterval(refreshAll, 15000);
  }
  function closeModal() {
    const modal = document.getElementById('nft-barracks-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modalOpen = false;
    if (stateRefreshInterval) { clearInterval(stateRefreshInterval); stateRefreshInterval = null; }
    if (pendingTimer) { clearInterval(pendingTimer); pendingTimer = null; }
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
      };
    });
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
      el.onclick = () => selectUnit(Number(el.dataset.utype));
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
      document.getElementById('nft-cap').textContent = `${s.dailyUsed} / ${s.dailyCap}`;
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
    document.getElementById('nft-pending').style.display = 'block';
    document.getElementById('nft-actions').style.display = 'none';
    const utypeName = window.BarracksNFT.utypeName(p.utype);
    document.getElementById('nft-pending-info').textContent =
      `${p.qty}× ${utypeName}`;
    const readyAt = Number(p.readyAt);
    const tick = () => {
      const remain = readyAt - Math.floor(Date.now() / 1000);
      if (remain > 0) {
        document.getElementById('nft-pending-countdown').textContent = `${remain}s`;
        document.getElementById('nft-claim-btn').style.display = 'none';
      } else {
        document.getElementById('nft-pending-countdown').textContent = 'READY ✓';
        document.getElementById('nft-claim-btn').style.display = 'inline-block';
        if (pendingTimer) { clearInterval(pendingTimer); pendingTimer = null; }
      }
    };
    tick();
    if (pendingTimer) clearInterval(pendingTimer);
    pendingTimer = setInterval(tick, 1000);
  }
  function hidePending() {
    document.getElementById('nft-pending').style.display = 'none';
    document.getElementById('nft-actions').style.display = 'flex';
    if (pendingTimer) { clearInterval(pendingTimer); pendingTimer = null; }
  }

  // ─── Inventory ─────────────────────────────────────────────
  async function refreshInventory() {
    const W = window.Wallet;
    if (!W || !W.isConnected || !W.isConnected()) return;
    const addr = W.getAddress();
    const grid = document.getElementById('nft-inv-grid');
    grid.innerHTML = '<div class="nft-empty">Loading...</div>';
    try {
      const units = await window.BarracksNFT.fetchInventory(addr);
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
        const veteranCls = g.level >= 10 ? 'veteran' : g.level >= 5 ? 'elite' : '';
        const winRate = g.battles > 0 ? Math.round((g.wins / g.battles) * 100) : 0;
        const isStack = g.count > 1;
        const firstId = g.ids[0];
        const marketUrl = `https://marketplace.roninchain.com/token/${BARRACKS_ADDR}/${firstId}`;
        const explorerUrl = `https://explorer.roninchain.com/token/${BARRACKS_ADDR}/${firstId}`;
        const stackBadge = isStack ? `<div class="nft-card-stack">×${g.count}</div>` : '';
        const idText = isStack
          ? `<span title="Token IDs: ${g.ids.join(', ')}">${g.count} units</span>`
          : `#${firstId}`;
        // XP progress to next level: level N → XP threshold = (N+1)² × 100
        const curThreshold = g.level * g.level * 100;
        const nextThreshold = (g.level + 1) * (g.level + 1) * 100;
        const xpProgress = Math.max(0, Math.min(100,
          ((g.xp - curThreshold) / (nextThreshold - curThreshold)) * 100));
        // Title for level
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
          <div class="nft-card-xp-row">
            <span class="nft-stat-label">XP</span>
            <span class="nft-stat-value">${g.xp.toLocaleString()}</span>
            <div class="nft-xp-bar"><div class="nft-xp-fill" style="width:${xpProgress}%"></div></div>
          </div>
          <div class="nft-card-stats-grid">
            <div class="nft-stat-cell">
              <div class="nft-stat-icon">⚔️</div>
              <div class="nft-stat-num">${g.kills.toLocaleString()}</div>
              <div class="nft-stat-name">KILLS</div>
            </div>
            <div class="nft-stat-cell">
              <div class="nft-stat-icon">🏆</div>
              <div class="nft-stat-num">${g.wins}</div>
              <div class="nft-stat-name">WINS</div>
            </div>
            <div class="nft-stat-cell">
              <div class="nft-stat-icon">🛡️</div>
              <div class="nft-stat-num">${g.battles}</div>
              <div class="nft-stat-name">BATTLES</div>
            </div>
          </div>
          <div class="nft-card-winrate">
            <span>WIN RATE</span><strong>${winRate}%</strong>
          </div>
          <div class="nft-card-actions">
            <a href="${marketUrl}" target="_blank" class="nft-card-link market" title="Sell on Ronin Market">🛒 SELL</a>
            <a href="${explorerUrl}" target="_blank" class="nft-card-link explorer" title="View on Explorer">🔗 INFO</a>
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
        setStatus(`Training started ✓ ${txLink(hash)}`, 'success');
        refreshAll();
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
    // Close on backdrop click
    document.getElementById('nft-barracks-modal').addEventListener('click', (e) => {
      if (e.target.id === 'nft-barracks-modal') closeModal();
    });
  }

  // Public API
  window.NFTBarracksModal = { open: openModal, close: closeModal };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
