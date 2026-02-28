const fs = require('fs');
let code = fs.readFileSync('game.js', 'utf8');

const binarySwarmCode = `
function drawEnemyBinarySwarm(cx, cy, u, alpha) {
  try {
    const t = performance.now();
    const isHit = u.hitFlash > 0;
    const sz = CELL * 0.45 * (u.scale || 1.0);
    const baseColor = isHit ? '#ffffff' : u.color;

    // Recoil effect from taking damage
    const angle = Math.atan2(u.facing.dy, u.facing.dx);
    const recoil = u.hitFlash > 0 ? -4 : 0;
    const cxRecoil = cx + Math.cos(angle) * recoil;
    const cyRecoil = cy + Math.sin(angle) * recoil;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cxRecoil, cyRecoil);

    // Universal Shadow
    ctx.save();
    ctx.translate(0, 6);
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, 0, sz * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.shadowBlur = isHit ? 20 : 12;
    ctx.shadowColor = baseColor;
    ctx.fillStyle = baseColor;

    // Binary Chaotic Cloud
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxHealth = u.maxHp || 1;
    const healthRatio = Math.max(0.1, u.hp / maxHealth);

    // Amount of characters based on enemy scale
    const numChars = Math.floor(18 * (u.scale || 1.0));

    // Shake amount increases as health drops
    const shake = (1.0 - healthRatio) * 6;

    for (let i = 0; i < numChars; i++) {
      // Pseudo-random deterministic position based on unit id and particle index
      const rSeed = u.id * 100 + i * 15.3;
      const speed = 0.001 + (i % 3) * 0.0015;

      let r = sz * 1.5 * Math.abs(Math.sin(rSeed));
      let theta = (rSeed * 0.1) + t * speed * (i % 2 === 0 ? 1 : -1);

      // Jitter based on damage
      const jX = (Math.sin(t * 0.05 + rSeed) * shake);
      const jY = (Math.cos(t * 0.05 + rSeed) * shake);

      const px = Math.cos(theta) * r + jX;
      const py = Math.sin(theta) * r + jY;

      // Rapidly changing 0 or 1
      const char = Math.floor((t * (0.01 + i * 0.001) + rSeed) % 2) === 0 ? '0' : '1';

      // Text size based on distance from center (inner is larger, outer is smaller)
      const ts = sz * 0.8 * (1 - (r / (sz * 2.0))) + 8;
      ctx.font = \`bold \${ts}px monospace\`;

      // Alpha flicker
      ctx.globalAlpha = alpha * (0.4 + Math.abs(Math.sin(t * 0.01 + rSeed)) * 0.6);

      // Hit flash overrides fill occasionally for extra glitch
      ctx.fillStyle = (isHit && i % 2 === 0) ? '#fff' : baseColor;

      ctx.fillText(char, px, py);
    }

    // Volatile Core
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = isHit ? 30 : 20;
    ctx.shadowColor = baseColor;

    const coreSz = sz * 0.5;
    const cX = (Math.random() - 0.5) * shake;
    const cY = (Math.random() - 0.5) * shake;

    // Base core block
    ctx.fillRect(-coreSz / 2 + cX, -coreSz / 2 + cY, coreSz, coreSz);

    // Overlap a rapidly changing binary char right in the core
    ctx.fillStyle = '#000000';
    ctx.shadowBlur = 0;
    ctx.font = \`900 \${coreSz}px monospace\`;
    ctx.fillText(Math.random() > 0.5 ? '0' : '1', cX, cY);

    ctx.restore();
  } catch (e) { console.error("Enemy render error:", e); }
}

function drawEnemyPixelArt(cx, cy, u, alpha) {
`;

code = code.replace('function drawEnemyPixelArt(cx, cy, u, alpha) {', binarySwarmCode);

const drawUnitsOld = \`    // ── Adventure enemy: pixel art character ──────────────────────
    if (gameMode === 'adventure' && u.team === 1) {
      drawEnemyPixelArt(cx, cy, u, alpha);
      ctx.restore();
      return;
    }\`;

const drawUnitsNew = \`    // ── Adventure enemy: pixel art character ──────────────────────
    if (gameMode === 'adventure' && u.team === 1) {
      // Skirstome per pusę / pagal utype tipą: 
      // BUG ir OVR tampa TV Static, LEAK ir CRPT tampa Binary Swarm.
      if (u.utype === 'leak' || u.utype === 'corrupt') {
         drawEnemyBinarySwarm(cx, cy, u, alpha);
      } else {
         drawEnemyPixelArt(cx, cy, u, alpha);
      }
      ctx.restore();
      return;
    }\`;

code = code.replace(drawUnitsOld, drawUnitsNew);

fs.writeFileSync('game.js', code, 'utf8');
console.log('Successfully injected binary swarm enemy');
