/* ============================================================================
 * f9_pvp_live.js — F9 floor → MULTIPLAYER (SERVER-AUTHORITATIVE), tikrame F9.
 *
 * ISOLATED + OPT-IN (#f9live). Single-player F9 byte-for-byte nepaliestas (visi pakeitimai
 * game.js'e gated `window._f9pvpLive`).
 *
 * ARCHITEKTŪRA (industrijos standartas — žr. „Don't use Lockstep, Client-Server won"):
 *   • SERVERIS = authoritative: sukasi TIKRAS F9 simas (judėjimas/kova/AI, 30Hz), valdo VISUS unitus,
 *     broadcastina būseną per Colyseus schema (`room.state.units`).
 *   • ABU KLIENTAI = SIMETRIŠKI: jokio lokalaus simo. Tik (a) renderina `room.state.units` (mirror
 *     unitai lokalioj F9 scenoj + interpoliacija), (b) siunčia `cmd` serveriui. Kiekvienas mato SAVUS
 *     kaip ally (mėlyna), oponentą kaip enemy (raudona) → jokios rolių painiavos, jokio host-throttle,
 *     sąžininga, marker'iai nepersikelia.
 *
 * Gudrybė minimaliam game.js blast-radius: `isGuest()` grąžina `active()` (true ABIEM PvP klientams),
 * tad esami game.js hooks (`if(isGuest()) guestTick` loop'e + `if(isGuest()) routeCommand` komandose)
 * veikia be pakeitimų — guestTick=netTick (render iš serverio), routeCommand=sendCommand (→ serveris).
 * ========================================================================== */
