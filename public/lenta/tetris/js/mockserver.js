/* mockserver.js — RONKE BLOCKS in-page „serveris" (ETAPAS A / A2).
 *
 * PASKIRTIS: leidžia testuoti visą tinklo kelią LOKALIAI be jokio Colyseus serverio.
 * Elgiasi kaip autoritetinga priešo pusė: sukа priešo (AI) variklį, priima tavo atakas,
 * siunčia savo atakas ir periodinį priešo lentos SNAPSHOT'ą (state-broadcast modelis).
 *
 * MODELIS = state-broadcast (ne lockstep):
 *   - klientas sukа TIK savo variklį; priešas piešiamas iš snapshot'ų.
 *   - atakos keliauja kaip žinutės (CLEAR → tu; GARBAGE → priešas), 3s gynybos langą
 *     tvarko kiekvieno pusė savo variklyje (mock = priešo pusė, klientas = tavo).
 *   - klasikinė garbage sistema (NE MARCH kariuomenė — jos sync yra vėlesnis žingsnis).
 *
 * Registruojasi: `NET.useMock(new MockServer())` (žr. match.js A3).
 */
(function (global) {
  'use strict';

  var C = global.CFG;

  function _now() { return (global.performance && global.performance.now) ? global.performance.now() : Date.now(); }

  function MockServer() {
    this.net = null; this.MSG = null;
    this.foe = null; this.ai = null;
    this.seed = 0;
    this._timer = null; this._last = 0; this._snapAcc = 0; this._over = false;
    this.snapMs = 50;                 // priešo snapshot dažnis (~20/s)
  }

  // NET.connect('mock') → čia. opts: {seed?, aiLevel?, foeName?}
  MockServer.prototype.connect = function (net, opts) {
    opts = opts || {};
    this.net = net; this.MSG = net.MSG;
    this.seed = (opts.seed >>> 0) || global.RNG.randomSeed();
    this.foe = new global.Engine({ side: 'foe', name: opts.foeName || 'RIVAL', seed: this.seed, isAI: true });
    this.ai = new global.AI(this.foe, opts.aiLevel || C.AI_DEFAULT);
    this._over = false; this._snapAcc = 0;

    var self = this;
    // priešas atakuoja TAVE → siunčiam garbage klientui (tavo variklis gaus receiveAttack)
    this.foe.onAttack = function (n) { if (!self._over) self.net.emit(self.MSG.GARBAGE, { lines: n }); };

    // START po tick'o — kad match.js jau būtų prijungęs on() handlerius. Priešo variklį
    // paleidžiam PO countdown'o (kaip klientas) — kad nebūtų head-start'o (abu startuoja kartu).
    var later = (global.setTimeout || setTimeout);
    var cd = (C.COUNTDOWN_MS || 3000);
    later(function () {
      if (!self.net) return;
      self.net.emit(self.MSG.START, { seed: self.seed, foeName: self.foe.name });
      later(function () { if (!self._over && self.net) self._startLoop(); }, cd);
    }, 0);
    return Promise.resolve();
  };

  MockServer.prototype._startLoop = function () {
    var self = this;
    this.foe.start();
    this._last = _now();
    // 120Hz fiksuotas žingsnis (kaip main.js) — deterministiška
    this._timer = (global.setInterval || setInterval)(function () { self._tick(); }, 1000 / 120);
  };

  MockServer.prototype._tick = function () {
    if (this._over) return;
    var now = _now(), dt = now - this._last; this._last = now;
    if (dt > 100) dt = 100;            // po tab-switch apsauga

    this.ai.update(dt);
    this.foe.update(dt);

    // priešo topout → tu laimėjai
    var evs = this.foe.drainEvents();
    for (var i = 0; i < evs.length; i++) { if (evs[i].t === 'topout') { this._gameover('you'); return; } }

    // periodinis priešo lentos snapshot'as klientui (display)
    this._snapAcc += dt;
    if (this._snapAcc >= this.snapMs) { this._snapAcc = 0; try { this.net.emit(this.MSG.STATE, { foe: this._snapshot() }); } catch (_) {} }
  };

  // Priešo lentos serializacija — tik tai, ką render'iui reikia foe pusei parodyti.
  MockServer.prototype._snapshot = function () {
    var f = this.foe;
    return {
      grid: f.board.grid.map(function (r) { return r.slice(); }),
      cur: f.cur ? { type: f.cur.type, rot: f.cur.rot, x: f.cur.x, y: f.cur.y } : null,
      ghostY: f.cur ? f.ghostY() : 0,
      nextQueue: f.nextQueue.slice(0, 5),
      hold: f.hold, holdUsed: f.holdUsed,
      state: f.state, level: f.level, combo: f.combo, time: f.time,
      incoming: f.garbage.entries.map(function (e) { return { lines: e.lines, readyAt: e.readyAt }; }),
      stats: { lines: f.stats.lines, sent: f.stats.sent, cancelled: f.stats.cancelled, pieces: f.stats.pieces }
    };
  };

  // klientas → serveris
  MockServer.prototype.recv = function (type, payload) {
    if (this._over || !this.foe) return;
    if (type === this.MSG.CLEAR) {
      // tavo ataka (po tavo gynybos) → priešas gauna, jo variklis tvarko 3s langą
      var n = (payload && payload.lines) | 0;
      if (n > 0) this.foe.receiveAttack(n);
    } else if (type === this.MSG.TOPPED) {
      this._gameover('foe');           // tu top out → priešas laimėjo
    }
    // MSG.READY / MSG.INPUT — kol kas state-broadcast modelyje nenaudojami
  };

  MockServer.prototype._gameover = function (winner) {
    if (this._over) return; this._over = true;
    if (this._timer) { (global.clearInterval || clearInterval)(this._timer); this._timer = null; }
    try { this.net.emit(this.MSG.GAMEOVER, { winner: winner }); } catch (_) {}
  };

  MockServer.prototype.disconnect = function () {
    this._over = true;
    if (this._timer) { (global.clearInterval || clearInterval)(this._timer); this._timer = null; }
  };

  global.MockServer = MockServer;
})(window);
