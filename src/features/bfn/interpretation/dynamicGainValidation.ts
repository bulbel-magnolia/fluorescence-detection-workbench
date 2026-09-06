import { resolveEffectiveBfnModel } from '../modelResolution';
import type { BfnDynamicModel, BfnProject } from '../types';
import type {
  BfnInterpretationContextReferenceV1,
  BfnInterpretationEvidenceReferenceV1,
  BfnResolvedLocalInfluenceTargetV1,
} from './interpretationTypes';
import type { BfnNetworkInfluenceIssueV1 } from './networkInfluenceTypes';
import { assessBfnNetworkInfluenceRequest } from './networkInfluenceValidation';
import type {
  BfnDynamicGainAdmissionV1,
  BfnDynamicGainIssueCodeV1,
  BfnDynamicGainIssueV1,
  BfnDynamicGainRequestV1,
  BfnFirstOrderDynamicModelReferenceV1,
  BfnResolvedDynamicGainModuleV1,
} from './dynamicGainTypes';

const evidenceGrades = new Set([
  'measured_single_context',
  'measured_multiple_contexts',
  'externally_validated',
  'fitted_from_published_data',
  'mechanistic_model_only',
  'data_driven_prediction',
  'independent_assumption',
  'proposed_unbuilt_design',
]);

const uncertaintyMethods = new Set([
  'parameter_interval_envelope',
  'posterior_samples',
  'bootstrap',
  'covariance',
  'none',
  'not_recorded',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every(isNonEmptyString) && new Set(value).size === value.length
  );
}

function addIssue(
  issues: BfnDynamicGainIssueV1[],
  code: BfnDynamicGainIssueCodeV1,
  subjectId: string,
  details?: Readonly<Record<string, string | number>>,
): void {
  if (issues.some((issue) => issue.code === code && issue.subjectId === subjectId)) return;
  issues.push(
    Object.freeze({
      code,
      severity: 'error' as const,
      subjectId,
      ...(details ? { details: Object.freeze({ ...details }) } : {}),
    }),
  );
}

function finish(
  issues: readonly BfnDynamicGainIssueV1[],
  target: BfnDynamicGainAdmissionV1['target'],
  baselineAdmission: BfnDynamicGainAdmissionV1['baselineAdmission'],
): BfnDynamicGainAdmissionV1 {
  return Object.freeze({
    status: issues.length === 0 ? 'supported' : 'unsupported',
    issues: Object.freeze([...issues]),
    target,
    baselineAdmission,
  });
}

function mappedNetworkIssue(issue: BfnNetworkInfluenceIssueV1): BfnDynamicGainIssueCodeV1 {
  switch (issue.code) {
    case 'upstream_accumulator_unsupported':
      return 'integrator_reference_state_unavailable';
    case 'upstream_feedback_unsupported':
      return 'feedback';
    case 'required_input_unconnected':
    case 'required_input_ambiguous':
      return 'missing_input';
    case 'input_source_value_missing':
    case 'input_source_value_duplicate':
    case 'unexpected_input_source':
    case 'input_source_invalid':
    case 'unit_mismatch':
    case 'value_non_finite':
    case 'value_negative':
      return 'baseline_operating_point_invalid';
    case 'request_contract_invalid':
      return 'request_contract_invalid';
    default:
      return 'response_invalid';
  }
}

function dynamicContextReference(
  project: BfnProject,
  model: BfnDynamicModel,
): BfnInterpretationContextReferenceV1 | null {
  if (model.contextId === null) {
    return Object.freeze({ kind: 'not_recorded', contextId: null });
  }
  const matches = project.registry.contexts.filter((context) => context.id === model.contextId);
  return matches.length === 1
    ? Object.freeze({ kind: 'project_context', contextId: model.contextId })
    : null;
}

function firstOrderReference(
  project: BfnProject,
  model: BfnDynamicModel,
): BfnFirstOrderDynamicModelReferenceV1 | null {
  const tau: unknown = model.tau;
  const validBase =
    isNonEmptyString(model.id) &&
    isNonEmptyString(model.version) &&
    model.mode === 'dynamic' &&
    model.family === 'first_order' &&
    isRecord(tau) &&
    typeof tau.value === 'number' &&
    Number.isFinite(tau.value) &&
    tau.value > 0 &&
    tau.unit === 'h' &&
    isNonEmptyString(model.validityDomainId) &&
    (model.contextId === null || isNonEmptyString(model.contextId)) &&
    validStringArray(model.sourceDatasetIds) &&
    validStringArray(model.provenanceIds) &&
    evidenceGrades.has(model.evidenceGrade) &&
    uncertaintyMethods.has(model.uncertaintyMethod) &&
    typeof model.isDemo === 'boolean';
  if (!validBase) return null;

  const contextReference = dynamicContextReference(project, model);
  const domains = project.registry.validityDomains.filter(
    (domain) => domain.id === model.validityDomainId,
  );
  const provenanceResolvable = model.provenanceIds.every(
    (id) => project.registry.provenanceRecords.filter((record) => record.id === id).length === 1,
  );
  if (
    contextReference === null ||
    domains.length !== 1 ||
    domains[0]?.contextId !== model.contextId ||
    !provenanceResolvable
  ) {
    return null;
  }

  const evidence: BfnInterpretationEvidenceReferenceV1 = Object.freeze({
    evidenceGrade: model.evidenceGrade,
    uncertaintyMethod: model.uncertaintyMethod,
    provenanceIds: Object.freeze([...model.provenanceIds]),
    sourceDatasetIds: Object.freeze([...model.sourceDatasetIds]),
    catalogReference: null,
  });
  return Object.freeze({
    dynamicModelId: model.id,
    dynamicModelVersion: model.version,
    tauHours: model.tau.value,
    evidence,
    contextReference,
    validityDomainId: model.validityDomainId,
  });
}

