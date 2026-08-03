// game.js — Game: pagrindinis ciklas (fixed timestep + hit-stop), input,
// orkestracija, render, HUD. Player-facing tekstas — ANGLŲ kalba.
class Game {
  constructor() {
    this.canvas = document.getElementById('screen');
    // SUPERSAMPLE: canvas backing = _ss× pasaulio (aukšta raiška). Pasaulio koordinatės
    // lieka 260×440 (fizika/piešimas nepakitę), o _render pradžioj mastelis ×_ss → viskas
    // (fonas, paveikslai, kamuoliukai, tekstas) piešiama smulkiai ir glotniai, ne grubiais
    // 260px blokais. CSS sumažina backing'ą į ekraną glotniai (žr. index.html — be pixelated).
    this._ss = 3;
    this.canvas.width = CONFIG.world.w * this._ss;
    this.canvas.height = CONFIG.world.h * this._ss;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = true;   // glotnus mažinimas → ryškūs bg/paveikslai

    // Fono SPRITE (pilies lenta) — pagrindinis sluoksnis. Kolizijos = hitbox'ai palei
    // bėgius (žr. table._buildBorder). Veikia ir per file:// (image, ne fetch).
    this.bgImg = new Image();
    this.bgImg.src = 'bg1.png';
    this.trophyImg = new Image();          // 🏆 leaderboard mygtuko ikona (pixel-art trofėjus)
    this.trophyImg.src = 'trophy_icon.png';
    // Įrėminti portretai (8 kadrų sprite sheet'ai, foną nuėmiau) — kabo ant sienos.
    // STOVI ramiai (kadras 0); animacija (mirksėjimas) įsijungia TIK kamuoliukui
    // palietus paveikslą → duoda taškų. animT=animacijos likutis, cool=throttle.
    this.portraits = [
      { img: new Image(), x: 47,  y: 59, dh: 46, animT: 0, cool: 0 },
      { img: new Image(), x: 213, y: 59, dh: 46, animT: 0, cool: 0 },
    ];
    this.portraits[0].img.src = 'portrait1.png';
    this.portraits[1].img.src = 'portrait2.png';
    // Boso sprite (blue gorilla idle, 8 kadrai po 640×640, foną nuėmiau → boss_gorilla.png).
    this.bossGorilla = new Image();
    this.bossGorilla.src = 'boss_gorilla.png';
    // Boso MIRTIES sprite (galvos „crumble" — 8 kadrai po 640×640, subyra į mėlynas skeveldras).
    // Kadras 0 sutampa su idle galva (bbox identiškas) → sklandus perėjimas idle→mirtis.
    this.bossDeath = new Image();
    this.bossDeath.src = 'boss_death.png';
    // Boso SKAUSMO grimasa (8 kadrai) — groja VIENĄ kartą gavus dmg (žr. _onHit → _hurtAt).
    this.bossHurt = new Image();
    this.bossHurt.src = 'boss_hurt.png';
    // Sieniniai FAKELAI prie vėliavų (akmens taurės, flankuoja langą, aukštai). Palietus
    // kamuoliuku — užsidega (ugnis burnSec) + taškai. burnT=degimo likutis, cool=throttle.
    this.torches = [
      { x: 106, y: 57, seed: 0.0, burnT: 0, cool: 0 },
      { x: 151, y: 57, seed: 3.2, burnT: 0, cool: 0 },
    ];
    // Sieninių fakelų „apsaugos" taškai — dideli (biliardo) rutuliai netoli fakelo švelniai
    //   nustumiami (tesla-stiliaus, aukštyn/į šoną), kad neužstotų liepsnos. Žr. _stepBilliards.
    //   (Šoniniai @186 yra biliardo lauke → svarbūs; viršutiniai @56 aukščiau lauko → nesuveiks.)
    this._torchGuards = [{ x: 92, y: 56 }, { x: 168, y: 56 }, { x: 24, y: 186 }, { x: 236, y: 186 }];
    // 🔥 BURN-ZONOS — SENOSE šoninių combo indikatorių vietose (43,242 / 217,242). Palietus → taškai +
    //   užsidega burnSec; kol dega — MAGNETAS atstumia kamuoliuką (negalima re-touch kol dega).
    this.burnZones = [
      { x: 43, y: 242, seed: 0.0, burnT: 0, coolT: 0 },
      { x: 217, y: 242, seed: 2.6, burnT: 0, coolT: 0 },
    ];
    this._showHitbox = false;  // debug: kolizijų kontūrai ant paveikslo (H klavišas perjungia)
    this._trans = null;        // aukšto perėjimo animacija {t, dur, dir, floor}

    // Pixel-art logika (perimta iš pewpew F12): piešiam į ŽEMOS raiškos buferį,
    // tada didinam nearest-neighbor → chunky pixel'iai vietoj AA formų.
    this._pixel = 2;   // chunk dydis (2 = pusė raiškos; didesnis = grubesnis)
    this.buf = document.createElement('canvas');
    this.buf.width = Math.ceil(this.canvas.width / this._pixel);
    this.buf.height = Math.ceil(this.canvas.height / this._pixel);
    this.bctx = this.buf.getContext('2d');
    this.bctx.imageSmoothingEnabled = false;

    this.audio = new AudioManager();
    this.table = new TableManager();
    this.camera = new CameraController();
    this.score = new ScoreManager();
    this.feedback = new FeedbackManager(this.camera, this.audio);

    this.ball = new BallController(this.table.plungerSeat.x, this.table.plungerSeat.y);
    this.flippers = [
      new FlipperController(this.table.leftPivot.x, this.table.leftPivot.y, 'L'),
      new FlipperController(this.table.rightPivot.x, this.table.rightPivot.y, 'R'),
    ];

    this.input = { left: false, right: false, space: false };
    this.charge = 0;
    this.touchHeld = false;     // mobilus: laikoma → plunger įkrova
    this._wasCharging = false;
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    // 📱 LANDSCAPE režimas (Yadyy/Cydrakke 07-18): Ronin dApp naršyklė = webview, užrakinta portrait ir
    //   NEsisuka su telefonu (paveldi piniginės orientaciją). Sprendimas: rankinis „rotate" mygtukas —
    //   CSS pasukam žaidimą 90°, žaidėjas apverčia telefoną. Būsena persist localStorage; įvestis (_logicalXY)
    //   atsižvelgia į pasukimą → flipperiai/HUD mygtukai veikia teisingai abiem orientacijom.
    this.rotated = false;
    try { this.rotated = localStorage.getItem('rp_rotated') === '1'; } catch (_) {}
    this.paused = false;
    this.tSim = 0;         // sim laikas (kolizijų throttle)
    this.acc = 0;
    this.trail = [];
    this.floor = 1;        // dabartinis aukštas
    this.score.floorMult = this._floorMult(1);   // 1 aukštas = 0.5× (žr. _floorMult)
    this.gateTimer = 0;    // lubų vartų ciklo laikas
    this.balls = 3;        // „gyvybės" (score-attack runas)
    this.flipsMax = CONFIG.flipsPerFloor;   // atmušimų limitas per aukštą
    this.flipsLeft = this.flipsMax;         // likę atmušimai (0 → flipperiai užsiblokuoja)
    this._lastFlipCount = -1;               // throttle: 1 flip = 1 atmušimas (ne substep'ai)
    this._flipDisp = this.flipsMax;         // sklandžiai sekantis rodmuo (juice: nesnapina)
    this._flipPulse = 0;                    // blyksnis/šoktelėjimas per atmušimą (0..1, gesta)
    this.gameOver = false;
    this._death = null;    // mirties animacija {t,dur,gameOver} — kamuoliukas subyra, tada respawn/game over
    this._slowGlow = 0;    // (senas, nenaudojamas)
    this._slowT = 0;       // bullet-time likutis (realios sek.) — mėlynas efektas
    this._slowInt = 0;     // bullet-time vizualo intensyvumas (0..1)
    this._steerT = 0;      // vairavimo langas (sek.) — raudonas efektas
    this._comboPop = 0;    // combo matuoklio „pop" per pataikymą (0..1)
    this._scorePop = 0;    // score „bumptelėjimas" gaunant taškus (0..1)
    this.picking = false;  // (buff mechanika išimta — nenaudojama)
    this.choices = [];
    this.ballSaves = 0;
    this.upgradeCount = 0;
    this._baseCfg = this._snapshotBase();

    this.fps = 0; this._fpsCount = 0; this._fpsT = 0;
    this._last = performance.now();

    this.debug = new DebugPanel(this);

    // Kolizijų atgalinis ryšys, perduodamas kamuoliukui.
    this.ctxObj = {
      table: this.table,
      flippers: this.flippers,
      onHit: (col, s, cx, cy) => this._onHit(col, s, cx, cy),
      onFlipperHit: (f, s, x, y) => this._onFlipperHit(f, s, x, y),
    };

    this._bindInput();
    this._installRotateButton();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._dropBall();   // pirmas kamuoliukas krinta pro atsitiktinę viršaus angą
    this._spawnCircles();   // lentos rutuliai atsiranda „pop" po vieną (ne iškart)

    // 🌐 web3 pay-gate: jei modulis įkrautas — pradžia/retry per meniu overlay (connect + 15 RONKE).
    //   Kol nesumokėta — kamuoliukas nepaleidžiamas (_needPay blokuoja _releaseBall). Be modulio → laisva.
    this._menuGate = !!(window.RPWeb3 && window.RPWeb3UI);
    this._needPay = this._menuGate;
    if (this._menuGate) window.RPWeb3UI.init(this);

    requestAnimationFrame((t) => this._frame(t));
  }

  // web3 meniu „PLAY" (po apmokėjimo) → pradeda naują runą.
  beginRun() {
    this._restart();
    this._needPay = false;
    this._announceFloor(true);   // startuojant — pranešimas apie 1 aukštą (×0.5)
  }

  // 🏆 Trofėjaus mygtukas (viršuj dešinėj) → atidaro GLOBALŲ leaderboard overlay.
  //   Runo metu — pauzina žaidimą (grįžus „BACK" tęsiam). Pradžios/game-over ekrane — tik peržiūra.
  _openBoard() {
    if (window.RPWeb3UI && this._menuGate) {
      const fromGame = !this._needPay && !this.gameOver && !this.picking;
      if (fromGame) this.paused = true;
      window.RPWeb3UI.showBoard(fromGame ? 'game' : 'start');
    } else {
      this._restart();   // standalone (be web3) — senasis „R" elgesys
    }
  }
  // Grįžus iš leaderboard peržiūros (kai buvo atidaryta runo metu) — tęsiam žaidimą.
  resumeFromBoard() { this.paused = false; }

  // Grįžimas į START meniu iš game-over (uždaro rezultatų lentutę) — atstatom švarią lentą,
  //   laukiam naujo PLAY/mokėjimo (kamuoliukas ant plunger, _needPay blokuoja paleidimą).
  resetToMenu() { this._restart(); this._needPay = true; }

  // ── Upgrade bazinės reikšmės (atstatymui per restart) ──
  _snapshotBase() {
    return {
      kick: CONFIG.flipper.kick, len: CONFIG.flipper.length,
      bumpImp: CONFIG.bumper.impulse, bumpScore: CONFIG.bumper.score,
      openSec: CONFIG.gate.openSec, gravity: CONFIG.gravity, comboWin: CONFIG.combo.window,
    };
  }
  _restoreBase() {
    const b = this._baseCfg;
    CONFIG.flipper.kick = b.kick; CONFIG.flipper.length = b.len;
    CONFIG.bumper.impulse = b.bumpImp; CONFIG.bumper.score = b.bumpScore;
    CONFIG.gate.openSec = b.openSec; CONFIG.gravity = b.gravity; CONFIG.combo.window = b.comboWin;
    for (const f of this.flippers) { f.length = b.len; f._recalcTip(); }
  }
  _pickUpgrade(i) {
    if (!this.picking) return;
    const u = this.choices[i];
    if (!u) return;
    u.apply(this);
    this.upgradeCount++;
    this.picking = false;
    this.choices = [];
    this.audio.combo(5);
    this.feedback.popup(this.table.W / 2, this.table.H / 2 + 70, u.name, u.color);
    this.feedback.flash = 0.4;
  }

  // ── Koordinatės / mygtukai (bendra pele + touch) ──
  _logicalXY(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const u = (rect.width ? (clientX - rect.left) / rect.width : 0);    // 0..1 ekrano horizontaliai
    const v = (rect.height ? (clientY - rect.top) / rect.height : 0);   // 0..1 ekrano vertikaliai
    // 📱 pasukus canvas rotate(90deg) CW: ekrano ašys sukeistos → internal cx=v*W, cy=(1-u)*H.
    //   (rotacija apverčiama čia → visi input keliai teisingi; renderis ir įvestis naudoja TĄ PATĮ pasukimą.)
    if (this.rotated) return { lx: v * this.table.W, ly: (1 - u) * this.table.H };
    return { lx: u * this.table.W, ly: v * this.table.H };
  }
  _hitButton(lx, ly) {
    const W = this.table.W;
    // ⏸ pauzės mygtukas IŠJUNGTAS (user 07-24) — tik 🏆 leaderboard + 🎵 muzika
    if (ly >= 10 && ly <= 33 && lx >= W - 24 && lx <= W - 3) return 'board';   // 🏆 leaderboard (trofėjaus ikona)
    if (ly >= 37 && ly <= 58 && lx >= W - 24 && lx <= W - 3) return 'music';   // 🎵 muzikos on/off (po trofėjumi)
    return null;
  }
  // 🎵 Muzikos mygtuko toggle — init audio (autoplay policy), perjungiam, popup + press feedback.
  _toggleMusicBtn() {
    this.audio.init(); this.audio.resume();
    const on = this.audio.toggleMusic();
    this._musicPressT = (window.performance ? performance.now() : Date.now());
    try { this.feedback.popup(this.table.W / 2, 46, on ? 'MUSIC ON' : 'MUSIC OFF', '#9fdcff', 1.1); } catch (_) {}
  }
  // 🎵 Muzikos mygtukas — garsiakalbio ikona rėmelyje (auksinis kraštas — dera su „Age of Ronke" tema).
  //   ON = mėlynos garso bangos; OFF = raudonas brūkšnys. Hover: didėja + halo; press: blyksnis.
  _drawMusicBtn(ctx, W, H) {
    const _now = (window.performance ? performance.now() : Date.now());
    const on = !!(this.audio && this.audio.musicOn);
    const cx = W - 13, cy = 47;                                   // centras (po trofėjumi, hit-zone 37..58)
    const hov = !!this._musicHover;
    const press = this._musicPressT ? Math.max(0, 1 - (_now - this._musicPressT) / 220) : 0;
    const scale = 1 + (hov ? 0.14 : 0) - press * 0.20;
    const bw = 20, bh = 18, rr = 4;
    const _round = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(scale, scale);
    // rėmelis (tamsus fonas + auksinis kraštas)
    _round(-bw / 2, -bh / 2, bw, bh, rr);
    ctx.fillStyle = 'rgba(10,13,24,0.72)'; ctx.fill();
    if (hov) { ctx.shadowColor = 'rgba(120,200,255,0.9)'; ctx.shadowBlur = 8; }
    ctx.lineWidth = 1.2; ctx.strokeStyle = hov ? '#ffe6a8' : 'rgba(201,162,39,0.85)'; ctx.stroke();
    ctx.shadowBlur = 0;
    // garsiakalbis (dėžutė + kūgis)
    ctx.fillStyle = on ? '#eaf2ff' : '#8a93a8';
    ctx.beginPath();
    ctx.moveTo(-6, -2.4); ctx.lineTo(-2.5, -2.4); ctx.lineTo(1.5, -6); ctx.lineTo(1.5, 6);
    ctx.lineTo(-2.5, 2.4); ctx.lineTo(-6, 2.4); ctx.closePath(); ctx.fill();
    ctx.lineCap = 'round';
    if (on) {                                                     // garso bangos (mėlynos)
      ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(2.5, 0, 3.2, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(2.5, 0, 5.6, -0.8, 0.8); ctx.stroke();
    } else {                                                      // nutildyta (raudonas brūkšnys)
      ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-7, -6.5); ctx.lineTo(7, 6.5); ctx.stroke();
    }
    if (press > 0) {                                              // press blyksnis
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = press * 0.5;
      _round(-bw / 2, -bh / 2, bw, bh, rr); ctx.fillStyle = '#9fdcff'; ctx.fill();
    }
    ctx.restore();
  }
  _pointerPick(lx) {
    const W = this.table.W;
    this._pickUpgrade(lx < W * 0.34 ? 0 : lx < W * 0.67 ? 1 : 2);
  }

