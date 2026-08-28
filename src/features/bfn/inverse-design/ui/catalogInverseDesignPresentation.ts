import type {
  ReleaseCatalogLanguage,
  ReleaseCatalogPresentation,
} from '../../../modeling/catalog/releaseCatalogPresentation';
import {
  getReleaseComponentName,
  getReleaseResponseRouteLabel,
} from '../../../modeling/catalog/releaseCatalogPresentation';
import { bfnCatalogSignalDisplayName } from '../../catalog/catalogDiscovery';
import type {
  BfnCatalogInverseCandidateResult,
  BfnCatalogInverseCriterionResult,
  BfnCatalogInverseExclusionReason,
} from '../catalogInverseDesignTypes';

export interface BfnCatalogInverseResponsePresentation {
  responseId: string;
  componentName: string;
  variantName: string;
  sourceSummary: string | null;
  hostSpecies: string | null;
  hostStrain: string | null;
}

export function catalogInverseSignalDisplayName(
  presentation: ReleaseCatalogPresentation,
  signalId: string,
  language: ReleaseCatalogLanguage,
): string {
  const signal = presentation.signals.find((entry) => entry.id === signalId);
  if (signal === undefined) return signalId;
  return bfnCatalogSignalDisplayName(signal.names, signal.abbreviations, language);
}

export function resolveCatalogInverseResponsePresentation(
  presentation: ReleaseCatalogPresentation,
  responseId: string,
  language: ReleaseCatalogLanguage,
): BfnCatalogInverseResponsePresentation {
  const response = presentation.responseVariants.find((entry) => entry.id === responseId);
  if (response === undefined) throw new Error(`CATALOG_INVERSE_RESPONSE_NOT_FOUND:${responseId}`);
  const component = presentation.components.find((entry) => entry.id === response.componentId);
  if (component === undefined)
    throw new Error(`CATALOG_INVERSE_COMPONENT_NOT_FOUND:${response.componentId}`);
  const source = response.sources[0];
  return {
    responseId,
    componentName: getReleaseComponentName(component, language),
    variantName: getReleaseResponseRouteLabel(response, language),
    sourceSummary:
      source === undefined
        ? null
        : source.year === null
          ? source.authors
          : `${source.authors} · ${source.year}`,
    hostSpecies: response.parameterContext.hostSpecies,
    hostStrain: response.parameterContext.hostStrain,
  };
}

export function catalogInverseStatusLabelKey(
  status: BfnCatalogInverseCandidateResult['status'],
): string {
  return `bfn.inverseDesign.status.${status}`;
}

export function catalogInverseExclusionReasonLabelKey(
  reason: BfnCatalogInverseExclusionReason,
): string {
  return `bfn.inverseDesign.exclusionReasons.${reason}`;
}

export function catalogInverseCriterionLabelKey(
  criterion: BfnCatalogInverseCriterionResult['kind'],
): string {
  return `bfn.inverseDesign.criteria.${criterion}`;
}
