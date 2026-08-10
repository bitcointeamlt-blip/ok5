/* Vizualūs efektai ("juice"): ekrano drebėjimas, kibirkštys, iššokantis tekstas,
 * hard-drop šleifai, per ekraną skriejantys atakų sviediniai, hit-stop, blyksniai.
 * Kiekviena pusė ('you' / 'foe') turi savo kanalą; sviediniai ir blyksniai — globalūs. */
(function (global) {
  'use strict';

  var C = global.CFG;
  var J = C.JUICE;

  /* ================= vienos pusės kanalas ================= */

  function Channel() {
    this.shake = 0;
    this.parts = [];
    this.pops = [];
    this.flash = [];       // linijų blyksnis
    this.beams = [];       // šviesos pluoštai pro šonus
    this.trails = [];
    this.stamps = [];   // ⚡ hard-drop atspaudai (baltas ~120ms blyksnis ant figuros celiu)      // hard-drop šleifai
    this.rings = [];       // smūgio žiedai
    this.heartT = 0;
    this.dangerT = 0;
    /* Grindų būsena laukiant atakos: kas smūgį įtrūkimų daugiau, o pro plyšius
     * vis stipriau prasimuša kalvės šviesa iš apačios. */
    this.cracks = 0;      // 0..3 — kiek smūgių jau buvo
    this.floorGlow = 0;   // 0..1 — trumpas žybsnis per smūgį
    this.floorPush = 0;   // px — kiek plokštės prasikišusios pro grindis
  }

  /* Vienas kūjo smūgis iš apačios. */
  Channel.prototype.strike = function (n) {
    this.cracks = Math.max(this.cracks, n);
    this.floorGlow = 1;
    this.addShake(3 + n * 1.6);
  };

  Channel.prototype.clearFloor = function () {
    this.cracks = 0; this.floorGlow = 0; this.floorPush = 0;
  };

  Channel.prototype.addShake = function (amt) {
    this.shake = Math.max(this.shake, amt);
  };

  Channel.prototype.pop = function (txt, color, opts) {
    opts = opts || {};
    this.pops.push({
      txt: txt, color: color,
      life: opts.life || 1100, max: opts.life || 1100,
      scale: opts.scale || 2,
      punch: opts.punch !== false,        // trumpas padidėjimas gimimo momentu
      y: opts.y != null ? opts.y : 0,     // pradinis nuokrypis nuo lentos centro
      dy: 0, vy: opts.vy != null ? opts.vy : -0.022,
      outline: opts.outline || '#0a0c14',
      force: !!(opts && opts.force)
    });
    if (this.pops.length > 5) this.pops.shift();
  };

  /* Efektyvus mastelis su "punch" — sveikieji skaičiai, kad pikseliai liktų aštrūs. */
  Channel.popScale = function (q) {
    var age = q.max - q.life;
    if (q.punch && age < 90) return q.scale + 1;
    return q.scale;
  };

  Channel.prototype.burst = function (x, y, n, colors, spread) {
    spread = spread || 1;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = (0.02 + Math.random() * 0.10) * spread;
      this.parts.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.03,
        life: 320 + Math.random() * 380, max: 700,
        c: colors[(Math.random() * colors.length) | 0],
        sz: 1 + ((Math.random() * 2) | 0),
        g: 0.00035
      });
    }
    if (this.parts.length > 420) this.parts.splice(0, this.parts.length - 420);
  };

  /* Dulkių pūstelėjimas ties nusileidimo vieta (horizontalus, žemas). */
  Channel.prototype.dust = function (x, y, n) {
    for (var i = 0; i < n; i++) {
      var dir = Math.random() < 0.5 ? -1 : 1;
      this.parts.push({
        x: x + (Math.random() * 16 - 8), y: y,
        vx: dir * (0.02 + Math.random() * 0.07), vy: -(0.005 + Math.random() * 0.03),
        life: 200 + Math.random() * 220, max: 420,
        c: ['#6b7290', '#8a92ad', '#4a5068'][(Math.random() * 3) | 0],
        sz: 1, g: 0.00022
      });
    }
  };

  Channel.prototype.ring = function (x, y, color) {
    this.rings.push({ x: x, y: y, r: 2, life: 260, max: 260, c: color });
  };

  Channel.prototype.lineFlash = function (rows) {
    this.flash.push({ rows: rows.slice(), t: 260, max: 260 });
  };

  /* Šviesos pluoštas, ištrykštantis pro lentos šonus per linijos valymą. */
  Channel.prototype.beam = function (y, color) {
    this.beams.push({ y: y, life: 320, max: 320, c: color });
    if (this.beams.length > 8) this.beams.shift();
  };

  /* Eilutė subyra į skeveldras — kiekvienas blokas savo spalva. */
  Channel.prototype.shatter = function (y, colorsRow, cell, boardW, power) {
    for (var x = 0; x < colorsRow.length; x++) {
      var type = colorsRow[x];
      if (!type) continue;
      var pal = C.COLORS[type] || C.COLORS.G;
      var n = 3 + ((Math.random() * 2) | 0);
      for (var i = 0; i < n; i++) {
        var px = x * cell + Math.random() * cell;
        var dirX = (px - boardW / 2) / (boardW / 2);      // sprogsta nuo centro į šonus
        this.parts.push({
          x: px, y: y + Math.random() * cell,
          vx: dirX * (0.05 + Math.random() * 0.13) * power + (Math.random() - 0.5) * 0.05,
          vy: -(0.02 + Math.random() * 0.11),
          life: 360 + Math.random() * 420, max: 780,
          c: pal[(Math.random() * 3) | 0],
          sz: 1 + ((Math.random() * 2) | 0),
          g: 0.00055
        });
      }
    }
    if (this.parts.length > 700) this.parts.splice(0, this.parts.length - 700);
  };

  /* Hard-drop šleifas: figūros siluetas keliose tarpinėse pozicijose. */
  Channel.prototype.trail = function (type, cells, px, y0, y1) {
    if (y1 - y0 < 2) return;
    this.trails.push({
      type: type, cells: cells, px: px, y0: y0, y1: y1,
      life: J.TRAIL_MS, max: J.TRAIL_MS
    });
    if (this.trails.length > 6) this.trails.shift();
  };

  /* ⚡ hard-drop atspaudas: figuros celes trumpam persviecia baltai (pasimegavimo 'trinkt') */
  Channel.prototype.stamp = function (type, cells, px, py) {
    this.stamps.push({ type: type, cells: cells, px: px, py: py, life: 170, max: 170 });
    if (this.stamps.length > 4) this.stamps.shift();
  };

  Channel.prototype.update = function (dt) {
    var i;
    this.shake = Math.max(0, this.shake - dt * 0.022);
    this.dangerT += dt;
    this.floorGlow = Math.max(0, this.floorGlow - dt * 0.0035);

    for (i = this.parts.length - 1; i >= 0; i--) {
      var p = this.parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.life -= dt;
      if (p.life <= 0) this.parts.splice(i, 1);
    }
    for (i = this.pops.length - 1; i >= 0; i--) {
      var q = this.pops[i];
      q.life -= dt; q.dy += q.vy * dt;
      if (q.life <= 0) this.pops.splice(i, 1);
    }
    for (i = this.flash.length - 1; i >= 0; i--) {
      this.flash[i].t -= dt;
      if (this.flash[i].t <= 0) this.flash.splice(i, 1);
    }
    for (i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }
    for (i = this.trails.length - 1; i >= 0; i--) {
      this.trails[i].life -= dt;
      if (this.trails[i].life <= 0) this.trails.splice(i, 1);
    }
    for (i = this.rings.length - 1; i >= 0; i--) {
      var r = this.rings[i];
      r.life -= dt; r.r += dt * 0.10;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (i = this.stamps.length - 1; i >= 0; i--) {
      this.stamps[i].life -= dt;
      if (this.stamps[i].life <= 0) this.stamps.splice(i, 1);
    }
  };

  Channel.prototype.offset = function () {
    if (this.shake <= 0.05) return [0, 0];
    var s = this.shake;
    return [
      Math.round((Math.random() * 2 - 1) * s),
      Math.round((Math.random() * 2 - 1) * s)
    ];
  };

  Channel.prototype.reset = function () {
    this.shake = 0;
    this.parts.length = 0; this.pops.length = 0;
    this.flash.length = 0; this.trails.length = 0; this.rings.length = 0;
    this.beams.length = 0;
    this.heartT = 0;
    this.clearFloor();
    this.stamps = [];
  };

  /* ================= globalus sluoksnis ================= */

  function FX() {
    this.you = new Channel();
    this.foe = new Channel();
    this.projectiles = [];
    this.confetti = [];
    this.flashA = 0;
    this.flashC = '#ffffff';
    this.freeze = 0;          // hit-stop: kiek ms sustabdyti varikliu­s
    this.shake = 0;           // viso ekrano drebėjimas
    this.embers = [];         // rusenančios žarijos fone (atmosfera)
    this.clashes = [];        // kirčiai mūšio koridoriuje (kai ataka pakertama)
    this.marks = [];          // crit / miss ženklai koridoriuje
    this.impacts = [];        // sviedinio sprogimai (F12 Arrow_Impact / Shaman_Explosion)
  }

  /* Sviedinio pataikymo sprogimas — TIKRAS F12 sprite'as, ne kibirkštys.
   * Kadrą parenka `Units.impactFrame(type, age)`; pasibaigus animacijai
   * jis grąžina null ir efektą pašalinam. */
  FX.prototype.impactBurst = function (x, lane, type) {
    this.impacts.push({ ax: x, lane: lane || 0, type: type, age: 0 });
    if (this.impacts.length > 16) this.impacts.shift();
  };

  /* Kirtis koridoriuje: t01 = kur kelyje unitas buvo, kai jį pakirto.
   * side = kieno pusėje ataka buvo laukiama ('you' -> ėjo į tavo lentą). */
  FX.prototype.clash = function (t01, side) {
    this.clashes.push({ t01: t01, side: side, life: 420, max: 420, seed: this.clashes.length });
    if (this.clashes.length > 24) this.clashes.shift();
  };

  /* Kovos ženklai koridoriuje: kritinis smūgis ir prašovimas.
   * Be užrašų — skiriasi forma, spalva ir judesiu. */
  FX.prototype.critMark = function (x, lane) {
    this.marks.push({ ax: x, lane: lane || 0, kind: 'crit', life: 620, max: 620, seed: this.marks.length });
    if (this.marks.length > 20) this.marks.shift();
  };
  FX.prototype.missMark = function (x, lane) {
    this.marks.push({ ax: x, lane: lane || 0, kind: 'miss', life: 700, max: 700, seed: this.marks.length });
    if (this.marks.length > 20) this.marks.shift();
  };

  /* MARCH režimas: kirtis TIKROJE koridoriaus vietoje (x — normalizuota ašis 0..1). */
  FX.prototype.clashSpark = function (x, strength, lane) {
    this.clashes.push({
      ax: x, lane: lane || 0,
      life: 420 * (strength || 1), max: 420 * (strength || 1),
      seed: this.clashes.length, strength: strength || 1
    });
    if (this.clashes.length > 24) this.clashes.shift();
  };

  /* Žarijos kyla nuo apačios ir supasi — atnaujinam piešimo metu,
   * nes tai grynai vizualu ir nedalyvauja žaidimo logikoje. */
  FX.prototype.updateEmbers = function (dt, vw, vh) {
    if (this.embers.length < 44 && Math.random() < dt * 0.018) {
      this.embers.push({
        x: Math.random() * vw, y: vh + 4,
        vx: (Math.random() - 0.5) * 0.006,
        vy: -(0.005 + Math.random() * 0.016),
        life: 4200 + Math.random() * 4200, max: 8400,
        sz: 1 + ((Math.random() * 2) | 0),
        w: Math.random() * Math.PI * 2
      });
    }
    for (var i = this.embers.length - 1; i >= 0; i--) {
      var e = this.embers[i];
      e.w += dt * 0.0035;
      e.x += (e.vx + Math.sin(e.w) * 0.005) * dt;
      e.y += e.vy * dt;
      e.life -= dt;
      if (e.life <= 0 || e.y < -8) this.embers.splice(i, 1);
    }
  };

  FX.prototype.ch = function (side) { return side === 'foe' ? this.foe : this.you; };

  /* Ataka, skriejanti per ekraną nuo siuntėjo lentos iki gavėjo lentos. */
  FX.prototype.projectile = function (x0, y0, x1, y1, lines, color, onArrive) {
    this.projectiles.push({
      x0: x0, y0: y0, x1: x1, y1: y1,
      t: 0, dur: J.PROJECTILE_MS,
      lines: lines, c: color, onArrive: onArrive,
      arc: (Math.random() * 2 - 1) * 26 - 34,
      spin: 0
    });
  };

  FX.prototype.flash = function (a, color) {
    this.flashA = Math.max(this.flashA, a);
    this.flashC = color || '#ffffff';
  };

  FX.prototype.hitstop = function (ms) {
    this.freeze = Math.max(this.freeze, ms);
  };

  FX.prototype.addShake = function (a) { this.shake = Math.max(this.shake, a); };

  FX.prototype.celebrate = function (vw) {
    for (var i = 0; i < 90; i++) {
      this.confetti.push({
        x: Math.random() * vw, y: -Math.random() * 200,
        vx: (Math.random() * 2 - 1) * 0.02, vy: 0.02 + Math.random() * 0.06,
        sz: 2 + ((Math.random() * 2) | 0),
        c: ['#f5c96b', '#5ce08a', '#57c7ff', '#ff7a90', '#ffffff'][(Math.random() * 5) | 0],
        rot: Math.random()
      });
    }
  };

  FX.prototype.offset = function () {
    if (this.shake <= 0.05) return [0, 0];
    var s = this.shake;
    return [Math.round((Math.random() * 2 - 1) * s), Math.round((Math.random() * 2 - 1) * s)];
  };

  /* Grąžina, kiek ms iš dt "suvalgė" hit-stop (tiek variklis nejuda). */
  FX.prototype.consumeFreeze = function (dt) {
    if (this.freeze <= 0) return 0;
    var used = Math.min(this.freeze, dt);
    this.freeze -= used;
    return used;
  };

  FX.prototype.update = function (dt) {
    this.you.update(dt);
    this.foe.update(dt);
    this.shake = Math.max(0, this.shake - dt * 0.02);
    this.flashA = Math.max(0, this.flashA - dt * 0.0035);

    var i;
    for (i = this.projectiles.length - 1; i >= 0; i--) {
      var p = this.projectiles[i];
      p.t += dt;
      p.spin += dt * 0.012;
      if (p.t >= p.dur) {
        if (p.onArrive) p.onArrive(p);
        this.projectiles.splice(i, 1);
      }
    }
    for (i = this.marks.length - 1; i >= 0; i--) {
      this.marks[i].life -= dt;
      if (this.marks[i].life <= 0) this.marks.splice(i, 1);
    }
    for (i = this.clashes.length - 1; i >= 0; i--) {
      this.clashes[i].life -= dt;
      if (this.clashes[i].life <= 0) this.clashes.splice(i, 1);
    }
    /* Sprogimai gyvena tiek, kiek trunka jų sprite'as (F12 kadrų x ms).
     * Trukmes valdo `Units.impactFrame` — kai jis grazina null, efektas baigtas. */
    for (i = this.impacts.length - 1; i >= 0; i--) {
      this.impacts[i].age += dt;
      if (this.impacts[i].age > 900) this.impacts.splice(i, 1);
    }
    for (i = this.confetti.length - 1; i >= 0; i--) {
      var c = this.confetti[i];
      c.x += c.vx * dt; c.y += c.vy * dt; c.rot += dt * 0.004;
      if (c.y > 400) this.confetti.splice(i, 1);
    }
  };

  FX.prototype.reset = function () {
    this.you.reset(); this.foe.reset();
    this.projectiles.length = 0;
    this.confetti.length = 0;
    this.clashes.length = 0;
    this.marks.length = 0;
    this.impacts.length = 0;
    this.flashA = 0; this.freeze = 0; this.shake = 0;
    /* žarijos NEvalomos — jos yra nuolatinė atmosfera, ne rungtynių efektas */
  };

  global.FX = FX;
  global.FXChannel = Channel;
})(window);
