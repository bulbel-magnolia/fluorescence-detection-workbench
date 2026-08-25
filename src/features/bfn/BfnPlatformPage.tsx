import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { ValidationSummary } from '../../components/ValidationSummary';
import { BfnEditorToolbar } from './BfnEditorToolbar';
import { BfnNetworkCanvas } from './BfnNetworkCanvas';
import { BfnPropertyGrid } from './BfnPropertyGrid';
import {
  BfnProjectToolbar,
  type BfnPrimaryWorkspace,
  type BfnSaveStatus,
} from './BfnProjectToolbar';
import { BfnResultWorkspace } from './BfnResultWorkspace';
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
import { BFN_CANVAS_SIZE, findBfnModulePlacement, type BfnCanvasViewport } from './nodePlacement';
import {
  bfnModuleCatalog,
  createCatalogModule,
  createDemoBfnProject,
  type BfnCatalogModuleId,
} from './fixtures';
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
  bfnContextSectionTitle,
  bfnContextValueLabel,
  bfnDesignVariableLabel,
  bfnEntityLabel,
  bfnEvidenceTone,
  bfnModuleFlowLabel,
  bfnParameterPresentations,
  bfnPortMetaLabel,
  bfnPortPrimaryLabel,
  bfnQuantityLabel,
  bfnUnitLabel,
} from './presentation';
import { defaultBfnReverseTarget, runBfnReverseDesign } from './reverseDesign';
import { runBfnSimulation } from './simulation';
import type {
  BfnDynamicInputSpecification,
  BfnCanvasPosition,
  BfnFunctionalModule,
  BfnIdealEdgeEndpoint,
  BfnModelVariant,
  BfnParameterEstimate,
  BfnPort,
  BfnProject,
  BfnReverseDesignCandidate,
  BfnReverseTarget,
  BfnSimulationResult,
  BfnStaticInputSpecification,
  BfnValidationIssue,
  BfnValidityDomain,
} from './types';
import {
  activeModelForModule,
  addIdealConnection,
  checkIdealConnection,
  validateBfnProject,
} from './validation';
import './bfn-platform.css';

type ResultFreshness = 'current' | 'stale';
type DestructiveAction = 'reset-project' | 'clear-runs';

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

function activeOrMemorylessModel(
  project: BfnProject,
  module: BfnFunctionalModule,
): BfnModelVariant | null {
  return (
    activeModelForModule(module, project.network.mode) ??
    (project.network.mode === 'dynamic' ? activeModelForModule(module, 'static') : null)
  );
}

