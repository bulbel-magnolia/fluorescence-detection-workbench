import {
  BfnOntologyContractError,
  compareBfnOntologyStableText,
  type BfnOntologyAssignment,
  type BfnOntologyExpectedSubject,
  type BfnOntologyRegistry,
  type BfnOntologyTerm,
} from './ontologyTypes';

function invalid(reason: string, details: Readonly<Record<string, string | number>> = {}): never {
  throw new BfnOntologyContractError('ontology-invalid', { reason, ...details });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

export function deepFreezeBfnOntologyValue<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeBfnOntologyValue(child);
  }
  return Object.freeze(value);
}

export function isDeepFrozenBfnOntologyValue(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeepFrozenBfnOntologyValue);
}

function validateTermShape(term: BfnOntologyTerm, index: number): void {
  if (!isRecord(term)) invalid('term-not-an-object', { index });
  if (!isExactNonEmptyId(term.id)) invalid('term-id-invalid', { index });
  if (term.kind !== 'functional_family' && term.kind !== 'biological_component_family') {
    invalid('term-kind-invalid', { termId: term.id });
  }
  if (term.parentId !== null && !isExactNonEmptyId(term.parentId)) {
    invalid('term-parent-id-invalid', { termId: term.id });
  }
  if (
    !isRecord(term.names) ||
    !isExactNonEmptyId(term.names.en) ||
    !isExactNonEmptyId(term.names.zh)
  ) {
    invalid('term-names-invalid', { termId: term.id });
  }
  if (
    !isRecord(term.description) ||
    !isExactNonEmptyId(term.description.en) ||
    !isExactNonEmptyId(term.description.zh)
  ) {
    invalid('term-description-invalid', { termId: term.id });
  }
}

function validateParentGraph(termsById: ReadonlyMap<string, BfnOntologyTerm>): void {
  for (const term of termsById.values()) {
    if (term.parentId === null) continue;
    const parent = termsById.get(term.parentId);
    if (parent === undefined) invalid('term-parent-not-found', { termId: term.id });
    if (parent.kind !== term.kind) invalid('term-parent-kind-mismatch', { termId: term.id });
  }

  for (const term of termsById.values()) {
    const visited = new Set<string>();
    let current: BfnOntologyTerm | undefined = term;
    while (current !== undefined && current.parentId !== null) {
      if (visited.has(current.id)) invalid('term-parent-cycle', { termId: term.id });
      visited.add(current.id);
      current = termsById.get(current.parentId);
    }
  }
}

export function validateBfnOntologyRegistry(registry: BfnOntologyRegistry): void {
  if (!isRecord(registry)) invalid('registry-shape-invalid');
  if (!isDeepFrozenBfnOntologyValue(registry)) invalid('registry-not-deep-frozen');
  const registryRecord = registry as unknown as Record<string, unknown>;
  const manifest = registryRecord.manifest;
  const terms = registryRecord.terms;
  if (!isRecord(manifest) || !Array.isArray(terms)) invalid('registry-shape-invalid');
  if (
    manifest.schema !== 'BFN-ONTOLOGY' ||
    manifest.version !== '1.0' ||
    manifest.id !== 'bfn-semantic-ontology'
  ) {
    invalid('manifest-identity-invalid');
  }
  const registryTerms = terms as readonly BfnOntologyTerm[];
  const termsById = new Map<string, BfnOntologyTerm>();
  let previousId: string | undefined;
  registryTerms.forEach((term, index) => {
    validateTermShape(term, index);
    if (previousId !== undefined && compareBfnOntologyStableText(previousId, term.id) >= 0) {
      invalid('term-order-invalid', { termId: term.id });
    }
    previousId = term.id;
    if (termsById.has(term.id)) invalid('term-id-duplicate', { termId: term.id });
    termsById.set(term.id, term);
  });

  const functionalFallback = termsById.get('functional.unclassified');
  const biologicalFallback = termsById.get('bio.unclassified');
  if (functionalFallback?.kind !== 'functional_family') {
    invalid('functional-unclassified-missing');
  }
  if (biologicalFallback?.kind !== 'biological_component_family') {
    invalid('biological-unclassified-missing');
  }
  validateParentGraph(termsById);
}

export function compareBfnOntologyAssignments(
  left: BfnOntologyAssignment,
  right: BfnOntologyAssignment,
): number {
  return (
    compareBfnOntologyStableText(left.subjectType, right.subjectType) ||
    compareBfnOntologyStableText(left.subjectId, right.subjectId) ||
    compareBfnOntologyStableText(left.ontologyId, right.ontologyId)
  );
}

function subjectKey(subjectType: string, subjectId: string): string {
  return `${subjectType}\u001f${subjectId}`;
}

