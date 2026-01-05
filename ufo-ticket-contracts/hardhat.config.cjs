require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");

const DEPLOYER_PRIVATE_KEY = (process.env.DEPLOYER_PRIVATE_KEY || "").trim();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    // Ronin mainnet
    ronin: {
      chainId: 2020,
      url: process.env.RONIN_RPC_URL || "https://api.roninchain.com/rpc",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : []
    },
    // Ronin Saigon testnet
    saigon: {
      chainId: 2021,
      url: process.env.SAIGON_RPC_URL || "https://saigon-testnet.roninchain.com/rpc",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : []
    }
  }
};



