import { Room, Client } from "@colyseus/core";
import { F9State, F9Player, F9Unit, F9Wall } from "../schema/F9State";
import { StakeService, Payout, DeathSettle } from "../services/StakeService";
import { permadeathChance, LOCK_DURATION_MS } from "../util/stakes";
import { loadBaseUnits, saveBaseUnits, loadBaseBuildings, saveBaseBuildings, loadBoneBank, saveBoneBank, addBones, boneBankOp, appendRaidReport, loadRaidReports, type SnapshotUnit, type BaseBuildings, type InjuredUnit } from "../services/BaseStore";
import { claimMintReward } from "../services/MintReward";   // 🦴🎫 Ronkeverse holder mint-bonus (2026-07-05)
import { consumeInstantHeal, instantHealStatus, refundInstantHeal } from "../services/InstantHeal";   // ⚡🔵 Ronke Bless instant heal (2026-07-05)
import { ethers } from "ethers";
import { boneSwapCfg, signSwapVoucher, isNonceUsed, hasRequiredNft, MIN_BONES, MAX_SWAP_BONES, NFT_REQUIRED, signBoneRonkeVoucher, isRonkeRewardNonceUsed } from "../services/BoneSwap";
import { mineWithdrawEnabled, signMineVoucher, isMineNonceUsed, MINE_MAX_SINGLE } from "../services/MineWithdraw";   // ⛏️💸 RONKE mining withdrawal (RonkeReward pool reuse)
import { raidFeeEnabled, verifyAndConsumeRaidFee, RAID_FEE_RONKE } from "../services/RaidFee";   // ⚔️💰 10 RONKE raid fee → treasury (moka tik puolikas)
import { chainDeck, chainDeckCached, chainDeckFull, chainDeckInvalidate, chainUtypeStr } from "../services/DeckChain";

// ── F9 PvP room — real-time FFA (iki 4 žaidėjų) RTS squad battle + KotH (authoritative). ──
// FAZA A: lifecycle (join → ready → start → end) + komandų protokolas + judėjimas (30Hz) + KotH zona.
// FAZA B (dabar): pilnas combat/AI port'as iš game.js — detect → engage → position → fire →
//   projektilas → damage → death + win check. Stats = _F9_ALLY_ATTACK/_F9_ALLY_DETECT/_F9_UTYPE_SPEED.
//   AI būsena laikoma atskirame _ai Map'e (neteršia sinchronizuojamo schema). Hit'ai planuojami per
//   sim-laikrodį (_simTime), NE setTimeout → deterministiška + tick-tiksli.
//   Projektilai = lengvi „shot" event'ai klientui (vizualas), žala apskaičiuojama server-authoritative.
// FAZA D (vėliau): įėjimo RONKE fee + self-funding pot payout.
// FAZA E (vėliau): mirties stakes (3d lock / permadeath pagal lvl kreivę — žr. util/stakes.ts).

const ARENA_W = 80;   // 2× plotis — HORIZONTALUS castle siege (veiksmas šonuose, NE viršuj)
const ARENA_H = 24;
const SIM_HZ = 30;
const READY_WAIT_MS = 45_000;            // anti-stuck: kiek laukiam ready
const RECONNECT_WINDOW_S = 8;            // disconnect malonės langas
const RETARGET_MS = 300;                  // kas kiek perskaičiuojam taikinius (AI throttle)
const ARRIVE_EPS = 0.05;                  // kada laikom kad pasiekė tx,ty
const PATROL_ARRIVE = 40 / 54;            // 🚩 patrulio taško pasiekimo spindulys (≈0.74 cell = 40px @ CELL 54) — tunable
                                          //    (150px buvo per didelis → kirpdavo kampus, nesektų A/B/C tiksliai)
const PATROL_MAX_PTS = 6;                 // max maršruto taškų (A..F)
const PATROL_MAX_UNITS = 4;               // 🚩 iš viso max patruliuojančių unitų per savininką (po vieną / komandą)
const SHOT_SPEED_CPS = 10.5;              // projektilo greitis cell/s (=_F9_SHOT_SPEED_CPS game.js)

// ── FFA + KotH ──
const MIN_PLAYERS = 2;                    // mažiausiai start'ui (FFA leidžia 2–4)
const CENTER_X = ARENA_W / 2;             // 40
const CENTER_Y = ARENA_H / 2;             // 12
const CENTER_R = 3.5;                     // KotH zonos spindulys (cells)
const CENTER_RONKE_PER_SEC = 0.5;         // RONKE/sek holderiui (tunable; FAZA D: iš pot)
// 🏰 Castle capture point — RYTINĖJ pusėj, už griovio (pilies vidus). Attacker pralaužia sieną → laiko zoną → užima.
const CAP_X = 54;                         // capture taško centras (col) — gilu pilies viduj
const CAP_Y = CENTER_Y;                   // 12 (vertikalus centras)
const CAP_R = 3.6;                        // capture zonos spindulys (cells)
const CAPTURE_SECS = 40;                  // laikas užimti pilį SU 1 unitu (0→100%); daugiau unitų → greičiau (4× lėčiau nei buvo)
const CAP_MAX_UNITS = 5;                  // greičio daugiklio lubos (5 unitai = 5× greičiau ≈ 2s)
const DECAY_SECS = 6;                     // jei iššūkėjas išeina iš zonos — progresas nukrenta per tiek sek
// 4 kampų spawn zonos (team index 0..3 → {x,y,face}).
// 1v1 duel: team0 kairė-centras, team1 dešinė-centras (head-on, telpa ekrane, kamera kadruoja abu).
// [2]/[3] palikti būsimam 4p FFA (kampai).
// Castle siege roles by SPAWN side: team0 (room creator) = DEFENDER (rytuose, už sienos+bokštų),
// team1+ (joineriai) = ATTACKERIAI (vakaruose, pralaužia sieną). Bokštai gina team0 pilį.
// ⚙️ TESTAS 2026-06-27: APSUKTA — JOINING žmogus (team1) = GYNĖJAS (rytuose, prie pilies, gali tobulint),
//    CREATOR botas (team0) = ATTACKER (vakaruose). Realiam žaidime grįš: creator=gynėjas.
const DEFENDER_TEAM = 1;
// 🦴 KAULAI (Bones): 1 kaulas/kill × totalMult. totalMult = baseMult + RonkePower bonusas (ADITYVUS). FRAKCINIAI (0.1). 1 kaulas = 5 RONKE (07-03: sumažinta nuo 10, nes vertė „ant viršaus" auga per RonkePower).
//   FAZĖ 1: apskaita+display TIK (jokio realaus RONKE/NFT). Žr. memory/project_bones_resource_design.md.
//   baseMult: puolikas 1.5 / gynėjas 1.0. RonkePower bonusas (abiem): 0 @ 0pw → tiesiškai kyla → MAKS +2.5 @ 4000pw (ir aukščiau nebekyla).
//   → puolikas: 1.5× @ 0pw, ~1.6× @ 150pw, MAKS 4.0× @ 4000pw. Gynėjas: 1.0× → MAKS 3.5×. TUNABLE.
const BONE_VALUE_RONKE = 5;
const BONE_MULT_ATTACKER = 1.5;
const BONE_MULT_DEFENDER = 1.0;
// 🎲 PUOLANT kaulų bazinis daugiklis SVYRUOJA per kill (įdomesni skaičiai).
// 🍀 LUCKY (5% → bazė 2.0) — VISIEMS (ir gynėjui; 07-03 kompensacija už RONKE vertės perpus mažinimą),
//    IŠSKYRUS žaidėjus su 0 RonkePower — jie lucky kaulų dropo NEgauna.
const BONE_ATK_MIN = 1.1;                     // puoliko min (kai ne lucky)
const BONE_ATK_MAX = 1.5;                     // puoliko max
const BONE_LUCKY_CHANCE = 0.05;              // 🍀 5% tikimybė (tik power > 0)
const BONE_LUCKY_MULT = 2.0;                 // 🍀 LUCKY = bazė 2.0
const BONE_POWER_MAX = 4000;             // power ties kuriuo bonusas MAKSIMALus (aukščiau nebekyla)
const BONE_POWER_MAX_BONUS = 2.5;        // maks aditYvus bonusas @ 4000pw (puolikui: 1.5+2.5 = 4.0× stogas)
// 🦴 TIKRAS RonkePower rate/utype (FAZĖ 2b) — TA PATI formulė kaip client `_powerRate` / ronke-power edge fn.
//   unitPower = max(0, level-1) × rate. rate: pigronke=15, ghost=16, ronhood=12, else(skull/archer/harpoon/shaman)=10.
//   → serveris skaičiuoja TIKRĄ RonkePower iš mūšio unitų (ne proxy). Sutampa su tuo, ką žaidėjas mato deke.
function ronkePowerRate(utype: string): number {
  return utype === "pigronke" ? 15 : utype === "ghost" ? 16 : utype === "ronhood" ? 12 : 10;
}
const FFA_SPAWNS = [
  { x: 16,           y: CENTER_Y,     face: 1 },    // team0 = ATTACKER — TOLIAU vakaruose (priėjimas iki sienos x=33; kova prasideda ne prie pat vartų)
  { x: ARENA_W - 9,  y: CENTER_Y,     face: -1 },   // team1 = DEFENDER — rytuose, prie pilies
  { x: 16,           y: 6,            face: 1 },     // [2][3] daugiau attackerių (4p FFA siege)
  { x: 16,           y: ARENA_H - 6,  face: 1 },
];

// 🏰 CASTLE SIENA (destructible) — horizontali segmentų eilė su vartų tarpu. Pirmas castle žingsnis.
// Server-authoritative: kolizija (side-lock — pereiti tik pro vartus) + HP + siege + collapse.
const WALL_HP = 40;
const WALL_MAX_LVL = 4;                                    // 🏗️ sienos upgrade lygiai (1 medis → 2-4 akmuo, vis stipresnė)
const wallHpForLevel = (lvl: number) => WALL_HP * Math.max(1, Math.min(WALL_MAX_LVL, lvl));   // L1=40, L2=80, L3=120, L4=160
const WALL_COL = 33;                        // 🧱 PILNA VERTIKALI siena per visą map (x=33) — JOKIO apėjimo
const WALL_GATE: number[] = [];             // jokių vartų — žaidėjas PRIVALO pralaužti sieną kad eitų toliau
// 🧱 Pilno aukščio siena (rows 0..ARENA_H-1) + zip bokštai prie galų (viršus/apačia). Kiekviena celė = atskiras
// objektas; side-lock neleidžia pereiti kol nepralaužta. Žaidėjas turi išgriauti segmentą kad praeitų.
const PVP_WALL_CELLS: { x: number; y: number; tower?: boolean }[] = (() => {
  const cells: { x: number; y: number; tower?: boolean }[] = [];
  for (let y = 0; y < ARENA_H; y++) {
    cells.push({ x: WALL_COL, y });   // 🗼 JOKIŲ pre-placed bokštų — žaidėjas STATO juos pats (build_tower)
  }
  return cells;
})();
const MAX_TOWERS = 5;                                      // 🗼 max bokštų pilyje
const TOWER_MIN_GAP = 6;                                   // 🗼 min eilių tarpas tarp bokštų (anti-OP klasteris)
// 💧 GROVYS — 2 celių vandens juosta RYTINĖJ sienos pusėj (x=34,35), VISUR išskyrus VIDURĮ (laisvas praėjimas).
// NEpraeinamas (vandens nesunaikinsi) → net pralaužus sieną, pereiti gali TIK pro vidurį. Vizualas klientui.
const MOAT_X0 = WALL_COL + 1;                       // 34
const MOAT_W = 2;                                    // 34,35
const MOAT_MID = Math.floor(ARENA_H / 2);            // 12
// 🚪 PRAĖJIMAI grovyje (laisvos eilės): VIDURYS (10–13, 4 blokai — praplatinta +2, su teleportu) + VIRŠUS (4) + APAČIA (19).
//    Daugiau kirtimo vietų → mažiau grūsties minioje.
const MOAT_TOP_GAP = 4;
const MOAT_BOT_GAP = ARENA_H - 5;   // 19
const MOAT_GAP: number[] = [MOAT_MID - 2, MOAT_MID - 1, MOAT_MID, MOAT_MID + 1, MOAT_TOP_GAP, MOAT_BOT_GAP];   // 10,11,12,13 + 4 + 19
const MOAT_CELLS: { x: number; y: number }[] = (() => {
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < ARENA_H; y++) {
    if (MOAT_GAP.indexOf(y) >= 0) continue;
    for (let dx = 0; dx < MOAT_W; dx++) cells.push({ x: MOAT_X0 + dx, y });
  }
  return cells;
})();
// 🧭 SERVERIO PATHFINDING — flow-field pro breaches/moat-gaps (port iš kliento). Be šito unitai eina TIESIA
//   linija į taikinį → atsiremia į sieną/griovį ir kemšasi. Jungiklis F9_PATHFIND (false → sena tiesi linija).
const F9_PATHFIND = true;
const PATH_ARRIVE = 0.6;                             // waypoint pasiekimo spindulys (cells)
const MOAT_SET = new Set(MOAT_CELLS.map((c) => c.x + "," + c.y));   // griovio celės (gaps NEįtraukti → praeinami)
const PF_N8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
// (Pilna castle siena laikinai išjungta — grąžinsim kai naikinimo jausmas bus geras.)
// const PVP_WALL_CELLS = (() => { const c=[]; for (let y=0;y<ARENA_H;y++){ if(WALL_GATE.indexOf(y)>=0)continue; c.push({x:WALL_COL,y}); } return c; })();
// 🗼 ZIP ginybos bokštai — flank segmentai abipus vartų. Daugiau HP + šauna attackerius (bolt dmg).
const GATE_FLANK_TOP = Math.min(...WALL_GATE) - 1;   // 10
const GATE_FLANK_BOT = Math.max(...WALL_GATE) + 1;   // 14
const TOWER_HP = 70;        // tvirtesni nei siena (40)
const TOWER_MAX_LVL = 4;                                   // 🗼 bokšto upgrade lygiai
// 🦴 UPGRADE KAINOS (user 2026-07-03 „viskas upgreidinama UŽ KAULUS"): mokama iš BANKO
//   (banked kaulai saugūs nuo raidų, bet čia IŠLEIDŽIAMI → ekonomikos sink). Raktas = PASIEKIAMAS lygis.
//   Inkaras: claim ciklas=25🦴 → siena L2 už 1 ciklą; pilna siena 175🦴 (875 RONKE ekv.), pilna pilis ~575🦴.
const WALL_UPG_COST: Record<number, number> = { 2: 25, 3: 50, 4: 100 };
const TOWER_BUILD_COST = 40;
const TOWER_UPG_COST: Record<number, number> = { 2: 30, 3: 60, 4: 120 };   // upgrade'ina VISUS bokštus iškart
const UPG_FREE = process.env.F9_UPG_FREE === "1";          // testams/dev — be kainos
const towerHpForLevel = (lvl: number) => TOWER_HP * Math.max(1, Math.min(TOWER_MAX_LVL, lvl));   // L1=70…L4=280
const towerDmgForLevel = (lvl: number) => TOWER_DMG * Math.max(1, Math.min(TOWER_MAX_LVL, lvl)); // L1=3…L4=12
const TOWER_RANGE = 6.5;    // šaudymo nuotolis (cells)
const TOWER_CD = 2200;      // cooldown tarp šūvių (ms)
const TOWER_DMG = 3;        // bolt žala
const TOWER_FIRE_MS = 380;  // delsa nuo charge iki hit (sutampa su bolt FX)

// 🏠 NAMŲ GARNIZONO rikiuotė (user 07-03): 2 eilės po 6, IŠKART PO BARAKAIS (client barakai cx 64.78,
//    kolizijos apačia ~8.4). FIKSUOTI grid slotai — spawn'as ir NAUJI registruoti unitai (set_squad)
//    rikiuojasi į tuos pačius slotus, tad rikiuotė visada tvarkinga. >12 unitų → trečia eilė žemyn.
const HOME_FORM = { cx: 64.8, y0: 10.3, rowGap: 1.35, colGap: 1.25, perRow: 6 };
const homeFormSlot = (slot: number) => ({
  x: HOME_FORM.cx - (HOME_FORM.perRow - 1) * HOME_FORM.colGap / 2 + (slot % HOME_FORM.perRow) * HOME_FORM.colGap,
  y: HOME_FORM.y0 + Math.floor(slot / HOME_FORM.perRow) * HOME_FORM.rowGap,
});

// 🌀 TELEPORTAS per VIDURĮ sienos — TIK gynėjo (savininko) unitai: persikelt per sieną (sally out) ar grįžt.
//    2 pad'ai abipus sienos vidury (y=ARENA_H/2); puolikai NEgali naudoti (jie laužia sieną).
const TP_PADS = [
  { x: WALL_COL + 2, y: ARENA_H / 2 },   // 35,12 — gynėjo (rytų) pusė
  { x: WALL_COL - 2, y: ARENA_H / 2 },   // 31,12 — vakarų (anapus sienos) pusė
];
const TP_RADIUS = 1.0;       // 2 blokų dydžio pad'as (±1 celė = 2×2 zona)
const TP_CD_MS = 10000;      // 10s cooldown — tas PATS unitas tiek negali grįžt atgal (anti ping-pong)

// 🏳️ RETREAT (pozicinis) — puolikas suveda VISUS gyvus unitus į 8×8 celių zoną ant spawn (x=16,y=12) ir
//    palaiko RETREAT_MS → kova baigiasi (atsitraukia, gynėjas apgynė). Tik PO to, kai puolikas bent kartą
//    išėjo iš zonos (įsitraukė) — kitaip spawninus iškart skaičiuotų.
const RETREAT_ZONE = { x0: 2, y0: 8, x1: 10, y1: 16 };    // 8×8 kvadratas toli vakaruose (centras 6,12); spawn x=16 → retreatui vesti unitus atgal
const RETREAT_MS = 15000;    // 15s palaikyti visus zonoj → atsitraukia
// 🏥 LIGONINĖ — NFT unitas krito home/raid kambaryje: 100% SUŽALOTAS (07-13 user: permadeath IŠJUNGTA,
//   buvo 90/10; deadUnits infrastruktūra lieka — įjungiama atgal env'u arba grąžinus default <1).
//   Dev tokenId ('dev0'…) neliečiami.
//   EILĖS MODELIS (v2, user 2026-07-03): gydosi TIK VIENAS unitas (HEAL_MS=1h), kiti LAUKIA eilėje;
//   žaidėjas gali pasirinkti, kurį gydyti pirmą ('hospital_heal_first' → perkeliamas į priekį, gydymas nuo 0).
const INJURY_CHANCE = process.env.F9_INJURY_CHANCE != null ? Number(process.env.F9_INJURY_CHANCE) : 1.0;   // env — testams (0=visada mirtis)
const HEAL_MS = Number(process.env.F9_HEAL_MS) || 3600 * 1000;   // 1h / unitą (env override testams)
// 🏥 LIGONINĖS LYGIAI (user 07-04): L2 +1 slotas; L3/L4 −10min gydymui; L5 3-ias slotas.
const HOSP_MAX_LVL = 5;
const HOSP_UPG_COST: Record<number, number> = { 2: 100, 3: 40, 4: 40, 5: 150 };   // 🦴 už PASIEKIAMĄ lygį
// −10min taikosi PO VIENĄ SLOTĄ (user 07-04): kiekviena „lova" turi SAVO gydymo trukmę.
const HOSP_BED_RED: Record<number, number[]> = { 1: [0], 2: [0, 0], 3: [600_000, 0], 4: [600_000, 600_000], 5: [600_000, 600_000, 0] };
// ⚰️ KAPINĖS — PASYVI kaulų generacija (user dizainas 2026-07-03). Ekonomikos saugikliai:
//   • generuoja TIK jei pilyje užregistruoti NFT unitai (cemNft ≥ 1); greitis ∝ RonkePower
//   • SANDĖLIO CAP (rate × CEM_CAP_H) — AFK spausdinimo ribotuvas: reikia ateiti susirinkti
//   • NESURINKTI kaulai = GROBIS: raidą LAIMĖJĘS puolikas atima CEM_STEAL_PCT
//   • pilies be NFT unitų PULTI NEGALIMA (raid gating) — bet ji ir negeneruoja
const CEM_BASE_PER_H = Number(process.env.F9_CEM_BASE_H) || 0.5;      // TUNABLE: bones/h vien už aktyvią pilį
const CEM_POWER_PER_H = Number(process.env.F9_CEM_POWER_H) || 0.0025; // TUNABLE: +0.25 bones/h už 100 RonkePower
const CEM_POWER_CAP = 4000;                                            // whale lubos (kaip BONE_POWER_MAX) → max 10.5/h
const CEM_CAP_H = Number(process.env.F9_CEM_CAP_H) || 8;              // TUNABLE: sandėlis talpina 8h generacijos
const CEM_STEAL_PCT = 0.5;                                            // TUNABLE: grobis nuo nesurinktų (50%)
// 🦴 CLAIM MODELIS (user 2026-07-03, momentum NUIMTAS — paprasčiau): claiminti galima TIK sukaupus
//   CEM_CLAIM_MIN (25) kaulų → visas pot į BANKĄ (saugus nuo vagysčių; iš banko swap 1 kaulas=5 RONKE
//   arba upgrade'ai — vėliau). Sandėlio lubos CEM_CAP_BONES (50) — anti-AFK kaupimas.
// 🛡 SHIELD: pralaimėjus GYNYBĄ pilis nepuolama 1h (mirties spiralės apsauga — sužaloti spėja gyti).
// ⏲ RAID CD: tas pats puolikas → tas pats taikinys ne dažniau nei kas 15 min (spam/farm stabdis,
//   kol raid fee kontraktas dar nepastatytas). Module-level map — išgyvena kambario dispose.
const SHIELD_MS = Number(process.env.F9_SHIELD_MS) || 3_600_000;
const RAID_CD_MS = Number(process.env.F9_RAID_CD_MS) || 900_000;
const _raidCdMap = new Map<string, number>();   // "atkAddr|targetAddr" → raido pradžios ts
const CEM_CLAIM_MIN = Number(process.env.F9_CEM_CLAIM_MIN) || 25;      // TUNABLE: nuo kiek galima claimint
const CEM_CAP_BONES = Number(process.env.F9_CEM_CAP_BONES) || 50;      // TUNABLE: sandėlio lubos (kaulais)
// 🎖️ „PILNAVERTIS ŽAIDĖJAS" (user 2026-07-03) — kaulų generacijai (ir konceptualiai swap'ui) reikia VIENO iš kelių:
//   A: ≥1 RonkeVerse NFT + ≥10 registruotų unitų;  B: ≥12 registruotų unitų + ≥69 Barracks unitai piniginėje.
const CEM_REQ_A_RV = 1, CEM_REQ_A_REG = 10, CEM_REQ_B_REG = 12, CEM_REQ_B_WALLET = 69;   // TUNABLE
// ⛏️💰 RONKE MINING (07-11 server-authoritative) — PRIVALO sutapti su klientu game.js (_F9_MINE_*).
//   Rate = (base + healthyPower×powerH × lauko-frakcija) × shield × success(fail vidurkis). Passive bones IŠJUNGTA.
const MINE_BASE_H = Number(process.env.F9_MINE_BASE_H) || 10;      // RONKE/h bazė (kai eligible + ≥1 lauke)
const MINE_POWER_H = Number(process.env.F9_MINE_POWER_H) || 0.05;  // +RONKE/h už RonkePower tašką (07-14 user: 0.1→0.05, bazė 10/6 lieka)
const MINE_POW_CAP = Number(process.env.F9_MINE_POW_CAP) || 4000;  // whale cap
const MINE_CAP = Number(process.env.F9_MINE_CAP) || 1000;          // ⛏️ kietas sandėlio backstop (checkpoint'ai realiai riboja; pot čia niekada normaliai nepasieks)
const MINE_CLAIM_MIN = Number(process.env.F9_MINE_CLAIM) || 500;   // 💸 withdraw slenkstis — pasiekus 500 pot gali nusiimti į piniginę (07-14 user)
const MINE_SIEGE_STEP = Number(process.env.F9_MINE_SIEGE_STEP) || 200;   // ⛏️🗡 kas 200 RONKE kasimas STOJA → reikia 1 PvP mūšio (50% aukų bet kuriai pusei) kad tęstųsi. Abu režimai.
const MINE_SUCCESS = Number(process.env.F9_MINE_SUCCESS) || 0.5;   // sėkmės tikimybė (0.5 → 2× lėčiau; fail vidurkinamas rate'e)
const MINE_STEAL_PCT = 0.5;                                        // 100% wipe → puolikas „pavogia" 50% pot (defender praranda)
// ⚔️🛡 DUTY STATUS (07-13 user): žaidėjas pasirenka režimą. ON DUTY = 2× kasimas + puolamas; SAFE = 1.2× +
//   nepuolamas, BET pasiekus lubas kasimas SUSTOJA kol atliks siege (bet kuri pusė ≥50% aukų). Anti-dodge:
//   režimas nekeičiamas kovos metu. Default = online (išlaiko dabartinį raidability + 2× buff visiems).
const DUTY_ONLINE_MULT = Number(process.env.F9_DUTY_ONLINE_MULT) || 2.0;
const DUTY_SAFE_MULT = Number(process.env.F9_DUTY_SAFE_MULT) || 1.2;
const DUTY_SIEGE_CASUALTY = Number(process.env.F9_DUTY_SIEGE_CASUALTY) || 0.5;   // ≥50% aukų bet kurioj pusėj → siege užskaitytas (kasimo checkpoint atrakinimas)
// (07-14 user: per-mode sandėlio lubos 250/350 pakeistos vieningu siege checkpoint MINE_SIEGE_STEP=200 abiem režimam.)
// ⛏️ RONKE Power „knee" (07-13 user): pirmi 250 power = pilna 0.1/h, VIRŠ 250 = perpus (0.05/h) iki whale cap.
const MINE_POWER_KNEE = Number(process.env.F9_MINE_POWER_KNEE) || 250;
const MINE_POWER_KNEE_MULT = Number(process.env.F9_MINE_POWER_KNEE_MULT) || 0.25;   // 07-13 user: 0.5→0.25 (virš 250 power augimas dar perpus mažesnis)
const RONKEVERSE_ADDR = "0x810B6d1374ac7BA0E83612E7d49F49A13f1de019";
const BARRACKS_ADDR = "0xccf604511c5d2b5c3fd61adfba3950d0d2890862";
const RONIN_RPC = process.env.RONIN_RPC || "https://ronin.drpc.org";   // drpc — stabilus (api.roninchain flaky)
// On-chain balansų patikra (RonkeVerse + Barracks balanceOf) — kešuojama 10 min; RPC fail → null (fallback į persisted).
let _chainProvider: any = null;
const _chainCache = new Map<string, { rv: number; wallet: number; at: number }>();
async function chainCounts(addr: string): Promise<{ rv: number; wallet: number } | null> {
  if (process.env.F9_CEM_FAKE_RV != null || process.env.F9_CEM_FAKE_WALLET != null) {   // testų override
    return { rv: Number(process.env.F9_CEM_FAKE_RV) || 0, wallet: Number(process.env.F9_CEM_FAKE_WALLET) || 0 };
  }
  const hit = _chainCache.get(addr);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit;
  if (!_chainProvider) _chainProvider = new ethers.JsonRpcProvider(RONIN_RPC);
  const abi = ["function balanceOf(address) view returns (uint256)"];
  const rvC = new ethers.Contract(RONKEVERSE_ADDR, abi, _chainProvider);
  const brC = new ethers.Contract(BARRACKS_ADDR, abi, _chainProvider);
  // 🔁 RETRY (2026-07-04): flaky Ronin RPC — 1 nepavykęs balanceOf palikdavo PASENUSĮ cemWallet (pvz. 69 vietoj
  //   realaus 702), nes caller'is prie null palieka seną reikšmę. 3 bandymai su backoff → realus skaičius patikimai praeina.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [rv, wallet] = await Promise.all([rvC.balanceOf(addr), brC.balanceOf(addr)]);
      const out = { rv: Number(rv), wallet: Number(wallet), at: Date.now() };
      _chainCache.set(addr, out);
      return out;
    } catch (e: any) {
      if (attempt === 2) { console.warn(`[F9PvpRoom] chainCounts fail ${addr.slice(0, 10)}… (3 bandymai):`, e?.message); return null; }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));   // 0.4s → 0.8s backoff
    }
  }
  return null;
}

// Base HP pagal utype — atitinka _F9_BASE_HP game.js.
// PvP BALANSAS (2026-06-24): HP ×~3 — kad nemirtų iš 1-2 hit, kova ilgesnė/intriguojanti.
const BASE_HP: Record<string, number> = {
  skull: 24, archer: 16, harpoon_fish: 20, shaman: 16, pigronke: 40, ghost: 13, ronhood: 20,
};

// Unit-unit separacija (atitinka game.js _F9_SEP_*): kad unitai nesusiliptų į krūvą.
const SEP_RAD: Record<string, number> = { pigronke: 0.46 };
const SEP_DEFAULT = 0.38;   // bazinis personal radius (pora = 0.76) — DAR TANKESNĖ rikiuotė (atitinka game.js _f9SepRadius)
const SEP_FORCE = 3.2;      // push stiprumas
function sepRad(utype: string): number { return SEP_RAD[utype] || SEP_DEFAULT; }

// Kliūčių (medžiai/akmenys) kolizija — PRIVALO sutapti su f9_pvp_live.js PVP_DECO.
// Medžiai (tree3): rad 0.40, cy = y + 0.39. Akmenys (boulder): rad 0.42, cy = y − 0.20. (game.js _F9_OBSTACLE_CFG)
const UNIT_RAD = 0.22;
// Per-utype kliūčių radius — kad DIDELIO kūno unitai (Hog Rider) nelįstų sprite'u į akmenį/medį.
// Default 0.22 (skull/archer/harpoon/shaman/ronhood/ghost — normalūs sprite). pigronke didesnis (atitinka sep 0.46).
const OBST_RAD: Record<string, number> = { pigronke: 0.40 };
function obstRad(utype: string): number { return OBST_RAD[utype] || UNIT_RAD; }
// 80×24 map: cover vakarų lauke (attacker approach x≈16..45) + pora rytuose (defender). Vengiam spawn'ų
// (x8 / x72) IR sienos kolonos (x54) IR vartų lane'o. PRIVALO sutapti su f9_pvp_live.js PVP_DECO!
const PVP_OBSTACLES: { cx: number; cy: number; rad?: number; hw?: number; hh?: number }[] = [
  // medžiai (tree3, rad 0.40, cy=y+0.39)
  { cx: 16, cy: 4.39, rad: 0.40 }, { cx: 16, cy: 19.39, rad: 0.40 }, { cx: 26, cy: 7.39, rad: 0.40 }, { cx: 26, cy: 16.39, rad: 0.40 },
  { cx: 36, cy: 3.39, rad: 0.40 }, { cx: 36, cy: 20.39, rad: 0.40 }, { cx: 45, cy: 9.39, rad: 0.40 }, { cx: 45, cy: 14.39, rad: 0.40 },
  // 🌲 negyvi medžiai (tree5, rad 0.30, cy=y+0.22) — vizualinis įdomumas. PRIVALO sutapti su f9_pvp_live.js PVP_DECO!
  { cx: 21, cy: 8.22, rad: 0.30 }, { cx: 24, cy: 17.22, rad: 0.30 }, { cx: 47, cy: 16.22, rad: 0.30 }, { cx: 52, cy: 20.22, rad: 0.30 }, { cx: 46, cy: 20.22, rad: 0.30 },   // 3 rytiniai PRIE KAPINIŲ šalia pilies (dar +150px žemyn 07-03)
  // akmenys (gold stone / boulder) PAŠALINTI 2026-06-27 (user prašymu) — jokios kolizijos
  // 🏰 PILIS bazė = AABB kvadratas (SOLO zip-tower principas: bazė SOLID/unitai apeina, viršus praeinamas → walk-behind).
  //    Sprite rescan: bazė cell Y 11.34–12.58; cy pakelta 20px+15px (=0.65 cell, CELL=54) user prašymu → 11.30.
  { cx: CAP_X, cy: 11.30, hw: 2.3, hh: 0.65 },
  // 🏚️ BARAKAI bazė = AABB (elgiasi kaip pilis). Pajudinta +150px deš (cx 64.78), −250px aukštyn (cy 7.86). hw 1.25.
  { cx: 64.78, cy: 7.86, hw: 1.25, hh: 0.55 },
  // ⛏️🏠 AUKSO KASIMO STOVYKLA (07-07 dekoras, avies pieva žemiau tako): namukas House3 + aukso akmuo.
  //    PRIVALO sutapti su game.js _F9_GC (HX 58.9/HY 19.5, SX 63.7/SY 19.85)!
  { cx: 58.34, cy: 19.5, hw: 1.05, hh: 0.5 },  // namukas (bazė AABB; 07-07 −15px + 07-12 −15px kairėn = −0.56 cell, seka vizualą)
  { cx: 63.7, cy: 19.85, rad: 0.55 },          // aukso akmuo (apvalus, kaip medis)
  // 📊 GLOBAL STATS stulpas — mažas apvalus hitbox prie įsmigimo (kaip medis). cx=_F9_STATS.x; cy pakelta 35px aukštyn (9.72→9.07).
  { cx: 59.4, cy: 9.07, rad: 0.30 },
  // 🏳️ RETREAT zonos PJEDESTALAS (akmenų šventyklos centras) — solidus, unitai NEužlipa (2026-07-03).
  //   Centras = RETREAT_ZONE vidurys unit-space (5.5, 11.5); rad ≈ vizualus pjedestalas
  //   (retreat_zone_base.png @ dw = zonos plotis ×1.12). Klientui nieko nereikia — pozicijos serverio.
  { cx: 5.5, cy: 11.5, rad: 0.70 },
  // 🏥 LIGONINĖS namukas (Buildings_House1, rytuose žemiau spawn'o) — bazė AABB kaip barakai (2026-07-03).
  //   PRIVALO sutapti su game.js _f9DrawHospital pozicija (69.5, 17.5)!
  { cx: 69.5, cy: 17.6, hw: 1.0, hh: 0.5 },
  // 🛒 UNIT MARKETPLACE namukas (Buildings_House2, dešiniau ligoninės — 07-08).
  //   PRIVALO sutapti su game.js _F9_MKT (HX 73.6, HY 18.7)!
  { cx: 73.6, cy: 18.7, hw: 1.0, hh: 0.5 },
  // ⚰️ KAPINĖS (cemetery.png, ŠALIA PILIES kairėn/žemyn — user 07-03) — AABB per antkapių lauką.
  //   PRIVALO sutapti su game.js _f9DrawCemetery centru (49.3, 18.2; sprite ~3.6×2.5 cells)!
  { cx: 49.3, cy: 18.3, hw: 1.4, hh: 0.85 },
];

