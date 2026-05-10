// floor12_merge.js — F12 "Merge Forge Combat"
// Inspiracija: Suika Game (TomboFry/suika-game) + tavo dice roguelike screenshot
// Layout: lane'ai virsuje (kova), arena apaciuje (top-down view su 3/4 tilt'u)
// Launcher: vidury kairej arenos puses, fires into arena (top-down fizika)
(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────
  const TYPES = ['arrow', 'shield', 'heart'];
  const TYPE_COLOR = {
    arrow:  { top: [255, 200, 110], front: [220, 150, 70], right: [180, 110, 50], left: [120, 70, 30], back: [80, 45, 18], bot: [40, 22, 8], glyph: '#3a1f08' },
    shield: { top: [180, 230, 220], front: [110, 180, 175], right: [70, 140, 140], left: [40, 95, 100], back: [25, 60, 65], bot: [10, 28, 32], glyph: '#06262a' },
    heart:  { top: [255, 170, 180], front: [220, 90, 100], right: [175, 55, 65], left: [115, 30, 38], back: [70, 14, 20], bot: [30, 6, 10], glyph: '#3a0a10' },
  };

  // Combat — 6 lane'ai, retas spawn (maža priešų masė)
  const LANES = 6;
  const BASE_HP = 30;
  const ENEMY_SPAWN_MS = 9500;    // ~10 sekundžių tarp spawn'ų

  // Top-down physics — bilijardo style: žemai sliding, aukšto greitis ridenasi ilgiau
  const FRICTION_HIGH = 0.985;    // mažai trinties kai juda greitai (rutuliukas ridenasi)
  const FRICTION_LOW = 0.86;      // stipri trintis kai jau lėtas (sustoja greitai)
  const FRICTION_THRESHOLD = 30;  // virš šio greičio — low friction (rolling)
  const STOP_VEL = 5;             // mažesnis stop threshold — leidžia mažai motion'ui likti
  const COLLISION_ROLL_KICK = 0.06;// kontaktas → rolled boost'as nepriklausomai nuo motion magnitude
  const WALL_RESTITUTION = 0.40;
  const BLOCK_RESTITUTION = 0.88;     // šiek tiek mažiau bouncy
  const BLOCK_TANGENT_FRICTION = 0.05;
  const COLLISION_KICK_BOOST = 1.00;  // be boost'o — natūralu billiards
  // Gradient position correction (ne instant snap) — Box2D-style slop + percent
  const POS_CORRECT_PCT = 0.30;       // 30% overlap'o pašalinama per frame (ne visi 100%)
  const POS_CORRECT_SLOP = 0.5;       // mažesnis overlap toleruojamas (sumažina jitter)
  // Merge shockwave — vidutinis pop (mazintas 50% nuo perdėto)
  const MERGE_JUMP_VZ = 500;          // vertikalus šuolis (vidurkis tarp 380 ir 700)
  const MERGE_SHOCK_FORCE = 1300;     // radial force (vidurkis tarp 850 ir 1800)
  const MERGE_SHOCK_RADIUS_MULT = 4.5;// paveikimo radius (vidurkis tarp 3.5 ir 5.5)
  // Flight (Z) — didesnis pirmas bounce, kiekvienas paskesnis silpnesnis
  const Z_GRAVITY = 1700;
  const Z_BOUNCE = 0.58;          // anksčiau 0.42 — dabar didesni atšokimai
  const Z_BOUNCE_MIN_VZ = 80;     // šiek tiek aukštesnis threshold — greičiau galutinai sustoja
  const BOUNCE_XY_DAMP = 0.55;    // per bounce, XY judejimo dauginama (anksčiau 0.88 — dabar agresyvi)
  const FIRE_SPEED_MIN = 380;     // tap → silpnas šūvis
  const FIRE_SPEED_MAX = 1500;    // hold full charge → galingas
  const CHARGE_FULL_MS = 1100;    // kiek laiko reikia pilnam charge
  const FIRE_COOLDOWN_MS = 220;
  const BASE_R = 17;             // mažesnis — atitinka preview ant patrankos
  const MAX_BLOCKS = 80;
  const TOP_TILT = 0.58;          // tilt — top + front matomi balansuotai (kaip referenciniam screenshot)
  // Settling — kai cube sulėtėja, traukia į face-forward + per-dice unikalų ofsetą
  // Tai užtikrina: 1) visada stabili poza (ne ant kampo), 2) varied rotation (ne identiški)
  const ANG_FRICTION = 0.94;
  const ANG_STOP_VEL = 0.05;
  const SETTLE_TRIGGER_VEL = 3.5;     // kai spin <šito → settling spring
  const SETTLE_STIFFNESS = 35;
  const SETTLE_DAMPING = 9.0;         // slight under-damp for natural wobble
  const SETTLE_SNAP_EPS = 0.008;
  const REST_JITTER_RANGE = 0.60;     // ±0.30 rad ≈ ±17° per-dice ofsetas (variacijai)
  // 3D tumble — kubai sukasi visom ašim ore, ant grindų X/Z ašys flat'inasi
  const TUMBLE_FLAT_STIFFNESS = 50;   // spring traukia rotX, rotZ → 0 (lay flat)
  const TUMBLE_FLAT_DAMPING = 12;     // damping (kritinis — be wobble)

  // ── State ──────────────────────────────────────────────────────────
  let canvas = null, ctx = null;
  let active = false;
  let raf = 0;
  let lastTime = 0;

  // Combat
  let lanes = [];
  let baseHp = BASE_HP;
  let nextEnemyAt = 0;
  let pendingActions = [];
  let laneEffects = [];
  // Deploy panel — F12 self-contained unit'ai
  let deployPool = {};                  // { utype: count, ... }
  let selectedDeployType = null;
  let deployBtnRects = [];
  let _nextUnitRegenAt = 0;             // kada kitas unit pasipildys
  const UNIT_REGEN_MS = 5000;           // +1 unit kas 5 sekundes
  const UNIT_MAX_PER_TYPE = 25;         // max kiek vienos rūšies kaupiasi
  const UNIT_TYPES = ['skull', 'archer', 'shaman', 'harpoon_fish'];

  // Physics
  let blocks = [];
  let nextId = 1;
  let launcher = { x: 0, y: 0, angle: 0 };
  let nextBlock = null;
  let lastFireAt = 0;
  let charging = false;
  let chargeStartedAt = 0;

  // Generic
  let score = 0;
  let merges = 0;
  let layoutCache = null;
  let mouse = { x: 0, y: 0 };
  let exitBtnRect = null;
  let restartBtnRect = null;
  let gameOver = false;

  // ── Helpers ────────────────────────────────────────────────────────
  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rand(arr.length)]; }
  function now() { return performance.now(); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function radiusForValue(v) {
    const tier = Math.log2(v);
    return BASE_R * (1 + (tier - 1) * 0.18);
  }

  function makeBlock(type, value, x, y, vx, vy, vz) {
    const r = radiusForValue(value);
    return {
      id: nextId++,
      type, value, x, y, vx: vx || 0, vy: vy || 0,
      z: 0,
      vz: vz || 0,
      airborne: (vz || 0) > 0,
      r,
      mass: r * r * 0.001,
      spawnedAt: now(),
      mergeBoom: null,
      landImpact: null,
      glow: 0,
      _mergedThisStep: false,
      // 3D rotation state — kubas turi visas 3 ašis, gali tumble laisvai
      rotX: 0, rotY: Math.random() * Math.PI * 2, rotZ: 0,
      angVelX: 0, angVelY: 0, angVelZ: 0,
      // Unikalus rest offset — kiekvienas dice nusistos savo mažu Y kampu (variacijai)
      restJitter: (Math.random() - 0.5) * REST_JITTER_RANGE,
    };
  }

  function makeNextBlock() {
    const v = Math.random() < 0.80 ? 2 : 4;
    return { type: pick(TYPES), value: v };
  }

  function initState() {
    blocks = [];
    score = 0;
    merges = 0;
    nextBlock = makeNextBlock();
    lanes = [];
    for (let i = 0; i < LANES; i++) lanes.push({ shieldUntil: 0, enemies: [], allies: [] });
    baseHp = BASE_HP;
    nextEnemyAt = now() + 1500;
    pendingActions = [];
    laneEffects = [];
    gameOver = false;
    selectedDeployType = null;
    // F12 deploy pool: pradedam su default base + pridedam trained iš HOME barracks
    deployPool = { skull: 5, archer: 4, shaman: 3, harpoon_fish: 3 };
    // Užkraunam Profile.barracksTrained (HOME treniruoti unit'ai) į F12 pool
    try {
      if (Profile && Array.isArray(Profile.barracksTrained)) {
        for (const s of Profile.barracksTrained) {
          if (!s || !s.utype) continue;
          // Skip non-infantry (towers, zips negali eiti į lane'ą)
          if (s.utype === 'tower' || s.utype === 'crossbow_tower' || s.utype === 'zip') continue;
          // Tik žinomi tipai (skull/archer/shaman/harpoon_fish)
          if (UNIT_TYPES.indexOf(s.utype) === -1) continue;
          deployPool[s.utype] = (deployPool[s.utype] || 0) + 1;
        }
      }
    } catch (_) {}
    _nextUnitRegenAt = now() + UNIT_REGEN_MS;
    // Restart išvalo smėlio žymes
    if (_marksCtx && _marksCanvas) {
      _marksCtx.clearRect(0, 0, _marksCanvas.width, _marksCanvas.height);
    }
  }

  // ── Layout ─────────────────────────────────────────────────────────
  function computeLayout() {
    const W = canvas.width, H = canvas.height;
    const lanesY = 14;
    const lanesH = Math.floor(H * 0.40);
    const arenaY = lanesY + lanesH + 12;
    const arenaH = H - arenaY - 56;
    const padX = 24;
    const aw = W - padX * 2;
    return {
      W, H,
      lanesX: padX, lanesY, lanesW: aw, lanesH,
      laneH: Math.floor((lanesH - 6) / LANES),
      arena: { x: padX, y: arenaY, w: aw, h: arenaH },
      launcher: { x: padX + 60, y: arenaY + arenaH / 2 },
    };
  }

  // ── Pixel art sphere render — diskretūs shading bands, hard edges
  // 5-banding sistema pagal Lambertian diffuse iš sferinio normal'o.
  // PX = 2 px chunk size (chunky pixel art). Cache'avimas per type+size derinį.
  const PIXEL_SIZE = 2;
  const _spriteCache = new Map();

  function _getPixelSphereSprite(type, r) {
    // Cache key — type + integer radius (groups similar sizes)
    const ri = Math.max(4, Math.round(r));
    const key = type + ':' + ri;
    if (_spriteCache.has(key)) return _spriteCache.get(key);

    const col = TYPE_COLOR[type] || TYPE_COLOR.arrow;
    // 5 spalvų lygiai (nuo tamsiausio iki šviesiausio)
    const bands = [
      [Math.max(0, col.left[0] - 30), Math.max(0, col.left[1] - 30), Math.max(0, col.left[2] - 30)],  // 0: edge dark
      col.left,    // 1: shadow side
      col.front,   // 2: front
      col.top,     // 3: top
      [Math.min(255, col.top[0] + 50), Math.min(255, col.top[1] + 50), Math.min(255, col.top[2] + 50)], // 4: highlight
    ];

    // Light direction (normalized, pointing INTO surface from upper-left out of screen)
    const lx = -0.45, ly = -0.55, lz = 0.70;
    const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const Lx = lx / ll, Ly = ly / ll, Lz = lz / ll;

    const sz = (ri + 1) * 2;  // sprite size (extra pixel padding)
    const off = document.createElement('canvas');
    off.width = sz;
    off.height = sz;
    const octx = off.getContext('2d');
    const cc = sz / 2;

    const PX = PIXEL_SIZE;
    for (let dy = -ri; dy <= ri; dy += PX) {
      for (let dx = -ri; dx <= ri; dx += PX) {
        const distSq = dx * dx + dy * dy;
        if (distSq > ri * ri) continue;
        // Surface normal at this pixel (sphere)
        const nx = dx / ri;
        const ny = dy / ri;
        const nz2 = 1 - nx * nx - ny * ny;
        const nz = nz2 > 0 ? Math.sqrt(nz2) : 0;
        // Diffuse intensity (Lambertian)
        const intensity = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
        // Edge darkening — ties pakraščiu (kai dist arti r) sumažina lygį
        const edgeFactor = 1 - distSq / (ri * ri);  // 1 centre, 0 at edge
        const adjIntensity = intensity * (0.5 + 0.5 * edgeFactor);
        // Diskretizuojam į 5 bands
        let band;
        if (adjIntensity > 0.85) band = 4;
        else if (adjIntensity > 0.55) band = 3;
        else if (adjIntensity > 0.30) band = 2;
        else if (adjIntensity > 0.10) band = 1;
        else band = 0;
        const [bR, bG, bB] = bands[band];
        octx.fillStyle = `rgb(${bR},${bG},${bB})`;
        octx.fillRect(cc + dx, cc + dy, PX, PX);
      }
    }

    // Marker pašalintas iš sprite'o — piešiamas dynamiškai drawSphere

    // Specular highlight — viršutiniam-kairiajam quadrant'e
    const hxC = cc + Math.round(-ri * 0.42 / PX) * PX;
    const hyC = cc + Math.round(-ri * 0.45 / PX) * PX;
    octx.fillStyle = 'rgb(255,255,255)';
    octx.fillRect(hxC, hyC, PX, PX);
    octx.fillRect(hxC + PX, hyC, PX, PX);
    octx.fillRect(hxC, hyC + PX, PX, PX);

    // Outer dark outline (1 pixel) — for crisp pixel art look
    octx.strokeStyle = 'rgba(20,8,2,0.85)';
    octx.lineWidth = 1;
    octx.beginPath();
    octx.arc(cc, cc, ri, 0, Math.PI * 2);
    octx.stroke();

    const sprite = { canvas: off, size: sz, ri };
    _spriteCache.set(key, sprite);
    return sprite;
  }

  function drawSphere(ctx, cx, cy, r, motionAng, rolled, type, value, glow) {
    const sprite = _getPixelSphereSprite(type, r);
    const half = sprite.size / 2;
    ctx.imageSmoothingEnabled = false;
    // Sphere body — niekada nesisuka (lighting nuosekliai iš upper-left)
    ctx.drawImage(sprite.canvas, Math.round(cx - half), Math.round(cy - half));

    // ── DU dinaminiai marker'iai priešingoj pusėj — stipresnis ridenimosi efektas
    // Marker 1 phase = rolled/r, Marker 2 phase = rolled/r + π (priešingam taške)
    // Visible kai cos(phase) > 0. Vienas matomas viršuje, antras po sphere ir atvirkščiai.
    const basePhase = (rolled || 0) / Math.max(1, r);
    const mAng = motionAng || 0;
    const cosA = Math.cos(mAng), sinA = Math.sin(mAng);
    const col = TYPE_COLOR[type] || TYPE_COLOR.arrow;
    const mr = Math.max(0, col.left[0] - 50);
    const mg = Math.max(0, col.left[1] - 50);
    const mb = Math.max(0, col.left[2] - 50);
    const PX = PIXEL_SIZE;

    function _drawMarker(phaseOffset) {
      const phase = basePhase + phaseOffset;
      const cosP = Math.cos(phase);
      if (cosP <= 0) return;
      const sinP = Math.sin(phase);
      const offsetMag = sinP * r * 0.55;
      const mx = cx + cosA * offsetMag;
      const my = cy + sinA * offsetMag;
      const ms = Math.max(2, Math.round(r * 0.18 * (0.6 + 0.4 * cosP)));
      const sx = Math.round(mx / PX) * PX;
      const sy = Math.round(my / PX) * PX;
      ctx.save();
      ctx.globalAlpha = Math.max(0.25, cosP);
      ctx.fillStyle = `rgb(${mr},${mg},${mb})`;
      for (let dy = -ms; dy <= ms; dy += PX) {
        for (let dx = -ms; dx <= ms; dx += PX) {
          if (dx * dx + dy * dy > ms * ms) continue;
          ctx.fillRect(sx + dx, sy + dy, PX, PX);
        }
      }
      ctx.restore();
    }

    _drawMarker(0);          // primary marker
    _drawMarker(Math.PI);    // secondary marker (priešingoj pusėj)

    // Glow halo (merge metu)
    if (glow > 0.05) {
      ctx.save();
      ctx.globalAlpha = glow * 0.7;
      ctx.strokeStyle = 'rgba(255,230,140,0.9)';
      ctx.lineWidth = 3 + glow * 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── 3D dice render (paliktas backward compat — niekur nenaudojama)
  function drawDie(ctx, cx, cy, halfSize, rotX, rotY, rotZ, type, value, glow, scaleX, scaleY) {
    const r = halfSize;
    const cX = Math.cos(rotX), sX = Math.sin(rotX);
    const cY = Math.cos(rotY), sY = Math.sin(rotY);
    const cZ = Math.cos(rotZ), sZ = Math.sin(rotZ);
    const cam = TOP_TILT;
    const camC = Math.cos(cam), camS = Math.sin(cam);
    // Rotations applied in order: Z → Y → X, then camera tilt around X
    function proj(x, y, z) {
      // Z rotation
      let p1x = x * cZ - y * sZ;
      let p1y = x * sZ + y * cZ;
      let p1z = z;
      // Y rotation
      let p2x = p1x * cY + p1z * sY;
      let p2y = p1y;
      let p2z = -p1x * sY + p1z * cY;
      // X rotation
      let p3x = p2x;
      let p3y = p2y * cX - p2z * sX;
      let p3z = p2y * sX + p2z * cX;
      // Camera tilt (downward look)
      let qx = p3x;
      let qy = p3y * camC - p3z * camS;
      let qz = p3y * camS + p3z * camC;
      return { x: qx * scaleX, y: qy * scaleY, z: qz };
    }
    const raw = [
      [-r, -r, -r], [r, -r, -r], [r, -r, r], [-r, -r, r],
      [-r, r, -r], [r, r, -r], [r, r, r], [-r, r, r],
    ];
    const v = raw.map(([x, y, z]) => proj(x, y, z));
    const col = TYPE_COLOR[type] || TYPE_COLOR.arrow;
    const faces = [
      { idx: [3, 2, 6, 7], col: col.front, name: 'front' },
      { idx: [1, 0, 4, 5], col: col.back, name: 'back' },
      { idx: [2, 1, 5, 6], col: col.right, name: 'right' },
      { idx: [0, 3, 7, 4], col: col.left, name: 'left' },
      { idx: [0, 1, 2, 3], col: col.top, name: 'top' },
      { idx: [7, 6, 5, 4], col: col.bot, name: 'bot' },
    ];
    faces.forEach(f => {
      f.cz = f.idx.reduce((s, i) => s + v[i].z, 0) / 4;
      const [i0, i1, i2] = f.idx;
      f.vis = (v[i1].x - v[i0].x) * (v[i2].y - v[i0].y)
            - (v[i1].y - v[i0].y) * (v[i2].x - v[i0].x) > 0;
    });
    faces.sort((a, b) => a.cz - b.cz);

    ctx.save();
    ctx.translate(cx, cy);
    // Vidinis šešėlis pašalintas — naudojame tik drawBlockShadow ant grindų

    const edgeAlpha = (0.55 + 0.45 * glow).toFixed(2);
    faces.forEach(f => {
      if (!f.vis) return;
      const [fr, fg, fb] = f.col;
      ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
      ctx.strokeStyle = `rgba(20,12,4,${edgeAlpha})`;
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.beginPath();
      f.idx.forEach((vi, j) => {
        if (j === 0) ctx.moveTo(v[vi].x, v[vi].y);
        else ctx.lineTo(v[vi].x, v[vi].y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    const topFace = faces.find(f => f.name === 'top' && f.vis);
    if (topFace) {
      const t0 = v[topFace.idx[0]], t1 = v[topFace.idx[1]], t2 = v[topFace.idx[2]], t3 = v[topFace.idx[3]];
      const tcx = (t0.x + t1.x + t2.x + t3.x) / 4;
      const tcy = (t0.y + t1.y + t2.y + t3.y) / 4;
      // Skaičiai pašalinti — kubo tipą rodo tik glyph + spalva

      ctx.save();
      ctx.translate(tcx, tcy);
      const g = r * 0.40;
      ctx.fillStyle = col.glyph;
      ctx.strokeStyle = col.glyph;
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      if (type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(-g, 0); ctx.lineTo(g, 0);
        ctx.moveTo(g, 0); ctx.lineTo(g - g * 0.5, -g * 0.5);
        ctx.moveTo(g, 0); ctx.lineTo(g - g * 0.5, g * 0.5);
        ctx.stroke();
      } else if (type === 'shield') {
        ctx.beginPath();
        ctx.moveTo(0, -g);
        ctx.lineTo(g * 0.85, -g * 0.4);
        ctx.lineTo(g * 0.6, g * 0.7);
        ctx.lineTo(0, g);
        ctx.lineTo(-g * 0.6, g * 0.7);
        ctx.lineTo(-g * 0.85, -g * 0.4);
        ctx.closePath();
        ctx.fill();
      } else if (type === 'heart') {
        ctx.beginPath();
        ctx.moveTo(0, g * 0.6);
        ctx.bezierCurveTo(g, 0, g * 0.5, -g, 0, -g * 0.2);
        ctx.bezierCurveTo(-g * 0.5, -g, -g, 0, 0, g * 0.6);
        ctx.fill();
      }
      ctx.restore();
    }

    if (glow > 0.05) {
      ctx.globalAlpha = glow * 0.7;
      ctx.strokeStyle = 'rgba(255,230,140,0.9)';
      ctx.lineWidth = 3 + glow * 4;
      ctx.beginPath();
      ctx.ellipse(0, 0, halfSize * 1.25, halfSize * 1.05, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ── Physics (top-down + z-flight) ──────────────────────────────────
  function tickPhysics(dt) {
    if (gameOver) return;
    const dts = Math.min(dt, 32) / 1000;
    const L = layoutCache;
    if (!L) return;
    const A = L.arena;
    const tNow = now();

    for (const b of blocks) {
      // Z (aukštis)
      if (b.airborne || b.z > 0 || b.vz !== 0) {
        b.vz -= Z_GRAVITY * dts;
        b.z += b.vz * dts;
        if (b.z <= 0) {
          const impactSp = Math.abs(b.vz);
          b.z = 0;
          if (impactSp > Z_BOUNCE_MIN_VZ) {
            b.vz = impactSp * Z_BOUNCE;
            b.vx *= BOUNCE_XY_DAMP;
            b.vy *= BOUNCE_XY_DAMP;
            b.angVelX *= 0.55;
            b.angVelY *= 0.55;
            b.angVelZ *= 0.55;
          } else {
            b.vz = 0;
            b.airborne = false;
            b.vx *= 0.30;
            b.vy *= 0.30;
            b.angVelX *= 0.30;
            b.angVelY *= 0.30;
            b.angVelZ *= 0.30;
          }
          // ── SMĖLIO ŽYMĖ — kai impact stiprus, lieka pilkimasi grindyse
          if (impactSp > 150) {
            const intensity = Math.min(2.5, (impactSp - 100) / 200);
            const localX = b.x - A.x;
            const localY = b.y - A.y;
            if (localX > 0 && localX < A.w && localY > 0 && localY < A.h) {
              _addBounceMark(localX, localY, intensity);
            }
          }
        }
      }
      // XY judėjimo trintis
      if (b.z > 0) {
        // ORE — visos ašys sukasi laisvai, beveik be drag
        b.vx *= 0.998;
        b.vy *= 0.998;
        b.angVelX *= 0.998;
        b.angVelY *= 0.998;
        b.angVelZ *= 0.998;
      } else {
        // ANT GRINDŲ — bilijardo style: greitai = mazas friction (rolling), lėtai = stiprus (snap stop)
        const linSp = Math.hypot(b.vx, b.vy);
        let fr;
        if (linSp > FRICTION_THRESHOLD) {
          fr = FRICTION_HIGH;          // ridenasi
        } else if (linSp < 8) {
          fr = FRICTION_LOW;           // beveik sustojo — stipri trintis
        } else {
          // Smooth blend tarp aukštos ir žemos
          const k = (linSp - 8) / (FRICTION_THRESHOLD - 8);
          fr = FRICTION_LOW + (FRICTION_HIGH - FRICTION_LOW) * k;
        }
        b.vx *= fr;
        b.vy *= fr;
        if (linSp < STOP_VEL) { b.vx = 0; b.vy = 0; }

        // Angular friction (sukimasis nuo collision'ų irgi išgęsta — bet lėčiau, kad spin matytusi)
        b.angVelX *= 0.94;
        b.angVelZ *= 0.94;
        // Y angVel — atskirai nuo rolling. Friction lėtesnis kad post-collision spin tęstų.
        b.angVelY *= 0.96;

        if (Math.abs(b.angVelX) < 0.10) b.angVelX = 0;
        if (Math.abs(b.angVelY) < 0.10) b.angVelY = 0;
        if (Math.abs(b.angVelZ) < 0.10) b.angVelZ = 0;
      }
      b.x += b.vx * dts;
      b.y += b.vy * dts;
      // ROLLING — TIK ant grindų. Unsigned (visada didėja). Direction handle'ina drawSphere
      const _linSp = Math.hypot(b.vx, b.vy);
      if (_linSp > 0.3 && b.z === 0) {
        b.rolled = (b.rolled || 0) + _linSp * dts;
        b._lastMotionAng = Math.atan2(b.vy, b.vx);  // saugom paskutinę motion kryptį
      }
      // TRAIL — ore renkama trail pozicijų (skrendantis projektilas)
      if (b.z > 0 && _linSp > 80) {
        b._trail = b._trail || [];
        b._trail.push({ x: b.x, y: b.y - b.z, t: tNow });
        while (b._trail.length > 7) b._trail.shift();
      } else if (b._trail && b._trail.length > 0 && b.z === 0) {
        b._trail = null;  // pašalinam trail kai nusileido
      }
      // Visos 3 ašys integruojamos
      b.rotX += b.angVelX * dts;
      b.rotY += b.angVelY * dts;
      b.rotZ += b.angVelZ * dts;
    }

    // Wall collisions — tik on-ground blokai atsimuša į arenos sienas
    // (skrydyje virš arenos jie gali nuskristi šiek tiek per sienos riba — bet clamp'inam ekstremalius)
    for (const b of blocks) {
      if (b.z > 0) {
        const margin = 6;
        const visTop = 2 * b.r;
        if (b.x - b.r < A.x - margin) { b.x = A.x - margin + b.r; b.vx = Math.abs(b.vx) * 0.5; }
        if (b.x + b.r > A.x + A.w + margin) { b.x = A.x + A.w + margin - b.r; b.vx = -Math.abs(b.vx) * 0.5; }
        if (b.y - visTop < A.y - margin) { b.y = A.y - margin + visTop; b.vy = Math.abs(b.vy) * 0.5; }
        if (b.y > A.y + A.h + margin) { b.y = A.y + A.h + margin; b.vy = -Math.abs(b.vy) * 0.5; }
      } else {
        let bounced = false;
        // Top wall — sphere anchor'inta iš apačios, vizualus aukštis = 2*r
        const visTop = 2 * b.r;
        if (b.x - b.r < A.x) { b.x = A.x + b.r; b.vx = -b.vx * WALL_RESTITUTION; bounced = true; }
        if (b.x + b.r > A.x + A.w) { b.x = A.x + A.w - b.r; b.vx = -b.vx * WALL_RESTITUTION; bounced = true; }
        if (b.y - visTop < A.y) { b.y = A.y + visTop; b.vy = -b.vy * WALL_RESTITUTION; bounced = true; }
        if (b.y > A.y + A.h) { b.y = A.y + A.h; b.vy = -b.vy * WALL_RESTITUTION; bounced = true; }
        if (bounced) {
          const impactSp = Math.hypot(b.vx, b.vy);
          b.angVelY += (Math.random() - 0.5) * impactSp * 0.012;
        }
      }
    }

    // Block-block — tik kai abu yra ant grindų. Skrydyje jie praskrenda virš krūvos.
    // Mažiau iteracijų — kad nebūtų agresyvaus snap'inimo (gradient'inis approach)
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          const a = blocks[i], b = blocks[j];
          if (a.z > 0 || b.z > 0) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const minD = a.r + b.r;
          const distSq = dx * dx + dy * dy;
          if (distSq >= minD * minD) continue;
          const dist = Math.sqrt(distSq) || 0.0001;
          const overlap = minD - dist;
          const nx = dx / dist, ny = dy / dist;
          // Tangent vector (perpendicular to normal)
          const tx = -ny, ty = nx;
          const totalM = a.mass + b.mass;
          // GRADIENT position correction — Box2D-style slop + percent
          // Tik perteklinį overlap pašalinama, ir tik dalį per frame (ne instant)
          const corrAmount = Math.max(0, overlap - POS_CORRECT_SLOP) * POS_CORRECT_PCT;
          const aPush = corrAmount * (b.mass / totalM);
          const bPush = corrAmount * (a.mass / totalM);
          a.x -= nx * aPush; a.y -= ny * aPush;
          b.x += nx * bPush; b.y += ny * bPush;
          const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          const velAlongN = rvx * nx + rvy * ny;
          if (velAlongN < 0) {
            // Normal impulse — su BOOST'u (kad smūgis būtų jeutresnis)
            const e = BLOCK_RESTITUTION;
            const jn = -(1 + e) * velAlongN / (1 / a.mass + 1 / b.mass) * COLLISION_KICK_BOOST;
            const ix = jn * nx, iy = jn * ny;
            a.vx -= ix / a.mass; a.vy -= iy / a.mass;
            b.vx += ix / b.mass; b.vy += iy / b.mass;
            // ROLLING KICK — kontaktas matomai sukimąsi (nepriklausomai nuo motion'o magnitude)
            // Smulkūs prisilietimai irgi atrodo kaip ridenasi, ne pastumimas
            const impMag = Math.abs(jn);
            const rollK = impMag * COLLISION_ROLL_KICK;
            a.rolled = (a.rolled || 0) + rollK;
            b.rolled = (b.rolled || 0) + rollK;
            // Update motion angle pagal impulse kryptį (kad marker'is judėtų teisinga puse)
            // a stumiamas atgal į (-nx, -ny), b stumiamas pirmyn (+nx, +ny)
            a._lastMotionAng = Math.atan2(-ny, -nx);
            b._lastMotionAng = Math.atan2(ny, nx);
            // TANGENT FRICTION — minimalus drag
            const velTangent = rvx * tx + rvy * ty;
            const jt = -velTangent * BLOCK_TANGENT_FRICTION / (1 / a.mass + 1 / b.mass);
            a.vx -= jt * tx / a.mass; a.vy -= jt * ty / a.mass;
            b.vx += jt * tx / b.mass; b.vy += jt * ty / b.mass;
            // Angular impulse — vidutinis (mazintas 50% nuo perdėto)
            const impulseN = Math.abs(jn);
            const impulseT = Math.abs(jt);
            const spinKickY = impulseN * 0.0010 + impulseT * 0.0022;
            a.angVelY += (Math.random() - 0.5) * spinKickY * 2;
            b.angVelY += (Math.random() - 0.5) * spinKickY * 2;
            // Cross-axis (X, Z) — subtilesnis
            const spinKickXZ = impulseN * 0.0007;
            a.angVelX += (Math.random() - 0.5) * spinKickXZ * 2;
            a.angVelZ += (Math.random() - 0.5) * spinKickXZ * 2;
            b.angVelX += (Math.random() - 0.5) * spinKickXZ * 2;
            b.angVelZ += (Math.random() - 0.5) * spinKickXZ * 2;
            // Mažas vertical pop kai smūgis stiprus (sumazintas)
            if (impulseN > 80) {
              const popVz = Math.min(110, impulseN * 0.4);
              if (a.vz === 0 && a.z === 0) { a.vz = popVz * 0.5; a.airborne = true; }
              if (b.vz === 0 && b.z === 0) { b.vz = popVz * 0.5; b.airborne = true; }
            }
          }
        }
      }
    }

    resolveMerges();

    if (blocks.length >= MAX_BLOCKS) gameOver = true;
  }

  // ── Merge logic (Suika-stilius: collision detection) ──────────────
  function resolveMerges() {
    const toRemove = new Set();
    const toAdd = [];
    for (let i = 0; i < blocks.length; i++) {
      if (toRemove.has(i)) continue;
      const a = blocks[i];
      if (a._mergedThisStep) continue;
      if (a.z > 0) continue;        // ore nesijungia
      for (let j = i + 1; j < blocks.length; j++) {
        if (toRemove.has(j)) continue;
        const b = blocks[j];
        if (b._mergedThisStep) continue;
        if (b.z > 0) continue;
        if (a.type !== b.type || a.value !== b.value) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const minD = a.r + b.r;
        if (dx * dx + dy * dy >= (minD + 1) * (minD + 1)) continue;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const newVal = a.value * 2;
        // Merged kubas pradeda mažu inertiniu greičiu (vid. dviejų momentumai)
        const mvx = (a.vx + b.vx) / 2 * 0.4;
        const mvy = (a.vy + b.vy) / 2 * 0.4;
        const merged = makeBlock(a.type, newVal, mx, my, mvx, mvy);
        // VERTIKALUS ŠUOLIS — merge'inant kubas pakyla, kaip su pop'u
        merged.z = 0.1;
        merged.vz = MERGE_JUMP_VZ;
        merged.airborne = true;
        // RADIAL SHOCKWAVE — DIDELIS push šalia esantiems kubams
        const shockRadius = merged.r * MERGE_SHOCK_RADIUS_MULT;
        for (const other of blocks) {
          if (other === a || other === b) continue;
          if (other.z > merged.r) continue;
          const ddx = other.x - mx, ddy = other.y - my;
          const dd = Math.hypot(ddx, ddy);
          if (dd > shockRadius || dd < 0.001) continue;
          const falloff = 1 - dd / shockRadius;
          const fnx = ddx / dd, fny = ddy / dd;
          other.vx += fnx * MERGE_SHOCK_FORCE * falloff;
          other.vy += fny * MERGE_SHOCK_FORCE * falloff;
          // Vertikalus pop — šalia esantys pasokami (sumažinta)
          if (other.z === 0) {
            other.vz = 100 + falloff * 130;
            other.airborne = true;
          }
          // Vidutiniai angular kick'ai
          other.angVelY += (Math.random() - 0.5) * falloff * 7;
          other.angVelX += (Math.random() - 0.5) * falloff * 4;
          other.angVelZ += (Math.random() - 0.5) * falloff * 4;
        }
        merged.mergeBoom = {
          startedAt: now(),
          duration: 380 + Math.random() * 220,
        };
        // Merge spin kick — tik aplink vertikalią ašį
        merged.angVelY = (Math.random() - 0.5) * 5;
        merged._mergedThisStep = true;
        score += newVal;
        merges++;
        // Sparkle burst pašalintas
        onMerge(merged);
        toRemove.add(i); toRemove.add(j);
        toAdd.push(merged);
        break;
      }
    }
    if (toRemove.size === 0) return;
    blocks = blocks.filter((_, idx) => !toRemove.has(idx)).concat(toAdd);
    for (const b of blocks) b._mergedThisStep = false;
  }

  function xToLane(x) {
    const A = layoutCache.arena;
    const f = (x - A.x) / A.w;
    return Math.max(0, Math.min(LANES - 1, Math.floor(f * LANES)));
  }

  function onMerge(block) {
    const lane = xToLane(block.x);
    const tier = Math.log2(block.value);
    const power = Math.max(1, tier - 1);
    pendingActions.push({ runAt: now() + 220, type: block.type, lane, power });
  }

  function processPendingActions(t) {
    if (!pendingActions.length) return;
    const remaining = [];
    for (const a of pendingActions) {
      if (t < a.runAt) { remaining.push(a); continue; }
      const lane = lanes[a.lane];
      if (!lane) continue;
      if (a.type === 'arrow') {
        const target = lane.enemies.filter(e => !e.dead).sort((x, y) => x.x - y.x)[0];
        if (target) {
          target.hp -= a.power * 2;
          target.hitFlashUntil = t + 220;
          if (target.hp <= 0) {
            target.dead = true; target.deathStartedAt = t;
            score += 5 * a.power;
          }
        }
      } else if (a.type === 'shield') {
        lane.shieldUntil = Math.max(lane.shieldUntil, t + 2500 * a.power);
      } else if (a.type === 'heart') {
        baseHp = Math.min(BASE_HP, baseHp + a.power);
      }
      laneEffects.push({ type: a.type, lane: a.lane, startedAt: t, duration: 380, power: a.power });
    }
    pendingActions = remaining;
  }

  // ── Enemies ────────────────────────────────────────────────────────
  // Ally unit stats per type
  const ALLY_STATS = {
    skull:        { hp: 8,  dmg: 2, speed: 0.012, attackCooldown: 900 },
    archer:       { hp: 5,  dmg: 3, speed: 0.014, attackCooldown: 1100 },
    shaman:       { hp: 4,  dmg: 4, speed: 0.010, attackCooldown: 1300 },
    harpoon_fish: { hp: 7,  dmg: 3, speed: 0.011, attackCooldown: 1000 },
  };

  function spawnAlly(utype, laneIdx, t) {
    const stats = ALLY_STATS[utype] || ALLY_STATS.skull;
    lanes[laneIdx].allies.push({
      utype,
      x: 0.0,                     // pradeda nuo kairės (player base)
      hp: stats.hp, maxHp: stats.hp,
      dmg: stats.dmg,
      speed: stats.speed,
      attackCooldown: stats.attackCooldown,
      lastAttackAt: 0,
      hitFlashUntil: 0,
      dead: false, deathStartedAt: 0,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  function spawnEnemy(t) {
    const laneIdx = rand(LANES);
    const tier = Math.floor(t / 30000);
    lanes[laneIdx].enemies.push({
      x: 1.0,
      hp: 6 + tier, maxHp: 6 + tier,
      speed: 0.008 + Math.random() * 0.004,
      hitFlashUntil: 0,
      dead: false, deathStartedAt: 0,
      bobPhase: Math.random() * Math.PI * 2,
      guardUntil: 0,                  // kol kada guard'inasi (0 = nesidengia)
      idleUntil: 0,                   // kol kada idle (sustojo „pailsėt")
      nextThinkAt: t + 1500 + Math.random() * 2000,
    });
  }

  // ── Unit regeneration — kas UNIT_REGEN_MS, +1 atsitiktinio tipo unit
  function tickUnitRegen(t) {
    if (gameOver) return;
    if (t < _nextUnitRegenAt) return;
    _nextUnitRegenAt = t + UNIT_REGEN_MS;
    // Pasirink tipą su mažiausiai kiekiu (kad balansuotų)
    let pickType = UNIT_TYPES[Math.floor(Math.random() * UNIT_TYPES.length)];
    let minCnt = Infinity;
    for (const ut of UNIT_TYPES) {
      const c = deployPool[ut] || 0;
      if (c < minCnt) { minCnt = c; pickType = ut; }
    }
    deployPool[pickType] = Math.min(UNIT_MAX_PER_TYPE, (deployPool[pickType] || 0) + 1);
  }

  function tickEnemies(dt, t) {
    if (gameOver) return;
    if (t >= nextEnemyAt) {
      spawnEnemy(t);
      nextEnemyAt = t + ENEMY_SPAWN_MS - Math.min(1500, t / 120);
    }
    for (let li = 0; li < lanes.length; li++) {
      const Ln = lanes[li];
      const blocked = t < Ln.shieldUntil;
      // ── ALLIES (player units) — eina iš kairės į dešinę
      for (let i = Ln.allies.length - 1; i >= 0; i--) {
        const a = Ln.allies[i];
        if (a.dead) {
          if (t - a.deathStartedAt > 380) Ln.allies.splice(i, 1);
          continue;
        }
        // Surask artimiausią enemy savo lane'e
        let target = null;
        let bestDist = Infinity;
        for (const e of Ln.enemies) {
          if (e.dead) continue;
          const d = Math.abs(e.x - a.x);
          if (d < bestDist) { bestDist = d; target = e; }
        }
        const inMelee = target && bestDist < 0.10;       // melee range = 10% lane width
        if (inMelee) {
          // Attack target
          if (t - (a.lastAttackAt || 0) > a.attackCooldown) {
            target.hp -= a.dmg;
            target.hitFlashUntil = t + 200;
            a.lastAttackAt = t;
            if (target.hp <= 0) {
              target.dead = true;
              target.deathStartedAt = t;
              score += 5;
            }
          }
        } else {
          // Eina pirmyn
          a.x += a.speed * (dt / 1000);
          if (a.x >= 1.0) {
            // Pasiekė priešo bazę — dingsta (be reward'o)
            Ln.allies.splice(i, 1);
            continue;
          }
        }
        // Priešas atakuoja allies (jei melee range)
        if (target && bestDist < 0.10) {
          if (t - (target.lastAttackAt || 0) > 1200) {
            a.hp -= 1;
            a.hitFlashUntil = t + 200;
            target.lastAttackAt = t;
            if (a.hp <= 0) { a.dead = true; a.deathStartedAt = t; }
          }
        }
      }
      for (let i = Ln.enemies.length - 1; i >= 0; i--) {
        const e = Ln.enemies[i];
        if (e.dead) {
          if (t - e.deathStartedAt > 380) Ln.enemies.splice(i, 1);
          continue;
        }
        // ── State machine: walking | guarding | idling
        const isGuarding = t < e.guardUntil;
        const isIdling = t < e.idleUntil;
        const isPaused = isGuarding || isIdling;
        if (!isPaused && t >= (e.nextThinkAt || 0)) {
          e.nextThinkAt = t + 1500 + Math.random() * 2500;
          const r = Math.random();
          if (r < 0.18) {
            // 18% guard (block pose, trumpa)
            e.guardUntil = t + 700 + Math.random() * 1000;
          } else if (r < 0.40) {
            // 22% idle (sustojo pailsėt, ilgesnis sustojimas)
            e.idleUntil = t + 1500 + Math.random() * 1800;  // 1.5-3.3s
          }
        }
        // Patikrink ar sutinka ally (jei taip — sustok ir muškis)
        let allyTarget = null;
        let bestAllyDist = Infinity;
        for (const a of Ln.allies) {
          if (a.dead) continue;
          const d = Math.abs(a.x - e.x);
          if (d < bestAllyDist) { bestAllyDist = d; allyTarget = a; }
        }
        const inMelee = allyTarget && bestAllyDist < 0.10;
        // Judėjimas TIK walking metu IR ne melee
        if (!blocked && !isPaused && !inMelee) {
          e.x -= e.speed * (dt / 1000);
        }
        if (e.x <= 0) {
          baseHp -= 3;
          Ln.enemies.splice(i, 1);
          if (baseHp <= 0) { baseHp = 0; gameOver = true; }
        }
      }
    }
  }

  // ── Launcher ───────────────────────────────────────────────────────
  // Grąžina 0..1 priklausomai nuo to, kiek laiko hold'inta
  function getChargeLevel() {
    if (!charging) return 0;
    const dt = now() - chargeStartedAt;
    return clamp(dt / CHARGE_FULL_MS, 0, 1);
  }

  // power: 0..1
  function fire(power) {
    const t = now();
    if (t - lastFireAt < FIRE_COOLDOWN_MS) return;
    if (blocks.length >= MAX_BLOCKS) return;
    if (gameOver) return;
    lastFireAt = t;
    const lx = launcher.x, ly = launcher.y;
    const ang = launcher.angle;
    const r = radiusForValue(nextBlock.value);
    const sx = lx + Math.cos(ang) * (r + 8);
    const sy = ly + Math.sin(ang) * (r + 8);
    const p = clamp(power, 0, 1);
    const speed = lerp(FIRE_SPEED_MIN, FIRE_SPEED_MAX, p);
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;
    // Vertikalus impulsas — žemesni metimui (mažas charge) trumpa arka, didesni — aukštas šuolis
    const vz = lerp(420, 950, p);
    const blk = makeBlock(nextBlock.type, nextBlock.value, sx, sy, vx, vy, vz);
    blk.airborne = true;
    // 3D tumble — visos 3 ašys gauna random angular velocity (ore kubas verčiasi visomis kryptim)
    const spinScale = lerp(2.5, 9.0, p);
    blk.angVelX = (Math.random() - 0.5) * 2 * spinScale;
    blk.angVelY = (Math.random() - 0.5) * 2 * spinScale;
    blk.angVelZ = (Math.random() - 0.5) * 2 * spinScale;
    // Pradinis pasvyrimas X ir Z — kubas iškart "neuzmautas ant iesmo"
    blk.rotX = (Math.random() - 0.5) * 0.6;
    blk.rotZ = (Math.random() - 0.5) * 0.6;
    blocks.push(blk);
    nextBlock = makeNextBlock();
  }

  function updateLauncherAim() {
    const L = layoutCache;
    if (!L) return;
    launcher.x = L.launcher.x;
    launcher.y = L.launcher.y;
    const dx = mouse.x - launcher.x;
    const dy = mouse.y - launcher.y;
    let ang = Math.atan2(dy, dx);
    // Launcher kairej arenos puses → desinis pusrutulis
    const LIM = (80 * Math.PI) / 180;
    if (ang > LIM) ang = LIM;
    if (ang < -LIM) ang = -LIM;
    if (dx < 0) ang = (dy < 0) ? -LIM : LIM;
    launcher.angle = ang;
  }

  // ── Render ─────────────────────────────────────────────────────────
  function render(t) {
    layoutCache = computeLayout();
    const L = layoutCache;
    ctx.clearRect(0, 0, L.W, L.H);

    drawDirtBackground(L);
    drawLanes(L, t);
    drawDeployPanel(L, t);     // DRAW AFTER lanes — virš jų rodoma
    drawLaneEffects(L, t);
    drawArena(L);
    drawAimLine(L);
    drawBlocks(L, t);
    drawLauncher(L, t);
    drawPowerMeter(L);
    drawNextPreview(L, t);
    drawHud(L, t);
    // drawBursts pašalintas
    if (gameOver) drawGameOver(L);
  }

  // ── Pixel art outer dirt background (lauko ploto aplink areną)
  let _bgCache = null;
  function _buildBgSprite(W, H) {
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const oc = off.getContext('2d');
    const PX = PIXEL_SIZE;
    // Base solid (tamsiai rudas)
    oc.fillStyle = '#2a1808';
    oc.fillRect(0, 0, W, H);
    // Pixel pattern variations
    for (let y = 0; y < H; y += PX) {
      for (let x = 0; x < W; x += PX) {
        const h = _pxHash(x + 1000, y + 2000);
        if (h < 0.05) { oc.fillStyle = '#1a0e04'; oc.fillRect(x, y, PX, PX); }
        else if (h < 0.10) { oc.fillStyle = '#3a2210'; oc.fillRect(x, y, PX, PX); }
      }
    }
    // Outer pixel border (4 layers — pixel art frame around viewport)
    oc.fillStyle = '#1a0c04';
    oc.fillRect(0, 0, W, 2);
    oc.fillRect(0, H - 2, W, 2);
    oc.fillRect(0, 0, 2, H);
    oc.fillRect(W - 2, 0, 2, H);
    oc.fillStyle = '#3a2210';
    oc.fillRect(2, 2, W - 4, 2);
    oc.fillRect(2, H - 4, W - 4, 2);
    oc.fillRect(2, 2, 2, H - 4);
    oc.fillRect(W - 4, 2, 2, H - 4);
    return { canvas: off, w: W, h: H };
  }
  function drawDirtBackground(L) {
    if (!_bgCache || _bgCache.w !== L.W || _bgCache.h !== L.H) {
      _bgCache = _buildBgSprite(L.W, L.H);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(_bgCache.canvas, 0, 0);
  }

  function drawLanes(L, t) {
    const baseW = 24;
    for (let i = 0; i < LANES; i++) {
      const ly = L.lanesY + i * L.laneH;
      const lh = L.laneH - 4;
      // Lane track (alternating shades)
      ctx.fillStyle = i % 2 === 0 ? '#52382a' : '#5a3e2e';
      ctx.fillRect(L.lanesX, ly, L.lanesW, lh);
      // Lane border (top/bottom 1px)
      ctx.fillStyle = '#3a2410';
      ctx.fillRect(L.lanesX, ly, L.lanesW, 1);
      ctx.fillRect(L.lanesX, ly + lh - 1, L.lanesW, 1);
      // Player base (left)
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(L.lanesX, ly, baseW, lh);
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(L.lanesX + 4, ly + 4, baseW - 8, lh - 8);
      ctx.fillStyle = '#1a1208';
      const tw = Math.min(10, lh - 14);
      ctx.fillRect(L.lanesX + (baseW - tw) / 2, ly + lh / 2 - tw / 2, tw, tw);
      const lane = lanes[i];
      if (t < lane.shieldUntil) {
        ctx.fillStyle = `rgba(110,200,210,${0.18 + 0.10 * Math.sin(t * 0.01)})`;
        ctx.fillRect(L.lanesX + baseW, ly, L.lanesW - baseW, lh);
        ctx.strokeStyle = `rgba(160,235,235,${0.5 + 0.4 * Math.sin(t * 0.01)})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(L.lanesX + baseW, ly + 1, L.lanesW - baseW - 2, lh - 2);
      }
      // Allies (player units) — eina iš kairės
      for (const a of lane.allies) {
        const ax = L.lanesX + baseW + (L.lanesW - baseW - 30) * a.x;
        const ay = ly + lh / 2;
        drawAlly(ax, ay, lh * 0.50, a, t);
      }
      for (const e of lane.enemies) {
        const ex = L.lanesX + baseW + (L.lanesW - baseW - 30) * e.x;
        const ey = ly + lh / 2;
        drawEnemy(ex, ey, lh * 0.50, e, t);
      }
      ctx.fillStyle = 'rgba(255,220,160,0.40)';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('L' + (i + 1), L.lanesX + L.lanesW - 4, ly + 9);
    }
  }

  // ── Pixel art skull pattern (11×10 grid). 0=transparent, 1=bone, 2=dark hole, 3=highlight, 4=shadow
  const SKULL_PATTERN = [
    [0,0,0,1,1,1,1,1,0,0,0],
    [0,0,1,3,3,1,1,1,1,0,0],
    [0,1,1,3,3,1,1,1,1,1,0],
    [1,1,2,2,2,1,2,2,2,1,1],
    [1,1,2,2,2,1,2,2,2,1,1],
    [1,1,1,1,1,2,1,1,1,1,1],
    [1,1,1,1,2,2,1,1,1,1,1],
    [4,1,1,1,1,1,1,1,1,1,4],
    [0,1,2,1,2,1,2,1,2,1,0],
    [0,4,1,4,1,4,1,4,1,4,0],
  ];
  const SKULL_COLORS = {
    1: 'rgb(225,215,195)',   // bone
    2: 'rgb(28,18,10)',      // dark hole (eyes, nose, teeth gaps)
    3: 'rgb(245,235,215)',   // highlight
    4: 'rgb(170,158,140)',   // shadow
  };
  const SKULL_COLORS_FLASH = {
    1: 'rgb(255,180,140)',
    2: 'rgb(120,40,20)',
    3: 'rgb(255,220,180)',
    4: 'rgb(220,140,100)',
  };

  // Skull sprite cache — pre-rendered offscreen canvas per (scale, flash) deriniui
  const _skullSpriteCache = new Map();
  function _getSkullSprite(scale, flash) {
    const key = scale + ':' + (flash ? '1' : '0');
    if (_skullSpriteCache.has(key)) return _skullSpriteCache.get(key);
    const PX = Math.max(1, Math.round(scale));
    const rows = SKULL_PATTERN.length;
    const cols = SKULL_PATTERN[0].length;
    const off = document.createElement('canvas');
    off.width = cols * PX;
    off.height = rows * PX;
    const oc = off.getContext('2d');
    oc.imageSmoothingEnabled = false;
    const palette = flash ? SKULL_COLORS_FLASH : SKULL_COLORS;
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        const v = SKULL_PATTERN[r][cc];
        if (v === 0) continue;
        oc.fillStyle = palette[v];
        oc.fillRect(cc * PX, r * PX, PX, PX);
      }
    }
    const sprite = { canvas: off, w: off.width, h: off.height };
    _skullSpriteCache.set(key, sprite);
    return sprite;
  }

  // Ally render — naudoja skull sprite, bet su mėlynu tint'u
  function drawAlly(cx, cy, sz, a, t) {
    const flash = t < a.hitFlashUntil;
    const fade = a.dead ? Math.max(0, 1 - (t - a.deathStartedAt) / 380) : 1;
    let sheets = null;
    try { sheets = skullAnimSheets; } catch (_) {}
    const sheetObj = sheets && sheets.run;
    const useSheet = sheetObj && sheetObj.sheet && sheetObj.sheet.complete && sheetObj.sheet.naturalWidth > 0;
    if (useSheet) {
      const fps = 10;
      const frameCount = sheetObj.frameCount;
      const phaseOff = (a.bobPhase || 0) * 5;
      const idx = (Math.floor(t / (1000 / fps) + phaseOff) % frameCount + frameCount) % frameCount;
      const sw = 192, sh = 192;
      const sx = idx * sw;
      const dw = sz * 4.5;
      const dh = sz * 4.5;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.imageSmoothingEnabled = false;
      // Mėlynas tint allies (priešingai nuo enemy raudono flash)
      ctx.filter = flash
        ? 'brightness(1.4) sepia(1) saturate(2) hue-rotate(-30deg)'
        : 'sepia(1) saturate(3) hue-rotate(160deg) brightness(0.9)';
      // Allies žiūri į DEŠINĘ (sprite default), priešai į kairę
      ctx.drawImage(sheetObj.sheet, sx, 0, sw, sh, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.restore();
    }
    // HP bar
    if (!a.dead) {
      const bw = sz * 1.2, bh = 3;
      const barY = cy - sz * 1.0 - bh;
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(cx - bw / 2), Math.round(barY), Math.round(bw), bh);
      ctx.fillStyle = '#5cd06b';     // žalias HP bar (vs raudonas enemies)
      ctx.fillRect(Math.round(cx - bw / 2 + 1), Math.round(barY + 1), Math.round((bw - 2) * (a.hp / a.maxHp)), bh - 2);
    }
  }

  function drawEnemy(cx, cy, sz, e, t) {
    const flash = t < e.hitFlashUntil;
    const fade = e.dead ? Math.max(0, 1 - (t - e.deathStartedAt) / 380) : 1;
    // Pasirinkti animaciją pagal būseną: guard / idle / run
    const isGuarding = t < e.guardUntil;
    const isIdling = !isGuarding && t < e.idleUntil;
    let sheets = null;
    try { sheets = skullAnimSheets; } catch (_) {}
    const animKey = isGuarding ? 'guard' : (isIdling ? 'idle' : 'run');
    const sheetObj = sheets && sheets[animKey];
    const useSheet = sheetObj && sheetObj.sheet && sheetObj.sheet.complete && sheetObj.sheet.naturalWidth > 0;
    if (useSheet) {
      // SKULL_ANIM_FPS: idle=7, run=10, attack=12, guard=10
      const fps = isIdling ? 7 : 10;
      const frameCount = sheetObj.frameCount;
      const phaseOff = (e.bobPhase || 0) * 5;
      const idx = (Math.floor(t / (1000 / fps) + phaseOff) % frameCount + frameCount) % frameCount;
      const sw = 192, sh = 192;
      const sx = idx * sw;
      const dw = sz * 4.5;
      const dh = sz * 4.5;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.imageSmoothingEnabled = false;
      if (flash) {
        ctx.filter = 'brightness(1.5) sepia(1) saturate(2.5) hue-rotate(-30deg)';
      }
      ctx.translate(cx, cy);
      ctx.scale(-1, 1);
      ctx.drawImage(sheetObj.sheet, sx, 0, sw, sh, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else {
      const scale = Math.max(1, Math.round(sz * 0.30));
      const sprite = _getSkullSprite(scale, flash);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite.canvas,
        Math.round(cx - sprite.w / 2),
        Math.round(cy - sprite.h / 2));
      ctx.restore();
    }
    // HP bar (fixed virš skull, be bob)
    if (!e.dead) {
      const bw = sz * 1.2, bh = 3;
      const barY = cy - sz * 1.0 - bh;
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(cx - bw / 2), Math.round(barY), Math.round(bw), bh);
      ctx.fillStyle = '#cc2a2a';
      ctx.fillRect(Math.round(cx - bw / 2 + 1), Math.round(barY + 1), Math.round((bw - 2) * (e.hp / e.maxHp)), bh - 2);
    }
  }

  function drawLaneEffects(L, t) {
    const survive = [];
    for (const fx of laneEffects) {
      const k = (t - fx.startedAt) / fx.duration;
      if (k > 1) continue;
      const ly = L.lanesY + fx.lane * L.laneH;
      const lh = L.laneH - 6;
      if (fx.type === 'arrow') {
        const x0 = L.lanesX + 24;
        const x1 = L.lanesX + L.lanesW - 32;
        const x = lerp(x0, x1, k);
        ctx.save();
        ctx.translate(x, ly + lh / 2);
        ctx.fillStyle = '#ffe7a8';
        ctx.fillRect(-12, -1.5, 24, 3);
        ctx.beginPath();
        ctx.moveTo(12, 0); ctx.lineTo(7, -5); ctx.lineTo(7, 5); ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (fx.type === 'shield') {
        ctx.fillStyle = `rgba(160,235,235,${(1 - k) * 0.6})`;
        ctx.fillRect(L.lanesX + 28, ly, L.lanesW - 28, lh - 6);
      } else if (fx.type === 'heart') {
        const px = L.lanesX + 14;
        const py = ly + lh / 2 - 30 * k;
        ctx.fillStyle = `rgba(220,80,90,${1 - k})`;
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('+' + fx.power, px, py);
      }
      survive.push(fx);
    }
    laneEffects = survive;
  }

  // ── Pixel art arena cache — atvaizduojama vieną kartą, drawImage per frame
  let _arenaCache = null;
  // ── Floor marks (smėlio žymės) — kaupiasi į overlay canvas
  let _marksCanvas = null;
  let _marksCtx = null;
  let _marksKey = null;

  // Deterministinis pseudo-random hash pixel art tekstūroms
  function _pxHash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = ((h ^ (h >>> 13)) * 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function _buildArenaSprite(A) {
    const FRAME = 16;
    const PX = PIXEL_SIZE;
    const W = A.w + FRAME * 2;
    const H = A.h + FRAME * 2;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const oc = off.getContext('2d');
    oc.imageSmoothingEnabled = false;

    // ── WOOD FRAME PALETTE (5 atspalviai)
    const WOOD = {
      darkest:  '#1f0f04',
      dark:     '#3a1f0a',
      mid:      '#5e3818',
      light:    '#7a5028',
      highlight:'#9a6830',
      grain:    '#2d1808',
    };

    // Pilnas wood frame fill (darkest - outline)
    oc.fillStyle = WOOD.darkest;
    oc.fillRect(0, 0, W, H);
    // Inner mid wood
    oc.fillStyle = WOOD.mid;
    oc.fillRect(2, 2, W - 4, H - 4);

    // Top frame highlight (light source from upper-left)
    oc.fillStyle = WOOD.highlight;
    oc.fillRect(2, 2, W - 4, 4);
    oc.fillStyle = WOOD.light;
    oc.fillRect(2, 6, W - 4, 4);

    // Left frame highlight
    oc.fillStyle = WOOD.highlight;
    oc.fillRect(2, 2, 4, H - 4);
    oc.fillStyle = WOOD.light;
    oc.fillRect(6, 2, 4, H - 4);

    // Bottom frame shadow
    oc.fillStyle = WOOD.dark;
    oc.fillRect(2, H - 10, W - 4, 4);
    oc.fillStyle = WOOD.darkest;
    oc.fillRect(2, H - 6, W - 4, 4);

    // Right frame shadow
    oc.fillStyle = WOOD.dark;
    oc.fillRect(W - 10, 2, 4, H - 4);
    oc.fillStyle = WOOD.darkest;
    oc.fillRect(W - 6, 2, 4, H - 4);

    // Plank seams (vertical lines on top/bottom frames, horizontal on left/right)
    const PLANK = 32;
    oc.fillStyle = WOOD.grain;
    // Top + bottom frame: vertical plank seams
    for (let x = PLANK; x < W; x += PLANK) {
      oc.fillRect(x - 1, 2, 2, FRAME - 4);
      oc.fillRect(x - 1, H - FRAME + 2, 2, FRAME - 4);
    }
    // Left + right frame: horizontal plank seams
    for (let y = PLANK; y < H; y += PLANK) {
      oc.fillRect(2, y - 1, FRAME - 4, 2);
      oc.fillRect(W - FRAME + 2, y - 1, FRAME - 4, 2);
    }

    // Wood grain (1px dark lines along each plank — subtilus tekstūros pattern)
    oc.fillStyle = WOOD.grain;
    for (let i = 0; i < W; i += 2) {
      if (_pxHash(i, 7) < 0.18) {
        oc.fillRect(i, 11, 2, 1);   // top frame grain
        oc.fillRect(i, H - 12, 2, 1); // bottom
      }
    }
    for (let i = 0; i < H; i += 2) {
      if (_pxHash(13, i) < 0.18) {
        oc.fillRect(11, i, 1, 2);   // left frame grain
        oc.fillRect(W - 12, i, 1, 2); // right
      }
    }

    // Corner rivets/nails (dark dots in 4 corners)
    oc.fillStyle = WOOD.darkest;
    oc.fillRect(6, 6, 2, 2);
    oc.fillRect(W - 8, 6, 2, 2);
    oc.fillRect(6, H - 8, 2, 2);
    oc.fillRect(W - 8, H - 8, 2, 2);
    oc.fillStyle = WOOD.highlight;
    oc.fillRect(6, 6, 1, 1);  // shine on rivet
    oc.fillRect(W - 8, 6, 1, 1);

    // ── INNER SHADOW (kad rėmas atrodytų inset'as)
    const INNER_X = FRAME, INNER_Y = FRAME;
    const INNER_W = A.w, INNER_H = A.h;
    oc.fillStyle = WOOD.darkest;
    oc.fillRect(INNER_X - 2, INNER_Y - 2, INNER_W + 4, 2);   // top
    oc.fillRect(INNER_X - 2, INNER_Y + INNER_H, INNER_W + 4, 2); // bottom
    oc.fillRect(INNER_X - 2, INNER_Y, 2, INNER_H);            // left
    oc.fillRect(INNER_X + INNER_W, INNER_Y, 2, INNER_H);      // right

    // ── DIRT FLOOR PALETTE (4 atspalviai)
    const DIRT = {
      dark:   '#1a0d05',
      base:   '#3a2614',
      mid:    '#4e321c',
      light:  '#65442a',
      pebble: '#7a583a',
    };

    // Base fill
    oc.fillStyle = DIRT.base;
    oc.fillRect(INNER_X, INNER_Y, INNER_W, INNER_H);

    // Pixel art texture — chunk variations su deterministiniu hash'u
    for (let y = 0; y < INNER_H; y += PX) {
      for (let x = 0; x < INNER_W; x += PX) {
        const h = _pxHash(x, y);
        let color = null;
        if (h < 0.04) color = DIRT.light;       // scuff marks
        else if (h < 0.08) color = DIRT.dark;   // dark spots
        else if (h < 0.22) color = DIRT.mid;    // mid variation
        if (color) {
          oc.fillStyle = color;
          oc.fillRect(INNER_X + x, INNER_Y + y, PX, PX);
        }
      }
    }

    // Pebbles (small 2-3 pixel clusters scattered)
    const PEBBLE_COUNT = Math.floor((INNER_W * INNER_H) / 4500);
    for (let i = 0; i < PEBBLE_COUNT; i++) {
      const ph = _pxHash(i * 17, 31);
      const pv = _pxHash(i * 23, 47);
      const px = Math.floor(ph * (INNER_W - 6) / PX) * PX;
      const py = Math.floor(pv * (INNER_H - 6) / PX) * PX;
      const t = _pxHash(i * 11, 89);
      // Pebble shape (2-3 px cluster + dark side shadow)
      oc.fillStyle = t > 0.55 ? DIRT.pebble : DIRT.light;
      oc.fillRect(INNER_X + px, INNER_Y + py, PX, PX);
      oc.fillRect(INNER_X + px + PX, INNER_Y + py, PX, PX);
      oc.fillRect(INNER_X + px, INNER_Y + py + PX, PX, PX);
      // Dark shadow side (right-bottom)
      oc.fillStyle = DIRT.dark;
      oc.fillRect(INNER_X + px + PX * 2, INNER_Y + py + PX, PX, PX);
      oc.fillRect(INNER_X + px + PX, INNER_Y + py + PX * 2, PX, PX);
    }

    return { canvas: off, frame: FRAME, w: W, h: H };
  }

  function _getArenaSprite(A) {
    const key = A.x + '_' + A.y + '_' + A.w + '_' + A.h;
    if (_arenaCache && _arenaCache.key === key) return _arenaCache;
    const sprite = _buildArenaSprite(A);
    sprite.key = key;
    _arenaCache = sprite;
    return sprite;
  }

  function _ensureMarksCanvas(A) {
    const key = A.w + 'x' + A.h;
    if (_marksKey === key && _marksCanvas) return;
    _marksCanvas = document.createElement('canvas');
    _marksCanvas.width = A.w;
    _marksCanvas.height = A.h;
    _marksCtx = _marksCanvas.getContext('2d');
    _marksCtx.imageSmoothingEnabled = false;
    _marksKey = key;
  }

  // Pridedam subtilią sand-style impact mark (mažas efektas)
  function _addBounceMark(localX, localY, intensity) {
    if (!_marksCtx) return;
    const PX = PIXEL_SIZE;
    const radius = Math.max(2, Math.min(6, Math.floor(intensity * 3)));
    const cx = Math.round(localX / PX) * PX;
    const cy = Math.round(localY / PX) * PX;
    // Subtilus crater — mažesnis ir blyškesnis nei anksčiau
    for (let dy = -radius - 2; dy <= radius + 2; dy += PX) {
      for (let dx = -radius - 2; dx <= radius + 2; dx += PX) {
        const d = Math.sqrt(dx * dx + dy * dy);
        const t = d / radius;
        let color = null;
        if (t < 0.50) color = 'rgba(12, 6, 2, 0.30)';                  // crater core (sumažintas alpha)
        else if (t < 0.85) color = 'rgba(30, 18, 8, 0.18)';            // mid
        else if (t < 1.1 && _pxHash(cx + dx, cy + dy) < 0.40) color = 'rgba(85, 60, 35, 0.22)';  // sparse rim
        if (color) {
          _marksCtx.fillStyle = color;
          _marksCtx.fillRect(cx + dx, cy + dy, PX, PX);
        }
      }
    }
  }

  // Žymės palaipsniui blunka per laiką (destination-out fade)
  function _fadeMarks(dt) {
    if (!_marksCtx) return;
    // Per sekundę nubraukiam ~6% alpha (half-life ~10s, full fade ~30s)
    const fadeAlpha = 0.0010 * (dt / 16.67);  // proporcingai dt (60fps norm)
    if (fadeAlpha <= 0) return;
    _marksCtx.save();
    _marksCtx.globalCompositeOperation = 'destination-out';
    _marksCtx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
    _marksCtx.fillRect(0, 0, _marksCanvas.width, _marksCanvas.height);
    _marksCtx.restore();
  }

  function drawArena(L) {
    const A = L.arena;
    const sprite = _getArenaSprite(A);
    _ensureMarksCanvas(A);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite.canvas, A.x - sprite.frame, A.y - sprite.frame);
    // Marks overlay — accumuliuoja per žaidimą
    if (_marksCanvas) ctx.drawImage(_marksCanvas, A.x, A.y);
  }

  function drawAimLine(L) {
    if (gameOver) return;
    const lx = L.launcher.x, ly = L.launcher.y;
    const ang = launcher.angle;
    const A = L.arena;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const charge = getChargeLevel();
    // Be charge — bazinė trumpa linija. Charging — auga iki visos arenos.
    const baseLen = 100;
    const maxLen = 800;
    const targetLen = baseLen + (maxLen - baseLen) * (charging ? Math.max(0.15, charge) : 0.20);
    let len = targetLen;
    if (dx > 0) len = Math.min(len, (A.x + A.w - lx - 2) / dx);
    if (dx < 0) len = Math.min(len, (A.x - lx + 2) / dx);
    if (dy > 0) len = Math.min(len, (A.y + A.h - ly - 2) / dy);
    if (dy < 0) len = Math.min(len, (A.y - ly + 2) / dy);
    if (len < 20) return;
    ctx.save();
    // Spalva: žalia → geltona → raudona pagal charge
    let r1, g1, b1;
    if (charge < 0.5) {
      const k = charge / 0.5;
      r1 = Math.floor(lerp(120, 255, k));
      g1 = Math.floor(lerp(220, 230, k));
      b1 = Math.floor(lerp(120, 100, k));
    } else {
      const k = (charge - 0.5) / 0.5;
      r1 = 255;
      g1 = Math.floor(lerp(230, 80, k));
      b1 = Math.floor(lerp(100, 60, k));
    }
    const alpha = charging ? (0.55 + 0.4 * charge) : 0.45;
    ctx.fillStyle = `rgba(${r1},${g1},${b1},${alpha})`;
    const dotSpacing = charging ? 10 : 12;
    const steps = Math.floor(len / dotSpacing);
    for (let i = 1; i < steps; i++) {
      if (i % 2 !== 0) continue;
      const x = lx + dx * (i * dotSpacing);
      const y = ly + dy * (i * dotSpacing);
      const sz = charging ? 2.5 + charge * 2.5 : 2.5;
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    // Pulse'inanti rodyklė gale, kai pilnas charge
    if (charging && charge > 0.95) {
      const tipX = lx + dx * len * 0.95;
      const tipY = ly + dy * len * 0.95;
      ctx.fillStyle = `rgba(255,80,60,${0.6 + 0.4 * Math.sin(now() * 0.02)})`;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPowerMeter(L) {
    if (gameOver || !charging) return;
    const lx = L.launcher.x, ly = L.launcher.y;
    const charge = getChargeLevel();
    // Kraunas ringas aplink launcher base
    ctx.save();
    ctx.lineWidth = 5;
    // Background ring
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(lx, ly, 38, 0, Math.PI * 2);
    ctx.stroke();
    // Filled arc
    let r2, g2, b2;
    if (charge < 0.5) {
      const k = charge / 0.5;
      r2 = Math.floor(lerp(120, 255, k));
      g2 = Math.floor(lerp(220, 230, k));
      b2 = Math.floor(lerp(120, 100, k));
    } else {
      const k = (charge - 0.5) / 0.5;
      r2 = 255;
      g2 = Math.floor(lerp(230, 60, k));
      b2 = Math.floor(lerp(100, 60, k));
    }
    ctx.strokeStyle = `rgb(${r2},${g2},${b2})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(lx, ly, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
    ctx.stroke();
    // Persikrovė bandymas
    if (charge > 0.95) {
      ctx.strokeStyle = `rgba(255,255,200,${0.5 + 0.5 * Math.sin(now() * 0.02)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(lx, ly, 44, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLauncher(L, t) {
    const lx = L.launcher.x, ly = L.launcher.y;
    const ang = launcher.angle;
    // Apvali pedestalo plate (top-down)
    ctx.fillStyle = '#3a2410';
    ctx.beginPath();
    ctx.arc(lx, ly, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3a20';
    ctx.beginPath();
    ctx.arc(lx, ly, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1008';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(lx, ly, 26, 0, Math.PI * 2);
    ctx.stroke();
    // Patranka — pailga į ang kryptį
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(ang);
    ctx.fillStyle = '#1a1008';
    ctx.fillRect(0, -10, 42, 20);
    ctx.fillStyle = '#3a2818';
    ctx.fillRect(2, -7, 38, 4);
    ctx.fillRect(2, 3, 38, 4);
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(38, -11, 6, 22);
    ctx.restore();
    // Kitas blokas matomas patrankoj — tas pats dydis kaip arenoje
    const r = radiusForValue(nextBlock.value);
    drawSphere(ctx, lx, ly, r, 0, 0, nextBlock.type, nextBlock.value, 0.2 + 0.2 * Math.sin(t * 0.005));
  }

  function drawNextPreview(L, t) {
    const W = L.W;
    const px = W - 80, py = 86, pw = 60, ph = 60;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(px - 6, py - 6, pw + 12, ph + 28);
    ctx.fillStyle = '#ffe7a8';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NEXT', px + pw / 2, py + 4);
    drawSphere(ctx, px + pw / 2, py + ph / 2 + 6, pw * 0.30, 0, 0, nextBlock.type, nextBlock.value, 0);
  }

  function drawBlocks(L, t) {
    // Pirma — visi sesieliai (pieshiami zemiausiame layeryje)
    for (const b of blocks) drawBlockShadow(b, t);
    // Tada — Y-sorted blokai (artimesni rendertini virsuje)
    const sorted = blocks.slice().sort((a, b) => {
      // Y + z combined — žemesnis y + didesnis z = arčiau kameros
      const ay = a.y + a.z * 0.4;
      const by = b.y + b.z * 0.4;
      const d = ay - by;
      if (Math.abs(d) > 1) return d;
      const ab = a.mergeBoom ? 1 : 0;
      const bb = b.mergeBoom ? 1 : 0;
      return ab - bb;
    });
    for (const b of sorted) drawBlockEntity(b, t);
  }

  // Šešėlis ant grindų — anchor TIKSLEI prie b.y (ground level, kur kubo apačia liečia žemę)
  // Inspiracija: psychicsoftware.com 2D shadow grounding + GameMaker z-tilting techniques
  function drawBlockShadow(b, t) {
    const z = b.z || 0;
    // Aukštis virs grindu — kuo aukščiau, tuo mažesnis ir blyškesnis šešėlis
    const heightFactor = clamp(1 - z / 220, 0.20, 1);
    // Light source iš viršaus-kairės → šešėlis pasislenka šiek tiek dešinėn-žemyn
    const offX = 3 * heightFactor;
    const offY = 2 * heightFactor;
    const baseSx = b.r * 1.00 * heightFactor;
    const baseSy = b.r * 0.32 * heightFactor;
    ctx.save();
    // Multi-layer soft shadow + ryškus contact-core kai z=0 (kontaktas su žeme)
    const layers = [
      { scale: 1.45, alpha: 0.08 },   // outer halo (soft falloff)
      { scale: 1.15, alpha: 0.18 },   // mid
      { scale: 0.90, alpha: 0.40 },   // core (main dark)
    ];
    // Contact dark — tik kai z labai mažas (kubas liečia žemę). Tai duoda "weight" jausmą.
    if (z < 4) {
      layers.push({ scale: 0.65, alpha: 0.55 });   // ryškus dark spot tiesiai po kubu
    }
    for (const L of layers) {
      ctx.fillStyle = `rgba(0,0,0,${L.alpha * heightFactor})`;
      ctx.beginPath();
      // Šešėlis ant b.y linijos — tiksliai kur kubo apačia liečia žemę
      ctx.ellipse(b.x + offX, b.y + offY, baseSx * L.scale, baseSy * L.scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBlockEntity(b, t) {
    const cx = b.x;
    let cy = b.y - (b.z || 0) - b.r;
    let r = b.r;
    let glow = b.glow || 0;

    const sk = (t - b.spawnedAt) / 220;
    if (sk < 1) {
      const e = sk < 0 ? 0 : sk;
      const s = 0.65 + 0.35 * (1 - Math.pow(1 - e, 3));
      r *= s;
    }

    if (b.mergeBoom) {
      const k = (t - b.mergeBoom.startedAt) / b.mergeBoom.duration;
      if (k >= 1) b.mergeBoom = null;
      else if (k >= 0) glow = Math.max(glow, Math.sin(k * Math.PI) * 1.0);
    }

    // ── TRAIL — pixel'inė juodega už skrendančio kamuoliuko (tik ore)
    if (b._trail && b._trail.length > 1 && b.z > 0) {
      const col = TYPE_COLOR[b.type] || TYPE_COLOR.arrow;
      for (let i = 0; i < b._trail.length; i++) {
        const p = b._trail[i];
        const age = (t - p.t) / 220;
        if (age > 1) continue;
        const alpha = Math.max(0, (1 - age) * 0.45);
        const sz = Math.max(2, Math.floor((1 - age) * r * 0.6 / 2) * 2);
        ctx.fillStyle = `rgba(${col.front[0]},${col.front[1]},${col.front[2]},${alpha})`;
        ctx.fillRect(Math.round(p.x - sz / 2), Math.round((p.y - r) - sz / 2), sz, sz);
      }
    }

    drawSphere(ctx, cx, cy, r, b._lastMotionAng || 0, b.rolled || 0, b.type, b.value, glow);
  }

  // ── Deploy panel — virš lane'ų, apačioj kairėj. Klikni unit, paskui klikni lane.
  function drawDeployPanel(L, t) {
    deployBtnRects = [];
    const types = Object.keys(deployPool).filter(k => deployPool[k] > 0);
    if (types.length === 0) return;
    const panelW = Math.min(L.W - 40, types.length * 64 + 16);
    const panelH = 48;
    const panelX = (L.W - panelW) / 2;
    const panelY = L.lanesY + L.lanesH + 4;
    // Panel bg
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#7a5a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);
    // Unit cards
    const cardW = 56, cardH = 40;
    let cx = panelX + 8;
    for (const utype of types) {
      const cnt = deployPool[utype];
      const isSelected = utype === selectedDeployType;
      ctx.fillStyle = isSelected ? '#3a5a2e' : '#2a1808';
      ctx.fillRect(cx, panelY + 4, cardW, cardH);
      ctx.strokeStyle = isSelected ? '#7aff8a' : '#5a3a20';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(cx + 0.5, panelY + 4.5, cardW - 1, cardH - 1);
      // Mini skull preview
      let sheets = null;
      try { sheets = skullAnimSheets; } catch (_) {}
      const sheetObj = sheets && sheets.idle;
      if (sheetObj && sheetObj.sheet && sheetObj.sheet.complete && sheetObj.sheet.naturalWidth > 0) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.filter = 'sepia(1) saturate(3) hue-rotate(160deg) brightness(0.9)';
        const idx = Math.floor(t / 140) % sheetObj.frameCount;
        ctx.drawImage(sheetObj.sheet, idx * 192, 0, 192, 192, cx + 4, panelY + 6, 28, 28);
        ctx.restore();
      }
      // Type label + count
      ctx.fillStyle = '#ffe7a8';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(utype.substr(0, 5).toUpperCase(), cx + 34, panelY + 18);
      ctx.fillStyle = cnt > 0 ? '#fff' : '#666';
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillText('×' + cnt, cx + 34, panelY + 36);
      deployBtnRects.push({ x: cx, y: panelY + 4, w: cardW, h: cardH, utype, cnt });
      cx += cardW + 4;
    }
    // Hint
    if (selectedDeployType) {
      ctx.fillStyle = 'rgba(255,255,150,0.8)';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CLICK A LANE TO DEPLOY', L.W / 2, panelY + panelH + 12);
    } else {
      // Next unit regen timer
      const remain = Math.max(0, (_nextUnitRegenAt - t) / 1000);
      ctx.fillStyle = 'rgba(170,200,255,0.55)';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('+1 IN ' + remain.toFixed(1) + 's', panelX + panelW - 6, panelY + panelH + 10);
    }
  }

  function drawHud(L, t) {
    // Base HP top-left
    ctx.fillStyle = '#1a0e06';
    ctx.fillRect(12, 12, 200, 28);
    ctx.fillStyle = '#e74c4c';
    ctx.fillRect(14, 14, (200 - 4) * Math.max(0, baseHp / BASE_HP), 24);
    ctx.fillStyle = '#fff';
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`BASE ${baseHp}/${BASE_HP}`, 18, 30);

    // Score
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe7a8';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('SCORE ' + score, L.W - 16, 30);
    ctx.fillStyle = '#a8e7ff';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText('MERGES ' + merges + '   BLOCKS ' + blocks.length, L.W - 16, 50);

    // Footer
    ctx.fillStyle = 'rgba(255,230,160,0.55)';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AIM MOUSE — HOLD = CHARGE POWER — RELEASE = FIRE — MERGE → POP CHAIN', L.W / 2, L.H - 14);

    const bw = 92, bh = 26;
    const bx = L.W - bw - 16, by = L.H - bh - 32;
    ctx.fillStyle = '#3a1212';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#ff7a7a';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = '#ffd6d6';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT (ESC)', bx + bw / 2, by + bh / 2);
    ctx.textBaseline = 'alphabetic';
    exitBtnRect = { x: bx, y: by, w: bw, h: bh };

    const rbx = bx - bw - 12;
    ctx.fillStyle = '#1a3a14';
    ctx.fillRect(rbx, by, bw, bh);
    ctx.strokeStyle = '#7aff8a';
    ctx.lineWidth = 2;
    ctx.strokeRect(rbx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = '#d6ffe0';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RESTART (R)', rbx + bw / 2, by + bh / 2);
    ctx.textBaseline = 'alphabetic';
    restartBtnRect = { x: rbx, y: by, w: bw, h: bh };
  }

  function drawGameOver(L) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.fillStyle = '#ff6644';
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', L.W / 2, L.H / 2 - 30);
    ctx.fillStyle = '#ffe7a8';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('SCORE  ' + score, L.W / 2, L.H / 2 + 4);
    ctx.fillText('MERGES ' + merges, L.W / 2, L.H / 2 + 26);
    ctx.fillText('R = RESTART · ESC = EXIT', L.W / 2, L.H / 2 + 60);
  }

  // ── Input ──────────────────────────────────────────────────────────
  function onKey(e) {
    if (!active) return;
    const k = e.key;
    if (k === 'Escape') {
      try { S.floor = 11; } catch (_) {}
      e.preventDefault(); return;
    }
    if (k === 'r' || k === 'R') { initState(); e.preventDefault(); return; }
    if (k === ' ' && !e.repeat) {
      // Spacebar pirma keydown — pradeda charge
      if (!charging) { charging = true; chargeStartedAt = now(); }
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    if (!active) return;
    if (e.key === ' ' && charging) {
      const power = getChargeLevel();
      charging = false;
      fire(power);
      e.preventDefault();
    }
  }

  function clientToCanvas(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (canvas.width / r.width),
      y: (clientY - r.top) * (canvas.height / r.height),
    };
  }

  function onMouseMove(e) {
    if (!active) return;
    const p = clientToCanvas(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y;
    updateLauncherAim();
  }

  function onMouseDown(e) {
    if (!active) return;
    const p = clientToCanvas(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y;
    if (exitBtnRect && p.x >= exitBtnRect.x && p.x <= exitBtnRect.x + exitBtnRect.w
        && p.y >= exitBtnRect.y && p.y <= exitBtnRect.y + exitBtnRect.h) {
      try { S.floor = 11; } catch (_) {}
      return;
    }
    if (restartBtnRect && p.x >= restartBtnRect.x && p.x <= restartBtnRect.x + restartBtnRect.w
        && p.y >= restartBtnRect.y && p.y <= restartBtnRect.y + restartBtnRect.h) {
      initState(); return;
    }
    // Deploy panel — pasirink unit type
    for (const r of deployBtnRects) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        if (r.cnt > 0) {
          selectedDeployType = (selectedDeployType === r.utype) ? null : r.utype;
        }
        return;
      }
    }
    // Jei pasirinktas deploy mode IR paspausta lane → spawn ally
    if (selectedDeployType && layoutCache) {
      const L = layoutCache;
      const lh = L.laneH;
      // Patikrink ar paspausta lane'ų zonoj
      if (p.x >= L.lanesX && p.x <= L.lanesX + L.lanesW && p.y >= L.lanesY && p.y < L.lanesY + L.lanesH) {
        const laneIdx = Math.floor((p.y - L.lanesY) / lh);
        if (laneIdx >= 0 && laneIdx < LANES && deployPool[selectedDeployType] > 0) {
          spawnAlly(selectedDeployType, laneIdx, now());
          deployPool[selectedDeployType]--;
          if (deployPool[selectedDeployType] <= 0) selectedDeployType = null;
          return;
        }
      }
    }
    updateLauncherAim();
    // Pradeda charge — fire'ina release'inant
    charging = true;
    chargeStartedAt = now();
  }
  function onMouseUp(e) {
    if (!active || !charging) return;
    if (e) {
      const p = clientToCanvas(e.clientX, e.clientY);
      mouse.x = p.x; mouse.y = p.y;
      updateLauncherAim();
    }
    const power = getChargeLevel();
    charging = false;
    fire(power);
  }

  // ── Activation ─────────────────────────────────────────────────────
  function ensureOverlay() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'floor12-merge-canvas';
    canvas.style.cssText = `
      position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;
      z-index: 9000; background: #2a1a0e; cursor: crosshair;
      touch-action: none; image-rendering: pixelated; image-rendering: crisp-edges;`;
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', () => { if (charging) onMouseUp(null); });
    canvas.addEventListener('touchstart', e => {
      const t = e.touches[0];
      onMouseMove({ clientX: t.clientX, clientY: t.clientY });
      onMouseDown({ clientX: t.clientX, clientY: t.clientY });
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      const t = e.touches[0];
      onMouseMove({ clientX: t.clientX, clientY: t.clientY });
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      const t = e.changedTouches[0];
      onMouseUp({ clientX: t.clientX, clientY: t.clientY });
      e.preventDefault();
    }, { passive: false });
  }

  function resize() {
    if (!canvas) return;
    canvas.width = Math.floor(window.innerWidth);
    canvas.height = Math.floor(window.innerHeight);
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
  }

  function activate() {
    if (active) return;
    ensureOverlay();
    initState();
    canvas.style.display = 'block';
    active = true;
    lastTime = now();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKeyUp, true);
    raf = requestAnimationFrame(loop);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    if (canvas) canvas.style.display = 'none';
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKeyUp, true);
    charging = false;
  }

  function loop(tnow) {
    if (!active) return;
    const dt = Math.min(tnow - lastTime, 100);
    lastTime = tnow;
    tickEnemies(dt, tnow);
    tickUnitRegen(tnow);
    processPendingActions(tnow);
    tickPhysics(dt);
    _fadeMarks(dt);
    render(tnow);
    raf = requestAnimationFrame(loop);
  }

  function poll() {
    let cur = null;
    try { cur = S; } catch (_) {}
    if (cur && typeof cur === 'object') {
      const f = cur.floor;
      if (f === 12 && !active) activate();
      else if (f !== 12 && active) deactivate();
    }
  }
  setInterval(poll, 200);

  window.MergeFloor = { activate, deactivate, isActive: () => active };

  function _safeS() { try { return S; } catch (_) { return null; } }

  window.gotoF12 = function () {
    const cur = _safeS();
    if (!cur) return console.warn('S nera dar inicializuotas (paspausk Adventure pirma)');
    cur.floor = 12;
    if (typeof initAdventure === 'function') initAdventure();
    return 'F12 Merge mode';
  };
  window.gotoF11 = function () {
    const cur = _safeS();
    if (!cur) return;
    cur.floor = 11;
    if (typeof initAdventure === 'function') initAdventure();
    return 'F11';
  };

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
      e.preventDefault();
      const cur = _safeS();
      if (!cur) return;
      if (cur.floor === 12) window.gotoF11();
      else window.gotoF12();
    }
  }, true);
})();
