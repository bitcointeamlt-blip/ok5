// blocks_lobby_client.js — 🧱 PVP TETRIS lobis kaip F9 PANELĖ (stilius kaip RAID lentelė) + pranešimas.
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
  var SOL_TIERS = [0.10, 0.50, 1.00];      // 🟣 Solana pakopos USD (native SOL pagal kursą) — žr. blocks_solana.js
  var _selectedTier = 69;                  // pasirinkta RONKE pakopa
  var _selectedSol = 0.10;                 // 🟣 pasirinkta Solana pakopa (USD)
  var _chain = 'ronin';                    // 🔗 pasirinkta grandinė: 'ronin' (RONKE) | 'solana' (SOL)
  var _bgActive = false, _lastState = 'lobby', _myRole = '', _myRoomId = '';   // _bgActive: aktyvus FONE; _myRoomId: MANO kambarys (nerodom sąraše)
  var _aiPlayFlag = false;   // 🤖 „AI žaidžia už mane" PvP mače (+25 RONKE fee) — kai lagas/AFK; sesijos ribose
  var _challengeAck = false;               // 🛡️ challenge dialogas jau patvirtintas/atmestas → NEberodom dublio (event+interval abu siunčia 'challenge')
  var _hostInvite = null;                   // 🔗 {url,priv,roomCode} — kad hostui VĖL atsidarius panelę invite linkas nedingtų (iframe state nesikeičia → nesiunčia)

  // ── 🎁 REFERAL SISTEMA (Supabase anon REST — pattern iš pinball web3.js) ──
  var SB_URL = 'https://rbkivemouxwcgrpzazxb.supabase.co';
  var SB_KEY = 'sb_publishable_E4cHxTFKDTYgrdxcv5uRfQ_9tryLJ4p';   // publishable anon (client-public)
  function _sbHeaders(extra) { return Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, extra || {}); }
  function _isAddr(a) { return /^0x[0-9a-f]{40}$/.test(String(a || '').toLowerCase()); }
  function _myRef() { try { return String(localStorage.getItem('rb_ref') || '').toLowerCase(); } catch (_) { return ''; } }
  // Pagauna ?ref=<addr> iš URL (referal/invite linkas) → localStorage['rb_ref'] (PIRMAS laimi, ne self), nuvalo iš URL.
  function _captureRef() {
    var ref = '';
    try { ref = String(new URLSearchParams(location.search).get('ref') || '').toLowerCase(); } catch (_) {}
    if (!_isAddr(ref)) return;
    try {
      var mine = _walletAddr().toLowerCase();
      // naujausias invite linkas laimi (serveris vis tiek riša 1× negrįžtamai) — kad senas `rb_ref` neužstrigtų
      if (ref !== mine) localStorage.setItem('rb_ref', ref);
    } catch (_) {}
    try { var u = new URL(location.href); u.searchParams.delete('ref'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (_) {}
  }
  function _refLink() { var a = _walletAddr(); return a ? (location.origin + location.pathname + '?ref=' + a) : ''; }
  // Statistika: 1 Supabase eilutė refearn_<R> = { accrued, claimed, games, referrals }.
  function _refStats(addr) {
    var R = String(addr || '').toLowerCase();
    if (!_isAddr(R)) return Promise.resolve(null);
    return fetch(SB_URL + '/rest/v1/f9_bases?select=buildings&ronin_address=eq.refearn_' + R, { headers: _sbHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        var b = (rows && rows[0] && rows[0].buildings) || {};
        var accrued = Number(b.accrued) || 0, claimed = Number(b.claimed) || 0;
        return { referrals: Number(b.referrals) || 0, games: Number(b.games) || 0, accrued: accrued, claimed: claimed, claimable: Math.max(0, accrued - claimed) };
      }).catch(function () { return null; });
  }
  // Claim: rašom refclaimreq_<R> → colyseus serveris drenuoja → pool payout per flushQueue (moka TIK į R).
  function _requestClaim(addr) {
    var R = String(addr || '').toLowerCase();
    if (!_isAddr(R)) return Promise.reject(new Error('no wallet'));
    return fetch(SB_URL + '/rest/v1/f9_bases', {
      method: 'POST', headers: _sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ ronin_address: 'refclaimreq_' + R, buildings: { addr: R, at: Date.now() } }),
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return true; });
  }
  function _fmtRonke(n) { n = Number(n) || 0; return String(Math.round(n * 100) / 100); }
  function _refStatCell(label) {
    return '<div style="background:#0c1020;border:1px solid #46567e;border-radius:6px;padding:10px;text-align:center;">' +
      '<div class="rb-ref-val" style="font-size:16px;color:#ffcf5c;">…</div>' +
      '<div style="font-size:7px;color:#6a7a8a;margin-top:4px;letter-spacing:.5px;">' + label + '</div></div>';
  }
  // 🎁 Referal panelė (overlay): linkas + statistika + CLAIM.
  function _openReferralPanel() {
    var addr = _walletAddr();
    var myRef = _myRef();   // 🔗 kas MANE pakvietė (rb_ref) — parodom, kad user matytų ar prilipo
    var ov = document.createElement('div'); ov.id = 'rb-ref-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,22,0.94);z-index:99100;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    var p = document.createElement('div');
    p.style.cssText = 'background:linear-gradient(180deg,#1f2940 0%,#0c1020 100%);border:3px solid #ffcf5c;box-shadow:0 0 48px rgba(255,207,92,0.35);border-radius:8px;padding:22px 26px;width:520px;max-width:96vw;max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:12px;' +
      "font-family:'Press Start 2P',monospace,sans-serif;font-size:12px;line-height:1.6;color:#8a9aaa;";
    var link = _refLink();
    p.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:1px solid #4a3a18;">' +
        '<span style="font-size:22px;">🎁</span><span style="flex:1;font-size:15px;color:#ffcf5c;letter-spacing:1px;">REFERRALS</span>' +
        '<button id="rb-ref-x" style="background:none;border:none;color:#8a9aaa;font-size:22px;cursor:pointer;font-family:inherit;">×</button>' +
      '</div>' +
      (addr
        ? ((myRef && myRef !== String(addr).toLowerCase()
             ? '<div style="font-size:9px;color:#aef0b0;background:rgba(92,224,138,.10);border:1px solid #3a7a4a;border-radius:6px;padding:9px;">🔗 You were invited by <b>' + _shortAddr(myRef) + '</b> — play any match to lock it in.</div>'
             : '') +
           '<div style="font-size:10px;color:#9fb0c0;">Share your link. When someone plays their FIRST tetris match (free or wager) through it, they become your referral — forever. You earn <b style="color:#ffd97a;">5% of their stake</b> on EVERY wager game they play.</div>' +
           '<div style="font-size:9px;color:#6a7a8a;">YOUR REFERRAL LINK</div>' +
           '<div style="display:flex;gap:8px;"><input id="rb-ref-link" readonly value="' + _esc(link) + '" style="flex:1;min-width:0;background:#0c1020;border:1px solid #46567e;border-radius:6px;color:#bff0f6;font:600 10px monospace;padding:10px;"/>' +
             '<button id="rb-ref-copy" style="background:rgba(143,216,224,.18);border:2px solid #5aa8b4;border-radius:6px;color:#bff0f6;font:800 13px monospace;padding:0 14px;cursor:pointer;">📋</button></div>' +
           '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;">' +
             _refStatCell('REFERRALS') + _refStatCell('THEIR GAMES') + _refStatCell('EARNED') + _refStatCell('CLAIMABLE') +
           '</div>' +
           '<button id="rb-ref-claim" style="padding:14px;border-radius:6px;border:2px solid #5ce08a;background:rgba(92,224,138,.14);color:#aef0b0;font-family:inherit;font-size:13px;cursor:not-allowed;opacity:.5;">CLAIM —</button>' +
           '<div id="rb-ref-msg" style="font-size:9px;color:#6a7a8a;text-align:center;min-height:12px;"></div>')
        : '<div style="font-size:11px;color:#ffd97a;text-align:center;padding:20px 0;">Connect your wallet first to get your referral link.</div>'
      );
    ov.appendChild(p); document.body.appendChild(ov);
    p.querySelector('#rb-ref-x').onclick = function () { try { ov.remove(); } catch (_) {} };
    if (!addr) return;
    var copy = p.querySelector('#rb-ref-copy');
    if (copy) copy.onclick = function () { try { navigator.clipboard.writeText(link); copy.textContent = '✓'; setTimeout(function () { copy.textContent = '📋'; }, 1500); } catch (_) {} };
    var claimBtn = p.querySelector('#rb-ref-claim'), msg = p.querySelector('#rb-ref-msg');
    function _refresh() {
      _refStats(addr).then(function (s) {
        if (!document.body.contains(p)) return;
        s = s || { referrals: 0, games: 0, accrued: 0, claimed: 0, claimable: 0 };
        var cells = p.querySelectorAll('.rb-ref-val');
        if (cells[0]) cells[0].textContent = s.referrals;
        if (cells[1]) cells[1].textContent = s.games;
        if (cells[2]) cells[2].textContent = _fmtRonke(s.accrued);
        if (cells[3]) cells[3].textContent = _fmtRonke(s.claimable);
        if (claimBtn) {
          if (s.claimable > 0) { claimBtn.disabled = false; claimBtn.style.cursor = 'pointer'; claimBtn.style.opacity = '1'; claimBtn.textContent = 'CLAIM ' + _fmtRonke(s.claimable) + ' RONKE'; }
          else { claimBtn.disabled = true; claimBtn.style.cursor = 'not-allowed'; claimBtn.style.opacity = '.5'; claimBtn.textContent = 'CLAIM —'; }
        }
      });
    }
    _refresh();
    if (claimBtn) claimBtn.onclick = function () {
      if (claimBtn.disabled) return;
      claimBtn.disabled = true; claimBtn.style.opacity = '.5'; claimBtn.style.cursor = 'not-allowed';
      if (msg) msg.textContent = 'Requesting claim…';
      _requestClaim(addr).then(function () {
        if (msg) msg.innerHTML = '<span style="color:#aef0b0;">✓ Claim queued — RONKE arrives to your wallet shortly.</span>';
        setTimeout(_refresh, 30000);   // serveris drenuoja ~25s + flushQueue išmoka
      }).catch(function (e) {
        if (msg) msg.innerHTML = '<span style="color:#e88;">Claim failed: ' + _esc((e && e.message) || 'error') + '</span>';
        _refresh();
      });
    };
  }

  // ── 🏅 REITINGO SISTEMA (lygos + žvaigždutės + deko XP) — Supabase anon REST, veidrodis serverio RankStore ──
  var RANK_LEAGUES = ['PAPER', 'WOOD', 'STONE', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'GLOBAL'];
  var RANK_ICON = ['📄', '🌳', '🪨', '🥉', '🥈', '🥇', '💎', '🌐'];
  function _rankDecode(score) {
    var s = Math.max(0, Math.min(48, Math.round(Number(score) || 0)));
    var lg = Math.min(7, Math.floor(s / 6)), hs = s - lg * 6;
    return { score: s, league: lg, hs: hs, stars: hs / 2, name: RANK_LEAGUES[lg], icon: RANK_ICON[lg] };
  }
  function _rankRate(score) { var d = _rankDecode(score); if (d.league <= 0) return 50; return 50 + 10 * ((d.league - 1) * 3 + Math.floor(d.hs / 2)); }
  // 3 žvaigždutės su pusžvaigžde (hs 0..6): pilna=auksinė, pusė=blyški, tuščia=pilka
  function _starsHtml(hs, sz) {
    var full = Math.floor(hs / 2), half = hs % 2, out = '', px = sz || 15;
    for (var i = 0; i < 3; i++) {
      var col = (i < full) ? '#ffcf5c' : ((i === full && half) ? 'rgba(255,207,92,.42)' : '#38455a');
      out += '<span style="color:' + col + ';font-size:' + px + 'px;text-shadow:' + (i < full ? '0 0 8px rgba(255,207,92,.55)' : 'none') + ';">★</span>';
    }
    return out;
  }
  // ── 🎬 REITINGO ANIMACIJA po mačo (PIXEL ART) — kad žaidėjas PAJUSTŲ progresą ──────────────────
  //   Žaidimo stiliumi: laiptuoti pikseliniai rėmai, žvaigždės+lygos skydas iš box-shadow pikselių,
  //   segmentiniai barai, steps() animacijos, kietas 2px šešėlis. AI statai — DIDELI skaičiai su count-up.
  function _rankAnimCss() {
    if (document.getElementById('rb-rankanim-css')) return;
    var st = document.createElement('style'); st.id = 'rb-rankanim-css';
    st.textContent =
      '@keyframes rbPxIn{0%{transform:scale(.82);opacity:0;}60%{transform:scale(1.04);opacity:1;}100%{transform:scale(1);}}' +
      '@keyframes rbPxPop{0%{transform:scale(0) rotate(-30deg);}60%{transform:scale(1.5) rotate(6deg);}100%{transform:scale(1) rotate(0);}}' +
      '@keyframes rbPxBigPop{0%{transform:scale(2.1);opacity:0;}65%{transform:scale(.95);opacity:1;}100%{transform:scale(1);}}' +
      '@keyframes rbPxBlink{0%,49%{opacity:1;}50%,100%{opacity:.3;}}' +
      '@keyframes rbPxShake{0%,100%{transform:translate(0,0);}20%{transform:translate(-7px,2px);}45%{transform:translate(6px,-2px);}70%{transform:translate(-4px,1px);}}' +
      '@keyframes rbPxConf{0%{transform:translateY(-24px) rotate(0);opacity:1;}88%{opacity:1;}100%{transform:translateY(380px) rotate(560deg);opacity:0;}}' +
      '@keyframes rbPxRise{0%{opacity:0;transform:translateY(14px);}100%{opacity:1;transform:none;}}' +
      '@keyframes rbPxNum{0%{transform:scale(1.35);}100%{transform:scale(1);}}' +
      '@keyframes rbPxGlow{0%,100%{transform:scale(1);opacity:.75;}50%{transform:scale(1.14);opacity:1;}}' +
      '@keyframes rbPxRing{0%{transform:scale(.45);opacity:1;}100%{transform:scale(1.65);opacity:0;}}' +
      '@keyframes rbPxSweep{0%{transform:translateX(-160%) skewX(-18deg);}100%{transform:translateX(420%) skewX(-18deg);}}';
    document.head.appendChild(st);
  }
  // 🖼️ SPRITE ikonos: žvaigždės (savos, Kyrise paletė) + statų ikonos (Kyrise 16x16 pack, CC BY 4.0,
  //   žr. assets_rank/LICENSE.txt) + lygų EMBLEMOS (userio Ronke ženklai, assets_rank/emb_0..7.png).
  function _pxStarHtml(mode, anim, lose) {
    var st = 'display:inline-block;margin:0 6px;' + (anim ? 'animation:' + (lose ? 'rbPxShake .5s ease' : 'rbPxPop .55s cubic-bezier(.2,1.6,.4,1)') + ' both;' : '');
    return '<span style="' + st + '"><img src="assets_rank/star_' + mode + '.png" alt="" style="width:45px;height:42px;image-rendering:pixelated;display:block;"></span>';
  }
  function _pxStarsRow(hs, popIdx, lose) {
    var full = Math.floor(hs / 2), half = hs % 2, out = '';
    for (var i = 0; i < 3; i++) {
      var mode = (i < full) ? 'full' : ((i === full && half) ? 'half' : 'empty');
      out += _pxStarHtml(mode, i === popIdx, lose);
    }
    return out;
  }
  function _pxShieldHtml(league, slam) {
    var anim = slam ? 'animation:rbPxBigPop .55s cubic-bezier(.2,1,.3,1) both;' : 'animation:rbPxIn .4s cubic-bezier(.2,1.3,.4,1) both;';
    return '<img src="assets_rank/emb_' + (Number(league) || 0) + '.png" alt="" style="width:145px;height:145px;display:block;margin:0 auto;filter:drop-shadow(0 5px 10px rgba(0,0,0,.55));' + anim + '">';
  }
  function _showRankAnim(d) {
    try {
      _css();   // .rb-aironke klase (jei panele dar nebuvo atidaryta)
      _rankAnimCss();
      var before = _rankDecode(d.before), after = _rankDecode(d.after);
      var won = !!d.won;
      var promoted = after.league > before.league, demoted = after.league < before.league;
      var old = document.getElementById('rb-rankanim-ov'); if (old) { try { old.remove(); } catch (_) {} }
      var ov = document.createElement('div'); ov.id = 'rb-rankanim-ov';
      ov.style.cssText = 'position:fixed;inset:0;z-index:100060;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(4,6,12,.85);font-family:monospace;cursor:pointer;image-rendering:pixelated;';
      var accent = won ? '#5ce08a' : '#e07070';
      var card = document.createElement('div');
      card.style.cssText = 'position:relative;overflow:hidden;background:#171204;border:3px solid ' + (won ? '#5ce08a' : '#7a4444') + ';' +
        'padding:32px 46px;text-align:center;color:#ffd97a;max-width:460px;min-width:340px;' +
        'box-shadow:0 0 0 2px #000,0 0 28px ' + (won ? 'rgba(92,224,138,.35)' : 'rgba(224,112,112,.3)') + ';' +
        'animation:rbPxIn .32s cubic-bezier(.2,1.3,.4,1) both;';
      // ⛏️ laiptuoti pikseliniai kampai: 4 juodi kvadratėliai „nukerta" rėmo kampus
      var notch = '';
      ['top:-3px;left:-3px;', 'top:-3px;right:-3px;', 'bottom:-3px;left:-3px;', 'bottom:-3px;right:-3px;'].forEach(function (pos) {
        notch += '<span style="position:absolute;width:6px;height:6px;background:#0a0d14;' + pos + '"></span>';
      });
      card.innerHTML = notch +
        '<div style="font-size:18px;font-weight:800;letter-spacing:3px;color:' + accent + ';text-shadow:1px 1px 0 #000;margin-bottom:14px;">' +
          (won ? 'VICTORY' : 'DEFEAT') + ' <span style="animation:rbPxBlink 1s steps(1) infinite;">' + (won ? '+1★' : '-½★') + '</span></div>' +
        '<div id="rb-ra-embwrap" style="position:relative;width:152px;height:148px;margin:0 auto 12px;">' +
          '<div id="rb-ra-glow" style="position:absolute;inset:-20px;border-radius:50%;pointer-events:none;background:radial-gradient(circle, rgba(255,215,92,' + (won ? '.5' : '.16') + ') 0%, rgba(255,215,92,0) 62%);animation:rbPxGlow 2.4s ease-in-out infinite;"></div>' +
          '<div id="rb-ra-icon" style="position:relative;line-height:1;">' + _pxShieldHtml(before.league, false) + '</div>' +
        '</div>' +
        '<div id="rb-ra-name" style="font-size:23px;font-weight:800;letter-spacing:4px;text-shadow:1px 1px 0 #000;margin-bottom:11px;">' + before.name + '</div>' +
        '<div id="rb-ra-stars" style="min-height:48px;">' + _pxStarsRow(before.hs, -1, false) + '</div>' +
        '<div id="rb-ra-note" style="font-size:12px;color:#8a9aaa;margin-top:11px;min-height:15px;"></div>' +
        '<div id="rb-ra-ai" style="max-height:0;opacity:0;overflow:hidden;transition:max-height .5s ease,opacity .45s ease;text-align:left;"></div>' +
        '<div style="margin-top:18px;"><button id="rb-ra-close" style="font-family:monospace;font-size:14px;font-weight:800;letter-spacing:2px;padding:12px 34px;border:3px solid ' + (won ? '#5ce08a' : '#8a5a5a') + ';background:' + (won ? 'rgba(92,224,138,.16)' : 'rgba(224,112,112,.12)') + ';color:' + (won ? '#8fffb0' : '#ffb0b0') + ';cursor:pointer;text-shadow:1px 1px 0 #000;box-shadow:0 0 0 2px #000,inset -2px -3px 0 rgba(0,0,0,.35);">▶ CONTINUE</button></div>';
      ov.appendChild(card); document.body.appendChild(ov);
      // 🤖 AI statų fazė rodoma tik kai boto pakopa realiai pasikeitė (pergalė visada; pralaimėjus — kas antrą)
      var aiCh = d.ai && d.ai.before && d.ai.after && d.ai.before.step !== d.ai.after.step;
      var kill = function () {
        try { ov.remove(); } catch (_) {}
        if (_xpReport && (_xpReport.pool > 0 || _xpReport.gain > 0)) setTimeout(_showXpAssign, 150);   // 🎖️ XP priskirstymas po korteles
      };
      ov.onclick = kill;
      // ✋ kortelė NEsislepia pati — uždarai TU (▶ CONTINUE arba paspaudimas bet kur) [user 08-09]
      // FAZĖ 2 (po 900ms): žvaigždutės pokytis + (jei keitėsi lyga) skydo SLAM + pixel konfeti / vinjetė
      setTimeout(function () {
        if (!document.getElementById('rb-rankanim-ov')) return;
        var stars = card.querySelector('#rb-ra-stars'), note = card.querySelector('#rb-ra-note');
        var icon = card.querySelector('#rb-ra-icon'), name = card.querySelector('#rb-ra-name');
        var popIdx = Math.max(0, Math.min(2, Math.floor((Math.max(before.hs, after.hs) - 1) / 2)));
        if (promoted || demoted) {
          icon.innerHTML = _pxShieldHtml(after.league, true);
          var wrap = card.querySelector('#rb-ra-embwrap');
          if (wrap && promoted) {
            var ring = document.createElement('div');
            ring.style.cssText = 'position:absolute;inset:-8px;border:3px solid #ffd75c;border-radius:50%;pointer-events:none;animation:rbPxRing .85s cubic-bezier(.2,.8,.3,1) both;';
            wrap.appendChild(ring);
            var sw = document.createElement('div');
            sw.style.cssText = 'position:absolute;inset:2px;overflow:hidden;pointer-events:none;';
            sw.innerHTML = '<div style="position:absolute;top:-25%;bottom:-25%;left:0;width:34%;background:linear-gradient(105deg,rgba(255,255,255,0),rgba(255,255,255,.8),rgba(255,255,255,0));animation:rbPxSweep .85s ease .2s both;"></div>';
            wrap.appendChild(sw);
          }
          name.textContent = after.name;
          name.style.animation = 'rbPxBigPop .5s cubic-bezier(.2,1,.3,1) both';
          note.innerHTML = promoted
            ? '<b style="color:#8fffb0;font-size:12px;">⬆ PROMOTED TO ' + after.name + '!</b>'
            : '<b style="color:#ffb0b0;font-size:12px;">⬇ demoted to ' + after.name + '</b>';
          popIdx = Math.floor((after.hs === 0 ? 0 : after.hs - 1) / 2);
        } else {
          note.innerHTML = won ? '<b style="color:#8fffb0;">keep going — next star awaits!</b>' : 'win it back — your AI grows with you';
        }
        stars.innerHTML = _pxStarsRow(after.hs, popIdx, !won);
        if (!won) card.style.animation = 'rbPxShake .5s ease';
        if (won) {
          // 🎉 pixel konfeti — dideli kvadratai, krenta „laipteliais" (promotion = dvigubai)
          var n = promoted ? 32 : 16, cols = ['#ffd75c', '#5ce08a', '#7fd4e8', '#b98cff', '#ff9d5c'];
          for (var i = 0; i < n; i++) {
            var sz = (Math.random() < 0.5 ? 5 : 7);
            var f = document.createElement('div');
            f.style.cssText = 'position:absolute;top:-16px;left:' + (3 + Math.random() * 94) + '%;width:' + sz + 'px;height:' + sz + 'px;' +
              'background:' + cols[i % cols.length] + ';pointer-events:none;' +
              'animation:rbPxConf ' + (1.2 + Math.random() * 1.5).toFixed(2) + 's linear ' + (Math.random() * 0.9).toFixed(2) + 's forwards;';
            card.appendChild(f);
          }
        } else if (demoted) {
          ov.style.background = 'radial-gradient(ellipse at center, rgba(4,6,12,.85) 55%, rgba(120,20,20,.55) 100%)';
        }
      }, 900);
      // 🤖 FAZĖ 3 (po 1.9s): TAVO AI statai — DIDELI skaičiai su count-up + segmentiniai pixel barai.
      //   Normalizacija = serverio AiLevels kreivės ribos: move 340→42ms, think 1000→70ms, acc 45→100%.
      if (aiCh) setTimeout(function () {
        if (!document.getElementById('rb-rankanim-ov')) return;
        var A = d.ai.before, B = d.ai.after, up = B.step > A.step;
        var accA = Math.round((1 - (A.mistake || 0)) * 100), accB = Math.round((1 - (B.mistake || 0)) * 100);
        function pct(v, lo, hi) { return Math.max(4, Math.min(100, Math.round((v - lo) / (hi - lo) * 100))); }
        var SEG = 14;   // segmentų kiekis bare
        var rows = [
          { ic: 'stat_spd', lb: 'SPEED', a: A.moveMs, b: B.moveMs, unit: 'ms', pA: pct(340 - A.moveMs, 0, 298), pB: pct(340 - B.moveMs, 0, 298) },
          { ic: 'stat_thk', lb: 'THINKING', a: A.thinkMs, b: B.thinkMs, unit: 'ms', pA: pct(1000 - A.thinkMs, 0, 930), pB: pct(1000 - B.thinkMs, 0, 930) },
          { ic: 'stat_acc', lb: 'ACCURACY', a: accA, b: accB, unit: '%', pA: pct(accA, 40, 100), pB: pct(accB, 40, 100) }
        ];
        var host = card.querySelector('#rb-ra-ai'); if (!host) return;
        var h = '<div style="border-top:2px solid #3a3222;margin-top:12px;padding-top:11px;">' +
          '<div style="font-size:14px;font-weight:800;letter-spacing:2px;color:' + (up ? '#8fffb0' : '#ffb0b0') + ';text-align:center;text-shadow:1px 1px 0 #000;">' +
            (up ? _aironkeHtml(24) + ' YOUR AI LEVELED UP' : _aironkeHtml(24) + ' your AI got weaker') + '</div>' +
          '<div style="font-size:11px;color:#8a9aaa;text-align:center;margin:5px 0 12px;">' + _esc(A.name) + ' → <b style="color:#ffd97a;">' + _esc(B.name) + '</b></div>';
        for (var ri = 0; ri < rows.length; ri++) {
          var rr = rows[ri];
          var segFillA = Math.max(1, Math.round(rr.pA / 100 * SEG)), segFillB = Math.max(1, Math.round(rr.pB / 100 * SEG));
          var cells = '';
          for (var ci = 0; ci < SEG; ci++) {
            cells += '<span class="rb-px-cell" data-on="' + (ci < segFillA ? 1 : 0) + '" style="flex:1;height:14px;margin-right:2px;' +
              'background:' + (ci < segFillA ? '#e0a832' : '#242c3c') + ';box-shadow:inset -1px -2px 0 rgba(0,0,0,.35);"></span>';
          }
          h += '<div class="rb-ra-airow" style="opacity:0;transform:translateY(12px);animation:rbPxRise .45s cubic-bezier(.16,1,.3,1) ' + (0.15 + ri * 0.3) + 's both;margin:11px 0;">' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">' +
              '<span style="font-size:13px;font-weight:800;color:#cfc39f;letter-spacing:1px;"><img src="assets_rank/' + rr.ic + '.png" alt="" style="width:16px;height:16px;image-rendering:pixelated;vertical-align:-3px;"> ' + rr.lb + '</span>' +
              '<span style="font-variant-numeric:tabular-nums;"><span style="font-size:12px;color:#7a8697;">' + rr.a + rr.unit + '</span>' +
                ' <span style="font-size:12px;color:#5a6a7a;">→</span> ' +
                '<b class="rb-ra-num" data-a="' + rr.a + '" data-b="' + rr.b + '" data-u="' + rr.unit + '" data-seg="' + segFillB + '" style="font-size:21px;color:' + (up ? '#8fffb0' : '#ffb0b0') + ';text-shadow:1px 1px 0 #000;">' + rr.a + rr.unit + '</b></span>' +
            '</div>' +
            '<div class="rb-px-bar" style="display:flex;">' + cells + '</div></div>';
        }
        if (!A.hold && B.hold) h += '<div style="text-align:center;margin-top:10px;font-size:11px;color:#7fd4e8;animation:rbPxBlink .8s steps(1) 1.2s 6;">🔓 HOLD UNLOCKED — your AI banks pieces now!</div>';
        h += '</div>';
        host.innerHTML = h;
        host.style.maxHeight = '380px'; host.style.opacity = '1';
        // count-up skaičiukai (rAF, ease-out, pabaigoje POP) + segmentų pildymas po vieną (pixel „kraunasi")
        setTimeout(function () {
          host.querySelectorAll('.rb-ra-airow').forEach(function (row, ri2) {
            var num = row.querySelector('.rb-ra-num');
            var a = Number(num.getAttribute('data-a')), b = Number(num.getAttribute('data-b')), u = num.getAttribute('data-u');
            var segB = Number(num.getAttribute('data-seg'));
            var cells2 = row.querySelectorAll('.rb-px-cell');
            var t0 = null, DUR = 950;
            function tick(ts) {
              if (t0 == null) t0 = ts;
              var k = Math.min(1, (ts - t0) / DUR); var e = 1 - Math.pow(1 - k, 3);
              num.textContent = Math.round(a + (b - a) * e) + u;
              // segmentai pildosi kartu su skaičiumi — kiekvienas naujas „užsidega" auksu→žaliai
              var lit = Math.round(segB * e);
              for (var ci2 = 0; ci2 < cells2.length; ci2++) {
                if (ci2 < lit && cells2[ci2].getAttribute('data-on') !== '2') {
                  cells2[ci2].setAttribute('data-on', '2');
                  cells2[ci2].style.background = up ? '#5ce08a' : '#e07070';
                }
              }
              if (k < 1) requestAnimationFrame(tick);
              else num.style.animation = 'rbPxNum .28s cubic-bezier(.2,1.4,.4,1)';
            }
            setTimeout(function () { requestAnimationFrame(tick); }, 350 + ri2 * 300);
          });
        }, 80);
      }, 1900);
    } catch (e) { console.warn('[rankAnim]', e); }
  }
  // 🖼️ sprite žvaigždutės (assets_rank/star_*.png, 15x14) — w=plotis px, aukštis proporcingas
  function _spriteStars(hs, w) {
    var full = Math.floor(hs / 2), half = hs % 2, out = '', hpx = Math.round(w * 14 / 15);
    for (var i = 0; i < 3; i++) {
      var mode = (i < full) ? 'full' : ((i === full && half) ? 'half' : 'empty');
      out += '<img src="assets_rank/star_' + mode + '.png" alt="" style="width:' + w + 'px;height:' + hpx + 'px;image-rendering:pixelated;margin:0 2px;vertical-align:middle;">';
    }
    return out;
  }
  // ── 🎖️⛓ MAČO XP → ON-CHAIN (kaip PewPew Saga): tetris-xp-claim edge fn pasirašo XpAward voucher'į,
  //   ŽAIDĖJAS pats siunčia awardBattleXp tx į PewPewBarracks (moka gas) → unito XP/LV auga VISUR
  //   (barracks, dekas, F9), nes tiesa gyvena kontrakte. Kambario gyvumo NEBEREIKIA — veikia ir iš RANK panelės.
  var _xpReport = null;
  var _xpState = null;
  var _xpBusy = false;
  var _XP_SPRITE = { skull: 'unit-images/skull-idle.gif', archer: 'unit-images/archer-idle.gif', shaman: 'unit-images/shaman-idle.gif', harpoon_fish: 'unit-images/harpoon-idle.gif', ghost: 'unit-images/ghost-idle.png', ronhood: 'unit-images/ronhood-idle.png', pigronke: 'unit-images/hog-idle.gif', hog_rider: 'unit-images/hog-idle.gif' };
  var _XP_UNAME = { skull: 'SKULL', archer: 'ARCHER', shaman: 'SHAMAN', harpoon_fish: 'HARPOON', ghost: 'GHOST', ronhood: 'RONKEHOOD', pigronke: 'HOG RIDER', hog_rider: 'HOG RIDER' };
  function _xpLvl(xp) { return Math.floor(Math.sqrt(Math.max(0, xp) / 100)); }   // = kontrakto _levelFromXp
  function _xpLvlPct(xp) { var L = _xpLvl(xp), lo = L * L * 100, hi = (L + 1) * (L + 1) * 100; return Math.max(0, Math.min(1, (xp - lo) / (hi - lo))); }
  function _xpFn(body) {
    return fetch(SB_URL + '/functions/v1/tetris-xp-claim', { method: 'POST', headers: _sbHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function _xpProvider() {
    try { if (window.Wallet && window.Wallet._getProvider) { var p = window.Wallet._getProvider(); if (p) return p; } } catch (_) {}
    return (window.ronin && window.ronin.provider) || window.ethereum || null;
  }
  function _xpAnimCss() {
    if (document.getElementById('rb-xpanim-css')) return;
    var st = document.createElement('style'); st.id = 'rb-xpanim-css';
    st.textContent =
      '@keyframes rbXpRise{0%{opacity:1;transform:translateY(0) scale(1);}100%{opacity:0;transform:translateY(-64px) scale(1.55);}}' +
      '@keyframes rbXpFloat{0%{opacity:0;transform:translateY(10px);}15%{opacity:1;}100%{opacity:0;transform:translateY(-44px);}}';
    document.head.appendChild(st);
  }
  // Panelė: po mačo (xp_report) ARBA standalone iš RANK panelės — duomenys iš edge fn + on-chain.
  function _showXpAssign(opts) {
    try {
      opts = opts || {};
      var rep = (opts && opts.standalone) ? null : _xpReport;
      var addr = String(_walletAddr() || '').toLowerCase();
      if (!_isAddr(addr)) return;
      _rankAnimCss(); _xpAnimCss();
      var old = document.getElementById('rb-xpassign-ov'); if (old) { try { old.remove(); } catch (_) {} }
      _xpBusy = false;
      var ov = document.createElement('div'); ov.id = 'rb-xpassign-ov';
      ov.style.cssText = 'position:fixed;inset:0;z-index:100062;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(4,6,12,.85);font-family:monospace;';
      var card = document.createElement('div');
      card.style.cssText = 'position:relative;background:#171204;border:3px solid #ffd75c;padding:24px 30px;color:#ffd97a;' +
        'max-width:460px;min-width:320px;max-height:82vh;overflow:auto;box-shadow:0 0 0 2px #000,0 0 28px rgba(255,215,92,.35);' +
        'animation:rbPxIn .32s cubic-bezier(.2,1.3,.4,1) both;text-align:center;';
      var h = '<div style="font-size:16px;font-weight:800;letter-spacing:2px;text-shadow:1px 1px 0 #000;">⛓ UNIT XP</div>';
      if (rep) {
        h += '<div style="font-size:11px;color:#8fffb0;margin:8px 0 2px;">earned this match: <b>+' + (rep.gain | 0) + ' XP</b>' +
          ' <span style="color:#8a9aaa;">(' + (rep.lines | 0) + ' lines × ' + (rep.mult | 0) + ')</span></div>';
      }
      h += '<div style="font-size:11px;color:#ffd75c;margin:6px 0 10px;">pool to assign: <b id="rb-xp-poolnum">…</b></div>' +
        '<div id="rb-xp-pend"></div>' +
        '<div id="rb-xp-units"><div style="font-size:10px;color:#8a9aaa;padding:14px 0;">⏳ loading units from chain…</div></div>' +
        '<div id="rb-xp-flow" style="display:none;font-size:10px;margin-top:10px;padding:8px 10px;background:#0e1420;border:1px solid #2a3550;"></div>' +
        '<div style="margin-top:14px;"><button id="rb-xp-close" style="font-family:monospace;font-size:11px;font-weight:800;padding:9px 26px;border:2px solid #4a5a75;background:none;color:#9db0cc;cursor:pointer;">CLOSE</button></div>';
      card.innerHTML = h;
      ov.appendChild(card); document.body.appendChild(ov);
      var cb = card.querySelector('#rb-xp-close');
      if (cb) cb.onclick = function () { if (_xpBusy) return; try { ov.remove(); } catch (_) {} _xpReport = null; };
      _xpLoadPanel(card, addr, rep);
    } catch (e) { console.warn('[xpAssign]', e); }
  }
  function _xpLoadPanel(card, addr, rep) {
    _xpFn({ action: 'status', wallet: addr }).catch(function () { return null; }).then(function (st) {
      if (!document.body.contains(card)) return;
      var pool = (st && st.ok) ? (st.pool | 0) : ((rep && rep.pool) | 0);
      var legacy = (st && st.ok && st.units) || {};
      _xpState = { addr: addr, pool: pool, legacy: legacy, units: {} };
      var pn = card.querySelector('#rb-xp-poolnum'); if (pn) pn.textContent = pool + ' XP';
      if (st && st.ok && st.pending) _xpShowPending(st.pending);
      var ids = [];
      if (rep && rep.units && rep.units.length) ids = rep.units.map(function (u) { return String(u.id); });
      else { try { ids = ((window.BarracksNFT && window.BarracksNFT.getDeck) ? window.BarracksNFT.getDeck(addr) : []).map(String); } catch (_) { ids = []; } }
      var box = card.querySelector('#rb-xp-units');
      if (!ids.length) {
        if (box) box.innerHTML = '<div style="font-size:11px;color:#8a9aaa;padding:14px 0;">no registered deck units found<br><span style="font-size:9px;opacity:.7;">register units in your castle deck first — XP stays in your pool</span></div>';
        return;
      }
      var meta = {}; if (rep && rep.units) rep.units.forEach(function (u) { meta[String(u.id)] = u; });
      // 🖼️ ON-CHAIN tiesa: utype/level/xp/sprite iš kontrakto (multicall) — LV čia = tikrasis, matomas visur
      Promise.resolve().then(function () {
        return (window.BarracksNFT && window.BarracksNFT.loadUnitTypes) ? window.BarracksNFT.loadUnitTypes(ids) : new Map();
      }).catch(function () { return new Map(); }).then(function (m) {
        if (!document.body.contains(card)) return;
        var html = '<div style="font-size:9px;color:#7a8aa0;letter-spacing:1.5px;margin-bottom:8px;">PICK A UNIT — XP GOES ON-CHAIN ⛓</div>';
        for (var i = 0; i < ids.length; i++) {
          var id = ids[i], ch = (m && m.get) ? m.get(id) : null, mu = meta[id] || {};
          var utStr = String(mu.utype || '');
          var u = {
            id: id,
            name: (ch && ch.name) ? String(ch.name).toUpperCase() : (_XP_UNAME[utStr] || 'UNIT'),
            img: (ch && ch.image) || _XP_SPRITE[utStr] || 'unit-images/skull-idle.gif',
            level: ch ? (ch.level | 0) : (mu.level | 0),
            xp: ch ? (ch.xp | 0) : 0,
            legacy: (Number(_xpState.legacy[id]) || 0),
          };
          _xpState.units[id] = u;
          html += _xpUnitCardHtml(u, _xpState.pool + u.legacy);
        }
        html += '<div style="font-size:8px;color:#6a7a8a;margin-top:8px;line-height:1.8;">XP is written to the unit’s NFT on Ronin — sign once, then confirm the transaction.<br>Level = √(XP/100), rounded down.</div>';
        box.innerHTML = html;
        box.querySelectorAll('.rb-xp-give').forEach(function (b) {
          b.onclick = function () { _xpClaimFlow(b.getAttribute('data-id')); };
        });
      });
    });
  }
  function _xpUnitCardHtml(u, give) {
    var pct = Math.round(_xpLvlPct(u.xp) * 100);
    return '<div class="rb-xp-card" data-xpcard="' + _esc(u.id) + '" style="position:relative;overflow:hidden;display:flex;align-items:center;gap:12px;padding:10px 12px;margin:7px 0;background:#0e1420;border:2px solid #2a3550;text-align:left;transition:border-color .3s,box-shadow .3s;">' +
      '<span class="rb-xp-sprwrap" style="position:relative;width:52px;height:52px;flex:0 0 52px;display:flex;align-items:center;justify-content:center;background:#141c2c;border:1px solid #24304a;">' +
        '<img class="rb-xp-spr" src="' + _esc(u.img) + '" alt="" style="max-width:48px;max-height:48px;image-rendering:pixelated;">' +
      '</span>' +
      '<span style="flex:1;min-width:0;">' +
        '<span style="font-size:11px;color:#bff0f6;font-weight:800;">' + _esc(u.name) + '</span>' +
        ' <span style="font-size:9px;color:#8a9aaa;">#' + _esc(u.id) + '</span>' +
        ' <span class="rb-xp-lv" style="display:inline-block;font-size:9px;color:#171204;background:#ffd75c;padding:2px 6px;margin-left:4px;font-weight:800;">LV ' + (u.level | 0) + '</span>' +
        '<div style="margin-top:5px;font-size:9px;color:#ffd75c;"><span class="rb-xp-num">' + (u.xp | 0) + '</span> XP' +
          (u.legacy > 0 ? ' <span class="rb-xp-stored" style="color:#8fffb0;">(+' + u.legacy + ' stored → goes on-chain too)</span>' : '') + '</div>' +
        '<div style="margin-top:4px;height:7px;background:#0a0f18;border:1px solid #24304a;"><div class="rb-xp-bar" style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#ffd75c,#8fffb0);"></div></div>' +
      '</span>' +
      (give > 0
        ? '<button class="rb-act rb-xp-give" data-id="' + _esc(u.id) + '" style="padding:10px 12px;border:2px solid #5ce08a;background:rgba(92,224,138,.14);color:#8fffb0;font-family:inherit;font-size:10px;font-weight:800;cursor:pointer;white-space:nowrap;">⛓ +' + give + ' XP</button>'
        : '') +
    '</div>';
  }
  function _xpFlowMsg(txt, color) {
    var f = document.querySelector('#rb-xpassign-ov #rb-xp-flow');
    if (!f) return;
    f.style.display = 'block'; f.style.color = color || '#ffd97a'; f.innerHTML = txt;
  }
  function _xpButtons(on) {
    document.querySelectorAll('#rb-xpassign-ov .rb-xp-give').forEach(function (b) { b.disabled = !on; b.style.opacity = on ? '1' : '.45'; });
  }
  function _xpFail(msg) {
    _xpBusy = false; _xpButtons(true);
    var low = String(msg || '').toLowerCase();
    if (low.indexOf('reject') >= 0 || low.indexOf('denied') >= 0 || low.indexOf('cancel') >= 0) _xpFlowMsg('cancelled — no XP was moved', '#8a9aaa');
    else _xpFlowMsg('❌ ' + _esc(String(msg || 'failed')), '#ffb0b0');
  }
  function _xpShowPending(p) {
    var el = document.querySelector('#rb-xpassign-ov #rb-xp-pend');
    if (!el || !p) return;
    el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:8px;background:rgba(255,215,92,.08);border:1px dashed #ffd75c;font-size:9px;color:#ffd97a;text-align:left;">' +
      '<span style="flex:1;">⏳ unfinished claim: unit <b>#' + _esc(String(p.tokenId)) + '</b> +' + (p.amount | 0) + ' XP — finish it (or it returns to pool in 30 min)</span>' +
      '<button id="rb-xp-resume" style="padding:8px 10px;border:2px solid #ffd75c;background:rgba(255,215,92,.14);color:#ffd97a;font-family:inherit;font-size:9px;font-weight:800;cursor:pointer;white-space:nowrap;">⛓ FINISH</button></div>';
    var b = el.querySelector('#rb-xp-resume');
    if (b) b.onclick = function () { if (_xpBusy) return; _xpSubmitVoucher(p); };
  }
  // 1) personal_sign (įrodo piniginę) → 2) edge fn voucher → 3) awardBattleXp tx (žaidėjas moka gas)
  function _xpClaimFlow(unitId) {
    if (_xpBusy || !_xpState) return;
    if (!window.BarracksNFT || !window.BarracksNFT.claimXpAward) { _xpFail('wallet modules not loaded'); return; }
    var prov = _xpProvider();
    if (!prov) { _xpFail('no wallet provider — connect wallet first'); return; }
    _xpBusy = true; _xpButtons(false);
    _xpFlowMsg('✍️ sign the claim in your wallet…');
    var S = _xpState, ts = Math.floor(Date.now() / 1000);
    var msg = 'RONKE TETRIS XP CLAIM\nwallet: ' + S.addr + '\nunit: #' + unitId + '\nts: ' + ts;
    Promise.resolve(prov.request({ method: 'personal_sign', params: [msg, S.addr] }))
      .then(function (sig) {
        _xpFlowMsg('📡 requesting signed voucher…');
        return _xpFn({ action: 'claim', wallet: S.addr, tokenId: unitId, ts: ts, signature: sig });
      })
      .then(function (r) {
        if (r && r.ok && r.voucher) return _xpSubmitVoucher(r.voucher);
        if (r && r.error === 'pending_other' && r.pending) { _xpShowPending(r.pending); throw new Error('finish the pending claim for unit #' + r.pending.tokenId + ' first'); }
        throw new Error((r && r.error) || 'voucher request failed');
      })
      .catch(function (e) { _xpFail(e && e.message ? e.message : String(e)); });
  }
  function _xpSubmitVoucher(v) {
    _xpBusy = true; _xpButtons(false);
    _xpFlowMsg('⛓ confirm the transaction in your wallet…');
    var award = { tokenId: v.tokenId, xpGain: v.amount, kills: 0, won: false, battleId: v.battleId, deadline: v.deadline, nonce: v.nonce, signature: v.sig };
    var timeout = new Promise(function (res) { setTimeout(function () { res('__timeout'); }, 95000); });
    Promise.race([Promise.resolve().then(function () { return window.BarracksNFT.claimXpAward(award); }), timeout])
      .then(function (r) {
        // 📱 Ronin in-app: receipt laukimas gali pakibti → tikrinam per edge fn (nonce panaudotas = claim įvyko)
        if (r === '__timeout') { _xpFlowMsg('⏳ tx sent — waiting for chain confirmation…'); return _xpWaitClaimed(8); }
        return true;
      })
      .then(function (okFlag) {
        if (!okFlag) throw new Error('confirmation timed out — reopen this panel to finish or auto-refund');
        var pend = document.querySelector('#rb-xpassign-ov #rb-xp-pend'); if (pend) pend.innerHTML = '';
        _xpCelebrate(String(v.tokenId), v.amount | 0);
      })
      .catch(function (e) { _xpFail(e && e.message ? e.message : String(e)); });
  }
  function _xpWaitClaimed(tries) {
    if (!_xpState) return Promise.resolve(false);
    var addr = _xpState.addr;
    return _xpFn({ action: 'status', wallet: addr }).catch(function () { return null; }).then(function (st) {
      if (st && st.ok && !st.pending) return true;   // pending išnyko → nonce panaudotas → claim on-chain
      if (tries <= 1) return false;
      return new Promise(function (res) { setTimeout(function () { res(_xpWaitClaimed(tries - 1)); }, 6000); });
    });
  }
  // ── 🎉 XP GAVIMO ANIMACIJA: lekiančios ✦ iš pool → unitas, count-up, baras; kertant lygį — LEVEL UP FX ──
  function _xpCelebrate(unitId, amount) {
    _xpBusy = false;
    _xpFlowMsg('✅ <b>+' + amount + ' XP ON-CHAIN!</b> written to unit #' + _esc(unitId), '#8fffb0');
    var ov = document.getElementById('rb-xpassign-ov'); if (!ov) return;
    var cardEl = ov.querySelector('[data-xpcard="' + unitId + '"]');
    var u = (_xpState && _xpState.units[unitId]) || { xp: 0, level: 0, legacy: 0 };
    var oldXp = u.xp | 0, newXp = oldXp + amount, oldLv = _xpLvl(oldXp), newLv = _xpLvl(newXp);
    u.xp = newXp; u.level = newLv; u.legacy = 0;
    if (_xpState) { _xpState.pool = 0; _xpState.legacy[unitId] = 0; }
    var pn = ov.querySelector('#rb-xp-poolnum');
    // kiti mygtukai perskaičiuojami (pool = 0) — lieka tik legacy turintys
    ov.querySelectorAll('.rb-xp-give').forEach(function (b) {
      var bid = b.getAttribute('data-id'), leg = (_xpState && Number(_xpState.legacy[bid])) || 0;
      if (bid === unitId || leg <= 0) b.remove();
      else { b.textContent = '⛓ +' + leg + ' XP'; b.disabled = false; b.style.opacity = '1'; }
    });
    if (!cardEl) return;
    var stored = cardEl.querySelector('.rb-xp-stored'); if (stored) stored.remove();
    cardEl.style.borderColor = '#ffd75c'; cardEl.style.boxShadow = '0 0 18px rgba(255,215,92,.4)';
    _xpFlyParticles(pn || cardEl, cardEl, Math.min(16, 8 + Math.floor(amount / 25)));
    // „+N XP" floateris virš kortelės
    var fl = document.createElement('div');
    fl.style.cssText = 'position:absolute;right:14px;top:2px;font-size:13px;font-weight:800;color:#8fffb0;text-shadow:1px 1px 0 #000;pointer-events:none;animation:rbXpFloat 1.6s ease-out both;z-index:5;';
    fl.textContent = '+' + amount + ' XP';
    cardEl.appendChild(fl); setTimeout(function () { try { fl.remove(); } catch (_) {} }, 1700);
    var numEl = cardEl.querySelector('.rb-xp-num'), barEl = cardEl.querySelector('.rb-xp-bar'), lvEl = cardEl.querySelector('.rb-xp-lv');
    var t0 = null, DUR = 1400, lvShown = oldLv, fxDone = false;
    function tick(ts2) {
      if (t0 == null) t0 = ts2;
      var k = Math.min(1, (ts2 - t0) / DUR), e = 1 - Math.pow(1 - k, 3);
      var cur = Math.round(oldXp + (newXp - oldXp) * e);
      if (pn) pn.textContent = Math.max(0, Math.round((1 - e) * amount)) + ' XP';   // pool tirpsta į unitą
      if (numEl) { numEl.textContent = cur; numEl.style.color = '#8fffb0'; }
      if (barEl) barEl.style.width = Math.round(_xpLvlPct(cur) * 100) + '%';
      var L = _xpLvl(cur);
      if (L > lvShown && lvEl) {
        lvShown = L; lvEl.textContent = 'LV ' + L;
        lvEl.style.animation = 'none'; void lvEl.offsetWidth;
        lvEl.style.animation = 'rbPxBigPop .5s cubic-bezier(.2,1,.3,1) both';
        if (!fxDone) { fxDone = true; _xpLevelUpFx(cardEl, newLv); }
      }
      if (k < 1) requestAnimationFrame(tick);
      else {
        if (numEl) { numEl.textContent = newXp; setTimeout(function () { numEl.style.color = ''; }, 1200); }
        if (!fxDone) setTimeout(function () { cardEl.style.borderColor = '#2a3550'; cardEl.style.boxShadow = 'none'; }, 1400);
      }
    }
    requestAnimationFrame(tick);
    // 🔄 tikras pool likutis iš edge fn (jei lygiagrečiai atkrito naujas mačo XP)
    setTimeout(function () {
      if (!_xpState) return;
      _xpFn({ action: 'status', wallet: _xpState.addr }).then(function (st) {
        if (st && st.ok && pn && document.body.contains(pn)) { pn.textContent = (st.pool | 0) + ' XP'; if (_xpState) _xpState.pool = st.pool | 0; }
      }).catch(function () {});
    }, DUR + 600);
  }
  function _xpFlyParticles(fromEl, toEl, n) {
    try {
      var fr = fromEl.getBoundingClientRect(), tr = toEl.getBoundingClientRect();
      var fx = fr.left + fr.width / 2, fy = fr.top + fr.height / 2;
      var tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
      for (var i = 0; i < n; i++) {
        (function (i2) {
          var sp = document.createElement('span');
          var jx = (Math.random() - 0.5) * 60, jy = (Math.random() - 0.5) * 26;
          sp.textContent = '✦';
          sp.style.cssText = 'position:fixed;left:' + (fx + jx) + 'px;top:' + (fy + jy) + 'px;z-index:100070;font-size:' + (11 + Math.random() * 8) + 'px;' +
            'color:' + (i2 % 3 === 0 ? '#8fffb0' : '#ffd75c') + ';text-shadow:0 0 6px rgba(255,215,92,.8);pointer-events:none;' +
            'transition:transform .62s cubic-bezier(.3,.7,.2,1),opacity .62s ease;will-change:transform;';
          document.body.appendChild(sp);
          setTimeout(function () {
            sp.style.transform = 'translate(' + (tx - fx - jx + (Math.random() - 0.5) * 30) + 'px,' + (ty - fy - jy + (Math.random() - 0.5) * 20) + 'px) scale(.6)';
            sp.style.opacity = '0.05';
          }, 30 + i2 * 45);
          setTimeout(function () { try { sp.remove(); } catch (_) {} }, 900 + i2 * 45);
        })(i);
      }
    } catch (_) {}
  }
  // ── ⬆️ LEVEL UP FX (žalias, kaip F12 on-board): žiedai + kylančios ✦ + banner SLAM + konfeti ──
  function _xpLevelUpFx(cardEl, lv) {
    try {
      cardEl.style.borderColor = '#5ce08a'; cardEl.style.boxShadow = '0 0 26px rgba(92,224,138,.55)';
      var wrap = cardEl.querySelector('.rb-xp-sprwrap'), img = cardEl.querySelector('.rb-xp-spr');
      if (img) { img.style.animation = 'none'; void img.offsetWidth; img.style.animation = 'rbPxBigPop .55s cubic-bezier(.2,1,.3,1) both'; }
      if (wrap) {
        for (var r = 0; r < 3; r++) {
          (function (r2) {
            var ring = document.createElement('div');
            ring.style.cssText = 'position:absolute;inset:-6px;border:3px solid #5ce08a;border-radius:50%;pointer-events:none;' +
              'animation:rbPxRing .9s cubic-bezier(.2,.8,.3,1) ' + (r2 * 0.16) + 's both;';
            wrap.appendChild(ring);
            setTimeout(function () { try { ring.remove(); } catch (_) {} }, 1600 + r2 * 160);
          })(r);
        }
      }
      for (var s = 0; s < 7; s++) {
        (function (s2) {
          var sp = document.createElement('span');
          sp.textContent = '✦';
          sp.style.cssText = 'position:absolute;left:' + (8 + Math.random() * 84) + '%;bottom:6px;z-index:4;font-size:' + (10 + Math.random() * 8) + 'px;' +
            'color:#8fffb0;text-shadow:0 0 8px rgba(92,224,138,.9);pointer-events:none;animation:rbXpRise 1.15s ease-out ' + (s2 * 0.09) + 's both;';
          cardEl.appendChild(sp);
          setTimeout(function () { try { sp.remove(); } catch (_) {} }, 2300);
        })(s);
      }
      var ban = document.createElement('div');
      ban.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:6;pointer-events:none;';
      ban.innerHTML = '<div style="background:rgba(10,20,12,.92);border:3px solid #5ce08a;box-shadow:0 0 0 2px #000,0 0 24px rgba(92,224,138,.6);' +
        'padding:10px 18px;font-size:14px;font-weight:800;letter-spacing:2px;color:#8fffb0;text-shadow:1px 1px 0 #000;' +
        'animation:rbPxBigPop .55s cubic-bezier(.2,1,.3,1) both;">⬆ LEVEL UP! LV ' + (lv | 0) + '</div>';
      cardEl.appendChild(ban);
      setTimeout(function () { try { ban.remove(); } catch (_) {} }, 2400);
      var colors = ['#5ce08a', '#ffd75c', '#8fffb0', '#ffffff'];
      for (var cix = 0; cix < 26; cix++) {
        (function (ci) {
          var cf = document.createElement('span');
          cf.style.cssText = 'position:absolute;top:-8px;left:' + (Math.random() * 96) + '%;width:' + (3 + Math.random() * 4) + 'px;height:' + (3 + Math.random() * 4) + 'px;' +
            'background:' + colors[ci % colors.length] + ';z-index:5;pointer-events:none;animation:rbPxConf ' + (1.1 + Math.random() * 0.8) + 's linear ' + (Math.random() * 0.35) + 's both;';
          cardEl.appendChild(cf);
          setTimeout(function () { try { cf.remove(); } catch (_) {} }, 2600);
        })(cix);
      }
      setTimeout(function () { cardEl.style.borderColor = '#2a3550'; cardEl.style.boxShadow = 'none'; }, 3200);
    } catch (_) {}
  }
  // 🔧 debug: panelės/animacijų peržiūra konsolėj be mačo (vien vizualai — claim kelias lieka už parašo+tx)
  try { window._rbXpDebug = { show: _showXpAssign, celebrate: _xpCelebrate, levelFx: _xpLevelUpFx, setReport: function (r) { _xpReport = r; } }; } catch (_) {}
  function _rankStats(addr) {
    var R = String(addr || '').toLowerCase();
    if (!_isAddr(R)) return Promise.resolve(null);
    return fetch(SB_URL + '/rest/v1/f9_bases?select=buildings&ronin_address=eq.rank_' + R, { headers: _sbHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        var b = (rows && rows[0] && rows[0].buildings) || null;
        if (!b) return { score: 0, wins: 0, losses: 0, games: 0, xp: 0 };
        return { score: Number(b.score) || 0, wins: Number(b.wins) || 0, losses: Number(b.losses) || 0, games: Number(b.games) || 0, xp: Number(b.xp) || 0 };
      }).catch(function () { return null; });
  }
  function _rankBoard() {
    return fetch(SB_URL + '/rest/v1/f9_bases?select=ronin_address,buildings&ronin_address=like.rank_0x*&limit=500', { headers: _sbHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        var arr = (rows || []).map(function (row) {
          var b = row.buildings || {};
          return { addr: String(row.ronin_address).replace(/^rank_/, ''), score: Number(b.score) || 0, wins: Number(b.wins) || 0, losses: Number(b.losses) || 0, games: Number(b.games) || 0, xp: Number(b.xp) || 0 };
        }).filter(function (x) { return _isAddr(x.addr); });
        arr.sort(function (a, b) { return b.score - a.score || b.wins - a.wins || a.games - b.games; });
        return arr;
      }).catch(function () { return []; });
  }
  function _shortAddr(a) { a = String(a || ''); return a.length > 10 ? (a.slice(0, 6) + '…' + a.slice(-4)) : a; }
  // 🏅 Reitingo panelė (overlay): tavo lyga+žvaigždutės, W/L, laukiantis deko XP, ir top lentelė.
  // 🎖️ Deko XP lentelė: 1 išvalyta linija = (lyga+1) XP; kaupiasi pool'e, po mačo skiriamas vienam deko unitui.
  function _xpTableHtml(curLeague) {
    var out = '';
    for (var i = 0; i < RANK_LEAGUES.length; i++) {
      var cur = (curLeague === i);
      out += '<div style="background:' + (cur ? 'rgba(255,215,92,.14)' : '#101828') + ';border:1px solid ' + (cur ? '#ffd75c' : '#2a3550') + ';border-radius:6px;padding:8px 4px 7px;text-align:center;' + (cur ? 'box-shadow:0 0 10px rgba(255,215,92,.25);' : '') + '">' +
        '<img src="assets_rank/emb_' + i + '.png" alt="" style="width:26px;height:26px;image-rendering:pixelated;">' +
        '<div style="font-size:6px;color:' + (cur ? '#ffd75c' : '#8a9aaa') + ';margin-top:4px;">' + RANK_LEAGUES[i] + '</div>' +
        '<div style="font-size:10px;color:#8fffb0;margin-top:3px;">\u00d7' + (i + 1) + '</div>' +
      '</div>';
    }
    return out;
  }
  function _xpPoolGet(addr) {
    var R = String(addr || '').toLowerCase();
    if (!_isAddr(R)) return Promise.resolve(0);
    return fetch(SB_URL + '/rest/v1/f9_bases?select=buildings&ronin_address=eq.xpunits_' + R, { headers: _sbHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (rows) { var b = rows && rows[0] && rows[0].buildings; return ((b && b.pool) | 0); })
      .catch(function () { return 0; });
  }
  function _openRankPanel() {
    var addr = _walletAddr();
    var ov = document.createElement('div'); ov.id = 'rb-rank-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,22,0.94);z-index:99100;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    var p = document.createElement('div');
    p.style.cssText = 'background:linear-gradient(180deg,#1f2940 0%,#0c1020 100%);border:3px solid #ffcf5c;box-shadow:0 0 48px rgba(255,207,92,0.35);border-radius:8px;padding:22px 26px;width:540px;max-width:96vw;max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:12px;' +
      "font-family:'Press Start 2P',monospace,sans-serif;font-size:12px;line-height:1.6;color:#8a9aaa;";
    p.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:1px solid #4a3a18;">' +
        '<span style="font-size:22px;">🏅</span><span style="flex:1;font-size:15px;color:#ffcf5c;letter-spacing:1px;">RANKED</span>' +
        '<button id="rb-rank-x" style="background:none;border:none;color:#8a9aaa;font-size:22px;cursor:pointer;font-family:inherit;">×</button>' +
      '</div>' +
      (addr
        ? ('<div id="rb-rank-me" style="background:#0c1020;border:1px solid #46567e;border-radius:8px;padding:16px;text-align:center;">' +
             '<div style="font-size:11px;color:#6a7a8a;">Loading your rank…</div></div>' +
           '<div style="font-size:9px;color:#6a7a8a;text-align:center;">Win +1★ · Lose −½★ · Beat a higher league +2★ · Lose to a lower league −2★</div>' +
           '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;"><span style="flex:1;height:1px;background:#3a3a55;"></span><span style="font-size:10px;color:#8fffb0;">DECK XP \u2014 EVERY LINE PAYS</span><span style="flex:1;height:1px;background:#3a3a55;"></span></div>' +
           '<div style="background:#0c1020;border:1px solid #2a3550;border-radius:8px;padding:12px 14px;">' +
             '<div style="font-size:8px;color:#bff0f6;text-align:center;line-height:1.8;">1 CLEARED LINE = 1 XP \u00d7 YOUR LEAGUE</div>' +
             '<div style="font-size:7px;color:#6a7a8a;text-align:center;margin-bottom:10px;">win or lose \u00b7 PvP &amp; vs AI \u00b7 higher league = more XP</div>' +
             '<div id="rb-xp-table" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">' + _xpTableHtml(-1) + '</div>' +
             '<div style="font-size:7px;color:#8a9aaa;text-align:center;margin-top:10px;line-height:1.9;">e.g. 12 lines in WOOD \u2192 12 \u00d7 2 = <span style="color:#ffd75c;">24 XP</span><br>XP lands in your pool \u2014 after each match assign the whole pool to ONE registered deck unit</div>' +
             '<div id="rb-xp-pool" style="font-size:8px;color:#ffd75c;text-align:center;margin-top:8px;"></div>' +
           '</div>' +
           '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;"><span style="flex:1;height:1px;background:#3a3a55;"></span><span style="font-size:10px;color:#ffd97a;">LEADERBOARD</span><span style="flex:1;height:1px;background:#3a3a55;"></span></div>' +
           '<div id="rb-rank-board" style="display:flex;flex-direction:column;gap:5px;min-height:40px;"><div style="color:#6a7a8a;font-size:10px;text-align:center;padding:10px 0;">Loading…</div></div>')
        : '<div style="font-size:11px;color:#ffd97a;text-align:center;padding:20px 0;">Connect your wallet to earn a rank. Every PvP tetris match moves you up the leagues — and feeds XP to your deck units.</div>'
      );
    ov.appendChild(p); document.body.appendChild(ov);
    p.querySelector('#rb-rank-x').onclick = function () { try { ov.remove(); } catch (_) {} };
    if (!addr) return;
    var me = p.querySelector('#rb-rank-me'), board = p.querySelector('#rb-rank-board');
    _xpPoolGet(addr).then(function (pool) {   // \u26A1 gyvas XP pool is xpunits_
      var el = p.querySelector('#rb-xp-pool');
      if (!el || !document.body.contains(p)) return;
      el.innerHTML = '\u26A1 YOUR POOL: <b>' + (pool | 0) + ' XP</b>' +
        ((pool | 0) > 0
          ? ' <button id="rb-xp-assignbtn" style="margin-left:8px;padding:7px 12px;border:2px solid #5ce08a;background:rgba(92,224,138,.14);color:#8fffb0;font-family:inherit;font-size:8px;font-weight:800;cursor:pointer;letter-spacing:1px;">\u26D3 PUT ON A UNIT</button>'
          : ' waiting to be assigned');
      var ab = el.querySelector('#rb-xp-assignbtn');
      if (ab) ab.onclick = function () { _showXpAssign({ standalone: true }); };   // \u26D3 veikia BE gyvo kambario
    });
    _rankStats(addr).then(function (s) {
      if (!document.body.contains(p) || !me) return;
      s = s || { score: 0, wins: 0, losses: 0, games: 0, xp: 0 };
      var d = _rankDecode(s.score), rate = _rankRate(s.score);
      me.innerHTML =
        '<div style="line-height:1;"><img src="assets_rank/emb_' + d.league + '.png" alt="" style="width:110px;height:110px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5));"></div>' +
        '<div style="font-size:16px;color:#ffcf5c;letter-spacing:1px;margin-top:8px;">' + d.name + '</div>' +
        '<div style="margin-top:8px;">' + _spriteStars(d.hs, 30) + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px;">' +
          '<div><div style="font-size:15px;color:#aef0b0;">' + s.wins + '</div><div style="font-size:7px;color:#6a7a8a;margin-top:3px;">WINS</div></div>' +
          '<div><div style="font-size:15px;color:#e89a9a;">' + s.losses + '</div><div style="font-size:7px;color:#6a7a8a;margin-top:3px;">LOSSES</div></div>' +
          '<div><div style="font-size:15px;color:#bff0f6;">' + s.games + '</div><div style="font-size:7px;color:#6a7a8a;margin-top:3px;">GAMES</div></div>' +
        '</div>' +
        '<div style="margin-top:14px;background:rgba(255,207,92,.08);border:1px solid #6a4a18;border-radius:6px;padding:10px;">' +
          '<div style="font-size:14px;color:#ffd97a;">⚡ ' + Math.round(s.xp) + ' XP</div>' +
          '<div style="font-size:8px;color:#8a9aaa;margin-top:5px;line-height:1.5;">pending for your deck units · +' + rate + ' XP per unit each match at ' + d.name + '</div>' +
        '</div>';
      var xt = p.querySelector('#rb-xp-table'); if (xt) xt.innerHTML = _xpTableHtml(d.league);   // 🎯 pazymim tavo lyga XP lentelej
    });
    _rankBoard().then(function (rows) {
      if (!document.body.contains(p) || !board) return;
      if (!rows.length) { board.innerHTML = '<div style="color:#6a7a8a;font-size:10px;text-align:center;padding:10px 0;">No ranked players yet — be the first!</div>'; return; }
      var mine = String(addr).toLowerCase();
      board.innerHTML = rows.slice(0, 20).map(function (r, i) {
        var d = _rankDecode(r.score), you = r.addr.toLowerCase() === mine;
        return '<div style="display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:6px;background:' + (you ? 'rgba(255,207,92,.14)' : '#0c1020') + ';border:1px solid ' + (you ? '#ffcf5c' : '#2a3550') + ';">' +
          '<span style="width:22px;font-size:11px;color:' + (i < 3 ? '#ffd97a' : '#6a7a8a') + ';">' + (i + 1) + '</span>' +
          '<img src="assets_rank/emb_' + d.league + '.png" alt="" style="width:26px;height:26px;flex:0 0 auto;">' +
          '<span style="flex:1;min-width:0;font-size:9px;color:' + (you ? '#ffcf5c' : '#bff0f6') + ';overflow:hidden;text-overflow:ellipsis;">' + _shortAddr(r.addr) + (you ? ' (you)' : '') + '</span>' +
          '<span style="white-space:nowrap;">' + _spriteStars(d.hs, 14) + '</span>' +
          '<span style="width:52px;text-align:right;font-size:9px;color:#8a9aaa;">' + r.wins + 'W ' + r.losses + 'L</span>' +
        '</div>';
      }).join('');
    });
  }

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
        .map(function (r) { return { roomId: r.roomId, host: (r.metadata && r.metadata.host) || 'Player', tier: (r.metadata && r.metadata.tier) || 69, mid: (r.metadata && r.metadata.mid) || null, wagerLive: (r.metadata && r.metadata.wagerLive), chain: (r.metadata && r.metadata.chain) || 'ronin' }; });
    }).catch(function () { return []; });
  }

  // ── 📶 SIGNALO STIPRUMAS (ping) PRIEŠ prisijungiant — kad žaidėjas žinotų kas jo laukia (ar bus lagas) ──
  //    Matuojam getAvailableRooms RTT (HTTP į tą patį game serverį) — 1 apšilimas + 3 matavimai, imam medianą.
  var _pingMs = null, _pingBusy = false;
  function _measurePing(cb) {
    if (_pingBusy) { if (cb) cb(_pingMs); return; }
    _pingBusy = true;
    _loadColyseus().then(function () {
      try { if (!_client) _client = new window.Colyseus.Client(_endpoint()); } catch (_) { _pingBusy = false; if (cb) cb(null); return; }
      var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
      var samples = [], total = 4;
      function one(i) { var t0 = now(); _client.getAvailableRooms('blocks_room').then(function () { step(i, now() - t0); }).catch(function () { step(i, now() - t0); }); }
      function step(i, ms) { if (i > 0) samples.push(ms); if (i + 1 < total) setTimeout(function () { one(i + 1); }, 90); else finish(); }
      function finish() {
        _pingBusy = false;
        if (!samples.length) { _pingMs = null; if (cb) cb(null); return; }
        samples.sort(function (a, b) { return a - b; });
        _pingMs = Math.round(samples[Math.floor(samples.length / 2)]);
        if (cb) cb(_pingMs);
      }
      one(0);
    }).catch(function () { _pingBusy = false; if (cb) cb(null); });
  }
  function _signalHtml(ms) {
    if (ms == null) return '<span style="font-size:14px;color:#8a9aaa;">📶 checking connection…</span>';
    var lvl = ms < 80 ? 3 : ms < 180 ? 2 : 1;   // 3=geras 2=vidut 1=silpnas
    var col = lvl === 3 ? '#5ce08a' : lvl === 2 ? '#ffcf5c' : '#e07070';
    var txt = lvl === 3 ? 'GOOD' : lvl === 2 ? 'OK' : 'WEAK';
    var bars = '';
    for (var b = 1; b <= 3; b++) bars += '<span style="display:inline-block;width:6px;height:' + (5 + b * 4) + 'px;margin:0 1.5px;vertical-align:bottom;background:' + (b <= lvl ? col : '#33405e') + ';border-radius:1.5px;"></span>';
    return '<span style="font-size:14px;color:' + col + ';white-space:nowrap;">' + bars + ' <b>SIGNAL: ' + txt + '</b> <span style="opacity:.85;font-size:14px;">' + ms + 'ms</span>' + (lvl === 1 ? ' <span style="opacity:.7;">— may lag</span>' : '') + '</span>';
  }
  // 🔄 GYVAS signalas — perматuojam kas 3s ir atnaujinam rodmenį, kol matomas invite overlay ARBA lobby panelė.
  var _signalTimer = null;
  function _refreshSignalUI() {
    var a = document.getElementById('rb-inv-sig'); if (a) a.innerHTML = _signalHtml(_pingMs);
    var b = _panel && _panel.querySelector('#rb-panel-sig'); if (b) b.innerHTML = _signalHtml(_pingMs);
  }
  function _stopSignalLoop() { if (_signalTimer) { clearInterval(_signalTimer); _signalTimer = null; } }
  function _startSignalLoop() {
    _stopSignalLoop();
    var tick = function () {
      // matuojam tik kol yra ką rodyti (invite overlay arba panelė) — kitaip sustojam
      if (!document.getElementById('rb-inv-sig') && !(_panel && _panel.querySelector('#rb-panel-sig'))) { _stopSignalLoop(); return; }
      _measurePing(function () { _refreshSignalUI(); });
    };
    tick();
    _signalTimer = setInterval(tick, 3000);
  }

  // ── Badge + toast (pranešimas kai kažkas laukia; NErodom kai pats žaidi/panelėje) ──
  function _poll() {
    if (document.hidden || !_inAdventure()) { _setBadge(0); _lastCount = 0; _stopShakeLoop(); return; }
    if (_lobbyRoom) return;   // panelė atidaryta su REALAUS LAIKO lobby → jis tvarko sąrašą (nepoliname)
    _fetchWaiting().then(function (list) {
      _waitingRooms = list;
      var count = list.length;
      if (_inMinigame() || _panel || _bgActive) count = 0;   // jau čia esu / hostinu → nerodom
      _setBadge(count);
      if (count > 0) {
        if (count > _lastCount) _toast(count, list[0] && list[0].host);   // toast tik naujam
        _startShakeLoop();                                                // 🎮 3× virptelėjimai kas 30s, kol laukia
      } else _stopShakeLoop();
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
      '.rb-row:hover{background:#2a3450 !important;} .rb-act:hover{filter:brightness(1.18);}' +
      /* 🎮 TETRIS doko mygtuko virpėjimas — kai kažkas laukia varžovo (dėmesiui) */
      '@keyframes rbTetrisShake{0%,60%,100%{transform:rotate(0)}6%{transform:rotate(-7deg)}14%{transform:rotate(7deg)}22%{transform:rotate(-5deg)}30%{transform:rotate(5deg)}38%{transform:rotate(-3deg)}46%{transform:rotate(3deg)}54%{transform:rotate(0)}}' +
      '.rb-tetris-shake{animation:rbTetrisShake 1.5s ease-in-out 3;transform-origin:center bottom;}' +   /* 3 virptelėjimai (~4.5s) */
      /* 🦴 kai kaulų balanso widget'as viršuje — pranešimą nuleidžiam žemiau (nesusiliestų su balansu) */
      'body.f9-bones-live #rb-lobby-toast{top:calc(72px + env(safe-area-inset-top, 0px)) !important;}' +
      /* 🤖 animuotas AI Ronke (8 kadrai, assets_rank/ai_ronke_anim.png) — vietoj AI emoji */
      '.rb-aironke{display:inline-block;width:26px;height:26px;border-radius:5px;vertical-align:middle;background:url(assets_rank/ai_ronke_anim.png) 0 0 no-repeat;background-size:800% 100%;animation:rbAironke 1.1s steps(8) infinite;image-rendering:pixelated;}' +
      '@keyframes rbAironke{from{background-position:0% 0;}to{background-position:114.2857% 0;}}' +
      '@keyframes rbAironkeImg{from{transform:translateX(0);}to{transform:translateX(-100%);}}';
    document.head.appendChild(st);
  }
  // 🤖 animuotas AI Ronke: 8 kadru juosta per <img>, kadrus stumdo JS intervalas
  //   (CSS keyframes is injected stiliaus zaidimo puslapyje nesuveikia — JS variklis veikia visada).
  var _airTimer = null, _airFrame = 0;
  // 🎞️ kiborgas (8 kadru juosta): 1-a anim (0-3) x3 -> 2-a (4-7) x1 · zingsnis 12.5%
  var _airSeqA = [0, 1, 2, 3, 4, 5, 6, 7];   // ištisinė 8 kadrų seka (dalinimas į 0-3/4-7 darė kapotą judesį)
  // 🎞️ paprastas Ronke (16 kadru juosta): neutral_idle (0-7) x3 -> ronke_animation (8-15) x1 · zingsnis 6.25%
  var _airSeqB = [0,1,2,3,4,5,6,7, 0,1,2,3,4,5,6,7, 0,1,2,3,4,5,6,7, 8,9,10,11,12,13,14,15];
  function _airTick() {
    _airFrame++;
    var fA = _airSeqA[_airFrame % _airSeqA.length];
    var fB = _airSeqB[_airFrame % _airSeqB.length];
    var a = document.querySelectorAll('.rb-aironke-img');
    for (var i = 0; i < a.length; i++) a[i].style.transform = 'translateX(-' + (fA * 12.5) + '%)';
    var b = document.querySelectorAll('.rb-ronkeidle-img');
    for (var j = 0; j < b.length; j++) b[j].style.transform = 'translateX(-' + (fB * 6.25) + '%)';
  }
  function _airStart() { if (!_airTimer) _airTimer = setInterval(_airTick, 140); }
  function _aironkeHtml(px, extra) {
    _airStart();
    return '<span style="display:inline-block;width:' + px + 'px;height:' + px + 'px;overflow:hidden;border-radius:' + Math.round(px * 0.18) + 'px;position:relative;vertical-align:middle;' + (extra || '') + '">' +
      '<img class="rb-aironke-img" src="assets_rank/ai_ronke_anim.png" alt="" style="position:absolute;left:0;top:0;height:100%;width:800%;image-rendering:pixelated;">' +
      '</span>';
  }
  // 🎮 Vienas „virptelėjimas" = 3 kartai (~4.5s). Kviečiama iškart + kas 30s per _shakeLoop, kol laukia varžovas.
  var _shakeTimer = null, _shakeLoopTimer = null;
  function _shakeDockBtn() {
    var btn = _dockBtn(); if (!btn) return;
    _css();
    btn.classList.remove('rb-tetris-shake'); void btn.offsetWidth;   // restart animaciją
    btn.classList.add('rb-tetris-shake');
    if (_shakeTimer) clearTimeout(_shakeTimer);
    _shakeTimer = setTimeout(function () { var b = _dockBtn(); if (b) b.classList.remove('rb-tetris-shake'); }, 4700);   // po 3 virptelėjimų nuimam
  }
  function _startShakeLoop() {
    if (_shakeLoopTimer) return;   // jau sukasi
    _shakeDockBtn();               // iškart 3×
    _shakeLoopTimer = setInterval(function () {
      if (!_inAdventure() || _inMinigame() || _panel || _bgActive) return;   // ne pilyje/žaidžia → praleidžiam
      _shakeDockBtn();             // vėl 3× (kas 30s)
    }, 30000);
  }
  function _stopShakeLoop() {
    if (_shakeLoopTimer) { clearInterval(_shakeLoopTimer); _shakeLoopTimer = null; }
    if (_shakeTimer) { clearTimeout(_shakeTimer); _shakeTimer = null; }
    var b = _dockBtn(); if (b) b.classList.remove('rb-tetris-shake');
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
      '<div><div style="font-weight:800;font-size:13px;">PVP TETRIS</div>' +
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
    p.style.cssText = 'background:linear-gradient(180deg,#222d47 0%,#0b0f1c 100%);border:3px solid #ffcf5c;' +
      'box-shadow:0 0 64px rgba(255,207,92,0.42),inset 0 0 34px rgba(255,207,92,0.09);border-radius:14px;' +
      'position:relative;padding:30px 36px;width:730px;max-width:96vw;max-height:92vh;overflow:auto;display:flex;flex-direction:column;' +
      "font-family:'Press Start 2P',monospace,sans-serif;font-size:14px;line-height:1.6;color:#9aa8bb;";
    p.innerHTML =
      '<div style="display:flex;align-items:center;gap:14px;padding-bottom:12px;border-bottom:1px solid #4a3a18;">' +
        '<span id="rb-head-ai" class="rb-act" title="AI plays for me" style="cursor:pointer;display:inline-block;line-height:0;">' +
        _aironkeHtml(96, 'box-shadow:0 0 18px rgba(92,224,138,.55);') + '</span>' +
        '<div style="flex:1;text-align:center;padding:0 12px;"><div style="font-size:15px;color:#8fffb0;font-weight:800;letter-spacing:1.5px;text-shadow:1px 1px 0 #000;">BEAT THE AI — IT BECOMES YOU</div><div style="font-size:9px;color:#9db0cc;margin-top:7px;line-height:1.7;">every win makes your AI twin stronger · it always plays at YOUR league<br>turn it on and it will <b style="color:#8fffb0;">fight FOR you</b> when you lag or go AFK</div></div>' +
        '<span id="rb-head-me" class="rb-act" title="I play myself" style="cursor:pointer;display:inline-block;line-height:0;">' +
        '<span style="display:inline-block;width:96px;height:96px;overflow:hidden;border-radius:17px;position:relative;transform:scaleX(-1);background:#000;box-shadow:0 0 18px rgba(92,224,138,.55);">' +
        '<img class="rb-ronkeidle-img" src="assets_rank/ronke_idle_anim.png" alt="" style="position:absolute;left:0;top:0;height:100%;width:1600%;image-rendering:pixelated;">' +
        '</span>' +
        '</span>' +
        '<button id="rb-x" style="position:absolute;top:6px;right:8px;background:none;border:none;color:#8a9aaa;font-size:26px;cursor:pointer;line-height:1;font-family:inherit;z-index:2;padding:4px;">\u00d7</button>' +
      '</div>' +
      '<div id="rb-status" style="display:none;font-size:13px;color:#ffd97a;background:rgba(255,207,92,.08);border:1px solid #6a4a18;border-radius:9px;padding:15px;margin:12px 0 0;text-align:center;line-height:1.5;"></div>' +

      /* \u2500\u2500 MODE TABS: vienas pagrindinis veiksmas per ekrana \u2500\u2500 */
      '<div style="display:flex;gap:8px;margin-top:16px;">' +
        '<button id="rb-tabbtn-pvp" class="rb-act" style="flex:1;padding:13px 8px;border-radius:10px 10px 0 0;border:1px solid #3a4666;border-bottom:none;background:none;color:#9db0cc;font-family:inherit;font-size:14px;cursor:pointer;">\u2694\ufe0f PVP ONLINE<div style="font-size:8px;opacity:.65;margin-top:4px;">play a human \u00b7 winner takes 80%</div></button>' +
        '<button id="rb-tabbtn-ai" class="rb-act" style="flex:1;padding:13px 8px;border-radius:10px 10px 0 0;border:1px solid #3a4666;border-bottom:none;background:none;color:#9db0cc;font-family:inherit;font-size:14px;cursor:pointer;">YOU vs AI<div style="font-size:8px;opacity:.65;margin-top:4px;">ranked bot \u00b7 climb the leagues</div></button>' +
      '</div>' +

      /* \u2694 PVP tab: sarasas -> kurimas (chain/stake -> HOST/PRIVATE) -> AI-avataro jungiklis */
      '<div id="rb-tab-pvp" style="display:flex;flex-direction:column;gap:12px;border:1px solid #3a4666;border-radius:0 12px 12px 12px;padding:16px 14px;">' +
        '<div style="font-size:9px;color:#7a8aa0;letter-spacing:1.5px;">OPEN MATCHES \u2014 tap to join</div>' +
        '<div id="rb-list" style="overflow:auto;display:flex;flex-direction:column;gap:10px;min-height:30px;max-height:26vh;"><div style="color:#6a7a8a;font-size:12px;padding:6px 0;text-align:center;">Loading\u2026</div></div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:4px;">' +
          '<div style="flex:1;height:1px;background:#2c3650;"></div>' +
          '<div style="font-size:9px;color:#7a8aa0;letter-spacing:1.5px;">OR CREATE YOUR OWN</div>' +
          '<div style="flex:1;height:1px;background:#2c3650;"></div>' +
        '</div>' +
        '<div id="rb-chain" style="display:flex;gap:10px;">' +
          '<button id="rb-chain-ronin" class="rb-act" style="flex:1;padding:10px;border-radius:9px;border:1px solid #6a4a18;background:rgba(255,207,92,.06);color:#ffcf5c;font-family:inherit;font-size:11px;cursor:pointer;">\ud83d\udd37 RONIN \u00b7 RONKE</button>' +
          '<button id="rb-chain-solana" class="rb-act" style="flex:1;padding:10px;border-radius:9px;border:1px solid #6a4a18;background:rgba(255,207,92,.06);color:#ffcf5c;font-family:inherit;font-size:11px;cursor:pointer;">\ud83d\udfe3 SOLANA \u00b7 SOL</button>' +
        '</div>' +
        '<div id="rb-tiers" style="display:flex;gap:10px;"></div>' +
        '<div style="display:flex;gap:10px;">' +
          '<button id="rb-host" class="rb-act" style="flex:1.7;padding:16px;border-radius:9px;border:2px solid #ffcf5c;background:rgba(255,207,92,.16);color:#ffcf5c;font-family:inherit;font-size:16px;cursor:pointer;">HOST MATCH \u00b7 <span id="rb-host-amt">69</span> <span id="rb-host-cur">RONKE</span><div style="font-size:9px;opacity:.7;margin-top:5px;">wait - others can pick you</div></button>' +
          '<button id="rb-private" class="rb-act" style="flex:1;padding:14px;border-radius:9px;border:1px solid #9d7ad0;background:rgba(157,122,208,.14);color:#cbb0ff;font-family:inherit;font-size:13px;cursor:pointer;">\ud83d\udd12 PRIVATE<div style="font-size:8px;opacity:.6;margin-top:4px;">invite a friend</div></button>' +
        '</div>' +
        '<button id="rb-aitog" class="rb-act" style="width:100%;box-sizing:border-box;padding:9px;border-radius:9px;border:1px dashed #4a7a4a;background:none;color:#9fe0a0;font-family:inherit;font-size:10px;cursor:pointer;"></button>' +
      '</div>' +

      /* \ud83e\udd16 VS AI tab: TAVO lyga (emblema) -> vienas didelis CTA -> practice */
      '<div id="rb-tab-ai" style="display:none;flex-direction:column;gap:12px;border:1px solid #2f5a40;border-radius:12px 0 12px 12px;padding:18px 14px;">' +
        '<div id="rb-ai-you" style="text-align:center;min-height:70px;color:#8a9aaa;font-size:11px;">\u2026</div>' +
        '<button id="rb-airank" class="rb-act" style="padding:17px;border-radius:9px;border:2px solid #5ce08a;background:rgba(92,224,138,.14);color:#8fffb0;font-family:inherit;font-size:16px;cursor:pointer;">\ud83c\udfc6 RANKED vs AI \u00b7 25 RONKE<div style="font-size:10px;opacity:.7;margin-top:5px;">win +1\u2605 \u00b7 lose \u2212\u00bd\u2605 \u00b7 the bot grows with you</div></button>' +
        '<button id="rb-ai" class="rb-act" style="padding:10px;border-radius:9px;border:1px solid #3a5a44;background:none;color:#7fbf90;font-family:inherit;font-size:11px;cursor:pointer;">\ud83c\udfae PRACTICE AI \u00b7 free \u00b7 no rank</button>' +
      '</div>' +

      '<div style="display:flex;gap:10px;margin-top:14px;">' +
        '<button id="rb-rank" class="rb-act" style="flex:1;padding:12px;border-radius:9px;border:1px solid #5aa8b4;background:rgba(143,216,224,.12);color:#bff0f6;font-family:inherit;font-size:11px;cursor:pointer;">\ud83c\udfc5 RANK \u00b7 leagues &amp; stars</button>' +
        '<button id="rb-refs" class="rb-act" style="flex:1;padding:12px;border-radius:9px;border:1px solid #d0a24a;background:rgba(255,207,92,.10);color:#ffd97a;font-family:inherit;font-size:11px;cursor:pointer;">\ud83c\udf81 REFERRALS \u00b7 earn 5%</button>' +
      '</div>';
    ov.appendChild(p); document.body.appendChild(ov);
    p.querySelector('#rb-x').onclick = _closePanel;
    // \u2500\u2500 MODE TAB perjungimas (isimenamas localStorage) — vienas pagrindinis CTA per ekrana \u2500\u2500
    function _setTab(t) {
      try { localStorage.setItem('rb_tab', t); } catch (_) {}
      var pv = p.querySelector('#rb-tab-pvp'), ai = p.querySelector('#rb-tab-ai');
      var bp = p.querySelector('#rb-tabbtn-pvp'), ba = p.querySelector('#rb-tabbtn-ai');
      var aiOn = t === 'ai';
      if (pv) pv.style.display = aiOn ? 'none' : 'flex';
      if (ai) ai.style.display = aiOn ? 'flex' : 'none';
      if (bp) { bp.style.background = aiOn ? 'none' : 'rgba(255,207,92,.14)'; bp.style.borderColor = aiOn ? '#3a4666' : '#ffcf5c'; bp.style.color = aiOn ? '#9db0cc' : '#ffcf5c'; }
      if (ba) { ba.style.background = aiOn ? 'rgba(92,224,138,.12)' : 'none'; ba.style.borderColor = aiOn ? '#5ce08a' : '#3a4666'; ba.style.color = aiOn ? '#8fffb0' : '#9db0cc'; }
    }
    p.querySelector('#rb-tabbtn-pvp').onclick = function () { _setTab('pvp'); };
    p.querySelector('#rb-tabbtn-ai').onclick = function () { _setTab('ai'); };
    var _t0 = 'pvp'; try { _t0 = localStorage.getItem('rb_tab') || 'pvp'; } catch (_) {}
    _setTab(_t0);
    // \ud83e\udd16 AI tab "TAVO lyga": emblema + kokio lygio botas lauks (bot kopijuoja TAVE)
    (function () {
      var el = p.querySelector('#rb-ai-you'); if (!el) return;
      var a = _walletAddr();
      if (!a) { el.innerHTML = '<div style="padding:14px 0;">connect your wallet \u2014 the bot plays at YOUR league level</div>'; return; }
      _rankStats(a).then(function (s) {
        if (!document.body.contains(el)) return;
        var d = _rankDecode((s && s.score) || 0), fs = Math.floor(d.hs / 2);
        el.innerHTML =
          '<img src="assets_rank/emb_' + d.league + '.png" alt="" style="width:66px;height:66px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5));vertical-align:middle;">' +
          '<div style="margin-top:6px;font-size:12px;color:#ffd97a;">YOU: ' + d.name + ' ' + _spriteStars(d.hs, 15) + '</div>' +
          '<div style="margin-top:4px;font-size:9px;color:#8a9aaa;">your opponent will be <b style="color:#8fffb0;">' + d.name + ' AI ' + fs + '\u2605</b></div>';
      });
    })();
    // 🔗 grandinės mygtukų paryškinimas
    function _paintChain() {
      var rn = p.querySelector('#rb-chain-ronin'), so = p.querySelector('#rb-chain-solana');
      if (rn) { rn.style.background = _chain === 'ronin' ? 'rgba(255,207,92,.30)' : 'rgba(255,207,92,.06)'; rn.style.borderColor = _chain === 'ronin' ? '#ffcf5c' : '#6a4a18'; }
      if (so) { so.style.background = _chain === 'solana' ? 'rgba(157,122,208,.30)' : 'rgba(255,207,92,.06)'; so.style.borderColor = _chain === 'solana' ? '#b98cff' : '#6a4a18'; so.style.color = _chain === 'solana' ? '#cbb0ff' : '#ffcf5c'; }
    }
    // pakopos — dinaminės pagal grandinę; Solanai rodom $ + (~SOL) etiketę
    function _renderTiers() {
      var host = p.querySelector('#rb-tiers'); if (!host) return;
      var solMode = _chain === 'solana';
      var arr = solMode ? SOL_TIERS : TIERS;
      var sel = solMode ? _selectedSol : _selectedTier;
      host.innerHTML = arr.map(function (t) {
        var on = t === sel;
        var main = solMode ? ('$' + t.toFixed(2)) : String(t);
        var sub = solMode ? 'SOL' : 'RONKE';
        return '<button class="rb-tier rb-act" data-t="' + t + '" style="flex:1;padding:16px 6px;border-radius:9px;border:2px solid ' + (on ? (solMode ? '#b98cff' : '#ffcf5c') : '#6a4a18') + ';background:' + (on ? (solMode ? 'rgba(157,122,208,.28)' : 'rgba(255,207,92,.30)') : 'rgba(255,207,92,.06)') + ';color:' + (solMode ? '#cbb0ff' : '#ffcf5c') + ';font-family:inherit;font-size:17px;cursor:pointer;">' + main + '<div style="font-size:9px;opacity:.6;margin-top:3px;">' + sub + '</div></button>';
      }).join('');
      host.querySelectorAll('.rb-tier').forEach(function (b) {
        b.onclick = function () { var v = Number(b.getAttribute('data-t')); if (solMode) _selectedSol = v; else _selectedTier = v || 69; _renderTiers(); };
      });
      var amt = p.querySelector('#rb-host-amt'), cur = p.querySelector('#rb-host-cur');
      if (amt) amt.textContent = solMode ? ('$' + _selectedSol.toFixed(2)) : String(_selectedTier);
      if (cur) cur.textContent = solMode ? 'SOL' : 'RONKE';
    }
    function _setChain(c) { _chain = c; _paintChain(); _renderTiers(); _renderList(); }
    p.querySelector('#rb-chain-ronin').onclick = function () { _setChain('ronin'); };
    p.querySelector('#rb-chain-solana').onclick = function () { _setChain('solana'); };
    // pradinė grandinė: jei Phantom prijungtas/yra, o Ronino nėra → Solana; kitaip Ronin
    try { if (window.BlocksSolana && window.BlocksSolana.available() && !(window.BlocksWager && window.BlocksWager.address())) _chain = 'solana'; } catch (_) {}
    _paintChain(); _renderTiers();
    p.querySelector('#rb-host').onclick = function () { if (_chain === 'solana') _doHostSol(_selectedSol, false); else _doHost(_selectedTier, false); };
    p.querySelector('#rb-private').onclick = function () { if (_chain === 'solana') _doHostSol(_selectedSol, true); else _doHost(_selectedTier, true); };
    p.querySelector('#rb-ai').onclick = function () { _closePanel(); try { if (window.RonkeBlocks) window.RonkeBlocks.openAI(); } catch (_) {} };
    p.querySelector('#rb-airank').onclick = function () { _doAiRanked(); };   // 🤖 RANKED vs AI (serverio botas)
    // 🤖 „AI PLAYS FOR ME" jungiklis — kito PvP mačo metu TAVO lygos botas žais UŽ TAVE (+25 RONKE su statymu)
    function _paintAiTog() {
      var b = p.querySelector('#rb-aitog'); if (!b) return;
      b.innerHTML = _aironkeHtml(20) + ' AI PLAYS FOR ME: <b style="color:' + (_aiPlayFlag ? '#8fffb0' : '#8a9aaa') + ';">' + (_aiPlayFlag ? 'ON' : 'OFF') + '</b>';
      b.style.borderStyle = _aiPlayFlag ? 'solid' : 'dashed';
      b.style.borderColor = _aiPlayFlag ? '#5ce08a' : '#4a7a4a';
      b.style.background = _aiPlayFlag ? 'rgba(92,224,138,.14)' : 'none';
    }
    // 🤖 portretai-mygtukai: AI kiborgas = AI žais už tave (ON), Ronke = žaidi pats (OFF)
    function _paintHeadSel() {
      var ai = p.querySelector('#rb-head-ai'), me = p.querySelector('#rb-head-me');
      if (ai) ai.style.opacity = _aiPlayFlag ? '1' : '.45';
      if (me) me.style.opacity = _aiPlayFlag ? '.45' : '1';
    }
    p.querySelector('#rb-aitog').onclick = function () { _aiPlayFlag = !_aiPlayFlag; _paintAiTog(); _paintHeadSel(); };
    var _hAi = p.querySelector('#rb-head-ai'), _hMe = p.querySelector('#rb-head-me');
    if (_hAi) _hAi.onclick = function () { _aiPlayFlag = true; _paintAiTog(); _paintHeadSel(); };
    if (_hMe) _hMe.onclick = function () { _aiPlayFlag = false; _paintAiTog(); _paintHeadSel(); };
    _paintAiTog();
    _paintHeadSel();
    p.querySelector('#rb-refs').onclick = function () { _openReferralPanel(); };   // 🎁 referal panelė
    p.querySelector('#rb-rank').onclick = function () { _openRankPanel(); };       // 🏅 reitingo panelė

    _ensureGame();                 // preload paslėptą žaidimo iframe (host/join iškart)
    _renderList();
    // 🔗 jei VĖL atsidarau panelę hostindamas fone → iškart parodau savo laukimo būseną + invite linką
    if (_bgActive && _hostInvite && _hostInvite.url) _showHostStatus();
    // 📶 GYVAS signalo stiprumas (kartojasi kas 3s) — kad žaidėjas prieš prisijungdamas matytų ar bus lagas
    _startSignalLoop();
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
      .map(function (r) { return { roomId: r.roomId, host: (r.metadata && r.metadata.host) || 'Player', tier: (r.metadata && r.metadata.tier) || 69, mid: (r.metadata && r.metadata.mid) || null, wagerLive: (r.metadata && r.metadata.wagerLive), chain: (r.metadata && r.metadata.chain) || 'ronin' }; });
    _renderList();
  }
  function _renderList() {
    if (!_panel) return;
    var list = _panel.querySelector('#rb-list'); if (!list) return;
    /* NErodom SAVO kambario + rodom TIK pasirinktos grandinės mačus (Solana mato Solana, Ronin – Ronin). */
    var rooms = _waitingRooms.filter(function (r) { return r.roomId !== _myRoomId && (r.chain || 'ronin') === _chain; });
    if (!rooms.length) {
      var none = _chain === 'solana' ? 'no open SOL matches yet' : 'no open matches yet';
      list.innerHTML = '<div style="color:#6a7a8a;font-size:9px;padding:14px 0;text-align:center;">' + none + '<br><span style="opacity:.7;">host one below ↓</span></div>';
      return;
    }
    list.innerHTML = '';
    rooms.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'rb-row';
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:15px 16px;background:#182238;border:2px solid #46567e;border-radius:9px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.3);';
      row.innerHTML = '<span style="font-size:20px;">⚔️</span>' +
        '<span style="flex:1;color:#ffcf5c;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(String(r.host).slice(0, 18)) + '</span>' +
        '<span style="font-size:13px;color:#ffd97a;font-weight:700;white-space:nowrap;">' + (r.tier || 69) + ' <span style="font-size:8px;opacity:.6;">RONKE</span></span>' +
        '<span style="font-size:12px;color:#aef0b0;border:2px solid #5ca05c;background:rgba(92,224,138,.12);border-radius:6px;padding:8px 14px;font-weight:700;">JOIN ▶</span>';
      row.onclick = function () { _doJoin(r); };
      list.appendChild(row);
    });
  }
  function _status(html, show) {
    if (!_panel) return; var s = _panel.querySelector('#rb-status'); if (!s) return;
    s.innerHTML = html; s.style.display = show ? 'block' : 'none';
  }
  // 🔗 HOST'o laukimo būsena + invite linkas (naudojama ir gavus 'connecting' state, IR vėl atsidarius
  //    panelę hostinant — nes iframe state nesikeičia, tad naujos žinutės su linku nebeateina).
  function _showHostStatus() {
    if (!_panel || !_hostInvite) return;
    var hi = _hostInvite;
    var head = (hi.priv && hi.roomCode)
      ? 'PRIVATE ROOM<br><span style="font-size:14px;color:#ffcf5c;letter-spacing:2px;">' + _esc(String(hi.roomCode).toUpperCase()) + '</span>'
      : 'Waiting for an opponent...<br><span style="font-size:8px;opacity:.7;">you can close this and keep playing</span>';
    var linkRow = hi.url
      ? '<br><button id="rb-copy" style="margin-top:12px;font:800 13px monospace;color:#bff0f6;background:rgba(143,216,224,.18);border:2px solid #5aa8b4;border-radius:8px;padding:13px 18px;width:100%;box-sizing:border-box;cursor:pointer;letter-spacing:.5px;">📋 COPY INVITE LINK</button>'
      : '';
    _status(head + linkRow, true);
    var cp = _panel.querySelector('#rb-copy');
    if (cp) cp.onclick = function () {
      // 🎁 invite linkas = IR referal linkas: pridedam &ref=<mano adresas> (svečias prisiriša per pirmą tetris).
      var url = hi.url; try { var me = _walletAddr(); if (me && url.indexOf('ref=') < 0) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'ref=' + me; } catch (_) {}
      try { if (navigator.clipboard && url) { navigator.clipboard.writeText(url); cp.textContent = '✓ link copied - send it to a friend!'; } } catch (_) {}
    };
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
  // 📱 Pinigines garantas: nera adreso -> Wallet.connect('ronin') (mobile = WalletConnect
  //   deep-link i Ronin Wallet app, desktop = extension popup) + poll; prisijungus tesiam veiksma.
  function _ensureWallet(then) {
    if (_walletAddr()) { then(); return; }
    if (!(window.Wallet && window.Wallet.connect)) {
      _status('\uD83D\uDD17 Connect your Ronin wallet first (\u2630 MENU \u2192 WALLET).', true);
      return;
    }
    _status('\uD83D\uDD17 Opening Ronin Wallet \u2014 approve the connection\u2026<br><span style="font-size:8px;opacity:.7;">no wallet app? install Ronin Wallet first</span>', true);
    try { window.Wallet.connect('ronin').catch(function (e) { console.warn('[lobby connect]', e && e.message); }); } catch (_) {}
    var n = 0, t = setInterval(function () {
      if (_walletAddr()) { clearInterval(t); _status('\u2705 Wallet connected!', true); setTimeout(then, 300); }
      else if (++n > 240) { clearInterval(t); _status('Wallet not connected \u2014 tap again to retry.', true); }
    }, 500);
  }
  function _doStake(tier, ai, aiFee) {
    if (!_wager()) return;
    // 🤖 useAi = PvP „AI žaidžia už mane" — NEMOKAMA (moki tik pakopą); ai=true = RANKED vsAI (25 fee).
    var useAi = !ai && _aiPlayFlag;
    _status('Confirm <b>' + tier + ' RONKE</b> ' + (ai ? 'RANKED AI fee' : 'stake') + ' in your wallet…', true);
    var pay = ai ? window.BlocksWager.payExact(tier) : window.BlocksWager.payEntry(tier);
    pay.then(function (r) {
      if (!r || !r.ok) {
        _status((ai ? 'Fee' : 'Stake') + ' failed: ' + _esc((r && r.reason) || 'error') + ' — match cancelled', true);
        _cmd('stakecancel');
        return;
      }
      _cmd('stake', null, tier, r.tx, null, window.BlocksWager.address(), null, _myRef(), useAi);   // įėjimo tx + 🎁 referrer'is (+🤖 aiPlay) → serveris verifikuoja+bind'ina
      _status('⛓️ ' + (ai ? 'Fee' : 'Stake') + ' sent - verifying…' + (useAi ? '<br><span style="font-size:8px;opacity:.7;">🤖 your AI will play this match</span>' : ''), true);
    });
  }

  // 🟣 Solana host — realus SOL srautas įsijungs kai serveris+config paruošti (BlocksSolana.enabled()).
  //   Kol kas: aiškus „coming soon" (nekuriam painaus nemokamo mačo su $ etiketėmis).
  function _doHostSol(usd, priv) {
    var S = window.BlocksSolana;
    if (!(S && S.enabled())) {
      var w = (S && S.available()) ? '' : '<br><span style="font-size:9px;opacity:.75;">install Phantom wallet to play with SOL</span>';
      _status('🟣 <b>Solana ($' + usd.toFixed(2) + ' SOL) — coming soon</b>.<br><span style="font-size:9px;opacity:.75;">SOL payments are being set up. Use 🔷 RONIN for now.</span>' + w, true);
      return;
    }
    // LIKO (kai config): connect Phantom → BlocksSolana.payEntry (užrakinta lamports) → host chain='solana'.
    _status('🟣 Solana host (SOL) — jungiamės…', true);
  }
  function _doHost(tier, priv) {
    if (_wager() && !_walletAddr()) { _ensureWallet(function () { _doHost(tier, priv); }); return; }   // 📱 pinigine privaloma statymui
    _bgActive = true; _myRole = priv ? 'private' : 'host'; _podClaimedMatch = false; _ensureGame();
    if (_wager()) {
      // 🧱💰 pay-on-accept: NEmokam dabar — tik sukuriam wager kambarį. Mokėsi kai atsiras varžovas ir sutiksi.
      _cmd(priv ? 'private' : 'host', null, tier, null, false, window.BlocksWager.address(), true, null, _aiPlayFlag);   // wager:true · serverAuth=FALSE → client-auth (be lago); cheat-apsauga per periodinę patikrą (LIKO)
      _status((priv ? 'Private room' : 'Hosting for ' + tier + ' RONKE') + ' — waiting…<br><span style="font-size:8px;opacity:.7;">you pay only when an opponent is matched · can close & keep playing</span>' + (_aiPlayFlag ? '<br><span style="font-size:8px;color:#8fffb0;">🤖 your AI will play this match</span>' : ''), true);
    } else {
      _cmd(priv ? 'private' : 'host', null, tier, null, false, _walletAddr(), false, _myRef(), _aiPlayFlag);   // nemokamas (client-board); 🏅 addr → reitingas/XP; 🎁 ref → bind nuo pirmo mačo
      _status((priv ? 'Creating private room' : 'Hosting for ' + tier + ' RONKE') + ' — waiting…<br><span style="font-size:8px;opacity:.7;">you can close this and keep playing</span>', true);
    }
  }
  // 🤖 RANKED vs AI — privatus kambarys su SERVERIO botu TAVO lygos×žvaigždučių stiprumo. 25 RONKE fee
  //   (payAndPlay → treasury, player-signed → PoD), payout NĖRA: laimi +1★ / pralaimi −½★ (TAS PATS
  //   reitingas kaip PvP). Mokama pay-on-accept stiliumi: serveris paprašo stake_now{ai:true} → _doStake(t,true).
  //   Reikia piniginės (be jos nėra nei reitingo, nei fee) — net kai wager serveris negyvas (free dev režimas).
  function _doAiRanked() {
    var a = _walletAddr();
    if (!a) { _ensureWallet(_doAiRanked); return; }   // 📱 mobile: WC deep-link + poll, tada kartojam
    _bgActive = true; _myRole = 'ai'; _podClaimedMatch = false; _ensureGame();
    _cmd('ai', null, 0, null, false, a, _wager());
    _status('🤖 RANKED vs AI — bot plays at <b>your league level</b>. Beat it to rank up!' + (_wager() ? '<br><span style="font-size:8px;opacity:.7;">25 RONKE fee — confirm in wallet when asked</span>' : ''), true);
  }
  // JOIN: jei wager → sumoka tą pačią pakopą į kambario on-chain matchId; kitaip nemokamas.
  function _doJoin(r) {
    if (_wager() && !_walletAddr()) { _ensureWallet(function () { _doJoin(r); }); return; }   // 📱 pinigine privaloma statymui
    _bgActive = true; _myRole = 'guest'; _podClaimedMatch = false; _ensureGame();
    if (_wager()) {
      // 🛡️ Apsauga: nesijunk į statymo kambarį, jei serveris NEGALI išmokėti (host'as be sukonfigūruoto serverio).
      if (r.wagerLive === false) { _bgActive = false; _status('This room\'s stakes are not live yet - pick a free match.', true); return; }
      // 🧱💰 pay-on-accept: NEmokam dabar — sumokėsi kai host'as patvirtins (abu moka kartu).
      _cmd('join', r.roomId, r.tier, null, false, window.BlocksWager.address(), true, null, _aiPlayFlag);   // wager:true · serverAuth=FALSE → client-auth (be lago)
      _status('Joining ' + _esc(r.host) + ' · ' + r.tier + ' RONKE — you pay when the match is confirmed…' + (_aiPlayFlag ? '<br><span style="font-size:8px;color:#8fffb0;">🤖 your AI will play this match</span>' : ''), true);
    } else {
      _cmd('join', r.roomId, r.tier, null, false, _walletAddr(), false, _myRef(), _aiPlayFlag);   // 🏅 addr → reitingas/XP; 🎁 ref → bind nuo pirmo mačo
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
  // ── 🔗 FOKUSUOTAS KVIETIMO EKRANAS (UX): paspaudus linką iškart AIŠKUS „patvirtink ir žaisk" langas su
  //    kaina — NE „pasimetimas pilyje". Vienas mygtukas → prisijungimas+mokėjimas per esamą srautą. ──────
  // 🔗 prijungtos piniginės adresas ('' jei neprijungta) — invite ekranui reikia piniginės mokėjimui
  function _walletAddr() {
    try { if (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) return String(window.Wallet.getAddress()); } catch (_) {}
    try { if (window.BlocksWager && window.BlocksWager.address && window.BlocksWager.address()) return String(window.BlocksWager.address()); } catch (_) {}
    return '';
  }
  function _hideInviteOverlay() { var o = document.getElementById('rb-invite-ov'); if (o) { try { o.remove(); } catch (_) {} } }
  function _renderInviteOverlay(r, roomId, mode) {
    _css();
    var o = document.getElementById('rb-invite-ov');
    if (!o) {
      o = document.createElement('div'); o.id = 'rb-invite-ov';
      o.style.cssText = 'position:fixed;inset:0;z-index:99800;background:rgba(6,9,16,.9);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(5px);font-family:monospace;';
      document.body.appendChild(o);
    }
    var tier = (r && r.tier) || _selectedTier || 69;
    var host = (r && r.host) ? _esc(String(r.host).slice(0, 18)) : 'A player';
    var prize = Math.floor(tier * 2 * 0.8);
    var inner;
    if (mode === 'loading') {
      inner = '<div style="font-size:30px;margin-bottom:8px;">⚔️</div><div style="font-size:13px;color:#ffd97a;">🔗 Loading invite…</div>';
    } else if (mode === 'notfound') {
      inner = '<div style="font-size:30px;margin-bottom:8px;">⚔️</div>' +
        '<div style="font-size:13px;color:#ffb0b0;margin-bottom:16px;line-height:1.5;">Invite not found —<br>host may have left or the match is full.</div>' +
        '<button id="rb-inv-x" style="padding:11px 22px;border-radius:8px;border:2px solid #6a4a18;background:rgba(255,207,92,.12);color:#ffcf5c;font:700 12px monospace;cursor:pointer;">← Back to castle</button>';
    } else {
      // 🔗 jei wager IR piniginė NEprijungta → pirmas žingsnis = prijungti piniginę (kitaip mokėti negalima)
      var needWallet = _wager() && !_walletAddr();
      var goBtn = needWallet
        ? '<button id="rb-inv-go" class="rb-act" style="width:100%;box-sizing:border-box;padding:16px;border-radius:10px;border:2px solid #5aa8b4;background:rgba(143,216,224,.2);color:#cdeef5;font:800 14px monospace;cursor:pointer;letter-spacing:.5px;">🔗 CONNECT WALLET TO PLAY</button>' +
            '<div style="font-size:9px;color:#8fd8e0;opacity:.85;margin-top:8px;line-height:1.5;">connect your Ronin wallet,<br>then confirm the ' + tier + ' RONKE stake<br><b>on mobile:</b> this opens the Ronin Wallet app — approve there and come back</div>'
        : '<button id="rb-inv-go" class="rb-act" style="width:100%;box-sizing:border-box;padding:16px;border-radius:10px;border:2px solid #5ce08a;background:rgba(92,224,138,.16);color:#8fffb0;font:800 15px monospace;cursor:pointer;letter-spacing:.5px;">⚔️ CONFIRM &amp; PLAY</button>';
      inner =
        '<div style="font-size:36px;margin-bottom:8px;">⚔️</div>' +
        '<div style="font-size:16px;color:#8fd8e0;font-weight:800;margin-bottom:2px;">' + host + '</div>' +
        '<div style="font-size:12px;opacity:.85;margin-bottom:16px;">invited you to <b style="color:#ffcf5c;">PVP TETRIS</b> 1v1</div>' +
        '<div style="display:flex;gap:18px;justify-content:center;align-items:center;margin-bottom:10px;">' +
          '<div><div style="font-size:22px;color:#ffd97a;font-weight:800;">' + tier + '</div><div style="font-size:8px;opacity:.6;letter-spacing:.5px;">YOUR STAKE</div></div>' +
          '<div style="font-size:16px;opacity:.4;">→</div>' +
          '<div><div style="font-size:22px;color:#8dffa0;font-weight:800;">' + prize + '</div><div style="font-size:8px;opacity:.6;letter-spacing:.5px;">WINNER GETS</div></div>' +
        '</div>' +
        '<div id="rb-inv-sig" style="margin-bottom:14px;">' + _signalHtml(_pingMs) + '</div>' +   // 📶 signalas PRIEŠ prisijungiant
        goBtn +
        // 🤖 signalas silpnas? — leisk TAVO lygos AI žaisti už tave (+25 RONKE prie statymo)
        (needWallet ? '' : '<button id="rb-inv-ai" class="rb-act" style="margin-top:9px;width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #4a7a4a;background:rgba(74,122,74,.12);color:#9fe0a0;font:700 11px monospace;cursor:pointer;">' + _aironkeHtml(20) + ' LAGGY? MY AI PLAYS FOR ME <span style="opacity:.7;">(free)</span></button>') +
        '<button id="rb-inv-x" style="margin-top:9px;width:100%;box-sizing:border-box;padding:9px;border-radius:8px;border:1px solid #4a3a55;background:none;color:#8a9aaa;font:600 11px monospace;cursor:pointer;">Cancel</button>';
    }
    o.innerHTML = '<div style="background:linear-gradient(180deg,#241a08,#140e04);border:3px solid #e0a832;border-radius:16px;padding:26px 30px;text-align:center;color:#ffd97a;box-shadow:0 0 48px rgba(224,168,50,.45);max-width:360px;width:100%;">' + inner + '</div>';
    var go = o.querySelector('#rb-inv-go');
    if (go) go.onclick = function () {
      if (!_wager() || _walletAddr()) {   // piniginė yra (arba nemokamas) → jungiam prie mačo
        _hideInviteOverlay(); _bgActive = true; _myRole = 'guest'; _ensureGame(); _autoJoinInvite(roomId, 0);
        return;
      }
      // 🔗 piniginė NEprijungta → atidarom prisijungimą, palaukiam, tada VĖL rodom (jau su „CONFIRM & PLAY")
      _hideInviteOverlay();
      /* 📱 MOBILE be piniginės: TIESIAI Ronin connect (WalletConnect deep-link į Ronin app) —
       * bendras connect UI naujoką mobile pasiklaidina. Desktop (yra provider) — įprastas UI. */
      try {
        var _hasNative = !!((window.ronin && window.ronin.provider) || window.ethereum);
        if (!_hasNative && window.Wallet && window.Wallet.connect) {
          window.Wallet.connect('ronin').catch(function (e) { console.warn('[invite connect]', e && e.message); });
        } else if (window.WalletUI && window.WalletUI.openConnect) window.WalletUI.openConnect();
      } catch (_) {}
      var tries = 0, poll = setInterval(function () {
        tries++;
        if (_walletAddr() || tries > 240) { clearInterval(poll); _renderInviteOverlay(r, roomId, 'ready'); }   // prisijungė (arba ~2min — mobile app kelionė lėta) → vėl invite ekranas
      }, 500);
    };
    var x = o.querySelector('#rb-inv-x');
    if (x) x.onclick = function () { _hideInviteOverlay(); };
    // 🤖 „mano AI žaidžia už mane" — įjungiam vėliavą ir einam tuo pačiu confirm keliu (+25 prie statymo)
    var goAi = o.querySelector('#rb-inv-ai');
    if (goAi) goAi.onclick = function () { _aiPlayFlag = true; if (go) go.onclick(); };
    // 📶 GYVAS signalas — kartojasi kas 3s (kad matytųsi ar bus lagas prieš prisijungiant), ne vienkartinis
    if (mode === 'ready') _startSignalLoop();
    try { if (window.Sfx && window.Sfx.play && mode === 'ready') window.Sfx.play('notify'); } catch (_) {}
  }
  function _showInviteConfirm(roomId, tries) {
    tries = tries || 0;
    _fetchRoomById(roomId).then(function (r) {
      if (!r) {
        if (tries < 12) { if (tries === 0) _renderInviteOverlay(null, roomId, 'loading'); setTimeout(function () { _showInviteConfirm(roomId, tries + 1); }, 700); return; }
        _renderInviteOverlay(null, roomId, 'notfound'); return;
      }
      _renderInviteOverlay(r, roomId, 'ready');
    });
  }
  function _checkInviteJoin() {
    var roomId = null;
    try { roomId = new URLSearchParams(location.search).get('rbjoin'); } catch (_) {}
    if (!roomId) return;
    // pašalinam param iš adreso juostos (kad perkrovus nesijungtų vėl, ir liktų švarus URL)
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (_) {}
    // 🔗 iškart rodom FOKUSUOTĄ patvirtinimo ekraną (su kaina) — ne fone įmetam į pilį
    setTimeout(function () { _ensureGame(); _showInviteConfirm(roomId, 0); }, 600);
  }

  function _closePanel() {
    _disconnectLobby();
    _stopSignalLoop();
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
    _bgActive = false; _hideHostPill(); _hostInvite = null;   // 🔗 nustojau hostinti → nuvalom įsimintą linką
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
    _iframe.src = 'tetris/index.html?net=colyseus&embed=panel&v=rb108';
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
  function _cmd(cmd, roomId, tier, mid, serverAuth, addr, wager, ref, aiPlay) {
    try { if (_iframe && _iframe.contentWindow) _iframe.contentWindow.postMessage({ __rbpanel: 'cmd', cmd: cmd, roomId: roomId, tier: tier, mid: mid, serverAuth: serverAuth, addr: addr, wager: wager, ref: ref, aiPlay: aiPlay }, '*'); } catch (_) {}
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
    var vis = document.getElementById('rb-challenge');
    if (vis && vis.style.display !== 'none') return;   // jau matomas → nedubliuojam (event + interval abu siunčia 'challenge')
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
        '<div style="font-size:12px;opacity:.85;margin:4px 0 18px;">wants to play PVP TETRIS 1v1!</div>' +
        '<div style="display:flex;gap:10px;">' +
          '<button id="rb-acc" class="rb-act" style="flex:1;padding:12px;border-radius:8px;border:2px solid #5ce08a;background:rgba(92,224,138,.15);color:#8fffb0;font:800 13px monospace;cursor:pointer;">✓ ACCEPT</button>' +
          '<button id="rb-dec" class="rb-act" style="flex:1;padding:12px;border-radius:8px;border:2px solid #e07070;background:rgba(224,112,112,.13);color:#ffb0b0;font:800 13px monospace;cursor:pointer;">✕ DECLINE</button>' +
        '</div></div>';
    d.style.display = 'flex';
    d.querySelector('#rb-acc').onclick = function () { _challengeAck = true; _hideChallenge(); _cmd('accept'); };   // reveal ateis su state=countdown
    d.querySelector('#rb-dec').onclick = function () { _challengeAck = true; _hideChallenge(); _cmd('decline'); if (_bgActive) _showHostPill(); };
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
    if (d.stakeNow) { _doStake(d.stakeTier, d.stakeAI, d.stakeAiFee); }   // 🤖 stakeAI=true → vsAI fee; stakeAiFee → PvP „AI už mane" priedas
    if (d.wagerVerify) { _status('⛓️ Verifying stakes on-chain…', true); }
    if (d.wagerAbort) { _status('Stake ' + (d.wagerAbort === 'stake_verify_failed' ? 'verification failed' : 'issue') + ' — refunded. Try again.', true); }
    if (d.wagerPrize) { _wagerWin(d.wagerPrize, d.wagerPot); }
    if (d.rankAnim) { setTimeout(function () { _showRankAnim(d.rankAnim); }, 60); }   // 🎬 reitingo šou IŠKART (žaidimo skydas ranked mače nerodomas)
    if (d.xpReport) { _xpReport = d.xpReport; }   // 🎖️ rodysim uzdarius rank kortele (claim → ⛓ per edge fn, ne per kambarį)
    var st = d.state; _lastState = st;
    if (st && st !== 'challenge') _challengeAck = false;   // paliko challenge būseną → kitą kartą (naujas varžovas) vėl rodom
    if (d.myRoomId != null) _myRoomId = d.myRoomId;   // MANO kambarys → nerodom sąraše (negaliu prisijungti prie savęs)
    if (_panel && st !== 'lobby') _renderList();       // perpiešiam sąrašą be savo kambario
    if (st === 'prep' || st === 'countdown' || st === 'playing' || st === 'result') {
      if (!_podClaimedMatch && st !== 'result') { _podClaimedMatch = true; _podClaimPlay(); }   // 🏆 PoD: sužaistas žaidimas → player-signed claim
      _hideInviteOverlay();            // 🎓 pasiruošimas prasidėjo → nuimam invite ekraną (jei buvo)
      _revealGame();                   // 🎓 prep/rungtynės → atidengiam žaidimą (rodom tutorial ekraną)
    } else if (st === 'challenge') {
      if (!_challengeAck) _showChallenge(d.opponent);   // oponentas prisijungė → „do you want to play?" (dedupe: jau patvirtinta → neberodom)
    } else if (st === 'awaiting') {
      if (_panel) _status('Challenge sent - waiting for <b>' + _esc(d.host || 'host') + '</b> to accept...', true);
    } else if (st === 'connecting') {
      // 🔗 įsimenam host'o invite duomenis → kad VĖL atsidarius panelę linkas nedingtų (state nesikeičia)
      _hostInvite = { url: d.inviteUrl || '', priv: !!d.priv, roomCode: d.roomCode || '' };
      if (_panel) _showHostStatus();
    } else if (st === 'lobby') {
      _hostInvite = null;                            // host nebelaukia → nuvalom įsimintą linką
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
    _captureRef();        // 🎁 pagaunam ?ref=<addr> iš referal/invite linko (localStorage)
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
