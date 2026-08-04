/* Vieno žaidėjo variklis. Deterministinis, valdomas per update(dt).
 *
 * ARCHITEKTŪROS TAISYKLĖ (kad etapas 3 = serveris būtų lengvas):
 *   Šitas failas NEŽINO nieko apie canvas, DOM, garsą ar tinklą.
 *   Įėjimas = veiksmai + dt. Išėjimas = būsena + events[] masyvas.
 *   Tą patį modulį galės sukti Node serveris (Colyseus) autoritetingai. */
(function (global) {
  'use strict';

  var C = global.CFG, P = global.PIECES, RNGx = global.RNG;

  var ACTIONS = ['left', 'right', 'softdrop', 'cw', 'ccw', 'flip', 'hard', 'hold'];

  function Engine(opts) {
    opts = opts || {};
    this.name = opts.name || 'PLAYER';
    this.side = opts.side || 'you';       // 'you' | 'foe'
    this.isAI = !!opts.isAI;
    this.events = [];
    this.onAttack = null;                 // callback(lines) -> match nukreipia priešui
    this.reset(opts.seed || 1);
  }

  Engine.prototype.reset = function (seed) {
    this.seed = seed >>> 0;
    this.board = new global.Board();
    this.bag = new RNGx.BagRandomizer(this.seed);
    this.holeRnd = new RNGx.HoleRandomizer(this.seed + (this.side === 'foe' ? 777 : 0));
    this.garbage = new global.GarbageQueue(this.holeRnd);

    this.time = 0;
    this.state = 'ready';                 // ready | playing | dead
    this.level = 1;
    this.nextQueue = [];
    for (var i = 0; i < 5; i++) this.nextQueue.push(this.bag.next());
    this.hold = null;
    this.holdUsed = false;

    this.cur = null;
    this.gravAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.resting = false;

    this.held = {};                       // klavišų būsena
    ACTIONS.forEach(function (a) { this.held[a] = false; }, this);
    this.dir = 0;                         // -1 / 0 / +1
    this.dasTimer = 0;
    this.arrTimer = 0;

    this.combo = -1;
    this.stats = {
      lines: 0, sent: 0, cancelled: 0, received: 0, pieces: 0,
      maxCombo: 0, holds: 0, quads: 0, timeMs: 0
    };
    this.events.length = 0;
    this.flashRows = [];                  // vizualiam clear efektui
  };

  Engine.prototype.start = function () {
    this.state = 'playing';
    this._spawn();
  };

  Engine.prototype.emit = function (t, d) {
    var e = d || {}; e.t = t; e.side = this.side; this.events.push(e); return e;
  };

  /* ---------------- figūros ---------------- */

  Engine.prototype._spawn = function (type) {
    if (!type) { type = this.nextQueue.shift(); this.nextQueue.push(this.bag.next()); }
    this.cur = { type: type, rot: 0, x: P.SPAWN_X[type], y: P.SPAWN_Y };
    this.gravAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.holdUsed = false;
    this.resting = false;

    /* Block out: jei spawn vietoje jau kažkas yra — pralaimėjimas. */
    if (this.board.collides(this.cur.type, 0, this.cur.x, this.cur.y)) {
      this._topout();
      return;
    }
    this.emit('spawn', { type: type });
  };

  Engine.prototype._topout = function () {
    this.state = 'dead';
    this.stats.timeMs = this.time;
    this.emit('topout');
  };

  /* ---------------- judesiai ---------------- */

  Engine.prototype.move = function (dx) {
    if (!this.cur || this.state !== 'playing') return false;
    if (this.board.collides(this.cur.type, this.cur.rot, this.cur.x + dx, this.cur.y)) return false;
    this.cur.x += dx;
    this._resetLock();
    this.emit('move');
    return true;
  };

  Engine.prototype.rotate = function (dir) {   // dir: +1 CW, -1 CCW, 2 = 180
    if (!this.cur || this.state !== 'playing') return false;
    var from = this.cur.rot;
    var to = (dir === 2) ? (from + 2) % 4 : (from + dir + 4) % 4;
    var kicks = P.kicksFor(this.cur.type, from, to);
    for (var i = 0; i < kicks.length; i++) {
      var kx = kicks[i][0];
      var ky = -kicks[i][1];               // wiki: +y aukštyn -> mūsų: +y žemyn
      if (!this.board.collides(this.cur.type, to, this.cur.x + kx, this.cur.y + ky)) {
        this.cur.rot = to;
        this.cur.x += kx;
        this.cur.y += ky;
        this._resetLock();
        this.emit('rotate', { kick: i });
        return true;
      }
    }
    return false;
  };

  Engine.prototype.softStep = function () {
    if (!this.cur || this.state !== 'playing') return false;
    if (this.board.collides(this.cur.type, this.cur.rot, this.cur.x, this.cur.y + 1)) return false;
    this.cur.y += 1;
    this.lockTimer = 0;
    return true;
  };

  Engine.prototype.hardDrop = function () {
    if (!this.cur || this.state !== 'playing') return;
    var d = this.board.dropDistance(this.cur.type, this.cur.rot, this.cur.x, this.cur.y);
    var from = this.cur.y;
    this.cur.y += d;
    this.emit('harddrop', {
      dist: d, from: from, to: this.cur.y,
      type: this.cur.type, rot: this.cur.rot, x: this.cur.x
    });
    this._lockPiece();
  };

  Engine.prototype.doHold = function () {
    if (!this.cur || this.state !== 'playing' || this.holdUsed) return;
    var prev = this.hold;
    this.hold = this.cur.type;
    this.stats.holds++;
    if (prev) { this._spawn(prev); } else { this._spawn(); }
    this.holdUsed = true;
    this.emit('hold');
  };

  Engine.prototype._resetLock = function () {
    if (this.resting && this.lockResets < C.LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  };

  /* ---------------- užrakinimas + linijos ---------------- */

  Engine.prototype._lockPiece = function () {
    var c = this.cur;
    this.board.lock(c.type, c.rot, c.x, c.y);
    this.stats.pieces++;
    this.cur = null;
    /* apatinių langelių vidurys — ten piešiam dulkes */
    var cells = P.CELLS[c.type][c.rot], maxDy = -9, sumX = 0;
    for (var ci = 0; ci < cells.length; ci++) {
      if (cells[ci][1] > maxDy) maxDy = cells[ci][1];
      sumX += cells[ci][0];
    }
    this.emit('lock', {
      type: c.type, x: c.x, y: c.y, rot: c.rot,
      footX: c.x + sumX / cells.length + 0.5,
      footY: c.y + maxDy + 1
    });

    var rows = this.board.fullRows();
    var n = rows.length;

    if (n > 0) {
      this.flashRows = rows.slice();
      /* nusikopijuojam eilučių spalvas PRIEŠ valymą — kad kiekvienas blokas
       * sprogtų savo spalva (naudoja fx skeveldros) */
      var rowColors = [];
      for (var ri = 0; ri < rows.length; ri++) rowColors.push(this.board.grid[rows[ri]].slice());

      this.board.clearRows(rows);
      this.stats.lines += n;
      if (n === 4) this.stats.quads++;
      this.combo++;
      if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;
      this.emit('clear', { n: n, rows: rows, combo: this.combo, colors: rowColors });

      /* MARCH režime atakų lentelės ir atšaukimo NĖRA: kiekviena išvalyta linija
       * paleidžia unitą koridoriun, o gynyba vyksta ten (unitas prieš unitą).
       * Variklis tik praneša `clear`, o būrius paleidžia Match. */
      if (!C.MARCH || !C.MARCH.ENABLED) {
        /* 1) GYNYBA: kiekviena sunaikinta linija panaikina VIENĄ gaunamą liniją (1:1). */
        var res = this.garbage.cancel(n, this.time);
        this.stats.cancelled += res.cancelled;

        /* 2) PUOLIMAS: linijos, kurių neprireikė gynybai, verčiamos ataka per lentelę. */
        var sent = global.GarbageQueue.attackFor(res.leftover);
        if (C.COMBO_ENABLED && this.combo > 0 && sent > 0) sent += Math.min(4, Math.floor(this.combo / 2));

        if (sent > 0) {
          this.stats.sent += sent;
          if (res.cancelled > 0) this.emit('counter', { lines: sent, cancelled: res.cancelled, spots: res.spots });
          else this.emit('attack', { lines: sent });
          if (this.onAttack) this.onAttack(sent);
        } else if (res.cancelled > 0) {
          this.emit('blocked', { cancelled: res.cancelled, spots: res.spots });
        }
      }

      var lvl = 1 + Math.floor(this.stats.lines / C.LEVEL_LINES);
      if (lvl !== this.level) { this.level = lvl; this.emit('levelup', { level: lvl }); }
    } else {
      this.combo = -1;
    }

    if (this.state === 'playing') this._spawn();
  };

  /* ---------------- atakų priėmimas ---------------- */

  Engine.prototype.receiveAttack = function (lines) {
    if (this.state !== 'playing') return;
    var e = this.garbage.receive(lines, this.time);
    if (e) {
      this.stats.received += e.lines;
      this.emit('incoming', { lines: e.lines, id: e.id });
    }
  };

  /* Bendra dalis: įterpia eilutes ir pastumia aktyvią figūrą, kad neatsidurtų blokuose. */
  Engine.prototype._pushGarbage = function (total, holes) {
    var overflow = this.board.addGarbage(total, holes);
    this.emit('garbage', { lines: total });

    if (this.cur) {
      var guard = 0;
      while (this.board.collides(this.cur.type, this.cur.rot, this.cur.x, this.cur.y) && guard < C.TOTAL_ROWS) {
        this.cur.y -= 1; guard++;
      }
      if (this.board.collides(this.cur.type, this.cur.rot, this.cur.x, this.cur.y)) { this._topout(); return; }
    }
    if (overflow) this._topout();
  };

  /* MARCH režimas: unitas atėjo iki galo — linija prisideda IŠ KARTO, be laukimo. */
  Engine.prototype.addGarbageNow = function (lines) {
    if (this.state !== 'playing' || lines <= 0) return;
    var holes = [], h = this.holeRnd.next(C.COLS);
    for (var i = 0; i < lines; i++) {
      holes.push(C.GARBAGE_SAME_HOLE ? h : this.holeRnd.next(C.COLS));
    }
    this.stats.received += lines;
    this._pushGarbage(lines, holes);
  };

  Engine.prototype._applyDueGarbage = function () {
    var due = this.garbage.takeDue(this.time);
    if (!due.length) return;
    var total = 0, holes = [];
    for (var i = 0; i < due.length; i++) {
      total += due[i].lines;
      holes = holes.concat(due[i].holes);
    }
    this._pushGarbage(total, holes);
  };

  /* ---------------- įvedimas ---------------- */

  Engine.prototype.press = function (a) {
    if (this.state !== 'playing') return;
    if (this.held[a]) return;
    this.held[a] = true;
    switch (a) {
      case 'left':  this.dir = -1; this.dasTimer = 0; this.arrTimer = 0; this.move(-1); break;
      case 'right': this.dir = 1;  this.dasTimer = 0; this.arrTimer = 0; this.move(1);  break;
      case 'cw':    this.rotate(1); break;
      case 'ccw':   this.rotate(-1); break;
      case 'flip':  this.rotate(2); break;
      case 'hard':  this.hardDrop(); break;
      case 'hold':  this.doHold(); break;
      case 'softdrop': this.softStep(); this.gravAcc = 0; break;   // momentinis pirmas žingsnis
    }
  };

  Engine.prototype.release = function (a) {
    this.held[a] = false;
    if (a === 'left' && this.dir === -1) { this.dir = this.held.right ? 1 : 0; this.dasTimer = 0; }
    if (a === 'right' && this.dir === 1) { this.dir = this.held.left ? -1 : 0; this.dasTimer = 0; }
  };

  /* Vienkartinis veiksmas (AI naudoja — be DAS). */
  Engine.prototype.tap = function (a) {
    if (this.state !== 'playing') return;
    switch (a) {
      case 'left':  this.move(-1); break;
      case 'right': this.move(1); break;
      case 'cw':    this.rotate(1); break;
      case 'ccw':   this.rotate(-1); break;
      case 'flip':  this.rotate(2); break;
      case 'hard':  this.hardDrop(); break;
      case 'hold':  this.doHold(); break;
      case 'softdrop': this.softStep(); break;
    }
  };

  /* ---------------- pagrindinis žingsnis ---------------- */

  Engine.prototype.gravityMs = function () {
    var g = C.GRAVITY_START * Math.pow(C.LEVEL_FACTOR, this.level - 1);
    return Math.max(C.GRAVITY_MIN, g);
  };

  Engine.prototype.update = function (dt) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.stats.timeMs = this.time;

    /* 1) garbage, kurio laikas išseko */
    this._applyDueGarbage();
    if (this.state !== 'playing') return;

    /* 2) DAS / ARR */
    if (this.dir !== 0 && !this.isAI) {
      this.dasTimer += dt;
      if (this.dasTimer >= C.DAS) {
        if (C.ARR <= 0) {
          while (this.move(this.dir)) { }
        } else {
          this.arrTimer += dt;
          while (this.arrTimer >= C.ARR) { this.arrTimer -= C.ARR; if (!this.move(this.dir)) break; }
        }
      }
    }

    if (!this.cur) return;

    /* 3) gravitacija */
    var gms = this.gravityMs();
    if (this.held.softdrop) gms = Math.max(8, gms / C.SDF);
    this.gravAcc += dt;
    var guard = 0;
    while (this.gravAcc >= gms && guard < 40) {
      this.gravAcc -= gms; guard++;
      if (!this.board.collides(this.cur.type, this.cur.rot, this.cur.x, this.cur.y + 1)) {
        this.cur.y += 1;
        this.lockTimer = 0;
        this.lockResets = 0;
      } else break;
    }
    if (this.gravAcc > gms) this.gravAcc = gms;

    /* 4) lock delay */
    this.resting = this.board.collides(this.cur.type, this.cur.rot, this.cur.x, this.cur.y + 1);
    if (this.resting) {
      this.lockTimer += dt;
      if (this.lockTimer >= C.LOCK_DELAY) this._lockPiece();
    } else {
      this.lockTimer = 0;
    }
  };

  /* ---------------- pagalbinės ---------------- */

  Engine.prototype.ghostY = function () {
    if (!this.cur) return 0;
    return this.cur.y + this.board.dropDistance(this.cur.type, this.cur.rot, this.cur.x, this.cur.y);
  };

  Engine.prototype.pps = function () {
    return this.time > 0 ? (this.stats.pieces / (this.time / 1000)) : 0;
  };

  Engine.prototype.drainEvents = function () {
    var e = this.events.slice();
    this.events.length = 0;
    return e;
  };

  Engine.ACTIONS = ACTIONS;
  global.Engine = Engine;
})(window);
