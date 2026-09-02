import type {
  BfnReusableModulePayloadV1,
  BfnReusableModuleScientificProjectionV1,
  BfnTemplateContextV1,
  BfnTemplateEntityV1,
  BfnTemplateImplementationV1,
  BfnTemplateModelBaseV1,
  BfnTemplatePortV1,
  BfnTemplateProvenanceV1,
  BfnTemplateStaticResponseV1,
  BfnTemplateValidityDomainV1,
} from './templateTypes';
import { canonicalJson, compareCanonical } from './templateInternals';

/**
 * Builds the scientific identity of a normalized payload without retaining
 * template-local keys. Dependency collections with no scientific ordering are
 * dereferenced and sorted by value.
 */
export function createReusableModuleScientificProjection(
  payload: BfnReusableModulePayloadV1,
): BfnReusableModuleScientificProjectionV1 {
  const entityByKey = new Map(payload.entities.map((entity) => [entity.key, entity] as const));
  const contextByKey = new Map(payload.contexts.map((context) => [context.key, context] as const));
  const domainByKey = new Map(
    payload.validityDomains.map((domain) => [domain.key, domain] as const),
  );
  const provenanceByKey = new Map(
    payload.provenance.map((record) => [record.key, record] as const),
  );
  const implementationByKey = new Map(
    payload.implementations.map((implementation) => [implementation.key, implementation] as const),
  );

  const portReferenceByKey = new Map(
    payload.ports.map((port, index) => [port.key, `${port.direction}:${index + 1}`] as const),
  );
  const orderedEntityKeys: string[] = [];
  for (const port of payload.ports) {
    if (!orderedEntityKeys.includes(port.entityKey)) orderedEntityKeys.push(port.entityKey);
  }
  const entityOrdinalByKey = new Map(
    orderedEntityKeys.map((key, index) => [key, index + 1] as const),
  );

  const projectModelBase = (model: BfnTemplateModelBaseV1): Record<string, unknown> => ({
    version: model.version,
    context: model.contextKey === null ? null : projectContext(contextByKey.get(model.contextKey)),
    validityDomain: projectDomain(
      domainByKey.get(model.validityDomainKey),
      portReferenceByKey,
      contextByKey,
    ),
    provenance: model.provenanceKeys
      .map((key) => projectProvenance(provenanceByKey.get(key)))
      .sort(compareCanonical),
    evidenceGrade: model.evidenceGrade,
    uncertaintyMethod: model.uncertaintyMethod,
  });

  const models =
    payload.moduleClass === 'static'
      ? {
          static: {
            ...projectModelBase(payload.models.static),
            mode: 'static',
            family: payload.models.static.family,
            response: projectResponse(payload.models.static.response, portReferenceByKey),
          },
        }
      : payload.moduleClass === 'first_order'
        ? {
            static: {
              ...projectModelBase(payload.models.static),
              mode: 'static',
              family: payload.models.static.family,
              response: projectResponse(payload.models.static.response, portReferenceByKey),
            },
            dynamic: {
              ...projectModelBase(payload.models.dynamic),
              mode: 'dynamic',
              family: 'first_order',
              steadyStateResponse: projectResponse(
                payload.models.dynamic.steadyStateResponse,
                portReferenceByKey,
              ),
              tau: payload.models.dynamic.tau,
              initialState: payload.models.dynamic.initialState,
            },
          }
        : {
            dynamic: {
              ...projectModelBase(payload.models.dynamic),
              mode: 'dynamic',
              family: 'accumulator',
              inputPort: portReferenceByKey.get(payload.models.dynamic.inputPortKey),
              outputPort: portReferenceByKey.get(payload.models.dynamic.outputPortKey),
              initialState: payload.models.dynamic.initialState,
            },
          };

  return {
    moduleClass: payload.moduleClass,
    ports: payload.ports.map((port) => projectPort(port, entityOrdinalByKey)),
    entities: orderedEntityKeys.map((key) =>
      projectEntity(entityByKey.get(key), portReferenceByKey),
    ),
    models,
    moduleEvidenceGrade: payload.moduleEvidenceGrade,
    implementationState: payload.implementationState,
    implementations: payload.implementationKeys
      .map((key) => projectImplementation(implementationByKey.get(key), provenanceByKey))
      .sort(compareCanonical),
  };
}

