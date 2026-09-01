import { resolveEffectiveBfnModel } from './modelResolution';
import { findBfnOutputReachableModuleIds } from './outputReachability';
import type {
  BfnModelVariant,
  BfnParameterEstimate,
  BfnProject,
  BfnRunModuleUncertaintySnapshot,
  BfnRunUncertaintySnapshot,
  BfnSimulationResult,
  BfnStaticResponse,
} from './types';

function responseParameters(
  response: BfnStaticResponse | undefined,
): readonly (BfnParameterEstimate | undefined)[] | null {
  if (!response || typeof response !== 'object') return null;
  switch (response.family) {
    case 'hill_activation':
    case 'hill_repression':
      return [response.ymin, response.ymax, response.k, response.n];
    case 'linear_transfer':
      return [response.scale, response.intercept];
    case 'identity':
      return typeof response.inputPortId === 'string' && response.inputPortId.length > 0
        ? []
        : [undefined];
    case 'independent_inputs':
      if (!Array.isArray(response.terms) || response.terms.length === 0) return [undefined];
      return [
        response.basal,
        response.outputMaximum,
        ...response.terms.flatMap((term) =>
          term && typeof term === 'object'
            ? [term.k, term.n, term.contribution]
            : [undefined, undefined, undefined],
        ),
      ];
    default:
      return null;
  }
}

function hasExecutableInterval(parameter: BfnParameterEstimate | undefined): boolean {
  if (!parameter || typeof parameter !== 'object') return false;
  const interval = parameter.interval95;
  if (!Number.isFinite(parameter.value) || !Array.isArray(interval) || interval.length !== 2) {
    return false;
  }
  const [lower, upper] = interval;
  return (
    Number.isFinite(lower) &&
    Number.isFinite(upper) &&
    lower <= parameter.value &&
    parameter.value <= upper
  );
}

export function assessBfnModelUncertainty(
  model: BfnModelVariant,
): Omit<BfnRunModuleUncertaintySnapshot, 'moduleId' | 'selectedModelId'> {
  if (model.mode === 'dynamic' && model.family === 'accumulator') {
    return {
      method: model.uncertaintyMethod,
      intervalExecutable: false,
      reason: 'method_not_executable',
    };
  }
  if (model.uncertaintyMethod === 'none') {
    return {
      method: model.uncertaintyMethod,
      intervalExecutable: false,
      reason: 'none_declared',
    };
  }
  if (model.uncertaintyMethod === 'not_recorded') {
    return {
      method: model.uncertaintyMethod,
      intervalExecutable: false,
      reason: 'not_recorded',
    };
  }
  if (model.uncertaintyMethod !== 'parameter_interval_envelope') {
    return {
      method: model.uncertaintyMethod,
      intervalExecutable: false,
      reason: 'method_not_executable',
    };
  }
  const response = model.mode === 'dynamic' ? model.steadyStateResponse : model.response;
  if (
    model.mode === 'dynamic' &&
    (!Number.isFinite(model.initialState) || !isPositiveDynamicTau(model.tau))
  ) {
    return {
      method: model.uncertaintyMethod,
      intervalExecutable: false,
      reason: 'parameter_interval_incomplete',
    };
  }
  const responseParameterValues = responseParameters(response);
  if (responseParameterValues === null) {
    return {
      method: model.uncertaintyMethod,
      intervalExecutable: false,
      reason: 'parameter_interval_incomplete',
    };
  }
  const parameters = [...responseParameterValues, ...(model.mode === 'dynamic' ? [model.tau] : [])];
  const intervalExecutable = parameters.every(hasExecutableInterval);
  return {
    method: model.uncertaintyMethod,
    intervalExecutable,
    reason: intervalExecutable ? null : 'parameter_interval_incomplete',
  };
}

function isPositiveDynamicTau(parameter: BfnParameterEstimate | undefined): boolean {
  if (
    !parameter ||
    parameter.unit !== 'h' ||
    !Number.isFinite(parameter.value) ||
    parameter.value <= 0
  ) {
    return false;
  }
  const interval = parameter.interval95;
  if (!Array.isArray(interval) || interval.length !== 2) return false;
  return (
    Number.isFinite(interval[0]) &&
    Number.isFinite(interval[1]) &&
    interval[0] > 0 &&
    interval[0] <= parameter.value &&
    parameter.value <= interval[1]
  );
}

export function createBfnRunUncertaintySnapshot(
  project: BfnProject,
  monitorId: string,
): BfnRunUncertaintySnapshot {
  const reachable = findBfnOutputReachableModuleIds(project, monitorId);
  const modules: BfnRunModuleUncertaintySnapshot[] = [];
  for (const module of project.network.modules) {
    if (!reachable.has(module.id)) continue;
    const model = resolveEffectiveBfnModel(project, module);
    if (!model) {
      modules.push({
        moduleId: module.id,
        selectedModelId: null,
        method: null,
        intervalExecutable: false,
        reason: 'not_recorded',
      });
      continue;
    }
    modules.push({
      moduleId: module.id,
      selectedModelId: model.id,
      ...assessBfnModelUncertainty(model),
    });
  }
  const available =
    modules.length > 0 && modules.every((module) => module.intervalExecutable === true);
  return {
    scope: 'output_reachable',
    status: available ? 'available' : 'unavailable',
    method: available ? 'parameter_interval_envelope' : null,
    modules,
  };
}

export function hasBfnExecutableResultInterval(result: BfnSimulationResult): boolean {
  if (result.engineVersion === 'BFN-SIM-2.1') {
    return result.uncertaintySnapshot.status === 'available';
  }
  return result.points.every(
    (point) =>
      point.lower !== null &&
      point.upper !== null &&
      Number.isFinite(point.lower) &&
      Number.isFinite(point.upper),
  );
}
