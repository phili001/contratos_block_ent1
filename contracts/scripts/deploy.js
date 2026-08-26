const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log(`Red:      ${network}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} ETH`);

  const factory = await hre.ethers.getContractFactory("MilestoneRegistry");
  const registry = await factory.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const tx = registry.deploymentTransaction();
  // Esperamos el recibo para poder guardar el numero de bloque real.
  const receipt = await tx.wait();
  console.log(`\nMilestoneRegistry desplegado en: ${address}`);
  console.log(`Tx: ${tx.hash}`);
  console.log(`Bloque: ${receipt.blockNumber} | gas usado: ${receipt.gasUsed}`);

  // El backend lee este archivo para saber a que direccion apuntar y con que ABI.
  const artifact = await hre.artifacts.readArtifact("MilestoneRegistry");
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${network}.json`),
    JSON.stringify(
      {
        network,
        chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
        address,
        deployer: deployer.address,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        deployedAt: new Date().toISOString(),
        abi: artifact.abi,
      },
      null,
      2
    )
  );
  console.log(`Info de despliegue escrita en deployments/${network}.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
