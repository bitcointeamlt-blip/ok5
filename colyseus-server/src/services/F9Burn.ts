import { burnAuthTake, burnAuthReturn, type BurnAuth } from "./F9BurnAuth";
import { deathProtected, deathGuardNote } from "./DeathGuard";   // 💀🛡 lokalus procesas nedegina TIKRŲ NFT

/* 🔥 NFT DEGINIMAS PILIES MIRTIES ATVEJU (2026-08-21).
 *
 * User taisyklė: „jei puoli kito žaidėjo pilį — tavo unitai gali mirti; kai giniesi — irgi.
 * Mirti reiškia sudegti: NFT unitai dings iš tavo piniginės." Tas pats kelias kaip ball žaidime:
 * `PewPewBarracks.burnAuthorized(owner, toBurn[], authorized[], battleId, deadline, nonce, signature)`.
 * Kontraktas pats patikrina savininko EIP-712 parašą, tad kviesti gali BET KAS — mums tereikia sumokėti
 * dujas. Dujas moka TAS PATS relayer'is, kuris jau degina F12 (`SIGNER_PRIVATE_KEY` Supabase secrets),
 * todėl naujo rakto ir naujo finansavimo NEREIKIA — kviečiam per edge funkciją.
 *
 * 🔑 DEGINAM PAKETU: kontraktas priima tokenų MASYVĄ, tad visos vieno mūšio aukos sudega VIENU parašu
 *    (anksčiau po vieną ⇒ 3 žuvę unitai suvalgydavo 3 parašus). Taip 6 parašų baseinas dengia 6 mūšius.
 *
 * ⚙️ Konfigūracija (be jos deginimas tyliai praleidžiamas, mirtis lieka tik žaidime):
 *     F9_BURN_URL     = https://<ref>.supabase.co/functions/v1/f9-burn-dead
 *     F9_BURN_SECRET  = tas pats slaptažodis, kaip edge funkcijos `F9_BURN_SECRET`
 */

const URL = () => process.env.F9_BURN_URL || "";
const SECRET = () => process.env.F9_BURN_SECRET || "";
export function burnEnabled(): boolean { return !!(URL() && SECRET()); }

const _inflight = new Set<string>();   // tokenId — kad tas pats unitas nebūtų deginamas du kartus

export type BurnResult = { burned: string[]; txHash: string | null };

/* Sudegina VIENĄ mirusį unitą (senas kelias — palikta suderinamumui). */
export async function burnDeadUnit(owner: string, tokenId: string): Promise<string | null> {
  const r = await burnDeadUnits(owner, [tokenId]);
  return r.txHash;
}

/* 🔥 Sudegina VISUS nurodytus mirusius unitus, po galimybės — vienu TX.
 * Klaida NIEKADA nemetama: mirtis žaidime jau įvykusi, o deginimas yra atskiras, pakartojamas žingsnis.
 * Nepavykus parašas GRĄŽINAMAS į baseiną (grandinėje jo nonce liko nepanaudotas). */
export async function burnDeadUnits(owner: string, tokenIds: string[]): Promise<BurnResult> {
  const addr = (owner || "").trim().toLowerCase();
  const out: BurnResult = { burned: [], txHash: null };
  let todo = (tokenIds || []).map((t) => String(t || "")).filter((t) => t && !/^dev/i.test(t));
  /* 💀🛡 Ketvirtas — ir svarbiausias — saugiklio sluoksnis: deginimas grandinėje NEGRĮŽTAMAS.
   * Lokalus (NE prod) procesas tikro NFT niekada nesiunčia deginti (žr. DeathGuard.ts). */
  todo = todo.filter((t) => {
    if (!deathProtected(t)) return true;
    console.warn(deathGuardNote(t) + " (NFT NESIUNČIAMAS deginti)");
    return false;
  });
  if (!addr || !todo.length || !burnEnabled()) return out;

  todo = todo.filter((t) => !_inflight.has(t));
  if (!todo.length) return out;
  for (const t of todo) _inflight.add(t);

  try {
    // kol dar yra ką deginti — imam parašą, kuris apima daugiausia likusių, ir siunčiam vienu TX
    let guard = 0;
    while (todo.length && guard++ < 8) {
      const auth = await burnAuthTake(addr, todo);
      if (!auth) {
        console.warn(`[F9Burn] ⚠️ nėra galiojančio parašo (${addr.slice(0, 10)}…) tokenams ${todo.join(",")} — NFT NESUDEGINTI, mirtis lieka tik žaidime`);
        break;
      }
      const batch = todo.filter((t) => auth.tokens.includes(t));
      const rest = todo.filter((t) => !auth.tokens.includes(t));
      const tx = await _send(addr, batch, auth);
      if (tx) { out.burned.push(...batch); out.txHash = out.txHash || tx; }
      else { await burnAuthReturn(addr, auth); break; }   // nepavyko → parašas atgal, nebandom ratu
      todo = rest;
    }
  } finally {
    for (const t of (tokenIds || []).map(String)) _inflight.delete(t);
  }
  return out;
}

async function _send(addr: string, batch: string[], auth: BurnAuth): Promise<string | null> {
  try {
    const r = await fetch(URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-f9-secret": SECRET() },
      body: JSON.stringify({
        owner: addr,
        tokenIdsToBurn: batch,
        authorizedTokenIds: auth.tokens,
        battleId: auth.battleId,
        deadline: auth.deadline,
        nonce: auth.nonce,
        signature: auth.sig,
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j || j.ok === false) {
      const msg = (j && (j.error || j.detail)) || ("HTTP " + r.status);
      console.warn(`[F9Burn] ❌ ${batch.join(",")} deginimas nepavyko: ${msg} — parašas grąžinamas`);
      return null;
    }
    console.log(`[F9Burn] 🔥 NFT ${batch.join(",")} SUDEGINTI (${addr.slice(0, 10)}…) tx=${String(j.txHash || "").slice(0, 12)}…`);
    return String(j.txHash || "");
  } catch (e: any) {
    console.warn(`[F9Burn] ❌ ${batch.join(",")} deginimo klaida:`, e?.message);
    return null;
  }
}
