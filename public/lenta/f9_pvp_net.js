/* ============================================================================
 * f9_pvp_net.js — F9 PvP networking client (ISOLATED adapter).
 *
 * Standalone module for the lenta/PewPew Saga page. It does NOT touch game.js,
 * floor12_merge.js, or any existing F9/F11/F12 code. It only exposes a global
 * `window.F9PVP` API that the game/overlay/test page opts in to.
 *
 * Talks to the Colyseus `f9_pvp_room` (lenta-pvp-server/src/rooms/F9PvpRoom.ts).
 * Server is AUTHORITATIVE: this client sends commands and renders server state.
 * This module is a thin ADAPTER — it maps the server schema fields
 * (faceDx, cmd, …) to the field names the renderer expects (facing, action, …)
 * and translates server events (enough_joined / match_start / match_end / died /
 * melee / shot / hit) to the F9PVP.on* hooks.
 *
 * Protocol (matches F9PvpRoom):
 *   send 'ready'                                    → toggle ready
 *   send 'cmd' { action:'move'|'attackmove'|'stop', ids:[unitId], x, y }
 *   recv 'enough_joined' {count}                    → onMatchReady
 *   recv 'match_start'   {startedAt,seed}           → onGameStart
 *   recv 'match_end'     {winnerSid}                → onMatchEnd (→ winnerTeam)
 *   recv 'died'  {id,by}                            → onUnitDied (x/y looked up)
 *   recv 'melee' {id,utype,toId}                    → onMelee
 *   recv 'shot'  {fromId,toId,utype,durMs}          → onShot
 *   recv 'hit'   {id,dmg,by}                        → onHit
 *
 * Coordinates are in GRID CELLS (float) — arena 40×24 (server ARENA_W/H).
 * ========================================================================== */
