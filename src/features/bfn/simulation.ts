import { buildAnnApproximation } from './annApproximation';
import { evaluateBfnModuleModel } from './catalog/catalogBfnEvaluation';
import { bfnCatalogReferencePresence } from './catalog/catalogBfnTypes';
import { createBfnRunContextApplicabilitySnapshot } from './compatibility/contextIntegration';
import { resolveEffectiveBfnModel } from './modelResolution';
import { findBfnOutputReachableModuleIds } from './outputReachability';
import type { BfnParameterScenario } from './responseMath';
import type {
  BfnDynamicInputSpecification,
  BfnDynamicMetrics,
  BfnDynamicModel,
  BfnFunctionalModule,
  BfnModelVariant,
  BfnProject,
  BfnSimulationPoint,
  BfnSimulationResult,
  BfnStaticInputSpecification,
  BfnStaticModel,
  BfnValidationIssue,
} from './types';
import { convertUnit } from './unitSystem';
import { createBfnRunTemporalSnapshot } from './temporal/temporalRuntime';
import {
  resolveBfnPort,
  topologicalModuleOrder,
  validateBfnProject,
  valueAcrossEdge,
} from './validation';

const parameterScenarios: BfnParameterScenario[] = [
  'estimate',
  'lower',
  'upper',
  'low_output',
  'high_output',
];

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function valuesForStaticSpecification(specification: BfnStaticInputSpecification): number[] {
  if (specification.type === 'fixed_value') return [specification.value];
  const count = Math.max(2, Math.min(101, Math.round(specification.points)));
  const step = (specification.maximum - specification.minimum) / (count - 1);
  return Array.from({ length: count }, (_, index) => specification.minimum + step * index);
}

function cartesianProduct(entries: Array<[string, number[]]>): Array<Record<string, number>> {
  return entries.reduce<Array<Record<string, number>>>(
    (combinations, [sourceId, values]) =>
      combinations.flatMap((combination) =>
        values.map((value) => ({ ...combination, [sourceId]: value })),
      ),
    [{}],
  );
}

interface NetworkEvaluation {
  output: number;
  moduleOutputs: Record<string, number>;
  extrapolatedSubjects: string[];
}

function domainExtrapolation(
  project: BfnProject,
  module: BfnFunctionalModule,
  model: BfnModelVariant,
  inputs: Readonly<Record<string, number>>,
  timeHours?: number,
): boolean {
  const domain = project.registry.validityDomains.find(
    (candidate) => candidate.id === model.validityDomainId,
  );
  if (!domain) return true;
  const outsideInput = domain.inputRanges.some((range) => {
    const port = module.inputPorts.find((candidate) => candidate.id === range.portId);
    if (!port) return false;
    const value = inputs[port.id];
    if (value === undefined) return false;
    if (bfnCatalogReferencePresence(model).present && value === 0) return false;
    const comparable = convertUnit(value, port.unit, range.unit);
    return comparable < range.minimum || comparable > range.maximum;
  });
  const outsideTime =
    timeHours !== undefined && domain.timeRangeHours
      ? timeHours < domain.timeRangeHours[0] || timeHours > domain.timeRangeHours[1]
      : false;
  return outsideInput || outsideTime;
}

function resolveModuleInputs(
  project: BfnProject,
  module: BfnFunctionalModule,
  model: BfnModelVariant,
  valuesByPort: ReadonlyMap<string, number>,
): Record<string, number> {
  const inputs: Record<string, number> = {};
  const catalogBacked = bfnCatalogReferencePresence(model).present;
  for (const port of module.inputPorts) {
    const edge = project.network.edges.find(
      (candidate) =>
        candidate.enabled &&
        candidate.target.nodeId === module.id &&
        candidate.target.portId === port.id,
    );
    const sourceValue = edge ? valuesByPort.get(edge.source.portId) : undefined;
    if (edge && sourceValue !== undefined) {
      inputs[port.id] = valueAcrossEdge(sourceValue, project, edge);
    } else if (!catalogBacked) {
      inputs[port.id] = 0;
    }
  }
  return inputs;
}

