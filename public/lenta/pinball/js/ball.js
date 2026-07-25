// ball.js — BallController: kamuoliuko fizika (fixed timestep + CCD substeps),
// max greitis, kontaktų atsakas, plunger seat, anti-stuck. Efektai per `ctx`.
class BallController {
  constructor(seatX, seatY) {
    this.r = CONFIG.ball.radius;
    this.seatX = seatX; this.seatY = seatY;
    this.reset();
  }

  reset() {
    // Kamuoliukas LAIKOMAS viršuj (frozen), kol paspaudi klavišą. Game._dropBall pastato
    // į atsitiktinį viršaus tašką; paspaudus → _releaseBall paleidžia žemyn.
    this.x = this.seatX; this.y = this.seatY;
    this.vx = 0; this.vy = 0;
    this.onPlunger = true;
    this.stuckT = 0;
    this.lastSpeed = 0;
    this.squash = 0;   // impact squash (juice) — 0..1, gesta laike
  }

  toPlunger() { this.reset(); }

  launch(power) {
    this.onPlunger = false;
    this.vx = 0;
    this.vy = -power;   // aukštyn (y-žemyn koord.)
  }

  clampSpeed() {
    const s = Math.hypot(this.vx, this.vy);
    if (s > CONFIG.maxSpeed) {
      const k = CONFIG.maxSpeed / s;
      this.vx *= k; this.vy *= k;
    }
  }

  // Pagrindinis fizikos žingsnis (kviečiamas fixed dt).
  // SVARBU: flipperiai judinami substepais KARTU su kamuoliuku (CCD), kitaip
  // greitas flipperio galas (~1400 vnt/s) peršoka pro kamuoliuką (tunneling).
  update(dt, ctx) {
    if (this.onPlunger) {
      for (const f of ctx.flippers) f.update(dt);   // leidžiam vartyti flipperius
      this.vx = 0; this.vy = 0;                       // laikomas ten, kur pastatytas (drop taškas)
      return;
    }

    // Gravitacija + oro pasipriešinimas.
    this.vy += CONFIG.gravity * dt;
    const dmp = 1 - CONFIG.linearDamping * dt;
    if (dmp > 0) { this.vx *= dmp; this.vy *= dmp; }
    this.clampSpeed();

    // Substepų skaičius pagal DIDŽIAUSIĄ greitį: kamuoliukas ARBA flipperio galas.
    let maxSp = Math.hypot(this.vx, this.vy);
    for (const f of ctx.flippers) {
      const target = f.pressed ? f.pressAngle : f.restAngle;
      if (f.angle !== target) {
        const w = f.pressed ? CONFIG.flipper.raiseSpeed : CONFIG.flipper.returnSpeed;
        const tip = w * f.length;             // flipperio galo linijinis greitis
        if (tip > maxSp) maxSp = tip;
      }
    }
    let steps = Math.ceil((maxSp * dt) / (this.r * 0.5));
    steps = M.clamp(steps, 1, CONFIG.maxSubSteps);
    const sdt = dt / steps;

    for (let i = 0; i < steps; i++) {
      for (const f of ctx.flippers) f.update(sdt);   // flipperis juda KARTU
      this.x += this.vx * sdt;
      this.y += this.vy * sdt;
      this._collideAll(ctx);
    }

    this._antiStuck(dt);
    this.lastSpeed = Math.hypot(this.vx, this.vy);
  }

  _collideAll(ctx) {
    const t = ctx.table;
    for (let i = 0; i < t.segments.length; i++) this._resolveSeg(t.segments[i], ctx);
    for (let i = 0; i < t.circles.length; i++) this._resolveCircle(t.circles[i], ctx);
    // Flipperiai paskutiniai — jų „kick" nenustelbiamas sienų depenetracijos.
    for (let i = 0; i < ctx.flippers.length; i++) this._resolveFlipper(ctx.flippers[i], ctx);
  }

  _resolveSeg(seg, ctx) {
    if (seg.dropped || seg.billiardOnly) return;   // billiardOnly — tik dideliems rutuliams

    const h = collideCircleSegment(this.x, this.y, this.r, seg);
    if (!h) return;
    this.x += h.nx * h.pen; this.y += h.ny * h.pen;
    const vn = this.vx * h.nx + this.vy * h.ny;
    if (vn >= 0) return;                 // tolsta — nekvieskim atsako
    const e = seg.rest;
    this.vx -= (1 + e) * vn * h.nx;
    this.vy -= (1 + e) * vn * h.ny;
    // Tangentinis trynimas.
    if (seg.fric) {
      const vn2 = this.vx * h.nx + this.vy * h.ny;
      const tvx = this.vx - vn2 * h.nx, tvy = this.vy - vn2 * h.ny;
      this.vx -= tvx * seg.fric; this.vy -= tvy * seg.fric;
    }
    // Papildomas impulsas (slingshot).
    if (seg.impulse) { this.vx += h.nx * seg.impulse; this.vy += h.ny * seg.impulse; }
    this.clampSpeed();
    ctx.onHit(seg, -vn, h.cx, h.cy);
  }

