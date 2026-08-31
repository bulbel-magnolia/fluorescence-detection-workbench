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
  const duplicateProposedIds = proposedIds.filter((id, index) => proposedIds.indexOf(id) !== index);
  if (
    collectDefinedIds(project).has(dynamicModelId) ||
    duplicateProposedIds.includes(dynamicModelId)
  ) {
    return failure([
      {
        code: 'generated_id_collision',
        path: 'id',
        details: [dynamicModelId],
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

function toParameterEstimate(parameter: {
  readonly value: number;
  readonly unit: string;
  readonly interval95?: readonly [number, number];
}): BfnParameterEstimate | null {
  if (parameter.unit !== 'h' || !Number.isFinite(parameter.value) || parameter.value <= 0) {
    return null;
  }
  return {
    value: parameter.value,
    unit: 'h',
    ...(parameter.interval95 ? { interval95: [...parameter.interval95] as [number, number] } : {}),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(
  issues: readonly UserModuleMaterializationIssue[],
): UserModuleMaterializationFailure {
  return { ok: false, issues };
}
