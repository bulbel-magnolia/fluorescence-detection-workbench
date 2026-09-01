import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from '../../../bfn/catalog/catalogBfnAdapter';
import { createBfnComputationSignature } from '../../../bfn/computationSignature';
import { createCatalogModule, createDemoBfnProject } from '../../../bfn/fixtures';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../catalog/v2/catalogRuntimeDemoWhitelist';
import {
  isTrustedReleaseCatalogPresentation,
  loadReleaseCatalogPresentation,
} from '../../catalog/releaseCatalogPresentation';
import {
  resolveBfnModuleSemanticProfile,
  resolveBuiltInModuleSemanticProfile,
  resolveCatalogComponentSemanticProfile,
} from './ontologyResolver';
import { BfnOntologyContractError } from './ontologyTypes';
import { isDeepFrozenBfnOntologyValue } from './ontologyValidation';

const familyIds = (profile: ReturnType<typeof resolveBfnModuleSemanticProfile>) => ({
  functional: profile.functionalFamilies.map((term) => term.id),
  biological: profile.biologicalComponentFamilies.map((term) => term.id),
});

describe('BFN ontology resolver', () => {
  it('resolves all trusted Catalog components from exact IDs and canonical roles', () => {
    const presentation = loadReleaseCatalogPresentation();
    for (const component of presentation.components) {
      const profile = resolveCatalogComponentSemanticProfile(component.id, presentation);
      expect(familyIds(profile)).toEqual(
        component.role === 'receiver'
          ? {
              functional: ['functional.signal_response'],
              biological: ['bio.ahl_receiver_regulator'],
            }
          : {
              functional: ['functional.signal_production'],
              biological: ['bio.ahl_synthase'],
            },
      );
      expect(profile.classificationStatus).toBe('classified');
      expect(
        profile.assignments.every((assignment) => assignment.basis === 'canonical_field'),
      ).toBe(true);
    }
  });

  it('fails closed for an untrusted Catalog presentation and a missing exact component ID', () => {
    const trusted = loadReleaseCatalogPresentation();
    const untrusted = structuredClone(trusted);
    expect(isTrustedReleaseCatalogPresentation(untrusted)).toBe(false);
    expect(() =>
      resolveCatalogComponentSemanticProfile(trusted.components[0]!.id, untrusted),
    ).toThrow(BfnOntologyContractError);
    try {
      resolveCatalogComponentSemanticProfile(trusted.components[0]!.id, untrusted);
    } catch (error) {
      expect((error as BfnOntologyContractError).code).toBe('catalog-presentation-untrusted');
    }

    expect(() => resolveCatalogComponentSemanticProfile('missing-component', trusted)).toThrow(
      BfnOntologyContractError,
    );
    try {
      resolveCatalogComponentSemanticProfile('missing-component', trusted);
    } catch (error) {
      expect((error as BfnOntologyContractError).code).toBe('catalog-component-not-found');
    }
  });

  it('keeps a classified Catalog sender outside quantitative sender runtime', () => {
    const presentation = loadReleaseCatalogPresentation();
    const sender = presentation.components.find((component) => component.role === 'sender');
    if (!sender) throw new Error('sender fixture missing');

    expect(familyIds(resolveCatalogComponentSemanticProfile(sender.id, presentation))).toEqual({
      functional: ['functional.signal_production'],
      biological: ['bio.ahl_synthase'],
    });
    expect(presentation.catalog.senderOutputs).toHaveLength(0);
    expect(sender.responseVariants).toHaveLength(0);
    expect(sender.simulationReady).toBe(false);
  });

  it('resolves the exact built-in software identities without changing model or evidence semantics', () => {
    const sensor = createCatalogModule('ahl-sensor', 'ontology-sensor');
    const reporter = createCatalogModule('reporter', 'ontology-reporter');
    const dual = createCatalogModule('dual-input-gate', 'ontology-dual');

    expect(familyIds(resolveBfnModuleSemanticProfile(sensor))).toEqual({
      functional: ['functional.signal_response'],
      biological: ['bio.ahl_receiver_regulator'],
    });
    expect(new Set(sensor.modelVariants.map((model) => model.family))).toEqual(
      new Set(['hill_activation', 'first_order']),
    );

    expect(familyIds(resolveBuiltInModuleSemanticProfile('reporter'))).toEqual({
      functional: ['functional.expression_transfer'],
      biological: ['bio.reporter_system'],
    });
    expect(reporter.evidenceGrade).toBe('mechanistic_model_only');
    expect(reporter.modelVariants.find((model) => model.mode === 'static')?.family).toBe(
      'linear_transfer',
    );

    const dualProfile = resolveBfnModuleSemanticProfile(dual);
    expect(familyIds(dualProfile)).toEqual({
      functional: ['functional.multi_input_integration'],
      biological: ['bio.unclassified'],
    });
    expect(dualProfile.classificationStatus).toBe('partially-classified');
    const dualModel = dual.modelVariants.find((model) => model.mode === 'static');
    if (
      !dualModel ||
      dualModel.mode !== 'static' ||
      dualModel.response.family !== 'independent_inputs'
    )
      throw new Error('dual-input fixture missing');
    expect(dualModel.response.interactionAssumption).toBe('independent_unverified');
  });

  it('uses Catalog reference identity even when a module display name changes', () => {
    const project = createDemoBfnProject();
    const candidate = buildBfnCatalogRuntimeCandidate(
      AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id,
    );
    const instantiated = instantiateCatalogResponseInBfnProject(project, candidate, {
      moduleId: 'module-catalog-ontology',
      modulePosition: { x: 400, y: 220 },
      createInputSource: false,
    });
    if (!instantiated.ok) throw new Error(instantiated.error.code);
    const module = instantiated.nextProject.network.modules.at(-1)!;
    const baseline = resolveBfnModuleSemanticProfile(module);
    const renamed = structuredClone(module);
    renamed.displayName = { en: 'Completely renamed', zh: '完全重命名' };

    expect(resolveBfnModuleSemanticProfile(renamed)).toEqual(baseline);
    renamed.activeModelIds.static = 'missing-active-model';
    expect(resolveBfnModuleSemanticProfile(renamed)).toEqual(baseline);
  });

  it('returns explicit unclassified terms for unknown names, near-match label keys, and model families', () => {
    const unknown = createCatalogModule('ahl-sensor', 'unknown-semantic');
    unknown.labelKey = 'bfn.modules.ahlSensor.namex';
    unknown.displayName = { en: 'LuxR Sensor', zh: 'LuxR 传感器' };
    const profile = resolveBfnModuleSemanticProfile(unknown);

    expect(unknown.modelVariants[0]?.family).toBe('hill_activation');
    expect(familyIds(profile)).toEqual({
      functional: ['functional.unclassified'],
      biological: ['bio.unclassified'],
    });
    expect(profile.assignments).toEqual([]);
    expect(profile.classificationStatus).toBe('unclassified');
    expect(isDeepFrozenBfnOntologyValue(profile)).toBe(true);
  });

  it('is a pure read that leaves project state and the computation signature unchanged', () => {
    const project = createDemoBfnProject();
    const snapshot = structuredClone(project);
    const signature = createBfnComputationSignature(project);

    for (const module of project.network.modules) resolveBfnModuleSemanticProfile(module);

    expect(project).toEqual(snapshot);
    expect(createBfnComputationSignature(project)).toBe(signature);
    expect(project.schema).toBe('BFN-IR');
    expect(project.schemaVersion).toBe('2.3');
  });

  it('keeps semantic source files independent from evaluators, simulation, and instantiation', () => {
    const directory = join(process.cwd(), 'src/features/modeling/ontology/v1');
    const sources = ['ontologyRegistry.ts', 'ontologyAssignments.ts', 'ontologyResolver.ts']
      .map((file) => readFileSync(join(directory, file), 'utf8'))
      .join('\n');
    for (const prohibited of [
      'evaluateReceiverResponse',
      'runBfnSimulation',
      'instantiateBfnCatalogResponse',
      'instantiateCatalogResponseInBfnProject',
      'receiverResponseEvaluator',
      '/simulation',
      'catalogInstantiation',
    ]) {
      expect(sources).not.toContain(prohibited);
    }
  });
});
