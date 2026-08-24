import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { BoundaryNotice } from '../../components/BoundaryNotice';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { StatusPill } from '../../components/StatusPill';
import { ValidationSummary } from '../../components/ValidationSummary';
import { BfnNetworkCanvas } from './BfnNetworkCanvas';
import { BfnResponseChart } from './BfnResponseChart';
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
  bfnContextValueLabel,
  bfnDesignVariableLabel,
  bfnEntityLabel,
  bfnPortLabel,
  bfnQuantityLabel,
  bfnUnitLabel,
} from './presentation';
import { defaultBfnReverseTarget, runBfnReverseDesign } from './reverseDesign';
import { runBfnSimulation } from './simulation';
import type {
  BfnDynamicInputSpecification,
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

type BfnWorkspaceView = 'network' | 'analysis' | 'inverse' | 'evidence';
type DestructiveAction = 'reset-project' | 'remove-module' | 'remove-edge' | 'clear-runs';

const workspaceViews: BfnWorkspaceView[] = ['network', 'analysis', 'inverse', 'evidence'];

interface EndpointOption {
  value: string;
  endpoint: BfnIdealEdgeEndpoint;
  label: string;
}

interface ParameterRow {
  label: string;
  estimate: BfnParameterEstimate;
}

function endpointValue(endpoint: BfnIdealEdgeEndpoint): string {
  return `${endpoint.nodeId}::${endpoint.portId}`;
}

function parseEndpoint(value: string): BfnIdealEdgeEndpoint | null {
  const [nodeId, portId, ...rest] = value.split('::');
  return nodeId && portId && rest.length === 0 ? { nodeId, portId } : null;
}

function displayNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) > 0 && Math.abs(value) < 0.001) return value.toExponential(2);
  return value.toFixed(digits);
}

function parameterRows(model: BfnModelVariant | null, t: TFunction): ParameterRow[] {
  if (!model) return [];
  const response = model.mode === 'static' ? model.response : model.steadyStateResponse;
  const rows: ParameterRow[] = [];
  if (response.family === 'hill_activation' || response.family === 'hill_repression') {
    rows.push(
      { label: t('bfn.parameters.minimumResponse'), estimate: response.ymin },
      { label: t('bfn.parameters.maximumResponse'), estimate: response.ymax },
      { label: t('bfn.parameters.halfResponse'), estimate: response.k },
      { label: t('bfn.parameters.hillCoefficient'), estimate: response.n },
    );
  } else if (response.family === 'linear_transfer') {
    rows.push(
      { label: t('bfn.parameters.responseScale'), estimate: response.scale },
      { label: t('bfn.parameters.baseResponse'), estimate: response.intercept },
    );
  } else if (response.family === 'independent_inputs') {
    rows.push(
      { label: t('bfn.parameters.baseResponse'), estimate: response.basal },
      { label: t('bfn.parameters.maximumResponse'), estimate: response.outputMaximum },
      ...response.terms.flatMap((term, index) => [
        { label: `K${index + 1}`, estimate: term.k },
        { label: `n${index + 1}`, estimate: term.n },
        { label: `α${index + 1}`, estimate: term.contribution },
      ]),
    );
  }
  if (model.mode === 'dynamic')
    rows.push({ label: t('bfn.parameters.responseTimeConstant'), estimate: model.tau });
  return rows;
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
  const option = (nodeId: string, port: BfnPort): EndpointOption => ({
    value: endpointValue({ nodeId, portId: port.id }),
    endpoint: { nodeId, portId: port.id },
    label: nodeLabel(project, nodeId, t) + ' · ' + bfnPortLabel(port, t),
  });
  return {
    outputs: [
      ...project.network.inputSources.map((source) => option(source.id, source.outputPort)),
      ...project.network.modules.flatMap((module) =>
        module.outputPorts.map((port) => option(module.id, port)),
      ),
    ],
    inputs: [
      ...project.network.modules.flatMap((module) =>
        module.inputPorts.map((port) => option(module.id, port)),
      ),
      ...project.network.outputMonitors.map((monitor) => option(monitor.id, monitor.inputPort)),
    ],
  };
}

