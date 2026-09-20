/* net.js — RONKE BLOCKS tinklo transportas (ETAPAS A / A1).
 *
 * ARCHITEKTŪRA: plonas transportas su DVIEM backend'ais, tas pats interfeisas abiem:
 *   - 'mock'      — in-page LocalMockServer (A2): visą netcode testuoji LOKALIAI be serverio.
 *   - 'colyseus'  — tikras Colyseus room ('blocks_room', A4/A5).
 * match.js (A3) kalbasi TIK su NET — nežino, ar tai mock ar tikras serveris.
 *
 * Protokolas (žr. MSG): serveris = AUTORITETAS atakoms/laikmačiams; klientas siunčia
 * įvestį + praneša išvalymus, o garbage/gameover ateina iš serverio. */
(function (global) {
  'use strict';

  // ── Protokolas: žinučių tipai ──────────────────────────────────────────────
  var MSG = {
    // serveris → klientas
    START:    'start',      // {seed, startAt, you, foe}
    STATE:    'state',      // {tick, foeLines, foeTopped}     (priešo apžvalga interpoliacijai)
    GARBAGE:  'garbage',    // {lines, holeSeed, spots}        (classic mode: ataka į tavo lentą)
    FOE_CLEAR:'foe_clear',  // {n}                             (units mode: priešas išvalė n linijų → paleisk n priešo unitų koridoriun)
    CORRIDOR: 'corridor',   // {t, units:[...]}                (server-authoritative koridorius: unitų pozicijos piešimui)
    BOARDS:   'boards',     // {you, foe}                      (A6 L2: server-authoritative LENTOS — klientas piešia iš serverio)
    GAMEOVER: 'gameover',   // {winner:'you'|'foe', reason}
    FOE_LEFT: 'foe_left',   // priešas atsijungė
    // klientas → serveris
    INPUT:    'input',      // {tick, action}                  (server-authoritative kelias, A6)
    CLEAR:    'clear',      // {tick, lines, spots}            (tarpinis: klientas praneša išvalymą)
    SNAP:     'snap',       // {board snapshot}                (relay: serveris persiunčia priešui kaip STATE{foe})
    TOPPED:   'topped',     // {tick}
    READY:    'ready',
  };

  // Endpoint: lokalus dev Colyseus vs prod cloud.
  function _endpoint() {
    try {
      var h = location.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || h === '') return 'ws://localhost:2567';
    } catch (_) {}
    return 'wss://de-fra-f8820c12.colyseus.cloud';
  }

  // ── Mažas event bus (on/off/emit) ──────────────────────────────────────────
  function Bus() { this._h = {}; }
  Bus.prototype.on = function (t, fn) { (this._h[t] = this._h[t] || []).push(fn); return this; };
  Bus.prototype.off = function (t, fn) { var a = this._h[t]; if (a) this._h[t] = a.filter(function (f) { return f !== fn; }); };
  Bus.prototype.emit = function (t, p) {
    var a = this._h[t]; if (a) a.slice().forEach(function (f) { try { f(p); } catch (e) { console.error('[net] handler', t, e); } });
    var star = this._h['*']; if (star) star.slice().forEach(function (f) { try { f(t, p); } catch (e) { console.error('[net] *', e); } });
  };

  // ── NET singletonas ─────────────────────────────────────────────────────────
  var NET = new Bus();
  NET.MSG = MSG;
  NET.mode = null;          // 'mock' | 'colyseus'
  NET.status = 'idle';      // idle | connecting | open | closed | error
  NET.sessionId = '';
  NET.roomId = '';          // colyseus room id (= kvietimo kodas draugui)
  NET._room = null;         // colyseus Room
  NET._mock = null;         // LocalMockServer (A2 priregistruoja per useMock)

  // A2 LocalMockServer registruojasi čia. Interfeisas, kurio NET tikisi iš mock:
  //   mock.connect(NET, opts) -> Promise         (paleidžia partiją, ims NET.emit kaip „serveris→klientas")
  //   mock.recv(type, payload)                    (gauna „klientas→serveris" žinutę)
  //   mock.disconnect()
  NET.useMock = function (mockServer) { NET._mock = mockServer; };

  /* 🔌 PERSIJUNGIMAS PO RYSIO TRUKIO (2026-09-20).
   * Iki siol Tetris NETUREJO jokio atsistatymo: `room.onLeave` tiesiog paskelbdavo `close`, ir macas
   * baigdavosi. Serveris tuo metu LAUKIA (`allowReconnection`) — tas langas buvo niekada nepanaudotas,
   * o po jo `_winByLeave` atimdavo ir maca, ir statyma. Pilis (f9_pvp_live.js) tokia mechanika turi
   * seniai, todel ten tinklo mirktelejimas nepastebimas, o Tetryje buvo mirtinas.
   * Cia: isimenam `reconnectionToken` ir po NETIKETO atsijungimo bandom grizti ~24 s (20 × 1,2 s),
   * kas telpa i serverio 30 s langa. `close` skelbiam tik tada, kai grizti nepavyko.
   * Samoningas isejimas (`NET.disconnect`) ir pasibaiges macas (`gameover`) persijungimo NEPRADEDA. */
  var RC_TRIES = 20, RC_GAP_MS = 1200;
  var _client = null, _rtoken = '', _rcTimer = null;
  NET._bye = false;    // samoningai isejom
  NET._over = false;   // macas jau baigtas (gameover) — grizti nebera kur

  /* Matomas pranesimas: be jo zaidejas 24 s ziuri i sustinguisi lauka ir mano, kad viskas baigta.
     Savarankiskas — be CSS failu ir be priklausomybiu nuo likusio UI. */
  function _rcBanner(text) {
    try {
      var d = global.document; if (!d || !d.body) return;
      var el = d.getElementById('rb-net-rc');
      if (!text) { if (el) el.remove(); return; }
      if (!el) {
        el = d.createElement('div'); el.id = 'rb-net-rc';
        el.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483000;' +
          'font-family:monospace;font-size:12px;font-weight:700;padding:9px 16px;border-radius:10px;' +
          'background:linear-gradient(180deg,#2b2412,#161208);border:2px solid #c8a24a;color:#ffe3a0;' +
          'box-shadow:0 4px 16px rgba(0,0,0,.6);pointer-events:none;';
        d.body.appendChild(el);
      }
      el.textContent = text;
    } catch (_) {}
  }

  function _wire(room) {
    NET._room = room; NET.status = 'open';
    NET.sessionId = room.sessionId; NET.roomId = room.roomId;
    if (room.reconnectionToken) _rtoken = room.reconnectionToken;
    room.onMessage('*', function (type, payload) {
      if (type === 'gameover') NET._over = true;
      NET.emit(type, payload);
    });
    room.onLeave(function (code) { _onLeave(code); });
    room.onError && room.onError(function (code, message) { NET.status = 'error'; NET.emit('error', { code: code, message: message }); });
  }

  function _onLeave(code) {
    NET._room = null;
    // 4000 = consented leave (patys ismetem / pats isejo) — cia grizti nereikia.
    if (NET._bye || NET._over || code === 4000 || !_client || !_rtoken) {
      NET.status = 'closed'; NET.emit('close', { code: code }); return;
    }
    NET.status = 'reconnecting';
    console.warn('[net] 🔌 rysys nutruko (code ' + code + ') — bandom grizti i maca');
    _rcBanner('🔌 Connection lost — reconnecting…');
    NET.emit('reconnecting', { code: code, tries: RC_TRIES, gapMs: RC_GAP_MS });
    _reconnect(0);
  }

  function _reconnect(attempt) {
    if (NET._bye || NET._over) return;
    _client.reconnect(_rtoken).then(function (room) {
      _wire(room);
      _rcBanner('');
      console.log('[net] ✅ persijungta po ' + (attempt + 1) + ' bandymo(-u)');
      NET.emit('reopen', { sessionId: room.sessionId, roomId: room.roomId, attempts: attempt + 1 });
    }).catch(function () {
      if (attempt + 1 >= RC_TRIES) {
        console.warn('[net] ❌ persijungti nepavyko per ' + Math.round(RC_TRIES * RC_GAP_MS / 1000) + ' s');
        _rcBanner('');
        NET.status = 'closed'; NET.emit('close', { code: 'reconnect_failed' }); return;
      }
      _rcTimer = setTimeout(function () { _reconnect(attempt + 1); }, RC_GAP_MS);
    });
  }

  NET.connect = function (mode, opts) {
    opts = opts || {};
    NET.mode = mode; NET.status = 'connecting';

    if (mode === 'mock') {
      if (!NET._mock) { console.warn('[net] mock backend nepriregistruotas (useMock)'); NET.status = 'error'; return Promise.reject('no_mock'); }
      return Promise.resolve(NET._mock.connect(NET, opts)).then(function () {
        NET.status = 'open'; NET.sessionId = 'local'; NET.emit('open', { sessionId: 'local' });
      });
    }

    // colyseus
    if (!global.Colyseus || !global.Colyseus.Client) { console.error('[net] Colyseus client neįkeltas (../colyseus.browser.js)'); NET.status = 'error'; return Promise.reject('no_colyseus'); }
    var client = new global.Colyseus.Client(_endpoint());
    _client = client; NET._bye = false; NET._over = false;
    if (_rcTimer) { clearTimeout(_rcTimer); _rcTimer = null; }
    /* Matchmaking keliai:
     *   opts.roomId              → joinById  (draugas per kodą, ARBA pasirinktas žaidėjas iš lobio sąrašo)
     *   opts.matchmake==='create'→ create(private)  (privatus kambarys → dalinuosi kodu draugui; NEsąraše)
     *   opts.matchmake==='host'  → create(public)   (HOST & WAIT — matomas lobio sąraše, kiti gali pasirinkti)
     *   kitaip                   → joinOrCreate(public)  (QUICK MATCH — auto) */
    var p;
    if (opts.roomId) {
      p = client.joinById(opts.roomId, opts);
    } else if (opts.matchmake === 'create') {
      p = client.create('blocks_room', Object.assign({}, opts, { mode: 'private' }));
    } else if (opts.matchmake === 'host') {
      p = client.create('blocks_room', Object.assign({}, opts, { mode: 'public' }));
    } else {
      p = client.joinOrCreate('blocks_room', Object.assign({}, opts, { mode: 'public' }));
    }
    return p.then(function (room) {
      _wire(room);
      NET.emit('open', { sessionId: room.sessionId, roomId: room.roomId });
      return room;
    }).catch(function (e) { NET.status = 'error'; NET.emit('error', e); throw e; });
  };

  // Lobio SĄRAŠAS: laukiantys PUBLIC kambariai (clients===1) — kad žaidėjas pasirinktų varžovą.
  //   Naudoja atskirą lengvą query klientą (nereikia prisijungti prie kambario). Privatūs (setPrivate)
  //   NEsimato — tik HOST/QUICK MATCH laukiantys. Grąžina [{roomId, host}].
  var _qClient = null;
  function _queryClient() {
    if (!global.Colyseus || !global.Colyseus.Client) return null;
    if (!_qClient) { try { _qClient = new global.Colyseus.Client(_endpoint()); } catch (_) { return null; } }
    return _qClient;
  }
  NET.listRooms = function () {
    var c = _queryClient();
    if (!c) return Promise.resolve([]);
    return c.getAvailableRooms('blocks_room').then(function (rooms) {
      return (rooms || [])
        .filter(function (r) { return r.clients === 1 && r.maxClients === 2; })
        .map(function (r) { return { roomId: r.roomId, host: (r.metadata && r.metadata.host) || 'Player' }; });
    }).catch(function () { return []; });
  };

  // Klientas → serveris.
  NET.send = function (type, payload) {
    if (NET.mode === 'mock') { if (NET._mock) NET._mock.recv(type, payload); return; }
    if (NET._room) { try { NET._room.send(type, payload); } catch (e) { console.error('[net] send', type, e); } }
  };

  NET.disconnect = function () {
    NET._bye = true;   // 🔌 samoningas isejimas — jokio persijungimo
    if (_rcTimer) { clearTimeout(_rcTimer); _rcTimer = null; }
    if (NET.mode === 'mock' && NET._mock) { try { NET._mock.disconnect(); } catch (_) {} }
    if (NET._room) { try { NET._room.leave(); } catch (_) {} NET._room = null; }
    NET.status = 'closed'; NET.mode = null; NET.emit('close');
  };

  global.NET = NET;
  global.RB = global.RB || {}; global.RB.net = NET;   // debug: RB.net.status / RB.net.connect('mock')
})(window);
