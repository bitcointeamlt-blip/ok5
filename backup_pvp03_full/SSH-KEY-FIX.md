# 🔧 SSH Key Klaida - Kaip Išspręsti

## ❌ Klaida: "Key is invalid. You must supply a key in OpenSSH public key format"

Tai reiškia, kad SSH key formatas neteisingas arba buvo nukopijuotas neteisingai.

## ✅ Teisingas SSH Key Formatas

SSH key turi būti:
- **Viena eilutė** (be naujų eilučių)
- **Be papildomų tarpų** pradžioje arba pabaigoje
- **Formatas**: `ssh-rsa [KEY_DATA] [COMMENT]`

## 📋 Teisingas SSH Key

Nukopijuokite VISĄ šią eilutę (viena eilutė):

```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDKQEIZMOy9qks8P9Cf2G0ZX9VWujJ+PRw/ejpVeDi0EVLS5m40ZSZWubSdj/GbxF+a2UlTyYiRjMm9O+omoUlPccsuXfwHQ84l5WmolupleEXRPmIV8wJZrDnWeCFlQ3fOXANlWYmvJpmeSqWwwAlgviWk+NxrH9kaXNGTN6m+WWogOqXA510NZjihuzJkCp6AozQ5aBL6SEFTucwqPmV9MbeLyiG0uoq7t19r9yF7suUqF+xrnBQVSAr8YXP0igxli7TOqjQlf8ZhEcFYE/O31GuIrQHc8SJD2Ex4y2Sao6oVQpKpxo3etKvIhrhHehZIKJT3IE8JjsAeTLNZnoKr colyseus-cloud-deploy-key-11-11-2025
```

## 🔍 Patikrinimas

Patikrinkite, kad:
- ✅ Prasideda nuo: `ssh-rsa`
- ✅ Baigiasi su: `colyseus-cloud-deploy-key-11-11-2025`
- ✅ Viena eilutė (nėra naujų eilučių viduryje)
- ✅ Nėra tarpų pradžioje arba pabaigoje

## 📝 Instrukcijos

1. **Išvalykite Key laukelį** (jei ten kažkas yra)
2. **Nukopijuokite VISĄ eilutę** iš viršaus
3. **Įdėkite į Key laukelį** (paste)
4. **Patikrinkite**, kad nėra papildomų tarpų arba naujų eilučių
5. ✅ **Pažymėkite** "Allow write access"
6. **Spustelėkite** "Add key"

## 💡 Patarimai

- Naudokite **Ctrl+A** (select all) prieš kopijuojant
- Naudokite **Ctrl+V** (paste) į Key laukelį
- Jei vis dar neveikia, patikrinkite, ar nėra hidden simbolių

## 🔄 Alternatyva

Jei SSH key vis dar neveikia, galite naudoti **GitHub Connection** vietoj SSH key:

1. Colyseus Cloud → Deployment sekcija
2. Spustelėkite "OK5" dropdown
3. Pasirinkite repository
4. Pasirinkite branch
5. Deploy

Ar pavyko pridėti SSH key?

