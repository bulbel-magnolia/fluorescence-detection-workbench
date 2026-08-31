import type { BfnDynamicModel, BfnParameterEstimate, BfnProject, BfnStaticModel } from '../types';
import type {
  UserModuleMaterializationFailure,
  UserModuleMaterializationIssue,
  UserModuleMaterializationOptions,
  UserModuleMaterializationResult,
} from './userModuleMaterialization';
import { materializeUserDefinedStaticModule } from './userModuleMaterialization';
import type {
  UserDefinedDynamicFunctionalModuleDraft,
  UserModuleDynamicUncertaintyDraft,
} from './userModuleDynamicContract';
import { assessUserDefinedDynamicFunctionalModule } from './userModuleDynamicValidation';
import type {
  UserDefinedFunctionalModuleDraft,
  UserModuleUncertaintyDraft,
} from './userModuleContract';

/**
 * Materializes a first-order dynamic authoring draft as one ordinary BFN
 * functional module. The static variant and all registry sidecars are built
 * by the frozen Batch 12.1 materializer; this function only adds the paired
 * dynamic variant and optional temporal validity range.
 */
export function materializeUserDefinedDynamicModule(
  draft: UserDefinedDynamicFunctionalModuleDraft,
  project: BfnProject,
  options: UserModuleMaterializationOptions = {},
): UserModuleMaterializationResult {
  const assessment = assessUserDefinedDynamicFunctionalModule(draft);
  const gateIssues = dynamicGateIssues(assessment);
  if (gateIssues.length > 0) return failure(gateIssues);

  const dynamicModelId = `${draft.id}.model.dynamic.v1`;
  const proposedIds = [
    draft.id,
    ...draft.ports.map((port) => port.id),
    `${draft.id}.model.static.v1`,
    dynamicModelId,
    `${draft.id}.domain.v1`,
    ...(draft.context.state === 'defined' ? [`${draft.id}.context.v1`] : []),
    ...draft.evidence.provenance.map((record) => record.id),
  ];
  const generatedIds = new Set(proposedIds);
  const duplicateDynamicModelId = proposedIds.filter((id) => id === dynamicModelId).length > 1;
  const existingIds = collectDefinedIds(project);
  const projectNonEntityIds = collectProjectNonEntityIds(project);
  const collidingEntityIds = uniqueStrings(
    draft.ports
      .map((port) => port.entity.id)
      .filter((entityId) => generatedIds.has(entityId) || projectNonEntityIds.has(entityId)),
  );
  if (existingIds.has(dynamicModelId) || duplicateDynamicModelId || collidingEntityIds.length > 0) {
    return failure([
      {
        code: 'generated_id_collision',
        path: 'id',
        details: uniqueStrings([
          ...(existingIds.has(dynamicModelId) || duplicateDynamicModelId ? [dynamicModelId] : []),
          ...collidingEntityIds,
        ]),
      },
    ]);
  }

  const staticResult = materializeUserDefinedStaticModule(toStaticDraft(draft), project, options);
  if (!staticResult.ok) return staticResult;

  const nextProject = staticResult.nextProject;
  const module = nextProject.network.modules.find(
    (candidate) => candidate.id === staticResult.addedModuleId,
  );
  if (!module) {
    return failure([
      {
        code: 'semantic_invalid',
        path: 'id',
        details: ['materialized module missing'],
      },
    ]);
  }
  const staticModel = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel => candidate.mode === 'static',
  );
  if (!staticModel) {
    return failure([
      {
        code: 'semantic_invalid',
        path: 'model',
        details: ['static materialization missing'],
      },
    ]);
  }

  const tau = toParameterEstimate(draft.dynamics.tau);
  if (!tau) {
    return failure([
      {
        code: 'semantic_invalid',
        path: 'dynamics.tau',
      },
    ]);
  }
  const dynamicModel: BfnDynamicModel = {
    id: dynamicModelId,
    version: staticModel.version,
    mode: 'dynamic',
    family: 'first_order',
    steadyStateResponse: structuredClone(staticModel.response),
    tau,
    initialState: draft.dynamics.initialState,
    contextId: staticModel.contextId,
    validityDomainId: staticModel.validityDomainId,
    sourceDatasetIds: [...staticModel.sourceDatasetIds],
    provenanceIds: [...staticModel.provenanceIds],
    evidenceGrade: staticModel.evidenceGrade,
    uncertaintyMethod: staticModel.uncertaintyMethod,
    isDemo: staticModel.isDemo,
  };
  module.modelVariants.push(dynamicModel);
  module.activeModelIds = {
    static: staticModel.id,
    dynamic: dynamicModel.id,
  };

  const validityDomain = nextProject.registry.validityDomains.find(
    (domain) => domain.id === staticModel.validityDomainId,
  );
  if (!validityDomain) {
    return failure([
      {
        code: 'semantic_invalid',
        path: 'validityDomains',
        details: ['static materialization missing validity domain'],
      },
    ]);
  }
  if (draft.timeRangeHours !== undefined) {
    validityDomain.timeRangeHours = [draft.timeRangeHours[0], draft.timeRangeHours[1]];
  }

  return { ok: true, nextProject, addedModuleId: module.id };
}

