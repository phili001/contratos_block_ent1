require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Nodo en memoria que usa `npx hardhat test`.
    hardhat: {},
    // Nodo local persistente: `npx hardhat node` en otra terminal.
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Siempre registrada, para que el chequeo previo pueda dar un mensaje claro.
    // Si no defines SEPOLIA_RPC_URL se usa un RPC publico (mas lento, con limites).
    sepolia: {
      url: SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
  },
};
