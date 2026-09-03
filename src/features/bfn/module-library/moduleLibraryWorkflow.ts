import type { BfnFunctionalModule, BfnPort, BfnProject } from '../types';
import {
  BFN_MODULE_LIBRARY_DATABASE_BLOCKED,
  BFN_MODULE_LIBRARY_INPUT_INVALID,
  BFN_MODULE_LIBRARY_METADATA_CORRUPT,
  BFN_MODULE_LIBRARY_REVISION_CONFLICT,
  BFN_MODULE_LIBRARY_STATE_CORRUPT,
  BFN_MODULE_LIBRARY_STORAGE_FAILED,
  BFN_MODULE_LIBRARY_TEMPLATE_EXISTS,
  BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND,
  BFN_MODULE_LIBRARY_VERSION_CORRUPT,
  BfnModuleLibraryRepositoryError,
} from './moduleLibraryTypes';
import {
  captureReusableModuleTemplatePayload,
  resolveCanonicalEntityById,
  type BfnReusableModulePayloadV1,
  type BfnTemplateCaptureIssueCode,
  type BfnTemplateContractIssue,
  type BfnTemplateEntityBindingDecisions,
  type BfnTemplateEntityPolicy,
  type BfnTemplateInstantiationIssueCode,
} from './template';

export type ModuleLibraryCaptureFailureKind =
  | 'not-user-module'
  | 'dataset'
  | 'calibration'
  | 'unsupported-model'
  | 'extra-model'
  | 'dependency'
  | 'entity'
  | 'incomplete';

export type ModuleLibraryRepositoryFailureKind =
  'corrupt' | 'blocked' | 'conflict' | 'missing' | 'invalid' | 'unavailable';

export type ModuleLibraryInstantiationFailureKind =
  'corrupt' | 'entity' | 'collision' | 'project' | 'incomplete';

export interface ReusableModuleEntityRequirement {
  readonly direction: 'input' | 'output';
  readonly quantityType: BfnPort['quantityType'];
  readonly unit: BfnPort['unit'];
}

export interface ReusableModuleEntityChoice {
  /** Internal source identity. Never render this value as user-facing copy. */
  readonly sourceEntityId: string;
  readonly displayName: string | null;
  readonly description: string | null;
  readonly handling: 'recognized-standard' | 'save-with-module' | 'confirm-in-project';
  readonly userSelectable: boolean;
  readonly requirements: readonly ReusableModuleEntityRequirement[];
}

export interface SupportedReusableModuleCapture {
  readonly supported: true;
  readonly module: BfnFunctionalModule;
  readonly payload: BfnReusableModulePayloadV1;
  readonly entityChoices: readonly ReusableModuleEntityChoice[];
  readonly entityPolicies: Readonly<Record<string, BfnTemplateEntityPolicy>>;
}

export interface UnsupportedReusableModuleCapture {
  readonly supported: false;
  readonly issues: readonly BfnTemplateContractIssue[];
  readonly failureKind: ModuleLibraryCaptureFailureKind;
}

export type ReusableModuleCaptureAvailability =
  SupportedReusableModuleCapture | UnsupportedReusableModuleCapture;

/**
 * Builds the UI-facing capture state without changing the Project or repository.
 * Private entities default to travelling with the module; shared entities always
 * require an explicit identity decision in the target Project.
 */
export function buildReusableModuleCaptureAvailability(
  project: BfnProject,
  moduleId: string,
  requestedPolicies: Readonly<Record<string, BfnTemplateEntityPolicy>> = {},
): ReusableModuleCaptureAvailability {
  const module = project.network.modules.find((candidate) => candidate.id === moduleId);
  const sourcePorts = module ? [...module.inputPorts, ...module.outputPorts] : [];
  const sourceEntityIds = [...new Set(sourcePorts.map((port) => port.entity))];
  const permissivePolicies = Object.fromEntries(
    sourceEntityIds.map((entityId) => [entityId, 'slot' as const]),
  );
  const preflight = captureReusableModuleTemplatePayload(project, moduleId, {
    entityPolicies: permissivePolicies,
  });
  if (!preflight.ok || !module) {
    const issues = preflight.ok
      ? ([{ code: 'module_not_found', path: 'moduleId' }] as const)
      : preflight.issues;
    return {
      supported: false,
      issues,
      failureKind: captureFailureKind(issues),
    };
  }

  const entityChoices = sourceEntityIds.map((sourceEntityId) =>
    describeCaptureEntity(project, module, sourcePorts, sourceEntityId),
  );
  const entityPolicies = Object.fromEntries(
    entityChoices
      .filter((choice) => choice.handling !== 'recognized-standard')
      .map((choice) => [
        choice.sourceEntityId,
        choice.userSelectable ? (requestedPolicies[choice.sourceEntityId] ?? 'embedded') : 'slot',
      ]),
  );
  const capture = captureReusableModuleTemplatePayload(project, moduleId, { entityPolicies });
  if (!capture.ok) {
    return {
      supported: false,
      issues: capture.issues,
      failureKind: captureFailureKind(capture.issues),
    };
  }
  return {
    supported: true,
    module,
    payload: capture.payload,
    entityChoices,
    entityPolicies,
  };
}

