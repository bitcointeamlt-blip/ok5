import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { AiCfg } from "./AiLevels";

/* 🎯 BOTAS PAGAL TAVO TIKRUS RODIKLIUS (2026-09-03)
 *
 * User: „mano tikslas — AI būtų tavo skill lygio, o ne stipresnis; dabar jis fake".
 *
 * KODĖL SENA SISTEMA BUVO FAKE. `AiLevels.levelFor(score)` ima boto stiprumą iš žaidėjo
 * REITINGO ir parenka pakopą iš rankomis suderintos lentelės. Du trūkumai:
 *   1) lentelė nieko nežino apie TAVE — ji žino tik lygos numerį;
 *   2) ratas: reitingą dalinai laimi pats botas, tad kylant reitingui kyla ir botas, ir jis
 *      nuolat lieka virš tavo tikro lygio. Būtent dėl to žaidėjai ėmė deleguoti botui.
 *
 * KĄ DAROM VIETOJ TO. Serveris ir taip mato tavo žaidimą: klientas siunčia `snap` su
 * `stats.pieces` ir `stats.lines` (tuo pačiu kanalu, kuriuo veikia anti-cheat PPS patikra).
 * Iš mačo pabaigos pasiimam du dydžius ir vedam jų slenkantį vidurkį:
 *   · `pps`  — figūros per sekundę = TAVO tempas;
 *   · `lpp`  — linijos vienai figūrai = TAVO švarumas (kuo daugiau skylių, tuo mažiau linijų).
 * Botui `moveMs`/`thinkMs` skaičiuojam TIESIOG iš tavo `pps`, o klaidų dažnį — iš `lpp`.
 * Tada tai nebe „GOLD pakopa", o tavo paties tempas ir tavo paties klaidų dažnis.
 *
 * ⚠️ TYČIA NENAUDOJAM: laimėjimų/pralaimėjimų santykio ir reitingo. Abu jau užteršti boto
 *    žaidimų, tad iš jų kalibruoti reikštų atkurti tą patį ratą.
 */

let _sb: SupabaseClient | null = null; let _sbTried = false;
function sb(): SupabaseClient | null {
  if (_sbTried) return _sb;
  _sbTried = true;
  const url = process.env.SUPABASE_URL || "", key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}
const _norm = (a: string) => (a || "").trim().toLowerCase();
const _key = (a: string) => _norm(a) + "#tetrisskill";

export type SkillRow = { pps: number; lpp: number; n: number; at: number };

/* Kiek mačų sveria istorija. Mažas langas ⇒ botas šokinėtų po vienos blogos partijos;
 * didelis ⇒ neatspindėtų progreso. 10 yra kompromisas (~savaitė aktyvaus žaidimo). */
const WINDOW = 10;
/* Mačas turi būti pakankamai ilgas, kad ką nors pasakytų (trumpi = ankstyvas topout / disconnect).
 * ⚠️ 2026-09-03: buvo TIK `pieces >= 40`, ir tai pasirodė pritaikyta greitam žaidėjui. Išmatuota
 *    gyvai: žaidėjas, dedantis 0,72 figūros/s, per normalų 50 s mačą padeda ~36 figūras — jo
 *    partijos buvo ATMETAMOS, ir iš trijų sužaistų užsiskaitė tik viena (ilgiausia, 79 s).
 *    Lėtas žaidėjas taip niekada nesusirinktų 3 mačų ir liktų amžinai ties reitingo kreive.
 *    Todėl riba dabar DVEJOPA: arba pakankamai figūrų, arba pakankamai laiko. */
const MIN_PIECES = 25;
const MIN_SECONDS = 20;
/* Kol nesukaupta tiek mačų, grįžtam prie senos reitingo kreivės — kalibracija iš 1-2 partijų
 * būtų triukšmas, ne matavimas. */
const MIN_MATCHES = 3;

export async function loadSkill(addr: string): Promise<SkillRow | null> {
  const c = sb(); if (!c || !_norm(addr)) return null;
  try {
    const { data } = await c.from("f9_bases").select("buildings").eq("ronin_address", _key(addr)).maybeSingle();
    const b: any = data && (data as any).buildings;
    if (!b || !(b.n > 0)) return null;
    return { pps: +b.pps || 0, lpp: +b.lpp || 0, n: b.n | 0, at: +b.at || 0 };
  } catch (_) { return null; }
}

