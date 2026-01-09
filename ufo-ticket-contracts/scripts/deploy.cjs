require("dotenv").config();

async function main() {
  const ronke = (process.env.RONKE_TOKEN_ADDRESS || "").trim();
  if (!ronke) throw new Error("Missing RONKE_TOKEN_ADDRESS in .env");
  const feeRecipient = (process.env.FEE_RECIPIENT_ADDRESS || "").trim();
  if (!feeRecipient) throw new Error("Missing FEE_RECIPIENT_ADDRESS in .env");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const UfoTicket = await ethers.getContractFactory("UfoTicket");
  const c = await UfoTicket.deploy(ronke, feeRecipient);
  await c.waitForDeployment();

  const addr = await c.getAddress();
  console.log("UfoTicket deployed at:", addr);
  console.log("Set server env: UFO_TICKET_CONTRACT_ADDRESS=" + addr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});



