'use strict';
// ════════════════════════════════════════════════════════════════
//  TIMELOCK BOARD — 3v3 edition  (12×12 grid)
// ════════════════════════════════════════════════════════════════

// ── Fragment System ───────────────────────────────────────────────
const FRAG_PER_CHIP = 10; // fragments needed to assemble 1 chip

// ── Slot Combination Prize Table ─────────────────────────────────
// [matchCount][rarity] → prize
const COMBO_PRIZES = {
  4: {
    common:    { val: 5, name: '5 CHIP', rarity: 'common' },
    uncommon:  { val: 5, name: '5 CHIP', rarity: 'uncommon' },
    rare:      { val: 5, name: '5 CHIP', rarity: 'rare' },
    epic:      { val: 5, name: '5 CHIP', rarity: 'epic' },
    legendary: { val: 5, name: '5 CHIP', rarity: 'legendary' },
  },
  3: {
    common:    { val: 2, name: '2 CHIP', rarity: 'common' },
    uncommon:  { val: 2, name: '2 CHIP', rarity: 'uncommon' },
    rare:      { val: 2, name: '2 CHIP', rarity: 'rare' },
    epic:      { val: 2, name: '2 CHIP', rarity: 'epic' },
    legendary: { val: 2, name: '2 CHIP', rarity: 'legendary' },
  },
  2: {
    common:    { val: 1, name: '1 CHIP', rarity: 'common' },
    uncommon:  { val: 1, name: '1 CHIP', rarity: 'uncommon' },
    rare:      { val: 1, name: '1 CHIP', rarity: 'rare' },
    epic:      { val: 1, name: '1 CHIP', rarity: 'epic' },
    legendary: { val: 1, name: '1 CHIP', rarity: 'legendary' },
  },
};
const EMPTY_PRIZE = { val: 0, name: 'EMPTY', rarity: 'empty', matchCount: 0 };

function evaluateCombination(reels) {
  if (reels.includes('empty')) return EMPTY_PRIZE;
  const counts = {};
  for (const r of reels) counts[r] = (counts[r] || 0) + 1;
  const order = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
  for (const n of [4, 3, 2]) {
    for (const r of order) {
      if ((counts[r] || 0) >= n && COMBO_PRIZES[n]?.[r])
        return { ...COMBO_PRIZES[n][r], matchCount: n };
    }
  }
  return EMPTY_PRIZE;
}

const RARITY_COLOR = {
  empty: '#555566',
  common: '#aaaaaa',
  uncommon: '#44ff88',
  rare: '#4499ff',
  epic: '#cc44ff',
  legendary: '#ffaa00',
};

// ── Constants ────────────────────────────────────────────────────
const BASE_COLS = 20;
const BASE_ROWS = 16;
const ADV_COLS = 42;   // adventure viewport width  (cells visible on screen)
const ADV_CANVAS_H = 848;  // adventure viewport height in pixels (fixed, not tied to CELL)
let ADV_MAP_COLS = 48;   // adventure full map width
let ADV_MAP_ROWS = 32;   // adventure full map height
let COLS = BASE_COLS;
let ROWS = BASE_ROWS;
const CELL = 34;
const BOARD_W = BASE_COLS * CELL;   // 1080 — PvP canvas width (fixed)
const BOARD_H = BASE_ROWS * CELL;   // 864 — viewport height (fixed)
const MAX_HP = 5;
const MAX_AMMO = 5;
const AMMO_REGEN = 4;
const TICK_WINDOW = 90;
const ANIM_MS = 240;
const P1_COLOR = '#00f5ff';
const P2_COLOR = '#ff3c55';
const MAX_LASER = 1;
const LASER_REGEN = 3;
const MAX_HEAVY = 2;
const HEAVY_REGEN = 5;
const MAX_SHOTGUN = 3;
const SHOTGUN_REGEN = 4;
const SHOTGUN_RANGE = 6; // cells before pellets fade
const ENERGY_MAX = 100;
const FOG_RADIUS = 3;
const MISS_CHANCE = 0.15;   // 15 % tikimybė prasilenkti
const CRIT_CHANCE_BASE = 0.03; // 3% base crit chance
function getCritChance() { return CRIT_CHANCE_BASE + (Profile.upgrades?.critLevel || 0) * 0.005; }
const CRIT_DMG = 2;
const CELL_DARK = '#07070f';
const CELL_LIGHT = '#0a0a18';
const GRID_COLOR = '#161630';

// ── Persistent Profile System ────────────────────────────────────
let Profile = {
  cache: 0,
  upgrades: {
    maxEnergy: 0,
    voltsCostLevel: 0,
    critLevel: 0       // # of successful CRIT upgrades (+0.5% crit each)
  },
  highestSector: 1,
  inventory: null      // persists chips/items across runs
};

function loadProfile() {
  const saved = localStorage.getItem('timelock_profile');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      Profile = { ...Profile, ...parsed };
      // Ensure nested upgrades exist in case of old save formats
      if (!Profile.upgrades) Profile.upgrades = { maxEnergy: 0, voltsCostLevel: 0 };
      if (Profile.upgrades.voltsCostLevel === undefined) Profile.upgrades.voltsCostLevel = 0;
      if (Profile.upgrades.critLevel === undefined) Profile.upgrades.critLevel = 0;
      if (Profile.upgrades.nanoLevel === undefined) Profile.upgrades.nanoLevel = 0;
      if (!Profile.highestSector || Profile.highestSector < 1) Profile.highestSector = 1;
      if (!Array.isArray(Profile.inventory)) Profile.inventory = null;
    } catch (e) { console.error("Could not load profile", e); }
  }
}

function saveProfile() {
  localStorage.setItem('timelock_profile', JSON.stringify(Profile));
}

window.toggleUpgradeCard = function (card) {
  if (!card) return;
  const collapsing = !card.classList.contains('collapsed');
  card.classList.toggle('collapsed');
  // Small toggle click sound
  if (collapsing) {
    SFX.play(900, 0.06, 0.04, 'square', -300);
  } else {
    SFX.play(600, 0.05, 0.04, 'square', 300);
  }
};

window.resetSaveData = function () {
  if (!confirm('WIPE ALL SAVE DATA?\n\nCache · Upgrades · Sector progress\nThis cannot be undone.')) return;
  localStorage.removeItem('timelock_profile');
  Profile = { cache: 0, upgrades: { maxEnergy: 0, voltsCostLevel: 0 }, highestSector: 1, inventory: null };
  updateHubUI();
};

// ── Cost helpers ────────────────────────────────────────────────────────────
function getTerminalVoltsCost() {
  return Math.ceil(10 * Math.pow(1.1, Profile.upgrades.voltsCostLevel || 0));
}

function getInGameVoltsCost() {
  const lvl = S.inGameUpgradeLevel || 0;
  if (lvl < 10) return lvl + 1;               // 1→2→...→10
  return Math.ceil(10 * Math.pow(1.1, lvl - 9)); // then +10% each
}

// ── Small firework burst on successful upgrade ───────────────────────────────
function spawnUpgradeFX(cardEl) {
  const rect = cardEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ['#00ffcc', '#ffee00', '#00aaff', '#ff88dd', '#aaff44'];
  const count = 13;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const angle = Math.PI * 2 * (i / count) + (Math.random() - 0.5) * 0.5;
    const dist = 28 + Math.random() * 44;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = 2.5 + Math.random() * 3.5;
    const delay = Math.random() * 100;
    const dur = 380 + Math.random() * 280;
    el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;`
      + `background:${color};border-radius:50%;pointer-events:none;z-index:9999;`
      + `box-shadow:0 0 5px ${color};`
      + `--tx:${tx}px;--ty:${ty}px;`
      + `animation:upgParticle ${dur}ms ${delay}ms ease-out forwards;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), dur + delay + 50);
  }
}

// ── Upgrade animation ───────────────────────────────────────────────────────
function showUpgradeAnim(cardId, statusId, onComplete) {
  const cardEl = document.getElementById(cardId);
  const statusEl = document.getElementById(statusId);
  if (!cardEl) { onComplete(); return; }

  const btn = cardEl.querySelector('button');
  if (btn) btn.disabled = true;

  if (statusEl) { statusEl.textContent = 'SCANNING...'; statusEl.className = 'upg-status scanning'; }
  cardEl.classList.add('upg-scanning');
  SFX.upgradeScan();

  // reset scan bar so animation can replay
  const bar = cardEl.querySelector('.upg-scan-bar');
  if (bar) { bar.style.animation = 'none'; bar.offsetHeight; bar.style.animation = ''; }

  setTimeout(() => {
    cardEl.classList.remove('upg-scanning');
    const success = onComplete();
    cardEl.classList.add(success ? 'upg-success' : 'upg-fail');
    if (success) { SFX.upgradeSuccess(); spawnUpgradeFX(cardEl); } else SFX.upgradeFail();
    if (statusEl) {
      statusEl.textContent = success ? 'SUCCESS +1V' : '-- FAIL --';
      statusEl.className = 'upg-status ' + (success ? 'ok' : 'err');
    }

    setTimeout(() => {
      cardEl.classList.remove('upg-success', 'upg-fail');
      if (statusEl) { statusEl.textContent = ''; statusEl.className = 'upg-status'; }
      if (btn) btn.disabled = false;
      updateHubUI();
    }, 1100);
  }, 1300);
}

// ── Crit upgrade cost table ───────────────────────────────────────────────
// ── Mini icon renderers for cost displays ─────────────────────────
function drawMiniChip(canvas, rarity) {
  const ctx = canvas.getContext('2d');
  const px = 2; // each art pixel = 2 screen pixels → 24×24
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const pal = CHIP_PALETTES[rarity] || CHIP_PALETTES.common;
  const rows = CHIP_ART.length, cols = CHIP_ART[0].length;
  const offX = Math.floor((W - cols * px) / 2);
  const offY = Math.floor((H - rows * px) / 2);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const v = CHIP_ART[r][c]; if (!v) continue;
      ctx.fillStyle = pal[v];
      ctx.fillRect(offX + c * px, offY + r * px, px, px);
    }
  ctx.fillStyle = pal[4];
  CHIP_CIRCUIT.forEach(([r, c]) =>
    ctx.fillRect(offX + c * px, offY + r * px, px, px)
  );
}

function drawMiniByte(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, r = W * 0.38;
  ctx.fillStyle = '#ffcc00';
  ctx.shadowColor = '#ffdd00'; ctx.shadowBlur = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#886600'; ctx.lineWidth = 1.5; ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#664400';
  ctx.font = `bold ${Math.round(r * 1.1)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('B', cx, cy + 1);
}

function renderCostIcons(containerId, cost, type, haveFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  el.style.cssText = 'display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;';

  const addIcon = (rarity, qty, isBytes) => {
    if (!qty) return;
    const have = haveFn ? haveFn(rarity) : null;
    const enough = have === null || have >= qty;
    const iconCol = isBytes ? '#ffcc00' : RARITY_COLOR[rarity];

    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px;';

    const cv = document.createElement('canvas');
    cv.width = 24; cv.height = 24;
    cv.style.cssText = 'image-rendering:pixelated;vertical-align:middle;';
    if (isBytes) drawMiniByte(cv); else drawMiniChip(cv, rarity);

    const num = document.createElement('span');
    num.style.cssText = `font-size:7px;font-family:'Press Start 2P',monospace;`;

    if (have !== null) {
      num.innerHTML =
        `<span style="color:${iconCol}">×${qty}</span>`
        + `<span style="color:#334455">/</span>`
        + `<span style="color:${enough ? '#44ff88' : '#ff3c55'}">${have}</span>`;
    } else {
      num.innerHTML = `<span style="color:${iconCol}">×${qty}</span>`;
    }

    wrap.appendChild(cv); wrap.appendChild(num);
    el.appendChild(wrap);
  };

  if (type === 'bytes') {
    addIcon(null, cost, true);
  } else {
    if (cost.legendary) addIcon('legendary', cost.legendary);
    if (cost.epic) addIcon('epic', cost.epic);
    if (cost.rare) addIcon('rare', cost.rare);
    if (cost.uncommon) addIcon('uncommon', cost.uncommon);
    if (cost.common) addIcon('common', cost.common);
  }
}

function getCritCost(level) {
  if (level < 4) return { common: level + 1, uncommon: 0, rare: 0 };
  if (level === 4) return { common: 1, uncommon: 1, rare: 0 };
  if (level < 9) return { common: level - 3, uncommon: 1, rare: 0 };
  return { common: 0, uncommon: 1, rare: 1 };
}
function formatCritCost(cost) {
  const parts = [];
  if (cost.rare) parts.push(`<span style="color:#4499ff">${cost.rare}★</span>`);
  if (cost.uncommon) parts.push(`<span style="color:#44ff88">${cost.uncommon}◆</span>`);
  if (cost.common) parts.push(`<span style="color:#aaaaaa">${cost.common}○</span>`);
  return parts.join(' ');
}
function getNanoRepairCost(level) {
  if (level === 0) return { rare: 1 };
  if (level === 1) return { rare: 3 };
  if (level === 2) return { rare: 3, epic: 1 };
  if (level === 3) return { rare: 4, epic: 2 };
  if (level === 4) return { epic: 2, legendary: 1 };
  if (level === 5) return { epic: 4, legendary: 2 };
  if (level === 6) return { epic: 6, legendary: 3 };
  if (level === 7) return { epic: 7, legendary: 4 };
  return null;
}
function getNanoSuccessRate(level) {
  if (level === 0) return 0.90;
  if (level === 1) return 0.85;
  if (level === 2) return 0.80;
  if (level === 3) return 0.80;
  if (level === 4) return 0.75;
  return 0.75;
}
function getNanoHealInterval(level) {
  if (level >= 8) return 15;
  if (level >= 7) return 17;
  if (level >= 5) return 18;
  if (level >= 3) return 19;
  return 20;
}

function chipCount(rarity) {
  if (!S.inventory) return 0;
  const s = S.inventory.find(x => x && x.type === 'chip' && x.rarity === rarity);
  return s ? s.qty : 0;
}
function spendChips(rarity, qty) {
  if (!qty || !S.inventory) return;
  const idx = S.inventory.findIndex(x => x && x.type === 'chip' && x.rarity === rarity);
  if (idx < 0) return;
  S.inventory[idx].qty -= qty;
  if (S.inventory[idx].qty <= 0) S.inventory[idx] = null;
  Profile.inventory = S.inventory.map(x => x ? { ...x } : null);
  if (S.inventoryOpen) updateInventoryUI();
}
window.attemptCritUpgrade = function (prefix) {
  const cardId = prefix === 'hov' ? 'hov-crit-card' : 'crit-upg-card';
  const statId = prefix === 'hov' ? 'hov-crit-status' : 'crit-status';
  const costEl = prefix === 'hov' ? 'hov-crit-cost-display' : 'crit-cost-display';
  const level = Profile.upgrades.critLevel || 0;
  const cost = getCritCost(level);
  const canAfford = chipCount('common') >= cost.common
    && chipCount('uncommon') >= cost.uncommon
    && chipCount('rare') >= cost.rare;
  if (!canAfford) {
    const el = document.getElementById(costEl);
    if (el) { el.style.color = '#ff3c55'; setTimeout(() => el.style.color = '', 500); }
    return;
  }
  spendChips('common', cost.common);
  spendChips('uncommon', cost.uncommon);
  spendChips('rare', cost.rare);
  updateInventoryUI();
  updateHubUI();
  showUpgradeAnim(cardId, statId, () => {
    const success = Math.random() < 0.75;
    if (success) { Profile.upgrades.critLevel++; saveProfile(); }
    return success;
  });
};

window.attemptNanoRepairUpgrade = function (prefix) {
  const cardId = prefix === 'hov' ? 'hov-nano-card' : 'nano-upg-card';
  const statId = prefix === 'hov' ? 'hov-nano-status' : 'nano-status';
  const costEl = prefix === 'hov' ? 'hov-nano-cost-display' : 'nano-cost-display';
  const level = Profile.upgrades.nanoLevel || 0;
  if (level >= 8) return;
  const cost = getNanoRepairCost(level);
  const canAfford = chipCount('legendary') >= (cost.legendary || 0)
    && chipCount('epic') >= (cost.epic || 0)
    && chipCount('rare') >= (cost.rare || 0);
  if (!canAfford) {
    const el = document.getElementById(costEl);
    if (el) { el.style.color = '#ff3c55'; setTimeout(() => el.style.color = '', 500); }
    return;
  }
  spendChips('legendary', cost.legendary || 0);
  spendChips('epic', cost.epic || 0);
  spendChips('rare', cost.rare || 0);
  updateInventoryUI();
  updateHubUI();
  showUpgradeAnim(cardId, statId, () => {
    const success = Math.random() < getNanoSuccessRate(level);
    if (success) { Profile.upgrades.nanoLevel++; saveProfile(); }
    return success;
  });
};

// ── Terminal upgrade (hub screen, uses Profile.cache) ──────────────────────
window.attemptTerminalUpgrade = function () {
  const cost = getTerminalVoltsCost();
  if (Profile.cache < cost) {
    const el = document.getElementById('hub-cache');
    if (el) { el.style.color = '#ff3c55'; setTimeout(() => el.style.color = '', 400); }
    return;
  }
  Profile.cache -= cost;
  saveProfile();
  updateHubUI();

  showUpgradeAnim('volts-upg-card', 'volts-status', () => {
    const success = Math.random() < 0.7;
    if (success) {
      Profile.upgrades.maxEnergy = (Profile.upgrades.maxEnergy || 0) + 1;
      Profile.upgrades.voltsCostLevel = (Profile.upgrades.voltsCostLevel || 0) + 1;
      saveProfile();
    }
    return success;
  });
};

// ── In-game upgrade (hub overlay, uses S.bytes from current run) ───────────
window.attemptInGameUpgrade = function () {
  const cost = getInGameVoltsCost();
  if ((S.bytes || 0) < cost) {
    const el = document.getElementById('hov-bytes');
    if (el) { el.style.color = '#ff3c55'; setTimeout(() => el.style.color = '', 400); }
    return;
  }
  S.bytes -= cost;
  syncByteSlot();
  updateHubUI();

  showUpgradeAnim('hov-volts-card', 'hov-volts-status', () => {
    const success = Math.random() < 0.7;
    if (success) {
      Profile.upgrades.maxEnergy = (Profile.upgrades.maxEnergy || 0) + 1;
      S.inGameUpgradeLevel = (S.inGameUpgradeLevel || 0) + 1;
      S.energy = (S.energy || 0) + 1;
      saveProfile();
      updateEnergyHud();
    }
    return success;
  });
};

function updateHubUI() {
  const maxNrg = 100 + (Profile.upgrades.maxEnergy || 0);
  const lvlE = Profile.upgrades.maxEnergy || 0;
  const termCost = getTerminalVoltsCost();
  const critLvl = Profile.upgrades.critLevel || 0;
  const critPct = ((CRIT_CHANCE_BASE + critLvl * 0.005) * 100).toFixed(1) + '%';

  const o = (id) => document.getElementById(id);

  // hub overlay IDs
  if (o('hov-energy')) o('hov-energy').innerText = maxNrg;
  if (o('hov-energy-card')) o('hov-energy-card').innerText = maxNrg;
  if (o('hov-lvl-energy')) o('hov-lvl-energy').innerText = lvlE;
  if (o('hov-bytes')) o('hov-bytes').innerText = S.bytes || 0;
  if (o('hov-ig-cost')) o('hov-ig-cost').innerText = getInGameVoltsCost();

  // hub screen IDs
  if (o('hub-energy')) o('hub-energy').innerText = maxNrg;
  if (o('hub-energy-card')) o('hub-energy-card').innerText = maxNrg;
  if (o('hub-sector')) o('hub-sector').innerText = Profile.highestSector;
  if (o('lvl-energy')) o('lvl-energy').innerText = lvlE;
  // volts-cost now rendered as canvas icons via renderCostIcons below
  if (o('lvl-crit')) o('lvl-crit').innerText = critLvl;
  if (o('hub-crit-pct')) o('hub-crit-pct').innerText = critPct;
  if (o('hov-lvl-crit')) o('hov-lvl-crit').innerText = critLvl;
  if (o('hov-crit-pct')) o('hov-crit-pct').innerText = critPct;
  const critCost = getCritCost(critLvl);
  renderCostIcons('crit-cost-display', critCost, 'chips', (r) => chipCount(r));
  renderCostIcons('hov-crit-cost-display', critCost, 'chips', (r) => chipCount(r));
  renderCostIcons('volts-cost-display', getTerminalVoltsCost(), 'bytes', () => Profile.cache);
  renderCostIcons('hov-ig-cost-display', getInGameVoltsCost(), 'bytes', () => S.bytes || 0);

  const nanoLvl = Profile.upgrades.nanoLevel || 0;
  if (o('lvl-nano')) o('lvl-nano').innerText = nanoLvl;
  if (o('hov-lvl-nano')) o('hov-lvl-nano').innerText = nanoLvl;
  const nanoHealAmt = nanoLvl >= 1 ? `+${nanoLvl}` : '+1';
  const nanoHealRate = `/ ${getNanoHealInterval(nanoLvl)} STEPS`;
  if (o('nano-heal-amt')) o('nano-heal-amt').innerText = nanoHealAmt;
  if (o('hov-nano-heal-amt')) o('hov-nano-heal-amt').innerText = nanoHealAmt;
  if (o('nano-heal-rate')) o('nano-heal-rate').innerText = nanoHealRate;
  if (o('hov-nano-heal-rate')) o('hov-nano-heal-rate').innerText = nanoHealRate;
  const nanoSuccessPct = Math.round(getNanoSuccessRate(nanoLvl) * 100) + '%';
  if (o('nano-success')) o('nano-success').innerText = nanoSuccessPct;
  if (o('hov-nano-success')) o('hov-nano-success').innerText = nanoSuccessPct;
  if (nanoLvl >= 8) {
    ['nano-cost-display', 'hov-nano-cost-display'].forEach(id => {
      const el = o(id); if (el) el.innerHTML = '<span style="color:#00ff88">MAX</span>';
    });
  } else {
    const nanoCost = getNanoRepairCost(nanoLvl);
    renderCostIcons('nano-cost-display', nanoCost, 'chips', (r) => chipCount(r));
    renderCostIcons('hov-nano-cost-display', nanoCost, 'chips', (r) => chipCount(r));
  }

  for (let i = 2; i <= 3; i++) {
    const misCard = o(`mis-${i}`);
    if (misCard) {
      if (Profile.highestSector >= i) {
        misCard.classList.remove('locked');
        misCard.querySelector('.btn-deploy').innerText = 'DEPLOY';
      } else {
        misCard.classList.add('locked');
        misCard.querySelector('.btn-deploy').innerText = 'LOCKED';
      }
    }
  }
}

window.toggleHubOverlay = function () {
  const ov = document.getElementById('hub-overlay');
  if (ov.classList.contains('active')) {
    ov.classList.remove('active');
    BGM.start('game');
  } else {
    updateHubUI();
    ov.classList.add('active');
    BGM.start('hub');
    document.querySelectorAll('#hub-overlay .upgrade-card').forEach(c => c.classList.add('collapsed'));
  }
};

window.deployMission = function (sector) {
  if (Profile.highestSector < sector) return;
  document.getElementById('hub-overlay').classList.remove('active');
  S.floor = 1;
  startGame('adventure');
};


// ── Animated hero sprite system (declared early so IIFE below can populate it) ─
const heroAnimFrames = { idle: {}, walk: {}, fight: {} };

// ── PixelLab DarkAssassin sprites + animations (4 dirs, 4 frames each) ─────────
const HERO_SPRITE_DATA = {
  east: 'assets/hero.png',
  south: 'assets/hero.png',
  west: 'assets/hero.png',
  north: 'assets/hero.png',
};
const HERO_IDLE_FRAMES = {
  east: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABjElEQVR4nO2XP0vDUBTFfxFBu4iLhBDoUBAnO7TgJhSRLpVOdXZ18xOICE66iN/BqZsICi5CtoodBBfFCoUQi0PGtFMd2jxfW6nNTaiDPdN7hHfuvef+eS8wwwx/DCPG2W4SXFIHuraVAcC0bADqdUfENxfHuI5iqQKjqvyKeYEDwHfkLc/F9RpSGpECyrDuSG3nVcQjqYGRFAwpEIlTpMCw5JpDkQMSd0FSfOIasK0MQ6kQBSNqQ+gVn2nZ5HKbErsKoiLUN6EK/bqYXgrOy9u8XF7geg3VihKIHdDRH8PTd6D1/hbneHwHHmvPOCcHgKqFyHeByAHbynD2IJ//OhIbxe2go/ZPu002rlcn4k6kCAGcU1+ts9U0d8cfE6UjqgIj0ZuWTctzWW/vcRjsk/eXB74vphbG2hC/B0LjIW79IwqlNZwKbBl5stX0RBxiBXTj2qPEALgqfHYBijdLwHgVYikAA0NIGSnfr/TWKWgHnbG1EFmBhHgUonaBERr74ToWIckHSZx/jH+MLzJvaTMX3EcXAAAAAElFTkSuQmCC', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABb0lEQVR4nGNgGAWjYIABIwV6/1PDLHId8F9aUomBgYGBQVxSmuHl86cMT5/fI8s8JkoshwFxSWkGIyNbBgbMUCEIWMhwANxSBgYGZN+TBcgJAbjFyA455XObLHPISQMYUcDAwIAcCiSZSVYI4Alykj1Edi6glnlkpwEjI1tYyifbcnIdgJIG0BxBF/AfGUtLKv03MrKF8enngAl+Lv8Pt+TDHUGuA8hOA8hgQAoiGDjckk+RfooccHPbfoosJ9sB0pJKDAWb9sD51499gDH///j+k6S0QHFRPMsshYHNKImBgYGBwbZMEC7OwclOlNlUqQskfqoxnH23g/H78d//GQ3+ocgRcgipUYC1LXD23Q4GD8HG/+cc3zHs8vxEkoFktweQgZGRLcOOc/UMDt7qEAFPZwYJng8Mvx9LMHzp/Pefp5wJZyiQGgUoTTEYoKRJRlEIwBol5FpODviPjqHFMN0BReU/MqBWg4QuwT88AQCYLH0joVq4ZAAAAABJRU5ErkJggg==', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABX0lEQVR4nO1WsUrEQBQcD9G7QjiwCMt26ayEs1Ps0iiSTvwom3yPrQhy4omCWMjlQAghhSBanFZrteuaFMnOC1h4Ayk2IfNm35u3b4EVVvhjrAn+NX1wsQKMVjEAIFIaVVmgKHOKbyAJbhEpjcnkEGhmpRXrhAAXFIC/ewpMBlxgX8j05JniYTzQKEEtA0GcVAbqKfcEBW+I7oK++GgPaBVb59PBWQFGq9iZryYiGJQJ/YUVMJtdUnx0CbI0QZYmNjANWoAPiQiRgOOzFFmaSChkAqrFHNH2GIA7C4JnASVAqxjnNzlup49ubbsiFPQwsqhe31CUOeb5k31lFndL7OyPO3WEeBZESjsTXu1+YO96w30bjjZb+UNL0BhEwO/D6OLoHQ+nLwCAz+VXqydEJajX/eB+62fHo24C6C7oYrouJRCb0DuEJBfczjD1R6s4uPd9iG/F7G1YLKBHrn+Ob6WDaIJC107MAAAAAElFTkSuQmCC', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABcElEQVR4nO2WsUrDUBSGv6rQdpGKQwjZ8gQSEFwKLrroIvQFfAIXdS8IDm4OvkFxdxI6OHQQFPMAinEKaRGlW1oF46C5xrRocm6og/23ey/3P//9z7nnXphiij9GSWNvVASXVEBkmTYAhmkB4LodEd+MTvAk1jcaMOrKr5gTCAC+Tt4LfPzAk9KIHFCBk0KuNu9EPJIaGElByoFcnCIH0pYnBOU+kPgWFMUnrgHLtEmlQnQY0TWEj+IzTAvHqUviKoiKMDmIBUyyEQFwut3gtnUcBxZD3gee+vQe7gG0RIgFFAVtAZ2DneQw91sgEjDuMZJCqxXvLdsYizUAtk5aVKrl3JxaKTi69tg9d5l/dgAYhEPCy9eo3exmTkVeB8b+BfzAo93sUt9fUHOVajkTt5YDcTcECC9muVl5UWuDcJjJCbEDcWD43gXPVh+jtcMapaU3tf6TG9oCpC1YLKAAjkI2Kyc+PycTc0AJKJDrn+MdQ0Zq+RBlcWAAAAAASUVORK5CYII='],
  south: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABwElEQVR4nO1VsUsCYRT/nWgaQYVT1zXdEi2S5xAIgmCDQhghhNDQFv0NQXuj7UG41doYBIJDEHI2REPBGeRxRotN55HwGo77MAX1+zxr8QcHxzvu937fe7/vPWCGGf4Z0gT/kh9cogJI01K/ArpeFeIL+JEcABLRLDBYlZEQqcCoJFycIhVALVOHIqswmy10bAeJaBY36U8RKiGQIqt0kYyR936dzhHcynC3ICggQDItgyqRGO6O8gCAxtMb+8ZNJiAAGH7S6XqgED8hr9+aloJ3IxRZ5aUCwN8CakhVlL9cI+4+F5gQD6ZlECYbcMMFwJ0DpMgq1TJ1SkSztLVxzAwJASNyCSjlt1kiRVapvPLIboCIAKE5cL6eAwCYloHD1iYA4HXnFJXEATcX9zVsvwewtjQYLz00oIaS3AJ4zULLq1kAwAK9wLQMv3j5ROwvnrGea1qqdwr+yTJCt+hQ8CoMP1Yytwm7RYedUter+LBMXgpxAfb9N3UvAXtvjsWG+MB/dGyHzGarv+f9PpgOukWHOrYzkNx7vGnIyzt2CzrxECLzYal3AcE1nKTIKprtW97cjIAXvaeUhsRmmGEs/ADk9bErQvssegAAAABJRU5ErkJggg==', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB1UlEQVR4nO2WMUgbURjHfyfVgktFEHO8KY86hEiQZBAEQXFxqQVLNl2Lo65unYqDi4MguMTBwaGDUxFEQUTayilFOnRIOxhCEcRBvISWfA5yZy6CyXsxdskPHvfuO+7//u9733t30KbNf8Zp4l15Ci1bA5JOj0YCnndgpddhM7hyNX+KhUhQuRoeZqUuNhmoN4iRpk0G2MoeolxNyS9T8suMdCc4njixkbJCAFkfSYlyddgP4qZiLywMOIDsF2HjzSAwyK+z39XPjMVseGymra2BxeSO5GKnAKTTo0H1h1dTTA3IbuUTyaQwE0/heQf0u4raM6GVBji/2uHtj3fM61wkXijmrU2YEFa8crUsq9Wwj+UusDoHZuIpCsU8AwNZ4H72u++nMDVhZeB1TwyAD99n2R67CAuw5+eNjZwRkumdlEzvZCTl10sVUa6W4cSc1TIYm6huudiplPyyfNn89iyDw92nOGyADCfmpOSXxT/6K1vZw9bXQECnnwRgomOafyudOEMV9GV3M5L1qZ19sAW9vrxsj11UL0dDGGfglfM18jMSbMG9rs9M7fc5HxfWSMWHuF6qtKYexjMvI0VY054H5eog9QG19w3T7C+Z80isTZuGuAXJNb8Hl5FsxwAAAABJRU5ErkJggg==', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABwUlEQVR4nO2Wv0uCQRjHv29JRS3RUm8HgW8tNpi9DYEgCUYYgVub0GZO9ifUWEMQDdEQVKONQlM4hUMg6hY0RASVEbUUqEh+G8rDrKG7em3xAy/vyx33PN97fty9QJs2/4zxi7X8C1u6AihMC4OmwP3dDQDg5u5Sy56OAOm8mVzuVNemmoDGR5gWm8Ych4dDBQrTYrlUYblUIQCmgg+tEwCAa5NzctdRt1c7Ai4NAUbdUToWAQDsn1w1zjnLanz7u7xrh19Z8dRAmImudSwVfbDtwKc5nS7oUPRPAFgq+pAN5RWX/g0y/CEcMDPxTGFazSlxVsBWZFY6TAUf6O/1tPQcYDoWYTI4/6UAk8F5pmMRx0Uw6vYy6vZSmBazofwnEXt+r/MC8FEH0544pz1xvmzUiOEBboqdxlr4MapdIFvs7HwX4Zlx9OSrwO0THvvHtG9EVWjbAdp2gAB4vfDKcqnCTbHDo8VMS45iiTAt+b2ciL9HQxHVFEiMqz4AwMhxJ0YtD1yJKqor6ua0BRS7L+o5l2/DV9M1p8S3l9HhUKH+b6CETgSM+o7xXvGy6lnQDujPEaYlO6BhWOsMaNMGAN4ANKvUhqUQeR4AAAAASUVORK5CYII=', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABwElEQVR4nO2WPUsjURSGnyzIamOlq8NUDiJIIME0QkBYCCwERYugsmAtgS3s8wP8+AmCYGPhR7PNIghCUEKakIAQC5EIYhgWJI3CzBDWY6EzqKRw7jgjLHnhwOHCPe977zn3ngNddPHJiAXYKx8RS1WApFJTrxaq1VOleF8+ghzgee3trYQC6WS6Zrh++AKup/+JrhliW47YliO6ZkgpeRedAF0z5Ne3Je/0L32/wZSLcO97loGxHgBuL9osFg+DxPOHF/nuZOFioX9dKpmaV3iupVJTSgL8PkO5HP3D3HmOSqZG02wAMKTpfnmVBfDXbNI0G9TrMQrxI4adMWVyFcjSSMJ7824qiLAGZCudkK10wiMsxI8EkOPl2UhqgKIJh9YMk+N5AFbrP/yGCCZg5+qMG7tFu69OJVMDIDdRYHM3ja4ZgcS8FwLI/nxJSsk7rx4mx/OuH74AlzQ3UZD9+ZJY5XZk5PDUjr2Pp5Kpyf3Gg9iWI9srv8MvQhc9VhyAtdYBrZMn3p/rWd9xVJqHN5A8T0EA2JYDQG/f19AbUscmVB1siFVuR5KC2Bs/0ImVUtBhv7h/QNNsRDMTdPHf4BFVnNHb/gCHjwAAAABJRU5ErkJggg=='],
  west: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABjElEQVR4nO2XP0vDUBTFfxFBu4iLhBDoUBAnO7TgJhSRLpVOdXZ18xOICE66iN/BqZsICi5CtoodBBfFCoUQi0PGtFMd2jxfW6nNTaiDPdN7hHfuvef+eS8wwwx/DCPG2W4SXFIHuraVAcC0bADqdUfENxfHuI5iqQKjqvyKeYEDwHfkLc/F9RpSGpECyrDuSG3nVcQjqYGRFAwpEIlTpMCw5JpDkQMSd0FSfOIasK0MQ6kQBSNqQ+gVn2nZ5HKbErsKoiLUN6EK/bqYXgrOy9u8XF7geg3VihKIHdDRH8PTd6D1/hbneHwHHmvPOCcHgKqFyHeByAHbynD2IJ//OhIbxe2go/ZPu002rlcn4k6kCAGcU1+ts9U0d8cfE6UjqgIj0ZuWTctzWW/vcRjsk/eXB74vphbG2hC/B0LjIW79IwqlNZwKbBl5stX0RBxiBXTj2qPEALgqfHYBijdLwHgVYikAA0NIGSnfr/TWKWgHnbG1EFmBhHgUonaBERr74ToWIckHSZx/jH+MLzJvaTMX3EcXAAAAAElFTkSuQmCC', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABb0lEQVR4nGNgGAWjYIABIwV6/1PDLHId8F9aUomBgYGBQVxSmuHl86cMT5/fI8s8JkoshwFxSWkGIyNbBgbMUCEIWMhwANxSBgYGZN+TBcgJAbjFyA455XObLHPISQMYUcDAwIAcCiSZSVYI4Alykj1Edi6glnlkpwEjI1tYyifbcnIdgJIG0BxBF/AfGUtLKv03MrKF8enngAl+Lv8Pt+TDHUGuA8hOA8hgQAoiGDjckk+RfooccHPbfoosJ9sB0pJKDAWb9sD51499gDH///j+k6S0QHFRPMsshYHNKImBgYGBwbZMEC7OwclOlNlUqQskfqoxnH23g/H78d//GQ3+ocgRcgipUYC1LXD23Q4GD8HG/+cc3zHs8vxEkoFktweQgZGRLcOOc/UMDt7qEAFPZwYJng8Mvx9LMHzp/Pefp5wJZyiQGgUoTTEYoKRJRlEIwBol5FpODviPjqHFMN0BReU/MqBWg4QuwT88AQCYLH0joVq4ZAAAAABJRU5ErkJggg==', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABX0lEQVR4nO1WsUrEQBQcD9G7QjiwCMt26ayEs1Ps0iiSTvwom3yPrQhy4omCWMjlQAghhSBanFZrteuaFMnOC1h4Ayk2IfNm35u3b4EVVvhjrAn+NX1wsQKMVjEAIFIaVVmgKHOKbyAJbhEpjcnkEGhmpRXrhAAXFIC/ewpMBlxgX8j05JniYTzQKEEtA0GcVAbqKfcEBW+I7oK++GgPaBVb59PBWQFGq9iZryYiGJQJ/YUVMJtdUnx0CbI0QZYmNjANWoAPiQiRgOOzFFmaSChkAqrFHNH2GIA7C4JnASVAqxjnNzlup49ubbsiFPQwsqhe31CUOeb5k31lFndL7OyPO3WEeBZESjsTXu1+YO96w30bjjZb+UNL0BhEwO/D6OLoHQ+nLwCAz+VXqydEJajX/eB+62fHo24C6C7oYrouJRCb0DuEJBfczjD1R6s4uPd9iG/F7G1YLKBHrn+Ob6WDaIJC107MAAAAAElFTkSuQmCC', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABcElEQVR4nO2WsUrDUBSGv6rQdpGKQwjZ8gQSEFwKLrroIvQFfAIXdS8IDm4OvkFxdxI6OHQQFPMAinEKaRGlW1oF46C5xrRocm6og/23ey/3P//9z7nnXphiij9GSWNvVASXVEBkmTYAhmkB4LodEd+MTvAk1jcaMOrKr5gTCAC+Tt4LfPzAk9KIHFCBk0KuNu9EPJIaGElByoFcnCIH0pYnBOU+kPgWFMUnrgHLtEmlQnQY0TWEj+IzTAvHqUviKoiKMDmIBUyyEQFwut3gtnUcBxZD3gee+vQe7gG0RIgFFAVtAZ2DneQw91sgEjDuMZJCqxXvLdsYizUAtk5aVKrl3JxaKTi69tg9d5l/dgAYhEPCy9eo3exmTkVeB8b+BfzAo93sUt9fUHOVajkTt5YDcTcECC9muVl5UWuDcJjJCbEDcWD43gXPVh+jtcMapaU3tf6TG9oCpC1YLKAAjkI2Kyc+PycTc0AJKJDrn+MdQ0Zq+RBlcWAAAAAASUVORK5CYII='],
  north: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACJ0lEQVR4nO2Wv2tTURTHPwnSQUNBl+T1DponQgQl8ZVOpUMnC1rUUgL+gOJc0MUijgqCi7iIi4OKIlIK/gcqaMDF2KKCpTYFy8trhC4msbr0OOQHTRP7cl5SXPKBNyT3vu/9vnPPOfdCjx7/mVAH70o3tIIaEADHGQGg4Lm4Xi6QXhADYiwbgKhlGgay2bdqzT1+E+bG3kkxkqcY87hy/2pL8YLnatbUGShG8px/egaZDxP7eFLSmURXFq4R9ptweS4denjqMQCmVAl5db8baPVfVwwARA7sJ5TaZPB9H6uJ9ZZzqnnRSVX5szBdlqV934VKFbR61PjmwFaW+14xUR7HWDZRyzTlgOvlBGUUtCFrqv/taPtBWzmwndrCUcvUe8GlgX5uxiNqLdUWAGSSRb4VlpnKphoHBlLEjx3CrJRUW6GOQPpHkoN7wzyJzTeNfVr7xcyQrdJTG3C9HBc3zjI6eJyZE7eBSk48y//USgVCjGWL44xIuv+OvJlclAtj1ySTLNZL0Vi2qiQ7Ooxq3a+2HVNrqaCaOgOOM1J/qH75amJd7nJOviytyOzw17YjoM2BBuHq8YuxbG78GWV64wUA9nDlFN0NA7We38Tr3yUO20dZfPCZ+C3h9MshHk3O+ppQ94GdcL0cE/fGKcU2+fC8DEf839EYkH99PTTejiLXwwAhFvxFA7XibqIy4Hq5pnvgVqKWUV9MAvWBXdAMZEJ2+N2jbf4CRMLF05YT8okAAAAASUVORK5CYII=', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACEklEQVR4nO2WvWsUQRjGfyNCEiIiWGzGQdDNx2F1x2JxEhbSWF0jKayEaCdIOis7O/0DrGxybRA7wUrTHGcVcgHxYrHE4LI5wQ+I4S6c3ljEWXLJmtvZu8Pmnm6+3nnmmXfeZ2CEEf4zRB9r9SBinelnc8/z8Tz/X4RS4WyWzZV0uzpMO4wCjaUSPRVYna9nOtnACOzLTVrNA92stvVK8VUXmUYU0ojC4RK49+K2GJ8YEwBXvlwGIIyCE/OS+gZCwEAUOhTf56jk906dZksgdRKOT4yJ2oP9+AqynjgzAYDvjc8s1HIcfwVHSFm/AlvJ4ifoSJWYgH+VSR3XuhCFURDL70iFIxVhFHDn0nkeXz1nG86+EO2UfvPm62vuvit1E/vWYfrmdRbCH6x92kl9FdYK3FifRWwrylMbieO38nNW8TJdwdJugRlnmtX5OnDoCW9bP9kKPtqGy5aEjlSI7UmW55apq4BrFZ9HYpEwClDStU5EW2glXa2kqzl0QF2e2tCV/J5pWyGTHZvsN1a8tFsA4OXFMq3mgV5zN4dmYBrQnudrz/NjBYwizWpbG+NKG9BagaQq6EgFwMxijuelFUShQ7Pa1mmsPOuPqAtHK+KTD0/ZeviL9fstihdme661KUQnfkIGRgFDJP9sEkBQ6x10IAr0AysCYRTEp02C8QUbZCkWvRJraAXoOAl9SnuE1PgDj7PGHBejfbIAAAAASUVORK5CYII=', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACEUlEQVR4nO2Wz0tUURTHv4kwLR6IEUyXi8I8TCeIJm5QiD1IMYhGpEACoUWbNv0BtW4ZESS2yKVrBRdu2jkLJxUkQhBshhlx6vKchSKMMCPhnBY2D980P+5549BmPvAW7/LeOd977jlfLtChw3/mUgv/0kXE6moluVIOlHLqCTIiiGqSwgYAhIX0FvOuhnaz7JhNK5CY+tF0Z3lXc3LyBBz2pVBc+02l4gnNX/vuE5N3dUvJjZkdm6NS8YSSsQJJYRPOjsH34KwH2H1g1ITWlV4AQHTjF9ZUutGnrUxVc47fleln9OD8bqsfNt2cj7+sfMXUzn1UpqAa7WYJzCpwS+bNP1C7+7mjGMiIKonDQnpeMHrZwtuIxY7FOgIAyMVPsX6UxrNk1Lcu79xG5GY/HugjJPZyxkfBrsDwt+soZkpIxgq+dX1YRgZX8SQ2yA3Jwuv4ZKxACXvL5wPPI7fo4+R44IkwEiCFTUo59PDuS9p8vUPTL95XHNIzqHYK8EScd79c/JQS9lbbE3sClHJIKecfC57HB9pO79Ls2JyxEG4T+gL/nXlIYUMKm0aWHgMA4hPKOCB7Cuq5IAAMPL2BhXvb6HllIb1MRlUIeiOqiRQ2lvEJoZkhhD6XsfhotakIjhFRvd1X3DDvauyHUrDedAHtMqKLhiVAu1nfPbCasJBeY5oS6FLahpiBRFCD9w7G/AHOWdTx/CigwgAAAABJRU5ErkJggg==', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACHklEQVR4nO2WP2gTURzHPykW/xYEpfG4CiYqBqpNPUOXGLGDQykO0uJi14KLo6WuioOOOji4WHEQEQc76CA4yKGUElq7pAXj3/PamjqY2iRF8zrEhB7NJe/dJbjkC2+4d7/7/r733vt93w9aaOE/I+DjW9EIrjY/yQ0jgWEk3ARJwYtqoWthAIKa7niRTL5R5qy7AmY0W/fPlmyLJdtSySsvwNZmyecKIp8riIkDMw4xfhJLCxh+eTrwuP8VYqaNI8HDAFh2ektctbmGCAAQXb8J9BbZ+zSDGc3WCvVTVfWxeqsovkZWBKUTX20oY5tKcGplgVgqQrkKqkBYdrqxVbAZsdsRoFR+QU1323ellfBkRIFPu4GSEZW9oH/HHh6eP67MpbQFAE/iKTrtdc4mexzz+qleAEZCPTz6+F4geSCVV+CiGaG9I7SlGqyfReYW14id6FTiUxYwPnSXe7/iHOzaxdWTNwE41zfK6/wq03PL2FZGiU+1bgVQSRwfGubO1GVufH5OfLbDL7e8CF0LO4YZzVb8YfLBC09+oCTAMBKV5PwzoS+Df8WzfRMinys0tQwr5Jt9QNfCXHg7yLF3Z/jw7TvTYylpEcqH0M0FF7cv0H00xI9r64SuCzKjOSkRXjsiV1wyBxBXDjE/9UcqXsWIRI07wNEd7b+/E5plRPWSq0JJgGWnqyYrd0U1LihXeGpKm8DpSYSo8dyCNDYAlr7FjYJq6iwAAAAASUVORK5CYII='],
};
const HERO_WALK_FRAMES = {
  east: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABdElEQVR4nO2XP0vDUBTFf/4BdXCOj+cgGRwdgp2kWxFcurnnG4igsw7i3MFv4ObSUXHT7sVVaNoplEoQcbDtIM9B06ZGKLkvpkvP8kJ4Offk3nNvXmCOOWaMBYtnTR5cUgFGKxcAR2kAet2QsNvOzLdoEzyJne1dSGdlKpYFAoDxmwM0mw0pjSgDwHfKkwj8SMQj8UCqBI7SySxk4hQJAPjLBxITirsgLz6xBzyvjOeVrYJLBRgYm/CXiMwQeyBGLODHhMWVoFatUKtWrGaAlYAYWrmzGUQAh/t7nJbS7ViYgPbbG1t6E4BOK5yyOz8YwByXPKOVa7RyTXyvMAHJoI2LIxNenYkFiEsQj+KN3isfz20pTea+nfgQOUrjrCvqd9cArK6tFDcHYtw+3IyuB/1h5jKIBSQPJPcH75gnGZV1BgBehnU+H5fyoJqKkfvPTy4nnB/4kRn0h6bTCv+1HU1iTQUK/MgEfpRJQB4HEpt/izn4AtOsehqCVyNKAAAAAElFTkSuQmCC', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABm0lEQVR4nO1WPUsDQRSchFjYBiEsJwSuE8FiIYWBLfwL1oIpREwVhZSCKUJ6wdIfoXaC2BxiIyGFIhZJd4SAtZdg8SyOi3sXNLvvzthkYIstdnbevI9dYIkl/hm5FGcpCy6uAHKECwAoCQcA0O16LL58mst1SKmAWVfmosAQAOA7cmAaPQscBwAAo6Ef2/dr7yweTg3MpKAkHN0FK06WA/5wENtrblgHxO6CrPjYNSCliiqffXkqAUBovSbEugWBjFIQOcEdRlwB5F+ckdduEMLOoKQwE6RKwcdb2A1euzHTGaZIlYLL6hZePgsoiyIA4PjmLg2nOU4qMrKbAJCUSk8BqxhtQcnltRt0Va9FQozBrgFHuHCEG5sFlc2yNU9mz7E6PcfTcxX9wSvGwYRazc6fpIIc4U6XlIqkVLE2vD66pXEwoXEwMRJg40Ascv0nlHSEeiGtiQumLfPj5Um0mh2sP6xh734f1MtjdXvl1zusf0T+cKAPnYicpFTTZ/ng8TC3U9+l0kZxLp+xA3POZPJDNhGxkCGzxELxBULsmxS7cbuMAAAAAElFTkSuQmCC', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABhElEQVR4nO2WsUvDQBSHv5aK7eSgIuEENbi5SAZBSheRbhaXznYtLv4fLm6ujq66CQ5CN4vFpZuNFTxCoZMd1MU4aEJq2mreFbv0gxAucL/3y7137w6mTJkwKYO5/ji0pAZ8ZdkALFkKgEajJtKTGAiDRw0AdDyN9txEmhmBgVjg778XkZZO7Hi6b9yqdEU6ximAr9VoNGooy06cAtEKaM+NfZMEB4NdMC49cQ04TgHHKRgFlxoIa6Dj6Z8mEiMqwuggMCBtROI+cFLaBeC47vb1hKSIayDKRBoRQLmY5/xwz0RCnoJVtUy9+URbPwef/m0XALB/esa8mqNczAf14CvLHtYfhiJagWAb3t02YWuDo8trAFZeMuhREwcwlrNAey6PDxpLLeDfp8ltz/xZN2kKBt4FlGWztq7Q1R6pzQ/eXt//nArj+0Dw1p5Ls+1DtQcQmsjmZkeuhthAQPReULpZDINdZK/84sGOqXwMf8QTo1Xp/poK8XFsegYYGxij1pTJ8glXoXplQjfsvwAAAABJRU5ErkJggg==', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABnklEQVR4nO2WP0vDQBjGf5GKm1OhxAhKCwUROhR1qAgOxVEnR6FfwEFwFV10EcTB0UHxG3QQXHQQBxW7SBGUZjtDsYO4KpxDTE3bgL23wS59IORycM89ee79czDAAH2G1cNaHQeXVIB27DQAKdsBoO4plOca8w31snkYKdvBsdPtrvyJhEBAc8MAlcq1lEbkAOBbHkat1BDxSGIg8giU54o4RQ6ENmuH8Q+JsyAuPnEMOHaaqKP4NwFhIaG3cRqKgjBKQICf+OiaV+TAxmye40KuYz6XnTHmEgmYHv6i+unXMOW5KM9l4iPB+dakhM4Y+mV9TaujbY1fEzT+sQSPEUQOVB4bzO2eNb/z+QUJjUiAPlwuMlbMthSjuqfEKSly4OGuGjkvSUVjAfv3LisHpy3NJ9wZTWHcjmvuEwCZi6meNwcDB3Y293R58Q2AwnwR5bmxlOJuHdDjN0mWLkeB1gtIcC9I2U7HHSFOAU28l1+DoaU81zjv29HtEVgjqwUAbq+e4bfWW6GxKB66bhq1UkMDZE6SUWtiuaIP0Bd8AxMqdgx9WEYwAAAAAElFTkSuQmCC'],
  south: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABn0lEQVR4nO1Vv0sCYRh+zAYrXLSG6yvpjiJpEDqhTbOtcGlodGpoaOtvaQham1oF91JyaLjWIIgQzaDBaNA7Qt4GPbkTxb737lzygeO49+V73ufeXx8ww39HyMNZ8oOLK4B0PeMyGEaFxTfnR3AA6NuGszIRnAxMCiLFyckAHtYfAQBmx4LZsSAUDU+7ZQ4VC5SOHVJBTREAEopGt7kjEopGmFIJAICqx3tQI0sAgO+PKLbviiw+tgC/+KR7QCgaFXOf49zSJZASIBSNsltpxFsRAL3Rs0dS1zMQiiYbXzplBAC1fBeJUhhjlpEUr3QJCmoKiVJ4pG/UgvJdwMVCcqTdMCootm+kBciC6sk3u9Fo+On7pBqRtQkdIgBg0Hxrzxtebtc/gYSi0b5+RgColu8SAGod1J1/HnwG7o1r1/f7KsHsWNLBOQJCAHClXrqMX+Wm0x/sbdhovobyO+cu2+KyKUszwDz7pAMvm2HET3hUrB6wEW33Ut9YqSKWDXwAevg5NQfdb7/BaD4/MLyQWPBUAkdgdv69CJhS0WcIGL/FA4L61N51mwAAAABJRU5ErkJggg==', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABuklEQVR4nO2WzytEURTHPyNTbFAT5nobvZWVH29BlIVkISUbsrGRZmnlf/AX2FmwtVJsrTTsJtlJJuF5KGn8GtJ0LGbmZszE3DsMxade3R/vfu95555z3oV//jqhCtbKV2jZGiCeN1gwkEhsW+nVfMXmAI5yodgrn2Ljgc82MdK08QBnHccAPKWfufCPAIh33dlImeMoVwBZbJwTst6Q5YFO3TbVqzVd4AfJECBuj88B4wDcX9UB+1BZVhkhpZ6cd4wwjgFHubI2GS8aX43umUoBhkfgKFdalUNm/wZHubQqR88NPzZBCjxvUBKJ7bKPwsgDfpAEYOF2ns3oykevln0UxkGYq3gQLT1/GfimkkYIIKdTMSFbEXUAxrvuBJCdiV6rdCzbgGB6SNZVS6nol63YuG6XK2hVCVv62gv6u96hbufi5NvqgTjK1V+ZP4KHnnvpDkeqUwf8IKmzIU9qNMXG0qqplJUB2rVvf8kNjYrmmZGqGPBrKMiCk7GMnIxlqhMDeUrdimywNSB0Gfikd18KBt8H53caUETkPG21ztoAP0iG6vvDun/dVm8rVRECyMvsk/WV7J8f5xXtVKcmJJq4YAAAAABJRU5ErkJggg==', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABnUlEQVR4nO1WPUvDUBQ99QOhg4KCbYwOZrGD0DaCW4VsQhBUUHRy0d+iu7+gk3/AHyBKLQi2hYpDoUFLQupUpBaVWq6DJjStpd7XtIP2wIPkvuTck3vfeXnAEP8dgR7eJT+4RAWQqiY8gUzmSohvxI/kAPAda61KV4hUoFsSFqdIBWBGHhAbn8Hb6zvKVhEr0+vIxi9FqIRAAOh46pBkSSFZUuh6c5WcOJdsTEBAAABtzN1jO7SM4GwYz/m75jk2mQg6felgXHC2dN4W/MkZvkOWFFLVBCXDOdqdPCF8WZJUNeFeczlZa8CyDQDAQTmGkt5AMX0BQq1NpGUbv24FuwWWbSAZzmErraM8UfDMPdkWl44NqmgmpaLVZtu541GPkCwp7DawBNTiL06C1t6TvacJ7QUsARXNdES0DUdIXwU4IxWtugkrmjl4ASW94fSbSnrDjXPXANcFAQAonOY8QSlUd+c5FhQR4IrwC0K/48VsxHN/c1vv8GSfBHwcjTaXHQvzQWEBvYL213aEzwJA7/305WTsh4C+en+Iv41P4Bqt87Ck0JgAAAAASUVORK5CYII=', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABwklEQVR4nO2WP0sjURTFf7MqLGjl3wwDKsOSFIqLI4isxE25YqvFfoGtrf0GfgWxsRFt7LZVNGglo62wBNdldgzINiYkMejdQmc0kaD3RW3Mqe68yz33zHn3zRto4b3DaqJWXoLLqMixXRmwnZq1fBgQhDk13weD/pKoJBvmtGQmDjzVRMVp4gBnc9c4tku5VKFcquDYLvufL02ojCCO7crqlzFxbFcc25XNzKxw64x6C9oNBFhBmJNe+tlOTQFQzV/EOTWZgQBo/Kavfwomur/J0fheo7R6C1QCHNsVGS6SxGMtcQyA56XxvHSUV4tQCQjCHAAzv+f51HGlKX0ZAQDWaSerQ0tM/5l8lNtOjUYuPBvqU7A7nAEO4mffz8bxMdUoFJ45kGoHUuEKGx/X2czMxmvRDAAcfh1S8WmPjXhemnwYAPczUS/kzpVXccDy/SzTxR+cLP6qafqmKI4XpLB8I9w68vAzrP4kG11GyfMx/u3d96ibfAvF1hoJeAjfz1L/c6JB0wK+zyzEQ8lb3AUAO0tbcXxSOI9Og9HFZiSgK+yLY28kadzcuPBs7loABn+2NcUDTcxAz9+SaWkLLdTgP3zxhnD3MG4xAAAAAElFTkSuQmCC'],
  west: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABdElEQVR4nO2XP0vDUBTFf/4BdXCOj+cgGRwdgp2kWxFcurnnG4igsw7i3MFv4ObSUXHT7sVVaNoplEoQcbDtIM9B06ZGKLkvpkvP8kJ4Offk3nNvXmCOOWaMBYtnTR5cUgFGKxcAR2kAet2QsNvOzLdoEzyJne1dSGdlKpYFAoDxmwM0mw0pjSgDwHfKkwj8SMQj8UCqBI7SySxk4hQJAPjLBxITirsgLz6xBzyvjOeVrYJLBRgYm/CXiMwQeyBGLODHhMWVoFatUKtWrGaAlYAYWrmzGUQAh/t7nJbS7ViYgPbbG1t6E4BOK5yyOz8YwByXPKOVa7RyTXyvMAHJoI2LIxNenYkFiEsQj+KN3isfz20pTea+nfgQOUrjrCvqd9cArK6tFDcHYtw+3IyuB/1h5jKIBSQPJPcH75gnGZV1BgBehnU+H5fyoJqKkfvPTy4nnB/4kRn0h6bTCv+1HU1iTQUK/MgEfpRJQB4HEpt/izn4AtOsehqCVyNKAAAAAElFTkSuQmCC', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABm0lEQVR4nO1WPUsDQRSchFjYBiEsJwSuE8FiIYWBLfwL1oIpREwVhZSCKUJ6wdIfoXaC2BxiIyGFIhZJd4SAtZdg8SyOi3sXNLvvzthkYIstdnbevI9dYIkl/hm5FGcpCy6uAHKECwAoCQcA0O16LL58mst1SKmAWVfmosAQAOA7cmAaPQscBwAAo6Ef2/dr7yweTg3MpKAkHN0FK06WA/5wENtrblgHxO6CrPjYNSCliiqffXkqAUBovSbEugWBjFIQOcEdRlwB5F+ckdduEMLOoKQwE6RKwcdb2A1euzHTGaZIlYLL6hZePgsoiyIA4PjmLg2nOU4qMrKbAJCUSk8BqxhtQcnltRt0Va9FQozBrgFHuHCEG5sFlc2yNU9mz7E6PcfTcxX9wSvGwYRazc6fpIIc4U6XlIqkVLE2vD66pXEwoXEwMRJg40Ascv0nlHSEeiGtiQumLfPj5Um0mh2sP6xh734f1MtjdXvl1zusf0T+cKAPnYicpFTTZ/ng8TC3U9+l0kZxLp+xA3POZPJDNhGxkCGzxELxBULsmxS7cbuMAAAAAElFTkSuQmCC', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABhElEQVR4nO2WsUvDQBSHv5aK7eSgIuEENbi5SAZBSheRbhaXznYtLv4fLm6ujq66CQ5CN4vFpZuNFTxCoZMd1MU4aEJq2mreFbv0gxAucL/3y7137w6mTJkwKYO5/ji0pAZ8ZdkALFkKgEajJtKTGAiDRw0AdDyN9txEmhmBgVjg778XkZZO7Hi6b9yqdEU6ximAr9VoNGooy06cAtEKaM+NfZMEB4NdMC49cQ04TgHHKRgFlxoIa6Dj6Z8mEiMqwuggMCBtROI+cFLaBeC47vb1hKSIayDKRBoRQLmY5/xwz0RCnoJVtUy9+URbPwef/m0XALB/esa8mqNczAf14CvLHtYfhiJagWAb3t02YWuDo8trAFZeMuhREwcwlrNAey6PDxpLLeDfp8ltz/xZN2kKBt4FlGWztq7Q1R6pzQ/eXt//nArj+0Dw1p5Ls+1DtQcQmsjmZkeuhthAQPReULpZDINdZK/84sGOqXwMf8QTo1Xp/poK8XFsegYYGxij1pTJ8glXoXplQjfsvwAAAABJRU5ErkJggg==', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABnklEQVR4nO2WP0vDQBjGf5GKm1OhxAhKCwUROhR1qAgOxVEnR6FfwEFwFV10EcTB0UHxG3QQXHQQBxW7SBGUZjtDsYO4KpxDTE3bgL23wS59IORycM89ee79czDAAH2G1cNaHQeXVIB27DQAKdsBoO4plOca8w31snkYKdvBsdPtrvyJhEBAc8MAlcq1lEbkAOBbHkat1BDxSGIg8giU54o4RQ6ENmuH8Q+JsyAuPnEMOHaaqKP4NwFhIaG3cRqKgjBKQICf+OiaV+TAxmye40KuYz6XnTHmEgmYHv6i+unXMOW5KM9l4iPB+dakhM4Y+mV9TaujbY1fEzT+sQSPEUQOVB4bzO2eNb/z+QUJjUiAPlwuMlbMthSjuqfEKSly4OGuGjkvSUVjAfv3LisHpy3NJ9wZTWHcjmvuEwCZi6meNwcDB3Y293R58Q2AwnwR5bmxlOJuHdDjN0mWLkeB1gtIcC9I2U7HHSFOAU28l1+DoaU81zjv29HtEVgjqwUAbq+e4bfWW6GxKB66bhq1UkMDZE6SUWtiuaIP0Bd8AxMqdgx9WEYwAAAAAElFTkSuQmCC'],
  north: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABnklEQVR4nO1WPUvDUBQ9llY0k3WxIai0Qgc7COngVBARkYod3Vy76T/p3lUEBwf9AVo6SNHFIhbcLPgRHh2kFYdaRK5Lk9pYLfcmtYgeCIQb3nnn3dx77gP+8dcx4mEt+cElFUCGHsOUbgAAasqCpaoivoB0czfaMXdWBiLAVwS9LK4py7OAoWdAJKBdcH1jgxLwXaWzu0DShv0qncXJFUAAYJopAJ0i9OIHbAH25l+hXD5l8bLbcL7+hLBq4DDcWWqpKrbHZhDVQigz+UQ+ENVCsNRNV6yuTwCqweZid8HSyjI28qWe8bnVOFsAF2Q/hh6j0sIz7UYu6WMcgnnAElDIZqiSSzubNc9eCQBVcmkqZDMDFwC4Tlvcqnk6vXgW2CN59EqTUogE9LwLHCeuATgGxcqCL9NQC04D8Gc890NXF9jvd+tv4jrgZMBJv2mmHP839BiKFxXsZ06cbxwRol/gTvXmUQKzt4sSKp4VW6oK9zCKtOJ4uH9E8jwMjIs0sPDJ9ZKTa7QTzNNLs/UjTthTzEFgz3bE4aHtiL8P7x2DpGQx+kBRAAAAAElFTkSuQmCC', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABt0lEQVR4nO2WO08CQRRGD0aFrDExJD4IioFoSwGNRq1ssNDCWBkxVnbEWNjYWfkrLIxUlpYapaCWgkQTjYKPbNaloPTVjIWwICJkZiAW+lWzd3fvPZn7mIF//XW5NP4VrfClCiD8vhCDPj8AtmViWjklfx2qwWtVstXuSlsAWqpOnZ9ty9QG+PUdUAIoFVxTW7sAGlW6dBeotGGjSm87gACIRGbqvsxk0tI+pVOwEgwT6q/MgUwmrdUNSkU47TZZHXY7gU0rx9TlPQlPACSHkVYbjhYLzvpcFJV8SAMk81lnfe8dACDhCbB/cMPuzp00gNYkLPf+1myeq50rxi+GQO+EbSqR8AQEn3kWgEjFbfH68lZtk5J0CoJGF6frC1w/7gHwcGJx1HMo60YdoKy1sQ0Atl2LTMwtE/XGlCFk9SUFybNjkYrbIuqNKaVAqQjLFxLTyhHcnATgyX2t4ko6BQJwrmI/gLVtEAm/L0S96xhUWlIWQrkIq3fhxr6ta285gGnlvgV4Dz8zf9HrPMseTDJF6AJE6cj9EbDq25YD1DoWAN1ZA8PokwqqA/ANZmTYEIUlDS+/rQ/sfIeOyUdqiAAAAABJRU5ErkJggg==', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABlUlEQVR4nO2WQUsCQRTH/0alhJcOYsOcmjolFHgr8BAEQsGepKs3v0AfolPQV7Cgax/APISENw0DDwUrWMsiHioiIyReB91BV1Fn1i0i/zCHfezM++3b9948YKb/roCHvTSNs3QBiDOBKOMAgIZtwbJNrfPmdJ271bW5o+ILwFQ172Vzw7Y8A/x6BLQAugk31uYXwKhMV64CnTIcl+lKZ6oCEGcC25sJmM1OyEVEoFgpIMq4Vj9Q/gW7oTBC92X5bDZNWLaJjedXHH2qB1S5DJftFwBAqVYZtC8tKANoVcGqhqOpAYxyXmu1PcFMIupdF8YV5WJVctt9BchnDMpnDEKnIuhm640c+93Jvu8A2AmG6dTYIwCUi1WpfvD1Y1/vSDrLrtwSZ4JSyTRxJrQA/txlJIeRVDKN9egaLNuUXdF5x08AAEA8ntDZ5hmAAMg5cJh6RrWJo6DUijkT8sI5fzjDYvkdOBx8R2U28DSSBbMRAECpVOgD8FOyBD+K7WE9QLkUVZMw4KzL42s8PrX6bD1rpon1DU0anX8mD2blAAAAAElFTkSuQmCC', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABYUlEQVR4nO2XP0vDQBjGn4rQDo6iHAcONznfKOQLOPZjCC6tm5/BQZwUuvUTdHJzELrZQV0tKITQpSJkaEB4HZKDJk1q3/uDg/1BliPv3cN7T567AFv+Oy2HWvIxl60AkkLhUEgAwCyJESdTq/l2bBevUoxVuxJEgFd2XYpnSews4M87YCWgMNyvY6EErHO6y2e9GVIoQu72uocN14TUz1ro5UJKOQAAcTIlMLtg5YG6HDBiuHgzIQBoHQHMrWAL6M3fSu2fTB7R/fzGdVfjrPPFnY4toLS/Zu+faM5e2FZAI7eDB6T7B+w6pyg2jLMU74sUw9Ezu9ZbB+4vjvFydcqu89KB884R7i5frWrZQVQ3eLP4wEl7D+MsBUIHkRRqJQekUGZxNk4eaEi/sEG0zPKFpC6efQsgraOVA6jp3RACAOTRW8V4ojgLgkFSKNI6IuTdoDV3g42x/i/wMMcWAMAPjxByk0/niFoAAAAASUVORK5CYII='],
};
const heroImgs = {};
(function () {
  Object.keys(HERO_SPRITE_DATA).forEach(dir => {
    const img = new Image(); img.src = HERO_SPRITE_DATA[dir]; heroImgs[dir] = img;
  });

  // New Animation Package Integration
  const animConfigs = [
    { key: 'idle', path: 'animations/breathing-idle', frames: 4 },
    { key: 'walk', path: 'animations/walking', frames: 6 },
    { key: 'fight', path: 'animations/fight-stance-idle-8-frames', frames: 8 }
  ];

  ['east', 'south', 'west', 'north'].forEach(dir => {
    animConfigs.forEach(conf => {
      heroAnimFrames[conf.key][dir] = [];
      for (let i = 0; i < conf.frames; i++) {
        const img = new Image();
        const frameNum = String(i).padStart(3, '0');
        img.src = `${conf.path}/${dir}/frame_${frameNum}.png`;
        heroAnimFrames[conf.key][dir].push(img);
      }
    });
  });
})();

// ── PixelLab enemy sprites (old cyan hero repurposed as enemy)
const ENEMY_SPRITE_DATA = {
  east: 'assets/enemy_bug.png',
  south: 'assets/enemy_bug.png',
  west: 'assets/enemy_bug.png',
  north: 'assets/enemy_bug.png',
};
const enemyImgs = {};
(function () {
  Object.keys(ENEMY_SPRITE_DATA).forEach(dir => {
    const img = new Image();
    img.src = ENEMY_SPRITE_DATA[dir];
    img.onload = () => {
      // Process to remove black background
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx2 = c.getContext('2d');
      ctx2.drawImage(img, 0, 0);
      const data = ctx2.getImageData(0, 0, c.width, c.height);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] < 20 && px[i + 1] < 20 && px[i + 2] < 20) px[i + 3] = 0;
      }
      ctx2.putImageData(data, 0, 0);
      enemyImgs[dir] = c;
    };
    // Initial assignment so keys exist
    enemyImgs[dir] = img;
  });
})();

// Adventure enemy archetypes
const ENEMY_TYPES = [
  { type: 'glitch', hp: 1, color: '#ff3c55', scale: 0.80, label: 'BUG' },
  { type: 'leak', hp: 1, color: '#ff6622', scale: 1.00, label: 'LEAK' },
  { type: 'worm', hp: 2, color: '#00ffaa', scale: 1.10, label: 'WORM' },
  { type: 'overflow', hp: 1, color: '#dd1a40', scale: 1.18, label: 'OVR' },
  { type: 'corrupt', hp: 1, color: '#cc30ff', scale: 1.25, label: 'CRPT' },
];

// ── State ────────────────────────────────────────────────────────
let canvas, ctx, raf;
let lastTime = 0;
let tickTimer = null;
let tickStart = null;
let gameMode = 'pvp';
let advCanvasW = BOARD_W; // wider canvas in adventure mode (replaces hidden P2 panel)
let _p2PanelEl = null;   // saved reference when panel is removed from DOM
let S = {};
let stats = {};
let aiThinkInterval = null;

// ── Event Log ────────────────────────────────────────────────────
const LOG_MAX_LINES = 16;
function logEvent(msg, type = 'info') {
  if (gameMode !== 'adventure') return;
  const container = document.getElementById('combat-log');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `log-entry log-type-${type}`;
  el.innerHTML = `> ${msg}`; // using innerHTML to enable emojis & tags if needed
  container.appendChild(el);
  while (container.childNodes.length > LOG_MAX_LINES) {
    container.removeChild(container.firstChild);
  }
  container.scrollTop = container.scrollHeight;
}

const UTYPE_ICONS = {};

function getUtypeIcon(utype) {
  let color = '#ffffff';
  if (utype === 'worm') color = '#00ffaa';
  else if (utype === 'leak') color = '#ff6622';
  else if (utype === 'corrupt') color = '#cc30ff';
  else if (utype === 'overflow') color = '#dd1a40';
  else if (utype === 'bug' || utype === 'glitch') color = '#ff3c55';

  if (!UTYPE_ICONS[utype]) {
    try {
      const offBase = document.createElement('canvas');
      offBase.width = 34; // CELL width
      offBase.height = 34;
      const offCtx = offBase.getContext('2d');
      const oldCtx = ctx;
      ctx = offCtx; // override global context temporarily

      const dummyU = {
        x: 0, y: 0, px: 0, py: 0, rx: 0, ry: 0,
        scale: 1.0, color: color, facing: { dx: 0, dy: 1 },
        utype: utype, hitFlash: 0, hp: 1, maxHp: 1, id: 999
      };

      ctx.save();
      if (utype === 'worm') {
        dummyU.trail = [{ x: 0, y: -1 }, { x: 0, y: -2 }];
        if (typeof drawEnemyWorm === 'function') drawEnemyWorm(17, 17, dummyU, 1.0);
      } else if (utype === 'leak' || utype === 'corrupt') {
        if (typeof drawEnemyBinarySwarm === 'function') drawEnemyBinarySwarm(17, 17, dummyU, 1.0);
      } else {
        if (typeof drawEnemyPixelArt === 'function') drawEnemyPixelArt(17, 17, dummyU, 1.0);
      }
      ctx.restore();

      UTYPE_ICONS[utype] = offBase.toDataURL();
      ctx = oldCtx; // restore global context
    } catch (e) {
      console.error(e);
    }
  }

  if (UTYPE_ICONS[utype]) {
    return `<img src="${UTYPE_ICONS[utype]}" style="width:14px; height:14px; vertical-align: middle; margin: 0 4px; filter: drop-shadow(0 0 3px ${color})">`;
  }
  return `<span style="color:${color}">💀</span>`;
}

function getUtypeLabel(utype) {
  if (!utype) return 'ALIEN';
  if (typeof ENEMY_TYPES !== 'undefined') {
    const t = ENEMY_TYPES.find(e => e.type === utype);
    if (t) return t.label;
  }
  return utype.toUpperCase();
}

// ── Retro Sound System — synthesized 8-bit sounds ────────────────
const SFX = {
  ctx: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      BGM.init(this.ctx);
    } catch (e) { }
  },
  play(freq, dur, vol, type = 'square', drift = 0) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (drift !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq + drift), this.ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + dur);
  },
  shoot() { this.play(440, 0.1, 0.05, 'sawtooth', -300); },
  laser() { this.play(880, 0.15, 0.04, 'sine', -400); },
  hit() { this.play(120, 0.2, 0.1, 'triangle', -80); },
  heroHit() {
    this.play(80, 0.15, 0.12, 'square', -40);
    setTimeout(() => this.play(50, 0.2, 0.1, 'sawtooth', -20), 50);
  },
  death() { this.play(300, 0.5, 0.1, 'square', -280); },
  bulletClash() { this.play(500, 0.1, 0.06, 'sawtooth', -300); },
  tick() { this.play(1200, 0.05, 0.03, 'sine'); },
  select() { this.play(1800, 0.08, 0.02, 'sine'); },
  win() {
    this.play(523.25, 0.1, 0.06, 'square');
    setTimeout(() => this.play(659.25, 0.1, 0.06, 'square'), 100);
    setTimeout(() => this.play(783.99, 0.3, 0.06, 'square'), 200);
  },
  pickup() { this.play(800, 0.1, 0.04, 'sine', 400); },
  upgradeScan() {
    // Rising hum — builds tension through the whole scan (~1.3s)
    this.play(90, 1.15, 0.055, 'sawtooth', 480);
    // Accelerating ticks — like a slot reel spinning, getting faster
    [0, 210, 400, 570, 720, 840, 940, 1020, 1085, 1135, 1175, 1210].forEach(t =>
      setTimeout(() => this.play(1000 + Math.random() * 700, 0.03, 0.02, 'square'), t)
    );
  },
  upgradeSuccess() {
    // Rising arpeggio — C4 E4 G4 C5
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.play(f, 0.20, 0.055, 'square', 30), i * 85)
    );
  },
  upgradeFail() {
    // Heavy descending buzz
    this.play(260, 0.22, 0.07, 'sawtooth', -130);
    setTimeout(() => this.play(160, 0.28, 0.06, 'sawtooth', -60), 210);
  },
  nanoHeal() {
    this.play(660, 0.07, 0.03, 'sine', 330);
    setTimeout(() => this.play(990, 0.07, 0.028, 'sine', 220), 55);
    setTimeout(() => this.play(1320, 0.10, 0.035, 'sine', 180), 110);
  },

  // ── Slot machine sounds ──────────────────────────────────────────
  slotClick() {
    // Ratchet tick — rapid mechanical click while reels spin
    this.play(1800 + Math.random() * 400, 0.018, 0.012, 'square', -600);
  },
  slotStop(reelIdx) {
    // Mechanical clunk when a reel locks into place
    const base = 70 + reelIdx * 18;
    this.play(base, 0.14, 0.10, 'triangle', -25);
    setTimeout(() => this.play(280 + reelIdx * 35, 0.08, 0.05, 'sine'), 55);
  },
  slotWin(rarity) {
    if (rarity === 'empty') {
      this.play(240, 0.22, 0.10, 'sawtooth', -110);
      setTimeout(() => this.play(120, 0.28, 0.10, 'sawtooth', -55), 220);
      return;
    }
    // Result fanfare — pitch based on rarity
    const scales = {
      common: [523, 659, 784],
      uncommon: [523, 659, 784, 880],
      rare: [659, 784, 988, 1047],
      epic: [784, 988, 1047, 1319],
      legendary: [880, 1047, 1319, 1760, 2093],
    };
    const notes = scales[rarity] || scales.common;
    notes.forEach((f, i) => {
      setTimeout(() => this.play(f, 0.25, 0.06, 'square'), i * 110);
    });
    // Final chord shimmer
    setTimeout(() => {
      this.play(notes[notes.length - 1], 0.6, 0.07, 'square');
      this.play(notes[notes.length - 1] * 1.5, 0.4, 0.03, 'sine');
    }, notes.length * 110 + 40);
  },

  chestSpawn() {
    // Static burst — digital noise as chest data streams in
    for (let i = 0; i < 7; i++)
      setTimeout(() => this.play(900 + Math.random() * 1800, 0.018, 0.025, 'square'), i * 28);
    // Rising materialization hum
    this.play(60, 1.1, 0.04, 'sawtooth', 340);
    // Mid confirmation thud at ~350ms
    setTimeout(() => {
      this.play(90, 0.18, 0.09, 'triangle', -40);
      this.play(180, 0.12, 0.06, 'triangle', -20);
    }, 350);
    // Rising arpeggio as chest fully appears ~800ms
    [330, 415, 523, 659].forEach((f, i) =>
      setTimeout(() => this.play(f, 0.14, 0.05, 'square'), 780 + i * 70)
    );
    // Final shimmer ping
    setTimeout(() => {
      this.play(1047, 0.22, 0.07, 'sine');
      this.play(1319, 0.14, 0.05, 'sine');
    }, 1120);
  },

  extraction() {
    // Three rapid warning taps — attention signal
    [0, 95, 180].forEach((t, i) =>
      setTimeout(() => this.play(1300 - i * 130, 0.055, 0.07, 'square'), t)
    );
    // Deep gravity pull — two bass layers holding
    setTimeout(() => {
      this.play(55, 0.62, 0.13, 'sawtooth', 0);
      this.play(110, 0.52, 0.07, 'sawtooth', 0);
    }, 210);
    // Tunnel rush — sharp gliss rockets upward
    setTimeout(() => this.play(95, 0.52, 0.12, 'sawtooth', 2000), 290);
    // Glassy shimmer overtones
    [0, 55, 115, 175].forEach(t =>
      setTimeout(() => this.play(750 + Math.random() * 700, 0.09, 0.028, 'sine'), 360 + t)
    );
    // Arrival chord — clean and bright
    setTimeout(() => {
      this.play(523,  0.32, 0.09, 'sine');
      this.play(659,  0.28, 0.06, 'sine');
      this.play(1047, 0.22, 0.07, 'square');
    }, 690);
  },

  chestOpen(explorer) {
    if (explorer) {
      // Epic reveal: dramatic low thud, rising sweep, triumphant fanfare
      this.play(55, 0.28, 0.12, 'sawtooth', -20);
      setTimeout(() => this.play(110, 0.22, 0.10, 'sawtooth', -15), 60);
      // Rising chord sweep
      setTimeout(() => this.play(220, 0.18, 0.14, 'sawtooth', 120), 140);
      // Triumphant 5-note fanfare
      [392, 523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => this.play(f, 0.24, 0.07, 'square', 15), 280 + i * 75)
      );
      // Long shimmer tail
      setTimeout(() => {
        this.play(1047, 0.45, 0.06, 'square');
        this.play(1319, 0.28, 0.04, 'sine');
        this.play(1568, 0.18, 0.04, 'sine');
      }, 680);
    } else {
      // Regular: mechanical lid creak + sparkle cascade
      this.play(180, 0.15, 0.07, 'sawtooth', 280);
      setTimeout(() => this.play(440, 0.10, 0.05, 'sine', 180), 90);
      [880, 1100, 1320].forEach((f, i) =>
        setTimeout(() => this.play(f, 0.12, 0.04, 'sine'), 160 + i * 65)
      );
    }
  },
};

// ── Retro Music System — Procedural BGM ───────────────────────────
const BGM = {
  active: false,
  timer: null,
  step: 0,
  currentTrack: 'menu',
  ctx: null,
  masterGain: null,
  bpm: 115,
  lookahead: 25.0,
  scheduleAheadTime: 0.1,
  nextNoteTime: 0.0,

  tracks: {
    menu: {
      bass: [36, 0, 36, 0, 36, 0, 36, 36, 36, 0, 36, 0, 36, 0, 39, 0], // C2, D#2
      chords: [null, null, null, null, [48, 51, 55], null, null, null, null, null, null, null, [48, 51, 55], null, null, null],
      arp: [60, 63, 67, 72, 60, 63, 67, 72, 60, 63, 67, 72, 60, 63, 67, 63],
      drums: [1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 1, 0, 2, 0, 0, 0], // 1=kick, 2=snare
      speed: 1,
    },
    hub: {
      // 32-step casino/gamble loop — A minor, fast, syncopated
      bass: [
        45, 45, 47, 48, 50, 50, 52, 53,
        52, 52, 51, 50, 48, 48, 47, 45,
        45, 45, 47, 48, 50, 50, 52, 53,
        55, 54, 52, 51, 50, 48, 47, 45
      ],
      chords: [
        null, null, [57, 60, 64], null, null, null, [60, 64, 67], null,
        null, null, [57, 62, 65], null, null, null, [59, 64, 68], null,
        null, null, [57, 60, 64], null, null, null, [60, 64, 67], null,
        null, null, [62, 65, 69], null, null, null, [59, 64, 68], null
      ],
      arp: [
        57, 0, 60, 64, 67, 64, 60, 0,
        60, 0, 59, 0, 57, 55, 0, 0,
        57, 0, 60, 64, 67, 64, 60, 0,
        64, 0, 62, 0, 60, 0, 57, 0
      ],
      drums: [
        1, 0, 3, 3, 2, 0, 3, 0,
        1, 3, 3, 0, 2, 0, 3, 3,
        1, 0, 3, 3, 2, 3, 0, 3,
        1, 3, 0, 3, 2, 0, 3, 0
      ],
      speed: 1.8,
    },
    game: {
      // 128-step sequence: building up, bridge tension, and release
      bass: [
        36, 36, 36, 36, 36, 36, 36, 36, 34, 34, 34, 34, 39, 39, 39, 39,
        36, 36, 36, 36, 36, 36, 36, 36, 34, 34, 34, 34, 32, 32, 32, 32,
        36, 36, 36, 36, 36, 36, 36, 36, 34, 34, 34, 34, 39, 39, 39, 39,
        36, 36, 36, 36, 36, 36, 36, 36, 41, 41, 41, 43, 44, 44, 44, 44,

        48, 48, 48, 48, 48, 48, 48, 48, 46, 46, 46, 46, 43, 43, 43, 43,
        41, 41, 41, 41, 41, 41, 41, 41, 39, 39, 39, 39, 39, 39, 39, 39,
        36, 36, 36, 36, 36, 36, 36, 36, 34, 34, 34, 34, 39, 39, 39, 39,
        32, 0, 32, 0, 32, 32, 32, 0, 34, 0, 34, 0, 39, 39, 39, 39
      ],
      chords: [
        [48, 51, 55], null, null, null, null, null, null, null, [46, 50, 53], null, null, null, [51, 55, 58], null, null, null,
        [48, 51, 55], null, null, null, null, null, null, null, [46, 50, 53], null, null, null, [44, 48, 51], null, null, null,
        [48, 51, 55], null, null, null, null, null, null, null, [46, 50, 53], null, null, null, [51, 55, 58], null, null, null,
        [48, 51, 55], null, null, null, null, null, null, null, [53, 56, 60], null, null, null, [56, 60, 63], null, null, null,

        [60, 63, 67], null, null, null, null, null, null, null, [58, 62, 65], null, null, null, [55, 58, 62], null, null, null,
        [53, 56, 60], null, null, null, null, null, null, null, [51, 55, 58], null, null, null, null, null, null, null,
        [48, 51, 55], null, null, null, null, null, null, null, [46, 50, 53], null, null, null, [51, 55, 58], null, null, null,
        [44, 48, 51], null, null, null, null, null, null, null, [46, 50, 53], null, null, null, [51, 55, 58], null, null, null
      ],
      arp: [
        60, 0, 67, 0, 60, 0, 67, 0, 58, 0, 65, 0, 63, 0, 70, 0,
        60, 0, 67, 0, 60, 72, 67, 0, 58, 0, 65, 0, 56, 0, 63, 0,
        60, 0, 67, 0, 60, 0, 67, 0, 58, 0, 65, 0, 63, 0, 70, 0,
        60, 0, 67, 0, 60, 72, 67, 0, 65, 0, 72, 0, 68, 0, 75, 0,

        72, 75, 79, 72, 75, 79, 72, 75, 70, 74, 77, 70, 67, 70, 74, 67,
        65, 68, 72, 65, 68, 72, 65, 68, 63, 67, 70, 63, 63, 67, 70, 63,
        60, 0, 67, 0, 60, 0, 67, 0, 58, 0, 65, 0, 63, 0, 70, 0,
        56, 60, 63, 68, 0, 0, 0, 0, 58, 62, 65, 70, 0, 0, 0, 0
      ],
      lead: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        72, 0, 0, 0, 75, 0, 0, 0, 70, 0, 0, 0, 74, 0, 0, 0,
        72, 0, 0, 0, 79, 0, 0, 0, 77, 0, 75, 0, 72, 0, 70, 0,

        84, 0, 0, 0, 84, 0, 0, 0, 82, 0, 0, 0, 79, 0, 0, 0,
        77, 0, 0, 0, 77, 0, 0, 0, 75, 0, 0, 0, 75, 0, 0, 0,
        72, 0, 0, 0, 75, 0, 0, 0, 70, 0, 0, 0, 74, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 79, 84, 75, 0
      ],
      drums: [
        1, 0, 3, 0, 2, 0, 3, 3, 1, 0, 3, 0, 2, 0, 3, 0,
        1, 0, 3, 0, 2, 0, 3, 3, 1, 1, 3, 0, 2, 0, 3, 0,
        1, 0, 3, 0, 2, 0, 3, 3, 1, 0, 3, 0, 2, 0, 3, 0,
        1, 0, 3, 0, 2, 0, 3, 3, 1, 1, 3, 0, 2, 2, 3, 0,

        1, 0, 3, 1, 2, 0, 3, 1, 1, 0, 3, 1, 2, 0, 3, 1,
        1, 0, 3, 0, 2, 0, 3, 0, 1, 1, 3, 0, 2, 2, 3, 0,
        1, 0, 3, 0, 2, 0, 3, 3, 1, 0, 3, 0, 2, 0, 3, 0,
        1, 1, 1, 1, 2, 2, 2, 2, 1, 2, 1, 2, 3, 3, 3, 3
      ],
      speed: 1,
    }
  },

  init(audioCtx) {
    this.ctx = audioCtx;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.05;
    this.masterGain.connect(this.ctx.destination);
  },

  midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); },

  playSynth(freq, time, dur, type, vol, filterFreq) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = type;
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq || 2000, time);
    filter.frequency.exponentialRampToValueAtTime(100, time + dur * 0.8);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + dur * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, time + dur * 0.9);

    osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    osc.start(time); osc.stop(time + dur);
  },

  playDrum(type, time) {
    if (!this.ctx) return;
    const gain = this.ctx.createGain();
    if (type === 1) { // Kick
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, time);
      osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.1);
      gain.gain.setValueAtTime(1.5, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
      osc.connect(gain); gain.connect(this.masterGain);
      osc.start(time); osc.stop(time + 0.1);
    } else if (type === 2 || type === 3) { // Snare / Hihat
      const bufferSize = this.ctx.sampleRate * (type === 2 ? 0.1 : 0.05);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type === 2 ? 'bandpass' : 'highpass';
      filter.frequency.value = type === 2 ? 1000 : 7000;
      gain.gain.setValueAtTime(type === 2 ? 1.0 : 0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + (type === 2 ? 0.1 : 0.05));
      noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
      noise.start(time);
    }
  },

  nextNote() {
    const secondsPerBeat = 60.0 / this.bpm;
    const track = this.tracks[this.currentTrack];
    this.nextNoteTime += 0.25 * secondsPerBeat * (2 / track.speed);
    this.step++;
    const maxSteps = track.bass.length || 16;
    if (this.step >= maxSteps) { this.step = 0; }
  },

  scheduleNote(step, time) {
    if (!this.active || !this.ctx) return;
    const track = this.tracks[this.currentTrack];
    const dur = 60.0 / this.bpm * 0.25 * (2 / track.speed);

    if (track.bass[step]) this.playSynth(this.midiToFreq(track.bass[step]), time, dur * 1.5, 'sawtooth', 0.6, 600);
    if (track.arp[step]) this.playSynth(this.midiToFreq(track.arp[step] + 12), time, dur * 0.8, 'square', 0.15, 2000);
    if (track.lead && track.lead[step]) this.playSynth(this.midiToFreq(track.lead[step]), time, dur * 2.0, 'sawtooth', 0.2, 4000);
    if (track.chords[step]) {
      for (let note of track.chords[step]) this.playSynth(this.midiToFreq(note), time, dur * 4, 'triangle', 0.25, 1000);
    }
    if (track.drums && track.drums[step]) this.playDrum(track.drums[step], time);
  },

  tick() {
    if (!this.active || !this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.step, this.nextNoteTime);
      this.nextNote();
    }
    this.timer = setTimeout(() => this.tick(), this.lookahead);
  },

  updateState() {
    // Dynamic pace disabled as per user request
  },

  stinger(type) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (type === 'win') {
      this.playSynth(this.midiToFreq(60), now, 0.2, 'square', 0.5, 3000);
      this.playSynth(this.midiToFreq(64), now + 0.2, 0.2, 'square', 0.5, 3000);
      this.playSynth(this.midiToFreq(67), now + 0.4, 0.8, 'square', 0.5, 3000);
    } else if (type === 'loss') {
      this.playSynth(this.midiToFreq(48), now, 0.4, 'sawtooth', 0.6, 1000);
      this.playSynth(this.midiToFreq(47), now + 0.4, 0.4, 'sawtooth', 0.6, 1000);
      this.playSynth(this.midiToFreq(45), now + 0.8, 1.2, 'sawtooth', 0.6, 1000);
    }
  },

  start(trackId) {
    if (this.timer) clearTimeout(this.timer);
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.currentTrack = trackId || 'menu';
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.active = true;
    this.tick();
  },

  stop() {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
  },

  deathJingle() {
    if (!this.ctx) return;
    // Stop looping BGM and fade master out quickly
    this.stop();
    const t0 = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t0);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t0);
    this.masterGain.gain.linearRampToValueAtTime(0.0001, t0 + 0.18);

    // Jingle goes through its own gain node (bypasses the faded master)
    const jGain = this.ctx.createGain();
    jGain.gain.setValueAtTime(0.09, t0);
    jGain.connect(this.ctx.destination);

    const note = (midi, start, dur, type, vol) => {
      const osc = this.ctx.createOscillator();
      const gn = this.ctx.createGain();
      const filt = this.ctx.createBiquadFilter();
      osc.type = type;
      osc.frequency.value = this.midiToFreq(midi);
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(1400, start);
      filt.frequency.exponentialRampToValueAtTime(180, start + dur * 0.85);
      gn.gain.setValueAtTime(0, start);
      gn.gain.linearRampToValueAtTime(vol, start + 0.04);
      gn.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(filt); filt.connect(gn); gn.connect(jGain);
      osc.start(start); osc.stop(start + dur + 0.05);
    };

    // Sad descending phrase in A minor
    const s = t0 + 0.22;
    note(76, s, 0.35, 'triangle', 1.0); // E5
    note(72, s + 0.40, 0.35, 'triangle', 0.9); // C5
    note(69, s + 0.80, 0.50, 'triangle', 0.9); // A4
    note(64, s + 1.35, 0.45, 'triangle', 0.8); // E4
    // Final A minor chord — low and heavy
    note(45, s + 1.90, 2.40, 'sawtooth', 0.9); // A2 bass
    note(48, s + 1.95, 2.10, 'triangle', 0.5); // C3
    note(52, s + 1.95, 1.90, 'triangle', 0.4); // E3
    note(57, s + 1.95, 1.70, 'sine', 0.3); // A3 top

    // Restore master gain for next game
    setTimeout(() => {
      if (this.masterGain) this.masterGain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    }, 5500);
  }
};

function mkUnit(id, team, x, y, faceDx, etype) {
  const color = etype ? etype.color : (team === 0 ? P1_COLOR : P2_COLOR);
  const maxHp = etype ? etype.hp : MAX_HP;
  const scale = etype ? etype.scale : 1.0;
  const utype = etype ? etype.type : (team === 0 ? 'player' : 'grunt');
  return {
    id, team, x, y,
    px: x, py: y,
    rx: x, ry: y,
    hp: maxHp, maxHp,
    ammo: MAX_AMMO, maxAmmo: MAX_AMMO,
    ammoTick: 0,
    laserAmmo: MAX_LASER, laserTick: 0,
    heavyAmmo: MAX_HEAVY, heavyTick: 0,
    shotgunAmmo: MAX_SHOTGUN, shotgunTick: 0, weapon: 'bullet',
    facing: { dx: faceDx, dy: 0 },
    aimDir: { dx: faceDx, dy: 0 },
    alive: true, color, scale, utype,
    hitFlash: 0, deathT: 1.0, shootFlash: 0,
  };
}

// Applies armor floor buff to incoming hero damage (minimum 1)
function heroDmg(raw) { return Math.max(1, raw - (S.floorBuffs?.armor || 0)); }

function isAdjacentToEnemy(unit) {
  if (!unit || !unit.alive) return false;
  return S.units.some(u => {
    if (!u.alive || u.team === unit.team) return false;
    if (Math.abs(u.x - unit.x) <= 1 && Math.abs(u.y - unit.y) <= 1) return true;
    if (u.utype === 'worm' && u.trail) {
      return u.trail.some(t => Math.abs(t.x - unit.x) <= 1 && Math.abs(t.y - unit.y) <= 1);
    }
    return false;
  });
}

function getCurrentWeapon(unit) {
  if (!unit) return 'bullet';
  if (isAdjacentToEnemy(unit)) return 'melee';
  return unit.weapon || 'bullet';
}

function mkBullet(owner, x, y, px, py, dx, dy, color, power, maxRange) {
  power = power || 1;
  return {
    id: Math.random(), owner, x, y, px, py,
    rx: px, ry: py, dx, dy, color,
    active: true, newThisTick: true, age: 0,
    power, pierceLeft: power >= 2 ? 1 : 0,
    maxRange: maxRange || 0, cellsTraveled: 0,
  };
}

function initState() {
  COLS = BASE_COLS;
  ROWS = BASE_ROWS;
  const rows = [1, 7, 13];
  S = {
    phase: 'frozen', tick: 0,
    pending: [null, null],
    units: [
      mkUnit(0, 0, 1, rows[0], 1),
      mkUnit(1, 0, 1, rows[1], 1),
      mkUnit(2, 0, 1, rows[2], 1),
      mkUnit(3, 1, COLS - 2, rows[0], -1),
      mkUnit(4, 1, COLS - 2, rows[1], -1),
      mkUnit(5, 1, COLS - 2, rows[2], -1),
    ],
    selectedId: [0, 3],
    bullets: [], lasers: [], particles: [], dmgNumbers: [], meleeStrikes: [],
    shake: 0, animT: 1,
    winner: null, pendingGameover: false,
    clock: [120000, 120000], timeForfeited: -1, clockSide: 0,
  };
  stats = { ticks: 0, shots: [0, 0], hits: [0, 0] };
}

function isWall(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
  if (gameMode === 'adventure' && S.dungeon) {
    const t = S.dungeon[y][x];
    if (t === 0 || t === 2) return true; // wall or pillar
    // Check for moving platforms (solid obstacles)
    if (S.platforms && S.platforms.some(p => Math.round(p.lx) === x && Math.round(p.ly) === y)) return true;
  }
  return false;
}

// ── Hub Room Mode ────────────────────────────────────────────────
function initHubRoom() {
  S.isHubRoom = true;
  S.gridW = 1; S.gridH = 1;
  ADV_MAP_COLS = 13; ADV_MAP_ROWS = 12;
  COLS = ADV_MAP_COLS; ROWS = ADV_MAP_ROWS;

  S.dungeon = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  S.rooms = [{ x: 1, y: 1, w: 11, h: 10, type: 'start' }];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      S.dungeon[r][c] = 1; // 1 = floor
    }
  }

  // No regular objects
  S.shrines = []; S.bloodStains = []; S.chests = []; S.loot = []; S.platforms = []; S.exit = null;
  S.fog = Array.from({ length: ROWS }, () => new Array(COLS).fill(false)); // Fully revealed
  S.fogReveal = Array.from({ length: ROWS }, () => new Array(COLS).fill(1)); // All is known
  S.lightGhosts = [];
  S.cam = { x: 0, y: 0, tx: 0, ty: 0 };

  // Apply Hub Upgrades to Hero (cosmetic, mostly for HP display)
  const bonusEnergy = Profile.upgrades?.maxEnergy || 0;
  S.energy = ENERGY_MAX + bonusEnergy;
  const bonusArmor = Profile.upgrades?.armor || 0;
  const heroHp = MAX_HP + bonusArmor;

  S.units = [mkUnit(0, 0, 6, 8, 1)];
  S.units[0].hp = heroHp; S.units[0].maxHp = heroHp;
  S.selectedId = [0, 3];

  S.phase = 'frozen'; S.tick = 0;
  S.pending = [null, null];
  S.bullets = []; S.lasers = []; S.particles = []; S.dmgNumbers = []; S.meleeStrikes = [];
  S.shake = 0; S.animT = 1;
  S.winner = null; S.pendingGameover = false;
  S.clock = [120000, 120000]; S.timeForfeited = -1; S.clockSide = 0;

  // Set up the Hub Terminals (interactive interactables)
  S.terminals = [
    { x: 4, y: 3, type: 'upgrades', color: '#00ffaa', label: 'UPGRADES' },
    { x: 8, y: 3, type: 'missions', color: '#ffaa00', label: 'MISSIONS' }
  ];

  stats = { ticks: 0, shots: [0, 0], hits: [0, 0] };

  // Snap camera
  S.cam.x = 0; S.cam.tx = 0;
  S.cam.y = 0; S.cam.ty = 0;
}

// ── Adventure mode ────────────────────────────────────────────────
function initAdventure() {
  S.isHubRoom = false;
  S.terminals = [];
  S.floor = S.floor || 1;

  // Graduali progresavimo seka
  const floorProgression = [
    { w: 1, h: 1 }, // Floor 1: 1 room
    { w: 1, h: 1 }, // Floor 2: 1 room
    { w: 2, h: 1 }, // Floor 3: 2 rooms
    { w: 3, h: 1 }, // Floor 4: 3 rooms
    { w: 2, h: 2 }, // Floor 5: 4 rooms
    { w: 3, h: 2 }, // Floor 6: 6 rooms
    { w: 3, h: 3 }, // Floor 7: 9 rooms
    { w: 4, h: 3 }, // Floor 8: 12 rooms
    { w: 4, h: 4 }, // Floor 9: 16 rooms
  ];

  const configIdx = Math.min(S.floor - 1, floorProgression.length - 1);
  S.gridW = floorProgression[configIdx].w;
  S.gridH = floorProgression[configIdx].h;

  ADV_MAP_COLS = 13 * S.gridW + 2;
  ADV_MAP_ROWS = 11 * S.gridH + 2;
  // Early floors are smaller: floor1 = -4, floor2 = -2, floor3+ = 0
  const mapShrink = Math.max(0, (3 - S.floor) * 2);
  ADV_MAP_COLS -= mapShrink;
  ADV_MAP_ROWS -= mapShrink;
  COLS = ADV_MAP_COLS;
  ROWS = ADV_MAP_ROWS;

  // Must be initialized BEFORE generateDungeon() which pushes into these arrays
  S.shrines = [];
  S.bloodStains = [];
  S.chests = [];
  generateDungeon();
  S.fog = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  S.fogReveal = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  S.lightGhosts = [];
  S.cam = { x: 0, y: 0, tx: 0, ty: 0 };
  if (S.floor === 1) S.energy = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);  // reset on fresh run, include upgrade bonus
  S.energyDepleted = false;
  S.phase = 'frozen'; S.tick = 0;
  S.pending = [null, null];
  S.bullets = []; S.lasers = []; S.particles = []; S.dmgNumbers = []; S.meleeStrikes = [];
  S.shake = 0; S.animT = 1;
  S.winner = null; S.pendingGameover = false;
  S.clock = [120000, 120000]; S.timeForfeited = -1; S.clockSide = 0;
  S.loot = [];
  S.inGameUpgradeLevel = 0;
  // Global inventory — always load from Profile, derive counters from slots
  S.inventory = (Array.isArray(Profile.inventory) && Profile.inventory.length > 0)
    ? Profile.inventory.map(x => x ? { ...x } : null)
    : new Array(INV_SLOTS).fill(null);
  { const _b = S.inventory.find(s => s && s.type === 'byte'); S.bytes = _b ? _b.qty : 0; }
  { const _f = S.inventory.find(s => s && s.type === 'fragment'); S.fragments = _f ? _f.qty : 0; }
  { const _x = S.inventory.find(s => s && s.type === 'xptoken'); S.xpTokens = _x ? _x.qty : 0; }
  S.kills = 0;
  S.explorerChestSpawned = false;
  S.fullMapRevealed = false;
  S.floorBuffs = { melee: 0, armor: 0, chipMul: 1 };
  S.pendingSlotPrize = null;
  S.footsteps = [];
  if (S.floor === 1) S.nanoSteps = 0;

  // Player units in start room
  const sr = S.rooms[0];
  const px = sr.x + 1, py = sr.y + 1;
  S.units = [
    mkUnit(0, 0, px, py, 1),
  ];
  S.selectedId = [0, 3];

  // Enemies dynamic distribution
  let eid = 3;
  const numRooms = S.rooms.length;

  const poolByRoom = (ri) => {
    if (ri === 0) return [ENEMY_TYPES[1]]; // Leaks only
    if (ri === numRooms - 1 && numRooms > 1) return [ENEMY_TYPES[3], ENEMY_TYPES[4], ENEMY_TYPES[2]]; // Boss room
    if (ri < numRooms / 2) return [ENEMY_TYPES[0], ENEMY_TYPES[1]];
    return [ENEMY_TYPES[1], ENEMY_TYPES[2], ENEMY_TYPES[4]]; // Mid-Late
  };

  S.rooms.forEach((r, ri) => {
    let count = 4; // Pagal nutylėjimą kiekviename kambaryje 4 priešai

    if (S.floor === 1) {
      count = 3;
    } else if (S.floor === 2) {
      count = 4;
    } else {
      // Nuo 3 lygio papildomai po truputį padidiname priešų skaičių kiekviename kambaryje
      count = 4 + Math.floor(Math.random() * Math.min(S.floor - 2, 2));
    }

    const pool = poolByRoom(ri);
    const pick = () => pool[Math.floor(Math.random() * pool.length)];

    for (let i = 0; i < count; i++) {
      let ex, ey, attempts = 0;
      do {
        ex = r.x + 1 + Math.floor(Math.random() * (r.w - 2));
        ey = r.y + 1 + Math.floor(Math.random() * (r.h - 2));
        attempts++;
      } while (
        attempts < 15 &&
        (isWall(ex, ey) || S.units.some(u => u.x === ex && u.y === ey))
      );
      S.units.push(mkUnit(eid++, 1, ex, ey, -1, pick()));
    }
  });
  S.totalEnemies = S.units.filter(u => u.team === 1).length;

  // Chests scaling
  const targetChests = S.floor <= 2 ? 0 : Math.min(8, 2 + Math.floor(S.floor / 3));
  for (let c = 0; c < targetChests; c++) {
    const ri = Math.max(1, Math.floor(Math.random() * numRooms));
    const r = S.rooms[ri];
    S.chests.push({ x: r.x + 1 + Math.floor(Math.random() * (r.w - 2)), y: r.y + 1 + Math.floor(Math.random() * (r.h - 2)), opened: false });
  }

  // Exit portal in last room (top-right corner)
  const er = S.rooms[numRooms - 1];
  S.exit = { x: er.x + er.w - 2, y: er.y + 1, used: false };

  // Reveal starting area
  S.units.filter(u => u.team === 0).forEach(u => revealFog(u.x, u.y));
  stats = { ticks: 0, shots: [0, 0], hits: [0, 0] };

  // Snap camera
  const hero0 = S.units.find(u => u.team === 0);
  if (hero0) {
    const hx0 = hero0.x * CELL + CELL * 0.5;
    const hy0 = hero0.y * CELL + CELL * 0.5;
    let snapX = Math.max(0, Math.min(ADV_MAP_COLS * CELL - ADV_COLS * CELL, hx0 - ADV_COLS * CELL * 0.5));
    let snapY = Math.max(0, Math.min(ADV_MAP_ROWS * CELL - ADV_CANVAS_H, hy0 - ADV_CANVAS_H * 0.5));
    // Jei lygio dydis mažesnis už ekrano matomumą, centruojame jį ekrano viduryje
    if (ADV_MAP_COLS * CELL < ADV_COLS * CELL) snapX = -(ADV_COLS * CELL - ADV_MAP_COLS * CELL) / 2;
    if (ADV_MAP_ROWS * CELL < ADV_CANVAS_H) snapY = -(ADV_CANVAS_H - ADV_MAP_ROWS * CELL) / 2;
    S.cam.x = Math.round(snapX); S.cam.tx = S.cam.x;
    S.cam.y = Math.round(snapY); S.cam.ty = S.cam.y;
  }

  // Platforms
  S.platforms = [];
  if (S.floor > 1) {
    const platCount = Math.min(6, 1 + Math.floor(S.floor / 2));
    for (let i = 0; i < platCount; i++) {
      const r = S.rooms[Math.floor(Math.random() * (numRooms - 1)) + 1];
      const px = r.x + 2 + Math.floor(Math.random() * (r.w - 4));
      const py = r.y + 2 + Math.floor(Math.random() * (r.h - 4));
      const isVert = Math.random() < 0.5;
      S.platforms.push({
        x: px, y: py, lx: px, ly: py, px: px, py: py,
        x1: px, y1: py, x2: px + (isVert ? 0 : 3), y2: py + (isVert ? 3 : 0),
        dir: 1, speed: 0.1
      });
    }
  }
}

function generateDungeon() {
  S.dungeon = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  S.rooms = [];

  const gw = S.gridW;
  const gh = S.gridH;
  const totalRooms = gw * gh;

  const cw = Math.floor((COLS - gw) / gw);
  const ch = Math.floor((ROWS - gh) / gh);

  const colsX = [];
  let cx = 1;
  for (let i = 0; i < gw; i++) { colsX.push(cx); cx += cw + 1; }
  const rowsY = [];
  let ry = 1;
  for (let i = 0; i < gh; i++) { rowsY.push(ry); ry += ch + 1; }

  const sectors = [];
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const sx = colsX[x];
      const sy = rowsY[y];
      const sw = (x === gw - 1) ? Math.max(cw, COLS - sx - 1) : cw;
      const sh = (y === gh - 1) ? Math.max(ch, ROWS - sy - 1) : ch;
      sectors.push({ x0: sx, y0: sy, sw, sh });
    }
  }

  // Stamp rooms
  sectors.forEach((s) => {
    let w = Math.max(4, s.sw - 2);
    let h = Math.max(3, s.sh - 2);

    // Jeigu sektorius per didelis (pvz 1 lygyje gaunasi belekokio ilgio),
    // apribojame iki normalaus "kambario" dydžio
    if (w > 13) w = 8 + Math.floor(Math.random() * 4); // nuo 8 iki 11
    if (h > 10) h = 6 + Math.floor(Math.random() * 4); // nuo 6 iki 9

    // Išcentruojame kambarius atitinkamai sektoriui,
    // kad kaimyninių kambarių sienos ir horizontalios ašys sutaptų koridoriams.
    const x = s.x0 + Math.floor((s.sw - w) / 2);
    const y = s.y0 + Math.floor((s.sh - h) / 2);

    for (let j = y; j < y + h && j < ROWS; j++) {
      for (let i = x; i < x + w && i < COLS; i++) {
        S.dungeon[j][i] = 1;
      }
    }
    S.rooms.push({ x, y, w, h });
  });

  // Calculate adjacency spanning tree
  const gridAdj = {};
  for (let i = 0; i < totalRooms; i++) gridAdj[i] = [];
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const idx = y * gw + x;
      if (x > 0) gridAdj[idx].push(idx - 1);
      if (x < gw - 1) gridAdj[idx].push(idx + 1);
      if (y > 0) gridAdj[idx].push(idx - gw);
      if (y < gh - 1) gridAdj[idx].push(idx + gw);
    }
  }

  const visited = new Set([0]);
  const treeEdges = [];
  while (visited.size < totalRooms) {
    const frontier = [];
    for (const v of visited) {
      for (const n of gridAdj[v]) {
        if (!visited.has(n)) frontier.push([v, n]);
      }
    }
    const pick = frontier[Math.floor(Math.random() * frontier.length)];
    treeEdges.push(pick);
    visited.add(pick[1]);
  }

  const degree = new Array(totalRooms).fill(0);
  treeEdges.forEach(([a, b]) => { degree[a]++; degree[b]++; });

  treeEdges.forEach(([a, b]) => {
    connectRooms(S.rooms[a], S.rooms[b], 1);
  });

  // Add 1-2 random loops for floors > 1 to increase path options
  if (S.floor > 1 && totalRooms > 3) {
    const allAdj = [];
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const idx = y * gw + x;
        if (x < gw - 1) allAdj.push([idx, idx + 1]);
        if (y < gh - 1) allAdj.push([idx, idx + gw]);
      }
    }
    const treeSet = new Set(treeEdges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
    const nonTree = allAdj.filter(([a, b]) => !treeSet.has(`${Math.min(a, b)}-${Math.max(a, b)}`) && degree[a] >= 1 && degree[b] >= 1);
    nonTree.sort(() => Math.random() - 0.5).slice(0, Math.floor(S.floor / 2) + 1).forEach(([a, b]) => {
      connectRooms(S.rooms[a], S.rooms[b], 1);
    });
  }

  // ── Room types ─────────────────────────────────────────────────
  S.rooms[0].type = 'start';
  S.rooms[totalRooms - 1].type = 'boss';
  const typePool = ['shrine', 'armory', 'vault', 'normal', 'normal', 'normal', 'normal'];
  for (let i = 1; i < totalRooms - 1; i++) {
    S.rooms[i].type = typePool[Math.floor(Math.random() * typePool.length)];
    S.rooms[i].armoryUsed = false;
  }

  // Shrine objects — placed in quarter of shrine rooms
  S.rooms.forEach((r, ri) => {
    if (r.type !== 'shrine') return;
    const sx = r.x + Math.floor(r.w * 0.3);
    const sy = r.y + Math.floor(r.h * 0.3);
    S.shrines.push({ x: sx, y: sy, used: false });
  });

  // Vault rooms get an extra chest
  S.rooms.forEach((r, ri) => {
    if (r.type !== 'vault') return;
    const cx = Math.floor(r.x + r.w * 0.65), cy = Math.floor(r.y + r.h * 0.65);
    if (!S.chests) S.chests = [];
    S.chests.push({ x: cx, y: cy, opened: false });
  });

  // ── Pillars (tile 2) — placed after corridors so carveCorr can't block them
  S.rooms.forEach((r, ri) => {
    if (ri === 0) return; // never in start room
    if (r.w < 5 || r.h < 4) return; // too small

    // Try to place a group of pillars; returns true if all cells were free and placed
    const placeGroup = (px, py, shape) => {
      const cells = shape === 'single' ? [[0, 0]]
        : shape === 'pairH' ? [[0, 0], [1, 0]]
          : shape === 'pairV' ? [[0, 0], [0, 1]]
            : [[0, 0], [1, 0], [0, 1], [1, 1]]; // quad 2×2
      const ok = cells.every(([ox, oy]) => {
        const nx = px + ox, ny = py + oy;
        return nx > r.x && nx < r.x + r.w - 1 && ny > r.y && ny < r.y + r.h - 1
          && S.dungeon[ny][nx] === 1;
      });
      if (ok) cells.forEach(([ox, oy]) => { S.dungeon[py + oy][px + ox] = 2; });
      return ok;
    };

    // Shapes weighted toward groups: fewer singles, more pairs/quads
    const shapes = ['pairH', 'pairH', 'pairV', 'pairV', 'quad', 'quad', 'single'];
    const groupCount = 3 + Math.floor(Math.random() * 4); // 3–6 groups per room
    for (let g = 0; g < groupCount; g++) {
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      for (let t = 0; t < 12; t++) { // up to 12 placement attempts
        const px = r.x + 1 + Math.floor(Math.random() * Math.max(1, r.w - 3));
        const py = r.y + 1 + Math.floor(Math.random() * Math.max(1, r.h - 3));
        if (placeGroup(px, py, shape)) break;
      }
    }
  });
}

function carveCorr(x1, y1, x2, y2, width = 1) {
  const set = (x, y) => { if (y >= 0 && y < ROWS && x >= 0 && x < COLS) S.dungeon[y][x] = 1; };
  let x = x1, y = y1;
  while (x !== x2) {
    for (let w = 0; w < width; w++) set(x, y + w);
    x += Math.sign(x2 - x);
  }
  while (y !== y2) {
    for (let w = 0; w < width; w++) set(x + w, y);
    y += Math.sign(y2 - y);
  }
  for (let w = 0; w < width; w++) set(x + w, y);
}

// Connect two rooms with a straight 1-cell-wide corridor.
// Rooms are at fixed positions so corridors are exactly 2 cells long.
function connectRooms(ra, rb, width) {
  const left = ra.x <= rb.x ? ra : rb;
  const right = ra.x <= rb.x ? rb : ra;
  const top = ra.y <= rb.y ? ra : rb;
  const bot = ra.y <= rb.y ? rb : ra;

  if (Math.abs(ra.x - rb.x) >= Math.abs(ra.y - rb.y)) {
    // Horizontal neighbors — pick a random y inside the overlap
    const yMin = Math.max(left.y, right.y);
    const yMax = Math.min(left.y + left.h - 1, right.y + right.h - 1);
    const dy = yMin + Math.floor(Math.random() * Math.max(1, yMax - yMin + 1));
    for (let cx = left.x + left.w; cx < right.x; cx++)
      if (cx >= 0 && cx < COLS && dy >= 0 && dy < ROWS) S.dungeon[dy][cx] = 3; // tile 3 = corridor
  } else {
    // Vertical neighbors — pick a random x inside the overlap
    const xMin = Math.max(top.x, bot.x);
    const xMax = Math.min(top.x + top.w - 1, bot.x + bot.w - 1);
    const dx = xMin + Math.floor(Math.random() * Math.max(1, xMax - xMin + 1));
    for (let cy = top.y + top.h; cy < bot.y; cy++)
      if (dx >= 0 && dx < COLS && cy >= 0 && cy < ROWS) S.dungeon[cy][dx] = 3; // tile 3 = corridor
  }
}

function revealFog(cx, cy) {
  const now = performance.now();
  for (let dy = -FOG_RADIUS; dy <= FOG_RADIUS; dy++)
    for (let dx = -FOG_RADIUS; dx <= FOG_RADIUS; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;
      if (Math.hypot(dx, dy) <= FOG_RADIUS) {
        if (!S.fog[y][x] && S.fogReveal) S.fogReveal[y][x] = now; // record first-reveal time
        S.fog[y][x] = true;
      }
    }
  checkExplorationComplete();
}

// ── Chip Pixel Art ───────────────────────────────────────────────
const CHIP_ART = [
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0],
  [0, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 0],
  [1, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1, 1],
  [1, 2, 2, 3, 3, 4, 4, 3, 3, 2, 2, 1],
  [1, 2, 3, 3, 4, 5, 5, 4, 3, 3, 2, 1],
  [1, 2, 3, 3, 4, 5, 5, 4, 3, 3, 2, 1],
  [1, 2, 2, 3, 3, 4, 4, 3, 3, 2, 2, 1],
  [1, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1, 1],
  [0, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 0],
  [0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
];
const CHIP_CIRCUIT = [
  [3, 4], [3, 7], [4, 3], [4, 8], [7, 3], [7, 8], [8, 4], [8, 7], [5, 3], [5, 8], [6, 3], [6, 8],
];

// Per-rarity color palettes  [null, rim, body, mid, bright, glow]
const CHIP_PALETTES = {
  common: [null, '#1c1c1c', '#383838', '#585858', '#888888', '#cccccc'],
  uncommon: [null, '#002211', '#004433', '#006644', '#00aa66', '#44ff88'],
  rare: [null, '#00001f', '#000055', '#0033aa', '#2266ee', '#66aaff'],
  epic: [null, '#110011', '#330044', '#6600aa', '#aa33dd', '#ee55ff'],
  legendary: [null, '#1a0800', '#442200', '#886600', '#ddaa00', '#ffcc22'],
};

// ── Traditional vertical-scroll slot reel system ─────────────────
const REEL_TAPE = ['common', 'uncommon', 'rare', 'empty', 'epic', 'common', 'legendary', 'uncommon', 'rare', 'common'];
const CHIP_SLOT_H = 100;  // px per chip slot on the reel tape
const REEL_TAPE_LEN = REEL_TAPE.length * CHIP_SLOT_H; // 500 px full loop
const REEL_VISIBLE = 3;    // chips visible at once
const REEL_H = CHIP_SLOT_H * REEL_VISIBLE; // 300 px canvas height
const REEL_W = 108;
const CHIP_PX = 8;    // pixels per art pixel  (12*8=96)
const CHIP_ART_SIZE = CHIP_ART.length * CHIP_PX;  // 96

// Per-reel animation state
const reelState = [0, 1, 2, 3].map(i => ({
  offset: i * CHIP_SLOT_H * 1.5, // staggered so reels look different
  speed: 0,
  stopping: false,
  locked: false,
  startOffset: 0,
  targetOffset: 0,
  stopStartTime: 0,
  stopDuration: 850,
  stopTime: -1,
}));
let slotAnimActive = false;
let slotSpinInterval = null;
const winSpin = { active: false, angle: 0, mask: new Set() }; // 3D win spin state

function drawChipFlat(ctx, x, y, rarity, glowing) {
  if (rarity === 'empty') {
    const s = CHIP_ART_SIZE;
    ctx.save();
    ctx.globalAlpha = glowing ? 1 : 0.55;
    ctx.fillStyle = '#07070f';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = glowing ? '#ff3c55' : '#33333d';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 5, y + 5, s - 10, s - 10);
    if (glowing) { ctx.shadowColor = '#ff3c55'; ctx.shadowBlur = 14; }
    ctx.strokeStyle = glowing ? '#ff3c55' : '#555566';
    ctx.lineWidth = glowing ? 7 : 4;
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 20); ctx.lineTo(x + s - 20, y + s - 20);
    ctx.moveTo(x + s - 20, y + 20); ctx.lineTo(x + 20, y + s - 20);
    ctx.stroke();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
    return;
  }
  const pal = CHIP_PALETTES[rarity] || CHIP_PALETTES.common;
  const rows = CHIP_ART.length, cols = CHIP_ART[0].length;
  const px = CHIP_PX;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = CHIP_ART[r][c];
      if (!v) continue;
      ctx.fillStyle = pal[v];
      ctx.fillRect(x + c * px, y + r * px, px, px);
    }
  }
  // Circuit dots
  const dotCol = glowing ? pal[5] : pal[4];
  if (glowing) { ctx.shadowColor = pal[5]; ctx.shadowBlur = 8; }
  ctx.fillStyle = dotCol;
  CHIP_CIRCUIT.forEach(([r, c]) => {
    ctx.fillRect(x + c * px + 1, y + r * px + 1, px - 2, px - 2);
  });
  ctx.shadowBlur = 0;
  // Pulsing center glow when locked/highlighted
  if (glowing) {
    const pulse = (Math.sin(performance.now() / 180) * 0.5 + 0.5) * 0.45;
    ctx.globalAlpha = pulse;
    ctx.shadowColor = pal[5]; ctx.shadowBlur = 18;
    ctx.fillStyle = pal[5];
    ctx.fillRect(x + 5 * px, y + 5 * px, px * 2, px * 2);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
}

function drawReel(ctx, reelIdx) {
  const st = reelState[reelIdx];
  const W = REEL_W, H = REEL_H;
  ctx.clearRect(0, 0, W, H);

  const offset = st.offset;
  const chipOffX = (W - CHIP_ART_SIZE) / 2; // center horizontally

  // First slot index that could be visible (one above to allow smooth entry)
  const firstSlot = Math.floor(offset / CHIP_SLOT_H) - 1;

  for (let slot = firstSlot; slot <= firstSlot + REEL_VISIBLE + 1; slot++) {
    const slotY = slot * CHIP_SLOT_H - offset;
    if (slotY > H + CHIP_SLOT_H || slotY < -CHIP_SLOT_H) continue;

    // Which rarity at this tape position
    const tapeIdx = ((slot % REEL_TAPE.length) + REEL_TAPE.length * 1000) % REEL_TAPE.length;
    const rarity = REEL_TAPE[tapeIdx];
    const chipY = slotY + (CHIP_SLOT_H - CHIP_ART_SIZE) / 2;

    // Is this chip in the center (payline) slot?
    const isCentre = slotY > CHIP_SLOT_H * 0.9 && slotY < CHIP_SLOT_H * 1.1;
    const glowing = st.locked && isCentre;

    // Clip to canvas
    const clipTop = Math.max(0, slotY);
    const clipBot = Math.min(H, slotY + CHIP_SLOT_H);
    if (clipBot <= clipTop) continue;

    const isWinner = st.locked && isCentre && winSpin.active && winSpin.mask.has(reelIdx);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipTop, W, clipBot - clipTop);
    ctx.clip();
    if (isWinner) {
      // Same 3D Y-axis spin as inventory hover (cosA scale trick)
      const cosA = Math.cos(winSpin.angle);
      const cx   = chipOffX + CHIP_ART_SIZE / 2;
      const cy   = chipY    + CHIP_ART_SIZE / 2;
      ctx.translate(cx, cy);
      ctx.scale(cosA, 1);
      ctx.translate(-cx, -cy);
      if (cosA >= 0) drawChipFlat(ctx, chipOffX, chipY, rarity, true);
      else           drawChipBack(ctx, chipOffX, chipY, rarity);
    } else {
      drawChipFlat(ctx, chipOffX, chipY, rarity, glowing);
    }
    ctx.restore();
  }

  // Fade top & bottom for reel-window illusion
  const fadeH = CHIP_SLOT_H * 0.55;
  const gTop = ctx.createLinearGradient(0, 0, 0, fadeH);
  gTop.addColorStop(0, '#000605'); gTop.addColorStop(1, 'rgba(0,6,5,0)');
  ctx.fillStyle = gTop; ctx.fillRect(0, 0, W, fadeH);

  const gBot = ctx.createLinearGradient(0, H - fadeH, 0, H);
  gBot.addColorStop(0, 'rgba(0,6,5,0)'); gBot.addColorStop(1, '#000605');
  ctx.fillStyle = gBot; ctx.fillRect(0, H - fadeH, W, fadeH);
}

function computeStopOffset(reelIdx, rarity) {
  const st = reelState[reelIdx];
  const ri = REEL_TAPE.indexOf(rarity);
  const tapeSize = REEL_TAPE.length;
  // Centre slot y = CHIP_SLOT_H (slot index 1 of 3)
  // chip at tapeSlot is centred when: tapeSlot * CHIP_SLOT_H - offset = CHIP_SLOT_H
  // → offset = (tapeSlot - 1) * CHIP_SLOT_H,  tapeSlot = ri + k*tapeSize
  // Find k so offset > currentOffset + 3 full tape rotations
  const minAdvance = st.offset + 3 * tapeSize * CHIP_SLOT_H;
  const base = (ri - 1) * CHIP_SLOT_H;
  const k = Math.ceil((minAdvance - base) / (tapeSize * CHIP_SLOT_H));
  return base + k * tapeSize * CHIP_SLOT_H;
}

function runSlotAnims() {
  if (!slotAnimActive) return;
  const now = performance.now();
  if (winSpin.active) winSpin.angle += 0.04; // advance 3D spin angle each frame
  for (let i = 0; i < 4; i++) {
    const canvas = document.getElementById(`sc-${i}`);
    if (!canvas) continue;
    const ctx = canvas.getContext('2d');
    const st = reelState[i];

    if (!st.locked) {
      if (st.stopping) {
        const t = Math.min(1, (now - st.stopStartTime) / st.stopDuration);
        // Cubic ease-out
        const eased = 1 - Math.pow(1 - t, 3);
        st.offset = st.startOffset + (st.targetOffset - st.startOffset) * eased;
        if (t >= 1) {
          st.offset = st.targetOffset;
          st.locked = true;
          st.stopTime = now;
          SFX.slotStop(i); // mechanical clunk on lock
        }
      } else {
        st.offset += st.speed;
      }
    }
    drawReel(ctx, i);
  }
  requestAnimationFrame(runSlotAnims);
}

// ── Slot Machine ─────────────────────────────────────────────────
let paytableBuilt = false;
function buildSlotPaytable() {
  const el = document.getElementById('slot-paytable');
  if (!el) return;
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const syms = { common: '○', uncommon: '◆', rare: '★', epic: '◈', legendary: '✦' };
  let h = '<div class="pt-title">— PAYTABLE —</div>';
  h += '<table class="pt-table"><tr><th></th>';
  for (const r of rarities)
    h += `<th style="color:${RARITY_COLOR[r]}">${syms[r]}</th>`;
  h += '</tr>';
  for (const n of [4, 3, 2]) {
    h += `<tr><td class="pt-count">${n}×</td>`;
    for (const r of rarities) {
      const p = COMBO_PRIZES[n]?.[r];
      h += `<td style="color:${p ? RARITY_COLOR[r] : '#1e1e2e'}">${p ? p.val : '·'}</td>`;
    }
    h += '</tr>';
  }
  h += '</table>';
  el.innerHTML = h;
}

function openChestSlot(ch) {
  if (!paytableBuilt) { buildSlotPaytable(); paytableBuilt = true; }
  const roll = () => REEL_TAPE[Math.floor(Math.random() * REEL_TAPE.length)];
  const r0 = roll(), r1 = roll(), r2 = roll(), r3 = roll();
  const prize = evaluateCombination([r0, r1, r2, r3]);
  S.pendingSlotPrize = { prize, ch };

  const ov = document.getElementById('slot-overlay');
  const res = document.getElementById('slot-result');
  const claimBtn = document.getElementById('slot-claim-btn');
  ov.classList.add('active');
  res.classList.remove('visible');
  claimBtn.disabled = true;

  // Reset all reels — spinning fast
  reelState.forEach((st, i) => {
    st.offset = i * CHIP_SLOT_H * 1.7; // stagger start
    st.speed = 14; // px per frame at ~60fps
    st.stopping = false;
    st.locked = false;
    st.stopTime = -1;
  });
  slotAnimActive = true;
  requestAnimationFrame(runSlotAnims);

  // Mute BGM — only slot sounds during spin
  BGM.stop();

  // Ratchet click ticker — fires while any reel is spinning
  if (slotSpinInterval) clearInterval(slotSpinInterval);
  slotSpinInterval = setInterval(() => {
    if (!slotAnimActive) { clearInterval(slotSpinInterval); slotSpinInterval = null; return; }
    const anySpinning = reelState.some(st => !st.locked);
    if (anySpinning) {
      SFX.slotClick();
    } else {
      clearInterval(slotSpinInterval);
      slotSpinInterval = null;
    }
  }, 55); // ~18 clicks/sec

  // Stop each reel at given delay, last one shows prize rarity
  const stopReel = (i, rarity, isLast, delay) => setTimeout(() => {
    const st = reelState[i];
    st.startOffset = st.offset;
    st.targetOffset = computeStopOffset(i, rarity);
    st.stopping = true;
    st.stopStartTime = performance.now();
    if (isLast) {
      const stopDelay = st.stopDuration + 120;
      setTimeout(() => {
        const col = RARITY_COLOR[prize.rarity];
        const badge = prize.rarity === 'empty' ? 'EMPTY'
          : `${prize.matchCount}× ${prize.rarity.toUpperCase()}`;
        document.getElementById('slot-rarity-badge').textContent = badge;
        document.getElementById('slot-rarity-badge').style.color = col;
        document.getElementById('slot-item-name').textContent = prize.name;
        document.getElementById('slot-item-name').style.color = col;
        document.getElementById('slot-panel').style.borderColor = col;
        document.getElementById('slot-panel').style.boxShadow = `0 0 50px ${col}66, inset 0 0 20px ${col}11`;
        res.classList.add('visible');
        SFX.slotWin(prize.rarity);
        if (winSpin.mask.size > 0) winSpin.active = true; // start 3D spin on winning chips
        setTimeout(() => { claimBtn.disabled = false; }, 280);
      }, stopDelay);
    }
  }, delay);

  // Build display reels that visually reflect the winning combination
  let displayReels;
  if (!prize || prize.rarity === 'empty' || !prize.matchCount) {
    // Empty/no-match — show raw rolls so player sees why they lost
    displayReels = [r0, r1, r2, r3];
  } else {
    const win = prize.rarity;
    const n = prize.matchCount; // how many reels show the winning rarity
    const others = ['common', 'uncommon', 'rare', 'epic', 'legendary'].filter(r => r !== win);
    const fills = [];
    for (let i = 0; i < n; i++) fills.push(win);           // winning symbols
    for (let i = n; i < 4; i++) fills.push(others[(i - n) % others.length]); // fillers
    // Shuffle so winning chips are spread naturally across reels
    for (let i = fills.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fills[i], fills[j]] = [fills[j], fills[i]];
    }
    displayReels = fills;
  }

  // Prepare win spin mask (activated only after last reel fully stops)
  winSpin.active = false;
  winSpin.angle  = 0;
  winSpin.mask.clear();
  if (prize.matchCount && prize.rarity !== 'empty') {
    displayReels.forEach((r, i) => { if (r === prize.rarity) winSpin.mask.add(i); });
  }

  stopReel(0, displayReels[0], false, 900);
  stopReel(1, displayReels[1], false, 1600);
  stopReel(2, displayReels[2], false, 2350);
  stopReel(3, displayReels[3], true,  3100);
}

window.claimSlotPrize = function () {
  if (!S.pendingSlotPrize) return;
  const { prize, ch } = S.pendingSlotPrize;
  S.pendingSlotPrize = null;

  if (prize.rarity === 'empty') {
    spawnDmgNumber(ch.x, ch.y, 'EMPTY', '#555566', 20, 'miss');
    logEvent('Chest was empty.', 'info');
  } else {
    const gain = prize.val;
    addToInventory('chip', prize.rarity, gain);
    spawnHit(ch.x, ch.y, RARITY_COLOR[prize.rarity], 22);
    spawnDmgNumber(ch.x, ch.y, `+${gain} CHIP`, RARITY_COLOR[prize.rarity], 24, 'crit');
    S.shake = Math.max(S.shake, 8);
    logEvent(`+${gain} CHIP — ${prize.rarity.toUpperCase()}`, prize.rarity);
  }

  updateInventoryUI();
  winSpin.active = false;
  winSpin.mask.clear();
  slotAnimActive = false;
  if (slotSpinInterval) { clearInterval(slotSpinInterval); slotSpinInterval = null; }
  const panel = document.getElementById('slot-panel');
  panel.style.borderColor = '';
  panel.style.boxShadow = '';
  document.getElementById('slot-overlay').classList.remove('active');
  // Resume game music after slot sounds finish
  setTimeout(() => BGM.start('game'), 600);
};

// ── Inventory ─────────────────────────────────────────────────────
const INV_SLOTS = 30;

// item: { type:'chip'|'fragment', rarity:'common'|...|null, qty:N }
function addToInventory(type, rarity, qty) {
  if (!S.inventory) S.inventory = new Array(INV_SLOTS).fill(null);
  const idx = S.inventory.findIndex(s => s && s.type === type && s.rarity === rarity);
  if (idx >= 0) { S.inventory[idx].qty += qty; }
  else {
    const empty = S.inventory.findIndex(s => s === null);
    if (empty >= 0) S.inventory[empty] = { type, rarity, qty };
  }
  // Persist ALL item types to global inventory
  if (gameMode === 'adventure') {
    Profile.inventory = S.inventory.map(x => x ? { ...x } : null);
    saveProfile();
  }
  // Note: callers (sync functions / chest code) handle UI refresh themselves
}

function syncFragmentSlot() {
  if (!S.inventory) return;
  const frags = S.fragments || 0;
  const idx = S.inventory.findIndex(s => s && s.type === 'fragment');
  if (frags <= 0) {
    if (idx >= 0) S.inventory[idx] = null;
  } else if (idx >= 0) {
    S.inventory[idx].qty = frags;
  } else {
    addToInventory('fragment', null, frags); // addToInventory saves internally
  }
  if (gameMode === 'adventure' && idx >= 0) {
    Profile.inventory = S.inventory.map(x => x ? { ...x } : null);
    saveProfile();
  }
  if (S.inventoryOpen) updateInventoryUI();
}

function syncByteSlot() {
  if (!S.inventory) return;
  const b = S.bytes || 0;
  const idx = S.inventory.findIndex(s => s && s.type === 'byte');
  if (b <= 0) {
    if (idx >= 0) S.inventory[idx] = null;
  } else if (idx >= 0) {
    S.inventory[idx].qty = b;
  } else {
    addToInventory('byte', null, b); // addToInventory saves internally
  }
  if (gameMode === 'adventure' && idx >= 0) {
    Profile.inventory = S.inventory.map(x => x ? { ...x } : null);
    saveProfile();
  }
  // Always update the visible byte counter button
  const btnEl = document.getElementById('inv-btn-chips');
  if (btnEl) btnEl.textContent = b + '⬡';
  // Full grid refresh only if panel is open
  if (S.inventoryOpen) updateInventoryUI();
}

function syncXpTokenSlot() {
  if (!S.inventory) return;
  const xp = S.xpTokens || 0;
  const idx = S.inventory.findIndex(s => s && s.type === 'xptoken');
  if (xp <= 0) {
    if (idx >= 0) S.inventory[idx] = null;
  } else if (idx >= 0) {
    S.inventory[idx].qty = xp;
  } else {
    addToInventory('xptoken', null, xp); // addToInventory saves internally
  }
  if (gameMode === 'adventure' && idx >= 0) {
    Profile.inventory = S.inventory.map(x => x ? { ...x } : null);
    saveProfile();
  }
  if (S.inventoryOpen) updateInventoryUI();
}

const INV_ITEM_NAMES = {
  byte: 'BYTE', fragment: 'CHIP FRAGMENT', xptoken: 'XP TOKEN',
  chip_common: 'COMMON CHIP', chip_uncommon: 'UNCOMMON CHIP',
  chip_rare: 'RARE CHIP', chip_epic: 'EPIC CHIP', chip_legendary: 'LEGENDARY CHIP',
};
const INV_ITEM_ICONS = {
  byte: '&#9711;', fragment: '&#9830;', xptoken: '&#9733;',
  chip_common: '&#11041;', chip_uncommon: '&#11041;', chip_rare: '&#11041;',
  chip_epic: '&#11041;', chip_legendary: '&#11041;',
};

function updateInventoryUI() {
  // Update fragment progress bar
  const frags = S.fragments || 0;
  const inProg = frags % FRAG_PER_CHIP;
  const pct = inProg / FRAG_PER_CHIP;
  const el = id => document.getElementById(id);
  if (el('inv-frags-prog')) el('inv-frags-prog').textContent = inProg;
  if (el('inv-frags-max')) el('inv-frags-max').textContent = FRAG_PER_CHIP;
  if (el('inv-frag-bar')) el('inv-frag-bar').style.width = (pct * 100) + '%';
  if (el('inv-floor')) el('inv-floor').textContent = S.floor || 1;

  // Button chip count
  if (el('inv-btn-chips')) el('inv-btn-chips').textContent = (S.bytes || 0) + '⬡';

  // Render slot grid
  const grid = el('inv-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 0; i < INV_SLOTS; i++) {
    const item = S.inventory ? S.inventory[i] : null;
    const slot = document.createElement('div');

    if (item) {
      const col = item.type === 'byte' ? '#ffdd00'
        : item.type === 'fragment' ? '#ff8800'
          : item.type === 'xptoken' ? '#00ffcc'
            : (RARITY_COLOR[item.rarity] || '#aaaaaa');
      const label = item.type === 'byte' ? 'BYTE'
        : item.type === 'fragment' ? 'FRAGMENT'
          : item.type === 'xptoken' ? 'XP TOKEN'
            : item.rarity.toUpperCase() + ' CHIP';
      const name = item.type === 'byte' ? 'Byte'
        : item.type === 'fragment' ? 'Chip Fragment'
          : item.type === 'xptoken' ? 'XP Token'
            : `${item.rarity} Chip`;

      slot.className = 'inv-slot has-item';
      slot.style.borderColor = col + '99';
      slot.style.boxShadow = `inset 0 0 16px ${col}22, 0 0 6px ${col}44`;

      if (item.type === 'chip') {
        const cv = document.createElement('canvas');
        cv.width = 96; cv.height = 96;
        cv.className = 'inv-chip-canvas';
        cv.dataset.rarity = item.rarity;
        cv.dataset.phase = (i * 1.31).toFixed(3);
        cv._angle = 0; cv._vel = 0; cv._hovered = false;
        slot.addEventListener('mouseenter', () => { cv._hovered = true; });
        slot.addEventListener('mouseleave', () => { cv._hovered = false; });
        slot.appendChild(cv);
      } else if (item.type === 'byte') {
        const cv = document.createElement('canvas');
        cv.width = 96; cv.height = 96;
        cv.className = 'inv-byte-canvas';
        cv.dataset.phase = (i * 1.31).toFixed(3);
        cv._angle = 0; cv._vel = 0; cv._hovered = false;
        slot.addEventListener('mouseenter', () => { cv._hovered = true; });
        slot.addEventListener('mouseleave', () => { cv._hovered = false; });
        slot.appendChild(cv);
      } else if (item.type === 'xptoken') {
        const cv = document.createElement('canvas');
        cv.width = 96; cv.height = 96;
        cv.className = 'inv-xp-canvas';
        cv.dataset.phase = (i * 1.31).toFixed(3);
        cv._angle = 0; cv._vel = 0; cv._hovered = false;
        slot.addEventListener('mouseenter', () => { cv._hovered = true; });
        slot.addEventListener('mouseleave', () => { cv._hovered = false; });
        slot.appendChild(cv);
      } else {
        const cv = document.createElement('canvas');
        cv.width = 96; cv.height = 96;
        cv.className = 'inv-frag-canvas';
        cv.dataset.phase = (i * 1.31).toFixed(3);
        cv._angle = 0; cv._vel = 0; cv._hovered = false;
        slot.addEventListener('mouseenter', () => { cv._hovered = true; });
        slot.addEventListener('mouseleave', () => { cv._hovered = false; });
        slot.appendChild(cv);
      }

      // Rarity / type label — bottom left
      const rlabel = document.createElement('span');
      rlabel.className = 'inv-slot-label';
      rlabel.style.color = col;
      rlabel.textContent = label;
      slot.appendChild(rlabel);

      // Quantity — bottom right
      const qty = document.createElement('span');
      qty.className = 'inv-slot-qty';
      qty.textContent = item.qty;
      slot.appendChild(qty);

      // Hover info bar
      slot.addEventListener('mouseenter', () => {
        const info = el('inv-info-bar');
        if (info) { info.textContent = `${name.toUpperCase()}  ×${item.qty}`; info.style.color = col; }
      });
      slot.addEventListener('mouseleave', () => {
        const info = el('inv-info-bar');
        if (info) { info.textContent = '— hover a slot —'; info.style.color = ''; }
      });
    } else {
      slot.className = 'inv-slot empty';
    }

    grid.appendChild(slot);
  }
}

// ── Inventory chip animation loop ────────────────────────────────
let invAnimRaf = null;

// BGA contact pad positions on chip back (row, col) — all land on body pixels
const CHIP_BACK_PADS = [
  [3, 3], [3, 6], [3, 9],
  [6, 3], [6, 6], [6, 9],
  [9, 3], [9, 6], [9, 9],
];

function drawChipBack(ctx, x, y, rarity) {
  const pal = CHIP_PALETTES[rarity] || CHIP_PALETTES.common;
  const rows = CHIP_ART.length, cols = CHIP_ART[0].length;
  const px = CHIP_PX;

  // Body — same silhouette as front, but dark flat colors
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = CHIP_ART[r][c];
      if (!v) continue;
      ctx.fillStyle = v === 1 ? pal[1] : pal[2];
      ctx.fillRect(x + c * px, y + r * px, px, px);
    }
  }

  // Thin horizontal trace lines across the body
  ctx.fillStyle = pal[3];
  [4, 6, 8].forEach(r => {
    ctx.fillRect(x + 2 * px, y + r * px + 3, 8 * px, 2);
  });

  // 3×3 BGA contact pads — glowing dots in rarity glow color
  ctx.shadowColor = pal[5];
  ctx.shadowBlur = 7;
  ctx.fillStyle = pal[5];
  CHIP_BACK_PADS.forEach(([r, c]) => {
    ctx.fillRect(x + c * px + 2, y + r * px + 2, px - 4, px - 4);
  });
  ctx.shadowBlur = 0;
}

// ── Fragment Shape (shared between loot draw + inventory canvas) ─
// True 3D cube with orthographic projection + Y rotation + fixed X tilt
// r = half-size, t = Y-rotation angle, pulse = glow 0..1
function drawCubeFragment(ctx, r, t, pulse) {
  const cY = Math.cos(t), sY = Math.sin(t);
  const ax = 0.52; // fixed downward tilt so top face is always visible
  const cX = Math.cos(ax), sX = Math.sin(ax);

  // Project 3D point → 2D (orthographic, Y then X rotation)
  function proj(x, y, z) {
    const rx = x * cY + z * sY;          // Y rotation
    const ry = y;
    const rz = -x * sY + z * cY;
    return { x: rx, y: ry * cX - rz * sX, z: ry * sX + rz * cX };
  }

  // 8 cube corners: top 4 (y=-r), bottom 4 (y=+r)
  const raw = [
    [-r, -r, -r], [r, -r, -r], [r, -r, r], [-r, -r, r],
    [-r, r, -r], [r, r, -r], [r, r, r], [-r, r, r],
  ];
  const v = raw.map(([x, y, z]) => proj(x, y, z));

  // 6 faces: vertex indices + amber face colors
  const faces = [
    { idx: [3, 2, 6, 7], col: [204, 85, 0] },  // front  (z=+r) — mid orange
    { idx: [1, 0, 4, 5], col: [68, 17, 0] },  // back   (z=-r) — very dark
    { idx: [2, 1, 5, 6], col: [170, 55, 0] },  // right  (x=+r) — darker
    { idx: [0, 3, 7, 4], col: [85, 28, 0] },  // left   (x=-r) — darkest side
    { idx: [0, 1, 2, 3], col: [255, 150, 0] },  // top    (y=-r) — brightest
    { idx: [7, 6, 5, 4], col: [30, 8, 0] },  // bottom (y=+r) — nearly black
  ];

  // Back-to-front sort + face-culling via cross product
  faces.forEach(f => {
    f.cz = f.idx.reduce((s, i) => s + v[i].z, 0) / 4;
    const [i0, i1, i2] = f.idx;
    f.vis = (v[i1].x - v[i0].x) * (v[i2].y - v[i0].y)
      - (v[i1].y - v[i0].y) * (v[i2].x - v[i0].x) > 0;
  });
  faces.sort((a, b) => a.cz - b.cz);

  const edgeAlpha = (0.5 + 0.5 * pulse).toFixed(2);
  faces.forEach(f => {
    if (!f.vis) return;
    const [fr, fg, fb] = f.col;
    ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
    ctx.strokeStyle = `rgba(255,160,0,${edgeAlpha})`;
    ctx.lineWidth = Math.max(0.5, r * 0.07);
    ctx.beginPath();
    f.idx.forEach((vi, j) => {
      if (j === 0) ctx.moveTo(v[vi].x, v[vi].y);
      else ctx.lineTo(v[vi].x, v[vi].y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

// ── XP Token Pixel Art ───────────────────────────────────────────
const XP_ART_X = [
  [1, 0, 0, 0, 1],
  [0, 1, 0, 1, 0],
  [0, 0, 1, 0, 0],
  [0, 1, 0, 1, 0],
  [1, 0, 0, 0, 1],
];
const XP_ART_P = [
  [1, 1, 1, 0],
  [1, 0, 0, 1],
  [1, 1, 1, 0],
  [1, 0, 0, 0],
  [1, 0, 0, 0],
];

// Draw pixel-art "XP" centered at (cx, cy); px = pixels per art-pixel
function drawXpPixelArt(ctx, cx, cy, px, color) {
  const xCols = XP_ART_X[0].length;              // 5
  const pCols = XP_ART_P[0].length;              // 4
  const rows = XP_ART_X.length;                 // 5
  const totalW = (xCols + 1 + pCols) * px;        // 10 * px
  const sx = cx - totalW / 2;
  const sy = cy - (rows * px) / 2;
  ctx.fillStyle = color;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < xCols; c++) {
      if (XP_ART_X[r][c]) ctx.fillRect(sx + c * px, sy + r * px, px, px);
    }
    const pOff = (xCols + 1) * px;
    for (let c = 0; c < pCols; c++) {
      if (XP_ART_P[r][c]) ctx.fillRect(sx + pOff + c * px, sy + r * px, px, px);
    }
  }
}

function drawInvChipCanvas(cv) {
  const rarity = cv.dataset.rarity;
  const phase = parseFloat(cv.dataset.phase || 0);
  const cctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const now = performance.now();

  // Velocity-based spin: accelerate on hover, decelerate on leave
  if (cv._hovered) cv._vel = Math.min((cv._vel || 0) + 0.003, 0.05);
  else cv._vel = Math.max((cv._vel || 0) - 0.002, 0);
  cv._angle = (cv._angle || 0) + (cv._vel || 0);

  cctx.clearRect(0, 0, W, H);

  const cosA = Math.cos(cv._angle);
  const isFront = cosA >= 0;
  const bobY = Math.sin(now * 0.0011 + phase) * 3.5;
  const half = CHIP_ART_SIZE / 2;

  cctx.save();
  cctx.translate(W / 2, H / 2 + bobY);
  cctx.scale(cosA, 1);
  cctx.translate(-half, -half);

  if (isFront) drawChipFlat(cctx, 0, 0, rarity, true);
  else drawChipBack(cctx, 0, 0, rarity);

  cctx.restore();
}

function drawInvXpCanvas(cv) {
  const phase = parseFloat(cv.dataset.phase || 0);
  const cctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const now = performance.now();

  if (cv._hovered) cv._vel = Math.min((cv._vel || 0) + 0.003, 0.05);
  else cv._vel = Math.max((cv._vel || 0) - 0.002, 0);
  cv._angle = (cv._angle || 0) + (cv._vel || 0);

  cctx.clearRect(0, 0, W, H);

  const cosA = Math.cos(cv._angle);
  const isFront = cosA >= 0;
  const bobY = Math.sin(now * 0.0011 + phase) * 3.5;
  const pulse = 0.7 + 0.3 * Math.sin(now * 0.0022 + phase);

  cctx.save();
  cctx.translate(W / 2, H / 2 + bobY);
  cctx.scale(cosA, 1);

  if (isFront) {
    cctx.shadowColor = '#00ffcc';
    cctx.shadowBlur = 14 * pulse;
    cctx.globalAlpha = 0.85 + 0.15 * pulse;
    drawXpPixelArt(cctx, 0, 0, 7, '#00ffcc');
    cctx.globalAlpha = 1;
    cctx.shadowBlur = 0;
  } else {
    drawXpPixelArt(cctx, 0, 0, 7, '#003d2e');
  }

  cctx.restore();
}

function drawInvFragCanvas(cv) {
  const phase = parseFloat(cv.dataset.phase || 0);
  const cctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const now = performance.now();

  if (cv._hovered) cv._vel = Math.min((cv._vel || 0) + 0.003, 0.05);
  else cv._vel = Math.max((cv._vel || 0) - 0.002, 0);
  cv._angle = (cv._angle || 0) + (cv._vel || 0);

  cctx.clearRect(0, 0, W, H);

  const bobY = Math.sin(now * 0.0011 + phase) * 3.5;
  const pulse = 0.75 + 0.25 * Math.sin(now * 0.006 + phase);

  cctx.save();
  cctx.translate(W / 2, H / 2 + bobY);
  cctx.shadowColor = '#ff8800';
  cctx.shadowBlur = 14 * pulse;
  drawCubeFragment(cctx, 22, cv._angle, pulse);
  cctx.shadowBlur = 0;
  cctx.restore();
}

function drawInvByteCanvas(cv) {
  const phase = parseFloat(cv.dataset.phase || 0);
  const cctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const now = performance.now();

  if (cv._hovered) cv._vel = Math.min((cv._vel || 0) + 0.003, 0.05);
  else cv._vel = Math.max((cv._vel || 0) - 0.002, 0);
  cv._angle = (cv._angle || 0) + (cv._vel || 0);

  cctx.clearRect(0, 0, W, H);

  const spinX = Math.abs(Math.cos(cv._angle));
  const bright = spinX > 0.5;
  const bobY = Math.sin(now * 0.0011 + phase) * 3.5;
  const r = 26;
  const xR = Math.max(2, r * spinX);

  cctx.save();
  cctx.translate(W / 2, H / 2 + bobY);
  cctx.shadowColor = '#ffdd00';
  cctx.shadowBlur = 18;

  // Coin body
  cctx.fillStyle = bright ? '#ffcc00' : '#996600';
  cctx.beginPath();
  cctx.ellipse(0, 0, xR, r, 0, 0, Math.PI * 2);
  cctx.fill();

  // Shine highlight
  if (spinX > 0.3) {
    cctx.fillStyle = 'rgba(255,255,180,0.5)';
    cctx.beginPath();
    cctx.ellipse(-xR * 0.28, -r * 0.28, xR * 0.3, r * 0.42, 0, 0, Math.PI * 2);
    cctx.fill();
  }

  // Rim
  cctx.strokeStyle = bright ? '#ffee00' : '#774400';
  cctx.lineWidth = 2;
  cctx.beginPath();
  cctx.ellipse(0, 0, xR, r, 0, 0, Math.PI * 2);
  cctx.stroke();

  // "B" label on front face
  if (spinX > 0.35) {
    cctx.shadowBlur = 0;
    cctx.fillStyle = bright ? '#885500' : '#ffaa00';
    cctx.font = `bold ${Math.max(8, Math.round(xR * 0.95))}px monospace`;
    cctx.textAlign = 'center';
    cctx.textBaseline = 'middle';
    cctx.fillText('B', 0, 1);
  }

  cctx.shadowBlur = 0;
  cctx.restore();
}

function startInvAnimations() {
  if (invAnimRaf) return;
  function frame() {
    document.querySelectorAll('.inv-chip-canvas').forEach(drawInvChipCanvas);
    document.querySelectorAll('.inv-byte-canvas').forEach(drawInvByteCanvas);
    document.querySelectorAll('.inv-xp-canvas').forEach(drawInvXpCanvas);
    document.querySelectorAll('.inv-frag-canvas').forEach(drawInvFragCanvas);
    invAnimRaf = requestAnimationFrame(frame);
  }
  invAnimRaf = requestAnimationFrame(frame);
}

function stopInvAnimations() {
  if (invAnimRaf) { cancelAnimationFrame(invAnimRaf); invAnimRaf = null; }
}

window.toggleInventory = function () {
  const ov = document.getElementById('inv-overlay');
  if (!ov) return;
  if (S.inventoryOpen) {
    window.closeInventory();
  } else {
    updateInventoryUI();
    ov.classList.add('active');
    S.inventoryOpen = true;
    startInvAnimations();
  }
};

window.closeInventory = function () {
  const ov = document.getElementById('inv-overlay');
  if (ov) ov.classList.remove('active');
  S.inventoryOpen = false;
  stopInvAnimations();
};

function checkExplorationComplete() {
  if (!S.fog || S.explorerChestSpawned || gameMode !== 'adventure') return;
  let total = 0, revealed = 0;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (S.dungeon[y][x] > 0) { total++; if (S.fog[y][x]) revealed++; }
  if (total > 0 && revealed >= total) spawnExplorerChest();
}

function spawnExplorerChest() {
  S.explorerChestSpawned = true;
  // Always reveal full map as reward for exploring
  S.fullMapRevealed = true;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (S.dungeon[y][x] > 0) S.fog[y][x] = true;

  // Pick a random room from the first 3
  const poolSize = Math.min(3, S.rooms.length);
  const candidates = [];
  for (let i = 0; i < poolSize; i++) {
    const r = S.rooms[i];
    const cx = r.x + Math.floor(r.w / 2);
    const cy = r.y + Math.floor(r.h / 2);
    if (S.dungeon[cy]?.[cx] > 0
      && !(S.chests || []).some(c => c.x === cx && c.y === cy)
      && !(S.exit && S.exit.x === cx && S.exit.y === cy)) {
      candidates.push({ x: cx, y: cy });
    }
  }
  if (candidates.length === 0) return;

  const best = candidates[Math.floor(Math.random() * candidates.length)];
  const chipVal = 40 + S.floor * 10;
  S.chests.push({
    x: best.x, y: best.y, opened: false, explorer: true, val: chipVal,
    spawning: true, spawnStart: performance.now()
  });
  SFX.chestSpawn();
}

// Returns true if cell (x,y) is within current player vision radius or bullet illumination
function isVisible(x, y) {
  if (gameMode !== 'adventure') return true;
  const hero = S.units.find(u => u.team === 0 && u.alive);
  if (hero && Math.hypot(x - hero.x, y - hero.y) <= FOG_RADIUS) return true;

  // Also visible if within bullet light radius (animated position)
  if (S.bullets) {
    for (const b of S.bullets) {
      if (Math.hypot(x - b.rx, y - b.ry) <= 1.5) return true;
    }
  }

  // Also visible if illuminated by an active light ghost (enemy death explosion, etc.)
  if (S.lightGhosts) {
    const now = performance.now();
    for (const g of S.lightGhosts) {
      const d = Math.hypot(x - g.x, y - g.y);
      const isHold = g.holdMs !== undefined ? (now - g.bornTime < g.holdMs) : (S.tick - g.bornTick < 3);
      const maxR = g.r || 2.5;

      if (isHold) {
        if (d <= maxR) return true;
      } else if (g.fadeBorn) {
        const ft = Math.min(1, (now - g.fadeBorn) / g.fadeDur);
        const reach = maxR * (1 - ft * 0.55); // Matavimo atstumas gali truputi trauktis kartu su blykste
        if (d <= reach) return true;
      }
    }
  }

  return false;
}

function drawDungeon() {
  // Pass 1: base fills
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const px = c * CELL, py = r * CELL;
      if (S.dungeon[r][c] === 2) {
        // Pillar base floor
        ctx.fillStyle = '#051d10';
        ctx.fillRect(px, py, CELL, CELL);

        const pType = Math.abs((r * 241 + c * 599) % 100);

        if (pType < 30) {
          // 30% chance: Upgraded Electrolytic Capacitor
          ctx.fillStyle = '#081710'; ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8); // shadow
          ctx.fillStyle = '#1c7546'; ctx.fillRect(px + 6, py + 6, CELL - 12, CELL - 12); // main body
          ctx.fillStyle = '#2db56d'; ctx.fillRect(px + 8, py + 6, 4, CELL - 12); // highlight

          ctx.fillStyle = '#111'; ctx.fillRect(px + CELL / 2 + 2, py + 6, 4, CELL - 12); // negative stripe
          ctx.fillStyle = '#ccc'; ctx.fillRect(px + CELL / 2 + 3, py + 12, 2, 4); // minus sign
          // Silver top
          ctx.fillStyle = '#99aaab'; ctx.fillRect(px + 6, py + 6, CELL - 12, 5);
          ctx.fillStyle = '#d1dfdf'; ctx.fillRect(px + 8, py + 7, CELL - 16, 2);

          // Cross depression on top
          ctx.fillStyle = '#445555'; ctx.fillRect(px + CELL / 2 - 1, py + 6, 2, 5);
          ctx.fillRect(px + CELL / 2 - 3, py + 8, 6, 2);
        } else if (pType < 60) {
          // 30% chance: Polished Red LED
          ctx.fillStyle = '#0a0a0a'; ctx.fillRect(px + 10, py + 18, CELL - 20, CELL - 18); // plastic base rim
          ctx.fillStyle = '#e0e0e0'; ctx.fillRect(px + 12, py + 4, 2, 16); // anode pin
          ctx.fillStyle = '#b0b0b0'; ctx.fillRect(px + CELL - 14, py + 4, 3, 16); // cathode pin (thicker)

          ctx.fillStyle = '#800000'; // dark red bulb back
          ctx.beginPath();
          ctx.arc(px + CELL / 2, py + CELL * 0.55, CELL * 0.28, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ff2222'; // bright red bulb
          ctx.beginPath();
          ctx.arc(px + CELL / 2, py + CELL * 0.58, CELL * 0.26, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#xff8888'; // reflection crescent
          ctx.beginPath();
          ctx.arc(px + CELL / 2 - 3, py + CELL * 0.52, CELL * 0.1, 0, Math.PI * 2);
          ctx.fill();

          ctx.shadowColor = '#ff2222'; ctx.shadowBlur = 12;
          ctx.fillStyle = '#ffcccc'; // glowing core
          ctx.beginPath();
          ctx.arc(px + CELL / 2, py + CELL * 0.6, CELL * 0.08, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (pType < 85) {
          // 25% chance: Detailed Square IC Chip
          ctx.fillStyle = '#111'; ctx.fillRect(px + 6, py + 6, CELL - 12, CELL - 12); // body shadow

          // Gold Pins
          ctx.fillStyle = '#ccaa00';
          for (let i = 8; i <= CELL - 10; i += 6) {
            ctx.fillRect(px + 2, py + i + 1, 6, 3); // left
            ctx.fillRect(px + CELL - 8, py + i + 1, 6, 3); // right
          }
          // Bright pin tips
          ctx.fillStyle = '#ffeaa0';
          for (let i = 8; i <= CELL - 10; i += 6) {
            ctx.fillRect(px + 2, py + i + 1, 2, 3);
            ctx.fillRect(px + CELL - 4, py + i + 1, 2, 3);
          }

          ctx.fillStyle = '#222325'; // matte plastic body
          ctx.fillRect(px + 8, py + 8, CELL - 16, CELL - 16);
          ctx.fillStyle = '#3a3d42'; // body edge highlight
          ctx.fillRect(px + 8, py + 8, CELL - 16, 2);
          ctx.fillRect(px + 8, py + 8, 2, CELL - 16);

          // Pin 1 indicator (dot)
          ctx.fillStyle = '#111';
          ctx.beginPath(); ctx.arc(px + 12, py + 12, 2, 0, Math.PI * 2); ctx.fill();

          // Laser etched text lines
          ctx.fillStyle = '#555';
          ctx.fillRect(px + 15, py + 16, CELL - 26, 2);
          ctx.fillRect(px + 15, py + 22, CELL - 30, 2);
        } else {
          // 15% chance: Detailed Ceramic Capacitor
          ctx.fillStyle = '#8a99a8'; // tin coated copper wires
          ctx.fillRect(px + CELL * 0.35, py, 2, CELL * 0.5); // left
          ctx.fillRect(px + CELL * 0.65 - 2, py, 2, CELL * 0.5); // right

          ctx.fillStyle = '#a64400'; // dark orange border
          ctx.beginPath();
          ctx.arc(px + CELL / 2, py + CELL * 0.55, CELL * 0.32, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#e56400'; // bright orange ceramic
          ctx.beginPath();
          ctx.arc(px + CELL / 2, py + CELL * 0.55, CELL * 0.3, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ff9e3d'; // rounded highlight
          ctx.beginPath();
          ctx.arc(px + CELL / 2 - 4, py + CELL * 0.5, CELL * 0.12, 0, Math.PI * 2);
          ctx.fill();

          // Capacity label print
          ctx.fillStyle = '#4a2500';
          ctx.fillRect(px + CELL / 2 - 4, py + CELL * 0.6, 8, 2);
        }
      } else if (S.dungeon[r][c] === 1) {
        // Motherboard Substrate (Floor)
        ctx.fillStyle = (r + c) % 2 === 0 ? '#03140a' : '#041a0d';
        ctx.fillRect(px, py, CELL, CELL);

        // Random circuit trace lines
        const seed = (r * 123 + c * 456) % 100;
        if (seed < 20) {
          ctx.strokeStyle = 'rgba(0, 255, 136, 0.08)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (seed < 10) { ctx.moveTo(px, py + CELL / 2); ctx.lineTo(px + CELL, py + CELL / 2); }
          else { ctx.moveTo(px + CELL / 2, py); ctx.lineTo(px + CELL / 2, py + CELL); }
          ctx.stroke();
        }

        const rtype = S.rooms?.find(rm => c >= rm.x && c < rm.x + rm.w && r >= rm.y && r < rm.y + rm.h)?.type;
        if (rtype === 'shrine') { ctx.fillStyle = 'rgba(0,255,136,0.1)'; ctx.fillRect(px, py, CELL, CELL); }
        if (rtype === 'armory') { ctx.fillStyle = 'rgba(255,217,0,0.08)'; ctx.fillRect(px, py, CELL, CELL); }
        if (rtype === 'vault') { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px, py, CELL, CELL); }

        ctx.strokeStyle = 'rgba(13, 77, 42, 0.3)'; ctx.lineWidth = 0.5;
        ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
      } else if (S.dungeon[r][c] === 3) {
        // Data Bus Corridor
        ctx.fillStyle = '#020d06';
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = 'rgba(0, 255, 136, 0.04)';
        ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
      } else {
        // Wall base
        ctx.fillStyle = '#111';
        ctx.fillRect(px, py, CELL, CELL);

        // Calculate a pseudo-random value based on cell coords for variety
        const rType = Math.abs((r * 137 + c * 313) % 100);

        if (rType < 40) {
          // 40% chance: Polished Microchip
          // Pins
          ctx.fillStyle = '#a68200'; // dark gold
          const pinW = 3, pinH = 4;
          const spacing = 6;
          for (let i = spacing; i < CELL - spacing; i += spacing) {
            ctx.fillRect(px + i, py, pinW, pinH); ctx.fillRect(px + i, py + CELL - pinH, pinW, pinH);
            ctx.fillRect(px, py + i, pinH, pinW); ctx.fillRect(px + CELL - pinH, py + i, pinH, pinW);
          }
          // Shiny pin tips
          ctx.fillStyle = '#ffe97a';
          for (let i = spacing; i < CELL - spacing; i += spacing) {
            ctx.fillRect(px + i, py, pinW, 1); ctx.fillRect(px + i, py + CELL - 1, pinW, 1);
            ctx.fillRect(px, py + i, 1, pinW); ctx.fillRect(px + CELL - 1, py + i, 1, pinW);
          }
          // Black body
          ctx.fillStyle = '#1c1c1f'; ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
          // Etched core
          ctx.fillStyle = '#0a0a0c'; ctx.fillRect(px + 8, py + 8, CELL - 16, CELL - 16);
          // Silicon rainbow sheen (fake effect)
          ctx.fillStyle = 'rgba(120, 50, 255, 0.15)'; ctx.fillRect(px + 8, py + 8, CELL - 16, CELL - 16);
          // Core detail
          ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 1; ctx.strokeRect(px + 10, py + 10, CELL - 20, CELL - 20);
        } else if (rType < 70) {
          // 30% chance: Detailed Transistor (TO-220 style package)
          ctx.fillStyle = '#111'; ctx.fillRect(px + 6, py + 6, CELL - 12, CELL - 12); // shadow

          // 3 Metal legs (tin)
          ctx.fillStyle = '#8a99a8';
          ctx.fillRect(px + CELL * 0.3, py + CELL * 0.6, 4, CELL * 0.4);
          ctx.fillRect(px + CELL * 0.5 - 2, py + CELL * 0.6, 4, CELL * 0.4);
          ctx.fillRect(px + CELL * 0.7 - 4, py + CELL * 0.6, 4, CELL * 0.4);

          // Metal heatsink tab on top
          ctx.fillStyle = '#a0aab5';
          ctx.fillRect(px + CELL * 0.2, py + CELL * 0.1, CELL * 0.6, CELL * 0.4);
          // Metal mounting hole
          ctx.fillStyle = '#051d10';
          ctx.beginPath(); ctx.arc(px + CELL * 0.5, py + CELL * 0.25, CELL * 0.1, 0, Math.PI * 2); ctx.fill();

          // Black epoxy body (bottom half)
          ctx.fillStyle = '#222325';
          ctx.fillRect(px + CELL * 0.2, py + CELL * 0.4, CELL * 0.6, CELL * 0.4);
          // Body highlight
          ctx.fillStyle = '#3a3d42';
          ctx.fillRect(px + CELL * 0.2, py + CELL * 0.4, CELL * 0.6, 2);

          // Manufacturer text
          ctx.fillStyle = '#aaa';
          ctx.fillRect(px + CELL * 0.25, py + CELL * 0.6, CELL * 0.5, 2);
        } else if (rType < 90) {
          // 20% chance: Detailed Axial Resistor
          // Tin wire leads
          ctx.fillStyle = '#8a99a8'; ctx.fillRect(px + CELL * 0.5 - 2, py, 4, CELL);
          ctx.fillStyle = '#d1dfdf'; ctx.fillRect(px + CELL * 0.5 - 1, py, 2, CELL); // wire specular

          // Beige ceramic body
          ctx.fillStyle = '#d4bfa6';
          ctx.fillRect(px + CELL * 0.25, py + CELL * 0.2, CELL * 0.5, CELL * 0.6);
          ctx.fillStyle = '#e8d5c1'; // body highlight
          ctx.fillRect(px + CELL * 0.3, py + CELL * 0.2, CELL * 0.2, CELL * 0.6);

          // Curved ends
          ctx.fillStyle = '#c0aa91';
          ctx.fillRect(px + CELL * 0.3, py + CELL * 0.15, CELL * 0.4, CELL * 0.05);
          ctx.fillRect(px + CELL * 0.3, py + CELL * 0.8, CELL * 0.4, CELL * 0.05);

          // 4 Color bands (Red, Violet, Orange, Gold) = 27k Ohm 5%
          const bw = CELL * 0.5;
          ctx.fillStyle = '#cc2222'; ctx.fillRect(px + CELL * 0.25, py + CELL * 0.25, bw, 4); // red
          ctx.fillStyle = '#aa44cc'; ctx.fillRect(px + CELL * 0.25, py + CELL * 0.35, bw, 4); // violet
          ctx.fillStyle = '#e56400'; ctx.fillRect(px + CELL * 0.25, py + CELL * 0.45, bw, 4); // orange
          ctx.fillStyle = '#cca300'; ctx.fillRect(px + CELL * 0.25, py + CELL * 0.65, bw, 6); // gold
        } else {
          // 10% chance: Shiny Extruded Aluminum Heatsink
          ctx.fillStyle = '#111'; ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8); // shadow base
          ctx.fillStyle = '#3a424a'; ctx.fillRect(px + 6, py + 6, CELL - 12, CELL - 12); // main alu

          ctx.fillStyle = '#6e7a88'; // fins
          for (let i = 8; i < CELL - 8; i += 6) {
            ctx.fillRect(px + 6, py + i, CELL - 12, 4);
            // silver fin highlights (gives 3D pop)
            ctx.fillStyle = '#aeb7bf'; ctx.fillRect(px + 6, py + i, CELL - 12, 1);
            ctx.fillStyle = '#6e7a88';
          }

          // Vertical cross-cut channels
          ctx.fillStyle = '#2a3036';
          ctx.fillRect(px + CELL * 0.3, py + 6, 4, CELL - 12);
          ctx.fillRect(px + CELL * 0.6, py + 6, 4, CELL - 12);
        }
      }
    }
  }

  // Pass 2: bright edge lines on floor tiles that border walls
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = S.dungeon[r][c];
      if (tile !== 1 && tile !== 3) continue;
      const px = c * CELL, py = r * CELL;
      // wall = tile 0 or 2; corridors and rooms border each other and walls
      const wN = r === 0 || (S.dungeon[r - 1][c] !== 1 && S.dungeon[r - 1][c] !== 3);
      const wS = r === ROWS - 1 || (S.dungeon[r + 1][c] !== 1 && S.dungeon[r + 1][c] !== 3);
      const wW = c === 0 || (S.dungeon[r][c - 1] !== 1 && S.dungeon[r][c - 1] !== 3);
      const wE = c === COLS - 1 || (S.dungeon[r][c + 1] !== 1 && S.dungeon[r][c + 1] !== 3);

      if (wN) {
        ctx.fillStyle = '#051d10'; ctx.fillRect(px, py, CELL, 3);
        ctx.fillStyle = '#00ff88'; ctx.fillRect(px, py, CELL, 1);
      }
      if (wS) {
        ctx.fillStyle = '#03140a'; ctx.fillRect(px, py + CELL - 3, CELL, 3);
        ctx.fillStyle = '#0d4d2a'; ctx.fillRect(px, py + CELL - 1, CELL, 1);
      }
      if (wW) {
        ctx.fillStyle = '#051d10'; ctx.fillRect(px, py, 3, CELL);
        ctx.fillStyle = '#00ff88'; ctx.fillRect(px, py, 1, CELL);
      }
      if (wE) {
        ctx.fillStyle = '#03140a'; ctx.fillRect(px + CELL - 3, py, 3, CELL);
        ctx.fillStyle = '#0d4d2a'; ctx.fillRect(px + CELL - 1, py, 1, CELL);
      }

      // Corner highlights where top/left wall edges meet
      if (wN && wW) { ctx.fillStyle = '#4a6ae0'; ctx.fillRect(px, py, 3, 3); }
      if (wN && wE) { ctx.fillStyle = '#0a1240'; ctx.fillRect(px + CELL - 3, py, 3, 3); }
      if (wS && wW) { ctx.fillStyle = '#0a1240'; ctx.fillRect(px, py + CELL - 3, 3, 3); }
      if (wS && wE) { ctx.fillStyle = '#080e38'; ctx.fillRect(px + CELL - 3, py + CELL - 3, 3, 3); }
    }
  }

  // Pass 3: Draw Moving Platforms (Glowing Energy Blocks)
  if (S.platforms) {
    S.platforms.forEach(p => {
      const px = p.rx * CELL, py = p.ry * CELL;
      const pulse = (Math.sin(performance.now() * 0.01) + 1) * 0.5;

      // Outer glow
      ctx.shadowBlur = 15 + pulse * 10;
      ctx.shadowColor = '#00f5ff';
      ctx.fillStyle = '#00f5ff';
      ctx.globalAlpha = 0.6 + pulse * 0.3;
      ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);

      // Inner core
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.8;
      ctx.fillRect(px + CELL * 0.3, py + CELL * 0.3, CELL * 0.4, CELL * 0.4);

      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;
    });
  }
}

function drawFog() {
  if (gameMode !== 'adventure' || !S.fog) return;
  const hero = S.units.find(u => u.team === 0 && u.alive);
  const liveBullets = S.bullets ? S.bullets.filter(b => b.active) : [];
  const now = performance.now();
  const REVEAL_DUR = 600;
  // Clean up expired light ghosts
  if (S.lightGhosts) S.lightGhosts = S.lightGhosts.filter(g => {
    const isHold = g.holdMs !== undefined ? (now - g.bornTime < g.holdMs) : (S.tick - g.bornTick < 3);
    if (isHold) return true;
    if (!g.fadeBorn) g.fadeBorn = now;
    return now - g.fadeBorn < g.fadeDur;
  });
  const liveGhosts = S.lightGhosts || [];

  // Ray-trace: is cell (c,r) shadowed from bullet at (bx,by) by a wall?
  const isShadowed = (bx, by, c, r) => {
    const ddx = c - bx, ddy = r - by;
    const steps = Math.ceil(Math.max(Math.abs(ddx), Math.abs(ddy)));
    if (steps <= 1) return false;
    for (let i = 1; i < steps; i++) {
      const wx = Math.round(bx + ddx * i / steps);
      const wy = Math.round(by + ddy * i / steps);
      if ((wx !== c || wy !== r) && isWall(wx, wy)) return true;
    }
    return false;
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const vis = hero && Math.hypot(c - hero.x, r - hero.y) <= FOG_RADIUS;

      // Nearest light source (active bullet or lingering ghost) with clear LoS
      let bDist = Infinity;
      for (const b of liveBullets) {
        const d = Math.hypot(c - b.rx, r - b.ry);
        if (d < bDist && d <= 2.5 && !isShadowed(b.rx, b.ry, c, r)) bDist = d;
      }
      for (const g of liveGhosts) {
        const d = Math.hypot(c - g.x, r - g.y);
        const maxR = g.r || 2.5;
        const normD = d * (2.5 / maxR);
        const isHold = g.holdMs !== undefined ? (now - g.bornTime < g.holdMs) : (S.tick - g.bornTick < 3);

        if (isHold) {
          if (normD < bDist && d <= maxR && !isShadowed(g.x, g.y, c, r)) bDist = normD;
        } else if (g.fadeBorn) {
          const ft = Math.min(1, (now - g.fadeBorn) / g.fadeDur);
          const reach = maxR * (1 - ft);
          if (d <= reach && !isShadowed(g.x, g.y, c, r)) {
            const fd = normD / (1 - ft + 0.001);
            if (fd < bDist) bDist = fd;
          }
        }
      }
      const bulletLit = bDist <= 1.0;
      const bulletGlow = bDist <= 2.5;

      if (vis || bulletLit) {
        if (!bulletLit) {
          const adjDark =
            (r > 0 && !(hero && Math.hypot(c - hero.x, (r - 1) - hero.y) <= FOG_RADIUS)) ||
            (r < ROWS - 1 && !(hero && Math.hypot(c - hero.x, (r + 1) - hero.y) <= FOG_RADIUS)) ||
            (c > 0 && !(hero && Math.hypot((c - 1) - hero.x, r - hero.y) <= FOG_RADIUS)) ||
            (c < COLS - 1 && !(hero && Math.hypot((c + 1) - hero.x, r - hero.y) <= FOG_RADIUS));
          if (adjDark) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
          }
        }
      } else if (S.fog[r][c]) {
        if (!S.fullMapRevealed) {
          const alpha = bulletGlow ? 0.78 * Math.min(1, (bDist - 1.0) / 1.5) : 0.78;
          ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
          ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        }
      } else {
        const alpha = bulletGlow ? Math.min(1, (bDist - 1.0) / 1.5) : 1.0;
        ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }
  }

  // ── Room reveal animation: newly uncovered cells fade from black ──
  if (S.fogReveal) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const rt = S.fogReveal[r][c];
        if (!rt) continue;
        const elapsed = now - rt;
        if (elapsed >= REVEAL_DUR) continue;
        const t = elapsed / REVEAL_DUR;
        const alpha = Math.pow(1 - t, 1.6);
        ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }
  }

  // ── Bullet warm light halo ────────────────────────────────────────
  liveBullets.forEach(b => {
    const px = (b.rx + 0.5) * CELL, py = (b.ry + 0.5) * CELL;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, CELL * 2.5);
    grad.addColorStop(0, 'rgba(255,230,120,0.18)');
    grad.addColorStop(0.45, 'rgba(255,200, 80,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, CELL * 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── Lingering ghost halos ─────────────────────────────────────────
  liveGhosts.forEach(g => {
    const px = (g.x + 0.5) * CELL, py = (g.y + 0.5) * CELL;
    let alpha, radius;
    const maxR = (g.r || 2.5) * CELL;
    const isHold = g.holdMs !== undefined ? (now - g.bornTime < g.holdMs) : (S.tick - g.bornTick < 3);

    if (isHold) {
      alpha = g.alpha || 0.18;
      radius = maxR;
    } else if (g.fadeBorn) {
      const ft = Math.min(1, (now - g.fadeBorn) / g.fadeDur);
      alpha = (g.alpha || 0.18) * (1 - ft);
      radius = maxR * (1 - ft * 0.55);
    } else {
      return;
    }

    let rV = 255, gV = 220, bV = 100;
    if (g.color && g.color.startsWith('#') && g.color.length === 7) {
      rV = parseInt(g.color.slice(1, 3), 16);
      gV = parseInt(g.color.slice(3, 5), 16);
      bV = parseInt(g.color.slice(5, 7), 16);
    }
    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, `rgba(${rV},${gV},${bV},${alpha.toFixed(3)})`);
    grad.addColorStop(0.45, `rgba(${rV},${Math.max(0, gV - 40)},${Math.max(0, bV - 40)},${(alpha * 0.45).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ── Footstep trail (world space, drawn before fog) ────────────────
function drawFootsteps() {
  if (gameMode !== 'adventure' || !S.footsteps) return;
  S.footsteps.forEach(f => {
    if (f.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = f.alpha * 0.28;
    ctx.fillStyle = '#4488ff';
    ctx.shadowColor = '#2266ff';
    ctx.shadowBlur = 8;
    const px = f.x * CELL, py = f.y * CELL;
    ctx.fillRect(px + 6, py + 6, CELL - 12, CELL - 12);
    ctx.restore();
  });
}

// ── Adventure HUD — Chip + Fragment counter (screen space) ─────────
function drawAdvHUD() {
  const bytes = S.bytes || 0;
  const frags = S.fragments || 0;
  const fragsInProgress = frags % FRAG_PER_CHIP;
  const assembled = Math.floor(frags / FRAG_PER_CHIP);
  const fragPct = fragsInProgress / FRAG_PER_CHIP;

  ctx.save();
  const x = 12, y = 16;
  const barW = 80, barH = 6;
  const now = performance.now();

  // ── CHIP count ──
  ctx.font = 'bold 12px monospace';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#ffee00';
  ctx.fillStyle = '#ffee00';
  ctx.fillText(`⬡ ${bytes}`, x + 20, y);
  // small chip icon (3-pixel art)
  ctx.fillStyle = '#ffcc00';
  ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 6;
  ctx.fillRect(x, y - 10, 10, 10);
  ctx.strokeStyle = '#ffee88'; ctx.lineWidth = 1;
  ctx.strokeRect(x, y - 10, 10, 10);

  // ── FRAGMENT bar ──
  const fy = y + 14;
  ctx.font = '9px monospace';
  ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#ff8800';
  ctx.fillText(`FRAG ${fragsInProgress}/${FRAG_PER_CHIP}`, x, fy);

  // Bar background
  ctx.fillStyle = 'rgba(80,30,0,0.7)';
  ctx.shadowBlur = 0;
  ctx.fillRect(x, fy + 3, barW, barH);
  // Bar fill
  const fragGlow = 0.85 + 0.15 * Math.sin(now * 0.007);
  const barFill = ctx.createLinearGradient(x, 0, x + barW, 0);
  barFill.addColorStop(0, '#cc5500');
  barFill.addColorStop(1, '#ff9900');
  ctx.fillStyle = barFill;
  ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 6 * fragGlow;
  ctx.fillRect(x, fy + 3, barW * fragPct, barH);
  // Bar border
  ctx.strokeStyle = 'rgba(255,140,0,0.4)'; ctx.lineWidth = 1;
  ctx.shadowBlur = 0;
  ctx.strokeRect(x, fy + 3, barW, barH);

  // Assembled chips ready indicator (if any extra full sets pending)
  if (assembled > 0) {
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#00ffee'; ctx.shadowColor = '#00ffee'; ctx.shadowBlur = 8;
    ctx.fillText(`+${assembled} CHIP RDY`, x + barW + 6, fy + 9);
  }

  ctx.restore();
}

// ── Weapon HUD — current weapon + ammo (screen space, bottom left) ─
function drawWeaponHUD() {
  const hero = S.units?.find(u => u.team === 0 && u.alive);
  if (!hero) return;
  const wep = getCurrentWeapon(hero);
  const pad = 14;
  const by = ADV_CANVAS_H - pad - 26;

  const ICONS = { bullet: '● PISTOL', laser: '▶ LASER', heavy: '◆ HEAVY', shotgun: '✦ SHOTGN', melee: '✕ MELEE' };
  const COLORS = { bullet: '#aaccff', laser: '#88ffff', heavy: '#ffaa44', shotgun: '#ffdd88', melee: '#ff6688' };
  const GLOWS = { bullet: '#4488ff', laser: '#00ffff', heavy: '#ff8800', shotgun: '#ffcc00', melee: '#ff2244' };

  let ammoStr = '';
  if (wep === 'laser') ammoStr = `  ${hero.laserAmmo}/${MAX_LASER}`;
  else if (wep === 'heavy') ammoStr = `  ${hero.heavyAmmo}/${MAX_HEAVY}`;
  else if (wep === 'shotgun') ammoStr = `  ${hero.shotgunAmmo}/${MAX_SHOTGUN}`;
  else if (wep === 'bullet') ammoStr = `  ${hero.ammo}/${hero.maxAmmo}`;

  ctx.save();
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.textBaseline = 'top';
  const label = (ICONS[wep] || wep.toUpperCase()) + ammoStr;
  const bw = ctx.measureText(label).width + 20;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(pad, by, bw, 26);
  ctx.strokeStyle = GLOWS[wep] || '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, by, bw, 26);
  ctx.fillStyle = COLORS[wep] || '#ffffff';
  ctx.shadowColor = GLOWS[wep] || '#ffffff'; ctx.shadowBlur = 8;
  ctx.fillText(label, pad + 10, by + 7);
  ctx.restore();
}

// ── Scanlines / CRT overlay (screen space, drawn last) ───────────
function drawScanlines() {
  const w = advCanvasW || BOARD_W;
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = '#000000';
  const scanH = gameMode === 'adventure' ? ADV_CANVAS_H : BOARD_H;
  for (let y = 0; y < scanH; y += 3) {
    ctx.fillRect(0, y, w, 1);
  }
  ctx.restore();
}

function drawShrines() {
  if (!S.shrines) return;
  S.shrines.forEach(sh => {
    if (!isVisible(sh.x, sh.y) && !(S.fullMapRevealed && S.fog?.[sh.y]?.[sh.x])) return;
    const cx = (sh.x + 0.5) * CELL, cy = (sh.y + 0.5) * CELL;
    ctx.save();
    if (!sh.used) {
      const t = Date.now() / 1200;
      const pulse = 0.7 + Math.sin(t * 2.5) * 0.3;
      ctx.shadowColor = '#2255ff'; ctx.shadowBlur = 18 * pulse;
      // altar base
      ctx.fillStyle = '#1a1a3a';
      ctx.fillRect(cx - CELL * 0.28, cy - CELL * 0.28, CELL * 0.56, CELL * 0.56);
      // gem
      ctx.fillStyle = `rgba(60,120,255,${pulse})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy - CELL * 0.18);
      ctx.lineTo(cx + CELL * 0.12, cy);
      ctx.lineTo(cx, cy + CELL * 0.18);
      ctx.lineTo(cx - CELL * 0.12, cy);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#88aaff'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      // used — dark cracked altar
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#111128';
      ctx.fillRect(cx - CELL * 0.25, cy - CELL * 0.25, CELL * 0.5, CELL * 0.5);
    }
    ctx.restore();
  });
}

function mkBloodStain(x, y) {
  const drops = [];
  // Central pool — large, dark
  drops.push({
    dx: (Math.random() - 0.5) * 0.08, dy: (Math.random() - 0.5) * 0.08,
    rx: 0.13 + Math.random() * 0.09, ry: 0.09 + Math.random() * 0.07,
    rot: Math.random() * Math.PI, a: 0.82, ci: 1
  });
  // Satellite drops — smaller, scattered
  const n = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 0.12 + Math.random() * 0.30;
    drops.push({
      dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist,
      rx: 0.03 + Math.random() * 0.08, ry: 0.02 + Math.random() * 0.06,
      rot: Math.random() * Math.PI, a: 0.40 + Math.random() * 0.45, ci: Math.floor(Math.random() * 3)
    });
  }
  return { x, y, drops };
}

function drawBloodStains() {
  if (!S.bloodStains) return;
  const COLS_B = ['#2e0000', '#5c0a00', '#7a1200'];
  S.bloodStains.forEach(b => {
    if (!S.fog?.[b.y]?.[b.x]) return;
    const cx = (b.x + 0.5) * CELL, cy = (b.y + 0.5) * CELL;
    ctx.save();
    b.drops.forEach(d => {
      ctx.globalAlpha = d.a * 0.85;
      ctx.fillStyle = COLS_B[d.ci] || COLS_B[0];
      ctx.beginPath();
      ctx.ellipse(cx + d.dx * CELL, cy + d.dy * CELL, d.rx * CELL, d.ry * CELL, d.rot, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  });
}

function drawChests() {
  if (!S.chests) return;
  S.chests.forEach(ch => {
    if (gameMode === 'adventure' && !isVisible(ch.x, ch.y) && !(S.fullMapRevealed && S.fog?.[ch.y]?.[ch.x])) return;
    const cx = (ch.x + 0.5) * CELL, cy = (ch.y + 0.5) * CELL;
    const w = CELL * 0.54, h = CELL * 0.4;
    ctx.save();
    if (ch.spawning && !ch.opening) {
      // ── Chest materialization animation ───────────────────────────
      const elapsed = performance.now() - ch.spawnStart;
      const SPAWN_DUR = 1500;
      const t = Math.min(1, elapsed / SPAWN_DUR);
      if (elapsed >= SPAWN_DUR) ch.spawning = false;
      const cc = '#00ffee';

      // Three staggered expanding rings (Removed as requested by user)

      // Vertical scan beam sweeping through chest area
      if (t < 0.65) {
        const scanT = t / 0.65;
        const beamY = (cy - CELL * 0.65) + scanT * CELL * 1.3;
        const beamAlpha = Math.sin(scanT * Math.PI) * 0.85;
        ctx.strokeStyle = `rgba(0,255,238,${beamAlpha.toFixed(2)})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = cc; ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(cx - CELL * 0.52, beamY);
        ctx.lineTo(cx + CELL * 0.52, beamY);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Chest flickers in starting at t=0.28
      if (t > 0.28) {
        const matT = (t - 0.28) / 0.72;
        let alpha;
        if (matT < 0.65) {
          // Flicker: randomly visible/invisible early on
          alpha = (Math.random() < 0.45 + matT * 0.55) ? matT * 0.9 : matT * 0.15;
        } else {
          alpha = 0.75 + matT * 0.25;
        }
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.shadowColor = cc;
        ctx.shadowBlur = 28 + (1 - matT) * 32;
        ctx.fillStyle = '#001e1e';
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
        ctx.strokeStyle = cc; ctx.lineWidth = 2.5;
        ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
        ctx.beginPath();
        ctx.moveTo(cx - w / 2, cy - h * 0.05);
        ctx.lineTo(cx + w / 2, cy - h * 0.05);
        ctx.stroke();
        ctx.fillStyle = cc; ctx.shadowBlur = 10;
        ctx.font = `${Math.round(h * 0.7)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('★', cx, cy + h * 0.1);
        ctx.globalAlpha = 1;
      }


    } else if (ch.opening && !ch.opened) {
      // ── Opening animation ─────────────────────────────────────
      const elapsed = performance.now() - ch.openStart;
      const progress = Math.min(1, elapsed / 720);
      const cc = ch.explorer ? '#00ffee' : '#ffaa00';
      const lidLift = Math.pow(progress, 0.6) * CELL * 1.1;
      const glow = 16 + progress * 44;

      ctx.shadowColor = cc; ctx.shadowBlur = glow;

      // Light beam shooting upward
      if (progress > 0.15) {
        const beamH = CELL * 3.5 * Math.pow(progress, 0.7);
        const beamA = Math.min(1, (progress - 0.15) / 0.25) * (1 - progress * 0.6);
        const grad = ctx.createLinearGradient(cx, cy - h * 0.1, cx, cy - h * 0.1 - beamH);
        grad.addColorStop(0, cc + 'bb');
        grad.addColorStop(1, cc + '00');
        ctx.globalAlpha = beamA;
        ctx.fillStyle = grad;
        ctx.fillRect(cx - w * 0.14, cy - h * 0.1 - beamH, w * 0.28, beamH);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = glow;
      }

      // Chest body (stays)
      ctx.fillStyle = ch.explorer ? '#001e1e' : '#2e1f00';
      ctx.fillRect(cx - w / 2, cy - h * 0.05, w, h * 0.55);
      ctx.strokeStyle = cc; ctx.lineWidth = 2;
      ctx.strokeRect(cx - w / 2, cy - h * 0.05, w, h * 0.55);

      // Chest lid (flies up + rotates slightly)
      ctx.save();
      ctx.translate(cx, cy - h * 0.05 - lidLift);
      ctx.rotate((progress - 0.5) * 0.18);
      ctx.fillStyle = ch.explorer ? '#002a2a' : '#3d2800';
      ctx.fillRect(-w / 2, -h * 0.45, w, h * 0.45);
      ctx.strokeStyle = cc; ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2, -h * 0.45, w, h * 0.45);
      ctx.restore();

      // Continuous particles flying out of chest
      if (progress < 0.88 && Math.random() < 0.55) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
        S.particles.push({
          x: cx + (Math.random() - 0.5) * w * 0.8,
          y: cy - h * 0.1,
          vx: Math.cos(ang) * (0.4 + Math.random() * 2.2),
          vy: Math.sin(ang) * (1.2 + Math.random() * 3.5),
          life: 1, decay: 0.035 + Math.random() * 0.04,
          r: 2 + Math.random() * 3.5, color: cc,
        });
      }

    } else if (!ch.opened) {
      const cc = ch.explorer ? '#00ffee' : '#ffaa00';
      const t = performance.now() / 1000;
      const pulse = ch.explorer ? (Math.sin(t * 3) * 0.5 + 0.5) : 0;
      ctx.shadowColor = cc; ctx.shadowBlur = 14 + pulse * 16;
      ctx.fillStyle = ch.explorer ? '#001e1e' : '#2e1f00';
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      ctx.strokeStyle = cc; ctx.lineWidth = ch.explorer ? 2.5 : 2;
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
      // lid line
      ctx.beginPath(); ctx.moveTo(cx - w / 2, cy - h * 0.05); ctx.lineTo(cx + w / 2, cy - h * 0.05); ctx.stroke();
      // lock / star
      ctx.fillStyle = cc; ctx.shadowBlur = 8;
      if (ch.explorer) {
        ctx.font = `${Math.round(h * 0.7)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('★', cx, cy + h * 0.1);
      } else {
        ctx.beginPath(); ctx.arc(cx, cy + h * 0.08, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#2e1f00';
      ctx.fillRect(cx - w / 2, cy, w, h * 0.5);
      ctx.strokeStyle = '#664400'; ctx.lineWidth = 1;
      ctx.strokeRect(cx - w / 2, cy, w, h * 0.5);
    }
    ctx.restore();
  });
}

function drawExit() {
  if (!S.exit || S.exit.used || gameMode !== 'adventure') return;
  if (!isVisible(S.exit.x, S.exit.y) && !S.fullMapRevealed) return;
  const cx = (S.exit.x + 0.5) * CELL, cy = (S.exit.y + 0.5) * CELL;
  const r = CELL * 0.36;
  const t = performance.now() / 1000;
  const pulse = Math.sin(t * 2.8) * 0.5 + 0.5;
  ctx.save();
  ctx.shadowColor = '#00ffaa'; ctx.shadowBlur = 12 + pulse * 14;
  // Outer ring
  ctx.strokeStyle = '#00ffaa'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  // Pulsing fill
  ctx.globalAlpha = 0.12 + pulse * 0.12;
  ctx.fillStyle = '#00ffaa';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  // Label
  ctx.shadowBlur = 8; ctx.fillStyle = '#00ffaa';
  ctx.font = `bold ${Math.round(CELL * 0.16)}px Courier New`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', cx, cy);
  // Floor number
  ctx.globalAlpha = 0.6; ctx.font = `${Math.round(CELL * 0.12)}px Courier New`;
  ctx.fillText(`F${S.floor || 1}→${(S.floor || 1) + 1}`, cx, cy + r + 7);
  ctx.restore();
}

function spawnLoot(x, y) {
  // One drop type max per kill — exclusive roll
  // 30% byte | 20% fragment | 10% xptoken | 40% nothing
  const roll = Math.random();
  if (roll < 0.30) S.loot.push({ x, y, type: 'byte', val: 1, collected: false, age: 0 });
  else if (roll < 0.50) S.loot.push({ x, y, type: 'fragment', val: 1, collected: false, age: 0 });
  else if (roll < 0.60) S.loot.push({ x, y, type: 'xptoken', val: 1, collected: false, age: 0 });
}

function checkFragmentCombine(x, y) {
  let assembled = 0;
  while ((S.fragments || 0) >= FRAG_PER_CHIP) {
    S.fragments -= FRAG_PER_CHIP;
    assembled++;
  }
  syncFragmentSlot();
  if (assembled > 0) {
    addToInventory('chip', 'common', assembled);
    spawnDmgNumber(x, y, `+${assembled} CHIP ASSEMBLED!`, '#00ffee', 20, 'crit');
    spawnHit(x, y, '#00ffee', 18);
    S.shake = Math.max(S.shake, 6);
    logEvent(`◆ CHIP${assembled > 1 ? `S x${assembled}` : ''} ASSEMBLED`, 'assembled');
  }
  updateInventoryUI();
}

function drawLoot() {
  if (!S.loot) return;
  const now = performance.now();
  S.loot.forEach(l => {
    if (l.collected) return;
    if (gameMode === 'adventure' && !isVisible(l.x, l.y) && !(S.fullMapRevealed && S.fog?.[l.y]?.[l.x])) return;
    const cx = (l.x + 0.5) * CELL, cy = (l.y + 0.5) * CELL;
    const float = Math.sin(now * 0.005) * 4;
    ctx.save();
    if (l.type === 'byte') {
      // BYTE drop — Mario-style spinning coin: squash X axis with cos to simulate 3D rotation
      const spinPhase = now * 0.004;
      const spinX = Math.abs(Math.cos(spinPhase)); // 0..1
      const coinR = 9;
      const xR = Math.max(0.8, coinR * spinX); // never fully flat so outline stays visible
      const yR = coinR;
      const bright = spinX > 0.5; // front face vs edge-on
      ctx.shadowColor = '#ffee00'; ctx.shadowBlur = 14;
      ctx.save();
      ctx.translate(cx, cy + float);
      // back-face darker shading
      ctx.fillStyle = bright ? '#ffcc00' : '#cc8800';
      ctx.beginPath(); ctx.ellipse(0, 0, xR, yR, 0, 0, Math.PI * 2); ctx.fill();
      // shine highlight on left side when facing front
      if (spinX > 0.3) {
        ctx.fillStyle = 'rgba(255,255,180,0.55)';
        ctx.beginPath(); ctx.ellipse(-xR * 0.28, -yR * 0.25, xR * 0.32, yR * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      }
      // rim outline
      ctx.strokeStyle = bright ? '#ffee00' : '#aa6600'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, xR, yR, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (l.type === 'fragment') {
      // Broken chip fragment — 3D spinning cracked shard
      const phase = l.x * 1.3 + l.y * 0.7;
      const t = now * 0.0016 + phase;
      const pulse = 0.75 + 0.25 * Math.sin(now * 0.006 + phase);
      ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 10 * pulse;
      ctx.save();
      ctx.translate(cx, cy + float);
      drawCubeFragment(ctx, 5, t, pulse);
      ctx.restore();
    } else if (l.type === 'xptoken') {
      // XP Token — 3D spinning pixel-art "XP" (same as inventory animation)
      const phase = l.x * 0.9 + l.y * 0.4;
      const angle = now * 0.0016 + phase;
      const cosA = Math.cos(angle);
      const isFront = cosA >= 0;
      const pulse = 0.7 + 0.3 * Math.sin(now * 0.0022 + phase);
      ctx.save();
      ctx.translate(cx, cy + float);
      ctx.scale(cosA, 1);
      if (isFront) {
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur = 10 * pulse;
        ctx.globalAlpha = 0.85 + 0.15 * pulse;
        drawXpPixelArt(ctx, 0, 0, 2, '#00ffcc');
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      } else {
        drawXpPixelArt(ctx, 0, 0, 2, '#003d2e');
      }
      ctx.restore();
    }
    ctx.restore();
  });
}

function updateEnergyHud() {
  const hud = document.getElementById('energy-hud');
  const fill = document.getElementById('energy-fill');
  const val = document.getElementById('energy-val');
  const floor = document.getElementById('energy-floor-lbl');
  const coins = document.getElementById('energy-coins');
  if (!hud) return;

  const effectiveMax = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);
  const pct = S.energy / effectiveMax;
  const isCrit = pct <= 0.15;
  const isLow = pct <= 0.30;
  const isMid = pct <= 0.60;

  if (fill) {
    fill.style.width = (pct * 100) + '%';
    fill.className = 'energy-fill ' +
      (isCrit ? 'nrg-crit' : isLow ? 'nrg-low' : isMid ? 'nrg-mid' : 'nrg-high');
  }
  if (val) {
    val.textContent = S.energy;
    val.style.color = isCrit || isLow ? 'var(--red)' : isMid ? '#ffaa00' : 'var(--cyan)';
    val.style.textShadow = isCrit || isLow ? '0 0 8px var(--red)' : isMid ? '0 0 8px #ffaa00' : '0 0 8px var(--cyan)';
  }
  hud.className = 'energy-hud' + (isLow ? ' nrg-danger' : '');
}

// ── Input ─────────────────────────────────────────────────────────
const KEYMAP = {
  KeyW: { team: 0, t: 'move', dx: 0, dy: -1 },
  KeyS: { team: 0, t: 'move', dx: 0, dy: 1 },
  KeyA: { team: 0, t: 'move', dx: -1, dy: 0 },
  KeyD: { team: 0, t: 'move', dx: 1, dy: 0 },
  Space: { team: 0, t: 'shoot' },
  ArrowUp: { team: 1, t: 'move', dx: 0, dy: -1 },
  ArrowDown: { team: 1, t: 'move', dx: 0, dy: 1 },
  ArrowLeft: { team: 1, t: 'move', dx: -1, dy: 0 },
  ArrowRight: { team: 1, t: 'move', dx: 1, dy: 0 },
  Enter: { team: 1, t: 'shoot' },
  NumpadEnter: { team: 1, t: 'shoot' },
  // P2 unit select (PvP)
  KeyU: { team: 1, t: 'select', idx: 0 },
  KeyI: { team: 1, t: 'select', idx: 1 },
  KeyO: { team: 1, t: 'select', idx: 2 },
};

const PREVENT_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']);

document.addEventListener('keydown', e => {
  if (PREVENT_KEYS.has(e.code)) e.preventDefault();
  if (S.pendingSlotPrize) return; // slot machine open — block all input

  // I — toggle inventory (works any time in adventure)
  if (e.code === 'KeyI' && gameMode === 'adventure') {
    window.toggleInventory();
    return;
  }
  if (S.inventoryOpen) return; // inventory open — block game input

  if (S.phase !== 'frozen') return;

  // Q — P1 weapon toggle, P — P2 weapon toggle (pvp only)
  if (e.code === 'KeyQ' || (e.code === 'KeyP' && gameMode === 'pvp')) {
    const team = e.code === 'KeyQ' ? 0 : 1;
    if (S.clockSide !== team) return;
    const unit = S.units.find(u => u.id === S.selectedId[team] && u.alive);
    if (unit && !isAdjacentToEnemy(unit)) {
      const cycle = ['bullet', 'laser', 'heavy', 'shotgun'];
      unit.weapon = cycle[(cycle.indexOf(unit.weapon || 'bullet') + 1) % cycle.length];
      updateSkillBar(team);
    }
    return;
  }

  const k = KEYMAP[e.code];
  if (!k) return;
  if (gameMode === 'pve' && k.team === 1) return;
  if (S.clockSide !== k.team) return;

  // Unit selection for P2 in PvP
  if (k.t === 'select') {
    const alive = S.units.filter(u => u.team === k.team && u.alive);
    if (alive[k.idx]) S.selectedId[k.team] = alive[k.idx].id;
    return;
  }

  if (S.pending[k.team] !== null) return;

  let unit = S.units.find(u => u.id === S.selectedId[k.team] && u.alive);
  if (!unit) {
    unit = S.units.find(u => u.team === k.team && u.alive);
    if (unit) S.selectedId[k.team] = unit.id;
    else return;
  }

  if (k.t === 'move') {
    const nx = unit.x + k.dx, ny = unit.y + k.dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
    if (S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) return;
    unit.facing = { dx: k.dx, dy: k.dy };
    S.pending[k.team] = { unitId: unit.id, t: 'move', dx: k.dx, dy: k.dy };
  } else {
    const wep = getCurrentWeapon(unit);
    if (wep === 'bullet' && unit.ammo <= 0) return;
    if (wep === 'laser' && unit.laserAmmo <= 0) return;
    if (wep === 'heavy' && unit.heavyAmmo <= 0) return;
    if (wep === 'shotgun' && unit.shotgunAmmo <= 0) return;
    S.pending[k.team] = { unitId: unit.id, t: 'shoot' };
  }

  setActionBadge(k.team, S.pending[k.team]);

  if (gameMode === 'adventure' && k.team === 0) {
    aiQueueAction(false); // Queue AI action without resolving tick yet
    resolveTick();
  } else if (gameMode === 'pve' && k.team === 0) {
    resolveTick();
  } else {
    if (!tickTimer) tickTimer = setTimeout(resolveTick, TICK_WINDOW);
  }
});

// ── Tick resolution ───────────────────────────────────────────────
function resolveTick() {
  tickTimer = null;
  if (S.phase !== 'frozen') return;
  if (!S.pending[0] && !S.pending[1]) return;

  SFX.tick();
  S.phase = 'ticking';
  S.tick++;
  stats.ticks++;

  S.units.forEach(u => {
    if (!u.trail) Object.assign(u, { trail: [{ x: u.x, y: u.y }, { x: u.x, y: u.y }] });
    if (u.x !== u.px || u.y !== u.py) {
      u.trail.unshift({ x: u.px, y: u.py });
      u.trail.pop();
    }
    u.px = u.x; u.py = u.y;
  });
  S.bullets.forEach(b => { b.px = b.x; b.py = b.y; });

  applyActions();
  S.pending = [null, null];
  setActionBadge(0, null); setActionBadge(1, null);

  // Adventure: enemy melee contact — hits hero once per tick when adjacent
  if (gameMode === 'adventure') {
    const hero = S.units.find(u => u.team === 0 && u.alive);
    if (hero) {
      S.units.forEach(enemy => {
        if (!enemy.alive || enemy.team !== 1) return;
        const dx = Math.abs(enemy.x - hero.x);
        const dy = Math.abs(enemy.y - hero.y);

        let canHit = (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0));

        // --- DATA WORM RULE: NO DIAGONAL MELEE ATTACKS ---
        if (enemy.utype === 'worm' && dx === 1 && dy === 1) {
          canHit = false;
        }

        if (canHit) {
          const isCrit = Math.random() < 0.15;
          const dmg = heroDmg(isCrit ? 2 : 1);
          S.energy = Math.max(0, S.energy - dmg);
          hero.hitFlash = 1; hero.hitTimer = 1000;
          SFX.heroHit();
          S.shake = Math.max(S.shake, isCrit ? 25 : 15); // INCREASED SHAKE (AAA FEEL)
          spawnDmgNumber(hero.x, hero.y, isCrit ? `-${dmg}!` : `-${dmg}`, isCrit ? '#ffe033' : '#ff2222', isCrit ? 22 : 16, isCrit ? 'crit' : 'normal');
          spawnMeleeEffect(enemy.x, enemy.y, hero.x - enemy.x, hero.y - enemy.y, enemy.color);
        }
      });
    }
  }

  // Adventure: energy, fog reveal, chests
  if (gameMode === 'adventure') {
    S.units.filter(u => u.team === 0 && u.alive).forEach(u => revealFog(u.x, u.y));
    // Move platforms grid-wise
    if (S.platforms) {
      S.platforms.forEach(p => {
        p.px = p.lx; p.py = p.ly;
        let nx = p.lx;
        let ny = p.ly;

        if (p.dir === 1) {
          if (p.lx < p.x2) nx += 1; else if (p.ly < p.y2) ny += 1; else p.dir = -1;
        } else {
          if (p.lx > p.x1) nx -= 1; else if (p.ly > p.y1) ny -= 1; else p.dir = 1;
        }

        // Patikrinam ar platformos naujoj vietoj yra koks nors unitas
        if (nx !== p.lx || ny !== p.ly) {
          const moveDx = nx - p.lx;
          const moveDy = ny - p.ly;

          S.units.forEach(u => {
            if (!u.alive) return;
            // Jei platforma užlipa ant unit'o
            if (u.x === nx && u.y === ny) {
              // Bandom nustumti unitą ta pačia kryptimi
              const pushX = u.x + moveDx;
              const pushY = u.y + moveDy;

              if (!isWall(pushX, pushY)) {
                // Sėkmingai nustumia
                u.x = pushX;
                u.y = pushY;
              } else {
                // Remiasi į sieną - TRAIŠKO!
                if (u.team === 0) {
                  S.energy = Math.max(0, S.energy - 1);
                  u.hitFlash = 1; u.hitTimer = 1000;
                  SFX.heroHit();
                  S.shake = Math.max(S.shake, 20);
                  spawnDmgNumber(u.x, u.y, '-1 CRUSH!', '#ff2222', 20, 'crit');
                  spawnMeleeEffect(u.x, u.y, 0, 0, '#ffffff');
                } else {
                  // Priešą sutraiško mirtinai
                  u.hp = 0; u.alive = false;
                  spawnDeath(u.x, u.y, u.color);
                  if (S.bloodStains) S.bloodStains.push(mkBloodStain(u.x, u.y));
                }
              }
            }
          });
        }

        p.lx = nx;
        p.ly = ny;
      });
    }

    S.chests && S.chests.forEach(ch => {
      if (!ch.opened && !ch.opening && !S.pendingSlotPrize) {
        const on = S.units.find(u => u.team === 0 && u.alive && u.x === ch.x && u.y === ch.y);
        if (on) {
          ch.opening = true;
          ch.openStart = performance.now();
          SFX.chestOpen(ch.explorer);
          spawnHit(ch.x, ch.y, ch.explorer ? '#00ffee' : '#ffaa00', 14);
          S.shake = Math.max(S.shake, 7);
          setTimeout(() => {
            ch.opened = true;
            openChestSlot(ch);
          }, 720);
        }
      }
    });
    // Shrine interaction
    S.shrines && S.shrines.forEach(sh => {
      if (sh.used) return;
      const hero = S.units.find(u => u.team === 0 && u.alive && u.x === sh.x && u.y === sh.y);
      if (hero) {
        sh.used = true;
        S.shake = Math.max(S.shake, 6);
      }
    });
    // Armory room logic removed because weapons use energy now 
    // Exit portal (Extraction Point)
    if (S.exit && !S.exit.used) {
      const onExit = S.units.find(u => u.team === 0 && u.alive && u.x === S.exit.x && u.y === S.exit.y);
      if (onExit) {
        S.exit.used = true;
        SFX.extraction();

        // Successful Extraction — next floor!
        Profile.cache += (S.bytes || 0);
        if (S.floor > Profile.highestSector) Profile.highestSector = S.floor;
        // Save full inventory (bytes carry over to next floor)
        Profile.inventory = (S.inventory || []).map(x => x ? { ...x } : null);
        saveProfile();

        setTimeout(() => {
          S.floor++;
          initAdventure(); // loads Profile.inventory automatically, derives S.bytes/fragments/xpTokens
          updateHUD();
          updateEnergyHud();
        }, 800);
      }
    }
    if (S.energy <= 0 && !S.winner && !S.pendingGameover) {
      S.energyDepleted = true; S.winner = 1; S.pendingGameover = true;
      // Stop BGM and play funeral jingle
      BGM.deathJingle();
      const _hero = S.units.find(u => u.team === 0 && u.alive);
      if (_hero) {
        _hero.isDying = true;
        _hero.deathStart = performance.now();
        S.shake = 28;
        _hero.hitFlash = 1;
        spawnHit(_hero.x, _hero.y, '#ff2222', 40);
        spawnDmgNumber(_hero.x, _hero.y, 'DEAD', '#ff3333', 30, 'crit');
      }
      setTimeout(() => {
        updateHubUI();
        document.getElementById('hub-overlay').classList.add('active');
        BGM.start('hub');
      }, 2800);
    }

    S.loot && S.loot.forEach(l => {
      if (!l.collected) {
        const on = S.units.find(u => u.team === 0 && u.alive && u.x === l.x && u.y === l.y);
        if (on) {
          l.collected = true;
          SFX.pickup();
          if (l.type === 'fragment') {
            S.fragments = (S.fragments || 0) + l.val;
            syncFragmentSlot();
            logEvent(`+${l.val} CHIP FRAGMENT${l.val > 1 ? 'S' : ''}`, 'fragment');
            spawnPickupFX(l.x, l.y, '#ff8800');
            spawnDmgNumber(l.x, l.y, `+${l.val} FRAG`, '#ffaa22', 14, 'normal');
            checkFragmentCombine(l.x, l.y);
          } else if (l.type === 'xptoken') {
            S.xpTokens = (S.xpTokens || 0) + l.val;
            syncXpTokenSlot();
            logEvent(`+${l.val} XP TOKEN`, 'xp');
            spawnPickupFX(l.x, l.y, '#00ffcc');
            spawnDmgNumber(l.x, l.y, `+${l.val} XP`, '#00ffcc', 14, 'normal');
          } else {
            S.bytes = (S.bytes || 0) + l.val;
            syncByteSlot();
            logEvent(`+${l.val} BYTE`, 'byte');
            spawnPickupFX(l.x, l.y, '#ffee00');
            spawnDmgNumber(l.x, l.y, `+${l.val} BYTE`, '#ffee00', 16, 'normal');
          }
        }
      }
    });
  }

  moveBullets();
  detectCollisions();
  // Spawn lingering light ghost for every bullet that just went inactive
  if (gameMode === 'adventure' && S.lightGhosts) {
    S.bullets.forEach(b => {
      if (!b.active && !b.ghosted) {
        b.ghosted = true;
        S.lightGhosts.push({ x: b.x, y: b.y, bornTick: S.tick, fadeBorn: null, fadeDur: ANIM_MS * 2 });
      }
    });
  }
  advanceLasers();
  ammoRegen();
  checkWin();
  autoSelectAlive();
  BGM.updateState();

  tickStart = performance.now();
  S.animT = 0;
  updateHUD();
  setTimeStatus('active');
}

function applyActions() {
  [0, 1].forEach(team => {
    const a = S.pending[team];
    if (!a) return;
    const unit = S.units.find(u => u.id === a.unitId);
    if (!unit || !unit.alive) return;

    if (a.t === 'move') {
      const nx = unit.x + a.dx, ny = unit.y + a.dy;
      if (!isWall(nx, ny)) {
        // Footstep trail — save old position before moving
        if (gameMode === 'adventure' && unit.team === 0) {
          if (S.footsteps) {
            S.footsteps.push({ x: unit.x, y: unit.y, alpha: 1.0 });
            if (S.footsteps.length > 12) S.footsteps.shift();
          }
          S.energy = Math.max(0, S.energy - 1);
          spawnDmgNumber(unit.x, unit.y, '-1⚡', '#00f5ff', 12, 'normal');
          S.nanoSteps = (S.nanoSteps || 0) + 1;
          const _nLvl = Profile.upgrades?.nanoLevel || 0;
          if (_nLvl >= 1 && S.nanoSteps % getNanoHealInterval(_nLvl) === 0) {
            const effectiveMax = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);
            if (S.energy < effectiveMax) {
              S.energy = Math.min(effectiveMax, S.energy + _nLvl);
              spawnDmgNumber(unit.x, unit.y, `+${_nLvl}⚡`, '#00ff88', 14, 'normal');
              SFX.nanoHeal();
            }
          }
        }
        unit.x = nx; unit.y = ny;
      }
    } else {
      const sd = (team === 0 && unit.aimDir) ? unit.aimDir : unit.facing;
      const wep = getCurrentWeapon(unit);
      stats.shots[team]++;
      unit.shootFlash = 1;
      spawnMuzzle(unit, sd);

      // Energijos mažinimas jei adventure mode (priklausomai nuo ginklo)
      let nrgObj = null;
      if (gameMode === 'adventure' && team === 0 && wep !== 'melee') {
        let nrgCost = 2;
        if (wep === 'laser') nrgCost = 7;
        if (wep === 'heavy' || wep === 'shotgun') nrgCost = 4;
        S.energy = Math.max(0, S.energy - nrgCost);
        // Atvaizduojame nubrauktą energiją ginklo šūviui vizualiai (greit asimiliuojasi)
        spawnDmgNumber(unit.x, unit.y, `-${nrgCost}⚡`, '#00f5ff', 14, 'normal');
      }

      if (wep === 'laser') {
        SFX.laser();
        unit.laserAmmo--;
        const cells = laserCells(unit.x, unit.y, sd.dx, sd.dy);
        S.lasers.push({
          id: Math.random(), owner: team, ox: unit.x, oy: unit.y,
          dx: sd.dx, dy: sd.dy, cells, chargeLeft: gameMode === 'adventure' ? 1 : 2, color: unit.color, active: true
        });
      } else if (wep === 'melee') {
        const mx = unit.x + sd.dx, my = unit.y + sd.dy;
        const hit = S.units.find(u => {
          if (!u.alive || u.team === team) return false;
          if (u.x === mx && u.y === my) return true;
          if (u.utype === 'worm' && u.trail) return u.trail.some(t => t.x === mx && t.y === my);
          return false;
        });
        spawnMeleeEffect(unit.x, unit.y, sd.dx, sd.dy, unit.color);
        if (hit) {
          const isCrit = Math.random() < getCritChance();
          const bonusMelee = (Profile.upgrades?.meleeDmg || 0) + (S.floorBuffs?.melee || 0);
          const dmg = (isCrit ? 2 : 1) + bonusMelee;
          stats.hits[team]++;
          const meleeHeroHit = gameMode === 'adventure' && hit.team === 0;
          spawnDmgNumber(hit.x, hit.y, isCrit ? `-${dmg}!` : `-${dmg}`, isCrit ? '#ffe033' : (meleeHeroHit ? '#ff2222' : '#ff22aa'), 22, isCrit ? 'crit' : 'normal');
          spawnHit(hit.x, hit.y, hit.color, 24);
          S.shake = Math.max(S.shake, 15);
          if (meleeHeroHit) {
            S.energy = Math.max(0, S.energy - heroDmg(dmg));
            logEvent(`SYSTEM DAMAGE: Hero took ${heroDmg(dmg)} DMG! (Melee)`, 'dmg');
            hit.hitFlash = 1; hit.hitTimer = 1000;
            SFX.heroHit();
          } else {
            hit.hp -= dmg; hit.hitFlash = 1;
            SFX.hit();
            if (gameMode === 'adventure') {
              logEvent(isCrit ? `CRIT [${getUtypeLabel(hit.utype)}]: -${dmg} HP` : `HIT [${getUtypeLabel(hit.utype)}]: -${dmg} HP`, isCrit ? 'crit' : 'info');
            }
            if (hit.hp <= 0) {
              hit.alive = false;
              spawnDeath(hit.x, hit.y, hit.color);
              if (gameMode === 'adventure') {
                logEvent(`Target <span style="color:#ffffff">💀</span> destroyed.`, 'warn');
                spawnLoot(hit.x, hit.y);
                if (S.bloodStains) S.bloodStains.push(mkBloodStain(hit.x, hit.y));
              }
            }
          }
        }
      } else if (wep === 'heavy') {
        unit.heavyAmmo--;
        const bx = unit.x + sd.dx, by = unit.y + sd.dy;
        const b = mkBullet(team, bx, by, unit.x, unit.y, sd.dx, sd.dy, unit.color, 2);
        if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS || isWall(bx, by)) b.active = false;
        S.bullets.push(b);
      } else if (wep === 'shotgun') {
        unit.shotgunAmmo--;
        const baseAngle = Math.atan2(sd.dy, sd.dx);
        const baseSector = Math.round(baseAngle / (Math.PI / 4));
        for (let off = -1; off <= 1; off++) {
          const a = (baseSector + off) * (Math.PI / 4);
          const sdx = Math.round(Math.cos(a)), sdy = Math.round(Math.sin(a));
          const bx = unit.x + sdx, by = unit.y + sdy;
          const b = mkBullet(team, bx, by, unit.x, unit.y, sdx, sdy, unit.color, 1, SHOTGUN_RANGE);
          b.spread = true;
          if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS) b.active = false;
          S.bullets.push(b);
        }
      } else {
        SFX.shoot();
        unit.ammo--;
        const bx = unit.x + sd.dx, by = unit.y + sd.dy;
        const b = mkBullet(team, bx, by, unit.x, unit.y, sd.dx, sd.dy, unit.color);
        if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS || isWall(bx, by)) b.active = false;
        S.bullets.push(b);
      }
    }
  });
}

function moveBullets() {
  S.bullets.forEach(b => {
    if (!b.active || b.newThisTick) return;
    b.px = b.x; b.py = b.y;
    const bSpd = 1;

    for (let i = 1; i <= bSpd; i++) {
      const nx = b.px + b.dx * i;
      const ny = b.py + b.dy * i;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) {
        b.active = false;
        spawnHit(nx, ny, b.color, 4);
        if (gameMode === 'adventure') spawnWallDust(nx, ny, b.dx, b.dy);
        break;
      }
      b.x = nx; b.y = ny;
    }

    b.cellsTraveled += bSpd;
    b.age++;
    if (b.active && b.maxRange > 0 && b.cellsTraveled >= b.maxRange) b.active = false;
  });
  S.bullets.forEach(b => { b.newThisTick = false; });
}

function detectCollisions() {
  // Bullet × unit (opposite team) — check both final and intermediate cell (2-cell jump)
  S.bullets.forEach(b => {
    if (!b.active) return;
    const moved = b.x !== b.px;
    const midX = b.px + b.dx, midY = b.py + b.dy;
    S.units.forEach(u => {
      if (!u.alive || b.owner === u.team) return;
      const hitFinal = b.x === u.x && b.y === u.y;   // kulka baigė kur figūra dabar
      const hitMid = moved && midX === u.x && midY === u.y;   // tarpinė = figūra dabar
      const hitPrev = b.x === u.px && b.y === u.py;  // kulka baigė kur figūra buvo
      const hitMidPrev = moved && midX === u.px && midY === u.py;  // tarpinė = figūra buvo
      let hitWormBody = false;
      if (u.utype === 'worm' && u.trail) {
        hitWormBody = u.trail.some(t =>
          (b.x === t.x && b.y === t.y) ||
          (moved && midX === t.x && midY === t.y) ||
          (b.px === t.x && b.py === t.y)
        );
      }
      if (hitFinal || hitMid || hitPrev || hitMidPrev || hitWormBody) {
        b.active = false;
        if (Math.random() < MISS_CHANCE) {
          const isHero = gameMode === 'adventure' && u.team === 0;
          logEvent(isHero ? `EVADED attack!` : `Shot missed!`, isHero ? 'loot' : 'warn');
          spawnDmgNumber(u.x, u.y, 'MISS', '#88bbff', 13, 'miss');
          spawnHit(u.x, u.y, '#88bbff', 5);
        } else {
          const heavy = (b.power || 1) >= 2;
          const isCrit = Math.random() < getCritChance();
          const dmg = isCrit ? 2 : 1;
          const bulletHeroHit = gameMode === 'adventure' && u.team === 0;
          const dColor = isCrit ? '#ffe033' : (bulletHeroHit ? '#ff2222' : (heavy ? '#ff9900' : '#ffffff'));
          const dSize = isCrit ? 22 : (heavy ? 20 : 16);
          stats.hits[b.owner]++;
          spawnDmgNumber(u.x, u.y, isCrit ? `-${dmg}!` : `-${dmg}`, dColor, dSize, isCrit ? 'crit' : 'normal');
          spawnHit(u.x, u.y, u.color, isCrit ? 22 : (heavy ? 18 : 12));
          S.shake = Math.max(S.shake, isCrit ? 14 : (heavy ? 12 : 9));
          if (gameMode === 'adventure' && u.team === 0) {
            S.energy = Math.max(0, S.energy - heroDmg(dmg));
            logEvent(`SYSTEM DAMAGE: Hero took ${heroDmg(dmg)} DMG!`, 'dmg');
            u.hitFlash = 1; u.hitTimer = 1000;
            SFX.heroHit();
          } else {
            u.hp -= dmg; u.hitFlash = 1;
            SFX.hit();
            if (gameMode === 'adventure') {
              logEvent(isCrit ? `CRIT [${getUtypeLabel(u.utype)}]: -${dmg} HP` : `HIT [${getUtypeLabel(u.utype)}]: -${dmg} HP`, isCrit ? 'crit' : 'info');
            }
            if (u.hp <= 0) {
              u.alive = false;
              spawnDeath(u.x, u.y, u.color);
              if (gameMode === 'adventure') {
                logEvent(`Target <span style="color:#ffffff">💀</span> destroyed.`, 'warn');
                spawnLoot(u.x, u.y);
                S.kills = (S.kills || 0) + 1;
                if (S.bloodStains) S.bloodStains.push(mkBloodStain(u.x, u.y));
              }
            }
          }
        }
      }
    });
  });

  // Bullet × bullet — check same cell, crossed swap, and intermediate overlaps
  for (let i = 0; i < S.bullets.length; i++) {
    for (let j = i + 1; j < S.bullets.length; j++) {
      const a = S.bullets[i], b = S.bullets[j];
      if (!a.active || !b.active) continue;
      const aMoved = a.age > 0 && a.x !== a.px;   // nauji bullet'ai (age=0) neskaitomi kaip pajudėję
      const bMoved = b.age > 0 && b.x !== b.px;
      const bothOld = a.age > 0 && b.age > 0;
      const sameDir = a.dx * b.dx + a.dy * b.dy > 0; // ta pati kryptis → neleidžia false-positive
      const aMidX = a.px + a.dx, aMidY = a.py + a.dy;
      const bMidX = b.px + b.dx, bMidY = b.py + b.dy;
      const same = a.x === b.x && a.y === b.y;
      const crossed = bothOld && a.x === b.px && a.y === b.py && a.px === b.x && a.py === b.y;
      const midSame = aMoved && bMoved && aMidX === bMidX && aMidY === bMidY;
      const aEndBMid = bMoved && a.x === bMidX && a.y === bMidY;
      const bEndAMid = aMoved && b.x === aMidX && b.y === aMidY;
      // Ghost-through fix: a.x kur b buvo (1-cell vs 2-cell, atstumas 1)
      const aLandedOnB = bothOld && !sameDir && a.x === b.px && a.y === b.py;
      const bLandedOnA = bothOld && !sameDir && b.x === a.px && b.y === a.py;
      // Weak vs Weak atstumas 1: aMidX kur b buvo
      const aMidOnBPrev = bothOld && !sameDir && aMidX === b.px && aMidY === b.py;
      const bMidOnAPrev = bothOld && !sameDir && bMidX === a.px && bMidY === a.py;
      if (same || crossed || midSame || aEndBMid || bEndAMid || aLandedOnB || bLandedOnA || aMidOnBPrev || bMidOnAPrev) {
        SFX.bulletClash();
        const aPow = a.power || 1, bPow = b.power || 1;
        if (aPow > bPow) {
          // Heavy absorbs light
          b.active = false;
          a.pierceLeft--;
          spawnHit(b.x, b.y, b.color, 8);
          if (a.pierceLeft < 0) {
            spawnBulletExplosion(a.x, a.y, a.color, b.color);
            S.shake = Math.max(S.shake, 14);
            a.active = false;
          }
        } else if (bPow > aPow) {
          // Heavy absorbs light
          a.active = false;
          b.pierceLeft--;
          spawnHit(a.x, a.y, a.color, 8);
          if (b.pierceLeft < 0) {
            spawnBulletExplosion(b.x, b.y, b.color, a.color);
            S.shake = Math.max(S.shake, 14);
            b.active = false;
          }
        } else {
          // Equal power — mutual explosion
          spawnBulletExplosion(a.x, a.y, a.color, b.color);
          S.shake = Math.max(S.shake, 14);
          a.active = false; b.active = false;
        }
      }
    }
  }

  // Unit × unit (any two in same cell → undo both)
  const alive = S.units.filter(u => u.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      if (alive[i].x === alive[j].x && alive[i].y === alive[j].y) {
        alive[i].x = alive[i].px; alive[i].y = alive[i].py;
        alive[j].x = alive[j].px; alive[j].y = alive[j].py;
      }
    }
  }
}

function ammoRegen() {
  S.units.forEach(u => {
    if (!u.alive) return;
    if (u.ammo < u.maxAmmo) {
      if (++u.ammoTick >= AMMO_REGEN) { u.ammo++; u.ammoTick = 0; }
    } else { u.ammoTick = 0; }
    if (u.laserAmmo < MAX_LASER) {
      if (++u.laserTick >= LASER_REGEN) { u.laserAmmo++; u.laserTick = 0; }
    } else { u.laserTick = 0; }
    if (u.heavyAmmo < MAX_HEAVY) {
      if (++u.heavyTick >= HEAVY_REGEN) { u.heavyAmmo++; u.heavyTick = 0; }
    } else { u.heavyTick = 0; }
    if (u.shotgunAmmo < MAX_SHOTGUN) {
      if (++u.shotgunTick >= SHOTGUN_REGEN) { u.shotgunAmmo++; u.shotgunTick = 0; }
    } else { u.shotgunTick = 0; }
  });
}

function checkWin() {
  if (S.winner) return;
  const t0 = S.units.some(u => u.team === 0 && u.alive);
  const t1 = S.units.some(u => u.team === 1 && u.alive);
  if (gameMode === 'adventure') {
    // death handled inline where energy hits 0
  } else {
    // PvP Game Over logic
    if (!t0 && !t1) {
      BGM.stinger('loss');
      S.winner = -1; S.pendingGameover = true;
    }
    else if (!t1) {
      BGM.stinger('win');
      SFX.win(); S.winner = 0; S.pendingGameover = true;
    }
    else if (!t0) {
      BGM.stinger('loss');
      S.winner = 1; S.pendingGameover = true;
    }
  }
}

function autoSelectAlive() {
  [0, 1].forEach(team => {
    const sel = S.units.find(u => u.id === S.selectedId[team]);
    if (!sel || !sel.alive) {
      const first = S.units.find(u => u.team === team && u.alive);
      if (first) S.selectedId[team] = first.id;
    }
  });
}

// ── Particles ─────────────────────────────────────────────────────
function spawnDmgNumber(gx, gy, text, color, size, type) {
  type = type || 'normal';
  const initScale = type === 'crit' ? 2.0 : type === 'miss' ? 1.1 : 1.4;

  // Normalūs žalos padarymo skaičiai: balti kai pataikome mes į juos, bet PAILKAME RAUDONUS kai mus nuskriaudžia
  if (type !== 'crit' && typeof text === 'string' && text.startsWith('-')) {
    // #ff2222 yra spalvos kodas padarytai žalai pačiam herojui. Jo nekeičiame.
    if (color !== '#ff2222') {
      color = '#ffffff';
    }
  }

  const obj = {
    x: (gx + 0.5) * CELL + (Math.random() - 0.5) * CELL * 0.5,
    y: (gy + 0.5) * CELL - CELL * 0.15 + (Math.random() - 0.5) * CELL * 0.4,
    vx: (Math.random() - 0.5) * 4.0, // Random horizontal drift
    vy: type === 'miss' ? -0.8 - Math.random() * 0.6 : -1.5 - Math.random() * 1.5,
    decay: type === 'fast' ? 0.05 + Math.random() * 0.015 : (type === 'miss' ? 0.02 + Math.random() * 0.015 : 0.01 + Math.random() * 0.012),
    text, color, size: size || 20,
    life: 1,
    scale: initScale, type,
  };
  S.dmgNumbers.push(obj);
  return obj;
}

function laserCells(ox, oy, dx, dy) {
  const cells = [];
  let x = ox + dx, y = oy + dy, count = 0;
  while (x >= 0 && x < COLS && y >= 0 && y < ROWS && count < 7) {
    if (isWall(x, y)) break;
    cells.push({ x, y }); x += dx; y += dy; count++;
  }
  return cells;
}

function advanceLasers() {
  S.lasers.forEach(laser => {
    if (!laser.active) return;
    laser.chargeLeft--;
    if (laser.chargeLeft <= 0) {
      for (const cell of laser.cells) {
        const hit = S.units.find(u => {
          if (!u.alive || u.team === laser.owner) return false;
          if (u.x === cell.x && u.y === cell.y) return true;
          if (u.utype === 'worm' && u.trail) return u.trail.some(t => t.x === cell.x && t.y === cell.y);
          return false;
        });
        if (hit) {
          if (Math.random() < MISS_CHANCE) {
            const isHero = gameMode === 'adventure' && hit.team === 0;
            logEvent(isHero ? `EVADED laser attack!` : `Laser missed!`, isHero ? 'loot' : 'warn');
            spawnDmgNumber(hit.x, hit.y, 'MISS', '#88bbff', 13, 'miss');
            spawnHit(hit.x, hit.y, '#88bbff', 5);
          } else {
            const isCrit = Math.random() < getCritChance();
            const dmg = isCrit ? CRIT_DMG : 1;
            stats.hits[laser.owner]++;
            const laserHeroHit = gameMode === 'adventure' && hit.team === 0;
            spawnDmgNumber(hit.x, hit.y, isCrit ? `-${dmg}!` : `-${dmg}`,
              isCrit ? '#ffe033' : (laserHeroHit ? '#ff2222' : '#ffffff'), isCrit ? 22 : 16, isCrit ? 'crit' : 'normal');
            spawnHit(hit.x, hit.y, hit.color, isCrit ? 22 : 14);
            S.shake = Math.max(S.shake, isCrit ? 14 : 12);
            if (laserHeroHit) {
              S.energy = Math.max(0, S.energy - heroDmg(dmg));
              logEvent(`SYSTEM DAMAGE (LASER): Hero took ${heroDmg(dmg)} DMG!`, 'dmg');
              hit.hitFlash = 1; hit.hitTimer = 1000;
              SFX.heroHit();
            } else {
              hit.hp -= dmg; hit.hitFlash = 1;
              SFX.hit();
              if (gameMode === 'adventure') {
                logEvent(isCrit ? `CRIT [${getUtypeLabel(hit.utype)}]: -${dmg} HP` : `HIT [${getUtypeLabel(hit.utype)}]: -${dmg} HP`, isCrit ? 'crit' : 'info');
              }
              if (hit.hp <= 0) {
                hit.alive = false;
                spawnDeath(hit.x, hit.y, hit.color);
                if (gameMode === 'adventure') {
                  logEvent(`Target <span style="color:#ffffff">💀</span> melted.`, 'warn');
                  spawnLoot(hit.x, hit.y);
                }
              }
            }
          }
          // Lazeris sustoja ties šiuo pataikymu, kirsti toliau (kiaurai) nebegali
          laser.cells.length = laser.cells.indexOf(cell) + 1;
          break;
        }
      }
      // Wall dust if laser beam ended at a wall/pillar
      if (gameMode === 'adventure' && laser.cells.length > 0) {
        const last = laser.cells[laser.cells.length - 1];
        const wx = last.x + laser.dx, wy = last.y + laser.dy;
        if (isWall(wx, wy)) spawnWallDust(wx, wy, laser.dx, laser.dy);
      }
      spawnLaserFire(laser);

      if (gameMode === 'adventure') {
        if (!S.lightGhosts) S.lightGhosts = [];
        for (const cell of laser.cells) {
          S.lightGhosts.push({
            x: cell.x, y: cell.y,
            bornTime: performance.now(),
            holdMs: 3000,
            fadeDur: 3000,
            r: 1.5, // Sumažintas spindulys, kad nebūtų toks ryškus „debesis“
            alpha: 0.15,
            color: laser.color
          });
        }
      }

      // Pradėti šūvio pasiliekamąjį efektą (nebe aktyvus logikoje, bet lieka vizualiai)
      laser.active = false;
      laser.firing = true;
      laser.fireTimer = 0.4; // 0.4 sec trumpas žybsnis pačiai spindulio linijai
    }
  });
}

function spawnMeleeEffect(ux, uy, dx, dy, color) {
  S.meleeStrikes.push({ ux, uy, dx, dy, color });
  const cx = (ux + 0.5 + dx * 0.4) * CELL, cy = (uy + 0.5 + dy * 0.4) * CELL;
  const angle = Math.atan2(dy, dx);
  for (let i = 0; i < 12; i++) {
    const a = angle + (Math.random() - 0.5) * 1.5;
    const s = (2 + Math.random() * 4) * CELL * 0.03;
    S.particles.push({
      x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, decay: 0.06 + Math.random() * 0.08, r: 2 + Math.random() * 4, color: '#ffffff'
    });
  }
}

function spawnLaserFire(laser) {
  const step = Math.max(1, Math.floor(laser.cells.length / 6));
  laser.cells.forEach((cell, i) => {
    const wx = (cell.x + 0.5) * CELL, wy = (cell.y + 0.5) * CELL;
    for (let j = 0; j < 5; j++) {
      const a = Math.PI * 2 * Math.random();
      const s = (0.5 + Math.random() * 2.5) * CELL * 0.02;
      S.particles.push({
        x: wx, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, decay: 0.05 + Math.random() * 0.07, r: 2 + Math.random() * 5, color: laser.color
      });
    }
    if (i % step === 0) {
      S.particles.push({
        x: wx, y: wy, vx: 0, vy: 0,
        life: 1, decay: 0.09 + Math.random() * 0.08, r: CELL * 0.48, color: laser.color, type: 'ring'
      });
    }
  });
}

function spawnMuzzle(unit, dir) {
  const d = dir || unit.facing;
  const wx = (unit.x + 0.5) * CELL, wy = (unit.y + 0.5) * CELL;
  for (let i = 0; i < 6; i++) {
    const sp = (Math.random() - 0.5) * 1.4;
    const v = (0.6 + Math.random()) * CELL * 0.022;
    S.particles.push({
      x: wx + d.dx * CELL * 0.35, y: wy + d.dy * CELL * 0.35,
      vx: d.dx * v + sp * CELL * 0.018, vy: d.dy * v + sp * CELL * 0.018,
      life: 1, decay: 0.09 + Math.random() * 0.07,
      r: 2 + Math.random() * 2.5, color: unit.color,
    });
  }
}

function spawnPickupFX(gx, gy, color) {
  const wx = (gx + 0.5) * CELL, wy = (gy + 0.5) * CELL;
  // expanding shockwave ring — large enough to clearly see
  S.particles.push({ x: wx, y: wy, vx: 0, vy: 0, life: 1, decay: 0.028, r: CELL * 2.4, color, type: 'ring' });
  // second tighter ring for depth
  S.particles.push({ x: wx, y: wy, vx: 0, vy: 0, life: 1, decay: 0.045, r: CELL * 1.2, color, type: 'ring' });
  // sparks burst
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * 2 * (i / 12) + (Math.random() - 0.5) * 0.4;
    const s = (2.5 + Math.random() * 3.5) * CELL * 0.022;
    S.particles.push({
      x: wx, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, decay: 0.02 + Math.random() * 0.02, r: 2 + Math.random() * 3, color, type: 'streak'
    });
  }
}

function spawnHit(gx, gy, color, n) {
  SFX.hit();
  const wx = (gx + 0.5) * CELL, wy = (gy + 0.5) * CELL;
  // Impact shockwave (slower decay for longer animation)
  S.particles.push({ x: wx, y: wy, vx: 0, vy: 0, life: 1, decay: 0.04, r: CELL * 0.7, color: color, type: 'ring' });

  for (let i = 0; i < n; i++) {
    const a = Math.PI * 2 * Math.random();
    const s = (1.2 + Math.random() * 2.8) * CELL * 0.022; // Slightly lower speed
    S.particles.push({
      x: wx, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, decay: 0.015 + Math.random() * 0.020, r: 2 + Math.random() * 3, color, type: 'streak'
    });
  }
}

function spawnWallDust(gx, gy, dx, dy) {
  const cgx = Math.max(0, Math.min(COLS - 1, gx));
  const cgy = Math.max(0, Math.min(ROWS - 1, gy));
  // Impact face: slightly back from wall surface toward shooter
  const wx = (cgx + 0.5) * CELL - dx * CELL * 0.42;
  const wy = (cgy + 0.5) * CELL - dy * CELL * 0.42;
  const dustColors = ['#7a3020', '#9a4a30', '#c07050', '#5a2018', '#b86040', '#8a5038'];

  // A small dusty shockwave ring
  S.particles.push({ x: wx, y: wy, vx: 0, vy: 0, life: 1, decay: 0.05, r: CELL * 0.55, color: '#9a4a30', type: 'ring' });

  // Big brick chunks that fly out
  for (let i = 0; i < 8; i++) {
    const a = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * Math.PI * 1.6;
    const s = (1.5 + Math.random() * 3.5) * CELL * 0.022;
    S.particles.push({
      x: wx, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, decay: 0.015 + Math.random() * 0.025,
      r: 3 + Math.random() * 5,
      color: dustColors[Math.floor(Math.random() * dustColors.length)],
      type: 'chunk'
    });
  }

  // Smaller dust streaks
  for (let i = 0; i < 10; i++) {
    const a = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * Math.PI * 1.8;
    const s = (0.5 + Math.random() * 2.0) * CELL * 0.022;
    S.particles.push({
      x: wx, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, decay: 0.02 + Math.random() * 0.03,
      r: 1.5 + Math.random() * 2,
      color: dustColors[Math.floor(Math.random() * dustColors.length)],
      type: 'streak'
    });
  }
}

function spawnBulletExplosion(gx, gy, colorA, colorB) {
  const wx = (gx + 0.5) * CELL, wy = (gy + 0.5) * CELL;
  // Expanding shockwave rings (slower decay)
  [[colorA, 0.015, 1.4], [colorB, 0.012, 1.7], ['#ffffff', 0.022, 1.0]].forEach(([col, decay, rMul]) => {
    S.particles.push({ x: wx, y: wy, vx: 0, vy: 0, life: 1, decay, r: CELL * rMul, color: col, type: 'ring' });
  });
  // Core flash ring (slower decay)
  S.particles.push({ x: wx, y: wy, vx: 0, vy: 0, life: 1, decay: 0.05, r: CELL * 0.7, color: '#ffffff', type: 'ring' });
  // Dynamic Sparks as streaks (slower decay)
  for (let i = 0; i < 35; i++) {
    const a = Math.PI * 2 * Math.random();
    const s = (1.5 + Math.random() * 3.5) * CELL * 0.022;
    const col = i % 2 === 0 ? colorA : colorB;
    S.particles.push({
      x: wx, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, decay: 0.010 + Math.random() * 0.015, r: 2 + Math.random() * 4, color: col, type: 'streak'
    });
  }
  // Bright white center sparks (slower decay)
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * 2 * Math.random();
    const s = (0.8 + Math.random() * 2.0) * CELL * 0.022;
    S.particles.push({
      x: wx, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, decay: 0.025 + Math.random() * 0.025, r: 2.5 + Math.random() * 3, color: '#ffffff', type: 'streak'
    });
  }
}

function spawnDeath(gx, gy, color) {
  SFX.death();
  const wx = (gx + 0.5) * CELL, wy = (gy + 0.5) * CELL;

  if (gameMode === 'adventure') {
    if (!S.lightGhosts) S.lightGhosts = [];
    S.lightGhosts.push({
      x: gx, y: gy,
      bornTime: performance.now(),
      holdMs: 3000,
      fadeDur: 3000,
      r: 3.0,       // Apšviečia plotą (spindulys užpildys minimum 5x5 vienetų kvadratą)
      alpha: 0.35,  // Matomas neoninis šviesos vainikas
      color: color
    });
  }

  // Pixel shatter effect
  const numPixels = 64;
  for (let i = 0; i < numPixels; i++) {
    const a = Math.PI * 2 * Math.random();
    // Varies speed to create a scattering cloud
    const s = (0.4 + Math.random() * 3.5) * CELL * 0.02;
    S.particles.push({
      x: wx + (Math.random() - 0.5) * (CELL * 0.4),
      y: wy + (Math.random() - 0.5) * (CELL * 0.4),
      vx: Math.cos(a) * s * 1.5,
      vy: Math.sin(a) * s * 1.5,
      life: 1,
      decay: 0.015 + Math.random() * 0.025,
      r: 3 + Math.random() * 5, // size of the pixel block
      color: Math.random() < 0.25 ? '#ffffff' : color,
      type: 'pixel'
    });
  }
}

// ── Render loop ───────────────────────────────────────────────────
function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;

  // Advance animation
  if (S.phase === 'ticking' && tickStart !== null) {
    S.animT = Math.min(1, (now - tickStart) / ANIM_MS);
    const tU = easeOutBack(S.animT);
    const tB = easeOutCubic(S.animT);
    S.units.forEach(u => { u.rx = u.px + (u.x - u.px) * tU; u.ry = u.py + (u.y - u.py) * tU; });
    S.bullets.forEach(b => { b.rx = b.px + (b.x - b.px) * tB; b.ry = b.py + (b.y - b.py) * tB; });
    if (S.platforms) S.platforms.forEach(p => { p.rx = p.px + (p.lx - p.px) * tU; p.ry = p.py + (p.ly - p.py) * tU; });

    if (S.animT >= 1) {
      tickStart = null;
      S.bullets = S.bullets.filter(b => {
        if (b.active) return true;
        if (b.deadTicks === undefined) b.deadTicks = 0;
        else b.deadTicks++;
        return b.deadTicks < 2;
      });
      S.meleeStrikes = [];
      if (gameMode !== 'adventure') S.clockSide = 1 - S.clockSide;
      if (S.pendingGameover) { S.phase = 'gameover'; if (gameMode !== 'adventure') setTimeout(showGameOver, 500); }
      else {
        S.phase = 'frozen'; setTimeStatus('frozen');
        if (gameMode === 'pve' && S.clockSide === 1) {
          startAIThinking();
          setTimeout(aiQueueAction, 1000 + Math.random() * 4000);
        }
      }
    }
  }

  // Chess clock — tik vienas laikrodis eina vienu metu (ne adventure)
  if (gameMode !== 'adventure' && S.phase === 'frozen' && !S.pendingGameover) {
    const side = S.clockSide;
    S.clock[side] = Math.max(0, S.clock[side] - dt);
    if (S.clock[side] === 0) {
      S.winner = 1 - side;
      S.timeForfeited = side;
      S.phase = 'gameover';
      setTimeout(showGameOver, 300);
    }
  }
  updateClockDisplay();

  // Decay
  S.units.forEach(u => {
    if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - dt * 0.006);
    if (u.hitTimer > 0) u.hitTimer = Math.max(0, u.hitTimer - dt);
    if (u.shootFlash > 0) u.shootFlash = Math.max(0, u.shootFlash - dt * 0.009);
    if (u.collectFlash > 0) u.collectFlash = Math.max(0, u.collectFlash - dt * 0.004);
    if (!u.alive && u.deathT > 0) u.deathT = Math.max(0, u.deathT - dt * 0.0035);
  });
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 0.07);

  S.particles = S.particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vx *= 0.91; p.vy *= 0.91; p.life -= p.decay;
    return p.life > 0;
  });
  if (S.footsteps) S.footsteps.forEach(f => { f.alpha = Math.max(0, f.alpha - dt * 0.004); });

  S.dmgNumbers = S.dmgNumbers.filter(n => {
    n.x += n.vx;
    n.y += n.vy;
    n.vx *= 0.90; // horizontal friction
    n.vy *= 0.88; // vertical friction
    n.life -= n.decay; // individual decay rate
    n.scale = Math.max(1.0, n.scale - (n.type === 'crit' ? 0.09 : 0.13));
    return n.life > 0;
  });

  S.lasers = S.lasers.filter(l => {
    if (l.active) return true;
    if (l.firing) {
      l.fireTimer -= dt / 1000;
      if (l.fireTimer <= 0) return false;
      return true;
    }
    return false;
  });

  // Draw
  ctx.save();
  if (S.shake > 0.3) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
  clearCanvas();
  if (gameMode === 'adventure' && S.cam) {
    updateCamera();
    ctx.translate(-S.cam.x, -S.cam.y);
  }
  if (gameMode === 'adventure') drawDungeon(); else drawBoard();
  drawLasers();
  drawMeleeStrikes();
  drawShootPreview();
  drawShadows();
  drawAimIndicators();
  drawBullets();
  drawBloodStains();
  drawFootsteps();
  drawParticles();
  drawThreatIndicators();
  drawShrines();
  drawChests();
  drawExit();
  drawLoot();
  drawUnits();
  drawFog();
  drawDmgNumbers();
  ctx.restore();
  // Screen-space overlays (no camera transform)
  if (gameMode === 'adventure') {
    drawAdvHUD();
    drawWeaponHUD();
  }
  drawScanlines();
}

function updateCamera() {
  const hero = S.units.find(u => u.team === 0 && u.alive);
  if (!hero) return;
  const vpW = advCanvasW, vpH = ADV_CANVAS_H;
  const mapW = COLS * CELL, mapH = ROWS * CELL;
  const hx = (hero.px ?? hero.x) * CELL + CELL * 0.5;
  const hy = (hero.py ?? hero.y) * CELL + CELL * 0.5;

  const margin = 5 * CELL;

  // Dead zone: camera starts moving only when hero approaches viewport edge
  let tx = S.cam.tx ?? S.cam.x;
  let ty = S.cam.ty ?? S.cam.y;
  const heroSX = hx - tx;
  const heroSY = hy - ty;
  if (heroSX < margin) tx = hx - margin;
  if (heroSX > vpW - margin) tx = hx - (vpW - margin);
  if (heroSY < margin) ty = hy - margin;
  if (heroSY > vpH - margin) ty = hy - (vpH - margin);

  tx = Math.max(0, Math.min(mapW - vpW, tx));
  ty = Math.max(0, Math.min(mapH - vpH, ty));
  // Jei žemėlapis mažesnis negu kamera, priverstinai išlaikom jį centre
  if (mapW < vpW) tx = -(vpW - mapW) / 2;
  if (mapH < vpH) ty = -(vpH - mapH) / 2;

  S.cam.tx = tx;
  S.cam.ty = ty;

  // Smooth lerp toward target
  S.cam.x += (tx - S.cam.x) * 0.14;
  S.cam.y += (ty - S.cam.y) * 0.14;
  if (Math.abs(S.cam.x - tx) < 0.5) S.cam.x = tx;
  if (Math.abs(S.cam.y - ty) < 0.5) S.cam.y = ty;
}

function clearCanvas() {
  ctx.fillStyle = '#05050e';
  const canvasH = gameMode === 'adventure' ? ADV_CANVAS_H : BOARD_H;
  ctx.fillRect(0, 0, advCanvasW, canvasH);
}

function drawLasers() {
  const now = performance.now();
  S.lasers.forEach(laser => {
    if (!laser.cells.length) return;

    // Jeigu jau iššautas, jis blanksta. Jei dar kraunasi, jis ryškėja ir dreba.
    let pulse, progress, intensity;

    if (laser.firing) {
      pulse = (Math.sin(now * 0.05) + 1) * 0.5;
      progress = 1.0;
      intensity = (laser.fireTimer / 0.4); // Fades from 1 to 0 over 0.4 sec
    } else {
      pulse = (Math.sin(now * 0.015) + 1) * 0.5;
      progress = Math.max(0, (2 - laser.chargeLeft) / 2);
      intensity = 0.2 + progress * 0.5 + pulse * 0.3;
    }

    // (Blinking squares and crosshairs removed per user request)
    const sx = (laser.ox + 0.5) * CELL, sy = (laser.oy + 0.5) * CELL;
    const last = laser.cells[laser.cells.length - 1];
    const ex = (last.x + 0.5) * CELL, ey = (last.y + 0.5) * CELL;

    ctx.save();
    // Translate and rotate to align x-axis with beam
    const angle = Math.atan2(ey - sy, ex - sx);
    const dist = Math.hypot(ey - sy, ex - sx);
    ctx.translate(sx, sy);
    ctx.rotate(angle);

    // Unstable electrical/plasma thick beam
    ctx.globalAlpha = intensity;
    ctx.shadowColor = laser.color; ctx.shadowBlur = 25;
    ctx.fillStyle = laser.color;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    const segments = Math.max(5, Math.floor(dist / 14));

    // Draw top half of jitter
    for (let i = 1; i < segments; i++) {
      const segX = (i / segments) * dist;
      const jitterY = (Math.random() - 0.5) * (6 + progress * 14);
      ctx.lineTo(segX, jitterY);
    }
    ctx.lineTo(dist, 0);

    // Draw bottom half of jitter returning
    for (let i = segments - 1; i > 0; i--) {
      const segX = (i / segments) * dist;
      const jitterY = (Math.random() - 0.5) * (6 + progress * 14);
      ctx.lineTo(segX, jitterY);
    }
    ctx.closePath();
    ctx.fill();

    // Hot central core line
    ctx.globalAlpha = 0.7 + progress * 0.3;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 + progress * 3 + Math.random() * 2;
    ctx.shadowBlur = 10;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dist, 0); ctx.stroke();

    // Source gathering particles (tik kraunantis)
    if (!laser.firing) {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = laser.color;
      for (let p = 0; p < (4 + progress * 4); p++) {
        const px = (Math.random() - 0.5) * 20;
        const py = (Math.random() - 0.5) * 20;
        ctx.beginPath(); ctx.arc(px, py, Math.random() * 2 + 0.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // Projected text tracking endpoint (nerodomas kai jau šauna)
    if (!laser.firing) {
      ctx.save();
      ctx.globalAlpha = 0.9 + pulse * 0.1;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = laser.color; ctx.shadowBlur = 18;
      ctx.font = `bold ${Math.round(CELL * 0.45)}px Courier New`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`[ ${laser.chargeLeft} ]`, ex, ey - CELL * 0.4);
      ctx.restore();
    }
  });
}

function drawBoard() {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? CELL_DARK : CELL_LIGHT;
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  ctx.strokeStyle = GRID_COLOR; ctx.lineWidth = 1;
  for (let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, BOARD_H); ctx.stroke(); }
  for (let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(BOARD_W, j * CELL); ctx.stroke(); }
  ctx.strokeStyle = '#1e1e3e'; ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, BOARD_W, BOARD_H);
}


function drawShadows() {
  S.units.forEach(u => {
    if (S.phase === 'frozen' && S.clockSide !== u.team) return;
    const a = u.alive ? 0.13 : u.deathT * 0.13;
    if (a < 0.01) return;
    const cx = (u.rx + 0.5) * CELL, cy = (u.ry + 0.5) * CELL;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, CELL * 0.8);
    g.addColorStop(0, hexAlpha(u.color, a)); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.8, 0, Math.PI * 2); ctx.fill();
  });
}

// ── Shoot trajectory preview ──────────────────────────────────────
function drawShootPreview() {
  if (S.phase !== 'frozen' || S.clockSide !== 0) return;
  const unit = S.units.find(u => u.id === S.selectedId[0] && u.alive);
  if (!unit || S.pending[0] !== null) return;
  const wep = unit.weapon || 'bullet';
  if (wep === 'bullet' && unit.ammo <= 0) return;
  if (wep === 'laser' && unit.laserAmmo <= 0) return;
  if (wep === 'heavy' && unit.heavyAmmo <= 0) return;
  if (wep === 'shotgun' && unit.shotgunAmmo <= 0) return;
  const aimD = unit.aimDir || unit.facing;
  const now = performance.now();
  if (wep === 'shotgun') {
    const base = Math.round(Math.atan2(aimD.dy, aimD.dx) / (Math.PI / 4));
    for (let off = -1; off <= 1; off++) {
      const a = (base + off) * (Math.PI / 4);
      traceShot(unit, Math.round(Math.cos(a)), Math.round(Math.sin(a)), unit.color, SHOTGUN_RANGE, now);
    }
  } else if (wep === 'laser') {
    traceLaserPreview(unit, laserCells(unit.x, unit.y, aimD.dx, aimD.dy), unit.color, now);
  } else {
    traceShot(unit, aimD.dx, aimD.dy, unit.color, 0, now);
  }
}

function traceShot(unit, dx, dy, color, maxRange, now) {
  const cells = []; let hitUnit = null;
  let x = unit.x + dx, y = unit.y + dy;
  const limit = maxRange > 0 ? maxRange : COLS + ROWS;
  for (let i = 0; i < limit; i++) {
    if (isWall(x, y)) break;
    cells.push({ x, y });
    const e = S.units.find(u => u.alive && u.team !== unit.team && u.x === x && u.y === y);
    if (e) { hitUnit = e; break; }
    x += dx; y += dy;
  }
  if (!cells.length) return;
  const pulse = (Math.sin(now * 0.007) + 1) * 0.5;
  ctx.save();
  ctx.setLineDash([5, 9]);
  ctx.lineDashOffset = -(now * 0.05 % 14);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.2 + pulse * 0.12;
  ctx.shadowColor = color; ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.moveTo((unit.x + 0.5) * CELL, (unit.y + 0.5) * CELL);
  cells.forEach(c => ctx.lineTo((c.x + 0.5) * CELL, (c.y + 0.5) * CELL));
  ctx.stroke();
  ctx.setLineDash([]);
  if (hitUnit) {
    ctx.globalAlpha = 0.1 + pulse * 0.07;
    ctx.fillStyle = color;
    ctx.fillRect(hitUnit.x * CELL, hitUnit.y * CELL, CELL, CELL);
    ctx.globalAlpha = 0.5 + pulse * 0.38;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowBlur = 16;
    const lx = (hitUnit.x + 0.5) * CELL, ly = (hitUnit.y + 0.5) * CELL, d = CELL * 0.27;
    ctx.beginPath();
    ctx.moveTo(lx - d, ly - d); ctx.lineTo(lx + d, ly + d);
    ctx.moveTo(lx + d, ly - d); ctx.lineTo(lx - d, ly + d);
    ctx.stroke();
  } else {
    const last = cells[cells.length - 1];
    ctx.globalAlpha = 0.35 + pulse * 0.25;
    ctx.fillStyle = color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc((last.x + 0.5) * CELL, (last.y + 0.5) * CELL, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function traceLaserPreview(unit, cells, color, now) {
  if (!cells.length) return;
  const pulse = (Math.sin(now * 0.007) + 1) * 0.5;
  const hitUnit = S.units.find(u => u.alive && u.team !== unit.team && cells.some(c => c.x === u.x && c.y === u.y));
  ctx.save();
  cells.forEach(c => {
    ctx.globalAlpha = 0.05 + pulse * 0.04;
    ctx.fillStyle = color;
    ctx.fillRect(c.x * CELL, c.y * CELL, CELL, CELL);
  });
  const last = cells[cells.length - 1];
  ctx.setLineDash([5, 9]);
  ctx.lineDashOffset = -(now * 0.05 % 14);
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.globalAlpha = 0.25 + pulse * 0.14;
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo((unit.x + 0.5) * CELL, (unit.y + 0.5) * CELL);
  ctx.lineTo((last.x + 0.5) * CELL, (last.y + 0.5) * CELL);
  ctx.stroke();
  ctx.setLineDash([]);
  if (hitUnit) {
    ctx.globalAlpha = 0.1 + pulse * 0.07;
    ctx.fillStyle = color;
    ctx.fillRect(hitUnit.x * CELL, hitUnit.y * CELL, CELL, CELL);
    ctx.globalAlpha = 0.5 + pulse * 0.38;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowBlur = 16;
    const lx = (hitUnit.x + 0.5) * CELL, ly = (hitUnit.y + 0.5) * CELL, d = CELL * 0.27;
    ctx.beginPath();
    ctx.moveTo(lx - d, ly - d); ctx.lineTo(lx + d, ly + d);
    ctx.moveTo(lx + d, ly - d); ctx.lineTo(lx - d, ly + d);
    ctx.stroke();
  }
  ctx.restore();
}

// Only show aim arrows for P1's selected unit (8 directions) — not in adventure mode
function drawAimIndicators() {
  if (gameMode === 'adventure') return;
  if (S.phase === 'frozen' && S.clockSide !== 0) return;
  const p = S.units.find(u => u.id === S.selectedId[0] && u.alive);
  if (!p) return;
  const cx = (p.rx + 0.5) * CELL, cy = (p.ry + 0.5) * CELL;
  const aimD = p.aimDir;
  const DIRS = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    { dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
  ];
  DIRS.forEach(d => {
    const on = d.dx === aimD.dx && d.dy === aimD.dy;
    const len = Math.hypot(d.dx, d.dy);
    const base = on ? CELL * 0.60 : CELL * 0.56;
    const ox = d.dx / len * base;
    const oy = d.dy / len * base;
    const angle = Math.atan2(d.dy, d.dx);
    const sz = on ? 10 : 5;
    const al = on ? 0.95 : 0.18;
    ctx.save();
    ctx.globalAlpha = al; ctx.shadowColor = p.color; ctx.shadowBlur = on ? 22 : 3;
    ctx.fillStyle = p.color;
    ctx.translate(cx + ox, cy + oy); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.5, -sz * 0.48); ctx.lineTo(-sz * 0.5, sz * 0.48); ctx.closePath(); ctx.fill();
    if (on) {
      ctx.globalAlpha = 0.35; ctx.shadowBlur = 12; ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, sz * 1.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  });
}

function drawBullets() {
  const now = performance.now();
  S.bullets.forEach(b => {
    if (!b.active && b.deadTicks !== undefined) return;
    let rx = (b.rx + 0.5) * CELL, ry = (b.ry + 0.5) * CELL;
    const heavy = (b.power || 1) >= 2;
    const spread = b.spread === true;
    const damaged = heavy && b.pierceLeft === 0;

    // Pellet fade-out as it approaches maxRange
    const rangeAlpha = (b.maxRange > 0)
      ? Math.max(0.05, 1 - b.cellsTraveled / b.maxRange)
      : 1;

    const baseAlpha = (b.active ? 1 : Math.max(0, 1 - S.animT * 3)) * rangeAlpha;
    if (baseAlpha <= 0) return;

    if (heavy) {
      // --- ORIGINAL CANNON BULLET (Heavy) ---
      ctx.save();
      const trailSteps = damaged ? 3 : 5;
      const trailDist = 0.58;
      const baseTrailMax = damaged ? 2.5 : 5;
      for (let t = 1; t <= trailSteps; t++) {
        const f = t / trailSteps;
        let animPulse = 1, distPulse = 1, alphaPulse = 1;
        if (S.phase === 'ticking') {
          const speed = 0.025;
          animPulse = 0.7 + Math.sin(now * speed + t * 0.6 + b.id * 10) * 0.3;
          distPulse = 1.0 + Math.cos(now * speed * 1.5 + t) * 0.15;
          alphaPulse = 0.6 + Math.sin(now * speed * 2 + t * 0.8) * 0.4;
        }
        const trailMax = baseTrailMax * animPulse;
        ctx.globalAlpha = (1 - f) * 0.38 * rangeAlpha * alphaPulse;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 6 * animPulse;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(rx - b.dx * CELL * trailDist * f * distPulse, ry - b.dy * CELL * trailDist * f * distPulse, (1 - f) * trailMax, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = baseAlpha;
      const coreR = damaged ? 5 : 8;
      ctx.shadowColor = b.color; ctx.shadowBlur = damaged ? 14 : 32; ctx.fillStyle = b.color;

      ctx.beginPath(); ctx.arc(rx, ry, coreR, 0, Math.PI * 2); ctx.fill();
      // Heavy outer ring
      if (!damaged) {
        ctx.globalAlpha = baseAlpha * 0.55;
        ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(rx, ry, coreR * 1.75, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = baseAlpha;
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(rx, ry, damaged ? 1.8 : 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      // --- NEW DATA-SHOT (Normal / Shotgun) ---
      ctx.save();
      ctx.translate(rx, ry);

      // Rotate bullet to face its travel direction
      const angle = Math.atan2(b.dy, b.dx);
      ctx.rotate(angle);

      ctx.globalAlpha = baseAlpha;

      // Data-Shot Trail (long aerodynamic tail)
      const tailLength = spread ? 8 : 16;
      const thickness = spread ? 2 : 4;

      // Glowing aura / motion blur
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 15;

      const grad = ctx.createLinearGradient(-tailLength * 1.5, 0, tailLength * 0.5, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, b.color);
      grad.addColorStop(1, '#ffffff');

      ctx.fillStyle = grad;

      // Data dash shape (sharp front, fading back)
      ctx.beginPath();
      ctx.moveTo(tailLength * 0.5, 0); // sharp tip
      ctx.lineTo(0, thickness * 0.5); // top width
      ctx.lineTo(-tailLength * 1.5, thickness * 0.1); // tapered tail top
      ctx.lineTo(-tailLength * 1.5, -thickness * 0.1); // tapered tail bottom
      ctx.lineTo(0, -thickness * 0.5); // bottom width
      ctx.fill();

      // Bright Core Center
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-tailLength * 0.2, -thickness * 0.3, tailLength * 0.6, thickness * 0.6);

      ctx.restore();
    }
  });
}

function drawParticles() {
  S.particles.forEach(p => {
    ctx.save();
    ctx.shadowColor = p.color; ctx.shadowBlur = 10;
    if (p.type === 'ring') {
      const rad = p.r * (1 - p.life);
      if (rad > 0) {
        ctx.globalAlpha = p.life * 0.85;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.5, 3 * p.life);
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (p.type === 'chunk') {
      // Draw as a rotating square block for wall pieces
      ctx.globalAlpha = p.life * 0.95;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      // Spin depending on the x/y and life so it looks naturally rotating
      ctx.rotate((p.x + p.y) * 0.1 + p.life * 6);
      const size = p.r * 1.5 * p.life;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      // Nice 3D highlight edge
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(-size / 2, -size / 2, size, size / 3);
      ctx.translate(-p.x, -p.y);
    } else if (p.type === 'pixel') {
      // Draw as a perfect square pixel that shrinks slightly over time, no rotation
      ctx.globalAlpha = p.life > 0.5 ? 1 : p.life * 2;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = p.color === '#ffffff' ? 8 : 0; // Only white pixels glow

      const size = Math.max(1, Math.round(p.r * (0.3 + 0.7 * p.life)));
      // Snap to whole pixels for crisp pixel-art look
      const px = Math.round(p.x - size / 2);
      const py = Math.round(p.y - size / 2);
      ctx.fillRect(px, py, size, size);
    } else if (p.type === 'streak' || p.vx !== 0 || p.vy !== 0) {
      // Dynamic motion streaks instead of circles
      const speed = Math.hypot(p.vx, p.vy) + 1;
      const len = speed * 2.5 * p.life;
      ctx.globalAlpha = p.life * 0.95;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.5, p.r * p.life);
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Draw line pointing from older position using velocity
      const ang = Math.atan2(p.vy, p.vx);
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
      ctx.stroke();
    } else {
      ctx.globalAlpha = p.life * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
}

function drawThreatIndicators() {
  if (S.phase === 'gameover') return;
  const pulse = (Math.sin(performance.now() * 0.014) + 1) * 0.5;

  // Laser threats — purple X on units in beam path
  S.lasers.forEach(laser => {
    if (!laser.active) return;
    for (const cell of laser.cells) {
      const u = S.units.find(u => u.alive && u.team !== laser.owner && u.x === cell.x && u.y === cell.y);
      if (!u) continue;
      const cx = (u.rx + 0.5) * CELL, cy = (u.ry + 0.5) * CELL;
      const r = CELL * 0.43 + pulse * CELL * 0.07;
      const d = r * 0.72;
      ctx.save();
      ctx.globalAlpha = 0.5 + pulse * 0.45;
      ctx.shadowColor = '#cc00ff'; ctx.shadowBlur = 20 + pulse * 22;
      ctx.strokeStyle = `hsl(${285 + pulse * 30}, 100%, 66%)`; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
      ctx.stroke();
      ctx.globalAlpha = 0.25 + pulse * 0.3;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      break;
    }
  });

  S.bullets.forEach(b => {
    if (!b.active) return;
    const bThrSpd = (b.power || 1) >= 2 ? 1 : 2;
    const nx = b.x + b.dx * bThrSpd, ny = b.y + b.dy * bThrSpd;
    const midx = b.x + b.dx, midy = b.y + b.dy;

    S.units.forEach(u => {
      if (!u.alive || u.team === b.owner) return;
      const atFinal = nx === u.x && ny === u.y;
      const atMid = bThrSpd === 2 && midx === u.x && midy === u.y;
      if (!atFinal && !atMid) return;

      const cx = (u.rx + 0.5) * CELL, cy = (u.ry + 0.5) * CELL;
      const r = CELL * 0.44 + pulse * CELL * 0.07;

      ctx.save();

      // Pulsing danger diamond
      ctx.globalAlpha = 0.45 + pulse * 0.5;
      ctx.shadowColor = '#ff5500';
      ctx.shadowBlur = 20 + pulse * 22;
      ctx.strokeStyle = `hsl(${18 + pulse * 18}, 100%, 58%)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.stroke();

      // Incoming direction arrow
      const len = Math.hypot(b.dx, b.dy);
      const ndx = b.dx / len, ndy = b.dy / len;
      const adist = r * 1.5;
      const ax = cx - ndx * adist, ay = cy - ndy * adist;
      const angle = Math.atan2(b.dy, b.dx);
      const sz = 7 + pulse * 4;

      ctx.globalAlpha = 0.65 + pulse * 0.3;
      ctx.fillStyle = '#ff6600';
      ctx.shadowBlur = 14 + pulse * 12;
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(sz, 0);
      ctx.lineTo(-sz * 0.6, -sz * 0.5);
      ctx.lineTo(-sz * 0.6, sz * 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    });
  });
}

// ── Animated hero sprite system ───────────────────────────────────────────────
// heroAnimFrames = { idle: {east:[img,...], south:[...], ...}, walk: {...} }
// Populated by loadHeroAnimSprites() after PixelLab images are downloaded.
const HERO_ANIM_FPS = { idle: 5, walk: 10, fight: 8 };

function getHeroFrame(u, dir) {
  const isMoving = Math.abs(u.rx - u.x) > 0.05 || Math.abs(u.ry - u.y) > 0.05;
  const isFighting = isAdjacentToEnemy(u);

  let anim = 'idle';
  if (isMoving) anim = 'walk';
  else if (isFighting) anim = 'fight';

  const fps = HERO_ANIM_FPS[anim];
  const frames = heroAnimFrames[anim][dir];
  // Fall back to static sprite if no animation frames loaded yet
  if (!frames || frames.length === 0) return { img: heroImgs[dir], anim };
  const idx = Math.floor(performance.now() / (1000 / fps)) % frames.length;
  return { img: frames[idx], anim };
}
// ─────────────────────────────────────────────────────────────────────────────

function angleToDir(angle) {
  // Maps facing angle → one of 4 PixelLab directions
  // angle=0 → east (+x), angle=π/2 → south (+y), angle=±π → west, angle=-π/2 → north
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // 0..2π
  if (a < Math.PI * 0.25 || a >= Math.PI * 1.75) return 'east';
  if (a < Math.PI * 0.75) return 'south';
  if (a < Math.PI * 1.25) return 'west';
  return 'north';
}

function drawHeroPixelArt(cx, cy, u, alpha, inactive) {
  const t = performance.now();
  const isMoving = Math.abs(u.rx - u.x) > 0.01 || Math.abs(u.ry - u.y) > 0.01;
  const isDanger = isAdjacentToEnemy(u) || S.bullets.some(b =>
    b.active && b.owner !== u.team &&
    Math.abs(b.x + b.dx - u.x) <= 1 && Math.abs(b.y + b.dy - u.y) <= 1
  );
  const isLowHp = gameMode === 'adventure' && S.energy <= 15;
  const isHighPower = gameMode === 'adventure' && S.energy > 75;

  const dx = u.aimDir ? u.aimDir.dx : u.facing.dx;
  const dy = u.aimDir ? u.aimDir.dy : u.facing.dy;
  const angle = Math.atan2(dy, dx);
  const shootFlash = u.shootFlash || 0;
  const recoilX = -Math.cos(angle) * shootFlash * 8;
  const recoilY = -Math.sin(angle) * shootFlash * 8;

  let jitterX = 0, jitterY = 0;
  if (isLowHp) { jitterX = (Math.random() - 0.5) * 2.5; jitterY = (Math.random() - 0.5) * 2.5; }

  const bob = Math.sin(t * 0.003) * 2;
  const sz = CELL * 0.45;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx + recoilX + jitterX, cy + bob + recoilY + jitterY);

  // Shadow
  ctx.save();
  ctx.translate(-recoilX - jitterX, -bob + 8 - recoilY - jitterY);
  ctx.globalAlpha = alpha * 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(0, 0, sz * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Jet Trail
  if (isMoving) {
    const moveAng = Math.atan2(u.ry - u.y, u.rx - u.x);
    for (let i = 0; i < 3; i++) {
      const pT = (t * 0.01 + i * 0.3) % 1;
      const d = sz * (0.8 + pT * 1.5);
      const px = Math.cos(moveAng + Math.PI) * d + (Math.random() - 0.5) * 4;
      const py = Math.sin(moveAng + Math.PI) * d + (Math.random() - 0.5) * 4;
      ctx.globalAlpha = alpha * (1 - pT) * 0.6;
      ctx.fillStyle = '#00f5ff';
      ctx.fillRect(px, py, 2, 2);
    }
  }

  // Electricity Arcs
  if (isHighPower && !inactive) {
    ctx.strokeStyle = '#00f5ff'; ctx.lineWidth = 1;
    ctx.shadowBlur = 5; ctx.shadowColor = '#00f5ff';
    for (let i = 0; i < 2; i++) {
      if (Math.random() > 0.8) {
        const a = Math.random() * Math.PI * 2;
        const r = sz * (1.0 + Math.random() * 0.3);
        const ax = Math.cos(a) * r, ay = Math.sin(a) * r;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + (Math.random() - 0.5) * 10, ay + (Math.random() - 0.5) * 10); ctx.stroke();
      }
    }
  }

  // Main Body
  ctx.fillStyle = isLowHp && t % 200 < 50 ? '#110000' : '#000000';
  ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0d4d2a'; ctx.lineWidth = 1.5; ctx.stroke();

  // Eye
  const shift = sz * 0.35;
  const ex = Math.cos(angle) * shift, ey = Math.sin(angle) * shift;
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(ex, ey, sz * 0.5, 0, Math.PI * 2); ctx.fill();

  const isBlinking = t % 4000 < 150;
  const coreColor = isDanger ? (isLowHp && t % 100 < 50 ? '#ffaa00' : '#ff3c55') : '#00f5ff';
  const pulseSpeed = isDanger ? 0.03 : 0.01;
  const corePulse = (Math.sin(t * pulseSpeed) + 1) * 0.5;
  const flareSize = 1.0 + shootFlash * 1.5;

  ctx.shadowColor = coreColor;
  ctx.shadowBlur = (8 + corePulse * 6) * (1 + shootFlash * 3);
  if (isDanger) ctx.shadowBlur += 10;

  if (!(u.hitTimer > 0) && !(isLowHp && t % 300 < 40) && !isBlinking) {
    ctx.fillStyle = coreColor;
    ctx.beginPath(); ctx.arc(ex, ey, sz * (isDanger ? 0.25 : 0.2) * flareSize, 0, Math.PI * 2); ctx.fill();
  }

  // Highlights
  ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.arc(ex - 1.5, ey - 1.5, sz * 0.06, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// enemy color → hue-rotate degrees (base sprite is cyan ~180°)
function enemyHueRotate(color) {
  // Map enemy color to hue-rotate so cyan sprite becomes that color
  const map = {
    '#ff3c55': 170,  // scout  — red
    '#ff6622': 200,  // grunt  — orange
    '#dd1a40': 175,  // heavy  — crimson
    '#cc30ff': 100,  // elite  — purple
  };
  return map[color] !== undefined ? map[color] : 170;
}


function drawEnemyWorm(cx, cy, u, alpha) {
  try {
    const t = performance.now();
    const isHit = u.hitFlash > 0;
    const baseColor = isHit ? '#ffffff' : u.color;
    // Padarytas dar plonesnis kirminas (galva ir kūnas)
    const sz = CELL * 0.18 * (u.scale || 1.0);

    // Calculate dynamic trailing segment position
    let progress = 0;
    if (u.x !== u.px) progress = (u.rx - u.px) / (u.x - u.px);
    else if (u.y !== u.py) progress = (u.ry - u.py) / (u.y - u.py);

    const p0x = u.trail && u.trail[1] ? u.trail[1].x : u.px;
    const p0y = u.trail && u.trail[1] ? u.trail[1].y : u.py;
    const p1x = u.trail && u.trail[0] ? u.trail[0].x : u.px;
    const p1y = u.trail && u.trail[0] ? u.trail[0].y : u.py;
    const p2x = u.px;
    const p2y = u.py;

    // Tail tip (interpolating p0 to p1)
    const tx = p0x + (p1x - p0x) * progress;
    const ty = p0y + (p1y - p0y) * progress;

    // Mid joint (interpolating p1 to p2)
    const mx = p1x + (p2x - p1x) * progress;
    const my = p1y + (p2y - p1y) * progress;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Calculate global recoil for the entire entity
    const shakeAmt = (u.hp <= u.maxHp * 0.4) ? 3 : 0;
    const recoil = u.hitFlash > 0 ? -4 : 0;
    const vX = Math.cos(Math.atan2(u.facing.dy, u.facing.dx));
    const vY = Math.sin(Math.atan2(u.facing.dy, u.facing.dx));

    const rCx = cx + vX * recoil + (Math.random() - 0.5) * shakeAmt;
    const rCy = cy + vY * recoil + (Math.random() - 0.5) * shakeAmt;

    // Convert to canvas space with recoil
    const toC = (gridX, gridY) => ({
      x: (gridX + 0.5) * CELL + vX * recoil,
      y: (gridY + 0.5) * CELL + vY * recoil
    });

    const cT = toC(tx, ty); // Tail 
    const cM = toC(mx, my); // Mid 
    const cH = { x: rCx, y: rCy }; // Head

    // Path interpolator (0 = Head, 1 = Tail Tip)
    const getPathPoint = (rt) => {
      if (rt < 0.5) {
        const lr = rt * 2;
        return { x: cH.x - (cH.x - cM.x) * lr, y: cH.y - (cH.y - cM.y) * lr };
      } else {
        const lr = (rt - 0.5) * 2;
        return { x: cM.x - (cM.x - cT.x) * lr, y: cM.y - (cM.y - cT.y) * lr };
      }
    };

    // Draw universal shadow for the whole worm
    ctx.save();
    ctx.translate(0, 8);
    ctx.globalAlpha = alpha * 0.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = sz * 1.5;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(cH.x, cH.y);
    ctx.lineTo(cM.x, cM.y);
    ctx.lineTo(cT.x, cT.y);
    ctx.stroke();
    ctx.restore();

    // Draw segmented body
    const segments = 24; // Daugiau segmentų ilgesniam kirminui 
    ctx.shadowBlur = isHit ? 30 : 15;
    ctx.shadowColor = baseColor;

    for (let i = segments; i >= 0; i--) {
      const ratio = i / segments;
      const pt = getPathPoint(ratio);

      // Calculate local angle to make wiggling perpendicular to the curve
      const ptBehind = getPathPoint(Math.min(1, ratio + 0.1));
      const ptAhead = getPathPoint(Math.max(0, ratio - 0.1));
      const locAngle = Math.atan2(ptAhead.y - ptBehind.y, ptAhead.x - ptBehind.x);

      const pX = Math.cos(locAngle + Math.PI / 2);
      const pY = Math.sin(locAngle + Math.PI / 2);

      // Compute wiggle
      const wave = Math.sin(t * 0.015 - ratio * Math.PI * 4 + u.id);
      const wiggleAmt = wave * sz * 0.35 * Math.sin(ratio * Math.PI); // middle wiggles most
      const wX = pt.x + pX * wiggleAmt;
      const wY = pt.y + pY * wiggleAmt;

      // Kūnas plonesnis, bet į galą siaurėja lėčiau (išlaiko panašaus storio uodegą kaip anksčiau)
      const segSz = sz * (1 - ratio * 0.3);

      // Draw neon rings
      ctx.beginPath();
      // Outer bright color
      ctx.fillStyle = baseColor;
      ctx.arc(wX, wY, segSz, 0, Math.PI * 2);
      ctx.fill();

      // Inner black hollow
      ctx.fillStyle = '#020202';
      ctx.beginPath();
      ctx.arc(wX, wY, segSz * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw solid core/head (No pincers or eyes, just a bright orb cap)
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.arc(cH.x, cH.y, sz * 0.9, 0, Math.PI * 2);
    ctx.fill();

    // 2 žvairos, netolygiškai mirksinčios akytės priekyje
    const ptHead = getPathPoint(0);
    const ptBehindHead = getPathPoint(0.05);
    const headAngle = Math.atan2(ptHead.y - ptBehindHead.y, ptHead.x - ptBehindHead.x);

    const eyeDist = sz * 0.5;
    const eyeSize = sz * 0.3;

    // Asimetriški, labai atsitiktiniai mirksėjimai ("bucket" laiko baze remiantis šansu)
    const timeBucketL = Math.floor(t / 150) + u.id; // Akies užsimerkimas trunka ~150ms
    const timeBucketR = Math.floor(t / 180) + u.id * 2;

    // Pseudo-atsitiktinis skaičius (0..1) pagal unikalų laiko kibirą
    const randL = Math.abs(Math.sin(timeBucketL * 43758.5453) % 1);
    const randR = Math.abs(Math.sin(timeBucketR * 21474.8364) % 1);

    // Kokia tikimybė užsimerkti tuo laikotarpiu? > 0.985 reiskia ~1.5% sansas
    // Sumirksima tik mazdaug karta per 2 - 5 sekundes
    const isLeftBlink = randL > 0.985;
    const isRightBlink = randR > 0.98;

    ctx.fillStyle = '#010101'; // Juodos akytės

    if (!isLeftBlink) {
      const leX = cH.x + Math.cos(headAngle - 0.5) * eyeDist;
      const leY = cH.y + Math.sin(headAngle - 0.5) * eyeDist;
      ctx.beginPath();
      ctx.arc(leX, leY, eyeSize, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!isRightBlink) {
      // Šiek tiek kitoks atstumas išplėtimui – žvairumas
      const reX = cH.x + Math.cos(headAngle + 0.6) * eyeDist * 1.1;
      const reY = cH.y + Math.sin(headAngle + 0.6) * eyeDist * 1.1;
      ctx.beginPath();
      ctx.arc(reX, reY, eyeSize * 0.7, 0, Math.PI * 2); // Viena akis mažesnė atrodanti žvairesnė
      ctx.fill();
    }

    ctx.restore();
  } catch (e) { console.error("Enemy render error:", e); }
}

function drawEnemyBinarySwarm(cx, cy, u, alpha) {
  try {
    const t = performance.now();
    const isHit = u.hitFlash > 0;
    const sz = CELL * 0.45 * (u.scale || 1.0);
    // Visi skaičiai visada balti (numatyta 'CRPT' ir 'LEAK' klasėms)
    const baseColor = '#ffffff';

    // Recoil effect from taking damage
    const angle = Math.atan2(u.facing.dy, u.facing.dx);
    const recoil = u.hitFlash > 0 ? -4 : 0;
    const cxRecoil = cx + Math.cos(angle) * recoil;
    const cyRecoil = cy + Math.sin(angle) * recoil;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cxRecoil, cyRecoil);

    // Universal Shadow
    ctx.save();
    ctx.translate(0, 6);
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, 0, sz * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.shadowBlur = isHit ? 20 : 12;
    ctx.shadowColor = baseColor;
    ctx.fillStyle = baseColor;

    // Binary Chaotic Cloud
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxHealth = u.maxHp || 1;
    const healthRatio = Math.max(0.1, u.hp / maxHealth);

    // Amount of characters based on enemy scale
    const numChars = Math.floor(18 * (u.scale || 1.0));

    // Shake amount increases as health drops
    const shake = (1.0 - healthRatio) * 6;

    // Galingai asimetriški svyravimai per unikalius ID ir Laiko offsetus
    const timeOffset = u.id * 3721.4;
    const enemyTime = t + timeOffset;
    // Kiekvienas priešas dabar vizualiai skraido skaičius savo unikaliu baziniu greičiu
    const unitSpeedMult = 0.7 + ((u.id * 17) % 6) * 0.1;

    for (let i = 0; i < numChars; i++) {
      // Visiškai unikalūs išsiskleido Seedai
      const rSeed = u.id * 314.15 + i * 15.3;
      const speed = (0.001 + (i % 3) * 0.0015) * unitSpeedMult;

      // Kiekvienas binarinis burbulas kvėpuoja (pulsas) asimetriškai dėl laiko
      const pulseIn = Math.sin(enemyTime * 0.001 + rSeed) * (sz * 0.15);
      let r = sz * 1.5 * Math.abs(Math.sin(rSeed)) + pulseIn;
      let theta = (rSeed * 0.9) + enemyTime * speed * (i % 2 === 0 ? 1 : -1);

      // Jitter based on damage
      const jX = (Math.sin(enemyTime * 0.05 + rSeed) * shake);
      const jY = (Math.cos(enemyTime * 0.05 + rSeed) * shake);

      const px = Math.cos(theta) * r + jX;
      const py = Math.sin(theta) * r + jY;

      // Rapidly changing 0 or 1
      const char = Math.floor((enemyTime * (0.01 + i * 0.001) + rSeed) % 2) === 0 ? '0' : '1';

      // Text size based on distance from center (inner is larger)
      const ts = Math.max(8, sz * 0.8 * (1 - (r / (sz * 2.0))) + 8);
      ctx.font = `bold ${ts}px monospace`;

      // Alpha flicker
      ctx.globalAlpha = alpha * (0.4 + Math.abs(Math.sin(enemyTime * 0.01 + rSeed)) * 0.6);

      // Baltas chaosas su hit flash overrides
      ctx.fillStyle = (isHit && i % 2 === 0) ? '#fff' : baseColor;

      ctx.fillText(char, px, py);
    }

    ctx.restore();
  } catch (e) { console.error("Enemy render error:", e); }
}

function drawEnemyPixelArt(cx, cy, u, alpha) {
  try {
    const t = performance.now();
    const isHit = u.hitFlash > 0;
    const sz = CELL * 0.6 * (u.scale || 1.0);
    const baseColor = isHit ? '#ffffff' : u.color;

    const maxHealth = u.maxHp || 1;
    const isDamaged = u.hp <= maxHealth * 0.4;
    const shakeAmt = isDamaged ? 3 : 0;
    const damageRecoil = isHit ? -5 : 0;

    const angle = Math.atan2(u.facing.dy, u.facing.dx);
    const cxRecoil = cx + Math.cos(angle) * damageRecoil + (Math.random() - 0.5) * shakeAmt;
    const cyRecoil = cy + Math.sin(angle) * damageRecoil + (Math.random() - 0.5) * shakeAmt;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cxRecoil, cyRecoil);

    // Bazinio šešėlio piešimas po priešu
    ctx.save();
    ctx.translate(0, 10);
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, 0, sz * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Procedural Ghost Generation (Kad sukurtume kaukę/clip)
    const stripH = 3;
    const startY = -sz * 1.2;
    const endY = sz * 1.2;
    const strips = Math.floor((endY - startY) / stripH);

    // --- GLOBAL SHAPE MORPHING LOGIC ---
    // Prieš tai kurta morfologinė animacija atgal
    const morphCycle = (t * 0.00015 + u.id) % 4;
    const phase = Math.floor(morphCycle);
    const lerp = morphCycle - phase;
    const smoothLerp = lerp * lerp * (3 - 2 * lerp);

    const getBaseShapeWidth = (p, yN) => {
      if (p === 0) { // Form 0: Originalus Vaiduoklis
        let wg = sz * 0.5;
        if (yN < -0.6) wg = sz * 0.6 * (1 - Math.abs(yN + 0.6) / 0.6); // Dome top / hood
        else if (yN < 0.2) wg = sz * 0.6; // Torso
        else if (yN < 0.8) wg = sz * 0.6 * (1 - (yN - 0.2) / 0.6); // Tapering bottom
        else wg = sz * 0.1;
        if (yN > -0.2 && yN < 0.2) wg += sz * 0.3 * Math.sin((yN + 0.2) / 0.4 * Math.PI); // Rankos
        return Math.max(0, wg);
      } else if (p === 1) { // Form 1: Ovalas
        return sz * 0.8 * Math.sqrt(Math.max(0, 1 - Math.pow(yN / 1.15, 2)));
      } else if (p === 2) { // Form 2: Kvadratas / Blokas
        return sz * 0.75 * Math.max(0, 1 - Math.pow(Math.abs(yN / 1.15), 6));
      } else { // Form 3: Smėlio Laikrodis (Hourglass)
        let wh = sz * 0.2 + sz * 0.65 * Math.pow(Math.abs(yN / 1.15), 1.5);
        let taper = Math.max(0, 1 - Math.pow(Math.abs(yN / 1.15), 10)); // Uždarome galus
        return wh * taper;
      }
    };

    let stripData = [];

    for (let i = 0; i < strips; i++) {
      let yBase = startY + i * stripH;
      let yNorm = yBase / sz;
      let y = yBase;
      let currentStripH = stripH;

      const width1 = getBaseShapeWidth(phase, yNorm);
      const width2 = getBaseShapeWidth((phase + 1) % 4, yNorm);
      let w = width1 * (1 - smoothLerp) + width2 * smoothLerp;

      // LOCALIZED DYNAMIC BITE & MORPH ANIMATION (Išsaugota įkandimų logika)
      const breatheSlow = Math.sin(t * 0.001 + u.id);
      const wave1 = Math.sin(yNorm * 6 - t * 0.002 + u.id);
      const wave2 = Math.cos(yNorm * 14 + t * 0.004);
      const wave3 = Math.sin(yNorm * 28 - t * 0.006);

      const distortion = (wave1 * 0.35 + wave2 * 0.35 + wave3 * 0.2 + breatheSlow * 0.2);

      let squishMultiplier = 1.0;
      if (distortion > 0) {
        squishMultiplier = 1.0 + (distortion * 0.15);
      } else {
        squishMultiplier = 1.0 + (distortion * 0.8);
      }

      w = Math.max(sz * 0.1, w * squishMultiplier);

      // Ambient breathing logic
      w += sz * 0.05 * Math.sin(yNorm * 15 + t * 0.005);

      stripData.push({
        y: y,
        h: currentStripH,
        x: -w, // Centered
        w: w * 2,
        isMissing: w <= 0
      });
    }

    // Sujungiame pikselių grupes į vientisą poligoną
    let groups = [];
    let currentGroup = [];
    for (let s of stripData) {
      if (s.isMissing) {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
      } else {
        currentGroup.push(s);
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    ctx.beginPath();
    for (let group of groups) {
      for (let i = 0; i < group.length; i++) {
        ctx.lineTo(group[i].x, group[i].y);
        ctx.lineTo(group[i].x, group[i].y + group[i].h);
      }
      for (let i = group.length - 1; i >= 0; i--) {
        ctx.lineTo(group[i].x + group[i].w, group[i].y + group[i].h);
        ctx.lineTo(group[i].x + group[i].w, group[i].y);
      }
      ctx.closePath();
    }

    // Piešiamas švytintis vaiduoklio neoninis rėmas (Ghost Outline)
    ctx.shadowBlur = isHit ? 40 : 15;
    ctx.shadowColor = baseColor;
    ctx.lineWidth = Math.max(2, sz * 0.08);
    ctx.strokeStyle = isHit ? '#ffffff' : baseColor;
    ctx.stroke();

    // !! Esminė grandis !! - Visas sekantis TV sniegas bus piešiamas TIK vaiduoklio silueto viduje!
    ctx.clip();

    // Televizoriaus Triukšmo (TV Static / Sniego) Generavimas INSIDE
    ctx.shadowBlur = 0;

    const pSz = Math.max(2.5, sz * 0.12);
    // Dinaminės sniego ribos
    const tbSz = sz * 1.5;

    const trackingSpeed = (isDamaged ? 0.3 : 0.1);
    const trackingBand = ((t * trackingSpeed + u.id * 10) % (tbSz * 4)) - tbSz * 2;

    const signalLoss = Math.sin(t * 0.002 + u.id * 3);
    const isSignalLost = signalLoss > 0.85 && !isHit;

    // Fonas - aklinai juodas tų formų viduje kur nėra sniego
    ctx.fillStyle = '#010101';
    ctx.fillRect(-tbSz * 1.5, -tbSz * 1.5, tbSz * 3, tbSz * 3);

    // Piešiame TV sniegą ištaškytą per originalaus silueto plotį
    for (let py = -tbSz; py <= tbSz; py += pSz) {
      for (let px = -tbSz * 1.5; px <= tbSz * 1.5; px += pSz) {

        const noiseValue = Math.random();
        let c = null;

        if (!isSignalLost) {
          if (noiseValue > 0.8) c = '#ffffff';
          else if (noiseValue > 0.5) c = '#a0a0a0';
          else if (noiseValue > 0.2) c = '#303030';

          if (isHit && noiseValue > 0.4) c = '#ffffff';
        } else {
          if (noiseValue > 0.97) c = '#222222';
        }

        if (Math.abs(py - trackingBand) < pSz * 2.5 && !isSignalLost) {
          c = (noiseValue > 0.3) ? '#ffffff' : '#dddddd';
        }

        if (c !== null) {
          ctx.fillStyle = c;
          ctx.fillRect(px, py, pSz * 1.2, pSz * 1.2);
        }
      }
    }

    ctx.restore();
  } catch (e) { console.error("Enemy render error:", e); }
}
// Lighten or darken a hex color by amount (-255 to +255)
function shadeColor(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function drawUnits() {
  S.units.forEach(u => {
    if (!u.alive && u.deathT <= 0) return;
    if (gameMode === 'adventure' && u.team === 1 && !isVisible(u.x, u.y)) return;
    const cx = (u.rx + 0.5) * CELL, cy = (u.ry + 0.5) * CELL;
    const alpha = u.alive ? 1 : u.deathT;
    const r = CELL * 0.29 * (u.scale || 1.0);
    const isSel = u.team === 0 && u.id === S.selectedId[0];
    const inactive = S.phase === 'frozen' && S.clockSide !== u.team;

    ctx.save(); ctx.globalAlpha = alpha;

    // ── Adventure enemy: pixel art character ──────────────────────
    if (gameMode === 'adventure' && u.team === 1) {
      // Enemy type dispatch
      if (u.utype === 'worm') {
        drawEnemyWorm(cx, cy, u, alpha);
      } else if (u.utype === 'leak' || u.utype === 'corrupt') {
        drawEnemyBinarySwarm(cx, cy, u, alpha);
      } else {
        drawEnemyPixelArt(cx, cy, u, alpha);
      }
      ctx.restore();
      return;
    }

    // ── Adventure hero: pixel art character ───────────────────────
    if (gameMode === 'adventure' && u.team === 0) {
      if (u.isDying) {
        const elapsed = performance.now() - u.deathStart;
        const progress = Math.min(1, elapsed / 2400);

        // ── Death visual effect ───────────────────────────────────────
        if (progress < 0.9) {
          // Continuous dissolve / fire particles
          const burst = Math.floor(1 + progress * 3);
          for (let i = 0; i < burst; i++) {
            if (Math.random() < 0.55) {
              const ang = Math.random() * Math.PI * 2;
              const spd = 0.5 + Math.random() * 2.5;
              S.particles.push({
                x: cx + (Math.random() - 0.5) * r,
                y: cy + (Math.random() - 0.5) * r,
                vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 0.8,
                life: 1, decay: 0.03 + Math.random() * 0.04,
                r: 2 + Math.random() * 4,
                color: Math.random() < 0.55 ? '#ff2222' : '#ff8800'
              });
            }
          }
          // Expanding ring burst at start of death
          if (elapsed < 600) {
            const rp = elapsed / 600;
            ctx.save();
            ctx.globalAlpha = (1 - rp) * 0.75 * alpha;
            ctx.strokeStyle = '#ff2222';
            ctx.lineWidth = 3 + (1 - rp) * 5;
            ctx.shadowColor = '#ff3300'; ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(cx, cy, r * (0.8 + rp * 2.8), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          // Red glow aura on hero body (fades in as death progresses)
          if (progress > 0.05) {
            ctx.save();
            ctx.globalAlpha = Math.min(progress * 1.5, 0.55) * alpha;
            ctx.fillStyle = '#ff1100';
            ctx.shadowColor = '#ff2200'; ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // After 90% — fully hidden
        if (progress >= 0.9) { ctx.restore(); return; }
        // Flicker: fast oscillation, gets more frequent as death progresses
        const flickRate = 60 + progress * 40;
        if (progress > 0.25 && Math.sin(elapsed / flickRate) < 0) { ctx.restore(); return; }
        const dyingAlpha = alpha * (1 - progress);
        drawHeroPixelArt(cx, cy, u, dyingAlpha, inactive);
      } else {
        drawHeroPixelArt(cx, cy, u, alpha, inactive);
      }
      ctx.restore();
      return; // skip hex rendering below
    }

    // ── PvP / non-hero units: original hex rendering ──────────────
    const fc = u.hitFlash > 0 ? '#ffffff' : u.color;
    const fb = inactive ? 0 : (u.hitFlash > 0 ? 40 * u.hitFlash : 14);

    // Facing arrow
    ctx.globalAlpha = 0.22 * alpha;
    ctx.shadowColor = u.color; ctx.shadowBlur = inactive ? 0 : 6; ctx.fillStyle = u.color;
    const { dx: fdx, dy: fdy } = u.facing;
    const px2 = -fdy, py2 = fdx;
    ctx.beginPath();
    ctx.moveTo(cx + fdx * r * 0.88, cy + fdy * r * 0.88);
    ctx.lineTo(cx + px2 * r * 0.28, cy + py2 * r * 0.28);
    ctx.lineTo(cx - px2 * r * 0.28, cy - py2 * r * 0.28);
    ctx.closePath(); ctx.fill();

    ctx.globalAlpha = alpha; ctx.shadowBlur = 0;

    // Selection ring
    if (isSel && !inactive) {
      ctx.shadowColor = u.color; ctx.shadowBlur = 20; ctx.strokeStyle = u.color; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 * alpha;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.75, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    // Hex body
    ctx.shadowColor = fc; ctx.shadowBlur = fb;
    hexPath(cx, cy, r); ctx.fillStyle = CELL_DARK; ctx.fill();
    ctx.strokeStyle = fc; ctx.lineWidth = 2.5; ctx.stroke();

    // HP arc
    if (!(gameMode === 'adventure' && u.team === 1)) {
      ctx.shadowBlur = inactive ? 0 : 8;
      ctx.shadowColor = u.color; ctx.strokeStyle = u.color; ctx.lineWidth = 3;
      ctx.globalAlpha = 0.55 * alpha;
      const hpRatio = Math.max(0, u.hp / u.maxHp);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpRatio); ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    // Inner hex
    ctx.shadowBlur = 0; ctx.strokeStyle = u.color; ctx.lineWidth = 1;
    ctx.globalAlpha = 0.28 * alpha;
    hexPath(cx, cy, r * 0.54); ctx.stroke();
    ctx.globalAlpha = alpha;

    // Center dot
    ctx.shadowBlur = inactive ? 0 : 12; ctx.shadowColor = fc; ctx.fillStyle = fc;
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();

    // Shoot flash ring
    if (u.shootFlash > 0 && !inactive) {
      ctx.globalAlpha = u.shootFlash * 0.7 * alpha; ctx.shadowBlur = 24 * u.shootFlash;
      ctx.shadowColor = u.color; ctx.strokeStyle = u.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r * (1.2 + 0.3 * (1 - u.shootFlash)), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    // Unit label — skipped for adventure enemies
    if (!(gameMode === 'adventure' && u.team === 1)) {
      const teamUnits = S.units.filter(v => v.team === u.team);
      const unitIdx = teamUnits.indexOf(u) + 1;
      ctx.shadowBlur = 0; ctx.globalAlpha = 0.8 * alpha; ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(CELL * 0.19)}px Courier New`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(unitIdx), cx, cy + r * 0.65);
    }

    // HP display below hex
    if (gameMode === 'adventure' && u.team === 1) {
      // Segmented HP bar: 1 square = 1 HP
      const sqW = 5, sqH = 4, gap = 1;
      const barW = u.maxHp * (sqW + gap) - gap;
      const bx = Math.round(cx - barW / 2);
      const by = Math.round(cy + r + 4);
      ctx.shadowBlur = 0;
      for (let i = 0; i < u.maxHp; i++) {
        const alive = i < Math.max(0, u.hp);
        ctx.globalAlpha = (alive ? 0.92 : 0.28) * alpha;
        ctx.fillStyle = alive ? u.color : '#0e0e22';
        ctx.fillRect(bx + i * (sqW + gap), by, sqW, sqH);
        if (alive && !inactive) {
          ctx.globalAlpha = 0.35 * alpha;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(bx + i * (sqW + gap), by, sqW, 1); // highlight top
        }
      }
      ctx.globalAlpha = alpha;
    } else if (!(gameMode === 'adventure' && u.team === 0)) {
      // pvp/pve: text HP label
      ctx.shadowBlur = inactive ? 0 : 6; ctx.shadowColor = u.color;
      ctx.globalAlpha = (u.alive ? 0.85 : 0.4) * alpha;
      ctx.fillStyle = u.color;
      ctx.font = `bold ${Math.round(CELL * 0.17)}px Courier New`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`${Math.max(0, u.hp)}/${u.maxHp}`, cx, cy + r + 3);
    }

    ctx.restore();
  });
}

function drawMeleeStrikes() {
  if (S.phase !== 'ticking' || !S.meleeStrikes.length) return;
  const t = S.animT;
  if (t > 0.8) return;

  S.meleeStrikes.forEach(s => {
    const cx = (s.ux + 0.5 + s.dx * 0.5) * CELL;
    const cy = (s.uy + 0.5 + s.dy * 0.5) * CELL;
    const angle = Math.atan2(s.dy, s.dx);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    const swing = (t < 0.5) ? (t / 0.5) : 1;
    const alpha = t < 0.2 ? t / 0.2 : (1 - (t - 0.2) / 0.6);

    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 15;

    // Draw a sharp slash arc
    ctx.beginPath();
    const arcSize = CELL * 0.4;
    const startA = -Math.PI / 2 * swing;
    const endA = Math.PI / 2 * swing;
    ctx.arc(0, 0, arcSize, startA, endA);
    ctx.stroke();

    // Inner bright line
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, arcSize, startA, endA);
    ctx.stroke();

    ctx.restore();
  });
}

function drawDmgNumbers() {
  const PX_FONT = "'Press Start 2P', 'Courier New', 'Segoe UI Emoji', 'Apple Color Emoji', monospace";
  S.dmgNumbers.forEach(n => {
    if (n.life <= 0) return;
    const alpha = n.life < 0.38 ? n.life / 0.38 : 1;

    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.scale(n.scale, n.scale);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(n.size)}px ${PX_FONT}`;

    // ── CRIT: pixel sparks radiating out ──────────────────────────
    if (n.type === 'crit') {
      const t = 1 - n.life;
      const dist = n.size * 1.3 * t;
      const sz = Math.max(1.5, 5 * (1 - t * 0.65));
      ctx.fillStyle = '#ffe033';
      for (let i = 0; i < 8; i++) {
        const a = Math.PI * 2 * i / 8;
        ctx.fillRect(Math.cos(a) * dist - sz / 2, Math.sin(a) * dist - sz / 2, sz, sz);
      }
      // extra 4 diagonal sparks (white)
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + Math.PI * 2 * i / 4;
        const d = dist * 0.65;
        const s = Math.max(1, sz * 0.6);
        ctx.fillRect(Math.cos(a) * d - s / 2, Math.sin(a) * d - s / 2, s, s);
      }
    }

    // ── MISS: thin slash decoration ───────────────────────────────
    if (n.type === 'miss') {
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = '#88bbff';
      ctx.lineWidth = 1.5;
      const w = n.size * 1.6;
      ctx.beginPath();
      ctx.moveTo(-w / 2, n.size * 0.55);
      ctx.lineTo(w / 2, -n.size * 0.55);
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    // ── Chunky pixel outline ───────────────────────────────────────
    const outW = n.type === 'crit' ? Math.max(4, n.size * 0.28)
      : n.type === 'miss' ? Math.max(2, n.size * 0.22)
        : Math.max(3, n.size * 0.25);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = outW;
    ctx.lineJoin = 'round';
    ctx.strokeText(n.text, 0, 0);

    // ── Glow + fill ───────────────────────────────────────────────
    ctx.shadowColor = n.color;
    ctx.shadowBlur = n.type === 'crit' ? 22 : n.type === 'miss' ? 5 : 10;
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, 0, 0);

    // ── Crit: bright highlight pass ───────────────────────────────
    if (n.type === 'crit') {
      ctx.globalAlpha = alpha * 0.45;
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(n.text, 0, -1.5);
    }

    ctx.restore();
  });
}

function hexPath(x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    i === 0 ? ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a)) : ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
}

// ── Clock ─────────────────────────────────────────────────────────
function formatClock(ms) {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  return `${m}:${s.toString().padStart(2, '0')}.${d}`;
}

function updateClockDisplay() {
  if (gameMode === 'adventure') {
    updateEnergyHud();
    updatePanelActivity();
    return;
  }
  if (!S.clock) return;
  [0, 1].forEach(team => {
    const el = document.getElementById(`p${team + 1}-clock`);
    if (!el) return;
    el.textContent = formatClock(S.clock[team]);
    const running = S.phase === 'frozen' && S.clockSide === team;
    const low = S.clock[team] < 10000;
    el.className = 'clock-display'
      + (low ? ' clock-low' : (running ? ` clock-run-p${team + 1}` : ''));
  });
  updatePanelActivity();
}

function updatePanelActivity() {
  [0, 1].forEach(team => {
    const panel = document.getElementById(`panel-p${team + 1}`);
    if (!panel) return;
    const active = S.phase === 'frozen' && S.clockSide === team;
    const inactive = S.phase === 'frozen' && S.clockSide !== team;
    panel.classList.toggle('panel-inactive', inactive);
    panel.classList.toggle('panel-active-p1', active && team === 0);
    panel.classList.toggle('panel-active-p2', active && team === 1);
  });
}

function startAIThinking() {
  const el = document.getElementById('p2-badge');
  if (!el) return;
  stopAIThinking();
  let dots = 0;
  el.textContent = 'CPU';
  el.className = 'action-badge ai-thinking';
  aiThinkInterval = setInterval(() => {
    dots = (dots + 1) % 4;
    if (el) el.textContent = 'CPU' + '.'.repeat(dots);
  }, 320);
}

function stopAIThinking() {
  if (aiThinkInterval) { clearInterval(aiThinkInterval); aiThinkInterval = null; }
}

// ── HUD ───────────────────────────────────────────────────────────
function updateHUD() {
  [0, 1].forEach(team => {
    S.units.filter(u => u.team === team).forEach((u, idx) => {
      const hp = document.getElementById(`p${team + 1}-u${idx}-hp`);
      const ammo = document.getElementById(`p${team + 1}-u${idx}-ammo`);
      const row = document.getElementById(`p${team + 1}-r${idx}`);
      if (hp) hp.style.width = (Math.max(0, u.hp) / u.maxHp * 100) + '%';
      if (row) row.classList.toggle('dead', !u.alive);
      if (ammo) {
        ammo.innerHTML = '';
        for (let k = 0; k < u.maxAmmo; k++) {
          const d = document.createElement('div');
          d.className = `ammo-dot ${team === 0 ? 'p1-dot' : 'p2-dot'}${k >= u.ammo ? ' empty' : ''}`;
          ammo.appendChild(d);
        }
      }
      if (team === 0) {
        const sel = document.getElementById(`p1-s${idx}`);
        if (sel) sel.className = `u-sel${(u.id === S.selectedId[0] && u.alive) ? ' active' : ''}`;
      }
    });
  });
  const td = document.getElementById('tick-display');
  if (td) td.textContent = 'TICK ' + S.tick;
  updateSkillBar(0);
  updateSkillBar(1);
}

function updateSkillBar(team) {
  const unit = S.units.find(u => u.id === S.selectedId[team] && u.alive);
  const wep = getCurrentWeapon(unit);
  const pfx = `p${team + 1}`;

  const WEPS = [
    { w: 'bullet', getAmmo: u => u.ammo, max: () => unit?.maxAmmo, regen: AMMO_REGEN, getTick: u => u.ammoTick },
    { w: 'laser', getAmmo: u => u.laserAmmo, max: () => MAX_LASER, regen: LASER_REGEN, getTick: u => u.laserTick },
    { w: 'heavy', getAmmo: u => u.heavyAmmo, max: () => MAX_HEAVY, regen: HEAVY_REGEN, getTick: u => u.heavyTick },
    { w: 'shotgun', getAmmo: u => u.shotgunAmmo, max: () => MAX_SHOTGUN, regen: SHOTGUN_REGEN, getTick: u => u.shotgunTick },
    { w: 'melee', getAmmo: u => 1, max: () => 1, regen: 0, getTick: u => 0 },
  ];

  const adj = isAdjacentToEnemy(unit);

  WEPS.forEach(({ w, getAmmo, max, regen, getTick }, i) => {
    const slot = document.getElementById(`${pfx}-sk-${i}`);
    if (!slot) return;

    // Active / weapon colour class
    slot.classList.toggle('sk-active', w === wep);
    slot.className = slot.className.replace(/wep-\w+/g, '') + ' wep-' + w;
    slot.classList.remove('wep-bullet', 'wep-laser', 'wep-heavy', 'wep-shotgun');
    slot.classList.add(`wep-${w}`);

    const cd = slot.querySelector('.sk-cd');
    if (!cd) return;

    if (!unit) { cd.textContent = ''; slot.classList.remove('sk-empty', 'sk-disabled'); return; }

    const ammo = getAmmo(unit);
    let nrgReq = 0;
    if (w === 'bullet') nrgReq = 2;
    if (w === 'laser') nrgReq = 7;
    if (w === 'heavy' || w === 'shotgun') nrgReq = 4;

    let empty = false;
    if (gameMode === 'adventure') {
      empty = (w !== 'melee') && (S.energy < nrgReq);
    } else {
      empty = ammo <= 0;
    }

    const disabled = adj && w !== 'melee';
    slot.classList.toggle('sk-empty', empty);
    slot.classList.toggle('sk-disabled', disabled);

    if (gameMode === 'adventure') {
      if (w === 'melee') cd.textContent = '';
      else cd.textContent = empty ? 'NO NRG' : `-${nrgReq} ⚡`;
    } else {
      if (empty) {
        cd.textContent = 'CD ' + (regen - getTick(unit));
      } else {
        const m = max();
        cd.textContent = m != null ? ammo + '/' + m : '';
      }
    }
  });
}

function setActionBadge(team, action) {
  const el = document.getElementById(`p${team + 1}-badge`);
  if (!el) return;
  if (!action) { el.textContent = 'READY'; el.className = 'action-badge'; return; }
  if (action.t === 'move') {
    const dirs = { '0,-1': '↑', '0,1': '↓', '-1,0': '←', '1,0': '→' };
    el.textContent = 'MOVE ' + (dirs[`${action.dx},${action.dy}`] || '?');
  } else { el.textContent = 'SHOOT'; }
  el.className = `action-badge ${team === 0 ? 'queued-p1' : 'queued-p2'}`;
}

function setTimeStatus(s) {
  const el = document.getElementById('time-status');
  if (!el) return;
  if (s === 'active') { el.textContent = 'ACTIVE'; el.className = 'time-status active'; }
  else { el.textContent = 'FROZEN'; el.className = 'time-status'; }
}

// ── Mouse aim ─────────────────────────────────────────────────────
function updateP1Aim(mx, my) {
  if (S.phase === 'gameover') return;
  const p = S.units.find(u => u.id === S.selectedId[0] && u.alive);
  if (!p) return;
  const cx = (p.rx + 0.5) * CELL, cy = (p.ry + 0.5) * CELL;
  const ddx = mx - cx, ddy = my - cy;
  if (Math.hypot(ddx, ddy) < CELL * 0.25) return;
  const angle = Math.atan2(ddy, ddx);
  const sector = Math.round(angle / (Math.PI / 4));
  const snapA = sector * (Math.PI / 4);
  p.aimDir = { dx: Math.round(Math.cos(snapA)), dy: Math.round(Math.sin(snapA)) };
}

// ── AI ────────────────────────────────────────────────────────────
function aiQueueAction(exec = true) {
  stopAIThinking();
  if (S.phase !== 'frozen') return;
  if (S.pending[1] !== null) return;
  const aiUnits = S.units.filter(u => {
    if (u.team !== 1 || !u.alive) return false;
    if (gameMode === 'adventure') return isVisible(u.x, u.y);
    return true;
  });
  if (!aiUnits.length) {
    if (gameMode === 'adventure') S.clockSide = 0; // no visible enemies — skip to player
    return;
  }
  if (!aiUnits.length) return;

  const humanAct = S.pending[0];
  const humanActUnit = humanAct ? S.units.find(u => u.id === humanAct.unitId) : null;

  // Predict bullet positions — AI nemato žaidėjo būsimų šūvių
  const nextBullets = S.bullets.filter(b => b.active).map(b => ({
    x: b.x + b.dx, y: b.y + b.dy, owner: b.owner
  }));

  const safe = (x, y) => !nextBullets.some(b => b.owner === 0 && b.x === x && b.y === y);

  // P1 future positions
  const p1Future = S.units.filter(u => u.team === 0 && u.alive).map(u => ({
    x: (humanAct?.unitId === u.id && humanAct?.t === 'move') ? u.x + humanAct.dx : u.x,
    y: (humanAct?.unitId === u.id && humanAct?.t === 'move') ? u.y + humanAct.dy : u.y,
  }));

  let best = null, bestScore = -Infinity;
  aiUnits.forEach(unit => {
    const res = aiUnitDecide(unit, nextBullets, safe, p1Future);
    if (!res) return;
    if (res.score > bestScore) { bestScore = res.score; best = { ...res.action, unitId: unit.id }; }
  });

  if (best) {
    const unit = S.units.find(u => u.id === best.unitId);
    if (unit && best.fo) unit.facing = best.fo;
    S.pending[1] = best;
    setActionBadge(1, best);
    S.selectedId[1] = best.unitId;
    if (exec) resolveTick();
  }
}

function aiUnitDecide(unit, nextBullets, safe, p1Future) {
  const nearest = p1Future.reduce((b, hu) => {
    const d = Math.abs(hu.x - unit.x) + Math.abs(hu.y - unit.y);
    return d < b.dist ? { ...hu, dist: d } : b;
  }, { dist: Infinity, x: unit.x, y: unit.y });

  const moves = [];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = unit.x + dx, ny = unit.y + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) continue;
    if (S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) continue;
    moves.push({ t: 'move', dx, dy, nx, ny });
  }

  const ps = (nx, ny) => {
    const ddx = Math.abs(nx - nearest.x), ddy = Math.abs(ny - nearest.y);
    const dist = ddx + ddy;
    const dB = dist < 2 ? -3 : dist <= 4 ? 1 : 0;
    return dB + (Math.random() - 0.5) * 10;  // daug atsitiktinumo
  };

  const curSafe = safe(unit.x, unit.y);
  const safeMoves = moves.filter(m => safe(m.nx, m.ny));

  // --- SPECIAL AI: DATA WORM CHASER ---
  if (unit.utype === 'worm' && moves.length > 0) {
    // Patikrinam tikrą atstumą, įskaitant uodegą, ne tik galvą
    let bodyAdjacent = false;
    let distToHead = Math.abs(nearest.x - unit.x) + Math.abs(nearest.y - unit.y);
    if (distToHead <= 1 && distToHead > 0) bodyAdjacent = true;
    if (!bodyAdjacent && unit.trail) {
      bodyAdjacent = unit.trail.some(t => {
        let hd = Math.abs(nearest.x - t.x) + Math.abs(nearest.y - t.y);
        return hd <= 1 && hd > 0;
      });
    }

    if (bodyAdjacent) {
      // PADAROM TIKRĄ MELEE ATAKĄ. Kirminas naudoja 'melee' logiką,
      // bet patį veiksmą perduodam kaip 'move' judesį į žaidėją, 
      // kad žaidimo variklis suveiktų jį kaip atsitrenkimą arba melee
      const dx = nearest.x - unit.x, dy = nearest.y - unit.y;
      unit.facing = { dx: dx === 0 ? 0 : Math.sign(dx), dy: dy === 0 ? 0 : Math.sign(dy) };

      // Išrenkam move vietoj shoot, variklis atskiria, kad "jei užima, tada muša"
      return { action: { t: 'move', dx: unit.facing.dx, dy: unit.facing.dy }, score: 100 };
    }

    // Ypač agresyvus kirminas - matomumas iki 20 celių
    if (distToHead <= 20) {
      let bestMove = safeMoves.length > 0 ? safeMoves[Math.floor(Math.random() * safeMoves.length)] : moves[0];
      let q = [{ x: unit.x, y: unit.y, move: null, d: 0 }];
      let visited = new Set([`${unit.x},${unit.y}`]);
      let found = false;

      while (q.length > 0) {
        const curr = q.shift();
        if (curr.x === nearest.x && curr.y === nearest.y) {
          if (curr.move) { bestMove = curr.move; found = true; }
          break;
        }
        if (curr.d > 20) continue;

        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = curr.x + dx, ny = curr.y + dy;
          const key = `${nx},${ny}`;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny) || visited.has(key)) continue;
          if (curr.d === 0 && S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) continue;

          visited.add(key);
          const isSafe = safe(nx, ny);
          if (curr.d === 0 && !isSafe && safeMoves.length > 0) continue;

          q.push({ x: nx, y: ny, move: curr.move || { dx, dy, nx, ny, t: 'move' }, d: curr.d + 1 });
        }
      }

      if (!found) {
        let bestDist = Infinity;
        const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
        for (const m of candidateMoves) {
          const d = Math.abs(nearest.x - m.nx) + Math.abs(nearest.y - m.ny);
          if (d < bestDist) {
            bestDist = d;
            bestMove = m;
          }
        }
      }

      unit.facing = { dx: bestMove.dx, dy: bestMove.dy };
      return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: 100 };
    } else {
      // Slankioja jei nežino kur žaidėjas
      const m = moves[Math.floor(Math.random() * moves.length)];
      unit.facing = { dx: m.dx, dy: m.dy };
      return { action: { t: 'move', dx: m.dx, dy: m.dy }, score: 10 };
    }
  }
  // --- END OF WORM AI ---

  // --- GRUNT / SHOOTER AI ---
  // 1. Dodge (85% tikimybė)
  if (!curSafe && safeMoves.length > 0 && Math.random() < 0.85) {
    const m = safeMoves[Math.floor(Math.random() * safeMoves.length)];
    unit.facing = { dx: m.dx, dy: m.dy };
    return { action: { t: 'move', dx: m.dx, dy: m.dy }, score: 90 };
  }

  // 2. Shoot (agresyvus - 100% jeigu tiesi lauko matrica ir nera sienu)
  // Check if player is on the same row/col and clear line of sight
  if (unit.ammo > 0) {
    for (const hu of p1Future) {
      const ddx = hu.x - unit.x, ddy = hu.y - unit.y;
      if (ddx === 0 || ddy === 0) {
        let isClear = true;
        const dist = Math.max(Math.abs(ddx), Math.abs(ddy));
        const stx = Math.sign(ddx), sty = Math.sign(ddy);
        for (let i = 1; i < dist; i++) {
          if (isWall(unit.x + stx * i, unit.y + sty * i)) { isClear = false; break; }
        }
        if (isClear) {
          const fo = { dx: stx, dy: sty };
          return { action: { t: 'shoot', fo }, score: 100 - nearest.dist };
        }
      }
    }
  }

  // 3. Move closer and align to player
  let bestMove = null;
  let bestDist = Infinity;
  const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
  for (const m of candidateMoves) {
    const d = Math.abs(nearest.x - m.nx) + Math.abs(nearest.y - m.ny);
    // Give a bonus if moving here aligns them exactly on the same row/col as player
    const alignBonus = (nearest.x === m.nx || nearest.y === m.ny) ? -1.5 : 0;
    const finalScore = d + alignBonus;
    if (finalScore < bestDist) {
      bestDist = finalScore;
      bestMove = m;
    }
  }

  // Move smart 80% of the time, random 20%
  if (bestMove && Math.random() < 0.8) {
    unit.facing = { dx: bestMove.dx, dy: bestMove.dy };
    return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: 50 };
  }

  // 4. Random safe move
  if (safeMoves.length > 0) {
    const m = safeMoves[Math.floor(Math.random() * safeMoves.length)];
    unit.facing = { dx: m.dx, dy: m.dy };
    return { action: { t: 'move', dx: m.dx, dy: m.dy }, score: 10 };
  }

  // 5. Random any move
  if (moves.length > 0) {
    const m = moves[Math.floor(Math.random() * moves.length)];
    unit.facing = { dx: m.dx, dy: m.dy };
    return { action: { t: 'move', dx: m.dx, dy: m.dy }, score: 1 };
  }
  return null;
}

function aiShootDir(unit, tx, ty) {
  const dx = tx - unit.x, dy = ty - unit.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  let fo;
  if (adx > ady * 2.5) fo = { dx: Math.sign(dx), dy: 0 };
  else if (ady > adx * 2.5) fo = { dx: 0, dy: Math.sign(dy) };
  else fo = { dx: Math.sign(dx), dy: Math.sign(dy) };
  unit.facing = fo; return fo;
}

// ── Screen management ─────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
  const el = document.getElementById(id);
  if (el) { el.style.display = 'flex'; el.classList.add('active'); }
}

function showGameOver() {
  const ann = document.getElementById('go-announce');
  const sub = document.getElementById('go-subtitle');
  const sts = document.getElementById('go-stats');
  const forfeit = S.timeForfeited >= 0;
  if (gameMode === 'adventure') {
    if (S.winner === 0) { ann.textContent = `MAINFRAME LAYER ${S.floor || 1} CLEARED`; ann.className = 'go-announce'; sub.textContent = 'SYSTEM ERRORS PURGED'; }
    else { ann.textContent = 'CRITICAL FAILURE'; ann.className = 'go-announce p2'; sub.textContent = S.energyDepleted ? 'VOLTAGE DEPLETED' : 'KILLED BY BUG'; }
  } else if (S.winner === -1) { ann.textContent = 'DRAW'; ann.className = 'go-announce draw'; sub.textContent = 'MUTUAL CRASH'; }
  else if (S.winner === 0) { ann.textContent = gameMode === 'pve' ? 'YOU WIN' : 'TEAM 1 WINS'; ann.className = 'go-announce'; sub.textContent = forfeit ? 'TIME FORFEIT' : (gameMode === 'pve' ? 'CPU SQUAD ELIMINATED' : 'TACTICAL SUPREMACY'); }
  else { ann.textContent = gameMode === 'pve' ? 'CPU WINS' : 'TEAM 2 WINS'; ann.className = 'go-announce p2'; sub.textContent = forfeit ? 'TIME FORFEIT' : (gameMode === 'pve' ? 'TRY AGAIN' : 'TACTICAL SUPREMACY'); }
  const l1 = gameMode === 'pve' ? 'YOU' : 'T1', l2 = gameMode === 'pve' ? 'CPU' : 'T2';
  if (sts) sts.innerHTML = `
    <div class="stat-cell"><div class="lbl">TICKS</div><div class="val">${stats.ticks}</div></div>
    <div class="stat-cell"><div class="lbl">${l1} SHOTS</div><div class="val cyan">${stats.shots[0]}</div></div>
    <div class="stat-cell"><div class="lbl">${l2} SHOTS</div><div class="val red">${stats.shots[1]}</div></div>
    <div class="stat-cell"><div class="lbl">${l1} HITS</div><div class="val cyan">${stats.hits[0]}</div></div>
    <div class="stat-cell"><div class="lbl">${l2} HITS</div><div class="val red">${stats.hits[1]}</div></div>`;
  showScreen('screen-gameover');
}

window.startGame = function startGame(mode) {
  SFX.init();
  BGM.start('game');
  SFX.select();
  gameMode = mode || gameMode;
  stopAIThinking();
  if (raf) cancelAnimationFrame(raf);
  tickTimer = null; tickStart = null;

  if (gameMode === 'adventure') initAdventure();
  else if (gameMode === 'hub') initHubRoom();
  else initState();

  updateHUD(); setTimeStatus('frozen');
  const p2ctrl = document.getElementById('p2-controls');
  const p2name = document.querySelector('#panel-p2 .panel-name');
  const p1clock = document.getElementById('p1-clock');
  const p2clock = document.getElementById('p2-clock');
  const energyHud = document.getElementById('energy-hud');
  const gameLayout = document.querySelector('.game-layout');
  // Resolve current panel reference (may be detached from DOM)
  const panelP2 = document.getElementById('panel-p2') || _p2PanelEl;
  const unitList = document.querySelector('#panel-p1 .unit-list');
  const p1badge = document.getElementById('p1-badge');
  const combatHubStats = document.getElementById('combat-hub-stats');
  const screenGame = document.getElementById('screen-game');

  if (gameMode === 'adventure' || gameMode === 'hub') {
    if (p2ctrl) p2ctrl.textContent = 'ENEMIES';
    if (p2name) p2name.textContent = 'DUNGEON';
    if (p2clock) p2clock.style.display = 'none';
    if (p1clock) p1clock.style.display = 'none';
    if (energyHud) energyHud.style.display = 'flex';
    if (unitList) unitList.style.display = 'none';
    if (p1badge) p1badge.style.display = 'none';
    if (combatHubStats) combatHubStats.style.display = 'block';

    if (panelP2 && panelP2.parentNode) {
      _p2PanelEl = panelP2;
      panelP2.parentNode.removeChild(panelP2);
    }
    const logPanel = document.getElementById('panel-log');
    if (logPanel) logPanel.style.display = gameMode === 'hub' ? 'none' : 'flex'; // hide log in hub
    if (screenGame) screenGame.classList.add('adv-mode');
    advCanvasW = ADV_COLS * CELL;
    updateEnergyHud();
    const hubBtn = document.getElementById('btn-open-hub');
    if (hubBtn) hubBtn.style.display = 'block';
    const invBtn = document.getElementById('btn-inventory');
    if (invBtn) invBtn.style.display = 'flex';
    const wipeBtn = document.querySelector('.btn-wipe-inline');
    if (wipeBtn) wipeBtn.style.display = 'block';
    document.getElementById('hub-overlay').classList.remove('active');
  } else {
    if (p2ctrl) p2ctrl.textContent = gameMode === 'pve' ? 'CPU · AUTO' : '↑↓←→ · ENTER · U/I/O';
    if (p2name) p2name.textContent = gameMode === 'pve' ? 'CPU' : 'PLAYER 2';
    if (p2clock) p2clock.style.display = '';
    if (p1clock) p1clock.style.display = '';
    if (energyHud) energyHud.style.display = 'none';
    if (unitList) unitList.style.display = '';
    if (p1badge) p1badge.style.display = '';
    if (_p2PanelEl && gameLayout && !document.getElementById('panel-p2')) {
      const logPanel = document.getElementById('panel-log');
      if (logPanel) gameLayout.insertBefore(_p2PanelEl, logPanel);
      else gameLayout.appendChild(_p2PanelEl);
    }
    const logPanel = document.getElementById('panel-log');
    if (logPanel) logPanel.style.display = 'none';
    if (screenGame) screenGame.classList.remove('adv-mode');
    advCanvasW = BOARD_W;
    const hubBtn = document.getElementById('btn-open-hub');
    if (hubBtn) hubBtn.style.display = 'none';
    const invBtn = document.getElementById('btn-inventory');
    if (invBtn) invBtn.style.display = 'none';
    const wipeBtn = document.querySelector('.btn-wipe-inline');
    if (wipeBtn) wipeBtn.style.display = 'none';
  }
  showScreen('screen-game');
  canvas.width = advCanvasW; canvas.height = gameMode === 'adventure' ? ADV_CANVAS_H : BOARD_H;
  lastTime = performance.now(); raf = requestAnimationFrame(loop);
}

function backToMenu() {
  if (gameMode === 'adventure' && S.inventory) {
    Profile.inventory = S.inventory.map(x => x ? { ...x } : null);
    saveProfile();
  }
  BGM.start('menu');
  stopAIThinking();
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
  showScreen('screen-menu');
}

// ── Utilities ─────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t) { const c = 1.3; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
function hexAlpha(hex, a) {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
}

// ── Bootstrap ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  canvas.width = BOARD_W; canvas.height = BOARD_H;

  // Screen routing
  document.getElementById('btn-adv').addEventListener('click', () => {
    SFX.init();
    loadProfile();
    S.floor = 1;
    startGame('adventure');
  });

  document.getElementById('btn-1p').addEventListener('click', () => { SFX.init(); startGame('pve'); });
  document.getElementById('btn-2p').addEventListener('click', () => { SFX.init(); startGame('pvp'); });

  document.getElementById('btn-rematch').addEventListener('click', () => {
    SFX.init();
    if (gameMode === 'adventure') {
      Profile.inventory = (S.inventory || []).map(x => x ? { ...x } : null);
      saveProfile();
      document.getElementById('screen-gameover').classList.remove('active');
      document.getElementById('screen-hub').classList.add('active');
      BGM.start('hub');
    } else {
      startGame();
    }
  });

  document.getElementById('btn-menu-go').addEventListener('click', () => { SFX.init(); backToMenu(); });
  document.getElementById('btn-esc').addEventListener('click', () => { SFX.init(); backToMenu(); });
  document.getElementById('btn-hub-back').addEventListener('click', () => { SFX.init(); BGM.start('menu'); showScreen('screen-menu'); });

  // Hook for quick restart from Game Over screen
  document.addEventListener('keydown', e => {
    if (S.phase === 'gameover') {
      if (e.code === 'Space' || e.key === 'r' || e.key === 'R') {
        SFX.init();
        if (gameMode === 'adventure') {
          Profile.inventory = (S.inventory || []).map(x => x ? { ...x } : null);
          saveProfile();
          document.getElementById('screen-gameover').classList.remove('active');
          document.getElementById('screen-hub').classList.add('active');
          BGM.start('hub');
        } else {
          startGame();
        }
      } else if (e.key === 'Escape') {
        SFX.init();
        backToMenu();
      }
    }
  });

  // Handle first interaction to start menu music
  const startMenuBGM = () => {
    SFX.init();
    BGM.start('menu');
    document.removeEventListener('mousedown', startMenuBGM);
    document.removeEventListener('keydown', startMenuBGM);
  };
  document.addEventListener('mousedown', startMenuBGM);
  document.addEventListener('keydown', startMenuBGM);

  function canvasCoords(e) {
    const r = canvas.getBoundingClientRect();
    const canvasH = gameMode === 'adventure' ? ADV_CANVAS_H : BOARD_H;
    const sx = (e.clientX - r.left) * advCanvasW / r.width;
    const sy = (e.clientY - r.top) * canvasH / r.height;
    if (gameMode === 'adventure' && S.cam) return { x: sx + S.cam.x, y: sy + S.cam.y };
    return { x: sx, y: sy };
  }

  canvas.addEventListener('mousemove', e => { const { x, y } = canvasCoords(e); updateP1Aim(x, y); });

  canvas.addEventListener('click', e => {
    SFX.init();
    const { x, y } = canvasCoords(e);
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    // Click on a P1 unit → select it
    const clicked = S.units.find(u => u.team === 0 && u.alive && u.x === gx && u.y === gy);
    if (clicked) {
      SFX.select();
      S.selectedId[0] = clicked.id;
      updateP1Aim(x, y);
      return;
    }
    // Click elsewhere → shoot with selected unit
    if (S.phase !== 'frozen') return;
    if (S.clockSide !== 0) return;
    const sel = S.units.find(u => u.id === S.selectedId[0] && u.alive);
    if (!sel || S.pending[0] !== null) return;
    const wepC = getCurrentWeapon(sel);
    if (gameMode === 'adventure') {
      let nrgReq = 0;
      if (wepC === 'bullet') nrgReq = 1;
      if (wepC === 'laser') nrgReq = 2;
      if (wepC === 'heavy' || wepC === 'shotgun') nrgReq = 3;
      if (wepC !== 'melee' && S.energy < nrgReq) return;
    } else {
      if (wepC === 'bullet' && sel.ammo <= 0) return;
      if (wepC === 'laser' && sel.laserAmmo <= 0) return;
      if (wepC === 'heavy' && sel.heavyAmmo <= 0) return;
      if (wepC === 'shotgun' && sel.shotgunAmmo <= 0) return;
    }
    updateP1Aim(x, y);
    S.pending[0] = { unitId: sel.id, t: 'shoot' };
    setActionBadge(0, S.pending[0]);
    if (gameMode === 'pve' || gameMode === 'adventure') {
      resolveTick();
    } else {
      if (!tickTimer) tickTimer = setTimeout(resolveTick, TICK_WINDOW);
    }
  });

  // Skill bar clicks (P1)
  ['bullet', 'laser', 'heavy', 'shotgun'].forEach((wep, i) => {
    const slot = document.getElementById(`p1-sk-${i}`);
    if (slot) slot.addEventListener('click', () => {
      SFX.init();
      SFX.select();
      const unit = S.units.find(u => u.id === S.selectedId[0] && u.alive);
      if (unit && !isAdjacentToEnemy(unit)) {
        unit.weapon = wep;
        updateSkillBar(0);
      }
    });
  });

  showScreen('screen-menu');
});
