/* 💀🛡 MIRTIES SAUGIKLIS — kad LOKALUS testas nebenumarintų TIKRO NFT (2026-08-21).
 *
 * KAS ĮVYKO (incidentas 2026-08-21, 19:5x): lokalus dev serveris (`PORT=2611 F9_INJURY_CHANCE=0.9`)
 * buvo paleistas su PROD `.env` (prod Supabase URL + service role key). Testiniame raide iškrito
 * 10% mirtis TIKRAM Barracks tokenui `4863` (Harpoon), ir jis pateko į GLOBALŲ mirusiųjų registrą
 * `__f9dead__#3`, kuris pagal dizainą yra NEGRĮŽTAMAS. NFT grandinėje išliko tik todėl, kad
 * `F9_BURN_URL` nebuvo sukonfigūruotas — kitaip būtų sudegęs negrįžtamai.
 *
 * ŠAKNIS: taisyklė „testams tik tokenId ≥ 50000" gyveno TIK dokumentacijoje (memory), o ne kode.
 * Serveris neturėjo jokio skirtumo tarp „lokalus eksperimentas" ir „prod mūšis" — tas pats kodas,
 * ta pati DB. Vienas pamirštas env kintamasis = negrįžtamai miręs žaidėjo NFT.
 *
 * SPRENDIMAS: mirtis, rašoma į TIKRĄ duomenų bazę iš NE-produkcinio proceso, leidžiama tik
 * testiniams tokenams (≥ `F9_TEST_TOKEN_MIN`, numatyta 50000). Tikras tokenas tokiu atveju
 * NEMIRŠTA — jis keliauja į ligoninę, o logas garsiai pasako, kad saugiklis suveikė.
 *
 *   NODE_ENV=production            → saugiklis IŠJUNGTAS (prod'e mirtis privalo veikti realiai)
 *   SUPABASE_URL nenustatytas      → saugiklis IŠJUNGTAS (offline simuliacijos/testai nieko nerašo)
 *   F9_ALLOW_REAL_DEATH=1          → saugiklis IŠJUNGTAS sąmoningai (vienintelis kelias numarinti
 *                                     tikrą tokeną lokaliai — reikia įrašyti ranka)
 *   F9_TEST_TOKEN_MIN=<n>          → riba (numatyta 50000; tikri Barracks tokenai ~5217)
 *
 * ⚠️ Env skaitomas TINGIAI (funkcijose), ne modulio krovimo metu — kitaip `dotenv` eiliškumas
 *    galėtų palikti saugiklį su tuščiomis reikšmėmis.
 */

export const DEFAULT_TEST_TOKEN_MIN = 50000;

const _env = (k: string) => String(process.env[k] ?? "").trim();

export function testTokenMin(): number {
  const n = Number(_env("F9_TEST_TOKEN_MIN"));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TEST_TOKEN_MIN;
}

/** Ar procesas rašo į tikrą (bendrą) DB iš ne-produkcinio paleidimo. */
export function deathGuardActive(): boolean {
  if (_env("NODE_ENV") === "production") return false;    // prod = tikros mirtys
  if (_env("F9_ALLOW_REAL_DEATH") === "1") return false;   // sąmoningas atjungimas
  return !!_env("SUPABASE_URL");                           // be DB nėra ko saugoti
}

/* 🎯 AUKOJAMŲ TOKENŲ SĄRAŠAS — `F9_DEATH_ALLOW_TOKENS=4863,1234`.
 * Kam reikia: be jokios išimties lokalus testas NIEKADA nepamatytų tikros mirties ir tikro
 * deginimo grandinėje, o „beveik tikras" testas nėra testas. Deginimo galutinai patikrinti
 * neįmanoma nesunaikinus tikro NFT — tad vietoj bendro `F9_ALLOW_REAL_DEATH=1` (atrakina VISĄ deką)
 * čia sąmoningai įvardijami TIK tie tokenai, kurių negaila. Visi kiti lieka saugomi. */
export function allowedTokens(): Set<string> {
  return new Set(_env("F9_DEATH_ALLOW_TOKENS").split(",").map((s) => s.trim()).filter(Boolean));
}