function evaluateStaticNetwork(
  project: BfnProject,
  inputValues: Readonly<Record<string, number>>,
  scenario: BfnParameterScenario,
): NetworkEvaluation {
  const valuesByPort = new Map<string, number>();
  const moduleOutputs: Record<string, number> = {};
  const extrapolatedSubjects: string[] = [];
  for (const source of project.network.inputSources) {
    valuesByPort.set(source.outputPort.id, inputValues[source.id] ?? 0);
  }
  for (const module of topologicalModuleOrder(project)) {
    const model = resolveEffectiveBfnModel(project, module);
    if (!model) continue;
    const inputs = resolveModuleInputs(project, module, model, valuesByPort);
    const output = evaluateBfnModuleModel(project, module, model, inputs, scenario);
    moduleOutputs[module.id] = output;
    for (const port of module.outputPorts) valuesByPort.set(port.id, output);
    if (scenario === 'estimate' && domainExtrapolation(project, module, model, inputs)) {
      extrapolatedSubjects.push(module.id);
    }
  }
  const monitor = project.network.outputMonitors[0];
  if (!monitor) throw new Error('BFN_OUTPUT_MONITOR_MISSING');
  const edge = project.network.edges.find(
    (candidate) =>
      candidate.enabled &&
      candidate.target.nodeId === monitor.id &&
      candidate.target.portId === monitor.inputPort.id,
  );
  const sourceValue = edge ? valuesByPort.get(edge.source.portId) : undefined;
  const output =
    edge && sourceValue !== undefined ? valueAcrossEdge(sourceValue, project, edge) : 0;
  return { output, moduleOutputs, extrapolatedSubjects };
}

function staticSimulation(project: BfnProject): {
  points: BfnSimulationPoint[];
  extrapolatedSubjects: string[];
} {
  const entries = project.network.inputSources.map(
    (source) =>
      [source.id, valuesForStaticSpecification(source.staticSpecification)] as [string, number[]],
  );
  const combinations = cartesianProduct(entries);
  if (combinations.length > 2500) throw new Error('BFN_STATIC_GRID_TOO_LARGE');
  const primarySource = project.network.inputSources[0];
  const extrapolatedSubjects = new Set<string>();
  const points = combinations.map((inputs, index) => {
    const evaluations = parameterScenarios.map((scenario) =>
      evaluateStaticNetwork(project, inputs, scenario),
    );
    const estimate = evaluations[0]!;
    estimate.extrapolatedSubjects.forEach((subject) => extrapolatedSubjects.add(subject));
    const outputs = evaluations.map((evaluation) => evaluation.output);
    return {
      coordinate: primarySource ? (inputs[primarySource.id] ?? index) : index,
      inputs: { ...inputs },
      moduleOutputs: estimate.moduleOutputs,
      output: estimate.output,
      lower: Math.min(...outputs),
      upper: Math.max(...outputs),
      extrapolated: estimate.extrapolatedSubjects.length > 0,
    };
  });
  return { points, extrapolatedSubjects: [...extrapolatedSubjects] };
}

function dynamicInputValue(specification: BfnDynamicInputSpecification, timeHours: number): number {
  switch (specification.type) {
    case 'constant':
      return specification.value;
    case 'step':
      return timeHours < specification.atHours ? specification.before : specification.after;
    case 'pulse':
      return timeHours >= specification.startHours &&
        timeHours <= specification.startHours + specification.durationHours
        ? specification.baseline + specification.amplitude
        : specification.baseline;
    case 'periodic':
      return Math.max(
        0,
        specification.baseline +
          specification.amplitude *
            Math.sin(
              (2 * Math.PI * timeHours) / specification.periodHours + specification.phaseRadians,
            ),
      );
    case 'custom_time_series': {
      const first = specification.points[0];
      const last = specification.points.at(-1);
      if (!first || !last) return 0;
      if (timeHours <= first.timeHours) return first.value;
      if (timeHours >= last.timeHours) return last.value;
      const rightIndex = specification.points.findIndex((point) => point.timeHours >= timeHours);
      const right = specification.points[rightIndex];
      const left = specification.points[rightIndex - 1];
      if (!left || !right) return first.value;
      const ratio = (timeHours - left.timeHours) / (right.timeHours - left.timeHours);
      return left.value + ratio * (right.value - left.value);
    }
  }
}

