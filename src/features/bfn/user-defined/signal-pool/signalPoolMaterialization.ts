import { assessBfnAccumulatorRuntimeContract } from '../../accumulatorRuntimeContract';
import { BFN_CANVAS_SIZE, findBfnModulePlacement } from '../../nodePlacement';
import type {
  BfnAccumulatorDynamicModel,
  BfnEntityDefinition,
  BfnFunctionalModule,
  BfnPort,
  BfnProject,
  BfnValidityDomain,
} from '../../types';
import { getDesignedSenderSignalCatalog } from '../designed-sender/designedSenderSignalCatalog';
import { signalPoolUnitPair, type SignalPoolDraft } from './signalPoolContract';
import { collectSignalPoolEligibleEntityIds } from './signalPoolEntityEligibility';

export type SignalPoolMaterializationIssueCode =
  | 'draft_invalid'
  | 'signal_identity_invalid'
  | 'entity_definition_conflict'
  | 'generated_id_collision'
  | 'accumulator_contract_invalid';

export interface SignalPoolMaterializationIssue {
  readonly code: SignalPoolMaterializationIssueCode;
  readonly path: string;
  readonly details?: readonly string[];
}

export type SignalPoolMaterializationResult =
  | {
      readonly ok: true;
      readonly nextProject: BfnProject;
      readonly addedModuleId: string;
    }
  | {
      readonly ok: false;
      readonly issues: readonly SignalPoolMaterializationIssue[];
    };

/**
 * Materializes authoring metadata only. Accumulation remains exclusively owned
 * by the BFN-SIM 2.2 accumulator runtime.
 */
export function materializeSignalPool(
  draft: SignalPoolDraft,
  project: BfnProject,
): SignalPoolMaterializationResult {
  const entityIssue = validateEntityIdentity(draft, project);
  if (entityIssue) return failure([entityIssue]);

  const draftIssue = validateDraftShape(draft);
  if (draftIssue) return failure([draftIssue]);

  const modelId = `${draft.id}.model.accumulator.v1`;
  const domainId = `${draft.id}.domain.v1`;
  const generatedIds = [
    draft.id,
    draft.inputPort.id,
    draft.outputPort.id,
    modelId,
    domainId,
    ...(draft.signal.source === 'custom' ? [draft.signal.entityId] : []),
  ];
  const duplicateGeneratedIds = generatedIds.filter(
    (id, index) => generatedIds.indexOf(id) !== index,
  );
  const existingIds = collectDefinedIds(project);
  const collisions = unique([
    ...generatedIds.filter((id) => existingIds.has(id)),
    ...duplicateGeneratedIds,
  ]);
  if (collisions.length > 0) {
    return failure([{ code: 'generated_id_collision', path: 'id', details: collisions }]);
  }

  const inputPort: BfnPort = {
    id: draft.inputPort.id,
    displayName: { en: 'Production rate', zh: '产生速率' },
    entity: draft.signal.entityId,
    quantityType: 'production_rate',
    unit: draft.inputPort.unit,
    direction: 'input',
  };
  const outputPort: BfnPort = {
    id: draft.outputPort.id,
    displayName: { en: 'Concentration', zh: '浓度' },
    entity: draft.signal.entityId,
    quantityType: 'concentration',
    unit: draft.outputPort.unit,
    direction: 'output',
  };
  const model: BfnAccumulatorDynamicModel = {
    id: modelId,
    version: '1.0.0',
    mode: 'dynamic',
    family: 'accumulator',
    inputPortId: inputPort.id,
    outputPortId: outputPort.id,
    initialState: draft.initialConcentration,
    contextId: null,
    validityDomainId: domainId,
    sourceDatasetIds: [],
    provenanceIds: [],
    evidenceGrade: 'independent_assumption',
    uncertaintyMethod: 'none',
    isDemo: false,
  };
  const module: BfnFunctionalModule = {
    kind: 'functional_module',
    id: draft.id,
    labelKey: 'bfn.signalPool.moduleLabel',
    authoring: {
      origin: 'user_defined',
      name: draft.name,
      description: draft.description,
    },
    descriptionKey: 'bfn.signalPool.description',
    inputPorts: [inputPort],
    outputPorts: [outputPort],
    modelVariants: [model],
    activeModelIds: { dynamic: model.id },
    implementationIds: [],
    implementationState: 'unspecified',
    evidenceGrade: 'independent_assumption',
    position: findBfnModulePlacement(project, {
      x: 0,
      y: 0,
      width: BFN_CANVAS_SIZE.width,
      height: BFN_CANVAS_SIZE.height,
    }),
    isDemo: false,
  };
  const contractReason = assessBfnAccumulatorRuntimeContract(module, model);
  if (contractReason) {
    return failure([
      {
        code: 'accumulator_contract_invalid',
        path: 'model',
        details: [contractReason],
      },
    ]);
  }

  const validityDomain: BfnValidityDomain = {
    id: domainId,
    labelKey: 'bfn.signalPool.validityDomain',
    inputRanges: [],
    contextId: null,
  };
  const entityDefinition: BfnEntityDefinition | null =
    draft.signal.source === 'custom'
      ? {
          id: draft.signal.entityId,
          origin: 'user_defined',
          displayName: draft.signal.displayName,
          description: null,
        }
      : null;
  const nextProject = structuredClone(project);
  nextProject.network.modules.push(module);
  nextProject.registry.validityDomains.push(validityDomain);
  if (entityDefinition) nextProject.registry.entities.push(entityDefinition);

  return { ok: true, nextProject, addedModuleId: module.id };
}

