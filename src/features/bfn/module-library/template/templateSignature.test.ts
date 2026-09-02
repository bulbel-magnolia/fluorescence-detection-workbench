import { describe, expect, it } from 'vitest';
import { captureReusableModuleTemplatePayload } from './templateCapture';
import { instantiateReusableModuleTemplate } from './templateInstantiation';
import { createBfnModuleTemplatePayloadSignature } from './templateSignature';
import type { BfnReusableModulePayloadV1 } from './templateTypes';
import {
  captureAccumulatorFixture,
  captureFirstOrderFixture,
  captureStaticFixture,
  createBlankTemplateProject,
  createStaticTemplateProject,
  versionForPayload,
} from './templateTestFixtures';

describe('module template scientific payload signature', () => {
  it('is stable across source Project, module, Port, model, sidecar, and position IDs', () => {
    const first = captureStaticFixture(createStaticTemplateProject('source.module.alpha'));
    const secondProject = createStaticTemplateProject('source.module.beta');
    secondProject.id = 'source.project.renamed';
    secondProject.network.id = 'source.network.renamed';
    secondProject.network.modules[0]!.position = { x: 901, y: 419 };
    secondProject.network.modules[0]!.authoring!.name = 'Different display name';
    secondProject.network.modules[0]!.authoring!.description = 'Different description.';
    const second = captureStaticFixture(secondProject);

    expect(createBfnModuleTemplatePayloadSignature(first)).toBe(
      createBfnModuleTemplatePayloadSignature(second),
    );
  });

  it('is stable across object insertion order and template metadata changes', () => {
    const payload = captureStaticFixture();
    const reversed = reverseObjectKeys(payload) as BfnReusableModulePayloadV1;
    const firstVersion = versionForPayload(payload, 'template.first-name');
    const secondVersion = {
      ...versionForPayload(payload, 'template.second-name'),
      createdAt: '2030-01-01T00:00:00.000Z',
      note: 'metadata-only note',
    };

    expect(createBfnModuleTemplatePayloadSignature(reversed)).toBe(
      createBfnModuleTemplatePayloadSignature(payload),
    );
    expect(firstVersion.payloadSignature).toBe(secondVersion.payloadSignature);
  });

  it('does not depend on template-local key spelling', () => {
    const original = captureStaticFixture();
    const renamed = renameLocalKeys(original);

    expect(createBfnModuleTemplatePayloadSignature(renamed)).toBe(
      createBfnModuleTemplatePayloadSignature(original),
    );
  });

  it('is stable across freshly generated instance IDs after recapture', () => {
    const payload = captureStaticFixture();
    const version = versionForPayload(payload, 'template.instance-id-stability');
    const first = instantiateReusableModuleTemplate(
      version,
      createBlankTemplateProject('project.instance-id-one'),
      {},
      {
        instanceId: 'instance.signature-one',
        instanceName: 'First',
        instanceDescription: null,
      },
    );
    const second = instantiateReusableModuleTemplate(
      version,
      createBlankTemplateProject('project.instance-id-two'),
      {},
      {
        instanceId: 'instance.signature-two',
        instanceName: 'Second',
        instanceDescription: 'Presentation-only difference.',
      },
    );
    if (!first.ok || !second.ok) throw new Error('Expected two valid instances.');

    const recapture = (
      result: Extract<typeof first, { readonly ok: true }>,
    ): BfnReusableModulePayloadV1 => {
      const module = result.nextProject.network.modules.find(
        (candidate) => candidate.id === result.addedModuleId,
      )!;
      const captured = captureReusableModuleTemplatePayload(
        result.nextProject,
        result.addedModuleId,
        {
          entityPolicies: Object.fromEntries(
            [...module.inputPorts, ...module.outputPorts].map((port) => [port.entity, 'embedded']),
          ),
        },
      );
      if (!captured.ok) throw new Error('Expected recapture to succeed.');
      return captured.payload;
    };
    const originalSignature = createBfnModuleTemplatePayloadSignature(payload);
    expect(createBfnModuleTemplatePayloadSignature(recapture(first))).toBe(originalSignature);
    expect(createBfnModuleTemplatePayloadSignature(recapture(second))).toBe(originalSignature);
  });

  it.each([
    [
      'parameter value',
      (payload: BfnReusableModulePayloadV1) =>
        (hillResponse(payload).k.value = hillResponse(payload).k.value + 1),
    ],
    [
      'parameter interval',
      (payload: BfnReusableModulePayloadV1) => (hillResponse(payload).k.interval95 = [9, 15]),
    ],
    [
      'Port quantity',
      (payload: BfnReusableModulePayloadV1) => (mutable(payload.ports[0]!).quantityType = 'amount'),
    ],
    [
      'Port unit',
      (payload: BfnReusableModulePayloadV1) => (mutable(payload.ports[0]!).unit = 'uM'),
    ],
    [
      'Entity mode',
      (payload: BfnReusableModulePayloadV1) => {
        const entity = payload.entities[0]!;
        mutableArray(payload.entities)[0] = {
          key: entity.key,
          mode: 'slot',
          sourceEntityId: 'same-scientific-input',
          displayName: entity.displayName,
          description: entity.mode === 'canonical' ? null : entity.description,
          requirements: [
            {
              portKey: payload.ports[0]!.key,
              direction: payload.ports[0]!.direction,
              quantityType: payload.ports[0]!.quantityType,
              unit: payload.ports[0]!.unit,
            },
          ],
        };
      },
    ],
    [
      'Context',
      (payload: BfnReusableModulePayloadV1) =>
        (mutable(payload.contexts[0]!).oxygenation = 'microaerobic'),
    ],
    [
      'ValidityDomain',
      (payload: BfnReusableModulePayloadV1) =>
        (mutable(payload.validityDomains[0]!.inputRanges[0]!).maximum = 200),
    ],
    [
      'module Evidence',
      (payload: BfnReusableModulePayloadV1) =>
        (mutable(payload).moduleEvidenceGrade = 'independent_assumption'),
    ],
    [
      'model uncertainty',
      (payload: BfnReusableModulePayloadV1) =>
        (mutable(staticModel(payload)).uncertaintyMethod = 'bootstrap'),
    ],
    [
      'Provenance',
      (payload: BfnReusableModulePayloadV1) =>
        (mutable(payload.provenance[0]!).reference = 'doi:10.0000/changed'),
    ],
    [
      'Implementation',
      (payload: BfnReusableModulePayloadV1) =>
        (mutable(payload.implementations[0]!).promoter = 'P_CHANGED'),
    ],
  ])('changes when %s changes', (_label, mutatePayload) => {
    const original = captureStaticFixture();
    const changed = structuredClone(original);
    mutatePayload(changed);
    expect(createBfnModuleTemplatePayloadSignature(changed)).not.toBe(
      createBfnModuleTemplatePayloadSignature(original),
    );
  });

  it('changes for first-order tau and initial-state changes', () => {
    const original = captureFirstOrderFixture();
    const changedTau = structuredClone(original) as unknown as DeepMutable<typeof original>;
    const changedState = structuredClone(original) as unknown as DeepMutable<typeof original>;
    if (changedTau.moduleClass !== 'first_order' || changedState.moduleClass !== 'first_order') {
      throw new Error('Expected first-order fixtures.');
    }
    changedTau.models.dynamic.tau.value = 3;
    changedState.models.dynamic.initialState = 0.4;

    expect(createBfnModuleTemplatePayloadSignature(asPayload(changedTau))).not.toBe(
      createBfnModuleTemplatePayloadSignature(original),
    );
    expect(createBfnModuleTemplatePayloadSignature(asPayload(changedState))).not.toBe(
      createBfnModuleTemplatePayloadSignature(original),
    );
  });

  it('changes for accumulator C0 and canonical identity changes', () => {
    const original = captureAccumulatorFixture();
    const changedC0 = structuredClone(original) as unknown as DeepMutable<typeof original>;
    const changedIdentity = structuredClone(original) as unknown as DeepMutable<typeof original>;
    if (
      changedC0.moduleClass !== 'accumulator' ||
      changedIdentity.moduleClass !== 'accumulator' ||
      changedIdentity.entities[0]?.mode !== 'canonical'
    ) {
      throw new Error('Expected accumulator canonical fixture.');
    }
    changedC0.models.dynamic.initialState = 8;
    changedIdentity.entities[0].entityId = `${changedIdentity.entities[0].entityId}.changed`;

    expect(createBfnModuleTemplatePayloadSignature(asPayload(changedC0))).not.toBe(
      createBfnModuleTemplatePayloadSignature(original),
    );
    expect(createBfnModuleTemplatePayloadSignature(asPayload(changedIdentity))).not.toBe(
      createBfnModuleTemplatePayloadSignature(original),
    );
  });

  it('changes when a slot scientific identity requirement changes', () => {
    const project = createStaticTemplateProject('source.module.signature-slot');
    const module = project.network.modules[0]!;
    const entityId = module.outputPorts[0]!.entity;
    project.network.outputMonitors.push({
      kind: 'output_monitor',
      id: 'slot.signature.monitor',
      labelKey: 'bfn.fixture.monitor',
      inputPort: {
        id: 'slot.signature.monitor.port',
        entity: entityId,
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'input',
      },
      position: { x: 1, y: 1 },
    });
    const capture = captureReusableModuleTemplatePayload(project, module.id, {
      entityPolicies: { [module.inputPorts[0]!.entity]: 'embedded' },
    });
    if (!capture.ok) throw new Error('Expected slot signature fixture.');
    const changed = structuredClone(capture.payload) as unknown as DeepMutable<
      typeof capture.payload
    >;
    const slot = changed.entities.find((entity) => entity.mode === 'slot');
    if (!slot || slot.mode !== 'slot') throw new Error('Expected slot Entity.');
    slot.sourceEntityId = `${slot.sourceEntityId}.changed`;

    expect(createBfnModuleTemplatePayloadSignature(asPayload(changed))).not.toBe(
      createBfnModuleTemplatePayloadSignature(capture.payload),
    );
  });
});

