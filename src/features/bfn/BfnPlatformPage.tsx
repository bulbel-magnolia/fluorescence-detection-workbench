import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../components/Icon';
import { ValidationSummary } from '../../components/ValidationSummary';
import { BfnEditorToolbar } from './BfnEditorToolbar';
import { BfnConnectionAssessment } from './BfnConnectionAssessment';
import { BfnCatalogDiscoveryDrawer } from './catalog/BfnCatalogDiscoveryDrawer';
import { BfnCatalogProvenanceInspector } from './catalog/BfnCatalogProvenanceInspector';
import { bfnCatalogReferencePresence } from './catalog/catalogBfnTypes';
import { assessBfnConnectionContextApplicability } from './compatibility/contextIntegration';
import type { BfnCatalogDetailTarget } from './catalog/catalogDetail';
import { instantiateBfnCatalogResponse } from './catalog/catalogInstantiation';
import { BfnNetworkCanvas } from './BfnNetworkCanvas';
import { BfnPropertyGrid } from './BfnPropertyGrid';
import {
  BfnProjectToolbar,
  type BfnPrimaryWorkspace,
  type BfnSaveStatus,
} from './BfnProjectToolbar';
import { BfnResultWorkspace } from './BfnResultWorkspace';
import { BfnLocalInfluenceDrawer } from './interpretation/BfnLocalInfluenceDrawer';
import { BfnNetworkInfluenceDrawer } from './interpretation/BfnNetworkInfluenceDrawer';
import { assessBfnLocalInfluenceAvailability } from './interpretation/localInfluencePresentation';
import { assessBfnNetworkInfluenceAvailability } from './interpretation/networkInfluencePresentation';
import { BfnCatalogInverseWorkspace } from './inverse-design/ui/BfnCatalogInverseWorkspace';
import { createBfnComputationSignature } from './computationSignature';
import {
  areBfnProjectsEquivalent,
  createBfnEditorHistory,
  createBfnEditorSnapshot,
  recordBfnEditorSnapshot,
  redoBfnEditorHistory,
  undoBfnEditorHistory,
  type BfnEditorChangeKind,
  type BfnEditorHistory,
  type BfnEditorSnapshot,
} from './editorHistory';
import { bfnEditorShortcut, isBfnEditorOverlayOpen } from './editorShortcuts';
import { resolveEffectiveBfnModel } from './modelResolution';
import type { BfnModuleLibraryInitialView } from './module-library/BfnModuleLibraryWorkspace';
import {
  createBfnModuleLibraryRepository,
  type BfnModuleLibraryRepository,
} from './module-library';
import {
  buildReusableModuleCaptureAvailability,
  type ReusableModuleCaptureAvailability,
} from './module-library/moduleLibraryWorkflow';
import {
  instantiateReusableModuleTemplate,
  type BfnModuleTemplateVersionV1,
  type BfnTemplateEntityBindingDecisions,
  type BfnTemplateInstantiationOptions,
  type BfnTemplateInstantiationResult,
} from './module-library/template';
import { BFN_CANVAS_SIZE, findBfnModulePlacement, type BfnCanvasViewport } from './nodePlacement';
import { createCatalogModule, createDemoBfnProject, type BfnCatalogModuleId } from './fixtures';
import {
  BFN_PROJECT_STORAGE_KEY,
  clearBfnRuns,
  loadBfnProject,
  loadBfnRuns,
  parseBfnProject,
  saveBfnProject,
  saveBfnRun,
} from './repository';
import {
  initialBfnSelection,
  sanitizeWorkspaceExportName,
} from './workspace/workspaceProjectFactory';
import {
  bfnContextSectionTitle,
  bfnContextValueLabel,
  bfnEntityLabel,
  bfnEvidenceTone,
  bfnModuleFlowLabel,
  bfnNodeDisplayName,
  bfnParameterPresentations,
  bfnPortMetaLabel,
  bfnPortPrimaryLabel,
  bfnQuantityLabel,
  bfnUnitLabel,
} from './presentation';
import {
  resolveBfnModuleSemanticPresentation,
  unavailableBfnSemanticPresentation,
  type BfnSemanticPresentation,
} from './semantic/semanticPresentation';
import { runBfnSimulation } from './simulation';
import { resolveBfnModuleTemporalCapability } from './temporal/temporalCapability';
import type { BfnTemporalCapability } from './temporal/temporalTypes';
import type { UserDefinedDynamicFunctionalModuleDraft } from './user-defined/userModuleDynamicContract';
import type { UserDefinedFunctionalModuleDraft } from './user-defined/userModuleContract';
import type { DesignedSenderSignalIdentity } from './user-defined/designed-sender/designedSenderSignalCatalog';
import type { SignalPoolDraft } from './user-defined/signal-pool/signalPoolContract';
import {
  materializeSignalPool,
  type SignalPoolMaterializationResult,
} from './user-defined/signal-pool/signalPoolMaterialization';
import {
  materializeUserDefinedStaticModule,
  type UserModuleMaterializationResult,
} from './user-defined/userModuleMaterialization';
import { materializeUserDefinedDynamicModule } from './user-defined/userModuleDynamicMaterialization';
import type {
  BfnDynamicInputSpecification,
  BfnCanvasPosition,
  BfnIdealEdgeEndpoint,
  BfnModelVariant,
  BfnParameterEstimate,
  BfnPort,
  BfnProject,
  BfnSimulationResult,
  BfnStaticInputSpecification,
  BfnValidationIssue,
  BfnValidityDomain,
} from './types';
import { addIdealConnection, checkIdealConnection, validateBfnProject } from './validation';
import { prioritizeBfnValidationIssues } from './validationPresentation';
import './bfn-platform.css';

type ResultFreshness = 'current' | 'stale';
type DestructiveAction = 'reset-project' | 'clear-runs';

export interface BfnPlatformPageProps {
  project?: BfnProject;
  projectName?: string;
  runs?: readonly BfnSimulationResult[];
  runSignatures?: Readonly<Record<string, string | null>>;
  runRelations?: Readonly<Record<string, 'current' | 'earlier' | 'legacy'>>;
  saveStatus?: BfnSaveStatus;
  projectCenterOpen?: boolean;
  onProjectChange?: (project: BfnProject) => void;
  onRunCreated?: (result: BfnSimulationResult, computationSignature: string) => Promise<void>;
  onClearRuns?: () => Promise<void>;
  onImportProject?: (file: File) => Promise<void>;
  onOpenProjectCenter?: () => void;
  onCatalogOpen?: () => void;
  moduleLibraryRepository?: BfnModuleLibraryRepository | null;
  moduleLibraryClock?: () => string;
}

interface EndpointOption {
  value: string;
  endpoint: BfnIdealEdgeEndpoint;
  label: string;
}

function endpointValue(endpoint: BfnIdealEdgeEndpoint): string {
  return `${endpoint.nodeId}::${endpoint.portId}`;
}

function parseEndpoint(value: string): BfnIdealEdgeEndpoint | null {
  const [nodeId, portId, ...rest] = value.split('::');
  return nodeId && portId && rest.length === 0 ? { nodeId, portId } : null;
}

function withNodePosition(
  project: BfnProject,
  nodeId: string,
  position: BfnCanvasPosition,
): BfnProject {
  return {
    ...project,
    network: {
      ...project.network,
      inputSources: project.network.inputSources.map((node) =>
        node.id === nodeId ? { ...node, position } : node,
      ),
      modules: project.network.modules.map((node) =>
        node.id === nodeId ? { ...node, position } : node,
      ),
      outputMonitors: project.network.outputMonitors.map((node) =>
        node.id === nodeId ? { ...node, position } : node,
      ),
    },
  };
}

function displayNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) > 0 && Math.abs(value) < 0.001) return value.toExponential(2);
  return value.toFixed(digits);
}

function formulaForModel(model: BfnModelVariant | null): string {
  if (!model) return '—';
  if (model.mode === 'dynamic' && model.family === 'accumulator') return '—';
  const response = model.mode === 'static' ? model.response : model.steadyStateResponse;
  const base = (() => {
    switch (response.family) {
      case 'hill_activation':
        return 'y = yₘᵢₙ + (yₘₐₓ − yₘᵢₙ)xⁿ/(Kⁿ + xⁿ)';
      case 'hill_repression':
        return 'y = yₘₐₓ − (yₘₐₓ − yₘᵢₙ)xⁿ/(Kⁿ + xⁿ)';
      case 'linear_transfer':
        return 'y = ax + b';
      case 'identity':
        return 'y = x';
      case 'independent_inputs':
        return 'y = h(b₀ + Σfᵢ(xᵢ))';
    }
  })();
  return model.mode === 'dynamic' ? `τ·dy/dt = ${base.slice(4)} − y` : base;
}

function nodeLabel(project: BfnProject, nodeId: string, t: TFunction, language: string): string {
  const node =
    project.network.inputSources.find((entry) => entry.id === nodeId) ??
    project.network.modules.find((entry) => entry.id === nodeId) ??
    project.network.outputMonitors.find((entry) => entry.id === nodeId);
  return node ? bfnNodeDisplayName(node, language, t) : nodeId;
}

function projectEntityLabel(project: BfnProject, entityId: string, t: TFunction): string {
  return (
    project.registry.entities.find((entity) => entity.id === entityId)?.displayName ??
    bfnEntityLabel(entityId, t)
  );
}

function endpointOptions(
  project: BfnProject,
  t: TFunction,
  language: string,
): {
  outputs: EndpointOption[];
  inputs: EndpointOption[];
} {
  const option = (nodeId: string, port: BfnPort, usePortMeta = false): EndpointOption => ({
    value: endpointValue({ nodeId, portId: port.id }),
    endpoint: { nodeId, portId: port.id },
    label:
      nodeLabel(project, nodeId, t, language) +
      ' · ' +
      (usePortMeta ? bfnPortMetaLabel(port, t) : bfnPortPrimaryLabel(port, t, language)),
  });
  return {
    outputs: [
      ...project.network.inputSources.map((source) => option(source.id, source.outputPort, true)),
      ...project.network.modules.flatMap((module) =>
        module.outputPorts.map((port) => option(module.id, port)),
      ),
    ],
    inputs: [
      ...project.network.modules.flatMap((module) =>
        module.inputPorts.map((port) => option(module.id, port)),
      ),
      ...project.network.outputMonitors.map((monitor) =>
        option(monitor.id, monitor.inputPort, true),
      ),
    ],
  };
}

function parameterValue(
  estimate: BfnParameterEstimate,
  t: TFunction,
  includeInterval = true,
): string {
  const interval =
    includeInterval && estimate.interval95
      ? ` · 95% [${displayNumber(estimate.interval95[0])}, ${displayNumber(estimate.interval95[1])}]`
      : '';
  return `${displayNumber(estimate.value)} ${bfnUnitLabel(estimate.unit, t)}${interval}`;
}

