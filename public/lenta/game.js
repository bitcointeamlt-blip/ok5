'use strict';
// ----------------------------------------------------------------
//  TIMELOCK BOARD - 3v3 edition (12x12 grid)
// ----------------------------------------------------------------

// ---- Fragment System -------------------------------------------
const FRAG_PER_CHIP = 10; // fragments needed to assemble 1 chip

// ---- Slot Combination Prize Table ------------------------------
// [matchCount][rarity] -> prize
const COMBO_PRIZES = {
  4: {
    common: { val: 5, name: '5 CHIP', rarity: 'common' },
    uncommon: { val: 5, name: '5 CHIP', rarity: 'uncommon' },
    rare: { val: 5, name: '5 CHIP', rarity: 'rare' },
    epic: { val: 5, name: '5 CHIP', rarity: 'epic' },
    legendary: { val: 5, name: '5 CHIP', rarity: 'legendary' },
  },
  3: {
    common: { val: 2, name: '2 CHIP', rarity: 'common' },
    uncommon: { val: 2, name: '2 CHIP', rarity: 'uncommon' },
    rare: { val: 2, name: '2 CHIP', rarity: 'rare' },
    epic: { val: 2, name: '2 CHIP', rarity: 'epic' },
    legendary: { val: 2, name: '2 CHIP', rarity: 'legendary' },
  },
  2: {
    common: { val: 1, name: '1 CHIP', rarity: 'common' },
    uncommon: { val: 1, name: '1 CHIP', rarity: 'uncommon' },
    rare: { val: 1, name: '1 CHIP', rarity: 'rare' },
    epic: { val: 1, name: '1 CHIP', rarity: 'epic' },
    legendary: { val: 1, name: '1 CHIP', rarity: 'legendary' },
  },
};
const EMPTY_PRIZE = { val: 0, name: 'EMPTY', rarity: 'empty', matchCount: 0 };

function evaluateCombination(reels) {
  if (reels.includes('empty')) return EMPTY_PRIZE;
  // Special: all 4 gems = PIXEL jackpot
  if (reels.every(r => r === 'gem')) return { val: 5, name: '5 PIXEL', rarity: 'gem', matchCount: 4 };
  // Special: all 4 ronke = RONKE jackpot
  if (reels.every(r => r === 'ronke')) return { val: 5, name: '5 POISON', rarity: 'ronke', matchCount: 4 };
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
  mythic: '#ffffff',
};

// ThreeJS WebGL Offscreen Integration
let t3d = {
  renderer: null,
  scene: null,
  camera: null,
  boss01Model: null,
  clock: null,
  mixer: null,
  ready: false
};

function initThreeJS() {
  if (!window.THREE) return;
  t3d.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  t3d.renderer.setSize(300, 300); // Sharp resolution for the sprite
  t3d.scene = new THREE.Scene();

  t3d.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  t3d.camera.position.set(0, 3, 5);
  t3d.camera.lookAt(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  t3d.scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(5, 10, 5);
  t3d.scene.add(dirLight);

  t3d.clock = new THREE.Clock();

  if (window.THREE.GLTFLoader) {
    const loader = new THREE.GLTFLoader();
    loader.load('boss01.glb', (gltf) => {
      t3d.boss01Model = gltf.scene;

      // Try to center and auto-scale
      const box = new THREE.Box3().setFromObject(t3d.boss01Model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.1);
      const fov = t3d.camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.35; // Closer camera
      t3d.camera.position.set(center.x, center.y + maxDim * 0.35, center.z + cameraZ);
      t3d.camera.lookAt(center);

      // Create Animation Mixer if it has animations
      if (gltf.animations && gltf.animations.length > 0) {
        t3d.mixer = new THREE.AnimationMixer(t3d.boss01Model);
        const action = t3d.mixer.clipAction(gltf.animations[0]);
        action.play();
      }

      t3d.scene.add(t3d.boss01Model);
      t3d.ready = true;
      console.log('Loaded Boss01 3D Model', gltf.scene);
    }, undefined, (error) => {
      console.error('Error loading boss01.glb:', error);
    });
  }
}

const BASE_COLS = 20;
const BASE_ROWS = 16;
const ADV_COLS = 42;   // adventure viewport width  (cells visible on screen)
const ADV_CANVAS_H = 848;  // adventure viewport height in pixels (fixed, not tied to CELL)
let ADV_MAP_COLS = 48;   // adventure full map width
let ADV_MAP_ROWS = 32;   // adventure full map height
let COLS = BASE_COLS;
let ROWS = BASE_ROWS;
const CELL = 54;
const UNIT_CELL = 34; // unit rendering size stays fixed
const BOARD_W = BASE_COLS * UNIT_CELL;   // PvP canvas width (fixed, not scaled with CELL)
const BOARD_H = BASE_ROWS * UNIT_CELL;   // PvP viewport height (fixed)
const MAX_HP = 5;
const MAX_AMMO = 5;
const AMMO_REGEN = 4;
const TICK_WINDOW = 90;
const ANIM_MS = 240;
const P1_COLOR = '#00f5ff';
const P2_COLOR = '#ff3c55';
// ── Daily Check-In ────────────────────────────────────────────────
const DAILY_REWARDS = [
  { ronke: 5,  pixel: 0 },
  { ronke: 10, pixel: 0 },
  { ronke: 15, pixel: 0 },
  { ronke: 20, pixel: 0 },
  { ronke: 25, pixel: 0 },
  { ronke: 0,  pixel: 5 },
  { ronke: 0,  pixel: 10 },
];

function getDailyData() {
  try { return JSON.parse(localStorage.getItem('ufo_daily') || 'null') || { streak: 0, lastDate: null, claimed: false }; }
  catch(e) { return { streak: 0, lastDate: null, claimed: false }; }
}
function saveDailyData(d) { localStorage.setItem('ufo_daily', JSON.stringify(d)); }

function updateDailyStreak() {
  const today = new Date().toDateString();
  const d = getDailyData();
  if (d.lastDate === today) return d;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const streak = d.lastDate === yesterday ? (d.streak % 7) + 1 : 1;
  const nd = { streak, lastDate: today, claimed: false };
  saveDailyData(nd); return nd;
}

function renderDailyGrid() {
  const d = getDailyData();
  const grid = document.getElementById('daily-grid');
  const badge = document.getElementById('daily-streak-badge');
  if (!grid) return;
  badge.textContent = 'DAY ' + d.streak;
  grid.innerHTML = '';
  const mult = 1 + getTotalDailyBonus();
  for (let i = 1; i <= 7; i++) {
    const r = DAILY_REWARDS[i - 1];
    const claimed = i < d.streak || (i === d.streak && d.claimed);
    const current = i === d.streak;
    const card = document.createElement('div');
    card.className = 'daily-day-card ' + (claimed ? 'claimed' : current ? 'current' : 'future');
    const dispRonke = r.ronke > 0 ? Math.floor(r.ronke * mult) : 0;
    const dispPixel = r.pixel > 0 ? Math.floor(r.pixel * mult) : 0;
    let rewardHTML;
    if (dispRonke > 0 && dispPixel > 0) {
      rewardHTML = `
        <div class="daily-day-reward">
          <img src="ronke.png" class="daily-icon-img">
          <span class="daily-day-amt">+${dispRonke}</span>
        </div>
        <div class="daily-day-bonus">
          <img src="pix.png" class="daily-icon-img"> <span>+${dispPixel}</span>
        </div>`;
    } else if (dispPixel > 0) {
      rewardHTML = `
        <div class="daily-day-reward">
          <img src="pix.png" class="daily-icon-img">
          <span class="daily-day-amt">+${dispPixel}</span>
        </div>`;
    } else {
      rewardHTML = `
        <div class="daily-day-reward">
          <img src="ronke.png" class="daily-icon-img">
          <span class="daily-day-amt">+${dispRonke}</span>
        </div>`;
    }
    let cardFooter;
    if (claimed) {
      cardFooter = '<div class="card-claim-done">✓</div>';
    } else if (current) {
      cardFooter = '<button class="card-claim-btn" onclick="window.claimDailyReward()">CLAIM</button>';
    } else {
      cardFooter = '<div class="card-claim-locked"></div>';
    }
    card.innerHTML = `<div class="daily-day-num">DAY ${i}</div>${rewardHTML}${cardFooter}`;
    grid.appendChild(card);
  }
}

function openRewardsModal() {
  updateDailyStreak();
  renderDailyGrid();
  renderKillGrid();
  renderEnergyGrid();
  renderLaserUseGrid();
  if (typeof renderChestGrid === 'function') renderChestGrid();
  updateClaimDots();
  ['daily','kill','energy','laser','chest'].forEach(s => {
    const body = document.getElementById(s + '-body');
    const arrow = document.getElementById(s + '-arrow');
    if (body) body.classList.add('sec-collapsed');
    if (arrow) arrow.style.transform = 'rotate(-90deg)';
  });
  const el = document.getElementById('rewards-overlay');
  if (el) el.classList.remove('hidden');
}
function closeRewardsModal() {
  const el = document.getElementById('rewards-overlay');
  if (el) el.classList.add('hidden');
}
window.toggleRewardsSection = function(section) {
  const body = document.getElementById(section + '-body');
  const arrow = document.getElementById(section + '-arrow');
  if (!body) return;
  const collapsed = body.classList.toggle('sec-collapsed');
  if (arrow) arrow.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
};
function updateClaimDots() {
  const dd = getDailyData();
  const today = new Date().toDateString();
  const dailyReady = dd.lastDate === today && !dd.claimed;
  const dailyTag = document.getElementById('daily-claim-tag');
  const dailyHdr = document.getElementById('daily-header');
  const dailyBadge = document.getElementById('daily-streak-badge');
  if (dailyTag) dailyTag.classList.toggle('hidden', !dailyReady);
  if (dailyHdr) dailyHdr.classList.toggle('has-claim', dailyReady);
  if (dailyBadge) dailyBadge.classList.toggle('badge-dim', !dailyReady);

  const kd = getKillData();
  const killReady = kd.tier < KILL_TIERS.length &&
    Math.max(0, getTotalKills() - (kd.spentKills || 0)) >= KILL_TIERS[kd.tier]?.kills;
  const killTag = document.getElementById('kill-claim-tag');
  const killHdr = document.getElementById('kill-header');
  const killBadge = document.getElementById('kill-tier-badge');
  if (killTag) killTag.classList.toggle('hidden', !killReady);
  if (killHdr) killHdr.classList.toggle('has-claim', killReady);
  if (killBadge) killBadge.classList.toggle('badge-dim', !killReady);

  const ed = getEnergyData();
  const energyReady = ed.tier < ENERGY_TIERS.length &&
    getCurrentMaxEnergy() >= ENERGY_TIERS[ed.tier]?.energy;
  const energyTag = document.getElementById('energy-claim-tag');
  const energyHdr = document.getElementById('energy-header');
  const energyBadge = document.getElementById('energy-tier-badge');
  if (energyTag) energyTag.classList.toggle('hidden', !energyReady);
  if (energyHdr) energyHdr.classList.toggle('has-claim', energyReady);
  if (energyBadge) energyBadge.classList.toggle('badge-dim', !energyReady);

  const ld = getLaserUseData();
  const laserReady = ld.tier < LASER_USE_TIERS.length &&
    Math.max(0, (ld.totalUses || 0) - (ld.spentUses || 0)) >= LASER_USE_TIERS[ld.tier]?.uses;
  const laserTag = document.getElementById('laser-claim-tag');
  const laserHdr = document.getElementById('laser-header');
  const laserBadge = document.getElementById('laser-tier-badge');
  if (laserTag) laserTag.classList.toggle('hidden', !laserReady);
  if (laserHdr) laserHdr.classList.toggle('has-claim', laserReady);
  if (laserBadge) laserBadge.classList.toggle('badge-dim', !laserReady);

  if (typeof getChestData === 'function') {
    const cd = getChestData();
    const chestReady = cd.tier < (typeof CHEST_USE_TIERS !== 'undefined' ? CHEST_USE_TIERS.length : 0) &&
      Math.max(0, (cd.totalOpened || 0) - (cd.spentOpened || 0)) >= CHEST_USE_TIERS[cd.tier]?.chests;
    const chestTag = document.getElementById('chest-claim-tag');
    const chestHdr = document.getElementById('chest-header');
    const chestBadge = document.getElementById('chest-tier-badge');
    if (chestTag) chestTag.classList.toggle('hidden', !chestReady);
    if (chestHdr) chestHdr.classList.toggle('has-claim', chestReady);
    if (chestBadge) chestBadge.classList.toggle('badge-dim', !chestReady);
  }
}
window.showRewards      = openRewardsModal;
window.closeRewards     = closeRewardsModal;
window.showDailyCheckin = openRewardsModal;
window.closeDailyCheckin= closeRewardsModal;
window.claimDailyReward = function() {
  const d = getDailyData();
  if (d.claimed) return;
  const r = DAILY_REWARDS[(d.streak - 1) % 7];
  const mult = 1 + getTotalDailyBonus();
  const ronkeAmt = r.ronke > 0 ? Math.floor(r.ronke * mult) : 0;
  const pixelAmt = r.pixel > 0 ? Math.floor(r.pixel * mult) : 0;
  if (ronkeAmt > 0) addToInventory('ronke',    null, ronkeAmt);
  if (pixelAmt > 0) addToInventory('fragment', null, pixelAmt);
  if (typeof updateInventoryUI === 'function') updateInventoryUI();
  d.claimed = true; saveDailyData(d);
  const bonusPct = Math.round(getTotalDailyBonus() * 100);
  const bonusStr = bonusPct > 0 ? ` (+${bonusPct}% BONUS)` : '';
  const msg = (ronkeAmt > 0 ? `+${ronkeAmt} POISON` : '') + (pixelAmt > 0 ? ` +${pixelAmt} FRAGMENT` : '') + bonusStr;
  showGameNotification('DAILY REWARD', msg, '#00ff88');
  renderDailyGrid();
};

// ── KILL REWARDS ──────────────────────────────────────────────────
// fresh kills needed per each tier
const KILL_TIERS = [
  { kills: 50,   bonus: 0.10 },
  { kills: 100,  bonus: 0.11 },
  { kills: 250,  bonus: 0.12 },
  { kills: 500,  bonus: 0.13 },
  { kills: 750,  bonus: 0.14 },
  { kills: 1000, bonus: 0.15 },
  { kills: 2000, bonus: 0.16 },
  { kills: 5000, bonus: 0.17 },
];
function getKillData() {
  const def = { tier: 0, lifetimeKills: 0, spentKills: 0 };
  let d;
  try { d = Object.assign({}, def, JSON.parse(localStorage.getItem('killRewards') || 'null') || {}); }
  catch { d = def; }
  // migrate: if tiers were claimed before spentKills existed, compute it now
  if (d.tier > 0 && !d.spentKills) {
    d.spentKills = KILL_TIERS.slice(0, d.tier).reduce((s, t) => s + t.kills, 0);
    saveKillData(d);
  }
  return d;
}
function saveKillData(d) { localStorage.setItem('killRewards', JSON.stringify(d)); }
function getKillBonus() {
  const kd = getKillData();
  return KILL_TIERS.slice(0, kd.tier).reduce((sum, t) => sum + t.bonus, 0);
}
function trackKill() {
  const kd = getKillData();
  kd.lifetimeKills = (kd.lifetimeKills || 0) + 1;
  saveKillData(kd);
}
function getTotalKills() {
  const kd = getKillData();
  // also pull Profile.stats.totalKills so pre-existing kills count
  const profileKills = (typeof Profile !== 'undefined' && Profile.stats && Profile.stats.totalKills) || 0;
  return Math.max(kd.lifetimeKills || 0, profileKills);
}
function renderKillGrid() {
  const kd = getKillData();
  const grid = document.getElementById('kill-grid');
  const badge = document.getElementById('kill-tier-badge');
  const progressFill = document.getElementById('kill-progress-fill');
  const progressLabel = document.getElementById('kill-progress-label');
  const bonusTag = document.getElementById('daily-kill-bonus-tag');
  if (!grid) return;
  if (bonusTag) {
    const bonusPct = Math.round(getTotalDailyBonus() * 100);
    bonusTag.textContent = '+' + bonusPct + '% TOTAL DAILY BONUS';
    bonusTag.style.color = bonusPct > 0 ? 'rgba(255,102,51,0.85)' : 'rgba(255,255,255,0.15)';
  }
  const total = getTotalKills();
  const available = Math.max(0, total - (kd.spentKills || 0));
  const allDone = kd.tier >= KILL_TIERS.length;
  badge.textContent = allDone ? 'MAX' : 'TIER ' + (kd.tier + 1);
  if (!allDone) {
    const needed = KILL_TIERS[kd.tier].kills;
    const pct = Math.min(100, (available / needed) * 100);
    progressFill.style.width = pct + '%';
    progressLabel.textContent = Math.min(available, needed) + ' / ' + needed + ' KILLS';
  } else {
    progressFill.style.width = '100%';
    progressLabel.textContent = 'ALL TIERS COMPLETE';
  }
  grid.innerHTML = '';
  for (let i = 0; i < KILL_TIERS.length; i++) {
    const t = KILL_TIERS[i];
    const claimed = i < kd.tier;
    const ready = !claimed && i === kd.tier && available >= t.kills;
    const current = i === kd.tier && !allDone;
    const card = document.createElement('div');
    card.className = 'kill-tier-card ' + (claimed ? 'claimed' : (current || ready) ? 'current' : 'future');
    const killLabel = t.kills >= 1000 ? (t.kills / 1000) + 'K' : t.kills;
    const bonusPct = Math.round(t.bonus * 100);
    let cardFooter;
    if (claimed) {
      cardFooter = '<div class="card-claim-done kt-done">✓</div>';
    } else if (ready) {
      cardFooter = `<button class="card-claim-btn kt-claim" onclick="window.claimKillReward()">CLAIM</button>`;
    } else {
      cardFooter = '<div class="card-claim-locked"></div>';
    }
    card.innerHTML = `
      <div class="kill-tier-num">${killLabel}<span class="kill-tier-unit"> KILLS</span></div>
      <div class="kill-tier-mid">+${bonusPct}%<div class="kill-tier-daily-label">DAILY<span class="kill-bonus-word">BONUS</span></div></div>
      ${cardFooter}
      ${claimed ? '<div class="kill-tier-check">✓</div>' : ''}`;
    grid.appendChild(card);
  }
}
window.showKillRewards  = openRewardsModal;
window.closeKillRewards = closeRewardsModal;
window.claimKillReward = function() {
  const kd = getKillData();
  if (kd.tier >= KILL_TIERS.length) return;
  const available = Math.max(0, getTotalKills() - (kd.spentKills || 0));
  if (available < KILL_TIERS[kd.tier].kills) return;
  kd.spentKills = (kd.spentKills || 0) + KILL_TIERS[kd.tier].kills;
  kd.tier++;
  saveKillData(kd);
  const bonusPct = Math.round(KILL_TIERS[kd.tier - 1].bonus * 100);
  showGameNotification('KILL REWARD', '+' + bonusPct + '% DAILY BONUS UNLOCKED', '#ff6633');
  renderKillGrid();
};

// ── ENERGY REWARDS ────────────────────────────────────────────────
const ENERGY_TIERS = [
  { energy: 110, bonus: 0.05 },
  { energy: 125, bonus: 0.06 },
  { energy: 135, bonus: 0.07 },
  { energy: 145, bonus: 0.08 },
  { energy: 160, bonus: 0.09 },
  { energy: 175, bonus: 0.10 },
  { energy: 200, bonus: 0.11 },
];
function getEnergyData() {
  const def = { tier: 0 };
  try { return Object.assign({}, def, JSON.parse(localStorage.getItem('energyRewards') || 'null') || {}); }
  catch { return def; }
}
function saveEnergyData(d) { localStorage.setItem('energyRewards', JSON.stringify(d)); }
function getEnergyBonus() {
  const ed = getEnergyData();
  return ENERGY_TIERS.slice(0, ed.tier).reduce((sum, t) => sum + t.bonus, 0);
}
function getCurrentMaxEnergy() {
  return 100 + (Profile?.upgrades?.maxEnergy || 0);
}
function renderEnergyGrid() {
  const ed = getEnergyData();
  const grid = document.getElementById('energy-grid');
  const badge = document.getElementById('energy-tier-badge');
  const progressFill = document.getElementById('energy-progress-fill');
  const progressLabel = document.getElementById('energy-progress-label');
  if (!grid) return;
  const curMax = getCurrentMaxEnergy();
  const allDone = ed.tier >= ENERGY_TIERS.length;
  if (badge) badge.textContent = allDone ? 'MAX' : 'TIER ' + (ed.tier + 1);
  if (!allDone) {
    const needed = ENERGY_TIERS[ed.tier].energy;
    const prev = ed.tier > 0 ? ENERGY_TIERS[ed.tier - 1].energy : 100;
    const pct = Math.min(100, Math.max(0, (curMax - prev) / (needed - prev) * 100));
    progressFill.style.width = pct + '%';
    progressLabel.textContent = curMax + ' / ' + needed + ' MAX ENERGY';
  } else {
    progressFill.style.width = '100%';
    progressLabel.textContent = 'ALL TIERS COMPLETE';
  }
  grid.innerHTML = '';
  for (let i = 0; i < ENERGY_TIERS.length; i++) {
    const t = ENERGY_TIERS[i];
    const claimed = i < ed.tier;
    const ready = !claimed && i === ed.tier && curMax >= t.energy;
    const card = document.createElement('div');
    card.className = 'energy-tier-card ' + (claimed ? 'claimed' : ready ? 'current' : 'future');
    const bonusPct = Math.round(t.bonus * 100);
    let cardFooter;
    if (claimed) {
      cardFooter = '<div class="kt-done energy-done">✓</div>';
    } else if (ready) {
      cardFooter = `<button class="kt-claim energy-claim" onclick="window.claimEnergyReward()">CLAIM</button>`;
    } else {
      cardFooter = '<div class="card-claim-locked"></div>';
    }
    card.innerHTML = `
      <div class="energy-tier-num">${t.energy}<span class="kill-tier-unit"> MAX</span></div>
      <div class="energy-tier-mid">+${bonusPct}%<div class="kill-tier-daily-label energy-tier-label">DAILY<span class="kill-bonus-word">BONUS</span></div></div>
      ${cardFooter}
      ${claimed ? '<div class="kill-tier-check energy-check">✓</div>' : ''}`;
    grid.appendChild(card);
  }
}
window.claimEnergyReward = function() {
  const ed = getEnergyData();
  if (ed.tier >= ENERGY_TIERS.length) return;
  if (getCurrentMaxEnergy() < ENERGY_TIERS[ed.tier].energy) return;
  ed.tier++;
  saveEnergyData(ed);
  const bonusPct = Math.round(ENERGY_TIERS[ed.tier - 1].bonus * 100);
  showGameNotification('ENERGY REWARD', '+' + bonusPct + '% DAILY BONUS UNLOCKED', '#00ccff');
  renderEnergyGrid();
};

// ── RONKE LASER REWARDS ───────────────────────────────────────────
const LASER_USE_TIERS = [
  { uses: 250,  bonus: 0.01 },
  { uses: 500,  bonus: 0.02 },
  { uses: 1000, bonus: 0.03 },
  { uses: 2500, bonus: 0.04 },
  { uses: 5000, bonus: 0.05 },
  { uses: 7500, bonus: 0.06 },
  { uses: 10000,bonus: 0.07 },
];
function getLaserUseData() {
  const def = { tier: 0, totalUses: 0, spentUses: 0 };
  try { return Object.assign({}, def, JSON.parse(localStorage.getItem('laserUseRewards') || 'null') || {}); }
  catch { return def; }
}
function saveLaserUseData(d) { localStorage.setItem('laserUseRewards', JSON.stringify(d)); }
function getLaserUseBonus() {
  const ld = getLaserUseData();
  return LASER_USE_TIERS.slice(0, ld.tier).reduce((sum, t) => sum + t.bonus, 0);
}
function trackRonkeLaser() {
  const ld = getLaserUseData();
  ld.totalUses = (ld.totalUses || 0) + 1;
  saveLaserUseData(ld);
}
function renderLaserUseGrid() {
  const ld = getLaserUseData();
  const grid = document.getElementById('laser-grid');
  const badge = document.getElementById('laser-tier-badge');
  const progressFill = document.getElementById('laser-progress-fill');
  const progressLabel = document.getElementById('laser-progress-label');
  if (!grid) return;
  const total = ld.totalUses || 0;
  const available = Math.max(0, total - (ld.spentUses || 0));
  const allDone = ld.tier >= LASER_USE_TIERS.length;
  if (badge) badge.textContent = allDone ? 'MAX' : 'TIER ' + (ld.tier + 1);
  if (!allDone) {
    const needed = LASER_USE_TIERS[ld.tier].uses;
    const pct = Math.min(100, (available / needed) * 100);
    if (progressFill) progressFill.style.width = pct + '%';
    const useLabel = needed >= 1000 ? (needed / 1000) + 'K' : needed;
    if (progressLabel) progressLabel.textContent = Math.min(available, needed) + ' / ' + useLabel + ' POISON USES';
  } else {
    if (progressFill) progressFill.style.width = '100%';
    if (progressLabel) progressLabel.textContent = 'ALL TIERS COMPLETE';
  }
  grid.innerHTML = '';
  for (let i = 0; i < LASER_USE_TIERS.length; i++) {
    const t = LASER_USE_TIERS[i];
    const claimed = i < ld.tier;
    const ready = !claimed && i === ld.tier && available >= t.uses;
    const card = document.createElement('div');
    card.className = 'laser-tier-card ' + (claimed ? 'claimed' : ready ? 'current' : 'future');
    const useLabel = t.uses >= 1000 ? (t.uses / 1000) + 'K' : t.uses;
    const bonusPct = Math.round(t.bonus * 100);
    let cardFooter;
    if (claimed) {
      cardFooter = '<div class="kt-done laser-done">✓</div>';
    } else if (ready) {
      cardFooter = '<button class="kt-claim laser-claim" onclick="window.claimLaserUseReward()">CLAIM</button>';
    } else {
      cardFooter = '<div class="card-claim-locked"></div>';
    }
    card.innerHTML =
      '<div class="laser-tier-num">' + useLabel + '<span class="kill-tier-unit"> USES</span></div>' +
      '<div class="laser-tier-mid">+' + bonusPct + '%<div class="kill-tier-daily-label laser-tier-label">DAILY<span class="kill-bonus-word">BONUS</span></div></div>' +
      cardFooter +
      (claimed ? '<div class="kill-tier-check laser-check">✓</div>' : '');
    grid.appendChild(card);
  }
}
window.claimLaserUseReward = function() {
  const ld = getLaserUseData();
  if (ld.tier >= LASER_USE_TIERS.length) return;
  const available = Math.max(0, (ld.totalUses || 0) - (ld.spentUses || 0));
  if (available < LASER_USE_TIERS[ld.tier].uses) return;
  ld.spentUses = (ld.spentUses || 0) + LASER_USE_TIERS[ld.tier].uses;
  ld.tier++;
  saveLaserUseData(ld);
  const bonusPct = Math.round(LASER_USE_TIERS[ld.tier - 1].bonus * 100);
  showGameNotification('POISON REWARD', '+' + bonusPct + '% DAILY BONUS UNLOCKED', '#44aaff');
  renderLaserUseGrid();
};

// ── CHEST REWARDS ───────────────────────────────────────────
const CHEST_USE_TIERS = [
  { chests: 5,   bonus: 0.01 },
  { chests: 15,  bonus: 0.02 },
  { chests: 30,  bonus: 0.03 },
  { chests: 50,  bonus: 0.04 },
  { chests: 70,  bonus: 0.05 },
  { chests: 100, bonus: 0.06 },
  { chests: 150, bonus: 0.07 },
  { chests: 200, bonus: 0.08 }
];
function getChestData() {
  const def = { tier: 0, totalOpened: 0, spentOpened: 0 };
  try { return Object.assign({}, def, JSON.parse(localStorage.getItem('chestRewards') || 'null') || {}); }
  catch { return def; }
}
function saveChestData(d) { localStorage.setItem('chestRewards', JSON.stringify(d)); }
function getChestBonus() {
  const cd = getChestData();
  return CHEST_USE_TIERS.slice(0, cd.tier).reduce((sum, t) => sum + t.bonus, 0);
}
function trackChestOpen() {
  const cd = getChestData();
  cd.totalOpened = (cd.totalOpened || 0) + 1;
  saveChestData(cd);
}
function renderChestGrid() {
  const cd = getChestData();
  const grid = document.getElementById('chest-grid');
  const badge = document.getElementById('chest-tier-badge');
  const progressFill = document.getElementById('chest-progress-fill');
  const progressLabel = document.getElementById('chest-progress-label');
  if (!grid) return;
  const total = cd.totalOpened || 0;
  const available = Math.max(0, total - (cd.spentOpened || 0));
  const allDone = cd.tier >= CHEST_USE_TIERS.length;
  if (badge) badge.textContent = allDone ? 'MAX' : 'TIER ' + (cd.tier + 1);
  if (!allDone) {
    const needed = CHEST_USE_TIERS[cd.tier].chests;
    const pct = Math.min(100, (available / needed) * 100);
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressLabel) progressLabel.textContent = Math.min(available, needed) + ' / ' + needed + ' CHESTS';
  } else {
    if (progressFill) progressFill.style.width = '100%';
    if (progressLabel) progressLabel.textContent = 'ALL TIERS COMPLETE';
  }
  grid.innerHTML = '';
  for (let i = 0; i < CHEST_USE_TIERS.length; i++) {
    const t = CHEST_USE_TIERS[i];
    const claimed = i < cd.tier;
    const ready = !claimed && i === cd.tier && available >= t.chests;
    const card = document.createElement('div');
    card.className = 'chest-tier-card ' + (claimed ? 'claimed' : ready ? 'current' : 'future');
    const bonusPct = Math.round(t.bonus * 100);
    let cardFooter;
    if (claimed) {
      cardFooter = '<div class="kt-done chest-done">✓</div>';
    } else if (ready) {
      cardFooter = '<button class="kt-claim chest-claim" onclick="window.claimChestReward()">CLAIM</button>';
    } else {
      cardFooter = '<div class="card-claim-locked"></div>';
    }
    card.innerHTML =
      '<div class="chest-tier-num">' + t.chests + '<span class="kill-tier-unit"> CHESTS</span></div>' +
      '<div class="chest-tier-mid">+' + bonusPct + '%<div class="kill-tier-daily-label chest-tier-label">DAILY<span class="kill-bonus-word">BONUS</span></div></div>' +
      cardFooter +
      (claimed ? '<div class="kill-tier-check chest-check">✓</div>' : '');
    grid.appendChild(card);
  }
}
window.claimChestReward = function() {
  const cd = getChestData();
  if (cd.tier >= CHEST_USE_TIERS.length) return;
  const available = Math.max(0, (cd.totalOpened || 0) - (cd.spentOpened || 0));
  if (available < CHEST_USE_TIERS[cd.tier].chests) return;
  cd.spentOpened = (cd.spentOpened || 0) + CHEST_USE_TIERS[cd.tier].chests;
  cd.tier++;
  saveChestData(cd);
  const bonusPct = Math.round(CHEST_USE_TIERS[cd.tier - 1].bonus * 100);
  showGameNotification('CHEST REWARD', '+' + bonusPct + '% DAILY BONUS UNLOCKED', '#ffaa00');
  renderChestGrid();
};

function getTotalDailyBonus() { return getKillBonus() + getEnergyBonus() + getLaserUseBonus() + (typeof getChestBonus === 'function' ? getChestBonus() : 0); }
// ─────────────────────────────────────────────────────────────────

const MAX_LASER = 1;
const LASER_REGEN = 3;
const MAX_HEAVY = 2;
const HEAVY_REGEN = 5;
const MAX_SHOTGUN = 3;
const SHOTGUN_REGEN = 4;
const SHOTGUN_RANGE = 6; // cells before pellets fade
const ENERGY_MAX = 100;
const FOG_RADIUS = 3;
const MISS_CHANCE = 0.15;   // 15% chance to miss
const CRIT_CHANCE_BASE = 0.03; // 3% base crit chance
function getCritChance() { return CRIT_CHANCE_BASE + (Profile.upgrades?.critLevel || 0) * 0.005 + ((S.floorBuffs?.critBonus || 0) / 100); }

// ---- Run Card System -------------------------------------------------------
// Temporary bonuses picked between rooms; cleared on death
const CARD_POOL = [
  { id: 'overcharge_rare', name: 'OVERCHARGE', svgIcon: 'bolt', desc: '+20 energy on room entry', rarity: 'rare', color: '#ffdd00' },
  { id: 'overcharge_epic', name: 'OVERCHARGE', svgIcon: 'bolt', desc: '+25 energy on room entry', rarity: 'epic', color: '#cc44ff' },
  { id: 'overcharge_legendary', name: 'OVERCHARGE', svgIcon: 'bolt', desc: '+35 energy on room entry', rarity: 'legendary', color: '#ff8800' },
  { id: 'ghost_step', name: 'GHOST STEP', svgIcon: 'ghost', desc: '+1 free jump per room', rarity: 'uncommon', color: '#44ffee' },
  { id: 'nano_regen', name: 'NANO REGEN', svgIcon: 'cross', desc: '+1 energy per 10 steps', rarity: 'uncommon', color: '#88ff44' },
  { id: 'crit_surge', name: 'CRIT SURGE', svgIcon: 'target', desc: '+10% crit chance', rarity: 'rare', color: '#ffaa00' },
  { id: 'hack_freeze', name: 'SIGNAL JAM', svgIcon: 'wave', desc: 'HACK freezes +1 turn (stacks)', rarity: 'rare', color: '#00ffcc' },
  { id: 'hack_ammo', name: 'HACK CACHE', svgIcon: 'chip', desc: '+1 HACK shot per floor (stacks)', rarity: 'uncommon', color: '#00ffcc' },
];

// Blood Rush bonus cards — only appear if player has bloodRushLevel >= 1
// Drawn with separate probability rolls before building the 5-card pool
const BLOOD_RUSH_CARDS = [
  { id: 'blood_rush_rare',      name: 'BLOOD RUSH', svgIcon: 'blood', desc: '+1⚡ per kill this run', rarity: 'rare',      color: '#ff6644', chance: 0.20 },
  { id: 'blood_rush_epic',      name: 'BLOOD RUSH', svgIcon: 'blood', desc: '+2⚡ per kill this run', rarity: 'epic',      color: '#ff3388', chance: 0.10 },
  { id: 'blood_rush_legendary', name: 'BLOOD RUSH', svgIcon: 'blood', desc: '+3⚡ per kill this run', rarity: 'legendary', color: '#ff0044', chance: 0.05 },
];

function applyRunCardBuffs() {
  for (const cardId of (S.runCards || [])) {
    switch (cardId) {
      // overcharge: applied immediately on card pick (in showCardPicker click handler)
      case 'ghost_step': S.jumpFreeCount += 1; break;
      case 'crit_surge': S.floorBuffs.critBonus += 10; break;
      case 'blood_rush_rare':      S.floorBuffs.bloodRushBonus = (S.floorBuffs.bloodRushBonus || 0) + 1; break;
      case 'blood_rush_epic':      S.floorBuffs.bloodRushBonus = (S.floorBuffs.bloodRushBonus || 0) + 2; break;
      case 'blood_rush_legendary': S.floorBuffs.bloodRushBonus = (S.floorBuffs.bloodRushBonus || 0) + 3; break;
      case 'hack_freeze': S.floorBuffs.hackFreezeBonus = (S.floorBuffs.hackFreezeBonus || 0) + 1; break;
      case 'hack_ammo': S.floorBuffs.hackAmmoBonus = (S.floorBuffs.hackAmmoBonus || 0) + 1; break;
      // nano_regen: handled per-step in the movement tick
    }
  }
}

function showCardPicker(onComplete) {
  // Build pool: base cards + blood rush bonus cards (if upgrade >= 1, each rolls independently)
  const pool = [...CARD_POOL];
  if ((Profile.upgrades?.bloodRushLevel || 0) >= 1) {
    for (const brc of BLOOD_RUSH_CARDS) {
      if (Math.random() < brc.chance) pool.push(brc);
    }
  }
  // Draw 5 unique random cards
  const drawn = [];
  for (let i = 0; i < 5 && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    drawn.push(pool.splice(idx, 1)[0]);
  }

  // Determine locked count based on cardSlotLevel upgrade
  const _csLvl = Profile.upgrades?.cardSlotLevel || 0;
  let _lockedCount = 3; // default: 2 selectable
  if (_csLvl >= 2) _lockedCount = 2;       // lvl2: always 3 selectable
  else if (_csLvl >= 1) _lockedCount = Math.random() < 0.5 ? 2 : 3; // lvl1: 50% chance 3rd unlocked

  const positions = [0, 1, 2, 3, 4];
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const lockedSet = new Set(positions.slice(0, _lockedCount));

  const overlay = document.createElement('div');
  overlay.id = 'card-picker-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:9999',
    'background:transparent',
    'display:flex;flex-direction:column;align-items:center;justify-content:flex-end',
    'font-family:"Press Start 2P",monospace',
    'gap:12px',
    'padding-bottom:32px',
    'pointer-events:none',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'CHOOSE A CARD';
  title.style.cssText = [
    'color:#00ffee;font-size:14px;letter-spacing:5px',
    'text-shadow:0 0 20px #00ffee,2px 2px 0 #000',
    'background:rgba(0,4,10,0.82);padding:6px 20px;border-bottom:1px solid #00ffee33',
    'pointer-events:none',
  ].join(';');
  overlay.appendChild(title);

  const sub = document.createElement('div');
  sub.textContent = 'BONUS LASTS UNTIL YOU DIE';
  sub.style.cssText = [
    'color:#445566;font-size:7px;letter-spacing:2px',
    'background:rgba(0,4,10,0.7);padding:3px 12px',
    'pointer-events:none',
  ].join(';');
  overlay.appendChild(sub);

  // Start reward music
  BGM.stop();
  setTimeout(() => BGM.start('reward'), 80);

  const row = document.createElement('div');
  row.style.cssText = [
    'display:flex;gap:10px;flex-wrap:wrap;justify-content:center;padding:8px 16px',
    'background:rgba(0,3,8,0.78);backdrop-filter:blur(4px)',
    'border-top:1px solid rgba(0,255,238,0.08)',
    'pointer-events:auto',
  ].join(';');

  // Each card stops at a staggered time (ms)
  const stopTimes = [900, 1350, 1750, 2100, 2400];
  let revealedCount = 0;
  const cardEls = [];

  drawn.forEach((finalCard, cardIdx) => {
    const isLocked = lockedSet.has(cardIdx);

    // Card shell — premium pixel art style, glowing borders, darker richer background
    const el = document.createElement('div');
    el.style.cssText = [
      'width:150px;height:236px',
      'border:2px solid #1a2030',
      'border-radius:2px',
      'background:linear-gradient(180deg, #05080f 0%, #020306 100%)',
      'display:flex;flex-direction:column',
      'transition:all 0.15s ease-out',
      'cursor:default;pointer-events:none;position:relative;overflow:hidden',
      'image-rendering:pixelated',
      'box-shadow: 0 10px 20px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.05)',
    ].join(';');

    // Top header strip
    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex;align-items:center;justify-content:space-between',
      'padding:5px 7px 4px',
      'border-bottom:2px solid rgba(0,0,0,0.6)',
      'background:#030610',
    ].join(';');
    const headerIcon = document.createElement('span');
    headerIcon.style.cssText = 'display:block;line-height:0;';
    const hCanvas = document.createElement('canvas');
    hCanvas.width = 10; hCanvas.height = 10;
    hCanvas.style.cssText = 'image-rendering:pixelated;width:12px;height:12px;display:block;';
    headerIcon.appendChild(hCanvas);
    const headerName = document.createElement('span');
    headerName.style.cssText = 'font-size:8px;letter-spacing:1px;color:#1e2d3a;text-align:right;flex:1;padding-left:5px;';
    header.append(headerIcon, headerName);

    // Center art area — premium stage area with radial glow
    const artArea = document.createElement('div');
    artArea.style.cssText = [
      'flex:1;display:flex;align-items:center;justify-content:center',
      'background:radial-gradient(circle at center, rgba(30,40,50,0.4) 0%, #010204 100%)',
      'border-bottom:1px solid rgba(255,255,255,0.05)',
      'position:relative',
      'box-shadow: inset 0 4px 10px rgba(0,0,0,0.8)',
    ].join(';');
    const iconWrap = document.createElement('div');
    // Subtly float the icon
    iconWrap.style.cssText = 'display:flex;align-items:center;justify-content:center; animation: floatIcon 3s ease-in-out infinite;';
    if (!document.getElementById('card-animations')) {
      const style = document.createElement('style');
      style.id = 'card-animations';
      style.textContent = '@keyframes floatIcon { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }';
      document.head.appendChild(style);
    }
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 16; iconCanvas.height = 16;
    iconCanvas.style.cssText = 'image-rendering:pixelated;width:60px;height:60px;display:block;';
    iconWrap.appendChild(iconCanvas);
    artArea.appendChild(iconWrap);
    const icon = iconWrap; // alias for lock filter compatibility

    // Info section
    const info = document.createElement('div');
    info.style.cssText = [
      'padding:8px 10px',
      'display:flex;flex-direction:column;gap:5px',
      'background:linear-gradient(180deg, rgba(8,12,20,0.8) 0%, rgba(2,4,8,0.9) 100%)',
      'border-bottom:1px solid rgba(0,0,0,0.8)',
    ].join(';');
    const name = document.createElement('div');
    name.style.cssText = 'font-size:12px;text-align:center;color:#ffffff;letter-spacing:1px;text-shadow:0 0 4px rgba(255,255,255,0.3);';
    const desc = document.createElement('div');
    desc.style.cssText = 'color:#6b8096;font-size:12px;line-height:1.6;text-align:center;font-family:sans-serif;letter-spacing:0.5px;';

    // Footer — pixel rarity dots
    const footer = document.createElement('div');
    footer.style.cssText = [
      'padding:6px 8px',
      'display:flex;align-items:center;justify-content:center;gap:5px',
      'background:#020306',
    ].join(';');
    const badge = document.createElement('div');
    badge.style.cssText = 'font-size:9px;letter-spacing:4px;color:#1a2030;text-shadow:1px 1px 0 #000;';
    footer.appendChild(badge);

    // Scanline overlay
    const scanlines = document.createElement('div');
    scanlines.style.cssText = [
      'position:absolute;inset:0;pointer-events:none;z-index:5',
      'background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 3px)',
    ].join(';');

    info.append(name, desc);
    el.append(header, artArea, info, footer, scanlines);
    cardEls.push({ el, icon, name, desc, badge, headerIcon, headerName, isLocked });
    row.appendChild(el);

    // Update displayed card content
    function setDisplay(c) {
      const emojiMap = { bolt: '⚡', ghost: '👻', cross: '💖', target: '🎯', blood: '🩸', wave: '〰️', chip: '💾' };
      const e = emojiMap[c.svgIcon] || '❓';

      const ctx2 = iconCanvas.getContext('2d');
      ctx2.clearRect(0, 0, 16, 16);
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.font = '12px sans-serif';
      ctx2.fillText(e, 8, 9);
      iconWrap.style.filter = `drop-shadow(0 0 10px ${c.color}cc) drop-shadow(0 0 4px ${c.color}77)`;

      const hCtx = hCanvas.getContext('2d');
      hCtx.clearRect(0, 0, 10, 10);
      hCtx.textAlign = 'center';
      hCtx.textBaseline = 'middle';
      hCtx.font = '8px sans-serif';
      hCtx.fillText(e, 5, 5);
      name.textContent = c.name;
      name.style.color = c.color;
      headerName.textContent = c.name;
      headerName.style.color = c.color + 'aa';
      desc.textContent = c.desc;
      // Highlighting numbers inside description for extra polish
      desc.innerHTML = c.desc.replace(/(\+\d+%?|-?\d+)/g, `<span style="color:${c.color};text-shadow:0 0 4px ${c.color}">$1</span>`);
      const rarityDots = { uncommon: '■', rare: '■ ■', epic: '■ ■ ■', legendary: '■ ■ ■ ■' };
      badge.textContent = rarityDots[c.rarity] || '■';
      badge.style.color = c.color;
      badge.style.textShadow = `0 0 8px ${c.color}, 0 0 2px #fff`;
      header.style.background = `linear-gradient(90deg, ${c.color}22 0%, rgba(0,0,0,0) 100%)`;
      header.style.borderBottomColor = c.color + '55';
      el.style.borderColor = c.color + '55';
      el.style.boxShadow = `0 10px 25px rgba(0,0,0,0.9), inset 0 0 15px ${c.color}15, inset 0 0 0 1px ${c.color}33`;
    }

    // Recursive cycling with slowdown near reveal
    const startTime = performance.now();
    const revealAt = stopTimes[cardIdx];

    function cycle() {
      const elapsed = performance.now() - startTime;
      const remaining = revealAt - elapsed;

      if (remaining <= 0) {
        // REVEAL: show card content, then apply lock overlay if needed
        setDisplay(finalCard);
        SFX.cardReveal(cardIdx);

        if (isLocked) {
          el.style.borderColor = '#0d1018';
          el.style.boxShadow = '0 10px 20px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.05)';
          setTimeout(() => {
            el.style.boxShadow = '0 10px 20px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.05)';
            iconWrap.style.filter = 'grayscale(1) brightness(0.25)';
            header.style.filter = 'grayscale(1) brightness(0.2)';
            name.style.color = '#3e4d5a';
            name.style.textShadow = 'none';
            desc.style.color = '#354550';
            desc.innerHTML = finalCard.desc; // remove colored numbers
            badge.style.color = '#2a2a38';
            badge.style.textShadow = 'none';
            iconWrap.style.animation = 'none'; // Stop floating animation on locked cards
            const lockOverlay = document.createElement('div');
            lockOverlay.style.cssText = [
              'position:absolute;inset:0;border-radius:2px',
              'background:rgba(2,4,8,0.88)',
              'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px',
              'z-index: 10', // ensure it appears above everything else
            ].join(';');
            const lockIcon = document.createElement('div');
            lockIcon.textContent = '🔒';
            lockIcon.style.cssText = 'font-size:38px; filter: drop-shadow(0 0 10px rgba(0,0,0,0.8));'; // removed float animation from lock to keep it static
            const lockLabel = document.createElement('div');
            lockLabel.textContent = 'LOCKED';
            lockLabel.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:12px;color:#6b8096;letter-spacing:3px;text-shadow: 0 2px 4px #000;';
            const lockHint = document.createElement('div');
            lockHint.textContent = 'UPGRADE TO UNLOCK';
            lockHint.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:10px;color:#4a5a70;letter-spacing:1px;text-align:center;line-height:1.8;text-shadow: 0 1px 2px #000;';
            lockOverlay.append(lockIcon, lockLabel, lockHint);
            el.appendChild(lockOverlay);
          }, 280);
        } else {
          el.style.borderColor = finalCard.color;
          el.style.boxShadow = `0 0 40px ${finalCard.color}44, inset 0 0 20px ${finalCard.color}22, inset 0 0 0 1px ${finalCard.color}66`;
          setTimeout(() => {
            el.style.boxShadow = `0 10px 25px rgba(0,0,0,0.9), inset 0 0 15px ${finalCard.color}15, inset 0 0 0 1px ${finalCard.color}44`;
            el.style.borderColor = finalCard.color + '88';
          }, 320);
        }

        revealedCount++;
        if (revealedCount === drawn.length) {
          setTimeout(() => enablePicking(), 150);
        }
        return;
      }

      // Speed: fast at start, slow near reveal
      const speed = remaining < 350 ? 140 : remaining < 700 ? 80 : 52;
      const randCard = CARD_POOL[Math.floor(Math.random() * CARD_POOL.length)];
      setDisplay(randCard);
      SFX.cardTick();
      setTimeout(cycle, speed);
    }

    // Stagger the start of each card's cycling slightly
    setTimeout(cycle, cardIdx * 40);
  });

  overlay.appendChild(row);

  // Skip button — hidden during animation, shown after all reveal
  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'SKIP';
  skipBtn.style.cssText = [
    'background:rgba(0,3,8,0.8);border:1px solid #223344;color:#223344',
    'font-family:"Press Start 2P",monospace;font-size:7px',
    'padding:6px 14px;cursor:pointer;letter-spacing:2px',
    'transition:all 0.2s ease;opacity:0;pointer-events:none',
  ].join(';');
  skipBtn.addEventListener('mouseenter', () => { skipBtn.style.color = '#667788'; skipBtn.style.borderColor = '#667788'; });
  skipBtn.addEventListener('mouseleave', () => { skipBtn.style.color = '#334455'; skipBtn.style.borderColor = '#334455'; });
  skipBtn.addEventListener('click', () => { overlay.remove(); playCurrentLevelBGM(); onComplete(); });
  overlay.appendChild(skipBtn);

  // Active run cards indicator
  if ((S.runCards || []).length > 0) {
    const active = document.createElement('div');
    active.style.cssText = [
      'color:#1e2d36;font-size:6px;text-align:center;max-width:700px;line-height:2',
      'background:rgba(0,3,8,0.75);padding:4px 14px',
      'pointer-events:none',
    ].join(';');
    active.textContent = 'ACTIVE: ' + S.runCards.map(id => {
      const c = CARD_POOL.find(x => x.id === id);
      return c ? c.name : id;
    }).join(' · ');
    overlay.appendChild(active);
  }

  // Enable picking after all cards revealed
  function enablePicking() {
    // Fade in active indicator
    const activeEl = overlay.querySelector('div:last-child');
    if (activeEl) activeEl.style.color = '#2a3a44';

    // Show skip button
    skipBtn.style.opacity = '1';
    skipBtn.style.pointerEvents = 'auto';
    skipBtn.style.color = '#334455';
    skipBtn.style.borderColor = '#334455';

    cardEls.forEach(({ el, isLocked }, i) => {
      const finalCard = drawn[i];
      if (isLocked) {
        el.style.cursor = 'not-allowed';
        return; // locked cards are not interactive
      }

      el.style.cursor = 'pointer';
      el.style.pointerEvents = 'auto';

      el.addEventListener('mouseenter', () => {
        el.style.borderColor = finalCard.color;
        el.style.transform = 'translateY(-10px) scale(1.02)';
        el.style.boxShadow = `0 20px 40px rgba(0,0,0,0.9), 0 0 30px ${finalCard.color}55, inset 0 0 30px ${finalCard.color}33, inset 0 0 0 1px ${finalCard.color}88`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.borderColor = finalCard.color + '55';
        el.style.transform = '';
        el.style.boxShadow = `0 10px 25px rgba(0,0,0,0.9), inset 0 0 15px ${finalCard.color}15, inset 0 0 0 1px ${finalCard.color}33`;
      });
      el.addEventListener('click', () => {
        if (!S.runCards) S.runCards = [];
        S.runCards.push(finalCard.id);
        SFX.cardPicked();

        // Detect energy gain cards
        let _energyGain = 0;
        if (finalCard.id === 'overcharge_rare') _energyGain = 20;
        else if (finalCard.id === 'overcharge_epic') _energyGain = 25;
        else if (finalCard.id === 'overcharge_legendary') _energyGain = 35;
        const _oldEnergy = S.energy || 0;
        if (_energyGain > 0) {
          S.energy = _oldEnergy + _energyGain;
          // Floating "+N⚡" popup on the card
          const popup = document.createElement('div');
          popup.textContent = `+${_energyGain}⚡`;
          popup.style.cssText = [
            'position:absolute;top:8px;left:50%;transform:translateX(-50%)',
            `color:${finalCard.color};font-size:13px;font-family:"Press Start 2P",monospace`,
            'text-shadow:0 0 14px currentColor,2px 2px 0 #000',
            'pointer-events:none;z-index:10',
          ].join(';');
          el.appendChild(popup);
          popup.animate([
            { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
            { opacity: 0, transform: 'translateX(-50%) translateY(-44px)' },
          ], { duration: 800, easing: 'ease-out', fill: 'forwards' });
        }

        el.style.background = finalCard.color + '44';
        el.style.borderColor = finalCard.color;
        el.style.boxShadow = `0 0 40px ${finalCard.color}66`;
        cardEls.forEach(c => { c.el.style.pointerEvents = 'none'; });
        skipBtn.style.pointerEvents = 'none';
        setTimeout(() => {
          overlay.remove();
          playCurrentLevelBGM();
          onComplete();
          // Animate energy bar fill after new room loaded
          if (_energyGain > 0) {
            setTimeout(() => updateEnergyHud(), 80);
          }
        }, 600);
      });
    });
  }

  document.body.appendChild(overlay);
}
const CRIT_DMG = 2;
const CELL_DARK = '#07070f';
const CELL_LIGHT = '#0a0a18';
const GRID_COLOR = '#161630';

// ---- Wall FX: LED Chips ----------------------------------------
let wallLedTiles = [];
let wallLedState = false, wallLedPhase = 0;
let wallLedIdleAccum = 0, wallLedIdleMs = 10000;
let wallLedBlinkSeq = [], wallLedBlinkIdx = 0, wallLedBlinkAccum = 0;

// ---- Tutorial Steps --------------------------------------------
const TUTORIAL_STEPS = [
  {
    id: 'move',
    title: 'MOVEMENT',
    desc: 'Navigate the sector using WASD.\nTime only moves when YOU act - think before each step.',
    keys: 'wasd',
    hint: 'Press WASD to continue...',
    trigger: 'move',
    highlight: 'hero',
  },
  {
    id: 'shoot',
    title: 'COMBAT',
    desc: 'Aim with the mouse cursor.\nFire to destroy enemy threats.',
    keys: 'shoot',
    hint: 'Shoot to continue...',
    trigger: 'shoot',
    highlight: 'none',
  },
  {
    id: 'energy',
    title: 'VOLTS',
    desc: 'Every move and shot costs VOLTS.\nIf the bar reaches 0 - mission failed.',
    keys: 'none',
    hint: null,
    trigger: 'button',
    highlight: 'energy',
  },
  {
    id: 'loot',
    title: 'LOOT TERMINALS',
    desc: 'Find chests on the map.\nWalk over them to spin the LOOT TERMINAL for rewards.',
    keys: 'none',
    hint: null,
    trigger: 'button',
    highlight: 'none',
  },
  {
    id: 'exit',
    title: 'OBJECTIVE',
    desc: 'Find the green EXIT portal to advance to the next sector.\nGood luck, operator.',
    keys: 'none',
    hint: null,
    trigger: 'button',
    highlight: 'exit',
  },
];

let tutorialActive = false;
let tutorialStepIdx = 0;

// ---- Achievement Definitions -----------------------------------
const ACHIEVEMENTS = [
  { id: 'first_kill', label: 'FIRST BLOOD', desc: 'Destroy first enemy', check: (p, s) => (s.totalKills || 0) >= 1 },
  { id: 'kills_10', label: 'PEST CONTROL', desc: 'Destroy 10 enemies', check: (p, s) => (s.totalKills || 0) >= 10 },
  { id: 'kills_50', label: 'GHOST PROTOCOL', desc: 'Destroy 50 enemies', check: (p, s) => (s.totalKills || 0) >= 50 },
  { id: 'kills_100', label: 'TERMINATOR', desc: 'Destroy 100 enemies', check: (p, s) => (s.totalKills || 0) >= 100 },
  { id: 'floor_5', label: 'DEEP NET', desc: 'Reach sector 5', check: (p, s) => (p.highestSector || 1) >= 5 },
  { id: 'floor_10', label: 'MAINFRAME ACCESS', desc: 'Reach sector 10', check: (p, s) => (p.highestSector || 1) >= 10 },
  { id: 'nano_max', label: 'SELF REPAIR', desc: 'Max out Nano Repair', check: (p, s) => (p.upgrades?.nanoLevel || 0) >= 8 },
  { id: 'crit_10', label: 'SHARP MIND', desc: 'Upgrade Crit Module 10x', check: (p, s) => (p.upgrades?.critLevel || 0) >= 10 },
  { id: 'teleport_use', label: 'PHASE SHIFT', desc: 'Use a teleport pad', check: (p, s) => (s.teleportUses || 0) >= 1 },
  { id: 'full_energy', label: 'FULLY CHARGED', desc: 'Reach max energy', check: (p, s) => (s.reachedMaxEnergy || false) },
];

// ---- Persistent Profile System ---------------------------------
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
      if (Profile.upgrades.freeShotLevel === undefined) Profile.upgrades.freeShotLevel = 0;
      if (Profile.upgrades.jumpLevel === undefined) Profile.upgrades.jumpLevel = 0;
      if (Profile.upgrades.cardSlotLevel === undefined) Profile.upgrades.cardSlotLevel = 0;
      if (Profile.upgrades.bloodRushLevel === undefined) Profile.upgrades.bloodRushLevel = 0;
      if (!Profile.highestSector || Profile.highestSector < 1) Profile.highestSector = 1;
      if (!Array.isArray(Profile.inventory)) Profile.inventory = null;
      if (!Profile.achievements) Profile.achievements = {};
      if (!Profile.stats) Profile.stats = { totalKills: 0 };
      if (Profile.stats.totalKills === undefined) Profile.stats.totalKills = 0;
    } catch (e) { console.error("Could not load profile", e); }
  }
  if (!Profile.achievements) Profile.achievements = {};
  if (!Profile.stats) Profile.stats = { totalKills: 0 };
}

function saveProfile() {
  localStorage.setItem('timelock_profile', JSON.stringify(Profile));
}

// ── RUN KEY system ────────────────────────────────────────────
const RUN_KEY_MAX    = 3;
const RUN_KEY_REGEN  = 60 * 60 * 1000; // 1 valanda ms

function getRunKeys() {
  if (!Profile.runKeys) Profile.runKeys = { count: RUN_KEY_MAX, lastRegen: Date.now() };
  const rk = Profile.runKeys;
  if (rk.count < RUN_KEY_MAX) {
    const elapsed = Date.now() - rk.lastRegen;
    const gained  = Math.floor(elapsed / RUN_KEY_REGEN);
    if (gained > 0) {
      rk.count     = Math.min(RUN_KEY_MAX, rk.count + gained);
      rk.lastRegen += gained * RUN_KEY_REGEN;
      saveProfile();
    }
  }
  return rk.count;
}

function consumeRunKey() {
  getRunKeys(); // regeneruok pirma
  if (Profile.runKeys.count <= 0) return false;
  Profile.runKeys.count--;
  if (Profile.runKeys.count < RUN_KEY_MAX && !Profile.runKeys.lastRegen) {
    Profile.runKeys.lastRegen = Date.now();
  }
  saveProfile();
  return true;
}

function msToNextRunKey() {
  if (!Profile.runKeys) return 0;
  if (Profile.runKeys.count >= RUN_KEY_MAX) return 0;
  const elapsed = Date.now() - Profile.runKeys.lastRegen;
  return Math.max(0, RUN_KEY_REGEN - (elapsed % RUN_KEY_REGEN));
}

function updateRunKeyUI() {
  const count = getRunKeys();
  const filled = '♥'.repeat(count);
  const empty  = '♡'.repeat(RUN_KEY_MAX - count);
  const activePips = filled + empty;
  const pipsHTML = activePips + '<span class="pips-locked">♡♡</span>';
  const emptyClass = count === 0 ? ' empty' : '';

  let timerText;
  if (count >= RUN_KEY_MAX) {
    timerText = 'FULL';
  } else {
    const ms = msToNextRunKey();
    const m  = Math.floor(ms / 60000);
    const s  = Math.floor((ms % 60000) / 1000);
    timerText = `NEXT: ${m}m ${String(s).padStart(2,'0')}s`;
  }

  // Hub screen elements
  const hubPips  = document.getElementById('hub-key-pips');
  const hubTimer = document.getElementById('hub-key-timer');
  if (hubPips)  { hubPips.innerHTML = pipsHTML; hubPips.className = 'runkey-block-pips' + emptyClass; }
  if (hubTimer) hubTimer.textContent = timerText;

  // In-game panel elements
  const panelPips  = document.getElementById('panel-key-pips');
  const panelTimer = document.getElementById('panel-key-timer');
  if (panelPips)  { panelPips.innerHTML = pipsHTML; panelPips.className = 'prk-pips' + emptyClass; }
  if (panelTimer) panelTimer.textContent = timerText;
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
  if (!confirm('WIPE ALL SAVE DATA?\n\nCache / Upgrades / Sector progress\nThis cannot be undone.')) return;
  localStorage.removeItem('timelock_profile');
  Profile = { cache: 0, upgrades: { maxEnergy: 0, voltsCostLevel: 0 }, highestSector: 1, inventory: null };
  updateHubUI();
};

// ---- Cost helpers ----------------------------------------------
function getTerminalVoltsCost() {
  return Math.ceil(10 * Math.pow(1.1, Profile.upgrades.voltsCostLevel || 0));
}

function getInGameVoltsCost() {
  const lvl = S.inGameUpgradeLevel || 0;
  if (lvl < 10) return lvl + 1;               // 1->2->...->10
  return Math.ceil(10 * Math.pow(1.1, lvl - 9)); // then +10% each
}

// ---- Small firework burst on successful upgrade ----------------
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

// ---- Upgrade animation -----------------------------------------
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

// ---- Crit upgrade cost table -----------------------------------
// ---- Mini icon renderers for cost displays ---------------------
function drawMiniChip(canvas, rarity) {
  const ctx = canvas.getContext('2d');
  const px = 2; // each art pixel = 2 screen pixels -> 24x24
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
  if (ronkeImg && ronkeImg.complete && ronkeImg.naturalWidth > 0) {
    ctx.drawImage(ronkeImg, 0, 0, W, H);
  } else {
    // fallback: gold circle
    const cx = W / 2, cy = H / 2, r = W * 0.38;
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
}

function getRonkeUpgradeCount() {
  return S.inventory?.find(s => s && s.type === 'goldbag')?.qty || 0;
}
function spendUpgradeRonke(n) {
  if (!n || n <= 0) return;
  const slot = S.inventory?.find(s => s && s.type === 'goldbag');
  if (!slot) return;
  slot.qty = Math.max(0, slot.qty - n);
  if (slot.qty <= 0) { const idx = S.inventory.indexOf(slot); if (idx >= 0) S.inventory[idx] = null; }
  if (gameMode === 'adventure') { Profile.inventory = S.inventory.map(x => x ? { ...x } : null); saveProfile(); }
  if (S.inventoryOpen) updateInventoryUI();
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
        `<span style="color:${iconCol}">x${qty}</span>`
        + `<span style="color:#334455">/</span>`
        + `<span style="color:${enough ? '#44ff88' : '#ff3c55'}">${have}</span>`;
    } else {
      num.innerHTML = `<span style="color:${iconCol}">x${qty}</span>`;
    }

    wrap.appendChild(cv); wrap.appendChild(num);
    el.appendChild(wrap);
  };

  if (type === 'bytes') {
    addIcon(null, cost, true);
  } else if (type === 'mixed') {
    if (cost.ronke) addIcon(null, cost.ronke, true);
    if (cost.bytes) addIcon(null, cost.bytes, true);
    if (cost.legendary) addIcon('legendary', cost.legendary);
    if (cost.epic) addIcon('epic', cost.epic);
    if (cost.rare) addIcon('rare', cost.rare);
    if (cost.uncommon) addIcon('uncommon', cost.uncommon);
    if (cost.common) addIcon('common', cost.common);
  } else {
    if (cost.mythic) addIcon('mythic', cost.mythic);
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
  if (cost.rare) parts.push(`<span style="color:#4499ff">${cost.rare}R</span>`);
  if (cost.uncommon) parts.push(`<span style="color:#44ff88">${cost.uncommon}U</span>`);
  if (cost.common) parts.push(`<span style="color:#aaaaaa">${cost.common}C</span>`);
  return parts.join(' ');
}
function getFreeShotCost(lvl) {
  if ((lvl || 0) === 0) return { ronke: 1, common: 1 };
  if ((lvl || 0) === 1) return { ronke: 5, common: 2 };
  if ((lvl || 0) === 2) return { ronke: 5, uncommon: 2 };
  if ((lvl || 0) === 3) return { ronke: 10, rare: 2 };
  return { epic: 2, legendary: 1 };
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
    if (success) { Profile.upgrades.critLevel++; saveProfile(); checkAchievements(); }
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
    if (success) { Profile.upgrades.nanoLevel++; saveProfile(); checkAchievements(); }
    return success;
  });
};

window.attemptFreeShotUpgrade = function (prefix) {
  const cardId = prefix === 'hov' ? 'hov-freeshot-card' : 'freeshot-upg-card';
  const statId = prefix === 'hov' ? 'hov-freeshot-status' : 'freeshot-status';
  const costEl = prefix === 'hov' ? 'hov-freeshot-cost-display' : 'freeshot-cost-display';
  const level = Profile.upgrades.freeShotLevel || 0;
  if (level >= 5) return;
  const cost = getFreeShotCost(level);
  const hasBytes = getRonkeUpgradeCount() >= (cost.ronke || 0);
  const hasChips = chipCount('common') >= (cost.common || 0) && chipCount('uncommon') >= (cost.uncommon || 0) && chipCount('rare') >= (cost.rare || 0) && chipCount('epic') >= (cost.epic || 0) && chipCount('legendary') >= (cost.legendary || 0);
  if (!hasBytes || !hasChips) {
    const el = document.getElementById(costEl);
    if (el) { el.style.color = '#ff3c55'; setTimeout(() => el.style.color = '', 500); }
    return;
  }
  spendUpgradeRonke(cost.ronke || 0);
  spendChips('common', cost.common || 0);
  spendChips('uncommon', cost.uncommon || 0);
  spendChips('rare', cost.rare || 0);
  spendChips('epic', cost.epic || 0);
  spendChips('legendary', cost.legendary || 0);
  updateInventoryUI();
  updateHubUI();
  showUpgradeAnim(cardId, statId, () => {
    const success = Math.random() < 0.70;
    if (success) {
      const newLvl = level + 1;
      Profile.upgrades.freeShotLevel = newLvl;
      S.shotsUntilFree = newLvl >= 5 ? 6 : newLvl >= 4 ? 7 : newLvl >= 3 ? 8 : newLvl >= 2 ? 9 : 10;
      saveProfile();
      checkAchievements();
    }
    return success;
  });
};

// ---- Jump Upgrade -----------------------------------------------
function getJumpUpgradeCost(level) {
  return [1, 2, 3, 5][level] || 0; // mythic chips per level
}

const JUMP_BENEFITS = ['Diagonal Jump', '2 Free/room', '3-tile range', 'Freeze on Jump'];

window.attemptJumpUpgrade = function (prefix) {
  const cardId = prefix === 'hov' ? 'hov-jump-upg-card' : 'jump-upg-card';
  const statId = prefix === 'hov' ? 'hov-jump-status' : 'jump-status';
  const costEl = prefix === 'hov' ? 'hov-jump-cost-display' : 'jump-cost-display';
  const level = Profile.upgrades.jumpLevel || 0;
  if (level >= 4) return;
  if (getRonkeUpgradeCount() < 1) {
    const el = document.getElementById(costEl);
    if (el) { el.style.color = '#ff3c55'; setTimeout(() => el.style.color = '', 500); }
    return;
  }
  spendUpgradeRonke(1);
  updateHubUI();
  showUpgradeAnim(cardId, statId, () => {
    const success = Math.random() < 0.70;
    if (success) {
      Profile.upgrades.jumpLevel = level + 1;
      saveProfile();
      checkAchievements();
    }
    return success;
  });
};

window.attemptCardSlotUpgrade = function (prefix) {
  const cardId = prefix === 'hov' ? 'hov-cardslot-upg-card' : 'cardslot-upg-card';
  const statId = prefix === 'hov' ? 'hov-cardslot-status' : 'cardslot-status';
  const costEl = prefix === 'hov' ? 'hov-cardslot-cost-display' : 'cardslot-cost-display';
  const level = Profile.upgrades.cardSlotLevel || 0;
  if (level >= 2) return;
  if (chipCount('mythic') < 1) {
    const el = document.getElementById(costEl);
    if (el) { el.style.color = '#ff3c55'; setTimeout(() => el.style.color = '', 500); }
    return;
  }
  spendChips('mythic', 1);
  updateInventoryUI();
  updateHubUI();
  showUpgradeAnim(cardId, statId, () => {
    const success = Math.random() < 0.70;
    if (success) { Profile.upgrades.cardSlotLevel = level + 1; saveProfile(); checkAchievements(); }
    return success;
  });
};

function getBloodRushCost(lvl) {
  return [
    { common: 2 },                              // 0→1
    { common: 3, uncommon: 1 },                 // 1→2
    { uncommon: 2, ronke: 5 },                   // 2→3
    { rare: 1, ronke: 10 },                     // 3→4
    { rare: 2, epic: 1 },                       // 4→5
    { legendary: 1, ronke: 10 },                // 5→6
    { mythic: 1, legendary: 2 },                // 6→7
  ][lvl] || {};
}
function getBloodRushSuccessRate(lvl) {
  return [0.70, 0.70, 0.70, 0.70, 0.75, 0.70, 0.80][lvl] || 0.70;
}
const BLOOD_RUSH_BENEFITS = [
  '+1⚡ per kill', '+2⚡ per kill', '+3⚡ per kill', '+4⚡ per kill',
  '+5⚡ per kill', '+6⚡ per kill', '+8⚡ per kill',
];

window.attemptBloodRushUpgrade = function (prefix) {
  prefix = prefix || '';
  const cardId = prefix === 'hov' ? 'hov-bloodrush-upg-card' : 'bloodrush-upg-card';
  const statId = prefix === 'hov' ? 'hov-bloodrush-status' : 'bloodrush-status';
  const costEl = (prefix === 'hov' ? 'hov-' : '') + 'bloodrush-cost-display';
  const level = Profile.upgrades.bloodRushLevel || 0;
  if (level >= 7) return;
  const cost = getBloodRushCost(level);
  const canAfford = (chipCount('common') >= (cost.common || 0))
    && (chipCount('uncommon') >= (cost.uncommon || 0))
    && (chipCount('rare') >= (cost.rare || 0))
    && (chipCount('epic') >= (cost.epic || 0))
    && (chipCount('legendary') >= (cost.legendary || 0))
    && (chipCount('mythic') >= (cost.mythic || 0))
    && (getRonkeUpgradeCount() >= (cost.ronke || 0));
  if (!canAfford) {
    const el = document.getElementById(costEl);
    if (el) { el.style.color = '#ff3c55'; setTimeout(() => el.style.color = '', 500); }
    return;
  }
  spendChips('common', cost.common || 0);
  spendChips('uncommon', cost.uncommon || 0);
  spendChips('rare', cost.rare || 0);
  spendChips('epic', cost.epic || 0);
  spendChips('legendary', cost.legendary || 0);
  spendChips('mythic', cost.mythic || 0);
  spendUpgradeRonke(cost.ronke || 0);
  updateInventoryUI();
  updateHubUI();
  showUpgradeAnim(cardId, statId, () => {
    const success = Math.random() < getBloodRushSuccessRate(level);
    if (success) { Profile.upgrades.bloodRushLevel = level + 1; saveProfile(); checkAchievements(); }
    return success;
  });
};

// ---- In-game Chip Forge (inventory panel button) ---------------
const FORGE_RARITIES = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
const FORGE_RECIPES = [
  // TEST VALUES - restore to: common:15, uncommon:10, rare:5, epic:5, legendary:3
  { label: '90%', chance: 0.90, cost: { common: 1, uncommon: 1, rare: 1, epic: 1, legendary: 1 } },
  // TEST VALUES - restore to: rare:10, epic:6, legendary:5
  { label: '100%', chance: 1.00, cost: { common: 0, uncommon: 0, rare: 1, epic: 1, legendary: 1 } },
];
let _forgeRecipeIdx = 0;
let _forgeWorking = false;
let _forgeAnimRaf = null;

function _startForgeAnim() {
  if (_forgeAnimRaf) return;
  function frame() {
    document.querySelectorAll('.forge-chip-cv').forEach(cv => {
      const m = cv.dataset.mode;
      if (m === 'gray' || m === 'colorizing') return; // handled separately
      drawInvChipCanvas(cv);
    });
    _forgeAnimRaf = requestAnimationFrame(frame);
  }
  _forgeAnimRaf = requestAnimationFrame(frame);
}

/* Draw mythic chip static + grayscale (before / can't afford) */
function _drawMythicGray(cv) {
  const W = cv.width, H = cv.height;
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  const tc = tmp.getContext('2d');
  tc.save();
  tc.translate(W / 2, H / 2);
  tc.translate(-CHIP_ART_SIZE / 2, -CHIP_ART_SIZE / 2);
  drawChipFlat(tc, 0, 0, 'mythic', false);
  tc.restore();
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.filter = 'grayscale(1) brightness(0.35)';
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

/* Pixel-by-pixel colorization after successful forge */
function _playColorizeAnim(cv) {
  cv.dataset.mode = 'colorizing';
  const W = cv.width, H = cv.height;
  const ctx = cv.getContext('2d');
  const pal = CHIP_PALETTES.mythic;
  const px = CHIP_PX; // 8

  // Collect all visible art pixels
  const pixels = [];
  for (let r = 0; r < CHIP_ART.length; r++) {
    for (let c = 0; c < CHIP_ART[0].length; c++) {
      const v = CHIP_ART[r][c];
      if (!v) continue;
      const isCircuit = CHIP_CIRCUIT.some(([cr, cc]) => cr === r && cc === c);
      pixels.push({ r, c, v, isCircuit });
    }
  }

  // Shuffle - random order of colorization
  for (let i = pixels.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pixels[i], pixels[j]] = [pixels[j], pixels[i]];
  }

  const TOTAL = pixels.length;
  let idx = 0, raf;

  function frame() {
    const progress = idx / TOTAL;
    // Rate: starts at 1/frame, accelerates to ~TOTAL/4 per frame at end
    const rate = Math.ceil(1 + progress * progress * (TOTAL / 3.5));

    for (let i = 0; i < rate && idx < TOTAL; i++) {
      const p = pixels[idx++];
      // Base block in correct color
      ctx.fillStyle = pal[p.v];
      ctx.fillRect(p.c * px, p.r * px, px, px);
      // Circuit dot overlay
      if (p.isCircuit) {
        ctx.fillStyle = pal[4];
        ctx.fillRect(p.c * px + 1, p.r * px + 1, px - 2, px - 2);
      }
    }

    if (idx < TOTAL) {
      raf = requestAnimationFrame(frame);
    } else {
      // Fully colorized - hand off to normal spinning animation
      cv.dataset.mode = 'alive';
      SFX.play(1047, 0.35, 0.06, 'sine', 200);
      setTimeout(() => SFX.play(1319, 0.25, 0.05, 'sine', 150), 80);
      setTimeout(() => SFX.play(1568, 0.18, 0.06, 'sine', 100), 180);
    }
  }

  raf = requestAnimationFrame(frame);
}
function _stopForgeAnim() {
  if (_forgeAnimRaf) { cancelAnimationFrame(_forgeAnimRaf); _forgeAnimRaf = null; }
}

window.openForge = function () {
  _forgeWorking = false;
  [...FORGE_RARITIES, 'mythic'].forEach(r => {
    const cv = document.getElementById(`fscv-${r}`);
    if (!cv) return;
    cv._angle = 0; cv._vel = 0; cv._hovered = false;
    const card = cv.closest('.forge-ing-slot, .forge-result-slot');
    if (card && !card._forgeHover) {
      card._forgeHover = true;
      card.addEventListener('mouseenter', () => { cv._hovered = true; });
      card.addEventListener('mouseleave', () => { cv._hovered = false; });
    }
  });
  // Mythic chip starts grayscale + static until forged
  const mythicCv = document.getElementById('fscv-mythic');
  if (mythicCv) { mythicCv.dataset.mode = 'gray'; _drawMythicGray(mythicCv); }
  _updateForgeUI();
  document.getElementById('forge-overlay').classList.add('active');
  _startForgeAnim();
};
window.closeForge = function () {
  document.getElementById('forge-overlay').classList.remove('active');
  _stopForgeAnim();
};
window.selectForgeRecipe = function (idx) {
  _forgeRecipeIdx = idx;
  document.getElementById('forge-rec-0').classList.toggle('active', idx === 0);
  document.getElementById('forge-rec-1').classList.toggle('active', idx === 1);
  _updateForgeUI();
};
function _updateForgeUI() {
  const recipe = FORGE_RECIPES[_forgeRecipeIdx];
  let canAfford = true;
  FORGE_RARITIES.forEach(r => {
    const need = recipe.cost[r] || 0;
    const have = chipCount(r);
    const el = document.getElementById(`fsqty-${r}`);
    if (!el) return;
    if (need === 0) { el.textContent = '--'; el.style.color = '#333'; }
    else {
      el.textContent = `${have} / ${need}`;
      el.style.color = have >= need ? '#44ff88' : '#ff3c55';
      if (have < need) canAfford = false;
    }
  });
  const mythEl = document.getElementById('fsqty-mythic');
  if (mythEl) mythEl.textContent = `HAVE: ${chipCount('mythic')}`;
  const btn = document.getElementById('forge-action-btn');
  if (btn) btn.disabled = !canAfford || _forgeWorking;
  const msg = document.getElementById('forge-status-msg');
  if (msg && !_forgeWorking) msg.textContent = '';
}
/* ---- Forge transmutation animation ----------------------------- */
function _playForgeAnim(success, onDone) {
  const overlay = document.getElementById('forge-anim-overlay');
  const cv = document.getElementById('forge-anim-cv');
  if (!overlay || !cv) { onDone(); return; }

  // Size canvas pixels to match actual panel size
  const panel = document.getElementById('forge-panel');
  cv.width = panel ? panel.clientWidth : 382;
  cv.height = panel ? panel.clientHeight : 460;
  const W = cv.width, H = cv.height;
  const cx = W / 2, cy = H / 2 - 10;
  const ctx = cv.getContext('2d');

  overlay.classList.add('active');

  // Frame timing (at ~60 fps)
  const T_CHARGE = 95;   // charging build-up
  const T_FLASH = 115;  // bright flash reveal
  const T_REVEAL = 170;  // result shown
  const T_DONE = 200;  // fade out complete

  // Spiraling particles
  const NPARTS = 20;
  const parts = Array.from({ length: NPARTS }, (_, i) => ({
    angle: (i / NPARTS) * Math.PI * 2 + Math.random() * 0.4,
    r: 65 + Math.random() * 55,
    spd: 0.045 + Math.random() * 0.03,
    sz: [2, 2, 3, 3, 4][i % 5],
    col: i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? '#00ddff' : '#0099bb'),
  }));

  // SFX: rising charge hum over ~1.6s
  SFX.play(140, 1.6, 0.04, 'sine', 1000);
  setTimeout(() => SFX.play(320, 0.10, 0.04, 'sine'), 280);
  setTimeout(() => SFX.play(520, 0.10, 0.04, 'sine'), 580);
  setTimeout(() => SFX.play(800, 0.10, 0.04, 'sine'), 920);
  setTimeout(() => SFX.play(1100, 0.10, 0.04, 'sine'), 1280);

  let tick = 0, raf;

  function frame() {
    ctx.clearRect(0, 0, W, H);
    tick++;

    // ---- CHARGING (0 -> T_CHARGE) ------------------------------
    if (tick <= T_CHARGE) {
      const t = tick / T_CHARGE; // 0->1

      // Darkened bg with teal tint
      ctx.fillStyle = `rgba(0,10,16,${0.72 + t * 0.2})`;
      ctx.fillRect(0, 0, W, H);

      // 3 rotating dashed rings
      for (let ring = 0; ring < 3; ring++) {
        const rr = 26 + ring * 22;
        const dir = ring % 2 ? 1 : -1;
        const ra = tick * 0.027 * (ring + 1) * dir;
        const alf = 0.20 + t * 0.60;
        ctx.strokeStyle = ring === 2
          ? `rgba(0,220,255,${alf})`
          : `rgba(0,150,195,${alf})`;
        ctx.lineWidth = 2;
        for (let seg = 0; seg < 8; seg++) {
          const a1 = ra + (seg / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx, cy, rr, a1, a1 + Math.PI / 10);
          ctx.stroke();
        }
      }

      // Particles spiral inward
      for (const p of parts) {
        p.angle += p.spd * (1 + t * 1.8);
        p.r = Math.max(4, p.r - 0.30 * (1 + t * 2.5));
        const px = Math.round(cx + Math.cos(p.angle) * p.r);
        const py = Math.round(cy + Math.sin(p.angle) * p.r);
        ctx.globalAlpha = 0.35 + t * 0.65;
        ctx.fillStyle = p.col;
        ctx.fillRect(px - Math.floor(p.sz / 2), py - Math.floor(p.sz / 2), p.sz, p.sz);
        ctx.globalAlpha = 1;
      }

      // Center white-hot glow growing
      const gr = 5 + t * 22;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
      grd.addColorStop(0, `rgba(255,255,255,${t * 0.95})`);
      grd.addColorStop(0.4, `rgba(0,220,255,${t * 0.55})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(cx - gr, cy - gr, gr * 2, gr * 2);

      // "CHARGING..." flickering text
      if (tick % 20 < 14) {
        ctx.fillStyle = `rgba(0,200,240,${0.3 + t * 0.5})`;
        ctx.font = '6px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('CHARGING...', cx, cy + 74);
      }

      // ---- FLASH (T_CHARGE -> T_FLASH) -------------------------
    } else if (tick <= T_FLASH) {
      const ft = (tick - T_CHARGE) / (T_FLASH - T_CHARGE); // 0->1
      // Triangle wave: bright in middle, fade at ends
      const a = ft < 0.5 ? ft * 2 : 2 - ft * 2;

      ctx.fillStyle = success
        ? `rgba(255,225,80,${a * 0.92})`
        : `rgba(255,50,50,${a * 0.92})`;
      ctx.fillRect(0, 0, W, H);

      const bGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90 * (0.3 + ft * 0.7));
      bGrd.addColorStop(0, `rgba(255,255,255,${a})`);
      bGrd.addColorStop(0.3, success ? `rgba(255,200,0,${a * 0.85})` : `rgba(255,80,80,${a * 0.85})`);
      bGrd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bGrd;
      ctx.fillRect(0, 0, W, H);

      // Flash SFX on first frame
      if (tick === T_CHARGE + 1) {
        SFX.play(success ? 1400 : 260, 0.22, 0.07, success ? 'square' : 'sawtooth', success ? 200 : -120);
      }

      // ---- REVEAL (T_FLASH -> T_REVEAL) ------------------------
    } else if (tick <= T_REVEAL) {
      const rt = (tick - T_FLASH) / (T_REVEAL - T_FLASH); // 0->1

      ctx.fillStyle = 'rgba(0,8,12,0.88)';
      ctx.fillRect(0, 0, W, H);

      if (success) {
        // Star burst: gold pixel rays radiating outward
        for (let i = 0; i < 24; i++) {
          const ang = (i / 24) * Math.PI * 2;
          const dist = rt * (48 + (i % 6) * 12);
          const px = Math.round(cx + Math.cos(ang) * dist);
          const py = Math.round(cy + Math.sin(ang) * dist);
          const sz = Math.ceil(3.5 - rt * 2.5);
          const alp = Math.max(0, 1 - rt * 0.85);
          if (sz > 0) {
            ctx.fillStyle = `rgba(${i % 2 ? 255 : 230},${130 + i * 5},0,${alp})`;
            ctx.fillRect(px - Math.floor(sz / 2), py - Math.floor(sz / 2), sz, sz);
          }
        }
        // Secondary sparkle ring
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2 + rt * 1.5;
          const dist = 18 + rt * 28;
          const px = Math.round(cx + Math.cos(ang) * dist);
          const py = Math.round(cy + Math.sin(ang) * dist);
          const alp = Math.max(0, 0.9 - rt * 0.7);
          ctx.fillStyle = `rgba(255,255,180,${alp})`;
          ctx.fillRect(px - 1, py - 1, 2, 2);
        }
        // Mythic purple center glow
        const mg = 20 + rt * 12;
        const mGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, mg);
        mGrd.addColorStop(0, `rgba(255,255,255,${0.95 - rt * 0.4})`);
        mGrd.addColorStop(0.35, `rgba(210,0,255,${0.85 - rt * 0.2})`);
        mGrd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = mGrd;
        ctx.fillRect(cx - mg, cy - mg, mg * 2, mg * 2);

        // "MYTHIC CHIP!" text fading in
        ctx.globalAlpha = Math.min(1, rt * 2.2);
        ctx.fillStyle = '#ffdd44';
        ctx.font = '8px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('\u2736 MYTHIC CHIP!', cx, cy + 66);
        ctx.globalAlpha = 1;

        // Success SFX fanfare
        if (tick === T_FLASH + 1) {
          SFX.play(880, 0.13, 0.07, 'square');
          setTimeout(() => SFX.play(1320, 0.17, 0.08, 'square'), 110);
          setTimeout(() => SFX.play(1760, 0.21, 0.09, 'square'), 240);
        }

      } else {
        // Scatter: red pixels fly outward and fall
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2;
          const dist = rt * (22 + i * 5);
          const px = Math.round(cx + Math.cos(ang) * dist + (i % 3 - 1) * rt * 8);
          const py = Math.round(cy + Math.sin(ang) * dist + rt * rt * 30);
          const alp = Math.max(0, 1 - rt);
          ctx.fillStyle = `rgba(255,55,55,${alp})`;
          ctx.fillRect(px - 1, py - 1, 3, 3);
        }
        // Red X mark
        const xa = Math.max(0, 1 - rt * 0.65);
        ctx.strokeStyle = `rgba(255,55,55,${xa})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy - 15); ctx.lineTo(cx + 15, cy + 15);
        ctx.moveTo(cx + 15, cy - 15); ctx.lineTo(cx - 15, cy + 15);
        ctx.stroke();
        // Dark crackle static
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = `rgba(255,55,55,${Math.random() * xa * 0.4})`;
          ctx.fillRect(
            cx + (Math.random() - 0.5) * 40,
            cy + (Math.random() - 0.5) * 40,
            Math.random() * 4 + 1, 1
          );
        }
        // "FORGE FAILED" text fading in
        ctx.globalAlpha = Math.min(1, rt * 2.2);
        ctx.fillStyle = '#ff3c55';
        ctx.font = '8px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('FORGE FAILED', cx, cy + 66);
        ctx.globalAlpha = 1;

        if (tick === T_FLASH + 1) {
          SFX.play(180, 0.18, 0.12, 'sawtooth', -80);
          setTimeout(() => SFX.play(100, 0.10, 0.10, 'sawtooth', -30), 200);
        }
      }

      // ---- FADE OUT (T_REVEAL -> T_DONE) -----------------------
    } else if (tick <= T_DONE) {
      const ft = (tick - T_REVEAL) / (T_DONE - T_REVEAL);
      ctx.fillStyle = `rgba(0,8,12,${ft})`;
      ctx.fillRect(0, 0, W, H);

      // ---- DONE -----------------------------------------------
    } else {
      cancelAnimationFrame(raf);
      overlay.classList.remove('active');
      onDone();
      return;
    }

    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
}

window.attemptForge = function () {
  if (_forgeWorking) return;
  const recipe = FORGE_RECIPES[_forgeRecipeIdx];
  for (const r of FORGE_RARITIES) { if (chipCount(r) < (recipe.cost[r] || 0)) return; }
  _forgeWorking = true;
  FORGE_RARITIES.forEach(r => spendChips(r, recipe.cost[r] || 0));
  updateInventoryUI();
  const btn = document.getElementById('forge-action-btn');
  const msg = document.getElementById('forge-status-msg');
  if (btn) btn.disabled = true;
  if (msg) msg.textContent = '';

  // Pre-determine result; animation reveals it
  const success = Math.random() < recipe.chance;

  _playForgeAnim(success, () => {
    _forgeWorking = false;
    if (success) {
      addToInventory('chip', 'mythic', 1);
      if (msg) { msg.textContent = '\u2736 MYTHIC CHIP FORGED!'; msg.style.color = '#ffcc44'; }
      logEvent('\u2736 MYTHIC CHIP FORGED', 'assembled');
      // Colorize the mythic chip - pixels come to life
      const mythicCv = document.getElementById('fscv-mythic');
      if (mythicCv) _playColorizeAnim(mythicCv);
    } else {
      if (msg) { msg.textContent = 'FORGE FAILED \u2014 CHIPS LOST'; msg.style.color = '#ff3c55'; }
      logEvent('\u2736 FORGE FAILED', 'info');
      // Reset mythic chip back to gray
      const mythicCv = document.getElementById('fscv-mythic');
      if (mythicCv) { mythicCv.dataset.mode = 'gray'; _drawMythicGray(mythicCv); }
    }
    updateInventoryUI();
    updateHubUI();
    _updateForgeUI();
  });
};

// ---- Mythic Chip Forge (2 legendary -> 1 mythic, always succeeds) --
window.attemptMythicForge = function (prefix) {
  const cardId = prefix === 'hov' ? 'hov-mythic-forge-card' : 'mythic-forge-card';
  const statId = prefix === 'hov' ? 'hov-mythic-forge-status' : 'mythic-forge-status';
  const costEl = prefix === 'hov' ? 'hov-mythic-forge-cost-display' : 'mythic-forge-cost-display';
  if (chipCount('legendary') < 2) {
    const el = document.getElementById(costEl);
    if (el) { el.style.color = '#ff3c55'; setTimeout(() => el.style.color = '', 500); }
    return;
  }
  spendChips('legendary', 2);
  addToInventory('chip', 'mythic', 1);
  updateInventoryUI();
  updateHubUI();
  showUpgradeAnim(cardId, statId, () => true);
};

// ---- Terminal upgrade (hub screen, uses Profile.cache) ---------
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
      checkAchievements();
    }
    return success;
  });
};


window.attemptInGameUpgrade = function () {
  const cost = getInGameVoltsCost();
  if (getRonkeUpgradeCount() < cost) {
    const el = document.getElementById('hov-bytes');
    if (el) { el.style.color = '#ff3c55'; setTimeout(() => el.style.color = '', 400); }
    return;
  }
  spendUpgradeRonke(cost);
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
  if (o('hov-bytes')) o('hov-bytes').innerText = getRonkeUpgradeCount();
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
  renderCostIcons('hov-ig-cost-display', getInGameVoltsCost(), 'bytes', () => getRonkeUpgradeCount());

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


  const canAffordVolts = getRonkeUpgradeCount() >= getInGameVoltsCost();
  const hovV = o('hov-volts-card');
  if (hovV) hovV.classList.toggle('upg-locked', !canAffordVolts);

  const critCostNow = getCritCost(critLvl);
  const canAffordCrit = chipCount('common') >= critCostNow.common
    && chipCount('uncommon') >= critCostNow.uncommon
    && chipCount('rare') >= critCostNow.rare;
  const hovC = o('hov-crit-card');
  if (hovC) hovC.classList.toggle('upg-locked', !canAffordCrit);

  const nanoLvlNow = Profile.upgrades.nanoLevel || 0;
  const nanoMaxedNow = nanoLvlNow >= 8;
  const nanoCostNow = nanoMaxedNow ? {} : getNanoRepairCost(nanoLvlNow);
  const canAffordNano = nanoMaxedNow || (
    chipCount('legendary') >= (nanoCostNow.legendary || 0)
    && chipCount('epic') >= (nanoCostNow.epic || 0)
    && chipCount('rare') >= (nanoCostNow.rare || 0)
  );
  const hovN = o('hov-nano-card');
  if (hovN) hovN.classList.toggle('upg-locked', !canAffordNano);

  // Free Shot card
  const fsLvl = Profile.upgrades.freeShotLevel || 0;
  const fsMaxed = fsLvl >= 5;
  const fsInterval = fsLvl >= 5 ? 6 : fsLvl >= 4 ? 7 : fsLvl >= 3 ? 8 : fsLvl >= 2 ? 9 : 10;
  const fsCost = getFreeShotCost(fsLvl);
  ['', 'hov-'].forEach(p => {
    if (o(`${p}lvl-freeshot`)) o(`${p}lvl-freeshot`).innerText = fsLvl;
    if (o(`${p}freeshot-interval`)) o(`${p}freeshot-interval`).innerText = fsLvl >= 1 ? `/ ${fsInterval} SHOTS` : '--';
    const cdId = `${p}freeshot-cost-display`;
    if (fsMaxed) {
      const el = o(cdId); if (el) el.innerHTML = '<span style="color:#00ff88">MAX</span>';
    } else {
      renderCostIcons(cdId, fsCost, 'mixed', (r) => r === null ? getRonkeUpgradeCount() : chipCount(r));
    }
  });
  const canAffordFs = fsMaxed || (getRonkeUpgradeCount() >= (fsCost.ronke || 0) && chipCount('common') >= (fsCost.common || 0) && chipCount('uncommon') >= (fsCost.uncommon || 0) && chipCount('rare') >= (fsCost.rare || 0) && chipCount('epic') >= (fsCost.epic || 0) && chipCount('legendary') >= (fsCost.legendary || 0));
  const hovFs = o('hov-freeshot-card');
  if (hovFs) hovFs.classList.toggle('upg-locked', !canAffordFs);

  // Mythic Forge card
  const mythicCount = chipCount('mythic');
  const canForge = chipCount('legendary') >= 2;
  ['', 'hov-'].forEach(p => {
    if (o(`${p}mythic-chip-count`)) o(`${p}mythic-chip-count`).innerText = mythicCount;
    renderCostIcons(`${p}mythic-forge-cost-display`, { legendary: 2 }, 'chips', (r) => chipCount(r));
  });
  const hovMythic = o('hov-mythic-forge-card');
  if (hovMythic) hovMythic.classList.toggle('upg-locked', !canForge);

  // Jump Upgrade card
  const jLvl = Profile.upgrades.jumpLevel || 0;
  const jMaxed = jLvl >= 4;
  const jCost = getJumpUpgradeCost(jLvl);
  ['', 'hov-'].forEach(p => {
    if (o(`${p}lvl-jump`)) o(`${p}lvl-jump`).innerText = jLvl;
    if (o(`${p}jump-benefit`)) o(`${p}jump-benefit`).innerText = jMaxed ? 'MAXED' : (JUMP_BENEFITS[jLvl] || '--');
    if (jMaxed) {
      const el = o(`${p}jump-cost-display`);
      if (el) el.innerHTML = '<span style="color:#00ff88">MAX</span>';
    } else {
      const el = o(`${p}jump-cost-display`);
      if (el) el.innerHTML = '<span style="color:#00f5ff">1 RONKE</span>';
    }
  });
  const canAffordJump = jMaxed || getRonkeUpgradeCount() >= 1;
  const hovJ = o('hov-jump-upg-card');
  if (hovJ) hovJ.classList.toggle('upg-locked', !canAffordJump);

  // Card Slot upgrade
  const csLvl = Profile.upgrades.cardSlotLevel || 0;
  const csMaxed = csLvl >= 2;
  const csBenefits = ['50% chance for 3rd card', '3rd card guaranteed'];
  ['', 'hov-'].forEach(p => {
    if (o(`${p}lvl-cardslot`)) o(`${p}lvl-cardslot`).innerText = csLvl;
    if (o(`${p}cardslot-benefit`)) o(`${p}cardslot-benefit`).innerText = csMaxed ? 'MAXED' : (csBenefits[csLvl] || '--');
    if (csMaxed) {
      const el = o(`${p}cardslot-cost-display`);
      if (el) el.innerHTML = '<span style="color:#00ff88">MAX</span>';
    } else {
      renderCostIcons(`${p}cardslot-cost-display`, { mythic: 1 }, 'chips', (r) => chipCount(r));
    }
  });
  const canAffordCs = csMaxed || chipCount('mythic') >= 1;
  const hovCs = o('hov-cardslot-upg-card');
  if (hovCs) hovCs.classList.toggle('upg-locked', !canAffordCs);

  // Blood Rush upgrade
  const brLvl = Profile.upgrades.bloodRushLevel || 0;
  const brMaxed = brLvl >= 7;
  const brCost = getBloodRushCost(brLvl);
  const brRate = Math.round(getBloodRushSuccessRate(brLvl) * 100);
  ['', 'hov-'].forEach(p => {
    if (o(`${p}lvl-bloodrush`)) o(`${p}lvl-bloodrush`).innerText = brLvl;
    if (o(`${p}bloodrush-benefit`)) o(`${p}bloodrush-benefit`).innerText = brMaxed ? 'MAXED' : (BLOOD_RUSH_BENEFITS[brLvl] || '--');
    if (o(`${p}bloodrush-rate`)) o(`${p}bloodrush-rate`).innerText = brMaxed ? '' : brRate + '%';
    if (brMaxed) {
      const el = o(`${p}bloodrush-cost-display`);
      if (el) el.innerHTML = '<span style="color:#00ff88">MAX</span>';
    } else {
      const mixedCost = { ...brCost };
      renderCostIcons(`${p}bloodrush-cost-display`, mixedCost, 'mixed', (r) => r === null ? getRonkeUpgradeCount() : chipCount(r));
    }
  });
  const canAffordBr = brMaxed || (
    chipCount('common') >= (brCost.common || 0) &&
    chipCount('uncommon') >= (brCost.uncommon || 0) &&
    chipCount('rare') >= (brCost.rare || 0) &&
    chipCount('epic') >= (brCost.epic || 0) &&
    chipCount('legendary') >= (brCost.legendary || 0) &&
    chipCount('mythic') >= (brCost.mythic || 0) &&
    getRonkeUpgradeCount() >= (brCost.ronke || 0)
  );
  const hovBr = o('hov-bloodrush-upg-card');
  if (hovBr) hovBr.classList.toggle('upg-locked', !canAffordBr);
}

window.toggleHubOverlay = function () {
  const ov = document.getElementById('hub-overlay');
  if (ov.classList.contains('active')) {
    ov.classList.remove('active');
    playCurrentLevelBGM();
  } else {
    updateHubUI();
    ov.classList.add('active');
    BGM.start('hub');
    document.querySelectorAll('#hub-overlay .upgrade-card').forEach(c => c.classList.add('collapsed'));
  }
};

window.deployMission = function (sector) {
  if (Profile.highestSector < sector) return;
  if (!consumeRunKey()) {
    const ms = msToNextRunKey();
    const m  = Math.floor(ms / 60000);
    const s  = Math.floor((ms % 60000) / 1000);
    logEvent && logEvent(`NO ACCESS KEYS — next key in ${m}m ${String(s).padStart(2,'0')}s`, 'warn');
    // Flash the key bar
    const bar = document.querySelector('.hub-runkey-bar');
    if (bar) {
      bar.style.borderColor = '#ff2200';
      bar.style.background  = 'rgba(80,0,0,0.4)';
      setTimeout(() => { bar.style.borderColor = ''; bar.style.background = ''; }, 600);
    }
    updateRunKeyUI();
    return;
  }
  document.getElementById('hub-overlay').classList.remove('active');
  S.floor = sector;
  updateRunKeyUI();
  startGame('adventure');
};

window.replayTutorial = function () {
  Profile.tutorialDone = false;
  saveProfile();
  document.getElementById('hub-overlay').classList.remove('active');
  S.floor = 1;
  startGame('adventure');
};



const heroAnimFrames = { idle: {}, walk: {}, fight: {} };


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
const gemImg = new Image(); gemImg.src = 'pix.png';
const goldbagSpawnImg = new Image(); goldbagSpawnImg.src = 'assets/goldbag_spawn.png';
const goldbagIdleImg  = new Image(); goldbagIdleImg.src  = 'assets/goldbag_idle.png';
const goldbagGIdleImg = new Image(); goldbagGIdleImg.src = 'assets/goldbag_g_idle.png';
const GOLDBAG_SPAWN_FRAMES = 7, GOLDBAG_FW = 128, GOLDBAG_FH = 128;
const sparkleBulletImg = new Image(); sparkleBulletImg.src = 'assets/sparkle_bullet.png';
const SPARKLE_FRAMES = 14, SPARKLE_FW = 32, SPARKLE_FH = 32;
const bulletOrbImg = new Image(); bulletOrbImg.src = 'assets/bullet_orb.png';
const BULLET_ORB_FRAMES = 10, BULLET_ORB_FW = 48, BULLET_ORB_FH = 48;
const dust01Img = new Image(); dust01Img.src = 'assets/dust01.png';
const DUST01_FRAMES = 8, DUST01_FW = 64, DUST01_FH = 64;
const explosion01Img = new Image(); explosion01Img.src = 'assets/explosion01.png';
const EXP01_FRAMES = 8, EXP01_FW = 192, EXP01_FH = 192;
const ronkeImg = new Image(); ronkeImg.src = 'ronke.png';
const ronkeTokenImg = new Image(); ronkeTokenImg.src = 'assets_tiny/$ronke.png';
const ronke2TokenImg = new Image(); ronke2TokenImg.src = 'assets_tiny/$ronke2.png';
const _R2TOK_FRAMES = 8, _R2TOK_FW = 640, _R2TOK_FH = 640;
const grassTilemapImg = new Image(); grassTilemapImg.src = 'grass_tilemap.png';
const waterFoamImg   = new Image(); waterFoamImg.src   = 'water_foam.png';
const waterBgImg     = new Image(); waterBgImg.src     = 'water_bg.png';
const waterSplashImg  = new Image(); waterSplashImg.src  = 'water_splash.png';
const waterRippleImg  = new Image(); waterRippleImg.src  = 'water_ripple.png';

// Tiny Swords Asset Pack Loading
const tinyImgs = { deco: {}, tree: new Image(), mine: new Image() };
for(let i=1; i<=18; i++) {
   const no = i.toString().padStart(2, '0');
   tinyImgs.deco[no] = new Image();
   tinyImgs.deco[no].src = `assets_tiny/Deco/${no}.png`;
}
tinyImgs.tree.src = 'assets_tiny/Resources/Trees/Tree.png';
tinyImgs.mine.src = 'assets_tiny/Resources/Gold Mine/GoldMine_Inactive.png';
const teleportActiveImg = new Image(); teleportActiveImg.src = 'assets_tiny/Resources/Gold Mine/GoldMine_Active.png';
tinyImgs.water = new Image(); tinyImgs.water.src = 'assets_tiny/Terrain/Water/Water.png';
tinyImgs.foam = new Image(); tinyImgs.foam.src = 'assets_tiny/Terrain/Water/Foam/Foam.png';
const elevationImg = new Image(); elevationImg.src = 'assets_tiny/Terrain/Ground/Tilemap_Elevation.png';
const bridgeImg = new Image(); bridgeImg.src = 'assets_tiny/Bridge_All.png';
const flatImg = new Image(); flatImg.src = 'assets_tiny/Terrain/Ground/Tilemap_Flat.png';
const tilesetImg = new Image(); tilesetImg.src = 'assets_tiny/Terrain/Tileset/Tilemap_color1.png';
const tileset3Img = new Image(); tileset3Img.src = 'assets_tiny/Terrain/Tileset/Tilemap_color3.png';
const shadowImg = new Image(); shadowImg.src = 'assets_tiny/Terrain/Tileset/Shadow.png';
const waterFoam2Img = new Image(); waterFoam2Img.src = 'assets_tiny/Terrain/Water/Foam/Water_Foam2.png';

// ---- Custom Maps -------------------------------------------------------
// Floor 1
window.CUSTOM_MAP = {"dungeon":[[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]],"decorations":{"1,0":"tileset3_3_3","0,1":"tileset3_3_3","1,2":"tileset3_3_3","0,3":"tileset3_3_3","1,4":"tileset3_3_3","0,5":"tileset3_3_3","2,1":"tileset3_3_3","2,3":"tileset3_3_3","2,5":"tileset3_3_3","1,6":"tileset3_3_3","0,7":"tileset3_3_3","2,7":"tileset3_3_3","3,0":"tileset3_3_3","3,2":"tileset3_3_3","3,4":"tileset3_3_3","3,6":"tileset3_3_3","3,8":"tileset3_3_3","1,8":"tileset3_3_3","0,9":"tileset3_3_3","2,9":"tileset3_3_3","3,10":"tileset3_3_3","1,10":"tileset3_3_3","0,11":"tileset3_3_3","2,11":"tileset3_3_3","3,12":"tileset3_3_3","1,12":"tileset3_3_3","0,13":"tileset3_3_3","2,13":"tileset3_3_3","4,13":"tileset3_3_3","4,11":"tileset3_3_3","4,9":"tileset3_3_3","4,7":"tileset3_3_3","4,5":"tileset3_3_3","4,3":"tileset3_3_3","4,1":"tileset3_3_3","5,0":"tileset3_3_3","5,2":"tileset3_3_3","5,4":"tileset3_3_3","5,6":"tileset3_3_3","5,8":"tileset3_3_3","5,10":"tileset3_3_3","5,12":"tileset3_3_3","6,13":"tileset3_3_3","6,11":"tileset3_3_3","6,9":"tileset3_3_3","6,7":"tileset3_3_3","6,5":"tileset3_3_3","6,3":"tileset3_3_3","6,1":"tileset3_3_3","7,0":"tileset3_3_3","7,2":"tileset3_3_3","7,4":"tileset3_3_3","7,6":"tileset3_3_3","7,8":"tileset3_3_3","7,10":"tileset3_3_3","7,12":"tileset3_3_3","8,13":"tileset3_3_3","8,11":"tileset3_3_3","8,9":"tileset3_3_3","8,7":"tileset3_3_3","8,5":"tileset3_3_3","8,3":"tileset3_3_3","8,1":"tileset3_3_3","5,5":"bush3","7,7":"bush3","3,9":"bush3","7,1":"bush1","5,1":"bush1","4,8":"deco_15","2,2":"deco_15","8,10":"deco_14","8,4":"deco_03","1,11":"deco_13","9,0":"tileset3_5_3","9,1":"tileset3_6_3","9,2":"tileset3_6_3","10,0":"tileset3_5_4","10,1":"tileset3_6_4","10,2":"tileset3_6_4","9,3":"tileset3_6_3","10,3":"tileset3_6_4","9,4":"tileset3_6_3","10,4":"tileset3_6_4","9,5":"tileset3_6_3","10,5":"tileset3_6_4","9,6":"tileset3_6_3","10,6":"tileset3_6_4","9,7":"tileset3_6_3","10,7":"tileset3_6_4","9,8":"tileset3_6_3","10,8":"tileset3_6_4","9,9":"tileset3_6_3","10,9":"tileset3_6_4","9,10":"tileset3_6_3","10,10":"tileset3_6_4","9,11":"tileset3_6_3","10,11":"tileset3_6_4","9,12":"tileset3_6_3","9,13":"tileset3_6_3","10,12":"tileset3_6_4","10,13":"tileset3_6_4","9,14":"tileset3_7_3","10,14":"tileset3_7_4","7,14":"tileset3_8_3","8,14":"tileset3_8_4","6,14":"tileset3_8_4","5,14":"tileset3_8_3","3,14":"tileset3_8_3","4,14":"tileset3_8_4","1,14":"tileset3_8_3","2,14":"tileset3_8_4","0,14":"deco_06"},"collisionBoxes":["9,0","9,1","9,2","9,3","9,4","9,5","9,6","9,7","9,8","9,9","9,10","9,11","9,12","9,13","9,14","0,14","1,14","2,14","3,14","4,14","5,14","6,14","7,14","8,14"],"enemies":[{"type":"sheep","x":9,"y":7},{"type":"spider","x":7,"y":1},{"type":"spider","x":11,"y":6},{"type":"skull","x":6,"y":7},{"type":"minotaur","x":11,"y":3}],"spawnPos":{"x":1,"y":3},"exitPos":{"x":25,"y":28}};
// Floor 2 — 30x27 = 810 tiles, plain grass
window.CUSTOM_MAP2 = {"dungeon":[[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]],"decorations":{},"collisionBoxes":[],"enemies":[],"spawnPos":{"x":2,"y":2},"exitPos":{"x":25,"y":28}};
const duckImg = new Image(); duckImg.src = 'assets_tiny/Deco/rubber_duck.png';
const deadAnimImg = new Image(); deadAnimImg.src = 'assets_tiny/Dead.png';
const trollDeadImg = new Image(); trollDeadImg.src = 'animations/troll/Troll_Dead.png';
const mSpawnImg = new Image(); mSpawnImg.src = 'assets_tiny/M_Spawn.png';
const mIdleImg  = new Image(); mIdleImg.src  = 'assets_tiny/M_Idle.png';
const pamNpcImg = new Image(); pamNpcImg.src = 'assets_tiny/pam_npc.png';
const PAM_FRAMES = 19, PAM_FW = 192, PAM_FH = 192, PAM_FPS = 12;
const _SPAWN_FRAMES = 7, _SPAWN_FRAME_W = 128, _SPAWN_FRAME_H = 128, _SPAWN_MS = 120;
const rockImgs = [null, null, null, null, null]; // index 1-4
for (let _ri = 1; _ri <= 4; _ri++) { rockImgs[_ri] = new Image(); rockImgs[_ri].src = `assets_tiny/Terrain/Water/Rocks/Rocks_0${_ri}.png`; }
const bushImgs = [null, null, null, null, null]; // index 1-4
for (let _bi = 1; _bi <= 4; _bi++) { bushImgs[_bi] = new Image(); bushImgs[_bi].src = `assets_tiny/Terrain/Bushe${_bi}.png`; }

(function () {
  Object.keys(HERO_SPRITE_DATA).forEach(dir => {
    const img = new Image(); img.src = HERO_SPRITE_DATA[dir]; heroImgs[dir] = img;
  });

  // New Animation Package Integration
  const animConfigs = [
    { key: 'idle',  path: 'animations/warrior-idle',   frames: 8 },
    { key: 'walk',  path: 'animations/warrior-run',    frames: 6 },
    { key: 'fight', path: 'animations/warrior-attack', frames: 4 },
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

// Shaman sprite animations
const shamanAnimFrames = { idle: {}, run: {}, attack: {} };
const SHAMAN_ANIM_FPS = { idle: 6, run: 10, attack: 14 };
(function () {
  const configs = [
    { key: 'idle',   path: 'animations/shaman-idle',   frames: 8 },
    { key: 'run',    path: 'animations/shaman-run',    frames: 4 },
    { key: 'attack', path: 'animations/shaman-attack', frames: 10 },
  ];
  ['east', 'west', 'north', 'south'].forEach(dir => {
    configs.forEach(conf => {
      shamanAnimFrames[conf.key][dir] = [];
      for (let i = 0; i < conf.frames; i++) {
        const img = new Image();
        img.src = `${conf.path}/${dir}/frame_${String(i).padStart(3, '0')}.png`;
        shamanAnimFrames[conf.key][dir].push(img);
      }
    });
  });
})();

// Shaman projectile & explosion sprite sheets
const shamanProjImg = new Image(); shamanProjImg.src = 'assets_tiny/Shaman_Projectile.png';
const shamanExplImg = new Image(); shamanExplImg.src = 'assets_tiny/Shaman_Explosion.png';
const _SHAM_PROJ_FRAMES = 3, _SHAM_PROJ_W = 128, _SHAM_PROJ_H = 128, _SHAM_PROJ_MS = 90;
const _SHAM_EXPL_FRAMES = 9, _SHAM_EXPL_W = 128, _SHAM_EXPL_H = 128, _SHAM_EXPL_MS = 55;
const _shamanExplosions = []; // module-level visual list, not turn-based

function getShamanFrame(u, dir) {
  const isMoving = Math.abs(u.rx - u.x) > 0.05 || Math.abs(u.ry - u.y) > 0.05;
  const swingElapsed = u.swingStart ? performance.now() - u.swingStart : Infinity;
  const swingDur = (10 / SHAMAN_ANIM_FPS.attack) * 1000;
  const isAttacking = swingElapsed < swingDur;

  let anim = 'idle';
  if (isAttacking) anim = 'attack';
  else if (isMoving) anim = 'run';

  const fps    = SHAMAN_ANIM_FPS[anim];
  const frames = shamanAnimFrames[anim][dir];
  if (!frames || frames.length === 0) return null;

  let idx;
  if (isAttacking) {
    idx = Math.min(Math.floor(swingElapsed / (1000 / fps)), frames.length - 1);
  } else {
    idx = Math.floor(performance.now() / (1000 / fps)) % frames.length;
  }
  return frames[idx];
}

function loadHorizontalSheetFrames(path, frameCount) {
  const sheet = new Image();
  sheet.src = path;
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    const frame = new Image();
    frame.src = path;
    frames.push(frame);
  }
  return { sheet, frames, frameCount };
}

const spiderAnimSheets = {
  idle: loadHorizontalSheetFrames('animations/spider/Spider_Idle.png', 8),
  run: loadHorizontalSheetFrames('animations/spider/Spider_Run.png', 5),
  attack: loadHorizontalSheetFrames('animations/spider/Spider_Attack.png', 8),
};
const SPIDER_ANIM_FPS = { idle: 7, run: 11, attack: 12 };
const sheepAnimSheets = {
  idle: loadHorizontalSheetFrames('animations/sheep/Sheep_Idle.png', 6),
  move: loadHorizontalSheetFrames('animations/sheep/Sheep_Move.png', 4),
  graze: loadHorizontalSheetFrames('animations/sheep/Sheep_Grass.png', 12),
};
const SHEEP_ANIM_FPS = { idle: 6, move: 8, graze: 7 };
const trollAnimSheets = {
  idle: loadHorizontalSheetFrames('animations/troll/Troll_Idle.png', 12),
  walk: loadHorizontalSheetFrames('animations/troll/Troll_Walk.png', 10),
  attack: loadHorizontalSheetFrames('animations/troll/Troll_Attack.png', 6),
  recovery: loadHorizontalSheetFrames('animations/troll/Troll_Recovery.png', 10),
};
const TROLL_ANIM_FPS = { idle: 6, walk: 9, attack: 10, recovery: 10 };

// ---- Skull enemy sprite sheets ----
const skullAnimSheets = {
  idle:   loadHorizontalSheetFrames('assets_tiny/Skull_Idle.png',   8),
  run:    loadHorizontalSheetFrames('assets_tiny/Skull_Run.png',    6),
  attack: loadHorizontalSheetFrames('assets_tiny/Skull_Attack.png', 7),
  guard:  loadHorizontalSheetFrames('assets_tiny/Skull_Guard.png',  7),
};
const SKULL_ANIM_FPS = { idle: 7, run: 10, attack: 12, guard: 10 };
const SKULL_FRAME_W  = 192;  // square frames

// ---- Blue Bird NPC sprite sheet (768x384: 8 cols x 4 rows, 96x96 per frame) ----
// Row 0=IDLE(8f), Row 1=WALK(8f), Row 2=ATTACK(4f+4blank), Row 3=DEATH(4f+4blank)
const _blueBirdSheet = new Image();
_blueBirdSheet.src = 'assets_tiny/BlueBird_Sheet.png';
const BLUEBIRD_FRAME_W = 96;
const BLUEBIRD_FRAME_H = 96;
const BLUEBIRD_ANIM = {
  idle:   { row: 0, frames: 8, fps: 8  },
  walk:   { row: 1, frames: 8, fps: 11 },
  attack: { row: 2, frames: 4, fps: 12 },
  death:  { row: 3, frames: 4, fps: 8  },
};

function getBlueBirdFrameState(u) {
  if (!_blueBirdSheet.complete || _blueBirdSheet.naturalWidth <= 0) return null;
  const now = performance.now();
  const isMoving = Math.abs((u.rx ?? u.x) - u.x) > 0.05 || Math.abs((u.ry ?? u.y) - u.y) > 0.05;
  const swingElapsed = u.swingStart ? now - u.swingStart : Infinity;
  const swingDur = (BLUEBIRD_ANIM.attack.frames / BLUEBIRD_ANIM.attack.fps) * 1000;

  let anim;
  if (swingElapsed < swingDur) anim = BLUEBIRD_ANIM.attack;
  else if (isMoving)           anim = BLUEBIRD_ANIM.walk;
  else                         anim = BLUEBIRD_ANIM.idle;

  const idx = anim === BLUEBIRD_ANIM.attack
    ? Math.min(anim.frames - 1, Math.floor(swingElapsed / (1000 / anim.fps)))
    : Math.floor(now / (1000 / anim.fps)) % anim.frames;

  return {
    sheet: _blueBirdSheet,
    sx: idx * BLUEBIRD_FRAME_W,
    sy: anim.row * BLUEBIRD_FRAME_H,
    sw: BLUEBIRD_FRAME_W,
    sh: BLUEBIRD_FRAME_H
  };
}

function getSkullFrameState(u) {
  const now = performance.now();
  const isMoving   = Math.abs(u.rx - u.x) > 0.05 || Math.abs(u.ry - u.y) > 0.05;
  const swingElapsed  = u.swingStart  ? now - u.swingStart  : Infinity;
  const guardElapsed  = u.guardStart  ? now - u.guardStart  : Infinity;
  const swingDur   = (skullAnimSheets.attack.frameCount / SKULL_ANIM_FPS.attack)  * 1000;
  const guardDur   = (skullAnimSheets.guard.frameCount  / SKULL_ANIM_FPS.guard)   * 1000;

  let anim = 'idle';
  if      (swingElapsed < swingDur)  anim = 'attack';
  else if (guardElapsed < guardDur)  anim = 'guard';
  else if (isMoving)                 anim = 'run';

  const sheet = skullAnimSheets[anim];
  const fps   = SKULL_ANIM_FPS[anim];
  const frameCount = sheet.frameCount;
  let frameIdx;
  if (anim === 'attack') frameIdx = Math.min(frameCount - 1, Math.floor(swingElapsed / (1000 / fps)));
  else if (anim === 'guard') frameIdx = Math.min(frameCount - 1, Math.floor(guardElapsed / (1000 / fps)));
  else frameIdx = Math.floor(now / (1000 / fps)) % frameCount;

  return { sheet: sheet.sheet, sx: frameIdx * SKULL_FRAME_W, sy: 0, sw: SKULL_FRAME_W, sh: SKULL_FRAME_W };
}

function getSpiderFrameState(u) {
  const isMoving = Math.abs(u.rx - u.x) > 0.05 || Math.abs(u.ry - u.y) > 0.05;
  const swingElapsed = u.swingStart ? performance.now() - u.swingStart : Infinity;
  const swingDur = (spiderAnimSheets.attack.frameCount / SPIDER_ANIM_FPS.attack) * 1000;
  let anim = 'idle';
  if (swingElapsed < swingDur) anim = 'attack';
  else if (isMoving) anim = 'run';

  const sheetState = spiderAnimSheets[anim];
  if (!sheetState?.sheet || !sheetState.sheet.complete || sheetState.sheet.naturalWidth <= 0) return null;
  const frameW = Math.floor(sheetState.sheet.naturalWidth / sheetState.frameCount);
  const frameH = sheetState.sheet.naturalHeight;
  let idx;
  if (anim === 'attack') {
    idx = Math.min(Math.floor(swingElapsed / (1000 / SPIDER_ANIM_FPS.attack)), sheetState.frameCount - 1);
  } else {
    idx = Math.floor(performance.now() / (1000 / SPIDER_ANIM_FPS[anim])) % sheetState.frameCount;
  }
  return {
    sheet: sheetState.sheet,
    sx: idx * frameW,
    sy: 0,
    sw: frameW,
    sh: frameH,
  };
}

function getSheepFrameState(u) {
  const isMoving = Math.abs(u.rx - u.x) > 0.05 || Math.abs(u.ry - u.y) > 0.05;
  const idleCycle = Math.floor(performance.now() / 1800) % 3;
  const anim = isMoving ? 'move' : (idleCycle === 2 ? 'graze' : 'idle');
  const sheetState = sheepAnimSheets[anim];
  if (!sheetState?.sheet || !sheetState.sheet.complete || sheetState.sheet.naturalWidth <= 0) return null;
  const frameW = Math.floor(sheetState.sheet.naturalWidth / sheetState.frameCount);
  const frameH = sheetState.sheet.naturalHeight;
  const idx = Math.floor(performance.now() / (1000 / SHEEP_ANIM_FPS[anim])) % sheetState.frameCount;
  return {
    sheet: sheetState.sheet,
    sx: idx * frameW,
    sy: 0,
    sw: frameW,
    sh: frameH,
  };
}

function getTrollFrameState(u) {
  const now = performance.now();
  const isMoving = Math.abs(u.rx - u.x) > 0.05 || Math.abs(u.ry - u.y) > 0.05;
  const swingElapsed = u.swingStart ? now - u.swingStart : Infinity;
  const swingDur = (trollAnimSheets.attack.frameCount / TROLL_ANIM_FPS.attack) * 1000;
  const recoveryElapsed = u.recoveryStart ? now - u.recoveryStart : Infinity;
  const recoveryDur = (trollAnimSheets.recovery.frameCount / TROLL_ANIM_FPS.recovery) * 1000;
  let anim = 'idle';
  if (swingElapsed < swingDur) anim = 'attack';
  else if (recoveryElapsed < recoveryDur) anim = 'recovery';
  else if (isMoving) anim = 'walk';

  const sheetState = trollAnimSheets[anim];
  if (!sheetState?.sheet || !sheetState.sheet.complete || sheetState.sheet.naturalWidth <= 0) return null;
  const frameW = Math.floor(sheetState.sheet.naturalWidth / sheetState.frameCount);
  const frameH = sheetState.sheet.naturalHeight;
  let idx;
  if (anim === 'attack') {
    idx = Math.min(Math.floor(swingElapsed / (1000 / TROLL_ANIM_FPS.attack)), sheetState.frameCount - 1);
  } else if (anim === 'recovery') {
    idx = Math.min(Math.floor(recoveryElapsed / (1000 / TROLL_ANIM_FPS.recovery)), sheetState.frameCount - 1);
  } else {
    idx = Math.floor(now / (1000 / TROLL_ANIM_FPS[anim])) % sheetState.frameCount;
  }
  return {
    sheet: sheetState.sheet,
    sx: idx * frameW,
    sy: 0,
    sw: frameW,
    sh: frameH,
  };
}

// ---- Minotaur enemy sprite sheets ----
const minotaurAnimSheets = {
  idle:   loadHorizontalSheetFrames('assets_tiny/Minotaur_Idle.png',   16),
  walk:   loadHorizontalSheetFrames('assets_tiny/Minotaur_Walk.png',    8),
  attack: loadHorizontalSheetFrames('assets_tiny/Minotaur_Attack.png', 12),
  guard:  loadHorizontalSheetFrames('assets_tiny/Minotaur_Guard.png',  11),
};
const MINOTAUR_ANIM_FPS = { idle: 10, walk: 9, attack: 14, guard: 11 };
const MINOTAUR_FRAME_W  = 320;

function getMinotaurFrameState(u) {
  const now = performance.now();
  const isMoving = Math.abs((u.rx ?? u.x) - u.x) > 0.05 || Math.abs((u.ry ?? u.y) - u.y) > 0.05;
  const swingDur = (minotaurAnimSheets.attack.frameCount / MINOTAUR_ANIM_FPS.attack) * 1000;
  const guardDur = (minotaurAnimSheets.guard.frameCount  / MINOTAUR_ANIM_FPS.guard)  * 1000;
  const swingElapsed = u.swingStart ? now - u.swingStart : Infinity;
  const guardElapsed = u.guardStart ? now - u.guardStart : Infinity;

  let anim = 'idle';
  if      (swingElapsed < swingDur) anim = 'attack';
  else if (guardElapsed < guardDur) anim = 'guard';
  else if (isMoving)                anim = 'walk';

  const sheet = minotaurAnimSheets[anim];
  const fps   = MINOTAUR_ANIM_FPS[anim];
  const fc    = sheet.frameCount;
  let idx;
  if (anim === 'attack') idx = Math.min(fc - 1, Math.floor(swingElapsed / (1000 / fps)));
  else if (anim === 'guard') idx = Math.min(fc - 1, Math.floor(guardElapsed / (1000 / fps)));
  else idx = Math.floor(now / (1000 / fps)) % fc;

  return { sheet: sheet.sheet, sx: idx * MINOTAUR_FRAME_W, sy: 0, sw: MINOTAUR_FRAME_W, sh: MINOTAUR_FRAME_W };
}

// ---- Ronke NPC sprite sheet (22 idle frames, 128x128 each) ----
const ronkeIdleSheet  = loadHorizontalSheetFrames('assets_tiny/Ronke_Idle.png',  22);
const ronke2IdleSheet   = loadHorizontalSheetFrames('assets_tiny/Ronke2_Idle.png',   8);
const ronke2WalkSheet   = loadHorizontalSheetFrames('assets_tiny/Ronke2_Walk.png',   8);
const ronke2AttackSheet = loadHorizontalSheetFrames('assets_tiny/Ronke2_Attack.png', 8);
const RONKE_FRAME_W   = 128;
const RONKE2_FRAME_W  = 640;
const RONKE_ANIM_FPS  = 10;

// ---- Stabby McSpear NPC sprite sheets (192x192 frames) ----
const stabbyIdleSheet  = loadHorizontalSheetFrames('assets_tiny/Stabby_Idle.png',  8);
const stabbyRunSheet   = loadHorizontalSheetFrames('assets_tiny/Stabby_Run.png',   6);
const stabbyThrowSheet = loadHorizontalSheetFrames('assets_tiny/Stabby_Throw.png', 8);
const harpoonImg = new Image(); harpoonImg.src = 'assets_tiny/Harpoon.png';
const STABBY_FRAME_W = 192;

function getRonkeFrameState(u) {
  const s = ronkeIdleSheet;
  if (!s?.sheet || !s.sheet.complete || s.sheet.naturalWidth <= 0) return null;
  const idx = Math.floor(performance.now() / (1000 / RONKE_ANIM_FPS)) % s.frameCount;
  return { sheet: s.sheet, sx: idx * RONKE_FRAME_W, sy: 0, sw: RONKE_FRAME_W, sh: RONKE_FRAME_W };
}

function getRonke2FrameState(u) {
  const now = performance.now();
  const isAttacking = u.swingStart && (now - u.swingStart) < (8 / 10 * 1000);
  const isMoving = !isAttacking && (u.rx !== undefined && u.ry !== undefined)
    ? (Math.abs(u.rx - Math.round(u.rx)) > 0.02 || Math.abs(u.ry - Math.round(u.ry)) > 0.02)
    : false;
  let s, fps;
  if (isAttacking) {
    s = ronke2AttackSheet; fps = 10;
  } else if (isMoving) {
    s = ronke2WalkSheet;   fps = 12;
  } else {
    s = ronke2IdleSheet;   fps = RONKE_ANIM_FPS;
  }
  if (!s?.sheet || !s.sheet.complete || s.sheet.naturalWidth <= 0) return null;
  const idx = isAttacking
    ? Math.min(Math.floor((now - u.swingStart) / (1000 / fps)), s.frameCount - 1)
    : Math.floor(now / (1000 / fps)) % s.frameCount;
  return { sheet: s.sheet, sx: idx * RONKE2_FRAME_W, sy: 0, sw: RONKE2_FRAME_W, sh: RONKE2_FRAME_W };
}

function getStabbyFrameState(u) {
  const now = performance.now();
  // All frames = 100ms = 10fps (from .aseprite source)
  const _STABBY_FPS = 10;
  const throwDur = (stabbyThrowSheet?.frameCount || 8) / _STABBY_FPS * 1000; // 800ms
  const isThrowing = u.stabbyThrowStart && (now - u.stabbyThrowStart) < throwDur;
  const isMoving = !isThrowing && (u.rx !== undefined && u.ry !== undefined)
    ? (Math.abs(u.rx - Math.round(u.rx)) > 0.04 || Math.abs(u.ry - Math.round(u.ry)) > 0.04)
    : false;
  let s, fps;
  if (isThrowing)    { s = stabbyThrowSheet; fps = _STABBY_FPS; }
  else if (isMoving) { s = stabbyRunSheet;   fps = _STABBY_FPS; }
  else               { s = stabbyIdleSheet;  fps = _STABBY_FPS; }
  if (!s?.sheet || !s.sheet.complete || s.sheet.naturalWidth <= 0) return null;
  const idx = isThrowing
    ? Math.min(Math.floor((now - u.stabbyThrowStart) / (1000 / fps)), s.frameCount - 1)
    : Math.floor(now / (1000 / fps)) % s.frameCount;
  return { sheet: s.sheet, sx: idx * STABBY_FRAME_W, sy: 0, sw: STABBY_FRAME_W, sh: STABBY_FRAME_W };
}

// Adventure enemy archetypes
const ENEMY_TYPES = [
  { type: 'shaman',  hp: 2, color: '#cc30ff', scale: 1.00, label: 'SHAMAN' },
  { type: 'spider',  hp: 2, color: '#7c1010', scale: 1.00, label: 'SPIDER' },
  { type: 'sheep',   hp: 1, color: '#b9e8a3', scale: 0.95, label: 'SHEEP' },
  { type: 'troll',   hp: 8, color: '#6f8f43', scale: 1.25, label: 'TROLL' },
  { type: 'leak',    hp: 1, color: '#ff6622', scale: 1.00, label: 'LEAK' },
  { type: 'worm',    hp: 2, color: '#00ffaa', scale: 1.10, label: 'WORM' },
  { type: 'overflow',hp: 1, color: '#dd1a40', scale: 1.18, label: 'OVR' },
  { type: 'corrupt', hp: 1, color: '#cc30ff', scale: 1.25, label: 'CRPT' },
  { type: 'idol',    hp: 4, color: '#6fd6ff', scale: 1.65, label: 'NULL IDOL' },
  { type: 'shield',  hp: 3, color: '#44aaff', scale: 1.05, label: 'SHIELD' },
  { type: 'ironbox', hp: 5, color: '#8899aa', scale: 1.25, label: 'FORTRESS' },
  { type: 'skull',     hp: 3,  color: '#e8d8c0', scale: 1.10, label: 'SKULL' },
  { type: 'bluebird',  hp: 2,  color: '#4488ff', scale: 1.00, label: 'BIRD' },
  { type: 'minotaur',  hp: 6,  color: '#8b2020', scale: 1.40, label: 'MINOTAUR' },
  { type: 'ronke',     hp: 8,  color: '#3355cc', scale: 1.50, label: 'RONKE' },
  { type: 'ronke2',    hp: 8,  color: '#4466dd', scale: 1.50, label: 'RONKE2' },
  { type: 'stabby',   hp: 4,  color: '#cc8833', scale: 1.20, label: 'STABBY' },
];

const EDITOR_NPC_TYPES = [
  { type: 'shaman',   label: 'SHAMAN',   color: '#cc30ff' },
  { type: 'spider',   label: 'SPIDER',   color: '#7c1010' },
  { type: 'sheep',    label: 'SHEEP',    color: '#b9e8a3' },
  { type: 'troll',    label: 'TROLL',    color: '#6f8f43' },
  { type: 'skull',    label: 'SKULL',    color: '#e8d8c0' },
  { type: 'bluebird', label: 'BIRD',     color: '#4488ff' },
  { type: 'minotaur', label: 'MINOTAUR', color: '#8b2020' },
  { type: 'ronke',    label: 'RONKE',    color: '#3355cc' },
  { type: 'ronke2',   label: 'RONKE2',   color: '#4466dd' },
  { type: 'stabby',  label: 'STABBY',   color: '#cc8833' },
];


let canvas, ctx, raf;

// Offscreen dungeon cache — rebuilt every 4 frames (~15fps for slow animations)
let _dunCanvas = null, _dunCtx = null, _dunFrame = 0, _dunDirty = true;
let lastTime = 0;
let tickTimer = null;
let tickStart = null;
let gameMode = 'pvp';
let advCanvasW = BOARD_W; // wider canvas in adventure mode (replaces hidden P2 panel)
let _p2PanelEl = null;   // saved reference when panel is removed from DOM
let S = {};
let stats = {};
let aiThinkInterval = null;

function cloneEditorEnemyPlacements(list = []) {
  const seen = new Set();
  const out = [];
  list.forEach((entry) => {
    if (!entry) return;
    const type = String(entry.type || '').trim();
    const x = Number(entry.x);
    const y = Number(entry.y);
    if (!type || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    const key = `${type}:${gx},${gy}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ type, x: gx, y: gy });
  });
  return out;
}

function getEditorEnemyArchetype(type) {
  return ENEMY_TYPES.find((enemy) => enemy.type === type) || null;
}

function getLiveEditorEnemyPlacements() {
  if (!Array.isArray(S.units)) return [];
  return S.units
    .filter((u) => u && u.team === 1 && u.alive && getEditorEnemyArchetype(u.utype))
    .map((u) => ({ type: u.utype, x: u.x, y: u.y }));
}

function persistEditorEnemyPlacements() {
  if (!Array.isArray(S.customEnemyPlacements)) S.customEnemyPlacements = [];
  if (window.CUSTOM_MAP && S.floor === 1) {
    window.CUSTOM_MAP.enemies = cloneEditorEnemyPlacements(S.customEnemyPlacements);
  }
  S.totalEnemies = Array.isArray(S.units) ? S.units.filter((u) => isHostileAdventureEnemy(u)).length : 0;
}

function syncEditorEnemyPlacementsFromUnits() {
  S.customEnemyPlacements = cloneEditorEnemyPlacements(getLiveEditorEnemyPlacements());
  persistEditorEnemyPlacements();
  return S.customEnemyPlacements;
}

function nextEditorUnitId() {
  if (!Array.isArray(S.units) || S.units.length === 0) return 1;
  return S.units.reduce((maxId, unit) => Math.max(maxId, unit.id || 0), 0) + 1;
}

function removeEditorEnemyAt(gx, gy) {
  let removed = false;
  if (Array.isArray(S.units)) {
    S.units = S.units.filter((unit) => {
      const match = unit && unit.team === 1 && unit.alive && unit.x === gx && unit.y === gy && getEditorEnemyArchetype(unit.utype);
      if (match) removed = true;
      return !match;
    });
  }
  if (Array.isArray(S.customEnemyPlacements)) {
    const before = S.customEnemyPlacements.length;
    S.customEnemyPlacements = S.customEnemyPlacements.filter((enemy) => !(enemy.x === gx && enemy.y === gy));
    if (S.customEnemyPlacements.length !== before) removed = true;
  }
  if (removed) persistEditorEnemyPlacements();
  return removed;
}

function placeEditorEnemy(type, gx, gy) {
  const archetype = getEditorEnemyArchetype(type);
  if (!archetype || !Array.isArray(S.dungeon)) return false;
  if (gx < 0 || gy < 0 || gy >= ROWS || gx >= COLS) return false;
  if (typeof isWall === 'function' && isWall(gx, gy)) return false;
  if (Array.isArray(S.units) && S.units.some((unit) => unit.team === 0 && unit.alive && unit.x === gx && unit.y === gy)) return false;
  if (Array.isArray(S.teleports) && S.teleports.some((pad) => pad.x === gx && pad.y === gy)) return false;

  removeEditorEnemyAt(gx, gy);
  if (!Array.isArray(S.customEnemyPlacements)) S.customEnemyPlacements = [];
  S.customEnemyPlacements.push({ type, x: gx, y: gy });
  if (!Array.isArray(S.units)) S.units = [];
  S.units.push(mkUnit(nextEditorUnitId(), 1, gx, gy, -1, archetype));
  persistEditorEnemyPlacements();
  return true;
}

const ENEMY_BATCH_ACT_CHANCE = 0.68;

function collectAiBatchActions(aiUnits, nextBullets, safe, p1Future) {
  const batch = [];
  const reservedMoveTargets = new Set();
  const rolledUnits = [...aiUnits];

  for (let i = rolledUnits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rolledUnits[i], rolledUnits[j]] = [rolledUnits[j], rolledUnits[i]];
  }

  rolledUnits.forEach(unit => {
    if (Math.random() > ENEMY_BATCH_ACT_CHANCE) return;

    const res = aiUnitDecide(unit, nextBullets, safe, p1Future);
    if (!res) return;

    const action = { ...res.action, unitId: unit.id };
    if (action.t === 'move') {
      const nx = unit.x + action.dx;
      const ny = unit.y + action.dy;
      const key = `${nx},${ny}`;
      if (reservedMoveTargets.has(key)) return;
      reservedMoveTargets.add(key);
    }

    if (action.fo) unit.facing = action.fo;
    batch.push(action);
  });

  return batch;
}


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


function checkAchievements() {
  if (!Profile.achievements) Profile.achievements = {};
  ACHIEVEMENTS.forEach(a => {
    if (Profile.achievements[a.id]) return;
    if (a.check(Profile, { ...Profile.stats, teleportUses: S.teleportUses || 0, reachedMaxEnergy: S.reachedMaxEnergy || false })) {
      Profile.achievements[a.id] = Date.now();
      saveProfile();
      showAchievementPopup(a);
    }
  });
}

function showAchievementPopup(a) {
  const popup = document.getElementById('achievement-popup');
  if (!popup) return;
  document.getElementById('ach-label-text').textContent = a.label;
  document.getElementById('ach-desc-text').textContent = a.desc;
  popup.classList.add('visible');
  SFX.play(880, 0.1, 0.05, 'square');
  setTimeout(() => SFX.play(1320, 0.15, 0.06, 'square'), 100);
  logEvent(`ACHIEVEMENT: ${a.label}`, 'info');
  setTimeout(() => popup.classList.remove('visible'), 3500);
}


// Generic slide-in notification (top-center, auto-dismiss).
let _notifTimer = null;
function showGameNotification(title, desc, color) {
  color = color || '#00f5ff';
  const el = document.getElementById('game-notif');
  if (!el) return;
  el.style.borderColor = color;
  el.style.boxShadow = `0 0 24px ${color}44`;
  const t = document.getElementById('game-notif-title');
  const d = document.getElementById('game-notif-desc');
  if (t) { t.textContent = title; t.style.color = color; t.style.textShadow = `0 0 8px ${color}`; }
  if (d) d.textContent = desc;
  el.classList.add('visible');
  if (_notifTimer) clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => el.classList.remove('visible'), 3200);
}

window.openAchievementsPanel = function () {
  renderAchievementsPanel();
  document.getElementById('ach-overlay').classList.add('active');
  SFX.play(600, 0.08, 0.04, 'square', 200);
};

window.closeAchievementsPanel = function () {
  document.getElementById('ach-overlay').classList.remove('active');
  SFX.play(400, 0.06, 0.04, 'square', -200);
};

function renderAchievementsPanel() {
  const grid = document.getElementById('ach-grid-main');
  if (!grid) return;
  grid.innerHTML = '';

  const unlocked = Profile.achievements || {};
  const total = ACHIEVEMENTS.length;
  const count = ACHIEVEMENTS.filter(a => unlocked[a.id]).length;

  // Update count badge + progress bar
  const badge = document.getElementById('ach-count-badge');
  if (badge) badge.textContent = `${count} / ${total}`;
  const fill = document.getElementById('ach-progress-fill');
  if (fill) fill.style.width = `${(count / total) * 100}%`;

  ACHIEVEMENTS.forEach(a => {
    const isUnlocked = !!unlocked[a.id];
    const div = document.createElement('div');
    div.className = 'ach-item-card ' + (isUnlocked ? 'ach-card-unlocked' : 'ach-card-locked');

    let dateStr = '';
    if (isUnlocked && unlocked[a.id]) {
      const d = new Date(unlocked[a.id]);
      dateStr = `<div class="ach-card-date">${d.toLocaleDateString()}</div>`;
    }

    div.innerHTML = `
      <div class="ach-card-icon">${isUnlocked ? '*' : '-'}</div>
      <div class="ach-card-info">
        <div class="ach-card-label">${a.label}</div>
        <div class="ach-card-desc">${a.desc}</div>
        ${dateStr}
      </div>
    `;
    grid.appendChild(div);
  });
}


function startTutorial() {
  if (Profile.tutorialDone) return;
  tutorialActive = true;
  tutorialStepIdx = 0;
  showTutorialStep(0);
  document.getElementById('tutorial-card')?.classList.add('visible');
}

function showTutorialStep(idx) {
  const step = TUTORIAL_STEPS[idx];
  if (!step) return;

  const numEl = document.getElementById('tut-step-num');
  if (numEl) numEl.textContent = `${String(idx + 1).padStart(2, '0')} / ${TUTORIAL_STEPS.length}`;

  const titleEl = document.getElementById('tut-title');
  if (titleEl) titleEl.textContent = step.title;

  const descEl = document.getElementById('tut-desc');
  if (descEl) descEl.innerHTML = step.desc.replace(/\n/g, '<br>');

  const keysEl = document.getElementById('tut-keys-area');
  if (keysEl) {
    if (step.keys === 'wasd') {
      keysEl.innerHTML = `
        <div class="tut-wasd">
          <div class="tut-key-row"><span class="tut-key">W</span></div>
          <div class="tut-key-row">
            <span class="tut-key">A</span>
            <span class="tut-key">S</span>
            <span class="tut-key">D</span>
          </div>
        </div>`;
    } else if (step.keys === 'shoot') {
      keysEl.innerHTML = `
        <div class="tut-shoot-keys">
          <span class="tut-key tut-key-wide">SPACE</span>
          <span class="tut-key-or">or</span>
          <span class="tut-key tut-key-wide">MOUSE CLICK</span>
        </div>`;
    } else {
      keysEl.innerHTML = '';
    }
  }

  const hintEl = document.getElementById('tut-hint');
  if (hintEl) hintEl.textContent = step.hint || '';

  const nextBtn = document.getElementById('tut-next-btn');
  if (nextBtn) nextBtn.style.display = step.trigger === 'button' ? 'inline-block' : 'none';

  // Energy highlight
  const energyHud = document.getElementById('energy-hud');
  if (energyHud) {
    if (step.highlight === 'energy') energyHud.classList.add('tut-highlight');
    else energyHud.classList.remove('tut-highlight');
  }
}

window.advanceTutorial = function () {
  tutorialStepIdx++;
  if (tutorialStepIdx >= TUTORIAL_STEPS.length) {
    endTutorial();
  } else {
    showTutorialStep(tutorialStepIdx);
  }
};

window.skipTutorial = function () {
  endTutorial();
};

function endTutorial() {
  tutorialActive = false;
  document.getElementById('tutorial-card')?.classList.remove('visible');
  document.getElementById('energy-hud')?.classList.remove('tut-highlight');
  Profile.tutorialDone = true;
  saveProfile();
}

function drawTutorialHighlight() {
  if (!tutorialActive) return;
  const step = TUTORIAL_STEPS[tutorialStepIdx];
  if (!step || step.highlight === 'none' || step.highlight === 'energy') return;
  const t = performance.now() / 1000;

  if (step.highlight === 'hero') {
    const hero = S.units?.find(u => u.team === 0 && u.alive);
    if (!hero) return;
    const cx = (hero.x + 0.5) * CELL;
    const cy = (hero.y + 0.5) * CELL;
    ctx.save();
    for (let ring = 0; ring < 3; ring++) {
      const phase = ((t * 0.7) + ring * 0.33) % 1;
      const r = CELL * 0.5 + phase * CELL * 0.8;
      const alpha = (1 - phase) * 0.7;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#00f5ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

const UTYPE_ICONS = {};

function getUtypeIcon(utype) {
  let color = '#ffffff';
  if (utype === 'worm') color = '#00ffaa';
  else if (utype === 'spider') color = '#7c1010';
  else if (utype === 'sheep') color = '#b9e8a3';
  else if (utype === 'troll') color = '#6f8f43';
  else if (utype === 'leak') color = '#ff6622';
  else if (utype === 'corrupt') color = '#cc30ff';
  else if (utype === 'overflow') color = '#dd1a40';
  else if (utype === 'idol') color = '#6fd6ff';
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
      } else if (utype === 'idol') {
        if (typeof drawEnemyNullIdol === 'function') drawEnemyNullIdol(17, 17, dummyU, 1.0);
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
  return `<span style="color:${color}">X</span>`;
}

function getUtypeLabel(utype) {
  if (!utype) return 'ALIEN';
  if (typeof ENEMY_TYPES !== 'undefined') {
    const t = ENEMY_TYPES.find(e => e.type === utype);
    if (t) return t.label;
  }
  return utype.toUpperCase();
}

function getCombatLabel(unit) {
  if (!unit) return 'ALIEN';
  if (unit.bossName) return unit.bossName;
  return getUtypeLabel(unit.utype);
}


// ---- Retro Sound System - synthesized 8-bit sounds -------------
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
    _heroHitFlash = 1.0;
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
    // Rising hum - builds tension through the whole scan (~1.3s)
    this.play(90, 1.15, 0.055, 'sawtooth', 480);
    // Accelerating ticks - like a slot reel spinning, getting faster
    [0, 210, 400, 570, 720, 840, 940, 1020, 1085, 1135, 1175, 1210].forEach(t =>
      setTimeout(() => this.play(1000 + Math.random() * 700, 0.03, 0.02, 'square'), t)
    );
  },
  upgradeSuccess() {
    // Rising arpeggio - C4 E4 G4 C5
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
  teleport() {
    this.play(200, 0.05, 0.04, 'sine', 800);
    setTimeout(() => this.play(1200, 0.12, 0.06, 'sine', -400), 60);
    setTimeout(() => this.play(800, 0.18, 0.05, 'square', 300), 140);
  },
  jump() {
    // Sharp electric dash crack + trailing hiss
    this.play(2200, 0.04, 0.08, 'sawtooth', -2000);
    setTimeout(() => this.play(1800, 0.06, 0.06, 'sawtooth', -1600), 30);
    setTimeout(() => this.play(400, 0.10, 0.04, 'sine', -300), 70);
  },
  flare() {
    // Launch thump + rising whistle
    this.play(120, 0.12, 0.10, 'sawtooth', -60);
    setTimeout(() => this.play(300, 0.08, 0.06, 'sine', 800), 60);
    setTimeout(() => this.play(900, 0.18, 0.05, 'sine', 600), 130);
    setTimeout(() => this.play(1400, 0.22, 0.04, 'sine', -200), 260);
  },
  hack() {
    // Electronic zap: high buzz + descending glitch tone
    this.play(1200, 0.06, 0.07, 'square', -400);
    setTimeout(() => this.play(800, 0.10, 0.06, 'sawtooth', -600), 40);
    setTimeout(() => this.play(440, 0.14, 0.07, 'sine', -300), 100);
  },
  hackFail() {
    // Fizzle/miss sound
    this.play(300, 0.08, 0.05, 'sawtooth', -200);
    setTimeout(() => this.play(180, 0.06, 0.05, 'square', -100), 80);
  },
  crackStart() {
    // Boot-up thud + rising data hum
    this.play(55, 0.18, 0.12, 'sawtooth', 0);
    setTimeout(() => this.play(110, 0.25, 0.08, 'sawtooth', 220), 80);
    setTimeout(() => this.play(220, 0.30, 0.055, 'square', 440), 200);
  },
  crackTick() {
    // Single rapid keypress-like tick
    this.play(1400 + Math.random() * 600, 0.022, 0.018, 'square', -500);
  },
  crackBurst() {
    // Mid-crack data burst — glitchy electronic stutter
    this.play(900, 0.05, 0.055, 'sawtooth', 600);
    setTimeout(() => this.play(1300, 0.04, 0.045, 'square', -800), 25);
    setTimeout(() => this.play(700, 0.06, 0.04, 'sawtooth', 400), 55);
  },
  crackCollision() {
    // "Almost there" — rising alarm-like pulse
    this.play(440, 0.10, 0.07, 'square', 220);
    setTimeout(() => this.play(660, 0.10, 0.065, 'square', 220), 90);
    setTimeout(() => this.play(880, 0.12, 0.06, 'square', 220), 180);
  },
  crackSuccess() {
    // Triumphant unlock — bright arpeggio + deep confirm thud
    this.play(55, 0.30, 0.10, 'sawtooth', 0);
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      setTimeout(() => this.play(f, 0.22, 0.055, 'square', 40), 60 + i * 65)
    );
    setTimeout(() => this.play(2000, 0.18, 0.04, 'sine', -800), 420);
  },

  // ---- Slot machine sounds -------------------------------------
  slotClick() {
    // Ratchet tick - rapid mechanical click while reels spin
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
    // Result fanfare - pitch based on rarity
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

  // ---- Card picker sounds -------------------------------------
  cardTick() {
    // Soft rapid digital click while cards cycle (called every few frames)
    this.play(1600 + Math.random() * 600, 0.022, 0.010, 'square', -400);
  },
  cardReveal(idx) {
    // Satisfying lock-in clunk, escalating pitch per card (idx 0-3)
    const bases = [330, 392, 494, 587]; // E4, G4, B4, D5
    const base = bases[idx] || 440;
    this.play(base, 0.07, 0.10, 'square', 0);
    setTimeout(() => this.play(base * 1.5, 0.10, 0.07, 'sine', 60), 55);
    if (idx >= 2) {
      // 3rd and 4th cards get an extra shimmer
      setTimeout(() => this.play(base * 2, 0.09, 0.055, 'sine'), 120);
    }
    if (idx === 3) {
      // Final card — full chord shimmer
      setTimeout(() => this.play(base * 2.5, 0.07, 0.06, 'sine'), 185);
      setTimeout(() => this.play(base * 3, 0.05, 0.05, 'sine'), 250);
    }
  },
  cardPicked() {
    // Confirmation sting when player clicks a card
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.play(f, 0.18, 0.07, 'square', 40), i * 75)
    );
  },

  chestSpawn() {
    // Static burst - digital noise as chest data streams in
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
    // Three rapid warning taps - attention signal
    [0, 95, 180].forEach((t, i) =>
      setTimeout(() => this.play(1300 - i * 130, 0.055, 0.07, 'square'), t)
    );
    // Deep gravity pull - two bass layers holding
    setTimeout(() => {
      this.play(55, 0.62, 0.13, 'sawtooth', 0);
      this.play(110, 0.52, 0.07, 'sawtooth', 0);
    }, 210);
    // Tunnel rush - sharp gliss rockets upward
    setTimeout(() => this.play(95, 0.52, 0.12, 'sawtooth', 2000), 290);
    // Glassy shimmer overtones
    [0, 55, 115, 175].forEach(t =>
      setTimeout(() => this.play(750 + Math.random() * 700, 0.09, 0.028, 'sine'), 360 + t)
    );
    // Arrival chord - clean and bright
    setTimeout(() => {
      this.play(523, 0.32, 0.09, 'sine');
      this.play(659, 0.28, 0.06, 'sine');
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

// ---- Retro Music System - Procedural BGM -----------------------
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
      // 32-step casino/gamble loop - A minor, fast, syncopated
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
    reward: {
      // 16-step celebratory C-major loop for card picker
      bass: [48, 0, 48, 0, 55, 0, 55, 0, 48, 0, 48, 0, 52, 0, 55, 0],
      chords: [
        [60, 64, 67], null, null, null, [60, 64, 67], null, null, null,
        [60, 64, 67], null, null, null, [59, 62, 67], null, null, null
      ],
      arp: [72, 76, 79, 84, 79, 76, 72, 67, 72, 76, 79, 84, 83, 79, 76, 72],
      drums: [1, 3, 3, 3, 2, 3, 3, 3, 1, 3, 3, 3, 2, 3, 1, 3],
      speed: 2.4,
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
    },
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
    const doStart = () => {
      if (this.timer) clearTimeout(this.timer);
      if (this.masterGain) {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      }
      this.currentTrack = trackId || 'menu';
      this.step = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.05;
      this.active = true;
      this.tick();
    };
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(doStart);
    } else {
      doStart();
    }
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
    // Final A minor chord - low and heavy
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
  const unit = {
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
    ...(etype?.dodge !== undefined ? { dodge: etype.dodge } : {}),
  };
  if (utype === 'sheep' || utype === 'troll') {
    unit.weapon = 'none';
    unit.ammo = 0; unit.maxAmmo = 0;
    unit.laserAmmo = 0; unit.heavyAmmo = 0; unit.shotgunAmmo = 0;
  }
  return unit;
}

function mkFirstRoomBoss(id, x, y) {
  const boss = mkUnit(id, 1, x, y, -1, ENEMY_TYPES.find(e => e.type === 'idol'));
  boss.weapon = 'laser';
  boss.maxLaserAmmo = 2;
  boss.laserAmmo = 2;
  boss.bossName = 'NULL IDOL';
  boss.dmgBonus = 1;
  boss.noLootGlow = true;
  return boss;
}

function mkBoss01(id, x, y) {
  const boss01 = mkUnit(id, 1, x, y, -1, { type: 'boss01', hp: 5, scale: 1.0, color: '#aa33ff' });
  boss01.weapon = 'heavy';
  boss01.maxHeavyAmmo = 6; // Double the ammo needed, halving fire rate
  boss01.heavyAmmo = 6;
  boss01.bossName = 'BOSS 01';
  boss01.dmgBonus = 1;
  boss01.noLootGlow = true;
  return boss01;
}


// Applies armor floor buff to incoming hero damage (minimum 1)
function heroDmg(raw) { return Math.max(1, raw - (S.floorBuffs?.armor || 0)); }

function noteBossBurstHit(unit, attackerTeam) {
  if (!unit || unit.utype !== 'idol' || attackerTeam !== 0) return;
  const hitTick = S.tick || 0;
  const now = performance.now();
  unit.idolFlipStart = now;
  unit.idolFlipUntil = now + 500; // Fast 360 spin duration
  if (unit.lastBurstHitTick != null && hitTick - unit.lastBurstHitTick <= 1) unit.burstHits = (unit.burstHits || 0) + 1;
  else unit.burstHits = 1;
  unit.lastBurstHitTick = hitTick;
  if ((unit.burstHits || 0) >= 2) {
    unit.forceDodgeShots = 1;
    unit.burstHits = 0;
  }
}

function isAdjacentToEnemy(unit) {
  if (!unit || !unit.alive) return false;
  return unit._adjEnemy || false; // uses per-frame cached value
}

function getCurrentWeapon(unit) {
  if (!unit) return 'bullet';
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
    bornAt: performance.now(),
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
    // Collision box decoration — treated as wall
    if (S.collisionBoxes && S.collisionBoxes.has(y + ',' + x)) return true;
    // Check for moving platforms (solid obstacles)
    if (S.platforms && S.platforms.some(p => Math.round(p.lx) === x && Math.round(p.ly) === y)) return true;
  }
  return false;
}

// ---- Hub Room Mode ---------------------------------------------
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
  S.shrines = []; S.bloodStains = []; S.chests = []; S.loot = []; S.platforms = [];
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
  S.pendingEnemyBatch = [];
  S.bullets = []; S.lasers = []; S.particles = []; S.dmgNumbers = []; S.meleeStrikes = [];
  S.deathAnims = []; S.spawnAnims = []; S.meatDrops = []; S.shamanProjectiles = []; S.harpoons = [];
  _shamanExplosions.length = 0;
  S.pendingPassiveRewards = [];
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

// ---- Adventure mode --------------------------------------------
function initAdventure() {
  S.isHubRoom = false;
  S.terminals = [];
  S.floor = S.floor || 1;

  // Graduali progresavimo seka
  const floorProgression = [
    { w: 1, h: 1 }, // Floor 1: 1 room
    { w: 1, h: 1 }, // Floor 2: 1 room
    { w: 1, h: 1 }, // Floor 3: 1 room (Boss 01 room)
    { w: 3, h: 1 }, // Floor 4: 3 rooms
    { w: 2, h: 2 }, // Floor 5: 4 rooms
    { w: 3, h: 2 }, // Floor 6: 6 rooms
    { w: 3, h: 3 }, // Floor 7: 9 rooms
    { w: 4, h: 3 }, // Floor 8: 12 rooms
    { w: 4, h: 4 }, // Floor 9: 16 rooms
  ];

  // At random string of 1-5 rooms (indices 0-4) forever
  const configIdx = Math.floor(Math.random() * 5);
  S.gridW = floorProgression[configIdx].w;
  S.gridH = floorProgression[configIdx].h;

  ADV_MAP_COLS = 13 * S.gridW + 2;
  ADV_MAP_ROWS = 11 * S.gridH + 2;

  // Apply a random shrink so maps variation keeps happening (from 0 to 4 shrunk)
  const mapShrink = Math.floor(Math.random() * 3) * 2;
  ADV_MAP_COLS -= mapShrink;
  ADV_MAP_ROWS -= mapShrink;
  COLS = ADV_MAP_COLS;
  ROWS = ADV_MAP_ROWS;

  // Must be initialized BEFORE generateDungeon() which pushes into these arrays
  S.shrines = [];
  S.bloodStains = [];
  S.chests = [];
  S.teleports = [];
  S.teleportCooldown = 0;
  S.teleportUses = 0;
  S.pendingTeleportSector = false;
  S._clearedTriggered = false;
  S.jumpFreeCount = (Profile.upgrades?.jumpLevel || 0) >= 2 ? 2 : 1;
  S.jumpMode = false;
  if (S.floor === 1) { const _fl = Profile.upgrades?.freeShotLevel || 0; S.shotsUntilFree = _fl >= 5 ? 6 : _fl >= 4 ? 7 : _fl >= 3 ? 8 : _fl >= 2 ? 9 : 10; } // reset free shot counter on new run
  S.reachedMaxEnergy = false;
  generateDungeon();
  buildWallPackets();
  invalidateDungeonCache();
  S.fog = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  S.fogReveal = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  S.lightGhosts = [];
  updateExplorationTracker();
  S.cam = { x: 0, y: 0, tx: 0, ty: 0 };
  if (S.floor === 1) S.energy = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);  // reset on fresh run, include upgrade bonus
  S.energyDepleted = false;
  S.phase = 'frozen'; S.tick = 0;
  S.pending = [null, null];
  S.bullets = []; S.lasers = []; S.particles = []; S.dmgNumbers = []; S.meleeStrikes = [];
  S.deathAnims = []; S.spawnAnims = []; S.meatDrops = []; S.shamanProjectiles = [];
  _shamanExplosions.length = 0;
  S.pendingPassiveRewards = [];
  S.shake = 0; S.animT = 1;
  S.winner = null; S.pendingGameover = false;
  S.clock = [120000, 120000]; S.timeForfeited = -1; S.clockSide = 0;
  S.loot = [];
  S.inGameUpgradeLevel = 0;
  // Global inventory - always load from Profile, derive counters from slots
  S.inventory = (Array.isArray(Profile.inventory) && Profile.inventory.length > 0)
    ? Profile.inventory.map(x => x ? { ...x } : null)
    : new Array(INV_SLOTS).fill(null);
  S.bytes = 0;
  { const _bi = S.inventory?.findIndex(s => s && s.type === 'byte'); if (_bi >= 0) S.inventory[_bi] = null; }
  { const _f = S.inventory.find(s => s && s.type === 'fragment'); S.fragments = _f ? _f.qty : 0; }
  { const _x = S.inventory.find(s => s && s.type === 'xptoken'); S.xpTokens = _x ? _x.qty : 0; }
  S.kills = 0;
  _updateKillsDisplay();
  S.explorerChestSpawned = false;
  S.fullMapRevealed = false;
  S.flareUsed = false;
  S.flareMode = false;
  S.flareProjectile = null;
  S.flareRevealedCells = new Set();
  S.ronkeShield = { active: false, movesLeft: 0, step: 0, ticks: 0, alive: [false, false] };
  S.ronkeInfect = null;
  S.ronkeDeathAnim = null;
  if (S.floor <= 1) S.runCards = [];
  S.floorBuffs = { melee: 0, armor: 0, chipMul: 1, critBonus: 0 };
  S.pendingSlotPrize = null;
  S.footsteps = [];
  if (S.floor === 1) S.nanoSteps = 0;

  // Player units in start room
  const sr = S.rooms[0];
  const _fcm = getFloorCustomMap();
  const _sp = (_fcm && _fcm.spawnPos) ? _fcm.spawnPos : null;
  const px = _sp ? _sp.x : (sr ? sr.x + 3 : 4);  // default sr.x+1, +2 deeper
  const py = _sp ? _sp.y : (sr ? sr.y     : 1);  // default sr.y+1, -1 up (sr.y = top room row, valid floor)
  const useCustomEnemyPlacements = !!(_fcm && Array.isArray(_fcm.enemies));
  S.customEnemyPlacements = useCustomEnemyPlacements ? cloneEditorEnemyPlacements(_fcm.enemies) : [];
  S.units = [
    mkUnit(0, 0, px, py, 1),
  ];
  S.selectedId = [0, 3];

  // Enemies dynamic distribution
  let eid = 3;
  const numRooms = S.rooms.length;

  const poolByRoom = (ri) => {
    if (gameMode === 'adventure') {
      const fl = S.floor || 1;
      if (ri === 0) return ['shaman', 'skull', 'spider'].map(getEditorEnemyArchetype); // First room
      if (ri === numRooms - 1 && numRooms > 1) return ['worm', 'shield', 'skull', 'spider'].map(getEditorEnemyArchetype); // Last room
      if (fl <= 2) return ['shaman', 'skull', 'spider', 'leak', 'ironbox'].map(getEditorEnemyArchetype);
      if (fl <= 4) return ['skull', 'spider', 'shaman', 'worm', 'shield', 'ironbox'].map(getEditorEnemyArchetype);
      return ['skull', 'spider', 'troll', 'worm', 'shield', 'ironbox'].map(getEditorEnemyArchetype); // Floor 5+
    }
  };

  if (useCustomEnemyPlacements) {
    S.customEnemyPlacements.forEach((enemy) => {
      const archetype = getEditorEnemyArchetype(enemy.type);
      if (!archetype) return;
      if (enemy.x < 0 || enemy.y < 0 || enemy.x >= COLS || enemy.y >= ROWS) return;
      if (isWall(enemy.x, enemy.y) || S.units.some((u) => u.x === enemy.x && u.y === enemy.y)) return;
      S.units.push(mkUnit(eid++, 1, enemy.x, enemy.y, -1, archetype));
    });
  } else {
    S.rooms.forEach((r, ri) => {
    let count;
    const fl = S.floor || 1;
    if (fl === 1) {
      count = 4 + (ri > 0 ? 1 : 0);
    } else if (fl === 2) {
      count = 5;
    } else {
      count = 5 + Math.floor(Math.random() * Math.min(fl - 1, 3));
    }

    if (S.floor === 1 && ri === 0) {
      const bx = r.x + r.w - 2;
      const by = r.y + Math.max(1, Math.floor(r.h / 2));
      S.units.push(mkUnit(eid++, 1, bx, by, -1, ENEMY_TYPES.find(e => e.type === 'shaman')));
      // Stabby McSpear — ranged harpoon attacker, left side of room
      const sx = r.x + 2;
      const sy = r.y + Math.max(1, Math.floor(r.h / 2));
      if (!isWall(sx, sy)) S.units.push(mkUnit(eid++, 1, sx, sy, 1, ENEMY_TYPES.find(e => e.type === 'stabby')));
      return;
    } else if (S.floor === 2 && ri === 0) {
      // Force spawn an Ironbox (Fortress) in the second room alone
      const ix = r.x + Math.floor(r.w / 2);
      const iy = r.y + Math.floor(r.h / 2);
      S.units.push(mkUnit(eid++, 1, ix, iy, -1, getEditorEnemyArchetype('ironbox')));
      return;
    } else if (S.floor === 3 && ri === 0) {
      const bx = r.x + r.w - 2;
      const by = r.y + Math.max(1, Math.floor(r.h / 2));
      S.units.push(mkBoss01(eid++, bx, by));
      return;
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
      const _etype = pick();
      let _u;
      if (_etype.type === 'ironbox' && Math.random() < 0.5) {
        // 50% tanku pakeiciami lazerio priešu (NULL IDOL)
        _u = mkUnit(eid++, 1, ex, ey, -1, ENEMY_TYPES.find(e => e.type === 'idol'));
        _u.weapon = 'laser';
        _u.maxLaserAmmo = 2;
        _u.laserAmmo = 2;
        _u.dmgBonus = 1;
      } else {
        _u = mkUnit(eid++, 1, ex, ey, -1, _etype);
        if (_etype.type === 'shield') {
          const _dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
          _u.shieldDir = _dirs[Math.floor(Math.random() * _dirs.length)];
          _u.moveCooldown = 0;
        }
      }
      S.units.push(_u);
    }
    });
  }
  S.totalEnemies = S.units.filter(u => isHostileAdventureEnemy(u)).length;
  if (!useCustomEnemyPlacements && getFloorCustomMap()) {
    syncEditorEnemyPlacementsFromUnits();
  }

  // Chests scaling
  const targetChests = S.floor <= 2 ? 0 : Math.min(8, 2 + Math.floor(S.floor / 3));
  for (let c = 0; c < targetChests; c++) {
    const ri = Math.max(1, Math.floor(Math.random() * numRooms));
    const r = S.rooms[ri];
    S.chests.push({ x: r.x + 1 + Math.floor(Math.random() * (r.w - 2)), y: r.y + 1 + Math.floor(Math.random() * (r.h - 2)), opened: false });
  }

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

  // Apply temporary run card bonuses (picked between rooms)
  applyRunCardBuffs();
  S.hackAmmo = 2 + (S.floorBuffs.hackAmmoBonus || 0);
  S.hackAmmoMax = S.hackAmmo;

  // Start tutorial on first floor only
  if (S.floor === 1 && !Profile.tutorialDone) {
    setTimeout(() => startTutorial(), 700);
  }

  // Floor intro animation
  triggerFloorIntro(S.floor || 1);
}function getFloorCustomMap() {
  if (S.floor === 1 && window.CUSTOM_MAP) return window.CUSTOM_MAP;
  if (S.floor === 2 && window.CUSTOM_MAP2) return window.CUSTOM_MAP2;
  return null;
}
function generateDungeon() {
  const _cm = getFloorCustomMap();
  if (_cm) {
    S.dungeon = JSON.parse(JSON.stringify(_cm.dungeon || _cm));
    S.decorations = _cm.decorations ? JSON.parse(JSON.stringify(_cm.decorations)) : {};
    S.collisionBoxes = _cm.collisionBoxes ? new Set(_cm.collisionBoxes) : new Set();
    // Sync ROWS/COLS to actual map dimensions
    ROWS = S.dungeon.length;
    COLS = S.dungeon[0].length;
    ADV_MAP_ROWS = ROWS; ADV_MAP_COLS = COLS;
    // Provide mock room so hero spawn code doesn't crash
    S.rooms = [{ x: 1, y: 1, w: COLS - 2, h: ROWS - 2, type: 'start' }];
    // Place exit teleport
    if (_cm.exitPos) {
      S.teleports = [{ x: _cm.exitPos.x, y: _cm.exitPos.y }];
    }
    return;
  }
  
  S.dungeon = Array.from({ length: ROWS }, () => new Array(COLS).fill(1));
  S.decorations = {}; // Format: "r,c" -> string ID e.g. "deco_01"
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
    if (w > 13) w = 8 + Math.floor(Math.random() * 4); // nuo 8 iki 11
    if (h > 10) h = 6 + Math.floor(Math.random() * 4); // nuo 6 iki 9

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

  // ---- Room types ----------------------------------------------
  S.rooms[0].type = 'start';
  S.rooms[totalRooms - 1].type = 'boss';
  const typePool = ['shrine', 'armory', 'vault', 'normal', 'normal', 'normal', 'normal'];
  for (let i = 1; i < totalRooms - 1; i++) {
    S.rooms[i].type = typePool[Math.floor(Math.random() * typePool.length)];
    S.rooms[i].armoryUsed = false;
  }

  // Shrine objects - placed in quarter of shrine rooms
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

  // ---- Teleport pads - one per room, stepping on it asks to jump to next sector ----
  {
    const findFreeTile = (r) => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const tx = r.x + 1 + Math.floor(Math.random() * (r.w - 2));
        const ty = r.y + 1 + Math.floor(Math.random() * (r.h - 2));
        if (S.dungeon[ty] && S.dungeon[ty][tx] === 1) return { x: tx, y: ty };
      }
      return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
    };
    S.rooms.forEach((room) => {
      const pos = findFreeTile(room);
      S.teleports.push({ x: pos.x, y: pos.y });
    });
  }

  // ---- Pillars (tile 2) - placed after corridors so carveCorr cannot block them
  S.rooms.forEach((r, ri) => {
    if (ri === 0) return; // never in start room
    if (r.w < 5 || r.h < 4) return; // too small

    // Try to place a group of pillars; returns true if all cells were free and placed
    const placeGroup = (px, py, shape) => {
      const cells = shape === 'single' ? [[0, 0]]
        : shape === 'pairH' ? [[0, 0], [1, 0]]
          : shape === 'pairV' ? [[0, 0], [0, 1]]
            : [[0, 0], [1, 0], [0, 1], [1, 1]]; // quad 2x2
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
    const groupCount = 3 + Math.floor(Math.random() * 4); // 3-6 groups per room
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
    // Horizontal neighbors - pick a random y inside the overlap
    const yMin = Math.max(left.y, right.y);
    const yMax = Math.min(left.y + left.h - 1, right.y + right.h - 1);
    const dy = yMin + Math.floor(Math.random() * Math.max(1, yMax - yMin + 1));
    for (let cx = left.x + left.w; cx < right.x; cx++)
      if (cx >= 0 && cx < COLS && dy >= 0 && dy < ROWS) S.dungeon[dy][cx] = 3; // tile 3 = corridor
  } else {
    // Vertical neighbors - pick a random x inside the overlap
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
  updateExplorationTracker();
}

// ---- Chip Pixel Art --------------------------------------------
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
  common: [null, '#1c1c1c', '#383838', '#585858', '#888888', '#080808'],
  uncommon: [null, '#002211', '#004433', '#006644', '#00aa66', '#44ff88'],
  rare: [null, '#00001f', '#000055', '#0033aa', '#2266ee', '#66aaff'],
  epic: [null, '#110011', '#330044', '#6600aa', '#aa33dd', '#ee55ff'],
  legendary: [null, '#1a0800', '#442200', '#886600', '#ddaa00', '#ffcc22'],
  mythic: [null, '#0a0010', '#1a0033', '#4400aa', '#cc00ff', '#ffffff'],
};

// ---- Traditional vertical-scroll slot reel system --------------
const REEL_TAPE = ['common', 'uncommon', 'rare', 'empty', 'epic', 'common', 'legendary', 'uncommon', 'rare', 'gem', 'ronke'];
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
  if (rarity === 'ronke') {
    const s = CHIP_ART_SIZE;
    ctx.save();
    // Draw a coin face
    const cx2 = x + s / 2, cy2 = y + s / 2, cr = s * 0.42;
    if (glowing) { ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 18; }
    ctx.globalAlpha = glowing ? 1 : 0.88;
    ctx.fillStyle = glowing ? '#1a8fff' : '#0d5faa';
    ctx.beginPath(); ctx.arc(cx2, cy2, cr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = glowing ? '#88ddff' : '#3399cc';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx2, cy2, cr, 0, Math.PI * 2); ctx.stroke();
    // Draw ronke image clipped to coin
    if (ronkeImg.complete && ronkeImg.naturalWidth > 0) {
      const iw = cr * 1.5, ih = cr * 1.5;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx2, cy2, cr - 2, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(ronkeImg, cx2 - iw / 2, cy2 - ih / 2, iw, ih);
      ctx.restore();
    }
    if (glowing) {
      const pulse = 0.3 + 0.3 * Math.sin(performance.now() / 200);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#44aaff';
      ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(cx2, cy2, cr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
    return;
  }
  if (rarity === 'gem') {
    const s = CHIP_ART_SIZE;
    ctx.save();
    if (glowing) { ctx.shadowColor = '#44ff66'; ctx.shadowBlur = 18; }
    ctx.globalAlpha = glowing ? 1 : 0.88;
    ctx.drawImage(gemImg, x + (s - 72) / 2, y + (s - 62) / 2, 72, 62);
    if (glowing) {
      const pulse = 0.4 + 0.4 * Math.sin(performance.now() / 200);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#44ff66';
      ctx.shadowBlur = 24;
      ctx.drawImage(gemImg, x + (s - 72) / 2, y + (s - 62) / 2, 72, 62);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
    return;
  }
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
      const cx = chipOffX + CHIP_ART_SIZE / 2;
      const cy = chipY + CHIP_ART_SIZE / 2;
      ctx.translate(cx, cy);
      ctx.scale(cosA, 1);
      ctx.translate(-cx, -cy);
      if (cosA >= 0) drawChipFlat(ctx, chipOffX, chipY, rarity, true);
      else drawChipBack(ctx, chipOffX, chipY, rarity);
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
  // -> offset = (tapeSlot - 1) * CHIP_SLOT_H, tapeSlot = ri + k * tapeSize
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

// ---- Slot Machine ----------------------------------------------
let paytableBuilt = false;
function buildSlotPaytable() {
  const el = document.getElementById('slot-paytable');
  if (!el) return;
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const syms = { common: 'C', uncommon: 'U', rare: 'R', epic: 'E', legendary: 'L' };
  let h = '<div class="pt-title">PAYTABLE</div>';
  h += '<table class="pt-table"><tr><th></th>';
  for (const r of rarities)
    h += `<th style="color:${RARITY_COLOR[r]}">${syms[r]}</th>`;
  h += '</tr>';
  for (const n of [4, 3, 2]) {
    h += `<tr><td class="pt-count">${n}x</td>`;
    for (const r of rarities) {
      const p = COMBO_PRIZES[n]?.[r];
      h += `<td style="color:${p ? RARITY_COLOR[r] : '#1e1e2e'}">${p ? p.val : '-'}</td>`;
    }
    h += '</tr>';
  }
  h += '</table>';
  el.innerHTML = h;
}

function openChestSlot(ch) {
  if (typeof trackChestOpen === 'function') trackChestOpen();
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

  // Reset all reels - spinning fast
  reelState.forEach((st, i) => {
    st.offset = i * CHIP_SLOT_H * 1.7; // stagger start
    st.speed = 14; // px per frame at ~60fps
    st.stopping = false;
    st.locked = false;
    st.stopTime = -1;
  });
  slotAnimActive = true;
  requestAnimationFrame(runSlotAnims);

  // Mute BGM - only slot sounds during spin
  BGM.stop();

  // Ratchet click ticker - fires while any reel is spinning
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
          : `${prize.matchCount}x ${prize.rarity.toUpperCase()}`;
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
    // Empty/no-match - show raw rolls so player sees why they lost
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
  winSpin.angle = 0;
  winSpin.mask.clear();
  if (prize.matchCount && prize.rarity !== 'empty') {
    displayReels.forEach((r, i) => { if (r === prize.rarity) winSpin.mask.add(i); });
  }

  stopReel(0, displayReels[0], false, 900);
  stopReel(1, displayReels[1], false, 1600);
  stopReel(2, displayReels[2], false, 2350);
  stopReel(3, displayReels[3], true, 3100);
}

window.claimSlotPrize = function () {
  if (!S.pendingSlotPrize) return;
  const { prize, ch } = S.pendingSlotPrize;
  S.pendingSlotPrize = null;

  if (prize.rarity === 'empty') {
    spawnDmgNumber(ch.x, ch.y, 'EMPTY', '#555566', 20, 'miss');
    logEvent('Chest was empty.', 'info');
  } else if (prize.rarity === 'gem') {
    addToInventory('gem', null, prize.val);
    spawnHit(ch.x, ch.y, '#44ff66', 30);
    spawnDmgNumber(ch.x, ch.y, `+${prize.val} PIXEL!`, '#44ff66', 28, 'crit');
    S.shake = Math.max(S.shake, 20);
    logEvent(`+${prize.val} PIXEL — JACKPOT!`, 'loot');
  } else if (prize.rarity === 'ronke') {
    addToInventory('ronke', null, prize.val);
    spawnHit(ch.x, ch.y, '#44aaff', 30);
    spawnDmgNumber(ch.x, ch.y, `+${prize.val} POISON!`, '#44aaff', 28, 'crit');
    S.shake = Math.max(S.shake, 20);
    logEvent(`+${prize.val} POISON — JACKPOT!`, 'loot');
  } else {
    const gain = prize.val;
    addToInventory('chip', prize.rarity, gain);
    spawnHit(ch.x, ch.y, RARITY_COLOR[prize.rarity], 22);
    spawnDmgNumber(ch.x, ch.y, `+${gain} CHIP`, RARITY_COLOR[prize.rarity], 24, 'crit');
    S.shake = Math.max(S.shake, 8);
    logEvent(`+${gain} CHIP - ${prize.rarity.toUpperCase()}`, prize.rarity);
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
  setTimeout(() => playCurrentLevelBGM(), 600);
};

// Helper for dynamic music
function playCurrentLevelBGM() {
  BGM.stop();
  setTimeout(() => {
    if (gameMode === 'hub') BGM.start('hub');
    else BGM.start('game');
  }, 200);
}

// ---- Inventory -------------------------------------------------
const INV_SLOTS = 30;

// item: { type:'chip'|'fragment', rarity:'common'|...|null, qty:N }
if (!window._newInvKeys) window._newInvKeys = new Set();

function _markInventoryNew(type, rarity) {
  window._newInvKeys.add(type + ':' + (rarity || ''));
  const dot = document.getElementById('inv-new-dot');
  if (dot) dot.classList.add('visible');
}

function _clearInventoryNew() {
  window._newInvKeys.clear();
  const dot = document.getElementById('inv-new-dot');
  if (dot) dot.classList.remove('visible');
}

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
    _markInventoryNew(type, rarity);
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
  if (btnEl) btnEl.textContent = `${getRonkeUpgradeCount()} $ BAG`;
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
  byte: 'RONKE', fragment: 'CHIP FRAGMENT', xptoken: 'XP TOKEN', gem: 'PIXEL', ronke: 'POISON', goldbag: '$ BAG',
  chip_common: 'COMMON CHIP', chip_uncommon: 'UNCOMMON CHIP',
  chip_rare: 'RARE CHIP', chip_epic: 'EPIC CHIP', chip_legendary: 'LEGENDARY CHIP',
};
const INV_ITEM_ICONS = {
  byte: '&#9711;', fragment: '&#9830;', xptoken: '&#9733;', gem: '&#9670;', ronke: '&#9763;',
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
  if (el('inv-btn-chips')) el('inv-btn-chips').textContent = `${getRonkeUpgradeCount()} $ BAG`;

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
            : item.type === 'gem' ? '#44ff66'
              : item.type === 'ronke' ? '#44aaff'
                : item.type === 'goldbag' ? '#ffcc00'
                  : (RARITY_COLOR[item.rarity] || '#aaaaaa');
      const label = item.type === 'byte' ? 'RONKE'
        : item.type === 'fragment' ? 'FRAGMENT'
          : item.type === 'xptoken' ? 'XP TOKEN'
            : item.type === 'gem' ? 'PIXEL'
              : item.type === 'ronke' ? 'POISON'
                : item.type === 'goldbag' ? '$ BAG'
                  : item.rarity.toUpperCase() + ' CHIP';
      const name = item.type === 'byte' ? 'Ronke'
        : item.type === 'fragment' ? 'Chip Fragment'
          : item.type === 'xptoken' ? 'XP Token'
            : item.type === 'gem' ? 'Pixel'
              : item.type === 'ronke' ? 'Poison'
                : item.type === 'goldbag' ? '$ Bag'
                  : `${item.rarity} Chip`;

      const isNew = window._newInvKeys?.has(item.type + ':' + (item.rarity || ''));
      slot.className = 'inv-slot has-item' + (isNew ? ' inv-slot-new' : '');
      slot.style.setProperty('--slot-col', col + '44');
      slot.style.borderColor = col + '99';
      slot.style.boxShadow = isNew ? '' : `inset 0 0 16px ${col}22, 0 0 6px ${col}44`;

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
      } else if (item.type === 'ronke') {
        const ri = document.createElement('img');
        ri.src = 'ronke.png';
        ri.style.cssText = 'width:56px;height:56px;object-fit:contain;display:block;margin:auto;margin-top:8px;filter:drop-shadow(0 0 6px #44aaff)';
        slot.appendChild(ri);
      } else if (item.type === 'goldbag') {
        const gi = document.createElement('img');
        gi.src = 'assets/goldbag_g_idle.png';
        gi.style.cssText = 'position:absolute;top:50%;left:50%;width:120px;height:120px;transform:translate(calc(-50% - 10px),calc(-58% + 4px)) scale(0.88);image-rendering:pixelated;filter:drop-shadow(0 0 8px #ffcc00)';
        slot.appendChild(gi);
      } else if (item.type === 'gem') {
        const gi = document.createElement('img');
        gi.src = 'pix.png';
        gi.style.cssText = 'width:56px;height:56px;object-fit:contain;display:block;margin:auto;margin-top:8px;image-rendering:pixelated;filter:drop-shadow(0 0 6px #44ff66)';
        slot.appendChild(gi);
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

      // Rarity / type label - bottom left
      const rlabel = document.createElement('span');
      rlabel.className = 'inv-slot-label';
      rlabel.style.color = col;
      rlabel.textContent = label;
      slot.appendChild(rlabel);

      // Quantity - bottom right
      const qty = document.createElement('span');
      qty.className = 'inv-slot-qty';
      qty.textContent = item.qty;
      slot.appendChild(qty);

      // Hover info bar
      slot.addEventListener('mouseenter', () => {
        const info = el('inv-info-bar');
        if (info) {
          if (item.type === 'ronke') {
            info.innerHTML = `${name.toUpperCase()} x${item.qty} &nbsp;<span style="color:#aaa;font-size:7px;">(CLICK TO USE: +5⚡)</span>`;
          } else if (item.type === 'byte') {
            info.innerHTML = `${name.toUpperCase()} x${item.qty}`;
          } else if (item.type === 'gem') {
            info.innerHTML = `${name.toUpperCase()} x${item.qty} &nbsp;<span style="color:#aaa;font-size:7px;">(+15⚡ ON PICKUP)</span>`;
          } else {
            info.textContent = `${name.toUpperCase()} x${item.qty}`;
          }
          info.style.color = col;
        }
      });
      slot.addEventListener('mouseleave', () => {
        const info = el('inv-info-bar');
        if (info) { info.textContent = 'hover a slot'; info.style.color = ''; }
      });

      // Click interaction
      if (item.type === 'ronke') {
        slot.addEventListener('click', () => {
          if (typeof window.useRonkeForEnergy === 'function') window.useRonkeForEnergy();
        });
      }
    } else {
      slot.className = 'inv-slot empty';
    }

    grid.appendChild(slot);
  }
}

// ---- Inventory chip animation loop -----------------------------
let invAnimRaf = null;

// BGA contact pad positions on chip back (row, col) - all land on body pixels
const CHIP_BACK_PADS = [
  [3, 3], [3, 6], [3, 9],
  [6, 3], [6, 6], [6, 9],
  [9, 3], [9, 6], [9, 9],
];

function drawChipBack(ctx, x, y, rarity) {
  if (rarity === 'ronke') {
    const s = CHIP_ART_SIZE;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#001122';
    ctx.fillRect(x, y, s, s);
    const cx2 = x + s / 2, cy2 = y + s / 2, cr = s * 0.42;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#1a8fff';
    ctx.beginPath(); ctx.arc(cx2, cy2, cr, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.4;
    if (ronkeImg.complete && ronkeImg.naturalWidth > 0) {
      const iw = cr * 1.5, ih = cr * 1.5;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx2, cy2, cr - 2, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(ronkeImg, cx2 - iw / 2, cy2 - ih / 2, iw, ih);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }
  if (rarity === 'gem') {
    const s = CHIP_ART_SIZE;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#002211';
    ctx.fillRect(x, y, s, s);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(gemImg, x + (s - 72) / 2, y + (s - 62) / 2, 72, 62);
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }
  const pal = CHIP_PALETTES[rarity] || CHIP_PALETTES.common;
  const rows = CHIP_ART.length, cols = CHIP_ART[0].length;
  const px = CHIP_PX;

  // Body - same silhouette as front, but dark flat colors
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

  // 3x3 BGA contact pads - glowing dots in rarity glow color
  ctx.shadowColor = pal[5];
  ctx.shadowBlur = 7;
  ctx.fillStyle = pal[5];
  CHIP_BACK_PADS.forEach(([r, c]) => {
    ctx.fillRect(x + c * px + 2, y + r * px + 2, px - 4, px - 4);
  });
  ctx.shadowBlur = 0;
}

// ---- Fragment Shape (shared between loot draw + inventory canvas) --
// True 3D cube with orthographic projection + Y rotation + fixed X tilt
// r = half-size, t = Y-rotation angle, pulse = glow 0..1
function drawCubeFragment(ctx, r, t, pulse) {
  const cY = Math.cos(t), sY = Math.sin(t);
  const ax = 0.52; // fixed downward tilt so top face is always visible
  const cX = Math.cos(ax), sX = Math.sin(ax);

  // Project 3D point -> 2D (orthographic, Y then X rotation)
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
    { idx: [3, 2, 6, 7], col: [204, 85, 0] },  // front (z=+r) - mid orange
    { idx: [1, 0, 4, 5], col: [68, 17, 0] },  // back (z=-r) - very dark
    { idx: [2, 1, 5, 6], col: [170, 55, 0] },  // right (x=+r) - darker
    { idx: [0, 3, 7, 4], col: [85, 28, 0] },  // left (x=-r) - darkest side
    { idx: [0, 1, 2, 3], col: [255, 150, 0] },  // top (y=-r) - brightest
    { idx: [7, 6, 5, 4], col: [30, 8, 0] },  // bottom (y=+r) - nearly black
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

// ---- XP Token Pixel Art ----------------------------------------
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

  cctx.fillStyle = bright ? '#ffcc00' : '#996600';
  cctx.beginPath();
  cctx.ellipse(0, 0, xR, r, 0, 0, Math.PI * 2);
  cctx.fill();

  if (spinX > 0.3) {
    cctx.fillStyle = 'rgba(255,255,180,0.5)';
    cctx.beginPath();
    cctx.ellipse(-xR * 0.28, -r * 0.28, xR * 0.3, r * 0.42, 0, 0, Math.PI * 2);
    cctx.fill();
  }

  cctx.strokeStyle = bright ? '#ffee00' : '#774400';
  cctx.lineWidth = 2;
  cctx.beginPath();
  cctx.ellipse(0, 0, xR, r, 0, 0, Math.PI * 2);
  cctx.stroke();

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
    _clearInventoryNew();
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
function setTeleportConfirmVisible(visible) {
  const ov = document.getElementById('teleport-confirm-overlay');
  if (ov) ov.classList.toggle('active', !!visible);
}

function setTeleportConfirmContent(kicker, title, text, yesLabel, noLabel) {
  const kickerEl = document.getElementById('teleport-confirm-kicker');
  const titleEl = document.getElementById('teleport-confirm-title');
  const textEl = document.getElementById('teleport-confirm-text');
  const yesEl = document.getElementById('teleport-confirm-yes');
  const noEl = document.getElementById('teleport-confirm-no');
  if (kickerEl) kickerEl.textContent = kicker;
  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;
  if (yesEl) yesEl.textContent = yesLabel;
  if (noEl) noEl.textContent = noLabel;
}

window.cancelTeleportUse = function () {
  S.pendingTeleportSector = false;
  setTeleportConfirmVisible(false);
};

window.confirmTeleportUse = function () {
  if (!S.pendingTeleportSector) return;
  S.pendingTeleportSector = false;
  S.teleportCooldown = 30;
  S.teleportUses = (S.teleportUses || 0) + 1;
  setTeleportConfirmVisible(false);
  SFX.teleport();
  Profile.cache += (S.bytes || 0);
  if (S.floor > Profile.highestSector) Profile.highestSector = S.floor;
  Profile.inventory = (S.inventory || []).map(x => x ? { ...x } : null);
  saveProfile();
  checkAchievements();
  setTimeout(() => {
    showCardPicker(() => {
      S.floor++;
      initAdventure();
      playCurrentLevelBGM();
      updateHUD();
      updateEnergyHud();
    });
  }, 600);
};

function openTeleportSectorConfirm() {
  setTeleportConfirmContent('PHASE GATE', 'JUMP TO NEXT SECTOR?', 'Step through the portal to enter the next chamber. Your bytes will be saved.', 'JUMP', 'STAY');
  S.pendingTeleportSector = true;
  setTeleportConfirmVisible(true);
}

function checkExplorationComplete() {
  if (!S.fog || S.explorerChestSpawned || gameMode !== 'adventure') return;
  let total = 0, revealed = 0;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (S.dungeon[y][x] > 0) { total++; if (S.fog[y][x]) revealed++; }
  if (total > 0 && revealed >= total) spawnExplorerChest();
}

function updateExplorationTracker() {
  if (gameMode !== 'adventure' || !S.fog || !S.dungeon) return;
  let total = 0, revealed = 0;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (S.dungeon[y][x] > 0) { total++; if (S.fog[y][x]) revealed++; }
  const pct = total > 0 ? Math.floor((revealed / total) * 100) : 0;
  const done = pct >= 100;

  const elPct = document.getElementById('msw-pct');
  const elPctSign = document.querySelector('.msw-pct-sign');
  const elFill = document.getElementById('msw-bar-fill');
  const elRevealed = document.getElementById('msw-revealed');
  const elTotal = document.getElementById('msw-total');
  const elBadge = document.getElementById('msw-badge');

  if (elPct) { elPct.textContent = pct; elPct.classList.toggle('complete', done); }
  if (elPctSign) { elPctSign.classList.toggle('complete', done); }
  if (elFill) { elFill.style.width = pct + '%'; elFill.classList.toggle('complete', done); }
  if (elRevealed) { elRevealed.textContent = revealed; }
  if (elTotal) { elTotal.textContent = total; }
  if (elBadge) {
    if (done) { elBadge.textContent = 'COMPLETE'; elBadge.classList.add('complete'); }
    else if (pct >= 75) { elBadge.textContent = 'ALMOST'; elBadge.classList.remove('complete'); }
    else if (pct >= 50) { elBadge.textContent = 'DECRYPTING'; elBadge.classList.remove('complete'); }
    else if (pct >= 25) { elBadge.textContent = 'MAPPING'; elBadge.classList.remove('complete'); }
    else { elBadge.textContent = 'SCANNING'; elBadge.classList.remove('complete'); }
  }
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
      && !(S.chests || []).some(c => c.x === cx && c.y === cy)) {
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
  logEvent('SECTOR FULLY MAPPED - EXPLORER CACHE UNLOCKED', 'loot');
}

// Returns true if cell (x,y) is within current player vision radius or bullet illumination
// ---- Visibility cache (rebuilt once per render frame) --------
let _visCache = null; // flat Uint8Array [ROWS * COLS]

function rebuildVisCache() {
  if (gameMode !== 'adventure' || !S.units) return;
  const hero = S._hero || S.units.find(u => u.team === 0 && u.alive);
  // Skip rebuild during frozen phase when hero hasn't moved and no active bullets/ghosts
  const _noActiveBullets = !S.bullets || !S.bullets.some(b => b.active);
  const _noGhosts = !S.lightGhosts || S.lightGhosts.length === 0;
  const _heroKey = hero ? hero.x + ',' + hero.y : '';
  if (S.phase === 'frozen' && _noActiveBullets && _noGhosts &&
      _visCache && rebuildVisCache._lastKey === _heroKey) return;
  rebuildVisCache._lastKey = _heroKey;
  const size = ROWS * COLS;
  if (!_visCache || _visCache.length !== size) _visCache = new Uint8Array(size);
  else _visCache.fill(0);

  const now = performance.now();
  const R2 = FOG_RADIUS * FOG_RADIUS;

  // Hero vision radius
  if (hero) {
    const hx = hero.x, hy = hero.y;
    const rMin = Math.max(0, hy - FOG_RADIUS), rMax = Math.min(ROWS - 1, hy + FOG_RADIUS);
    const cMin = Math.max(0, hx - FOG_RADIUS), cMax = Math.min(COLS - 1, hx + FOG_RADIUS);
    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const dx = c - hx, dy = r - hy;
        if (dx * dx + dy * dy <= R2) _visCache[r * COLS + c] = 1;
      }
    }
  }

  // Flare revealed cells
  if (S.flareRevealedCells) {
    S.flareRevealedCells.forEach(key => {
      const comma = key.indexOf(',');
      const cx = +key.slice(0, comma), cy = +key.slice(comma + 1);
      if (cy >= 0 && cy < ROWS && cx >= 0 && cx < COLS) _visCache[cy * COLS + cx] = 1;
    });
  }

  // Active bullets illumination radius 1.5
  if (S.bullets) {
    for (const b of S.bullets) {
      if (!b.active && b.deadTicks === undefined) continue;
      const bx = b.rx, by = b.ry;
      const rMin = Math.max(0, Math.floor(by - 1.5)), rMax = Math.min(ROWS - 1, Math.ceil(by + 1.5));
      const cMin = Math.max(0, Math.floor(bx - 1.5)), cMax = Math.min(COLS - 1, Math.ceil(bx + 1.5));
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const dx = c - bx, dy = r - by;
          if (dx * dx + dy * dy <= 2.25) _visCache[r * COLS + c] = 1;
        }
      }
    }
  }

  // Light ghosts illumination
  if (S.lightGhosts) {
    for (const g of S.lightGhosts) {
      const maxR = g.r || 2.5;
      const isHold = g.holdMs !== undefined ? (now - g.bornTime < g.holdMs) : (S.tick - g.bornTick < 3);
      let reach;
      if (isHold) { reach = maxR; }
      else if (g.fadeBorn) { const ft = Math.min(1, (now - g.fadeBorn) / g.fadeDur); reach = maxR * (1 - ft * 0.55); }
      else continue;
      const r2 = reach * reach;
      const rMin = Math.max(0, Math.floor(g.y - reach)), rMax = Math.min(ROWS - 1, Math.ceil(g.y + reach));
      const cMin = Math.max(0, Math.floor(g.x - reach)), cMax = Math.min(COLS - 1, Math.ceil(g.x + reach));
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const dx = c - g.x, dy = r - g.y;
          if (dx * dx + dy * dy <= r2) _visCache[r * COLS + c] = 1;
        }
      }
    }
  }
}

function isVisible(x, y) {
  if (gameMode !== 'adventure') return true;
  if (_visCache && x >= 0 && x < COLS && y >= 0 && y < ROWS) return _visCache[y * COLS + x] === 1;
  // Fallback before first cache build
  const hero = S.units?.find(u => u.team === 0 && u.alive);
  return hero ? Math.hypot(x - hero.x, y - hero.y) <= FOG_RADIUS : false;
}

function invalidateDungeonCache() { _dunDirty = true; }

function drawDungeon() {
  const W = COLS * CELL, H = ROWS * CELL;

  // Init or resize offscreen canvas
  if (!_dunCanvas || _dunCanvas.width !== W || _dunCanvas.height !== H) {
    _dunCanvas = document.createElement('canvas');
    _dunCanvas.width = W; _dunCanvas.height = H;
    _dunCtx = _dunCanvas.getContext('2d');
    _dunDirty = true;
  }

  // Redraw offscreen every 4 frames (animations are slow — imperceptible at 15fps)
  _dunFrame = (_dunFrame + 1) % 4;
  if (_dunFrame === 0 || _dunDirty) {
    _dunDirty = false;
    const _mainCtx = ctx;
    ctx = _dunCtx;
    _dunCtx.clearRect(0, 0, W, H);
    _drawDungeonStatic();
    ctx = _mainCtx;
  }

  // Blit cached dungeon
  ctx.drawImage(_dunCanvas, 0, 0);

  // Platforms always drawn fresh (they animate and move)
  if (S.platforms) {
    S.platforms.forEach(p => {
      const px = p.rx * CELL, py = p.ry * CELL;
      const pulse = (Math.sin(performance.now() * 0.01) + 1) * 0.5;
      ctx.shadowBlur = 15 + pulse * 10; ctx.shadowColor = '#00f5ff';
      ctx.fillStyle = '#00f5ff'; ctx.globalAlpha = 0.6 + pulse * 0.3;
      ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.8;
      ctx.fillRect(px + CELL * 0.3, py + CELL * 0.3, CELL * 0.4, CELL * 0.4);
      ctx.globalAlpha = 1.0; ctx.shadowBlur = 0;
    });
  }
}

function drawForegroundDecorations() {
  if (!S.decorations) return;

  const decKeys = Object.keys(S.decorations);
  decKeys.sort((a, b) => parseInt(a.split(',')[0], 10) - parseInt(b.split(',')[0], 10));

  for (const key of decKeys) {
    const [strR, strC] = key.split(',');
    const r = parseInt(strR, 10);
    const c = parseInt(strC, 10);
    const decId = S.decorations[key];
    if (!decId.startsWith('bush')) continue;

    const sheetIdx = parseInt(decId.replace('bush', ''), 10);
    const bImg = bushImgs[sheetIdx];
    if (!bImg || !bImg.complete || bImg.naturalWidth <= 0) continue;

    const px = c * CELL;
    const py = r * CELL;
    const BUSH_FRAMES = 8;
    const stagger = (r * 3 + c * 7) % BUSH_FRAMES;
    const frame = (Math.floor(performance.now() / 170) + stagger) % BUSH_FRAMES;
    const drawW = CELL * 2;
    const drawH = CELL * 2;
    const drawX = px + CELL * 0.5 - drawW * 0.5;
    const drawY = py + CELL - drawH - 10;
    ctx.drawImage(bImg, frame * 128, 0, 128, 128, drawX, drawY, drawW, drawH);
  }
}

function _drawDungeonStatic() {
  const wallT = performance.now() * 0.001;
  // PASS 0: WATER
  // PASS 0: WATER
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ([0, 4, 5].includes(S.dungeon[r][c])) {
        const px = c * CELL, py = r * CELL;
        if (tinyImgs.water.complete && tinyImgs.water.naturalWidth > 0) {
          ctx.drawImage(tinyImgs.water, px, py, CELL, CELL);
        } else { ctx.fillStyle = '#4ab5c0'; ctx.fillRect(px, py, CELL, CELL); }
      }
    }
  }

  // PASS 1: WATER FOAM (192x192 overlays)
  if (tinyImgs.foam.complete && tinyImgs.foam.naturalWidth > 0) {
    const totalFoamFrames = 8;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        // Foam is ONLY generated for type 0 (auto-foam) and type 5 (force-foam)
        if (S.dungeon[r][c] === 0 || S.dungeon[r][c] === 5) {
          const isL = (tr, tc) => (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS && (S.dungeon[tr][tc] === 1 || S.dungeon[tr][tc] === 2 || S.dungeon[tr][tc] === 3));
          const isTouchingLand = (S.dungeon[r][c] === 5) ? true : (isL(r-1,c) || isL(r+1,c) || isL(r,c-1) || isL(r,c+1) || isL(r-1,c-1) || isL(r-1,c+1) || isL(r+1,c-1) || isL(r+1,c+1));
          
          if (isTouchingLand) {
            const px = c * CELL, py = r * CELL;
            const stagger = (r * 3 + c * 7) % totalFoamFrames;
            const foamFrame = (Math.floor(performance.now() / 150) + stagger) % totalFoamFrames;
            const fw = Math.round(CELL * 3);
            ctx.drawImage(tinyImgs.foam, foamFrame * 192, 0, 192, 192, px - CELL, py - CELL, fw, fw);
          }
        }
      }
    }
  }

  // PASS 1b: FOAM 2.0 (type 7) — 16 frames, same 192x192 format
  if (waterFoam2Img.complete && waterFoam2Img.naturalWidth > 0) {
    const totalFoam2Frames = 16;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (S.dungeon[r][c] === 7) {
          const px = c * CELL, py = r * CELL;
          const stagger = (r * 3 + c * 7) % totalFoam2Frames;
          const frame = (Math.floor(performance.now() / 150) + stagger) % totalFoam2Frames;
          const fw = Math.round(CELL * 3);
          ctx.drawImage(waterFoam2Img, frame * 192, 0, 192, 192, px - CELL, py - CELL, fw, fw);
        }
      }
    }
  }

  // PASS 2: DROPS / STONE BASES
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const px = c * CELL, py = r * CELL;
      const elevAbove = r > 0 && S.dungeon[r-1][c] === 2;
      const floorAbove = r > 0 && (S.dungeon[r-1][c] === 1 || S.dungeon[r-1][c] === 3);
      if (floorAbove && [0, 4, 5].includes(S.dungeon[r][c])) {
        if (grassTilemapImg.complete && grassTilemapImg.naturalWidth > 0) {
          const wSeed = Math.abs((r * 97 + c * 211) % 4);
          ctx.drawImage(grassTilemapImg, (5 + wSeed % 2) * 64, (4 + Math.floor(wSeed / 2)) * 64, 64, 64, px, py, CELL, CELL);
        }
      }
      if (elevAbove && S.dungeon[r][c] !== 2 && elevationImg.complete && elevationImg.naturalWidth > 0) {
        const cliffY = ([0, 4, 5].includes(S.dungeon[r][c])) ? 256 : 192;
        const isW = c > 0 && S.dungeon[r-1][c-1] !== 2;
        const isE = c < COLS - 1 && S.dungeon[r-1][c+1] !== 2;
        let cliffX = 64; 
        if (isW && !isE) cliffX = 0; else if (isE && !isW) cliffX = 128; else if (isW && isE) cliffX = 192;
        ctx.drawImage(elevationImg, cliffX, cliffY, 64, 64, px, py, CELL, CELL);
      }
    }
  }

  // PASS 3: TOP SURFACES (Grass / Elevation base / Shadow)
  // type 6 = shadow cell: renders as grass, then draws shadow overlay on top (like foam pattern)
  const _normT = (tt) => tt === 6 ? 1 : tt; // shadow treated as grass for tile borders
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const px = c * CELL, py = r * CELL;
      const t = S.dungeon[r][c];
      const nt = _normT(t);

      if (nt === 1 || nt === 3 || nt === 2) {
        const wN = r === 0          || _normT(S.dungeon[r-1][c]) !== nt;
        const wS = r === ROWS - 1   || _normT(S.dungeon[r+1][c]) !== nt;
        const wW = c === 0          || _normT(S.dungeon[r][c-1]) !== nt;
        const wE = c === COLS - 1   || _normT(S.dungeon[r][c+1]) !== nt;
        const bitmask = (wN?1:0) | (wS?2:0) | (wW?4:0) | (wE?8:0);
        const GTILE = [[64,64],[64,0],[64,128],[64,0],[0,64],[0,0],[0,128],[0,0],[192,64],[128,0],[192,128],[128,0],[192,64],[128,0],[192,128],[64,64]];
        const [tileX, tileY] = GTILE[bitmask];
        const finalX = (bitmask === 0) ? (1 + (r*123+c*456)%3)*64 : tileX;

        let img = grassTilemapImg;
        if (nt === 2) img = elevationImg;

        if (img.complete && img.naturalWidth > 0) {
          ctx.globalAlpha = (nt === 3) ? 0.75 : 1.0;
          let fy = tileY;
          if (nt === 3) fy = (2 + ((r * 317 + c * 211) % 3)) * 64;
          ctx.drawImage(img, finalX, fy, 64, 64, px, py, CELL, CELL);
          ctx.globalAlpha = 1.0;
        } else { ctx.fillStyle = (nt===2) ? '#5a7a4a' : '#3a7a2a'; ctx.fillRect(px, py, CELL, CELL); }

        if (r > 0 && S.dungeon[r-1][c] === 2 && nt !== 2) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px, py, CELL, CELL);
        }

        // Shadow overlay — drawn right after the grass tile, same pass as terrain
        if (t === 6 && shadowImg.complete && shadowImg.naturalWidth > 0) {
          ctx.drawImage(shadowImg, 0, 0, 192, 192, px - CELL, py - CELL, CELL * 3, CELL * 3);
        }
      }
    }
  }

  // Pass 3b: Decorations (from S.decorations map string keys)
  if (S.decorations) {
    // Sort keys by Y to achieve proper 'z-indexing' (things lower on screen draw on top)
    const decKeys = Object.keys(S.decorations);
    decKeys.sort((a,b) => parseInt(a.split(',')[0]) - parseInt(b.split(',')[0]));

    for (const key of decKeys) {
      const [strR, strC] = key.split(',');
      const r = parseInt(strR), c = parseInt(strC);
      const decId = S.decorations[key];
      const px = c * CELL, py = r * CELL;

      if (decId.startsWith('elev_')) {
        const parts = decId.split('_');
        const tx = parseInt(parts[1], 10);
        const ty = parseInt(parts[2], 10);
        if (elevationImg.complete && elevationImg.naturalWidth > 0) {
           ctx.drawImage(elevationImg, tx * 64, ty * 64, 64, 64, px, py, CELL, CELL);
        }
      } else if (decId.startsWith('flat_')) {
        const parts = decId.split('_');
        const tx = parseInt(parts[1], 10);
        const ty = parseInt(parts[2], 10);
        if (flatImg.complete && flatImg.naturalWidth > 0) {
           ctx.drawImage(flatImg, tx * 64, ty * 64, 64, 64, px, py, CELL, CELL);
        }
      } else if (decId.startsWith('tileset1_') || decId.startsWith('tileset3_')) {
        const parts = decId.split('_');
        const tx = parseInt(parts[1], 10);
        const ty = parseInt(parts[2], 10);
        const tsImg = decId.startsWith('tileset3_') ? tileset3Img : tilesetImg;
        if (tsImg.complete && tsImg.naturalWidth > 0) {
           ctx.drawImage(tsImg, tx * 64, ty * 64, 64, 64, px, py, CELL, CELL);
        }
      } else if (decId.startsWith('bridge_')) {
        const parts = decId.split('_');
        const tx = parseInt(parts[1], 10);
        const ty = parseInt(parts[2], 10);
        if (bridgeImg.complete && bridgeImg.naturalWidth > 0) {
          ctx.drawImage(bridgeImg, tx * 64, ty * 64, 64, 64, px, py, CELL, CELL);
        }
      } else if (decId.startsWith('deco_')) {
        const no = decId.replace('deco_', '');
        const img = tinyImgs.deco[no];
        if (img && img.complete && img.naturalWidth > 0) {
            // Draw deco at bottom center of the cell
            const w = img.naturalWidth * (CELL/64); // Assume base 64x64 grid roughly scaled to CELL
            const h = img.naturalHeight * (CELL/64);
            ctx.drawImage(img, px + CELL/2 - w/2, py + CELL - h, w, h);
        }
      } else if (decId === 'tree_1') {
        if (tinyImgs.tree.complete && tinyImgs.tree.naturalWidth > 0) {
            // spritesheet: 192x192 cells. Frame 0,0 is full tree
            ctx.drawImage(tinyImgs.tree, 0, 0, 192, 192, px - CELL, py - CELL*2 + 10, CELL*3, CELL*3);
        }
      } else if (decId === 'mine_1') {
        if (tinyImgs.mine.complete && tinyImgs.mine.naturalWidth > 0) {
            // spritesheet: 192x128
            ctx.drawImage(tinyImgs.mine, 0, 0, 192, 128, px - CELL, py - CELL, CELL*3, CELL*2);
        }
      } else if (decId.startsWith('rock')) {
        const sheetIdx = parseInt(decId.replace('rock', ''), 10);
        const rImg = rockImgs[sheetIdx];
        if (rImg && rImg.complete && rImg.naturalWidth > 0) {
          const ROCK_FRAMES = 8;
          const stagger = (r * 5 + c * 11) % ROCK_FRAMES;
          const frame = (Math.floor(performance.now() / 150) + stagger) % ROCK_FRAMES;
          ctx.drawImage(rImg, frame * 128, 0, 128, 128, px - CELL / 2, py - CELL / 2, CELL * 2, CELL * 2);
        }
      } else if (decId === 'duck') {
        if (duckImg.complete && duckImg.naturalWidth > 0) {
          const DUCK_FRAMES = 3;
          const stagger = (r * 7 + c * 13) % DUCK_FRAMES;
          const frame = (Math.floor(performance.now() / 300) + stagger) % DUCK_FRAMES;
          // 32x32 source frame, draw slightly larger centered on cell
          const dw = Math.round(CELL * 0.7), dh = Math.round(CELL * 0.7);
          ctx.drawImage(duckImg, frame * 32, 0, 32, 32, px + CELL / 2 - dw / 2, py + CELL - dh, dw, dh);
        }
      }
    }
  }

  // Pass LAST: Collision boxes — overlay on top of everything, only visible in edit mode
  if (window.isEditMode && S.collisionBoxes && S.collisionBoxes.size > 0) {
    ctx.fillStyle = 'rgba(255, 80, 80, 0.18)';
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.6)';
    ctx.lineWidth = 1;
    for (const key of S.collisionBoxes) {
      const [strR, strC] = key.split(',');
      const bpx = parseInt(strC) * CELL, bpy = parseInt(strR) * CELL;
      ctx.fillRect(bpx, bpy, CELL, CELL);
      ctx.strokeRect(bpx + 0.5, bpy + 0.5, CELL - 1, CELL - 1);
    }
  }

  // Pass LAST+: Small NPC markers for map editing so placed enemies are easy to spot
  if (window.isEditMode && Array.isArray(S.customEnemyPlacements) && S.customEnemyPlacements.length > 0) {
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    for (const enemy of S.customEnemyPlacements) {
      if (!enemy) continue;
      const cx = enemy.x * CELL + CELL * 0.5;
      const cy = enemy.y * CELL + CELL * 0.5;
      const radius = Math.max(3, Math.round(CELL * 0.12));
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

}

// ---- Wall FX functions (removed — no longer used) -----------------------------------------
function buildWallPackets() {}
function updateWallFX(dt) {}
function drawWallLED() {}

const _fogAlphaStr = Array.from({ length: 101 }, (_, i) => `rgba(0,0,0,${(i / 100).toFixed(2)})`);
function drawFog() {
  if (gameMode !== 'adventure' || !S.fog) return;
  if (S.fullMapRevealed) return;
  if (window.isEditMode) return;
  const hero = S._hero || S.units.find(u => u.team === 0 && u.alive);
  // Reuse S.bullets directly (no filter allocation) — check b.active inline
  const liveBullets = S.bullets || [];
  const now = performance.now();
  const REVEAL_DUR = 600;
  // Clean up expired light ghosts
  if (S.lightGhosts) {
    for (let _gi = S.lightGhosts.length - 1; _gi >= 0; _gi--) {
      const _g = S.lightGhosts[_gi];
      const isHold = _g.holdMs !== undefined ? (now - _g.bornTime < _g.holdMs) : (S.tick - _g.bornTick < 3);
      if (isHold) continue;
      if (!_g.fadeBorn) _g.fadeBorn = now;
      if (now - _g.fadeBorn >= _g.fadeDur) { S.lightGhosts[_gi] = S.lightGhosts[S.lightGhosts.length - 1]; S.lightGhosts.pop(); }
    }
  }
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
      const vis = _visCache ? _visCache[r * COLS + c] === 1 : (hero && Math.hypot(c - hero.x, r - hero.y) <= FOG_RADIUS);

      // Nearest light source (active bullet or lingering ghost) with clear LoS
      let bDist = Infinity;
      for (const b of liveBullets) {
        if (!b.active) continue;
        const d = Math.hypot(c - b.rx, r - b.ry);
        if (d < bDist && d <= 2.5 && !isShadowed(b.rx, b.ry, c, r)) bDist = d;
      }
      for (const g of liveGhosts) {
        if (g.noVisual) continue; // fog reveal only, no visual glow
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
        // no overlay — keep original tile color
      } else if (S.fog[r][c]) {
        // Previously revealed - stays permanently visible, no overlay
      } else {
        const alpha = bulletGlow ? Math.min(1, (bDist - 1.0) / 1.5) : 1.0;
        ctx.fillStyle = _fogAlphaStr[Math.round(alpha * 100)];
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }
  }

  // ---- Room reveal animation: newly uncovered cells fade from black --
  if (S.fogReveal) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const rt = S.fogReveal[r][c];
        if (!rt) continue;
        const elapsed = now - rt;
        if (elapsed >= REVEAL_DUR) continue;
        const t = elapsed / REVEAL_DUR;
        const alpha = Math.pow(1 - t, 1.6);
        ctx.fillStyle = _fogAlphaStr[Math.round(alpha * 100)];
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }
  }

  // ---- Bullet warm light halo ----------------------------------
  liveBullets.forEach(b => {
    if (!b.active) return;
    const px = (b.rx + 0.5) * CELL, py = (b.ry + 0.5) * CELL;
    const _gkey = Math.round(px) + ',' + Math.round(py);
    if (!b._haloGrad || b._haloKey !== _gkey) {
      b._haloKey = _gkey;
      const _g = ctx.createRadialGradient(px, py, 0, px, py, CELL * 1.4);
      _g.addColorStop(0, 'rgba(255,230,120,0.07)');
      _g.addColorStop(0.5, 'rgba(255,200,80,0.03)');
      _g.addColorStop(1, 'rgba(0,0,0,0)');
      b._haloGrad = _g;
    }
    ctx.fillStyle = b._haloGrad;
    ctx.beginPath();
    ctx.arc(px, py, CELL * 1.4, 0, Math.PI * 2);
    ctx.fill();
  });

  // ---- Lingering ghost halos -----------------------------------
  liveGhosts.forEach(g => {
    if (g.noVisual) return; // fog reveal only, skip visual halo
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

// ---- Footstep trail (world space, drawn before fog) ----------
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

// ---- Adventure HUD - Chip + Fragment counter (screen space) ----
function drawAdvHUD() {
  const bytes = getRonkeUpgradeCount();
  const frags = S.fragments || 0;
  const fragsInProgress = frags % FRAG_PER_CHIP;
  const assembled = Math.floor(frags / FRAG_PER_CHIP);
  const fragPct = fragsInProgress / FRAG_PER_CHIP;

  ctx.save();
  const x = 12, y = 16;
  const barW = 80, barH = 6;
  const now = performance.now();

  // ---- CHIP count ----
  ctx.font = 'bold 12px monospace';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#ffee00';
  ctx.fillStyle = '#ffee00';
  ctx.fillText(`$ BAG ${bytes}`, x + 14, y);
  // ronke sprite icon
  if (ronkeImg && ronkeImg.complete && ronkeImg.naturalWidth > 0) {
    ctx.drawImage(ronkeImg, x - 2, y - 11, 13, 13);
  } else {
    ctx.fillStyle = '#ffcc00'; ctx.fillRect(x, y - 10, 10, 10);
  }

  // ---- FRAGMENT bar ----
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
  if (!drawAdvHUD._grad) {
    const _g = ctx.createLinearGradient(x, 0, x + barW, 0);
    _g.addColorStop(0, '#cc5500'); _g.addColorStop(1, '#ff9900');
    drawAdvHUD._grad = _g;
  }
  ctx.fillStyle = drawAdvHUD._grad;
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

// ---- Weapon HUD - current weapon + ammo (screen space, bottom left) --
function drawWeaponHUD() {
  const hero = S._hero || S.units?.find(u => u.team === 0 && u.alive);
  if (!hero) return;
  const wep = getCurrentWeapon(hero);
  const pad = 14;
  const by = ADV_CANVAS_H - pad - 26;

  const ICONS = { bullet: 'PISTOL', laser: 'LASER', heavy: 'HEAVY', shotgun: 'SHOTGUN', ronke: 'POISON' };
  const COLORS = { bullet: '#aaccff', laser: '#88ffff', heavy: '#ffaa44', shotgun: '#ffdd88', ronke: '#44aaff' };
  const GLOWS = { bullet: '#4488ff', laser: '#00ffff', heavy: '#ff8800', shotgun: '#ffcc00', ronke: '#1a8fff' };

  let ammoStr = '';
  if (wep === 'laser') ammoStr = `  ${hero.laserAmmo}/${MAX_LASER}`;
  else if (wep === 'heavy') ammoStr = `  ${hero.heavyAmmo}/${MAX_HEAVY}`;
  else if (wep === 'shotgun') ammoStr = `  ${hero.shotgunAmmo}/${MAX_SHOTGUN}`;
  else if (wep === 'bullet') ammoStr = `  ${hero.ammo}/${hero.maxAmmo}`;
  else if (wep === 'ronke') ammoStr = `  ${S.inventory?.find(s => s && s.type === 'ronke')?.qty || 0}`;

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

// ---- Scanlines / CRT overlay (screen space, drawn last) --------
let _scanCanvas = null, _scanCacheKey = '';
function _buildScanCache() {
  const w = advCanvasW || BOARD_W;
  const scanH = gameMode === 'adventure' ? ADV_CANVAS_H : BOARD_H;
  const key = `${w},${scanH}`;
  if (_scanCanvas && _scanCacheKey === key) return;
  _scanCacheKey = key;
  const oc = document.createElement('canvas');
  oc.width = w; oc.height = scanH;
  const octx = oc.getContext('2d');
  octx.globalAlpha = 0.055;
  octx.fillStyle = '#000000';
  for (let y = 0; y < scanH; y += 3) octx.fillRect(0, y, w, 1);
  _scanCanvas = oc;
}
function drawScanlines() {
  _buildScanCache();
  ctx.drawImage(_scanCanvas, 0, 0);
}

function drawShrines() {
  if (!S.shrines) return;
  S.shrines.forEach(sh => {
    if (!isVisible(sh.x, sh.y) && !S.fog?.[sh.y]?.[sh.x] && !S.fullMapRevealed) return;
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
      // used - dark cracked altar
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#111128';
      ctx.fillRect(cx - CELL * 0.25, cy - CELL * 0.25, CELL * 0.5, CELL * 0.5);
    }
    ctx.restore();
  });
}

function mkBloodStain(x, y) {
  const drops = [];
  // Central pool - large, dark
  drops.push({
    dx: (Math.random() - 0.5) * 0.08, dy: (Math.random() - 0.5) * 0.08,
    rx: 0.13 + Math.random() * 0.09, ry: 0.09 + Math.random() * 0.07,
    rot: Math.random() * Math.PI, a: 0.82, ci: 1
  });
  // Satellite drops - smaller, scattered
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
    if (gameMode === 'adventure' && !isVisible(ch.x, ch.y) && !S.fog?.[ch.y]?.[ch.x] && !S.fullMapRevealed) return;
    const cx = (ch.x + 0.5) * CELL, cy = (ch.y + 0.5) * CELL;
    const w = CELL * 0.54, h = CELL * 0.4;
    ctx.save();
    if (ch.spawning && !ch.opening) {
      // ---- Chest materialization animation ---------------------
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
        ctx.fillText('*', cx, cy + h * 0.1);
        ctx.globalAlpha = 1;
      }


    } else if (ch.opening && !ch.opened) {
      // ---- Opening animation -----------------------------------
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
        ctx.fillText('*', cx, cy + h * 0.1);
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

// ---- FLARE skill -------------------------------------------------------

function updateFlareSlot() {
  const slot = document.getElementById('p1-sk-flare');
  if (!slot) return;
  const cd = slot.querySelector('.sk-cd');
  const used = S.flareUsed || false;
  const mode = S.flareMode || false;
  slot.classList.toggle('sk-used', used);
  slot.classList.toggle('sk-active', mode);
  if (cd) {
    if (used) cd.textContent = 'USED';
    else if (mode) cd.textContent = 'AIM';
    else cd.textContent = 'READY';
  }
}

function updateHackSlot() { updateSkillBar(0); }

function fireFlareStraight(dx, dy) {
  const hero = S.units.find(u => u.team === 0 && u.alive);
  if (!hero) return;
  S.flareMode = false;
  S.flareUsed = true;
  updateFlareSlot();

  // Build path: fly in dx/dy direction, stop at walls or map edge
  const path = [];
  let cx = hero.x, cy = hero.y;
  while (true) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) {
      // Include the wall cell itself so it's revealed too
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) path.push({ x: nx, y: ny });
      break;
    }
    path.push({ x: cx, y: cy });
    cx = nx; cy = ny;
  }

  const stepMs = 45; // ms per cell
  const fp = {
    path,
    step: 0,
    startTime: performance.now(),
    stepMs,
    dx, dy,
  };
  S.flareProjectile = fp;

  SFX.flare();
  spawnDmgNumber(hero.x, hero.y, 'FLARE!', '#ffaa00', 16, 'crit');

  const FLARE_RADIUS = 1;
  function revealFlareCell(x, y) {
    const now = performance.now();
    for (let dy2 = -FLARE_RADIUS; dy2 <= FLARE_RADIUS; dy2++)
      for (let dx2 = -FLARE_RADIUS; dx2 <= FLARE_RADIUS; dx2++) {
        const nx = x + dx2, ny = y + dy2;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        if (!S.fog[ny][nx]) S.fogReveal[ny][nx] = now;
        S.fog[ny][nx] = true;
        S.flareRevealedCells.add(nx + ',' + ny);
      }
  }

  function stepReveal(i) {
    if (i >= path.length) {
      S.flareProjectile = null;
      checkExplorationComplete();
      updateExplorationTracker();
      return;
    }
    const { x, y } = path[i];
    revealFlareCell(x, y);
    S.flareProjectile.step = i;
    setTimeout(() => stepReveal(i + 1), stepMs);
  }
  stepReveal(0);
}

function drawFlareProjectile() {
  if (!S.flareProjectile) return;
  const fp = S.flareProjectile;
  const { path, step } = fp;
  if (!path || step >= path.length) return;

  const now = performance.now();
  const { x, y } = path[step];
  const pulse = 0.85 + 0.15 * Math.sin(now * 0.025);

  const px = (x + 0.5) * CELL;
  const py = (y + 0.5) * CELL;

  ctx.save();
  ctx.shadowColor = '#ffaa00';
  ctx.shadowBlur = 28 * pulse;
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffcc00';
  ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();

  // Trail along path
  for (let i = 1; i <= Math.min(6, step); i++) {
    const tp = path[step - i];
    if (!tp) break;
    const tpx = (tp.x + 0.5) * CELL;
    const tpy = (tp.y + 0.5) * CELL;
    ctx.globalAlpha = (1 - i / 7) * 0.5;
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ff8800';
    ctx.beginPath(); ctx.arc(tpx, tpy, Math.max(0.5, 5 - i * 0.7), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---- RONKE STRONKE skill -----------------------------------------------
// 8 cells around player, each move advances 1 cell. 16 moves = 2 full rotations.

// Shield rotates 1 cell every 3 actions
const _SHIELD_CELLS = [
  {dx:1,dy:0},{dx:1,dy:1},{dx:0,dy:1},{dx:-1,dy:1},
  {dx:-1,dy:0},{dx:-1,dy:-1},{dx:0,dy:-1},{dx:1,dy:-1}
];
function _ronkeShieldCell(offset = 0) {
  return _SHIELD_CELLS[((S.ronkeShield?.step ?? 0) + offset) % 8];
}
// Returns list of active shield cells [{cell, idx}]
function _ronkeActiveShields() {
  if (!S.ronkeShield?.active) return [];
  const out = [];
  const alive = S.ronkeShield.alive ?? [true, true];
  if (alive[0]) out.push({ cell: _ronkeShieldCell(0), idx: 0 });
  if (alive[1]) out.push({ cell: _ronkeShieldCell(4), idx: 1 });
  return out;
}

// Destroys both shields — launches the surviving one as a flying death orb
function _ronkeShatterPair(brokenIdx, heroUnit) {
  S.ronkeShield.alive[brokenIdx] = false;
  const _pairIdx = 1 - brokenIdx;
  if (S.ronkeShield.alive[_pairIdx]) {
    const _pairOff = _pairIdx === 0 ? 0 : 4;
    const _pairSc = _SHIELD_CELLS[(S.ronkeShield.step + _pairOff) % 8];
    const _newOrb = {
      gx: heroUnit.x + _pairSc.dx, gy: heroUnit.y + _pairSc.dy,
      px: heroUnit.x + _pairSc.dx, py: heroUnit.y + _pairSc.dy,
      dx: _pairSc.dx, dy: _pairSc.dy, alive: true,
    };
    if (S.ronkeDeathAnim) {
      S.ronkeDeathAnim.orbs.push(_newOrb);
    } else {
      S.ronkeDeathAnim = { phase: 'fly', orbs: [_newOrb] };
    }
    spawnHit(heroUnit.x + _pairSc.dx, heroUnit.y + _pairSc.dy, '#00ff66', 16);
    SFX.play(200, 0.10, 0.12, 'square');
    S.ronkeShield.alive[_pairIdx] = false;
  }
  S.ronkeShield.active = false;
}

function activateRonkeShield() {
  if (gameMode !== 'adventure') return;
  const hero = S.units.find(u => u.team === 0 && u.alive);
  if (!hero || S.clockSide !== 0) return;
  if (S.ronkeShield && S.ronkeShield.active) {
    S.ronkeShield.active = false;
    S.ronkeShield.movesLeft = 0;
    updateRonkeShieldSlot();
    return;
  }
  if (S.energy < 5) {
    SFX.play(200, 0.1, 0.05, 'square');
    return;
  }
  const adjacent = S.units.some(u => u.team !== 0 && u.alive &&
    Math.abs(u.x - hero.x) <= 1 && Math.abs(u.y - hero.y) <= 1);
  if (adjacent) {
    SFX.play(200, 0.1, 0.05, 'square');
    return;
  }
  S.energy -= 5;
  S.ronkeShield = { active: true, movesLeft: 16, step: S.ronkeShield?.step ?? 0, ticks: 0, alive: [true, true], spawnAt: performance.now() };
  updateRonkeShieldSlot();
  SFX.play(440, 0.18, 0.4, 'sine');
  SFX.play(660, 0.12, 0.3, 'sine');
}

function updateRonkeShieldSlot() {
  const slot = document.getElementById('p1-sk-ronke-shield');
  if (!slot) return;
  const cd = slot.querySelector('.sk-cd');
  const active = S.ronkeShield?.active || false;
  slot.classList.toggle('sk-active', active);
  if (cd) cd.textContent = active ? `${S.ronkeShield.movesLeft}` : '5\u26A1';
}

function _drawOneShield(rx, ry, sc, pulse, now, hero) {
  const px = (rx + sc.dx + 0.5) * CELL;
  const py = (ry + sc.dy + 0.5) * CELL;
  const t = now * 0.001;

  // Hero's current outline color (match weapon)
  const wfb = hero?.wfb;
  const WFORMS_OC = { bullet:'#2a6010', laser:'#0d4d2a', heavy:'#8a3a00', shotgun:'#2a6010', hack:'#003366', ronke:'#0d4d2a' };
  const outlineCol = wfb ? (WFORMS_OC[wfb.to] || '#2a6010') : '#2a6010';
  const WFORMS_EYE = { bullet:'#00f5ff', laser:'#00f5ff', heavy:'#ff6600', shotgun:'#00f5ff', hack:'#44ccff', ronke:'#00f5ff' };
  const eyeCol = wfb ? (WFORMS_EYE[wfb.to] || '#00f5ff') : '#00f5ff';

  // Size: ~55% of the hero body + 2px
  const sz = UNIT_CELL * 0.30;
  const bsz = sz * 0.62 + 2;

  const trailAngle = Math.atan2(sc.dy, sc.dx);

  // Spawn animation (first 400ms)
  const SPAWN_DUR = 400;
  const spawnAge = now - (S.ronkeShield?.spawnAt ?? now);
  const spawnT = Math.min(1, spawnAge / SPAWN_DUR);
  // ease out: fast start, smooth end
  const spawnScale = spawnT < 1 ? 1 - Math.pow(1 - spawnT, 3) : 1;

  // Expanding ring burst during spawn
  if (spawnT < 1) {
    const ringR = bsz * (0.5 + spawnT * 2.2);
    const ringAlpha = (1 - spawnT) * 0.85 * pulse;
    ctx.globalAlpha = ringAlpha;
    ctx.strokeStyle = outlineCol;
    ctx.shadowColor = outlineCol; ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5 * (1 - spawnT);
    ctx.beginPath(); ctx.arc(px, py, ringR, 0, Math.PI * 2); ctx.stroke();
    // second faster ring
    const ring2R = bsz * (0.3 + spawnT * 1.2);
    ctx.globalAlpha = ringAlpha * 0.5;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, ring2R, 0, Math.PI * 2); ctx.stroke();
  }

  // Shadow under the mini orb
  ctx.globalAlpha = pulse * spawnScale * 0.22;
  ctx.fillStyle = '#000';
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(px + 3, py + 4, bsz * 0.7 * spawnScale, 0, Math.PI * 2); ctx.fill();

  // Black orb body — scale in from zero
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(spawnScale, spawnScale);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#000000';
  ctx.shadowColor = outlineCol; ctx.shadowBlur = 8 * pulse;
  ctx.beginPath(); ctx.arc(0, 0, bsz, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = outlineCol; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, bsz, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function drawRonkeShield() {
  // Draw flying death orbs (tick-synced with S.animT like bullets/units)
  if (S.ronkeDeathAnim) {
    const _tA = easeOutCubic(Math.min(1, S.animT ?? 1));
    const bsz3 = UNIT_CELL * 0.30 * 0.62 + 2;
    ctx.save();
    S.ronkeDeathAnim.orbs.forEach(o => {
      if (!o.alive) return;
      const ox = (o.px + (o.gx - o.px) * _tA + 0.5) * CELL;
      const oy = (o.py + (o.gy - o.py) * _tA + 0.5) * CELL;
      // 2×2 trail pixels behind
      ctx.shadowBlur = 0;
      for (let ti = 1; ti <= 4; ti++) {
        ctx.globalAlpha = (1 - ti * 0.22);
        ctx.fillStyle = '#00f5ff';
        ctx.fillRect(Math.round(ox - o.dx * ti * 5) - 1, Math.round(oy - o.dy * ti * 5) - 1, 2, 2);
      }
      // Orb body
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = '#000000';
      ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(ox, oy, bsz3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#00f5ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ox, oy, bsz3, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();
  }

  if (!S.ronkeShield?.active) return;
  const hero = S._hero || S.units.find(u => u.team === 0 && u.alive);
  if (!hero) return;

  const now = performance.now();
  const pulse = 1.0;
  const rx = (hero.rx ?? hero.x), ry = (hero.ry ?? hero.y);
  const alive = S.ronkeShield.alive ?? [true, true];

  ctx.save();

  const heroCX = (rx + 0.5) * CELL;
  const heroCY = (ry + 0.5) * CELL;
  const t = now * 0.001;
  const WFORMS_EC = { bullet:'#00f5ff', laser:'#00f5ff', heavy:'#ff6600', shotgun:'#00f5ff', hack:'#44ccff', ronke:'#00f5ff' };
  const tetherCol = hero?.wfb ? (WFORMS_EC[hero.wfb.to] || '#00f5ff') : '#00f5ff';

  // Smooth shield positions — interpolate prevStep → step using game animT
  const _animT = easeOutCubic(Math.min(1, S.animT ?? 1));
  const _lerpSc = (offset) => {
    const curSc  = _SHIELD_CELLS[(S.ronkeShield.step + offset) % 8];
    const prevSc = _SHIELD_CELLS[((S.ronkeShield.prevStep ?? S.ronkeShield.step) + offset) % 8];
    return {
      dx: prevSc.dx + (curSc.dx - prevSc.dx) * _animT,
      dy: prevSc.dy + (curSc.dy - prevSc.dy) * _animT,
    };
  };
  const sc0 = _lerpSc(0);
  const sc1 = _lerpSc(4);

  // Energy tether: hero → each alive shield (thin jagged line)
  const _drawTether = (sc) => {
    const sx = (rx + sc.dx + 0.5) * CELL;
    const sy = (ry + sc.dy + 0.5) * CELL;
    const segs = 6;
    const dist = Math.hypot(sx - heroCX, sy - heroCY);
    const nx = -(sy - heroCY) / dist, ny = (sx - heroCX) / dist;
    ctx.strokeStyle = tetherCol; ctx.lineWidth = 1;
    ctx.shadowColor = tetherCol; ctx.shadowBlur = 6 * pulse;
    ctx.globalAlpha = 0.45 * pulse;
    ctx.beginPath(); ctx.moveTo(heroCX, heroCY);
    for (let i = 1; i < segs; i++) {
      const f = i / segs;
      const jit = (Math.sin(t * 11 + i * 2.3 + sc.dx * 5) * dist * 0.07);
      ctx.lineTo(heroCX + (sx - heroCX) * f + nx * jit, heroCY + (sy - heroCY) * f + ny * jit);
    }
    ctx.lineTo(sx, sy); ctx.stroke();
  };

  // Magnetic field arc between the two shields (when both alive)
  if (alive[0] && alive[1]) {
    const ax = (rx + sc0.dx + 0.5) * CELL, ay = (ry + sc0.dy + 0.5) * CELL;
    const bx = (rx + sc1.dx + 0.5) * CELL, by = (ry + sc1.dy + 0.5) * CELL;
    const midX = (ax + bx) * 0.5, midY = (ay + by) * 0.5;
    const perp = Math.atan2(by - ay, bx - ax) + Math.PI * 0.5;

    // Spawn animation — lines grow from both poles toward center simultaneously
    const spawnAge = now - (S.ronkeShield?.spawnAt ?? now);
    const FIELD_DELAY = 250, FIELD_DUR = 450;
    const fieldAge = Math.max(0, spawnAge - FIELD_DELAY);
    const fieldRaw = Math.min(1, fieldAge / FIELD_DUR);
    // ease-out quad
    const fieldT = 1 - Math.pow(1 - fieldRaw, 2);

    // Sample quadratic bezier B(t) = (1-t)²A + 2(1-t)t*CP + t²B
    const qbez = (t2, cpx, cpy) => ({
      x: (1-t2)*(1-t2)*ax + 2*(1-t2)*t2*cpx + t2*t2*bx,
      y: (1-t2)*(1-t2)*ay + 2*(1-t2)*t2*cpy + t2*t2*by,
    });

    const STEPS = 18;
    for (let li = 0; li < 4; li++) {
      const side = li % 2 === 0 ? 1 : -1;
      const bulge = side * CELL * (0.30 + Math.floor(li / 2) * 0.28);
      const sway = Math.sin(t * 0.9 + li * 0.7) * CELL * 0.06;
      const cpx = midX + Math.cos(perp) * (bulge + sway);
      const cpy = midY + Math.sin(perp) * (bulge + sway);
      const lineAlpha = (0.22 - Math.floor(li / 2) * 0.06) * pulse;

      ctx.strokeStyle = tetherCol; ctx.lineWidth = 1;
      ctx.shadowColor = tetherCol; ctx.shadowBlur = 5 * pulse;
      ctx.globalAlpha = lineAlpha;

      // Half from pole A (t=0 → t=0.5*fieldT)
      const halfT = 0.5 * fieldT;
      if (halfT > 0) {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        for (let si = 1; si <= STEPS; si++) {
          const tp = (si / STEPS) * halfT;
          const p = qbez(tp, cpx, cpy);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // Half from pole B (t=1 → t=1-0.5*fieldT)
      const tStart = 1 - halfT;
      if (halfT > 0) {
        ctx.beginPath();
        ctx.moveTo(bx, by);
        for (let si = 1; si <= STEPS; si++) {
          const tp = 1 - (si / STEPS) * halfT;
          const p = qbez(tp, cpx, cpy);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }
  }

  if (alive[0]) { _drawTether(sc0); _drawOneShield(rx, ry, sc0, pulse, now, hero); }
  if (alive[1]) { _drawTether(sc1); _drawOneShield(rx, ry, sc1, pulse, now, hero); }

  ctx.restore();
}

function drawRonkeInfect() {
  if (!S.ronkeInfect) return;
  const INF_DUR = 1860;
  const LATCH_END = 0.22;
  const SPREAD_END = 0.68;
  const now = performance.now();
  const age = now - S.ronkeInfect.bornAt;
  if (age >= INF_DUR) {
    if (S.ronkeInfect.dmgNum) {
      const _dn = S.ronkeInfect.dmgNum;
      spawnDmgNumber(_dn.gx, _dn.gy, '-1 \u2623', '#00ff66', 17, 'crit');
      SFX.play(220, 0.18, 0.28, 'square', -120);   // damage hit tone
      SFX.play(110, 0.12, 0.20, 'sawtooth');        // low thud
    }
    S.ronkeInfect = null; return;
  }

  const tf = age / INF_DUR;
  const { spx, spy, epx: origEpx, epy: origEpy, tendrils, enemy } = S.ronkeInfect;
  // Follow enemy's current interpolated render position
  const _erx = enemy && enemy.alive ? ((enemy.rx ?? enemy.x) + 0.5) * CELL : origEpx;
  const _ery = enemy && enemy.alive ? ((enemy.ry ?? enemy.y) + 0.5) * CELL : origEpy;
  const epx = _erx, epy = _ery;
  // Tendril offset delta (tendrils were pre-calculated at origEpx/epy)
  const _tdx = epx - origEpx, _tdy = epy - origEpy;
  const bsz = UNIT_CELL * 0.30 * 0.62 + 2;
  const IC = '#00ff66';
  const IG = '#00aa44';
  const _inf = S.ronkeInfect;

  // Phase sound triggers (once per phase)
  if (tf >= LATCH_END && !_inf._sLatch) {
    _inf._sLatch = true;
    SFX.play(90,  0.18, 0.30, 'sine');                // deep thump — latch impact
    SFX.play(1400, 0.05, 0.18, 'square', -800);        // sharp crack
  }
  if (tf >= LATCH_END && !_inf._sSpread) {
    _inf._sSpread = true;
    SFX.play(110, 1.0, 0.09, 'sawtooth', 120);         // creeping rising hum
    SFX.play(330, 0.4, 0.06, 'square',  -180);         // glitch descend
  }
  if (tf >= SPREAD_END && !_inf._sExplode) {
    _inf._sExplode = true;
    SFX.play(55,  0.35, 0.38, 'sawtooth', -30);        // deep explosion boom
    SFX.play(900, 0.15, 0.22, 'square',  -700);        // crashing high burst
    SFX.play(440, 0.20, 0.12, 'sine');                  // resonant ping
  }

  ctx.save();

  // Phase 1: Orb flies from shield position to enemy
  if (tf < LATCH_END) {
    const lt = tf / LATCH_END;
    const le = 1 - Math.pow(1 - lt, 3);
    const ox = spx + (epx - spx) * le;
    const oy = spy + (epy - spy) * le;
    const len2 = Math.hypot(epx - spx, epy - spy) || 1;
    const tdx = (epx - spx) / len2, tdy = (epy - spy) / len2;
    ctx.shadowBlur = 0;
    for (let _ti = 1; _ti <= 5; _ti++) {
      ctx.globalAlpha = 1 - _ti * 0.18;
      ctx.fillStyle = '#00f5ff';
      ctx.fillRect(Math.round(ox - tdx * _ti * 4) - 1, Math.round(oy - tdy * _ti * 4) - 1, 2, 2);
    }
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#000000';
    ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(ox, oy, bsz, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#00f5ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ox, oy, bsz, 0, Math.PI * 2); ctx.stroke();
  }

  // Phase 2: Orb latched, tendrils spread out
  if (tf >= LATCH_END && tf < SPREAD_END) {
    const st = (tf - LATCH_END) / (SPREAD_END - LATCH_END);
    const se = 1 - Math.pow(1 - st, 2);
    const op = 0.7 + 0.3 * Math.sin(tf * Math.PI * 22);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#000000';
    ctx.shadowColor = IC; ctx.shadowBlur = 20 * op;
    ctx.beginPath(); ctx.arc(epx, epy, bsz, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = IC; ctx.lineWidth = 1.5 * op;
    ctx.beginPath(); ctx.arc(epx, epy, bsz, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.65 * op;
    ctx.fillStyle = IC; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(epx, epy, bsz * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    tendrils.forEach(pts => {
      const vis = 1 + Math.ceil((pts.length - 1) * se);
      if (vis < 2) return;
      ctx.globalAlpha = (0.5 + 0.5 * se) * 0.9;
      ctx.strokeStyle = IC; ctx.shadowColor = IG; ctx.shadowBlur = 7;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.beginPath();
      for (let _pi = 0; _pi < vis; _pi++) { const _pp2 = pts[_pi]; _pi === 0 ? ctx.moveTo(_pp2.x + _tdx, _pp2.y + _tdy) : ctx.lineTo(_pp2.x + _tdx, _pp2.y + _tdy); }
      ctx.stroke();
      const tip = pts[vis - 1];
      ctx.globalAlpha = 0.8 * se;
      ctx.fillStyle = IC; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(tip.x + _tdx, tip.y + _tdy, 1.8, 0, Math.PI * 2); ctx.fill();
    });
  }

  // Phase 3: Explosion burst
  if (tf >= SPREAD_END) {
    const et = (tf - SPREAD_END) / (1 - SPREAD_END);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    tendrils.forEach(pts => {
      ctx.globalAlpha = (1 - et) * 0.38;
      ctx.strokeStyle = IC; ctx.shadowColor = IG; ctx.shadowBlur = 4;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let _pi = 0; _pi < pts.length; _pi++) { const _pp2 = pts[_pi]; _pi === 0 ? ctx.moveTo(_pp2.x + _tdx, _pp2.y + _tdy) : ctx.lineTo(_pp2.x + _tdx, _pp2.y + _tdy); }
      ctx.stroke();
    });
    [
      { delay: 0,    dur: 0.65, maxR: CELL * 1.1,  col: IC,        lw: 2.5 },
      { delay: 0.08, dur: 0.80, maxR: CELL * 1.75, col: '#00f5ff', lw: 1.5 },
      { delay: 0.18, dur: 0.65, maxR: CELL * 0.7,  col: '#ffffff', lw: 1.0 },
      { delay: 0.26, dur: 0.55, maxR: CELL * 1.35, col: IG,        lw: 1.2 },
    ].forEach(rc => {
      const rt = Math.max(0, (et - rc.delay) / rc.dur);
      if (rt <= 0 || rt >= 1) return;
      const eased = 1 - Math.pow(1 - rt, 2);
      ctx.globalAlpha = (1 - rt) * 0.95;
      ctx.strokeStyle = rc.col; ctx.shadowColor = rc.col; ctx.shadowBlur = 16;
      ctx.lineWidth = rc.lw * (1 - rt * 0.6);
      ctx.beginPath(); ctx.arc(epx, epy, rc.maxR * eased, 0, Math.PI * 2); ctx.stroke();
    });
    if (et < 0.22) {
      const fa = (1 - et / 0.22) * 0.85;
      ctx.globalAlpha = fa;
      ctx.fillStyle = IC; ctx.shadowColor = IC; ctx.shadowBlur = 45;
      ctx.beginPath(); ctx.arc(epx, epy, CELL * 0.5 * (1 - et / 0.22), 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

function drawFlareAimIndicator() {
  if (!S.flareMode || gameMode !== 'adventure') return;
  const hero = S._hero || S.units.find(u => u.team === 0 && u.alive);
  if (!hero) return;
  const t = performance.now() / 1000;
  const pulse = Math.sin(t * 6) * 0.3 + 0.7;
  const dirs = [
    { dx: 0, dy: -1, key: 'W' }, { dx: 0, dy: 1, key: 'S' },
    { dx: -1, dy: 0, key: 'A' }, { dx: 1, dy: 0, key: 'D' },
  ];
  dirs.forEach(({ dx, dy, key }) => {
    // Show first 3 cells in each direction
    for (let r = 1; r <= 3; r++) {
      const ax = hero.x + dx * r, ay = hero.y + dy * r;
      if (ax < 0 || ax >= COLS || ay < 0 || ay >= ROWS) break;
      const cx2 = (ax + 0.5) * CELL, cy2 = (ay + 0.5) * CELL;
      ctx.save();
      ctx.globalAlpha = pulse * (0.6 - r * 0.15);
      ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 2;
      ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 10;
      ctx.strokeRect(cx2 - CELL * 0.38, cy2 - CELL * 0.38, CELL * 0.76, CELL * 0.76);
      if (r === 1) {
        ctx.globalAlpha = pulse * 0.9;
        ctx.fillStyle = '#ffaa00';
        ctx.shadowBlur = 8;
        ctx.font = `bold ${Math.round(CELL * 0.3)}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(key, cx2, cy2);
      }
      ctx.restore();
    }
  });
}


function updateJumpSlot() {
  const slot = document.getElementById('p1-sk-jump');
  if (!slot) return;
  const cd = slot.querySelector('.sk-cd');
  const fc = S.jumpFreeCount || 0;
  slot.classList.toggle('sk-active', !!S.jumpMode);
  slot.classList.toggle('jump-no-free', fc <= 0);
  if (cd) {
    if (fc > 0) cd.textContent = fc > 1 ? `${fc}FREE` : 'FREE';
    else if ((S.energy || 0) < 5) cd.textContent = 'NO\u26A1';
    else cd.textContent = '-5\u26A1';
  }
}

function executeJump(dx, dy) {
  const hero = S.units.find(u => u.id === S.selectedId[0] && u.alive);
  if (!hero || S.pending[0] !== null) return;
  const jLvl = Profile.upgrades?.jumpLevel || 0;
  const range = jLvl >= 3 ? 3 : 2;
  const ok = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS && !isWall(x, y) && !S.units.some(u => u.alive && u.id !== hero.id && u.x === x && u.y === y);
  let tx, ty;
  for (let r = range; r >= 1; r--) {
    if (ok(hero.x + dx * r, hero.y + dy * r)) { tx = hero.x + dx * r; ty = hero.y + dy * r; break; }
  }
  if (tx === undefined) {
    spawnDmgNumber(hero.x, hero.y, 'BLOCKED!', '#ff4444', 14, 'normal');
    S.jumpMode = false; updateJumpSlot(); return;
  }
  const fc = S.jumpFreeCount || 0;
  if (fc <= 0 && (S.energy || 0) < 5) {
    spawnDmgNumber(hero.x, hero.y, 'NO\u26A1 JUMP', '#ff4444', 14, 'normal');
    S.jumpMode = false; updateJumpSlot(); return;
  }
  const usedFree = fc > 0;
  if (usedFree) {
    S.jumpFreeCount--;
  } else {
    S.energy = Math.max(0, S.energy - 5);
    spawnDmgNumber(hero.x, hero.y, '-5\u26A1', '#00f5ff', 14, 'normal');
  }
  hero.facing = { dx, dy };
  hero.x = tx; hero.y = ty; hero.rx = tx; hero.ry = ty;
  S.jumpMode = false;
  SFX.jump();
  S.shake = Math.max(S.shake || 0, 3);
  revealFog(tx, ty);
  updateJumpSlot();
  updateEnergyHud();
  // LVL4: freeze only on free jumps
  if (jLvl >= 4 && usedFree) {
    let frozeAny = false;
    S.units.forEach(u => { if (u.team === 1 && u.alive && isVisible(u.x, u.y)) { u.frozenTurns = 1; frozeAny = true; } });
    if (frozeAny) spawnDmgNumber(tx, ty, 'FREEZE!', '#aaddff', 16, 'crit');
  }
  S.pending[0] = { unitId: hero.id, t: 'jump' };
  aiQueueAction(false);
  resolveTick();
}

function drawJumpIndicator() {
  if (!S.jumpMode || gameMode !== 'adventure') return;
  const hero = S._hero || S.units.find(u => u.team === 0 && u.alive);
  if (!hero) return;
  const jLvl = Profile.upgrades?.jumpLevel || 0;
  const range = jLvl >= 3 ? 3 : 2;
  const t = performance.now() / 1000;
  const pulse = Math.sin(t * 6) * 0.3 + 0.7;
  const dirs = [
    { dx: 0, dy: -1, key: 'W' },
    { dx: 0, dy: 1, key: 'S' },
    { dx: -1, dy: 0, key: 'A' },
    { dx: 1, dy: 0, key: 'D' },
  ];
  if (jLvl >= 1) dirs.push(
    { dx: -1, dy: -1, key: 'Q' },
    { dx: 1, dy: -1, key: 'E' },
    { dx: -1, dy: 1, key: 'Y' },
    { dx: 1, dy: 1, key: 'C' },
  );
  const _jUnitPos = new Set();
  S.units.forEach(u => { if (u.alive && u.id !== hero.id) _jUnitPos.add(u.x + ',' + u.y); });
  const ok = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS && !isWall(x, y) && !_jUnitPos.has(x + ',' + y);
  dirs.forEach(({ dx, dy, key }) => {
    let tx, ty;
    for (let r = range; r >= 1; r--) {
      if (ok(hero.x + dx * r, hero.y + dy * r)) { tx = hero.x + dx * r; ty = hero.y + dy * r; break; }
    }
    if (tx === undefined) return;
    const cx = (tx + 0.5) * CELL, cy = (ty + 0.5) * CELL;
    ctx.save();
    ctx.globalAlpha = pulse * 0.75;
    ctx.strokeStyle = '#00ffee'; ctx.lineWidth = 2;
    ctx.shadowColor = '#00ffee'; ctx.shadowBlur = 10;
    ctx.strokeRect(cx - CELL * 0.38, cy - CELL * 0.38, CELL * 0.76, CELL * 0.76);
    ctx.globalAlpha = pulse * 0.12;
    ctx.fillStyle = '#00ffee';
    ctx.fillRect(cx - CELL * 0.38, cy - CELL * 0.38, CELL * 0.76, CELL * 0.76);
    // Key label
    ctx.globalAlpha = pulse * 0.9;
    ctx.fillStyle = '#00ffee';
    ctx.shadowColor = '#00ffee'; ctx.shadowBlur = 8;
    ctx.font = `bold ${Math.round(CELL * 0.3)}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(key, cx, cy);
    ctx.restore();
  });
}

function getMapRevealPercent() {
  if (!S.fog || !S.dungeon) return 0;
  let total = 0, revealed = 0;
  for (let r = 0; r < S.dungeon.length; r++) {
    for (let c = 0; c < S.dungeon[r].length; c++) {
      if (S.dungeon[r][c] > 0) {
        total++;
        if (S.fog[r][c]) revealed++;
      }
    }
  }
  return total === 0 ? 0 : revealed / total;
}

function drawTeleports() {
  if (!S.teleports || gameMode !== 'adventure') return;
  const t = performance.now() / 1000;
  const active = getMapRevealPercent() >= 0.51;
  S.teleports.forEach((pad, i) => {
    if (!isVisible(pad.x, pad.y) && !S.fog?.[pad.y]?.[pad.x] && !S.fullMapRevealed) return;
    const cx = (pad.x + 0.5) * CELL, cy = (pad.y + 0.5) * CELL;
    const px = pad.x * CELL, py = pad.y * CELL;
    const r = CELL * 0.28;
    ctx.save();
    if (active) {
      const pulse = Math.sin(t * 3.2 + i * Math.PI) * 0.5 + 0.5;
      if (teleportActiveImg.complete && teleportActiveImg.naturalWidth > 0) {
        ctx.shadowColor = '#e8a96a';
        ctx.shadowBlur = 10 + pulse * 14;
        ctx.globalAlpha = 0.90 + pulse * 0.10;
        ctx.drawImage(teleportActiveImg, px - CELL, py - CELL, CELL * 3, CELL * 2);
        ctx.globalAlpha = 0.18 + pulse * 0.12;
        ctx.fillStyle = '#e8a96a';
        ctx.beginPath(); ctx.arc(cx, cy + CELL * 0.05, CELL * 0.32, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.shadowColor = '#c87941'; ctx.shadowBlur = 8 + pulse * 10;
        ctx.globalAlpha = 0.08 + pulse * 0.10;
        ctx.fillStyle = '#c87941';
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#c87941'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * 1.8 + i * Math.PI);
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = '#e8a96a'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.70, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        ctx.setLineDash([]);
        ctx.fillStyle = '#c87941';
        ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 6; ctx.fillStyle = '#e8a96a';
        ctx.font = `bold ${Math.round(CELL * 0.18)}px Courier New`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('>>', cx, cy);
      }
    } else {
      if (tinyImgs.mine.complete && tinyImgs.mine.naturalWidth > 0) {
        ctx.globalAlpha = 0.92;
        ctx.shadowColor = '#332211';
        ctx.shadowBlur = 4;
        ctx.drawImage(tinyImgs.mine, 0, 0, 192, 128, px - CELL, py - CELL, CELL * 3, CELL * 2);
      } else {
        const flicker = Math.random() > 0.97 ? 0.5 : 1;
        ctx.globalAlpha = 0.45 * flicker;
        ctx.shadowColor = '#441100'; ctx.shadowBlur = 4;
        ctx.strokeStyle = '#553322'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = '#332211'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.70, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#553322';
        ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#664433';
        ctx.font = `bold ${Math.round(CELL * 0.18)}px Courier New`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ERR', cx, cy);
      }
    }
    ctx.restore();
  });
}

function spawnLoot(x, y) {
  // fragment 60% | xptoken 20% | goldbag 20%
  const roll = Math.random();
  let type, val = 1;
  if      (roll < 0.60) type = 'fragment';
  else if (roll < 0.80) type = 'xptoken';
  else                 { type = 'goldbag'; val = 1; }
  S.loot.push({ x, y, type, val, collected: false, age: 0, ...(type === 'goldbag' ? { spawnT: performance.now() } : {}) });
}

function spawnRonkeDrop(x, y) {
  // 50% ronke token | 50% goldbag
  if (Math.random() < 0.5) {
    S.loot.push({ x, y, type: 'ronke', val: 1, collected: false, age: 0 });
  } else {
    S.loot.push({ x, y, type: 'goldbag', val: 3, collected: false, age: 0, spawnT: performance.now() });
  }
}

function spawnLockedBox(x, y) {
  // gem 15% | ronke 15% | byte 25% | fragment 30% | xptoken 15%
  const roll = Math.random();
  let prize;
  if      (roll < 0.15) prize = { type: 'gem',      val: 1 };
  else if (roll < 0.30) prize = { type: 'ronke',    val: 1 };
  else if (roll < 0.55) prize = { type: 'goldbag',  val: 2 };
  else if (roll < 0.85) prize = { type: 'fragment', val: 1 };
  else                  prize = { type: 'xptoken',  val: 1 };

  if (Math.random() < 0.5) {
    // 50% — tiesioginis dropas
    S.loot.push({ x, y, type: prize.type, val: prize.val, collected: false, age: 0 });
  } else {
    // 50% — užrakinta dėžutė
    const box = { x, y, type: 'lockedBox', prize, collected: false, age: 0 };
    S.loot.push(box);
    // First-time hint — show click tutorial once per profile
    if (!Profile.seenBoxHint) {
      S.boxHint = { x, y, start: performance.now() };
    }
  }
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
    logEvent(`CHIP${assembled > 1 ? `S x${assembled}` : ''} ASSEMBLED`, 'assembled');
  }
  updateInventoryUI();
}

function drawLoot() {
  if (!S.loot) return;
  const now = performance.now();
  S.loot.forEach(l => {
    if (l.collected) return;
    const _lootRevealed = S.fog && S.fog[l.y] && S.fog[l.y][l.x];
    if (gameMode === 'adventure' && !isVisible(l.x, l.y) && !_lootRevealed && !S.fullMapRevealed) return;
    const cx = (l.x + 0.5) * CELL, cy = (l.y + 0.5) * CELL;
    const float = Math.sin(now * 0.005) * 4;
    ctx.save();
    if (l.type === 'fragment') {
      const phase = l.x * 1.3 + l.y * 0.7;
      const t = now * 0.0016 + phase;
      const pulse = 0.75 + 0.25 * Math.sin(now * 0.006 + phase);
      ctx.shadowColor = 'rgba(255,136,0,0.35)'; ctx.shadowBlur = 2.2 * pulse;
      ctx.save();
      ctx.translate(cx, cy + float);
      drawCubeFragment(ctx, 5, t, pulse);
      ctx.restore();
    } else if (l.type === 'ronke') {
      const pulse = 0.75 + 0.25 * Math.sin(now * 0.0035 + l.x * 0.9 + l.y * 0.6);
      // Animate: 8 frames, ~120ms each
      const frameIdx = Math.floor(now / 120) % _R2TOK_FRAMES;
      const sz = CELL * 0.65;
      ctx.save();
      ctx.translate(cx, cy + float);
      ctx.shadowColor = '#66ccff'; ctx.shadowBlur = 18 * pulse;
      if (ronke2TokenImg.complete && ronke2TokenImg.naturalWidth > 0) {
        ctx.drawImage(
          ronke2TokenImg,
          frameIdx * _R2TOK_FW, 0, _R2TOK_FW, _R2TOK_FH,
          -sz / 2, -sz / 2, sz, sz
        );
      } else {
        ctx.fillStyle = '#1a8fff';
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    } else if (l.type === 'goldbag') {
      const _SPAWN_DUR = 700; // ms for 7-frame spawn anim
      const age = now - (l.spawnT || now);
      const sz = CELL * 1.7;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (age < _SPAWN_DUR) {
        // spawn animation
        const frame = Math.min(GOLDBAG_SPAWN_FRAMES - 1, Math.floor(age / _SPAWN_DUR * GOLDBAG_SPAWN_FRAMES));
        if (goldbagSpawnImg.complete && goldbagSpawnImg.naturalWidth > 0) {
          ctx.drawImage(goldbagSpawnImg, frame * GOLDBAG_FW, 0, GOLDBAG_FW, GOLDBAG_FH,
            cx - sz / 2, cy - sz / 2, sz, sz);
        }
      } else {
        // idle — G_Idle.png single frame
        const _pulse = 0.7 + 0.3 * Math.sin(now * 0.004 + l.x);
        ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 10 * _pulse;
        if (goldbagGIdleImg.complete && goldbagGIdleImg.naturalWidth > 0) {
          ctx.drawImage(goldbagGIdleImg, cx - sz / 2, cy - sz / 2, sz, sz);
        }
      }
      ctx.restore();
    } else if (l.type === 'gem') {
      const gemPulse = 0.7 + 0.3 * Math.sin(now * 0.004 + l.x * 1.1 + l.y * 0.7);
      ctx.save();
      ctx.translate(cx, cy + float);
      ctx.shadowColor = '#44ff66'; ctx.shadowBlur = 12 * gemPulse;
      const gw = 42, gh = 37;
      ctx.drawImage(gemImg, -gw / 2, -gh / 2, gw, gh);
      ctx.restore();
    } else if (l.type === 'xptoken') {
      const phase = l.x * 0.9 + l.y * 0.4;
      const angle = now * 0.0016 + phase;
      const cosA = Math.cos(angle);
      const isFront = cosA >= 0;
      const pulse = 0.7 + 0.3 * Math.sin(now * 0.0022 + phase);
      ctx.save();
      ctx.translate(cx, cy + float);
      ctx.scale(cosA, 1);
      if (isFront) {
        ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 5 * pulse;
        ctx.globalAlpha = 0.85 + 0.15 * pulse;
        drawXpPixelArt(ctx, 0, 0, 2, '#00ffcc');
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      } else {
        drawXpPixelArt(ctx, 0, 0, 2, '#003d2e');
      }
      ctx.restore();
    } else if (l.type === 'lockedBox') {
      const active = !!l.activated;
      const pulse = active ? 0.6 + 0.4 * Math.sin(now * 0.003 + l.x + l.y) : 0;
      const g = Math.floor(80 + 60 * pulse);
      if (active) {
        const hp = 0.5 + 0.5 * Math.sin(now * 0.006);
        ctx.save();
        ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 20 * hp;
        ctx.strokeStyle = `rgba(255,180,0,${0.6 + 0.4 * hp})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(l.x * CELL + 2, l.y * CELL + 2, CELL - 4, CELL - 4);
        ctx.fillStyle = `rgba(255,120,0,${0.08 + 0.07 * hp})`;
        ctx.fillRect(l.x * CELL, l.y * CELL, CELL, CELL);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
      const idlePulse = 0.6 + 0.4 * Math.sin(now * 0.0018 + l.x + l.y);
      ctx.save();
      ctx.translate(cx, cy + (active ? float * 0.5 : float * 0.4));
      ctx.shadowColor = active ? '#ff8800' : '#cc5500';
      ctx.shadowBlur = active ? 12 * pulse : 7 * idlePulse;
      // Box body
      ctx.fillStyle = active ? '#1a0d00' : '#1a0800';
      ctx.strokeStyle = active ? `rgba(255,${g},0,${0.7 + 0.3 * pulse})` : `rgba(220,100,0,${0.55 + 0.25 * idlePulse})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(-9, -6, 18, 13); ctx.fill(); ctx.stroke();
      // Padlock shackle arc
      ctx.strokeStyle = active ? `rgba(255,${g + 40},20,${0.85 + 0.15 * pulse})` : `rgba(200,80,0,${0.6 + 0.2 * idlePulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -6, 4.5, Math.PI, 0); ctx.stroke();
      // Keyhole circle
      ctx.fillStyle = active ? `rgba(255,${g + 20},0,0.9)` : `rgba(180,70,0,0.75)`;
      ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
      // Keyhole slot
      ctx.fillRect(-1, 1, 2, 3.5);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    ctx.restore();
  });

  // ── Box hint arrow ──────────────────────────────────────────────
  if (S.boxHint) {
    const elapsed = performance.now() - S.boxHint.start;
    if (elapsed > 6000) {
      S.boxHint = null;
    } else {
      const alpha = elapsed < 400 ? elapsed / 400 : elapsed > 5200 ? 1 - (elapsed - 5200) / 800 : 1;
      const hx = (S.boxHint.x + 0.5) * CELL;
      const hy = (S.boxHint.y + 0.5) * CELL;
      const bounce = Math.sin(performance.now() * 0.006) * 5;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 11px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffdd00';
      ctx.shadowColor = '#ffdd00';
      ctx.shadowBlur = 10;
      ctx.fillText('CLICK!', hx, hy - CELL * 1.1 + bounce);
      // Arrow ↓
      const ax = hx, ay = hy - CELL * 0.55 + bounce;
      ctx.beginPath();
      ctx.moveTo(ax, ay + 10);
      ctx.lineTo(ax - 6, ay);
      ctx.lineTo(ax + 6, ay);
      ctx.closePath();
      ctx.fillStyle = '#ffdd00';
      ctx.fill();
      ctx.restore();
    }
  }
}

function animateEnergyGain(fromEnergy, toEnergy) {
  const track = document.querySelector('.energy-track');
  const fill = document.getElementById('energy-fill');
  const val = document.getElementById('energy-val');
  if (!fill || !track) return;

  const effectiveMax = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);
  const gain = Math.round(toEnergy - fromEnergy);
  if (gain <= 0) { S.energy = toEnergy; updateEnergyHud(); return; }

  S.energyAnimating = true;
  S.energy = fromEnergy; // hold at old value during animation

  // Current fill snaps to fromEnergy position
  const fromPct = Math.min(fromEnergy / effectiveMax, 1) * 100;
  const toPct = Math.min(toEnergy / effectiveMax, 1) * 100;
  const gainPct = toPct - fromPct;

  fill.style.transition = 'none';
  fill.style.width = fromPct + '%';
  void fill.offsetWidth;
  if (val) val.textContent = fromEnergy;

  // Gray "incoming" fill — sits right after the current fill
  const gainFill = document.createElement('div');
  gainFill.style.cssText = [
    'position:absolute;top:0;bottom:0',
    `left:${fromPct}%`,
    'width:0',
    'background:#44444e',
    'pointer-events:none;z-index:1',
  ].join(';');
  track.appendChild(gainFill);

  let step = 0;
  const stepPct = gainPct / gain; // bar % per 1 energy unit
  const stepMs = 30;

  const interval = setInterval(() => {
    step++;
    S.energy = fromEnergy + step;
    gainFill.style.width = (stepPct * step) + '%';
    if (val) val.textContent = S.energy;

    if (step >= gain) {
      clearInterval(interval);
      S.energy = toEnergy;
      gainFill.style.transition = 'background 0.5s ease, box-shadow 0.5s ease';
      gainFill.style.background = 'var(--cyan, #00ffee)';
      gainFill.style.boxShadow = '0 0 6px var(--cyan, #00ffee), 0 0 14px rgba(0,255,238,0.25)';
      setTimeout(() => {
        gainFill.remove();
        S.energyAnimating = false;
        updateEnergyHud();
      }, 500);
    }
  }, stepMs);
}

let _lastEnergyHudVal = -1, _lastEnergyHudMax = -1;
function updateEnergyHud() {
  const hud = document.getElementById('energy-hud');
  const fill = document.getElementById('energy-fill');
  const val = document.getElementById('energy-val');
  if (!hud) return;

  const effectiveMax = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);
  // Skip DOM update if nothing changed
  if (S.energy === _lastEnergyHudVal && effectiveMax === _lastEnergyHudMax) return;
  _lastEnergyHudVal = S.energy; _lastEnergyHudMax = effectiveMax;

  const pct = Math.min(S.energy / effectiveMax, 1);
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

window.useRonkeForEnergy = function () {
  if (gameMode !== 'adventure' || S.dead) return;
  const effectiveMax = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);
  if (S.energy >= effectiveMax) {
    const hero = S.units.find(u => u.team === 0 && u.alive);
    if (hero) spawnDmgNumber(hero.x, hero.y, 'MAX ENERGY', '#080808', 12, 'normal');
    return;
  }
  const ronkeSlotIndex = S.inventory.findIndex(s => s && s.type === 'ronke');
  if (ronkeSlotIndex === -1 || (S.inventory[ronkeSlotIndex]?.qty || 0) <= 0) {
    const hero = S.units.find(u => u.team === 0 && u.alive);
    if (hero) spawnDmgNumber(hero.x, hero.y, 'NO POISON', '#ff5555', 12, 'normal');
    return;
  }
  S.inventory[ronkeSlotIndex].qty--;
  if (S.inventory[ronkeSlotIndex].qty <= 0) S.inventory[ronkeSlotIndex] = null;
  saveProfile();
  if (document.getElementById('inv-overlay')?.classList.contains('active')) updateInventoryUI();
  const _oldE = S.energy || 0;
  S.energy = Math.min(effectiveMax, _oldE + 5);
  animateEnergyGain(_oldE, S.energy);
  const hero = S.units.find(u => u.team === 0 && u.alive);
  if (hero && typeof spawnDmgNumber === 'function') spawnDmgNumber(hero.x, hero.y, '+5⚡', '#44aaff', 16, 'crit');
  if (typeof SFX !== 'undefined' && SFX.nanoHeal) SFX.nanoHeal();
};

window.useByteForEnergy = function () {
  if (gameMode !== 'adventure' || S.dead) return;
  const effectiveMax = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);
  if (S.energy >= effectiveMax) {
    if (typeof spawnDmgNumber === 'function') {
      const hero = S.units.find(u => u.team === 0 && u.alive);
      if (hero) spawnDmgNumber(hero.x, hero.y, 'MAX ENERGY', '#080808', 12, 'normal');
    }
    return;
  }
  if ((S.bytes || 0) <= 0) {
    if (typeof spawnDmgNumber === 'function') {
      const hero = S.units.find(u => u.team === 0 && u.alive);
      if (hero) spawnDmgNumber(hero.x, hero.y, 'NO RONKE', '#ff5555', 12, 'normal');
    }
    return;
  }
  // Deduct 1 Byte
  S.bytes--;
  // Sync with global inventory
  const byteSlotIndex = S.inventory.findIndex(s => s && s.type === 'byte');
  if (byteSlotIndex !== -1) {
    S.inventory[byteSlotIndex].qty--;
    if (S.inventory[byteSlotIndex].qty <= 0) {
      S.inventory[byteSlotIndex] = null;
    }
    saveProfile();
    if (document.getElementById('inv-overlay')?.classList.contains('active')) {
      updateInventoryUI();
    }
  }

  // Add +5 Energy
  S.energy = Math.min(effectiveMax, S.energy + 5);
  updateEnergyHud();

  // Visual/Audio Feedback
  const hero = S.units.find(u => u.team === 0 && u.alive);
  if (hero && typeof spawnDmgNumber === 'function') {
    spawnDmgNumber(hero.x, hero.y, '+5\u26A1', '#00ff88', 16, 'crit');
  }
  if (typeof SFX !== 'undefined' && SFX.nanoHeal) SFX.nanoHeal();
};

document.addEventListener('keydown', e => {
  if (PREVENT_KEYS.has(e.code)) e.preventDefault();
  if (S.pendingSlotPrize) return; // slot machine open - block all input
  if (S.cracking) return; // hash cracking in progress - block all input
  if (document.getElementById('card-picker-overlay')) return; // card picker open - block all input
  if (S.heroShootLock && gameMode === 'adventure') return; // shoot animation in progress

  if (S.pendingTeleportSector) {
    if (e.code === 'Escape') window.cancelTeleportUse();
    else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') window.confirmTeleportUse();
    return;
  }


  if (e.code === 'KeyI' && gameMode === 'adventure') {
    window.toggleInventory();
    return;
  }
  if (S.inventoryOpen) return;

  if (S.phase !== 'frozen') return;


  // Jump mode direction intercept
  if (S.jumpMode && gameMode === 'adventure') {
    const jDirMap = {
      ArrowUp: { dx: 0, dy: -1 }, ArrowDown: { dx: 0, dy: 1 }, ArrowLeft: { dx: -1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 },
      KeyW: { dx: 0, dy: -1 }, KeyS: { dx: 0, dy: 1 }, KeyA: { dx: -1, dy: 0 }, KeyD: { dx: 1, dy: 0 }
    };
    if ((Profile.upgrades?.jumpLevel || 0) >= 1) {
      jDirMap.Numpad7 = { dx: -1, dy: -1 }; jDirMap.Numpad9 = { dx: 1, dy: -1 };
      jDirMap.Numpad1 = { dx: -1, dy: 1 }; jDirMap.Numpad3 = { dx: 1, dy: 1 };
      jDirMap.KeyQ = { dx: -1, dy: -1 }; jDirMap.KeyE = { dx: 1, dy: -1 };
      jDirMap.KeyY = { dx: -1, dy: 1 }; jDirMap.KeyC = { dx: 1, dy: 1 };
    }
    const jDir = jDirMap[e.code];
    if (jDir) { e.preventDefault(); executeJump(jDir.dx, jDir.dy); return; }
    if (e.code === 'Escape' || e.code === 'KeyJ') { S.jumpMode = false; updateJumpSlot(); return; }
  }

  // Jump skill toggle
  if (e.code === 'KeyJ' && gameMode === 'adventure') {
    const hero = S.units.find(u => u.id === S.selectedId[0] && u.alive);
    if (hero && S.clockSide === 0 && S.pending[0] === null) {
      S.jumpMode = !S.jumpMode;
      updateJumpSlot();
    }
    return;
  }

  // Flare aim mode direction intercept
  if (S.flareMode && gameMode === 'adventure') {
    const fDirMap = {
      ArrowUp: { dx: 0, dy: -1 }, ArrowDown: { dx: 0, dy: 1 },
      ArrowLeft: { dx: -1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 },
      KeyW: { dx: 0, dy: -1 }, KeyS: { dx: 0, dy: 1 },
      KeyA: { dx: -1, dy: 0 }, KeyD: { dx: 1, dy: 0 },
    };
    const fDir = fDirMap[e.code];
    if (fDir) { e.preventDefault(); fireFlareStraight(fDir.dx, fDir.dy); return; }
    if (e.code === 'Escape' || e.code === 'KeyF') { S.flareMode = false; updateFlareSlot(); return; }
  }

  // Ronke Stronke skill toggle
  if (e.code === 'KeyG' && gameMode === 'adventure') {
    activateRonkeShield();
    return;
  }

  // Flare skill toggle
  if (e.code === 'KeyF' && gameMode === 'adventure') {
    if (S.flareUsed) {
      const hero = S.units.find(u => u.team === 0 && u.alive);
      if (hero) spawnDmgNumber(hero.x, hero.y, 'USED!', '#ff4444', 12, 'normal');
      return;
    }
    const hero = S.units.find(u => u.id === S.selectedId[0] && u.alive);
    if (hero && S.clockSide === 0) { S.flareMode = !S.flareMode; updateFlareSlot(); }
    return;
  }

  if (e.code === 'KeyQ' || (e.code === 'KeyP' && gameMode === 'pvp')) {
    const team = e.code === 'KeyQ' ? 0 : 1;
    if (S.clockSide !== team) return;
    const unit = S.units.find(u => u.id === S.selectedId[team] && u.alive);
    if (unit) {
      const cycle = ['bullet', 'laser', 'heavy', 'shotgun', 'hack', 'ronke'];
      const nextWeapon = cycle[(cycle.indexOf(unit.weapon || 'bullet') + 1) % cycle.length];
      unit.weapon = nextWeapon;
      if (nextWeapon === 'bullet') unit.gunSwitchAt = performance.now();
      updateSkillBar(team);
    }
    return;
  }

  if (e.code === 'KeyH' && gameMode === 'adventure') {
    window.useByteForEnergy();
    return;
  }

  let code = e.code;
  if (!code || code === 'Unidentified') {
    if (e.key === ' ') code = 'Space';
    else if (e.key === 'Spacebar') code = 'Space';
    else if (e.key === 'Enter') code = 'Enter';
    else if (e.key === 'ArrowUp') code = 'ArrowUp';
    else if (e.key === 'ArrowDown') code = 'ArrowDown';
    else if (e.key === 'ArrowLeft') code = 'ArrowLeft';
    else if (e.key === 'ArrowRight') code = 'ArrowRight';
    else if (typeof e.key === 'string' && e.key.length === 1) code = 'Key' + e.key.toUpperCase();
  }
  const k = KEYMAP[code];
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
    if (gameMode === 'adventure' && k.team === 0) {
      if (S.jumpMode) return; // jump mode active – block shooting
      const _roomCleared = S.fullMapRevealed && !S.units.some(u => isHostileAdventureEnemy(u));
      if (_roomCleared) return; // block all shooting when cleared
      let nrgReq = 0;
      if (wep === 'bullet') nrgReq = 2;
      if (wep === 'laser') nrgReq = 7;
      if (wep === 'heavy' || wep === 'shotgun') nrgReq = 4;
      if (wep !== 'hack' && S.energy < nrgReq) return;
      if (wep === 'hack' && (S.hackAmmo || 0) <= 0 && S.energy < 10) return;
      // Bullet: block if ANY enemy is directly adjacent (distance 1, any direction)
      if (wep === 'bullet') {
        const _tooClose = S.units.some(u => {
          if (!u.alive || u.team === 0) return false;
          return Math.abs(u.x - unit.x) + Math.abs(u.y - unit.y) === 1;
        });
        if (_tooClose) {
          spawnDmgNumber(unit.x, unit.y, 'TOO CLOSE', '#ff4444', 13, 'miss');
          SFX.play(120, 0.12, 0.08, 'square');
          S.shake = Math.max(S.shake || 0, 3);
          return;
        }
      }
    } else {
      if (wep === 'bullet' && unit.ammo <= 0) return;
      if (wep === 'laser' && unit.laserAmmo <= 0) return;
      if (wep === 'heavy' && unit.heavyAmmo <= 0) return;
      if (wep === 'shotgun' && unit.shotgunAmmo <= 0) return;
    }
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
  S.pendingEnemyBatch = [];
  setActionBadge(0, null); setActionBadge(1, null);



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

            if (u.x === nx && u.y === ny) {

              const pushX = u.x + moveDx;
              const pushY = u.y + moveDy;

              if (!isWall(pushX, pushY)) {

                u.x = pushX;
                u.y = pushY;
              } else {

                if (u.team === 0) {
                  S.energy = Math.max(0, S.energy - 1);
                  u.hitFlash = 1; u.hitTimer = 1000;
                  SFX.heroHit();
                  S.shake = Math.max(S.shake, 20);
                  spawnDmgNumber(u.x, u.y, '-1 CRUSH!', '#ff2222', 20, 'crit');
                  spawnMeleeEffect(u.x, u.y, 0, 0, '#ffffff');
                } else {
                  u.hp = 0; u.alive = false;
                  spawnDeath(u.x, u.y, u.color);
                  if (S.bloodStains) S.bloodStains.push(mkBloodStain(u.x, u.y));
                  S.kills = (S.kills || 0) + 1;
                  trackKill();
                  if (!Profile.stats) Profile.stats = { totalKills: 0 };
                  Profile.stats.totalKills = (Profile.stats.totalKills || 0) + 1;
                  saveProfile(); _updateKillsDisplay();
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
    // Teleport pad interaction - stepping on opens sector jump confirmation
    const hero = S.units.find(u => u.team === 0 && u.alive);
    if (!S.pendingTeleportSector) {
      S.teleports && S.teleports.forEach((pad) => {
        if (hero && hero.x === pad.x && hero.y === pad.y && !S.teleportCooldown) {
          if (getMapRevealPercent() >= 0.51) {
            openTeleportSectorConfirm();
          } else {
            spawnDmgNumber(pad.x, pad.y, 'ERR: MAP < 51%', '#664433', 14, 'normal');
          }
        }
      });
    } else {
      // If hero steps off the pad while confirm is open, cancel it
      const onPad = hero && S.teleports && S.teleports.some(pad => hero.x === pad.x && hero.y === pad.y);
      if (!onPad) {
        S.pendingTeleportSector = false;
        setTeleportConfirmVisible(false);
      }
    }
    if (S.teleportCooldown > 0) S.teleportCooldown--;
    if (S.energy <= 0 && !S.winner && !S.pendingGameover) {
      S.energyDepleted = true; S.winner = 1; S.pendingGameover = true;
      S.runCards = []; // Temporary card bonuses lost on death
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
        document.querySelectorAll('#hub-overlay .upgrade-card').forEach(c => c.classList.add('collapsed'));
        BGM.start('hub');
      }, 2800);
    }


    S.loot && S.loot.forEach(l => {
      if (!l.collected) {
        if (l.type === 'lockedBox') return; // shoot to crack — no auto-collect
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
          } else if (l.type === 'goldbag') {
            const gain = l.val || 3;
            addToInventory('goldbag', null, gain);
            updateInventoryUI();
            spawnPickupFX(l.x, l.y, '#ffcc00');
            spawnDmgNumber(l.x, l.y, `+${gain} $ BAG`, '#ffee00', 16, 'crit');
            SFX.play(880, 0.12, 0.08, 'sine', 200);
            logEvent(`+${gain} $ Bag collected`, 'loot');
          } else if (l.type === 'ronke') {
            addToInventory('ronke', null, 1);
            if (S.inventoryOpen) updateInventoryUI();
            spawnPickupFX(l.x, l.y, '#44aaff');
          } else if (l.type === 'gem') {
            const gemGain = 15;
            const _oldE = S.energy || 0;
            S.energy = Math.min(ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0), _oldE + gemGain);
            animateEnergyGain(_oldE, S.energy);
            addToInventory('gem', null, 1);
            if (S.inventoryOpen) updateInventoryUI();
            logEvent(`+${gemGain}⚡ PIXEL collected`, 'loot');
            spawnPickupFX(l.x, l.y, '#44ff66');
            spawnDmgNumber(l.x, l.y, `+${gemGain}⚡`, '#44ff88', 16, 'crit');
          } else {
            // unknown loot type — ignore
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
        // noVisual: hero bullet ghosts still reveal fog but don't glow visually
        S.lightGhosts.push({ x: b.x, y: b.y, bornTick: S.tick, fadeBorn: null, fadeDur: ANIM_MS * 2, noVisual: (b.owner === 0 && b.gunBullet) });
      }
    });
  }
  advanceLasers();
  queuePassiveNpcDeathRewards();
  ammoRegen();
  checkWin();
  autoSelectAlive();
  BGM.updateState();

  // Decrement freeze after contact damage has already been checked
  S.units.forEach(u => {
    if (u.team === 1 && (u.frozenTurns || 0) > 0) {
      u.frozenTurns--;
      if (u.frozenTurns === 0) u.hacked = false;
    }
  });

  // Meat drop pickup
  if (S.meatDrops && S.meatDrops.length) {
    const _hero = S.units.find(u => u.team === 0 && u.alive);
    if (_hero) {
      S.meatDrops.forEach(m => {
        if (m.collected || m.x !== _hero.x || m.y !== _hero.y) return;
        m.collected = true;
        const _gain = 10;
        const _oldE = S.energy || 0;
        S.energy = Math.min(ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0), _oldE + _gain);
        animateEnergyGain(_oldE, S.energy);
        logEvent(`+${_gain}⚡ MEAT`, 'loot');
        spawnPickupFX(m.x, m.y, '#ff6633');
        spawnDmgNumber(m.x, m.y, `+${_gain}⚡`, '#ff8844', 16, 'crit');
        SFX.pickup();
      });
      S.meatDrops = S.meatDrops.filter(m => !m.collected);
    }
  }

  tickStart = performance.now();
  S.animT = 0;
  updateHUD();
  setTimeStatus('active');
}

function applySingleAction(team, a) {
    if (!a) return;
    const unit = S.units.find(u => u.id === a.unitId);
    if (!unit || !unit.alive) return;

    if (a.t === 'jump') return; // already applied in executeJump
    if (a.t === 'skullatk') {
      // Melee attack: play swing anim, deal instant damage to hero if still adjacent
      unit.swingStart = performance.now();
      unit.facing = { dx: Math.sign(a.targetX - unit.x) || unit.facing?.dx || -1, dy: 0 };
      const _hero = S.units.find(u => u.team === 0 && u.alive && u.x === a.targetX && u.y === a.targetY);
      if (_hero) {
        const _dmg = 3;
        S.energy = Math.max(0, S.energy - heroDmg(_dmg));
        spawnHit(_hero.x, _hero.y, '#e8d8c0', 26);
        spawnDmgNumber(_hero.x, _hero.y, `-${heroDmg(_dmg)}⚡`, '#e8c880', 18, 'crit');
        S.shake = Math.max(S.shake || 0, 10);
        SFX.heroHit();
        spawnMeleeEffect(unit.x, unit.y, Math.sign(a.targetX - unit.x), Math.sign(a.targetY - unit.y), '#e8d8c0');
        logEvent(`SKULL STRIKE: Hero took ${heroDmg(_dmg)} DMG!`, 'dmg');
      }
      return;
    }
    if (a.t === 'skullguard') {
      // Enter guard stance — will block next incoming bullet
      unit.guardStart = performance.now();
      return;
    }
    if (a.t === 'birdatk') {
      // Blue bird melee peck — quick, light damage
      unit.swingStart = performance.now();
      unit.facing = { dx: Math.sign(a.targetX - unit.x) || unit.facing?.dx || -1, dy: 0 };
      const _hero = S.units.find(u => u.team === 0 && u.alive && u.x === a.targetX && u.y === a.targetY);
      if (_hero) {
        const _dmg = 2;
        S.energy = Math.max(0, S.energy - heroDmg(_dmg));
        spawnHit(_hero.x, _hero.y, '#4488ff', 20);
        spawnDmgNumber(_hero.x, _hero.y, `-${heroDmg(_dmg)}⚡`, '#88bbff', 16, 'crit');
        S.shake = Math.max(S.shake || 0, 6);
        SFX.heroHit();
        spawnMeleeEffect(unit.x, unit.y, Math.sign(a.targetX - unit.x), Math.sign(a.targetY - unit.y), '#4488ff');
        logEvent(`BIRD PECK: Hero took ${heroDmg(_dmg)} DMG!`, 'dmg');
      }
      return;
    }
    if (a.t === 'trollsmash') {
      unit.swingStart = performance.now();
      unit.facing = { dx: Math.sign(a.targetX - unit.x) || unit.facing?.dx || -1, dy: 0 };
      const _hero = S.units.find(u => u.team === 0 && u.alive && u.x === a.targetX && u.y === a.targetY);
      if (_hero) {
        const _dmg = 7;
        S.energy = Math.max(0, S.energy - heroDmg(_dmg));
        spawnHit(_hero.x, _hero.y, '#6f8f43', 30);
        spawnDmgNumber(_hero.x, _hero.y, `-${heroDmg(_dmg)}⚡`, '#9fbf5c', 20, 'crit');
        S.shake = Math.max(S.shake || 0, 12);
        SFX.heroHit();
        spawnMeleeEffect(unit.x, unit.y, Math.sign(a.targetX - unit.x), Math.sign(a.targetY - unit.y), '#6f8f43');
        logEvent(`TROLL SMASH: Hero took ${heroDmg(_dmg)} DMG!`, 'dmg');
      }
      return;
    }
    if (a.t === 'minoatk') {
      unit.swingStart = performance.now();
      unit.facing = { dx: Math.sign(a.targetX - unit.x) || unit.facing?.dx || -1, dy: 0 };
      // Trigger damage when 4 frames remain (frameCount - 4)
      const _hitDelay = ((minotaurAnimSheets.attack.frameCount - 4) / MINOTAUR_ANIM_FPS.attack) * 1000;
      const _unitId = unit.id;
      const _atkDx = Math.sign(a.targetX - unit.x);
      const _atkDy = Math.sign(a.targetY - unit.y);
      setTimeout(() => {
        const _u = S.units && S.units.find(u => u.id === _unitId && u.alive);
        if (!_u) return;
        const _hero = S.units.find(u => u.team === 0 && u.alive && (
          (u.x === a.targetX && u.y === a.targetY) ||
          (Math.abs(u.x - _u.x) + Math.abs(u.y - _u.y) <= 1)
        ));
        if (_hero) {
          const _dmg = 5;
          S.energy = Math.max(0, S.energy - heroDmg(_dmg));
          spawnHit(_hero.x, _hero.y, '#8b2020', 32);
          spawnDmgNumber(_hero.x, _hero.y, `-${heroDmg(_dmg)}⚡`, '#cc4444', 22, 'crit');
          S.shake = Math.max(S.shake || 0, 14);
          SFX.heroHit();
          spawnMeleeEffect(_u.x, _u.y, _atkDx || (_u.facing?.dx ?? -1), _atkDy, '#8b2020');
          logEvent(`MINOTAUR GORE: Hero took ${heroDmg(_dmg)} DMG!`, 'dmg');
        }
      }, _hitDelay);
      return;
    }
    if (a.t === 'minoguard') {
      unit.guardStart = performance.now();
      return;
    }
    if (a.t === 'ronkeatk') {
      unit.swingStart = performance.now();
      unit.facing = { dx: Math.sign(a.targetX - unit.x) || unit.facing?.dx || -1, dy: 0 };
      const _hero = S.units.find(u => u.team === 0 && u.alive && (
        (u.x === a.targetX && u.y === a.targetY) ||
        (Math.abs(u.x - unit.x) + Math.abs(u.y - unit.y) <= 1)
      ));
      if (_hero) {
        const _dmg = 6;
        S.energy = Math.max(0, S.energy - heroDmg(_dmg));
        spawnHit(_hero.x, _hero.y, '#3355cc', 34);
        spawnDmgNumber(_hero.x, _hero.y, `-${heroDmg(_dmg)}⚡`, '#6688ff', 22, 'crit');
        S.shake = Math.max(S.shake || 0, 16);
        SFX.heroHit();
        spawnMeleeEffect(unit.x, unit.y, Math.sign(a.targetX - unit.x), Math.sign(a.targetY - unit.y), '#3355cc');
        logEvent(`RONKE SMASH: Hero took ${heroDmg(_dmg)} DMG!`, 'dmg');
      }
      return;
    }
    if (a.t === 'ronke2cast') {
      unit.swingStart = performance.now();
      unit.facing = { dx: Math.sign(a.targetX - unit.x) || unit.facing?.dx || -1, dy: 0 };
      unit.ronke2CastCd = performance.now() + 3000; // 3s cooldown
      const _fromX = unit.x, _fromY = unit.y;
      const _toX = a.targetX, _toY = a.targetY;
      const _faceDx = unit.facing.dx;
      // Spawn orb after cast animation peaks (~600ms = frame 6 of 8 at 10fps)
      setTimeout(() => {
        if (S && S.units) spawnRonke2Projectile(_fromX, _fromY, _toX, _toY, _faceDx);
      }, 600);
      return;
    }
    if (a.t === 'stabbythrow') {
      unit.stabbyThrowStart = performance.now(); // separate from swingStart — avoids melee anim clash
      unit.facing = { dx: Math.sign(a.targetX - unit.x) || unit.facing?.dx || -1, dy: 0 };
      unit.stabbyCd = performance.now() + 2500;
      const _fx = unit.x, _fy = unit.y, _tx = a.targetX, _ty = a.targetY, _fd = unit.facing.dx;
      // Harpoon tag = frame 22 in aseprite = right after Throw ends (8f × 100ms = 800ms)
      setTimeout(() => { if (S && S.units) spawnHarpoon(_fx, _fy, _tx, _ty, _fd); }, 800);
      return;
    }
    if (a.t === 'shamancast') {
      // Trigger attack animation on the shaman unit
      unit.swingStart = performance.now();
      unit.shamanAttackCd = performance.now() + 2800; // 2.8s cooldown between casts
      const _fromX = unit.x, _fromY = unit.y;
      const _toX = a.targetX, _toY = a.targetY;
      // Launch projectile after wind-up (frame ~6 of 10, ~430ms at 14fps)
      setTimeout(() => {
        if (S && S.units) spawnShamanProjectile(_fromX, _fromY, _toX, _toY);
      }, 430);
      return;
    }
    if (a.t === 'move') {
      const nx = unit.x + a.dx, ny = unit.y + a.dy;
      if (!isWall(nx, ny) && !S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) {

        if (gameMode === 'adventure' && unit.team === 0) {
          if (S.footsteps) {
            S.footsteps.push({ x: unit.x, y: unit.y, alpha: 1.0 });
            if (S.footsteps.length > 12) S.footsteps.shift();
          }
          const _cleared = S.fullMapRevealed && !S.units.some(u => isHostileAdventureEnemy(u));
          if (!_cleared) {
            S.energy = Math.max(0, S.energy - 1);
            spawnDmgNumber(unit.x, unit.y, '-1\u26A1', '#00f5ff', 12, 'normal');
            S.nanoSteps = (S.nanoSteps || 0) + 1;
            const _nLvl = Profile.upgrades?.nanoLevel || 0;
            if (_nLvl >= 1 && S.nanoSteps % getNanoHealInterval(_nLvl) === 0) {
              const effectiveMax = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);
              if (S.energy < effectiveMax) {
                S.energy = Math.min(effectiveMax, S.energy + _nLvl);
                spawnDmgNumber(unit.x, unit.y, `+${_nLvl}\u26A1`, '#00ff88', 14, 'normal');
                SFX.nanoHeal();
                if (S.energy >= effectiveMax) {
                  S.reachedMaxEnergy = true;
                  checkAchievements();
                }
              }
            }
            // Card: NANO REGEN — +1 energy every 10 steps
            if ((S.runCards || []).includes('nano_regen') && S.nanoSteps % 10 === 0) {
              const _effMax = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);
              if (S.energy < _effMax) {
                S.energy = Math.min(_effMax, S.energy + 1);
                spawnDmgNumber(unit.x, unit.y, '+1\u26A1', '#88ff44', 12, 'normal');
              }
            }
          }
        }
        unit.x = nx; unit.y = ny;
        // Check if enemy walked into an active Ronke shield cell
        if (team === 1 && S.ronkeShield?.active) {
          const _rHero = S.units.find(u => u.team === 0 && u.alive);
          if (_rHero) {
            _ronkeActiveShields().forEach(({ cell, idx }) => {
              if (unit.alive && unit.x === _rHero.x + cell.dx && unit.y === _rHero.y + cell.dy) {
                unit.hp = (unit.hp || 1) - 1;
                unit.infected = performance.now(); unit.poisoned = { movesLeft: 5, timesLeft: 5 };
                spawnHit(unit.x, unit.y, '#00ff66', 28);
                spawnMeleeEffect(unit.x, unit.y, -cell.dx, -cell.dy, '#00ff66');
                S.shake = Math.max(S.shake || 0, 4);
                SFX.play(320, 0.12, 0.22, 'sine');
                SFX.play(160, 0.08, 0.30, 'sawtooth');
                const _iepx = (unit.x + 0.5) * CELL, _iepy = (unit.y + 0.5) * CELL;
                const _ispx = (_rHero.x + cell.dx + 0.5) * CELL, _ispy = (_rHero.y + cell.dy + 0.5) * CELL;
                S.ronkeInfect = {
                  bornAt: performance.now(), spx: _ispx, spy: _ispy, epx: _iepx, epy: _iepy,
                  enemy: unit,
                  dmgNum: { gx: unit.x, gy: unit.y },
                  tendrils: (function() {
                    const _r = [];
                    for (let _i = 0; _i < 10; _i++) {
                      const _a = (_i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                      const _l = CELL * (0.35 + Math.random() * 0.45);
                      const _s = 3 + Math.floor(Math.random() * 3);
                      const _pts = [{ x: _iepx, y: _iepy }];
                      for (let _j = 1; _j <= _s; _j++) {
                        _pts.push({ x: _iepx + Math.cos(_a)*_l*(_j/_s) + (Math.random()-0.5)*CELL*0.18, y: _iepy + Math.sin(_a)*_l*(_j/_s) + (Math.random()-0.5)*CELL*0.18 });
                      }
                      _r.push(_pts);
                    }
                    return _r;
                  })(),
                };
                _ronkeShatterPair(idx, _rHero);
                if (unit.hp <= 0) {
                  unit.alive = false; unit.deathT = 1;
                  spawnDeath(unit.x, unit.y, unit.color);
                  S.kills = (S.kills || 0) + 1; trackKill();
                  if (!Profile.stats) Profile.stats = { totalKills: 0 };
                  Profile.stats.totalKills = (Profile.stats.totalKills || 0) + 1;
                  saveProfile(); _updateKillsDisplay();
                }
              }
            });
          }
        }
        // Tutorial: move trigger
        if (tutorialActive && team === 0 && TUTORIAL_STEPS[tutorialStepIdx]?.trigger === 'move') {
          advanceTutorial();
        }
      }
    } else {
      // Block shooting when map is fully revealed and no enemies
      if (gameMode === 'adventure' && team === 0) {
        const _cleared = S.fullMapRevealed && !S.units.some(u => isHostileAdventureEnemy(u));
        if (_cleared) return;
      }
      const sd = (team === 0 && unit.aimDir) ? unit.aimDir : unit.facing;
      const wep = getCurrentWeapon(unit);
      stats.shots[team]++;
      // Tutorial: shoot trigger
      if (tutorialActive && team === 0 && TUTORIAL_STEPS[tutorialStepIdx]?.trigger === 'shoot') {
        advanceTutorial();
      }
      unit.shootFlash = 1;
      if (unit.team === 0 && gameMode === 'adventure') { S.heroShootLock = true; S.heroShootLockStart = performance.now(); }
      if (unit.team === 0) unit.swingStart = performance.now();
      if (unit.utype === 'boss01') unit.boss01SpinStart = performance.now();

      spawnMuzzle(unit, sd);


      let nrgObj = null;
      if (gameMode === 'adventure' && team === 0 && wep !== 'hack' && wep !== 'ronke') {
        let nrgCost = 2;
        if (wep === 'laser') nrgCost = 7;
        if (wep === 'heavy' || wep === 'shotgun') nrgCost = 4;
        // Free shot check: every 10/9 shots, 70% chance next shot is free
        const _fsLvl = Profile.upgrades?.freeShotLevel || 0;
        const _fsInterval = _fsLvl >= 5 ? 6 : _fsLvl >= 4 ? 7 : _fsLvl >= 3 ? 8 : _fsLvl >= 2 ? 9 : 10;
        const _atZero = _fsLvl >= 1 && (S.shotsUntilFree ?? _fsInterval) === 0;
        const _isFree = _atZero && Math.random() < 0.70;
        if (_fsLvl >= 1) {
          if (_atZero) { S.shotsUntilFree = _fsInterval; }
          else { S.shotsUntilFree = Math.max(0, (S.shotsUntilFree ?? _fsInterval) - 1); }
        }
        if (_isFree) {
          spawnDmgNumber(unit.x, unit.y, 'FREE!', '#ffcc00', 16, 'crit');
          SFX.play(1200, 0.08, 0.05, 'square');
        } else {
          S.energy = Math.max(0, S.energy - nrgCost);
          spawnDmgNumber(unit.x, unit.y, `-${nrgCost}\u26A1`, '#00f5ff', 14, 'normal');
        }
      }

      if (wep === 'laser') {
        SFX.laser();
        unit.laserAmmo--;
        unit.laserShotAt = performance.now();
        const cells = laserCells(unit.x, unit.y, sd.dx, sd.dy);
        S.lasers.push({
          id: Math.random(), owner: team, ox: unit.x, oy: unit.y,
          dx: sd.dx, dy: sd.dy, cells, chargeLeft: gameMode === 'adventure' ? 1 : 2, color: unit.color, active: true
        });
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
      } else if (wep === 'hack') {
        const hasHackAmmo = (S.hackAmmo || 0) > 0;
        if (!hasHackAmmo && S.energy < 10) {
          spawnDmgNumber(unit.x, unit.y, 'NO\u26A1 HACK', '#ff4444', 12, 'normal');
          return;
        }
        SFX.hack();
        if (hasHackAmmo) {
          S.hackAmmo = Math.max(0, (S.hackAmmo || 0) - 1);
        } else {
          S.energy = Math.max(0, S.energy - 10);
          spawnDmgNumber(unit.x, unit.y, '-10\u26A1', '#00f5ff', 14, 'normal');
          updateEnergyHud();
        }
        updateHackSlot();
        const bx = unit.x + sd.dx, by = unit.y + sd.dy;
        const b = mkBullet(team, bx, by, unit.x, unit.y, sd.dx, sd.dy, '#00ffcc');
        b.hackBullet = true;
        if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS || isWall(bx, by)) b.active = false;
        S.bullets.push(b);
      } else if (wep === 'ronke') {
        const ronkeSlot = S.inventory?.find(s => s && s.type === 'ronke');
        const ronkeCount = ronkeSlot?.qty || 0;
        if (ronkeCount <= 0) {
          if (!S.ronkeNoAmmoWarned) {
            S.ronkeNoAmmoWarned = true;
            spawnDmgNumber(unit.x, unit.y, 'NO RONKE', '#ff4444', 12, 'normal');
            return;
          }
          // fallback: costs 1 energy, no shot
          if ((S.energy || 0) < 1) {
            spawnDmgNumber(unit.x, unit.y, 'NO\u26A1', '#ff4444', 12, 'normal');
            return;
          }
          S.energy = Math.max(0, S.energy - 1);
          spawnDmgNumber(unit.x, unit.y, '-1\u26A1', '#44aaff', 12, 'normal');
          updateEnergyHud();
          return;
        } else {
          S.ronkeNoAmmoWarned = false;
          ronkeSlot.qty--;
          if (ronkeSlot.qty <= 0) {
            const ri = S.inventory.indexOf(ronkeSlot);
            if (ri >= 0) S.inventory[ri] = null;
          }
          Profile.inventory = S.inventory.map(x => x ? { ...x } : null);
          if (S.inventoryOpen) updateInventoryUI();
          updateSkillBar(team);
        }
        SFX.laser();
        trackRonkeLaser();
        const cells = laserCells(unit.x, unit.y, sd.dx, sd.dy);
        S.lasers.push({
          id: Math.random(), owner: team, ox: unit.x, oy: unit.y,
          dx: sd.dx, dy: sd.dy, cells, chargeLeft: gameMode === 'adventure' ? 1 : 2, color: '#44aaff', active: true
        });
      } else {
        SFX.shoot();
        if (!(gameMode === 'adventure' && team === 0)) unit.ammo--;
        if (gameMode === 'adventure' && team === 0) {
          const _bx = unit.x, _by = unit.y, _dx = sd.dx, _dy = sd.dy;
          setTimeout(() => { if (S) spawnHeroBullet(_bx, _by, _dx, _dy, unit); }, 800);
        } else {
          const bx = unit.x + sd.dx, by = unit.y + sd.dy;
          const b = mkBullet(team, bx, by, unit.x, unit.y, sd.dx, sd.dy, unit.color, 1, 0);
          b.gunBullet = true;
          if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS || isWall(bx, by)) b.active = false;
          S.bullets.push(b);
        }
      }
    }
    // Ronke Stronke: advance 1 cell every 3 actions (both shields together)
    if (team === 0 && S.ronkeShield?.active) {
      // PRE-ROTATION: check current shield positions BEFORE rotating (catches enemies
      // already standing on a shield cell when the hero shoots or moves toward them)
      [0, 4].forEach((off, idx) => {
        if (!S.ronkeShield.alive[idx] || !S.ronkeShield.active) return;
        const _preSc = _SHIELD_CELLS[(S.ronkeShield.step + off) % 8];
        const _preEx = unit.x + _preSc.dx, _preEy = unit.y + _preSc.dy;
        if (_preEx < 0 || _preEx >= COLS || _preEy < 0 || _preEy >= ROWS) return;
        const _preEnemy = S.units.find(u => u.team !== 0 && u.alive && u.x === _preEx && u.y === _preEy);
        if (_preEnemy) {
          _preEnemy.hp = (_preEnemy.hp || 1) - 1;
          _preEnemy.infected = performance.now(); _preEnemy.poisoned = { movesLeft: 5, timesLeft: 5 };
          spawnHit(_preEnemy.x, _preEnemy.y, '#00ff66', 28);
          spawnMeleeEffect(_preEnemy.x, _preEnemy.y, -_preSc.dx, -_preSc.dy, '#00ff66');
          S.shake = Math.max(S.shake || 0, 4);
          SFX.play(320, 0.12, 0.22, 'sine');
          SFX.play(160, 0.08, 0.30, 'sawtooth');
          const _iepx = (_preEnemy.x + 0.5) * CELL, _iepy = (_preEnemy.y + 0.5) * CELL;
          S.ronkeInfect = { bornAt: performance.now(), spx: (_preEx + 0.5) * CELL, spy: (_preEy + 0.5) * CELL, epx: _iepx, epy: _iepy,
            enemy: _preEnemy,
            dmgNum: { gx: _preEnemy.x, gy: _preEnemy.y },
            tendrils: (function() { const _r = []; for (let _i = 0; _i < 10; _i++) { const _a = (_i/10)*Math.PI*2+(Math.random()-0.5)*0.4, _l = CELL*(0.35+Math.random()*0.45), _s = 3+Math.floor(Math.random()*3), _pts = [{x:_iepx,y:_iepy}]; for (let _j=1;_j<=_s;_j++) _pts.push({x:_iepx+Math.cos(_a)*_l*(_j/_s)+(Math.random()-0.5)*CELL*0.18,y:_iepy+Math.sin(_a)*_l*(_j/_s)+(Math.random()-0.5)*CELL*0.18}); _r.push(_pts); } return _r; })() };
          [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}].forEach(_sd => {
            const _sx2=_preEnemy.x+_sd.dx, _sy2=_preEnemy.y+_sd.dy;
            if (_sx2<0||_sx2>=COLS||_sy2<0||_sy2>=ROWS) return;
            const _sp=S.units.find(u=>u.team!==0&&u.alive&&u.x===_sx2&&u.y===_sy2); if(!_sp) return;
            _sp.hp-=1; _sp.hitFlash=1; spawnDmgNumber(_sp.x,_sp.y,'-1','#00ff66',14,'crit');
            if(_sp.hp<=0){_sp.alive=false;_sp.deathT=1;spawnDeath(_sp.x,_sp.y,_sp.color);S.kills=(S.kills||0)+1;trackKill();if(!Profile.stats)Profile.stats={totalKills:0};Profile.stats.totalKills=(Profile.stats.totalKills||0)+1;saveProfile();_updateKillsDisplay();}
          });
          if (_preEnemy.hp <= 0) { _preEnemy.alive=false; _preEnemy.deathT=1; spawnDeath(_preEnemy.x,_preEnemy.y,_preEnemy.color); S.kills=(S.kills||0)+1; trackKill(); if(!Profile.stats)Profile.stats={totalKills:0}; Profile.stats.totalKills=(Profile.stats.totalKills||0)+1; saveProfile(); _updateKillsDisplay(); }
          _ronkeShatterPair(idx, unit);
        }
      });
      if (!S.ronkeShield.active) { S.ronkeShield.movesLeft--; updateRonkeShieldSlot(); return; }

      S.ronkeShield.prevStep = S.ronkeShield.step;
      // Rotation direction based on movement: right/down → left (−1), left/up → right (+1)
      const _rotDir = (a.dx === 1 || a.dy === 1) ? -1 : 1;
      S.ronkeShield.step = ((S.ronkeShield.step + _rotDir) % 8 + 8) % 8;
      S.ronkeShield.movesLeft--;

      // Check each shield independently (post-rotation: new position)
      const offsets = [0, 4];
      offsets.forEach((off, idx) => {
        if (!S.ronkeShield.alive[idx]) return;
        const _sc = _ronkeShieldCell(off);
        const _sx = unit.x + _sc.dx, _sy = unit.y + _sc.dy;

        // Rule 3: wall → destroy this shield (and break the pair)
        if (_sx < 0 || _sx >= COLS || _sy < 0 || _sy >= ROWS || isWall(_sx, _sy)) {
          spawnHit(_sx, _sy, '#44aaff', 18);
          SFX.play(180, 0.18, 0.15, 'square');
          _ronkeShatterPair(idx, unit);
        } else {
          // Rule 1: enemy → dmg and destroy this shield
          const _enemy = S.units.find(u => u.team !== 0 && u.alive && u.x === _sx && u.y === _sy);
          if (_enemy) {
            _enemy.hp = (_enemy.hp || 1) - 1;
            _enemy.infected = performance.now(); _enemy.poisoned = { movesLeft: 5, timesLeft: 5 };
            spawnHit(_enemy.x, _enemy.y, '#00ff66', 28);
            spawnMeleeEffect(_enemy.x, _enemy.y, -_sc.dx, -_sc.dy, '#00ff66');
            S.shake = Math.max(S.shake || 0, 4);
            SFX.play(320, 0.12, 0.22, 'sine');
            SFX.play(160, 0.08, 0.30, 'sawtooth');
            // Virus infection animation — orb latches, tendrils spread, explosion burst
            const _infSpx = (_sx + 0.5) * CELL, _infSpy = (_sy + 0.5) * CELL;
            const _infEpx = (_enemy.x + 0.5) * CELL, _infEpy = (_enemy.y + 0.5) * CELL;
            const _genTendrils = (n) => {
              const result = [];
              for (let _ti = 0; _ti < n; _ti++) {
                const angle = (_ti / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                const len = CELL * (0.35 + Math.random() * 0.45);
                const segs = 3 + Math.floor(Math.random() * 3);
                const pts = [{ x: _infEpx, y: _infEpy }];
                for (let si = 1; si <= segs; si++) {
                  const f = si / segs;
                  pts.push({
                    x: _infEpx + Math.cos(angle) * len * f + (Math.random() - 0.5) * CELL * 0.18,
                    y: _infEpy + Math.sin(angle) * len * f + (Math.random() - 0.5) * CELL * 0.18,
                  });
                }
                result.push(pts);
              }
              return result;
            };
            S.ronkeInfect = {
              bornAt: performance.now(),
              spx: _infSpx, spy: _infSpy,
              epx: _infEpx, epy: _infEpy,
              enemy: _enemy,
              dmgNum: { gx: _enemy.x, gy: _enemy.y },
              tendrils: _genTendrils(10),
            };
            // AoE splash to 4 adjacent enemies (explosion damage)
            [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}].forEach(_sd => {
              const _sx2 = _enemy.x + _sd.dx, _sy2 = _enemy.y + _sd.dy;
              if (_sx2 < 0 || _sx2 >= COLS || _sy2 < 0 || _sy2 >= ROWS) return;
              const _splash = S.units.find(u => u.team !== 0 && u.alive && u.x === _sx2 && u.y === _sy2);
              if (!_splash) return;
              _splash.hp -= 1;
              _splash.hitFlash = 1;
              spawnDmgNumber(_splash.x, _splash.y, '-1', '#00ff66', 14, 'crit');
              if (_splash.hp <= 0) {
                _splash.alive = false; _splash.deathT = 1;
                spawnDeath(_splash.x, _splash.y, _splash.color);
                S.kills = (S.kills || 0) + 1; trackKill();
                if (!Profile.stats) Profile.stats = { totalKills: 0 };
                Profile.stats.totalKills = (Profile.stats.totalKills || 0) + 1;
                saveProfile(); _updateKillsDisplay();
              }
            });
            if (_enemy.hp <= 0) {
              _enemy.alive = false; _enemy.deathT = 1;
              spawnDeath(_enemy.x, _enemy.y, _enemy.color);
              S.kills = (S.kills || 0) + 1; trackKill();
              if (!Profile.stats) Profile.stats = { totalKills: 0 };
              Profile.stats.totalKills = (Profile.stats.totalKills || 0) + 1;
              saveProfile(); _updateKillsDisplay();
            }
            _ronkeShatterPair(idx, unit);
          }
        }
      });

      // Deactivate when both shields gone or movesLeft = 0
      if (!S.ronkeShield.alive[0] && !S.ronkeShield.alive[1]) {
        S.ronkeShield.active = false;
      }
      if (S.ronkeShield.active && S.ronkeShield.movesLeft <= 0) {
        S.ronkeShield.active = false;
        // Launch death orbs — tick-based movement like bullets
        const _dHero = S.units.find(u => u.team === 0 && u.alive);
        if (_dHero) {
          const _orbs = [0, 4].map((off, idx) => {
            if (!S.ronkeShield.alive[idx]) return null;
            const _sc = _SHIELD_CELLS[(S.ronkeShield.step + off) % 8];
            return {
              gx: _dHero.x + _sc.dx, gy: _dHero.y + _sc.dy, // current grid pos
              px: _dHero.x + _sc.dx, py: _dHero.y + _sc.dy, // prev grid pos (for animT lerp)
              dx: _sc.dx, dy: _sc.dy,
              alive: true,
            };
          }).filter(Boolean);
          S.ronkeDeathAnim = { phase: 'fly', orbs: _orbs };
        }
      }
      updateRonkeShieldSlot();
    }
}

function applyActions() {
  applySingleAction(0, S.pending[0]);

  const enemyBatch = Array.isArray(S.pendingEnemyBatch) && S.pendingEnemyBatch.length > 0
    ? S.pendingEnemyBatch
    : (S.pending[1] ? [S.pending[1]] : []);

  enemyBatch.forEach(action => applySingleAction(1, action));
}

function moveBullets() {
  S.bullets.forEach(b => {
    if (!b.active || b.newThisTick) return;
    b.px = b.x; b.py = b.y;

    const nx = b.px + b.dx, ny = b.py + b.dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) {
      b.active = false;
      spawnHit(nx, ny, b.color, 4);
      if (gameMode === 'adventure') spawnWallDust(nx, ny, b.dx, b.dy);
    } else {
      b.x = nx; b.y = ny;
    }

    b.cellsTraveled++;
    b.age++;
    if (b.active && b.maxRange > 0 && b.cellsTraveled >= b.maxRange) {
      b.active = false;
    }
  });
  S.bullets.forEach(b => { b.newThisTick = false; });

  // Death orbs move 1 cell per tick like bullets
  if (S.ronkeDeathAnim) {
    let anyAlive = false;
    S.ronkeDeathAnim.orbs.forEach(o => {
      if (!o.alive) return;
      o.px = o.gx; o.py = o.gy;
      const nx = o.gx + o.dx, ny = o.gy + o.dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) {
        o.alive = false;
        spawnHit(nx, ny, '#00f5ff', 12);
      } else {
        const hit = S.units.find(u => u.alive && u.team !== 0 && u.x === nx && u.y === ny);
        if (hit) { hit.hp -= 1; hit.hitFlash = 1; o.alive = false; spawnHit(nx, ny, '#00f5ff', 10); }
        else { o.gx = nx; o.gy = ny; }
      }
      if (o.alive) anyAlive = true;
    });
    if (!anyAlive) S.ronkeDeathAnim = null;
  }
}

function isUnitHiddenInBush(unit) {
  if (!unit || !S.decorations) return false;
  const decId = S.decorations[`${unit.y},${unit.x}`];
  return typeof decId === 'string' && decId.startsWith('bush');
}

function isHostileAdventureEnemy(unit) {
  return !!(unit && unit.team === 1 && unit.alive && unit.utype !== 'sheep');
}

function isPassiveBuffNpc(unit) {
  return !!(unit && unit.utype === 'sheep');
}

function triggerHitRecovery(unit) {
  if (!unit) return;
  if (unit.utype === 'troll') unit.recoveryStart = performance.now();
  if (unit.utype === 'minotaur') unit.guardStart = performance.now();
}

function queuePassiveNpcDeathRewards() {
  if (gameMode !== 'adventure' || !Array.isArray(S.units)) return;
  if (!Array.isArray(S.pendingPassiveRewards)) S.pendingPassiveRewards = [];
  S.units.forEach((unit) => {
    if (!unit || unit.utype !== 'sheep' || unit.alive || unit.sheepRewardQueued) return;
    unit.sheepRewardQueued = true;
    S.pendingPassiveRewards.push({
      kind: 'sheep_energy',
      gx: unit.x,
      gy: unit.y,
      readyAt: performance.now() + (_DEAD_TOTAL * _DEAD_MS),
    });
  });
}

function processPendingPassiveRewards() {
  if (gameMode !== 'adventure' || !Array.isArray(S.pendingPassiveRewards) || S.pendingPassiveRewards.length === 0) return;

  const now = performance.now();
  for (let i = S.pendingPassiveRewards.length - 1; i >= 0; i--) {
    const reward = S.pendingPassiveRewards[i];
    if (!reward || reward.readyAt > now) continue;

    if (reward.kind === 'sheep_energy') {
      const energyGain = 5 + Math.floor(Math.random() * 6);
      const energyBefore = S.energy || 0;
      const effectiveMax = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);
      S.energy = Math.min(effectiveMax, energyBefore + energyGain);
      animateEnergyGain(energyBefore, S.energy);
      spawnDmgNumber(reward.gx, reward.gy, `+${energyGain}⚡`, '#b9e8a3', 18, 'crit');
      spawnHit(reward.gx, reward.gy, '#b9e8a3', 18);
      const wx = (reward.gx + 0.5) * CELL;
      const wy = (reward.gy + 0.5) * CELL;
      S.particles.push({ x: wx, y: wy, vx: 0, vy: 0, life: 1, decay: 0.04, r: CELL * 0.8, color: '#b9e8a3', type: 'ring' });
      for (let p = 0; p < 10; p++) {
        const a = (Math.PI * 2 * p) / 10 + Math.random() * 0.25;
        const s = (0.8 + Math.random() * 1.6) * CELL * 0.02;
        S.particles.push({
          x: wx, y: wy,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 1,
          decay: 0.03 + Math.random() * 0.02,
          r: 2 + Math.random() * 2,
          color: Math.random() < 0.25 ? '#ffffff' : '#b9e8a3',
          type: 'streak'
        });
      }
      logEvent(`SHEEP BUFF: +${energyGain} ENERGY`, 'loot');
      SFX.nanoHeal();
    }

    S.pendingPassiveRewards.splice(i, 1);
  }
}


function detectCollisions() {

  S.bullets.forEach(b => {
    if (!b.active) return;
    const moved = b.x !== b.px || b.y !== b.py;
    const midX = b.px + b.dx, midY = b.py + b.dy;
    const pathSteps = Math.max(Math.abs(b.x - b.px), Math.abs(b.y - b.py));
    S.units.forEach(u => {
      if (!u.alive || b.owner === u.team) return;
      // Check all cells along bullet path (supports multi-cell hero bullets)
      let hitPath = false;
      for (let _s = 1; _s <= pathSteps; _s++) {
        if (b.px + b.dx * _s === u.x && b.py + b.dy * _s === u.y) { hitPath = true; break; }
      }
      const hitFinal = hitPath || (b.x === u.x && b.y === u.y);
      const hitMid = moved && !hitPath && midX === u.x && midY === u.y;
      const hitPrev = b.x === u.px && b.y === u.py;
      const hitMidPrev = moved && midX === u.px && midY === u.py;
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
        // Hero bullet: explosion FX at hit position
        if (b.owner === 0 && b.gunBullet) {
          _heroBulletDeaths.push({ x: (u.x + 0.5) * CELL + 3, y: (u.y + 0.5) * CELL, born: performance.now() });
        }
        // Ronke Stronke: bullet hits a shield → destroy that shield, block bullet
        if (S.ronkeShield?.active && u.team === 0 && b.owner !== 0) {
          const alive = S.ronkeShield.alive ?? [true, true];
          const shields = _ronkeActiveShields();
          const hit = shields.find(s => u.x + s.cell.dx === b.x && u.y + s.cell.dy === b.y);
          // Block if bullet lands on any shield cell OR hits the hero directly
          const blocked = hit || shields.length > 0;
          if (blocked) {
            const so = hit ? hit.cell : shields[0].cell;
            const idx = hit ? hit.idx : shields[0].idx;
            _ronkeShatterPair(idx, u);
            updateRonkeShieldSlot();
            spawnHit(u.x + so.dx, u.y + so.dy, '#44aaff', 20);
            SFX.play(180, 0.18, 0.15, 'square');
            return;
          }
        }
        // Shield bot: block bullets from shield side (hack wave bypasses)
        if (!b.hackBullet && u.utype === 'shield' && u.shieldDir && u.team !== b.owner) {
          const dot = b.dx * u.shieldDir.dx + b.dy * u.shieldDir.dy;
          if (dot < 0) {
            spawnDmgNumber(u.x, u.y, 'BLOCKED', '#44aaff', 13, 'normal');
            spawnHit(u.x, u.y, '#44aaff', 10);
            return;
          }
        }
        // Ironbox: block bullets from anywhere except the front (hack wave bypasses)
        if (!b.hackBullet && u.utype === 'ironbox' && u.team !== b.owner) {
          if (b.dx !== -u.facing.dx || b.dy !== -u.facing.dy) {
            spawnDmgNumber(u.x, u.y, 'BLOCK', '#8899aa', 14, 'normal');
            spawnHit(u.x, u.y, '#8899aa', 12);
            SFX.play(150, 0.1, 0.1, 'square');
            return;
          }
        }
        // Skull: guard blocks the next bullet while guard animation is active
        if (!b.hackBullet && u.utype === 'skull' && u.team !== b.owner && u.guardStart) {
          const _guardDur = (skullAnimSheets.guard.frameCount / SKULL_ANIM_FPS.guard) * 1000;
          if (performance.now() - u.guardStart < _guardDur) {
            spawnDmgNumber(u.x, u.y, 'GUARDED', '#fffbe0', 14, 'normal');
            spawnHit(u.x, u.y, '#fffbe0', 14);
            SFX.play(200, 0.12, 0.12, 'square');
            u.guardStart = null; // consume guard
            return;
          }
        }

        // Hack wave: no damage, just 70% freeze
        if (b.hackBullet) {
          b.active = false;
          if (u.team !== 0) {
            spawnHit(u.x, u.y, '#00ffcc', 14);
            if (Math.random() < 0.70) {
              const _freezeTurns = 3 + (S.floorBuffs?.hackFreezeBonus || 0);
              u.frozenTurns = Math.max(u.frozenTurns || 0, _freezeTurns);
              u.hacked = true;
              SFX.hack();
              spawnDmgNumber(u.x, u.y, 'Hack', '#00ffcc', 15, 'crit');
            } else {
              SFX.hackFail();
              spawnDmgNumber(u.x, u.y, 'RESIST', '#ff4488', 12, 'normal');
            }
          }
        } else if (gameMode === 'adventure' && u.team === 0 && b.owner !== 0 && isUnitHiddenInBush(u) && Math.random() < 0.20) {
          logEvent('BUSH COVER blocked the shot!', 'loot');
          spawnDmgNumber(u.x, u.y, 'COVER', '#6ccf74', 13, 'miss');
          spawnHit(u.x, u.y, '#6ccf74', 5);
        } else if (Math.random() < (u.dodge !== undefined ? u.dodge : MISS_CHANCE)) {
          const isHero = gameMode === 'adventure' && u.team === 0;
          logEvent(isHero ? `EVADED attack!` : `Shot missed!`, isHero ? 'loot' : 'warn');
          spawnDmgNumber(u.x, u.y, 'MISS', '#88bbff', 13, 'miss');
          spawnHit(u.x, u.y, '#88bbff', 5);
        } else {
          const heavy = (b.power || 1) >= 2;
          const isCrit = Math.random() < getCritChance();
          const bulletHeroHit = gameMode === 'adventure' && u.team === 0;
          let baseDmg = 1;
          // Scale enemy bullet damage by floor in adventure mode
          if (bulletHeroHit && gameMode === 'adventure') {
            baseDmg = 1 + Math.floor((S.floor || 1) / 2);
          } else if (b.gunBullet && !bulletHeroHit) {
            const dist = (b.cellsTraveled || 0) + 1;
            if (dist >= 5) baseDmg = 4;
            else if (dist >= 4) baseDmg = 3;
            else if (dist >= 3) baseDmg = 2;
            else baseDmg = 1;
          }
          const dmg = isCrit ? baseDmg * 2 : baseDmg;
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
            triggerHitRecovery(u);
            noteBossBurstHit(u, b.owner);
            SFX.hit();
            if (gameMode === 'adventure') {
              logEvent(isCrit ? `CRIT [${getCombatLabel(u)}]: -${dmg} HP` : `HIT [${getCombatLabel(u)}]: -${dmg} HP`, isCrit ? 'crit' : 'info');
            }
            if (u.hp <= 0) {
              u.alive = false;
              spawnDeath(u.x, u.y, u.color);
              if (gameMode === 'adventure') {
                logEvent(`Target <span style="color:#ffffff">X</span> destroyed.`, 'warn');
                const _dx1 = u.x, _dy1 = u.y;
                if (!isPassiveBuffNpc(u)) {
                  setTimeout(() => { if (S && S.loot) { spawnRonkeDrop(_dx1, _dy1); } }, _DEAD_TOTAL * _DEAD_MS + 100);
                }
                S.kills = (S.kills || 0) + 1;
                trackKill();
                if (!Profile.stats) Profile.stats = { totalKills: 0 };
                Profile.stats.totalKills = (Profile.stats.totalKills || 0) + 1;
                saveProfile(); _updateKillsDisplay();
                checkAchievements();
                if (S.bloodStains) S.bloodStains.push(mkBloodStain(u.x, u.y));
                // BLOOD RUSH energy on kill
                const _brLvl = Profile.upgrades?.bloodRushLevel || 0;
                const _brBonus = S.floorBuffs?.bloodRushBonus || 0;
                if (_brLvl > 0 || _brBonus > 0) {
                  const _brBase = [0,1,2,3,4,5,6,8][_brLvl] || 0;
                  const _brGain = _brBase + _brBonus;
                  const _effectiveMax = ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0);
                  S.energy = Math.min(_effectiveMax, (S.energy || 0) + _brGain);
                  spawnDmgNumber(u.x, u.y, `+${_brGain}⚡`, '#44ff88', 13, 'normal');
                  updateEnergyHud();
                }
              }
            }
          }
        }
      }
    });
  });


  for (let i = 0; i < S.bullets.length; i++) {
    for (let j = i + 1; j < S.bullets.length; j++) {
      const a = S.bullets[i], b = S.bullets[j];
      if (!a.active || !b.active) continue;
      const aMoved = a.age > 0 && a.x !== a.px;
      const bMoved = b.age > 0 && b.x !== b.px;
      const bothOld = a.age > 0 && b.age > 0;
      const sameDir = a.dx * b.dx + a.dy * b.dy > 0;
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

          spawnBulletExplosion(a.x, a.y, a.color, b.color);
          S.shake = Math.max(S.shake, 14);
          a.active = false; b.active = false;
        }
      }
    }
  }


  const alive = S.units.filter(u => u.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      if (alive[i].x === alive[j].x && alive[i].y === alive[j].y) {
        alive[i].x = alive[i].px; alive[i].y = alive[i].py;
        alive[j].x = alive[j].px; alive[j].y = alive[j].py;
      }
    }
  }

  // Poison tick — infected enemies take 1 dmg every 5 moves, 5 times total
  S.units.forEach(u => {
    if (!u.alive || !u.poisoned) return;
    u.poisoned.movesLeft--;
    if (u.poisoned.movesLeft <= 0) {
      u.hp -= 1;
      u.hitFlash = 1;
      spawnDmgNumber(u.x, u.y, '-1 \u2623', '#00ff66', 16, 'crit');
      spawnHit(u.x, u.y, '#00ff66', 16);
      SFX.play(160, 0.18, 0.22, 'sawtooth', -80);
      SFX.play(320, 0.10, 0.12, 'sine');
      u.poisoned.timesLeft--;
      if (u.poisoned.timesLeft <= 0 || u.hp <= 0) {
        delete u.poisoned;
      } else {
        u.poisoned.movesLeft = 5;
      }
      if (u.hp <= 0) {
        u.alive = false; u.deathT = 1;
        spawnDeath(u.x, u.y, u.color);
        S.kills = (S.kills || 0) + 1; trackKill();
        if (!Profile.stats) Profile.stats = { totalKills: 0 };
        Profile.stats.totalKills = (Profile.stats.totalKills || 0) + 1;
        saveProfile(); _updateKillsDisplay();
      } else {
        triggerHitRecovery(u);
      }
    }
  });
}

function ammoRegen() {
  S.units.forEach(u => {
    if (!u.alive) return;
    if (u.ammo < u.maxAmmo) {
      const rate = u.team === 1 ? AMMO_REGEN * 2 : AMMO_REGEN;
      if (++u.ammoTick >= rate) { u.ammo++; u.ammoTick = 0; }
    } else { u.ammoTick = 0; }
    const laserCap = u.maxLaserAmmo || MAX_LASER;
    const laserRegen = u.utype === 'idol' ? 1 : LASER_REGEN;
    if (u.laserAmmo < laserCap) {
      if (++u.laserTick >= laserRegen) { u.laserAmmo++; u.laserTick = 0; }
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


function _updateKillsDisplay() {
  const el = document.getElementById('kills-val');
  if (el) el.textContent = Profile.stats?.totalKills || 0;
  _checkAllEnemiesCleared();
}

function _checkAllEnemiesCleared() {
  if (gameMode !== 'adventure') return;
  if (!S || S.winner || S._clearedTriggered) return;
  if (!S.totalEnemies || S.totalEnemies === 0) return;
  if (S.units && S.units.some(u => isHostileAdventureEnemy(u))) return;
  S._clearedTriggered = true;
  setTimeout(() => {
    SFX.teleport && SFX.teleport();
    Profile.cache = (Profile.cache || 0) + (S.bytes || 0);
    if (S.floor > (Profile.highestSector || 0)) Profile.highestSector = S.floor;
    Profile.inventory = (S.inventory || []).map(x => x ? { ...x } : null);
    saveProfile();
    checkAchievements();
    showCardPicker(() => {
      S.floor++;
      initAdventure();
      playCurrentLevelBGM();
      updateHUD();
      updateEnergyHud();
    });
  }, 800);
}

function spawnDmgNumber(gx, gy, text, color, size, type) {
  type = type || 'normal';
  const initScale = type === 'crit' ? 2.0 : type === 'miss' ? 1.1 : 1.4;


  if (type !== 'crit' && typeof text === 'string' && text.startsWith('-')) {

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
  while (x >= 0 && x < COLS && y >= 0 && y < ROWS && count < 5) {
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
          // Ironbox: block lasers from anywhere except the front
          if (hit.utype === 'ironbox' && hit.team !== laser.owner) {
            // laser.dx, laser.dy is the direction the laser is traveling
            // If the laser is not going exactly opposite to the facing, it hits armor
            if (laser.dx !== -hit.facing.dx || laser.dy !== -hit.facing.dy) {
              spawnDmgNumber(hit.x, hit.y, 'BLOCK', '#8899aa', 14, 'normal');
              spawnHit(hit.x, hit.y, '#8899aa', 12);
              SFX.play(150, 0.1, 0.1, 'square'); // Low thunk for block
              laser.cells.length = laser.cells.indexOf(cell) + 1;
              break;
            }
          }

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
              triggerHitRecovery(hit);
              noteBossBurstHit(hit, laser.owner);
              SFX.hit();
              if (gameMode === 'adventure') {
                logEvent(isCrit ? `CRIT [${getCombatLabel(hit)}]: -${dmg} HP` : `HIT [${getCombatLabel(hit)}]: -${dmg} HP`, isCrit ? 'crit' : 'info');
              }
              if (hit.hp <= 0) {
                hit.alive = false;
                spawnDeath(hit.x, hit.y, hit.color);
                if (gameMode === 'adventure') {
                  logEvent(`Target <span style="color:#ffffff">X</span> melted.`, 'warn');
                  const _dx2 = hit.x, _dy2 = hit.y;
                  if (!isPassiveBuffNpc(hit)) {
                    setTimeout(() => { if (S && S.loot) { spawnRonkeDrop(_dx2, _dy2); } }, _DEAD_TOTAL * _DEAD_MS + 100);
                  }
                  S.kills = (S.kills || 0) + 1;
                  trackKill();
                  if (!Profile.stats) Profile.stats = { totalKills: 0 };
                  Profile.stats.totalKills = (Profile.stats.totalKills || 0) + 1;
                  saveProfile(); _updateKillsDisplay(); checkAchievements();
                  const _brLvlL = Profile.upgrades?.bloodRushLevel || 0;
                  const _brBonusL = S.floorBuffs?.bloodRushBonus || 0;
                  if (_brLvlL > 0 || _brBonusL > 0) {
                    const _brGainL = ([0,1,2,3,4,5,6,8][_brLvlL] || 0) + _brBonusL;
                    S.energy = Math.min(ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0), (S.energy || 0) + _brGainL);
                    spawnDmgNumber(hit.x, hit.y, `+${_brGainL}⚡`, '#44ff88', 13, 'normal');
                    updateEnergyHud();
                  }
                }
              }
            }
          }

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
            holdMs: 150,
            fadeDur: 400,
            r: 1.0,
            alpha: 0.06,
            color: laser.color
          });
        }
      }


      laser.active = false;
      laser.firing = true;
      laser.fireTimer = 0.4;
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
  const _born = performance.now();
  if (!S.deathAnims) S.deathAnims = [];
  const _deadUnit = S.units && S.units.find(u => !u.alive && u.x === gx && u.y === gy);
  S.deathAnims.push({ gx, gy, born: _born, animType: _deadUnit?.utype || 'default' });
  const _isSheep = S.units && S.units.some(u => !u.alive && u.utype === 'sheep' && u.x === gx && u.y === gy);
  if (_isSheep) {
    if (!S.spawnAnims) S.spawnAnims = [];
    S.spawnAnims.push({ gx, gy, born: _born + _DEAD_TOTAL * _DEAD_MS });
    const _meatAt = _DEAD_TOTAL * _DEAD_MS + _SPAWN_FRAMES * _SPAWN_MS;
    setTimeout(() => { if (S && Array.isArray(S.meatDrops)) S.meatDrops.push({ x: gx, y: gy }); }, _meatAt);
  }
  const wx = (gx + 0.5) * CELL, wy = (gy + 0.5) * CELL;

  if (gameMode === 'adventure') {
    if (!S.lightGhosts) S.lightGhosts = [];
    S.lightGhosts.push({
      x: gx, y: gy,
      bornTime: performance.now(),
      holdMs: 3000,
      fadeDur: 3000,
      r: 1.9,
      alpha: 0.14,
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
        // Keep inactive hero bullets alive during visual flight
        if (b._flightStart && (now - b._flightStart) < b._flightDur) return true;
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
        if (gameMode === 'adventure') heroAgentNotify();
      }
    }
  }

  // Adventure actions should resolve immediately. If an input path leaves
  // the hero action queued while still frozen, flush it on the next frame.
  if (gameMode === 'adventure' && S.phase === 'frozen' && S.pending[0]) {
    if (S.pending[1] === null) aiQueueAction(false);
    resolveTick();
  }

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
  });
  // Unlock hero controls after full attack animation ends (800ms)
  if (S.heroShootLock && gameMode === 'adventure') {
    if (performance.now() - (S.heroShootLockStart || 0) >= 800) S.heroShootLock = false;
  }
  S.units.forEach(u => {
    if (u.collectFlash > 0) u.collectFlash = Math.max(0, u.collectFlash - dt * 0.004);
    if (!u.alive && u.deathT > 0) u.deathT = Math.max(0, u.deathT - dt * 0.0035);
    // Weapon form smooth blend
    const _cw = u.weapon || 'bullet';
    if (!u.wfb) u.wfb = { from: _cw, to: _cw, t: 1 };
    if (u.wfb.to !== _cw) { u.wfb.from = u.wfb.to; u.wfb.to = _cw; u.wfb.t = 0; }
    if (u.wfb.t < 1) u.wfb.t = Math.min(1, u.wfb.t + dt * 0.005);
  });
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 0.07);

  for (let _pi = S.particles.length - 1; _pi >= 0; _pi--) {
    const p = S.particles[_pi];
    p.x += p.vx; p.y += p.vy; p.vx *= 0.91; p.vy *= 0.91; p.life -= p.decay;
    if (p.life <= 0) { S.particles[_pi] = S.particles[S.particles.length - 1]; S.particles.pop(); }
  }
  // Advance death animations (14 frames, 100ms each = 1400ms total)
  if (S.deathAnims && S.deathAnims.length) {
    const _now = performance.now();
    S.deathAnims = S.deathAnims.filter(a => (_now - a.born) < 1400);
  }
  if (S.spawnAnims && S.spawnAnims.length) {
    const _now = performance.now();
    S.spawnAnims = S.spawnAnims.filter(a => (_now - a.born) < _SPAWN_FRAMES * _SPAWN_MS);
  }
  processPendingPassiveRewards();
  // Cap particles to prevent unbounded growth
  if (S.particles.length > 400) S.particles.length = 400;
  if (S.footsteps) S.footsteps.forEach(f => { f.alpha = Math.max(0, f.alpha - dt * 0.004); });
  if (gameMode === 'adventure') updateWallFX(dt);


  for (let _di = S.dmgNumbers.length - 1; _di >= 0; _di--) {
    const n = S.dmgNumbers[_di];
    n.x += n.vx; n.y += n.vy;
    n.vx *= 0.90; n.vy *= 0.88;
    n.life -= n.decay;
    n.scale = Math.max(1.0, n.scale - (n.type === 'crit' ? 0.09 : 0.13));
    if (n.life <= 0) { S.dmgNumbers[_di] = S.dmgNumbers[S.dmgNumbers.length - 1]; S.dmgNumbers.pop(); }
  }

  S.lasers = S.lasers.filter(l => {
    if (l.active) return true;
    if (l.firing) {
      l.fireTimer -= dt / 1000;
      if (l.fireTimer <= 0) return false;
      return true;
    }
    return false;
  });

  // Cache hero unit once per frame (used by rebuildVisCache, updateCamera, drawShootPreview)
  S._hero = S.units ? S.units.find(u => u.team === 0 && u.alive) || null : null;

  // Rebuild visibility cache once per frame (replaces repeated isVisible() inner loops)
  rebuildVisCache();

  // Cache per-unit checks once per frame
  S.units.forEach(u => {
    if (!u.alive) { u._adjEnemy = false; u._bulletDanger = false; return; }
    u._adjEnemy = S.units.some(e => e.alive && e.team !== u.team &&
      Math.abs(e.x - u.x) <= 1 && Math.abs(e.y - u.y) <= 1);
    u._bulletDanger = S.bullets.some(b =>
      b.active && b.owner !== u.team &&
      Math.abs(b.x + b.dx - u.x) <= 1 && Math.abs(b.y + b.dy - u.y) <= 1);
  });

  // Draw
  ctx.save();
  if (S.shake > 0.3) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
  clearCanvas();
  if (gameMode === 'adventure' && S.cam) {
    updateCamera();
    ctx.translate(-Math.round(S.cam.x), -Math.round(S.cam.y));
  }
  if (gameMode === 'adventure') { drawDungeon(); drawWallLED(); } else drawBoard();
  drawLasers();
  drawMeleeStrikes();
  drawShootPreview();
  drawShadows();
  drawAimIndicators();
  drawBloodStains();
  drawFootsteps();
  drawParticles();
  drawDeathAnims();
  drawSpawnAnims();
  drawShamanProjectiles();
  drawShamanExplosions();
  drawRonke2Projectiles();
  drawHarpoons();
  drawThreatIndicators();
  drawShrines();
  drawChests();
  drawTeleports();
  drawJumpIndicator();
  drawFlareAimIndicator();
  drawFlareProjectile();
  drawRonkeShield();
  drawTutorialHighlight();
  drawLoot();
  drawMeatDrops();
  drawPamNpc();
  drawUnits();
  drawForegroundDecorations();
  drawRonkeInfect();
  drawFog();
  drawBullets();
  drawHeroBullets();
  drawHeroBulletDeaths();
  drawDmgNumbers();
  if (gameMode === 'adventure') drawAmbientDust();
  ctx.restore();
  // Screen-space overlays (no camera transform)
  if (gameMode === 'adventure') {
    drawWeaponHUD();
    drawFloorIntro();
    drawHeroHitVignette();
  }
  drawScanlines();
}

function updateCamera() {
  const hero = S._hero || S.units.find(u => u.team === 0 && u.alive);
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

  if (mapW < vpW) tx = 0;
  if (mapH < vpH) ty = 0;

  S.cam.tx = tx;
  S.cam.ty = ty;

  // Smooth lerp toward target
  S.cam.x += (tx - S.cam.x) * 0.14;
  S.cam.y += (ty - S.cam.y) * 0.14;
  if (Math.abs(S.cam.x - tx) < 0.5) S.cam.x = tx;
  if (Math.abs(S.cam.y - ty) < 0.5) S.cam.y = ty;
}

function clearCanvas() {
  ctx.fillStyle = gameMode === 'adventure' ? '#000000' : '#05050e';
  const canvasH = gameMode === 'adventure' ? ADV_CANVAS_H : BOARD_H;
  ctx.fillRect(0, 0, advCanvasW, canvasH);
}

function drawLasers() {
  const now = performance.now();
  S.lasers.forEach(laser => {
    if (!laser.cells.length) return;


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

    const segments = Math.max(5, Math.floor(dist / 14));
    const jitterAmp = 6 + progress * 14;
    // Refresh cached jitter at ~50ms intervals to avoid per-frame Math.random
    if (!laser._jitter || laser._jitter.length !== segments - 1 || now - (laser._jitterAt || 0) > 50) {
      laser._jitter = new Float32Array(segments - 1);
      laser._jitter2 = new Float32Array(segments - 1);
      for (let i = 0; i < segments - 1; i++) {
        laser._jitter[i] = (Math.random() - 0.5);
        laser._jitter2[i] = (Math.random() - 0.5);
      }
      laser._jitterLw = Math.random() * 2;
      const pCount = Math.round(4 + progress * 4);
      laser._jitterPx = new Float32Array(pCount);
      laser._jitterPy = new Float32Array(pCount);
      laser._jitterPr = new Float32Array(pCount);
      for (let p = 0; p < pCount; p++) {
        laser._jitterPx[p] = (Math.random() - 0.5) * 20;
        laser._jitterPy[p] = (Math.random() - 0.5) * 20;
        laser._jitterPr[p] = Math.random() * 2 + 0.5;
      }
      laser._jitterAt = now;
    }

    ctx.beginPath();
    ctx.moveTo(0, 0);

    // Draw top half of jitter
    for (let i = 1; i < segments; i++) {
      ctx.lineTo((i / segments) * dist, laser._jitter[i - 1] * jitterAmp);
    }
    ctx.lineTo(dist, 0);

    // Draw bottom half of jitter returning
    for (let i = segments - 1; i > 0; i--) {
      ctx.lineTo((i / segments) * dist, laser._jitter2[i - 1] * jitterAmp);
    }
    ctx.closePath();
    ctx.fill();

    // Hot central core line
    ctx.globalAlpha = 0.7 + progress * 0.3;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 + progress * 3 + laser._jitterLw;
    ctx.shadowBlur = 10;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dist, 0); ctx.stroke();

    // Source gathering particles (tik kraunantis)
    if (!laser.firing && laser._jitterPx) {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = laser.color;
      for (let p = 0; p < laser._jitterPx.length; p++) {
        ctx.beginPath(); ctx.arc(laser._jitterPx[p], laser._jitterPy[p], laser._jitterPr[p], 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();


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

let _boardCanvas = null, _boardCacheKey = '';
function _buildBoardCache() {
  const key = `${ROWS},${COLS}`;
  if (_boardCanvas && _boardCacheKey === key) return;
  _boardCacheKey = key;
  const oc = document.createElement('canvas');
  oc.width = COLS * CELL; oc.height = ROWS * CELL;
  const octx = oc.getContext('2d');
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      octx.fillStyle = (r + c) % 2 === 0 ? CELL_DARK : CELL_LIGHT;
      octx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  octx.strokeStyle = GRID_COLOR; octx.lineWidth = 1;
  octx.beginPath();
  for (let i = 0; i <= COLS; i++) { octx.moveTo(i * CELL, 0); octx.lineTo(i * CELL, BOARD_H); }
  for (let j = 0; j <= ROWS; j++) { octx.moveTo(0, j * CELL); octx.lineTo(BOARD_W, j * CELL); }
  octx.stroke();
  octx.strokeStyle = '#1e1e3e'; octx.lineWidth = 2;
  octx.strokeRect(0, 0, BOARD_W, BOARD_H);
  _boardCanvas = oc;
}
function drawBoard() {
  _buildBoardCache();
  ctx.drawImage(_boardCanvas, 0, 0);
}


const _shadowGradCache = new Map(); // id -> {gx,gy,tick,g}
function drawShadows() {
  S.units.forEach(u => {
    if (S.phase === 'frozen' && S.clockSide !== u.team) return;
    const a = u.alive ? 0.13 : u.deathT * 0.13;
    if (a < 0.01) return;
    const cx = (u.rx + 0.5) * CELL, cy = (u.ry + 0.5) * CELL;
    let cached = _shadowGradCache.get(u.id);
    // Rebuild gradient only when grid position changes (once per tick, not per frame)
    if (!cached || cached.gx !== u.x || cached.gy !== u.y) {
      const gcx = (u.x + 0.5) * CELL, gcy = (u.y + 0.5) * CELL;
      const g = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, CELL * 0.8);
      g.addColorStop(0, hexAlpha(u.color, 0.13)); g.addColorStop(1, 'transparent');
      cached = { gx: u.x, gy: u.y, g };
      _shadowGradCache.set(u.id, cached);
    }
    ctx.globalAlpha = a / 0.13;
    ctx.fillStyle = cached.g; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });
}


function drawShootPreview() {
  if (S.phase !== 'frozen' || S.clockSide !== 0) return;
  const selId = S.selectedId[0];
  const unit = (S._hero && S._hero.id === selId) ? S._hero : S.units.find(u => u.id === selId && u.alive);
  if (!unit || S.pending[0] !== null) return;
  const wep = unit.weapon || 'bullet';
  if (gameMode === 'adventure') {
    let nrgReq = 0;
    if (wep === 'bullet') nrgReq = 2;
    if (wep === 'laser') nrgReq = 7;
    if (wep === 'heavy' || wep === 'shotgun') nrgReq = 4;
    if (S.energy < nrgReq) return;
  } else {
    if (wep === 'bullet' && unit.ammo <= 0) return;
    if (wep === 'laser' && unit.laserAmmo <= 0) return;
    if (wep === 'heavy' && unit.heavyAmmo <= 0) return;
    if (wep === 'shotgun' && unit.shotgunAmmo <= 0) return;
  }
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
  const _eMap = new Map();
  S.units.forEach(u => { if (u.alive && u.team !== unit.team) _eMap.set(u.x + ',' + u.y, u); });
  let x = unit.x + dx, y = unit.y + dy;
  const limit = maxRange > 0 ? maxRange : COLS + ROWS;
  for (let i = 0; i < limit; i++) {
    if (isWall(x, y)) break;
    cells.push({ x, y });
    const e = _eMap.get(x + ',' + y);
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
  const _cellSet = new Set(cells.map(c => c.x + ',' + c.y));
  const hitUnit = S.units.find(u => u.alive && u.team !== unit.team && _cellSet.has(u.x + ',' + u.y));
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


function drawAimIndicators() {
  if (gameMode === 'adventure') return;
  if (S.phase === 'frozen' && S.clockSide !== 0) return;
  const selId = S.selectedId[0];
  const p = (S._hero && S._hero.id === selId) ? S._hero : S.units.find(u => u.id === selId && u.alive);
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
    let rx = (b.rx + 0.5) * CELL;
    let ry = (b.ry + 0.5) * CELL;
    const heavy = (b.power || 1) >= 2;
    const spread = b.spread === true;
    const damaged = heavy && b.pierceLeft === 0;

    // Pellet fade-out as it approaches maxRange (not for hero orb — always full alpha)
    const rangeAlpha = (b.maxRange > 0 && b.owner !== 0)
      ? Math.max(0.05, 1 - b.cellsTraveled / b.maxRange)
      : 1;

    const baseAlpha = (b.active ? 1 : Math.max(0, 1 - S.animT * 3)) * rangeAlpha;
    if (baseAlpha <= 0) return;

    if (b.hackBullet) {
      // --- HACK WAVE BULLET ---
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(Math.atan2(b.dy, b.dx));
      ctx.globalAlpha = baseAlpha;

      const tipX = 7;
      const tailX = -22;
      const amp = 5.5;
      const freq = 0.22; // wave frequency
      const phase = now * 0.024 + b.id * 4.2;
      const steps = 28;

      const buildWave = () => {
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = tailX + (tipX - tailX) * t;
          const y = Math.sin(x * freq * Math.PI * 2 + phase) * amp;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      };

      // Outer glow
      ctx.save();
      ctx.globalAlpha = baseAlpha * 0.35;
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 6;
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 22;
      ctx.lineCap = 'round';
      buildWave(); ctx.stroke();
      ctx.restore();

      // Inner bright wave with fade gradient (cached — coords are fixed in local space)
      if (!b._waveGrad) {
        const _wg = ctx.createLinearGradient(tailX, 0, tipX, 0);
        _wg.addColorStop(0, 'rgba(0,255,204,0)');
        _wg.addColorStop(0.35, 'rgba(0,255,204,0.6)');
        _wg.addColorStop(1, '#00ffcc');
        b._waveGrad = _wg;
      }
      ctx.strokeStyle = b._waveGrad;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 10;
      ctx.lineCap = 'round';
      ctx.globalAlpha = baseAlpha;
      buildWave(); ctx.stroke();

      // Bright glowing tip dot (follows wave)
      const tipY = Math.sin(tipX * freq * Math.PI * 2 + phase) * amp;
      ctx.shadowBlur = 24;
      ctx.shadowColor = '#00ffcc';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#00ffcc';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    } else if (heavy) {
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
    } else if (b.owner === 0 && b.gunBullet) {
      // Hero bullets now use _heroBullets real-time system — skip here
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

      const _tgKey = `${tailLength},${b.color}`;
      if (!b._trailGrad || b._trailGradKey !== _tgKey) {
        b._trailGradKey = _tgKey;
        const _g = ctx.createLinearGradient(-tailLength * 1.5, 0, tailLength * 0.5, 0);
        _g.addColorStop(0, 'rgba(0,0,0,0)');
        _g.addColorStop(0.5, b.color);
        _g.addColorStop(1, '#ffffff');
        b._trailGrad = _g;
      }
      ctx.fillStyle = b._trailGrad;

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
  if (!S.particles.length) return;
  ctx.save();
  // Pass 1: no-glow particles (shadowBlur=0 set once)
  ctx.shadowBlur = 0;
  for (let _pi = 0; _pi < S.particles.length; _pi++) {
    const p = S.particles[_pi];
    if (p.type === 'chunk') {
      ctx.globalAlpha = p.life * 0.95;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.x + p.y) * 0.1 + p.life * 6);
      const size = p.r * 1.5 * p.life;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(-size / 2, -size / 2, size, size / 3);
      ctx.restore();
    } else if (p.type === 'streak' || p.vx !== 0 || p.vy !== 0) {
      const speed = Math.hypot(p.vx, p.vy) + 1;
      const len = speed * 2.5 * p.life;
      ctx.globalAlpha = p.life * 0.95;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.5, p.r * p.life);
      ctx.lineCap = 'round';
      const ang = Math.atan2(p.vy, p.vx);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
      ctx.stroke();
    } else if (p.type === 'pixel' && p.color !== '#ffffff') {
      ctx.globalAlpha = p.life > 0.5 ? 1 : p.life * 2;
      ctx.fillStyle = p.color;
      const size = Math.max(1, Math.round(p.r * (0.3 + 0.7 * p.life)));
      ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
    }
  }
  // Pass 2: glow particles (shadowBlur set per batch)
  for (let _pi = 0; _pi < S.particles.length; _pi++) {
    const p = S.particles[_pi];
    if (p.type === 'ring') {
      const rad = p.r * (1 - p.life);
      if (rad <= 0) continue;
      ctx.shadowColor = p.color; ctx.shadowBlur = 10;
      ctx.globalAlpha = p.life * 0.85;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.5, 3 * p.life);
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.stroke();
    } else if (p.type === 'pixel' && p.color === '#ffffff') {
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 8;
      ctx.globalAlpha = p.life > 0.5 ? 1 : p.life * 2;
      ctx.fillStyle = '#ffffff';
      const size = Math.max(1, Math.round(p.r * (0.3 + 0.7 * p.life)));
      ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
    } else if (p.type !== 'chunk' && p.type !== 'streak' && p.vx === 0 && p.vy === 0) {
      ctx.shadowColor = p.color; ctx.shadowBlur = 10;
      ctx.globalAlpha = p.life * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawPamNpc() {
  if (!pamNpcImg.complete || !pamNpcImg.naturalWidth) return;
  const now = performance.now();
  const frame = Math.floor(now / (1000 / PAM_FPS)) % PAM_FRAMES;
  // Place NPC at tile 5,5 (adjust as needed)
  const nx = 5, ny = 5;
  const sz = CELL * 2.2;
  const cx = (nx + 0.5) * CELL, cy = (ny + 0.5) * CELL;
  ctx.save();
  ctx.drawImage(pamNpcImg, frame * PAM_FW, 0, PAM_FW, PAM_FH, cx - sz/2, cy - sz, sz, sz);
  ctx.restore();
}

// Dead.png: 896x256 = 7 cols x 2 rows of 128x128 = 14 frames, ~100ms each
const _DEAD_FRAME_W = 128, _DEAD_FRAME_H = 128, _DEAD_COLS = 7, _DEAD_TOTAL = 14, _DEAD_MS = 100;

function drawMeatDrops() {
  if (!S.meatDrops || !S.meatDrops.length) return;
  if (!mIdleImg.complete || !mIdleImg.naturalWidth) return;
  const float = Math.sin(performance.now() * 0.004) * 4;
  const sz = CELL * 2.2;
  ctx.save();
  S.meatDrops.forEach(m => {
    if (m.collected) return;
    const cx = (m.x + 0.5) * CELL, cy = (m.y + 0.5) * CELL + float;
    ctx.shadowColor = '#ff6633'; ctx.shadowBlur = 10;
    ctx.drawImage(mIdleImg, cx - sz / 2, cy - sz / 2, sz, sz);
  });
  ctx.restore();
}

function drawSpawnAnims() {
  if (!S.spawnAnims || !S.spawnAnims.length) return;
  if (!mSpawnImg.complete || !mSpawnImg.naturalWidth) return;
  const _now = performance.now();
  ctx.save();
  for (let i = 0; i < S.spawnAnims.length; i++) {
    const a = S.spawnAnims[i];
    const elapsed = _now - a.born;
    if (elapsed < 0) continue;
    const frameIdx = Math.min(_SPAWN_FRAMES - 1, Math.floor(elapsed / _SPAWN_MS));
    const cx = (a.gx + 0.5) * CELL, cy = (a.gy + 0.5) * CELL;
    ctx.drawImage(mSpawnImg,
      frameIdx * _SPAWN_FRAME_W, 0, _SPAWN_FRAME_W, _SPAWN_FRAME_H,
      cx - CELL, cy - CELL, CELL * 2, CELL * 2);
  }
  ctx.restore();
}

function drawDeathAnims() {
  if (!S.deathAnims || !S.deathAnims.length) return;
  const _now = performance.now();
  ctx.save();
  for (let _di = 0; _di < S.deathAnims.length; _di++) {
    const a = S.deathAnims[_di];
    const elapsed = _now - a.born;
    if (a.animType === 'troll' && trollDeadImg.complete && trollDeadImg.naturalWidth > 0) {
      const TROLL_DEAD_TOTAL = 10;
      const TROLL_DEAD_MS = 110;
      const TROLL_DEAD_W = 384;
      const TROLL_DEAD_H = 384;
      const frameIdx = Math.min(TROLL_DEAD_TOTAL - 1, Math.floor(elapsed / TROLL_DEAD_MS));
      const dw = CELL * 3, dh = CELL * 3;
      const px = Math.round((a.gx + 0.5) * CELL - dw / 2);
      const py = Math.round((a.gy + 0.5) * CELL - dh / 2);
      const fadeFrame = TROLL_DEAD_TOTAL - 3;
      ctx.globalAlpha = frameIdx >= fadeFrame ? 1 - (frameIdx - fadeFrame) / 3 : 1;
      ctx.drawImage(trollDeadImg, frameIdx * TROLL_DEAD_W, 0, TROLL_DEAD_W, TROLL_DEAD_H, px, py, dw, dh);
      continue;
    }

    if (!deadAnimImg.complete || !deadAnimImg.naturalWidth) continue;
    const frameIdx = Math.min(_DEAD_TOTAL - 1, Math.floor(elapsed / _DEAD_MS));
    const col = frameIdx % _DEAD_COLS;
    const row = Math.floor(frameIdx / _DEAD_COLS);
    const px = Math.round((a.gx + 0.5) * CELL - CELL);
    const py = Math.round((a.gy + 0.5) * CELL - CELL);
    const dw = CELL * 2, dh = CELL * 2;
    const fadeFrame = _DEAD_TOTAL - 3;
    ctx.globalAlpha = frameIdx >= fadeFrame ? 1 - (frameIdx - fadeFrame) / 3 : 1;
    ctx.drawImage(deadAnimImg, col * _DEAD_FRAME_W, row * _DEAD_FRAME_H, _DEAD_FRAME_W, _DEAD_FRAME_H, px, py, dw, dh);
  }
  ctx.restore();
}

// ---- Shaman Projectile & Explosion --------------------------------

function spawnShamanProjectile(fromGx, fromGy, toGx, toGy) {
  if (!S.shamanProjectiles) S.shamanProjectiles = [];
  const sx = (fromGx + 0.5) * CELL, sy = (fromGy + 0.5) * CELL;
  const tx = (toGx  + 0.5) * CELL, ty = (toGy  + 0.5) * CELL;
  const dist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2);
  const duration = Math.max(350, dist / (CELL * 0.0055)); // ~5.5 cells/sec feel
  S.shamanProjectiles.push({ sx, sy, tx, ty, born: performance.now(), duration, targetGx: toGx, targetGy: toGy, done: false, hit: false });
}

function drawShamanProjectiles() {
  if (!S.shamanProjectiles || !S.shamanProjectiles.length) return;
  if (!shamanProjImg.complete || !shamanProjImg.naturalWidth) return;
  const now = performance.now();
  const sz = CELL * 1.6;
  ctx.save();
  S.shamanProjectiles.forEach(p => {
    if (p.done) return;
    const t = Math.min((now - p.born) / p.duration, 1);
    const cx = p.sx + (p.tx - p.sx) * t;
    const cy = p.sy + (p.ty - p.sy) * t;
    const frameIdx = Math.floor((now - p.born) / _SHAM_PROJ_MS) % _SHAM_PROJ_FRAMES;
    ctx.drawImage(shamanProjImg, frameIdx * _SHAM_PROJ_W, 0, _SHAM_PROJ_W, _SHAM_PROJ_H, cx - sz / 2, cy - sz / 2, sz, sz);
    if (t >= 1 && !p.hit) {
      p.hit = true; p.done = true;
      _shamanExplosions.push({ gx: p.targetGx, gy: p.targetGy, born: now });
      SFX.play(160, 0.18, 0.30, 'sawtooth');
      S.shake = Math.max(S.shake || 0, 5);
      // Damage hero if standing on target tile
      if (S.units) {
        const _hero = S.units.find(u => u.team === 0 && u.alive && u.x === p.targetGx && u.y === p.targetGy);
        if (_hero) {
          _hero.hp = (_hero.hp || 1) - 1;
          spawnHit(_hero.x, _hero.y, '#cc30ff', 28);
          spawnDmgNumber(_hero.x, _hero.y, '-1', '#cc30ff', 18, 'crit');
          if (_hero.hp <= 0 && !S.winner) {
            _hero.alive = false; _hero.deathT = 1;
            spawnDeath(_hero.x, _hero.y, _hero.color || '#00f5ff');
            S.winner = 1;
          }
        }
      }
    }
  });
  ctx.restore();
  if (S.shamanProjectiles) S.shamanProjectiles = S.shamanProjectiles.filter(p => !p.done);
}

function drawShamanExplosions() {
  if (!_shamanExplosions.length) return;
  if (!shamanExplImg.complete || !shamanExplImg.naturalWidth) return;
  const now = performance.now();
  const totalDur = _SHAM_EXPL_FRAMES * _SHAM_EXPL_MS;
  const sz = CELL * 2.8;
  ctx.save();
  _shamanExplosions.forEach(e => {
    const elapsed = now - e.born;
    if (elapsed >= totalDur) return;
    const frameIdx = Math.min(_SHAM_EXPL_FRAMES - 1, Math.floor(elapsed / _SHAM_EXPL_MS));
    const cx = (e.gx + 0.5) * CELL, cy = (e.gy + 0.5) * CELL;
    ctx.drawImage(shamanExplImg, frameIdx * _SHAM_EXPL_W, 0, _SHAM_EXPL_W, _SHAM_EXPL_H, cx - sz / 2, cy - sz / 2, sz, sz);
  });
  ctx.restore();
  // Cleanup finished explosions
  const _cleanNow = performance.now();
  for (let i = _shamanExplosions.length - 1; i >= 0; i--) {
    if (_cleanNow - _shamanExplosions[i].born >= totalDur) _shamanExplosions.splice(i, 1);
  }
}

// ---- Ronke2 Orb Projectile ----------------------------------------

function spawnRonke2HeroProjectile(fromGx, fromGy, toGx, toGy, faceDx) {
  // Hero version: same orb but damages enemies (team !== 0)
  _spawnRonke2Orb(fromGx, fromGy, toGx, toGy, faceDx, 0);
}

function spawnRonke2Projectile(fromGx, fromGy, toGx, toGy, faceDx) {
  // NPC version: damages hero (team === 0)
  _spawnRonke2Orb(fromGx, fromGy, toGx, toGy, faceDx, 1);
}

function _spawnRonke2Orb(fromGx, fromGy, toGx, toGy, faceDx, fromTeam) {
  if (!S.ronke2Projectiles) S.ronke2Projectiles = [];
  const dir = faceDx || Math.sign(toGx - fromGx);
  // Orb materializes at the adjacent cell, at staff-tip height (~35% above center)
  const spawnGx = fromGx + dir;
  const sx = (spawnGx + 0.5) * CELL;
  const sy = (fromGy  + 0.5) * CELL - CELL * 0.35;
  const tx = (toGx   + 0.5) * CELL;
  const ty = (toGy   + 0.5) * CELL - CELL * 0.35;
  const dist = Math.abs(tx - sx);
  const duration = Math.max(280, dist / (CELL * 0.007));
  const born = performance.now();
  S.ronke2Projectiles.push({
    sx, sy, tx, ty, born, duration,
    targetGx: toGx, targetGy: toGy,
    fromTeam,  // 0 = hero fired (damages enemies), 1 = NPC fired (damages hero)
    done: false, hit: false,
    trail: []
  });
  // Spawn-flash at orb birth position
  _ronke2OrbFlashes.push({ x: sx, y: sy, born });
}

// ---- Hero Bullet (real-time, shaman-style) --------------------------------

const _heroBullets = [];

function spawnHeroBullet(fromGx, fromGy, dx, dy, unit) {
  const _maxRange = 5;
  // Pre-scan path: find first enemy or wall
  let toGx = fromGx, toGy = fromGy, hitEnemy = null, hitStep = 0;
  for (let s = 1; s <= _maxRange; s++) {
    const cx = fromGx + dx * s, cy = fromGy + dy * s;
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS || isWall(cx, cy)) break;
    toGx = cx; toGy = cy; hitStep = s;
    const e = S.units && S.units.find(u => u.alive && u.team !== 0 && u.x === cx && u.y === cy);
    if (e) { hitEnemy = e; break; }
  }
  const sx = (fromGx + 0.5) * CELL, sy = (fromGy + 0.5) * CELL;
  const tx = (toGx  + 0.5) * CELL, ty = (toGy  + 0.5) * CELL;
  const dist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2);
  const duration = Math.max(200, dist / (CELL * 0.009));
  const born = performance.now();
  _heroBullets.push({ sx, sy, tx, ty, born, duration, toGx, toGy, hitEnemy, hitStep, done: false, hit: false });
}

function drawHeroBullets() {
  if (!_heroBullets.length) return;
  if (!bulletOrbImg.complete || !bulletOrbImg.naturalWidth) return;
  const now = performance.now();
  const sz = CELL * 0.85;
  ctx.save();
  for (let i = _heroBullets.length - 1; i >= 0; i--) {
    const p = _heroBullets[i];
    if (p.done) { _heroBullets.splice(i, 1); continue; }
    const t = Math.min(1, (now - p.born) / p.duration);
    const cx = p.sx + (p.tx - p.sx) * t;
    const cy = p.sy + (p.ty - p.sy) * t;
    const frameIdx = Math.floor((now - p.born) / 60) % BULLET_ORB_FRAMES;
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bulletOrbImg, frameIdx * BULLET_ORB_FW, 0, BULLET_ORB_FW, BULLET_ORB_FH,
      cx - sz / 2, cy - sz / 2, sz, sz);
    if (t >= 1 && !p.hit) {
      p.hit = true; p.done = true;
      // Sparkle explosion at hit position
      _heroBulletDeaths.push({ x: p.tx, y: p.ty, born: now });
      // Reveal small fog area around hit position (radius 2)
      if (S.fog) {
        const _now2 = performance.now();
        for (let _dy = -2; _dy <= 2; _dy++)
          for (let _dx = -2; _dx <= 2; _dx++) {
            if (Math.hypot(_dx, _dy) > 2) continue;
            const _fx = p.toGx + _dx, _fy = p.toGy + _dy;
            if (_fx < 0 || _fx >= COLS || _fy < 0 || _fy >= ROWS) continue;
            if (!S.fog[_fy][_fx] && S.fogReveal) S.fogReveal[_fy][_fx] = _now2;
            S.fog[_fy][_fx] = true;
          }
      }
      // Deal damage if enemy was pre-scanned
      const eu = p.hitEnemy;
      if (eu && eu.alive) {
        // Dodge check
        if (Math.random() < (eu.dodge !== undefined ? eu.dodge : MISS_CHANCE)) {
          spawnDmgNumber(eu.x, eu.y, 'MISS', '#88bbff', 13, 'miss');
          spawnHit(eu.x, eu.y, '#88bbff', 5);
        } else {
          const isCrit = Math.random() < getCritChance();
          const dist = p.hitStep + 1;
          let baseDmg = dist >= 5 ? 4 : dist >= 4 ? 3 : dist >= 3 ? 2 : 1;
          const dmg = isCrit ? baseDmg * 2 : baseDmg;
          if (!stats.hits[0]) stats.hits[0] = 0; stats.hits[0]++;
          spawnDmgNumber(eu.x, eu.y, isCrit ? `-${dmg}!` : `-${dmg}`, isCrit ? '#ffe033' : '#ffffff', isCrit ? 22 : 16, isCrit ? 'crit' : 'normal');
          spawnHit(eu.x, eu.y, eu.color, isCrit ? 22 : 12);
          S.shake = Math.max(S.shake || 0, isCrit ? 14 : 9);
          eu.hp = (eu.hp || 1) - dmg; eu.hitFlash = 1;
          triggerHitRecovery(eu); noteBossBurstHit(eu, 0); SFX.hit();
          if (gameMode === 'adventure') logEvent(isCrit ? `CRIT [${getCombatLabel(eu)}]: -${dmg} HP` : `HIT [${getCombatLabel(eu)}]: -${dmg} HP`, isCrit ? 'crit' : 'info');
          if (eu.hp <= 0) {
            eu.alive = false; spawnDeath(eu.x, eu.y, eu.color);
            if (gameMode === 'adventure') {
              logEvent(`Target <span style="color:#ffffff">X</span> destroyed.`, 'warn');
              const _dx1 = eu.x, _dy1 = eu.y;
              if (!isPassiveBuffNpc(eu)) setTimeout(() => { if (S && S.loot) spawnRonkeDrop(_dx1, _dy1); }, _DEAD_TOTAL * _DEAD_MS + 100);
              S.kills = (S.kills || 0) + 1; trackKill();
              if (!Profile.stats) Profile.stats = { totalKills: 0 };
              Profile.stats.totalKills = (Profile.stats.totalKills || 0) + 1;
              saveProfile(); _updateKillsDisplay(); checkAchievements();
              if (S.bloodStains) S.bloodStains.push(mkBloodStain(eu.x, eu.y));
              const _brLvl = Profile.upgrades?.bloodRushLevel || 0, _brBonus = S.floorBuffs?.bloodRushBonus || 0;
              if (_brLvl > 0 || _brBonus > 0) {
                const _brGain = ([0,1,2,3,4,5,6,8][_brLvl] || 0) + _brBonus;
                S.energy = Math.min(ENERGY_MAX + (Profile.upgrades?.maxEnergy || 0), (S.energy || 0) + _brGain);
                spawnDmgNumber(eu.x, eu.y, `+${_brGain}⚡`, '#44ff88', 13, 'normal'); updateEnergyHud();
              }
            }
          }
        }
      }
    }
  }
  ctx.restore();
}

const _heroBulletDeaths = []; // { x, y, born } — sparkle burst FX on bullet hit
const _HERO_DEATH_DUR = 700; // ms — matches 14 frames at ~20fps

function drawHeroBulletDeaths() {
  if (!_heroBulletDeaths.length) return;
  if (!sparkleBulletImg.complete || sparkleBulletImg.naturalWidth <= 0) return;
  const now = performance.now();
  const _size = CELL * 1.0;
  for (let i = _heroBulletDeaths.length - 1; i >= 0; i--) {
    const d = _heroBulletDeaths[i];
    const age = now - d.born;
    if (age >= _HERO_DEATH_DUR) { _heroBulletDeaths.splice(i, 1); continue; }
    const _t = age / _HERO_DEATH_DUR;
    const _frame = Math.min(SPARKLE_FRAMES - 1, Math.floor(_t * SPARKLE_FRAMES));
    const _alpha = Math.max(0, 1 - _t * 0.9);
    ctx.save();
    ctx.globalAlpha = _alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sparkleBulletImg, _frame * SPARKLE_FW, 0, SPARKLE_FW, SPARKLE_FH,
      d.x - _size * 0.5, d.y - _size * 0.5, _size, _size);
    ctx.restore();
  }
}
const _ronke2OrbFlashes = [];
const _ronke2ImpactRings = [];

// ---- Stabby McSpear — Harpoon Projectile System ----
function spawnHarpoon(fromGx, fromGy, toGx, toGy, faceDx) {
  if (!S.harpoons) S.harpoons = [];
  const dir = faceDx || Math.sign(toGx - fromGx) || 1;
  // Start from Stabby's edge (half cell in facing direction), not 1 full cell ahead
  const sx = (fromGx + 0.5 + dir * 0.5) * CELL;
  const sy = (fromGy + 0.5) * CELL - CELL * 0.3;
  const tx = (toGx + 0.5) * CELL;
  const ty = (toGy + 0.5) * CELL;
  const dist = Math.abs(tx - sx);
  const duration = Math.max(300, dist / (CELL * 0.005)); // slower, longer range feel
  S.harpoons.push({ sx, sy, tx, ty, born: performance.now(), duration, dir, done: false, hit: false });
}

function drawHarpoons() {
  if (!S.harpoons?.length) return;
  const now = performance.now();
  const harpSz = CELL * 0.35;
  S.harpoons.forEach(h => {
    if (h.done) return;
    const t = Math.min(1, (now - h.born) / h.duration);
    const cx = h.sx + (h.tx - h.sx) * t;
    const cy = h.sy + (h.ty - h.sy) * t;

    // Per-frame hit detection: check which cell harpoon is in
    if (!h.hit && S.units) {
      const hGx = Math.floor(cx / CELL);
      const hGy = Math.floor(cy / CELL);
      const hero = S.units.find(u => u.team === 0 && u.alive && u.x === hGx && u.y === hGy);
      if (hero) {
        h.hit = true; h.done = true;
        const dmg = heroDmg(4);
        S.energy = Math.max(0, S.energy - dmg);
        spawnDmgNumber(hero.x, hero.y, `-${dmg}`, '#ff8833', 20, 'crit');
        SFX.heroHit();
        spawnHit(hero.x, hero.y, '#ff8833', 14);
        logEvent(`HARPOON HIT: Hero took ${dmg} DMG!`, 'dmg');
        return;
      }
    }

    // Stop at wall or map edge
    if (!h.hit && t < 1) {
      const hGx = Math.floor(cx / CELL);
      const hGy = Math.floor(cy / CELL);
      if (hGx < 0 || hGx >= COLS || hGy < 0 || hGy >= ROWS || isWall(hGx, hGy)) {
        h.done = true; return;
      }
    }

    if (t >= 1) { h.done = true; return; }

    // Draw harpoon
    ctx.save();
    ctx.translate(cx, cy);
    // Image tip points upper-right (~-45°) → compensate with +PI/4 to fly horizontal
    ctx.rotate((h.dir > 0 ? 0 : Math.PI) + Math.PI / 4);
    ctx.shadowColor = '#ffaa44'; ctx.shadowBlur = 8;
    if (harpoonImg.complete && harpoonImg.naturalWidth > 0) {
      ctx.drawImage(harpoonImg, -harpSz / 2, -harpSz / 2, harpSz, harpSz);
    } else {
      ctx.strokeStyle = '#ff8833'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-harpSz / 2, 0); ctx.lineTo(harpSz / 2, 0); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  });
  S.harpoons = S.harpoons.filter(h => !h.done);
}

function drawRonke2Projectiles() {
  if (!S.ronke2Projectiles?.length && !_ronke2OrbFlashes.length && !_ronke2ImpactRings.length) return;
  const now = performance.now();

  // Spawn-flash (orb materializing burst)
  for (let i = _ronke2OrbFlashes.length - 1; i >= 0; i--) {
    const f = _ronke2OrbFlashes[i];
    const age = now - f.born;
    const dur = 220;
    if (age > dur) { _ronke2OrbFlashes.splice(i, 1); continue; }
    const fp = age / dur;
    ctx.save();
    ctx.globalAlpha = (1 - fp) * 0.9;
    ctx.strokeStyle = '#ffdd44';
    ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 18;
    ctx.lineWidth = 2.5 * (1 - fp);
    ctx.beginPath(); ctx.arc(f.x, f.y, CELL * 0.28 * fp * 2.2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Impact rings
  for (let i = _ronke2ImpactRings.length - 1; i >= 0; i--) {
    const r = _ronke2ImpactRings[i];
    const age = now - r.born;
    const dur = 380;
    if (age > dur) { _ronke2ImpactRings.splice(i, 1); continue; }
    const rp = age / dur;
    ctx.save();
    ctx.globalAlpha = (1 - rp) * 0.75;
    ctx.strokeStyle = '#ff8800';
    ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 14;
    ctx.lineWidth = 3 * (1 - rp);
    ctx.beginPath(); ctx.arc(r.x, r.y, CELL * 0.18 + CELL * 0.7 * rp, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - rp) * 0.35;
    ctx.fillStyle = '#ff6600';
    ctx.beginPath(); ctx.arc(r.x, r.y, CELL * 0.18 + CELL * 0.45 * rp, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  if (!S.ronke2Projectiles?.length) return;

  S.ronke2Projectiles.forEach(p => {
    if (p.done) return;
    const t = Math.min((now - p.born) / p.duration, 1);
    const cx = p.sx + (p.tx - p.sx) * t;
    const cy = p.sy + (p.ty - p.sy) * t;

    // Trail: record position every frame
    p.trail.push({ x: cx, y: cy, t: now });
    // Keep only last 180ms of trail
    while (p.trail.length > 1 && now - p.trail[0].t > 180) p.trail.shift();

    // Grow-in scale (first 160ms)
    const growT = Math.min((now - p.born) / 160, 1);
    const scale = 0.15 + 0.85 * (1 - Math.pow(1 - growT, 3)); // ease-out cubic

    const r = CELL * 0.2 * scale;
    const pulse = 0.82 + 0.18 * Math.sin((now - p.born) * 0.022);

    ctx.save();

    // Trail segments
    for (let i = 1; i < p.trail.length; i++) {
      const tr = p.trail[i];
      const age = now - tr.t;
      const ta = 1 - age / 180;
      const tr0 = p.trail[i - 1];
      ctx.globalAlpha = ta * 0.45;
      ctx.strokeStyle = '#ff6600';
      ctx.lineWidth = r * 1.6 * ta;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(tr0.x, tr0.y); ctx.lineTo(tr.x, tr.y); ctx.stroke();
    }

    // Outer glow
    ctx.globalAlpha = 1;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.8 * pulse);
    grd.addColorStop(0,   'rgba(255,200,80,0.7)');
    grd.addColorStop(0.35,'rgba(255,90,0,0.5)');
    grd.addColorStop(1,   'rgba(255,30,0,0)');
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.8 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = grd; ctx.fill();

    // Core orb
    const core = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    core.addColorStop(0,   '#fffbe8');
    core.addColorStop(0.35,'#ffcc00');
    core.addColorStop(0.75,'#ff5500');
    core.addColorStop(1,   '#cc2200');
    ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = core; ctx.fill();

    ctx.restore();

    if (t >= 1 && !p.hit) {
      p.hit = true; p.done = true;
      const ix = (p.targetGx + 0.5) * CELL, iy = (p.targetGy + 0.5) * CELL - CELL * 0.35;
      _ronke2ImpactRings.push({ x: ix, y: iy, born: now });
      spawnHit(p.targetGx, p.targetGy, '#ff8800', 28);
      SFX.play(200, 0.14, 0.22, 'sawtooth');
      S.shake = Math.max(S.shake || 0, 7);
      if (S.units) {
        if (p.fromTeam === 0) {
          // Hero orb: damage first enemy at target
          const _enemy = S.units.find(u => u.team !== 0 && u.alive && u.x === p.targetGx && u.y === p.targetGy);
          if (_enemy) {
            _enemy.hp = (_enemy.hp ?? 1) - 5;
            spawnDmgNumber(p.targetGx, p.targetGy, '-5', '#ff8800', 20, 'crit');
            if (_enemy.hp <= 0 && !S.winner) {
              _enemy.alive = false; _enemy.deathT = 1;
              spawnDeath(_enemy.x, _enemy.y, _enemy.color || '#ff6600');
              S.kills = (S.kills || 0) + 1; trackKill();
              if (!Profile.stats) Profile.stats = { totalKills: 0 };
              Profile.stats.totalKills = (Profile.stats.totalKills || 0) + 1;
              saveProfile(); _updateKillsDisplay();
              if (gameMode === 'adventure') {
                const _ox = _enemy.x, _oy = _enemy.y;
                setTimeout(() => { if (S && S.loot) { spawnRonkeDrop(_ox, _oy); } }, _DEAD_TOTAL * _DEAD_MS + 100);
              }
            }
            logEvent(`RONKE ORB HIT: Enemy took 5 DMG!`, 'dmg');
          }
        } else {
          // NPC orb: damage hero
          const _hero = S.units.find(u => u.team === 0 && u.alive && u.x === p.targetGx && u.y === p.targetGy);
          if (_hero) {
            const _dmg = 5;
            S.energy = Math.max(0, S.energy - heroDmg(_dmg));
            spawnDmgNumber(p.targetGx, p.targetGy, `-${heroDmg(_dmg)}`, '#ff8800', 20, 'crit');
            SFX.heroHit();
            logEvent(`RONKE ORB: Hero took ${heroDmg(_dmg)} DMG!`, 'dmg');
          }
        }
      }
    }
  });
  if (S.ronke2Projectiles) S.ronke2Projectiles = S.ronke2Projectiles.filter(p => !p.done);
}

// ---- Mobile hero directional arrows (drawn on canvas, camera space) ----
const _isTouchUI = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function drawMobileHeroArrows() {
  if (!_isTouchUI || gameMode !== 'adventure') return;
  if (!S || S.phase === 'gameover') return;
  if (S.phase !== 'frozen' || S.clockSide !== 0) return; // only on player's turn
  const hero = S._hero || S.units?.find(u => u.team === 0 && u.alive);
  if (!hero) return;

  const hx = (hero.rx + 0.5) * CELL;
  const hy = (hero.ry + 0.5) * CELL;
  const dist = CELL * 1.65;
  const R    = CELL * 0.5;
  const now  = performance.now();
  const pulse = 0.78 + 0.22 * Math.sin(now * 0.0038);

  const dirs = [
    { dx:  0, dy: -1, angle: -Math.PI / 2 },
    { dx:  0, dy:  1, angle:  Math.PI / 2 },
    { dx: -1, dy:  0, angle:  Math.PI     },
    { dx:  1, dy:  0, angle:  0           },
  ];

  ctx.save();
  dirs.forEach(d => {
    const nx = hero.x + d.dx, ny = hero.y + d.dy;
    const passable = nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS
      && !isWall(nx, ny)
      && !S.units.some(u => u.alive && u.id !== hero.id && u.x === nx && u.y === ny);

    const ax = hx + d.dx * dist;
    const ay = hy + d.dy * dist;

    ctx.save();
    ctx.globalAlpha = passable ? 0.65 * pulse : 0.12;
    ctx.translate(ax, ay);
    ctx.rotate(d.angle);

    // Circle bg
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    ctx.strokeStyle = passable ? '#00ff88' : '#223322';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Triangle arrow
    if (passable) {
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 7;
    }
    ctx.fillStyle = passable ? '#00ff88' : '#334433';
    ctx.beginPath();
    ctx.moveTo( R * 0.42,  0);
    ctx.lineTo(-R * 0.24, -R * 0.33);
    ctx.lineTo(-R * 0.24,  R * 0.33);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  });
  ctx.restore();
}

function drawThreatIndicators() {
  if (S.phase === 'gameover') return;
  const pulse = (Math.sin(performance.now() * 0.014) + 1) * 0.5;

  // Pre-build unit position map once — used by both laser and bullet threat loops
  const _enemyPosMap = new Map();
  S.units.forEach(u => { if (u.alive) _enemyPosMap.set(u.x + ',' + u.y, u); });

  S.lasers.forEach(laser => {
    if (!laser.active) return;
    for (const cell of laser.cells) {
      const u = _enemyPosMap.get(cell.x + ',' + cell.y);
      if (!u || u.team === laser.owner) continue;
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

    const u = _enemyPosMap.get(nx + ',' + ny) || (bThrSpd === 2 && _enemyPosMap.get(midx + ',' + midy));
    if (!u || u.team === b.owner) return;
    {

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
    }
  });
}


// heroAnimFrames = { idle: {east:[img,...], south:[...], ...}, walk: {...} }
// Populated by loadHeroAnimSprites() after PixelLab images are downloaded.
const HERO_ANIM_FPS = { idle: 5, walk: 10, fight: 14 };

function getHeroFrame(u, dir) {
  const isMoving = Math.abs(u.rx - u.x) > 0.05 || Math.abs(u.ry - u.y) > 0.05;

  // One-shot sword swing on shoot — plays attack anim exactly once
  const swingFps      = HERO_ANIM_FPS['fight'];
  const swingFrameCount = (heroAnimFrames['fight'][dir] || []).length || 4;
  const swingDuration = (swingFrameCount / swingFps) * 1000;
  const swingElapsed  = u.swingStart ? performance.now() - u.swingStart : Infinity;
  const isSwinging    = swingElapsed < swingDuration;

  let anim = 'idle';
  if (isSwinging)    anim = 'fight';
  else if (isMoving) anim = 'walk';

  const fps    = HERO_ANIM_FPS[anim];
  const frames = heroAnimFrames[anim][dir];
  if (!frames || frames.length === 0) return { img: heroImgs[dir], anim };

  let idx;
  if (isSwinging) {
    // Clamp to last frame when done (won't loop)
    idx = Math.min(Math.floor(swingElapsed / (1000 / swingFps)), swingFrameCount - 1);
  } else {
    idx = Math.floor(performance.now() / (1000 / fps)) % frames.length;
  }
  return { img: frames[idx], anim };
}


function angleToDir(angle) {


  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI * 0.25 || a >= Math.PI * 1.75) return 'east';
  if (a < Math.PI * 0.75) return 'south';
  if (a < Math.PI * 1.25) return 'west';
  return 'north';
}

function _drawRonke2HeroSprite(cx, cy, u, alpha) {
  const frame = getRonke2FrameState(u);
  const sprSz = UNIT_CELL * 3.4;
  const yOff  = -20;
  if (frame && frame.sheet && frame.sheet.complete && frame.sheet.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.5 : 1);
    // BODY_FRAC=0.25 (body at x=160/640 of frame). Center body at cx:
    // draw origin = cx - BODY_FRAC*sprSz = cx - sprSz/4
    const _drawX = cx - sprSz / 4;
    if ((u.facing?.dx ?? 1) < 0) {
      ctx.save();
      ctx.translate(_drawX, cy + yOff);
      ctx.scale(-1, 1);
      ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, -sprSz / 2, -sprSz / 2, sprSz, sprSz);
      ctx.restore();
    } else {
      ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, _drawX, cy - sprSz / 2 + yOff, sprSz, sprSz);
    }
    ctx.restore();
    if (u.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * u.hitFlash * 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx, cy, sprSz * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  } else {
    // Fallback circle
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#3355cc';
    ctx.beginPath(); ctx.arc(cx, cy, UNIT_CELL * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawHeroPixelArt(cx, cy, u, alpha, inactive) {
  const t = performance.now();
  const isMoving = Math.abs(u.rx - u.x) > 0.01 || Math.abs(u.ry - u.y) > 0.01;
  const isDanger = (u._adjEnemy || u._bulletDanger) || false;
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
  const sz = UNIT_CELL * 0.30;
  const WFORMS = {
    bullet:  { bm:1.40, lm:0,    la:[80,120], ll:1.00, lc:'#1a5c2a', ltip:'#33ff88', oc:'#2a6010', gc:null       },
    laser:   { bm:1.00, lm:1,    la:[80,120], ll:1.00, lc:'#1a5c2a', ltip:'#33ff88', oc:'#0d4d2a', gc:null       },
    heavy:   { bm:1.60, lm:0,    la:[80,120], ll:1.00, lc:'#7a3500', ltip:'#ff6600', oc:'#8a3a00', gc:'#ff5500'  },
    shotgun: { bm:1.40, lm:0,    la:[80,120], ll:1.00, lc:'#1a5c2a', ltip:'#33ff88', oc:'#2a6010', gc:null       },
    hack:    { bm:1.35, lm:1,    la:[70,110], ll:0.50, lc:'#004488', ltip:'#44ccff', oc:'#003366', gc:'#0088ff'  },
    ronke:   { bm:1.00, lm:1,    la:[80,120], ll:1.00, lc:'#1a5c2a', ltip:'#33ff88', oc:'#0d4d2a', gc:null       },
  };
  const wfb = u.wfb || { from:'bullet', to:'bullet', t:1 };
  const fA = WFORMS[wfb.from] || WFORMS.bullet;
  const fB = WFORMS[wfb.to]   || WFORMS.bullet;
  const btt = wfb.t;
  const wL = (a, b) => a + (b - a) * btt;
  const bodyMult   = wL(fA.bm,     fB.bm);
  const legMult    = wL(fA.lm,     fB.lm);
  const legLenMult = wL(fA.ll,     fB.ll);
  const legAng0    = wL(fA.la[0],  fB.la[0]);
  const legAng1    = wL(fA.la[1],  fB.la[1]);
  const legColor   = btt > 0.5 ? fB.lc   : fA.lc;
  const tipColor   = btt > 0.5 ? fB.ltip : fA.ltip;
  const outlineColor = btt > 0.5 ? fB.oc : fA.oc;
  const glowColor  = btt > 0.5 ? fB.gc   : fA.gc;
  const curWep     = wfb.to;
  const bsz        = sz * bodyMult;

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

  // Weapon form: legs, arcs, glow effects
  {
    const legPairs = [
      { sideAng: legAng0, phase: 0       },
      { sideAng: legAng1, phase: Math.PI },
    ];
    const walkT   = t * 0.010;
    const walkAmt = isMoving ? 0.18 : 0;
    const sideTips = [[], []];

    if (legMult > 0.01) {
      ctx.lineWidth = 1.3;
      ctx.shadowBlur = 4; ctx.shadowColor = tipColor;
      for (let pi = 0; pi < legPairs.length; pi++) {
        const lp = legPairs[pi];
        for (let side = 0; side < 2; side++) {
          const sd   = side === 0 ? 1 : -1;
          const step = Math.sin(walkT + lp.phase) * walkAmt;
          const baseAng = angle + sd * (lp.sideAng * Math.PI / 180);
          const kx = Math.cos(baseAng) * bsz * 1.05 * legMult * legLenMult;
          const ky = Math.sin(baseAng) * bsz * 1.05 * legMult * legLenMult;
          const fx = kx + Math.cos(baseAng) * sz * 0.95 * legMult * legLenMult
                       + Math.cos(angle) * step * sz * 2.8 * legMult;
          const fy = ky + Math.sin(baseAng) * sz * 0.95 * legMult * legLenMult
                       + Math.sin(angle) * step * sz * 2.8 * legMult;
          sideTips[side].push([fx, fy]);
          ctx.globalAlpha = alpha * 0.9 * legMult;
          ctx.strokeStyle = legColor;
          ctx.beginPath();
          ctx.moveTo(Math.cos(baseAng) * bsz * 0.88, Math.sin(baseAng) * bsz * 0.88);
          ctx.lineTo(kx, ky);
          ctx.lineTo(fx, fy);
          ctx.stroke();
          ctx.globalAlpha = alpha * 0.6 * legMult;
          ctx.fillStyle = tipColor;
          ctx.beginPath(); ctx.arc(fx, fy, 1.3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // Weapon-specific glow ring
    if (glowColor) {
      ctx.globalAlpha = alpha * (0.22 + Math.sin(t * 0.004) * 0.08);
      ctx.strokeStyle = glowColor; ctx.lineWidth = 2.5;
      ctx.shadowBlur = 14; ctx.shadowColor = glowColor;
      ctx.beginPath(); ctx.arc(0, 0, bsz * 1.18, 0, Math.PI * 2); ctx.stroke();
    }

    // Heavy: rotating spikes around body
    if (curWep === 'heavy' && legMult < 0.5) {
      ctx.lineWidth = 2; ctx.shadowBlur = 6; ctx.shadowColor = '#ff5500';
      for (let i = 0; i < 6; i++) {
        const sa = (i / 6) * Math.PI * 2 + t * 0.0008;
        ctx.globalAlpha = alpha * (1 - legMult) * 0.65;
        ctx.strokeStyle = '#ff5500';
        ctx.beginPath();
        ctx.moveTo(Math.cos(sa) * bsz * 0.95, Math.sin(sa) * bsz * 0.95);
        ctx.lineTo(Math.cos(sa) * bsz * 1.30, Math.sin(sa) * bsz * 1.30);
        ctx.stroke();
      }
    }

    // Laser arc between same-side leg tips
    const arcReady = curWep === 'laser' && legMult > 0.9 && shootFlash < 0.05 && (t - (u.laserShotAt || 0)) > 500;
    if (arcReady) {
      ctx.save();
      for (let side = 0; side < 2; side++) {
        if (sideTips[side].length < 2) continue;
        const [x0, y0] = sideTips[side][0];
        const [x1, y1] = sideTips[side][1];
        const dist = Math.hypot(x1 - x0, y1 - y0);
        const nx = -(y1 - y0) / dist, ny = (x1 - x0) / dist;
        const segs = 5;
        const dA = (lineW, color, alphaM, spread) => {
          ctx.strokeStyle = color; ctx.lineWidth = lineW;
          ctx.globalAlpha = alpha * alphaM * (0.7 + Math.random() * 0.3);
          ctx.beginPath(); ctx.moveTo(x0, y0);
          for (let i = 1; i < segs; i++) {
            const f = i / segs;
            const off = (Math.random() - 0.5) * dist * spread;
            ctx.lineTo(x0+(x1-x0)*f+nx*off, y0+(y1-y0)*f+ny*off);
          }
          ctx.lineTo(x1, y1); ctx.stroke();
        };
        ctx.shadowBlur = 7; ctx.shadowColor = '#00ffff';
        dA(1.2,'#00ccff',0.28,0.45); dA(0.6,'#00ffff',0.75,0.35); dA(0.3,'#ffffff',0.55,0.20);
        ctx.globalAlpha = alpha * 0.85; ctx.fillStyle = '#00ffff'; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(x0, y0, 1.2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x1, y1, 1.2, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 0;
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

  // Warrior sprite body
  {
    const sprDir = dx < 0 ? 'west' : 'east';
    const { img: wImg } = getHeroFrame(u, sprDir);
    const sprSz = UNIT_CELL * 2.6 - 10;
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha * (isLowHp && t % 200 < 50 ? 0.55 : 1);
    if (wImg && wImg.complete && wImg.naturalWidth > 0) {
      ctx.drawImage(wImg, -sprSz / 2, -sprSz / 2, sprSz, sprSz);
    }
    // Hit flash overlay
    if (u.hitTimer > 0) {
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, sprSz * 0.38, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = alpha;
  }

  ctx.restore();
}


function enemyHueRotate(color) {
  // Map enemy color to hue-rotate so cyan sprite becomes that color
  const map = {
    '#ff3c55': 170,
    '#ff6622': 200,
    '#dd1a40': 175,
    '#cc30ff': 100,
  };
  return map[color] !== undefined ? map[color] : 170;
}


function drawEnemyWorm(cx, cy, u, alpha) {
  try {
    const t = performance.now();
    const isHit = u.hitFlash > 0;
    const baseColor = isHit ? '#ffffff' : u.color;

    const sz = UNIT_CELL * 0.18 * (u.scale || 1.0);

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
    const _fLen = Math.hypot(u.facing.dx, u.facing.dy) || 1;
    const vX = u.facing.dx / _fLen;
    const vY = u.facing.dy / _fLen;

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
    const segments = 24;
    ctx.shadowBlur = isHit ? 30 : 15;
    ctx.shadowColor = baseColor;
    const _waveBase = t * 0.015 + u.id; // hoisted: constant per unit per frame

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
      const wave = Math.sin(_waveBase - ratio * Math.PI * 4);
      const wiggleAmt = wave * sz * 0.35 * Math.sin(ratio * Math.PI); // middle wiggles most
      const wX = pt.x + pX * wiggleAmt;
      const wY = pt.y + pY * wiggleAmt;


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


    const ptHead = getPathPoint(0);
    const ptBehindHead = getPathPoint(0.05);
    const headAngle = Math.atan2(ptHead.y - ptBehindHead.y, ptHead.x - ptBehindHead.x);

    const eyeDist = sz * 0.5;
    const eyeSize = sz * 0.3;


    const timeBucketL = Math.floor(t / 150) + u.id;
    const timeBucketR = Math.floor(t / 180) + u.id * 2;


    const randL = Math.abs(Math.sin(timeBucketL * 43758.5453) % 1);
    const randR = Math.abs(Math.sin(timeBucketR * 21474.8364) % 1);


    // Sumirksima tik mazdaug karta per 2 - 5 sekundes
    const isLeftBlink = randL > 0.985;
    const isRightBlink = randR > 0.98;

    ctx.fillStyle = '#010101';

    if (!isLeftBlink) {
      const leX = cH.x + Math.cos(headAngle - 0.5) * eyeDist;
      const leY = cH.y + Math.sin(headAngle - 0.5) * eyeDist;
      ctx.beginPath();
      ctx.arc(leX, leY, eyeSize, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!isRightBlink) {

      const reX = cH.x + Math.cos(headAngle + 0.6) * eyeDist * 1.1;
      const reY = cH.y + Math.sin(headAngle + 0.6) * eyeDist * 1.1;
      ctx.beginPath();
      ctx.arc(reX, reY, eyeSize * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  } catch (e) { console.error("Enemy render error:", e); }
}

function drawEnemyShieldBot(cx, cy, u, alpha) {
  try {
    const t = performance.now();
    const isHit = u.hitFlash > 0;
    const baseColor = isHit ? '#ffffff' : u.color;
    const sz = CELL * 0.38 * (u.scale || 1.0);
    const sd = u.shieldDir || { dx: 1, dy: 0 };

    ctx.save();
    ctx.globalAlpha = alpha;

    // Bob
    const bob = Math.sin(t * 0.002 + u.id) * 2;

    // Shadow
    ctx.save();
    ctx.translate(0, 6);
    ctx.globalAlpha = alpha * 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, cy + bob, sz * 0.8, sz * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body glow
    ctx.shadowColor = baseColor;
    ctx.shadowBlur = isHit ? 30 : 14;

    // Hexagonal body
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      const px = cx + Math.cos(a) * sz;
      const py = cy + bob + Math.sin(a) * sz;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#0a0a1a';
    ctx.fill();
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Core inner circle
    ctx.beginPath();
    ctx.arc(cx, cy + bob, sz * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();

    // Dark pupil
    ctx.beginPath();
    ctx.arc(cx + sd.dx * sz * 0.18, cy + bob + sd.dy * sz * 0.18, sz * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#010214';
    ctx.fill();

    // === SHIELD ARC on facing side ===
    const shieldAngle = Math.atan2(sd.dy, sd.dx);
    const shieldSpread = Math.PI * 0.65;
    const shieldR = sz * 1.35;
    const pulse = 0.75 + 0.25 * Math.sin(t * 0.006);

    // Shield glow outer
    ctx.save();
    ctx.shadowColor = '#44aaff';
    ctx.shadowBlur = 18 * pulse;
    ctx.strokeStyle = `rgba(68,170,255,${0.35 * pulse})`;
    ctx.lineWidth = sz * 0.45;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy + bob, shieldR, shieldAngle - shieldSpread, shieldAngle + shieldSpread);
    ctx.stroke();
    ctx.restore();

    // Shield bright core
    ctx.save();
    ctx.shadowColor = '#aaddff';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = isHit ? '#ffffff' : '#88ccff';
    ctx.lineWidth = sz * 0.18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy + bob, shieldR, shieldAngle - shieldSpread, shieldAngle + shieldSpread);
    ctx.stroke();
    ctx.restore();

    // Shield edge dots
    for (let s = -1; s <= 1; s += 2) {
      const ea = shieldAngle + s * shieldSpread;
      const ex = cx + Math.cos(ea) * shieldR;
      const ey = cy + bob + Math.sin(ea) * shieldR;
      ctx.beginPath();
      ctx.arc(ex, ey, sz * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = '#aaddff';
      ctx.shadowColor = '#aaddff';
      ctx.shadowBlur = 8;
      ctx.fill();
    }

    ctx.restore();
  } catch (e) { console.error('Shield render error:', e); }
}

function drawEnemyBinarySwarm(cx, cy, u, alpha) {
  try {
    const t = performance.now();
    const isHit = u.hitFlash > 0;
    const sz = UNIT_CELL * 0.45 * (u.scale || 1.0);
    const isElite = !!u.isElite;
    const baseColor = isElite ? '#49b8ff' : '#ffffff';

    const angle = Math.atan2(u.facing.dy, u.facing.dx);
    const recoil = u.hitFlash > 0 ? -4 : 0;
    const cxRecoil = cx + Math.cos(angle) * recoil;
    const cyRecoil = cy + Math.sin(angle) * recoil;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cxRecoil, cyRecoil);

    ctx.save();
    ctx.translate(0, 6);
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, 0, sz * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.shadowBlur = isHit ? (isElite ? 14 : 20) : (isElite ? 8 : 12);
    ctx.shadowColor = baseColor;
    ctx.fillStyle = baseColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxHealth = u.maxHp || 1;
    const healthRatio = Math.max(0.1, u.hp / maxHealth);
    const numChars = isElite ? 6 : Math.floor(18 * (u.scale || 1.0));
    const shake = (1.0 - healthRatio) * 6;
    const timeOffset = u.id * 3721.4;
    const enemyTime = t + timeOffset;
    const unitSpeedMult = 0.7 + ((u.id * 17) % 6) * 0.1;
    // Hoist elite font (constant for all chars) and precompute time offsets
    const _eliteTs = isElite ? Math.max(11, sz * 0.56) : 0;
    if (isElite) ctx.font = `bold ${_eliteTs}px monospace`;
    const _et1 = enemyTime * 0.001;
    const _et2 = enemyTime * 0.0018;
    const _et3 = enemyTime * 0.05;
    const _et4 = enemyTime * 0.0009;
    const _et5 = enemyTime * 0.004;
    const _et6 = enemyTime * 0.01;

    for (let i = 0; i < numChars; i++) {
      const rSeed = u.id * 314.15 + i * 15.3;
      const speed = (0.001 + (i % 3) * 0.0015) * unitSpeedMult;
      const pulseIn = Math.sin(_et1 + rSeed) * (sz * 0.15);
      const r = isElite
        ? sz * 0.9 + Math.sin(_et2 + i) * (sz * 0.08)
        : sz * 1.5 * Math.abs(Math.sin(rSeed)) + pulseIn;
      const theta = isElite
        ? ((Math.PI * 2) / numChars) * i + _et4
        : (rSeed * 0.9) + enemyTime * speed * (i % 2 === 0 ? 1 : -1);

      const _js = _et3 + rSeed;
      const jX = Math.sin(_js) * shake;
      const jY = Math.cos(_js) * shake;
      const px = Math.cos(theta) * r + jX;
      const py = Math.sin(theta) * r + jY;
      const char = isElite ? (i < 3 ? '1' : '0') : (Math.floor((_et6 * (1 + i * 0.1) + rSeed) % 2) === 0 ? '0' : '1');
      if (!isElite) {
        const ts = Math.max(8, sz * 0.8 * (1 - (r / (sz * 2.0))) + 8);
        ctx.font = `bold ${ts}px monospace`;
      }
      ctx.globalAlpha = isElite
        ? alpha * (0.82 + Math.sin(_et5 + i) * 0.12)
        : alpha * (0.4 + Math.abs(Math.sin(_et6 + rSeed)) * 0.6);
      ctx.fillStyle = (isHit && i % 2 === 0) ? (isElite ? '#bfe6ff' : '#fff') : baseColor;
      ctx.fillText(char, px, py);
    }

    ctx.restore();
  } catch (e) { console.error("Enemy render error:", e); }
}

function drawEnemyFortress(cx, cy, u, alpha) {
  try {
    const t = performance.now();
    const isHit = u.hitFlash > 0;
    const isDamaged = u.hp <= (u.maxHp || 1) * 0.4;
    const sz = (UNIT_CELL * 0.65 * (u.scale || 1.0)) - 7; // sumazinta 3px is visu pusiu
    const baseColor = isHit ? '#ffffff' : (isDamaged ? '#ff4444' : u.color);

    // Slight shake & recoil
    const shakeAmt = isDamaged ? 1.5 : 0;
    const recoil = isHit ? -3 : 0;
    const targetAngle = Math.atan2(u.facing.dy, u.facing.dx);
    if (u.visualTargetAngle === undefined) u.visualTargetAngle = targetAngle;
    if (u.renderAngle === undefined) u.renderAngle = targetAngle;

    // Calculate logical difference between intent and visual target
    let logicalDiff = targetAngle - u.visualTargetAngle;
    while (logicalDiff > Math.PI) logicalDiff -= Math.PI * 2;
    while (logicalDiff < -Math.PI) logicalDiff += Math.PI * 2;

    // Always update visual target angle so the visual model matches the logical bounding box
    u.visualTargetAngle = u.visualTargetAngle + logicalDiff;

    // Smooth rotation (shortest path)
    let diff = u.visualTargetAngle - u.renderAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // 0.15 is rotation speed interpolation factor
    u.renderAngle += diff * 0.15;

    const _ftLen = Math.hypot(u.facing.dx, u.facing.dy) || 1;
    const _fvX = u.facing.dx / _ftLen, _fvY = u.facing.dy / _ftLen;
    const _shX = shakeAmt ? (Math.random() - 0.5) * shakeAmt : 0;
    const _shY = shakeAmt ? (Math.random() - 0.5) * shakeAmt : 0;
    const cxRecoil = cx + _fvX * recoil + _shX;
    const cyRecoil = cy + _fvY * recoil + _shY;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cxRecoil, cyRecoil);

    // Shadow
    ctx.save();
    ctx.translate(0, 8);
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
    ctx.restore();

    // Use smoothly interpolated angle for rotation
    ctx.rotate(u.renderAngle);

    // Thick Steel Box (Side view relative to facing)
    ctx.fillStyle = isHit ? '#ffffff' : '#45505b'; // Dark steel base
    ctx.strokeStyle = '#1a1f24'; // Very dark border
    ctx.lineWidth = 3;

    ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
    ctx.strokeRect(-sz, -sz, sz * 2, sz * 2);

    // Tank Treads (Sides of the unit)
    // Only animate treads when the unit is actively moving or changing position.
    if (u.treadOffset === undefined) u.treadOffset = 0;

    // Check if moving between cells
    const moveDx = u.x - u.px;
    const moveDy = u.y - u.py;
    const isMoving = Math.abs(moveDx) > 0.01 || Math.abs(moveDy) > 0.01;

    // Check if turning (renderAngle is lagging behind visualTargetAngle materially)
    const isTurning = Math.abs(diff) > 0.02;

    if (isMoving) {
      const moveDot = moveDx * Math.cos(u.renderAngle) + moveDy * Math.sin(u.renderAngle);
      u.treadOffset += (moveDot >= 0 ? 1.0 : -1.0); // Speed of tread animation during movement (forward or backward)
    } else if (isTurning) {
      u.treadOffset += (diff > 0 ? 1.5 : -1.5); // Turn treads based on rotation
    }

    ctx.fillStyle = '#111'; // Dark background of treads
    ctx.strokeStyle = '#6a7885'; // Lighter steel tread links
    ctx.lineWidth = sz * 0.35;

    // Set a dashed line to simulate tread links
    ctx.setLineDash([sz * 0.15, sz * 0.1]);
    ctx.lineDashOffset = -(u.treadOffset % (sz * 0.6));

    // "Left" tread (top in rotated view)
    // Draw dark background
    ctx.fillRect(-sz, -sz, sz * 2, sz * 0.35);
    // Draw tread lines
    ctx.beginPath();
    ctx.moveTo(-sz, -sz + sz * 0.175);
    ctx.lineTo(sz, -sz + sz * 0.175);
    ctx.stroke();

    // "Right" tread (bottom in rotated view)
    // Draw dark background
    ctx.fillRect(-sz, sz * 0.65, sz * 2, sz * 0.35);
    // Draw tread lines (opposite offset direction for turning illusion if we wanted, but uniform is fine)
    ctx.beginPath();
    ctx.moveTo(-sz, sz * 0.825);
    ctx.lineTo(sz, sz * 0.825);
    ctx.stroke();

    ctx.setLineDash([]); // Reset line dash
    ctx.lineWidth = 3; // Reset line width


    // Vulnerable Front & Back Grates
    ctx.fillStyle = '#0a0d10'; // Darker cavity
    // Back grate
    ctx.fillRect(-sz, -sz * 0.4, sz * 0.25, sz * 0.8);
    // Front grate (larger opening)
    ctx.fillRect(sz * 0.75, -sz * 0.5, sz * 0.25, sz);

    // Top Vents / Details
    ctx.fillStyle = '#1a1f24';
    ctx.fillRect(-sz * 0.5, -sz * 0.6, sz * 0.8, sz * 0.2); // Top-left vent
    ctx.fillRect(-sz * 0.5, sz * 0.4, sz * 0.8, sz * 0.2);  // Bottom-left vent

    // Vent slits
    ctx.fillStyle = '#0a0d10';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(-sz * 0.4 + i * (sz * 0.18), -sz * 0.55, sz * 0.08, sz * 0.1);
      ctx.fillRect(-sz * 0.4 + i * (sz * 0.18), sz * 0.45, sz * 0.08, sz * 0.1);
    }

    // --- Heavy Back Armor Plate ---
    ctx.fillStyle = '#45505b'; // Same as base armor
    ctx.strokeStyle = '#1a1f24';
    ctx.lineWidth = 2;
    // Draw a thick plate covering the back grate
    ctx.beginPath();
    ctx.moveTo(-sz * 1.0, -sz * 0.7);
    ctx.lineTo(-sz * 1.25, -sz * 0.5);
    ctx.lineTo(-sz * 1.25, sz * 0.5);
    ctx.lineTo(-sz * 1.0, sz * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rivets/Details on Back Armor
    ctx.fillStyle = '#1a1f24';
    ctx.beginPath(); ctx.arc(-sz * 1.15, -sz * 0.4, sz * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-sz * 1.15, sz * 0.4, sz * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-sz * 1.15, 0, sz * 0.06, 0, Math.PI * 2); ctx.fill();

    // --- Singleton Front Cannon ---
    ctx.fillStyle = '#222830'; // Dark steel cannon barrels
    ctx.strokeStyle = '#000000'; // Cannon outlines
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#000';

    // Main heavy cannon sticking out the front center
    ctx.fillRect(sz * 0.95, -sz * 0.15, sz * 0.5, sz * 0.3); // Base barrel
    ctx.strokeRect(sz * 0.95, -sz * 0.15, sz * 0.5, sz * 0.3);

    // Muzzle / Tip
    ctx.fillStyle = '#11151a';
    ctx.fillRect(sz * 1.45, -sz * 0.18, sz * 0.15, sz * 0.36);
    ctx.strokeRect(sz * 1.45, -sz * 0.18, sz * 0.15, sz * 0.36);
    // Inner hole
    ctx.fillStyle = '#0a0d10';
    ctx.fillRect(sz * 1.6, -sz * 0.08, sz * 0.05, sz * 0.16);

    // Glowing Energy Core inside the grate
    const corePulse = Math.sin(t * 0.002 + u.id); // Slower, smoother pulse
    const coreGlow = 0.5 + 0.5 * Math.abs(corePulse); // Never fully dims
    const coreColor = isDamaged ? '#ff2222' : '#00e5ff'; // Slightly cooler cyan

    ctx.fillStyle = isHit ? '#ffffff' : coreColor;
    ctx.shadowBlur = 10 + coreGlow * 10; // Smoother glow
    ctx.shadowColor = coreColor;

    // Draw the core glowing through the front (steady main block)
    ctx.fillRect(sz * 0.78, -sz * 0.3, sz * 0.18, sz * 0.6);

    // Core pulsing through the back slightly
    ctx.fillStyle = isHit ? '#ffffff' : coreColor;
    ctx.shadowBlur = 8 + coreGlow * 8;
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillRect(-sz * 0.95, -sz * 0.25, sz * 0.1, sz * 0.5);
    ctx.globalAlpha = alpha;

    // --- NEW: Prominent Top-Down Mini Processor ---
    // Draw directly in the center of the roof so it's clearly visible from top-down perspective
    ctx.fillStyle = '#11151a'; // Dark tech color
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#000000';
    ctx.fillRect(-sz * 0.2, -sz * 0.2, sz * 0.4, sz * 0.4); // Centered square processor

    // Processor details (pins/lines)
    ctx.fillStyle = '#6a7885';
    ctx.fillRect(-sz * 0.25, -sz * 0.1, sz * 0.05, sz * 0.2); // Left pins
    ctx.fillRect(sz * 0.2, -sz * 0.1, sz * 0.05, sz * 0.2); // Right pins

    // Blinking Light on the Processor
    const blinkCycle = (t * 0.003 + u.id) % 2;
    const isBlinking = blinkCycle < 0.2 || (blinkCycle > 0.4 && blinkCycle < 0.6); // Double blink effect
    if (isBlinking || isHit) {
      ctx.fillStyle = isHit ? '#ffffff' : (isDamaged ? '#ffaaaa' : '#ff3333'); // Bright red blink
      ctx.shadowBlur = 12;
      ctx.shadowColor = ctx.fillStyle;
      // Tiny blinking dot on the processor itself
      ctx.beginPath();
      ctx.arc(sz * 0.08, -sz * 0.08, sz * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle internal glow reflecting on the top armor
    if (!isHit && !isDamaged) {
      ctx.globalAlpha = alpha * 0.12 * coreGlow;
      ctx.fillStyle = coreColor;
      ctx.shadowBlur = 0;
      ctx.fillRect(-sz * 0.2, -sz * 0.4, sz * 0.4, sz * 0.8);
    }

    ctx.restore();
  } catch (e) { console.error("Fortress render error:", e); }
}


function drawEnemyPixelArt(cx, cy, u, alpha) {
  try {
    const t = performance.now();
    const isHit = u.hitFlash > 0;
    const sz = UNIT_CELL * 0.6 * (u.scale || 1.0);
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


    ctx.save();
    ctx.translate(0, 10);
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, 0, sz * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();


    const stripH = 3;
    const startY = -sz * 1.2;
    const endY = sz * 1.2;
    const strips = Math.floor((endY - startY) / stripH);

    // --- GLOBAL SHAPE MORPHING LOGIC ---

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
      } else {
        let wh = sz * 0.2 + sz * 0.65 * Math.pow(Math.abs(yN / 1.15), 1.5);
        let taper = Math.max(0, 1 - Math.pow(Math.abs(yN / 1.15), 10));
        return wh * taper;
      }
    };

    // Hoist per-frame constants out of strip loop
    const _breatheSlow = Math.sin(t * 0.001 + u.id);
    const _tOff2 = t * 0.002 - u.id; // wave1 offset (negated for sin)
    const _tOff4 = t * 0.004;
    const _tOff6 = t * 0.006;
    const _tOff5 = t * 0.005;
    const _nextPhase = (phase + 1) % 4;
    const _szMin = sz * 0.1;
    const _breatheAmp = sz * 0.05;

    // Reuse flat arrays to avoid per-frame object allocation
    const _sY = new Float32Array(strips);
    const _sX = new Float32Array(strips);
    const _sW = new Float32Array(strips);
    const _sMiss = new Uint8Array(strips);

    for (let i = 0; i < strips; i++) {
      const yBase = startY + i * stripH;
      const yNorm = yBase / sz;

      const width1 = getBaseShapeWidth(phase, yNorm);
      const width2 = getBaseShapeWidth(_nextPhase, yNorm);
      let w = width1 * (1 - smoothLerp) + width2 * smoothLerp;

      const wave1 = Math.sin(yNorm * 6 - _tOff2);
      const wave2 = Math.cos(yNorm * 14 + _tOff4);
      const wave3 = Math.sin(yNorm * 28 - _tOff6);
      const distortion = wave1 * 0.35 + wave2 * 0.35 + wave3 * 0.2 + _breatheSlow * 0.2;
      w = Math.max(_szMin, w * (distortion > 0 ? 1.0 + distortion * 0.15 : 1.0 + distortion * 0.8));
      w += _breatheAmp * Math.sin(yNorm * 15 + _tOff5);

      _sY[i] = yBase;
      _sX[i] = -w;
      _sW[i] = w * 2;
      _sMiss[i] = w <= 0 ? 1 : 0;
    }

    // Build path directly from flat arrays — zero object allocation
    ctx.beginPath();
    let _gi = 0;
    while (_gi < strips) {
      while (_gi < strips && _sMiss[_gi]) _gi++;
      if (_gi >= strips) break;
      const _gStart = _gi;
      while (_gi < strips && !_sMiss[_gi]) _gi++;
      const _gEnd = _gi;
      for (let j = _gStart; j < _gEnd; j++) {
        ctx.lineTo(_sX[j], _sY[j]);
        ctx.lineTo(_sX[j], _sY[j] + stripH);
      }
      for (let j = _gEnd - 1; j >= _gStart; j--) {
        ctx.lineTo(_sX[j] + _sW[j], _sY[j] + stripH);
        ctx.lineTo(_sX[j] + _sW[j], _sY[j]);
      }
      ctx.closePath();
    }


    ctx.shadowBlur = isHit ? 40 : 15;
    ctx.shadowColor = baseColor;
    ctx.lineWidth = Math.max(2, sz * 0.08);
    ctx.strokeStyle = isHit ? '#ffffff' : baseColor;
    ctx.stroke();


    ctx.clip();


    ctx.shadowBlur = 0;

    const pSz = Math.max(2.5, sz * 0.12);

    const tbSz = sz * 1.5;

    const trackingSpeed = (isDamaged ? 0.3 : 0.1);
    const trackingBand = ((t * trackingSpeed + u.id * 10) % (tbSz * 4)) - tbSz * 2;

    const signalLoss = Math.sin(t * 0.002 + u.id * 3);
    const isSignalLost = signalLoss > 0.85 && !isHit;


    ctx.fillStyle = '#010101';
    ctx.fillRect(-tbSz * 1.5, -tbSz * 1.5, tbSz * 3, tbSz * 3);


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


function updateNullIdolBlinkState(u, now = performance.now()) {
  if (!u || u.utype !== 'idol') return { eyeOpen: 1 };
  if (!u.idolNextBlinkAt) u.idolNextBlinkAt = now + 900 + Math.random() * 1800;

  if (u.idolBlinkUntil && now >= u.idolBlinkUntil) {
    u.idolBlinkUntil = 0;
    u.idolBlinkStart = 0;
    u.idolBlinkFirePending = true;
    u.idolNextBlinkAt = now + 1400 + Math.random() * 2200;
  }

  if (!u.idolBlinkUntil && now >= u.idolNextBlinkAt) {
    u.idolBlinkStart = now;
    u.idolBlinkUntil = now + 120 + Math.random() * 120;
  }

  let eyeOpen = 1;
  if (u.idolBlinkUntil) {
    const dur = Math.max(1, u.idolBlinkUntil - u.idolBlinkStart);
    const p = Math.max(0, Math.min(1, (now - u.idolBlinkStart) / dur));
    eyeOpen = Math.max(0.08, Math.abs(p - 0.5) * 2);
  }

  return { eyeOpen };
}

function drawEnemyNullIdol(cx, cy, u, alpha) {
  const t = performance.now();
  const blink = updateNullIdolBlinkState(u, t);
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.005 + u.id);
  const bob = Math.sin(t * 0.0022 + u.id) * 2.5;
  const scale = u.scale || 1.0;
  const outerR = UNIT_CELL * 0.42 * scale;
  const coreR = outerR * 0.42;
  let flipWidth = 1;
  let faceLit = true;
  if (u.idolFlipUntil && t < u.idolFlipUntil) {
    const dur = Math.max(1, u.idolFlipUntil - (u.idolFlipStart || (u.idolFlipUntil - 500))); // Fast spin
    const p = Math.max(0, Math.min(1, (t - (u.idolFlipStart || 0)) / dur));
    const flipAngle = p * Math.PI * 4; // Spin twice over the duration
    const flipX = Math.cos(flipAngle);
    flipWidth = Math.max(0.12, Math.abs(flipX));
    faceLit = flipX > 0; // Front face lit
  } else if (u.idolFlipUntil) {
    u.idolFlipStart = 0;
    u.idolFlipUntil = 0;
  }


  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy + bob);

  ctx.save();
  ctx.translate(0, 8);
  ctx.globalAlpha = alpha * 0.28;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 0, outerR * 0.82, outerR * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.scale(flipWidth, 1);
  ctx.rotate(Math.sin(t * 0.0008 + u.id) * 0.08);

  ctx.shadowColor = '#5fd8ff';
  ctx.shadowBlur = (faceLit ? 12 : 8) + pulse * 8;
  ctx.strokeStyle = faceLit ? '#8de8ff' : '#5aa1b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -outerR);
  ctx.lineTo(outerR * 0.78, 0);
  ctx.lineTo(0, outerR);
  ctx.lineTo(-outerR * 0.78, 0);
  ctx.closePath();
  ctx.stroke();

  const innerGrad = ctx.createRadialGradient(0, 0, coreR * 0.15, 0, 0, outerR * 0.9);
  innerGrad.addColorStop(0, '#f4ffff');
  innerGrad.addColorStop(0.2, '#7fe3ff');
  innerGrad.addColorStop(0.55, '#103d54');
  innerGrad.addColorStop(1, '#020912');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.moveTo(0, -outerR * 0.8);
  ctx.lineTo(outerR * 0.6, 0);
  ctx.lineTo(0, outerR * 0.8);
  ctx.lineTo(-outerR * 0.6, 0);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#08141f';
  ctx.beginPath();
  ctx.ellipse(0, 0, coreR * 1.15, coreR * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#dff8ff';
  ctx.beginPath();
  ctx.ellipse(0, 0, coreR * 0.76, coreR * (0.08 + blink.eyeOpen * 0.2), 0, 0, Math.PI * 2);
  ctx.fill();

  if (blink.eyeOpen > 0.22) {
    ctx.fillStyle = '#062437';
    ctx.beginPath();
    ctx.arc(Math.sin(t * 0.0035 + u.id) * coreR * 0.28, 0, coreR * 0.12 + blink.eyeOpen * coreR * 0.06, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#dff8ff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-coreR * 0.5, 0);
    ctx.lineTo(coreR * 0.5, 0);
    ctx.stroke();
  }

  if (u.hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.85, u.hitFlash);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, outerR * (1.02 + pulse * 0.08), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBoss01(cx, cy, u, alpha) {
  if (!t3d.ready || !t3d.boss01Model) {
    // Fallback if 3D not loaded yet
    const t = performance.now();
    ctx.save();
    ctx.globalAlpha = alpha;

    // Rotating loading indicator
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.003);
    ctx.strokeStyle = '#aa33ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 1.5);
    ctx.stroke();

    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#aa33ff';
    ctx.font = 'bold 9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('3D LOAD', cx, cy + 28);
    ctx.restore();
    return;
  }

  const t = performance.now();
  const delta = t3d.clock.getDelta();

  // Update animation mixer if present
  if (t3d.mixer) t3d.mixer.update(delta);

  // Bob effect and hit-flash recoil handling
  const bob = Math.sin(t * 0.002 + u.id) * 3;
  const hitShakeX = u.hitFlash > 0 ? (Math.random() - 0.5) * 8 : 0;
  const hitShakeY = u.hitFlash > 0 ? (Math.random() - 0.5) * 8 : 0;

  // Render 3D frame to offscreen canvas
  if (t3d.boss01Model) {
    // Face the target or aim direction
    const dx = u.aimDir ? u.aimDir.dx : u.facing.dx;
    const dy = u.aimDir ? u.aimDir.dy : u.facing.dy;
    let baseAngle = Math.atan2(dy, dx);

    // Procedural Spin Attack Animation
    let attackSpin = 0;
    if (u.boss01SpinStart) {
      const dur = 800; // 800ms spin
      if (t < u.boss01SpinStart + dur) {
        const p = (t - u.boss01SpinStart) / dur;
        // Ease-out cubic for a snappy spin that slows down at the end
        const easeOut = 1 - Math.pow(1 - p, 3);
        attackSpin = easeOut * Math.PI * 2; // Full 360
      } else {
        u.boss01SpinStart = 0;
      }
    }

    t3d.boss01Model.rotation.y = -baseAngle + attackSpin; // Rotate model

    // Handle generic hit flash via material color if possible, or just scale/shake
    if (u.hitFlash > 0) {
      t3d.boss01Model.scale.set(1.4, 1.4, 1.4); // slight pop
    } else {
      t3d.boss01Model.scale.set(1.2, 1.2, 1.2);
    }

    t3d.renderer.render(t3d.scene, t3d.camera);
  }

  // Draw WebGL canvas onto 2D Context
  ctx.save();
  ctx.globalAlpha = alpha;
  const size = UNIT_CELL * 2.2; // Reduced scale to match other enemies (was 3.5)

  // Shadow
  ctx.globalAlpha = alpha * 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, size * 0.25, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.7 : 1);
  ctx.drawImage(t3d.renderer.domElement, cx - size / 2 + hitShakeX, cy - size / 2 + bob + hitShakeY, size, size);
  ctx.restore();
}

function drawUnits() {
  // Pre-build unit index map once (avoids O(n²) filter inside loop)
  const _unitIdx = new Map();
  const _teamCount = {};
  S.units.forEach(u => {
    const t = u.team;
    _teamCount[t] = (_teamCount[t] || 0) + 1;
    _unitIdx.set(u, _teamCount[t]);
  });

  S.units.forEach(u => {
    if (!u.alive && u.deathT <= 0) return;

    // Visibility check: Hide enemies if not directly visible, 
    // EXCEPT for giant Ironbox Fortresses which can be seen if the tile they are on is revealed at all.
    if (gameMode === 'adventure' && u.team === 1) {
      const isDirectlyVisible = isVisible(u.x, u.y);
      const isTileRevealed = S.fog && S.fog[u.y] && S.fog[u.y][u.x];
      const isHugeEnemy = u.utype === 'ironbox' || u.utype === 'boss01';

      if (!isDirectlyVisible && !isTileRevealed && !(S.fullMapRevealed)) {
        return;
      }
    }

    const cx = (u.rx + 0.5) * CELL, cy = (u.ry + 0.5) * CELL;
    const alpha = u.alive ? 1 : u.deathT;
    const r = UNIT_CELL * 0.29 * (u.scale || 1.0);
    const isSel = u.team === 0 && u.id === S.selectedId[0];
    const inactive = S.phase === 'frozen' && S.clockSide !== u.team;

    ctx.save(); ctx.globalAlpha = alpha;


    if (gameMode === 'adventure' && u.team === 1) {
      // Enemy type dispatch
      if (u.utype === 'idol') {
        drawEnemyNullIdol(cx, cy, u, alpha);
      } else if (u.utype === 'boss01') {
        drawBoss01(cx, cy, u, alpha);
      } else if (u.utype === 'worm') {
        drawEnemyWorm(cx, cy, u, alpha);
      } else if (u.utype === 'shield') {
        drawEnemyShieldBot(cx, cy, u, alpha);
      }
      // ── Adventure enemy: pixel art character ──────────────────────
      // Skirstome per pusę / pagal utype tipą:
      // BUG ir OVR tampa TV Static, LEAK ir CRPT tampa Binary Swarm.
      // IRONBOX tampa Fortress
      else if (u.utype === 'ironbox') {
        drawEnemyFortress(cx, cy, u, alpha);
      } else if (u.utype === 'leak' || u.utype === 'corrupt') {
        drawEnemyBinarySwarm(cx, cy, u, alpha);
      } else if (u.utype === 'shaman') {
        const sdx = u.facing ? u.facing.dx : -1;
        const sprDir = sdx < 0 ? 'west' : 'east';
        const sImg = getShamanFrame(u, sprDir);
        const sprSz = UNIT_CELL * 2.6;
        if (sImg && sImg.complete && sImg.naturalWidth > 0) {
          ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.5 : 1);
          ctx.drawImage(sImg, cx - sprSz / 2, cy - sprSz / 2, sprSz, sprSz);
          ctx.globalAlpha = alpha;
        } else {
          // Fallback tol kol įkraunama
          ctx.fillStyle = '#cc30ff';
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2); ctx.fill();
        }
        if (u.hitFlash > 0) {
          ctx.globalAlpha = alpha * u.hitFlash * 0.55;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(cx, cy, sprSz * 0.35, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
        }
      } else if (u.utype === 'spider') {
        const frame = getSpiderFrameState(u);
        const sprSz = UNIT_CELL * 2.45;
        if (frame) {
          ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.5 : 1);
          if ((u.facing?.dx || -1) < 0) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(-1, 1);
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, -sprSz / 2, -sprSz / 2, sprSz, sprSz);
            ctx.restore();
          } else {
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, cx - sprSz / 2, cy - sprSz / 2, sprSz, sprSz);
          }
          ctx.globalAlpha = alpha;
        } else {
          ctx.fillStyle = '#7c1010';
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2); ctx.fill();
        }
        if (u.hitFlash > 0) {
          ctx.globalAlpha = alpha * u.hitFlash * 0.55;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(cx, cy, sprSz * 0.32, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
        }
      } else if (u.utype === 'sheep') {
        const frame = getSheepFrameState(u);
        const sprSz = UNIT_CELL * 2.15;
        if (frame) {
          ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.55 : 1);
          if ((u.facing?.dx || 1) < 0) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(-1, 1);
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, -sprSz / 2, -sprSz / 2, sprSz, sprSz);
            ctx.restore();
          } else {
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, cx - sprSz / 2, cy - sprSz / 2, sprSz, sprSz);
          }
          ctx.globalAlpha = alpha;
        } else {
          ctx.fillStyle = '#b9e8a3';
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        }
        if (u.hitFlash > 0) {
          ctx.globalAlpha = alpha * u.hitFlash * 0.55;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(cx, cy, sprSz * 0.26, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
        }
      } else if (u.utype === 'troll') {
        const frame = getTrollFrameState(u);
        const sprW = UNIT_CELL * 2.9;
        const sprH = UNIT_CELL * 2.9;
        if (frame) {
          ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.5 : 1);
          if ((u.facing?.dx || -1) < 0) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(-1, 1);
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, -sprW / 2, -sprH / 2, sprW, sprH);
            ctx.restore();
          } else {
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, cx - sprW / 2, cy - sprH / 2, sprW, sprH);
          }
          ctx.globalAlpha = alpha;
        } else {
          ctx.fillStyle = '#6f8f43';
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2); ctx.fill();
        }
        if (u.hitFlash > 0) {
          ctx.globalAlpha = alpha * u.hitFlash * 0.55;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(cx, cy, sprW * 0.18, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
        }
      } else if (u.utype === 'skull') {
        const frame = getSkullFrameState(u);
        const sprSz = UNIT_CELL * 2.5;
        if (frame && frame.sheet && frame.sheet.complete && frame.sheet.naturalWidth > 0) {
          ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.5 : 1);
          // Guard glow — bone-white aura
          const _isGuarding = u.guardStart && (performance.now() - u.guardStart) < (skullAnimSheets.guard.frameCount / SKULL_ANIM_FPS.guard) * 1000;
          if (_isGuarding) { ctx.shadowColor = '#fffbe0'; ctx.shadowBlur = 18; }
          if ((u.facing?.dx || -1) < 0) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(-1, 1);
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, -sprSz / 2, -sprSz / 2, sprSz, sprSz);
            ctx.restore();
          } else {
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, cx - sprSz / 2, cy - sprSz / 2, sprSz, sprSz);
          }
          ctx.shadowBlur = 0;
          ctx.globalAlpha = alpha;
        } else {
          ctx.fillStyle = '#e8d8c0';
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2); ctx.fill();
        }
        if (u.hitFlash > 0) {
          ctx.globalAlpha = alpha * u.hitFlash * 0.55;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(cx, cy, sprSz * 0.33, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
        }
      } else if (u.utype === 'bluebird') {
        const frame = getBlueBirdFrameState(u);
        const sprSz = UNIT_CELL * 2.2;
        if (frame) {
          ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.5 : 1);
          // West sprite faces LEFT; flip when moving RIGHT (dx > 0)
          if ((u.facing?.dx || -1) > 0) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(-1, 1);
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, -sprSz / 2, -sprSz / 2, sprSz, sprSz);
            ctx.restore();
          } else {
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, cx - sprSz / 2, cy - sprSz / 2, sprSz, sprSz);
          }
          ctx.globalAlpha = alpha;
        } else {
          ctx.fillStyle = '#4488ff';
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        }
        if (u.hitFlash > 0) {
          ctx.globalAlpha = alpha * u.hitFlash * 0.55;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(cx, cy, sprSz * 0.3, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
        }
      } else if (u.utype === 'minotaur') {
        const frame = getMinotaurFrameState(u);
        const sprSz = UNIT_CELL * 3.2;
        if (frame && frame.sheet && frame.sheet.complete && frame.sheet.naturalWidth > 0) {
          ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.5 : 1);
          if ((u.facing?.dx || -1) < 0) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(-1, 1);
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, -sprSz / 2, -sprSz / 2, sprSz, sprSz);
            ctx.restore();
          } else {
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, cx - sprSz / 2, cy - sprSz / 2, sprSz, sprSz);
          }
          ctx.globalAlpha = alpha;
        } else {
          ctx.fillStyle = '#8b2020';
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2); ctx.fill();
        }
        if (u.hitFlash > 0) {
          ctx.globalAlpha = alpha * u.hitFlash * 0.55;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(cx, cy, sprSz * 0.22, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
        }
      } else if (u.utype === 'ronke') {
        const frame = getRonkeFrameState(u);
        const sprSz = UNIT_CELL * 1.69;
        if (frame) {
          ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.5 : 1);
          ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, cx - sprSz / 2, cy - sprSz / 2 - 10, sprSz, sprSz);
          ctx.globalAlpha = alpha;
        } else {
          ctx.fillStyle = '#3355cc';
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2); ctx.fill();
        }
        if (u.hitFlash > 0) {
          ctx.globalAlpha = alpha * u.hitFlash * 0.55;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(cx, cy, sprSz * 0.25, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
        }
      } else if (u.utype === 'ronke2') {
        const frame = getRonke2FrameState(u);
        const sprSz = UNIT_CELL * 3.4;
        const _r2yOff = -29;
        const _r2drawX = cx - sprSz / 4; // BODY_FRAC=0.25 → cx - sprSz/4 centers body at cx
        if (frame) {
          ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.5 : 1);
          if ((u.facing?.dx ?? 1) < 0) {
            ctx.save();
            ctx.translate(_r2drawX, cy + _r2yOff);
            ctx.scale(-1, 1);
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, -sprSz / 2, -sprSz / 2, sprSz, sprSz);
            ctx.restore();
          } else {
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, _r2drawX, cy - sprSz / 2 + _r2yOff, sprSz, sprSz);
          }
          ctx.globalAlpha = alpha;
        } else {
          ctx.fillStyle = '#4466dd';
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2); ctx.fill();
        }
        if (u.hitFlash > 0) {
          ctx.globalAlpha = alpha * u.hitFlash * 0.55;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(cx, cy, sprSz * 0.25, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
        }
      } else if (u.utype === 'stabby') {
        const frame = getStabbyFrameState(u);
        const sprSz = UNIT_CELL * 2.2;
        const _syOff = 5;
        // Sprite faces RIGHT by default. Flip when facing LEFT (dx < 0).
        // BODY_FRAC = 88/192 ≈ 0.46 from left → from right = 1-0.46 = 0.54
        // tx = cx - sprSz*(1 - 2*0.54) = cx - sprSz*(-0.08) = cx + sprSz*0.08
        const _stBodyFrac = 0.54;
        const _stTx = cx - sprSz * (1 - 2 * _stBodyFrac);
        if (frame) {
          ctx.globalAlpha = alpha * (u.hitFlash > 0 ? 0.5 : 1);
          if ((u.facing?.dx ?? 1) < 0) {
            // facing left → flip right-facing sprite
            ctx.save();
            ctx.translate(_stTx, cy + _syOff);
            ctx.scale(-1, 1);
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, -sprSz / 2, -sprSz / 2, sprSz, sprSz);
            ctx.restore();
          } else {
            // facing right → draw normally
            ctx.drawImage(frame.sheet, frame.sx, frame.sy, frame.sw, frame.sh, cx - sprSz / 2, cy - sprSz / 2 + _syOff, sprSz, sprSz);
          }
          ctx.globalAlpha = alpha;
        } else {
          ctx.fillStyle = '#cc8833';
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2); ctx.fill();
        }
        if (u.hitFlash > 0) {
          ctx.globalAlpha = alpha * u.hitFlash * 0.55;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(cx, cy, sprSz * 0.25, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
        }
      } else {
        drawEnemyPixelArt(cx, cy, u, alpha);
      }
      // Poisoned overlay — simple green outline
      if (u.poisoned) {
        const _pt = performance.now() * 0.001;
        const _pp = 0.6 + 0.4 * Math.sin(_pt * 3.5);
        ctx.save();
        ctx.globalAlpha = alpha * _pp;
        ctx.strokeStyle = '#00ff66';
        ctx.shadowColor = '#00ff66'; ctx.shadowBlur = 10 * _pp;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // Frozen/Hacked overlay
      if ((u.frozenTurns || 0) > 0) {
        const t = performance.now();
        const flicker = 0.55 + 0.25 * Math.sin(t * 0.012);
        const isHacked = !!u.hacked;
        const overlayColor = isHacked ? '#00ffcc' : '#aaddff';
        const glowColor = isHacked ? '#00ddaa' : '#88ccff';
        ctx.save();
        ctx.globalAlpha = alpha * flicker * 0.55;
        ctx.fillStyle = overlayColor;
        ctx.shadowColor = glowColor; ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, CELL * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = isHacked ? '#00ffcc' : '#ffffff';
        ctx.font = `bold ${Math.round(CELL * 0.28)}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowBlur = 8; ctx.shadowColor = glowColor;
        ctx.fillText(isHacked ? '[HCK]' : '\u2744', cx, cy - CELL * 0.02);
        if (isHacked) {
          // Glitch scanlines effect
          ctx.globalAlpha = alpha * 0.18 * flicker;
          ctx.fillStyle = '#000000';
          for (let gi = -2; gi <= 2; gi++) {
            ctx.fillRect(cx - CELL * 0.35, cy + gi * CELL * 0.12, CELL * 0.7, 1.5);
          }
        }
        ctx.restore();
      }

      // ── HP bar above sprite (adventure enemies) ──────────────
      if (u.alive && u.maxHp > 0 && u.hp < u.maxHp) {
        const _hpRatio = Math.max(0, u.hp / u.maxHp);
        const _bW = CELL * 0.72, _bH = 4;
        const _bx = cx - _bW / 2;
        const _by = cy - CELL * 1.18;
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(_bx - 1, _by - 1, _bW + 2, _bH + 2);
        const _hpColor = _hpRatio > 0.5
          ? `hsl(${Math.round(120 * _hpRatio * 2)},90%,42%)`
          : `hsl(0,100%,${Math.round(30 + _hpRatio * 20)}%)`;
        ctx.globalAlpha = alpha * 0.92;
        ctx.fillStyle = _hpColor;
        ctx.fillRect(_bx, _by, _bW * _hpRatio, _bH);
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(_bx, _by, _bW * _hpRatio, 1);
        ctx.globalAlpha = alpha;
      }

      ctx.restore();
      return;
    }


    if (gameMode === 'adventure' && u.team === 0) {
      if (u.isDying) {
        const elapsed = performance.now() - u.deathStart;
        const progress = Math.min(1, elapsed / 2400);


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


        if (progress >= 0.9) { ctx.restore(); return; }
        // Flicker: fast oscillation, gets more frequent as death progresses
        const flickRate = 60 + progress * 40;
        if (progress > 0.25 && Math.sin(elapsed / flickRate) < 0) { ctx.restore(); return; }
        const dyingAlpha = alpha * (1 - progress);
        _drawRonke2HeroSprite(cx, cy, u, dyingAlpha);
      } else {
        _drawRonke2HeroSprite(cx, cy, u, alpha);
      }
      ctx.restore();
      return; // skip hex rendering below
    }

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


    if (!(gameMode === 'adventure' && u.team === 1)) {
      const unitIdx = _unitIdx.get(u) || 1;
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


function aiQueueAction(exec = true) {
  stopAIThinking();
  if (S.phase !== 'frozen') return;
  if (S.pending[1] !== null) return;
  const aiUnits = S.units.filter(u => {
    if (u.team !== 1 || !u.alive) return false;
    if ((u.frozenTurns || 0) > 0) { return false; } // frozen this turn (decremented after tick)
    if (gameMode === 'adventure') {
      if (u.utype === 'spider') {
        return true;
      }
      const isDirectlyVisible = isVisible(u.x, u.y);
      const isTileRevealed = S.fog && S.fog[u.y] && S.fog[u.y][u.x];
      const isHugeEnemy = u.utype === 'ironbox' || u.utype === 'boss01';

      if (!isDirectlyVisible && !(isHugeEnemy && isTileRevealed)) {
        return false;
      }
    }
    return true;
  });
  if (!aiUnits.length) {
    if (gameMode === 'adventure') S.clockSide = 0;
    return;
  }

  const humanAct = S.pending[0];
  const nextBullets = S.bullets.filter(b => b.active).map(b => ({
    x: b.x + b.dx, y: b.y + b.dy, owner: b.owner
  }));

  const safe = (x, y) => !nextBullets.some(b => b.owner === 0 && b.x === x && b.y === y);

  const p1Future = S.units.filter(u => u.team === 0 && u.alive).map(u => ({
    x: (humanAct?.unitId === u.id && humanAct?.t === 'move') ? u.x + humanAct.dx : u.x,
    y: (humanAct?.unitId === u.id && humanAct?.t === 'move') ? u.y + humanAct.dy : u.y,
  }));

  const batch = collectAiBatchActions(aiUnits, nextBullets, safe, p1Future);
  S.pendingEnemyBatch = batch;

  if (batch.length > 0) {
    const lead = batch[0];
    S.pending[1] = lead;
    setActionBadge(1, lead);
    S.selectedId[1] = lead.unitId;
    if (exec) resolveTick();
  } else if (gameMode === 'adventure') {
    S.clockSide = 0;
  }
}

function aiUnitDecide(unit, nextBullets, safe, p1Future) {
  const clearShotFrom = (sx, sy, tx, ty) => {
    const ddx = tx - sx, ddy = ty - sy;
    if (!(ddx === 0 || ddy === 0)) return null;
    const dist = Math.max(Math.abs(ddx), Math.abs(ddy));
    const stx = Math.sign(ddx), sty = Math.sign(ddy);
    for (let i = 1; i < dist; i++) {
      if (isWall(sx + stx * i, sy + sty * i)) return null;
    }
    return { dx: stx, dy: sty };
  };

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

  if (unit.utype === 'spider') {
    const facingDx = (unit.facing?.dx === 1 || unit.facing?.dx === -1) ? unit.facing.dx : 1;
    unit.facing = { dx: facingDx, dy: 0 };

    let frontTarget = null;
    for (const hu of p1Future) {
      const dx = hu.x - unit.x;
      if (hu.y !== unit.y || dx === 0) continue;
      if (Math.sign(dx) !== facingDx) continue;
      const fo = clearShotFrom(unit.x, unit.y, hu.x, hu.y);
      if (!fo || fo.dy !== 0 || fo.dx !== facingDx) continue;
      const dist = Math.abs(dx);
      if (!frontTarget || dist < frontTarget.dist) {
        frontTarget = { dist, fo };
      }
    }

    if (unit.ammo > 0 && frontTarget) {
      return { action: { t: 'shoot', fo: { dx: facingDx, dy: 0 } }, score: 165 - frontTarget.dist };
    }

    const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
    if (candidateMoves.length > 0) {
      const targetKeys = new Set(p1Future.map((hu) => `${hu.x},${hu.y}`));
      const visited = new Set([`${unit.x},${unit.y}`]);
      const queue = [{ x: unit.x, y: unit.y, first: null, dist: 0 }];
      let bestMove = null;

      while (queue.length > 0) {
        const curr = queue.shift();
        if (curr.dist > ROWS * COLS) break;
        if (curr.first && targetKeys.has(`${curr.x},${curr.y}`)) {
          bestMove = curr.first;
          break;
        }
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = curr.x + dx, ny = curr.y + dy;
          const key = `${nx},${ny}`;
          if (visited.has(key)) continue;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) continue;
          if (S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) continue;
          visited.add(key);
          queue.push({
            x: nx,
            y: ny,
            first: curr.first || { dx, dy, nx, ny },
            dist: curr.dist + 1,
          });
        }
      }

      if (!bestMove) {
        let bestScore = -Infinity;
        for (const m of candidateMoves) {
          const dist = Math.abs(nearest.x - m.nx) + Math.abs(nearest.y - m.ny);
          let score = 40 - dist * 3;
          if (m.ny === nearest.y) score += 12;
          if (m.dx !== 0 && Math.sign(nearest.x - unit.x || facingDx) === m.dx) score += 10;
          if (safe(m.nx, m.ny)) score += 6;
          score += Math.random();
          if (score > bestScore) {
            bestScore = score;
            bestMove = m;
          }
        }
      }

      if (bestMove) {
        if (bestMove.dx !== 0) {
          unit.facing = { dx: Math.sign(bestMove.dx), dy: 0 };
        } else {
          const aimDx = Math.sign(nearest.x - unit.x);
          if (aimDx !== 0) unit.facing = { dx: aimDx, dy: 0 };
        }
        return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: 125 };
      }
    }

    const aimDx = Math.sign(nearest.x - unit.x);
    if (aimDx !== 0) unit.facing = { dx: aimDx, dy: 0 };
    return { action: { t: 'move', dx: 0, dy: 0 }, score: 1 };
  }

  if (unit.utype === 'sheep') {
    const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
    if (candidateMoves.length === 0) return null;

    const heroDist = nearest.dist;
    const moveChance = heroDist <= 3 ? 0.55 : heroDist <= 5 ? 0.35 : 0.18;
    if (Math.random() > moveChance) return null;

    let bestMove = null;
    let bestScore = -Infinity;
    for (const m of candidateMoves) {
      const nextDist = Math.abs(nearest.x - m.nx) + Math.abs(nearest.y - m.ny);
      let score = heroDist <= 5
        ? nextDist * 5 + Math.random() * 3
        : Math.random() * 12 + nextDist * 0.15;
      if (safe(m.nx, m.ny)) score += 1.5;
      if (m.dx !== 0) score += 0.5;
      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    if (!bestMove) return null;
    if (bestMove.dx !== 0) unit.facing = { dx: Math.sign(bestMove.dx), dy: 0 };
    else {
      const fleeDx = Math.sign(unit.x - nearest.x);
      if (fleeDx !== 0) unit.facing = { dx: fleeDx, dy: 0 };
    }
    return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: 42 + bestScore };
  }

  if (unit.utype === 'idol') {
    const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
    const nearestDist = Math.abs(nearest.x - unit.x) + Math.abs(nearest.y - unit.y);

    if ((unit.forceDodgeShots || 0) > 0 && candidateMoves.length > 0) {
      let dodge = candidateMoves.find(m => m.nx !== nearest.x && m.ny !== nearest.y);
      if (!dodge) dodge = candidateMoves.find(m => (Math.abs(nearest.x - m.nx) + Math.abs(nearest.y - m.ny)) > nearestDist);
      if (!dodge) dodge = candidateMoves[0];
      unit.forceDodgeShots = Math.max(0, (unit.forceDodgeShots || 0) - 1);
      unit.facing = { dx: dodge.dx, dy: dodge.dy };
      return { action: { t: 'move', dx: dodge.dx, dy: dodge.dy }, score: 140 };
    }

    if (unit.idolBlinkFirePending && unit.laserAmmo > 0) {
      unit.idolBlinkFirePending = false;
      const fo = (unit.facing && (unit.facing.dx || unit.facing.dy)) ? unit.facing : aiShootDir(unit, nearest.x, nearest.y);
      return { action: { t: 'shoot', fo }, score: 135 };
    }

    if (unit.laserAmmo > 0) {
      // 80% chance to just fire blindly in a random direction instead of tracking
      if (Math.random() < 0.80) {
        const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
        const randDir = dirs[Math.floor(Math.random() * dirs.length)];
        unit.facing = randDir;
        if ((unit.forceDodgeShots || 0) === 0 && Math.random() < 0.5) {
          return { action: { t: 'shoot', fo: randDir }, score: 100 - nearest.dist };
        }
      } else {
        // 20% chance to intelligently lock on
        for (const hu of p1Future) {
          const fo = clearShotFrom(unit.x, unit.y, hu.x, hu.y);
          if (fo) {
            unit.facing = fo;
            if ((unit.forceDodgeShots || 0) === 0 && Math.random() < 0.5) {
              return { action: { t: 'shoot', fo }, score: 120 - nearest.dist };
            }
            break;
          }
        }
      }
    }

    if (candidateMoves.length > 0) {
      let bestMove = null;
      let bestScore = -Infinity;
      for (const m of candidateMoves) {
        let score = 0;
        const dist = Math.abs(nearest.x - m.nx) + Math.abs(nearest.y - m.ny);
        if (m.nx !== nearest.x && m.ny !== nearest.y) score += 14;
        if (dist >= 3 && dist <= 6) score += 12;
        else if (dist < 3) score -= 18;
        else score += Math.max(0, 7 - dist);
        if (safe(m.nx, m.ny)) score += 8;
        if (clearShotFrom(m.nx, m.ny, nearest.x, nearest.y) && unit.laserAmmo > 0) score += 20;
        score += Math.random();
        if (score > bestScore) { bestScore = score; bestMove = m; }
      }
      if (bestMove) {
        unit.facing = { dx: bestMove.dx, dy: bestMove.dy };
        return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: bestScore };
      }
    }

    if (unit.laserAmmo > 0) {
      let fo;
      if (Math.random() < 0.80) {
        const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
        fo = dirs[Math.floor(Math.random() * dirs.length)];
      } else {
        fo = aiShootDir(unit, nearest.x, nearest.y);
      }
      return { action: { t: 'shoot', fo }, score: 40 };
    }

    return null;
  }

  // --- SPECIAL AI: IRONBOX FORTRESS ---
  if (unit.utype === 'ironbox') {
    let canSeePlayerInFront = false;
    for (const hu of p1Future) {
      const ddx = hu.x - unit.x, ddy = hu.y - unit.y;
      // Is player exactly in front of the Ironbox?
      if (Math.sign(ddx) === unit.facing.dx && ddy === 0 && unit.facing.dy === 0) canSeePlayerInFront = true;
      if (Math.sign(ddy) === unit.facing.dy && ddx === 0 && unit.facing.dx === 0) canSeePlayerInFront = true;

      if (canSeePlayerInFront) {
        // Verify line of sight
        let isClear = true;
        const dist = Math.max(Math.abs(ddx), Math.abs(ddy));
        for (let i = 1; i < dist; i++) {
          if (isWall(unit.x + unit.facing.dx * i, unit.y + unit.facing.dy * i)) { isClear = false; break; }
        }
        if (!isClear) canSeePlayerInFront = false;
      }
      if (canSeePlayerInFront) break;
    }

    // chance to shoot blindly forward anyway to provide area denial
    if (unit.ammo > 0 && (canSeePlayerInFront || Math.random() < 0.20)) {
      // By explicitly passing fo = current facing, it won't snap-turn to aim at the player!
      return { action: { t: 'shoot', fo: { dx: unit.facing.dx, dy: unit.facing.dy } }, score: 150 };
    }

    // Otherwise, move/turn towards the player
    unit.moveCooldown = (unit.moveCooldown || 0) - 1;
    if (unit.moveCooldown > 0) {
      // Stand still
      return { action: { t: 'move', dx: 0, dy: 0 }, score: 5 };
    }
    unit.moveCooldown = 2; // Very Slow movement

    let bestMove = null;
    let bestDist = Infinity;
    const candidates = safeMoves.length > 0 ? safeMoves : moves;
    for (const m of candidates) {
      const d = Math.abs(nearest.x - m.nx) + Math.abs(nearest.y - m.ny);
      // Give a strong bonus for aligning lines of sight
      const alignBonus = (nearest.x === m.nx || nearest.y === m.ny) ? -5 : 0;
      const finalScore = d + alignBonus;
      if (finalScore < bestDist) {
        bestDist = finalScore;
        bestMove = m;
      }
    }

    if (bestMove) {
      // Update facing ONLY when moving
      unit.facing = { dx: bestMove.dx, dy: bestMove.dy };
      return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: 60 };
    }

    return { action: { t: 'move', dx: 0, dy: 0 }, score: 5 };
  }

  // --- SPECIAL AI: SHIELD BOT ---
  if (unit.utype === 'shield') {
    // Always rotate shield to face player
    const sdx = nearest.x - unit.x, sdy = nearest.y - unit.y;
    const adx = Math.abs(sdx), ady = Math.abs(sdy);
    if (adx >= ady) unit.shieldDir = { dx: Math.sign(sdx), dy: 0 };
    else unit.shieldDir = { dx: 0, dy: Math.sign(sdy) };

    // Slow movement: move only every 2nd turn
    unit.moveCooldown = (unit.moveCooldown || 0) - 1;
    if (unit.moveCooldown > 0) {
      // Stand still but still turn shield
      return { action: { t: 'move', dx: 0, dy: 0 }, score: 5 };
    }
    unit.moveCooldown = 2;

    // Move toward player (prefer safe tiles)
    const candidates = safeMoves.length > 0 ? safeMoves : moves;
    if (candidates.length > 0) {
      let best = null, bestD = Infinity;
      for (const m of candidates) {
        const d = Math.abs(nearest.x - m.nx) + Math.abs(nearest.y - m.ny);
        if (d < bestD) { bestD = d; best = m; }
      }
      if (best && bestD < Math.abs(nearest.x - unit.x) + Math.abs(nearest.y - unit.y)) {
        unit.facing = { dx: best.dx, dy: best.dy };
        return { action: { t: 'move', dx: best.dx, dy: best.dy }, score: 60 };
      }
    }
    // Stand still if can't improve position
    return { action: { t: 'move', dx: 0, dy: 0 }, score: 5 };
  }

  // --- SPECIAL AI: DATA WORM CHASER ---
  if (unit.utype === 'worm' && moves.length > 0) {
    // Patikrinam tikrÄ… atstumÄ…, Ä¯skaitant uodegÄ…, ne tik galvÄ…
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
      // PADAROM TIKRÄ„ MELEE ATAKÄ„. Kirminas naudoja 'melee' logikÄ…,
      // bet patÄ¯ veiksmÄ… perduodam kaip 'move' judesÄ¯ Ä¯ Å¾aidÄ—jÄ…, 
      // kad Å¾aidimo variklis suveiktÅ³ jÄ¯ kaip atsitrenkimÄ… arba melee
      const dx = nearest.x - unit.x, dy = nearest.y - unit.y;
      unit.facing = { dx: dx === 0 ? 0 : Math.sign(dx), dy: dy === 0 ? 0 : Math.sign(dy) };

      // IÅ¡renkam move vietoj shoot, variklis atskiria, kad "jei uÅ¾ima, tada muÅ¡a"
      return { action: { t: 'move', dx: unit.facing.dx, dy: unit.facing.dy }, score: 100 };
    }

    // YpaÄ agresyvus kirminas - matomumas iki 20 celiÅ³
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
      // Slankioja jei neÅ¾ino kur Å¾aidÄ—jas
      const m = moves[Math.floor(Math.random() * moves.length)];
      unit.facing = { dx: m.dx, dy: m.dy };
      return { action: { t: 'move', dx: m.dx, dy: m.dy }, score: 10 };
    }
  }
  // --- END OF WORM AI ---


  // --- SKULL AI: aggressive melee chaser with guard ---
  if (unit.utype === 'skull') {
    const now = performance.now();
    const heroDist = nearest.dist;
    const aimDx = nearest.x !== unit.x ? Math.sign(nearest.x - unit.x) : (unit.facing?.dx || -1);
    unit.facing = { dx: aimDx, dy: 0 };

    // Attack if adjacent (dist=1), swing anim + instant energy damage
    const _swingDur = (skullAnimSheets.attack.frameCount / SKULL_ANIM_FPS.attack) * 1000;
    const _isSwinging = unit.swingStart && (now - unit.swingStart) < _swingDur;
    if (heroDist === 1 && !_isSwinging) {
      return { action: { t: 'skullatk', targetX: nearest.x, targetY: nearest.y }, score: 250 };
    }

    // Guard: 25% chance if not adjacent and not already guarding/swinging
    const _guardDur = (skullAnimSheets.guard.frameCount / SKULL_ANIM_FPS.guard) * 1000;
    const _isGuarding = unit.guardStart && (now - unit.guardStart) < _guardDur;
    if (!_isSwinging && !_isGuarding && heroDist > 1 && Math.random() < 0.25) {
      return { action: { t: 'skullguard' }, score: 60 };
    }

    // Chase: BFS toward player
    const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
    if (candidateMoves.length === 0) return null;

    let bestMove = null;
    const targetKeys = new Set(p1Future.map(hu => `${hu.x},${hu.y}`));
    const visited = new Set([`${unit.x},${unit.y}`]);
    const queue = [{ x: unit.x, y: unit.y, first: null, d: 0 }];
    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.d > 15) break;
      if (curr.first && targetKeys.has(`${curr.x},${curr.y}`)) { bestMove = curr.first; break; }
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = curr.x + dx, ny = curr.y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key) || nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) continue;
        if (curr.d === 0 && S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, first: curr.first || { dx, dy, nx, ny, t: 'move' }, d: curr.d + 1 });
      }
    }
    if (!bestMove) {
      let bestDist = Infinity;
      for (const m of candidateMoves) {
        const d = Math.abs(nearest.x - m.nx) + Math.abs(nearest.y - m.ny);
        if (d < bestDist) { bestDist = d; bestMove = m; }
      }
    }
    if (bestMove) {
      if (bestMove.dx !== 0) unit.facing = { dx: Math.sign(bestMove.dx), dy: 0 };
      return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: 120 };
    }
    return null;
  }
  // --- END SKULL AI ---

  // --- BLUE BIRD AI: fast melee chaser, no special abilities ---
  if (unit.utype === 'bluebird') {
    const hero = S.units.find(u => u.team === 0 && u.alive);
    if (!hero) return null;
    const heroDist = Math.abs(hero.x - unit.x) + Math.abs(hero.y - unit.y);
    const aimDx = hero.x !== unit.x ? Math.sign(hero.x - unit.x) : (unit.facing?.dx || -1);
    unit.facing = { dx: aimDx, dy: 0 };

    if (heroDist === 1) {
      return { action: { t: 'birdatk', targetX: hero.x, targetY: hero.y }, score: 250 };
    }

    // BFS chase
    const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
    if (candidateMoves.length === 0) return null;
    let bestMove = null;
    const visited = new Set([`${unit.x},${unit.y}`]);
    const queue = [{ x: unit.x, y: unit.y, first: null, d: 0 }];
    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.d > 15) break;
      if (curr.first && curr.x === hero.x && curr.y === hero.y) { bestMove = curr.first; break; }
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = curr.x + dx, ny = curr.y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key) || nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) continue;
        if (curr.d === 0 && S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, first: curr.first || { dx, dy, nx, ny, t: 'move' }, d: curr.d + 1 });
      }
    }
    if (!bestMove) {
      let bestDist = Infinity;
      for (const m of candidateMoves) {
        const d = Math.abs(hero.x - m.nx) + Math.abs(hero.y - m.ny);
        if (d < bestDist) { bestDist = d; bestMove = m; }
      }
    }
    if (bestMove) {
      if (bestMove.dx !== 0) unit.facing = { dx: Math.sign(bestMove.dx), dy: 0 };
      return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: 120 };
    }
    return null;
  }
  // --- END BLUE BIRD AI ---

  // --- MINOTAUR AI: heavy melee brute with guard, 2-tile charge ---
  if (unit.utype === 'minotaur') {
    const now = performance.now();
    const hero = S.units.find(u => u.team === 0 && u.alive);
    if (!hero) return null;

    const heroDist     = Math.abs(hero.x - unit.x) + Math.abs(hero.y - unit.y);
    const heroDistPrev = Math.abs((hero.px ?? hero.x) - unit.x) + Math.abs((hero.py ?? hero.y) - unit.y);

    const aimDx = hero.x !== unit.x ? Math.sign(hero.x - unit.x) : (unit.facing?.dx || -1);
    unit.facing = { dx: aimDx, dy: 0 };

    const swingDur = (minotaurAnimSheets.attack.frameCount / MINOTAUR_ANIM_FPS.attack) * 1000;
    const isSwinging = unit.swingStart && (now - unit.swingStart) < swingDur;

    // Attack: adjacent now OR was adjacent before hero moved
    if ((heroDist === 1 || heroDistPrev === 1) && !isSwinging) {
      const targetX = heroDist === 1 ? hero.x : (hero.px ?? hero.x);
      const targetY = heroDist === 1 ? hero.y : (hero.py ?? hero.y);
      return { action: { t: 'minoatk', targetX, targetY }, score: 300 };
    }

    // Wind-up swing animation when hero is 2 tiles away (threatening)
    if (heroDist === 2 && !isSwinging) {
      unit.swingStart = now;
    }

    // Always chase — no guard, no hesitation
    const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
    if (candidateMoves.length === 0) return null;

    let bestMove = null;
    const visited = new Set([`${unit.x},${unit.y}`]);
    const queue = [{ x: unit.x, y: unit.y, first: null, d: 0 }];
    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.d > 15) break;
      if (curr.first && curr.x === hero.x && curr.y === hero.y) { bestMove = curr.first; break; }
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = curr.x + dx, ny = curr.y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key) || nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) continue;
        if (curr.d === 0 && S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, first: curr.first || { dx, dy, nx, ny, t: 'move' }, d: curr.d + 1 });
      }
    }
    if (!bestMove) {
      let bestDist = Infinity;
      for (const m of candidateMoves) {
        const d = Math.abs(hero.x - m.nx) + Math.abs(hero.y - m.ny);
        if (d < bestDist) { bestDist = d; bestMove = m; }
      }
    }
    if (bestMove) {
      if (bestMove.dx !== 0) unit.facing = { dx: Math.sign(bestMove.dx), dy: 0 };
      return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: 130 };
    }
    return null;
  }
  // --- END MINOTAUR AI ---

  // --- RONKE AI: heavy brawler, always chases, powerful hit ---
  if (unit.utype === 'ronke') {
    const hero = S.units.find(u => u.team === 0 && u.alive);
    if (!hero) return null;
    const heroDist     = Math.abs(hero.x - unit.x) + Math.abs(hero.y - unit.y);
    const heroDistPrev = Math.abs((hero.px ?? hero.x) - unit.x) + Math.abs((hero.py ?? hero.y) - unit.y);
    const aimDx = hero.x !== unit.x ? Math.sign(hero.x - unit.x) : (unit.facing?.dx || -1);
    unit.facing = { dx: aimDx, dy: 0 };

    if ((heroDist === 1 || heroDistPrev === 1)) {
      const targetX = heroDist === 1 ? hero.x : (hero.px ?? hero.x);
      const targetY = heroDist === 1 ? hero.y : (hero.py ?? hero.y);
      return { action: { t: 'ronkeatk', targetX, targetY }, score: 320 };
    }

    const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
    if (candidateMoves.length === 0) return null;
    let bestMove = null;
    const visited = new Set([`${unit.x},${unit.y}`]);
    const queue = [{ x: unit.x, y: unit.y, first: null, d: 0 }];
    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.d > 15) break;
      if (curr.first && curr.x === hero.x && curr.y === hero.y) { bestMove = curr.first; break; }
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = curr.x + dx, ny = curr.y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key) || nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) continue;
        if (curr.d === 0 && S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, first: curr.first || { dx, dy, nx, ny, t: 'move' }, d: curr.d + 1 });
      }
    }
    if (!bestMove) {
      let bestDist = Infinity;
      for (const m of candidateMoves) {
        const d = Math.abs(hero.x - m.nx) + Math.abs(hero.y - m.ny);
        if (d < bestDist) { bestDist = d; bestMove = m; }
      }
    }
    if (bestMove) {
      if (bestMove.dx !== 0) unit.facing = { dx: Math.sign(bestMove.dx), dy: 0 };
      return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: 130 };
    }
    return null;
  }
  // --- END RONKE AI ---

  if (unit.utype === 'ronke2') {
    const hero = S.units.find(u => u.team === 0 && u.alive);
    if (!hero) return null;
    const heroDist     = Math.abs(hero.x - unit.x) + Math.abs(hero.y - unit.y);
    const heroDistPrev = Math.abs((hero.px ?? hero.x) - unit.x) + Math.abs((hero.py ?? hero.y) - unit.y);
    const aimDx = hero.x !== unit.x ? Math.sign(hero.x - unit.x) : (unit.facing?.dx || -1);
    unit.facing = { dx: aimDx, dy: 0 };
    const castCd = unit.ronke2CastCd || 0;
    const now_r2 = performance.now();
    // Ranged cast at distance 2-5, same row (horizontal only)
    if (heroDist >= 2 && heroDist <= 5 && hero.y === unit.y && now_r2 > castCd) {
      return { action: { t: 'ronke2cast', targetX: hero.x, targetY: hero.y }, score: 350 };
    }
    // Melee fallback at distance 1
    if (heroDist === 1 || heroDistPrev === 1) {
      const targetX = heroDist === 1 ? hero.x : (hero.px ?? hero.x);
      const targetY = heroDist === 1 ? hero.y : (hero.py ?? hero.y);
      return { action: { t: 'ronkeatk', targetX, targetY }, score: 320 };
    }
    const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
    if (candidateMoves.length === 0) return null;
    let bestMove = null;
    const visited = new Set([`${unit.x},${unit.y}`]);
    const queue = [{ x: unit.x, y: unit.y, first: null, d: 0 }];
    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.d > 15) break;
      if (curr.first && curr.x === hero.x && curr.y === hero.y) { bestMove = curr.first; break; }
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = curr.x + dx, ny = curr.y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key) || nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) continue;
        if (curr.d === 0 && S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, first: curr.first || { dx, dy, nx, ny, t: 'move' }, d: curr.d + 1 });
      }
    }
    if (!bestMove) {
      let bestDist = Infinity;
      for (const m of candidateMoves) {
        const d = Math.abs(hero.x - m.nx) + Math.abs(hero.y - m.ny);
        if (d < bestDist) { bestDist = d; bestMove = m; }
      }
    }
    if (bestMove) {
      if (bestMove.dx !== 0) unit.facing = { dx: Math.sign(bestMove.dx), dy: 0 };
      return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: 130 };
    }
    return null;
  }

  // --- STABBY McSpear AI: ranged harpoon thrower ---
  if (unit.utype === 'stabby') {
    const hero = S.units.find(u => u.team === 0 && u.alive);
    if (!hero) return null;
    const heroDist = Math.abs(hero.x - unit.x) + Math.abs(hero.y - unit.y);
    const heroOnSameRow = hero.y === unit.y;
    const heroDir = hero.x !== unit.x ? Math.sign(hero.x - unit.x) : (unit.facing?.dx || -1);
    // Always face toward hero so sprite never walks backwards
    unit.facing = { dx: heroDir, dy: 0 };
    const now_st = performance.now();
    const cd = unit.stabbyCd || 0;

    // Ranged throw — same row, range 2-10, not on cooldown
    if (heroDist >= 2 && heroDist <= 10 && heroOnSameRow && now_st > cd) {
      return { action: { t: 'stabbythrow', targetX: hero.x, targetY: hero.y }, score: 340 };
    }
    // Melee fallback at dist 1
    if (heroDist === 1) {
      unit.stabbyCd = now_st + 1500;
      return { action: { t: 'ronkeatk', targetX: hero.x, targetY: hero.y }, score: 300 };
    }
    // BFS move toward hero
    const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
    if (candidateMoves.length === 0) return null;
    let bestMove = null;
    const visited = new Set([`${unit.x},${unit.y}`]);
    const queue = [{ x: unit.x, y: unit.y, first: null, d: 0 }];
    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.d > 15) break;
      if (curr.first && curr.x === hero.x && curr.y === hero.y) { bestMove = curr.first; break; }
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = curr.x + dx, ny = curr.y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key) || nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) continue;
        if (curr.d === 0 && S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, first: curr.first || { dx, dy, nx, ny, t: 'move' }, d: curr.d + 1 });
      }
    }
    if (!bestMove) {
      let bestDist = Infinity;
      for (const m of candidateMoves) {
        const d = Math.abs(hero.x - m.nx) + Math.abs(hero.y - m.ny);
        if (d < bestDist) { bestDist = d; bestMove = m; }
      }
    }
    if (bestMove) return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: 130 };
    return null;
  }

  // --- TROLL AI: heavy melee bruiser, no ranged attacks ---
  if (unit.utype === 'troll') {
    const now = performance.now();
    const heroDist = nearest.dist;
    const aimDx = nearest.x !== unit.x ? Math.sign(nearest.x - unit.x) : (unit.facing?.dx || -1);
    unit.facing = { dx: aimDx, dy: 0 };

    const _swingDur = (trollAnimSheets.attack.frameCount / TROLL_ANIM_FPS.attack) * 1000;
    const _isSwinging = unit.swingStart && (now - unit.swingStart) < _swingDur;
    const _recoveryDur = (trollAnimSheets.recovery.frameCount / TROLL_ANIM_FPS.recovery) * 1000;
    const _isRecovering = unit.recoveryStart && (now - unit.recoveryStart) < _recoveryDur;
    if (heroDist === 1 && !_isSwinging) {
      return { action: { t: 'trollsmash', targetX: nearest.x, targetY: nearest.y }, score: 260 };
    }

    const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
    if (candidateMoves.length === 0) return null;
    if (_isRecovering && heroDist > 1) {
      return null;
    }

    let bestMove = null;
    const targetKeys = new Set(p1Future.map(hu => `${hu.x},${hu.y}`));
    const visited = new Set([`${unit.x},${unit.y}`]);
    const queue = [{ x: unit.x, y: unit.y, first: null, d: 0 }];
    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.d > 14) break;
      if (curr.first && targetKeys.has(`${curr.x},${curr.y}`)) { bestMove = curr.first; break; }
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = curr.x + dx, ny = curr.y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key) || nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isWall(nx, ny)) continue;
        if (curr.d === 0 && S.units.some(u => u.alive && u.id !== unit.id && u.x === nx && u.y === ny)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, first: curr.first || { dx, dy, nx, ny, t: 'move' }, d: curr.d + 1 });
      }
    }
    if (!bestMove) {
      let bestDist = Infinity;
      for (const m of candidateMoves) {
        const d = Math.abs(nearest.x - m.nx) + Math.abs(nearest.y - m.ny);
        if (d < bestDist) { bestDist = d; bestMove = m; }
      }
    }
    if (bestMove) {
      if (bestMove.dx !== 0) unit.facing = { dx: Math.sign(bestMove.dx), dy: 0 };
      const aggroScore = heroDist <= 2 ? 180 : heroDist <= 4 ? 150 : 130;
      return { action: { t: 'move', dx: bestMove.dx, dy: bestMove.dy }, score: aggroScore };
    }
    return null;
  }
  // --- END TROLL AI ---

  // --- SHAMAN AI: ranged caster, keeps distance, casts projectile ---
  if (unit.utype === 'shaman') {
    const now = performance.now();
    const heroDist = nearest.dist;

    // Always face player horizontally (sprites only have east/west)
    const aimDx = nearest.x !== unit.x ? Math.sign(nearest.x - unit.x) : (unit.facing?.dx || -1);
    unit.facing = { dx: aimDx, dy: 0 };

    // Cast if in range and cooldown expired and not already casting
    const _swingDur = (10 / SHAMAN_ANIM_FPS.attack) * 1000;
    const _isCasting = unit.swingStart && (now - unit.swingStart) < _swingDur;
    const _cdReady = !unit.shamanAttackCd || now > unit.shamanAttackCd;
    const SHAMAN_RANGE = 6;

    if (!_isCasting && _cdReady && heroDist >= 2 && heroDist <= SHAMAN_RANGE) {
      return { action: { t: 'shamancast', targetX: nearest.x, targetY: nearest.y }, score: 220 };
    }

    // Move: sweet spot 3-5 tiles away; flee if too close
    const candidateMoves = safeMoves.length > 0 ? safeMoves : moves;
    if (candidateMoves.length === 0) return null;

    let best = null, bestScore = -Infinity;
    for (const m of candidateMoves) {
      const d = Math.abs(nearest.x - m.nx) + Math.abs(nearest.y - m.ny);
      let score = 0;
      if (d >= 3 && d <= 5) score += 20;
      else if (d < 2) score -= 30;
      else if (d > 5) score += 8;
      score += Math.random() * 5;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (best) {
      if (best.dx !== 0) unit.facing = { dx: Math.sign(best.dx), dy: 0 };
      return { action: { t: 'move', dx: best.dx, dy: best.dy }, score: 80 };
    }
    return null;
  }
  // --- END SHAMAN AI ---


  // --- GRUNT / SHOOTER AI ---
  // 1. Dodge (85% tikimybÄ—)
  if (!curSafe && safeMoves.length > 0 && Math.random() < 0.85) {
    const m = safeMoves[Math.floor(Math.random() * safeMoves.length)];
    unit.facing = { dx: m.dx, dy: m.dy };
    return { action: { t: 'move', dx: m.dx, dy: m.dy }, score: 90 };
  }

  // 2. Shoot (agresyvus - 100% jeigu tiesi lauko matrica ir nera sienu)
  if (unit.ammo > 0) {
    // 90% chance to shoot blindly in a random direction
    if (Math.random() < 0.90) {
      const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
      const randDir = dirs[Math.floor(Math.random() * dirs.length)];
      return { action: { t: 'shoot', fo: randDir }, score: 100 - nearest.dist }; // High priority to shoot
    }

    // 10% chance to actually aim at the player if in line of sight
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

const _dmgFontCache = new Map();
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
    const _fsz = Math.round(n.size);
    let _fstr = _dmgFontCache.get(_fsz);
    if (!_fstr) { _fstr = `${_fsz}px ${PX_FONT}`; _dmgFontCache.set(_fsz, _fstr); }
    ctx.font = _fstr;


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


    const outW = n.type === 'crit' ? Math.max(4, n.size * 0.28)
      : n.type === 'miss' ? Math.max(2, n.size * 0.22)
        : Math.max(3, n.size * 0.25);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = outW;
    ctx.lineJoin = 'round';
    ctx.strokeText(n.text, 0, 0);


    ctx.shadowColor = n.color;
    ctx.shadowBlur = n.type === 'crit' ? 22 : n.type === 'miss' ? 5 : 10;
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, 0, 0);


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


function formatClock(ms) {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  return `${m}:${s.toString().padStart(2, '0')}.${d}`;
}

const _lastClockText = ['', ''];
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
    const txt = formatClock(S.clock[team]);
    const running = S.phase === 'frozen' && S.clockSide === team;
    const low = S.clock[team] < 10000;
    const cls = 'clock-display' + (low ? ' clock-low' : (running ? ` clock-run-p${team + 1}` : ''));
    // Only update DOM when text or class changes
    if (el.textContent !== txt) el.textContent = txt;
    if (el.className !== cls) el.className = cls;
  });
  updatePanelActivity();
}

let _lastPanelState = '';
function updatePanelActivity() {
  const key = S.phase + '|' + S.clockSide;
  if (key === _lastPanelState) return;
  _lastPanelState = key;
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
  updateJumpSlot();
  updateFlareSlot();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
  const el = document.getElementById(id);
  if (el) { el.style.display = 'flex'; el.classList.add('active'); }
  if (id === 'screen-hub') {
    const dd = getDailyData();
    const today = new Date().toDateString();
    if (dd.lastDate !== today || !dd.claimed) setTimeout(window.showDailyCheckin, 400);
  }
}

function startBoxCrack(prize, bx, by) {
  S.cracking = true;
  const overlay    = document.getElementById('crack-overlay');
  if (!overlay) { S.cracking = false; claimCrackPrize(prize, bx, by); return; }

  const targetEl   = document.getElementById('crack-target');
  const currentEl  = document.getElementById('crack-current');
  const barEl      = document.getElementById('crack-bar');
  const barPctEl   = document.getElementById('crack-bar-pct');
  const nonceEl    = document.getElementById('crack-nonce');
  const attemptsEl = document.getElementById('crack-attempts');
  const hashrateEl = document.getElementById('crack-hashrate');
  const statusEl   = document.getElementById('crack-status');
  const phaseEl    = document.getElementById('crack-phase');
  const phaseDotEl = document.getElementById('crack-phase-dot');
  const streamEl   = document.getElementById('crack-stream');
  const codeWrap   = document.getElementById('crack-code-wrap');
  const codeDigits = document.getElementById('crack-code-digits');
  const codeTyped  = document.getElementById('crack-code-typed');
  const holdWrap   = document.getElementById('crack-hold-wrap');
  const holdZone   = document.getElementById('crack-hold-zone');
  const holdFillEl = document.getElementById('crack-hold-fill');
  const holdNeedle = document.getElementById('crack-hold-needle');
  const holdHint   = document.getElementById('crack-hold-hint');
  const tapWrap    = document.getElementById('crack-tap-wrap');
  const tapNumEl   = document.getElementById('crack-tap-num');
  const tapGoalEl  = document.getElementById('crack-tap-goal');
  const tapBarEl   = document.getElementById('crack-tap-bar');
  const patWrap    = document.getElementById('crack-pattern-wrap');
  const patSeqEl   = document.getElementById('crack-pattern-seq');
  const patInpEl   = document.getElementById('crack-pattern-input');
  const panel      = document.getElementById('crack-panel');

  const hex = '0123456789abcdef';
  const genHash = () => Array.from({length: 64}, () => hex[Math.floor(Math.random() * 16)]).join('');
  const genLine = () => Array.from({length: 48}, () => hex[Math.floor(Math.random() * 16)]).join(' ').toUpperCase();
  const targetHash = '0000' + genHash().slice(4);

  // --- Pick random puzzle type ---
  const puzzleTypes = ['code', 'hold', 'tap', 'pattern'];
  const puzzleType  = puzzleTypes[Math.floor(Math.random() * puzzleTypes.length)];
  let puzzleSuccess = false;
  let puzzleDone    = false;

  if (targetEl)  targetEl.textContent = targetHash;
  if (currentEl) { currentEl.textContent = genHash(); currentEl.className = 'crack-hash crack-hash-current'; }
  if (barEl)     barEl.style.width = '0%';
  if (barPctEl)  barPctEl.textContent = '0%';
  if (statusEl)  { statusEl.textContent = 'CRACKING...'; statusEl.className = 'crack-status'; statusEl.style.color = ''; statusEl.style.textShadow = ''; statusEl.style.animation = ''; }
  if (phaseEl)   phaseEl.textContent = 'INITIALIZING';
  if (phaseDotEl) phaseDotEl.className = 'crack-phase-dot';
  if (panel)     panel.classList.remove('crack-success-flash');
  if (codeWrap)  { codeWrap.style.display = 'none'; codeWrap.className = 'crack-code-wrap'; }
  if (holdWrap)  { holdWrap.style.display = 'none'; holdWrap.className = 'crack-hold-wrap'; }
  if (tapWrap)   { tapWrap.style.display  = 'none'; tapWrap.className  = 'crack-tap-wrap'; }
  if (patWrap)   { patWrap.style.display  = 'none'; patWrap.className  = 'crack-pattern-wrap'; }

  overlay.style.display = 'flex';
  SFX.crackStart && SFX.crackStart();

  // ── PUZZLE: CODE ─────────────────────────────────────────────
  const codeLen  = 3;
  const code     = Array.from({length: codeLen}, () => Math.floor(Math.random() * 10));
  let   typed    = [];
  let   codeActive = false;

  const renderDigits = () => {
    if (!codeDigits) return;
    codeDigits.innerHTML = code.map((d, i) => {
      const cls = i < typed.length ? 'crack-digit correct' : 'crack-digit';
      return `<div class="${cls}">${d}</div>`;
    }).join('');
  };
  const renderTyped = () => {
    if (!codeTyped) return;
    codeTyped.textContent = (typed.join('') || '') + (puzzleDone ? '' : '▮');
  };

  const onKey = (e) => {
    if (!codeActive || puzzleDone) return;
    const digit = parseInt(e.key, 10);
    if (isNaN(digit)) return;
    e.preventDefault();
    if (digit === code[typed.length]) {
      typed.push(digit);
      SFX.crackTick && SFX.crackTick();
      renderDigits(); renderTyped();
      if (typed.length === codeLen) {
        puzzleDone = true; puzzleSuccess = true;
        if (codeWrap) codeWrap.classList.add('success');
        if (codeTyped) codeTyped.textContent = typed.join('');
        SFX.crackCollision && SFX.crackCollision();
      }
    } else {
      typed = [];
      SFX.upgradeFail && SFX.upgradeFail();
      renderDigits(); renderTyped();
      if (codeWrap) {
        codeWrap.style.animation = 'none';
        void codeWrap.offsetWidth;
        codeWrap.style.animation = '';
        codeWrap.classList.add('failed');
        setTimeout(() => codeWrap && codeWrap.classList.remove('failed'), 400);
      }
    }
  };

  // ── PUZZLE: HOLD ─────────────────────────────────────────────
  const zoneStart = 0.40 + Math.random() * 0.25;   // 40–65%
  const zoneWidth = 0.18 + Math.random() * 0.10;   // 18–28%
  const zoneEnd   = Math.min(zoneStart + zoneWidth, 0.92);
  const holdDur   = 2200; // ms to fill bar completely
  let holdStart   = null;
  let holdFill    = 0;
  let holdActive  = false;
  let holdRaf     = null;

  const holdAnimate = () => {
    if (!holdStart || puzzleDone) return;
    holdFill = Math.min((performance.now() - holdStart) / holdDur, 1);
    const pct = holdFill * 100;
    if (holdFillEl) holdFillEl.style.width = pct + '%';
    if (holdNeedle) holdNeedle.style.left  = pct + '%';
    const inZone = holdFill >= zoneStart && holdFill <= zoneEnd;
    if (holdZone)  holdZone.classList.toggle('lit', inZone);
    if (holdHint)  {
      holdHint.textContent = inZone ? 'RELEASE NOW!' : 'HOLDING...';
      holdHint.classList.toggle('in-zone', inZone);
    }
    if (holdFill >= 1) { endHold(false); return; } // overshot
    holdRaf = requestAnimationFrame(holdAnimate);
  };

  const endHold = (released) => {
    if (puzzleDone) return;
    puzzleDone = true;
    cancelAnimationFrame(holdRaf);
    document.removeEventListener('mousedown', onHoldDown);
    document.removeEventListener('mouseup',   onHoldUp);
    if (!released) {
      // Overshot / timeout
      puzzleSuccess = false;
      if (holdHint) { holdHint.textContent = 'OVERLOADED!'; holdHint.classList.remove('in-zone'); holdHint.classList.add('done'); }
      if (holdWrap) holdWrap.classList.add('failed');
    } else {
      const inZone = holdFill >= zoneStart && holdFill <= zoneEnd;
      puzzleSuccess = inZone;
      if (holdHint) { holdHint.textContent = inZone ? 'LOCKED IN!' : 'MISSED ZONE'; holdHint.classList.add('done'); }
      if (holdWrap) holdWrap.classList.add(inZone ? 'success' : 'failed');
      if (inZone) SFX.crackCollision && SFX.crackCollision();
      else SFX.upgradeFail && SFX.upgradeFail();
    }
  };

  const onHoldDown = (e) => {
    if (!holdActive || puzzleDone || e.button !== 0) return;
    e.preventDefault();
    holdStart = performance.now();
    holdFill  = 0;
    holdRaf = requestAnimationFrame(holdAnimate);
  };
  const onHoldUp = (e) => {
    if (!holdActive || puzzleDone || e.button !== 0 || !holdStart) return;
    e.preventDefault();
    cancelAnimationFrame(holdRaf);
    endHold(true);
  };

  // ── PUZZLE: TAP ───────────────────────────────────────────────
  const tapGoal  = 8 + Math.floor(Math.random() * 6); // 8–13 taps
  let   tapCount = 0;
  let   tapActive = false;

  const onTapClick = (e) => {
    if (!tapActive || puzzleDone || e.button !== 0) return;
    e.preventDefault();
    tapCount++;
    SFX.crackTick && SFX.crackTick();
    if (tapNumEl)  tapNumEl.textContent  = tapCount;
    if (tapBarEl)  tapBarEl.style.width  = Math.min(tapCount / tapGoal * 100, 100) + '%';
    if (tapCount >= tapGoal) {
      puzzleDone = true; puzzleSuccess = true;
      if (tapNumEl)  tapNumEl.classList.add('done');
      if (tapWrap)   tapWrap.classList.add('success');
      SFX.crackCollision && SFX.crackCollision();
      document.removeEventListener('mousedown', onTapClick);
    }
  };

  // ── PUZZLE: PATTERN ───────────────────────────────────────────
  const ARROWS = [
    { sym: '↑', key: 'w', label: 'W' },
    { sym: '↓', key: 's', label: 'S' },
    { sym: '←', key: 'a', label: 'A' },
    { sym: '→', key: 'd', label: 'D' },
  ];
  const patLen  = 4 + Math.floor(Math.random() * 2); // 4–5 steps
  const pattern = Array.from({length: patLen}, () => ARROWS[Math.floor(Math.random() * 4)]);
  let   patIdx  = 0;
  let   patActive = false;

  const renderPattern = () => {
    if (!patSeqEl) return;
    patSeqEl.innerHTML = pattern.map((a, i) => {
      const cls = i < patIdx ? 'crack-pattern-arrow correct'
                : 'crack-pattern-arrow';
      return `<div class="${cls}">${a.sym}</div>`;
    }).join('');
    if (patInpEl) patInpEl.textContent = `PRESS: ${pattern[patIdx] ? pattern[patIdx].label : ''}`;
  };

  const onPatKey = (e) => {
    if (!patActive || puzzleDone) return;
    const k = e.key.toLowerCase();
    if (!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) return;
    e.preventDefault();
    const mapped = k === 'arrowup' ? 'w' : k === 'arrowdown' ? 's' : k === 'arrowleft' ? 'a' : k === 'arrowright' ? 'd' : k;
    if (mapped === pattern[patIdx].key) {
      patIdx++;
      SFX.crackTick && SFX.crackTick();
      if (patIdx >= patLen) {
        puzzleDone = true; puzzleSuccess = true;
        renderPattern();
        if (patInpEl) patInpEl.textContent = 'SEQUENCE ACCEPTED';
        if (patWrap)  patWrap.classList.add('success');
        SFX.crackCollision && SFX.crackCollision();
        document.removeEventListener('keydown', onPatKey);
      } else {
        renderPattern();
      }
    } else {
      // wrong — reset
      patIdx = 0;
      SFX.upgradeFail && SFX.upgradeFail();
      if (patSeqEl) {
        // flash all wrong briefly
        patSeqEl.querySelectorAll('.crack-pattern-arrow').forEach(el => {
          el.classList.add('wrong');
        });
        setTimeout(() => renderPattern(), 300);
      } else {
        renderPattern();
      }
      if (patWrap) {
        patWrap.classList.add('failed');
        setTimeout(() => patWrap && patWrap.classList.remove('failed'), 400);
      }
    }
  };

  // ── SHOW PUZZLE after 700ms ───────────────────────────────────
  const puzzleShowTimer = setTimeout(() => {
    if (puzzleType === 'code') {
      if (!codeWrap) return;
      codeActive = true;
      renderDigits(); renderTyped();
      codeWrap.style.display = 'block';
      document.addEventListener('keydown', onKey);
    } else if (puzzleType === 'hold') {
      if (!holdWrap || !holdZone) return;
      holdActive = true;
      holdZone.style.left  = (zoneStart * 100) + '%';
      holdZone.style.width = ((zoneEnd - zoneStart) * 100) + '%';
      if (holdFillEl) holdFillEl.style.width = '0%';
      if (holdNeedle) holdNeedle.style.left  = '0%';
      if (holdHint)   holdHint.textContent   = 'CLICK AND HOLD';
      holdWrap.style.display = 'block';
      document.addEventListener('mousedown', onHoldDown);
      document.addEventListener('mouseup',   onHoldUp);
    } else if (puzzleType === 'tap') {
      if (!tapWrap) return;
      tapActive = true;
      if (tapNumEl)  tapNumEl.textContent = '0';
      if (tapNumEl)  tapNumEl.classList.remove('done');
      if (tapGoalEl) tapGoalEl.textContent = tapGoal;
      if (tapBarEl)  tapBarEl.style.width  = '0%';
      tapWrap.style.display = 'block';
      document.addEventListener('mousedown', onTapClick);
    } else {
      // pattern
      if (!patWrap) return;
      patActive = true;
      renderPattern();
      patWrap.style.display = 'block';
      document.addEventListener('keydown', onPatKey);
    }
  }, 700);

  const phases = [
    { at: 0.00, label: 'INITIALIZING' },
    { at: 0.12, label: 'BRUTE FORCING' },
    { at: 0.42, label: 'DICTIONARY ATTACK' },
    { at: 0.72, label: 'COLLISION FOUND...' },
    { at: 0.90, label: 'CRACKING HASH' },
  ];
  let lastPhase = -1;
  const totalDur = 3500;
  const startTime = performance.now();
  let nonce = 0;
  let tickAccum = 0;

  const burstTimes = [600, 1100, 1600, 2050, 2400, 2750, 3050, 3250];
  burstTimes.forEach(t => setTimeout(() => SFX.crackBurst && SFX.crackBurst(), t));
  setTimeout(() => { if (!puzzleSuccess) SFX.crackCollision && SFX.crackCollision(); }, 2800);

  let streamLines = [];
  const pushStream = () => {
    if (!streamEl) return;
    streamLines.push(genLine());
    if (streamLines.length > 2) streamLines.shift();
    streamEl.innerHTML = streamLines.map(l => `<div>${l}</div>`).join('');
  };

  const finishCrack = (success) => {
    clearInterval(interval);
    clearTimeout(puzzleShowTimer);
    document.removeEventListener('keydown',   onKey);
    document.removeEventListener('keydown',   onPatKey);
    document.removeEventListener('mousedown', onHoldDown);
    document.removeEventListener('mousedown', onTapClick);
    document.removeEventListener('mouseup',   onHoldUp);
    cancelAnimationFrame(holdRaf);
    puzzleDone = true;

    if (success) {
      if (currentEl) { currentEl.textContent = targetHash; currentEl.classList.add('matched'); }
      if (statusEl)  { statusEl.textContent = '[ CRACKED ]'; statusEl.className = 'crack-status cracked'; }
      if (phaseEl)   phaseEl.textContent = 'ACCESS GRANTED';
      if (phaseDotEl) phaseDotEl.className = 'crack-phase-dot success';
      if (panel)     panel.classList.add('crack-success-flash');
      SFX.crackSuccess && SFX.crackSuccess();
      setTimeout(() => { overlay.style.display = 'none'; S.cracking = false; claimCrackPrize(prize, bx, by); }, 1900);
    } else {
      const activeWrap = { code: codeWrap, hold: holdWrap, tap: tapWrap, pattern: patWrap }[puzzleType];
      if (activeWrap && !activeWrap.classList.contains('failed')) activeWrap.classList.add('failed');
      if (puzzleType === 'code' && codeTyped) codeTyped.textContent = 'TIMEOUT';
      if (statusEl)  { statusEl.textContent = '[ FAILED ]'; statusEl.style.color = '#ff2200'; statusEl.style.textShadow = '0 0 12px rgba(255,34,0,0.8)'; statusEl.style.animation = 'none'; }
      if (phaseEl)   phaseEl.textContent = 'ACCESS DENIED';
      if (barEl)     barEl.style.background = '#ff2200';
      SFX.upgradeFail && SFX.upgradeFail();
      setTimeout(() => SFX.upgradeFail && SFX.upgradeFail(), 300);
      setTimeout(() => { overlay.style.display = 'none'; S.cracking = false; logEvent('ACCESS DENIED — breach failed.', 'warn'); }, 1900);
    }
  };

  const interval = setInterval(() => {
    const elapsed = performance.now() - startTime;
    const pct = Math.min(elapsed / totalDur, 1);

    for (let i = phases.length - 1; i >= 0; i--) {
      if (pct >= phases[i].at && i !== lastPhase) {
        lastPhase = i;
        if (phaseEl) phaseEl.textContent = phases[i].label;
        break;
      }
    }

    nonce = Math.floor(Math.random() * 0xFFFFFF * pct + nonce * 0.1);
    if (nonceEl)    nonceEl.textContent    = '0x' + nonce.toString(16).toUpperCase().padStart(8, '0');
    if (attemptsEl) attemptsEl.textContent = Math.floor(pct * 8400 + Math.random() * 120).toLocaleString();
    if (hashrateEl) hashrateEl.textContent = Math.floor(2200 + pct * 6800 + Math.random() * 400).toLocaleString();
    if (currentEl)  currentEl.textContent  = pct > 0.9 ? ('0000' + genHash().slice(4)) : genHash();
    if (barEl)      barEl.style.width      = (pct * 100) + '%';
    if (barPctEl)   barPctEl.textContent   = Math.floor(pct * 100) + '%';

    if (!puzzleSuccess) {
      tickAccum += 60;
      if (tickAccum >= Math.max(40, 180 - pct * 140)) { tickAccum = 0; SFX.crackTick && SFX.crackTick(); }
    }
    if (Math.random() < 0.4) pushStream();

    if (pct >= 1) finishCrack(puzzleSuccess);
  }, 60);
}

function claimCrackPrize(prize, bx, by) {
  S.loot.push({ x: bx, y: by, type: prize.type, val: prize.val, collected: false, age: 0 });
  spawnHit && spawnHit(bx, by, '#ff8800', 14);
  logEvent(`BOX CRACKED — drop incoming! +5 energy bonus.`, 'loot');
  setTimeout(() => {
    const eMax = (typeof ENERGY_MAX !== 'undefined' ? ENERGY_MAX : 10) + (Profile?.upgrades?.maxEnergy || 0);
    S.energy = Math.min(eMax, (S.energy || 0) + 5);
    updateEnergyHud && updateEnergyHud();
    spawnDmgNumber(bx, by, '+5\u26A1', '#00ff88', 16, 'crit');
    SFX.nanoHeal && SFX.nanoHeal();
  }, 1000);
}

window.toggleOpsStatus = function () {
  const ov = document.getElementById('ops-overlay');
  if (!ov) return;
  if (ov.classList.contains('active')) {
    window.closeOpsStatus();
  } else {
    const content = document.getElementById('ops-content');
    if (content) content.innerHTML = buildPlayerStatsHTML();
    ov.classList.add('active');
  }
};
window.closeOpsStatus = function () {
  const ov = document.getElementById('ops-overlay');
  if (ov) ov.classList.remove('active');
};

function buildPlayerStatsHTML() {
  const u = Profile.upgrades || {};
  const inv = S.inventory || Profile.inventory || [];
  const invCount = (type, rarity) => {
    const slot = inv.find(s => s && s.type === type && (!rarity || s.rarity === rarity));
    return slot?.qty || 0;
  };
  const accuracy = stats.shots[0] > 0 ? Math.round(stats.hits[0] / stats.shots[0] * 100) : 0;
  const maxNrg = ENERGY_MAX + (u.maxEnergy || 0);
  const critPct = Math.round(getCritChance() * 1000) / 10;
  const nanoLvl = u.nanoLevel || 0;
  const nanoInterval = getNanoHealInterval(nanoLvl);

  // Upgrade bar helper
  const upgRow = (name, lvl, maxLvl, valStr, barColor = '') => {
    const pct = Math.min(100, Math.round((lvl / maxLvl) * 100));
    const isOff = lvl <= 0;
    const valCls = isOff ? 'off' : barColor;
    return `<div class="ops-upg-row">
      <span class="ops-upg-name">${name}</span>
      <div class="ops-upg-bar"><div class="ops-upg-bar-fill ${barColor}" style="width:${pct}%"></div></div>
      <span class="ops-upg-val ${valCls}">${isOff ? '— OFF' : valStr}</span>
    </div>`;
  };

  // Chip badges
  const chipDefs = [
    { r: 'common',    lbl: 'COM',    cls: 'common' },
    { r: 'uncommon',  lbl: 'UNC',    cls: 'uncommon' },
    { r: 'rare',      lbl: 'RARE',   cls: 'rare' },
    { r: 'epic',      lbl: 'EPIC',   cls: 'epic' },
    { r: 'legendary', lbl: 'LEG',    cls: 'legendary' },
    { r: 'mythic',    lbl: 'MYTH',   cls: 'mythic' },
  ];
  const chipsHTML = chipDefs.map(({ r, lbl, cls }) => {
    const cnt = invCount('chip', r);
    return `<div class="ops-chip-badge ${cls} ${cnt > 0 ? 'has' : ''}">
      <div class="ops-chip-dot"></div>
      <span class="ops-chip-qty">${cnt}</span>
      <span>${lbl}</span>
    </div>`;
  }).join('');

  // Resource cells
  const resCell = (icon, val, lbl) => {
    const zero = val <= 0;
    return `<div class="ops-res-cell">
      <span class="ops-res-icon">${icon}</span>
      <div class="ops-res-info">
        <span class="ops-res-val ${zero ? 'zero' : ''}">${val}</span>
        <span class="ops-res-lbl">${lbl}</span>
      </div>
    </div>`;
  };

  const accColor = accuracy >= 60 ? '' : accuracy >= 30 ? 'yellow' : 'red';
  const activeCards = (S.runCards || []).map(id => {
    const c = CARD_POOL.find(x => x.id === id);
    return c ? c.name : id;
  });

  return `
    <div class="ops-statusbar">
      <div class="ops-statusbar-cell">
        <span class="ops-sb-val">L${S.floor || 1}</span>
        <span class="ops-sb-lbl">LAYER</span>
      </div>
      <div class="ops-statusbar-cell">
        <span class="ops-sb-val">${stats.ticks}</span>
        <span class="ops-sb-lbl">TICKS</span>
      </div>
      <div class="ops-statusbar-cell">
        <span class="ops-sb-val ${accuracy >= 60 ? '' : accColor}">${accuracy}%</span>
        <span class="ops-sb-lbl">ACCURACY</span>
      </div>
      <div class="ops-statusbar-cell">
        <span class="ops-sb-val">${stats.shots[0]}</span>
        <span class="ops-sb-lbl">SHOTS</span>
      </div>
    </div>

    <div class="ops-cards">
      <div class="ops-card">
        <span class="ops-card-icon">▲</span>
        <span class="ops-card-val">${maxNrg}</span>
        <span class="ops-card-lbl">MAX ENERGY</span>
      </div>
      <div class="ops-card">
        <span class="ops-card-icon">◆</span>
        <span class="ops-card-val yellow">${critPct}%</span>
        <span class="ops-card-lbl">CRIT CHANCE</span>
      </div>
      <div class="ops-card">
        <span class="ops-card-icon">↑</span>
        <span class="ops-card-val cyan">${stats.hits[0]}</span>
        <span class="ops-card-lbl">HITS LANDED</span>
      </div>
      <div class="ops-card">
        <span class="ops-card-icon">⟳</span>
        <span class="ops-card-val ${nanoLvl > 0 ? '' : 'red'}">${nanoLvl > 0 ? nanoInterval + 'T' : 'OFF'}</span>
        <span class="ops-card-lbl">NANO REGEN</span>
      </div>
    </div>

    <div class="ops-section-hdr">UPGRADES</div>
    ${upgRow('ENERGY',     u.maxEnergy     || 0, 10, `LVL ${u.maxEnergy} / MAX ${maxNrg}`, 'cyan')}
    ${upgRow('CRIT',       u.critLevel     || 0, 10, `LVL ${u.critLevel} / ${critPct}%`, 'yellow')}
    ${upgRow('NANO REGEN', nanoLvl,               8,  `LVL ${nanoLvl} / ${nanoInterval}T`)}
    ${upgRow('FREE SHOT',  u.freeShotLevel || 0,  4,  `LVL ${u.freeShotLevel}`)}
    ${upgRow('JUMP',       u.jumpLevel     || 0,  4,  `LVL ${u.jumpLevel}`)}
    ${upgRow('BLOOD RUSH', u.bloodRushLevel|| 0,  4,  `LVL ${u.bloodRushLevel}`, 'red')}
    ${upgRow('CARD SLOT',  u.cardSlotLevel || 0,  4,  `+${u.cardSlotLevel} SLOT`, 'yellow')}

    <div class="ops-section-hdr">CHIPS</div>
    <div class="ops-chips">${chipsHTML}</div>

    <div class="ops-section-hdr">ELIMINATIONS</div>
    <div class="ops-resources">
      ${resCell('☠', S.kills || 0,                          'THIS RUN')}
      ${resCell('◈', Profile.stats?.totalKills || 0,        'ALL TIME')}
      ${resCell('⚡', S.floor || 1,                          'LAYER')}
      ${resCell('▣', Profile.highestSector || 1,            'BEST LAYER')}
    </div>

    ${activeCards.length > 0 ? `
      <div class="ops-section-hdr">ACTIVE CARDS</div>
      <div class="ops-runcards">${activeCards.map(n => `<span class="ops-runcard-tag">${n}</span>`).join('')}</div>
    ` : ''}
  `;
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
  // Show/hide operator status button only on adventure death
  const opsBtn = document.getElementById('btn-ops-status');
  const statsPanel = document.getElementById('go-player-stats');
  if (opsBtn) opsBtn.style.display = (gameMode === 'adventure' && S.winner === 1) ? '' : 'none';
  if (opsBtn) opsBtn.classList.remove('active');
  if (statsPanel) { statsPanel.classList.remove('active'); statsPanel.innerHTML = ''; }
  showScreen('screen-gameover');
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
    { w: 'hack', getAmmo: () => S.hackAmmo || 0, max: () => S.hackAmmoMax || 2, regen: 0, getTick: u => 0 },
    { w: 'ronke', getAmmo: () => S.inventory?.find(s => s && s.type === 'ronke')?.qty || 0, max: () => null, regen: 0, getTick: u => 0 },
  ];

  const adj = isAdjacentToEnemy(unit);

  WEPS.forEach(({ w, getAmmo, max, regen, getTick }, i) => {
    const slot = document.getElementById(`${pfx}-sk-${i}`);
    if (!slot) return;

    // Active / weapon colour class – deactivate all when jump mode is on
    const jumpActive = gameMode === 'adventure' && team === 0 && S.jumpMode;
    slot.classList.toggle('sk-active', w === wep && !jumpActive);
    slot.classList.toggle('sk-disabled', !!jumpActive);
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
      if (w === 'hack') empty = (S.hackAmmo || 0) <= 0;
      else if (w === 'ronke') empty = (S.inventory?.find(s => s && s.type === 'ronke')?.qty || 0) <= 0;
      else empty = S.energy < nrgReq;
    } else {
      empty = ammo <= 0;
    }

    const disabled = false;
    slot.classList.toggle('sk-empty', empty);
    slot.classList.toggle('sk-disabled', disabled);

    if (gameMode === 'adventure') {
      if (w === 'hack') cd.textContent = (S.hackAmmo || 0) > 0 ? `${S.hackAmmo} LEFT` : '-10\u26A1';
      else if (w === 'ronke') { const rc = S.inventory?.find(s => s && s.type === 'ronke')?.qty || 0; cd.textContent = rc > 0 ? `${rc} LEFT` : 'EMPTY'; }
      else cd.textContent = empty ? 'NO\u26A1' : `-${nrgReq}\u26A1`;
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
  if (!action) { if (gameMode === 'adventure') return; el.textContent = 'READY'; el.className = 'action-badge'; return; }
  if (action.t === 'move') {
    const dirs = { '0,-1': 'N', '0,1': 'S', '-1,0': 'W', '1,0': 'E' };
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



window.startGame = function startGame(mode) {
  SFX.init();
  SFX.select();
  gameMode = mode || gameMode;
  stopAIThinking();
  if (raf) cancelAnimationFrame(raf);
  tickTimer = null; tickStart = null;

  if (gameMode === 'adventure') initAdventure();
  else if (gameMode === 'hub') initHubRoom();
  else initState();

  playCurrentLevelBGM();

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
    advCanvasW = ADV_COLS * UNIT_CELL;
    updateEnergyHud();
    const hubBtn = document.getElementById('btn-open-hub');
    if (hubBtn) hubBtn.style.display = 'block';
    const opsBtn2 = document.getElementById('btn-ops-status');
    if (opsBtn2) opsBtn2.style.display = 'block';
    updateRunKeyUI();
    const killsDisplay = document.getElementById('kills-badge');
    if (killsDisplay) killsDisplay.style.display = 'block';
    const invBtn = document.getElementById('btn-inventory');
    if (invBtn) invBtn.style.display = 'flex';
    const bottomRow = document.querySelector('.btn-bottom-row');
    if (bottomRow) bottomRow.style.display = 'flex';
    const rewardsBtn = document.getElementById('btn-rewards');
    if (rewardsBtn) rewardsBtn.style.display = 'block';
    document.getElementById('hub-overlay').classList.remove('active');
    const mc = document.getElementById('mobile-controls');
    if (mc && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) mc.classList.add('visible');
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
    const opsBtn2 = document.getElementById('btn-ops-status');
    if (opsBtn2) opsBtn2.style.display = 'none';
    const killsDisplay = document.getElementById('kills-badge');
    if (killsDisplay) killsDisplay.style.display = 'none';
    const invBtn = document.getElementById('btn-inventory');
    if (invBtn) invBtn.style.display = 'none';
    const bottomRow = document.querySelector('.btn-bottom-row');
    if (bottomRow) bottomRow.style.display = 'none';
    const rewardsBtn2 = document.getElementById('btn-rewards');
    if (rewardsBtn2) rewardsBtn2.style.display = 'none';
    const mc = document.getElementById('mobile-controls');
    if (mc) mc.classList.remove('visible');
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

// ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Utilities ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t) { const c = 1.3; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
function hexAlpha(hex, a) {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
}

// ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Bootstrap ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ'Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
// --- Mouse Aiming ---
function updateP1Aim(x, y) {
  if (typeof S === 'undefined' || !S || S.phase !== 'frozen' || S.clockSide !== 0) return;
  if (S.heroShootLock && gameMode === 'adventure') return;
  const sel = S.units.find(u => u.id === S.selectedId[0] && u.alive);
  if (!sel) return;

  const gx = Math.floor(x / CELL);
  const gy = Math.floor(y / CELL);

  if (gx === sel.x && gy === sel.y) return;

  const dx = gx - sel.x;
  const dy = gy - sel.y;

  let fdx = 0;
  let fdy = 0;

  // Exact 8-way directional aiming for bullets
  if (dx !== 0 && Math.abs(dx) > Math.abs(dy) * 2) {
    fdx = Math.sign(dx);
  } else if (dy !== 0 && Math.abs(dy) > Math.abs(dx) * 2) {
    fdy = Math.sign(dy);
  } else {
    fdx = Math.sign(dx);
    fdy = Math.sign(dy);
  }

  // Update facing (used for movement and default drawing)
  sel.facing = { dx: fdx, dy: fdy };

  // Update aimDir (used specifically for shooting to allow diagonal shots)
  sel.aimDir = { dx: fdx, dy: fdy };
}

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
      updateRunKeyUI();
    } else {
      startGame();
    }
  });

  document.getElementById('btn-menu-go').addEventListener('click', () => { SFX.init(); backToMenu(); });
  document.getElementById('btn-esc').addEventListener('click', () => { SFX.init(); backToMenu(); });
  document.getElementById('btn-hub-back').addEventListener('click', () => { SFX.init(); BGM.start('menu'); showScreen('screen-menu'); });

  // Update run key timer every second (always, regardless of screen)
  setInterval(updateRunKeyUI, 1000);

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
          updateRunKeyUI();
        } else {
          startGame();
        }
      } else if (e.key === 'Escape') {
        SFX.init();
        const achOverlay = document.getElementById('ach-overlay');
        if (achOverlay && achOverlay.classList.contains('active')) {
          closeAchievementsPanel();
        } else if (tutorialActive) {
          skipTutorial();
        } else {
          backToMenu();
        }
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

  const canvasInputEl = canvas.parentElement || canvas;

  const overlayBlocksCanvasInput = () => {
    if (document.getElementById('card-picker-overlay')) return true;
    const blockedIds = ['inv-overlay', 'forge-overlay', 'slot-overlay', 'hub-overlay', 'teleport-confirm-overlay'];
    if (!document.getElementById('rewards-overlay')?.classList.contains('hidden')) return true;
    return blockedIds.some(id => {
      const el = document.getElementById(id);
      return !!el && (el.classList.contains('active') || el.style.display === 'flex' || el.style.display === 'block');
    });
  };

  let lastCanvasPointerDownAt = 0;
  let hoverGx = -1, hoverGy = -1;
  const pointInsideCanvas = e => {
    if (!e || typeof e.clientX !== 'number' || typeof e.clientY !== 'number') return false;
    const r = canvas.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };

  window.isEditMode = false;
  window.editTileType = "1"; // string type, numbers for ground, strings for objects
  window.toggleEditMode = () => {
    window.isEditMode = !window.isEditMode;
    const pal = document.getElementById('edit-palette');
    if(pal) {
      pal.style.display = window.isEditMode ? 'flex' : 'none';
      if(window.isEditMode && !pal.hasBuiltExt) buildEditorPaletteExt(pal);
      if (window.isEditMode && typeof window.setEditorSection === 'function') {
        window.setEditorSection(window.editorSection || 'map');
      }
    }
    if(window.isEditMode) showGameNotification('EDITOR', 'MAP/NPC tabs active. Click or drag on the map to paint or place enemies.', '#ff00bb');
  };
  window.setEditTile = (v) => { window.editTileType = v; };
  window.exportMap = () => {
    if(!S.dungeon) return;
    // Preserve existing spawnPos/exitPos or use current CUSTOM_MAP values as fallback
    const prevMap = window.CUSTOM_MAP || {};
    const hero = S.units && S.units.find(u => u.team === 0 && u.alive);
    const spawnPos = hero ? { x: hero.x, y: hero.y } : (prevMap.spawnPos || { x: 2, y: 2 });
    const exitPos = (S.teleports && S.teleports[0])
      ? { x: S.teleports[0].x, y: S.teleports[0].y }
      : (prevMap.exitPos || { x: 2, y: 2 });
    const mapObj = {
      dungeon: S.dungeon,
      decorations: S.decorations || {},
      collisionBoxes: S.collisionBoxes ? [...S.collisionBoxes] : [],
      enemies: Array.isArray(S.customEnemyPlacements) ? cloneEditorEnemyPlacements(S.customEnemyPlacements) : cloneEditorEnemyPlacements(getLiveEditorEnemyPlacements()),
      spawnPos,
      exitPos
    };
    const line = `window.CUSTOM_MAP = ${JSON.stringify(mapObj)};`;
    navigator.clipboard.writeText(line).then(() => showGameNotification('EDITOR', `Map exported! spawn(${spawnPos.x},${spawnPos.y}) exit(${exitPos.x},${exitPos.y}) enemies:${mapObj.enemies.length}`, '#00ff00'));
    console.log(line);
  };

  function buildEditorPaletteExt(pal) {
    pal.hasBuiltExt = true;
    pal.style.overflowY = 'auto';
    pal.style.maxHeight = '80vh';
    const basePaletteHtml = pal.innerHTML;
    pal.innerHTML = `
      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <button id="editor-tab-map" style="flex:1; background:#ff00bb; color:white; border:1px solid #ff77dd; padding:8px 6px; cursor:pointer; font-family:'Press Start 2P', monospace; font-size:9px;" onclick="setEditorSection('map')">MAP</button>
        <button id="editor-tab-npc" style="flex:1; background:#1f2433; color:#8fd8ff; border:1px solid #4ab5c0; padding:8px 6px; cursor:pointer; font-family:'Press Start 2P', monospace; font-size:9px;" onclick="setEditorSection('npc')">NPC</button>
      </div>
      <div id="editor-map-panel" style="display:flex; flex-direction:column; gap:10px;"></div>
      <div id="editor-npc-panel" style="display:none; flex-direction:column; gap:10px;"></div>
    `;
    const mapPanel = document.getElementById('editor-map-panel');
    const npcPanel = document.getElementById('editor-npc-panel');
    mapPanel.innerHTML = `<div style="color:#ff00bb; font-size:10px; margin-bottom:5px;">TERRAIN</div>` + basePaletteHtml;

    window.setEditorSection = (section = 'map') => {
      window.editorSection = section;
      const mapTab = document.getElementById('editor-tab-map');
      const npcTab = document.getElementById('editor-tab-npc');
      const mapWrap = document.getElementById('editor-map-panel');
      const npcWrap = document.getElementById('editor-npc-panel');
      if (!mapTab || !npcTab || !mapWrap || !npcWrap) return;
      const showNpc = section === 'npc';
      mapWrap.style.display = showNpc ? 'none' : 'flex';
      npcWrap.style.display = showNpc ? 'flex' : 'none';
      mapTab.style.background = showNpc ? '#1f2433' : '#ff00bb';
      mapTab.style.color = showNpc ? '#ff9be8' : '#ffffff';
      npcTab.style.background = showNpc ? '#4ab5c0' : '#1f2433';
      npcTab.style.color = showNpc ? '#07111a' : '#8fd8ff';
    };
    // CLIFFS and DEEP WATER buttons are now in index.html
    // Add eraser
    mapPanel.innerHTML += `<button onclick="setEditTile('erase_prop')" style="background:#550000; width:100px; height:30px; margin-top:5px; color:white; font-size:9px; cursor:pointer;">&#x2715; ERASE PROP</button>`;
    
    // Add Fill buttons
    mapPanel.innerHTML += `<div style="margin-top:5px; display:flex; gap:5px;"><button onclick="fillMap(1)" style="flex:1; background:#3a7a2a; color:white; font-size:9px;">FILL GRASS</button><button onclick="fillMap(0)" style="flex:1; background:#4ab5c0; color:white; font-size:9px;">FILL WATER</button></div>`;
    
    window.fillMap = (type) => {
        if (!S.dungeon) return;
        for (let r=0; r<ROWS; r++) {
           for (let c=0; c<COLS; c++) {
              S.dungeon[r][c] = type;
           }
        }
        showGameNotification('EDITOR', `Map filled with ${type === 1 ? 'GRASS' : 'WATER'}!`, '#00ff00');
    };

    window.openPicker = (type) => {
      const modal = document.getElementById('picker-modal');
      const title = document.getElementById('picker-title');
      const canvas = document.getElementById('picker-canvas');
      const hl = document.getElementById('picker-highlight');
      const ctx = canvas.getContext('2d');
      
      const img = type === 'elev' ? elevationImg : type === 'tileset1' ? tilesetImg : type === 'tileset3' ? tileset3Img : type === 'bridge' ? bridgeImg : flatImg;
      const prefix = type === 'elev' ? 'elev' : type === 'tileset1' ? 'tileset1' : type === 'tileset3' ? 'tileset3' : type === 'bridge' ? 'bridge' : 'flat';

      title.innerText = `SELECT ${type === 'elev' ? 'ELEVATION' : type === 'tileset1' ? 'TILESET 1' : type === 'tileset3' ? 'TILESET 3' : type === 'bridge' ? 'BRIDGE' : 'FLAT'} TILE`;
      modal.style.display = 'flex';
      
      if(img && img.complete && img.naturalWidth > 0) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
      }
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);
      if(img && img.complete) {
          ctx.drawImage(img, 0, 0);
      }
      
      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      for(let i=0; i<=W; i+=64) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke(); }
      for(let i=0; i<=H; i+=64) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(W,i); ctx.stroke(); }

      let isPicking = false;
      let startTx = 0, startTy = 0, endTx = 0, endTy = 0;
      
      const updateHighlight = () => {
        const minTx = Math.min(startTx, endTx);
        const minTy = Math.min(startTy, endTy);
        const w = Math.max(startTx, endTx) - minTx + 1;
        const h = Math.max(startTy, endTy) - minTy + 1;
        hl.style.display = 'block';
        hl.style.left = (minTx * 64) + 'px';
        hl.style.top = (minTy * 64) + 'px';
        hl.style.width = (w * 64) + 'px';
        hl.style.height = (h * 64) + 'px';
      };

      canvas.onmousedown = e => {
        isPicking = true;
        const rect = canvas.getBoundingClientRect();
        startTx = Math.floor((e.clientX - rect.left) / (rect.width / W) / 64);
        startTy = Math.floor((e.clientY - rect.top) / (rect.height / H) / 64);
        endTx = startTx; endTy = startTy;
        updateHighlight();
      };

      canvas.onmousemove = e => {
        const rect = canvas.getBoundingClientRect();
        const tx = Math.floor((e.clientX - rect.left) / (rect.width / W) / 64);
        const ty = Math.floor((e.clientY - rect.top) / (rect.height / H) / 64);
        if (isPicking) {
            endTx = tx; endTy = ty;
        } else {
            startTx = tx; startTy = ty; endTx = tx; endTy = ty;
        }
        updateHighlight();
      };

      canvas.onmouseleave = () => { if (!isPicking) hl.style.display = 'none'; };

      canvas.onmouseup = e => {
        if (!isPicking) return;
        isPicking = false;
        const minTx = Math.min(startTx, endTx);
        const minTy = Math.min(startTy, endTy);
        const w = Math.max(startTx, endTx) - minTx + 1;
        const h = Math.max(startTy, endTy) - minTy + 1;
        
        if (w === 1 && h === 1) {
            window.setEditTile(`${prefix}_${minTx}_${minTy}`);
            showGameNotification('EDITOR', `Selected ${prefix} [${minTx}, ${minTy}]`, '#00ff00');
        } else {
            window.setEditTile(`${prefix}group_${minTx}_${minTy}_${w}_${h}`);
            showGameNotification('EDITOR', `Selected ${prefix} Grid [${w}x${h}]`, '#00ff00');
        }
        modal.style.display = 'none';
      };
    };

    window.openRockPicker = () => {
      const existing = document.getElementById('rock-picker-modal');
      if (existing) { existing.style.display = 'flex'; return; }

      // Build modal — 4 thumbnail canvases, one per variant
      const m = document.createElement('div');
      m.id = 'rock-picker-modal';
      m.style.cssText = 'display:flex; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:#111; border:2px solid #4ab5c0; z-index:9999; padding:14px; flex-direction:column; align-items:center; gap:12px; font-family:"Press Start 2P",monospace;';

      const title = document.createElement('div');
      title.textContent = 'SELECT ROCK';
      title.style.cssText = 'color:#4ab5c0; font-size:11px;';
      m.appendChild(title);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:10px;';

      for (let i = 1; i <= 4; i++) {
        const card = document.createElement('div');
        card.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; padding:6px; border:2px solid #333; border-radius:4px;';
        card.onmouseover = () => card.style.borderColor = '#4ab5c0';
        card.onmouseout = () => card.style.borderColor = '#333';

        // Preview canvas — shows frame 0 of the rock (128×128, first frame)
        const cv = document.createElement('canvas');
        cv.width = 128; cv.height = 128;
        cv.style.cssText = 'image-rendering:pixelated; width:96px; height:96px; background:#003344;';
        const ctx2 = cv.getContext('2d');
        const img = rockImgs[i];
        const drawPreview = () => ctx2.drawImage(img, 0, 0, 128, 128, 0, 0, 128, 128);
        if (img.complete && img.naturalWidth > 0) { drawPreview(); } else { img.onload = drawPreview; }

        const lbl = document.createElement('div');
        lbl.textContent = `ROCK 0${i}`;
        lbl.style.cssText = 'color:#aaa; font-size:7px;';

        card.appendChild(cv);
        card.appendChild(lbl);
        card.onclick = () => {
          window.setEditTile(`rock${i}`);
          showGameNotification('EDITOR', `Rock 0${i} selected — animuotas`, '#4ab5c0');
          m.style.display = 'none';
        };
        grid.appendChild(card);
      }

      m.appendChild(grid);

      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'CLOSE';
      closeBtn.style.cssText = 'background:#4ab5c0; color:#000; border:none; padding:5px 14px; cursor:pointer; font-family:"Press Start 2P",monospace; font-size:9px;';
      closeBtn.onclick = () => m.style.display = 'none';
      m.appendChild(closeBtn);

      document.getElementById('screen-game').appendChild(m);
    };

    window.openBushPicker = () => {
      const existing = document.getElementById('bush-picker-modal');
      if (existing) { existing.style.display = 'flex'; return; }

      const m = document.createElement('div');
      m.id = 'bush-picker-modal';
      m.style.cssText = 'display:flex; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:#111; border:2px solid #6ccf74; z-index:9999; padding:14px; flex-direction:column; align-items:center; gap:12px; font-family:"Press Start 2P",monospace;';

      const title = document.createElement('div');
      title.textContent = 'SELECT BUSH';
      title.style.cssText = 'color:#6ccf74; font-size:11px;';
      m.appendChild(title);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:10px;';

      for (let i = 1; i <= 4; i++) {
        const card = document.createElement('div');
        card.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; padding:6px; border:2px solid #333; border-radius:4px;';
        card.onmouseover = () => card.style.borderColor = '#6ccf74';
        card.onmouseout = () => card.style.borderColor = '#333';

        const cv = document.createElement('canvas');
        cv.width = 128; cv.height = 128;
        cv.style.cssText = 'image-rendering:pixelated; width:96px; height:96px; background:#12331b;';
        const ctx2 = cv.getContext('2d');
        const img = bushImgs[i];
        const drawPreview = () => ctx2.drawImage(img, 0, 0, 128, 128, 0, 0, 128, 128);
        if (img.complete && img.naturalWidth > 0) { drawPreview(); } else { img.onload = drawPreview; }

        const lbl = document.createElement('div');
        lbl.textContent = `BUSH 0${i}`;
        lbl.style.cssText = 'color:#aaa; font-size:7px;';

        card.appendChild(cv);
        card.appendChild(lbl);
        card.onclick = () => {
          window.setEditTile(`bush${i}`);
          showGameNotification('EDITOR', `Bush 0${i} selected - animuotas`, '#6ccf74');
          m.style.display = 'none';
        };
        grid.appendChild(card);
      }

      m.appendChild(grid);

      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'CLOSE';
      closeBtn.style.cssText = 'background:#6ccf74; color:#000; border:none; padding:5px 14px; cursor:pointer; font-family:"Press Start 2P",monospace; font-size:9px;';
      closeBtn.onclick = () => m.style.display = 'none';
      m.appendChild(closeBtn);

      document.getElementById('screen-game').appendChild(m);
    };

    let html = `<div style="color:#ff00bb; font-size:10px; margin-top:15px; margin-bottom:5px;">DECORATIONS</div><div style="display:flex; flex-wrap:wrap; gap:4px; max-width:200px;">`;
    for(let i=1; i<=18; i++) {
        let no = i.toString().padStart(2, '0');
        html += `<img src="assets_tiny/Deco/${no}.png" onclick="setEditTile('deco_${no}')" style="width:32px; height:32px; cursor:pointer; background:rgba(255,255,255,0.1); padding:2px; border-radius:4px;" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'"/>`;
    }
    html += `<div style="width:100%; height:5px;"></div>`;
    html += `<img src="assets_tiny/Resources/Trees/Tree.png" onclick="setEditTile('tree_1')" style="width:32px; height:32px; object-fit:cover; object-position:0 0; cursor:pointer; background:rgba(255,255,255,0.1); padding:2px;" />`;
    html += `<img src="assets_tiny/Deco/rubber_duck.png" onclick="setEditTile('duck')" title="Rubber Duck (animuotas)" style="width:32px; height:32px; object-fit:cover; object-position:0 0; cursor:pointer; background:rgba(255,255,255,0.1); padding:2px; border-radius:4px; image-rendering:pixelated;" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'" />`;
    html += `<img src="assets_tiny/Resources/Gold Mine/GoldMine_Inactive.png" onclick="setEditTile('mine_1')" style="width:32px; height:32px; object-fit:cover; object-position:0 0; cursor:pointer; background:rgba(255,255,255,0.1); padding:2px;" />`;
    html += `<img src="assets_tiny/Terrain/Bushe1.png" onclick="openBushPicker()" title="Animated Bushes" style="width:32px; height:32px; object-fit:cover; object-position:left top; cursor:pointer; background:rgba(20,60,30,0.85); padding:2px; border-radius:4px; border:1px solid #6ccf74; image-rendering:pixelated;" onmouseover="this.style.background='rgba(60,110,70,0.95)'" onmouseout="this.style.background='rgba(20,60,30,0.85)'" />`;
    html += `</div>`;
    
    // Append the export button to the end properly
    const expBtn = mapPanel.querySelector('button[onclick="exportMap()"]');
    if(expBtn) mapPanel.removeChild(expBtn);
    mapPanel.innerHTML += html;
    if(expBtn) mapPanel.appendChild(expBtn);

    const npcButtons = EDITOR_NPC_TYPES.map((enemy) => {
      const preview = enemy.type === 'spider'
        ? 'animations/spider/Spider_Idle.png'
        : enemy.type === 'sheep'
          ? 'animations/sheep/Sheep_Idle.png'
          : enemy.type === 'troll'
            ? 'animations/troll/Troll_Idle.png'
        : null;
      const previewHtml = preview
        ? `<img src="${preview}" style="width:36px; height:36px; image-rendering:pixelated; object-fit:contain; margin-bottom:4px;" />`
        : '';
      return `<button onclick="setEditTile('npc_${enemy.type}')" style="background:#1d2030; width:100%; height:40px; color:#fff; font-weight:bold; font-size:10px; cursor:pointer; border:1px solid ${enemy.color}; display:flex; flex-direction:row; align-items:center; justify-content:flex-start; gap:8px; padding:0 8px;">${previewHtml}<span>${enemy.label}</span></button>`;
    }).join('');
    npcPanel.innerHTML = `
      <div style="color:#8fd8ff; font-size:10px; margin-bottom:5px;">NPC EDITOR</div>
      <div style="font-size:8px; line-height:1.6; color:#cfefff; max-width:210px;">Place or remove enemies separately from terrain editing.</div>
      <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
        ${npcButtons}
        <button onclick="setEditTile('erase_npc')" style="background:#3a1111; width:100%; height:40px; color:#ff7a7a; font-weight:bold; font-size:10px; cursor:pointer; border:1px solid #ff5555;">REMOVE</button>
      </div>
      <button onclick="exportMap()" style="background:#777; width:100px; height:30px; margin-top:14px; color:white; font-size:9px; cursor:pointer;">EXPORT JS</button>
    `;
    window.setEditorSection(window.editorSection || 'map');
  }

  let _isMouseDown = false;
  document.addEventListener('mouseup', () => { _isMouseDown = false; });

  document.addEventListener('dblclick', e => {
    if (!window.isEditMode || gameMode !== 'adventure') return;
    if (!pointInsideCanvas(e) || overlayBlocksCanvasInput()) return;
    const { x, y } = canvasCoords(e);
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    if (window._paintCurrentTile) window._paintCurrentTile(gy, gx);
  });

  document.addEventListener('mousemove', e => {
    if (!pointInsideCanvas(e) || overlayBlocksCanvasInput()) { hoverGx = -1; hoverGy = -1; return; }
    const { x, y } = canvasCoords(e);
    hoverGx = Math.floor(x / CELL);
    hoverGy = Math.floor(y / CELL);
    window._paintCurrentTile = (gy, gx) => {
      if (S.dungeon && gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) {
        if (typeof window.editTileType === 'number') {
            S.dungeon[gy][gx] = window.editTileType;
        } else if (typeof window.editTileType === 'string') {
            if (window.editTileType.startsWith('npc_')) {
                placeEditorEnemy(window.editTileType.slice(4), gx, gy);
                return;
            } else if (window.editTileType === 'erase_npc') {
                removeEditorEnemyAt(gx, gy);
                return;
            }
            if (!S.decorations) S.decorations = {};
            if (window.editTileType.startsWith('elevgroup_') || window.editTileType.startsWith('flatgroup_') || window.editTileType.startsWith('tileset1group_') || window.editTileType.startsWith('tileset3group_') || window.editTileType.startsWith('bridgegroup_')) {
                const parts = window.editTileType.split('_');
                const pType = parts[0].replace('group', '');
                const pTx = parseInt(parts[1], 10), pTy = parseInt(parts[2], 10);
                const pW = parseInt(parts[3], 10), pH = parseInt(parts[4], 10);
                for (let dy=0; dy<pH; dy++) {
                   for (let dx=0; dx<pW; dx++) {
                      if (gy+dy < ROWS && gx+dx < COLS) {
                          S.decorations[`${gy+dy},${gx+dx}`] = `${pType}_${pTx+dx}_${pTy+dy}`;
                      }
                   }
                }
            } else if (window.editTileType === 'erase_prop') {
                delete S.decorations[`${gy},${gx}`];
            } else if (window.editTileType === 'box') {
                if (!S.collisionBoxes) S.collisionBoxes = new Set();
                S.collisionBoxes.add(`${gy},${gx}`);
            } else if (window.editTileType === 'erase_all') {
                // Universal erase: reset dungeon tile to water (0), remove decoration AND box
                S.dungeon[gy][gx] = 0;
                delete S.decorations[`${gy},${gx}`];
                if (S.collisionBoxes) S.collisionBoxes.delete(`${gy},${gx}`);
                removeEditorEnemyAt(gx, gy);
            } else {
                S.decorations[`${gy},${gx}`] = window.editTileType;
            }
        }
      }
    };

    // edit mode: no drag-painting, only dblclick places tiles
    if (window.isEditMode && gameMode === 'adventure') return;
    updateP1Aim(x, y);
  }, true);

  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    _isMouseDown = true;
    if (!pointInsideCanvas(e) || overlayBlocksCanvasInput()) return;
    lastCanvasPointerDownAt = performance.now();
    
    const { x, y } = canvasCoords(e);
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);

    if (window.isEditMode && gameMode === 'adventure') {
      // single click does nothing in edit mode — use double-click
      return;
    }

    SFX.init();
    const clicked = S.units.find(u => u.team === 0 && u.alive && u.x === gx && u.y === gy);
    if (clicked) {
      SFX.select();
      S.selectedId[0] = clicked.id;
      updateP1Aim(x, y);
      return;
    }
    if (gameMode === 'adventure' && !S.cracking && S.loot) {
      const box = S.loot.find(l => !l.collected && l.type === 'lockedBox' && l.x === gx && l.y === gy);
      if (box) {
        if (!box.activated) {
          box.activated = true;
          // Clear first-time hint
          if (S.boxHint) { S.boxHint = null; }
          if (!Profile.seenBoxHint) { Profile.seenBoxHint = true; saveProfile(); }
        } else {
          box.collected = true;
          spawnDeath(box.x, box.y, '#ff8800');
          startBoxCrack(box.prize, box.x, box.y);
        }
        return;
      }
    }
    if (S.phase !== 'frozen') return;
    if (S.heroShootLock && gameMode === 'adventure') return;
    if (S.clockSide !== 0) return;
    const sel = S.units.find(u => u.id === S.selectedId[0] && u.alive);
    if (!sel || S.pending[0] !== null) return;
    const wepC = getCurrentWeapon(sel);
    if (gameMode === 'adventure') {
      let nrgReq = 0;
      if (wepC === 'bullet') nrgReq = 1;
      if (wepC === 'laser') nrgReq = 2;
      if (wepC === 'heavy' || wepC === 'shotgun') nrgReq = 3;
      if (S.energy < nrgReq) return;
    } else {
      if (wepC === 'bullet' && sel.ammo <= 0) return;
      if (wepC === 'laser' && sel.laserAmmo <= 0) return;
      if (wepC === 'heavy' && sel.heavyAmmo <= 0) return;
      if (wepC === 'shotgun' && sel.shotgunAmmo <= 0) return;
    }
    if (wepC === 'bullet' && gameMode === 'adventure') {
      const _tooClose = S.units.some(u => {
        if (!u.alive || u.team === 0) return false;
        return Math.abs(u.x - sel.x) + Math.abs(u.y - sel.y) === 1;
      });
      if (_tooClose) {
        spawnDmgNumber(sel.x, sel.y, 'TOO CLOSE', '#ff4444', 13, 'miss');
        SFX.play(120, 0.12, 0.08, 'square');
        S.shake = Math.max(S.shake || 0, 3);
        return;
      }
    }
    updateP1Aim(x, y);
    S.pending[0] = { unitId: sel.id, t: 'shoot' };
    setActionBadge(0, S.pending[0]);
    if (gameMode === 'adventure') {
      aiQueueAction(false);
      resolveTick();
    } else if (gameMode === 'pve') {
      resolveTick();
    } else {
      if (!tickTimer) tickTimer = setTimeout(resolveTick, TICK_WINDOW);
    }
  }, true);

  canvasInputEl.addEventListener('mousemove', e => {
    if (overlayBlocksCanvasInput()) return;
    const { x, y } = canvasCoords(e);
    updateP1Aim(x, y);
  });

  canvasInputEl.addEventListener('click', e => {
    if (performance.now() - lastCanvasPointerDownAt < 250) return;
    if (overlayBlocksCanvasInput()) return;
    SFX.init();
    const { x, y } = canvasCoords(e);
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    // Click on a P1 unit â†' select it
    const clicked = S.units.find(u => u.team === 0 && u.alive && u.x === gx && u.y === gy);
    if (clicked) {
      SFX.select();
      S.selectedId[0] = clicked.id;
      updateP1Aim(x, y);
      return;
    }
    // Click elsewhere → shoot with selected unit
    if (S.phase !== 'frozen') return;
    if (S.heroShootLock && gameMode === 'adventure') return;
    if (S.clockSide !== 0) return;
    const sel = S.units.find(u => u.id === S.selectedId[0] && u.alive);
    if (!sel || S.pending[0] !== null) return;
    const wepC = getCurrentWeapon(sel);
    if (gameMode === 'adventure') {
      let nrgReq = 0;
      if (wepC === 'bullet') nrgReq = 1;
      if (wepC === 'laser') nrgReq = 2;
      if (wepC === 'heavy' || wepC === 'shotgun') nrgReq = 3;
      if (S.energy < nrgReq) return;
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

  // â"€â"€ Touch support â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  canvas.addEventListener('touchstart', e => {
    if (gameMode !== 'adventure') return;
    e.preventDefault();
    SFX.init();
    const t = e.touches[0];
    const { x, y } = canvasCoords({ clientX: t.clientX, clientY: t.clientY });
    updateP1Aim(x, y);
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (gameMode !== 'adventure') return;
    e.preventDefault();
    const t = e.touches[0];
    const { x, y } = canvasCoords({ clientX: t.clientX, clientY: t.clientY });
    updateP1Aim(x, y);
  }, { passive: false });

  let _mobLastTap = 0, _mobLastTapX = 0, _mobLastTapY = 0;
  canvas.addEventListener('touchend', e => {
    if (gameMode !== 'adventure') return;
    e.preventDefault();
    const t = e.changedTouches[0];
    const { x: cx, y: cy } = canvasCoords({ clientX: t.clientX, clientY: t.clientY });
    const now = performance.now();

    // Double-tap anywhere → shoot
    const dt = now - _mobLastTap;
    const dd = Math.hypot(cx - _mobLastTapX, cy - _mobLastTapY);
    if (dt < 340 && dd < CELL * 3.5) {
      _mobLastTap = 0;
      if (S.phase === 'frozen' && S.clockSide === 0 && S.pending[0] === null) {
        const _sel = S.units.find(u => u.id === S.selectedId[0] && u.alive);
        if (_sel) {
          updateP1Aim(cx, cy);
          S.pending[0] = { unitId: _sel.id, t: 'shoot' };
          setActionBadge(0, S.pending[0]);
          aiQueueAction(false);
          resolveTick();
        }
      }
      return;
    }
    _mobLastTap = now; _mobLastTapX = cx; _mobLastTapY = cy;

    // Arrow zone tap → move
    const hero = S._hero || S.units?.find(u => u.team === 0 && u.alive);
    if (hero && S.cam) {
      const wx = cx + S.cam.x;
      const wy = cy + S.cam.y;
      const hx = (hero.rx + 0.5) * CELL;
      const hy = (hero.ry + 0.5) * CELL;
      const hitR  = CELL * 0.88;
      const dist  = CELL * 1.65;
      const _dirs = [
        { dx:  0, dy: -1, code: 'KeyW' },
        { dx:  0, dy:  1, code: 'KeyS' },
        { dx: -1, dy:  0, code: 'KeyA' },
        { dx:  1, dy:  0, code: 'KeyD' },
      ];
      for (const d of _dirs) {
        if (Math.hypot(wx - (hx + d.dx * dist), wy - (hy + d.dy * dist)) < hitR) {
          document.dispatchEvent(new KeyboardEvent('keydown', { code: d.code, bubbles: true }));
          return;
        }
      }
    }

    // Tap elsewhere → just update aim direction (no fire)
    updateP1Aim(cx, cy);
  }, { passive: false });

  // D-pad: simulate key presses to reuse existing keydown logic
  function mobileDpad(code) {
    document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  }
  document.getElementById('dpad-up')?.addEventListener('touchstart', e => { e.preventDefault(); mobileDpad('KeyW'); }, { passive: false });
  document.getElementById('dpad-down')?.addEventListener('touchstart', e => { e.preventDefault(); mobileDpad('KeyS'); }, { passive: false });
  document.getElementById('dpad-left')?.addEventListener('touchstart', e => { e.preventDefault(); mobileDpad('KeyA'); }, { passive: false });
  document.getElementById('dpad-right')?.addEventListener('touchstart', e => { e.preventDefault(); mobileDpad('KeyD'); }, { passive: false });
  document.getElementById('dpad-shoot')?.addEventListener('touchstart', e => { e.preventDefault(); mobileDpad('Space'); }, { passive: false });

  // Skill bar clicks (P1)
  ['bullet', 'laser', 'heavy', 'shotgun'].forEach((wep, i) => {
    const slot = document.getElementById(`p1-sk-${i}`);
    if (slot) slot.addEventListener('click', () => {
      SFX.init();
      SFX.select();
      const unit = S.units.find(u => u.id === S.selectedId[0] && u.alive);
      if (unit) {
        unit.weapon = wep;
        if (wep === 'bullet') unit.gunSwitchAt = performance.now();
        updateSkillBar(0);
      }
    });
  });

  showScreen('screen-menu');

  // Initialize 3D offscreen renderer
  initThreeJS();
});

// ================================================================
// VISUAL POLISH
// ================================================================

// Hero hit vignette
let _heroHitFlash = 0;

function drawHeroHitVignette() {
  if (_heroHitFlash <= 0.01) { _heroHitFlash = 0; return; }
  _heroHitFlash *= 0.84;
  const W = canvas.width, H = canvas.height;
  const grad = ctx.createRadialGradient(W/2, H/2, H * 0.2, W/2, H/2, H * 0.85);
  grad.addColorStop(0, 'rgba(180,0,0,0)');
  grad.addColorStop(1, `rgba(200,0,0,${(_heroHitFlash * 0.72).toFixed(3)})`);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Ambient dungeon dust
const _dust = [];
const _DUST_MAX = 35;

function drawAmbientDust() {
  if (!S || !S.fog || !S.cam) return;
  const now = performance.now();

  // Spawn new dust in visible area
  if (_dust.length < _DUST_MAX && Math.random() < 0.18) {
    const vx = (S.cam.x / CELL) | 0, vy = (S.cam.y / CELL) | 0;
    const vw = Math.ceil(canvas.width / CELL) + 2, vh = Math.ceil(canvas.height / CELL) + 2;
    for (let attempt = 0; attempt < 6; attempt++) {
      const gx = vx + (Math.random() * vw) | 0;
      const gy = vy + (Math.random() * vh) | 0;
      if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue;
      if (!S.fog[gy]?.[gx] || isWall(gx, gy)) continue;
      _dust.push({
        x: (gx + Math.random()) * CELL,
        y: (gy + Math.random()) * CELL,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.05 - Math.random() * 0.08,
        life: 1,
        decay: 0.003 + Math.random() * 0.003,
        r: 0.8 + Math.random() * 1.2,
      });
      break;
    }
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let i = _dust.length - 1; i >= 0; i--) {
    const d = _dust[i];
    d.x += d.vx; d.y += d.vy;
    d.life -= d.decay;
    if (d.life <= 0) { _dust.splice(i, 1); continue; }
    const alpha = d.life * 0.22;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#c8b89a';
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ================================================================
// HERO AI AGENT — Claude Haiku autonomous hero controller
// ================================================================

const _agent = {
  enabled: false,
  thinking: false,
  localKey: localStorage.getItem('_agentKey') || '',
  speed: 500,
};

window._agentToggle = function() {
  _agent.enabled = !_agent.enabled;
  const btn = document.getElementById('agent-btn');
  const panel = document.getElementById('agent-panel');
  if (btn) {
    btn.textContent = _agent.enabled ? 'AI: ON' : 'AI: OFF';
    btn.style.background = _agent.enabled ? '#00e87a' : '#1a1a2e';
    btn.style.color = _agent.enabled ? '#000' : '#556';
    btn.style.borderColor = _agent.enabled ? '#00e87a' : '#334';
  }
  if (panel) panel.classList.toggle('agent-active', _agent.enabled);
  if (_agent.enabled) _agentLog('Agent online. Observing...', '#0f8');
};

window._agentSaveKey = function() {
  const inp = document.getElementById('agent-key-input');
  if (!inp) return;
  _agent.localKey = inp.value.trim();
  localStorage.setItem('_agentKey', _agent.localKey);
  _agentLog('Key saved — using direct API', '#0f8');
};

// populate key input on load
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('agent-key-input');
  if (inp && _agent.localKey) inp.value = _agent.localKey;
  // show dev key row only if no proxy configured yet (check on toggle)
});

function _agentLog(msg, color) {
  const el = document.getElementById('agent-log');
  if (!el) return;
  const line = document.createElement('div');
  line.style.color = color || '#4df';
  line.textContent = msg;
  el.insertBefore(line, el.firstChild);
  while (el.children.length > 8) el.removeChild(el.lastChild);
}

function _agentStatus(msg, color) {
  const el = document.getElementById('agent-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || '#aaa';
}

function heroAgentNotify() {
  if (!_agent.enabled || _agent.thinking) return;
  if (!S || S.phase !== 'frozen' || S.pendingGameover) return;
  if (gameMode !== 'adventure') return;
  setTimeout(heroAgentDecide, _agent.speed);
}

async function heroAgentDecide() {
  if (!_agent.enabled || _agent.thinking) return;
  if (!S || S.phase !== 'frozen' || S.pendingGameover || S.pending[0]) return;
  if (gameMode !== 'adventure') return;

  const hero = S.units.find(u => u.team === 0 && u.alive);
  if (!hero) return;

  _agent.thinking = true;
  _agentStatus('thinking...', '#ff0');

  const stateJson = _agentBuildState(hero);

  try {
    const action = await _agentCallClaude(stateJson);
    if (action && S && S.phase === 'frozen' && !S.pending[0]) {
      _agentExecute(action, hero);
    }
  } catch (e) {
    _agentLog('ERR: ' + e.message.slice(0, 60), '#f44');
    _agentStatus('error', '#f44');
  }

  _agent.thinking = false;
  _agentStatus('idle', '#0f8');
}

function _agentBuildState(hero) {
  const R = 7;
  const mapLines = [];
  for (let ry = -R; ry <= R; ry++) {
    let row = '';
    for (let rx = -R; rx <= R; rx++) {
      const wx = hero.x + rx, wy = hero.y + ry;
      if (rx === 0 && ry === 0) { row += 'H'; continue; }
      if (wx < 0 || wx >= COLS || wy < 0 || wy >= ROWS) { row += '#'; continue; }
      if (!S.fog || !S.fog[wy] || !S.fog[wy][wx]) { row += '?'; continue; }
      if (isWall(wx, wy)) { row += '#'; continue; }
      const en = S.units.find(u => u.alive && u.team !== 0 && u.x === wx && u.y === wy);
      if (en) { row += (en.utype || 'e')[0]; continue; }
      row += '.';
    }
    mapLines.push(row);
  }

  const enemies = S.units
    .filter(u => u.alive && u.team !== 0 && S.fog && S.fog[u.y]?.[u.x])
    .map(u => ({
      t: u.utype || '?',
      dx: u.x - hero.x,
      dy: u.y - hero.y,
      dist: Math.abs(u.x - hero.x) + Math.abs(u.y - hero.y),
      hp: u.hp
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 6);

  const adjacentEnemy = enemies.some(e => e.dist === 1);
  const weapon = getCurrentWeapon(hero);

  // find nearest unexplored fog direction
  let fogDir = null;
  const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
  for (const d of dirs) {
    for (let s = 1; s <= 6; s++) {
      const fx = hero.x + d.dx * s, fy = hero.y + d.dy * s;
      if (fx < 0 || fx >= COLS || fy < 0 || fy >= ROWS || isWall(fx, fy)) break;
      if (S.fog && !S.fog[fy][fx]) { fogDir = d; break; }
    }
    if (fogDir) break;
  }

  return JSON.stringify({
    map: mapLines.join('\n'),
    hero: { hp: hero.hp, maxHp: hero.maxHp, energy: S.energy, weapon },
    enemies,
    adjacentEnemy,
    fogDir,
  });
}

const _AGENT_SYSTEM = `You control the hero (H) in a pixel dungeon game. Each turn pick one action.
Map: H=you, .=floor, #=wall, ?=unexplored, letter=enemy first char (s=spider, sh=shaman, t=troll, i=idol, b=bird...).
ACTIONS (respond with ONLY JSON, no markdown):
  {"action":"move","dx":1,"dy":0,"thought":"reason"}   — move 1 step (costs 1 energy)
  {"action":"shoot","dx":1,"dy":0,"thought":"reason"}  — shoot that direction (costs 2 energy, range 5)
dx/dy: 1=right/down, -1=left/up, 0=no change. Diagonal ok.
RULES:
- Cannot shoot if adjacentEnemy=true (enemy directly next to you).
- Shooting at empty space is wasted energy.
- Explore ?=fog to find more rooms and enemies.
- Kill enemies for energy. Retreat if hp low.
- fogDir hints toward nearest unexplored area.
One JSON object only. No extra text.`;

async function _agentCallClaude(stateJson) {
  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: _AGENT_SYSTEM,
    messages: [{ role: 'user', content: stateJson }]
  });

  // Try server proxy first
  let resp = await fetch('/.netlify/functions/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload
  });

  // Fallback: proxy not available → use direct API with local key
  if (!resp.ok) {
    const row = document.getElementById('agent-key-row');
    if (!_agent.localKey) {
      if (row) row.style.display = 'flex';
      throw new Error('Enter API key above');
    }
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': _agent.localKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: payload
    });
    if (!resp.ok) {
      // Show key row so user can re-enter key
      if (row) row.style.display = 'flex';
      const errData = await resp.json().catch(() => ({}));
      const msg = errData?.error?.message || resp.status;
      throw new Error(msg);
    }
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error('bad response: ' + text.slice(0, 40));

  const action = JSON.parse(match[0]);
  const thought = action.thought || '...';
  const desc = action.action + (action.dx !== undefined ? `(${action.dx},${action.dy})` : '');
  _agentLog(`${desc} — ${thought}`, '#4df');
  return action;
}

function _agentExecute(action, hero) {
  if (!S || S.phase !== 'frozen' || S.pending[0]) return;

  if (action.action === 'move') {
    let dx = Math.round(action.dx || 0);
    let dy = Math.round(action.dy || 0);
    // clamp to -1..1
    dx = Math.max(-1, Math.min(1, dx));
    dy = Math.max(-1, Math.min(1, dy));
    if (dx === 0 && dy === 0) dx = 1; // fallback
    S.pending[0] = { unitId: hero.id, t: 'move', dx, dy };
    setActionBadge(0, S.pending[0]);
    aiQueueAction(false);
    resolveTick();

  } else if (action.action === 'shoot') {
    let dx = Math.round(action.dx || 0);
    let dy = Math.round(action.dy || 0);
    dx = Math.max(-1, Math.min(1, dx));
    dy = Math.max(-1, Math.min(1, dy));
    if (dx === 0 && dy === 0) dx = hero.facing?.dx || 1;
    // Set aim directly on hero
    hero.aimDir = { dx, dy };
    hero.facing = { dx, dy };
    S.pending[0] = { unitId: hero.id, t: 'shoot' };
    setActionBadge(0, S.pending[0]);
    aiQueueAction(false);
    resolveTick();

  } else {
    // "wait" or unknown — move in facing direction (blocked = no-op, tick still advances)
    const dx = hero.facing?.dx || 1;
    const dy = hero.facing?.dy || 0;
    S.pending[0] = { unitId: hero.id, t: 'move', dx, dy };
    setActionBadge(0, S.pending[0]);
    aiQueueAction(false);
    resolveTick();
  }
}

// ================================================================
// FLOOR INTRO ANIMATION — circle reveal + floor title
// Black overlay with expanding torch-light circle, then FLOOR X text
// ================================================================

// ---- Menu Ronke idle + Heal Effect animation ----
(function() {
  const cv = document.getElementById('menu-ronke-canvas');
  if (!cv) return;
  const ctx2 = cv.getContext('2d');
  const ronkeImg = new Image(); ronkeImg.src = 'assets/ronkelvl3.png';
  const healImg  = new Image(); healImg.src  = 'assets/heal_effect.png';
  const R_FRAMES = 8, R_FPS = 6;
  const H_FRAMES = 11, H_FPS = 12;
  let healStart = null;
  setInterval(() => { healStart = performance.now(); }, 5000);

  function tick(t) {
    requestAnimationFrame(tick);
    if (!ronkeImg.complete || !ronkeImg.naturalWidth) return;

    // Ronke
    const fw = ronkeImg.naturalWidth / R_FRAMES, fh = ronkeImg.naturalHeight;
    const scale = cv.height / fh;
    const dw = fw * scale, dh = cv.height;
    const rx = (cv.width - dw) / 2;
    const rframe = Math.floor(t / (1000 / R_FPS)) % R_FRAMES;
    ctx2.clearRect(0, 0, cv.width, cv.height);
    ctx2.drawImage(ronkeImg, rframe * fw, 0, fw, fh, rx, 0, dw, dh);

    // Heal effect — drawn on top, centered, at feet level
    if (healStart !== null && healImg.complete && healImg.naturalWidth) {
      const elapsed = t - healStart;
      const hfw = healImg.naturalWidth / H_FRAMES, hfh = healImg.naturalHeight;
      const hframe = Math.floor(elapsed / (1000 / H_FPS));
      if (hframe < H_FRAMES) {
        const hs = (cv.width * 1.7) / hfw;
        const hdw = hfw * hs, hdh = hfh * hs;
        const hx = (cv.width - hdw) / 2;
        const hy = cv.height - hdh * 0.5 - 45;
        ctx2.drawImage(healImg, hframe * hfw, 0, hfw, hfh, hx, hy, hdw, hdh);
      } else {
        healStart = null;
      }
    }
  }
  requestAnimationFrame(tick);
})();

// Menu skull animation (patrol: every 10s moves 150px right then returns; guard: every 4s)
(function() {
  const cv = document.getElementById('menu-skull-canvas');
  if (!cv) return;
  const ctx2 = cv.getContext('2d');
  const idleImg  = new Image(); idleImg.src  = 'assets_tiny/Skull_Idle.png';
  const runImg   = new Image(); runImg.src   = 'assets_tiny/Skull_Run.png';
  const guardImg = new Image(); guardImg.src = 'assets_tiny/Skull_Guard.png';
  const IDLE_FRAMES  = 8, IDLE_FPS  = 6;
  const RUN_FRAMES   = 6, RUN_FPS   = 8;
  const GUARD_FRAMES = 7, GUARD_FPS = 8;
  const BASE_LEFT = 940, PATROL_DIST = 150, PATROL_SPEED = 80;
  let state = 'idle', offsetX = 0, stateStart = null, facingRight = false;

  // Patrol every 10s
  setInterval(() => {
    if (state === 'idle') { state = 'going'; stateStart = null; facingRight = true; }
  }, 10000);

  // Guard every 4s (only when idle)
  setInterval(() => {
    if (state === 'idle') { state = 'guarding'; stateStart = null; }
  }, 4000);

  function drawFrame(t) {
    let img, frames, fps;
    if (state === 'guarding') { img = guardImg; frames = GUARD_FRAMES; fps = GUARD_FPS; }
    else if (state === 'going' || state === 'returning') { img = runImg; frames = RUN_FRAMES; fps = RUN_FPS; }
    else { img = idleImg; frames = IDLE_FRAMES; fps = IDLE_FPS; }
    if (!img.complete || !img.naturalWidth) return;
    const fw = img.naturalWidth / frames, fh = img.naturalHeight;
    const scale = cv.height / fh;
    const dw = fw * scale, dh = cv.height;
    const sx = (cv.width - dw) / 2;
    const frame = Math.floor(t / (1000 / fps)) % frames;
    ctx2.clearRect(0, 0, cv.width, cv.height);
    ctx2.save();
    if (facingRight) {
      ctx2.drawImage(img, frame * fw, 0, fw, fh, sx, 0, dw, dh);
    } else {
      ctx2.translate(cv.width, 0); ctx2.scale(-1, 1);
      ctx2.drawImage(img, frame * fw, 0, fw, fh, sx, 0, dw, dh);
    }
    ctx2.restore();
  }

  function tick(t) {
    requestAnimationFrame(tick);
    if (stateStart === null && state !== 'idle') stateStart = t;

    if (state === 'guarding') {
      const elapsed = t - stateStart;
      if (elapsed >= (GUARD_FRAMES / GUARD_FPS) * 1000) {
        state = 'idle'; stateStart = null;
      }
    } else if (state === 'going' || state === 'returning') {
      const moved = ((t - stateStart) / 1000) * PATROL_SPEED;
      if (state === 'going') {
        offsetX = Math.min(moved, PATROL_DIST);
        if (offsetX >= PATROL_DIST) { state = 'returning'; stateStart = t; facingRight = false; }
      } else {
        offsetX = PATROL_DIST - Math.min(moved, PATROL_DIST);
        if (offsetX <= 0) { offsetX = 0; state = 'idle'; stateStart = null; facingRight = false; }
      }
      cv.style.left = (BASE_LEFT + offsetX) + 'px';
    }
    drawFrame(t);
  }
  requestAnimationFrame(tick);
})();

// Landing page: bag → coin → +1 $RONKE pickup
(function() {
  const cv = document.getElementById('menu-goldbag');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const bagImg   = new Image(); bagImg.src   = 'assets/goldbag_g_idle.png';
  const spawnImg = new Image(); spawnImg.src = 'assets/goldbag_spawn.png';
  const coinImg  = new Image(); coinImg.src  = 'assets_tiny/$ronke2.png';
  const COIN_FRAMES  = 8, COIN_FW  = 640, COIN_FH  = 640, COIN_FPS  = 8;
  const SPAWN_FRAMES = 7, SPAWN_FW = 128, SPAWN_FH = 128, SPAWN_FPS = 10;
  // states: 'spawning' | 'bag' | 'coin' | 'gone'
  let state = 'spawning', spawnStart = null;

  function tick(t) {
    requestAnimationFrame(tick);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (state === 'spawning') {
      if (!spawnImg.complete || !spawnImg.naturalWidth) return;
      if (spawnStart === null) spawnStart = t;
      const frame = Math.floor((t - spawnStart) / (1000 / SPAWN_FPS));
      if (frame >= SPAWN_FRAMES) { state = 'bag'; spawnStart = null; return; }
      ctx.drawImage(spawnImg, frame * SPAWN_FW, 0, SPAWN_FW, SPAWN_FH, 0, 0, cv.width, cv.height);
    } else if (state === 'bag' && bagImg.complete && bagImg.naturalWidth) {
      ctx.drawImage(bagImg, 0, 0, cv.width, cv.height);
    } else if (state === 'coin' && coinImg.complete && coinImg.naturalWidth) {
      const frame = Math.floor(t / (1000 / COIN_FPS)) % COIN_FRAMES;
      const cs = Math.round(cv.width * 0.43);
      const co = Math.round((cv.width - cs) / 2);
      ctx.drawImage(coinImg, frame * COIN_FW, 0, COIN_FW, COIN_FH, co, co, cs, cs);
    }
  }
  requestAnimationFrame(tick);

  // Hover
  cv.addEventListener('mouseenter', () => {
    if (state === 'gone' || state === 'spawning') return;
    cv.style.filter = state === 'bag'
      ? 'drop-shadow(0 0 22px #ffe066) drop-shadow(0 0 8px #fff)'
      : 'drop-shadow(0 0 22px #66ccff) drop-shadow(0 0 8px #fff)';
    cv.style.transform = 'translateX(-50%) scale(1.1)';
  });
  cv.addEventListener('mouseleave', () => {
    cv.style.filter = 'drop-shadow(0 0 10px #ffcc00)';
    cv.style.transform = 'translateX(-50%) scale(1)';
  });

  cv.addEventListener('click', function(e) {
    if (state === 'bag') {
      state = 'coin';
      cv.style.filter = 'drop-shadow(0 0 14px #66ccff)';
    } else if (state === 'coin') {
      state = 'gone';
      cv.style.opacity = '0';
      cv.style.transition = 'opacity 0.2s';
      cv.style.filter = 'drop-shadow(0 0 10px #ffcc00)';
      cv.style.transform = 'translateX(-50%) scale(1)';

      const txt = document.createElement('div');
      txt.className = 'ronke-pickup-text';
      txt.textContent = '+1 $RONKE';
      txt.style.left = (e.clientX - 55) + 'px';
      txt.style.top  = (e.clientY - 20) + 'px';
      document.body.appendChild(txt);
      setTimeout(() => txt.remove(), 1300);

      // Respawn with spawn animation after 5s
      setTimeout(() => {
        state = 'spawning';
        spawnStart = null;
        cv.style.opacity = '1';
      }, 5000);
    }
  });
})();

let _floorIntro = null;

function triggerFloorIntro(floor) {
  _floorIntro = { startT: performance.now(), floor };
  // Deep dungeon rumble sound
  SFX.play(80, 0.18, 0.28, 'sawtooth', 320);
  setTimeout(() => SFX.play(220, 0.10, 0.16, 'sine', 280), 280);
}

function drawFloorIntro() {
  if (!_floorIntro) return;
  const now = performance.now();
  const el = now - _floorIntro.startT;

  const REVEAL_DUR = 820;  // black parts slide away
  const TEXT_IN    = 150;  // text fade-in start
  const TEXT_HOLD  = 900;  // text fully visible until
  const TEXT_OUT   = 1300; // text fully gone
  const TOTAL      = 1500;

  if (el > TOTAL) { _floorIntro = null; return; }

  const cw = advCanvasW || BOARD_W;
  const ch = ADV_CANVAS_H || BOARD_H;

  ctx.save();

  // ---- Stone door split: two halves slide left/right ----
  const t = Math.min(1, el / REVEAL_DUR);
  const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
  const slide = ease * (cw / 2 + 8); // each half slides this many px outward

  // Left stone slab
  ctx.fillStyle = '#0a0704';
  ctx.fillRect(-slide, 0, cw / 2, ch);
  // Right stone slab
  ctx.fillRect(cw / 2 + slide, 0, cw / 2, ch);

  // Stone texture lines on each slab
  ctx.strokeStyle = 'rgba(60,40,10,0.5)';
  ctx.lineWidth = 1;
  for (let y = 0; y < ch; y += 18) {
    // left slab
    ctx.beginPath(); ctx.moveTo(-slide, y); ctx.lineTo(cw / 2 - slide, y); ctx.stroke();
    // right slab
    ctx.beginPath(); ctx.moveTo(cw / 2 + slide, y); ctx.lineTo(cw + slide, y); ctx.stroke();
  }

  // Amber torch-glow at the seam as doors open
  if (ease > 0.05 && ease < 0.95) {
    const seamX = cw / 2;
    const glowAlpha = Math.sin(ease * Math.PI) * 0.55;
    const glowR = 80 + ease * 60;
    const grd = ctx.createRadialGradient(seamX, ch / 2, 0, seamX, ch / 2, glowR);
    grd.addColorStop(0, `rgba(220,140,20,${glowAlpha})`);
    grd.addColorStop(1, 'transparent');
    ctx.globalAlpha = 1;
    ctx.fillStyle = grd;
    ctx.fillRect(seamX - glowR, ch / 2 - glowR, glowR * 2, glowR * 2);
  }

  // ---- FLOOR X text ----
  const textAlpha =
    el < TEXT_IN   ? 0 :
    el < TEXT_IN + 120 ? (el - TEXT_IN) / 120 :
    el < TEXT_HOLD ? 1 :
    el < TEXT_OUT  ? 1 - (el - TEXT_HOLD) / (TEXT_OUT - TEXT_HOLD) : 0;

  if (textAlpha > 0.01) {
    ctx.globalAlpha = textAlpha;
    const lbl = `FLOOR  ${_floorIntro.floor}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Drop shadow
    ctx.font = 'bold 28px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 0;
    ctx.fillText(lbl, cw / 2 + 3, ch / 2 + 3);

    // Main text — amber gold
    ctx.fillStyle = '#d4a843';
    ctx.shadowColor = '#ffcc44';
    ctx.shadowBlur = 22;
    ctx.fillText(lbl, cw / 2, ch / 2);

    // Subtitle
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = '#8a6830';
    ctx.shadowBlur = 6;
    const sub = _floorIntro.floor === 1 ? 'ENTER THE DUNGEON' : 'DESCEND DEEPER';
    ctx.fillText(sub, cw / 2, ch / 2 + 30);
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.restore();
}
