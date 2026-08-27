import { describe, expect, it } from 'vitest';
import { createBfnComputationSignature } from '../computationSignature';
import { createDemoBfnProject } from '../fixtures';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from '../catalog/catalogBfnAdapter';
import { evaluateBfnModuleModel } from '../catalog/catalogBfnEvaluation';
import type { BfnProject, BfnStaticModel } from '../types';
import { buildCatalogInverseSearchSpace } from './catalogInverseDesignSpace';
import type {
  BfnCatalogInverseCandidate,
  BfnCatalogInverseCandidateResult,
  BfnCatalogInverseTarget,
} from './catalogInverseDesignTypes';
import { runCatalogInverseDesign } from './catalogInverseDesignEvaluation';

const KYLILIS_RESPONSE_ID = 'resp.kylilis2018.rhl.3oc6';
const SHONG_RESPONSE_ID = 'resp.shong2013.esar-wt-pesar.3oc6';
const CROSS_PATH_CONCENTRATION_M = 2.1e-7;

function candidateFor(responseId: string): BfnCatalogInverseCandidate {
  const candidate = buildCatalogInverseSearchSpace().candidates.find(
    (entry) => entry.responseId === responseId,
  );
  if (candidate === undefined) throw new Error('missing candidate: ' + responseId);
  return candidate;
}

function permissiveTarget(
  candidate: BfnCatalogInverseCandidate,
  lowConcentrationM = CROSS_PATH_CONCENTRATION_M,
): BfnCatalogInverseTarget {
  return {
    inputSignalId: candidate.inputSignalId,
    responseWindow: {
      lowConcentrationM,
      lowResponseMaximum: 1,
      highConcentrationM: lowConcentrationM * 2,
      highResponseMinimum: 0,
    },
    biologicalDirection: candidate.biologicalDirection,
  };
}

function resultForResponse(
  responseId: string,
  target: BfnCatalogInverseTarget,
): BfnCatalogInverseCandidateResult {
  const result = runCatalogInverseDesign(buildCatalogInverseSearchSpace(), target);
  const candidate = [...result.matched, ...result.nearMatches, ...result.notApplicable].find(
    (entry) => entry.responseId === responseId,
  );
  if (candidate === undefined) throw new Error('missing inverse result: ' + responseId);
  return candidate;
}

function instantiateForCrossPath(responseId: string): {
  project: BfnProject;
  module: BfnProject['network']['modules'][number];
  model: BfnStaticModel;
} {
  const project = createDemoBfnProject();
  const outcome = instantiateCatalogResponseInBfnProject(
    project,
    buildBfnCatalogRuntimeCandidate(responseId),
    {
      moduleId: 'module-cross-path-' + responseId,
      modulePosition: { x: 320, y: 240 },
      createInputSource: false,
    },
  );
  if (!outcome.ok) throw new Error(outcome.error.code);
  const module = outcome.nextProject.network.modules.find(
    (entry) => entry.id === outcome.addedModuleId,
  );
  const model = module?.modelVariants[0];
  if (module === undefined || model === undefined || model.mode !== 'static') {
    throw new Error('expected an instantiated static Catalog model');
  }
  return { project: outcome.nextProject, module, model };
}

function networkValue(responseId: string, concentrationM: number): number {
  const fixture = instantiateForCrossPath(responseId);
  const inputPort = fixture.module.inputPorts[0];
  if (inputPort === undefined) throw new Error('expected Catalog input port');
  return evaluateBfnModuleModel(fixture.project, fixture.module, fixture.model, {
    [inputPort.id]: concentrationM,
  });
}

describe('catalog inverse design cross-path scientific invariants', () => {
  it.each([
    ['Kylilis 4PL', KYLILIS_RESPONSE_ID],
    ['Shong derepression', SHONG_RESPONSE_ID],
  ] as const)('matches the instantiated BFN module evaluator for %s', (_label, responseId) => {
    const candidate = candidateFor(responseId);
    const target = permissiveTarget(candidate);
    const inverse = resultForResponse(responseId, target);

    expect(inverse.status).toBe('matched');
    if (inverse.status === 'not-applicable') {
      throw new Error('expected an evaluated inverse result');
    }
    const fromNetwork = networkValue(responseId, CROSS_PATH_CONCENTRATION_M);

    expect(inverse.evaluation.lowResponse).toBeCloseTo(fromNetwork, 15);
    expect(inverse.evaluation.lowResponse).toBe(inverse.evaluation.curve[0]?.response);
  });

  it('keeps Shong biological derepression separate from its increasing mathematical response', () => {
    const candidate = candidateFor(SHONG_RESPONSE_ID);
    const inverse = resultForResponse(SHONG_RESPONSE_ID, permissiveTarget(candidate));

    expect(candidate.biologicalDirection).toBe('derepression');
    expect(inverse.status).toBe('matched');
    if (inverse.status === 'not-applicable') {
      throw new Error('expected an evaluated Shong result');
    }
    expect(inverse.evaluation.highResponse).toBeGreaterThan(inverse.evaluation.lowResponse);
    expect(inverse.evaluation.highResponse).toBeCloseTo(
      networkValue(SHONG_RESPONSE_ID, CROSS_PATH_CONCENTRATION_M * 2),
      15,
    );
  });

  it('is deterministic and leaves Project content and computation signature unchanged', () => {
    const project = createDemoBfnProject();
    const before = structuredClone(project);
    const signatureBefore = createBfnComputationSignature(project);
    const searchSpace = buildCatalogInverseSearchSpace();
    const target = permissiveTarget(candidateFor(KYLILIS_RESPONSE_ID));

    const first = runCatalogInverseDesign(searchSpace, target);
    const second = runCatalogInverseDesign(searchSpace, target);

    expect(second).toEqual(first);
    expect(project).toEqual(before);
    expect(createBfnComputationSignature(project)).toBe(signatureBefore);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.target)).toBe(true);
    expect(Object.isFrozen(first.matched)).toBe(true);
  });
});
