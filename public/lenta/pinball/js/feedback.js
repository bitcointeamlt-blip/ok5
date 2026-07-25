// feedback.js — FeedbackManager: dalelės, screen shake, hit-stop, popup tekstai.
// SVARBU: efektai ATSKIRTI nuo fizikos — jie NIEKADA nekeičia kamuoliuko būsenos.
const POP_OUT = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
class FeedbackManager {
  constructor(camera, audio) {
    this.camera = camera;
    this.audio = audio;
    this.particles = [];
    this.pops = [];        // {x,y,text,life,ttl,color}
    this.rings = [];       // besiplečiančios bangos {x,y,color,r,maxR,speed,life,ttl}
    this.bolts = [];       // žaibai {x1,y1,x2,y2,color,life,ttl,seed}
    this.hitStop = 0;      // s — Game praleidžia fizikos žingsnius kol > 0
    this.flash = 0;        // trumpas ekrano blyksnis (0..1)
    // „+N" skaičiukų PIXEL-ART režimas (kaip F12 pewpew): renderinam į mažą buferį ir
    // padidinam nearest-neighbor. Vartotojui nepatiko (07-19) → GLOTNUS režimas (false).
    // Norint vėl pabandyti pixel-art — _pixelPops = true.
    this._pixelPops = false;
    this._popC = null; this._popX = null;   // lazy offscreen buferis
  }

  // Nupiešia „+N" su visais efektais (švytėjimas+šešėlis+kontūras+užpildas+blikas)
  // ant duoto ctx `g` centre (cx,cy). Naudojama ir glotniam, ir pixel (buferio) keliui.
  _paintPop(g, cx, cy, text, color, alpha, flash) {
    g.globalAlpha = alpha * 0.28;                                   // spalvotas švytėjimas
    g.fillStyle = color;
    g.save(); g.translate(cx, cy); g.scale(1.35, 1.35); g.fillText(text, 0, 0); g.restore();
    g.globalAlpha = alpha * 0.5; g.fillStyle = '#000'; g.fillText(text, cx + 0.8, cy + 1.4);   // šešėlis
    g.globalAlpha = alpha * 0.92; g.fillStyle = '#1a0e04';          // storas kontūras
    for (const o of POP_OUT) g.fillText(text, cx + o[0], cy + o[1]);
    g.globalAlpha = alpha; g.fillStyle = flash ? '#ffffff' : color; g.fillText(text, cx, cy);  // užpildas
    g.globalAlpha = alpha * 0.55; g.fillStyle = '#fff'; g.fillText(text, cx, cy - 0.7);         // blikas
    g.globalAlpha = 1;
  }

  // Besiplečianti banga (shockwave) — kontakto efektams.
  ring(x, y, color, maxR, speed) {
    this.rings.push({ x, y, color, r: 3, maxR, speed, life: 0.5, ttl: 0.5 });
  }
  // Žaibas tarp dviejų taškų (geltonas „zap").
  bolt(x1, y1, x2, y2, color) {
    this.bolts.push({ x1, y1, x2, y2, color, life: 0.2, ttl: 0.2, seed: (x1 * 12.9 + y2 * 7.3) });
  }

