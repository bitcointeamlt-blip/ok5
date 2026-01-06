## RONKE + UFO Ticket (SBT) + PvP Online — Audit Report (single-file)

This document summarizes **all code paths** related to:
- **RONKE** (ERC-20) usage
- **UFO Ticket** minting (SBT / NFT) and escrow rules
- **PvP Online** gating and match settlement (burn + payout)

It is designed for a security / logic audit.

> Secrets policy: **all private keys / API keys are redacted** (`<REDACTED>`). Do not paste secrets into documents.

---

## 0) Deployed addresses (public)

- **RONKE ERC-20 token**: `0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb`
- **Treasury/pool** (legacy deposit destination): `0xca5822880e797d9167b3b844a2cdf723493281b7`
- **UFO Ticket contract (Ronin mainnet)**: `0xC855ad47caa14343F8db6d30440f1B8Bf9aC8344`

---

## 1) Contract: UFO Ticket (SBT) escrow + match settlement

### 1.1 Location
- `ufo-ticket-contracts/contracts/UfoTicket.sol`

### 1.2 Key properties
- **Non-transferable** (“SBT”): transfers revert; only mint (from=0) and burn (to=0) allowed.
- **One active ticket per wallet**: `activeTokenIdOf[owner]`.
- **Escrow in contract**: on `mint`, contract pulls **200 RONKE** via `transferFrom`.
- **Match settlement**: `resolveMatch(loserTokenId, winner)`:
  - burns loser token
  - sets `activeTokenIdOf[loser] = 0`
  - transfers **100 RONKE** to winner from escrow
- **Authority model**: `resolveMatch` is `onlyOwner` (server signer / matchmaker model).

### 1.3 Exposed on-chain signals
- `TicketMinted(owner, tokenId)`
- `TicketDestroyed(tokenId, loser, winner, payoutRonke)`
- ERC-721 standard `Transfer` events (mint/burn)

### 1.4 Core logic (reference snippet)
See file for full implementation:
- `mint(Stats calldata s)` uses `ronke.transferFrom(msg.sender, address(this), MINT_COST)`
- `resolveMatch(uint256 loserTokenId, address winner)` burns token and `ronke.transfer(winner, WIN_REWARD)`

---

## 2) Server (Colyseus): enforcement + burn/payout execution

### 2.1 Locations
- `colyseus-server/src/services/UfoTicketService.ts`
- `colyseus-server/src/rooms/GameRoom.ts`

### 2.2 Server environment variables (SECRETS REDACTED)
These are read via `process.env`:

- `UFO_TICKET_RPC_URL=https://api.roninchain.com/rpc`
- `UFO_TICKET_CONTRACT_ADDRESS=0xC855ad47caa14343F8db6d30440f1B8Bf9aC8344`
- `UFO_TICKET_REQUIRED=true`
- `UFO_TICKET_SIGNER_PRIVATE_KEY=<REDACTED>`  (must be contract owner to call `resolveMatch`)

Existing unrelated secrets (do not paste into docs):
- `SUPABASE_SERVICE_ROLE_KEY=<REDACTED>`
- Any other platform keys: `<REDACTED>`

### 2.3 `UfoTicketService` responsibilities
File: `colyseus-server/src/services/UfoTicketService.ts`

- **init()**
  - Creates `JsonRpcProvider(UFO_TICKET_RPC_URL)`
  - If `UFO_TICKET_SIGNER_PRIVATE_KEY` present, creates `Wallet(pk, provider)`
  - Creates `Contract(UFO_TICKET_CONTRACT_ADDRESS, ABI, signerOrProvider)`

- **checkJoin(address, tokenIdFromClient?)**
  - If `UFO_TICKET_REQUIRED=true`:
    - denies if wallet missing/invalid
    - denies if contract not configured
    - validates ticket ownership using:
      - `ownerOf(tokenId)`
      - optional `isDestroyed(tokenId)` (if function exists)
    - fallback: if client supplied tokenId invalid, uses `activeTokenIdOf(address)`

- **resolveMatchBurnAndPayout(loserTokenId, winnerAddress)**
  - Requires signer
  - Calls `resolveMatch(loserTokenId, winnerAddress)`
  - Does not block room teardown (fire-and-forget `wait(1)` best-effort)

### 2.4 `GameRoom` responsibilities
File: `colyseus-server/src/rooms/GameRoom.ts`

- **Join options expected from client**
  - `options.address` (wallet address)
  - `options.ufoTicketTokenId` (optional)
  - plus PvP stats (hp/maxHP/maxArmor/etc.)

- **onJoin(...) ticket gating**
  - Parses `options.ufoTicketTokenId` into bigint if present
  - Calls `ufoTicketService.checkJoin(address, tokenIdOpt)`
  - If denied: sends `join_denied` and forces client leave
  - If ok: stores `ticketTokenIdBySid.set(sessionId, tokenId)`