/** Įrašo VIENO mačo rezultatą į slenkantį vidurkį. Tyliai nieko nedaro be Supabase (dev). */
export async function recordMatch(addr: string, pieces: number, lines: number, seconds: number): Promise<void> {
  const c = sb(); if (!c || !_norm(addr)) return;
  if (!(pieces >= MIN_PIECES) || !(seconds >= MIN_SECONDS)) return;
  const pps = pieces / seconds, lpp = lines / pieces;
  try {
    const prev = await loadSkill(addr);
    /* Svoris naujam mačui = 1/min(n+1, WINDOW).
     * ⚠️ NE fiksuotas 1/WINDOW. Su fiksuotu pirmas mačas gautų svorį 1, o kiekvienas kitas tik 0,1,
     *    tad po 3 mačų pirmasis vis dar svertų 0,81 — vienas nevykęs startas (ar atsitiktinai
     *    puiki partija) ilgam iškreiptų vaizdą, nors kalibruoti pradedam jau nuo 3-io.
     *    Su 1/(n+1) pradžia yra TIKRAS vidurkis (2-as mačas 1/2, 3-ias 1/3 …), o sukaupus WINDOW
     *    mačų jis natūraliai virsta eksponentiniu — seni pamažu blėsta ir botas seka progresą. */
    const n0 = prev ? prev.n : 0;
    const w = 1 / Math.min(n0 + 1, WINDOW);
    const row: SkillRow = {
      pps: prev ? prev.pps + (pps - prev.pps) * w : pps,
      lpp: prev ? prev.lpp + (lpp - prev.lpp) * w : lpp,
      n: (prev ? prev.n : 0) + 1,
      at: Date.now(),
    };
    await c.from("f9_bases").upsert(
      { ronin_address: _key(addr), units: [], buildings: row as any, updated_at: new Date().toISOString() },
      { onConflict: "ronin_address" },
    );
  } catch (_) { /* best-effort: kalibracija niekada negali sugriauti mačo */ }
}

/** Ar duomenų jau pakanka, kad botą statytume pagal žaidėją, o ne pagal reitingą. */
export function skillReady(s: SkillRow | null): boolean {
  return !!(s && s.n >= MIN_MATCHES && s.pps > 0.1);
}

/**
 * Paverčia IŠMATUOTUS žaidėjo rodiklius boto nustatymais.
 * `name` paliekamas iš reitingo pakopos, kad UI vis dar rodytų lygą.
 */
export function cfgFromSkill(s: SkillRow, name: string): AiCfg {
  /* ── TEMPAS ─────────────────────────────────────────────────────────────
   * Laikas figūrai = thinkMs + ~4,5 × moveMs (išvesta iš `ai.js` vykdymo ciklo ir patikrinta
   * matuojant: nuokrypis ~4 %). Turėdami norimą figūrų/s, atvirkščiai gaunam abu dydžius.
   * Dalybą 30/70 parinkau taip, kad botas atrodytų MĄSTANTIS (pauzė prieš figūrą), o ne
   * trūkčiojantis — grynai vizualu, bendram tempui įtakos neturi. */
  const pps = Math.max(0.25, Math.min(3.0, s.pps));    // ribos: apsauga nuo šiukšlinių matavimų
  const msPerPiece = 1000 / pps;
  const thinkMs = Math.round(msPerPiece * 0.30);
  const moveMs = Math.round((msPerPiece * 0.70) / 4.5);

  /* ── KLAIDOS ────────────────────────────────────────────────────────────
   * `lpp` (linijos vienai figūrai) yra švarumo matas: teoriškai daugiausia 0,4 (10 langelių
   * eilėje / 4 langeliai figūroje = 2,5 figūros vienai linijai). Kuo daugiau skylių žaidėjas
   * palieka, tuo mažiau linijų jam išeina. Todėl:
   *   lpp 0,40 (švaru)  → ~5 % klaidų
   *   lpp 0,10 (skylėta) → ~45 % klaidų
   * Tai TAVO klaidų dažnis, o ne lentelės skaičius. Blunder — penktadalis klaidų. */
  const lpp = Math.max(0, Math.min(0.4, s.lpp));
  const mistake = Math.round(Math.max(0.05, Math.min(0.55, 0.55 - 1.25 * lpp)) * 1000) / 1000;
  const blunder = Math.round(mistake * 0.2 * 1000) / 1000;

  return {
    name,
    moveMs, thinkMs, mistake, blunder,
    useHold: true,
    /* Spaudimo agresyvumas ir momentinis drop nuo žaidėjo nepriklauso — tai boto elgsenos
     * savybės, ne sunkumas. Imam vidutines reikšmes. */
    panic: 1.8,
    hardDrop: true,
  };
}