(function () {
  'use strict';
  if (window.F9PvpLive) return;

  var B = null;                 // window.__F9 bridge
  var on = false;
  var mySid = '', myTeam = -1;
  var started = false, simInited = false;
  var uidc = 0;
  var _mir = {};                // serverUnitId -> local render mirror unit
  var statusEl = null, hudEl = null;

  function S() { return B ? B.S : (window.S || null); }
  function rndAddr() { return '0xlive' + Math.floor(Math.random() * 1e6); }
  function pnow() { return (window.performance ? performance.now() : Date.now()); }
  function _room() { return window.F9PVP && window.F9PVP.room; }

  // ── status UI ──
  function _ui() {
    if (statusEl) return;
    statusEl = document.createElement('div');
    statusEl.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99998;font-family:monospace;font-size:13px;font-weight:700;padding:5px 14px;border-radius:12px;background:#231a10;color:#fc8;border:1px solid #4a3a1a;pointer-events:none;letter-spacing:.5px;';
    document.body.appendChild(statusEl);
    hudEl = document.createElement('div');
    hudEl.style.cssText = 'position:fixed;top:38px;left:50%;transform:translateX(-50%);z-index:99998;font-family:monospace;font-size:11px;padding:3px 10px;border-radius:10px;background:rgba(8,12,18,.7);color:#cde;border:1px solid #234;pointer-events:none;';
    document.body.appendChild(hudEl);
  }
  function _status(t, c) { _ui(); statusEl.textContent = 'F9 PvP · ' + t; statusEl.style.color = c || '#6e8'; }
  function _hud(t) { _ui(); hudEl.textContent = t; }

  // ── pilno ekrano overlay (connecting / pabaiga) ──
  var screenEl = null;
  function _clearScreen() { if (screenEl && screenEl.parentNode) screenEl.parentNode.removeChild(screenEl); screenEl = null; }
  function _spinKf() {
    if (document.getElementById('f9sp-kf')) return;
    var st = document.createElement('style'); st.id = 'f9sp-kf';
    st.textContent = '@keyframes f9sp{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  function _connectingScreen(text) {
    _clearScreen(); _spinKf();
    screenEl = document.createElement('div');
    screenEl.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(8,10,16,.93);color:#cde;font-family:monospace;gap:16px;';
    screenEl.innerHTML =
      '<div style="font-size:24px;font-weight:800;letter-spacing:1px;color:#fc8;">⚔️ F9 PvP</div>' +
      '<div id="f9pvp-cs-txt" style="font-size:14px;opacity:.85;">' + text + '</div>' +
      '<div style="width:34px;height:34px;border:3px solid #2a3240;border-top-color:#fc8;border-radius:50%;animation:f9sp .9s linear infinite;"></div>';
    document.body.appendChild(screenEl);
  }
  function _connectingText(t) { var e = document.getElementById('f9pvp-cs-txt'); if (e) e.textContent = t; else _connectingScreen(t); }
  function _endScreen(kind, subtitle) {
    _clearScreen();
    var title = kind === 'win' ? 'VICTORY' : (kind === 'lose' ? 'DEFEAT' : 'DRAW');
    var col = kind === 'win' ? '#6e8' : (kind === 'lose' ? '#f77' : '#fc8');
    var emo = kind === 'win' ? '🏆' : (kind === 'lose' ? '💀' : '⚔️');
    screenEl = document.createElement('div');
    screenEl.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(6,8,12,.9);color:#cde;font-family:monospace;gap:18px;';
    screenEl.innerHTML =
      '<div style="font-size:54px;">' + emo + '</div>' +
      '<div style="font-size:42px;font-weight:900;letter-spacing:3px;color:' + col + ';text-shadow:0 2px 12px rgba(0,0,0,.6);">' + title + '</div>' +
      (subtitle ? '<div style="font-size:14px;opacity:.8;">' + subtitle + '</div>' : '') +
      '<button id="f9pvp-back" style="margin-top:10px;font-family:monospace;font-size:15px;font-weight:700;padding:11px 28px;border-radius:8px;background:#1c2a3a;color:#cdf;border:1px solid #4a6;cursor:pointer;">← Back to menu</button>';
    document.body.appendChild(screenEl);
    var btn = document.getElementById('f9pvp-back');
    if (btn) btn.onclick = _backToMenu;
  }
  function _backToMenu() {
    try { stop(); } catch (_) {}
    try { location.href = location.pathname + location.search; } catch (_) { location.reload(); }
  }

  // ── launch (server-authoritative: JOKIO relay) ──
  function launch(opts) {
    opts = opts || {};
    B = window.__F9;
    if (!B) { console.error('[F9Live] __F9 bridge missing'); return; }
    if (!window.F9PVP) { console.error('[F9Live] F9PVP missing'); return; }
    on = true; started = false; simInited = false; _ended = false; _mir = {};
    _status('connecting…', '#fc8');
    _connectingScreen('Connecting to server…');
    var N = window.F9PVP;
    N.connect(opts.endpoint).then(function (ok) {
      if (!ok) { _status('connect failed', '#f88'); _connectingText('⚠ Connect failed — server offline?'); return null; }
      _connectingText('Looking for an opponent…');
      return N.join({ address: opts.address || rndAddr(), deck: opts.deck || [] });   // NO relay → serveris simuliuoja
    }).then(function (room) {
      if (!room) { _status('join failed', '#f88'); _connectingText('⚠ Join failed'); return; }
      mySid = room.sessionId;
      _wireRoom(room);
      _status('waiting for opponent…', '#fc8');
      _connectingText('Waiting for an opponent to join…');
    });
  }

  function _wireRoom(room) {
    room.onMessage('enough_joined', function () { _status('opponent found — ready…', '#fc8'); _connectingText('Opponent found — starting…'); try { room.send('ready'); } catch (_) {} });
    room.onMessage('match_start', function (e) { _onStart(e || {}); });
    room.onMessage('miss', function (e) {   // serverio miss → pilkas „MISS" virš taikinio
      if (!e) return;
      try { if (B.spawnDmgNumber) B.spawnDmgNumber(e.x, e.y, 'MISS', '#c8d2e0', 13, 'miss'); } catch (_) {}
    });
    room.onMessage('shot', function (e) {   // ranged: windup anim DABAR → po fireMs projektilas → travel (etapai sklandūs)
      if (!e) return;
      try { _attackAnim(_mir[e.fromId]); } catch (_) {}
      var fire = Math.max(0, +e.fireMs || 0);
      setTimeout(function () { try { _spawnProjectile(_mir[e.fromId], _mir[e.toId], e.utype); } catch (_) {} }, fire);
    });
    room.onMessage('melee', function (e) {   // melee: swing animacija (žala server-side po fireMs)
      if (!e) return;
      try { _attackAnim(_mir[e.id]); } catch (_) {}
      // Pigronke (Hog Rider): spear-sweep AOE vizualas ties smūgio kadru (fireMs) — kaip single-player.
      if (e.utype === 'pigronke' && B.spawnSpearSweep) {
        var id = e.id, fire = Math.max(0, +e.fireMs || 540);
        setTimeout(function () {
          var p = _mir[id]; if (!p || !p.alive) return;
          var fdx = (p.facing && p.facing.dx) ? p.facing.dx : 1;
          try { B.spawnSpearSweep((p.rx !== undefined ? p.rx : p.x), (p.ry !== undefined ? p.ry : p.y), fdx, 1.20, 0.65); } catch (_) {}
        }, fire);
      }
    });
    room.onMessage('match_end', function (e) {
      var draw = e && !e.winnerSid;
      var mine = e && e.winnerSid === mySid;
      _status(mine ? 'YOU WIN 🏆' : (draw ? 'DRAW' : 'YOU LOSE'), mine ? '#6e8' : '#f88');
      _endScreen(draw ? 'draw' : (mine ? 'win' : 'lose'),
                 draw ? '' : (mine ? 'Enemy squad wiped out' : 'Your squad was wiped out'));
    });
  }

  function _onStart(e) {
    started = true;
    var room = _room();
    var me = (room && room.state && room.state.players && room.state.players.get) ? room.state.players.get(mySid) : null;
    myTeam = me ? me.team : 0;
    window._f9pvpLive = true;
    window._f9pvpMyTeam = myTeam;
    _status('PLAYING', '#6e8');
    _clearScreen();
    B.goToFloor(9);   // įeinam į TIKRĄ F9 floor — abu klientai renderins serverio būseną
  }

  function active() { return on && started && S() && S().floor === 9; }

  // ── PvP arena: pilnas 40×24 (sutampa su serveriu, užpildo ekraną → BE juodos tuštumos) + dekoracijos ──
  // Fiksuotas kliūčių išdėstymas 40×24 — naudojamas IR renderiui (čia) IR serverio kolizijai
  // (F9PvpRoom.ts PVP_OBSTACLES — PRIVALO sutapti!). [tipas, x, y]. Dekoracijos key = "y,x" (row,col).
  // Vengiam spawn'ų (x14/x26 @y12) + centro lane (y10–14), kad neblokuotų starto/susidūrimo.
  var PVP_DECO = [
    // medžiai (tree3 = apvali kolizija)
    ['tree3', 4, 3], ['tree3', 8, 20], ['tree3', 33, 4], ['tree3', 36, 19],
    ['tree3', 20, 2], ['tree3', 19, 22], ['tree3', 3, 11], ['tree3', 37, 12],
    // akmenys (boulder = apvali kolizija)
    ['boulder1', 12, 5], ['boulder1', 28, 18], ['boulder1', 13, 19], ['boulder1', 27, 5],
    ['boulder1', 20, 7], ['boulder1', 20, 17],
    // krūmai (BE kolizijos — tik tekstūra)
    ['bush1', 7, 8], ['bush2', 32, 14], ['bush1', 24, 21], ['bush2', 16, 4]
  ];
  function _pvpArena() {
    if (!B.setArena) return;
    try {
      B.setArena(40, 24);
      var deco = {};
      PVP_DECO.forEach(function (o) { deco[o[2] + ',' + o[1]] = o[0]; });   // key = "y,x" (render = row,col)
      S().decorations = deco;
    } catch (e) { console.error('[F9Live] _pvpArena', e); }
  }

  // ── netTick: ABU klientai renderina serverio būseną (kviečiama per game.js guestTick hook) ──
  function netTick(now) {
    if (!active()) return;
    var s = S();
    if (!simInited) {
      if (Array.isArray(s.units)) s.units = s.units.filter(function (u) { return u && u.team === 0; });   // tik hero
      _pvpArena();
      simInited = true;
    }
    _syncFromServer(now);
    _centerCam();
  }

  // utype → ranged shot cooldown (ms) vizualui (atitinka serverio cd)
  var _SHOT_CD = { archer: 5000, harpoon_fish: 3600, shaman: 3000, ronhood: 4500, ghost: 3000 };
  function _isRanged(t) { return t === 'archer' || t === 'harpoon_fish' || t === 'ronhood' || t === 'shaman' || t === 'ghost'; }

  function _syncFromServer(now) {
    var s = S(); var room = _room();
    if (!room || !room.state || !room.state.units || !room.state.units.forEach) return;
    var seen = {};
    room.state.units.forEach(function (su, id) {
      seen[id] = 1;
      var mine = (su.owner === mySid);
      var m = _mir[id];
      if (!m) {
        var a = B.getEditorEnemyArchetype ? B.getEditorEnemyArchetype(su.utype) : null;
        m = B.mkUnit(B.nextEditorUnitId ? B.nextEditorUnitId() : (800000 + (++uidc)), 1, su.x, su.y, su.faceDx, a);
        m._pvpId = id; m.rx = su.x; m.ry = su.y; m.stack = 1;
        m._ix0 = m._ix1 = su.x; m._iy0 = m._iy1 = su.y; m._it = now;
        _mir[id] = m; s.units.push(m);
      }
      // nuosavybė + IŠVAIZDA (savi = ally/mėlyna + selectable; priešas = enemy/raudona)
      m._pvpOwner = su.owner; m._pvpTeam = su.team; m.utype = su.utype;
      m.isEditorEnemy = mine;
      m._f9Enemy = !mine;     // PvP'e enemy AI nesukamas (loop guestTick šaka) → tik vizualas
      // hp + žalos FX
      var hpDropped = (m.hp != null && su.hp < m.hp);
      if (hpDropped) { try { B.spawnDmgNumber(m.rx, m.ry, '-' + (m.hp - su.hp), '#fff', 16, mine ? 'taken' : 'normal'); } catch (_) {} m.hitFlash = 1; }
      m.hp = su.hp; m.maxHp = su.maxHp;
      var wasAlive = m.alive;
      m.alive = !!su.alive;
      if (wasAlive && !m.alive) { if (!m._f9DiedAt) m._f9DiedAt = pnow(); try { B.spawnDeath(m.rx, m.ry, mine ? '#49f' : '#c33'); } catch (_) {} }
      else if (hpDropped && m.utype === 'ghost' && B.f9GhostHurtFx) { try { B.f9GhostHurtFx(m); } catch (_) {} }   // ghost dmg-take → ektoplazmos lašiukai
      m.facing = { dx: su.faceDx || 1, dy: 0 };
      var moving = (su.cmd === 'move' || su.cmd === 'attackmove');
      m._f9Moving = moving;
      // Judėjimo kryptis IŠ pozicijos delta (NE tik faceDx) — kad 4-kryptiniai sprite'ai (ronhood ir kt.)
      // turėtų teisingą up/down/diagonalę walk animaciją. faceDx davė tik horizontalę → aukštyn neveikė.
      if (m._psx != null) {
        var ddx = su.x - m._psx, ddy = su.y - m._psy;
        if (moving && (Math.abs(ddx) > 0.0015 || Math.abs(ddy) > 0.0015)) {
          var dl = Math.hypot(ddx, ddy) || 1;
          m._f9LastDirX = ddx / dl; m._f9LastDirY = ddy / dl;
        }
      }
      m._psx = su.x; m._psy = su.y;
      // pozicija — laiko-pagrindo entity interpoliacija (glodu tarp serverio patch'ų ~20Hz)
      var dHard = Math.hypot(su.x - m.rx, su.y - m.ry);
      if (dHard > 3) {
        m.rx = su.x; m.ry = su.y; m._ix0 = m._ix1 = su.x; m._iy0 = m._iy1 = su.y; m._it = now;
      } else {
        if (m._ix1 !== su.x || m._iy1 !== su.y) {
          m._ix0 = (m.rx != null ? m.rx : su.x); m._iy0 = (m.ry != null ? m.ry : su.y);
          m._ix1 = su.x; m._iy1 = su.y; m._it = now;
        }
        var span = (1000 / 20) * 1.4;   // patchRate ~50ms (20Hz) + jitter atsarga
        var aa = m._it ? Math.min(1, (now - m._it) / span) : 1;
        m.rx = m._ix0 + (m._ix1 - m._ix0) * aa;
        m.ry = m._iy0 + (m._iy1 - m._iy0) * aa;
      }
      // x/y = LOGINĖ grid celė (integer) — kaip single-player; reikia deco/occlusion lookup'ams
      // (_f9UnitOccluded, _f9CellBlocked naudoja S.decorations[uy+','+ux] su integer raktais). rx/ry = glodi.
      m.x = Math.round(su.x); m.y = Math.round(su.y);
      // atakos animacija + projektilas valdomi serverio 'shot'/'melee' žinučių (žr. _wireRoom) — ne čia
      // target reticle: serverio targetId → lokalus _f9EngageTarget → render'is piešia X ant puolamo priešo
      m._f9EngageTarget = (su.targetId && (su.cmd === 'attack' || su.cmd === 'attackmove')) ? (_mir[su.targetId] || null) : null;
      m._lastCmd = su.cmd;
    });
    // dingę unitai
    for (var id2 in _mir) {
      if (!seen[id2]) { var mm = _mir[id2]; mm.alive = false; if (!mm._f9DiedAt) mm._f9DiedAt = pnow(); delete _mir[id2]; }
    }
  }

  // Windup (atakos) animacija per utype — kviečiama iš serverio 'shot'/'melee' (iššovimo PRADŽIOJ),
  // tada projektilas po fireMs → visi etapai (windup → iššovimas → skrydis → žala) sklandūs ir sutampa.
  function _attackAnim(m) {
    if (!m) return;
    var now = pnow(), t = m.utype;
    if (t === 'ghost') m.ghostAttackStart = now;
    else if (t === 'archer' || t === 'harpoon_fish' || t === 'ronhood') m.hfishThrowStart = now;
    else m.swingStart = now;   // shaman cast + melee swing (skull/pigronke)
  }

  // Projektilo spawn iš serverio 'shot' žinutės — sutampa su serverio žalos laiku (greitis 10.5 cps abiem).
  function _spawnProjectile(shooter, target, utype) {
    if (!shooter || !target) return;
    if (utype === 'shaman') {
      if (!B.spawnShamanProjectile) return;
      var mx = (shooter.rx !== undefined) ? shooter.rx : shooter.x, my = (shooter.ry !== undefined) ? shooter.ry : shooter.y;
      var tx = (target.rx !== undefined) ? target.rx : target.x, ty = (target.ry !== undefined) ? target.ry : target.y;
      try { B.spawnShamanProjectile(mx, my, tx, ty, 1, false, shooter._nftLevel || 0); } catch (_) {}
    } else if (B.spawnF9RangedShot) {
      try { B.spawnF9RangedShot(shooter, target, utype, 1); } catch (_) {}
      if (utype === 'ghost') {   // muzzle flash + recoil (kaip single-player — be jo ghost šūvis atrodė plokščiai)
        shooter._ghostRecoil = pnow();
        shooter._ghostRecoilDir = -((shooter.facing && shooter.facing.dx) ? shooter.facing.dx : 1);
      }
    }
  }

  // ── komanda: ABU klientai siunčia SERVERIUI (server-authoritative) ──
  function sendCommand(action, units, tx, ty) {
    if (!active()) return false;
    var ids = [];
    (units || []).forEach(function (u) { if (u && u._pvpId && u._pvpOwner === mySid) ids.push(u._pvpId); });
    if (ids.length) {
      try { window.F9PVP.room.send('cmd', { action: action, ids: ids, x: tx, y: ty }); } catch (_) {}
      // lokalus marker'is SAVO ekrane (komandos feedback) — oponentas to nemato (jis renderina tik serverio unitus)
      try { if (B._f9PushClickMarker) B._f9PushClickMarker(tx, ty, units, action === 'attackmove' ? 'amove' : false); } catch (_) {}
    }
    return true;
  }

  // ── focus-fire: pulti SPECIFINĮ priešo unitą (dešinys-klikas ant priešo) → serveriui ──
  function sendAttack(units, enemy) {
    if (!active() || !enemy || !enemy._pvpId) return false;
    var ids = [];
    (units || []).forEach(function (u) { if (u && u._pvpId && u._pvpOwner === mySid) ids.push(u._pvpId); });
    if (!ids.length) return true;
    var ex = (enemy.rx !== undefined) ? enemy.rx : enemy.x;
    var ey = (enemy.ry !== undefined) ? enemy.ry : enemy.y;
    try { window.F9PVP.room.send('cmd', { action: 'attack', ids: ids, targetId: enemy._pvpId, x: ex, y: ey }); } catch (_) {}
    try { if (B._f9PushClickMarker) B._f9PushClickMarker(ex, ey, units, true); } catch (_) {}   // raudonas attack marker
    return true;
  }

  // ── kamera: kadruojam VISUS pvp unitus (matosi abi komandos) ──
  var _camCx = -1, _camCy = -1;
  function _centerCam() {
    var s = S(); if (!s || !s.cam) return;
    var cv = document.getElementById('canvas'); if (!cv) return;
    var cxs = 0, cys = 0, n = 0;
    s.units.forEach(function (u) {
      if (u && u.alive && u._pvpId) { cxs += (u.rx + 0.5) * B.CELL; cys += (u.ry + 0.5) * B.CELL; n++; }
    });
    if (!n) return;
    var tx = cxs / n - cv.width / 2, ty = cys / n - cv.height / 2;
    if (_camCx < 0) { _camCx = tx; _camCy = ty; } else { _camCx += (tx - _camCx) * 0.12; _camCy += (ty - _camCy) * 0.12; }
    s._camManualLock = true;
    s.cam.tx = _camCx; s.cam.ty = _camCy; s.cam.x = _camCx; s.cam.y = _camCy;
    _hud('YOU = blue · enemy = red · ' + n + ' units');
  }

  var _ended = false;
  function stop() {
    on = false; started = false; simInited = false; _ended = false;
    window._f9pvpLive = false; window._f9pvpMyTeam = null;
    try { window.F9PVP && window.F9PVP.leave(); } catch (_) {}
    _mir = {};
    if (statusEl && statusEl.parentNode) statusEl.parentNode.removeChild(statusEl);
    if (hudEl && hudEl.parentNode) hudEl.parentNode.removeChild(hudEl);
    statusEl = hudEl = null;
    _clearScreen();
  }

  window.F9PvpLive = {
    launch: launch, stop: stop,
    isActive: active,
    netTick: netTick,
    sendCommand: sendCommand,
    sendAttack: sendAttack,
    // ── back-compat shim'ai (game.js hooks naudoja šituos; abu klientai = „guest"-stiliaus) ──
    isHost: function () { return false; },
    isGuest: function () { return active(); },   // true ABIEM → loop renderina, NEsukа lokalaus simo
    guestTick: netTick,                          // game.js: if(isGuest()) guestTick(now) → render iš serverio
    routeCommand: function (type, units, tx, ty) { return sendCommand(type, units, tx, ty); },
    hostTick: function () {},                    // nebenaudojama (serveris simuliuoja)
  };
})();
