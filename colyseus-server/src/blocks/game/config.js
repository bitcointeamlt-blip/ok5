/* RONKE BLOCKS — konfigūracija ir derinimo parametrai.
 * Viskas, kas keičia "feel", laikoma ČIA. Feel keičiam PO VIENĄ parametrą.
 * Šaltiniai: Tetris Guideline (SRS / 7-bag), TETR.IO handling defaults. */
(function (global) {
  'use strict';

  var CFG = {
    /* ---------- lentos geometrija ---------- */
    COLS: 10,
    ROWS: 20,      // matomos eilutės
    BUFFER: 2,     // paslėptos eilutės virš lentos (spawn zona)
    CELL: 14,      // virtualūs pikseliai vienam langeliui

    /* ---------- virtualus ekranas (integer scale) ---------- */
    VW: 640,
    VH: 360,

    /* ---------- valdymo jausmas (handling) ---------- */
    DAS: 133,      // ms iki auto-shift pradžios
    ARR: 20,       // ms tarp auto-shift žingsnių (0 = momentinis)
    SDF: 25,       // soft drop greitis: kartų greičiau nei gravitacija (ms/cell = max(8, grav/SDF))
    LOCK_DELAY: 500,
    LOCK_RESETS: 15,   // kiek kartų judesys gali atnaujinti lock delay

    /* ---------- gravitacija ---------- */
    GRAVITY_START: 1000,  // ms vienam langeliui 1 lygyje
    GRAVITY_MIN: 90,
    LEVEL_LINES: 10,      // kas kiek linijų kyla lygis
    LEVEL_FACTOR: 0.80,   // gravitacija *= factor kiekvienam lygiui

    /* ---------- PvP atakos ----------
     * DU ATSKIRI BIUDŽETAI (svarbu suprasti):
     *
     *   GYNYBA  — kiekviena sunaikinta linija panaikina lygiai VIENĄ gaunamą liniją (1:1).
     *             Nepriklauso nuo lentelės. Todėl net vienguba padeda gintis per 3 s langą.
     *   PUOLIMAS— linijos, kurių NEPRIREIKĖ gynybai, verčiamos ataka per šitą lentelę.
     *
     * Pvz. laukia 2, sunaikini 4: 2 nueina gynybai, likusios 2 -> ATTACK_TABLE[2] = 1 -> COUNTER +1.
     * Pvz. nieko nelaukia, sunaikini 4: visos 4 laisvos -> ATTACK_TABLE[4] = 4 -> QUAD atsiperka.
     *
     * Klasikinė guideline lentelė: vienguba nesiunčia nieko, quad duoda 4 -> apsimoka kaupti. */
    ATTACK_TABLE: { 1: 0, 2: 1, 3: 2, 4: 4 },
    GARBAGE_DELAY: 3000,     // (nebenaudojamas MARCH režime — paliktas senam kodui)

    /* ---------- MŪŠIO KORIDORIUS ----------
     * Pakeičia 3 s laikmatį. Išvalei liniją -> paleidai unitą; jis eina koridoriumi;
     * susitiko priešo unitą -> kova, laimėtojas tęsia; nuėjo iki galo -> priešui linija.
     *
     * Gynyba nebe „spėk išvalyti per 3 s", o „paleisk savo unitą perimti".
     * SPEED = ašies dalis per sekundę: 0.14 -> visą koridorių pereina per ~7 s.
     * Norint lėtesnio žingsnio — mažink SPEED (ne animacijos FPS!). */
    MARCH: {
      ENABLED: true,
      /* Statai (hp/dmg/cd/range/spd) imami iš F12 `ALLY_STATS` per Units.stats().
       * F12 greičiai labai lėti (skull 0.012 -> ~83 s takeliui), tad koridoriui
       * dauginam, o tarpusavio santykius paliekam F12.
       * SPEED_SCALE 5 -> skull pereina per ~17 s, archer ~14 s, shaman ~20 s.
       * Nori dar lėčiau — mažink šitą vieną skaičių. */
      SPEED_SCALE: 5,
      /* F12 takelis platus, mūsų koridorius ~164 px. Archer range 0.12 čia reiškė
       * vos ~20 px — strėlė gimdavo jau taikinio viduje ir jos nesimatydavo.
       * Padauginam, kad tolimojo mūšio unitai iš tikrųjų stovėtų atokiai ir
       * strėlė turėtų kur skristi. Santykiai tarp tipų lieka F12. */
      RANGE_SCALE: 2.4,
      /* PASTABA: užsimojimo laikymas (880 ms), idle/guard pauzės ir vaiduoklio
       * pakibimas ČIA NEBEDERINAMI — jie ateina iš `F12.behavior` (žr.
       * tools/extract_f12.js). Anksčiau čia buvo mano paties parinkti skaičiai
       * (PAUSE_MIN 2600, IDLE_CHANCE 0.35 ir pan.), kurie su F12 nesutapo. */
      LINES_PER_UNIT: 1,  // kiek linijų prideda atėjęs unitas

      /* AUKŠTAI: koridorius padalintas į kelias juostas. Kiekviename aukšte vienu
       * metu telpa TIK VIENAS unitas iš pusės, tad kova visada 1 prieš 1.
       * Išvalius 4 linijas unitai išsiskirsto po aukštus, o ne susigrūda krūvon;
       * jei laisvų aukštų nėra — laukia eilėje prie savo lentos. */
      LANES: 4,
      /* ⚔️ PASTIPRINIMAS vietoj eilės (2026-08-15, user: „stiprinam tuos, kurie jau kovoja,
       * kad nesusinaikintų"). Kai visi aukštai užimti, nauja linija nebeguldo unito į eilę
       * (ten kabodavo ~28 unitai), o pagydo silpniausią kovojantį ir prideda HP/žalos.
       * HP/DMG — kiek pridedama už vieną pastiprinimą; MAX — kiek kartų vienas unitas gali stiprėti. */
      REINFORCE: { HP: 0.5, DMG: 0.35, MAX: 6 },
      LANE_UNIT_SCALE: 0.72,  // unitai mažesni, kad 4 aukštai tilptų vienas virš kito
      /* Kiek px nuleisti unitą žemyn nuo aukšto linijos, kad kojos atsiremtų
       * į patį taką, o ne kabotų virš jo. */
      UNIT_DROP: 6
    },
    GARBAGE_SAME_HOLE: true, // vienos atakos linijos dalinasi ta pačia skyle
    GARBAGE_MAX_QUEUE: 12,   // saugiklis
    COMBO_ENABLED: false,    // v1: BE combo bonusų (pridedam po feel testo)

    /* ---------- rungtynių eiga ---------- */
    COUNTDOWN_MS: 3000,
    READY_TEXT: ['3', '2', '1', 'GO!'],

    /* ---------- AI sudėtingumas ----------
     * moveMs  = pauzė tarp AI įvedimų (greičio reguliatorius)
     * mistake = renkasi 2-5 geriausią variantą (vis dar padoru)
     * blunder = renkasi TIKRAI prastą variantą -> palieka skyles, kuriomis gali pasinaudoti
     * panic   = kiek kartų padidinamas linijų naikinimo svoris kai laukia garbage */
    AI_LEVELS: {
      EASY:   { name: 'SQUIRE',  moveMs: 168, thinkMs: 430, mistake: 0.32, blunder: 0.14, useHold: false, panic: 1.1 },
      NORMAL: { name: 'KNIGHT',  moveMs: 108, thinkMs: 280, mistake: 0.19, blunder: 0.07, useHold: true,  panic: 1.4 },
      HARD:   { name: 'WARLORD', moveMs: 112, thinkMs: 230, mistake: 0.15, blunder: 0.05, useHold: true,  panic: 1.9 },
      INSANE: { name: 'RONKE AI',moveMs: 44,  thinkMs: 80,  mistake: 0.00, blunder: 0.00, useHold: true,  panic: 2.8 }
    },
    AI_DEFAULT: 'EASY',

    /* Kiek AI vertina ATAKOS vertę (ne tik nuvalytų linijų kiekį).
     * 0 = valo godžiai po vieną (nesiunčia nieko); 1.6 = taikosi į dvigubas/quad'us kaip žmogus.
     * Kai laukia garbage, botas persijungia į žalią linijų skaičių — gynyba juk 1:1. */
    AI_ATK_WEIGHT: 1.6,

    /* Bauda už VIENGUBOS valymą, kai niekas nespaudžia (nelaukia garbage).
     * Botas neturi lookahead, tad pats "susiplanuoti" quad'o negali — ši bauda
     * atstoja žmogišką „nešvaistyk linijos, statyk toliau". Kai laukia garbage,
     * bauda nebetaikoma: gynybai kiekviena linija verta 1:1. */
    AI_SINGLE_PENALTY: 1.3,

    /* ---------- El-Tetris euristikos svoriai (open source, Islam El-Ashi) ---------- */
    AI_W: {
      landingHeight:   -4.500158825082766,
      rowsEliminated:   3.4181268101392694,
      rowTransitions:  -3.2178882868487753,
      colTransitions:  -9.348695305445199,
      holes:           -7.899265427351652,
      wellSums:        -3.3855972247263626
    },

    /* ---------- JUICE: kiek "sultingas" atsakas į veiksmus ---------- */
    JUICE: {
      HITSTOP_QUAD: 90,        // trumpas kadro sustabdymas -> smūgio pojūtis
      HITSTOP_COUNTER: 120,
      HITSTOP_BLOCKED: 55,
      HITSTOP_GARBAGE: 70,
      HITSTOP_TOPOUT: 260,
      PROJECTILE_MS: 430,      // kiek laiko ataka skrenda per ekraną
      TRAIL_MS: 240,           // hard drop šleifas
      DANGER_ROWS: 5,          // nuo kokio aukščio įsijungia pavojaus režimas
      HEARTBEAT_MS: 680
    },

    /* ---------- garsas ---------- */
    SFX_VOL: 0.35,
    SFX_ON: true,

    /* ---------- ŠVARUS EKRANAS ----------
     * true  = jokių skaičių ir užrašų. Lieka tik lenta, figūros, animacijos ir efektai.
     *         Visa informacija perduodama forma, spalva ir judesiu.
     * false = pilnas HUD su statistika, vardais, laikrodžiu ir tekstiniais popup'ais.
     * Vienas jungiklis — nieko daugiau keisti nereikia. */
    CLEAN_UI: true,

    /* ---------- debug ---------- */
    SHOW_GHOST: true,
    SHOW_GRID: true
  };

  CFG.TOTAL_ROWS = CFG.ROWS + CFG.BUFFER;
  CFG.BOARD_W = CFG.COLS * CFG.CELL;   // 140
  CFG.BOARD_H = CFG.ROWS * CFG.CELL;   // 280

  /* ---------- MEDIEVAL paletė (Tiny Swords, suderinta su likusia lenta) ----------
   * Kiekviena figūra = medžiaga, ne šiaip spalva: brangakmenis, metalas, akmuo.
   * Tvarka: [bazė, šviesus, tamsus, kontūras, blikas]
   * Kontūras — chunky tamsus rėmelis (NIEKAD neon glow, žr. UI temos taisyklę). */
  CFG.COLORS = {
    I: ['#5ec8d8', '#a8ecf5', '#2a6f7d', '#14343a', '#dffaff'],  // ledo kristalas
    O: ['#ffcf5c', '#ffe9a8', '#a8792a', '#3d2817', '#fff6d0'],  // aukso luitas
    T: ['#a06fc4', '#cfa8e8', '#5c3378', '#2a1640', '#ecd6ff'],  // ametistas
    S: ['#7fc45a', '#b8e89a', '#3f6f2c', '#1c3315', '#ddf7c4'],  // samanotas jadeitas
    Z: ['#e85d5d', '#ffa0a0', '#8f2a2a', '#3d1515', '#ffd4d4'],  // rubinas
    J: ['#5a86c4', '#a3c0ec', '#2c4a7a', '#15243d', '#d8e6ff'],  // safyras
    L: ['#d88a3c', '#f5bd7e', '#8a4d15', '#3d2409', '#ffe0bb'],  // varis
    G: ['#8a7050', '#b09472', '#55432c', '#2a1a0a', '#cbb392']   // skalda / griuvėsiai
  };

  CFG.UI = {
    /* RONKEPONG stilius: navy/plienas/žydra (buvo šiltas rudas medis). Blokai lieka spalvoti;
       ugnis/garbage lieka šilti (kontrastas prieš navy). */
    bg:      '#0a0d16',   // gili navy naktis
    panel:   '#1c2742',   // navy panelė
    panel2:  '#0f141f',   // duobės (lentos) vidus — tamsi navy
    line:    '#2a3346',   // plieno-tamsus rėmas
    text:    '#dfe8f5',   // šviesus plienas (buvo pergamentas)
    dim:     '#7f8ba0',
    gold:    '#ffcf5c',   // atranka/prizai (paliekam)
    danger:  '#e85d5d',
    good:    '#8fffb0',   // RonkePong bonus žalias
    you:     '#5aa9d4',   // žydra vėliava
    foe:     '#e85d5d',   // raudona vėliava

    /* plieno priedai (RonkePong) */
    stone:      '#6f7789',
    stoneLight: '#8a92a8',
    stoneDark:  '#3a3d4a',
    shadow:     '#05070d',
    woodLight:  '#8a92a8',
    ember:      '#ff9d3d',   // ugnis lieka šilta
    torch:      '#ffb347',

    /* poliruotos NAVY panelės (pixel-art su ◇ gemų kampais — plaque() render.js) */
    pnl:     '#1c2742',   // panelės vidus (gili navy)
    pnlEdge: '#0b1120',   // išorinis tamsus kraštas
    pnlHi:   '#35486f',   // viršaus/kairės blikas (bevel)
    pnlLo:   '#121a2e',   // apačios/dešinės šešėlis
    pnlIn:   '#405684',   // vidinis įleistas rėmelis
    gem:     '#a6c8ee'    // kampų brangakmenis (◇)
  };

  global.CFG = CFG;
})(window);
