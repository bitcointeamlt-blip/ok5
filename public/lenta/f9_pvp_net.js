/* ============================================================================
 * f9_pvp_net.js — F9 PvP networking client (ISOLATED).
 *
 * Standalone module for the lenta/PewPew Saga page. It does NOT touch game.js,
 * floor12_merge.js, or any existing F9/F11/F12 code. It only exposes a global
 * `window.F9PVP` API that the game can OPT-IN to later. If this file is never
 * called, it has zero effect on the game.
 *
 * Talks to the Colyseus `f9pvp_room` (see colyseus-server/src/rooms/F9PvpRoom.ts).
 * Server is authoritative: this client sends commands and renders server state.
 *
 * USAGE (wired in a later phase — not active yet):
 *   await F9PVP.connect();
 *   await F9PVP.join({ address: wallet, deck: [{utype:'skull',level:3,tokenId:12}, ...] });
 *   F9PVP.onGameStart = () => {...};
 *   F9PVP.onUnitDied  = (e) => spawnDeathFx(e.x, e.y);
 *   F9PVP.onMatchEnd  = (e) => showResult(e.winnerTeam);
 *   // each render frame: F9PVP.getUnits() -> [{id,team,utype,x,y,hp,maxHp,facing,action}]
 *   // player commands: F9PVP.moveTo(ids, x, y) / attackMoveTo(ids, x, y) / stop(ids)
 *
 * Coordinates are in GRID CELLS (float) — multiply by CELL (54px) to draw.
 * ========================================================================== */
(function () {
  'use strict';

  var COLYSEUS_CDN = 'https://unpkg.com/colyseus.js@0.15.28/dist/colyseus.js';
  var ROOM_NAME = 'f9pvp_room';

  function defaultEndpoint() {
    if (typeof window !== 'undefined' && window.F9PVP_ENDPOINT) return window.F9PVP_ENDPOINT;
    var host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    if (host === 'localhost' || host === '127.0.0.1') return 'ws://localhost:2567';
    // Production fallback: same Colyseus Cloud deployment the ok5 PvP games use.
    // Override anytime via window.F9PVP_ENDPOINT before connect().
    return 'wss://de-fra-f8820c12.colyseus.cloud';
  }

  var F9PVP = {
    // ── connection state ──
    client: null,
    room: null,
    connected: false,
    myTeam: -1,
    lastError: null,
    lastResult: null,     // last F9PvpMatchResult (settlement summary), or null

    // ── event hooks (assign functions; all optional) ──
    onMatchReady: null,   // both players joined
    onGameStart: null,    // (e:{seed}) sim started, units spawned
    onUnitDied: null,     // (e:{id,x,y,team,utype})
    onMatchEnd: null,     // (e:{winnerTeam,reason})
    onMatchResult: null,  // (e:F9PvpMatchResult) settlement summary (Phase 5): elo/xp/survivors
    onCoreDestroyed: null,// (e:{team,x,y})
    onPlayerLeft: null,   // (e:{sessionId})
    onStateChange: null,  // (state) raw colyseus state, every patch
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
    // opts: { address: string, deck: [{utype,level,tokenId}, ...] }
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
      return this.client.joinOrCreate(ROOM_NAME, joinOpts).then(function (room) {
        self.room = room;
        self.connected = true;
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

    _wire: function (room) {
      var self = this;

      // figure out my team once players populate
      function resolveTeam() {
        try {
          var me = room.state.players.get(room.sessionId);
          if (me) self.myTeam = me.team;
        } catch (_) {}
      }
      room.onStateChange(function (state) {
        if (self.myTeam < 0) resolveTeam();
        if (self.onStateChange) self.onStateChange(state);
      });

      // death FX events
      room.onMessage('f9pvp_unit_died', function (e) { if (self.onUnitDied) self.onUnitDied(e); });
      room.onMessage('f9pvp_match_ready', function () { resolveTeam(); if (self.onMatchReady) self.onMatchReady(); });
      room.onMessage('f9pvp_game_start', function (e) { resolveTeam(); if (self.onGameStart) self.onGameStart(e); });
      room.onMessage('f9pvp_match_end', function (e) { if (self.onMatchEnd) self.onMatchEnd(e); });
      room.onMessage('f9pvp_match_result', function (e) { self.lastResult = e; if (self.onMatchResult) self.onMatchResult(e); });
      room.onMessage('f9pvp_core_destroyed', function (e) { if (self.onCoreDestroyed) self.onCoreDestroyed(e); });
      room.onMessage('f9pvp_player_left', function (e) { if (self.onPlayerLeft) self.onPlayerLeft(e); });

      room.onError(function (code, message) {
        console.error('[F9PVP] room error', code, message);
        if (self.onError) self.onError(new Error('room error ' + code + ' ' + (message || '')));
      });
      room.onLeave(function (code) {
        console.log('[F9PVP] left room', code);
        self.connected = false;
        self.room = null;
      });
    },

    // ── outbound ──
    ready: function () { if (this.room) this.room.send('f9pvp_ready', {}); },

    // command helpers (server validates you only move your own units)
    moveTo: function (unitIds, x, y) { this._cmd(unitIds, 'move', x, y); },
    attackMoveTo: function (unitIds, x, y) { this._cmd(unitIds, 'amove', x, y); },
    stop: function (unitIds) { this._cmd(unitIds, 'stop', 0, 0); },
    _cmd: function (unitIds, type, x, y) {
      if (!this.room) return;
      var ids = Array.isArray(unitIds) ? unitIds : [unitIds];
      this.room.send('f9pvp_cmd', { unitIds: ids, type: type, x: x, y: y });
    },

    leave: function () {
      if (this.room) { try { this.room.leave(); } catch (_) {} }
      this.room = null; this.connected = false; this.myTeam = -1;
    },

    // ── read helpers for the renderer (call each frame) ──
    getState: function () { return this.room ? this.room.state : null; },
    getPhase: function () { return this.room ? this.room.state.phase : 'offline'; },
    getMyTeam: function () { return this.myTeam; },
    getResult: function () { return this.lastResult; },
    getUnits: function () {
      var out = [];
      if (!this.room || !this.room.state || !this.room.state.units) return out;
      this.room.state.units.forEach(function (u, id) {
        out.push({ id: id, team: u.team, utype: u.utype, tokenId: u.tokenId, level: u.level,
                   x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp, facing: u.facing, action: u.action });
      });
      return out;
    },
    getCores: function () {
      var out = [];
      if (!this.room || !this.room.state || !this.room.state.cores) return out;
      this.room.state.cores.forEach(function (c) {
        out.push({ team: c.team, x: c.x, y: c.y, hp: c.hp, maxHp: c.maxHp, active: c.active });
      });
      return out;
    },
    getCols: function () { return this.room && this.room.state ? this.room.state.cols : 20; },
    getRows: function () { return this.room && this.room.state ? this.room.state.rows : 16; }
  };

  if (typeof window !== 'undefined') window.F9PVP = F9PVP;
})();
