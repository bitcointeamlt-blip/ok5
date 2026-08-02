/* ATAKŲ EILĖ — pagrindinė šio žaidimo mechanika.
 *
 * SPEC taisyklės:
 *  1. Kiekviena ataka turi SAVO nepriklausomą 3 s laikmatį.
 *     Nauja ataka NEATNAUJINA senos atakos laikmačio.
 *  2. Kai žaidėjas sunaikina linijas: PIRMA panaikinamos laukiančios linijos
 *     (nuo seniausios = artimiausios kritimui), TIK likutis siunčiamas priešui.
 *  3. Pasibaigus laikui nepanaikintos linijos pakelia lentą.
 *
 * Laikas — engine laikas (ms nuo rungtynių pradžios), NE wall clock.
 * Etape 3 tą patį objektą suks serveris; klientas tik atvaizduos. */
(function (global) {
  'use strict';

  var C = global.CFG;
  var _id = 1;

  function GarbageQueue(holeRnd) {
    this.entries = [];      // [{id, lines, holes[], readyAt, bornAt}]
    this.holeRnd = holeRnd;
  }

  GarbageQueue.prototype.reset = function () { this.entries.length = 0; };

  /* Gaunama ataka: sukuriam įrašą su savo laikmačiu. */
  GarbageQueue.prototype.receive = function (lines, now) {
    if (lines <= 0) return null;
    var total = this.pending();
    if (total >= C.GARBAGE_MAX_QUEUE) lines = Math.max(0, C.GARBAGE_MAX_QUEUE - total);
    if (lines <= 0) return null;

    var holes = [], h = this.holeRnd.next(C.COLS);
    for (var i = 0; i < lines; i++) {
      holes.push(C.GARBAGE_SAME_HOLE ? h : this.holeRnd.next(C.COLS));
    }
    var e = { id: _id++, lines: lines, holes: holes, bornAt: now, readyAt: now + C.GARBAGE_DELAY };
    this.entries.push(e);
    return e;
  };

  /* Panaikinam `lines` laukiančių linijų (nuo seniausios).
   * `now` (nebūtinas) leidžia grąžinti, KUR kelyje buvo pakirstos linijos —
   * to reikia mūšio koridoriui, kad kirtis nupieštų tiksliai ten, kur unitas žygiavo.
   * Grąžina {cancelled, leftover, clearedEntries, spots[]}. */
  GarbageQueue.prototype.cancel = function (lines, now) {
    var cancelled = 0, wiped = 0, spots = [];
    while (lines > 0 && this.entries.length) {
      var e = this.entries[0];
      var take = Math.min(lines, e.lines);
      if (now != null) {
        var t01 = Math.max(0, Math.min(1, (e.readyAt - now) / C.GARBAGE_DELAY));
        for (var q = 0; q < take; q++) spots.push(t01);
      }
      e.lines -= take;
      e.holes.splice(0, take);
      lines -= take;
      cancelled += take;
      if (e.lines <= 0) { this.entries.shift(); wiped++; }
    }
    return { cancelled: cancelled, leftover: lines, clearedEntries: wiped, spots: spots };
  };

  /* Įrašai, kurių laikas išseko. Pašalinam iš eilės ir grąžinam. */
  GarbageQueue.prototype.takeDue = function (now) {
    var due = [];
    while (this.entries.length && this.entries[0].readyAt <= now) {
      due.push(this.entries.shift());
    }
    return due;
  };

  GarbageQueue.prototype.pending = function () {
    var n = 0;
    for (var i = 0; i < this.entries.length; i++) n += this.entries[i].lines;
    return n;
  };

  /* ms iki artimiausio kritimo (arba Infinity). */
  GarbageQueue.prototype.soonest = function (now) {
    if (!this.entries.length) return Infinity;
    return Math.max(0, this.entries[0].readyAt - now);
  };

  /* Vizualizacijai: [{lines, t01}] kur t01 = 1 → ką tik atėjo, 0 → tuoj kris. */
  GarbageQueue.prototype.snapshot = function (now) {
    return this.entries.map(function (e) {
      return {
        id: e.id,
        lines: e.lines,
        holes: e.holes.slice(),                                  // skylių stulpeliai (ghost preview'ui)
        remain: Math.max(0, e.readyAt - now),
        t01: Math.max(0, Math.min(1, (e.readyAt - now) / C.GARBAGE_DELAY))
      };
    });
  };

  /* Atakos lentelė: kiek linijų siunčiam už n sunaikintų. */
  GarbageQueue.attackFor = function (n) {
    return C.ATTACK_TABLE[n] || 0;
  };

  global.GarbageQueue = GarbageQueue;
})(window);
