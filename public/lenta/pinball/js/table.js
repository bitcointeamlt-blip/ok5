// Rutulio SPALVA → kontakto efektas. Kol kas TIK geltona (zap) — kiti efektai
// laikinai išjungti (user 07-18). Kiti rutuliai: tik taškai (+N), be efekto.
// Atmosferiška paletė (derinasi su pilies akmeniu / auksu / fakelais): muted, ne neon.
// Aiškiai skirtingi atspalviai (buvo 3 panašūs auksiniai): terakota / mėlyna / žalia / juoda / auksas.
const BALL_FX = {
  '#d9a441': 'zap',       // gintaro auksas — žaibas (peršoka į artimiausią rutulį)
  '#7a9b63': 'bounceup',  // šalavijo žalia — atšoka vertikaliai (viršun/apačion)
  '#4a7db0': 'slowmo',    // akmens mėlyna — laikas sulėtėja, tada normalu
  '#bd5f47': 'steer',     // terakota — 1 sek langas ←/→ pakoreguoti skridimo kryptį
};

// table.js — TableManager: lentos geometrija PER AUKŠTĄ (rebuild(floor)).
// Struktūra (kontūras/funnel/flipperiai/plunger/LUBOS su vartais) — pastovi;
// ELEMENTAI (bumperiai/posts/drops/sensoriai/danger) keičiasi pagal aukštą (šablonai).
// Kolizijos normalė dinaminė (physics.js). Vartai = 'gate' segmentas (dropped=atviri).
class TableManager {
  constructor() {
    this.W = CONFIG.world.w;   // 260
    this.H = CONFIG.world.h;   // 440

    // Pozicijos pagal bg1.png (simetriška lenta). Kamuoliukas KRINTA iš viršaus-centro
    // (nėra plunger tako), tad „seat" = viršus-centras.
    this.leftPivot = { x: 61, y: 375 };
    this.rightPivot = { x: 199, y: 375 };
    this.plungerSeat = { x: 130, y: 42 };
    // Kamuoliukas krinta pro VARTUS į kitą aukštą (centrinė lubų anga x100..160):
    // atsitiktinė x pozicija šio diapazono ribose (su paraštėm kamuolio r=5).
    this.gateDrop = { min: 106, max: 154 };
    this.drainY = this.H + 6;

    this.gate = null;
    this.boss = null;
    this.floor = 1;
    this.rebuild(1);
  }

  // ── Perstatymas naujam aukštui ──
  rebuild(floor) {
    this.floor = floor;
    this.segments = [];
    this.circles = [];
    this.sensors = [];
    this.dropTargets = [];
    this.boss = null;
    this._buildBorder();
    this._buildElements(floor);
  }

  isBossFloor(floor) { return floor % 2 === 1; }   // bosas KAS 2 kambarius (nelyginiai: 1,3,5,7...)

