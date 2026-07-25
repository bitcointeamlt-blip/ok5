// math.js — maži skaliarų/vektorių pagalbininkai. Jokios būsenos.
const M = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  deg: (d) => (d * Math.PI) / 180,
  len: (x, y) => Math.hypot(x, y),
  rand: (a, b) => a + Math.random() * (b - a),
  sign: (v) => (v < 0 ? -1 : v > 0 ? 1 : 0),

  // Judėk `cur` link `tgt` ne daugiau kaip `step` (be persišokimo).
  moveToward(cur, tgt, step) {
    const d = tgt - cur;
    if (Math.abs(d) <= step) return tgt;
    return cur + (d < 0 ? -step : step);
  },

  // Artimiausias taškas atkarpoje [A,B] nuo taško P. Grąžina {x,y,t}.
  closestOnSeg(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const ab2 = abx * abx + aby * aby || 1e-9;
    let t = ((px - ax) * abx + (py - ay) * aby) / ab2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return { x: ax + abx * t, y: ay + aby * t, t };
  },
};
