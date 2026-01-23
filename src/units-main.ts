// ========== UNITS - Game Entry Point ==========

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// Fixed internal resolution (1080p height, width adjusts to aspect ratio)
const INTERNAL_HEIGHT = 1080;
let gameWidth = Math.round(INTERNAL_HEIGHT * (window.innerWidth / window.innerHeight));
let gameHeight = INTERNAL_HEIGHT;

function updateCanvasSize(): void {
  const aspect = window.innerWidth / window.innerHeight;
  gameWidth = Math.round(INTERNAL_HEIGHT * aspect);
  gameHeight = INTERNAL_HEIGHT;
  canvas.width = gameWidth;
  canvas.height = gameHeight;
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
}

updateCanvasSize();
window.addEventListener('resize', updateCanvasSize);

// ========== GAME STATE ==========
let lastTime = 0;

// ========== GAME LOOP ==========
function update(dt: number): void {
  // Game logic here
  void dt;
}

function render(): void {
  // Clear
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  // Title
  ctx.fillStyle = '#FFD700';
  ctx.font = '48px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText('UNITS', gameWidth / 2, gameHeight / 2 - 30);

  ctx.fillStyle = '#888';
  ctx.font = '16px "Press Start 2P"';
  ctx.fillText('Game is loading...', gameWidth / 2, gameHeight / 2 + 40);
}

function gameLoop(timestamp: number): void {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}

// Start
requestAnimationFrame((t) => {
  lastTime = t;
  gameLoop(t);
});

console.log('🎮 UNITS initialized');
