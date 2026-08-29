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

function responseParameters(response: BfnStaticResponse): readonly BfnParameterEstimate[] {
  switch (response.family) {
    case 'hill_activation':
    case 'hill_repression':
      return [response.ymin, response.ymax, response.k, response.n];
    case 'linear_transfer':
      return [response.scale, response.intercept];
    case 'identity':
      return [];
    case 'independent_inputs':
      return [
        response.basal,
        response.outputMaximum,
        ...response.terms.flatMap((term) => [term.k, term.n, term.contribution]),
      ];
  }
}

function hasExecutableInterval(parameter: BfnParameterEstimate): boolean {
  const interval = parameter.interval95;
  if (!Number.isFinite(parameter.value) || interval === undefined) return false;
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
  const parameters = [
    ...responseParameters(response),
    ...(model.mode === 'dynamic' ? [model.tau] : []),
  ];
  const intervalExecutable = parameters.every(hasExecutableInterval);
  return {
    method: model.uncertaintyMethod,
    intervalExecutable,
    reason: intervalExecutable ? null : 'parameter_interval_incomplete',
  };
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