function validateAssignmentShape(
  assignment: BfnOntologyAssignment,
  index: number,
  termsById: ReadonlyMap<string, BfnOntologyTerm>,
): void {
  if (!isRecord(assignment)) invalid('assignment-not-an-object', { index });
  if (
    assignment.subjectType !== 'catalog_component' &&
    assignment.subjectType !== 'builtin_module'
  ) {
    invalid('assignment-subject-type-invalid', { index });
  }
  if (!isExactNonEmptyId(assignment.subjectId)) invalid('assignment-subject-id-invalid', { index });
  if (!isExactNonEmptyId(assignment.ontologyId)) invalid('assignment-term-id-invalid', { index });
  if (!termsById.has(assignment.ontologyId)) {
    invalid('assignment-term-not-found', { ontologyId: assignment.ontologyId });
  }
  if (assignment.basis !== 'canonical_field' && assignment.basis !== 'curated') {
    invalid('assignment-basis-invalid', { index });
  }
  if (
    (assignment.subjectType === 'catalog_component' && assignment.basis !== 'canonical_field') ||
    (assignment.subjectType === 'builtin_module' && assignment.basis !== 'curated')
  ) {
    invalid('assignment-basis-subject-mismatch', { subjectId: assignment.subjectId });
  }
}

function validateSubjectCardinality(
  assignmentsBySubject: ReadonlyMap<string, readonly BfnOntologyAssignment[]>,
  termsById: ReadonlyMap<string, BfnOntologyTerm>,
): void {
  for (const assignments of assignmentsBySubject.values()) {
    const functional = assignments.filter(
      (assignment) => termsById.get(assignment.ontologyId)?.kind === 'functional_family',
    );
    const biological = assignments.filter(
      (assignment) => termsById.get(assignment.ontologyId)?.kind === 'biological_component_family',
    );
    const subjectId = assignments[0]?.subjectId ?? '';
    if (functional.length !== 1) invalid('subject-functional-cardinality', { subjectId });
    if (biological.length !== 1) invalid('subject-biological-cardinality', { subjectId });
    if (functional[0]?.ontologyId === 'functional.unclassified') {
      invalid('current-subject-functional-unclassified', { subjectId });
    }
  }
}

function validateExpectedSubjects(
  assignmentsBySubject: ReadonlyMap<string, readonly BfnOntologyAssignment[]>,
  expectedSubjects: readonly BfnOntologyExpectedSubject[],
): void {
  const expectedKeys = new Set<string>();
  for (const expected of expectedSubjects) {
    const key = subjectKey(expected.subjectType, expected.subjectId);
    if (expectedKeys.has(key))
      invalid('expected-subject-duplicate', { subjectId: expected.subjectId });
    expectedKeys.add(key);
    const assignments = assignmentsBySubject.get(key);
    if (assignments === undefined)
      invalid('expected-subject-missing', { subjectId: expected.subjectId });
    const expectedOntologyIds = new Set<string>([
      expected.functionalFamilyId,
      expected.biologicalComponentFamilyId,
    ]);
    if (
      assignments.length !== 2 ||
      assignments.some(
        (assignment) =>
          assignment.basis !== expected.basis || !expectedOntologyIds.has(assignment.ontologyId),
      )
    ) {
      invalid('expected-subject-mapping-mismatch', { subjectId: expected.subjectId });
    }
  }
  if (assignmentsBySubject.size !== expectedKeys.size) invalid('unexpected-assignment-subject');
  for (const key of assignmentsBySubject.keys()) {
    if (!expectedKeys.has(key)) invalid('unexpected-assignment-subject');
  }
}

export function validateBfnOntologyAssignments(
  registry: BfnOntologyRegistry,
  assignments: readonly BfnOntologyAssignment[],
  expectedSubjects?: readonly BfnOntologyExpectedSubject[],
): void {
  validateBfnOntologyRegistry(registry);
  const assignmentsValue: unknown = assignments;
  if (!Array.isArray(assignmentsValue)) invalid('assignments-shape-invalid');
  if (!isDeepFrozenBfnOntologyValue(assignmentsValue)) invalid('assignments-not-deep-frozen');
  const assignmentList = assignmentsValue as readonly BfnOntologyAssignment[];

  const termsById = new Map(registry.terms.map((term) => [term.id, term]));
  const assignmentKeys = new Set<string>();
  const assignmentsBySubject = new Map<string, BfnOntologyAssignment[]>();
  let previous: BfnOntologyAssignment | undefined;
  assignmentList.forEach((assignment, index) => {
    validateAssignmentShape(assignment, index, termsById);
    if (previous !== undefined && compareBfnOntologyAssignments(previous, assignment) > 0) {
      invalid('assignment-order-invalid', { index });
    }
    previous = assignment;
    const assignmentKey = subjectKey(
      assignment.subjectType,
      `${assignment.subjectId}\u001f${assignment.ontologyId}`,
    );
    if (assignmentKeys.has(assignmentKey)) {
      invalid('assignment-duplicate', { subjectId: assignment.subjectId });
    }
    assignmentKeys.add(assignmentKey);
    const key = subjectKey(assignment.subjectType, assignment.subjectId);
    const grouped = assignmentsBySubject.get(key) ?? [];
    grouped.push(assignment);
    assignmentsBySubject.set(key, grouped);
  });

  validateSubjectCardinality(assignmentsBySubject, termsById);
  if (expectedSubjects !== undefined) {
    validateExpectedSubjects(assignmentsBySubject, expectedSubjects);
  }
}
