import { ethers } from "ethers";

// 🔐 ON-CHAIN DEKO TIESA (07-04 user: „įregistruoti TX unitai = gryna teisybė, ir jos klausyti").
//   Serveris pats skaito RonkePower.getDeck(addr) iš MAINNET → kliento atsiųstas dekas filtruojamas
//   iki registruotų tokenų. Galioja: lauko spawn'ui, kapinių gating'ui, gynybai (snapshot/AI).
//   Cache 120s (join'ai dažni). RPC fail → null (dev'e leidžiam žaisti; mainnet'e spręsti griežčiau).

const RONKE_POWER = process.env.RONKE_POWER_ADDR || "0x15717035F34DE9541883fc30E7A0483230927eb0";
const BARRACKS = process.env.F9_BARRACKS_ADDR || "0xccf604511c5d2b5c3fd61adfba3950d0d2890862";   // NFT unitų kontraktas (level/utype tiesa)
/* ⚡ 08-05: keli RPC su FALLBACK (buvo VIENAS → 429/hiccup = dekas nekraunasi → negali žaisti).
 *   RONKE_RPCS env perrašo (tas pats visiems servisams; pvz. Sky Mavis private raktas → pirmas).
 * 🔄 08-21 EILĖS PAKEITIMAS (žaidėjas 10 val. negalėjo sudėti unitų į lauką): drpc.org tą dieną
 *   pastoviai grąžino 500, api.roninchain atsakinėjo ~15 s (retry limit). Išmatuota `_rpccheck.mjs`:
 *     tenderly 0,2 s ✅ · conduit 4,5 s ✅ · api.roninchain 14,8 s ✅ · drpc ❌ 500
 *   Todėl: tenderly → conduit → api.roninchain, o drpc PASKUTINIS.
 *   ⚠️ Conduit tinka TIK eth_call (deko tikrinimui). Gilios istorijos (`getLogs`) per jį NEIMTI —
 *      jis, kaip ir thirdweb, tyliai grąžina tuščią (žr. reference_ronin_rpc_silent_empty_logs). */
const RPCS = [...new Set((process.env.RONKE_RPCS || ["https://ronin.gateway.tenderly.co", "https://rpc-ronin-mainnet-bfz9fadqzl.t.conduit.xyz", process.env.RONIN_MAINNET_RPC, process.env.RONKE_RPC_URL, "https://api.roninchain.com/rpc", "https://ronin.drpc.org"].filter(Boolean).join(",")).split(",").map((s) => s.trim()).filter(Boolean))];
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";   // Ronin turi Multicall3 tuo pačiu adresu

let _prov: ethers.AbstractProvider | null = null;
function getProv(): ethers.AbstractProvider {
  if (!_prov) {
    _prov = RPCS.length > 1
      ? new ethers.FallbackProvider(RPCS.map((u, i) => ({ provider: new ethers.JsonRpcProvider(u, 2020, { staticNetwork: true, batchMaxCount: 1 }), priority: i + 1, stallTimeout: 2500, weight: 1 })), 2020, { quorum: 1 })
      : new ethers.JsonRpcProvider(RPCS[0] || "https://ronin.drpc.org", 2020, { staticNetwork: true, batchMaxCount: 1 });
    console.log(`[DeckChain] RPC: ${RPCS.length} endpoint(s) (fallback)`);
  }
  return _prov;
}

