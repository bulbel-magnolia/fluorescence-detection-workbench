import { describe, expect, it } from 'vitest';
import { loadReleaseCatalogPresentation } from '../../catalog/releaseCatalogPresentation';
import {
  BFN_ONTOLOGY_ASSIGNMENTS,
  BFN_ONTOLOGY_EXPECTED_SUBJECTS,
  BUILTIN_MODULE_ID_BY_LABEL_KEY,
  BUILTIN_MODULE_ONTOLOGY_IDS,
  BUILTIN_ONTOLOGY_ASSIGNMENTS,
  CATALOG_ONTOLOGY_ASSIGNMENTS,
  CATALOG_ROLE_ONTOLOGY_IDS,
  compareBfnOntologyAssignments,
} from './ontologyAssignments';
import { BFN_ONTOLOGY_REGISTRY } from './ontologyRegistry';
import { BfnOntologyContractError, type BfnOntologyAssignment } from './ontologyTypes';
import {
  deepFreezeBfnOntologyValue,
  isDeepFrozenBfnOntologyValue,
  validateBfnOntologyAssignments,
} from './ontologyValidation';

const presentation = loadReleaseCatalogPresentation();

describe('BFN ontology assignments', () => {
  it('derives exactly one functional and one broad biological assignment from canonical roles', () => {
    expect(CATALOG_ONTOLOGY_ASSIGNMENTS).toHaveLength(presentation.components.length * 2);

    for (const component of presentation.components) {
      const expected = CATALOG_ROLE_ONTOLOGY_IDS[component.role];
      const assignments = CATALOG_ONTOLOGY_ASSIGNMENTS.filter(
        (assignment) => assignment.subjectId === component.id,
      );
      expect(assignments.map((assignment) => assignment.ontologyId)).toEqual(
        [expected.biologicalComponentFamilyId, expected.functionalFamilyId].sort(),
      );
      expect(
        assignments.every((assignment) => assignment.subjectType === 'catalog_component'),
      ).toBe(true);
      expect(assignments.every((assignment) => assignment.basis === 'canonical_field')).toBe(true);
    }
  });

  it('publishes the exact curated built-in module table and exact label-key identity map', () => {
    expect(BUILTIN_MODULE_ONTOLOGY_IDS).toEqual({
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
    });
    expect(BUILTIN_MODULE_ID_BY_LABEL_KEY).toEqual({
      'bfn.modules.ahlSensor.name': 'ahl-sensor',
      'bfn.modules.reporter.name': 'reporter',
      'bfn.modules.dualInput.name': 'dual-input-gate',
    });
    expect(BUILTIN_ONTOLOGY_ASSIGNMENTS).toHaveLength(6);
    expect(BUILTIN_ONTOLOGY_ASSIGNMENTS.every((assignment) => assignment.basis === 'curated')).toBe(
      true,
    );
  });

  it('deep-freezes and deterministically orders the complete assignment overlay', () => {
    expect(isDeepFrozenBfnOntologyValue(BFN_ONTOLOGY_ASSIGNMENTS)).toBe(true);
    expect(BFN_ONTOLOGY_ASSIGNMENTS).toEqual(
      [...BFN_ONTOLOGY_ASSIGNMENTS].sort(compareBfnOntologyAssignments),
    );
    expect(() =>
      validateBfnOntologyAssignments(
        BFN_ONTOLOGY_REGISTRY,
        BFN_ONTOLOGY_ASSIGNMENTS,
        BFN_ONTOLOGY_EXPECTED_SUBJECTS,
      ),
    ).not.toThrow();
  });

  it('rejects duplicate subject-term assignments', () => {
    const duplicate = deepFreezeBfnOntologyValue(
      [...BFN_ONTOLOGY_ASSIGNMENTS, { ...BFN_ONTOLOGY_ASSIGNMENTS[0]! }].sort(
        compareBfnOntologyAssignments,
      ),
    );
    expect(() => validateBfnOntologyAssignments(BFN_ONTOLOGY_REGISTRY, duplicate)).toThrow(
      BfnOntologyContractError,
    );
  });

  it('rejects unknown ontology IDs and empty subject IDs', () => {
    const unknownTerm = structuredClone(BFN_ONTOLOGY_ASSIGNMENTS) as BfnOntologyAssignment[];
    unknownTerm[0] = { ...unknownTerm[0]!, ontologyId: 'functional.unknown' };
    const frozenUnknown = deepFreezeBfnOntologyValue(
      unknownTerm.sort(compareBfnOntologyAssignments),
    );
    expect(() => validateBfnOntologyAssignments(BFN_ONTOLOGY_REGISTRY, frozenUnknown)).toThrow(
      BfnOntologyContractError,
    );

    const emptySubject = structuredClone(BFN_ONTOLOGY_ASSIGNMENTS) as BfnOntologyAssignment[];
    emptySubject[0] = { ...emptySubject[0]!, subjectId: '' };
    const frozenEmpty = deepFreezeBfnOntologyValue(
      emptySubject.sort(compareBfnOntologyAssignments),
    );
    expect(() => validateBfnOntologyAssignments(BFN_ONTOLOGY_REGISTRY, frozenEmpty)).toThrow(
      BfnOntologyContractError,
    );
  });
});
