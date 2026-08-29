import { describe, expect, it } from 'vitest';
import { loadReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
import { upgradeBfnProjectToCurrent } from '../bfnIrMigration';
import { createDemoBfnProject } from '../fixtures';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from '../catalog/catalogBfnAdapter';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import type { BfnProject, BfnStaticModel } from '../types';
import {
  assessBfnConnectionContextApplicability,
  resolveBfnModuleComparableContextFacts,
} from './contextIntegration';

const RESPONSE_ID = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a record fixture.');
  }
  return value as Record<string, unknown>;
}

function records(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error('Expected a record array fixture.');
  return value.map(record);
}

function migratedLegacyProjectWithContextText(
  field: 'host' | 'strain' | 'medium',
  rawText: string,
): BfnProject {
  const legacy = record(structuredClone(createDemoBfnProject()));
  legacy.schemaVersion = '2.0';
  const registry = record(legacy.registry);
  delete registry.entities;
  delete registry.provenanceRecords;
  const context = records(registry.contexts)[0]!;
  context[field] = rawText;
  for (const candidate of records(registry.contexts)) delete candidate.documentationState;
  for (const implementation of records(registry.implementations)) {
    delete implementation.maturity;
    delete implementation.provenanceIds;
  }
  for (const module of records(record(legacy.network).modules)) {
    delete module.implementationState;
    for (const model of records(module.modelVariants)) delete model.provenanceIds;
  }
  return upgradeBfnProjectToCurrent(legacy);
}

function activeStaticModel(project: BfnProject, moduleIndex: number): BfnStaticModel {
  const module = project.network.modules[moduleIndex]!;
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel =>
      candidate.id === module.activeModelIds.static && candidate.mode === 'static',
  );
  if (!model) throw new Error('Expected an active static model.');
  return model;
}

function moduleEdge(project: BfnProject) {
  const edge = project.network.edges.find(
    (candidate) =>
      project.network.modules.some((module) => module.id === candidate.source.nodeId) &&
      project.network.modules.some((module) => module.id === candidate.target.nodeId),
  );
  if (!edge) throw new Error('Expected a module-to-module edge.');
  return edge;
}

