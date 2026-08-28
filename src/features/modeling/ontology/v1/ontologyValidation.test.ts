import { describe, expect, it } from 'vitest';
import {
  BFN_ONTOLOGY_ASSIGNMENTS,
  BFN_ONTOLOGY_EXPECTED_SUBJECTS,
  compareBfnOntologyAssignments,
} from './ontologyAssignments';
import { BFN_ONTOLOGY_REGISTRY } from './ontologyRegistry';
import {
  BfnOntologyContractError,
  type BfnOntologyAssignment,
  type BfnOntologyRegistry,
  type BfnOntologyTerm,
} from './ontologyTypes';
import {
  deepFreezeBfnOntologyValue,
  validateBfnOntologyAssignments,
  validateBfnOntologyRegistry,
} from './ontologyValidation';

function clonedRegistry(): BfnOntologyRegistry {
  return structuredClone(BFN_ONTOLOGY_REGISTRY);
}

function frozenRegistry(candidate: BfnOntologyRegistry): BfnOntologyRegistry {
  return deepFreezeBfnOntologyValue(candidate);
}

describe('BFN ontology validation', () => {
  it('accepts the built-in registry and complete current assignment contract', () => {
    expect(() => validateBfnOntologyRegistry(BFN_ONTOLOGY_REGISTRY)).not.toThrow();
    expect(() =>
      validateBfnOntologyAssignments(
        BFN_ONTOLOGY_REGISTRY,
        BFN_ONTOLOGY_ASSIGNMENTS,
        BFN_ONTOLOGY_EXPECTED_SUBJECTS,
      ),
    ).not.toThrow();
  });

  it('rejects a mutable registry and invalid manifest identity', () => {
    expect(() => validateBfnOntologyRegistry(clonedRegistry())).toThrow(BfnOntologyContractError);

    const candidate = clonedRegistry();
    Object.assign(candidate.manifest, { version: '9.9' });
    expect(() => validateBfnOntologyRegistry(frozenRegistry(candidate))).toThrow(
      BfnOntologyContractError,
    );
  });

  it('rejects duplicate term IDs and unstable term ordering', () => {
    const duplicate = clonedRegistry();
    (duplicate.terms as BfnOntologyTerm[]).push({ ...duplicate.terms[0]! });
    expect(() => validateBfnOntologyRegistry(frozenRegistry(duplicate))).toThrow(
      BfnOntologyContractError,
    );

    const reversed = clonedRegistry();
    (reversed.terms as BfnOntologyTerm[]).reverse();
    expect(() => validateBfnOntologyRegistry(frozenRegistry(reversed))).toThrow(
      BfnOntologyContractError,
    );
  });

  it('rejects missing parents, cross-kind parents, and parent cycles', () => {
    const missingParent = clonedRegistry();
    const missingChild = missingParent.terms.find(
      (term) => term.id === 'functional.signal_response',
    )!;
    Object.assign(missingChild, { parentId: 'functional.missing' });
    expect(() => validateBfnOntologyRegistry(frozenRegistry(missingParent))).toThrow(
      BfnOntologyContractError,
    );

    const crossKind = clonedRegistry();
    const crossKindChild = crossKind.terms.find(
      (term) => term.id === 'functional.signal_response',
    )!;
    Object.assign(crossKindChild, { parentId: 'bio.ahl_receiver_regulator' });
    expect(() => validateBfnOntologyRegistry(frozenRegistry(crossKind))).toThrow(
      BfnOntologyContractError,
    );

    const cycle = clonedRegistry();
    const response = cycle.terms.find((term) => term.id === 'functional.signal_response')!;
    const production = cycle.terms.find((term) => term.id === 'functional.signal_production')!;
    Object.assign(response, { parentId: production.id });
    Object.assign(production, { parentId: response.id });
    expect(() => validateBfnOntologyRegistry(frozenRegistry(cycle))).toThrow(
      BfnOntologyContractError,
    );
  });

  it('rejects missing family cardinality, wrong basis, and unexpected current mappings', () => {
    const missingFamily = deepFreezeBfnOntologyValue(
      BFN_ONTOLOGY_ASSIGNMENTS.filter(
        (assignment) =>
          !(
            assignment.subjectType === 'builtin_module' &&
            assignment.subjectId === 'reporter' &&
            assignment.ontologyId === 'bio.reporter_system'
          ),
      ),
    );
    expect(() => validateBfnOntologyAssignments(BFN_ONTOLOGY_REGISTRY, missingFamily)).toThrow(
      BfnOntologyContractError,
    );

    const wrongBasis = structuredClone(BFN_ONTOLOGY_ASSIGNMENTS) as BfnOntologyAssignment[];
    const catalogIndex = wrongBasis.findIndex(
      (assignment) => assignment.subjectType === 'catalog_component',
    );
    wrongBasis[catalogIndex] = { ...wrongBasis[catalogIndex]!, basis: 'curated' };
    expect(() =>
      validateBfnOntologyAssignments(
        BFN_ONTOLOGY_REGISTRY,
        deepFreezeBfnOntologyValue(wrongBasis.sort(compareBfnOntologyAssignments)),
      ),
    ).toThrow(BfnOntologyContractError);

    const wrongMapping = structuredClone(BFN_ONTOLOGY_ASSIGNMENTS) as BfnOntologyAssignment[];
    const reporterFunctional = wrongMapping.findIndex(
      (assignment) =>
        assignment.subjectType === 'builtin_module' &&
        assignment.subjectId === 'reporter' &&
        assignment.ontologyId === 'functional.expression_transfer',
    );
    wrongMapping[reporterFunctional] = {
      ...wrongMapping[reporterFunctional]!,
      ontologyId: 'functional.signal_response',
    };
    expect(() =>
      validateBfnOntologyAssignments(
        BFN_ONTOLOGY_REGISTRY,
        deepFreezeBfnOntologyValue(wrongMapping.sort(compareBfnOntologyAssignments)),
        BFN_ONTOLOGY_EXPECTED_SUBJECTS,
      ),
    ).toThrow(BfnOntologyContractError);
  });
});