- **Match lifecycle and settlement**
  - Winner selection:
    - `timeout`: winner = higher HP (tie => draw)
    - `player_left`: remaining player wins immediately
  - `endMatch(...)` broadcasts `match_end` and attempts:
    - determine loserSid from `ticketTokenIdBySid`
    - call `resolveMatchBurnAndPayout(loserTokenId, winnerAddr)`

- **Leave flow**
  - For `player_left` settlement correctness, ticket id deletion happens **after** `endMatch` runs.

---

## 3) Client (frontend): mint flow + PvP entry gating + room join payload

### 3.1 Locations
- `src/simple-main.ts` (main gameplay + UI + mint flow + PvP entry)
- `src/services/ColyseusService.ts` (room join payload)
- `src/services/WalletService.ts` (EIP-1193 provider + ERC-20 transfer helpers)

### 3.2 Frontend environment variables (NO SECRETS)
Read via `import.meta.env`:

- `VITE_UFO_TICKET_CONTRACT_ADDRESS=0xC855ad47caa14343F8db6d30440f1B8Bf9aC8344`
- Optional overrides:
  - `VITE_RONKE_TOKEN_ADDRESS=0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb`
  - `VITE_RONKE_POOL_ADDRESS=0xca5822880e797d9167b3b844a2cdf723493281b7`
  - `VITE_COLYSEUS_ENDPOINT=<REDACTED/CONFIGURED ON PLATFORM>`
  - `VITE_SUPABASE_URL=<REDACTED>`
  - `VITE_SUPABASE_ANON_KEY=<REDACTED>`

### 3.3 Minting: `craftPewPewUfo()` behavior
File: `src/simple-main.ts`

- If `VITE_UFO_TICKET_CONTRACT_ADDRESS` is set/valid:
  - Uses `walletService.getEip1193Provider()` and `ethers.BrowserProvider`
  - Checks RONKE allowance to UFO contract
  - If allowance < 200 RONKE: sends `approve(contract, 200 RONKE)`
  - Sends `ufo.mint(statsSnapshot)`
  - Reads `activeTokenIdOf(me)` and stores it in localStorage (`pewpew_ufo_ticket_token_id_v1`)

- Else (legacy fallback):
  - Sends ERC-20 `transfer(200 RONKE)` to `RONKE_POOL_ADDRESS`

Local storage keys (client):
- `pewpew_ufo_crafted` (temporary local gate)
- `pewpew_ufo_ticket_token_id_v1` (tokenId hint; server independently verifies)

### 3.4 PvP Online entry gating (client-side)
File: `src/simple-main.ts`

- `startPvPMatchOnServer(...)` requires:
  - wallet connected
  - `isPewPewUfoCrafted() === true` (temporary; server is authoritative via on-chain check)

### 3.5 Colyseus join payload includes ticket id
File: `src/simple-main.ts` (`enterLobby`) + `src/services/ColyseusService.ts`

- Client passes `ufoTicketTokenId` (string) in join options.
- Server may ignore it if invalid and falls back to `activeTokenIdOf(address)`.

### 3.6 Match end UX behavior
File: `src/simple-main.ts`

- On `match_end`:
  - winnerSid decides victory/defeat locally
  - on defeat: client clears local ticket flag/tokenId (forces remint from UI perspective)
  - server remains authoritative for on-chain truth (burn/payout)

---

## 4) PvP gameplay (online) overview (high level)

### 4.1 Location
- `colyseus-server/src/rooms/GameRoom.ts` (authoritative simulation, match timers, hit validation)
- `src/simple-main.ts` (client sim/render, UI, input send, room message handlers)

### 4.2 Match end rules (server authoritative)
- Timer-based end selects winner by **higher HP**
- Leave-based end selects **remaining player as winner**

---

## 5) Known security-sensitive areas (for auditor attention)

### 5.1 Centralization / trust
- `resolveMatch` is `onlyOwner`: server signer controls settlement.
- Signer key security is critical.

### 5.2 Nonce contention / concurrency
- Multiple rooms calling `resolveMatch` concurrently can cause nonce issues depending on signer usage and infra.

### 5.3 Network mismatch (wallet chain)
- Client currently does not hard-check chainId before approve/mint.

### 5.4 Data provenance (stats snapshot)
- Stats stored in token are client-sourced snapshot; gameplay stats on server are clamped and/or fetched from Supabase.

---

## 6) Quick “where to look” index (files)

- **Contract**
  - `ufo-ticket-contracts/contracts/UfoTicket.sol`
  - `ufo-ticket-contracts/scripts/deploy.cjs`
  - `ufo-ticket-contracts/hardhat.config.cjs`

- **Server**
  - `colyseus-server/src/services/UfoTicketService.ts`
  - `colyseus-server/src/rooms/GameRoom.ts`

- **Client**
  - `src/simple-main.ts`
  - `src/services/ColyseusService.ts`
  - `src/services/WalletService.ts`



