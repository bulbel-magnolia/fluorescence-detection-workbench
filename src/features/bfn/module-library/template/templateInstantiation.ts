import { assessBfnAccumulatorRuntimeContract } from '../../accumulatorRuntimeContract';
import { isBfnProjectV23 } from '../../bfnIrMigration';
import { BFN_CANVAS_SIZE, findBfnModulePlacement } from '../../nodePlacement';
import type {
  BfnAccumulatorDynamicModel,
  BfnBiologicalImplementation,
  BfnContext,
  BfnDynamicModel,
  BfnEntityDefinition,
  BfnFunctionalModule,
  BfnModelVariant,
  BfnParameterEstimate,
  BfnPort,
  BfnProject,
  BfnProvenanceRecord,
  BfnStaticModel,
  BfnStaticResponse,
  BfnValidityDomain,
} from '../../types';
import { canonicalTemplateEntityResolves, collectProjectEntityIds } from './templateEntityPolicy';
import { createInstantiatedReusableModuleScientificProjection } from './templateInstanceProjection';
import {
  canonicalDeepEqual,
  canonicalJson,
  hasOnlyKeys,
  isNonEmptyString,
  isNullableString,
  isPlainDataRecord,
} from './templateInternals';
import { parseBfnModuleTemplateVersion } from './templateParser';
import {
  createReusableModuleScientificProjection,
  reusableModuleScientificProjectionsEqual,
} from './templateProjection';
import {
  collectTemplateProjectReferenceIds,
  isTemplateProjectRuntimeSafe,
} from './templateProjectValidation';
import type {
  BfnModuleTemplateVersionV1,
  BfnReusableModulePayloadV1,
  BfnTemplateContractIssue,
  BfnTemplateEntityBindingDecision,
  BfnTemplateEntityBindingDecisions,
  BfnTemplateInstantiationIdMap,
  BfnTemplateInstantiationOptions,
  BfnTemplateInstantiationResult,
  BfnTemplateModelBaseV1,
  BfnTemplateStaticResponseV1,
} from './templateTypes';

/** Creates one independent module copy and the minimum required sidecars. */
export function instantiateReusableModuleTemplate(
  version: BfnModuleTemplateVersionV1,
  targetProject: BfnProject,
  bindings: BfnTemplateEntityBindingDecisions,
  options: BfnTemplateInstantiationOptions,
): BfnTemplateInstantiationResult {
  try {
    return instantiateReusableModuleTemplateUnchecked(version, targetProject, bindings, options);
  } catch {
    return failed('target_project_schema_invalid', 'targetProject');
  }
}

