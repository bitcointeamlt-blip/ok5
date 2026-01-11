# PvP Serverių Sąrašo Valdymas

## 📍 Vieta

PvP serverių sąrašas yra `src/simple-main.ts` faile, **eilutėse 54-79**.

## 🔧 Kaip Pridėti Naują Serverį

### 1. Atidarykite `src/simple-main.ts` failą

### 2. Raskite `serverPresets` masyvą (eilutė 54)

### 3. Pridėkite naują serverį

**Lokaliame režime (localhost):**
```typescript
const serverPresets: PvpServerPreset[] = isLocalhost
  ? [
      {
        id: 'local',
        name: 'Localhost',
        region: 'LOCAL',
        endpoint: defaultLocalColyseusHttp,
        description: 'Local Colyseus server'
      },
      {
        id: 'eu-central',
        name: 'Europe - Frankfurt',
        region: 'EU',
        endpoint: defaultCloudColyseusHttp,
        description: 'Primary Colyseus Cloud server'
      },
      // PRIDĖKITE ČIA NAUJĄ SERVERĮ:
      {
        id: 'us-east',                    // Unikalus ID
        name: 'US East - New York',        // Rodytinas vardas
        region: 'US',                      // Regionas
        endpoint: 'https://us-east.example.com',  // Serverio URL
        description: 'US East server'     // Aprašymas (optional)
      }
    ]
  : [
      // Production serveriai čia
  ];
```

**Production režime:**
```typescript
const serverPresets: PvpServerPreset[] = isLocalhost
  ? [ /* localhost serveriai */ ]
  : [
      {
        id: 'eu-central',
        name: 'Europe - Frankfurt',
        region: 'EU',
        endpoint: fallbackColyseusEndpoint,
        description: 'Primary Colyseus Cloud server'
      },
      // PRIDĖKITE ČIA NAUJĄ SERVERĮ:
      {
        id: 'us-west',
        name: 'US West - California',
        region: 'US',
        endpoint: 'https://us-west.example.com',
        description: 'US West server'
      }
    ];
```

## 📋 Serverio Objekto Laukai

| Laukas | Tipas | Aprašymas | Pavyzdys |
|--------|-------|-----------|----------|
| `id` | `string` | Unikalus serverio identifikatorius | `'eu-central'` |
| `name` | `string` | Serverio vardas, rodomas UI | `'Europe - Frankfurt'` |
| `region` | `string` | Regiono kodas | `'EU'`, `'US'`, `'ASIA'` |
| `endpoint` | `string` | Colyseus serverio URL | `'https://server.example.com'` |
| `description` | `string?` | Aprašymas (optional) | `'Primary server'` |

## 🎮 Kaip Veikia

1. **Serverių sąrašas** automatiškai užkraunamas iš `serverPresets` masyvo
2. **UI rodymas**: Kai paspaudžiate "PvP ONLINE", atidaromas serverių pasirinkimo langas
3. **Status tikrinimas**: Kiekvienas serveris automatiškai tikrinamas (`checkServerStatus()`)
4. **Pasirinkimas**: Vartotojas gali pasirinkti serverį ir prisijungti

## 🔍 Serverio Status Tikrinimas

Serveriai automatiškai tikrinami:
- **Health check**: `/health` endpoint
- **Status check**: `/status` endpoint (optional)
- **Ping**: Matuojamas response laikas
- **Players**: Rodo laukiančių žaidėjų skaičių
- **Rooms**: Rodo aktyvių kambarių skaičių

## 📝 Pavyzdžiai

### Pridėti Lokalų Serverį
```typescript
{
  id: 'local-dev',
  name: 'Local Dev Server',
  region: 'LOCAL',
  endpoint: 'http://localhost:3000',
  description: 'Development server'
}
```

### Pridėti Cloud Serverį
```typescript
{
  id: 'asia-singapore',
  name: 'Asia - Singapore',
  region: 'ASIA',
  endpoint: 'https://asia-sg.example.com',
  description: 'Singapore server'
}
```

### Pridėti Custom Serverį
```typescript
{
  id: 'custom-server',
  name: 'Custom Server',
  region: 'CUSTOM',
  endpoint: 'https://custom.example.com:2567',
  description: 'Custom Colyseus server'
}
```

## ⚠️ Svarbu

1. **Unikalus ID**: Kiekvienas serveris turi turėti unikalų `id`
2. **Validus Endpoint**: Endpoint turi būti validus Colyseus serverio URL
3. **CORS**: Serveris turi turėti CORS sukonfigūruotą
4. **Health Endpoint**: Serveris turi turėti `/health` endpoint

## 🎯 UI Rodymas

Serveriai rodomi lentelėje su:
- Serverio vardas
- Status (online/offline/checking)
- Ping (ms)
- Laukiančių žaidėjų skaičius
- Aktyvių kambarių skaičius
- "JOIN" mygtukas

## 📍 Kodo Vietos

- **Serverių sąrašas**: `src/simple-main.ts:54-79`
- **UI rodymas**: `src/simple-main.ts:18699` (`drawServerBrowserOverlay()`)
- **Status tikrinimas**: `src/simple-main.ts:829` (`checkServerStatus()`)
- **Serverio pasirinkimas**: `src/simple-main.ts:1074` (`handleServerSelection()`)

