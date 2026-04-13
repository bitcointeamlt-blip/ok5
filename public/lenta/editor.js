// ══════════════════════════════════════════════════════════════════
//  editor.js — Standalone map / animation editor
//  Completely independent from game.js.
//  Same visual aesthetic as the dungeon (dark #07070f, green grid).
// ══════════════════════════════════════════════════════════════════
'use strict';

(function () {

  // ── Constants (mirror game.js values) ────────────────────────────
  const CELL     = 54;   // tile size in px — matches game.js
  const MAP_COLS = 48;   // adventure map width  — matches game.js
  const MAP_ROWS = 32;   // adventure map height — matches game.js

  // ── Tile palette ──────────────────────────────────────────────────
  const TILES = {
    0: { name:'EMPTY', fill:'#07090c', edge:'#0a0c10' },
    1: { name:'FLOOR', fill:'#0a1510', edge:'#0e1c14' },
    2: { name:'WALL',  fill:'#1a1200', edge:'#251900' },
    3: { name:'WATER', fill:'#001828', edge:'#002038' },
    4: { name:'GRASS', fill:'#071c0a', edge:'#0a2810' },
  };

  const TOOL_TILE = { floor:1, wall:2, water:3, grass:4, erase:0 };

  // ── Editor state ──────────────────────────────────────────────────
  const E = window.EditorState = {
    map:        null,
    camX:       0,
    camY:       0,
    activeTool: 'floor',
    animFrame:  null,
    fromScreen: 'screen-village',
  };

  // ── Map init ──────────────────────────────────────────────────────
  function initMap() {
    if (E.map && E.map.length === MAP_COLS * MAP_ROWS) return;
    E.map = new Uint8Array(MAP_COLS * MAP_ROWS); // all zeros = EMPTY
  }

  // ── Canvas helpers ────────────────────────────────────────────────
  function getCV()  { return document.getElementById('editor-canvas'); }

  function resizeCanvas() {
    const wrap = document.getElementById('ed-canvas-wrap');
    const cv   = getCV();
    if (!wrap || !cv) return;
    if (cv.width  !== wrap.clientWidth)  cv.width  = wrap.clientWidth;
    if (cv.height !== wrap.clientHeight) cv.height = wrap.clientHeight;
  }

  function clampCam(cv) {
    const maxX = Math.max(0, MAP_COLS * CELL - (cv ? cv.width  : 0));
    const maxY = Math.max(0, MAP_ROWS * CELL - (cv ? cv.height : 0));
    E.camX = Math.max(0, Math.min(maxX, E.camX));
    E.camY = Math.max(0, Math.min(maxY, E.camY));
  }

  // ── Draw loop ─────────────────────────────────────────────────────
  function draw() {
    const sc = document.getElementById('screen-editor');
    if (!sc || !sc.classList.contains('active')) { E.animFrame = null; return; }
    const cv  = getCV();
    if (!cv) { E.animFrame = null; return; }
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;

    // Fill bg
    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, W, H);

    if (E.map) {
      const camX = E.camX, camY = E.camY;
      const sc0  = Math.max(0, Math.floor(camX / CELL));
      const sr0  = Math.max(0, Math.floor(camY / CELL));
      const sc1  = Math.min(MAP_COLS, sc0 + Math.ceil(W / CELL) + 2);
      const sr1  = Math.min(MAP_ROWS, sr0 + Math.ceil(H / CELL) + 2);

      // Tiles
      for (let row = sr0; row < sr1; row++) {
        for (let col = sc0; col < sc1; col++) {
          const t  = E.map[row * MAP_COLS + col];
          const td = TILES[t] || TILES[0];
          const px = Math.round(col * CELL - camX);
          const py = Math.round(row * CELL - camY);
          // Main fill
          ctx.fillStyle = td.fill;
          ctx.fillRect(px, py, CELL, CELL);
          // Top & left edge (darker)
          ctx.fillStyle = td.edge;
          ctx.fillRect(px, py, CELL, 1);
          ctx.fillRect(px, py, 1, CELL);
        }
      }

      // Grid lines
      ctx.fillStyle = 'rgba(78,207,136,0.06)';
      for (let col = sc0; col <= sc1; col++) {
        ctx.fillRect(Math.round(col * CELL - camX), 0, 1, H);
      }
      for (let row = sr0; row <= sr1; row++) {
        ctx.fillRect(0, Math.round(row * CELL - camY), W, 1);
      }

      // Map boundary glow
      ctx.strokeStyle = 'rgba(78,207,136,0.25)';
      ctx.lineWidth   = 2;
      ctx.strokeRect(
        Math.round(-camX) + 1,
        Math.round(-camY) + 1,
        MAP_COLS * CELL - 2,
        MAP_ROWS * CELL - 2
      );
    }

    // CRT scanlines
    for (let y = 0; y < H; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fillRect(0, y, W, 1);
    }

    E.animFrame = requestAnimationFrame(draw);
  }

  // ── Input ──────────────────────────────────────────────────────────
  function screenToTile(e, cv) {
    const rect = cv.getBoundingClientRect();
    const sx   = cv.width  / rect.width;
    const sy   = cv.height / rect.height;
    const wx   = (e.clientX - rect.left)  * sx + E.camX;
    const wy   = (e.clientY - rect.top)   * sy + E.camY;
    return {
      col: Math.floor(wx / CELL),
      row: Math.floor(wy / CELL),
    };
  }

  function paint(col, row) {
    if (!E.map || col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return;
    E.map[row * MAP_COLS + col] = TOOL_TILE[E.activeTool] ?? 0;
    const el = document.getElementById('ed-coords');
    if (el) el.textContent = col + ',' + row;
  }

  function attachEvents() {
    const cv = getCV();
    if (!cv || cv._edBound) return;
    cv._edBound = true;

    let isPainting = false;
    let isPanning  = false;
    let panLx = 0, panLy = 0;

    cv.addEventListener('mousedown', e => {
      e.preventDefault();
      if (e.button === 2 || e.button === 1) {
        isPanning = true;
        panLx = e.clientX; panLy = e.clientY;
      } else {
        isPainting = true;
        const { col, row } = screenToTile(e, cv);
        paint(col, row);
      }
    });

    cv.addEventListener('mousemove', e => {
      const { col, row } = screenToTile(e, cv);
      const el = document.getElementById('ed-coords');
      if (el) {
        const c = Math.max(0, Math.min(MAP_COLS - 1, col));
        const r = Math.max(0, Math.min(MAP_ROWS - 1, row));
        el.textContent = c + ',' + r;
      }
      if (isPanning) {
        const rect = cv.getBoundingClientRect();
        const sx = cv.width  / rect.width;
        const sy = cv.height / rect.height;
        E.camX -= (e.clientX - panLx) * sx;
        E.camY -= (e.clientY - panLy) * sy;
        clampCam(cv);
        panLx = e.clientX; panLy = e.clientY;
      }
      if (isPainting) paint(col, row);
    });

    window.addEventListener('mouseup', () => { isPainting = false; isPanning = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      E.camX += e.deltaX;
      E.camY += e.deltaY;
      clampCam(cv);
    }, { passive: false });
  }

  // ── Resize ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    const sc = document.getElementById('screen-editor');
    if (sc && sc.classList.contains('active')) resizeCanvas();
  });

  // ── Public API ────────────────────────────────────────────────────
  window.editor = {

    open(fromScreen) {
      E.fromScreen = fromScreen || 'screen-village';
      initMap();

      document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
      });
      const sc = document.getElementById('screen-editor');
      if (sc) { sc.style.display = 'flex'; sc.classList.add('active'); }

      resizeCanvas();
      attachEvents();

      // Sync tool buttons
      document.querySelectorAll('[data-edtool]').forEach(b => {
        b.classList.toggle('ed-active', b.dataset.edtool === E.activeTool);
      });

      const el = document.getElementById('ed-coords');
      if (el) el.textContent = '—';

      if (E.animFrame) cancelAnimationFrame(E.animFrame);
      draw();
    },

    close() {
      if (E.animFrame) { cancelAnimationFrame(E.animFrame); E.animFrame = null; }
      // Go back to originating screen
      if (E.fromScreen === 'screen-village' && window.village) {
        window.village.open();
      } else {
        document.querySelectorAll('.screen').forEach(s => {
          s.classList.remove('active');
          s.style.display = '';
        });
        const sc = document.getElementById(E.fromScreen || 'screen-village');
        if (sc) { sc.style.display = 'flex'; sc.classList.add('active'); }
      }
    },

    setTool(tool) {
      E.activeTool = tool;
      document.querySelectorAll('[data-edtool]').forEach(b => {
        b.classList.toggle('ed-active', b.dataset.edtool === tool);
      });
    },

    clearMap() {
      if (E.map) E.map.fill(0);
    },

  };

})();
