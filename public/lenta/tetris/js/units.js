/* DECK UNITAI — tikri F9/F12 pilies lauko unitai, žygiuojantys mūšio koridoriumi.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ŠIAME FAILE NĖRA RANKA SURAŠYTŲ F12 REIKŠMIŲ.                           │
 * │ hp/dmg/cd/range/spd/crit/block/miss/aoe, kadrų skaičiai, FPS, hit-delay │
 * │ ir sviedinių trukmės ateina iš `f12_data.js`, kurį sugeneruoja          │
 * │ `tools/extract_f12.js` tiesiai iš game.js + floor12_merge.js.           │
 * │ Pasikeitė F12 — perleidi generatorių, ir čia viskas savaime teisinga.   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Čia lieka tik tai, ko F12 NETURI, nes tai tetris koridoriaus išdėstymo dalykai:
 * `size` (kadro dydis virtualiais px), `footY` (kur kadre kojos), `label`.
 *
 * Sprite'ai imami TIESIOG iš žaidimo asset'ų (kelias ../ nes tetris sėdi /tetris/).
 * Kol sheet neužsikrovė (arba jo nėra), render'is piešia procedūrinį karį — todėl
 * žaidimas nelūžta dėl asset'o, o headless testai (be `Image`) sukasi kaip anksčiau. */