function instantiateReusableModuleTemplateUnchecked(
  version: BfnModuleTemplateVersionV1,
  targetProject: BfnProject,
  bindings: BfnTemplateEntityBindingDecisions,
  options: BfnTemplateInstantiationOptions,
): BfnTemplateInstantiationResult {
  let parsedVersion: BfnModuleTemplateVersionV1;
  try {
    parsedVersion = parseBfnModuleTemplateVersion(version);
  } catch {
    return failed('template_schema_invalid', 'version');
  }
  if (!isTemplateProjectRuntimeSafe(targetProject) || !isBfnProjectV23(targetProject)) {
    return failed('target_project_schema_invalid', 'targetProject');
  }
  if (!validOptions(options)) return failed('instantiation_options_invalid', 'options');
  if (!isPlainDataRecord(bindings)) return failed('entity_binding_invalid', 'bindings');

  const versionBefore = canonicalJson(version);
  const projectBefore = canonicalJson(targetProject);
  const bindingResult = resolveEntityBindings(
    parsedVersion.payload,
    targetProject,
    bindings,
    options,
  );
  if (!bindingResult.ok) return bindingResult;
  const concreteEntityIds = Object.values(bindingResult.entityIds);
  const convergedEntityIds = concreteEntityIds.filter(
    (id, index) => concreteEntityIds.indexOf(id) !== index,
  );
  if (convergedEntityIds.length > 0) {
    return failed('entity_mapping_non_injective', 'bindings', [...new Set(convergedEntityIds)]);
  }
  const idMap = createIdMap(parsedVersion.payload, options.instanceId, bindingResult.entityIds);

  const generatedIds = collectGeneratedIds(parsedVersion.payload, idMap, bindings);
  const duplicateIds = generatedIds.filter((id, index) => generatedIds.indexOf(id) !== index);
  const existingIds = new Set([
    ...collectDefinedIds(targetProject),
    ...collectProjectEntityIds(targetProject),
    ...collectTemplateProjectReferenceIds(targetProject),
    ...parsedVersion.payload.entities
      .filter((entity) => entity.mode === 'canonical')
      .map((entity) => entity.entityId),
    ...Object.values(bindingResult.preservedEntityIds),
  ]);
  const collisions = [
    ...new Set([...duplicateIds, ...generatedIds.filter((id) => existingIds.has(id))]),
  ];
  if (collisions.length > 0) {
    return failed('generated_id_collision', 'options.instanceId', collisions);
  }

  const additions = materializeDependencies(parsedVersion.payload, idMap);
  const module = materializeModule(parsedVersion.payload, idMap, options, targetProject);
  if (!module) return failed('scientific_contract_invalid', 'payload');
  const accumulatorModel = module.modelVariants.find(
    (model): model is BfnAccumulatorDynamicModel =>
      model.mode === 'dynamic' && model.family === 'accumulator',
  );
  if (accumulatorModel) {
    const reason = assessBfnAccumulatorRuntimeContract(module, accumulatorModel);
    if (reason) return failed('scientific_contract_invalid', 'payload.models.dynamic', [reason]);
  }
  if (parsedVersion.payload.moduleClass === 'first_order') {
    const staticModel = module.modelVariants[0];
    const dynamicModel = module.modelVariants[1];
    if (
      staticModel?.mode !== 'static' ||
      dynamicModel?.mode !== 'dynamic' ||
      dynamicModel.family !== 'first_order' ||
      !canonicalDeepEqual(staticModel.response, dynamicModel.steadyStateResponse)
    ) {
      return failed('scientific_contract_invalid', 'payload.models');
    }
  }

  const nextProject = structuredClone(targetProject);
  nextProject.network.modules.push(module);
  nextProject.registry.entities.push(...bindingResult.entityAdditions);
  nextProject.registry.contexts.push(...additions.contexts);
  nextProject.registry.validityDomains.push(...additions.domains);
  nextProject.registry.provenanceRecords.push(...additions.provenance);
  nextProject.registry.implementations.push(...additions.implementations);

  if (
    !referencesResolve(nextProject, module) ||
    !isTemplateProjectRuntimeSafe(nextProject) ||
    !isBfnProjectV23(nextProject)
  ) {
    return failed('scientific_contract_invalid', 'nextProject');
  }
  const instanceProjection = createInstantiatedReusableModuleScientificProjection(
    nextProject,
    module.id,
    parsedVersion.payload,
    idMap,
  );
  if (
    !instanceProjection ||
    !reusableModuleScientificProjectionsEqual(
      createReusableModuleScientificProjection(parsedVersion.payload),
      instanceProjection,
    )
  ) {
    return failed('scientific_projection_mismatch', 'nextProject.network.modules');
  }
  if (versionBefore !== canonicalJson(version) || projectBefore !== canonicalJson(targetProject)) {
    return failed('scientific_contract_invalid', 'purity');
  }
  return { ok: true, nextProject, addedModuleId: module.id, idMap };
}

type BindingResult =
  | {
      readonly ok: true;
      readonly entityIds: Readonly<Record<string, string>>;
      readonly preservedEntityIds: Readonly<Record<string, string>>;
      readonly entityAdditions: readonly BfnEntityDefinition[];
    }
  | Extract<BfnTemplateInstantiationResult, { readonly ok: false }>;