function hillResponse(payload: BfnReusableModulePayloadV1) {
  const model = staticModel(payload);
  if (model.response.family !== 'hill_activation' && model.response.family !== 'hill_repression') {
    throw new Error('Expected Hill response fixture.');
  }
  return model.response;
}

function staticModel(payload: BfnReusableModulePayloadV1) {
  if (payload.moduleClass === 'accumulator') throw new Error('Expected static model fixture.');
  return payload.models.static;
}

function mutable(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function mutableArray<T>(value: readonly T[]): T[] {
  return value as T[];
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, child]) => [key, reverseObjectKeys(child)]),
  );
}

function renameLocalKeys(payload: BfnReusableModulePayloadV1): BfnReusableModulePayloadV1 {
  const renamed = structuredClone(payload) as unknown as DeepMutable<BfnReusableModulePayloadV1>;
  if (renamed.moduleClass === 'accumulator') throw new Error('Expected static fixture.');
  const portMap = new Map(renamed.ports.map((port, index) => [port.key, `p-${index}`]));
  const entityMap = new Map(renamed.entities.map((entity, index) => [entity.key, `e-${index}`]));
  const contextMap = new Map(renamed.contexts.map((context, index) => [context.key, `c-${index}`]));
  const domainMap = new Map(
    renamed.validityDomains.map((domain, index) => [domain.key, `d-${index}`]),
  );
  const provenanceMap = new Map(
    renamed.provenance.map((record, index) => [record.key, `r-${index}`]),
  );
  const implementationMap = new Map(
    renamed.implementations.map((implementation, index) => [implementation.key, `i-${index}`]),
  );
  for (const port of renamed.ports) {
    port.entityKey = entityMap.get(port.entityKey)!;
    port.key = portMap.get(port.key)!;
  }
  for (const entity of renamed.entities) {
    entity.key = entityMap.get(entity.key)!;
    if (entity.mode === 'slot') {
      for (const requirement of entity.requirements) {
        requirement.portKey = portMap.get(requirement.portKey)!;
      }
    }
  }
  for (const context of renamed.contexts) context.key = contextMap.get(context.key)!;
  for (const domain of renamed.validityDomains) {
    domain.key = domainMap.get(domain.key)!;
    domain.contextKey = domain.contextKey === null ? null : contextMap.get(domain.contextKey)!;
    for (const range of domain.inputRanges) range.portKey = portMap.get(range.portKey)!;
  }
  for (const record of renamed.provenance) record.key = provenanceMap.get(record.key)!;
  for (const implementation of renamed.implementations) {
    implementation.key = implementationMap.get(implementation.key)!;
    implementation.provenanceKeys = implementation.provenanceKeys.map((key) =>
      provenanceMap.get(key)!,
    );
  }
  renamed.implementationKeys = renamed.implementationKeys.map((key) => implementationMap.get(key)!);
  const model = renamed.models.static;
  model.key = 'm-static';
  model.contextKey = model.contextKey === null ? null : contextMap.get(model.contextKey)!;
  model.validityDomainKey = domainMap.get(model.validityDomainKey)!;
  model.provenanceKeys = model.provenanceKeys.map((key) => provenanceMap.get(key)!);
  if (model.response.family === 'independent_inputs') {
    for (const term of model.response.terms) {
      term.inputPortKey = portMap.get(term.inputPortKey)!;
    }
  } else {
    model.response.inputPortKey = portMap.get(model.response.inputPortKey)!;
  }
  renamed.activeModels.static = model.key;
  return renamed as unknown as BfnReusableModulePayloadV1;
}

function asPayload(value: unknown): BfnReusableModulePayloadV1 {
  return value as BfnReusableModulePayloadV1;
}

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;
