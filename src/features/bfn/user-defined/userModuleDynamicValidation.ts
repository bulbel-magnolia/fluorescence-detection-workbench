import { USER_MODULE_AUTHORABLE_MODEL_FAMILIES } from './userModuleContract';
import type {
  UserDefinedFunctionalModuleDraft,
  UserModuleContractIssue,
  UserModuleModelDraft,
  UserModuleParameterDraft,
  UserModuleUncertaintyDraft,
} from './userModuleContract';
import type {
  UserDefinedDynamicFunctionalModuleAssessment,
  UserDefinedDynamicFunctionalModuleDraft,
  UserModuleDynamicContractIssue,
  UserModuleDynamicUncertaintyDraft,
} from './userModuleDynamicContract';
import { assessUserDefinedFunctionalModule } from './userModuleValidation';

const authorableFamilies = new Set<string>(USER_MODULE_AUTHORABLE_MODEL_FAMILIES);

/**
 * Pure assessment for one first-order dynamic authoring source. Static
 * response semantics are delegated to the frozen Batch 12.1 assessor; this
 * layer validates only dynamic fields and the narrower uncertainty policy.
 */
export function assessUserDefinedDynamicFunctionalModule(
  draft: UserDefinedDynamicFunctionalModuleDraft,
): UserDefinedDynamicFunctionalModuleAssessment {
  const staticAssessment = assessUserDefinedFunctionalModule(toStaticDraft(draft));
  const dynamicIssues: UserModuleDynamicContractIssue[] = [];
  const steadyStateResponse = draft.steadyStateResponse;

  validateSteadyStateExpression(steadyStateResponse, dynamicIssues);
  validateDynamics(draft, dynamicIssues);
  validateTimeRange(draft.timeRangeHours, dynamicIssues);
  validateUncertainty(draft, steadyStateResponse, dynamicIssues);

  const semanticIssues = [
    ...staticAssessment.semantic.issues.map(copyStaticIssue),
    ...dynamicIssues,
  ];
  const runtimeIssues = staticAssessment.runtime.issues.map(copyStaticIssue);
  if (
    dynamicIssues.length > 0 &&
    !runtimeIssues.some((item) => item.code === 'mathematical_contract_incomplete')
  ) {
    runtimeIssues.push(issue('runtime', 'mathematical_contract_incomplete', 'dynamics'));
  }

  return deepFreeze({
    moduleId: draft.id,
    semantic: {
      state: semanticIssues.length === 0 ? 'valid' : 'invalid',
      issues: semanticIssues,
    },
    representation: {
      state:
        staticAssessment.representation.issues.length === 0 ? 'lossless' : 'requires_ir_extension',
      issues: staticAssessment.representation.issues.map(copyStaticIssue),
    },
    runtime: {
      state: runtimeIssues.length === 0 ? 'supported' : 'unsupported',
      issues: runtimeIssues,
    },
    evidence: {
      basis: staticAssessment.evidence.basis,
      provenanceState: staticAssessment.evidence.provenanceState,
      issues: staticAssessment.evidence.issues.map(copyStaticIssue),
    },
    implementation: {
      state: staticAssessment.implementation.state,
      issues: staticAssessment.implementation.issues.map(copyStaticIssue),
    },
  });
}

function toStaticDraft(
  draft: UserDefinedDynamicFunctionalModuleDraft,
): UserDefinedFunctionalModuleDraft {
  return {
    id: draft.id,
    origin: draft.origin,
    name: draft.name,
    description: draft.description,
    ports: draft.ports,
    model: draft.steadyStateResponse,
    validityDomains: draft.validityDomains,
    context: draft.context,
    uncertainty: normalizeUncertainty(draft.uncertainty),
    evidence: draft.evidence,
    implementation: draft.implementation,
  };
}

function normalizeUncertainty(
  uncertainty: UserModuleDynamicUncertaintyDraft | undefined,
): UserModuleUncertaintyDraft {
  if (!uncertainty || typeof uncertainty !== 'object') return { state: 'not_recorded' };
  if (
    uncertainty.state === 'parameter_interval_envelope' ||
    (uncertainty.state === 'reported' && uncertainty.method === 'parameter_interval_envelope')
  ) {
    return { state: 'reported', method: 'parameter_interval_envelope' };
  }
  if (uncertainty.state === 'none' || uncertainty.state === 'not_recorded') {
    return uncertainty;
  }
  return { state: 'not_recorded' };
}

function validateSteadyStateExpression(
  model: UserModuleModelDraft | undefined,
  issues: UserModuleDynamicContractIssue[],
): void {
  if (model && Object.prototype.hasOwnProperty.call(model, 'expression')) {
    issues.push(
      issue(
        'semantic',
        'dynamic_steady_state_expression_unsupported',
        'steadyStateResponse.expression',
      ),
    );
  }
}

function validateDynamics(
  draft: UserDefinedDynamicFunctionalModuleDraft,
  issues: UserModuleDynamicContractIssue[],
): void {
  const dynamics = isRecord(draft.dynamics) ? draft.dynamics : undefined;
  const tau = dynamics?.tau;
  if (!isRecord(tau)) {
    issues.push(issue('semantic', 'dynamic_tau_missing', 'dynamics.tau'));
  } else {
    const value = tau.value;
    if (!isFiniteNumber(value)) {
      issues.push(issue('semantic', 'dynamic_tau_non_finite', 'dynamics.tau.value'));
    } else if (value <= 0) {
      issues.push(issue('semantic', 'dynamic_tau_non_positive', 'dynamics.tau.value'));
    }
    if (tau.unit !== 'h') {
      issues.push(issue('semantic', 'dynamic_tau_unit_invalid', 'dynamics.tau.unit'));
    }
    if (isEnvelopeUncertainty(draft.uncertainty)) {
      validateTauInterval(tau.interval95, value, issues);
    }
  }

  const initialState = dynamics?.initialState;
  if (!isFiniteNumber(initialState)) {
    issues.push(issue('semantic', 'dynamic_initial_state_non_finite', 'dynamics.initialState'));
  }
}