  // Mobilus valdymas: kairė/dešinė pusė = flipperiai; laikai (ant plunger) = įkrova.
  // 📱 07-28 VISO EKRANO valdymas (žaidėjo Patto skundas „kicks me out").
  //   BUVO: klausytojai kabinti TIK ant `canvas`. Telefonui gulsčiai (o taip būna dažnai — pilis verčia
  //   landscape, o iOS/Ronin webview `orientation.lock('portrait')` tyliai neveikia) lenta susitraukia į
  //   ~230px juostą ekrano viduryje, o KAIRĖJE ir DEŠINĖJE lieka po ~307px juodos zonos. Bakstelėjimas
  //   tose zonose NEPASIEKDAVO canvas → flipperis nereaguodavo, o vienintelis ten reaguojantis daiktas
  //   buvo launcher'io ✕ EXIT → žaidėją išmesdavo iš žaidimo.
  //   DABAR: klausom VISO lango. Kairė ekrano pusė = kairys flipperis, dešinė = dešinys, nesvarbu ar
  //   pirštas ant lentos, ar ant juodo krašto. `_logicalXY` reikšmių NEkarpo (lx<0 kairėj, lx>W dešinėj),
  //   tad pusių logika suveikia savaime.
  _bindTouch() {
    // Ar palietimas teko DOM valdikliui (meniu / leaderboard / info popup / ⟳)? Tada NELIEČIAM:
    //   jokio preventDefault, jokių flipperių — kitaip mygtukai nustotų veikti.
    const onDomUI = (e) => {
      const t = e.target;
      if (!t || !t.closest) return false;
      return !!t.closest('#rp-menu, #rp-info, #rotate-btn, button, a, input, select, textarea');
    };
    // Ar palietimas fiziškai ant drobės? (HUD mygtukams ir upgrade kortelėms — tik ten.)
    const onCanvas = (x, y) => {
      const r = this.canvas.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const handle = (e) => {
      if (onDomUI(e)) return;                     // DOM UI tvarko pats save
      e.preventDefault();
      this.audio.init(); this.audio.resume();
      if (this.gameOver) { if (!this._menuGate && e.type === 'touchstart') this._restart(); return; }
      const touches = e.touches;

      if (e.type === 'touchstart' && touches.length) {
        const last = touches[touches.length - 1];
        const p = this._logicalXY(last.clientX, last.clientY);
        // 🏆/🎵 mygtukai ir upgrade kortelės — TIK kai pirštas tikrai ant drobės (juodam krašte lx/ly
        //   išeina už ribų, tad atsitiktinai nepataikytų, bet tikrinam aiškiai).
        if (onCanvas(last.clientX, last.clientY)) {
          const b = this._hitButton(p.lx, p.ly);
          if (b === 'pause') { this.paused = !this.paused; return; }
          if (b === 'board') { this._trophyPressT = (window.performance ? performance.now() : Date.now()); this._openBoard(); return; }
          if (b === 'music') { this._toggleMusicBtn(); return; }   // 🎵 muzikos on/off
          if (this.picking) { this._pointerPick(p.lx); return; }
        }
      }
      if (this.picking) return;

      if (this.ball.onPlunger) {
        if (touches.length > 0) this._releaseBall();   // palietimas → kamuoliukas krinta
        this.input.left = this.input.right = false;
        this.flippers[0].pressed = this.flippers[1].pressed = false;
        return;
      }

      // Žaidimas: flipperiai pagal ekrano puses. Per _logicalXY → veikia ir pasukus (rotated).
      let left = false, right = false;
      for (const t of touches) {
        const { lx, ly } = this._logicalXY(t.clientX, t.clientY);
        // HUD juostą (viršuje, kur 🏆/🎵) praleidžiam TIK jei pirštas ant drobės — juodam krašte
        //   viršus yra normalus žaidimo plotas ir turi valdyti flipperį.
        if (ly < 22 && onCanvas(t.clientX, t.clientY)) continue;
        if (lx < this.table.W / 2) left = true; else right = true;
      }
      this.input.left = left; this.flippers[0].pressed = left;
      this.input.right = right; this.flippers[1].pressed = right;
      this.touchHeld = false; this._wasCharging = false;
    };
    for (const t of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      window.addEventListener(t, handle, { passive: false });
    }
  }

  // ── Input ──
  _bindInput() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.gameOver) { if (!this._menuGate) this._restart(); return; }
      const p = this._logicalXY(e.clientX, e.clientY);
      const b = this._hitButton(p.lx, p.ly);
      if (b === 'pause') { this.paused = !this.paused; return; }
      if (b === 'board') { this._trophyPressT = (window.performance ? performance.now() : Date.now()); this._openBoard(); return; }   // 🏆 press feedback
      if (b === 'music') { this._toggleMusicBtn(); return; }   // 🎵 muzikos on/off
      if (this.picking) this._pointerPick(p.lx);
    });
    // 🏆/🎵 hover — mygtukai pasižymi + cursor pointer
    this.canvas.addEventListener('mousemove', (e) => {
      const p = this._logicalXY(e.clientX, e.clientY);
      const over = this._hitButton(p.lx, p.ly);
      this._trophyHover = (over === 'board');
      this._musicHover = (over === 'music');
      try { this.canvas.style.cursor = over ? 'pointer' : ''; } catch (_) {}
    });
    this._bindTouch();
    window.addEventListener('keydown', (e) => {
      this.audio.init(); this.audio.resume();
      if (this.gameOver) { if (!this._menuGate) this._restart(); e.preventDefault(); return; }
      // Upgrade pasirinkimas (fizika pauzėje) — 1/2/3.
      if (this.picking) {
        if (e.code === 'Digit1') this._pickUpgrade(0);
        else if (e.code === 'Digit2') this._pickUpgrade(1);
        else if (e.code === 'Digit3') this._pickUpgrade(2);
        e.preventDefault();
        return;
      }
      // Kamuoliukas laikomas viršuj → BET KOKS klavišas jį paleidžia kristi.
      if (this.ball.onPlunger) this._releaseBall();
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA':
          if (!this.input.left) { this.input.left = true; this.flippers[0].pressed = true; this.audio.flipUp(); }
          e.preventDefault(); break;
        case 'ArrowRight': case 'KeyD':
          if (!this.input.right) { this.input.right = true; this.flippers[1].pressed = true; this.audio.flipUp(); }
          e.preventDefault(); break;
        case 'Space':
          this.input.space = true; e.preventDefault(); break;
        case 'KeyR': this._restart(); e.preventDefault(); break;
        case 'KeyH': this._showHitbox = !this._showHitbox; e.preventDefault(); break;   // hitbox overlay
        case 'KeyM': {   // 🎵 muzikos on/off
          const on = this.audio.toggleMusic();
          this.feedback.popup(this.table.W / 2, 46, on ? 'MUSIC ON' : 'MUSIC OFF', '#9fdcff', 1.1);
          e.preventDefault(); break;
        }
        case 'Escape': e.preventDefault(); break;   // ⏸ pauzė IŠJUNGTA (user 07-24)
        case 'Backquote': this.debug.toggle(); e.preventDefault(); break;
      }
    });
    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this.input.left = false; this.flippers[0].pressed = false; break;
        case 'ArrowRight': case 'KeyD': this.input.right = false; this.flippers[1].pressed = false; break;
        case 'Space':
          this.input.space = false;
          // Kamuoliukas krinta iš VIRŠAUS (ne plunger) → paleidžiam ŽEMYN, ne aukštyn.
          // (Senas _launch šovė aukštyn → nuo viršaus iškart praeidavo pro portalą = „naujas aukštas".)
          if (this.ball.onPlunger) this._releaseBall();
          break;
      }
    });
  }

  _launch() {
    const p = CONFIG.plunger;
    const power = p.min + this.charge * (p.max - p.min);
    this.ball.launch(power);
    this.audio.launch(power);
    this.charge = 0;
    this.trail.length = 0;
  }

  _restart() {
    // 🎳 07-22 EMBED (lenta 1 free/10h): po game over restart UŽRAKINTAS — touch/click/KeyR
    //   nebepradeda naujo žaidimo (web3ui onGameOver užstatė lock'ą; tėvas uždaro modalą).
    if (window.__RP_EMBED_LOCK) return;
    this._restoreBase();
    this.score.reset();
    this.floor = 1;
    this.score.floorMult = this._floorMult(1);   // 1 aukštas = 0.5×
    this.gateTimer = 0;
    this.balls = 3;
    this.gameOver = false;
    this._runStarted = false; window.__RP_IN_RUN = false;   // 🎳 naujas runas — kol nepaleistas 1-as kamuoliukas
    this._death = null;
    this.picking = false;
    this.choices = [];
    this.ballSaves = 0;
    this.upgradeCount = 0;
    this.table.rebuild(1);
    this._dropBall();
    this._spawnCircles();   // „pop" atsiradimas ir po restart
    this.feedback.particles.length = 0;
    this.feedback.pops.length = 0;
  }

  _buildFloor(n) {
    this.table.rebuild(n);   // ta pati TableManager instancija; flipperiai nepakeisti
    for (const c of this.table.circles) { c._cool = 0; c._flash = 0; }
    this._spawnCircles();
  }

  // „Pop" atsiradimas: lentos rutuliai atsiranda ne iškart, o vienas po kito su maloniu
  // mastelio „pop" (žaidimo pradžioj ir pakilus į aukštą). Iki savo laiko — nematomi ir
  // NEkolizuoja (kamuoliukas praeina pro). Aktyvavimas + pop garsas/efektas — _step.
  _spawnCircles() {
    const base = this.tSim + 0.35;   // trumpas tuščias momentas
    const step = 0.13;               // tarpas tarp atsiradimų (vienas po kito)
    const cs = this.table.circles;
    for (let i = 0; i < cs.length; i++) {
      cs[i]._appearAt = base + i * step;
      cs[i]._appearDur = 0.34;       // „pop" trukmė
      cs[i]._spawnActive = false;    // dar nekolizuoja
      cs[i]._popped = false;         // pop efektas dar nesuveikė
      cs[i]._popIdx = i;             // eiliškumas (kylantis garsas)
    }
  }

  // Rutulio spawn mastelis: 0 (dar nematomas) → overshoot >1 → 1 (easeOutBack „pop").
  _spawnPop(c) {
    if (c._appearAt == null) return 1;
    const t = (this.tSim - c._appearAt) / c._appearDur;
    if (t >= 1) return 1;
    if (t <= 0) return 0;
    const c1 = 1.70158, c3 = c1 + 1, x = t - 1;
    return 1 + c3 * x * x * x + c1 * x * x;
  }

  // Aukšto taškų daugiklis (vartotojo schema): 1→0.5×, 2→1×, 3→2×, 4→2.5×, 5→3×;
  // toliau +0.5× kas aukštą (6→3.5×, 7→4×, …).
  _floorMult(floor) {
    const T = { 1: 0.5, 2: 1, 3: 2, 4: 2.5, 5: 3 };
    return floor <= 5 ? T[floor] : 3 + (floor - 5) * 0.5;
  }

  _ascend() {
    this.floor++;
    this._buildFloor(this.floor);
    this.score.floorMult = this._floorMult(this.floor);   // atlygis už kilimą (schema _floorMult)
    this.audio.launch(780);                 // „level up" garsas
    this._announceFloor(false);             // didelis centruotas pranešimas (FLOOR + ×daugiklis, ~2s)
    this._emergeBall();                      // naujas aukštas — kamuoliukas išnyra iš apačios ir kyla
    this.gateTimer = 0;
  }

  // Aukšto atlygio (×daugiklio) akcentas — kairės juostos „mygtukas" ANIMUOTAI atsinaujina
  //   (pop + blyksnis), + trumpas vėsus level-up blyksnis. Rodomas startuojant ir kylant.
  //   (Didelio centruoto pranešimo NEBĖRA — user prašymas.)
  _announceFloor(isStart) {
    this._multPop = 1;                                 // kairės juostos daugiklio badge animacija
    this._trans = { t: 0.9, dur: 0.9, dir: isStart ? 0 : 1, floor: this.floor };   // tik blyksnis/žėručiai
    this.feedback.flash = isStart ? 0.3 : 0.4;
    this.camera.addShake(isStart ? 1.5 : 2.2);
  }

  // Naujas kamuoliukas atsiranda APAČIOJ (drain angoj, centre) ir LAUKIA — paspaudus
  // bet kokį klavišą jis ŠAUNA AUKŠTYN iš apačios (žr. _releaseBall).
  _dropBall() {
    const b = this.ball;
    b.onPlunger = true;                      // laikomas apačioj kol paspaudi
    b.x = 130; b.y = 420;                    // apatinė centrinė anga (tarp flipperių)
    b.vx = 0; b.vy = 0;
    b.stuckT = 0; b.roll = 0;
    this.trail.length = 0;
    this.charge = 0;
    this.flipsLeft = this.flipsMax;          // naujas kamuoliukas → pilnas atmušimų limitas
  }

  // Pakilus į kitą aukštą — kamuoliukas IŠNYRA iš apatinės drain angos (tos pačios, pro
  // kurią iškritęs prarandi gyvybę, centre tarp flipperių) ir šauna AUKŠTYN į naują aukštą.
  // Geresnis efektas nei laikymas viršuj — jis tarsi „atkeliauja" iš apačios.
  _emergeBall() {
    const b = this.ball;
    b.onPlunger = false;                     // gyvas iškart (ne laikomas) — išnyra ir kyla
    b.x = 130; b.y = 420;                    // apatinė centrinė drain anga (žemai, tarp flipperių)
    b.vx = M.rand(-150, 150);                // atsitiktinis įstrižumas (kartais stipriai į šoną)
    b.vy = -CONFIG.emergeSpeed * M.rand(0.85, 1.12);   // atsitiktinis šūvio aukštyn stiprumas
    b.stuckT = 0; b.roll = 0;
    this.trail.length = 0;
    this.charge = 0;
    this.flipsLeft = this.flipsMax;          // naujas aukštas → pilnas atmušimų limitas
  }

  // Paspaudus (bet kokį klavišą / palietus) — kamuoliukas ŠAUNA AUKŠTYN iš apačios.
  // ATSITIKTINIS stiprumas + įstrižumas: kartais tiesiai aukštyn, kartais labiau į šoną
  // (kairę ar dešinę) — kad kiekvienas paleidimas jaustųsi kitoks, ne visada vienodas.
  _releaseBall() {
    if (this._death) return;   // per mirties animaciją įvestis nepaleidžia kamuoliuko
    if (this._needPay) return; // web3 pay-gate: kol nesumokėta — nepaleidžiam (meniu overlay)
    if (!this.ball.onPlunger) return;
    // 🎳 07-28: PIRMAS kamuoliukas runo metu = žaidimas REALIAI prasidėjo. Tik dabar tėvas (lenta
    //   launcher) nurašo nemokamą žaidimą — anksčiau jis būdavo nurašomas vos atidarius langą, tad
    //   netyčia išėjęs (ar išmestas) žaidėjas prarasdavo jį nieko net nesužaidęs.
    if (!this._runStarted) {
      this._runStarted = true;
      window.__RP_IN_RUN = true;   // launcher'io ✕ EXIT tikrina → klausia patvirtinimo
      try { parent.postMessage({ type: 'rp_started' }, '*'); } catch (_) {}
    }
    this.ball.onPlunger = false;
    this.ball.vx = M.rand(-150, 150);                          // įstrižumas (kartais stipriai į šoną)
    this.ball.vy = -CONFIG.emergeSpeed * M.rand(0.85, 1.12);   // atsitiktinis stiprumas
  }

  // ── Fizikos žingsnis (fixed dt) ──
  _step(dt) {
    this.tSim += dt;

    // 💀 MIRTIES animacija: kamuoliukas subyrėjo → lenta „sustingsta" trumpam (dramatinis
    //   beat), šukės skrieja (feedback.particles, gyvos per _frame). Pasibaigus — arba
    //   GAME OVER (paskutinė gyvybė), arba naujas kamuoliukas krinta. Fizika per tą laiką stovi.
    if (this._death) {
      this._death.t += dt;
      if (this._death.t >= this._death.dur) {
        const go = this._death.gameOver;
        this._death = null;
        if (go) {
          this.gameOver = true;
          window.__RP_IN_RUN = false;   // 🎳 runas baigtas → ✕ EXIT nebeklausia patvirtinimo
          this._boardRank = this.score.submitScore(this.floor);   // lokalus leaderboard
          this._board = this.score.loadBoard();
          this.audio.drain();
          // 🌐 web3: rodom meniu overlay su GLOBALIU leaderboard + įrašom score į Supabase.
          if (this._menuGate && window.RPWeb3UI) {
            this._needPay = true;   // kitas runas vėl reikalaus mokėjimo
            window.RPWeb3UI.onGameOver({ score: Math.floor(this.score.score), floor: this.floor });
          }
        }
        else {
          this.feedback.popup(this.table.W / 2, this.table.H - 46, this.balls + (this.balls === 1 ? ' BALL LEFT' : ' BALLS LEFT'), '#ff9f6b', 1.1);
          this._dropBall();   // naujas kamuoliukas krinta iš apačios (laukia paspaudimo)
        }
      }
      return;   // per mirtį likusio žingsnio nevykdom (kamuoliukas paslėptas)
    }

    // „Pop" atsiradimas: rutulį aktyvuojam (kolizijoms) jo laiku; tą akimirką — malonus
    // efektas (kibirkštys + kylantis garsas), kad atrodytų lyg „išnyra iš niekur".
    for (const c of this.table.circles) {
      if (c._appearAt == null) continue;
      if (!c._popped && this.tSim >= c._appearAt) {
        c._popped = true;
        this.feedback.burst(c.x, c.y, 7, c.color || '#ffd36b', 95);
        this.audio.combo(2 + (c._popIdx || 0));   // kylantis „arpeggio" vienas po kito
      }
      c._spawnActive = this.tSim >= c._appearAt + c._appearDur * 0.55;
    }

    // Oscilliuojantys (tik NE-dinaminiai, pvz. postai/bosas — scenarijaus judesys).
    // NUMIRĘS bosas NEBEsijudina (kitaip „juodas burbulas" slystų per mirties animaciją).
    for (const c of this.table.circles) {
      if (c.move && !c.dynamic && !c.dead) {
        c.x = c.bx0 + c.move.ax * Math.sin(this.tSim * c.move.spd + c.move.ph);
        c.y = c.by0 + c.move.ay * Math.sin(this.tSim * c.move.spd + c.move.ph);
      }
    }
    // Biliardo rutuliai (bumperiai/boost): stovi ramiai, rieda tik kai pataikomi,
    // atsimuša vienas nuo kito + nuo cushion'ų, su trintimi (žr. _stepBilliards).
    this._stepBilliards(dt);

    // (Flipperiai atnaujinami substepais ball.update viduje — CCD/tunneling fix.)

    // Plunger įkrovimas (laikai Space arba lieti ekraną, kol sėdi lovelėje).
    if (this.ball.onPlunger && (this.input.space || this.touchHeld)) {
      this.charge = Math.min(1, this.charge + CONFIG.plunger.chargeRate * dt);
    }

    // Lubų vartai: užsidarę closedSec → atviri openSec → kartojasi.
    // Vartai VISADA atviri (user 07-18) — išskyrus boss aukštą (užrakinti kol bosas gyvas).
    const bossAlive = this.table.boss && !this.table.boss.dead;
    if (this.table.gate) this.table.gate.dropped = !bossAlive;

    // Boso mirties užrašas „BOSS DOWN / EXIT UNLOCKED" — rodomas PASIBAIGUS crumble animacijai
    // (ne mirties akimirką). 8×105ms turi sutapti su _drawTable crumble FR.
    const _db = this.table.boss;
    if (_db && _db.dead && _db._deathShown === false && (performance.now() - (_db._deathAt || 0)) >= 8 * 105) {
      _db._deathShown = true;
      this.feedback.popup(this.table.W / 2, this.table.H / 2, 'BOSS DOWN!', '#6effa0', 1.8);
      this.feedback.popup(this.table.W / 2, this.table.H / 2 + 16, 'EXIT UNLOCKED', '#8fffb0', 1.1);
      this.feedback.flash = 0.5;
      this.camera.addShake(3);
      this.audio.combo(6);
    }

    // RAUDONO vairavimo langas: kol aktyvus, ←/→ (A/D) suka kamuoliuko greičio vektorių.
    if (this._steerT > 0) {
      this._steerT = Math.max(0, this._steerT - dt);
      if (!this.ball.onPlunger) {
        const dir = (this.input.left ? -1 : 0) + (this.input.right ? 1 : 0);
        if (dir !== 0) {
          const a = dir * CONFIG.steer.rate * dt, c = Math.cos(a), s = Math.sin(a);
          const b = this.ball, nvx = b.vx * c - b.vy * s, nvy = b.vx * s + b.vy * c;
          b.vx = nvx; b.vy = nvy;
        }
      }
    }

    // Atmušimai išsekę → flipperiai UŽSIBLOKUOJA: priverstinai laikom nuleistus (ignoruojam
    // įvestį), kad negalėtum atmušti → kamuoliukas nukrenta → prarandi gyvybę.
    if (this.flipsLeft <= 0) {
      this.flippers[0].pressed = false;
      this.flippers[1].pressed = false;
    }

    // Atmušimų skaitliukas: 1 flipas = 1 atmušimas. Kiekvienas NAUJAS paspaudimas (briauna)
    // „užtaiso" flipperį — jam palietus kamuoliuką nuskaičiuojam VIENĄ (žr. _onFlipperHit).
    // Kol laikai paspaudęs, keli kontaktai neskaičiuojami dar kartą (nebe „daug prisilietimų").
    for (const f of this.flippers) {
      if (f.pressed && !f._wasPressed) f._armed = true;
      f._wasPressed = f.pressed;
    }

    this.ball.update(dt, this.ctxObj);

    // Kamuoliuko RIEDĖJIMAS (biliardo jausmas) — paviršius sukasi pagal greitį.
    if (!this.ball.onPlunger) {
      this.ball.roll = (this.ball.roll || 0) + (this.ball.vx * dt / this.ball.r) * 0.5;
    } else {
      this.ball.roll = 0;
    }

    // Ascend: kamuoliukas numuštas AUKŠTYN pro CENTRINĘ angą (x≈130, vy<0) → kitas aukštas.
    // Tik pro šią vieną angą (ne pro drop taškus); vy<0 — kad krentantis neįjungtų.
    // NELEIDŽIAM pakilti kol GYVAS bosas (vartai ir taip uždaryti — dviguba apsauga).
    const _bossAlive = this.table.boss && !this.table.boss.dead;
    if (!_bossAlive && !this.ball.onPlunger && this.ball.y < CONFIG.gate.triggerY && this.ball.vy < 0 &&
        Math.abs(this.ball.x - 130) < 26) {
      this._ascend();
      return;
    }

    // (Plunger-grįžimas pašalintas — kamuoliukas krinta iš viršaus, ne iš plunger'io.)

    // Trail (flagellum uodega) — kaupiam iki fiksuoto PASAULIO ILGIO, kad uodega
    // atrodytų vienoda nepriklausomai nuo greičio (ne kometa prie max speed).
    if (!this.ball.onPlunger) {
      this.trail.push({ x: this.ball.x, y: this.ball.y });
      let len = 0;
      for (let i = this.trail.length - 1; i > 0; i--) {
        len += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
        if (len > CONFIG.ball.trailLen) { this.trail.splice(0, i); break; }
      }
      if (this.trail.length > 90) this.trail.splice(0, this.trail.length - 90);
    }

    // Sensoriai (rollover / spinner / danger) — be fizinio atsako (danger lėtina).
    if (!this.ball.onPlunger) {
      for (const s of this.table.sensors) {
        const dx = this.ball.x - s.x, dy = this.ball.y - s.y;
        const inside = (dx * dx + dy * dy) < (this.ball.r + s.r) * (this.ball.r + s.r);
        if (s.type === 'danger') {
          if (inside) { this.ball.vx *= s.slow; this.ball.vy *= s.slow; s._active = 0.15; }
          continue;
        }
        if (s.type === 'slowmo') {
          if (inside) { this.ball.vx *= CONFIG.slowmo.scale; this.ball.vy *= CONFIG.slowmo.scale; s._active = 0.2; this._slowGlow = 1; }
          continue;
        }
        if (inside && this.tSim - s._cool > 0.3) { s._cool = this.tSim; this._onSensor(s); }
      }
    }

    // Sieniniai paveikslai: STOVI ramiai; kamuoliukui palietus → taškai + įsijungia
    // mirksėjimo animacija (throttle, kad vienas kontaktas = viena animacija/award).
    for (const p of this.portraits) {
      if (p.animT > 0) p.animT = Math.max(0, p.animT - dt);
      if (p.cool > 0) p.cool = Math.max(0, p.cool - dt);
      if (this.ball.onPlunger) continue;
      const hw = p.dh * (185 / 270) / 2, hh = p.dh / 2;   // paveikslo stačiakampio pusės
      const qx = M.clamp(this.ball.x, p.x - hw, p.x + hw);
      const qy = M.clamp(this.ball.y, p.y - hh, p.y + hh);
      const ddx = this.ball.x - qx, ddy = this.ball.y - qy;
      if (p.cool <= 0 && ddx * ddx + ddy * ddy <= this.ball.r * this.ball.r) {
        const total = this._portraitDur() + CONFIG.portrait.shake;   // virpėjimas + 1 ciklas
        p.animT = total;  // pirma virpa, tada sugroja animaciją vieną kartą
        p.cool = total;   // throttle = visas efektas (1 palietimas = 1 virpėjimas+animacija)
        this._onPortrait(p);
      }
    }

    // Sieniniai FAKELAI prie vėliavų: kamuoliuku palietus → užsidega (dega burnSec) + taškai.
    for (const t of this.torches) {
      if (t.burnT > 0) t.burnT = Math.max(0, t.burnT - dt);
      if (t.cool > 0) t.cool = Math.max(0, t.cool - dt);
      if (this.ball.onPlunger) continue;
      const dx = this.ball.x - t.x, dy = this.ball.y - t.y;
      const rr = this.ball.r + CONFIG.torch.radius;
      if (t.cool <= 0 && dx * dx + dy * dy <= rr * rr) {
        t.burnT = CONFIG.torch.burnSec;   // uždegam (ugnis dega burnSec)
        t.cool = CONFIG.torch.cool;       // throttle: 1 palietimas = 1 uždegimas
        this._onTorch(t);
      }
    }

    // 🔥 BURN-ZONOS (žaibas iš apačios = TESLA): palietus → užsidega + MAGNETAS atstumia kamuoliuką.
    // ⚡ Kol laiko/atstumia — silpnas „bzzz". HARD CAP: kamuoliukas gali būti tesla lauke MAX burnSec
    // (10s); po to tesla IŠNYKSTA (nustoja atstumti + nebeužsidega) kol kamuoliukas neišeina iš lauko →
    // JOKIOS amžinos levitacijos (kamuoliukas nukrenta).
    const rR = CONFIG.burnZone.repelRadius;
    for (const z of this.burnZones) {
      const bdx = this.ball.x - z.x, bdy = this.ball.y - z.y;
      const bd = Math.hypot(bdx, bdy);
      const inRange = !this.ball.onPlunger && bd < rR;
      z.holdT = inRange ? (z.holdT || 0) + dt : 0;                    // laikas tesla lauke (reset išėjus)
      const burnedOut = z.holdT >= CONFIG.burnZone.burnSec;          // po 10s → tesla išnyksta
      if (z.burnT > 0) z.burnT = Math.max(0, z.burnT - dt);
      if (burnedOut) z.burnT = 0;                                     // priverstinai gesinam
      // ⚡ Magneto FLICKER: atstūmimo impulsai NEpastovūs — atsitiktiniais tarpais trumpam
      //   IŠSIJUNGIA (nestabilus laukas). Jei kamuoliukas „pakibęs" balanse (magnetas vs
      //   gravitacija) ir užstringa vietoj — OFF langas leidžia gravitacijai jį nutraukti žemyn.
      //   ON ~0.30-0.55s, OFF ~0.16-0.32s (dažni trumpi tarpai) → jokios amžinos levitacijos.
      if (z._magOn === undefined) { z._magOn = true; z._flickT = M.rand(0.30, 0.55); }
      z._flickT -= dt;
      if (z._flickT <= 0) { z._magOn = !z._magOn; z._flickT = z._magOn ? M.rand(0.30, 0.55) : M.rand(0.16, 0.32); }
      // MAGNETAS — tik jei dega, NEišdegęs, kamuoliukas lauke.
      if (z.burnT > 0 && !burnedOut && bd > 0.1 && inRange) {
        // Radialinis atstūmimas + bzzz — TIK kai flicker'is ON (kad būtų OFF langai kristi).
        if (z._magOn) {
          const f = CONFIG.burnZone.repelForce * (1 - bd / rR);        // arčiau → stipriau
          this.ball.vx += (bdx / bd) * f * dt;
          this.ball.vy += (bdy / bd) * f * dt;
          if (this.tSim - (this._buzzT != null ? this._buzzT : -1) > 0.1) { this._buzzT = this.tSim; this.audio.buzz(); }
        }
        // SILPNAS ATSITIKTINIS „nudge" — kryptis periodiškai persisuka (kartais viršun,
        // kartais į šonus, viršutinis pusračis [-π,0] → niekada tiesiai žemyn). Nenuspėjama:
        // kamuoliukas gauna chaotiškų kumštelėjimų → nekabo ant oro, bet ne visada vienodai.
        z._nudT = (z._nudT || 0) - dt;
        if (z._nudT <= 0) { z._nudAng = M.rand(-Math.PI, 0); z._nudMag = M.rand(0.5, 1); z._nudT = M.rand(0.18, 0.45); }
        const nf = CONFIG.burnZone.nudgeForce * (z._nudMag || 0.7);
        this.ball.vx += Math.cos(z._nudAng || 0) * nf * dt;
        this.ball.vy += Math.sin(z._nudAng || 0) * nf * dt;
      }
      if (z.coolT > 0) z.coolT = Math.max(0, z.coolT - dt);
      if (this.ball.onPlunger) continue;
      if (!burnedOut && z.burnT <= 0 && z.coolT <= 0) {              // uždegimas TIK jei NEišdegęs
        const rr = this.ball.r + CONFIG.burnZone.radius;
        if (bdx * bdx + bdy * bdy <= rr * rr) {
          z.burnT = CONFIG.burnZone.burnSec;
          z.coolT = CONFIG.burnZone.burnSec + 0.25;
          this._onBurnZone(z);
        }
      }
    }

    // Drop-target'ų atsistatymas.
    for (const d of this.table.dropTargets) {
      if (d.dropped && this.tSim > d.dropUntil) d.dropped = false;
    }

    // Drain / apsauga nuo išsprūdimo.
    const W = this.table.W, H = this.table.H;
    if (!this.ball.onPlunger &&
        (this.ball.y > this.table.drainY || this.ball.x < -30 || this.ball.x > W + 30 || this.ball.y < -60)) {
      this._drain();
    }
  }

  // ── Biliardo rutulių fizika (bumperiai/boost = dinamiški rutuliai) ──
  // Rutuliai stovi ramiai, kol juos kas nors pataiko (žaidėjo kamuoliukas ar
  // kitas rutulys). Tada rieda su trintimi, atsimuša vienas nuo kito, nuo
  // statinių apskritimų (postai/kickeriai/bosas) ir nuo lauko cushion'ų.
  _stepBilliards(dt) {
    const circles = this.table.circles;
    const B = CONFIG.billiard;

    // 1) Integracija + riedėjimo trintis + cushion'ai (lauko ribos).
    for (const c of circles) {
      if (!c.dynamic || c.dead || c._spawnActive === false) continue;   // mobas/dar neatsiradęs
      // 🔥 FAKELO APSAUGA: jei rutulys arti sieninio fakelo — švelniai NUSLENKA nuo jo (radialiai,
      //   su polinkiu AUKŠTYN/į šoną, niekada žemyn), kad atsitrauktų ir neužstotų liepsnos.
      //   Slenkam pozicija (ne greičiu — kitaip minSpeed nužudytų mažą stūmį), + slopinam link-fakelo greitį.
      for (const tg of this._torchGuards) {
        const gdx = c.x - tg.x, gdy = c.y - tg.y, gd = Math.hypot(gdx, gdy), gth = 14 + c.r;
        if (gd >= gth) continue;
        let gnx = gd > 1e-3 ? gdx / gd : 0, gny = gd > 1e-3 ? gdy / gd : -1;
        if (gny > -0.2) gny = -0.2;                          // bent truputį aukštyn (ne į lauką)
        const gl = Math.hypot(gnx, gny) || 1; gnx /= gl; gny /= gl;
        const slide = Math.min(gth - gd, 70 * dt);           // slenka nuo fakelo (~70 vnt/s) kol atsitraukia
        c.x += gnx * slide; c.y += gny * slide;
        const vin = -(c.vx * gnx + c.vy * gny);              // greičio komponentė LINK fakelo
        if (vin > 0) { c.vx += gnx * vin; c.vy += gny * vin; }  // pašalinam → neįvažiuoja atgal
      }
      let sp = Math.hypot(c.vx, c.vy);
      if (sp > 0) {
        const drop = B.friction * dt;                 // pastovus stabdymas (Coulomb)
        if (drop >= sp || sp < B.minSpeed) { c.vx = 0; c.vy = 0; sp = 0; }  // sustoja PILNAI
        else { const k = (sp - drop) / sp; c.vx *= k; c.vy *= k; sp -= drop; }
      }
      if (sp === 0) continue;                          // ramybėje — pats nejuda
      c.x += c.vx * dt; c.y += c.vy * dt;
      // 3D riedėjimas: fazė kaupiasi pagal nuvažiuotą atstumą (dist/r), kryptis =
      // greičio vektorius. Naudojama _popBumper sferiniam dėmių slinkimui.
      c._rollDx = c.vx / sp; c._rollDy = c.vy / sp;
      c._roll += (sp * dt) / c.r;
      // Kolizijos su TIKROM sienom (hitbox segmentais) — kad neišeitų už ribų.
      const e = B.restWall;
      for (const seg of this.table.segments) {
        if (seg.dropped) continue;
        const h = collideCircleSegment(c.x, c.y, c.r, seg);
        if (!h) continue;
        c.x += h.nx * h.pen; c.y += h.ny * h.pen;
        const vn = c.vx * h.nx + c.vy * h.ny;
        if (vn < 0) { c.vx -= (1 + e) * vn * h.nx; c.vy -= (1 + e) * vn * h.ny; }
      }
    }

    // 1.5) FLIPPERIAI muša dinaminius rutulius (ir ramybėje — flipperis pats juda).
    const cm = B.maxSpeed;
    for (const c of circles) {
      if (!c.dynamic || c.dead || c._spawnActive === false) continue;
      for (const f of this.flippers) {
        const cl = M.closestOnSeg(c.x, c.y, f.px, f.py, f.tipX, f.tipY);
        const dx = c.x - cl.x, dy = c.y - cl.y, d = Math.hypot(dx, dy), min = c.r + f.half;
        if (d >= min) continue;
        const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
        c.x += nx * (min - d); c.y += ny * (min - d);
        const rx = cl.x - f.px, ry = cl.y - f.py;               // flipperio paviršiaus greitis (ω×r)
        const svx = -f.omega * ry, svy = f.omega * rx;
        const vrn = (c.vx - svx) * nx + (c.vy - svy) * ny;      // santykinis greitis
        if (vrn >= 0) continue;
        const j = -(1 + CONFIG.restBumper) * vrn * CONFIG.flipper.kick;
        c.vx += j * nx; c.vy += j * ny;
        const s2 = Math.hypot(c.vx, c.vy);
        if (s2 > cm) { c.vx = c.vx / s2 * cm; c.vy = c.vy / s2 * cm; }
      }
    }

    // 2) Poriniai smūgiai: rutulys↔rutulys (ir rutulys↔statinis apskritimas).
    for (let i = 0; i < circles.length; i++) {
      const a = circles[i];
      if (a.dead || a._spawnActive === false) continue;
      for (let k = i + 1; k < circles.length; k++) {
        const b = circles[k];
        if (b.dead || b._spawnActive === false) continue;
        if (!a.dynamic && !b.dynamic) continue;        // abu statiniai — praleisk
        this._collideBilliardPair(a, b);
      }
    }
  }

  // Elastinis smūgis tarp dviejų apskritimų. Nedinamiškas (postas/kickeris/bosas)
  // = begalinės masės (nejuda, tik atspindi kitą). n rodo nuo a link b.
  _collideBilliardPair(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const min = a.r + b.r;
    if (d >= min || d < 1e-6) return;
    const nx = dx / d, ny = dy / d, pen = min - d;
    const B = CONFIG.billiard;

    const aDyn = !!a.dynamic, bDyn = !!b.dynamic;
    const invA = aDyn ? 1 / a.mass : 0, invB = bDyn ? 1 / b.mass : 0;
    const invSum = invA + invB || 1;

    // Pozicinė korekcija (išstumk pagal atvirkštinę masę: sunkesnis juda mažiau).
    a.x -= nx * pen * (invA / invSum); a.y -= ny * pen * (invA / invSum);
    b.x += nx * pen * (invB / invSum); b.y += ny * pen * (invB / invSum);

    // Santykinis greitis išilgai normalės.
    const avx = aDyn ? a.vx : 0, avy = aDyn ? a.vy : 0;
    const bvx = bDyn ? b.vx : 0, bvy = bDyn ? b.vy : 0;
    const vn = (bvx - avx) * nx + (bvy - avy) * ny;
    if (vn > 0) return;                                // tolsta — jokio atsako
    const j = -(1 + B.restBall) * vn / invSum;         // impulso skaliaras
    if (aDyn) { a.vx -= j * invA * nx; a.vy -= j * invA * ny; }
    if (bDyn) { b.vx += j * invB * nx; b.vy += j * invB * ny; }

    const cm = B.maxSpeed;
    if (aDyn) { const s = Math.hypot(a.vx, a.vy); if (s > cm) { a.vx = a.vx / s * cm; a.vy = a.vy / s * cm; } }
    if (bDyn) { const s = Math.hypot(b.vx, b.vy); if (s > cm) { b.vx = b.vx / s * cm; b.vy = b.vy / s * cm; } }
  }

  _drain() {
    // BALL SAVE upgrade: sunaudok tokeną → atsistatai ant TO PATIES aukšto.
    if (this.ballSaves > 0) {
      this.ballSaves--;
      this.audio.combo(3);
      this.feedback.popup(this.table.W / 2, this.table.H - 60, 'BALL SAVED', '#b6ff7b');
      this.feedback.flash = 0.4;
      this.camera.addShake(2);
      this._dropBall();                      // naujas kamuoliukas krinta iš viršaus
      return;
    }
    // Iškritai pro apačią → −1 GYVYBĖ, NESVARBU kokiame aukšte (nusileisti NEGALIMA).
    // Lieki TAME PAČIAME aukšte (aukšto daugiklis išlieka); kai gyvybės baigiasi →
    // game over. Vietoj momentinio respawn — MIRTIES animacija (kamuoliukas subyra).
    this.score.onDrain();
    this.balls--;
    this._startDeath();
  }

  // 💀 Mirties animacija: kamuoliukas „subyra" į chromo šukes iš paskutinės pozicijos.
  //   Rezultatas (respawn / game over) atidėtas iki animacijos pabaigos (_step tvarko _death).
  _startDeath() {
    const b = this.ball;
    const dx = b.x, dy = Math.min(b.y, this.table.H - 6);   // drain vietoje (apačioj)
    this.audio.drain();
    this._spawnShatter(dx, dy, b.vx, b.vy);
    this.feedback.flash = 0.55;
    this.camera.addShake(5.5);
    this.feedback.requestHitStop(0.07);        // trumpas „impact" stabtelėjimas
    const gameOver = this.balls <= 0;
    this._death = { t: 0, dur: gameOver ? 1.15 : 0.8, gameOver };
    b.onPlunger = true; b.vx = 0; b.vy = 0;    // fizika stovi; _drawBall paslepia per _death
    this.trail.length = 0;
  }

  // Chromo rutulio „subyrėjimas": šukės (metalo tonai) sprogsta į viršų+šonus ir krenta
  // (dalelių gravitacija feedback.update), + baltas kibirkščių blyksnis + smūgio banga.
  _spawnShatter(x, y, vx, vy) {
    const cols = ['#c2cbdb', '#7f8aa2', '#59637a', '#454e62'];
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, s = M.rand(45, 185);
      this.feedback.particles.push({
        x, y,
        vx: Math.cos(a) * s + vx * 0.2,
        vy: Math.sin(a) * s + vy * 0.2 - M.rand(30, 110),   // pakreipta į viršų (sprogimas)
        life: M.rand(0.45, 0.85), ttl: 0.85,
        color: cols[i % cols.length], size: M.rand(1.4, 3.3),
      });
    }
    this.feedback.burst(x, y, 10, '#ffffff', 150);          // baltas kibirkščių blyksnis
    this.feedback.ring(x, y, '#ff6f9d', 30, 170);           // rausva smūgio banga
    this.feedback.ring(x, y, '#ffd36b', 18, 120);           // vidinis auksinis žiedas
  }

  // ── Kolizijų atsakas (efektai; NELIEČIA fizikos) ──
  _comboColor() {
    const c = this.score.combo;
    if (c < 2) return '#ffffff';
    if (c < 4) return '#ffd36b';
    if (c < 7) return '#ff9f43';
    return '#ff5c7a';
  }
  _comboSound() {
    if (this.score.combo >= 2) this.audio.combo(this.score.combo);
  }

  // Juicy reakcija bumperiams: „pop" scale (vizualas). Fizinį stūmį (billiard
  // knock) atlieka tikras elastinis smūgis ball._resolveCircle → rutulys rieda.
  _bumpReact(col) {
    col._scale = 1.12;   // labai subtilus „pop" — kad neužstotų riedėjimo animacijos
  }

  _onHit(col, strength, cx, cy) {
    switch (col.type) {
      case 'wall': {
        this.audio.wall(strength);
        if (strength > CONFIG.fx.strongHitSpeed) {
          this.camera.addShake(1.5);
          this.feedback.burst(cx, cy, 3, '#8892b0', strength * 0.12);
        }
        return;
      }
      case 'gate': {
        this.audio.wall(strength);   // uždari lubų vartai — atsimuša (be taškų)
        return;
      }
      case 'post': {
        this.audio.wall(strength * 0.8);
        return;   // deflektorius — be taškų
      }
      case 'kicker': {
        if (this.tSim - col._cool < 0.05) return;
        col._cool = this.tSim;
        col._flash = 0.1;
        this._bumpReact(col, 200);
        this.audio.sling();
        const g = this.score.award(col.score);
        this.feedback.burst(cx, cy, 6, '#7be0ff', 150);
        this.feedback.popup(cx, cy - 6, '+' + Math.floor(g), this._comboColor());
        this.camera.addShake(1.5);
        this._comboSound();
        return;
      }
      case 'boss': {
        if (col.dead || this.tSim - col._cool < 0.14) return;
        col._cool = this.tSim;
        col.hp -= 1;
        col._hurtAt = performance.now();   // SKAUSMO grimasa — pagrindinis dmg feedback'as.
        this.audio.bossHit();              // boso vertas garsas (sunkus trenksmas + monstro grunt)
        this.score.award(2);
        this.camera.addShake(1.5);
        // 🩸 KRAUJO lašiukų effektas: tamsiai raudoni lašai spurkšteli nuo smūgio taško, KRINTA
        //   žemyn (gravitacija feedback.update) ir pamažu IŠNYKSTA per 0.5-1s. Skirtingi raudonio
        //   atspalviai + stambesni dydžiai (lašai, ne kibirkštys).
        let sdx = cx - col.x, sdy = cy - col.y, sd = Math.hypot(sdx, sdy);
        if (sd < 0.5) { sdx = this.ball.x - col.x; sdy = this.ball.y - col.y; sd = Math.hypot(sdx, sdy) || 1; }
        sdx /= sd; sdy /= sd;
        const _bBase = Math.atan2(sdy, sdx), _blood = ['#c8182a', '#9a0f20', '#e23b45', '#6e0a16'];
        for (let i = 0; i < 28; i++) {
          const a = _bBase + M.rand(-1.2, 1.2), s = M.rand(0.3, 1) * 175;
          const ttl = M.rand(0.5, 1.0);                                   // išnykimo intervalas 0.5-1s
          this.feedback.particles.push({
            x: cx + M.rand(-1.5, 1.5), y: cy + M.rand(-1.5, 1.5),
            vx: Math.cos(a) * s, vy: Math.sin(a) * s - M.rand(0, 35),      // mažas „aukštyn" → sunkūs lašai krinta greitai
            life: ttl, ttl, color: _blood[i % _blood.length], size: M.rand(1.5, 3.4),
          });
        }
        this.feedback.popup(cx, cy - col.r - 6, '-1', '#ffdede', 1.15);
        this._comboSound();
        if (col.hp <= 0) {
          col.dead = true;
          col._deathAt = performance.now();   // crumble animacijos startas (žr. _drawTable dead-boss šaka)
          col._deathShown = false;            // „BOSS DOWN" užrašas rodomas PO crumble (žr. _step)
          col.vx = 0; col.vy = 0;             // sustabdom (nebejuda per mirtį)
          this.audio.bossDeath();             // tikras mirties „dying groan" (sinchr. su crumble)
          this.score.award(20);
          // 💥 galva subyra — mėlynų skeveldrų sprogimas (dera su crumble sprite). Užrašas — vėliau.
          this.feedback.burst(col.x, col.y, 22, '#3b6ff0', 230);
          this.feedback.burst(col.x, col.y, 12, '#8fc0ff', 150);
          this.feedback.ring(col.x, col.y, '#8fc0ff', 40, 200);
          this.feedback.flash = 0.9;
          this.camera.addShake(6);
        }
        return;
      }
      case 'drop': {
        // Nukrinta (praeinamas resetSec), taškai; visas bankas → bonusas.
        col.dropped = true;
        col.dropUntil = this.tSim + CONFIG.drop.resetSec;
        this.audio.bumper();
        const g = this.score.award(col.score);
        this.feedback.burst(cx, cy, 8, '#ffd36b', 150);
        this.feedback.popup(cx, cy - 6, '+' + Math.floor(g), this._comboColor());
        this.camera.addShake(2);
        this._comboSound();
        if (this.table.dropTargets.every((d) => d.dropped)) {
          const b = this.score.award(CONFIG.drop.bankBonus);
          this.feedback.popup(this.table.W / 2, 200, 'BANK BONUS +' + Math.floor(b), '#ff9f43');
          this.feedback.flash = 0.7;
          this.camera.addShake(5);
          for (const d of this.table.dropTargets) d.dropUntil = this.tSim + 1.6;
        }
        return;
      }
    }

    // Scored circle (sling apdorotas kaip segmentas viršuje; čia bumper/boost) —
    // throttle, kad 1 kontaktas = 1 award.
    if (this.tSim - col._cool < 0.05) {
      if (col.type === 'sling') return;
    }

    if (col.type === 'sling') {
      col._cool = this.tSim;
      this.audio.sling();
      const g = this.score.award(col.score);
      this.feedback.burst(cx, cy, 6, '#7be0ff', 160);
      this.feedback.popup(cx, cy - 7, '+' + Math.floor(g), this._comboColor());
      this.camera.addShake(2);
      this._comboSound();
      return;
    }
    if (this.tSim - col._cool < 0.05) return;
    col._cool = this.tSim;

    // ── JUICE: punchy garsas + kryptingos kibirkštys + combo „+N" + smūgio jausmas ──
    this._bumpReact(col);
    const g = this.score.award(col.score);
    const isBoost = col.type === 'boost';
    const b = this.ball, bs = Math.hypot(b.vx, b.vy) || 1;
    this.audio.hit(strength, this.score.combo);   // stiklinis, progresinis pagal combo
    // kibirkštys skrieja pagal atšokimo kryptį; kiekis/greitis — pagal jėgą
    this.feedback.spark(cx, cy, b.vx / bs, b.vy / bs, 5 + Math.round(M.clamp(strength / 90, 0, 10)), '#ffd36b', 120 + strength * 0.4);
    // combo eskalacija: aukštesnis combo → truputį didesnis + ryškesnis „+N" (subtiliai)
    const cScale = 1 + Math.min(0.55, (this.score.combo - 1) * 0.09);
    this.feedback.popup(cx, cy - (isBoost ? 12 : 9), '+' + Math.floor(g), this._comboColor(), cScale);
    // 🔇 combo „bybt" PAŠALINTAS iš hit kelio — hit() JAU eskaluoja pagal combo (pitch); combo() dubliuodavosi su smūgio garsu.
    this._comboPop = 1; this._scorePop = 1;   // matuoklio + score „pop" (juice)
    // squash + drebėjimas + hit-pause pagal smūgio STIPRUMĄ
    b.squash = Math.min(1, 0.35 + strength / 550);
    this.camera.addShake(M.clamp(strength / 220, 0.5, 4));
    if (strength > CONFIG.fx.strong) this.feedback.requestHitStop(CONFIG.fx.hitStopStrong);

    // ŽALIA: kamuoliukas atšoka VERTIKALIAI pagal kontakto pusę (viršun / apačion stipriau).
    if (col.fx === 'bounceup') {
      const above = b.y < col.y;
      const sp = Math.max(bs, 300);
      b.vx *= 0.5;
      b.vy = above ? -sp * 0.95 : sp * 1.28;
      b.clampSpeed();
      this.feedback.burst(col.x, col.y + (above ? -col.r : col.r), 8, '#8ff0a0', 180);
    }

    // MĖLYNA: TIK per STIPRŲ smūgį → trumpas bullet-time momentas (nebe kas kartą → nebeerzina).
    if (col.fx === 'slowmo' && strength > CONFIG.fx.strong) {
      this._slowT = CONFIG.slowmo.dur;
      this.feedback.burst(cx, cy, 12, '#bfe6ff', 150);
    }

    // RAUDONA: atsiveria vairavimo langas — 1 sek ←/→ (A/D) suki kamuoliuko skridimo kryptį.
    if (col.fx === 'steer') {
      this._steerT = CONFIG.steer.dur;
      this.feedback.burst(cx, cy, 12, '#ff6a5c', 200);
    }

    // ZAP (tik geltonas rutulys): žaibas peršoka į artimiausią + stumteli. BE teksto.
    if (col.fx === 'zap') {
      const tgt = this._nearestBall(col);
      if (tgt) {
        this.feedback.bolt(col.x, col.y, tgt.x, tgt.y, '#fff07a');
        this.feedback.burst(col.x, col.y, 10, '#fff07a', 200);
        const dx = tgt.x - col.x, dy = tgt.y - col.y, d = Math.hypot(dx, dy) || 1;
        tgt.vx += (dx / d) * 55; tgt.vy += (dy / d) * 55;
      }
    }
  }

  // Artimiausias kitas dinaminis rutulys (zap grandinei).
  _nearestBall(src) {
    let best = null, bd = Infinity;
    for (const c of this.table.circles) {
      if (c === src || !c.dynamic || c.dead) continue;
      const d = Math.hypot(c.x - src.x, c.y - src.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  _onSensor(s) {
    if (s.type === 'spinner') {
      s._spin += 8;
      const g = this.score.award(s.score);
      this.audio.sling();
      this.feedback.popup(s.x, s.y - 8, '+' + Math.floor(g), this._comboColor());
      return;
    }
    // rollover
    s._lit = 1;
    const g = this.score.award(s.score);
    this.audio.combo(Math.max(2, this.score.combo));
    this.feedback.burst(s.x, s.y, 5, '#b6ff7b', 120);
    this.feedback.popup(s.x, s.y - 7, '+' + Math.floor(g), this._comboColor());
  }

  // Kamuoliukas palietė sieninį paveikslą → taškai + „pop" (virpėjimą+animaciją įjungė _step).
  _onPortrait(p) {
    const g = this.score.award(CONFIG.portrait.score);
    this.audio.picture();   // savitas paveikslo garsas (medinis „tunk" + skambesys)
    this.feedback.burst(p.x, p.y + p.dh / 2, 8, '#ffd36b', 140);   // kibirkštys iš apačios
    this.feedback.popup(p.x, p.y - p.dh / 2 - 4, '+' + Math.floor(g), this._comboColor(), 1.15);
    this.camera.addShake(0.7);   // vos vos — pagrindinis virpėjimas yra paties paveikslo
    this._comboSound();
    this._comboPop = 1; this._scorePop = 1;
  }

  // Kamuoliukas uždegė sieninį fakelą → taškai + ugnies „pop".
  _onTorch(t) {
    const g = this.score.award(CONFIG.torch.score);
    this.audio.torch();   // savitas ugnies uždegimo garsas („whoomph" + šnypštimas)
    this.feedback.burst(t.x, t.y, 9, '#ffb24a', 150);            // kibirkštys/liepsna
    this.feedback.popup(t.x, t.y - 10, '+' + Math.floor(g), this._comboColor(), 1.1);
    this.feedback.flash = 0.25;
    this.camera.addShake(1);
    this._comboSound();
    this._comboPop = 1; this._scorePop = 1;
  }

  // Kamuoliukas palietė BURN-ZONĄ → įsijungia TESLA (magnetas atstumia burnSec). BE TAŠKŲ — tik efektas.
  _onBurnZone(z) {
    this.audio.tesla();   // ⚡ elektros zap garsas
    this.feedback.burst(z.x, z.y, 11, '#6ab8ff', 175);   // mėlynos elektros kibirkštys
    this.feedback.flash = 0.30;
    this.camera.addShake(2);
  }

  _onFlipperHit(f, strength, x, y) {
    // Slenkstis: ramiai gulintis ant flipperio kamuoliukas duoda mikro-kontaktus
    // (mažas vrn) — jų negarsinam/nefx'inam, kad negautume zvimbimo.
    if (strength < 55) return;

    // ATMUŠIMŲ skaitliukas: 1 flipas = 1 atmušimas. Skaičiuojam TIK jei flipperis „užtaisytas"
    // (naujas paspaudimas, žr. _step) — tada disarm, kad tie patys substep'ų/riedėjimo kontaktai
    // to paties flipo NEskaičiuotų dar kartą. Išsekus (0) → flipperiai užsiblokuoja → drain.
    if (this.flipsLeft > 0 && f._armed) {
      f._armed = false;
      this.flipsLeft--;
      this._flipPulse = 1;   // juice: matuoklio blyksnis + šoktelėjimas
      if (this.flipsLeft <= 0) {
        this.feedback.popup(this.table.W / 2, this.table.H - 66, 'FLIPPERS LOCKED!', '#ff5c5c', 1.35);
        this.feedback.flash = 0.5;
        this.camera.addShake(3);
        this.audio.drain();
      } else if (this.flipsLeft <= 5) {
        this.feedback.popup(x, y - 10, this.flipsLeft + '', '#ff8f6b', 1.0);   // įspėjimas: liko mažai
      }
    }

    // GARSAS + juice — TIK vieną kartą per kontakto epizodą (throttle per flipperį), kad
    // negirdėtųsi kelių smūgių per vieną flipą (substep'ų/riedėjimo multi-kontaktai).
    if (this.tSim - (f._sndT != null ? f._sndT : -1) < 0.1) return;
    f._sndT = this.tSim;
    this.audio.flipHit(strength);
    this.ball.squash = Math.min(1, 0.3 + strength / 700);   // juice: suplojimas per flip
    // JOKIO hit-stop flipperiui — kitaip kiekvienas atmušimas mikro-lagintų.
    if (strength > 300) {
      this.camera.addShake(1.4);
      const b = this.ball, s = Math.hypot(b.vx, b.vy) || 1;
      this.feedback.spark(x, y, b.vx / s, b.vy / s, 6, '#ffffff', strength * 0.35);
    }
  }

  // ── Pagrindinis kadras ──
  _frame(now) {
    let rdt = (now - this._last) / 1000;
    this._last = now;
    if (rdt > 0.25) rdt = 0.25;

    // FPS
    this._fpsCount++; this._fpsT += rdt;
    if (this._fpsT >= 0.5) { this.fps = Math.round(this._fpsCount / this._fpsT); this._fpsCount = 0; this._fpsT = 0; }

    if (!this.paused) {
      // Bullet-time (mėlynas rutulys): laikas sulėtėja, su ŠVELNIU įėjimu/išėjimu
      // (ease in/out), kad nešoktų. `e` = kiek sulėtinta (0..1).
      let ts = 1;
      if (this._slowT > 0) {
        this._slowT = Math.max(0, this._slowT - rdt);   // REALUS laikas
        const dur = CONFIG.slowmo.dur, full = CONFIG.slowmo.timeScale;
        const elapsed = dur - this._slowT, inT = dur * 0.18, outT = dur * 0.5;
        let e = 1;
        if (elapsed < inT) e = elapsed / inT;               // ease IN
        else if (this._slowT < outT) e = this._slowT / outT; // ease OUT
        ts = 1 + (full - 1) * e;
        this._slowInt = e;
      } else {
        this._slowInt = 0;
      }
      const gdt = rdt * ts;                                 // „žaidimo" laikas

      if (!this.picking && !this.gameOver) {
        if (this.feedback.hitStop > 0) {
          this.feedback.hitStop -= rdt;   // hit-stop: fizika sustabdyta, efektai gyvi
        } else if (this._slowT > 0) {
          // Bullet-time: SKLANDUS kintamas žingsnis kas kadrą (be trūkčiojimo, kurį
          // sukelia reti fiksuoti žingsniai lėtai). Skaidom į <=fixedDt gabalus.
          let sdt = gdt, guard = 0;
          while (sdt > 1e-5 && ++guard <= 8) {
            const step = Math.min(CONFIG.fixedDt, sdt);
            this._step(step);
            sdt -= step;
          }
          this.acc = 0;
        } else {
          this.acc += gdt;
          let guard = 0;
          while (this.acc >= CONFIG.fixedDt) {
            this._step(CONFIG.fixedDt);
            this.acc -= CONFIG.fixedDt;
            if (++guard > 240) { this.acc = 0; break; }   // apsauga nuo spiral-of-death
          }
        }
        this.score.update(gdt);
      } else {
        this.acc = 0;   // renkam upgrade — fizika pauzėje
      }
      this.feedback.update(gdt);        // dalelės irgi lėtėja per bullet-time
      this.camera.update(rdt);          // kamera/shake — realiu laiku
      if (this.ball.squash > 0) this.ball.squash = Math.max(0, this.ball.squash - gdt * 9);   // squash gesimas
      if (this._comboPop > 0) this._comboPop = Math.max(0, this._comboPop - rdt * 5);   // combo matuoklio pop
      if (this._scorePop > 0) this._scorePop = Math.max(0, this._scorePop - rdt * 6);   // score pop
      if (this._multPop > 0) this._multPop = Math.max(0, this._multPop - rdt * 1.7);    // kairės juostos ×daugiklio pop
      if (this._flipPulse > 0) this._flipPulse = Math.max(0, this._flipPulse - rdt * 3.5);   // atmušimų matuoklio blyksnis
      this._flipDisp += (this.flipsLeft - this._flipDisp) * Math.min(1, rdt * 11);   // sklandus nusekimas/pildymas
      if (this._trans) { this._trans.t -= rdt; if (this._trans.t <= 0) this._trans = null; }   // perėjimo animacija
      // Bumperių flash + „pop" scale gesimas (lėtėja per bullet-time).
      for (const c of this.table.circles) {
        if (c._flash > 0) c._flash = Math.max(0, c._flash - gdt * 6);
        if (c._scale !== 1) { c._scale += (1 - c._scale) * Math.min(1, gdt * 12); if (Math.abs(c._scale - 1) < 0.01) c._scale = 1; }
      }
      // Sensorių būsenų gesimas + spinner sukimasis.
      for (const s of this.table.sensors) {
        if (s._lit > 0) s._lit = Math.max(0, s._lit - rdt * 3);
        if (s._active > 0) s._active = Math.max(0, s._active - rdt * 5);
        if (s._spin > 0) { s._ang = (s._ang || 0) + s._spin * rdt; s._spin = Math.max(0, s._spin - rdt * 6); }
      }
    }

    this._render();
    this.debug.updateLive(this.fps, this.ball);
    requestAnimationFrame((t) => this._frame(t));
  }

  _resize() {
    const W = CONFIG.world.w, H = CONFIG.world.h;
    // Užpildo ekraną (fractional; `image-rendering: pixelated` išlaiko crisp).
    // 📱 pasukus 90° — plotis/aukštis sukeisti (rotuota drobė telpa į landscape).
    const scale = this.rotated
      ? Math.min(window.innerWidth / H, window.innerHeight / W)
      : Math.min(window.innerWidth / W, window.innerHeight / H);
    this.canvas.style.width = Math.round(W * scale) + 'px';
    this.canvas.style.height = Math.round(H * scale) + 'px';
    // rotate(90deg) CW; transform-origin=center (default) → lieka centre. 90° = pixel-grid išlieka crisp.
    this.canvas.style.transform = this.rotated ? 'rotate(90deg)' : '';
  }
  // 📱 „⟳" mygtukas (DOM, ekrano kampe — nesukasi su drobe). Toggle landscape režimą + persist.
  // ⚠️ 07-27 (žaidėjo Patto pranešimas): mygtukas buvo `right:10px;bottom:10px` — t.y. TIESIAI PO
  //   dešiniuoju flipperio mygtuku, tarpas tik ~67px (flipperis y 668–725, ⟳ buvo y 792–834 ant
  //   390×844 ekrano). Nykštys, siekiantis flipperio, pataikydavo į ⟳ → lenta apsiversdavo į landscape,
  //   o būsena dar ir įsimenama localStorage → žaidėjui atrodė, kad žaidimas sulūžo ir „išmetė".
  //   FIX: perkelta į VIRŠUTINĮ KAIRĮ kampą (nykščiai ten nesiekia; ✕EXIT yra viršuj dešinėj — nesikerta)
  //   + slepiamas kol kamuoliukas žaidime (žr. _syncRotateBtn).
  _installRotateButton() {
    const btn = document.createElement('button');
    btn.id = 'rotate-btn';
    btn.textContent = '⟳';
    btn.title = 'Rotate (landscape)';
    btn.setAttribute('aria-label', 'Rotate landscape');
    btn.style.cssText = 'position:fixed;left:10px;top:10px;z-index:20;width:42px;height:42px;' +
      'border-radius:8px;border:1px solid #2a3050;background:rgba(20,26,48,0.85);color:#cdd6f4;' +
      'font:20px monospace;cursor:pointer;padding:0;line-height:42px;text-align:center;' +
      '-webkit-user-select:none;user-select:none;touch-action:manipulation;';
    const apply = () => { btn.style.transform = this.rotated ? 'rotate(90deg)' : ''; };
    apply();
    btn.addEventListener('click', () => {
      this.rotated = !this.rotated;
      try { localStorage.setItem('rp_rotated', this.rotated ? '1' : '0'); } catch (_) {}
      this._resize();
      apply();
    });
    document.body.appendChild(btn);
    this._rotBtn = btn;
  }
  // ⟳ rodom TIK kai kamuoliukas NEŽAIDIME (meniu / ant plunger'io / game-over / pauzė / upgrade).
  //   Sąlyga tyčia ta pati kaip _drawTouchButtons: kai matomi flipperių mygtukai — ⟳ paslėptas,
  //   tad mid-run į jį pataikyti fiziškai neįmanoma.
  _syncRotateBtn() {
    const b = this._rotBtn;
    if (!b) return;
    const inPlay = this.isTouch && !this.gameOver && !this.picking && !this.ball.onPlunger && !this.paused;
    const want = inPlay ? 'none' : '';
    if (b.style.display !== want) b.style.display = want;
  }

  // ── Render ──
  // ── Bokšto tema: fonas/dangus keičiasi pagal aukštį (kylame per bokštą) ──
  _rgb(c) {
    if (c[0] === '#') { const h = c.slice(1); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
    const m = c.match(/\d+/g); return [+m[0], +m[1], +m[2]];   // 'rgb(r,g,b)'
  }
  _mix(a, b, t) {
    const pa = this._rgb(a), pb = this._rgb(b);
    return 'rgb(' + ((pa[0] + (pb[0] - pa[0]) * t) | 0) + ',' + ((pa[1] + (pb[1] - pa[1]) * t) | 0) + ',' + ((pa[2] + (pb[2] - pa[2]) * t) | 0) + ')';
  }
  // Aukščio tema pagal aukštą: 0 = požemio bazė, 1 = bokšto viršūnė (kosmosas).
  _towerTheme(floor) {
    const t = Math.min(1, Math.max(0, (floor - 1) / 24));
    let sky, top, bot;
    if (t < 0.35) { const k = t / 0.35; sky = this._mix('#2a2340', '#4a5a8f', k); top = this._mix('#241f2e', '#20263c', k); bot = this._mix('#120d18', '#141126', k); }
    else if (t < 0.7) { const k = (t - 0.35) / 0.35; sky = this._mix('#4a5a8f', '#5fa0da', k); top = this._mix('#20263c', '#2b4d78', k); bot = this._mix('#141126', '#182740', k); }
    else { const k = (t - 0.7) / 0.3; sky = this._mix('#5fa0da', '#0a1030', k); top = this._mix('#2b4d78', '#0b1233', k); bot = this._mix('#182740', '#05060f', k); }
    const boss = this.table.isBossFloor(floor);
    if (boss) { sky = this._mix(sky, '#6a1420', 0.55); top = this._mix(top, '#2a1018', 0.5); bot = this._mix(bot, '#180a10', 0.5); }
    return { t, sky, top, bot, stars: t > 0.5 ? Math.min(1, (t - 0.5) / 0.5) : 0, clouds: t > 0.38 && t < 0.82, boss, accent: boss ? '#ff8fd0' : '#7be0ff' };
  }
  _ensureStars() {
    if (this._stars) return;
    let s = 12345; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    this._stars = [];
    for (let i = 0; i < 46; i++) this._stars.push({ x: rnd() * this.table.W, y: rnd() * this.table.H, r: rnd() < 0.3 ? 1.4 : 0.8, tw: rnd() * 6.28 });
  }

  // ── Požemio aplinka (procedūrinė) ──
  // Akmens mūras: blokai su šviesia viršaus-kairės ir tamsia apačios-dešinės briauna.
  _drawMasonry(ctx, W, H) {
    const bw = 26, bh = 18;
    for (let row = 0, y = 0; y < H; row++, y += bh) {
      const off = (row % 2) * (bw / 2);
      for (let cx = -bw; cx < W + bw; cx += bw) {
        const x = cx + off;
        const v = (row * 7 + Math.round(cx / bw) * 13) % 5;    // 0..4 deterministinė variacija
        ctx.fillStyle = this._shade('#2b2431', -0.05 + v * 0.025);
        ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        ctx.fillStyle = 'rgba(255,238,214,0.06)';             // viršaus-kairės šviesa
        ctx.fillRect(x + 1, y + 1, bw - 2, 1); ctx.fillRect(x + 1, y + 1, 1, bh - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.33)';                    // apačios-dešinės šešėlis
        ctx.fillRect(x + 1, y + bh - 2, bw - 2, 1); ctx.fillRect(x + bw - 2, y + 1, 1, bh - 2);
      }
    }
  }

  _drawEnvironment(ctx, W, H, now) {
    // Šoniniai arkiniai LANGAI (mėlyni).
    this._drawWindow(ctx, 5, 78, now); this._drawWindow(ctx, 5, 250, now);
    this._drawWindow(ctx, W - 5, 78, now); this._drawWindow(ctx, W - 5, 250, now);
    // Centrinis HERBAS (karūna + skydas) fone.
    this._drawCrest(ctx, W / 2, 150);
    // Kabančios VĖLIAVOS (herbiniai gobelenai).
    this._drawBanner(ctx, 44, 50, '#5a1f2a'); this._drawBanner(ctx, W - 44, 50, '#3a2150');
    this._drawBanner(ctx, 38, 232, '#3a2150'); this._drawBanner(ctx, W - 38, 232, '#5a1f2a');
    // FAKELĖS (mirga + švyti) — prie sienų/vartų.
    this._drawTorch(ctx, 92, 56, 0.0, now); this._drawTorch(ctx, 168, 56, 1.3, now);
    this._drawTorch(ctx, 24, 186, 2.1, now); this._drawTorch(ctx, W - 24, 186, 3.4, now);
    // 🔥 Apatiniai šoniniai dekoratyviniai fakelai PAŠALINTI (24,322 / 236,322) — vietoj jų burn-zonos (žr. _drawBurnZone).
    // Apačios GROTŲ durys.
    this._drawDoor(ctx, W / 2, H - 24);
    // Vinjetė (tamsūs kraštai — požemio nuotaika).
    const vg = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.3, W / 2, H * 0.5, H * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  _flame(ctx, x, y, w, h) {   // lašo formos liepsna
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.quadraticCurveTo(x + w, y - h * 0.4, x + w * 0.55, y);
    ctx.quadraticCurveTo(x, y + 1.5, x - w * 0.55, y);
    ctx.quadraticCurveTo(x - w, y - h * 0.4, x, y - h);
    ctx.closePath(); ctx.fill();
  }

  // Fakelas = COMBO INDIKATORIUS. `intensity` 0..1 (0=nedega, 1=max combo): valdo
  // ugnies dydį ir švytėjimą. Žemos raiškos drobė → pikseliuota, kai išdidinama.
  _drawTorchFire(ctx, x, y, seed, now, intensity) {
    if (intensity <= 0.02) return;                          // nėra combo → nedega
    const flick = 0.82 + 0.18 * (0.5 * Math.sin(now / 90 + seed) + 0.5 * Math.sin(now / 41 + seed * 3));
    const lit = intensity * flick;
    const cy = y - 4, R = (9 + 27 * intensity) * flick;     // švytėjimas AUGA su combo
    const gr = ctx.createRadialGradient(x, cy, 1, x, cy, R);
    gr.addColorStop(0, 'rgba(255,182,92,' + (0.42 * lit).toFixed(3) + ')');
    gr.addColorStop(0.5, 'rgba(255,140,50,' + (0.16 * lit).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, cy, R, 0, Math.PI * 2); ctx.fill();
    const wob = Math.sin(now / 65 + seed) * 1.3;
    const h = (3 + 10 * intensity) * flick, w = 2 + 3 * intensity;   // ugnis AUGA su combo
    ctx.fillStyle = '#e8541a'; this._flame(ctx, x + wob * 0.45, y, w, h + 2);       // išorė
    ctx.fillStyle = '#ff9a2e'; this._flame(ctx, x + wob * 0.3, y, w * 0.7, h);       // vidurys
    ctx.fillStyle = '#ffe27a'; this._flame(ctx, x + wob * 0.2, y - 1, w * 0.38, h * 0.6); // šerdis
  }
  _drawTorch(ctx, x, y, seed, now) {
    const flick = 0.85 + 0.15 * (0.5 * Math.sin(now / 90 + seed) + 0.5 * Math.sin(now / 37 + seed * 2));
    const gr = ctx.createRadialGradient(x, y - 2, 2, x, y - 2, 34 * flick);   // šiltas švytėjimas
    gr.addColorStop(0, 'rgba(255,170,80,0.34)'); gr.addColorStop(0.5, 'rgba(255,130,50,0.13)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y - 2, 34 * flick, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3540'; ctx.fillRect(x - 2, y + 2, 4, 8);           // metalinis laikiklis
    ctx.fillStyle = '#55505c'; ctx.fillRect(x - 3, y + 9, 6, 2);
    const wob = Math.sin(now / 60 + seed) * 1.2, h = 10 * flick;           // liepsna (3 sluoksniai)
    ctx.fillStyle = '#ff6a1a'; this._flame(ctx, x + wob * 0.5, y, 5, h + 3);
    ctx.fillStyle = '#ffb23c'; this._flame(ctx, x + wob * 0.3, y, 3.4, h);
    ctx.fillStyle = '#ffe89a'; this._flame(ctx, x + wob * 0.2, y - 1, 1.9, h * 0.6);
  }

  // ⚡ TESLA mazgas — švarus mėlynas branduolys + 3 PLONI, TRUMPI žaibai į atsitiktines puses.
  //   `intensity` 0..1 = fade-in/out envelope (iš _drawBurnZone) → sklandus atsiradimas/išnykimas.
  _drawTesla(ctx, x, y, now, seed, intensity) {
    if (intensity <= 0.02) return;
    const R = 10 + 18 * intensity;
    const gr = ctx.createRadialGradient(x, y, 1, x, y, R);
    gr.addColorStop(0, 'rgba(150,210,255,' + (0.42 * intensity).toFixed(3) + ')');
    gr.addColorStop(0.5, 'rgba(90,160,255,' + (0.16 * intensity).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(70,140,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(225,242,255,' + (0.72 * intensity).toFixed(3) + ')';   // baltas branduolys
    ctx.beginPath(); ctx.arc(x, y, 2.0 + 1.2 * intensity, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(185,225,255,' + (0.5 * intensity + 0.22).toFixed(3) + ')';
    ctx.lineWidth = 0.8;                                        // PLONI žaibai
    for (let a = 0; a < 3; a++) {                               // 3 žaibai į atsitiktines puses
      const ang = Math.random() * Math.PI * 2;
      const len = (4 + 9 * intensity) * (0.55 + Math.random() * 0.5);   // TRUMPI
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 1; i <= 3; i++) {
        const t = i / 3;
        ctx.lineTo(x + Math.cos(ang) * len * t + (Math.random() - 0.5) * 3,
                   y + Math.sin(ang) * len * t + (Math.random() - 0.5) * 3);
      }
      ctx.stroke();
    }
  }

  // BURN-ZONA — atsiradimo/išnykimo animacija (fade-in/out) + mėlynas TESLA. Kai kamuoliukas lauke:
  //   plonas mėlynas žaibo lankas mazgas→kamuoliukas + mėlyna aura → matosi, kad magnetas jį veikia.
  _drawBurnZone(ctx, z, now) {
    if (z.burnT <= 0) return;
    // 🎞️ atsiradimo/išnykimo animacija: fade-in 0.35s, fade-out paskutines 0.6s
    const bs = CONFIG.burnZone.burnSec, elapsed = bs - z.burnT;
    const env = Math.max(0, Math.min(1, elapsed / 0.35, z.burnT / 0.6));
    this._drawTesla(ctx, z.x, z.y, now, z.seed, env);
    const b = this.ball, rR = CONFIG.burnZone.repelRadius;
    const dx = b.x - z.x, dy = b.y - z.y, d = Math.hypot(dx, dy);
    if (d >= rR || d < 0.1 || b.onPlunger) return;
    const inten = (1 - d / rR) * env;
    if (inten < 0.03) return;
    const nx = dx / d, ny = dy / d;
    // Flicker OFF → laukas prigęsta (nestabilus): žaibas/aura silpsta, matyti kad atleido.
    const gate = z._magOn === false ? 0.28 : 1;
    ctx.globalAlpha *= gate;
    // MĖLYNAS PLONAS žaibo lankas mazgas→kamuoliukas (mirga)
    ctx.strokeStyle = 'rgba(160,215,255,' + (0.30 + 0.55 * inten).toFixed(3) + ')';
    ctx.lineWidth = 0.9;                                        // plonas
    ctx.beginPath(); ctx.moveTo(z.x, z.y - 3);
    const seg = 5;
    for (let i = 1; i <= seg; i++) {
      const t = i / seg, jit = (i < seg) ? (2 + 4 * inten) : 0;   // galas tiksliai ant kamuoliuko
      ctx.lineTo(z.x + nx * d * t + (Math.random() - 0.5) * jit,
                 (z.y - 3) + ny * d * t + (Math.random() - 0.5) * jit);
    }
    ctx.stroke();
    // KAMUOLIUKO mėlyna aura
    const gr = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r + 5);
    gr.addColorStop(0, 'rgba(130,195,255,' + (0.60 * inten).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(90,160,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;   // atstatom (gate galėjo sumažinti)
  }

  _drawWindow(ctx, x, yc, now) {
    const w = 9, h = 46;
    ctx.fillStyle = '#171320'; ctx.fillRect(x - w / 2 - 2, yc - h / 2 - 6, w + 4, h + 10);   // rėmas
    const g = ctx.createLinearGradient(0, yc - h / 2, 0, yc + h / 2);
    g.addColorStop(0, '#3f7fbf'); g.addColorStop(1, '#1a2f5a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, yc + h / 2);
    ctx.lineTo(x - w / 2, yc - h / 2 + w / 2);
    ctx.arc(x, yc - h / 2 + w / 2, w / 2, Math.PI, 0);
    ctx.lineTo(x + w / 2, yc + h / 2);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.3 + 0.15 * Math.sin(now / 700 + x);                 // spindesys
    ctx.fillStyle = '#bfe0ff'; ctx.fillRect(x - w / 2, yc - h / 4, w, 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#0e0b16'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, yc - h / 2); ctx.lineTo(x, yc + h / 2); ctx.stroke();
  }

  _drawCrest(ctx, cx, cy) {
    ctx.save(); ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(20,16,26,0.6)';                                   // skydas
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy - 20); ctx.lineTo(cx + 26, cy - 20); ctx.lineTo(cx + 26, cy + 8);
    ctx.quadraticCurveTo(cx, cy + 42, cx - 26, cy + 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,120,60,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(185,152,72,0.55)';                               // karūna
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy - 24); ctx.lineTo(cx - 10, cy - 34); ctx.lineTo(cx - 4, cy - 26);
    ctx.lineTo(cx, cy - 37); ctx.lineTo(cx + 4, cy - 26); ctx.lineTo(cx + 10, cy - 34);
    ctx.lineTo(cx + 16, cy - 24); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  _drawBanner(ctx, x, y, color) {
    const w = 18, h = 58;
    ctx.fillStyle = '#4a4550'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 2);   // strypas
    ctx.fillStyle = color;                                                     // audinys
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h - 6);
    ctx.lineTo(x, y + h); ctx.lineTo(x - w / 2, y + h - 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c9a24b'; ctx.lineWidth = 1; ctx.stroke();               // aukso apvadas
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 1, y, w / 2 - 1, h - 6); // šešėlis
    ctx.fillStyle = 'rgba(201,162,75,0.7)';                                     // emblema (rombas)
    ctx.beginPath();
    ctx.moveTo(x, y + 16); ctx.lineTo(x + 5, y + 24); ctx.lineTo(x, y + 32); ctx.lineTo(x - 5, y + 24);
    ctx.closePath(); ctx.fill();
  }

  _drawDoor(ctx, cx, cy) {
    const w = 20, h = 22;
    ctx.fillStyle = '#0d0a12';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.beginPath(); ctx.arc(cx, cy - h / 2, w / 2, Math.PI, 0); ctx.fill();     // arka
    ctx.strokeStyle = '#3a3038'; ctx.lineWidth = 1;                             // grotos
    for (let gx = cx - w / 2 + 3; gx < cx + w / 2; gx += 4) { ctx.beginPath(); ctx.moveTo(gx, cy - h / 2); ctx.lineTo(gx, cy + h / 2); ctx.stroke(); }
    for (let gy = cy - h / 2 + 4; gy < cy + h / 2; gy += 5) { ctx.beginPath(); ctx.moveTo(cx - w / 2, gy); ctx.lineTo(cx + w / 2, gy); ctx.stroke(); }
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#ff8a3c';                           // šiltas švytėjimas viduj
    ctx.fillRect(cx - w / 2 + 2, cy - 2, w - 4, 4); ctx.globalAlpha = 1;
  }

  // ── Įrėmintas portretas — kabo aukštai ant sienos šalia vėliavų (virš ──
  // billiardOnly barjero, kur dideli rutuliai neužeina). Sprite = 8 kadrai po
  // 640×640; pilkas fonas nuimtas → portraitN.png (alfa). STOVI ramiai (kadras 0);
  // animacija (vienas mirksėjimo ciklas) groja tik kol p.animT>0 (palietus kamuoliuku).
  _portraitDur() { return CONFIG.portrait.loops * 8 * CONFIG.portrait.frameMs / 1000; }  // animacijos trukmė

  // Piešia portretą (kadras 0 kol ramus). Palietus: p.animT = SHAKE+DUR → pirma VIRPĖJIMO
  // fazė (paveikslas krusteli, kadras 0), tada VIENAS animacijos ciklas, tada vėl ramus.
  _drawPortrait(ctx, p) {
    const sheet = p.img;
    if (!sheet || !sheet.complete || !sheet.naturalWidth) return;
    const CX = 228, CY = 185, CW = 185, CH = 270;      // turinio langas kadre (bbox + paraštė)
    const dur = this._portraitDur(), SH = CONFIG.portrait.shake;
    let fr = 0, ox = 0, oy = 0;
    if (p.animT > dur) {
      // Virpėjimo fazė (iškart po palietimo): gęstantis krustelėjimas, kadras 0.
      const e = p.animT - dur;                          // SH..0
      const k = e / SH;                                 // 1..0 (amplitudė gęsta)
      ox = Math.sin((SH - e) * 80) * 1.7 * k;
      oy = Math.cos((SH - e) * 96) * 1.2 * k;
    } else if (p.animT > 0) {
      // Animacijos fazė: vienas ciklas (baigiasi ties 0 kadru → be šoktelėjimo).
      const elapsed = dur - p.animT;
      fr = Math.floor(elapsed * 1000 / CONFIG.portrait.frameMs) % 8;
    }
    const dw = p.dh * (CW / CH);
    const dx = p.x - dw / 2 + ox, dy = p.y - p.dh / 2 + oy;
    // Švelnus šešėlis (gylis — tarsi kabo ant sienos, apšviestas iš viršaus-kairės).
    ctx.save();
    ctx.globalAlpha = 0.32; ctx.fillStyle = '#000';
    ctx.fillRect(dx + 1.2, dy + 1.6, dw, p.dh);
    ctx.restore();
    ctx.drawImage(sheet, fr * 640 + CX, CY, CW, CH, dx, dy, dw, p.dh);
  }

  _render() {
    const W = this.table.W, H = this.table.H;
    const ctx = this.ctx;
    ctx.setTransform(this._ss, 0, 0, this._ss, 0, 0);   // supersample mastelis (aukšta raiška)

    // ── Fonas = BG.png SPRITE (pilies lenta). Kolizijos = hitbox'ai palei bėgius. ──
    const now = performance.now();
    if (this.bgImg && this.bgImg.complete && this.bgImg.naturalWidth) {
      ctx.drawImage(this.bgImg, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#14101a'; ctx.fillRect(0, 0, W, H);   // fallback kol paveikslas kraunasi
    }
    // 🔥 SENIEJI šoniniai combo indikatoriai (43,242 / 217,242) PANAIKINTI — vietoj jų burn-zonos (žr. _drawBurnZone).

    // Sieniniai FAKELAI prie vėliavų — dega kol burnT>0 (palietus kamuoliuku), gęsta per burnSec.
    for (const t of this.torches) {
      if (t.burnT > 0) {
        const inten = Math.min(1, t.burnT / CONFIG.torch.burnSec);   // 1 (ką tik) → 0 (gęsta)
        this._drawTorchFire(ctx, t.x, t.y, t.seed, now, inten);
      }
    }

    // 🔥 BURN-ZONOS (apatiniai šonai) — metalinė bazė + liepsna + magneto atstūmimo žiedas (kol dega).
    for (const z of this.burnZones) this._drawBurnZone(ctx, z, now);

    // Portretai — kabo ant sienos. Piešiam PO fono, bet PRIEŠ kamerą/kamuoliuką →
    // kamuoliukas matosi VIRŠ paveikslo (paveikslas = apatinis sluoksnis). Glotninimas
    // visada įjungtas (supersample) → sprite ryškus, ne sulaužytas.
    for (const p of this.portraits) this._drawPortrait(ctx, p);

    ctx.save();
    this.camera.apply(ctx);

    this._drawTable(ctx);
    this._drawExitSign(ctx);   // 🟢 „EXIT" rodyklė kai lubų vartai laisvi (nėra gyvo boso)
    this._drawSensors(ctx);
    this._drawTrail(ctx);
    this._drawFlippers(ctx);
    this._drawBall(ctx);
    this._drawSteer(ctx);
    if (this._showHitbox) this._drawHitbox(ctx);   // debug: kolizijos ant paveikslo (H)
    this.feedback.draw(ctx);

    ctx.restore();

    // Bullet-time: subtili mėlyna vinjetė (kad būtų aišku — tai sulėtinimas, ne lagas).
    if (this._slowInt > 0.01) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.62);
      vg.addColorStop(0, 'rgba(60,110,190,0)');
      vg.addColorStop(1, 'rgba(50,90,190,' + (0.34 * this._slowInt).toFixed(3) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }

    this._drawFlash(ctx, W, H);
    this._drawHUD(ctx, W, H);
    this._drawTouchButtons(ctx, W, H);   // 📱 matomi L/R flipperių mygtukai (tik touch)
    this._syncRotateBtn();               // 📱 ⟳ slepiam kol kamuoliukas žaidime (žr. _installRotateButton)
    if (this._trans) this._drawTransition(ctx, W, H);
    if (this.paused) this._drawCenter(ctx, W, H, 'PAUSED', '#cdd6f4');
    if (this.picking) this._drawUpgradeOverlay(ctx, W, H);
    // Su web3 meniu (DOM overlay) game-over rodo #rp-menu — senojo canvas ekrano NEpiešiam,
    //   kad nesidubliuotų/nesišmėkščiuotų fone. Be modulio (standalone) — canvas game-over veikia.
    if (this.gameOver && !this._menuGate) this._drawGameOver(ctx, W, H);
  }

  // ── Aukšto pranešimas (~2.2s) — DIDELIS CENTRUOTAS, informuoja apie aukštą + daugiklį (atlygį) ──
  // Vėsus mėlynas blyksnis + kylantys cyan žėrutys + „FLOOR N" (žydras) + „SCORE ×mult" (žalias),
  // su pop efektu. Rodomas startuojant („GET READY") ir kylant į naują aukštą („NEW FLOOR").
  _drawTransition(ctx, W, H) {
    const tr = this._trans;
    const age = tr.dur - tr.t, p = Math.min(1, age / tr.dur);
    const a = p < 0.14 ? p / 0.14 : p > 0.78 ? (1 - p) / 0.22 : 1;   // fade in/out

    // 1) Trumpas VĖSUS blyksnis (mėlynas „level up") — greitai praeina, matosi žaidimas
    const flash = Math.max(0, 1 - age / 0.32);
    if (flash > 0.01) {
      ctx.fillStyle = 'rgba(120,200,255,' + (0.18 * flash).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    // 2) Kylantys žėrutys (vėsūs cyan/balti) — atmosfera, praktiškai nedengia
    ctx.globalAlpha = a * 0.8;
    for (let i = 0; i < 18; i++) {
      const sx = (i * 73 + 17) % W;
      const rise = age * (130 + (i % 5) * 45) * 3.2;
      const sy = H - 4 - ((i * 61 + rise) % (H + 30));
      const sz = 1 + (i % 3);
      ctx.fillStyle = (i % 2) ? '#7be0ff' : '#dff2ff';
      ctx.fillRect(sx, sy, sz, sz);
    }
    ctx.globalAlpha = 1;
    // (Didelio centruoto teksto NEBĖRA — info dabar kairės juostos ×daugiklio „mygtuke", žr. _drawTowerGauge.)
  }

  // Debug: kolizijų (hitbox) kontūrai ant BG.png — kad matytum, ar sutampa su bėgiais.
  // Jungiama H klavišu. Kai sutaps — išjunk (arba paliksim tik derinimui).
  _drawHitbox(ctx) {
    const W = this.table.W, H = this.table.H;
    ctx.save();
    ctx.lineCap = 'round';
    // Koordinačių TINKLELIS (kas 20px) + skaičiai — kad galėtum tiksliai nurodyti coords.
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 20; x < W; x += 20) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 20; y < H; y += 20) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.font = '5px monospace'; ctx.fillStyle = 'rgba(150,235,255,0.8)'; ctx.textAlign = 'left';
    for (let x = 0; x <= W; x += 40) ctx.fillText(String(x), x + 1, 6);
    for (let y = 40; y <= H; y += 40) ctx.fillText(String(y), 1, y - 1);
    // SIENOS + galų taškai
    for (const s of this.table.segments) {
      if (s.dropped) continue;
      ctx.strokeStyle = s.billiardOnly ? 'rgba(255,80,200,0.9)' :   // tik dideliems rutuliams
        s.type === 'gate' ? 'rgba(120,255,150,0.9)' : 'rgba(0,240,255,0.8)';
      ctx.lineWidth = Math.max(1, (s.r || 3) * 2);
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(s.ax - 1, s.ay - 1, 2, 2); ctx.fillRect(s.bx - 1, s.by - 1, 2, 2);
    }
    // FLIPPERIAI
    ctx.strokeStyle = 'rgba(255,220,0,0.9)';
    for (const f of this.flippers) {
      ctx.lineWidth = Math.max(1, f.half * 2);
      ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(f.tipX, f.tipY); ctx.stroke();
    }
    // PLUNGER seat + DRAIN riba
    const ps = this.table.plungerSeat;
    ctx.fillStyle = 'rgba(255,0,200,0.9)';
    ctx.beginPath(); ctx.arc(ps.x, ps.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,70,70,0.6)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H - 6); ctx.lineTo(W, H - 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Game over — PILIES/AUKSO stilius: akmens plokštė su aukso rėmu, „GAME OVER" kraujo
  // raudona su kontūru, auksiniai įspausti skaičiai, rusenantys žėrutys, pulsuojantis RETRY.
  _drawGameOver(ctx, W, H) {
    const now = performance.now();
    // uždangalas + šiltai tintuota vinjetė
    ctx.fillStyle = 'rgba(6,5,10,0.82)'; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // rusenantys žėrutys (atmosfera, dera su fakelais)
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 12; i++) {
      const sx = (i * 83 + 30) % W;
      const sy = H - ((i * 97 + now * 0.022 * (1 + i % 3)) % (H + 20));
      ctx.fillStyle = (i % 2) ? '#c98a3a' : '#7a4a24';
      ctx.fillRect(sx, sy, 1 + (i % 2), 1 + (i % 2));
    }
    ctx.globalAlpha = 1;

    // akmens/aukso plokštė (didesnė — telpa LEADERBOARD)
    const pw = 202, ph = 252, px = (W - pw) / 2, py = H / 2 - ph / 2 - 2;
    ctx.fillStyle = 'rgba(13,12,18,0.95)'; ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#c9a24b'; ctx.lineWidth = 1.5; ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.strokeStyle = 'rgba(201,162,75,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(px + 3.5, py + 3.5, pw - 7, ph - 7);
    ctx.fillStyle = '#c9a24b';   // kampų rombai
    for (const c of [[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph]]) {
      ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.2, -2.2, 4.4, 4.4); ctx.restore();
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // GAME OVER — kraujo raudona su tamsiu kontūru
    const t = 'GAME OVER', gy = py + 24;
    ctx.font = 'bold 19px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(t, W / 2 + 1.2, gy + 1.5);
    ctx.lineWidth = 3; ctx.strokeStyle = '#3a1008'; ctx.lineJoin = 'round'; ctx.strokeText(t, W / 2, gy);
    ctx.fillStyle = '#c34438'; ctx.fillText(t, W / 2, gy);

    const myRank = (this._boardRank != null) ? this._boardRank : -1;
    const board = this._board || this.score.loadBoard();

    // dabartinio runo eilutė (arba „NEW BEST" jei #1)
    const runY = py + 44;
    if (myRank === 0) {
      ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#6effa0';
      ctx.fillText('★  NEW  BEST  ★', W / 2, runY);
    } else {
      ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#9aa4c4';
      ctx.fillText('FLOOR ' + this.floor + '   ·   SCORE ' + Math.floor(this.score.score), W / 2, runY);
    }

    // TOP SCORES antraštė + skirtukas
    ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#e8b34a';
    ctx.fillText('T O P   S C O R E S', W / 2, py + 62);
    const divY = py + 71;
    ctx.strokeStyle = 'rgba(201,162,75,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 14, divY); ctx.lineTo(px + pw - 14, divY); ctx.stroke();

    // eilutės (top 8): rank · score · floor; paryškinta dabartinio runo eilutė
    const N = Math.min(8, board.length), rowH = 19, startY = py + 84;
    for (let i = 0; i < N; i++) {
      const e = board[i], ry = startY + i * rowH, me = (i === myRank);
      if (me) {
        ctx.fillStyle = 'rgba(110,255,160,0.14)';
        ctx.fillRect(px + 8, ry - rowH / 2 + 1, pw - 16, rowH - 2);
        ctx.strokeStyle = 'rgba(110,255,160,0.5)'; ctx.lineWidth = 1;
        ctx.strokeRect(px + 8.5, ry - rowH / 2 + 1.5, pw - 17, rowH - 3);
      }
      const gold = i === 0, medalC = gold ? '#ffe08a' : i === 1 ? '#d8dde8' : i === 2 ? '#e0a060' : '#9c7c3a';
      ctx.textAlign = 'left'; ctx.font = 'bold 10px monospace'; ctx.fillStyle = me ? '#b6ffcf' : medalC;
      ctx.fillText((i + 1) + '.', px + 16, ry);
      ctx.font = 'bold 12px monospace'; ctx.fillStyle = me ? '#eafff2' : (gold ? '#f2c25a' : '#dfe6f4');
      ctx.fillText(String(e.score), px + 42, ry);
      ctx.textAlign = 'right'; ctx.font = 'bold 8px monospace'; ctx.fillStyle = me ? '#9effc0' : '#8b93b5';
      ctx.fillText('FL ' + (e.floor || 1), px + pw - 16, ry);
      ctx.textAlign = 'center';
    }
    if (N === 0) {
      ctx.font = '8px monospace'; ctx.fillStyle = '#6a6f88';
      ctx.fillText('no scores yet', W / 2, startY + 8);
    }

    // RETRY — pulsuojantis amber (žemiau plokštės)
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 280);
    ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#e8b34a';
    ctx.fillText(this.isTouch ? 'TAP TO RETRY' : 'PRESS ANY KEY TO RETRY', W / 2, py + ph + 12);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  _wrapText(ctx, text, cx, y, maxW, lh) {
    const words = text.split(' ');
    let line = '', yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, cx, yy); line = w; yy += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  _drawUpgradeOverlay(ctx, W, H) {
    ctx.fillStyle = 'rgba(5,7,14,0.84)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7be0ff'; ctx.font = 'bold 12px monospace';
    ctx.fillText('FLOOR ' + this.floor + ' REACHED', W / 2, 66);
    ctx.fillStyle = '#9aa4c4'; ctx.font = '8px monospace';
    ctx.fillText('CHOOSE AN UPGRADE', W / 2, 82);

    const cardW = 74, cardH = 96, gap = 8;
    const totalW = cardW * 3 + gap * 2;
    const x0 = (W - totalW) / 2, y0 = H / 2 - cardH / 2;
    for (let i = 0; i < this.choices.length; i++) {
      const u = this.choices[i];
      const cx = x0 + i * (cardW + gap);
      ctx.fillStyle = 'rgba(20,26,44,0.96)';
      ctx.fillRect(cx, y0, cardW, cardH);
      ctx.strokeStyle = u.color; ctx.lineWidth = 2;
      ctx.strokeRect(cx + 1, y0 + 1, cardW - 2, cardH - 2);
      ctx.fillStyle = u.color; ctx.font = 'bold 15px monospace';
      ctx.fillText('' + (i + 1), cx + cardW / 2, y0 + 22);
      ctx.fillStyle = '#eef2ff'; ctx.font = 'bold 8px monospace';
      this._wrapText(ctx, u.name, cx + cardW / 2, y0 + 44, cardW - 8, 10);
      ctx.fillStyle = '#9aa4c4'; ctx.font = '7px monospace';
      this._wrapText(ctx, u.desc, cx + cardW / 2, y0 + 70, cardW - 8, 9);
    }
    ctx.fillStyle = '#5a6488'; ctx.font = '7px monospace';
    ctx.fillText(this.isTouch ? 'TAP A CARD' : 'PRESS 1 / 2 / 3   or CLICK', W / 2, y0 + cardH + 18);
    ctx.textAlign = 'left';
  }

  // ── Piešimo pagalbininkai ──
  _shade(hex, amt) {
    const h = hex.replace('#', '');
    let r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    if (amt < 0) { const k = 1 + amt; r *= k; g *= k; b *= k; }
    else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  _starPath(ctx, cx, cy, rOut, rIn, points, rot) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 === 0 ? rOut : rIn;
      const a = rot + (i * Math.PI) / points;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  _popBumper(ctx, c) {
    const PI2 = Math.PI * 2;
    const flash = c._flash > 0;
    const col = c.color;
    const px = c.x + (c._ox || 0), py = c.y + (c._oy || 0);   // recoil judesys
    const R = (c.r + (flash ? 1 : 0)) * (c._scale || 1) * this._spawnPop(c);   // hit „pop" × spawn „pop"
    // šešėlis
    ctx.fillStyle = '#0a0812';
    ctx.beginPath(); ctx.arc(px + 1, py + 2, R + 1, 0, PI2); ctx.fill();
    // tamsi briauna
    ctx.fillStyle = this._shade(col, -0.5);
    ctx.beginPath(); ctx.arc(px, py, R, 0, PI2); ctx.fill();
    // korpusas
    ctx.fillStyle = flash ? this._shade(col, 0.4) : col;
    ctx.beginPath(); ctx.arc(px, py, Math.max(0.05, R - 1.5), 0, PI2); ctx.fill();   // clamp: spawn „pop" R→0

    // ── 3D RIEDĖJIMAS: dėmės mapinamos ant SFEROS ir slenka paviršiumi motion
    // kryptimi (išnyra iš vieno krašto, perbėga, dingsta kitame), o ne orbituoja
    // centre. Fiksuota šviesa (žemiau) → akiai tai „rutulys, riedantis aplink
    // savo ašį", ne besisukantis diskas. Viskas nukerpama rutulio viduje.
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, Math.max(0.05, R - 1.2), 0, PI2); ctx.clip();   // clamp: spawn „pop" R→0

    const ux = c._rollDx || 1, uy = c._rollDy || 0;   // riedėjimo kryptis (ekrane)
    const vx = -uy, vy = ux;                           // sukimosi ašis (statmena krypčiai)
    const phi = c._roll || 0;
    // [platuma a išilgai ašies (-1..1), bazinė ilguma]
    const spots = [[0.0, 0.0], [0.5, 2.25], [-0.42, 4.1], [0.26, 5.5]];
    ctx.fillStyle = this._shade(col, -0.36);
    for (const s of spots) {
      const ang = s[1] + phi;
      const near = Math.cos(ang);
      if (near <= 0.06) continue;                      // tolimoji pusė — nematoma
      const rho = Math.sqrt(1 - s[0] * s[0]);
      const along = R * rho * Math.sin(ang);           // slinkimas motion kryptimi
      const perp = R * s[0];                           // pastovi „platuma" išilgai ašies
      const sr = R * 0.27 * near;                      // foreshortening: mažėja prie krašto
      ctx.beginPath();
      ctx.arc(px + ux * along + vx * perp, py + uy * along + vy * perp, sr, 0, PI2);
      ctx.fill();
    }

    // Fiksuotas sferos šviesėjimas (apimtis) — puslaidis, „apgaubia" dėmes į formą.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = this._shade(col, 0.34);
    ctx.beginPath(); ctx.arc(px - R * 0.24, py - R * 0.26, R * 0.6, 0, PI2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // baltas blikas (FIKSUOTAS — šviesos šaltinis, virš visko)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px - R * 0.3, py - R * 0.32, R * 0.2, 0, PI2); ctx.fill();
  }

  _drawTable(ctx) {
    const PI2 = Math.PI * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ── Segmentai: senieji chromo bėgiai NEBEPIEŠIAMI (BG.png juos turi). ──
    for (const s of (this._drawRails ? this.table.segments : [])) {
      if (s.type === 'gate') {
        const open = s.dropped;
        const gy = s.ay;
        // akmeninė staktos sija viršuj
        ctx.strokeStyle = '#3a3546'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(s.ax - 1, gy - 3); ctx.lineTo(s.bx + 1, gy - 3); ctx.stroke();
        if (open) {
          // PAKELTA portcullis — trumpi geležiniai stubai + žalias „open" spindesys + ▲.
          ctx.strokeStyle = '#7a8296'; ctx.lineWidth = 2;
          for (let bx = s.ax + 5; bx < s.bx; bx += 9) { ctx.beginPath(); ctx.moveTo(bx, gy - 6); ctx.lineTo(bx, gy - 2); ctx.stroke(); }
          const pulse = 0.5 + 0.4 * Math.sin(performance.now() / 140);
          ctx.globalAlpha = pulse; ctx.strokeStyle = '#8fe89a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(s.ax + 3, gy); ctx.lineTo(s.bx - 3, gy); ctx.stroke();
          ctx.fillStyle = '#8fe89a';
          for (let k = 0; k < 3; k++) {
            const ax = (s.ax + s.bx) / 2 + (k - 1) * 16;
            ctx.beginPath(); ctx.moveTo(ax, gy - 8); ctx.lineTo(ax - 3, gy - 4); ctx.lineTo(ax + 3, gy - 4); ctx.closePath(); ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else {
          // NULEISTA portcullis — geležinės vertikalios grotos (down).
          ctx.strokeStyle = '#22242e'; ctx.lineWidth = 3;
          for (let bx = s.ax + 5; bx <= s.bx; bx += 9) { ctx.beginPath(); ctx.moveTo(bx, gy - 2); ctx.lineTo(bx, gy + 11); ctx.stroke(); }
          ctx.strokeStyle = '#6a7284'; ctx.lineWidth = 2;
          for (let bx = s.ax + 5; bx <= s.bx; bx += 9) { ctx.beginPath(); ctx.moveTo(bx, gy - 2); ctx.lineTo(bx, gy + 11); ctx.stroke(); }
          ctx.strokeStyle = '#9aa2b4'; ctx.lineWidth = 1;
          for (let bx = s.ax + 5; bx <= s.bx; bx += 9) { ctx.beginPath(); ctx.moveTo(bx - 0.6, gy - 2); ctx.lineTo(bx - 0.6, gy + 11); ctx.stroke(); }
        }
        continue;
      }
      if (s.type === 'drop') {
        const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
        const horiz = Math.abs(s.bx - s.ax) > Math.abs(s.by - s.ay);
        const w = horiz ? Math.abs(s.bx - s.ax) : 5;
        const h = horiz ? 5 : Math.abs(s.by - s.ay);
        const x0 = Math.round(mx - w / 2), y0 = Math.round(my - h / 2);
        if (s.dropped) { ctx.globalAlpha = 0.16; ctx.fillStyle = '#5a6488'; ctx.fillRect(x0, y0, Math.ceil(w), Math.ceil(h)); ctx.globalAlpha = 1; }
        else {
          ctx.fillStyle = '#ff5c8a'; ctx.fillRect(x0, y0, Math.ceil(w), Math.ceil(h));
          ctx.fillStyle = '#ffd0e0'; ctx.fillRect(x0, y0, Math.ceil(w), 1);   // viršaus blikas
        }
        continue;
      }
      if (s.type === 'sling') {
        const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
        const dx = s.bx - s.ax, dy = s.by - s.ay, L = Math.hypot(dx, dy) || 1;
        let px = -dy / L, py = dx / L;
        const cx = this.table.W / 2, cyc = 200;   // pasukam „kūną" nuo lauko centro
        if ((mx + px * 10 - cx) ** 2 + (my + py * 10 - cyc) ** 2 < (mx - px * 10 - cx) ** 2 + (my - py * 10 - cyc) ** 2) { px = -px; py = -py; }
        const tx = mx + px * 15, ty = my + py * 15;
        ctx.fillStyle = '#d63a34';
        ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.lineTo(tx, ty); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#eef2ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
        ctx.fillStyle = '#c9d2e4';
        for (const p of [[s.ax, s.ay], [s.bx, s.by], [tx, ty]]) { ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, PI2); ctx.fill(); }
        continue;
      }
      // AKMENS railas: tamsus kontūras + akmuo + šviesi briauna (viršus-kairė).
      ctx.strokeStyle = '#181521'; ctx.lineWidth = s.r * 2 + 1;
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
      ctx.strokeStyle = '#565266'; ctx.lineWidth = Math.max(1, s.r * 2 - 1);
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
      ctx.strokeStyle = '#8f8aa2'; ctx.lineWidth = Math.max(1, s.r * 0.6);
      ctx.beginPath(); ctx.moveTo(s.ax - 0.5, s.ay - 0.6); ctx.lineTo(s.bx - 0.5, s.by - 0.6); ctx.stroke();
    }

    // ── Apskritimai: pop-bumperiai / boost / posts (chrome studs) ──
    for (const c of this.table.circles) {
      if (c.dead && c.type !== 'boss') continue;   // sunaikintas mobas — nepiešiam
      if (this.tSim < (c._appearAt || 0)) continue;   // „pop" atsiradimas: dar nematomas
      if (c.type === 'post') {
        ctx.fillStyle = '#080810';
        ctx.beginPath(); ctx.arc(c.x + 0.5, c.y + 1, c.r, 0, PI2); ctx.fill();
        ctx.fillStyle = '#8892a8';
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, PI2); ctx.fill();
        ctx.fillStyle = '#dfe6f4';
        ctx.beginPath(); ctx.arc(c.x - 0.6, c.y - 0.8, c.r * 0.5, 0, PI2); ctx.fill();
        continue;
      }
      // boost — piešiam kaip paprastą rutulį (be auros/žiedo, kad atrodytų kaip visi kiti);
      // krenta žemyn į bendrą _popBumper (žr. kilpos pabaigą).
      if (c.type === 'boss') {
        if (c.dead) {
          // 💀 MIRTIES „crumble" animacija — galva subyra (8 kadrai, groja VIENĄ kartą).
          //   Kadras 0 = idle galva (bbox sutampa) → sklandus perėjimas. Po 8 kadrų — nieko
          //   (bosas dingęs). Jokio „juodo burbulo".
          const now2 = performance.now();
          const FR = 105;   // ms/kadras (8×105 ≈ 0.84s)
          const fi = Math.floor((now2 - (c._deathAt || now2)) / FR);
          if (fi < 8 && c.sprite === 'gorilla' && this.bossDeath && this.bossDeath.complete && this.bossDeath.naturalWidth) {
            const CX = 80, CY = 18, CW = 480, CH = 606;   // tas pats langas kaip idle → tiksliai sutampa
            const dh = 60, dw = dh * (CW / CH);
            ctx.drawImage(this.bossDeath, fi * 640 + CX, CY, CW, CH, c.x - dw / 2, c.y - dh / 2, dw, dh);
          }
          continue;
        }
        const bflash = c._flash > 0;

        // ── BLUE GORILLA bosas — animuotas sprite + flash. Gavus dmg → SKAUSMO grimasa
        //    (bossHurt, 8 kadrai, groja VIENĄ kartą ~0.5s), kitaip — idle ciklas. ──
        if (c.sprite === 'gorilla' && this.bossGorilla && this.bossGorilla.complete && this.bossGorilla.naturalWidth) {
          const gx = c.x + (c._ox || 0), gy = c.y + (c._oy || 0);
          if (bflash) { ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.arc(gx, gy, c.r + 5, 0, PI2); ctx.fill(); }
          ctx.fillStyle = 'rgba(0,0,0,0.32)';   // šešėlis po gorila
          ctx.beginPath(); ctx.ellipse(gx, gy + c.r + 1, c.r * 0.8, c.r * 0.28, 0, 0, PI2); ctx.fill();
          const CX = 80, CY = 18, CW = 480, CH = 606;   // turinio langas (idem visiems sheet'ams → sutampa)
          const dh = 60, dw = dh * (CW / CH);
          const now3 = performance.now(), HFR = 62;                       // skausmo kadras (8×62 ≈ 0.5s)
          const hel = now3 - (c._hurtAt != null ? c._hurtAt : -1e9);
          let sheet, fr;
          if (c._hurtAt != null && hel < 8 * HFR && this.bossHurt && this.bossHurt.complete && this.bossHurt.naturalWidth) {
            sheet = this.bossHurt; fr = Math.min(7, Math.floor(hel / HFR));   // skausmo grimasa (vieną kartą)
          } else {
            sheet = this.bossGorilla; fr = Math.floor(now3 / 130) % 8;        // idle ciklas
          }
          ctx.drawImage(sheet, fr * 640 + CX, CY, CW, CH, gx - dw / 2, gy - dh / 2, dw, dh);
          continue;   // HP juosta NUIMTA (user 07-20)
        }

        ctx.save(); ctx.translate(c._ox || 0, c._oy || 0);   // recoil poslinkis
        ctx.fillStyle = bflash ? '#ffffff' : '#33283a';   // flat žiedas (prislopinta slyva)
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 3, 0, PI2); ctx.fill();
        ctx.fillStyle = bflash ? '#ffd0f0' : c.color;
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, PI2); ctx.fill();
        ctx.fillStyle = '#241d2e';
        ctx.beginPath(); ctx.arc(c.x, c.y + 2, c.r * 0.72, 0, PI2); ctx.fill();
        ctx.fillStyle = '#ff5c5c';   // piktos akys
        ctx.beginPath(); ctx.arc(c.x - c.r * 0.34, c.y - c.r * 0.12, c.r * 0.15, 0, PI2); ctx.fill();
        ctx.beginPath(); ctx.arc(c.x + c.r * 0.34, c.y - c.r * 0.12, c.r * 0.15, 0, PI2); ctx.fill();
        const bw = c.r * 2, hpf = Math.max(0, c.hp / c.maxHp);   // HP juosta
        ctx.fillStyle = '#0a0a12'; ctx.fillRect(c.x - bw / 2 - 1, c.y - c.r - 10, bw + 2, 5);
        ctx.fillStyle = '#3a2030'; ctx.fillRect(c.x - bw / 2, c.y - c.r - 9, bw, 3);
        ctx.fillStyle = hpf > 0.3 ? '#ff5c7a' : '#ffcf5c'; ctx.fillRect(c.x - bw / 2, c.y - c.r - 9, bw * hpf, 3);
        ctx.restore();
        continue;
      }
      if (c.type === 'kicker') {
        const flash = c._flash > 0;
        const px = c.x + (c._ox || 0), py = c.y + (c._oy || 0);
        const R = c.r * (c._scale || 1);
        ctx.fillStyle = '#1c4a5e';
        ctx.beginPath(); ctx.arc(px, py, R + 2, 0, PI2); ctx.fill();
        ctx.fillStyle = flash ? '#eaffff' : '#3fb8e8';
        ctx.beginPath(); ctx.arc(px, py, R, 0, PI2); ctx.fill();
        ctx.fillStyle = '#cfeeff';
        ctx.beginPath(); ctx.arc(px - 1, py - 1, R * 0.4, 0, PI2); ctx.fill();
        continue;
      }
      this._popBumper(ctx, c);
    }
  }

  _drawSensors(ctx) {
    for (const s of this.table.sensors) {
      if (s.type === 'slowmo') {
        const act = s._active > 0, now = performance.now();
        // minkštas radial „laiko laukas"
        const grd = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, s.r);
        grd.addColorStop(0, act ? 'rgba(150,190,255,0.42)' : 'rgba(120,160,255,0.22)');
        grd.addColorStop(1, 'rgba(120,160,255,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        // besiplečiantys žiedai
        ctx.strokeStyle = '#bcd4ff'; ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const ph = ((now / 900) + k / 3) % 1;
          ctx.globalAlpha = (act ? 0.7 : 0.35) * (1 - ph);
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.25 + ph * 0.75), 0, Math.PI * 2); ctx.stroke();
        }
        // laikrodžio ikona (rodyklės sukasi LĖTAI → laikas sulėtėjęs)
        ctx.globalAlpha = act ? 1 : 0.7;
        const cr = s.r * 0.4, hr = now / 4000;
        ctx.strokeStyle = '#eaf2ff'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(s.x, s.y, cr, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(hr) * cr * 0.55, s.y + Math.sin(hr) * cr * 0.55); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(hr * 1.9 - 1.5) * cr * 0.85, s.y + Math.sin(hr * 1.9 - 1.5) * cr * 0.85); ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      if (s.type === 'danger') {
        ctx.fillStyle = s._active > 0 ? 'rgba(255,92,122,0.28)' : 'rgba(255,92,122,0.12)';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.35 + (s._active > 0 ? 0.35 : 0);
        ctx.strokeStyle = '#ff5c7a'; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        continue;
      }
      if (s.type === 'spinner') {
        const a = s._ang || 0;
        ctx.strokeStyle = '#7be0ff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
        for (let k = 0; k < 2; k++) {
          const ang = a + (k * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(s.x + Math.cos(ang) * s.r, s.y + Math.sin(ang) * s.r);
          ctx.lineTo(s.x - Math.cos(ang) * s.r, s.y - Math.sin(ang) * s.r);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }
      // rollover — šviečiantis plastikinis insertas
      const lit = s._lit > 0;
      ctx.fillStyle = lit ? 'rgba(198,255,140,0.6)' : 'rgba(120,180,90,0.16)';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = lit ? '#e8ffce' : '#6f9f5a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Flagellum uodega: banguota, siaurėjanti į galą, švytinti mėlyna.
  _drawTrail(ctx) {
    const t = this.trail;
    const n = t.length;
    if (n < 3) return;
    const r = this.ball.r;
    const time = performance.now() / 1000;
    const amp = CONFIG.ball.trailWiggle;

    // 1) Banguoti taškai: perpendikuliarus poslinkis pagal sin (stipresnis uodegos gale;
    //    galvoje 0, kad liktų prilipusi prie kamuoliuko).
    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = t[i];
      let dx, dy;
      if (i < n - 1) { dx = t[i + 1].x - p.x; dy = t[i + 1].y - p.y; }
      else { dx = p.x - t[i - 1].x; dy = p.y - t[i - 1].y; }
      const L = Math.hypot(dx, dy) || 1;
      const px = -dy / L, py = dx / L;           // perpendikuliaras
      const f = i / (n - 1);                      // 0 = uodegos galas, 1 = galva
      const off = Math.sin(i * 0.55 - time * 11) * amp * (1 - f);
      pts[i] = { x: p.x + px * off, y: p.y + py * off };
    }

    // 2) Du sluoksniai: platus blankus glow + ryškesnis korpusas. Taper nuo galo (plonas) į galvą (storas).
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      const glow = pass === 0;
      ctx.strokeStyle = glow ? '#4bb8ff' : '#a6e9ff';
      for (let i = 1; i < n; i++) {
        const f = i / (n - 1);
        ctx.globalAlpha = (glow ? 0.14 : 0.7) * f;
        ctx.lineWidth = (glow ? 2.2 : 1.0) * M.lerp(0.35, r * 0.95, f);
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawFlippers(ctx) {
    const PI2 = Math.PI * 2;
    ctx.lineCap = 'round';
    // Užsiblokavę (atmušimai išsekę) — raudonas metalas, kad iškart matytųsi kad negalima.
    const locked = this.flipsLeft <= 0;
    const cBody = locked ? '#7a3038' : '#8b93a6';
    const cEdge = locked ? '#3a1a1e' : '#252a35';
    const cHi = locked ? '#ff9a9a' : '#eaf0fa';
    for (const f of this.flippers) {
      const w = f.half * 2;
      // šešėlis po platforma
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = w + 2.5;
      ctx.beginPath(); ctx.moveTo(f.px, f.py + 2.5); ctx.lineTo(f.tipX, f.tipY + 2.5); ctx.stroke();
      // tamsi metalo briauna (apačia/kontūras)
      ctx.strokeStyle = cEdge; ctx.lineWidth = w + 2;
      ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(f.tipX, f.tipY); ctx.stroke();
      // chromo korpusas (platforma)
      ctx.strokeStyle = cBody; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(f.tipX, f.tipY); ctx.stroke();
      // šviesus chromo blikas (viršutinė briauna)
      ctx.strokeStyle = cHi; ctx.lineWidth = Math.max(1, w * 0.38);
      ctx.beginPath(); ctx.moveTo(f.px, f.py - w * 0.24); ctx.lineTo(f.tipX, f.tipY - w * 0.24); ctx.stroke();
      // ryškus galo antgalis (tip cap)
      ctx.fillStyle = '#b8c0d0'; ctx.beginPath(); ctx.arc(f.tipX, f.tipY, f.half * 0.85, 0, PI2); ctx.fill();
      // pivot bolt (chromo su blikeliu)
      ctx.fillStyle = '#1c2029'; ctx.beginPath(); ctx.arc(f.px, f.py, f.half + 2, 0, PI2); ctx.fill();
      ctx.fillStyle = '#9aa2b4'; ctx.beginPath(); ctx.arc(f.px, f.py, f.half + 0.5, 0, PI2); ctx.fill();
      ctx.fillStyle = '#eaf0fa'; ctx.beginPath(); ctx.arc(f.px - 0.8, f.py - 0.9, f.half * 0.55, 0, PI2); ctx.fill();
    }
  }

  _drawBall(ctx) {
    if (this._death) return;   // per mirtį kamuoliukas paslėptas — matomos tik šukės
    const b = this.ball;
    const PI2 = Math.PI * 2;
    const bx = Math.round(b.x), by = Math.round(b.y);
    // Šešėlis (nesitampo).
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(bx + 1, by + 2, b.r, 0, PI2); ctx.fill();

    // SQUASH & STRETCH (juice): greitis → pailgėja išilgai judėjimo; smūgis → suplojamas.
    const sp = Math.hypot(b.vx, b.vy);
    const stretch = Math.min(0.5, sp / 520 * 0.5);
    const hit = b.squash || 0;
    const sx = 1 + stretch - hit * 0.45;   // išilgai greičio
    const sy = 1 - stretch * 0.55 + hit * 0.45;  // statmenai
    const r = b.r;
    ctx.save();
    ctx.translate(bx, by);
    if (sp > 8) ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.scale(sx, sy);
    // Chrominis rutulys — flat žiedai + blikas (piešiam centre 0,0).
    ctx.fillStyle = '#454e62'; ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2); ctx.fill();
    ctx.fillStyle = '#7f8aa2'; ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, PI2); ctx.fill();
    ctx.fillStyle = '#c2cbdb'; ctx.beginPath(); ctx.arc(-1, -1, r - 2.2, 0, PI2); ctx.fill();
    const roll = b.roll || 0;
    ctx.fillStyle = '#59637a';
    for (let k = 0; k < 3; k++) {
      const a = roll + k * 2.094;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.22, 0, PI2); ctx.fill();
    }
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-2, -2, r * 0.3, 0, PI2); ctx.fill();
    ctx.restore();

    // Laukia apačioj — mirksinti rodyklė AUKŠTYN („paspausk klavišą, kad šautų aukštyn").
    if (b.onPlunger) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
      ctx.globalAlpha = 0.4 + 0.5 * pulse;
      ctx.fillStyle = '#ffd36b';
      const ax = b.x, ay = b.y - b.r - 3 - pulse * 2;
      ctx.beginPath(); ctx.moveTo(ax - 3, ay); ctx.lineTo(ax + 3, ay); ctx.lineTo(ax, ay - 4); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Vairavimo indikatorius (RAUDONAS rutulys): šiltas RUNŲ žiedas + laiko lankas + ←/→
  // užuominos + krypties rodyklė. Gintaro tonai (dera su terakotos rutuliu, fakelais, auksu).
  _drawSteer(ctx) {
    if (this._steerT <= 0 || this.ball.onPlunger) return;
    const b = this.ball, sp = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / sp, uy = b.vy / sp;
    const now = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(now / 100);
    const frac = M.clamp(this._steerT / (CONFIG.steer.dur || 1), 0, 1);   // laiko langas 1→0
    const R = b.r + 4.5;
    ctx.save();
    ctx.translate(b.x, b.y);
    // runų žiedas (sukasi, brūkšninis) — gintaras
    ctx.globalAlpha = 0.5 + 0.3 * pulse;
    ctx.strokeStyle = '#d98a44'; ctx.lineWidth = 1;
    ctx.setLineDash([2.5, 2.5]); ctx.lineDashOffset = -now / 70;
    ctx.beginPath(); ctx.arc(0, 0, R + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // laiko lankas (senka) — ryškesnis gintaras, nuo viršaus
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffc16a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    ctx.lineCap = 'butt';
    // ←/→ užuominos (gali koreguoti kryptį)
    ctx.globalAlpha = 0.45 + 0.4 * pulse; ctx.fillStyle = '#e8a24a';
    for (const dir of [-1, 1]) {
      const x = dir * (R + 7);
      ctx.beginPath();
      ctx.moveTo(x + dir * 2.5, 0); ctx.lineTo(x - dir * 1.5, -3); ctx.lineTo(x - dir * 1.5, 3);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // krypties rodyklė (kur skrieja)
    const len = 13 + pulse * 3;
    const tx = b.x + ux * (b.r + len), ty = b.y + uy * (b.r + len);
    ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ffc16a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(b.x + ux * (b.r + 2), b.y + uy * (b.r + 2)); ctx.lineTo(tx, ty); ctx.stroke();
    const aa = Math.atan2(uy, ux);
    ctx.fillStyle = '#ffc16a';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - Math.cos(aa - 0.45) * 5, ty - Math.sin(aa - 0.45) * 5);
    ctx.lineTo(tx - Math.cos(aa + 0.45) * 5, ty - Math.sin(aa + 0.45) * 5);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawFlash(ctx, W, H) {
    if (this.feedback.flash > 0) {
      ctx.globalAlpha = this.feedback.flash * 0.25;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ── Bokšto matuoklis (kairė paraštė): aukštų kopėčios, žymeklis KYLA kas aukštą ──
  // ── Gyvas COMBO matuoklis ──
  // Juosta TUŠTĖJA pagal combo langą (kiek liko iki nutrūkimo). Per pataikymą prisipildo
  // + „pop" + baltas blyksnis; spalva kyla su combo; baigiantis laikui — mirga skubiai.
  _drawComboMeter(ctx, W, H) {
    const combo = this.score.combo, frac = this.score.comboFrac();
    if (combo < 1 || frac <= 0) return;
    const pop = this._comboPop || 0, col = this._comboColor(), now = performance.now();
    const tw = 92, th = 7, cx = W / 2, ty = 24, x0 = cx - tw / 2, midY = ty + th / 2;
    ctx.save();
    if (pop > 0) { ctx.translate(cx, midY); ctx.scale(1 + pop * 0.1, 1 + pop * 0.22); ctx.translate(-cx, -midY); }
    // fonas
    ctx.fillStyle = 'rgba(8,10,20,0.72)';
    ctx.fillRect(x0 - 1, ty - 1, tw + 2, th + 2);
    // užpildas (baigiantis laikui — mirga skubiai raudonai)
    const urgent = frac < 0.32;
    ctx.globalAlpha = urgent ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 55)) : 1;
    ctx.fillStyle = urgent ? '#ff5555' : col;
    ctx.fillRect(x0, ty, tw * frac, th);
    ctx.globalAlpha = 1;
    // baltas blyksnis per pataikymą
    if (pop > 0) { ctx.globalAlpha = pop * 0.75; ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, ty, tw * frac, th); ctx.globalAlpha = 1; }
    ctx.strokeStyle = 'rgba(180,200,240,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 0.5, ty - 0.5, tw + 1, th + 1);
    // ×N daugiklis (kairėje), didėja su combo
    if (combo >= 2) {
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + (9 + Math.min(7, combo - 2)) + 'px monospace';
      ctx.fillStyle = '#08080f'; ctx.fillText('×' + combo, x0 - 3 + 0.7, midY + 0.7);
      ctx.fillStyle = pop > 0.5 ? '#ffffff' : col; ctx.fillText('×' + combo, x0 - 3, midY);
    }
    // „COMBO" etiketė (dešinėje, subtili)
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 6px monospace'; ctx.fillStyle = 'rgba(200,215,245,0.55)';
    ctx.fillText('COMBO', x0 + tw + 4, midY);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawTowerGauge(ctx, W, H) {
    const x0 = 0, w = 11, top = 22, bot = H - 14, availH = bot - top;
    const rungs = 12, sp = availH / rungs;
    const th = this._towerTheme(this.floor);
    // akmens kolona
    ctx.fillStyle = 'rgba(8,10,20,0.5)'; ctx.fillRect(x0, top, w, availH);
    ctx.fillStyle = 'rgba(140,160,210,0.16)'; ctx.fillRect(x0 + w - 1, top, 1, availH);
    // aukštų „rungai"
    ctx.strokeStyle = 'rgba(150,170,210,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= rungs; i++) { const y = bot - i * sp; ctx.moveTo(x0 + 1, y); ctx.lineTo(x0 + w - 1, y); }
    ctx.stroke();
    // šios bokšto atkarpos indeksas (12 aukštų = 1 atkarpa)
    const idx = (this.floor - 1) % rungs;
    const my = bot - (idx + 0.5) * sp;
    // nulipti (žemiau) aukštai — pašviesinti
    ctx.fillStyle = 'rgba(123,224,255,0.14)';
    ctx.fillRect(x0 + 1, my, w - 2, bot - my);
    // dabartinio aukšto žymeklis (švytintis blokas + ▲)
    ctx.fillStyle = th.accent;
    ctx.fillRect(x0 + 1, my - sp * 0.42, w - 2, sp * 0.84);
    ctx.fillStyle = '#0a0c16'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('▲', x0 + w / 2, my + 2.4);
    // Dabartinio aukšto DAUGIKLIS (×mult) — MAŽAS badge prie žymeklio (kaip buvo). Per perėjimą
    //   į naują aukštą — nedidelis blyksnis (_multPop): accent kraštas + tekstas trumpam pašviesėja.
    const mv = this.score.floorMult;
    const mtxt = '×' + (mv % 1 === 0 ? mv : mv.toFixed(1));
    const pop = this._multPop || 0;
    ctx.font = 'bold 6px monospace'; ctx.textBaseline = 'middle';
    const bw = Math.ceil(ctx.measureText(mtxt).width) + 4;
    const bx = x0 + w + 1;
    ctx.fillStyle = 'rgba(6,9,18,0.82)'; ctx.fillRect(bx, my - 5, bw, 10);                    // badge fonas
    ctx.fillStyle = th.accent; ctx.globalAlpha = 0.8 + 0.2 * pop;
    ctx.fillRect(bx, my - 5, pop > 0.05 ? 2 : 1.5, 10);                                       // accent kraštas (pop→ryškiau)
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left'; ctx.fillStyle = pop > 0.4 ? '#ffffff' : '#eaf6ff'; ctx.fillText(mtxt, bx + 3, my + 0.4);
    ctx.textBaseline = 'alphabetic';
  }

  // Flipperių ATMUŠIMŲ matuoklis — INTEGRUOTAS į dešinį akmens STULPĄ (bg1.png), kad
  // atrodytų kaip pati pilies architektūra: stulpo apatinė dalis „įkraunama" šilta šviesa
  // iki lygio, su 30 akmens padalų (= 30 atmušimų) ir švytinčiu lygio kraštu (meniskas).
  // Juice: sklandus nusekimas (_flipDisp) + baltas blyksnis per atmušimą. Užsiblokavus mirga.
  // NB: x0/pw/yTop/yBot suderinta su dešinio išorinio stulpo pozicija — jei nesutampa, keisk čia.
  _drawFlipGauge(ctx, W, H) {
    const x0 = 245, pw = 6, cx = x0 + pw / 2;       // stulpo šviesaus ĮPJOVOS kanalo plotis (pasaulio x ~245-251)
    const yTop = 70, yBot = 402, availH = yBot - yTop;
    const N = this.flipsMax, left = this.flipsLeft;
    const disp = M.clamp(this._flipDisp != null ? this._flipDisp : left, 0, N);
    const frac = M.clamp(left / N, 0, 1);
    const locked = left <= 0;
    const now = performance.now();
    const pulse = this._flipPulse || 0;
    // Spalva ARTIMA stulpo akmeniui (kanalas ~(74,57,45)) → didesnis susiliejimas: prislopinti
    // šilti tonai, tarsi pats akmuo įkaista/švyti, o ne ryškus svetimas widget'as. Raudona žemam — warning.
    const lit = frac > 0.5 ? '150,116,72' : frac > 0.25 ? '172,110,58' : '200,92,66';
    const urgent = frac <= 0.25 && !locked;
    const slotH = availH / N;
    const yFill = yBot - (disp / N) * availH;

    // 1) „Įkrautos" dalies šiltas švytėjimas (nuo apačios iki lygio) — tinta akmenį šviesa
    if (disp > 0.02 && !locked) {
      const base = urgent ? 0.34 + 0.24 * (0.5 + 0.5 * Math.sin(now / 55)) : 0.4;
      const grd = ctx.createLinearGradient(0, yFill, 0, yBot);
      grd.addColorStop(0, 'rgba(' + lit + ',' + (base + 0.28).toFixed(2) + ')');
      grd.addColorStop(1, 'rgba(' + lit + ',' + (base * 0.45).toFixed(2) + ')');
      ctx.fillStyle = grd; ctx.fillRect(x0, yFill, pw, yBot - yFill);
    }

    // 2) 30 akmens padalų (siūlės) per visą stulpą — matosi „30"; užpildytos — įkaitusios
    for (let i = 0; i <= N; i++) {
      const y = Math.round(yBot - i * slotH);
      ctx.fillStyle = (y >= yFill - 0.5) ? 'rgba(35,14,4,0.55)' : 'rgba(150,160,180,0.12)';
      ctx.fillRect(x0, y, pw, 1);
    }

    // 3) Švytintis LYGIO kraštas (meniskas) — fokusinis, pulsuoja
    if (disp > 0.02 && !locked) {
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now / 200);
      ctx.fillStyle = 'rgba(' + lit + ',1)'; ctx.fillRect(x0 - 2, yFill - 2, pw + 4, 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(216,182,132,0.9)'; ctx.fillRect(x0, yFill - 0.8, pw, 1.6);   // švelnus šiltas kraštas (ne baltas)
    }

    // 4) JUICE: baltas blyksnis ties ką tik nusekusiu segmentu per atmušimą
    if (pulse > 0) {
      const ySeg = yBot - Math.ceil(disp) * slotH;
      ctx.globalAlpha = pulse * 0.6; ctx.fillStyle = 'rgba(224,186,134,1)';   // šiltas (ne baltas) blyksnis
      ctx.fillRect(x0 - 1, ySeg, pw + 2, slotH);
      ctx.globalAlpha = 1;
    }

    // 5) Užsiblokavus — raudonas mirgesys visame stulpe
    if (locked) {
      ctx.globalAlpha = 0.26 + 0.22 * Math.sin(now / 70);
      ctx.fillStyle = '#ff4038'; ctx.fillRect(x0, yTop, pw, availH);
      ctx.globalAlpha = 1;
    }

    // 6) Skaičius stulpo apačioj (kiek liko)
    const txt = locked ? '✕' : (left + '');
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = 'bold 8px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillText(txt, cx + 0.5, yBot + 12.5);
    ctx.fillStyle = locked ? '#ff8a8a' : 'rgba(' + lit + ',1)'; ctx.fillText(txt, cx, yBot + 12);
    ctx.textAlign = 'left';
  }

  // Auksinis ĮSPAUSTAS tekstas (šešėlis + tamsus kontūras + aukso gradientas + blikas).
  // Naudojama score skaičiukams (medieval „Age of Ronke" stilius). pop = bumptelėjimas 0..1.
  _embossGold(ctx, text, x, y, fontPx, pop) {
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold ' + fontPx + 'px monospace';
    const s = 1 + (pop || 0) * 0.16;
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(text, 1, 1.4);            // šešėlis
    ctx.lineWidth = 2; ctx.strokeStyle = '#2a1a06'; ctx.lineJoin = 'round';
    ctx.strokeText(text, 0, 0);                                               // tamsus kontūras
    const grd = ctx.createLinearGradient(0, -fontPx, 0, 2);                   // aukso gradientas
    grd.addColorStop(0, '#ffe9a8'); grd.addColorStop(0.5, '#f2c25a'); grd.addColorStop(1, '#c98e2c');
    ctx.fillStyle = pop > 0.5 ? '#fff6d8' : grd;
    ctx.fillText(text, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText(text, 0, -0.4);    // viršaus blikas
    ctx.restore();
  }

  // 🟢 „EXIT" indikatorius: kai lubų vartai LAISVI (atviri — nėra gyvo boso), rodom žalią
  //    pulsuojančią rodyklę ↑ + užrašą „EXIT", kad žaidėjas žinotų, kur numušti kamuoliuką
  //    į kitą aukštą. Tiesiai VIRŠ angos vietą užima score/floor HUD, todėl rodyklė piešiama
  //    prie pat angos ir nukreipta AUKŠTYN (link vartų). Rodoma pasaulio koord. (kameros viduje).
  _drawExitSign(ctx) {
    const g = this.table.gate;
    if (!g || !g.dropped || this.gameOver) return;   // vartai uždaryti (gyvas bosas) → nerodom
    const cx = (g.ax + g.bx) / 2;                     // angos centras (x≈130)
    const gy = g.ay;                                  // angos linija (y≈22)
    const now = performance.now();
    const pulse = 0.55 + 0.45 * Math.sin(now / 260);
    const rise = (now / 900) % 1;                     // slenkanti banga aukštyn
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // 3 slenkančios ↑ „chevron" rodyklės — keliasi link angos, ryškesnės apačioj, gęsta viršuj.
    ctx.strokeStyle = '#7bffb0'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';   // žalia
    for (let k = 0; k < 3; k++) {
      const f = (rise + k / 3) % 1;                   // 0 (žemai) → 1 (prie angos)
      const ay = gy + 21 - f * 16;                    // y≈42 → y≈26
      const a = (1 - f) * pulse;
      if (a < 0.06) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(cx - 5, ay + 3); ctx.lineTo(cx, ay - 2); ctx.lineTo(cx + 5, ay + 3);
      ctx.stroke();
    }
    // „EXIT" užrašas — žalias, įspaustas, po rodyklėm.
    const ey = gy + 27;                               // y≈49
    ctx.globalAlpha = 1;
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText('EXIT', cx + 0.7, ey + 0.9);   // šešėlis
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.fillStyle = '#8fffb0'; ctx.fillText('EXIT', cx, ey);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  _drawHUD(ctx, W, H) {
    // Bokšto matuoklis (kairė) + atmušimų juosta (dešinė).
    this._drawTowerGauge(ctx, W, H);
    this._drawFlipGauge(ctx, W, H);
    // Viršutinė juosta PANAIKINTA (user 07-19 — maišėsi); score/floor/best lieka be fono.
    // Apatinė juosta lieka (užuominai / gyvybėms).
    ctx.fillStyle = 'rgba(6,9,18,0.5)'; ctx.fillRect(0, H - 12, W, 12);

    // ⏸ Pauzės mygtukas PAŠALINTAS (user 07-24 — negalima pauzės).
    // 🏆 Leaderboard mygtukas (dešinė) — pixel-art trofėjus su blizgučiais + hover/press feedback.
    if (this.trophyImg && this.trophyImg.complete && this.trophyImg.naturalWidth > 0) {
      const _now = (window.performance ? performance.now() : Date.now());
      const _r = this.trophyImg.naturalWidth / this.trophyImg.naturalHeight;
      const _bH = 22;                              // baznis aukštis
      const _cx = W - 3 - (_bH * _r) / 2;          // centras (dešinys kraštas fiksuotas)
      const _cy = 10 + _bH / 2 + Math.sin(_now / 620) * 0.7;   // lengvas „bob" (kvėpavimas)
      const _hov = !!this._trophyHover;
      const _press = this._trophyPressT ? Math.max(0, 1 - (_now - this._trophyPressT) / 220) : 0;
      const _scale = 1 + (_hov ? 0.16 : 0) - _press * 0.24;    // hover didesnis, press mažesnis
      const _h = _bH * _scale, _w = _h * _r, _x = _cx - _w / 2, _y = _cy - _h / 2;
      // hover švytėjimas (mėlynas halo — kaip trofėjaus glow)
      if (_hov) {
        ctx.save();
        ctx.shadowColor = 'rgba(120,200,255,0.95)'; ctx.shadowBlur = 9;
        ctx.drawImage(this.trophyImg, _x, _y, _w, _h);
        ctx.restore();
      }
      ctx.drawImage(this.trophyImg, _x, _y, _w, _h);
      // press blyksnis (šviesėjimas)
      if (_press > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = _press * 0.55;
        ctx.drawImage(this.trophyImg, _x, _y, _w, _h); ctx.restore();
      }
      // ✨ blizgučiai — 3 mirksintys žvaigždutės aplink trofėjų (patraukia dėmesį; ryškesni hover)
      const _spark = (sx, sy, sz, a) => {
        ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#eaf6ff'; ctx.translate(sx, sy);
        ctx.beginPath();
        ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.28, -sz * 0.28); ctx.lineTo(sz, 0); ctx.lineTo(sz * 0.28, sz * 0.28);
        ctx.lineTo(0, sz); ctx.lineTo(-sz * 0.28, sz * 0.28); ctx.lineTo(-sz, 0); ctx.lineTo(-sz * 0.28, -sz * 0.28);
        ctx.closePath(); ctx.fill(); ctx.restore();
      };
      const _sp = [[-_w * 0.42, -_h * 0.32, 0], [_w * 0.44, -_h * 0.05, 2.1], [_w * 0.06, _h * 0.36, 4.1]];
      for (const s of _sp) {
        const tw = 0.5 + 0.5 * Math.sin(_now / 360 + s[2]);   // 0..1 mirksėjimas
        _spark(_cx + s[0], _cy + s[1], 1.5 + tw * (_hov ? 2.4 : 1.6), tw * (_hov ? 1.0 : 0.6));
      }
    }
    // 🎵 Muzikos on/off mygtukas (po trofėjumi) — garsiakalbio ikona su bangomis / raudonu brūkšniu.
    this._drawMusicBtn(ctx, W, H);

    // SCORE (kairė) — AUKSINIS ĮSPAUSTAS stilius (medieval / „Age of Ronke"): mažas etiketės
    // užrašas + storas auksinis skaičius su kontūru/šešėliu. „pop" bumptelėjimas gaunant taškus.
    const sp = this._scorePop || 0;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 5px monospace'; ctx.fillStyle = '#9c7c3a';
    ctx.fillText('SCORE', 24, 7);
    this._embossGold(ctx, Math.floor(this.score.score) + '', 24, 16.5, 10, sp);

    // (Viršutinė combo juosta IŠJUNGTA — combo dabar rodo degančios fakelės.)

    // (Viršutinis „★ BOSS N ×0.5" / „▲ FLOOR N" užrašas PAŠALINTAS — aukšto daugiklis dabar
    //  rodomas kairės juostos badge'e (_drawTowerGauge), boso info — pačioje scenoje.)

    // Best (dešinė) — įskaitomas
    ctx.textAlign = 'right'; ctx.font = 'bold 7px monospace'; ctx.fillStyle = '#8b93b5';
    ctx.fillText('BEST ' + Math.floor(this.score.best), W - 26, 27.5);   // nuleista 10px žemyn (šalia trofėjaus)


    // Apatinė užuomina (touch / klaviatūra).
    ctx.font = '7px monospace';
    if (this.ball.onPlunger) {
      ctx.fillStyle = '#9aa4c4';
      ctx.fillText(this.isTouch ? 'TAP TO LAUNCH THE BALL' : 'PRESS ANY KEY TO LAUNCH', W / 2, H - 6);
    } else {
      ctx.fillStyle = '#5a6488';
      let info = this.isTouch ? 'TAP L / R = FLIPPERS' : 'A / D  FLIPPERS';
      if (this.ballSaves > 0) info += '   SAVE x' + this.ballSaves;
      if (this.score.scoreMult > 1) info += '   MULT x' + (Math.round(this.score.scoreMult * 10) / 10);
      ctx.fillText(info, W / 2, H - 6);
    }
    ctx.textAlign = 'left';

    // Gyvybės (● apačioj kairėj).
    for (let i = 0; i < this.balls; i++) {
      ctx.fillStyle = i === 0 && this.balls === 1 ? '#ff5c7a' : '#cdd6e4';
      ctx.beginPath(); ctx.arc(9 + i * 8, H - 5, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 📱 Matomi L/R flipperių mygtukai apatiniuose kampuose (TIK touch įrenginiuose).
  // Vizualus indikatorius — visa kairė/dešinė ekrano pusė vis tiek valdo flipperį (didelis
  // taikinys), o mygtukas parodo, kad yra „2 klavišai". Įsižiebia kai flipperis paspaustas.
  _drawTouchButtons(ctx, W, H) {
    if (!this.isTouch || this.gameOver || this.picking || this.ball.onPlunger) return;
    const bw = 46, bh = 38, by = H - bh - 18;
    const btn = (x, pressed, dir) => {
      ctx.globalAlpha = pressed ? 0.92 : 0.4;
      ctx.fillStyle = pressed ? 'rgba(123,224,255,0.5)' : 'rgba(28,38,62,0.55)';
      ctx.fillRect(x, by, bw, bh);
      ctx.strokeStyle = pressed ? '#bfe8ff' : 'rgba(140,160,200,0.6)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
      ctx.fillStyle = pressed ? '#eaffff' : 'rgba(205,215,240,0.85)';
      const cx = x + bw / 2, cy = by + bh / 2, s = 9;
      ctx.beginPath();
      if (dir < 0) { ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s * 0.6, cy - s); ctx.lineTo(cx + s * 0.6, cy + s); }
      else { ctx.moveTo(cx + s, cy); ctx.lineTo(cx - s * 0.6, cy - s); ctx.lineTo(cx - s * 0.6, cy + s); }
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    };
    btn(8, this.input.left, -1);
    btn(W - bw - 8, this.input.right, 1);
  }

  _drawCenter(ctx, W, H, text, color) {
    ctx.fillStyle = 'rgba(5,6,12,0.6)';
    ctx.fillRect(0, H / 2 - 16, W, 32);
    ctx.textAlign = 'center';
    ctx.font = '14px monospace';
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, H / 2 + 5);
    ctx.textAlign = 'left';
  }
}

window.addEventListener('load', () => { window.GAME = new Game(); });
