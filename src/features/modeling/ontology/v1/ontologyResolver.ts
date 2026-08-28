import { isBfnCatalogModelReference } from '../../../bfn/catalog/catalogBfnTypes';
import type { BfnCatalogModuleId } from '../../../bfn/fixtures';
import type { BfnFunctionalModule, BfnModelVariant } from '../../../bfn/types';
import {
  isTrustedReleaseCatalogPresentation,
  loadReleaseCatalogPresentation,
  type ReleaseCatalogPresentation,
} from '../../catalog/releaseCatalogPresentation';
import {
  BFN_ONTOLOGY_ASSIGNMENTS,
  BFN_ONTOLOGY_EXPECTED_SUBJECTS,
  getBuiltInModuleIdForExactLabelKey,
} from './ontologyAssignments';
import { BFN_ONTOLOGY_REGISTRY, getBfnOntologyTerm } from './ontologyRegistry';
import {
  BfnOntologyContractError,
  compareBfnOntologyStableText,
  type BfnOntologyAssignment,
  type BfnOntologyTerm,
  type BfnSemanticClassificationStatus,
  type BfnSemanticProfile,
} from './ontologyTypes';
import { deepFreezeBfnOntologyValue, validateBfnOntologyAssignments } from './ontologyValidation';

let contractChecked = false;

function assertOntologyContract(): void {
  if (contractChecked) return;
  validateBfnOntologyAssignments(
    BFN_ONTOLOGY_REGISTRY,
    BFN_ONTOLOGY_ASSIGNMENTS,
    BFN_ONTOLOGY_EXPECTED_SUBJECTS,
  );
  contractChecked = true;
}

function requiredTerm(id: string): BfnOntologyTerm {
  const term = getBfnOntologyTerm(id);
  if (term === undefined) {
    throw new BfnOntologyContractError('ontology-invalid', { ontologyId: id });
  }
  return term;
}

function classificationStatus(
  functionalFamilies: readonly BfnOntologyTerm[],
  biologicalFamilies: readonly BfnOntologyTerm[],
): BfnSemanticClassificationStatus {
  const functionalClassified = functionalFamilies.some(
    (term) => term.id !== 'functional.unclassified',
  );
  const biologicalClassified = biologicalFamilies.some((term) => term.id !== 'bio.unclassified');
  if (functionalClassified && biologicalClassified) return 'classified';
  if (functionalClassified || biologicalClassified) return 'partially-classified';
  return 'unclassified';
}

function buildSemanticProfile(
  sourceAssignments: readonly BfnOntologyAssignment[],
): BfnSemanticProfile {
  assertOntologyContract();
  const assignments = [...sourceAssignments];
  const assignedTerms = assignments.map((assignment) => requiredTerm(assignment.ontologyId));
  const functionalFamilies = assignedTerms.filter((term) => term.kind === 'functional_family');
  const biologicalFamilies = assignedTerms.filter(
    (term) => term.kind === 'biological_component_family',
  );
  if (functionalFamilies.length === 0) {
    functionalFamilies.push(requiredTerm('functional.unclassified'));
  }
  if (biologicalFamilies.length === 0) {
    biologicalFamilies.push(requiredTerm('bio.unclassified'));
  }
  functionalFamilies.sort((left, right) => compareBfnOntologyStableText(left.id, right.id));
  biologicalFamilies.sort((left, right) => compareBfnOntologyStableText(left.id, right.id));
  return deepFreezeBfnOntologyValue({
    functionalFamilies,
    biologicalComponentFamilies: biologicalFamilies,
    assignments,
    classificationStatus: classificationStatus(functionalFamilies, biologicalFamilies),
  });
}

function assignmentsForSubject(
  subjectType: BfnOntologyAssignment['subjectType'],
  subjectId: string,
): readonly BfnOntologyAssignment[] {
  return BFN_ONTOLOGY_ASSIGNMENTS.filter(
    (assignment) => assignment.subjectType === subjectType && assignment.subjectId === subjectId,
  );
}

export function resolveCatalogComponentSemanticProfile(
  componentId: string,
  presentation: ReleaseCatalogPresentation = loadReleaseCatalogPresentation(),
): BfnSemanticProfile {
  if (!isTrustedReleaseCatalogPresentation(presentation)) {
    throw new BfnOntologyContractError('catalog-presentation-untrusted');
  }
  if (!presentation.components.some((component) => component.id === componentId)) {
    throw new BfnOntologyContractError('catalog-component-not-found', { componentId });
  }
  return buildSemanticProfile(assignmentsForSubject('catalog_component', componentId));
}

export function resolveBuiltInModuleSemanticProfile(
  catalogModuleId: BfnCatalogModuleId,
): BfnSemanticProfile {
  return buildSemanticProfile(assignmentsForSubject('builtin_module', catalogModuleId));
}

function orderedModels(module: BfnFunctionalModule): readonly BfnModelVariant[] {
  const ordered: BfnModelVariant[] = [];
  const seen = new Set<string>();
  const activeIds = [module.activeModelIds.static, module.activeModelIds.dynamic].filter(
    (modelId): modelId is string => typeof modelId === 'string' && modelId.length > 0,
  );
  for (const modelId of activeIds) {
    const model = module.modelVariants.find((candidate) => candidate.id === modelId);
    if (model !== undefined && !seen.has(model.id)) {
      ordered.push(model);
      seen.add(model.id);
    }
  }
  for (const model of module.modelVariants) {
    if (!seen.has(model.id)) {
      ordered.push(model);
      seen.add(model.id);
    }
  }
  return ordered;
}

function catalogComponentId(module: BfnFunctionalModule): string | undefined {
  for (const model of orderedModels(module)) {
    if (model.mode === 'static' && isBfnCatalogModelReference(model.catalogReference)) {
      return model.catalogReference.componentId;
    }
  }
  return undefined;
}

export function resolveBfnModuleSemanticProfile(module: BfnFunctionalModule): BfnSemanticProfile {
  const componentId = catalogComponentId(module);
  if (componentId !== undefined) return resolveCatalogComponentSemanticProfile(componentId);
  const builtInModuleId = getBuiltInModuleIdForExactLabelKey(module.labelKey);
  if (builtInModuleId !== undefined) {
    return resolveBuiltInModuleSemanticProfile(builtInModuleId);
  }
  return buildSemanticProfile([]);
}
