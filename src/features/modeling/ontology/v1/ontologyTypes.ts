export type BfnOntologyTermKind = 'functional_family' | 'biological_component_family';

export type BfnFunctionalFamilyId =
  | 'functional.signal_response'
  | 'functional.signal_production'
  | 'functional.expression_transfer'
  | 'functional.multi_input_integration'
  | 'functional.molecular_conversion'
  | 'functional.transport'
  | 'functional.binding_interaction'
  | 'functional.degradation_clearance'
  | 'functional.unclassified';

export type BfnBiologicalComponentFamilyId =
  'bio.ahl_receiver_regulator' | 'bio.ahl_synthase' | 'bio.reporter_system' | 'bio.unclassified';

export type BfnOntologyTermId = BfnFunctionalFamilyId | BfnBiologicalComponentFamilyId;

export interface BfnOntologyManifest {
  readonly schema: 'BFN-ONTOLOGY';
  readonly version: '1.0';
  readonly id: 'bfn-semantic-ontology';
}

export interface BfnOntologyTerm {
  readonly id: string;
  readonly kind: BfnOntologyTermKind;
  readonly parentId: string | null;
  readonly names: {
    readonly en: string;
    readonly zh: string;
  };
  readonly description: {
    readonly en: string;
    readonly zh: string;
  };
}

export interface BfnOntologyRegistry {
  readonly manifest: BfnOntologyManifest;
  readonly terms: readonly BfnOntologyTerm[];
}

export type BfnOntologySubjectType = 'catalog_component' | 'builtin_module';

export type BfnOntologyAssignmentBasis = 'canonical_field' | 'curated';

export interface BfnOntologyAssignment {
  readonly subjectType: BfnOntologySubjectType;
  readonly subjectId: string;
  readonly ontologyId: string;
  readonly basis: BfnOntologyAssignmentBasis;
}

export interface BfnOntologyExpectedSubject {
  readonly subjectType: BfnOntologySubjectType;
  readonly subjectId: string;
  readonly functionalFamilyId: BfnFunctionalFamilyId;
  readonly biologicalComponentFamilyId: BfnBiologicalComponentFamilyId;
  readonly basis: BfnOntologyAssignmentBasis;
}

export type BfnSemanticClassificationStatus =
  'classified' | 'partially-classified' | 'unclassified';

export interface BfnSemanticProfile {
  readonly functionalFamilies: readonly BfnOntologyTerm[];
  readonly biologicalComponentFamilies: readonly BfnOntologyTerm[];
  readonly assignments: readonly BfnOntologyAssignment[];
  readonly classificationStatus: BfnSemanticClassificationStatus;
}

export type BfnOntologyContractErrorCode =
  'ontology-invalid' | 'catalog-presentation-untrusted' | 'catalog-component-not-found';

export class BfnOntologyContractError extends Error {
  readonly code: BfnOntologyContractErrorCode;
  readonly details?: Readonly<Record<string, string | number>>;

  constructor(
    code: BfnOntologyContractErrorCode,
    details?: Readonly<Record<string, string | number>>,
  ) {
    super(code);
    this.name = 'BfnOntologyContractError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function compareBfnOntologyStableText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
