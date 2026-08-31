import { BFN_CANVAS_SIZE, findBfnModulePlacement } from '../nodePlacement';
import type {
  BfnContext,
  BfnEntityDefinition,
  BfnEvidenceGrade,
  BfnFunctionalModule,
  BfnModuleImplementationState,
  BfnParameterEstimate,
  BfnPort,
  BfnProject,
  BfnProvenanceKind,
  BfnProvenanceRecord,
  BfnQuantityType,
  BfnStaticResponse,
  BfnUncertaintyMethod,
  BfnUnit,
  BfnValidityDomain,
} from '../types';
import {
  USER_MODULE_EVIDENCE_BASES,
  USER_MODULE_QUANTITY_TYPES,
  USER_MODULE_UNITS,
} from './userModuleContract';
import type {
  UserDefinedFunctionalModuleDraft,
  UserModuleParameterDraft,
  UserModulePortDraft,
} from './userModuleContract';
import { assessUserDefinedFunctionalModule } from './userModuleValidation';

export type UserModuleMaterializationIssueCode =
  | 'semantic_invalid'
  | 'runtime_unsupported'
  | 'evidence_unclaimable'
  | 'implementation_invalid'
  | 'implementation_reference_missing'
  | 'defined_context_empty'
  | 'parameter_interval_incomplete'
  | 'uncertainty_method_not_authorable'
  | 'entity_display_name_conflict'
  | 'provenance_record_conflict'
  | 'generated_id_collision';

export interface UserModuleMaterializationIssue {
  readonly code: UserModuleMaterializationIssueCode;
  readonly path: string;
  readonly details?: readonly string[];
}

export interface UserModuleMaterializationSuccess {
  readonly ok: true;
  readonly nextProject: BfnProject;
  readonly addedModuleId: string;
}

export interface UserModuleMaterializationFailure {
  readonly ok: false;
  readonly issues: readonly UserModuleMaterializationIssue[];
}

export type UserModuleMaterializationResult =
  UserModuleMaterializationSuccess | UserModuleMaterializationFailure;

export interface UserModuleAuthoritativeEntity {
  readonly id: string;
  readonly displayName: string;
}

export interface UserModuleMaterializationOptions {
  readonly authoritativeEntities?: readonly UserModuleAuthoritativeEntity[];
}

interface MaterializationIds {
  readonly model: string;
  readonly domain: string;
  readonly context: string;
}

interface EntityAudit {
  readonly issues: readonly UserModuleMaterializationIssue[];
  readonly additions: readonly BfnEntityDefinition[];
}

interface ProvenanceAudit {
  readonly issues: readonly UserModuleMaterializationIssue[];
  readonly additions: readonly BfnProvenanceRecord[];
  readonly references: readonly string[];
}

const provenanceKinds = new Set<string>([
  'dataset',
  'publication',
  'repository_record',
  'user_note',
]);

/**
 * Converts one validated authoring draft into exactly one BFN-IR 2.2 module.
 * The function is deterministic and does not mutate either input.
 */
