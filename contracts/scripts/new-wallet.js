// Genera una wallet nueva y la escribe directamente en .env.
//
//   npm run wallet:new
//
// La llave privada NUNCA se imprime en pantalla: va del generador al archivo .env
// y ahi se queda. Solo se muestra la direccion publica, que es la que necesitas
// para pedir ETH en el faucet.
//
// Esta llave es SOLO para testnet. No le mandes fondos reales.
const fs = require("fs");
const path = require("path");
const { Wallet } = require("ethers");

const envPath = path.join(__dirname, "..", ".env");

function upsert(contenido, clave, valor) {
  const linea = `${clave}=${valor}`;
  const re = new RegExp(`^${clave}=.*$`, "m");
  return re.test(contenido) ? contenido.replace(re, linea) : `${contenido.trimEnd()}\n${linea}\n`;
}

function main() {
  let env = "";
  if (fs.existsSync(envPath)) {
    env = fs.readFileSync(envPath, "utf8");
    const actual = env.match(/^DEPLOYER_PRIVATE_KEY=(.+)$/m);
    if (actual && actual[1].trim().length > 0) {
      console.log("\nYa hay una DEPLOYER_PRIVATE_KEY en .env. No se toco nada.");
      console.log("Si quieres una wallet nueva, borra esa linea del .env y vuelve a correr esto.\n");
      process.exitCode = 1;
      return;
    }
  } else if (fs.existsSync(path.join(__dirname, "..", ".env.example"))) {
    env = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
  }

  const wallet = Wallet.createRandom();
  fs.writeFileSync(envPath, upsert(env, "DEPLOYER_PRIVATE_KEY", wallet.privateKey), { mode: 0o600 });

  console.log("\nWallet creada y guardada en contracts/.env (permisos 600).");
  console.log("\n  Tu direccion:  " + wallet.address);
  console.log("\nSiguiente paso: pide ETH de prueba para esa direccion en");
  console.log("  https://sepolia-faucet.pk910.de/");
  console.log("  https://cloud.google.com/application/web3/faucet/ethereum/sepolia");
  console.log("\nLuego corre: npm run check:sepolia");
  console.log("\nOJO: esta llave es solo para testnet. No le mandes ETH real.\n");
}

main();
