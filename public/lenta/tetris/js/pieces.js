/* Tetromino formos + SRS sukimo sistema su wall kick lentelėmis.
 * Šaltinis: Tetris Guideline / SRS (tetris.wiki, harddrop.com).
 * DĖMESIO: originalios lentelės naudoja +Y = AUKŠTYN.
 * Mūsų tinklelis naudoja +Y = ŽEMYN, todėl y ženklą apverčiam taikymo metu. */
(function (global) {
  'use strict';

  /* Formos spawn (0) būsenoje. 1 = užpildyta. */
  var SHAPES = {
    I: [[0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]],
    O: [[1, 1],
        [1, 1]],
    T: [[0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]],
    S: [[0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]],
    Z: [[1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]],
    J: [[1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]],
    L: [[0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]]
  };

  /* Spawn X pozicija (stulpelis, kuriame atsiranda matricos kairė pusė). */
  var SPAWN_X = { I: 3, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };
  /* Matricos viršus 2-oje tinklelio eilutėje = figūra matoma iškart,
   * o virš jos lieka 2 buferio eilutės wall-kick'ams į viršų. */
  var SPAWN_Y = 2;

  /* SRS wall kick lentelės. Raktas: "from>to", būsenos 0=spawn, 1=R(CW), 2=180, 3=L(CCW). */
  var KICKS_JLSTZ = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  };

  var KICKS_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
  };

  /* 180° sukimas SRS nedokumentuotas — naudojam paprastą "basic kick" rinkinį. */
  var KICKS_180 = [[0, 0], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, -1], [0, 1], [2, 0], [-2, 0]];

  /* Iš anksto apskaičiuotos visos 4 rotacijos kiekvienam tipui. */
  var ROTATIONS = {};
  function rotateCW(m) {
    var n = m.length, r = [], y, x;
    for (y = 0; y < n; y++) { r.push(new Array(n)); }
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) r[x][n - 1 - y] = m[y][x];
    return r;
  }
  Object.keys(SHAPES).forEach(function (t) {
    var states = [SHAPES[t]];
    for (var i = 1; i < 4; i++) states.push(rotateCW(states[i - 1]));
    ROTATIONS[t] = states;
  });

  /* Grąžina užimtų (dx,dy) porų sąrašą duotam tipui + rotacijai. */
  var CELLS = {};
  Object.keys(ROTATIONS).forEach(function (t) {
    CELLS[t] = ROTATIONS[t].map(function (m) {
      var out = [];
      for (var y = 0; y < m.length; y++)
        for (var x = 0; x < m.length; x++)
          if (m[y][x]) out.push([x, y]);
      return out;
    });
  });

  function kicksFor(type, from, to) {
    if (type === 'O') return [[0, 0]];
    var d = (to - from + 4) % 4;
    if (d === 2) return KICKS_180;
    var key = from + '>' + to;
    var tbl = (type === 'I') ? KICKS_I : KICKS_JLSTZ;
    return tbl[key] || [[0, 0]];
  }

  global.PIECES = {
    SHAPES: SHAPES,
    ROTATIONS: ROTATIONS,
    CELLS: CELLS,
    SPAWN_X: SPAWN_X,
    SPAWN_Y: SPAWN_Y,
    kicksFor: kicksFor,
    size: function (type) { return ROTATIONS[type][0].length; }
  };
})(window);