function validateTauInterval(
  interval: unknown,
  estimate: number,
  issues: UserModuleDynamicContractIssue[],
): void {
  if (!isInterval(interval)) {
    issues.push(issue('semantic', 'dynamic_tau_interval_missing', 'dynamics.tau.interval95'));
    return;
  }
  const [lower, upper] = interval;
  if (!isFiniteNumber(lower) || !isFiniteNumber(upper) || lower > upper || lower <= 0) {
    issues.push(issue('semantic', 'dynamic_tau_interval_invalid', 'dynamics.tau.interval95'));
  }
  if (
    isFiniteNumber(estimate) &&
    isFiniteNumber(lower) &&
    isFiniteNumber(upper) &&
    (estimate < lower || estimate > upper)
  ) {
    issues.push(
      issue('semantic', 'dynamic_tau_interval_estimate_outside', 'dynamics.tau.interval95'),
    );
  }
}

function validateTimeRange(
  timeRangeHours: readonly [number, number] | undefined,
  issues: UserModuleDynamicContractIssue[],
): void {
  if (timeRangeHours === undefined) return;
  if (!Array.isArray(timeRangeHours) || timeRangeHours.length !== 2) {
    issues.push(issue('semantic', 'dynamic_time_range_invalid', 'timeRangeHours'));
    return;
  }
  const [start, end] = timeRangeHours;
  if (!isFiniteNumber(start) || !isFiniteNumber(end) || start < 0 || end <= start) {
    issues.push(issue('semantic', 'dynamic_time_range_invalid', 'timeRangeHours'));
  }
}

function validateUncertainty(
  draft: UserDefinedDynamicFunctionalModuleDraft,
  model: UserModuleModelDraft | undefined,
  issues: UserModuleDynamicContractIssue[],
): void {
  const uncertainty = draft.uncertainty;
  if (!uncertainty || typeof uncertainty !== 'object') {
    issues.push(issue('semantic', 'dynamic_uncertainty_method_invalid', 'uncertainty'));
    return;
  }
  if (uncertainty.state === 'reported' && uncertainty.method !== 'parameter_interval_envelope') {
    issues.push(issue('semantic', 'dynamic_uncertainty_method_invalid', 'uncertainty.method'));
    return;
  }
  if (uncertainty.state !== 'reported' && uncertainty.state !== 'parameter_interval_envelope') {
    if (uncertainty.state !== 'not_recorded' && uncertainty.state !== 'none') {
      issues.push(issue('semantic', 'dynamic_uncertainty_method_invalid', 'uncertainty.state'));
    }
    return;
  }
  if (!model || !authorableFamilies.has(model.family)) return;

  for (const { parameter, path } of requiredSteadyParameters(model)) {
    validateCompleteInterval(parameter, path, issues);
  }
}

function requiredSteadyParameters(
  model: UserModuleModelDraft,
): readonly { readonly parameter: UserModuleParameterDraft | undefined; readonly path: string }[] {
  if (model.family === 'hill_activation' || model.family === 'hill_repression') {
    return ['k', 'n', 'ymin', 'ymax'].map((name) => ({
      parameter: model.parameters[name],
      path: `steadyStateResponse.parameters.${name}`,
    }));
  }
  if (model.family === 'linear_transfer') {
    return ['scale', 'intercept'].map((name) => ({
      parameter: model.parameters[name],
      path: `steadyStateResponse.parameters.${name}`,
    }));
  }
  return [
    { parameter: model.parameters.basal, path: 'steadyStateResponse.parameters.basal' },
    {
      parameter: model.parameters.outputMaximum,
      path: 'steadyStateResponse.parameters.outputMaximum',
    },
    ...(model.terms ?? []).flatMap((term, index) => [
      {
        parameter: term.k,
        path: `steadyStateResponse.terms[${index}].k`,
      },
      {
        parameter: term.n,
        path: `steadyStateResponse.terms[${index}].n`,
      },
      {
        parameter: term.weight,
        path: `steadyStateResponse.terms[${index}].weight`,
      },
    ]),
  ];
}

function validateCompleteInterval(
  parameter: UserModuleParameterDraft | undefined,
  path: string,
  issues: UserModuleDynamicContractIssue[],
): void {
  if (!parameter || !isInterval(parameter.interval95)) {
    issues.push(issue('semantic', 'dynamic_parameter_interval_missing', path));
    return;
  }
  const [lower, upper] = parameter.interval95;
  if (
    !isFiniteNumber(parameter.value) ||
    !isFiniteNumber(lower) ||
    !isFiniteNumber(upper) ||
    lower > upper ||
    parameter.value < lower ||
    parameter.value > upper
  ) {
    issues.push(issue('semantic', 'dynamic_parameter_interval_invalid', path));
  }
}

function isEnvelopeUncertainty(uncertainty: unknown): boolean {
  if (!isRecord(uncertainty)) return false;
  return (
    uncertainty.state === 'parameter_interval_envelope' ||
    (uncertainty.state === 'reported' && uncertainty.method === 'parameter_interval_envelope')
  );
}

function copyStaticIssue(item: UserModuleContractIssue): UserModuleDynamicContractIssue {
  return { axis: item.axis, code: item.code, path: item.path };
}

function issue(
  axis: UserModuleDynamicContractIssue['axis'],
  code: Extract<UserModuleDynamicContractIssue['code'], string>,
  path: string,
): UserModuleDynamicContractIssue {
  return { axis, code, path };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInterval(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) && value.length === 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