export type ChainUnit = { level: number; utype: number };
const _cache = new Map<string, { ids: Set<string>; stats: Map<string, ChainUnit>; at: number }>();
const CACHE_MS = 120_000;
const MC_CHUNK = 12;      // 🧩 kiek tokenų vienam multicall'ui (12 tokenų = 24 sub-call'ai) — dideli eth_call'ai RPC'uose lūžta daliniai
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
      /* 🛡 2026-08-21 („my account still stuck, cant in field already 10 hours"): anksčiau VISI unitai ėjo į
       * VIENĄ multicall'ą (30 unitų = 60 sub-call'ų), o kiekvienas nepavykęs sub-call'as buvo laikomas
       * „sudegintas → išmesti". Kai Ronin RPC striginėja (šiandien 2 iš 3 endpoint'ų grąžino 500 / retry
       * limit), dalis atsakymų grįždavo `false` → legitimūs unitai TYLIAI iškrisdavo iš deko, o rezultatas
       * dar užsikešuodavo 120 s ⇒ žaidėjo dekas šokinėjo 23→12→3→2 ir jis nebegalėjo nieko sudėti į lauką.
       * Dabar: (1) skaidom į porcijas, (2) neatsakiusi porcija = fail-OPEN visai porcijai, (3) jei per vieną
       * skaitymą deko liktų mažiau nei SHRINK_OK dalis — tai RPC bėda, ne 20 sudegintų NFT → paliekam viską
       * ir kešuojam TRUMPAI, kad kitas skaitymas greitai pasitaisytų. */
      let degraded = false;
      if (ids.length) {
        const fdIface = new ethers.Interface(["function getUnitFullData(uint256) view returns (uint8 utype,uint32 xp,uint16 level,uint16 battles,uint16 wins,uint32 kills,uint32 mintedAt,uint32 lastBattleAt)"]);
        const owIface = new ethers.Interface(["function ownerOf(uint256) view returns (address)"]);
        const mc = new ethers.Contract(MULTICALL3, ["function tryAggregate(bool,(address,bytes)[]) view returns ((bool,bytes)[])"], prov);
        const kept: string[] = [];
        for (let s = 0; s < ids.length; s += MC_CHUNK) {
          const part = ids.slice(s, s + MC_CHUNK);
          let res: any[] | null = null;
          try {
            const calls: any[] = [];
            for (const id of part) { calls.push([BARRACKS, fdIface.encodeFunctionData("getUnitFullData", [id])]); calls.push([BARRACKS, owIface.encodeFunctionData("ownerOf", [id])]); }
            res = await mc.tryAggregate(false, calls);
          } catch (e: any) { console.warn("[DeckChain] multicall porcija nepavyko:", e?.message); res = null; }
          if (!res || res.length !== part.length * 2) { kept.push(...part); degraded = true; continue; }   // fail-OPEN visai porcijai
          /* 🔑 SKIRTUMAS, kurio anksčiau nebuvo:
           *   • ownerOf PAVYKO ir savininkas kitas  → tikras pardavimas/perkėlimas → VISADA išmetam
           *   • ownerOf NEPAVYKO (`false`)          → tai arba sudegintas tokenas, arba RPC triktis.
           *     Atskiriam pagal porcijos sveikatą: jei dauguma tos porcijos ownerOf'ų pavyko, `false` yra
           *     tikras revert (sudegęs) → išmetam. Jei krito dauguma — tai RPC, ne NFT → PALIEKAM. */
          const okN = part.reduce((n, _x, i) => n + ((res![2 * i + 1] && res![2 * i + 1][0]) ? 1 : 0), 0);
          const healthy = okN >= Math.ceil(part.length * 0.5);
          if (!healthy) degraded = true;
          part.forEach((id, i) => {
            const fd = res![2 * i], ow = res![2 * i + 1];
            if (ow !== undefined) {
              if (!ow[0]) { if (healthy) return; }   // sveikoj porcijoj `false` = sudegintas → drop; kitaip paliekam
              else {
                try { const owner = ("0x" + String(owIface.decodeFunctionResult("ownerOf", ow[1])[0]).slice(2)).toLowerCase(); if (owner !== addr) return; } catch (_) { /* decode fail → fail-open */ }
              }
            }
            kept.push(id);
            try { if (fd && fd[0]) { const d = fdIface.decodeFunctionResult("getUnitFullData", fd[1]); stats.set(id, { utype: Number(d[0]), level: Number(d[2]) }); } } catch (_) {}
          });
        }
        if (kept.length !== ids.length) console.log(`[DeckChain] 🚮 ${ids.length - kept.length} nenuosav./sudegint. tokenų išmesta iš deko (${addr.slice(0, 10)}…)`);
        ids = kept;
      }
      const set = new Set(ids);
      //   degraded → kešuojam tik ~15 s (kad greitai persiskaitytų), sveikas skaitymas → pilnas CACHE_MS
      _cache.set(addr, { ids: set, stats, at: degraded ? Date.now() - (CACHE_MS - 15_000) : Date.now() });
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
