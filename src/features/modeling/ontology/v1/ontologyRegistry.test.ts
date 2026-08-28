import { describe, expect, it } from 'vitest';
import {
  BFN_ONTOLOGY_REGISTRY,
  getBfnOntologyTerm,
  listBfnOntologyTerms,
} from './ontologyRegistry';
import { isDeepFrozenBfnOntologyValue } from './ontologyValidation';

const EXPECTED_TERM_IDS = [
  'bio.ahl_receiver_regulator',
  'bio.ahl_synthase',
  'bio.reporter_system',
  'bio.unclassified',
  'functional.binding_interaction',
  'functional.degradation_clearance',
  'functional.expression_transfer',
  'functional.molecular_conversion',
  'functional.multi_input_integration',
  'functional.signal_production',
  'functional.signal_response',
  'functional.transport',
  'functional.unclassified',
] as const;

describe('BFN ontology registry', () => {
  it('publishes the independent BFN-ONTOLOGY-1.0 manifest', () => {
    expect(BFN_ONTOLOGY_REGISTRY.manifest).toEqual({
      schema: 'BFN-ONTOLOGY',
      version: '1.0',
      id: 'bfn-semantic-ontology',
    });
  });

  it('contains the exact V1 functional and biological terms in stable ID order', () => {
    expect(BFN_ONTOLOGY_REGISTRY.terms.map((term) => term.id)).toEqual(EXPECTED_TERM_IDS);
    expect(BFN_ONTOLOGY_REGISTRY.terms.every((term) => term.parentId === null)).toBe(true);
    expect(new Set(BFN_ONTOLOGY_REGISTRY.terms.map((term) => term.id)).size).toBe(
      BFN_ONTOLOGY_REGISTRY.terms.length,
    );
  });

  it('resolves terms and returns immutable kind-specific lists', () => {
    expect(getBfnOntologyTerm('functional.signal_response')?.names).toEqual({
      en: 'Signal response',
      zh: '信号响应',
    });
    expect(getBfnOntologyTerm('missing.term')).toBeUndefined();

    const functionalTerms = listBfnOntologyTerms('functional_family');
    const biologicalTerms = listBfnOntologyTerms('biological_component_family');
    expect(functionalTerms).toHaveLength(9);
    expect(biologicalTerms).toHaveLength(4);
    expect(Object.isFrozen(functionalTerms)).toBe(true);
    expect(Object.isFrozen(biologicalTerms)).toBe(true);
  });

  it('deep-freezes the manifest, terms, names, and descriptions', () => {
    expect(isDeepFrozenBfnOntologyValue(BFN_ONTOLOGY_REGISTRY)).toBe(true);
  });

  it('keeps mathematical, runtime, and evidence vocabulary outside ontology term IDs', () => {
    const ids = BFN_ONTOLOGY_REGISTRY.terms.map((term) => term.id).join('\n');
    for (const prohibited of [
      'hill_activation',
      'first_order',
      'static',
      'dynamic',
      'runtime_demo',
      'literature',
    ]) {
      expect(ids).not.toContain(prohibited);
    }
  });
});
