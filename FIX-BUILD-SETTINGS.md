# ⚙️ Build Settings - Ką Pakeisti

## ❌ Kas Neteisinga Dabar

Matau, kad Build settings nustatyti neteisingai:

- **Root Directory**: `/` ❌ (neturėtų būti root)
- **Install Command**: `npm install` ❌ (neturėtų būti root folderyje)
- **Build Command**: `npm run build` ❌ (neturėtų būti root folderyje)

## ✅ Ką Nustatyti

### Root Directory

Pakeiskite į:
```
colyseus-server
```

**Kodėl**: Server kodas yra `colyseus-server/` folderyje, ne root'e.

### Install Command

Pakeiskite į:
```
npm install
```

**Pastaba**: Jei Root Directory yra `colyseus-server`, tai komanda automatiškai vykdoma ten.

ARBA jei Root Directory lieka `/`, tada:
```
cd colyseus-server && npm install
```

### Build Command

Pakeiskite į:
```
npm run build
```

**Pastaba**: Jei Root Directory yra `colyseus-server`, tai komanda automatiškai vykdoma ten.

ARBA jei Root Directory lieka `/`, tada:
```
cd colyseus-server && npm run build
```

---

## 📋 Rekomenduojamas Setup

### Option 1: Root Directory = colyseus-server (Geriausia)

**Root Directory**: `colyseus-server`
**Install Command**: `npm install`
**Build Command**: `npm run build`

**Start Command** (jei yra atskiras laukas):
```
npm start
```

### Option 2: Root Directory = / (Jei negalite pakeisti)

**Root Directory**: `/`
**Install Command**: `cd colyseus-server && npm install`
**Build Command**: `cd colyseus-server && npm run build`

**Start Command** (jei yra atskiras laukas):
```
cd colyseus-server && npm start
```

---

## 🚀 Deployment Steps

### Step 1: Pataisykite Build Settings

1. **Root Directory**: `colyseus-server`
2. **Install Command**: `npm install`
3. **Build Command**: `npm run build`
4. Spustelėkite **"SAVE"**

### Step 2: Pasirinkite Branch

1. Deployment sekcijoje
2. Spustelėkite **"SELECT BRANCH"**
3. Pasirinkite branch (pvz: `main` arba `master`)

### Step 3: Pridėkite SSH Key į GitHub (Jei Naudojate SSH)

1. Eikite į: `https://github.com/JUSU_USERNAME/OK5/settings/keys`
2. Settings → Deploy keys → Add deploy key
3. Title: `Colyseus Cloud Deploy`
4. Key: įdėkite SSH key:
   ```
   ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDKQEIZMOy9qks8P9Cf2G0ZX9VWujJ+PRw/ejpVeDi0EVLS5m40ZSZWubSdj/GbxF+a2UlTyYiRjMm9O+omoUlPccsuXfwHQ84l5WmolupleEXRPmIV8wJZrDnWeCFlQ3fOXANlWYmvJpmeSqWwwAlgviWk+NxrH9kaXNGTN6m+WWogOqXA510NZjihuzJkCp6AozQ5aBL6SEFTucwqPmV9MbeLyiG0uoq7t19r9yF7suUqF+xrnBQVSAr8YXP0igxli7TOqjQlf8ZhEcFYE/O31GuIrQHc8SJD2Ex4y2Sao6oVQpKpxo3etKvIhrhHehZIKJT3IE8JjsAeTLNZnoKr colyseus-cloud-deploy-key-11-11-2025
   ```
5. ✅ Pažymėkite "Allow write access"
6. Add key

### Step 4: Deploy

Jei naudojate GitHub connection:
- Automatiškai deploy'ins po push

Jei naudojate SSH key:
- Eikite į Deployments tab
- Spustelėkite "Deploy" arba "New Deployment"

---

## ✅ Patikrinimas

Po deployment:
```
https://de-fra-f8820c12.colyseus.cloud/health
```

Turėtumėte matyti: `{"status":"ok"}`

