import type { BfnCatalogModuleId } from '../../../bfn/fixtures';
import {
  isTrustedReleaseCatalogPresentation,
  loadReleaseCatalogPresentation,
  type ReleaseCatalogPresentation,
} from '../../catalog/releaseCatalogPresentation';
import { BFN_ONTOLOGY_REGISTRY } from './ontologyRegistry';
import {
  BfnOntologyContractError,
  compareBfnOntologyStableText,
  type BfnBiologicalComponentFamilyId,
  type BfnFunctionalFamilyId,
  type BfnOntologyAssignment,
  type BfnOntologyExpectedSubject,
} from './ontologyTypes';
import {
  compareBfnOntologyAssignments,
  deepFreezeBfnOntologyValue,
  validateBfnOntologyAssignments,
} from './ontologyValidation';

interface BfnOntologyFamilyPair {
  readonly functionalFamilyId: BfnFunctionalFamilyId;
  readonly biologicalComponentFamilyId: BfnBiologicalComponentFamilyId;
}

export const CATALOG_ROLE_ONTOLOGY_IDS = deepFreezeBfnOntologyValue({
  receiver: {
    functionalFamilyId: 'functional.signal_response',
    biologicalComponentFamilyId: 'bio.ahl_receiver_regulator',
  },
  sender: {
    functionalFamilyId: 'functional.signal_production',
    biologicalComponentFamilyId: 'bio.ahl_synthase',
  },
} as const satisfies Record<'receiver' | 'sender', BfnOntologyFamilyPair>);

export const BUILTIN_MODULE_ONTOLOGY_IDS = deepFreezeBfnOntologyValue({
  'ahl-sensor': {
    functionalFamilyId: 'functional.signal_response',
    biologicalComponentFamilyId: 'bio.ahl_receiver_regulator',
  },
  reporter: {
    functionalFamilyId: 'functional.expression_transfer',
    biologicalComponentFamilyId: 'bio.reporter_system',
  },
  'dual-input-gate': {
    functionalFamilyId: 'functional.multi_input_integration',
    biologicalComponentFamilyId: 'bio.unclassified',
  },
} as const satisfies Record<BfnCatalogModuleId, BfnOntologyFamilyPair>);

export const BUILTIN_MODULE_ID_BY_LABEL_KEY = deepFreezeBfnOntologyValue({
  'bfn.modules.ahlSensor.name': 'ahl-sensor',
  'bfn.modules.reporter.name': 'reporter',
  'bfn.modules.dualInput.name': 'dual-input-gate',
} as const satisfies Record<string, BfnCatalogModuleId>);

function assignmentsForSubject(
  subjectType: BfnOntologyAssignment['subjectType'],
  subjectId: string,
  pair: BfnOntologyFamilyPair,
  basis: BfnOntologyAssignment['basis'],
): BfnOntologyAssignment[] {
  return [
    { subjectType, subjectId, ontologyId: pair.functionalFamilyId, basis },
    { subjectType, subjectId, ontologyId: pair.biologicalComponentFamilyId, basis },
  ];
}

export function buildCatalogOntologyAssignments(
  presentation: ReleaseCatalogPresentation = loadReleaseCatalogPresentation(),
): readonly BfnOntologyAssignment[] {
  if (!isTrustedReleaseCatalogPresentation(presentation)) {
    throw new BfnOntologyContractError('catalog-presentation-untrusted');
  }
  return deepFreezeBfnOntologyValue(
    presentation.components
      .flatMap((component) =>
        assignmentsForSubject(
          'catalog_component',
          component.id,
          CATALOG_ROLE_ONTOLOGY_IDS[component.role],
          'canonical_field',
        ),
      )
      .sort(compareBfnOntologyAssignments),
  );
}

function buildExpectedCatalogSubjects(
  presentation: ReleaseCatalogPresentation,
): BfnOntologyExpectedSubject[] {
  return presentation.components.map((component) => ({
    subjectType: 'catalog_component',
    subjectId: component.id,
    functionalFamilyId: CATALOG_ROLE_ONTOLOGY_IDS[component.role].functionalFamilyId,
    biologicalComponentFamilyId:
      CATALOG_ROLE_ONTOLOGY_IDS[component.role].biologicalComponentFamilyId,
    basis: 'canonical_field',
  }));
}

function builtInModuleIds(): BfnCatalogModuleId[] {
  return Object.keys(BUILTIN_MODULE_ONTOLOGY_IDS).sort(
    compareBfnOntologyStableText,
  ) as BfnCatalogModuleId[];
}

export const CATALOG_ONTOLOGY_ASSIGNMENTS = buildCatalogOntologyAssignments();

export const BUILTIN_ONTOLOGY_ASSIGNMENTS: readonly BfnOntologyAssignment[] =
  deepFreezeBfnOntologyValue(
    builtInModuleIds()
      .flatMap((moduleId) =>
        assignmentsForSubject(
          'builtin_module',
          moduleId,
          BUILTIN_MODULE_ONTOLOGY_IDS[moduleId],
          'curated',
        ),
      )
      .sort(compareBfnOntologyAssignments),
  );

const trustedPresentation = loadReleaseCatalogPresentation();

export const BFN_ONTOLOGY_EXPECTED_SUBJECTS: readonly BfnOntologyExpectedSubject[] =
  deepFreezeBfnOntologyValue(
    [
      ...buildExpectedCatalogSubjects(trustedPresentation),
      ...builtInModuleIds().map((moduleId) => ({
        subjectType: 'builtin_module' as const,
        subjectId: moduleId,
        functionalFamilyId: BUILTIN_MODULE_ONTOLOGY_IDS[moduleId].functionalFamilyId,
        biologicalComponentFamilyId:
          BUILTIN_MODULE_ONTOLOGY_IDS[moduleId].biologicalComponentFamilyId,
        basis: 'curated' as const,
      })),
    ].sort(
      (left, right) =>
        compareBfnOntologyStableText(left.subjectType, right.subjectType) ||
        compareBfnOntologyStableText(left.subjectId, right.subjectId),
    ),
  );

export const BFN_ONTOLOGY_ASSIGNMENTS: readonly BfnOntologyAssignment[] =
  deepFreezeBfnOntologyValue(
    [...CATALOG_ONTOLOGY_ASSIGNMENTS, ...BUILTIN_ONTOLOGY_ASSIGNMENTS].sort(
      compareBfnOntologyAssignments,
    ),
  );

validateBfnOntologyAssignments(
  BFN_ONTOLOGY_REGISTRY,
  BFN_ONTOLOGY_ASSIGNMENTS,
  BFN_ONTOLOGY_EXPECTED_SUBJECTS,
);

export function getBuiltInModuleIdForExactLabelKey(
  labelKey: string,
): BfnCatalogModuleId | undefined {
  if (!Object.prototype.hasOwnProperty.call(BUILTIN_MODULE_ID_BY_LABEL_KEY, labelKey)) {
    return undefined;
  }
  return (BUILTIN_MODULE_ID_BY_LABEL_KEY as Readonly<Record<string, BfnCatalogModuleId>>)[labelKey];
}

export { compareBfnOntologyAssignments };