function resolveEntityBindings(
  payload: BfnReusableModulePayloadV1,
  target: BfnProject,
  bindings: BfnTemplateEntityBindingDecisions,
  options: BfnTemplateInstantiationOptions,
): BindingResult {
  const slotKeys = payload.entities
    .filter((entity) => entity.mode === 'slot')
    .map((entity) => entity.key);
  const unexpected = Object.keys(bindings).filter((key) => !slotKeys.includes(key));
  if (unexpected.length > 0) return failed('unexpected_entity_binding', 'bindings', unexpected);
  const knownTargetEntities = collectProjectEntityIds(target);
  const entityIds: Record<string, string> = {};
  const preservedEntityIds: Record<string, string> = {};
  const entityAdditions: BfnEntityDefinition[] = [];
  for (const entity of payload.entities) {
    if (entity.mode === 'canonical') {
      if (!canonicalTemplateEntityResolves(entity)) {
        return failed('canonical_entity_invalid', `payload.entities.${entity.key}`);
      }
      const conflicts = target.registry.entities.filter(
        (candidate) =>
          candidate.id === entity.entityId &&
          (candidate.displayName !== entity.displayName || candidate.description !== null),
      );
      if (conflicts.length > 0) {
        return failed('canonical_entity_invalid', `payload.entities.${entity.key}`);
      }
      entityIds[entity.key] = entity.entityId;
      preservedEntityIds[entity.key] = entity.entityId;
      continue;
    }
    if (entity.mode === 'embedded') {
      const id = `${options.instanceId}.${entity.key}`;
      entityIds[entity.key] = id;
      entityAdditions.push({
        id,
        origin: 'user_defined',
        displayName: entity.displayName,
        description: entity.description,
      });
      continue;
    }
    const decision = bindings[entity.key];
    if (decision === undefined) {
      return failed('entity_binding_missing', `bindings.${entity.key}`);
    }
    if (!validBindingDecision(decision)) {
      return failed('entity_binding_invalid', `bindings.${entity.key}`);
    }
    if (decision.mode === 'existing_same_entity') {
      if (!knownTargetEntities.has(decision.targetEntityId)) {
        return failed('entity_target_missing', `bindings.${entity.key}.targetEntityId`, [
          decision.targetEntityId,
        ]);
      }
      entityIds[entity.key] = decision.targetEntityId;
      preservedEntityIds[entity.key] = decision.targetEntityId;
    } else {
      const id = `${options.instanceId}.${entity.key}`;
      entityIds[entity.key] = id;
      entityAdditions.push({
        id,
        origin: 'user_defined',
        displayName: entity.displayName,
        description: entity.description,
      });
    }
  }
  return { ok: true, entityIds, preservedEntityIds, entityAdditions };
}

function validBindingDecision(value: unknown): value is BfnTemplateEntityBindingDecision {
  if (!isPlainDataRecord(value) || value.identityConfirmation !== 'same_scientific_entity') {
    return false;
  }
  if (value.mode === 'existing_same_entity') {
    return (
      hasOnlyKeys(value, ['mode', 'targetEntityId', 'identityConfirmation']) &&
      isNonEmptyString(value.targetEntityId)
    );
  }
  return (
    value.mode === 'create_same_entity' && hasOnlyKeys(value, ['mode', 'identityConfirmation'])
  );
}

function validOptions(value: unknown): value is BfnTemplateInstantiationOptions {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, ['instanceId', 'instanceName', 'instanceDescription']) &&
    isNonEmptyString(value.instanceId) &&
    isNonEmptyString(value.instanceName) &&
    isNullableString(value.instanceDescription)
  );
}

function createIdMap(
  payload: BfnReusableModulePayloadV1,
  instanceId: string,
  entityIds: Readonly<Record<string, string>>,
): BfnTemplateInstantiationIdMap {
  const ids = (keys: readonly string[], suffix = ''): Readonly<Record<string, string>> =>
    Object.fromEntries(keys.map((key) => [key, `${instanceId}.${key}${suffix}`]));
  return {
    moduleId: instanceId,
    portIds: ids(payload.ports.map((port) => port.key)),
    modelIds: ids(payloadModelKeys(payload), '.v1'),
    entityIds: { ...entityIds },
    contextIds: ids(payload.contexts.map((context) => context.key)),
    validityDomainIds: ids(payload.validityDomains.map((domain) => domain.key)),
    provenanceIds: ids(payload.provenance.map((record) => record.key)),
    implementationIds: ids(payload.implementations.map((implementation) => implementation.key)),
  };
}

function payloadModelKeys(payload: BfnReusableModulePayloadV1): readonly string[] {
  if (payload.moduleClass === 'static') return [payload.models.static.key];
  if (payload.moduleClass === 'first_order') {
    return [payload.models.static.key, payload.models.dynamic.key];
  }
  return [payload.models.dynamic.key];
}

