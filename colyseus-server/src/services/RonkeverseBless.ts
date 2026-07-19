import { ethers } from "ethers";

// ⚡🔵 RONKE BLESS „1/1" BONUS (2026-07-19, user): kiekvienas laikomas Ronkeverse „1/1" NFT = 10 BLESS charge / 24h
//   (paprastas Ronkeverse NFT = 1, kaip anksčiau). „1/1" = 159 tokenai kolekcijos viduje:
//   52 official (metadata Special="1/1") + 107 (Special="Community 1/1"). Sąrašas iš full metadata skano 2026-07-19.
//   Skanas: ownerOf(159) periodiškai (30 min) → holder→count kešas. count1of1(addr) = kiek 1/1 laiko tas adresas.
const RONKEVERSE_ADDR = "0x810B6d1374ac7BA0E83612E7d49F49A13f1de019";
const RPC = process.env.RONIN_RPC || "https://ronin.drpc.org";
export const BLESS_PER_1OF1 = Number(process.env.F9_BLESS_PER_1OF1 || 10);   // charge už 1 laikomą „1/1"

// 159 „1/1" Ronkeverse tokenId'ai (52 official + 107 community).
const ONE_OF_ONE_IDS: number[] = [
  14, 24, 26, 43, 49, 60, 69, 87, 89, 147, 196, 210, 340, 388, 389, 420, 429, 440, 441, 473,
  536, 586, 613, 666, 736, 777, 938, 959, 977, 997, 1010, 1082, 1132, 1184, 1237, 1243, 1261,
  1283, 1292, 1318, 1337, 1362, 1371, 1376, 1413, 1419, 1437, 1487, 1529, 1535, 1559, 1600,
  1620, 1708, 1724, 1732, 1848, 1865, 1892, 1940, 1994, 1996, 2150, 2291, 2320, 2580, 2615,
  2649, 2656, 2668, 2712, 2721, 2727, 2752, 2765, 2785, 2821, 2825, 2841, 2867, 2911, 2952,
  3165, 3190, 3260, 3283, 3300, 3320, 3360, 3421, 3429, 3435, 3466, 3596, 3599, 3642, 3673,
  3702, 3750, 3755, 3875, 3928, 3934, 3954, 3968, 3982, 4082, 4086, 4133, 4134, 4166, 4172,
  4198, 4201, 4211, 4233, 4260, 4286, 4292, 4302, 4316, 4328, 4339, 4366, 4383, 4409, 4439,
  4487, 4512, 4519, 4536, 4572, 4578, 4626, 4652, 4657, 4708, 4740, 4759, 4773, 4795, 4820,
  5028, 5039, 5051, 5058, 5087, 5309, 5465, 5513, 5750, 5883, 5930, 6706, 6727, 6896, 6900,
  6941, 6969,
];

const REFRESH_MS = 30 * 60 * 1000;   // holder kešas šviežinamas kas 30 min
let _holders = new Map<string, number>();   // addr(lower) → kiek „1/1" laiko
let _at = 0;
let _refreshing: Promise<void> | null = null;
let _provider: ethers.JsonRpcProvider | null = null;

async function _doRefresh(): Promise<void> {
  if (!_provider) _provider = new ethers.JsonRpcProvider(RPC);
  const c = new ethers.Contract(RONKEVERSE_ADDR, ["function ownerOf(uint256) view returns (address)"], _provider);
  const map = new Map<string, number>();
  let ok = 0;
  for (const id of ONE_OF_ONE_IDS) {
    let got = false;
    for (let a = 0; a < 2 && !got; a++) {
      try { const o = String(await c.ownerOf(id)).toLowerCase(); map.set(o, (map.get(o) || 0) + 1); got = true; ok++; }
      catch { if (a === 0) await new Promise((r) => setTimeout(r, 250)); }
    }
  }
  // Priimam kešą tik jei ≥60% ownerOf pavyko (kitaip RPC glitch nurašytų holderius → prarastų bonusą).
  if (ok >= ONE_OF_ONE_IDS.length * 0.6) { _holders = map; _at = Date.now(); }
  console.log(`[RonkeverseBless] 1/1 holder skanas: ${ok}/${ONE_OF_ONE_IDS.length} ownerOf, ${map.size} holderių${ok < ONE_OF_ONE_IDS.length * 0.6 ? " (ATMESTA — per mažai)" : ""}`);
}

function _maybeRefresh(): void {
  if (_refreshing) return;
  if (_at !== 0 && Date.now() - _at < REFRESH_MS) return;
  _refreshing = _doRefresh().catch((e: any) => console.warn("[RonkeverseBless] refresh fail:", e?.message)).finally(() => { _refreshing = null; });
}

// Kiek „1/1" NFT laiko adresas (iš kešo; refresh fone jei senas). Šviežio serverio pirmi kvietimai → 0 kol
//   pirmas skanas užsipildo (~30-60s). Fail-SAFE: RPC triktis → sena/tuščia reikšmė (0 bonusas), niekada neblokuoja.
export async function count1of1(addr: string): Promise<number> {
  const a = (addr || "").trim().toLowerCase();
  if (!a) return 0;
  _maybeRefresh();
  return _holders.get(a) || 0;
}

// Startas: iškart šildom kešą fone (kad iki žaidėjų prisijungimo būtų paruošta).
_maybeRefresh();