export function materializeUserDefinedStaticModule(
  draft: UserDefinedFunctionalModuleDraft,
  project: BfnProject,
  options: UserModuleMaterializationOptions = {},
): UserModuleMaterializationResult {
  const assessment = assessUserDefinedFunctionalModule(draft);
  const gateIssues: UserModuleMaterializationIssue[] = [];

  if (assessment.semantic.state !== 'valid') {
    gateIssues.push({
      code: 'semantic_invalid',
      path: 'draft',
      details: assessment.semantic.issues.map((item) => `${item.path}:${item.code}`),
    });
  }
  if (assessment.runtime.state !== 'supported') {
    gateIssues.push({
      code: 'runtime_unsupported',
      path: 'model',
      details: assessment.runtime.issues.map((item) => `${item.path}:${item.code}`),
    });
  }
  if (assessment.evidence.issues.length > 0 || assessment.evidence.provenanceState === 'missing') {
    gateIssues.push({
      code: 'evidence_unclaimable',
      path: 'evidence',
      details: assessment.evidence.issues.map((item) => `${item.path}:${item.code}`),
    });
  }
  if (
    assessment.implementation.state === 'unrecognized' ||
    assessment.implementation.issues.length > 0
  ) {
    gateIssues.push({
      code: 'implementation_invalid',
      path: 'implementation',
      details: assessment.implementation.issues.map((item) => `${item.path}:${item.code}`),
    });
  }
  if (
    draft.uncertainty.state === 'reported' &&
    draft.uncertainty.method !== 'parameter_interval_envelope'
  ) {
    gateIssues.push({
      code: 'uncertainty_method_not_authorable',
      path: 'uncertainty.method',
      details: [draft.uncertainty.method],
    });
  }
  if (gateIssues.length > 0) return failure(gateIssues);

  if (draft.context.state === 'defined' && !hasDefinedContextFact(draft.context.facts)) {
    return failure([{ code: 'defined_context_empty', path: 'context.facts' }]);
  }

  if (
    draft.uncertainty.state === 'reported' &&
    draft.uncertainty.method === 'parameter_interval_envelope'
  ) {
    const incompletePaths = requiredParameters(draft).flatMap(({ parameter, path }) =>
      hasCompleteInterval(parameter) ? [] : [path],
    );
    if (incompletePaths.length > 0) {
      return failure([
        {
          code: 'parameter_interval_incomplete',
          path: 'model',
          details: incompletePaths,
        },
      ]);
    }
  }

  const missingImplementationIds = draft.implementation.implementationIds.filter(
    (id) => !project.registry.implementations.some((implementation) => implementation.id === id),
  );
  if (missingImplementationIds.length > 0) {
    return failure([
      {
        code: 'implementation_reference_missing',
        path: 'implementation.implementationIds',
        details: missingImplementationIds,
      },
    ]);
  }

  const provenanceAudit = auditProvenance(draft, project);
  if (provenanceAudit.issues.length > 0) return failure(provenanceAudit.issues);

  const ids = deriveIds(draft);
  const proposedIds = [
    draft.id,
    ...draft.ports.map((port) => port.id),
    ids.model,
    ids.domain,
    ...(draft.context.state === 'defined' ? [ids.context] : []),
    ...provenanceAudit.additions.map((record) => record.id),
  ];
  const existingIds = collectDefinedIds(project);
  const duplicateProposedIds = proposedIds.filter((id, index) => proposedIds.indexOf(id) !== index);
  const collidingIds = unique([
    ...proposedIds.filter((id) => existingIds.has(id)),
    ...duplicateProposedIds,
  ]);
  if (collidingIds.length > 0) {
    return failure([
      {
        code: 'generated_id_collision',
        path: 'id',
        details: collidingIds,
      },
    ]);
  }

  const entityAudit = auditEntities(draft, project, options.authoritativeEntities ?? []);
  if (entityAudit.issues.length > 0) return failure(entityAudit.issues);

  const response = materializeResponse(draft);
  const evidenceGrade = toEvidenceGrade(draft.evidence.basis);
  const uncertaintyMethod = toUncertaintyMethod(draft);
  const implementationState = toImplementationState(draft.implementation.state);
  const ports = materializePorts(draft.ports);
  if (!response || !evidenceGrade || !uncertaintyMethod || !implementationState || !ports) {
    return failure([{ code: 'semantic_invalid', path: 'draft' }]);
  }

  const context = materializeContext(draft, ids.context);
  const contextId = context?.id ?? null;
  const inputRanges = draft.validityDomains.flatMap((domain) =>
    isUnit(domain.unit)
      ? [
          {
            portId: domain.portId,
            minimum: domain.minimum,
            maximum: domain.maximum,
            unit: domain.unit,
          },
        ]
      : [],
  );
  if (inputRanges.length !== draft.validityDomains.length) {
    return failure([{ code: 'semantic_invalid', path: 'validityDomains' }]);
  }
  const validityDomain: BfnValidityDomain = {
    id: ids.domain,
    labelKey: 'bfn.userDefined.genericValidityDomain',
    inputRanges,
    contextId,
  };
  const module: BfnFunctionalModule = {
    kind: 'functional_module',
    id: draft.id,
    labelKey: 'bfn.userDefined.genericModule',
    authoring: {
      origin: 'user_defined',
      name: draft.name,
      description: draft.description,
    },
    descriptionKey: 'bfn.userDefined.genericDescription',
    inputPorts: ports.filter((port) => port.direction === 'input'),
    outputPorts: ports.filter((port) => port.direction === 'output'),
    modelVariants: [
      {
        id: ids.model,
        version: '1.0.0',
        mode: 'static',
        family: response.family,
        response,
        contextId,
        validityDomainId: ids.domain,
        sourceDatasetIds: [],
        provenanceIds: [...provenanceAudit.references],
        evidenceGrade,
        uncertaintyMethod,
        isDemo: false,
      },
    ],
    activeModelIds: { static: ids.model },
    implementationIds: [...draft.implementation.implementationIds],
    implementationState,
    evidenceGrade,
    position: findBfnModulePlacement(project, {
      x: 0,
      y: 0,
      width: BFN_CANVAS_SIZE.width,
      height: BFN_CANVAS_SIZE.height,
    }),
    isDemo: false,
  };

  const nextProject = structuredClone(project);
  nextProject.network.modules.push(module);
  nextProject.registry.entities.push(...entityAudit.additions);
  nextProject.registry.validityDomains.push(validityDomain);
  if (context) nextProject.registry.contexts.push(context);
  nextProject.registry.provenanceRecords.push(...provenanceAudit.additions);

  return { ok: true, nextProject, addedModuleId: draft.id };
}

