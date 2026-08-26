// Chequeo previo al despliegue: valida .env, conexion RPC, red correcta y saldo.
//
//   npx hardhat run scripts/preflight.js --network sepolia
//
// No envia ninguna transaccion: solo lee y estima el costo del despliegue.
const hre = require("hardhat");

const CHAIN_IDS = { sepolia: 11155111n, localhost: 31337n, hardhat: 31337n };

let fallos = 0;
const ok = (msg) => console.log(`  OK    ${msg}`);
const fail = (msg) => {
  fallos += 1;
  console.log(`  FALLA ${msg}`);
};

async function main() {
  const red = hre.network.name;
  console.log(`\nChequeo previo para la red: ${red}\n`);

  if (red === "hardhat") {
    console.log("  Estas en la red en memoria. Corre con --network sepolia.\n");
    process.exitCode = 1;
    return;
  }

  if (red === "sepolia") {
    if (process.env.SEPOLIA_RPC_URL) ok("SEPOLIA_RPC_URL definida");
    else console.log("  AVISO SEPOLIA_RPC_URL vacia: se usara un RPC publico (mas lento y con limites)");
    if (/^0x[0-9a-fA-F]{64}$/.test(process.env.DEPLOYER_PRIVATE_KEY || "")) {
      ok("DEPLOYER_PRIVATE_KEY con formato valido");
    } else {
      fail("DEPLOYER_PRIVATE_KEY ausente o mal formada (debe ser 0x + 64 hex)");
    }
    if (fallos > 0) {
      console.log("\nCopia .env.example a .env y llena DEPLOYER_PRIVATE_KEY.\n");
      process.exitCode = 1;
      return;
    }
  }

  let chainId;
  try {
    chainId = (await hre.ethers.provider.getNetwork()).chainId;
    ok(`RPC responde, chainId ${chainId}`);
  } catch (e) {
    fail(`el RPC no responde: ${e.shortMessage || e.message}`);
    console.log("");
    process.exitCode = 1;
    return;
  }

  const esperado = CHAIN_IDS[red];
  if (esperado && chainId !== esperado) fail(`chainId ${chainId}, se esperaba ${esperado}`);
  else if (esperado) ok("chainId correcto");

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`\n  Wallet:  ${deployer.address}`);
  console.log(`  Balance: ${hre.ethers.formatEther(balance)} ETH`);

  // Costo estimado del despliegue con el gas price actual.
  const factory = await hre.ethers.getContractFactory("MilestoneRegistry");
  const gas = await hre.ethers.provider.estimateGas(await factory.getDeployTransaction());
  const fee = await hre.ethers.provider.getFeeData();
  const precio = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
  const costo = gas * precio;
  console.log(`  Gas del deploy: ${gas} x ${hre.ethers.formatUnits(precio, "gwei")} gwei`);
  console.log(`  Costo estimado: ${hre.ethers.formatEther(costo)} ETH\n`);

  if (balance === 0n) fail("la wallet no tiene ETH: pide en un faucet de Sepolia");
  else if (balance < costo * 3n) fail("saldo justo; pide mas ETH del faucet antes de desplegar");
  else ok("saldo suficiente para desplegar y hacer varias transacciones");

  console.log(fallos === 0 ? "\nTodo listo. Corre: npm run deploy:sepolia\n" : `\n${fallos} problema(s) por resolver.\n`);
  if (fallos > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
