import type {
  BfnAccumulatorDynamicModel,
  BfnContext,
  BfnDynamicModel,
  BfnProvenanceRecord,
  BfnProject,
  BfnStaticModel,
  BfnStaticResponse,
  BfnValidityDomain,
} from '../../types';
import { resolveCanonicalEntityById } from './templateEntityPolicy';
import { compareCanonical } from './templateInternals';
import type {
  BfnReusableModulePayloadV1,
  BfnReusableModuleScientificProjectionV1,
  BfnTemplateInstantiationIdMap,
} from './templateTypes';

/** Projects a concrete copy through its explicit template-local ID mapping. */
export function createInstantiatedReusableModuleScientificProjection(
  project: BfnProject,
  moduleId: string,
  payload: BfnReusableModulePayloadV1,
  idMap: BfnTemplateInstantiationIdMap,
): BfnReusableModuleScientificProjectionV1 | null {
  const module = project.network.modules.find((candidate) => candidate.id === moduleId);
  if (
    !module ||
    module.id !== idMap.moduleId ||
    module.modelVariants.length !== Object.keys(payload.models).length
  ) {
    return null;
  }
  const concreteEntityIds = payload.entities.map((entity) => idMap.entityIds[entity.key]);
  if (
    concreteEntityIds.some((id) => id === undefined) ||
    new Set(concreteEntityIds).size !== concreteEntityIds.length
  ) {
    return null;
  }
  const actualPorts = [...module.inputPorts, ...module.outputPorts];
  if (actualPorts.length !== payload.ports.length) return null;
  const portReferenceById = new Map<string, string>();
  const entityOrdinalByKey = new Map<string, number>();
  const orderedEntityKeys: string[] = [];
  const ports: Record<string, unknown>[] = [];
  for (const [index, templatePort] of payload.ports.entries()) {
    const actual = actualPorts[index];
    if (
      !actual ||
      actual.id !== idMap.portIds[templatePort.key] ||
      actual.entity !== idMap.entityIds[templatePort.entityKey]
    ) {
      return null;
    }
    portReferenceById.set(actual.id, `${templatePort.direction}:${index + 1}`);
    if (!orderedEntityKeys.includes(templatePort.entityKey)) {
      orderedEntityKeys.push(templatePort.entityKey);
      entityOrdinalByKey.set(templatePort.entityKey, orderedEntityKeys.length);
    }
    ports.push({
      direction: actual.direction,
      quantityType: actual.quantityType,
      unit: actual.unit,
      entity: entityOrdinalByKey.get(templatePort.entityKey),
    });
  }

  const entityIds = collectEntityIds(project);
  const entities = orderedEntityKeys.map((key) => {
    const templateEntity = payload.entities.find((entity) => entity.key === key);
    const targetId = idMap.entityIds[key];
    if (!templateEntity || !targetId) return null;
    if (templateEntity.mode === 'canonical') {
      const resolved = resolveCanonicalEntityById(targetId);
      return resolved
        ? {
            mode: 'canonical',
            authority: resolved.authority,
            catalogId: resolved.catalogId,
            entityId: resolved.entityId,
            displayName: resolved.displayName,
          }
        : null;
    }
    if (templateEntity.mode === 'embedded') {
      const definition = project.registry.entities.find((entity) => entity.id === targetId);
      return definition
        ? {
            mode: 'embedded',
            displayName: definition.displayName,
            description: definition.description,
          }
        : null;
    }
    return entityIds.has(targetId)
      ? {
          mode: 'slot',
          sourceEntityId: templateEntity.sourceEntityId,
          displayName: templateEntity.displayName,
          description: templateEntity.description,
          requirements: templateEntity.requirements.map((requirement) => ({
            port: portReferenceById.get(idMap.portIds[requirement.portKey] ?? ''),
            direction: requirement.direction,
            quantityType: requirement.quantityType,
            unit: requirement.unit,
          })),
        }
      : null;
  });
  if (entities.some((entity) => entity === null)) return null;

  const contextById = new Map(project.registry.contexts.map((context) => [context.id, context]));
  const domainById = new Map(project.registry.validityDomains.map((domain) => [domain.id, domain]));
  const provenanceById = new Map(
    project.registry.provenanceRecords.map((record) => [record.id, record]),
  );
  const base = (model: BfnStaticModel | BfnDynamicModel | BfnAccumulatorDynamicModel) => ({
    version: model.version,
    context: model.contextId === null ? null : projectContext(contextById.get(model.contextId)),
    validityDomain: projectDomain(
      domainById.get(model.validityDomainId),
      portReferenceById,
      contextById,
    ),
    provenance: model.provenanceIds
      .map((id) => projectProvenance(provenanceById.get(id)))
      .sort(compareCanonical),
    evidenceGrade: model.evidenceGrade,
    uncertaintyMethod: model.uncertaintyMethod,
  });

  let models: Record<string, unknown>;
  if (payload.moduleClass === 'static') {
    const model = module.modelVariants.find(
      (candidate): candidate is BfnStaticModel =>
        candidate.id === idMap.modelIds['model.static'] && candidate.mode === 'static',
    );
    if (
      !model ||
      module.activeModelIds.static !== model.id ||
      module.activeModelIds.dynamic !== undefined
    ) {
      return null;
    }
    models = {
      static: {
        ...base(model),
        mode: model.mode,
        family: model.family,
        response: projectResponse(model.response, portReferenceById),
      },
    };
  } else if (payload.moduleClass === 'first_order') {
    const staticModel = module.modelVariants.find(
      (candidate): candidate is BfnStaticModel =>
        candidate.id === idMap.modelIds['model.static'] && candidate.mode === 'static',
    );
    const dynamicModel = module.modelVariants.find(
      (candidate): candidate is BfnDynamicModel =>
        candidate.id === idMap.modelIds['model.dynamic'] &&
        candidate.mode === 'dynamic' &&
        candidate.family === 'first_order',
    );
    if (
      !staticModel ||
      !dynamicModel ||
      module.activeModelIds.static !== staticModel.id ||
      module.activeModelIds.dynamic !== dynamicModel.id
    ) {
      return null;
    }
    models = {
      static: {
        ...base(staticModel),
        mode: staticModel.mode,
        family: staticModel.family,
        response: projectResponse(staticModel.response, portReferenceById),
      },
      dynamic: {
        ...base(dynamicModel),
        mode: dynamicModel.mode,
        family: dynamicModel.family,
        steadyStateResponse: projectResponse(dynamicModel.steadyStateResponse, portReferenceById),
        tau: dynamicModel.tau,
        initialState: dynamicModel.initialState,
      },
    };
  } else {
    const dynamicModel = module.modelVariants.find(
      (candidate): candidate is BfnAccumulatorDynamicModel =>
        candidate.id === idMap.modelIds['model.accumulator'] &&
        candidate.mode === 'dynamic' &&
        candidate.family === 'accumulator',
    );
    if (
      !dynamicModel ||
      module.activeModelIds.static !== undefined ||
      module.activeModelIds.dynamic !== dynamicModel.id
    ) {
      return null;
    }
    models = {
      dynamic: {
        ...base(dynamicModel),
        mode: dynamicModel.mode,
        family: dynamicModel.family,
        inputPort: portReferenceById.get(dynamicModel.inputPortId),
        outputPort: portReferenceById.get(dynamicModel.outputPortId),
        initialState: dynamicModel.initialState,
      },
    };
  }

  const expectedImplementationIds = payload.implementationKeys.map(
    (key) => idMap.implementationIds[key],
  );
  if (
    expectedImplementationIds.some((id) => id === undefined) ||
    expectedImplementationIds.some((id, index) => id !== module.implementationIds[index])
  ) {
    return null;
  }
  const implementations = module.implementationIds.map((id) => {
    const implementation = project.registry.implementations.find((item) => item.id === id);
    return implementation
      ? {
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
          provenance: implementation.provenanceIds
            .map((provenanceId) => projectProvenance(provenanceById.get(provenanceId)))
            .sort(compareCanonical),
          isDemo: implementation.isDemo,
        }
      : null;
  });
  if (implementations.some((implementation) => implementation === null)) return null;
  return {
    moduleClass: payload.moduleClass,
    ports,
    entities: entities.filter((entity): entity is NonNullable<typeof entity> => entity !== null),
    models,
    moduleEvidenceGrade: module.evidenceGrade,
    implementationState: module.implementationState,
    implementations: implementations.sort(compareCanonical),
  };
}