export function reusableModuleScientificProjectionsEqual(
  left: BfnReusableModuleScientificProjectionV1,
  right: BfnReusableModuleScientificProjectionV1,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function projectPort(
  port: BfnTemplatePortV1,
  entityOrdinalByKey: ReadonlyMap<string, number>,
): Record<string, unknown> {
  return {
    direction: port.direction,
    quantityType: port.quantityType,
    unit: port.unit,
    entity: entityOrdinalByKey.get(port.entityKey),
  };
}

function projectEntity(
  entity: BfnTemplateEntityV1 | undefined,
  portReferenceByKey: ReadonlyMap<string, string>,
): Record<string, unknown> | null {
  if (!entity) return null;
  if (entity.mode === 'canonical') {
    return {
      mode: 'canonical',
      authority: entity.authority,
      catalogId: entity.catalogId,
      entityId: entity.entityId,
      displayName: entity.displayName,
    };
  }
  if (entity.mode === 'embedded') {
    return {
      mode: 'embedded',
      displayName: entity.displayName,
      description: entity.description,
    };
  }
  return {
    mode: 'slot',
    sourceEntityId: entity.sourceEntityId,
    displayName: entity.displayName,
    description: entity.description,
    requirements: entity.requirements.map((requirement) => ({
      port: portReferenceByKey.get(requirement.portKey),
      direction: requirement.direction,
      quantityType: requirement.quantityType,
      unit: requirement.unit,
    })),
  };
}

function projectContext(context: BfnTemplateContextV1 | undefined): Record<string, unknown> | null {
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
  domain: BfnTemplateValidityDomainV1 | undefined,
  portReferenceByKey: ReadonlyMap<string, string>,
  contextByKey: ReadonlyMap<string, BfnTemplateContextV1>,
): Record<string, unknown> | null {
  if (!domain) return null;
  return {
    labelKey: domain.labelKey,
    inputRanges: domain.inputRanges
      .map((range) => ({
        port: portReferenceByKey.get(range.portKey),
        minimum: range.minimum,
        maximum: range.maximum,
        unit: range.unit,
      }))
      .sort(compareCanonical),
    ...(domain.timeRangeHours === undefined ? {} : { timeRangeHours: domain.timeRangeHours }),
    context:
      domain.contextKey === null ? null : projectContext(contextByKey.get(domain.contextKey)),
  };
}

function projectProvenance(
  record: BfnTemplateProvenanceV1 | undefined,
): Record<string, unknown> | null {
  return record ? { kind: record.kind, reference: record.reference } : null;
}

function projectImplementation(
  implementation: BfnTemplateImplementationV1 | undefined,
  provenanceByKey: ReadonlyMap<string, BfnTemplateProvenanceV1>,
): Record<string, unknown> | null {
  if (!implementation) return null;
  return {
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
    provenance: implementation.provenanceKeys
      .map((key) => projectProvenance(provenanceByKey.get(key)))
      .sort(compareCanonical),
    isDemo: implementation.isDemo,
  };
}

function projectResponse(
  response: BfnTemplateStaticResponseV1,
  portReferenceByKey: ReadonlyMap<string, string>,
): Record<string, unknown> {
  if (response.family === 'hill_activation' || response.family === 'hill_repression') {
    return {
      family: response.family,
      inputPort: portReferenceByKey.get(response.inputPortKey),
      ymin: response.ymin,
      ymax: response.ymax,
      k: response.k,
      n: response.n,
    };
  }
  if (response.family === 'linear_transfer') {
    return {
      family: response.family,
      inputPort: portReferenceByKey.get(response.inputPortKey),
      scale: response.scale,
      intercept: response.intercept,
      ...(response.outputMinimum === undefined ? {} : { outputMinimum: response.outputMinimum }),
      ...(response.outputMaximum === undefined ? {} : { outputMaximum: response.outputMaximum }),
    };
  }
  if (response.family === 'identity') {
    return {
      family: response.family,
      inputPort: portReferenceByKey.get(response.inputPortKey),
    };
  }
  if (response.family !== 'independent_inputs') return { family: response.family };
  return {
    family: response.family,
    terms: response.terms.map((term) => ({
      inputPort: portReferenceByKey.get(term.inputPortKey),
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
