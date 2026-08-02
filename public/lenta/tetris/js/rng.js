/* Deterministinis RNG + 7-bag generatorius.
 * SVARBU PvP sąžiningumui: abu žaidėjai gauna TĄ PAČIĄ figūrų seką iš to paties seed.
 * Etape 3 seed'ą duos serveris — klientas nieko nekeičia. */
(function (global) {
  'use strict';

  /* mulberry32 — mažas, greitas, deterministinis PRNG (public domain). */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  /* 7-bag: kiekvienas iš 7 tipų pasirodo lygiai kartą kas 7 figūras. */
  function BagRandomizer(seed) {
    this.rnd = mulberry32(seed);
    this.bag = [];
  }

  BagRandomizer.prototype._refill = function () {
    var b = TYPES.slice();
    // Fisher-Yates su deterministiniu rnd
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(this.rnd() * (i + 1));
      var t = b[i]; b[i] = b[j]; b[j] = t;
    }
    this.bag = b;
  };

  BagRandomizer.prototype.next = function () {
    if (!this.bag.length) this._refill();
    return this.bag.shift();
  };

  /* Atskiras srautas garbage skylių pozicijoms — kad nesuardytų figūrų sekos
   * determinizmo (skirtingi žaidėjai gauna skirtingą kiekį atakų). */
  function HoleRandomizer(seed) {
    this.rnd = mulberry32(seed ^ 0x9e3779b9);
    this.last = -1;
  }
  HoleRandomizer.prototype.next = function (cols) {
    var c = Math.floor(this.rnd() * cols);
    if (c === this.last) c = (c + 1 + Math.floor(this.rnd() * (cols - 1))) % cols;
    this.last = c;
    return c;
  };

  global.RNG = {
    mulberry32: mulberry32,
    BagRandomizer: BagRandomizer,
    HoleRandomizer: HoleRandomizer,
    TYPES: TYPES,
    randomSeed: function () { return (Math.random() * 0xffffffff) >>> 0; }
  };
})(window);