function formulaForModel(model: BfnModelVariant | null): string {
  if (!model) return '—';
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

function nodeLabel(project: BfnProject, nodeId: string, t: TFunction): string {
  return (
    project.network.inputSources.find((node) => node.id === nodeId)?.labelKey ??
    project.network.modules.find((node) => node.id === nodeId)?.labelKey ??
    project.network.outputMonitors.find((node) => node.id === nodeId)?.labelKey ??
    nodeId
  )
    .split('|')
    .map((key) => t(key))
    .join(' · ');
}

function endpointOptions(
  project: BfnProject,
  t: TFunction,
): {
  outputs: EndpointOption[];
  inputs: EndpointOption[];
} {
  const option = (nodeId: string, port: BfnPort, usePortMeta = false): EndpointOption => ({
    value: endpointValue({ nodeId, portId: port.id }),
    endpoint: { nodeId, portId: port.id },
    label:
      nodeLabel(project, nodeId, t) +
      ' · ' +
      (usePortMeta ? bfnPortMetaLabel(port, t) : bfnPortPrimaryLabel(port, t)),
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

function responseSparkline(candidate: BfnReverseDesignCandidate): string {
  const points = candidate.predictedResponse;
  if (points.length === 0) return '';
  const minimumInput = points[0]?.input ?? 0;
  const maximumInput = points.at(-1)?.input ?? 1;
  const span = Math.max(Number.EPSILON, maximumInput - minimumInput);
  return points
    .map((point, index) => {
      const x = 4 + ((point.input - minimumInput) / span) * 172;
      const y = 70 - Math.min(1, Math.max(0, point.output)) * 62;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
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

function configuredInputSummary(project: BfnProject, t: TFunction): string {
  const source = project.network.inputSources[0];
  if (!source) return t('bfn.runToolbar.noInput');
  const unit = bfnUnitLabel(source.outputPort.unit, t);
  const sourceLabel = t(source.labelKey);
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

export function BfnPlatformPage() {
  const { t, i18n } = useTranslation();
  const [project, setProject] = useState<BfnProject>(
    () => loadBfnProject() ?? createDemoBfnProject(),
  );
  const [view, setView] = useState<BfnPrimaryWorkspace>('design');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    project.network.modules[0]?.id ?? null,
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [sourceEndpointValue, setSourceEndpointValue] = useState('');
  const [targetEndpointValue, setTargetEndpointValue] = useState('');
  const [result, setResult] = useState<BfnSimulationResult | null>(null);
  const [resultBasisSignature, setResultBasisSignature] = useState<string | null>(null);
  const [resultPanelOpen, setResultPanelOpen] = useState(false);
  const [inputSettingsOpen, setInputSettingsOpen] = useState(false);
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<BfnSaveStatus>('saved');
  const [runs, setRuns] = useState(loadBfnRuns);
  const [reverseTarget, setReverseTarget] = useState<BfnReverseTarget>(() =>
    structuredClone(defaultBfnReverseTarget),
  );
  const [reverseCandidates, setReverseCandidates] = useState<BfnReverseDesignCandidate[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [pendingDestructiveAction, setPendingDestructiveAction] =
    useState<DestructiveAction | null>(null);
  const [history, setHistory] = useState<BfnEditorHistory>(createBfnEditorHistory);
  const importRef = useRef<HTMLInputElement>(null);
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
    setSaveStatus('saving');
    autosavePendingRef.current = true;
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      try {
        saveBfnProject(project);
        autosavePendingRef.current = false;
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 320);

    return () => {
      if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [project]);

  useEffect(
    () => () => {
      if (!autosavePendingRef.current) return;
      try {
        saveBfnProject(latestProjectRef.current);
        autosavePendingRef.current = false;
      } catch {
        // The visible error state is handled while mounted; unmount must remain side-effect safe.
      }
    },
    [],
  );

  const validationIssues = useMemo(() => validateBfnProject(project), [project]);
  const currentComputationSignature = useMemo(
    () => createBfnComputationSignature(project),
    [project],
  );
  const resultFreshness: ResultFreshness =
    result && resultBasisSignature !== currentComputationSignature ? 'stale' : 'current';
  const options = useMemo(() => endpointOptions(project, t), [project, t, i18n.language]);
  const sourceEndpoint = parseEndpoint(sourceEndpointValue);
  const targetEndpoint = parseEndpoint(targetEndpointValue);
  const draftIssues = useMemo(
    () =>
      sourceEndpoint && targetEndpoint
        ? checkIdealConnection(project, sourceEndpoint, targetEndpoint)
        : [],
    [project, sourceEndpointValue, targetEndpointValue],
  );
  const selectedModule =
    project.network.modules.find((module) => module.id === selectedNodeId) ?? null;
  const selectedSource =
    project.network.inputSources.find((source) => source.id === selectedNodeId) ?? null;
  const selectedMonitor =
    project.network.outputMonitors.find((monitor) => monitor.id === selectedNodeId) ?? null;
  const selectedEdge = project.network.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedEdgeSourcePort = selectedEdge
    ? portForEndpoint(project, selectedEdge.source)
    : null;
  const selectedEdgeTargetPort = selectedEdge
    ? portForEndpoint(project, selectedEdge.target)
    : null;
  const selectedModuleModel = selectedModule
    ? activeOrMemorylessModel(project, selectedModule)
    : null;
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
    ? bfnParameterPresentations(selectedModule, selectedModuleModel, t)
    : [];
  const selectedDatasets = selectedModuleModel
    ? project.registry.datasets.filter((dataset) =>
        selectedModuleModel.sourceDatasetIds.includes(dataset.id),
      )
    : [];
  const inspectorSubtitle = selectedModule
    ? bfnModuleFlowLabel(selectedModule, t)
    : selectedSource
      ? bfnPortMetaLabel(selectedSource.outputPort, t)
      : selectedMonitor
        ? bfnPortMetaLabel(selectedMonitor.inputPort, t)
        : selectedEdge
          ? `${nodeLabel(project, selectedEdge.source.nodeId, t)} → ${nodeLabel(
              project,
              selectedEdge.target.nodeId,
              t,
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
      setResult(next);
      setResultBasisSignature(createBfnComputationSignature(current));
      setResultPanelOpen(true);
      setInputSettingsOpen(false);
      setRuns(saveBfnRun(next));
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
    setNotice(t('bfn.notices.moduleAdded'));
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
    anchor.download = `${project.id}.bfn-ir.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importProject = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      const imported = parseBfnProject(await file.text());
      projectRef.current = imported;
      setProject(imported);
      setResult(null);
      setResultBasisSignature(null);
      setResultPanelOpen(false);
      selectNode(imported.network.modules[0]?.id ?? null);
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
    localStorage.setItem(BFN_PROJECT_STORAGE_KEY, JSON.stringify(next));
    clearBfnRuns();
    setRuns([]);
    setResult(null);
    setResultBasisSignature(null);
    setResultPanelOpen(false);
    selectNode(next.network.modules[0]?.id ?? null);
    clearEditorHistory();
    setReverseCandidates([]);
    setNotice(t('bfn.notices.reset'));
    setErrorNotice(null);
  };

  const runReverse = (): void => {
    const candidates = runBfnReverseDesign(projectRef.current, reverseTarget);
    setReverseCandidates(candidates);
    setNotice(t('bfn.notices.reverseCompleted', { count: candidates.length }));
  };

  const commitClearRuns = (): void => {
    clearBfnRuns();
    setRuns([]);
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
        pendingDestructiveAction !== null ||
        isBfnEditorOverlayOpen();
      if (event.key === 'Escape') {
        if (pendingDestructiveAction !== null) return;
        if (inputSettingsOpen) {
          event.preventDefault();
          closeInputSettings();
          return;
        }
        if (modulePickerOpen) {
          event.preventDefault();
          setModulePickerOpen(false);
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
            projectName={t(project.labelKey)}
            networkName={t(project.network.labelKey)}
            workspace={view}
            saveStatus={saveStatus}
            onWorkspaceChange={setView}
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
            onChange={(event) => void importProject(event.target.files?.[0])}
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
                <strong>{configuredInputSummary(project, t)}</strong>
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
                      <strong>{t(source.labelKey)}</strong>
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
                      <strong>{t(module.labelKey)}</strong>
                      <small>{bfnModuleFlowLabel(module, t)}</small>
                    </button>
                  ))}
                  <button
                    className="bfn-catalog-shortcut"
                    type="button"
                    onClick={() => setModulePickerOpen(true)}
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
                      <strong>{t(monitor.labelKey)}</strong>
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
                  {sourceEndpoint && targetEndpoint ? (
                    <div
                      className="bfn-connection-check"
                      data-valid={!draftIssues.some((issue) => issue.severity === 'error')}
                    >
                      {draftIssues.length
                        ? validationMessage(t, draftIssues[0]!)
                        : t('bfn.connections.compatible')}
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
                      ? t(selectedModule.labelKey)
                      : selectedSource
                        ? t(selectedSource.labelKey)
                        : selectedMonitor
                          ? t(selectedMonitor.labelKey)
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
                      <p>{t(selectedModule.descriptionKey)}</p>
                    </section>
                    <section className="bfn-inspector-block">
                      <header>
                        <strong>{t('bfn.inspector.inputsAndOutputs')}</strong>
                      </header>
                      <div className="bfn-signal-flow">
                        <div className="bfn-signal-flow__group" data-direction="input">
                          <span>{t('bfn.nodeKinds.input')}</span>
                          {selectedModule.inputPorts.map((port) => (
                            <article key={port.id}>
                              <strong>{bfnPortPrimaryLabel(port, t)}</strong>
                              <small>{bfnUnitLabel(port.unit, t)}</small>
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
                              <strong>{bfnPortPrimaryLabel(port, t)}</strong>
                              <small>{bfnUnitLabel(port.unit, t)}</small>
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
                        ) : null}
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
                            value: bfnPortPrimaryLabel(selectedSource.outputPort, t),
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
                            value: bfnPortPrimaryLabel(selectedMonitor.inputPort, t),
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
                  </>
                ) : selectedEdge ? (
                  <>
                    <div className="bfn-edge-signal-flow">
                      <div>
                        <span>{t('bfn.connections.source')}</span>
                        <strong>{nodeLabel(project, selectedEdge.source.nodeId, t)}</strong>
                        <small>
                          {selectedEdgeSourcePort
                            ? bfnPortPrimaryLabel(selectedEdgeSourcePort, t)
                            : '—'}
                        </small>
                      </div>
                      <span aria-hidden="true">↓</span>
                      <div>
                        <span>{t('bfn.connections.target')}</span>
                        <strong>{nodeLabel(project, selectedEdge.target.nodeId, t)}</strong>
                        <small>
                          {selectedEdgeTargetPort
                            ? t('bfn.inspector.signalInput', {
                                signal: bfnPortPrimaryLabel(selectedEdgeTargetPort, t),
                              })
                            : '—'}
                        </small>
                      </div>
                    </div>
                    <details className="bfn-inspector-details">
                      <summary>{t('bfn.inspector.advancedInformation')}</summary>
                      <p className="bfn-edge-explanation">
                        {t('bfn.inspector.edgeText', {
                          signal: selectedEdgeSourcePort
                            ? bfnPortPrimaryLabel(selectedEdgeSourcePort, t)
                            : t('bfn.parameters.outputSignal'),
                          source: nodeLabel(project, selectedEdge.source.nodeId, t),
                          target: nodeLabel(project, selectedEdge.target.nodeId, t),
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
                      <strong>{t(source.labelKey)}</strong>
                    </div>
                    <span>
                      {bfnPortPrimaryLabel(source.outputPort, t)} ·{' '}
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
                issues={validationIssues.slice(0, 5).map((issue, index) => ({
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
            resultFreshness={resultFreshness}
            resultPanelOpen={resultPanelOpen}
            onTogglePanel={() => setResultPanelOpen((open) => !open)}
            onRunSimulation={runSimulation}
            onRequestClearRuns={() => setPendingDestructiveAction('clear-runs')}
            onSelectRun={(run) => {
              setResult(run);
              setResultBasisSignature(null);
              setResultPanelOpen(true);
            }}
          />
        ) : null}

        {view === 'inverse' ? (
          <div className="bfn-inverse-workspace">
            <aside className="bfn-inverse-brief">
              <header className="bfn-section-heading">
                <div>
                  <h2>{t('bfn.reverse.title')}</h2>
                </div>
              </header>
              <p className="bfn-inverse-lead">{t('bfn.reverse.description')}</p>
              <div className="bfn-target-grid">
                <NumericTargetField
                  label={t('bfn.reverse.inputMinimum')}
                  value={reverseTarget.inputMinimum}
                  onChange={(value) =>
                    setReverseTarget((current) => ({ ...current, inputMinimum: value }))
                  }
                />
                <NumericTargetField
                  label={t('bfn.reverse.inputMaximum')}
                  value={reverseTarget.inputMaximum}
                  onChange={(value) =>
                    setReverseTarget((current) => ({ ...current, inputMaximum: value }))
                  }
                />
                <NumericTargetField
                  label={t('bfn.reverse.threshold')}
                  value={reverseTarget.thresholdTarget}
                  onChange={(value) =>
                    setReverseTarget((current) => ({ ...current, thresholdTarget: value }))
                  }
                />
                <NumericTargetField
                  label={t('bfn.reverse.basalMaximum')}
                  value={reverseTarget.basalMaximum}
                  step={0.01}
                  onChange={(value) =>
                    setReverseTarget((current) => ({ ...current, basalMaximum: value }))
                  }
                />
                <NumericTargetField
                  label={t('bfn.reverse.maximumMinimum')}
                  value={reverseTarget.maximumMinimum}
                  step={0.01}
                  onChange={(value) =>
                    setReverseTarget((current) => ({ ...current, maximumMinimum: value }))
                  }
                />
                <NumericTargetField
                  label={t('bfn.reverse.responseTime')}
                  value={reverseTarget.responseTimeMaximumHours}
                  step={0.1}
                  onChange={(value) =>
                    setReverseTarget((current) => ({ ...current, responseTimeMaximumHours: value }))
                  }
                />
                <NumericTargetField
                  label={t('bfn.reverse.burdenMaximum')}
                  value={reverseTarget.burdenMaximum}
                  step={0.05}
                  onChange={(value) =>
                    setReverseTarget((current) => ({ ...current, burdenMaximum: value }))
                  }
                />
                <NumericTargetField
                  label={t('bfn.reverse.noiseMaximum')}
                  value={reverseTarget.noiseMaximum}
                  step={0.05}
                  onChange={(value) =>
                    setReverseTarget((current) => ({ ...current, noiseMaximum: value }))
                  }
                />
              </div>
              <label className="bfn-priority">
                <span>
                  <strong>{t('bfn.reverse.stabilityPriority')}</strong>
                  <output>{reverseTarget.stabilityPriority.toFixed(2)}</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={reverseTarget.stabilityPriority}
                  onChange={(event) =>
                    setReverseTarget((current) => ({
                      ...current,
                      stabilityPriority: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <Button
                variant="primary"
                fullWidth
                leadingIcon={<Icon name="network" size={16} />}
                onClick={runReverse}
              >
                {t('bfn.reverse.search')}
              </Button>
            </aside>
            <main className="bfn-candidate-results">
              <header className="bfn-section-heading">
                <div>
                  <h2>{t('bfn.reverse.candidates')}</h2>
                </div>
                <span className="bfn-candidate-count">{reverseCandidates.length}</span>
              </header>
              {reverseCandidates.length ? (
                <div className="bfn-candidate-list">
                  {reverseCandidates.map((candidate, index) => (
                    <article className="bfn-candidate" key={candidate.id}>
                      <div className="bfn-candidate__rank">
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <small>
                          {index === 0
                            ? t('bfn.reverse.leadingCandidate')
                            : t('bfn.reverse.alternativeCandidate')}
                        </small>
                      </div>
                      <div className="bfn-candidate__identity">
                        <span
                          className="bfn-evidence-chip"
                          data-evidence-tone={bfnEvidenceTone(candidate.evidenceGrade)}
                        >
                          {t(`bfn.evidence.${candidate.evidenceGrade}`)}
                        </span>
                        <h3>{t(candidate.labelKey)}</h3>
                        <p className="bfn-candidate__parts">
                          {bfnDesignVariableLabel(candidate.designVariables.promoter, t)} ·{' '}
                          {bfnDesignVariableLabel(candidate.designVariables.rbs, t)}
                        </p>
                        <dl>
                          <div>
                            <dt>{t('bfn.reverse.copyNumber')}</dt>
                            <dd>
                              {bfnDesignVariableLabel(candidate.designVariables.copyNumber, t)}
                            </dd>
                          </div>
                          <div>
                            <dt>{t('bfn.reverse.degradationTag')}</dt>
                            <dd>
                              {bfnDesignVariableLabel(candidate.designVariables.degradationTag, t)}
                            </dd>
                          </div>
                          <div>
                            <dt>{t('bfn.reverse.receptorLevel')}</dt>
                            <dd>
                              {bfnDesignVariableLabel(candidate.designVariables.receptorLevel, t)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <svg
                        className="bfn-candidate__curve"
                        viewBox="0 0 180 76"
                        role="img"
                        aria-label={t('bfn.reverse.predictedResponse')}
                      >
                        <line x1="4" x2="176" y1="70" y2="70" />
                        <path d={responseSparkline(candidate)} />
                      </svg>
                      <div className="bfn-candidate__scores">
                        <ScoreBar
                          label={t('bfn.reverse.functionMatch')}
                          value={candidate.scores.functionMatch}
                        />
                        <ScoreBar label={t('bfn.reverse.burden')} value={candidate.scores.burden} />
                        <ScoreBar label={t('bfn.reverse.noise')} value={candidate.scores.noise} />
                        <ScoreBar
                          label={t('bfn.reverse.geneticRisk')}
                          value={candidate.scores.geneticRisk}
                        />
                      </div>
                      <details className="bfn-candidate__details">
                        <summary>{t('bfn.reverse.detailedScore')}</summary>
                        <div className="bfn-candidate__total">
                          <span>{t('bfn.reverse.compositeLoss')}</span>
                          <strong>{candidate.scores.total.toFixed(3)}</strong>
                          <small>{t('bfn.reverse.lowerIsBetter')}</small>
                        </div>
                      </details>
                      <footer>
                        <Icon name="flask" size={15} />
                        <span>{t(candidate.recommendedValidationKey)}</span>
                      </footer>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={t('bfn.reverse.empty')}
                  description={t('bfn.reverse.emptyHint')}
                  visual={<span>{t('bfn.reverse.emptyVisual')}</span>}
                />
              )}
            </main>
          </div>
        ) : null}
      </div>

      {view === 'design' && modulePickerOpen ? (
        <div className="bfn-drawer-layer">
          <button
            className="bfn-drawer-scrim"
            type="button"
            aria-label={t('bfn.drawers.closeModulePicker')}
            onClick={() => setModulePickerOpen(false)}
          />
          <aside
            className="bfn-drawer bfn-module-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bfn-module-picker-title"
          >
            <header className="bfn-drawer__header">
              <div>
                <span>{t(project.network.labelKey)}</span>
                <h2 id="bfn-module-picker-title">{t('bfn.registry.addTitle')}</h2>
              </div>
              <button
                className="bfn-drawer__close"
                type="button"
                aria-label={t('bfn.drawers.closeModulePicker')}
                onClick={() => setModulePickerOpen(false)}
              >
                ×
              </button>
            </header>
            <p className="bfn-module-picker__lead">{t('bfn.registry.addHint')}</p>
            <div className="bfn-module-catalog">
              {bfnModuleCatalog.map((entry) => {
                const previewModule = createCatalogModule(entry.id, 'catalog-preview');
                const previewModel = activeOrMemorylessModel(project, previewModule);
                const relatedDatasets = previewModel
                  ? project.registry.datasets.filter((dataset) =>
                      previewModel.sourceDatasetIds.includes(dataset.id),
                    )
                  : [];
                return (
                  <article className="bfn-module-row" key={entry.id}>
                    <div className="bfn-module-row__identity">
                      <h3>{t(entry.labelKey)}</h3>
                      <p className="bfn-module-catalog__flow">
                        {bfnModuleFlowLabel(previewModule, t)}
                      </p>
                      <p>{t(entry.descriptionKey)}</p>
                    </div>
                    <dl>
                      <div>
                        <dt>{t('bfn.registry.modelBasis')}</dt>
                        <dd>
                          <span
                            className="bfn-evidence-label"
                            data-evidence-tone={
                              previewModel ? bfnEvidenceTone(previewModel.evidenceGrade) : 'warning'
                            }
                          >
                            {previewModel
                              ? t(`bfn.evidence.${previewModel.evidenceGrade}`)
                              : t(entry.evidenceKey)}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>{t('bfn.registry.linkedData')}</dt>
                        <dd>
                          {relatedDatasets.length
                            ? relatedDatasets.map((dataset) => t(dataset.labelKey)).join(' · ')
                            : t('bfn.registry.notLinkedDataset')}
                        </dd>
                      </div>
                    </dl>
                    <Button
                      size="sm"
                      variant="secondary"
                      leadingIcon={<Icon name="plus" size={14} />}
                      onClick={() => addCatalogModule(entry.id)}
                    >
                      {t('bfn.registry.addToCanvas')}
                    </Button>
                  </article>
                );
              })}
            </div>
            <footer className="bfn-module-picker__footer">
              <Icon name="network" size={15} />
              <span>{t('bfn.registry.staysInNetwork')}</span>
            </footer>
          </aside>
        </div>
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

function NumericTargetField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value)))}
      />
    </label>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <i>
        <b style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
      </i>
      <strong>{value.toFixed(2)}</strong>
    </div>
  );
}
