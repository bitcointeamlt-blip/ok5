# 🔑 SSH Key Deployment - Step by Step

## SSH Key Gautas

Colyseus Cloud suteikė SSH deploy key, kurį reikia pridėti į GitHub.

## 📋 Steps

### Step 1: Pridėkite SSH Key į GitHub

1. **Eikite į GitHub Repository**
   - Atidarykite: https://github.com/JUSU_USERNAME/OK5
   - Settings → Deploy keys

2. **Pridėkite Deploy Key**
   - Spustelėkite **"Add deploy key"**
   - Title: `Colyseus Cloud Deploy`
   - Key: įdėkite SSH key:
     ```
     ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDKQEIZMOy9qks8P9Cf2G0ZX9VWujJ+PRw/ejpVeDi0EVLS5m40ZSZWubSdj/GbxF+a2UlTyYiRjMm9O+omoUlPccsuXfwHQ84l5WmolupleEXRPmIV8wJZrDnWeCFlQ3fOXANlWYmvJpmeSqWwwAlgviWk+NxrH9kaXNGTN6m+WWogOqXA510NZjihuzJkCp6AozQ5aBL6SEFTucwqPmV9MbeLyiG0uoq7t19r9yF7suUqF+xrnBQVSAr8YXP0igxli7TOqjQlf8ZhEcFYE/O31GuIrQHc8SJD2Ex4y2Sao6oVQpKpxo3etKvIhrhHehZIKJT3IE8JjsAeTLNZnoKr colyseus-cloud-deploy-key-11-11-2025
     ```
   - ✅ Pažymėkite **"Allow write access"** (jei yra)
   - Spustelėkite **"Add key"**

### Step 2: Įdiekite Git (Jei Reikia)

Jei Git nėra įdiegtas:

1. Parsisiųskite: https://git-scm.com/download/win
2. Įdiekite su default settings
3. Restart terminal

### Step 3: Inicializuokite Git Repository

```bash
cd C:\Users\p3p3l\Downloads\ok4
git init
git add .
git commit -m "Initial commit for Colyseus deployment"
```

### Step 4: Susiekite su GitHub

```bash
git remote add origin git@github.com:JUSU_USERNAME/OK5.git
```

ARBA jei naudojate HTTPS:

```bash
git remote add origin https://github.com/JUSU_USERNAME/OK5.git
```

### Step 5: Push į GitHub

```bash
git push -u origin main
```

Jei branch yra `master`:

```bash
git push -u origin master
```

### Step 6: Deploy per CLI

```bash
cd colyseus-server
npx @colyseus/cloud deploy
```

## 🔍 Troubleshooting

### "Permission denied" SSH
- Patikrinkite, ar SSH key pridėtas į GitHub
- Patikrinkite, ar "Allow write access" pažymėtas

### "Git is not set up"
- Įdiekite Git
- Inicializuokite repository
- Push į GitHub

### "Repository not found"
- Patikrinkite repository URL
- Patikrinkite, ar turite access

## 💡 Greitas Būdas

1. Pridėkite SSH key į GitHub (Settings → Deploy keys)
2. Įdiekite Git
3. `git init`, `git add .`, `git commit`
4. `git remote add origin`, `git push`
5. `cd colyseus-server && npx @colyseus/cloud deploy`