function deriveIds(draft: UserDefinedFunctionalModuleDraft): MaterializationIds {
  return {
    model: `${draft.id}.model.static.v1`,
    domain: `${draft.id}.domain.v1`,
    context: `${draft.id}.context.v1`,
  };
}

function materializePorts(draftPorts: readonly UserModulePortDraft[]): BfnPort[] | null {
  const ports: BfnPort[] = [];
  for (const port of draftPorts) {
    if (!isQuantityType(port.quantityType) || !isUnit(port.unit)) return null;
    ports.push({
      id: port.id,
      authoring: { origin: 'user_defined', name: port.name },
      entity: port.entity.id,
      quantityType: port.quantityType,
      unit: port.unit,
      direction: port.direction,
    });
  }
  return ports;
}

function materializeResponse(draft: UserDefinedFunctionalModuleDraft): BfnStaticResponse | null {
  const parameters = draft.model.parameters;
  if (draft.model.family === 'hill_activation' || draft.model.family === 'hill_repression') {
    const k = toParameter(parameters.k);
    const n = toParameter(parameters.n);
    const ymin = toParameter(parameters.ymin);
    const ymax = toParameter(parameters.ymax);
    const inputPortId = draft.model.inputPortIds[0];
    if (!k || !n || !ymin || !ymax || !inputPortId) return null;
    return { family: draft.model.family, inputPortId, k, n, ymin, ymax };
  }
  if (draft.model.family === 'linear_transfer') {
    const scale = toParameter(parameters.scale);
    const intercept = toParameter(parameters.intercept);
    const inputPortId = draft.model.inputPortIds[0];
    if (!scale || !intercept || !inputPortId) return null;
    return { family: 'linear_transfer', inputPortId, scale, intercept };
  }
  if (draft.model.family !== 'independent_inputs') return null;
  const basal = toParameter(parameters.basal);
  const outputMaximum = toParameter(parameters.outputMaximum);
  if (!basal || !outputMaximum || !draft.model.terms) return null;
  const terms = draft.model.terms.map((term) => {
    const k = toParameter(term.k);
    const n = toParameter(term.n);
    const contribution = toParameter(term.weight);
    if (!k || !n || !contribution || (term.mode !== 'activation' && term.mode !== 'repression')) {
      return null;
    }
    const direction: 'activation' | 'repression' = term.mode;
    return { inputPortId: term.inputPortId, direction, k, n, contribution };
  });
  if (terms.some((term) => term === null)) return null;
  if (draft.model.aggregation !== 'bounded_sum' && draft.model.aggregation !== 'multiplicative') {
    return null;
  }
  return {
    family: 'independent_inputs',
    terms: terms.filter((term) => term !== null),
    basal,
    outputMaximum,
    aggregation: draft.model.aggregation,
    interactionAssumption: 'independent_unverified',
  };
}

function toParameter(parameter: UserModuleParameterDraft | undefined): BfnParameterEstimate | null {
  if (!parameter || !isUnit(parameter.unit)) return null;
  const interval95: readonly [number, number] | undefined = parameter.interval95
    ? [parameter.interval95[0], parameter.interval95[1]]
    : undefined;
  return {
    value: parameter.value,
    unit: parameter.unit,
    ...(interval95 ? { interval95 } : {}),
  };
}

