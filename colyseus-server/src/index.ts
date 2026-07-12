// 🔐 ENV: prod'e (Colyseus Cloud, NODE_ENV=production) PIRMENYBĖ .env.production (prod-safe reikšmės,
//   BE Saigon swap konfigo) — lokalus .env į bundle nekeliauja (.colyseusignore). Lokaliai — tik .env.
import { config as dotenvConfig } from "dotenv";
dotenvConfig(process.env.NODE_ENV === "production" ? { path: [".env.production", ".env"] } : undefined);
import { listen } from "@colyseus/tools";
import app from "./app.config";

listen(app);
