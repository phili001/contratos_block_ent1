// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MilestoneRegistry
/// @notice Capa de verificacion en Ethereum para el sistema de seguimiento de hitos.
///         Guarda unicamente datos pequenos y de tamano fijo: hashes de documentos,
///         hitos y sus estados. Los PDFs, textos y evidencias viven fuera de la cadena.
contract MilestoneRegistry {
    // ---------------------------------------------------------------------
    // Tipos
    // ---------------------------------------------------------------------

    /// @notice Estados posibles de un hito, en el mismo orden que la propuesta.
    enum Status {
        Pending, // 0 - Pendiente:     aun no se ha iniciado           -> 0%
        InProgress, // 1 - En progreso:   hay avance, no esta terminado  -> 50%
        AtRisk, // 2 - En riesgo:     hay un problema importante      -> 25%
        Achieved, // 3 - Alcanzado:     completado                      -> 100%
        NotAchieved // 4 - No alcanzado:  debia completarse y no se cumplio -> 0%
    }

    /// @dev Peso de cada estado en basis points (10000 = 100%). El progreso se
    ///      calcula on-chain en bps para no depender de aritmetica decimal.
    uint16 private constant BPS = 10_000;

    struct Milestone {
        bytes32 titleHash; // keccak256(nombre + descripcion) definido por el backend
        bytes32 evidenceHash; // hash de la ultima nota/evidencia (0 si no hay)
        uint64 dueDate; // fecha objetivo unix (0 = sin fecha)
        uint64 updatedAt; // ultimo cambio de estado
        Status status;
    }

    struct Project {
        address owner; // quien registro el proyecto (wallet del backend en el MVP)
        bytes32 docHash; // hash del documento original, inmutable
        bytes32 reportHash; // hash del ultimo reporte registrado
        uint64 createdAt;
        uint64 reportRegisteredAt;
        uint32 reportVersion; // cuantos reportes se han anclado
        bool exists;
    }

    // ---------------------------------------------------------------------
    // Estado
    // ---------------------------------------------------------------------

    mapping(bytes32 => Project) private _projects;
    mapping(bytes32 => Milestone[]) private _milestones;

    /// @notice Lista de proyectos registrados, para poder recorrerlos desde fuera.
    bytes32[] private _projectIds;

    // ---------------------------------------------------------------------
    // Eventos
    // ---------------------------------------------------------------------

    event ProjectRegistered(bytes32 indexed projectId, address indexed owner, bytes32 docHash, uint64 timestamp);

    event MilestoneAdded(bytes32 indexed projectId, uint32 indexed index, bytes32 titleHash, uint64 dueDate);

    event MilestoneStatusChanged(
        bytes32 indexed projectId,
        uint32 indexed index,
        Status previousStatus,
        Status newStatus,
        bytes32 evidenceHash,
        uint64 timestamp
    );

    event ReportRegistered(
        bytes32 indexed projectId, bytes32 reportHash, uint32 version, uint16 progressBps, uint64 timestamp
    );

    // ---------------------------------------------------------------------
    // Errores
    // ---------------------------------------------------------------------

    error ProjectAlreadyExists(bytes32 projectId);
    error ProjectNotFound(bytes32 projectId);
    error MilestoneNotFound(bytes32 projectId, uint32 index);
    error NotProjectOwner(bytes32 projectId, address caller);
    error EmptyHash();
    error SameStatus(bytes32 projectId, uint32 index, Status status);
    error LengthMismatch();

    // ---------------------------------------------------------------------
    // Modificadores
    // ---------------------------------------------------------------------

    modifier onlyProjectOwner(bytes32 projectId) {
        Project storage p = _projects[projectId];
        if (!p.exists) revert ProjectNotFound(projectId);
        if (p.owner != msg.sender) revert NotProjectOwner(projectId, msg.sender);
        _;
    }

    // ---------------------------------------------------------------------
    // Escritura
    // ---------------------------------------------------------------------

    /// @notice Ancla un proyecto nuevo y el hash de su documento original.
    /// @param projectId identificador del proyecto (p.ej. keccak256 del UUID del backend)
    /// @param docHash SHA-256 o Keccak-256 del PDF cargado
    function registerProject(bytes32 projectId, bytes32 docHash) external {
        if (docHash == bytes32(0)) revert EmptyHash();
        Project storage p = _projects[projectId];
        if (p.exists) revert ProjectAlreadyExists(projectId);

        p.owner = msg.sender;
        p.docHash = docHash;
        p.createdAt = uint64(block.timestamp);
        p.exists = true;
        _projectIds.push(projectId);

        emit ProjectRegistered(projectId, msg.sender, docHash, uint64(block.timestamp));
    }

    /// @notice Agrega un hito al proyecto. El estado inicial siempre es Pending.
    /// @return index posicion del hito dentro del proyecto
    function addMilestone(bytes32 projectId, bytes32 titleHash, uint64 dueDate)
        public
        onlyProjectOwner(projectId)
        returns (uint32 index)
    {
        if (titleHash == bytes32(0)) revert EmptyHash();

        Milestone[] storage list = _milestones[projectId];
        index = uint32(list.length);
        list.push(
            Milestone({
                titleHash: titleHash,
                evidenceHash: bytes32(0),
                dueDate: dueDate,
                updatedAt: uint64(block.timestamp),
                status: Status.Pending
            })
        );

        emit MilestoneAdded(projectId, index, titleHash, dueDate);
    }

    /// @notice Agrega varios hitos en una sola transaccion (carga inicial del documento).
    function addMilestones(bytes32 projectId, bytes32[] calldata titleHashes, uint64[] calldata dueDates)
        external
        onlyProjectOwner(projectId)
        returns (uint32 firstIndex)
    {
        if (titleHashes.length != dueDates.length) revert LengthMismatch();
        firstIndex = uint32(_milestones[projectId].length);
        for (uint256 i = 0; i < titleHashes.length; i++) {
            addMilestone(projectId, titleHashes[i], dueDates[i]);
        }
    }

    /// @notice Cambia el estado de un hito y ancla el hash de la evidencia asociada.
    /// @param evidenceHash hash de la nota/evidencia textual (bytes32(0) si no aplica)
    function updateMilestoneStatus(bytes32 projectId, uint32 index, Status newStatus, bytes32 evidenceHash)
        external
        onlyProjectOwner(projectId)
    {
        Milestone[] storage list = _milestones[projectId];
        if (index >= list.length) revert MilestoneNotFound(projectId, index);

        Milestone storage m = list[index];
        Status previous = m.status;
        if (previous == newStatus && evidenceHash == m.evidenceHash) {
            revert SameStatus(projectId, index, newStatus);
        }

        m.status = newStatus;
        m.evidenceHash = evidenceHash;
        m.updatedAt = uint64(block.timestamp);

        emit MilestoneStatusChanged(projectId, index, previous, newStatus, evidenceHash, uint64(block.timestamp));
    }

    /// @notice Ancla el hash del reporte generado. Se puede volver a llamar: cada
    ///         llamada incrementa la version y deja el evento como historial.
    function registerReport(bytes32 projectId, bytes32 reportHash) external onlyProjectOwner(projectId) {
        if (reportHash == bytes32(0)) revert EmptyHash();

        Project storage p = _projects[projectId];
        p.reportHash = reportHash;
        p.reportRegisteredAt = uint64(block.timestamp);
        p.reportVersion += 1;

        emit ReportRegistered(projectId, reportHash, p.reportVersion, progressBps(projectId), uint64(block.timestamp));
    }

    // ---------------------------------------------------------------------
    // Lectura
    // ---------------------------------------------------------------------

    /// @notice Progreso del proyecto en basis points (6250 = 62.50%).
    ///         Todos los hitos pesan igual, como en la propuesta.
    function progressBps(bytes32 projectId) public view returns (uint16) {
        Milestone[] storage list = _milestones[projectId];
        uint256 total = list.length;
        if (total == 0) return 0;

        uint256 accumulated;
        for (uint256 i = 0; i < total; i++) {
            accumulated += statusWeightBps(list[i].status);
        }
        return uint16(accumulated / total);
    }

    /// @notice Peso en bps de cada estado: 100%, 50%, 25%, 0%, 0%.
    function statusWeightBps(Status status) public pure returns (uint16) {
        if (status == Status.Achieved) return BPS;
        if (status == Status.InProgress) return BPS / 2;
        if (status == Status.AtRisk) return BPS / 4;
        return 0; // Pending y NotAchieved
    }

    /// @notice Conteo de hitos por estado, en el orden del enum. Sirve para armar
    ///         las secciones del reporte (alcanzados, requieren trabajo, en riesgo...).
    function statusBreakdown(bytes32 projectId) external view returns (uint32[5] memory counts) {
        Milestone[] storage list = _milestones[projectId];
        for (uint256 i = 0; i < list.length; i++) {
            counts[uint8(list[i].status)] += 1;
        }
    }

    function getProject(bytes32 projectId) external view returns (Project memory) {
        Project storage p = _projects[projectId];
        if (!p.exists) revert ProjectNotFound(projectId);
        return p;
    }

    function getMilestone(bytes32 projectId, uint32 index) external view returns (Milestone memory) {
        Milestone[] storage list = _milestones[projectId];
        if (index >= list.length) revert MilestoneNotFound(projectId, index);
        return list[index];
    }

    function getMilestones(bytes32 projectId) external view returns (Milestone[] memory) {
        return _milestones[projectId];
    }

    function milestoneCount(bytes32 projectId) external view returns (uint32) {
        return uint32(_milestones[projectId].length);
    }

    function projectCount() external view returns (uint256) {
        return _projectIds.length;
    }

    function projectIdAt(uint256 i) external view returns (bytes32) {
        return _projectIds[i];
    }

    /// @notice Verifica que un documento coincide con el hash anclado.
    function verifyDocument(bytes32 projectId, bytes32 candidateHash) external view returns (bool) {
        Project storage p = _projects[projectId];
        if (!p.exists) revert ProjectNotFound(projectId);
        return p.docHash == candidateHash;
    }

    /// @notice Verifica que un reporte coincide con el ultimo hash anclado.
    function verifyReport(bytes32 projectId, bytes32 candidateHash) external view returns (bool) {
        Project storage p = _projects[projectId];
        if (!p.exists) revert ProjectNotFound(projectId);
        return p.reportHash != bytes32(0) && p.reportHash == candidateHash;
    }
}
