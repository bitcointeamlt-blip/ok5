# PvP04 – Clean DOT PvP Build

Šiame kataloge yra minimali, sutvarkyta DOT PvP žaidimo versija:

- **Frontend** (`package.json`, `src/`, `public/`): Vite + TypeScript klientas su Supabase ir Colyseus integracija.
- **colyseus-server/**: Colyseus Node.js serveris (TypeScript) su CORS override'u ir PM2 `ecosystem.config.js`.
- **netlify.toml** ir `_redirects`: paruošta Netlify deploy'ui.

## Naudojimas

```bash
cd pvp04
npm install
npm run dev          # http://localhost:5173

# Colyseus serveris
cd colyseus-server
npm install
npm run dev          # ws://localhost:2567
```

## Deploy

1. **Colyseus Cloud**  
   - `cd colyseus-server` → `npm run build`  
   - įkelkite `build/`, `package.json`, `package-lock.json`, `ecosystem.config.js`, `Procfile`.
2. **Netlify**  
   - `npm run build` prieš deploy.  
   - Jei `VITE_COLYSEUS_ENDPOINT` nenustatytas, klientas naudoja `https://de-fra-f8820c12.colyseus.cloud`.

## Struktūra

```
pvp04/
  public/
  src/
  colyseus-server/
  netlify.toml
  package.json
  tsconfig.json
  vite.config.ts
```

Visi senesni dokumentacijos ir atsarginių failų šiukšlynai pašalinti – liko tik būtini komponentai PvP režimui.


