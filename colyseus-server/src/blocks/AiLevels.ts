import { LEAGUES, decode } from "./RankStore";

// 🤖 RANKED vs AI — 24 sunkumo pakopos (8 lygos × 3★), pririštos prie žaidėjo reitingo.
//   AI VISADA žaidžia žaidėjo lygio×žvaigždučių stiprumu: laimi → kyla žaidėjas → kyla ir AI.
//   Parametrai tie patys kaip kliento CFG.AI_LEVELS (ai.js): moveMs (judesio tempas),
//   thinkMs (galvojimo pauzė prieš figūrą), mistake (nekalta klaida: 2-5 geriausias variantas),
//   blunder (reta TIKRAI prasta padėtis), useHold, panic (spaudimo režimo agresyvumas).
//
//   Kreivė (2026-08-08 v2 — user: „iš pradžių AI turi būti TIKRAI durnas"): apačia DRAMATIŠKAI silpna,
//   kilimas staigus per t^0.35, viršus nepakitęs. Inkarai:
//     step 0  (PAPER 0★)   — 340ms judesiai, 1s galvojimas, 55% klaidų, 30% blunderių — įveikia bet kas
//     step 11 (BRONZE 2★)  ≈ KNIGHT (110/282, mist .19)  · step 21 (GLOBAL 0★) ≈ RONKE AI (51/99)
//     step 23 (GLOBAL 2★)  — truputį stipresnis už RONKE AI (42/70, 0 klaidų)
//   3★ „perteka" į kitos lygos bazę (PAPER 3★ ≈ WOOD 0★) → augimas be šuolių.

export type AiCfg = {
  name: string; moveMs: number; thinkMs: number;
  mistake: number; blunder: number; useHold: boolean; panic: number;
  hardDrop: boolean;   // false → botas figūros „nemeta" žemyn, o leidžia rodykle (žr. ai.js)
};

const MAX_STEP = 23;   // 0..23

// step (0..23) → AI parametrai. Monotoniška kreivė: kuo aukščiau, tuo greitesnis ir tikslesnis.
export function cfgFor(step: number): AiCfg {
  const s = Math.max(0, Math.min(MAX_STEP, Math.round(step) || 0));
  const t = s / MAX_STEP;
  /* 🪶 2026-08-15 (user: „botas per stiprus ir per greitai auga"): kreivė SUŠVELNINTA.
   * Buvo k=t^0.35 (staigus šuolis jau po kelių pergalių) + tobulas viršus (42ms, 0% klaidų).
   * Dabar k=t^0.6 — kilimas tolygus, o viršuje lieka žmogiškos klaidos (nebe robotas).
   * Inkarai: GOLD 0★ 83ms/10% → 127ms/18% · GLOBAL 0★ 51ms/1% → 80ms/6% · PAPER lieka toks pat durnas. */
  const k = Math.pow(t, 0.6);
  /* 🐢 2026-09-03 GREITIS SUMAŽINTAS (user: „greitį reikia sumažinti bet kokiu atveju").
   * IŠMATUOTA iš tikro vykdymo ciklo (`ai.js update`): laikas figūrai = thinkMs + ~4,5 × moveMs
   * (sukimai ~1 + horizontalūs ~2,5 + drop). Iki šiol viršus buvo 130 + 4,5×65 = 423 ms ⇒
   * **2,37 figūros/s** — jau virš gero žmogaus (2–3) ir be jokių tikrų klaidų.
   * Dabar viršus 180 + 4,5×87 = 571 ms ⇒ **1,75 figūros/s**, t. y. tvirtas, bet pasiveji žmogus.
   * Apačia (PAPER) NEKEIČIAMA — ji jau tinkamai lėta. */
  return {
    name: "AI",
    /* 🐢 2026-09-03 v3 (user: „ir laikas — jis pernelyg labai greitai stato"). Viršus dar lėčiau:
     * 180 + 4,5×87 = 571 ms (1,75 fig/s) → 260 + 4,5×115 = 777 ms ⇒ **1,29 fig/s**. */
    moveMs: Math.round(340 - 240 * k),                     // 340 → 100
    thinkMs: Math.round(1000 - 780 * k),                   // 1000 → 220
    /* 🎯 KLAIDŲ GRINDYS PAKELTOS. Išmatuota simuliacija (`_aisim.mjs`): ties GLOBAL klaidų
     * KOKYBĖS pataisymas beveik nieko nedavė (23,0 → 22,0 linijos), nes dažnis ten tebuvo 3 % —
     * botas paprasčiausiai NEKLYSTA, tad nesvarbu, kokia klaida būtų. Grindys 0.03 → 0.12
     * (ir blunder 0.01 → 0.05) reiškia, kad net stipriausias botas suklysta apie kas 8-ą figūrą,
     * o kartu su nauju atotrūkio modeliu klaida pirmą kartą palieka realią skylę. */
    /* 🔧 2026-09-03 v4 (user: „per durnas pasidarė"). v3 grindys 0.12/0.05 kartu su NAUJU
     * atotrūkio modeliu susidaugino: kiekviena klaida ėmė kainuoti IR jų dažnis buvo pakeltas.
     * Išmatuota (`_aisweep.mjs`, 12×180 s): GOLD nukrito nuo 16,4 iki 6,7 linijų — botas ėmė
     * užsiversti pats be jokio spaudimo. Grindys sumažintos, greitis dalinai grąžintas.
     * Rezultatas: GOLD 13,1 · GLOBAL 36,1 linijos (pradinis buvo 16,4 / 57,8). */
    mistake: Math.round((0.48 * Math.pow(1 - t, 1.25) + 0.07) * 1000) / 1000,   // 0.55 → 0.07
    blunder: Math.round((0.27 * Math.pow(1 - t, 1.7) + 0.02) * 1000) / 1000,    // 0.29 → 0.02
    useHold: s >= 7,                                       // HOLD tik nuo STONE 1★ (buvo WOOD 2★)
    panic: Math.round((1.0 + 1.5 * t) * 100) / 100,        // 1.0 → 2.5 (buvo 2.9)
    /* 🪶 PAPER lygos botas (0★–2★) NEnaudoja momentinio drop — leidžia figūrą rodykle žemyn,
     * kaip naujokas. Todėl jis ne tik klysta, bet ir fiziškai lėtesnis (user 08-15). */
    hardDrop: s >= 3,
  };
}

// žaidėjo rank score (0..48) → boto pakopa + rodomas vardas ("PAPER AI 2★").
export function levelFor(score: number): { step: number; name: string; cfg: AiCfg } {
  const d = decode(score);
  const fullStars = Math.floor(d.hs / 2);                          // 0..3
  const step = Math.min(MAX_STEP, d.league * 3 + fullStars);       // 3★ perteka į kitą lygą
  const name = `${LEAGUES[d.league]} AI ${fullStars}★`;       // ★ — UI ENGLISH
  const cfg = cfgFor(step);
  cfg.name = name;
  return { step, name, cfg };
}
