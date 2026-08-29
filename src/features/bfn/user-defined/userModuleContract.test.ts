import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { UserDefinedFunctionalModuleDraft } from './userModuleContract';
import { assessUserDefinedFunctionalModule } from './userModuleValidation';

describe('user-defined functional module authoring contract', () => {
  it('keeps scientific, representation, runtime, evidence, and implementation axes independent', () => {
    const draft = createDesignedSenderDraft();
    const assessment = assessUserDefinedFunctionalModule(draft);

    expect(assessment.semantic).toEqual({ state: 'valid', issues: [] });
    expect(assessment.runtime).toEqual({ state: 'supported', issues: [] });
    expect(assessment.evidence).toEqual({
      basis: 'proposed_unbuilt_design',
      provenanceState: 'not_required',
      issues: [],
    });
    expect(assessment.implementation).toEqual({ state: 'unspecified', issues: [] });
    expect(assessment.representation.state).toBe('requires_ir_extension');
    expect(issueCodes(assessment.representation.issues)).toEqual(
      expect.arrayContaining([
        'authoring_origin_not_representable',
        'user_name_not_representable',
        'free_description_not_representable',
        'custom_entity_registry_missing',
        'unrecorded_context_not_representable',
        'unrecorded_uncertainty_not_representable',
        'implementation_maturity_not_explicit',
      ]),
    );
    expect(assessment).not.toHaveProperty('overall');
    expect(assessment).not.toHaveProperty('score');
    expect(assessment).not.toHaveProperty('admitted');
    expect(assessment).not.toHaveProperty('materializedModule');

    const emptyContext = assessUserDefinedFunctionalModule({
      ...draft,
      context: { state: 'defined', facts: { hostSpecies: '' } },
    });
    expect(issueCodes(emptyContext.semantic.issues)).toContain('context_fact_invalid');
    expect(emptyContext.runtime.state).toBe('supported');
    expect(issueCodes(emptyContext.representation.issues)).toContain(
      'partial_context_not_representable',
    );
  });

  it('accepts a production-rate output without coercing it to concentration', () => {
    const assessment = assessUserDefinedFunctionalModule(createDesignedSenderDraft());

    expect(assessment.semantic.state).toBe('valid');
    expect(assessment.runtime.state).toBe('supported');
    expect(allIssueCodes(assessment)).not.toContain('unsupported_quantity_type');
    expect(allIssueCodes(assessment)).not.toContain('unsupported_unit');
    expect(allIssueCodes(assessment)).not.toContain('linear_dimension_mismatch');
  });

  it('accepts an ordinary AHL concentration to normalized activity Hill contract', () => {
    const source = createDesignedSenderDraft();
    const draft: UserDefinedFunctionalModuleDraft = {
      ...source,
      id: 'user.module.ahl-to-activity',
      name: 'AHL to normalized activity',
      description: null,
      ports: [
        {
          ...source.ports[0]!,
          entity: { id: 'entity.ahl.3oc6', displayName: '3OC6-HSL' },
        },
        {
          ...source.ports[1]!,
          entity: { id: 'entity.user.normalized-activity', displayName: 'Normalized activity' },
          quantityType: 'activity',
          unit: 'RPU',
        },
      ],
      model: {
        ...source.model,
        parameters: {
          k: { value: 8, unit: 'nM' },
          n: { value: 1.8, unit: 'dimensionless' },
          ymin: { value: 0.02, unit: 'RPU' },
          ymax: { value: 1, unit: 'RPU' },
        },
      },
    };

    const assessment = assessUserDefinedFunctionalModule(draft);

    expect(assessment.semantic.state).toBe('valid');
    expect(assessment.runtime.state).toBe('supported');
    expect(assessment.evidence.basis).toBe('proposed_unbuilt_design');
  });

  it('rejects an unsupported scientific unit without mapping it to a supported unit', () => {
    const source = createDesignedSenderDraft();
    const unsupportedUnit = 'nmol gDW^-1 h^-1';
    const draft: UserDefinedFunctionalModuleDraft = {
      ...source,
      ports: [source.ports[0]!, { ...source.ports[1]!, unit: unsupportedUnit }],
      model: {
        ...source.model,
        parameters: {
          ...source.model.parameters,
          ymin: { value: 0.1, unit: unsupportedUnit },
          ymax: { value: 4.2, unit: unsupportedUnit },
        },
      },
    };

    const assessment = assessUserDefinedFunctionalModule(draft);

    expect(issueCodes(assessment.semantic.issues)).toContain('unsupported_unit');
    expect(assessment.runtime.state).toBe('unsupported');
    expect(draft.ports[1]!.unit).toBe(unsupportedUnit);
  });

  it('rejects missing and scientifically invalid Hill parameters', () => {
    const source = createDesignedSenderDraft();
    const draft: UserDefinedFunctionalModuleDraft = {
      ...source,
      model: {
        ...source.model,
        parameters: {
          k: { value: 0, unit: 'uM' },
          ymin: { value: 5, unit: 'nM/h' },
          ymax: { value: 2, unit: 'nM' },
        },
      },
    };

    const assessment = assessUserDefinedFunctionalModule(draft);

    expect(assessment.semantic.state).toBe('invalid');
    expect(issueCodes(assessment.semantic.issues)).toEqual(
      expect.arrayContaining([
        'hill_parameter_missing',
        'hill_parameter_not_positive',
        'hill_k_unit_mismatch',
        'hill_output_unit_mismatch',
        'hill_output_bounds_invalid',
      ]),
    );
    expect(assessment.runtime.state).toBe('unsupported');
    expect(issueCodes(assessment.runtime.issues)).toContain('mathematical_contract_incomplete');
    expect(assessment.evidence.basis).toBe('proposed_unbuilt_design');
    expect(assessment.implementation.state).toBe('unspecified');

    const nonPositiveN = assessUserDefinedFunctionalModule({
      ...source,
      model: {
        ...source.model,
        parameters: {
          ...source.model.parameters,
          n: { value: -1, unit: 'dimensionless' },
        },
      },
    });
    expect(issueCodes(nonPositiveN.semantic.issues)).toContain('hill_parameter_not_positive');
    expect(nonPositiveN.runtime.state).toBe('unsupported');
  });

  it('requires stable entity identity, supported quantities and units, unique ports, and valid directions', () => {
    const source = createDesignedSenderDraft();
    const draft: UserDefinedFunctionalModuleDraft = {
      ...source,
      origin: 'catalog',
      ports: [
        {
          id: 'signal-in',
          name: 'Unidentified input',
          entity: { id: '', displayName: '' },
          quantityType: '',
          unit: '',
          direction: 'output',
        },
        { ...source.ports[1]!, id: 'signal-in' },
      ],
    };

    const assessment = assessUserDefinedFunctionalModule(draft);

    expect(assessment.semantic.state).toBe('invalid');
    expect(issueCodes(assessment.semantic.issues)).toEqual(
      expect.arrayContaining([
        'entity_id_missing',
        'entity_name_missing',
        'authoring_origin_invalid',
        'unsupported_quantity_type',
        'unsupported_unit',
        'duplicate_port_id',
        'model_input_direction_invalid',
      ]),
    );
  });

  it('requires one finite validity range for every model input', () => {
    const source = createDesignedSenderDraft();
    const missing = assessUserDefinedFunctionalModule({ ...source, validityDomains: [] });
    const malformed = assessUserDefinedFunctionalModule({
      ...source,
      validityDomains: [
        { portId: 'signal-in', minimum: 10, maximum: 5, unit: 'uM' },
        { portId: 'unknown-port', minimum: 0, maximum: 1, unit: 'nM' },
      ],
    });

    expect(issueCodes(missing.semantic.issues)).toContain('validity_domain_missing');
    expect(missing.runtime.state).toBe('unsupported');
    expect(issueCodes(malformed.semantic.issues)).toEqual(
      expect.arrayContaining([
        'validity_domain_bounds_invalid',
        'validity_domain_unit_mismatch',
        'validity_domain_port_unknown',
      ]),
    );
  });

  it('keeps measured evidence provenance failures off the mathematical axes', () => {
    const source = createDesignedSenderDraft();
    const draft: UserDefinedFunctionalModuleDraft = {
      ...source,
      evidence: { basis: 'measured_single_context', provenance: [] },
    };

    const assessment = assessUserDefinedFunctionalModule(draft);

    expect(assessment.semantic.state).toBe('valid');
    expect(assessment.runtime.state).toBe('supported');
    expect(assessment.evidence).toEqual({
      basis: 'measured_single_context',
      provenanceState: 'missing',
      issues: [
        expect.objectContaining({ code: 'measured_evidence_provenance_missing', axis: 'evidence' }),
      ],
    });
    expect(assessment.implementation.state).toBe('unspecified');

    const invalidProvenance = assessUserDefinedFunctionalModule({
      ...source,
      evidence: {
        basis: 'measured_single_context',
        provenance: [{ id: 'evidence-1', kind: 'free_text_guess', reference: 'untyped source' }],
      },
    });
    expect(invalidProvenance.evidence.provenanceState).toBe('missing');
    expect(issueCodes(invalidProvenance.evidence.issues)).toContain('provenance_record_invalid');
  });

  it('audits generic external provenance as a representation gap without rejecting it', () => {
    const source = createDesignedSenderDraft();
    const draft: UserDefinedFunctionalModuleDraft = {
      ...source,
      evidence: {
        basis: 'fitted_from_published_data',
        provenance: [
          {
            id: 'doi:10.0000/example',
            kind: 'publication',
            reference: 'Example et al. (2026), DOI 10.0000/example',
          },
        ],
      },
    };

    const assessment = assessUserDefinedFunctionalModule(draft);

    expect(assessment.semantic.state).toBe('valid');
    expect(assessment.runtime.state).toBe('supported');
    expect(assessment.evidence.provenanceState).toBe('sufficient');
    expect(issueCodes(assessment.representation.issues)).toContain(
      'generic_provenance_not_representable',
    );
  });

  it('rejects arbitrary formulas and multiple model outputs from the first authoring runtime', () => {
    const source = createDesignedSenderDraft();
    const formula = assessUserDefinedFunctionalModule({
      ...source,
      model: {
        family: 'custom_formula',
        inputPortIds: ['signal-in'],
        outputPortIds: ['production-out'],
        expression: 'sin(x) + x / (1 - x)',
        parameters: {},
      },
    });
    const twoOutputs: UserDefinedFunctionalModuleDraft = {
      ...source,
      ports: [
        ...source.ports,
        {
          id: 'secondary-out',
          name: 'Secondary output',
          entity: { id: 'entity.secondary', displayName: 'Secondary product' },
          quantityType: 'production_rate',
          unit: 'nM/h',
          direction: 'output',
        },
      ],
      model: { ...source.model, outputPortIds: ['production-out', 'secondary-out'] },
    };
    const multiple = assessUserDefinedFunctionalModule(twoOutputs);

    expect(formula.semantic.state).toBe('invalid');
    expect(issueCodes(formula.semantic.issues)).toContain('unsupported_model_family');
    expect(formula.runtime.state).toBe('unsupported');
    expect(issueCodes(formula.runtime.issues)).toContain('model_family_not_executable');
    expect(multiple.semantic.state).toBe('invalid');
    expect(issueCodes(multiple.semantic.issues)).toContain('model_output_arity_unsupported');
    expect(issueCodes(multiple.representation.issues)).toContain(
      'model_output_binding_not_representable',
    );
  });

  it('allows only dimensionally safe linear transfer in the first authoring contract', () => {
    const source = createDesignedSenderDraft();
    const valid: UserDefinedFunctionalModuleDraft = {
      ...source,
      ports: [
        { ...source.ports[0]!, quantityType: 'activity', unit: 'RPU' },
        { ...source.ports[1]!, quantityType: 'expression_level', unit: 'RPU' },
      ],
      model: {
        family: 'linear_transfer',
        inputPortIds: ['signal-in'],
        outputPortIds: ['production-out'],
        parameters: {
          scale: { value: 0.8, unit: 'dimensionless' },
          intercept: { value: 0.1, unit: 'RPU' },
        },
      },
      validityDomains: [{ portId: 'signal-in', minimum: 0, maximum: 10, unit: 'RPU' }],
    };
    const mismatch: UserDefinedFunctionalModuleDraft = {
      ...source,
      model: {
        family: 'linear_transfer',
        inputPortIds: ['signal-in'],
        outputPortIds: ['production-out'],
        parameters: {
          scale: { value: 0.8, unit: 'dimensionless' },
          intercept: { value: 0.1, unit: 'nM/h' },
        },
      },
    };

    expect(assessUserDefinedFunctionalModule(valid).semantic.state).toBe('valid');
    const assessment = assessUserDefinedFunctionalModule(mismatch);
    expect(assessment.semantic.state).toBe('invalid');
    expect(issueCodes(assessment.semantic.issues)).toContain('linear_dimension_mismatch');
    expect(issueCodes(assessment.representation.issues)).toContain(
      'compound_linear_scale_unit_missing',
    );
    expect(assessment.runtime.state).toBe('unsupported');
  });

  it('requires explicit independent-input coverage and evidence semantics', () => {
    const valid = createIndependentInputDraft();
    const assessment = assessUserDefinedFunctionalModule(valid);

    expect(assessment.semantic.state).toBe('valid');
    expect(assessment.runtime.state).toBe('supported');
    expect(assessment.evidence).toEqual({
      basis: 'independent_assumption',
      provenanceState: 'not_required',
      issues: [],
    });

    const terms = valid.model.terms;
    if (!terms) throw new Error('Independent-input fixture must define terms.');
    const incomplete: UserDefinedFunctionalModuleDraft = {
      ...valid,
      model: { ...valid.model, terms: terms.slice(0, 1) },
      evidence: { basis: 'proposed_unbuilt_design', provenance: [] },
    };
    const incompleteAssessment = assessUserDefinedFunctionalModule(incomplete);
    expect(issueCodes(incompleteAssessment.semantic.issues)).toContain(
      'independent_input_term_coverage_invalid',
    );
    expect(issueCodes(incompleteAssessment.evidence.issues)).toContain(
      'independent_assumption_evidence_missing',
    );
    expect(incompleteAssessment.implementation.state).toBe('unspecified');

    const duplicateInput = assessUserDefinedFunctionalModule({
      ...valid,
      model: { ...valid.model, inputPortIds: ['signal-in', 'signal-in'] },
    });
    expect(issueCodes(duplicateInput.semantic.issues)).toContain('duplicate_model_port_reference');
    expect(duplicateInput.runtime.state).toBe('unsupported');
  });

  it('is deterministic, deeply immutable, and has no project, workspace, or storage side effects', () => {
    const draft = createDesignedSenderDraft();
    const before = structuredClone(draft);
    localStorage.setItem('batch-12-sentinel', 'unchanged');

    const first = assessUserDefinedFunctionalModule(draft);
    const second = assessUserDefinedFunctionalModule(draft);

    expect(first).toEqual(second);
    expect(draft).toEqual(before);
    expect(localStorage.getItem('batch-12-sentinel')).toBe('unchanged');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.representation)).toBe(true);
    expect(Object.isFrozen(first.representation.issues)).toBe(true);
    expect(Object.isFrozen(first.representation.issues[0])).toBe(true);

    const productionSources = ['userModuleContract.ts', 'userModuleValidation.ts']
      .map((file) =>
        readFileSync(resolve(process.cwd(), 'src/features/bfn/user-defined', file), 'utf8'),
      )
      .join('\n');
    expect(productionSources).not.toMatch(
      /BfnProject|Workspace|localStorage|indexedDB|runBfnSimulation|modelResolution|senderRuntimeAdmission|ontologyAssignments/,
    );
  });
});