export function captureFailureKind(
  issues: readonly Pick<BfnTemplateContractIssue, 'code'>[],
): ModuleLibraryCaptureFailureKind {
  const codes = new Set(issues.map((issue) => issue.code as BfnTemplateCaptureIssueCode));
  if (codes.has('module_not_user_defined') || codes.has('module_not_found')) {
    return 'not-user-module';
  }
  if (codes.has('dataset_dependency_unsupported')) return 'dataset';
  if (codes.has('calibration_map_unsupported')) return 'calibration';
  if (codes.has('unsupported_dormant_model_variant')) return 'extra-model';
  if (codes.has('unsupported_model_family') || codes.has('module_class_unsupported')) {
    return 'unsupported-model';
  }
  if (codes.has('dependency_missing') || codes.has('dependency_conflict')) return 'dependency';
  if (
    codes.has('entity_policy_missing') ||
    codes.has('entity_policy_invalid') ||
    codes.has('entity_definition_missing') ||
    codes.has('entity_definition_conflict') ||
    codes.has('embedded_entity_ineligible') ||
    codes.has('canonical_entity_conflict')
  ) {
    return 'entity';
  }
  return 'incomplete';
}

export function repositoryFailureKind(error: unknown): ModuleLibraryRepositoryFailureKind {
  if (!(error instanceof BfnModuleLibraryRepositoryError)) return 'unavailable';
  switch (error.code) {
    case BFN_MODULE_LIBRARY_METADATA_CORRUPT:
    case BFN_MODULE_LIBRARY_VERSION_CORRUPT:
    case BFN_MODULE_LIBRARY_STATE_CORRUPT:
      return 'corrupt';
    case BFN_MODULE_LIBRARY_DATABASE_BLOCKED:
      return 'blocked';
    case BFN_MODULE_LIBRARY_TEMPLATE_EXISTS:
    case BFN_MODULE_LIBRARY_REVISION_CONFLICT:
      return 'conflict';
    case BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND:
      return 'missing';
    case BFN_MODULE_LIBRARY_INPUT_INVALID:
      return 'invalid';
    case BFN_MODULE_LIBRARY_STORAGE_FAILED:
      return 'unavailable';
  }
}

export function instantiationFailureKind(
  issues: readonly Pick<BfnTemplateContractIssue, 'code'>[],
): ModuleLibraryInstantiationFailureKind {
  const codes = new Set(issues.map((issue) => issue.code as BfnTemplateInstantiationIssueCode));
  if (codes.has('template_schema_invalid')) return 'corrupt';
  if (codes.has('generated_id_collision')) return 'collision';
  if (
    codes.has('entity_binding_missing') ||
    codes.has('entity_binding_invalid') ||
    codes.has('unexpected_entity_binding') ||
    codes.has('entity_target_missing') ||
    codes.has('entity_mapping_non_injective') ||
    codes.has('canonical_entity_invalid')
  ) {
    return 'entity';
  }
  if (codes.has('target_project_schema_invalid')) return 'project';
  return 'incomplete';
}

export function createTemplateIdCandidate(name: string, timestamp: string): string {
  return `library.module.${scientificObjectSlug(name)}.${timestampToken(timestamp)}`;
}

/** Selects one pre-checked candidate and never retries after contract admission. */
export function createModuleInstanceIdCandidate(
  name: string,
  timestamp: string,
  project: BfnProject,
): string | null {
  const candidate = `user.module.${scientificObjectSlug(name)}-library-${timestampToken(timestamp)}`;
  return collectDefinedIds(project).has(candidate) ? null : candidate;
}

export interface ProjectEntityChoice {
  /** Internal target identity. Never render this value as user-facing copy. */
  readonly entityId: string;
  readonly displayName: string | null;
  readonly requirements: readonly ReusableModuleEntityRequirement[];
}

/** Returns every exact Project entity choice without name or unit based matching. */
export function listProjectEntityChoices(project: BfnProject): readonly ProjectEntityChoice[] {
  const definitions = new Map(project.registry.entities.map((entity) => [entity.id, entity]));
  const ports = allProjectPorts(project);
  const entityIds = [
    ...new Set([
      ...definitions.keys(),
      ...ports.map((port) => port.entity),
      ...project.registry.datasets.flatMap((dataset) => [
        ...dataset.inputEntities,
        ...dataset.outputEntities,
      ]),
    ]),
  ];
  return entityIds.map((entityId) => ({
    entityId,
    displayName: definitions.get(entityId)?.displayName ?? friendlyPortEntityName(ports, entityId),
    requirements: uniqueRequirements(ports.filter((port) => port.entity === entityId)),
  }));
}

