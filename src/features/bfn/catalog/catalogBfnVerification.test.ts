import { describe, expect, it } from 'vitest';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import { createDemoBfnProject } from '../fixtures';
import type { BfnFunctionalModule, BfnProject, BfnStaticModel } from '../types';
import { addIdealConnection, validateBfnProject } from '../validation';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalogBfnAdapter';
import { BfnCatalogContractError } from './catalogBfnTypes';
import { verifyBfnCatalogModel } from './catalogBfnVerification';

interface VerificationFixture {
  project: BfnProject;
  module: BfnFunctionalModule;
  model: BfnStaticModel;
}

function fixture(): VerificationFixture {
  const project = createDemoBfnProject();
  project.network.inputSources = [];
  project.network.modules = [];
  project.network.edges = [];
  project.registry.validityDomains = [];
  const candidate = buildBfnCatalogRuntimeCandidate(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id);
  const instantiated = instantiateCatalogResponseInBfnProject(project, candidate, {
    moduleId: 'module-catalog-verification',
    modulePosition: { x: 360, y: 220 },
    createInputSource: true,
    inputSourceId: 'source-catalog-verification',
    inputSourcePosition: { x: 40, y: 220 },
  });
  if (!instantiated.ok) throw new Error(instantiated.error.code);
  const next = instantiated.nextProject;
  const source = next.network.inputSources[0];
  const module = next.network.modules[0];
  const monitor = next.network.outputMonitors[0];
  const model = module?.modelVariants[0];
  if (!source || !module || !monitor || !model || model.mode !== 'static') {
    throw new Error('verification fixture failed');
  }
  monitor.inputPort = {
    ...module.outputPorts[0]!,
    id: monitor.inputPort.id,
    direction: 'input',
  };
  const withInput = addIdealConnection(
    next,
    { nodeId: source.id, portId: source.outputPort.id },
    { nodeId: module.id, portId: module.inputPorts[0]!.id },
    'edge-source-catalog-verification',
  );
  const connected = addIdealConnection(
    withInput,
    { nodeId: module.id, portId: module.outputPorts[0]!.id },
    { nodeId: monitor.id, portId: monitor.inputPort.id },
    'edge-catalog-verification-monitor',
  );
  return { project: connected, module, model };
}

describe('Catalog-backed BFN runtime verification', () => {
  it('rebuilds a trusted binding from the frozen release for an untouched model', () => {
    const value = fixture();
    const verified = verifyBfnCatalogModel(value.project, value.module, value.model);

    expect(verified.binding.receiverResponseId).toBe(value.model.catalogReference?.responseId);
    expect(verified.domain.id).toBe(value.model.validityDomainId);
    expect(
      validateBfnProject(value.project).filter((issue) => issue.code.startsWith('catalog_')),
    ).toEqual([]);
  });

  it.each([
    [
      'source EC50',
      (value: VerificationFixture) => (value.model.catalogReference!.sourceParameters.ec50 *= 2),
    ],
    [
      'source Hill coefficient',
      (value: VerificationFixture) =>
        (value.model.catalogReference!.sourceParameters.hillCoefficient += 1),
    ],
    [
      'source IDs',
      (value: VerificationFixture) => value.model.catalogReference!.sourceIds.reverse(),
    ],
    [
      'runtime implementation',
      (value: VerificationFixture) =>
        (value.model.catalogReference!.runtimeImplementation = 'untrusted'),
    ],
    [
      'response ID',
      (value: VerificationFixture) =>
        (value.model.catalogReference!.responseId = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[1]!.id),
    ],
    [
      'derived K',
      (value: VerificationFixture) => {
        if (value.model.response.family === 'hill_activation') value.model.response.k.value *= 2;
      },
    ],
    [
      'derived n',
      (value: VerificationFixture) => {
        if (value.model.response.family === 'hill_activation') value.model.response.n.value += 1;
      },
    ],
    [
      'derived ymin/ymax',
      (value: VerificationFixture) => {
        if (value.model.response.family === 'hill_activation')
          value.model.response.ymin.value = 0.1;
      },
    ],
    [
      'input entity',
      (value: VerificationFixture) => (value.module.inputPorts[0]!.entity = 'display-name-only'),
    ],
    ['input unit', (value: VerificationFixture) => (value.module.inputPorts[0]!.unit = 'nM')],
    [
      'output semantics',
      (value: VerificationFixture) => (value.module.outputPorts[0]!.entity = 'raw_fluorescence'),
    ],
    [
      'working range',
      (value: VerificationFixture) => {
        const domain = value.project.registry.validityDomains.find(
          (entry) => entry.id === value.model.validityDomainId,
        );
        if (domain) domain.inputRanges[0]!.maximum *= 2;
      },
    ],
    [
      'context identity',
      (value: VerificationFixture) => (value.model.contextId = 'ctx-invented-default'),
    ],
  ])('rejects tampering with %s instead of repairing or falling back', (_label, mutate) => {
    const value = fixture();
    mutate(value);

    expect(() => verifyBfnCatalogModel(value.project, value.module, value.model)).toThrowError(
      BfnCatalogContractError,
    );
    expect(validateBfnProject(value.project).map((issue) => issue.code)).toContain(
      'catalog_model_mismatch',
    );
  });

  it('keeps an unknown release readable while rejecting trusted execution', () => {
    const value = fixture();
    value.model.catalogReference!.releaseVersion = 'future-unknown';

    expect(() => verifyBfnCatalogModel(value.project, value.module, value.model)).toThrowError(
      BfnCatalogContractError,
    );
    try {
      verifyBfnCatalogModel(value.project, value.module, value.model);
    } catch (error) {
      expect(error).toMatchObject({ code: 'catalog_release_unavailable' });
    }
    expect(validateBfnProject(value.project).map((issue) => issue.code)).toContain(
      'catalog_release_unavailable',
    );
  });

  it('handles a malformed imported reference as a business error without a TypeError', () => {
    const value = fixture();
    Object.assign(value.model, { catalogReference: { kind: 'catalog_receiver_response' } });

    expect(() => verifyBfnCatalogModel(value.project, value.module, value.model)).toThrowError(
      BfnCatalogContractError,
    );
    try {
      verifyBfnCatalogModel(value.project, value.module, value.model);
    } catch (error) {
      expect(error).toMatchObject({ code: 'catalog_model_reference_invalid' });
      expect(error).not.toBeInstanceOf(TypeError);
    }
  });

  it.each([
    [
      'model provenance array',
      (value: VerificationFixture) => Object.assign(value.model, { sourceDatasetIds: null }),
    ],
    [
      'module implementation array',
      (value: VerificationFixture) => Object.assign(value.module, { implementationIds: null }),
    ],
    [
      'validity-domain ranges',
      (value: VerificationFixture) =>
        Object.assign(value.project.registry.validityDomains[0]!, { inputRanges: null }),
    ],
  ])('handles malformed imported %s without leaking a TypeError', (_label, mutate) => {
    const value = fixture();
    mutate(value);

    try {
      verifyBfnCatalogModel(value.project, value.module, value.model);
      throw new Error('expected verification failure');
    } catch (error) {
      expect(error).toBeInstanceOf(BfnCatalogContractError);
      expect(error).not.toBeInstanceOf(TypeError);
      expect(error).toMatchObject({ code: 'catalog_model_mismatch' });
    }
  });
});