function scenarioParameter(
  parameter: BfnDynamicModel['tau'],
  scenario: BfnParameterScenario,
): number {
  const [lower, upper] = parameter.interval95 ?? [parameter.value, parameter.value];
  if (scenario === 'lower' || scenario === 'high_output') return lower;
  if (scenario === 'upper' || scenario === 'low_output') return upper;
  return parameter.value;
}

interface DynamicScenarioPoint {
  timeHours: number;
  inputs: Record<string, number>;
  moduleOutputs: Record<string, number>;
  output: number;
  extrapolatedSubjects: string[];
}

function dynamicModuleOrder(project: BfnProject): BfnFunctionalModule[] {
  try {
    return topologicalModuleOrder(project);
  } catch {
    return project.network.modules;
  }
}

function simulateDynamicScenario(
  project: BfnProject,
  scenario: BfnParameterScenario,
): DynamicScenarioPoint[] {
  const duration = Math.max(0.1, project.analysis.durationHours);
  const step = Math.max(0.001, Math.min(project.analysis.timeStepHours, duration));
  const stepCount = Math.ceil(duration / step);
  const valuesByPort = new Map<string, number>();
  const stateByModule = new Map<string, number>();
  const modules = dynamicModuleOrder(project);
  for (const module of modules) {
    const model = resolveEffectiveBfnModel(project, module);
    if (model?.mode === 'dynamic') {
      stateByModule.set(module.id, model.initialState);
      module.outputPorts.forEach((port) => valuesByPort.set(port.id, model.initialState));
    }
  }
  const points: DynamicScenarioPoint[] = [];
  for (let index = 0; index <= stepCount; index += 1) {
    const timeHours = Math.min(duration, index * step);
    const previousTimeHours = index === 0 ? 0 : Math.min(duration, (index - 1) * step);
    const integrationStep = index === 0 ? 0 : timeHours - previousTimeHours;
    const inputsBySource: Record<string, number> = {};
    for (const source of project.network.inputSources) {
      const value = dynamicInputValue(source.dynamicSpecification, timeHours);
      inputsBySource[source.id] = value;
      valuesByPort.set(source.outputPort.id, value);
    }
    const moduleOutputs: Record<string, number> = {};
    const extrapolatedSubjects: string[] = [];
    for (const module of modules) {
      const model = resolveEffectiveBfnModel(project, module);
      if (!model) continue;
      const inputs = resolveModuleInputs(project, module, model, valuesByPort);
      const target = evaluateBfnModuleModel(project, module, model, inputs, scenario);
      const output =
        model.mode === 'dynamic'
          ? (() => {
              const previous = stateByModule.get(module.id) ?? model.initialState;
              const tau = Math.max(0.001, scenarioParameter(model.tau, scenario));
              const relaxation = 1 - Math.exp(-integrationStep / tau);
              const next = previous + relaxation * (target - previous);
              stateByModule.set(module.id, next);
              return next;
            })()
          : target;
      moduleOutputs[module.id] = output;
      module.outputPorts.forEach((port) => valuesByPort.set(port.id, output));
      if (
        scenario === 'estimate' &&
        domainExtrapolation(project, module, model, inputs, timeHours)
      ) {
        extrapolatedSubjects.push(module.id);
      }
    }
    const monitor = project.network.outputMonitors[0];
    if (!monitor) throw new Error('BFN_OUTPUT_MONITOR_MISSING');
    const monitorEdge = project.network.edges.find(
      (candidate) =>
        candidate.enabled &&
        candidate.target.nodeId === monitor.id &&
        candidate.target.portId === monitor.inputPort.id,
    );
    const monitorSource = monitorEdge ? valuesByPort.get(monitorEdge.source.portId) : undefined;
    const output =
      monitorEdge && monitorSource !== undefined
        ? valueAcrossEdge(monitorSource, project, monitorEdge)
        : 0;
    points.push({
      timeHours,
      inputs: inputsBySource,
      moduleOutputs,
      output,
      extrapolatedSubjects,
    });
  }
  return points;
}

