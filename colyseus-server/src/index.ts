// 🔐 ENV: prod'e (Colyseus Cloud, NODE_ENV=production) PIRMENYBĖ .env.production (prod-safe reikšmės,
//   BE Saigon swap konfigo) — lokalus .env į bundle nekeliauja (.colyseusignore). Lokaliai — tik .env.
import { config as dotenvConfig } from "dotenv";
dotenvConfig(process.env.NODE_ENV === "production" ? { path: [".env.production", ".env"] } : undefined);

/* 🛟💥 PROCESO SAUGIKLIS (2026-09-20). Serveryje NEBUVO nė vieno globalaus gaudyklės, o Node 15+
 * neapdorotą promise rejection traktuoja kaip mirtiną: VIENAS pamirštas `catch` bet kurioje vietoje
 * numuša procesą, o kartu — VISUS gyvus kambarius. Žaidėjams tai atrodo kaip „atsijungimas iš niekur":
 * Tetris mačas nutrūksta dėl klaidos, kuri įvyko visai kitoje (pvz. pilies) dalyje, ir dar kainuoja
 * statymą, nes `onLeave` po 8 s skelbia `_winByLeave`.
 * Čia klaidą GARSIAI užrašom ir procesą paliekam gyvą: viena nepavykusi operacija yra daug mažesnė
 * blogybė nei visų vykstančių mačų nutraukimas. Eilutė su `[FATAL-GUARD]` logeuose = vieta, kurią
 * reikia ištaisyti normaliai (ji nebeslepiama, kaip būdavo iki šiol). */
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL-GUARD] unhandledRejection:", reason instanceof Error ? (reason.stack || reason.message) : reason);
});
process.on("uncaughtException", (err) => {
  console.error("[FATAL-GUARD] uncaughtException:", err && (err.stack || err.message));
});

import { listen } from "@colyseus/tools";
import app from "./app.config";

listen(app);