function collectGeneratedIds(
  payload: BfnReusableModulePayloadV1,
  idMap: BfnTemplateInstantiationIdMap,
  bindings: BfnTemplateEntityBindingDecisions,
): string[] {
  const generatedEntityIds = payload.entities.flatMap((entity) => {
    if (entity.mode === 'embedded') return [idMap.entityIds[entity.key]!];
    if (entity.mode === 'slot' && bindings[entity.key]?.mode === 'create_same_entity') {
      return [idMap.entityIds[entity.key]!];
    }
    return [];
  });
  return [
    idMap.moduleId,
    ...Object.values(idMap.portIds),
    ...Object.values(idMap.modelIds),
    ...Object.values(idMap.contextIds),
    ...Object.values(idMap.validityDomainIds),
    ...Object.values(idMap.provenanceIds),
    ...Object.values(idMap.implementationIds),
    ...generatedEntityIds,
  ];
}

function materializeDependencies(
  payload: BfnReusableModulePayloadV1,
  idMap: BfnTemplateInstantiationIdMap,
) {
  const contexts: BfnContext[] = payload.contexts.map((context) => ({
    id: idMap.contextIds[context.key]!,
    labelKey: context.labelKey,
    documentationState: context.documentationState,
    host: context.host,
    strain: context.strain,
    medium: context.medium,
    temperatureCelsius: context.temperatureCelsius,
    ph: context.ph,
    oxygenation: context.oxygenation,
    growthPhase: context.growthPhase,
    plasmidBackbone: context.plasmidBackbone,
    copyNumberRegime: context.copyNumberRegime,
    inductionProtocol: context.inductionProtocol,
    measurementTimeHours: context.measurementTimeHours,
    batch: context.batch,
    isDemo: context.isDemo,
  }));
  const domains: BfnValidityDomain[] = payload.validityDomains.map((domain) => ({
    id: idMap.validityDomainIds[domain.key]!,
    labelKey: domain.labelKey,
    inputRanges: domain.inputRanges.map((range) => ({
      portId: idMap.portIds[range.portKey]!,
      minimum: range.minimum,
      maximum: range.maximum,
      unit: range.unit,
    })),
    ...(domain.timeRangeHours === undefined
      ? {}
      : { timeRangeHours: [domain.timeRangeHours[0], domain.timeRangeHours[1]] }),
    contextId: domain.contextKey === null ? null : idMap.contextIds[domain.contextKey]!,
  }));
  const provenance: BfnProvenanceRecord[] = payload.provenance.map((record) => ({
    id: idMap.provenanceIds[record.key]!,
    kind: record.kind,
    reference: record.reference,
  }));
  const implementations: BfnBiologicalImplementation[] = payload.implementations.map(
    (implementation) => ({
      id: idMap.implementationIds[implementation.key]!,
      labelKey: implementation.labelKey,
      promoter: implementation.promoter,
      operator: implementation.operator,
      rbs: implementation.rbs,
      codingSequence: implementation.codingSequence,
      degradationTag: implementation.degradationTag,
      plasmidBackbone: implementation.plasmidBackbone,
      host: implementation.host,
      strainComposition: implementation.strainComposition,
      evidenceGrade: implementation.evidenceGrade,
      maturity: implementation.maturity,
      provenanceIds: implementation.provenanceKeys.map((key) => idMap.provenanceIds[key]!),
      isDemo: implementation.isDemo,
    }),
  );
  return { contexts, domains, provenance, implementations };
}