function dynamicMetrics(
  project: BfnProject,
  points: readonly BfnSimulationPoint[],
): BfnDynamicMetrics {
  const outputs = points.map((point) => point.output);
  const initial = outputs[0] ?? 0;
  const steadyValue = outputs.at(-1) ?? 0;
  const peakValue = Math.max(...outputs);
  const peakIndex = outputs.indexOf(peakValue);
  const peakTimeHours = points[peakIndex]?.timeHours ?? 0;
  const target90 = initial + 0.9 * (steadyValue - initial);
  const risePoint = points.find((point) =>
    steadyValue >= initial ? point.output >= target90 : point.output <= target90,
  );
  let signChanges = 0;
  let previousSign = 0;
  for (let index = 1; index < outputs.length; index += 1) {
    const delta = (outputs[index] ?? 0) - (outputs[index - 1] ?? 0);
    const sign = Math.abs(delta) < 1e-5 ? 0 : Math.sign(delta);
    if (sign && previousSign && sign !== previousSign) signChanges += 1;
    if (sign) previousSign = sign;
  }
  const source = project.network.inputSources[0];
  const specification = source?.dynamicSpecification;
  let dcGain: number | null = null;
  let frequencyGain: BfnDynamicMetrics['frequencyGain'] = null;
  if (specification?.type === 'step') {
    const beforePoint = [...points]
      .reverse()
      .find((point) => (point.timeHours ?? 0) < specification.atHours);
    const denominator = specification.after - specification.before;
    if (beforePoint && Math.abs(denominator) > Number.EPSILON) {
      dcGain = (steadyValue - beforePoint.output) / denominator;
    }
  }
  if (specification?.type === 'periodic' && specification.amplitude > 0) {
    const tail = points.slice(Math.floor(points.length / 2));
    const tailOutputs = tail.map((point) => point.output);
    const outputAmplitude = (Math.max(...tailOutputs) - Math.min(...tailOutputs)) / 2;
    const outputPeak = tail.reduce(
      (best, point) => (point.output > best.output ? point : best),
      tail[0] ?? points[0]!,
    );
    const inputPeakTime =
      ((Math.PI / 2 - specification.phaseRadians) / (2 * Math.PI)) * specification.periodHours;
    const normalizedInputPeak =
      inputPeakTime +
      Math.round(((outputPeak.timeHours ?? 0) - inputPeakTime) / specification.periodHours) *
        specification.periodHours;
    const phaseDegrees =
      (-360 * ((outputPeak.timeHours ?? 0) - normalizedInputPeak)) / specification.periodHours;
    frequencyGain = {
      magnitude: outputAmplitude / specification.amplitude,
      phaseDegrees: Math.max(-180, Math.min(180, phaseDegrees)),
    };
  }
  return {
    steadyValue,
    riseTimeHours: risePoint?.timeHours ?? null,
    peakValue,
    peakTimeHours,
    overshootFraction:
      Math.abs(steadyValue) <= Number.EPSILON
        ? 0
        : Math.max(0, (peakValue - steadyValue) / Math.abs(steadyValue)),
    oscillatory: signChanges >= 3,
    dcGain,
    frequencyGain,
  };
}

function dynamicSimulation(project: BfnProject): {
  points: BfnSimulationPoint[];
  extrapolatedSubjects: string[];
} {
  const scenarios = parameterScenarios.map((scenario) =>
    simulateDynamicScenario(project, scenario),
  );
  const estimate = scenarios[0] ?? [];
  const extrapolatedSubjects = new Set<string>();
  const points = estimate.map((point, index) => {
    point.extrapolatedSubjects.forEach((subject) => extrapolatedSubjects.add(subject));
    const outputs = scenarios.map((scenario) => scenario[index]?.output ?? point.output);
    return {
      coordinate: point.timeHours,
      timeHours: point.timeHours,
      inputs: point.inputs,
      moduleOutputs: point.moduleOutputs,
      output: point.output,
      lower: Math.min(...outputs),
      upper: Math.max(...outputs),
      extrapolated: point.extrapolatedSubjects.length > 0,
    };
  });
  return { points, extrapolatedSubjects: [...extrapolatedSubjects] };
}