interface DynamicAssessmentLike {
  readonly semantic: {
    readonly state: 'valid' | 'invalid';
    readonly issues: readonly { readonly path: string; readonly code: string }[];
  };
  readonly runtime: {
    readonly state: 'supported' | 'unsupported';
    readonly issues: readonly { readonly path: string; readonly code: string }[];
  };
  readonly evidence: {
    readonly provenanceState: 'not_required' | 'provided' | 'missing';
    readonly issues: readonly { readonly path: string; readonly code: string }[];
  };
  readonly implementation: {
    readonly state: string;
    readonly issues: readonly { readonly path: string; readonly code: string }[];
  };
}

function dynamicGateIssues(
  assessment: DynamicAssessmentLike,
): readonly UserModuleMaterializationIssue[] {
  const issues: UserModuleMaterializationIssue[] = [];
  if (assessment.semantic.state !== 'valid') {
    issues.push({
      code: 'semantic_invalid',
      path: 'draft',
      details: assessment.semantic.issues.map((item) => `${item.path}:${item.code}`),
    });
  }
  if (assessment.runtime.state !== 'supported') {
    issues.push({
      code: 'runtime_unsupported',
      path: 'model',
      details: assessment.runtime.issues.map((item) => `${item.path}:${item.code}`),
    });
  }
  if (assessment.evidence.issues.length > 0 || assessment.evidence.provenanceState === 'missing') {
    issues.push({
      code: 'evidence_unclaimable',
      path: 'evidence',
      details: assessment.evidence.issues.map((item) => `${item.path}:${item.code}`),
    });
  }
  if (
    assessment.implementation.state === 'unrecognized' ||
    assessment.implementation.issues.length > 0
  ) {
    issues.push({
      code: 'implementation_invalid',
      path: 'implementation',
      details: assessment.implementation.issues.map((item) => `${item.path}:${item.code}`),
    });
  }
  return issues;
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
  uncertainty: UserModuleDynamicUncertaintyDraft,
): UserModuleUncertaintyDraft {
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

function toParameterEstimate(parameter: unknown): BfnParameterEstimate | null {
  if (!isRecord(parameter)) return null;
  const value = parameter.value;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    parameter.unit !== 'h'
  ) {
    return null;
  }
  const interval = parameter.interval95;
  if (interval === undefined) return { value, unit: 'h' };
  if (!isTwoItemArray(interval)) return null;
  const lower = interval[0];
  const upper = interval[1];
  if (
    typeof lower !== 'number' ||
    typeof upper !== 'number' ||
    !Number.isFinite(lower) ||
    !Number.isFinite(upper) ||
    lower <= 0 ||
    lower > upper ||
    value < lower ||
    value > upper
  ) {
    return null;
  }
  return {
    value,
    unit: 'h',
    interval95: [lower, upper],
  };
}

function collectDefinedIds(value: unknown, ids = new Set<string>()): ReadonlySet<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectDefinedIds(item, ids);
    return ids;
  }
  if (!isRecord(value)) return ids;
  if (typeof value.id === 'string') ids.add(value.id);
  for (const child of Object.values(value)) collectDefinedIds(child, ids);
  return ids;
}

function collectProjectNonEntityIds(project: BfnProject): ReadonlySet<string> {
  return collectDefinedIds({
    ...project,
    registry: {
      ...project.registry,
      entities: [],
    },
  });
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isTwoItemArray(value: unknown): value is readonly [unknown, unknown] {
  return Array.isArray(value) && value.length === 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(
  issues: readonly UserModuleMaterializationIssue[],
): UserModuleMaterializationFailure {
  return { ok: false, issues };
}