function portForEndpoint(project: BfnProject, endpoint: BfnIdealEdgeEndpoint): BfnPort | null {
  const source = project.network.inputSources.find((node) => node.id === endpoint.nodeId);
  if (source?.outputPort.id === endpoint.portId) return source.outputPort;
  const module = project.network.modules.find((node) => node.id === endpoint.nodeId);
  const modulePort = [...(module?.inputPorts ?? []), ...(module?.outputPorts ?? [])].find(
    (port) => port.id === endpoint.portId,
  );
  if (modulePort) return modulePort;
  const monitor = project.network.outputMonitors.find((node) => node.id === endpoint.nodeId);
  return monitor?.inputPort.id === endpoint.portId ? monitor.inputPort : null;
}

function validationMessage(t: TFunction, issue: BfnValidationIssue): string {
  const details: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(issue.details ?? {})) {
    if (typeof value !== 'string') {
      details[key] = value;
      continue;
    }
    const entity = bfnEntityLabel(value, t);
    if (entity !== value) {
      details[key] = entity;
      continue;
    }
    const quantity = bfnQuantityLabel(value, t);
    details[key] = quantity !== value ? quantity : bfnUnitLabel(value, t);
  }
  return t(`bfn.validation.${issue.code}`, details);
}

function simulationActionKey(project: BfnProject): string {
  if (project.network.mode === 'dynamic') return 'bfn.actions.runDynamic';
  return project.network.inputSources.some(
    (source) => source.staticSpecification.type === 'working_range',
  )
    ? 'bfn.actions.computeWorkingDomain'
    : 'bfn.actions.runStatic';
}

function simulationNoticeKey(project: BfnProject): string {
  if (project.network.mode === 'dynamic') return 'bfn.notices.dynamicCompleted';
  return project.network.inputSources.some(
    (source) => source.staticSpecification.type === 'working_range',
  )
    ? 'bfn.notices.workingDomainCompleted'
    : 'bfn.notices.staticCompleted';
}

function isDynamicUserModuleDraft(
  draft: UserDefinedFunctionalModuleDraft | UserDefinedDynamicFunctionalModuleDraft,
): draft is UserDefinedDynamicFunctionalModuleDraft {
  return 'steadyStateResponse' in draft && 'dynamics' in draft;
}

function configuredInputSummary(project: BfnProject, t: TFunction, language: string): string {
  const source = project.network.inputSources[0];
  if (!source) return t('bfn.runToolbar.noInput');
  const unit = bfnUnitLabel(source.outputPort.unit, t);
  const sourceLabel = bfnNodeDisplayName(source, language, t);
  if (project.network.mode === 'static') {
    const specification = source.staticSpecification;
    const value =
      specification.type === 'working_range'
        ? `${specification.minimum}–${specification.maximum} ${unit}`
        : `${specification.value} ${unit}`;
    return `${sourceLabel}：${value}`;
  }
  const specification = source.dynamicSpecification;
  const value = (() => {
    switch (specification.type) {
      case 'constant':
        return t('bfn.runToolbar.constantSummary', { value: specification.value, unit });
      case 'step':
        return t('bfn.runToolbar.stepSummary', {
          before: specification.before,
          after: specification.after,
          unit,
        });
      case 'pulse':
        return t('bfn.runToolbar.pulseSummary', {
          baseline: specification.baseline,
          amplitude: specification.amplitude,
          unit,
        });
      case 'periodic':
        return t('bfn.runToolbar.periodicSummary', {
          baseline: specification.baseline,
          amplitude: specification.amplitude,
          unit,
        });
      case 'custom_time_series':
        return t('bfn.runToolbar.customSummary', { count: specification.points.length, unit });
    }
  })();
  return `${sourceLabel}：${value}`;
}