function materializeModule(
  payload: BfnReusableModulePayloadV1,
  idMap: BfnTemplateInstantiationIdMap,
  options: BfnTemplateInstantiationOptions,
  project: BfnProject,
): BfnFunctionalModule | null {
  const ports: BfnPort[] = payload.ports.map((port) => ({
    id: idMap.portIds[port.key]!,
    ...(port.displayName ? { displayName: structuredClone(port.displayName) } : {}),
    ...(port.authoringName
      ? { authoring: { origin: 'user_defined' as const, name: port.authoringName } }
      : {}),
    entity: idMap.entityIds[port.entityKey]!,
    quantityType: port.quantityType,
    unit: port.unit,
    direction: port.direction,
  }));
  const models: BfnModelVariant[] = [];
  if (payload.moduleClass === 'static') {
    const model = materializeStaticModel(payload.models.static, idMap);
    if (!model) return null;
    models.push(model);
  } else if (payload.moduleClass === 'first_order') {
    const staticModel = materializeStaticModel(payload.models.static, idMap);
    const dynamicModel = materializeDynamicModel(payload.models.dynamic, idMap);
    if (!staticModel || !dynamicModel) return null;
    models.push(staticModel, dynamicModel);
  } else {
    const base = materializeModelBase(payload.models.dynamic, idMap);
    if (!base) return null;
    models.push({
      ...base,
      mode: 'dynamic',
      family: 'accumulator',
      inputPortId: idMap.portIds[payload.models.dynamic.inputPortKey]!,
      outputPortId: idMap.portIds[payload.models.dynamic.outputPortKey]!,
      initialState: payload.models.dynamic.initialState,
    });
  }
  const activeModelIds =
    payload.moduleClass === 'static'
      ? { static: idMap.modelIds[payload.activeModels.static]! }
      : payload.moduleClass === 'first_order'
        ? {
            static: idMap.modelIds[payload.activeModels.static]!,
            dynamic: idMap.modelIds[payload.activeModels.dynamic]!,
          }
        : { dynamic: idMap.modelIds[payload.activeModels.dynamic]! };
  return {
    kind: 'functional_module',
    id: idMap.moduleId,
    labelKey: 'bfn.userDefined.genericModule',
    authoring: {
      origin: 'user_defined',
      name: options.instanceName,
      description: options.instanceDescription,
    },
    descriptionKey: 'bfn.userDefined.genericDescription',
    inputPorts: ports.filter((port) => port.direction === 'input'),
    outputPorts: ports.filter((port) => port.direction === 'output'),
    modelVariants: models,
    activeModelIds,
    implementationIds: payload.implementationKeys.map((key) => idMap.implementationIds[key]!),
    implementationState: payload.implementationState,
    evidenceGrade: payload.moduleEvidenceGrade,
    position: findBfnModulePlacement(project, {
      x: 0,
      y: 0,
      width: BFN_CANVAS_SIZE.width,
      height: BFN_CANVAS_SIZE.height,
    }),
    isDemo: false,
  };
}

function materializeModelBase(model: BfnTemplateModelBaseV1, idMap: BfnTemplateInstantiationIdMap) {
  const id = idMap.modelIds[model.key];
  const domainId = idMap.validityDomainIds[model.validityDomainKey];
  const contextId = model.contextKey === null ? null : idMap.contextIds[model.contextKey];
  const provenanceIds = model.provenanceKeys.map((key) => idMap.provenanceIds[key]);
  if (!id || !domainId || contextId === undefined || provenanceIds.some((item) => !item))
    return null;
  return {
    id,
    version: model.version,
    contextId,
    validityDomainId: domainId,
    sourceDatasetIds: [],
    provenanceIds: provenanceIds.filter((item): item is string => item !== undefined),
    evidenceGrade: model.evidenceGrade,
    uncertaintyMethod: model.uncertaintyMethod,
    isDemo: false,
  };
}

function materializeStaticModel(
  model: Extract<
    BfnReusableModulePayloadV1,
    { moduleClass: 'static' | 'first_order' }
  >['models']['static'],
  idMap: BfnTemplateInstantiationIdMap,
): BfnStaticModel | null {
  const base = materializeModelBase(model, idMap);
  const response = materializeResponse(model.response, idMap);
  return base && response ? { ...base, mode: 'static', family: model.family, response } : null;
}

function materializeDynamicModel(
  model: Extract<BfnReusableModulePayloadV1, { moduleClass: 'first_order' }>['models']['dynamic'],
  idMap: BfnTemplateInstantiationIdMap,
): BfnDynamicModel | null {
  const base = materializeModelBase(model, idMap);
  const steadyStateResponse = materializeResponse(model.steadyStateResponse, idMap);
  return base && steadyStateResponse
    ? {
        ...base,
        mode: 'dynamic',
        family: 'first_order',
        steadyStateResponse,
        tau: copyParameter(model.tau),
        initialState: model.initialState,
      }
    : null;
}