// ── Combat statai (port'as iš game.js: _F9_ALLY_ATTACK + _F9_ALLY_DETECT + _F9_UTYPE_SPEED). ──
//   range = atakos nuotolis (cells), cd = cooldown (ms), dmgMin/Max = žalos ruožas,
//   detect = aptikimo spindulys, speed = judėjimo greitis (cell/s),
//   fireMs = uždelsimas nuo swing iki hit/fire, melee = ar artimas (range≤1.6).
//   crit = ronhood 1% ×2; shotMul = ghost projektilas lėtesnis (0.45×).
type UStat = {
  range: number; cd: number; dmgMin: number; dmgMax: number;
  detect: number; speed: number; fireMs: number; melee: boolean;
  crit?: number; shotMul?: number;
};
// PvP BALANSAS (2026-06-24): range ↓ (~30%, ranged buvo OP — sniper'ino per visą mapą),
// skull+pigronke speed +20% (judresni melee), detect ↓ proporcingai.
const UTYPE_STATS: Record<string, UStat> = {
  skull:        { range: 0.95, cd: 1500, dmgMin: 2, dmgMax: 2, detect: 3.5, speed: 1.03, fireMs: 250, melee: true },
  archer:       { range: 4.0,  cd: 7000, dmgMin: 3, dmgMax: 3, detect: 5.0, speed: 1.00, fireMs: 450, melee: false },   // range ↓ ronhood; cd ↑ (user: per greit šaudo)
  harpoon_fish: { range: 4.0,  cd: 5000, dmgMin: 3, dmgMax: 3, detect: 5.0, speed: 0.79, fireMs: 450, melee: false },   // cd ↑ (user: per greit šaudo)
  shaman:       { range: 5.0,  cd: 4500, dmgMin: 4, dmgMax: 4, detect: 6.0, speed: 0.72, fireMs: 430, melee: false, shotMul: 0.524 },   // shotMul → serverio travel atitinka LĖTĄ shaman orbą (5.5 cell/s, NE 10.5), kad žala kristų kai orbas pasiekia

  ronhood:      { range: 4.0,  cd: 4500, dmgMin: 3, dmgMax: 3, detect: 5.0, speed: 1.00, fireMs: 450, melee: false, crit: 0.01 },
  ghost:        { range: 4.0,  cd: 3000, dmgMin: 3, dmgMax: 5, detect: 5.0, speed: 1.05, fireMs: 393, melee: false, shotMul: 0.45 },  // range ↓ iki ronhood lygio (user); fireMs=GHOST_ATTACK_FIRE_MS (~393, paskutinis atakos kadras)
  pigronke:     { range: 1.18, cd: 2800, dmgMin: 8, dmgMax: 8, detect: 3.8, speed: 1.12, fireMs: 540, melee: true },
};
const MISS_CHANCE = 0.20;   // PvP: 20% miss — kova nebe deterministinė, daugiau intrigos (buvo 0 = visada pataiko)
const statOf = (utype: string): UStat => UTYPE_STATS[utype] || UTYPE_STATS.skull;

// Numatytoji squad'a (free režimas / kai deck nepateiktas) — non-NFT, level 0, be tokenId.
// PO VIENĄ kiekvieno tipo — kad matytųsi visi sprite'ai + animacijos (test/demo).
const DEFAULT_SQUAD = ["skull", "archer", "harpoon_fish", "shaman", "pigronke", "ghost", "ronhood"];
// 🪖 DEKAS: gaunam PILNĄ registruotą deką (Power Deck, iki 30) — pirmi MAX_ACTIVE = aktyvūs mūšy, likę = REZERVAS.
//   Rezervas įeina (reinforcement) kai aktyvus unitas krenta → laiko ≤12 aktyvių. RonkePower = iš VISO deko.
//   ⚠️ MAX_DECK=30 (gaunamas) saugus mūšio apkrovai (aktyvių ≤12), BET PROD reikia deck validacijos prieš on-chain.
const F9_ROOM_IDLE_MS = Number(process.env.F9_ROOM_IDLE_MS) || 360_000;   // 🧟 6min be aktyvumo → zombie kambarys disposinamas
const MAX_DECK = 30;                         // gaunamo registruoto deko cap (Power Deck + RonkeVerse)
const MAX_ACTIVE = 12;                        // kiek unitų AKTYVŪS mūšy vienu metu (Battle Squad); likę = rezervas
const VALID_UTYPES = new Set(Object.keys(BASE_HP));
// Žaidėjo deko įrašas (iš join opts.deck).
interface DeckEntry { utype: string; level: number; tokenId: string; }
function sanitizeDeck(raw: any): DeckEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DeckEntry[] = [];
  for (const e of raw) {
    const utype = String(e && e.utype || "");
    if (!VALID_UTYPES.has(utype)) continue;
    out.push({
      utype,
      level: Math.max(0, Math.min(255, Math.floor(Number(e && e.level) || 0))),
      tokenId: String((e && e.tokenId) || ""),
    });
    if (out.length >= MAX_DECK) break;
  }
  return out;
}

// AI būsena (server-side, NEsinchronizuojama) per unit.
interface AIState {
  order: "move" | "attackmove" | "hold" | "siege" | "holdpos" | "patrol";  // žaidėjo stovinti komanda
  lastAtk: number;                          // paskutinės atakos sim-laikas
  engageId: string;                          // dabartinis taikinys (unit id)
  kills: number;
  wallSide?: number;                         // 🏰 -1 šiaurė / 1 pietūs nuo sienos (side-lock, kad nepereitų)
  siegeTarget?: { x: number; y: number };    // 🏰 explicit siege — SPECIFINĖ siena (dešinys-klikas ant sienos)
  teleCd?: number;                           // 🌀 teleporto cooldown (sim-laikas, iki kurio ignoruoja pad'us)
  onPad?: boolean;                           // 🌀 ar PRAEITĄ tick'ą stovėjo ant pad'o (edge-trigger — teleportuoja tik UŽLIPUS)
  holdX?: number;                            // 🛡 HOLD POSITION inkaras (kur stovėti) — holdpos grįžta čia
  holdY?: number;
  patrolPts?: { x: number; y: number }[];    // 🚩 PATROL maršrutas A→B→C (loop); auto-engage + grįžta į maršrutą
  patrolIdx?: number;                        // dabartinis maršruto taškas
  path?: { x: number; y: number }[];          // 🧭 PATHFINDING waypoint'ai (apeina sieną/griovį pro breaches/gaps)
  pathIdx?: number;                          // dabartinis waypoint'as
  leashX?: number;                           // 🎯 DEFENSIVE LEASH postas — default „hold" unitas vejasi tik iki detect+2, grįžta čia
  leashY?: number;
}

export class F9PvpRoom extends Room<F9State> {
  maxClients = 2;   // 1v1 duel (server-authoritative). 4p FFA = būsimas atskiras režimas.
  private _readyTimer: NodeJS.Timeout | null = null;
  private _uidCounter = 0;
  private _simTime = 0;                                    // monotoninis sim-laikrodis (ms, tik žaidžiant)
  private _lastRetarget = 0;
  private _lastServerTimeSync = 0;                         // ⚡ 07-06: serverTime patch throttle (~200ms)
  private _lastSnapSig = "";                               // ⚡ 07-06: auto-save dirty-check (identiškas snapshot → skip DB write)
  private _combatEnabled = true;                            // testų izoliacija: combat:false išjungia kovą
  private _ai = new Map<string, AIState>();
  private _walls: F9Wall[] = [];                            // 🏰 castle sienos segmentai (greitam priėjimui)
  private _towerCd: Record<string, number> = {};            // 🗼 zip bokšto cooldown ("x,y" → sim-laikas)
  private _pending: { at: number; fn: () => void }[] = []; // planuoti hit'ai (sim-laikas)
  private _stake = new StakeService();                      // FAZA D/E: on-chain stake/payout/death (NO-OP kol nesukonfig.)
  private _decks = new Map<string, DeckEntry[]>();          // sid → žaidėjo deck (iš join opts.deck)
  private _freshInvAt = new Map<string, number>();          // ♻️ addr → paskutinė fresh kešo invalidacija (rate-limit)
  private _relay = false;                                    // C3 host-authority: serveris = relay (host kliente sukasi TIKRAS F9)
  private _home = false;                                     // 🏰 HOME režimas: solo namų pilis (1 žaidėjas → iškart pilis+jo unitai, JOKIO oponento/win-check)
  private _hostSid = "";                                     // host žaidėjo sessionId (team 0)
  private _capProgress = 0;                                  // 🏰 capture FLOAT akumuliatorius (schema capPct = round() rodymui)
  private _bonePower = new Map<string, number>();            // 🦴 kešuotas RonkePower/žaidėją (kaulų daugikliui + end summary)
  private _reserves = new Map<string, DeckEntry[]>();        // 🪖 REZERVAS/žaidėją (deko unitai virš aktyvių) — įeina kai aktyvus krenta
  private _activeCount = new Map<string, number>();          // ⚔ kiek unitų žaidėjas NORI lauke (battle squad dydis, 1..MAX_ACTIVE); default MAX_ACTIVE. 07-06 user: „laisvė palikti tik 1"
  private _clampActive(n: any): number { return Number.isFinite(+n) ? Math.max(1, Math.min(MAX_ACTIVE, Math.floor(+n))) : MAX_ACTIVE; }
  private _setSquadSeq = 0;                                  // 🔒 set_squad async lenktynių guard'as (07-06): stale apply po naujesnio atmetamas
  private _ownerAddr = "";                                   // 🏰 HOME savininko wallet (snapshot raktas f9_bases)
  private _ownerSid = "";                                    // 🏰 HOME savininko sessionId (gynėjas)
  private _restoreUnits: SnapshotUnit[] | null = null;       // 🏰 užkrautas snapshot'as (tokenId → pozicija/HP); null = pirmas kartas → formacija
  // 💀 MIRĘ NFT (pilies PvP permadeath, 07-04): wallet → tokenId aibė. Persist buildings.deadUnits.
  //   Miręs unitas NIEKADA nebespawn'ina (deck/AI/deploy filtrai) — vienintelis kelias = naujo minto treniravimas
  //   (RONKE sink per esamą Barracks kontraktą). F12 kamuoliukų burn pipeline ATSKIRAS — neliečiamas.
  private _dead = new Map<string, Set<string>>();
  private _deadSet(addr: string): Set<string> {
    return this._dead.get((addr || "").trim().toLowerCase()) || new Set();
  }
  private _recordDeath(addr: string, tokenId: string, utype?: string, level?: number) {
    addr = (addr || "").trim().toLowerCase();
    if (!addr || !tokenId || /^dev/i.test(tokenId)) return;
    let d = this._dead.get(addr);
    if (!d) { d = new Set(); this._dead.set(addr, d); }
    if (d.has(tokenId)) return;
    d.add(tokenId);
    // ⚰️→⛏️ M4 fix (07-12, sync auditas): mirtis IŠKART nurašo kapinių/kasimo bazę (kaip injured drain LIVE) —
    //   kitaip mirę unitai inflatina RONKE mining rate iki kito owner login (offline accrual apmokėtų
    //   inflatintą rate iš REALAUS RonkeReward pool). Owner login vis tiek perskaičiuoja iš šviežio deko
    //   (idempotent — dvigubo nurašymo nebus, join'as perrašo absoliučiom reikšmėm).
    const c = this._cem.get(addr);
    if (c && level != null) {
      c.power = Math.max(0, (c.power || 0) - Math.max(0, (level || 0) - 1) * ronkePowerRate(utype || ""));
      c.nft = Math.max(0, (c.nft || 0) - 1);
      this._persistCem(addr);
    }
    this._persistInjured(addr);   // persist'ina IR deadUnits (žr. _persistInjured)
    console.log(`[F9PvpRoom] 💀 PERMADEATH ${tokenId} (${addr.slice(0, 10)}…) — įrašyta į deadUnits${c && level != null ? ", cem bazė nurašyta" : ""}`);
  }
  private _hospLoaded = new Set<string>();   // 🛡 S-M5: adresai, kurių buildings SĖKMINGAI užkrauti (persist leidžiamas tik jiems)
  private _injured = new Map<string, { q: InjuredUnit[]; starts: number[]; durs: number[]; lvl: number }>();   // 🏥 ligoninė v3.1 (per-lovą trukmės):
  //   wallet → {eilė, slotų startai (starts[i] ↔ q[i], i < slotai), ligoninės lygis}. Persist f9_bases.buildings.
  // Lovų trukmės (ms), GREIČIAUSIOS pirmos — laisva lova visada duodama greičiausia pirmiau.
  private _hospBedDurs(lvl: number): number[] {
    const red = HOSP_BED_RED[Math.max(1, Math.min(HOSP_MAX_LVL, lvl || 1))] || [0];
    return red.map((r) => Math.max(60_000, HEAL_MS - r)).sort((a, b) => a - b);
  }
  private _hospSlots(lvl: number): number { return this._hospBedDurs(lvl).length; }
  private _hospHealMs(lvl: number): number { return this._hospBedDurs(lvl)[0]; }   // greičiausia lova (payload/notify)
  // Laisvos lovos trukmė (multiset skirtumas: visos lovos − užimtos) — greičiausia pirma.
  private _hospFreeDur(h: { durs: number[]; lvl: number }): number {
    const used = h.durs.slice();
    for (const d of this._hospBedDurs(h.lvl)) {
      const k = used.indexOf(d);
      if (k >= 0) { used.splice(k, 1); continue; }
      return d;
    }
    return this._hospBedDurs(h.lvl)[0];
  }
  // Užpildo laisvas lovas iš eilės priekio (starts/durs ↔ q[i]). entryTime — kada užlipo (chain'ui).
  private _hospFillBeds(h: { q: InjuredUnit[]; starts: number[]; durs: number[]; lvl: number }, entryTime: number) {
    const cap = Math.min(this._hospSlots(h.lvl), h.q.length);
    if (h.starts.length > cap) { h.starts.length = cap; h.durs.length = cap; }
    while (h.starts.length < cap) { h.durs.push(this._hospFreeDur(h)); h.starts.push(entryTime); }
  }
  // 🏥⚔️ EILĖS PRIORITETAS (07-05 user): DABARTINIO on-chain deko unitai gydomi PIRMI — seni išrotuoti
  //   tokenai nebekemša lovų (ff0a: 9 seni prieš 12 aktyvių @1 lova = +9h delsos). LOVOSE esančių
  //   (q[0..starts-1]) NELIEČIAM (timeriai gyvi) — stabiliai rikiuojam tik LAUKIANČIĄ uodegą.
  //   cd=null (chain nepasiekiama/dev) → nieko nedarom. Sužalojimas NIEKUR nedingsta — tik eilės tvarka.
  private _hospPrioritize(addr: string, h: { q: InjuredUnit[]; starts: number[] }) {
    try {
      const cd = chainDeckCached((addr || "").trim().toLowerCase());
      if (!cd || !cd.size || h.q.length <= h.starts.length + 1) return;
      const beds = h.q.slice(0, h.starts.length);
      const wait = h.q.slice(h.starts.length);
      const inDeck = wait.filter((u) => cd.has(String(u.tokenId)));
      const old = wait.filter((u) => !cd.has(String(u.tokenId)));
      if (!old.length || !inDeck.length) return;
      h.q = beds.concat(inDeck, old);
    } catch (_) {}
  }
  // ETA kiekvienam eilės nariui: slotuose — tikslus; laukiantiems — min-finish simuliacija per slotus.
  private _hospEtas(h: { q: InjuredUnit[]; starts: number[]; durs: number[]; lvl: number }): { eta: number; dur: number }[] {
    const out: { eta: number; dur: number }[] = [];
    const fin: number[] = h.starts.map((st, i) => st + (h.durs[i] || this._hospHealMs(h.lvl)));
    const bdur: number[] = h.durs.slice();   // lovos trukmė LIEKA lovai (kitas užėmęs gauna tą pačią)
    for (let i = 0; i < h.q.length; i++) {
      if (i < h.starts.length) { out.push({ eta: fin[i], dur: h.durs[i] }); continue; }
      let m = 0; for (let j = 1; j < fin.length; j++) if (fin[j] < fin[m]) m = j;
      const d = bdur.length ? bdur[m] : this._hospHealMs(h.lvl);
      const eta = (fin.length ? fin[m] : Date.now()) + d;
      out.push({ eta, dur: d });
      if (fin.length) fin[m] = eta; else { fin.push(eta); bdur.push(d); }
    }
    return out;
  }
  private _cem = new Map<string, { pot: number; tick: number; power: number; nft: number; rv: number; wallet: number; ramp: number; mpot: number; mcp: number; mfield: number; mres: number; duty: "online" | "safe"; gated: boolean }>();   // ⚰️/⛏️ + mpot=iškastas RONKE + mcp=kitas siege checkpoint (pot kaupiasi iki čia→STOJA kol PvP mūšis) + mfield/mres=lauko/rezervo count'ai + duty=režimas + gated=pasiekė checkpoint → laukia mūšio
  private _saveTimer: any = null;                            // 🏰 periodinis autosave (10s)
  private _lastSaveAt = 0;                                   // throttle (vengiam per dažnų DB rašymų)
  private _tpDisabled = false;                               // 🌀 TP išjungtas kai vidurio siena išgriauta (atviras perėjimas)
  private _retreatMs = 0;                                    // 🏳️ kiek laiko VISI puolikai zonoj (5s → retreat)
  private _attackerEngaged = false;                          // 🏳️ puolikas bent kartą išėjo iš spawn zonos (įsitraukė į kovą)
  private _lastRetreatSec = -1;                              // throttle retreat countdown broadcast'ui
  private _asyncRaid = false;                                // 🤖 OFFLINE raid: taikinys neprisijungęs → AI gina jo snapshot'ą
  private _buildings: BaseBuildings = { wallLevel: 1, towerLevel: 1, towers: [] };   // 🏗️ pilies upgrade konfigūracija (siena/bokštai)
  private _idleTimer: any = null;              // 🧟 zombie-room reaper (pingInterval:0 → mirę WS nepašalinami savaime)
  private _lastActivity = 0;                   // paskutinės žinutės/join sim-laikas (ms wall-clock)
  private _idleSkip = 0;                       // ⚡ S7: idle down-shift tikų skaitliukas (rami namų pilis ~5Hz)
  private _simWakeUntil = 0;                   // ⚡ S7: iki kada pilnas 30Hz po wake signalo (cmd/join)
  // 🗡️📜 RAID ATASKAITA: fiksuojam puoliką + gynėjo nuostolius per raidą (offline consequences report).
  private _raidAtkAddr = "";                   // puoliko adresas (live: raider join; async: pirmas team!=DEF)
  private _raidKilled = new Set<string>();     // gynėjo tokenId žuvę per ŠĮ raidą
  private _raidInjured = new Set<string>();    // gynėjo tokenId sužaloti per ŠĮ raidą
  private _battleFates = new Map<string, "injured" | "dead">();   // ⚔ ŠIO mūšio per-unitId likimai (2-pusiam settled ekranui: abiejų komandų sudėtis)
  private _raidStolen = 0;                      // pavogti kaulai (užpildoma _endMatch grobio bloke)
  private _minePend = new Map<string, { nonce: string; amt: number; at: number }>();   // ⛏️💸 laukiantis withdrawal (deduct'inta; jei TX nenusėda po deadline → re-credit)
  private _raidReported = false;               // vieną kartą per kambarį

