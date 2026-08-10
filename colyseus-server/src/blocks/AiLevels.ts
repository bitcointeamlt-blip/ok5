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
};

const MAX_STEP = 23;   // 0..23

// step (0..23) → AI parametrai. Monotoniška kreivė: kuo aukščiau, tuo greitesnis ir tikslesnis.
export function cfgFor(step: number): AiCfg {
  const s = Math.max(0, Math.min(MAX_STEP, Math.round(step) || 0));
  const t = s / MAX_STEP;
  const k = Math.pow(t, 0.35);   // staigus kilimas iš „durnos" apačios (žr. inkarus viršuje)
  return {
    name: "AI",
    moveMs: Math.round(340 - 298 * k),                     // 340 → 42
    thinkMs: Math.round(1000 - 930 * k),                   // 1000 → 70
    mistake: Math.round(0.55 * Math.pow(1 - t, 1.6) * 1000) / 1000,   // 0.55 → 0
    blunder: Math.round(0.30 * Math.pow(1 - t, 2.0) * 1000) / 1000,   // 0.30 → 0
    useHold: s >= 5,                                       // nuo WOOD 2★ botas naudoja HOLD
    panic: Math.round((1.0 + 1.9 * t) * 100) / 100,        // 1.0 → 2.9
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