(function () {
  'use strict';

  // Lokalus self-contained colyseus.js@0.15 browser bundle (Buffer polyfilled per esbuild).
  // CDN dist/colyseus.js vanilla <script> krenta su „Buffer is not defined" → naudojam savo bundle.
  var COLYSEUS_CDN = 'colyseus.browser.js';
  var ROOM_NAME = 'f9_pvp_room';
  var ARENA_COLS = 80, ARENA_ROWS = 24;   // = server ARENA_W / ARENA_H (2× plotis — horizontalus castle siege)

  function defaultEndpoint() {
    if (typeof window !== 'undefined' && window.F9PVP_ENDPOINT) return window.F9PVP_ENDPOINT;
    // URL param override (?ep=wss://...) — naudojama tuneliuotam cross-country testui (draugas kitoj šaly
    // pasiekia šio PC serverį per viešą wss tunelį). Priimam tik ws/wss.
    try {
      var qp = new URLSearchParams(window.location.search).get('ep');
      if (qp && /^wss?:\/\//i.test(qp)) return qp;
    } catch (_) {}
    var host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    if (host === 'localhost' || host === '127.0.0.1') return 'ws://localhost:2567';
    // Production fallback — override anytime via window.F9PVP_ENDPOINT before connect().
    return 'wss://de-fra-f8820c12.colyseus.cloud';
  }

  // server cmd.action <- renderer command type
  function actionFor(type) {
    if (type === 'amove' || type === 'attackmove') return 'attackmove';
    if (type === 'stop') return 'stop';
    return 'move';
  }
  // renderer `action` <- server unit.cmd
  function renderAction(cmd) {
    if (cmd === 'attack') return 'attacking';
    if (cmd === 'move' || cmd === 'attackmove') return 'moving';
    return 'idle';
  }

  var F9PVP = {
    // ── connection state ──
    client: null,
    room: null,
    connected: false,
    myTeam: -1,
    lastError: null,
    lastResult: null,

    // ── event hooks (assign functions; all optional) ──
    onMatchReady: null,   // enough players joined
    onGameStart: null,    // (e:{seed,startedAt}) sim started, units spawned
    onUnitDied: null,     // (e:{id,x,y,team,utype,by})
    onMatchEnd: null,     // (e:{winnerTeam,winnerSid,reason})
    onMatchResult: null,  // (e) settlement summary (FAZA D/E) — not sent yet
    onPlayerLeft: null,   // (e:{sessionId})
    onStateChange: null,  // (state) raw colyseus state, every patch
    onMelee: null,        // (e:{id,utype,toId})    — melee swing FX
    onShot: null,         // (e:{fromId,toId,utype,durMs}) — ranged projectile FX
    onHit: null,          // (e:{id,dmg,by})        — damage taken FX
    onError: null,        // (err)

    // ── lib loading ──
    _loadLib: function () {
      return new Promise(function (resolve, reject) {
        if (typeof window !== 'undefined' && window.Colyseus) return resolve(window.Colyseus);
        var s = document.createElement('script');
        s.src = COLYSEUS_CDN;
        s.async = true;
        s.onload = function () {
          if (window.Colyseus) resolve(window.Colyseus);
          else reject(new Error('colyseus.js loaded but window.Colyseus missing'));
        };
        s.onerror = function () { reject(new Error('Failed to load colyseus.js from ' + COLYSEUS_CDN)); };
        document.head.appendChild(s);
      });
    },

    // ── connect to server ──
    connect: function (endpoint) {
      var self = this;
      return this._loadLib().then(function (Colyseus) {
        var ep = endpoint || defaultEndpoint();
        ep = ep.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
        self.client = new Colyseus.Client(ep);
        console.log('[F9PVP] client ready endpoint=' + ep);
        return true;
      }).catch(function (e) {
        self.lastError = e;
        console.error('[F9PVP] connect failed', e);
        if (self.onError) self.onError(e);
        return false;
      });
    },

    // ── join / create a match ──
    // opts: { address, deck:[{utype,level,tokenId}], combat? }
    // (deck is forwarded for forward-compat; current server spawns DEFAULT_SQUAD.)
    join: function (opts) {
      var self = this;
      opts = opts || {};
      if (!this.client) {
        return this.connect().then(function (ok) { return ok ? self.join(opts) : null; });
      }
      var joinOpts = {
        address: String(opts.address || ''),
        deck: Array.isArray(opts.deck) ? opts.deck : []
      };
      if (opts.combat === false) joinOpts.combat = false;   // test isolation only
      if (opts.entryFee > 0) joinOpts.entryFee = Math.floor(opts.entryFee);  // staked mode (creator sets it)
      if (opts.relay) joinOpts.relay = true;                 // C3 host-authority relay režimas (#f9live)
      return this.client.joinOrCreate(ROOM_NAME, joinOpts).then(function (room) {
        self.room = room;
        self.connected = true;
        self.myTeam = -1;
        self._wire(room);
        console.log('[F9PVP] joined room ' + room.id);
        return room;
      }).catch(function (e) {
        self.lastError = e;
        self.connected = false;
        console.error('[F9PVP] join failed', e);
        if (self.onError) self.onError(e);
        return null;
      });
    },

    // ── LOBBY (room browser) ──
    // Join the lobby room → it pushes "rooms"/"+"/"-" with the list of OPEN f9_pvp_room matches.
    // Player chooses: createMatch() (host a new match) or joinMatchById() (join a listed one).
    joinLobby: function () {
      var self = this;
      if (!this.client) {
        return this.connect().then(function (ok) { return ok ? self.joinLobby() : null; });
      }
      return this.client.joinOrCreate('lobby', {}).then(function (room) {
        self.lobby = room;
        return room;
      }).catch(function (e) {
        self.lastError = e; console.error('[F9PVP] lobby join failed', e);
        if (self.onError) self.onError(e); return null;
      });
    },
    // Host a NEW match (others see it in the lobby and can join). Wires it like join().
    createMatch: function (opts) {
      var self = this; opts = opts || {};
      if (!this.client) { return this.connect().then(function (ok) { return ok ? self.createMatch(opts) : null; }); }
      var _createOpts = { name: String(opts.name || ''), home: opts.home === true, deck: Array.isArray(opts.deck) ? opts.deck : [], address: String(opts.address || ''), owner: String(opts.owner || '') };
      if (Number.isFinite(+opts.active)) _createOpts.active = +opts.active;   // ⚔ pageidaujamas lauko dydis (1..12)
      return this.client.create('f9_pvp_room', _createOpts).then(function (room) {
        self.room = room; self.connected = true; self.myTeam = -1;
        self._wire(room);
        console.log('[F9PVP] created match room ' + room.id);
        return room;
      }).catch(function (e) {
        self.lastError = e; console.error('[F9PVP] createMatch failed', e);
        if (self.onError) self.onError(e); return null;
      });
    },
    // 🗡️🤖 RAID: joinOrCreate pagal owner (filterBy). Taikinys ONLINE → prisijungia prie jo GYVO home kambario
    //   (live raid); OFFLINE → sukuria kambarį (serveris _asyncRaid → AI gina taikinio snapshot'ą). Mes = puolikas.
    raidPlayer: function (targetAddr, opts) {
      var self = this; opts = opts || {};
      var owner = String(targetAddr || '').trim().toLowerCase();
      if (!owner) return Promise.resolve(null);
      if (!this.client) { return this.connect().then(function (ok) { return ok ? self.raidPlayer(targetAddr, opts) : null; }); }
      var joinOpts = { owner: owner, raid: true, deck: Array.isArray(opts.deck) ? opts.deck : [], address: String(opts.address || '') };
      if (Number.isFinite(+opts.active)) joinOpts.active = +opts.active;   // ⚔ puoliko pageidaujamas aktyvių dydis
      if (opts.feeTx) joinOpts.feeTx = String(opts.feeTx);   // ⚔️💰 raid fee TX hash (serveris verifikuoja on-chain)
      return this.client.joinOrCreate('f9_pvp_room', joinOpts).then(function (room) {
        self.room = room; self.connected = true; self.myTeam = -1;
        self._wire(room);
        console.log('[F9PVP] 🗡️ raiding ' + owner + ' → room ' + room.id);
        return room;
      }).catch(function (e) {
        self.lastError = e; console.warn('[F9PVP] raidPlayer failed', e && e.message);
        if (self.onError) self.onError(e); return null;
      });
    },
    // Join a SPECIFIC listed match by roomId. Wires it like join().
    joinMatchById: function (roomId, opts) {
      var self = this; opts = opts || {};
      if (!roomId) return Promise.resolve(null);
      if (!this.client) { return this.connect().then(function (ok) { return ok ? self.joinMatchById(roomId, opts) : null; }); }
      return this.client.joinById(roomId, { name: String(opts.name || ''), deck: Array.isArray(opts.deck) ? opts.deck : [] }).then(function (room) {
        self.room = room; self.connected = true; self.myTeam = -1;
        self._wire(room);
        console.log('[F9PVP] joined match room ' + roomId);
        return room;
      }).catch(function (e) {
        self.lastError = e; console.error('[F9PVP] joinMatchById failed', e);
        if (self.onError) self.onError(e); return null;
      });
    },

    _wire: function (room) {
      var self = this;

      function resolveTeam() {
        try {
          var me = room.state.players.get(room.sessionId);
          if (me) self.myTeam = me.team;
        } catch (_) {}
      }
      // winnerSid -> team index (for renderer)
      function teamOfSid(sid) {
        if (!sid) return -1;
        var t = -1;
        try { var p = room.state.players.get(sid); if (p) t = p.team; } catch (_) {}
        return t;
      }

      room.onStateChange(function (state) {
        if (self.myTeam < 0) resolveTeam();
        if (self.onStateChange) self.onStateChange(state);
      });

      room.onMessage('enough_joined', function () { resolveTeam(); if (self.onMatchReady) self.onMatchReady(); });
      room.onMessage('room_full', function () { /* arena pilna (4/4) */ });
      room.onMessage('match_start', function (e) { resolveTeam(); if (self.onGameStart) self.onGameStart(e || {}); });
      room.onMessage('match_end', function (e) {
        var sid = (e && e.winnerSid) || '';
        if (self.onMatchEnd) self.onMatchEnd({ winnerSid: sid, winnerTeam: teamOfSid(sid), reason: 'wipe' });
      });
      room.onMessage('died', function (e) {
        if (!self.onUnitDied) return;
        var u = null; try { u = room.state.units.get(e && e.id); } catch (_) {}
        self.onUnitDied({
          id: (e && e.id) || '', by: (e && e.by) || '',
          x: u ? u.x : 0, y: u ? u.y : 0,
          team: u ? u.team : -1, utype: u ? u.utype : ''
        });
      });
      room.onMessage('match_result', function (e) { self.lastResult = e; if (self.onMatchResult) self.onMatchResult(e || {}); });
      room.onMessage('melee', function (e) { if (self.onMelee) self.onMelee(e || {}); });
      room.onMessage('shot',  function (e) { if (self.onShot)  self.onShot(e || {}); });
      room.onMessage('hit',   function (e) { if (self.onHit)   self.onHit(e || {}); });
      room.onMessage('pong',  function () {});

      room.onError(function (code, message) {
        console.error('[F9PVP] room error', code, message);
        if (self.onError) self.onError(new Error('room error ' + code + ' ' + (message || '')));
      });
      room.onLeave(function (code) {
        console.log('[F9PVP] left room', code);
        self.connected = false;
        self.room = null;
        if (self.onPlayerLeft) self.onPlayerLeft({ self: true, code: code });
      });
    },

    // ── outbound ──
    ready: function () { if (this.room) this.room.send('ready', {}); },
    ping: function () { if (this.room) this.room.send('ping', Date.now()); },

    // command helpers (server validates you only move your own units)
    moveTo: function (unitIds, x, y) { this._cmd(unitIds, 'move', x, y); },
    attackMoveTo: function (unitIds, x, y) { this._cmd(unitIds, 'attackmove', x, y); },
    stop: function (unitIds) { this._cmd(unitIds, 'stop', 0, 0); },
    _cmd: function (unitIds, type, x, y) {
      if (!this.room) return;
      var ids = Array.isArray(unitIds) ? unitIds : [unitIds];
      this.room.send('cmd', { action: actionFor(type), ids: ids, x: x, y: y });
    },

    leave: function () {
      if (this.room) { try { this.room.leave(); } catch (_) {} }
      this.room = null; this.connected = false; this.myTeam = -1;
    },

    // ── read helpers for the renderer (call each frame) ──
    getState: function () { return this.room ? this.room.state : null; },
    getPhase: function () {
      if (!this.room || !this.room.state) return 'offline';
      var ph = this.room.state.phase;
      return ph === 'ended' ? 'gameover' : ph;   // renderer banners use 'gameover'
    },
    getMyTeam: function () { return this.myTeam; },
    getResult: function () { return this.lastResult; },
    getUnits: function () {
      var out = [];
      if (!this.room || !this.room.state || !this.room.state.units) return out;
      this.room.state.units.forEach(function (u, id) {
        out.push({
          id: id, team: u.team, utype: u.utype, tokenId: 0, level: 0,
          x: u.x, y: u.y, tx: u.tx, ty: u.ty, hp: u.hp, maxHp: u.maxHp,
          facing: u.faceDx, action: renderAction(u.cmd), alive: u.alive,
          targetId: u.targetId
        });
      });
      return out;
    },
    // No cores in FFA/KotH mode (kept for renderer compatibility).
    getCores: function () { return []; },
    getCols: function () { return ARENA_COLS; },
    getRows: function () { return ARENA_ROWS; },

    // ── KotH center zone (FFA) ──
    getCenter: function () {
      var c = { x: ARENA_COLS / 2, y: ARENA_ROWS / 2, r: 3.5, holderSid: '', holderTeam: -1, contested: false, mine: false };
      if (!this.room || !this.room.state) return c;
      var st = this.room.state;
      c.holderSid = st.centerHolderSid || '';
      c.contested = !!st.centerContested;
      if (c.holderSid) {
        try { var p = st.players.get(c.holderSid); if (p) c.holderTeam = p.team; } catch (_) {}
        c.mine = c.holderSid === this.room.sessionId;
      }
      return c;
    },
    // my accumulated KotH RONKE drip + pergalės likutis (payout)
    getMyRonke: function () {
      if (!this.room || !this.room.state) return 0;
      try { var p = this.room.state.players.get(this.room.sessionId); return p ? p.ronkePending : 0; } catch (_) { return 0; }
    },
    // FAZA D: prizų puodas + įėjimo mokestis
    getPot: function () { return (this.room && this.room.state) ? (this.room.state.pot || 0) : 0; },
    getEntryFee: function () { return (this.room && this.room.state) ? (this.room.state.entryFee || 0) : 0; }
  };

  if (typeof window !== 'undefined') window.F9PVP = F9PVP;
})();