function validateDraftShape(draft: SignalPoolDraft): SignalPoolMaterializationIssue | null {
  if (!hasText(draft.id) || draft.origin !== 'user_defined' || !hasText(draft.name)) {
    return { code: 'draft_invalid', path: 'identity' };
  }
  if (draft.description !== null && typeof draft.description !== 'string') {
    return { code: 'draft_invalid', path: 'description' };
  }
  if (!Number.isFinite(draft.initialConcentration) || draft.initialConcentration < 0) {
    return { code: 'draft_invalid', path: 'initialConcentration' };
  }
  if (
    draft.inputPort.id !== `${draft.id}.port.input.production-rate` ||
    draft.outputPort.id !== `${draft.id}.port.output.concentration` ||
    draft.inputPort.entityId !== draft.signal.entityId ||
    draft.outputPort.entityId !== draft.signal.entityId ||
    draft.inputPort.quantityType !== 'production_rate' ||
    draft.outputPort.quantityType !== 'concentration' ||
    draft.inputPort.direction !== 'input' ||
    draft.outputPort.direction !== 'output'
  ) {
    return { code: 'draft_invalid', path: 'ports' };
  }
  if (draft.outputPort.unit !== 'nM' && draft.outputPort.unit !== 'uM') {
    return { code: 'draft_invalid', path: 'outputPort.unit' };
  }
  const pair = signalPoolUnitPair(draft.outputPort.unit);
  if (draft.inputPort.unit !== pair.productionRate) {
    // The central accumulator contract reports the stable scientific reason below.
    return null;
  }
  return null;
}

function validateEntityIdentity(
  draft: SignalPoolDraft,
  project: BfnProject,
): SignalPoolMaterializationIssue | null {
  const runtimeDraft: unknown = draft;
  if (!isRecord(runtimeDraft) || !isRecord(runtimeDraft.signal)) {
    return { code: 'signal_identity_invalid', path: 'signal' };
  }
  const signal = runtimeDraft.signal;

  switch (signal.source) {
    case 'known': {
      if (
        typeof signal.catalogSignalId !== 'string' ||
        typeof signal.entityId !== 'string' ||
        typeof signal.displayName !== 'string'
      ) {
        return { code: 'signal_identity_invalid', path: 'signal' };
      }
      const canonical = getDesignedSenderSignalCatalog().find(
        (candidate) => candidate.catalogSignalId === signal.catalogSignalId,
      );
      if (
        !canonical ||
        canonical.entityId !== signal.entityId ||
        canonical.displayName !== signal.displayName
      ) {
        return { code: 'signal_identity_invalid', path: 'signal' };
      }
      const definitions = project.registry.entities.filter(
        (entity) => entity.id === canonical.entityId,
      );
      if (definitions.some((entity) => entity.displayName !== canonical.displayName)) {
        return {
          code: 'entity_definition_conflict',
          path: 'signal.entityId',
          details: [canonical.entityId],
        };
      }
      return null;
    }
    case 'existing':
      if (
        typeof signal.entityId !== 'string' ||
        !collectSignalPoolEligibleEntityIds(project).includes(signal.entityId)
      ) {
        return { code: 'signal_identity_invalid', path: 'signal.entityId' };
      }
      return null;
    case 'custom':
      if (
        typeof signal.entityId !== 'string' ||
        typeof signal.displayName !== 'string' ||
        signal.entityId !== `${draft.id}.entity.signal` ||
        !hasText(signal.displayName)
      ) {
        return { code: 'signal_identity_invalid', path: 'signal' };
      }
      if (collectProjectEntityIds(project).has(signal.entityId)) {
        return {
          code: 'entity_definition_conflict',
          path: 'signal.entityId',
          details: [signal.entityId],
        };
      }
      return null;
    default:
      return { code: 'signal_identity_invalid', path: 'signal' };
  }
}

function collectProjectEntityIds(project: BfnProject): ReadonlySet<string> {
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

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(
  issues: readonly SignalPoolMaterializationIssue[],
): SignalPoolMaterializationResult {
  return { ok: false, issues };
}