function currentOutput(result: BfnSimulationResult | null): number | null {
  return result?.points.at(-1)?.output ?? null;
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

function configuredInputRange(project: BfnProject, t: TFunction): string {
  const source = project.network.inputSources[0];
  if (!source) return '—';
  if (project.network.mode === 'dynamic') {
    return '0–' + project.analysis.durationHours + ' h';
  }
  const specification = source.staticSpecification;
  const unit = bfnUnitLabel(specification.unit, t);
  return specification.type === 'working_range'
    ? specification.minimum + '–' + specification.maximum + ' ' + unit
    : specification.value + ' ' + unit;
}

export function BfnPlatformPage() {
  const { t, i18n } = useTranslation();
  const [project, setProject] = useState<BfnProject>(
    () => loadBfnProject() ?? createDemoBfnProject(),
  );
  const [view, setView] = useState<BfnWorkspaceView>('network');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    project.network.modules[0]?.id ?? null,
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [sourceEndpointValue, setSourceEndpointValue] = useState('');
  const [targetEndpointValue, setTargetEndpointValue] = useState('');
  const [result, setResult] = useState<BfnSimulationResult | null>(null);
  const [runs, setRuns] = useState(loadBfnRuns);
  const [reverseTarget, setReverseTarget] = useState<BfnReverseTarget>(() =>
    structuredClone(defaultBfnReverseTarget),
  );
  const [reverseCandidates, setReverseCandidates] = useState<BfnReverseDesignCandidate[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [pendingDestructiveAction, setPendingDestructiveAction] =
    useState<DestructiveAction | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveBfnProject(project);
  }, [project]);

  const validationIssues = useMemo(() => validateBfnProject(project), [project]);
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

  const updateProject = (updater: (current: BfnProject) => BfnProject): void => {
    setProject((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
    setResult(null);
    setNotice(null);
    setErrorNotice(null);
  };

  const updateSource = (
    sourceId: string,
    updater: (
      source: BfnProject['network']['inputSources'][number],
    ) => BfnProject['network']['inputSources'][number],
  ): void => {
    updateProject((current) => ({
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
    if (mode === project.network.mode) return;
    updateProject((current) => ({
      ...current,
      network: { ...current.network, mode },
    }));
    setNotice(t('bfn.notices.modeChanged'));
  };

  const runSimulation = (): void => {
    try {
      const next = runBfnSimulation(project);
      setResult(next);
      setRuns(saveBfnRun(next));
      setView('analysis');
      setNotice(t(simulationNoticeKey(project), { count: next.points.length }));
      setErrorNotice(null);
    } catch (error) {
      setErrorNotice(
        error instanceof Error && error.message.includes('BFN_VALIDATION_FAILED')
          ? t('bfn.notices.validationBlocked')
          : t('bfn.notices.runFailed'),
      );
    }
  };

  const createConnection = (): void => {
    if (
      !sourceEndpoint ||
      !targetEndpoint ||
      draftIssues.some((issue) => issue.severity === 'error')
    ) {
      setErrorNotice(t('bfn.notices.connectionBlocked'));
      return;
    }
    const id = `edge-${Date.now()}`;
    const sourceLabel = options.outputs.find((entry) => entry.value === sourceEndpointValue)?.label;
    const targetLabel = options.inputs.find((entry) => entry.value === targetEndpointValue)?.label;
    updateProject((current) => addIdealConnection(current, sourceEndpoint, targetEndpoint, id));
    setSelectedNodeId(null);
    setSelectedEdgeId(id);
    setSourceEndpointValue('');
    setTargetEndpointValue('');
    setNotice(
      t('bfn.notices.connectionCreated', {
        source: sourceLabel ?? t('bfn.connections.source'),
        target: targetLabel ?? t('bfn.connections.target'),
      }),
    );
  };

  const commitRemoveSelectedEdge = (): void => {
    if (!selectedEdge) return;
    updateProject((current) => ({
      ...current,
      network: {
        ...current.network,
        edges: current.network.edges.filter((edge) => edge.id !== selectedEdge.id),
      },
    }));
    setSelectedEdgeId(null);
    setNotice(t('bfn.notices.connectionRemoved'));
  };

  const addCatalogModule = (catalogId: BfnCatalogModuleId): void => {
    const suffix = `${Date.now()}`;
    const module = createCatalogModule(catalogId, suffix);
    const moduleIndex = project.network.modules.length;
    module.position = {
      x: 250 + (moduleIndex % 3) * 205,
      y: 286 + Math.floor(moduleIndex / 3) * 126,
    };
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
      contextId: project.registry.contexts[0]?.id ?? 'ctx-demo-ecoli',
    };
    updateProject((current) => ({
      ...current,
      network: { ...current.network, modules: [...current.network.modules, module] },
      registry: {
        ...current.registry,
        validityDomains: [...current.registry.validityDomains, domain],
      },
    }));
    setSelectedNodeId(module.id);
    setSelectedEdgeId(null);
    setView('network');
    setNotice(t('bfn.notices.moduleAdded'));
  };

  const commitRemoveSelectedModule = (): void => {
    if (!selectedModule) return;
    updateProject((current) => ({
      ...current,
      network: {
        ...current.network,
        modules: current.network.modules.filter((module) => module.id !== selectedModule.id),
        edges: current.network.edges.filter(
          (edge) =>
            edge.source.nodeId !== selectedModule.id && edge.target.nodeId !== selectedModule.id,
        ),
      },
    }));
    setSelectedNodeId(null);
    setNotice(t('bfn.notices.moduleRemoved'));
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
      setProject(imported);
      setResult(null);
      setSelectedNodeId(imported.network.modules[0]?.id ?? null);
      setSelectedEdgeId(null);
      setNotice(t('bfn.notices.imported'));
      setErrorNotice(null);
    } catch {
      setErrorNotice(t('bfn.notices.importFailed'));
    }
  };

  const commitResetProject = (): void => {
    const next = createDemoBfnProject(new Date().toISOString());
    setProject(next);
    localStorage.setItem(BFN_PROJECT_STORAGE_KEY, JSON.stringify(next));
    clearBfnRuns();
    setRuns([]);
    setResult(null);
    setSelectedNodeId(next.network.modules[0]?.id ?? null);
    setSelectedEdgeId(null);
    setReverseCandidates([]);
    setNotice(t('bfn.notices.reset'));
    setErrorNotice(null);
  };

  const runReverse = (): void => {
    const candidates = runBfnReverseDesign(project, reverseTarget);
    setReverseCandidates(candidates);
    setNotice(t('bfn.notices.reverseCompleted', { count: candidates.length }));
  };

  const commitClearRuns = (): void => {
    clearBfnRuns();
    setRuns([]);
    setNotice(t('bfn.notices.runsCleared'));
  };

  const confirmation =
    pendingDestructiveAction === 'remove-module'
      ? {
          title: t('bfn.confirmations.removeModule.title'),
          description: t('bfn.confirmations.removeModule.description', {
            name: selectedModule ? t(selectedModule.labelKey) : '',
            count: selectedModule
              ? project.network.edges.filter(
                  (edge) =>
                    edge.source.nodeId === selectedModule.id ||
                    edge.target.nodeId === selectedModule.id,
                ).length
              : 0,
          }),
          recoverability: t('bfn.confirmations.removeModule.recoverability'),
          confirmLabel: t('bfn.confirmations.removeModule.confirm'),
          cancelLabel: t('bfn.confirmations.removeModule.cancel'),
        }
      : pendingDestructiveAction === 'remove-edge'
        ? {
            title: t('bfn.confirmations.removeEdge.title'),
            description: t('bfn.confirmations.removeEdge.description', {
              source: selectedEdge ? nodeLabel(project, selectedEdge.source.nodeId, t) : '',
              target: selectedEdge ? nodeLabel(project, selectedEdge.target.nodeId, t) : '',
            }),
            recoverability: t('bfn.confirmations.removeEdge.recoverability'),
            confirmLabel: t('bfn.confirmations.removeEdge.confirm'),
            cancelLabel: t('bfn.confirmations.removeEdge.cancel'),
          }
        : pendingDestructiveAction === 'clear-runs'
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
      case 'remove-module':
        commitRemoveSelectedModule();
        break;
      case 'remove-edge':
        commitRemoveSelectedEdge();
        break;
      case 'clear-runs':
        commitClearRuns();
        break;
    }
    setPendingDestructiveAction(null);
  };

  return (
    <div className="page page--bfn">
      <PageHeader
        title={t('modeling.title')}
        subtitle={t('bfn.subtitle')}
        meta={<StatusPill label={t('bfn.status.demoProject')} tone="warning" />}
        actions={
          <Button
            variant="tertiary"
            leadingIcon={<Icon name="export" size={16} />}
            onClick={exportProject}
          >
            {t('bfn.actions.export')}
          </Button>
        }
      />

      <nav className="bfn-workflow" role="tablist" aria-label={t('bfn.workflow.label')}>
        {workspaceViews.map((workspaceView) => (
          <button
            key={workspaceView}
            type="button"
            role="tab"
            aria-selected={view === workspaceView}
            className={view === workspaceView ? 'is-active' : ''}
            onClick={() => setView(workspaceView)}
          >
            <strong>{t(`bfn.workflow.${workspaceView}.title`)}</strong>
            <small>{t(`bfn.workflow.${workspaceView}.description`)}</small>
          </button>
        ))}
      </nav>

      <div className="bfn-toolbar">
        <div className="bfn-mode-switch" role="group" aria-label={t('bfn.analysis.networkMode')}>
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
        <div className="bfn-file-actions">
          <button type="button" onClick={() => importRef.current?.click()}>
            <Icon name="import" size={15} />
            {t('bfn.actions.import')}
          </button>
          <input
            ref={importRef}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            aria-label={t('bfn.actions.import')}
            onChange={(event) => void importProject(event.target.files?.[0])}
          />
          <details className="bfn-more-actions">
            <summary>{t('bfn.actions.more')}</summary>
            <button
              className="danger-text-button"
              type="button"
              onClick={() => setPendingDestructiveAction('reset-project')}
            >
              <Icon name="reset" size={15} />
              {t('bfn.actions.reset')}
            </button>
          </details>
        </div>
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

      {view === 'network' ? (
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
                    onClick={() => {
                      setSelectedNodeId(source.id);
                      setSelectedEdgeId(null);
                    }}
                  >
                    <span data-kind="source">{t('bfn.nodeKinds.input')}</span>
                    <strong>{t(source.labelKey)}</strong>
                    <small>{bfnPortLabel(source.outputPort, t)}</small>
                  </button>
                ))}
              </section>
              <section className="bfn-network-index__group">
                <h3>{t('bfn.nodeKinds.module')}</h3>
                {project.network.modules.map((module) => (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => {
                      setSelectedNodeId(module.id);
                      setSelectedEdgeId(null);
                    }}
                  >
                    <span data-kind="module">{t('bfn.nodeKinds.module')}</span>
                    <strong>{t(module.labelKey)}</strong>
                    <small>
                      {module.inputPorts[0] ? bfnEntityLabel(module.inputPorts[0].entity, t) : '—'}{' '}
                      →{' '}
                      {module.outputPorts[0]
                        ? bfnEntityLabel(module.outputPorts[0].entity, t)
                        : '—'}
                    </small>
                  </button>
                ))}
                <button
                  className="bfn-catalog-shortcut"
                  type="button"
                  onClick={() => setView('evidence')}
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
                    onClick={() => {
                      setSelectedNodeId(monitor.id);
                      setSelectedEdgeId(null);
                    }}
                  >
                    <span data-kind="monitor">{t('bfn.nodeKinds.output')}</span>
                    <strong>{t(monitor.labelKey)}</strong>
                    <small>{bfnPortLabel(monitor.inputPort, t)}</small>
                  </button>
                ))}
              </section>
            </div>
            <section className="bfn-connection-builder" aria-label={t('bfn.connections.builder')}>
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
          </aside>

          <section className="bfn-network-stage">
            <header className="bfn-section-heading">
              <div>
                <h2>{t(project.network.labelKey)}</h2>
              </div>
              <div className="bfn-stage-badges">
                <span>
                  {project.network.modules.length} {t('bfn.canvas.modules')}
                </span>
                <span>
                  {project.network.edges.length} {t('bfn.canvas.edges')}
                </span>
                <span>{t(`bfn.modes.${project.network.mode}`)}</span>
              </div>
            </header>
            <BfnNetworkCanvas
              project={project}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
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
              onMoveNode={(nodeId, position) =>
                setProject((current) => ({
                  ...current,
                  network: {
                    ...current.network,
                    inputSources: current.network.inputSources.map((node) =>
                      node.id === nodeId ? { ...node, position } : node,
                    ),
                    modules: current.network.modules.map((node) =>
                      node.id === nodeId ? { ...node, position } : node,
                    ),
                    outputMonitors: current.network.outputMonitors.map((node) =>
                      node.id === nodeId ? { ...node, position } : node,
                    ),
                  },
                  updatedAt: new Date().toISOString(),
                }))
              }
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
                    {[...selectedModule.inputPorts, ...selectedModule.outputPorts].map((port) => (
                      <dl className="bfn-port-fact" key={port.id} data-direction={port.direction}>
                        <div>
                          <dt>
                            {port.direction === 'input'
                              ? t('bfn.nodeKinds.input')
                              : t('bfn.nodeKinds.output')}
                          </dt>
                          <dd>{bfnEntityLabel(port.entity, t)}</dd>
                        </div>
                        <div>
                          <dt>{t('bfn.inspector.measurement')}</dt>
                          <dd>{bfnQuantityLabel(port.quantityType, t)}</dd>
                        </div>
                        <div>
                          <dt>{t('bfn.inspector.unit')}</dt>
                          <dd>{bfnUnitLabel(port.unit, t)}</dd>
                        </div>
                      </dl>
                    ))}
                  </section>
                  <section className="bfn-inspector-block">
                    <header>
                      <strong>{t('bfn.inspector.responseParameters')}</strong>
                    </header>
                    <dl className="bfn-parameter-grid">
                      {parameterRows(selectedModuleModel, t).map((row) => (
                        <div key={row.label}>
                          <dt>{row.label}</dt>
                          <dd>{parameterValue(row.estimate, t, false)}</dd>
                        </div>
                      ))}
                    </dl>
                    {selectedModuleModel?.mode === 'static' &&
                    selectedModuleModel.response.family === 'independent_inputs' ? (
                      <BoundaryNotice
                        kind="assumption"
                        title={t('bfn.assumptions.independentTitle')}
                      >
                        {t('bfn.assumptions.independentUnverified')}
                      </BoundaryNotice>
                    ) : null}
                  </section>
                  <section className="bfn-inspector-block">
                    <header>
                      <strong>{t('bfn.inspector.experimentContext')}</strong>
                    </header>
                    {selectedContext ? (
                      <dl className="bfn-context-grid">
                        <div>
                          <dt>{t('bfn.context.host')}</dt>
                          <dd>{selectedContext.host}</dd>
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
                  </section>
                  <section className="bfn-inspector-block">
                    <header>
                      <strong>{t('bfn.inspector.parameterSource')}</strong>
                    </header>
                    <div className="bfn-evidence-banner" data-grade={selectedModule.evidenceGrade}>
                      <span>{t('bfn.inspector.evidenceGrade')}</span>
                      <strong>{t(`bfn.evidence.${selectedModule.evidenceGrade}`)}</strong>
                    </div>
                  </section>
                  <details className="bfn-inspector-details">
                    <summary>{t('bfn.inspector.showMath')}</summary>
                    <code className="bfn-formula">{formulaForModel(selectedModuleModel)}</code>
                    <dl className="bfn-parameter-grid">
                      {parameterRows(selectedModuleModel, t).map((row) => (
                        <div key={row.label}>
                          <dt>{row.label}</dt>
                          <dd>{parameterValue(row.estimate, t)}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="bfn-domain-range">
                      {t('bfn.inspector.modelVersion')}: {selectedModuleModel?.version ?? '—'}
                    </p>
                  </details>
                  <details className="bfn-inspector-details">
                    <summary>{t('bfn.inspector.showAdvanced')}</summary>
                    <section>
                      <strong>{t('bfn.inspector.applicability')}</strong>
                      {selectedDomain?.inputRanges.map((range) => {
                        const port = [
                          ...selectedModule.inputPorts,
                          ...selectedModule.outputPorts,
                        ].find((entry) => entry.id === range.portId);
                        return (
                          <p key={range.portId} className="bfn-domain-range">
                            {port ? bfnEntityLabel(port.entity, t) : t('bfn.inspector.inputRange')}:{' '}
                            {range.minimum}–{range.maximum} {bfnUnitLabel(range.unit, t)}
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
                            <small>{t(`bfn.evidence.${implementation.evidenceGrade}`)}</small>
                          </div>
                        ))
                      ) : (
                        <p className="bfn-inspector-empty">{t('bfn.inspector.noImplementation')}</p>
                      )}
                    </section>
                  </details>
                  <button
                    className="danger-text-button"
                    type="button"
                    onClick={() => setPendingDestructiveAction('remove-module')}
                  >
                    <Icon name="trash" size={14} />
                    {t('bfn.actions.removeModule')}
                  </button>
                </>
              ) : selectedSource ? (
                <>
                  <section className="bfn-inspector-block bfn-inspector-block--source">
                    <header>
                      <strong>{t('bfn.inspector.inputDefinition')}</strong>
                    </header>
                    <dl className="bfn-context-grid">
                      <div>
                        <dt>{t('bfn.inspector.signal')}</dt>
                        <dd>{bfnEntityLabel(selectedSource.outputPort.entity, t)}</dd>
                      </div>
                      <div>
                        <dt>{t('bfn.inspector.measurement')}</dt>
                        <dd>{bfnQuantityLabel(selectedSource.outputPort.quantityType, t)}</dd>
                      </div>
                      <div>
                        <dt>{t('bfn.inspector.unit')}</dt>
                        <dd>{bfnUnitLabel(selectedSource.outputPort.unit, t)}</dd>
                      </div>
                      <div>
                        <dt>{t('bfn.inspector.analysisMode')}</dt>
                        <dd>{t(`bfn.modes.${project.network.mode}`)}</dd>
                      </div>
                    </dl>
                  </section>
                  <button
                    className="button button--secondary button--wide"
                    type="button"
                    onClick={() => setView('analysis')}
                  >
                    {t('bfn.inspector.configureInput')}
                  </button>
                </>
              ) : selectedMonitor ? (
                <section className="bfn-inspector-block">
                  <header>
                    <strong>{t('bfn.nodeKinds.outputMonitor')}</strong>
                  </header>
                  <p>{t('bfn.inspector.monitorText')}</p>
                  <dl className="bfn-port-fact">
                    <div>
                      <dt>{t('bfn.inspector.signal')}</dt>
                      <dd>{bfnEntityLabel(selectedMonitor.inputPort.entity, t)}</dd>
                    </div>
                    <div>
                      <dt>{t('bfn.inspector.measurement')}</dt>
                      <dd>{bfnQuantityLabel(selectedMonitor.inputPort.quantityType, t)}</dd>
                    </div>
                    <div>
                      <dt>{t('bfn.inspector.unit')}</dt>
                      <dd>{bfnUnitLabel(selectedMonitor.inputPort.unit, t)}</dd>
                    </div>
                  </dl>
                </section>
              ) : selectedEdge ? (
                <>
                  <p>{t('bfn.inspector.edgeText')}</p>
                  <dl className="bfn-edge-route">
                    <div>
                      <dt>{t('bfn.connections.source')}</dt>
                      <dd>
                        {nodeLabel(project, selectedEdge.source.nodeId, t)}
                        {selectedEdgeSourcePort
                          ? ' · ' + bfnPortLabel(selectedEdgeSourcePort, t)
                          : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('bfn.connections.target')}</dt>
                      <dd>
                        {nodeLabel(project, selectedEdge.target.nodeId, t)}
                        {selectedEdgeTargetPort
                          ? ' · ' + bfnPortLabel(selectedEdgeTargetPort, t)
                          : ''}
                      </dd>
                    </div>
                  </dl>
                  <button
                    className="danger-text-button"
                    type="button"
                    onClick={() => setPendingDestructiveAction('remove-edge')}
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

      {view === 'analysis' ? (
        <div className="bfn-analysis-workspace">
          <aside className="bfn-analysis-settings">
            <header className="bfn-section-heading">
              <div>
                <h2>{t('bfn.analysis.title')}</h2>
              </div>
            </header>
            {project.network.inputSources.map((source) => (
              <section className="bfn-input-card" key={source.id}>
                <header>
                  <div>
                    <strong>{t(source.labelKey)}</strong>
                  </div>
                  <span>{bfnPortLabel(source.outputPort, t)}</span>
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
                      updateProject((current) => ({
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
                      updateProject((current) => ({
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
              {t(simulationActionKey(project))}
            </Button>
          </aside>

          <main className="bfn-analysis-results">
            <header className="bfn-section-heading">
              <div>
                <h2>{t('bfn.results.title')}</h2>
              </div>
              <StatusPill
                label={result ? t('bfn.results.complete') : t('bfn.results.awaiting')}
                tone={result ? 'success' : 'neutral'}
              />
            </header>
            <BfnResponseChart result={result} />
            {result ? (
              <>
                <div className="bfn-result-facts">
                  <article>
                    <span>{t('bfn.results.finalOutput')}</span>
                    <strong>{displayNumber(currentOutput(result) ?? 0)}</strong>
                    <small>
                      {bfnUnitLabel(
                        project.network.outputMonitors[0]?.inputPort.unit ?? 'dimensionless',
                        t,
                      )}
                    </small>
                  </article>
                  <article>
                    <span>{t('bfn.results.domainStatus')}</span>
                    <strong>
                      {result.extrapolated
                        ? t('bfn.results.extrapolated')
                        : t('bfn.results.inDomain')}
                    </strong>
                    <small>
                      {result.extrapolated
                        ? t('bfn.results.extrapolatedHint')
                        : t('bfn.results.inDomainHint')}
                    </small>
                  </article>
                  <article>
                    <span>{t('bfn.results.parameterRange')}</span>
                    <strong>{configuredInputRange(project, t)}</strong>
                    <small>{t('bfn.results.rangeHint')}</small>
                  </article>
                </div>
                {result.mode === 'static' ? (
                  <AnnResultCard result={result} />
                ) : (
                  <DynamicMetricsCard result={result} />
                )}
                <details className="bfn-result-details">
                  <summary>{t('bfn.results.showDetails')}</summary>
                  <dl>
                    <div>
                      <dt>{t('bfn.results.engineVersion')}</dt>
                      <dd>{result.engineVersion}</dd>
                    </div>
                    <div>
                      <dt>{t('bfn.results.modelVersion')}</dt>
                      <dd>{result.modelVersions.join(' · ')}</dd>
                    </div>
                    <div>
                      <dt>{t('bfn.results.computedPoints')}</dt>
                      <dd>{result.points.length}</dd>
                    </div>
                  </dl>
                </details>
              </>
            ) : null}
            <section className="bfn-run-history">
              <header>
                <div>
                  <h3>{t('bfn.runs.title')}</h3>
                </div>
                {runs.length ? (
                  <button
                    className="danger-text-button"
                    type="button"
                    onClick={() => setPendingDestructiveAction('clear-runs')}
                  >
                    {t('bfn.runs.clear')}
                  </button>
                ) : null}
              </header>
              {runs.length ? (
                runs.map((run) => (
                  <button key={run.id} type="button" onClick={() => setResult(run)}>
                    <span>{new Date(run.completedAt).toLocaleString(i18n.language)}</span>
                    <strong>{t(`bfn.modes.${run.mode}`)}</strong>
                    <code>{displayNumber(run.points.at(-1)?.output ?? 0)}</code>
                  </button>
                ))
              ) : (
                <p>{t('bfn.runs.empty')}</p>
              )}
            </section>
          </main>
        </div>
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
                      <span className="bfn-evidence-chip">
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
                          <dd>{bfnDesignVariableLabel(candidate.designVariables.copyNumber, t)}</dd>
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

      {view === 'evidence' ? (
        <div className="bfn-evidence-workspace">
          <section className="bfn-registry-catalog">
            <header className="bfn-section-heading">
              <div>
                <h2>{t('bfn.registry.title')}</h2>
              </div>
            </header>
            <div className="bfn-module-catalog">
              {bfnModuleCatalog.map((entry) => (
                <article key={entry.id}>
                  <div
                    className="bfn-module-catalog__curve"
                    data-family={entry.id}
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                  </div>
                  <h3>{t(entry.labelKey)}</h3>
                  <p>{t(entry.descriptionKey)}</p>
                  <dl>
                    <div>
                      <dt>{t('bfn.registry.modelFamily')}</dt>
                      <dd>{t(entry.familyKey)}</dd>
                    </div>
                    <div>
                      <dt>{t('bfn.registry.parameterSource')}</dt>
                      <dd>{t(entry.evidenceKey)}</dd>
                    </div>
                  </dl>
                  <button
                    className="button button--secondary button--wide"
                    type="button"
                    onClick={() => addCatalogModule(entry.id)}
                  >
                    <Icon name="plus" size={15} />
                    {t('bfn.registry.addToCanvas')}
                  </button>
                </article>
              ))}
            </div>
          </section>
          <aside className="bfn-evidence-ledger">
            <header className="bfn-section-heading">
              <div>
                <h2>{t('bfn.registry.ledgerTitle')}</h2>
              </div>
            </header>
            <section>
              <header>
                <Icon name="flask" size={15} />
                <strong>{t('bfn.registry.datasets')}</strong>
                <span>{project.registry.datasets.length}</span>
              </header>
              {project.registry.datasets.map((datasetEntry) => (
                <article key={datasetEntry.id}>
                  <strong>{t(datasetEntry.labelKey)}</strong>
                  <small>
                    {t('bfn.registry.doseResponse')} ·{' '}
                    {t('bfn.registry.replicates', { count: datasetEntry.replicates })}
                  </small>
                  <span>{t(`bfn.evidence.${datasetEntry.evidenceGrade}`)}</span>
                </article>
              ))}
            </section>
            <section>
              <header>
                <Icon name="overview" size={15} />
                <strong>{t('bfn.registry.contexts')}</strong>
                <span>{project.registry.contexts.length}</span>
              </header>
              {project.registry.contexts.map((context) => (
                <article key={context.id}>
                  <strong>{t(context.labelKey)}</strong>
                  <small>
                    {context.host} · {context.temperatureCelsius} °C
                  </small>
                  <span>{bfnContextValueLabel(context.medium, t)}</span>
                </article>
              ))}
            </section>
            <section>
              <header>
                <Icon name="check" size={15} />
                <strong>{t('bfn.registry.validityDomains')}</strong>
                <span>{project.registry.validityDomains.length}</span>
              </header>
              {project.registry.validityDomains.slice(0, 4).map((domain) => (
                <article key={domain.id}>
                  <strong>{t(domain.labelKey)}</strong>
                  <small>
                    {domain.inputRanges
                      .map(
                        (range) =>
                          `${range.minimum}–${range.maximum} ${bfnUnitLabel(range.unit, t)}`,
                      )
                      .join(' · ')}
                  </small>
                  <span>{t('bfn.registry.applicability')}</span>
                </article>
              ))}
            </section>
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

function AnnResultCard({ result }: { result: BfnSimulationResult }) {
  const { t } = useTranslation();
  const ann = result.annApproximation;
  if (!ann)
    return (
      <section className="bfn-ann-card bfn-ann-card--absent">
        <header>
          <strong>{t('bfn.ann.title')}</strong>
          <StatusPill label={t('bfn.ann.notGenerated')} tone="neutral" />
        </header>
        <p>{t('bfn.ann.fixedPointRule')}</p>
      </section>
    );
  const equation = `y ≈ ${ann.weights.map((weight, index) => `${displayNumber(weight)}x${index + 1}`).join(' + ')} + ${displayNumber(ann.effectiveIntercept)}`;
  return (
    <section className="bfn-ann-card" data-status={ann.status}>
      <header>
        <div>
          <h3>{t('bfn.ann.title')}</h3>
        </div>
        <StatusPill
          label={t(`bfn.ann.${ann.status}`)}
          tone={ann.status === 'accepted' ? 'success' : 'warning'}
        />
      </header>
      <p>{ann.status === 'accepted' ? t('bfn.ann.acceptedText') : t('bfn.ann.rejectedText')}</p>
      <details>
        <summary>{t('bfn.ann.showMetrics')}</summary>
        <p>
          {t('bfn.ann.method')}: {t('bfn.ann.methodValue')}
        </p>
        <code>{equation}</code>
        <dl>
          <div>
            <dt>R²</dt>
            <dd>{ann.metrics.r2.toFixed(4)}</dd>
          </div>
          <div>
            <dt>NRMSE</dt>
            <dd>{(ann.metrics.nrmse * 100).toFixed(2)}%</dd>
          </div>
          <div>
            <dt>{t('bfn.ann.maxError')}</dt>
            <dd>{ann.metrics.maximumAbsoluteError.toFixed(4)}</dd>
          </div>
          <div>
            <dt>{t('bfn.ann.coverage')}</dt>
            <dd>{(ann.metrics.predictionIntervalCoverage * 100).toFixed(1)}%</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

function DynamicMetricsCard({ result }: { result: BfnSimulationResult }) {
  const { t } = useTranslation();
  const metrics = result.dynamicMetrics;
  if (!metrics) return null;
  return (
    <section className="bfn-dynamic-metrics">
      <header>
        <h3>{t('bfn.dynamic.title')}</h3>
      </header>
      <dl>
        <div>
          <dt>{t('bfn.dynamic.steady')}</dt>
          <dd>{metrics.steadyValue.toFixed(3)}</dd>
        </div>
        <div>
          <dt>{t('bfn.dynamic.riseTime')}</dt>
          <dd>{metrics.riseTimeHours === null ? '—' : `${metrics.riseTimeHours.toFixed(2)} h`}</dd>
        </div>
        <div>
          <dt>{t('bfn.dynamic.peak')}</dt>
          <dd>{metrics.peakValue.toFixed(3)}</dd>
        </div>
        <div>
          <dt>{t('bfn.dynamic.overshoot')}</dt>
          <dd>{(metrics.overshootFraction * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt>DC gain</dt>
          <dd>{metrics.dcGain === null ? '—' : metrics.dcGain.toFixed(4)}</dd>
        </div>
        <div>
          <dt>|G(jω)|</dt>
          <dd>
            {metrics.frequencyGain === null ? '—' : metrics.frequencyGain.magnitude.toFixed(4)}
          </dd>
        </div>
      </dl>
    </section>
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
