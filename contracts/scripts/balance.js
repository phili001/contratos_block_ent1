// Consulta el saldo en Sepolia. Sin argumentos usa la wallet del .env.
//
//   npm run balance                      -> saldo de tu wallet de deploy
//   ADDRESS=0x... npm run balance        -> saldo de cualquier otra direccion
const hre = require("hardhat");

async function main() {
  let address = process.env.ADDRESS;

  if (!address) {
    // Deriva la direccion publica desde la llave del .env. La llave nunca se imprime.
    const [signer] = await hre.ethers.getSigners();
    if (!signer) {
      console.log("\nNo hay DEPLOYER_PRIVATE_KEY en .env. Corre: npm run wallet:new");
      console.log("O consulta otra direccion: ADDRESS=0x... npm run balance\n");
      process.exitCode = 1;
      return;
    }
    address = signer.address;
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    console.log(`\n  "${address}" no es una direccion valida.`);
    console.log("  Una direccion son 40 caracteres hex despues del 0x.");
    console.log("  Si lo que tienes son 64, eso es una LLAVE PRIVADA: no la pegues aqui.\n");
    process.exitCode = 1;
    return;
  }

  // Diagnostico: si el RPC no responde o va atrasado, el saldo "0" es un falso negativo.
  const rpc = hre.network.config.url;
  console.log(`\n  RPC:       ${rpc}`);
  try {
    const bloque = await hre.ethers.provider.getBlockNumber();
    console.log(`  Bloque:    ${bloque} (RPC respondiendo)`);
  } catch (e) {
    console.log(`  El RPC no responde: ${e.shortMessage || e.message}`);
    console.log(`  Verifica en el explorador: https://sepolia.etherscan.io/address/${address}\n`);
    process.exitCode = 1;
    return;
  }

  const balance = await hre.ethers.provider.getBalance(address);
  const eth = hre.ethers.formatEther(balance);
  const nonce = await hre.ethers.provider.getTransactionCount(address);

  console.log(`  Direccion: ${address}`);
  console.log(`  Saldo:     ${eth} ETH (Sepolia)`);
  console.log(`  Tx hechas: ${nonce}`);
  console.log(`  Explorer:  https://sepolia.etherscan.io/address/${address}\n`);

  if (balance === 0n) {
    console.log("  Saldo cero segun este RPC.");
    console.log("  1. Confirma en el explorador (link arriba): es la fuente de verdad.");
    console.log("  2. Revisa que el faucet haya usado EXACTAMENTE esta direccion.");
    console.log("  3. Los faucets pueden tardar 1-2 minutos en confirmar.\n");
  } else {
    console.log("  Fondos confirmados on-chain.\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