(function (global) {
  'use strict';

  var BASE = '../';
  var F = global.F12 || null;

  /* Tetris vardai <-> F12 utype. F12 kiaulę vadina `hog_rider`, žaidimo deke ji
   * `pigronke` — vienintelis vardų neatitikimas, laikom jį vienoje vietoje. */
  var F12_NAME = { pigronke: 'hog_rider' };
  function f12Name(t) { return F12_NAME[t] || t; }

  /* TIK pateikimo dydžiai — koridorius kitokio mastelio nei F12 lane'ai.
   *
   * ⚠️ `size` piešia kadrą į size×size dėžutę, BET kadre sprite'as užima labai
   * skirtingą dalį: skull savo 192 px kadre — 39 %, RonkeHood savo 640 px kadre —
   * 100 %. Todėl vienodas `size` NEREIŠKIA vienodo unito ekrane; RonkeHood buvo
   * beveik 3× didesnis už skull.
   *
   * `fill` = kokią kadro aukščio dalį užima turinys, `footY` = kur kadre kojos.
   * Abu IŠMATUOTI iš PNG alfa kanalo (`node tools/measure_units.js`), ne iš akies.
   * Dydžiai parinkti taip, kad turinio aukščių SANTYKIAI sutaptų su F12 `drawAlly`
   * (skull 1.00 · archer 1.13 · shaman 1.21 · ghost 1.33 · ronhood 1.37 · hog 2.12).
   * Perskaičiuoti: `node tools/measure_units.js` parodo, kas nukrypo. */
  var LOOK = {
    skull:        { label: 'Skull',     size: 58, footY: 0.74, fill: 0.39 },
    archer:       { label: 'Archer',    size: 58, footY: 0.74, fill: 0.44 },
    harpoon_fish: { label: 'Harpoon',   size: 58, footY: 0.74, fill: 0.39 },
    shaman:       { label: 'Shaman',    size: 58, footY: 0.74, fill: 0.47, noFlip: true },
    pigronke:     { label: 'Hog',       size: 68, footY: 0.80, fill: 0.67 },
    /* Vaiduoklis: F12 jį TYČIA mažina (`gw = dw * 0.66`). Buvo 52 -> santykis 1.81
     * vietoj 1.33. footY 0.98 (turinys baigiasi ties 0.898) palieka jį kyboti
     * keliais px virš tako — jis juk plūduriuoja, o ne vaikšto. */
    ghost:        { label: 'Ghost',     size: 38, footY: 0.98, fill: 0.79, float: true },
    /* RonkeHood: F12 jį normalizuoja pagal TURINIO aukštį (`sz * 2.4`), nes jo
     * sprite'as užima VISĄ kadrą. Buvo 64 -> santykis 2.82 vietoj 1.37.
     * footY 1.00, nes turinys siekia patį kadro apačią (kojos = kadro kraštas). */
    ronhood:      { label: 'RonkeHood', size: 31, footY: 1.00, fill: 1.00 }
  };

  var ORDER = ['skull', 'archer', 'harpoon_fish', 'shaman', 'pigronke', 'ghost', 'ronhood'];

  /* Žaidime naudojama skaitinė tipų numeracija (žr. _f9MktUnitName game.js) */
  var BY_ID = { 1: 'skull', 2: 'archer', 3: 'harpoon_fish', 4: 'shaman', 5: 'pigronke', 6: 'ghost', 7: 'ronhood' };

  /* animations/<anim>/<dir>/frame_000.png ... */
  function shamanDir(animPath, dir, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(animPath + '/' + dir + '/frame_' + ('00' + i).slice(-3) + '.png');
    return out;
  }

  /* ═══════════════ ROSTER surinkimas iš F12 duomenų ═══════════════ */

  /* Kai F12 duomenų nėra (senas kešas, testas be failo) — nesugriūvam: paliekam
   * minimalų unitą, kad render'is turėtų ką piešti. Tikroji vieta klaidai matyti
   * yra `RB.sprites()`, kuris parodys, kad duomenų nėra. */
  function statsFor(type) {
    var n = f12Name(type);
    var s = (F && F.stats && F.stats[n]) || {};
    var sp = (F && F.special && F.special[n]) || {};
    var miss = (F && F.miss && F.miss[n]) || 0;
    return {
      hp: s.hp || 4, dmg: s.dmg || 1, cd: s.attackCooldown || 1500,
      range: s.range || 0.04, spd: s.speed || 0.012,
      crit: sp.crit || 0, block: sp.block || 0, aoe: !!sp.aoe, miss: miss
    };
  }

  var ROSTER = {};

  ORDER.forEach(function (type) {
    var look = LOOK[type] || {};
    var st = statsFor(type);
    var d = {
      label: look.label || type, size: look.size || 58, footY: look.footY || 0.74,
      fill: look.fill || 1, float: !!look.float, noFlip: !!look.noFlip,
      hp: st.hp, dmg: st.dmg, cd: st.cd, range: st.range, spd: st.spd,
      crit: st.crit, block: st.block, aoe: st.aoe, miss: st.miss
    };
    ROSTER[type] = d;
  });

  /* ---- Kadrų šaltiniai. Kiekvienas blokas atspindi F12 `_pickXxxFrame`. ---- */
  function U(name) { return (F && F.units && F.units[name]) || null; }

  /* a) sheet'ų unitai: {sheets:{k:{src,frames}}, fps:{k:n}} */
  function fromSheets(type, f12key, map, frameW) {
    var s = U(f12key);
    if (!s || !s.sheets) return;
    var d = ROSTER[type];
    var sh = s.sheets, fps = s.fps || {};
    if (sh[map.run])  { d.sheet = sh[map.run].src;      d.frames = sh[map.run].frames;      d.fps = fps[map.run] || 10; }
    if (sh[map.idle]) { d.idleSheet = sh[map.idle].src; d.idleFrames = sh[map.idle].frames; d.idleFps = fps[map.idle] || 7; }
    if (sh[map.atk])  { d.atkSheet = sh[map.atk].src;   d.atkFrames = sh[map.atk].frames;   d.atkFps = fps[map.atk] || 12; }
    if (map.guard && sh[map.guard]) { d.gdSheet = sh[map.guard].src; d.gdFrames = sh[map.guard].frames; d.gdFps = fps[map.guard] || 10; }
    /* F12 hurt (dmg-take recoil) — turim sheet'ą, panaudos render'is per hitFlash. */
    if (sh.hurt) { d.hurtSheet = sh.hurt.src; d.hurtFrames = sh.hurt.frames; d.hurtFps = fps.hurt || 16; }
    d.fw = frameW || s.frameW || 0;
    if (s.hitDelay != null) d.hitDelay = s.hitDelay;
    if (s.fireT != null) d.hitDelay = s.fireT;
  }

  /* b) ms-pagrįsti unitai (archer/harpoon): {anims:{k:{src,frames,ms}}} */
  function fromMsAnims(type, f12key, map) {
    var s = U(f12key);
    if (!s || !s.anims) return;
    var d = ROSTER[type], a = s.anims;
    function fpsOf(c) { return c && c.ms ? 1000 / c.ms : 10; }
    if (a[map.run])  { d.sheet = a[map.run].src;      d.frames = a[map.run].frames;      d.fps = fpsOf(a[map.run]); }
    if (a[map.idle]) { d.idleSheet = a[map.idle].src; d.idleFrames = a[map.idle].frames; d.idleFps = fpsOf(a[map.idle]); }
    if (a[map.atk])  { d.atkSheet = a[map.atk].src;   d.atkFrames = a[map.atk].frames;   d.atkFps = fpsOf(a[map.atk]); }
    d.fw = s.frameW || 192;
    if (s.fireT != null) d.hitDelay = s.fireT;
  }

  fromSheets('skull', 'skull', { run: 'run', idle: 'idle', atk: 'attack', guard: 'guard' });
  fromSheets('pigronke', 'hog_rider', { run: 'walk', idle: 'idle', atk: 'attack' }, 640);
  fromSheets('ghost', 'ghost', { run: 'walk', idle: 'idle', atk: 'attack' }, 256);
  fromSheets('ronhood', 'ronhood', { run: 'walk', idle: 'idle', atk: 'attack' }, 640);
  fromMsAnims('archer', 'archer', { run: 'run', idle: 'idle', atk: 'shoot' });
  fromMsAnims('harpoon_fish', 'harpoon_fish', { run: 'run', idle: 'idle', atk: 'throw' });

  /* RonHood F12 atakos kadrą skaičiuoja iš SHOOT_DUR/frameCount, ne iš FPS. */
  {
    var rh = U('ronhood');
    if (rh && rh.shootDur && ROSTER.ronhood.atkFrames) {
      ROSTER.ronhood.atkFps = ROSTER.ronhood.atkFrames / (rh.shootDur / 1000);
      ROSTER.ronhood.hitDelay = rh.fireT;
    }
  }

  /* c) Šamanas — PER-KADRO failai pagal kryptį (ne sheet'as).
   * F12 piešia tik `east` (jo unitai visada eina dešinėn ir NIEKADA neapverčiami).
   * Koridoriuje priešo pusė eina kairėn, tad imam TIKRUS `west` kadrus — tas pats
   * F12 principas („naudok kryptinį rinkinį, o ne veidrodį"), tik pritaikytas
   * abiem kryptimis. Veidrodis rodytų lazdą ne toje rankoje. */
  {
    var s = U('shaman');
    if (s && s.anims) {
      var d = ROSTER.shaman, A = s.anims, fps = s.fps || {};
      d.frames = A.run ? A.run.frames : 4;         d.fps = fps.run || 10;
      d.idleFrames = A.idle ? A.idle.frames : 8;   d.idleFps = fps.idle || 6;
      d.atkFrames = A.attack ? A.attack.frames : 10; d.atkFps = fps.attack || 14;
      d.hitDelay = s.fireT;
      d.dirFiles = {
        run:  { east: shamanDir(A.run.path, 'east', A.run.frames),       west: shamanDir(A.run.path, 'west', A.run.frames) },
        idle: { east: shamanDir(A.idle.path, 'east', A.idle.frames),     west: shamanDir(A.idle.path, 'west', A.idle.frames) },
        atk:  { east: shamanDir(A.attack.path, 'east', A.attack.frames), west: shamanDir(A.attack.path, 'west', A.attack.frames) }
      };
    }
  }

  /* ---- Sviediniai. `kind` lemia skrydžio elgseną render'yje (F12 modelis):
   *   arrow   — PARABOLĖ + sukimasis pagal liestinę
   *   harpoon — tiesiai, FIKSUOTAS +pi/4, oranžinis švytėjimas
   *   shaman  — tiesiai, 3 kadrų sprite, sprogimas atskridus
   *   orb     — tiesiai + banga, PROCEDŪRINIS (F12 jo nepiešia sprite'u)
   *
   * ⚠️ DYDIS. F12 viską matuoja lane aukščiu `lh`: unito kadras = `lh*2.25`
   * (`sz = lh*0.50`, piešiamas `sz*4.5`), o strėlė = `lh*0.85`. Tad strėlė yra
   * **0,378 unito kadro**. Anksčiau čia buvo ranka parinktas `size 28`, kurį
   * render'is dar dauginо iš 1.6 -> 0,77 unito, t. y. DUKART per didelė.
   * Dabar dydžiai skaičiuojami iš F12 daugiklių, o render'is nieko nebedaugina. */
  var REF_UNIT = LOOK.skull.size;                     // etaloninis unito kadras
  function projPx(laneMul) {
    var D = F && F.draw;
    if (!D || !D.unitOfLane) return REF_UNIT * laneMul / 2.25;   // atsarginis
    return REF_UNIT * laneMul / D.unitOfLane;
  }
  {
    var P = (F && F.proj) || {};
    if (P.arrow) {
      /* F12 ima `Archer_Arrow_Sheet.png` VIRŠUTINĮ 64x64 kadrą (apatinis = įstrigusi strėlė). */
      var arrowImpact = { sheet: 'assets_tiny/Arrow_Impact.png', w: 192, frames: 9, ms: 60,
        dur: P.arrow.impactDur, size: projPx(P.arrow.impactScale) };
      ROSTER.archer.proj = { sheet: 'assets_tiny/Archer_Arrow_Sheet.png', w: 64, h: 64, frames: 1,
        dur: P.arrow.dur, size: projPx(P.arrow.drawScale), kind: 'arrow',
        arcPx: projPx(P.arrow.arcScale), impact: arrowImpact };
      ROSTER.ronhood.proj = { sheet: 'assets_tiny/Archer_Arrow_Sheet.png', w: 64, h: 64, frames: 1,
        dur: P.arrow.dur, size: projPx(P.arrow.drawScale), kind: 'arrow',
        arcPx: projPx(P.arrow.arcScale), impact: arrowImpact };
    }
    if (P.harpoon) {
      ROSTER.harpoon_fish.proj = { sheet: 'assets_tiny/Harpoon.png', w: 64, h: 64, frames: 1,
        dur: P.harpoon.dur, size: projPx(P.harpoon.drawScale), kind: 'harpoon',
        fixedRot: Math.PI / 4, shadow: '#ffaa44' };
    }
    if (P.shaman) {
      ROSTER.shaman.proj = { sheet: P.shaman.sheet, w: 128, h: 128, frames: P.shaman.frames, ms: P.shaman.ms,
        dur: P.shaman.dur, size: projPx(P.shaman.drawScale), kind: 'shaman',
        impact: { sheet: P.shaman.explSheet, w: 128, frames: P.shaman.explFrames, ms: P.shaman.explMs,
          dur: P.shaman.explDur, size: projPx(P.shaman.explScale) } };
    }
    if (P.ghost) {
      /* F12 ghost orbas — radial gradient su `lighter` kompozicija, JOKIO sprite'o.
       * `size` čia yra SPINDULYS (F12 `r = lh*0.20`), o švytėjimas piešiamas iki r*2.2. */
      ROSTER.ghost.proj = { procedural: true, dur: P.ghost.dur, size: projPx(P.ghost.radiusScale),
        kind: 'orb', weaveMs: P.ghost.weaveMs, grad: P.ghost.grad };
    }
  }

  var loaded = false;

  /* Sheet'ai kraunami tinginiu būdu ir tik kartą. Jei `Image` neprieinamas
   * (headless testas) — tyliai praleidžiam, render'is naudos atsarginį karį. */
  function load() {
    if (loaded) return;
    loaded = true;
    if (typeof global.Image !== 'function') return;
    function mk(src) { var im = new global.Image(); im.src = BASE + src; return im; }
    ORDER.forEach(function (t) {
      var d = ROSTER[t];
      if (d.sheet) d.img = mk(d.sheet);
      if (d.atkSheet) d.atkImg = mk(d.atkSheet);
      if (d.idleSheet) d.idleImg = mk(d.idleSheet);
      if (d.gdSheet) d.gdImg = mk(d.gdSheet);
      if (d.proj && d.proj.sheet) d.proj.img = mk(d.proj.sheet);
      if (d.proj && d.proj.impact && d.proj.impact.sheet) d.proj.impact.img = mk(d.proj.impact.sheet);
      if (d.dirFiles) {
        d.dirImgs = {};
        Object.keys(d.dirFiles).forEach(function (k) {
          d.dirImgs[k] = { east: d.dirFiles[k].east.map(mk), west: d.dirFiles[k].west.map(mk) };
        });
      }
    });
  }

  /* Animacijos trukmės — reikia, kad žinotume, kada ataka/blokas baigėsi. */
  function atkDur(type) {
    var d = ROSTER[type];
    return d ? ((d.atkFrames || 8) / (d.atkFps || 12)) * 1000 : 600;
  }
  function guardDur(type) {
    var d = ROSTER[type];
    return (d && d.gdFrames) ? (d.gdFrames / (d.gdFps || 10)) * 1000 : 0;
  }

  /* BŪSENŲ MAŠINA (kaip F12 `_pickXxxFrame`): ataka ir blokas grojami VIENĄ KARTĄ
   * nuo įvykio pradžios (`swingStart`), o pasibaigę užleidžia vietą idle arba žygiui.
   *
   * `st` = { sinceSwing, sinceGuard, moving } ms nuo įvykio / ar juda.
   * Grąžina {img,sx,sy,sw,sh,def} arba null. */
  function poseFrame(type, st, timeMs, phase, dir) {
    var d = ROSTER[type];
    if (!d) return null;
    var n, list, fi;
    var dset = d.dirImgs || null;
    var dk = (dir === 'west') ? 'west' : 'east';
    function pickDir(kind) { return dset && dset[kind] ? dset[kind][dk] : null; }
    function fromList(l, idx) { var im = l[idx]; return { img: im, sx: 0, sy: 0, sw: im.naturalWidth, sh: im.naturalHeight, def: d }; }

    /* 1) BLOKAS (skull skydas) — aukščiausias prioritetas */
    var gDur = guardDur(type);
    if (gDur && st.sinceGuard >= 0 && st.sinceGuard < gDur && imgOk(d.gdImg)) {
      fi = Math.min(d.gdFrames - 1, Math.floor(st.sinceGuard / (1000 / d.gdFps)));
      var gs = sheetSrc(d, d.gdImg, d.gdFrames, 'gdMip');
      return { img: gs.img, sx: fi * gs.fw, sy: 0, sw: gs.fw, sh: gs.fw, def: d };
    }

    /* 2) ATAKA — groja vieną kartą, kadras pagal laiką NUO užsimojimo */
    var aDur = atkDur(type);
    if (st.sinceSwing >= 0 && st.sinceSwing < aDur && ready(d, true)) {
      n = d.atkFrames;
      fi = Math.min(n - 1, Math.floor(st.sinceSwing / (1000 / d.atkFps)));
      var dAtk = pickDir('atk');
      if (dAtk) return fromList(dAtk, fi);
      var as = sheetSrc(d, d.atkImg, d.atkFrames, 'atkMip');
      return { img: as.img, sx: fi * as.fw, sy: 0, sw: as.fw, sh: as.fw, def: d };
    }

    /* 3) IDLE — kai stovi (kirtis baigėsi, pauzė, laukia cooldown) */
    if (!st.moving) {
      var dIdle = pickDir('idle');
      if (dIdle && dIdle.every(imgOk)) {
        n = d.idleFrames;
        fi = Math.floor((timeMs / (1000 / (d.idleFps || 7))) + (phase || 0)) % n;
        if (fi < 0) fi += n;
        return fromList(dIdle, fi);
      }
      if (imgOk(d.idleImg)) {
        n = d.idleFrames;
        fi = Math.floor((timeMs / (1000 / (d.idleFps || 7))) + (phase || 0)) % n;
        if (fi < 0) fi += n;
        var is = sheetSrc(d, d.idleImg, d.idleFrames, 'idleMip');
        return { img: is.img, sx: fi * is.fw, sy: 0, sw: is.fw, sh: is.fw, def: d };
      }
    }

    /* 4) ŽYGIS */
    var dRun = pickDir('run');
    if (dRun && dRun.every(imgOk)) {
      n = d.frames;
      fi = Math.floor(cycleFor(type, 0, timeMs, phase)) % n;
      if (fi < 0) fi += n;
      return fromList(dRun, fi);
    }
    return frame(type, cycleFor(type, 0, timeMs, phase), false);
  }

  /* Sviedinio kadras. `ageMs` — kiek laiko sviedinys ore (F12 kadrą skaičiuoja
   * nuo paleidimo, ne nuo globalaus laikrodžio). Procedūriniai (orb) — null. */
  function projFrame(type, ageMs) {
    var d = ROSTER[type];
    var p = d && d.proj;
    if (!p || !p.sheet || !imgOk(p.img)) return null;
    var n = p.frames || 1;
    var per = p.ms || (1000 / (p.fps || 12));
    var fi = n > 1 ? Math.floor((ageMs || 0) / per) % n : 0;
    return { img: p.img, sx: fi * p.w, sy: 0, sw: p.w, sh: p.h || p.img.naturalHeight, def: p };
  }

  /* Pataikymo sprogimo kadras (F12: strėlė 9x60 ms, šamanas 9x55 ms).
   * Grąžina null, kai animacija baigėsi — tada kviečiantysis efektą pašalina. */
  function impactFrame(type, ageMs) {
    var d = ROSTER[type];
    var im = d && d.proj && d.proj.impact;
    if (!im || !imgOk(im.img)) return null;
    var fi = Math.floor((ageMs || 0) / im.ms);
    if (fi >= im.frames) return null;
    return { img: im.img, sx: fi * im.w, sy: 0, sw: im.w, sh: im.img.naturalHeight, def: im };
  }

  function projOf(type) {
    var d = ROSTER[type];
    return (d && d.proj) || null;
  }

  /* Žingsnio ciklo pozicija — pagal LAIKĄ, kaip F12 (`idx = floor(t / (1000/fps)) % fc`).
   * `distPx` paliktas parašui, kad kviečiantiesiems nereikėtų keistis. */
  function cycleFor(type, distPx, timeMs, phase) {
    var d = ROSTER[type];
    if (!d) return 0;
    return (timeMs / (1000 / (d.fps || 10))) + (phase || 0);
  }

  function imgOk(im) { return !!(im && im.complete && im.naturalWidth > 0); }

  /* ---------- MIP: vienkartinis didelių sheet'ų sumažinimas ----------
   * Hog ir RonkeHood juostos yra 5120x640 — vienas kadras 640x640. Piešiant jį
   * tiesiai į ~45 px, naršyklė KIEKVIENAM kadrui perskaičiuoja 640x640 pikselių;
   * su keliais unitais ekrane tai užkemša ir žaidimas ima strigti. */
  var MIP_W = 192;

  function makeMip(img, frames, fw) {
    var doc = global.document;
    if (!doc || !doc.createElement) return null;      // headless testas
    try {
      var c = doc.createElement('canvas');
      c.width = frames * MIP_W;
      c.height = MIP_W;
      var g = c.getContext('2d');
      if (!g) return null;
      g.imageSmoothingEnabled = true;                 // kokybiškas VIENKARTINIS sumažinimas
      for (var i = 0; i < frames; i++) {
        g.drawImage(img, i * fw, 0, fw, fw, i * MIP_W, 0, MIP_W, MIP_W);
      }
      return c;
    } catch (e) { return null; }
  }

  /* Grąžina {img, fw} — sumažintą versiją, jei ji prasminga ir jau paruošta. */
  function sheetSrc(d, img, frames, mipKey) {
    if (!d.fw || d.fw <= MIP_W) return { img: img, fw: d.fw };
    if (d[mipKey] === undefined) d[mipKey] = makeMip(img, frames, d.fw) || null;
    return d[mipKey] ? { img: d[mipKey], fw: MIP_W } : { img: img, fw: d.fw };
  }

  /* `atk` — ar tikrinam ATAKOS animaciją. Jei jos nėra ar neužsikrovė, kviečiantysis
   * gauna žygio kadrą: geriau kapotis su žygio poza nei dingti iš ekrano. */
  function ready(d, atk) {
    if (!d) return false;
    if (d.dirImgs) {
      var set = atk ? d.dirImgs.atk : d.dirImgs.run;
      return !!(set && set.east.every(imgOk));
    }
    if (atk) return imgOk(d.atkImg);
    return imgOk(d.img);
  }

  /* Kadras animacijai. `cycle` — ciklo pozicija (float). */
  function frame(type, cycle, atk) {
    var d = ROSTER[type];
    if (!d) return null;
    var useAtk = atk && ready(d, true);
    if (!useAtk && !ready(d, false)) return null;

    var n = useAtk ? d.atkFrames : d.frames;
    var fi = Math.floor(cycle || 0) % n;
    if (fi < 0) fi += n;

    var src = useAtk ? sheetSrc(d, d.atkImg, d.atkFrames, 'atkMip')
                     : sheetSrc(d, d.img, d.frames, 'runMip');
    return { img: src.img, sx: fi * src.fw, sy: 0, sw: src.fw, sh: src.fw, def: d };
  }

  /* Atakos animacijos ciklas — visada pagal laiką (smūgio tempas, ne kelias). */
  function atkCycleFor(type, timeMs, phase) {
    var d = ROSTER[type];
    if (!d) return 0;
    return (timeMs / (1000 / (d.atkFps || 12))) + (phase || 0);
  }

  /* ---------- DECK ----------
   * Pagrindinis žaidimas armiją laiko atmintyje (`S.units`, NFT pagrindu), tad
   * atskiras tetris puslapis ją gauna per localStorage momentinę nuotrauką.
   * Formatas:  f9_army_snapshot_v1 = {"units":[{"type":"skull","stack":3}, ...]} */
  var SNAP_KEY = 'f9_army_snapshot_v1';

  function readDeck() {
    var raw = null;
    try { raw = global.localStorage && global.localStorage.getItem(SNAP_KEY); } catch (e) { }
    if (!raw) return null;
    var d;
    try { d = JSON.parse(raw); } catch (e) { return null; }
    if (!d || !d.units || !d.units.length) return null;

    var out = [];
    for (var i = 0; i < d.units.length; i++) {
      var u = d.units[i];
      var t = typeof u === 'string' ? u : (u.type || BY_ID[u.utype] || BY_ID[u.t]);
      if (typeof t === 'number') t = BY_ID[t];
      if (!ROSTER[t]) continue;
      var n = Math.max(1, Math.min(12, (u && u.stack) || 1));
      for (var s = 0; s < n; s++) out.push(t);
    }
    return out.length ? out : null;
  }

  /* Rikiuotė, iš kurios sudaromi žygiuojantys būriai. Perskaitoma retai (kešuojam),
   * nes localStorage skaitymas kas kadrą būtų brangus. */
  var cache = null, cacheAt = -1e9;

  function deck(nowMs) {
    if (cache && nowMs - cacheAt < 4000) return cache;
    cacheAt = nowMs;
    cache = readDeck() || ORDER.slice();
    return cache;
  }

  function invalidate() { cache = null; cacheAt = -1e9; }

  global.Units = {
    ROSTER: ROSTER,
    ORDER: ORDER,
    BY_ID: BY_ID,
    SNAP_KEY: SNAP_KEY,
    hasF12: !!F,
    load: load,
    ready: ready,
    frame: frame,
    projFrame: projFrame,
    impactFrame: impactFrame,
    poseFrame: poseFrame,
    atkDur: atkDur,
    guardDur: guardDur,
    projOf: projOf,
    cycleFor: cycleFor,
    atkCycleFor: atkCycleFor,
    /* Kovos statai — visi iš F12 ALLY_STATS / _F12_UNIT_STATS / _UNIT_MISS_CHANCE. */
    stats: function (type) {
      var d = ROSTER[type];
      if (!d) return { hp: 1, dmg: 1, cd: 1500, range: 0.05, spd: 0.012, crit: 0, block: 0, miss: 0, aoe: false, hitDelay: 300 };
      var animMs = ((d.atkFrames || 8) / (d.atkFps || 12)) * 1000;
      return {
        hp: d.hp, dmg: d.dmg, cd: d.cd, range: d.range, spd: d.spd,
        crit: d.crit, block: d.block, miss: d.miss, aoe: d.aoe,
        /* hitDelay = F12 _SKULL_HIT_DELAY / _HOG_HIT_DELAY / _*_FIRE_T */
        hitDelay: d.hitDelay != null ? d.hitDelay : Math.round(animMs * 0.55)
      };
    },
    deck: deck,
    invalidate: invalidate
  };
})(window);
