// web3ui.js — RonkePong start/game-over MENIU overlay (DOM): wallet connect, „PAY 15 RONKE & PLAY",
// globalus TOP-20 leaderboard. Naudoja window.RPWeb3 (logika). Player-facing tekstas — ANGLŲ.
(function () {
  'use strict';
  const W3 = window.RPWeb3;
  if (!W3) return;

  let game = null, root = null, els = {}, mode = 'start', lastRun = null, boardFrom = 'start', boardMetric = 'score';

  const CSS = `
  #rp-menu{position:fixed;inset:0;z-index:30;display:none;flex-direction:column;
    font-family:'Courier New',ui-monospace,monospace;color:#e8dcc0;-webkit-user-select:none;user-select:none;image-rendering:pixelated;}
  #rp-menu.show{display:flex;}
  /* GAME-OVER + BOARD peržiūra: tamsus fonas + centruota PILNA kortelė su leaderboard'u */
  #rp-menu.mode-over,#rp-menu.mode-board{align-items:center;justify-content:center;padding:14px;overflow:auto;
    background:rgba(6,5,11,0.92);}
  /* BOARD peržiūra (trofėjaus mygtukas): rodom TIK leaderboard — slepiam PLAY, subtitrą, wallet */
  #rp-menu.mode-board #rp-play,#rp-menu.mode-board #rp-sub,#rp-menu.mode-board #rp-wallet,#rp-menu.mode-board #rp-status{display:none;}
  /* STARTAS: fonas SKAIDRUS (žaidimas matosi) + CENTRUOTAS gražus PLAY „herojus" */
  #rp-menu.mode-start{align-items:center;justify-content:center;padding:12px;background:transparent;pointer-events:none;}
  #rp-menu.mode-start #rp-card{pointer-events:auto;}
  /* Akmens plokštė: pikselinis rėmas (tamsus→auksas→tamsus) + KIETAS drop-shadow; jokių apvalinimų/blur */
  #rp-card{position:relative;width:100%;max-width:500px;background:#16213c;padding:26px 26px 22px;text-align:center;
    border:16px solid transparent;border-image:url('uikit_panel.png') 24 fill / 16px / 0 stretch;
    box-shadow:8px 10px 0 rgba(0,0,0,0.5);}
  #rp-close{position:absolute;top:-6px;right:-6px;z-index:5;width:30px;height:30px;padding:0;cursor:pointer;
    font-family:inherit;font-size:16px;font-weight:bold;line-height:1;color:#ffe0e0;
    background:linear-gradient(180deg,#c0413f,#7a1f1f);border:2px solid #3a0e0e;border-radius:6px;
    box-shadow:inset 0 2px 0 rgba(255,150,150,0.4),0 2px 0 #2a0808,0 0 0 2px #0a1120;}
  #rp-close:hover{background:linear-gradient(180deg,#e05250,#9a2626);}
  #rp-close:active{transform:translateY(1px);}
  #rp-menu.mode-start #rp-close{display:none;}
  /* STARTAS: TIK vienas ▶ PLAY mygtukas — jokio pavadinimo/užrašo/plokštės (žaidimas matosi pro šalį) */
  #rp-menu.mode-start #rp-card{max-width:none;width:auto;padding:0;background:none;box-shadow:none;border:0;border-image:none;}
  #rp-menu.mode-start #rp-card h1,#rp-menu.mode-start #rp-sub,#rp-menu.mode-start #rp-wallet,
  #rp-menu.mode-start #rp-secondary,#rp-menu.mode-start .rp-tabs,#rp-menu.mode-start #rp-board,
  #rp-menu.mode-start .rp-mini{display:none;}
  #rp-menu.mode-start #rp-status{min-height:0;margin:10px 0 0;text-align:center;}
  /* PLAY = SPRITE mygtukas (green_play_glow_sheet, 8 kadrai, bg pašalintas rembg). Kadrą 0 rodo ramybėj;
     animacija (mėlyna→žalia švytėjimas) grojama PASPAUDUS per JS (playSprite). Hover PAKYLA, paspaudus NUSILEIDŽIA. */
  #rp-menu.mode-start #rp-play{width:150px;height:150px;padding:0;margin:0;font-size:0;color:transparent;border:0;
    background:transparent url('play_button_sheet.png') no-repeat 0% 0%;background-size:800% 100%;box-shadow:none;
    image-rendering:auto;filter:drop-shadow(3px 5px 4px rgba(0,0,0,0.55));cursor:pointer;
    transition:transform .1s ease-out, filter .14s ease-out;}
  #rp-menu.mode-start #rp-play:hover{transform:translateY(-3px) scale(1.05);box-shadow:none;
    filter:drop-shadow(4px 8px 6px rgba(0,0,0,0.6)) brightness(1.08);}
  #rp-menu.mode-start #rp-play:active{transform:translateY(2px) scale(0.97);box-shadow:none;}
  /* Pavadinimas: kietas auksinis pixel-emboss (be gradientų) */
  #rp-card h1{margin:0 0 10px;font-size:24px;font-weight:bold;letter-spacing:3px;color:#8fe4ff;
    text-shadow:2px 2px 0 #17475e, 3px 3px 0 #05070d;}
  #rp-sub{font-size:11px;color:#9aa4c4;margin-bottom:14px;min-height:14px;line-height:1.4;}
  #rp-sub b{color:#6effa0;}
  .rp-wallet{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px;font-size:11px;flex-wrap:wrap;}
  .rp-addr{background:#0f0d18;border:0;border-radius:0;box-shadow:0 0 0 2px #3a4560;padding:4px 9px;color:#bfe8ff;}
  .rp-bal{color:#7be0ff;font-weight:bold;}
  /* Pikseliniai mygtukai: kietas kontūras + bevel (viršus šviesus / apačia tamsi) + kietas drop-shadow */
  button.rp-btn{font-family:inherit;font-weight:bold;text-transform:uppercase;letter-spacing:1px;cursor:pointer;
    border:0;border-radius:0;color:#eafff2;padding:0;text-shadow:1px 1px 0 rgba(0,0,0,0.45);}
  button.rp-btn:active{transform:translate(2px,2px);}
  .rp-connect{font-size:11px;padding:7px 12px;background:#2c3550;color:#cfe0ff;
    box-shadow:inset 0 2px 0 #46527a, inset 0 -3px 0 #161c2e, 0 0 0 3px #090c16, 4px 5px 0 3px rgba(0,0,0,0.45);}
  .rp-connect:active{box-shadow:inset 0 2px 0 #46527a, inset 0 -3px 0 #161c2e, 0 0 0 3px #090c16, 2px 3px 0 3px rgba(0,0,0,0.45);}
  /* Plieno-mėlynas PLAY (dera su portalu/rutuliais/FLOOR HUD) — jokio aukso */
  .rp-play,.rp-play.pay{width:100%;font-size:15px;padding:13px 10px;margin:6px 3px;background:#2f6fa8;color:#eaf6ff;
    box-shadow:inset 0 3px 0 #62a3da, inset 0 -4px 0 #174a75, 0 0 0 3px #05131f, 5px 6px 0 3px rgba(0,0,0,0.5);}
  .rp-play:active,.rp-play.pay:active{box-shadow:inset 0 3px 0 #62a3da, inset 0 -4px 0 #174a75, 0 0 0 3px #05131f, 2px 3px 0 3px rgba(0,0,0,0.5);}
  .rp-play:disabled{background:#2a2f3a;color:#6a6f88;cursor:not-allowed;
    box-shadow:inset 0 3px 0 #3a4152, inset 0 -4px 0 #191d26, 0 0 0 3px #0a0c12, 5px 6px 0 3px rgba(0,0,0,0.4);}
  #rp-status{font-size:10.5px;min-height:15px;margin:6px 0 10px;color:#9aa4c4;line-height:1.4;}
  #rp-status.err{color:#ff8f8f;} #rp-status.ok{color:#6effa0;}
  /* Du leaderboard tab'ai: 🏆 BEST (rekordas) / Σ TOTAL (bendras kaupiamas) — pikseliniai */
  .rp-tabs{display:flex;gap:6px;margin:12px 0 8px;border-top:3px solid #3a3d4a;padding-top:12px;}
  .rp-tab{flex:1;font-family:inherit;font-weight:bold;text-transform:uppercase;letter-spacing:1px;font-size:10.5px;
    cursor:pointer;border:0;border-radius:0;padding:7px 4px;background:#20242f;color:#8a93a8;
    box-shadow:inset 0 -3px 0 #12151d, 0 0 0 2px #05070d;text-shadow:1px 1px 0 rgba(0,0,0,0.4);}
  .rp-tab:active{transform:translateY(1px);}
  .rp-tab.rp-tab-on{background:#2f6fa8;color:#eaf6ff;box-shadow:inset 0 2px 0 #62a3da, inset 0 -3px 0 #174a75, 0 0 0 2px #05131f;}
  #rp-board{font-size:12px;text-align:left;max-height:min(60vh,600px);overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:#c8a03a rgba(10,17,32,0.55);}
  #rp-board::-webkit-scrollbar{width:10px;}
  #rp-board::-webkit-scrollbar-track{background:rgba(10,17,32,0.55);border-radius:5px;box-shadow:inset 0 0 0 1px #223350;}
  #rp-board::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#e6bd57,#a87f2a);border-radius:5px;
    border:1px solid #0a1120;box-shadow:inset 0 1px 0 rgba(255,240,190,0.5);}
  #rp-board::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#f4cd64,#c09230);}
  /* Prizų legenda virš lentelės */
  .rp-poolline{font-size:13px;color:#9fb4cc;text-align:center;margin:2px 0 12px;padding:11px 12px;
    background:rgba(10,14,24,0.6);box-shadow:inset 0 0 0 1px #2a3346;}
  .rp-poolline b{color:#8fffb0;}
  /* board pavadinimas ilgesnis („WEEKLY LEADERBOARDS") → mažesnis šriftas, kad tilptų */
  #rp-menu.mode-board #rp-card h1{font-size:20px;letter-spacing:2px;}
  .rp-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:0;border-bottom:1px solid rgba(90,100,130,0.12);}
  .rp-row.me{background:rgba(110,255,160,0.14);box-shadow:inset 0 0 0 2px rgba(110,255,160,0.5);}
  .rp-row.g1{background:rgba(190,232,255,0.08);} .rp-row.g2{background:rgba(216,221,232,0.06);} .rp-row.g3{background:rgba(143,168,192,0.06);}
  .rp-rank{flex:0 0 30px;color:#7f8ba0;font-weight:bold;text-align:center;font-size:17px;}
  .rp-mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}
  .rp-raddr{color:#bfe8ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;}
  .rp-prize{font-size:12.5px;color:#8fb0c8;display:flex;gap:4px;flex-wrap:wrap;align-items:center;}
  .rp-prize .pz-u{color:#cfe0ff;} .rp-prize .pz-c{color:#e6a6cf;} .rp-prize .pz-b{color:#dfe6f4;} .rp-prize .pz-sep{color:#4a5468;}
  .rp-ronke{color:#8fffb0;font-weight:bold;}
  .rp-rscore{flex:0 0 auto;color:#7be0ff;font-weight:bold;font-size:17px;text-align:right;}
  /* tuščias prizinis slotas (dar nėra žaidėjo) — prizas matomas, tik pritemdytas */
  .rp-row.rp-open{opacity:0.6;}
  .rp-open-lbl{color:#6a7488;font-style:italic;}
  .rp-dim{color:#5a6478;}
  .rp-empty{color:#8a8266;text-align:center;padding:16px;}
  /* Prizo žetonas: hover pažymi + kursorius; paspaudus → info popup */
  .pz-tok{cursor:pointer;border-bottom:1px dotted rgba(143,180,200,0.4);}
  .pz-tok:hover{filter:brightness(1.4);border-bottom-color:currentColor;text-shadow:0 0 4px rgba(143,220,255,0.5);}
  #rp-info{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;
    background:rgba(4,4,10,0.62);padding:20px;font-family:'Courier New',ui-monospace,monospace;}
  #rp-info.show{display:flex;}
  #rp-info .box{position:relative;width:100%;max-width:320px;padding:26px 22px 22px;text-align:center;
    background:linear-gradient(180deg,#1c2740,#0e1524);border:3px solid #33507a;border-radius:4px;
    box-shadow:0 0 0 3px #0a1120,inset 0 0 0 2px #1a2c4a,inset 0 0 22px rgba(60,110,180,0.12),8px 10px 0 rgba(0,0,0,0.5);}
  #rp-info .gem{position:absolute;top:-8px;left:50%;transform:translateX(-50%) rotate(45deg);width:13px;height:13px;
    background:linear-gradient(135deg,#7fccff,#2a6fd0);border:2px solid #0a1120;box-shadow:0 0 9px rgba(90,180,255,0.75);}
  #rp-info .cnr{position:absolute;width:15px;height:15px;border:3px solid #e0b34a;}
  #rp-info .cnr.tl{top:5px;left:5px;border-right:0;border-bottom:0;}
  #rp-info .cnr.tr{top:5px;right:5px;border-left:0;border-bottom:0;}
  #rp-info .cnr.bl{bottom:5px;left:5px;border-right:0;border-top:0;}
  #rp-info .cnr.br{bottom:5px;right:5px;border-left:0;border-top:0;}
  #rp-info .it{font-size:22px;font-weight:bold;color:#eef6ff;letter-spacing:1px;margin-bottom:6px;
    text-shadow:2px 2px 0 #05070d,0 0 11px rgba(120,180,255,0.4);}
  #rp-info .it-div{height:2px;width:60%;margin:0 auto 14px;background:linear-gradient(90deg,transparent,#3a5a8a,transparent);}
  #rp-info .tx{font-size:14px;color:#dfe8f6;line-height:1.75;margin-bottom:18px;}
  #rp-info .ib-ok{width:100%;font-family:inherit;font-weight:bold;text-transform:uppercase;letter-spacing:1px;
    cursor:pointer;border:0;border-radius:0;color:#eaf6ff;font-size:14px;padding:11px;background:#2f6fa8;
    box-shadow:inset 0 3px 0 #62a3da,inset 0 -4px 0 #174a75,0 0 0 3px #05131f,4px 5px 0 3px rgba(0,0,0,0.5);}
  #rp-info .ib-ok:active{transform:translate(2px,2px);box-shadow:inset 0 3px 0 #62a3da,inset 0 -4px 0 #174a75,0 0 0 3px #05131f,1px 2px 0 3px rgba(0,0,0,0.5);}
  .rp-mini{font-size:9px;color:#5a6488;margin-top:8px;}
  .rp-link{color:#7f8bb0;cursor:pointer;text-decoration:underline;}
  /* Antrinis mygtukas: board režime = „◀ BACK" (pikselinis) */
  .rp-secondary{width:100%;font-size:12px;letter-spacing:1px;padding:9px;margin:10px 3px 2px;background:#2c3550;color:#cfe0ff;
    box-shadow:inset 0 2px 0 #46527a, inset 0 -3px 0 #161c2e, 0 0 0 3px #090c16, 4px 5px 0 3px rgba(0,0,0,0.45);}
  .rp-secondary:active{box-shadow:inset 0 2px 0 #46527a, inset 0 -3px 0 #161c2e, 0 0 0 3px #090c16, 2px 3px 0 3px rgba(0,0,0,0.45);}
  #rp-secondary{display:none;}
  #rp-menu.mode-board #rp-secondary,#rp-menu.mode-over #rp-secondary{display:block;}`;

  function build() {
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    root = document.createElement('div'); root.id = 'rp-menu';
    root.innerHTML =
      '<div id="rp-card">' +
      '<button id="rp-close" title="Close">✕</button>' +
      '<h1>RONKEPONG</h1>' +
      '<div id="rp-sub"></div>' +
      '<div class="rp-wallet" id="rp-wallet"></div>' +
      '<button class="rp-btn rp-play" id="rp-play"></button>' +
      '<button class="rp-btn rp-secondary" id="rp-secondary"></button>' +
      '<div id="rp-status"></div>' +
      '<div class="rp-tabs">' +
        '<button class="rp-tab rp-tab-on" id="rp-tab-best">🏆 BEST</button>' +
        '<button class="rp-tab" id="rp-tab-total">Σ TOTAL</button>' +
      '</div>' +
      '<div id="rp-board"><div class="rp-empty">loading…</div></div>' +
      '<div class="rp-mini" id="rp-mini"></div>' +
      '</div>';
    document.body.appendChild(root);
    els.sub = root.querySelector('#rp-sub');
    els.wallet = root.querySelector('#rp-wallet');
    els.play = root.querySelector('#rp-play');
    els.status = root.querySelector('#rp-status');
    els.board = root.querySelector('#rp-board');
    els.mini = root.querySelector('#rp-mini');
    els.secondary = root.querySelector('#rp-secondary');
    els.card = root.querySelector('#rp-card');
    els.title = root.querySelector('#rp-card h1');
    els.tabBest = root.querySelector('#rp-tab-best');
    els.tabTotal = root.querySelector('#rp-tab-total');
    els.play.addEventListener('click', onPlay);
    els.secondary.addEventListener('click', onSecondary);
    // ✕ uždarymas: embed board-only (iš RonkeGorilla 🏆) → išeinam į pilį; kitaip → BACK (tęsiam žaidimą)
    els.close = root.querySelector('#rp-close');
    els.close.addEventListener('click', function () {
      if (/[?&]board=1/.test(location.search) && mode === 'board') { try { parent.postMessage({ type: 'rp_exit' }, '*'); } catch (_) {} }
      else onSecondary();
    });
    els.tabBest.addEventListener('click', () => setMetric('score'));
    els.tabTotal.addEventListener('click', () => setMetric('total'));
    // Prizo info: paspaudus prizą eilutėj → popup su paaiškinimu (event delegation).
    els.board.addEventListener('click', function (ev) {
      const t = ev.target.closest && ev.target.closest('[data-info]');
      if (t) showInfo(t.getAttribute('data-info'));
    });
    // Info popup elementas (kuriamas kartą)
    const info = document.createElement('div'); info.id = 'rp-info';
    info.innerHTML = '<div class="box"><span class="gem"></span><span class="cnr tl"></span><span class="cnr tr"></span><span class="cnr bl"></span><span class="cnr br"></span>' +
      '<div class="it"></div><div class="it-div"></div><div class="tx"></div><button class="ib-ok">OK</button></div>';
    document.body.appendChild(info);
    els.info = info; els.infoIt = info.querySelector('.it'); els.infoTx = info.querySelector('.tx');
    info.addEventListener('click', function (ev) { if (ev.target === info || ev.target.classList.contains('ib-ok')) hideInfo(); });
    window.addEventListener('resize', positionStart);   // startе mygtukas seka canvas (flipperių lygį)
    W3.onChange(renderWallet);
    W3.restore();   // tylus atkūrimas (jei jau prisijungęs)
  }

  function setStatus(msg, cls) { els.status.textContent = msg || ''; els.status.className = cls || ''; }

  function renderWallet(s) {
    els.wallet.innerHTML = '';
    if (s.connected) {
      const a = document.createElement('span'); a.className = 'rp-addr'; a.textContent = W3.short(s.address);
      const b = document.createElement('span'); b.className = 'rp-bal'; b.textContent = Math.floor(s.balance) + ' RONKE';
      const d = document.createElement('span'); d.className = 'rp-link'; d.textContent = 'disconnect';
      d.onclick = () => W3.disconnect();
      els.wallet.appendChild(a); els.wallet.appendChild(b); els.wallet.appendChild(d);
    } else {
      const c = document.createElement('button'); c.className = 'rp-btn rp-connect'; c.textContent = 'CONNECT WALLET';
      c.onclick = doConnect;
      els.wallet.appendChild(c);
      if (!s.hasProvider) { const w = document.createElement('span'); w.className = 'rp-mini'; w.textContent = 'no Ronin wallet detected'; els.wallet.appendChild(w); }
    }
    updatePlayBtn(s);
  }

  function updatePlayBtn(s) {
    s = s || W3.snapshot();
    const p = els.play;
    if (s.paying) { p.disabled = true; p.className = 'rp-btn rp-play pay'; p.textContent = 'CONFIRM IN WALLET…'; return; }
    p.disabled = false;
    // STARTAS: švarus centruotas herojus — mygtukas tik „▶ PLAY", mokestis/būsena po juo (caption).
    //   Paspaudus PLAY (žr. onPlay) → prisijungia piniginė → prašo sumokėti 15 RONKE.
    if (mode === 'start') {
      // Sprite mygtukas (CSS mode-start) — tekstas paslėptas; ramybėj rodom kadrą 0 (mėlyna).
      p.className = 'rp-btn rp-play pay'; p.textContent = '';
      clearInterval(p._spr); p.style.backgroundPositionX = '0%';
      return;
    }
    const again = mode === 'gameover';
    if (s.freePlay) { p.className = 'rp-btn rp-play'; p.textContent = (again ? 'PLAY AGAIN' : 'PLAY') + ' (FREE TEST)'; return; }
    if (!s.connected) { p.className = 'rp-btn rp-play pay'; p.textContent = 'CONNECT & PLAY  (' + s.fee + ' RONKE)'; return; }
    p.className = 'rp-btn rp-play pay';
    p.textContent = (again ? 'PLAY AGAIN' : 'PLAY') + '  —  ' + s.fee + ' RONKE';
  }

  async function doConnect() {
    setStatus('Connecting…');
    try { await W3.connect(); setStatus('Connected.', 'ok'); }
    catch (e) { setStatus(e.message || 'Connect failed.', 'err'); }
  }

  async function onPlay() {
    playSprite();   // sprite švytėjimo animacija paspaudus
    const s = W3.snapshot();
    if (s.freePlay) { startGame(); return; }
    try {
      if (!s.connected) { setStatus('Connecting…'); await W3.connect(); }
      setStatus('Confirm ' + s.fee + ' RONKE payment in your wallet…');
      await W3.payFee();
      setStatus('Paid ✓ — starting…', 'ok');
      startGame();
    } catch (e) {
      setStatus(e.message || 'Payment failed / cancelled.', 'err');
      updatePlayBtn();
    }
  }

  function startGame() {
    hide();
    if (game && game.beginRun) game.beginRun();
  }

  // Perjungia leaderboard metriką: 'score' = BEST rekordas / 'total' = BENDRAS kaupiamas.
  function setMetric(m) { if (boardMetric === m) return; boardMetric = m; loadBoard(); }
  function updateTabs() {
    if (!els.tabBest) return;
    els.tabBest.className = 'rp-tab' + (boardMetric === 'score' ? ' rp-tab-on' : '');
    els.tabTotal.className = 'rp-tab' + (boardMetric === 'total' ? ' rp-tab-on' : '');
  }
  // ── Savaitiniai PRIZAI ──
  const POOL_RONKE = 69000;                        // TOTAL leaderboard prizų fondas (dalinamas pagal taškus)
  // BEST leaderboard prizas pagal vietą: unitai (top5) + RonkChoco (top10) + kaulai (top20).
  function bestPrize(rank) {
    const u = rank === 1 ? 5 : rank === 2 ? 3 : rank === 3 ? 2 : rank <= 5 ? 1 : 0;
    return { u: u, c: rank <= 10 ? 10 : 0, b: rank <= 20 ? 50 : 0 };
  }
  // Kiekvieno prizo trumpas paaiškinimas — hover (title) + paspaudus popup (žr. showInfo).
  const PRIZE_INFO = {
    units: { name: '⚔ Units', text: 'NFT units used in Age of Ronke and Ronke Saga.' },
    choco: { name: '🍫 RonkChoco', text: 'RonkChoco is a consumable and tradeable item. Integration is coming soon — win it now, use it later.' },
    bones: { name: '🦴 Bones', text: '1 Bone = 5 RONKE. Swap them in-game, or use them in Age of Ronke to upgrade your castle.' },
    ronke: { name: '💰 RONKE', text: 'RONKE is the game token. The 69,000 RONKE pool is split among the TOP 10 by total points collected.' },
  };
  function pzTok(key, label, cls) {
    const t = PRIZE_INFO[key].text.replace(/"/g, '&quot;');
    return '<span class="pz-tok ' + cls + '" data-info="' + key + '" title="' + t + '">' + label + '</span>';
  }
  function prizeCells(rank) {
    const p = bestPrize(rank), out = [];
    if (p.u) out.push(pzTok('units', '⚔ ' + p.u + ' Unit' + (p.u > 1 ? 's' : ''), 'pz-u'));
    if (p.c) out.push(pzTok('choco', '🍫 ' + p.c + ' RonkChoco', 'pz-c'));
    if (p.b) out.push(pzTok('bones', '🦴 ' + p.b + ' Bones', 'pz-b'));
    return out.join('<span class="pz-sep"> · </span>');
  }
  function num(n) { return (n || 0).toLocaleString('en-US'); }

  // Prizo paaiškinimo popup (paspaudus prizą leaderboard'e).
  function showInfo(key) {
    const d = PRIZE_INFO[key]; if (!d || !els.info) return;
    els.infoIt.textContent = d.name;
    els.infoTx.textContent = d.text;
    els.info.classList.add('show');
  }
  function hideInfo() { if (els.info) els.info.classList.remove('show'); }

  const SLOTS = 20;                                 // visada rodom 20 prizinių vietų (nesvarbu kiek žaidėjų)
  async function loadBoard() {
    updateTabs();
    els.board.innerHTML = '<div class="rp-empty">loading…</div>';
    const byTotal = boardMetric === 'total';
    const top = await W3.loadTop(SLOTS, byTotal);
    const me = (W3.getAddress() || '').toLowerCase();
    const RONKE_TOP = 10;   // 69k RONKE dalinamas TIK top 10 (bet lentelė rodo top 20 — matai savo vietą)
    const sumTot = byTotal ? (top.slice(0, RONKE_TOP).reduce((s, e) => s + (e.total || 0), 0) || 1) : 1;
    // Jokios legendos — prizai jau matomi kiekvienoj eilutėj. TOTAL rodo tik bendrą pool sumą (jos eilutėse nėra).
    let html = byTotal
      ? '<div class="rp-poolline">💰 Prize pool: <b>' + num(POOL_RONKE) + ' RONKE</b> — shared by TOP 10</div>'
      : '';
    // VISADA renderinam 20 slotų: užpildyti žaidėjais + tušti „— open —" (prizai matomi kiekvienoj vietoj).
    for (let i = 0; i < SLOTS; i++) {
      const rank = i + 1;
      const e = top[i];
      const filled = !!e;
      const medal = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank;
      const meCls = filled && e.addr.toLowerCase() === me ? ' me' : '';
      const openCls = filled ? '' : ' rp-open';
      const addr = filled ? W3.short(e.addr) : '<span class="rp-open-lbl">— open —</span>';
      const val = filled ? num(byTotal ? e.total : e.score) : '<span class="rp-dim">—</span>';
      const prize = byTotal
        ? (rank <= RONKE_TOP
            ? (filled
                ? '<span class="rp-prize">' + pzTok('ronke', num(Math.round((e.total || 0) / sumTot * POOL_RONKE)) + ' RONKE', 'rp-ronke') + '</span>'
                : '<span class="rp-prize rp-dim">top 10 wins the pool</span>')
            : '<span class="rp-prize rp-dim">reach top 10 to win RONKE</span>')   // 11-20: rodo vietą, be prizo
        : '<span class="rp-prize">' + prizeCells(rank) + '</span>';
      html += '<div class="rp-row' + (rank <= 3 ? ' g' + rank : '') + meCls + openCls + '">' +
        '<span class="rp-rank">' + medal + '</span>' +
        '<div class="rp-mid"><span class="rp-raddr">' + addr + '</span>' + prize + '</div>' +
        '<span class="rp-rscore">' + val + '</span>' +
        '</div>';
    }
    els.board.innerHTML = html;
  }

  // ── Public API (kviečiama iš game.js) ──
  function init(g) {
    game = g;
    if (!root) build();
    // Rodom start meniu tik jei pay-gate aktyvus (kitaip žaidimas prasideda laisvai).
    if (W3.chargeEnabled() || W3.FREE_PLAY) showStart();
  }
  // Startas: fonas SKAIDRUS, žaidimas pilnai matosi, apačioj PLAY + „🏆 VIEW LEADERBOARD" juosta.
  //   Paspaudus PLAY → connect (jei reikia) → wallet prašo sumokėti 15 RONKE → runas.
  //   Paspaudus 🏆 → atskira leaderboard peržiūra (žr. showBoard).
  function showStart() {
    mode = 'start'; lastRun = null;
    renderSecondary(); setStatus('');
    updatePlayBtn();   // startе mygtukas = tik „▶" (be teksto)
    show();            // rodom + pastatom prie flipperių (leaderboard = 🏆 ikona viršuj)
    requestAnimationFrame(positionStart);   // dar kartą kai canvas rect tikrai paruoštas
  }

  // 🏆 Atskira leaderboard peržiūra (iš start juostos ar iš žaidimo trofėjaus mygtuko).
  //   from='game' → grįžus „BACK" tęsiam žaidimą; kitaip → grįžtam į start.
  function showBoard(from) {
    boardFrom = from || 'start';
    mode = 'board';
    if (els.title) els.title.textContent = 'WEEKLY LEADERBOARDS';   // pavadinimas board režime
    renderSecondary(); setStatus('');
    show(); loadBoard();
  }
  // Antrinio mygtuko tekstas/veiksmas pagal režimą.
  function renderSecondary() {
    if (!els.secondary) return;
    if (mode === 'board') els.secondary.textContent = '◀ BACK';
    else if (mode === 'gameover') els.secondary.textContent = '◀ BACK TO MENU';
    else els.secondary.textContent = '🏆 VIEW LEADERBOARD';
  }
  function onSecondary() {
    if (mode === 'board') {
      if (boardFrom === 'game') { hide(); if (game && game.resumeFromBoard) game.resumeFromBoard(); }
      else showStart();
    } else if (mode === 'gameover') {
      // 🎳 EMBED (free arba paid): „EXIT" → tėvas (lenta launcher) uždaro modalą
      if (window.__RP_EMBED_LOCK || /[?&]embed=paid/.test(location.search)) { try { parent.postMessage({ type: 'rp_exit' }, '*'); } catch (_) {} return; }
      // Uždarom rezultatų lentutę → atstatom švarią lentą + grįžtam į START (sprite PLAY mygtukas).
      if (game && game.resetToMenu) game.resetToMenu();
      showStart();
    } else {
      showBoard('start');
    }
  }
  async function onGameOver(run) {
    mode = 'gameover'; lastRun = run || {};
    if (els.title) els.title.textContent = 'RONKEPONG';   // game-over — branding (board režimas rodo „LEADERBOARD")
    els.sub.innerHTML = 'GAME OVER · your score <b>' + (run ? run.score : 0) + '</b> · floor ' + (run ? run.floor : 1);
    els.mini.textContent = '';
    updatePlayBtn(); renderSecondary(); setStatus('');
    // 🎳 07-23 EMBED režimai: FREE (launcher davė 1 nemokamą/10h) → po game over restart'as
    //   UŽRAKINAMAS (jokio nemokamo „PLAY AGAIN"), tėvui pranešam, jis uždaro. PAID (embed=paid)
    //   → replay LEIDŽIAMAS (kiekvienas kartas = 15 RONKE per žaidimo web3, savaime gate'inasi).
    var _emFree = /[?&]embed=free/.test(location.search);
    var _emPaid = /[?&]embed=paid/.test(location.search);
    if (_emFree) {
      window.__RP_EMBED_LOCK = true;   // game.js _restart() guard (touch/click/R nebeperleidžia)
      if (els.play) els.play.style.display = 'none';
      if (els.secondary) els.secondary.textContent = '✕ EXIT — next free game in 10h';
      try { parent.postMessage({ type: 'rp_gameover', score: run ? run.score : 0 }, '*'); } catch (_) {}
    } else if (_emPaid) {
      // apmokamas: PLAY AGAIN (15 RONKE) rodomas normaliai; „EXIT" grąžina į lenta
      if (els.secondary) els.secondary.textContent = '✕ EXIT';
      try { parent.postMessage({ type: 'rp_gameover_paid', score: run ? run.score : 0 }, '*'); } catch (_) {}
    }
    show();
    setStatus('Saving score…');
    try { const r = await W3.submitScore(run.score, run.floor);
      setStatus('Saved ✓' + (r && r.total ? '   ·   total ' + r.total : ''), 'ok'); }
    catch (_) { setStatus(''); }
    loadBoard();
  }
  // Startе ▶ mygtuką pastatom PRIE FLIPPERIŲ (~85% lentos aukščio, pivot y=375/440), sekant canvas.
  //   Board/gameover — grąžinam į įprastą flex-centravimą (išvalom inline poziciją).
  function positionStart() {
    if (mode !== 'start' || !root || !els.card) return;
    const cv = document.getElementById('screen');
    const base = cv ? (cv.getBoundingClientRect().top + cv.getBoundingClientRect().height * 0.84)
                    : window.innerHeight * 0.84;   // fallback (pvz. preview be canvas)
    const y = base - 30;   // 30px AUKŠČIAU (pakelta 5px: 25+5)
    els.card.style.cssText = 'position:fixed;left:50%;top:' + Math.round(y) + 'px;transform:translate(-50%,-50%);pointer-events:auto;';
  }
  function clearCardPos() { if (els.card) els.card.style.cssText = ''; }

  // Sprite PLAY animacija: kadrai 0→7 (mėlyna→žalia švytėjimas), grojama paspaudus. Sustoja ties 7.
  function playSprite() {
    const el = els.play; if (!el) return;
    let f = 0; clearInterval(el._spr);
    el._spr = setInterval(() => {
      el.style.backgroundPositionX = (f / 7 * 100) + '%';
      if (f >= 7) clearInterval(el._spr);
      f++;
    }, 55);
  }

  // Fono/išdėstymo režimas pagal mode: „mode-start" (skaidrus, mygtukas prie flipperių), „mode-over"/„mode-board" (tamsus, centre).
  function show() {
    if (!root) return;
    root.classList.toggle('mode-start', mode === 'start');
    root.classList.toggle('mode-over', mode === 'gameover');
    root.classList.toggle('mode-board', mode === 'board');
    root.classList.add('show');
    if (mode === 'start') positionStart(); else clearCardPos();
  }
  function hide() { if (root) root.classList.remove('show'); }

  window.RPWeb3UI = { init, showStart, onGameOver, showBoard, show, hide, loadBoard };
})();
