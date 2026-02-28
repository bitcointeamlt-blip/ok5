const fs = require('fs');
let code = fs.readFileSync('game.js', 'utf8');

// 1. Add "worm" to ENEMY_TYPES
code = code.replace(
    "{ type: 'leak', hp: 1, color: '#ff6622', scale: 1.00, label: 'LEAK' },",
    "{ type: 'leak', hp: 1, color: '#ff6622', scale: 1.00, label: 'LEAK' },\n  { type: 'worm', hp: 2, color: '#00ffaa', scale: 1.10, label: 'WORM' },"
);

// 2. Add 'worm' to the pool levels
code = code.replace(
    "        : ri <= 5 ? [ENEMY_TYPES[1], ENEMY_TYPES[3]]",
    "        : ri <= 5 ? [ENEMY_TYPES[1], ENEMY_TYPES[2], ENEMY_TYPES[4]]"
);
code = code.replace(
    "          : [ENEMY_TYPES[2], ENEMY_TYPES[3]];",
    "          : [ENEMY_TYPES[3], ENEMY_TYPES[4], ENEMY_TYPES[2]];"
);

// 3. Update trail in tick
const oldTickStart = "  S.units.forEach(u => { u.px = u.x; u.py = u.y; });";
const newTickStart = `  S.units.forEach(u => {
    if (!u.trail) Object.assign(u, {trail: [{x: u.x, y: u.y}, {x: u.x, y: u.y}]});
    if (u.x !== u.px || u.y !== u.py) {
      u.trail.unshift({x: u.px, y: u.py});
      u.trail.pop();
    }
    u.px = u.x; u.py = u.y;
  });`;
code = code.replace(oldTickStart, newTickStart);

