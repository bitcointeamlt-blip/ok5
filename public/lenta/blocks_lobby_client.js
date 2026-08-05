// blocks_lobby_client.js — 🧱 RONKE BLOCKS lobis kaip F9 PANELĖ (stilius kaip RAID lentelė) + pranešimas.
//
// Lobis rodomas PILYJE (DOM panelė — NEreikia krauti/rodyti tetris lango). Tetris žaidimas (iframe)
// kraunamas PASLĖPTAS: jo net ryšys + matchmaking veikia per websocket/timerius (nepriklauso nuo rAF),
// o panelė valdo jį komandomis (host/join/private). Kai rungtynės PRASIDEDA (state=countdown/playing) —
// iframe ATIDENGIAMAS visu ekranu („peršokam į kitą langą tik kai PvP prasideda"). Sąrašas laukiančių
// žaidėjų iš `getAvailableRooms` → žaidėjas PASIRENKA varžovą. Be mokesčio (for fun + test). TIK LOKALIAI
// kol kas (endpoint localhost → ws://localhost:2567). Izoliuota — window.BlocksLobby.
(function () {
  if (window.BlocksLobby) return;

  var POLL_MS = 8000, PANEL_POLL_MS = 2500;
  var _timer = null, _colyseusLoading = null, _client = null, _running = false;
  var _waitingRooms = [], _lastCount = 0;
  var _panel = null, _panelPoll = null, _iframe = null, _gameWrap = null, _gameOn = false, _iframeLoaded = false;
  var _lobbyRoom = null, _allRooms = [];   // realaus laiko LobbyRoom (Colyseus push, ne polling)
  var TIERS = [69, 200, 800];              // statymo pakopos (RONKE); laimėtojas 80%, treasury 20%
  var _selectedTier = 69;                  // pasirinkta pakopa kuriant kambarį
  var _bgActive = false, _lastState = 'lobby', _myRole = '', _myRoomId = '';   // _bgActive: aktyvus FONE; _myRoomId: MANO kambarys (nerodom sąraše)

  function _endpoint() {
    try { var h = location.hostname; if (h === 'localhost' || h === '127.0.0.1' || h === '') return 'ws://localhost:2567'; } catch (_) {}
    try { if (window.F9PVP_ENDPOINT) return String(window.F9PVP_ENDPOINT).replace(/^http/, 'ws'); } catch (_) {}
    return 'wss://de-fra-f8820c12.colyseus.cloud';
  }
  function _loadColyseus() {
    if (window.Colyseus && window.Colyseus.Client) return Promise.resolve();
    if (_colyseusLoading) return _colyseusLoading;
    _colyseusLoading = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'colyseus.browser.js';
      s.onload = function () { (window.Colyseus && window.Colyseus.Client) ? res() : rej(new Error('no Colyseus')); };
      s.onerror = function () { rej(new Error('colyseus load fail')); };
      document.head.appendChild(s);
    });
    return _colyseusLoading;
  }
  function _dockBtn() { return document.getElementById('wui-ronkeblocks-btn'); }
  function _inAdventure() { var b = _dockBtn(); return !!(b && b.offsetParent !== null && b.style.display !== 'none'); }
  function _inMinigame() { try { return !!window.__minigameOpen; } catch (_) { return false; } }
  function _esc(s) { return String(s).replace(/[<>&]/g, function (c) { return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]); }); }

  // ── Laukiančių kambarių užklausa (bendra badge/toast + panelės sąrašui) ──
  function _fetchWaiting() {
    return _loadColyseus().then(function () {
      if (!_client) _client = new window.Colyseus.Client(_endpoint());
      return _client.getAvailableRooms('blocks_room');
    }).then(function (rooms) {
      return (rooms || []).filter(function (r) { return r.clients === 1 && r.maxClients === 2; })
        .map(function (r) { return { roomId: r.roomId, host: (r.metadata && r.metadata.host) || 'Player', tier: (r.metadata && r.metadata.tier) || 69, mid: (r.metadata && r.metadata.mid) || null, wagerLive: (r.metadata && r.metadata.wagerLive) }; });
    }).catch(function () { return []; });
  }

  // ── Badge + toast (pranešimas kai kažkas laukia; NErodom kai pats žaidi/panelėje) ──
  function _poll() {
    if (document.hidden || !_inAdventure()) { _setBadge(0); _lastCount = 0; return; }
    if (_lobbyRoom) return;   // panelė atidaryta su REALAUS LAIKO lobby → jis tvarko sąrašą (nepoliname)
    _fetchWaiting().then(function (list) {
      _waitingRooms = list;
      var count = list.length;
      if (_inMinigame() || _panel || _bgActive) count = 0;   // jau čia esu / hostinu → nerodom
      _setBadge(count);
      if (count > _lastCount && count > 0) _toast(count, list[0] && list[0].host);
      _lastCount = count;
    });
  }
  function _setBadge(count) {
    var btn = _dockBtn(); if (!btn) return;
    var b = btn.querySelector('.rb-lobby-badge');
    if (count > 0) {
      if (!b) {
        b = document.createElement('span'); b.className = 'rb-lobby-badge';
        b.style.cssText = 'position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 3px;background:#e53535;' +
          'color:#fff;font:bold 10px monospace;line-height:16px;text-align:center;border-radius:9px;border:1px solid #fff;' +
          'box-shadow:0 1px 3px rgba(0,0,0,.6);z-index:3;animation:rbLobbyPulse 1.1s ease-in-out infinite;pointer-events:none;';
        if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
        btn.appendChild(b); _css();
      }
      b.textContent = count > 1 ? String(count) : '!'; b.style.display = 'block';
    } else if (b) { b.style.display = 'none'; }
  }
  function _css() {
    if (document.getElementById('rb-lobby-css')) return;
    var st = document.createElement('style'); st.id = 'rb-lobby-css';
    st.textContent = '@keyframes rbLobbyPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}' +
      '@keyframes rbToastIn{from{transform:translateX(-50%) translateY(-16px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}' +
      '.rb-row:hover{background:#2a3450 !important;} .rb-act:hover{filter:brightness(1.18);}';
    document.head.appendChild(st);
  }
  function _toast(count, who) {
    _css();
    var t = document.getElementById('rb-lobby-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'rb-lobby-toast';
      t.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99500;font-family:monospace;' +
        'background:#241a08;border:1px solid #e0a832;border-radius:12px;padding:11px 16px;color:#ffd97a;max-width:320px;' +
        'line-height:1.45;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.55);animation:rbToastIn .28s ease-out;';
      t.onclick = function () { _hideToast(); _openPanel(); };   // ⟵ toast → atidaro LOBIO PANELĘ
      document.body.appendChild(t);
    }
    var name = who ? ('<b>' + _esc(who) + '</b>') : (count > 1 ? '<b>' + count + ' players</b>' : 'Someone');
    t.innerHTML = '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:26px;">🧱</span>' +
      '<div><div style="font-weight:800;font-size:13px;">RONKE BLOCKS — PvP</div>' +
      '<div style="font-size:12px;opacity:.9;">' + name + ' is waiting in the lobby.</div>' +
      '<div style="font-size:11px;color:#8fd8e0;margin-top:2px;">▶ Tap to open the lobby</div></div></div>';
    t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(_hideToast, 9000);
  }
  function _hideToast() { var t = document.getElementById('rb-lobby-toast'); if (t) t.style.display = 'none'; }

  // 🧱💰 Laimėjimo prizo pranešimas (rodom virš žaidimo, kai serveris atsiuntė settle).
  function _wagerWin(prize, pot) {
    _css();
    var w = document.getElementById('rb-wager-win');
    if (!w) {
      w = document.createElement('div'); w.id = 'rb-wager-win';
      w.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100200;font-family:monospace;' +
        'background:linear-gradient(180deg,#1c2b12,#0e1608);border:2px solid #5ce08a;border-radius:12px;padding:12px 18px;' +
        'color:#9fffb0;box-shadow:0 4px 18px rgba(0,0,0,.6);text-align:center;animation:rbToastIn .3s ease-out;';
      document.body.appendChild(w);
    }
    w.innerHTML = '<div style="font-size:20px;">🏆</div><div style="font-weight:800;font-size:14px;">You won ' + (prize || 0) + ' RONKE</div>' +
      '<div style="font-size:10px;opacity:.75;">pot ' + (pot || 0) + ' · paid to your wallet</div>';
    w.style.display = 'block'; clearTimeout(w._h); w._h = setTimeout(function () { if (w) w.style.display = 'none'; }, 8000);
  }

  // ── LOBIO PANELĖ (stilius kaip raid_ui.js: overlay + navy panelė + auksinis rėmas) ──
  function _openPanel() {
    if (_panel) return;
    _setBadge(0);
    var ov = document.createElement('div'); _panel = ov;
    ov.id = 'rb-lobby-panel';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,22,0.92);z-index:99000;display:flex;' +
      'align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
    ov.addEventListener('click', function (e) { if (e.target === ov) _closePanel(); });
    var p = document.createElement('div');
    p.style.cssText = 'background:linear-gradient(180deg,#1f2940 0%,#0c1020 100%);border:3px solid #ffcf5c;' +
      'box-shadow:0 0 48px rgba(255,207,92,0.35),inset 0 0 24px rgba(255,207,92,0.08);border-radius:8px;' +
      'padding:16px 20px;width:440px;max-width:94vw;max-height:88vh;display:flex;flex-direction:column;' +
      "font-family:'Press Start 2P',monospace,sans-serif;font-size:10px;line-height:1.5;color:#8a9aaa;";
    p.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;padding-bottom:10px;border-bottom:1px solid #4a3a18;">' +
        '<span style="font-size:20px;text-shadow:0 0 14px #ffcf5c;">🧱</span>' +
        '<span style="flex:1;font-size:13px;color:#ffcf5c;letter-spacing:1px;">RONKE BLOCKS · 1v1</span>' +
        '<button id="rb-x" style="background:none;border:none;color:#8a9aaa;font-size:20px;cursor:pointer;line-height:1;font-family:inherit;">×</button>' +
      '</div>' +
      '<div id="rb-status" style="display:none;font-size:10px;color:#ffd97a;background:rgba(255,207,92,.08);border:1px solid #6a4a18;border-radius:6px;padding:10px;margin-bottom:10px;text-align:center;"></div>' +
      '<div style="font-size:9px;color:#6a7a8a;margin-bottom:6px;">OPEN MATCHES — tap a player to join ⚔️</div>' +
      '<div id="rb-list" style="overflow:auto;display:flex;flex-direction:column;gap:6px;min-height:40px;max-height:38vh;"><div style="color:#6a7a8a;font-size:9px;padding:8px 0;">Loading…</div></div>' +
      '<div style="margin-top:12px;border-top:1px solid #3a3a55;padding-top:10px;display:flex;flex-direction:column;gap:7px;">' +
        '<div style="font-size:8px;color:#6a7a8a;">CREATE A MATCH — pick stake (winner takes 80%, 20% to treasury)</div>' +
        '<div id="rb-tiers" style="display:flex;gap:6px;">' +
          TIERS.map(function (t) { return '<button class="rb-tier rb-act" data-t="' + t + '" style="flex:1;padding:9px 4px;border-radius:6px;border:1px solid #6a4a18;background:rgba(255,207,92,.06);color:#ffcf5c;font-family:inherit;font-size:11px;cursor:pointer;">' + t + '<div style="font-size:6px;opacity:.6;">RONKE</div></button>'; }).join('') +
        '</div>' +
        '<button id="rb-host" class="rb-act" style="padding:11px;border-radius:6px;border:2px solid #ffcf5c;background:rgba(255,207,92,.14);color:#ffcf5c;font-family:inherit;font-size:11px;cursor:pointer;">HOST MATCH · <span id="rb-host-amt">69</span> RONKE<div style="font-size:7px;opacity:.7;margin-top:3px;">wait - others can pick you</div></button>' +
        '<div style="display:flex;gap:7px;">' +
          '<button id="rb-private" class="rb-act" style="flex:1;padding:9px;border-radius:6px;border:1px solid #9d7ad0;background:rgba(157,122,208,.14);color:#cbb0ff;font-family:inherit;font-size:9px;cursor:pointer;">🔒 PRIVATE</button>' +
          '<button id="rb-ai" class="rb-act" style="flex:1;padding:9px;border-radius:6px;border:1px solid #4a7a4a;background:rgba(74,122,74,.14);color:#9fe0a0;font-family:inherit;font-size:9px;cursor:pointer;">🤖 vs AI</button>' +
        '</div>' +
      '</div>';
    ov.appendChild(p); document.body.appendChild(ov);
    p.querySelector('#rb-x').onclick = _closePanel;
    // pakopos pasirinkimas — paryškinam aktyvią + atnaujinam HOST mygtuko sumą
    function _paintTiers() {
      p.querySelectorAll('.rb-tier').forEach(function (b) {
        var on = Number(b.getAttribute('data-t')) === _selectedTier;
        b.style.background = on ? 'rgba(255,207,92,.30)' : 'rgba(255,207,92,.06)';
        b.style.borderColor = on ? '#ffcf5c' : '#6a4a18';
      });
      var amt = p.querySelector('#rb-host-amt'); if (amt) amt.textContent = String(_selectedTier);
    }
    p.querySelectorAll('.rb-tier').forEach(function (b) { b.onclick = function () { _selectedTier = Number(b.getAttribute('data-t')) || 69; _paintTiers(); }; });
    _paintTiers();
    p.querySelector('#rb-host').onclick = function () { _doHost(_selectedTier, false); };
    p.querySelector('#rb-private').onclick = function () { _doHost(_selectedTier, true); };
    p.querySelector('#rb-ai').onclick = function () { _closePanel(); try { if (window.RonkeBlocks) window.RonkeBlocks.openAI(); } catch (_) {} };

    _ensureGame();                 // preload paslėptą žaidimo iframe (host/join iškart)
    _renderList();
    // Momentinis fallback (kol LobbyRoom atsiųs 'rooms'), tada — REALAUS LAIKO push (be polling).
    _fetchWaiting().then(function (l) { if (_panel && !_lobbyRoom) { _waitingRooms = l; _renderList(); } });
    _connectLobby();
  }

  // ── REALAUS LAIKO lobis (Colyseus built-in LobbyRoom): push 'rooms'/'+'/'-' vietoj polling ──
  function _connectLobby() {
    if (_lobbyRoom) return;
    _loadColyseus().then(function () {
      if (!_panel || _lobbyRoom) return null;
      if (!_client) _client = new window.Colyseus.Client(_endpoint());
      return _client.joinOrCreate('lobby', { filter: { name: 'blocks_room' } });   // tik blocks_room kambariai
    }).then(function (room) {
      if (!room) return;
      if (!_panel) { try { room.leave(); } catch (_) {} return; }   // panelė spėjo užsidaryti
      _lobbyRoom = room;
      room.onMessage('rooms', function (rooms) { _allRooms = rooms || []; _refreshWaiting(); });
      room.onMessage('+', function (m) {
        var id = m[0], r = m[1], i = _allRooms.findIndex(function (x) { return x.roomId === id; });
        if (i >= 0) _allRooms[i] = r; else _allRooms.push(r);
        _refreshWaiting();
      });
      room.onMessage('-', function (id) { _allRooms = _allRooms.filter(function (x) { return x.roomId !== id; }); _refreshWaiting(); });
      room.onLeave(function () { _lobbyRoom = null; });
    }).catch(function () { /* fallback lieka _fetchWaiting rezultatas */ });
  }
  function _disconnectLobby() { if (_lobbyRoom) { try { _lobbyRoom.leave(); } catch (_) {} _lobbyRoom = null; } _allRooms = []; }
  // iš LobbyRoom sąrašo → laukiantys (1/2) blocks_room; badge/toast irgi gauna tiesiogiai
  function _refreshWaiting() {
    _waitingRooms = (_allRooms || [])
      .filter(function (r) { return r.clients === 1 && r.maxClients === 2; })
      .map(function (r) { return { roomId: r.roomId, host: (r.metadata && r.metadata.host) || 'Player', tier: (r.metadata && r.metadata.tier) || 69, mid: (r.metadata && r.metadata.mid) || null, wagerLive: (r.metadata && r.metadata.wagerLive) }; });
    _renderList();
  }
  function _renderList() {
    if (!_panel) return;
    var list = _panel.querySelector('#rb-list'); if (!list) return;
    /* NErodom SAVO paties laukiančio kambario (jei hostinu) — negaliu prisijungti prie savęs. */
    var rooms = _waitingRooms.filter(function (r) { return r.roomId !== _myRoomId; });
    if (!rooms.length) {
      list.innerHTML = '<div style="color:#6a7a8a;font-size:9px;padding:14px 0;text-align:center;">no open matches yet<br><span style="opacity:.7;">host one below ↓</span></div>';
      return;
    }
    list.innerHTML = '';
    rooms.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'rb-row';
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 11px;background:#141c30;border:1px solid #33405e;border-radius:6px;cursor:pointer;';
      row.innerHTML = '<span style="font-size:15px;">⚔️</span>' +
        '<span style="flex:1;color:#ffcf5c;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(String(r.host).slice(0, 14)) + '</span>' +
        '<span style="font-size:10px;color:#ffd97a;font-weight:700;white-space:nowrap;">' + (r.tier || 69) + ' <span style="font-size:7px;opacity:.6;">RONKE</span></span>' +
        '<span style="font-size:9px;color:#9fe0a0;border:1px solid #4a7a4a;border-radius:4px;padding:4px 9px;">JOIN ▶</span>';
      row.onclick = function () { _doJoin(r); };
      list.appendChild(row);
    });
  }
  function _status(html, show) {
    if (!_panel) return; var s = _panel.querySelector('#rb-status'); if (!s) return;
    s.innerHTML = html; s.style.display = show ? 'block' : 'none';
  }

  var _wager = function () { try { return window.BlocksWager && window.BlocksWager.enabled(); } catch (_) { return false; } };

  // 🏆 PoD: SUŽAISTAS onlaino žaidimas → žaidėjas PATS pasirašo payAndPlay(0,'blocks_play') į JAU
  //   registruotą PewPewPlayV2 (kaip nemokamo pinball'o pulsas). tx.to = registruotas kontraktas IR
  //   pasirašo ŽAIDĖJAS → PoD užsikabina (gas + contract-interaction → „Active user"; žr. pod_activity.js).
  //   GATED ant window.BLOCKS_POD_CLAIM_ON; dedup KARTĄ per UTC parą (nespaminam wallet popup'o kiekvienom
  //   rungtynėm) + per rungtynes tik 1×. Fire-and-forget — NIEKADA neblokuoja žaidimo. Wager rungtynėms
  //   NEdarom: įėjimo mokėjimas (payEntry) JAU užkabina PoD (ir stipriau — juda reali vertė).
  var _podClaimedMatch = false;
  function _podClaimPlay() {
    try {
      if (_wager()) return;                                       // wager entry jau užkabino PoD
      if (!window.BLOCKS_POD_CLAIM_ON) return;                    // GATED (default off)
      var PA = window.PodActivity;
      if (!PA || !PA.enabled || !PA.enabled()) return;            // reikia registruoto PewPewPlayV2
      if (PA.doneToday && PA.doneToday('blocks_play')) return;    // kartą per parą užtenka „Active"
      PA.claim('blocks_play', { silent: true });                  // player-signed, fire-and-forget
    } catch (_) {}
  }

  // HOST/PRIVATE: jei wager įjungtas (kontraktas deployintas) → žaidėjas SUMOKA (player-signed → PoD) +
  //   serverAuth (cheat-proof), on-chain matchId keliauja į kambarį (payout'ui). Kitaip → nemokamas režimas.
  // 🧱💰 pay-on-accept: serveris paprašė („stake_now" — abu sutiko) → DABAR realiai statom RONKE.
  //   Wallet popup rodomas net jei panelė uždaryta (fone). Nepavykus → pranešam serveriui (grąžins varžovui).
  function _doStake(tier) {
    if (!_wager()) return;
    _status('Confirm <b>' + tier + ' RONKE</b> stake in your wallet…', true);
    window.BlocksWager.payEntry(tier).then(function (r) {
      if (!r || !r.ok) {
        _status('Stake failed: ' + _esc((r && r.reason) || 'error') + ' — match cancelled', true);
        _cmd('stakecancel');
        return;
      }
      _cmd('stake', null, tier, r.tx, null, window.BlocksWager.address());   // įėjimo tx → serveris verifikuoja
      _status('⛓️ Stake sent - verifying…', true);
    });
  }

  function _doHost(tier, priv) {
    _bgActive = true; _myRole = priv ? 'private' : 'host'; _podClaimedMatch = false; _ensureGame();
    if (_wager()) {
      // 🧱💰 pay-on-accept: NEmokam dabar — tik sukuriam wager kambarį. Mokėsi kai atsiras varžovas ir sutiksi.
      _cmd(priv ? 'private' : 'host', null, tier, null, false, window.BlocksWager.address(), true);   // wager:true · serverAuth=FALSE → client-auth (be lago); cheat-apsauga per periodinę patikrą (LIKO)
      _status((priv ? 'Private room' : 'Hosting for ' + tier + ' RONKE') + ' — waiting…<br><span style="font-size:8px;opacity:.7;">you pay only when an opponent is matched · can close & keep playing</span>', true);
    } else {
      _cmd(priv ? 'private' : 'host', null, tier);   // nemokamas (client-board)
      _status((priv ? 'Creating private room' : 'Hosting for ' + tier + ' RONKE') + ' — waiting…<br><span style="font-size:8px;opacity:.7;">you can close this and keep playing</span>', true);
    }
  }
  // JOIN: jei wager → sumoka tą pačią pakopą į kambario on-chain matchId; kitaip nemokamas.
  function _doJoin(r) {
    _bgActive = true; _myRole = 'guest'; _podClaimedMatch = false; _ensureGame();
    if (_wager()) {
      // 🛡️ Apsauga: nesijunk į statymo kambarį, jei serveris NEGALI išmokėti (host'as be sukonfigūruoto serverio).
      if (r.wagerLive === false) { _bgActive = false; _status('This room\'s stakes are not live yet - pick a free match.', true); return; }
      // 🧱💰 pay-on-accept: NEmokam dabar — sumokėsi kai host'as patvirtins (abu moka kartu).
      _cmd('join', r.roomId, r.tier, null, false, window.BlocksWager.address(), true);   // wager:true · serverAuth=FALSE → client-auth (be lago)
      _status('Joining ' + _esc(r.host) + ' · ' + r.tier + ' RONKE — you pay when the match is confirmed…', true);
    } else {
      _cmd('join', r.roomId);
      _status('Joining ' + _esc(r.host) + ' (' + (r.tier || 69) + ' RONKE)…', true);
    }
  }
  // ── 🔗 KVIETIMO NUORODA: ?rbjoin=<roomId> → auto-join per panelę (kur YRA piniginė) ──────────
  //   Kvietimo nuoroda dabar veda į PILNĄ puslapį (ne standalone tetris), tad svečias turi piniginę
  //   ir gali sumokėti statymą. Anksčiau nuoroda vedė į tetris iframe be piniginės → tik host'as
  //   galėjo pasirašyti tx. Čia rūpinamės, kad svečias tvarkingai prisijungtų prie to paties kambario.
  function _fetchRoomById(roomId) {
    return _fetchWaiting().then(function (list) {
      var found = null;
      (list || []).forEach(function (r) { if (r.roomId === roomId) found = r; });
      return found;
    }).catch(function () { return null; });
  }
  function _autoJoinInvite(roomId, tries) {
    tries = tries || 0;
    _fetchRoomById(roomId).then(function (r) {
      if (!r) {
        // kambarių sąrašas gal dar kraunasi arba host'as dar nespėjo — kelis kartus pabandom
        if (tries < 10) { if (tries === 0) { _openPanel(); _status('🔗 Joining invited match…', true); } setTimeout(function () { _autoJoinInvite(roomId, tries + 1); }, 800); return; }
        _openPanel(); _status('Invite match not found — host may have left or the match is already full. Pick another below ↓', true); return;
      }
      // wager kambarys → reikia (a) prisijungusios piniginės, (b) užsikrovusio žaidimo iframe
      if (_wager()) {
        var a = ''; try { a = window.BlocksWager.address(); } catch (_) {}
        if (!a) {
          if (tries < 30) { if ((tries % 4) === 0) { _openPanel(); _status('🔗 Invited to a <b>' + (r.tier || 69) + ' RONKE</b> match — connect your wallet to join…', true); } setTimeout(function () { _autoJoinInvite(roomId, tries + 1); }, 800); return; }
          _openPanel(); _status('Connect your wallet, then open the invite link again.', true); return;
        }
      }
      // iframe turi būti užsikrovęs, kad _cmd('join') pasiektų jo žinučių klausytoją (kitaip komanda dingsta)
      _ensureGame();
      if (!_iframeLoaded && tries < 30) { if (tries === 0) { _openPanel(); _status('🔗 Joining invited match…', true); } setTimeout(function () { _autoJoinInvite(roomId, tries + 1); }, 400); return; }
      _openPanel();
      _doJoin(r);
    });
  }
  function _checkInviteJoin() {
    var roomId = null;
    try { roomId = new URLSearchParams(location.search).get('rbjoin'); } catch (_) {}
    if (!roomId) return;
    // pašalinam param iš adreso juostos (kad perkrovus nesijungtų vėl, ir liktų švarus URL)
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (_) {}
    // duodam puslapiui/piniginei šiek tiek laiko užsikrauti prieš pradedant
    setTimeout(function () { _ensureGame(); _autoJoinInvite(roomId, 0); }, 1200);
  }

  function _closePanel() {
    _disconnectLobby();
    if (_panelPoll) { clearInterval(_panelPoll); _panelPoll = null; }
    if (_panel) { try { _panel.remove(); } catch (_) {} _panel = null; }
    // FONE aktyvu (hostinu/laukiu) → PALIEKAM iframe gyvą + rodom „hosting" pill (galiu žaisti pilyje).
    if (_bgActive && !_gameOn) { _showHostPill(); return; }
    if (!_gameOn) _teardownGame();     // niekas neaktyvu — pašalinam paslėptą iframe
  }

  // ── „HOSTING" pill (kai panelė uždaryta, bet lauki oponento fone) ──
  function _showHostPill() {
    _css();
    var pill = document.getElementById('rb-host-pill');
    if (!pill) {
      pill = document.createElement('div'); pill.id = 'rb-host-pill';
      pill.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99400;font-family:monospace;' +
        'background:#241a08;border:1px solid #e0a832;border-radius:20px;padding:7px 10px 7px 14px;color:#ffd97a;font-size:12px;' +
        'display:flex;align-items:center;gap:9px;box-shadow:0 3px 12px rgba(0,0,0,.5);cursor:pointer;';
      pill.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#5ce08a;animation:rbLobbyPulse 1.1s ease-in-out infinite;"></span>' +
        '<span>🧱 waiting for opponent…</span>' +
        '<button id="rb-pill-x" title="Stop hosting" style="background:#3a2410;border:1px solid #6a4a18;color:#ffd97a;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:12px;line-height:1;">×</button>';
      document.body.appendChild(pill);
      pill.onclick = function (e) { if (e.target && e.target.id === 'rb-pill-x') { _cancelHosting(); } else { _hideHostPill(); _openPanel(); } };
    }
    pill.style.display = 'flex';
  }
  function _hideHostPill() { var p = document.getElementById('rb-host-pill'); if (p) p.style.display = 'none'; }
  function _cancelHosting() {
    _bgActive = false; _hideHostPill();
    _cmd('lobby');                    // iframe atsijungia nuo kambario (nebe host)
    _teardownGame();
  }

  // ── Paslėptas žaidimo iframe (embed=panel) ──────────────────────────────
  function _ensureGame() {
    if (_iframe) return;
    _gameWrap = document.createElement('div');
    _gameWrap.id = 'rb-game-wrap';
    _gameWrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#050508;visibility:hidden;';
    _iframe = document.createElement('iframe');
    _iframeLoaded = false;
    _iframe.addEventListener('load', function () { _iframeLoaded = true; });
    _iframe.src = 'tetris/index.html?net=colyseus&embed=panel';
    _iframe.style.cssText = 'border:0;width:100%;height:100%;display:block;';
    _iframe.setAttribute('allow', 'autoplay');
    var exit = document.createElement('button');
    exit.id = 'rb-game-exit';
    exit.textContent = '✕ EXIT';
    exit.style.cssText = 'position:absolute;top:10px;right:12px;z-index:2;font-family:monospace;font-size:14px;font-weight:800;' +
      'padding:8px 14px;border-radius:8px;border:1px solid #866;background:#2a1c1c;color:#fbb;cursor:pointer;';
    exit.onclick = _closeAll;
    _gameWrap.appendChild(_iframe); _gameWrap.appendChild(exit);
    document.body.appendChild(_gameWrap);
  }
  function _cmd(cmd, roomId, tier, mid, serverAuth, addr, wager) {
    try { if (_iframe && _iframe.contentWindow) _iframe.contentWindow.postMessage({ __rbpanel: 'cmd', cmd: cmd, roomId: roomId, tier: tier, mid: mid, serverAuth: serverAuth, addr: addr, wager: wager }, '*'); } catch (_) {}
  }
  function _revealGame() {
    if (_gameOn || !_gameWrap) return; _gameOn = true;
    _hideChallenge(); _hideHostPill();
    _gameWrap.style.visibility = 'visible';
    try { window.__minigameOpen = true; } catch (_) {}
    try { if (window._applyGlobalMute) window._applyGlobalMute(true); } catch (_) {}
    // slepiam panelę (bet žaidimas jau atidengtas) — NEteardown iframe
    if (_panelPoll) { clearInterval(_panelPoll); _panelPoll = null; }
    if (_panel) { try { _panel.remove(); } catch (_) {} _panel = null; }
  }

  // ── CHALLENGE dialogas („X wants to play — accept?") — rodomas ir uždarius panelę ──
  function _showChallenge(opponent) {
    _css(); _hideHostPill();
    var d = document.getElementById('rb-challenge');
    if (!d) {
      d = document.createElement('div'); d.id = 'rb-challenge';
      d.style.cssText = 'position:fixed;inset:0;z-index:99700;background:rgba(6,9,16,.82);display:flex;align-items:center;' +
        'justify-content:center;font-family:monospace;backdrop-filter:blur(3px);';
      document.body.appendChild(d);
    }
    d.innerHTML =
      '<div style="background:linear-gradient(180deg,#241a08,#140e04);border:3px solid #e0a832;border-radius:14px;padding:22px 26px;text-align:center;color:#ffd97a;box-shadow:0 0 40px rgba(224,168,50,.4);max-width:340px;">' +
        '<div style="font-size:30px;margin-bottom:6px;">⚔️</div>' +
        '<div style="font-size:15px;font-weight:800;letter-spacing:.5px;"><b style="color:#8fd8e0;">' + _esc(opponent || 'A player') + '</b></div>' +
        '<div style="font-size:12px;opacity:.85;margin:4px 0 18px;">wants to play RONKE BLOCKS 1v1!</div>' +
        '<div style="display:flex;gap:10px;">' +
          '<button id="rb-acc" class="rb-act" style="flex:1;padding:12px;border-radius:8px;border:2px solid #5ce08a;background:rgba(92,224,138,.15);color:#8fffb0;font:800 13px monospace;cursor:pointer;">✓ ACCEPT</button>' +
          '<button id="rb-dec" class="rb-act" style="flex:1;padding:12px;border-radius:8px;border:2px solid #e07070;background:rgba(224,112,112,.13);color:#ffb0b0;font:800 13px monospace;cursor:pointer;">✕ DECLINE</button>' +
        '</div></div>';
    d.style.display = 'flex';
    d.querySelector('#rb-acc').onclick = function () { _hideChallenge(); _cmd('accept'); };   // reveal ateis su state=countdown
    d.querySelector('#rb-dec').onclick = function () { _hideChallenge(); _cmd('decline'); if (_bgActive) _showHostPill(); };
    try { if (window.Sfx && window.Sfx.play) window.Sfx.play('notify'); } catch (_) {}
  }
  function _hideChallenge() { var d = document.getElementById('rb-challenge'); if (d) d.style.display = 'none'; }
  function _hideGame() {
    if (!_gameWrap) return; _gameOn = false;
    _gameWrap.style.visibility = 'hidden';
    try { window.__minigameOpen = false; window.dispatchEvent(new Event('minigame:closed')); } catch (_) {}
    try { if (window._applyGlobalMute) window._applyGlobalMute(localStorage.getItem('lenta_muted') === '1'); } catch (_) {}
  }
  function _teardownGame() {
    if (_gameWrap) { try { _gameWrap.remove(); } catch (_) {} }
    _gameWrap = null; _iframe = null; _gameOn = false; _iframeLoaded = false;
  }
  function _closeAll() {
    _bgActive = false; _hideChallenge(); _hideHostPill();
    _hideGame(); _teardownGame(); _closePanel();
  }

  // ── Žinutės iš žaidimo iframe (būsena) ──────────────────────────────────
  window.addEventListener('message', function (e) {
    var d = e && e.data; if (!d || d.__rbpanel !== 'state') return;
    // 🧱💰 wager įvykiai (nepriklauso nuo state) — mokėjimas/statusas/prizas/refund
    if (d.stakeNow) { _doStake(d.stakeTier); }
    if (d.wagerVerify) { _status('⛓️ Verifying stakes on-chain…', true); }
    if (d.wagerAbort) { _status('Stake ' + (d.wagerAbort === 'stake_verify_failed' ? 'verification failed' : 'issue') + ' — refunded. Try again.', true); }
    if (d.wagerPrize) { _wagerWin(d.wagerPrize, d.wagerPot); }
    var st = d.state; _lastState = st;
    if (d.myRoomId != null) _myRoomId = d.myRoomId;   // MANO kambarys → nerodom sąraše (negaliu prisijungti prie savęs)
    if (_panel && st !== 'lobby') _renderList();       // perpiešiam sąrašą be savo kambario
    if (st === 'countdown' || st === 'playing' || st === 'result') {
      if (!_podClaimedMatch && st !== 'result') { _podClaimedMatch = true; _podClaimPlay(); }   // 🏆 PoD: sužaistas žaidimas → player-signed claim
      _revealGame();                   // rungtynės prasidėjo / vyksta → atidengiam žaidimą
    } else if (st === 'challenge') {
      _showChallenge(d.opponent);      // oponentas prisijungė → „do you want to play?" (ir uždarius panelę)
    } else if (st === 'awaiting') {
      if (_panel) _status('Challenge sent - waiting for <b>' + _esc(d.host || 'host') + '</b> to accept...', true);
    } else if (st === 'connecting') {
      if (_panel) {
        var head = (d.priv && d.roomCode)
          ? 'PRIVATE ROOM<br><span style="font-size:14px;color:#ffcf5c;letter-spacing:2px;">' + _esc(String(d.roomCode).toUpperCase()) + '</span>'
          : 'Waiting for an opponent...<br><span style="font-size:8px;opacity:.7;">you can close this and keep playing</span>';
        /* Kvietimo NUORODA — ir HOST, ir PRIVATE. Bet kas ją atidaręs prisijungia (net neregistruotas). */
        var linkRow = d.inviteUrl
          ? '<br><button id="rb-copy" style="margin-top:8px;font:9px monospace;color:#8fd8e0;background:rgba(143,216,224,.12);border:1px solid #3a6a72;border-radius:5px;padding:6px 10px;cursor:pointer;">📋 COPY INVITE LINK</button>'
          : '';
        _status(head + linkRow, true);
        var cp = _panel.querySelector('#rb-copy');
        if (cp) cp.onclick = function () {
          try { if (navigator.clipboard && d.inviteUrl) { navigator.clipboard.writeText(d.inviteUrl); cp.textContent = '✓ link copied - send it to a friend!'; } } catch (_) {}
        };
      }
    } else if (st === 'lobby') {
      _hideChallenge(); _podClaimedMatch = false;   // nauja rungtynė → leidžiam kitą PoD claim (dedup lieka doneToday)
      if (_gameOn) { _bgActive = false; _myRole = ''; _hideGame(); _teardownGame(); _openPanel(); }   // grįžo po rungtynių → lobis
      else if (_myRole === 'guest') {
        // svečias buvo ATMESTAS / host išėjo → nerodom „hosting" pill; pranešam ir grįžtam
        _bgActive = false; _myRole = ''; _hideHostPill(); _teardownGame();
        if (_panel) { _status('Host declined or left - pick another opponent.', true); setTimeout(function () { if (_panel) _status('', false); }, 3500); }
      }
      else if (_panel) _status('', false);
      else if (_bgActive) _showHostPill();   // host/private lieka laukti fone
    }
  });

  // ── Init ────────────────────────────────────────────────────────────────
  function _start() {
    if (_running) return; _running = true;
    _poll(); _timer = setInterval(_poll, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) _poll(); });
    window.addEventListener('minigame:closed', function () { _lastCount = 0; setTimeout(_poll, 500); });
    _checkInviteJoin();   // 🔗 atidaryta per kvietimo nuorodą (?rbjoin=<id>) → auto-join
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _start); else _start();

  window.BlocksLobby = {
    open: _openPanel,
    refresh: _poll,
    _test: function (n, who) { _setBadge(n || 1); _toast(n || 1, who || 'TESTER'); },
    _setMine: function (id) { _myRoomId = id; _renderList(); },   // dev/test: pažymėti savo kambarį
  };
})();
