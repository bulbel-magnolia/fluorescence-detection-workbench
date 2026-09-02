import type { BfnModelVariant, BfnProject } from '../../types';
import type {
  BfnTemplateContextV1,
  BfnTemplateContractIssue,
  BfnTemplateImplementationV1,
  BfnTemplateProvenanceV1,
  BfnTemplateValidityDomainV1,
} from './templateTypes';

export interface BfnTemplateDependencyClosure {
  readonly contexts: readonly BfnTemplateContextV1[];
  readonly validityDomains: readonly BfnTemplateValidityDomainV1[];
  readonly provenance: readonly BfnTemplateProvenanceV1[];
  readonly implementations: readonly BfnTemplateImplementationV1[];
  readonly implementationKeys: readonly string[];
  readonly contextKeyBySourceId: ReadonlyMap<string, string>;
  readonly domainKeyBySourceId: ReadonlyMap<string, string>;
  readonly provenanceKeyBySourceId: ReadonlyMap<string, string>;
  readonly issues: readonly BfnTemplateContractIssue[];
}

export function captureTemplateDependencyClosure(
  project: BfnProject,
  activeModels: readonly BfnModelVariant[],
  implementationIds: readonly string[],
  portKeyBySourceId: ReadonlyMap<string, string>,
): BfnTemplateDependencyClosure {
  const issues: BfnTemplateContractIssue[] = [];
  const contexts: BfnTemplateContextV1[] = [];
  const validityDomains: BfnTemplateValidityDomainV1[] = [];
  const provenance: BfnTemplateProvenanceV1[] = [];
  const implementations: BfnTemplateImplementationV1[] = [];
  const contextKeyBySourceId = new Map<string, string>();
  const domainKeyBySourceId = new Map<string, string>();
  const provenanceKeyBySourceId = new Map<string, string>();
  const implementationKeyBySourceId = new Map<string, string>();

  const addContext = (sourceId: string | null, path: string): string | null => {
    if (sourceId === null) return null;
    const existingKey = contextKeyBySourceId.get(sourceId);
    if (existingKey) return existingKey;
    const source = resolveUniqueDependency(project.registry.contexts, sourceId, path, issues);
    if (!source) return null;
    const key = `context.${contexts.length + 1}`;
    contextKeyBySourceId.set(sourceId, key);
    contexts.push({
      key,
      labelKey: source.labelKey,
      documentationState: source.documentationState,
      host: source.host,
      strain: source.strain,
      medium: source.medium,
      temperatureCelsius: source.temperatureCelsius,
      ph: source.ph,
      oxygenation: source.oxygenation,
      growthPhase: source.growthPhase,
      plasmidBackbone: source.plasmidBackbone,
      copyNumberRegime: source.copyNumberRegime,
      inductionProtocol: source.inductionProtocol,
      measurementTimeHours: source.measurementTimeHours,
      batch: source.batch,
      isDemo: source.isDemo,
    });
    return key;
  };

  const addDomain = (sourceId: string, path: string): string | null => {
    const existingKey = domainKeyBySourceId.get(sourceId);
    if (existingKey) return existingKey;
    const source = resolveUniqueDependency(
      project.registry.validityDomains,
      sourceId,
      path,
      issues,
    );
    if (!source) return null;
    const ranges = source.inputRanges.flatMap((range, index) => {
      const portKey = portKeyBySourceId.get(range.portId);
      if (!portKey) {
        issues.push({
          code: 'dependency_missing',
          path: `${path}.inputRanges[${index}].portId`,
          details: [range.portId],
        });
        return [];
      }
      return [
        {
          portKey,
          minimum: range.minimum,
          maximum: range.maximum,
          unit: range.unit,
        },
      ];
    });
    const contextKey = addContext(source.contextId, `${path}.contextId`);
    if (source.contextId !== null && contextKey === null) return null;
    const key = `domain.${validityDomains.length + 1}`;
    domainKeyBySourceId.set(sourceId, key);
    validityDomains.push({
      key,
      labelKey: source.labelKey,
      inputRanges: ranges,
      ...(source.timeRangeHours === undefined
        ? {}
        : { timeRangeHours: [source.timeRangeHours[0], source.timeRangeHours[1]] }),
      contextKey,
    });
    return key;
  };

  const addProvenance = (sourceId: string, path: string): string | null => {
    const existingKey = provenanceKeyBySourceId.get(sourceId);
    if (existingKey) return existingKey;
    const source = resolveUniqueDependency(
      project.registry.provenanceRecords,
      sourceId,
      path,
      issues,
    );
    if (!source) return null;
    const key = `provenance.${provenance.length + 1}`;
    provenanceKeyBySourceId.set(sourceId, key);
    provenance.push({ key, kind: source.kind, reference: source.reference });
    return key;
  };

  for (const [index, model] of activeModels.entries()) {
    addContext(model.contextId, `module.activeModels[${index}].contextId`);
    addDomain(model.validityDomainId, `module.activeModels[${index}].validityDomainId`);
    for (const [provenanceIndex, id] of model.provenanceIds.entries()) {
      addProvenance(id, `module.activeModels[${index}].provenanceIds[${provenanceIndex}]`);
    }
  }

  for (const [index, sourceId] of implementationIds.entries()) {
    if (implementationKeyBySourceId.has(sourceId)) {
      issues.push({
        code: 'dependency_conflict',
        path: `module.implementationIds[${index}]`,
        details: [sourceId],
      });
      continue;
    }
    const source = resolveUniqueDependency(
      project.registry.implementations,
      sourceId,
      `module.implementationIds[${index}]`,
      issues,
    );
    if (!source) continue;
    const provenanceKeys = source.provenanceIds.flatMap((id, provenanceIndex) => {
      const key = addProvenance(
        id,
        `module.implementationIds[${index}].provenanceIds[${provenanceIndex}]`,
      );
      return key === null ? [] : [key];
    });
    const key = `implementation.${implementations.length + 1}`;
    implementationKeyBySourceId.set(sourceId, key);
    implementations.push({
      key,
      labelKey: source.labelKey,
      promoter: source.promoter,
      operator: source.operator,
      rbs: source.rbs,
      codingSequence: source.codingSequence,
      degradationTag: source.degradationTag,
      plasmidBackbone: source.plasmidBackbone,
      host: source.host,
      strainComposition: source.strainComposition,
      evidenceGrade: source.evidenceGrade,
      maturity: source.maturity,
      provenanceKeys,
      isDemo: source.isDemo,
    });
  }

  return {
    contexts,
    validityDomains,
    provenance,
    implementations,
    implementationKeys: implementationIds.flatMap((id) => {
      const key = implementationKeyBySourceId.get(id);
      return key ? [key] : [];
    }),
    contextKeyBySourceId,
    domainKeyBySourceId,
    provenanceKeyBySourceId,
    issues,
  };
}

function resolveUniqueDependency<T extends { readonly id: string }>(
  records: readonly T[],
  sourceId: string,
  path: string,
  issues: BfnTemplateContractIssue[],
): T | null {
  const matches = records.filter((record) => record.id === sourceId);
  if (matches.length === 0) {
    issues.push({ code: 'dependency_missing', path, details: [sourceId] });
    return null;
  }
  if (matches.length > 1) {
    issues.push({ code: 'dependency_conflict', path, details: [sourceId] });
    return null;
  }
  return matches[0]!;
}