  // Deterministinis RNG iš aukšto (kad tas pats aukštas atrodytų vienodai).
  _rng(seed) {
    let s = (seed * 9301 + 49297) % 233280;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  _wall(ax, ay, bx, by, opts) {
    opts = opts || {};
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    const seg = {
      ax, ay, bx, by,
      r: opts.r != null ? opts.r : 3,
      nx: -dy / L, ny: dx / L,
      rest: opts.rest != null ? opts.rest : CONFIG.restWall,
      fric: opts.fric != null ? opts.fric : CONFIG.wallFriction,
      impulse: opts.impulse || 0,
      score: opts.score || 0,
      type: opts.type || 'wall',
      billiardOnly: opts.billiardOnly || false,   // TIK dideliems rutuliams (cue praeina pro)
      dropped: false, dropUntil: 0,
      _cool: 0,
    };
    this.segments.push(seg);
    return seg;
  }

  _circle(x, y, r, opts) {
    opts = opts || {};
    const type = opts.type || 'bumper';
    // Bumperiai/boost = TIKRI biliardo rutuliai: dinamiški, stovi ramiai kol
    // pataikomi, tada rieda su trintimi ir atsimuša (žr. game._stepBilliards).
    const dynamic = (type === 'bumper' || type === 'boost');
    this.circles.push({
      x, y, r,
      bx0: x, by0: y,
      move: opts.move || null,
      rest: opts.rest != null ? opts.rest : CONFIG.restBumper,
      impulse: opts.impulse || 0,
      score: opts.score || 0,
      type,
      color: opts.color || '#f5a742',
      fx: BALL_FX[opts.color] || null,   // kontakto efektas pagal spalvą
      _cool: 0, _flash: 0,
      _ox: 0, _oy: 0, _ovx: 0, _ovy: 0, _spin: 0, _spinv: 0, _scale: 1,
      // Biliardo rutulys: tikras greitis (pradžioj 0 — juda tik kai pataikomas),
      // masė ∝ ploto (didesnis = sunkesnis = mažiau pajudinamas).
      dynamic,
      vx: 0, vy: 0,
      mass: r * r,
      // 3D riedėjimo animacija: fazė (kiek pasisukęs) + kryptis (kur rieda).
      _roll: 0, _rollDx: 1, _rollDy: 0,
    });
  }

  _sensor(x, y, r, type, score, extra) {
    this.sensors.push(Object.assign({ x, y, r, type, score: score || 0, _cool: 0, _lit: 0, _spin: 0, _active: 0 }, extra || {}));
  }

  // ── Kontūras (hitbox'ai palei BG.png chromo bėgius) + LUBOS su GATE ──
  _buildBorder() {
    const cy = CONFIG.gate.ceilingY;   // 28
    // Lubos: kairė | GATE | dešinė → plunger deflektorius
    // bg1: SIMETRIŠKA lenta. Lubos arka viršuj (kamuoliukas krinta iš po jų), šoninės
    // sienos, funnel'iai į flipperius, drain tarpas apačioj-centre. Jokio plunger tako.
    // Lubos VIENTISOS su VIENA DIDELE centrine ANGA (x100..160, c130) = ascend portalas
    // į kitą kambarį (sutampa su bg1 langu): numuši kamuoliuką aukštyn pro ją → kitas aukštas.
    this._wall(28, 32, 100, 22);         // kairė lubos (iki centrinės angos)
    this._wall(160, 22, 232, 32);        // dešinė lubos (nuo centrinės angos)
    // Lubų VARTAI centrinėje angoje — normaliai ATVIRI (praeinami), bet UŽSIDARO kol gyvas
    // bosas (žr. game.js: gate.dropped = !bossAlive). Tada kamuoliukas atsimuša nuo vartų
    // (ne iškrenta pro viršų) → be numušto boso negali pakilti į kitą aukštą.
    this.gate = this._wall(100, 22, 160, 22, { type: 'gate', rest: 0.5 });
    this.gate.dropped = true;            // pradžioj atviri (ascend veikia kai nėra boso)
    // Šoninės sienos
    this._wall(28, 32, 29, 300);         // kairė siena
    this._wall(232, 32, 231, 300);       // dešinė siena
    // Funnel'iai → flipperiai (drain tarpas centre)
    this._wall(29, 300, 61, 375);        // kairė funnel
    this._wall(231, 300, 199, 375);      // dešinė funnel

    // Barjerai TIK dideliems rutuliams (žaidėjo kamuoliukas praeina pro juos) — kad
    // rutuliai neužliptų prie lango. Apverstas „V": viršūnė prie centro (lango), leidžiasi
    // į šonus; tarpas centre x100..160 = kur krinta/kyla žaidėjo kamuoliukas.
    this._wall(42, 102, 100, 82, { billiardOnly: true });    // kairė (kyla link centro)
    this._wall(100, 82, 160, 82, { billiardOnly: true });    // viršus — ištisa linija
    this._wall(160, 82, 218, 102, { billiardOnly: true });   // dešinė (leidžiasi į šoną)
  }

  _bump(x, y, color, move) {
    this._circle(x, y, CONFIG.bumper.radius, { impulse: CONFIG.bumper.impulse, score: CONFIG.bumper.score, type: 'bumper', color, move });
  }
  _boost(x, y, move) {
    this._circle(x, y, CONFIG.boost.radius, { impulse: CONFIG.boost.impulse, score: CONFIG.boost.score, rest: CONFIG.restBumper, type: 'boost', color: '#e0842c', move });   // centrinis — sodri gintaro oranžinė (atskira nuo auksinių)
  }
  _post(x, y, move) {
    this._circle(x, y, CONFIG.post.radius, { impulse: 0, score: 0, rest: CONFIG.post.rest, type: 'post', move });
  }
  _dropBank(x, y0) {
    const dOpt = { r: 2.5, rest: 0.3, fric: 0, score: CONFIG.drop.score, type: 'drop' };
    for (let i = 0; i < 3; i++) this.dropTargets.push(this._wall(x, y0 + i * 22, x, y0 + 18 + i * 22, dOpt));
  }
  // Slingshot-kickeris virš flipperio (neon apskritimas, atmuša + taškai).
  _kicker(x, y) {
    this._circle(x, y, 7, { impulse: 280, score: 1, rest: 0.85, type: 'kicker', color: '#7be0ff' });
  }
  // Bosas — didelis, su HP; vartai lieka UŽRAKINTI kol nenukausi (žr. Game).
  // sprite: 'gorilla' → piešiamas animuotu blue-gorilla sprite (žr. game.js), kitaip procedūrinis.
  _boss(x, y, floor, sprite) {
    const maxHp = 6 + Math.floor(floor / 5) * 3;   // sunkėja su gyliu
    this._circle(x, y, 24, {
      move: { ax: 26, ay: 0, spd: 0.55, ph: 0 },
      rest: 0.7, impulse: 0, score: 0, type: 'boss', color: '#5a7fd0',   // mėlyna (gorila)
    });
    const b = this.circles[this.circles.length - 1];
    b.hp = maxHp; b.maxHp = maxHp; b.dead = false; b.sprite = sprite || null;
    this.boss = b;
  }

  // ── Elementai: TIK biliardo rutuliai (juda kai pataikai) + slow-mo zona. ──
  // Nuimta: postai, kickeriai, drop-target'ai, spinneriai, rollover'iai, danger.
  _buildElements(floor) {
    const C = ['#bd5f47', '#4a7db0', '#7a9b63', '#2c313d', '#d9a441'];   // terakota/mėlyna/šalavijas/ONYX juoda/auksas
    const t = (floor - 1) % 3;

    // 1 AUKŠTAS — BOSAS (blue gorilla, su HP) su specialiu išdėstymu (boost + bumperiai).
    if (floor === 1) {
      this._boss(130, 116, floor, 'gorilla');
      this._boost(130, 210);
      this._bump(68, 196, C[3]); this._bump(184, 196, C[4]);
      return;
    }

    // Boss aukštas (KAS 2 — nelyginiai 3,5,7...): TA PATI mėlyna gorila (sprite + hurt/death
    // animacijos), didesnis HP pagal gylį + keli biliardo rutuliai. Lyginiuose (2,4,6...) — boso NĖRA.
    if (this.isBossFloor(floor)) {
      this._boss(130, 116, floor, 'gorilla');
      this._bump(64, 250, C[0]); this._bump(196, 250, C[1]);
      return;
    }

    // ── Ne-boso aukštai: KINTANTIS išdėstymas + KIEKIS (4-6 rutuliai) — skiriasi kas aukštą. ──
    // Šablonai deterministiškai parenkami pagal aukštą (tas pats aukštas atrodo vienodai, bet
    // gretimi skiriasi). Placement: [x, y, isBoost]. Visi telpa biliardo lauke (x40..220, y100..255).
    const LAYOUTS = [
      [[130, 106, 0], [112, 133, 0], [148, 133, 0], [130, 210, 1], [68, 196, 0], [184, 196, 0]],   // 6: rack + šonai + centras
      [[130, 104, 0], [80, 168, 0], [180, 168, 0], [130, 232, 0], [130, 168, 1]],                   // 5: rombas + centrinis boost
      [[84, 120, 0], [176, 120, 0], [84, 214, 0], [176, 214, 0]],                                   // 4: kvadrato kampai
      [[70, 120, 0], [130, 120, 1], [190, 120, 0], [70, 210, 0], [130, 210, 0], [190, 210, 0]],     // 6: dvi eilės po 3
      [[130, 110, 0], [74, 162, 0], [186, 162, 0], [130, 210, 1], [130, 252, 0]],                   // 5: kryžius/X
      [[72, 120, 0], [122, 166, 0], [172, 212, 0], [196, 118, 1]],                                  // 4: įstriža + boost
      [[130, 100, 0], [80, 136, 0], [180, 136, 0], [80, 204, 0], [180, 204, 0], [130, 240, 1]],     // 6: šešiakampis
      [[95, 128, 0], [165, 128, 1], [95, 206, 0], [165, 206, 0]],                                   // 4: poros
    ];
    // Ne-boso aukštai dabar tik LYGINIAI (2,4,6...) → indeksuojam pagal floor/2, kad naudotųsi visi 8 šablonai.
    const li = ((Math.floor(floor / 2) - 1) % LAYOUTS.length + LAYOUTS.length) % LAYOUTS.length;
    const layout = LAYOUTS[li];
    for (let i = 0; i < layout.length; i++) {
      const p = layout[i];
      if (p[2]) this._boost(p[0], p[1]);
      else this._bump(p[0], p[1], C[(t + i) % C.length]);   // spalvos rotuoja pagal aukštą → įvairovė
    }
  }
}