function projectContext(context: BfnContext | undefined): Record<string, unknown> | null {
  if (!context) return null;
  return {
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
  };
}

function projectDomain(
  domain: BfnValidityDomain | undefined,
  portReferenceById: ReadonlyMap<string, string>,
  contextById: ReadonlyMap<string, BfnContext>,
): Record<string, unknown> | null {
  if (!domain) return null;
  return {
    labelKey: domain.labelKey,
    inputRanges: domain.inputRanges
      .map((range) => ({
        port: portReferenceById.get(range.portId),
        minimum: range.minimum,
        maximum: range.maximum,
        unit: range.unit,
      }))
      .sort(compareCanonical),
    ...(domain.timeRangeHours === undefined ? {} : { timeRangeHours: domain.timeRangeHours }),
    context: domain.contextId === null ? null : projectContext(contextById.get(domain.contextId)),
  };
}

function projectProvenance(
  record: BfnProvenanceRecord | undefined,
): Record<string, unknown> | null {
  return record ? { kind: record.kind, reference: record.reference } : null;
}

function projectResponse(
  response: BfnStaticResponse,
  portReferenceById: ReadonlyMap<string, string>,
): Record<string, unknown> {
  if (response.family === 'hill_activation' || response.family === 'hill_repression') {
    return {
      family: response.family,
      inputPort: portReferenceById.get(response.inputPortId),
      ymin: response.ymin,
      ymax: response.ymax,
      k: response.k,
      n: response.n,
    };
  }
  if (response.family === 'linear_transfer') {
    return {
      family: response.family,
      inputPort: portReferenceById.get(response.inputPortId),
      scale: response.scale,
      intercept: response.intercept,
      ...(response.outputMinimum === undefined ? {} : { outputMinimum: response.outputMinimum }),
      ...(response.outputMaximum === undefined ? {} : { outputMaximum: response.outputMaximum }),
    };
  }
  if (response.family === 'identity') {
    return { family: response.family, inputPort: portReferenceById.get(response.inputPortId) };
  }
  if (response.family !== 'independent_inputs') return { family: response.family };
  return {
    family: response.family,
    terms: response.terms.map((term) => ({
      inputPort: portReferenceById.get(term.inputPortId),
      direction: term.direction,
      k: term.k,
      n: term.n,
      contribution: term.contribution,
    })),
    basal: response.basal,
    outputMaximum: response.outputMaximum,
    aggregation: response.aggregation,
    interactionAssumption: response.interactionAssumption,
  };
}

function collectEntityIds(project: BfnProject): ReadonlySet<string> {
  return new Set([
    ...project.registry.entities.map((entity) => entity.id),
    ...allProjectEntityIds(project),
    ...project.registry.datasets.flatMap((dataset) => [
      ...dataset.inputEntities,
      ...dataset.outputEntities,
    ]),
  ]);
}

function allProjectEntityIds(project: BfnProject): string[] {
  return [
    ...project.network.inputSources.map((source) => source.outputPort.entity),
    ...project.network.modules.flatMap((module) => [
      ...module.inputPorts.map((port) => port.entity),
      ...module.outputPorts.map((port) => port.entity),
    ]),
    ...project.network.outputMonitors.map((monitor) => monitor.inputPort.entity),
  ];
}
