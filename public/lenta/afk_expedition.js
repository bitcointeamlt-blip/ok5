/* afk_expedition.js — AFK Expedition animated scene (prototype, dev WIP).
   TOP-DOWN march: your NFT squad walks in a diagonal formation up through a
   grass map; the world scrolls past; they halt to fight enemies; you watch the
   progress. Choice popups pause the scene. Real game sprites (assets_tiny).
   Self-contained overlay + own canvas + fixed-timestep loop (independent of the
   game's main loop). Wired to F10 mine → BATTLE TEST → AFK Expedition. ~F8.

   Built per researched best-practices: fixed-timestep accumulator loop w/ clamp
   (Gaffer "Fix Your Timestep"), ms-accumulator sprite timing via a scene clock,
   FSM-ish unit states (walk/idle/attack), trauma-based screen shake + hit-stop
   (Vlambeer/Eiserloh game-feel), crisp pixel render (imageSmoothingEnabled=false
   + devicePixelRatio + integer coords). Next: server timeline + contract. */
(function () {
  'use strict';
  var W = window, D = document;
  var overlay = null, cv = null, ctx = null, raf = 0, running = false, last = 0, S = null;
  var DPR = 1, Wlog = 0, Hlog = 0, accum = 0, DT = 1 / 60;
  var ATK_DUR = 0.42;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ── sprite sheets (loaded directly — same assets as the game) ──
  var _sheets = {};
  function sheet(p, fc, ms) { if (!_sheets[p]) { var im = new Image(); im.src = p; _sheets[p] = im; } return { img: _sheets[p], fc: fc, ms: ms || 100 }; }
  function setOf(d) { return { idle: sheet(d.i[0], d.i[1], d.i[2]), walk: sheet(d.w[0], d.w[1], d.w[2]), atk: sheet(d.a[0], d.a[1], d.a[2]) }; }
  function img(p) { if (!_sheets[p]) { var im = new Image(); im.src = p; _sheets[p] = im; } return _sheets[p]; }
  // real map sprites (same as the game): grass tilemap atlas + animated Tiny-Swords trees
  var GRASS = img('grass_tilemap.png');
  var TREES = ['assets_tiny/trees/Azuolas.png', 'assets_tiny/trees/Tree1.png', 'assets_tiny/trees/Tree2.png', 'assets_tiny/trees/Tree4.png', 'assets_tiny/trees/Tree3.png'].map(img);
  // PvP map decoration sprites (F9): GoldStone "boulders" (6f) + Bushe bushes (8f) — same as PVP_DECO
  var BOULDERS = ['assets_tiny/GoldStone2_Highlight.png', 'assets_tiny/GoldStone3_Highlight.png', 'assets_tiny/GoldStone4_Highlight.png', 'assets_tiny/GoldStone5_Highlight.png'].map(img);
  var BUSHES = ['assets_tiny/Terrain/Bushe1.png', 'assets_tiny/Terrain/Bushe2.png', 'assets_tiny/Terrain/Bushe3.png', 'assets_tiny/Terrain/Bushe4.png'].map(img);
  // F9 projectile sprites (same assets/crops as the real PvP scene)
  var ARROW = img('assets_tiny/Archer_Arrow_Sheet.png');   // 64×128: top 64×64=flight, bottom 64×64=stuck
  var HARPOON = img('assets_tiny/Harpoon.png');             // 64×64
  var RED_ARROW = img('assets_tiny/RedArcher_Arrow.png');   // 64×64
  var IMPACT = img('assets_tiny/Arrow_Impact.png');         // 1728×192 = 9 frames × 192
  var SHOT_SPEED = 10.5 * 54;   // px/s — EXACT F9 (_F9_SHOT_SPEED_CPS=10.5 cells/s × CELL 54)
  function animProp(im, frames, ms, x, y, s, scale) {
    if (!im || !im.complete || !im.naturalWidth) return false;
    var fw = im.naturalWidth / frames, fh = im.naturalHeight;
    var idx = Math.floor((S.clock + x * 7) / ms) % frames;
    var dw = fw * scale * s, dh = fh * scale * s;
    ctx.drawImage(im, idx * fw, 0, fw, fh, Math.round(x - dw / 2), Math.round(y - dh + 8), Math.round(dw), Math.round(dh));
    return true;
  }
  // Per-NFT-type sprite + combat config — keyed by the game's F9 utype names (BarracksNFT _F9_NFT_TYPE_MAP).
  // smul = F9 _F9_UTYPE_SPEED (speed mult ×0.86 base ×CELL). ranged units fire projectiles, melee strike on contact.
  // size = NORMALIZED so the actual character is the SAME on-screen height for every type (≈28px content),
  // since each sheet's character fills a different fraction of its frame (measured: skull .38, archer .458,
  // harpoon .411, ronhood .875, pigronke .666, ghost .789). size = 28 / frac → uniform like F9.
  var UNIT_SPRITE_MAP = {
    skull:        { i: ['assets_tiny/Skull_Idle.png', 8, 135],       w: ['assets_tiny/Skull_Run.png', 6, 92],        a: ['assets_tiny/Skull_Attack.png', 7, 58],        ranged: false, smul: 0.86, size: 74 },
    archer:       { i: ['assets_tiny/Archer_Idle.png', 6, 145],      w: ['assets_tiny/Archer_Run.png', 4, 110],      a: ['assets_tiny/Archer_Shoot.png', 8, 70],        ranged: true,  smul: 1.00, size: 61, shot: 'arrow' },
    harpoon_fish: { i: ['assets_tiny/HarpoonFish_Idle.png', 8, 130], w: ['assets_tiny/HarpoonFish_Run.png', 6, 110], a: ['assets_tiny/HarpoonFish_Throw.png', 8, 70],   ranged: true,  smul: 0.79, size: 68, shot: 'harpoon' },
    ronhood:      { i: ['ronhood_idle.png', 8, 130],                 w: ['ronhood_walk.png', 8, 105],                a: ['ronhood_attack.png', 8, 70],                  ranged: true,  smul: 1.00, size: 32, shot: 'arrow' },
    pigronke:     { i: ['pigronke.png', 8, 135],                     w: ['pigronkewalk.png', 8, 100],                a: ['ronkepigattack.png', 8, 70],                  ranged: false, smul: 0.93, size: 48 },
    ghost:        { i: ['assets_tiny/trees/Vaiduoklisindle.png', 12, 120], w: ['assets_tiny/trees/Vaiduoklis.png', 8, 110], a: ['assets_tiny/trees/VaiduoklisAttack.png', 12, 55], ranged: true, smul: 1.05, size: 36, shot: 'arrow' },
    // shaman has no single-row strip (directional folders only) → reuse archer visuals as a stand-in (rare legacy type)
    shaman:       { i: ['assets_tiny/Archer_Idle.png', 6, 145],      w: ['assets_tiny/Archer_Run.png', 4, 110],      a: ['assets_tiny/Archer_Shoot.png', 8, 70],        ranged: true,  smul: 0.72, size: 61, shot: 'arrow' }
  };
  var UNIT_LABEL = { skull: 'Skull', archer: 'Archer', harpoon_fish: 'Harpoon', shaman: 'Shaman', pigronke: 'Hog Rider', ghost: 'Ghost', ronhood: 'RonkeHood' };
  var NFT_TYPE_MAP = { 1: 'skull', 2: 'archer', 3: 'harpoon_fish', 4: 'shaman', 5: 'pigronke', 6: 'ghost', 7: 'ronhood' };
  // fallback demo squad (no wallet / no registered squad) — shown for dev testing
  var DEMO_SQUAD = [{ type: 'skull' }, { type: 'archer' }, { type: 'harpoon_fish' }, { type: 'ronhood' }];
  // Enemy roster — real game sprites (single-row strips). size = NORMALIZED by content fraction (uniform-ish character
  // height, big monsters scaled up). ranged → fires projectiles; melee → charges & strikes. hp in 0..N (bar = hp/maxHp).
  var ENEMY_DEFS = [
    { key: 'redarcher', n: 'Red Archer', i: ['assets_tiny/RedArcher_Idle.png', 6, 140], w: ['assets_tiny/RedArcher_Run.png', 4, 120], a: ['assets_tiny/RedArcher_Shoot.png', 8, 85], ranged: true,  shot: 'redarrow', hp: 1.0, size: 61,  smul: 0.92, range: 150, cd: [1.1, 1.8] },
    { key: 'stabby',    n: 'Stabby',     i: ['assets_tiny/Stabby_Idle.png', 8, 130],    w: ['assets_tiny/Stabby_Run.png', 6, 110],    a: ['assets_tiny/Stabby_Throw.png', 8, 80],   ranged: true,  shot: 'harpoon',  hp: 1.1, size: 73,  smul: 0.90, range: 132, cd: [1.3, 2.0] },
    { key: 'thief',     n: 'Thief',      i: ['assets_tiny/Thief_Idle.png', 6, 140],     w: ['assets_tiny/Thief_Run.png', 6, 95],      a: ['assets_tiny/Thief_Attack.png', 6, 80],   ranged: false, hp: 0.8, size: 74,  smul: 1.15, reach: 38, cd: [0.8, 1.3] },
    { key: 'spider',    n: 'Spider',     i: ['animations/spider/Spider_Idle.png', 8, 120], w: ['animations/spider/Spider_Run.png', 5, 80], a: ['animations/spider/Spider_Attack.png', 8, 70], ranged: false, hp: 0.6, size: 59, smul: 1.30, reach: 34, cd: [0.7, 1.1] },
    { key: 'bear',      n: 'Bear',       i: ['assets_tiny/Bear_Idle.png', 8, 140],      w: ['assets_tiny/Bear_Run.png', 5, 100],      a: ['assets_tiny/Bear_Attack.png', 9, 80],    ranged: false, hp: 2.0, size: 117, smul: 0.70, reach: 50, cd: [1.2, 1.8] },
    { key: 'minotaur',  n: 'Minotaur',   i: ['assets_tiny/Minotaur_Idle.png', 16, 110], w: ['assets_tiny/Minotaur_Walk.png', 8, 110], a: ['assets_tiny/Minotaur_Attack.png', 12, 80], ranged: false, hp: 2.5, size: 119, smul: 0.62, reach: 54, cd: [1.4, 2.0] }
  ];

  // draw one sprite frame centred at (cx, footY-bottom). uses scene clock (S.clock) so hit-stop freezes anim too.
  function drawAnim(anim, cx, footY, size, faceLeft, frozenIdx, phase) {
    if (!anim || !anim.img || !anim.img.complete || !anim.img.naturalWidth) return false;
    var fw = anim.img.naturalWidth / anim.fc, fh = anim.img.naturalHeight;
    var idx = (typeof frozenIdx === 'number') ? Math.max(0, Math.min(anim.fc - 1, frozenIdx)) : (Math.floor((S.clock + (phase || 0)) / anim.ms) % anim.fc);
    var dh = size, dw = size * (fw / fh), dx = Math.round(cx - dw / 2), dy = Math.round(footY - dh);
    ctx.save();
    if (faceLeft) { ctx.translate(dx + dw, dy); ctx.scale(-1, 1); ctx.drawImage(anim.img, idx * fw, 0, fw, fh, 0, 0, dw, dh); }
    else { ctx.drawImage(anim.img, idx * fw, 0, fw, fh, dx, dy, dw, dh); }
    ctx.restore();
    return true;
  }

  // diagonal marching formation — FIXED slot per index (independent of squad size), so loading the real squad
  // doesn't reposition the units already on screen (no start "slide"). 4 columns per rank, ranks trail back-left.
  function formSlot(i) {
    var per = 4, rank = Math.floor(i / per), col = i % per;
    return { x: 46 - col * 30 - rank * 26 + (col % 2 ? 4 : -4), y: -26 + col * 18 + rank * 30 };
  }
  // build one marching unit from an NFT type + level (+ optional tokenId)
  function buildUnit(d, i) {
    var sp = UNIT_SPRITE_MAP[d.type] || UNIT_SPRITE_MAP.skull;
    var ranged = !!sp.ranged;
    return { name: UNIT_LABEL[d.type] || d.type, type: d.type, level: d.level || 0, tokenId: d.tokenId || null,
      set: setOf({ i: sp.i, w: sp.w, a: sp.a }), slot: formSlot(i), phase: rnd(0, 500),
      ux: 0, uy: 0, face: 1, moving: false,
      pxSpeed: 0.86 * (sp.smul || 0.9) * 54 * rnd(0.95, 1.05),   // EXACT F9 speed: 0.86 cells/s × utype × CELL(54)
      ranged: ranged, atkRange: ranged ? 150 : 44, shot: sp.shot || 'arrow', size: sp.size || 66,
      atk: 0, atkCd: rnd(0.4, 1.0), flash: 0, hp: 1 };
  }
  function placeUnits() { for (var n = 0; n < S.units.length; n++) { var uu = S.units[n]; uu.ux = partyX() + uu.slot.x; uu.uy = partyY() + uu.slot.y; } }
  function setSquad(defs) { S.units = defs.map(function (d, i) { return buildUnit(d, i); }); placeUnits(); }
  var _squadToken = 0;
  // pull the player's REGISTERED battle squad (BarracksNFT) and rebuild the marching party from it (async)
  function loadRegisteredSquad() {
    var addr = null;
    try { addr = (W.Wallet && W.Wallet.getAddress && W.Wallet.getAddress()) || null; } catch (e) {}
    var B = W.BarracksNFT;
    if (!addr || !B || !B.getBattleSquad || !B.loadDeckUnits) { addLog('🧪 No wallet — marching with a demo squad.'); return; }
    var ids = [];
    try { ids = B.getBattleSquad(addr) || []; } catch (e) {}
    if (!ids.length) { addLog('⚠️ No registered Battle Squad — using a demo squad.'); return; }
    addLog('📜 Mustering your registered squad (' + ids.length + ')…');
    var token = ++_squadToken;
    B.loadDeckUnits(addr, ids).then(function (units) {
      if (!running || token !== _squadToken) return;
      var defs = (units || []).map(function (nu) { var t = NFT_TYPE_MAP[nu.utype]; return t ? { type: t, level: nu.level || 0, tokenId: String(nu.tokenId) } : null; }).filter(Boolean);
      if (!defs.length) { addLog('⚠️ Squad came back empty — demo squad kept.'); return; }
      setSquad(defs);
      addLog('🛡️ Squad mustered: ' + defs.length + ' NFT unit' + (defs.length > 1 ? 's' : '') + ' set out!');
    }).catch(function () { if (token === _squadToken) addLog('⚠️ Squad load failed (RPC) — demo squad kept.'); });
  }

  function reset() {
    S = {
      progress: 0, speed: 4.0, scroll: 0, fade: 0, paused: false, done: false,
      clock: 0, trauma: 0, hitstop: 0,
      kills: 0, ronke: 0, xp: 0,
      units: [],
      enemies: [], nextEnemyIn: 2.2,
      dmg: [], poofs: [], parts: [], props: [], shots: [],
      log: ['⛏️ Setting out from the mine…'], choiceDone: false, choice: null
    };
    setSquad(DEMO_SQUAD);   // synchronous fallback; loadRegisteredSquad() swaps in the real NFT squad once it resolves
    for (var i = 0; i < 30; i++) S.props.push(newProp(rnd(-100, (Wlog || 1200) + 200)));
    for (var j = 0; j < 24; j++) S.parts.push(newPart(true));
  }
  // ── F9-style movement helpers ──
  function moveToward(o, tx, ty, sp, dt) {
    var dx = tx - o.ux, dy = ty - o.uy, d = Math.hypot(dx, dy);
    if (d > 0.01) { var step = Math.min(d, sp * dt); o.ux += dx / d * step; o.uy += dy / d * step; if (Math.abs(dx) > 1.5) o.face = dx >= 0 ? 1 : -1; }
    return d;
  }
  function centroid() { var sx = 0, sy = 0, n = S.units.length; for (var i = 0; i < n; i++) { sx += S.units[i].ux; sy += S.units[i].uy; } return n ? { x: sx / n, y: sy / n } : { x: partyX(), y: partyY() }; }
  function nearestUnit(o) { var best = null, bd = 1e9; for (var i = 0; i < S.units.length; i++) { var u = S.units[i], dd = Math.hypot(u.ux - o.ux, u.uy - o.uy); if (dd < bd) { bd = dd; best = u; } } return best; }
  function nearestEnemy(o) { var best = null, bd = 1e9; for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; if (e.hp <= 0) continue; var dd = Math.hypot(e.ux - o.ux, e.uy - o.uy); if (dd < bd) { bd = dd; best = e; } } return best; }

  // ── F9-style projectiles (arrow / harpoon / red arrow) — homing parabolic flight, impact on arrival ──
  function spawnShot(from, target, kind, dmg, hitsUnit) {
    var sx = from.ux + from.face * 10, sy = from.uy - 30;          // chest height, slightly ahead
    var tx = target.ux, ty = target.uy - 26;
    var dist = Math.hypot(tx - sx, ty - sy);
    S.shots.push({ kind: kind, dmg: dmg, hitsUnit: !!hitsUnit, target: target,
      sx: sx, sy: sy, tx: tx, ty: ty, x: sx, y: sy, px: sx, py: sy,
      born: S.clock, durMs: Math.max(150, dist / SHOT_SPEED * 1000),
      arcH: Math.min(54 * 1.1, dist * 0.16), angle: Math.atan2(ty - sy, tx - sx),
      state: 'fly', stateAt: 0, trail: [], _lt: 0 });
  }
  function impactShot(s) {
    var tgt = s.target;
    if (s.hitsUnit) {                                   // enemy arrow → unit (prototype: cosmetic graze, no death)
      if (tgt) { tgt.flash = 0.28; S.trauma = Math.min(1, S.trauma + 0.14);
        S.dmg.push({ x: tgt.ux + rnd(-10, 10), y: tgt.uy - 50, v: Math.round(s.dmg * 80), life: 0.7, col: '#ff9a9a' }); }
      s.state = 'impact'; s.stateAt = S.clock;
    } else if (tgt && tgt.hp > 0) {                     // unit arrow/harpoon → enemy
      tgt.hp -= s.dmg; tgt.flash = 0.12;
      S.hitstop = Math.max(S.hitstop, 0.04); S.trauma = Math.min(1, S.trauma + 0.2);
      S.dmg.push({ x: tgt.ux + rnd(-12, 12), y: tgt.uy - 56, v: Math.round(s.dmg * 80), life: 0.75, col: '#ffe08a' });
      s.state = 'impact'; s.stateAt = S.clock;
      if (tgt.hp <= 0) killEnemy(tgt);
    } else { s.state = 'stuck'; s.stateAt = S.clock; }  // target gone → arrow sticks in the ground
    s.trail.length = 0;
  }
  function updateShots(dt) {
    for (var i = S.shots.length - 1; i >= 0; i--) {
      var s = S.shots[i];
      if (s.state === 'fly') {
        var t = Math.min(1, (S.clock - s.born) / s.durMs);
        if (s.target) { s.tx = s.target.ux; s.ty = s.target.uy - 26; }   // homing toward live target
        s.px = s.x; s.py = s.y;
        var bx = s.sx + (s.tx - s.sx) * t, by = s.sy + (s.ty - s.sy) * t;
        s.x = bx; s.y = by - Math.sin(t * Math.PI) * s.arcH;             // parabolic arc like F9
        var mdx = s.x - s.px, mdy = s.y - s.py;
        if (Math.abs(mdx) + Math.abs(mdy) > 0.4) s.angle = Math.atan2(mdy, mdx);
        if (S.clock - s._lt > 40) { s._lt = S.clock; s.trail.push({ x: s.x, y: s.y, born: S.clock }); if (s.trail.length > 6) s.trail.shift(); }
        if (t >= 1) impactShot(s);
      } else if (s.state === 'impact') { if ((S.clock - s.stateAt) / 60 >= 9) S.shots.splice(i, 1); }
      else if (s.state === 'stuck') { if (S.clock - s.stateAt > 1100) S.shots.splice(i, 1); }
    }
  }
  function drawShots() {
    for (var i = 0; i < S.shots.length; i++) {
      var s = S.shots[i];
      if (s.state === 'impact') {
        var fr = Math.floor((S.clock - s.stateAt) / 60); if (fr >= 9) continue;
        if (IMPACT.complete && IMPACT.naturalWidth) { var IS = 46; ctx.drawImage(IMPACT, fr * 192, 0, 192, 192, Math.round(s.x - IS / 2), Math.round(s.y - IS / 2), IS, IS); }
        continue;
      }
      if (s.state === 'fly') {                                            // soft dark trail
        for (var k = 0; k < s.trail.length; k++) { var tp = s.trail[k], ta = 1 - (S.clock - tp.born) / 260; if (ta <= 0) continue; ctx.globalAlpha = ta * 0.30; ctx.fillStyle = '#2a2118'; ctx.beginPath(); ctx.arc(tp.x, tp.y, 1.6, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      var fade = s.state === 'stuck' ? Math.max(0, 1 - (S.clock - s.stateAt) / 1100) : 1;
      ctx.globalAlpha = fade; ctx.save(); ctx.translate(Math.round(s.x), Math.round(s.y));
      if (s.kind === 'harpoon') {
        ctx.rotate(s.angle + Math.PI / 4);                               // harpoon sprite points diagonally (F9 offset)
        if (HARPOON.complete && HARPOON.naturalWidth) ctx.drawImage(HARPOON, 0, 0, 64, 64, -13, -13, 26, 26);
      } else {
        ctx.rotate(s.angle);
        var sheet = (s.kind === 'redarrow') ? RED_ARROW : ARROW;
        var srcY = (s.state === 'stuck' && sheet === ARROW) ? 64 : 0;    // ARROW sheet: bottom row = stuck pose
        if (sheet.complete && sheet.naturalWidth) ctx.drawImage(sheet, 0, srcY, 64, 64, -14, -15, 28, 30);
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  // ── F9-style white outline for units hidden behind trees ──
  var _oc = null, _ocw = null;
  function occludedByTree(un) {
    for (var i = 0; i < S.props.length; i++) { var pr = S.props[i]; if (pr.k !== 'tree') continue; if (pr.y > un.uy && Math.abs(pr.x - un.ux) < 52 * pr.s && (pr.y - un.uy) < 120) return true; }
    return false;
  }
  function _frameOf(un) {
    var st = un.atk > 0 ? 'atk' : un.moving ? 'walk' : 'idle';
    var anim = un.set ? (st === 'atk' ? un.set.atk : st === 'idle' ? un.set.idle : un.set.walk) : null;
    if (!anim || !anim.img || !anim.img.complete || !anim.img.naturalWidth) return null;
    var idx = (st === 'atk') ? Math.floor((1 - un.atk / ATK_DUR) * (anim.fc - 1)) : (Math.floor((S.clock + un.phase) / anim.ms) % anim.fc);
    return { img: anim.img, fw: anim.img.naturalWidth / anim.fc, fh: anim.img.naturalHeight, idx: idx };
  }
  function drawUnitOutline(un) {
    var f = _frameOf(un); if (!f) return;
    var size = un.size || 66, dh = size, dw = size * (f.fw / f.fh), pad = 4;
    var W = Math.ceil(dw + pad * 2), H = Math.ceil(dh + pad * 2);
    if (!_ocw) _ocw = D.createElement('canvas'); if (!_oc) _oc = D.createElement('canvas');
    if (_ocw.width !== W || _ocw.height !== H) { _ocw.width = W; _ocw.height = H; }
    if (_oc.width !== W || _oc.height !== H) { _oc.width = W; _oc.height = H; }
    var gw = _ocw.getContext('2d'), g = _oc.getContext('2d');
    gw.clearRect(0, 0, W, H); gw.imageSmoothingEnabled = false;
    if (un.face < 0) { gw.save(); gw.translate(W / 2, 0); gw.scale(-1, 1); gw.drawImage(f.img, f.idx * f.fw, 0, f.fw, f.fh, -dw / 2, pad, dw, dh); gw.restore(); }
    else gw.drawImage(f.img, f.idx * f.fw, 0, f.fw, f.fh, pad, pad, dw, dh);
    gw.globalCompositeOperation = 'source-in'; gw.fillStyle = '#ffffff'; gw.fillRect(0, 0, W, H); gw.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = false;
    var OL = 2, offs = [[-OL, 0], [OL, 0], [0, -OL], [0, OL], [-OL, -OL], [OL, -OL], [-OL, OL], [OL, OL]];
    for (var o = 0; o < offs.length; o++) g.drawImage(_ocw, offs[o][0], offs[o][1]);
    g.globalCompositeOperation = 'destination-out'; g.drawImage(_ocw, 0, 0); g.globalCompositeOperation = 'source-over';
    var footY = un.uy;
    ctx.drawImage(_oc, Math.round(un.ux - dw / 2 - pad), Math.round(footY - dh - pad));
  }
  function newProp(x) {
    var r = Math.random();
    return { x: x, y: rnd(74, (Hlog || 600) - 36), k: r < 0.52 ? 'tree' : r < 0.86 ? 'bush' : 'flower', s: rnd(0.8, 1.3), ti: (Math.random() * TREES.length) | 0, vi: (Math.random() * 4) | 0 };
  }
  function newPart(spread) { return { x: rnd(0, 1300), y: spread ? rnd(0, 800) : -10, vx: rnd(-8, 8), vy: rnd(16, 34), r: rnd(1.4, 3.2), a: rnd(0.12, 0.4), sway: rnd(0, 6.28) }; }
  function addLog(m) { S.log.unshift(m); if (S.log.length > 5) S.log.pop(); }
  function partyY() { return Hlog * 0.56; }
  function partyX() { return Wlog * 0.50; }   // squad marches through the MIDDLE of the map
  function engaged() { return S.enemies && S.enemies.length > 0; }

  // ── update (fixed dt) ──────────────────────────────────────────────
  function update(dt) {
    S.clock += dt * 1000;
    if (S.fade < 1) S.fade = Math.min(1, S.fade + dt * 3);
    S.trauma = Math.max(0, S.trauma - 1.3 * dt);
    for (var i = S.dmg.length - 1; i >= 0; i--) { var d = S.dmg[i]; d.life -= dt; if (d.life <= 0) S.dmg.splice(i, 1); }
    for (var p = S.poofs.length - 1; p >= 0; p--) { S.poofs[p].life -= dt; if (S.poofs[p].life <= 0) S.poofs.splice(p, 1); }
    for (var u0 = 0; u0 < S.units.length; u0++) { var un0 = S.units[u0]; un0.atk = Math.max(0, un0.atk - dt); un0.flash = Math.max(0, un0.flash - dt); un0.atkCd = Math.max(-2, un0.atkCd - dt); }
    for (var q = 0; q < S.parts.length; q++) { var pt = S.parts[q]; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.sway += dt * 2; if (pt.y > Hlog + 20) S.parts[q] = newPart(false); }
    if (S.done || S.paused) return;

    if (!S.choiceDone && S.progress >= 38 && !S.enemies.length) { openChoice(); return; }

    var u, un, d;
    // snapshot positions so `moving` reflects ACTUAL on-screen motion (no walk-in-place: idle when not translating)
    for (var sp0 = 0; sp0 < S.units.length; sp0++) { S.units[sp0]._ox = S.units[sp0].ux; S.units[sp0]._oy = S.units[sp0].uy; }
    for (var es0 = 0; es0 < S.enemies.length; es0++) { S.enemies[es0]._ox = S.enemies[es0].ux; S.enemies[es0]._oy = S.enemies[es0].uy; }
    if (!S.enemies.length) {
      // MARCHING: camera moves (world scrolls past). Units stand IDLE in rank facing forward and gently re-settle into
      // formation — the scroll masks the small re-settle, so there's NO backward-walk (units forced idle below).
      var sp = 42;   // ≈ F9 unit speed (0.86 cells/s × 54px ≈ 46px/s)
      S.progress = Math.min(100, S.progress + S.speed * dt);
      S.scroll += sp * dt;
      for (var pr = 0; pr < S.props.length; pr++) { S.props[pr].x -= sp * dt; if (S.props[pr].x < -100) { var np = newProp(Wlog + rnd(40, 260)); S.props[pr].x = np.x; S.props[pr].y = np.y; S.props[pr].k = np.k; S.props[pr].s = np.s; } }
      for (u = 0; u < S.units.length; u++) { un = S.units[u]; moveToward(un, partyX() + un.slot.x, partyY() + un.slot.y, un.pxSpeed, dt); un.face = 1; }
      S.nextEnemyIn -= dt;
      if (S.nextEnemyIn <= 0 && S.progress < 95) spawnWave();
      if (S.progress >= 100) finish();
    } else {
      // COMBAT: 1–3 enemies converge on the squad's FIXED centre; units engage the nearest enemy but stay within a
      // radius of that centre → EVERY unit can reach the fight (front & back), and none chases off-screen.
      var ax = partyX(), ay = partyY();
      for (var ei = 0; ei < S.enemies.length; ei++) {
        var e = S.enemies[ei];
        if (e.ranged) {                               // sprint to firing range from the centre, then HOLD; shoot nearest unit
          var de = Math.hypot(ax - e.ux, ay - e.uy), ER = e.range;
          if (de > ER + 24) moveToward(e, ax, ay, e.pxSpeed * (de > 140 ? 2.3 : 1.3), dt);
          var efx = ax - e.ux; if (efx > 8) e.face = 1; else if (efx < -8) e.face = -1;
          e.atkCd -= dt;
          if (e.atkCd <= 0 && e.atk <= 0 && de < ER + 90) { e.atkCd = rnd(e.cdMin, e.cdMax); e.atk = ATK_DUR; var tkn = nearestUnit(e); if (tkn) spawnShot(e, tkn, e.shot || 'redarrow', rnd(0.05, 0.12), true); }
        } else {                                      // melee: charge the nearest unit, strike on contact (cosmetic dmg)
          var tu = nearestUnit(e), mdx = (tu ? tu.ux : ax) - e.ux, mdy = (tu ? tu.uy : ay) - e.uy, md = Math.hypot(mdx, mdy) || 1;
          if (mdx > 8) e.face = 1; else if (mdx < -8) e.face = -1;
          if (md > e.reach) moveToward(e, e.ux + mdx / md * (md - e.reach), e.uy + mdy / md * (md - e.reach), e.pxSpeed * (md > 90 ? 2.4 : 1.2), dt);
          e.atkCd -= dt;
          if (tu && md <= e.reach + 8 && e.atkCd <= 0 && e.atk <= 0) {
            e.atkCd = rnd(e.cdMin, e.cdMax); e.atk = ATK_DUR; tu.flash = 0.26; S.trauma = Math.min(1, S.trauma + 0.18);
            S.dmg.push({ x: tu.ux + rnd(-10, 10), y: tu.uy - 50, v: 4 + ((Math.random() * 6) | 0), life: 0.7, col: '#ff9a9a' });
          }
        }
        e.atk = Math.max(0, e.atk - dt);
      }
      for (var v = 0; v < S.units.length; v++) {
        un = S.units[v];
        var tgt = nearestEnemy(un); if (!tgt) continue;
        var ddx = tgt.ux - un.ux, ddy = tgt.uy - un.uy, dE = Math.hypot(ddx, ddy) || 1;
        if (ddx > 8) un.face = 1; else if (ddx < -8) un.face = -1;   // deadzone — no rapid left/right flip
        if (un.ranged) {                              // hold near max range, fire when in range
          var want = un.atkRange * 0.82;
          if (dE < want - 28) moveToward(un, un.ux - ddx, un.uy - ddy, un.pxSpeed, dt);
          else if (dE > un.atkRange) moveToward(un, tgt.ux, tgt.uy, un.pxSpeed, dt);
          if (dE <= un.atkRange + 10 && un.atkCd <= 0 && un.atk <= 0) { un.atkCd = rnd(0.9, 1.5); un.atk = ATK_DUR; spawnShot(un, tgt, un.shot || 'arrow', rnd(0.16, 0.28), false); }
        } else {                                      // melee: close to attack range, instant strike on contact
          var stop = un.atkRange * 0.7;
          if (dE > stop) moveToward(un, tgt.ux - ddx / dE * stop, tgt.uy - ddy / dE * stop, un.pxSpeed, dt);
          if (dE <= un.atkRange + 6 && un.atkCd <= 0 && un.atk <= 0) {
            un.atkCd = rnd(0.7, 1.2); un.atk = ATK_DUR;
            var hit = rnd(0.16, 0.30); tgt.hp -= hit; tgt.flash = 0.12;
            S.hitstop = Math.max(S.hitstop, 0.05); S.trauma = Math.min(1, S.trauma + 0.26);
            S.dmg.push({ x: tgt.ux + rnd(-12, 12), y: tgt.uy - 56, v: Math.round(hit * 80), life: 0.75, col: '#ffe08a' });
            if (tgt.hp <= 0) killEnemy(tgt);
          }
        }
        // clamp to the SQUAD CENTRE (not each unit's marching slot) → every unit reaches the fight; none chases off-screen
        var sdx = un.ux - ax, sdy = un.uy - ay, sd = Math.hypot(sdx, sdy), maxStray = un.ranged ? 130 : 172;
        if (sd > maxStray) { un.ux = ax + sdx / sd * maxStray; un.uy = ay + sdy / sd * maxStray; }
      }
    }
    // walk vs idle. RULE: camera moving (march, no enemies) → IDLE (no walk-in-place, no backward-walk while re-settling);
    // combat → WALK from ACTUAL movement, debounced (F9-style hysteresis 0.16s → no flicker).
    var MOV2 = 0.20 * 0.20, HOLD = 0.16, inCombat = S.enemies.length > 0;
    for (var mv = 0; mv < S.units.length; mv++) {
      var um = S.units[mv];
      if (!inCombat) { um.moving = false; um._mh = 0; continue; }   // marching → idle
      var dxm = um.ux - um._ox, dym = um.uy - um._oy;
      if (dxm * dxm + dym * dym > MOV2) um._mh = HOLD; else um._mh = Math.max(0, (um._mh || 0) - dt);
      um.moving = um._mh > 0;
    }
    for (var me = 0; me < S.enemies.length; me++) {
      var en = S.enemies[me], edx = en.ux - en._ox, edy = en.uy - en._oy;
      if (edx * edx + edy * edy > MOV2) en._mh = HOLD; else en._mh = Math.max(0, (en._mh || 0) - dt);
      en.moving = en._mh > 0;
    }
    updateShots(dt);
  }

  function makeEnemy(d, i, count) {
    return { key: d.key, name: d.n, set: setOf(d), ranged: !!d.ranged, shot: d.shot || null,
      ux: Wlog + 40 + i * 58, uy: partyY() + (i - (count - 1) / 2) * 46 + rnd(-22, 22),
      face: -1, moving: true, pxSpeed: 0.86 * (d.smul || 0.84) * 54,
      hp: d.hp || 1, maxHp: d.hp || 1, atk: 0, atkCd: rnd(0.4, 1.0), flash: 0, phase: rnd(0, 400),
      size: d.size || 61, range: d.range || 150, reach: d.reach || 40, cdMin: (d.cd && d.cd[0]) || 1.0, cdMax: (d.cd && d.cd[1]) || 1.6 };
  }
  function spawnWave() {
    var r = Math.random(), count = r > 0.82 ? 3 : (r > 0.5 ? 2 : 1);   // sometimes 2–3 enemies appear at once
    var names = [];
    for (var i = 0; i < count; i++) { var d = ENEMY_DEFS[(Math.random() * ENEMY_DEFS.length) | 0]; S.enemies.push(makeEnemy(d, i, count)); names.push(d.n); }
    addLog('⚔️ ' + (count > 1 ? count + ' enemies block the path — squad engages!' : names[0] + ' blocks the path — squad engages!'));
  }
  function killEnemy(e) {
    var idx = S.enemies.indexOf(e); if (idx < 0) return;   // already removed (double-kill in same frame)
    S.enemies.splice(idx, 1);
    S.poofs.push({ x: e.ux, y: e.uy - 30, life: 0.45 }); S.kills++; S.hitstop = Math.max(S.hitstop, 0.09); S.trauma = Math.min(1, S.trauma + 0.5);
    var xp = 8 + ((Math.random() * 12) | 0); S.xp += xp; addLog('✅ ' + e.name + ' defeated · +' + xp + ' XP');
    if (Math.random() < 0.5) { if (Math.random() < 0.5) { var r = 3 + ((Math.random() * 7) | 0); S.ronke += r; addLog('🪙 Looted ' + r + ' RONKE'); } else addLog('🍄 Found a healing mushroom'); }
    if (!S.enemies.length) S.nextEnemyIn = rnd(2.4, 4.2);   // wave cleared → march resumes, units go idle
  }
  function openChoice() {
    S.choiceDone = true; S.paused = true;
    S.choice = { q: '🍄 A glowing mushroom sits on the path. Your Shaman studies it…',
      opts: [
        { label: 'Take it', sub: 'Could heal… or poison', pick: function () { addLog(Math.random() < 0.6 ? '🍄 The mushroom healed the squad (+HP)' : '☠️ Toxic — a unit is weakened.'); } },
        { label: 'Leave it', sub: 'Walk on, no risk', pick: function () { addLog('🚶 Left it and marched on.'); } } ] };
  }
  function finish() { S.done = true; addLog('🏁 Expedition complete — heading home with the loot!'); }

  // ── draw ───────────────────────────────────────────────────────────
  function draw() {
    var w = Wlog, h = Hlog;
    drawGrass(w, h);   // real grass tilemap — open field like F9 (no center path)

    // screen shake (world only)
    var sh = 5 * S.trauma * S.trauma;
    var sx = sh ? (Math.random() * 2 - 1) * sh : 0, sy = sh ? (Math.random() * 2 - 1) * sh : 0;
    ctx.save(); ctx.translate(Math.round(sx), Math.round(sy));

    // collect drawables (props + units + enemy) and sort by y for top-down depth
    var draws = [];
    for (var i = 0; i < S.props.length; i++) { var pr = S.props[i]; draws.push({ y: pr.y, fn: drawProp, a: pr }); }
    for (var u = 0; u < S.units.length; u++) { draws.push({ y: S.units[u].uy, fn: drawUnit, a: S.units[u] }); }
    for (var en = 0; en < S.enemies.length; en++) { draws.push({ y: S.enemies[en].uy, fn: drawEnemy, a: S.enemies[en] }); }
    draws.sort(function (p, q) { return p.y - q.y; });
    for (var dI = 0; dI < draws.length; dI++) draws[dI].fn(draws[dI].a);

    // F9-style: white outline for units hidden behind trees (drawn on top of everything)
    for (var ou = 0; ou < S.units.length; ou++) { if (occludedByTree(S.units[ou])) drawUnitOutline(S.units[ou]); }

    // F9-style projectiles fly above the sprites
    drawShots();

    // poofs + dmg
    for (var pf = 0; pf < S.poofs.length; pf++) { var po = S.poofs[pf], k = 1 - po.life / 0.45; ctx.globalAlpha = (1 - k) * 0.85; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(po.x, po.y, 8 + k * 32, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.font = 'bold 17px system-ui'; ctx.textAlign = 'center';
    for (var dn = 0; dn < S.dmg.length; dn++) { var dm = S.dmg[dn]; var pr2 = 1 - dm.life / 0.75; ctx.globalAlpha = Math.min(1, dm.life * 2.2); ctx.fillStyle = dm.col; ctx.fillText('-' + dm.v, dm.x, dm.y - easeOut(pr2) * 26); }
    ctx.globalAlpha = 1;
    ctx.restore(); // end shake

    // ambient particles (no shake)
    for (var qp = 0; qp < S.parts.length; qp++) { var p = S.parts[qp]; ctx.globalAlpha = p.a; ctx.fillStyle = '#dff0c0'; ctx.beginPath(); ctx.arc(Math.round(p.x + Math.sin(p.sway) * 4), Math.round(p.y), p.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;

    // (no tint/vignette — keep grass color exactly like F9)

    drawHUD(w, h);
    if (S.paused && S.choice) drawChoice(w, h);
    if (S.done) drawDone(w, h);
    if (S.fade < 1) { ctx.globalAlpha = 1 - S.fade; ctx.fillStyle = '#070a0d'; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
  }

  function drawGrass(w, h) {
    var g = GRASS;
    if (g.complete && g.naturalWidth) {
      // EXACT F9 grass: CELL=54 tiles, CLEAN interior tile (64,64) = centre of the grass block (no tuft edges).
      var SR = 64, T = 54, ox = -(((S.scroll % T) + T) % T);
      var sx = 64, sy = 64;
      for (var y = -T; y < h + T; y += T) for (var x = -T + ox; x < w + T; x += T) {
        ctx.drawImage(g, sx, sy, SR, SR, Math.round(x), Math.round(y), T + 1, T + 1);
      }
    } else {
      var gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6fa248'); gr.addColorStop(1, '#5d8c3a'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
      grassPatches(w, h);
    }
  }
  function grassPatches(w, h) {
    var M = w + 120;
    ctx.fillStyle = 'rgba(120,160,80,0.40)';
    for (var i = 0; i < 26; i++) {
      var px = (((i * 137.5 - S.scroll * 0.6) % M) + M) % M - 60;
      var py = ((i * 91.3) % (h + 120)) - 60;
      ctx.beginPath(); ctx.ellipse(px, py, 34, 22, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = 'rgba(60,96,42,0.30)';
    for (var k = 0; k < 18; k++) {
      var qx = (((k * 211.7 - S.scroll * 0.6) % M) + M) % M - 60;
      var qy = ((k * 153.1) % (h + 120)) - 60;
      ctx.beginPath(); ctx.ellipse(qx, qy, 26, 16, 0, 0, 7); ctx.fill();
    }
  }
  function drawPath(w, h) {
    ctx.fillStyle = 'rgba(122,98,60,0.5)';
    var cyp = h * 0.56;
    for (var x = -40; x < w + 40; x += 22) {
      var xx = x - (S.scroll % 22);
      var wob = Math.sin((xx + S.scroll) * 0.010) * 42;
      ctx.beginPath(); ctx.ellipse(xx, cyp + wob, 28, 46, 0, 0, 7); ctx.fill();
    }
  }
  function drawProp(pr) {
    var x = Math.round(pr.x), y = Math.round(pr.y), s = pr.s;
    // (tree/bush sprites have baked-in shadows)
    if (pr.k === 'tree') {
      var t = TREES[(pr.ti || 0) % TREES.length];
      if (t && t.complete && t.naturalWidth) {
        var fc = 8, fw = t.naturalWidth / fc, fh = t.naturalHeight;
        var idx = Math.floor((S.clock + pr.x * 7) / 166) % fc;   // ~6fps, desynced by position
        var dw = fw * 0.66 * s, dh = fh * 0.66 * s;
        ctx.drawImage(t, idx * fw, 0, fw, fh, Math.round(x - dw / 2), Math.round(y - dh + 12), Math.round(dw), Math.round(dh));
        return;
      }
      ctx.fillStyle = '#2c5e35'; ctx.beginPath(); ctx.arc(x, y - 8 * s, 22 * s, 0, 7); ctx.fill();
      ctx.fillStyle = '#387a44'; ctx.beginPath(); ctx.arc(x - 9 * s, y - 14 * s, 13 * s, 0, 7); ctx.arc(x + 10 * s, y - 10 * s, 11 * s, 0, 7); ctx.fill();
    } else if (pr.k === 'rock') {
      if (animProp(BOULDERS[(pr.vi || 0) % BOULDERS.length], 6, 125, x, y, s, 0.5)) return;
      ctx.fillStyle = '#6a6a60'; ctx.beginPath(); ctx.ellipse(x, y - 5 * s, 15 * s, 11 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#82827a'; ctx.beginPath(); ctx.ellipse(x - 4 * s, y - 9 * s, 7 * s, 5 * s, 0, 0, 7); ctx.fill();
    } else if (pr.k === 'bush') {
      if (animProp(BUSHES[(pr.vi || 0) % BUSHES.length], 8, 170, x, y, s, 0.78)) return;
      ctx.fillStyle = '#356b39'; ctx.beginPath(); ctx.arc(x - 6 * s, y - 4 * s, 9 * s, 0, 7); ctx.arc(x + 6 * s, y - 4 * s, 10 * s, 0, 7); ctx.arc(x, y - 9 * s, 9 * s, 0, 7); ctx.fill();
    } else { ctx.fillStyle = ['#ffd35c', '#e88ad0', '#7fd0ff'][(x | 0) % 3]; ctx.beginPath(); ctx.arc(x, y - 3 * s, 3 * s, 0, 7); ctx.fill(); }
  }

  // clean hit-flash: the character's own silhouette blinks white (additive) — replaces the old red/white blob ellipses
  var _fc = null;
  function drawFlash(ent, cx, footY, alpha) {
    if (alpha <= 0.02) return;
    var f = _frameOf(ent); if (!f) return;
    var size = ent.size || 66, dh = size, dw = size * (f.fw / f.fh), pad = 2;
    var FW = Math.ceil(dw + pad * 2), FH = Math.ceil(dh + pad * 2);
    if (!_fc) _fc = D.createElement('canvas');
    if (_fc.width !== FW || _fc.height !== FH) { _fc.width = FW; _fc.height = FH; }
    var g = _fc.getContext('2d');
    g.clearRect(0, 0, FW, FH); g.imageSmoothingEnabled = false;
    if (ent.face < 0) { g.save(); g.translate(FW / 2, 0); g.scale(-1, 1); g.drawImage(f.img, f.idx * f.fw, 0, f.fw, f.fh, -dw / 2, pad, dw, dh); g.restore(); }
    else g.drawImage(f.img, f.idx * f.fw, 0, f.fw, f.fh, pad, pad, dw, dh);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, FW, FH); g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.globalAlpha = Math.min(0.8, alpha); ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(_fc, Math.round(cx - dw / 2 - pad), Math.round(footY - dh - pad));
    ctx.restore();
  }

  function drawUnit(un) {
    var st = un.atk > 0 ? 'atk' : un.moving ? 'walk' : 'idle';
    var lungeX = un.atk > 0 ? un.face * Math.sin((1 - un.atk / ATK_DUR) * Math.PI) * 12 : 0;  // lunge toward target
    var cx = un.ux + lungeX, footY = un.uy;   // NO vertical bob — F9 units glide; the walk is in the sprite frames (no jumping)
    // (Skull/Archer/Harpoon sprites have a baked-in shadow — adding our own made them look airborne)
    var anim = un.set ? (st === 'atk' ? un.set.atk : st === 'idle' ? un.set.idle : un.set.walk) : null;
    var frozen = (st === 'atk' && anim) ? Math.floor((1 - un.atk / ATK_DUR) * (anim.fc - 1)) : undefined;
    var drew = anim ? drawAnim(anim, cx, footY, un.size || 66, un.face < 0, frozen, un.phase) : false;
    if (!drew) { ctx.fillStyle = '#cfc7bb'; ctx.fillRect(Math.round(cx - 9), Math.round(footY - 44), 18, 40); }
    if (un.flash > 0) drawFlash(un, cx, footY, un.flash * 2.8);   // clean white silhouette blink (no red blob)
    // (no name labels above units — removed per request)
  }

  function drawEnemy(e) {
    var st = e.atk > 0 ? 'atk' : e.moving ? 'walk' : 'idle';
    var lungeX = e.atk > 0 ? e.face * Math.sin((1 - e.atk / ATK_DUR) * Math.PI) * 12 : 0;  // lunge toward squad
    var cx = e.ux + lungeX, footY = e.uy;
    // (enemy sprite has a baked-in shadow)
    var anim = e.set ? (st === 'atk' ? e.set.atk : st === 'idle' ? e.set.idle : e.set.walk) : null;
    var frozen = (st === 'atk' && anim) ? Math.floor((1 - e.atk / ATK_DUR) * (anim.fc - 1)) : undefined;
    var drew = anim ? drawAnim(anim, cx, footY, e.size || 61, e.face < 0, frozen, e.phase) : false;
    if (!drew) { ctx.fillStyle = '#b65050'; ctx.fillRect(Math.round(cx - 11), Math.round(footY - 42), 22, 38); }
    if (e.flash > 0) { drawFlash(e, cx, footY, e.flash * 6); e.flash = Math.max(0, e.flash - 0.016); }   // clean white silhouette blink
    var bw = Math.max(34, Math.round((e.size || 61) * 0.6)), barY = footY - Math.round((e.size || 61) * 0.72) - 4;   // HP bar above the head (scales with size)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(cx - bw / 2, barY, bw, 6, 3); ctx.fill();
    ctx.fillStyle = '#e85d5d'; roundRect(cx - bw / 2, barY, bw * Math.max(0, e.hp / (e.maxHp || 1)), 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(245,210,210,0.85)'; ctx.font = '9px system-ui'; ctx.textAlign = 'center'; ctx.fillText(e.name, cx, barY - 6);
  }

  // ── HUD ────────────────────────────────────────────────────────────
  function drawHUD(w, h) {
    ctx.fillStyle = 'rgba(18,13,7,0.85)'; ctx.fillRect(0, 0, w, 56);
    ctx.fillStyle = '#ffcf5c'; ctx.font = 'bold 17px system-ui'; ctx.textAlign = 'left'; ctx.fillText('⛺ EXPEDITION · Forest', 18, 24);
    ctx.fillStyle = '#9fdac4'; ctx.font = '11px system-ui'; ctx.fillText('F8 · prototype · NFT squad', 18, 42);
    var bx = 230, bw = Math.max(140, w - 560);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(bx, 18, bw, 18, 9); ctx.fill();
    var pg = ctx.createLinearGradient(bx, 0, bx + bw, 0); pg.addColorStop(0, '#3f8e98'); pg.addColorStop(1, '#5fc3a6');
    ctx.fillStyle = pg; roundRect(bx, 18, bw * (S.progress / 100), 18, 9); ctx.fill();
    ctx.fillStyle = '#eafff5'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('DEPTH ' + Math.floor(S.progress) + '%', bx + bw / 2, 31);
    ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd7a0'; ctx.fillText('⚔ ' + S.kills + '   🪙 ' + S.ronke + '   ✨ ' + S.xp, w - 60, 28);
    ctx.fillStyle = '#9aa'; ctx.font = '10px system-ui'; ctx.fillText('kills · ronke · xp', w - 60, 44);
    _closeBtn = { x: w - 46, y: 12, w: 32, h: 32 };
    ctx.fillStyle = 'rgba(70,34,34,0.92)'; roundRect(_closeBtn.x, _closeBtn.y, 32, 32, 8); ctx.fill();
    ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 1; roundRect(_closeBtn.x, _closeBtn.y, 32, 32, 8); ctx.stroke();
    ctx.fillStyle = '#f5e6c3'; ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('✕', _closeBtn.x + 16, _closeBtn.y + 22);
    ctx.textAlign = 'left'; ctx.font = '13px system-ui';
    for (var i = 0; i < S.log.length; i++) {
      var a = 1 - i * 0.17; if (a <= 0) continue;
      var ly = h - 20 - i * 22, tw = ctx.measureText(S.log[i]).width;
      ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#120d07'; roundRect(14, ly - 14, tw + 18, 19, 6); ctx.fill();
      ctx.globalAlpha = a; ctx.fillStyle = i === 0 ? '#fff7e0' : '#cdbb98'; ctx.fillText(S.log[i], 23, ly);
    }
    ctx.globalAlpha = 1;
  }

  var _choiceBtns = [];
  function drawChoice(w, h) {
    ctx.fillStyle = 'rgba(6,8,12,0.6)'; ctx.fillRect(0, 0, w, h);
    var mw = Math.min(580, w - 40), mh = 196, mx = (w - mw) / 2, my = (h - mh) / 2;
    ctx.fillStyle = '#1a130c'; roundRect(mx, my, mw, mh, 14); ctx.fill();
    ctx.strokeStyle = '#8a6a2e'; ctx.lineWidth = 2; roundRect(mx, my, mw, mh, 14); ctx.stroke();
    ctx.fillStyle = '#ffcf5c'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText('⚑ A CHOICE', mx + mw / 2, my + 30);
    ctx.fillStyle = '#f5e6c3'; ctx.font = '13px system-ui'; wrap(S.choice.q, mx + mw / 2, my + 58, mw - 56, 18);
    _choiceBtns = [];
    var bw = (mw - 52) / 2, bh = 58, by = my + mh - bh - 18;
    for (var i = 0; i < S.choice.opts.length; i++) {
      var o = S.choice.opts[i], bx = mx + 18 + i * (bw + 16);
      ctx.fillStyle = '#2e2113'; roundRect(bx, by, bw, bh, 9); ctx.fill();
      ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 1; roundRect(bx, by, bw, bh, 9); ctx.stroke();
      ctx.fillStyle = '#ffcf5c'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'left'; ctx.fillText(o.label, bx + 13, by + 25);
      ctx.fillStyle = '#cdbb98'; ctx.font = '11px system-ui'; ctx.fillText(o.sub, bx + 13, by + 43);
      _choiceBtns.push({ x: bx, y: by, w: bw, h: bh, pick: o.pick });
    }
  }
  function drawDone(w, h) {
    ctx.fillStyle = 'rgba(6,8,12,0.62)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffcf5c'; ctx.font = 'bold 30px system-ui'; ctx.textAlign = 'center'; ctx.fillText('🏁 EXPEDITION COMPLETE', w / 2, h / 2 - 18);
    ctx.fillStyle = '#eafff5'; ctx.font = '15px system-ui'; ctx.fillText('⚔ ' + S.kills + ' kills   🪙 ' + S.ronke + ' RONKE   ✨ ' + S.xp + ' XP', w / 2, h / 2 + 12);
    ctx.fillStyle = '#bcae90'; ctx.font = '13px system-ui'; ctx.fillText('Tap ✕ to return home. (prototype)', w / 2, h / 2 + 40);
  }

  // ── helpers ────────────────────────────────────────────────────────
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function wrap(text, cx, y, maxw, lh) {
    var words = text.split(' '), line = '', yy = y;
    for (var i = 0; i < words.length; i++) { var test = line + words[i] + ' '; if (ctx.measureText(test).width > maxw && line) { ctx.fillText(line.trim(), cx, yy); line = words[i] + ' '; yy += lh; } else line = test; }
    ctx.fillText(line.trim(), cx, yy);
  }

  var _closeBtn = null;
  function onClick(ev) {
    var r = cv.getBoundingClientRect();
    var x = (ev.clientX - r.left) * (Wlog / r.width), y = (ev.clientY - r.top) * (Hlog / r.height);
    if (S.paused && S.choice) { for (var i = 0; i < _choiceBtns.length; i++) { var b = _choiceBtns[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { try { b.pick(); } catch (e) {} S.paused = false; S.choice = null; return; } } return; }
    if (_closeBtn && x >= _closeBtn.x && x <= _closeBtn.x + _closeBtn.w && y >= _closeBtn.y && y <= _closeBtn.y + _closeBtn.h) close();
  }
  function resize() {
    if (!cv) return;
    DPR = W.devicePixelRatio || 1;
    var cssW = overlay.clientWidth || W.innerWidth, cssH = overlay.clientHeight || W.innerHeight;
    Wlog = cssW; Hlog = cssH;
    cv.width = Math.round(cssW * DPR); cv.height = Math.round(cssH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  // fixed-timestep accumulator loop with clamp + hit-stop (Gaffer "Fix Your Timestep")
  function loop(ts) {
    if (!running) return;
    if (!last) last = ts;
    var ft = (ts - last) / 1000; last = ts; if (ft > 0.25) ft = 0.25;
    accum += ft;
    while (accum >= DT) { if (S.hitstop > 0) { S.hitstop -= DT; if (S.hitstop < 0) S.hitstop = 0; } else update(DT); accum -= DT; }
    draw();
    raf = W.requestAnimationFrame(loop);
  }
  function build() {
    overlay = D.createElement('div'); overlay.id = 'afk-scene';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;display:none;background:#0a0d10';
    cv = D.createElement('canvas'); cv.style.cssText = 'width:100%;height:100%;display:block;cursor:pointer;image-rendering:pixelated';
    overlay.appendChild(cv); D.body.appendChild(overlay); ctx = cv.getContext('2d');
    cv.addEventListener('click', onClick); W.addEventListener('resize', resize);
  }
  function open() {
    if (!overlay) build();
    overlay.style.display = 'block'; resize(); reset(); running = true; last = 0; accum = 0;
    raf = W.requestAnimationFrame(loop);
    loadRegisteredSquad();   // swap demo squad → player's registered NFT battle squad (async)
    try { W.SFX && SFX.play && SFX.play(520, 0.09, 0.05, 'square', 120); } catch (e) {}
  }
  function close() { running = false; if (raf) W.cancelAnimationFrame(raf); if (overlay) overlay.style.display = 'none'; }

  W.afkExpedition = { open: open, close: close };
})();
