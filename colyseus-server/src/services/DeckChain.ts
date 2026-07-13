import { ethers } from "ethers";

// 🔐 ON-CHAIN DEKO TIESA (07-04 user: „įregistruoti TX unitai = gryna teisybė, ir jos klausyti").
//   Serveris pats skaito RonkePower.getDeck(addr) iš MAINNET → kliento atsiųstas dekas filtruojamas
//   iki registruotų tokenų. Galioja: lauko spawn'ui, kapinių gating'ui, gynybai (snapshot/AI).
//   Cache 120s (join'ai dažni). RPC fail → null (dev'e leidžiam žaisti; mainnet'e spręsti griežčiau).

const RONKE_POWER = process.env.RONKE_POWER_ADDR || "0x15717035F34DE9541883fc30E7A0483230927eb0";
const BARRACKS = process.env.F9_BARRACKS_ADDR || "0xccf604511c5d2b5c3fd61adfba3950d0d2890862";   // NFT unitų kontraktas (level/utype tiesa)
const RPC = process.env.RONIN_MAINNET_RPC || "https://ronin.drpc.org";   // drpc — stabilus (api.roninchain flaky)
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";   // Ronin turi Multicall3 tuo pačiu adresu

let _prov: ethers.JsonRpcProvider | null = null;
function getProv(): ethers.JsonRpcProvider {
  if (!_prov) _prov = new ethers.JsonRpcProvider(RPC, 2020, { staticNetwork: true });
  return _prov;
}

export type ChainUnit = { level: number; utype: number };
const _cache = new Map<string, { ids: Set<string>; stats: Map<string, ChainUnit>; at: number }>();
const CACHE_MS = 120_000;
const _inflight = new Map<string, Promise<{ ids: Set<string>; stats: Map<string, ChainUnit> } | null>>();   // dedup
// Barracks utype (uint8) → serverio utype string (sutampa su NFT_UTYPE_TO_F12 kliente).
const _UTYPE_STR: Record<number, string> = { 1: "skull", 2: "archer", 3: "harpoon_fish", 4: "shaman", 5: "pigronke", 6: "ghost", 7: "ronhood" };
export function chainUtypeStr(u: number): string { return _UTYPE_STR[u] || ""; }

// SINCHRONINIS cache skaitymas (be fetch, grąžina ir pasenusį). null = dar niekad neužkrauta.
//   Naudoja sync hot-path'ai (pvz. kapinių _injuredDrain), kur await neįmanomas.
export function chainDeckCached(address: string): Set<string> | null {
  const hit = _cache.get((address || "").trim().toLowerCase());
  return hit ? hit.ids : null;
}
// Per-token on-chain stats (level/utype) iš cache. null = dar neužkrauta.
export function chainStatsCached(address: string): Map<string, ChainUnit> | null {
  const hit = _cache.get((address || "").trim().toLowerCase());
  return hit ? hit.stats : null;
}

// Registruoto deko tokenId aibė. null = nepavyko patikrinti (RPC klaida).
export async function chainDeck(address: string): Promise<Set<string> | null> {
  const addr = (address || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return null;
  const hit = _cache.get(addr);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ids;
  const fl = _inflight.get(addr);
  if (fl) return fl.then((r) => (r ? r.ids : null));
  const p = (async (): Promise<{ ids: Set<string>; stats: Map<string, ChainUnit> } | null> => {
    try {
      const prov = getProv();
      const rp = new ethers.Contract(RONKE_POWER, ["function getDeck(address) view returns (uint256[])"], prov);
      let ids: string[] = (await rp.getDeck(addr)).map((x: any) => String(x));
      const stats = new Map<string, ChainUnit>();
      // 🔐 LYGIŲ TIESA + 🚮 NUOSAVYBĖ (07-13, Cydrakke bug): getUnitFullData(tokenId) → utype/level IR
      //   ownerOf(tokenId) — abu per Multicall3 (1 eth_call). Perkeltas/parduotas unitas (owner != addr) ar
      //   sudegintas (ownerOf revert) IŠMETAMAS iš registruoto deko → nebegina senos pilies, nesiskaito power'ui.
      //   Fail-OPEN per-token: jei ownerOf call nepavyko (RPC glitch), tokeną PALIEKAM (nekaltiname legit gynėjų).
      if (ids.length) {
        try {
          const fdIface = new ethers.Interface(["function getUnitFullData(uint256) view returns (uint8 utype,uint32 xp,uint16 level,uint16 battles,uint16 wins,uint32 kills,uint32 mintedAt,uint32 lastBattleAt)"]);
          const owIface = new ethers.Interface(["function ownerOf(uint256) view returns (address)"]);
          const mc = new ethers.Contract(MULTICALL3, ["function tryAggregate(bool,(address,bytes)[]) view returns ((bool,bytes)[])"], prov);
          const calls: any[] = [];
          for (const id of ids) { calls.push([BARRACKS, fdIface.encodeFunctionData("getUnitFullData", [id])]); calls.push([BARRACKS, owIface.encodeFunctionData("ownerOf", [id])]); }
          const res: any[] = await mc.tryAggregate(false, calls);
          const kept: string[] = [];
          ids.forEach((id, i) => {
            const fd = res[2 * i], ow = res[2 * i + 1];
            // ownerOf: success + adresas != addr → PARDUOTA/PERKELTA → išmetam. Revert (ow[0]==false) → burned → išmetam.
            //   Bet jei ownerOf call'as visai nepateiktas (undefined) → RPC glitch → paliekam (fail-open).
            if (ow !== undefined) {
              if (!ow[0]) return;   // revert = burned → drop
              try { const owner = ("0x" + String(owIface.decodeFunctionResult("ownerOf", ow[1])[0]).slice(2)).toLowerCase(); if (owner !== addr) return; } catch (_) { /* decode fail → fail-open, paliekam */ }
            }
            kept.push(id);
            try { if (fd && fd[0]) { const d = fdIface.decodeFunctionResult("getUnitFullData", fd[1]); stats.set(id, { utype: Number(d[0]), level: Number(d[2]) }); } } catch (_) {}
          });
          if (kept.length !== ids.length) console.log(`[DeckChain] 🚮 ${ids.length - kept.length} nenuosav./sudegint. tokenų išmesta iš deko (${addr.slice(0, 10)}…)`);
          ids = kept;
        } catch (e: any) { console.warn("[DeckChain] fullData+ownerOf multicall fail:", e?.message); }
      }
      const set = new Set(ids);
      _cache.set(addr, { ids: set, stats, at: Date.now() });
      return { ids: set, stats };
    } catch (e: any) {
      console.warn("[DeckChain] getDeck fail:", e?.message);
      return hit ? { ids: hit.ids, stats: hit.stats } : null;   // pasenęs cache geriau nei nieko
    } finally { _inflight.delete(addr); }
  })();
  _inflight.set(addr, p);
  return p.then((r) => (r ? r.ids : null));
}
// ♻️ Kešo invalidacija — po deko re-registracijos (set_squad {fresh}) sekantis chainDeck fetch'ins šviežią.
export function chainDeckInvalidate(address: string): void {
  _cache.delete((address || "").trim().toLowerCase());
}
// Kaip chainDeck, bet grąžina IR per-token stats (level/utype). Naudoja deck clamp.
export async function chainDeckFull(address: string): Promise<{ ids: Set<string>; stats: Map<string, ChainUnit> } | null> {
  const addr = (address || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return null;
  await chainDeck(addr);   // užpildo cache (su inflight dedup)
  const hit = _cache.get(addr);
  return hit ? { ids: hit.ids, stats: hit.stats } : null;
}
