## UFO Ticket contracts (deploy)

This folder lets you deploy the **UFO Ticket (SBT)** contract and get the on-chain address (`UFO_TICKET_CONTRACT_ADDRESS`).

### What you need (you must do this part)

- A **fresh deployer wallet** (not your main wallet)
- Some **RON** in that wallet for gas
  - Use **Saigon** for tests first
  - Use **Ronin mainnet** when ready

### Setup

1) Create `ufo-ticket-contracts/.env` (local only)

Copy `ENV_EXAMPLE.txt` → `.env` and fill:

- `DEPLOYER_PRIVATE_KEY=...`
- `RONKE_TOKEN_ADDRESS=0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb`

2) Install

```bash
cd ufo-ticket-contracts
npm install
```

### Deploy (Saigon testnet)

```bash
cd ufo-ticket-contracts
npm run deploy:saigon
```

It prints:

- `UfoTicket deployed at: 0x...`  ← this is your **UFO Ticket contract address**

### Deploy (Ronin mainnet)

```bash
cd ufo-ticket-contracts
npm run deploy:ronin
```

### After deploy

Use the deployed address in:

- Frontend: `VITE_UFO_TICKET_CONTRACT_ADDRESS=0x...`
- Server: `UFO_TICKET_CONTRACT_ADDRESS=0x...`

Also decide who is **contract owner** (only owner can call `resolveMatch`):

- Recommended: deploy from the same wallet that the server will use as signer.