// 4. Inject the Worm drawing function
const wormCode = `
function drawEnemyWorm(cx, cy, u, alpha) {
  try {
    const t = performance.now();
    const isHit = u.hitFlash > 0;
    const baseColor = isHit ? '#ffffff' : u.color;
    const sz = CELL * 0.45 * (u.scale || 1.0);

    // Calculate dynamic trailing segment position
    let progress = 0;
    if (u.x !== u.px) progress = (u.rx - u.px) / (u.x - u.px);
    else if (u.y !== u.py) progress = (u.ry - u.py) / (u.y - u.py);

    const oldX = u.trail && u.trail[0] ? u.trail[0].x : u.px;
    const oldY = u.trail && u.trail[0] ? u.trail[0].y : u.py;
    
    // Tail interpolated cell position
    const tRx = oldX + (u.px - oldX) * progress;
    const tRy = oldY + (u.py - oldY) * progress;
    
    // Tail canvas coords
    const tCx = (tRx + 0.5) * CELL;
    const tCy = (tRy + 0.5) * CELL;

    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Calculate global recoil for the entire entity
    const shakeAmt = (u.hp <= u.maxHp * 0.4) ? 3 : 0;
    const recoil = u.hitFlash > 0 ? -4 : 0;
    const vX = Math.cos(Math.atan2(u.facing.dy, u.facing.dx));
    const vY = Math.sin(Math.atan2(u.facing.dy, u.facing.dx));
    const rCx = cx + vX * recoil + (Math.random() - 0.5) * shakeAmt;
    const rCy = cy + vY * recoil + (Math.random() - 0.5) * shakeAmt;
    const rtCx = tCx + vX * recoil;
    const rtCy = tCy + vY * recoil;

    // Draw universal shadow for the whole worm
    ctx.save();
    ctx.translate(0, 8);
    ctx.globalAlpha = alpha * 0.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = sz * 1.5;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(rCx, rCy);
    ctx.lineTo(rtCx, rtCy);
    ctx.stroke();
    ctx.restore();

    // Sinuous wiggling offset vector based on the angle between head and tail
    const angle = Math.atan2(rCy - rtCy, rCx - rtCx);
    // perp is 90 degrees offset for lateral wigging
    const pX = Math.cos(angle + Math.PI/2);
    const pY = Math.sin(angle + Math.PI/2);
    
    // Draw segmented body
    const segments = 12; // High resolution segmented snake
    ctx.shadowBlur = isHit ? 30 : 15;
    ctx.shadowColor = baseColor;
    
    for (let i = segments; i >= 0; i--) {
      // ratio 0 = head, 1 = absolute tail
      const ratio = i / segments;
      const curX = rCx - (rCx - rtCx) * ratio;
      const curY = rCy - (rCy - rtCy) * ratio;
      
      // Compute wiggle
      const wave = Math.sin(t * 0.015 - ratio * Math.PI * 3 + u.id);
      const wiggleAmt = wave * sz * 0.35 * Math.sin(ratio * Math.PI); // middle wiggles most
      const wX = curX + pX * wiggleAmt;
      const wY = curY + pY * wiggleAmt;

      // Body size tapers off
      const segSz = sz * (1 - ratio * 0.5); 
      
      // Draw neon rings
      ctx.beginPath();
      // Outer bright color
      ctx.fillStyle = baseColor;
      ctx.arc(wX, wY, segSz, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner black hollow
      ctx.fillStyle = '#020202';
      ctx.beginPath();
      ctx.arc(wX, wY, segSz * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw menacing head
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.arc(rCx, rCy, sz * 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#010101';
    ctx.beginPath();
    // Eye slit
    ctx.arc(rCx + Math.cos(angle) * sz*0.2, rCy + Math.sin(angle) * sz*0.2, sz * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // "Pincers / Mandibles" generated mathematically
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = sz * 0.2;
    ctx.lineCap = 'round';
    
    const pincerAngle = 0.5 + Math.abs(Math.sin(t * 0.01 + u.id)*0.3); // animate biting
    const p1X = rCx + Math.cos(angle + pincerAngle) * sz * 1.5;
    const p1Y = rCy + Math.sin(angle + pincerAngle) * sz * 1.5;
    const p2X = rCx + Math.cos(angle - pincerAngle) * sz * 1.5;
    const p2Y = rCy + Math.sin(angle - pincerAngle) * sz * 1.5;

    ctx.beginPath();
    ctx.moveTo(rCx, rCy);
    ctx.lineTo(p1X, p1Y);
    ctx.moveTo(rCx, rCy);
    ctx.lineTo(p2X, p2Y);
    ctx.stroke();

    ctx.restore();
  } catch (e) { console.error("Enemy render error:", e); }
}

`;

code = code.replace("function drawEnemyBinarySwarm", wormCode + "function drawEnemyBinarySwarm");

// 5. Wire into drawUnits
const drawUnitsOld = `    if (gameMode === 'adventure' && u.team === 1) {
      // Priešas skirstomas pagal tipą ('utype'):
      // BUG ir OVR tampa "Juodaja Skyle / TV Static"
      // LEAK ir CORRUPT tampa "Binariniu Debesiu" (0 ir 1)
      if (u.utype === 'leak' || u.utype === 'corrupt') {
         drawEnemyBinarySwarm(cx, cy, u, alpha);
      } else {
         drawEnemyPixelArt(cx, cy, u, alpha);
      }
      ctx.restore();
      return;
    }`;

const drawUnitsNew = `    if (gameMode === 'adventure' && u.team === 1) {
      if (u.utype === 'worm') {
         drawEnemyWorm(cx, cy, u, alpha);
      } else if (u.utype === 'leak' || u.utype === 'corrupt') {
         drawEnemyBinarySwarm(cx, cy, u, alpha);
      } else {
         drawEnemyPixelArt(cx, cy, u, alpha);
      }
      ctx.restore();
      return;
    }`;

code = code.replace(drawUnitsOld, drawUnitsNew);

fs.writeFileSync('game.js', code, 'utf8');
console.log('Successfully injected Data Worm enemy');