function resolveModule(
  project: BfnProject,
  localTarget: BfnResolvedLocalInfluenceTargetV1,
): BfnResolvedDynamicGainModuleV1 | null {
  const matches = project.network.modules.filter((module) => module.id === localTarget.moduleId);
  const module = matches[0];
  if (matches.length !== 1 || !module) return null;
  const effective = resolveEffectiveBfnModel(project, module);
  if (effective?.mode === 'static') {
    return Object.freeze({
      moduleId: module.id,
      dynamicKind: 'quasi_static',
      staticModelId: localTarget.staticModelId,
      staticModelVersion: localTarget.staticModelVersion,
      analysisEvidence: localTarget.evidence,
      contextReference: localTarget.contextReference,
      validityDomainId: localTarget.validityDomainId,
      dynamicModel: null,
    });
  }
  if (effective?.mode !== 'dynamic' || effective.family !== 'first_order') return null;
  const dynamicModel = firstOrderReference(project, effective);
  if (!dynamicModel) return null;
  return Object.freeze({
    moduleId: module.id,
    dynamicKind: 'first_order',
    staticModelId: localTarget.staticModelId,
    staticModelVersion: localTarget.staticModelVersion,
    analysisEvidence: dynamicModel.evidence,
    contextReference: dynamicModel.contextReference,
    validityDomainId: dynamicModel.validityDomainId,
    dynamicModel,
  });
}

function assess(project: BfnProject, request: BfnDynamicGainRequestV1): BfnDynamicGainAdmissionV1 {
  const issues: BfnDynamicGainIssueV1[] = [];
  if (
    !isRecord(request) ||
    request.contractVersion !== '1.0' ||
    request.scope !== 'network_dynamic_periodic_gain' ||
    !isNonEmptyString(request.outputMonitorId) ||
    !Array.isArray(request.operatingPoint) ||
    !isRecord(request.perturbation)
  ) {
    addIssue(issues, 'request_contract_invalid', 'request');
    return finish(issues, null, null);
  }
  if (!isRecord(project) || !isRecord(project.network)) {
    addIssue(issues, 'response_invalid', request.outputMonitorId);
    return finish(issues, null, null);
  }
  if (
    typeof request.perturbation.periodHours !== 'number' ||
    !Number.isFinite(request.perturbation.periodHours) ||
    request.perturbation.periodHours <= 0
  ) {
    addIssue(issues, 'perturbation_period_invalid', request.outputMonitorId);
    return finish(issues, null, null);
  }

  const baselineAdmission = assessBfnNetworkInfluenceRequest(project, {
    contractVersion: '1.0',
    scope: 'network_static_output',
    outputMonitorId: request.outputMonitorId,
    operatingPoint: request.operatingPoint,
  });
  for (const issue of baselineAdmission.issues) {
    addIssue(issues, mappedNetworkIssue(issue), issue.subjectId, issue.details);
  }
  if (!baselineAdmission.target) return finish(issues, null, baselineAdmission);

  const modules: BfnResolvedDynamicGainModuleV1[] = [];
  for (const localTarget of baselineAdmission.target.moduleTargets) {
    const resolved = resolveModule(project, localTarget);
    if (!resolved) {
      addIssue(issues, 'dynamic_model_contract_invalid', localTarget.moduleId);
      continue;
    }
    modules.push(resolved);
  }
  const target =
    modules.length === baselineAdmission.target.moduleTargets.length
      ? Object.freeze({
          baselineTarget: baselineAdmission.target,
          modules: Object.freeze(modules),
        })
      : null;
  return finish(issues, target, baselineAdmission);
}

/** Pure period, target-closure, and effective model-metadata admission. */
export function assessBfnDynamicGainRequest(
  project: BfnProject,
  request: BfnDynamicGainRequestV1,
): BfnDynamicGainAdmissionV1 {
  try {
    return assess(project, request);
  } catch {
    const issues: BfnDynamicGainIssueV1[] = [];
    addIssue(issues, 'response_invalid', request?.outputMonitorId ?? 'request');
    return finish(issues, null, null);
  }
}
