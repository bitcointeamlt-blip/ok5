/* Rungtynių eiga: MENU -> COUNTDOWN -> PLAYING -> RESULT.
 * Čia sujungiami du varikliai: vieno ataka = kito garbage eilė.
 * Etape 3 šitas failas taps plonu klientu — logiką suks serveris. */
(function (global) {
  'use strict';

  var C = global.CFG;
  var LB_KEY = 'ronkeblocks_lb_v1';

  function Match() {
    this.fx = new global.FX();
    this.army = new global.Army();
    this.aiLevel = C.AI_DEFAULT;
    this.seed = global.RNG.randomSeed();

    this.you = new global.Engine({ side: 'you', name: 'YOU', seed: this.seed });
    this.foe = new global.Engine({ side: 'foe', name: 'CPU', seed: this.seed, isAI: true });
    this.ai = new global.AI(this.foe, this.aiLevel);

    var self = this;
    this.you.onAttack = function (n) { self.foe.receiveAttack(n); };
    this.foe.onAttack = function (n) { self.you.receiveAttack(n); };

    this.state = 'menu';
    this.countdown = 0;
    this._lastTick = -1;
    this.winner = null;
    this.foeName = C.AI_LEVELS[this.aiLevel].name;

    this.netMode = null;          // null = lokalus AI PvP (nepakitęs); 'mock'|'colyseus' = online
    this.netOpts = null;
    this._netTopped = false;
    this._netWinner = null;
    this._ping = 0;               // 📡 gyvas RTT (ms) — rodomas ekrane per online žaidimą
    this._pingAt = 0;
    this._pingTimer = null;
  }

  /* ---------- valdymas ---------- */

  Match.prototype.setAI = function (key) {
    if (!C.AI_LEVELS[key]) return;
    this.aiLevel = key;
    this.foeName = C.AI_LEVELS[key].name;
    this.ai.setLevel(key);
    global.Sfx.play('click');
  };

  Match.prototype.startMatch = function (keepSeed) {
    if (!keepSeed) this.seed = global.RNG.randomSeed();
    /* TAS PATS seed abiem — vienoda figūrų seka = sąžiningos rungtynės */
    this.you.reset(this.seed);
    this.foe.reset(this.seed);
    this.you.side = 'you';
    this.foe.side = 'foe';
    this.foe.isAI = true;
    this.ai.reset();
    this.ai.setLevel(this.aiLevel);
    this.army.reset();                   // LOKALIAI — be seed → Math.random (originalus elgesys)
    this.you._lastSoon = null;
    this.foe._lastSoon = null;
    this.you.incoming = 0;
    this.foe.incoming = 0;
    /* Skirtingi startai — kad pusės nesusilygiuotų ir susitiktų ĮVAIRŪS unitai
     * (archer prieš hog, ghost prieš skull), o ne visada tas pats prieš tą patį.
     * LOKALIAI deko parinkimas = Math.random (originalus). Online _onNetStart perstato į seeded. */
    this._deckRnd = Math.random;
    var dl = (global.Units ? global.Units.deck(0).length : 7) || 7;
    this._deckAt = {
      you: Math.floor(this._deckRnd() * dl),
      foe: Math.floor(this._deckRnd() * dl)
    };
    this.fx.reset();
    this.winner = null;
    this.state = 'countdown';
    this.countdown = C.COUNTDOWN_MS;
    this._lastTick = -1;
    this.foeName = C.AI_LEVELS[this.aiLevel].name;
  };

  Match.prototype.meta = function (a) {
    global.Sfx.unlock();
    switch (a) {
      case 'start':
        if (this.netMode === 'colyseus') {
          /* challenge → Enter = ACCEPT; lobis → QUICK MATCH; rezultatas → grįžti į lobį. */
          if (this.state === 'challenge') this.netAccept();
          else if (this.state === 'prep') this._prepMarkReady();   // 🎓 Enter/OK pasiruošime → READY
          else if (this.state === 'lobby') this.netMatchmake('quick');
          else if (this.state === 'result') { this.state = 'lobby'; this.roomCode = ''; this.inviteUrl = ''; this._startLobbyPoll(); global.Sfx.play('click'); }
          break;
        }
        if (this.netMode) { if (this.state === 'menu' || this.state === 'result') this._netConnect(); break; }
        if (this.state === 'menu' || this.state === 'result') this.startMatch();
        break;
      case 'restart':
        if (this.netMode === 'colyseus') {
          /* R rungtynėse/rezultate → atgal į lobį (naujas priešas / naujas kambarys). */
          if (this.state !== 'connecting') { this.state = 'lobby'; this.roomCode = ''; this.inviteUrl = ''; this._startLobbyPoll(); global.Sfx.play('click'); }
          break;
        }
        if (this.netMode) { if (this.state !== 'menu' && this.state !== 'connecting') this._netConnect(); break; }
        if (this.state !== 'menu') this.startMatch();
        break;
      case 'menu':
        /* challenge → Esc = DECLINE (host lieka laukti). Kitur colyseus — grįžti į lobį. */
        if (this.netMode === 'colyseus' && this.state === 'challenge') { this.netDecline(); break; }
        this.state = 'menu';
        global.Sfx.play('click');
        break;
      case 'pause':
        if (this.state === 'playing') { this.state = 'paused'; global.Sfx.play('click'); }
        else if (this.state === 'paused') { this.state = 'playing'; global.Sfx.play('click'); }
        break;
      case 'mute': global.Sfx.toggle(); global.Sfx.play('click'); break;
      case 'fullscreen':
        if (global.Input && global.Input.toggleFullscreen) global.Input.toggleFullscreen();
        global.Sfx.play('click');
        break;
      case 'ai1': this.setAI('EASY'); break;
      case 'ai2': this.setAI('NORMAL'); break;
      case 'ai3': this.setAI('HARD'); break;
      case 'ai4': this.setAI('INSANE'); break;
      case 'grid': C.SHOW_GRID = !C.SHOW_GRID; break;
      case 'ghost': C.SHOW_GHOST = !C.SHOW_GHOST; break;
    }
  };

  Match.prototype.playerPress = function (a) {
    global.Sfx.unlock();
    if (this.state === 'prep') { this._demoInput(a); return; }   // 🎓 pasiruošime valdymas juda DEMO figūrą (tutorial)
    if (this._aiPlaying) return;   // 🤖 tavo pusę žaidžia TAVO AI (serveryje) — įvestis išjungta, tik žiūri
    /* A6 L2: serverAuth → siunčiam įvestį serveriui (jis sukа mano lentą); lokaliai nesukam.
     * ⚠️ Kadangi variklis serveryje, lokalūs valdymo garsai (move/rotate/drop) NEsuveiktų → grojam JUOS ČIA
     * iškart (momentinis feedback, be to užmaskuoja serverAuth vaizdo delsimą). */
    if (this._serverAuth) {
      if (this.state === 'playing') {
        try { global.NET.send('input', { a: a, down: true }); } catch (_) {}
        this._srvInputSfx(a);
      }
      return;
    }
    if (this.state !== 'playing') return;
    this.you.press(a);
  };
  /* serverAuth valdymo garsai (klientas variklio nesukа): mapinam įvestį → tą patį garsą kaip lokalus variklis. */
  Match.prototype._srvInputSfx = function (a) {
    var s = (a === 'left' || a === 'right') ? 'move'
      : (a === 'cw' || a === 'ccw' || a === 'flip') ? 'rotate'
        : (a === 'hold') ? 'hold'
          : (a === 'hard') ? 'harddrop' : null;
    if (s) { try { global.Sfx.play(s); } catch (_) {} }
  };
  Match.prototype.playerRelease = function (a) {
    if (!a) return;
    if (this._aiPlaying) return;   // 🤖 AI žaidžia už tave — įvestis išjungta
    if (this._serverAuth) { try { global.NET.send('input', { a: a, down: false }); } catch (_) {} return; }
    this.you.release(a);
  };

  /* ---------- ciklas ---------- */

  Match.prototype.update = function (dt) {
    if (dt > 100) dt = 100;                 // apsauga po tab switch

    if (this.netMode) { this._updateNet(dt); this.fx.update(dt); return; }   // online kelias (žr. žemiau)

    if (this.state === 'countdown') {
      this.countdown -= dt;
      var tick = Math.ceil(this.countdown / 1000);
      if (tick !== this._lastTick) {
        this._lastTick = tick;
        if (tick > 0) global.Sfx.play('tick');
      }
      if (this.countdown <= 0) {
        this.state = 'playing';
        this.you.start();
        this.foe.start();
        global.Sfx.play('go');
      }
    } else if (this.state === 'playing') {
      /* hit-stop: trumpam sustabdom VARIKLIUS (abu vienodai — sąžininga),
       * bet efektai ir animacijos toliau juda -> smūgio pojūtis. */
      var eff = dt - this.fx.consumeFreeze(dt);
      if (eff > 0) {
        this.you.update(eff);
        this.ai.update(eff);
        this.foe.update(eff);
      }
      this.processEvents();
      if (C.MARCH && C.MARCH.ENABLED) {
        this.army.update(eff > 0 ? eff : 0);
        this.processArmy();
        /* AI panic signalas: kiek unitų eina jo link (vietoj senos garbage eilės) */
        this.you.incoming = this.army.incoming('you');
        this.foe.incoming = this.army.incoming('foe');
      } else {
        this.hammerBeats(this.you);
        this.hammerBeats(this.foe);
      }
      this.dangerPulse(dt);
      if (this.you.state === 'dead' || this.foe.state === 'dead') this.finish();
    }

    this.fx.update(dt);
  };

  /* RITMIŠKAS ĮSPĖJIMAS.
   *
   * Vietoj tolydaus raudono ploto — trys DISKRETŪS kūjo smūgiai iš po grindų:
   *   ataka atskrenda -> smūgis (liko 2 s) -> smūgis (liko 1 s) -> PROVERŽIS.
   * Diskretūs dūžiai smegenims nuspėjami: gali suskaičiuoti ir žinai, kada spėsi.
   * Tolydus gradientas to neduoda — todėl ir jautėsi kaip triukšmas. */
  var BEATS = [2000, 1000];

  Match.prototype.hammerBeats = function (eng) {
    var ch = this.fx.ch(eng.side);
    /* eilė tuščia (arba ataka atremta) — grindys atsistato */
    if (!eng.garbage.entries.length) {
      if (ch.cracks) ch.clearFloor();
      eng._lastSoon = null;
      return;
    }
    var soon = eng.garbage.soonest(eng.time);
    var prev = eng._lastSoon == null ? Infinity : eng._lastSoon;

    for (var i = 0; i < BEATS.length; i++) {
      if (prev > BEATS[i] && soon <= BEATS[i]) {
        var n = i + 1;
        ch.strike(n);
        ch.ring(C.BOARD_W / 2, C.BOARD_H - 2, C.UI.torch);
        /* dulkės nubyra nuo lubų plyšių */
        for (var d = 0; d < 6 + n * 3; d++) {
          ch.parts.push({
            x: Math.random() * C.BOARD_W, y: C.BOARD_H - 2 - Math.random() * 6,
            vx: (Math.random() - 0.5) * 0.03, vy: -(0.02 + Math.random() * 0.05),
            life: 260 + Math.random() * 260, max: 520,
            c: [C.UI.torch, C.UI.stone, C.UI.gold][(Math.random() * 3) | 0],
            sz: 1, g: 0.0004
          });
        }
        if (eng.side === 'you') {
          global.Sfx.play('hammer' + n);
          this.fx.addShake(1 + n * 0.8);
        }
      }
    }
    eng._lastSoon = soon;
  };

  /* ---------- MŪŠIO KORIDORIUS ----------
   * Kiekviena išvalyta linija paleidžia vieną unitą iš tavo deck'o rikiuotės.
   * Tipas ima iš eilės, kad būryje matytųsi visa tavo pilies įvairovė. */
  Match.prototype.launchUnits = function (side, n) {
    var Un = global.Units;
    var deck = Un ? Un.deck(0) : null;
    if (!this._deckAt) this._deckAt = { you: 0, foe: 0 };
    if (!this._deckRnd) this._deckRnd = Math.random;   // apsauga (lokaliai=Math.random; online start'e=seeded)
    for (var i = 0; i < n; i++) {
      var type = 'skull';
      if (deck && deck.length) {
        type = deck[this._deckAt[side] % deck.length];
        /* Retkarčiais peršokam vieną — kitaip abi pusės eitų per deck'ą
         * sinchroniškai ir kiekviena kova būtų to paties tipo prieš tą patį
         * (identiški statai -> garantuotas abipusis susinaikinimas, jokios intrigos).
         * SEEDED rnd → online abu klientai peršoka vienodai (deterministika). */
        this._deckAt[side] += (this._deckRnd() < 0.35 ? 2 : 1);
      }
      /* `request` pats parenka laisvą aukštą; jei visi užimti — laukia eilėje */
      this.army.request(side, type);
    }
    var eng = side === 'you' ? this.you : this.foe;
    eng.stats.sent += n;
  };

  /* Kariuomenės įvykiai -> lentos ir efektai (LOKALUS/mock kelias — army.js sukasi čia). */
  Match.prototype.processArmy = function () {
    var evs = this.army.drainEvents();
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.t === 'arrive') {
        var target = e.target === 'you' ? this.you : this.foe;
        target.addGarbageNow(C.MARCH.LINES_PER_UNIT);
      } else {
        this._armyFxEvent(e);
      }
    }
  };

  /* Vieno mūšio įvykio EFEKTAS (kirtis/šūvis/sprogimas/blokas/prašovė/mirtis).
   * Bendras lokaliam ir ONLINE keliui — colyseus režime serveris persiunčia šiuos įvykius
   * (`corridor.events`), o klientas juos paduoda ČIA (x jau apsuktas p2 perspektyvai).
   * `e.x` — koridoriaus 0..1 koordinatė; `lane`/`killerSide` tolerantiški abiem formatams. */
  Match.prototype._armyFxEvent = function (e) {
    var lane = (e.lane != null) ? e.lane : (e.unit ? e.unit.lane : 0);
    switch (e.t) {
      case 'hit':
        /* Įprastas smūgis — kuklus. KRITINIS — auksinis blyksnis, drebulys, kitas garsas. */
        if (e.crit) {
          this.fx.clashSpark(e.x, 1.8, lane);
          this.fx.critMark(e.x, lane);
          this.fx.addShake(2.5);
          this.fx.flash(0.14, C.UI.gold);
          global.Sfx.play('hammer3');
        } else {
          this.fx.clashSpark(e.x, e.ranged ? 0.5 : 0.8, lane);
          global.Sfx.play(e.ranged ? 'rotate' : 'hammer1');
        }
        break;
      case 'shoot':
        global.Sfx.play('rotate');          // lanko/harpūno paleidimas
        break;
      case 'impact': {
        /* F12: strėlė ir šamano rutulys atskridę palieka TIKRĄ sprogimo sprite'ą
         * (Arrow_Impact 9x60 ms / Shaman_Explosion 9x55 ms). Orbas/harpūnas — kukli kibirkštis. */
        var Un2 = global.Units;
        var hasBurst = Un2 && Un2.projOf(e.type) && Un2.projOf(e.type).impact;
        if (hasBurst) this.fx.impactBurst(e.x, lane, e.type);
        else this.fx.clashSpark(e.x, 0.35, lane);
        break;
      }
      case 'block':
        this.fx.clashSpark(e.x, 0.45, lane);   // skull 25 % skydas — žvangesys
        global.Sfx.play('blocked');
        break;
      case 'miss':
        this.fx.missMark(e.x, lane);            // pilkas dūmelis aukštyn
        global.Sfx.play('move');
        break;
      case 'die': {
        this.fx.clashSpark(e.x, 1.3, lane);
        this.fx.addShake(2);
        global.Sfx.play('impact');
        /* priešo unito nukovimas = atremta ataka (stat leaderboard'ui) */
        var kside = e.killer ? e.killer.side : e.killerSide;
        if (kside) { var w = kside === 'you' ? this.you : this.foe; w.stats.cancelled++; }
        break;
      }
    }
  };

  /* Širdies dūžis, kai žaidėjo krūva pavojingai aukšta. */
  Match.prototype.dangerPulse = function (dt) {
    var ch = this.fx.you;
    if (this.you.board.stackHeight() >= C.ROWS - C.JUICE.DANGER_ROWS) {
      ch.heartT += dt;
      if (ch.heartT >= C.JUICE.HEARTBEAT_MS) {
        ch.heartT = 0;
        global.Sfx.play('heartbeat');
      }
    } else {
      ch.heartT = C.JUICE.HEARTBEAT_MS;   // kitą kartą dūžis iškart
    }
  };

  /* Lentos centras ekrano koordinatėse — sviedinių trajektorijoms. */
  Match.prototype.boardPos = function (side, atBottom) {
    var L = global.Renderer.LAY;
    var sx = (side === 'foe') ? L.HALF : 0;
    return {
      x: sx + L.BOARD_X + C.BOARD_W / 2,
      y: L.BOARD_Y + (atBottom ? C.BOARD_H - 22 : C.BOARD_H / 2)
    };
  };

  Match.prototype.finish = function () {
    if (this.state === 'result') return;
    this.winner = (this.you.state === 'dead') ? 'foe' : 'you';
    this.state = 'result';
    this.you.state = 'dead';
    this.foe.state = 'dead';
    this.saveResult();
    global.Sfx.play(this.winner === 'you' ? 'win' : 'lose');
    if (this.winner === 'you') this.fx.celebrate(this.renderer ? this.renderer.vw : C.VW);
  };

  /* ---------- įvykiai -> garsas + efektai ---------- */

  Match.prototype.processEvents = function () {
    var evs = this.you.drainEvents().concat(this.foe.drainEvents());
    for (var i = 0; i < evs.length; i++) this.handle(evs[i]);
  };

  var CLEAR_NAME = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD!'];
  var J = C.JUICE;

  Match.prototype.handle = function (e) {
    var mine = e.side === 'you';
    var fx = this.fx;
    var ch = fx.ch(e.side);
    var cell = C.CELL;

    switch (e.t) {
      case 'move':   if (mine) global.Sfx.play('move'); break;
      case 'rotate': if (mine) global.Sfx.play('rotate'); break;
      case 'hold':   if (mine) global.Sfx.play('hold'); break;

      case 'harddrop': {
        if (mine) global.Sfx.play('harddrop');
        ch.addShake(Math.min(3.5, 1 + e.dist * 0.13));
        /* šleifas nuo pradinės iki galinės pozicijos */
        ch.trail(e.type, global.PIECES.CELLS[e.type][e.rot], e.x, e.from, e.to);
        (this._hdrop = this._hdrop || {})[e.side] = Math.max(1, e.dist);   // ⚡ kitas 'lock' gaus efektą (jėga pagal aukštį)
        break;
      }

      case 'lock': {
        /* dulkių pūstelėjimas ties nusileidimo vieta */
        var fy = (e.footY - C.BUFFER) * cell;
        if (fy > 0 && fy < C.BOARD_H) ch.dust(e.footX * cell, fy, 7);
        /* ⚡ po HARD DROP — mažas subtilus efektas aplink įsitvirtinusią figūrą:
         * dulkelės prie figūros blokų + švelnus melsvas žiedelis */
        if (this._hdrop && this._hdrop[e.side]) {
          var hdD = this._hdrop[e.side];
          this._hdrop[e.side] = 0;
          var lcs = global.PIECES.CELLS[e.type][e.rot];
          for (var li = 0; li < lcs.length; li++) {
            var lx = (e.x + lcs[li][0] + 0.5) * cell;
            var ly = (e.y + lcs[li][1] - C.BUFFER + 0.5) * cell;
            if (ly > 0 && ly < C.BOARD_H && Math.random() < 0.7) ch.dust(lx, ly, 3);
          }
          if (fy > 0 && fy < C.BOARD_H) {
            ch.ring(e.footX * cell, fy, 'rgba(180,220,255,.85)');
            /* 💥 kibirkščių pliūpsnis figūros spalva — jėga pagal kritimo aukštį */
            var pcol = (C.COLORS[e.type] || ['#ffffff'])[0];
            ch.burst(e.footX * cell, fy, 10 + Math.min(12, hdD), [pcol, '#ffffff', '#ffd75c'], 3.4);
          }
          ch.stamp(e.type, lcs, e.x, e.y);   // 💥 balta šerdis + besiplečiantis shockwave
          if (mine) {
            fx.hitstop(Math.min(40, 12 + hdD * 2));           // mikropauzė — smūgio svoris
            fx.addShake(Math.min(5, 1.5 + hdD * 0.25));
            if (hdD >= 10) fx.flash(0.12, '#ffffff');          // aukštas kritimas → blyksnis
          }
        }
        break;
      }

      case 'clear': {
        var power = 1 + e.n * 0.35;
        e.rows.forEach(function (ry, idx) {
          if (ry < C.BUFFER) return;
          var py = (ry - C.BUFFER) * cell;
          /* eilutė subyra į skeveldras — kiekvienas blokas SAVO spalva */
          if (e.colors && e.colors[idx]) ch.shatter(py, e.colors[idx], cell, C.BOARD_W, power);
          ch.beam(py + cell / 2, e.n >= 4 ? C.UI.gold : '#ffffff');
          ch.ring(C.BOARD_W / 2, py + cell / 2, e.n >= 4 ? C.UI.gold : '#ffffff');
        });
        /* MARCH: kiekviena išvalyta linija = vienas paleistas unitas.
         * ⚠️ MARCH režime variklis NEKVIEČIA onAttack (engine.js: atakų blokas praleidžiamas),
         * tad SAVO išvalymus serveriui siunčiam BŪTENT ČIA — už kiekvieną liniją (ne per atakų lentelę).
         * colyseus: serveris paleidžia unitus + transliuoja koridorių; lokaliai NEpaleidžiam (jokios
         * dvigubos armijos). Lokalus/mock: paleidžiam patys. */
        if (this.netMode === 'colyseus') {
          if (e.side === 'you' && e.n > 0) { try { global.NET.send(global.NET.MSG.CLEAR, { lines: e.n }); } catch (_) {} }
        } else if (C.MARCH && C.MARCH.ENABLED) {
          this.launchUnits(e.side, e.n);
        }
        ch.lineFlash(e.rows);
        ch.addShake(2.5 + e.n * 2.2);
        ch.pop(CLEAR_NAME[e.n] || 'CLEAR', e.n >= 4 ? C.UI.gold : C.UI.text,
          { scale: e.n >= 4 ? 3 : 2, life: e.n >= 4 ? 950 : 650, y: -10 });
        if (mine) global.Sfx.play(e.n >= 4 ? 'quad' : ('clear' + Math.min(3, e.n)));
        else if (e.n >= 4) global.Sfx.play('quad');
        if (mine) {
          /* kuo daugiau linijų, tuo stipresnis smūgis */
          if (e.n >= 4) { fx.hitstop(J.HITSTOP_QUAD); fx.flash(0.38, C.UI.gold); fx.addShake(3.5); }
          else if (e.n === 3) { fx.hitstop(55); fx.flash(0.20, '#ffffff'); fx.addShake(2); }
          else if (e.n === 2) { fx.hitstop(35); fx.flash(0.12, '#ffffff'); fx.addShake(1); }
          /* 🎖️ XP už linijas + 3s COMBO langas: +1 XP/linija; suspėjai dar kartą per 3s → COMBO xN
           * su vis stipresne juice (pop dydis, spalvų eskalacija, dalelės, blyksnis). */
          var xpNow = Date.now();
          if (this._xpLastClear && (xpNow - this._xpLastClear) <= 3000) this._xpCombo = (this._xpCombo || 1) + 1;
          else this._xpCombo = 1;
          this._xpLastClear = xpNow;
          this._xpTotal = (this._xpTotal || 0) + e.n;
          ch.pop('+' + e.n + ' XP', '#8fffb0', { scale: 2, life: 900, y: 40, force: true });
          if (this._xpCombo >= 2) {
            var cN = this._xpCombo;
            var cCol = cN >= 5 ? '#ff5ce0' : cN >= 4 ? '#ff7050' : cN >= 3 ? '#ffa040' : '#ffd75c';
            ch.pop('COMBO x' + cN, cCol, { scale: Math.min(4, 2 + cN * 0.4), life: 1100, y: 62, force: true });
            ch.burst(C.BOARD_W / 2, 50, 10 + cN * 5, [cCol, '#ffffff', C.UI.gold], 3.2);
            fx.addShake(Math.min(6, 1.5 + cN));
            if (cN >= 3) fx.flash(Math.min(0.3, 0.08 + cN * 0.05), cCol);
            global.Sfx.play(cN >= 4 ? 'quad' : 'clear3');
          }
        } else if (e.n >= 4) {
          fx.hitstop(J.HITSTOP_QUAD); fx.flash(0.25, C.UI.gold);
        }
        break;
      }

      case 'attack':
        ch.pop('SEND ' + e.lines, C.UI.gold, { scale: 2, life: 750, y: 24 });
        break;

      case 'blocked':
        /* kirtis koridoriuje ten, kur žygiuojantis unitas buvo pakirstas */
        if (e.spots) for (var bs = 0; bs < e.spots.length; bs++) fx.clash(e.spots[bs], e.side);
        ch.pop('BLOCKED!', C.UI.good, { scale: 3, life: 950 });
        ch.burst(C.BOARD_W / 2, C.BOARD_H - 20, 26, ['#5ce08a', '#ffffff', '#a8ffd0'], 2.6);
        ch.ring(C.BOARD_W / 2, C.BOARD_H - 20, C.UI.good);
        if (mine) { global.Sfx.play('blocked'); fx.hitstop(J.HITSTOP_BLOCKED); fx.flash(0.20, C.UI.good); }
        break;

      case 'counter':
        if (e.spots) for (var cs = 0; cs < e.spots.length; cs++) fx.clash(e.spots[cs], e.side);
        ch.pop('COUNTER +' + e.lines, '#ff9d3d', { scale: 3, life: 1050 });
        ch.burst(C.BOARD_W / 2, C.BOARD_H - 24, 30, ['#ff9d3d', '#ffe9a8', '#ffffff'], 3.2);
        ch.ring(C.BOARD_W / 2, C.BOARD_H - 24, '#ff9d3d');
        ch.addShake(4);
        if (mine) { global.Sfx.play('counter'); fx.flash(0.30, '#ff9d3d'); }
        fx.hitstop(J.HITSTOP_COUNTER);
        break;

      case 'incoming': {
        /* Ataka SKRENDA per ekraną nuo priešo lentos iki tavo lentos apačios. */
        var fromSide = mine ? 'foe' : 'you';
        var a = this.boardPos(fromSide, false);
        var b = this.boardPos(e.side, true);
        global.Sfx.play('whoosh');
        /* Švariame režime sviedinio nereikia — ataka jau matoma kaip žygiuojantis būrys. */
        if (C.CLEAN_UI) {
          ch.addShake(1 + e.lines * 0.5);
          break;
        }
        fx.projectile(a.x, a.y, b.x, b.y, e.lines, mine ? C.UI.danger : C.UI.gold, function () {
          /* pataikymo momentas — BE UŽRAŠŲ, tik smūgis */
          ch.addShake(3 + e.lines * 1.2);
          ch.ring(C.BOARD_W / 2, C.BOARD_H - 10, C.UI.danger);
          ch.ring(C.BOARD_W / 2, C.BOARD_H - 10, '#ffffff');
          ch.burst(C.BOARD_W / 2, C.BOARD_H - 8, 14 + e.lines * 5,
            [C.UI.danger, '#ff9d3d', '#ffffff'], 2.6);
          global.Sfx.play('incoming');
          global.Sfx.play('impact');
          /* atvykimo blyksnis tyčia silpnas — įspėjimas neturi rėkti,
           * stiprus smūgis paliktas tik pačiam garbage nukritimui */
          if (mine) { fx.flash(0.11, '#ff9d3d'); fx.hitstop(28); }
        });
        break;
      }

      case 'garbage':
        /* PROVERŽIS — kulminacija po trijų smūgių. Grindys pralaužtos. */
        ch.clearFloor();
        ch.addShake(5 + e.lines * 1.8);
        ch.burst(C.BOARD_W / 2, C.BOARD_H - 4, 26 + e.lines * 4,
          [C.UI.stone, C.UI.stoneDark, C.UI.torch, '#ffffff'], 2.8);
        ch.ring(C.BOARD_W / 2, C.BOARD_H - 4, C.UI.torch);
        ch.ring(C.BOARD_W / 2, C.BOARD_H - 4, '#ffffff');
        for (var bi = 0; bi < e.lines; bi++) ch.beam(C.BOARD_H - 4 - bi * cell, C.UI.torch);
        if (mine) {
          global.Sfx.play('breach');
          fx.hitstop(J.HITSTOP_GARBAGE + e.lines * 12);
          fx.flash(0.26, C.UI.torch);
          fx.addShake(3 + e.lines * 1.2);
        }
        break;

      case 'levelup':
        if (mine) { global.Sfx.play('levelup'); ch.pop('LEVEL UP', C.UI.you, { scale: 2, life: 800 }); }
        break;

      case 'topout':
        ch.addShake(10);
        ch.burst(C.BOARD_W / 2, C.BOARD_H / 2, 70, ['#ff5364', '#ffffff', '#5b6178'], 3.6);
        fx.hitstop(J.HITSTOP_TOPOUT);
        fx.flash(0.5, mine ? C.UI.danger : C.UI.good);
        fx.addShake(6);
        break;
    }
  };

  /* ---------- lokali rekordų lentelė ---------- */

  Match.prototype.leaderboard = function () {
    var d;
    try { d = JSON.parse(localStorage.getItem(LB_KEY) || 'null'); } catch (err) { d = null; }
    if (!d) d = { wins: 0, losses: 0, streak: 0, best: 0, bestSent: 0, bestBlocked: 0, fastest: 0, beaten: [] };
    if (!d.beaten) d.beaten = [];
    return d;
  };

  Match.prototype.saveResult = function () {
    var d = this.leaderboard();
    var s = this.you.stats;
    if (this.winner === 'you') {
      d.wins++; d.streak++;
      if (d.streak > d.best) d.best = d.streak;
      if (!d.fastest || s.timeMs < d.fastest) d.fastest = Math.round(s.timeMs);
      if (d.beaten.indexOf(this.foeName) < 0) d.beaten.push(this.foeName);
    } else {
      d.losses++; d.streak = 0;
    }
    if (s.sent > d.bestSent) d.bestSent = s.sent;
    if (s.cancelled > d.bestBlocked) d.bestBlocked = s.cancelled;
    try { localStorage.setItem(LB_KEY, JSON.stringify(d)); } catch (err) { }
  };

  /* ================= ONLINE (NET) REŽIMAS — ETAPAS A / A3 =================
   * Opt-in per `?net=mock` (arba 'colyseus'). Lokalus AI PvP LIEKA NEPAKITĘS
   * (viskas žemiau suveikia tik kai this.netMode nustatytas). Modelis: tavo variklis
   * lokaliai, priešas = „puppet" iš serverio snapshot'ų; atakos = žinutės. */

  Match.prototype.enableNet = function (mode, opts) {
    var NET = global.NET;
    if (!NET) { console.error('[match] NET modulis nepakrautas'); return; }
    this.netMode = mode; this.netOpts = opts || {};
    /* colyseus = server-authoritative KORIDORIUS → MARCH lieka ĮJUNGTAS (serveris suka
     * kariuomenę, klientas piešia unitus iš `corridor` žinutės). mock/classic = klasikinė
     * garbage sistema (state-broadcast), MARCH išjungtas. Bazinis 6500 žaidimas (be ?net)
     * čia nepatenka — enableNet iškviečiamas TIK su ?net param. */
    if (global.CFG.MARCH) global.CFG.MARCH.ENABLED = (mode === 'colyseus');
    if (mode === 'mock' && global.MockServer && !NET._mock) NET.useMock(new global.MockServer());

    var self = this, M = NET.MSG;
    NET.on('prep', function (p) { self._enterPrep((p && p.ms) || 15000); });   // 🎓 pasiruošimo/tutorial langas prieš startą
    NET.on('prep_state', function (p) { self._prepReadyCount = (p && p.ready) || 0; });
    NET.on(M.START, function (p) { if (p && p.side) self.mySide = p.side; self._onNetStart(p); });
    NET.on(M.STATE, function (p) {
      if (p && p.foe) self._applyFoeSnapshot(p.foe);
      // 🤖 „AI žaidžia už mane": serveris siunčia MANO lentą (boto) kaip {you} — piešiam ją be interp
      if (p && p.you && self._aiPlaying) self._applyBoard(self.you, p.you, false);
    });
    /* Serverio koridorius (tik colyseus): unitų pozicijos → kliento „puppet" armija. */
    NET.on(M.CORRIDOR, function (p) { if (self.netMode === 'colyseus') self._applyCorridor(p); });
    /* A6 L2 server-authoritative LENTOS: serveris siunčia abi lentas → piešiam iš jų (ne lokaliai). */
    NET.on(M.BOARDS, function (p) { if (self._serverAuth && p) self._applyBoards(p); });
    /* 📡 LIVE PING: pong atėjo → RTT = dabar - išsiuntimo laikas. Rodom ekrane (žr. render.js). */
    NET.on('pong', function (p) {
      var now = (global.Date && Date.now) ? Date.now() : +new Date();
      var rtt = now - ((p && p.t) || now);
      if (rtt < 0) rtt = 0;
      /* lengvas glotninimas (EMA) — kad skaičius nešokinėtų. */
      self._ping = (self._ping > 0) ? Math.round(self._ping * 0.6 + rtt * 0.4) : rtt;
      self._pingAt = now;
    });
    NET.on(M.GARBAGE, function (p) {
      if (self.state !== 'playing') return;
      var n = (p && p.lines) | 0;
      /* colyseus: unitas JAU perėjo koridorių (tai ir buvo įspėjimas) → linija krenta iškart,
       * kaip lokaliame MARCH režime (addGarbageNow). Klasikinis kanalas — su laikmačiu. */
      if (self.netMode === 'colyseus') self.you.addGarbageNow(n);
      else self.you.receiveAttack(n);
    });
    NET.on(M.GAMEOVER, function (p) {
      /* Colyseus: winner = 'p1'/'p2' → verčiam į 'you'/'foe' pagal MANO pusę. Mock: jau 'you'/'foe'. */
      var w = p && p.winner;
      if (w === 'p1' || w === 'p2') w = (w === self.mySide) ? 'you' : 'foe';
      self._netWinner = w || 'foe'; self._netFinish();
    });
    /* 🧱💰 WAGER: serveris on-chain verifikuoja abu įėjimus (prieš countdown) — trumpas langas. */
    NET.on('wager_verify', function (p) { self._wagerMsg = 'Verifying stakes…'; self._wagerTier = (p && p.tier) || 0; });
    /* WAGER settle: laimėtojo prizas (rodymui rezultato ekrane; payout jau daromas serveryje). */
    NET.on('settle', function (p) { if (p) { self._wagerPrize = p.prize || 0; self._wagerPot = p.pot || 0; } });
    /* WAGER abort (verify fail / oponentas dingo verifikacijos metu): statymas GRĄŽINTAS, grįžtam į lobį. */
    NET.on('wager_abort', function (p) {
      try { NET.disconnect(); } catch (_) {}
      self._wagerAbort = (p && p.reason) || 'stake_error';
      self.state = 'lobby'; self.roomCode = ''; self.inviteUrl = ''; self._private = false; self._startLobbyPoll();
    });
    /* 🥊 CHALLENGE: prisijungė svečias → HOST'ui „do you want to play?" (jis gali būti fone, žaisti pilyje). */
    NET.on('challenge', function (p) { self._challenger = (p && p.opponent) || 'Player'; self.state = 'challenge'; self._stopLobbyPoll(); });
    /* SVEČIAS: laukia, kol host'as apsispręs. */
    NET.on('await', function (p) { self._hostName = (p && p.host) || 'Player'; self.state = 'awaiting'; });
    /* SVEČIAS: host atmetė / timeout → paliekam kambarį, grįžtam į lobį. */
    NET.on('declined', function (p) {
      self._declinedTimeout = !!(p && p.timeout);
      try { NET.disconnect(); } catch (_) {}
      self.state = 'lobby'; self.roomCode = ''; self.inviteUrl = ''; self._private = false; self._startLobbyPoll();
    });
    /* Colyseus: prisijungus prie blocks_room — pranešam „ready" (serveris laukia abiejų → START).
     * PRIVATE kūrimas → įsimenam kodą + kvietimo nuorodą (rodom ekrane). PUBLIC host — kodo nerodom. */
    NET.on('open', function (p) {
      if (self.netMode !== 'colyseus') return;
      /* HOST arba PRIVATE → įsimenam kambario kodą + kvietimo NUORODĄ (veda į standalone tetris:
       * `tetris/index.html?net=colyseus&room=<id>` — bet kas ją atidaręs prisijungia, NEreikia registracijos). */
      if (self._hosting && p && p.roomId) { self.roomCode = p.roomId; self.inviteUrl = self._buildInviteUrl(p.roomId); }
      try { NET.send('ready', {}); } catch (_) {}
      self._startPing();
    });
    NET.on('error', function (e) {
      console.error('[match] net error', e);
      self._stopPing();
      /* colyseus → grįžtam į lobį (galima bandyti dar kartą), mock → į meniu. */
      self.state = (self.netMode === 'colyseus') ? 'lobby' : 'menu';
      if (self.netMode === 'colyseus') self._startLobbyPoll();
    });
    NET.on('close', function () { self._stopPing(); });

    /* Įėjimas (tik colyseus): draugas per kvietimo nuorodą (`?room=`) → iškart jungiamės;
     * kitaip rodom LOBĮ su laukiančių žaidėjų sąrašu. mock lieka senas kelias (meta start). */
    this.roomCode = ''; this.inviteUrl = ''; this._hosting = false; this._private = false;
    this._lobbyRooms = []; this._lobbyPoll = null;
    if (mode === 'colyseus') {
      if (this.netOpts.roomId) { this.netMatchmake('join'); }
      else { this.state = 'lobby'; this._startLobbyPoll(); }
    }
  };

  /* Lobio veiksmai: kind =
   *   'quick'  — auto (joinOrCreate)          · 'host'   — PUBLIC kambarys (matomas sąraše, laukia)
   *   'create' — PRIVATE kambarys (+ kodas)   · 'join'   — netOpts.roomId jau nustatytas (pasirinktas/nuoroda)
   *   'ai'     — 🤖 RANKED vs AI: privatus kambarys, serveris pats įdeda botą (options.vsAI) */
  Match.prototype.netMatchmake = function (kind, tier) {
    this.netOpts = this.netOpts || {};
    this._private = false;
    if (kind !== 'ai') delete this.netOpts.vsAI;   // vsAI flag'as NElimpa prie kitų režimų (netOpts persistuoja)
    if (tier != null) this.netOpts.tier = tier;   // statymo pakopa (69/200/800) → serverio metadata → lobio sąrašas
    if (kind === 'create') { this.netOpts.matchmake = 'create'; delete this.netOpts.roomId; this._hosting = true; this._private = true; }
    else if (kind === 'ai') { this.netOpts.matchmake = 'create'; this.netOpts.vsAI = true; delete this.netOpts.roomId; this._hosting = false; }
    else if (kind === 'host') { this.netOpts.matchmake = 'host'; delete this.netOpts.roomId; this._hosting = true; }
    else if (kind === 'quick') { this.netOpts.matchmake = 'quick'; delete this.netOpts.roomId; this._hosting = false; }
    else { this._hosting = false; }   // 'join' — roomId jau yra
    this.roomCode = ''; this.inviteUrl = '';
    this._stopLobbyPoll();
    global.Sfx.play('click');
    this._netConnect();
  };

  /* HOST'as sutiko žaisti su prisijungusiu svečiu → serveris paleidžia rungtynes (start). */
  Match.prototype.netAccept = function () {
    try { global.NET.send('accept', {}); } catch (_) {}
    global.Sfx.play('click');
  };
  /* HOST'as atmetė svečią → lieka laukti (serveris grąžina phase=lobby, host tebe kambaryje). */
  Match.prototype.netDecline = function () {
    try { global.NET.send('decline', {}); } catch (_) {}
    this._challenger = ''; this.state = 'connecting';   // atgal į „waiting for opponent"
    global.Sfx.play('click');
  };

  /* Prisijungti prie KONKRETAUS laukiančio žaidėjo (pasirinkto iš lobio sąrašo) per roomId. */
  Match.prototype.netJoinRoom = function (roomId) {
    if (!roomId) return;
    this.netOpts = this.netOpts || {};
    this.netOpts.roomId = roomId;
    this.netMatchmake('join');
  };

  /* Lobio SĄRAŠO pollinimas: kas ~2.5s traukiam laukiančius kambarius į `this._lobbyRooms`. */
  Match.prototype._startLobbyPoll = function () {
    var self = this, NET = global.NET;
    if (this._lobbyPoll || !NET || !NET.listRooms) return;
    var tick = function () {
      NET.listRooms().then(function (rooms) {
        /* nerodom SAVO laukiančio kambario sąraše (jei ką tik host'inau) */
        self._lobbyRooms = (rooms || []).filter(function (r) { return r.roomId !== NET.roomId; });
      });
    };
    tick();
    this._lobbyPoll = setInterval(tick, 2500);
  };
  Match.prototype._stopLobbyPoll = function () {
    if (this._lobbyPoll) { clearInterval(this._lobbyPoll); this._lobbyPoll = null; }
  };

  /* 📡 LIVE PING loop: kas ~1.5s siunčiam 'ping' su dabartiniu timestamp'u; serveris grąžina 'pong'
   * → skaičiuojam RTT (žr. pong handler). Rodom ekrane (render.js), kad žaidėjas matytų realų lagą. */
  Match.prototype._startPing = function () {
    var self = this, NET = global.NET;
    if (this._pingTimer || !NET || this.netMode !== 'colyseus') return;
    var tick = function () {
      var now = (global.Date && Date.now) ? Date.now() : +new Date();
      try { NET.send('ping', { t: now }); } catch (_) {}
    };
    tick();
    this._pingTimer = setInterval(tick, 1500);
  };
  Match.prototype._stopPing = function () {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    this._ping = 0; this._pingAt = 0;
  };

  Match.prototype._buildInviteUrl = function (roomId) {
    /* 🔗 Kai tetris veikia ĮDĖTAS (F9 lobio panelė = iframe), kvietimo nuoroda turi vesti į PILNĄ
     * tėvo puslapį (`?rbjoin=<id>` — ten yra piniginė + BlocksWager), NE į standalone tetris.
     * Standalone tetris neturi piniginės → svečias negalėtų sumokėti statymo; būtent dėl to anksčiau
     * „tik viena pusė galėdavo pasirašyti tx". Same-origin, tad global.top.location pasiekiamas. */
    try {
      var embedded = (global.parent && global.parent !== global);
      if (embedded && global.top && global.top.location) {
        var t = global.top.location;
        return t.origin + t.pathname + '?rbjoin=' + encodeURIComponent(roomId);
      }
    } catch (_) { /* cross-origin — krentam į standalone kelią */ }
    try {
      var loc = global.location;
      return loc.origin + loc.pathname + '?net=colyseus&room=' + encodeURIComponent(roomId);
    } catch (e) { return '?net=colyseus&room=' + roomId; }
  };

  Match.prototype._netConnect = function (attempt) {
    var NET = global.NET, self = this;
    attempt = attempt || 1;
    this._netTopped = false; this._netWinner = null;
    this.state = 'connecting';
    NET.connect(this.netMode, this.netOpts).catch(function (e) {
      console.error('[match] connect failed (bandymas ' + attempt + '/4)', e);
      /* AUTO-RETRY: transient WS/matchmaking klaida → bandom dar kelis kartus, kad žaidėjui nereikėtų rankiniu būdu. */
      if (attempt < 4) { setTimeout(function () { self._netConnect(attempt + 1); }, 600); return; }
      self.state = (self.netMode === 'colyseus') ? 'lobby' : 'menu';
      if (self.netMode === 'colyseus') self._startLobbyPoll();
    });
  };

  /* Serveris pasakė START — sinchronizuojam seed ir pradedam countdown'ą (kaip lokaliai). */
  Match.prototype._onNetStart = function (p) {
    this._stopLobbyPoll();                 // rungtynės prasidėjo — nebepolinam lobio sąrašo
    this._serverAuth = !!(p && p.serverAuth);   // A6 L2: serveris sukа lentas → klientas siunčia įvestis + piešia iš serverio
    // 🤖 „AI žaidžia už mane": serveris žaidžia MANO pusę (mano lygos botas) — aš tik žiūriu.
    //   Mano lenta ateina kaip "state"{you} snapshot'ai (žr. STATE handlerį); įvestis/siuntimai išjungti.
    this._aiPlaying = !!(p && p.aiYou);
    this._aiYouName = (p && p.aiName) || '🤖 YOUR AI';
    /* 🏅 reitinguotas mačas (yra piniginė → serveris po mačo siųs rank_anim) — rezultato ekranas
     * NErodo žaidimo skydo, vietoj jo iškart lygos emblema su statais (lobby kortelė). */
    this._ranked = !!(this.netOpts && this.netOpts.addr);
    this.seed = ((p && p.seed) >>> 0) || this.seed;
    if (p && p.foeName) this.foeName = p.foeName;
    /* 🪪 mačo tapatybės badge'ai (lygos emblema + žmogus/AI avataras + W/L) — serverio tiesa, abiem vienoda */
    this._idYou = (p && p.youLeague != null) ? { league: p.youLeague | 0, ai: !!p.youAi, s: p.youStats || null } : null;
    this._idFoe = (p && p.foeLeague != null) ? { league: p.foeLeague | 0, ai: !!p.foeAi, s: p.foeStats || null } : null;
    this.you.reset(this.seed);
    this.foe.reset(this.seed);
    this.you.side = 'you'; this.foe.side = 'foe'; this.foe.isAI = false;
    var self = this;
    this.you.onAttack = this._aiPlaying ? null : function (n) { global.NET.send(global.NET.MSG.CLEAR, { lines: n }); };
    this.foe.onAttack = null;
    this.army.reset(this.seed); this.fx.reset();   // 🎲 deterministinis koridorius (tas pats seed abiem)
    this.winner = null; this._netTopped = false; this._netWinner = null;
    this._xpCombo = 0; this._xpLastClear = 0; this._xpTotal = 0;   // 🎖️ XP/combo skaitliukai per maca
    /* Deko parinkimas — SEEDED iš rungtynių seed → abu klientai gauna tuos pačius unitus. */
    this._deckRnd = global.RNG.mulberry32((this.seed ^ 0x1b873593) >>> 0);
    var _dl = (global.Units ? global.Units.deck(0).length : 7) || 7;
    this._deckAt = { you: Math.floor(this._deckRnd() * _dl), foe: Math.floor(this._deckRnd() * _dl) };
    this._snapAcc = 0;   // relay: kaupiam laiką iki kito SAVO lentos snapshot'o siuntimo
    this.state = 'countdown'; this.countdown = C.COUNTDOWN_MS; this._lastTick = -1;
  };

  /* ---------- 🎓 PASIRUOŠIMO LANGAS (valdymo tutorial + interaktyvus demo) ----------
   * Serveris siunčia „prep" (15s) prieš startą. Rodom valdymą + demo figūrą, kurią žaidėjas gali
   * PATS pajudinti (←→ juda, ↑ sukа, SPACE meta žemyn) → išmoksta valdymą. READY → startas kai abu
   * ready ARBA po 15s (serveris siunčia „start"). Kad niekam nekiltų klausimų kaip pradėti. */
  Match.prototype._enterPrep = function (ms) {
    this._stopLobbyPoll();
    this.state = 'prep';
    this._prepMs = ms || 15000;
    this._prepLeft = this._prepMs;
    this._prepReady = false;
    this._prepReadyCount = 0;
    this._demoIdx = -1;
    this._demoStep = 0; this._demoAcc = 0; this._demoKey = ''; this._demoKeyT = 0;   // 🎓 auto-demo + kuris mygtukas „paspaustas"
    this._demoSpawn();
    try { global.Sfx.play('click'); } catch (_) {}
  };
  Match.prototype._prepMarkReady = function () {
    if (this.state !== 'prep' || this._prepReady) return;
    this._prepReady = true;
    try { global.NET.send('prep_ready', {}); } catch (_) {}
    try { global.Sfx.play('go'); } catch (_) {}
  };
  Match.prototype._demoSpawn = function () {
    var types = ['T', 'L', 'J', 'S', 'Z', 'I', 'O'];
    this._demoIdx = (this._demoIdx + 1) % types.length;
    this._demo = { type: types[this._demoIdx], rot: 0, x: 3, y: 0, flash: 0 };
    this._demoClamp();
  };
  Match.prototype._demoCells = function () {
    var P = global.PIECES, d = this._demo;
    if (!P || !d) return [[0, 0]];
    return (P.CELLS[d.type] || P.CELLS.T)[d.rot & 3];
  };
  Match.prototype._demoClamp = function () {
    var d = this._demo, cells = this._demoCells(); if (!cells) return;
    var DW = 8, DH = 12, minx = 99, maxx = -99, maxy = -99, i;
    for (i = 0; i < cells.length; i++) { var cx = cells[i][0], cy = cells[i][1]; if (cx < minx) minx = cx; if (cx > maxx) maxx = cx; if (cy > maxy) maxy = cy; }
    if (d.x + minx < 0) d.x = -minx;
    if (d.x + maxx > DW - 1) d.x = DW - 1 - maxx;
    if (d.y < 0) d.y = 0;
    if (d.y + maxy > DH - 1) d.y = DH - 1 - maxy;
  };
  Match.prototype._demoSfx = function (n) { if (n) { try { global.Sfx.play(n); } catch (_) {} } };
  /* Atlieka veiksmą DEMO figūrai IR pažymi atitinkamą mygtuką (keyId: left/right/up/down/space) ~360ms. */
  Match.prototype._demoDo = function (a, keyId) {
    var d = this._demo; if (!d) return;
    this._demoKey = keyId || ''; this._demoKeyT = 360;
    if (a === 'left') { d.x -= 1; this._demoSfx('move'); }
    else if (a === 'right') { d.x += 1; this._demoSfx('move'); }
    else if (a === 'cw') { d.rot = (d.rot + 1) & 3; this._demoSfx('rotate'); }
    else if (a === 'ccw') { d.rot = (d.rot + 3) & 3; this._demoSfx('rotate'); }
    else if (a === 'flip') { d.rot = (d.rot + 2) & 3; this._demoSfx('rotate'); }
    else if (a === 'softdrop') { d.y += 1; }
    else if (a === 'hard') {
      var cells = this._demoCells(), my = 0, j;
      for (j = 0; j < cells.length; j++) if (cells[j][1] > my) my = cells[j][1];
      d.y = 12 - 1 - my; d.flash = 280; this._demoSfx('drop');
    }
    this._demoClamp();
  };
  /* Žaidėjo paspaudimas → tas pats demo veiksmas + mygtuko pažymėjimas; atidedam auto-demo, kad matytųsi. */
  Match.prototype._demoInput = function (a) {
    global.Sfx.unlock();
    var k = (a === 'left') ? 'left' : (a === 'right') ? 'right' : (a === 'softdrop') ? 'down' : (a === 'hard') ? 'space' : 'up';
    this._demoDo(a, k);
    this._demoAcc = 0;
  };
  /* Automatinė demonstracija: scenarijus parodo KIEKVIENĄ valdiklį (juda → sukа → krenta), pažymint mygtuką. */
  Match.prototype._demoAutoStep = function () {
    var script = this._demoScript;
    if (!script) script = this._demoScript = [
      { a: 'right', k: 'right' }, { a: 'right', k: 'right' }, { a: 'cw', k: 'up' },
      { a: 'left', k: 'left' }, { a: 'left', k: 'left' }, { a: 'cw', k: 'up' },
      { a: 'hard', k: 'space' }
    ];
    var i = (this._demoStep || 0) % script.length;
    this._demoStep = i + 1;
    var s = script[i];
    this._demoDo(s.a, s.k);
  };
  Match.prototype._prepUpdate = function (dt) {
    this._prepLeft = Math.max(0, (this._prepLeft || 0) - dt);
    if (this._demoKeyT > 0) this._demoKeyT -= dt;   // mygtuko pažymėjimas nublanksta (užsidega TIK paspaudus — jokios auto-demonstracijos, nebeblaško)
  };

  /* SAVO lentos serializacija priešui (relay: serveris persiunčia kaip STATE{foe}).
   * Tiksliai ta pati forma, kurią klientas atkuria per _applyFoeSnapshot / mockserver._snapshot. */
  Match.prototype._youSnapshot = function () {
    var y = this.you;
    return {
      grid: y.board.grid.map(function (r) { return r.slice(); }),
      cur: y.cur ? { type: y.cur.type, rot: y.cur.rot, x: y.cur.x, y: y.cur.y } : null,
      ghostY: y.cur ? y.ghostY() : 0,
      nextQueue: y.nextQueue.slice(0, 5),
      hold: y.hold, holdUsed: y.holdUsed,
      state: y.state, level: y.level, combo: y.combo, time: y.time,
      incoming: y.garbage.entries.map(function (e) { return { lines: e.lines, readyAt: e.readyAt }; }),
      stats: { lines: y.stats.lines, sent: y.stats.sent, cancelled: y.stats.cancelled, pieces: y.stats.pieces }
    };
  };

  /* Lentos būsenos atkūrimas ant Engine objekto (render.js piešia jį nepakitęs). Bendras: mock foe
   * snapshot'ui IR A6 L2 serverio lentoms (abi pusės). */
  Match.prototype._applyBoard = function (f, s, interp) {
    if (!f || !s) return;
    if (s.grid) f.board.grid = s.grid;
    f.cur = s.cur || null;
    /* 🛰️ INTERP (tik oponentui): laikom EASED display-poziciją figūrai, kad tarp snapshot'ų slinktų
     *   sklandžiai. Iškart „snapinam" tik kai NAUJA figūra (kito tipo), hard drop ar didelis šuolis
     *   (spawn) → kitaip lerpinam kas kadrą (_interpFoePiece) link taikinio. */
    if (interp && f.cur) {
      var nt = f.cur.type, nx = f.cur.x, ny = f.cur.y;
      var snap = (f._piDX == null) || (f._piType !== nt) ||
                 (Math.abs(nx - f._piDX) > 3) || (Math.abs(ny - f._piDY) > 4);
      if (snap) { f._piDX = nx; f._piDY = ny; }
      f._piTX = nx; f._piTY = ny; f._piType = nt;
    } else {
      f._piDX = null; f._piDY = null; f._piType = null;   // savo lenta / nėra figūros → jokio interp
    }
    if (s.nextQueue) f.nextQueue = s.nextQueue;
    f.hold = s.hold; f.holdUsed = !!s.holdUsed;
    if (s.state) f.state = s.state;
    if (s.level) f.level = s.level;
    if (s.combo != null) f.combo = s.combo;
    if (s.time != null) f.time = s.time;
    if (s.stats) {
      f.stats.lines = s.stats.lines | 0; f.stats.sent = s.stats.sent | 0;
      f.stats.cancelled = s.stats.cancelled | 0; f.stats.pieces = s.stats.pieces | 0;
      f.stats.timeMs = f.time;
    }
    if (s.incoming) {
      f.garbage.entries = s.incoming.map(function (e, i) {
        return { id: 900000 + i, lines: e.lines, holes: e.holes || [], readyAt: e.readyAt, bornAt: e.readyAt - C.GARBAGE_DELAY };
      });
    }
  };
  Match.prototype._applyFoeSnapshot = function (s) { this._applyBoard(this.foe, s, true); };   // interp=true → sklandi oponento figūra

  /* A6 L2: serveris siunčia {you:p1lenta, foe:p2lenta}. MANO lenta rodoma kaip this.you (mano pusė),
   * priešo — this.foe. Jei esu p2 — mano lenta = serverio 'foe'. */
  Match.prototype._applyBoards = function (p) {
    var mine = (this.mySide === 'p2') ? p.foe : p.you;
    var opp = (this.mySide === 'p2') ? p.you : p.foe;
    this._applyBoard(this.you, mine, false);   // mano lenta — be interp
    this._applyBoard(this.foe, opp, true);     // oponento — sklandi interp
    /* linijų valymo JUICE (serverio autoritetingi clears → efektai, kaip lokaliame žaidime). */
    if (p.fx && p.fx.length) {
      for (var i = 0; i < p.fx.length; i++) {
        var f = p.fx[i];
        var localSide = (this.mySide === 'p2') ? (f.side === 'you' ? 'foe' : 'you') : f.side;
        this._boardClearFx(localSide, f.n | 0, f.rows || [], f.colors || []);
      }
    }
  };

  /* Serverio (serverAuth) linijų valymo efektas — ta pati juice kaip handle('clear'), be lokalaus variklio. */
  Match.prototype._boardClearFx = function (side, n, rows, colors) {
    var fx = this.fx, ch = fx.ch(side), cell = C.CELL, mine = side === 'you';
    var power = 1 + n * 0.35;
    rows.forEach(function (ry, idx) {
      if (ry < C.BUFFER) return;
      var py = (ry - C.BUFFER) * cell;
      if (colors && colors[idx]) ch.shatter(py, colors[idx], cell, C.BOARD_W, power);
      ch.beam(py + cell / 2, n >= 4 ? C.UI.gold : '#ffffff');
      ch.ring(C.BOARD_W / 2, py + cell / 2, n >= 4 ? C.UI.gold : '#ffffff');
    });
    ch.lineFlash(rows);
    ch.addShake(2.5 + n * 2.2);
    ch.pop(CLEAR_NAME[n] || 'CLEAR', n >= 4 ? C.UI.gold : C.UI.text, { scale: n >= 4 ? 3 : 2, life: n >= 4 ? 950 : 650, y: -10 });
    if (mine) global.Sfx.play(n >= 4 ? 'quad' : ('clear' + Math.min(3, n)));
    else if (n >= 4) global.Sfx.play('quad');
    if (mine) {
      if (n >= 4) { fx.hitstop(J.HITSTOP_QUAD); fx.flash(0.38, C.UI.gold); fx.addShake(3.5); }
      else if (n === 3) { fx.hitstop(55); fx.flash(0.20, '#ffffff'); fx.addShake(2); }
      else if (n === 2) { fx.hitstop(35); fx.flash(0.12, '#ffffff'); fx.addShake(1); }
    }
  };

  /* SERVERIO KORIDORIUS → kliento „puppet" armija (tik colyseus).
   * Serveris suka VIENĄ orientaciją: 'you'=p1 žygiuoja dešinėn (x 0→1), 'foe'=p2 kairėn (x 1→0).
   * Jei ESU p2 — apsuku vaizdą: mano unitai turi eiti dešinėn savo pusėje, todėl
   * side keičiu, x → 1-x, dir → -dir. Lane (vertikali eilė) nesikeičia.
   * Armijos objektas lieka tas pats (render.js skaito army.units/army.shots/army.time),
   * bet army.update NEkviečiam — pozicijas diktuoja serveris.
   *
   * ⚠️ INTERPOLIACIJA: serveris transliuoja ~16/s (kas 60ms), o piešiam 60+/s. Tad NEteleportuojam
   * unitų į naują poziciją (matytųsi trūkčiojimas), o saugom TIKSLINĘ `tx` ir kas kadrą slenkam
   * prie jos (`_interpCorridor`). Unitus derinam pagal `id`, kad interp būtų tęstinis tarp kadrų. */
  Match.prototype._applyCorridor = function (p) {
    if (!p || !p.units) return;
    var flip = (this.mySide === 'p2');
    var prev = this.army.units, byId = {};
    for (var k = 0; k < prev.length; k++) byId[prev[k].id] = prev[k];
    var next = [];
    for (var i = 0; i < p.units.length; i++) {
      var s = p.units[i];
      var side = s.side, tx = s.x, dir = s.dir;
      if (flip) { side = (s.side === 'you') ? 'foe' : 'you'; tx = 1 - tx; dir = -dir; }
      var u = byId[s.id];
      if (!u) {
        /* naujas unitas — gimsta TIESIOG ties tiksline pozicija (be lerp šuolio nuo 0) */
        u = { id: s.id, x: tx };
      }
      u.side = side; u.type = s.type; u.lane = s.lane || 0; u.dir = dir;
      u.hp = s.hp; u.maxHp = s.maxHp || s.hp; u.state = s.state; u.holding = !!s.holding;
      /* MŪŠIO POZŲ laukai iš serverio (F12 pozų mašina: atakos mostas + skydas + jab).
       * Tai LAIKO reikšmės (serverio army.time bazėje) — apsukimas jų neliečia; jab kryptis
       * jau teisinga per apsuktą `dir`. Sinchronizuota su `army.time = p.t` žemiau. */
      u.swingAt = (s.swingAt != null) ? s.swingAt : -1e9;
      u.swingT = (s.swingT != null) ? s.swingT : -1;
      u.guardAt = (s.guardAt != null) ? s.guardAt : -1e9;
      u.hitDelay = s.hitDelay || 1;
      u.tx = tx;                                  // interpoliacijos taikinys
      if (u.x == null) u.x = tx;
      u.dist = (side === 'you') ? u.x : (1 - u.x);
      next.push(u);
    }
    this.army.units = next;                        // dingę (mirę) unitai pašalinami

    /* SVIEDINIAI (strėlės/harpūnai/burtai) — kad tolimojo mūšio atakos matytųsi.
     * p2 apsukimas: x0/x1/x → 1-x, dir → -dir, side sukeista; lane/kind/type/t/dur nekinta. */
    var shots = [];
    if (p.shots) {
      for (var j = 0; j < p.shots.length; j++) {
        var sh = p.shots[j];
        var sx0 = sh.x0, sx1 = sh.x1, sx = sh.x, sdir = sh.dir, sside = sh.side;
        if (flip) { sx0 = 1 - sx0; sx1 = 1 - sx1; sx = 1 - sx; sdir = -sdir; sside = (sh.side === 'you') ? 'foe' : 'you'; }
        shots.push({ side: sside, lane: sh.lane, type: sh.type, kind: sh.kind, x0: sx0, x1: sx1, x: sx, dir: sdir, t: sh.t, dur: sh.dur });
      }
    }
    this.army.shots = shots;

    /* MŪŠIO ĮVYKIŲ EFEKTAI (kirtis/šūvis/sprogimas/blokas/prašovė/mirtis) — serveris persiunčia,
     * nes army.js sukasi TEN. p2: apsukam x (→1-x) ir killerSide, kad efektai būtų teisingoj pusėj. */
    if (p.events && p.events.length) {
      for (var m = 0; m < p.events.length; m++) {
        var ev = p.events[m];
        if (flip) {
          ev.x = 1 - ev.x;
          if (ev.killerSide) ev.killerSide = (ev.killerSide === 'you') ? 'foe' : 'you';
        }
        this._armyFxEvent(ev);
      }
    }

    if (typeof p.t === 'number') this.army.time = p.t;
    /* panic signalas lentos pusėms: kiek priešo unitų eina tavęs/priešo link */
    this.you.incoming = this.army.incoming('you');
    this.foe.incoming = this.army.incoming('foe');
  };

  /* Kas kadrą slenkam koridoriaus unitus prie serverio tikslinės pozicijos (sklandus žygis). */
  Match.prototype._interpCorridor = function (dt) {
    var us = this.army.units;
    /* lerp koeficientas pagal dt — ~STEP(8.33ms): 0.28/step → per 60ms serverio kadrą pasiveja ~90 %,
     * bet niekada visiškai (kitaip sustotų ir vėl šoktelėtų) → tolydus greitis. */
    var a = 1 - Math.pow(1 - 0.28, dt / (1000 / 120));
    if (a < 0) a = 0; if (a > 1) a = 1;
    for (var i = 0; i < us.length; i++) {
      var u = us[i];
      if (u.tx != null) {
        u.x += (u.tx - u.x) * a;
        if (Math.abs(u.tx - u.x) < 0.0005) u.x = u.tx;
        u.dist = (u.side === 'you') ? u.x : (1 - u.x);
      }
      if (u.swingT > 0) u.swingT -= dt;             // sklandus jab tarp serverio kadrų
    }
    /* sviediniai skrenda tolydžiai: slenkam `t` (pozicija = x0..x1 pagal t/dur) tarp žinučių */
    var sh = this.army.shots;
    if (sh) for (var k = 0; k < sh.length; k++) { if (sh[k].dur) sh[k].t = Math.min(sh[k].dur, sh[k].t + dt); }
    this.army.time += dt;                          // animacijos tęstinumui tarp corridor žinučių
  };

  /* 🛰️ Kas kadrą slenkam OPONENTO figūrą prie snapshot'o tikslinės pozicijos (sklandus slinkimas,
   *   ne šokinėjimas). Kaip _interpCorridor, tik lentos figūrai. Naujos figūros/hard drop „snapinami"
   *   _applyBoard'e (didelis šuolis), tad čia tik glotninam tolydžius judesius (kritimas, ±1 poslinkis). */
  Match.prototype._interpFoePiece = function (dt) {
    var f = this.foe;
    if (!f || f._piDX == null || !f.cur) return;
    var a = 1 - Math.pow(1 - 0.35, dt / (1000 / 120));   // ~92 % per 50ms snapshot'ą → sklandu, be trailinimo
    if (a < 0) a = 0; if (a > 1) a = 1;
    f._piDX += (f._piTX - f._piDX) * a;
    f._piDY += (f._piTY - f._piDY) * a;
    if (Math.abs(f._piTX - f._piDX) < 0.02) f._piDX = f._piTX;
    if (Math.abs(f._piTY - f._piDY) < 0.02) f._piDY = f._piTY;
  };

  Match.prototype._netFinish = function () {
    if (this.state === 'result') return;
    this.winner = this._netWinner === 'you' ? 'you' : 'foe';
    this.state = 'result';
    this.you.state = 'dead'; this.foe.state = 'dead';
    this.saveResult();
    global.Sfx.play(this.winner === 'you' ? 'win' : 'lose');
    if (this.winner === 'you') this.fx.celebrate(this.renderer ? this.renderer.vw : C.VW);
  };

  Match.prototype._updateNet = function (dt) {
    if (this.state === 'prep') { this._prepUpdate(dt); return; }
    if (this.state === 'countdown') {
      this.countdown -= dt;
      var tick = Math.ceil(this.countdown / 1000);
      if (tick !== this._lastTick) { this._lastTick = tick; if (tick > 0) global.Sfx.play('tick'); }
      if (this.countdown <= 0) { this.state = 'playing'; if (!this._serverAuth && !this._aiPlaying) this.you.start(); global.Sfx.play('go'); }
      return;
    }
    if (this.state !== 'playing') return;
    /* A6 L2 server-authoritative: ABI lentos ateina iš serverio (BOARDS). Lokaliai NEsukam, NEsiunčiam
     * snap/topped (serveris autoritetingas). Tik koridoriaus interp + įspėjimai + pavojaus pulsas. */
    if (this._serverAuth) {
      this._interpCorridor(dt);
      this._interpFoePiece(dt);   // 🛰️ sklandi oponento figūra
      this.hammerBeats(this.you);
      this.hammerBeats(this.foe);
      this.dangerPulse(dt);
      return;
    }
    /* 🤖 „AI žaidžia už mane": ABI lentos ateina iš serverio snapshot'ais (you=mano botas, foe=priešas).
     * Lokalaus variklio nesukam, snap/topped nesiunčiam — tik interp + įspėjimai (žiūrovo režimas). */
    if (this._aiPlaying) {
      this.hammerBeats(this.you);
      this.hammerBeats(this.foe);
      this.dangerPulse(dt);
      if (this.netMode === 'colyseus') { this._interpCorridor(dt); this._interpFoePiece(dt); }
      return;
    }
    /* TIK tavo variklis; priešas atvaizduojamas iš snapshot'ų (jokio lokalaus AI). */
    var eff = dt - this.fx.consumeFreeze(dt);
    if (eff > 0) this.you.update(eff);
    this.processEvents();                    // tavo juice (foe.drainEvents tuščias net režime)
    this.hammerBeats(this.you);              // tavo įspėjimas apie ateinančią garbage
    this.hammerBeats(this.foe);              // priešo pusės incoming (iš snapshot)
    this.dangerPulse(dt);
    if (this.netMode === 'colyseus') { this._interpCorridor(dt); this._interpFoePiece(dt); }   // sklandus koridorius + oponento figūra (interp)
    /* Periodiškai siunčiam SAVO lentos snapshot'ą → serveris persiunčia priešui (jis mus mato).
     * Mock režime nesiunčiam — mock pats generuoja priešą (AI), SNAP jam nereikalingas. */
    if (this.netMode === 'colyseus') {
      this._snapAcc += dt;
      if (this._snapAcc >= 50) {           // ~20 snapshot'ų/s
        this._snapAcc = 0;
        try { global.NET.send(global.NET.MSG.SNAP, this._youSnapshot()); } catch (_) {}
      }
    }
    /* Tavo topout → pranešam serveriui; galutinį rezultatą duoda GAMEOVER (autoritetas). */
    if (this.you.state === 'dead' && !this._netTopped) {
      this._netTopped = true;
      global.NET.send(global.NET.MSG.TOPPED, {});
    }
  };

  global.Match = Match;
})(window);
