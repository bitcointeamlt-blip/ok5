/* Paleidimas + pagrindinis ciklas.
 * FIKSUOTAS žingsnis (120 Hz) — determinizmas ir vienodas "feel" bet kokiame monitoriuje
 * (60/120/144 Hz). Tas pats žingsnis veiks ir serveryje etape 3. */
(function (global) {
  'use strict';

  var STEP = 1000 / 120;
  var MAX_FRAME = 250;

  function boot() {
    var canvas = document.getElementById('screen');
    if (global.Units) global.Units.load();     // deck unitų sprite'ai (async, nelaukiam)
    var match = new global.Match();
    var renderer = new global.Renderer(canvas);
    match.renderer = renderer;
    new global.Input(match);

    /* ETAPAS A: online režimas per `?net=mock` (arba 'colyseus'). Be šio param — lokalus AI PvP.
     * `?name=` — žaidėjo vardas (default atsitiktinis). `?mode=classic|units` — su/be unitų (default units). */
    var _net = null, _name = null, _mode = null, _room = null, _embed = null;
    try {
      var _qs = new global.URLSearchParams(location.search);
      _net = _qs.get('net'); _name = _qs.get('name'); _mode = _qs.get('mode'); _room = _qs.get('room'); _embed = _qs.get('embed');
    } catch (_) {}
    if (_net && match.enableNet) {
      var nm = _name || ('Player' + Math.floor(1000 + Math.random() * 9000));
      var md = (_mode === 'classic') ? 'classic' : 'units';
      var _opts = { aiLevel: match.aiLevel, foeName: 'RIVAL', name: nm, mode: md };
      if (_room) _opts.roomId = _room;                 // draugas paspaudė kvietimo nuorodą → auto-join
      match.enableNet(_net, _opts);
      console.log('[RONKE BLOCKS] NET režimas:', _net, '| vardas:', nm, '| modas:', md, _room ? ('| room:' + _room) : '');
    }

    /* 🧱 PANEL EMBED: kai tetris paleistas per F9 lobio PANELĘ (`?embed=panel`), jis kraunamas PASLĖPTAS —
     * lobį valdo TĖVAS (DOM panelė pilyje). Čia: (1) atsiskaitom savo būseną tėvui (setInterval, veikia ir
     * paslėpus — nepriklauso nuo rAF), (2) priimam matchmaking komandas (host/join/private/quick/lobby). */
    if (_embed === 'panel') {
      var _post = function (extra) {
        try {
          global.parent.postMessage(Object.assign({
            __rbpanel: 'state', state: match.state,
            roomCode: match.roomCode || '', inviteUrl: match.inviteUrl || '', priv: !!match._private,
            opponent: match._challenger || '', host: match._hostName || '',
            myRoomId: (global.NET && global.NET.roomId) || ''   // MANO kambarys → tėvas jį išfiltruoja iš sąrašo
          }, extra || {}), '*');
        } catch (_) {}
      };
      var _lastRep = '';
      global.setInterval(function () {
        var rep = match.state + '|' + (match.roomCode || '') + '|' + (match._private ? 1 : 0) + '|' + (match._challenger || '') + '|' + ((global.NET && global.NET.roomId) || '');
        if (rep === _lastRep) return;
        _lastRep = rep; _post();
      }, 150);
      /* event-driven (nepriklauso nuo throttled rAF/interval paslėpus): challenge/declined iškart tėvui. */
      if (global.NET) {
        global.NET.on('challenge', function (p) { _post({ state: 'challenge', opponent: (p && p.opponent) || '' }); });
        global.NET.on('declined', function () { _post({ state: 'lobby' }); });
        /* 🧱💰 wager įvykiai tėvui (panelė moka/rodo statusą/prizą) */
        global.NET.on('stake_now', function (p) { _post({ stakeNow: true, stakeTier: (p && p.tier) || 0 }); });   // pay-on-accept: laikas mokėti
        global.NET.on('wager_verify', function (p) { _post({ wagerVerify: true, wagerTier: (p && p.tier) || 0 }); });
        global.NET.on('settle', function (p) { var won = !!(p && p.winner && match.mySide && p.winner === match.mySide); _post({ wagerPrize: won ? (p.prize || 0) : 0, wagerPot: (p && p.pot) || 0 }); });
        global.NET.on('wager_abort', function (p) { _post({ wagerAbort: (p && p.reason) || 'error' }); });
      }
      global.addEventListener('message', function (e) {
        var d = e && e.data; if (!d || d.__rbpanel !== 'cmd') return;
        /* wager (pay-on-accept): serverAuth + wager ketinimas + žaidėjo adresas → serverio metadata/verifikacijai */
        match.netOpts = match.netOpts || {};
        if (d.serverAuth != null) match.netOpts.serverAuth = !!d.serverAuth;
        if (d.wager != null) match.netOpts.wager = !!d.wager;      // wager kambario ketinimas (mokama vėliau)
        if (d.addr != null) match.netOpts.addr = d.addr;           // žaidėjo piniginė (Transfer.from + payout)
        if (d.cmd === 'host') match.netMatchmake('host', d.tier);
        else if (d.cmd === 'quick') match.netMatchmake('quick');
        else if (d.cmd === 'private') match.netMatchmake('create', d.tier);
        else if (d.cmd === 'join' && d.roomId) match.netJoinRoom(d.roomId);
        else if (d.cmd === 'accept') match.netAccept();
        else if (d.cmd === 'decline') match.netDecline();
        else if (d.cmd === 'stake') { try { global.NET.send('stake', { tx: d.mid, addr: d.addr }); } catch (_) {} }   // 🧱💰 įėjimo tx serveriui
        else if (d.cmd === 'stakecancel') { try { global.NET.send('stake_cancel', {}); } catch (_) {} }
        else if (d.cmd === 'lobby') { match.state = 'lobby'; match.roomCode = ''; match.inviteUrl = ''; match._startLobbyPoll(); }
      });
    }

    var relayout = function () { renderer.resize(); };
    global.addEventListener('resize', relayout);
    document.addEventListener('fullscreenchange', function () { setTimeout(relayout, 60); });
    document.addEventListener('webkitfullscreenchange', function () { setTimeout(relayout, 60); });
    global.addEventListener('orientationchange', function () {
      setTimeout(relayout, 120);
    });

    /* Pirmas naudotojo prisilietimas atrakina WebAudio (naršyklės politika). */
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      global.addEventListener(ev, function once() {
        global.Sfx.unlock();
        global.removeEventListener(ev, once);
      }, { once: true });
    });

    /* Paspaudimas ant ekrano: meniu/rezultatas = start/rematch; lobis = mygtukų hit-test;
     * host'inant (connecting su kodu) = kvietimo nuorodos kopijavimas. */
    canvas.addEventListener('pointerdown', function (e) {
      /* ekrano px → virtualios koordinatės (robustiška ir prie CSS mastelio/zoom) */
      var r = canvas.getBoundingClientRect();
      var vx = (e.clientX - r.left) * (renderer.vw / Math.max(1, r.width));
      var vy = (e.clientY - r.top) * (renderer.vh / Math.max(1, r.height));

      if (match.state === 'lobby' && match._lobbyHit) {
        for (var i = 0; i < match._lobbyHit.length; i++) {
          var b = match._lobbyHit[i];
          if (vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h) {
            if (b.action === 'join') match.netJoinRoom(b.roomId);   // pasirinktas žaidėjas iš sąrašo
            else match.netMatchmake(b.action);                     // 'host' | 'create'
            return;
          }
        }
        return;
      }
      if (match.state === 'challenge' && match._challengeHit) {
        for (var ci = 0; ci < match._challengeHit.length; ci++) {
          var cb = match._challengeHit[ci];
          if (vx >= cb.x && vx <= cb.x + cb.w && vy >= cb.y && vy <= cb.y + cb.h) {
            if (cb.action === 'accept') match.netAccept(); else match.netDecline();
            return;
          }
        }
        return;
      }
      if (match.state === 'connecting' && match._private && match.roomCode && match.inviteUrl) {
        /* nukopijuojam kvietimo nuorodą į iškarpinę (draugui nusiųsti) */
        try {
          if (global.navigator && global.navigator.clipboard) {
            global.navigator.clipboard.writeText(match.inviteUrl).then(function () {
              match._copied = true; setTimeout(function () { match._copied = false; }, 2500);
            }).catch(function () {});
          }
        } catch (_) {}
        return;
      }
      if (match.state === 'menu' || match.state === 'result') match.meta('start');
    });

    var last = performance.now(), acc = 0;
    function loop(ts) {
      var dt = ts - last;
      last = ts;
      if (dt > MAX_FRAME) dt = MAX_FRAME;
      acc += dt;
      var guard = 0;
      while (acc >= STEP && guard < 60) { match.update(STEP); acc -= STEP; guard++; }
      if (guard >= 60) acc = 0;
      /* Piešimo klaida NETURI nužudyti ciklo. Anksčiau viena `ReferenceError`
       * viduryje kadro nutraukdavo rAF grandinę ir žaidimas tiesiog sustingdavo
       * be jokio ženklo. Dabar klaida pranešama vieną kartą, o žaidimas gyvena. */
      try {
        renderer.draw(match, dt);
      } catch (err) {
        if (!global._rbDrawErr) {
          global._rbDrawErr = err;
          console.error('[RONKE BLOCKS] piešimo klaida (ciklas tęsiamas):', err);
        }
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    /* Debug konsolėje */
    global.RB = {
      match: match, renderer: renderer, CFG: global.CFG,
      /* greitas atakos testas: RB.hit(4) -> 4 linijos tau po 3 s */
      hit: function (n) { match.you.receiveAttack(n || 2); },
      /* RB.hitFoe(4) -> atakuok CPU */
      hitFoe: function (n) { match.foe.receiveAttack(n || 2); },
      /* RB.junk(6) -> iškart pridėk šiukšlių sau (be laikmačio) */
      junk: function (n) {
        n = n || 4;
        var holes = [];
        for (var i = 0; i < n; i++) holes.push(match.you.holeRnd.next(global.CFG.COLS));
        match.you.board.addGarbage(n, holes);
      },
      reset: function () { try { localStorage.removeItem('ronkeblocks_lb_v1'); } catch (e) { } },

      /* RB.sprites() — parodo, KURIE sprite'ai realiai užsikrovė.
       * Jei kuris nors rodo NEUŽSIKROVĖ, tas unitas piešiamas atsarginiu kariu. */
      sprites: function () {
        var U = global.Units;
        if (!U) { console.log('Units modulis nepakrautas'); return; }
        console.log('F12 duomenys:', U.hasF12 ? 'OK (js/f12_data.js)' : 'NĖRA — visi statai atsarginiai!');
        function st(im) { return im ? (im.complete && im.naturalWidth > 0 ? 'ok ' + im.naturalWidth + 'x' + im.naturalHeight : 'NEUŽSIKROVĖ ' + im.src) : '-'; }
        U.ORDER.forEach(function (t) {
          var d = U.ROSTER[t], parts = [];
          if (d.dirImgs) {
            Object.keys(d.dirImgs).forEach(function (k) {
              var e = d.dirImgs[k].east, w = d.dirImgs[k].west;
              var bad = e.concat(w).filter(function (im) { return !(im.complete && im.naturalWidth > 0); });
              parts.push(k + ': ' + (bad.length ? 'BLOGI ' + bad.length + '/' + (e.length + w.length) + ' (' + bad[0].src + ')' : 'ok ' + e.length + '+' + w.length));
            });
          } else {
            parts.push('walk ' + st(d.img));
            parts.push('atk ' + st(d.atkImg));
            parts.push('idle ' + st(d.idleImg));
            if (d.gdImg) parts.push('guard ' + st(d.gdImg));
          }
          if (d.proj && d.proj.procedural) parts.push('proj procedūrinis (F12 gradientas)');
          else if (d.proj && d.proj.sheet) parts.push('proj ' + st(d.proj.img));
          if (d.proj && d.proj.impact) parts.push('sprogimas ' + st(d.proj.impact.img));
          console.log(t.padEnd(13), parts.join(' | '));
        });
        /* Statai vienoje eilutėje — greitai matyti, ar sutampa su F12 kortomis. */
        U.ORDER.forEach(function (t) {
          var s = U.stats(t);
          console.log('  ' + t.padEnd(13) + 'hp' + s.hp + ' dmg' + s.dmg + ' cd' + s.cd
            + ' range' + s.range + ' spd' + s.spd + ' crit' + s.crit + ' block' + s.block
            + ' miss' + s.miss + ' hit@' + s.hitDelay + 'ms' + (s.aoe ? ' AOE' : ''));
        });
        console.log('deck:', U.deck(0).join(', '));
        console.log('koridoriuje unitų:', match.army.units.length, '| sviedinių:', match.army.shots.length);
        if (global._rbDrawErr) console.log('PIEŠIMO KLAIDA BUVO:', global._rbDrawErr.message);
      },

      /* RB.fight() — iškart pastato po unitą į kiekvieną aukštą, kad matytum kovą. */
      fight: function () {
        match.army.reset();
        var types = global.Units ? global.Units.ORDER : ['skull'];
        for (var l = 0; l < (global.CFG.MARCH.LANES || 4); l++) {
          match.army.spawn('you', types[l % types.length], l);
          match.army.spawn('foe', types[(l + 3) % types.length], l);
        }
        console.log('paleista', match.army.units.length, 'unitų į', global.CFG.MARCH.LANES, 'aukštus');
      }
    };
    console.log('[RONKE BLOCKS] ready. Debug: RB.hit(n), RB.hitFoe(n), RB.junk(n), RB.match');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
