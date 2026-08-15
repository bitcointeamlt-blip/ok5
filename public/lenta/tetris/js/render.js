/* Pixel-art vaizdavimas. Virtualus 640x360 ekranas, didinamas SVEIKUOJU masteliu,
 * image-rendering: pixelated -> tikri, aštrūs pikseliai bet kokiame monitoriuje.
 * Visas UI tekstas — ANGLIŠKAS. */
(function (global) {
  'use strict';

  var C = global.CFG, F = global.Font, P = global.PIECES;
  var U = C.UI;

  /* Teksto tarpininkas: kai CLEAN_UI įjungtas, visi užrašai ir skaičiai tiesiog
   * nepiešiami. Matavimo funkcijos (F.width) lieka — jų reikia išdėstymui. */
  var T = {
    text: function () { if (!C.CLEAN_UI) F.text.apply(F, arguments); },
    center: function () { if (!C.CLEAN_UI) F.center.apply(F, arguments); },
    right: function () { if (!C.CLEAN_UI) F.right.apply(F, arguments); },
    outlined: function () { if (!C.CLEAN_UI) F.outlined.apply(F, arguments); },
    outlinedCenter: function () { if (!C.CLEAN_UI) F.outlinedCenter.apply(F, arguments); }
  };

  /* ---------- išdėstymas ----------
   * Vienos pusės turinys = 124 px chrome + lenta (HOLD + plokščių šachta + lenta + NEXT).
   * Visa kita — paraštės, todėl išdėstymas prisitaiko prie bet kokio ekrano santykio.
   * Šie laukai perskaičiuojami kiekvieno resize() metu. */
  var LAY = {
    VW: C.VW, VH: C.VH,
    HALF: 320,
    HEADER_Y: 6,
    BOARD_Y: 46,
    HOLD_X: 30, HOLD_W: 48, HOLD_H: 40,
    METER_X: 84, METER_W: 12,
    BOARD_X: 96,
    NEXT_X: 242, NEXT_W: 48,
    FOOT_Y: 332
  };
  LAY.BOARD_H = C.BOARD_H;

  /* Šoninis turinys aplink lentą: HOLD(48) + 6 + ŠACHTA(12) + 4 + [lenta] + 6 + NEXT(48) = 124 + lenta.
   * Vertikaliai virš/po lenta reikia 72 px (antraštė + pėda). */
  /* Švariame režime plokščių šachtos nėra (ateinančias eilutes rodo ghost preview
   * pačioje lentoje), tad chrome siauresnis ir langeliai gali būti didesni. */
  var CHROME_FULL = 124, CHROME_H = 72;
  var OUT_PAD = 14;      // paraštė nuo ekrano krašto švariame režime
  var MIN_LANE = 56;     // minimalus koridoriaus plotis vienai pusei

  /* Perskaičiuoja išdėstymą IR langelio dydį pagal turimą vietą.
   * Langelis auga, kai virtualus langas didesnis už projektinį — kitaip languotame
   * režime lentos liktų mažos su didžiulėmis paraštėmis.
   * PASTABA: keičia CFG.CELL/BOARD_W/BOARD_H — visi skaitytojai juos ima kas kadrą. */
  function layout(vw, vh) {
    LAY.VW = vw; LAY.VH = vh;
    LAY.HALF = Math.floor(vw / 2);

    var cellByH = Math.floor((vh - CHROME_H) / C.ROWS);
    var cell, pad;

    if (C.CLEAN_UI) {
      /* MŪŠIO KORIDORIUS: HOLD ir NEXT sudedami į vieną koloną prie IŠORINIO krašto,
       * lenta šalia jos, o visas likęs vidurys atitenka žygiuojantiems unitams. */
      var cellByWc = Math.floor((LAY.HALF - OUT_PAD - 54 - MIN_LANE) / C.COLS);
      cell = Math.max(8, Math.min(cellByH, cellByWc, 30));
      C.CELL = cell;
      C.BOARD_W = C.COLS * cell;
      C.BOARD_H = C.ROWS * cell;
      LAY.HOLD_X = OUT_PAD;
      LAY.NEXT_X = OUT_PAD;
      LAY.METER_X = OUT_PAD;
      LAY.BOARD_X = OUT_PAD + 54;
      LAY.NEXT_Y_OFF = 46;
    } else {
      var cellByWf = Math.floor((LAY.HALF - CHROME_FULL - 10) / C.COLS);
      cell = Math.max(8, Math.min(cellByH, cellByWf, 30));
      C.CELL = cell;
      C.BOARD_W = C.COLS * cell;
      C.BOARD_H = C.ROWS * cell;
      pad = Math.max(4, Math.floor((LAY.HALF - CHROME_FULL - C.BOARD_W) / 2));
      LAY.HOLD_X = pad;
      LAY.METER_X = pad + 54;
      LAY.BOARD_X = pad + 70;
      LAY.NEXT_X = LAY.BOARD_X + C.BOARD_W + 6;
      LAY.NEXT_Y_OFF = 0;
    }
    LAY.BOARD_H = C.BOARD_H;
    /* koridorius: nuo kairės lentos dešinio krašto iki dešinės lentos kairio krašto */
    LAY.LANE_X0 = LAY.BOARD_X + C.BOARD_W;
    LAY.LANE_X1 = LAY.HALF * 2 - LAY.LANE_X0;

    var stackH = C.BOARD_H + CHROME_H;
    var top = Math.max(0, Math.floor((vh - stackH) / 2));
    LAY.HEADER_Y = top + 6;
    LAY.BOARD_Y = top + 46;
    LAY.FOOT_Y = LAY.BOARD_Y + C.BOARD_H + 6;
    LAY.BOARD_BOTTOM = LAY.BOARD_Y + C.BOARD_H;
  }

  function Renderer(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 1;
    this.vw = C.VW;
    this.vh = C.VH;
    this.t = 0;
    this.menuBits = null;
    this._wallCanvas = null;   // 🧱 procedūrinės akmens sienos kešas (perbraižom TIK per resize, ne kas kadrą)
    this._wallKey = '';
    /* 🎮 (08-15) Kenney `assets/keys/*.png` preload PAŠALINTAS — prep ekranas klavišus piešia pats
     * (tų sprite'ų rodyklės tokios smulkios, kad visos keturios atrodė kaip vienodas „+"). */
    this.resize();
  }

  /* Sveikas mastelis pikselių aštrumui + virtualus dydis, kuris UŽPILDO langą.
   * 1920x1080 -> scale 3, 640x360.  1366x768 -> scale 2, 683x384.  Abu be juostų. */
  Renderer.prototype.resize = function () {
    var w = global.innerWidth, h = global.innerHeight;

    if (w < C.VW || h < C.VH) {
      /* langas mažesnis už projektinį dydį — trupmeninis mastelis, fiksuotas 640x360 */
      this.scale = Math.min(w / C.VW, h / C.VH);
      this.vw = C.VW;
      this.vh = C.VH;
    } else {
      this.scale = Math.max(1, Math.floor(Math.min(w / C.VW, h / C.VH)));
      this.vw = Math.max(C.VW, Math.floor(w / this.scale));
      this.vh = Math.max(C.VH, Math.floor(h / this.scale));
    }

    layout(this.vw, this.vh);

    this.cv.width = Math.round(this.vw * this.scale);
    this.cv.height = Math.round(this.vh * this.scale);
    this.cv.style.width = Math.round(this.vw * this.scale) + 'px';
    this.cv.style.height = Math.round(this.vh * this.scale) + 'px';
    this.ctx.imageSmoothingEnabled = false;
  };

  /* ---------- primityvai ---------- */

  function rect(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function frame(ctx, x, y, w, h, col) {
    rect(ctx, x, y, w, 1, col);
    rect(ctx, x, y + h - 1, w, 1, col);
    rect(ctx, x, y, 1, h, col);
    rect(ctx, x + w - 1, y, 1, h, col);
  }

  /* Visos panelės = medinė lentelė (plaque apibrėžta žemiau). */
  function panel(ctx, x, y, w, h, fill, border) {
    plaque(ctx, x, y, w, h, border || U.line);
  }

  /* Iškaltas blokas: tamsus kontūras -> nuožulnus rėmelis -> poliruotas veidas ->
   * blikas ir kampinės kniedės. Šiukšlės (G) vietoj bliko gauna įtrūkimus.
   * Viskas proporcinga langelio dydžiui, tad veikia ir 14 px, ir 30 px. */
  function block(ctx, x, y, s, type, alpha) {
    var c = C.COLORS[type] || C.COLORS.G;
    if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;

    var b = s >= 22 ? 3 : 2;                 // nuožulnumo storis
    var garbage = (type === 'G');

    /* 1) chunky tamsus kontūras — atskiria blokus, „iškalto" pojūtis */
    rect(ctx, x, y, s, s, c[3]);

    /* 2) rėmelio veidas */
    rect(ctx, x + 1, y + 1, s - 2, s - 2, c[0]);

    /* 3) nuožulnumas: viršus/kairė šviesu, apačia/dešinė tamsu */
    rect(ctx, x + 1, y + 1, s - 2, b, c[1]);
    rect(ctx, x + 1, y + 1, b, s - 2, c[1]);
    rect(ctx, x + 1, y + s - 1 - b, s - 2, b, c[2]);
    rect(ctx, x + s - 1 - b, y + 1, b, s - 2, c[2]);

    /* 4) vidinis poliruotas veidas */
    var i0 = 1 + b, isz = s - 2 - b * 2;
    if (isz >= 3) {
      rect(ctx, x + i0, y + i0, isz, isz, c[0]);
      rect(ctx, x + i0, y + i0, isz, 1, c[2]);            // įdubimo šešėlis
      rect(ctx, x + i0, y + i0, 1, isz, c[2]);

      if (garbage) {
        /* akmens įtrūkimai — kiekvienam blokui vienodi (jokio mirgėjimo) */
        var m = Math.max(1, (isz / 2) | 0);
        rect(ctx, x + i0 + m, y + i0 + 1, 1, isz - 2, c[2]);
        rect(ctx, x + i0 + 1, y + i0 + m, m - 1, 1, c[2]);
        rect(ctx, x + i0 + m + 1, y + i0 + isz - 3, isz - m - 2, 1, c[2]);
      } else {
        /* brangakmenio faseta + blikas viršutiniame kairiame kampe */
        var f = Math.max(2, (isz / 2) | 0);
        rect(ctx, x + i0 + 1, y + i0 + 1, f, f, c[1]);
        rect(ctx, x + i0 + 1, y + i0 + 1, Math.max(1, (f / 2) | 0), Math.max(1, (f / 2) | 0), c[4]);
      }
    }

    /* 5) kampinės kniedės */
    rect(ctx, x + 1, y + 1, 1, 1, c[4]);
    rect(ctx, x + s - 2, y + s - 2, 1, 1, c[2]);

    if (alpha != null && alpha < 1) ctx.globalAlpha = 1;
  }

  /* Šešėlis — kreidinis kontūras su kampų kabliukais (ne pilnas rėmas). */
  function ghostBlock(ctx, x, y, s, type) {
    var c = C.COLORS[type] || C.COLORS.G;
    var k = Math.max(2, (s / 3.5) | 0);
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = c[0];
    /* keturi kampai */
    ctx.fillRect(x, y, k, 1);           ctx.fillRect(x, y, 1, k);
    ctx.fillRect(x + s - k, y, k, 1);   ctx.fillRect(x + s - 1, y, 1, k);
    ctx.fillRect(x, y + s - 1, k, 1);   ctx.fillRect(x, y + s - k, 1, k);
    ctx.fillRect(x + s - k, y + s - 1, k, 1); ctx.fillRect(x + s - 1, y + s - k, 1, k);
    ctx.globalAlpha = 0.12;
    ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    ctx.globalAlpha = 1;
  }

  /* ---------- medievalūs UI elementai ---------- */

  /* Akmeninis rėmas iš plytų — lentos „duobės" apvadas.
   * Švariame režime jokių plytų: tik plonas tamsus kraštas, kad duobė atsiskirtų nuo fono. */
  function stoneFrame(ctx, x, y, w, h, th) {
    th = th || 4;
    var U2 = C.UI;
    if (C.CLEAN_UI) {
      rect(ctx, x - 2, y - 2, w + 4, h + 4, U2.shadow);
      return;
    }
    /* pagrindas */
    rect(ctx, x - th, y - th, w + th * 2, h + th * 2, U2.stoneDark);
    /* plytų segmentai viršuje ir apačioje */
    var bw = 10, i;
    for (i = 0; i < Math.ceil((w + th * 2) / bw); i++) {
      var px = x - th + i * bw;
      var pw = Math.min(bw - 1, x + w + th - px);
      if (pw <= 0) break;
      rect(ctx, px, y - th, pw, th - 1, (i % 2) ? U2.stone : U2.stoneLight);
      rect(ctx, px + ((i % 2) ? 3 : 0), y + h + 1, Math.max(1, pw - 3), th - 1, (i % 2) ? U2.stoneLight : U2.stone);
    }
    /* šoniniai akmenys */
    for (i = 0; i < Math.ceil(h / bw); i++) {
      var py = y + i * bw;
      var ph = Math.min(bw - 1, y + h - py);
      if (ph <= 0) break;
      rect(ctx, x - th, py, th - 1, ph, (i % 2) ? U2.stone : U2.stoneLight);
      rect(ctx, x + w + 1, py + 4, th - 1, ph, (i % 2) ? U2.stoneLight : U2.stone);
    }
    /* tamsus vidinis ir išorinis apvadas */
    frame(ctx, x - 1, y - 1, w + 2, h + 2, U2.shadow);
    frame(ctx, x - th, y - th, w + th * 2, h + th * 2, U2.shadow);
  }

  /* Medinė lentelė su kniedėmis — HOLD / NEXT / meniu panelės. */
  /* ◇ brangakmenis (5px) su šviesiu centru — panelės kampams */
  function drawGem(ctx, cx, cy, col) {
    rect(ctx, cx, cy - 2, 1, 1, col);
    rect(ctx, cx - 1, cy - 1, 3, 1, col);
    rect(ctx, cx - 2, cy, 5, 1, col);
    rect(ctx, cx - 1, cy + 1, 3, 1, col);
    rect(ctx, cx, cy + 2, 1, 1, col);
    rect(ctx, cx, cy, 1, 1, '#e6f2ff');       // centro blikas
  }

  /* Poliruotas NAVY panelis (pixel-art, kaip uikit_panel.png): tamsus kraštas -> navy korpusas
   * -> bevel (viršus šviesu / apačia tamsu) -> vidinis įleistas rėmelis -> ◇ gemų kampai.
   * Procedūrinis → aštru bet kokiame mastelyje (jokių asset'ų). accent nudažo rėmelį+gemus. */
  function plaque(ctx, x, y, w, h, accent) {
    var U2 = C.UI;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    rect(ctx, x, y, w, h, U2.pnlEdge);                          // išorinis tamsus kraštas
    rect(ctx, x + 1, y + 1, w - 2, h - 2, U2.pnl);              // navy korpusas
    rect(ctx, x + 1, y + 1, w - 2, 1, U2.pnlHi);               // bevel: viršus blikas
    rect(ctx, x + 1, y + 1, 1, h - 2, U2.pnlHi);               // bevel: kairė blikas
    rect(ctx, x + 1, y + h - 2, w - 2, 1, U2.pnlLo);           // bevel: apačia šešėlis
    rect(ctx, x + w - 2, y + 1, 1, h - 2, U2.pnlLo);           // bevel: dešinė šešėlis
    var m = 3;
    if (w > m * 2 + 6 && h > m * 2 + 6) {
      frame(ctx, x + m, y + m, w - m * 2, h - m * 2, accent || U2.pnlIn);   // vidinis įleistas rėmelis
      var gcol = accent || U2.gem;
      drawGem(ctx, x + m, y + m, gcol);                         // 4 ◇ gemai vidinio rėmo kampuose
      drawGem(ctx, x + w - 1 - m, y + m, gcol);
      drawGem(ctx, x + m, y + h - 1 - m, gcol);
      drawGem(ctx, x + w - 1 - m, y + h - 1 - m, gcol);
    } else {
      frame(ctx, x, y, w, h, accent || U2.pnlIn);
    }
  }

  /* Herbo skydas: kvadratas su smailėjančia apačia. */
  function shield(ctx, cx, cy, w, fill, edge) {
    var h = Math.round(w * 0.9);
    var x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    rect(ctx, x, y, w, h, fill);
    /* smailėjanti apačia */
    var tip = Math.round(w / 2);
    for (var i = 0; i < tip; i++) {
      var ww = w - i * 2;
      if (ww <= 0) break;
      rect(ctx, x + i, y + h + i, ww, 1, fill);
    }
    /* kraštinė */
    frame(ctx, x, y, w, h, edge);
    for (var j = 0; j < tip; j++) {
      var w2 = w - j * 2;
      if (w2 <= 0) break;
      rect(ctx, x + j, y + h + j, 1, 1, edge);
      rect(ctx, x + w - 1 - j, y + h + j, 1, 1, edge);
    }
    rect(ctx, x + 2, y + 2, 2, 2, edge);
    rect(ctx, x + w - 4, y + 2, 2, 2, edge);
  }

  /* Mažas rombas — vizualinis „vienetas" vietoj skaitmens. */
  function gemPip(ctx, cx, cy, r, col, edge) {
    for (var i = -r; i <= r; i++) {
      var w = (r - Math.abs(i)) * 2 + 1;
      rect(ctx, cx - (w >> 1), cy + i, w, 1, col);
    }
    if (edge) {
      rect(ctx, cx, cy - r, 1, 1, edge);
      rect(ctx, cx, cy + r, 1, 1, edge);
      rect(ctx, cx - r, cy, 1, 1, edge);
      rect(ctx, cx + r, cy, 1, 1, edge);
    }
  }

  /* Zigzago plyšys — naudojam ir topout'ui, ir pralaimėjimo skydui. */
  function crackLine(ctx, x0, y0, x1, y1, col, wob) {
    ctx.fillStyle = col;
    var steps = Math.max(2, (Math.abs(x1 - x0) + Math.abs(y1 - y0)) / 3 | 0);
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      var wx = Math.sin(t * 9) * wob;
      ctx.fillRect(Math.round(x0 + (x1 - x0) * t + wx), Math.round(y0 + (y1 - y0) * t), 2, 2);
    }
  }

  /* Vėliava/pennantas su vardu. */
  function banner(ctx, x, y, w, h, col) {
    var U2 = C.UI;
    rect(ctx, x, y, w, h, col);
    rect(ctx, x, y, w, 1, U2.text);
    rect(ctx, x, y + h - 1, w, 1, U2.shadow);
    /* iškirpta „uodega" dešinėje */
    for (var i = 0; i < h / 2; i++) {
      rect(ctx, x + w - 1 - i, y + i, 1, 1, U2.bg);
      rect(ctx, x + w - 1 - i, y + h - 1 - i, 1, 1, U2.bg);
    }
    frame(ctx, x - 1, y - 1, w + 2, h + 2, U2.shadow);
  }

  /* ---------- spalvų interpoliacija ----------
   * Tolygus perėjimas vietoj šokinėjimo tarp dviejų spalvų — nuo to priklauso,
   * ar įspėjimas atrodo nušlifuotas, ar strobuoja. */
  var _hexCache = {};
  function hex2rgb(h) {
    if (_hexCache[h]) return _hexCache[h];
    var v = [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
    _hexCache[h] = v;
    return v;
  }
  function lerpHex(a, b, t) {
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var A = hex2rgb(a), B = hex2rgb(b);
    var r = (A[0] + (B[0] - A[0]) * t) | 0;
    var g = (A[1] + (B[1] - A[1]) * t) | 0;
    var bl = (A[2] + (B[2] - A[2]) * t) | 0;
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* Užpildytas apvalokas — pikselinis „švytėjimo" sluoksnis (vietoj radial gradient,
   * kurio pixel-art canvas'e naudoti negalim). */
  function ringFill(ctx, cx, cy, r, col) {
    ctx.fillStyle = col;
    r = Math.max(1, Math.round(r));
    for (var dy = -r; dy <= r; dy++) {
      var w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      if (w <= 0) continue;
      ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2, 1);
    }
  }

  /* Tuščiaviduris kvadratinis "žiedas" — smūgio banga. */
  function ringShape(ctx, cx, cy, r, col, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = col;
    var x = Math.round(cx - r), y = Math.round(cy - r), s = Math.round(r * 2);
    ctx.fillRect(x, y, s, 1);
    ctx.fillRect(x, y + s - 1, s, 1);
    ctx.fillRect(x, y, 1, s);
    ctx.fillRect(x + s - 1, y, 1, s);
    ctx.globalAlpha = 1;
  }

  /* ---------- mini figūra (HOLD / NEXT) ---------- */

  function miniPiece(ctx, type, cx, cy, cell, alpha) {
    if (!type) return;
    var cells = P.CELLS[type][0];
    var minX = 9, maxX = -9, minY = 9, maxY = -9;
    cells.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    });
    var w = (maxX - minX + 1) * cell, h = (maxY - minY + 1) * cell;
    var ox = Math.round(cx - w / 2) - minX * cell;
    var oy = Math.round(cy - h / 2) - minY * cell;
    cells.forEach(function (p) {
      block(ctx, ox + p[0] * cell, oy + p[1] * cell, cell, type, alpha);
    });
  }

  /* ---------- vienos pusės piešimas ---------- */

  /* Įleista NIŠA (recessed slot) — HOLD/NEXT figūroms švariame režime, kad nekabotų ore.
   * Recessed pojūtis: viršus/kairė TAMSU, apačia/dešinė ŠVIESU (atvirkščiai nei iškilus bevel). */
  Renderer.prototype.drawWell = function (x, y, w, h) {
    var ctx = this.ctx;
    rect(ctx, x, y, w, h, '#0f0b16');                    // gilus tamsus vidus
    rect(ctx, x, y, w, 1, '#070410');                    // viršaus šešėlis (recessed)
    rect(ctx, x, y, 1, h, '#070410');
    rect(ctx, x, y + h - 1, w, 1, '#2e3c5c');            // apačios blikas
    rect(ctx, x + w - 1, y, 1, h, '#2e3c5c');
    frame(ctx, x - 1, y - 1, w + 2, h + 2, '#000000');   // išorinis kontūras
  };

  /* 🪪 mačo tapatybės badge'ai: avataro juosta (Ronke=žmogus / kiborgas=AI) + lygos emblema.
   * Paveikslai iš ../assets_rank; kešuojami; kadras pagal this.t (140ms žingsnis). */
  var RANKL = ['PAPER', 'WOOD', 'STONE', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'GLOBAL'];
  Renderer.prototype._badge = function (name) {
    if (!this._badges) this._badges = {};
    var im = this._badges[name];
    if (!im) { im = new Image(); im.src = '../assets_rank/' + name; this._badges[name] = im; }
    return (im.complete && im.naturalWidth > 0) ? im : null;
  };

  Renderer.prototype.drawSide = function (eng, fx, sx, isYou, aiName) {
    var ctx = this.ctx;
    var ch = fx.ch(eng.side);
    var off = ch.offset();
    var bx = 0;   // nustatoma žemiau, po veidrodžio paskaičiavimo
    var by = LAY.BOARD_Y + off[1];
    var cell = C.CELL;
    var accent = isYou ? U.you : U.foe;
    var k, i;

    /* Švariame režime priešo pusė VEIDRODINĖ: HOLD/NEXT nukeliauja prie išorinio
     * krašto, o vidurys lieka laisvas mūšio koridoriui. */
    var mir = C.CLEAN_UI && !isYou;
    function LX(localX, w) { return sx + (mir ? (LAY.HALF - localX - (w || 0)) : localX); }
    bx = LX(LAY.BOARD_X, C.BOARD_W) + off[0];
    var holdX = LX(LAY.HOLD_X, LAY.HOLD_W);
    var nextX = LX(LAY.NEXT_X, LAY.NEXT_W);
    var meterX = LX(LAY.METER_X, LAY.METER_W);

    /* --- antraštė: vardas ant vėliavos (švariame režime vėliavos nėra) --- */
    var title = isYou ? (aiName || 'YOU') : (aiName || 'OPPONENT');   // 🤖 aiName ant savo pusės = „AI žaidžia už mane"
    if (!C.CLEAN_UI) {
      var bw = F.width(title, 2) + 18;
      banner(ctx, holdX, LAY.HEADER_Y - 2, bw, 17, accent);
      T.text(ctx, title, holdX + 5, LAY.HEADER_Y + 3, '#ffffff', 2);
      T.text(ctx, isYou ? 'CHALLENGER' : 'AI RIVAL', holdX, LAY.HEADER_Y + 20, U.dim, 1);
    }


    var st = eng.stats;
    T.right(ctx, 'LINES ' + st.lines, nextX + LAY.NEXT_W, LAY.HEADER_Y, U.text, 1);
    T.right(ctx, 'SENT ' + st.sent, nextX + LAY.NEXT_W, LAY.HEADER_Y + 10, U.gold, 1);
    T.right(ctx, 'BLOCKED ' + st.cancelled, nextX + LAY.NEXT_W, LAY.HEADER_Y + 20, U.good, 1);
    T.right(ctx, 'LV ' + eng.level, nextX + LAY.NEXT_W, LAY.HEADER_Y + 30, U.dim, 1);

    /* --- HOLD ir NEXT: švariame režime įleistos NIŠOS (figūros nekabo ore); pilname — lentelės.
     * Švariame režime jos viena po kita toje pačioje išorinėje kolonoje. --- */
    var nh = 12 + 3 * 30;
    var nextY = LAY.BOARD_Y + (LAY.NEXT_Y_OFF || 0);
    if (!C.CLEAN_UI) {
      panel(ctx, holdX, LAY.BOARD_Y, LAY.HOLD_W, LAY.HOLD_H);
      T.text(ctx, 'HOLD', holdX + 3, LAY.BOARD_Y + 3, U.dim, 1);
      panel(ctx, nextX, nextY, LAY.NEXT_W, nh);
      T.text(ctx, 'NEXT', nextX + 3, nextY + 3, U.dim, 1);
    } else {
      this.drawWell(holdX, LAY.BOARD_Y, LAY.HOLD_W, LAY.HOLD_H);
      this.drawWell(nextX, nextY, LAY.NEXT_W, nh);
    }
    miniPiece(ctx, eng.hold, holdX + LAY.HOLD_W / 2, LAY.BOARD_Y + 25, 6,
      eng.holdUsed ? 0.35 : 1);
    for (i = 0; i < 3; i++) {
      miniPiece(ctx, eng.nextQueue[i], nextX + LAY.NEXT_W / 2,
        nextY + 26 + i * 30, i === 0 ? 10 : 8, i === 0 ? 1 : 0.7);   // 🪪 didelės NEXT figūros
    }

    /* 🪪 2 papildomi slotai IŠKART po NEXT: [lygos emblema] + [kas žaidžia: Ronke=žmogus / kiborgas=AI].
     * Duomenys iš serverio start žinutės — abu žaidėjai mato tą pačią tiesą. */
    var mID = this._m && (isYou ? this._m._idYou : this._m._idFoe);
    if (mID) {
      var idY = nextY + nh + 4;
      var idH = 140;   // emblema 42 + avataras 42 + W/L + 🎖️ XP skaitliukas (savo pusėje)
      if (!C.CLEAN_UI) panel(ctx, nextX, idY, LAY.NEXT_W, idH);
      else this.drawWell(nextX, idY, LAY.NEXT_W, idH);
      var cxm = nextX + LAY.NEXT_W / 2;
      var em = this._badge('emb_' + (mID.league | 0) + '.png');
      if (em) {
        /* 🪄 emblemos gyvybe: plūduriavimas + pulsuojantis švytėjimas + blizgesio perbraukimas kas ~3.4s */
        var ebob = Math.sin(this.t / 620 + (isYou ? 0 : 1.7)) * 1.5;
        var eY = idY + 4 + ebob;
        var gp = 0.5 + 0.5 * Math.sin(this.t / 880 + (isYou ? 0 : 1.1));
        ctx.save();
        ctx.shadowColor = '#ffd75c';
        ctx.shadowBlur = 6 + 7 * gp;
        ctx.globalAlpha = 0.5 + 0.3 * gp;
        ctx.drawImage(em, cxm - 21, eY, 42, 42);
        ctx.restore();
        ctx.drawImage(em, cxm - 21, eY, 42, 42);
        /* blizgesys RETAI ir atsitiktinai: kas 10-20s (kiekvienai pusei savas grafikas) */
        if (!this._embSweep) this._embSweep = { you: 2000 + Math.random() * 6000, foe: 5000 + Math.random() * 8000 };
        var swKey = isYou ? 'you' : 'foe';
        var swT = this.t - this._embSweep[swKey];
        if (swT >= 0 && swT < 750) {
          ctx.save();
          ctx.beginPath(); ctx.rect(cxm - 21, eY, 42, 42); ctx.clip();
          ctx.globalAlpha = 0.32;
          ctx.fillStyle = '#ffffff';
          ctx.translate(cxm - 21 + (swT / 750) * 52 - 6, eY);
          ctx.rotate(-0.35);
          ctx.fillRect(0, -12, 6, 68);
          ctx.restore();
        } else if (swT >= 750) {
          this._embSweep[swKey] = this.t + 10000 + Math.random() * 10000;   // kitas po 10-20s
        }
      }
      var av = this._badge(mID.ai ? 'ai_ronke_anim.png' : 'ronke_idle_anim.png');
      if (av) {
        var nfr = Math.max(1, Math.round(av.naturalWidth / 96));
        var fr = ((this.t / 140) | 0) % nfr;
        ctx.drawImage(av, fr * 96, 0, 96, 96, cxm - 21, idY + 50, 42, 42);
      }
      /* W/L: dvi kategorijos — vs AI ir PvP (serverio duomenys, abiem pusėm matomi vienodai).
       * ⚠️ Piešiam per F.* TIESIOGIAI: T.* CLEAN_UI režime yra no-op (visi tekstai užgesinti),
       * o šitie skaičiai turi matytis visada. */
      if (mID.s) {
        /* kaip rank korteleje: bold monospace + seselis. Spalvos: etiketes/bruksnys BALTI,
         * laimejimai ZALI, pralaimejimai RAUDONI (user 08-09). */
        ctx.save();
        ctx.font = 'bold 9px Consolas, "Cascadia Mono", monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        var wlLine = function (parts, y) {
          var tot = 0, i2;
          for (i2 = 0; i2 < parts.length; i2++) tot += ctx.measureText(parts[i2][0]).width;
          var x = cxm - tot / 2;
          for (i2 = 0; i2 < parts.length; i2++) {
            ctx.fillStyle = '#0a0c14';
            ctx.fillText(parts[i2][0], x + 1, y + 1);
            ctx.fillStyle = parts[i2][1];
            ctx.fillText(parts[i2][0], x, y);
            x += ctx.measureText(parts[i2][0]).width;
          }
        };
        wlLine([['AI ', '#ffffff'], [String(mID.s.aiW | 0), '#5ce08a'], ['-', '#ffffff'], [String(mID.s.aiL | 0), '#ff7070']], idY + 105);
        wlLine([['PVP ', '#ffffff'], [String(mID.s.pvpW | 0), '#5ce08a'], ['-', '#ffffff'], [String(mID.s.pvpL | 0), '#ff7070']], idY + 118);
        /* 🎖️ per maca surinktas XP (gyvas skaitliukas — auga su kiekviena linija) */
        if (isYou && this._m && this._m._xpTotal > 0) {
          ctx.textAlign = 'center';
          ctx.fillStyle = '#0a0c14';
          ctx.fillText('XP +' + this._m._xpTotal, cxm + 1, idY + 132 + 1);
          ctx.fillStyle = '#ffd75c';
          ctx.fillText('XP +' + this._m._xpTotal, cxm, idY + 132);
        }
        ctx.restore();
      }
    }

    /* --- pavojaus būsena --- */
    var danger = eng.board.stackHeight() >= C.ROWS - C.JUICE.DANGER_ROWS;
    var dPulse = danger ? (0.5 + 0.5 * Math.sin(this.t / 170)) : 0;

    /* --- akmeninė duobė --- */
    stoneFrame(ctx, bx, by, C.BOARD_W, LAY.BOARD_H, 4);
    rect(ctx, bx, by, C.BOARD_W, LAY.BOARD_H, U.panel2);

    if (C.SHOW_GRID) {
      /* skiedinio siūlės: kas antra eilė pastumta -> mūro raštas, ne tinklelis */
      ctx.fillStyle = '#151d2b';
      for (var gy = 1; gy < C.ROWS; gy++) ctx.fillRect(bx, by + gy * cell, C.BOARD_W, 1);
      for (var gr = 0; gr < C.ROWS; gr++) {
        var shift = (gr % 2) ? Math.floor(cell / 2) : 0;
        for (var gx = 0; gx <= C.COLS; gx++) {
          var vx = bx + gx * cell + shift;
          if (vx > bx && vx < bx + C.BOARD_W) ctx.fillRect(vx, by + gr * cell, 1, cell);
        }
      }
    }

    /* --- fakelo šviesa iš viršaus (šiltas gradientas su virpėjimu) --- */
    var flick = 0.86 + 0.14 * Math.sin(this.t / 130) * Math.sin(this.t / 47);
    for (var tb = 0; tb < 14; tb++) {
      ctx.globalAlpha = clamp01(0.055 * (1 - tb / 14) * flick);
      rect(ctx, bx, by + tb * 4, C.BOARD_W, 4, U.torch);
    }
    ctx.globalAlpha = 1;

    /* PASTABA: statinės pavojaus linijos NĖRA (nuimta sąmoningai) — pavojų rodo
     * tik pulsuojanti vinjetė, rėmas ir širdies dūžis. */

    var pend = eng.garbage.pending();

    /* --- hard-drop šleifai (po blokais) --- */
    ch.trails.forEach(function (tr) {
      var a0 = tr.life / tr.max;
      for (var s = 1; s <= 3; s++) {
        var f = s / 4;
        var yy = tr.y0 + (tr.y1 - tr.y0) * f;
        ctx.globalAlpha = a0 * 0.30 * f;
        for (var ci = 0; ci < tr.cells.length; ci++) {
          var cyy = Math.round(yy) + tr.cells[ci][1];
          if (cyy < C.BUFFER) continue;
          var col = C.COLORS[tr.type][0];
          rect(ctx, bx + (tr.px + tr.cells[ci][0]) * cell, by + (cyy - C.BUFFER) * cell, cell, cell, col);
        }
        ctx.globalAlpha = 1;
      }
    });

    /* --- uždėti blokai --- */
    var g = eng.board.grid;
    for (var y = C.BUFFER; y < eng.board.rows; y++) {
      for (var x = 0; x < C.COLS; x++) {
        var t = g[y][x];
        if (t) block(ctx, bx + x * cell, by + (y - C.BUFFER) * cell, cell, t);
      }
    }

    /* ⚡ hard-drop ATSPAUDAI: įsitvirtinusi figūra ~120ms šviečia baltai ir išblunka */
    ch.stamps.forEach(function (st) {
      var sa = st.life / st.max;
      var grow = (1 - sa) * 0.55;   // 💥 shockwave: figūros formos kontūras plečiasi į išorę
      var scol = (C.COLORS[st.type] || ['#ffffff'])[0];
      for (var sci = 0; sci < st.cells.length; sci++) {
        var syy = st.py + st.cells[sci][1];
        if (syy < C.BUFFER) continue;
        var sx0 = bx + (st.px + st.cells[sci][0]) * cell;
        var sy0 = by + (syy - C.BUFFER) * cell;
        ctx.globalAlpha = sa * 0.45;
        rect(ctx, sx0 - cell * grow / 2, sy0 - cell * grow / 2, cell * (1 + grow), cell * (1 + grow), scol);
        ctx.globalAlpha = sa * sa * 0.9;
        rect(ctx, sx0, sy0, cell, cell, '#ffffff');
      }
      ctx.globalAlpha = 1;
    });

    /* --- linijų blyksnis: baltas žybsnis + besiplečiantis wipe + susitraukiantis plyšys --- */
    ch.flash.forEach(function (fl) {
      var a = fl.t / fl.max;
      var ease = a * a;
      fl.rows.forEach(function (ry) {
        if (ry < C.BUFFER) return;
        var ry0 = by + (ry - C.BUFFER) * cell;
        /* 1) visa eilutė balta, greitai gęsta */
        ctx.globalAlpha = ease;
        rect(ctx, bx, ry0, C.BOARD_W, cell, '#ffffff');
        /* 2) wipe nuo centro į šonus */
        var w2 = Math.round((1 - a) * C.BOARD_W / 2);
        ctx.globalAlpha = a * 0.8;
        rect(ctx, bx + C.BOARD_W / 2 - w2, ry0 - 2, w2 * 2, cell + 4, '#ffffff');
        /* 3) plonėjantis ryškus plyšys eilutės viduryje */
        var slit = Math.max(1, Math.round(cell * a * 0.6));
        ctx.globalAlpha = Math.min(1, a * 1.4);
        rect(ctx, bx - 3, ry0 + (cell - slit) / 2, C.BOARD_W + 6, slit, '#ffffff');
        ctx.globalAlpha = 1;
      });
    });

    /* --- šviesos pluoštai pro lentos šonus --- */
    ch.beams.forEach(function (bm) {
      var a = bm.life / bm.max;
      var ext = Math.round(60 * (1 - a));
      var hh = Math.max(1, Math.round(cell * a));
      ctx.globalAlpha = a * 0.75;
      rect(ctx, bx - ext, by + bm.y - hh / 2, ext, hh, bm.c);
      rect(ctx, bx + C.BOARD_W, by + bm.y - hh / 2, ext, hh, bm.c);
      ctx.globalAlpha = a * 0.35;
      rect(ctx, bx - ext, by + bm.y - 1, ext + C.BOARD_W + ext, 2, bm.c);
      ctx.globalAlpha = 1;
    });

    /* --- šešėlis + aktyvi figūra --- */
    if (eng.cur && eng.state === 'playing') {
      var cur = eng.cur, cells = P.CELLS[cur.type][cur.rot];
      /* 🛰️ INTERP: oponento figūra piešiama iš EASED display-pozicijos (_piDX/_piDY), kad tarp
       *   snapshot'ų slinktų sklandžiai, o ne šokinėtų. Savo lentai (_piDX==null) — tiesiai cur.x/cur.y
       *   (lokaliai jau sklandu). Fallback: nesant interp būsenos, elgiasi kaip anksčiau. */
      var pcx = (eng._piDX != null) ? eng._piDX : cur.x;
      var pcy = (eng._piDY != null) ? eng._piDY : cur.y;
      if (C.SHOW_GHOST) {
        var gyy = eng.ghostY();
        for (k = 0; k < cells.length; k++) {
          var gyr = gyy + cells[k][1];
          if (gyr >= C.BUFFER) ghostBlock(ctx, bx + (pcx + cells[k][0]) * cell, by + (gyr - C.BUFFER) * cell, cell, cur.type);
        }
      }
      var lockA = eng.resting ? (0.55 + 0.45 * Math.cos(eng.lockTimer / C.LOCK_DELAY * Math.PI)) : 1;
      for (k = 0; k < cells.length; k++) {
        var yy2 = pcy + cells[k][1];
        if (yy2 >= C.BUFFER) block(ctx, bx + (pcx + cells[k][0]) * cell, by + (yy2 - C.BUFFER) * cell, cell, cur.type, lockA);
      }
    }

    /* --- dalelės --- */
    ch.parts.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      rect(ctx, bx + p.x, by + p.y, p.sz, p.sz, p.c);
      ctx.globalAlpha = 1;
    });

    /* --- smūgio žiedai --- */
    ch.rings.forEach(function (r) {
      ringShape(ctx, bx + r.x, by + r.y, r.r, r.c, (r.life / r.max) * 0.85);
    });

    /* --- ĮSPĖJIMAS: ateinančių garbage linijų GHOST preview lentos apačioj --- */
    if (pend > 0 && eng.state === 'playing') this.drawGhostGarbage(bx, by, cell, eng);

    /* --- pavojaus vinjetė --- */
    if (danger) {
      ctx.globalAlpha = 0.10 + dPulse * 0.22;
      for (i = 0; i < 5; i++) {
        frame(ctx, bx + i, by + i, C.BOARD_W - i * 2, LAY.BOARD_H - i * 2, U.danger);
      }
      ctx.globalAlpha = 1;
    }

    /* --- CHUNKY AKMENS RĖMAS: 4px juosta su bevel (viršus/kairė šviesu, apačia/dešinė tamsu)
     *     + ◇ gemų kampai. Pavojuj → raudona; per kūjo smūgį → kalvės švytėjimas. --- */
    var t = 4, fx = bx - t, fy = by - t, fw = C.BOARD_W + t * 2, fh = LAY.BOARD_H + t * 2;
    var stone = danger ? lerpHex(U.stone, U.danger, 0.45) : U.stone;
    var sLite = danger ? lerpHex(U.stoneLight, U.danger, 0.35) : U.stoneLight;
    var sDark = danger ? lerpHex(U.stoneDark, '#000000', 0.3) : U.stoneDark;
    if (ch.floorGlow > 0.01) {
      stone = lerpHex(stone, U.torch, clamp01(ch.floorGlow * 0.6));
      sLite = lerpHex(sLite, U.torch, clamp01(ch.floorGlow));
      ctx.globalAlpha = clamp01(ch.floorGlow * 0.4);
      frame(ctx, fx - 1, fy - 1, fw + 2, fh + 2, U.torch);
      ctx.globalAlpha = 1;
    }
    /* rėmo juosta (4 strypeliai aplink lauką) */
    rect(ctx, fx, fy, fw, t, stone);                          // viršus
    rect(ctx, fx, by + LAY.BOARD_H, fw, t, stone);            // apačia
    rect(ctx, fx, by, t, LAY.BOARD_H, stone);                // kairė
    rect(ctx, bx + C.BOARD_W, by, t, LAY.BOARD_H, stone);    // dešinė
    /* bevel */
    rect(ctx, fx, fy, fw, 1, sLite);
    rect(ctx, fx, fy, 1, fh, sLite);
    rect(ctx, fx, fy + fh - 1, fw, 1, sDark);
    rect(ctx, fx + fw - 1, fy, 1, fh, sDark);
    /* tamsios briaunos (vidinė + išorinė) — atskiria nuo lauko ir fono */
    frame(ctx, bx - 1, by - 1, C.BOARD_W + 2, LAY.BOARD_H + 2, U.shadow);
    frame(ctx, fx, fy, fw, fh, U.shadow);
    /* ◇ gemų kampai */
    var gcol = danger ? U.danger : U.gem;
    drawGem(ctx, fx + 2, fy + 2, gcol);
    drawGem(ctx, fx + fw - 3, fy + 2, gcol);
    drawGem(ctx, fx + 2, fy + fh - 3, gcol);
    drawGem(ctx, fx + fw - 3, fy + fh - 3, gcol);

    /* --- plokščių šachta kairėje (švariame režime nereikia — viską rodo ghost preview) --- */
    if (!C.CLEAN_UI) {
      this.drawMeter(eng, meterX + off[0], by, LAY.METER_W, LAY.BOARD_H);
    }

    /* --- combo: rombų eilutė vietoj skaičiaus --- */
    if (eng.combo > 0) {
      var cc = eng.combo >= 4 ? U.danger : (eng.combo >= 2 ? '#ff9d3d' : U.gold);
      T.outlinedCenter(ctx, 'COMBO x' + eng.combo, bx + C.BOARD_W / 2, by + 4, cc, '#000000', eng.combo >= 3 ? 2 : 1);
      if (C.CLEAN_UI) {
        var np = Math.min(8, eng.combo);
        var pw = 9, px0 = bx + C.BOARD_W / 2 - (np - 1) * pw / 2;
        for (var pi = 0; pi < np; pi++) {
          var pulse = 0.6 + 0.4 * Math.sin(this.t / 140 + pi * 0.7);
          ctx.globalAlpha = clamp01(pulse);
          gemPip(ctx, px0 + pi * pw, by + 7, 3, cc, '#ffffff');
          ctx.globalAlpha = 1;
        }
      }
    }

    /* --- iššokantis tekstas --- */
    ch.pops.forEach(function (q) {
      var a = Math.min(1, q.life / (q.max * 0.35));
      ctx.globalAlpha = a;
      var px_ = bx + C.BOARD_W / 2, py_ = by + LAY.BOARD_H / 2 - 30 + q.y + q.dy;
      var sc_ = global.FXChannel.popScale(q);
      if (q.force) {
        /* 🎳 PINBALL popup stilius (feedback.js _paintPop): spalvotas švytėjimas + šešėlis +
         * storas rudas kontūras (8 kryptys) + užpildas (baltas blyksnis pirmus 60ms) + blikas. */
        var fpx = Math.max(11, Math.round(8 * sc_));
        var eo = Math.max(1, fpx * 0.09);
        var fl = (q.max - q.life) < 60;
        ctx.save();
        ctx.translate(px_, py_);
        ctx.font = 'bold ' + fpx + 'px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = a * 0.28; ctx.fillStyle = q.color;
        ctx.save(); ctx.scale(1.35, 1.35); ctx.fillText(q.txt, 0, 0); ctx.restore();
        ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#000'; ctx.fillText(q.txt, eo, eo * 1.6);
        ctx.globalAlpha = a * 0.92; ctx.fillStyle = '#1a0e04';
        var OUT8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (var oi = 0; oi < 8; oi++) ctx.fillText(q.txt, OUT8[oi][0] * eo, OUT8[oi][1] * eo);
        ctx.globalAlpha = a; ctx.fillStyle = fl ? '#ffffff' : q.color; ctx.fillText(q.txt, 0, 0);
        ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#fff'; ctx.fillText(q.txt, 0, -eo * 0.8);
        ctx.restore();
      } else {
        T.outlinedCenter(ctx, q.txt, px_, py_, q.color, q.outline, sc_);
      }
      ctx.globalAlpha = 1;
    });

    /* --- pėda --- */
    T.text(ctx, 'PPS ' + eng.pps().toFixed(2), holdX, LAY.FOOT_Y, U.dim, 1);
    T.text(ctx, 'PCS ' + st.pieces, holdX, LAY.FOOT_Y + 10, U.dim, 1);
    T.right(ctx, 'ATK IN ' + st.received, nextX + LAY.NEXT_W, LAY.FOOT_Y, U.dim, 1);
    T.right(ctx, 'MAX CMB ' + st.maxCombo, nextX + LAY.NEXT_W, LAY.FOOT_Y + 10, U.dim, 1);

    if (eng.state === 'dead') {
      ctx.globalAlpha = 0.62;
      rect(ctx, bx, by, C.BOARD_W, LAY.BOARD_H, '#000000');
      ctx.globalAlpha = 1;
      T.outlinedCenter(ctx, 'TOPPED', bx + C.BOARD_W / 2, by + LAY.BOARD_H / 2 - 14, U.danger, '#000000', 2);
      T.outlinedCenter(ctx, 'OUT', bx + C.BOARD_W / 2, by + LAY.BOARD_H / 2 + 4, U.danger, '#000000', 2);
      if (C.CLEAN_UI) {
        /* lenta suskilusi — trys plyšiai per visą duobę */
        ctx.globalAlpha = 0.85;
        crackLine(ctx, bx + C.BOARD_W * 0.18, by, bx + C.BOARD_W * 0.62, by + LAY.BOARD_H, U.danger, 5);
        crackLine(ctx, bx + C.BOARD_W * 0.82, by, bx + C.BOARD_W * 0.44, by + LAY.BOARD_H, U.danger, 4);
        crackLine(ctx, bx, by + LAY.BOARD_H * 0.55, bx + C.BOARD_W, by + LAY.BOARD_H * 0.42, U.danger, 3);
        ctx.globalAlpha = 1;
      }
    }
  };

  /* ---------- ateinančios atakos indikatoriai (BE UŽRAŠŲ) ---------- */

  /* ĮSPĖJIMAS = ĮTRŪKUSIOS GRINDYS.
   *
   * Kas kūjo smūgis (2 s, 1 s) plyšių daugiau, o pro juos vis stipriau prasimuša
   * kalvės šviesa iš požemio — kažkas mušasi į tavo pilies grindis iš apačios.
   * Jokių tolydžių gradientų: informaciją neša DISKRETŪS įvykiai, kuriuos gali suskaičiuoti. */
  var CRACK_SHAPES = [
    /* kiekvienas plyšys = zigzago taškai [dx nuo kairės (0..1), dy nuo grindų (px)] */
    [[0.04, 0], [0.16, -3], [0.27, -1], [0.38, -5], [0.47, -2]],
    [[0.52, -1], [0.63, -4], [0.72, -2], [0.84, -6], [0.96, -2]],
    [[0.20, -6], [0.33, -9], [0.44, -7], [0.58, -11], [0.70, -8]]
  ];

  Renderer.prototype.drawFloorWarn = function (bx, by, cell, ch, pend) {
    var ctx = this.ctx;
    var floorY = by + LAY.BOARD_H - 1;
    var k = ch.cracks;
    var glow = ch.floorGlow;
    if (k <= 0 && glow <= 0.01) return;

    /* 1) Šviesa, sklindanti iš plyšių aukštyn į duobę */
    var lit = clamp01(k / 3 * 0.5 + glow * 0.5);
    for (var b = 0; b < 10; b++) {
      ctx.globalAlpha = clamp01(0.05 * lit * (1 - b / 10));
      rect(ctx, bx, floorY - (b + 1) * 3, C.BOARD_W, 3, U.torch);
    }
    ctx.globalAlpha = 1;

    /* 2) Patys plyšiai — auga po vieną su kiekvienu smūgiu */
    for (var c = 0; c < Math.min(k, CRACK_SHAPES.length); c++) {
      var pts = CRACK_SHAPES[c];
      var a = clamp01(0.55 + glow * 0.45);
      ctx.globalAlpha = a;
      ctx.fillStyle = lerpHex(U.torch, '#ffffff', glow * 0.7);
      for (var p = 0; p < pts.length - 1; p++) {
        var x0 = bx + pts[p][0] * C.BOARD_W, y0 = floorY + pts[p][1];
        var x1 = bx + pts[p + 1][0] * C.BOARD_W, y1 = floorY + pts[p + 1][1];
        var steps = Math.max(1, Math.abs(x1 - x0) | 0);
        for (var s = 0; s <= steps; s++) {
          var t = s / steps;
          ctx.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    /* 3) Plokščių viršūnės, prasikišusios pro grindis — kuo daugiau linijų, tuo daugiau */
    var push = 1 + k;
    var show = Math.min(C.COLS, pend * 3);
    ctx.globalAlpha = clamp01(0.35 + k * 0.2);
    for (var i2 = 0; i2 < show; i2++) {
      var gx2 = bx + ((i2 * 3 + (i2 % 2)) % C.COLS) * cell + 2;
      rect(ctx, gx2, floorY - push, cell - 4, push, C.COLORS.G[0]);
      rect(ctx, gx2, floorY - push, cell - 4, 1, C.COLORS.G[1]);
    }
    ctx.globalAlpha = 1;

    /* 4) Grindų linija blyksteli per smūgį */
    if (glow > 0.01) {
      ctx.globalAlpha = clamp01(glow);
      rect(ctx, bx, floorY - 1, C.BOARD_W, 2, lerpHex(U.torch, '#ffffff', glow));
      ctx.globalAlpha = 1;
    }
  };

  /* ĮSPĖJIMAS lentoj: TIK pulsuojanti grindų linija + švelnus švytėjimas nuo apačios.
   * Rodyklės ant krūvos NEBEPIEŠIAM (pasimesdavo tarp blokų). Pagrindinis indikatorius
   * dabar = ryški ŠONINĖ juosta (drawMeter). Čia tik „kažkas kyla iš apačios" akcentas. */
  /* FIZINIS PREVIEW: artimiausia garbage eilutė (su TIKRA skyle) LĖTAI įslenka iš apačios
   * per 3 s — matai realiai kaip kyla. t01=1 (ką tik atėjo) → dar po grindim (nematyti);
   * t01=0 (tuoj kris) → jau visos eilutės apačioj. Ryški KYLANTI priekinė briauna rodo frontą.
   * Blokai apkarpomi ties grindim rankiniu būdu (ne ctx.clip — kad testo stub'as veiktų). */
  Renderer.prototype.drawGhostGarbage = function (bx, by, cell, eng) {
    var ctx = this.ctx;
    var snap = eng.garbage.snapshot(eng.time);
    if (!snap.length) return;
    var front = snap[0];
    var lines = Math.min(front.lines, C.ROWS);
    var hole = (front.holes && front.holes.length) ? front.holes[0] : 0;
    var urg = clamp01(1 - front.t01);
    var floorY = by + LAY.BOARD_H;
    var bandH = lines * cell;
    var t = eng.time;
    var offset = Math.round((1 - urg) * bandH);              // t01*bandH: pradžioj visa po grindim
    /* SKLANDUS drebulys artėjant kritimui (sine, ne binarinis ±1 jitter = „buggy") */
    var near = clamp01(1 - front.remain / 600);
    var shake = Math.round(Math.sin(t / 30) * near * near * 2);
    var topY = floorY - (bandH - offset) + shake;            // kylančio fronto viršus

    /* Įspėjimo spalva + PULSUOJANTIS blokų švytėjimas (gyvas, pavojingas) */
    var warn = urg < 0.5 ? lerpHex('#ffa53c', '#ff6a2c', urg * 2)
                         : lerpHex('#ff6a2c', '#e63232', (urg - 0.5) * 2);
    var pulse = 0.5 + 0.5 * Math.sin(t / 110);
    var lite = lerpHex(warn, '#fff2d0', 0.4 + pulse * 0.25);
    var dark = lerpHex(warn, '#2a0e04', 0.55);

    /* 1) „heat" švytėjimas virš fronto (minkštas, kylantis) */
    if (topY > by) {
      for (var b = 1; b <= 8; b++) {
        ctx.globalAlpha = clamp01((0.11 + urg * 0.15) * (1 - b / 9));
        rect(ctx, bx, topY - b, C.BOARD_W, 1, warn);
      }
      ctx.globalAlpha = 1;
    }

    /* 2) KYLANTYS ŽĖRUČIAI (embers) — JUICE; deterministiniai (jokio mirgėjimo) */
    var em = 7 + lines * 2, span = bandH + 26;
    for (var e = 0; e < em; e++) {
      var sd = e * 71 + 17;
      var ex = bx + ((sd * 13) % C.BOARD_W);
      var rise = (t * (0.028 + (e % 3) * 0.012) + sd * 5) % span;
      var ey = floorY + shake - rise;
      if (ey > floorY || ey < topY - 22) continue;
      ctx.globalAlpha = clamp01((1 - rise / span) * (0.45 + urg * 0.5));
      var es = 1 + (e % 2);
      rect(ctx, ex, ey, es, es, (e % 2) ? '#ffdf9a' : warn);
    }
    ctx.globalAlpha = 1;

    /* 3) kylančios garbage eilutės — ŽĖRINTYS blokai (su tikra skyle), apkarpom ties grindim */
    for (var i = 0; i < lines; i++) {
      var ry = floorY - (i + 1) * cell + offset + shake;
      var h = Math.min(ry + cell, floorY) - ry;
      if (h <= 0) continue;
      for (var c = 0; c < C.COLS; c++) {
        if (c === hole) continue;                             // TIKRA skylė lieka atvira
        var x = bx + c * cell;
        rect(ctx, x, ry, cell, h, dark);
        var ih = h - 2;
        if (ih > 0) {
          rect(ctx, x + 1, ry + 1, cell - 2, ih, warn);
          rect(ctx, x + 1, ry + 1, cell - 2, 1, lite);
          rect(ctx, x + 1, ry + 1, 1, ih, lite);
        }
      }
    }

    /* 4) storas ŠVYTINTIS PULSUOJANTIS frontas */
    if (topY > by && topY < floorY) {
      var ep = 0.72 + 0.28 * Math.sin(t / 85);
      ctx.globalAlpha = clamp01(0.55 * ep);
      rect(ctx, bx, topY - 1, C.BOARD_W, 1, '#ffffff');
      ctx.globalAlpha = clamp01((0.78 + urg * 0.22) * ep);
      rect(ctx, bx, topY, C.BOARD_W, 2, lerpHex(warn, '#ffffff', 0.6));
      ctx.globalAlpha = 1;
    }

    /* 5) tuoj kris — VISA banda pulsuoja baltai (SKLANDU, ne strobas) */
    if (front.remain < 340 && topY < floorY) {
      var f = clamp01(1 - front.remain / 340);
      ctx.globalAlpha = clamp01(f * (0.14 + 0.22 * (0.5 + 0.5 * Math.sin(t / 45))));
      rect(ctx, bx, topY, C.BOARD_W, floorY - topY, '#ffffff');
      ctx.globalAlpha = 1;
    }
  };

  /* ŠONINĖ GARBAGE JUOSTA — PAGRINDINIS ateinančių linijų indikatorius.
   * Ryškūs įspėjimo segmentai kaupiasi iš apačios (kiekvienas = 1 linija), spalva
   * gintaras→oranžinė→raudona kuo arčiau kritimo, kylantis energijos „sweep", pulsuojantis
   * viršaus dangtis, o tuoj krentant — visas fill blyksti + virpa. Skaitosi iš periferijos. */
  Renderer.prototype.drawMeter = function (eng, x, y, w, h) {
    var ctx = this.ctx;
    var cell = C.CELL;
    var snap = eng.garbage.snapshot(eng.time);
    var pend = 0, si; for (si = 0; si < snap.length; si++) pend += snap[si].lines;
    var front = snap.length ? snap[0] : null;
    var urg = front ? clamp01(1 - front.t01) : 0;
    var imm = front && front.remain < 450;

    /* tamsus slot + rėmas */
    rect(ctx, x, y, w, h, '#0e0910');
    frame(ctx, x - 1, y - 1, w + 2, h + 2, '#000000');
    if (pend <= 0) { rect(ctx, x - 1, y + h, w + 2, 2, U.stoneDark); return; }

    var col = urg < 0.5 ? lerpHex('#ffb347', '#ff7a3c', urg * 2)
                        : lerpHex('#ff7a3c', '#e23b3b', (urg - 0.5) * 2);
    var hot = lerpHex(col, '#ffffff', 0.35 + urg * 0.45);
    var dk = lerpHex(col, '#000000', 0.5);

    var segH = cell;
    var fillN = Math.min(pend, Math.floor(h / segH));
    var jit = imm && (((eng.time / 55) | 0) % 2) ? 1 : 0;

    /* chunky segmentai iš apačios — kiekvienas = 1 linija */
    for (var s = 0; s < fillN; s++) {
      var sy = y + h - (s + 1) * segH + jit;
      rect(ctx, x, sy, w, segH - 1, col);
      rect(ctx, x, sy, w, 1, hot);                 // viršaus blikas
      rect(ctx, x, sy, 1, segH - 1, hot);          // kairė
      rect(ctx, x, sy + segH - 2, w, 1, dk);       // apačios šešėlis
      rect(ctx, x + w - 1, sy, 1, segH - 1, dk);   // dešinė
    }
    var fillTop = y + h - fillN * segH + jit;

    /* kylantis šviesos sweep (energija kyla į viršų) */
    var sweep = (eng.time * (0.045 + urg * 0.09)) % (fillN * segH + 24);
    var swy = y + h - sweep;
    if (swy > fillTop - 4 && swy < y + h) {
      ctx.globalAlpha = 0.75; rect(ctx, x, swy, w, 2, '#fff6dc');
      ctx.globalAlpha = 0.3;  rect(ctx, x, swy + 2, w, 4, hot);
      ctx.globalAlpha = 1;
    }

    /* viršutinis dangtis — ryškus pulsuojantis = dabartinis lygis */
    var pulse = 0.6 + 0.4 * Math.sin(eng.time / (230 - urg * 150));
    ctx.globalAlpha = clamp01((0.7 + urg * 0.3) * pulse);
    rect(ctx, x - 2, fillTop - 2, w + 4, 2, hot);
    ctx.globalAlpha = 1;

    /* dugnas — pro čia įeina į lentą */
    rect(ctx, x - 1, y + h, w + 2, 2, col);

    /* tuoj kris — visas fill blyksti baltai (ritmiškai) */
    if (imm) {
      var ff = clamp01(1 - front.remain / 450);
      ctx.globalAlpha = ff * (((eng.time / 60) | 0) % 2 ? 0.55 : 0.15);
      rect(ctx, x, fillTop, w, y + h - fillTop, '#ffffff');
      ctx.globalAlpha = 1;
    }
  };

  /* ---------- vidurio skirtukas + "pressure" juosta ---------- */

  Renderer.prototype.drawDivider = function (match) {
    var ctx = this.ctx, x = LAY.HALF;
    /* Švariame režime jokios kolonos, herbo ar spaudimo juostos — tik dvi lentos. */
    if (C.CLEAN_UI) return;
    /* akmeninė kolona per vidurį */
    rect(ctx, x - 3, 0, 6, this.vh, U.stoneDark);
    for (var sy = 0; sy < this.vh; sy += 14) {
      rect(ctx, x - 2, sy, 4, 12, ((sy / 14) | 0) % 2 ? U.stone : U.stoneLight);
    }
    rect(ctx, x - 3, 0, 1, this.vh, U.shadow);
    rect(ctx, x + 2, 0, 1, this.vh, U.shadow);

    /* laikas viršuje — ant medinės lentelės */
    var ms = Math.max(match.you.time, match.foe.time);
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    var tt = (m < 10 ? '0' : '') + m + ':' + ((s % 60) < 10 ? '0' : '') + (s % 60);
    if (!C.CLEAN_UI) {
      plaque(ctx, x - 21, 3, 42, 15, U.gold);
      T.center(ctx, tt, x, 7, U.text, 1);
    }

    /* VS — herbo skydas */
    var cy = 62;
    shield(ctx, x, cy, 26, U.panel, U.gold);
    T.center(ctx, 'VS', x, cy - 9, U.gold, 2);

    /* PRESSURE: kieno atakos dominuoja */
    var by0 = 100, bh = 190, bw = 12, bx0 = x - bw / 2;
    T.center(ctx, 'AI', x, by0 - 11, U.foe, 1);
    rect(ctx, bx0, by0, bw, bh, '#1a120c');
    frame(ctx, bx0 - 1, by0 - 1, bw + 2, bh + 2, U.shadow);

    var a = match.you.stats.sent, b = match.foe.stats.sent;
    var tot = a + b;
    var share = tot > 0 ? a / tot : 0.5;
    var fillH = Math.round(bh * share);
    rect(ctx, bx0 + 1, by0 + bh - fillH, bw - 2, fillH - 1, U.you);
    rect(ctx, bx0 + 1, by0 + 1, bw - 2, bh - fillH - 1, U.foe);
    /* centrinė žymė */
    rect(ctx, bx0 - 2, by0 + bh / 2, bw + 4, 1, U.dim);
    /* dabartinė riba */
    rect(ctx, bx0 - 2, by0 + bh - fillH, bw + 4, 1, '#ffffff');
    T.center(ctx, 'YOU', x, by0 + bh + 4, U.you, 1);
    T.center(ctx, String(a), x, by0 + bh + 15, U.you, 1);
    T.center(ctx, String(b), x, by0 - 21, U.foe, 1);
  };

  /* ---------- globalūs efektai ---------- */

  Renderer.prototype.drawProjectiles = function (fx) {
    var ctx = this.ctx;
    fx.projectiles.forEach(function (p) {
      var t = Math.min(1, p.t / p.dur);
      var ease = t * t * (3 - 2 * t);
      var px = p.x0 + (p.x1 - p.x0) * ease;
      var py = p.y0 + (p.y1 - p.y0) * ease + Math.sin(ease * Math.PI) * p.arc;

      /* uodega */
      for (var s = 1; s <= 5; s++) {
        var tt = Math.max(0, ease - s * 0.045);
        var tx = p.x0 + (p.x1 - p.x0) * tt;
        var ty = p.y0 + (p.y1 - p.y0) * tt + Math.sin(tt * Math.PI) * p.arc;
        ctx.globalAlpha = 0.5 * (1 - s / 6);
        rect(ctx, tx - 2, ty - 2, 4, 4, p.c);
        ctx.globalAlpha = 1;
      }

      /* Branduolys — mini "šiukšlių krūva": tiek juostelių, kiek linijų atskrenda.
       * Jokių skaičių: kiekis matomas iš dydžio. */
      var rows = Math.min(6, p.lines);
      var bw = 12 + Math.round(Math.sin(p.spin) * 2);
      var bh = rows * 3 + 2;
      rect(ctx, px - bw / 2 - 1, py - bh / 2 - 1, bw + 2, bh + 2, '#ffffff');
      rect(ctx, px - bw / 2, py - bh / 2, bw, bh, p.c);
      for (var r = 0; r < rows; r++) {
        rect(ctx, px - bw / 2 + 1, py - bh / 2 + 1 + r * 3, bw - 2, 2,
          (r % 2) ? '#ffffff' : '#0a0c14');
      }
    });
  };

  Renderer.prototype.drawConfetti = function (fx) {
    var ctx = this.ctx;
    fx.confetti.forEach(function (c) {
      var w = (Math.sin(c.rot) > 0) ? c.sz : Math.max(1, c.sz - 1);
      rect(ctx, c.x, c.y, w, c.sz, c.c);
    });
  };

  /* ---------- perdangos ---------- */

  Renderer.prototype.dim = function (a) {
    var ctx = this.ctx;
    ctx.globalAlpha = a;
    rect(ctx, 0, 0, this.vw, this.vh, '#0d0906');
    ctx.globalAlpha = 1;
  };

  /* Krentančios figūros meniu fone. */
  Renderer.prototype.drawMenuBits = function (dt) {
    var ctx = this.ctx, i;
    if (!this.menuBits) {
      this.menuBits = [];
      for (i = 0; i < 16; i++) {
        this.menuBits.push({
          x: Math.random() * this.vw, y: Math.random() * this.vh,
          vy: 0.012 + Math.random() * 0.030,
          type: global.RNG.TYPES[(Math.random() * 7) | 0],
          rot: (Math.random() * 4) | 0,
          cell: 6 + ((Math.random() * 5) | 0)
        });
      }
    }
    for (i = 0; i < this.menuBits.length; i++) {
      var b = this.menuBits[i];
      b.y += b.vy * dt;
      if (b.y > this.vh + 30) { b.y = -30; b.x = Math.random() * this.vw; }
      ctx.globalAlpha = 0.13;
      var cells = P.CELLS[b.type][b.rot];
      for (var k = 0; k < cells.length; k++) {
        rect(ctx, b.x + cells[k][0] * b.cell, b.y + cells[k][1] * b.cell, b.cell - 1, b.cell - 1, C.COLORS[b.type][0]);
      }
      ctx.globalAlpha = 1;
    }
  };

  /* ŠVARUS meniu: keturi skydai su rombais vietoj pavadinimų ir sudėtingumo skaičių. */
  Renderer.prototype.drawMenuClean = function (match, dt) {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    this.dim(0.84);
    this.drawMenuBits(dt);

    var keys = ['EASY', 'NORMAL', 'HARD', 'INSANE'];
    var sw = 36, gap = 18;
    var total = keys.length * sw + (keys.length - 1) * gap;
    var x0 = cx - total / 2 + sw / 2;

    for (var i = 0; i < keys.length; i++) {
      var sel = keys[i] === match.aiLevel;
      var sx = x0 + i * (sw + gap);
      var sy = cy - (sel ? 6 : 0);
      if (sel) {
        /* pasirinktą skydą apgaubia švytėjimas */
        ctx.globalAlpha = clamp01(0.20 + 0.15 * Math.sin(this.t / 260));
        shield(ctx, sx, sy, sw + 8, U.gold, U.gold);
        ctx.globalAlpha = 1;
      }
      shield(ctx, sx, sy, sw, sel ? U.panel : '#1d150f', sel ? U.gold : U.stoneDark);
      /* rombai = sudėtingumo pakopa */
      for (var j = 0; j <= i; j++) {
        var per = Math.min(3, i + 1);
        var row = (j / per) | 0, col = j % per;
        gemPip(ctx, sx - (per - 1) * 5 + col * 10, sy - 6 + row * 11, 3,
          sel ? U.gold : U.stoneDark, sel ? '#ffffff' : null);
      }
    }

    /* pulsuojantis „paspausk" indikatorius — trys kylantys rombai */
    for (var k = 0; k < 3; k++) {
      var ph = ((this.t / 900) + k / 3) % 1;
      ctx.globalAlpha = clamp01(Math.sin(ph * Math.PI) * 0.7);
      gemPip(ctx, cx, cy + 74 - ph * 22, 4, U.text, U.gold);
      ctx.globalAlpha = 1;
    }
  };

  Renderer.prototype.drawMenu = function (match, dt) {
    var ctx = this.ctx, cx = this.vw / 2;
    if (C.CLEAN_UI) { this.drawMenuClean(match, dt); return; }
    this.dim(0.86);
    this.drawMenuBits(dt);

    /* meniu turinys suprojektuotas 360 px aukščiui — aukštesniame lange centruojam */
    var oy = Math.floor((this.vh - C.VH) / 2);
    if (oy) ctx.translate(0, oy);

    var bob = Math.round(Math.sin(this.t / 420) * 2);
    T.outlinedCenter(ctx, 'PVP TETRIS', cx, 40 + bob, U.gold, '#000000', 4);
    T.center(ctx, '1 V 1  BLOCK BATTLE', cx, 74, U.text, 1);

    /* sudėtingumas */
    panel(ctx, cx - 156, 92, 312, 46);
    T.center(ctx, 'OPPONENT   [ 1 - 4 TO CHANGE ]', cx, 97, U.dim, 1);
    var keys = ['EASY', 'NORMAL', 'HARD', 'INSANE'];
    var bw = 70, gap = 6, totalW = keys.length * bw + (keys.length - 1) * gap;
    var x0 = cx - totalW / 2;
    for (var i = 0; i < keys.length; i++) {
      var sel = keys[i] === match.aiLevel;
      var bx = x0 + i * (bw + gap);
      rect(ctx, bx, 110, bw, 20, sel ? '#2b3358' : U.panel2);
      frame(ctx, bx, 110, bw, 20, sel ? U.gold : U.line);
      T.center(ctx, C.AI_LEVELS[keys[i]].name, bx + bw / 2, 114, sel ? U.gold : U.dim, 1);
      /* žvaigždutės = stiprumas */
      var stars = '';
      for (var s = 0; s <= i; s++) stars += '*';
      T.center(ctx, stars, bx + bw / 2, 123, sel ? U.gold : U.line, 1);
    }

    /* --- kairė: 3 sekundžių taisyklė --- */
    panel(ctx, cx - 190, 146, 244, 92, U.panel, U.danger);
    T.center(ctx, 'THE 3 SECOND RULE', cx - 68, 152, U.danger, 2);
    var lines = [
      'INCOMING GARBAGE WAITS 3 SECONDS',
      'BEFORE IT RISES.',
      '',
      'EVERY LINE YOU CLEAR IN THAT',
      'WINDOW BLOCKS ONE OF THEM.',
      'SPARE LINES FLY BACK - COUNTER!'
    ];
    for (var L = 0; L < lines.length; L++) {
      if (lines[L]) T.center(ctx, lines[L], cx - 68, 170 + L * 11, U.text, 1);
    }

    /* --- dešinė: atakų lentelė --- */
    panel(ctx, cx + 58, 146, 132, 92, U.panel, U.gold);
    T.center(ctx, 'ATTACK TABLE', cx + 124, 152, U.gold, 1);
    var atk = [
      ['1 LINE', 0, U.dim],
      ['2 LINES', 1, U.text],
      ['3 LINES', 2, U.text],
      ['4 LINES', 4, U.gold]
    ];
    for (var A = 0; A < atk.length; A++) {
      var ay = 168 + A * 13;
      T.text(ctx, atk[A][0], cx + 68, ay, atk[A][2], 1);
      T.text(ctx, '>', cx + 122, ay, U.line, 1);
      T.right(ctx, '+' + atk[A][1], cx + 182, ay, atk[A][2], 1);
    }
    T.center(ctx, 'BUILD UP - QUAD PAYS', cx + 124, 224, U.dim, 1);

    /* valdymas */
    panel(ctx, cx - 190, 242, 380, 62);
    T.center(ctx, 'CONTROLS', cx, 246, U.gold, 1);
    var ctrls = [
      'LEFT / RIGHT  MOVE          DOWN  SOFT DROP',
      'UP or X  ROTATE CW          Z  ROTATE CCW      A  ROTATE 180',
      'SPACE  HARD DROP            C or SHIFT  HOLD',
      'F  FULLSCREEN     P  PAUSE     M  MUTE     R  RESTART     ESC  MENU'
    ];
    for (var k = 0; k < ctrls.length; k++) T.center(ctx, ctrls[k], cx, 258 + k * 11, U.dim, 1);

    var lb = match.leaderboard();
    T.center(ctx, 'RECORD  ' + lb.wins + 'W - ' + lb.losses + 'L      BEST STREAK ' + lb.best, cx, 308, U.dim, 1);

    if (Math.sin(this.t / 260) > -0.3) {
      T.outlinedCenter(ctx, 'PRESS ENTER TO FIGHT', cx, 322, '#ffffff', '#000000', 2);
    }

    if (oy) ctx.translate(0, -oy);
  };


  Renderer.prototype.drawCountdown = function (match) {
    var ctx = this.ctx, cx = this.vw / 2;

    if (C.CLEAN_UI) {
      /* 🐵 Ronke skaičiuoja pirštais (count_to_three_sheet, 20 kadrų):
       * 0-15 @100ms → 15-as kadras laikomas 1s → 16-19 finišas — lygiai 3s countdown. */
      var cy = this.vh / 2;
      this.dim(0.5);
      var total = C.COUNTDOWN_MS || 3000;
      var el = Math.max(0, Math.min(total, total - Math.max(0, match.countdown)));
      /* seka „skaičiuojam IKI trijų": k5-k10 = 1 pirštas, k11-k14 = 2 pirštai (14-as laikomas 300ms),
       * k15 = perėjimas, k16-k19 = 3 pirštai (laikomi iki starto). k0-k4 lape = pabaigos poza, praleidžiam. */
      /* ⏱️ po ~1s kiekvienam skaičiui. FAKTINĖ lapo analizė: K4-K13 = 1 pirštas, K14 = VIENINTELIS
       * „du" kadras (juostos idx12 = userio naujas dvejetas), K15-K19 = 3 pirštai. */
      var cf;
      if (el < 1000) cf = Math.min(10, 4 + ((el / 143) | 0));                  // ☝️ K4-K10
      else if (el < 1500) cf = 12;                                             // ✌️ naujas dvejetas (0.5s)
      else if (el < 2000) cf = 14;                                             // ✌️ lapo dvejetas (0.5s — gyvumas)
      else if (el < 2400) cf = Math.min(18, 15 + (((el - 2000) / 100) | 0));   // 🤟 K15-K18
      else cf = 19;   // 🤟 finalinis kadras iki GO
      var cimg = this._badge('count_anim.png');
      if (cimg) {
        var csz = 120, cx0 = cx - csz / 2, cy0 = cy - csz / 2 - 6;
        stoneFrame(ctx, cx0 - 5, cy0 - 5, csz + 10, csz + 10, 5);
        ctx.drawImage(cimg, cf * 96, 0, 96, 96, cx0, cy0, csz, csz);
      } else {
        gemPip(ctx, cx, cy, 10, U.gold, '#ffffff');
      }
      return;
    }

    this.dim(0.55);
    var left = match.countdown;
    var idx = 3 - Math.min(3, Math.floor(left / 1000));
    var txt = C.READY_TEXT[Math.max(0, Math.min(3, idx))];
    var frac = (left % 1000) / 1000;
    var sc = 6 + Math.round((1 - frac) * 3);
    T.outlinedCenter(ctx, txt, cx, this.vh / 2 - 24, U.gold, '#000000', sc);
    T.center(ctx, 'SAME PIECE SEQUENCE FOR BOTH PLAYERS  -  SEED ' + match.seed, cx, this.vh / 2 + 34, U.dim, 1);
  };

  /* ONLINE: laukiam serverio / priešininko. Be šito ekranas atrodo „užstrigęs". */
  /* ONLINE LOBIS: QUICK MATCH / CREATE ROOM. Mygtukų stačiakampiai saugomi `match._lobbyHit`
   * (main.js paverčia paspaudimo koordinates į virtualias ir suranda pataikytą mygtuką).
   * ⚠️ Naudojam RAW `F.*` (NE `T.*`) — nes `T.*` CLEAN_UI režime NEPIEŠIA, o čia tekstas BŪTINAS
   * (mygtukų etiketės, kambario kodas). Bazinio žaidimo švarumo tai neliečia — tik online ekranai. */
  Renderer.prototype.drawLobby = function (match) {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    this.dim(0.66);
    var bw = Math.min(300, this.vw - 30), x = Math.round(cx - bw / 2);
    var rooms = match._lobbyRooms || [];
    var rowH = 26, maxRows = 4, shown = Math.min(maxRows, rooms.length);
    /* vertikaliai centruojam pagal turinį (sąrašo aukštis kinta) */
    var listH = (shown ? shown * (rowH + 5) : rowH + 6);
    var totalH = 26 + 22 + 14 + listH + 8 + 50 + 10 + 40;
    var y = Math.round(cy - totalH / 2);

    F.center(ctx, 'PVP TETRIS', cx, y, U.gold, 3); y += 26;
    F.center(ctx, 'ONLINE  1  v  1', cx, y, U.dim, 1); y += 22;

    /* ── LAUKIANČIŲ ŽAIDĖJŲ SĄRAŠAS (pakūrė matchą, laukia varžovo) ── */
    F.text(ctx, 'OPEN MATCHES', x, y, U.text, 1);
    F.right(ctx, 'tap to join', x + bw, y, U.dim, 1); y += 14;
    match._lobbyHit = [];
    if (!shown) {
      rect(ctx, x, y, bw, rowH, '#1c130a');
      frame(ctx, x, y, bw, rowH, '#3d2817');
      F.center(ctx, 'no open matches yet - host one below', cx, y + 9, U.dim, 1);
      y += rowH + 6;
    } else {
      for (var i = 0; i < shown; i++) {
        var r = rooms[i];
        rect(ctx, x, y, bw, rowH, '#241a0e');
        rect(ctx, x, y, bw, 1, '#4a3418');
        frame(ctx, x, y, bw, rowH, U.gold);
        F.text(ctx, String(r.host).slice(0, 18), x + 8, y + 9, U.gold, 1);   // host vardas
        var jw = 46, jx = x + bw - jw - 5;
        rect(ctx, jx, y + 5, jw, rowH - 10, '#2f5e2f');
        frame(ctx, jx, y + 5, jw, rowH - 10, U.good);
        F.center(ctx, 'JOIN', jx + jw / 2, y + 9, '#d8ffe0', 1);
        match._lobbyHit.push({ x: x, y: y, w: bw, h: rowH, action: 'join', roomId: r.roomId });
        y += rowH + 5;
      }
    }
    y += 8;

    /* ── HOST (public, matomas sąraše) ── */
    var bh = 40;
    rect(ctx, x, y, bw, bh, '#2a1c10'); rect(ctx, x, y, bw, 2, '#6b4a2e'); frame(ctx, x, y, bw, bh, U.gold);
    F.center(ctx, 'HOST A MATCH', cx, y + 8, U.gold, 2);
    F.center(ctx, 'wait - others pick you from the list', cx, y + 26, U.dim, 1);
    match._lobbyHit.push({ x: x, y: y, w: bw, h: bh, action: 'host' });
    y += bh + 10;

    /* ── PRIVATE (invite kodas draugui) ── */
    rect(ctx, x, y, bw, bh, '#201a2a'); rect(ctx, x, y, bw, 2, '#4a3a66'); frame(ctx, x, y, bw, bh, '#9d7ad0');
    F.center(ctx, 'PRIVATE ROOM', cx, y + 8, '#cbb0ff', 2);
    F.center(ctx, 'invite a friend by code', cx, y + 26, U.dim, 1);
    match._lobbyHit.push({ x: x, y: y, w: bw, h: bh, action: 'create' });
  };

  /* 🥊 CHALLENGE (HOST'ui): „X wants to play — accept?" — ENTER accept / ESC decline. */
  Renderer.prototype.drawChallenge = function (match) {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    this.dim(0.72);
    var pulse = 0.6 + 0.4 * Math.sin(this.t / 260);
    F.center(ctx, 'OPPONENT FOUND', cx, cy - 46, U.gold, 2);
    ctx.globalAlpha = pulse;
    F.outlinedCenter(ctx, String(match._challenger || 'PLAYER').toUpperCase(), cx, cy - 20, U.you, '#000000', 3);
    ctx.globalAlpha = 1;
    F.center(ctx, 'wants to play PVP TETRIS', cx, cy + 8, U.dim, 1);
    /* du mygtukai */
    var bw = 120, bh = 30, gap = 14, x0 = Math.round(cx - bw - gap / 2), x1 = Math.round(cx + gap / 2);
    var y = cy + 30;
    rect(ctx, x0, y, bw, bh, '#1c3a1c'); frame(ctx, x0, y, bw, bh, U.good);
    F.center(ctx, 'ACCEPT', x0 + bw / 2, y + 8, U.good, 2);
    F.center(ctx, '[ENTER]', x0 + bw / 2, y + 22, U.dim, 1);
    rect(ctx, x1, y, bw, bh, '#3a1c1c'); frame(ctx, x1, y, bw, bh, U.danger);
    F.center(ctx, 'DECLINE', x1 + bw / 2, y + 8, U.danger, 2);
    F.center(ctx, '[ESC]', x1 + bw / 2, y + 22, U.dim, 1);
    match._challengeHit = [
      { x: x0, y: y, w: bw, h: bh, action: 'accept' },
      { x: x1, y: y, w: bw, h: bh, action: 'decline' }
    ];
  };

  /* SVEČIAS: laukia host'o sprendimo. */
  Renderer.prototype.drawAwaiting = function (match) {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    this.dim(0.6);
    for (var d = 0; d < 3; d++) {
      var on = (Math.floor(this.t / 300) % 3) === d;
      gemPip(ctx, cx - 24 + d * 24, cy + 22, on ? 6 : 4, on ? U.gold : '#241a12', on ? '#ffffff' : null);
    }
    F.outlinedCenter(ctx, 'CHALLENGE SENT', cx, cy - 14, U.gold, '#000000', 2);
    F.center(ctx, 'waiting for ' + String(match._hostName || 'host') + ' to accept...', cx, cy + 44, U.dim, 1);
  };

  Renderer.prototype.drawConnecting = function (match) {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    this.dim(0.6);
    /* sukisi trys taškeliai — matosi, kad gyva, ne pakibę. RAW F.* (žr. drawLobby pastabą). */
    var st = (global.NET && global.NET.status) || 'connecting';
    var priv = !!(match._private && match.roomCode);       // PRIVATE — rodom kodą
    var msg = (st === 'open') ? (priv ? 'ROOM READY' : 'WAITING FOR OPPONENT') : 'CONNECTING';
    var n = Math.floor(this.t / 350) % 4;
    var dots = ''; for (var i = 0; i < n; i++) dots += '.';
    for (var d = 0; d < 3; d++) {
      var on = (Math.floor(this.t / 300) % 3) === d;
      gemPip(ctx, cx - 24 + d * 24, cy + (priv ? 42 : 20), on ? 6 : 4, on ? U.gold : '#241a12', on ? '#ffffff' : null);
    }
    F.outlinedCenter(ctx, msg + dots, cx, cy - (priv ? 40 : 12), U.gold, '#000000', 2);
    if (priv && st === 'open') {
      /* PRIVATE: rodom kambario kodą + kvietimo nuorodą (paspaudus — nukopijuoja). */
      F.center(ctx, 'SHARE THIS CODE WITH A FRIEND', cx, cy - 10, U.dim, 1);
      F.outlinedCenter(ctx, String(match.roomCode).toUpperCase(), cx, cy + 6, U.gold, '#000000', 3);
      F.center(ctx, match._copied ? 'LINK COPIED!' : 'TAP HERE TO COPY INVITE LINK', cx, cy + 66, match._copied ? U.good : U.text, 1);
    } else if (st === 'error') {
      F.center(ctx, 'CONNECTION FAILED  -  PRESS ESC FOR LOBBY', cx, cy + 44, U.dim, 1);
    } else if (st === 'open') {
      /* PUBLIC host / quick match — laukiam; pranešam, kad esam sąraše. */
      F.center(ctx, 'you are listed - someone can join you', cx, cy + 44, U.dim, 1);
    } else {
      F.center(ctx, 'ONLINE 1v1', cx, cy + 44, U.dim, 1);
    }
  };

  Renderer.prototype.drawPause = function () {
    var ctx = this.ctx, cx = this.vw / 2;
    if (C.CLEAN_UI) {
      var cy = this.vh / 2;
      this.dim(0.74);
      var a = clamp01(0.6 + 0.4 * Math.sin(this.t / 380));
      ctx.globalAlpha = a;
      rect(ctx, cx - 13, cy - 14, 9, 28, U.gold);
      rect(ctx, cx + 4, cy - 14, 9, 28, U.gold);
      ctx.globalAlpha = 1;
      frame(ctx, cx - 14, cy - 15, 11, 30, U.shadow);
      frame(ctx, cx + 3, cy - 15, 11, 30, U.shadow);
      return;
    }
    this.dim(0.72);
    T.outlinedCenter(ctx, 'PAUSED', cx, this.vh / 2 - 20, U.gold, '#000000', 4);
    T.center(ctx, 'P  RESUME       R  RESTART       ESC  MENU', cx, this.vh / 2 + 16, U.text, 1);
  };

  /* ŠVARUS rezultatas: laimėtoją rodo auksinis skydas ir konfeti, pralaimėjimą — suskilęs. */
  Renderer.prototype.drawResultClean = function (match) {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    var won = match.winner === 'you';
    this.dim(0.80);
    this.drawConfetti(match.fx);

    var bob = won ? Math.round(Math.sin(this.t / 320) * 2) : 0;
    var sw = 62, sy = cy - 14 + bob;

    /* 🛡️ Žaidimo skydo NEBĖRA (user 08-09): rezultatą visada rodo lygos EMBLEMOS kortelė
     * (lobby _showRankAnim). Čia tik trumpas tekstas — praktikos/nemokamiems mačams be kortelės. */
    T.center(ctx, won ? 'VICTORY!' : 'DEFEAT', cx, sy - 10, won ? U.gold : U.danger, 3);

    /* pulsuojantis „paspausk" indikatorius — trys kylantys rombai */
    for (var k = 0; k < 3; k++) {
      var ph = ((this.t / 900) + k / 3) % 1;
      ctx.globalAlpha = clamp01(Math.sin(ph * Math.PI) * 0.7);
      gemPip(ctx, cx, cy + 74 - ph * 22, 4, U.text, U.gold);
      ctx.globalAlpha = 1;
    }
  };

  Renderer.prototype.drawMenu = function (match, dt) {
    var ctx = this.ctx, cx = this.vw / 2;
    if (C.CLEAN_UI) { this.drawMenuClean(match, dt); return; }
    this.dim(0.86);
    this.drawMenuBits(dt);

    /* meniu turinys suprojektuotas 360 px aukščiui — aukštesniame lange centruojam */
    var oy = Math.floor((this.vh - C.VH) / 2);
    if (oy) ctx.translate(0, oy);

    var bob = Math.round(Math.sin(this.t / 420) * 2);
    T.outlinedCenter(ctx, 'PVP TETRIS', cx, 40 + bob, U.gold, '#000000', 4);
    T.center(ctx, '1 V 1  BLOCK BATTLE', cx, 74, U.text, 1);

    /* sudėtingumas */
    panel(ctx, cx - 156, 92, 312, 46);
    T.center(ctx, 'OPPONENT   [ 1 - 4 TO CHANGE ]', cx, 97, U.dim, 1);
    var keys = ['EASY', 'NORMAL', 'HARD', 'INSANE'];
    var bw = 70, gap = 6, totalW = keys.length * bw + (keys.length - 1) * gap;
    var x0 = cx - totalW / 2;
    for (var i = 0; i < keys.length; i++) {
      var sel = keys[i] === match.aiLevel;
      var bx = x0 + i * (bw + gap);
      rect(ctx, bx, 110, bw, 20, sel ? '#2b3358' : U.panel2);
      frame(ctx, bx, 110, bw, 20, sel ? U.gold : U.line);
      T.center(ctx, C.AI_LEVELS[keys[i]].name, bx + bw / 2, 114, sel ? U.gold : U.dim, 1);
      /* žvaigždutės = stiprumas */
      var stars = '';
      for (var s = 0; s <= i; s++) stars += '*';
      T.center(ctx, stars, bx + bw / 2, 123, sel ? U.gold : U.line, 1);
    }

    /* --- kairė: 3 sekundžių taisyklė --- */
    panel(ctx, cx - 190, 146, 244, 92, U.panel, U.danger);
    T.center(ctx, 'THE 3 SECOND RULE', cx - 68, 152, U.danger, 2);
    var lines = [
      'INCOMING GARBAGE WAITS 3 SECONDS',
      'BEFORE IT RISES.',
      '',
      'EVERY LINE YOU CLEAR IN THAT',
      'WINDOW BLOCKS ONE OF THEM.',
      'SPARE LINES FLY BACK - COUNTER!'
    ];
    for (var L = 0; L < lines.length; L++) {
      if (lines[L]) T.center(ctx, lines[L], cx - 68, 170 + L * 11, U.text, 1);
    }

    /* --- dešinė: atakų lentelė --- */
    panel(ctx, cx + 58, 146, 132, 92, U.panel, U.gold);
    T.center(ctx, 'ATTACK TABLE', cx + 124, 152, U.gold, 1);
    var atk = [
      ['1 LINE', 0, U.dim],
      ['2 LINES', 1, U.text],
      ['3 LINES', 2, U.text],
      ['4 LINES', 4, U.gold]
    ];
    for (var A = 0; A < atk.length; A++) {
      var ay = 168 + A * 13;
      T.text(ctx, atk[A][0], cx + 68, ay, atk[A][2], 1);
      T.text(ctx, '>', cx + 122, ay, U.line, 1);
      T.right(ctx, '+' + atk[A][1], cx + 182, ay, atk[A][2], 1);
    }
    T.center(ctx, 'BUILD UP - QUAD PAYS', cx + 124, 224, U.dim, 1);

    /* valdymas */
    panel(ctx, cx - 190, 242, 380, 62);
    T.center(ctx, 'CONTROLS', cx, 246, U.gold, 1);
    var ctrls = [
      'LEFT / RIGHT  MOVE          DOWN  SOFT DROP',
      'UP or X  ROTATE CW          Z  ROTATE CCW      A  ROTATE 180',
      'SPACE  HARD DROP            C or SHIFT  HOLD',
      'F  FULLSCREEN     P  PAUSE     M  MUTE     R  RESTART     ESC  MENU'
    ];
    for (var k = 0; k < ctrls.length; k++) T.center(ctx, ctrls[k], cx, 258 + k * 11, U.dim, 1);

    var lb = match.leaderboard();
    T.center(ctx, 'RECORD  ' + lb.wins + 'W - ' + lb.losses + 'L      BEST STREAK ' + lb.best, cx, 308, U.dim, 1);

    if (Math.sin(this.t / 260) > -0.3) {
      T.outlinedCenter(ctx, 'PRESS ENTER TO FIGHT', cx, 322, '#ffffff', '#000000', 2);
    }

    if (oy) ctx.translate(0, -oy);
  };

  /* 🎓 PASIRUOŠIMO EKRANAS — perdaryta 2026-08-15 (user: „griozdiška ir nesuprantama kaip prasideda žaidimas").
   * Stilius: poliruotos navy „plaque" kortelės su ◇ gemų kampais (kaip likusiame RonkePong UI) vietoj
   * plikų mygtukų krūvos. DVI aiškios zonos: CONTROLS (ką spausti) ir START (kaip prasideda mačas).
   * ⚠️ Kenney `assets/keys/*.png` čia NEBENAUDOJAMI: jų rodyklės tokios smulkios, kad visos keturios
   * atrodė kaip vienodas „+" — klavišų kepurės ir rodyklės dabar piešiamos pačios (aštrūs pikseliai).
   * Paspaudus klavišą (arba demo) atitinkama kepurė užsidega auksu — iškart matyti, kas ką daro. */
  Renderer.prototype.drawPrep = function (match) {
    var ctx = this.ctx, vw = this.vw, vh = this.vh, cx = Math.floor(vw / 2);
    ctx.globalAlpha = 0.94; rect(ctx, 0, 0, vw, vh, '#05060c'); ctx.globalAlpha = 1;
    var secs = Math.ceil((match._prepLeft || 0) / 1000);
    var actKey = (match._demoKeyT > 0) ? match._demoKey : '';
    var isTouch = ('ontouchstart' in global) || (global.navigator && global.navigator.maxTouchPoints > 0);

    /* ── pikselinė rodyklė: trikampė galva + kotas, viskas stačiakampiais (jokio antialiasingo) ── */
    function arrow(axc, ayc, r, dir, col) {
      var i, s;
      for (i = 0; i < r; i++) {
        s = 1 + i * 2;
        if (dir === 'up') rect(ctx, axc - Math.floor(s / 2), ayc - r + i, s, 1, col);
        else if (dir === 'down') rect(ctx, axc - Math.floor(s / 2), ayc + r - i - 1, s, 1, col);
        else if (dir === 'left') rect(ctx, axc - r + i, ayc - Math.floor(s / 2), 1, s, col);
        else rect(ctx, axc + r - i - 1, ayc - Math.floor(s / 2), 1, s, col);
      }
      var st = Math.max(2, Math.floor(r * 0.9));
      if (dir === 'up') rect(ctx, axc - 1, ayc, 2, st, col);
      else if (dir === 'down') rect(ctx, axc - 1, ayc - st, 2, st, col);
      else if (dir === 'left') rect(ctx, axc, ayc - 1, st, 2, col);
      else rect(ctx, axc - st, ayc - 1, st, 2, col);
    }
    /* ── klaviatūros kepurė: šešėlis + korpusas + bevel; „on" = paspausta (auksinė, nusėdusi 1px) ── */
    function keycap(kx, ky, kw, kh, glyph, on) {
      var dy = on ? 1 : 0;
      rect(ctx, kx + 1, ky + 2, kw, kh, '#03040a');
      rect(ctx, kx, ky + dy, kw, kh, on ? U.gold : '#2b3852');
      rect(ctx, kx + 1, ky + dy + 1, kw - 2, 1, on ? '#fff3c4' : '#41527a');
      rect(ctx, kx + 1, ky + dy + kh - 2, kw - 2, 1, on ? '#c9a03c' : '#192134');
      frame(ctx, kx, ky + dy, kw, kh, on ? '#ffffff' : '#131a29');
      var gc = on ? '#241a08' : U.text;
      if (glyph === 'space') F.center(ctx, 'SPACE', kx + kw / 2, ky + dy + Math.floor(kh / 2) - 3, gc, 1);
      else arrow(kx + Math.floor(kw / 2), ky + dy + Math.floor(kh / 2), Math.max(3, Math.floor(kh * 0.22)), glyph, gc);
    }

    /* ── antraštė ── */
    var topY = Math.max(8, Math.floor(vh * 0.045));
    F.outlinedCenter(ctx, 'GET READY', cx, topY, U.gold, '#05060c', 2);
    F.outlinedCenter(ctx, isTouch ? 'HOW TO PLAY' : 'YOUR CONTROLS', cx, topY + 20, U.dim, '#05060c', 1);
    var warnY = topY + 32;
    if (match._noRankMatch) {
      F.outlinedCenter(ctx, 'LEVEL GAP TOO BIG - NO RATING, PRIZE STILL COUNTS', cx, warnY, U.danger, '#05060c', 1);
      warnY += 11;
    } else if (match._aiNoRank) {
      F.outlinedCenter(ctx, 'AI PLAYS THIS MATCH - UNRANKED, XP STILL COUNTS', cx, warnY, U.gold, '#05060c', 1);
      warnY += 11;
    }

    /* ── apatinis READY mygtukas (geometrija reikalinga anksčiau — kortelės telpa tarp jo ir antraštės) ── */
    var ready = !!match._prepReady, both = (match._prepReadyCount || 0) >= 2;
    var btnW = Math.min(240, vw - 36), btnH = 28, btnX = cx - Math.floor(btnW / 2), btnY = vh - btnH - 10;

    var pw = Math.min(300, vw - 28), px = cx - Math.floor(pw / 2);
    var cardTop = warnY + 6, cardBottom = btnY - 22;
    var avail = cardBottom - cardTop;

    if (isTouch) {
      /* 📱 SWIPE valdymas (rb97): figūra seka pirštą; mygtukai tik ROTATE + DROP. */
      var th = Math.min(avail, 62), ty = cardTop + Math.max(0, Math.floor((avail - th) / 2));
      plaque(ctx, px, ty, pw, th, U.pnlIn);
      var ttlT = 'HOW TO PLAY', twT = F.width(ttlT, 1) + 10;
      rect(ctx, cx - Math.floor(twT / 2), ty - 4, twT, 9, '#05060c');
      F.center(ctx, ttlT, cx, ty - 3, U.gold, 1);
      var ly = ty + 11;
      /* rodyklės flankuoja antraštę (NE tekstą — anksčiau užlipdavo ant raidžių) */
      var ax = Math.min(Math.floor(pw / 2) - 14, 74);
      arrow(cx - ax, ly + 3, 5, 'left', actKey === 'left' ? '#ffffff' : U.gold);
      arrow(cx + ax, ly + 3, 5, 'right', actKey === 'right' ? '#ffffff' : U.gold);
      F.outlinedCenter(ctx, 'SWIPE TO MOVE', cx, ly, U.gold, '#05060c', 1); ly += 13;
      F.outlinedCenter(ctx, 'PIECE FOLLOWS YOUR FINGER', cx, ly, U.text, '#05060c', 1); ly += 12;
      F.outlinedCenter(ctx, 'SWIPE DOWN + HOLD = FAST FALL', cx, ly, U.text, '#05060c', 1); ly += 12;
      F.outlinedCenter(ctx, 'ROTATE / DROP = BUTTONS BELOW', cx, ly, U.dim, '#05060c', 1);
    } else {
      /* ⌨️ KLAVIATŪRA: 4 eilutės „kepurė(-s) + ką daro". */
      var rows = [
        { keys: ['up'], name: 'ROTATE', hint: 'TURN THE PIECE' },
        { keys: ['left', 'right'], name: 'MOVE', hint: 'SLIDE LEFT / RIGHT' },
        { keys: ['down'], name: 'SOFT DROP', hint: 'FALL FASTER' },
        { keys: ['space'], name: 'HARD DROP', hint: 'INSTANT LOCK' },
      ];
      var ks = Math.max(16, Math.min(30, Math.floor((avail - 30) / rows.length) - 8));
      var rh = ks + 8, ch = rows.length * rh + 18;
      var cy0 = cardTop + Math.max(0, Math.floor((avail - ch) / 2));
      plaque(ctx, px, cy0, pw, ch, U.pnlIn);
      /* „iškaltas" antraštės skydelis ant viršutinio krašto (kaip fieldset legenda) */
      var ttl = 'CONTROLS', tw = F.width(ttl, 1) + 10;
      rect(ctx, cx - Math.floor(tw / 2), cy0 - 4, tw, 9, '#05060c');
      F.center(ctx, ttl, cx, cy0 - 3, U.gold, 1);
      var keyColW = ks * 2 + 4, kx0 = px + 12, textX = kx0 + keyColW + 12;
      for (var i = 0; i < rows.length; i++) {
        var r0 = rows[i], ry = cy0 + 11 + i * rh, lit = false;
        if (r0.keys[0] === 'space') {
          lit = actKey === 'space';
          keycap(kx0, ry, keyColW, ks, 'space', lit);
        } else if (r0.keys.length === 2) {
          lit = actKey === 'left' || actKey === 'right';
          keycap(kx0, ry, ks, ks, 'left', actKey === 'left');
          keycap(kx0 + ks + 4, ry, ks, ks, 'right', actKey === 'right');
        } else {
          lit = actKey === r0.keys[0];
          keycap(kx0 + Math.floor((keyColW - ks) / 2), ry, ks, ks, r0.keys[0], lit);
        }
        F.text(ctx, r0.name, textX, ry + Math.floor(ks / 2) - 7, lit ? U.gold : U.text, 1);
        F.text(ctx, r0.hint, textX, ry + Math.floor(ks / 2) + 2, U.dim, 1);
      }
    }

    /* ── kaip prasideda mačas (virš mygtuko, kad klausimo nekiltų) ── */
    var stY = btnY - 15;
    F.outlinedCenter(ctx, both ? 'BOTH READY - STARTING!'
      : (ready ? 'WAITING FOR OPPONENT - AUTO START IN ' + secs + 'S'
        : 'PRESS READY BELOW - MATCH STARTS IN ' + secs + 'S'),
      cx, stY, both ? U.good : (ready ? U.dim : U.gold), '#05060c', 1);

    /* ── READY mygtukas ── */
    rect(ctx, btnX + 1, btnY + 2, btnW, btnH, '#03040a');
    rect(ctx, btnX, btnY, btnW, btnH, ready ? '#1c3a24' : '#24543a');
    rect(ctx, btnX + 1, btnY + 1, btnW - 2, 1, ready ? '#3d6b4b' : '#6ff0a0');
    frame(ctx, btnX, btnY, btnW, btnH, ready ? '#5aa06a' : '#5ce08a');
    F.outlinedCenter(ctx, ready ? 'READY - WAITING ' + secs + 'S' : 'PRESS TO READY UP',
      cx, btnY + Math.floor(btnH / 2) - 3, ready ? U.dim : U.good, '#05060c', 1);
    match._prepBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  };

  Renderer.prototype.drawCountdown = function (match) {
    var ctx = this.ctx, cx = this.vw / 2;

    if (C.CLEAN_UI) {
      /* 🐵 Ronke skaičiuoja pirštais (count_to_three_sheet, 20 kadrų):
       * 0-15 @100ms → 15-as kadras laikomas 1s → 16-19 finišas — lygiai 3s countdown. */
      var cy = this.vh / 2;
      this.dim(0.5);
      var total = C.COUNTDOWN_MS || 3000;
      var el = Math.max(0, Math.min(total, total - Math.max(0, match.countdown)));
      /* seka „skaičiuojam IKI trijų": k5-k10 = 1 pirštas, k11-k14 = 2 pirštai (14-as laikomas 300ms),
       * k15 = perėjimas, k16-k19 = 3 pirštai (laikomi iki starto). k0-k4 lape = pabaigos poza, praleidžiam. */
      /* ⏱️ po ~1s kiekvienam skaičiui. FAKTINĖ lapo analizė: K4-K13 = 1 pirštas, K14 = VIENINTELIS
       * „du" kadras (juostos idx12 = userio naujas dvejetas), K15-K19 = 3 pirštai. */
      var cf;
      if (el < 1000) cf = Math.min(10, 4 + ((el / 143) | 0));                  // ☝️ K4-K10
      else if (el < 1500) cf = 12;                                             // ✌️ naujas dvejetas (0.5s)
      else if (el < 2000) cf = 14;                                             // ✌️ lapo dvejetas (0.5s — gyvumas)
      else if (el < 2400) cf = Math.min(18, 15 + (((el - 2000) / 100) | 0));   // 🤟 K15-K18
      else cf = 19;   // 🤟 finalinis kadras iki GO
      var cimg = this._badge('count_anim.png');
      if (cimg) {
        var csz = 120, cx0 = cx - csz / 2, cy0 = cy - csz / 2 - 6;
        stoneFrame(ctx, cx0 - 5, cy0 - 5, csz + 10, csz + 10, 5);
        ctx.drawImage(cimg, cf * 96, 0, 96, 96, cx0, cy0, csz, csz);
      } else {
        gemPip(ctx, cx, cy, 10, U.gold, '#ffffff');
      }
      return;
    }

    this.dim(0.55);
    var left = match.countdown;
    var idx = 3 - Math.min(3, Math.floor(left / 1000));
    var txt = C.READY_TEXT[Math.max(0, Math.min(3, idx))];
    var frac = (left % 1000) / 1000;
    var sc = 6 + Math.round((1 - frac) * 3);
    T.outlinedCenter(ctx, txt, cx, this.vh / 2 - 24, U.gold, '#000000', sc);
    T.center(ctx, 'SAME PIECE SEQUENCE FOR BOTH PLAYERS  -  SEED ' + match.seed, cx, this.vh / 2 + 34, U.dim, 1);
  };

  /* ONLINE: laukiam serverio / priešininko. Be šito ekranas atrodo „užstrigęs". */
  /* ONLINE LOBIS: QUICK MATCH / CREATE ROOM. Mygtukų stačiakampiai saugomi `match._lobbyHit`
   * (main.js paverčia paspaudimo koordinates į virtualias ir suranda pataikytą mygtuką).
   * ⚠️ Naudojam RAW `F.*` (NE `T.*`) — nes `T.*` CLEAN_UI režime NEPIEŠIA, o čia tekstas BŪTINAS
   * (mygtukų etiketės, kambario kodas). Bazinio žaidimo švarumo tai neliečia — tik online ekranai. */
  Renderer.prototype.drawLobby = function (match) {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    this.dim(0.66);
    var bw = Math.min(300, this.vw - 30), x = Math.round(cx - bw / 2);
    var rooms = match._lobbyRooms || [];
    var rowH = 26, maxRows = 4, shown = Math.min(maxRows, rooms.length);
    /* vertikaliai centruojam pagal turinį (sąrašo aukštis kinta) */
    var listH = (shown ? shown * (rowH + 5) : rowH + 6);
    var totalH = 26 + 22 + 14 + listH + 8 + 50 + 10 + 40;
    var y = Math.round(cy - totalH / 2);

    F.center(ctx, 'PVP TETRIS', cx, y, U.gold, 3); y += 26;
    F.center(ctx, 'ONLINE  1  v  1', cx, y, U.dim, 1); y += 22;

    /* ── LAUKIANČIŲ ŽAIDĖJŲ SĄRAŠAS (pakūrė matchą, laukia varžovo) ── */
    F.text(ctx, 'OPEN MATCHES', x, y, U.text, 1);
    F.right(ctx, 'tap to join', x + bw, y, U.dim, 1); y += 14;
    match._lobbyHit = [];
    if (!shown) {
      rect(ctx, x, y, bw, rowH, '#1c130a');
      frame(ctx, x, y, bw, rowH, '#3d2817');
      F.center(ctx, 'no open matches yet - host one below', cx, y + 9, U.dim, 1);
      y += rowH + 6;
    } else {
      for (var i = 0; i < shown; i++) {
        var r = rooms[i];
        rect(ctx, x, y, bw, rowH, '#241a0e');
        rect(ctx, x, y, bw, 1, '#4a3418');
        frame(ctx, x, y, bw, rowH, U.gold);
        F.text(ctx, String(r.host).slice(0, 18), x + 8, y + 9, U.gold, 1);   // host vardas
        var jw = 46, jx = x + bw - jw - 5;
        rect(ctx, jx, y + 5, jw, rowH - 10, '#2f5e2f');
        frame(ctx, jx, y + 5, jw, rowH - 10, U.good);
        F.center(ctx, 'JOIN', jx + jw / 2, y + 9, '#d8ffe0', 1);
        match._lobbyHit.push({ x: x, y: y, w: bw, h: rowH, action: 'join', roomId: r.roomId });
        y += rowH + 5;
      }
    }
    y += 8;

    /* ── HOST (public, matomas sąraše) ── */
    var bh = 40;
    rect(ctx, x, y, bw, bh, '#2a1c10'); rect(ctx, x, y, bw, 2, '#6b4a2e'); frame(ctx, x, y, bw, bh, U.gold);
    F.center(ctx, 'HOST A MATCH', cx, y + 8, U.gold, 2);
    F.center(ctx, 'wait - others pick you from the list', cx, y + 26, U.dim, 1);
    match._lobbyHit.push({ x: x, y: y, w: bw, h: bh, action: 'host' });
    y += bh + 10;

    /* ── PRIVATE (invite kodas draugui) ── */
    rect(ctx, x, y, bw, bh, '#201a2a'); rect(ctx, x, y, bw, 2, '#4a3a66'); frame(ctx, x, y, bw, bh, '#9d7ad0');
    F.center(ctx, 'PRIVATE ROOM', cx, y + 8, '#cbb0ff', 2);
    F.center(ctx, 'invite a friend by code', cx, y + 26, U.dim, 1);
    match._lobbyHit.push({ x: x, y: y, w: bw, h: bh, action: 'create' });
  };

  /* 🥊 CHALLENGE (HOST'ui): „X wants to play — accept?" — ENTER accept / ESC decline. */
  Renderer.prototype.drawChallenge = function (match) {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    this.dim(0.72);
    var pulse = 0.6 + 0.4 * Math.sin(this.t / 260);
    F.center(ctx, 'OPPONENT FOUND', cx, cy - 46, U.gold, 2);
    ctx.globalAlpha = pulse;
    F.outlinedCenter(ctx, String(match._challenger || 'PLAYER').toUpperCase(), cx, cy - 20, U.you, '#000000', 3);
    ctx.globalAlpha = 1;
    F.center(ctx, 'wants to play PVP TETRIS', cx, cy + 8, U.dim, 1);
    /* du mygtukai */
    var bw = 120, bh = 30, gap = 14, x0 = Math.round(cx - bw - gap / 2), x1 = Math.round(cx + gap / 2);
    var y = cy + 30;
    rect(ctx, x0, y, bw, bh, '#1c3a1c'); frame(ctx, x0, y, bw, bh, U.good);
    F.center(ctx, 'ACCEPT', x0 + bw / 2, y + 8, U.good, 2);
    F.center(ctx, '[ENTER]', x0 + bw / 2, y + 22, U.dim, 1);
    rect(ctx, x1, y, bw, bh, '#3a1c1c'); frame(ctx, x1, y, bw, bh, U.danger);
    F.center(ctx, 'DECLINE', x1 + bw / 2, y + 8, U.danger, 2);
    F.center(ctx, '[ESC]', x1 + bw / 2, y + 22, U.dim, 1);
    match._challengeHit = [
      { x: x0, y: y, w: bw, h: bh, action: 'accept' },
      { x: x1, y: y, w: bw, h: bh, action: 'decline' }
    ];
  };

  /* SVEČIAS: laukia host'o sprendimo. */
  Renderer.prototype.drawAwaiting = function (match) {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    this.dim(0.6);
    for (var d = 0; d < 3; d++) {
      var on = (Math.floor(this.t / 300) % 3) === d;
      gemPip(ctx, cx - 24 + d * 24, cy + 22, on ? 6 : 4, on ? U.gold : '#241a12', on ? '#ffffff' : null);
    }
    F.outlinedCenter(ctx, 'CHALLENGE SENT', cx, cy - 14, U.gold, '#000000', 2);
    F.center(ctx, 'waiting for ' + String(match._hostName || 'host') + ' to accept...', cx, cy + 44, U.dim, 1);
  };

  Renderer.prototype.drawConnecting = function (match) {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    this.dim(0.6);
    /* sukisi trys taškeliai — matosi, kad gyva, ne pakibę. RAW F.* (žr. drawLobby pastabą). */
    var st = (global.NET && global.NET.status) || 'connecting';
    var priv = !!(match._private && match.roomCode);       // PRIVATE — rodom kodą
    var msg = (st === 'open') ? (priv ? 'ROOM READY' : 'WAITING FOR OPPONENT') : 'CONNECTING';
    var n = Math.floor(this.t / 350) % 4;
    var dots = ''; for (var i = 0; i < n; i++) dots += '.';
    for (var d = 0; d < 3; d++) {
      var on = (Math.floor(this.t / 300) % 3) === d;
      gemPip(ctx, cx - 24 + d * 24, cy + (priv ? 42 : 20), on ? 6 : 4, on ? U.gold : '#241a12', on ? '#ffffff' : null);
    }
    F.outlinedCenter(ctx, msg + dots, cx, cy - (priv ? 40 : 12), U.gold, '#000000', 2);
    if (priv && st === 'open') {
      /* PRIVATE: rodom kambario kodą + kvietimo nuorodą (paspaudus — nukopijuoja). */
      F.center(ctx, 'SHARE THIS CODE WITH A FRIEND', cx, cy - 10, U.dim, 1);
      F.outlinedCenter(ctx, String(match.roomCode).toUpperCase(), cx, cy + 6, U.gold, '#000000', 3);
      F.center(ctx, match._copied ? 'LINK COPIED!' : 'TAP HERE TO COPY INVITE LINK', cx, cy + 66, match._copied ? U.good : U.text, 1);
    } else if (st === 'error') {
      F.center(ctx, 'CONNECTION FAILED  -  PRESS ESC FOR LOBBY', cx, cy + 44, U.dim, 1);
    } else if (st === 'open') {
      /* PUBLIC host / quick match — laukiam; pranešam, kad esam sąraše. */
      F.center(ctx, 'you are listed - someone can join you', cx, cy + 44, U.dim, 1);
    } else {
      F.center(ctx, 'ONLINE 1v1', cx, cy + 44, U.dim, 1);
    }
  };

  Renderer.prototype.drawPause = function () {
    var ctx = this.ctx, cx = this.vw / 2;
    if (C.CLEAN_UI) {
      var cy = this.vh / 2;
      this.dim(0.74);
      var a = clamp01(0.6 + 0.4 * Math.sin(this.t / 380));
      ctx.globalAlpha = a;
      rect(ctx, cx - 13, cy - 14, 9, 28, U.gold);
      rect(ctx, cx + 4, cy - 14, 9, 28, U.gold);
      ctx.globalAlpha = 1;
      frame(ctx, cx - 14, cy - 15, 11, 30, U.shadow);
      frame(ctx, cx + 3, cy - 15, 11, 30, U.shadow);
      return;
    }
    this.dim(0.72);
    T.outlinedCenter(ctx, 'PAUSED', cx, this.vh / 2 - 20, U.gold, '#000000', 4);
    T.center(ctx, 'P  RESUME       R  RESTART       ESC  MENU', cx, this.vh / 2 + 16, U.text, 1);
  };

  /* ŠVARUS rezultatas: laimėtoją rodo auksinis skydas ir konfeti, pralaimėjimą — suskilęs. */
  Renderer.prototype.drawResultClean = function (match) {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    var won = match.winner === 'you';
    this.dim(0.80);
    this.drawConfetti(match.fx);

    var bob = won ? Math.round(Math.sin(this.t / 320) * 2) : 0;
    var sw = 62, sy = cy - 14 + bob;

    /* 🏅 RANKED mačas: žaidimo skydo NErodom — vietoj jo IŠKART iššoka lygos emblema su statais
     * (lobby rank kortelė, žr. blocks_lobby_client _showRankAnim). Liekam tik fonas+konfeti. */
    if (match._ranked) {
      for (var k2 = 0; k2 < 3; k2++) {
        var ph2 = ((this.t / 900) + k2 / 3) % 1;
        ctx.globalAlpha = clamp01(Math.sin(ph2 * Math.PI) * 0.7);
        gemPip(ctx, cx, cy + 96 - ph2 * 22, 4, U.text, won ? U.gold : U.danger);
        ctx.globalAlpha = 1;
      }
      return;
    }

    if (won) {
      /* spinduliai iš po skydo */
      for (var r = 0; r < 12; r++) {
        var ang = (this.t / 2600 + r / 12) * Math.PI * 2;
        ctx.globalAlpha = clamp01(0.10 + 0.06 * Math.sin(this.t / 300 + r));
        var len = 54 + Math.sin(this.t / 420 + r) * 8;
        rect(ctx, cx + Math.cos(ang) * 34, sy + Math.sin(ang) * 34,
          Math.max(1, Math.abs(Math.cos(ang) * len) | 0), Math.max(1, Math.abs(Math.sin(ang) * 4) | 0), U.gold);
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = clamp01(0.25 + 0.15 * Math.sin(this.t / 280));
      shield(ctx, cx, sy, sw + 10, U.gold, U.gold);
      ctx.globalAlpha = 1;
      shield(ctx, cx, sy, sw, U.panel, U.gold);
      gemPip(ctx, cx, sy - 4, 9, U.gold, '#ffffff');
      gemPip(ctx, cx, sy - 4, 4, '#ffffff', null);
    } else {
      shield(ctx, cx, sy, sw, '#1d150f', U.stoneDark);
      gemPip(ctx, cx, sy - 4, 9, U.stoneDark, null);
      /* perskeltas per vidurį */
      ctx.globalAlpha = 0.9;
      crackLine(ctx, cx - 4, sy - sw / 2, cx + 6, sy + sw / 2 + 10, U.danger, 3);
      crackLine(ctx, cx - sw / 2, sy + 4, cx + sw / 2, sy - 2, U.danger, 2);
      ctx.globalAlpha = 1;
    }

    /* pulsuojantis „paspausk" indikatorius */
    for (var k = 0; k < 3; k++) {
      var ph = ((this.t / 900) + k / 3) % 1;
      ctx.globalAlpha = clamp01(Math.sin(ph * Math.PI) * 0.7);
      gemPip(ctx, cx, cy + 96 - ph * 22, 4, U.text, won ? U.gold : U.danger);
      ctx.globalAlpha = 1;
    }
  };

  Renderer.prototype.drawResult = function (match) {
    var ctx = this.ctx, cx = this.vw / 2;
    if (C.CLEAN_UI) { this.drawResultClean(match); return; }
    this.dim(0.88);
    this.drawConfetti(match.fx);

    var oy = Math.floor((this.vh - C.VH) / 2);
    if (oy) ctx.translate(0, oy);

    var won = match.winner === 'you';
    var bob = Math.round(Math.sin(this.t / 300) * 2);
    T.outlinedCenter(ctx, won ? 'VICTORY' : 'DEFEAT', cx, 22 + (won ? bob : 0), won ? U.good : U.danger, '#000000', 5);
    T.center(ctx, won ? 'YOU BURIED ' + match.foeName : match.foeName + ' BURIED YOU', cx, 58, U.dim, 1);

    var rowsN = [
      ['LINES CLEARED', 'lines'],
      ['LINES SENT', 'sent'],
      ['GARBAGE BLOCKED', 'cancelled'],
      ['GARBAGE TAKEN', 'received'],
      ['MAX COMBO', 'maxCombo'],
      ['QUADS', 'quads'],
      ['PIECES', 'pieces']
    ];
    var tx = cx - 160, ty = 76, tw = 320, th = 22 + rowsN.length * 13 + 14;
    panel(ctx, tx, ty, tw, th);
    T.text(ctx, 'YOU', tx + 8, ty + 7, U.you, 1);
    T.center(ctx, 'MATCH STATS', cx, ty + 7, U.gold, 1);
    T.right(ctx, match.foeName, tx + tw - 8, ty + 7, U.foe, 1);
    rect(ctx, tx + 6, ty + 18, tw - 12, 1, U.line);

    for (var i = 0; i < rowsN.length; i++) {
      var key = rowsN[i][1], yy = ty + 24 + i * 13;
      var a = match.you.stats[key], b = match.foe.stats[key];
      if (a > b) { ctx.globalAlpha = 0.14; rect(ctx, tx + 6, yy - 2, (tw - 12) / 2 - 2, 11, U.you); ctx.globalAlpha = 1; }
      if (b > a) { ctx.globalAlpha = 0.14; rect(ctx, cx + 2, yy - 2, (tw - 12) / 2 - 2, 11, U.foe); ctx.globalAlpha = 1; }
      T.text(ctx, String(a), tx + 12, yy, a >= b ? U.good : U.text, 1);
      T.center(ctx, rowsN[i][0], cx, yy, U.dim, 1);
      T.right(ctx, String(b), tx + tw - 12, yy, b >= a ? U.good : U.text, 1);
    }
    var secs = (Math.max(match.you.stats.timeMs, match.foe.stats.timeMs) / 1000).toFixed(1);
    T.center(ctx, 'TIME ' + secs + 'S      YOUR PPS ' + match.you.pps().toFixed(2) +
      '      CPU PPS ' + match.foe.pps().toFixed(2), cx, ty + th - 11, U.dim, 1);

    var lb = match.leaderboard();
    panel(ctx, cx - 160, ty + th + 6, 320, 46);
    T.center(ctx, 'LOCAL RECORD  ' + lb.wins + 'W - ' + lb.losses + 'L      STREAK ' + lb.streak +
      '      BEST STREAK ' + lb.best, cx, ty + th + 12, U.text, 1);
    T.center(ctx, 'BEST SENT ' + lb.bestSent + '      BEST BLOCKED ' + lb.bestBlocked +
      '      FASTEST WIN ' + (lb.fastest ? (lb.fastest / 1000).toFixed(1) + 'S' : '-'),
      cx, ty + th + 24, U.dim, 1);
    T.center(ctx, 'BEATEN: ' + (lb.beaten.length ? lb.beaten.join('  ') : 'NOBODY YET'),
      cx, ty + th + 36, U.gold, 1);

    if (Math.sin(this.t / 240) > -0.3) {
      T.outlinedCenter(ctx, 'R  REMATCH        ESC  MENU', cx, 336, '#ffffff', '#000000', 2);
    }

    if (oy) ctx.translate(0, -oy);
  };

  /* 🧱 Sukuria procedūrinę NAVY akmens sieną offscreen drobėje: vertikalus gradientas (gylis) +
   * beveled plytos (deterministinis hash → stabilu, be mirgėjimo) + centrinis fakelų švytėjimas + vinjetė.
   * Perbraižom TIK keičiant dydį (kešuota pagal vw×vh) → 1 drawImage per kadrą. */
  Renderer.prototype._buildWall = function (vw, vh) {
    var doc = this.cv.ownerDocument || (typeof document !== 'undefined' ? document : null);
    var cv = this._wallCanvas || (this._wallCanvas = doc.createElement('canvas'));
    cv.width = vw; cv.height = vh;
    var o = cv.getContext('2d');
    function h2(i, j) { var x = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return x - Math.floor(x); }
    function cl(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
    function rgb(a) { return 'rgb(' + cl(a[0]) + ',' + cl(a[1]) + ',' + cl(a[2]) + ')'; }
    /* vertikalus gradientas — gylio pojūtis */
    var g = o.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, 'rgb(12,17,27)'); g.addColorStop(0.5, 'rgb(20,27,42)'); g.addColorStop(1, 'rgb(9,13,20)');
    o.fillStyle = g; o.fillRect(0, 0, vw, vh);
    /* plytos: beveled akmenys, varijuojantys atspalviai */
    var BW = 42, BH = 20;
    var pal = [[24, 32, 50], [28, 37, 57], [20, 27, 42], [32, 42, 64], [17, 23, 37]], lite = [44, 56, 82];
    for (var row = 0, ry = -BH; ry < vh; ry += BH, row++) {
      var shift = (row % 2) ? (BW / 2) : 0;
      for (var col = 0, rx = -BW + shift; rx < vw; rx += BW, col++) {
        var hh = h2(col * 1.7 + row * 0.3, row * 2.3 + col * 0.11);
        var base = hh > 0.93 ? lite : pal[(hh * pal.length) | 0];
        var n = ((h2(row, col) - 0.5) * 8) | 0;
        var f0 = cl(base[0] + n), f1 = cl(base[1] + n), f2 = cl(base[2] + n);
        var x0 = rx + 1, y0 = ry + 1, w = BW - 2, h = BH - 2;
        o.fillStyle = 'rgb(' + f0 + ',' + f1 + ',' + f2 + ')'; o.fillRect(x0, y0, w, h);
        o.fillStyle = rgb([f0 + 16, f1 + 20, f2 + 30]); o.fillRect(x0, y0, w, 1);        // viršaus blikas
        o.fillStyle = rgb([f0 + 8, f1 + 10, f2 + 15]); o.fillRect(x0, y0, 1, h);          // kairės blikas
        o.fillStyle = rgb([f0 - 12, f1 - 9, f2 - 14]);
        o.fillRect(x0, y0 + h - 1, w, 1); o.fillRect(x0 + w - 1, y0, 1, h);               // apačios/dešinės šešėlis
      }
    }
    /* skiedinio linijos tarp eilių */
    o.fillStyle = 'rgb(7,10,16)';
    for (var gy = -BH; gy < vh; gy += BH) o.fillRect(0, gy, vw, 1);
    /* centrinis švytėjimas — fakelų apšviestas mūšio koridorius (addityvus) */
    var rad = Math.round(vw * 0.34), cx = vw / 2, cy = Math.round(vh * 0.55);
    var rgl = o.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rgl.addColorStop(0, 'rgba(70,60,92,0.5)'); rgl.addColorStop(1, 'rgba(70,60,92,0)');
    o.globalCompositeOperation = 'lighter'; o.fillStyle = rgl; o.fillRect(0, 0, vw, vh);
    o.globalCompositeOperation = 'source-over';
    /* vinjetė — pritemdyti pakraščiai */
    for (var k = 0; k < 14; k++) {
      o.globalAlpha = 0.05 * (1 - k / 14); o.fillStyle = '#000';
      o.fillRect(0, k * 2, vw, 2); o.fillRect(0, vh - (k + 1) * 2, vw, 2);
      o.fillRect(k * 2, 0, 2, vh); o.fillRect(vw - (k + 1) * 2, 0, 2, vh);
    }
    o.globalAlpha = 1;
    this._wallKey = vw + 'x' + vh;
  };

  /* Fonas: procedūrinė navy akmens siena (kešuota) + rusenančios žarijos. */
  Renderer.prototype.drawBackdrop = function (fx, dt) {
    var ctx = this.ctx, vw = this.vw, vh = this.vh;
    if (this._wallKey !== vw + 'x' + vh) {
      try { this._buildWall(vw, vh); } catch (_) { this._wallCanvas = null; this._wallKey = vw + 'x' + vh; }
    }
    if (this._wallCanvas) ctx.drawImage(this._wallCanvas, 0, 0);
    else rect(ctx, 0, 0, vw, vh, '#141b2a');   // fallback (be offscreen drobės, pvz. testuose)

    /* žarijos */
    fx.updateEmbers(dt, vw, vh);
    for (var i = 0; i < fx.embers.length; i++) {
      var e = fx.embers[i];
      var a = Math.min(1, e.life / 1400) * 0.55;
      ctx.globalAlpha = clamp01(a);
      ctx.fillStyle = U.ember;
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.sz, e.sz);
      ctx.globalAlpha = clamp01(a * 0.4);
      ctx.fillStyle = U.gold;
      ctx.fillRect(Math.round(e.x), Math.round(e.y) - 1, e.sz, 1);
    }
    ctx.globalAlpha = 1;
  };

  /* ---------- MŪŠIO KORIDORIUS ----------
   *
   * Viena juosta tarp lentų. Tavo atakos žygiuoja į dešinę, priešo — į kairę.
   * Pozicija imama TIESIOG iš atakų eilės laikmačio (`t01`), tad tai ne dekoracija:
   * unitas yra ta pati ataka, o jo padėtis kelyje = kiek liko iki proveržio.
   * Kai ataka pakertama, `spots` pasako, kurioje kelio vietoje tai įvyko. */

  /* Mažas pikselinis karys. dir: +1 žygiuoja į dešinę, -1 į kairę. */
  function unitSprite(ctx, x, y, dir, c, phase, charge) {
    var step = Math.sin(phase) > 0 ? 1 : 0;          // kojų kaita
    var bob = (Math.sin(phase * 2) > 0.4) ? -1 : 0;  // korpuso pakilimas
    var yy = Math.round(y + bob);
    var d = dir > 0 ? 1 : -1;

    /* kojos */
    rect(ctx, x - 2, yy + 4, 2, 2, c[2]);
    rect(ctx, x + (step ? 1 : 0), yy + 4, 2, 2, c[2]);
    /* korpusas */
    rect(ctx, x - 2, yy - 1, 5, 5, c[0]);
    rect(ctx, x - 2, yy - 1, 5, 1, c[1]);
    /* galva su šalmu */
    rect(ctx, x - 1, yy - 5, 3, 3, c[1]);
    rect(ctx, x - 2, yy - 6, 5, 2, c[2]);
    rect(ctx, x - 2 + (d > 0 ? 4 : 0), yy - 6, 1, 1, c[1]);   // plunksna į priekį
    /* skydas gale, ietis priekyje */
    rect(ctx, x - 2 - (d > 0 ? 2 : -4), yy, 2, 4, c[2]);
    rect(ctx, x + (d > 0 ? 3 : -4), yy - 4 + (charge ? 1 : 0), 1, 7, c[1]);
    /* akis */
    rect(ctx, x + (d > 0 ? 1 : -1), yy - 4, 1, 1, c[3]);
  }

  /* Vienas DECK unitas su tikru sprite'u. Grąžina false, jei sheet dar neužsikrovęs
   * — tada kviečiantysis piešia procedūrinį karį (žaidimas niekada nelaukia asset'o). */
  /* `pose` — {sinceSwing, sinceGuard, moving} iš simuliacijos. Jei paduotas,
   * naudojam F12 būsenų mašiną (blokas > ataka vieną kartą > idle > žygis). */
  Renderer.prototype.drawDeckUnit = function (type, x, y, dir, t, phase, charge, dist, attacking, scale, pose) {
    var ctx = this.ctx;
    var Un = global.Units;
    if (!Un) return false;
    var f = pose
      ? Un.poseFrame(type, pose, t, phase, dir < 0 ? 'west' : 'east')
      : Un.frame(type, attacking ? Un.atkCycleFor(type, t, phase) : Un.cycleFor(type, dist || 0, t, phase), attacking);
    if (!f) return false;
    var d = f.def;
    var s = Math.round(d.size * (scale || 1));
    var bob = d.float ? Math.round(Math.sin(t / 260 + phase) * 2) : 0;
    var dx = Math.round(x - s / 2);
    var dy = Math.round(y - s * d.footY) + bob;

    if (charge) { ctx.globalAlpha = 0.92; }
    if (dir < 0 && !d.noFlip) {
      /* žygiuoja kairėn — apverčiam horizontaliai (shaman turi savo west kadrus) */
      ctx.save();
      ctx.translate(Math.round(x), 0);
      ctx.scale(-1, 1);
      ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, Math.round(-s / 2), dy, s, s);
      ctx.restore();
    } else {
      ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, dx, dy, s, s);
    }
    ctx.globalAlpha = 1;
    return true;
  };

  /* Vienos pusės kariuomenė. snap = eilės momentinė nuotrauka, dir = žygio kryptis.
   * Unitų tipai imami iš DECK rikiuotės — tie patys, kurie stovi pilies lauke. */
  Renderer.prototype.drawArmy = function (snap, dir, c, laneY, x0, x1, t, deck) {
    var ctx = this.ctx;
    var span = x1 - x0;
    var slot = 0;
    for (var i = 0; i < snap.length; i++) {
      var e = snap[i];
      var p = 1 - e.t01;                                    // 0 = ką tik išsiųsta, 1 = pasiekė
      var lead = dir > 0 ? (x0 + p * span) : (x1 - p * span);
      var charge = e.remain < 400;
      var n = Math.min(e.lines, 8);
      for (var u = 0; u < n; u++) {
        /* būrys tempiasi UODEGA atgal nuo vado; tarpas didelis, nes unitai stambūs */
        var ux = lead - dir * u * 26;
        slot++;
        if (ux < x0 - 40 || ux > x1 + 40) continue;
        var ph = u * 1.7 + i * 2.9;
        /* kiek TAS unitas jau nuėjo — iš to sukama žingsnio animacija */
        var dist = dir > 0 ? (ux - x0) : (x1 - ux);
        var type = deck && deck.length ? deck[(slot - 1) % deck.length] : null;
        if (!type || !this.drawDeckUnit(type, ux, laneY, dir, t, ph, charge, dist)) {
          unitSprite(ctx, Math.round(ux), laneY, dir, c, t / 90 + ph, charge);
        }
      }
    }
  };

  /* MARCH režimas: piešiam TIKRUS simuliacijos unitus.
   * Pozicija imama iš `u.x` (0..1 ašis), animacija — iš `u.dist` (kojos neslysta),
   * o kovojantys sustoja ir kapojasi vietoje. */
  Renderer.prototype.drawMarchers = function (army, mine, theirs, laneY, x0, x1) {
    var ctx = this.ctx, span = x1 - x0;
    var lanes = (C.MARCH.LANES || 1);
    var sc = C.MARCH.LANE_UNIT_SCALE || 1;
    /* Aukštai išdėliojami per visą lentos aukštį; piešiam iš viršaus žemyn,
     * kad apatiniai (arčiau žiūrovo) uždengtų viršutinius — gaunasi gylis. */
    var top = LAY.BOARD_Y + Math.round(C.BOARD_H * 0.16);
    var gap = Math.round(C.BOARD_H * 0.68 / Math.max(1, lanes - 1));

    /* ── PLATFORMOS ──
     * Anksčiau tai buvo 2 px linija per 50 % permatomumo + 1 px per 22 % —
     * praktiškai nematoma, todėl unitai atrodė kaip einantys ORE.
     * Dabar tai tikra akmens briauna su storiu: šviesus viršus (ant jo stovima),
     * tamsesnis šonas (storis) ir tamsi apačia — akis iškart mato paviršių.
     *
     * Kojos atsiremia ties `ly + UNIT_DROP`, tad būtent ten ir yra viršus. */
    var drop = C.MARCH.UNIT_DROP || 0;
    var THICK = Math.max(5, Math.round(gap * 0.14));   // storis, proporcingas aukštui
    for (var l = 0; l < lanes; l++) {
      var ly = top + l * gap + drop;
      var px0 = x0 - 8, pw = span + 16;

      /* 1) metamas šešėlis po platforma — atskiria ją nuo fono */
      ctx.globalAlpha = 0.34;
      rect(ctx, px0 + 2, ly + THICK, pw - 4, 2, U.shadow);
      ctx.globalAlpha = 1;

      /* 2) korpusas (storis) — tamsus akmuo */
      rect(ctx, px0, ly + 1, pw, THICK - 1, U.stoneDark);

      /* 3) viršutinis paviršius — šviesus, 2 px: TAI yra grindys */
      rect(ctx, px0, ly - 1, pw, 2, U.stone);
      rect(ctx, px0, ly - 1, pw, 1, U.stoneLight);

      /* 4) apatinė briauna — pabrėžia storį */
      ctx.globalAlpha = 0.75;
      rect(ctx, px0, ly + THICK - 1, pw, 1, U.shadow);
      ctx.globalAlpha = 1;

      /* 5) mūro faktūra — retos vertikalios siūlės, kad nebūtų plokščia juosta.
       * Determinuota (be Math.random), kad nemirgėtų tarp kadrų. */
      ctx.globalAlpha = 0.30;
      for (var bx = px0 + 9; bx < px0 + pw - 4; bx += 17) {
        var jig = ((bx * 7) % 5) - 2;                  // siūlės kilnojasi, bet stabiliai
        rect(ctx, bx + jig, ly + 2, 1, THICK - 3, U.shadow);
      }
      ctx.globalAlpha = 0.22;
      for (var sx2 = px0 + 4; sx2 < px0 + pw - 4; sx2 += 11) {
        rect(ctx, sx2 + ((sx2 * 3) % 4), ly, 2, 1, U.stoneLight);   // atšvaitai ant viršaus
      }
      ctx.globalAlpha = 1;
    }

    var list = army.units.slice().sort(function (a, b) {
      return (a.lane - b.lane) || (a.x - b.x);
    });
    for (var i = 0; i < list.length; i++) {
      var u = list[i];
      var ux = x0 + u.x * span;
      /* +UNIT_DROP — kojos atsiremia į patį taką, o ne kabo virš jo */
      laneY = top + (u.lane || 0) * gap + (C.MARCH.UNIT_DROP || 0);
      var c = u.side === 'you' ? mine : theirs;
      var fighting = u.state === 'fight';
      /* kai ginklas pakeltas (swingT > 0) — unitas metasi į priekį */
      var jab = (fighting && u.swingT > 0) ? Math.round(3 * (1 - u.swingT / u.hitDelay)) * u.dir : 0;
      var ph = (u.id % 7) * 0.8;
      var dist = u.dist * span;
      /* F12 pozų mašina: blokas -> ataka (vieną kartą) -> idle -> žygis */
      var pose = {
        sinceSwing: army.time - u.swingAt,
        sinceGuard: army.time - u.guardAt,
        moving: !fighting && !u.holding
      };
      /* ⚔️ ×N unitas (2026-08-15): 2 linijos = ×2, tetris = ×4 — didesnis, su aureole ir ×N virš galvos.
       * Kovoje daugiklis krenta (žr. army.js `_syncMult`), tad užrašas iškart rodo tikrą jo jėgą. */
      var ml = Math.max(1, Math.min(4, u.mult || 1));
      var usc = sc * (1 + (ml - 1) * 0.16);
      if (ml > 1) {
        ctx.save();
        ctx.globalAlpha = 0.14 + (ml - 1) * 0.07;
        ctx.fillStyle = '#ffcf5c';
        ctx.beginPath();
        ctx.arc(Math.round(ux + jab), laneY - 2, 9 + (ml - 1) * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (!u.type || !this.drawDeckUnit(u.type, ux + jab, laneY, u.dir, this.t, ph, fighting, dist, fighting, usc, pose)) {
        unitSprite(ctx, Math.round(ux + jab), laneY, u.dir, c, this.t / 90 + ph, fighting);
      }
      /* ⚔️ ×N virš galvos — kiek linijų šis unitas neša ir kiek kartų jis stipresnis. */
      if (ml > 1) {
        var mtx = 'x' + ml, mw = F.width(mtx, 1);
        var mx = Math.round(ux + jab - mw / 2), my = laneY - 16 - (ml - 1) * 2;
        rect(ctx, mx - 2, my - 2, mw + 4, 11, '#05060c');
        F.outlined(ctx, mtx, mx, my, ml >= 4 ? '#ffd75c' : '#ffffff', '#05060c', 1);
      }
      /* HP juosta — rodoma tik apgadintiems, kad nekabėtų virš visų */
      /* (sviediniai piešiami po visų unitų — žr. žemiau) */
      if (u.hp < u.maxHp) {
        var bw = 22, bh = 3, bx2 = Math.round(ux - bw / 2), by2 = laneY + 10;
        rect(ctx, bx2 - 1, by2 - 1, bw + 2, bh + 2, '#000000');
        rect(ctx, bx2, by2, bw, bh, '#3d1515');
        rect(ctx, bx2, by2, Math.round(bw * Math.max(0, u.hp) / u.maxHp), bh,
          u.side === 'you' ? U.good : U.danger);
      }
    }

    /* --- SVIEDINIAI (tiksliai F12 modelis, floor12_merge.js `_f12Arrows` piešimas) ---
     * Strėlė/harpūnas skrenda PARABOLE ir SUKASI pagal trajektorijos liestinę:
     *     cy  = baseY - 4 * arcH * tt * (1 - tt)
     *     dy  = -4 * arcH * (1 - 2 * tt)          // parabolės išvestinė
     *     ang = atan2(dy, dx)
     * Magijos rutuliai (shaman/ghost) skrenda tiesiai — jie nemeta lanko. */
    var Un = global.Units;
    for (var q = 0; q < army.shots.length; q++) {
      var sh = army.shots[q];
      var tt = Math.min(1, sh.t / sh.dur);
      var fromPx = x0 + sh.x0 * span;
      var toPx = x0 + sh.x1 * span;
      var dxF = toPx - fromPx;
      var laneMidY = top + (sh.lane || 0) * gap + (C.MARCH.UNIT_DROP || 0) - Math.round(20 * sc);
      var cx2 = fromPx + dxF * tt;
      var cy2 = laneMidY, ang = 0, arc = 0;

      var pdA = Un && Un.projOf(sh.type);
      /* Kiekvienas sviedinys skrenda SAVAIP — tiksliai kaip F12: */
      if (sh.kind === 'arrow') {
        /* strėlė: parabolė + sukimas pagal liestinę.
         * Lanko aukštis — iš F12 (`arcHeight = lh*0.6`), o ne iš atstumo. */
        arc = (pdA && pdA.arcPx ? pdA.arcPx : 15.5) * sc;
        cy2 = laneMidY - 4 * arc * tt * (1 - tt);
        ang = Math.atan2(-4 * arc * (1 - 2 * tt), dxF);
      } else if (sh.kind === 'harpoon') {
        /* harpūnas: TIESIAI, fiksuotas +pi/4 (sprite smaigalys rodo į viršų-dešinę) */
        ang = Math.PI / 4;
      } else if (sh.kind === 'orb') {
        /* vaiduoklio orbas: tiesiai + švelnus banguojantis plūduriavimas */
        cy2 = laneMidY + Math.sin(sh.t / 90) * 2;
      }
      /* shaman: tiesiai, be sukimo */

      var pd2 = pdA;
      var pf = Un && Un.projFrame(sh.type, sh.t);
      /* `size` jau apskaičiuotas iš F12 lane daugiklių — jokio papildomo mastelio
       * (anksčiau čia buvo `* 1.6`, dėl kurio strėlės buvo dukart per didelės). */
      var ps = pd2 ? Math.round(pd2.size * sc) : 14;

      if (pd2 && pd2.procedural) {
        /* VAIDUOKLIO ORBAS — F12 `_drawLaneGhostProj`: radialinis gradientas su
         * `lighter` kompozicija (ektoplazma švyti), balta šerdis viduje.
         * Jokio sprite'o — F12 jo niekada ir neturėjo. `size` = SPINDULYS. */
        var r1 = Math.max(3, Math.round(pd2.size * sc));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var gr = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r1 * 2.2);
        gr.addColorStop(0, pd2.grad[0]);
        gr.addColorStop(0.4, pd2.grad[1]);
        gr.addColorStop(1, pd2.grad[2]);
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(cx2, cy2, r1 * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.arc(cx2, cy2, r1 * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (pf) {
        ctx.save();
        ctx.translate(Math.round(cx2), Math.round(cy2));
        if (ang) ctx.rotate(ang);
        else if (dxF < 0) ctx.scale(-1, 1);           // skrenda kairėn — apverčiam
        /* F12 harpūnas piešiamas su oranžiniu švytėjimu (shadowBlur 6). */
        if (pf.def.shadow) { ctx.shadowColor = pf.def.shadow; ctx.shadowBlur = 6; }
        ctx.drawImage(pf.img, pf.sx, pf.sy, pf.sw, pf.sh, -ps / 2, -ps / 2, ps, ps);
        ctx.restore();
      } else {
        var col = sh.side === 'you' ? mine[0] : theirs[0];
        rect(ctx, cx2 - 4, cy2 - 1, 8, 2, col);
        rect(ctx, cx2 - 1, cy2 - 1, 2, 2, '#ffffff');
      }

      /* uodega — tik strėlei ir harpūnui (rutuliai jos neturi) */
      if (sh.kind === 'arrow' || sh.kind === 'harpoon') {
        ctx.globalAlpha = 0.28;
        for (var tr = 1; tr <= 4; tr++) {
          var tp = Math.max(0, tt - tr * 0.055);
          var ty2 = laneMidY - 4 * arc * tp * (1 - tp);
          rect(ctx, fromPx + dxF * tp - 1, ty2 - 1, 2, 2, sh.side === 'you' ? mine[1] : theirs[1]);
        }
        ctx.globalAlpha = 1;
      }
    }
  };

  Renderer.prototype.drawLane = function (match) {
    if (!C.CLEAN_UI) return;
    var ctx = this.ctx;
    /* Atitraukiam nuo lentų per pusę stambiausio unito — kitaip 60+ px sprite'as
     * pradžioje/pabaigoje užliptų ant lentos. */
    var inset = Math.min(30, Math.max(6, (LAY.LANE_X1 - LAY.LANE_X0) * 0.14));
    var x0 = LAY.LANE_X0 + inset, x1 = LAY.LANE_X1 - inset;
    if (x1 - x0 < 30) return;
    var laneY = LAY.BOARD_Y + Math.round(C.BOARD_H / 2);

    /* kelias: purvo takas su akmenukais */
    rect(ctx, x0 - 4, laneY + 7, (x1 - x0) + 8, 2, U.shadow);
    ctx.globalAlpha = 0.5;
    rect(ctx, x0 - 4, laneY + 6, (x1 - x0) + 8, 1, U.stoneDark);
    ctx.globalAlpha = 0.3;
    for (var s = x0; s < x1; s += 11) {
      rect(ctx, s + ((s * 7) % 5), laneY + 8, 2, 1, U.stone);
    }
    ctx.globalAlpha = 1;

    var mine = [C.UI.you, '#8fd8e0', '#25585e', '#ffffff'];
    var theirs = [C.UI.foe, '#ffa0a0', '#7a2626', '#ffffff'];

    if (C.MARCH && C.MARCH.ENABLED) {
      this.drawMarchers(match.army, mine, theirs, laneY, x0, x1);
    } else {
      var deck = global.Units ? global.Units.deck(this.t) : null;
      this.drawArmy(match.foe.garbage.snapshot(match.foe.time), 1, mine, laneY, x0, x1, this.t, deck);
      this.drawArmy(match.you.garbage.snapshot(match.you.time), -1, theirs, laneY, x0, x1, this.t, deck);
    }

    var sc = C.MARCH.LANE_UNIT_SCALE || 1;
    var gap = Math.round(C.BOARD_H * 0.68 / Math.max(1, (C.MARCH.LANES || 1) - 1));
    var top = LAY.BOARD_Y + Math.round(C.BOARD_H * 0.16);

    /* SVIEDINIŲ SPROGIMAI — F12 sprite'ai (Arrow_Impact / Shaman_Explosion).
     * Piešiam PRIEŠ ženklus, kad crit žvaigždė liktų viršuje. */
    var UnI = global.Units;
    var fxi = match.fx.impacts;
    for (var iI = fxi.length - 1; iI >= 0; iI--) {
      var im = fxi[iI];
      var imf = UnI && UnI.impactFrame(im.type, im.age);
      if (!imf) { fxi.splice(iI, 1); continue; }
      var imx = x0 + im.ax * (x1 - x0);
      var imy = top + (im.lane || 0) * gap + (C.MARCH.UNIT_DROP || 0);
      /* Sprogimo dydis — iš F12 (strėlė lh*1.4, šamanas lh*1.6), ne iš lane tarpo. */
      var imsz = Math.round((imf.def.size || 36) * sc);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imf.img, imf.sx, imf.sy, imf.sw, imf.sh,
        Math.round(imx - imsz / 2), Math.round(imy - imsz / 2), imsz, imsz);
      ctx.restore();
    }

    /* CRIT ir MISS ženklai — be užrašų, skiriasi forma ir judesiu:
     * kritinis = auksinė žvaigždė su spinduliais, prašovimas = pilkas dūmelis. */
    var fxm = match.fx;
    for (var mI = 0; mI < fxm.marks.length; mI++) {
      var mk = fxm.marks[mI];
      var ma = mk.life / mk.max;
      var mx2 = x0 + mk.ax * (x1 - x0);
      var my2 = top + (mk.lane || 0) * gap + (C.MARCH.UNIT_DROP || 0)
        - Math.round(26 * sc) - Math.round((1 - ma) * 14);

      if (mk.kind === 'crit') {
        var rr2 = 3 + (1 - ma) * 7;
        ctx.globalAlpha = clamp01(ma);
        for (var sp = 0; sp < 8; sp++) {
          var sa = (sp / 8) * Math.PI * 2 + mk.seed;
          rect(ctx, mx2 + Math.cos(sa) * rr2 * 1.6, my2 + Math.sin(sa) * rr2, 2, 2,
            sp % 2 ? '#ffffff' : U.gold);
        }
        ringFill(ctx, mx2, my2, 3 * ma + 1, '#fff3c4');
        ctx.globalAlpha = 1;
      } else {
        /* prašovimas — trys pilki taškeliai, plaukiantys aukštyn ir išsisklaidantys */
        ctx.globalAlpha = clamp01(ma * 0.65);
        for (var dp = 0; dp < 3; dp++) {
          var off2 = (dp - 1) * (2 + (1 - ma) * 4);
          rect(ctx, mx2 + off2, my2 - dp * 2, 2, 2, U.dim);
        }
        ctx.globalAlpha = 1;
      }
    }

    /* kirčiai — ten, kur ataka buvo pakirsta */
    var fx = match.fx;
    for (var k = 0; k < fx.clashes.length; k++) {
      var cl = fx.clashes[k];
      var a = cl.life / cl.max;
      var cx2;
      var clY = laneY;
      if (cl.ax != null) {
        cx2 = x0 + cl.ax * (x1 - x0);                 // MARCH: tiesiai iš simuliacijos
        clY = LAY.BOARD_Y + Math.round(C.BOARD_H * 0.16) + (cl.lane || 0) * Math.round(C.BOARD_H * 0.68 / Math.max(1, (C.MARCH.LANES || 1) - 1)) + (C.MARCH.UNIT_DROP || 0);
      } else {
        var p2 = 1 - cl.t01;
        cx2 = (cl.side === 'you') ? (x1 - p2 * (x1 - x0)) : (x0 + p2 * (x1 - x0));
      }
      var r = ((1 - a) * 14 + 3) * (cl.strength || 1);
      ringShape(ctx, cx2, clY, r, '#ffffff', a * 0.9);
      ringShape(ctx, cx2, clY, r * 0.6, U.gold, a * 0.7);
      /* kibirkštys */
      ctx.globalAlpha = clamp01(a);
      for (var q = 0; q < 6; q++) {
        var ang = (q / 6) * Math.PI * 2 + cl.seed;
        rect(ctx, cx2 + Math.cos(ang) * r * 1.4, clY + Math.sin(ang) * r, 2, 2, q % 2 ? U.gold : '#ffffff');
      }
      ctx.globalAlpha = 1;
    }
  };

  /* ---------- pagrindinis kadras ---------- */

  /* 💨 countdown popup'o IŠNYKIMAS: paskutinis kadras išsiplečia ir išblunka per 400ms */
  Renderer.prototype.drawCountdownExit = function () {
    var ctx = this.ctx, cx = this.vw / 2, cy = this.vh / 2;
    var k = Math.min(1, (this.t - this._cdWas) / 400);
    var e = 1 - Math.pow(1 - k, 2);
    var cimg = this._badge('count_anim.png');
    if (!cimg) return;
    var csz = 120 * (1 + 0.4 * e), cx0 = cx - csz / 2, cy0 = cy - csz / 2 - 6;
    ctx.save();
    ctx.globalAlpha = 1 - e;
    stoneFrame(ctx, cx0 - 5, cy0 - 5, csz + 10, csz + 10, 5);
    ctx.drawImage(cimg, 19 * 96, 0, 96, 96, cx0, cy0, csz, csz);
    ctx.restore();
  };

  Renderer.prototype.draw = function (match, dt) {
    var ctx = this.ctx;
    this.t += dt;
    this._m = match;   // 🪪 drawSide skaito mačo tapatybes (badge'ams)
    if (!this._preloadedBadges) {   // ⏱️ preload — kad countdown/badge animacijos startuotų be vėlavimo
      this._preloadedBadges = 1;
      this._badge('count_anim.png'); this._badge('ai_ronke_anim.png'); this._badge('ronke_idle_anim.png');
    }
    var fx = match.fx;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(this.scale, this.scale);
    ctx.imageSmoothingEnabled = false;

    rect(ctx, 0, 0, this.vw, this.vh, U.bg);

    /* viso ekrano drebėjimas */
    var go = fx.offset();
    if (go[0] || go[1]) ctx.translate(go[0], go[1]);

    this.drawBackdrop(fx, dt);

    this.drawSide(match.you, fx, 0, true, match._aiPlaying ? (match._aiYouName || '🤖 YOUR AI') : null);   // 🤖 tavo pusę žaidžia tavo AI
    this.drawSide(match.foe, fx, LAY.HALF, false, match.foeName);
    this.drawDivider(match);
    this.drawLane(match);
    this.drawProjectiles(fx);

    if (match.state === 'menu') this.drawMenu(match, dt);
    else if (match.state === 'lobby') this.drawLobby(match);
    else if (match.state === 'challenge') this.drawChallenge(match);
    else if (match.state === 'awaiting') this.drawAwaiting(match);
    else if (match.state === 'connecting') this.drawConnecting(match);
    else if (match.state === 'prep') this.drawPrep(match);
    else if (match.state === 'countdown') { this.drawCountdown(match); this._cdWas = this.t; }
    if (match.state === 'playing' && this._cdWas && (this.t - this._cdWas) < 400) this.drawCountdownExit();
    else if (match.state === 'paused') this.drawPause();
    else if (match.state === 'result') this.drawResult(match);

    /* 📡 GYVAS PING (tik online colyseus, kai jau prisijungta) — kad žaidėjas matytų realų lagą.
     * ⚠️ Piešiam per F.outlined (NE T.*), nes CLEAN_UI slopina T.* → ping buvo nematomas.
     * Spalvos: žalia=geras, geltona=pakenčiamas, raudona=blogas signalas (didelis lagas). */
    if (match.netMode === 'colyseus' && match._pingTimer) {
      var _now = (global.Date && Date.now) ? Date.now() : +new Date();
      var ping = match._ping | 0;
      var stale = !match._pingAt || (_now - match._pingAt > 5000);
      var lvl = stale ? 0 : (ping < 80 ? 3 : (ping < 160 ? 2 : 1));  // 3=geras 2=vidut 1=blogas 0=nėra
      var pc = lvl === 3 ? U.good : lvl === 2 ? U.gold : lvl === 1 ? U.danger : U.dim;
      var ptxt = stale ? 'PING --' : ('PING ' + ping + 'ms');
      /* mažas signalo taškelis + tekstas viršuje kairėje (su tamsiu kontūru → matosi ant bet ko) */
      rect(ctx, 4, 6, 4, 4, pc);
      F.outlined(ctx, ptxt, 11, 4, pc, '#05060c', 1);

      /* ⚠️ BLOGAS SIGNALAS: jei raudona ARBA nėra atsako — įspėjam ryškiai. Kol dar NEžaidžiama
       * (lobis/iššūkis/atgalinė atskaita) siūlom palaukti — kad nepradėtų kovos su dideliu lagu. */
      var bad = (lvl === 1) || stale;
      if (bad) {
        var preplay = (match.state === 'lobby' || match.state === 'challenge' ||
                       match.state === 'awaiting' || match.state === 'connecting' ||
                       match.state === 'countdown');
        var warn = stale ? 'NO CONNECTION' : 'WEAK SIGNAL — HIGH LAG';
        var blink = (Math.floor(_now / 400) % 2) === 0;
        if (blink) {
          F.outlinedCenter(ctx, warn, Math.floor(this.vw / 2), 16, U.danger, '#05060c', 1);
          if (preplay) F.outlinedCenter(ctx, 'BETTER TO WAIT', Math.floor(this.vw / 2), 28, U.gold, '#05060c', 1);
        }
      }
    }

    /* viso ekrano blyksnis */
    if (fx.flashA > 0.01) {
      ctx.globalAlpha = Math.min(0.6, fx.flashA);
      rect(ctx, -8, -8, this.vw + 16, this.vh + 16, fx.flashC);
      ctx.globalAlpha = 1;
    }

    /* vinjetė — pritemdyti pakraščiai, žvakių šviesos pojūtis */
    for (var vg = 0; vg < 14; vg++) {
      ctx.globalAlpha = clamp01(0.055 * (1 - vg / 14));
      rect(ctx, 0, vg * 2, this.vw, 2, '#000000');
      rect(ctx, 0, this.vh - (vg + 1) * 2, this.vw, 2, '#000000');
      rect(ctx, vg * 2, 0, 2, this.vh, '#000000');
      rect(ctx, this.vw - (vg + 1) * 2, 0, 2, this.vh, '#000000');
    }
    ctx.globalAlpha = 1;

    T.right(ctx, global.Sfx.isOn() ? 'SOUND ON' : 'MUTED', this.vw - 4, this.vh - 10, U.dim, 1);
    /* švariame režime garso būseną rodo tik mažas perbrauktas kvadratėlis, kai išjungta */
    if (C.CLEAN_UI && !global.Sfx.isOn()) {
      var mx = this.vw - 12, my = this.vh - 12;
      ctx.globalAlpha = 0.5;
      frame(ctx, mx, my, 8, 8, U.dim);
      for (var mi = 0; mi < 8; mi++) rect(ctx, mx + mi, my + mi, 1, 1, U.dim);
      ctx.globalAlpha = 1;
    }
    if (!(global.document.fullscreenElement || global.document.webkitFullscreenElement)) {
      T.text(ctx, 'F  FULLSCREEN', 4, this.vh - 10, U.dim, 1);
    }

    if (go[0] || go[1]) ctx.translate(-go[0], -go[1]);
  };

  Renderer.LAY = LAY;
  global.Renderer = Renderer;
})(window);
