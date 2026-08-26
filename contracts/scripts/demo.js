// Demostracion del flujo completo contra el contrato ya desplegado:
// documento -> hitos -> cambios de estado -> progreso -> reporte -> verificacion.
//
//   npx hardhat run scripts/demo.js --network localhost
//
// Si no hay deployments/<red>.json, despliega una instancia nueva al vuelo.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const { keccak256, toUtf8Bytes, id } = hre.ethers;

const Status = { Pending: 0, InProgress: 1, AtRisk: 2, Achieved: 3, NotAchieved: 4 };
const STATUS_LABEL = ["Pendiente", "En progreso", "En riesgo", "Alcanzado", "No alcanzado"];

async function getRegistry() {
  const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (fs.existsSync(file)) {
    const { address } = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(`Usando MilestoneRegistry en ${address}`);
    return hre.ethers.getContractAt("MilestoneRegistry", address);
  }
  console.log("No hay despliegue previo; desplegando uno nuevo...");
  const registry = await (await hre.ethers.getContractFactory("MilestoneRegistry")).deploy();
  await registry.waitForDeployment();
  console.log(`Desplegado en ${await registry.getAddress()}`);
  return registry;
}

const EXPLORER = { sepolia: "https://sepolia.etherscan.io" };

function link(hash) {
  const base = EXPLORER[hre.network.name];
  return base ? `\n   ${base}/tx/${hash}` : "";
}

async function main() {
  const registry = await getRegistry();

  // En una red publica el mismo id no se puede registrar dos veces, asi que
  // fuera de local se genera uno nuevo en cada corrida.
  const label =
    process.env.DEMO_ID ||
    (hre.network.name === "hardhat" || hre.network.name === "localhost"
      ? "proyecto-demo-redes-2026"
      : `demo-${Date.now()}`);

  // 1. Documento inicial -> hash. En la app real es el hash del PDF subido.
  const projectId = id(label);
  console.log(`\nProyecto: ${label}\n  id: ${projectId}`);
  const docHash = keccak256(toUtf8Bytes("contenido-del-pdf-de-la-propuesta"));
  console.log("\n1) Registrando proyecto y hash del documento...");
  const tx1 = await registry.registerProject(projectId, docHash);
  await tx1.wait();
  console.log(`   tx ${tx1.hash}${link(tx1.hash)}`);

  // 2. Hitos manuales tomados del documento.
  const titulos = [
    "Modelo de datos definido",
    "Backend con endpoints basicos",
    "Contrato desplegado en testnet",
    "Reporte con verificacion de hash",
  ];
  const titleHashes = titulos.map((t) => keccak256(toUtf8Bytes(t)));
  const dueDates = titulos.map(() => 0);
  console.log("2) Agregando 4 hitos...");
  const tx2 = await registry.addMilestones(projectId, titleHashes, dueDates);
  await tx2.wait();
  console.log(`   tx ${tx2.hash}${link(tx2.hash)}`);

  // 3. Cambios de estado con evidencia.
  console.log("3) Actualizando estados...");
  const updates = [
    [0, Status.Achieved, "diagrama entidad-relacion en docs/modelo.md"],
    [1, Status.Achieved, "8 endpoints funcionando, ver tests"],
    [2, Status.InProgress, "contrato listo, falta desplegar en Sepolia"],
  ];
  for (const [index, status, nota] of updates) {
    await (await registry.updateMilestoneStatus(projectId, index, status, keccak256(toUtf8Bytes(nota)))).wait();
  }

  // 4. Progreso calculado on-chain.
  const bps = await registry.progressBps(projectId);
  const breakdown = await registry.statusBreakdown(projectId);
  console.log(`\n4) Progreso on-chain: ${Number(bps) / 100}%`);
  breakdown.forEach((n, i) => {
    if (Number(n) > 0) console.log(`   ${STATUS_LABEL[i]}: ${n}`);
  });

  // 5. Reporte -> hash -> anclaje.
  const reportHash = keccak256(toUtf8Bytes(`reporte-${projectId}-${bps}`));
  console.log("\n5) Anclando hash del reporte...");
  const tx5 = await registry.registerReport(projectId, reportHash);
  await tx5.wait();
  console.log(`   tx ${tx5.hash}${link(tx5.hash)}`);

  // 6. Verificacion: mismo archivo vs archivo alterado.
  const okDoc = await registry.verifyDocument(projectId, docHash);
  const okReport = await registry.verifyReport(projectId, reportHash);
  const alterado = await registry.verifyDocument(projectId, keccak256(toUtf8Bytes("pdf-modificado")));
  console.log("\n6) Verificacion");
  console.log(`   documento original: ${okDoc ? "COINCIDE" : "NO COINCIDE"}`);
  console.log(`   reporte:            ${okReport ? "COINCIDE" : "NO COINCIDE"}`);
  console.log(`   documento alterado: ${alterado ? "COINCIDE" : "NO COINCIDE"}`);

  const project = await registry.getProject(projectId);
  console.log(`\nProyecto anclado por ${project.owner}, reporte version ${project.reportVersion}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
