/* AI priešininkas.
 *
 * Euristika: El-Tetris (Islam El-Ashi, atviras kodas) — 6 požymiai su fiksuotais svoriais.
 * Botas NEsukčiauja: jis naudoja TĄ PATĮ Engine API kaip žmogus (tap()),
 * tik su "žmogiškomis" pauzėmis tarp įvedimų. Todėl jį galima nugalėti greičiu.
 *
 * Sudėtingumas keičiamas per CFG.AI_LEVELS (moveMs / thinkMs / mistake / useHold / panic). */
(function (global) {
  'use strict';

  var C = global.CFG, P = global.PIECES;

  /* ---------- požymių skaičiavimas ---------- */

  function features(grid, rows, cols, minY, maxY, cleared) {
    var y, x, i;

    /* skylės + stulpelių aukščiai */
    var holes = 0, colTop = new Array(cols).fill(rows);
    for (x = 0; x < cols; x++) {
      var seen = false;
      for (y = 0; y < rows; y++) {
        if (grid[y][x]) { if (!seen) { colTop[x] = y; seen = true; } }
        else if (seen) holes++;
      }
    }

    var stackTop = rows;
    for (x = 0; x < cols; x++) if (colTop[x] < stackTop) stackTop = colTop[x];

    /* eilučių perėjimai (sienos = užpildyta), tik nuo krūvos viršaus */
    var rowTrans = 0;
    for (y = stackTop; y < rows; y++) {
      var prev = 1;                        // kairė siena
      for (x = 0; x < cols; x++) {
        var cell = grid[y][x] ? 1 : 0;
        if (cell !== prev) rowTrans++;
        prev = cell;
      }
      if (prev !== 1) rowTrans++;          // dešinė siena
    }

    /* stulpelių perėjimai (grindys = užpildyta) */
    var colTrans = 0;
    for (x = 0; x < cols; x++) {
      var pv = 0;                          // virš krūvos = tuščia
      for (y = stackTop; y < rows; y++) {
        var c2 = grid[y][x] ? 1 : 0;
        if (c2 !== pv) colTrans++;
        pv = c2;
      }
      if (pv !== 1) colTrans++;            // grindys
    }

    /* šulinių sumos: 1+2+3... už kiekvieną gilyn einantį tuščią langelį tarp užpildytų */
    var wells = 0;
    for (x = 0; x < cols; x++) {
      for (y = 0; y < rows; y++) {
        if (grid[y][x]) continue;
        var leftFilled  = (x === 0) ? 1 : (grid[y][x - 1] ? 1 : 0);
        var rightFilled = (x === cols - 1) ? 1 : (grid[y][x + 1] ? 1 : 0);
        if (leftFilled && rightFilled) {
          var d = 0, yy = y;
          while (yy < rows && !grid[yy][x]) { d++; wells += d; yy++; }
          y = yy;                          // šulinį suskaičiavom vienu ypu
        }
      }
    }

    var landingHeight = rows - (minY + maxY) / 2;

    return {
      landingHeight: landingHeight,
      rowsEliminated: cleared,
      rowTransitions: rowTrans,
      colTransitions: colTrans,
      holes: holes,
      wellSums: wells
    };
  }

  function score(f, panicMul) {
    var w = C.AI_W;
    /* Valymo vertė = žalias linijų kiekis (svarbu GYNYBAI, 1:1) + atakos vertė iš lentelės.
     * Be atakos dėmens botas godžiai valytų vienguba po vienguba ir nieko nesiųstų. */
    var n = f.rowsEliminated;
    var clearVal = 0;
    if (n > 0) {
      clearVal = n * panicMul + (C.ATTACK_TABLE[n] || 0) * C.AI_ATK_WEIGHT;
      /* nespaudžiamas botas nešvaisto viengubos — kaupia dvigubai/quad'ui */
      if (n === 1 && panicMul <= 1) clearVal -= C.AI_SINGLE_PENALTY;
    }
    return f.landingHeight * w.landingHeight
      + clearVal * w.rowsEliminated
      + f.rowTransitions * w.rowTransitions
      + f.colTransitions * w.colTransitions
      + f.holes * w.holes
      + f.wellSums * w.wellSums;
  }

  /* Simuliuoja padėjimą ir grąžina įvertį (arba null jei neįmanoma). */
  function evaluate(board, type, rot, x, panicMul) {
    var spawnY = P.SPAWN_Y;
    if (board.collides(type, rot, x, spawnY)) return null;
    var d = board.dropDistance(type, rot, x, spawnY);
    var y = spawnY + d;

    var cells = P.CELLS[type][rot];
    var rows = board.rows, cols = board.cols;
    var grid = board.grid, i, cy, cx;

    /* laikinai uždedam */
    var placed = [];
    var minY = 1e9, maxY = -1e9;
    for (i = 0; i < cells.length; i++) {
      cy = y + cells[i][1]; cx = x + cells[i][0];
      if (cy < 0) return null;                        // netelpa net buferyje
      placed.push([cy, cx]);
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
    }
    for (i = 0; i < placed.length; i++) grid[placed[i][0]][placed[i][1]] = type;

    /* pilnos eilutės */
    var cleared = 0, full;
    for (cy = 0; cy < rows; cy++) {
      full = true;
      for (cx = 0; cx < cols; cx++) if (!grid[cy][cx]) { full = false; break; }
      if (full) cleared++;
    }

    /* požymius skaičiuojam ANT lentos su išvalytomis eilutėmis */
    var work = grid;
    if (cleared) {
      work = [];
      for (cy = 0; cy < rows; cy++) {
        full = true;
        for (cx = 0; cx < cols; cx++) if (!grid[cy][cx]) { full = false; break; }
        if (!full) work.push(grid[cy]);
      }
      while (work.length < rows) work.unshift(new Array(cols).fill(null));
    }

    var f = features(work, rows, cols, minY, maxY, cleared);
    var s = score(f, panicMul);

    /* nuimam */
    for (i = 0; i < placed.length; i++) grid[placed[i][0]][placed[i][1]] = null;

    return { score: s, rot: rot, x: x, y: y, cleared: cleared };
  }

  function bestFor(board, type, panicMul) {
    var out = [], rotCount = (type === 'O') ? 1 : ((type === 'I' || type === 'S' || type === 'Z') ? 2 : 4);
    for (var r = 0; r < rotCount; r++) {
      for (var x = -2; x < board.cols + 2; x++) {
        var e = evaluate(board, type, r, x, panicMul);
        if (e) out.push(e);
      }
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  /* ---------- botas ---------- */

  function AI(engine, levelKey) {
    this.eng = engine;
    this.setLevel(levelKey || C.AI_DEFAULT);
    this.plan = null;
    this.timer = 0;
    this.thinking = 0;
    this.lastPiece = null;
  }

  AI.prototype.setLevel = function (key) {
    this.levelKey = key;
    this.cfg = C.AI_LEVELS[key] || C.AI_LEVELS.NORMAL;
  };

  AI.prototype.reset = function () {
    this.plan = null; this.timer = 0; this.thinking = 0; this.lastPiece = null;
  };

  AI.prototype._think = function () {
    var eng = this.eng;
    if (!eng.cur) return;
    /* MARCH režime spaudimą rodo ne garbage eilė, o priešo unitai kelyje. */
    var pressure = (C.MARCH && C.MARCH.ENABLED) ? (eng.incoming || 0) : eng.garbage.pending();
    var panic = pressure > 0 ? this.cfg.panic : 1.0;

    var work = eng.board.clone();
    var candidates = bestFor(work, eng.cur.type, panic);
    if (!candidates.length) { this.plan = ['hard']; return; }

    var useHold = false;
    if (this.cfg.useHold && !eng.holdUsed) {
      var altType = eng.hold || eng.nextQueue[0];
      if (altType && altType !== eng.cur.type) {
        var alt = bestFor(work, altType, panic);
        if (alt.length && alt[0].score > candidates[0].score + 12) {
          useHold = true;
        }
      }
    }
    if (useHold) { this.plan = ['hold']; return; }

    /* Netobulumas dviem lygiais:
     *  blunder — reta, bet TIKRAI prasta padėtis (palieka skyles, kuriomis gali pasinaudoti)
     *  mistake — dažnesnė, bet nekalta klaida (2-5 geriausias variantas) */
    var pick = candidates[0], k;
    if (this.cfg.blunder > 0 && Math.random() < this.cfg.blunder) {
      var lim = Math.max(2, Math.floor(candidates.length * 0.45));
      k = Math.floor(Math.random() * lim);
      if (candidates[k]) pick = candidates[k];
    } else if (this.cfg.mistake > 0 && Math.random() < this.cfg.mistake) {
      k = 1 + Math.floor(Math.random() * Math.min(4, candidates.length - 1));
      if (candidates[k]) pick = candidates[k];
    }

    /* planas: sukimai -> horizontalūs žingsniai -> hard drop */
    var steps = [];
    var need = (pick.rot - eng.cur.rot + 4) % 4;
    if (need === 3) steps.push('ccw');
    else for (var i = 0; i < need; i++) steps.push('cw');

    var dx = pick.x - eng.cur.x;
    for (var j = 0; j < Math.abs(dx); j++) steps.push(dx > 0 ? 'right' : 'left');
    steps.push('hard');
    this.plan = steps;
  };

  AI.prototype.update = function (dt) {
    var eng = this.eng;
    if (eng.state !== 'playing' || !eng.cur) return;

    /* nauja figūra -> pagalvojam */
    if (this.lastPiece !== eng.cur || !this.plan) {
      if (this.lastPiece !== eng.cur) {
        this.lastPiece = eng.cur;
        this.plan = null;
        this.thinking = this.cfg.thinkMs;
      }
      if (!this.plan) {
        this.thinking -= dt;
        if (this.thinking > 0) return;
        this._think();
        this.timer = 0;
        if (!this.plan) return;
      }
    }

    this.timer += dt;
    while (this.plan && this.plan.length && this.timer >= this.cfg.moveMs) {
      this.timer -= this.cfg.moveMs;
      var a = this.plan.shift();
      eng.tap(a);
      if (a === 'hard' || a === 'hold') { this.plan = null; this.lastPiece = eng.cur; this.thinking = this.cfg.thinkMs; break; }
    }
  };

  AI.features = features;
  AI.bestFor = bestFor;
  global.AI = AI;
})(window);
