/* ============================================================================
 * f9_pvp_overlay.js — F9 PvP in-game overlay (Phase 2 render+input, Phase 3 prediction).
 *
 * ISOLATED + OPT-IN. This file is lazy-loaded ONLY by the guarded bootstrap at the end of
 * game.js when the page is opened with the `#f9pvp` hash (or window.F9PVP_FORCE === true).
 * Normal players never load it. It does NOT modify game.js state, F9 single-player, F11, or
 * F12 — it draws into its OWN full-screen canvas layered above the game and talks only to the
 * `window.F9PVP` net module (f9_pvp_net.js).
 *
 * It REUSES the game's own sprite frame-getter `window._f9UnitFrameForOutline(pseudoUnit)` so
 * units render with the real F9 sprites/animation. If that function isn't present it falls back
 * to colored glyph tokens, so the overlay still works standalone.
 *
 *   window.F9PvpOverlay.start()  // open the PvP arena overlay
 *   window.F9PvpOverlay.stop()   // close it and leave the room
 * ========================================================================== */
(function () {
  'use strict';
  if (window.F9PvpOverlay) return;   // already loaded

  // ── constants ────────────────────────────────────────────────────────────
  var NFT_TYPE_MAP = { 1: 'skull', 2: 'archer', 3: 'harpoon_fish', 4: 'shaman', 5: 'pigronke' };
  // F9 movement speed (cells/sec) — mirrors server F9PvpRtsLogic, used for client prediction.
  var BASE_SPEED = 0.86;
  var SPEED_MUL = { skull: 0.86, shaman: 0.72, archer: 1.0, harpoon_fish: 0.79, pigronke: 0.93 };
  function unitSpeed(utype) { return BASE_SPEED * (SPEED_MUL[utype] || 1); }

  // fallback glyph rendering (only if the game's sprite getter is unavailable)
  var UCOLORS = { skull: '#cdd', archer: '#9cf', harpoon_fish: '#7df', shaman: '#c9f', pigronke: '#fb8' };
  var UGLYPH = { skull: 'S', archer: 'A', harpoon_fish: 'H', shaman: 'M', pigronke: 'P' };

  var DEFAULT_DECK = [
    { utype: 'skull', level: 3, tokenId: 0 },
    { utype: 'skull', level: 2, tokenId: 0 },
    { utype: 'pigronke', level: 4, tokenId: 0 },
    { utype: 'archer', level: 3, tokenId: 0 },
    { utype: 'shaman', level: 2, tokenId: 0 }
  ];

  // ── overlay state ─────────────────────────────────────────────────────────
  var root = null, cv = null, ctx = null, bar = null, statusEl = null, resultEl = null;
  var running = false, rafId = 0;
  var COLS = 20, ROWS = 16, CELL_PX = 32, originX = 0, originY = 0;
  var selected = {};                 // id -> true (my selected units)
  var deaths = [];                   // {x,y,t}
  var render = {};                   // id -> {rx, ry}  predicted/smoothed render positions
  var fx = {};                       // id -> {swingStart, lastAction}
  var myCmd = {};                    // id -> {x,y,type}  active local command (for prediction)
  var winnerTeam = -1;
  var lastResult = null;

  // ── DOM build ───────────────────────────────────────────────────────────
  function el(tag, css, parent) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (parent) parent.appendChild(e); return e; }

  function buildDom() {
    root = el('div', 'position:fixed;inset:0;z-index:99999;background:#070b10;font-family:monospace;color:#cde;', document.body);

    bar = el('div', 'position:absolute;top:0;left:0;right:0;height:42px;display:flex;gap:8px;align-items:center;padding:0 10px;background:#0d141d;border-bottom:1px solid #1d2a3a;font-size:12px;z-index:2;', root);
    bar.innerHTML = '<b style="color:#6cf">F9 PvP</b>';

    function mkBtn(label, fn) {
      var b = el('button', 'font-family:monospace;font-size:12px;background:#16263a;color:#cdf;border:1px solid #2a4a6a;padding:5px 10px;border-radius:3px;cursor:pointer;', bar);
      b.textContent = label; b.onclick = fn; return b;
    }
    var btnReady = mkBtn('Ready', function () { window.F9PVP.ready(); setStatus('ready sent…', '#fc8'); });
    var btnStop = mkBtn('Stop (S)', doStop);
    var btnAll = mkBtn('Select all', selectAllMine);
    var spacer = el('span', 'margin-left:auto;display:flex;gap:8px;align-items:center;', bar);
    statusEl = el('span', 'padding:3px 9px;border-radius:10px;background:#3a2a12;color:#fc8;', spacer);
    statusEl.textContent = 'starting…';
    var btnLeave = mkBtn('✕ Leave', function () { window.F9PvpOverlay.stop(); });
    btnLeave.style.background = '#3a1414'; btnLeave.style.borderColor = '#6a2a2a'; btnLeave.style.color = '#f99';

    cv = el('canvas', 'position:absolute;top:42px;left:0;right:0;bottom:0;display:block;background:#0c1a12;cursor:crosshair;image-rendering:pixelated;', root);
    ctx = cv.getContext('2d');

    resultEl = el('div', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;z-index:3;background:rgba(4,8,12,.78);', root);

    wireInput();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    resize();
  }

  function setStatus(txt, color) {
    if (!statusEl) return;
    statusEl.textContent = txt;
    statusEl.style.background = color ? '' : '#16351f';
    statusEl.style.color = color || '#6e8';
    if (color) statusEl.style.background = '#231a10';
  }

  function resize() {
    if (!cv) return;
    var w = window.innerWidth, h = window.innerHeight - 42;
    cv.width = w; cv.height = h;
    COLS = window.F9PVP.getCols(); ROWS = window.F9PVP.getRows();
    var pad = 16;
    CELL_PX = Math.max(8, Math.floor(Math.min((w - pad * 2) / COLS, (h - pad * 2) / ROWS)));
    originX = Math.floor((w - COLS * CELL_PX) / 2);
    originY = Math.floor((h - ROWS * CELL_PX) / 2);
    ctx.imageSmoothingEnabled = false;
  }

  // cell <-> screen
  function cellToPx(cx, cy) { return { x: originX + cx * CELL_PX, y: originY + cy * CELL_PX }; }
  function pxToCell(px, py) { return { x: (px - originX) / CELL_PX, y: (py - originY) / CELL_PX }; }

  // ── input ───────────────────────────────────────────────────────────────
  var dragStart = null, dragNow = null, dragging = false;
  function evCell(ev) { var r = cv.getBoundingClientRect(); return pxToCell(ev.clientX - r.left, ev.clientY - r.top); }

  function wireInput() {
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('mousedown', function (e) {
      var c = evCell(e);
      if (e.button === 2) {           // right-click = pure move (ignore enemies)
        var ids = Object.keys(selected);
        if (ids.length) issueCmd(ids, 'move', c.x, c.y);
        return;
      }
      dragStart = c; dragNow = c; dragging = false;
    });
    cv.addEventListener('mousemove', function (e) {
      if (!dragStart) return;
      dragNow = evCell(e);
      if (Math.abs(dragNow.x - dragStart.x) > 0.3 || Math.abs(dragNow.y - dragStart.y) > 0.3) dragging = true;
    });
    cv.addEventListener('mouseup', function (e) {
      if (e.button !== 0 || !dragStart) { dragStart = null; return; }
      var c = evCell(e), myTeam = window.F9PVP.getMyTeam(), units = window.F9PVP.getUnits();
      if (dragging) {                 // box-select my units
        selected = {};
        var x0 = Math.min(dragStart.x, c.x), x1 = Math.max(dragStart.x, c.x);
        var y0 = Math.min(dragStart.y, c.y), y1 = Math.max(dragStart.y, c.y);
        units.forEach(function (u) { if (u.team === myTeam && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) selected[u.id] = true; });
      } else {                        // click: pick unit, else attack-move selection
        var hit = null, best = 0.7;
        units.forEach(function (u) { if (u.team === myTeam) { var d = Math.hypot(u.x - c.x, u.y - c.y); if (d < best) { best = d; hit = u; } } });
        if (hit) { if (!e.shiftKey) selected = {}; selected[hit.id] = true; }
        else { var ids = Object.keys(selected); if (ids.length) issueCmd(ids, 'amove', c.x, c.y); }
      }
      dragStart = null; dragging = false;
    });
  }

  function onKey(e) {
    if (!running) return;
    if (e.key === 's' || e.key === 'S') doStop();
    else if (e.key === 'Escape') { if (resultEl.style.display === 'flex') hideResult(); }
  }

  function doStop() { var ids = Object.keys(selected); if (ids.length) { window.F9PVP.stop(ids); ids.forEach(function (id) { delete myCmd[id]; }); } }
  function selectAllMine() { selected = {}; var t = window.F9PVP.getMyTeam(); window.F9PVP.getUnits().forEach(function (u) { if (u.team === t) selected[u.id] = true; }); }

  // Issue a command + record it locally so prediction can move own units immediately (Phase 3).
  function issueCmd(ids, type, x, y) {
    if (type === 'move') window.F9PVP.moveTo(ids, x, y);
    else if (type === 'amove') window.F9PVP.attackMoveTo(ids, x, y);
    var t = window.F9PVP.getMyTeam(), units = window.F9PVP.getUnits(), byId = {};
    units.forEach(function (u) { byId[u.id] = u; });
    ids.forEach(function (id) { var u = byId[id]; if (u && u.team === t) myCmd[id] = { x: x, y: y, type: type }; });
  }

  // ── prediction + smoothing (Phase 3) ─────────────────────────────────────
  // Own commanded units advance locally toward their target at the unit's speed (instant feel),
  // then gently reconcile to the authoritative server position. Everything else interpolates.
  var RECONCILE = 0.18;   // pull predicted -> server each frame while predicting
  var SMOOTH = 0.30;      // interpolation for enemy/idle units
  var ARRIVE = 0.18;      // cells; consider a local move command finished within this distance

  function updateRender(units, dt) {
    var myTeam = window.F9PVP.getMyTeam(), live = {};
    for (var i = 0; i < units.length; i++) {
      var u = units[i]; live[u.id] = true;
      var r = render[u.id];
      if (!r) { render[u.id] = { rx: u.x, ry: u.y }; continue; }
      var mine = u.team === myTeam, cmd = myCmd[u.id];
      var predicting = mine && cmd && u.action !== 'attacking';
      if (predicting) {
        // advance toward commanded target locally
        var dx = cmd.x - r.rx, dy = cmd.y - r.ry, d = Math.hypot(dx, dy);
        var step = unitSpeed(u.utype) * dt;
        if (d <= ARRIVE || d < 1e-4) { delete myCmd[u.id]; }
        else if (d <= step) { r.rx = cmd.x; r.ry = cmd.y; }
        else { r.rx += (dx / d) * step; r.ry += (dy / d) * step; }
        // reconcile toward server so client + server never drift apart
        r.rx += (u.x - r.rx) * RECONCILE;
        r.ry += (u.y - r.ry) * RECONCILE;
      } else {
        if (mine && u.action === 'attacking') delete myCmd[u.id];   // server took over (engaged)
        var k = SMOOTH;
        // snap if way off (respawn/teleport/large correction)
        if (Math.hypot(u.x - r.rx, u.y - r.ry) > 2.5) { r.rx = u.x; r.ry = u.y; }
        else { r.rx += (u.x - r.rx) * k; r.ry += (u.y - r.ry) * k; }
      }
    }
    // drop render entries for dead units
    for (var id in render) { if (!live[id]) { delete render[id]; delete fx[id]; delete myCmd[id]; } }
  }

  // ── sprite frame via game's own getter (real F9 sprites), fallback to glyph ─
  function spriteFrame(u) {
    if (typeof window._f9UnitFrameForOutline !== 'function') return null;
    var f = fx[u.id] || (fx[u.id] = { swingStart: 0, lastAction: '' });
    if (u.action === 'attacking' && f.lastAction !== 'attacking') f.swingStart = performance.now();
    f.lastAction = u.action;
    var pseudo = {
      utype: u.utype,
      facing: { dx: u.facing },
      _f9Moving: u.action === 'moving',
      swingStart: u.action === 'attacking' ? f.swingStart : 0,
      guardStart: 0,
      x: u.x, y: u.y, rx: u.x, ry: u.y
    };
    try { return window._f9UnitFrameForOutline(pseudo); } catch (_) { return null; }
  }

  function drawSprite(fr, cx, cy) {
    // game sprite sizes are relative to UNIT_CELL(34px); scale to our CELL_PX.
    var scale = CELL_PX / 34, sz = fr.sprSz * scale, yOff = (fr.yOff || 0) * scale;
    if (!fr.img || !fr.img.complete || !fr.img.naturalWidth) return false;
    if (fr.flip) {
      ctx.save(); ctx.translate(cx, cy + yOff); ctx.scale(-1, 1);
      ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -sz / 2, -sz / 2, sz, sz); ctx.restore();
    } else {
      ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, cx - sz / 2, cy - sz / 2 + yOff, sz, sz);
    }
    return true;
  }

  // ── render loop ───────────────────────────────────────────────────────────
  var lastT = 0;
  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016; lastT = now;

    if (window.F9PVP.getCols() !== COLS || window.F9PVP.getRows() !== ROWS) resize();
    var units = window.F9PVP.getUnits();
    updateRender(units, dt);

    ctx.clearRect(0, 0, cv.width, cv.height);
    drawArena();
    drawCores();

    var myTeam = window.F9PVP.getMyTeam();
    // depth-sort by y so lower units draw on top
    units = units.slice().sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < units.length; i++) drawUnit(units[i], myTeam);

    drawDeaths(now);
    drawDragBox();
    drawBanner();
  }

  function drawArena() {
    var p0 = cellToPx(0, 0), w = COLS * CELL_PX, h = ROWS * CELL_PX;
    ctx.fillStyle = '#0d1c13'; ctx.fillRect(p0.x, p0.y, w, h);
    // mid line
    ctx.strokeStyle = 'rgba(120,180,140,.18)'; ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]); ctx.beginPath();
    ctx.moveTo(p0.x + w / 2, p0.y); ctx.lineTo(p0.x + w / 2, p0.y + h); ctx.stroke(); ctx.setLineDash([]);
    // grid
    ctx.strokeStyle = 'rgba(120,180,140,.06)';
    for (var gx = 0; gx <= COLS; gx++) { var x = p0.x + gx * CELL_PX; ctx.beginPath(); ctx.moveTo(x, p0.y); ctx.lineTo(x, p0.y + h); ctx.stroke(); }
    for (var gy = 0; gy <= ROWS; gy++) { var y = p0.y + gy * CELL_PX; ctx.beginPath(); ctx.moveTo(p0.x, y); ctx.lineTo(p0.x + w, y); ctx.stroke(); }
    ctx.strokeStyle = '#2a4a33'; ctx.lineWidth = 2; ctx.strokeRect(p0.x, p0.y, w, h);
  }

  function drawCores() {
    var myTeam = window.F9PVP.getMyTeam();
    window.F9PVP.getCores().forEach(function (c) {
      var p = cellToPx(c.x, c.y), s = CELL_PX * 0.9, mine = c.team === myTeam;
      if (c.active) {
        ctx.fillStyle = mine ? '#16335f' : '#5f1616';
        ctx.strokeStyle = mine ? '#49f' : '#f55'; ctx.lineWidth = 3;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
        ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(s * 0.26) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('CORE', p.x, p.y);
        var hf = Math.max(0, c.hp / (c.maxHp || 1));
        ctx.fillStyle = '#300'; ctx.fillRect(p.x - s / 2, p.y - s / 2 - 9, s, 5);
        ctx.fillStyle = hf > 0.4 ? '#6e6' : '#e66'; ctx.fillRect(p.x - s / 2, p.y - s / 2 - 9, s * hf, 5);
      } else {
        ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - s / 2, p.y - s / 2); ctx.lineTo(p.x + s / 2, p.y + s / 2);
        ctx.moveTo(p.x + s / 2, p.y - s / 2); ctx.lineTo(p.x - s / 2, p.y + s / 2); ctx.stroke();
      }
    });
  }

  function drawUnit(u, myTeam) {
    var r = render[u.id] || { rx: u.x, ry: u.y };
    var p = cellToPx(r.rx, r.ry), mine = u.team === myTeam;
    var ringColor = mine ? '#49f' : '#f55';
    // selection ring
    if (selected[u.id]) {
      ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, CELL_PX * 0.5, 0, Math.PI * 2); ctx.stroke();
    }
    // team ground ring (so you can always tell sides apart even with sprites)
    ctx.strokeStyle = ringColor; ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + CELL_PX * 0.34, CELL_PX * 0.34, CELL_PX * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    var fr = spriteFrame(u), drew = false;
    if (fr) drew = drawSprite(fr, p.x, p.y);
    if (!drew) {
      var rad = CELL_PX * (u.utype === 'pigronke' ? 0.42 : 0.34);
      ctx.fillStyle = mine ? '#39f' : '#f44';
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#001'; ctx.font = 'bold ' + Math.round(rad) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(UGLYPH[u.utype] || '?', p.x, p.y + 1);
    }
    // hp bar
    var bw = CELL_PX * 0.7, hf = Math.max(0, u.hp / (u.maxHp || 1));
    ctx.fillStyle = '#300'; ctx.fillRect(p.x - bw / 2, p.y - CELL_PX * 0.6, bw, 4);
    ctx.fillStyle = hf > 0.4 ? '#6e6' : '#e66'; ctx.fillRect(p.x - bw / 2, p.y - CELL_PX * 0.6, bw * hf, 4);
    // attack flash
    if (u.action === 'attacking') { ctx.strokeStyle = 'rgba(255,240,140,.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, CELL_PX * 0.46, 0, Math.PI * 2); ctx.stroke(); }
  }

  function drawDeaths(now) {
    deaths = deaths.filter(function (d) { return now - d.t < 480; });
    deaths.forEach(function (d) {
      var k = (now - d.t) / 480, p = cellToPx(d.x, d.y);
      ctx.strokeStyle = 'rgba(255,120,120,' + (1 - k) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, CELL_PX * 0.2 + k * CELL_PX * 0.6, 0, Math.PI * 2); ctx.stroke();
    });
  }

  function drawDragBox() {
    if (!(dragging && dragStart && dragNow)) return;
    var a = cellToPx(dragStart.x, dragStart.y), b = cellToPx(dragNow.x, dragNow.y);
    ctx.strokeStyle = '#ff0'; ctx.setLineDash([5, 3]); ctx.lineWidth = 1;
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.setLineDash([]);
  }

  function drawBanner() {
    var phase = window.F9PVP.getPhase();
    if (phase === 'lobby' || phase === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      var w = COLS * CELL_PX, p0 = cellToPx(0, ROWS / 2 - 0.8);
      ctx.fillRect(p0.x, p0.y, w, CELL_PX * 1.6);
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(CELL_PX * 0.5) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(phase === 'ready' ? 'Opponent found — press Ready' : 'Waiting for opponent…', originX + w / 2, p0.y + CELL_PX * 0.8);
    }
  }

  // ── result / settlement panel (Phase 5) ──────────────────────────────────
  function showResult(res) {
    lastResult = res;
    var myTeam = window.F9PVP.getMyTeam();
    var me = null, opp = null;
    (res.players || []).forEach(function (p) { if (p.team === myTeam) me = p; else opp = p; });
    var won = res.winnerTeam === myTeam, draw = res.winnerTeam < 0;
    var title = draw ? 'DRAW' : (won ? 'VICTORY' : 'DEFEAT');
    var titleColor = draw ? '#fc8' : (won ? '#6e8' : '#f88');

    function statBlock(p, label) {
      if (!p) return '';
      var sign = p.eloDelta >= 0 ? '+' : '';
      return '<div style="flex:1;min-width:150px;padding:10px;background:#0c1420;border:1px solid #1d2a3a;border-radius:6px;">'
        + '<div style="color:#9bf;margin-bottom:6px;">' + label + '</div>'
        + '<div>kills: <b>' + p.kills + '</b></div>'
        + '<div>dmg: <b>' + p.dmgDealt + '</b></div>'
        + '<div>survivors: <b>' + p.survivors + '</b> / lost ' + p.unitsLost + '</div>'
        + '<div>ELO: <b>' + p.eloAfter + '</b> <span style="color:' + (p.eloDelta >= 0 ? '#6e8' : '#f88') + '">(' + sign + p.eloDelta + ')</span></div>'
        + '<div>XP preview: <b>' + p.xpPreview + '</b></div>'
        + (p.deckVerified ? '' : '<div style="color:#a96;font-size:11px;margin-top:4px;">deck unverified (trusted)</div>')
        + '</div>';
    }

    resultEl.innerHTML = '';
    var box = el('div', 'width:min(620px,92vw);background:#0a1018;border:1px solid #233;border-radius:10px;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,.6);', resultEl);
    box.innerHTML =
      '<div style="font-size:30px;font-weight:bold;text-align:center;color:' + titleColor + ';letter-spacing:2px;">' + title + '</div>'
      + '<div style="text-align:center;color:#789;font-size:12px;margin:4px 0 16px;">'
      + (res.reason === 'player_left' ? 'opponent left' : res.reason === 'core' ? 'enemy core destroyed' : 'enemy units wiped')
      + ' · ' + (res.durationMs / 1000).toFixed(1) + 's · match ' + res.matchId + '</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;">' + statBlock(me, 'You') + statBlock(opp, 'Opponent') + '</div>'
      + '<div style="text-align:center;color:#678;font-size:11px;margin-top:14px;">ELO/XP shown are provisional previews — on-chain XP is claimed via the normal signed flow.</div>';
    var row = el('div', 'display:flex;gap:10px;justify-content:center;margin-top:16px;', box);
    var again = el('button', 'font-family:monospace;font-size:13px;background:#16335f;color:#cdf;border:1px solid #2a4a6a;padding:8px 18px;border-radius:4px;cursor:pointer;', row);
    again.textContent = 'Find new match';
    again.onclick = function () { hideResult(); rematch(); };
    var close = el('button', 'font-family:monospace;font-size:13px;background:#1a2230;color:#9ab;border:1px solid #2a3a4a;padding:8px 18px;border-radius:4px;cursor:pointer;', row);
    close.textContent = 'Exit';
    close.onclick = function () { window.F9PvpOverlay.stop(); };
    resultEl.style.display = 'flex';
  }
  function hideResult() { resultEl.style.display = 'none'; }

  // ── net wiring ────────────────────────────────────────────────────────────
  function wireNet() {
    var N = window.F9PVP;
    N.onMatchReady = function () { setStatus('opponent found', '#fc8'); };
    N.onGameStart = function () { winnerTeam = -1; lastResult = null; render = {}; myCmd = {}; selected = {}; hideResult(); setStatus('PLAYING'); };
    N.onUnitDied = function (e) { deaths.push({ x: e.x, y: e.y, t: performance.now() }); };
    N.onMatchEnd = function (e) {
      winnerTeam = e.winnerTeam;
      var mine = e.winnerTeam === window.F9PVP.getMyTeam();
      setStatus(mine ? 'YOU WIN' : (e.winnerTeam < 0 ? 'DRAW' : 'YOU LOSE'), mine ? null : '#f88');
    };
    N.onMatchResult = function (res) { showResult(res); };
    N.onPlayerLeft = function () { setStatus('opponent left', '#fc8'); };
    N.onError = function (err) { setStatus('error: ' + (err && err.message || err), '#f88'); };
  }

  // ── deck / address autodetect ─────────────────────────────────────────────
  function detectAddress() {
    try { if (window.Wallet && window.Wallet.getAddress) { var a = window.Wallet.getAddress(); if (a) return String(a); } } catch (_) {}
    if (window.F9PVP_ADDRESS) return String(window.F9PVP_ADDRESS);
    return '0xtest' + Math.floor(Math.random() * 1e6);
  }

  // Build the real NFT deck if the game exposes it; otherwise a default test deck.
  function detectDeck() {
    return new Promise(function (resolve) {
      if (Array.isArray(window.F9PVP_DECK) && window.F9PVP_DECK.length) return resolve(window.F9PVP_DECK);
      try {
        var addr = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || null;
        var ids = (addr && window.BarracksNFT && window.BarracksNFT.getBattleSquad) ? window.BarracksNFT.getBattleSquad(addr) : [];
        if (addr && ids && ids.length && window.BarracksNFT.loadDeckUnits) {
          window.BarracksNFT.loadDeckUnits(addr, ids).then(function (units) {
            var deck = (units || []).map(function (nu) {
              var ut = NFT_TYPE_MAP[nu.utype] || (typeof nu.utype === 'string' ? nu.utype : null);
              if (!ut) return null;
              return { utype: ut, level: nu.level || 0, tokenId: Number(nu.tokenId) || 0 };
            }).filter(Boolean);
            resolve(deck.length ? deck : DEFAULT_DECK);
          }).catch(function () { resolve(DEFAULT_DECK); });
          return;
        }
      } catch (_) {}
      resolve(DEFAULT_DECK);
    });
  }

  function rematch() {
    setStatus('finding match…', '#fc8');
    detectDeck().then(function (deck) {
      window.F9PVP.join({ address: detectAddress(), deck: deck }).then(function (room) {
        if (room) setStatus('joined — waiting', '#fc8');
        else setStatus('join failed', '#f88');
      });
    });
  }

  // ── public API ────────────────────────────────────────────────────────────
  window.F9PvpOverlay = {
    start: function () {
      if (running) return;
      if (!window.F9PVP) { console.error('[F9PvpOverlay] F9PVP net module not loaded'); return; }
      running = true;
      buildDom();
      wireNet();
      setStatus('connecting…', '#fc8');
      window.F9PVP.connect().then(function (ok) {
        if (!ok) { setStatus('connect failed', '#f88'); return; }
        rematch();
      });
      lastT = 0; rafId = requestAnimationFrame(frame);
    },
    stop: function () {
      running = false;
      if (rafId) cancelAnimationFrame(rafId), rafId = 0;
      try { window.F9PVP && window.F9PVP.leave(); } catch (_) {}
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = cv = ctx = bar = statusEl = resultEl = null;
      selected = {}; render = {}; fx = {}; myCmd = {}; deaths = [];
      if (location.hash.indexOf('f9pvp') !== -1) { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} }
    },
    isRunning: function () { return running; }
  };
})();