function createDesignedSenderDraft(): UserDefinedFunctionalModuleDraft {
  return {
    id: 'user.module.designed-ahl-sender',
    origin: 'user_defined',
    name: 'Designed AHL production module',
    description: 'A user-authored saturating production response.',
    ports: [
      {
        id: 'signal-in',
        name: 'Inducer input',
        entity: { id: 'entity.user.inducer-x', displayName: 'Inducer X' },
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
      {
        id: 'production-out',
        name: 'AHL production rate',
        entity: { id: 'entity.ahl.c8', displayName: 'C8-HSL' },
        quantityType: 'production_rate',
        unit: 'nM/h',
        direction: 'output',
      },
    ],
    model: {
      family: 'hill_activation',
      inputPortIds: ['signal-in'],
      outputPortIds: ['production-out'],
      parameters: {
        k: { value: 12, unit: 'nM' },
        n: { value: 2, unit: 'dimensionless' },
        ymin: { value: 0.1, unit: 'nM/h' },
        ymax: { value: 4.2, unit: 'nM/h' },
      },
    },
    validityDomains: [{ portId: 'signal-in', minimum: 0, maximum: 100, unit: 'nM' }],
    context: { state: 'not_recorded' },
    uncertainty: { state: 'not_recorded' },
    evidence: { basis: 'proposed_unbuilt_design', provenance: [] },
    implementation: { state: 'unspecified', implementationIds: [] },
  };
}

function createIndependentInputDraft(): UserDefinedFunctionalModuleDraft {
  const source = createDesignedSenderDraft();
  return {
    ...source,
    id: 'user.module.independent-dual-input',
    ports: [
      source.ports[0]!,
      {
        id: 'signal-in-b',
        name: 'Second inducer',
        entity: { id: 'entity.user.inducer-y', displayName: 'Inducer Y' },
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
      source.ports[1]!,
    ],
    model: {
      family: 'independent_inputs',
      inputPortIds: ['signal-in', 'signal-in-b'],
      outputPortIds: ['production-out'],
      parameters: {
        basal: { value: 0.1, unit: 'nM/h' },
        outputMaximum: { value: 5, unit: 'nM/h' },
      },
      terms: [
        {
          inputPortId: 'signal-in',
          mode: 'activation',
          k: { value: 12, unit: 'nM' },
          n: { value: 2, unit: 'dimensionless' },
          weight: { value: 0.6, unit: 'dimensionless' },
        },
        {
          inputPortId: 'signal-in-b',
          mode: 'repression',
          k: { value: 8, unit: 'nM' },
          n: { value: 1.5, unit: 'dimensionless' },
          weight: { value: 0.4, unit: 'dimensionless' },
        },
      ],
      aggregation: 'bounded_sum',
      interactionAssumption: 'independent_unverified',
    },
    validityDomains: [
      source.validityDomains[0]!,
      { portId: 'signal-in-b', minimum: 0, maximum: 80, unit: 'nM' },
    ],
    evidence: { basis: 'independent_assumption', provenance: [] },
  };
}

function issueCodes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

function allIssueCodes(assessment: ReturnType<typeof assessUserDefinedFunctionalModule>): string[] {
  return [
    ...issueCodes(assessment.semantic.issues),
    ...issueCodes(assessment.representation.issues),
    ...issueCodes(assessment.runtime.issues),
    ...issueCodes(assessment.evidence.issues),
    ...issueCodes(assessment.implementation.issues),
  ];
}
