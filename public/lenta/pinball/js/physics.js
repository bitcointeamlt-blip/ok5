// physics.js — grynos kolizijos funkcijos (be būsenos). Naudoja BallController.
// Kamuoliukas = apskritimas. Sienos = capsule atkarpos. Bumperiai = apskritimai.

// Apskritimas vs atkarpa (su half-thickness seg.r). Grąžina kontaktą arba null.
function collideCircleSegment(bx, by, br, seg) {
  const c = M.closestOnSeg(bx, by, seg.ax, seg.ay, seg.bx, seg.by);
  const dx = bx - c.x, dy = by - c.y;
  const d = Math.hypot(dx, dy);
  const min = br + seg.r;
  if (d >= min) return null;
  let nx, ny;
  if (d > 1e-6) { nx = dx / d; ny = dy / d; }
  else { nx = seg.nx; ny = seg.ny; }   // degeneracija → naudok atkarpos normalę
  return { nx, ny, pen: min - d, cx: c.x, cy: c.y };
}

// Apskritimas vs apskritimas (bumperis). Grąžina kontaktą arba null.
function collideCircleCircle(bx, by, br, cx, cy, cr) {
  const dx = bx - cx, dy = by - cy;
  const d = Math.hypot(dx, dy);
  const min = br + cr;
  if (d >= min) return null;
  let nx, ny;
  if (d > 1e-6) { nx = dx / d; ny = dy / d; }
  else { nx = 0; ny = -1; }
  return { nx, ny, pen: min - d, cx, cy };
}
