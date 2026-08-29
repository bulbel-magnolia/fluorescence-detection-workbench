import {
  isTrustedReleaseCatalogPresentation,
  loadReleaseCatalogPresentation,
} from '../../modeling/catalog/releaseCatalogPresentation';
import type { ReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
import {
  bfnCatalogReferencePresence,
  isBfnCatalogModelReference,
} from '../catalog/catalogBfnTypes';
import { resolveEffectiveBfnModel } from '../modelResolution';
import { findBfnOutputReachableModuleIds } from '../outputReachability';
import type {
  BfnFunctionalModule,
  BfnIdealEdgeEndpoint,
  BfnProject,
  BfnRunContextApplicabilitySnapshot,
} from '../types';
import { assessBfnContextApplicability } from './contextApplicability';
import type { BfnComparableContextFacts, BfnContextApplicabilityCheck } from './compatibilityTypes';

export type BfnIntegratedContextApplicabilityState =
  'matched' | 'uncertain' | 'mismatched' | 'not_applicable' | 'unavailable';

export interface BfnIntegratedContextApplicabilityAssessment {
  readonly overall: BfnIntegratedContextApplicabilityState;
  readonly checks: readonly BfnContextApplicabilityCheck[];
}

export interface BfnContextIntegrationDependencies {
  readonly loadCatalogPresentation?: () => unknown;
}

interface ResolvedContextFacts {
  readonly state: 'available' | 'unavailable';
  readonly facts: BfnComparableContextFacts | null;
}

const missingReportedContextText = new Set(['unknown', 'n/a', 'not recorded', 'unspecified']);

function comparableReportedText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || missingReportedContextText.has(normalized) ? null : value;
}

function unavailableFacts(): ResolvedContextFacts {
  return Object.freeze({ state: 'unavailable', facts: null });
}

function unrecordedComparableFacts(): ResolvedContextFacts {
  return Object.freeze({
    state: 'available',
    facts: Object.freeze({
      hostSpecies: Object.freeze({ value: null, comparisonBasis: 'reported_text' }),
      hostStrain: Object.freeze({ value: null, comparisonBasis: 'reported_text' }),
      medium: Object.freeze({ value: null, comparisonBasis: 'reported_text' }),
      temperatureCelsius: Object.freeze({ value: null, comparisonBasis: 'canonical' }),
    }),
  });
}

function builtInContextFacts(project: BfnProject, contextId: string | null): ResolvedContextFacts {
  if (contextId === null) return unrecordedComparableFacts();
  const context = project.registry.contexts.find((candidate) => candidate.id === contextId);
  if (!context) return unavailableFacts();
  return Object.freeze({
    state: 'available',
    facts: Object.freeze({
      hostSpecies: Object.freeze({
        value: comparableReportedText(context.host),
        comparisonBasis: 'reported_text',
      }),
      hostStrain: Object.freeze({
        value: comparableReportedText(context.strain),
        comparisonBasis: 'reported_text',
      }),
      medium: Object.freeze({
        value: comparableReportedText(context.medium),
        comparisonBasis: 'reported_text',
      }),
      temperatureCelsius: Object.freeze({
        value: context.temperatureCelsius,
        comparisonBasis: 'canonical',
      }),
    }),
  });
}

function catalogContextFacts(
  presentation: ReleaseCatalogPresentation,
  contextId: string,
): ResolvedContextFacts {
  const context = presentation.parameterContexts.find((candidate) => candidate.id === contextId);
  if (!context) return unavailableFacts();
  return Object.freeze({
    state: 'available',
    facts: Object.freeze({
      hostSpecies: Object.freeze({
        value: comparableReportedText(context.hostSpecies),
        comparisonBasis: 'reported_text',
      }),
      hostStrain: Object.freeze({
        value: comparableReportedText(context.hostStrain),
        comparisonBasis: 'reported_text',
      }),
      medium: Object.freeze({
        value: comparableReportedText(context.canonical.details?.cultureMedium ?? null),
        comparisonBasis: 'reported_text',
      }),
      // Catalog temperature is retained as source text. It is never inferred into a number.
      temperatureCelsius: Object.freeze({ value: null, comparisonBasis: 'canonical' }),
    }),
  });
}

export function resolveBfnModuleComparableContextFacts(
  project: BfnProject,
  module: BfnFunctionalModule,
  dependencies: BfnContextIntegrationDependencies = {},
): ResolvedContextFacts {
  const model = resolveEffectiveBfnModel(project, module);
  if (!model) return unavailableFacts();
  const catalogReference = bfnCatalogReferencePresence(model);
  if (!catalogReference.present) return builtInContextFacts(project, model.contextId);
  if (!isBfnCatalogModelReference(catalogReference.value)) return unavailableFacts();

  try {
    const presentation = (dependencies.loadCatalogPresentation ?? loadReleaseCatalogPresentation)();
    if (!isTrustedReleaseCatalogPresentation(presentation)) return unavailableFacts();
    return catalogContextFacts(presentation, catalogReference.value.parameterContextId);
  } catch {
    return unavailableFacts();
  }
}

export function assessBfnConnectionContextApplicability(
  project: BfnProject,
  source: BfnIdealEdgeEndpoint,
  target: BfnIdealEdgeEndpoint,
  dependencies: BfnContextIntegrationDependencies = {},
): BfnIntegratedContextApplicabilityAssessment {
  const sourceModule = project.network.modules.find((candidate) => candidate.id === source.nodeId);
  const targetModule = project.network.modules.find((candidate) => candidate.id === target.nodeId);
  if (!sourceModule || !targetModule) {
    return Object.freeze({ overall: 'not_applicable', checks: Object.freeze([]) });
  }

  const sourceContext = resolveBfnModuleComparableContextFacts(project, sourceModule, dependencies);
  const targetContext = resolveBfnModuleComparableContextFacts(project, targetModule, dependencies);
  if (!sourceContext.facts || !targetContext.facts) {
    return Object.freeze({ overall: 'unavailable', checks: Object.freeze([]) });
  }

  const assessment = assessBfnContextApplicability(sourceContext.facts, targetContext.facts);
  return Object.freeze({ overall: assessment.overall, checks: assessment.checks });
}

export function createBfnRunContextApplicabilitySnapshot(
  project: BfnProject,
  monitorId: string,
  dependencies: BfnContextIntegrationDependencies = {},
): BfnRunContextApplicabilitySnapshot {
  const reachableModuleIds = findBfnOutputReachableModuleIds(project, monitorId);
  const edges: BfnRunContextApplicabilitySnapshot['edges'] = [];
  for (const edge of project.network.edges) {
    if (
      !edge.enabled ||
      !reachableModuleIds.has(edge.source.nodeId) ||
      !reachableModuleIds.has(edge.target.nodeId)
    ) {
      continue;
    }
    const assessment = assessBfnConnectionContextApplicability(
      project,
      edge.source,
      edge.target,
      dependencies,
    );
    if (assessment.overall === 'not_applicable') continue;
    edges.push(
      assessment.overall === 'unavailable'
        ? { edgeId: edge.id, state: assessment.overall }
        : { edgeId: edge.id, state: assessment.overall, checks: assessment.checks },
    );
  }

  return { scope: 'output_reachable_module_edges', edges };
}
