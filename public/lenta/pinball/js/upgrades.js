// upgrades.js — roguelike upgrade'ai, renkami pakilus į naują aukštą.
// Kiekvienas upgrade'as apply(game) mutina CONFIG ir/arba game būseną.
// CONFIG mutacijos „prilimpa" kitiems aukštams (jie perstatomi iš CONFIG),
// o Game._restoreBase() atstato originalus per restart.
const UPGRADES = [
  { id: 'power_flip', name: 'POWER FLIPPERS', desc: '+12% flipper kick', color: '#ff6f4f',
    apply: (g) => { CONFIG.flipper.kick += 0.12; } },
  { id: 'long_flip', name: 'LONG FLIPPERS', desc: '+5 flipper length', color: '#4fbf5a',
    apply: (g) => { CONFIG.flipper.length += 5; for (const f of g.flippers) { f.length += 5; f._recalcTip(); } } },
  { id: 'score15', name: 'SCORE x1.5', desc: 'All points x1.5', color: '#f5c93a',
    apply: (g) => { g.score.scoreMult *= 1.5; } },
  { id: 'jackpot_bump', name: 'JACKPOT BUMPERS', desc: 'Bumpers hit harder + more pts', color: '#3f9fe8',
    apply: (g) => { CONFIG.bumper.impulse += 30; CONFIG.bumper.score += 50; } },
  { id: 'wide_gate', name: 'WIDE EXIT', desc: 'Ceiling gate opens longer', color: '#8fe4ff',
    apply: (g) => { CONFIG.gate.openSec += 1.2; } },
  { id: 'ball_save', name: 'BALL SAVE', desc: 'Survive one bad drain', color: '#b6ff7b',
    apply: (g) => { g.ballSaves += 1; } },
  { id: 'low_grav', name: 'FLOATY BALL', desc: 'Lower gravity', color: '#c9a6ff',
    apply: (g) => { CONFIG.gravity = Math.max(200, CONFIG.gravity - 28); } },
  { id: 'combo_long', name: 'COMBO KEEPER', desc: 'Combo lasts longer', color: '#ff9f43',
    apply: (g) => { CONFIG.combo.window += 0.5; } },
];

// Parink n atsitiktinių (be pasikartojimo tame pačiame pasirinkime; tarp aukštų gali kartotis → stackinasi).
function rollUpgrades(n) {
  const pool = UPGRADES.slice();
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
