import type { BfnFunctionalModule, BfnPort, BfnProject } from '../../types';
import { getDesignedSenderSignalCatalog } from '../../user-defined/designed-sender/designedSenderSignalCatalog';
import type {
  BfnTemplateCaptureOptions,
  BfnTemplateCanonicalEntityV1,
  BfnTemplateContractIssue,
  BfnTemplateEntityV1,
} from './templateTypes';

export interface BfnTemplateEntityCapture {
  readonly entities: readonly BfnTemplateEntityV1[];
  readonly entityKeyBySourceId: ReadonlyMap<string, string>;
  readonly issues: readonly BfnTemplateContractIssue[];
}

export function captureTemplateEntities(
  project: BfnProject,
  module: BfnFunctionalModule,
  ports: readonly BfnPort[],
  portKeyBySourceId: ReadonlyMap<string, string>,
  options: BfnTemplateCaptureOptions,
): BfnTemplateEntityCapture {
  const sourceEntityIds = unique(ports.map((port) => port.entity));
  const entityKeyBySourceId = new Map(
    sourceEntityIds.map((id, index) => [id, `entity.${index + 1}`] as const),
  );
  const entities: BfnTemplateEntityV1[] = [];
  const issues: BfnTemplateContractIssue[] = [];

  for (const [id, policy] of Object.entries(options.entityPolicies)) {
    if (policy !== 'embedded' && policy !== 'slot') {
      issues.push({ code: 'entity_policy_invalid', path: `options.entityPolicies.${id}` });
    }
  }

  const unknownPolicyIds = Object.keys(options.entityPolicies).filter(
    (id) => !sourceEntityIds.includes(id),
  );
  if (unknownPolicyIds.length > 0) {
    issues.push({
      code: 'entity_policy_invalid',
      path: 'options.entityPolicies',
      details: unknownPolicyIds,
    });
  }

  for (const [index, sourceEntityId] of sourceEntityIds.entries()) {
    const key = entityKeyBySourceId.get(sourceEntityId)!;
    const canonical = resolveCanonicalEntityById(sourceEntityId);
    const definitions = project.registry.entities.filter(
      (candidate) => candidate.id === sourceEntityId,
    );
    if (canonical) {
      if (
        definitions.some(
          (definition) =>
            definition.displayName !== canonical.displayName || definition.description !== null,
        )
      ) {
        issues.push({
          code: 'canonical_entity_conflict',
          path: `module.ports.entity[${index}]`,
          details: [sourceEntityId],
        });
        continue;
      }
      entities.push({ key, mode: 'canonical', ...canonical });
      continue;
    }

    const definition = definitions[0];
    const shared = isEntityReferencedOutsideModule(project, module.id, sourceEntityId);
    const requestedPolicy = options.entityPolicies[sourceEntityId];
    if (requestedPolicy === 'embedded' && definition && !isEmbeddableDefinition(definition)) {
      issues.push({
        code: 'embedded_entity_ineligible',
        path: `options.entityPolicies.${sourceEntityId}`,
        details: ['entity_definition_shape_invalid'],
      });
      continue;
    }
    if (shared && requestedPolicy === 'embedded') {
      issues.push({
        code: 'embedded_entity_ineligible',
        path: `options.entityPolicies.${sourceEntityId}`,
        details: ['entity_referenced_outside_module'],
      });
      continue;
    }

    if (!definition || shared || requestedPolicy === 'slot') {
      if (requestedPolicy === 'embedded' && !definition) {
        issues.push({
          code: 'entity_definition_missing',
          path: `options.entityPolicies.${sourceEntityId}`,
          details: [sourceEntityId],
        });
        continue;
      }
      entities.push({
        key,
        mode: 'slot',
        sourceEntityId,
        displayName: definition?.displayName ?? sourceEntityId,
        description: definition?.description ?? null,
        requirements: ports
          .filter((port) => port.entity === sourceEntityId)
          .map((port) => ({
            portKey: portKeyBySourceId.get(port.id)!,
            direction: port.direction,
            quantityType: port.quantityType,
            unit: port.unit,
          })),
      });
      continue;
    }

    if (requestedPolicy === undefined) {
      issues.push({
        code: 'entity_policy_missing',
        path: `options.entityPolicies.${sourceEntityId}`,
        details: [sourceEntityId],
      });
      continue;
    }
    if (requestedPolicy !== 'embedded') {
      issues.push({
        code: 'entity_policy_invalid',
        path: `options.entityPolicies.${sourceEntityId}`,
      });
      continue;
    }
    entities.push({
      key,
      mode: 'embedded',
      displayName: definition.displayName,
      description: definition.description,
    });
  }

  return { entities, entityKeyBySourceId, issues };
}

export function resolveCanonicalEntityById(
  entityId: string,
): Omit<BfnTemplateCanonicalEntityV1, 'key' | 'mode'> | null {
  const resolved = getDesignedSenderSignalCatalog().find(
    (candidate) => candidate.entityId === entityId,
  );
  return resolved
    ? {
        authority: 'ahl_hsl_catalog',
        catalogId: resolved.catalogSignalId,
        entityId: resolved.entityId,
        displayName: resolved.displayName,
      }
    : null;
}

export function canonicalTemplateEntityResolves(entity: BfnTemplateCanonicalEntityV1): boolean {
  const resolved = getDesignedSenderSignalCatalog().find(
    (candidate) => candidate.catalogSignalId === entity.catalogId,
  );
  return (
    entity.authority === 'ahl_hsl_catalog' &&
    resolved?.entityId === entity.entityId &&
    resolved.displayName === entity.displayName
  );
}

export function collectProjectEntityIds(project: BfnProject): ReadonlySet<string> {
  return new Set([
    ...project.registry.entities.map((entity) => entity.id),
    ...allProjectPorts(project).map((port) => port.entity),
    ...project.registry.datasets.flatMap((dataset) => [
      ...dataset.inputEntities,
      ...dataset.outputEntities,
    ]),
  ]);
}

function isEntityReferencedOutsideModule(
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
    ...project.network.modules.flatMap((candidate) => [
      ...candidate.inputPorts,
      ...candidate.outputPorts,
    ]),
    ...project.network.outputMonitors.map((monitor) => monitor.inputPort),
  ];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isEmbeddableDefinition(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === 4 &&
    ['id', 'origin', 'displayName', 'description'].every((key) => keys.includes(key)) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) => 'value' in descriptor && descriptor.enumerable,
    )
  );
}