  _resolveCircle(cir, ctx) {
    if (cir.dead) return;   // nugalėtas bosas — praeinamas
    if (cir._spawnActive === false) return;   // dar „pop" atsiradime — praeinamas
    const h = collideCircleCircle(this.x, this.y, this.r, cir.x, cir.y, cir.r);
    if (!h) return;
    // Visada išstumk kamuoliuką iš persidengimo (n rodo nuo rutulio į kamuoliuką).
    this.x += h.nx * h.pen; this.y += h.ny * h.pen;

    // ── Dinaminis biliardo rutulys: dviejų kūnų elastinis smūgis (impulsas
    // perduodamas rutuliui → jis pradeda riedėti). Nėra „nemokamo" impulso.
    if (cir.dynamic) {
      const relx = this.vx - cir.vx, rely = this.vy - cir.vy;
      const vrn = relx * h.nx + rely * h.ny;      // santykinis greitis išilgai normalės
      if (vrn >= 0) return;                        // tolsta — nekvieskim atsako
      const e = CONFIG.billiard.restBall;
      const mBall = CONFIG.billiard.cueMass, mCir = cir.mass;
      const j = -(1 + e) * vrn / (1 / mBall + 1 / mCir);   // impulso skaliaras
      this.vx += (j / mBall) * h.nx; this.vy += (j / mBall) * h.ny;
      cir.vx -= (j / mCir) * h.nx;   cir.vy -= (j / mCir) * h.ny;
      this.clampSpeed();
      const cs = Math.hypot(cir.vx, cir.vy), cm = CONFIG.billiard.maxSpeed;
      if (cs > cm) { cir.vx = cir.vx / cs * cm; cir.vy = cir.vy / cs * cm; }
      ctx.onHit(cir, -vrn, h.cx, h.cy);
      return;
    }

    // ── Statiškas rutulys (postas/kickeris/bosas): atspindys + galimas impulsas.
    const vn = this.vx * h.nx + this.vy * h.ny;
    if (vn >= 0) return;
    const e = cir.rest;
    this.vx -= (1 + e) * vn * h.nx;
    this.vy -= (1 + e) * vn * h.ny;
    if (cir.impulse) { this.vx += h.nx * cir.impulse; this.vy += h.ny * cir.impulse; }
    this.clampSpeed();
    ctx.onHit(cir, -vn, h.cx, h.cy);
  }

  // Judantis flipperis: atsakas per SANTYKINĮ greitį → perduoda paviršiaus greitį
  // (ω×r). Tipas (didesnis r) natūraliai muša stipriau nei pagrindas.
  _resolveFlipper(f, ctx) {
    const c = M.closestOnSeg(this.x, this.y, f.px, f.py, f.tipX, f.tipY);
    const dx = this.x - c.x, dy = this.y - c.y;
    const d = Math.hypot(dx, dy);
    const min = this.r + f.half;
    if (d >= min) return;
    let nx, ny;
    if (d > 1e-6) { nx = dx / d; ny = dy / d; }
    else { nx = 0; ny = -1; }
    this.x += nx * (min - d); this.y += ny * (min - d);

    // Paviršiaus greitis kontakto taške dėl sukimosi: v = ω × r.
    const rx = c.x - f.px, ry = c.y - f.py;
    const svx = -f.omega * ry, svy = f.omega * rx;
    const relx = this.vx - svx, rely = this.vy - svy;
    const vrn = relx * nx + rely * ny;
    if (vrn >= 0) return;

    const e = CONFIG.restFlipper;
    const j = -(1 + e) * vrn * CONFIG.flipper.kick;   // impulsas išilgai normalės
    this.vx += j * nx; this.vy += j * ny;
    this.clampSpeed();
    ctx.onFlipperHit(f, Math.abs(vrn), this.x, this.y);
  }

  _antiStuck(dt) {
    const sp = Math.hypot(this.vx, this.vy);
    if (sp < CONFIG.antiStuck.speedEps) {
      this.stuckT += dt;
      if (this.stuckT > CONFIG.antiStuck.timeSec) {
        this.vx += M.rand(-1, 1) * CONFIG.antiStuck.nudge;
        this.vy -= CONFIG.antiStuck.nudge;   // stumtelk aukštyn
        this.stuckT = 0;
      }
    } else {
      this.stuckT = 0;
    }
  }
}
