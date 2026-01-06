// Resolve a match manually (owner-only): burns loser tokenId and pays winner 100 RONKE from escrow.
//
// Usage (PowerShell):
//   cd ufo-ticket-contracts
//   $env:DEPLOYER_PRIVATE_KEY="..."   # MUST be the current contract owner
//   $env:UFO_TICKET_CONTRACT_ADDRESS="0x..."
//   npx hardhat run scripts/resolveMatch.cjs --network ronin_mainnet -- --loserTokenId 123 --winner 0xYourAddress
//
// Notes:
// - This WILL burn the loser’s ticket. Only do this with explicit consent (or in a test environment).
// - This is the only way to move escrow RONKE out with the current contract (no withdraw function).

const hre = require("hardhat");

function getArg(name) {
  const i = process.argv.indexOf("--" + name);
  if (i === -1) return null;
  return process.argv[i + 1] || null;
}

async function main() {
  const addr = (process.env.UFO_TICKET_CONTRACT_ADDRESS || "").trim();
  if (!addr) throw new Error("Missing UFO_TICKET_CONTRACT_ADDRESS in env");

  const loserTokenIdRaw = getArg("loserTokenId");
  const winner = (getArg("winner") || "").trim();
  if (!loserTokenIdRaw) throw new Error("Missing --loserTokenId");
  if (!winner) throw new Error("Missing --winner");

  const loserTokenId = BigInt(loserTokenIdRaw);

  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:", signer.address);
  console.log("Contract:", addr);
  console.log("Calling resolveMatch(loserTokenId, winner):", loserTokenId.toString(), winner);

  const UfoTicket = await hre.ethers.getContractAt("UfoTicket", addr, signer);
  const tx = await UfoTicket.resolveMatch(loserTokenId, winner);
  console.log("tx:", tx.hash);
  const rcpt = await tx.wait(1);
  console.log("confirmed in block:", rcpt.blockNumber);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


