import { createElement, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { TelemetryStrip } from '../components/TelemetryStrip';
import {
  connectModelNodes,
  createModelNode,
  createTemplate,
  diagnoseNetworkModel,
  getModelConnectionIssue,
  MODELING_SIMULATION_DEFAULTS,
  migrateNetworkModel,
  sanitizeCatalogReferences,
  simulateNetwork,
  validateNetworkModel,
} from '../features/modeling/modelingCore';
import {
  clearModelingRuns,
  loadModelingProject,
  loadModelingRuns,
  saveModelingProject,
  saveModelingRun,
} from '../features/modeling/modelingRepository';
import {
  createModelNodeNameCounters,
  localizedRunName,
  localizeSystemModel,
  nextModelNodeName,
} from '../features/modeling/modelingLocalization';
import {
  appendActivity,
  createActivity,
  type ModelingActivity,
  type ModelingActivityType,
} from '../features/modeling/activity';
import { ModelingActivityPanel } from '../features/modeling/ModelingActivityPanel';
import { DetectionModelingPicker } from '../features/modeling/DetectionModelingPicker';
import type {
  DetectionModelingReference,
  NetworkValidationModelingReference,
  ReverseTargetModelingReference,
} from '../features/modeling/detectionModeling';
import { NetworkCanvas } from '../features/modeling/NetworkCanvas';
import { PartTransferGhost, type PartTransfer } from '../features/modeling/PartTransferGhost';
import { ReleaseCatalogDialog } from '../features/modeling/catalog/ReleaseCatalogDialog';
import { detachCatalogReference } from '../features/modeling/catalog/catalogReference';
import {
  applyReleaseResponseToNetwork,
  attachReleaseComponentCitation,
} from '../features/modeling/catalog/releaseCatalogApplication';
import {
  getReleaseResponseFunctionTitle,
  loadReleaseCatalogPresentation,
  type ReleaseCatalogPresentation,
  type ReleaseComponentView,
  type ReleaseResponseVariantView,
} from '../features/modeling/catalog/releaseCatalogPresentation';
import { applyPart, compatibleParts, type ModelingPart } from '../features/modeling/partLibrary';
import { SimulationChart } from '../features/modeling/SimulationChart';
import {
  applyReverseDesignCandidate,
  inspectReverseDesign,
  solveReverseDesign,
  type ReverseDesignCandidate,
  type ReverseDesignStatus,
} from '../features/modeling/reverseDesign';
import { useRunNarrative } from '../features/modeling/useRunNarrative';
import type {
  ModelConnectionIssue,
  ModelConnectionRequest,
  ModelInputDirection,
  ModelNode,
  ModelNodeKind,
  ModelTemplateId,
  ModelingRun,
  NetworkModel,
  ReceiverResponseBinding,
  SimulationResult,
  TemplateLabels,
} from '../features/modeling/types';
import { useAppStore } from '../store/appStore';
import { BfnPlatformPage } from '../features/bfn/BfnPlatformPage';

const templateIds: ModelTemplateId[] = ['licorice-quality', 'signal-gate', 'feedback-loop'];
const nodeKinds: ModelNodeKind[] = ['input', 'processing', 'output'];
const historyLimit = 60;

export function ModelingPage() {
  return <BfnPlatformPage />;
}

function findOpenNodePosition(nodes: readonly ModelNode[]): { x: number; y: number } {
  const xSlots = [90, 270, 450, 630, 810];
  const ySlots = [55, 165, 275, 385, 495];
  for (const y of ySlots) {
    for (const x of xSlots) {
      const occupied = nodes.some(
        (node) => Math.abs(node.x - x) < 155 && Math.abs(node.y - y) < 105,
      );
      if (!occupied) return { x, y };
    }
  }
  const overflowIndex = nodes.length - xSlots.length * ySlots.length;
  return {
    x: 90 + (Math.max(0, overflowIndex) % xSlots.length) * 180,
    y: 605 + Math.floor(Math.max(0, overflowIndex) / xSlots.length) * 110,
  };
}

function localizeBoundResponseNodes(
  model: NetworkModel,
  presentation: ReleaseCatalogPresentation | null,
  language: 'zh-CN' | 'en-US',
): NetworkModel {
  if (!presentation) return model;
  let changed = false;
  const nodes = model.nodes.map((node) => {
    const binding = node.receiverResponseBinding;
    if (!binding) return node;
    const component = presentation.components.find(
      (candidate) => candidate.id === binding.componentId,
    );
    const response = component?.responseVariants.find(
      (candidate) => candidate.id === binding.receiverResponseId,
    );
    if (!component || !response) return node;
    const name = getReleaseResponseFunctionTitle(component, response, language);
    if (name === node.name) return node;
    changed = true;
    return { ...node, name };
  });
  return changed ? { ...model, nodes } : model;
}

interface ModelUpdateOptions {
  history?: boolean;
  kind?: 'structure' | 'parameter';
  activity?: {
    type: ModelingActivityType;
    subjectId: string;
    label?: string;
    key?: string;
    value?: string | number | boolean;
  } | null;
}

interface BoundResponseInspectorProps {
  binding: ReceiverResponseBinding;
}

function templateLabels(t: TFunction, templateId: ModelTemplateId): TemplateLabels {
  return {
    modelName: t(`modeling.templates.${templateId}.name`),
    description: t(`modeling.templates.${templateId}.description`),
    nodes: {
      sensorA: t(`modeling.templates.${templateId}.sensorA`),
      sensorB: t(`modeling.templates.${templateId}.sensorB`),
      sensorC: t(`modeling.templates.${templateId}.sensorC`),
      integration: t('modeling.defaultNodeName.integration'),
      gate: t('modeling.defaultNodeName.gate'),
      memory: t('modeling.defaultNodeName.memory'),
      response: t('modeling.defaultNodeName.response'),
      reporter: t('modeling.defaultNodeName.reporter'),
    },
  };
}

function downloadJson(model: NetworkModel): void {
  const blob = new Blob([JSON.stringify(model, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${model.name.replace(/[^\p{L}\p{N}-]+/gu, '-') || 'network-model'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function simulationNoticeKey(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'MODEL_PARAMETERS_NOT_RUNNABLE') {
      return 'modeling.parametersNotRunnable';
    }
    if (error.message === 'MODEL_PARAMETER_CONTEXT_CONFLICT') {
      return 'modeling.connectionErrors.parameterContextConflict';
    }
  }
  return 'modeling.runFailed';
}

const connectionIssueKeys: Record<ModelConnectionIssue, string> = {
  'missing-source': 'modeling.connectionErrors.missingSource',
  'missing-target': 'modeling.connectionErrors.missingTarget',
  'source-has-no-output': 'modeling.connectionErrors.sourceHasNoOutput',
  'target-has-no-input': 'modeling.connectionErrors.targetHasNoInput',
  'missing-source-port': 'modeling.connectionErrors.missingSourcePort',
  'missing-target-port': 'modeling.connectionErrors.missingTargetPort',
  'source-port-not-output': 'modeling.connectionErrors.sourcePortNotOutput',
  'target-port-not-input': 'modeling.connectionErrors.targetPortNotInput',
  'source-port-direction': 'modeling.connectionErrors.sourcePortDirection',
  'target-port-direction': 'modeling.connectionErrors.targetPortDirection',
  'signal-mismatch': 'modeling.connectionErrors.signalMismatch',
  'no-compatible-port': 'modeling.connectionErrors.noCompatiblePort',
  'ambiguous-compatible-port': 'modeling.connectionErrors.ambiguousCompatiblePort',
  'self-connection': 'modeling.connectionErrors.selfConnection',
  'duplicate-connection': 'modeling.connectionErrors.duplicateConnection',
  'bound-response-input-occupied': 'modeling.connectionErrors.boundResponseInputOccupied',
  'bound-response-requires-concentration-input':
    'modeling.connectionErrors.boundResponseRequiresConcentrationInput',
  'parameter-context-conflict': 'modeling.connectionErrors.parameterContextConflict',
};

export function LegacyModelingPage() {
  const { t, i18n } = useTranslation();
  const history = useAppStore((state) => state.history);
  const newTemplate = (templateId: ModelTemplateId) =>
    createTemplate(templateId, templateLabels(t, templateId));
  const [model, setModel] = useState<NetworkModel>(
    () => loadModelingProject() ?? newTemplate('licorice-quality'),
  );
  const [result, setResult] = useState<ReturnType<typeof simulateNetwork> | null>(null);
  const [resultModelSnapshot, setResultModelSnapshot] = useState<NetworkModel | null>(null);
  const [runs, setRuns] = useState(loadModelingRuns);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(model.nodes[0]?.id ?? null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [detectionPickerMode, setDetectionPickerMode] = useState<
    DetectionModelingReference['mode'] | null
  >(null);
  const [reverseTargetReference, setReverseTargetReference] =
    useState<ReverseTargetModelingReference | null>(null);
  const [validationReference, setValidationReference] =
    useState<NetworkValidationModelingReference | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [activity, setActivity] = useState<ModelingActivity[]>([]);
  const [inspectorTab, setInspectorTab] = useState<'inspector' | 'provenance'>('inspector');
  const [partDialogOpen, setPartDialogOpen] = useState(false);
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [releaseCatalogPresentation] = useState<ReleaseCatalogPresentation | null>(() => {
    try {
      return loadReleaseCatalogPresentation();
    } catch {
      return null;
    }
  });
  const [partTransfer, setPartTransfer] = useState<PartTransfer | null>(null);
  const [comparisonA, setComparisonA] = useState<SimulationResult | null>(null);
  const [comparisonB, setComparisonB] = useState<SimulationResult | null>(null);
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState(0.7);
  const [reverseCandidates, setReverseCandidates] = useState<ReverseDesignCandidate[]>([]);
  const [reverseStatus, setReverseStatus] = useState<ReverseDesignStatus>('idle');
  const [importSummary, setImportSummary] = useState<{
    nodeCount: number;
    edgeCount: number;
    migrated: boolean;
    droppedCatalogReferences: number;
  } | null>(null);
  const [importHighlightNodeIds, setImportHighlightNodeIds] = useState<readonly string[]>([]);
  const importInput = useRef<HTMLInputElement>(null);
  const catalogTriggerRef = useRef<HTMLButtonElement>(null);
  const modelHistory = useRef<{ past: NetworkModel[]; future: NetworkModel[] }>({
    past: [],
    future: [],
  });
  const nodeNameCounters = useRef(createModelNodeNameCounters(model, t));
  const editKind = useRef<'structure' | 'parameter'>('structure');
  const narrative = useRunNarrative(model);
  const selectedNode = useMemo(
    () => model.nodes.find((modelNode) => modelNode.id === selectedNodeId) ?? null,
    [model.nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => model.edges.find((modelEdge) => modelEdge.id === selectedEdgeId) ?? null,
    [model.edges, selectedEdgeId],
  );
  const activeValidationReference =
    validationReference?.networkId === model.id ? validationReference : null;
  const nodeKindLabels = useMemo(
    () =>
      Object.fromEntries(
        nodeKinds.map((kind) => [kind, t(`modeling.nodeKinds.${kind}`)]),
      ) as Record<ModelNodeKind, string>,
    [i18n.language, t],
  );

  useEffect(() => {
    saveModelingProject(model);
  }, [model]);

  useEffect(() => {
    const language = i18n.language.startsWith('en') ? 'en-US' : 'zh-CN';
    setModel((current) =>
      localizeBoundResponseNodes(
        localizeSystemModel(current, t),
        releaseCatalogPresentation,
        language,
      ),
    );
  }, [i18n.resolvedLanguage, i18n.language, releaseCatalogPresentation, t]);

  useEffect(() => {
    if (!partTransfer) return undefined;
    const timer = window.setTimeout(() => setPartTransfer(null), 650);
    return () => window.clearTimeout(timer);
  }, [partTransfer]);

  useEffect(() => {
    if (importHighlightNodeIds.length === 0) return undefined;
    const timer = window.setTimeout(() => setImportHighlightNodeIds([]), 2400);
    return () => window.clearTimeout(timer);
  }, [importHighlightNodeIds]);

  useEffect(() => {
    if (narrative.status === 'complete' && noticeKey === 'modeling.runNarrating') {
      setNoticeKey('modeling.runCompleted');
    }
  }, [narrative.status, noticeKey]);

  const recordActivity = (type: ModelingActivityType, detail: ModelingActivity['detail']): void => {
    setActivity((events) => appendActivity(events, createActivity(type, detail)));
  };

  const updateModel = (
    updater: (current: NetworkModel) => NetworkModel,
    options: ModelUpdateOptions = {},
  ): void => {
    setModel((current) => {
      if (options.history !== false) {
        modelHistory.current.past = [...modelHistory.current.past, structuredClone(current)].slice(
          -historyLimit,
        );
        modelHistory.current.future = [];
      }
      return {
        ...updater(current),
        updatedAt: new Date().toISOString(),
      };
    });
    editKind.current = options.kind ?? 'parameter';
    if (options.activity) {
      const detail: ModelingActivity['detail'] = {
        subjectId: options.activity.subjectId,
        ...(options.activity.label === undefined ? {} : { label: options.activity.label }),
        ...(options.activity.key === undefined ? {} : { key: options.activity.key }),
        ...(options.activity.value === undefined ? {} : { value: options.activity.value }),
      };
      recordActivity(options.activity.type, detail);
    } else if (options.activity !== null) {
      if (selectedNode) {
        recordActivity('parameter.changed', {
          subjectId: selectedNode.id,
          label: selectedNode.name,
        });
      } else if (selectedEdge) {
        recordActivity('edge.changed', { subjectId: selectedEdge.id });
      }
    }
    setResult(null);
    setResultModelSnapshot(null);
    setReverseCandidates([]);
    setReverseStatus('idle');
    setNoticeKey(null);
  };

  const undoModel = (): void => {
    const previous = modelHistory.current.past.at(-1);
    if (!previous) return;
    modelHistory.current.past = modelHistory.current.past.slice(0, -1);
    modelHistory.current.future = [structuredClone(model), ...modelHistory.current.future].slice(
      0,
      historyLimit,
    );
    setModel(previous);
    nodeNameCounters.current = createModelNodeNameCounters(previous, t);
    setResult(null);
    setResultModelSnapshot(null);
    setReverseCandidates([]);
    editKind.current = 'structure';
    recordActivity('history.undo', { subjectId: previous.id, label: previous.name });
  };

  const redoModel = (): void => {
    const next = modelHistory.current.future[0];
    if (!next) return;
    modelHistory.current.future = modelHistory.current.future.slice(1);
    modelHistory.current.past = [...modelHistory.current.past, structuredClone(model)].slice(
      -historyLimit,
    );
    setModel(next);
    nodeNameCounters.current = createModelNodeNameCounters(next, t);
    setResult(null);
    setResultModelSnapshot(null);
    setReverseCandidates([]);
    editKind.current = 'structure';
    recordActivity('history.redo', { subjectId: next.id, label: next.name });
  };

  const chooseTemplate = (templateId: ModelTemplateId): void => {
    if (!window.confirm(t('modeling.confirmTemplate'))) return;
    const next = newTemplate(templateId);
    modelHistory.current.past = [...modelHistory.current.past, structuredClone(model)].slice(
      -historyLimit,
    );
    modelHistory.current.future = [];
    setModel(next);
    nodeNameCounters.current = createModelNodeNameCounters(next, t);
    setSelectedNodeId(next.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setResult(null);
    setResultModelSnapshot(null);
    setReverseCandidates([]);
    setReverseStatus('idle');
    setReverseTargetReference(null);
    setValidationReference(null);
    setImportSummary(null);
    setImportHighlightNodeIds([]);
    setNoticeKey(null);
    editKind.current = 'structure';
    recordActivity('template.loaded', { subjectId: next.id, label: next.name });
  };

  const addNode = (kind: ModelNodeKind): void => {
    const name = nextModelNodeName(kind, t, nodeNameCounters.current);
    const initialNode = createModelNode(kind, name, model.nodes.length);
    const position = findOpenNodePosition(model.nodes);
    const createdNode: ModelNode = { ...initialNode, ...position };
    const upstreamSignal = selectedNode?.outputPorts[0]?.signalId;
    const boundResponse = selectedNode?.receiverResponseBinding;
    const boundInputSignal = boundResponse?.inputSignalId;
    const boundInputBaseline =
      boundResponse?.kind === 'four_parameter_logistic'
        ? boundResponse.originalParameters.ec50
        : boundResponse?.kind === 'hill_equation_n_fixed_1'
          ? boundResponse.originalParameters.ec50
          : undefined;
    const modelNode: ModelNode =
      kind === 'input' && boundInputSignal && createdNode.outputPorts[0]
        ? {
            ...createdNode,
            parameters: {
              ...createdNode.parameters,
              ...(boundInputBaseline === undefined
                ? {}
                : { baseline: Math.max(0, boundInputBaseline) }),
            },
            outputPorts: createdNode.outputPorts.map((port, index) =>
              index === 0 ? { ...port, signalId: boundInputSignal } : port,
            ),
            ...(selectedNode && boundResponse
              ? {
                  concentrationInputBinding: {
                    targetNodeId: selectedNode.id,
                    receiverResponseId: boundResponse.receiverResponseId,
                    parameterContextId: boundResponse.parameterContextId,
                    inputSignalId: boundResponse.inputSignalId,
                    inputUnit: boundResponse.inputUnit,
                    workingRange: { ...boundResponse.workingRange },
                  },
                }
              : {}),
          }
        : upstreamSignal && createdNode.inputPorts[0]
          ? {
              ...createdNode,
              inputPorts: createdNode.inputPorts.map((port, index) =>
                index === 0 ? { ...port, signalId: upstreamSignal } : port,
              ),
            }
          : createdNode;
    updateModel((current) => ({ ...current, nodes: [...current.nodes, modelNode] }), {
      kind: 'structure',
      activity: { type: 'node.added', subjectId: modelNode.id, label: modelNode.name },
    });
    setSelectedNodeId(modelNode.id);
    setSelectedEdgeId(null);
    setNoticeKey(
      kind === 'input' && boundInputSignal
        ? 'modeling.releaseCatalog.boundInputAdded'
        : 'modeling.nodeAddedHint',
    );
  };

  const removeSelectedNode = (): void => {
    if (!selectedNode || !canDeleteSelectedNode) return;
    const buildWithoutSelectedNode = (
      current: NetworkModel,
      replacementOutputNodeId = current.outputNodeId,
    ): NetworkModel => {
      const nodes = current.nodes
        .filter((modelNode) => modelNode.id !== selectedNode.id)
        .map((modelNode) => {
          if (modelNode.concentrationInputBinding?.targetNodeId !== selectedNode.id) {
            return modelNode;
          }
          const withoutBinding: ModelNode = { ...modelNode };
          delete withoutBinding.concentrationInputBinding;
          return withoutBinding;
        });
      return {
        ...current,
        nodes,
        edges: current.edges.filter(
          (modelEdge) =>
            modelEdge.source !== selectedNode.id && modelEdge.target !== selectedNode.id,
        ),
        outputNodeId:
          current.outputNodeId === selectedNode.id ? replacementOutputNodeId : current.outputNodeId,
      };
    };
    let preparedModel: NetworkModel | null = null;
    if (model.outputNodeId === selectedNode.id) {
      preparedModel =
        model.nodes
          .filter((node) => node.kind === 'output' && node.id !== selectedNode.id)
          .map((node) => buildWithoutSelectedNode(model, node.id))
          .find((candidate) => validateNetworkModel(candidate)) ?? null;
      if (!preparedModel) {
        setNoticeKey('modeling.connectionErrors.parameterContextConflict');
        return;
      }
    }
    updateModel((current) => preparedModel ?? buildWithoutSelectedNode(current), {
      kind: 'structure',
      activity: {
        type: 'node.deleted',
        subjectId: selectedNode.id,
        label: selectedNode.name,
      },
    });
    setSelectedNodeId(
      model.nodes.find((modelNode) => modelNode.id !== selectedNode.id)?.id ?? null,
    );
  };

  const createCanvasConnection = (request: ModelConnectionRequest): void => {
    const issue = getModelConnectionIssue(
      model,
      request.sourceNodeId,
      request.targetNodeId,
      request.sourcePortId,
      request.targetPortId,
    );
    if (issue) {
      setNoticeKey(connectionIssueKeys[issue]);
      return;
    }
    const edgeId =
      request.edgeId ?? `edge-${request.sourceNodeId}-${request.targetNodeId}-${Date.now()}`;
    updateModel(
      (current) => {
        const connected = connectModelNodes(current, { ...request, edgeId });
        const target = connected.nodes.find((node) => node.id === request.targetNodeId);
        const binding = target?.receiverResponseBinding;
        if (!binding) return connected;
        return {
          ...connected,
          nodes: connected.nodes.map((node) =>
            node.id === request.sourceNodeId && node.kind === 'input'
              ? {
                  ...node,
                  outputPorts: node.outputPorts.map((port) => ({ ...port, strength: 1 })),
                  concentrationInputBinding: {
                    targetNodeId: target.id,
                    receiverResponseId: binding.receiverResponseId,
                    parameterContextId: binding.parameterContextId,
                    inputSignalId: binding.inputSignalId,
                    inputUnit: binding.inputUnit,
                    workingRange: { ...binding.workingRange },
                  },
                }
              : node,
          ),
        };
      },
      {
        kind: 'structure',
        activity: { type: 'edge.linked', subjectId: edgeId },
      },
    );
    const connectedTarget = model.nodes.find((node) => node.id === request.targetNodeId);
    if (connectedTarget?.receiverResponseBinding) {
      setSelectedNodeId(connectedTarget.id);
      setSelectedEdgeId(null);
      setNoticeKey('modeling.releaseCatalog.boundInputConnected');
    } else {
      setSelectedNodeId(null);
      setSelectedEdgeId(edgeId);
      setNoticeKey('modeling.connectionCreated');
    }
  };

  const removeSelectedEdge = (): void => {
    if (!selectedEdge) return;
    const edgeId = selectedEdge.id;
    updateModel(
      (current) => ({
        ...current,
        edges: current.edges.filter((modelEdge) => modelEdge.id !== edgeId),
      }),
      {
        kind: 'structure',
        activity: { type: 'edge.deleted', subjectId: edgeId },
      },
    );
    setSelectedEdgeId(null);
  };

  const setSelectedEdgeEnabled = (enabled: boolean): void => {
    if (!selectedEdge) return;
    if (enabled) {
      const withoutSelectedEdge = {
        ...model,
        edges: model.edges.filter((edge) => edge.id !== selectedEdge.id),
      };
      const issue = getModelConnectionIssue(
        withoutSelectedEdge,
        selectedEdge.source,
        selectedEdge.target,
        selectedEdge.sourcePortId,
        selectedEdge.targetPortId,
      );
      if (issue) {
        setNoticeKey(connectionIssueKeys[issue]);
        return;
      }
    }
    updateModel((current) => ({
      ...current,
      edges: current.edges.map((edge) =>
        edge.id === selectedEdge.id ? { ...edge, enabled } : edge,
      ),
    }));
  };

  const setSelectedAsOutput = (): void => {
    if (!selectedNode || selectedNode.kind !== 'output') return;
    const candidate = { ...model, outputNodeId: selectedNode.id };
    if (!validateNetworkModel(candidate)) {
      setNoticeKey('modeling.connectionErrors.parameterContextConflict');
      return;
    }
    updateModel(() => candidate);
  };

  const runSimulation = (): void => {
    if (narrative.status === 'running') {
      narrative.skip();
      return;
    }
    const diagnostics = diagnoseNetworkModel(model);
    const firstDiagnostic = diagnostics[0];
    if (firstDiagnostic) {
      if (
        firstDiagnostic.nodeId &&
        model.nodes.some((node) => node.id === firstDiagnostic.nodeId)
      ) {
        setSelectedNodeId(firstDiagnostic.nodeId);
        setSelectedEdgeId(null);
      } else if (
        firstDiagnostic.edgeId &&
        model.edges.some((edge) => edge.id === firstDiagnostic.edgeId)
      ) {
        setSelectedNodeId(null);
        setSelectedEdgeId(firstDiagnostic.edgeId);
      }
      setNoticeKey(
        firstDiagnostic.issue
          ? connectionIssueKeys[firstDiagnostic.issue]
          : firstDiagnostic.code === 'parameters-not-runnable'
            ? 'modeling.parametersNotRunnable'
            : 'modeling.runFailed',
      );
      return;
    }
    try {
      const nextResult = simulateNetwork(model);
      setResult(nextResult);
      setResultModelSnapshot(structuredClone(model));
      setRuns(
        saveModelingRun(model, nextResult, {
          reverseTargetReference,
          validationReference: activeValidationReference,
        }),
      );
      narrative.start(editKind.current === 'parameter' ? 'rerun' : 'full');
      editKind.current = 'parameter';
      recordActivity('simulation.run', { subjectId: model.id, label: model.name });
      setNoticeKey('modeling.runNarrating');
    } catch (error) {
      narrative.fail();
      recordActivity('simulation.error', { subjectId: model.id, label: model.name });
      setNoticeKey(simulationNoticeKey(error));
    }
  };

  const importModel = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setNoticeKey('modeling.importTooLarge');
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const parsedSchemaVersion =
        typeof parsed === 'object' && parsed !== null && 'schemaVersion' in parsed
          ? (parsed as { schemaVersion?: unknown }).schemaVersion
          : undefined;
      let migrated = parsedSchemaVersion !== 2;
      let value: NetworkModel;
      let droppedCatalogReferences = 0;
      try {
        value = migrateNetworkModel(parsed);
      } catch {
        const sanitizedParsed = sanitizeCatalogReferences(parsed);
        if (!sanitizedParsed.model) throw new Error('INVALID_MODEL');
        value = sanitizedParsed.model;
        droppedCatalogReferences += sanitizedParsed.droppedNodeIds.length;
        migrated = false;
      }
      const sanitized = sanitizeCatalogReferences(value);
      if (!sanitized.model) throw new Error('INVALID_MODEL');
      value = sanitized.model;
      droppedCatalogReferences += sanitized.droppedNodeIds.length;
      modelHistory.current.past = [...modelHistory.current.past, structuredClone(model)].slice(
        -historyLimit,
      );
      modelHistory.current.future = [];
      setModel(value);
      nodeNameCounters.current = createModelNodeNameCounters(value, t);
      setSelectedNodeId(value.nodes[0]?.id ?? null);
      setSelectedEdgeId(null);
      setResult(null);
      setResultModelSnapshot(null);
      setReverseCandidates([]);
      setReverseStatus('idle');
      setReverseTargetReference(null);
      setValidationReference(null);
      setImportSummary({
        nodeCount: value.nodes.length,
        edgeCount: value.edges.length,
        migrated,
        droppedCatalogReferences,
      });
      setImportHighlightNodeIds(value.nodes.map((node) => node.id));
      setNoticeKey('modeling.importCompleted');
      editKind.current = 'structure';
      recordActivity('model.imported', { subjectId: value.id, label: value.name });
    } catch {
      setNoticeKey('modeling.importFailed');
    }
  };

  const duplicateSelectedNode = (): void => {
    if (!selectedNode) return;
    const duplicateId = `node-${crypto.randomUUID()}`;
    const clonedNode = structuredClone(selectedNode);
    const duplicate = {
      ...clonedNode,
      id: duplicateId,
      name: `${selectedNode.name} ${t('modeling.copySuffix')}`,
      x: Math.min(820, selectedNode.x + 32),
      y: Math.min(450, selectedNode.y + 32),
      inputPorts: clonedNode.inputPorts.map((port, index) => ({
        ...port,
        id: `${duplicateId}-in-${index + 1}`,
      })),
      outputPorts: clonedNode.outputPorts.map((port, index) => ({
        ...port,
        id: `${duplicateId}-out-${index + 1}`,
      })),
    };
    updateModel((current) => ({ ...current, nodes: [...current.nodes, duplicate] }), {
      kind: 'structure',
      activity: { type: 'node.duplicated', subjectId: duplicate.id, label: duplicate.name },
    });
    setSelectedNodeId(duplicate.id);
    setSelectedEdgeId(null);
  };

  const replaceSelectedPart = (part: ModelingPart, source: DOMRect): void => {
    if (!selectedNode) return;
    const target = document
      .querySelector(`[data-node-id="${CSS.escape(selectedNode.id)}"]`)
      ?.getBoundingClientRect();
    if (target) {
      setPartTransfer({ nodeId: selectedNode.id, source, target, color: part.tint });
    }
    updateModel(
      (current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === selectedNode.id ? applyPart(node, part, t(part.nameKey)) : node,
        ),
      }),
      {
        kind: 'structure',
        activity: {
          type: 'part.replaced',
          subjectId: selectedNode.id,
          label: t(part.nameKey),
        },
      },
    );
    setPartDialogOpen(false);
  };

  const openCatalogDialog = (): void => {
    setCatalogDialogOpen(true);
    if (!releaseCatalogPresentation) {
      recordActivity('catalog.unavailable', {
        subjectId: selectedNode?.id ?? model.id,
        label: selectedNode?.name ?? model.name,
      });
    }
  };

  const releaseLanguage = i18n.language.startsWith('en') ? 'en-US' : 'zh-CN';

  const applySelectedReleaseResponse = (responseView: ReleaseResponseVariantView): void => {
    if (!releaseCatalogPresentation) {
      setNoticeKey('modeling.releaseCatalog.unavailableMessage');
      return;
    }
    const nodeId = 'release-response-' + crypto.randomUUID();
    const position = findOpenNodePosition(model.nodes);
    const applied = applyReleaseResponseToNetwork(model, releaseCatalogPresentation, responseView, {
      nodeId,
      language: releaseLanguage,
      x: position.x,
      y: position.y,
    });
    if (!applied.ok) {
      setNoticeKey('modeling.releaseCatalog.applicationIssues.' + applied.issue);
      return;
    }
    const appliedComponent = releaseCatalogPresentation.components.find(
      (component) => component.id === responseView.componentId,
    );
    const functionFirstName = appliedComponent
      ? getReleaseResponseFunctionTitle(appliedComponent, responseView, releaseLanguage)
      : applied.node.name;
    const appliedModel = {
      ...applied.model,
      nodes: applied.model.nodes.map((node) =>
        node.id === applied.node.id ? { ...node, name: functionFirstName } : node,
      ),
    };
    updateModel(() => appliedModel, {
      kind: 'structure',
      activity: {
        type: 'catalog.applied',
        subjectId: applied.node.id,
        label: functionFirstName,
      },
    });
    setSelectedNodeId(applied.node.id);
    setSelectedEdgeId(null);
    setCatalogDialogOpen(false);
    setNoticeKey('modeling.releaseCatalog.applyCompleted');
  };

  const attachSelectedReleaseCitation = (componentView: ReleaseComponentView): void => {
    if (!selectedNode || !releaseCatalogPresentation) {
      setNoticeKey('modeling.releaseCatalog.selectNodeForCitation');
      return;
    }
    updateModel(
      (current) =>
        attachReleaseComponentCitation(
          current,
          selectedNode.id,
          releaseCatalogPresentation,
          componentView,
          releaseLanguage,
        ),
      {
        kind: 'structure',
        activity: {
          type: 'catalog.attached',
          subjectId: selectedNode.id,
          label: componentView.id,
        },
      },
    );
    setCatalogDialogOpen(false);
    setNoticeKey('modeling.releaseCatalog.citationAttached');
  };

  const detachSelectedCatalog = (): void => {
    if (!selectedNode?.catalogReference) return;
    const entryId = selectedNode.catalogReference.entryId;
    updateModel((current) => detachCatalogReference(current, selectedNode.id), {
      kind: 'structure',
      activity: {
        type: 'catalog.detached',
        subjectId: selectedNode.id,
        label: entryId,
      },
    });
    setNoticeKey('modeling.catalog.detachCompleted');
  };

  const restoreRun = (run: ModelingRun): void => {
    if (!run.modelSnapshot) return;
    modelHistory.current.past = [...modelHistory.current.past, structuredClone(model)].slice(
      -historyLimit,
    );
    modelHistory.current.future = [];
    const restoredModel = structuredClone(run.modelSnapshot);
    setModel(restoredModel);
    nodeNameCounters.current = createModelNodeNameCounters(restoredModel, t);
    setResult(run.result);
    setResultModelSnapshot(structuredClone(run.modelSnapshot));
    setSelectedNodeId(run.modelSnapshot.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    const restoredReverseReference = run.reverseTargetReference
      ? structuredClone(run.reverseTargetReference)
      : null;
    setReverseTargetReference(restoredReverseReference);
    setReverseTarget(restoredReverseReference?.normalizedValue ?? 0.7);
    setValidationReference(
      run.validationReference ? structuredClone(run.validationReference) : null,
    );
    setReverseCandidates([]);
    editKind.current = 'structure';
    recordActivity('run.restored', { subjectId: run.id, label: run.modelName });
    setNoticeKey('modeling.runRestored');
  };

  const runReverseDesign = (): void => {
    const status = inspectReverseDesign(model, reverseTarget);
    setReverseStatus(status);
    if (status !== 'ready') {
      setReverseCandidates([]);
      setNoticeKey(
        status === 'missing-runnable-response'
          ? 'modeling.parametersNotRunnable'
          : status === 'range-conflict'
            ? 'modeling.connectionErrors.parameterContextConflict'
            : status === 'target-out-of-range'
              ? 'modeling.runFailed'
              : 'modeling.reverseEmpty',
      );
      return;
    }
    try {
      setReverseCandidates(solveReverseDesign(model, reverseTarget));
      setNoticeKey(null);
    } catch (error) {
      setReverseCandidates([]);
      setNoticeKey(simulationNoticeKey(error));
    }
  };

  const applyReverseCandidate = (candidate: ReverseDesignCandidate): void => {
    try {
      const appliedModel = applyReverseDesignCandidate(model, candidate);
      const verifiedResult = simulateNetwork(appliedModel);
      updateModel(() => appliedModel, {
        kind: 'structure',
        activity: {
          type: 'reverse.applied',
          subjectId: candidate.id,
          value: candidate.outputValue,
        },
      });
      setResult(verifiedResult);
      setResultModelSnapshot(structuredClone(appliedModel));
      setRuns(
        saveModelingRun(appliedModel, verifiedResult, {
          reverseTargetReference,
          validationReference: activeValidationReference,
        }),
      );
      narrative.start('rerun');
      editKind.current = 'parameter';
      setReverseDialogOpen(false);
      setNoticeKey('modeling.reverseApplied');
    } catch (error) {
      setNoticeKey(simulationNoticeKey(error));
    }
  };

  const confirmDetectionModelingReference = (reference: DetectionModelingReference): void => {
    if (reference.mode === 'reverse-target') {
      setReverseTarget(reference.normalizedValue);
      setReverseTargetReference(reference);
      setReverseCandidates([]);
      setNoticeKey('modeling.detectionPicker.targetApplied');
    } else {
      setValidationReference(reference);
      if (result) {
        setRuns(
          saveModelingRun(model, result, {
            reverseTargetReference,
            validationReference: reference,
          }),
        );
      }
      setNoticeKey('modeling.detectionPicker.validationLinked');
    }
    setDetectionPickerMode(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (narrative.status === 'running') {
          event.preventDefault();
          narrative.skip();
          return;
        }
        setPartDialogOpen(false);
        setDetectionPickerMode(null);
        setReverseDialogOpen(false);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        return;
      }
      const target = event.target;
      const insideDialog =
        target instanceof HTMLElement && Boolean(target.closest("[role='dialog']"));
      const editingText =
        target instanceof HTMLElement &&
        Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
      if ((event.key === 'Delete' || event.key === 'Backspace') && !editingText && !insideDialog) {
        if (selectedEdge) removeSelectedEdge();
        else if (selectedNode) removeSelectedNode();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoModel();
        else undoModel();
      } else if (event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelectedNode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const resultDisplayModel = resultModelSnapshot ?? model;
  const outputNode = resultDisplayModel.nodes.find(
    (modelNode) => modelNode.id === resultDisplayModel.outputNodeId,
  );
  const selectedCatalogReference = selectedNode?.catalogReference;
  const selectedCatalogVersionSupported = Boolean(
    selectedCatalogReference &&
    releaseCatalogPresentation &&
    selectedCatalogReference.catalogId ===
      releaseCatalogPresentation.catalog.releaseManifest.catalogId &&
    selectedCatalogReference.catalogVersion ===
      releaseCatalogPresentation.catalog.releaseManifest.releaseVersion,
  );
  const selectedCatalogEntryAvailable = Boolean(
    selectedCatalogReference &&
    selectedCatalogVersionSupported &&
    releaseCatalogPresentation?.components.some(
      (component) => component.id === selectedCatalogReference.entryId,
    ),
  );
  const selectedNodeRunnable = Boolean(
    selectedNode &&
    ['team-calibrated', 'literature-context', 'normalized-demo', 'legacy-demo'].includes(
      selectedNode.parameters.parameterStatus,
    ) &&
    [...selectedNode.inputPorts, ...selectedNode.outputPorts].every((port) =>
      ['team-calibrated', 'literature-context', 'normalized-demo', 'legacy-demo'].includes(
        port.parameterStatus,
      ),
    ),
  );
  const canDeleteSelectedNode = Boolean(
    selectedNode &&
    model.nodes.length > 1 &&
    (selectedNode.kind !== 'output' ||
      model.nodes.some(
        (candidate) => candidate.kind === 'output' && candidate.id !== selectedNode.id,
      )),
  );
  const directBoundResponseEdge =
    selectedNode?.kind === 'input'
      ? model.edges.find((edge) => {
          if (!edge.enabled || edge.source !== selectedNode.id) return false;
          const target = model.nodes.find((node) => node.id === edge.target);
          return Boolean(
            target?.receiverResponseBinding &&
            target.inputPorts.some((port) => port.id === edge.targetPortId),
          );
        })
      : undefined;
  const directBoundResponseNode = directBoundResponseEdge
    ? model.nodes.find((node) => node.id === directBoundResponseEdge.target)
    : undefined;
  const pendingBoundResponseNode =
    selectedNode?.kind === 'input' && selectedNode.concentrationInputBinding
      ? model.nodes.find((node) => node.id === selectedNode.concentrationInputBinding?.targetNodeId)
      : undefined;
  const activeBoundResponseNode = directBoundResponseNode ?? pendingBoundResponseNode;
  const directBoundResponseRange =
    activeBoundResponseNode?.receiverResponseBinding?.workingRange ??
    selectedNode?.concentrationInputBinding?.workingRange;

  const formatReverseCandidateInput = (nodeId: string, value: number | undefined): string => {
    if (value === undefined) return t('common.notAvailable');
    const connectedTargetId = model.edges.find((edge) => {
      if (!edge.enabled || edge.source !== nodeId) return false;
      return Boolean(model.nodes.find((node) => node.id === edge.target)?.receiverResponseBinding);
    })?.target;
    const targetId =
      connectedTargetId ??
      model.nodes.find((node) => node.id === nodeId)?.concentrationInputBinding?.targetNodeId;
    const usesMolarConcentration = Boolean(
      targetId && model.nodes.find((node) => node.id === targetId)?.receiverResponseBinding,
    );
    return usesMolarConcentration ? `${value.toExponential(2)} M` : value.toFixed(2);
  };

  const updateNodePortSignal = (
    nodeId: string,
    portId: string,
    portDirection: 'input' | 'output',
    signalId: string,
  ): void => {
    updateModel(
      (current) => ({
        ...current,
        nodes: current.nodes.map((modelNode) => {
          if (modelNode.id !== nodeId) return modelNode;
          const nextNode = {
            ...modelNode,
            inputPorts:
              portDirection === 'input'
                ? modelNode.inputPorts.map((port) =>
                    port.id === portId ? { ...port, signalId } : port,
                  )
                : modelNode.inputPorts,
            outputPorts:
              portDirection === 'output'
                ? modelNode.outputPorts.map((port) =>
                    port.id === portId ? { ...port, signalId } : port,
                  )
                : modelNode.outputPorts,
          };
          if (portDirection !== 'output' || !nextNode.concentrationInputBinding) {
            return nextNode;
          }
          const withoutBinding: ModelNode = { ...nextNode };
          delete withoutBinding.concentrationInputBinding;
          return withoutBinding;
        }),
        edges: current.edges.filter((edge) =>
          portDirection === 'input' ? edge.targetPortId !== portId : edge.sourcePortId !== portId,
        ),
      }),
      {
        kind: 'structure',
        activity: {
          type: 'parameter.changed',
          subjectId: nodeId,
          key: portDirection === 'input' ? 'inputSignal' : 'outputSignal',
          value: signalId,
        },
      },
    );
    setSelectedEdgeId(null);
  };

  const updateSelectedNodeParameter = (key: 'baseline' | 'gain', value: number): void => {
    if (!selectedNode) return;
    updateModel((current) => ({
      ...current,
      nodes: current.nodes.map((modelNode) =>
        modelNode.id === selectedNode.id
          ? {
              ...modelNode,
              parameters: { ...modelNode.parameters, [key]: value },
            }
          : modelNode,
      ),
    }));
  };

  const updateSelectedInputConcentration = (value: number): void => {
    if (!selectedNode || !directBoundResponseRange || !Number.isFinite(value)) return;
    const next =
      value <= 0
        ? 0
        : Math.min(directBoundResponseRange.max, Math.max(directBoundResponseRange.min, value));
    updateModel((current) => ({
      ...current,
      nodes: current.nodes.map((modelNode) =>
        modelNode.id === selectedNode.id
          ? { ...modelNode, parameters: { ...modelNode.parameters, baseline: next } }
          : modelNode,
      ),
    }));
  };

  const updateSelectedInputPort = (
    portId: string,
    change: { sensitivity?: number; direction?: ModelInputDirection },
  ): void => {
    if (!selectedNode) return;
    updateModel((current) => ({
      ...current,
      nodes: current.nodes.map((modelNode) =>
        modelNode.id === selectedNode.id
          ? {
              ...modelNode,
              inputPorts: modelNode.inputPorts.map((port) =>
                port.id === portId ? { ...port, ...change } : port,
              ),
            }
          : modelNode,
      ),
    }));
  };

  const updateSelectedOutputPort = (portId: string, strength: number): void => {
    if (!selectedNode) return;
    updateModel((current) => ({
      ...current,
      nodes: current.nodes.map((modelNode) =>
        modelNode.id === selectedNode.id
          ? {
              ...modelNode,
              outputPorts: modelNode.outputPorts.map((port) =>
                port.id === portId ? { ...port, strength } : port,
              ),
            }
          : modelNode,
      ),
    }));
  };

  const enableSelectedNodeAsDemo = (): void => {
    if (!selectedNode) return;
    updateModel(
      (current) => ({
        ...current,
        isDemo: true,
        nodes: current.nodes.map((modelNode) =>
          modelNode.id !== selectedNode.id
            ? modelNode
            : {
                ...modelNode,
                parameters: {
                  ...modelNode.parameters,
                  baseline:
                    modelNode.kind === 'input' && modelNode.parameters.baseline === 0
                      ? 0.5
                      : modelNode.parameters.baseline,
                  gain: modelNode.parameters.gain || 1,
                  parameterStatus: 'normalized-demo',
                  provenance: 'user-specified',
                },
                inputPorts: modelNode.inputPorts.map((port) => ({
                  ...port,
                  sensitivity: port.sensitivity || 1,
                  parameterStatus: 'normalized-demo',
                  provenance: 'user-specified',
                })),
                outputPorts: modelNode.outputPorts.map((port) => ({
                  ...port,
                  strength: port.strength || 1,
                  parameterStatus: 'normalized-demo',
                  provenance: 'user-specified',
                })),
              },
        ),
      }),
      {
        kind: 'parameter',
        activity: {
          type: 'parameter.changed',
          subjectId: selectedNode.id,
          key: 'parameterStatus',
          value: 'normalized-demo',
        },
      },
    );
    setNoticeKey('modeling.demoParametersEnabled');
  };

  return (
    <div className="page page--modeling">
      <PageHeader
        eyebrow={t('modeling.eyebrow')}
        title={t('modeling.title')}
        subtitle={t('modeling.subtitle')}
        actions={
          <>
            <button
              className="button modeling-reverse-launch"
              type="button"
              onClick={() => {
                setReverseDialogOpen(true);
                setReverseCandidates([]);
                setReverseStatus('idle');
              }}
            >
              <Icon name="network" size={18} />
              {t('modeling.reverseDesign')}
            </button>
            <button
              className={`button button--primary modeling-run-button${narrative.status === 'running' ? ' is-running' : ''}`}
              type="button"
              onClick={runSimulation}
              aria-label={
                narrative.status === 'running' ? t('modeling.skipToResult') : t('modeling.run')
              }
            >
              <Icon name="play" size={17} />
              {narrative.status === 'running' ? t('modeling.skipToResult') : t('modeling.run')}
            </button>
          </>
        }
      />

      <details className="modeling-boundary">
        <summary className="modeling-boundary__summary">
          <span className="modeling-boundary__icon">
            <Icon name="warning" size={14} />
          </span>
          <span className="modeling-boundary__heading">
            <strong>{t('modeling.boundaryTitle')}</strong>
            <span className="modeling-boundary__state">{t('modeling.demoBadge')}</span>
          </span>
          <span className="modeling-boundary__chevron" aria-hidden="true" />
        </summary>
        <div className="modeling-boundary__detail">
          <span>{t('modeling.boundaryText')}</span>
        </div>
      </details>

      <TelemetryStrip
        label={t('modeling.simulationTelemetry')}
        items={[
          {
            label: t('modeling.simulationStatus'),
            value: t(`modeling.narrative.${narrative.status}`),
            tone:
              narrative.status === 'running'
                ? 'success'
                : narrative.status === 'error'
                  ? 'danger'
                  : 'accent',
          },
          {
            label: t('modeling.narrativeStage'),
            value: t(`modeling.chapters.${narrative.chapter}`),
          },
          {
            label: t('modeling.simulationMode'),
            value: t('modeling.steadyState'),
          },
          {
            label: t('modeling.iterationLimit'),
            value: String(MODELING_SIMULATION_DEFAULTS.maxIterations),
          },
          {
            label: t('modeling.parameterLevel'),
            value: t(`modeling.parameterStatuses.${result?.parameterStatus ?? 'normalized-demo'}`),
          },
        ]}
      />

      <section className="panel modeling-command-deck">
        <div
          className="modeling-command-row modeling-command-row--project"
          aria-label={t('modeling.projectOperations')}
        >
          <label className="modeling-template-picker">
            <span>{t('modeling.template')}</span>
            <select
              value={model.templateId}
              onChange={(event) => chooseTemplate(event.target.value as ModelTemplateId)}
            >
              {templateIds.map((templateId) => (
                <option key={templateId} value={templateId}>
                  {t(`modeling.templates.${templateId}.name`)}
                </option>
              ))}
            </select>
          </label>
          <div className="modeling-history-tools" aria-label={t('modeling.editHistory')}>
            <button
              className="icon-text-button"
              type="button"
              disabled={modelHistory.current.past.length === 0}
              onClick={undoModel}
              title="Ctrl+Z"
            >
              <Icon name="reset" size={15} />
              {t('modeling.undo')}
            </button>
            <button
              className="icon-text-button"
              type="button"
              disabled={modelHistory.current.future.length === 0}
              onClick={redoModel}
              title="Ctrl+Shift+Z"
            >
              <Icon name="arrow" size={15} />
              {t('modeling.redo')}
            </button>
          </div>
          <div className="modeling-command-row__spacer" />
          <div className="modeling-file-tools">
            <button
              className="icon-text-button"
              type="button"
              onClick={() => importInput.current?.click()}
            >
              <Icon name="import" size={16} />
              {t('modeling.importModel')}
            </button>
            <input
              ref={importInput}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              onChange={(event) => void importModel(event)}
            />
            <button className="icon-text-button" type="button" onClick={() => downloadJson(model)}>
              <Icon name="export" size={16} />
              {t('modeling.exportModel')}
            </button>
            <button
              className="icon-text-button"
              type="button"
              onClick={() => chooseTemplate(model.templateId)}
            >
              <Icon name="reset" size={16} />
              {t('modeling.reset')}
            </button>
          </div>
        </div>
        <div
          className="modeling-command-row modeling-command-row--nodes"
          aria-label={t('modeling.nodeCreation')}
        >
          <span className="modeling-command-row__label">{t('modeling.addNode')}</span>
          <button
            ref={catalogTriggerRef}
            className="modeling-node-command modeling-node-command--catalog"
            type="button"
            onClick={openCatalogDialog}
          >
            <Icon name="flask" size={15} />
            {t('modeling.catalog.entryPoint')}
          </button>
          {nodeKinds.map((kind) => (
            <button
              className="modeling-node-command"
              data-kind={kind}
              key={kind}
              type="button"
              onClick={() => addNode(kind)}
            >
              <Icon name="plus" size={15} />
              {t(`modeling.nodeKinds.${kind}`)}
            </button>
          ))}
        </div>
      </section>

      {importSummary ? (
        <div
          className="modeling-import-summary"
          role="status"
          data-migrated={importSummary.migrated}
          data-dropped-catalog-references={importSummary.droppedCatalogReferences}
        >
          <span>{t('modeling.importCompleted')}</span>
          <span>{t('modeling.nodeCount', { count: importSummary.nodeCount })}</span>
          <span>{t('modeling.edgeCount', { count: importSummary.edgeCount })}</span>
        </div>
      ) : null}
      {noticeKey ? (
        <div className="modeling-notice" role="status">
          <span />
          {t(noticeKey)}
        </div>
      ) : null}

      <div className="modeling-layout">
        <section className="panel modeling-stage">
          <header className="modeling-panel-heading">
            <div>
              <p className="panel-kicker">{t('modeling.canvasKicker')}</p>
              <h2>{model.name}</h2>
            </div>
            <div className="modeling-stage__stats">
              <span>{t('modeling.nodeCount', { count: model.nodes.length })}</span>
              <span>{t('modeling.edgeCount', { count: model.edges.length })}</span>
              <span>{t('modeling.dragHint')}</span>
            </div>
          </header>
          <NetworkCanvas
            model={model}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            nodeKindLabels={nodeKindLabels}
            narrative={narrative}
            partArrivingNodeId={partTransfer?.nodeId ?? null}
            highlightedNodeIds={importHighlightNodeIds}
            onSelectNode={(nodeId) => {
              setSelectedNodeId(nodeId);
              setSelectedEdgeId(null);
            }}
            onSelectEdge={(edgeId) => {
              setSelectedNodeId(null);
              setSelectedEdgeId(edgeId);
            }}
            onClearSelection={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            onMoveNode={(nodeId, x, y) =>
              updateModel(
                (current) => ({
                  ...current,
                  nodes: current.nodes.map((modelNode) =>
                    modelNode.id === nodeId ? { ...modelNode, x, y } : modelNode,
                  ),
                }),
                { history: false, kind: 'structure', activity: null },
              )
            }
            onCreateConnection={createCanvasConnection}
          />
          <footer className="modeling-stage__legend">
            {nodeKinds.map((kind) => (
              <span key={kind} data-kind={kind}>
                <i />
                {t(`modeling.nodeKinds.${kind}`)}
              </span>
            ))}
          </footer>
        </section>

        <aside className="panel modeling-inspector">
          <header className="modeling-panel-heading">
            <div>
              <p className="panel-kicker">{t('modeling.inspectorKicker')}</p>
              <h2>
                {selectedNode
                  ? selectedNode.name
                  : selectedEdge
                    ? t('modeling.connection')
                    : t('modeling.projectSettings')}
              </h2>
            </div>
            {selectedNode ? (
              <span className="node-kind-badge" data-kind={selectedNode.kind}>
                {t(`modeling.nodeKinds.${selectedNode.kind}`)}
              </span>
            ) : null}
          </header>

          <div
            className="modeling-panel-tabs"
            role="tablist"
            aria-label={t('modeling.inspectorTabs')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'inspector'}
              className={inspectorTab === 'inspector' ? 'is-active' : ''}
              onClick={() => setInspectorTab('inspector')}
            >
              {t('modeling.inspectorTab')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'provenance'}
              className={inspectorTab === 'provenance' ? 'is-active' : ''}
              onClick={() => setInspectorTab('provenance')}
            >
              {t('modeling.provenanceTab')}
              <span>{activity.length}</span>
            </button>
          </div>

          <div className="modeling-inspector__scroll">
            {inspectorTab === 'provenance' ? (
              <ModelingActivityPanel events={activity} />
            ) : (
              <>
                {selectedNode ? (
                  selectedNode.receiverResponseBinding ? (
                    <>
                      <BoundResponseInspector
                        binding={selectedNode.receiverResponseBinding}
                        componentName={selectedNode.name}
                        onAddInput={() => addNode('input')}
                        onAddOutput={() => addNode('output')}
                      />
                      <div className="modeling-node-actions modeling-bound-response-actions">
                        <button
                          className="button button--ghost"
                          type="button"
                          onClick={duplicateSelectedNode}
                        >
                          <Icon name="plus" size={15} />
                          {t('modeling.duplicateNode')}
                        </button>
                      </div>
                      <button
                        className="danger-text-button"
                        type="button"
                        disabled={!canDeleteSelectedNode}
                        onClick={removeSelectedNode}
                      >
                        <Icon name="trash" size={16} />
                        {t('modeling.deleteNode')}
                      </button>
                    </>
                  ) : (
                    <div className="modeling-form">
                      <label className="field">
                        <span>{t('modeling.nodeName')}</span>
                        <input
                          value={selectedNode.name}
                          onChange={(event) =>
                            updateModel((current) => ({
                              ...current,
                              nodes: current.nodes.map((modelNode) =>
                                modelNode.id === selectedNode.id
                                  ? { ...modelNode, name: event.target.value }
                                  : modelNode,
                              ),
                            }))
                          }
                        />
                      </label>
                      <div className="modeling-node-actions">
                        <button
                          className="button button--secondary modeling-catalog-launch"
                          type="button"
                          onClick={openCatalogDialog}
                        >
                          <Icon name="flask" size={15} />
                          {t('modeling.catalog.entryPoint')}
                        </button>
                        <button
                          className="button button--secondary"
                          type="button"
                          onClick={() => setPartDialogOpen(true)}
                        >
                          <Icon name="network" size={15} />
                          {selectedNode.part ? t('modeling.changePart') : t('modeling.choosePart')}
                        </button>
                        <button
                          className="button button--ghost"
                          type="button"
                          onClick={duplicateSelectedNode}
                        >
                          <Icon name="plus" size={15} />
                          {t('modeling.duplicateNode')}
                        </button>
                      </div>
                      {selectedNode.part ? (
                        <div className="modeling-part-reference">
                          <span>{t('modeling.partReference')}</span>
                          <strong>{selectedNode.part.id}</strong>
                          <small>
                            {t(`modeling.partStatus.${selectedNode.part.evidenceStatus}`)}
                          </small>
                        </div>
                      ) : null}
                      {selectedCatalogReference ? (
                        <div
                          className="modeling-catalog-reference"
                          data-status={selectedCatalogEntryAvailable ? 'available' : 'historical'}
                        >
                          <span>{t('modeling.catalog.currentReference')}</span>
                          <strong>{selectedCatalogReference.displayNameSnapshot}</strong>
                          <code>{selectedCatalogReference.entryId}</code>
                          {!selectedCatalogEntryAvailable ? (
                            <small>{t('modeling.catalog.historicalUnavailable')}</small>
                          ) : (
                            <small>{t('modeling.catalog.referenceOnly')}</small>
                          )}
                          <button
                            className="danger-text-button"
                            type="button"
                            onClick={detachSelectedCatalog}
                          >
                            <Icon name="trash" size={14} />
                            {t('modeling.catalog.detachFromNode')}
                          </button>
                        </div>
                      ) : null}
                      <div
                        className="modeling-parameter-status"
                        data-status={selectedNode.parameters.parameterStatus}
                      >
                        <span>{t('modeling.parameterLevel')}</span>
                        <strong>
                          {t(
                            'modeling.parameterStatuses.' + selectedNode.parameters.parameterStatus,
                          )}
                        </strong>
                        <small>
                          {selectedNodeRunnable
                            ? t('modeling.parameterReady')
                            : t('modeling.parameterBlocked')}
                        </small>
                        {!selectedNodeRunnable ? (
                          <button
                            className="button button--secondary"
                            type="button"
                            onClick={enableSelectedNodeAsDemo}
                          >
                            {t('modeling.useNormalizedDemoParameters')}
                          </button>
                        ) : null}
                      </div>

                      {directBoundResponseRange ? (
                        <ConcentrationParameterField
                          label={t('modeling.releaseCatalog.concentrationM')}
                          hint={t('modeling.releaseCatalog.concentrationLogHint')}
                          value={selectedNode.parameters.baseline}
                          min={directBoundResponseRange.min}
                          max={directBoundResponseRange.max}
                          onChange={updateSelectedInputConcentration}
                        />
                      ) : (
                        <ParameterField
                          label={
                            selectedNode.kind === 'input'
                              ? t('modeling.parameters.externalInput')
                              : t('modeling.parameters.baseline')
                          }
                          value={selectedNode.parameters.baseline}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(value) => updateSelectedNodeParameter('baseline', value)}
                        />
                      )}
                      {selectedNode.kind !== 'input' ? (
                        <ParameterField
                          label={t('modeling.parameters.nodeGain')}
                          value={selectedNode.parameters.gain}
                          min={0}
                          max={3}
                          step={0.05}
                          onChange={(value) => updateSelectedNodeParameter('gain', value)}
                        />
                      ) : null}

                      <section
                        className="modeling-port-editor"
                        aria-label={t('modeling.inputPorts')}
                      >
                        <header>
                          <strong>{t('modeling.inputPorts')}</strong>
                          <span>{selectedNode.inputPorts.length}</span>
                        </header>
                        {selectedNode.inputPorts.length ? (
                          selectedNode.inputPorts.map((port) => (
                            <article key={port.id}>
                              <label className="field">
                                <span>{t('modeling.inputMolecule')}</span>
                                <input
                                  value={port.signalId}
                                  spellCheck={false}
                                  onChange={(event) =>
                                    updateNodePortSignal(
                                      selectedNode.id,
                                      port.id,
                                      'input',
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              <ParameterField
                                label={t('modeling.parameters.sensitivity')}
                                value={port.sensitivity}
                                min={0}
                                max={3}
                                step={0.05}
                                onChange={(value) =>
                                  updateSelectedInputPort(port.id, { sensitivity: value })
                                }
                              />
                              <label className="field">
                                <span>{t('modeling.inputDirection')}</span>
                                <select
                                  value={port.direction}
                                  onChange={(event) =>
                                    updateSelectedInputPort(port.id, {
                                      direction: event.target.value as ModelInputDirection,
                                    })
                                  }
                                >
                                  <option value="activation">
                                    {t('modeling.inputDirections.activation')}
                                  </option>
                                  <option value="inhibition">
                                    {t('modeling.inputDirections.inhibition')}
                                  </option>
                                  <option value="derepression">
                                    {t('modeling.inputDirections.derepression')}
                                  </option>
                                </select>
                              </label>
                            </article>
                          ))
                        ) : (
                          <p className="modeling-port-editor__empty">
                            {t('modeling.noInputPorts')}
                          </p>
                        )}
                      </section>

                      <section
                        className="modeling-port-editor"
                        aria-label={t('modeling.outputPorts')}
                      >
                        <header>
                          <strong>{t('modeling.outputPorts')}</strong>
                          <span>{selectedNode.outputPorts.length}</span>
                        </header>
                        {selectedNode.outputPorts.length ? (
                          selectedNode.outputPorts.map((port) => (
                            <article key={port.id}>
                              <label className="field">
                                <span>{t('modeling.outputMolecule')}</span>
                                <input
                                  value={port.signalId}
                                  spellCheck={false}
                                  onChange={(event) =>
                                    updateNodePortSignal(
                                      selectedNode.id,
                                      port.id,
                                      'output',
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              {selectedNode.concentrationInputBinding ? (
                                <p className="modeling-concentration-output-note">
                                  {t('modeling.releaseCatalog.concentrationOutputPassThrough')}
                                </p>
                              ) : (
                                <ParameterField
                                  label={t('modeling.parameters.outputStrength')}
                                  value={port.strength}
                                  min={0}
                                  max={3}
                                  step={0.05}
                                  onChange={(value) => updateSelectedOutputPort(port.id, value)}
                                />
                              )}
                            </article>
                          ))
                        ) : (
                          <p className="modeling-port-editor__empty">
                            {t('modeling.noOutputPorts')}
                          </p>
                        )}
                      </section>
                      {selectedNode.kind === 'output' ? (
                        <button
                          className="button button--secondary button--wide"
                          type="button"
                          onClick={setSelectedAsOutput}
                        >
                          <Icon name="check" size={16} />
                          {model.outputNodeId === selectedNode.id
                            ? t('modeling.currentOutput')
                            : t('modeling.setOutput')}
                        </button>
                      ) : null}
                      <button
                        className="danger-text-button"
                        type="button"
                        disabled={!canDeleteSelectedNode}
                        onClick={removeSelectedNode}
                      >
                        <Icon name="trash" size={16} />
                        {t('modeling.deleteNode')}
                      </button>
                    </div>
                  )
                ) : selectedEdge ? (
                  <div className="modeling-form">
                    <dl className="connection-route">
                      <div>
                        <dt>{t('modeling.source')}</dt>
                        <dd>{model.nodes.find((node) => node.id === selectedEdge.source)?.name}</dd>
                      </div>
                      <Icon name="arrow" />
                      <div>
                        <dt>{t('modeling.target')}</dt>
                        <dd>{model.nodes.find((node) => node.id === selectedEdge.target)?.name}</dd>
                      </div>
                    </dl>
                    <div className="modeling-signal-route">
                      <span>{t('modeling.signalMolecule')}</span>
                      <code>{selectedEdge.signalId}</code>
                      <small>{t('modeling.routeHasNoWeight')}</small>
                    </div>
                    <label className="modeling-switch">
                      <span>{t('modeling.connectionEnabled')}</span>
                      <input
                        type="checkbox"
                        checked={selectedEdge.enabled}
                        onChange={(event) => setSelectedEdgeEnabled(event.target.checked)}
                      />
                    </label>
                    <button
                      className="danger-text-button"
                      type="button"
                      onClick={removeSelectedEdge}
                    >
                      <Icon name="trash" size={16} />
                      {t('modeling.deleteConnection')}
                    </button>
                  </div>
                ) : (
                  <div className="modeling-form">
                    <label className="field">
                      <span>{t('modeling.projectName')}</span>
                      <input
                        value={model.name}
                        onChange={(event) =>
                          updateModel((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>{t('modeling.projectDescription')}</span>
                      <textarea
                        rows={4}
                        value={model.description}
                        onChange={(event) =>
                          updateModel((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="parameter-pair">
                      <ParameterField
                        label={t('modeling.lowThreshold')}
                        value={model.thresholds[0]}
                        min={0}
                        max={model.thresholds[1]}
                        step={0.01}
                        onChange={(value) =>
                          updateModel((current) => ({
                            ...current,
                            thresholds: [value, current.thresholds[1]],
                          }))
                        }
                      />
                      <ParameterField
                        label={t('modeling.highThreshold')}
                        value={model.thresholds[1]}
                        min={model.thresholds[0]}
                        max={1}
                        step={0.01}
                        onChange={(value) =>
                          updateModel((current) => ({
                            ...current,
                            thresholds: [current.thresholds[0], value],
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      <div className="modeling-results-grid">
        <section className="panel modeling-result-panel">
          <header className="modeling-panel-heading">
            <div>
              <p className="panel-kicker">{t('modeling.resultKicker')}</p>
              <h2>{t('modeling.responseCurve')}</h2>
            </div>
            <div className="modeling-result-actions">
              <button
                type="button"
                className={comparisonA ? 'comparison-slot is-filled' : 'comparison-slot'}
                disabled={!result}
                onClick={() => setComparisonA(result)}
                title={t('modeling.saveComparisonA')}
              >
                A
              </button>
              <button
                type="button"
                className={comparisonB ? 'comparison-slot is-filled' : 'comparison-slot'}
                disabled={!result}
                onClick={() => setComparisonB(result)}
                title={t('modeling.saveComparisonB')}
              >
                B
              </button>
              {result ? (
                <StatusPill label={t('modeling.modelResult')} tone="signal" />
              ) : (
                <StatusPill label={t('modeling.awaitingRun')} tone="neutral" />
              )}
            </div>
          </header>
          <SimulationChart
            result={result}
            emptyLabel={t('modeling.chartEmpty')}
            outputLabel={t('modeling.responseCurve')}
            timeLabel={t('modeling.timeAxis')}
            valueLabel={t('modeling.normalizedAxis')}
            nodeLabel={t('modeling.nodeAxis')}
            convergenceLabel={t('modeling.convergence')}
            concentrationLabel={t('modeling.concentrationInputs')}
            concentrationNodeIds={resultDisplayModel.nodes
              .filter((node) => node.concentrationInputBinding)
              .map((node) => node.id)}
            nodeLabels={Object.fromEntries(
              resultDisplayModel.nodes.map((node) => [node.id, node.name]),
            )}
            thresholds={resultDisplayModel.thresholds}
            revealProgress={narrative.status === 'running' ? narrative.revealProgress : 1}
            comparisons={[
              ...(comparisonA ? [{ id: 'comparison-a', label: 'A', result: comparisonA }] : []),
              ...(comparisonB ? [{ id: 'comparison-b', label: 'B', result: comparisonB }] : []),
            ]}
          />
          {comparisonA || comparisonB ? (
            <div className="comparison-legend">
              {comparisonA ? (
                <span data-slot="a">A · {(comparisonA.outputValue * 100).toFixed(1)}%</span>
              ) : null}
              {comparisonB ? (
                <span data-slot="b">B · {(comparisonB.outputValue * 100).toFixed(1)}%</span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setComparisonA(null);
                  setComparisonB(null);
                }}
              >
                {t('modeling.clearComparison')}
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel modeling-output-panel">
          <header className="modeling-panel-heading">
            <div>
              <p className="panel-kicker">{t('modeling.outputKicker')}</p>
              <h2>{outputNode?.name ?? t('modeling.output')}</h2>
            </div>
          </header>
          <div className="modeling-output-value">
            <span>
              {result ? `${(result.outputValue * 100).toFixed(1)}%` : t('common.notAvailable')}
            </span>
            <small>{t('modeling.normalizedOutput')}</small>
          </div>
          <div className="modeling-output-band" data-band={result?.outputBand ?? 'none'}>
            <span>{t('modeling.outputBand')}</span>
            <strong>
              {result ? t(`modeling.bands.${result.outputBand}`) : t('modeling.notCalculated')}
            </strong>
          </div>
          <div className="modeling-node-readouts">
            {resultDisplayModel.nodes.map((modelNode) => (
              <div key={modelNode.id}>
                <span>{modelNode.name}</span>
                <strong>
                  {result
                    ? modelNode.concentrationInputBinding
                      ? (result.finalValues[modelNode.id] ?? 0) === 0
                        ? '0 M'
                        : `${(result.finalValues[modelNode.id] ?? 0).toExponential(2)} M`
                      : (result.finalValues[modelNode.id] ?? 0).toFixed(3)
                    : t('common.notAvailable')}
                </strong>
              </div>
            ))}
          </div>
          <button
            className="button button--secondary button--wide modeling-validation-launch"
            type="button"
            onClick={() => setDetectionPickerMode('network-validation')}
          >
            <Icon name="check" size={16} />
            {t('modeling.validateWithDetection')}
          </button>
          {activeValidationReference ? (
            <div className="modeling-validation-card" data-demo={activeValidationReference.isDemo}>
              <header>
                <div>
                  <span>{t('modeling.validationReference')}</span>
                  <strong>{activeValidationReference.sampleId}</strong>
                </div>
                <small>
                  {t(`modeling.detectionPicker.status.${activeValidationReference.mappingStatus}`)}
                </small>
              </header>
              <dl>
                <div>
                  <dt>{t('modeling.validationMeasured')}</dt>
                  <dd>{activeValidationReference.normalizedValue.toFixed(3)}</dd>
                </div>
                <div>
                  <dt>{t('modeling.validationPredicted')}</dt>
                  <dd>{result ? result.outputValue.toFixed(3) : t('common.notAvailable')}</dd>
                </div>
                <div>
                  <dt>{t('modeling.validationDifference')}</dt>
                  <dd>
                    {result
                      ? Math.abs(
                          result.outputValue - activeValidationReference.normalizedValue,
                        ).toFixed(3)
                      : t('common.notAvailable')}
                  </dd>
                </div>
              </dl>
              <p>{t('modeling.validationBoundary')}</p>
            </div>
          ) : null}
        </section>
      </div>

      <section className="panel modeling-runs">
        <header className="modeling-panel-heading">
          <div>
            <p className="panel-kicker">{t('modeling.runsKicker')}</p>
            <h2>{t('modeling.runsTitle')}</h2>
          </div>
          {runs.length ? (
            <button
              className="danger-text-button"
              type="button"
              onClick={() => {
                clearModelingRuns();
                setRuns([]);
              }}
            >
              <Icon name="trash" size={15} />
              {t('modeling.clearRuns')}
            </button>
          ) : null}
        </header>
        {runs.length ? (
          <div className="modeling-run-table" role="table">
            {runs.map((run) => (
              <div key={run.id} className="modeling-run-row" role="row">
                <span className="modeling-run-row__pulse" />
                <button
                  type="button"
                  className="modeling-run-row__open"
                  onClick={() => {
                    setResult(run.result);
                    setResultModelSnapshot(
                      run.modelSnapshot ? structuredClone(run.modelSnapshot) : null,
                    );
                  }}
                >
                  <span>
                    <strong>{localizedRunName(run, t)}</strong>
                    <small>{new Date(run.createdAt).toLocaleString(i18n.language)}</small>
                  </span>
                </button>
                <span>
                  {t('modeling.runTopology', { nodes: run.nodeCount, edges: run.edgeCount })}
                </span>
                <span>{t(`modeling.parameterStatuses.${run.result.parameterStatus}`)}</span>
                <strong>{(run.result.outputValue * 100).toFixed(1)}%</strong>
                <span>{t(`modeling.bands.${run.result.outputBand}`)}</span>
                <button
                  className="modeling-run-row__restore"
                  type="button"
                  disabled={!run.modelSnapshot}
                  onClick={() => restoreRun(run)}
                >
                  {t('modeling.restoreRun')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="modeling-runs__empty">
            <Icon name="history" />
            <span>{t('modeling.noRuns')}</span>
          </div>
        )}
      </section>

      {reverseDialogOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            data-reverse-status={reverseStatus}
            className="modeling-reverse-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modeling-reverse-dialog-title"
          >
            <header>
              <div>
                <p className="panel-kicker">{t('modeling.reverseKicker')}</p>
                <h2 id="modeling-reverse-dialog-title">{t('modeling.reverseTitle')}</h2>
                <p>{t('modeling.reverseText')}</p>
              </div>
              <button
                className="dialog-close"
                type="button"
                aria-label={t('common.close')}
                onClick={() => setReverseDialogOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="modeling-reverse-steps" aria-label={t('modeling.reverseStepsTitle')}>
              {(['goal', 'compare', 'verify'] as const).map((step, index) => (
                <article key={step}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{t(`modeling.reverseSteps.${step}.title`)}</strong>
                    <p>{t(`modeling.reverseSteps.${step}.text`)}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="modeling-reverse-controls">
              <div className="modeling-reverse-target-source">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => setDetectionPickerMode('reverse-target')}
                >
                  <Icon name="history" size={16} />
                  {t('modeling.useDetectionTarget')}
                </button>
                {reverseTargetReference ? (
                  <div className="modeling-reverse-target-reference">
                    <span>{t('modeling.reverseTargetSource')}</span>
                    <strong>{reverseTargetReference.sampleId}</strong>
                    <small>
                      {t(`modeling.detectionPicker.status.${reverseTargetReference.mappingStatus}`)}
                    </small>
                  </div>
                ) : (
                  <span>{t('modeling.manualReverseTarget')}</span>
                )}
              </div>
              <label className="parameter-field">
                <span>
                  <strong>{t('modeling.reverseTarget')}</strong>
                  <output>{reverseTarget.toFixed(2)}</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={reverseTarget}
                  onChange={(event) => {
                    setReverseTarget(Number(event.target.value));
                    setReverseTargetReference(null);
                  }}
                />
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={reverseTarget}
                  onChange={(event) => {
                    setReverseTarget(Math.max(0, Math.min(1, Number(event.target.value))));
                    setReverseTargetReference(null);
                  }}
                />
              </label>
              <button className="button button--primary" type="button" onClick={runReverseDesign}>
                <Icon name="play" size={16} />
                {t('modeling.findCandidates')}
              </button>
            </div>
            <div className="modeling-reverse-results">
              {reverseCandidates.length ? (
                reverseCandidates.map((candidate, index) => (
                  <article
                    key={candidate.id}
                    className={`modeling-reverse-candidate${index === 0 ? ' is-best' : ''}`}
                  >
                    <span className="modeling-reverse-candidate__rank">
                      <b>{String(index + 1).padStart(2, '0')}</b>
                      {index === 0 ? <i>{t('modeling.recommendedCandidate')}</i> : null}
                    </span>
                    <div className="modeling-reverse-candidate__output">
                      <small>{t('modeling.candidateOutput')}</small>
                      <strong>{(candidate.outputValue * 100).toFixed(1)}%</strong>
                      <span>{t(`modeling.bands.${candidate.outputBand}`)}</span>
                    </div>
                    <div className="modeling-reverse-candidate__inputs">
                      <strong>{t('modeling.candidateInputs')}</strong>
                      <dl>
                        {model.nodes
                          .filter(
                            (node) =>
                              node.kind === 'input' && candidate.inputs[node.id] !== undefined,
                          )
                          .map((node) => (
                            <div key={node.id}>
                              <dt>{node.name}</dt>
                              <dd>
                                {formatReverseCandidateInput(node.id, candidate.inputs[node.id])}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    </div>
                    <small>
                      {t('modeling.targetDistance')}: {candidate.distance.toFixed(3)}
                    </small>
                    <button
                      className={`button ${index === 0 ? 'button--primary' : 'button--secondary'}`}
                      type="button"
                      aria-label={t('modeling.candidateLabel', { rank: index + 1 })}
                      onClick={() => applyReverseCandidate(candidate)}
                    >
                      {t('modeling.applyCandidate')}
                    </button>
                    <span className="modeling-reverse-candidate__effect">
                      {t('modeling.applyCandidateEffect')}
                    </span>
                  </article>
                ))
              ) : (
                <div className="modeling-reverse-empty">{t('modeling.reverseEmpty')}</div>
              )}
            </div>
            <footer>{t('modeling.reverseBoundary')}</footer>
          </section>
        </div>
      ) : null}

      {partDialogOpen && selectedNode ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="modeling-part-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modeling-part-dialog-title"
          >
            <header>
              <div>
                <p className="panel-kicker">{t('modeling.partLibraryKicker')}</p>
                <h2 id="modeling-part-dialog-title">{t('modeling.partLibraryTitle')}</h2>
                <p>{t('modeling.partLibraryText', { node: selectedNode.name })}</p>
              </div>
              <button
                className="dialog-close"
                type="button"
                aria-label={t('common.close')}
                onClick={() => setPartDialogOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="modeling-part-grid">
              {compatibleParts(selectedNode.kind).map((part) => (
                <article
                  key={part.id}
                  className="modeling-part-card"
                  style={{ '--part-color': part.tint } as React.CSSProperties}
                >
                  <span className="modeling-part-card__glyph" aria-hidden="true">
                    <i />
                  </span>
                  <div>
                    <span className="modeling-part-card__status">
                      {t(`modeling.partStatus.${part.evidenceStatus}`)}
                    </span>
                    <h3>{t(part.nameKey)}</h3>
                    <p>{t(part.descriptionKey)}</p>
                    <small>{t(part.sourceKey)}</small>
                  </div>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={(event) => {
                      const source =
                        event.currentTarget
                          .closest('.modeling-part-card')
                          ?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
                      replaceSelectedPart(part, source);
                    }}
                  >
                    {t('modeling.replacePart')}
                  </button>
                </article>
              ))}
            </div>
            <footer>
              <span>{t('modeling.partLibraryBoundary')}</span>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setPartDialogOpen(false)}
              >
                {t('common.close')}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <ReleaseCatalogDialog
        open={catalogDialogOpen}
        presentation={releaseCatalogPresentation}
        triggerRef={catalogTriggerRef}
        onClose={() => setCatalogDialogOpen(false)}
        onApply={applySelectedReleaseResponse}
        onAttachCitation={attachSelectedReleaseCitation}
        onDetach={detachSelectedCatalog}
        {...(selectedNode ? { selectedNodeName: selectedNode.name } : {})}
        {...(selectedNode?.catalogReference
          ? { selectedReference: selectedNode.catalogReference }
          : {})}
      />

      <DetectionModelingPicker
        open={detectionPickerMode !== null}
        mode={detectionPickerMode ?? 'reverse-target'}
        records={history}
        networkId={model.id}
        initialRecordId={
          detectionPickerMode === 'network-validation'
            ? (activeValidationReference?.recordId ?? null)
            : (reverseTargetReference?.recordId ?? null)
        }
        onClose={() => setDetectionPickerMode(null)}
        onConfirm={confirmDetectionModelingReference}
      />

      <PartTransferGhost transfer={partTransfer} />
    </div>
  );
}

function BoundResponseInspector({
  binding,
  componentName,
  onAddInput,
  onAddOutput,
}: BoundResponseInspectorProps & {
  componentName: string;
  onAddInput: () => void;
  onAddOutput: () => void;
}) {
  const { t } = useTranslation();
  const parameters = binding.originalParameters;
  const format = (value: number): string =>
    Math.abs(value) > 0 && Math.abs(value) < 0.01 ? value.toExponential(2) : value.toFixed(3);
  const fact = (label: string, value: string, key: string) =>
    createElement(
      'div',
      { key },
      createElement('dt', null, label),
      createElement('dd', { title: value }, value),
    );
  const facts = [
    fact(t('modeling.releaseCatalog.responseId'), binding.receiverResponseId, 'response'),
    fact(
      t('modeling.releaseCatalog.signalRoute'),
      binding.inputSignalId + ' → ' + binding.outputSignalId,
      'route',
    ),
    fact(t('modeling.releaseCatalog.parameterContext'), binding.parameterContextId, 'context'),
    fact(t('modeling.releaseCatalog.ec50'), format(parameters.ec50) + ' M', 'ec50'),
    fact(t('modeling.releaseCatalog.hill'), format(parameters.hillCoefficient), 'hill'),
    fact(
      t('modeling.releaseCatalog.range'),
      format(binding.workingRange.min) + '–' + format(binding.workingRange.max) + ' M',
      'range',
    ),
    fact(t('modeling.releaseCatalog.unit'), binding.inputUnit, 'unit'),
    fact(t('modeling.releaseCatalog.sources'), String(binding.sourceIds.length), 'sources'),
  ];
  return createElement(
    'div',
    { className: 'modeling-form modeling-bound-response-inspector' },
    createElement(
      'div',
      { className: 'modeling-bound-response-inspector__hero' },
      createElement(
        'p',
        { className: 'panel-kicker' },
        t('modeling.releaseCatalog.boundResponseKicker'),
      ),
      createElement('h3', null, componentName),
      createElement('span', null, t('modeling.releaseCatalog.boundResponseReadOnly')),
    ),
    createElement('dl', { className: 'modeling-bound-response-facts' }, facts),
    createElement(
      'p',
      { className: 'modeling-bound-response-boundary' },
      t('modeling.releaseCatalog.normalizedDemoBoundary'),
    ),
    createElement(
      'button',
      { className: 'button button--secondary button--wide', type: 'button', onClick: onAddInput },
      createElement(Icon, { name: 'plus', size: 16 }),
      t('modeling.releaseCatalog.addMatchingInput'),
    ),
    createElement(
      'button',
      { className: 'button button--secondary button--wide', type: 'button', onClick: onAddOutput },
      createElement(Icon, { name: 'plus', size: 16 }),
      t('modeling.releaseCatalog.addMatchingOutput'),
    ),
    createElement(
      'p',
      { className: 'modeling-bound-response-hint' },
      t('modeling.releaseCatalog.manualDragHint'),
    ),
  );
}

interface ParameterFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

interface ConcentrationParameterFieldProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function ConcentrationParameterField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: ConcentrationParameterFieldProps) {
  const positiveMax = Math.max(max, Number.MIN_VALUE);
  const positiveMin =
    min > 0 ? Math.min(min, positiveMax) : Math.max(positiveMax * 1e-6, Number.MIN_VALUE);
  const logMin = Math.log10(positiveMin);
  const logSpan = Math.max(Math.log10(positiveMax) - logMin, Number.EPSILON);
  const clampedValue = value <= 0 ? 0 : Math.min(positiveMax, Math.max(positiveMin, value));
  const sliderValue =
    clampedValue === 0 ? 0 : 1 + (99 * (Math.log10(clampedValue) - logMin)) / logSpan;

  const updateFromSlider = (position: number): void => {
    if (position < 1) {
      onChange(0);
      return;
    }
    const exponent = logMin + ((position - 1) / 99) * logSpan;
    onChange(10 ** exponent);
  };

  return (
    <label className="parameter-field concentration-parameter-field">
      <span>
        <strong>{label}</strong>
        <output>{clampedValue === 0 ? '0' : clampedValue.toExponential(2)}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={100}
        step={1}
        value={sliderValue}
        onChange={(event) => updateFromSlider(Number(event.target.value))}
      />
      <input
        type="number"
        aria-label={label}
        min={0}
        max={positiveMax}
        step="any"
        value={clampedValue}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      <small className="concentration-parameter-field__hint">{hint}</small>
    </label>
  );
}

function ParameterField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
}: ParameterFieldProps) {
  return (
    <label className="parameter-field">
      <span>
        <strong>{label}</strong>
        <output>{formatValue?.(value) ?? value.toFixed(step < 0.1 ? 2 : 1)}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </label>
  );
}
