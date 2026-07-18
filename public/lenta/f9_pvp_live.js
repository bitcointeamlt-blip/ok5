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
  var statusEl = null, hudEl = null, capEl = null, boneEl = null, boneBalEl = null;
  var _capLast = '';
  var _boneLast = '';
  var _boneShown = 0, _boneTargetPrev = 0, _bonePulseT = null, _boneTickT = 0;   // 🦴 balanso count-up animacijai
  var _boneBankVal = 0, _boneSnapNext = true;   // 🦴 BANKO balansas (persist) — widget rodo bank+sesija; snap=be animacijos pirmam load
  var _boneNumEl = null, _boneNumTxt = '';      // ⚡ perf 07-06: boneBalNum span kešas + paskutinis tekstas (write-on-change)
  var _raidLog = { injured: [], dead: [] };     // ⚔ SETTLED suvestinei — mano nuostoliai per mūšį (reset _onStart)

  // 🔊⚔️🎺 ATTACK ALARM — garsinis įspėjimas kai kažkas įžengia į tavo teritoriją / puola pilį (under_attack).
  //   Savarankiškas WebAudio karo rago („dūda") signalas ~0.95s; GERBIA global SOUND OFF (localStorage 'lenta_muted'); throttle 2.5s.
  var _f9AlarmCtx = null, _f9AlarmLast = 0;
  function _f9PlayAttackAlarm() {
    try { if (localStorage.getItem('lenta_muted') === '1') return; } catch (_) {}   // gerbti SOUND OFF
    var now = Date.now();
    if (now - _f9AlarmLast < 2500) return;   // throttle — kad keli under_attack neperkrautų
    _f9AlarmLast = now;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      if (!_f9AlarmCtx) { _f9AlarmCtx = new Ctor(); }
      var ctx = _f9AlarmCtx;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (_) {} }
      var master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      // brass šiluma — lowpass nurėžia aštrius aukštus harmonikus (kad būtų „ragas", ne pyptelėjimas)
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1900; lp.Q.value = 0.6;
      lp.connect(master);
      // vibrato LFO — gyvas „pučiamo rago" tonas
      var lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
      lfo.frequency.value = 5.5; lfoGain.gain.value = 4.5; lfo.connect(lfoGain);
      var t0 = ctx.currentTime;
      lfo.start(t0);
      // 🎺 karo ragas („dūda") — 2 natos: žemas šauksmas → kvinta aukščiau (ta-daaa), ~0.95s
      var _horn = function (freq, ts, dur, vol) {
        for (var d = 0; d < 2; d++) {              // 2 detuned sawtooth = brass storumas
          var o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(freq * 0.94, ts);               // „pūstelėjimo" pitch swell
          o.frequency.exponentialRampToValueAtTime(freq, ts + 0.06);
          o.detune.value = d ? 8 : -8;
          lfoGain.connect(o.frequency);
          var g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, ts);
          g.gain.exponentialRampToValueAtTime(vol, ts + 0.045);      // attack
          g.gain.setValueAtTime(vol, ts + dur - 0.14);               // sustain
          g.gain.exponentialRampToValueAtTime(0.0001, ts + dur);     // release
          o.connect(g); g.connect(lp);
          o.start(ts); o.stop(ts + dur + 0.03);
        }
      };
      _horn(196, t0,        0.34, 0.5);   // G3 — žemas šauksmas
      _horn(294, t0 + 0.34, 0.62, 0.55);  // D4 — kvinta aukščiau (pergalingas)
      lfo.stop(t0 + 1.05);
    } catch (_) {}
  }
  try { window._f9TestAttackAlarm = _f9PlayAttackAlarm; } catch (_) {}   // 🧪 test: konsolėje `_f9TestAttackAlarm()`

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
    // 🏰 castle capture HUD baras
    capEl = document.createElement('div');
    capEl.style.cssText = 'position:fixed;top:62px;left:50%;transform:translateX(-50%);z-index:99998;font-family:monospace;font-size:11px;padding:4px 12px;border-radius:10px;background:rgba(8,12,18,.78);border:1px solid #2a3a4a;pointer-events:none;display:none;white-space:nowrap;';
    document.body.appendChild(capEl);
    // 🦴 KAULŲ BALANSO LANGELIS (VIRŠUJE PER VIDURĮ — user 2026-07-02 „aukštai per vidurį, kad būtų balansas")
    //   PIXEL-ART stilius: medinis rėmas + „Press Start 2P" šriftas + kietas pixel šešėlis. Count-up + pulse.
    //   ⚠️ centravimas per translateX(-50%) → pulse transform PRIVALO jį išlaikyti (žr. _syncBones).
    boneBalEl = document.createElement('div');
    boneBalEl.style.cssText = 'position:fixed;top:calc(14px + env(safe-area-inset-top, 0px));left:50%;transform:translateX(-50%) scale(1);z-index:99999;display:none;align-items:center;gap:9px;' +
      "font-family:'Press Start 2P','Courier New',monospace;font-size:12px;line-height:1;padding:10px 13px 9px;" +
      'background:#3a2614;color:#ffcf5c;image-rendering:pixelated;pointer-events:auto;cursor:pointer;' +
      'border:3px solid #1a1208;box-shadow:inset 0 0 0 2px #6b4a2e,inset 0 0 0 4px #241811,0 4px 0 2px #0c0906;' +
      'transform-origin:center top;transition:transform .12s ease-out,box-shadow .12s ease;';
    boneBalEl.innerHTML =
      '<span style="font-size:17px;line-height:1;filter:drop-shadow(1px 1px 0 #0c0906)">🦴</span>' +
      '<span id="boneBalNum" style="color:#8dffa0;text-shadow:2px 2px 0 #0c0906">0</span>';
    boneBalEl.title = 'Bone bank / swap to RONKE';
    boneBalEl.addEventListener('click', function () { try { _toggleBonePanel(); } catch (_) {} });   // 🦴 bankas + swap panelė
    document.body.appendChild(boneBalEl);
    // 🚫 Viršutinės HUD juostos (status/info/capture) NUIMTOS (user „kolkas") — statusEl/hudEl slepiam iškart.
    statusEl.style.display = 'none'; hudEl.style.display = 'none';
  }
  var _hudHidden = true;   // 🚫 kolkas HUD užrašai/indikatoriai nerodomi (capEl neatidengiam)
  // 🦴 Kaulų DUOMENYS sinchronizuojam į window._f9MyBones (atskiram „bones" ekranui) — BET gyvo skaitiklio NErodom.
  //   Pasiekimo jausmas ateina per per-kill „🦴 +N" pop (žr. 'died' handler), ne per HUD counterį.
  function _syncBones() {
    var room = _room(); if (!room || !room.state || !room.state.players || !room.state.players.get) return;
    var me = room.state.players.get(mySid); if (!me) return;
    var session = me.bones || 0;
    var target = Math.round((session + _boneBankVal) * 10) / 10;   // 🦴 widget = BENDRAS balansas (bankas + sesija) — kapinių collect irgi matosi
    // ⚡ perf 07-06: persistentas objektas, mutuojam laukus (buvo naujas literalas kas kadrą)
    var _mb = window._f9MyBones || (window._f9MyBones = {});
    _mb.bones = session; _mb.bank = _boneBankVal; _mb.total = target; _mb.mult = me.boneMult || 1; _mb.ronke = target * 5;   // 1 kaulas = 5 RONKE (== serverio BONE_VALUE_RONKE)
    _ui(); if (!boneBalEl) return;
    if (!started) { boneBalEl.style.display = 'none'; document.body.classList.remove('f9-bones-live'); _boneShown = 0; _boneTargetPrev = 0; _boneSnapNext = true; return; }
    boneBalEl.style.display = 'flex';
    document.body.classList.add('f9-bones-live');   // 📱 notifikacijos nusileidžia žemiau widget'o (style.css)
    // Pirmas load (scene-enter / bankas ką tik sužinotas) → SNAP be animacijos/pulse (bankas ne „nauji" kaulai)
    if (_boneSnapNext) { _boneSnapNext = false; _boneShown = target; _boneTargetPrev = target; }
    // 💥 PULSE kai target IŠAUGA (nauji kaulai prisidėjo prie balanso) — scale bounce + žalias kraštas.
    if (target > _boneTargetPrev + 0.001) {
      boneBalEl.style.transform = 'translateX(-50%) scale(1.13)';   // išlaikom top-center poziciją pulse metu
      boneBalEl.style.boxShadow = 'inset 0 0 0 2px #8dffa0,inset 0 0 0 4px #241811,0 4px 0 2px #0c0906';   // žalias bevel flash (pixel)
      if (_bonePulseT) clearTimeout(_bonePulseT);
      _bonePulseT = setTimeout(function () { if (boneBalEl) { boneBalEl.style.transform = 'translateX(-50%) scale(1)'; boneBalEl.style.boxShadow = 'inset 0 0 0 2px #6b4a2e,inset 0 0 0 4px #241811,0 4px 0 2px #0c0906'; } }, 150);
    }
    _boneTargetPrev = target;
    // 🔢 COUNT-UP — ODOMETRAS: kyla po 0.1 pastoviu ritmu, matosi KIEKVIENAS tiksėjimas
    //    (07-03 user: „atrodė geriau kai skaičiukai individualiai didėja" — vietoj eksponentinio lerp slide).
    if (_boneShown < target - 0.001) {
      var nowT = (window.performance && performance.now) ? performance.now() : Date.now();
      if (nowT - _boneTickT >= 45) {                                                   // ~22 tiksėjimai/s
        _boneShown = Math.min(target, _boneShown + ((target - _boneShown) > 5 ? 0.5 : 0.1));   // didelis gap (reconnect) → stambesni žingsniai
        _boneTickT = nowT;
      }
    } else _boneShown = target;                                                        // target nukrito (reset) → snap
    // ⚡ perf 07-06: ref kešuotas (buvo getElementById kas kadrą) + textContent rašomas TIK pasikeitus
    var numEl = _boneNumEl || (_boneNumEl = document.getElementById('boneBalNum'));
    var txt = _boneShown.toFixed(1);
    if (numEl && _boneNumTxt !== txt) { _boneNumTxt = txt; numEl.textContent = txt; }
  }

  // ── 🦴🎫 RONKEVERSE MINT-BONUS (2026-07-05) ──────────────────────────────────
  //   Ronkeverse holderiui nukalus NFT unitą → serveris (on-chain verifikuotas) apdovanoja kaulų banką.
  //   Klientas: barracks_nft.js claimTraining() → window.F9MintReward.report(txHash); čia — pending retry
  //   (localStorage, idempotent server) + „kaulai skrenda į balansą" animacija gavus mint_reward_done.
  var _MINT_PEND_KEY = 'f9_mintReward_pending';
  function _mintPend() { try { return JSON.parse(localStorage.getItem(_MINT_PEND_KEY) || '[]') || []; } catch (_) { return []; } }
  function _mintPendSave(a) { try { localStorage.setItem(_MINT_PEND_KEY, JSON.stringify((a || []).slice(-30))); } catch (_) {} }
  function _mintClearPending(tx) { if (!tx) return; _mintPendSave(_mintPend().filter(function (x) { return x !== tx; })); }
  function _mintFlush() {
    var room = _room(); if (!room || typeof room.send !== 'function') return;
    _mintPend().forEach(function (tx) { try { room.send('mint_reward', { txHash: tx }); } catch (_) {} });
  }
  window.F9MintReward = {
    report: function (txHash) {
      if (!txHash) return;
      var a = _mintPend(); if (a.indexOf(txHash) < 0) { a.push(txHash); _mintPendSave(a); }
      _mintFlush();   // paprastai room prisijungęs (mintinama pilies scenoj) → siunčiam iškart
    },
    flush: _mintFlush,
  };
  // 🦴 „skrenda į balansą" burstas — BENDRAS (mint bonus IR kapinių claim). count = kiek emoji nuskrieja į widget'ą.
  // opts (07-05 settled seq): {fx,fy}=kilmė (vietoj random centro), {tx,ty}=taikinys (vietoj banko
  //   widget'o), onArrive(k)=kviečiamas kiekvienam kaului ATVYKUS (chip pulse/count-up sinchronui).
  function _f9BonesFly(count, opts) {
    try {
      opts = opts || {};
      var tx = window.innerWidth / 2, ty = 46;
      if (opts.tx != null) { tx = opts.tx; ty = opts.ty; }
      else if (boneBalEl) { var r = boneBalEl.getBoundingClientRect(); tx = r.left + r.width / 2; ty = r.top + r.height / 2; }
      var N = Math.max(4, Math.min(14, Math.round(count || 6)));
      for (var i = 0; i < N; i++) (function (k) {
        var b = document.createElement('div');
        b.textContent = '🦴';
        var sx, sy;
        if (opts.fx != null) { sx = opts.fx + (Math.random() * 90 - 45); sy = opts.fy + (Math.random() * 26 - 13); }
        else { sx = tx + (Math.random() * 200 - 100); sy = window.innerHeight * 0.5 + (Math.random() * 90 - 30); }
        b.style.cssText = 'position:fixed;left:0;top:0;z-index:100050;font-size:' + (18 + Math.random() * 12).toFixed(0) + 'px;pointer-events:none;will-change:transform,opacity;filter:drop-shadow(1px 1px 0 #0c0906);opacity:0;transform:translate(' + sx.toFixed(0) + 'px,' + sy.toFixed(0) + 'px) scale(.6);transition:transform .75s cubic-bezier(.2,.75,.25,1),opacity .75s';
        document.body.appendChild(b);
        setTimeout(function () { b.style.opacity = '1'; b.style.transform = 'translate(' + tx.toFixed(0) + 'px,' + ty.toFixed(0) + 'px) scale(1.15)'; }, 20 + k * 55);
        setTimeout(function () {
          b.style.opacity = '0'; b.style.transform = 'translate(' + tx.toFixed(0) + 'px,' + (ty - 8).toFixed(0) + 'px) scale(.4)';
          if (opts.onArrive) { try { opts.onArrive(k); } catch (_) {} }
        }, 20 + k * 55 + 680);
        setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 20 + k * 55 + 1050);
      })(i);
      if (!opts.tx && boneBalEl) { boneBalEl.style.transform = 'translateX(-50%) scale(1.18)'; setTimeout(function () { if (boneBalEl) boneBalEl.style.transform = 'translateX(-50%) scale(1)'; }, 200); }
    } catch (_) {}
  }
  // 🦴🎫 Mint-bonus FX = bendras burstas + mint-specifinis toast.
  function _f9MintRewardFx(amount, n) {
    _f9BonesFly((n || 1) * 2);
    try { if (window.showGameNotification) window.showGameNotification('🦴 +' + amount + ' BONES', 'Ronkeverse mint bonus · ' + (n || 1) + ' unit' + ((n || 1) > 1 ? 's' : '') + ' minted', '#8dffa0'); } catch (_) {}
  }

  // ── 📜 RAID ATASKAITŲ panelė — BATTLE SETTLED stilius (unitų sprite grid, kaip F12 mūšio rezultatai). ──
  var _RR_IMG = {
    skull: 'unit-images/skull-idle.gif', archer: 'unit-images/archer-idle.gif',
    harpoon_fish: 'unit-images/harpoon-idle.gif', harpoon: 'unit-images/harpoon-idle.gif',
    shaman: 'unit-images/shaman-idle.gif', pigronke: 'unit-images/hog-idle.png', hog_rider: 'unit-images/hog-idle.png',
    ghost: 'unit-images/ghost-idle.png', ronhood: 'unit-images/ronhood-idle.png',
  };
  var _RR_NAME = { skull: 'Skull', archer: 'Archer', harpoon_fish: 'Harpoon', harpoon: 'Harpoon', shaman: 'Shaman', pigronke: 'Hog Rider', hog_rider: 'Hog Rider', ghost: 'Ghost', ronhood: 'RonkeHood' };
  function _rrInjectStyle() {
    if (document.getElementById('f9rr-style')) return;
    var st = document.createElement('style'); st.id = 'f9rr-style';
    st.textContent = [
      "#f9-raidrep{position:fixed;inset:0;z-index:100001;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(6,8,14,0.94);backdrop-filter:blur(4px);font-family:'Press Start 2P',monospace,sans-serif;overflow:auto;padding:20px 10px}",
      "#f9-raidrep .rr-title{color:#ffcf5c;font-size:15px;text-align:center;text-shadow:2px 2px 0 #2a1a0c;letter-spacing:1px}",
      "#f9-raidrep .rr-sub{color:#ffcf5c;font-size:8px;text-align:center;line-height:1.7;opacity:0.92;margin-top:8px}",
      "#f9-raidrep .rr-atk{color:#8a9aaa;font-size:7px;text-align:center;line-height:1.7;margin-top:6px}",
      "#f9-raidrep .rr-row{display:grid;grid-template-columns:repeat(6,auto);justify-content:center;align-items:end;gap:26px 14px;padding:22px 6px 6px;max-width:97vw}",
      "@media (max-width:640px){#f9-raidrep .rr-row{grid-template-columns:repeat(4,auto);gap:22px 10px}}",
      "#f9-raidrep .rr-unit{position:relative;display:flex;flex-direction:column;align-items:center}",
      "#f9-raidrep .rr-spr{width:min(13vw,20vh,120px);height:min(13vw,20vh,120px);image-rendering:pixelated;object-fit:contain;display:block;filter:drop-shadow(0 5px 5px rgba(0,0,0,0.55))}",
      "#f9-raidrep .rr-unit.dead .rr-spr{filter:grayscale(1) brightness(0.5) drop-shadow(0 5px 5px rgba(0,0,0,0.55))}",
      "#f9-raidrep .rr-unit.injured .rr-spr{filter:brightness(0.8) sepia(0.4) hue-rotate(-20deg)}",
      "#f9-raidrep .rr-badge{position:absolute;bottom:calc(100% - 14px);font-size:8px;padding:3px 7px;border-radius:5px;white-space:nowrap;border:1px solid}",
      "#f9-raidrep .rr-badge.dead{color:#ff8080;background:rgba(232,93,93,0.2);border-color:#7a3a3a}",
      "#f9-raidrep .rr-badge.injured{color:#ffcf5c;background:rgba(224,138,74,0.18);border-color:#6a4a18}",
      "#f9-raidrep .rr-meta{color:#cfd8e8;font-size:8px;margin-top:8px;text-align:center}",
      "#f9-raidrep .rr-id{color:#5a6a7a;font-size:6px;margin-top:3px}",
      "#f9-raidrep .rr-ok{margin-top:18px;padding:12px 34px;font-family:inherit;font-size:11px;letter-spacing:1px;border-radius:6px;border:2px solid #ffcf5c;background:#ffcf5c;color:#1a1208;cursor:pointer}",
      "#f9-raidrep .rr-nav{display:flex;gap:10px;align-items:center;margin-top:6px;color:#8a9aaa;font-size:8px}",
      "#f9-raidrep .rr-nav button{font-family:inherit;font-size:9px;background:#2a2416;color:#ffcf5c;border:1px solid #6a4a18;border-radius:5px;padding:5px 10px;cursor:pointer}",
    ].join('');
    document.head.appendChild(st);
  }
  function _showRaidReports(reps) {
    try {
      _rrInjectStyle();
      var esc = function (a) { a = String(a || ''); return a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a; };
      var fmtAgo = function (t) { var m = Math.max(0, Math.round((Date.now() - (t || 0)) / 60000)); return m < 60 ? (m + 'm ago') : (Math.round(m / 60) + 'h ago'); };
      var i = 0;
      var ov = document.getElementById('f9-raidrep'); if (ov) ov.remove();
      ov = document.createElement('div'); ov.id = 'f9-raidrep';
      document.body.appendChild(ov);
      function card(u, idx) {
        var img = _RR_IMG[u.utype] || _RR_IMG.skull, nm = _RR_NAME[u.utype] || 'Unit';
        var cls = u.fate === 'dead' ? ' dead' : (u.fate === 'injured' ? ' injured' : '');
        var badge = u.fate === 'dead' ? '<div class="rr-badge dead">💀 DIED</div>' : (u.fate === 'injured' ? '<div class="rr-badge injured">🏥 INJURED</div>' : '');
        return '<div class="rr-unit' + cls + '" style="animation-delay:' + (idx * 0.05).toFixed(2) + 's">' + badge +
          '<img class="rr-spr" src="' + img + '" alt="">' +
          '<div class="rr-meta">' + nm + (u.level ? ' <b>Lv' + u.level + '</b>' : '') + '</div>' +
          '<div class="rr-id">#' + u.tokenId + '</div></div>';
      }
      function render() {
        var r = reps[i];
        var resTxt = r.result === 'lost' ? '<span style="color:#ff6b6b;">💀 CASTLE FELL</span>'
                   : r.result === 'defended' ? '<span style="color:#6fcf5c;">🛡 CASTLE DEFENDED</span>'
                   : '<span style="color:#d49a2a;">↩ RAIDER RETREATED</span>';
        var units = Array.isArray(r.defUnits) ? r.defUnits : [];
        var nd = units.filter(function (u) { return u.fate === 'dead'; }).length;
        var ni = units.filter(function (u) { return u.fate === 'injured'; }).length;
        var ns = units.filter(function (u) { return u.fate === 'survived'; }).length;
        var sub = [];
        if (ns) sub.push(ns + ' survived');
        if (ni) sub.push('🏥 ' + ni + ' injured');
        if (nd) sub.push('💀 ' + nd + ' died');
        if (r.bonesStolen > 0) sub.push('🦴 −' + r.bonesStolen + ' stolen');
        var army = (r.atkArmy || []).map(function (a) { return (a.count > 1 ? a.count + '× ' : '') + (_RR_NAME[a.utype] || a.utype) + (a.level ? ' L' + a.level : ''); }).join(', ') || '—';
        var grid = units.length ? '<div class="rr-row">' + units.map(card).join('') + '</div>' : '<div style="color:#8a9aaa;font-size:8px;margin:20px;">No unit details.</div>';
        var nav = reps.length > 1 ? '<div class="rr-nav"><button id="rr-prev">◀</button><span>' + (i + 1) + ' / ' + reps.length + '</span><button id="rr-next">▶</button></div>' : '';
        ov.innerHTML =
          '<div class="rr-title">📜 RAID REPORT</div>' +
          '<div class="rr-sub">Attacked while you were away — ' + resTxt + '  ·  ' + fmtAgo(r.at) + '</div>' +
          '<div class="rr-sub">' + sub.join('  ·  ') + '</div>' +
          '<div class="rr-atk">⚔️ Raider ' + esc(r.attacker) + '  ·  army: ' + army + (r.matchId ? '  ·  🆔 MATCH #' + String(r.matchId).replace(/[<>&"']/g, '') : '') + '</div>' +
          grid + nav +
          '<button class="rr-ok" id="rr-ok">' + (i < reps.length - 1 ? 'NEXT ▶' : 'GOT IT') + '</button>';
        var ok = ov.querySelector('#rr-ok');
        if (ok) ok.onclick = function () { if (i < reps.length - 1) { i++; render(); } else ov.remove(); };
        var pv = ov.querySelector('#rr-prev'); if (pv) pv.onclick = function () { if (i > 0) { i--; render(); } };
        var nx = ov.querySelector('#rr-next'); if (nx) nx.onclick = function () { if (i < reps.length - 1) { i++; render(); } };
      }
      render();
    } catch (_) {}
  }
  // ── 🦴 BONE BANK panelė (klik ant balanso) — persistuotas bankas + swap → RONKE. ──
  //    Swap srautas: [SWAP] → serveris nurašo iš banko + EIP-712 voucher → Wallet.submitBoneSwap
  //    (ŽAIDĖJAS PATS moka gas) → TX success → bones_swap_done. Min 100 🦴 (enforce'ina ir kontraktas).
  var bonePanelEl = null, boneOverlayEl = null, _boneCfg = null, _boneSwapBusy = false;
  function _boneStatus(t, c) {
    var el = document.getElementById('boneSwapStatus');
    if (el) { el.textContent = t || ''; el.style.color = c || '#8a9aaa'; }
  }
  var _boneBtnCss = 'text-align:center;padding:14px 16px;margin:12px 0 8px;font-family:inherit;font-size:13px;letter-spacing:1px;border-radius:4px;border:2px solid;user-select:none;transition:all 0.15s ease;';
  function _bonePanel() {
    if (bonePanelEl) return bonePanelEl;
    // overlay — kaip trofėjų/kapinių panelė (pritemdo + blur, klik šalia = uždaro)
    boneOverlayEl = document.createElement('div');
    boneOverlayEl.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,22,0.92);z-index:99999;display:none;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
    boneOverlayEl.addEventListener('click', function (ev) { if (ev.target === boneOverlayEl) boneOverlayEl.style.display = 'none'; });
    bonePanelEl = document.createElement('div');
    bonePanelEl.style.cssText = 'background:linear-gradient(180deg,#1f2940 0%,#0c1020 100%);border:3px solid #ffcf5c;' +
      'box-shadow:0 0 48px rgba(255,207,92,0.35),inset 0 0 24px rgba(255,207,92,0.08);border-radius:8px;' +
      'padding:26px 32px;width:620px;max-width:94vw;max-height:88vh;overflow-y:auto;' +
      "font-family:'Press Start 2P',monospace,sans-serif;font-size:11px;color:#8a9aaa;";
    bonePanelEl.innerHTML =
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:8px;padding-bottom:12px;border-bottom:1px solid #4a3a18;">' +
        '<span style="font-size:26px;text-shadow:0 0 14px #ffcf5c;">🦴</span>' +
        '<span style="flex:1;font-size:18px;color:#ffcf5c;letter-spacing:2px;">BONE BANK</span>' +
        '<button id="bonePanelX" style="background:none;border:none;color:#8a9aaa;font-size:24px;cursor:pointer;line-height:1;font-family:inherit;">×</button></div>' +
      '<div style="font-size:11px;line-height:1.7;color:#8a9aaa;margin-bottom:14px;letter-spacing:0.5px;">Banked bones are SAFE from raiders — swap to RONKE anytime</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:12px;">' +
        '<div style="flex:1;background:linear-gradient(180deg,#14182a,#0a0c18);border:2px solid #3a3a55;border-radius:6px;padding:14px 14px;text-align:center;">' +
          '<div style="font-size:10px;color:#6a7a8a;letter-spacing:1px;margin-bottom:7px;">BANK BALANCE</div>' +
          '<div id="boneBankV" style="font-size:22px;color:#ffcf5c;text-shadow:0 0 10px rgba(255,207,92,0.5);">…</div>' +
          '<div style="font-size:9px;color:#6a7a8a;margin-top:5px;">safe from raiders</div></div>' +
        '<div style="flex:1;background:linear-gradient(180deg,#14182a,#0a0c18);border:2px solid #3a3a55;border-radius:6px;padding:14px 14px;text-align:center;">' +
          '<div style="font-size:10px;color:#6a7a8a;letter-spacing:1px;margin-bottom:7px;">SESSION</div>' +
          '<div style="font-size:22px;color:#6fcf5c;">🦴 <span id="boneSessV">0</span></div>' +
          '<div style="font-size:9px;color:#6a7a8a;margin-top:5px;">banked after battle</div></div></div>' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:#8a9aaa;letter-spacing:0.5px;margin-bottom:12px;">1 🦴 = <span id="boneRateV" style="color:#ffcf5c;">5</span> <img src="ronke.png" draggable="false" style="height:20px;image-rendering:pixelated;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));"> RONKE</div>' +
      // 📜 SWAP REQUIREMENTS — abi taisyklės vienoje aiškioje dėžutėje (limitas + NFT), ✓/✗ pildo _onBonesBank
      '<div style="background:linear-gradient(180deg,#14182a,#0a0c18);border:2px solid #3a3a55;border-radius:6px;padding:14px 16px;margin-bottom:4px;">' +
        '<div style="font-size:10px;color:#6a7a8a;letter-spacing:1px;margin-bottom:10px;">SWAP REQUIREMENTS</div>' +
        '<div style="height:12px;background:#0a0c18;border:1px solid #3a3a55;border-radius:6px;overflow:hidden;">' +
          '<div id="boneProgV" style="height:100%;width:0%;background:linear-gradient(90deg,#d49a2a,#ffcf5c);box-shadow:0 0 8px rgba(255,207,92,0.6);"></div></div>' +
        '<div id="boneProgTxt" style="font-size:11px;color:#8a9aaa;text-align:center;margin-top:7px;letter-spacing:0.5px;line-height:1.6;">— / 100 🦴 swap limit</div>' +
        '<div style="font-size:11px;text-align:center;color:#8a9aaa;margin-top:6px;line-height:1.6;">🎫 <span id="boneNftV">—</span></div></div>' +
      '<div id="boneSwapBtn" style="' + _boneBtnCss + 'background:#333;color:#777;border-color:#555;cursor:not-allowed;">…</div>' +
      '<div id="boneSwapStatus" style="font-size:11px;min-height:16px;line-height:1.7;color:#8a9aaa;"></div>';
    boneOverlayEl.appendChild(bonePanelEl);
    document.body.appendChild(boneOverlayEl);
    bonePanelEl.querySelector('#bonePanelX').addEventListener('click', function () { boneOverlayEl.style.display = 'none'; });
    bonePanelEl.querySelector('#boneSwapBtn').addEventListener('click', _boneSwapClick);
    return bonePanelEl;
  }
  function _toggleBonePanel() {
    _bonePanel();
    if (boneOverlayEl.style.display === 'none' || !boneOverlayEl.style.display) {
      boneOverlayEl.style.display = 'flex';
      // ⚠ be gyvo room ryšio bankas neužsikraus NIEKADA — sakom aiškiai (ne amžinas „loading bank…";
      //   nutrūksta pvz. po serverio restarto — pasaulis piešiasi lokaliai, bet serverio duomenų nebėra).
      var r = null; try { r = _room(); } catch (_) {}
      if (r) { _boneStatus('loading bank…'); try { r.send('bones_bank_get'); } catch (_) {} }
      else _boneStatus('⚠ not connected — reload page (F5)', '#ff6b6b');
    } else boneOverlayEl.style.display = 'none';
  }
  function _onBonesBank(e) {
    if (!e) return;
    _boneCfg = e.cfg || null;
    var bank = Number(e.bones) || 0;
    _boneBankVal = bank;   // 🦴 widget'o bendram balansui (bankas + sesija)
    var min = (_boneCfg && _boneCfg.minBones) || 100, rate = (_boneCfg && _boneCfg.ratePerBone) || 5;
    var bEl = document.getElementById('boneBankV'), sEl = document.getElementById('boneSessV');
    var rEl = document.getElementById('boneRateV'), mEl = document.getElementById('boneMinV'), pEl = document.getElementById('boneProgV');
    if (bEl) bEl.textContent = '🦴 ' + bank.toFixed(1);
    if (sEl) sEl.textContent = (Number(e.session) || 0).toFixed(1);
    if (rEl) rEl.textContent = String(rate);
    if (mEl) mEl.textContent = String(min);
    if (pEl) {
      var pc = Math.min(100, bank / min * 100);
      pEl.style.width = pc + '%';
      pEl.style.background = pc >= 100 ? 'linear-gradient(90deg,#4a9a3a,#6fcf5c)' : 'linear-gradient(90deg,#d49a2a,#ffcf5c)';
      pEl.style.boxShadow = '0 0 8px ' + (pc >= 100 ? 'rgba(111,207,92,0.6)' : 'rgba(255,207,92,0.6)');
    }
    // 🦴 SWAP LIMITO eilutė po progreso juosta: „X / min 🦴 swap limit ✓/✗" (taisyklė #1 — visada matoma)
    var ptEl = document.getElementById('boneProgTxt');
    if (ptEl) {
      var _lim = bank >= min;
      ptEl.textContent = bank.toFixed(1) + ' / ' + min + ' 🦴 swap limit ' + (_lim ? '✓' : '✗');
      ptEl.style.color = _lim ? '#6fcf5c' : '#8a9aaa';
    }
    // 🎫 NFT gate eilutė (taisyklė #2): ✓ turi / ✗ neturi / ? nepavyko patikrint / connect wallet —
    //    swap atsirakina TIK kai limitas pasiektas IR piniginėj yra Ronkeverse NFT (mainnet balansas).
    var nftReq = (_boneCfg && _boneCfg.nftRequired) || 0;
    var nEl = document.getElementById('boneNftV');
    if (nEl) {
      if (!nftReq) { nEl.textContent = 'no NFT gate'; nEl.style.color = '#8a9aaa'; }
      else if (e.noWallet) { nEl.textContent = nftReq + '× RONKEVERSE NFT — connect wallet'; nEl.style.color = '#8a9aaa'; }
      else if (e.hasNft === true) { nEl.textContent = nftReq + '× RONKEVERSE NFT ✓'; nEl.style.color = '#6fcf5c'; }
      else if (e.hasNft === false) { nEl.textContent = nftReq + '× RONKEVERSE NFT ✗ — own one to unlock swap'; nEl.style.color = '#ff6b6b'; }
      else { nEl.textContent = nftReq + '× RONKEVERSE NFT ? (check failed — contract will enforce)'; nEl.style.color = '#8a9aaa'; }
    }
    var btn = document.getElementById('boneSwapBtn');
    if (!btn) return;
    // trophy CTA būsenos: aktyvus = auksinis (kaip CLAIM), neaktyvus = pilkas
    var _btnOff = function (txt) { btn.textContent = txt; btn.dataset.mode = 'off'; btn.style.cssText = _boneBtnCss + 'background:#333;color:#777;border-color:#555;cursor:not-allowed;'; };
    var _btnOn = function (txt) { btn.textContent = txt; btn.dataset.mode = 'swap'; btn.style.cssText = _boneBtnCss + 'background:#ffcf5c;color:#1a1208;border-color:#ffcf5c;cursor:pointer;'; };
    if (e.noWallet) { _btnOff('CONNECT WALLET'); _boneStatus('wallet required to bank bones', '#ff6b6b'); }
    else if (e.pending) { _btnOn('RESUME SWAP (' + (e.pending.deciBones / 10).toFixed(1) + ' 🦴)'); _boneStatus('pending voucher — resume to finish TX', '#ffd24a'); }
    else if (!_boneCfg || !_boneCfg.enabled) { _btnOff('SWAP (soon)'); _boneStatus('swap contract not live yet', '#8a9aaa'); }
    else if (nftReq && e.hasNft === false) { _btnOff('NEED RONKEVERSE NFT'); _boneStatus('own ' + nftReq + ' Ronkeverse NFT to unlock swap', '#ff6b6b'); }
    else if (bank < min) { _btnOff('NEED ' + min + ' 🦴'); _boneStatus(''); }
    else {
      var deci = Math.floor(Math.min(bank, (_boneCfg.maxSwapBones || 1000)) * 10);
      _btnOn('SWAP ' + (deci / 10).toFixed(1) + ' 🦴 → ' + (deci / 10 * rate).toFixed(0) + ' RONKE');
      _boneStatus('');
    }
  }
  // ── ⚔ RAID/DEFENSE SETTLED — trofėjų stiliaus suvestinė po pilies puolimo/gynybos (07-04 user):
  //    sužaloti/mirę unitai gyvomis sprite kortelėmis + 🦴 uždirbta/prarasta. CLOSE → grįžtam namo.
  var _settleEl = null, _settleAnimT = null;
  function _closeRaidSettled(goHome, addr) {
    if (_settleAnimT) { clearInterval(_settleAnimT); _settleAnimT = null; }
    if (_settleSeqT) { clearInterval(_settleSeqT); _settleSeqT = null; }   // 🦴→🏦 seka
    if (_settleEl && _settleEl.parentNode) _settleEl.parentNode.removeChild(_settleEl);
    _settleEl = null;
    if (goHome) {
      try { relaunchHome(); } catch (_) { try { launchHome({ address: addr || '' }); } catch (_2) {} }
    }
  }
  // f = count-up frakcija 0..1 (07-05 seq): teigiami skaičiai auga nuo 0 iki pilnos sumos; stolen — iškart pilnas.
  function _settleBonesBits(f) {
    if (f == null) f = 1;
    var bits = [];
    var lb = window._f9LastBones || {};
    if (lb.bones > 0) bits.push('<span style="color:#6fcf5c">🦴 +' + (+lb.bones * f).toFixed(1) + ' earned</span>');
    var st = window._f9LastSteal;
    if (st && st.amount > 0) {
      if (st.mine) bits.push('<span style="color:#ffcf5c">🦴 +' + (+st.amount * f).toFixed(1) + ' looted</span>');
      else bits.push('<span style="color:#ff6b6b">🦴 −' + (+st.amount).toFixed(1) + ' stolen</span>');
    }
    return bits;
  }
  // 🦴→🏦 SEKA (07-05 user): atlygio skaičiukai SUSKAIČIUOJA (odometras ~1.1s) → kaulai IŠSKRENDA iš
  //   atlygio eilutės ir SULEKIA į banko chip'ą (panelės viršuje dešinėj) → chip'as pulsuoja ir
  //   suskaičiuoja balansą kaulams atvykstant. Gain = earned + looted (mano); stolen neskrenda.
  var _settleSeqT = null;
  function _startSettleBonesSeq() {
    if (!_settleEl) return;
    var lb = window._f9LastBones || {};
    var st = window._f9LastSteal;
    var gain = Math.max(0, +lb.bones || 0) + ((st && st.mine && st.amount > 0) ? +st.amount : 0);
    var line = _settleEl.querySelector('#f9rs-bones');
    var chip = _settleEl.querySelector('#f9rs-bank');
    var chipN = _settleEl.querySelector('#f9rs-bankn');
    if (!line || !chip || !chipN || gain <= 0.05) return;
    var bankTarget = Math.round(((_boneBankVal || 0)) * 10) / 10;
    var bankStart = Math.max(0, Math.round((bankTarget - gain) * 10) / 10);
    // jei bones_banked dar neatėjo (bankas senas) — taikinys = senas + gain (vėliau susilygins pats)
    if (bankTarget < bankStart + gain - 0.01) bankTarget = Math.round((bankStart + gain) * 10) / 10;
    chipN.textContent = bankStart.toFixed(1);
    // FAZĖ 1: atlygio count-up (0 → gain per ~1.1s, 26 tick'ų)
    var tick = 0, TICKS = 26;
    if (_settleSeqT) clearInterval(_settleSeqT);
    _settleSeqT = setInterval(function () {
      if (!_settleEl) { clearInterval(_settleSeqT); _settleSeqT = null; return; }
      tick++;
      var f = Math.min(1, tick / TICKS);
      line.innerHTML = _settleBonesBits(f).join('  ·  ');
      if (f >= 1) {
        clearInterval(_settleSeqT); _settleSeqT = null;
        // FAZĖ 2: kaulai skrenda iš atlygio eilutės → banko chip'ą; atvykę tiksi balansą + pulsuoja
        var lr = line.getBoundingClientRect(), cr = chip.getBoundingClientRect();
        var N = Math.max(4, Math.min(12, Math.round(gain)));
        var arrived = 0;
        _f9BonesFly(N, {
          fx: lr.left + lr.width / 2, fy: lr.top + lr.height / 2,
          tx: cr.left + cr.width / 2, ty: cr.top + cr.height / 2,
          onArrive: function () {
            arrived++;
            var v = (arrived >= N) ? bankTarget : Math.round((bankStart + gain * (arrived / N)) * 10) / 10;
            if (chipN) chipN.textContent = v.toFixed(1);
            if (chip) {
              chip.style.transform = 'scale(1.16)';
              chip.style.boxShadow = 'inset 0 0 0 2px #8dffa0, 0 2px 0 1px #0c0906';
              setTimeout(function () { if (chip) { chip.style.transform = 'scale(1)'; chip.style.boxShadow = 'inset 0 0 0 2px #6b4a2e, 0 2px 0 1px #0c0906'; } }, 130);
            }
          }
        });
      }
    }, 42);
  }
  function _updateSettleBones() {   // steal ateina async po match_end → atnaujinam eilutę gyvai
    if (!_settleEl) return;
    var el = _settleEl.querySelector('#f9rs-bones');
    if (el) { var b = _settleBonesBits(); el.innerHTML = b.length ? b.join('  ·  ') : ''; el.style.display = b.length ? '' : 'none'; }
  }
  // ⚔ vienos armijos stulpelis (sudėtis + likimų kortelės) — bendras MANO ir PRIEŠO pusėms.
  function _armyColHtml(title, titleCol, roster) {
    var units = (roster && roster.units) || [];
    var summ = (roster ? roster.survived : 0) + ' survived';
    if (roster && roster.injured) summ += ' · <span style="color:#e8a54a">🏥' + roster.injured + '</span>';
    if (roster && roster.dead) summ += ' · <span style="color:#ff6b6b">💀' + roster.dead + '</span>';
    // rikiuojam: žuvę → sužaloti → išgyvenę (nuostoliai viršuje, matomiausi)
    var order = { dead: 0, injured: 1, survived: 2 };
    var us = units.slice().sort(function (a, b) { return (order[a.fate] || 0) - (order[b.fate] || 0); });
    var cards = us.map(function (u) {
      var isDead = u.fate === 'dead', isInj = u.fate === 'injured';
      var badge = isDead ? '💀 LOST' : (isInj ? '🏥 HEALING' : '✓ OK');
      var col = isDead ? '#ff6b6b' : (isInj ? '#e8a54a' : '#6fcf5c');
      return '<div style="width:66px;text-align:center;' + (isDead ? 'filter:grayscale(1) brightness(0.72);' : '') + '">' +
        '<div style="font-size:7px;color:' + col + ';margin-bottom:3px;">' + badge + '</div>' +
        '<canvas data-sutype="' + (u.utype || '') + '" width="50" height="50" style="width:50px;height:50px;image-rendering:pixelated;background:linear-gradient(180deg,#14182a,#0a0c18);border:2px solid ' + (isDead ? '#3a3a55' : col) + ';border-radius:7px;"></canvas>' +
        '<div style="font-size:7px;color:#cfd8e8;margin-top:3px;">' + String(u.utype || '?').toUpperCase() + (u.level ? ' <span style="color:#8a9aaa">Lv' + u.level + '</span>' : '') + '</div>' +
      '</div>';
    }).join('');
    return '<div style="flex:1 1 0;min-width:0;display:flex;flex-direction:column;">' +
      '<div style="font-size:11px;color:' + titleCol + ';letter-spacing:1px;margin-bottom:3px;">' + title + '</div>' +
      '<div style="font-size:8px;color:#8a9aaa;margin-bottom:8px;">' + summ + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:7px;justify-content:center;align-content:flex-start;max-height:42vh;overflow:auto;padding:4px;">' +
        (cards || '<div style="color:#6a7a8a;font-size:8px;padding:16px 4px;">no units</div>') + '</div>' +
    '</div>';
  }
  // 📜 VIEŠA PvP ISTORIJA (07-14): rašo SERVERIS (F9PvpRoom._persistRaidReport → BaseStore.logMatch,
  //   f9_bases `match_<id>` eilutės) — server-authoritative, klientinis self-report publisher IŠIMTAS
  //   (f9_matches lentelė niekada neegzistavo; DDL negalimas — mgmt token miręs). Skaito raid_ui „📜 HISTORY".
  function _showRaidSettled(o) {
    _closeRaidSettled(false);
    // ⚔ 2-PUSĖ suvestinė — abiejų komandų sudėtis iš serverio (window._f9SettleRosters). Kiekvienas žaidėjas
    //   mato SAVO (myTeam) ir PRIEŠO pusę. Fallback (jei rosterių nėra) — tik mano nuostoliai iš _raidLog.
    var rosters = window._f9SettleRosters || null;
    var mineR = null, foeR = null;
    if (rosters) {
      mineR = rosters[String(myTeam)] || { units: [], survived: 0, injured: 0, dead: 0 };
      for (var _k in rosters) { if (rosters.hasOwnProperty(_k) && _k !== String(myTeam)) { foeR = rosters[_k]; break; } }
    }
    if (!mineR) {   // fallback iš _raidLog (senesnis serveris / rosteris nespėjo)
      var log = _raidLog || { injured: [], dead: [] };
      var surv = (window._f9SettleData && window._f9SettleData.survived) || 0;
      var mu = [];
      for (var _i = 0; _i < surv; _i++) mu.push({ utype: '', level: 0, tokenId: '', fate: 'survived' });
      log.injured.forEach(function (u) { mu.push({ utype: u.utype, level: u.level, tokenId: u.tokenId, fate: 'injured' }); });
      log.dead.forEach(function (u) { mu.push({ utype: u.utype, level: u.level, tokenId: u.tokenId, fate: 'dead' }); });
      mineR = { units: mu, survived: surv, injured: log.injured.length, dead: log.dead.length };
    }
    var bits = [];
    bits.push(o.win ? '<span style="color:#6fcf5c">VICTORY</span>' : '<span style="color:#ff6b6b">DEFEAT</span>');
    var twoCol = !!foeR;
    var colsHtml = twoCol
      ? '<div style="display:flex;gap:14px;align-items:stretch;">' +
          _armyColHtml('⚔ YOUR ARMY', o.win ? '#6fcf5c' : '#8cd0ff', mineR) +
          '<div style="width:2px;background:linear-gradient(180deg,transparent,rgba(255,207,92,.35),transparent);flex:0 0 2px;"></div>' +
          _armyColHtml('🛡 ENEMY ARMY', '#ff9a98', foeR) +
        '</div>'
      : _armyColHtml('⚔ YOUR ARMY', o.win ? '#6fcf5c' : '#8cd0ff', mineR);
    // 🔎 ATSEKAMUMAS (07-14 user): Match ID + priešo piniginė — kad kiekvieną kovą būtų galima
    //   atsekti/išanalizuoti kilus problemai. matchId iš match_result; priešo adr: puolikas→__f9RaidTarget,
    //   gynėjas→_f9LastAttacker (iš under_attack). Viskas kliento pusėje — serverio keisti nereikia.
    var _esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
    var _mid = window._f9SettleMatchId;
    var _foe = o.raid ? (window.__f9RaidTarget || '') : (window._f9LastAttacker || '');
    var _foeLabel = o.raid ? '🛡 DEFENDER' : '⚔ RAIDER';
    var _shortFoe = _foe ? (String(_foe).slice(0, 6) + '…' + String(_foe).slice(-4)) : '';
    var _sm = window._f9SettleMeta || {};
    var _metaRows = [];
    if (_mid != null && _mid !== '') _metaRows.push('<span>MATCH <b style="color:#ffcf5c">#' + _esc(_mid) + '</b> <span class="f9rs-copy" data-copy="' + _esc(_mid) + '" title="Copy Match ID" style="cursor:pointer;color:#8cd0ff;padding:0 2px;">⧉</span></span>');
    if (_shortFoe) _metaRows.push('<span>' + _foeLabel + ' <b style="color:#ff9a98" title="' + _esc(_foe) + '">' + _esc(_shortFoe) + '</b> <span class="f9rs-copy" data-copy="' + _esc(_foe) + '" title="Copy wallet" style="cursor:pointer;color:#8cd0ff;padding:0 2px;">⧉</span></span>');
    if (_sm.durationMs) _metaRows.push('<span style="color:#7d8fa2;">' + (_sm.durationMs / 1000).toFixed(1) + 's' + (_sm.reason ? ' · ' + _esc(_sm.reason) : '') + '</span>');
    var metaHtml = _metaRows.length ? '<div style="font-size:8px;margin-bottom:12px;display:flex;gap:14px;flex-wrap:wrap;justify-content:center;align-items:center;line-height:1.8;color:#9bb;">' + _metaRows.join('') + '</div>' : '';
    var bonesBits = _settleBonesBits();
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,22,0.94);z-index:100001;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
    el.innerHTML = '<div style="position:relative;background:linear-gradient(180deg,#1f2940 0%,#0c1020 100%);border:3px solid #ffcf5c;box-shadow:0 0 48px rgba(255,207,92,0.35),inset 0 0 24px rgba(255,207,92,0.08);border-radius:8px;padding:22px 26px;width:' + (twoCol ? 720 : 560) + 'px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;font-family:\'Press Start 2P\',monospace,sans-serif;font-size:10px;line-height:1.6;color:#8a9aaa;text-align:center;">' +
      // 🏦 BANKO CHIP'as (pixel stilius kaip viršaus widget'as) — į jį sulekia atlygio kaulai
      '<div id="f9rs-bank" style="position:absolute;top:10px;right:12px;display:flex;align-items:center;gap:6px;padding:7px 9px 6px;font-size:9px;background:#3a2614;color:#8dffa0;border:2px solid #1a1208;box-shadow:inset 0 0 0 2px #6b4a2e,0 2px 0 1px #0c0906;transition:transform .13s ease-out,box-shadow .13s ease;" title="Bone bank balance">' +
        '<span style="font-size:12px;filter:drop-shadow(1px 1px 0 #0c0906)">🦴</span><span id="f9rs-bankn">' + ((_boneBankVal || 0)).toFixed(1) + '</span>' +
      '</div>' +
      '<div style="font-size:15px;color:#ffcf5c;letter-spacing:2px;margin-bottom:8px;text-shadow:0 0 14px rgba(255,207,92,0.5);">' + (o.raid ? '⚔ RAID SETTLED' : '🏰 DEFENSE SETTLED') + '</div>' +
      '<div style="font-size:11px;margin-bottom:6px;">' + bits.join('  ·  ') + '</div>' +
      metaHtml +
      '<div id="f9rs-bones" style="font-size:9px;margin-bottom:12px;' + (bonesBits.length ? '' : 'display:none;') + '">' + _settleBonesBits(0).join('  ·  ') + '</div>' +
      colsHtml +
      '<div style="margin-top:16px;"><button id="f9rs-close" style="font-family:inherit;font-size:11px;letter-spacing:1px;padding:11px 26px;border-radius:4px;border:2px solid #ffcf5c;background:rgba(255,207,92,0.12);color:#ffcf5c;cursor:pointer;">🏰 RETURN HOME</button></div>' +
    '</div>';
    document.body.appendChild(el);
    _settleEl = el;
    setTimeout(_startSettleBonesSeq, 300);   // 🦴→🏦 atlygio count-up → skridimas į banko chip'ą
    var cb = el.querySelector('#f9rs-close');
    if (cb) cb.onclick = function () { _closeRaidSettled(true, o.addr); };
    // 🔎 copy-to-clipboard — Match ID / priešo wallet (atsekamumui kilus ginčui)
    Array.prototype.forEach.call(el.querySelectorAll('.f9rs-copy'), function (cp) {
      cp.onclick = function (ev) {
        try { ev.stopPropagation(); } catch (_) {}
        var v = cp.getAttribute('data-copy') || '';
        try { if (navigator.clipboard) navigator.clipboard.writeText(v); } catch (_) {}
        var old = cp.textContent; cp.textContent = '✓'; cp.style.color = '#6fcf5c';
        setTimeout(function () { cp.textContent = old; cp.style.color = '#8cd0ff'; }, 1200);
      };
    });
    // gyvos sprite idle animacijos (kaip hospital panelėj) — tikri žaidimo kadrai per _f9UnitFrameForOutline
    function drawSprites() {
      if (!_settleEl || typeof window._f9UnitFrameForOutline !== 'function') return;
      var cvs = _settleEl.querySelectorAll('canvas[data-sutype]');
      for (var i = 0; i < cvs.length; i++) {
        try {
          var cv = cvs[i];
          var fr = window._f9UnitFrameForOutline({ utype: cv.getAttribute('data-sutype'), facing: { dx: 1 }, _f9Moving: false, swingStart: 0, guardStart: 0, x: 0, y: 0, rx: 0, ry: 0 });
          if (!fr || !fr.img || !fr.img.complete || !fr.img.naturalWidth) continue;
          var c2 = cv.getContext('2d');
          c2.imageSmoothingEnabled = false;
          c2.clearRect(0, 0, cv.width, cv.height);
          c2.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, 0, 0, cv.width, cv.height);
        } catch (_) {}
      }
    }
    drawSprites();
    _settleAnimT = setInterval(drawSprites, 140);
  }

  function _boneSwapClick() {
    var btn = document.getElementById('boneSwapBtn');
    if (!btn || btn.dataset.mode !== 'swap' || _boneSwapBusy) return;
    _boneSwapBusy = true;
    _boneStatus('requesting voucher…', '#ffd24a');
    try { var r = _room(); if (r) r.send('bones_swap'); else _boneSwapBusy = false; } catch (_) { _boneSwapBusy = false; }
    setTimeout(function () { _boneSwapBusy = false; }, 15000);   // guard jei atsakymas pradingo
  }
  function _onBonesVoucher(v) {
    if (!v) { _boneSwapBusy = false; return; }
    var W = window.Wallet;
    // ⚡ RONKEREWARD režimas (07-12): kaulai→RONKE per faucet pool (mainnet). Voucher su ronkeReward=true →
    //   submit'inam per submitFaucetClaim (claimReward), NE per submitBoneSwap (Saigon BoneExchange).
    var isRR = !!v.ronkeReward;
    var submit = isRR ? (W && W.submitFaucetClaim) : (W && W.submitBoneSwap);
    if (!W || !submit) { _boneSwapBusy = false; _boneStatus('❌ wallet module outdated', '#ff6b6b'); return; }
    _boneStatus('confirm TX in wallet (you pay gas)…', '#ffd24a');
    submit.call(W, v).then(function (res) {
      _boneSwapBusy = false;
      var ronke = (v.deciBones / 10) * ((_boneCfg && _boneCfg.ratePerBone) || 5);
      _boneStatus('✅ +' + ronke.toFixed(0) + ' RONKE! tx ' + String(res.txHash).slice(0, 12) + '…', '#6fcf5c');
      try { if (window.showGameNotification) window.showGameNotification('🦴→RONKE SWAP', '+' + ronke.toFixed(0) + ' RONKE! (' + (v.deciBones / 10).toFixed(1) + ' bones)', '#8dffa0'); } catch (_) {}
      try { var r = _room(); if (r) r.send('bones_swap_done', { txHash: res.txHash }); } catch (_) {}
    }).catch(function (err) {
      _boneSwapBusy = false;
      _boneStatus('❌ ' + String((err && err.message) || err).slice(0, 70), '#ff6b6b');
    });
  }

  function _status(t, c) { _ui(); statusEl.textContent = 'F9 PvP · ' + t; statusEl.style.color = c || '#6e8'; }
  function _hud(t) { _ui(); hudEl.textContent = t; }
  // 🏰 capture HUD — atnaujinam tik kai keičiasi (cache, kad nemirgėtų / nešvaistytų layout).
  function _updateCapHud(owner, pct, team, contested, count) {
    _ui(); if (!capEl) return;
    if (_hudHidden) { capEl.style.display = 'none'; return; }   // 🚫 kolkas capture indikatorius nerodomas
    if (!window._f9Cap) { capEl.style.display = 'none'; return; }
    capEl.style.display = '';
    var spd = Math.min(count || 0, 5);
    var key = owner + '|' + pct + '|' + team + '|' + (contested ? 1 : 0) + '|' + spd;
    if (key === _capLast) return; _capLast = key;
    var ownTxt = owner < 0 ? 'NEUTRAL' : (owner === myTeam ? 'YOURS' : 'ENEMY');
    var ownCol = owner < 0 ? '#bcc' : (owner === myTeam ? '#5cf' : '#f66');
    var capCol = contested ? '#ffd24a' : (team < 0 ? '#888' : (team === myTeam ? '#5cf' : '#f66'));
    var lbl = contested ? 'CONTESTED' : (team < 0 ? '' : (team === myTeam ? 'CAPTURING' : 'ENEMY CAPTURING'));
    var spdTxt = (!contested && team >= 0 && spd > 1) ? ' <span style="color:#ffd24a;font-weight:700">×' + spd + '</span>' : '';
    var glow = (!contested && team >= 0) ? 'box-shadow:0 0 8px rgba(' + (team === myTeam ? '90,200,255' : '240,90,90') + ',.5);' : '';
    capEl.innerHTML =
      '<span style="color:' + ownCol + ';font-weight:700">🏰 ' + ownTxt + '</span>' +
      '<span style="display:inline-block;width:130px;height:9px;background:#1a2230;border-radius:5px;margin:0 8px;vertical-align:middle;overflow:hidden;' + glow + '">' +
        '<span style="display:block;height:100%;width:' + pct + '%;background:' + capCol + ';transition:width .15s linear;"></span>' +
      '</span>' +
      '<span style="color:' + capCol + ';font-size:10px">' + (lbl ? lbl + ' ' + pct + '%' : '') + spdTxt + '</span>';
  }
  // serverio capture būsenos sinchr. → window._f9CapState (game.js žiedui) + HUD baras
  function _syncCapture() {
    var room = _room(); if (!room || !room.state) return;
    var st = room.state;
    var owner = (typeof st.capOwner === 'number') ? st.capOwner : -1;
    var pct = (typeof st.capPct === 'number') ? st.capPct : 0;
    var team = (typeof st.capTeam === 'number') ? st.capTeam : -1;
    var contested = !!st.capContested;
    var count = (typeof st.capCount === 'number') ? st.capCount : 0;
    // ⚡ perf 07-06: persistentas objektas (buvo naujas literalas kas kadrą)
    var _cs = window._f9CapState || (window._f9CapState = {});
    _cs.owner = owner; _cs.pct = pct; _cs.team = team; _cs.contested = contested; _cs.count = count; _cs.myTeam = myTeam;
    _updateCapHud(owner, pct, team, contested, count);
  }

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

  // ── 🏰 PILIES UŽKROVIMO EKRANAS (07-04 user: „tik loading progresinis indikatorius ir viskas") ──
  //   Paprastas progreso baras. Etapus (piniginė→dekas→unitai→serveris→pilis) žymi launchHome/_loadHomeDeck —
  //   kiekvienas užbaigtas etapas pastumia barą; aktyvus etapas duoda dalinį kreditą (baras visada juda pirmyn).
  var _CL_ORDER = ['wallet', 'deck', 'units', 'server', 'castle'];
  var _clDone = {};
  function _castleKf() {
    if (document.getElementById('f9cl-kf')) return;
    var st = document.createElement('style'); st.id = 'f9cl-kf';
    st.textContent = '@keyframes f9clshine{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}';
    document.head.appendChild(st);
  }
  function _clPct() { var n = 0; for (var k in _clDone) if (_clDone[k]) n++; return n / _CL_ORDER.length; }
  function _clBar(frac) {
    var bar = document.getElementById('f9cl-bar'); if (!bar) return;
    var cur = parseFloat(bar.style.width) || 0, next = Math.round(frac * 100);
    if (next > cur) bar.style.width = next + '%';   // tik pirmyn (monotoniškai)
  }
  function _castleLoadScreen() {
    _clearScreen(); _castleKf(); _clDone = {};
    screenEl = document.createElement('div');
    screenEl.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#141b2a,#080a10 75%);color:#cde;font-family:monospace;gap:16px;';
    screenEl.innerHTML =
      '<div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#fc8;opacity:.9;">LOADING YOUR CASTLE</div>' +
      '<div style="position:relative;width:300px;height:9px;background:#121927;border-radius:6px;overflow:hidden;box-shadow:inset 0 1px 3px rgba(0,0,0,.7);">' +
        '<div id="f9cl-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#b9851f,#ffcf5c);border-radius:6px;transition:width .5s cubic-bezier(.34,.1,.2,1);box-shadow:0 0 10px rgba(255,207,92,.6);"></div>' +
        '<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);width:40%;animation:f9clshine 1.3s linear infinite;"></div>' +
      '</div>';
    document.body.appendChild(screenEl);
    _clBar(0.05);   // startas ne visiškai tuščias (rodo, kad prasidėjo)
  }
  // state: 'active' | 'done'. „done" užbaigia IR ankstesnius praleistus (guest be deko ir pan.).
  function _castleStep(key, state, detail) {
    var idx = _CL_ORDER.indexOf(key); if (idx < 0) return;
    if (state === 'done') {
      for (var j = 0; j <= idx; j++) _clDone[_CL_ORDER[j]] = 1;
      _clBar(_clPct());
    } else {   // active — dalinis kreditas iki kito etapo (baras juda net kai etapas užtrunka)
      var n = 0; for (var k in _clDone) if (_clDone[k]) n++;
      _clBar((n + 0.45) / _CL_ORDER.length);
    }
  }
  function _castleSub() {}   // no-op (paprastas baras — be paaiškinimų)
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

  // ── LOBBY (room browser) — žaidėjai mato atvirus matchus ir PATYS pasirenka create/join ──
  var _lobbyRoom = null, _lobbyRooms = {}, _lobbyName = '';
  function _truncName(nm) {
    nm = String(nm || '');
    if (/^0x[0-9a-fA-F]{6,}$/.test(nm)) return nm.slice(0, 6) + '…' + nm.slice(-4);
    return nm.length > 16 ? nm.slice(0, 16) : nm;
  }
  function _lobbyEl(id) { return document.getElementById(id); }
  function _lobbyInfo(msg, col) { var i = _lobbyEl('f9lob-info'); if (i) { i.textContent = msg; i.style.color = col || '#9fe'; } }

  function _lobbyBrowserScreen() {
    _clearScreen(); _spinKf();
    screenEl = document.createElement('div');
    screenEl.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;background:rgba(8,10,16,.95);color:#cde;font-family:monospace;gap:10px;padding:26px 16px;box-sizing:border-box;overflow:auto;';
    screenEl.innerHTML =
      '<div style="font-size:22px;font-weight:800;letter-spacing:1px;color:#fc8;">⚔️ PvP · LOBBY</div>' +
      '<div style="font-size:13px;color:#8ab;">🟢 Lenta PvP Server</div>' +
      '<div id="f9lob-info" style="font-size:13px;font-weight:700;color:#9fe;margin:2px 0 6px;text-align:center;">Connecting…</div>' +
      '<div id="f9lob-list" style="display:flex;flex-direction:column;gap:7px;width:min(360px,92vw);"></div>' +
      '<button id="f9lob-create" style="margin-top:12px;width:min(360px,92vw);font-family:monospace;font-size:15px;font-weight:800;padding:13px;border-radius:10px;background:linear-gradient(180deg,#2f6f3a,#1e4a27);color:#dfe;border:2px solid #6e8;cursor:pointer;">+ CREATE MATCH</button>' +
      '<button id="f9lob-back" style="margin-top:4px;font-family:monospace;font-size:13px;padding:8px 18px;border-radius:8px;background:#1c2230;color:#9ab;border:1px solid #2a3240;cursor:pointer;">← Back to menu</button>';
    document.body.appendChild(screenEl);
    var cb = _lobbyEl('f9lob-create'); if (cb) cb.onclick = _lobbyDoCreate;
    var bb = _lobbyEl('f9lob-back'); if (bb) bb.onclick = function () { try { if (_lobbyRoom) _lobbyRoom.leave(); } catch (_) {} _backToMenu(); };
  }

  function _lobbyRenderList() {
    var list = _lobbyEl('f9lob-list'); if (!list) return;
    var open = [];
    for (var id in _lobbyRooms) {
      var r = _lobbyRooms[id];
      if (r && r.name === 'f9_pvp_room' && !r.locked && (r.clients || 0) < (r.maxClients || 2)) open.push(r);
    }
    _lobbyInfo(open.length ? (open.length + ' open match' + (open.length > 1 ? 'es' : '') + ' — join one, or create yours') : 'No open matches — create one and wait for an opponent', '#9fe');
    list.innerHTML = '';
    open.forEach(function (r) {
      var host = (r.metadata && r.metadata.host) || 'Player';
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:9px;background:rgba(255,255,255,.06);border:1px solid #2a3240;';
      var label = document.createElement('span');
      label.style.cssText = 'font-size:14px;color:#cde;';
      label.textContent = '⚔ ' + host + '   ' + (r.clients || 1) + '/' + (r.maxClients || 2);
      var btn = document.createElement('button');
      btn.textContent = 'JOIN';
      btn.style.cssText = 'font-family:monospace;font-size:13px;font-weight:800;padding:7px 16px;border-radius:7px;background:linear-gradient(180deg,#7a2230,#561621);color:#fdd;border:2px solid #e85d5d;cursor:pointer;';
      btn.onclick = function () { _lobbyDoJoin(r.roomId); };
      row.appendChild(label); row.appendChild(btn);
      list.appendChild(row);
    });
  }

  // Invite link helpers — draugas atidaręs ?match=ROOMID#f9live pakliūna TIESIAI į šį kambarį.
  function _getMatchParam() { try { return new URLSearchParams(location.search).get('match'); } catch (_) { return null; } }
  function _buildInviteLink(roomId) {
    var base = location.origin + location.pathname;
    var qs = 'match=' + encodeURIComponent(roomId);
    try { var ep = new URLSearchParams(location.search).get('ep'); if (ep) qs += '&ep=' + encodeURIComponent(ep); } catch (_) {}
    return base + '?' + qs + '#f9live';
  }
  function _copyInvite() {
    var inp = _lobbyEl('f9inv-link'); if (!inp) return;
    var done = function () { var m = _lobbyEl('f9inv-msg'); if (m) { m.textContent = '✅ Copied! Send it to a friend.'; } };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(inp.value).then(done, function () { inp.select(); try { document.execCommand('copy'); } catch (_) {} done(); }); }
      else { inp.select(); try { document.execCommand('copy'); } catch (_) {} done(); }
    } catch (_) { inp.select(); }
  }
  function _lobbyShowInvite(roomId) {
    var inp = _lobbyEl('f9inv-link'); if (inp) inp.value = _buildInviteLink(roomId);
    var m = _lobbyEl('f9inv-msg'); if (m) m.textContent = '';
  }
  function _lobbyWaitMine() {
    _clearScreen(); _spinKf();
    screenEl = document.createElement('div');
    screenEl.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(8,10,16,.95);color:#cde;font-family:monospace;gap:14px;padding:20px;box-sizing:border-box;text-align:center;';
    screenEl.innerHTML =
      '<div style="font-size:22px;font-weight:800;letter-spacing:1px;color:#6e8;">⚔️ YOUR MATCH IS OPEN</div>' +
      '<div style="font-size:14px;color:#9fe;">Waiting for an opponent to join…</div>' +
      '<div style="width:min(380px,92vw);background:rgba(255,255,255,.05);border:1px solid #2a3240;border-radius:10px;padding:12px;">' +
        '<div style="font-size:12px;color:#cbb892;margin-bottom:7px;">🔗 Invite a friend — send them this link:</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<input id="f9inv-link" readonly value="preparing link…" style="flex:1;min-width:0;font-family:monospace;font-size:12px;padding:8px;border-radius:7px;background:#10141c;color:#bcd;border:1px solid #2a3240;" />' +
          '<button id="f9inv-copy" style="font-family:monospace;font-size:12px;font-weight:800;padding:8px 14px;border-radius:7px;background:linear-gradient(180deg,#2f6f3a,#1e4a27);color:#dfe;border:2px solid #6e8;cursor:pointer;">Copy</button>' +
        '</div>' +
        '<div id="f9inv-msg" style="font-size:11px;color:#6e8;height:14px;margin-top:5px;"></div>' +
      '</div>' +
      '<div style="width:30px;height:30px;border:3px solid #2a3240;border-top-color:#6e8;border-radius:50%;animation:f9sp .9s linear infinite;"></div>' +
      '<button id="f9lob-cancel" style="font-family:monospace;font-size:13px;padding:9px 22px;border-radius:8px;background:#2a1c1c;color:#fbb;border:1px solid #a44;cursor:pointer;">✕ Cancel</button>';
    document.body.appendChild(screenEl);
    var cp = _lobbyEl('f9inv-copy'); if (cp) cp.onclick = _copyInvite;
    var inp = _lobbyEl('f9inv-link'); if (inp) inp.onclick = function () { inp.select(); };
    var cc = _lobbyEl('f9lob-cancel'); if (cc) cc.onclick = function () { _backToMenu(); };
  }

  function _lobbyDoCreate() {
    var N = window.F9PVP;
    try { if (_lobbyRoom) _lobbyRoom.leave(); } catch (_) {}
    _lobbyWaitMine();
    N.createMatch({ name: _lobbyName, deck: _pvpTestDeck() }).then(function (room) {
      if (!room) { _lobbyBrowserScreen(); _lobbyInfo('⚠ Could not create match — retry', '#f88'); return; }
      mySid = room.sessionId;
      _lobbyShowInvite(room.id);   // parodom invite linką su šio kambario id (client Room → .id)
      _wireRoom(room);   // opponent joins → enough_joined → ready → match_start (esamas srautas)
    });
  }
  function _lobbyDoJoin(roomId) {
    var N = window.F9PVP;
    try { if (_lobbyRoom) _lobbyRoom.leave(); } catch (_) {}
    _connectingScreen('Joining match…');
    N.joinMatchById(roomId, { name: _lobbyName, deck: _pvpTestDeck() }).then(function (room) {
      if (!room) { _lobbyBrowserScreen(); _lobbyInfo('⚠ Match is full or gone — pick another', '#f88'); return; }
      mySid = room.sessionId;
      _wireRoom(room);
    });
  }

  // ── launch (server-authoritative: LOBBY room browser → create/join → match) ──
  function launch(opts) {
    opts = opts || {};
    B = window.__F9;
    if (!B) { console.error('[F9Live] __F9 bridge missing'); return; }
    if (!window.F9PVP) { console.error('[F9Live] F9PVP missing'); return; }
    on = true; started = false; simInited = false; _ended = false; _mir = {};
    window.__f9HomeActive = false;   // regular PvP (NE home) — kad wallet connect NEperkrautų home
    _lobbyName = opts.address || rndAddr();
    _lobbyRooms = {};
    var N = window.F9PVP;
    // INVITE LINK: ?match=ROOMID → jungiamės TIESIAI į tą kambarį (apeinam lobby naršyklę).
    var _inviteId = _getMatchParam();
    if (_inviteId) {
      _status('joining invite…', '#fc8');
      _connectingScreen('Joining match via invite…');
      var _toLobby = function (msg) {
        if (msg) _connectingText(msg);
        try { var u = new URL(location.href); u.searchParams.delete('match'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } catch (_) {}
        setTimeout(function () { launch({ address: _lobbyName, endpoint: opts.endpoint }); }, 1500);
      };
      N.connect(opts.endpoint).then(function (ok) {
        if (!ok) return 'CONNFAIL';
        return N.joinMatchById(_inviteId, { name: _lobbyName, deck: _pvpTestDeck() });
      }).then(function (room) {
        if (room === 'CONNFAIL') { _status('connect failed', '#f88'); _connectingText('⚠ Connect failed — server offline?'); return; }
        if (!room) { _toLobby('⚠ Match not found or full — opening lobby…'); return; }
        mySid = room.sessionId;
        _wireRoom(room);
        _status('joined — starting…', '#fc8');
      });
      return;
    }
    _status('connecting…', '#fc8');
    _lobbyBrowserScreen();
    N.connect(opts.endpoint).then(function (ok) {
      if (!ok) { _status('connect failed', '#f88'); _lobbyInfo('⚠ Connect failed — server offline?', '#f88'); return null; }
      return N.joinLobby();
    }).then(function (lobby) {
      if (!lobby) { _status('lobby failed', '#f88'); _lobbyInfo('⚠ Could not join lobby', '#f88'); return; }
      _lobbyRoom = lobby;
      _status('in lobby…', '#fc8');
      lobby.onMessage('rooms', function (rooms) {
        _lobbyRooms = {};
        (rooms || []).forEach(function (r) { if (r && r.roomId) _lobbyRooms[r.roomId] = r; });
        _lobbyRenderList();
      });
      lobby.onMessage('+', function (payload) {
        try { var id = payload[0], r = payload[1]; if (id) { _lobbyRooms[id] = r; _lobbyRenderList(); } } catch (_) {}
      });
      lobby.onMessage('-', function (roomId) { delete _lobbyRooms[roomId]; _lobbyRenderList(); });
      _lobbyRenderList();
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
      try { if (_mir[e.fromId]) _mir[e.fromId]._f9LastAtkAt = performance.now(); } catch (_) {}   // ⚔️ emoji — TIKRA serverio ataka
      var fire = Math.max(0, +e.fireMs || 0);
      setTimeout(function () { try { _spawnProjectile(_mir[e.fromId], _mir[e.toId], e.utype); } catch (_) {} }, fire);
    });
    room.onMessage('melee', function (e) {   // melee: swing animacija (žala server-side po fireMs)
      if (!e) return;
      try { _attackAnim(_mir[e.id]); } catch (_) {}
      try { if (_mir[e.id]) _mir[e.id]._f9LastAtkAt = performance.now(); } catch (_) {}   // ⚔️ emoji — TIKRA serverio ataka
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
    // 🏰 WALL siege FX — siena = pasyvus taikinys (negrąžina žalos). Puolantis unitas suka/meta į sieną,
    // impactas (hp drop) ateina iš state sync (_syncWalls → balta flash). Čia: atakuotojo animacija + projektilas.
    var _WALL_RANGED = { archer: 1, harpoon_fish: 1, ronhood: 1, ghost: 1, shaman: 1 };
    room.onMessage('wall_hit', function (e) {
      if (!e) return;
      var atk = _mir[e.by]; if (!atk) return;
      // atsukam atakuotoją į sieną + paleidžiam swing/throw animaciją (kaip prieš unitą)
      var ax = (atk.rx !== undefined) ? atk.rx : atk.x, ay = (atk.ry !== undefined) ? atk.ry : atk.y;
      var wcx = (+e.x) + 0.5, wcy = (+e.y) + 0.5;   // VERTIKALI siena → cell centras (NE +0.9 horizontalaus likutis)
      atk.facing = { dx: (wcx - ax) >= 0 ? 1 : -1, dy: 0 };
      try { _attackAnim(atk); } catch (_) {}
      var fire = Math.max(0, +e.fireMs || 0);
      // 💥 JUICE per IMPACTĄ — RANGED: kai kulka pasiekia sieną (fireMs + durMs skrydis); melee: fireMs.
      // (durMs iš serverio; sutampa su žalos taikymu fireMs+travel → skeveldros nebešoka prieš kulką.)
      var dirDx = (ax - wcx) >= 0 ? 1 : -1;
      var mineHit = (atk._pvpOwner === mySid);
      var impactMs = fire + Math.max(0, +e.durMs || 0);
      setTimeout(function () {
        try { if (B.spawnWallFx) B.spawnWallFx(+e.x, +e.y, 'hit', dirDx); } catch (_) {}
        if (mineHit) _camShake(2.4, 110);
      }, impactMs);
      // ranged → projektilas į sieną; pigronke → spear-sweep; melee (skull) → tik swing
      if (_WALL_RANGED[e.utype]) {
        // CELL koordinatė (NE wcx=+0.5) — spawnF9RangedShot/Shaman PATYS prideda +0.5 → strėlė į sienos VIDURĮ
        var wallTgt = { x: (+e.x), y: (+e.y), alive: true };
        setTimeout(function () { try { _spawnProjectile(atk, wallTgt, e.utype); } catch (_) {} }, fire);
      } else if (e.utype === 'pigronke' && B.spawnSpearSweep) {
        setTimeout(function () {
          if (!atk || !atk.alive) return;
          var fdx = (atk.facing && atk.facing.dx) ? atk.facing.dx : 1;
          try { B.spawnSpearSweep((atk.rx !== undefined ? atk.rx : atk.x), (atk.ry !== undefined ? atk.ry : atk.y), fdx, 1.20, 0.65); } catch (_) {}
        }, fire);
      }
    });
    room.onMessage('wall_down', function (e) {
      if (!e) return;
      var key = (+e.x) + ',' + (+e.y), w = _wallMir[key];
      if (w && w.alive) { w.alive = false; if (!w.deathAt) w.deathAt = pnow(); try { if (B.f9WallSound) B.f9WallSound('collapse'); } catch (_) {} }
      // 💥 GRIŪTIS: dulkių debesis + didelės skeveldros + stipresnis (bet trumpas) shake
      try { if (B.spawnWallFx) B.spawnWallFx(+e.x, +e.y, 'collapse', 0); } catch (_) {}
      _camShake(4.8, 260);
    });
    // 🌀 TELEPORTAS — unitas persikėlė per sieną. SNAP (ne lerp) → instant, + ŠVARUS poof FX abiejose
    //    vietose (violetiniai pixeliai, JOKIO kraujo / mirties animacijos / garso).
    room.onMessage('teleport', function (e) {
      if (!e) return;
      var m = _mir[e.id];
      var ox = m ? (m.rx !== undefined ? m.rx : m.x) : null, oy = m ? (m.ry !== undefined ? m.ry : m.y) : null;
      if (m) { m.x = +e.x; m.y = +e.y; m.rx = +e.x; m.ry = +e.y; m.tx = +e.x; m.ty = +e.y; }
      try { if (B.spawnF9Teleport) { B.spawnF9Teleport(+e.x, +e.y); if (ox != null) B.spawnF9Teleport(ox, oy); } } catch (_) {}
    });
    // 🌀 TP IŠJUNGTAS — vidurio siena išgriauta (atviras perėjimas) → paslepiam teleporto pad'us (unitai eina laisvai).
    room.onMessage('tp_off', function () {
      window._f9TpPads = []; window._f9TpDisabled = true;
    });
    // 🏗️ SIENA UPGRADE'INTA — feedback (siena auto-atsinaujins per state sync: level/hp).
    room.onMessage('wall_upgraded', function (e) {
      var lvl = e ? e.level : 0;
      if (e && e.max) { _status('🏰 Wall already MAX (Lv' + lvl + ')', '#fc8'); return; }
      _status('🏗️ Wall upgraded → Lv' + lvl, '#ffcf5c');
      try { if (window.showGameNotification) window.showGameNotification('CASTLE', 'Wall upgraded to Level ' + lvl, '#ffcf5c'); } catch (_) {}
      try { if (B.f9WallSound) B.f9WallSound('hit'); } catch (_) {}
    });
    // 🏥 LIGONINĖ UPGRADE'INTA — feedback (kaina jau nurašyta per bones_spent).
    room.onMessage('hospital_upgraded', function (e) {
      var lvl = e ? e.level : 0;
      if (e && e.max) { _status('🏥 Hospital already MAX (L' + lvl + ')', '#fc8'); return; }
      window._f9HospLvl = lvl;
      if (e && e.slots) window._f9HospSlots = e.slots;
      if (e && e.healMs) window._f9HospHealMs = e.healMs;
      var msg = 'Hospital upgraded to L' + lvl + (e && e.slots ? ' — ' + e.slots + ' slot' + (e.slots > 1 ? 's' : '') : '') + (e && e.healMs ? ', ' + Math.round(e.healMs / 60000) + 'min/unit' : '');
      _status('🏥 ' + msg, '#ffcf5c');
      try { if (window.showGameNotification) window.showGameNotification('🏥 HOSPITAL', msg, '#ffcf5c'); } catch (_) {}
    });
    // 🛡 SKYDO BŪSENA (savininkui) — pilies panelė rodo „shielded" + REMOVE mygtuką.
    room.onMessage('shield', function (e) {
      window.__f9ShieldUntil = (e && Number(e.until)) || 0;
      if (window.__f9ShieldUntil === 0) {
        _status('🛡 Shield removed — castle is raidable', '#fc8');
        try { if (window.showGameNotification) window.showGameNotification('🛡 SHIELD REMOVED', 'Your castle can be raided again.', '#e8a54a'); } catch (_) {}
      }
    });
    // 🗼 BOKŠTAI UPGRADE'INTI — feedback.
    room.onMessage('towers_upgraded', function (e) {
      var lvl = e ? e.level : 0;
      if (e && e.max) { _status('🗼 Towers already MAX (Lv' + lvl + ')', '#fc8'); return; }
      _status('🗼 Towers upgraded → Lv' + lvl, '#ffcf5c');
      try { if (window.showGameNotification) window.showGameNotification('CASTLE', 'Towers upgraded to Level ' + lvl, '#ffcf5c'); } catch (_) {}
    });
    // 🗼 BOKŠTAS PASTATYTAS — išeinam iš build-mode (jei pasiekta max, lieka), feedback.
    room.onMessage('tower_built', function (e) {
      var n = e ? e.count : 0;
      _status('🗼 Tower built (' + n + '/5)', '#ffcf5c');
      try { if (window.showGameNotification) window.showGameNotification('CASTLE', 'Zip Tower placed (' + n + '/5)', '#ffcf5c'); } catch (_) {}
      try { if (B.f9WallSound) B.f9WallSound('hit'); } catch (_) {}
      if (n >= 5 && typeof window._f9ExitTowerPlaceMode === 'function') window._f9ExitTowerPlaceMode();
    });
    room.onMessage('tower_build_fail', function (e) {
      var r = e ? e.reason : '';
      var msg = r === 'max' ? 'Max towers reached (5)' : r === 'tooclose' ? 'Too close — min 6 apart' : r === 'exists' ? 'Tower already there' : r === 'nowall' ? 'Wall broken there' : r === 'entrance' ? "Can't build on an entrance" : 'Cannot build here';
      _status('🗼 ' + msg, '#f88');
    });
    // 🦴 UPGRADE už kaulus — serveris nurašė iš banko (widget + pilies panelė atsinaujina iškart)
    room.onMessage('bones_spent', function (e) {
      if (!e) return;
      _boneBankVal = Math.max(0, Number(e.bank) || 0);
      try { if (window.showGameNotification) window.showGameNotification('🦴 ' + (e.what || 'UPGRADE'), '-' + e.cost + ' bones · bank: ' + _boneBankVal.toFixed(1) + ' 🦴', '#ffcf5c'); } catch (_) {}
    });
    room.onMessage('upgrade_fail', function (e) {
      var r = e ? e.reason : '';
      var msg = r === 'bones' ? ('Need ' + (e.cost || 0) + ' 🦴 in bank (have ' + (e.have != null ? e.have : 0) + ')')
        : r === 'wallet' ? 'Connect wallet to upgrade' : 'Upgrade failed — try again';
      _status('🦴 ' + msg, '#f88');
      try { if (window.showGameNotification) window.showGameNotification('🏰 UPGRADE', msg, '#e85d5d'); } catch (_) {}
    });
    // 🏳️ RETREAT countdown — VISI puoliko unitai zonoj → countdown iki atsitraukimo (sec<0 = atšaukta).
    //    ⏳ window._f9RetreatCtd → game.js _f9DrawRetreatZone piešia MĖLYNĄ laiko žiedą aplink auksinį
    //    (pildosi ratu; klientas interpoliuoja tarp sekundinių tick'ų → sklandus arc'as).
    room.onMessage('retreat', function (e) {
      if (!window.__f9RaidActive) return;   // tik puolikui
      var sec = e ? e.sec : -1;
      if (sec >= 0) {
        var prev = window._f9RetreatCtd;
        var total = Math.max(sec, (prev && prev.total) || 0, 1);
        window._f9RetreatCtd = { sec: sec, at: pnow(), total: total };
        _status('↩ RETREAT in ' + sec + 's — keep ALL units in zone', '#8e8');
      } else {
        window._f9RetreatCtd = null;   // unitas išėjo → countdown atšauktas, žiedas išsivalo
        _status('⚔ raid', '#f86');
      }
    });
    // 🏥 LIGONINĖ (EILĖ) — serveris siunčia pilną eilę {list:[{tokenId,utype,level,healing,eta}],now,healMs}.
    //   eta = serverio epoch → normalizuojam į kliento laikrodį (etaLocal) offset'u.
    room.onMessage('hospital', function (e) {
      var recv = Date.now();
      var list = (e && Array.isArray(e.list)) ? e.list : [];
      var off = (e && e.now) ? (recv - e.now) : 0;
      list.forEach(function (i) { i.etaLocal = (i.eta || 0) + off; });
      window._f9Hospital = list;
      window._f9HospHealMs = (e && e.healMs) || 3600000;
      window._f9HospLvl = (e && e.hospLevel) || 1;          // 🏥 ligoninės lygis (pilies panelei)
      window._f9HospSlots = (e && e.slots) || 1;            // gydymo slotų kiekis
      window._f9HospReady = (e && typeof e.ready === 'number') ? e.ready : 0;   // ⚔️ kiek paruoštų deploy'ui
      if (e && e.insta) window._f9HospInsta = e.insta;                          // ⚡🔵 RONKE BLESS charge'ai {cap,used,remaining}
      window._f9InstaReady = (e && e.instaReady === true);                      // ⚡🔵 ar Bless DABAR veiks (savoj pilyje, ne raido metu) — mygtukas rodomas tik tada
      window._f9HospStale = (e && typeof e.stale === 'number') ? e.stale : 0;   // 🔒 paslėpta senų-dekų sužalotų
      // 🛡 07-06 user: kurie deko unitai DABAR stovi pilies lauke (kaunasi) vs rezerve — inventoriaus žymėms.
      window._f9OnField = new Set((e && Array.isArray(e.onField)) ? e.onField.map(String) : []);
      window._f9Reserve = new Set((e && Array.isArray(e.reserve)) ? e.reserve.map(String) : []);
      window._f9FieldAt = recv;   // šviežumo žymė (inventorius naudoja tik jei šviežia + savo pilyje)
      try { if (typeof window._f9HospRenderIfOpen === 'function') window._f9HospRenderIfOpen(true); } catch (_) {}
    });
    // ⚡🔵 RONKE BLESS — instant heal nepavyko (nėra charge'ų / NFT / raidas / senas dekas)
    room.onMessage('insta_heal_fail', function (e) {
      if (e && e.insta) window._f9HospInsta = e.insta;
      var r = (e && e.reason) || '';
      var msg = r === 'no_nft' ? 'Hold a Ronkeverse NFT to unlock instant heals'
        : r === 'no_charges' ? 'No Ronke Bless charges left today'
        : r === 'raid' ? 'Cannot instant-heal during a raid'
        : r === 'stale' ? 'That unit is from an old deck — not in your current deck'
        : 'Cannot instant-heal right now';
      try { if (window.showGameNotification) window.showGameNotification('🔵 RONKE BLESS', msg, '#e85d5d'); } catch (_) {}
      try { if (typeof window._f9HospRenderIfOpen === 'function') window._f9HospRenderIfOpen(true); } catch (_) {}
    });
    // ⚔️ DEPLOY rezultatas — kiek unitų įleista į garnizoną
    room.onMessage('deploy_done', function (e) {
      var n = (e && e.added) || 0;
      try {
        if (window.showGameNotification) {
          if (e && e.reason === 'raid') window.showGameNotification('⚔ DEPLOY', 'Cannot deploy during a raid!', '#e85d5d');
          else if (n > 0) window.showGameNotification('⚔ DEPLOYED', n + ' unit' + (n > 1 ? 's' : '') + ' joined the garrison!', '#7ec77f');
          else window.showGameNotification('⚔ DEPLOY', 'No units ready to deploy', '#8a9aaa');
        }
      } catch (_) {}
    });
    // 🏥 mano NFT unitas krito: 90% sužalotas → eilė; 10% tikra mirtis. (Eilės update ateina 'hospital' push'u.)
    room.onMessage('injured', function (e) {
      if (!e || !e.tokenId) return;
      // ⚔ SETTLED suvestinei — kaupiam MANO nuostolius per mūšį (reset _onStart)
      try {
        var rec = { tokenId: String(e.tokenId), utype: e.utype || '', level: e.level || 0 };
        if (e.fate === 'injured') _raidLog.injured.push(rec); else _raidLog.dead.push(rec);
      } catch (_) {}
      if (e.fate === 'injured') {
        var pos = (typeof e.queuePos === 'number' && e.queuePos >= 0) ? e.queuePos + 1 : null;
        var txt = String(e.utype || 'unit').toUpperCase() + ' injured — ' + (pos === 1 ? 'healing now (1h)' : 'hospital queue #' + pos);
        try { if (window.showGameNotification) window.showGameNotification('🏥 HOSPITAL', txt, '#ffcf5c'); } catch (_) {}
      } else {
        try { if (window.showGameNotification) window.showGameNotification('💀 UNIT LOST', String(e.utype || 'unit').toUpperCase() + ' died in battle — gone forever', '#e85d5d'); } catch (_) {}
      }
    });
    // ⚰️ KAPINĖS — pot/rate (badge + collect UI). own=false kai raide žiūrim į gynėjo grobį.
    room.onMessage('cemetery', function (e) {
      if (!e) return;
      window._f9Cemetery = { pot: e.pot || 0, rate: e.rate || 0, cap: e.cap || 0, claimMin: e.claimMin || 25, nft: e.nft || 0, reg: e.reg || 0, hosp: e.hosp || 0, rv: e.rv || 0, wallet: e.wallet || 0, eligible: !!e.eligible, rules: e.rules || null, own: e.own !== false,
        onField: (typeof e.onField === 'number' ? e.onField : null), reserve: (typeof e.reserve === 'number' ? e.reserve : null),   // ⚔ kasimo lauko-frakcija
        power: (typeof e.power === 'number' ? e.power : null), fullPower: (typeof e.fullPower === 'number' ? e.fullPower : null),   // healthy / pilnas RP
        duty: (e.duty === 'safe' ? 'safe' : 'online'), gated: !!e.gated, dutyMult: (typeof e.dutyMult === 'number' ? e.dutyMult : 2),   // ⚔️🛡 DUTY status
        dutyOnlineMult: (typeof e.dutyOnlineMult === 'number' ? e.dutyOnlineMult : 2), dutySafeMult: (typeof e.dutySafeMult === 'number' ? e.dutySafeMult : 1.2),
        dutyOnlineBase: (typeof e.dutyOnlineBase === 'number' ? e.dutyOnlineBase : 10), dutySafeBase: (typeof e.dutySafeBase === 'number' ? e.dutySafeBase : 5),   // 🏁 flat bazės
        mineEligible: (typeof e.mineEligible === 'boolean' ? e.mineEligible : null), mineField: (typeof e.mineField === 'number' ? e.mineField : null), mineRules: e.mineRules || null,   // ⛏️ LAUKO-gate (kasimo eligibility = unitai ant lauko, ne dekas)
        at: Date.now() };
      // ⛏️💰 SERVER-AUTHORITATIVE mining: kai serveris siunčia mpot → nustatom _f9Mine (clientOnly:false → STOJA client accrual)
      try {
        if (e.own !== false && typeof e.mpot === 'number') {
          var _ma = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) ? String(window.Wallet.getAddress()).toLowerCase() : '_guest';
          window._f9Mine = { pot: e.mpot, rate: (typeof e.mrate === 'number' ? e.mrate : 0), cap: (e.mcap || 200), siegeStep: (e.msiege || 200), claimMin: (e.mclaim || 500), mwd: !!e.mwd, clientOnly: false, _addr: _ma, at: Date.now() };
        }
      } catch (_) {}
      try { if (typeof window._f9CemRenderIfOpen === 'function') window._f9CemRenderIfOpen(); } catch (_) {}
      try { if (typeof window._f9MineRenderIfOpen === 'function') window._f9MineRenderIfOpen(); } catch (_) {}
    });
    // ⚔️🛡 DUTY keitimo rezultatas — klaida (pvz. kovos metu) rodoma mine panelės žinutėj; sėkmė → cemetery jau atnaujins
    room.onMessage('duty_result', function (e) {
      try {
        var msg = document.getElementById('f9mine-dutymsg');
        if (!e || !e.ok) { if (msg) { msg.style.color = '#e8a08a'; msg.textContent = (e && e.error) ? e.error : 'Could not change duty'; } }
        else if (msg) { msg.style.color = '#6fcf5c'; msg.textContent = (e.mode === 'safe' ? '🛡 Now SAFE — protected' : '🟢 Now ON DUTY — 2× mining'); }
      } catch (_) {}
    });
    // 🛡 07-17 (user): AUTO-SAFE po raido — apsauga kol PATS grąžinsi ON DUTY. Aiški žinutė žaidėjui.
    room.onMessage('auto_safe', function () {
      try {
        if (window.showGameNotification) window.showGameNotification('🛡 PROTECTED', 'Safe after battle — nobody can raid you. Heal & redeploy 12 units, then tap ON DUTY when ready.', '#7fd0d8');
      } catch (_) {}
    });
    room.onMessage('mine_stolen', function (e) {   // ⛏️ 100% wipe → 50% pot pavogta. Gynėjas praranda; puolikas (thief) gauna į savo namų pot.
      try {
        var amt = (e && Number(e.amount)) || 0;
        if (amt <= 0) return;
        var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (e.thiefSid && e.thiefSid === mySid) {
          // 💰 AŠ puolikas — serveris grobį jau įskaitė į mano NAMŲ mining pot (matysis grįžus namo / kitą cemetery žinutę).
          window._f9MineLootFx = { gained: amt, t: now };
          try { if (window.showGameNotification) window.showGameNotification('⛏️ LOOTED', '+' + amt.toFixed(0) + ' RONKE from their mine — waiting in your pot at home', '#ffcf5c'); } catch (_) {}
        } else {
          // 💀 AŠ gynėjas — netekau 50% nesurinkto pot (serveris jau nuėmė; optimistiškai atspindim, pot patvirtins kita cemetery žinutė).
          if (window._f9Mine && typeof window._f9Mine.pot === 'number') { window._f9Mine.pot = Math.max(0, window._f9Mine.pot - amt); }
          window._f9MineStealFx = { lost: amt, t: now };
        }
        if (typeof window._f9MineRenderIfOpen === 'function') window._f9MineRenderIfOpen();
      } catch (_) {}
    });
    // ⛏️💸 KASIMO IŠĖMIMAS — serveris pasirašė voucher'į + jau nurašė pot; klientas siunčia claimReward TX (moka gas, RONKE iš faucet pool).
    room.onMessage('mine_withdraw_result', function (e) {
      try { if (typeof window._f9MineSubmitVoucher === 'function') window._f9MineSubmitVoucher(e); } catch (_) {}
    });
    room.onMessage('bones_banked', function (e) {
      if (!e) return;
      // 🦴 bankas pasikeitė → widget'as (bank+sesija) odometru patiksi aukštyn + BANK panelė atsinaujina
      if (e.total != null && isFinite(+e.total)) _boneBankVal = +e.total;
      else _boneBankVal = Math.round((_boneBankVal + (+e.amount || 0)) * 10) / 10;
      // 🦴 „skrenda į balansą" — BET jei atvira SETTLED panelė, jos seka (count-up→fly→chip) tai padarys pati
      if ((+e.amount || 0) > 0 && !_settleEl) { try { _f9BonesFly(+e.amount); } catch (_) {} }
      if (bonePanelEl && bonePanelEl.style.display !== 'none') { try { room.send('bones_bank_get'); } catch (_) {} }
      try { if (window.showGameNotification) window.showGameNotification('🦴 COLLECTED', '+' + (+e.amount).toFixed(1) + ' bones banked' + (e.total != null ? ' (bank: ' + (+e.total).toFixed(1) + ')' : ''), '#7ec77f'); } catch (_) {}
    });
    // 🦴🎫 RONKEVERSE MINT-BONUS — serveris patvirtino award už nukaltus unitus → banko count-up + „skrenda" animacija.
    room.onMessage('mint_reward_done', function (e) {
      if (!e) return;
      if (e.reason !== 'no_receipt') _mintClearPending(e.txHash);   // transient (receipt dar neindeksuota) → paliekam retry'ui
      if (!(e.amount > 0)) return;                                   // already/no_mint/no_ronkeverse → tyliai
      _mintClearPending(e.txHash);
      if (e.total != null && isFinite(+e.total)) _boneBankVal = +e.total;   // authoritative banko balansas
      else _boneBankVal = Math.round((_boneBankVal + (+e.amount || 0)) * 10) / 10;   // _syncBones odometru pakyla
      _f9MintRewardFx(+e.amount, +e.n || 1);
      if (bonePanelEl && bonePanelEl.style.display !== 'none') { try { room.send('bones_bank_get'); } catch (_) {} }
    });
    room.onMessage('cemetery_collect_fail', function (e) {
      var msg = (e && e.reason === 'min')
        ? 'Need ' + (e.need || 25) + ' bones to claim (' + ((e.pot != null ? +e.pot : 0)).toFixed(1) + ' now)'
        : 'Cannot claim during a raid!';
      try { if (window.showGameNotification) window.showGameNotification('⚰️ CEMETERY', msg, '#e85d5d'); } catch (_) {}
    });
    room.onMessage('cemetery_stolen', function (e) {
      if (!e) return;
      var thief = e.thiefSid === mySid;
      window._f9LastSteal = { amount: +e.amount || 0, mine: thief };   // ⚔ SETTLED suvestinei
      // jei settled panelė jau atidaryta — atnaujinam kaulų eilutę (steal ateina async po match_end)
      try { if (typeof _updateSettleBones === 'function') _updateSettleBones(); } catch (_) {}
      try {
        if (window.showGameNotification) window.showGameNotification(
          thief ? '🦴 LOOT!' : '💀 PLUNDERED',
          thief ? 'Stole ' + (+e.amount).toFixed(1) + ' bones from the cemetery!' : 'A raider stole ' + (+e.amount).toFixed(1) + ' bones from your cemetery!',
          thief ? '#ffcf5c' : '#e85d5d');
      } catch (_) {}
    });
    // 🏥 unitas PASVEIKO — grįžta į rikiuotę (eilės update ateina 'hospital' push'u kartu)
    room.onMessage('recovered', function (e) {
      if (!e) return;
      try {
        if (window.showGameNotification) {
          if (e.instant) window.showGameNotification('⚡ RONKE BLESS', String(e.utype || 'unit').toUpperCase() + (e.deployed ? ' instantly healed & deployed!' : ' healed — now healthy, add it to a deck to use'), '#7fdfea');
          else window.showGameNotification('✅ RECOVERED', String(e.utype || 'unit').toUpperCase() + ' is healed and back in action!', '#7ec77f');
        }
      } catch (_) {}
    });
    room.onMessage('retreat_done', function () {
      window._f9RetreatCtd = null;
      if (!window.__f9RaidActive) return;
      _status('↩ Retreated — units saved', '#8e8');
      // 🌀 TELEPORTAS — ratas užsipildė: violetinis poof ant kiekvieno MANO unito (armija išsineša)
      try {
        var GS = S();
        (GS && GS.units || []).forEach(function (u) {
          if (u && u.alive && u._pvpId && u._pvpOwner === mySid && B.spawnF9Teleport) {
            B.spawnF9Teleport((u.rx !== undefined ? u.rx : u.x), (u.ry !== undefined ? u.ry : u.y));
          }
        });
      } catch (_) {}
    });
    // 🗼 ZIP bokšto šūvis → žaibo bolt FX nuo bokšto į taikinį (žala server-side; čia tik vizualas).
    room.onMessage('zip_shot', function (e) {
      if (!e) return;
      var GS = S(); if (!GS) return;
      if (!Array.isArray(GS._zipBolts)) GS._zipBolts = [];
      var C = B.CELL, tgt = _mir[e.toId];
      var sx = ((+e.x) + 0.5) * C, sy = ((+e.y) - 0.15) * C;   // bokšto viršus (tesla coil)
      var ex = tgt ? (((tgt.rx !== undefined ? tgt.rx : tgt.x) + 0.5) * C) : sx;
      var ey = tgt ? (((tgt.ry !== undefined ? tgt.ry : tgt.y) + 0.5) * C) : sy;
      GS._zipBolts.push({ sx: sx, sy: sy, ex: ex, ey: ey, born: pnow(), life: 220, seed: Math.random() * 1000 });
    });
    room.onMessage('castle_captured', function (e) {
      var mine = e && e.team === myTeam;
      _status(mine ? '🏰 CASTLE CAPTURED!' : '🏰 Enemy captured the castle', mine ? '#5cf' : '#f66');
      try { if (window.showGameNotification) window.showGameNotification('CASTLE', mine ? 'You captured the castle!' : 'Enemy took the castle', mine ? '#5cf' : '#f66'); } catch (_) {}
    });
    // 🗡️ GYNĖJO pranešimas — kažkas atėjo pulti tavo pilies (puolikas join'ino).
    room.onMessage('under_attack', function (e) {
      // tik gynėjui (savininkui) — puolikas pats save nemato kaip „under attack"
      if (window.__f9RaidActive) return;
      try { _f9PlayAttackAlarm(); } catch (_) {}   // 🔊⚔️ garsinis įspėjimas — tavo pilį puola
      try { if (e && e.attacker) window._f9LastAttacker = String(e.attacker); } catch (_) {}   // 🔎 settled atsekamumui — kas puolė
      var who = (e && e.attacker) ? (String(e.attacker).slice(0, 6) + '…' + String(e.attacker).slice(-4)) : 'A raider';
      _status('⚔️ YOUR CASTLE IS UNDER ATTACK!', '#f66');
      try { if (window.showGameNotification) window.showGameNotification('⚔️ UNDER ATTACK', who + ' is raiding your castle! Defend!', '#f66'); } catch (_) {}
    });
    // ℹ️ RAID MODAS — puolikui: GYVAS gynėjas vs OFFLINE pilis (AI kopija). Kad žaidėjas žinotų su kuo kaunasi.
    room.onMessage('raid_mode', function (e) {
      var live = !!(e && e.live);
      window.__f9RaidLive = live;
      _connectingText(live ? '⚔️ LIVE RAID — defender is online!' : '🤖 Raiding offline castle (AI defenders)');
      _status(live ? '⚔️ LIVE raid — real opponent!' : '🤖 Offline raid (AI defense)', '#f86');
      try { if (window.showGameNotification) window.showGameNotification(live ? '⚔️ LIVE RAID' : '🤖 OFFLINE RAID', live ? 'Defender is ONLINE — real PvP!' : 'Castle owner is offline — fighting their AI defenders.', live ? '#6fcf5c' : '#4a9da6'); } catch (_) {}
    });
    // 📜 RAID ATASKAITOS — grįžus namo: kol buvai OFFLINE tavo pilis buvo puolama. Rodom pasekmes.
    room.onMessage('raid_reports', function (e) {
      var reps = (e && Array.isArray(e.reports)) ? e.reports : [];
      if (reps.length && typeof _showRaidReports === 'function') _showRaidReports(reps);
    });
    room.onMessage('match_end', function (e) {
      var draw = e && !e.winnerSid;
      var mine = e && e.winnerSid === mySid;
      // 🗡️ RAID pabaiga — po jos grįžtam į SAVO pilį (puolikas → savo home; gynėjas → atstatyta pilis).
      var wasRaid = !!window.__f9RaidActive;
      var wasDefender = !!window.__f9HomeActive && !wasRaid;
      if (wasRaid || wasDefender) {
        var msg = wasRaid ? (mine ? '🏆 Raid successful!' : '💀 Raid failed') : (mine ? '🏰 Castle defended!' : '🏰 Castle fell!');
        _status(msg, mine ? '#6e8' : '#f88');
        var myAddr = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || window._f9HomeAddr || '';
        window.__f9RaidActive = false;
        // ⚔ SETTLED suvestinė (07-04 user): išgyvenusius suskaičiuojam DABAR (kol room state gyvas),
        //   panelę rodom po ~900ms (match_result + cemetery_stolen spėja atkeliauti). CLOSE → grįžtam namo.
        var _surv = 0;
        try {
          var r0 = _room();
          if (r0 && r0.state && r0.state.units) r0.state.units.forEach(function (u) { if (u && u.owner === mySid && u.alive) _surv++; });
        } catch (_) {}
        window._f9SettleData = { survived: _surv };
        setTimeout(function () {
          // 📜 vieša PvP istorija dabar rašoma SERVERYJE (F9PvpRoom → f9_bases match_* eilutės) — klientinis publisher išimtas
          try { _showRaidSettled({ win: mine, raid: wasRaid, addr: myAddr }); }
          catch (_) { try { relaunchHome(); } catch (_1) { try { launchHome({ address: myAddr }); } catch (_2) {} } }
        }, 900);
        return;
      }
      _status(mine ? 'YOU WIN 🏆' : (draw ? 'DRAW' : 'YOU LOSE'), mine ? '#6e8' : '#f88');
      _endScreen(draw ? 'draw' : (mine ? 'win' : 'lose'),
                 draw ? '' : (mine ? 'Enemy squad wiped out' : 'Your squad was wiped out'));
    });
    // 🦴 KAULAI (FAZĖ 1) — parodom kiek kaulų uždirbau (= ×5 RONKE) + prarasta unitų. Display TIK (dar ne realus payout).
    room.onMessage('match_result', function (e) {
      try { if (e && e.rosters) window._f9SettleRosters = e.rosters; } catch (_) {}   // ⚔ abiejų pusių sudėtis 2-pusiam settled ekranui
      try { if (e) { window._f9SettleMatchId = e.matchId; window._f9SettleMeta = { durationMs: e.durationMs, reason: e.reason }; } } catch (_) {}   // 🔎 Match ID + meta atsekamumui (07-14)
      try {
        if (!e || !Array.isArray(e.players)) return;
        var me = e.players.filter(function (p) { return p.sessionId === mySid; })[0];
        if (!me) return;
        var bones = me.bones || 0, ronke = me.ronkeFromBones || 0, lost = me.unitsLost || 0;
        window._f9LastBones = { bones: bones, ronke: ronke, lost: lost, kills: me.kills || 0,
                                baseMult: me.baseMult || 1, powerBonus: me.powerBonus || 0, totalMult: me.totalMult || 1, ronkePower: me.ronkePower || 0 };
        console.log('[F9 kaulai] ' + JSON.stringify(window._f9LastBones));
        // toFixed — float32 schema artefaktai (1.6299…) → 1 skaitmuo po kablelio.
        var txt = '🦴 ' + bones.toFixed(1) + ' bones = ' + ronke.toFixed(0) + ' RONKE' + (lost > 0 ? '  ·  💀 −' + lost + ' units' : '');
        var head = '🦴 BONES (' + (me.kills || 0) + ' kills · ×' + (Number(me.totalMult) || 1).toFixed(1) + ')';
        try { if (window.showGameNotification) window.showGameNotification(head, txt, bones > 0 ? '#1f8a2e' : '#f88'); } catch (_) {}
      } catch (_) {}
    });
    // 🪖 REINFORCEMENT — mano rezervo unitas įstojo (dekas >12). Trumpas statusas + notifikacija.
    room.onMessage('reinforce', function (e) {
      try {
        if (!e || e.team !== myTeam) return;   // tik MANO pastiprinimai
        _status('🪖 Reinforcement! reserves: ' + (e.left != null ? e.left : '?'), '#9cf');
        if (window.showGameNotification) window.showGameNotification('🪖 REINFORCEMENT', 'Reserve joined the battle · ' + (e.left != null ? e.left : '?') + ' left', '#9cf');
      } catch (_) {}
    });
    // 🦴 PER-KILL POP — kai MANO unitas parbloškia priešą → maloni auksinė „🦴 +N" iššoka kill vietoj.
    //   Pasiekimo jausmas realiu laiku (ne HUD counteris). N = kaulų daugiklis (baseMult + RonkePower).
    room.onMessage('died', function (e) {
      try {
        if (!e || !e.by || !window.spawnDmgNumber) return;
        var room = _room(); if (!room || !room.state || !room.state.units) return;
        var killer = room.state.units.get(e.by);
        if (!killer || killer.owner !== mySid) return;   // tik MANO kill'ai (mano unitas užmušė)
        var dead = room.state.units.get(e.id);
        var me = room.state.players.get(mySid);
        var gain = (typeof e.bg === 'number' && e.bg > 0) ? e.bg : ((me && me.boneMult) || 1);   // per-kill ROLLED kiekis
        var lucky = !!e.lucky;
        var px = dead ? dead.x : killer.x, py = (dead ? dead.y : killer.y) - 0.35;
        // LUCKY (5%) → auksinis + didesnis „🍀 +X LUCKY!"; normalus (svyruoja 1.1-1.5) → tamsiai žalias „🦴 +X".
        if (lucky) window.spawnDmgNumber(px, py, '🍀 +' + gain.toFixed(1) + ' LUCKY!', '#ffd24a', 28, 'crit');
        else window.spawnDmgNumber(px, py, '🦴 +' + gain.toFixed(1), '#1f8a2e', 22, 'crit');
      } catch (_) {}
    });
    // 🦴 BANKAS + SWAP → RONKE (panelė ant balanso click; žr. _bonePanel/_onBonesBank/_onBonesVoucher)
    room.onMessage('bones_bank', function (e) { try { _onBonesBank(e); } catch (_) {} });
    room.onMessage('bones_voucher', function (v) { try { _onBonesVoucher(v); } catch (_) {} });
    room.onMessage('bones_err', function (e) { _boneSwapBusy = false; _boneStatus('❌ ' + ((e && e.msg) || 'error'), '#f88'); });
  }

  function _onStart(e) {
    // 🩹 DUPLIKUOTO match_start GUARD (2026-07-03): serveris raide broadcast'ina match_start ir po join,
    //    ir po 'ready' → antras kvietimas perkraudavo sceną goToFloor(9) BE _pvpArena (28-wide „dryžuota
    //    tuštuma", mirrors dingsta). Jau startavus tame pačiame kambaryje — ignoruojam (payload identiškas).
    if (started) return;
    started = true;
    try { _mintFlush(); } catch (_) {}   // 🦴🎫 pending Ronkeverse mint-bonus report'ai (jei buvo prarasti) → retry scene-enter'e
    _wallMir = {};   // 🏰 NAUJAS kambarys/relaunch → reset sienų kešo, kad _syncWalls sinkintų ŠVARIAI (kitaip
                     //   stale kešas + goToFloor(9) išvalymas → siena nematoma iki restarto). Su self-heal _syncWalls.
    window._f9Moat = (e && Array.isArray(e.moat)) ? e.moat : [];   // 💧 grovio celės iš serverio (vizualui)
    window._f9Cap = (e && e.cap) ? e.cap : null;                   // 🏰 capture zona {x,y,r} iš serverio
    window._f9TpPads = (e && Array.isArray(e.tp)) ? e.tp : [];     // 🌀 teleporto pad'ai [[x,y],...] iš serverio
    window._f9TpDisabled = false;                                  // 🌀 nauja partija → TP vėl aktyvus (jei vidurio siena gyva)
    window._f9RetreatZone = (e && e.retreatZone) ? e.retreatZone : null;   // 🏳️ retreat 8×8 zona {x0,y0,x1,y1}
    window._f9Passages = (e && Array.isArray(e.passages)) ? e.passages : [];   // 🚪 praėjimų eilės (grovio tarpai) — ant jų bokšto NEstatom
    window._f9CapState = null; _capLast = '';
    window._f9MyBones = null; _boneLast = ''; _boneShown = 0; _boneTargetPrev = 0; _boneSnapNext = true;   // 🦴 nauja partija → reset balanso count-up (bankas persistuoja, atsinaujins per bones_bank_get)
    _raidLog = { injured: [], dead: [] }; window._f9LastSteal = null; window._f9SettleData = null; window._f9SettleRosters = null; window._f9SettleMatchId = null; window._f9SettleMeta = null; window._f9LastAttacker = null; window._f9CamFree = false;   // ⚔ settled suvestinės reset + 🖐️ nauja scena → kamera vėl seka armiją
    // 🐛 P-C3: išvalom SENOS sesijos ligoninės būseną PRIEŠ _f9pvpLive=true — kitaip 1.5s langą (kol ateis
    //   šviežias 'hospital' push) barracks_nft.fetchHospState skaitytų SENOS piniginės sužalotus kaip LIVE
    //   (→ deko/lauko „makalynė" perjungus piniginę). null (NE []) → fetchHospState kris atgal į per-adresą REST.
    window._f9Hospital = null; window._f9HospReady = 0; window._f9HospInsta = null; window._f9InstaReady = false; window._f9HospStale = 0; window._f9OnField = null; window._f9Reserve = null;
    try { _closeRaidSettled(false); } catch (_) {}   // sena panelė (jei liko) — nuimam
    // 🏥 ligoninės/kapinių/🦴banko užklausos — po start'o, kai room stabilus (bankas reikalingas widget'o bendram balansui)
    setTimeout(function () { try { var r = _room(); if (r) { r.send('hospital_get'); r.send('cemetery_get'); r.send('bones_bank_get'); } } catch (_) {} }, 1500);
    var room = _room();
    var me = (room && room.state && room.state.players && room.state.players.get) ? room.state.players.get(mySid) : null;
    myTeam = me ? me.team : 0;
    window._f9pvpLive = true;
    window._f9pvpMyTeam = myTeam;
    _status('PLAYING', '#6e8');
    try { _castleStep('castle', 'done'); } catch (_) {}   // 🏰 baras → 100%
    _clearScreen();
    window._f9HomeLoaded = true;   // 🏰 home scena pradėjo → nuo dabar wallet connect/swap gali relaunch'int
    // 🐛 07-05: jei piniginė prisijungė MID-LOAD (kol _f9HomeLoaded dar buvo false), reloadProfileForWallet
    //   event'as praėjo pro gate'ą → pilis liktų SVEČIO (dev unitai) nors wallet UI rodo realų acc.
    //   Post-load patikra: adresas pasikeitė nuo to, kuriam pilis užkrauta → vienas relaunch su tikru deku.
    try {
      if (window.__f9HomeActive && !window.__f9RaidActive) {
        var _wNow = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || '';
        if (_wNow && _wNow.toLowerCase() !== String(window._f9HomeAddr || '').toLowerCase()) {
          console.log('[F9Live] wallet prisijungė mid-load (' + _wNow.slice(0, 10) + '… ≠ ' + String(window._f9HomeAddr || 'guest').slice(0, 10) + ') → relaunch su tikru deku');
          setTimeout(function () { try { relaunchHome(); } catch (_) {} }, 400);
        }
      }
    } catch (_) {}
    B.goToFloor(9);   // įeinam į TIKRĄ F9 floor — abu klientai renderins serverio būseną
    // 📋 Esi SAVO pilyje (ne raide) → auto-publish savo stendą į cloud, kad puolikai matytų TĄ PATĮ vaizdą.
    if (window.__f9HomeActive && !window.__f9RaidActive && B.publishMyBoard) {
      setTimeout(function () { try { B.publishMyBoard(window._f9HomeAddr); } catch (_) {} }, 1800);
    }
    // 🩹 Tvirtas fix: paslepiam tamsią kairę panelę (#panel-p1) VISAI PvP scenai per body klasę —
    //    nepriklausomai nuo `.f9-rts` laiko / piniginės re-render'io (kuris ją gali parodyti).
    try { document.body.classList.add('f9pvp-on'); } catch (_) {}
  }

  function active() { return on && started && S() && S().floor === 9; }

  // ── PvP arena: pilnas 40×24 (sutampa su serveriu, užpildo ekraną → BE juodos tuštumos) + dekoracijos ──
  // Fiksuotas kliūčių išdėstymas 40×24 — naudojamas IR renderiui (čia) IR serverio kolizijai
  // (F9PvpRoom.ts PVP_OBSTACLES — PRIVALO sutapti!). [tipas, x, y]. Dekoracijos key = "y,x" (row,col).
  // Vengiam spawn'ų (x14/x26 @y12) + centro lane (y10–14), kad neblokuotų starto/susidūrimo.
  // PRIVALO sutapti su F9PvpRoom.ts PVP_OBSTACLES! [tipas, x, y]. Deco key = "y,x". 80×24 map.
  var PVP_DECO = [
    // medžiai (tree3 = apvali kolizija, cy=y+0.39) — vakarų laukas (attacker approach)
    ['tree3', 16, 4], ['tree3', 16, 19], ['tree3', 26, 7], ['tree3', 26, 16],
    ['tree3', 36, 3], ['tree3', 36, 20], ['tree3', 45, 9], ['tree3', 45, 14],
    // 🌲 negyvi medžiai (tree5 = apvali kolizija, cy=y+0.22) — vizualinis įdomumas (vengiam spawn'ų/praėjimo/pilies)
    ['tree5', 21, 8], ['tree5', 24, 17], ['tree5', 47, 16], ['tree5', 52, 20], ['tree5', 46, 20],   // 3 rytiniai PRIE KAPINIŲ šalia pilies (49.3,18.2; dar +150px žemyn 07-03)
    // akmenys (gold stone / boulder) PAŠALINTI 2026-06-27 (user prašymu) — nei renderio, nei kolizijos
    // krūmai (BE kolizijos — tik tekstūra)
    ['bush1', 12, 8], ['bush2', 48, 16], ['bush1', 60, 5], ['bush2', 70, 18]
  ];
  function _pvpArena() {
    if (!B.setArena) return;
    try {
      B.setArena(80, 24);
      var deco = {};
      PVP_DECO.forEach(function (o) { deco[o[2] + ',' + o[1]] = o[0]; });   // key = "y,x" (render = row,col)
      S().decorations = deco;
      if (B.setMoat && Array.isArray(window._f9Moat) && window._f9Moat.length) B.setMoat(window._f9Moat);   // 💧 grovys → vandens celės
    } catch (e) { console.error('[F9Live] _pvpArena', e); }
  }

  // ── netTick: ABU klientai renderina serverio būseną (kviečiama per game.js guestTick hook) ──
  function netTick(now) {
    if (!active()) return;
    // 🩹 Kol scena GYVAI renderinasi — NEGALI būti jokio match'o-darymo overlay (connecting/lobby).
    //    Pašalinam likutį KIEKVIENĄ kadrą (pigus null-check), kad neuždengtų pilies (juodas „plemas").
    if (screenEl) _clearScreen();
    var s = S();
    if (!simInited) {
      if (Array.isArray(s.units)) s.units = s.units.filter(function (u) { return u && u.team === 0; });   // tik hero
      _pvpArena();
      simInited = true;
      // 🩹 KRITINIS: canvas/kamera užsikrovus apskaičiuoti PRIEŠ 80×24 areną → „juoda tuštuma".
      //    Po _pvpArena (setArena 80×24) priverstinai resize → canvas persiskaičiuoja teisingai.
      //    (User pastebėjo: F12 atidarymas = resize → juoda dingsta. Štai kodėl.)
      try { window.dispatchEvent(new Event('resize')); } catch (_) {}
      setTimeout(function () { try { window.dispatchEvent(new Event('resize')); } catch (_) {} }, 80);
      setTimeout(function () { try { window.dispatchEvent(new Event('resize')); } catch (_) {} }, 300);
    }
    _syncFromServer(now);
    _syncCapture();
    _syncBones();
    _centerCam();
  }

  // utype → ranged shot cooldown (ms) vizualui (atitinka serverio cd)
  var _SHOT_CD = { archer: 5000, harpoon_fish: 3600, shaman: 3000, ronhood: 4500, ghost: 3000 };
  function _isRanged(t) { return t === 'archer' || t === 'harpoon_fish' || t === 'ronhood' || t === 'shaman' || t === 'ghost'; }

  var _syncTick = 0;   // ⚡ perf 07-06: orphan-sweep žyma ant mirror (buvo naujas `seen` objektas kas kadrą)
  function _syncFromServer(now) {
    var s = S(); var room = _room();
    if (!room || !room.state || !room.state.units || !room.state.units.forEach) return;
    _syncTick++;
    room.state.units.forEach(function (su, id) {
      var mine = (su.owner === mySid);
      var m = _mir[id];
      if (m) m._seenT = _syncTick;
      if (!m) {
        var a = B.getEditorEnemyArchetype ? B.getEditorEnemyArchetype(su.utype) : null;
        m = B.mkUnit(B.nextEditorUnitId ? B.nextEditorUnitId() : (800000 + (++uidc)), 1, su.x, su.y, su.faceDx, a);
        m._pvpId = id; m.rx = su.x; m.ry = su.y; m.stack = 1;
        m._ix0 = m._ix1 = su.x; m._iy0 = m._iy1 = su.y; m._it = now;
        m._seenT = _syncTick;
        _mir[id] = m; s.units.push(m);
      }
      // nuosavybė + IŠVAIZDA (savi = ally/mėlyna + selectable; priešas = enemy/raudona)
      m._pvpOwner = su.owner; m._pvpTeam = su.team; m.utype = su.utype;
      m.tokenId = su.tokenId || m.tokenId || '';   // 💾 būrių persistencijos raktas (stabilus per refresh)
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
      // ⚡ perf 07-06: facing objektas PERNAUDOJAMAS (buvo naujas literalas kiekvienam unitui kas kadrą → GC churn)
      if (m.facing) { m.facing.dx = su.faceDx || 1; m.facing.dy = 0; }
      else m.facing = { dx: su.faceDx || 1, dy: 0 };
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
      m._f9Hold = !!su.holding;   // 🛡 HOLD POSITION skydas (sinch iš serverio) → in-world indikatorius + komandų lock
      if (su.holding) { m._f9HoldAt = { x: su.x, y: su.y }; }
      // 🚩 PATROL užraktas (sinch iš serverio) — markeris (pts NEsinch'inami; reikia tik lock + vėliavos vizualo)
      if (su.patrolling) { if (!m._f9Patrol) m._f9Patrol = { pts: [], idx: 0, pvp: true }; }
      else if (m._f9Patrol && m._f9Patrol.pvp) { m._f9Patrol = null; }
    });
    // dingę unitai (⚡ 07-06: _seenT žyma vietoj `seen` objekto)
    for (var id2 in _mir) {
      if (_mir[id2]._seenT !== _syncTick) { var mm = _mir[id2]; mm.alive = false; if (!mm._f9DiedAt) mm._f9DiedAt = pnow(); delete _mir[id2]; }
    }
    _syncWalls(now);   // 🏰 castle sienos iš serverio
  }

  // 🏰 Sync castle sienos iš serverio (room.state.walls) → game S._f9Walls (render per _f9DrawCastleWall).
  // FX: hp krito → hit flash + garsas; alive→false → collapse anim + garsas. (Logika serverio pusėj.)
  var _wallMir = {};
  function _syncWalls(now) {
    var room = _room();
    var GS = S();
    if (!room || !room.state || !room.state.walls || !room.state.walls.forEach || !GS) return;
    var _wcount = 0;
    room.state.walls.forEach(function (sw, key) {
      _wcount++;
      var w = _wallMir[key];
      if (!w) {
        w = { x: sw.x, y: sw.y, hp: sw.hp, maxHp: sw.maxHp, alive: !!sw.alive, tower: !!sw.tower, level: sw.level || 1, hit: 0, deathAt: 0 };
        _wallMir[key] = w;
      }
      w.tower = !!sw.tower;
      w.level = sw.level || 1;   // 🏰 sienos lygis (1=medinė / ≥2=akmeninė)
      if (w.hp != null && sw.hp < w.hp) {
        w.hit = pnow();
        var _wdmg = w.hp - sw.hp;   // 💢 žalos skaičiukas virš sienos celės (w.x,w.y = cell coord, kaip unitams)
        try { if (B.spawnDmgNumber && _wdmg > 0) B.spawnDmgNumber(w.x, w.y - 0.35, '-' + _wdmg, '#ffd2c0', 13, 'taken'); } catch (_) {}
        try { if (B.f9WallSound) B.f9WallSound('hit'); } catch (_) {}
      }
      w.hp = sw.hp; w.maxHp = sw.maxHp;
      var wasAlive = w.alive; w.alive = !!sw.alive;
      if (wasAlive && !w.alive) { if (!w.deathAt) w.deathAt = pnow(); try { if (B.f9WallSound) B.f9WallSound('collapse'); } catch (_) {} }
    });
    // S._f9Walls VISADA = _wallMir objektai (perstatom IN-PLACE kiekvieną kartą). Kešas _wallMir = tikrasis
    //   šaltinis (jį atnaujina hp/alive). KRITINIS: tik length-tikrinimas NEpakanka — atėjus IŠ savo home į
    //   raidą S._f9Walls turi SENUS 24 walls (length sutampa 24===24) → renderintų „nemirtiną" sieną, nors
    //   _wallMir hp krenta. In-place perstatymas → puolikas IR gynėjas mato vienodą sienos hp/griūtį.
    if (!Array.isArray(GS._f9Walls)) GS._f9Walls = [];
    GS._f9Walls.length = 0;
    for (var _k in _wallMir) GS._f9Walls.push(_wallMir[_k]);
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
      // lokalus marker'is SAVO ekrane (komandos feedback) — oponentas to nemato (jis renderina tik serverio unitus).
      // tpmove → markerio NEdedam: teleporto pad'as pats pasižymi (aim ring), kitaip dubliuotųsi.
      if (action !== 'tpmove') { try { if (B._f9PushClickMarker) B._f9PushClickMarker(tx, ty, units, action === 'attackmove' ? 'amove' : false); } catch (_) {} }
    }
    return true;
  }

  // 🚩 PATROL: maršruto taškų sąrašas (pts) → serveriui (server-auth patrol loop).
  function sendCommandPts(action, units, pts) {
    if (!active()) return false;
    var ids = [];
    (units || []).forEach(function (u) { if (u && u._pvpId && u._pvpOwner === mySid) ids.push(u._pvpId); });
    if (ids.length) {
      try { window.F9PVP.room.send('cmd', { action: action, ids: ids, pts: pts }); } catch (_) {}
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

  // ── kamera: platus 80-celių map → kadruojam SAVO unitus (kad žaidėjas matytų savo armiją);
  //    fallback = visi unitai jei savų neidentifikuota. (Anksčiau: visi → vidurys tuščias plačiam map'e.)
  var _camCx = -1, _camCy = -1;
  // 📳 screenshake — paleidžiamas per sienos smūgį (savo) / griūtį; pridedamas prie kameros _centerCam'e.
  var _shakeMag = 0, _shakeUntil = 0, _shakeDur = 1;
  function _camShake(mag, durMs) { _shakeMag = mag; _shakeDur = durMs || 120; _shakeUntil = pnow() + (durMs || 120); }
  var _cvEl = null;   // ⚡ perf 07-06: canvas ref kešuojamas 1× (buvo getElementById KAS KADRĄ)
  function _centerCam() {
    var s = S(); if (!s || !s.cam) return;
    if (window._f9CamFree) return;   // 🖐️ user rankiniu drag-pan perėmė kamerą → NEperrašom (laisva kamera). Reset: scenos startas / double-tap grupė [1-6].
    var cv = _cvEl || (_cvEl = document.getElementById('canvas')); if (!cv) return;
    var cxs = 0, cys = 0, n = 0, axs = 0, ays = 0, an = 0;
    s.units.forEach(function (u) {
      if (u && u.alive && u._pvpId) {
        var X = (u.rx + 0.5) * B.CELL, Y = (u.ry + 0.5) * B.CELL;
        cxs += X; cys += Y; n++;
        if (u._pvpOwner === mySid) { axs += X; ays += Y; an++; }
      }
    });
    if (!n) return;
    // 🎥 Kamera seka PAŽYMĖTUS unitus (vieną ar kelis) — kaip ir visus pažymėjus. Likę unitai gali nueit už ekrano;
    //    paspaudus unitą apatiniam langelyje (jis pasižymi) → kamera nuslysta pas jį. Nieko nepažymėjus — visi mano unitai.
    var sel = (Array.isArray(window._f9SelectedSet) ? window._f9SelectedSet : []);
    var sxs = 0, sys = 0, sn = 0;
    for (var si = 0; si < sel.length; si++) {
      var su = sel[si];
      if (su && su.alive && su._pvpId && su._pvpOwner === mySid) { sxs += (su.rx + 0.5) * B.CELL; sys += (su.ry + 0.5) * B.CELL; sn++; }
    }
    var fx = sn ? sxs / sn : (an ? axs / an : cxs / n);
    var fy = sn ? sys / sn : (an ? ays / an : cys / n);
    var tx = fx - cv.width / 2, ty = fy - cv.height / 2;
    if (_camCx < 0) { _camCx = tx; _camCy = ty; } else { _camCx += (tx - _camCx) * 0.12; _camCy += (ty - _camCy) * 0.12; }
    s._camManualLock = true;
    // 📳 shake offset (decay²) — pridedam prie kameros pozicijos
    var sh = 0, shY = 0, _nt = pnow();
    if (_shakeUntil > _nt) { var k = (_shakeUntil - _nt) / _shakeDur; var m = _shakeMag * k * k; sh = (Math.random() * 2 - 1) * m; shY = (Math.random() * 2 - 1) * m; }
    s.cam.tx = _camCx + sh; s.cam.ty = _camCy + shY; s.cam.x = _camCx + sh; s.cam.y = _camCy + shY;
    if (!_hudHidden) _hud('YOU = blue · enemy = red · ' + n + ' units');   // ⚡ perf 07-06: hudEl visada paslėptas — nebestatom string+DOM write kas kadrą
  }

  var _ended = false;
  function stop() {
    on = false; started = false; simInited = false; _ended = false;
    window.__f9HomeActive = false;
    window.__f9BaseOwner = null;   // 📋 nebe konkrečioj pilyje → nuimam stendo savininką
    try { document.body.classList.remove('f9pvp-on'); } catch (_) {}
    window._f9pvpLive = false; window._f9pvpMyTeam = null;
    // 🐛 P-C3: išvalom ligoninės globalus išeinant (piniginės perjungimas/scenos išėjimas) — kad
    //   barracks_nft.fetchHospState nenaudotų SENOS sesijos sužalotų (deko sync šaltinis). null, NE [].
    window._f9Hospital = null; window._f9HospReady = 0; window._f9HospInsta = null; window._f9InstaReady = false; window._f9HospStale = 0; window._f9OnField = null; window._f9Reserve = null;
    window._f9Cap = null; window._f9CapState = null; _capLast = '';
    window._f9MyBones = null; _boneLast = ''; _boneShown = 0; _boneTargetPrev = 0; _boneSnapNext = true;   // 🦴 išeinant → reset (bankas liks, atsinaujins kitam start)
    if (boneEl) boneEl.style.display = 'none'; if (boneBalEl) boneBalEl.style.display = 'none';
    try { window.F9PVP && window.F9PVP.leave(); } catch (_) {}
    _mir = {};
    // 🐛 FIX (07-05): išvalom PvP mirror unitus IŠ S.units — kitaip perjungus piniginę seni gynėjai
    //   lieka masyve našlaičiai (alive=true) ir renderinasi = SENOS piniginės unitai lauke, nors
    //   inventorius (per-adresą) rodo naują. `_mir={}` vien neužtenka — orphan'ų valymas (1364) eina tik per _mir.
    try { var _GS = S(); if (_GS && Array.isArray(_GS.units)) _GS.units = _GS.units.filter(function (u) { return !(u && u._pvpId); }); } catch (_) {}
    if (statusEl && statusEl.parentNode) statusEl.parentNode.removeChild(statusEl);
    if (hudEl && hudEl.parentNode) hudEl.parentNode.removeChild(hudEl);
    if (capEl && capEl.parentNode) capEl.parentNode.removeChild(capEl);
    if (boneBalEl && boneBalEl.parentNode) boneBalEl.parentNode.removeChild(boneBalEl);
    statusEl = hudEl = capEl = boneBalEl = null;
    _boneNumEl = null; _boneNumTxt = '';   // ⚡ kešuotas span priklauso pašalintam boneBalEl → invaliduojam
    _clearScreen();
  }

  // Užkrauna žaidėjo REGISTRUOTĄ battle deck'ą (NFT) serveriui: [{utype:NAME, level, tokenId}].
  // 🧪 DEV: lokalus test squad kai nėra piniginės — kad asmeninę pilį galima testuoti IŠKART (be wallet jungimo).
  //    TIK localhost. Produkcijoj grąžina [] (žaidėjas mato savo NFT deck'ą kaip įprasta).
  function _isLocalDev() { try { return location.hostname === 'localhost' || location.hostname === '127.0.0.1'; } catch (_) { return false; } }
  function _devTestSquad() {
    // STABILŪS dev tokenId ('dev0'..) → būrių persistencija (localStorage) veikia ir be tikro NFT.
    // 🧪 TEST: 18 unitų (12 aktyvūs + 6 REZERVAS) → matomas reinforcement lokaliai. TIK localhost. PROD dekas = on-chain.
    var types = ['skull', 'archer', 'harpoon_fish', 'pigronke', 'shaman', 'ghost', 'ronhood'];
    var out = [];
    for (var i = 0; i < 18; i++) out.push({ utype: types[i % types.length], level: (i % 3) + 1, tokenId: 'dev' + i });
    return out;
  }
  // 🧪 PvP test deck — localhost BE piniginės → 12 dev unitų (prod deck cap). Kitaip [].
  function _pvpTestDeck() {
    try {
      var a = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || '';
      return (_isLocalDev() && !a) ? _devTestSquad() : [];
    } catch (_) { return []; }
  }
  function _loadHomeDeck(addr) {
    return new Promise(function (resolve) {
      // 🐛 07-05: dev test-būrys TIK kai NĖRA piniginės (tikras svečias). Su prijungta pinigine tuščias/
      //   nepavykęs dekas = TUŠČIA pilis (ne 7 fake unitai, kuriuos user palaiko „kito acc unitais").
      var fb = function () { resolve((_isLocalDev() && !addr) ? _devTestSquad() : []); };
      try {
        var BN = window.BarracksNFT;
        if (!addr || !BN || !BN.loadDeckUnits) { fb(); return; }
        // 🔐 PILYJE — TIK ON-CHAIN REGISTRUOTAS dekas (07-04 user: unitai pilyje atsiranda TIK po
        //   registracijos TX su pinigine). Lokaliai suredaguotas, bet NEužregistruotas dekas NESISKAITO.
        //   Sync iš grandinės (cross-device) → registered snapshot → Battle Squad tvarka (tik registruotiems).
        var syncP = Promise.resolve();
        try { if (BN.syncDeckFromChain) syncP = Promise.resolve(BN.syncDeckFromChain(addr, true)); } catch (_) {}   // force — VISADA šviežias iš grandinės
        syncP.catch(function () {}).then(function () {
          try {
            var registered = (BN.getRegisteredDeck && BN.getRegisteredDeck(addr)) || [];
            console.log('[F9Live] on-chain dekas: ' + registered.length + ' unitu (' + addr.slice(0, 10) + '…)');
            try { _castleStep('deck', 'done', registered.length + ' registered'); } catch (_) {}   // ⛓️→⚔️ etapas
            if (!registered.length) { fb(); return; }   // nieko neužregistruota TX → pilis be NFT garnizono
            var regSet = {};
            for (var r = 0; r < registered.length; r++) regSet[String(registered[r])] = 1;
            var battle = ((BN.getBattleSquad && BN.getBattleSquad(addr)) || []).filter(function (id) { return regSet[String(id)]; });
            var seen = {}, ids = [];
            for (var i = 0; i < battle.length; i++) { var b = String(battle[i]); if (!seen[b]) { seen[b] = 1; ids.push(battle[i]); } }
            for (var j = 0; j < registered.length; j++) { var f = String(registered[j]); if (!seen[f]) { seen[f] = 1; ids.push(registered[j]); } }
            if (!ids.length) { fb(); return; }
            var TYPE = { 1: 'skull', 2: 'archer', 3: 'harpoon_fish', 4: 'shaman', 5: 'pigronke', 6: 'ghost', 7: 'ronhood' };
            BN.loadDeckUnits(addr, ids).then(function (units) {
              var byId = {};
              (units || []).forEach(function (nu) { byId[String(nu.tokenId)] = nu; });
              var deck = [];   // išlaikom battle-first tvarką (serveris ima pirmus 12 kaip aktyvius)
              for (var k = 0; k < ids.length; k++) {
                var nu = byId[String(ids[k])]; if (!nu) continue;
                var ut = (typeof nu.utype === 'number') ? TYPE[nu.utype] : nu.utype;
                if (ut) deck.push({ utype: ut, level: nu.level || 0, tokenId: String(nu.tokenId || '') });
              }
              if (!deck.length) { fb(); return; }   // tuščias → dev fallback (localhost)
              resolve(deck);
            }).catch(fb);
          } catch (_) { fb(); }
        });
      } catch (_) { fb(); }
    });
  }
  // Laukia kol piniginė atsiras (auto-reconnect) iki maxMs. resolve(address|'').
  function _waitForWallet(maxMs) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function poll() {
        var a = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || '';
        if (a || Date.now() - t0 > maxMs) { resolve(a); return; }
        setTimeout(poll, 150);
      })();
    });
  }
  // 🏰 HOME — solo namų pilis: (palaukiam piniginės →) tavo NFT deck → createMatch({home,deck}) →
  //    serveris IŠKART spawnina pilį+TAVO unitus → match_start → _onStart. JOKIO lobby/oponento.
  function launchHome(opts) {
    opts = opts || {};
    B = window.__F9;
    if (!B) { console.error('[F9Live] __F9 bridge missing'); return; }
    if (!window.F9PVP) { console.error('[F9Live] F9PVP missing'); return; }
    on = true; started = false; simInited = false; _ended = false; _mir = {};
    try { var _GS0 = S(); if (_GS0 && Array.isArray(_GS0.units)) _GS0.units = _GS0.units.filter(function (u) { return !(u && u._pvpId); }); } catch (_) {}   // 🐛 07-05: jokių senų PvP orphan'ų prieš naują pilį
    window.__f9HomeActive = true;
    window._f9HomeLoaded = false;   // tampa true _onStart'e → reloadProfileForWallet relaunch'ina TIK po pilno užkrovimo (ne mid-load)
    var N = window.F9PVP;
    var _addr = opts.address || '';
    window._f9HomeAddr = _addr;
    _status('loading home…', '#fc8');
    _castleLoadScreen();   // 🏰 etapinis užkrovimo ekranas (rodo kas vyksta — ne „pakibęs" spinneris)
    var _connP = N.connect(opts.endpoint);   // ⚡ WS connect LYGIAGREČIAI su piniginės/deko krovimu (07-04)
    // 🏰 Auto-boot metu (pilis=žaidimas) piniginė dar atsistato (restore ~1-3s). LAUKIAM jos iki 8s,
    //   kad pilis krautųsi VIENĄ kartą su tikru deku — kitaip boot su '' → wallet grįžta → relaunch
    //   = DVIGUBAS lėtas krovimas (regresija 07-04). _waitForWallet resolve'ina IŠKART kai adresas atsiranda.
    _waitForWallet(_addr ? 0 : 8000).then(function (a) {
      _addr = _addr || a; window._f9HomeAddr = _addr;
      window.__f9BaseOwner = String(_addr || '').toLowerCase();   // 📋 esi SAVO pilyje → stendas = tavo (lokalus/own cloud)
      _lobbyName = _addr || rndAddr();
      try { _castleStep('wallet', 'done', _addr ? (_addr.slice(0, 6) + '…' + _addr.slice(-4)) : 'guest'); _castleSub('reading your registered units…'); } catch (_) {}
      return _loadHomeDeck(_addr);
    }).then(function (deck) {
      try { _castleStep('units', 'done', deck.length ? (deck.length + ' units') : 'none'); _castleSub('connecting to your realm…'); } catch (_) {}
      return _connP.then(function (ok) {
        if (!ok) { _status('connect failed', '#f88'); _castleSub('⚠ Connect failed — server offline?'); return null; }
        try { _castleStep('server', 'done'); _castleSub('raising the walls…'); } catch (_) {}
        var _act0 = _squadActiveCount(_addr);   // ⚔ pageidaujamas lauko dydis (persist per restart)
        var _cm = { name: _lobbyName, home: true, deck: deck, address: _addr, owner: String(_addr || '').toLowerCase() };
        if (_act0 > 0) _cm.active = _act0;
        return N.joinHome(_cm);   // 🏰 F1: joinOrCreate pagal owner (1 kambarys/savininkui), ne create() dublis
      });
    }).then(function (room) {
      if (!room) { _castleSub('⚠ Could not load your castle — reload to retry'); return; }
      mySid = room.sessionId;
      _wireRoom(room);   // serveris home → match_start iškart → _onStart → pilis renderinasi
      _status('home loaded', '#8f8');
    });
  }
  // ⚔ 07-06 user „laisvė palikti tik 1": kiek unitų NORI lauke = battle squad dydis (registruotų). 0 (nėra
  //   squad) → serveris default MAX_ACTIVE (12). Laukas = pirmi `active` iš deko (squad-first tvarka), likę = rezervas.
  function _squadActiveCount(addr) {
    try {
      var BN = window.BarracksNFT;
      if (!BN || !BN.getBattleSquad || !BN.getRegisteredDeck) return 0;
      var reg = {}; (BN.getRegisteredDeck(addr) || []).forEach(function (id) { reg[String(id)] = 1; });
      var n = 0; (BN.getBattleSquad(addr) || []).forEach(function (id) { if (reg[String(id)]) n++; });
      return n;   // 0 → klientas nesiųs active → serveris naudos default 12
    } catch (_) { return 0; }
  }
  // 🏰 SKLANDUS squad keitimas — siunčiam naują deck'ą room'ui (server re-spawnina spawn spotuose,
  //    seni unitai DINGSTA, nauji ATSIRANDA per state sync) — JOKIO scenos reload/flicker.
  function updateHomeSquad() {
    if (!window.__f9HomeActive) return;
    var addr = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || window._f9HomeAddr || '';
    _loadHomeDeck(addr).then(function (deck) {
      var room = (window.F9PVP && window.F9PVP.room) ? window.F9PVP.room : null;
      if (room && typeof room.send === 'function') {
        // fresh:true → serveris invaliduoja 120s chain-kešą (kitaip ką tik registruoti unitai
        // atmetami pagal SENĄ deko snapshot'ą ir atsiranda tik po restarto; 07-04)
        var _act = _squadActiveCount(addr);   // ⚔ kiek NORI lauke (0 → default 12)
        try { var _m = { deck: deck, fresh: true }; if (_act > 0) _m.active = _act; room.send('set_squad', _m); window._f9HomeAddr = addr; }
        catch (e) { console.warn('[F9Live] set_squad failed → relaunch', e); relaunchHome(); }
      } else { relaunchHome(); }   // fallback (jei room dingo) — pilnas reload
    });
  }
  // 🏗️ Sienos/bokštų upgrade — siunčiam serveriui (tik home owner; serveris validuoja+atnaujina).
  function upgradeWall() {
    var room = (window.F9PVP && window.F9PVP.room) ? window.F9PVP.room : null;
    if (room && typeof room.send === 'function') { try { room.send('upgrade_wall'); } catch (_) {} }
  }
  function upgradeHospital() {
    var r = _room(); if (r) { try { r.send('upgrade_hospital'); } catch (_) {} }
  }
  // 🛡 Savininkas nusiima skydą (nori būti puolamas anksčiau) — serveris validuoja owner.
  function removeShield() {
    var r = _room(); if (r) { try { r.send('shield_remove'); } catch (_) {} }
  }
  function upgradeTowers() {
    var room = (window.F9PVP && window.F9PVP.room) ? window.F9PVP.room : null;
    if (room && typeof room.send === 'function') { try { room.send('upgrade_towers'); } catch (_) {} }
  }
  function buildTower(y) {
    var room = (window.F9PVP && window.F9PVP.room) ? window.F9PVP.room : null;
    if (room && typeof room.send === 'function') { try { room.send('build_tower', { y: y }); } catch (_) {} }
  }

  // Prisijungus/pakeitus piniginę pilyje → perkraunam home su nauju deck'u (debounce).
  function relaunchHome() {
    if (window._f9HomeRelaunchPending) return;
    window._f9HomeRelaunchPending = true;
    var addr = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || '';
    try { stop(); } catch (_) {}
    setTimeout(function () { window._f9HomeRelaunchPending = false; launchHome({ address: addr }); }, 200);
  }

  // ⚠️ 07-14 RECONNECT WATCHDOG + KEEPALIVE + 🟢🔴 STATUSO BADGE (user: „buvau užpultas online, priešo
  //   nesimatė; sunku atskirti ar online; langas ilgai atidarytas → disconnect; reikia indikatoriaus/mygtuko"):
  //   pingInterval:0 + zombie-reaper = kambarys numiršta arba socket'as PAKIMBA PUSIAUKELĖJE (gauni
  //   under_attack, bet būsena nebeateina → priešo nematai), o ekranas toliau rodo pilį.
  //   (1) KEEPALIVE ping kas 20s (serveris ping'u atnaujina reaper laikmatį → ramus žaidėjas nenukertamas).
  //   (2) PONG-LIVENESS: jei „gyvas" kambarys >65s neatsako pong'ų → socket'as pusiau miręs → force reconnect.
  //   (3) WATCHDOG: kambarys dingo → raudonas baneris su ⟳ RECONNECT mygtuku + auto relaunchHome kas ~7s.
  //   (4) BADGE: nuolatinis 🟢 ONLINE / 🟡 CONNECTING / 🔴 OFFLINE indikatorius (klik = force reconnect).
  var _rcEl = null, _rcWasAlive = false, _rcLastTry = 0, _rcLastPing = 0, _rcBadge = null;
  function _rcForceReconnect() {
    _rcLastTry = Date.now();
    try { var N = window.F9PVP; if (N && N.room) N.room.leave(); } catch (_) {}
    try { relaunchHome(); } catch (_) {}
  }
  function _rcShow() {
    if (_rcEl) return;
    _rcEl = document.createElement('div');
    _rcEl.id = 'f9-reconnect-banner';
    _rcEl.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:100002;display:flex;align-items:center;gap:14px;' +
      'padding:11px 16px;border-radius:8px;border:2px solid #ff5555;background:rgba(60,10,10,0.95);' +
      "color:#ffb3b3;font:700 12px 'Press Start 2P',monospace,sans-serif;letter-spacing:1px;box-shadow:0 0 18px rgba(255,60,60,0.5);";
    _rcEl.innerHTML = '<span id="f9rc-txt">⚠ CONNECTION LOST — RECONNECTING…</span>' +
      '<button id="f9rc-btn" style="padding:8px 12px;border-radius:6px;border:2px solid #ffcf5c;background:rgba(255,207,92,0.15);color:#ffcf5c;font:700 11px inherit;font-family:inherit;cursor:pointer;white-space:nowrap;">⟳ RECONNECT</button>';
    document.body.appendChild(_rcEl);
    var btn = _rcEl.querySelector('#f9rc-btn'); if (btn) btn.onclick = _rcForceReconnect;
    var vis = true;
    _rcEl._blink = setInterval(function () { var t = _rcEl && _rcEl.querySelector('#f9rc-txt'); if (t) { vis = !vis; t.style.opacity = vis ? '1' : '0.55'; } }, 550);
  }
  function _rcHide() { if (_rcEl) { try { clearInterval(_rcEl._blink); } catch (_) {} if (_rcEl.parentNode) _rcEl.parentNode.removeChild(_rcEl); _rcEl = null; } }
  // 🟢🟡🔴 badge PAŠALINTAS (07-15 user: „maišo, neatspindi nieko“) — no-op, tik nuima jei senas dar kabo.
  //   Raudonas CONNECTION LOST baneris (_rcShow) lieka — jis rodomas TIK realiai nutrūkus ryšiui.
  function _rcBadgeSet(state) {
    void state;
    if (_rcBadge && _rcBadge.parentNode) _rcBadge.parentNode.removeChild(_rcBadge);
    _rcBadge = null;
  }
  setInterval(function () {
    try {
      if (!window.__f9HomeActive || window.__f9RaidActive) {
        if (!window._f9HomeRelaunchPending) { _rcWasAlive = false; _rcHide(); }
        _rcBadgeSet(window.__f9RaidActive ? (window.F9PVP && window.F9PVP.room ? 'on' : 'connecting') : null);
        return;
      }
      var N = window.F9PVP;
      var alive = !!(N && N.room && N.connected);
      var now = Date.now();
      if (alive) {
        // 🫀 pong-liveness: „gyvas" kambarys, bet >65s jokio pong (ping'uojam kas 20s) → socket pusiau miręs
        if (N.lastPong && now - N.lastPong > 65000) {
          _rcBadgeSet('off'); _rcShow();
          if (now - _rcLastTry > 7000) _rcForceReconnect();
          return;
        }
        _rcWasAlive = true; _rcHide(); _rcBadgeSet('on');
        if (now - _rcLastPing > 20000) { _rcLastPing = now; try { N.ping(); } catch (_) {} }   // 🫀 keepalive
        return;
      }
      if (!_rcWasAlive) { _rcBadgeSet('connecting'); return; }   // dar tik jungiamasi (boot)
      _rcBadgeSet('off'); _rcShow();
      if (now - _rcLastTry > 7000) { _rcLastTry = now; try { relaunchHome(); } catch (_) {} }
    } catch (_) {}
  }, 3000);

  // 🗡️ RAID — puolam KITO žaidėjo pilį (LIVE). Užkraunam MŪSŲ deck'ą, jungiamės kaip puolikas į
  //    taikinio kambarį (filterBy owner). Taikinys offline / nėra kambario → raidPlayer null (vėliau=async).
  function launchRaid(targetAddr, opts) {
    opts = opts || {};
    B = window.__F9;
    if (!B) { console.error('[F9Live] __F9 bridge missing'); return; }
    if (!window.F9PVP) { console.error('[F9Live] F9PVP missing'); return; }
    var target = String(targetAddr || '').trim().toLowerCase();
    if (!target) { console.warn('[F9Live] launchRaid: no target'); return; }
    try { stop(); } catch (_) {}   // paliekam SAVO pilį (home room) prieš puolant svetimą
    on = true; started = false; simInited = false; _ended = false; _mir = {};
    window.__f9HomeActive = false; window.__f9RaidActive = true; window.__f9RaidTarget = target;
    window.__f9BaseOwner = target;   // 📋 esi TAIKINIO pilyje → stendas = JO (krauna iš cloud per Boards.loadForWallet)
    window._f9HomeLoaded = false;
    var N = window.F9PVP;
    var _addr = opts.address || (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || '';
    _status('raiding…', '#f86');
    _connectingScreen('Attacking ' + target.slice(0, 6) + '…' + target.slice(-4) + '…');
    _waitForWallet(_addr ? 0 : 2500).then(function (a) {
      _addr = _addr || a;
      _lobbyName = _addr || rndAddr();
      return _loadHomeDeck(_addr);   // MŪSŲ battle squad = puoliko unitai
    }).then(function (deck) {
      // ⚔️💰 RAID FEE (07-12 user): 10 RONKE → treasury, moka TIK puolikas, už KIEKVIENĄ raidą.
      //   Lokaliame dev (localhost) fee išjungtas (serveris be RAID_FEE_RONKE env). Nepanaudotas TX
      //   (atmestas join — SHIELDED/CD) saugomas localStorage ir panaudojamas kitam bandymui.
      var _isLocal = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
      var _feeKey = 'f9_raidfee_' + String(_addr || '').toLowerCase();
      var _feeP;
      if (_isLocal) _feeP = Promise.resolve('');
      else {
        var _storedFee = '';
        try { _storedFee = localStorage.getItem(_feeKey) || ''; } catch (_) {}
        if (_storedFee) { _feeP = Promise.resolve(_storedFee); }   // nepanaudotas ankstesnis fee TX
        else {
          _connectingText('⚔️ Raid fee: 10 RONKE → treasury… confirm in wallet');
          _feeP = window.BarracksNFT.payRaidFee(10).then(function (h) {
            try { localStorage.setItem(_feeKey, h); } catch (_) {}
            return h;
          });
        }
      }
      return _feeP.then(function (feeTx) {
        _connectingText('Attacking — ' + (deck.length ? deck.length + ' units…' : '…'));
        return N.connect(opts.endpoint).then(function (ok) {
          if (!ok) { _status('connect failed', '#f88'); _connectingText('⚠ Connect failed — server offline?'); return null; }
          var _ra = _squadActiveCount(_addr);   // ⚔ puoliko pageidaujamas aktyvių dydis (kaip pilyje)
          var _ro = { deck: deck, address: _addr };
          if (_ra > 0) _ro.active = _ra;
          if (feeTx) _ro.feeTx = feeTx;
          return N.raidPlayer(target, _ro);
        });
      }, function (payErr) {
        _connectingText('⚠ Raid fee payment failed / rejected — raid cancelled');
        try { if (window.showGameNotification) window.showGameNotification('⚔️ RAID', 'Fee payment failed: ' + String((payErr && payErr.message) || payErr).slice(0, 80), '#f66'); } catch (_) {}
        window.__f9RaidActive = false;
        setTimeout(function () { try { relaunchHome(); } catch (_) {} }, 1800);
        return null;
      });
    }).then(function (room) {
      if (!room) {
        // 🛡⏲ serverio atmetimo priežastis (SHIELDED:min / RAID_COOLDOWN:min / NO_DEFENDERS / RAID_FEE) → aiški žinutė
        var em = String((N.lastError && N.lastError.message) || '');
        var msg = '⚠ Target offline / no castle — live raid not possible (async later)';
        if (em.indexOf('SHIELDED') !== -1) msg = '🛡 Castle is SHIELDED (just raided) — try again in ' + (em.split(':')[1] || '?') + ' min';
        else if (em.indexOf('RAID_COOLDOWN') !== -1) msg = '⏲ You raided this castle recently — wait ' + (em.split(':')[1] || '?') + ' min';
        else if (em.indexOf('NO_DEFENDERS') !== -1) msg = '💤 Castle inactive — no combat-ready NFT defenders to raid';
        else if (em.indexOf('DEFENDER_ONLINE') !== -1) msg = '🫀 Defender is online (reconnecting) — retry in a few seconds to fight them LIVE';
        else if (em.indexOf('RAID_IN_PROGRESS') !== -1) msg = '⚔️ This castle is already under attack — one raider at a time. Try again in a moment.';
        else if (em.indexOf('SAFE_MODE') !== -1) msg = '🛡 This castle is in SAFE mode — protected after a battle (they must switch back to ON DUTY to be raidable).';
        else if (em.indexOf('RAID_FEE') !== -1) {
          // ⚔️💰 fee TX atmestas (panaudotas/pasenęs/nerastas) → išvalom saugotą, kitas bandymas mokės iš naujo
          var _fa = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || '';
          try { localStorage.removeItem('f9_raidfee_' + String(_fa).toLowerCase()); } catch (_) {}
          msg = '⚔️💰 Raid fee issue (' + (em.split(':')[1] || '?') + ') — try again, a fresh 10 RONKE payment will be requested';
        }
        _connectingText(msg);
        try { if (window.showGameNotification) window.showGameNotification('⚔️ RAID', msg, '#e8a54a'); } catch (_) {}
        window.__f9RaidActive = false;
        // grįžtam namo (buvom stop'inę savo pilį prieš puolimą)
        setTimeout(function () { try { relaunchHome(); } catch (_) {} }, 1800);
        return;
      }
      // ⚔️💰 raidas PRASIDĖJO → fee TX sunaudotas serveryje, išvalom saugotą (kitam raidui — naujas mokėjimas)
      try { var _fa2 = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || ''; localStorage.removeItem('f9_raidfee_' + String(_fa2).toLowerCase()); } catch (_) {}
      mySid = room.sessionId;
      _wireRoom(room);
      _status('⚔ raid started', '#f86');
    });
  }

  window.F9PvpLive = {
    launch: launch, launchHome: launchHome, relaunchHome: relaunchHome, launchRaid: launchRaid, updateHomeSquad: updateHomeSquad, upgradeWall: upgradeWall, upgradeTowers: upgradeTowers, upgradeHospital: upgradeHospital, removeShield: removeShield, buildTower: buildTower, stop: stop,
    isActive: active,
    netTick: netTick,
    sendCommand: sendCommand,
    sendAttack: sendAttack,
    // ── back-compat shim'ai (game.js hooks naudoja šituos; abu klientai = „guest"-stiliaus) ──
    isHost: function () { return false; },
    isGuest: function () { return active(); },   // true ABIEM → loop renderina, NEsukа lokalaus simo
    guestTick: netTick,                          // game.js: if(isGuest()) guestTick(now) → render iš serverio
    routeCommand: function (type, units, tx, ty) { return sendCommand(type, units, tx, ty); },
    routeCommandPts: function (type, units, pts) { return sendCommandPts(type, units, pts); },
    // ⊞ REGROUP formacija: per-unit pozicijos (ids ↔ pts aligned, klientas suskaičiavo formą).
    routeRegroupFormation: function (ids, pts) {
      if (!active() || !ids || !ids.length) return false;
      try { window.F9PVP.room.send('cmd', { action: 'regroup', ids: ids, pts: pts }); } catch (_) {}
      return true;
    },
    hostTick: function () {},                    // nebenaudojama (serveris simuliuoja)
  };
})();