function catalogModuleProject(): BfnProject {
  const project = createDemoBfnProject();
  const candidate = buildBfnCatalogRuntimeCandidate(RESPONSE_ID);
  const result = instantiateCatalogResponseInBfnProject(project, candidate, {
    moduleId: 'module-context-catalog',
    modulePosition: { x: 520, y: 300 },
    createInputSource: false,
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.nextProject;
}

describe('BFN context integration', () => {
  it('compares resolved facts instead of treating different context IDs as a mismatch', () => {
    const project = createDemoBfnProject();
    const original = project.registry.contexts[0]!;
    const equivalent = { ...structuredClone(original), id: 'context-equivalent' };
    project.registry.contexts.push(equivalent);
    activeStaticModel(project, 1).contextId = equivalent.id;
    const edge = moduleEdge(project);

    expect(assessBfnConnectionContextApplicability(project, edge.source, edge.target).overall).toBe(
      'matched',
    );
  });

  it('keeps reported-text differences uncertain and recognizes canonical temperature differences', () => {
    const project = createDemoBfnProject();
    const original = project.registry.contexts[0]!;
    const originalHost = original.host;
    const originalTemperature = original.temperatureCelsius;
    if (originalHost === null || originalTemperature === null) {
      throw new Error('Expected the recorded demo Context facts.');
    }
    const compared = {
      ...structuredClone(original),
      id: 'context-compared',
      host: 'A differently reported host',
    };
    project.registry.contexts.push(compared);
    activeStaticModel(project, 1).contextId = compared.id;
    const edge = moduleEdge(project);

    expect(assessBfnConnectionContextApplicability(project, edge.source, edge.target).overall).toBe(
      'uncertain',
    );

    compared.host = originalHost;
    compared.temperatureCelsius = originalTemperature + 5;
    expect(assessBfnConnectionContextApplicability(project, edge.source, edge.target).overall).toBe(
      'mismatched',
    );
  });

  it('treats a null model context reference as uncertain missing information', () => {
    const project = createDemoBfnProject();
    activeStaticModel(project, 0).contextId = null;
    const edge = moduleEdge(project);

    const assessment = assessBfnConnectionContextApplicability(project, edge.source, edge.target);

    expect(assessment.overall).toBe('uncertain');
    expect(assessment.checks).toHaveLength(4);
    expect(assessment.checks.every((check) => check.state === 'uncertain')).toBe(true);
  });

  it.each([
    ['unknown', 'host', 'unknown', 'hostSpecies'],
    ['trimmed mixed-case unknown', 'host', '  UnKnOwN  ', 'hostSpecies'],
    ['N/A', 'medium', 'N/A', 'medium'],
    ['not recorded', 'host', 'not recorded', 'hostSpecies'],
    ['unspecified', 'strain', 'UNSPECIFIED', 'hostStrain'],
    ['empty', 'medium', '', 'medium'],
    ['whitespace-only', 'medium', '  \t ', 'medium'],
  ] as const)(
    'preserves migrated %s raw text but projects it as missing information',
    (_label, field, rawText, projectedField) => {
      const project = migratedLegacyProjectWithContextText(field, rawText);
      const edge = moduleEdge(project);

      expect(project.registry.contexts[0]?.[field]).toBe(rawText);
      const resolved = resolveBfnModuleComparableContextFacts(project, project.network.modules[0]!);
      expect(resolved.facts?.[projectedField].value).toBeNull();

      const assessment = assessBfnConnectionContextApplicability(project, edge.source, edge.target);
      expect(assessment.overall).toBe('uncertain');
      expect(assessment.checks.find((check) => check.field === projectedField)).toMatchObject({
        state: 'uncertain',
        evidenceValue: null,
        projectValue: null,
      });
    },
  );

  it('matches known partial facts, keeps missing facts uncertain, and preserves canonical conflicts', () => {
    const project = createDemoBfnProject();
    const original = project.registry.contexts[0]!;
    const originalTemperature = original.temperatureCelsius;
    if (originalTemperature === null) throw new Error('Expected a recorded demo temperature.');
    const partial = {
      ...structuredClone(original),
      id: 'context-partial',
      documentationState: 'partial' as const,
      strain: null,
    };
    project.registry.contexts.push(partial);
    activeStaticModel(project, 1).contextId = partial.id;
    const edge = moduleEdge(project);

    const uncertain = assessBfnConnectionContextApplicability(project, edge.source, edge.target);
    expect(uncertain.overall).toBe('uncertain');
    expect(uncertain.checks.find((check) => check.field === 'hostStrain')?.state).toBe('uncertain');
    expect(uncertain.checks.find((check) => check.field === 'temperatureCelsius')?.state).toBe(
      'matched',
    );

    partial.temperatureCelsius = originalTemperature + 5;
    expect(assessBfnConnectionContextApplicability(project, edge.source, edge.target).overall).toBe(
      'mismatched',
    );
  });

  it('uses the exact trusted Catalog parameter context and never parses free-text temperature', () => {
    const project = catalogModuleProject();
    const module = project.network.modules.find(
      (candidate) => candidate.id === 'module-context-catalog',
    )!;
    const model = module.modelVariants[0];
    if (!model || model.mode !== 'static' || !model.catalogReference) {
      throw new Error('Expected a Catalog-backed static model.');
    }
    const presentation = loadReleaseCatalogPresentation();
    const context = presentation.parameterContexts.find(
      (candidate) => candidate.id === model.catalogReference?.parameterContextId,
    );
    expect(context?.canonical.details?.temperature).toEqual(expect.any(String));

    const resolved = resolveBfnModuleComparableContextFacts(project, module);
    expect(resolved.state).toBe('available');
    expect(resolved.facts).toMatchObject({
      hostSpecies: { value: context?.hostSpecies ?? null, comparisonBasis: 'reported_text' },
      hostStrain: { value: context?.hostStrain ?? null, comparisonBasis: 'reported_text' },
      medium: {
        value: context?.canonical.details?.cultureMedium ?? null,
        comparisonBasis: 'reported_text',
      },
      temperatureCelsius: { value: null, comparisonBasis: 'canonical' },
    });
  });

  it('returns unavailable on Catalog load, trust, or exact-ID failure without falling back', () => {
    const project = catalogModuleProject();
    const module = project.network.modules.find(
      (candidate) => candidate.id === 'module-context-catalog',
    )!;
    const model = module.modelVariants[0];
    if (!model || model.mode !== 'static' || !model.catalogReference) {
      throw new Error('Expected a Catalog-backed static model.');
    }

    expect(
      resolveBfnModuleComparableContextFacts(project, module, {
        loadCatalogPresentation: () => {
          throw new Error('unavailable');
        },
      }).state,
    ).toBe('unavailable');
    expect(
      resolveBfnModuleComparableContextFacts(project, module, {
        loadCatalogPresentation: () => ({}),
      }).state,
    ).toBe('unavailable');

    model.catalogReference.parameterContextId = 'missing-context';
    expect(resolveBfnModuleComparableContextFacts(project, module).state).toBe('unavailable');
  });

  it('marks source-to-module and module-to-monitor paths not applicable', () => {
    const project = createDemoBfnProject();
    const first = project.network.edges[0]!;
    const last = project.network.edges.at(-1)!;
    expect(
      assessBfnConnectionContextApplicability(project, first.source, first.target).overall,
    ).toBe('not_applicable');
    expect(assessBfnConnectionContextApplicability(project, last.source, last.target).overall).toBe(
      'not_applicable',
    );
  });
});
