// config.js — VISI svarbūs fizikos/feel parametrai vienoje vietoje.
// Debug meniu (`` ` `` klavišas) keičia šias reikšmes GYVAI, kad būtų galima
// nusiderinti kamuoliuko jausmą be perkrovimo. Etapas 1: tik fizikos prototipas.
const CONFIG = {
  // Loginė (pasaulio) rezoliucija pikseliais — pixel-art backbuffer dydis.
  // Portretinė pinball lenta. Integer-scale'inama į langą (žr. game.js).
  world: { w: 260, h: 440 },

  // Fiksuotas fizikos žingsnis (fixed timestep) — stabili, prognozuojama fizika.
  fixedDt: 1 / 120,
  maxSubSteps: 16,      // CCD: kiek dalinių žingsnių per fizikos tiką (greičio f-ja)

  gravity: 340,         // pasaulio vnt/s^2 (07-18 stipriai sulėtinta — nuspėjamas tempas)
  maxSpeed: 600,        // vnt/s — kietas greičio limitas (kad neprasišautų kiaurai)
  linearDamping: 0.10,  // oro pasipriešinimas (dalis greičio/s) — daugiau stabdymo
  emergeSpeed: 440,     // pakilus į aukštą — kamuoliuko šūvis AUKŠTYN iš apatinės drain angos
                        //   (apex ~y133, NEpasiekia viršutinio portalo → be auto-re-ascend)
  flipsPerFloor: 30,    // kiek atmušimų su flipperiu turi PER AUKŠTĄ, kad pakiltum; išsekus —
                        //   flipperiai UŽSIBLOKUOJA (nebekyla) → kamuoliukas nukrenta → −1 gyvybė

  // Atšokimo koeficientai (restitution) pagal paviršių — sumažinti (mažiau agresyvu)
  restWall: 0.34,
  restBumper: 0.76,
  restSlingshot: 0.68,
  restFlipper: 0.12,
  wallFriction: 0.02,   // tangentinis „trynimas" į sienas (kad neslystų amžinai)

  ball: {
    radius: 5,
    trailLen: 62,   // uodegos ILGIS pasaulio vnt (flagellum: taper + banga + glow)
    trailWiggle: 2.4, // banguotumo amplitudė (px) — stipresnė uodegos gale
  },

  flipper: {
    length: 64,         // pagal bg1.png flipperių tarpą (pivotai ~138px vienas nuo kito)
    thickness: 7,       // storis (capsule) — half = 3.5
    restDeg: 27,        // kairio flipperio rimties kampas (deg, +x, y-žemyn)
    pressDeg: -32,      // pakelto kampo (deg) — tipas keliasi aukštyn
    // 07-18: raiseSpeed 26→16, kick 1.18→1.05. Anksčiau flipperio galas (26×54≈1400
    // vnt/s) >> maxSpeed 600 → KIEKVIENAS atmušimas prisisotindavo iki 600 = identiškas
    // judesys, jokios kontrolės. Dabar galiuko smūgis stiprus (~cap), prie pagrindo
    // švelnesnis (~300) → power kontroliuojama pagal kontakto vietą + laiką.
    raiseSpeed: 11,     // rad/s — pakėlimas (galo greitis ~594 ≈ maxSpeed, ne virš → diapazonas)
    returnSpeed: 10,    // rad/s — lėtesnis grįžimas
    kick: 1.0,          // impulso daugiklis (grynas perdavimas, be overshoot)
  },

  // Taškai — MAŽI (nubraukti 2 nuliai, mažiausias = 1).
  bumper: { radius: 11, impulse: 210, score: 1 },
  slingshot: { impulse: 240, score: 1 },

  // Nauji elementai (sudėtingesnė lenta):
  boost: { radius: 11, impulse: 340, score: 3 },       // stiprus centrinis bumperis (dydis kaip visų — be auros)
  post: { radius: 5, rest: 0.6 },                      // maži deflektoriai (be taškų)
  drop: { score: 2, resetSec: 7, bankBonus: 10 },      // drop-target bankas
  rollover: { score: 1, radius: 6 },                   // viršutinės juostos (sensorius)
  spinner: { score: 1, radius: 7 },                    // spinner (sensorius, per tiką)
  // Sieniniai paveikslai: palietus → taškai. Iškart VIRPĖJIMAS (shake sek.), tada
  // VIENAS animacijos ciklas (loops=1, trukmė=loops×8×frameMs). cool = shake+trukmė.
  portrait: { score: 5, frameMs: 150, loops: 1, shake: 0.2 },
  // Sieniniai FAKELAI prie vėliavų (2 vnt, aukštai): kamuoliuku palietus → užsidega ir
  // dega burnSec, duoda taškų. cool = throttle (kad vienas prisilietimas = 1 uždegimas).
  torch: { score: 4, burnSec: 2.0, cool: 2.0, radius: 7 },
  // 🔥 BURN-ZONOS (apatiniai šonai): palietus → taškai + užsidega burnSec; kol dega → MAGNETAS atstumia
  //   kamuoliuką (stipriau arčiau). repelRadius = lauko spindulys, repelForce = atstūmimo stiprumas. TUNABLE.
  // burnSec: kiek laiko tesla laukas veikia (07-21 10→5s). nudgeForce: SILPNAS ATSITIKTINIS
  //   stūmis — kryptis kinta laikui bėgant (kartais viršun, kartais į šonus) → NENUSPĖJAMA,
  //   kad kamuoliukas nekabėtų ant oro (07-21: buvo pastovus 600 į centrą — per stiprus).
  burnZone: { score: 0, burnSec: 5.0, radius: 9, repelRadius: 55, repelForce: 1700, nudgeForce: 220 },
  danger: { radius: 12, slow: 0.93 },                  // „mud" — lėtina kamuoliuką
  // Bullet-time: atsimušus į MĖLYNĄ rutulį laikas sulėtėja (visas žaidimas) N sek.
  slowmo: { radius: 20, scale: 0.90, timeScale: 0.32, dur: 0.35 },  // TIK per stiprų smūgį, trumpai (taškas, ne kliūtis)
  // Raudonas rutulys: atsimušus atsiveria langas, per kurį ←/→ suki kamuoliuko kryptį.
  steer: { rate: 2.8, dur: 2 },   // rate = sukimo greitis (rad/s); dur = lango trukmė (sek., pailginta 1→2)

  // Plunger (paleidimas): laikai Space → kaupiasi jėga → paleidi.
  plunger: { min: 300, max: 640, chargeRate: 1.9 }, // chargeRate = charge vnt/s (0..1)

  // Combo: greiti pataikymai kelia daugiklį; nutrūksta po lango/drain.
  combo: { window: 1.8, max: 10 },

  // Lubų vartai (aukštų perėjimas): užsidarę N sek → atsidaro M sek → kartojasi.
  // Kai kamuoliukas iškrenta pro ATVIRUS vartus (viršun) → kitas aukštas.
  gate: { closedSec: 5, openSec: 4, ceilingY: 28, triggerY: 16 },

  // Anti-stuck: jei kamuoliukas ilgai beveik stovi — mažas pagalbinis impulsas.
  antiStuck: { speedEps: 8, timeSec: 1.3, nudge: 70 },

  // Biliardas: bumperiai/boost = TIKRI riedantys rutuliai. Stovi ramiai, juda TIK
  // kai pataikomi (žaidėjo kamuoliuko ar kito rutulio), rieda su trintimi ir
  // atsimuša elastiškai (impulso tvermė). Jokio atsitiktinio dreifo.
  billiard: {
    // 07-18: atstumas sutrumpintas PROPORCINGAI (maxSpeed ir friction žemyn tuo pačiu
    // santykiu) — sustojimo trukmė lieka ta pati ~0.8s (tolygus stabdymas), tik rieda
    // lėčiau ir trumpiau. Atstumas ~47→~29 vnt. Santykis friction≈maxSpeed/0.8.
    friction: 90,     // vnt/s^2 — ŠVELNUS stabdymas → rutulys lėtai rieda ir palaipsniui sustoja (ne staigiai)
    restBall: 0.72,   // atšokimo koef. tarp rutulių (mažiau „šokinėjimo" = sunkesnis jausmas)
    restWall: 0.5,    // atšokimo koef. nuo cushion'ų (žaidimo lauko ribų)
    minSpeed: 3,      // žemiau šio greičio → sustoja (mažas → sustojimas nepastebimas, be „snap")
    maxSpeed: 72,     // rutulių greičio limitas — ŽEMAS: didelis rutulys juda LĖTAI (sunkus)
    cueMass: 70,      // žaidėjo kamuoliukas LENGVAS palyginti su rutuliu (mass=r^2≈121) → „mažas stumia didelį"
    // Cushion'ai (biliardo lauko ribos) — rutuliai lieka viršutiniame lauke,
    // netrukdo flipperiams/drain'ui apačioje.
    box: { x0: 26, y0: 66, x1: 226, y1: 298 },
  },

  // Feedback (efektai atskirti nuo fizikos — nekeičia fizikos!).
  fx: {
    shakeMax: 5,        // px
    hitStopStrong: 0.045, // s — labai trumpas stabtelėjimas (hit-pause) stipriems smūgiams
    strongHitSpeed: 620,  // virš šio approach-greičio smūgis laikomas „stipriu" (sienoms)
    strong: 300,          // stipraus smūgio slenkstis rutuliams: hit-pause + bullet-time trigger
  },
};