  burst(x, y, n, color, speed) {
    for (let i = 0; i < n; i++) {
      const a = M.rand(0, Math.PI * 2);
      const s = M.rand(0.3, 1) * speed;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: M.rand(0.25, 0.5), ttl: 0.5, color, size: M.rand(1, 2.2),
      });
    }
  }

  popup(x, y, text, color, scale) {
    // Juicy „+N": ŠAUNA aukštyn su arka + šoniniu išsibarstymu + pakrypimu; piešiant —
    // stiprus elastinis overshoot + auksinis-įspaustas kontūras/blikas (žr. draw).
    const sc = scale || 1;
    this.pops.push({
      x: x + M.rand(-2, 2), y, text, color: color || '#fff', life: 0.95, ttl: 0.95, scale: sc,
      vx: M.rand(-18, 18), vy: -58 - sc * 12, rot: M.rand(-0.16, 0.16),
    });
  }

  // Kryptingos kibirkštys (juice): dalelės skrieja kūgiu apie (dx,dy).
  spark(x, y, dx, dy, n, color, speed) {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + M.rand(-0.7, 0.7), s = M.rand(0.4, 1) * speed;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: M.rand(0.2, 0.45), ttl: 0.45, color, size: M.rand(1, 2.4) });
    }
  }

  requestHitStop(sec) { this.hitStop = Math.max(this.hitStop, sec); }

  update(dt) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += 300 * dt;                 // dalelių gravitacija (tik vizualas)
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const q = this.pops[i];
      q.life -= dt;
      if (q.life <= 0) { this.pops.splice(i, 1); continue; }
      q.vy += 95 * dt;                       // arka: kyla, lėtėja, švelniai atsisėda
      q.vx *= (1 - 3 * dt);                  // šoninis stabdymas
      q.x += q.vx * dt; q.y += q.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      r.r = Math.min(r.maxR, r.r + r.speed * dt);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].life -= dt;
      if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = M.clamp(p.life / p.ttl, 0, 1);
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.ceil(s), Math.ceil(s));
    }
    // Bangos (shockwave) — plonėja ir blanksta plėsdamosi.
    for (const r of this.rings) {
      const k = M.clamp(r.life / r.ttl, 0, 1);
      ctx.globalAlpha = k * 0.85;
      ctx.strokeStyle = r.color; ctx.lineWidth = 1 + k * 1.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    // Žaibai — dantytos linijos tarp rutulių.
    for (const b of this.bolts) {
      ctx.globalAlpha = M.clamp(b.life / b.ttl, 0, 1);
      ctx.strokeStyle = b.color; ctx.lineWidth = 1.4;
      const dx = b.x2 - b.x1, dy = b.y2 - b.y1, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len, seg = 6;
      ctx.beginPath();
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const off = (i === 0 || i === seg) ? 0 : Math.sin(b.seed + i * 2.3) * 4;
        const x = b.x1 + dx * t + nx * off, y = b.y1 + dy * t + ny * off;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Pixel režimui — lazy buferis (mažas, renderinam į jį low-res, blitinam nearest-neighbor).
    const pixel = this._pixelPops && typeof document !== 'undefined';
    if (pixel && !this._popC) {
      this._popC = document.createElement('canvas');
      this._popC.width = 100; this._popC.height = 44;
      this._popX = this._popC.getContext('2d');
    }
    const usePixel = pixel && this._popX;
    for (const q of this.pops) {
      const age = q.ttl - q.life;
      const popIn = Math.min(1, age / 0.08);
      const bump = age > 0.08 ? Math.max(0, 1 - (age - 0.08) / 0.17) : 1;
      const s = popIn * (1 + bump * 0.7) * (q.scale || 1);      // snapus elastinis overshoot
      const alpha = q.life < 0.28 ? q.life / 0.28 : 1;
      const flash = age < 0.06;
      const rot = (q.rot || 0) * (0.4 + bump * 0.6);            // pakrypimas
      if (usePixel) {
        // PIXEL-ART: efektai į mažą buferį (9px šriftas) → padidinta nearest-neighbor (chunky).
        const bw = this._popC.width, bh = this._popC.height, bx = this._popX;
        bx.setTransform(1, 0, 0, 1, 0, 0);
        bx.clearRect(0, 0, bw, bh);
        bx.textAlign = 'center'; bx.textBaseline = 'middle'; bx.font = 'bold 9px monospace';
        this._paintPop(bx, bw / 2, bh / 2, q.text, q.color, alpha, flash);
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(rot);
        ctx.imageSmoothingEnabled = false;                     // → chunky pikseliai
        const k = 1.5 * s;                                     // buferio px → pasaulio px (chunkiškumas)
        ctx.drawImage(this._popC, -bw / 2 * k, -bh / 2 * k, bw * k, bh * k);
        ctx.imageSmoothingEnabled = true;
        ctx.restore();
      } else {
        // Glotnus (senasis) kelias — grąžinimui (_pixelPops = false).
        ctx.save();
        ctx.translate(q.x, q.y); ctx.rotate(rot); ctx.scale(s, s);
        ctx.font = 'bold 12px monospace';
        this._paintPop(ctx, 0, 0, q.text, q.color, alpha, flash);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}
