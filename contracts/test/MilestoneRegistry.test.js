const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const { keccak256, toUtf8Bytes, id, ZeroHash } = ethers;

const Status = { Pending: 0, InProgress: 1, AtRisk: 2, Achieved: 3, NotAchieved: 4 };

const PROJECT_ID = id("proyecto-1");
const DOC_HASH = keccak256(toUtf8Bytes("pdf-original"));
const hashOf = (s) => keccak256(toUtf8Bytes(s));

describe("MilestoneRegistry", function () {
  async function deployFixture() {
    const [owner, otro] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("MilestoneRegistry")).deploy();
    await registry.waitForDeployment();
    return { registry, owner, otro };
  }

  async function projectFixture() {
    const base = await deployFixture();
    await base.registry.registerProject(PROJECT_ID, DOC_HASH);
    return base;
  }

  describe("registro de proyectos", function () {
    it("ancla el hash del documento y emite el evento", async function () {
      const { registry, owner } = await loadFixture(deployFixture);

      await expect(registry.registerProject(PROJECT_ID, DOC_HASH))
        .to.emit(registry, "ProjectRegistered")
        .withArgs(PROJECT_ID, owner.address, DOC_HASH, anyUint());

      const project = await registry.getProject(PROJECT_ID);
      expect(project.owner).to.equal(owner.address);
      expect(project.docHash).to.equal(DOC_HASH);
      expect(project.reportHash).to.equal(ZeroHash);
      expect(project.reportVersion).to.equal(0);
      expect(await registry.projectCount()).to.equal(1);
      expect(await registry.projectIdAt(0)).to.equal(PROJECT_ID);
    });

    it("no permite registrar dos veces el mismo id", async function () {
      const { registry } = await loadFixture(projectFixture);
      await expect(registry.registerProject(PROJECT_ID, hashOf("otro")))
        .to.be.revertedWithCustomError(registry, "ProjectAlreadyExists")
        .withArgs(PROJECT_ID);
    });

    it("rechaza un hash vacio", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(registry.registerProject(PROJECT_ID, ZeroHash)).to.be.revertedWithCustomError(
        registry,
        "EmptyHash"
      );
    });

    it("falla al consultar un proyecto inexistente", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(registry.getProject(id("no-existe")))
        .to.be.revertedWithCustomError(registry, "ProjectNotFound")
        .withArgs(id("no-existe"));
    });
  });

  describe("hitos", function () {
    it("agrega un hito en estado Pendiente", async function () {
      const { registry } = await loadFixture(projectFixture);
      const titleHash = hashOf("Modelo de datos");

      await expect(registry.addMilestone(PROJECT_ID, titleHash, 1893456000))
        .to.emit(registry, "MilestoneAdded")
        .withArgs(PROJECT_ID, 0, titleHash, 1893456000);

      const m = await registry.getMilestone(PROJECT_ID, 0);
      expect(m.titleHash).to.equal(titleHash);
      expect(m.status).to.equal(Status.Pending);
      expect(m.dueDate).to.equal(1893456000);
      expect(m.evidenceHash).to.equal(ZeroHash);
      expect(await registry.milestoneCount(PROJECT_ID)).to.equal(1);
    });

    it("agrega varios hitos en una sola transaccion", async function () {
      const { registry } = await loadFixture(projectFixture);
      const hashes = ["a", "b", "c"].map(hashOf);

      await registry.addMilestones(PROJECT_ID, hashes, [0, 0, 0]);

      expect(await registry.milestoneCount(PROJECT_ID)).to.equal(3);
      const lista = await registry.getMilestones(PROJECT_ID);
      expect(lista.map((m) => m.titleHash)).to.deep.equal(hashes);
    });

    it("rechaza arreglos de distinta longitud", async function () {
      const { registry } = await loadFixture(projectFixture);
      await expect(
        registry.addMilestones(PROJECT_ID, [hashOf("a"), hashOf("b")], [0])
      ).to.be.revertedWithCustomError(registry, "LengthMismatch");
    });

    it("solo el dueno del proyecto puede agregar hitos", async function () {
      const { registry, otro } = await loadFixture(projectFixture);
      await expect(registry.connect(otro).addMilestone(PROJECT_ID, hashOf("x"), 0))
        .to.be.revertedWithCustomError(registry, "NotProjectOwner")
        .withArgs(PROJECT_ID, otro.address);
    });
  });

  describe("cambios de estado", function () {
    it("emite el evento con el estado anterior y el nuevo", async function () {
      const { registry } = await loadFixture(projectFixture);
      await registry.addMilestone(PROJECT_ID, hashOf("Backend"), 0);
      const evidencia = hashOf("nota: endpoints listos");

      await expect(registry.updateMilestoneStatus(PROJECT_ID, 0, Status.Achieved, evidencia))
        .to.emit(registry, "MilestoneStatusChanged")
        .withArgs(PROJECT_ID, 0, Status.Pending, Status.Achieved, evidencia, anyUint());

      const m = await registry.getMilestone(PROJECT_ID, 0);
      expect(m.status).to.equal(Status.Achieved);
      expect(m.evidenceHash).to.equal(evidencia);
    });

    it("permite el mismo estado si cambia la evidencia", async function () {
      const { registry } = await loadFixture(projectFixture);
      await registry.addMilestone(PROJECT_ID, hashOf("Backend"), 0);
      await registry.updateMilestoneStatus(PROJECT_ID, 0, Status.InProgress, hashOf("nota 1"));

      await expect(registry.updateMilestoneStatus(PROJECT_ID, 0, Status.InProgress, hashOf("nota 2"))).to.emit(
        registry,
        "MilestoneStatusChanged"
      );
    });

    it("rechaza una actualizacion que no cambia nada", async function () {
      const { registry } = await loadFixture(projectFixture);
      await registry.addMilestone(PROJECT_ID, hashOf("Backend"), 0);
      await expect(registry.updateMilestoneStatus(PROJECT_ID, 0, Status.Pending, ZeroHash))
        .to.be.revertedWithCustomError(registry, "SameStatus")
        .withArgs(PROJECT_ID, 0, Status.Pending);
    });

    it("falla si el hito no existe", async function () {
      const { registry } = await loadFixture(projectFixture);
      await expect(registry.updateMilestoneStatus(PROJECT_ID, 7, Status.Achieved, ZeroHash))
        .to.be.revertedWithCustomError(registry, "MilestoneNotFound")
        .withArgs(PROJECT_ID, 7);
    });

    it("solo el dueno puede actualizar", async function () {
      const { registry, otro } = await loadFixture(projectFixture);
      await registry.addMilestone(PROJECT_ID, hashOf("Backend"), 0);
      await expect(
        registry.connect(otro).updateMilestoneStatus(PROJECT_ID, 0, Status.Achieved, ZeroHash)
      ).to.be.revertedWithCustomError(registry, "NotProjectOwner");
    });
  });

  describe("calculo de progreso", function () {
    it("pesa cada estado como dice la propuesta", async function () {
      const { registry } = await loadFixture(deployFixture);
      expect(await registry.statusWeightBps(Status.Achieved)).to.equal(10000);
      expect(await registry.statusWeightBps(Status.InProgress)).to.equal(5000);
      expect(await registry.statusWeightBps(Status.AtRisk)).to.equal(2500);
      expect(await registry.statusWeightBps(Status.Pending)).to.equal(0);
      expect(await registry.statusWeightBps(Status.NotAchieved)).to.equal(0);
    });

    it("es 0% sin hitos", async function () {
      const { registry } = await loadFixture(projectFixture);
      expect(await registry.progressBps(PROJECT_ID)).to.equal(0);
    });

    it("reproduce el ejemplo del documento: 62.5%", async function () {
      const { registry } = await loadFixture(projectFixture);
      await registry.addMilestones(PROJECT_ID, ["a", "b", "c", "d"].map(hashOf), [0, 0, 0, 0]);

      await registry.updateMilestoneStatus(PROJECT_ID, 0, Status.Achieved, ZeroHash);
      await registry.updateMilestoneStatus(PROJECT_ID, 1, Status.Achieved, ZeroHash);
      await registry.updateMilestoneStatus(PROJECT_ID, 2, Status.InProgress, ZeroHash);
      // el hito 3 queda Pendiente

      expect(await registry.progressBps(PROJECT_ID)).to.equal(6250);
    });

    it("cuenta los hitos por estado para las secciones del reporte", async function () {
      const { registry } = await loadFixture(projectFixture);
      await registry.addMilestones(PROJECT_ID, ["a", "b", "c", "d"].map(hashOf), [0, 0, 0, 0]);
      await registry.updateMilestoneStatus(PROJECT_ID, 0, Status.Achieved, ZeroHash);
      await registry.updateMilestoneStatus(PROJECT_ID, 1, Status.AtRisk, ZeroHash);
      await registry.updateMilestoneStatus(PROJECT_ID, 2, Status.NotAchieved, ZeroHash);

      const counts = await registry.statusBreakdown(PROJECT_ID);
      expect(counts.map(Number)).to.deep.equal([1, 0, 1, 1, 1]);
    });
  });

  describe("reporte y verificacion", function () {
    it("ancla el reporte con su version y el progreso del momento", async function () {
      const { registry } = await loadFixture(projectFixture);
      await registry.addMilestones(PROJECT_ID, ["a", "b"].map(hashOf), [0, 0]);
      await registry.updateMilestoneStatus(PROJECT_ID, 0, Status.Achieved, ZeroHash);
      const reportHash = hashOf("reporte-v1");

      await expect(registry.registerReport(PROJECT_ID, reportHash))
        .to.emit(registry, "ReportRegistered")
        .withArgs(PROJECT_ID, reportHash, 1, 5000, anyUint());

      const project = await registry.getProject(PROJECT_ID);
      expect(project.reportHash).to.equal(reportHash);
      expect(project.reportVersion).to.equal(1);
    });

    it("permite reanclar un reporte nuevo e incrementa la version", async function () {
      const { registry } = await loadFixture(projectFixture);
      await registry.registerReport(PROJECT_ID, hashOf("v1"));
      await registry.registerReport(PROJECT_ID, hashOf("v2"));

      const project = await registry.getProject(PROJECT_ID);
      expect(project.reportVersion).to.equal(2);
      expect(project.reportHash).to.equal(hashOf("v2"));
      expect(await registry.verifyReport(PROJECT_ID, hashOf("v1"))).to.equal(false);
      expect(await registry.verifyReport(PROJECT_ID, hashOf("v2"))).to.equal(true);
    });

    it("verifica el documento original y detecta uno modificado", async function () {
      const { registry } = await loadFixture(projectFixture);
      expect(await registry.verifyDocument(PROJECT_ID, DOC_HASH)).to.equal(true);
      expect(await registry.verifyDocument(PROJECT_ID, hashOf("pdf-modificado"))).to.equal(false);
    });

    it("no da por valido un reporte cuando no hay ninguno anclado", async function () {
      const { registry } = await loadFixture(projectFixture);
      expect(await registry.verifyReport(PROJECT_ID, ZeroHash)).to.equal(false);
    });
  });
});

// Helper local para no depender del import de anyValue en cada archivo.
function anyUint() {
  const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
  return anyValue;
}