function requiredParameters(
  draft: UserDefinedFunctionalModuleDraft,
): readonly { readonly parameter: UserModuleParameterDraft | undefined; readonly path: string }[] {
  if (draft.model.family === 'hill_activation' || draft.model.family === 'hill_repression') {
    return ['k', 'n', 'ymin', 'ymax'].map((name) => ({
      parameter: draft.model.parameters[name],
      path: `model.parameters.${name}`,
    }));
  }
  if (draft.model.family === 'linear_transfer') {
    return ['scale', 'intercept'].map((name) => ({
      parameter: draft.model.parameters[name],
      path: `model.parameters.${name}`,
    }));
  }
  return [
    { parameter: draft.model.parameters.basal, path: 'model.parameters.basal' },
    {
      parameter: draft.model.parameters.outputMaximum,
      path: 'model.parameters.outputMaximum',
    },
    ...(draft.model.terms ?? []).flatMap((term, index) => [
      { parameter: term.k, path: `model.terms[${index}].k` },
      { parameter: term.n, path: `model.terms[${index}].n` },
      { parameter: term.weight, path: `model.terms[${index}].weight` },
    ]),
  ];
}

function hasCompleteInterval(parameter: UserModuleParameterDraft | undefined): boolean {
  const interval = parameter?.interval95;
  return Boolean(
    parameter &&
    interval &&
    Number.isFinite(interval[0]) &&
    Number.isFinite(interval[1]) &&
    interval[0] <= parameter.value &&
    parameter.value <= interval[1],
  );
}

function materializeContext(
  draft: UserDefinedFunctionalModuleDraft,
  contextId: string,
): BfnContext | null {
  if (draft.context.state === 'not_recorded') return null;
  const facts = draft.context.facts;
  const complete =
    hasText(facts.hostSpecies) &&
    hasText(facts.hostStrain) &&
    hasText(facts.medium) &&
    Number.isFinite(facts.temperatureCelsius);
  return {
    id: contextId,
    labelKey: 'bfn.userDefined.genericContext',
    documentationState: complete ? 'recorded' : 'partial',
    host: facts.hostSpecies ?? null,
    strain: facts.hostStrain ?? null,
    medium: facts.medium ?? null,
    temperatureCelsius: facts.temperatureCelsius ?? null,
    ph: facts.ph ?? null,
    oxygenation: null,
    growthPhase: null,
    plasmidBackbone: null,
    copyNumberRegime: null,
    inductionProtocol: null,
    measurementTimeHours: null,
    batch: null,
    isDemo: false,
  };
}

function auditProvenance(
  draft: UserDefinedFunctionalModuleDraft,
  project: BfnProject,
): ProvenanceAudit {
  const existingById = new Map(
    project.registry.provenanceRecords.map((record) => [record.id, record] as const),
  );
  const proposedById = new Map<string, BfnProvenanceRecord>();
  const issues: UserModuleMaterializationIssue[] = [];
  const additions: BfnProvenanceRecord[] = [];
  const references: string[] = [];

  for (const [index, record] of draft.evidence.provenance.entries()) {
    if (!isProvenanceKind(record.kind)) continue;
    const proposedRecord: BfnProvenanceRecord = {
      id: record.id,
      kind: record.kind,
      reference: record.reference,
    };
    const existing = existingById.get(proposedRecord.id);
    const proposed = proposedById.get(proposedRecord.id);
    if (
      (existing && !sameProvenanceRecord(existing, proposedRecord)) ||
      (proposed && !sameProvenanceRecord(proposed, proposedRecord))
    ) {
      issues.push({
        code: 'provenance_record_conflict',
        path: `evidence.provenance[${index}]`,
        details: [proposedRecord.id],
      });
      continue;
    }
    if (!proposed) {
      proposedById.set(proposedRecord.id, proposedRecord);
      if (!existing) additions.push(proposedRecord);
    }
    if (!references.includes(proposedRecord.id)) references.push(proposedRecord.id);
  }

  return { issues, additions, references };
}

function sameProvenanceRecord(left: BfnProvenanceRecord, right: BfnProvenanceRecord): boolean {
  return left.kind === right.kind && left.reference === right.reference;
}

