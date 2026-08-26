// Prueba varios RPC publicos de Sepolia y guarda en .env el primero que sirva.
//
//   npm run rpc:find
//
// Util cuando el RPC por defecto falla (ECONNRESET, timeouts, bloqueos de red).
const fs = require("fs");
const path = require("path");

const CHAIN_ID_SEPOLIA = "0xaa36a7";

const CANDIDATOS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.drpc.org",
  "https://eth-sepolia.public.blastapi.io",
  "https://sepolia.gateway.tenderly.co",
  "https://1rpc.io/sepolia",
  "https://endpoints.omniatech.io/v1/eth/sepolia/public",
  "https://rpc.sepolia.org",
  "https://rpc2.sepolia.org",
  "https://ethereum-sepolia.rpc.subquery.network/public",
];

async function probar(url) {
  const inicio = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
      ]),
      signal: ctrl.signal,
    });
    if (!res.ok) return { url, ok: false, motivo: `HTTP ${res.status}` };

    const body = await res.json();
    const respuestas = Array.isArray(body) ? body : [body];
    const chainId = respuestas.find((r) => r.id === 1)?.result;
    const bloque = respuestas.find((r) => r.id === 2)?.result;
    if (chainId !== CHAIN_ID_SEPOLIA) return { url, ok: false, motivo: `chainId ${chainId ?? "?"}, no es Sepolia` };

    return { url, ok: true, ms: Date.now() - inicio, bloque: parseInt(bloque, 16) };
  } catch (e) {
    const motivo = e.name === "AbortError" ? "timeout (8s)" : e.cause?.code || e.message;
    return { url, ok: false, motivo };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`\nProbando ${CANDIDATOS.length} RPC de Sepolia...\n`);
  const resultados = await Promise.all(CANDIDATOS.map(probar));

  for (const r of resultados) {
    const etiqueta = r.url.replace("https://", "").padEnd(48);
    console.log(r.ok ? `  OK    ${etiqueta} ${r.ms} ms, bloque ${r.bloque}` : `  falla ${etiqueta} ${r.motivo}`);
  }

  const sirven = resultados.filter((r) => r.ok).sort((a, b) => a.ms - b.ms);
  if (sirven.length === 0) {
    console.log("\nNinguno respondio. Puede ser tu red (firewall de la U, VPN, DNS).");
    console.log("Prueba con otra conexion, o saca un RPC gratis en alchemy.com / infura.io");
    console.log("y ponlo en SEPOLIA_RPC_URL dentro de .env\n");
    process.exitCode = 1;
    return;
  }

  const elegido = sirven[0].url;
  const envPath = path.join(__dirname, "..", ".env");
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const re = /^SEPOLIA_RPC_URL=.*$/m;
  env = re.test(env) ? env.replace(re, `SEPOLIA_RPC_URL=${elegido}`) : `${env.trimEnd()}\nSEPOLIA_RPC_URL=${elegido}\n`;
  fs.writeFileSync(envPath, env, { mode: 0o600 });

  console.log(`\n  ${sirven.length} de ${CANDIDATOS.length} funcionan. Guardado en .env:`);
  console.log(`  ${elegido}\n`);
  console.log("  Siguiente: npm run balance\n");
}

main();
