// ══════════════════════════════════════════════════════════════════
//  village.js — Settlement + Farming idle game
//  Communicates with dungeon via window.GameBridge only.
// ══════════════════════════════════════════════════════════════════
'use strict';

(function () {

  // ── State ─────────────────────────────────────────────────────────
  const V = window.VillageState = {
    workers:      [],
    buildings:    {},
    plots:        [],
    events:       [],
    tick:         0,
    raidCooldown: 2400,
    running:      false,
    intervalId:   null,
    farmAnimFrame: null,
  };

  // ── Worker types ──────────────────────────────────────────────────
  const WTYPES = {
    farmer:     { label:'FARMER',     icon:'🌾', res:'food',  ratePerSec:2,   hireCost:{ wood:20 } },
    lumberjack: { label:'LUMBERJACK', icon:'🪵', res:'wood',  ratePerSec:1,   hireCost:{ food:30 } },
    miner:      { label:'MINER',      icon:'🪨', res:'stone', ratePerSec:1,   hireCost:{ food:30 } },
    goldsmith:  { label:'GOLDSMITH',  icon:'⚡', res:'gold',  ratePerSec:0.3, hireCost:{ food:20, stone:20 } },
  };

  // ── Building types ────────────────────────────────────────────────
  const BTYPES = {
    barn:       { label:'BARN',       icon:'🏚', desc:'+200 FOOD STORAGE', cost:{ wood:50,  stone:30 } },
    well:       { label:'WELL',       icon:'🪣', desc:'FEED COST -40%',   cost:{ stone:40           } },
    watchtower: { label:'WATCHTOWER', icon:'🗼', desc:'RAID DAMAGE ÷2',   cost:{ wood:60,  stone:40 } },
    forge:      { label:'FORGE',      icon:'⚒',  desc:'GOLDSMITH +50%',   cost:{ stone:80, gold:30  } },
  };

  // ── Farm constants ────────────────────────────────────────────────
  const PCOLS      = 6;
  const PROWS      = 4;
  const PSIZE      = 64;
  const PGAP       = 4;
  const CVW        = PCOLS * (PSIZE + PGAP) + PGAP;   // 412
  const CVH        = PROWS * (PSIZE + PGAP) + PGAP;   // 276
  const GROW_TICKS = 200;   // 40 s at 5 ticks/s
  const PS = { EMPTY:0, SEEDED:1, GROWING:2, READY:3 };

  function initPlots() {
    V.plots = Array.from({ length: PCOLS * PROWS }, (_, i) => ({
      id: i, state: PS.EMPTY, growTimer: 0,
    }));
    Object.keys(BTYPES).forEach(k => { if (V.buildings[k] === undefined) V.buildings[k] = false; });
  }

  // ── Engine constants ──────────────────────────────────────────────
  const MAX_WORKERS = 8;
  const TICK_MS     = 200;
  const TICKS_PER_S = 5;

  // ── Helpers ───────────────────────────────────────────────────────
  function res()  { return window.GameBridge.resources; }
  function fmt(n) { return Math.floor(n).toLocaleString(); }

  function canAfford(cost) {
    return Object.entries(cost).every(([k, v]) => (res()[k] || 0) >= v);
  }
  function deduct(cost) {
    Object.entries(cost).forEach(([k, v]) => { res()[k] = Math.max(0, (res()[k] || 0) - v); });
  }

  function addEvent(msg, color) {
    const ts = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    V.events.unshift({ msg, color: color || '#4ecf88', ts });
    if (V.events.length > 30) V.events.pop();
    renderLog();
  }

  // ── Hire / Upgrade / Heal / Dismiss ──────────────────────────────
  function hireWorker(type) {
    if (V.workers.length >= MAX_WORKERS) { addEvent('MAX 8 WORKERS', '#ff8844'); return; }
    const wt = WTYPES[type];
    if (!canAfford(wt.hireCost)) { addEvent('NOT ENOUGH RESOURCES', '#d94f4f'); return; }
    deduct(wt.hireCost);
    V.workers.push({ id: Date.now(), type, level: 1, fed: true, hp: 3, maxHp: 3 });
    addEvent('HIRED ' + wt.icon + ' ' + wt.label, '#7ae8b0');
    render();
  }

  function upgradeWorker(id) {
    const w = V.workers.find(x => x.id === id);
    if (!w) return;
    const cost = { gold: w.level * 25 };
    if (!canAfford(cost)) { addEvent('NEED ' + cost.gold + 'G TO UPGRADE', '#d94f4f'); return; }
    deduct(cost);
    w.level++;
    addEvent(WTYPES[w.type].label + ' → LVL ' + w.level, '#ffcc44');
    render();
  }

  function healWorker(id) {
    const w = V.workers.find(x => x.id === id);
    if (!w || w.hp >= w.maxHp) return;
    const cost = { food: 15 };
    if (!canAfford(cost)) { addEvent('NEED 15 FOOD TO HEAL', '#d94f4f'); return; }
    deduct(cost);
    w.hp = w.maxHp; w.fed = true;
    addEvent(WTYPES[w.type].label + ' HEALED ♥', '#7ae8b0');
    render();
  }

  function dismissWorker(id) {
    const idx = V.workers.findIndex(x => x.id === id);
    if (idx === -1) return;
    const w = V.workers[idx];
    V.workers.splice(idx, 1);
    addEvent(WTYPES[w.type].label + ' DISMISSED', '#3a7055');
    render();
  }

  // ── Build ─────────────────────────────────────────────────────────
  function buildBuilding(type) {
    if (V.buildings[type]) { addEvent('ALREADY BUILT', '#ff8844'); return; }
    const bt = BTYPES[type];
    if (!canAfford(bt.cost)) { addEvent('NOT ENOUGH RESOURCES', '#d94f4f'); return; }
    deduct(bt.cost);
    V.buildings[type] = true;
    addEvent(bt.icon + ' ' + bt.label + ' BUILT!', '#7ae8b0');
    renderBuildings();
  }

  // ── Manual harvest ────────────────────────────────────────────────
  function harvestPlot(idx) {
    const p = V.plots[idx];
    if (!p || p.state !== PS.READY) return;
    const gain = 18 + Math.floor(Math.random() * 12);
    res().food = (res().food || 0) + gain;
    p.state = PS.EMPTY; p.growTimer = 0;
    addEvent('+' + gain + ' FOOD HARVESTED 🌾', '#7ae8b0');
    renderResources();
  }

  // ── Game tick ─────────────────────────────────────────────────────
  function gameTick() {
    V.tick++;

    // Workers produce resources
    V.workers.forEach(w => {
      if (!w.fed) return;
      const wt = WTYPES[w.type];
      let rate = wt.ratePerSec * w.level;
      if (wt.res === 'gold' && V.buildings.forge) rate *= 1.5;
      res()[wt.res] = (res()[wt.res] || 0) + rate / TICKS_PER_S;
    });

    // Farm plots
    const farmers = V.workers.filter(w => w.type === 'farmer' && w.fed).length;
    V.plots.forEach(p => {
      if (p.state === PS.EMPTY && farmers > 0) {
        if (Math.random() < 0.009 * farmers) { p.state = PS.SEEDED; p.growTimer = 0; }
      } else if (p.state === PS.SEEDED || p.state === PS.GROWING) {
        p.growTimer++;
        if (p.state === PS.SEEDED && p.growTimer > GROW_TICKS * 0.25) p.state = PS.GROWING;
        if (p.growTimer >= GROW_TICKS) p.state = PS.READY;
      } else if (p.state === PS.READY && farmers > 0) {
        // Very slow auto-harvest — player clicks for better yield
        if (Math.random() < 0.0008 * farmers) {
          res().food = (res().food || 0) + 10;
          p.state = PS.EMPTY; p.growTimer = 0;
        }
      }
    });

    // Feed workers every 5 s
    if (V.tick % (TICKS_PER_S * 5) === 0) {
      V.workers.forEach(w => {
        let needed = 1 + Math.floor(w.level * 0.5);
        if (V.buildings.well) needed = Math.max(1, Math.floor(needed * 0.6));
        if ((res().food || 0) >= needed) {
          res().food -= needed; w.fed = true;
        } else {
          w.fed = false;
          addEvent(WTYPES[w.type].label + ' IS HUNGRY!', '#ff8844');
        }
      });
    }

    // Raids
    V.raidCooldown--;
    if (V.raidCooldown <= 0 && V.workers.length > 0) {
      V.raidCooldown = (18 + Math.floor(Math.random() * 12)) * TICKS_PER_S * 10;
      triggerRaid();
    }

    if (V.tick % TICKS_PER_S === 0) renderResources();
  }

  // ── Raid ──────────────────────────────────────────────────────────
  function triggerRaid() {
    const targets = ['food', 'wood', 'stone'];
    const t = targets[Math.floor(Math.random() * targets.length)];
    const pct = V.buildings.watchtower ? 0.1 : 0.25;
    const stolen = Math.floor((res()[t] || 0) * pct);
    res()[t] = Math.max(0, (res()[t] || 0) - stolen);
    addEvent('⚔ RAID! LOST ' + stolen + ' ' + t.toUpperCase(), '#d94f4f');

    if (V.workers.length > 0 && !V.buildings.watchtower) {
      const target = V.workers[Math.floor(Math.random() * V.workers.length)];
      target.hp = Math.max(0, target.hp - 1);
      if (target.hp <= 0) {
        V.workers.splice(V.workers.indexOf(target), 1);
        addEvent(WTYPES[target.type].label + ' KILLED IN RAID', '#d94f4f');
      } else {
        addEvent(WTYPES[target.type].label + ' INJURED (' + target.hp + '/' + target.maxHp + 'HP)', '#ff8844');
      }
      renderWorkers();
    }
  }

  // ── Farm canvas ───────────────────────────────────────────────────
  function drawFarm() {
    const sc = document.getElementById('screen-village');
    if (!sc || !sc.classList.contains('active')) { V.farmAnimFrame = null; return; }
    const cv = document.getElementById('vil-farm-cv');
    if (!cv) { V.farmAnimFrame = null; return; }
    const ctx = cv.getContext('2d');
    const now = Date.now();

    // Background
    ctx.fillStyle = '#040e06';
    ctx.fillRect(0, 0, CVW, CVH);
    // Scanlines
    for (let y = 0; y < CVH; y += 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, y, CVW, 1);
    }

    V.plots.forEach((p, i) => {
      const col = i % PCOLS;
      const row = Math.floor(i / PCOLS);
      const x   = PGAP + col * (PSIZE + PGAP);
      const y   = PGAP + row * (PSIZE + PGAP);
      const cx  = x + PSIZE / 2;
      const cy  = y + PSIZE / 2;
      const pulse = Math.sin(now * 0.004 + i * 0.3) * 0.5 + 0.5;

      // Plot border
      if (p.state === PS.READY) {
        ctx.fillStyle = `rgba(255,204,68,${0.2 + pulse * 0.25})`;
      } else {
        ctx.fillStyle = '#0d2218';
      }
      ctx.fillRect(x, y, PSIZE, PSIZE);

      // Plot interior
      if (p.state === PS.EMPTY) {
        ctx.fillStyle = '#0d1a0d';
        ctx.fillRect(x + 2, y + 2, PSIZE - 4, PSIZE - 4);
        // Soil texture dots
        ctx.fillStyle = '#162a16';
        for (let dy = 10; dy < PSIZE - 10; dy += 10)
          for (let dx = 8; dx < PSIZE - 8; dx += 10)
            ctx.fillRect(x + dx + (dy % 20 > 0 ? 3 : 0), y + dy, 2, 2);

      } else if (p.state === PS.SEEDED) {
        ctx.fillStyle = '#12200d';
        ctx.fillRect(x + 2, y + 2, PSIZE - 4, PSIZE - 4);
        // Seed
        ctx.fillStyle = '#6b4c1a'; ctx.fillRect(cx - 3, cy - 3, 6, 6);
        ctx.fillStyle = '#a07030'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
        // Progress bar
        const t = p.growTimer / GROW_TICKS;
        ctx.fillStyle = '#0d2218'; ctx.fillRect(x + 4, y + PSIZE - 10, PSIZE - 8, 6);
        ctx.fillStyle = '#3a7055'; ctx.fillRect(x + 4, y + PSIZE - 10, Math.floor((PSIZE - 8) * t), 6);

      } else if (p.state === PS.GROWING) {
        const t = p.growTimer / GROW_TICKS;
        ctx.fillStyle = '#0a1a0a';
        ctx.fillRect(x + 2, y + 2, PSIZE - 4, PSIZE - 4);
        const stemH = Math.floor(6 + t * 28);
        // Stem
        ctx.fillStyle = '#3a8a20';
        ctx.fillRect(cx - 2, cy + 14 - stemH, 4, stemH);
        // Leaves
        ctx.fillStyle = '#4ecf88';
        ctx.fillRect(cx - 9, cy + 14 - stemH + 4, 7, 4);
        if (t > 0.45) ctx.fillRect(cx + 2, cy + 14 - stemH + 10, 7, 4);
        if (t > 0.70) {
          ctx.fillStyle = '#7ae8b0';
          ctx.fillRect(cx - 4, cy + 14 - stemH - 4, 8, 5);
        }
        // Progress bar
        ctx.fillStyle = '#0d2218'; ctx.fillRect(x + 4, y + PSIZE - 10, PSIZE - 8, 6);
        ctx.fillStyle = '#4ecf88'; ctx.fillRect(x + 4, y + PSIZE - 10, Math.floor((PSIZE - 8) * t), 6);

      } else { // READY
        ctx.fillStyle = '#060f06';
        ctx.fillRect(x + 2, y + 2, PSIZE - 4, PSIZE - 4);
        // Glow bg
        ctx.fillStyle = `rgba(78,207,136,${0.04 + pulse * 0.06})`;
        ctx.fillRect(x + 2, y + 2, PSIZE - 4, PSIZE - 4);
        // Stem
        ctx.fillStyle = '#3a8a20';
        ctx.fillRect(cx - 2, cy - 2, 4, 18);
        // Leaves
        ctx.fillStyle = '#4ecf88';
        ctx.fillRect(cx - 10, cy + 4, 8, 4);
        ctx.fillRect(cx + 2,  cy + 9, 8, 4);
        // Grain top
        ctx.fillStyle = `rgba(255,204,68,${0.85 + pulse * 0.15})`;
        ctx.fillRect(cx - 6, cy - 17, 12, 14);
        ctx.fillStyle = `rgba(255,224,100,${0.5 + pulse * 0.5})`;
        ctx.fillRect(cx - 4, cy - 20, 8, 5);
        // READY label
        ctx.fillStyle = `rgba(255,220,68,${0.65 + pulse * 0.35})`;
        ctx.font = '5px "Press Start 2P",monospace';
        ctx.textAlign = 'center';
        ctx.fillText('READY', cx, y + PSIZE - 6);
        ctx.textAlign = 'left';
      }
    });

    V.farmAnimFrame = requestAnimationFrame(drawFarm);
  }

  // ── Render ────────────────────────────────────────────────────────
  function renderResources() {
    const el = document.getElementById('vil-res-bar');
    if (!el) return;
    const r = res();
    el.innerHTML =
      `<span class="vr">🌾 <b>${fmt(r.food||0)}</b> FOOD</span>` +
      `<span class="vr">🪵 <b>${fmt(r.wood||0)}</b> WOOD</span>` +
      `<span class="vr">🪨 <b>${fmt(r.stone||0)}</b> STONE</span>` +
      `<span class="vr vr-gold">⚡ <b>${fmt(r.gold||0)}</b> GOLD</span>`;
  }

  function renderWorkers() {
    const el = document.getElementById('vil-workers');
    if (!el) return;
    const cnt = document.getElementById('vil-worker-count');
    if (cnt) cnt.textContent = '(' + V.workers.length + '/' + MAX_WORKERS + ')';
    if (!V.workers.length) {
      el.innerHTML = '<div class="vil-empty">NO WORKERS · HIRE BELOW</div>';
      return;
    }
    el.innerHTML = V.workers.map(w => {
      const wt     = WTYPES[w.type];
      const hearts = '♥'.repeat(w.hp) + '♡'.repeat(w.maxHp - w.hp);
      const prod   = (wt.ratePerSec * w.level).toFixed(1);
      const upgCost = w.level * 25;
      return `<div class="vil-worker${!w.fed ? ' vil-hungry' : ''}">
        <div class="vil-w-row1">
          <span class="vil-w-name">${wt.icon} ${wt.label}</span>
          <span class="vil-w-lvl">LVL${w.level}</span>
          <span class="vil-w-hp">${hearts}</span>
        </div>
        <div class="vil-w-row2">
          <span class="vil-w-prod">+${prod} ${wt.res.toUpperCase()}/s</span>
          ${!w.fed ? '<span class="vil-w-status">HUNGRY</span>' : ''}
          ${w.hp < w.maxHp ? '<span class="vil-w-status">INJURED</span>' : ''}
        </div>
        <div class="vil-w-btns">
          <button class="vil-btn vil-btn-upg" onclick="window.village.upgradeWorker(${w.id})">⬆ ${upgCost}G</button>
          ${w.hp < w.maxHp ? `<button class="vil-btn vil-btn-heal" onclick="window.village.healWorker(${w.id})">♥ 15🌾</button>` : ''}
          <button class="vil-btn vil-btn-dis" onclick="window.village.dismissWorker(${w.id})">✕</button>
        </div>
      </div>`;
    }).join('');
  }

  function renderHire() {
    const el = document.getElementById('vil-hire');
    if (!el) return;
    el.innerHTML = Object.entries(WTYPES).map(([type, wt]) => {
      const costStr = Object.entries(wt.hireCost).map(([k, v]) => v + ' ' + k.toUpperCase()).join(' + ');
      return `<button class="vil-hire-btn" onclick="window.village.hireWorker('${type}')">
        <span class="vil-hire-icon">${wt.icon}</span>
        <span class="vil-hire-label">${wt.label}</span>
        <span class="vil-hire-rate">+${wt.ratePerSec} ${wt.res}/s</span>
        <span class="vil-hire-cost">${costStr}</span>
      </button>`;
    }).join('');
  }

  function renderBuildings() {
    const el = document.getElementById('vil-buildings');
    if (!el) return;
    el.innerHTML = Object.entries(BTYPES).map(([type, bt]) => {
      const built = V.buildings[type];
      const costStr = Object.entries(bt.cost).map(([k, v]) => v + ' ' + k.toUpperCase()).join(' + ');
      return `<div class="vil-building${built ? ' vil-built' : ''}">
        <div class="vil-b-row1">
          <span class="vil-b-icon">${bt.icon}</span>
          <span class="vil-b-name">${bt.label}</span>
          ${built ? '<span class="vil-b-ok">✓ BUILT</span>' : ''}
        </div>
        <div class="vil-b-desc">${bt.desc}</div>
        ${!built ? `<button class="vil-btn vil-btn-build" onclick="window.village.buildBuilding('${type}')">${costStr}</button>` : ''}
      </div>`;
    }).join('');
  }

  function renderLog() {
    const el = document.getElementById('vil-log-list');
    if (!el) return;
    el.innerHTML = V.events.slice(0, 12).map(e =>
      `<div class="vil-log-row" style="color:${e.color}">[${e.ts}] ${e.msg}</div>`
    ).join('');
  }

  function render() {
    renderResources();
    renderWorkers();
    renderBuildings();
    renderLog();
  }

  // ── Public API ────────────────────────────────────────────────────
  window.village = {
    hireWorker, upgradeWorker, healWorker, dismissWorker, buildBuilding, harvestPlot,

    onDungeonGold(amount) {
      res().gold = (res().gold || 0) + amount;
      addEvent('+' + amount + ' GOLD FROM DUNGEON ⚔', '#ffcc44');
    },

    open() {
      if (!V.running) {
        initPlots();
        V.running = true;
        V.intervalId = setInterval(gameTick, TICK_MS);
        addEvent('VILLAGE ONLINE', '#7ae8b0');
      }
      document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
      const sc = document.getElementById('screen-village');
      if (sc) { sc.style.display = 'flex'; sc.classList.add('active'); }
      renderHire();
      render();
      // Start farm canvas loop
      if (V.farmAnimFrame) cancelAnimationFrame(V.farmAnimFrame);
      drawFarm();
      // Click-to-harvest on farm canvas
      const cv = document.getElementById('vil-farm-cv');
      if (cv) {
        cv.onclick = e => {
          const rect = cv.getBoundingClientRect();
          const sx = CVW / rect.width;
          const sy = CVH / rect.height;
          const mx = (e.clientX - rect.left) * sx;
          const my = (e.clientY - rect.top)  * sy;
          const col = Math.floor((mx - PGAP) / (PSIZE + PGAP));
          const row = Math.floor((my - PGAP) / (PSIZE + PGAP));
          if (col < 0 || col >= PCOLS || row < 0 || row >= PROWS) return;
          harvestPlot(row * PCOLS + col);
        };
      }
    },

    close() {
      if (V.farmAnimFrame) { cancelAnimationFrame(V.farmAnimFrame); V.farmAnimFrame = null; }
      if (window.BGM) BGM.start('menu');
      document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
      const sc = document.getElementById('screen-menu');
      if (sc) { sc.style.display = 'flex'; sc.classList.add('active'); }
    },

    openEditor() {
      if (V.farmAnimFrame) { cancelAnimationFrame(V.farmAnimFrame); V.farmAnimFrame = null; }
      if (window.editor) window.editor.open('screen-village');
    },
  };

})();
