/* loadGame.ts — įkelia GRYNUS RONKE BLOCKS modulius (tuos pačius, kuriuos sukа klientas)
 * į izoliuotą vm sandbox'ą su fake `window`. Taip serveris autoritetingai suka TĄ PATĮ
 * koridoriaus/kariuomenės kodą (`army.js`) be dublikavimo. Jokio DOM — Units.stats ima iš
 * f12_data (be paveikslų). Failai kopijuojami į `./game/` (žr. blocks/game). */
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

const FILES = [
  "f12_data.js", "config.js", "rng.js", "pieces.js",
  "board.js", "garbage.js", "units.js", "army.js",
  "engine.js",   // A6 2 sluoksnis: serveris pats sukа LENTAS autoritetingai (DOM-free variklis)
];

export interface GameLib {
  Army: any;
  Engine: any;
  RNG: any;
  CFG: any;
  Units: any;
  PIECES: any;
  window: any;
}

export function loadGameLib(): GameLib {
  const win: any = {};
  win.window = win;
  win.performance = { now: () => 0 };
  const sandbox: any = {
    window: win, console, Math, Date, JSON, Array, Object, String, Number,
    performance: win.performance,
  };
  vm.createContext(sandbox);

  // Dev (ts-node-dev): __dirname = src/blocks. Build (tsc): __dirname = build/blocks.
  // Abiem atvejais game/ turi būti šalia (build skripte nukopijuojam — žr. package.json postbuild).
  const dir = path.join(__dirname, "game");
  for (const f of FILES) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), sandbox, { filename: "blocks/game/" + f });
  }

  return { Army: win.Army, Engine: win.Engine, RNG: win.RNG, CFG: win.CFG, Units: win.Units, PIECES: win.PIECES, window: win };
}