function materializeResponse(
  response: BfnTemplateStaticResponseV1,
  idMap: BfnTemplateInstantiationIdMap,
): BfnStaticResponse | null {
  if (response.family === 'hill_activation' || response.family === 'hill_repression') {
    const inputPortId = idMap.portIds[response.inputPortKey];
    return inputPortId
      ? {
          family: response.family,
          inputPortId,
          ymin: copyParameter(response.ymin),
          ymax: copyParameter(response.ymax),
          k: copyParameter(response.k),
          n: copyParameter(response.n),
        }
      : null;
  }
  if (response.family === 'linear_transfer') {
    const inputPortId = idMap.portIds[response.inputPortKey];
    return inputPortId
      ? {
          family: response.family,
          inputPortId,
          scale: copyParameter(response.scale),
          intercept: copyParameter(response.intercept),
          ...(response.outputMinimum === undefined
            ? {}
            : { outputMinimum: response.outputMinimum }),
          ...(response.outputMaximum === undefined
            ? {}
            : { outputMaximum: response.outputMaximum }),
        }
      : null;
  }
  if (response.family === 'identity') {
    const inputPortId = idMap.portIds[response.inputPortKey];
    return inputPortId ? { family: 'identity', inputPortId } : null;
  }
  if (response.family !== 'independent_inputs') return null;
  const terms = response.terms.flatMap((term) => {
    const inputPortId = idMap.portIds[term.inputPortKey];
    return inputPortId
      ? [
          {
            inputPortId,
            direction: term.direction,
            k: copyParameter(term.k),
            n: copyParameter(term.n),
            contribution: copyParameter(term.contribution),
          },
        ]
      : [];
  });
  return terms.length === response.terms.length
    ? {
        family: 'independent_inputs',
        terms,
        basal: copyParameter(response.basal),
        outputMaximum: copyParameter(response.outputMaximum),
        aggregation: response.aggregation,
        interactionAssumption: response.interactionAssumption,
      }
    : null;
}

function copyParameter(parameter: BfnParameterEstimate): BfnParameterEstimate {
  return {
    value: parameter.value,
    unit: parameter.unit,
    ...(parameter.interval95
      ? { interval95: [parameter.interval95[0], parameter.interval95[1]] }
      : {}),
  };
}

function referencesResolve(project: BfnProject, module: BfnFunctionalModule): boolean {
  const contextIds = new Set(project.registry.contexts.map((item) => item.id));
  const domainIds = new Set(project.registry.validityDomains.map((item) => item.id));
  const provenanceIds = new Set(project.registry.provenanceRecords.map((item) => item.id));
  const implementationIds = new Set(project.registry.implementations.map((item) => item.id));
  const portIds = new Set([...module.inputPorts, ...module.outputPorts].map((item) => item.id));
  return (
    module.modelVariants.every(
      (model) =>
        (model.contextId === null || contextIds.has(model.contextId)) &&
        domainIds.has(model.validityDomainId) &&
        model.sourceDatasetIds.length === 0 &&
        model.provenanceIds.every((id) => provenanceIds.has(id)),
    ) &&
    module.implementationIds.every((id) => implementationIds.has(id)) &&
    project.registry.validityDomains
      .filter((domain) =>
        module.modelVariants.some((model) => model.validityDomainId === domain.id),
      )
      .every(
        (domain) =>
          (domain.contextId === null || contextIds.has(domain.contextId)) &&
          domain.inputRanges.every((range) => portIds.has(range.portId)),
      ) &&
    project.registry.implementations
      .filter((implementation) => module.implementationIds.includes(implementation.id))
      .every((implementation) => implementation.provenanceIds.every((id) => provenanceIds.has(id)))
  );
}

function collectDefinedIds(value: unknown, ids = new Set<string>()): ReadonlySet<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectDefinedIds(item, ids);
  } else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') ids.add(record.id);
    for (const child of Object.values(record)) collectDefinedIds(child, ids);
  }
  return ids;
}

function failed(
  code: BfnTemplateContractIssue['code'],
  path: string,
  details?: readonly string[],
): Extract<BfnTemplateInstantiationResult, { readonly ok: false }> {
  return { ok: false, issues: [{ code, path, ...(details ? { details } : {}) }] };
}