/** Ar šis tokenId saugomas nuo mirties (t. y. atrodo kaip TIKRAS NFT ne-prod paleidime). */
export function deathProtected(tokenId: any): boolean {
  if (!deathGuardActive()) return false;
  const s = String(tokenId ?? "").trim();
  if (!s || /^dev/i.test(s)) return false;                 // dev unitai ir taip nemiršta
  if (allowedTokens().has(s)) return false;                // sąmoningai paaukotas šiam testui
  const n = Number(s);
  if (!Number.isFinite(n)) return true;                    // nesuprantamas ID → saugom
  return n < testTokenMin();
}

/* 🧪🪞 SMĖLDĖŽĖS DEKAS — `F9_SANDBOX_DECK=1` (tik lokaliai).
 * Kam reikia: su įjungtu saugikliu žaidžiant savo pinigine mirties NEBEPAMATYSI — visi tavo tokenai
 * < 50000, tad visi apsaugoti. Kad testas liktų NATŪRALUS (tas pats dekas, tie patys lygiai, ta pati
 * piniginė, tikri BLESS itemai), serveris atėjusiam dekui tiesiog PERRAŠO tokenId į veidrodinį:
 *      4863 → 54863   (t. y. +`F9_TEST_TOKEN_MIN`)
 * Veidrodinis tokenas grandinėje neegzistuoja ⇒ mirtis ir registras tikri, o TIKRAS NFT nepaliestas
 * ir sudeginti jo neįmanoma. Po testo: `node _deadctl.mjs revive 5xxxx`. */
export function sandboxDeckActive(): boolean {
  if (_env("NODE_ENV") === "production") return false;
  return _env("F9_SANDBOX_DECK") === "1";
}

/** Tikras tokenId → veidrodinis testinis. Dev/jau testiniai lieka kaip buvę. */
export function sandboxToken(tokenId: any): string {
  const s = String(tokenId ?? "").trim();
  if (!s || !sandboxDeckActive()) return s;
  if (/^dev/i.test(s)) return s;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return s;
  const min = testTokenMin();
  return n < min ? String(n + min) : s;
}

/** Vienoda garsi eilutė logams (kad incidentas nepraslystų pro akis). */
export function deathGuardNote(tokenId: any): string {
  return `[DeathGuard] 🛡 mirtis ATŠAUKTA tokenui ${tokenId}: lokalus (NODE_ENV≠production) procesas ` +
    `rašo į tikrą DB, o testams leidžiami tik tokenId ≥ ${testTokenMin()}. ` +
    `Unitas keliauja į ligoninę. Sąmoningai leisti: F9_ALLOW_REAL_DEATH=1`;
}

/** Startinis įspėjimas — kad iš karto matytum, kokiu režimu serveris pakilo. */
export function deathGuardBanner(injuryChance: number): string {
  const deathPct = Math.round((1 - injuryChance) * 100);
  if (!_env("SUPABASE_URL")) return "";
  if (_env("NODE_ENV") === "production") return "";
  const lines = [
    "════════════════════════════════════════════════════════════",
    "⚠️  LOKALUS SERVERIS PRIJUNGTAS PRIE TIKROS DUOMENŲ BAZĖS",
    `    mirties tikimybė: ${deathPct}%` + (deathPct === 0 ? " (mirtis išjungta)" : ""),
  ];
  if (_env("F9_ALLOW_REAL_DEATH") === "1") {
    lines.push("    💀 SAUGIKLIS IŠJUNGTAS (F9_ALLOW_REAL_DEATH=1) — TIKRI NFT GALI MIRTI NEGRĮŽTAMAI!");
  } else {
    lines.push(`    🛡 saugiklis ĮJUNGTAS: miršta tik tokenId ≥ ${testTokenMin()} (tikri NFT saugūs)`);
    const allow = [...allowedTokens()];
    if (allow.length) lines.push(`    🎯 SĄMONINGAI PAAUKOTI (mirs ir bus sudeginti): ${allow.join(", ")}`);
  }
  if (sandboxDeckActive()) {
    lines.push(`    🧪🪞 SMĖLDĖŽĖS DEKAS: tavo tokenId perrašomi +${testTokenMin()} (4863 → ${4863 + testTokenMin()})`);
    lines.push("       → žaisk įprastai: mirtis ir BLESS tikri, TIKRI NFT nepaliesti");
  }
  lines.push("════════════════════════════════════════════════════════════");
  return lines.join("\n");
}
