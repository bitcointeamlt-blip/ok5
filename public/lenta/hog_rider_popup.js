// 🐗 HOG RIDER EVENT POPUP — launch-time event modal
// Rodomas iškart po game launch. "Maybe later" → close. "Don't show today" → suppress 24h.
(function () {
  'use strict';

  // ─── GLOBAL EVENT WINDOW (vienoda pradžia/pabaiga VISIEMS žaidėjams) ───
  // Nustatyk TIKRĄ launch momentą čia (UTC). Pabaiga = start + EVENT_DURATION_DAYS.
  // Visi žaidėjai mato tą patį countdown'ą — nepriklauso nuo to, kada pirmą kartą įėjo.
  // ⚠️ PRIEŠ MAINNET LAUNCH: pakeisk į realią datą (turi sutapti su addUnitType(5) TX laiku).
  const EVENT_START_UTC    = '2026-05-30T00:00:00Z';   // ← globali pradžia (UTC) — TESTAVIMUI aktyvi dabar; prieš launch keisk į realią datą
  const EVENT_DURATION_DAYS = 6;                        // ← event trukmė dienomis (atviras visiems, be fazių)
  const EVENT_START_MS     = Date.parse(EVENT_START_UTC);
  const EVENT_DURATION     = EVENT_DURATION_DAYS * 24 * 60 * 60 * 1000;
  const EVENT_END_MS       = EVENT_START_MS + EVENT_DURATION;

  // ─── MASTER SWITCH — mint atrakinimas ─────────────────────────────────
  // false = "COMING SOON" (mygtukas užrakintas, TRAIN tile paslėptas, countdown="COMING SOON").
  // true  = mintas veikia (mygtukas atidaro Barracks, tile matomas, countdown tiksi).
  // 🚀 LAUNCH metu: (1) addUnitType(5) mainnet, (2) EVENT_START_UTC=launch data,
  //                 (3) HOG_LAUNCHED=true, (4) deploy. Viskas pradeda veikti.
  const HOG_LAUNCHED = false;

  const EVENT_KEY        = 'hogEventDismissedAt';   // ms timestamp of last "don't show today"
  const SUPPRESS_24H     = 24 * 60 * 60 * 1000;
  const LAUNCH_DELAY     = 3000;                    // ms after F10 fully loaded
  const DEFAULT_PRICE    = '… RONKE';               // loading placeholder until live price resolves
  const HOG_UTYPE        = 5;                       // Hog Rider planned utype on Barracks contract

  function _getEventStart() {
    return EVENT_START_MS;   // globali fiksuota pradžia — vienoda visiems
  }

  function _isEventActive() {
    const now = Date.now();
    return now >= EVENT_START_MS && now < EVENT_END_MS;   // globalus langas [start, end)
  }

  // Rodo/slepia Hog Rider TRAIN tile pagal globalų langą.
  // Event metu — matomas (mint'inamas). Prieš start / po pabaigos — paslėptas (UI cutoff).
  // Techninis bypass lieka, bet po event'o owner nustato 6.5× kainą (updateUnitType(5,65535)).
  function _syncHogTile() {
    const tile = document.querySelector('.nft-unit-option-hog');
    if (!tile) return;
    if (!HOG_LAUNCHED) {
      // Pre-launch: MATOMAS bet UŽTAMSINTAS (coming soon — negalima mintinti, tik preview)
      tile.style.display = '';
      tile.classList.add('hog-locked');
    } else if (_isEventActive()) {
      // Atrakinta + event lange: normalus, mint'inamas
      tile.style.display = '';
      tile.classList.remove('hog-locked');
    } else {
      // Atrakinta bet event baigėsi: paslėptas
      tile.style.display = 'none';
      tile.classList.remove('hog-locked');
    }
  }

  function _isDismissedToday() {
    const dismissedAt = parseInt(localStorage.getItem(EVENT_KEY) || '0', 10);
    if (!dismissedAt) return false;
    return (Date.now() - dismissedAt) < SUPPRESS_24H;
  }

  function _formatCountdown(ms) {
    if (ms <= 0) return 'ENDED';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    return `${m}m ${sec}s`;
  }

  // Hog Rider planned multiplier — 3× current Skull price (per global supply formula)
  const HOG_PRICE_MULT = 3;

  // Synchronous fallback (used if Barracks API not ready yet)
  function _computePriceSync() {
    return DEFAULT_PRICE;
  }

  // Async — fetches the LIVE supply-based base price from the contract
  // (getCurrentPricing — the "current units" price, all base types are 1.0x)
  // and multiplies by 3 per the Hog Rider rule. No wallet needed (public RPC).
  // Uses cached value if available so popup shows something instantly, then updates.
  function _computePriceAsync(priceEl) {
    if (!priceEl) return;
    try {
      const cached = localStorage.getItem('hogPriceCache');
      if (cached) priceEl.textContent = cached;
    } catch (_) {}

    if (!window.BarracksNFT || typeof window.BarracksNFT.getCurrentPricing !== 'function') {
      return; // Barracks module not loaded yet — fallback already shown
    }

    (async () => {
      try {
        // Live base per-unit price @ current network supply (= current units' cost)
        const { cost } = await window.BarracksNFT.getCurrentPricing();
        if (!cost || typeof cost !== 'bigint') return;
        const hogCost = cost * BigInt(HOG_PRICE_MULT);   // Hog Rider = 3× current units
        const formatted = await window.BarracksNFT.formatEther(hogCost);
        const rounded = Math.round(parseFloat(formatted));
        const display = `${rounded.toLocaleString('en-US')} RONKE`;
        priceEl.textContent = display;
        try { localStorage.setItem('hogPriceCache', display); } catch (_) {}
      } catch (e) {
        console.warn('[HogRiderPopup] Price fetch failed:', e);
      }
    })();
  }

  // Fetch global Hog Rider mint count from contract (utype=5).
  // Until utype=5 is registered on-chain, this returns 0.
  function _fetchGlobalMintCount(mintedEl) {
    if (!mintedEl) return;
    try {
      const cached = localStorage.getItem('hogMintedCache');
      if (cached) mintedEl.textContent = cached;
    } catch (_) {}

    if (!window.BarracksNFT || typeof window.BarracksNFT.fetchState !== 'function') return;

    (async () => {
      try {
        // Try utype-specific count if API exposes it
        if (typeof window.BarracksNFT.totalMintedByType === 'function') {
          const n = await window.BarracksNFT.totalMintedByType(HOG_UTYPE);
          const display = String(n || 0);
          mintedEl.textContent = display;
          try { localStorage.setItem('hogMintedCache', display); } catch (_) {}
          return;
        }
        // Fallback: utype=5 not registered yet → 0
        mintedEl.textContent = '0';
        try { localStorage.setItem('hogMintedCache', '0'); } catch (_) {}
      } catch (e) {
        console.warn('[HogRiderPopup] Mint count fetch failed:', e);
      }
    })();
  }

  let _countdownTimer = null;
  let _demoTimers = [];

  function _clearDemo() {
    _demoTimers.forEach(t => clearTimeout(t));
    _demoTimers = [];
  }

  // Canvas-based death particle system — matches game.js spawnDeath() physics exactly.
  // Per-frame: p.x += p.vx, p.vx *= 0.91 (friction), p.life -= p.decay.
  // Render: pixel squares with #ff3333 red, 25% white with glow + shockwave ring.
  const _DemoFx = {
    canvas: null,
    ctx: null,
    particles: [],
    rings: [],
    flashes: [],
    stains: [],
    rafId: null,
    lastT: 0,

    _ensureCanvas() {
      const c = document.getElementById('hog-demo-canvas');
      if (!c) return null;
      if (this.canvas !== c) {
        this.canvas = c;
        this.ctx = c.getContext('2d');
      }
      // Resize to match displayed size (handles DPR + responsive)
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return this.ctx;
    },

    spawn(targetEl) {
      const ctx = this._ensureCanvas();
      if (!ctx) return;
      const wrap = this.canvas.parentElement;
      const wrapRect = wrap.getBoundingClientRect();
      const tRect    = targetEl.getBoundingClientRect();
      const cx = tRect.left - wrapRect.left + tRect.width  * 0.5;
      const cy = tRect.top  - wrapRect.top  + tRect.height * 0.55;

      // Bright white radial flash — quick burst of light at impact
      this.flashes.push({
        x: cx, y: cy,
        r0: 12, r1: 90,
        life: 1, decay: 0.13
      });
      // Shockwave white ring
      this.rings.push({
        x: cx, y: cy,
        r0: 8, r1: 75,
        life: 1, decay: 0.045,
        color: 'rgba(255,255,255,0.9)'
      });
      // Inner crimson ring
      this.rings.push({
        x: cx, y: cy,
        r0: 4, r1: 55,
        life: 1, decay: 0.06,
        color: 'rgba(255,80,80,0.7)'
      });
      // Ground stain — dark scorch ellipse lingers at death point
      this.stains.push({
        x: cx, y: cy + (tRect.height * 0.18),
        rx: 26, ry: 7,
        life: 1, decay: 0.008
      });

      // 64 pixel particles — game.js:22599 numPixels = 64
      // Varied red palette: 60% red, 15% deep red, 25% white-glow
      const NUM = 64;
      const REDS = ['#ff3333', '#ff5544', '#cc1818', '#aa0e0e'];
      for (let i = 0; i < NUM; i++) {
        const a = Math.PI * 2 * Math.random();
        const s = (0.4 + Math.random() * 3.5) * 1.6;
        const isWhite = Math.random() < 0.22;
        const color = isWhite ? '#ffffff' : REDS[(Math.random() * REDS.length) | 0];
        this.particles.push({
          x:  cx + (Math.random() - 0.5) * 18,
          y:  cy + (Math.random() - 0.5) * 18,
          vx: Math.cos(a) * s * 1.5,
          vy: Math.sin(a) * s * 1.5 - 0.8,
          life:  1,
          decay: 0.015 + Math.random() * 0.025,
          r:     3 + Math.random() * 5,
          isWhite,
          color
        });
      }

      // Floating damage number "-1" — random 25% chance for crit "FATAL!"
      this._spawnDamageNumber(wrap, cx, cy - 30);

      // Screen shake on impact (subtle, 320ms)
      if (wrap && !wrap.classList.contains('shake')) {
        wrap.classList.add('shake');
        setTimeout(() => wrap.classList.remove('shake'), 350);
      }

      this._startLoop();
    },

    _spawnDamageNumber(wrap, x, y) {
      if (!wrap) return;
      const dmg = 10 + Math.floor(Math.random() * 16); // 10..25

      // Damage number (crit-style, rises straight up)
      const n = document.createElement('div');
      n.className = 'hog-demo-dmg-num crit';
      n.textContent = '-' + dmg;
      n.style.left = `${x}px`;
      n.style.top  = `${y}px`;
      wrap.appendChild(n);
      n.animate([
        { transform: 'translate(-50%, -50%) scale(0.4)',     opacity: 0 },
        { transform: 'translate(-50%, -110%) scale(1.3)',    opacity: 1, offset: 0.18 },
        { transform: 'translate(-50%, -200%) scale(1.1)',    opacity: 1, offset: 0.65 },
        { transform: 'translate(-50%, -270%) scale(0.9)',    opacity: 0 }
      ], { duration: 1200, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)', fill: 'forwards' });
      setTimeout(() => n.remove(), 1300);

      // OVERKILL badge — drops in from above the damage number, hangs, then fades
      const k = document.createElement('div');
      k.className = 'hog-demo-overkill';
      k.textContent = 'OVERKILL!';
      k.style.left = `${x}px`;
      k.style.top  = `${y - 38}px`;
      wrap.appendChild(k);
      k.animate([
        { transform: 'translate(-50%, -90%) scale(0.5) rotate(-8deg)',  opacity: 0 },
        { transform: 'translate(-50%, -160%) scale(1.25) rotate(-3deg)', opacity: 1, offset: 0.22 },
        { transform: 'translate(-50%, -180%) scale(1.0) rotate(-3deg)',  opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -220%) scale(0.9) rotate(-3deg)',  opacity: 0 }
      ], { duration: 1400, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)', fill: 'forwards' });
      setTimeout(() => k.remove(), 1500);
    },

    _startLoop() {
      if (this.rafId) return;
      this.lastT = performance.now();
      const tick = (now) => {
        const dt = Math.min(48, now - this.lastT);
        this.lastT = now;
        this._step(dt);
        this._render();
        if (this.particles.length === 0 && this.rings.length === 0 && this.flashes.length === 0 && this.stains.length === 0) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
          if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          return;
        }
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    },

    _step(dt) {
      const scale = dt / 16.67;
      const friction = Math.pow(0.91, scale);
      const lifeMult = scale;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * scale;
        p.y += p.vy * scale;
        p.vx *= friction;
        p.vy *= friction;
        p.life -= p.decay * lifeMult;
        if (p.life <= 0) {
          this.particles[i] = this.particles[this.particles.length - 1];
          this.particles.pop();
        }
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.life -= r.decay * lifeMult;
        if (r.life <= 0) { this.rings[i] = this.rings[this.rings.length - 1]; this.rings.pop(); }
      }
      for (let i = this.flashes.length - 1; i >= 0; i--) {
        const f = this.flashes[i];
        f.life -= f.decay * lifeMult;
        if (f.life <= 0) { this.flashes[i] = this.flashes[this.flashes.length - 1]; this.flashes.pop(); }
      }
      for (let i = this.stains.length - 1; i >= 0; i--) {
        const s = this.stains[i];
        s.life -= s.decay * lifeMult;
        if (s.life <= 0) { this.stains[i] = this.stains[this.stains.length - 1]; this.stains.pop(); }
      }
    },

    _render() {
      const ctx = this.ctx;
      if (!ctx) return;
      const w = this.canvas.width / (window.devicePixelRatio || 1);
      const h = this.canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      // Stains (pass 0 — ground decals under everything)
      for (const s of this.stains) {
        ctx.globalAlpha = s.life * 0.7;
        ctx.fillStyle = '#400a0a';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = s.life * 0.9;
        ctx.fillStyle = '#1a0404';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.rx * 0.55, s.ry * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // White radial flash (pass 0.5 — bright burst under particles, brief)
      for (const f of this.flashes) {
        const t = 1 - f.life;
        const rad = f.r0 + (f.r1 - f.r0) * t;
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
        grad.addColorStop(0,    `rgba(255,255,255,${(f.life * 0.95).toFixed(3)})`);
        grad.addColorStop(0.3,  `rgba(255,220,160,${(f.life * 0.6).toFixed(3)})`);
        grad.addColorStop(0.7,  `rgba(255,80,40,${(f.life * 0.3).toFixed(3)})`);
        grad.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(f.x, f.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rings (pass 1 — over flash, under particles)
      for (const r of this.rings) {
        const t = 1 - r.life;
        const rad = r.r0 + (r.r1 - r.r0) * t;
        ctx.globalAlpha = r.life * 0.9;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = Math.max(0.5, 3 * r.life);
        ctx.beginPath();
        ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Particles pass 1 — solid color (no glow)
      ctx.shadowBlur = 0;
      for (const p of this.particles) {
        if (p.isWhite) continue;
        ctx.globalAlpha = p.life > 0.5 ? 1 : p.life * 2;
        ctx.fillStyle = p.color;
        const size = Math.max(1, Math.round(p.r * (0.3 + 0.7 * p.life)));
        ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
      }

      // Particles pass 2 — white with glow (shadowBlur 8, matches game.js:25724)
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffffff';
      for (const p of this.particles) {
        if (!p.isWhite) continue;
        ctx.globalAlpha = p.life > 0.5 ? 1 : p.life * 2;
        const size = Math.max(1, Math.round(p.r * (0.3 + 0.7 * p.life)));
        ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    },

    clear() {
      this.particles = [];
      this.rings = [];
      this.flashes = [];
      this.stains = [];
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }
  };

  function _spawnDeathParticles(targetEl) {
    _DemoFx.spawn(targetEl);
  }

  // Preload VISŲ Hog Rider sprite sheet'ų — kitaip attack/dmg-take (~800KB) yra
  // lazy-loaded ir nespėja užsikrauti per trumpą animacijos langą → sprite dingsta.
  let _spritesPreloaded = false;
  function _preloadSprites() {
    if (_spritesPreloaded) return;
    _spritesPreloaded = true;
    ['pigronke.png', 'pigronkewalk.png', 'ronkepigattack.png', 'dmgtake01.png'].forEach(src => {
      const img = new Image();
      img.src = src;
    });
  }

  // Battle demo: Hog Rider stovi vietoj su walk anim, spider ateina iš dešinės,
  // beveik prie pat — AOE attack (kaip F9 pigronke ietis), spider miršta. Loop.
  function _runBattleDemo() {
    const pig       = document.getElementById('hog-demo-pig');
    const pigFlash  = document.getElementById('hog-demo-pig-flash');
    const spider    = document.getElementById('hog-demo-spider');
    const aoe       = document.getElementById('hog-demo-aoe');
    if (!pig || !spider || !aoe || !pigFlash) return;

    _clearDemo();
    _DemoFx.clear();

    // Reset — instant teleport spider off-screen right + clear pig inline transform
    pig.removeAttribute('data-anim');
    pig.classList.remove('dmg-hit');
    pig.style.transition = 'none';
    pig.style.transform = '';
    spider.removeAttribute('data-anim');
    spider.removeAttribute('data-state');
    spider.classList.add('no-transition');
    spider.style.transform = 'translateX(60%) scaleX(-1)';
    spider.style.opacity = '0';
    spider.style.visibility = 'visible';
    void spider.offsetWidth;
    spider.classList.remove('no-transition');
    aoe.classList.remove('fire');
    pigFlash.classList.remove('fire');

    // Random spider approach distance ±5% so each loop feels different
    const stopPct = -42 + Math.round((Math.random() - 0.5) * 8);  // -38 to -46
    const attackJitter = Math.round((Math.random() - 0.5) * 250);  // ±125ms

    // Phase 1 (200ms): Spider runs in from right toward Hog Rider
    _demoTimers.push(setTimeout(() => {
      spider.style.opacity = '1';
      spider.style.transform = `translateX(${stopPct}%) scaleX(-1)`;
    }, 200));

    // Phase 2 (2100ms ± jitter): Spider in range — Spider ATTACKS Hog Rider first
    _demoTimers.push(setTimeout(() => {
      spider.setAttribute('data-anim', 'attack');
    }, 2100 + attackJitter));

    // Phase 3 (2500ms): Bite lands — Hog Rider plays dmgtake01 anim + inline recoil
    _demoTimers.push(setTimeout(() => {
      // Force animation restart trick: clear data-anim + reflow, then set "hit"
      pig.removeAttribute('data-anim');
      void pig.offsetWidth;
      // Tikras dmg-take sprite (dmgtake01.png — dabar preloaded, nebedingsta).
      pig.setAttribute('data-anim', 'hit');
      pig.classList.add('dmg-hit');   // raudonas tint pulse — pabrėžia damage
      // Recoil via inline transform
      pig.style.transition = 'transform 0.12s ease-out';
      pig.style.transform = 'translateX(-14px)';
      // Damage flash — kad hit momentas būtų aiškiai matomas (restart trick)
      pigFlash.classList.remove('fire');
      void pigFlash.offsetWidth;
      pigFlash.classList.add('fire');
    }, 2500));

    // Phase 3b (2700ms): Recoil eases back to original pose
    _demoTimers.push(setTimeout(() => {
      pig.style.transition = 'transform 0.2s ease-out';
      pig.style.transform = 'translateX(0)';
    }, 2700));

    // Phase 4 (2900ms): Hog Rider counter-attacks — strike ONCE
    _demoTimers.push(setTimeout(() => {
      pig.style.transition = 'none';
      pig.style.transform = '';
      pig.classList.remove('dmg-hit');
      pig.setAttribute('data-anim', 'attack');
      void aoe.offsetWidth;
      aoe.classList.add('fire');
    }, 2900));

    // Phase 5 (3180ms): AOE impact — spider INSTANTLY gone + particle burst
    _demoTimers.push(setTimeout(() => {
      _spawnDeathParticles(spider);
      spider.setAttribute('data-state', 'gone');
    }, 3180));

    // Random jitter so the loop doesn't feel mechanical (±300ms here, ±400ms walk)
    const idleMs = 4000 + Math.round((Math.random() - 0.5) * 600);   // 3700–4300ms idle
    const walkMs = 5000 + Math.round((Math.random() - 0.5) * 800);   // 4600–5400ms walk
    const tStrike = 3450;
    const tIdleEnd = tStrike + idleMs;        // back to walk
    const tNextSpider = tIdleEnd + walkMs;    // next loop start

    // Phase 6 (3450ms): Strike done — Hog Rider switches to IDLE pose (resting after battle)
    _demoTimers.push(setTimeout(() => {
      pig.setAttribute('data-anim', 'idle');
      aoe.classList.remove('fire');
      pigFlash.classList.remove('fire');
    }, tStrike));

    // Phase 7 (idle ~4s done): Hog Rider starts walking again
    _demoTimers.push(setTimeout(() => {
      pig.removeAttribute('data-anim');
    }, tIdleEnd));

    // Phase 8 (~5s of walking later): Next spider spawns — loop
    _demoTimers.push(setTimeout(_runBattleDemo, tNextSpider));
  }



  function _startCountdown() {
    const el = document.getElementById('hog-event-countdown');
    if (!el) return;
    if (!HOG_LAUNCHED) { el.textContent = 'COMING SOON'; return; }   // užrakinta — be timerio
    const end = EVENT_END_MS;   // globali fiksuota pabaiga — vienoda visiems
    const tick = () => {
      const remaining = end - Date.now();
      el.textContent = _formatCountdown(remaining);
      if (remaining <= 0 && _countdownTimer) {
        clearInterval(_countdownTimer);
        _countdownTimer = null;
      }
    };
    tick();
    _countdownTimer = setInterval(tick, 1000);
  }

  function _stopCountdown() {
    if (_countdownTimer) {
      clearInterval(_countdownTimer);
      _countdownTimer = null;
    }
  }

  function _show() {
    const modal = document.getElementById('hog-event-modal');
    if (!modal) return;

    // MINT mygtuko būsena pagal master switch
    const mintBtn = document.getElementById('hog-event-mint');
    if (mintBtn) {
      mintBtn.disabled = false;   // visada clickable — užrakintas veda į Barakus (preview)
      if (HOG_LAUNCHED) {
        mintBtn.textContent = '⚔ MINT NOW';
        mintBtn.classList.remove('locked');
      } else {
        mintBtn.textContent = '🔒 COMING SOON';
        mintBtn.classList.add('locked');
      }
    }

    // Populate dynamic fields
    const priceEl = document.getElementById('hog-event-price');
    if (priceEl) {
      priceEl.textContent = _computePriceSync();
      _computePriceAsync(priceEl);
    }
    const mintedEl = document.getElementById('hog-event-minted');
    if (mintedEl) _fetchGlobalMintCount(mintedEl);

    modal.style.display = 'flex';
    modal.classList.add('active');
    _startCountdown();
    _runBattleDemo();
  }

  function _hide(suppress24h) {
    const modal = document.getElementById('hog-event-modal');
    if (!modal) return;
    if (suppress24h) {
      localStorage.setItem(EVENT_KEY, String(Date.now()));
    }
    modal.classList.remove('active');
    modal.style.display = 'none';
    _stopCountdown();
    _clearDemo();
  }

  function _openBarracks() {
    let opened = false;
    const fab = document.getElementById('nft-barracks-fab');
    if (fab && typeof fab.click === 'function') {
      fab.click();
      opened = true;
    } else if (window.BarracksUI && typeof window.BarracksUI.open === 'function') {
      window.BarracksUI.open();
      opened = true;
    } else {
      const modal = document.getElementById('nft-barracks-modal');
      if (modal) {
        modal.classList.add('active');
        opened = true;
      }
    }
    if (opened) {
      // Auto-select Hog Rider tile after modal renders
      setTimeout(() => {
        const hogTile = document.querySelector('.nft-unit-option[data-utype="5"]');
        if (hogTile && typeof hogTile.click === 'function') hogTile.click();
      }, 220);
    }
    return opened;
  }

  function _openInfoModal() {
    const m = document.getElementById('hog-info-modal');
    if (!m) return;
    m.style.display = 'flex';
    m.classList.add('active');
  }
  function _closeInfoModal() {
    const m = document.getElementById('hog-info-modal');
    if (!m) return;
    m.classList.remove('active');
    m.style.display = 'none';
  }

  function _bindEvents() {
    const closeBtn   = document.getElementById('hog-event-close');
    const dismissBtn = document.getElementById('hog-event-dismiss');
    const mintBtn    = document.getElementById('hog-event-mint');
    const infoBtn    = document.getElementById('hog-event-info');
    const infoClose  = document.getElementById('hog-info-close');
    const infoOk     = document.getElementById('hog-info-ok');
    const dontCb     = document.getElementById('hog-event-dontshow-cb');

    if (closeBtn) closeBtn.addEventListener('click', () => _hide(dontCb && dontCb.checked));
    if (dismissBtn) dismissBtn.addEventListener('click', () => _hide(dontCb && dontCb.checked));

    if (mintBtn) mintBtn.addEventListener('click', () => {
      // Ir užrakintas ("COMING SOON"), ir atrakintas → veda į Barakus.
      // Užrakintas: Hog Rider tile matomas BET užtamsintas (negalima mintinti).
      // Atrakintas: auto-pažymi Hog Rider tile (galima mintinti).
      _hide(false);
      if (!_openBarracks()) {
        alert('🐗 NFT Barracks not loaded yet — try again in a moment.');
      }
    });

    if (infoBtn)   infoBtn.addEventListener('click', _openInfoModal);
    if (infoClose) infoClose.addEventListener('click', _closeInfoModal);
    if (infoOk)    infoOk.addEventListener('click', _closeInfoModal);

    // INFO backdrop click closes
    const infoBackdrop = document.querySelector('.hog-info-backdrop');
    if (infoBackdrop) infoBackdrop.addEventListener('click', _closeInfoModal);

    // Main event backdrop click closes popup
    const backdrop = document.querySelector('.hog-event-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => _hide(dontCb && dontCb.checked));
    }

    // ESC closes info modal if open, else main popup
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const info = document.getElementById('hog-info-modal');
      if (info && info.classList.contains('active')) {
        _closeInfoModal();
        return;
      }
      const modal = document.getElementById('hog-event-modal');
      if (modal && modal.classList.contains('active')) {
        _hide(dontCb && dontCb.checked);
      }
    });
  }

  let _shownThisSession = false;

  // F10 PILNAI užsikrovęs — ne tik floor flag'as, bet ir kambarys paruoštas:
  // kamera inicializuota + units masyvas yra + visi puslapio resursai užkrauti.
  function _isOnF10() {
    try {
      const S = window.S;
      if (typeof S !== 'object' || !S || S.floor !== 10) return false;
      if (!S.cam) return false;                       // kamera inicializuota = kambarys renderinasi
      if (!Array.isArray(S.units)) return false;      // units sistema paruošta
      if (document.readyState !== 'complete') return false;  // visi resursai (img/css/js) užkrauti
      return true;
    } catch (_) { return false; }
  }

  function _maybeShowOnF10() {
    if (_shownThisSession) return;
    // Užrakintas → rodom teaser (su "COMING SOON"). Atrakintas → tik event lange.
    if (HOG_LAUNCHED && !_isEventActive()) return;
    if (_isDismissedToday()) return;
    if (!_isOnF10()) return;
    _shownThisSession = true;
    setTimeout(_show, LAUNCH_DELAY);
  }

  function _startF10Watch() {
    _preloadSprites();   // cache'inam sprite'us iškart, kad attack/dmg-take nedingtų
    // Pirmas tikrinimas po DOMContentLoaded
    setTimeout(_maybeShowOnF10, 200);
    setTimeout(_syncHogTile, 250);
    // Hash change → galima patekti į F10 per deep link arba floor nav
    window.addEventListener('hashchange', () => {
      setTimeout(_maybeShowOnF10, 100);
    });
    // Polling — atvejui jei žaidėjas vaikšto per floor nav mygtukus (be hash change)
    setInterval(() => { _maybeShowOnF10(); _syncHogTile(); }, 600);
  }

  // Public API — kad galima rankiniu rodyti per konsolę debug'ui
  window.HogRiderPopup = {
    show: _show,   // force-rodo nepaisant globalaus lango (testavimui)
    hide: _hide,
    reset: function () {
      // Event langas dabar GLOBALUS (hardcoded EVENT_START_UTC) — start neresetinamas.
      // Reset tik nuvalo "don't show today" suppress + sesijos flag'ą.
      localStorage.removeItem(EVENT_KEY);
      _shownThisSession = false;
      console.log('[HogRiderPopup] Reset suppress. Window:', EVENT_START_UTC, '→', new Date(EVENT_END_MS).toISOString());
    },
    info: function () {
      const now = Date.now();
      console.log('[HogRiderPopup] Global window (visiems vienoda):');
      console.log('  start :', new Date(EVENT_START_MS).toISOString());
      console.log('  end   :', new Date(EVENT_END_MS).toISOString());
      console.log('  active:', _isEventActive(), '| remaining:', _formatCountdown(EVENT_END_MS - now));
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      _bindEvents();
      _startF10Watch();
    });
  } else {
    _bindEvents();
    _startF10Watch();
  }
})();