function provenance(project: BfnProject): { modelVersions: string[]; contextIds: string[] } {
  const models = project.network.modules
    .map((module) => resolveEffectiveBfnModel(project, module))
    .filter((model): model is BfnModelVariant => model !== null);
  return {
    modelVersions: [...new Set(models.map((model) => model.version))],
    contextIds: [...new Set(models.map((model) => model.contextId))],
  };
}

export function runBfnSimulation(
  project: BfnProject,
  completedAt = new Date().toISOString(),
): BfnSimulationResult {
  const baseIssues = validateBfnProject(project);
  const fatal = baseIssues.filter((issue) => issue.severity === 'error');
  if (fatal.length > 0) {
    throw new Error(`BFN_VALIDATION_FAILED:${fatal.map((issue) => issue.code).join(',')}`);
  }
  const simulation =
    project.network.mode === 'static' ? staticSimulation(project) : dynamicSimulation(project);
  const outsideIssues: BfnValidationIssue[] = simulation.extrapolatedSubjects.map((subjectId) => ({
    code: 'outside_validity_domain',
    severity: 'warning',
    subjectId,
  }));
  const annApproximation =
    project.network.mode === 'static' ? buildAnnApproximation(project, simulation.points) : null;
  const monitor = project.network.outputMonitors[0];
  const primarySource = project.network.inputSources[0];
  if (!monitor || !primarySource) throw new Error('BFN_NETWORK_ENDPOINT_MISSING');
  const source = resolveBfnPort(project, {
    nodeId: primarySource.id,
    portId: primarySource.outputPort.id,
  });
  if (!source) throw new Error('BFN_PRIMARY_INPUT_PORT_MISSING');
  const trace = provenance(project);
  const reachableModuleIds = findBfnOutputReachableModuleIds(project, monitor.id);
  const temporalSnapshot = createBfnRunTemporalSnapshot(project, monitor.id);
  const contextApplicabilitySnapshot = createBfnRunContextApplicabilitySnapshot(
    project,
    monitor.id,
  );
  return {
    id: createId('bfn-run'),
    engineVersion: 'BFN-SIM-2.0',
    networkId: project.network.id,
    mode: project.network.mode,
    points: simulation.points,
    primaryInputSourceId: primarySource.id,
    outputMonitorId: monitor.id,
    signalSnapshot: {
      primaryInput: {
        sourceId: primarySource.id,
        labelKey: primarySource.labelKey,
        entity: source.port.entity,
        quantityType: source.port.quantityType,
        unit: source.port.unit,
      },
      output: {
        monitorId: monitor.id,
        labelKey: monitor.labelKey,
        entity: monitor.inputPort.entity,
        quantityType: monitor.inputPort.quantityType,
        unit: monitor.inputPort.unit,
      },
    },
    temporalSnapshot,
    contextApplicabilitySnapshot,
    annApproximation,
    dynamicMetrics:
      project.network.mode === 'dynamic' ? dynamicMetrics(project, simulation.points) : null,
    validationIssues: [...baseIssues, ...outsideIssues],
    modelVersions: trace.modelVersions,
    contextIds: trace.contextIds,
    extrapolated: outsideIssues.length > 0,
    uncertaintyMethod: 'parameter_interval_envelope',
    completedAt,
    isDemo:
      project.isDemo ||
      project.network.modules.some(
        (module) =>
          reachableModuleIds.has(module.id) &&
          resolveEffectiveBfnModel(project, module)?.isDemo === true,
      ),
    experimentalValidity: 'not_validated',
  };
}

export function selectedModel(
  project: BfnProject,
  module: BfnFunctionalModule,
): BfnStaticModel | BfnDynamicModel | null {
  const model = resolveEffectiveBfnModel(project, module);
  return model?.mode === 'static' || model?.mode === 'dynamic' ? model : null;
}