export function BfnPlatformPage(props: BfnPlatformPageProps = {}) {
  const { t, i18n } = useTranslation();
  const nodeLanguage = i18n.resolvedLanguage ?? i18n.language;
  const controlled = props.project !== undefined;
  const [localProject, setLocalProject] = useState<BfnProject>(
    () => loadBfnProject() ?? createDemoBfnProject(),
  );
  const project = props.project ?? localProject;
  const setProject = (next: BfnProject): void => {
    if (props.onProjectChange) props.onProjectChange(next);
    else setLocalProject(next);
  };
  const [view, setView] = useState<BfnPrimaryWorkspace>('design');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialBfnSelection(project));
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [sourceEndpointValue, setSourceEndpointValue] = useState('');
  const [targetEndpointValue, setTargetEndpointValue] = useState('');
  const initialResult = props.runs?.[0] ?? null;
  const [result, setResult] = useState<BfnSimulationResult | null>(initialResult);
  const [resultBasisSignature, setResultBasisSignature] = useState<string | null>(() =>
    initialResult ? (props.runSignatures?.[initialResult.id] ?? null) : null,
  );
  const [resultPanelOpen, setResultPanelOpen] = useState(initialResult !== null);
  const [inputSettingsOpen, setInputSettingsOpen] = useState(false);
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const [localInfluenceModuleId, setLocalInfluenceModuleId] = useState<string | null>(null);
  const [networkInfluenceMonitorId, setNetworkInfluenceMonitorId] = useState<string | null>(null);
  const [moduleLibraryInitialView, setModuleLibraryInitialView] =
    useState<BfnModuleLibraryInitialView | null>(null);
  const [catalogInitialDetailTarget, setCatalogInitialDetailTarget] =
    useState<BfnCatalogDetailTarget | null>(null);
  const [localSaveStatus, setLocalSaveStatus] = useState<BfnSaveStatus>('saved');
  const saveStatus = props.saveStatus ?? localSaveStatus;
  const [localRuns, setLocalRuns] = useState(loadBfnRuns);
  const runs = props.runs ?? localRuns;
  const [notice, setNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [pendingDestructiveAction, setPendingDestructiveAction] =
    useState<DestructiveAction | null>(null);
  const [history, setHistory] = useState<BfnEditorHistory>(createBfnEditorHistory);
  const importRef = useRef<HTMLInputElement>(null);
  const defaultModuleLibraryRepositoryRef = useRef<BfnModuleLibraryRepository | null | undefined>(
    undefined,
  );
  if (defaultModuleLibraryRepositoryRef.current === undefined) {
    try {
      defaultModuleLibraryRepositoryRef.current = createBfnModuleLibraryRepository();
    } catch {
      defaultModuleLibraryRepositoryRef.current = null;
    }
  }
  const moduleLibraryRepository =
    props.moduleLibraryRepository !== undefined
      ? props.moduleLibraryRepository
      : defaultModuleLibraryRepositoryRef.current;
  const projectRef = useRef(project);
  const selectedNodeRef = useRef(selectedNodeId);
  const selectedEdgeRef = useRef(selectedEdgeId);
  const historyRef = useRef(history);
  const inputEditStartRef = useRef<BfnEditorSnapshot | null>(null);
  const canvasViewportRef = useRef<BfnCanvasViewport>({
    x: 0,
    y: 0,
    width: BFN_CANVAS_SIZE.width,
    height: 410,
  });
  const autosaveTimerRef = useRef<number | null>(null);
  const autosavePendingRef = useRef(false);
  const latestProjectRef = useRef(project);

  projectRef.current = project;
  selectedNodeRef.current = selectedNodeId;
  selectedEdgeRef.current = selectedEdgeId;
  historyRef.current = history;
  latestProjectRef.current = project;

  useEffect(() => {
    if (controlled) return undefined;
    setLocalSaveStatus('saving');
    autosavePendingRef.current = true;
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      try {
        saveBfnProject(project);
        autosavePendingRef.current = false;
        setLocalSaveStatus('saved');
      } catch {
        setLocalSaveStatus('error');
      }
    }, 320);

    return () => {
      if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [controlled, project]);

  useEffect(
    () => () => {
      if (controlled) return;
      if (!autosavePendingRef.current) return;
      try {
        saveBfnProject(latestProjectRef.current);
        autosavePendingRef.current = false;
      } catch {
        // The visible error state is handled while mounted; unmount must remain side-effect safe.
      }
    },
    [controlled],
  );

  const validationIssues = useMemo(() => validateBfnProject(project), [project]);
  const visibleValidationIssues = useMemo(
    () => prioritizeBfnValidationIssues(validationIssues).slice(0, 5),
    [validationIssues],
  );
  const currentComputationSignature = useMemo(
    () => createBfnComputationSignature(project),
    [project],
  );
  const resultFreshness: ResultFreshness =
    result && resultBasisSignature !== currentComputationSignature ? 'stale' : 'current';
  const options = useMemo(
    () => endpointOptions(project, t, nodeLanguage),
    [project, t, nodeLanguage],
  );
  const sourceEndpoint = parseEndpoint(sourceEndpointValue);
  const targetEndpoint = parseEndpoint(targetEndpointValue);
  const draftIssues = useMemo(
    () =>
      sourceEndpoint && targetEndpoint
        ? checkIdealConnection(project, sourceEndpoint, targetEndpoint)
        : [],
    [project, sourceEndpointValue, targetEndpointValue],
  );
  const draftSourcePort = sourceEndpoint ? portForEndpoint(project, sourceEndpoint) : null;
  const draftTargetPort = targetEndpoint ? portForEndpoint(project, targetEndpoint) : null;
  const draftContextAssessment = useMemo(
    () =>
      sourceEndpoint && targetEndpoint
        ? assessBfnConnectionContextApplicability(project, sourceEndpoint, targetEndpoint)
        : null,
    [project, sourceEndpointValue, targetEndpointValue],
  );
  const draftStructuralIssue = draftIssues.find(
    (issue) =>
      ![
        'source_port_direction',
        'target_port_direction',
        'entity_mismatch',
        'quantity_mismatch',
        'unit_dimension_mismatch',
        'context_applicability_uncertain',
        'context_applicability_mismatch',
        'context_applicability_unavailable',
      ].includes(issue.code),
  );
  const selectedModule =
    project.network.modules.find((module) => module.id === selectedNodeId) ?? null;
  const selectedLocalInfluenceAvailability = useMemo(
    () => (selectedModule ? assessBfnLocalInfluenceAvailability(project, selectedModule) : null),
    [project, selectedModule],
  );
  const localInfluenceModule =
    project.network.modules.find((module) => module.id === localInfluenceModuleId) ?? null;
  const localInfluenceAvailability = useMemo(
    () =>
      localInfluenceModule
        ? assessBfnLocalInfluenceAvailability(project, localInfluenceModule)
        : null,
    [localInfluenceModule, project],
  );
  const localInfluenceOpen =
    localInfluenceModule !== null && localInfluenceAvailability?.supported === true;
  const selectedModuleLibraryAvailability = useMemo<ReusableModuleCaptureAvailability | null>(
    () =>
      selectedModule?.authoring?.origin === 'user_defined'
        ? buildReusableModuleCaptureAvailability(project, selectedModule.id)
        : null,
    [project, selectedModule],
  );
  const selectedSource =
    project.network.inputSources.find((source) => source.id === selectedNodeId) ?? null;
  const selectedMonitor =
    project.network.outputMonitors.find((monitor) => monitor.id === selectedNodeId) ?? null;
  const selectedNetworkInfluenceAvailability = useMemo(
    () =>
      selectedMonitor ? assessBfnNetworkInfluenceAvailability(project, selectedMonitor) : null,
    [project, selectedMonitor],
  );
  const networkInfluenceMonitor =
    project.network.outputMonitors.find((monitor) => monitor.id === networkInfluenceMonitorId) ??
    null;
  const networkInfluenceAvailability = useMemo(
    () =>
      networkInfluenceMonitor
        ? assessBfnNetworkInfluenceAvailability(project, networkInfluenceMonitor)
        : null,
    [networkInfluenceMonitor, project],
  );
  const networkInfluenceOpen =
    networkInfluenceMonitor !== null && networkInfluenceAvailability?.supported === true;
  const selectedEdge = project.network.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedEdgeSourcePort = selectedEdge
    ? portForEndpoint(project, selectedEdge.source)
    : null;
  const selectedEdgeTargetPort = selectedEdge
    ? portForEndpoint(project, selectedEdge.target)
    : null;
  const selectedEdgeContextAssessment = useMemo(
    () =>
      selectedEdge
        ? assessBfnConnectionContextApplicability(project, selectedEdge.source, selectedEdge.target)
        : null,
    [project, selectedEdge],
  );
  const selectedModuleModel = selectedModule
    ? resolveEffectiveBfnModel(project, selectedModule)
    : null;
  const selectedTemporalCapability = selectedModule
    ? resolveBfnModuleTemporalCapability(project, selectedModule)
    : null;
  const selectedSemantic = useMemo(() => {
    if (!selectedModule) return null;
    try {
      return resolveBfnModuleSemanticPresentation(selectedModule, nodeLanguage);
    } catch {
      return unavailableBfnSemanticPresentation();
    }
  }, [nodeLanguage, selectedModule]);
  const selectedContext = selectedModuleModel
    ? (project.registry.contexts.find((context) => context.id === selectedModuleModel.contextId) ??
      null)
    : null;
  const selectedDomain = selectedModuleModel
    ? (project.registry.validityDomains.find(
        (domain) => domain.id === selectedModuleModel.validityDomainId,
      ) ?? null)
    : null;
  const selectedImplementations = selectedModule
    ? project.registry.implementations.filter((implementation) =>
        selectedModule.implementationIds.includes(implementation.id),
      )
    : [];
  const selectedParameterPresentations = selectedModule
    ? bfnParameterPresentations(selectedModule, selectedModuleModel, t, nodeLanguage)
    : [];
  const selectedDatasets = selectedModuleModel
    ? project.registry.datasets.filter((dataset) =>
        selectedModuleModel.sourceDatasetIds.includes(dataset.id),
      )
    : [];
  const selectedModelHasCatalogReference = selectedModuleModel
    ? bfnCatalogReferencePresence(selectedModuleModel).present
    : false;
  const inspectorSubtitle = selectedModule
    ? bfnModuleFlowLabel(selectedModule, t, nodeLanguage)
    : selectedSource
      ? bfnPortMetaLabel(selectedSource.outputPort, t)
      : selectedMonitor
        ? bfnPortMetaLabel(selectedMonitor.inputPort, t)
        : selectedEdge
          ? `${nodeLabel(project, selectedEdge.source.nodeId, t, nodeLanguage)} → ${nodeLabel(
              project,
              selectedEdge.target.nodeId,
              t,
              nodeLanguage,
            )}`
          : t(project.network.labelKey);

  const updateHistory = (next: BfnEditorHistory): void => {
    historyRef.current = next;
    setHistory(next);
  };

  const selectNode = (nodeId: string | null): void => {
    selectedNodeRef.current = nodeId;
    selectedEdgeRef.current = null;
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
  };

  const selectEdge = (edgeId: string | null): void => {
    selectedNodeRef.current = null;
    selectedEdgeRef.current = edgeId;
    setSelectedNodeId(null);
    setSelectedEdgeId(edgeId);
  };

  const currentEditorSnapshot = (): BfnEditorSnapshot =>
    createBfnEditorSnapshot(projectRef.current, selectedNodeRef.current, selectedEdgeRef.current);

  const recordSnapshot = (snapshot: BfnEditorSnapshot, kind: BfnEditorChangeKind): void => {
    updateHistory(recordBfnEditorSnapshot(historyRef.current, snapshot, kind));
  };

  const updateProjectLive = (updater: (current: BfnProject) => BfnProject): void => {
    const next = { ...updater(projectRef.current), updatedAt: new Date().toISOString() };
    projectRef.current = next;
    setProject(next);
    setNotice(null);
    setErrorNotice(null);
  };

  const performProjectEdit = (
    updater: (current: BfnProject) => BfnProject,
    kind: BfnEditorChangeKind = 'semantic',
  ): boolean => {
    const before = currentEditorSnapshot();
    const next = { ...updater(projectRef.current), updatedAt: new Date().toISOString() };
    if (areBfnProjectsEquivalent(before.project, next)) return false;
    recordSnapshot(before, kind);
    projectRef.current = next;
    setProject(next);
    setNotice(null);
    setErrorNotice(null);
    return true;
  };

  const restoreEditorSnapshot = (snapshot: BfnEditorSnapshot): void => {
    projectRef.current = snapshot.project;
    selectedNodeRef.current = snapshot.selectedNodeId;
    selectedEdgeRef.current = snapshot.selectedEdgeId;
    setProject(snapshot.project);
    setSelectedNodeId(snapshot.selectedNodeId);
    setSelectedEdgeId(snapshot.selectedEdgeId);
    setErrorNotice(null);
  };

  const undo = (): void => {
    const transition = undoBfnEditorHistory(historyRef.current, currentEditorSnapshot());
    if (!transition) return;
    updateHistory(transition.history);
    restoreEditorSnapshot(transition.snapshot);
    setNotice(t('bfn.notices.undone'));
  };

  const redo = (): void => {
    const transition = redoBfnEditorHistory(historyRef.current, currentEditorSnapshot());
    if (!transition) return;
    updateHistory(transition.history);
    restoreEditorSnapshot(transition.snapshot);
    setNotice(t('bfn.notices.redone'));
  };

  const clearEditorHistory = (): void => {
    inputEditStartRef.current = null;
    updateHistory(createBfnEditorHistory());
  };

  const openInputSettings = (): void => {
    if (!inputSettingsOpen) inputEditStartRef.current = currentEditorSnapshot();
    setInputSettingsOpen(true);
  };

  const commitInputEdit = (): void => {
    const start = inputEditStartRef.current;
    inputEditStartRef.current = null;
    if (start && !areBfnProjectsEquivalent(start.project, projectRef.current)) {
      recordSnapshot(start, 'semantic');
    }
  };

  const closeInputSettings = (): void => {
    commitInputEdit();
    setInputSettingsOpen(false);
  };

  const updateSource = (
    sourceId: string,
    updater: (
      source: BfnProject['network']['inputSources'][number],
    ) => BfnProject['network']['inputSources'][number],
  ): void => {
    updateProjectLive((current) => ({
      ...current,
      network: {
        ...current.network,
        inputSources: current.network.inputSources.map((source) =>
          source.id === sourceId ? updater(source) : source,
        ),
      },
    }));
  };

  const changeMode = (mode: BfnProject['network']['mode']): void => {
    if (mode === projectRef.current.network.mode) return;
    performProjectEdit((current) => ({
      ...current,
      network: { ...current.network, mode },
    }));
    setNotice(t('bfn.notices.modeChanged'));
  };

  const runSimulation = (): void => {
    try {
      commitInputEdit();
      const current = projectRef.current;
      const next = runBfnSimulation(current);
      const signature = createBfnComputationSignature(current);
      setResult(next);
      setResultBasisSignature(signature);
      setResultPanelOpen(true);
      setInputSettingsOpen(false);
      if (props.onRunCreated) {
        void props.onRunCreated(next, signature).catch(() => {
          setErrorNotice(t('bfn.workspace.notices.runSaveFailed'));
        });
      } else {
        setLocalRuns(saveBfnRun(next));
      }
      setNotice(t(simulationNoticeKey(current), { count: next.points.length }));
      setErrorNotice(null);
    } catch (error) {
      if (inputSettingsOpen) inputEditStartRef.current = currentEditorSnapshot();
      setErrorNotice(
        error instanceof Error && error.message.includes('BFN_VALIDATION_FAILED')
          ? t('bfn.notices.validationBlocked')
          : t('bfn.notices.runFailed'),
      );
    }
  };

  const createConnectionBetween = (
    source: BfnIdealEdgeEndpoint,
    target: BfnIdealEdgeEndpoint,
  ): boolean => {
    const issues = checkIdealConnection(projectRef.current, source, target);
    if (issues.some((issue) => issue.severity === 'error')) {
      setErrorNotice(t('bfn.notices.connectionBlocked'));
      return false;
    }
    const id = `edge-${Date.now()}`;
    const sourceLabel = options.outputs.find(
      (entry) => entry.value === endpointValue(source),
    )?.label;
    const targetLabel = options.inputs.find(
      (entry) => entry.value === endpointValue(target),
    )?.label;
    performProjectEdit((current) => addIdealConnection(current, source, target, id));
    selectEdge(id);
    setSourceEndpointValue('');
    setTargetEndpointValue('');
    setNotice(
      t('bfn.notices.connectionCreated', {
        source: sourceLabel ?? t('bfn.connections.source'),
        target: targetLabel ?? t('bfn.connections.target'),
      }),
    );
    return true;
  };

  const createConnection = (): void => {
    if (!sourceEndpoint || !targetEndpoint) {
      setErrorNotice(t('bfn.notices.connectionBlocked'));
      return;
    }
    createConnectionBetween(sourceEndpoint, targetEndpoint);
  };

  const commitRemoveSelectedEdge = (edgeId = selectedEdgeRef.current): void => {
    if (!edgeId || !projectRef.current.network.edges.some((edge) => edge.id === edgeId)) return;
    performProjectEdit((current) => ({
      ...current,
      network: {
        ...current.network,
        edges: current.network.edges.filter((edge) => edge.id !== edgeId),
      },
    }));
    selectEdge(null);
    setNotice(t('bfn.notices.connectionRemovedUndo'));
  };

  const addCatalogModule = (catalogId: BfnCatalogModuleId): void => {
    const suffix = `${Date.now()}`;
    const module = createCatalogModule(catalogId, suffix);
    module.position = findBfnModulePlacement(projectRef.current, canvasViewportRef.current);
    const domainId = `domain-${module.id}`;
    module.modelVariants = module.modelVariants.map((model) => ({
      ...model,
      validityDomainId: domainId,
    }));
    const domain: BfnValidityDomain = {
      id: domainId,
      labelKey: 'bfn.domains.catalogDemo',
      inputRanges: module.inputPorts.map((port) => ({
        portId: port.id,
        minimum: port.quantityType === 'concentration' ? 0.1 : 0,
        maximum: port.quantityType === 'concentration' ? 100 : 1,
        unit: port.unit,
      })),
      timeRangeHours: [0, 8],
      contextId: projectRef.current.registry.contexts[0]?.id ?? 'ctx-demo-ecoli',
    };
    performProjectEdit((current) => ({
      ...current,
      network: { ...current.network, modules: [...current.network.modules, module] },
      registry: {
        ...current.registry,
        validityDomains: [...current.registry.validityDomains, domain],
      },
    }));
    selectNode(module.id);
    setView('design');
    setModulePickerOpen(false);
    setCatalogInitialDetailTarget(null);
    setNotice(t('bfn.notices.moduleAdded'));
  };

  const addCatalogResponse = (responseId: string, createInputSource: boolean): void => {
    const outcome = instantiateBfnCatalogResponse(
      projectRef.current,
      responseId,
      createInputSource,
      canvasViewportRef.current,
    );
    if (!outcome.ok) {
      setErrorNotice(
        t(
          outcome.error === 'catalog-state-changed'
            ? 'bfn.notices.catalogStateChanged'
            : 'bfn.notices.catalogInstantiationFailed',
        ),
      );
      return;
    }
    const changed = performProjectEdit(() => outcome.nextProject);
    if (!changed) {
      setErrorNotice(t('bfn.notices.catalogInstantiationFailed'));
      return;
    }
    selectNode(outcome.addedModuleId);
    setView('design');
    setModulePickerOpen(false);
    setCatalogInitialDetailTarget(null);
    setNotice(
      t(
        outcome.addedInputSourceId
          ? 'bfn.notices.catalogModuleAndSourceAdded'
          : 'bfn.notices.catalogModuleAdded',
      ),
    );
  };

  const addUserDefinedModule = (
    draft: UserDefinedFunctionalModuleDraft | UserDefinedDynamicFunctionalModuleDraft,
  ): UserModuleMaterializationResult => {
    const outcome = isDynamicUserModuleDraft(draft)
      ? materializeUserDefinedDynamicModule(draft, projectRef.current)
      : materializeUserDefinedStaticModule(draft, projectRef.current);
    if (!outcome.ok) return outcome;
    const changed = performProjectEdit(() => outcome.nextProject);
    if (!changed) {
      return {
        ok: false,
        issues: [{ code: 'generated_id_collision', path: 'id' }],
      };
    }
    selectNode(outcome.addedModuleId);
    setView('design');
    setModulePickerOpen(false);
    setCatalogInitialDetailTarget(null);
    setNotice(t('bfn.notices.userModuleAdded'));
    return outcome;
  };

  const addDesignedSender = (
    draft: UserDefinedFunctionalModuleDraft,
    authoritativeSignal: DesignedSenderSignalIdentity | null,
  ): UserModuleMaterializationResult => {
    const outcome = materializeUserDefinedStaticModule(draft, projectRef.current, {
      authoritativeEntities: authoritativeSignal
        ? [{ id: authoritativeSignal.entityId, displayName: authoritativeSignal.displayName }]
        : [],
    });
    if (!outcome.ok) return outcome;
    const changed = performProjectEdit(() => outcome.nextProject);
    if (!changed) {
      return {
        ok: false,
        issues: [{ code: 'generated_id_collision', path: 'id' }],
      };
    }
    selectNode(outcome.addedModuleId);
    setView('design');
    setModulePickerOpen(false);
    setCatalogInitialDetailTarget(null);
    setNotice(t('bfn.notices.designedSenderAdded'));
    return outcome;
  };

  const addSignalPool = (draft: SignalPoolDraft): SignalPoolMaterializationResult => {
    const outcome = materializeSignalPool(draft, projectRef.current);
    if (!outcome.ok) return outcome;
    const changed = performProjectEdit(() => outcome.nextProject);
    if (!changed) {
      return {
        ok: false,
        issues: [{ code: 'generated_id_collision', path: 'id' }],
      };
    }
    selectNode(outcome.addedModuleId);
    setView('design');
    setModulePickerOpen(false);
    setCatalogInitialDetailTarget(null);
    setNotice(t('bfn.notices.signalPoolAdded'));
    return outcome;
  };

  const addSavedModule = (
    version: BfnModuleTemplateVersionV1,
    bindings: BfnTemplateEntityBindingDecisions,
    options: BfnTemplateInstantiationOptions,
  ): BfnTemplateInstantiationResult => {
    const outcome = instantiateReusableModuleTemplate(
      version,
      projectRef.current,
      bindings,
      options,
    );
    if (!outcome.ok) return outcome;
    const changed = performProjectEdit(() => outcome.nextProject);
    if (!changed) {
      return {
        ok: false,
        issues: [{ code: 'generated_id_collision', path: 'options.instanceId' }],
      };
    }
    selectNode(outcome.addedModuleId);
    setView('design');
    setModulePickerOpen(false);
    setCatalogInitialDetailTarget(null);
    setModuleLibraryInitialView(null);
    setNotice(t('bfn.moduleLibrary.feedback.added'));
    return outcome;
  };

  const openCatalogDiscovery = (): void => {
    props.onCatalogOpen?.();
    setCatalogInitialDetailTarget(null);
    setModuleLibraryInitialView(null);
    setModulePickerOpen(true);
  };

  const openCatalogDetail = (target: BfnCatalogDetailTarget): void => {
    props.onCatalogOpen?.();
    setModuleLibraryInitialView(null);
    setCatalogInitialDetailTarget(target);
    setModulePickerOpen(true);
  };

  const openSelectedModuleLibrarySave = (): void => {
    if (!selectedModule || !selectedModuleLibraryAvailability?.supported) return;
    props.onCatalogOpen?.();
    setCatalogInitialDetailTarget(null);
    setModuleLibraryInitialView({ kind: 'save', moduleId: selectedModule.id });
    setModulePickerOpen(true);
  };

  const closeCatalogDrawer = (): void => {
    setModulePickerOpen(false);
    setCatalogInitialDetailTarget(null);
    setModuleLibraryInitialView(null);
  };

  const closeLocalInfluence = (): void => {
    setLocalInfluenceModuleId(null);
  };

  const closeNetworkInfluence = (): void => {
    setNetworkInfluenceMonitorId(null);
  };

  const commitRemoveSelectedModule = (moduleId = selectedNodeRef.current): void => {
    if (!moduleId || !projectRef.current.network.modules.some((module) => module.id === moduleId)) {
      return;
    }
    performProjectEdit((current) => ({
      ...current,
      network: {
        ...current.network,
        modules: current.network.modules.filter((module) => module.id !== moduleId),
        edges: current.network.edges.filter(
          (edge) => edge.source.nodeId !== moduleId && edge.target.nodeId !== moduleId,
        ),
      },
    }));
    selectNode(null);
    setNotice(t('bfn.notices.moduleRemovedUndo'));
  };

  const exportProject = (): void => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeWorkspaceExportName(props.projectName ?? project.id)}.bfn-ir.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importProject = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      if (props.onImportProject) {
        await props.onImportProject(file);
        return;
      }
      const imported = parseBfnProject(await file.text());
      projectRef.current = imported;
      setProject(imported);
      setResult(null);
      setResultBasisSignature(null);
      setResultPanelOpen(false);
      selectNode(initialBfnSelection(imported));
      clearEditorHistory();
      setNotice(t('bfn.notices.imported'));
      setErrorNotice(null);
    } catch {
      setErrorNotice(t('bfn.notices.importFailed'));
    }
  };

  const commitResetProject = (): void => {
    const next = createDemoBfnProject(new Date().toISOString());
    projectRef.current = next;
    setProject(next);
    if (!controlled) {
      localStorage.setItem(BFN_PROJECT_STORAGE_KEY, JSON.stringify(next));
      clearBfnRuns();
      setLocalRuns([]);
    } else {
      void props
        .onClearRuns?.()
        .catch(() => setErrorNotice(t('bfn.workspace.notices.runSaveFailed')));
    }
    setResult(null);
    setResultBasisSignature(null);
    setResultPanelOpen(false);
    selectNode(initialBfnSelection(next));
    clearEditorHistory();
    setNotice(t('bfn.notices.reset'));
    setErrorNotice(null);
  };

  const commitClearRuns = (): void => {
    if (props.onClearRuns) {
      void props
        .onClearRuns()
        .then(() => setNotice(t('bfn.notices.runsCleared')))
        .catch(() => setErrorNotice(t('bfn.workspace.notices.runSaveFailed')));
      return;
    }
    clearBfnRuns();
    setLocalRuns([]);
    setNotice(t('bfn.notices.runsCleared'));
  };

  const confirmation =
    pendingDestructiveAction === 'clear-runs'
      ? {
          title: t('bfn.confirmations.clearRuns.title'),
          description: t('bfn.confirmations.clearRuns.description', { count: runs.length }),
          recoverability: t('bfn.confirmations.clearRuns.recoverability'),
          confirmLabel: t('bfn.confirmations.clearRuns.confirm'),
          cancelLabel: t('bfn.confirmations.clearRuns.cancel'),
        }
      : {
          title: t('bfn.confirmations.resetProject.title'),
          description: t('bfn.confirmations.resetProject.description'),
          recoverability: t('bfn.confirmations.resetProject.recoverability'),
          confirmLabel: t('bfn.confirmations.resetProject.confirm'),
          cancelLabel: t('bfn.confirmations.resetProject.cancel'),
        };

  const confirmDestructiveAction = (): void => {
    switch (pendingDestructiveAction) {
      case 'reset-project':
        commitResetProject();
        break;
      case 'clear-runs':
        commitClearRuns();
        break;
    }
    setPendingDestructiveAction(null);
  };

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent): void => {
      const overlayOpen =
        inputSettingsOpen ||
        modulePickerOpen ||
        localInfluenceOpen ||
        networkInfluenceOpen ||
        props.projectCenterOpen === true ||
        pendingDestructiveAction !== null ||
        isBfnEditorOverlayOpen();
      if (event.key === 'Escape') {
        if (pendingDestructiveAction !== null) return;
        if (localInfluenceOpen) {
          event.preventDefault();
          closeLocalInfluence();
          return;
        }
        if (networkInfluenceOpen) {
          event.preventDefault();
          closeNetworkInfluence();
          return;
        }
        if (inputSettingsOpen) {
          event.preventDefault();
          closeInputSettings();
          return;
        }
        if (modulePickerOpen) {
          event.preventDefault();
          closeCatalogDrawer();
          return;
        }
        if (overlayOpen) return;
      }
      if (view !== 'design' || overlayOpen) return;
      const shortcut = bfnEditorShortcut(event);
      if (!shortcut) return;
      if (shortcut === 'undo') {
        if (historyRef.current.past.length === 0) return;
        event.preventDefault();
        undo();
        return;
      }
      if (shortcut === 'redo') {
        if (historyRef.current.future.length === 0) return;
        event.preventDefault();
        redo();
        return;
      }
      if (selectedEdgeRef.current) {
        event.preventDefault();
        commitRemoveSelectedEdge();
      } else if (
        selectedNodeRef.current &&
        projectRef.current.network.modules.some((module) => module.id === selectedNodeRef.current)
      ) {
        event.preventDefault();
        commitRemoveSelectedModule();
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  });

  return (
    <div className="page page--bfn" data-workspace={view}>
      <div className="bfn-workbench-surface">
        <div className="bfn-top-surface">
          <BfnProjectToolbar
            projectName={props.projectName ?? t(project.labelKey)}
            networkName={t(project.network.labelKey)}
            isDemo={project.isDemo}
            workspace={view}
            saveStatus={saveStatus}
            projectCenterOpen={props.projectCenterOpen ?? false}
            onWorkspaceChange={setView}
            onOpenProjectCenter={() => {
              closeInputSettings();
              closeCatalogDrawer();
              closeLocalInfluence();
              props.onOpenProjectCenter?.();
            }}
            onImport={() => importRef.current?.click()}
            onExport={exportProject}
            onReset={() => setPendingDestructiveAction('reset-project')}
          />
          <input
            ref={importRef}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            aria-label={t('bfn.actions.import')}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void importProject(file);
            }}
          />

          {view === 'design' ? (
            <section className="bfn-run-toolbar" aria-label={t('bfn.runToolbar.label')}>
              <BfnEditorToolbar
                canUndo={history.past.length > 0}
                canRedo={history.future.length > 0}
                onUndo={undo}
                onRedo={redo}
              />
              <div
                className="bfn-mode-switch"
                role="group"
                aria-label={t('bfn.analysis.networkMode')}
              >
                {(['static', 'dynamic'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={project.network.mode === mode}
                    onClick={() => changeMode(mode)}
                  >
                    {t(`bfn.modes.${mode}`)}
                  </button>
                ))}
              </div>
              <div className="bfn-run-toolbar__summary">
                <span>{t('bfn.runToolbar.currentInput')}</span>
                <strong>{configuredInputSummary(project, t, nodeLanguage)}</strong>
              </div>
              <Button
                variant="secondary"
                leadingIcon={<Icon name="settings" size={15} />}
                onClick={openInputSettings}
              >
                {t('bfn.runToolbar.configureInput')}
              </Button>
              <Button
                className="bfn-run-toolbar__run"
                variant="primary"
                leadingIcon={<Icon name="play" size={16} />}
                onClick={runSimulation}
              >
                {result && resultFreshness === 'stale'
                  ? t('bfn.actions.rerun')
                  : t(simulationActionKey(project))}
              </Button>
            </section>
          ) : null}
        </div>
        {notice ? (
          <div className="bfn-notice" role="status">
            {notice}
          </div>
        ) : null}
        {errorNotice ? (
          <div className="bfn-notice bfn-notice--error" role="alert">
            {errorNotice}
          </div>
        ) : null}

        {view === 'design' ? (
          <div className="bfn-network-workspace">
            <aside className="bfn-network-index">
              <header>
                <h2>{t('bfn.networkIndex.title')}</h2>
              </header>
              <div className="bfn-network-index__list">
                <section className="bfn-network-index__group">
                  <h3>{t('bfn.nodeKinds.input')}</h3>
                  {project.network.inputSources.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      data-selected={selectedNodeId === source.id}
                      onClick={() => selectNode(source.id)}
                    >
                      <strong>{bfnNodeDisplayName(source, nodeLanguage, t)}</strong>
                      <small>{bfnPortMetaLabel(source.outputPort, t)}</small>
                    </button>
                  ))}
                </section>
                <section className="bfn-network-index__group">
                  <h3>{t('bfn.nodeKinds.module')}</h3>
                  {project.network.modules.map((module) => (
                    <button
                      key={module.id}
                      type="button"
                      data-selected={selectedNodeId === module.id}
                      onClick={() => selectNode(module.id)}
                    >
                      <strong>{bfnNodeDisplayName(module, nodeLanguage, t)}</strong>
                      <small>{bfnModuleFlowLabel(module, t, nodeLanguage)}</small>
                    </button>
                  ))}
                  <button
                    className="bfn-catalog-shortcut"
                    type="button"
                    onClick={openCatalogDiscovery}
                  >
                    <Icon name="plus" size={15} />
                    {t('bfn.networkIndex.addFromRegistry')}
                  </button>
                </section>
                <section className="bfn-network-index__group">
                  <h3>{t('bfn.nodeKinds.output')}</h3>
                  {project.network.outputMonitors.map((monitor) => (
                    <button
                      key={monitor.id}
                      type="button"
                      data-selected={selectedNodeId === monitor.id}
                      onClick={() => selectNode(monitor.id)}
                    >
                      <strong>{bfnNodeDisplayName(monitor, nodeLanguage, t)}</strong>
                      <small>{bfnPortMetaLabel(monitor.inputPort, t)}</small>
                    </button>
                  ))}
                </section>
              </div>
              <details className="bfn-connection-fallback">
                <summary>
                  <Icon name="link" size={15} />
                  {t('bfn.connections.exact')}
                </summary>
                <section
                  className="bfn-connection-builder"
                  aria-label={t('bfn.connections.builder')}
                >
                  <header>
                    <Icon name="link" size={15} />
                    <strong>{t('bfn.connections.builder')}</strong>
                  </header>
                  <label>
                    <span>{t('bfn.connections.source')}</span>
                    <select
                      aria-label={t('bfn.connections.source')}
                      value={sourceEndpointValue}
                      onChange={(event) => setSourceEndpointValue(event.target.value)}
                    >
                      <option value="">{t('bfn.connections.chooseSource')}</option>
                      {options.outputs.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t('bfn.connections.target')}</span>
                    <select
                      aria-label={t('bfn.connections.target')}
                      value={targetEndpointValue}
                      onChange={(event) => setTargetEndpointValue(event.target.value)}
                    >
                      <option value="">{t('bfn.connections.chooseTarget')}</option>
                      {options.inputs.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {draftSourcePort && draftTargetPort && draftContextAssessment ? (
                    <BfnConnectionAssessment
                      sourcePort={draftSourcePort}
                      targetPort={draftTargetPort}
                      context={draftContextAssessment}
                      compact
                    />
                  ) : null}
                  {draftStructuralIssue ? (
                    <div
                      className="bfn-connection-check"
                      data-valid={!draftIssues.some((issue) => issue.severity === 'error')}
                    >
                      {validationMessage(t, draftStructuralIssue)}
                    </div>
                  ) : null}
                  <Button
                    variant="secondary"
                    fullWidth
                    disabled={
                      !sourceEndpoint ||
                      !targetEndpoint ||
                      draftIssues.some((issue) => issue.severity === 'error')
                    }
                    onClick={createConnection}
                  >
                    {t('bfn.connections.create')}
                  </Button>
                </section>
              </details>
            </aside>

            <section className="bfn-network-stage">
              <header className="bfn-section-heading">
                <div>
                  <h2>{t(project.network.labelKey)}</h2>
                </div>
                <div className="bfn-stage-header-actions">
                  <div className="bfn-stage-badges">
                    <span>
                      {project.network.modules.length} {t('bfn.canvas.modules')}
                    </span>
                    <span>
                      {project.network.edges.length} {t('bfn.canvas.edges')}
                    </span>
                    <span>{t(`bfn.modes.${project.network.mode}`)}</span>
                  </div>
                </div>
              </header>
              <BfnNetworkCanvas
                project={project}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                onSelectNode={selectNode}
                onSelectEdge={selectEdge}
                onClearSelection={() => selectNode(null)}
                onMoveNode={(nodeId, position) =>
                  updateProjectLive((current) => withNodePosition(current, nodeId, position))
                }
                onMoveNodeCommit={(nodeId, start, end) => {
                  if (start.x === end.x && start.y === end.y) return;
                  recordSnapshot(
                    createBfnEditorSnapshot(
                      withNodePosition(projectRef.current, nodeId, start),
                      selectedNodeRef.current,
                      selectedEdgeRef.current,
                    ),
                    'layout',
                  );
                }}
                evaluateConnection={(source, target) => {
                  const issue = checkIdealConnection(projectRef.current, source, target).find(
                    (candidate) => candidate.severity === 'error',
                  );
                  return {
                    compatible: !issue,
                    message: issue ? validationMessage(t, issue) : null,
                  };
                }}
                onCreateConnection={createConnectionBetween}
                onViewportChange={(viewport) => {
                  canvasViewportRef.current = viewport;
                }}
              />
            </section>

            <aside className="bfn-inspector">
              <header className="bfn-section-heading">
                <div>
                  <h2>
                    {selectedModule
                      ? bfnNodeDisplayName(selectedModule, nodeLanguage, t)
                      : selectedSource
                        ? bfnNodeDisplayName(selectedSource, nodeLanguage, t)
                        : selectedMonitor
                          ? bfnNodeDisplayName(selectedMonitor, nodeLanguage, t)
                          : selectedEdge
                            ? t('bfn.inspector.connection')
                            : t('bfn.inspector.project')}
                  </h2>
                  <p className="bfn-inspector__subtitle">{inspectorSubtitle}</p>
                </div>
              </header>
              <div className="bfn-inspector__body">
                {selectedModule ? (
                  <>
                    <section className="bfn-inspector-block">
                      <header>
                        <strong>{t('bfn.inspector.effect')}</strong>
                      </header>
                      <p>
                        {selectedModule.authoring?.description ?? t(selectedModule.descriptionKey)}
                      </p>
                    </section>
                    {selectedModule.authoring?.origin === 'user_defined' ? null : (
                      <ModuleSemanticClassification semantic={selectedSemantic} />
                    )}
                    <ModuleTemporalClassification capability={selectedTemporalCapability} />
                    <section className="bfn-inspector-block">
                      <header>
                        <strong>{t('bfn.inspector.inputsAndOutputs')}</strong>
                      </header>
                      <div className="bfn-signal-flow">
                        <div className="bfn-signal-flow__group" data-direction="input">
                          <span>{t('bfn.nodeKinds.input')}</span>
                          {selectedModule.inputPorts.map((port) => (
                            <article key={port.id}>
                              <strong>{bfnPortPrimaryLabel(port, t, nodeLanguage)}</strong>
                              <small>
                                {port.authoring
                                  ? `${projectEntityLabel(project, port.entity, t)} · ${bfnPortMetaLabel(port, t)}`
                                  : bfnUnitLabel(port.unit, t)}
                              </small>
                            </article>
                          ))}
                        </div>
                        <span className="bfn-signal-flow__arrow" aria-hidden="true">
                          ↓
                        </span>
                        <div className="bfn-signal-flow__group" data-direction="output">
                          <span>{t('bfn.nodeKinds.output')}</span>
                          {selectedModule.outputPorts.map((port) => (
                            <article key={port.id}>
                              <strong>{bfnPortPrimaryLabel(port, t, nodeLanguage)}</strong>
                              <small>
                                {port.authoring
                                  ? `${projectEntityLabel(project, port.entity, t)} · ${bfnPortMetaLabel(port, t)}`
                                  : bfnUnitLabel(port.unit, t)}
                              </small>
                            </article>
                          ))}
                        </div>
                      </div>
                    </section>
                    <section className="bfn-inspector-block">
                      <header>
                        <strong>{t('bfn.inspector.keyParameters')}</strong>
                      </header>
                      <div className="bfn-parameter-list">
                        <BfnPropertyGrid
                          key={selectedModule.id}
                          label={t('bfn.inspector.keyParameters')}
                          rows={selectedParameterPresentations.slice(0, 4).map((row) => ({
                            id: row.id,
                            label: row.label,
                            value: displayNumber(row.estimate.value),
                            unit:
                              row.estimate.unit === 'dimensionless'
                                ? undefined
                                : bfnUnitLabel(row.estimate.unit, t),
                            symbol: row.showSymbolInSummary === false ? undefined : row.symbol,
                            description: row.description,
                          }))}
                        />
                      </div>
                    </section>
                    {selectedModule.authoring?.origin === 'user_defined' && selectedModuleModel ? (
                      <section className="bfn-inspector-block">
                        <header>
                          <strong>{t('bfn.userAuthoring.sections.uncertainty')}</strong>
                        </header>
                        <p>
                          {t(
                            `bfn.userAuthoring.uncertainty.${selectedModuleModel.uncertaintyMethod}`,
                          )}
                        </p>
                      </section>
                    ) : null}
                    {selectedModuleModel?.mode === 'static' &&
                    selectedModuleModel.response.family === 'independent_inputs' ? (
                      <section className="bfn-inspector-block">
                        <header>
                          <strong>{t('bfn.inspector.currentCalculation')}</strong>
                        </header>
                        <p>{t('bfn.assumptions.independentUnverified')}</p>
                      </section>
                    ) : null}
                    <section className="bfn-inspector-block">
                      <header>
                        <strong>{t('bfn.inspector.modelBasis')}</strong>
                      </header>
                      <div
                        className="bfn-evidence-banner"
                        data-grade={
                          selectedModuleModel?.evidenceGrade ?? selectedModule.evidenceGrade
                        }
                        data-evidence-tone={bfnEvidenceTone(
                          selectedModuleModel?.evidenceGrade ?? selectedModule.evidenceGrade,
                        )}
                      >
                        <strong>
                          {t(
                            `bfn.evidence.${
                              selectedModuleModel?.evidenceGrade ?? selectedModule.evidenceGrade
                            }`,
                          )}
                        </strong>
                      </div>
                    </section>
                    {selectedLocalInfluenceAvailability ? (
                      <section className="bfn-inspector-block bfn-inspector-action">
                        <header>
                          <strong>{t('bfn.localInfluence.inspectorTitle')}</strong>
                        </header>
                        <p
                          className={
                            selectedLocalInfluenceAvailability.supported
                              ? undefined
                              : 'bfn-inspector-action__reason'
                          }
                        >
                          {selectedLocalInfluenceAvailability.supported
                            ? t('bfn.localInfluence.purpose')
                            : t(
                                'bfn.localInfluence.availabilityReasons.' +
                                  selectedLocalInfluenceAvailability.reason,
                              )}
                        </p>
                        <Button
                          size="sm"
                          variant="secondary"
                          leadingIcon={<Icon name="pulse" size={14} />}
                          disabled={!selectedLocalInfluenceAvailability.supported}
                          {...(!selectedLocalInfluenceAvailability.supported
                            ? {
                                disabledReason: t(
                                  'bfn.localInfluence.availabilityReasons.' +
                                    selectedLocalInfluenceAvailability.reason,
                                ),
                              }
                            : {})}
                          onClick={() => setLocalInfluenceModuleId(selectedModule.id)}
                        >
                          {t('bfn.localInfluence.action')}
                        </Button>
                      </section>
                    ) : null}
                    {selectedModuleModel ? (
                      <BfnCatalogProvenanceInspector
                        project={project}
                        module={selectedModule}
                        model={selectedModuleModel}
                        onOpenCatalogDetail={openCatalogDetail}
                      />
                    ) : null}
                    <details className="bfn-inspector-details">
                      <summary>{t('bfn.inspector.detailedParameters')}</summary>
                      {selectedParameterPresentations.length > 4 ? (
                        <div className="bfn-parameter-list bfn-parameter-list--details">
                          <BfnPropertyGrid
                            key={`${selectedModule.id}-details`}
                            label={t('bfn.inspector.detailedParameters')}
                            rows={selectedParameterPresentations.slice(4).map((row) => ({
                              id: row.id,
                              label: row.label,
                              value: displayNumber(row.estimate.value),
                              unit:
                                row.estimate.unit === 'dimensionless'
                                  ? undefined
                                  : bfnUnitLabel(row.estimate.unit, t),
                              symbol: row.symbol,
                              description: row.description,
                            }))}
                          />
                        </div>
                      ) : (
                        <p className="bfn-inspector-empty">
                          {t('bfn.inspector.noAdditionalParameters')}
                        </p>
                      )}
                    </details>
                    {!selectedModelHasCatalogReference ? (
                      <details className="bfn-inspector-details">
                        <summary>{t('bfn.inspector.experimentAndData')}</summary>
                        <div className="bfn-inspector-details__content">
                          <strong>{bfnContextSectionTitle(selectedContext, t)}</strong>
                          {selectedContext ? (
                            <dl className="bfn-context-grid">
                              <div>
                                <dt>{t('bfn.context.host')}</dt>
                                <dd>
                                  <em>{selectedContext.host}</em>
                                </dd>
                              </div>
                              <div>
                                <dt>{t('bfn.context.strain')}</dt>
                                <dd>{bfnContextValueLabel(selectedContext.strain, t)}</dd>
                              </div>
                              <div>
                                <dt>{t('bfn.context.medium')}</dt>
                                <dd>{bfnContextValueLabel(selectedContext.medium, t)}</dd>
                              </div>
                              <div>
                                <dt>{t('bfn.context.temperature')}</dt>
                                <dd>{selectedContext.temperatureCelsius} °C</dd>
                              </div>
                            </dl>
                          ) : (
                            <p>{t('bfn.userAuthoring.contextNotRecorded')}</p>
                          )}
                          <strong>{t('bfn.inspector.linkedData')}</strong>
                          {selectedDatasets.length ? (
                            <ul className="bfn-linked-datasets">
                              {selectedDatasets.map((dataset) => (
                                <li key={dataset.id}>{t(dataset.labelKey)}</li>
                              ))}
                            </ul>
                          ) : (
                            <p>{t('bfn.inspector.notLinkedDataset')}</p>
                          )}
                        </div>
                      </details>
                    ) : null}
                    <details className="bfn-inspector-details">
                      <summary>{t('bfn.inspector.mathematicalModel')}</summary>
                      <p className="bfn-domain-range">
                        {t('bfn.inspector.modelType')}:{' '}
                        {selectedModuleModel
                          ? t(`bfn.modelFamilies.${selectedModuleModel.family}`)
                          : '—'}
                      </p>
                      <code className="bfn-formula">{formulaForModel(selectedModuleModel)}</code>
                      <div className="bfn-math-parameters">
                        {selectedParameterPresentations.map((row) => (
                          <article key={row.id}>
                            <span>{row.symbol ?? row.label}</span>
                            <strong>{parameterValue(row.estimate, t)}</strong>
                          </article>
                        ))}
                      </div>
                      <p className="bfn-domain-range">
                        {t('bfn.inspector.modelVersion')}: {selectedModuleModel?.version ?? '—'}
                      </p>
                    </details>
                    <details className="bfn-inspector-details">
                      <summary>{t('bfn.inspector.advancedInformation')}</summary>
                      <section>
                        <strong>{t('bfn.inspector.applicability')}</strong>
                        {selectedDomain?.inputRanges.map((range) => {
                          const port = [
                            ...selectedModule.inputPorts,
                            ...selectedModule.outputPorts,
                          ].find((entry) => entry.id === range.portId);
                          return (
                            <p key={range.portId} className="bfn-domain-range">
                              {port
                                ? bfnEntityLabel(port.entity, t)
                                : t('bfn.inspector.inputRange')}
                              : {range.minimum}–{range.maximum} {bfnUnitLabel(range.unit, t)}
                            </p>
                          );
                        })}
                      </section>
                      <section>
                        <strong>{t('bfn.inspector.implementations')}</strong>
                        {selectedImplementations.length ? (
                          selectedImplementations.map((implementation) => (
                            <div className="bfn-implementation" key={implementation.id}>
                              <strong>{t(implementation.labelKey)}</strong>
                              <span>
                                {implementation.promoter} · {implementation.rbs}
                              </span>
                              <small
                                data-evidence-tone={bfnEvidenceTone(implementation.evidenceGrade)}
                              >
                                {t(`bfn.evidence.${implementation.evidenceGrade}`)}
                              </small>
                            </div>
                          ))
                        ) : (
                          <p className="bfn-inspector-empty">
                            {t('bfn.inspector.noImplementation')}
                          </p>
                        )}
                      </section>
                    </details>
                    {selectedModule.authoring?.origin === 'user_defined' &&
                    selectedModuleLibraryAvailability ? (
                      <section className="bfn-inspector-block">
                        <header>
                          <strong>{t('bfn.moduleLibrary.inspector.title')}</strong>
                        </header>
                        <p>
                          {selectedModuleLibraryAvailability.supported
                            ? t('bfn.moduleLibrary.inspector.description')
                            : t(
                                'bfn.moduleLibrary.captureFailures.' +
                                  selectedModuleLibraryAvailability.failureKind,
                              )}
                        </p>
                        <Button
                          size="sm"
                          variant="secondary"
                          leadingIcon={<Icon name="file" size={14} />}
                          disabled={!selectedModuleLibraryAvailability.supported}
                          {...(!selectedModuleLibraryAvailability.supported
                            ? { disabledReason: t('bfn.moduleLibrary.inspector.saveBlocked') }
                            : {})}
                          onClick={openSelectedModuleLibrarySave}
                        >
                          {t('bfn.moduleLibrary.inspector.saveAction')}
                        </Button>
                      </section>
                    ) : null}
                    <button
                      className="danger-text-button"
                      type="button"
                      onClick={() => commitRemoveSelectedModule(selectedModule.id)}
                    >
                      <Icon name="trash" size={14} />
                      {t('bfn.actions.removeModule')}
                    </button>
                  </>
                ) : selectedSource ? (
                  <>
                    <section className="bfn-inspector-block bfn-inspector-block--source">
                      <header>
                        <strong>{t('bfn.inspector.inputSignal')}</strong>
                      </header>
                      <BfnPropertyGrid
                        key={selectedSource.id}
                        label={t('bfn.inspector.inputSignal')}
                        rows={[
                          {
                            id: 'signal',
                            label: t('bfn.inspector.signal'),
                            value: bfnPortPrimaryLabel(selectedSource.outputPort, t, nodeLanguage),
                          },
                          {
                            id: 'measurement',
                            label: t('bfn.inspector.measurement'),
                            value: bfnQuantityLabel(selectedSource.outputPort.quantityType, t),
                          },
                          {
                            id: 'unit',
                            label: t('bfn.inspector.unit'),
                            value: bfnUnitLabel(selectedSource.outputPort.unit, t),
                          },
                          {
                            id: 'analysis',
                            label: t('bfn.inspector.analysisMode'),
                            value: t(`bfn.modes.${project.network.mode}`),
                          },
                        ]}
                      />
                    </section>
                    <button
                      className="button button--secondary button--wide"
                      type="button"
                      onClick={openInputSettings}
                    >
                      {t('bfn.inspector.configureInput')}
                    </button>
                  </>
                ) : selectedMonitor ? (
                  <>
                    <section className="bfn-inspector-block">
                      <header>
                        <strong>{t('bfn.inspector.output')}</strong>
                      </header>
                      <p>{t('bfn.inspector.monitorText')}</p>
                      <BfnPropertyGrid
                        key={selectedMonitor.id}
                        label={t('bfn.inspector.output')}
                        rows={[
                          {
                            id: 'signal',
                            label: t('bfn.inspector.signal'),
                            value: bfnPortPrimaryLabel(selectedMonitor.inputPort, t, nodeLanguage),
                          },
                          {
                            id: 'measurement',
                            label: t('bfn.inspector.measurement'),
                            value: bfnQuantityLabel(selectedMonitor.inputPort.quantityType, t),
                          },
                          {
                            id: 'unit',
                            label: t('bfn.inspector.unit'),
                            value: bfnUnitLabel(selectedMonitor.inputPort.unit, t),
                          },
                        ]}
                      />
                    </section>
                    {selectedNetworkInfluenceAvailability ? (
                      <section className="bfn-inspector-block bfn-inspector-action">
                        <header>
                          <strong>{t('bfn.networkInfluence.inspectorTitle')}</strong>
                        </header>
                        <p
                          className={
                            selectedNetworkInfluenceAvailability.supported
                              ? undefined
                              : 'bfn-inspector-action__reason'
                          }
                        >
                          {selectedNetworkInfluenceAvailability.supported
                            ? t('bfn.networkInfluence.purpose')
                            : t(
                                'bfn.networkInfluence.availabilityReasons.' +
                                  selectedNetworkInfluenceAvailability.reason,
                              )}
                        </p>
                        <Button
                          size="sm"
                          variant="secondary"
                          leadingIcon={<Icon name="pulse" size={14} />}
                          disabled={!selectedNetworkInfluenceAvailability.supported}
                          {...(!selectedNetworkInfluenceAvailability.supported
                            ? {
                                disabledReason: t(
                                  'bfn.networkInfluence.availabilityReasons.' +
                                    selectedNetworkInfluenceAvailability.reason,
                                ),
                              }
                            : {})}
                          onClick={() => setNetworkInfluenceMonitorId(selectedMonitor.id)}
                        >
                          {t('bfn.networkInfluence.action')}
                        </Button>
                      </section>
                    ) : null}
                  </>
                ) : selectedEdge ? (
                  <>
                    <div className="bfn-edge-signal-flow">
                      <div>
                        <span>{t('bfn.connections.source')}</span>
                        <strong>
                          {nodeLabel(project, selectedEdge.source.nodeId, t, nodeLanguage)}
                        </strong>
                        <small>
                          {selectedEdgeSourcePort
                            ? bfnPortPrimaryLabel(selectedEdgeSourcePort, t, nodeLanguage)
                            : '—'}
                        </small>
                      </div>
                      <span aria-hidden="true">↓</span>
                      <div>
                        <span>{t('bfn.connections.target')}</span>
                        <strong>
                          {nodeLabel(project, selectedEdge.target.nodeId, t, nodeLanguage)}
                        </strong>
                        <small>
                          {selectedEdgeTargetPort
                            ? t('bfn.inspector.signalInput', {
                                signal: bfnPortPrimaryLabel(
                                  selectedEdgeTargetPort,
                                  t,
                                  nodeLanguage,
                                ),
                              })
                            : '—'}
                        </small>
                      </div>
                    </div>
                    {selectedEdgeSourcePort &&
                    selectedEdgeTargetPort &&
                    selectedEdgeContextAssessment ? (
                      <BfnConnectionAssessment
                        sourcePort={selectedEdgeSourcePort}
                        targetPort={selectedEdgeTargetPort}
                        context={selectedEdgeContextAssessment}
                      />
                    ) : null}
                    <details className="bfn-inspector-details">
                      <summary>{t('bfn.inspector.advancedInformation')}</summary>
                      <p className="bfn-edge-explanation">
                        {t('bfn.inspector.edgeText', {
                          signal: selectedEdgeSourcePort
                            ? bfnPortPrimaryLabel(selectedEdgeSourcePort, t, nodeLanguage)
                            : t('bfn.parameters.outputSignal'),
                          source: nodeLabel(project, selectedEdge.source.nodeId, t, nodeLanguage),
                          target: nodeLabel(project, selectedEdge.target.nodeId, t, nodeLanguage),
                        })}
                      </p>
                    </details>
                    <button
                      className="danger-text-button"
                      type="button"
                      onClick={() => commitRemoveSelectedEdge(selectedEdge.id)}
                    >
                      <Icon name="trash" size={14} />
                      {t('bfn.actions.removeEdge')}
                    </button>
                  </>
                ) : (
                  <section className="bfn-inspector-block">
                    <header>
                      <strong>{t('bfn.inspector.project')}</strong>
                    </header>
                    <p>{t('bfn.inspector.projectText')}</p>
                  </section>
                )}
              </div>
            </aside>
          </div>
        ) : null}

        {view === 'design' && inputSettingsOpen ? (
          <div className="bfn-drawer-layer">
            <button
              className="bfn-drawer-scrim"
              type="button"
              aria-label={t('bfn.drawers.closeInput')}
              onClick={closeInputSettings}
            />
            <aside
              className="bfn-drawer bfn-input-settings-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bfn-input-settings-title"
            >
              <header className="bfn-drawer__header">
                <div>
                  <span>{t(`bfn.modes.${project.network.mode}`)}</span>
                  <h2 id="bfn-input-settings-title">{t('bfn.runToolbar.configureInput')}</h2>
                </div>
                <button
                  className="bfn-drawer__close"
                  type="button"
                  aria-label={t('bfn.drawers.closeInput')}
                  onClick={closeInputSettings}
                >
                  ×
                </button>
              </header>
              {project.network.inputSources.map((source) => (
                <section className="bfn-input-card" key={source.id}>
                  <header>
                    <div>
                      <strong>{bfnNodeDisplayName(source, nodeLanguage, t)}</strong>
                    </div>
                    <span>
                      {bfnPortPrimaryLabel(source.outputPort, t, nodeLanguage)} ·{' '}
                      {bfnUnitLabel(source.outputPort.unit, t)}
                    </span>
                  </header>
                  {project.network.mode === 'static' ? (
                    <>
                      <label className="field">
                        <span>{t('bfn.inputs.mode')}</span>
                        <select
                          aria-label={t('bfn.inputs.mode')}
                          value={source.staticSpecification.type}
                          onChange={(event) => {
                            const type = event.target.value as BfnStaticInputSpecification['type'];
                            updateSource(source.id, (current) => ({
                              ...current,
                              staticSpecification:
                                type === 'fixed_value'
                                  ? {
                                      type,
                                      value:
                                        current.staticSpecification.type === 'fixed_value'
                                          ? current.staticSpecification.value
                                          : (current.staticSpecification.minimum +
                                              current.staticSpecification.maximum) /
                                            2,
                                      unit: current.outputPort.unit,
                                    }
                                  : {
                                      type,
                                      minimum:
                                        current.staticSpecification.type === 'working_range'
                                          ? current.staticSpecification.minimum
                                          : 5,
                                      maximum:
                                        current.staticSpecification.type === 'working_range'
                                          ? current.staticSpecification.maximum
                                          : 20,
                                      points: 33,
                                      unit: current.outputPort.unit,
                                    },
                            }));
                          }}
                        >
                          <option value="fixed_value">{t('bfn.inputs.fixed')}</option>
                          <option value="working_range">{t('bfn.inputs.workingRange')}</option>
                        </select>
                      </label>
                      {source.staticSpecification.type === 'fixed_value' ? (
                        <label className="field">
                          <span>{t('bfn.inputs.value')}</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={source.staticSpecification.value}
                            onChange={(event) =>
                              updateSource(source.id, (current) => ({
                                ...current,
                                staticSpecification: {
                                  type: 'fixed_value',
                                  value: Math.max(0, Number(event.target.value)),
                                  unit: current.outputPort.unit,
                                },
                              }))
                            }
                          />
                        </label>
                      ) : (
                        <div className="bfn-input-grid">
                          <label className="field">
                            <span>{t('bfn.inputs.minimum')}</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={source.staticSpecification.minimum}
                              onChange={(event) =>
                                updateSource(source.id, (current) => ({
                                  ...current,
                                  staticSpecification: {
                                    ...(current.staticSpecification as typeof source.staticSpecification),
                                    minimum: Math.max(0, Number(event.target.value)),
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>{t('bfn.inputs.maximum')}</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={source.staticSpecification.maximum}
                              onChange={(event) =>
                                updateSource(source.id, (current) => ({
                                  ...current,
                                  staticSpecification: {
                                    ...(current.staticSpecification as typeof source.staticSpecification),
                                    maximum: Math.max(0, Number(event.target.value)),
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>{t('bfn.inputs.points')}</span>
                            <input
                              type="number"
                              min="2"
                              max="101"
                              value={source.staticSpecification.points}
                              onChange={(event) =>
                                updateSource(source.id, (current) => ({
                                  ...current,
                                  staticSpecification: {
                                    ...(current.staticSpecification as typeof source.staticSpecification),
                                    points: Math.max(2, Math.min(101, Number(event.target.value))),
                                  },
                                }))
                              }
                            />
                          </label>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <label className="field">
                        <span>{t('bfn.inputs.mode')}</span>
                        <select
                          aria-label={t('bfn.inputs.mode')}
                          value={source.dynamicSpecification.type}
                          onChange={(event) => {
                            const type = event.target.value as BfnDynamicInputSpecification['type'];
                            const unit = source.outputPort.unit;
                            const specification: BfnDynamicInputSpecification =
                              type === 'constant'
                                ? { type, value: 10, unit }
                                : type === 'step'
                                  ? { type, before: 0, after: 20, atHours: 1, unit }
                                  : type === 'pulse'
                                    ? {
                                        type,
                                        baseline: 0,
                                        amplitude: 20,
                                        startHours: 1,
                                        durationHours: 2,
                                        unit,
                                      }
                                    : type === 'periodic'
                                      ? {
                                          type,
                                          baseline: 10,
                                          amplitude: 8,
                                          periodHours: 2,
                                          phaseRadians: 0,
                                          unit,
                                        }
                                      : {
                                          type,
                                          points: [
                                            { timeHours: 0, value: 0 },
                                            { timeHours: 1, value: 20 },
                                            { timeHours: 4, value: 10 },
                                          ],
                                          unit,
                                        };
                            updateSource(source.id, (current) => ({
                              ...current,
                              dynamicSpecification: specification,
                            }));
                          }}
                        >
                          <option value="constant">{t('bfn.inputs.constant')}</option>
                          <option value="step">{t('bfn.inputs.step')}</option>
                          <option value="pulse">{t('bfn.inputs.pulse')}</option>
                          <option value="periodic">{t('bfn.inputs.periodic')}</option>
                          <option value="custom_time_series">{t('bfn.inputs.custom')}</option>
                        </select>
                      </label>
                      <DynamicInputFields source={source} updateSource={updateSource} />
                    </>
                  )}
                </section>
              ))}
              {project.network.mode === 'dynamic' ? (
                <div className="bfn-input-grid">
                  <label className="field">
                    <span>{t('bfn.analysis.duration')}</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={project.analysis.durationHours}
                      onChange={(event) =>
                        updateProjectLive((current) => ({
                          ...current,
                          analysis: {
                            ...current.analysis,
                            durationHours: Math.max(0.1, Number(event.target.value)),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>{t('bfn.analysis.timeStep')}</span>
                    <input
                      type="number"
                      min="0.001"
                      step="0.01"
                      value={project.analysis.timeStepHours}
                      onChange={(event) =>
                        updateProjectLive((current) => ({
                          ...current,
                          analysis: {
                            ...current.analysis,
                            timeStepHours: Math.max(0.001, Number(event.target.value)),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              <ValidationSummary
                title={t('bfn.validation.title')}
                readyMessage={t('bfn.validation.ready')}
                issues={visibleValidationIssues.map((issue, index) => ({
                  id: `${issue.code}-${issue.subjectId}-${index}`,
                  severity: issue.severity,
                  message: validationMessage(t, issue),
                }))}
              />
              <Button
                variant="primary"
                fullWidth
                leadingIcon={<Icon name="play" size={16} />}
                onClick={runSimulation}
              >
                {result && resultFreshness === 'stale'
                  ? t('bfn.actions.rerun')
                  : t(simulationActionKey(project))}
              </Button>
            </aside>
          </div>
        ) : null}

        {view === 'design' ? (
          <BfnResultWorkspace
            project={project}
            result={result}
            runs={runs}
            runRelations={props.runRelations ?? {}}
            resultFreshness={resultFreshness}
            resultPanelOpen={resultPanelOpen}
            onTogglePanel={() => setResultPanelOpen((open) => !open)}
            onRunSimulation={runSimulation}
            onRequestClearRuns={() => setPendingDestructiveAction('clear-runs')}
            onSelectRun={(run) => {
              setResult(run);
              setResultBasisSignature(props.runSignatures?.[run.id] ?? null);
              setResultPanelOpen(true);
            }}
          />
        ) : null}

        {view === 'inverse' ? (
          <BfnCatalogInverseWorkspace
            onOpenCatalogDetail={(responseId) =>
              openCatalogDetail({ kind: 'response', responseId })
            }
          />
        ) : null}
      </div>

      {view === 'design' && localInfluenceModule && localInfluenceAvailability?.supported ? (
        <BfnLocalInfluenceDrawer
          key={localInfluenceModule.id + ':' + localInfluenceAvailability.target.staticModelId}
          project={project}
          module={localInfluenceModule}
          target={localInfluenceAvailability.target}
          onClose={closeLocalInfluence}
        />
      ) : null}
      {view === 'design' && networkInfluenceMonitor && networkInfluenceAvailability?.supported ? (
        <BfnNetworkInfluenceDrawer
          key={
            networkInfluenceMonitor.id +
            ':' +
            networkInfluenceAvailability.target.relevantEdgeIds.join('|')
          }
          project={project}
          monitor={networkInfluenceMonitor}
          target={networkInfluenceAvailability.target}
          onClose={closeNetworkInfluence}
        />
      ) : null}
      {modulePickerOpen ? (
        <BfnCatalogDiscoveryDrawer
          project={project}
          onClose={closeCatalogDrawer}
          onAddBuiltInModule={addCatalogModule}
          onInstantiateCatalogResponse={addCatalogResponse}
          onAddUserModule={addUserDefinedModule}
          onAddDesignedSender={addDesignedSender}
          onAddSignalPool={addSignalPool}
          moduleLibraryRepository={moduleLibraryRepository ?? null}
          onInstantiateSavedModule={addSavedModule}
          {...(props.moduleLibraryClock ? { moduleLibraryClock: props.moduleLibraryClock } : {})}
          {...(moduleLibraryInitialView
            ? { initialModuleLibraryView: moduleLibraryInitialView }
            : {})}
          {...(catalogInitialDetailTarget
            ? { initialDetailTarget: catalogInitialDetailTarget }
            : {})}
        />
      ) : null}
      <ConfirmDialog
        open={pendingDestructiveAction !== null}
        title={confirmation.title}
        description={confirmation.description}
        recoverability={confirmation.recoverability}
        confirmLabel={confirmation.confirmLabel}
        cancelLabel={confirmation.cancelLabel}
        onConfirm={confirmDestructiveAction}
        onCancel={() => setPendingDestructiveAction(null)}
      />
    </div>
  );
}

function ModuleSemanticClassification({ semantic }: { semantic: BfnSemanticPresentation | null }) {
  const { t } = useTranslation();
  return (
    <section
      className={'bfn-inspector-block bfn-inspector-semantic'}
      aria-labelledby={'bfn-inspector-semantic-title'}
    >
      <header>
        <strong id={'bfn-inspector-semantic-title'}>{t('bfn.semantic.classificationTitle')}</strong>
      </header>
      {!semantic || semantic.status === 'unavailable' ? (
        <p>{t('bfn.semantic.unavailable')}</p>
      ) : (
        <dl>
          <div>
            <dt>{t('bfn.semantic.functionalFamily')}</dt>
            <dd>{semantic.functionalFamilies[0]?.label ?? t('bfn.semantic.unavailable')}</dd>
          </div>
          <div>
            <dt>{t('bfn.semantic.biologicalFamily')}</dt>
            <dd>{semantic.biologicalFamilies[0]?.label ?? t('bfn.semantic.unavailable')}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function ModuleTemporalClassification({
  capability,
}: {
  capability: BfnTemporalCapability | null;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="bfn-inspector-block bfn-inspector-temporal"
      aria-labelledby="bfn-inspector-temporal-title"
      data-execution-mode={capability?.executionMode ?? 'unsupported'}
    >
      <header>
        <strong id="bfn-inspector-temporal-title">{t('bfn.temporal.title')}</strong>
      </header>
      <dl>
        <div>
          <dt>{t('bfn.temporal.handling')}</dt>
          <dd>{t(`bfn.temporal.modes.${capability?.executionMode ?? 'unsupported'}`)}</dd>
        </div>
        <div>
          <dt>{t('bfn.temporal.evidence')}</dt>
          <dd>{t(`bfn.temporal.evidenceTiers.${capability?.evidenceTier ?? 'not_recorded'}`)}</dd>
        </div>
      </dl>
      {capability?.executionMode === 'quasi_static' ? (
        <p>{t('bfn.temporal.quasiStaticBoundary')}</p>
      ) : null}
    </section>
  );
}

interface DynamicInputFieldsProps {
  source: BfnProject['network']['inputSources'][number];
  updateSource: (
    sourceId: string,
    updater: (
      source: BfnProject['network']['inputSources'][number],
    ) => BfnProject['network']['inputSources'][number],
  ) => void;
}

function DynamicInputFields({ source, updateSource }: DynamicInputFieldsProps) {
  const { t } = useTranslation();
  const specification = source.dynamicSpecification;
  const field = (label: string, key: string, value: number) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(event) =>
          updateSource(source.id, (current) => ({
            ...current,
            dynamicSpecification: {
              ...current.dynamicSpecification,
              [key]: Math.max(0, Number(event.target.value)),
            },
          }))
        }
      />
    </label>
  );
  if (specification.type === 'constant')
    return field(t('bfn.inputs.value'), 'value', specification.value);
  if (specification.type === 'step')
    return (
      <div className="bfn-input-grid">
        {field(t('bfn.inputs.before'), 'before', specification.before)}
        {field(t('bfn.inputs.after'), 'after', specification.after)}
        {field(t('bfn.inputs.atHours'), 'atHours', specification.atHours)}
      </div>
    );
  if (specification.type === 'pulse')
    return (
      <div className="bfn-input-grid">
        {field(t('bfn.inputs.baseline'), 'baseline', specification.baseline)}
        {field(t('bfn.inputs.amplitude'), 'amplitude', specification.amplitude)}
        {field(t('bfn.inputs.startHours'), 'startHours', specification.startHours)}
        {field(t('bfn.inputs.pulseDuration'), 'durationHours', specification.durationHours)}
      </div>
    );
  if (specification.type === 'periodic')
    return (
      <div className="bfn-input-grid">
        {field(t('bfn.inputs.baseline'), 'baseline', specification.baseline)}
        {field(t('bfn.inputs.amplitude'), 'amplitude', specification.amplitude)}
        {field(t('bfn.inputs.period'), 'periodHours', specification.periodHours)}
      </div>
    );
  return (
    <label className="field">
      <span>{t('bfn.inputs.series')}</span>
      <textarea
        rows={5}
        value={specification.points.map((point) => `${point.timeHours}, ${point.value}`).join('\n')}
        onChange={(event) => {
          const points = event.target.value
            .split(/\r?\n/u)
            .map((line) => line.split(',').map((part) => Number(part.trim())))
            .filter((pair) => pair.length === 2 && pair.every(Number.isFinite))
            .map(([timeHours, value]) => ({
              timeHours: Math.max(0, timeHours ?? 0),
              value: Math.max(0, value ?? 0),
            }))
            .sort((left, right) => left.timeHours - right.timeHours);
          updateSource(source.id, (current) => ({
            ...current,
            dynamicSpecification: {
              type: 'custom_time_series',
              points,
              unit: current.outputPort.unit,
            },
          }));
        }}
      />
    </label>
  );
}
