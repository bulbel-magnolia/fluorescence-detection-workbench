import type { ReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
import { getBfnOntologyTerm } from '../../modeling/ontology/v1/ontologyRegistry';
import {
  resolveBfnModuleSemanticProfile,
  resolveCatalogComponentSemanticProfile,
} from '../../modeling/ontology/v1/ontologyResolver';
import {
  BfnOntologyContractError,
  type BfnBiologicalComponentFamilyId,
  type BfnFunctionalFamilyId,
  type BfnOntologyTerm,
  type BfnSemanticProfile,
} from '../../modeling/ontology/v1/ontologyTypes';
import type { BfnFunctionalModule } from '../types';

export interface BfnSemanticPresentationTerm<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
}

export interface BfnSemanticPresentation {
  readonly status: 'resolved' | 'unavailable';
  readonly functionalFamilies: readonly BfnSemanticPresentationTerm<BfnFunctionalFamilyId>[];
  readonly biologicalFamilies: readonly BfnSemanticPresentationTerm<BfnBiologicalComponentFamilyId>[];
}

export interface BfnSemanticFamilyIdentity {
  readonly functionalFamilyIds: readonly BfnFunctionalFamilyId[];
  readonly biologicalFamilyIds: readonly BfnBiologicalComponentFamilyId[];
}

export interface BfnSemanticPresentationAdapter {
  resolveCatalogComponent(
    componentId: string,
    presentation: ReleaseCatalogPresentation,
  ): BfnSemanticProfile;
  resolveModule(module: BfnFunctionalModule): BfnSemanticProfile;
}

export const DEFAULT_BFN_SEMANTIC_PRESENTATION_ADAPTER: BfnSemanticPresentationAdapter =
  Object.freeze({
    resolveCatalogComponent: (componentId: string, presentation: ReleaseCatalogPresentation) =>
      resolveCatalogComponentSemanticProfile(componentId, presentation),
    resolveModule: (module: BfnFunctionalModule) => resolveBfnModuleSemanticProfile(module),
  });

const unavailablePresentation: BfnSemanticPresentation = deepFreeze({
  status: 'unavailable',
  functionalFamilies: [],
  biologicalFamilies: [],
});

export function unavailableBfnSemanticPresentation(): BfnSemanticPresentation {
  return unavailablePresentation;
}

export function presentBfnSemanticProfile(
  profile: BfnSemanticProfile,
  language: string,
): BfnSemanticPresentation {
  return deepFreeze({
    status: 'resolved',
    functionalFamilies: profile.functionalFamilies.map((term) => ({
      id: functionalFamilyId(term),
      label: localizedTermName(term, language),
    })),
    biologicalFamilies: profile.biologicalComponentFamilies.map((term) => ({
      id: biologicalFamilyId(term),
      label: localizedTermName(term, language),
    })),
  });
}

export function presentBfnSemanticFamilyIdentity(
  identity: BfnSemanticFamilyIdentity | null,
  language: string,
): BfnSemanticPresentation {
  if (identity === null) return unavailablePresentation;
  try {
    return deepFreeze({
      status: 'resolved',
      functionalFamilies: identity.functionalFamilyIds.map((id) => {
        const term = requiredTerm(id, 'functional_family');
        return { id, label: localizedTermName(term, language) };
      }),
      biologicalFamilies: identity.biologicalFamilyIds.map((id) => {
        const term = requiredTerm(id, 'biological_component_family');
        return { id, label: localizedTermName(term, language) };
      }),
    });
  } catch (error) {
    if (error instanceof BfnOntologyContractError) return unavailablePresentation;
    throw error;
  }
}

export function resolveCatalogComponentSemanticPresentation(
  componentId: string,
  presentation: ReleaseCatalogPresentation,
  language: string,
  adapter: BfnSemanticPresentationAdapter = DEFAULT_BFN_SEMANTIC_PRESENTATION_ADAPTER,
): BfnSemanticPresentation {
  try {
    return presentBfnSemanticProfile(
      adapter.resolveCatalogComponent(componentId, presentation),
      language,
    );
  } catch (error) {
    if (error instanceof BfnOntologyContractError) return unavailablePresentation;
    throw error;
  }
}

export function resolveBfnModuleSemanticPresentation(
  module: BfnFunctionalModule,
  language: string,
  adapter: BfnSemanticPresentationAdapter = DEFAULT_BFN_SEMANTIC_PRESENTATION_ADAPTER,
): BfnSemanticPresentation {
  try {
    return presentBfnSemanticProfile(adapter.resolveModule(module), language);
  } catch (error) {
    if (error instanceof BfnOntologyContractError) return unavailablePresentation;
    throw error;
  }
}

export function bfnSemanticProfileSearchTerms(profile: BfnSemanticProfile): readonly string[] {
  return Object.freeze(
    [...profile.functionalFamilies, ...profile.biologicalComponentFamilies].flatMap((term) => [
      term.names.en,
      term.names.zh,
    ]),
  );
}

export function bfnSemanticProfileFamilyIdentity(
  profile: BfnSemanticProfile,
): BfnSemanticFamilyIdentity {
  return deepFreeze({
    functionalFamilyIds: profile.functionalFamilies.map(functionalFamilyId),
    biologicalFamilyIds: profile.biologicalComponentFamilies.map(biologicalFamilyId),
  });
}

function requiredTerm(id: string, kind: BfnOntologyTerm['kind']): BfnOntologyTerm {
  const term = getBfnOntologyTerm(id);
  if (term === undefined || term.kind !== kind) {
    throw new BfnOntologyContractError('ontology-invalid', { ontologyId: id });
  }
  return term;
}

function functionalFamilyId(term: BfnOntologyTerm): BfnFunctionalFamilyId {
  requiredTerm(term.id, 'functional_family');
  // The frozen registry validates the complete stable-ID union at this boundary.
  return term.id as BfnFunctionalFamilyId;
}

function biologicalFamilyId(term: BfnOntologyTerm): BfnBiologicalComponentFamilyId {
  requiredTerm(term.id, 'biological_component_family');
  // The frozen registry validates the complete stable-ID union at this boundary.
  return term.id as BfnBiologicalComponentFamilyId;
}

function localizedTermName(term: BfnOntologyTerm, language: string): string {
  return language.toLocaleLowerCase().startsWith('zh') ? term.names.zh : term.names.en;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