export interface EntityBindingFormValue {
  readonly mode: 'existing' | 'create';
  readonly targetEntityId: string;
  readonly confirmed: boolean;
}

export function buildEntityBindingDecisions(
  slotKeys: readonly string[],
  values: Readonly<Record<string, EntityBindingFormValue | undefined>>,
): BfnTemplateEntityBindingDecisions | null {
  const entries: [string, BfnTemplateEntityBindingDecisions[string]][] = [];
  for (const key of slotKeys) {
    const value = values[key];
    if (!value?.confirmed) return null;
    if (value.mode === 'existing') {
      if (value.targetEntityId.trim().length === 0) return null;
      entries.push([
        key,
        {
          mode: 'existing_same_entity',
          targetEntityId: value.targetEntityId,
          identityConfirmation: 'same_scientific_entity',
        },
      ]);
    } else {
      entries.push([
        key,
        { mode: 'create_same_entity', identityConfirmation: 'same_scientific_entity' },
      ]);
    }
  }
  return Object.fromEntries(entries);
}

function describeCaptureEntity(
  project: BfnProject,
  module: BfnFunctionalModule,
  sourcePorts: readonly BfnPort[],
  sourceEntityId: string,
): ReusableModuleEntityChoice {
  const canonical = resolveCanonicalEntityById(sourceEntityId);
  const definition = project.registry.entities.find((entity) => entity.id === sourceEntityId);
  const requirements = uniqueRequirements(
    sourcePorts.filter((port) => port.entity === sourceEntityId),
  );
  if (canonical) {
    return {
      sourceEntityId,
      displayName: canonical.displayName,
      description: null,
      handling: 'recognized-standard',
      userSelectable: false,
      requirements,
    };
  }
  const shared = entityReferencedOutsideModule(project, module.id, sourceEntityId);
  const canTravel = Boolean(definition) && !shared;
  return {
    sourceEntityId,
    displayName: definition?.displayName ?? friendlyPortEntityName(sourcePorts, sourceEntityId),
    description: definition?.description ?? null,
    handling: canTravel ? 'save-with-module' : 'confirm-in-project',
    userSelectable: canTravel,
    requirements,
  };
}

function entityReferencedOutsideModule(
  project: BfnProject,
  moduleId: string,
  entityId: string,
): boolean {
  return (
    project.network.modules.some(
      (candidate) =>
        candidate.id !== moduleId &&
        [...candidate.inputPorts, ...candidate.outputPorts].some(
          (port) => port.entity === entityId,
        ),
    ) ||
    project.network.inputSources.some((source) => source.outputPort.entity === entityId) ||
    project.network.outputMonitors.some((monitor) => monitor.inputPort.entity === entityId) ||
    project.registry.datasets.some(
      (dataset) =>
        dataset.inputEntities.includes(entityId) || dataset.outputEntities.includes(entityId),
    )
  );
}

function allProjectPorts(project: BfnProject): readonly BfnPort[] {
  return [
    ...project.network.inputSources.map((source) => source.outputPort),
    ...project.network.modules.flatMap((module) => [...module.inputPorts, ...module.outputPorts]),
    ...project.network.outputMonitors.map((monitor) => monitor.inputPort),
  ];
}

function friendlyPortEntityName(ports: readonly BfnPort[], entityId: string): string | null {
  const port = ports.find((candidate) => candidate.entity === entityId);
  return port?.authoring?.name ?? port?.displayName?.en ?? port?.displayName?.zh ?? null;
}

function uniqueRequirements(ports: readonly BfnPort[]): readonly ReusableModuleEntityRequirement[] {
  const seen = new Set<string>();
  return ports.flatMap((port) => {
    const key = `${port.direction}:${port.quantityType}:${port.unit}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ direction: port.direction, quantityType: port.quantityType, unit: port.unit }];
  });
}

function scientificObjectSlug(value: string): string {
  const normalized = value.trim().normalize('NFKD').toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40);
  return slug || `module-${stableTextHash(normalized || 'module')}`;
}

function timestampToken(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp.toString(36) : stableTextHash(value);
}

function stableTextHash(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function collectDefinedIds(value: unknown, ids = new Set<string>()): ReadonlySet<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectDefinedIds(item, ids);
    return ids;
  }
  if (value === null || typeof value !== 'object') return ids;
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'string') ids.add(record.id);
  for (const child of Object.values(record)) collectDefinedIds(child, ids);
  return ids;
}
