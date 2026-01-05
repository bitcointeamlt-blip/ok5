## Deploy guide (Ronin mainnet) — with feeRecipient (100 RONKE liquid)

This guide deploys a **new** UFO Ticket contract where, on match resolve, the remaining **100 RONKE** goes to your **feeRecipient** wallet (liquid).

### Step 1 — Create `ufo-ticket-contracts/.env`

Copy `ENV_EXAMPLE.txt` → `.env` and fill:

- `DEPLOYER_PRIVATE_KEY=...` (this wallet becomes **contract owner**)
- `RONKE_TOKEN_ADDRESS=0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb`
- `FEE_RECIPIENT_ADDRESS=0x...` (your creator/treasury wallet)

### Step 2 — Install deps

```bash
cd ufo-ticket-contracts
npm install
```

### Step 3 — Deploy

Ronin mainnet:

```bash
npm run deploy:ronin
```

It prints:
- `UfoTicket deployed at: 0x...` (save this)

### Step 4 — Update server env (Colyseus)

Set:
- `UFO_TICKET_CONTRACT_ADDRESS=0x...` (new)
- `UFO_TICKET_SIGNER_PRIVATE_KEY=...` (**must** be the same owner wallet that deployed)

Restart/redeploy the server.

### Step 5 — Update frontend env (Netlify/Vite)

Set:
- `VITE_UFO_TICKET_CONTRACT_ADDRESS=0x...` (new)

Rebuild/redeploy frontend.

### IMPORTANT

- You cannot “patch” the already deployed contract. You must migrate to the new address.
- Old escrow left in the old contract stays there unless it’s paid out via matches (there is no withdraw).