function auditEntities(
  draft: UserDefinedFunctionalModuleDraft,
  project: BfnProject,
  authoritativeEntities: readonly UserModuleAuthoritativeEntity[],
): EntityAudit {
  const authoritativeNames = collectEntityNames(project);
  const knownEntityIds = collectEntityIds(project);
  const externalNames = new Map<string, string>();
  const proposedNames = new Map<string, string>();
  const additions: BfnEntityDefinition[] = [];
  const issues: UserModuleMaterializationIssue[] = [];

  for (const [index, entity] of authoritativeEntities.entries()) {
    const external = externalNames.get(entity.id);
    const projectNames = authoritativeNames.get(entity.id);
    if (
      (external !== undefined && external !== entity.displayName) ||
      (projectNames !== undefined && !projectNames.has(entity.displayName))
    ) {
      issues.push({
        code: 'entity_display_name_conflict',
        path: `options.authoritativeEntities[${index}].displayName`,
        details: [entity.id],
      });
      continue;
    }
    if (external === undefined) externalNames.set(entity.id, entity.displayName);
  }

  for (const [index, port] of draft.ports.entries()) {
    const id = port.entity.id;
    const displayName = port.entity.displayName;
    const authoritative = authoritativeNames.get(id);
    const external = externalNames.get(id);
    if (
      (external !== undefined && external !== displayName) ||
      (external === undefined && authoritative !== undefined && !authoritative.has(displayName))
    ) {
      issues.push({
        code: 'entity_display_name_conflict',
        path: `ports[${index}].entity.displayName`,
        details: [id],
      });
      continue;
    }
    const proposed = proposedNames.get(id);
    if (proposed !== undefined && proposed !== displayName) {
      issues.push({
        code: 'entity_display_name_conflict',
        path: `ports[${index}].entity.displayName`,
        details: [id],
      });
      continue;
    }
    if (proposed === undefined) proposedNames.set(id, displayName);
    if (
      external === undefined &&
      !knownEntityIds.has(id) &&
      !additions.some((entity) => entity.id === id)
    ) {
      additions.push({ id, origin: 'user_defined', displayName, description: null });
    }
  }
  return { issues, additions };
}

function collectEntityNames(project: BfnProject): ReadonlyMap<string, ReadonlySet<string>> {
  const names = new Map<string, Set<string>>();
  for (const entity of project.registry.entities) addName(names, entity.id, entity.displayName);
  for (const port of allProjectPorts(project)) {
    if (port.displayName) {
      addName(names, port.entity, port.displayName.en);
      addName(names, port.entity, port.displayName.zh);
    }
  }
  return names;
}

function addName(names: Map<string, Set<string>>, id: string, name: string): void {
  const current = names.get(id) ?? new Set<string>();
  current.add(name);
  names.set(id, current);
}

function collectEntityIds(project: BfnProject): ReadonlySet<string> {
  return new Set([
    ...project.registry.entities.map((entity) => entity.id),
    ...allProjectPorts(project).map((port) => port.entity),
  ]);
}

function allProjectPorts(project: BfnProject): BfnPort[] {
  return [
    ...project.network.inputSources.map((source) => source.outputPort),
    ...project.network.modules.flatMap((module) => [...module.inputPorts, ...module.outputPorts]),
    ...project.network.outputMonitors.map((monitor) => monitor.inputPort),
  ];
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

function hasDefinedContextFact(facts: {
  readonly hostSpecies?: string;
  readonly hostStrain?: string;
  readonly medium?: string;
  readonly temperatureCelsius?: number;
  readonly ph?: number;
}): boolean {
  return Object.values(facts).some((value) => value !== undefined);
}

function toEvidenceGrade(value: string): BfnEvidenceGrade | null {
  return isEvidenceGrade(value) ? value : null;
}

function toUncertaintyMethod(draft: UserDefinedFunctionalModuleDraft): BfnUncertaintyMethod | null {
  if (draft.uncertainty.state === 'not_recorded') return 'not_recorded';
  if (draft.uncertainty.state === 'none') return 'none';
  const method = draft.uncertainty.method;
  if (method === 'parameter_interval_envelope') return method;
  return null;
}

function toImplementationState(value: string): BfnModuleImplementationState | null {
  if (value === 'unspecified') return value;
  if (value === 'designed') return value;
  if (value === 'candidate') return value;
  if (value === 'reported') return value;
  if (value === 'validated') return value;
  return null;
}

function isQuantityType(value: string): value is BfnQuantityType {
  return USER_MODULE_QUANTITY_TYPES.some((candidate) => candidate === value);
}

function isUnit(value: string): value is BfnUnit {
  return USER_MODULE_UNITS.some((candidate) => candidate === value);
}

function isEvidenceGrade(value: string): value is BfnEvidenceGrade {
  return USER_MODULE_EVIDENCE_BASES.some((candidate) => candidate === value);
}

function isProvenanceKind(value: string): value is BfnProvenanceKind {
  return provenanceKinds.has(value);
}

function hasText(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(
  issues: readonly UserModuleMaterializationIssue[],
): UserModuleMaterializationFailure {
  return { ok: false, issues };
}
