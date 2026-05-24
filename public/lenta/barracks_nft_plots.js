// NFT Barracks F10 plots — renders latest 4 NFT idle sprites adjacent to ciucela.
// Positions HTML overlay <div> elements over canvas using world coords.
//
// Updates on:
//   - Wallet connect / disconnect / change
//   - Every 30s polling
//   - After successful NFT claim (manual refresh hook)

(function() {
  'use strict';

  let lastUnits = [];      // last fetched up to 4 NFTs
  let lastWallet = null;
  let pollTimer = null;
  let activeWallet = null;

  // Get canvas → page CSS coords transform
  function getCanvasMapper() {
    const canvas = document.getElementById('game') || document.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / canvas.width;   // CSS scale x
    const sy = rect.height / canvas.height; // CSS scale y
    return { canvas, rect, sx, sy };
  }

  // Map world (canvas) coords → page CSS coords accounting for cam pan
  // Game's cam has {x, y} (no zoom — fixed 1:1 world↔canvas). World coords are
  // already in canvas pixels minus cam offset.
  function worldToPageRect(worldX, worldY, w, h) {
    const m = getCanvasMapper();
    if (!m) return null;
    const cam = window.getCam ? window.getCam() : null;
    if (!cam) return null;
    const screenX = worldX - cam.x;
    const screenY = worldY - cam.y;
    return {
      x: m.rect.left + screenX * m.sx,
      y: m.rect.top + screenY * m.sy,
      w: w * m.sx,
      h: h * m.sy,
    };
  }

  function setPlot(idx, x, y, size, unit) {
    const el = document.getElementById('nft-plot-' + idx);
    if (!el) return;
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
    el.style.width = Math.round(size) + 'px';
    el.style.height = Math.round(size) + 'px';
    el.style.display = 'block';
    if (unit) {
      el.classList.remove('empty');
      const lvl = unit.level || 0;
      el.innerHTML = `<img src="${unit.image}" alt="${unit.name}"><div class="nft-plot-label">#${unit.tokenId} L${lvl}</div>`;
    } else {
      el.classList.add('empty');
      el.innerHTML = '';
    }
  }

  function hideAllPlots() {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById('nft-plot-' + i);
      if (el) el.style.display = 'none';
    }
    const ov = document.getElementById('nft-plots-overlay');
    if (ov) ov.style.display = 'none';
  }

  // Render frame — called every animation frame from game loop hook
  function renderFrame() {
    const S = window.S;
    if (!S || S.floor !== 10) { hideAllPlots(); return; }

    const bounds = window.getCiucelaBounds ? window.getCiucelaBounds() : null;
    const cam = window.getCam ? window.getCam() : null;
    if (!bounds || !cam) { hideAllPlots(); return; }

    const ov = document.getElementById('nft-plots-overlay');
    if (ov) ov.style.display = 'block';

    // Position 4 plots around ciucela bounds
    // Layout: 2 above ciucela in horizontal row, 2 below
    const plotSize = bounds.w * 0.9;  // each plot ~90% of ciucela width
    const gap = 6;
    const totalWidth = plotSize * 2 + gap;
    const centerX = bounds.x + bounds.w / 2;
    const aboveY = bounds.y - plotSize - 25;  // above sprite (above label)
    const belowY = bounds.y + bounds.h + 8;   // below sprite

    const positions = [
      { wx: centerX - totalWidth / 2,         wy: aboveY, size: plotSize },
      { wx: centerX - totalWidth / 2 + plotSize + gap, wy: aboveY, size: plotSize },
      { wx: centerX - totalWidth / 2,         wy: belowY, size: plotSize },
      { wx: centerX - totalWidth / 2 + plotSize + gap, wy: belowY, size: plotSize },
    ];

    for (let i = 0; i < 4; i++) {
      const p = positions[i];
      const pageRect = worldToPageRect(p.wx, p.wy, p.size, p.size);
      if (!pageRect) { setPlot(i, -9999, -9999, 0, null); continue; }
      setPlot(i, pageRect.x, pageRect.y, pageRect.w, lastUnits[i] || null);
    }
  }

  // Fetch latest 4 NFTs (highest tokenId = latest minted)
  async function fetchLatestNfts() {
    try {
      const W = window.Wallet;
      if (!W || !W.isConnected || !W.isConnected()) {
        lastUnits = [];
        return;
      }
      const addr = W.getAddress();
      if (addr === lastWallet && lastUnits.length > 0) {
        // Already have data, will refresh next interval
      }
      lastWallet = addr;
      activeWallet = addr;
      if (!window.BarracksNFT) return;
      const all = await window.BarracksNFT.fetchInventory(addr);
      // Sort by tokenId DESC (newest first), take 4
      all.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));
      lastUnits = all.slice(0, 4);
    } catch (e) {
      console.warn('[NFT plots] fetch failed', e);
    }
  }

  function startPolling() {
    if (pollTimer) return;
    fetchLatestNfts();
    pollTimer = setInterval(fetchLatestNfts, 30000);  // 30s polling
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    lastUnits = [];
  }

  // Hook into render loop via requestAnimationFrame
  function loop() {
    renderFrame();
    requestAnimationFrame(loop);
  }

  function init() {
    // Wait for game.js + wallet.js + barracks_nft.js to load
    if (typeof window.S === 'undefined') {
      setTimeout(init, 500);
      return;
    }
    requestAnimationFrame(loop);
    // Start polling if wallet already connected
    if (window.Wallet && window.Wallet.isConnected && window.Wallet.isConnected()) {
      startPolling();
    }
    // Listen for wallet events (best-effort)
    if (window.addEventListener) {
      window.addEventListener('wallet:connected', startPolling);
      window.addEventListener('wallet:disconnected', stopPolling);
    }
  }

  // Public manual refresh hook (call after NFT claim)
  window.NFTBarracksPlots = {
    refresh: fetchLatestNfts,
    start: startPolling,
    stop: stopPolling,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
