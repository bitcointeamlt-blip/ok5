/* Lenta: tinklelis, kolizijos, linijų naikinimas, garbage įterpimas.
 * Grynos funkcijos — tą patį kodą naudoja ir AI simuliacija, ir (etape 3) serveris. */
(function (global) {
  'use strict';

  var C = global.CFG, P = global.PIECES;

  function Board() {
    this.cols = C.COLS;
    this.rows = C.TOTAL_ROWS;      // 22 (2 buferio + 20 matomų)
    this.grid = [];
    this.reset();
  }

  Board.prototype.reset = function () {
    this.grid = [];
    for (var y = 0; y < this.rows; y++) {
      this.grid.push(new Array(this.cols).fill(null));
    }
  };

  Board.prototype.clone = function () {
    var b = Object.create(Board.prototype);
    b.cols = this.cols; b.rows = this.rows;
    b.grid = this.grid.map(function (r) { return r.slice(); });
    return b;
  };

  Board.prototype.at = function (x, y) {
    if (x < 0 || x >= this.cols || y >= this.rows) return 'W';   // siena/grindys
    if (y < 0) return null;                                       // virš buferio = tuščia
    return this.grid[y][x];
  };

  /* Ar figūra (type, rot) pozicijoje (px,py) kertasi su kuo nors? */
  Board.prototype.collides = function (type, rot, px, py) {
    var cells = P.CELLS[type][rot];
    for (var i = 0; i < cells.length; i++) {
      var x = px + cells[i][0], y = py + cells[i][1];
      if (x < 0 || x >= this.cols || y >= this.rows) return true;
      if (y >= 0 && this.grid[y][x]) return true;
    }
    return false;
  };

  /* Kiek langelių žemyn figūra dar gali kristi. */
  Board.prototype.dropDistance = function (type, rot, px, py) {
    var d = 0;
    while (!this.collides(type, rot, px, py + d + 1)) d++;
    return d;
  };

  Board.prototype.lock = function (type, rot, px, py) {
    var cells = P.CELLS[type][rot], top = this.rows;
    for (var i = 0; i < cells.length; i++) {
      var x = px + cells[i][0], y = py + cells[i][1];
      if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
        this.grid[y][x] = type;
        if (y < top) top = y;
      }
    }
    return top;
  };

  /* Randa pilnas eilutes (nenaikina). */
  Board.prototype.fullRows = function () {
    var out = [];
    for (var y = 0; y < this.rows; y++) {
      var full = true;
      for (var x = 0; x < this.cols; x++) { if (!this.grid[y][x]) { full = false; break; } }
      if (full) out.push(y);
    }
    return out;
  };

  Board.prototype.clearRows = function (rows) {
    if (!rows || !rows.length) return 0;
    var set = {}; rows.forEach(function (y) { set[y] = 1; });
    var kept = [];
    for (var y = 0; y < this.rows; y++) if (!set[y]) kept.push(this.grid[y]);
    while (kept.length < this.rows) kept.unshift(new Array(this.cols).fill(null));
    this.grid = kept;
    return rows.length;
  };

  /* Įterpia n garbage eilučių iš apačios.
   * holes: masyvas stulpelių indeksų (po vieną kiekvienai eilutei).
   * Grąžina true, jei dėl to blokai išstumti virš lentos (topout). */
  Board.prototype.addGarbage = function (n, holes) {
    var overflow = false, y, x;
    for (y = 0; y < n; y++) {
      // ar viršutinė eilutė, kurią išstumsim, turi blokų?
      var top = this.grid[0];
      for (x = 0; x < this.cols; x++) if (top[x]) { overflow = true; break; }
      this.grid.shift();
      var row = new Array(this.cols).fill('G');
      row[holes[y]] = null;
      this.grid.push(row);
    }
    return overflow;
  };

  /* Aukščiausio užimto langelio eilutė (mažesnė = aukščiau). rows jei tuščia. */
  Board.prototype.topRow = function () {
    for (var y = 0; y < this.rows; y++)
      for (var x = 0; x < this.cols; x++)
        if (this.grid[y][x]) return y;
    return this.rows;
  };

  /* Kiek eilučių aukščio yra krūva (matomose eilutėse). */
  Board.prototype.stackHeight = function () {
    return Math.max(0, this.rows - this.topRow());
  };

  global.Board = Board;
})(window);