  onCreate(options: any) {
    this.setState(new F9State());
    this.state.seed = Math.floor(Math.random() * 1_000_000_000);
    this.state.phase = "lobby";
    this._combatEnabled = options?.combat !== false;       // default ON; testai gali siųsti combat:false
    this._relay = options?.relay === true;                  // C3: host-authority relay režimas (#f9live)
    this._home = options?.home === true;                    // 🏰 HOME: solo namų pilis (opt-in; 1v1 nepaliestas)
    // 🤖 ASYNC raid: puolikas sukūrė kambarį (raid:true, BE home) — taikinys offline → AI gins jo snapshot'ą.
    //    (joinOrCreate: jei taikinys ONLINE → prisijungtų prie jo home kambario = live raid; jei ne → kuria šitą.)
    this._asyncRaid = options?.raid === true && options?.home !== true;
    this._ownerAddr = String(options?.owner || "").trim().toLowerCase();   // 🏰 filterBy raktas (puolikas join'ina pagal jį)
    if (this._home || this._asyncRaid) this.maxClients = 4;                // home: defender+raiders; async: puolikas (+vietos)
    // #f9live = griežtas 1v1: maxClients=2 → vos 2 viduj, kambarys pilnas/nebejoinable →
    // kitas #f9live atidarymas kuria ŠVIEŽIĄ porą (jokio late-join/zombie-room suporavimo). FFA lieka 4.
    if (this._relay) this.maxClients = 2;
    this.state.entryFee = Math.max(0, Math.min(65535, Math.floor(Number(options?.entryFee) || 0))); // 0 = free
    this.state.pot = 0;
    // host vardas → rodomas lobby (room browser) kambarių sąraše. Adresą sutrumpinam.
    let _host = String(options?.name || "").trim();
    if (/^0x[0-9a-fA-F]{6,}$/.test(_host)) _host = _host.slice(0, 6) + "…" + _host.slice(-4);
    else if (_host.length > 16) _host = _host.slice(0, 16);
    if (!_host) _host = "Player";
    this.setMetadata({ mode: String(options?.mode || "ffa"), entryFee: this.state.entryFee, host: _host });

    // ── Komandų protokolas ──
    // Vieninga „cmd" žinutė: { action, ids:[unitId], x, y }.
    this.onMessage("cmd", (client, msg: any) => { this._lastActivity = Date.now(); this._simWakeUntil = Date.now() + 1000; this._handleCmd(client, msg); });   // ⚡ S7: cmd → IŠKART pilnas 30Hz
    this.onMessage("presence", () => { this._lastActivity = Date.now(); });   // 🧟 klientas laikas nuo laiko praneša „gyvas" (idle-open pilis nereapinama)
    // 🧪 STRESS: savininkas home pilyje → spawnina N AI puolikų (testas 30v30). TEST-only.
    this.onMessage("stress_spawn", (client, msg: any) => {
      if (process.env.F9_ALLOW_STRESS !== "1") return;   // 🔒 EXPLOIT GATE: prod'e IŠJUNGTA (nemokamų AI puolikų farm → kaulai/RONKE)
      if (!this._home || client.sessionId !== this._ownerSid) return;
      const n = Math.max(1, Math.min(60, Number(msg && msg.n) || 30));
      this._spawnStressAttackers(n);
    });
    // Ready toggle.
    this.onMessage("ready", (client) => this._handleReady(client));
    // 🏰 HOME: sklandus squad keitimas (be reload) — re-spawn unitus spawn spotuose.
    this.onMessage("set_squad", (client, msg: any) => this._handleSetSquad(client, msg));
    // 🏗️ HOME: sienos/bokštų upgrade per pilies panelę. Tik savininkas, tik ramus home (be raiderio).
    this.onMessage("upgrade_wall", (client) => this._handleUpgradeWall(client));
    this.onMessage("upgrade_hospital", (client) => this._handleUpgradeHospital(client));
    // 🛡 SKYDO NUĖMIMAS — TIK pilies SAVININKAS savo namuose (nori būti puolamas anksčiau nei 1h).
    this.onMessage("shield_remove", async (client) => {
      if (!this._home || client.sessionId !== this._ownerSid || !this._ownerAddr) return;
      try {
        (this._buildings as any).shieldUntil = 0;   // live raid gate mato iškart
        await this._buildingsOp(this._ownerAddr, (b) => { (b as any).shieldUntil = 0; });   // async raid gate (naujas kambarys) irgi matys 0
        try { client.send("shield", { until: 0 }); } catch (_) {}
        console.log(`[F9PvpRoom] 🛡❌ savininkas nusiėmė skydą (${this._ownerAddr.slice(0, 10)}…)`);
      } catch (_) {}
    });
    // 🏥 LIGONINĖ — klientas prašo savo eilės (namuko UI panelei)
    this.onMessage("hospital_get", async (client) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      if (!addr) { try { client.send("hospital", { list: [], now: Date.now(), healMs: HEAL_MS }); } catch (_) {} return; }
      await this._loadInjured(addr);
      // ⚡🔵 RONKE BLESS charge status (Ronkeverse count iš kešuoto chainCounts) — panelė rodo „N liko".
      let insta: any = { cap: 0, used: 0, remaining: 0 };
      try { const cc = await chainCounts(addr); insta = await instantHealStatus(addr, cc ? cc.rv : 0); } catch (_) {}
      try { client.send("hospital", { ...this._hospPayload(addr), insta }); } catch (_) {}
    });
    // ⚰️ KAPINĖS — pot/rate užklausa (badge + UI)
    this.onMessage("cemetery_get", async (client) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      if (!addr) return;
      // raide puolikas mato GYNĖJO potą (grobio taikinys), savininkas namie — savo
      const target = (this._home || this._asyncRaid) && this._ownerAddr ? this._ownerAddr : addr;
      await this._loadCem(target); this._cemAccrue(target);
      try { client.send("cemetery", { ...this._cemPayload(target), own: target === addr }); } catch (_) {}
    });
    // ⛏️💰 MINING — klientas prašo šviežio mining pot (server-authoritative). Grąžinam per cemetery payload (mpot/mrate).
    this.onMessage("mine_get", async (client) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      if (!addr) return;
      const target = (this._home || this._asyncRaid) && this._ownerAddr ? this._ownerAddr : addr;
      await this._loadCem(target); this._cemAccrue(target);
      try { client.send("cemetery", { ...this._cemPayload(target), own: target === addr }); } catch (_) {}
    });
    // ⚔️🛡 DUTY STATUS keitimas — TIK savininkas savo namuose. ONLINE = 2×+puolamas / SAFE = 1.2×+nepuolamas.
    //   Anti-dodge: NEleidžiam keisti kovos metu (phase='playing' → kažkas puola / tu puoli).
    this.onMessage("duty_set", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      if (!addr) return;
      if (!(this._home && addr === this._ownerAddr)) { try { client.send("duty_result", { ok: false, error: "Change duty at home only." }); } catch (_) {} return; }
      // 🛡 Anti-dodge: namų pilis visada phase='playing' (solo simas), tad KOVA = raideris kambaryje (size>1).
      //   Ramioje pilyje (size===1) keisti galima; puolimo metu — ne (negali pabėgti į safe pačiam raide).
      if (this.state.players.size > 1) { try { client.send("duty_result", { ok: false, error: "Can't change duty mid-battle." }); } catch (_) {} return; }
      const want: "online" | "safe" = msg && msg.mode === "safe" ? "safe" : "online";
      await this._loadCem(addr); this._cemAccrue(addr);
      const c = this._cem.get(addr);
      if (!c) { try { client.send("duty_result", { ok: false, error: "Try again." }); } catch (_) {} return; }
      c.duty = want;
      // ⛏️🗡 Režimo keitimas NEnuima siege gate'o (kitaip būtų dodge: perjungi režimą → atrakini kasimą be mūšio).
      //   Gate nuima TIK kvalifikuotas PvP mūšis (_endMatch) arba withdraw reset.
      this._persistCem(addr);
      try { client.send("duty_result", { ok: true, mode: want }); client.send("cemetery", { ...this._cemPayload(addr), own: true }); } catch (_) {}
      console.log(`[F9PvpRoom] ⚔️🛡 duty → ${want} (${addr.slice(0, 10)}…)`);
    });
    // ⛏️💸 WITHDRAW — RONKE→wallet per RonkeReward voucherį (faucet pool reuse). Serveris: verify pot → sign →
    //   DEDUCT pot + pending (jei TX nenusėda po deadline → re-credit; jei nusėda → lieka nurašyta). Player pateikia TX.
    this.onMessage("mine_withdraw", async (client) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      try {
        if (!addr) return;
        if (!mineWithdrawEnabled()) { client.send("mine_withdraw_result", { ok: false, error: "Withdrawal not live yet — coming soon." }); return; }
        // TIK savininkas, TIK ramiuose namuose (ne raido metu), NE su laukiančiu withdrawal'u.
        // ⚠️ „mid-raid" = players.size>1 (raideris kambaryje). NENAUDOTI phase==='playing' — namų pilis VISADA
        //   playing (solo simas), tad būtų VISADA atmetama (kaip duty_set anti-dodge — ta pati klaida).
        if (!(this._home && addr === this._ownerAddr) || this.state.players.size > 1) { client.send("mine_withdraw_result", { ok: false, error: "Withdraw at home only (not mid-raid)." }); return; }
        if (this._minePend.has(addr)) { client.send("mine_withdraw_result", { ok: false, error: "Previous withdrawal still pending — submit or wait." }); return; }
        await this._loadCem(addr); this._cemAccrue(addr);
        const c = this._cem.get(addr);
        const pot = c ? (c.mpot || 0) : 0;
        if (pot < MINE_CLAIM_MIN) { client.send("mine_withdraw_result", { ok: false, error: "Need " + MINE_CLAIM_MIN + "+ RONKE to withdraw." }); return; }
        const amt = Math.min(Math.floor(pot), MINE_MAX_SINGLE);   // vienas withdraw ≤ maxSingle (kontrakto luba)
        const voucher = await signMineVoucher(this._ownerAddr, amt);
        if (!voucher) { client.send("mine_withdraw_result", { ok: false, error: "Signing failed — try again." }); return; }
        // DEDUCT pot + pending (re-credit jei TX nenusėda). c! saugu (pot≥MIN → c egzistuoja).
        c!.mpot = Math.round(((c!.mpot || 0) - amt) * 1000) / 1000;
        c!.mcp = MINE_SIEGE_STEP;   // 🗡 nusiėmus — naujas ciklas nuo pradžių (kitas checkpoint vėl @200)
        c!.gated = (c!.mpot || 0) >= c!.mcp - 0.01;   // paprastai pot≈0 → false
        this._persistCem(addr);
        this._minePend.set(addr, { nonce: voucher.nonce, amt, at: Date.now() });
        client.send("mine_withdraw_result", { ok: true, claim: voucher });
        try { client.send("cemetery", { ...this._cemPayload(addr), own: true }); } catch (_) {}   // šviežias (sumažintas) pot
        console.log(`[F9PvpRoom] ⛏️💸 withdraw voucher: ${amt} RONKE ${addr.slice(0, 10)}… (pot→${c!.mpot}, checkpoint reset→${c!.mcp})`);
      } catch (e: any) { try { client.send("mine_withdraw_result", { ok: false, error: "Error — try again." }); } catch (_) {} }
    });
    // ⚰️ SURINKTI — tik savininkas, tik ramiuose namuose (raido metu grobis užrakintas kovai)
    this.onMessage("cemetery_collect", async (client) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      if (!addr || !this._home || client.sessionId !== this._ownerSid) return;
      if (this.state.players.size > 1) { try { client.send("cemetery_collect_fail", { reason: "raid" }); } catch (_) {} return; }
      await this._loadCem(addr); this._cemAccrue(addr);
      const c = this._cem.get(addr)!;
      // 🦴 CLAIM slenkstis: reikia sukaupti bent CEM_CLAIM_MIN — tik tada visas pot keliauja į banką
      if (c.pot < CEM_CLAIM_MIN) {
        try { client.send("cemetery_collect_fail", { reason: "min", need: CEM_CLAIM_MIN, pot: Math.round(c.pot * 1000) / 1000 }); } catch (_) {}
        try { client.send("cemetery", { ...this._cemPayload(addr), own: true }); } catch (_) {}
        return;
      }
      const amt = Math.floor(c.pot * 10) / 10;
      c.pot = Math.round((c.pot - amt) * 1000) / 1000;
      this._persistCem(addr);
      const total = await addBones(addr, amt);
      try {
        client.send("bones_banked", { amount: amt, total });
        client.send("cemetery", { ...this._cemPayload(addr), own: true });
      } catch (_) {}
      console.log(`[F9PvpRoom] ⚰️ collect +${amt} (${addr.slice(0, 10)}…) bank=${total}`);
    });
    // 🏥 „GYDYTI PIRMĄ" — pasirinktas unitas perkeliamas į eilės priekį; gydymas jam prasideda NUO NULIO
    //   (dabartinė galva praranda progresą — eilės keitimo kaina; paprastos ir sąžiningos taisyklės).
    this.onMessage("hospital_heal_first", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      const tokenId = String(msg?.tokenId || "");
      if (!addr || !tokenId) return;
      await this._loadInjured(addr);
      const h = this._injured.get(addr);
      if (!h) return;
      const idx = h.q.findIndex((i) => i.tokenId === tokenId);
      if (idx > 0) {
        const prev = new Map<string, { st: number; du: number }>();
        h.starts.forEach((st, i2) => { if (h.q[i2]) prev.set(h.q[i2].tokenId, { st, du: h.durs[i2] }); });   // lovų progresas
        const [it] = h.q.splice(idx, 1);
        h.q.unshift(it);
        const sl = Math.min(this._hospSlots(h.lvl), h.q.length);
        const _now = Date.now();
        // 🐛 S-C3 FIX (v2, CRIT-review): PUSH'inam KIEKVIENAI lovai, BET perkeltajam (q[0]) laisvą lovą imam iš
        //   POOL'o (visos lovos − liko-lovose), o NE _hospFreeDur(h) su tuščiu h.durs. Kitaip L3/L5 (skirtingos
        //   lovų trukmės) perkeltas prie idx0 gaudavo GREIČIAUSIĄ lovą (nes h.durs dar tuščias) → dvi tos pačios
        //   trukmės lovos, o lėtoji dingdavo. instant_heal to bug'o neturi (perkeltas visada gale).
        const _keptDurs: number[] = [];
        for (let i2 = 0; i2 < sl; i2++) { const k = prev.get(h.q[i2].tokenId); if (k && h.q[i2].tokenId !== tokenId) _keptDurs.push(k.du); }
        const _freePool = this._hospBedDurs(h.lvl).slice();   // greičiausia pirma
        for (const d of _keptDurs) { const k = _freePool.indexOf(d); if (k >= 0) _freePool.splice(k, 1); }
        h.starts = []; h.durs = [];
        for (let i2 = 0; i2 < sl; i2++) {
          const kept = prev.get(h.q[i2].tokenId);
          if (kept && h.q[i2].tokenId !== tokenId) { h.starts.push(kept.st); h.durs.push(kept.du); }   // liko lovoj → progresas išlieka
          else { const du = _freePool.length ? _freePool.shift()! : this._hospBedDurs(h.lvl)[0]; h.durs.push(du); h.starts.push(_now); }   // perkeltas → LAISVA lova NUO 0
        }
        this._persistInjured(addr);
        console.log(`[F9PvpRoom] 🏥 heal-first ${it.utype}#${tokenId} (${addr.slice(0, 10)}…)`);
      }
      try { client.send("hospital", this._hospPayload(addr)); } catch (_) {}
    });
    // ⚡🔵 RONKE BLESS — momentinis sužaloto unito pagydymas (Ronkeverse holder perk, 2026-07-05 user).
    //   Charge = 1 už kiekvieną laikomą Ronkeverse NFT / rolling 24h (cap 30). TIK savo pilyje + RAMYBĖJE.
    //   Išima unitą iš injured queue → auto-deploy į garnizoną (kaip natūralus pasveikimas per _pruneHosp).
    this.onMessage("hospital_instant_heal", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      const tokenId = String(msg?.tokenId || "");
      if (!addr || !tokenId) return;
      if (!this._home || client.sessionId !== this._ownerSid) { try { client.send("insta_heal_fail", { reason: "not_home" }); } catch (_) {} return; }
      if (this.state.players.size > 1) { try { client.send("insta_heal_fail", { reason: "raid" }); } catch (_) {} return; }
      await this._loadInjured(addr);
      // Pirminė patikra (be charge): unitas ligoninėj. BLESS veikia ant BET KURIO sužaloto — pagydytas tampa
      //   SVEIKU unitu (2026-07-05 user), kurį gali vėl registruoti į deką. Deke esantys auto-deploy'inasi;
      //   ne deke — tiesiog pasveiksta ir laukia MANAGE DECK'e (jokio phantom'o — `_deployReady` ne-deko atmeta).
      { const h0 = this._injured.get(addr); if (!h0 || h0.q.findIndex((i) => i.tokenId === tokenId) < 0) { try { client.send("insta_heal_fail", { reason: "not_injured" }); } catch (_) {} return; } }
      const cc = await chainCounts(addr);
      const rv = cc ? cc.rv : 0;
      const consumed = await consumeInstantHeal(addr, rv);
      if (!consumed.ok) {
        const st = await instantHealStatus(addr, rv);
        try { client.send("insta_heal_fail", { reason: rv < 1 ? "no_nft" : "no_charges", insta: st }); } catch (_) {}
        return;
      }
      // 🔁 RE-FIND PO AWAIT'ų (chainCounts/consume metu _pruneHosp 10s timeris galėjo pašalinti pasveikusius →
      //   indeksai pasislenka). tokenId paieška + splice ČIA yra SINCHRONINĖ (jokio await → jokio interleave).
      const h = this._injured.get(addr);
      const idx = h ? h.q.findIndex((i) => i.tokenId === tokenId) : -1;
      if (!h || idx < 0) {
        // unitas pasveiko natūraliai per async langą → charge NEpanaudotas heal'ui → grąžinam.
        try { await refundInstantHeal(addr); } catch (_) {}
        const st = await instantHealStatus(addr, rv);
        try { client.send("hospital", { ...this._hospPayload(addr), insta: st }); } catch (_) {}
        return;
      }
      // 🏥 išimam pagydytą; likusiems lovų progresą išlaikom, atsilaisvinusias lovas užpildom nuo dabar.
      const prev = new Map<string, { st: number; du: number }>();
      h.starts.forEach((st, i2) => { if (h.q[i2]) prev.set(h.q[i2].tokenId, { st, du: h.durs[i2] }); });
      const healed = h.q.splice(idx, 1)[0];
      h.starts = []; h.durs = [];
      const now = Date.now();
      const sl = Math.min(this._hospSlots(h.lvl), h.q.length);
      for (let i2 = 0; i2 < sl; i2++) {
        const kept = prev.get(h.q[i2].tokenId);
        if (kept) { h.starts.push(kept.st); h.durs.push(kept.du); }        // liko lovoj → progresas išlieka
        else { h.durs.push(this._hospFreeDur(h)); h.starts.push(now); }    // promotintas → gyja nuo dabar
      }
      this._persistInjured(addr);
      // ⚔️ auto-deploy pagydytą JEI deke + savo namai + ramybė (kaip _pruneHosp recovered grandinė).
      if (this._home && addr === this._ownerAddr && this.state.players.size <= 1 && this.state.phase === "playing") {
        let op: F9Player | undefined;
        this.state.players.forEach((pp) => { if (String(pp.address || "").trim().toLowerCase() === addr) op = pp; });
        if (op) this._deployReady(op);
      }
      // ar pagydytas realiai atsidūrė lauke? deke → taip; ne deke → ne (tiesiog SVEIKAS, re-registerable MANAGE DECK'e).
      let deployed = false;
      this.state.units.forEach((u) => { if (u.tokenId === healed.tokenId) deployed = true; });
      const st = await instantHealStatus(addr, rv);
      console.log(`[F9PvpRoom] ⚡ RONKE BLESS heal ${healed.utype}#${healed.tokenId} (${addr.slice(0, 10)}… ${deployed ? "deployed" : "healthy"}, liko ${st.remaining}/${st.cap})`);
      try {
        client.send("recovered", { tokenId: healed.tokenId, utype: healed.utype, level: healed.level, instant: true, deployed });
        client.send("hospital", { ...this._hospPayload(addr), insta: st });
      } catch (_) {}
    });
    this.onMessage("upgrade_towers", (client) => this._handleUpgradeTowers(client));
    this.onMessage("build_tower", (client, msg: any) => this._handleBuildTower(client, msg));
    // ⚔️ DEPLOY (07-04): pasveikę/nespawninti deko unitai → garnizonas. Tik savininkas, tik ramybėje.
    this.onMessage("deploy_ready", (client) => {
      if (!this._home || client.sessionId !== this._ownerSid) return;
      if (this.state.players.size > 1) { try { client.send("deploy_done", { added: 0, reason: "raid" }); } catch (_) {} return; }
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const added = this._deployReady(p);
      try {
        client.send("deploy_done", { added });
        client.send("hospital", this._hospPayload(p.address));
      } catch (_) {}
      console.log(`[F9PvpRoom] ⚔️ deploy_ready +${added} (${String(p.address).slice(0, 10)}…)`);
    });

    // ── 🦴 KAULŲ BANKAS + SWAP → RONKE (server-auth; žaidėjas TX moka pats) ──
    // Bankas = persistuotas balansas (`<addr>#bones` f9_bases eilutė); sesijos kaulai (p.bones)
    // į banką flush'inami match pabaigoj / leave. Swap: nurašom iš banko → EIP-712 voucher →
    // klientas pats siunčia TX į BoneExchange (min 100 kaulų enforce'inta IR on-chain).
    this.onMessage("bones_bank_get", async (client) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      const cfg = boneSwapCfg();
      if (!addr) { try { client.send("bones_bank", { bones: 0, session: p?.bones || 0, pending: null, cfg, noWallet: true }); } catch (_) {} return; }
      // 🔒 boneBankOp — re-credit serializuotas su flush/grobiu (anti race)
      const bank = await boneBankOp(addr, async () => {
        const b = await loadBoneBank(addr);
        // Pasibaigęs pending voucher → on-chain nonce patikra: panaudotas → clear; ne → RE-CREDIT.
        //   RonkeReward režimo pending (rr) tikrina RonkeReward usedNonces; Saigon — BoneExchange usedNonces.
        if (b.pending && Date.now() > b.pending.deadline * 1000 + 5 * 60 * 1000) {
          const used = (b.pending as any).rr ? await isRonkeRewardNonceUsed(b.pending.nonce) : await isNonceUsed(b.pending.nonce);
          if (used === true) { b.pending = null; await saveBoneBank(addr, b); }
          else if (used === false) {
            const back = b.pending.deciBones / 10;
            b.bones = Math.round((b.bones + back) * 10) / 10;
            b.pending = null;
            await saveBoneBank(addr, b);
            console.log(`[F9PvpRoom] 🦴 expired voucher re-credit +${back} (${addr.slice(0, 10)}…)`);
          } // used === null (RPC fail) → paliekam pending, bandysim kitą kartą
        }
        return b;
      });
      const hasNft = await hasRequiredNft(addr);   // 🎫 true/false; null = RPC fail (UI rodo "?", kontraktas enforce'ins)
      try { client.send("bones_bank", { bones: bank.bones, session: p?.bones || 0, pending: bank.pending, cfg, hasNft }); } catch (_) {}
    });
    // 🦴🎫 RONKEVERSE MINT-BONUS (2026-07-05): klientas atsiunčia mint TX hash → serveris on-chain verifikuoja
    //   UnitMinted logus (owner = SESIJOS wallet, dedupe/tokenId) + Ronkeverse gate → award į banką. Logika
    //   izoliuota MintReward.ts. addr = server-auth (p.address, NE kliento teiginys) → spoof neįmanomas.
    this.onMessage("mint_reward", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      const txHash = String((msg && msg.txHash) || "").trim();
      if (!addr || !txHash) return;
      let res;
      try { res = await claimMintReward(addr, txHash); }
      catch (e: any) { console.warn("[F9PvpRoom] mint_reward err:", e?.message); return; }
      // Klientui grąžinam VISADA (su txHash) — kad išvalytų pending; animacija tik kai amount>0.
      try { client.send("mint_reward_done", { txHash, amount: res.amount, n: res.n, total: res.total, reason: res.reason, ok: res.ok }); } catch (_) {}
    });
    this.onMessage("bones_swap", async (client) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      if (!addr) { try { client.send("bones_err", { msg: "Wallet required" }); } catch (_) {} return; }
      const cfg = boneSwapCfg();
      if (!cfg.enabled) { try { client.send("bones_err", { msg: "Swap contract not configured yet" }); } catch (_) {} return; }
      // 🎫 NFT GATE (pre-check UX'ui; on-chain kontraktas enforce'ina bet kokiu atveju). null (RPC fail) → praleidžiam.
      if ((await hasRequiredNft(addr)) === false) {
        try { client.send("bones_err", { msg: `Need ${NFT_REQUIRED} Ronkeverse NFT to swap bones` }); } catch (_) {}
        return;
      }
      if (this._boneBusy.has(addr)) { try { client.send("bones_err", { msg: "Swap in progress — wait" }); } catch (_) {} return; }
      this._boneBusy.add(addr);
      try {
        // 🔒 boneBankOp — visa nurašymo seka serializuota su flush/grobiu/upgrade (anti race)
        await boneBankOp(addr, async () => {
          const bank = await loadBoneBank(addr);
          if (bank.pending) {   // jau turi voucher'į → pergrąžinam TĄ PATĮ (re-submit; naujo neišduodam)
            if (Date.now() <= bank.pending.deadline * 1000) {
              const pv: any = (bank.pending as any).rr
                ? { ...(bank.pending as any).voucher, ronkeReward: true, deciBones: (bank.pending as any).deciBones, resend: true }
                : { ...bank.pending, contract: cfg.contract, chainId: cfg.chainId, rpc: cfg.rpc, resend: true };
              try { client.send("bones_voucher", pv); } catch (_) {}
            } else {
              try { client.send("bones_err", { msg: "Pending swap expired — reopen panel to reclaim bones" }); } catch (_) {}
            }
            return;
          }
          if (bank.bones < MIN_BONES) { try { client.send("bones_err", { msg: `Need ${MIN_BONES} bones in bank (have ${bank.bones})` }); } catch (_) {} return; }
          // ⚡ RONKEREWARD režimas (mainnet, 07-12): kaulai×5 RONKE per faucet pool, cap RR_MAX_SWAP_BONES.
          if (cfg.mode === "ronkereward") {
            const v: any = await signBoneRonkeVoucher(addr, bank.bones);
            if (!v) { try { client.send("bones_err", { msg: "Voucher signing failed" }); } catch (_) {} return; }
            const bones = v.deciBones / 10;
            bank.bones = Math.round((bank.bones - bones) * 10) / 10;
            // pending.rr → re-credit tikrina RonkeReward nonce; voucher saugom re-send'ui
            bank.pending = { deciBones: v.deciBones, nonce: v.nonce, deadline: v.deadline, sig: v.signature, createdAt: Date.now(), rr: true, voucher: v } as any;
            const ok = await saveBoneBank(addr, bank);
            if (!ok) { try { client.send("bones_err", { msg: "Persist failed — try again" }); } catch (_) {} return; }
            console.log(`[F9PvpRoom] 🦴→RONKE(RR) voucher ${bones} bones → ${bones * cfg.ratePerBone} RONKE (${addr.slice(0, 10)}…)`);
            try { client.send("bones_voucher", { ...v }); } catch (_) {}
            return;
          }
          // Saigon BoneExchange režimas (legacy/testnet)
          const deci = Math.min(Math.floor(bank.bones * 10), MAX_SWAP_BONES * 10);
          const v = await signSwapVoucher(addr, deci);
          if (!v) { try { client.send("bones_err", { msg: "Voucher signing failed" }); } catch (_) {} return; }
          // Nurašymas + pending VIENU save — jei save nepavyko, voucher'is klientui NEišsiunčiamas.
          bank.bones = Math.round((bank.bones - deci / 10) * 10) / 10;
          bank.pending = { deciBones: deci, nonce: v.nonce, deadline: v.deadline, sig: v.sig, createdAt: v.createdAt };
          const ok = await saveBoneBank(addr, bank);
          if (!ok) { try { client.send("bones_err", { msg: "Persist failed — try again" }); } catch (_) {} return; }
          console.log(`[F9PvpRoom] 🦴 swap voucher ${deci / 10} bones → ${(deci / 10) * cfg.ratePerBone} RONKE (${addr.slice(0, 10)}…)`);
          try { client.send("bones_voucher", { ...v }); } catch (_) {}
        });
      } finally { this._boneBusy.delete(addr); }
    });
    this.onMessage("bones_swap_done", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      const addr = String(p?.address || "").trim().toLowerCase();
      if (!addr) return;
      const bank = await boneBankOp(addr, async () => {   // 🔒 serializuota
        const b = await loadBoneBank(addr);
        if (b.pending) { b.pending = null; await saveBoneBank(addr, b); }   // clear = saugu (nieko nekredituoja)
        return b;
      });
      console.log(`[F9PvpRoom] 🦴 swap done tx=${String(msg?.txHash || "").slice(0, 14)}… (${addr.slice(0, 10)}…)`);
      try { client.send("bones_bank", { bones: bank.bones, session: p?.bones || 0, pending: null, cfg: boneSwapCfg() }); } catch (_) {}
    });

    // Ping (klientas matuoja RTT).
    // 🧟 07-14 fix (user „buvau online, bet priešo nesimatė"): ping'as = GYVAS klientas → atnaujina
    //   reaper laikmatį. Anksčiau ramiai pilyje sėdintis žaidėjas (be komandų/kovos) po 6min būdavo
    //   disposintas → „online iliuzija" + puolikai gaudavo async AI kopiją nematomai. Mirusio WS ping'ų
    //   nebūna → tikri zombie kambariai vis tiek nukertami po IDLE_MS.
    this.onMessage("ping", (client, t: number) => { this._lastActivity = Date.now(); client.send("pong", t); });

    // ── C3 host-authority RELAY ──
    // guest komanda → host (host kliente sukasi tikras F9, jis pritaikys).
    this.onMessage("gcmd", (client, msg: any) => {
      if (!this._relay) return;
      const host = this.clients.find((c) => c.sessionId === this._hostSid);
      if (host && host.sessionId !== client.sessionId) host.send("gcmd", { from: client.sessionId, cmd: msg });
    });
    // host būsenos snapshot → visiems guest'ams.
    this.onMessage("hsnap", (client, msg: any) => {
      if (!this._relay || client.sessionId !== this._hostSid) return;
      this.broadcast("hsnap", msg, { except: client });
    });
    // host FX (shot/melee/death) → guest'ams.
    this.onMessage("hfx", (client, msg: any) => {
      if (!this._relay || client.sessionId !== this._hostSid) return;
      this.broadcast("hfx", msg, { except: client });
    });
    // host paskelbia mūšio pabaigą.
    this.onMessage("hend", (client, msg: any) => {
      if (!this._relay || client.sessionId !== this._hostSid) return;
      this._endMatch((msg && msg.winnerSid) || "");
    });

    // 30Hz authoritative simas (game loop).
    this.setSimulationInterval((dt) => this._tick(dt), 1000 / SIM_HZ);
    // patchRate = 50ms (20fps) — Colyseus default; tinka. Klientas PRIVALO interpoliuoti
    // (lerp ~0.2/frame tarp patch'ų), kad judėjimas būtų sklandus prie 60fps render.
    this.setPatchRate(50);
    // 🏥 periodinis ligoninės tikrinimas — pasveikimai įvyksta ir kambariui gyvam esant (notify + push)
    this._hospTimer = setInterval(() => { try { for (const addr of this._injured.keys()) this._pruneHosp(addr); } catch (_) {} }, 10_000);
    // 🧟 ZOMBIE-ROOM REAPER: pingInterval:0 → nutrūkusi jungtis (telefonas užmigo / tinklas krito) NEsiunčia
    //   WS close → kambarys „gyvas" amžinai (cloud CPU/atmintis + AFK farm rizika). Watchdog disposina
    //   kambarį po IDLE_MS be jokio aktyvumo. Būsena persistuota (autosave 10s) → reconnect atkuria.
    this._lastActivity = Date.now();
    this._idleTimer = setInterval(() => {
      try {
        if (Date.now() - this._lastActivity > F9_ROOM_IDLE_MS) {
          console.log(`[F9PvpRoom] 🧟 idle > ${Math.round(F9_ROOM_IDLE_MS / 60000)}min → disposinu zombie kambarį (${this.roomId})`);
          this.disconnect();
        }
      } catch (_) {}
    }, 30_000);
    console.log(`[F9PvpRoom] created (${this.roomId}) seed=${this.state.seed} combat=${this._combatEnabled}`);
  }

  async onJoin(client: Client, options: any) {
    this._lastActivity = Date.now();   // 🧟 join = aktyvumas (reaper laikmatis nusistato)
    this._simWakeUntil = Date.now() + 2000;   // ⚡ S7: join (pvz. raideris) → IŠKART pilnas 30Hz
    // 🏰 HOME: savininkas (pirmas) = DEFENDER_TEAM (gynėjas rytuose prie pilies); būsimi raideriai = attacker (team 0).
    const team = this._home ? (this.state.players.size === 0 ? DEFENDER_TEAM : 0) : this.state.players.size;
    const p = new F9Player();
    p.sessionId = client.sessionId;
    p.address = String(options?.address || "");
    p.team = team;
    p.ready = false;
    p.connected = true;
    p.ronkePending = 0;
    this.state.players.set(client.sessionId, p);
    // 🔐 deko nariai validuojami prieš ON-CHAIN RonkePower registrą (07-04) — neregistruoti atmetami
    let _joinDeck = sanitizeDeck(options?.deck);
    try { if (p.address) _joinDeck = await this._chainFilterDeck(String(p.address), _joinDeck); } catch (_) {}
    // 🏥 užkraunam ŠIO žaidėjo ligoninę+mirusius PRIEŠ deko store (sužaloti nedalyvauja, mirę NEEGZISTUOJA)
    try { await this._loadInjured(String(p.address || "")); } catch (_) {}
    // 💀 PERMADEATH filtras: mirę NFT išmetami iš deko VISAM (cem power/nft skaičiuojasi be jų)
    const _deadJ = this._deadSet(String(p.address || ""));
    if (_deadJ.size) {
      const b4 = _joinDeck.length;
      _joinDeck = _joinDeck.filter((e) => !e.tokenId || !_deadJ.has(e.tokenId));
      if (_joinDeck.length !== b4) console.log(`[F9PvpRoom] 💀 ${b4 - _joinDeck.length} mirę unitai pašalinti iš deko (${String(p.address).slice(0, 10)}…)`);
    }
    this._decks.set(client.sessionId, _joinDeck);
    if (options?.active != null) this._activeCount.set(client.sessionId, this._clampActive(options.active));   // ⚔ pageidaujamas lauko dydis (persist per restart, iš kliento launchHome)
    console.log(`[F9PvpRoom] join ${client.sessionId} team=${team} deck=${this._decks.get(client.sessionId)!.length} active=${this._activeCount.get(client.sessionId) || MAX_ACTIVE} (${this.state.players.size}/${this.maxClients})`);

    // 🏰 HOME: pirmas (savininkas) prisijungia → iškart spawnina jo pilį+unitus, JOKIO oponento/lobby.
    if (this._home && this.state.phase === "lobby" && this.state.players.size === 1) {
      this._ownerSid = client.sessionId;
      if (!this._ownerAddr) this._ownerAddr = String(p.address || "").trim().toLowerCase();   // fallback jei create be owner
      // 🫀 07-14: owner-heartbeat IŠKART join'e (async-raid grace guard: online gynėjo AI-pulti negalima)
      if (this._ownerAddr) this._buildingsOp(this._ownerAddr, (b) => { b.ownerSeenAt = Date.now(); });
      // Užkraunam IŠSAUGOTĄ pilies layout'ą (jei yra) → unitai atsiras KUR PALIKO (ne formacijoj).
      //   Tas pats snapshot'as = ką vėliau matys puolikai raid'uose (server-authoritative).
      // 🏗️ PERSIST ĮJUNGTAS (07-03): upgrade'ai kainuoja banked kaulus → lygiai PRIVALO išlikti po reconnect.
      this._buildings = { wallLevel: 1, towerLevel: 1, towers: [] };
      if (this._ownerAddr) {
        // ⚡ LYGIAGRETUS krovimas (07-04): buildings + units + cem(+chainDeck warm) VIENU metu —
        //   anksčiau 5 nuoseklūs Supabase/RPC round-trip'ai darė pilies load lėtą (~2-4s vien čia).
        const [bb, ru] = await Promise.all([
          loadBaseBuildings(this._ownerAddr).catch(() => null),
          loadBaseUnits(this._ownerAddr).catch(() => null),
          this._loadCem(this._ownerAddr).catch(() => null),
        ]);
        if (bb) this._buildings = bb;
        try {
          this._restoreUnits = ru;
          this._restoreUnits = await this._chainFilterSnap(this._ownerAddr, this._restoreUnits);   // 🔐 tik registruoti (chain cache jau šiltas)
          console.log(`[F9PvpRoom] 🏰 home restore for ${this._ownerAddr}: ${this._restoreUnits ? this._restoreUnits.length + " saved units" : "none"} (wall Lv${this._buildings.wallLevel || 1}, towers ${(this._buildings.towers || []).length})`);
        } catch (e) { this._restoreUnits = null; }
        // ⚰️ kapinės: PIRMA prikaupiam su senu power (offline periodas), TADA atnaujinam power/nft iš šviežio deko
        try {
          this._cemAccrue(this._ownerAddr);
          const cem = this._cem.get(this._ownerAddr);
          if (cem) {
            const deck = this._decks.get(client.sessionId) || [];
            let pw = 0; for (const d of deck) pw += Math.max(0, (d.level || 0) - 1) * ronkePowerRate(d.utype);
            cem.power = pw; cem.nft = this._nftCountOf(deck);
            this._persistCem(this._ownerAddr);
            // 🎖️ on-chain RonkeVerse/Barracks balansai (async — atėjus push'inam šviežią būseną savininkui)
            chainCounts(this._ownerAddr).then((cc) => {
              const cem2 = this._cem.get(this._ownerAddr);
              if (!cem2 || !cc) return;
              cem2.rv = cc.rv; cem2.wallet = cc.wallet;
              this._persistCem(this._ownerAddr);
              for (const cl of this.clients) {
                const cp = this.state.players.get(cl.sessionId);
                if (cp && String(cp.address || "").trim().toLowerCase() === this._ownerAddr) {
                  try { cl.send("cemetery", { ...this._cemPayload(this._ownerAddr), own: true }); } catch (_) {}
                }
              }
            }).catch(() => {});
          }
        } catch (_) {}
      }
      this._startMatch();
      // ⛏️ Unitai KĄ TIK spawninti (phase='playing') → perimam šviežius lauko/rezervo count'us į _cem ir
      //   IŠKART persistinam — tai offline kasimo bazė iki kito patikimo taško (real-money progresas!).
      try { this._cemAccrue(this._ownerAddr); this._persistCem(this._ownerAddr); } catch (_) {}
      // 🛡 skydo būsena savininkui (pilies panelė rodo „shielded Xm" + REMOVE mygtuką)
      try {
        const _su = Number((this._buildings as any)?.shieldUntil) || 0;
        if (_su > Date.now()) client.send("shield", { until: _su });
      } catch (_) {}
      // 📜 laukiančios raid ataskaitos (kol buvai offline tave puolė) → siunčiam savininkui po start'o
      if (this._ownerAddr) {
        loadRaidReports(this._ownerAddr).then((reps) => {
          if (reps && reps.length) { try { client.send("raid_reports", { reports: reps }); } catch (_) {} }
        }).catch(() => {});
      }
      return;
    }
    // 🤖 ASYNC raid: puolikas prisijungia prie OFFLINE pilies → užkraunam taikinio snapshot'ą → _startMatch
    //    spawnins AI gynėjus TOSE PAČIOSE pozicijose, kur savininkas PALIKO unitus paskutinį kartą.
    if (this._asyncRaid && this.state.phase === "lobby" && this.state.players.size === 1) {
      // 🚫 S-C1: SELF-RAID apsauga (savininkas negali pulti savo paties pilies — 2 tab'ai/zombie sesija/manual).
      if (this._ownerAddr && String(p.address || "").trim().toLowerCase() === this._ownerAddr) {
        this.state.players.delete(client.sessionId); this._decks.delete(client.sessionId);
        console.log(`[F9PvpRoom] 🚫 self-raid (async) atmestas (${this._ownerAddr.slice(0, 10)}…)`);
        throw new Error("SELF_RAID");
      }
      this._retreatMs = 0; this._attackerEngaged = false; this._lastRetreatSec = -1;
      this._buildings = { wallLevel: 1, towerLevel: 1, towers: [] };
      if (this._ownerAddr) { try { const bb = await loadBaseBuildings(this._ownerAddr); if (bb) this._buildings = bb; } catch (_) {} }   // 🏗️ tikri owner lygiai
      if (this._ownerAddr) {
        try {
          this._restoreUnits = await loadBaseUnits(this._ownerAddr);
          this._restoreUnits = await this._chainFilterSnap(this._ownerAddr, this._restoreUnits);   // 🔐 ginа TIK registruoti
        } catch (_) { this._restoreUnits = null; }
        try { await this._loadInjured(this._ownerAddr); } catch (_) {}   // 🏥 sužaloti gynėjai negins
        try { await this._loadCem(this._ownerAddr); this._cemAccrue(this._ownerAddr); } catch (_) {}   // ⚰️ grobiui
      }
      // 🛡 DUTY: SAFE režimo pilis NEPUOLAMA (žaidėjas pasirinko saugumą už lėtesnį kasimą).
      { const _oc = this._cem.get(this._ownerAddr); if (_oc && _oc.duty === "safe") { this.state.players.delete(client.sessionId); this._decks.delete(client.sessionId); throw new Error("SAFE_MODE"); } }
      // 🛡 SHIELD + ⏲ CD (async) PIRMA — „SHIELDED:Xmin" žinutė su countdown'u informatyvesnė nei
      //   NO_DEFENDERS (po 100% wipe galioja abu; 07-12 grąžinta 07-05 tvarka — shield test to tikisi).
      this._checkRaidGate(String(p.address || ""));
      // 🫀 07-14 GRACE (user: „online žaidėjas PRIVALO matyti kovą"): gynėjo heartbeat <90s → jis online
      //   arba tuoj grįš per reconnect — async AI raidas prieš budintį žaidėją DRAUDŽIAMAS. Puolikas
      //   kartoja po kelių sekundžių: jei gynėjas tikrai online → joinOrCreate ras GYVĄ kambarį → LIVE kova;
      //   jei tikrai offline → heartbeat pasens → async praeis. Fee TX NEsudeginamas (guard prieš fee gate).
      const _seenAt = Number((this._buildings as any)?.ownerSeenAt) || 0;
      if (Date.now() - _seenAt < 90_000) {
        console.log(`[F9PvpRoom] 🫀 async raid atmestas — gynėjas ${this._ownerAddr.slice(0, 10)}… matytas prieš ${Math.round((Date.now() - _seenAt) / 1000)}s (grace, tuoj LIVE)`);
        throw new Error("DEFENDER_ONLINE");
      }
      // ⚰️ RAID GATING: pilis be KOVAI PAJĖGIŲ NFT gynėjų NEPUOLAMA (sužaloti ligoninėj nesiskaito —
      //   po pralaimėto raido pilis neaktyvi kol gynėjai pasveiks; jokios farm spiralės)
      const _injSet = this._injuredSet(this._ownerAddr);
      const _hasNftDef = !!(this._restoreUnits && this._restoreUnits.some((s) => s.tokenId && !/^dev/i.test(s.tokenId) && !_injSet.has(s.tokenId)));
      if (!_hasNftDef) {
        console.log(`[F9PvpRoom] 🚫 async raid atmestas — ${this._ownerAddr} neturi kovai pajėgių NFT gynėjų`);
        throw new Error("NO_DEFENDERS");
      }
      // ⚔️💰 RAID FEE (PASKUTINIS gate — atmestas join TX nesudegina): 10 RONKE → treasury, moka TIK puolikas.
      if (raidFeeEnabled()) {
        const _fee = await verifyAndConsumeRaidFee(String(p.address || ""), String(options?.feeTx || ""));
        if (!_fee.ok) {
          this.state.players.delete(client.sessionId); this._decks.delete(client.sessionId); this._reserves.delete(client.sessionId);
          throw new Error("RAID_FEE:" + (_fee.reason || "required") + ":" + RAID_FEE_RONKE);
        }
      }
      console.log(`[F9PvpRoom] 🤖 ASYNC raid on ${this._ownerAddr}: ${this._restoreUnits ? this._restoreUnits.length + " AI defenders" : "no snapshot"}`);
      this._raidAtkAddr = String(p.address || "").trim().toLowerCase();   // 📜 puolikas (async)
      _raidCdMap.set(this._raidAtkAddr + "|" + this._ownerAddr, Date.now());   // ⏲ CD startuoja raidui prasidėjus
      try { client.send("raid_mode", { live: false }); } catch (_) {}     // ℹ️ puolikui: OFFLINE pilis (AI gynėjai)
      this._startMatch();
      return;
    }
    // 🛡🔥 07-14 TAKEOVER (user: „online žaidėjas PRIVALO matyti kovą ir ją išgyventi"): savininkas
    //   grįžo (reconnect/watchdog) per VYKSTANTĮ async raidą ant JO pilies → PERIMA gynybą GYVAI:
    //   AI gynėjai perrašomi jam (owner=sid → cmd komandos veikia), gauna match_start + under_attack.
    //   Jokių „nematomų AI mūšių" žaidėjui esant prie ekrano.
    if (this._asyncRaid && this.state.phase === "playing" && this._ownerAddr && String(p.address || "").trim().toLowerCase() === this._ownerAddr) {
      p.team = DEFENDER_TEAM;
      this._ownerSid = client.sessionId;
      let _taken = 0;
      this.state.units.forEach((u) => { if (u.owner === "AI_DEFENDER") { u.owner = client.sessionId; _taken++; } });
      // siuntimai su delay — klientas handlerius registruoja join'ui rezolvinusis (kitaip žinutės nukristų)
      const _cl = client;
      setTimeout(() => {
        try {
          _cl.send("match_start", { startedAt: this.state.startedAt, seed: this.state.seed, moat: MOAT_CELLS.map((c) => [c.x, c.y]), cap: { x: CAP_X, y: CAP_Y, r: CAP_R }, tp: TP_PADS.map((pp) => [pp.x, pp.y]), retreatZone: RETREAT_ZONE, passages: MOAT_GAP });
          _cl.send("raid_mode", { live: true });
          _cl.send("under_attack", { attacker: this._raidAtkAddr || "", sid: "" });
        } catch (_) {}
      }, 400);
      console.log(`[F9PvpRoom] 🛡🔥 TAKEOVER: savininkas ${this._ownerAddr.slice(0, 10)}… grįžo mid-raid → perėmė ${_taken} gynėjų valdymą`);
      return;
    }
    // 🤖🚫 svetimas bando jungtis į VYKSTANTĮ async raidą (kambarys neberakinamas dėl TAKEOVER) → atmetam
    if (this._asyncRaid && this.state.phase === "playing") {
      this.state.players.delete(client.sessionId); this._decks.delete(client.sessionId); this._reserves.delete(client.sessionId);
      throw new Error("RAID_IN_PROGRESS");
    }
    // 🗡️ RAID: puolikas prisijungia prie JAU GYVOS pilies (home, phase=playing) → IŠKART spawninam jo
    //   squad'ą (vakaruose) + pranešam gynėjui „under_attack". Mūšis jau vyksta, _checkWin aktyvus (≥2).
    if (this._home && this.state.phase === "playing" && team !== DEFENDER_TEAM) {
      // 🚫 S-C1: SELF-RAID apsauga — savininkas negali pulti savo paties GYVOS pilies (antras tab'as / zombie
      //   sesija su pingInterval:0 / manual raidPlayer own addr). Kitaip jo unitai dubliuojasi lauke →
      //   dvigubi injury roll'ai → tas pats tokenId atsiduria injured IR deadUnits (DB korupcija).
      if (this._ownerAddr && String(p.address || "").trim().toLowerCase() === this._ownerAddr) {
        this.state.players.delete(client.sessionId); this._decks.delete(client.sessionId);
        console.log(`[F9PvpRoom] 🚫 self-raid (live) atmestas (${this._ownerAddr.slice(0, 10)}…)`);
        throw new Error("SELF_RAID");
      }
      // 🛡 DUTY: SAFE režimo pilis NEPUOLAMA (net gyva). Owner cem jau įkeltas home join'e.
      { const _oc = this._cem.get(this._ownerAddr); if (_oc && _oc.duty === "safe") { this.state.players.delete(client.sessionId); this._decks.delete(client.sessionId); this._reserves.delete(client.sessionId); throw new Error("SAFE_MODE"); } }
      // 🛡 SHIELD + ⏲ CD (live) PIRMA — „SHIELDED:Xmin" informatyvesnė nei NO_DEFENDERS (07-12, kaip async).
      //   🐛 M3: SHIELDED/RAID_COOLDOWN throw PRIVALO išvalyti ghost player.
      try { this._checkRaidGate(String(p.address || "")); }
      catch (e) { this.state.players.delete(client.sessionId); this._decks.delete(client.sessionId); this._reserves.delete(client.sessionId); throw e; }
      // ⚰️ RAID GATING: gyva pilis be KOVAI PAJĖGIŲ NFT gynėjų NEPUOLAMA (sužaloti nesiskaito)
      const _ownerDeck = this._decks.get(this._ownerSid) || [];
      const _ownInj = this._injuredSet(this._ownerAddr);
      const _healthyDef = _ownerDeck.filter((d) => d.tokenId && !/^dev/i.test(d.tokenId) && !_ownInj.has(d.tokenId)).length;
      if (_healthyDef < 1) {
        this.state.players.delete(client.sessionId); this._decks.delete(client.sessionId); this._reserves.delete(client.sessionId);   // 🐛 M3: išvalom ghost player (kitaip throw palieka size=2 → onLeave→_handlePlayerOut→klaidingas owner _endMatch)
        console.log(`[F9PvpRoom] 🚫 live raid atmestas — savininkas be kovai pajėgių NFT unitų`);
        throw new Error("NO_DEFENDERS");
      }
      // ⚔️💰 RAID FEE (PASKUTINIS gate, kaip async): 10 RONKE → treasury, moka TIK puolikas.
      if (raidFeeEnabled()) {
        const _fee = await verifyAndConsumeRaidFee(String(p.address || ""), String(options?.feeTx || ""));
        if (!_fee.ok) {
          this.state.players.delete(client.sessionId); this._decks.delete(client.sessionId); this._reserves.delete(client.sessionId);
          throw new Error("RAID_FEE:" + (_fee.reason || "required") + ":" + RAID_FEE_RONKE);
        }
      }
      _raidCdMap.set(String(p.address || "").trim().toLowerCase() + "|" + this._ownerAddr, Date.now());
      this._retreatMs = 0; this._attackerEngaged = false; this._lastRetreatSec = -1;   // 🏳️ švarus raidas
      this._spawnSquadFor(p);
      // Puolikas prisijungė PO match_start broadcast'o → siunčiam JAM areną tiesiogiai (kitaip jo klientas
      //   neinicializuoja moat/cap/tp/arenos). Tas pats payload kaip _startMatch.
      client.send("match_start", { startedAt: this.state.startedAt, seed: this.state.seed, moat: MOAT_CELLS.map((c) => [c.x, c.y]), cap: { x: CAP_X, y: CAP_Y, r: CAP_R }, tp: TP_PADS.map((pp) => [pp.x, pp.y]), retreatZone: RETREAT_ZONE, passages: MOAT_GAP });
      this._raidAtkAddr = String(p.address || "").trim().toLowerCase();   // 📜 puolikas (live)
      try { client.send("raid_mode", { live: true }); } catch (_) {}       // ℹ️ puolikui: GYVAS gynėjas
      this.broadcast("under_attack", { attacker: p.address || "", sid: client.sessionId });
      console.log(`[F9PvpRoom] 🗡️ RAIDER joined ${client.sessionId} addr=${p.address} → ${this.state.units.size} units total`);
      return;
    }
    // FFA: surinkus MIN_PLAYERS — pereinam į ready (žaidėjai ruošiasi) + anti-stuck timeris.
    if (this.state.phase === "lobby" && this.state.players.size >= MIN_PLAYERS) {
      this.state.phase = "ready";
      this.broadcast("enough_joined", { count: this.state.players.size });
      if (this._readyTimer) clearTimeout(this._readyTimer);
      this._readyTimer = setTimeout(() => {
        if (this.state.phase === "ready") this._startMatch();
      }, READY_WAIT_MS);
    }
    if (this.state.players.size === this.maxClients) this.broadcast("room_full", {});
  }

  async onLeave(client: Client, consented: boolean) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    // 🏰 HOME savininkas išeina (refresh/uždaro) → IŠSAUGOM pilį dabar (kur paliko), kol unitai dar gyvi.
    if (this._home && client.sessionId === this._ownerSid) {
      try { await this._saveSnapshot("leave"); } catch (_) {}
      // ⛏️ Galutinis kasimo persist: unitai dar state'e (phase='playing', žaidėjas dar map'e) → accrue
      //   perima TIKSLIUS lauko/rezervo count'us — pagal juos skaičiuosis visas offline prikaupimas.
      try { this._cemAccrue(this._ownerAddr); this._persistCem(this._ownerAddr); } catch (_) {}
    }

    // Mūšio metu — leidžiam trumpą reconnect; kitaip žaidėjas iškrinta (forfeit).
    if (this.state.phase === "playing" && !consented) {
      try {
        await this.allowReconnection(client, RECONNECT_WINDOW_S);
        if (p) p.connected = true;
        console.log(`[F9PvpRoom] ${client.sessionId} reconnected`);
        return;
      } catch (_) {
        this._handlePlayerOut(client.sessionId);
        return;
      }
    }
    // 🏳️ M2 fix (07-06): ŠVARUS (consented) išėjimas MŪŠIO metu = irgi FORFEIT — kitaip „užmušk priešus ir
    //   mandagiai išeik su grobiu" apeidavo rage-quit taisyklę (tik unconsented disconnect'as forfeit'ino).
    //   Legalus pabėgimas SU grobiu = retreat zona (ji baigia match'ą → phase 'ended' → čia jau nebe 'playing').
    //   _handlePlayerOut: bones=0 + _forfeit + kills + _checkWin (kita pusė laimi). Po to _flushBones flush'ina 0.
    if (this.state.phase === "playing") this._handlePlayerOut(client.sessionId);
    // Lobby/ready metu — tiesiog pašalinam. 🦴 Prieš tai — sesijos kaulai į banką (solo home dengia).
    this._flushBones(p);
    this.state.players.delete(client.sessionId);
    this._decks.delete(client.sessionId);
    this._reserves.delete(client.sessionId);   // 🪖 išvalom rezervą
    if (this.state.phase === "ready" && this.state.players.size < MIN_PLAYERS) {
      this.state.phase = "lobby";
    }
  }

  private _hospTimer: any = null;   // 🏥 periodinis eilės tikrinimas (pasveikimai gyvame kambaryje)
  async onDispose() {
    if (this._hospTimer) { clearInterval(this._hospTimer); this._hospTimer = null; }
    if (this._idleTimer) { clearInterval(this._idleTimer); this._idleTimer = null; }
    if (this._readyTimer) clearTimeout(this._readyTimer);
    if (this._saveTimer) { clearInterval(this._saveTimer); this._saveTimer = null; }
    // 🦴 likusių žaidėjų sesijos kaulai → bankas (safety net jei onLeave nepataikė)
    this.state.players.forEach((p) => this._flushBones(p));
    // 🏰 Galutinis save prieš sunaikinant kambarį (jei snapshot dar nesuspėjo per onLeave).
    try { await this._saveSnapshot("dispose"); } catch (_) {}
    // ⛏️ Kasimo safety-net: flush'inam prikauptą pot+tick (žaidėjai jau išėję → count'ai NEliečiami,
    //   naudojami paskutiniai žinomi — accrue tik uždaro laiko langą iki dispose momento).
    if (this._home && this._ownerAddr) { try { this._cemAccrue(this._ownerAddr); this._persistCem(this._ownerAddr); } catch (_) {} }
    console.log(`[F9PvpRoom] disposed (${this.roomId})`);
  }

  // ───────────────────────────── lifecycle ─────────────────────────────
  private _handleReady(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p || this.state.phase !== "ready") return;
    p.ready = true;
    const all = [...this.state.players.values()];
    if (all.length >= MIN_PLAYERS && all.every((x) => x.ready)) this._startMatch();
  }

  private _startMatch() {
    if (this.state.phase === "playing") return;
    if (this._readyTimer) { clearTimeout(this._readyTimer); this._readyTimer = null; }

    // ── C3 host-authority RELAY: serveris NEspawnina schema unitų — host kliente sukasi tikras F9.
    //    Tik paskelbiam start su host'u + abiejų žaidėjų squad'ais (host spawnins abu lokaliai). ──
    if (this._relay) {
      const players: any[] = [];
      let hostSid = "";
      this.state.players.forEach((p) => {
        if (p.team === 0) hostSid = p.sessionId;
        const deck = this._decks.get(p.sessionId) || [];
        const squad = deck.length ? deck.map((d) => ({ utype: d.utype, level: d.level, tokenId: d.tokenId }))
                                   : DEFAULT_SQUAD.map((u) => ({ utype: u, level: 0, tokenId: "" }));
        players.push({ sessionId: p.sessionId, team: p.team, address: p.address, squad });
      });
      this._hostSid = hostSid || (this.state.players.size ? [...this.state.players.values()][0].sessionId : "");
      try { this.lock(); } catch (_) {}   // užrakinam: jokių vėlyvų prisijungimų į žaidžiantį 1v1 (zombie-room fix)
      this.state.phase = "playing";
      this.state.gameStarted = true;
      this.state.startedAt = Date.now();
      this.broadcast("match_start", { relay: true, host: this._hostSid, players, seed: this.state.seed });
      console.log(`[F9PvpRoom] RELAY match_start host=${this._hostSid} players=${players.length}`);
      return;
    }

    this._simTime = 0;
    this._lastRetarget = 0;
    this._pending = [];
    this._battleFates.clear();   // ⚔ naujas mūšis → švarūs likimai (2-pusiam settled ekranui)
    this._ai.clear();
    // FAZA D: įėjimo mokestis → self-funding pot (off-chain apskaita; on-chain charge per StakeService).
    const fee = this.state.entryFee;
    this.state.pot = 0;
    if (fee > 0) {
      for (const p of this.state.players.values()) {
        p.contributed = fee;
        this.state.pot += fee;
        this._stake.chargeEntry(p.address, fee);   // NO-OP kol nesukonfig.
      }
      console.log(`[F9PvpRoom] staked match: ${this.state.players.size}×${fee} = pot ${this.state.pot} RONKE`);
    }
    // FFA spawn'inam squad'as į kampus pagal team index, vertikaliai išdėstyti.
    for (const p of this.state.players.values()) this._spawnSquadFor(p);
    // 🤖 ASYNC raid: taikinys offline → spawninam AI gynėjus iš snapshot'o (TOSE PAČIOSE pozicijose, kur paliko).
    if (this._asyncRaid && this._restoreUnits && this._restoreUnits.length) this._spawnAiDefenders(this._restoreUnits);
    // 🏰 Castle siena — sukuriam segmentus (server-authoritative kolizija + HP + siege).
    this._walls = [];
    this.state.walls.clear();
    this._towerCd = {};
    for (const c of PVP_WALL_CELLS) {
      const w = new F9Wall();
      w.x = c.x; w.y = c.y;
      w.tower = !!c.tower;   // 🗼 explicit per-cell zip bokšto flag'as
      // 🏗️ LYGIS iš pastatų konfigūracijos → HP + išvaizda. Siena: L1 medis / L2+ akmuo. Bokštas: towerLevel.
      w.level = w.tower ? 2 : Math.max(1, this._buildings.wallLevel || 1);
      w.hp = w.maxHp = w.tower ? towerHpForLevel(this._buildings.towerLevel || 1) : wallHpForLevel(w.level);
      w.alive = true;
      this.state.walls.set(c.x + "," + c.y, w);
      this._walls.push(w);
    }
    // 🗼 PASTATYTI bokštai (iš _buildings.towers) — žaidėjas pasirinko vietas (build_tower). Set tower=true + HP.
    const _tlvl = this._buildings.towerLevel || 1;
    for (const t of (this._buildings.towers || [])) {
      const seg = this.state.walls.get(WALL_COL + "," + t.y);
      if (seg) { seg.tower = true; seg.maxHp = towerHpForLevel(_tlvl); seg.hp = seg.maxHp; }
    }
    // 1v1: užrakinam. 🏰 HOME: NErakinam (raideriai jungiasi vėliau). 🤖 ASYNC RAID: NErakinam (07-14 —
    //   grįžtantis SAVININKAS privalo patekti į kambarį TAKEOVER'ui; svetimus atmeta onJoin RAID_IN_PROGRESS).
    if (!this._home && !this._asyncRaid) { try { this.lock(); } catch (_) {} }
    this.state.phase = "playing";
    this.state.gameStarted = true;
    this.state.startedAt = Date.now();
    this._initBoneMults();   // 🦴 apskaičiuojam kiekvieno žaidėjo kaulų daugiklį (baseMult + RonkePower) — HUD + gyvas kaupimas
    // 🏰 Pilis nuo starto PRIKLAUSO gynėjui (jo namų pilis) — gynėjui užimti nereikia; tik puolikas užiminėja.
    this.state.capOwner = DEFENDER_TEAM;
    this.broadcast("match_start", { startedAt: this.state.startedAt, seed: this.state.seed, moat: MOAT_CELLS.map((c) => [c.x, c.y]), cap: { x: CAP_X, y: CAP_Y, r: CAP_R }, tp: TP_PADS.map((p) => [p.x, p.y]), retreatZone: RETREAT_ZONE, passages: MOAT_GAP });
    console.log(`[F9PvpRoom] match_start (server-auth) — ${this.state.players.size}p, ${this.state.units.size} units`);
    // 🏰 HOME persistencija — periodinis autosave (10s) tavo pilies layout'o į f9_bases.
    if (this._home && !this._saveTimer) {
      let _hb = 5;   // 🫀 pirmas heartbeat po 10s, toliau kas 60s
      this._saveTimer = setInterval(() => {
        this._saveSnapshot("auto");
        // 🫀 07-14 owner-heartbeat (kas 60s, tik kai savininkas REALIAI prisijungęs) — async-raid grace guard
        if (++_hb % 6 === 0) {
          const op = this.state.players.get(this._ownerSid);
          if (op && op.connected && this._ownerAddr) this._buildingsOp(this._ownerAddr, (b) => { b.ownerSeenAt = Date.now(); });
        }
      }, 10_000);
    }
  }

  // 🏰 Surenka DABARTINĮ gynėjų layout'ą (tik NFT unitai su tokenId) → snapshot DB'ui.
  private _collectSnapshot(): SnapshotUnit[] {
    const out: SnapshotUnit[] = [];
    this.state.units.forEach((u) => {
      if (!u.alive || u.team !== DEFENDER_TEAM || u.owner !== this._ownerSid || !u.tokenId) return;
      out.push({
        tokenId: u.tokenId,
        utype: u.utype,
        level: u.level,
        x: Math.round(u.x * 100) / 100,
        y: Math.round(u.y * 100) / 100,
        hp: Math.round(u.hp),
      });
    });
    return out;
  }

  // 🏰 Išsaugo dabartinę pilies būseną (upsert f9_bases). Nesaugom jei nėra NFT unitų (vengiam ištrint gerą įrašą).
  private async _saveSnapshot(reason: string) {
    if (!this._home || !this._ownerAddr) return;
    if (this.state.players.size >= 2) return;   // 🗡️ vyksta raidas → NEsaugom kovos būsenos; pilis atsistatys į ramią pre-raid layout'ą
    const snap = this._collectSnapshot();
    if (!snap.length) return;
    // ⚡ perf 07-06 DIRTY-CHECK: idle pilis (unitai stovi) rašydavo IDENTIŠKĄ snapshot į Supabase kas 10s —
    //   grynas DB spam. auto-save praleidžiam kai nepakito; dispose/leave VISADA rašom (safety-net).
    const sig = JSON.stringify(snap);
    if (reason === "auto" && sig === this._lastSnapSig) return;
    this._lastSaveAt = Date.now();
    const ok = await saveBaseUnits(this._ownerAddr, snap);   // ⚠️ tik unitai persist; buildings NE (testavimui)
    if (ok) { this._lastSnapSig = sig; console.log(`[F9PvpRoom] 🏰 base saved (${reason}) ${this._ownerAddr}: ${snap.length} units`); }
  }

  // Spawnina VIENĄ unitą nurodytoj (x,y). Bendras helper'is start'ui IR live keitimui.
  //   hpOverride (≥0) — naudojamas RESTORE'inant pilį iš snapshot'o (unitas atsiranda su išsaugotu HP).
  private _spawnOneUnit(p: F9Player, entry: DeckEntry, x: number, y: number, hpOverride?: number) {
    const sp = FFA_SPAWNS[p.team % FFA_SPAWNS.length];
    const u = new F9Unit();
    u.id = `u${++this._uidCounter}`;
    u.owner = p.sessionId;
    u.team = p.team;
    u.utype = entry.utype;
    u.level = entry.level;
    u.tokenId = entry.tokenId;
    u.x = Math.max(1, Math.min(ARENA_W - 1, x));
    u.y = Math.max(1, Math.min(ARENA_H - 1, y));
    u.tx = u.x; u.ty = u.y;
    u.maxHp = BASE_HP[entry.utype] || 8;
    u.hp = (typeof hpOverride === "number" && hpOverride > 0) ? Math.min(u.maxHp, hpOverride) : u.maxHp;
    u.faceDx = sp.face;
    u.alive = true;
    u.cmd = "idle";
    this.state.units.set(u.id, u);
    this._ai.set(u.id, { order: "hold", lastAtk: 0, engageId: "", kills: 0 });
  }

  // 🪖 REINFORCEMENT: aktyvus unitas krito → jei žaidėjas turi rezervą (dekas >12), įleidžiam vieną prie savo
  //   krašto → laiko ≤MAX_ACTIVE aktyvių. Didesnis dekas = daugiau pastiprinimų = ilgesnis atsparumas.
  private _tryReinforce(fallen: F9Unit) {
    const pool = this._reserves.get(fallen.owner);
    if (!pool || !pool.length) return;
    const p = this.state.players.get(fallen.owner);
    if (!p) return;                                    // tik realūs žaidėjai (AI/stress rezervo neturi)
    // 🔒 07-04 ANTI-DUBLIS: praleidžiam rezervo įrašus, kurių tokenId JAU yra lauke (gyvas AR kritęs
    //   šiame mūšyje) — kitaip tas pats NFT įeitų antrą kartą (dvigubas injury roll, „prisikėlimas").
    const onField = new Set<string>();
    this.state.units.forEach((u) => { if (u.owner === fallen.owner && u.tokenId) onField.add(u.tokenId); });
    let entry = pool.shift()!;                         // FIFO
    while (entry.tokenId && onField.has(entry.tokenId)) {
      if (!pool.length) return;                        // visas rezervas — dubliai → nieko neįleidžiam
      entry = pool.shift()!;
    }
    const sp = FFA_SPAWNS[p.team % FFA_SPAWNS.length];
    this._spawnOneUnit(p, entry, sp.x, sp.y);          // pastiprinimas ateina prie savo bazės krašto
    this.broadcast("reinforce", { owner: fallen.owner, team: p.team, left: pool.length });
  }

  // ── 🏥 LIGONINĖ (EILĖS MODELIS v2) ──────────────────────────────────────
  // Gydosi TIK eilės galva (HEAL_MS=1h); kiti laukia. hospStart = kada galva pradėjo gydytis.
  // Užkrauna wallet'o ligoninę (kešuoja; persist f9_bases.buildings.{injured,hospStart}).
  private async _loadInjured(addr: string): Promise<InjuredUnit[]> {
    addr = (addr || "").trim().toLowerCase();
    if (!addr) return [];
    // 🛡 S-M5 (CRIT-1 fix): early-return TIK jei SĖKMINGAI užkrauta. Jei _injured egzistuoja bet _hospLoaded=false
    //   (poison: _rollInjury/_recordDeath sukūrė įrašą kol load'as failino) → NEpraleidžiam, bandom vėl užkrauti
    //   (merge žemiau), kad persistas atsigautų (kitaip būtų amžinai užblokuotas visai kambario sesijai).
    if (this._injured.has(addr) && this._hospLoaded.has(addr)) { this._pruneHosp(addr); return this._injured.get(addr)!.q; }
    let q: InjuredUnit[] = [], starts: number[] = [], durs: number[] = [], lvl = 1;
    try {
      const b = await loadBaseBuildings(addr);   // 🛡 S-M5: meta klaidą (ne null) esant DB triktimi
      q = b?.injured || [];
      lvl = b?.hospLevel || 1;
      // 💀 mirusieji — kartu su ligonine (tas pats buildings load). MERGE (ne overwrite): jei mirtis įrašyta
      //   PRIEŠ sėkmingą load'ą (outage → _recordDeath sukūrė nepilną set'ą), neprarandam DB istorijos.
      const ds = this._dead.get(addr) || new Set<string>();
      for (const t of (((b as any)?.deadUnits) || [])) ds.add(String(t));
      this._dead.set(addr, ds);
      // 🛡 CRIT-1: jei poison metu (outage) į _injured pateko sužalotų, kurių DB neturi — PRIJUNGIAM juos
      //   prie DB eilės (kitaip retry perrašytų in-memory sužalojimus DB reikšme ir jie prapultų).
      const _prev = this._injured.get(addr);
      if (_prev && _prev.q.length) {
        const _dbIds = new Set(q.map((e) => String(e.tokenId)));
        for (const e of _prev.q) if (!_dbIds.has(String(e.tokenId))) q.push(e);
      }
      starts = Array.isArray(b?.hospStarts) && b!.hospStarts!.length ? b!.hospStarts!.slice() : (b?.hospStart ? [b.hospStart] : []);
      durs = Array.isArray((b as any)?.hospDurs) ? ((b as any).hospDurs as number[]).slice() : [];
    } catch (_) {
      return [];   // 🛡 S-M5: DB triktis → NEcache'inam tuščio (kitaip kitas _persistInjured perrašytų injured=[]+deadUnits=[]); _hospLoaded lieka NEnustatytas → persist blokuotas; kitas kvietimas bandys iš naujo
    }
    const _sl = Math.min(this._hospSlots(lvl), q.length);
    starts = starts.slice(0, _sl); durs = durs.slice(0, starts.length);
    const hh = { q, starts, durs, lvl };
    while (hh.durs.length < hh.starts.length) hh.durs.push(this._hospFreeDur(hh));   // legacy — priskiriam lovas
    this._hospPrioritize(addr, hh);   // ⚔️ deko unitai laukia PRIEŠ senus išrotuotus
    this._hospFillBeds(hh, Date.now());
    this._injured.set(addr, hh);
    this._hospLoaded.add(addr);   // ✅ SĖKMINGAI užkrauta → nuo dabar _persistInjured leidžiamas
    this._pruneHosp(addr);
    return this._injured.get(addr)!.q;
  }
  // LAZY pasveikimas: galva baigė gydytis → iškrenta, kita pradeda TĄ AKIMIRKĄ (grandinė).
  // Grąžina pasveikusius + praneša savininkui (jei kambaryje) + persistina jei kas pasikeitė.
  private _pruneHosp(addr: string): InjuredUnit[] {
    addr = (addr || "").trim().toLowerCase();
    const h = this._injured.get(addr);
    if (!h) return [];
    const now = Date.now();
    const recovered: InjuredUnit[] = [];
    this._hospFillBeds(h, now);   // normalizacija (nauji slotai/legacy — startuoja dabar)
    // grandinė: pasveikęs atlaisvina LOVĄ tą akimirką — laukiantis gauna TĄ PAČIĄ lovą (jos trukmę) nuo tos akimirkos.
    for (;;) {
      let ri = -1, rf = Infinity;
      for (let i = 0; i < h.starts.length; i++) {
        const f = h.starts[i] + (h.durs[i] || this._hospHealMs(h.lvl));
        if (f <= now && f < rf) { ri = i; rf = f; }   // anksčiausiai pasveikęs pirmas (teisinga grandinė)
      }
      if (ri < 0) break;
      recovered.push(h.q.splice(ri, 1)[0]);
      h.starts.splice(ri, 1); h.durs.splice(ri, 1);
      this._hospFillBeds(h, rf);
    }
    if (recovered.length) {
      this._persistInjured(addr);
      // ⚔️ AUTO-DEPLOY (07-04 user): pasveikęs unitas GRĮŽTA į garnizoną, jei tai SAVININKO namai ir RAMYBĖ
      //   (raido metu negrįžta — įeis per rezervą arba po mūšio). _deployReady dedupe'ina + laiko MAX_ACTIVE.
      if (this._home && addr === this._ownerAddr && this.state.players.size <= 1 && this.state.phase === "playing") {
        let op: F9Player | undefined;
        this.state.players.forEach((pp) => { if (String(pp.address || "").trim().toLowerCase() === addr) op = pp; });
        if (op) {
          const n = this._deployReady(op);
          if (n) console.log(`[F9PvpRoom] ⚔️ auto-deploy +${n} pasveikusių → garnizonas (${addr.slice(0, 10)}…)`);
        }
      }
      for (const c of this.clients) {
        const cp = this.state.players.get(c.sessionId);
        if (!cp || String(cp.address || "").trim().toLowerCase() !== addr) continue;
        for (const r of recovered) { try { c.send("recovered", { tokenId: r.tokenId, utype: r.utype, level: r.level }); } catch (_) {} }
        try { c.send("hospital", this._hospPayload(addr)); } catch (_) {}
      }
      console.log(`[F9PvpRoom] 🏥 pasveiko ${recovered.length} (${addr.slice(0, 10)}…)`);
    }
    return recovered;
  }
  // Kliento payload: eilė su prognozuojamu pasveikimo laiku (galva tiksli, kiti — jei eilė nesikeis).
  private _hospPayload(addr: string) {
    addr = (addr || "").trim().toLowerCase();
    const h = this._injured.get(addr);
    const now = Date.now();
    const _lvl = h?.lvl || (this._home && addr === this._ownerAddr ? (this._buildings.hospLevel || 1) : 1);
    const etas = h ? this._hospEtas(h) : [];
    const qAll = h?.q || [];
    // Rodom VISUS sužalotus (2026-07-05 user: „bless bet kurį → sveikas → gali vėl registruoti į deką").
    //   Ne-deko unito bless nesukuria phantom'o — `_deployReady` deploy'ina tik deko unitus; ne-deko tiesiog
    //   pasveiksta ir laukia MANAGE DECK'e (susigrąžinimo mechanika). Griežto filtro NEbereikia.
    const _cd = chainDeckCached(addr);   // 🏥⚔️ inDeck vėliava — panelė atskiria „deke" vs „seni išrotuoti"
    const list = qAll.map((i, idx) => ({
      tokenId: i.tokenId, utype: i.utype, level: i.level,
      healing: idx < (h?.starts.length || 0),
      eta: (etas[idx] && etas[idx].eta) || now,
      dur: (etas[idx] && etas[idx].dur) || this._hospHealMs(_lvl),   // šio unito lovos trukmė (progress barui)
      inDeck: _cd && _cd.size ? _cd.has(String(i.tokenId)) : true,   // cd nepasiekiama → nediskriminuojam
    }));
    // ⚔️ READY (07-04 deploy mechanika): deko unitai NE ligoninėj ir NE lauke → gali būti deploy'inti.
    //   + onField (tokenId'ai DABAR stovintys pilies lauke / puolime) ir reserve (deko sveiki, ne lauke) —
    //   klientas juos rodo kaip „🛡 ON FIELD" / „🪖 RESERVE" (07-06 user: nematyti kurie realiai kaunasi).
    let ready = 0;
    let onFieldArr: string[] = [];
    let reserveArr: string[] = [];
    this.state.players.forEach((pp) => {
      if (String(pp.address || "").trim().toLowerCase() !== addr) return;
      const deck = this._decks.get(pp.sessionId) || [];
      const onField = new Set<string>();
      this.state.units.forEach((u) => { if (u.owner === pp.sessionId && u.tokenId && u.alive) onField.add(u.tokenId); });
      const inj = new Set(qAll.map((i) => i.tokenId));
      const dead = this._deadSet(addr);   // 🐛 L1 fix: reserve/ready NEįskaito mirusių (kaip _deployReady)
      onFieldArr = Array.from(onField);
      reserveArr = deck.filter((e) => e.tokenId && !inj.has(e.tokenId) && !dead.has(e.tokenId) && !onField.has(e.tokenId)).map((e) => e.tokenId);
      ready = reserveArr.length;
    });
    // 🔒 M6 fix (07-12, sync auditas): stale = sužaloti NE dabartiniame deke (seni išrotuoti) — klientas
    //   `e.stale` skaito nuo 07-06 (fieldN formulei), bet serveris niekada nesiuntė → visada 0.
    const stale = list.filter((i) => !i.inDeck).length;
    // ⚡🔵 instaReady = ar ⚡ BLESS instant heal DABAR veiks (server-auth gate'ai: TIK savoj pilyje + NE raido metu).
    //   Klientas rodo Bless mygtuką tik kai true → nebėra „paspaudžiau per siege, nepagijo" (07-12 user).
    const instaReady = this._home && addr === this._ownerAddr && this.state.players.size <= 1;
    return { list, now, healMs: this._hospHealMs(_lvl), ready, hospLevel: _lvl, slots: this._hospSlots(_lvl), onField: onFieldArr, reserve: reserveArr, stale, instaReady };
  }

  // ⚔️ DEPLOY (07-04 user mechanika): paruošti (pasveikę/nespawninti) deko unitai → garnizono 2×6 slotai.
  //   Server-auth. Laukas ribojamas MAX_ACTIVE; netilpę → rezervas (reinforcement). Anti-dublis:
  //   tokenId jau lauke (gyvas AR kritęs šiame mūšyje) NEdeploy'inamas. Grąžina kiek įleista.
  private _deployBusy = false;   // anti-recursion (per _injuredSet→_pruneHosp→auto-deploy grandinę)
  private _deployReady(p: F9Player): number {
    if (this._deployBusy) return 0;
    this._deployBusy = true;
    try {
      const deck = this._decks.get(p.sessionId) || [];
      const injured = this._injuredSet(p.address);
      const dead = this._deadSet(p.address);   // 💀
      const onField = new Set<string>();
      let alive = 0;
      this.state.units.forEach((u) => {
        if (u.owner !== p.sessionId) return;
        if (u.tokenId) onField.add(u.tokenId);
        if (u.alive) alive++;
      });
      const ready = deck.filter((e) => e.tokenId && !injured.has(e.tokenId) && !dead.has(e.tokenId) && !onField.has(e.tokenId));
      let added = 0;
      for (const entry of ready) {
        if (alive + added >= MAX_ACTIVE) break;
        const s = homeFormSlot(alive + added);
        this._spawnOneUnit(p, entry, s.x, s.y);
        added++;
      }
      // rezervas = paruošti, netilpę į lauką (reinforcement eilė)
      this._reserves.set(p.sessionId, ready.slice(added));
      return added;
    } finally { this._deployBusy = false; }
  }
  // Šiuo metu ligoninėje esančių tokenId aibė (visa eilė — ir gydomi, ir laukiantys).
  private _injuredSet(addr: string): Set<string> {
    addr = (addr || "").trim().toLowerCase();
    this._pruneHosp(addr);
    return new Set((this._injured.get(addr)?.q || []).map((i) => i.tokenId));
  }
  // Persist: load-modify-write į f9_bases.buildings (NE this._buildings — tas resetintas Lv1 ir
  //   perrašytų žaidėjo išsaugotus lygius). Fire-and-forget.
  // 🔒 S-C2: VISI <addr> buildings-eilutės load-modify-write'ai PRIVALO eiti per VIENĄ eilę
  //   (boneBankOp raktas "<addr>#buildings"), kitaip lygiagretūs injured/cem/structures/shield rašymai
  //   perrašo vienas kitą (lost update — pvz. paskutinio kill'o injury/permadeath dingsta prieš _endMatch cem save).
  //   Load'ina ŠVIEŽIAI eilėj (mato ankstesnius rašymus), mutate liečia TIK savo laukus → jokio clobber;
  //   loadBaseBuildings meta klaidą esant DB triktimi → save PRALEIDŽIAMAS (nerašom default'ų ant realių lygių).
  private _buildingsOp(addr: string, mutate: (b: BaseBuildings) => void): Promise<void> {
    addr = (addr || "").trim().toLowerCase();
    if (!addr) return Promise.resolve();
    return boneBankOp(addr + "#buildings", async () => {
      let b = await loadBaseBuildings(addr);
      if (!b) b = { wallLevel: 1, towerLevel: 1, towers: [] };
      mutate(b);
      await saveBaseBuildings(addr, b);
    }).catch(() => {});
  }
  private _hospRetry = new Set<string>();   // 🛡 CRIT-1: in-flight poison-recovery reload guard (nespam'inam load'ų)
  private _persistInjured(addr: string) {
    addr = (addr || "").trim().toLowerCase();
    if (!this._hospLoaded.has(addr)) {
      // 🛡 S-M5 (CRIT-1): NEsėkmingai užkrauta (outage) → nepersist'inam (kitaip injured=[]+deadUnits=[] perrašytų
      //   realius). BET bandom vėl užkrauti (guard'inta), o pavykus — re-persist'inam (kad async raid'e, kur
      //   hospital_get nekviečiamas, permadeath/sužalojimas vis tiek išsisaugotų DB atsigavus).
      if (addr && !this._hospRetry.has(addr)) {
        this._hospRetry.add(addr);
        this._loadInjured(addr)
          .then(() => { this._hospRetry.delete(addr); if (this._hospLoaded.has(addr)) this._persistInjured(addr); })
          .catch(() => { this._hospRetry.delete(addr); });
      }
      return;
    }
    const h = this._injured.get(addr);
    const q = (h?.q || []).slice(), starts = (h?.starts || []).slice(), durs = (h?.durs || []).slice();
    const dead = Array.from(this._deadSet(addr));   // snapshot ČIA (eilė vykdys vėliau)
    void this._buildingsOp(addr, (b) => {
      b.injured = q;
      b.hospStart = starts[0] || 0;   // legacy laukas (seni klientai/migracija)
      b.hospStarts = starts;
      (b as any).hospDurs = durs;   // per-lovos trukmės (v3.1)
      // 💀 permadeath — UNION su ką tik įkeltu b.deadUnits (ne overwrite): lygiagretus kambarys (2 async raidai
      //   ant to paties owner) NEperrašo kito kambario kill'ų. Permadeath tik AUGA → union teisinga.
      const _dbDead = Array.isArray((b as any).deadUnits) ? (b as any).deadUnits.map((t: any) => String(t)) : [];
      (b as any).deadUnits = Array.from(new Set([..._dbDead, ...dead]));
    });
  }
  // 🏗️ Persist sienos/bokštų lygius (per _buildingsOp eilę — neclobberina injured/cem laukų). Fire-and-forget.
  private _persistStructures(addr: string) {
    addr = (addr || "").trim().toLowerCase();
    if (!addr) return;
    const wallLevel = this._buildings.wallLevel || 1, towerLevel = this._buildings.towerLevel || 1;
    const towers = (this._buildings.towers || []).map((t) => ({ y: t.y, level: t.level }));
    const hospLevel = this._buildings.hospLevel || 1;
    void this._buildingsOp(addr, (b) => {
      b.wallLevel = wallLevel; b.towerLevel = towerLevel; b.towers = towers; b.hospLevel = hospLevel;
    });
  }
  // 🦴 Upgrade kaina iš žaidėjo BANKO (f9_bases <addr>#bones). false = neužteko/klaida → klientui 'upgrade_fail'.
  private _upgBusy = false;   // anti double-spend guard (du klik'ai kol laukiam banko)
  private async _spendBones(client: Client, cost: number, what: string): Promise<boolean> {
    if (UPG_FREE || cost <= 0) return true;
    const p = this.state.players.get(client.sessionId);
    const addr = String(p?.address || "").trim().toLowerCase();
    if (!addr) { try { client.send("upgrade_fail", { reason: "wallet", cost, what }); } catch (_) {} return false; }
    try {
      // 🔒 boneBankOp — serializuota su flush/grobiu/swap (kitaip read-modify-write race pames kaulus)
      return await boneBankOp(addr, async () => {
        const bank = await loadBoneBank(addr);
        const have = Math.round((bank.bones || 0) * 10) / 10;
        if (have < cost) { try { client.send("upgrade_fail", { reason: "bones", cost, have, what }); } catch (_) {} return false; }
        bank.bones = Math.round((have - cost) * 10) / 10;
        const ok = await saveBoneBank(addr, bank);
        if (!ok) { try { client.send("upgrade_fail", { reason: "save", cost, what }); } catch (_) {} return false; }
        try { client.send("bones_spent", { what, cost, bank: bank.bones }); } catch (_) {}
        console.log(`[F9PvpRoom] 🦴 -${cost} (${what}) → bank ${bank.bones} (${addr})`);
        return true;
      });
    } catch (_) { try { client.send("upgrade_fail", { reason: "save", cost, what }); } catch (_) {} return false; }
  }
  // Kritusio NFT unito likimas: 90% → ligoninės eilės GALAS, 10% → tikra mirtis.
  private _rollInjury(addr: string, u: F9Unit): { fate: "injured" | "dead"; eta: number; queuePos: number } {
    addr = (addr || "").trim().toLowerCase();
    if (Math.random() >= INJURY_CHANCE) { this._recordDeath(addr, u.tokenId, u.utype, u.level || 0); return { fate: "dead", eta: 0, queuePos: -1 }; }
    this._pruneHosp(addr);
    let h = this._injured.get(addr);
    if (!h) { h = { q: [], starts: [], durs: [], lvl: (this._home && addr === this._ownerAddr ? (this._buildings.hospLevel || 1) : 1) }; this._injured.set(addr, h); }
    h.q = h.q.filter((i) => i.tokenId !== u.tokenId);
    h.q.push({ tokenId: u.tokenId, utype: u.utype, level: u.level || 0 });
    this._hospPrioritize(addr, h);       // ⚔️ naujas (deko) sužalotasis lenkia senus išrotuotus eilėje
    this._hospFillBeds(h, Date.now());   // laisva lova → gydymas iškart (greičiausia lova pirmiau)
    this._persistInjured(addr);
    const pos = h.q.findIndex((i) => i.tokenId === u.tokenId);
    const _etas = this._hospEtas(h);
    return { fate: "injured", eta: (_etas[pos] && _etas[pos].eta) || Date.now() + this._hospHealMs(h.lvl), queuePos: pos };
  }

  // ── ⚰️ KAPINĖS — pasyvi kaulų generacija ─────────────────────────────────
  private _nftCountOf(deck: DeckEntry[]): number {
    return deck.filter((d) => d.tokenId && !/^dev/i.test(d.tokenId)).length;
  }
  // 🎖️ VIENOS RŪŠIES GARNIZONAS (user 07-04): jei deke yra bent 1 TIKRAS NFT unitas —
  //   nemokami/test unitai (tuščias tokenId arba 'dev...') IŠNYKSTA. Fake tik kol NĖRA NFT.
  private _pureDeck(deck: DeckEntry[]): DeckEntry[] {
    const hasNft = deck.some((d) => d.tokenId && !/^dev/i.test(d.tokenId));
    return hasNft ? deck.filter((d) => d.tokenId && !/^dev/i.test(d.tokenId)) : deck;
  }
  private async _loadCem(addr: string) {
    addr = (addr || "").trim().toLowerCase();
    if (!addr) return null;
    try { await chainDeck(addr); } catch (_) {}   // 🔐 sušildo chain cache _injuredDrain'ui (TTL 120s — pigu)
    if (this._cem.has(addr)) return this._cem.get(addr)!;
    let c = { pot: 0, tick: 0, power: 0, nft: 0, rv: 0, wallet: 0, ramp: 0, mpot: 0, mcp: MINE_SIEGE_STEP, mfield: 0, mres: 0, duty: "online" as "online" | "safe", gated: false };
    let _ok = true;
    try {
      const b = await loadBaseBuildings(addr);   // 🛡 S-M5: meta klaidą esant DB triktimi
      if (b) c = { pot: Math.max(0, b.cemPot || 0), tick: b.cemTick || 0, power: Math.max(0, b.cemPower || 0), nft: Math.max(0, b.cemNft || 0), rv: Math.max(0, b.cemRv || 0), wallet: Math.max(0, b.cemWallet || 0), ramp: b.cemRamp || 0, mpot: Math.max(0, b.minePot || 0), mcp: Math.max(MINE_SIEGE_STEP, b.mineCheckpoint || MINE_SIEGE_STEP), mfield: Math.max(0, b.mineField || 0), mres: Math.max(0, b.mineReserve || 0), duty: (b.dutyMode === "safe" ? "safe" : "online"), gated: !!b.mineGated };
    } catch (_) { _ok = false; }
    if (!_ok) return c;   // 🛡 S-M5: DB triktis → NEcache'inam (kitaip _persistCem perrašytų pot=0); _cem lieka tuščias → _persistCem praleidžia; kitas kvietimas bandys iš naujo
    if (!c.ramp) c.ramp = c.tick || Date.now();   // migracija — momentum startuoja nuo paskutinio žinomo taško
    this._cem.set(addr, c);
    return c;
  }
  // 🏥→⚰️ SUŽALOTI unitai NESISKAITO (user 2026-07-03): power/eligibility tik iš KOVAI PAJĖGIŲ
  //   registruotų unitų — puolikas, sunaikinęs gynėjus, numuša aukos generaciją kol tie pasveiks.
  private _injuredDrain(addr: string): { count: number; power: number } {
    addr = (addr || "").trim().toLowerCase();
    const h = this._injured.get(addr);
    // 🔐 CHAIN TIESA (07-04): drain'ina TIK dabartiniame registruotame deke esantys sužalotieji.
    //   Seni IŠROTUOTI tokenai ligoninėj nei prideda power, nei atima (bug: 24reg−16senų=8 → gen OFF).
    //   cd=null (chain nepasiekiama) arba tuščia registracija (dev wallet) → senas elgesys (visi).
    const cd = chainDeckCached(addr);
    let count = 0, power = 0;
    for (const i of (h?.q || [])) {
      if (cd && cd.size > 0 && !cd.has(String(i.tokenId))) continue;
      count++; power += Math.max(0, (i.level || 0) - 1) * ronkePowerRate(i.utype);
    }
    return { count, power };
  }
  // Kovai pajėgūs: registruoti MINUS ligoninėje gulintys.
  private _cemHealthy(addr: string): { nft: number; power: number; reg: number; hosp: number } {
    const c = this._cem.get((addr || "").trim().toLowerCase());
    if (!c) return { nft: 0, power: 0, reg: 0, hosp: 0 };
    const d = this._injuredDrain(addr);
    return { nft: Math.max(0, c.nft - d.count), power: Math.max(0, c.power - d.power), reg: c.nft, hosp: d.count };
  }
  // 🎖️ „pilnavertis žaidėjas": A (RonkeVerse + 10 SVEIKŲ reg) ARBA B (12 SVEIKŲ reg + 69 wallete)
  // 07-04 (user): sužalotas = NEAKTYVUS → NEsiskaito (kaip miręs). Slenkstis naudoja hl.nft (SVEIKUS,
  //   sužalotus atėmus). Pagijus grįžta savaime per _pruneHosp. (committed-gate atšauktas — user nepatiko.)
  private _cemEligible(addr: string): boolean {
    const c = this._cem.get((addr || "").trim().toLowerCase());
    if (!c) return false;
    const hl = this._cemHealthy(addr);
    return (c.rv >= CEM_REQ_A_RV && hl.nft >= CEM_REQ_A_REG) || (hl.nft >= CEM_REQ_B_REG && c.wallet >= CEM_REQ_B_WALLET);
  }
  // FORMULĖ: 0.5 + 0.25×(healthyPower/100) bones/h, power capped @ 4000 → max 10.5/h
  private _cemRate(addr: string): number {
    if (!this._cemEligible(addr)) return 0;
    const hl = this._cemHealthy(addr);
    return CEM_BASE_PER_H + Math.min(hl.power, CEM_POWER_CAP) * CEM_POWER_PER_H;
  }
  // ⚔ LAUKO/rezervo skaičiai (kasimo lauko-frakcijai). Naudoja _mineRate + _cemPayload.
  private _fieldCounts(addr: string): { onField: number; reserve: number } {
    addr = (addr || "").trim().toLowerCase();
    let onFieldN = 0, reserveN = 0;
    this.state.players.forEach((pp) => {
      if (String(pp.address || "").trim().toLowerCase() !== addr) return;
      const deck = this._decks.get(pp.sessionId) || [];
      const onField = new Set<string>();
      this.state.units.forEach((u) => { if (u.owner === pp.sessionId && u.tokenId && u.alive) onField.add(u.tokenId); });
      const inj = new Set((this._injured.get(addr)?.q || []).map((i) => i.tokenId));
      const dead = this._deadSet(addr);
      onFieldN = onField.size;
      reserveN = deck.filter((e) => e.tokenId && !inj.has(e.tokenId) && !dead.has(e.tokenId) && !onField.has(e.tokenId)).length;
    });
    return { onField: onFieldN, reserve: reserveN };
  }
  // ⛏️💰 RONKE MINING rate formulė (EFEKTYVUS RONKE/h — su fail vidurkiu). base tik jei ≥1 lauke; power×lauko-frakcija; ×shield.
  //   Skaičiuojama iš PIRMINIŲ duomenų (power/eligibility/injured/shield — visi persistinti), o lauko/rezervo
  //   count'ai paduodami parametrais: gyvi (_fieldCounts) sesijoj arba persistinti (c.mfield/mres) offline —
  //   taip offline rate pats save koreguoja (gyjantys unitai, pasibaigęs skydas) ir nėra „užšaldytos rate" exploit'o.
  // ⛏️🗡 „Sandėlio luba" = dabartinis siege checkpoint (pot kaupiasi iki čia → STOJA kol atliks PvP mūšį). Abu režimai.
  //   Backstop MINE_CAP (kad checkpoint niekada neišbėgtų). Po withdraw resetinasi į MINE_SIEGE_STEP.
  private _mineCap(addr: string): number {
    const c = this._cem.get((addr || "").trim().toLowerCase());
    return Math.min(MINE_CAP, (c && c.mcp) ? c.mcp : MINE_SIEGE_STEP);
  }
  // ⛏️ RONKE Power → RONKE/h su „knee": pirmi 250 power ×0.1, virš 250 ×0.05 (iki whale cap 4000).
  private _minePowerTerm(hl: number): number {
    const capped = Math.min(hl, MINE_POW_CAP);
    const below = Math.min(capped, MINE_POWER_KNEE) * MINE_POWER_H;
    const above = Math.max(0, capped - MINE_POWER_KNEE) * MINE_POWER_H * MINE_POWER_KNEE_MULT;
    return below + above;
  }
  private _mineRateFrom(addr: string, onField: number, reserve: number): number {
    if (!this._cemEligible(addr)) return 0;
    const c = this._cem.get((addr || "").trim().toLowerCase());
    // ⛏️🗡 SIEGE CHECKPOINT: pasiekus mcp (kas 200) kasimas SUSTOJA (0) kol atliks 1 PvP mūšį. ABU režimai (SAFE ir DUTY).
    if (c && c.gated) return 0;
    const hl = this._cemHealthy(addr).power;
    const reg = onField + reserve;
    const frac = reg > 0 ? onField / reg : (onField > 0 ? 1 : 0);
    const powerTerm = this._minePowerTerm(hl);   // ⛏️ knee @250
    const raw = (frac > 0 ? MINE_BASE_H : 0) + powerTerm * frac;   // 0 lauke → 0
    const shielded = addr === this._ownerAddr && (Number((this._buildings as any)?.shieldUntil) || 0) > Date.now();
    const dutyMult = (c && c.duty === "safe") ? DUTY_SAFE_MULT : DUTY_ONLINE_MULT;   // ⚔️ online 2× / safe 1.2×
    return raw * (shielded ? 0.5 : 1) * MINE_SUCCESS * dutyMult;   // × success × duty
  }
  // Gyva rate (kambario state) — patikima TIK kai unitai spawninti (phase='playing').
  private _mineRate(addr: string): number {
    const { onField, reserve } = this._fieldCounts(addr);
    return this._mineRateFrom(addr, onField, reserve);
  }
  // Offline-safe rate — iš paskutinių ŽINOMŲ (persistintų) lauko/rezervo count'ų.
  private _mineRateStored(addr: string): number {
    const c = this._cem.get((addr || "").trim().toLowerCase());
    if (!c) return 0;
    return this._mineRateFrom(addr, c.mfield || 0, c.mres || 0);
  }
  // LAZY prikaupimas nuo paskutinio tick (offline-safe). Passive BONES IŠJUNGTA (RONKE mining pakeičia); accrue TIK mpot (RONKE).
  // ⛏️ Prikaupiam pagal _mineRateStored (persistinti mfield/mres count'ai), NE pagal gyvą lauko būseną:
  //   prisijungimo momentu (prieš _startMatch) unitai dar nespawninti → _fieldCounts=0 → frac=0 → rate=0,
  //   o tick vis tiek resetuodavosi — visas OFFLINE langas dingdavo (žmonių rewardai!). Gyvus count'us
  //   perimam TIK kai lauko būsena patikima: phase='playing' + tas addr yra kambaryje kaip žaidėjas.
  private _cemAccrue(addr: string) {
    addr = (addr || "").trim().toLowerCase();
    const c = this._cem.get(addr);
    if (!c) return;
    this._pruneHosp(addr);   // pasveikę grįžta į rikiuotę → jų power vėl skaičiuojasi
    const now = Date.now();
    const mrate = this._mineRateStored(addr);
    const _cap = this._mineCap(addr);   // ⛏️🗡 dabartinis siege checkpoint (pot čia stoja)
    if (mrate > 0 && c.tick > 0 && now > c.tick) {
      c.mpot = Math.min(_cap, (c.mpot || 0) + mrate * (now - c.tick) / 3600000);
      c.mpot = Math.round(c.mpot * 1000) / 1000;
    }
    // ⛏️🗡 SIEGE CHECKPOINT: pasiekus checkpoint (kas 200) → gated=true → kasimas sustoja iki PvP mūšio. ABU režimai.
    if (!c.gated && (c.mpot || 0) >= _cap - 0.01) { c.gated = true; console.log(`[F9PvpRoom] 🗡 kasimas STOP (checkpoint ${_cap}, ${c.duty}) — ${addr.slice(0, 10)}… reikia 1 PvP mūšio`); }
    c.tick = now;
    if (this.state.phase === "playing") {
      let present = false;
      this.state.players.forEach((pp) => { if (String(pp.address || "").trim().toLowerCase() === addr) present = true; });
      if (present) { const fc = this._fieldCounts(addr); c.mfield = fc.onField; c.mres = fc.reserve; }
    }
    this._confirmMineWithdraw(addr);   // ⛏️💸 laukiančio withdrawal patikra (async; tik jei voucher deadline praėjo)
  }
  // Laukiantis withdrawal: po deadline (30min) tikrinam ar TX nusėdo. NE → re-credit pot (nekartojam faucet lockout bug'o).
  private _confirmMineWithdraw(addr: string) {
    const pend = this._minePend.get(addr);
    if (!pend) return;
    if (Date.now() - pend.at < 30 * 60 * 1000) return;   // dar galiojimo lange — leidžiam pateikti
    this._minePend.delete(addr);   // pašalinam iškart (kad nekartotų check'o); grąžinsim jei RPC nepavyks
    (async () => {
      try {
        const used = await isMineNonceUsed(pend.nonce);
        if (used === false) {   // TX NEnusėdo → RE-CREDIT pot (RONKE realiai negautas)
          await this._loadCem(addr);
          const c = this._cem.get(addr);
          if (c) {
            c.mpot = Math.round(Math.min(MINE_CAP, (c.mpot || 0) + pend.amt) * 1000) / 1000;
            c.mcp = Math.min(MINE_CAP, Math.max(c.mcp || MINE_SIEGE_STEP, Math.ceil((c.mpot || 0) / MINE_SIEGE_STEP) * MINE_SIEGE_STEP));   // 🗡 grąžinam checkpoint headroom (kad grąžintas pot nebūtų iškart gated)
            c.gated = (c.mpot || 0) >= c.mcp - 0.01;
            this._persistCem(addr);
          }
          console.log(`[F9PvpRoom] ⛏️↩️ withdraw NEnusėdo → re-credit ${pend.amt} RONKE → pot ${addr.slice(0, 10)}…`);
        } else if (used === null) { this._minePend.set(addr, pend); }   // RPC nepavyko → grąžinam, bandom vėliau
        // used === true → nusėdo, pot lieka nurašytas
      } catch (_) { this._minePend.set(addr, pend); }
    })();
  }
  private _persistCem(addr: string) {   // per _buildingsOp eilę (kaip injured — neclobberinam kitų buildings laukų)
    addr = (addr || "").trim().toLowerCase();
    const c = this._cem.get(addr);
    if (!c) return;
    const snap = { ...c };
    void this._buildingsOp(addr, (b) => {
      b.cemPot = snap.pot; b.cemTick = snap.tick; b.minePot = snap.mpot; b.mineCheckpoint = snap.mcp || MINE_SIEGE_STEP; b.mineField = snap.mfield || 0; b.mineReserve = snap.mres || 0; b.cemPower = snap.power; b.cemNft = snap.nft; b.cemRv = snap.rv; b.cemWallet = snap.wallet; b.cemRamp = snap.ramp; b.dutyMode = snap.duty || "online"; b.mineGated = !!snap.gated;
    });
  }
  private _cemPayload(addr: string) {
    addr = (addr || "").trim().toLowerCase();
    const c = this._cem.get(addr) || { pot: 0, tick: 0, power: 0, nft: 0, rv: 0, wallet: 0, ramp: 0, mpot: 0, mcp: MINE_SIEGE_STEP, mfield: 0, mres: 0, duty: "online" as "online" | "safe", gated: false };
    const hl = this._cemHealthy(addr);
    const { onField: onFieldN, reserve: reserveN } = this._fieldCounts(addr);
    return {
      pot: Math.round(c.pot * 1000) / 1000, rate: Math.round(this._cemRate(addr) * 1000) / 1000,
      cap: CEM_CAP_BONES, claimMin: CEM_CLAIM_MIN,
      nft: hl.nft, reg: hl.reg, hosp: hl.hosp,   // nft = KOVAI PAJĖGŪS; reg = registruoti; hosp = ligoninėj
      rv: c.rv, wallet: c.wallet, eligible: this._cemEligible(addr),
      onField: onFieldN, reserve: reserveN,      // ⚔ kasimo lauko-frakcijai (patikimas šaltinis vietoj _f9OnField globalo)
      power: Math.round(hl.power), fullPower: Math.round(c.power),   // healthy (kasimo bazė) + pilnas registruotas RP (rodymui)
      // ⛏️💰 SERVER-AUTHORITATIVE mining (klientas nustato window._f9Mine → nustoja client accrual):
      mpot: Math.round((c.mpot || 0) * 1000) / 1000, mrate: Math.round(this._mineRateStored(addr) * 100) / 100, mcap: this._mineCap(addr), msiege: MINE_SIEGE_STEP, mclaim: MINE_CLAIM_MIN, mwd: mineWithdrawEnabled(),   // mpot=iškastas; mcap=dabartinis siege checkpoint (pot stoja); msiege=200 žingsnis; mclaim=500 withdraw slenkstis
      // ⚔️🛡 DUTY STATUS: klientas rodo režimo jungiklį + greitį + „locked → siege" būseną
      duty: c.duty || "online", gated: !!c.gated, dutyMult: (c.duty === "safe" ? DUTY_SAFE_MULT : DUTY_ONLINE_MULT),
      dutyOnlineMult: DUTY_ONLINE_MULT, dutySafeMult: DUTY_SAFE_MULT,
      rules: { aRv: CEM_REQ_A_RV, aReg: CEM_REQ_A_REG, bReg: CEM_REQ_B_REG, bWallet: CEM_REQ_B_WALLET },
      now: Date.now(),
    };
  }

  // 🔐 ON-CHAIN DEKO TIESA (07-04 user): realūs tokenId PRIVALO būti registruoti RonkePower TX'u.
  //   Dev/tušti tokenai leidžiami TIK kai piniginė neturi jokios registracijos (localhost testai).
  //   RPC fail → praleidžiam (dev; mainnet'ui griežtinti). Galioja: spawn, set_squad, snapshot, AI gynėjai.
  private async _chainFilterDeck(addr: string, deck: DeckEntry[]): Promise<DeckEntry[]> {
    if (process.env.F9_TRUST_DECK === "1") return deck;   // 🧪 DEV/TEST: pasitikim klientu (prod'e IŠJUNGTA → on-chain verifikacija)
    addr = (addr || "").trim().toLowerCase();
    if (!addr || !deck.length) return deck;
    const full = await chainDeckFull(addr);
    if (!full) return deck;
    const set = full.ids;
    const out = deck.filter((e) => (!e.tokenId || /^dev/i.test(e.tokenId)) ? set.size === 0 : set.has(String(e.tokenId)));
    // 🔐 LYGIŲ/utype CLAMP: registruotam NFT — level/utype IMAM IŠ GRANDINĖS (kliento reikšmės ignoruojamos),
    //   kad nebūtų inflated-level power farm'o. Jei on-chain stats nėra (multicall skip) — paliekam kliento (best-effort).
    let clamped = 0;
    for (const e of out) {
      if (!e.tokenId || /^dev/i.test(e.tokenId)) continue;
      const cu = full.stats.get(String(e.tokenId));
      if (!cu) continue;
      const trueUt = chainUtypeStr(cu.utype);
      if (trueUt && e.utype !== trueUt) { e.utype = trueUt; clamped++; }
      if (Number.isFinite(cu.level) && e.level !== cu.level) { e.level = cu.level; clamped++; }
    }
    if (out.length !== deck.length || clamped) console.log(`[DeckChain] ${addr.slice(0, 10)}… deko filtras: atmesta ${deck.length - out.length}/${deck.length}, clamp'inta ${clamped} lauk(ų) į on-chain`);
    return out;
  }
  private async _chainFilterSnap(addr: string, snap: SnapshotUnit[] | null): Promise<SnapshotUnit[] | null> {
    if (process.env.F9_TRUST_DECK === "1") return snap;   // 🧪 DEV/TEST bypass (žr. _chainFilterDeck)
    addr = (addr || "").trim().toLowerCase();
    if (!addr || !snap || !snap.length) return snap;
    const set = await chainDeck(addr);
    if (!set) return snap;
    const out = snap.filter((s) => (!s.tokenId || /^dev/i.test(s.tokenId)) ? set.size === 0 : set.has(String(s.tokenId)));
    if (out.length !== snap.length) console.log(`[DeckChain] ${addr.slice(0, 10)}… snapshot filtras: atmesta ${snap.length - out.length} NEregistruotų`);
    return out.length ? out : null;
  }

  // Spawnina VISĄ squad 2×6 formacijoj (match start / pirmas užkrovimas).
  private _spawnSquadFor(p: F9Player) {
    const sp = FFA_SPAWNS[p.team % FFA_SPAWNS.length];
    const deckRaw = this._pureDeck(this._decks.get(p.sessionId) || []);   // 🎖️ NFT yra → fake unitai išnyksta
    // 🏥 ligoninėje gulintys unitai NEDALYVAUJA (praleidžiam; rezervas užima jų vietą natūraliai)
    const injuredSet = this._injuredSet(p.address);
    const deck = deckRaw.filter((e) => !e.tokenId || !injuredSet.has(e.tokenId));
    if (deck.length < deckRaw.length) console.log(`[F9PvpRoom] 🏥 ${deckRaw.length - deck.length} unit(ai) ligoninėje — praleisti (${String(p.address).slice(0, 10)}…)`);
    const squad: DeckEntry[] = deck.length
      ? deck
      : DEFAULT_SQUAD.map((utype) => ({ utype, level: 0, tokenId: "" }));
    // 🏰 RESTORE: jei šitas savininkas turi išsaugotą pilį → tokenId→snapshot map (pozicija/HP).
    //   Unitai su tokenId snapshot'e → atsiranda KUR PALIKO; nauji (be įrašo) → formacijoj.
    const isOwner = this._home && p.sessionId === this._ownerSid;
    const snap = (isOwner && this._restoreUnits) ? new Map(this._restoreUnits.filter((s) => s.tokenId).map((s) => [s.tokenId, s])) : null;
    // 🪖 AKTYVŪS = pirmi MAX_ACTIVE (12); likę → REZERVAS (įeina kai aktyvus krenta). Rezervą NErūšiuojam į formaciją.
    const _active = this._activeCount.get(p.sessionId) || MAX_ACTIVE;   // ⚔ kiek žaidėjas nori lauke (default 12)
    const activeSquad = squad.slice(0, _active);
    this._reserves.set(p.sessionId, squad.slice(_active));   // deko likutis = rezervas (FIFO reinforcement, palaiko aktyvių skaičių)
    // 🗂️ SURŪŠIUOTA pagal TIPĄ (+ level) → to paties tipo unitai greta formacijoj → lengviau formuoti pakus.
    const ordered = activeSquad.slice().sort((a, b) => (a.utype < b.utype ? -1 : a.utype > b.utype ? 1 : ((b.level || 0) - (a.level || 0))));
    const n = ordered.length, PER_COL = 6, ROW_GAP = 1.3, COL_GAP = 1.6;
    void n;
    ordered.forEach((entry, i) => {
      const saved = (snap && entry.tokenId) ? snap.get(entry.tokenId) : undefined;
      if (saved) {
        // KUR PALIKO, bet FULL HP (2026-07-06 user): tarp siege'ų unitai pailsi — hp override NEbenaudojam.
        //   (Sužalojimus tvarko ligoninė; mid-battle nutrūkęs snapshot su hp1 nebepersistuoja amžinai.)
        this._spawnOneUnit(p, entry, saved.x, saved.y);
        return;
      }
      if (isOwner) {
        // 🏠 namų garnizonas: fiksuoti 2×6 grid slotai po barakais (bendri su set_squad — žr. homeFormSlot)
        const s = homeFormSlot(i);
        this._spawnOneUnit(p, entry, s.x, s.y);
        return;
      }
      const col = Math.floor(i / PER_COL);                       // 0 = priekinė eilė, 1 = užpakalinė
      const rowIdx = i % PER_COL;
      const inThisCol = Math.min(PER_COL, n - col * PER_COL);    // kiek šitoj eilėj (centravimui)
      const x = sp.x - col * COL_GAP * sp.face;                  // 2-a eilė už 1-os
      const y = sp.y - (inThisCol - 1) * ROW_GAP / 2 + rowIdx * ROW_GAP;
      this._spawnOneUnit(p, entry, x, y);
    });
  }

  // 🤖 ASYNC raid: spawnina AI valdomus gynėjus iš taikinio snapshot'o — TOSE PAČIOSE pozicijose (x,y,hp),
  //    kur savininkas paliko paskutinį kartą. Owner="AI_DEFENDER" (nėra žmogaus). Combat AI (_retargetAll +
  //    _stepUnit) priverčia juos automatiškai pulti priešus detect spinduly → gina pilį be žaidėjo.
  private _spawnAiDefenders(snap: SnapshotUnit[]) {
    const injuredSet = this._injuredSet(this._ownerAddr);   // 🏥 sužaloti gynėjai negina (guli ligoninėj)
    const deadSet = this._deadSet(this._ownerAddr);          // 💀 mirę gynėjai NEBEegzistuoja
    // 🎖️ senas mišrus snapshot'as (fake+NFT iš dev laikų) → jei yra NFT, fake gynėjai nespawn'inami
    const snapHasNft = snap.some((s) => s && s.tokenId && !/^dev/i.test(s.tokenId));
    let _spawned = 0;   // 🔒 07-06: cap MAX_ACTIVE — pasenęs per-didelis snapshot (set_squad >12 bug) negina su pertekliumi
    for (const s of snap) {
      if (_spawned >= MAX_ACTIVE) break;
      if (!s || !s.utype) continue;
      if (snapHasNft && !(s.tokenId && !/^dev/i.test(s.tokenId))) continue;
      if (s.tokenId && injuredSet.has(s.tokenId)) continue;
      if (s.tokenId && deadSet.has(s.tokenId)) continue;   // 💀
      const u = new F9Unit();
      u.id = `u${++this._uidCounter}`;
      u.owner = "AI_DEFENDER";
      u.team = DEFENDER_TEAM;
      u.utype = s.utype;
      u.level = s.level || 0;
      u.tokenId = s.tokenId || "";
      u.x = Math.max(1, Math.min(ARENA_W - 1, s.x));
      u.y = Math.max(1, Math.min(ARENA_H - 1, s.y));
      u.tx = u.x; u.ty = u.y;
      u.maxHp = BASE_HP[s.utype] || 8;
      u.hp = u.maxHp;   // 💤 2026-07-06 user: gynėjai tarp siege'ų PAILSĖJĘ — full HP (sužaloti/mirę jau atfiltruoti aukščiau)
      u.faceDx = -1;   // gynėjas žiūri į vakarus (į puoliką)
      u.alive = true;
      u.cmd = "idle";
      this.state.units.set(u.id, u);
      this._ai.set(u.id, { order: "hold", lastAtk: 0, engageId: "", kills: 0 });
      _spawned++;
    }
    console.log(`[F9PvpRoom] 🤖 spawned ${_spawned}/${snap.length} AI defenders (snapshot positions, cap ${MAX_ACTIVE})`);
  }

  // 🧪 STRESS TEST — spawnina N AI puolikų (team 0, vakaruose) → tikras server-side 30v30 pilyje. Tik home + savininkas.
  private _spawnStressAttackers(n: number) {
    const types = ["skull", "archer", "harpoon_fish", "pigronke", "shaman", "ghost", "ronhood"];
    let sp = 0;
    for (let i = 0; i < n; i++) {
      const ut = types[i % types.length];
      const u = new F9Unit();
      u.id = `s${++this._uidCounter}`;
      u.owner = "STRESS_ATK"; u.team = 0; u.utype = ut; u.level = 0; u.tokenId = "";
      u.x = 3 + (i % 8) * 2; u.y = Math.max(1, Math.min(ARENA_H - 1, 2 + ((i * 2 + 1) % (ARENA_H - 4))));
      u.tx = u.x; u.ty = u.y;
      u.maxHp = BASE_HP[ut] || 8; u.hp = u.maxHp;
      u.faceDx = 1; u.alive = true; u.cmd = "idle";
      this.state.units.set(u.id, u);
      this._ai.set(u.id, { order: "hold", lastAtk: 0, engageId: "", kills: 0 });
      sp++;
    }
    console.log(`[F9PvpRoom] 🧪 stress: +${sp} AI attackers → total units=${this.state.units.size}`);
    return sp;
  }

  // 🏗️ HOME sienos upgrade — pakelia wallLevel, atnaujina VISUS sienos segmentus (HP + lygis/išvaizda, heal),
  //    išsaugo į f9_bases.buildings. Tik savininkas, tik ramus home (size<=1, ne raido metu). Kaina = vėliau (resursai).
  private async _handleUpgradeWall(client: Client) {
    if (!this._home || client.sessionId !== this._ownerSid) return;
    if (this.state.players.size > 1) return;                 // raideris viduj → upgrade UŽRAKINTAS
    if ((this._buildings.wallLevel || 1) >= WALL_MAX_LVL) { client.send("wall_upgraded", { level: this._buildings.wallLevel, max: true }); return; }
    if (this._upgBusy) return; this._upgBusy = true;
    try {
      const next = (this._buildings.wallLevel || 1) + 1;
      if (!(await this._spendBones(client, WALL_UPG_COST[next] || 0, "Wall L" + next))) return;
      if (this.state.players.size > 1 || (this._buildings.wallLevel || 1) >= next) return;   // re-check po await
      this._buildings.wallLevel = next;
      const lvl = this._buildings.wallLevel;
      this.state.walls.forEach((w) => {
        if (w.tower) return;                                 // bokštai atskirai
        w.level = lvl;
        w.maxHp = wallHpForLevel(lvl);
        w.hp = w.maxHp;                                      // upgrade → pilnas HP
      });
      this.broadcast("wall_upgraded", { level: lvl });
      this._persistStructures(this._ownerAddr);
      console.log(`[F9PvpRoom] 🏗️ wall upgraded → Lv${lvl} (-${WALL_UPG_COST[lvl] || 0}🦴, persisted)`);
    } finally { this._upgBusy = false; }
  }

  // 🗼 HOME bokštų upgrade — pakelia towerLevel, atnaujina VISŲ bokštų HP (+heal); žala kyla per towerDmgForLevel.
  //    Tik savininkas + ramus home. Session-only (be persist, testavimui).
  // 🏥 LIGONINĖS upgrade (pilies meniu): L2 +slotas, L3/L4 −10min, L5 3-ias slotas. Kaina iš 🦴 banko.
  private async _handleUpgradeHospital(client: Client) {
    if (!this._home || client.sessionId !== this._ownerSid) return;
    if (this.state.players.size > 1) return;
    const cur = this._buildings.hospLevel || 1;
    if (cur >= HOSP_MAX_LVL) { client.send("hospital_upgraded", { level: cur, max: true }); return; }
    if (this._upgBusy) return; this._upgBusy = true;
    try {
      const next = cur + 1;
      if (!(await this._spendBones(client, HOSP_UPG_COST[next] || 0, "Hospital L" + next))) return;
      if (this.state.players.size > 1 || (this._buildings.hospLevel || 1) >= next) return;
      this._buildings.hospLevel = next;
      const h = this._injured.get(this._ownerAddr);
      if (h) { h.lvl = next; this._pruneHosp(this._ownerAddr); this._persistInjured(this._ownerAddr); }   // naujas slotas aktyvuojasi IŠKART
      this._persistStructures(this._ownerAddr);
      this.broadcast("hospital_upgraded", { level: next, slots: this._hospSlots(next), healMs: this._hospHealMs(next) });
      try { client.send("hospital", this._hospPayload(this._ownerAddr)); } catch (_) {}
      console.log(`[F9PvpRoom] 🏥 hospital upgraded → L${next} (-${HOSP_UPG_COST[next] || 0}🦴, slots ${this._hospSlots(next)}, heal ${Math.round(this._hospHealMs(next) / 60000)}min)`);
    } finally { this._upgBusy = false; }
  }
  private async _handleUpgradeTowers(client: Client) {
    if (!this._home || client.sessionId !== this._ownerSid) return;
    if (this.state.players.size > 1) return;
    const cur = this._buildings.towerLevel || 1;
    if (cur >= TOWER_MAX_LVL) { client.send("towers_upgraded", { level: cur, max: true }); return; }
    if (this._upgBusy) return; this._upgBusy = true;
    try {
      const next = cur + 1;
      if (!(await this._spendBones(client, TOWER_UPG_COST[next] || 0, "Towers L" + next))) return;
      if (this.state.players.size > 1 || (this._buildings.towerLevel || 1) >= next) return;   // re-check po await
      this._buildings.towerLevel = next;
      const lvl = this._buildings.towerLevel;
      for (const t of (this._buildings.towers || [])) t.level = lvl;
      this.state.walls.forEach((w) => {
        if (!w.tower) return;
        w.maxHp = towerHpForLevel(lvl);
        w.hp = w.maxHp;
      });
      this.broadcast("towers_upgraded", { level: lvl });
      this._persistStructures(this._ownerAddr);
      console.log(`[F9PvpRoom] 🗼 towers upgraded → Lv${lvl} (-${TOWER_UPG_COST[lvl] || 0}🦴, persisted)`);
    } finally { this._upgBusy = false; }
  }

  // 🗼 STATYTI bokštą ant sienos eilės y. Validacija: savininkas + ramus home + <MAX + min 6 eilių tarpas +
  //    gyvas sienos segmentas + dar nėra bokšto ten. (NFT backing = vėliau; kol kas 5 slotai.)
  private async _handleBuildTower(client: Client, msg: any) {
    if (!this._home || client.sessionId !== this._ownerSid) return;
    if (this.state.players.size > 1) return;
    const y = Math.round(Number(msg?.y));
    if (!Number.isFinite(y) || y < 0 || y >= ARENA_H) { client.send("tower_build_fail", { reason: "bad" }); return; }
    if (MOAT_GAP.indexOf(y) >= 0) { client.send("tower_build_fail", { reason: "entrance" }); return; }   // ant praėjimo NEgalima
    const towers = this._buildings.towers || (this._buildings.towers = []);
    if (towers.length >= MAX_TOWERS) { client.send("tower_build_fail", { reason: "max", max: MAX_TOWERS }); return; }
    const seg = this.state.walls.get(WALL_COL + "," + y);
    if (!seg || !seg.alive) { client.send("tower_build_fail", { reason: "nowall" }); return; }
    if (seg.tower) { client.send("tower_build_fail", { reason: "exists" }); return; }
    for (const t of towers) { if (Math.abs(t.y - y) < TOWER_MIN_GAP) { client.send("tower_build_fail", { reason: "tooclose", gap: TOWER_MIN_GAP }); return; } }
    // OK → mokam ir statom (validacijos aukščiau; po await re-check kad state nepasikeitė)
    if (this._upgBusy) return; this._upgBusy = true;
    try {
      if (!(await this._spendBones(client, TOWER_BUILD_COST, "Zip Tower"))) return;
      const seg2 = this.state.walls.get(WALL_COL + "," + y);
      if (!seg2 || !seg2.alive || seg2.tower || towers.length >= MAX_TOWERS) return;
      towers.push({ y, level: this._buildings.towerLevel || 1 });
      seg2.tower = true;
      seg2.maxHp = towerHpForLevel(this._buildings.towerLevel || 1);
      seg2.hp = seg2.maxHp;
      this.broadcast("tower_built", { y, count: towers.length });
      this._persistStructures(this._ownerAddr);
      console.log(`[F9PvpRoom] 🗼 tower built @y${y} (${towers.length}/${MAX_TOWERS}, -${TOWER_BUILD_COST}🦴, persisted)`);
    } finally { this._upgBusy = false; }
  }

  // 🏰 HOME: squad keitimas BE re-formavimo (ANTI-EXPLOIT). DIFF pagal tokenId:
  //   esami unitai LIEKA savo vietose; pašalinti DINGSTA; PRIDĖTI spawn'inasi spawn spote (TIK nauji).
  //   → negali kovos metu „grąžint visų į krūvą" keisdamas squad. TIK ramus home (size≤1, ne raidas).
  private async _handleSetSquad(client: Client, msg: any) {
    if (!this._home) return;
    if (this.state.players.size > 1) return;          // puolėjas viduj → squad UŽRAKINTAS
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const _seq = ++this._setSquadSeq;   // 🔒 lenktynių guard'as: spam'inant deko keitimus, taikom TIK naujausią
    let newDeck = this._pureDeck(sanitizeDeck(msg && msg.deck));   // 🎖️ NFT yra → fake unitai išnyksta
    const _deadSq = this._deadSet(p.address);
    if (_deadSq.size) newDeck = newDeck.filter((e) => !e.tokenId || !_deadSq.has(e.tokenId));   // 💀 mirę nepraeina
    // ♻️ fresh (07-04): klientas KĄ TIK re-registravo deką on-chain → invaliduojam 120s kešą, kad
    //   nauji unitai nepraeitų pro seną snapshot'ą (be šito atsirasdavo tik po restarto). Rate-limit 10s/addr.
    if (msg && msg.fresh && p.address) {
      const _fa = String(p.address).trim().toLowerCase();
      if (Date.now() - (this._freshInvAt.get(_fa) || 0) > 10000) {
        chainDeckInvalidate(_fa); this._freshInvAt.set(_fa, Date.now());
      }
    }
    // 🔐 on-chain validacija (07-04) — neregistruoti tokenai atmetami
    try { if (p.address) newDeck = await this._chainFilterDeck(String(p.address), newDeck); } catch (_) {}
    if (this.state.players.size > 1) return;          // re-check po await (raideris galėjo įeiti)
    if (_seq !== this._setSquadSeq) return;           // 🔒 per await atėjo NAUJESNIS set_squad → šis pasenęs, atmetam
    this._decks.set(client.sessionId, newDeck);
    // ⚔ 07-06 user: laukas = kiek žaidėjas NORI (battle squad dydis, 1..12) — ne visada 12. Leidžia „palikti tik 1".
    //   msg.active nėra (senas klientas) → MAX_ACTIVE (senas elgesys). Klampinam ir įsimenam sesijai.
    if (msg && msg.active != null) this._activeCount.set(client.sessionId, this._clampActive(msg.active));
    const _active = this._activeCount.get(client.sessionId) || MAX_ACTIVE;
    const sp = FFA_SPAWNS[p.team % FFA_SPAWNS.length];
    const deckHasNft = newDeck.some((e) => e.tokenId && !/^dev/i.test(e.tokenId));
    // AKTYVŪS = pirmi _active po ligoninės filtro; likę = rezervas. Skaičiuojam PRIEŠ rm diff'ą,
    // nes keep testas PRIVALO lyginti su AKTYVIAIS, ne visu deku.
    void sp;
    const injuredSet2 = this._injuredSet(p.address);
    const deckOk = newDeck.filter((e) => !e.tokenId || !injuredSet2.has(e.tokenId));   // ligoninėj gulintys nedalyvauja
    const activeSlice = deckOk.slice(0, _active);
    const restSlice = deckOk.slice(_active);
    const activeTokens = new Set(activeSlice.map((e) => e.tokenId).filter((t) => t));
    // 1) PAŠALINTI esamus, kurių tokenId nebe AKTYVIŲJŲ tarpe (🐛 07-06 FIX: anksčiau lygino su VISU deku —
    //    per-registravus deką seni lauko unitai nusikeldavo į 13+ pozicijas, likdavo lauke, o nauji 12 dar
    //    prisispawnindavo → pilyje >12 unitų iki refresh'o). Deke-bet-rezerve esantys → iš lauko į rezervą.
    //    🎖️ Jei naujame deke yra NFT — pašalinam ir VISUS fake'us lauke (tuščias tokenId / 'dev...').
    const rm: string[] = [];
    const keep = new Set<string>();
    this.state.units.forEach((u, id) => {
      if (u.owner !== client.sessionId) return;
      const isReal = !!(u.tokenId && !/^dev/i.test(u.tokenId));
      if (deckHasNft && !isReal) { rm.push(id); return; }   // fake'as, o žaidėjas jau su NFT → lauk
      if (!u.tokenId) return;
      if (activeTokens.has(u.tokenId)) keep.add(u.tokenId); else rm.push(id);
    });
    for (const id of rm) { this.state.units.delete(id); this._ai.delete(id); }
    // 2) PRIDĖTI tik trūkstamus AKTYVIUS — 🏠 į GARNIZONO 2×6 slotus. KIETAS CAP: lauke NIEKADA >MAX_ACTIVE
    //    (belt-and-braces — net jei keep/rm logika kada nors pasikeistų, viršyti 12 neįmanoma).
    const onField = new Set<string>();   // VISI (gyvi + kritę šiame mūšyje) — kritęs tokenas atgal negrįžta
    this.state.units.forEach((u) => { if (u.owner === client.sessionId && u.tokenId) onField.add(u.tokenId); });
    let occupied = 0;
    this.state.units.forEach((u) => { if (u.owner === client.sessionId && u.alive) occupied++; });
    const freeSlots = Math.max(0, MAX_ACTIVE - occupied);
    const toAddAll = activeSlice.filter((e) => e.tokenId && !onField.has(e.tokenId));
    const toAdd = toAddAll.slice(0, freeSlots);
    const overflow = toAddAll.slice(freeSlots);          // netilpę aktyvūs → į rezervo priekį
    toAdd.forEach((entry, k) => {
      const s = homeFormSlot(occupied + k);   // pildom slotus nuo pirmo laisvo (pagal esamų skaičių)
      this._spawnOneUnit(p, entry, s.x, s.y);
      if (entry.tokenId) onField.add(entry.tokenId);
    });
    // 3) 🔄 REZERVAS perskaičiuojamas: overflow + deko likutis MINUS kas jau lauke (anti-dublis su _tryReinforce)
    this._reserves.set(client.sessionId, overflow.concat(restSlice).filter((e) => !e.tokenId || !onField.has(e.tokenId)));
    // ⛏️ M5 fix (07-12, sync auditas): deko rotacija IŠKART perskaičiuoja kasimo bazę (cem power/nft +
    //   lauko count'ai) — anksčiau rate atsinaujindavo tik po reconnect. PIRMA accrue (uždarom seno rate
    //   langą — jis buvo pelnytas iki šio momento), TADA nauja bazė + persist + šviežias payload klientui.
    try {
      const _a5 = String(p.address || "").trim().toLowerCase();
      const c5 = _a5 ? this._cem.get(_a5) : null;
      if (c5) {
        this._cemAccrue(_a5);
        let pw5 = 0; for (const d5 of newDeck) pw5 += Math.max(0, (d5.level || 0) - 1) * ronkePowerRate(d5.utype);
        c5.power = pw5; c5.nft = this._nftCountOf(newDeck);
        const fc5 = this._fieldCounts(_a5); c5.mfield = fc5.onField; c5.mres = fc5.reserve;
        this._persistCem(_a5);
        try { client.send("cemetery", { ...this._cemPayload(_a5), own: true }); } catch (_) {}
      }
    } catch (_) {}
    console.log(`[F9PvpRoom] set_squad diff — kept ${keep.size}, removed ${rm.length}, added ${toAdd.length}${overflow.length ? " (overflow→rez " + overflow.length + ")" : ""}, rezervas ${this._reserves.get(client.sessionId)!.length} (garnizonas @slot ${occupied}+)`);
  }

  // Žaidėjas iškrito (disconnect/forfeit). FFA: jo unitai miršta; jei lieka ≤1 žaidėjas — mūšis baigtas.
  private _handlePlayerOut(sid: string) {
    // 🏳️ RAGE-QUIT TAISYKLĖ (2026-07-06 user): forfeit'inęs žaidėjas PRARANDA šio mūšio uždirbtus kaulus —
    //   negalima „užmušti priešus ir išjungti žaidimą pasiimant grobį". Unitai NEmiršta papildomai (tikros
    //   mirtys/sužalojimai commit'inami žūties momentu per _rollInjury — atjungimas jų neatšaukia; legalus
    //   pabėgimas SU grobiu = retreat zona). _endMatch flush'ins p.bones=0 → bankui nieko.
    const qp = this.state.players.get(sid);
    if (qp) {
      if ((qp.bones || 0) > 0) console.log(`[F9PvpRoom] 🏳️ forfeit ${sid} (${String(qp.address).slice(0, 10)}…) — prarado ${(qp.bones || 0).toFixed(1)}🦴 sesijos grobio`);
      qp.bones = 0;
      (qp as any)._forfeit = true;   // _endMatch summary: be kills×mult fallback perskaičiavimo
    }
    // C3 relay: nėra schema unitų — likęs žaidėjas laimi (forfeit).
    if (this._relay) {
      let winnerSid = "";
      this.state.players.forEach((p) => { if (p.sessionId !== sid) winnerSid = p.sessionId; });
      this._endMatch(winnerSid);
      return;
    }
    // FAZA E: čia mirusiems unitams eis lock/permadeath settlement.
    this.state.units.forEach((u) => { if (u.owner === sid) u.alive = false; });
    this._checkWin();
  }

  // FFA win: lieka tik vienas team su gyvais unitais → jis laimi (arba 0 → lygiosios).
  // 🦴 Apskaičiuoja kiekvieno žaidėjo kaulų daugiklį (baseMult + RonkePower bonusas) mūšio pradžioj.
  //   power = Σ max(0,lvl-1) × ronkePowerRate(utype) iš VISO deko (aktyvūs + rezervas) — TIKRAS RonkePower.
  private _boneBusy = new Set<string>();   // 🦴 per-address swap in-flight lock (anti double-voucher)

  // 🦴 Sesijos kaulai → persistuotas bankas (match pabaiga / leave / dispose). Zero'inam p.bones
  //   KARTU — pakartotinis flush nieko nepridės (double-flush safe). Fire-and-forget (supabase async).
  private _flushBones(p: F9Player | undefined) {
    if (!p) return;
    const addr = String(p.address || "").trim().toLowerCase();
    const amt = Math.round((p.bones || 0) * 10) / 10;
    if (!addr || amt <= 0) return;
    p.bones = 0;
    addBones(addr, amt).then((b) => {
      if (b != null) console.log(`[F9PvpRoom] 🦴 flush +${amt} → bank=${b} (${addr.slice(0, 10)}…)`);
    }).catch(() => {});
  }

  private _initBoneMults() {
    this.state.players.forEach((p) => {
      let power = 0;
      const fullDeck = this._decks.get(p.sessionId) || [];   // pilnas registruotas dekas (ne tik spawn'inti aktyvūs)
      for (const d of fullDeck) power += Math.max(0, (d.level || 0) - 1) * ronkePowerRate(d.utype);
      const base = (p.team === DEFENDER_TEAM) ? BONE_MULT_DEFENDER : BONE_MULT_ATTACKER;
      const bonus = Math.min(BONE_POWER_MAX_BONUS, (power / BONE_POWER_MAX) * BONE_POWER_MAX_BONUS);
      p.boneMult = Math.round((base + bonus) * 100) / 100;
      p.bones = 0;
      this._bonePower.set(p.sessionId, power);
    });
  }

  private _checkWin() {
    if (this.state.phase !== "playing") return;
    if (this._home && this.state.players.size < 2) return;   // 🏰 solo home: nėra oponento → niekada „nelaimi"/nesibaigia
    const aliveTeams = new Set<number>();
    this.state.units.forEach((u) => { if (u.alive) aliveTeams.add(u.team); });
    if (aliveTeams.size <= 1) {
      const winTeam = aliveTeams.size === 1 ? [...aliveTeams][0] : -1;
      let winnerSid = "";
      if (winTeam >= 0) this.state.players.forEach((p) => { if (p.team === winTeam) winnerSid = p.sessionId; });
      this._endMatch(winnerSid);
    }
  }

  // 📜 Sukuria+persistina raid ataskaitą gynėjui (offline consequences). Kviečiama _endMatch pabaigoj.
  private _persistRaidReport(winnerSid: string) {
    if (this._raidReported || !this._raidAtkAddr || !this._ownerAddr) return;
    this._raidReported = true;
    const w = this.state.players.get(winnerSid);
    const wAddr = String(w?.address || "").trim().toLowerCase();
    const atkWon = !!w && winnerSid !== this._ownerSid && wAddr === this._raidAtkAddr;
    const result = atkWon ? "lost" : (this._attackerEngaged ? "defended" : "retreat");
    // puoliko armija = jo deko sudėtis (utype+level → count)
    const atk = this.state.players.get(this._ownerSid === winnerSid ? "" : "");   // (nenaudojam — imam iš deck)
    void atk;
    const atkDeck = (() => {
      for (const [sid, d] of this._decks) {
        const pp = this.state.players.get(sid);
        if (pp && String(pp.address || "").trim().toLowerCase() === this._raidAtkAddr) return d;
      }
      return [] as DeckEntry[];
    })();
    const comp = new Map<string, { utype: string; level: number; count: number }>();
    for (const e of atkDeck) {
      const k = e.utype + "|" + (e.level || 0);
      const c = comp.get(k); if (c) c.count++; else comp.set(k, { utype: e.utype, level: e.level || 0, count: 1 });
    }
    // 🛡 gynėjo unitų likimai (battle-settled grid) — iš deko/snapshoto: survived/injured/dead
    const defSrc = (this._decks.get(this._ownerSid) || []).length
      ? (this._decks.get(this._ownerSid) || [])
      : (this._restoreUnits || []).map((u) => ({ utype: u.utype, level: u.level || 0, tokenId: u.tokenId }));
    const defUnits = defSrc.filter((e) => e.tokenId && !/^dev/i.test(e.tokenId)).map((e) => ({
      tokenId: String(e.tokenId), utype: e.utype, level: e.level || 0,
      fate: this._raidKilled.has(e.tokenId) ? "dead" : (this._raidInjured.has(e.tokenId) ? "injured" : "survived"),
    }));
    const rep = {
      at: Date.now(), attacker: this._raidAtkAddr, result,
      atkArmy: Array.from(comp.values()),
      killed: Array.from(this._raidKilled), injured: Array.from(this._raidInjured),
      bonesStolen: this._raidStolen, defUnits,
    };
    appendRaidReport(this._ownerAddr, rep).then((ok) => {
      console.log(`[F9PvpRoom] 📜 raid ataskaita → ${this._ownerAddr.slice(0, 10)}… (${result}, killed ${rep.killed.length}, injured ${rep.injured.length}, stolen ${rep.bonesStolen}) persist=${ok}`);
    }).catch(() => {});
  }
  // 🛡⏲ Raid gate: shield (ką tik nusiaubta pilis) + per-puoliko cooldown. Meta klaidas su
  //   minutėmis klientui („SHIELDED:42" / „RAID_COOLDOWN:9") — raid_ui rodo žinutę.
  private _checkRaidGate(atkAddrRaw: string) {
    const atk = String(atkAddrRaw || "").trim().toLowerCase();
    const sh = Number((this._buildings as any)?.shieldUntil) || 0;
    if (sh > Date.now()) {
      console.log(`[F9PvpRoom] 🛡 raid atmestas — ${this._ownerAddr} po shield'u dar ${Math.ceil((sh - Date.now()) / 60000)}min`);
      throw new Error("SHIELDED:" + Math.ceil((sh - Date.now()) / 60000));
    }
    const cdAt = _raidCdMap.get(atk + "|" + this._ownerAddr) || 0;
    if (Date.now() - cdAt < RAID_CD_MS) {
      console.log(`[F9PvpRoom] ⏲ raid atmestas — ${atk.slice(0, 10)}… cooldown dar ${Math.ceil((RAID_CD_MS - (Date.now() - cdAt)) / 60000)}min`);
      throw new Error("RAID_COOLDOWN:" + Math.ceil((RAID_CD_MS - (Date.now() - cdAt)) / 60000));
    }
  }
  // ⚔ Abiejų komandų mūšio sudėtis su likimais (survived/injured/dead) — 2-pusiam settled ekranui.
  //   Kiekvienas klientas gauna TUOS PAČIUS rosterius (broadcast), o savo/priešo pusę pasirenka pagal savo team.
  private _battleRoster(): Record<string, { team: number; address: string; units: any[]; survived: number; injured: number; dead: number }> {
    const teams: Record<string, { team: number; address: string; units: any[]; survived: number; injured: number; dead: number }> = {};
    const ensure = (team: number, addr: string) => {
      const k = String(team);
      if (!teams[k]) teams[k] = { team, address: addr || "", units: [], survived: 0, injured: 0, dead: 0 };
      else if (!teams[k].address && addr) teams[k].address = addr;
      return teams[k];
    };
    this.state.units.forEach((u) => {
      const p = this.state.players.get(u.owner);
      const addr = p ? String(p.address || "") : (u.team === DEFENDER_TEAM ? this._ownerAddr : "");
      const t = ensure(u.team, addr);
      const fate: "survived" | "injured" | "dead" = u.alive ? "survived" : (this._battleFates.get(u.id) || "dead");
      t.units.push({ utype: u.utype, level: u.level || 0, tokenId: u.tokenId || "", fate });
      if (fate === "survived") t.survived++; else if (fate === "injured") t.injured++; else t.dead++;
    });
    return teams;
  }
  private _endMatch(winnerSid: string) {
    if (this.state.phase === "ended") return;
    this.state.phase = "ended";
    this.state.gameStarted = false;
    this.state.winnerSid = winnerSid;

    // 🛡⚰️ SKYDAS + VAGYSTĖ pagal gynėjo LAUKO AUKAS (07-11 kasimo redizainas):
    //   • ≥50% lauko unitų eliminuota → 1h SKYDAS (atsigavimo langas; klientas kasa ×0.5). Nesvarbu kas laimėjo.
    //   • 100% lauko wipe (pilis krito) + puolikas laimėjo → VAGYSTĖ 50% nesurinkto pot.
    //   • <50% aukų (gerai apsigynei) → JOKIO skydo/vagystės — kasi toliau.
    if ((this._home || this._asyncRaid) && this._ownerAddr) {
      let defTotal = 0, defElim = 0;   // gynėjo lauke KOVOJĘ NFT unitai (field + reinforcements)
      let atkTotal = 0, atkElim = 0;   // ⚔️ puoliko unitai (siege užskaitymui: bet kuri pusė ≥50%)
      this.state.units.forEach((u) => {
        if (!u.tokenId) return;
        if (u.team === DEFENDER_TEAM) { defTotal++; if (!u.alive) defElim++; }
        else { atkTotal++; if (!u.alive) atkElim++; }
      });
      const casualtyPct = defTotal > 0 ? defElim / defTotal : 0;
      const atkCasualtyPct = atkTotal > 0 ? atkElim / atkTotal : 0;
      const fullWipe = defTotal > 0 && defElim === defTotal;
      // ⛏️🗡 SIEGE UŽSKAITYMAS (07-14 user): kvalifikuotas PvP mūšis (bet kuri pusė ≥50% aukų) atrakina kasimą
      //   ABIEM dalyviam (puolikui IR gynėjui), ABIEM režimam. Jei buvo gated → gated=false + checkpoint +200.
      //   Raidas = gynėjo mūšis (DUTY „mūšis ateina pas tave"); safe puolikas inicijuoja pats.
      if ((casualtyPct >= DUTY_SIEGE_CASUALTY || atkCasualtyPct >= DUTY_SIEGE_CASUALTY) && this._raidAtkAddr) {
        const _qualified = Math.round(Math.max(casualtyPct, atkCasualtyPct) * 100);
        // helper: raw buildings obj → jei gated, atrakink + pakelk checkpoint +200 (cap MINE_CAP)
        const _advanceSiege = (b: any) => {
          if (b && b.mineGated) {
            b.mineGated = false;
            const cur = Number.isFinite(+b.mineCheckpoint) ? Math.max(MINE_SIEGE_STEP, +b.mineCheckpoint) : MINE_SIEGE_STEP;
            b.mineCheckpoint = Math.min(MINE_CAP, cur + MINE_SIEGE_STEP);
          }
        };
        // PUOLIKAS — jo _cem nėra šiam kambary; rašom per jo #buildings eilę
        const _atk = this._raidAtkAddr;
        void this._buildingsOp(_atk, _advanceSiege);
        // GYNĖJAS — jei _cem įkeltas (gyva gynyba), keičiam tiesiogiai; kitaip (async offline) per #buildings eilę
        const cDef = this._cem.get(this._ownerAddr);
        if (cDef) {
          if (cDef.gated) { cDef.gated = false; cDef.mcp = Math.min(MINE_CAP, (cDef.mcp || MINE_SIEGE_STEP) + MINE_SIEGE_STEP); this._persistCem(this._ownerAddr); }
        } else {
          void this._buildingsOp(this._ownerAddr, _advanceSiege);
        }
        console.log(`[F9PvpRoom] ⛏️🗡 siege užskaityta (${_qualified}% aukų) — atrakinta puolikui ${_atk.slice(0, 10)}… + gynėjui ${this._ownerAddr.slice(0, 10)}… (jei buvo gated, checkpoint +${MINE_SIEGE_STEP})`);
      }

      if (casualtyPct >= 0.5) {   // 🛡 ≥50% aukų → 1h skydas (nesvarbu kas laimėjo)
        const _shUntil = Date.now() + SHIELD_MS;
        (this._buildings as any).shieldUntil = _shUntil;                                     // live gate mato iškart
        void this._buildingsOp(this._ownerAddr, (b) => { (b as any).shieldUntil = _shUntil; });   // 🔒 eilė: injured/cem save'ai neperrašo skydo
        try { this.broadcast("shield", { until: _shUntil }); } catch (_) {}
        console.log(`[F9PvpRoom] 🛡 shield ${this._ownerAddr.slice(0, 10)}… (aukos ${Math.round(casualtyPct * 100)}%) iki +${Math.round(SHIELD_MS / 60000)}min`);
      }

      // ⛏️ PO RAIDO gynėjo LAUKO count'as = išgyvenusieji — offline rate skaičiuosis iš REALIOS po-mūšio
      //   armijos (anti-exploit: negalima offline kasti pilnu greičiu su išguldyta armija; full wipe → 0).
      //   min() niekada NEkelia count'o (rezervo pasikeitimų čia nežinom) — pakels kitas owner login'as.
      {
        const survivors = Math.max(0, defTotal - defElim);
        const cOwn = this._cem.get(this._ownerAddr);
        if (cOwn) { cOwn.mfield = Math.min(cOwn.mfield || 0, survivors); this._persistCem(this._ownerAddr); }
        else void this._buildingsOp(this._ownerAddr, (b) => { const cur = Number.isFinite(+(b as any).mineField) ? Math.max(0, +(b as any).mineField) : 0; (b as any).mineField = Math.min(cur, survivors); });
      }

      if (fullWipe && winnerSid) {   // ⚰️ 100% wipe + puolikas laimėjo → vagystė 50% RONKE MINING pot
        const w = this.state.players.get(winnerSid);
        const wAddr = String(w?.address || "").trim().toLowerCase();
        const attackerWon = !!w && winnerSid !== this._ownerSid && !!wAddr && wAddr !== this._ownerAddr;
        if (attackerWon) {
          // ⛏️💀 TIKRAS server-side steal: nuimam 50% gynėjo mining pot IR įskaitom puolikui į jo pot (server autoritetas).
          //   Async — kad injured/mpot persist'ai spėtų nusėsti. Puolikas nusiima grobį per withdrawal (fazė 2).
          (async () => {
            try {
              await this._loadCem(this._ownerAddr);
              this._cemAccrue(this._ownerAddr);
              const c = this._cem.get(this._ownerAddr);
              if (!c || (c.mpot || 0) < 0.1) return;
              const steal = Math.round((c.mpot || 0) * MINE_STEAL_PCT * 1000) / 1000;
              c.mpot = Math.round(((c.mpot || 0) - steal) * 1000) / 1000;
              this._persistCem(this._ownerAddr);
              this._raidStolen = steal;   // 📜 ataskaitai
              // 💰 PUOLIKAS GAUNA grobį į SAVO mining pot (capped MINE_CAP). Per atakuotojo #buildings eilę —
              //   NEteršiam šio kambario _cem (kad _cemAccrue nepriskaičiuotų klaidingo rate pagal gynėjo lauką);
              //   grįžęs namo puolikas _loadCem'ins šviežią minePot su grobiu. Read-modify-write serializuota per boneBankOp.
              if (steal > 0) {
                await this._buildingsOp(wAddr, (b) => {
                  const cur = Number.isFinite(+((b as any).minePot)) ? Math.max(0, +((b as any).minePot)) : 0;
                  (b as any).minePot = Math.round(Math.min(MINE_CAP, cur + steal) * 1000) / 1000;   // grobis į puoliko pot (backstop MINE_CAP; checkpoint gate'ins kasimą normaliai)
                });
              }
              this.broadcast("mine_stolen", { amount: steal, thiefSid: winnerSid, victimAddr: this._ownerAddr });   // FX/notif abiem pusėm (thief=+ / defender=−)
              console.log(`[F9PvpRoom] ⛏️💀 mining grobis: ${steal} RONKE iš ${this._ownerAddr.slice(0, 10)}… → puolikui ${wAddr.slice(0, 10)}… (100% wipe, gynėjui liko ${c.mpot})`);
            } catch (_) {}
          })();
        }
      }
    }

    // 📜 raid ataskaita gynėjui (grobio steal async → duodam 400ms kad _raidStolen užsipildytų)
    if ((this._home || this._asyncRaid) && this._raidAtkAddr) setTimeout(() => this._persistRaidReport(winnerSid), 400);
    // FAZA D settlement: staked režime nugalėtojas pasiima likusį pot (KotH drip jau išdalintas play metu).
    if (this.state.entryFee > 0 && winnerSid) {
      const w = this.state.players.get(winnerSid);
      if (w) { w.ronkePending += this.state.pot; this.state.pot = 0; }
    }

    // Payout summary (ronkePending = KotH drip + pergalės likutis) + on-chain settle (NO-OP kol nesukonfig.).
    const payouts: Payout[] = [];
    const players: any[] = [];
    let winnerTeam = -1;
    this.state.players.forEach((p) => {
      if (p.sessionId === winnerSid) winnerTeam = p.team;
      const survivors = [...this.state.units.values()].filter((u) => u.owner === p.sessionId && u.alive).length;
      let kills = 0;
      this._ai.forEach((ai, id) => { const u = this.state.units.get(id); if (u && u.owner === p.sessionId) kills += ai.kills; });
      // 🦴 KAULAI (FAZĖ 1): naudojam GYVAI kauptą `p.bones` (kill × p.boneMult). Breakdown iš kešuoto power.
      const baseMult = (p.team === DEFENDER_TEAM) ? BONE_MULT_DEFENDER : BONE_MULT_ATTACKER;
      const power = this._bonePower.get(p.sessionId) || 0;
      const powerBonus = Math.round(Math.min(BONE_POWER_MAX_BONUS, (power / BONE_POWER_MAX) * BONE_POWER_MAX_BONUS) * 100) / 100;
      const totalMult = p.boneMult || (baseMult + powerBonus);                                    // ADITYVUS: puolikas maks 4.0×, gynėjas 3.5×
      const bones = (p as any)._forfeit ? 0 : Math.round((p.bones || (kills * totalMult)) * 10) / 10;   // gyvai kauptas (fallback recompute); 🏳️ forfeit = 0 (rage-quit be grobio)
      const ronkeFromBones = Math.round(bones * BONE_VALUE_RONKE * 10) / 10;
      // 💀 Prarasta unitų: permadeath rulojam žaidėjo PARBLOKŠTIEMS unitams (display TIK — jokio realaus burn).
      let unitsLost = 0;
      this.state.units.forEach((u) => {
        if (u.owner === p.sessionId && !u.alive && Math.random() < permadeathChance(u.level || 0)) unitsLost++;
      });
      if (p.ronkePending > 0) payouts.push({ address: p.address, amount: p.ronkePending, sessionId: p.sessionId });
      players.push({ sessionId: p.sessionId, team: p.team, address: p.address,
                     contributed: p.contributed, earned: p.ronkePending, kills, survivors,
                     bones, baseMult, ronkePower: power, powerBonus: Math.round(powerBonus * 100) / 100,
                     totalMult: Math.round(totalMult * 100) / 100, ronkeFromBones, unitsLost });
    });
    // 🦴 sesijos kaulai → bankas (summary jau sukurtas iš p.bones; flush zero'ina)
    this.state.players.forEach((p) => this._flushBones(p));
    if (this.state.entryFee > 0) this._stake.settle(payouts);

    // ── FAZA E: mirties stakes — tik staked režime, tik realiems NFT (tokenId set). ──
    // Kiekvienam mirusiam NFT: permadeathChance(level) → burn (visam) arba 3d lock.
    // OFF-CHAIN sprendimas + summary; realus on-chain burn/lock = _stake.settleDeaths (NO-OP kol nesukonfig.).
    const deaths: DeathSettle[] = [];
    if (this.state.entryFee > 0) {
      const nowMs = Date.now();
      this.state.units.forEach((u) => {
        if (u.alive || !u.tokenId) return;                 // tik mirę realūs NFT
        const burned = Math.random() < permadeathChance(u.level);
        deaths.push({
          tokenId: u.tokenId, owner: u.owner, utype: u.utype, level: u.level,
          outcome: burned ? "burn" : "lock",
          lockUntil: burned ? 0 : nowMs + LOCK_DURATION_MS,
        });
      });
      if (deaths.length) this._stake.settleDeaths(deaths);
    }

    // 💤 POILSIS PO MŪŠIO (2026-07-06 user): visi IŠGYVENĘ unitai (gyvi; mirę/sužaloti tvarkomi atskirai —
    //   ligoninė/permadeath) atsistato į FULL HP — tarp siege'ų pilis pailsi, joks „hp1 veteranas"
    //   nepersistuoja į kitą mūšį. Auto-save/dispose snapshot'ins jau pilną HP.
    this.state.units.forEach((u) => { if (u.alive) u.hp = u.maxHp; });
    this.broadcast("match_end", { winnerSid, winnerTeam });
    this.broadcast("match_result", { winnerSid, winnerTeam, entryFee: this.state.entryFee, players, deaths, reason: "wipe", rosters: this._battleRoster() });
    console.log(`[F9PvpRoom] match_end winner=${winnerSid || "(draw)"} pot_left=${this.state.pot.toFixed(2)} payouts=${payouts.length} deaths=${deaths.length}`);
  }

  // ───────────────────────────── commands ─────────────────────────────
  private _handleCmd(client: Client, msg: any) {
    if (this.state.phase !== "playing") return;
    const action = String(msg?.action || "");
    const ids: string[] = Array.isArray(msg?.ids) ? msg.ids.map(String) : [];
    const x = Math.max(0, Math.min(ARENA_W, Number(msg?.x)));
    const y = Math.max(0, Math.min(ARENA_H, Number(msg?.y)));
    const targetId = String(msg?.targetId || "");

    // Surenkam galiojančius (savo gyvus) unitus.
    let valid: { u: F9Unit; ai: AIState }[] = [];
    for (const id of ids) {
      const u = this.state.units.get(id);
      const ai = this._ai.get(id);
      if (!u || !ai || !u.alive || u.owner !== client.sessionId) continue;   // tik savo gyvus unitus
      valid.push({ u, ai });
    }
    if (!valid.length) return;

    // ── RELEASE komandos (veikia ant UŽRAKINTŲ unitų) — apdorojam PRIEŠ filtravimą ──
    if (action === "unhold") {
      for (const { u, ai } of valid) {
        if (ai.order !== "holdpos") continue;
        ai.order = "hold"; ai.engageId = ""; ai.siegeTarget = undefined;
        u.holding = false; u.cmd = "idle"; u.targetId = "";
      }
      return;
    }
    if (action === "unpatrol") {
      for (const { u, ai } of valid) {
        if (ai.order !== "patrol") continue;
        ai.order = "hold"; ai.engageId = ""; ai.siegeTarget = undefined; ai.patrolPts = undefined;
        u.patrolling = false; u.cmd = "idle"; u.targetId = "";
      }
      return;
    }

    // 🛡🚩 Užrakinti (holdpos ARBA patrol) unitai IGNORUOJA visas kitas komandas — kol neatšaukti (unhold/unpatrol).
    valid = valid.filter((v) => v.ai.order !== "holdpos" && v.ai.order !== "patrol");
    if (!valid.length) return;

    // 🛡 HOLD POSITION (set) — užrakina poste (skydas).
    if (action === "hold") {
      for (const { u, ai } of valid) {
        u.tx = u.x; u.ty = u.y; u.cmd = "idle"; u.targetId = "";
        ai.order = "holdpos"; ai.engageId = ""; ai.siegeTarget = undefined;
        ai.holdX = u.x; ai.holdY = u.y;
        u.holding = true;   // skydas → sinch klientui
      }
      return;
    }

    // 🚩 PATROL (set) — maršrutas A→B→C (loop), UŽRAKINTA būsena (ignoruoja komandas iki unpatrol).
    if (action === "patrol") {
      const rawPts: any[] = Array.isArray(msg?.pts) ? msg.pts : [];
      const pts = rawPts.slice(0, PATROL_MAX_PTS).map((p) => ({
        x: Math.max(0.2, Math.min(ARENA_W - 0.2, Number(p?.x) || 0)),
        y: Math.max(0.2, Math.min(ARENA_H - 0.2, Number(p?.y) || 0)),
      }));
      if (pts.length < 1) return;
      // 🚩 GLOBALUS cap: iš viso max 4 patruliuojantys per savininką; PO VIENĄ (1 unitas / komandą).
      let already = 0;
      this.state.units.forEach((su) => {
        if (su.alive && su.owner === client.sessionId && su.patrolling) already++;
      });
      if (already >= PATROL_MAX_UNITS) return;
      const take = valid.slice(0, 1);   // tik 1 unitas (kartoji su kitu unitu — iki 4 atskirų)
      take.forEach(({ u, ai }) => {
        // <2 taškai → pridedam paties unito poziciją kaip A (ping-pong tarp pozicijos ir taško)
        ai.patrolPts = pts.length >= 2 ? pts.slice() : [{ x: u.x, y: u.y }, pts[0]];
        ai.patrolIdx = 0;
        ai.order = "patrol"; ai.engageId = ""; ai.siegeTarget = undefined;
        u.cmd = "move"; u.targetId = "";
        u.tx = ai.patrolPts[0].x; u.ty = ai.patrolPts[0].y;
        u.patrolling = true;   // 🚩 flag → sinch klientui (lock + vizualas)
      });
      return;
    }

    // ⊞ REGROUP — jei klientas atsiuntė per-unit pozicijas (pts, formacija) → priskiriam pagal ids tvarką.
    //   Kitaip (fallback) — senas tankus √n tinklelis ant (x,y).
    if (action === "regroup" && Array.isArray(msg?.pts) && msg.pts.length) {
      const pts: any[] = msg.pts;
      const items: { u: F9Unit; ai: AIState; dx: number; dy: number }[] = [];
      for (let k = 0; k < ids.length && k < pts.length; k++) {
        const u = this.state.units.get(ids[k]);
        const ai = this._ai.get(ids[k]);
        if (!u || !ai || !u.alive || u.owner !== client.sessionId) continue;
        if (ai.order === "holdpos" || ai.order === "patrol") continue;   // užrakinti ignoruoja
        u.tx = Math.max(0.2, Math.min(ARENA_W - 1.2, Number(pts[k]?.x) || u.x));
        u.ty = Math.max(0.2, Math.min(ARENA_H - 1.2, Number(pts[k]?.y) || u.y));
        u.cmd = "move"; u.targetId = "";
        ai.order = "move"; ai.engageId = ""; ai.siegeTarget = undefined;
        items.push({ u, ai, dx: u.tx, dy: u.ty });
      }
      this._assignPaths(items);   // 🧭
      return;
    }
    if (action === "regroup") {
      const n = valid.length;
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      const rows = Math.ceil(n / cols);
      const GAP = 1.15;   // > pair-separation 1.10 (atitinka game.js _f9FormationOffsets)
      valid.sort((a, b) => (a.u.y - b.u.y) || (a.u.x - b.u.x));
      valid.forEach((v, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const ox = (c - (cols - 1) / 2) * GAP;
        const oy = (r - (rows - 1) / 2) * GAP;
        v.u.tx = Math.max(0.2, Math.min(ARENA_W - 1.2, x + ox));
        v.u.ty = Math.max(0.2, Math.min(ARENA_H - 1.2, y + oy));
        v.u.cmd = "move"; v.u.targetId = "";
        v.ai.order = "move"; v.ai.engageId = ""; v.ai.siegeTarget = undefined;
      });
      this._assignPaths(valid.map((v) => ({ u: v.u, ai: v.ai, dx: v.u.tx, dy: v.u.ty })));   // 🧭
      return;
    }

    // FORMACIJA (move/attackmove): grupė juda IŠLAIKYDAMA formą — kiekvienas į taikinį + offset nuo
    // grupės centroido (RTS standartas; kitaip visi suplaukia į vieną tašką ir susigrūda į krūvą).
    let cX = 0, cY = 0;
    for (const v of valid) { cX += v.u.x; cY += v.u.y; }
    cX /= valid.length; cY /= valid.length;
    const moveItems: { u: F9Unit; ai: AIState; dx: number; dy: number }[] = [];   // 🧭 pathfinding

    for (const { u, ai } of valid) {
      if (action === "move" || action === "attackmove") {
        const utx = Math.max(0.2, Math.min(ARENA_W - 1.2, x + (u.x - cX)));
        const uty = Math.max(0.2, Math.min(ARENA_H - 1.2, y + (u.y - cY)));
        u.tx = utx; u.ty = uty; u.cmd = action; u.targetId = "";
        ai.order = action; ai.engageId = ""; ai.siegeTarget = undefined;
        moveItems.push({ u, ai, dx: utx, dy: uty });
      } else if (action === "tpmove") {
        // 🌀 Teleporto rikiuotė: VISI konverguoja TIESIAI ant pad'o (JOKIO formacijos offset) →
        //    kiekvienas užlipęs <= TP_RADIUS persikelia per sieną (_updateTeleport), paeiliui.
        u.tx = x; u.ty = y; u.cmd = "move"; u.targetId = "";
        ai.order = "move"; ai.engageId = ""; ai.siegeTarget = undefined;
      } else if (action === "attack") {
        // FOCUS-FIRE: pulti SPECIFINĮ priešo unitą (sticky engageId — vejamasi kol taikinys gyvas).
        const tgt = targetId ? this.state.units.get(targetId) : undefined;
        if (tgt && tgt.alive && tgt.team !== u.team) {
          u.cmd = "attackmove"; u.targetId = targetId;
          u.tx = tgt.x; u.ty = tgt.y;
          ai.order = "attackmove"; ai.engageId = targetId;
        }
      } else if (action === "siege") {
        // 🏰 explicit: pulti SPECIFINĘ sieną (dešinys-klikas ant sienos). Paklūsta kol siena gyva.
        const wx = Math.round(x), wy = Math.round(y);
        const seg = this._walls.find((s) => s.alive && s.x === wx && s.y === wy)
                 || this._walls.find((s) => s.alive && s.x === wx && (s.y === wy - 1 || s.y === wy + 1));
        if (seg) {
          ai.order = "siege"; ai.engageId = ""; ai.siegeTarget = { x: seg.x, y: seg.y };
          u.cmd = "attackmove"; u.targetId = "";
        }
      } else if (action === "stop") {
        u.tx = u.x; u.ty = u.y; u.cmd = "idle"; u.targetId = "";
        ai.order = "hold"; ai.engageId = ""; ai.siegeTarget = undefined;
      }
    }
    if (action === "move" || action === "attackmove") this._assignPaths(moveItems);   // 🧭 kelias pro breaches/gaps
  }

  // ───────────────────────────── simulation ─────────────────────────────
  private _tick(dtMs: number) {
    if (this._relay) return;          // host-authority: simą sukasi host kliente, serveris tik relay'ina
    if (this.state.phase !== "playing") return;
    // ⚡ S7 IDLE DOWN-SHIFT (07-12, playbook ETAPAS 3): rami namų pilis (vien savininkas, be async raido,
    //   be pending hitų, VISI unitai cmd=idle) nesuka pilno 30Hz simo — pilnas žingsnis kas 6-ą tiką (~5Hz).
    //   30Hz grįžta IŠKART: cmd/join (_simWakeUntil) arba bet kuris unitas ne-idle (busy-scan pigus, be alokacijų).
    //   Mūšiai/raidai (players>1 ar asyncRaid su AI gynėjais) NIEKADA nedaunšiftinami.
    if (this._home && !this._asyncRaid && this.state.players.size <= 1 && this._pending.length === 0 && Date.now() >= this._simWakeUntil) {
      let busy = false;
      this.state.units.forEach((u) => { if (u.alive && u.cmd !== "idle") busy = true; });
      if (!busy) {
        this._idleSkip = (this._idleSkip + 1) % 6;
        if (this._idleSkip !== 0) { this._simTime += dtMs; return; }   // sim laikrodis teka ir praleistuose tikuose
      } else this._idleSkip = 0;
    } else this._idleSkip = 0;
    this._simTime += dtMs;
    // ⚡ perf 07-06: serverTime kas ~200ms (buvo kas tiką → vienintelis BESĄLYGINIS patch churn visiems klientams
    //   20×/s; klientas serverTime NENAUDOJA — patikrinta grep 07-06, interpoliacija time-based lokaliai)
    const _nowMs = Date.now();
    if (_nowMs - (this._lastServerTimeSync || 0) >= 200) { this._lastServerTimeSync = _nowMs; this.state.serverTime = _nowMs; }
    const dt = dtMs / 1000;

    // 1. Taikinių perskaičiavimas (throttled).
    if (this._combatEnabled && this._simTime - this._lastRetarget >= RETARGET_MS) {
      this._lastRetarget = this._simTime;
      this._retargetAll();
    }
    // 2. Pozicionavimas + judėjimas + ataka (kiekvienam unitui).
    this.state.units.forEach((u) => { if (u.alive) this._stepUnit(u, dt); });
    // 2b. Unit-unit separacija — kad unitai NEsusiliptų į vieną krūvą (port iš game.js _applyF9Separation).
    this._separate(dt);
    // 2c. Kliūčių (medžiai/akmenys) push-out — unitai neperaina kiaurai (port iš game.js _f9PushOutObstacles).
    this.state.units.forEach((u) => { if (u.alive) this._pushOutObstacles(u); });
    // 2d. 🧱 Pilnos sienos side-lock — unitas lieka SAVO pusėj (vakarai/rytai), pereiti TIK pro pralaužtą segmentą.
    //     (NE _blockWallCells — tas leistų prastumti pro ploną barjerą; side-lock įsimena pusę.) PO separacijos.
    // 2d2. 🌀 Teleportas per vidurį sienos (gynėjui) — PRIEŠ side-lock, kad pusė atnaujintų teisingai.
    this._updateTeleport();
    this._sideLockWalls();
    // 2e. 💧 Grovys — nepraeinamos vandens celės (rytinė pusė, išskyrus vidurį). Net pralaužus sieną negali kirsti.
    this._blockMoatCells();
    // 2e. 🗼 Zip bokštai šaudo attackerius (bolt dmg, server-authoritative).
    this._updateTowers();
    // 3. Planuoti hit'ai (žala apskaičiuojama suplanuotu sim-laiku).
    this._processPending();
    // 4. KotH centras.
    this._updateCenter(dt);
    // 5. 🏳️ Retreat — puolikas suvedė VISUS gyvus unitus į spawn zoną (x<RETREAT_X) 5s → atsitraukia.
    this._updateRetreat(dtMs);
  }

  // 🏳️ Pozicinis retreat: kai VISI gyvi puoliko unitai grįžta į spawn zoną (x < RETREAT_X) ir palaiko
  //    RETREAT_MS → kova baigiasi (puolikas atsitraukia su likučiais, gynėjas apgynė). Veikia TIK home raide
  //    ir TIK po to, kai puolikas bent kartą buvo išėjęs iš zonos (kitaip spawn iškart skaičiuotų).
  private _updateRetreat(dtMs: number) {
    if ((!this._home && !this._asyncRaid) || this.state.phase !== "playing") return;
    let anyAtk = false, anyOut = false;
    const z = RETREAT_ZONE;
    this.state.units.forEach((u) => {
      if (!u.alive || u.team === DEFENDER_TEAM) return;
      anyAtk = true;
      const inZone = u.x >= z.x0 && u.x < z.x1 && u.y >= z.y0 && u.y < z.y1;
      if (!inZone) anyOut = true;
    });
    if (!anyAtk) { if (this._retreatMs) { this._retreatMs = 0; this._lastRetreatSec = -1; } return; }   // nėra puolikų
    if (anyOut) this._attackerEngaged = true;                  // įsitraukė (išėjo iš zonos)
    if (!this._attackerEngaged) return;                        // dar nespawnino/neišėjo → nelaikom
    if (!anyOut) {
      // VISI zonoj → kaupiam laiką + countdown klientui (throttled per sekundę)
      this._retreatMs += dtMs;
      const left = Math.max(0, Math.ceil((RETREAT_MS - this._retreatMs) / 1000));
      if (left !== this._lastRetreatSec) { this._lastRetreatSec = left; this.broadcast("retreat", { sec: left }); }
      if (this._retreatMs >= RETREAT_MS) {
        let defSid = "";
        this.state.players.forEach((p) => { if (p.team === DEFENDER_TEAM) defSid = p.sessionId; });
        this.broadcast("retreat_done", {});
        this._endMatch(defSid);   // puolikas atsitraukė → gynėjas apgynė
      }
    } else if (this._retreatMs > 0 || this._lastRetreatSec >= 0) {
      // bent vienas išėjo → reset countdown
      this._retreatMs = 0; this._lastRetreatSec = -1; this.broadcast("retreat", { sec: -1 });
    }
  }

  // Unit-unit separacija: poromis stumiam persidengiančius (port iš game.js _applyF9Separation).
  // Ghost praeina kiaurai. Kovoje (cmd=attack) silpniau (×0.5), kad nestutter'intų.
  // ⚡ perf 07-06: scratch buferiai instance-level PERNAUDOJAMI (buvo 4 naujos alokacijos KAS TIKĄ 30Hz → GC spikes)
  //   + sepRad hoist'intas iš porų kilpos (buvo ~n² kvietimų).
  private _sepUnits: F9Unit[] = [];
  private _sepPX: number[] = [];
  private _sepPY: number[] = [];
  private _sepProg: number[] = [];
  private _sepRad: number[] = [];
  private _separate(dtSec: number) {
    const units = this._sepUnits;
    units.length = 0;
    this.state.units.forEach((u) => { if (u.alive && u.utype !== "ghost") units.push(u); });
    const n = units.length;
    if (n < 2) return;
    const px = this._sepPX, py = this._sepPY, prog = this._sepProg, rad = this._sepRad;
    // 🚦 RIGHT-OF-WAY: judantis unitas TOLIAU nuo tikslo pasitraukia LABIAU; arčiau tikslo = laiko poziciją →
    //    minia formuoja EILĘ pro siaurą vietą (vartus/breach), o ne grūstį. Ne-move (idle/kova) = simetriška.
    for (let i = 0; i < n; i++) {
      px[i] = 0; py[i] = 0;
      const u = units[i]; const ai = this._ai.get(u.id);
      rad[i] = sepRad(u.utype);
      const moving = !!(ai && (ai.order === "move" || ai.order === "attackmove"));
      const dg = moving ? Math.hypot(u.x - u.tx, u.y - u.ty) : 0;
      prog[i] = (moving && dg > 0.8) ? dg : -1;   // arti tikslo (≤0.8) ARBA nejuda → SETTLE (laiko poziciją + deadzone) → nustoja grūstis atvykus
    }
    for (let i = 0; i < n; i++) {
      const a = units[i];
      for (let j = i + 1; j < n; j++) {
        const b = units[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        const minD = rad[i] + rad[j];
        if (dist >= minD) continue;
        if (dist < 0.001) { const ang = Math.random() * Math.PI * 2; dx = Math.cos(ang); dy = Math.sin(ang); dist = 1; }
        const overlap = (minD - dist) / minD;
        const nx = dx / dist, ny = dy / dist;
        const mi = prog[i] >= 0, mj = prog[j] >= 0;   // ar juda (move/attackmove)?
        // 🧍 ATVYKĘ = NEJUDINAMAS INKARAS: du atvykę + mažas persidengimas → LAIKO POZICIJĄ (0 anthill/makalavimo).
        if (!mi && !mj && overlap < 0.24) continue;
        let wI = 1, wJ = 1;
        if (mi && mj) {                                       // abu juda → eilė pagal artumą tikslui (right-of-way)
          const s = prog[i] + prog[j];
          if (s > 0.001) { wI = 2 * prog[i] / s; wJ = 2 * prog[j] / s; }   // toliau=didesnis w=pasitraukia
        } else if (mi && !mj) { wI = 2; wJ = 0; }             // i juda, j ATVYKĘS → i APEINA, j = inkaras (NEjudinamas)
        else if (!mi && mj) { wI = 0; wJ = 2; }
        px[i] += nx * overlap * wI; py[i] += ny * overlap * wI;
        px[j] -= nx * overlap * wJ; py[j] -= ny * overlap * wJ;
      }
    }
    for (let i = 0; i < n; i++) {
      if (px[i] === 0 && py[i] === 0) continue;
      const a = units[i];
      const scale = a.cmd === "attack" ? 0.5 : 1;
      a.x = Math.max(0.2, Math.min(ARENA_W - 1.2, a.x + px[i] * SEP_FORCE * dtSec * scale));
      a.y = Math.max(0.2, Math.min(ARENA_H - 1.2, a.y + py[i] * SEP_FORCE * dtSec * scale));
    }
  }

  // Kliūčių push-out: radialiai išstumia unitą iš medžių/akmenų apskritimų (port iš game.js _f9PushOutObstacles).
  private _pushOutObstacles(u: F9Unit) {
    const ur = obstRad(u.utype);
    for (const o of PVP_OBSTACLES) {
      if (o.hw !== undefined && o.hh !== undefined) {
        // KVADRATAS (AABB) — push-out per mažiausios skvarbos ašį (port iš solo _f9PushOutObstacles; zip-tower principas).
        const ex = o.hw + ur, ey = o.hh + ur;
        const dx = u.x - o.cx, dy = u.y - o.cy;
        if (Math.abs(dx) < ex && Math.abs(dy) < ey) {
          const penX = ex - Math.abs(dx), penY = ey - Math.abs(dy);
          if (penX < penY) u.x = o.cx + (dx < 0 ? -ex : ex);
          else             u.y = o.cy + (dy < 0 ? -ey : ey);
        }
      } else {
        // APSKRITIMAS — push-out radialiai.
        let dx = u.x - o.cx, dy = u.y - o.cy;
        let d = Math.sqrt(dx * dx + dy * dy);
        const minD = (o.rad || 0) + ur;
        if (d < minD) {
          if (d < 0.0001) { dx = 0; dy = -1; d = 1; }
          u.x = o.cx + (dx / d) * minD;
          u.y = o.cy + (dy / d) * minD;
        }
      }
    }
  }

  // 🏰 Side-lock: siena VERTIKALI (kolona WALL_COL) → unitas lieka SAVO pusėj (vakarai/rytai), pereiti TIK
  // pro vartus (gate rows) ARBA pralaužus segmentą. Net jei separacija/minia stumia — clamp atgal į pusę.
  // side: -1 = vakarai (attacker), 1 = rytai (defender / už sienos).
  private _sideLockWalls() {
    if (!this._walls.length) return;
    const MARGIN = 0.72;
    const wallX = WALL_COL;   // sienos centras u-space = WALL_COL (NE +0.5)
    this.state.units.forEach((u) => {
      if (!u.alive) return;
      const ai = this._ai.get(u.id);
      if (!ai) return;
      // Ar ŠIOJ eilėj yra GYVA siena (ne vartai, ne pralaužta)? jei ne — galima laisvai pereiti.
      const seg = this.state.walls.get(WALL_COL + "," + Math.round(u.y));
      const blocked = !!(seg && seg.alive);
      if (!blocked || Math.abs(u.x - wallX) > 0.9) {
        if (Math.abs(u.x - wallX) > 0.5) ai.wallSide = (u.x < wallX) ? -1 : 1;   // atnaujinam pusę kai aiškiai vienoj
        return;
      }
      let side = ai.wallSide || (u.x < wallX ? -1 : 1);
      ai.wallSide = side;
      if (side === -1 && u.x > wallX - MARGIN) u.x = wallX - MARGIN;
      else if (side === 1 && u.x < wallX + MARGIN) u.x = wallX + MARGIN;
    });
  }

  // 🗼 Zip ginybos bokštai — kiekvienas gyvas tower segmentas šauna artimiausią ATTACKERĮ (team≠DEFENDER)
  //    nuotoly TOWER_RANGE. Bolt FX klientui ('zip_shot'), žala server-authoritative po TOWER_FIRE_MS.
  private _updateTowers() {
    if (!this._combatEnabled) return;
    for (const t of this._walls) {
      if (!t.alive || !t.tower) continue;
      const key = t.x + "," + t.y;
      if ((this._towerCd[key] || 0) > this._simTime) continue;
      const tx = t.x, ty = t.y;   // bokšto centras u-space = (t.x, t.y)
      let best: F9Unit | null = null, bestD = TOWER_RANGE;
      this.state.units.forEach((u) => {
        if (!u.alive || u.team === DEFENDER_TEAM) return;   // gina pilį → šauna tik attackerius
        const d = Math.hypot(u.x - tx, u.y - ty);
        if (d < bestD) { bestD = d; best = u; }
      });
      if (!best) { this._towerCd[key] = this._simTime + 400; continue; }   // ⚡ 07-06: no-target re-scan cooldown — idle bokštas nebeskena visų unitų KAS TIKĄ (buvo 30Hz×bokštai amžinai)
      const target: F9Unit = best;
      this._towerCd[key] = this._simTime + TOWER_CD;
      this.broadcast("zip_shot", { x: t.x, y: t.y, toId: target.id, fireMs: TOWER_FIRE_MS });
      const _tdmg = towerDmgForLevel(this._buildings.towerLevel || 1);   // 🗼 žala kyla su bokšto lygiu
      this._schedule(this._simTime + TOWER_FIRE_MS, () => {
        const u = this.state.units.get(target.id);
        if (u && u.alive) this._dealDmg(u, _tdmg, undefined);
      });
    }
  }

  // 🧱 _blockWallCells PAŠALINTAS (⚡ 07-06): DEAD CODE — _tick jo nekvietė (sienos koliziją daro
  //    _sideLockWalls + _blockMoatCells; žr. komentarą _tick'e — _blockWallCells leistų prastumti pro ploną barjerą).

  // 💧 Grovio kolizija — vandens celės solidžios (NEnaikinamos). AABB push-out (centras=celė, pus-plotis=0.5+rad).
  //    2 celių plotis → unitas neprastums kiaurai. Pereiti gali TIK pro vidurio tarpą (ten grovio nėra).
  private _blockMoatCells() {
    if (!MOAT_CELLS.length) return;
    this.state.units.forEach((u) => {
      if (!u.alive) return;
      const hw = 0.5 + obstRad(u.utype);
      for (const m of MOAT_CELLS) {
        const dx = u.x - m.x, dy = u.y - m.y;
        if (Math.abs(dx) < hw && Math.abs(dy) < hw) {
          const penX = hw - Math.abs(dx), penY = hw - Math.abs(dy);
          if (penX < penY) u.x = m.x + (dx >= 0 ? hw : -hw);
          else u.y = m.y + (dy >= 0 ? hw : -hw);
        }
      }
    });
  }

  // 🏰 Artimiausia GYVA siena spinduliu r (siege auto-acquire).
  private _findWallNear(u: F9Unit, r: number): F9Wall | null {
    let best: F9Wall | null = null, bestD = r;
    for (const s of this._walls) {
      if (!s.alive) continue;
      const d = Math.hypot(u.x - s.x, u.y - s.y);   // celės centras u-space = (s.x, s.y)
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  // 🏰 Sienos siege ataka (cooldown gated). HP server-authoritative; klientui 'wall_hit'/'wall_down' FX.
  private _tryAttackWall(u: F9Unit, seg: F9Wall, st: UStat) {
    if (u.team === DEFENDER_TEAM) return;   // 🏰 GYNĖJAS (savininkas) NEGRIAUNA savo sienos — tik puolikai gali
    const ai = this._ai.get(u.id);
    if (!ai) return;
    if (this._simTime - ai.lastAtk < st.cd) return;
    ai.lastAtk = this._simTime;
    const dmg = this._rollDmg(st);
    const wx = seg.x, wy = seg.y;
    // RANGED: pridedam projektilo SKRYDŽIO laiką (kaip unit-vs-unit) — kad žala kristų KAI kulka pasiekia
    //   sieną (fireMs+travel), NE iškart po windup'o (anksčiau → „kulka dar skrenda, o dmg jau yra").
    let delay = st.fireMs, durMs = 0;
    if (!st.melee) {
      const dist = Math.hypot(u.x - wx, u.y - wy);
      const cps = SHOT_SPEED_CPS * (st.shotMul || 1);
      durMs = Math.max(150, (dist / cps) * 1000);
      delay += durMs;
    }
    this.broadcast("wall_hit", { x: wx, y: wy, by: u.id, utype: u.utype, fireMs: st.fireMs, durMs: Math.round(durMs) });
    this._schedule(this._simTime + delay, () => {
      const w = this.state.walls.get(wx + "," + wy);
      if (!w || !w.alive) return;
      w.hp = Math.max(0, w.hp - dmg);
      if (w.hp <= 0) { w.alive = false; this.broadcast("wall_down", { x: wx, y: wy }); }
    });
  }

  // 🌀 Ar VIDURIO siena (ties teleporto y ≈ ARENA_H/2) išgriauta? Tada perėjimas atviras → TP nereikalingas.
  private _midWallBreached(): boolean {
    const midY = Math.round(ARENA_H / 2);   // 12
    for (let y = midY - 1; y <= midY + 1; y++) {
      const w = this.state.walls.get(WALL_COL + "," + y);
      if (w && !w.alive) return true;       // bent vienas vidurio segmentas griuvęs → atviras perėjimas
    }
    return false;
  }

  // 🌀 TELEPORTAS per vidurį sienos — TIK gynėjo unitai. Užlipus ant pad'o → persikelia į kitą pusę
  //    (sally out arba grįžti), su cooldown (vengiam ping-pong). Puolikai NEgali — jie laužia sieną.
  private _updateTeleport() {
    // Jei vidurio siena IŠGRIAUTA → perėjimas atviras, unitai eina LAISVAI → TP IŠJUNGTAS (+pranešam klientui paslėpt pad'us).
    if (this._midWallBreached()) {
      if (!this._tpDisabled) { this._tpDisabled = true; this.broadcast("tp_off", {}); }
      return;
    }
    this.state.units.forEach((u) => {
      if (!u.alive || u.team !== DEFENDER_TEAM) return;
      const ai = this._ai.get(u.id);
      if (!ai) return;
      // EDGE-TRIGGER (user 07-03 „nusiteleportavę automatiškai eina"): teleportuoja tik NAUJAI
      //   užlipus ant pad'o — nusiteleportavęs unitas SUSTOJA ant kito pad'o ir stovi (onPad=true
      //   blokuoja pakartotinį trigger'į, tad jokio auto-ėjimo ir jokio ping-pong).
      let onIdx = -1;
      for (let i = 0; i < TP_PADS.length; i++) {
        if (Math.hypot(u.x - TP_PADS[i].x, u.y - TP_PADS[i].y) <= TP_RADIUS) { onIdx = i; break; }
      }
      const wasOn = !!ai.onPad;
      ai.onPad = onIdx >= 0;
      if (onIdx < 0 || wasOn) return;                       // ne ant pado / vis dar stovi ant pado
      if ((ai.teleCd || 0) > this._simTime) return;         // cooldown — ką tik teleportavosi
      const dest = TP_PADS[1 - onIdx];
      u.x = dest.x; u.y = dest.y;
      // SUSTOJA ant pado (hold) — toliau valdo žaidėjas. BŪTINA numesti seną pathfinding
      //   kelią/orderį: kitaip mover'is sektų likusius waypoint'us ATGAL link sienos.
      u.tx = dest.x; u.ty = dest.y; u.cmd = "idle"; u.targetId = "";
      ai.order = "hold"; ai.engageId = ""; ai.siegeTarget = undefined;
      ai.path = undefined; ai.pathIdx = 0;
      ai.leashX = dest.x; ai.leashY = dest.y;               // guard postas = padas (ne sena pozicija)
      ai.teleCd = this._simTime + TP_CD_MS;
      ai.wallSide = (dest.x < WALL_COL) ? -1 : 1;           // atnaujinam pusę → side-lock leidžia naują pusę
      ai.onPad = true;                                       // jau ant paskirties pado — edge suvartotas
      this.broadcast("teleport", { id: u.id, x: dest.x, y: dest.y });
    });
  }

  // Priešų aptikimas — artimiausias gyvas kito team unitas spinduliu r.
  private _findEnemyNear(u: F9Unit, r: number): F9Unit | null {
    let best: F9Unit | null = null, bestD = r;
    this.state.units.forEach((e) => {
      if (!e.alive || e.team === u.team || e.id === u.id) return;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }

  // Kiekvienam unitui — įsigyti/atnaujinti taikinį pagal komandą.
  private _retargetAll() {
    this.state.units.forEach((u) => {
      if (!u.alive) return;
      const ai = this._ai.get(u.id);
      if (!ai) return;
      if (ai.order !== "hold" && ai.order !== "holdpos") { ai.leashX = undefined; ai.leashY = undefined; }   // 🎯 leash postas tik default guard'ui
      if (ai.order === "move" || ai.order === "siege") { ai.engageId = ""; return; }   // move/siege ignoruoja priešus
      // Laikom galiojantį taikinį (sticky kol gyvas).
      const cur = ai.engageId ? this.state.units.get(ai.engageId) : undefined;
      if (cur && cur.alive && cur.team !== u.team) return;
      // Įsigyjam artimiausią priešą. HOLD POSITION → tik ATAKOS spinduly (nesivaiko); kiti → detect spindulys.
      const st = statOf(u.utype);
      const acqR = ai.order === "holdpos" ? Math.max(1.15, st.range) : st.detect;
      const e = this._findEnemyNear(u, acqR);
      if (e) {
        if (ai.engageId !== e.id && ai.path !== undefined) { ai.path = undefined; ai.pathIdx = 0; }   // 🧭 kovon → numetam pasenusį kelią (po kovos perskaičiuos nuo dabartinės poz.)
        if (ai.order === "hold" && ai.leashX === undefined) { ai.leashX = u.x; ai.leashY = u.y; }   // 🎯 fiksuojam postą (leash grįžimo taškas)
        ai.engageId = e.id;
      } else {
        ai.engageId = "";
      }
    });
  }

  private _stepUnit(u: F9Unit, dt: number) {
    const ai = this._ai.get(u.id);
    if (!ai) return;
    const st = statOf(u.utype);

    // Aktyvus taikinys?
    let tgt: F9Unit | undefined = ai.engageId ? this.state.units.get(ai.engageId) : undefined;
    if (tgt && (!tgt.alive || tgt.team === u.team)) { tgt = undefined; ai.engageId = ""; }

    if (this._combatEnabled && tgt) {
      const dx = tgt.x - u.x, dy = tgt.y - u.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      if (dist <= st.range) {
        // Nuotolyje: stovim, žiūrim į taikinį, atakuojam.
        u.cmd = "attack"; u.targetId = tgt.id;
        u.faceDx = dx >= 0 ? 1 : -1;
        this._tryAttack(u, tgt, st);
      } else if (ai.order === "holdpos") {
        // 🛡 HOLD POSITION: taikinys išėjo iš atakos spindulio → NEsivaikom. Numetam taikinį, liekam inkare.
        ai.engageId = ""; u.targetId = "";
        const hx = ai.holdX ?? u.x, hy = ai.holdY ?? u.y;
        if (Math.hypot(u.x - hx, u.y - hy) > 0.15) { this._moveToward(u, hx, hy, st.speed, dt); u.cmd = "move"; }
        else u.cmd = "idle";
      } else if (ai.order === "hold") {
        // 🎯 DEFENSIVE LEASH (default guard): vaikom priešą TIK iki (detect+2) nuo POSTO; per toli → numetam ir grįžtam.
        const ax = ai.leashX ?? u.x, ay = ai.leashY ?? u.y;
        if (Math.hypot(u.x - ax, u.y - ay) > st.detect + 2.0) {
          ai.engageId = ""; u.targetId = "";
          if (Math.hypot(u.x - ax, u.y - ay) > 0.25) { this._moveToward(u, ax, ay, st.speed, dt); u.cmd = "move"; }
          else u.cmd = "idle";
        } else {
          const desired = st.melee ? Math.max(0.6, st.range * 0.85) : Math.max(0.5, st.range - 0.5);
          this._moveToward(u, tgt.x - (dx / dist) * desired, tgt.y - (dy / dist) * desired, st.speed, dt);
          u.cmd = "attackmove"; u.targetId = tgt.id;
        }
      } else {
        // Per toli: einam į poziciją (melee — arti; ranged — laikom nuotolį). (attackmove/patrol — BE leash, žaidėjo valia)
        const desired = st.melee ? Math.max(0.6, st.range * 0.85) : Math.max(0.5, st.range - 0.5);
        const gx = tgt.x - (dx / dist) * desired;
        const gy = tgt.y - (dy / dist) * desired;
        this._moveToward(u, gx, gy, st.speed, dt);
        u.cmd = "attackmove"; u.targetId = tgt.id;
      }
      return;
    }

    // 🏰 EXPLICIT siege — dešinys-klikas ant SPECIFINĖS sienos: eik prie jos ir daužk (paklūsta kol gyva,
    // ignoruoja auto-acquire range — kaip focus-fire ant konkretaus priešo).
    if (this._combatEnabled && ai.order === "siege" && ai.siegeTarget) {
      const tgtSeg = this._walls.find((s) => s.alive && s.x === ai.siegeTarget!.x && s.y === ai.siegeTarget!.y);
      if (!tgtSeg) { ai.order = "hold"; ai.siegeTarget = undefined; }
      else {
        // Cell CENTRAS u-space = (x, y) (NE +0.5 — kaip obstacle; unitas u.x=seg.x centruotas ant celės).
        const range = Math.max(1.15, st.range);
        const wx = tgtSeg.x, wy = tgtSeg.y;
        const d = Math.hypot(u.x - wx, u.y - wy);
        if (d <= range) {
          u.cmd = "attack"; u.targetId = "";
          u.faceDx = (wx - u.x) >= 0 ? 1 : -1;
          this._tryAttackWall(u, tgtSeg, st);
        } else {
          // einam prie sienos CENTRO (wx,wy) — side-lock sustabdys ties siena, attack range'e (melee pasiekia).
          this._moveToward(u, wx, wy, st.speed, dt);
          u.cmd = "attackmove";
        }
        return;
      }
    }

    // 🏰 AUTO wall siege — be priešo taikinio, jei ARTI sienos (≤1.5) → puola ją. TIK VAKARŲ pusė (attacker):
    // defenderis (rytuose, u.x > WALL_COL) NEdaužo savo sienos. grynas „move" (atsitraukimas) IGNORUOJA sieną.
    if (this._combatEnabled && this._walls.length && ai.order !== "move" && ai.order !== "holdpos" && ai.order !== "patrol" && u.x < WALL_COL) {
      const seg = this._findWallNear(u, 1.5);
      if (seg) {
        const range = Math.max(1.15, st.range);
        const wx = seg.x, wy = seg.y;   // cell centras u-space = (seg.x, seg.y)
        const d = Math.hypot(u.x - wx, u.y - wy);
        if (d <= range) {
          u.cmd = "attack"; u.targetId = "";
          u.faceDx = (wx - u.x) >= 0 ? 1 : -1;
          this._tryAttackWall(u, seg, st);
        } else {
          this._moveToward(u, wx, wy, st.speed, dt);   // prie sienos centro — side-lock sustabdo attack range'e
          u.cmd = "attackmove";
        }
        return;
      }
    }

    // Be taikinio — vykdom komandą.
    if (ai.order === "move" || ai.order === "attackmove") {
      // 🧭 po kovos kelias numestas (undefined) → perskaičiuojam nuo DABARTINĖS poz. (kad NEbacktrackintų į startą).
      if (F9_PATHFIND && ai.path === undefined && Math.hypot(u.tx - u.x, u.ty - u.y) > 1.5) {
        const field = this._bfsField(Math.round(u.tx), Math.round(u.ty));
        const wps = field ? this._pathWaypoints(field, u.x, u.y) : null;
        ai.path = (wps && wps.length) ? wps.concat([{ x: u.tx, y: u.ty }]) : [];   // [] = bandyta (nebekartos)
        ai.pathIdx = 0;
      }
      // 🧭 pathfinding: seka waypoint'us (apeina sieną/griovį pro breaches/gaps); kai path baigtas → galutinis tx/ty.
      let gx = u.tx, gy = u.ty, following = false;
      if (ai.path && ai.path.length) {
        let pi = ai.pathIdx ?? 0;
        while (pi < ai.path.length && Math.hypot(u.x - ai.path[pi].x, u.y - ai.path[pi].y) <= PATH_ARRIVE) pi++;
        ai.pathIdx = pi;
        if (pi < ai.path.length) { gx = ai.path[pi].x; gy = ai.path[pi].y; following = true; }
      }
      if (!following && Math.hypot(u.tx - u.x, u.ty - u.y) < ARRIVE_EPS) {
        u.x = u.tx; u.y = u.ty; u.cmd = "idle"; u.targetId = "";
        ai.order = "hold"; ai.path = undefined;
      } else {
        this._moveToward(u, gx, gy, st.speed, dt);
        u.cmd = ai.order;
      }
    } else if (ai.order === "holdpos") {
      // 🛡 HOLD POSITION be taikinio — laikom inkarą (jei nustumtas separacijos — grįžtam).
      const hx = ai.holdX ?? u.x, hy = ai.holdY ?? u.y;
      if (Math.hypot(u.x - hx, u.y - hy) > 0.15) { this._moveToward(u, hx, hy, st.speed, dt); u.cmd = "move"; }
      else u.cmd = "idle";
      u.targetId = "";
    } else if (ai.order === "patrol") {
      // 🚩 PATROL be taikinio — judam į dabartinį tašką; pasiekus (≤PATROL_ARRIVE) → kitas (loop A→B→C→A).
      const pts = ai.patrolPts;
      if (pts && pts.length) {
        let i = ai.patrolIdx ?? 0;
        if (i < 0 || i >= pts.length) i = 0;
        if (Math.hypot(u.x - pts[i].x, u.y - pts[i].y) <= PATROL_ARRIVE) i = (i + 1) % pts.length;
        ai.patrolIdx = i;
        const wp = pts[i];
        this._moveToward(u, wp.x, wp.y, st.speed, dt);
        u.cmd = "move"; u.targetId = ""; u.tx = wp.x; u.ty = wp.y;
      } else { u.cmd = "idle"; u.targetId = ""; }
    } else {
      u.cmd = "idle"; u.targetId = "";
    }
  }

  // Judėjimas link (gx,gy) per dt su greičiu speed (cell/s). Keičia tik x/y (NE tx/ty —
  // kad po taikinio mirties attack-move tęstų į pradinę destinaciją).
  private _moveToward(u: F9Unit, gx: number, gy: number, speed: number, dt: number) {
    const dx = gx - u.x, dy = gy - u.y;
    const d = Math.hypot(dx, dy);
    const step = speed * dt;
    if (d <= step || d < 0.001) { u.x = gx; u.y = gy; }
    else {
      u.x += (dx / d) * step;
      u.y += (dy / d) * step;
      u.faceDx = dx >= 0 ? 1 : -1;
    }
    if (u.x < 0) u.x = 0; else if (u.x > ARENA_W) u.x = ARENA_W;
    if (u.y < 0) u.y = 0; else if (u.y > ARENA_H) u.y = ARENA_H;
  }

  // ══ 🧭 PATHFINDING (flow-field pro breaches/moat-gaps) ═══════════════════════
  // Praeinama celė: ribose + JOKIOS gyvos sienos/bokšto (breach=dead→praeinama) + JOKIO griovio (gaps praeinami).
  private _walkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= ARENA_W || y >= ARENA_H) return false;
    const w = this.state.walls.get(x + "," + y);
    if (w && w.alive) return false;
    if (MOAT_SET.has(x + "," + y)) return false;
    return true;
  }
  private _nearestWalkable(x: number, y: number): { x: number; y: number } | null {
    x = Math.round(x); y = Math.round(y);
    if (this._walkable(x, y)) return { x, y };
    for (let r = 1; r <= 8; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      if (this._walkable(x + ox, y + oy)) return { x: x + ox, y: y + oy };
    }
    return null;
  }
  private _bfsField(tx: number, ty: number): Map<string, number> | null {
    const goal = this._nearestWalkable(tx, ty); if (!goal) return null;
    const dist = new Map<string, number>();
    const K = (x: number, y: number) => x + "," + y;
    dist.set(K(goal.x, goal.y), 0);
    const q: { x: number; y: number }[] = [goal]; let head = 0;
    while (head < q.length) {
      const c = q[head++]; const d = dist.get(K(c.x, c.y))!;
      for (const [ox, oy] of PF_N8) {
        const nx = c.x + ox, ny = c.y + oy;
        if (ox && oy && (!this._walkable(c.x + ox, c.y) || !this._walkable(c.x, c.y + oy))) continue;   // jokio corner-cut
        if (!this._walkable(nx, ny)) continue;
        const k = K(nx, ny); if (dist.has(k)) continue;
        dist.set(k, d + 1); q.push({ x: nx, y: ny });
      }
    }
    return dist;
  }
  private _lineWalkable(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0, guard = 0;
    while (guard++ < 400) {
      if (!this._walkable(x, y)) return false;
      if (x === x1 && y === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return false;
  }
  private _pathWaypoints(dist: Map<string, number>, ux: number, uy: number): { x: number; y: number }[] | null {
    const K = (x: number, y: number) => x + "," + y;
    let cx = Math.round(ux), cy = Math.round(uy);
    if (!dist.has(K(cx, cy))) { const w = this._nearestWalkable(cx, cy); if (!w || !dist.has(K(w.x, w.y))) return null; cx = w.x; cy = w.y; }
    const raw: { x: number; y: number }[] = [{ x: cx, y: cy }]; let guard = 0;
    while ((dist.get(K(cx, cy)) ?? 0) > 0 && guard++ < 2000) {
      let best: { x: number; y: number } | null = null; let bd = dist.get(K(cx, cy))!;
      for (const [ox, oy] of PF_N8) {
        const nx = cx + ox, ny = cy + oy, k = K(nx, ny);
        if (!dist.has(k)) continue;
        if (ox && oy && (!this._walkable(cx + ox, cy) || !this._walkable(cx, cy + oy))) continue;
        const nd = dist.get(k)!;
        if (nd < bd) { bd = nd; best = { x: nx, y: ny }; }
      }
      if (!best) break;
      cx = best.x; cy = best.y; raw.push({ x: cx, y: cy });
    }
    if (raw.length < 2) return null;
    const out: { x: number; y: number }[] = [raw[0]]; let i = 0;   // LOS string-pull
    while (i < raw.length - 1) {
      let j = raw.length - 1;
      while (j > i + 1 && !this._lineWalkable(raw[i].x, raw[i].y, raw[j].x, raw[j].y)) j--;
      out.push(raw[j]); i = j;
    }
    return out.slice(1);   // be pirmos (dabartinė celė)
  }
  // Priskiria kelius grupei: 1 BFS field nuo destinacijų centroido, per-unit trace + galutinis slotas.
  private _assignPaths(items: { u: F9Unit; ai: AIState; dx: number; dy: number }[]) {
    if (!F9_PATHFIND || !items.length) { for (const it of items) { it.ai.path = undefined; } return; }
    let cx = 0, cy = 0;
    for (const it of items) { cx += it.dx; cy += it.dy; }
    cx /= items.length; cy /= items.length;
    const field = this._bfsField(Math.round(cx), Math.round(cy));
    for (const it of items) {
      const wps = field ? this._pathWaypoints(field, it.u.x, it.u.y) : null;
      if (wps && wps.length) { it.ai.path = wps.concat([{ x: it.dx, y: it.dy }]); it.ai.pathIdx = 0; }
      else { it.ai.path = []; it.ai.pathIdx = 0; }   // [] = bandyta, nėra kelio (undefined = reikia perskaičiuoti po kovos)
    }
  }

  // Atakos paleidimas (cooldown gated). Melee → hit po fireMs; ranged → fire po fireMs, tada
  // projektilas keliauja dist/SHOT_SPEED, impact metu — žala. Žala server-authoritative;
  // klientui siunčiam lengvą „melee"/„shot" event'ą vizualui.
  private _tryAttack(u: F9Unit, tgt: F9Unit, st: UStat) {
    const ai = this._ai.get(u.id);
    if (!ai) return;
    if (this._simTime - ai.lastAtk < st.cd) return;
    ai.lastAtk = this._simTime;
    const attackerId = u.id;

    if (st.melee) {
      this.broadcast("melee", { id: u.id, utype: u.utype, toId: tgt.id, fireMs: st.fireMs });
      if (u.utype === "pigronke") {
        // HOG RIDER AOE — žala VISIEMS priešams priekiniame kūgyje (ellipse + fallback circle).
        // Port iš game.js _pigronkeSpearAttack (aoeRange=range+0.15, aoeWidthY=0.65, zone RX/RY ×0.65/0.95).
        const faceDx = u.faceDx >= 0 ? 1 : -1;
        this._schedule(this._simTime + st.fireMs, () => {
          const a = this.state.units.get(attackerId);
          if (!a || !a.alive) return;
          const sx = a.x, sy = a.y;
          const aoeRange = st.range + 0.15, aoeWidthY = 0.65;
          const zoneCx = sx + faceDx * aoeRange * 0.5;
          const zoneRX = aoeRange * 0.65, zoneRY = aoeWidthY * 0.95, fallbackR = aoeRange * 0.65;
          this.state.units.forEach((en) => {
            if (!en.alive || en.team === a.team) return;   // tik priešai (ne savi)
            const ndx = (en.x - zoneCx) / zoneRX, ndy = (en.y - sy) / zoneRY;
            const inEllipse = (ndx * ndx + ndy * ndy <= 1.0);
            const fwd = (en.x - sx) * faceDx;
            const inCircle = fwd > -0.12 && (Math.hypot(en.x - sx, en.y - sy) <= fallbackR);
            if (!inEllipse && !inCircle) return;
            if (Math.random() < MISS_CHANCE) { this.broadcast("miss", { id: en.id, x: en.x, y: en.y }); return; }
            this._dealDmg(en, this._rollDmg(st), a);
          });
        });
        return;
      }
      const dmg = this._rollDmg(st);
      this._schedule(this._simTime + st.fireMs, () => {
        const a = this.state.units.get(attackerId);
        const t = this.state.units.get(tgt.id);
        if (!a || !a.alive || !t || !t.alive) return;
        if (Math.hypot(t.x - a.x, t.y - a.y) > st.range + 0.3) return;
        if (Math.random() < MISS_CHANCE) { this.broadcast("miss", { id: t.id, x: t.x, y: t.y }); return; }
        this._dealDmg(t, dmg, a);
      });
    } else {
      // RANGED: 'shot' broadcast IŠŠOVIMO PRADŽIOJ (t0) su fireMs+travel → klientas daro pilną seką
      // (windup anim → po fireMs projektilas → travel), kad ETAPAI būtų sklandūs IR projektilas nukristų
      // BŪTENT kai serveris pritaiko žalą (fireMs+travel). (Anksčiau shot ėjo po fireMs → windup/iššovimo tarpas.)
      const shotId = tgt.id;
      const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);
      const cps = SHOT_SPEED_CPS * (st.shotMul || 1);
      const travel = Math.max(150, (dist / cps) * 1000);
      const dmg = this._rollDmg(st);
      this.broadcast("shot", { fromId: u.id, toId: shotId, utype: u.utype, fireMs: st.fireMs, durMs: Math.round(travel) });
      this._schedule(this._simTime + st.fireMs + travel, () => {
        const t2 = this.state.units.get(shotId);
        const a2 = this.state.units.get(attackerId);
        if (!t2 || !t2.alive) return;
        if (Math.random() < MISS_CHANCE) { this.broadcast("miss", { id: t2.id, x: t2.x, y: t2.y }); return; }
        this._dealDmg(t2, dmg, a2 || undefined);
      });
    }
  }

  private _rollDmg(st: UStat): number {
    let d = st.dmgMin + Math.floor(Math.random() * (st.dmgMax - st.dmgMin + 1));
    if (st.crit && Math.random() < st.crit) d *= 2;   // ronhood 1% ×2
    return Math.max(1, d);
  }

  private _dealDmg(tgt: F9Unit, dmg: number, attacker?: F9Unit) {
    if (!tgt.alive) return;
    this._lastActivity = Date.now();   // 🧟 vyksta kova → reaper NEnukirps aktyvaus mūšio
    tgt.hp = Math.max(0, tgt.hp - dmg);
    this.broadcast("hit", { id: tgt.id, dmg, by: attacker ? attacker.id : "" });
    // Atsakomoji ugnis: jei taikinys be taikinio ir laikosi/idle — atsisuka į puolėją.
    const tai = this._ai.get(tgt.id);
    if (tgt.hp > 0 && attacker && attacker.alive && tai && tai.order !== "move" && !tai.engageId) {
      tai.engageId = attacker.id;
    }
    if (tgt.hp <= 0) {
      tgt.alive = false;
      tgt.cmd = "idle"; tgt.targetId = "";
      // 🏥 LIGONINĖ (tik home/raid): NFT unitas krito → 90% sužalotas (gydosi), 10% tikra mirtis.
      //   Savininkas: gynėjo unitams = pilies owner; puoliko — jo paties wallet. Dev tokenai neliečiami.
      if ((this._home || this._asyncRaid) && tgt.tokenId && !/^dev/i.test(tgt.tokenId)) {
        const ownAddr = tgt.owner === "AI_DEFENDER"
          ? this._ownerAddr
          : String(this.state.players.get(tgt.owner)?.address || "").trim().toLowerCase();
        if (ownAddr) {
          const res = this._rollInjury(ownAddr, tgt);
          this._battleFates.set(tgt.id, res.fate);   // ⚔ šio mūšio likimas (abiejų komandų → settled ekranas)
          if (ownAddr === this._ownerAddr) {   // 📜 gynėjo nuostolis per raidą → ataskaitai
            if (res.fate === "dead") this._raidKilled.add(tgt.tokenId); else this._raidInjured.add(tgt.tokenId);
          }
          const payload = { tokenId: tgt.tokenId, utype: tgt.utype, level: tgt.level || 0, fate: res.fate, eta: res.eta, queuePos: res.queuePos };
          for (const c of this.clients) {   // pranešam SAVININKUI, jei jis šiame kambaryje
            const cp = this.state.players.get(c.sessionId);
            if (cp && String(cp.address || "").trim().toLowerCase() === ownAddr) {
              try { c.send("injured", payload); } catch (_) {}
              if (res.fate === "injured") { try { c.send("hospital", this._hospPayload(ownAddr)); } catch (_) {} }   // šviežia eilė UI'ui
            }
          }
          console.log(`[F9PvpRoom] 🏥 ${tgt.utype}#${tgt.tokenId} (${ownAddr.slice(0, 10)}…) → ${res.fate}${res.queuePos >= 0 ? " (eilė #" + (res.queuePos + 1) + ")" : ""}`);
        }
      }
      let _boneGain = 0, _boneLucky = false;
      if (attacker) {
        const aai = this._ai.get(attacker.id); if (aai) aai.kills++;
        // 🦴 PER-KILL roll: puolikas svyruoja 1.1–1.5, gynėjas stabilus 1.0; + RonkePower bonusas.
        //    🍀 LUCKY (5% → bazė 2.0) VISIEMS, bet TIK jei RonkePower > 0 (0pw = be lucky dropo).
        const kp = this.state.players.get(attacker.owner);
        if (kp) {
          const power = this._bonePower.get(attacker.owner) || 0;
          const powerBonus = Math.min(BONE_POWER_MAX_BONUS, (power / BONE_POWER_MAX) * BONE_POWER_MAX_BONUS);
          let rolledBase: number;
          if (power > 0 && Math.random() < BONE_LUCKY_CHANCE) {                         // 🍀 LUCKY — abiem pusėm
            rolledBase = BONE_LUCKY_MULT; _boneLucky = true;
          } else if (kp.team !== DEFENDER_TEAM) {                                       // PUOLIKAS — svyruoja
            rolledBase = BONE_ATK_MIN + Math.random() * (BONE_ATK_MAX - BONE_ATK_MIN);
          } else rolledBase = BONE_MULT_DEFENDER;                                       // GYNĖJAS — stabilus 1.0
          _boneGain = Math.round((rolledBase + powerBonus) * 10) / 10;
          kp.bones = Math.round((kp.bones + _boneGain) * 10) / 10;
        }
      }
      this.broadcast("died", { id: tgt.id, by: attacker ? attacker.id : "", bg: _boneGain, lucky: _boneLucky });
      this._tryReinforce(tgt);   // 🪖 rezervas įeina PRIEŠ checkWin → pastiprinimas laiko komandą gyvą
      this._checkWin();
    }
  }

  private _schedule(at: number, fn: () => void) { this._pending.push({ at, fn }); }
  private _processPending() {
    if (this._pending.length === 0) return;
    const now = this._simTime;
    // ⚡ perf 07-06: vienas in-place partition pass (buvo 2× .filter() = 2 naujos masyvų alokacijos kas tiką kovoje)
    let w = 0;
    const ready: { at: number; fn: () => void }[] = [];
    for (let i = 0; i < this._pending.length; i++) {
      const p = this._pending[i];
      if (p.at <= now) ready.push(p);
      else this._pending[w++] = p;
    }
    if (ready.length === 0) return;
    this._pending.length = w;
    for (const p of ready) { try { p.fn(); } catch (_) { /* swallow */ } }
  }

  // 🏰 Castle capture (KotH za sienos): vienintelis team zonoj → progresuoja link užėmimo (CAPTURE_SECS).
  //   Savininkas re-securina → progresas atstatomas. 2+ team → ginčas (užšaldyta). Tuščia → progresas krenta.
  //   Užima (100%) → capOwner persijungia, broadcast'inam "castle_captured". + paliekam RONKE drip lone team'ui.
  private _updateCenter(dt: number) {
    const counts = [0, 0, 0, 0];
    let lastTeam = -1;
    this.state.units.forEach((u) => {
      if (!u.alive) return;
      const dx = u.x - CAP_X, dy = u.y - CAP_Y;
      if (dx * dx + dy * dy <= CAP_R * CAP_R) { counts[u.team]++; lastTeam = u.team; }
    });
    const teamsIn = (counts[0] > 0 ? 1 : 0) + (counts[1] > 0 ? 1 : 0) + (counts[2] > 0 ? 1 : 0) + (counts[3] > 0 ? 1 : 0);
    const contested = teamsIn > 1;
    if (this.state.centerContested !== contested) this.state.centerContested = contested;
    if (this.state.capContested !== contested) this.state.capContested = contested;

    // ── Capture progresas (FLOAT akumuliatorius; schema capPct = round() rodymui).
    //    Greitis × unitų skaičius zonoj: 1 unitas = lėtai (CAPTURE_SECS), kuo daugiau — tuo greičiau (iki CAP_MAX_UNITS×). ──
    let capCnt = 0;
    if (teamsIn === 1) {
      const T = lastTeam;
      if (T === this.state.capOwner) {
        // savininkas zonoj — re-securina pilį, grąžinam iššūkėjo progresą į 0
        if (this._capProgress !== 0) this._capProgress = 0;
        if (this.state.capTeam !== -1) this.state.capTeam = -1;
      } else {
        // iššūkėjas užiminėja — greitis ∝ unitų skaičius
        if (this.state.capTeam !== T) { this.state.capTeam = T; this._capProgress = 0; }
        capCnt = counts[T];
        const speedMul = Math.min(capCnt, CAP_MAX_UNITS);
        this._capProgress += (dt / CAPTURE_SECS) * 100 * speedMul;
        if (this._capProgress >= 100) {
          this.state.capOwner = T;
          this._capProgress = 0;
          this.state.capTeam = -1;
          let sid = ""; this.state.players.forEach((p) => { if (p.team === T) sid = p.sessionId; });
          this.broadcast("castle_captured", { team: T, sid });
        }
      }
    } else if (teamsIn === 0) {
      // tuščia → iššūkėjo progresas po truputį krenta
      if (this._capProgress > 0) {
        this._capProgress -= (dt / DECAY_SECS) * 100;
        if (this._capProgress <= 0) { this._capProgress = 0; if (this.state.capTeam !== -1) this.state.capTeam = -1; }
      }
    }
    // contested (teamsIn>1) → progresas užšaldytas (nieko nekeičiam)
    const _disp = Math.max(0, Math.min(100, Math.round(this._capProgress)));
    if (this.state.capPct !== _disp) this.state.capPct = _disp;
    if (this.state.capCount !== capCnt) this.state.capCount = capCnt;

    // ── RONKE drip lone team'ui zonoj (esamas KotH elgesys — paliekam, FAZA D pertvarkysim į capOwner hold) ──
    let holderSid = "";
    if (teamsIn === 1) {
      this.state.players.forEach((p) => { if (p.team === lastTeam) holderSid = p.sessionId; });
      const holder = holderSid ? this.state.players.get(holderSid) : undefined;
      if (holder) {
        let drip = CENTER_RONKE_PER_SEC * dt;
        if (this.state.entryFee > 0) {           // staked: laša IŠ pot (zero inflation)
          drip = Math.min(this.state.pot, drip);
          this.state.pot -= drip;
        }
        holder.ronkePending += drip;             // free režime drip = inflacinis (kaip anksčiau)
      }
    }
    if (this.state.centerHolderSid !== holderSid) this.state.centerHolderSid = holderSid;
  }
}
